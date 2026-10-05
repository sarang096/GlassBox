"""
RAG routes — vector-store endpoints backing the AI tutor.

GroupHub has exactly ONE AI tutor: the n8n workflow at POST /webhook/chat
(see ai_Eval.json). That workflow owns the conversation — injection guard,
session memory, the Socratic prompt, and the deferred scoring agent.

FastAPI deliberately does not talk to a chat model. It owns the vector store
and serves retrieval to n8n, so there is a single place where tutor behaviour
is defined and a single place where student scores originate.

Endpoints:
  POST /api/groups/{group_id}/rag/reindex  — Admin: rebuild the reference index
  POST /api/rag/retrieve                   — n8n: retrieve relevant chunks
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models import User, Group, Membership, GroupFile
from schemas import RagRetrieveRequest, RagRetrieveResponse, RagChunk
from auth import get_current_user
from config import ADMIN_SECRET, RAG_TOP_K
import rag

logger = logging.getLogger(__name__)

# Admin index management, scoped to a group.
router = APIRouter(prefix="/api/groups/{group_id}/rag", tags=["RAG"])

# Service-to-service retrieval for n8n.
rag_router = APIRouter(prefix="/api/rag", tags=["RAG"])


def _check_membership(user: User, group_id: int, db: Session):
    """Verify user is a member of the group. Returns (group, membership)."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    membership = db.query(Membership).filter(
        Membership.user_id == user.id, Membership.group_id == group_id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    return group, membership


@router.post("/reindex")
def reindex_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin-only: rebuild the group's RAG index from its reference solution files."""
    try:
        group, _ = _check_membership(current_user, group_id, db)
        if group.admin_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only the admin can reindex")

        files = db.query(GroupFile).filter(GroupFile.group_id == group_id).all()
        file_dicts = [
            {"id": f.id, "filename": f.filename, "content": f.content or ""}
            for f in files
        ]
        # Only reference files are indexed; report how many qualified so an
        # admin can tell "no solution files" apart from "indexing failed".
        reference_count = sum(1 for f in file_dicts if rag.is_reference_file(f["filename"]))

        total = rag.reindex_all_files(group_id, file_dicts)
        logger.info(f"Reindex: {total} chunks created for group {group_id} by admin {current_user.id}")
        return {
            "success": True,
            "files_processed": len(file_dicts),
            "reference_files": reference_count,
            "chunks_created": total,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reindex error for group {group_id}: {e}")
        raise HTTPException(status_code=500, detail="Error during reindex")


# ─── RAG Retrieve (service-to-service for n8n) ─────────────────────────

@rag_router.post("/retrieve", response_model=RagRetrieveResponse)
def rag_retrieve(
    data: RagRetrieveRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Service-to-service endpoint for n8n to retrieve relevant code chunks
    via RAG (ChromaDB vector similarity search) instead of sending the
    entire codebase in the tutor prompt.

    Auth: x-admin-key header (same ADMIN_SECRET used by n8n).
    """
    try:
        # 1. Validate API key
        admin_key = request.headers.get("x-admin-key", "")
        if not admin_key or admin_key != ADMIN_SECRET:
            raise HTTPException(status_code=401, detail="Unauthorized")

        question = (data.question or "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Question cannot be empty")

        # 2. Resolve group — accept numeric ID or group_code string
        group = None
        try:
            numeric_id = int(data.group_id)
            group = db.query(Group).filter(Group.id == numeric_id).first()
        except (ValueError, TypeError):
            pass

        if not group:
            group = db.query(Group).filter(
                Group.group_code == str(data.group_id).strip().upper()
            ).first()

        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # 3. Retrieve relevant chunks from ChromaDB
        top_k = data.top_k or RAG_TOP_K
        chunks = rag.query(group.id, question, top_k=top_k)

        # display_name hides the `solution/` path from n8n's prompt builder,
        # which renders `--- {filename} ---` straight into the tutor context.
        result_chunks = [
            RagChunk(filename=c["display_name"], snippet=c["snippet"])
            for c in chunks
        ]

        logger.info(
            f"RAG retrieve: {len(result_chunks)} chunks for group {group.id} "
            f"(code={group.group_code}), question='{question[:50]}...'"
        )

        return RagRetrieveResponse(chunks=result_chunks, chunk_count=len(result_chunks))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RAG retrieve error: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving context")
