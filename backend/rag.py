"""
RAG (Retrieval-Augmented Generation) engine for GroupHub.

The vector store holds ONE thing: the instructor's reference solution files
(category "solution" from the n8n generator). It is deliberately NOT a mirror
of the working codebase.

Why: students are given deliberately-bugged code and debug it in their own
MemberFileVersion forks. The tutor needs to know what *correct* looks like in
order to guide them — but the index must not drift as the buggy code is
edited, or the tutor ends up grounded in the student's own mistakes.

So:
  - Only files matching `is_reference_file()` are ever embedded. Everything
    else (student-facing code, DB fixtures, tests) is skipped at the choke
    point in `index_file`, so no call site can leak them into the index.
  - Retrieved snippets are answer material. Never send them to a browser —
    cite `display_name()` instead.
"""

import ast
import logging
import os
import re
from typing import Optional

from google import genai
import chromadb

from config import (
    GEMINI_KEY, CHROMA_PERSIST_DIR, RAG_CHUNK_SIZE, RAG_TOP_K,
    GEMINI_EMBED_MODEL,
)

logger = logging.getLogger(__name__)

# Embedding model. Batch cap is 100 contents per request.
EMBED_MODEL = GEMINI_EMBED_MODEL
EMBED_BATCH = 100

# n8n's "solution" category lands as files prefixed `solution/`
# (file_routes builds the name as f"{category}/{raw_filename}").
REFERENCE_PREFIX = "solution/"

# ─── Singleton clients ───────────────────────────────────────────────

_gemini_client: Optional[genai.Client] = None
_chroma_client: Optional[chromadb.ClientAPI] = None


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        if not GEMINI_KEY:
            raise RuntimeError("GEMINI_KEY is not set in .env")
        _gemini_client = genai.Client(api_key=GEMINI_KEY)
    return _gemini_client


def _get_chroma_client() -> chromadb.ClientAPI:
    global _chroma_client
    if _chroma_client is None:
        os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    return _chroma_client


def _collection_name(group_id: int) -> str:
    """Each group gets its own ChromaDB collection."""
    return f"group_{group_id}"


# ─── What counts as answer material ──────────────────────────────────

def is_reference_file(filename: str) -> bool:
    """
    True only for the instructor's reference solution files.

    Single source of truth for what may enter the vector store. Student-facing
    code, DB fixtures and test files all return False.
    """
    return (filename or "").lower().startswith(REFERENCE_PREFIX)


def display_name(filename: str) -> str:
    """
    Map a reference file back to the student-facing file it answers, so the UI
    can cite `backend/app.py` without revealing that a solution file exists.

        solution/backend/solution_app.py  ->  backend/app.py
    """
    name = filename or ""
    if is_reference_file(name):
        name = name[len(REFERENCE_PREFIX):]
    head, _, base = name.rpartition("/")
    if base.lower().startswith("solution_"):
        base = base[len("solution_"):]
    return f"{head}/{base}" if head else base


# ─── Code-aware chunking ─────────────────────────────────────────────
#
# A fixed character window is wrong for code: it cuts mid-token, so a chunk can
# begin `f i['id'] == id), None)` or strand a `def` from its body. Those
# fragments embed as near-noise and retrieve badly.
#
# Instead: split on structure (top-level defs/classes for Python, brace-depth-0
# blank lines otherwise), then pack whole units up to the size budget. A line is
# the smallest thing we will ever cut on, so a chunk is always parseable-ish.

_JS_SYMBOL = re.compile(
    r"^\s*(?:export\s+(?:default\s+)?)?"
    r"(?:async\s+)?(?:function\s+(\w+)"
    r"|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function))"
)


def _python_units(text: str) -> Optional[list[tuple[str, Optional[str]]]]:
    """
    Split Python at top-level def/class boundaries, decorators kept with their
    function. Returns None if the source does not parse, so callers fall back.
    """
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return None

    lines = text.splitlines(keepends=True)
    units: list[tuple[str, Optional[str]]] = []
    cursor = 0  # 0-based index of the first line not yet emitted

    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        start = node.lineno - 1
        for dec in getattr(node, "decorator_list", []):
            start = min(start, dec.lineno - 1)
        end = getattr(node, "end_lineno", node.lineno)  # 1-based inclusive
        if start > cursor:
            # imports / constants sitting between definitions
            units.append(("".join(lines[cursor:start]), None))
        units.append(("".join(lines[start:end]), node.name))
        cursor = end

    if cursor < len(lines):
        units.append(("".join(lines[cursor:]), None))

    return [(t, sym) for t, sym in units if t.strip()]


def _block_units(text: str) -> list[tuple[str, Optional[str]]]:
    """
    Language-agnostic fallback: break at blank lines that sit outside any brace,
    which lands on component/function boundaries for JS/JSX and on paragraph
    boundaries for plain text. Brace counting ignores strings and comments, so
    treat it as a good guess rather than a parse.
    """
    lines = text.splitlines(keepends=True)
    units: list[tuple[str, Optional[str]]] = []
    buf: list[str] = []
    depth = 0

    def flush():
        if any(l.strip() for l in buf):
            body = "".join(buf)
            sym = None
            for line in buf:
                m = _JS_SYMBOL.match(line)
                if m:
                    sym = m.group(1) or m.group(2)
                    break
            units.append((body, sym))

    for line in lines:
        buf.append(line)
        depth += line.count("{") - line.count("}")
        if depth <= 0 and not line.strip():
            flush()
            buf, depth = [], 0
    flush()
    return units


def _split_oversized(text: str, budget: int, overlap_lines: int = 2) -> list[str]:
    """
    Cut a single over-budget unit, never mid-line.

    Prefers the last blank line before the budget runs out, so a big component
    breaks between statements/JSX blocks rather than at whatever line happens
    to cross the limit. Falls back to the hard line boundary when the nearest
    blank line is so far back that it would waste most of the chunk.
    """
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    buf: list[str] = []
    size = 0
    last_blank = -1  # index in buf of the most recent blank line

    for line in lines:
        if buf and size + len(line) > budget:
            cut = last_blank + 1 if last_blank * 2 > len(buf) else len(buf)
            out.append("".join(buf[:cut]))
            carry = buf[max(0, cut - overlap_lines):cut] if overlap_lines else []
            buf = carry + buf[cut:]
            size = sum(len(l) for l in buf)
            last_blank = -1
        if not line.strip():
            last_blank = len(buf)
        buf.append(line)
        size += len(line)

    if any(l.strip() for l in buf):
        out.append("".join(buf))
    return out


def _chunk_code(text: str, filename: str = "") -> list[tuple[str, Optional[str]]]:
    """
    Split source into (chunk_text, symbol) pairs on structural boundaries.

    Small adjacent units are packed together up to RAG_CHUNK_SIZE so a file of
    one-line helpers does not become one chunk per helper; a unit larger than
    the budget is cut on line boundaries.
    """
    if not text or not text.strip():
        return []

    units = None
    if filename.lower().endswith(".py"):
        units = _python_units(text)
    if units is None:
        units = _block_units(text)
    if not units:
        return []

    budget = RAG_CHUNK_SIZE
    MIN_CHUNK = max(120, budget // 8)  # below this, keep accumulating
    chunks: list[tuple[str, Optional[str]]] = []
    buf_text = ""
    buf_syms: list[str] = []

    def flush():
        if buf_text.strip():
            chunks.append((buf_text, ", ".join(buf_syms) if buf_syms else None))

    for body, sym in units:
        if len(body) > budget:
            # Carry any pending small unit (a lone import line, say) into the
            # front of the oversized body instead of emitting it on its own.
            body = buf_text + body
            carried = buf_syms
            buf_text, buf_syms = "", []
            pieces = _split_oversized(body, budget)
            for j, piece in enumerate(pieces):
                syms = (carried + [sym]) if (j == 0 and sym) else ([sym] if sym else carried if j == 0 else [])
                chunks.append((piece, ", ".join(dict.fromkeys(syms)) or None))
            continue
        if buf_text and len(buf_text) + len(body) > budget and len(buf_text) >= MIN_CHUNK:
            flush()
            buf_text, buf_syms = "", []
        buf_text += body
        if sym:
            buf_syms.append(sym)
    flush()

    return chunks


# ─── Embedding helper ────────────────────────────────────────────────

def _embed_texts(texts: list[str], task_type: str) -> list[list[float]]:
    """
    Generate embeddings via Gemini, in batches of EMBED_BATCH.

    `task_type` must be RETRIEVAL_DOCUMENT when indexing and RETRIEVAL_QUERY
    when searching — the model embeds the two asymmetrically.
    """
    client = _get_gemini_client()
    vectors: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        result = client.models.embed_content(
            model=EMBED_MODEL,
            contents=texts[i:i + EMBED_BATCH],
            config={"task_type": task_type},
        )
        vectors.extend(e.values for e in result.embeddings)
    return vectors


# ─── Public API ───────────────────────────────────────────────────────

def index_file(group_id: int, file_id: int, filename: str, content: str) -> int:
    """
    Index a reference solution file into the vector store.
    Non-reference files are skipped. Returns the number of chunks created.
    """
    if not is_reference_file(filename):
        logger.debug(f"RAG: skipping non-reference file {file_id} ({filename})")
        return 0

    try:
        chroma = _get_chroma_client()
        collection = chroma.get_or_create_collection(name=_collection_name(group_id))

        # Remove old chunks for this file first (handles updates)
        _delete_file_chunks(collection, file_id)

        pairs = _chunk_code(content, filename)
        if not pairs:
            logger.info(f"RAG: No content to index for file {file_id} ({filename})")
            return 0

        chunks = [text for text, _ in pairs]

        # Build IDs and metadata
        ids = [f"f{file_id}_c{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "file_id": file_id,
                "filename": filename,
                "chunk_index": i,
                # Which definition(s) this chunk covers — useful when auditing
                # what the tutor was actually grounded in.
                "symbol": sym or "",
            }
            for i, (_, sym) in enumerate(pairs)
        ]

        embeddings = _embed_texts(chunks, "RETRIEVAL_DOCUMENT")

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        logger.info(f"RAG: Indexed {len(chunks)} chunks for file {file_id} ({filename}) in group {group_id}")
        return len(chunks)

    except Exception as e:
        logger.error(f"RAG index_file error for file {file_id}: {e}")
        # Non-fatal — don't break file operations because indexing failed
        return 0


def remove_file(group_id: int, file_id: int) -> None:
    """Remove all indexed chunks for a file from the vector store."""
    try:
        chroma = _get_chroma_client()
        try:
            collection = chroma.get_collection(name=_collection_name(group_id))
        except Exception:
            return  # Collection doesn't exist yet — nothing to remove

        _delete_file_chunks(collection, file_id)
        logger.info(f"RAG: Removed chunks for file {file_id} from group {group_id}")

    except Exception as e:
        logger.error(f"RAG remove_file error for file {file_id}: {e}")


def query(group_id: int, question: str, top_k: int = RAG_TOP_K) -> list[dict]:
    """
    Retrieve the top-K most relevant reference-solution chunks for a question.

    Returns dicts of { filename, display_name, snippet, chunk_index, distance }.
    `snippet` is answer material — never forward it to a student's browser.
    """
    try:
        chroma = _get_chroma_client()
        try:
            collection = chroma.get_collection(name=_collection_name(group_id))
        except Exception:
            return []  # No collection yet — no files indexed

        query_embedding = _embed_texts([question], "RETRIEVAL_QUERY")[0]

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count() or 1),
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"] or not results["documents"][0]:
            return []

        chunks = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            filename = meta.get("filename", "unknown")
            chunks.append({
                "filename": filename,
                "display_name": display_name(filename),
                "snippet": doc,
                "chunk_index": meta.get("chunk_index", 0),
                "symbol": meta.get("symbol", ""),
                "distance": dist,
            })

        return chunks

    except Exception as e:
        logger.error(f"RAG query error for group {group_id}: {e}")
        return []


def reindex_all_files(group_id: int, files: list[dict]) -> int:
    """
    Rebuild a group's index from scratch. `files` is a list of dicts with keys:
    id, filename, content — non-reference files are ignored by `index_file`.

    The collection is dropped first so no stale vectors survive (including
    vectors from an older embedding model, which have a different dimension).
    Returns total chunks indexed.
    """
    chroma = _get_chroma_client()
    try:
        chroma.delete_collection(name=_collection_name(group_id))
    except Exception:
        pass  # Collection didn't exist — nothing to drop

    total = 0
    for f in files:
        total += index_file(group_id, f["id"], f["filename"], f["content"])
    return total


# ─── Internal helpers ─────────────────────────────────────────────────

def _delete_file_chunks(collection, file_id: int) -> None:
    """Delete all chunks belonging to a specific file from a collection."""
    try:
        collection.delete(where={"file_id": file_id})
    except Exception:
        # Fallback: if the collection is empty, delete throws
        pass
