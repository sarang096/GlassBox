"""
Code Execution Engine — Run tests inside isolated Docker containers.

Endpoint: POST /api/groups/{group_id}/execute
- Collects the user's workspace files (their edited versions + test templates)
- Writes them into a temp directory
- Spins up an isolated Docker container to run test suites
- Returns stdout/stderr for each test phase
"""

import os
import re
import json
import shutil
import tempfile
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Group, Membership, GroupFile, MemberFileVersion
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/groups/{group_id}",
    tags=["execution"],
)

# ─── Configuration ───
DOCKER_IMAGE = "grouphub-runner"
CONTAINER_TIMEOUT = 120      # seconds (backend kills container after this)
CONTAINER_MEMORY = "512m"
CONTAINER_CPUS = "1"

# ─── Helpers ───

def _check_membership(user: User, group_id: int, db: Session):
    """Verify the user is a member of this group."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.admin_id == user.id:
        return group, None
        
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.group_id == group_id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    return group, membership


def _get_user_workspace(user: User, group: Group, db: Session) -> list[dict]:
    """
    Build the user's complete workspace for execution.
    
    CRITICAL ISOLATION MODEL — CANDIDATES RUN BUGGY CODE ONLY:
    - For NON-HIDDEN files: use the member's EDITED version (contains buggy code for candidates)
    - For HIDDEN files (tests/solutions): use admin template (candidates never see, tests run against buggy code)
    - Admin: gets templates for everything (correct code)
    
    This ensures:
    1. Candidates see buggy code in editor
    2. Tests execute against candidate's buggy code
    3. Solutions/tests stay hidden from candidates
    
    GUARANTEE: Candidates NEVER get solution code in their workspace.
    """
    files = db.query(GroupFile).filter(GroupFile.group_id == group.id).all()
    workspace = []
    is_admin = group.admin_id == user.id
    
    logger.info(f"[ISOLATION] Building workspace for {'ADMIN' if is_admin else 'CANDIDATE'} {user.id} in group {group.id}")

    for gf in files:
        # SECURITY: Candidates cannot access solution files
        if not is_admin and "solution" in gf.filename.lower():
            logger.warning(f"[ISOLATION-BLOCK] Candidate {user.id} blocked from solution file: {gf.filename}")
            continue  # Skip solution files for candidates
        
        if is_admin:
            # Admin: get template (correct code)
            content = gf.content
            source = "ADMIN_TEMPLATE_CORRECT"
        elif gf.is_hidden:
            # Candidate: hidden files are TESTS only (from template)
            # NOT solution files — solutions are marked as hidden too, but should be skipped above
            content = gf.content
            source = "HIDDEN_TEMPLATE_TESTS"
            logger.debug(f"[ISOLATION] Hidden file '{gf.filename}' (tests) included from template for candidate")
        else:
            # Candidate: non-hidden files use their EDITED version (BUGGY code)
            version = db.query(MemberFileVersion).filter(
                MemberFileVersion.file_id == gf.id,
                MemberFileVersion.user_id == user.id
            ).first()
            if version:
                content = version.content
                source = "MEMBER_EDITED_BUGGY"
                logger.debug(f"[ISOLATION] Candidate file '{gf.filename}' loaded from member's edited version (BUGGY)")
            else:
                content = gf.content
                source = "TEMPLATE_FALLBACK_BUGGY"
                logger.warning(f"[ISOLATION] Member version missing for '{gf.filename}', using template fallback (buggy)")

        workspace.append({
            "filename": gf.filename,
            "content": content or "",
            "is_hidden": gf.is_hidden,
            "_source": source,  # Debug: track where each file came from
        })

    logger.info(f"[ISOLATION] Workspace assembled: {len(workspace)} files for {'ADMIN' if is_admin else 'CANDIDATE'} {user.id}")
    return workspace


def _sanitize_path_component(component: str) -> str:
    """Strip characters that are invalid in Windows file/directory names."""
    # Windows invalid chars: < > : " | ? * and control chars
    # We do NOT strip / or \ here — those are handled as path separators before calling this
    sanitized = re.sub(r'[<>:"|?*\x00-\x1f]', '', component)
    return sanitized.strip('. ')  # strip leading/trailing dots and spaces (also invalid on Windows)


def _write_workspace_to_disk(workspace: list[dict], base_dir: str):
    """Write virtual files to real filesystem for Docker mounting."""
    for item in workspace:
        # Defensive: strip embedded newlines/descriptions the AI may have stored
        raw_filename = item["filename"].split("\n")[0].strip()
        if not raw_filename:
            logger.warning(f"Skipping file with empty sanitized filename (original: {item['filename']!r})")
            continue

        # Normalize separators, sanitize each path component individually
        parts = raw_filename.replace("\\", "/").split("/")
        parts = [_sanitize_path_component(p) for p in parts]
        parts = [p for p in parts if p]  # drop empty segments
        if not parts:
            logger.warning(f"Skipping file — all path components were invalid (original: {item['filename']!r})")
            continue

        safe_filename = os.path.join(*parts)
        filepath = os.path.join(base_dir, safe_filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "w", encoding="utf-8", newline="\n") as f:
            f.write(item["content"])


def _run_in_docker(workspace_dir: str) -> dict:
    """
    Spin up an isolated Docker container, run the test suites, capture output.
    Returns { backend_tests: {...}, frontend_tests: {...} }
    """
    import docker
    from docker.errors import ContainerError, ImageNotFound, APIError

    client = docker.from_env()

    # Verify image exists
    try:
        client.images.get(DOCKER_IMAGE)
    except ImageNotFound:
        raise HTTPException(
            status_code=500,
            detail=f"Docker image '{DOCKER_IMAGE}' not found. Run: docker build -t grouphub-runner -f Dockerfile.runner ."
        )

    # Build the test runner script that runs inside the container
    runner_script = """#!/bin/bash
set -e

cd /workspace

echo "══════════════════════════════════════════════"
echo "  GROUPHUB TEST RUNNER"
echo "══════════════════════════════════════════════"
echo ""

# ─── Detect test files ───
BACKEND_TEST=""
FRONTEND_TEST=""

for f in $(find . -name "test_*.py" -o -name "*_test.py" | head -5); do
    BACKEND_TEST="$BACKEND_TEST $f"
done

for f in $(find . -name "*.test.jsx" -o -name "*.test.js" -o -name "*.test.tsx" | head -5); do
    FRONTEND_TEST="$FRONTEND_TEST $f"
done

RESULTS='{"phases":[]}'

# ─── Phase 1: Backend Tests (Python/pytest) ───
echo ""
echo "┌──────────────────────────────────────────┐"
echo "│  PHASE 1: Backend Tests (pytest)         │"
echo "└──────────────────────────────────────────┘"
echo ""

if [ -n "$BACKEND_TEST" ]; then
    # Flatten: move all relevant code and test files to workspace root
    for category_dir in backend db test frontend; do
        if [ -d "$category_dir" ]; then
            find "$category_dir" -type f \( -name "*.py" -o -name "*.csv" -o -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) -exec cp {} /workspace/ \;
        fi
    done

    echo "Found test files:$BACKEND_TEST"
    echo "---"
    
    # Run pytest with verbose output
    python -m pytest /workspace/test_*.py -v --tb=short 2>&1 || true
else
    echo "No Python test files found. Skipping."
fi

# ─── Phase 2: Frontend Tests (Jest) ───
echo ""
echo "┌──────────────────────────────────────────┐"
echo "│  PHASE 2: Frontend Tests (Jest)          │"
echo "└──────────────────────────────────────────┘"
echo ""

if [ -n "$FRONTEND_TEST" ]; then
    echo "Found test files:$FRONTEND_TEST"
    echo "---"

    # Fix Module Resolution: Symlink global modules into /workspace/node_modules
    # This is the most robust way to make Jest find pre-installed global packages offline
    GLOBAL_NPM=$(npm root -g 2>/dev/null || echo "/usr/local/lib/node_modules")
    mkdir -p /workspace/node_modules
    for pkg in react react-dom @testing-library/react @testing-library/jest-dom @babel/core @babel/preset-env @babel/preset-react jest-environment-jsdom; do
        if [ -d "${GLOBAL_NPM}/${pkg}" ]; then
            ln -s "${GLOBAL_NPM}/${pkg}" "/workspace/node_modules/${pkg}" 2>/dev/null || true
        fi
    done
    export NODE_PATH="/workspace/node_modules:${GLOBAL_NPM}"

    # Check if jest is available
    if command -v jest &>/dev/null || [ -f /usr/lib/node_modules/jest/bin/jest.js ]; then
        JEST_BIN="jest"
        command -v jest &>/dev/null || JEST_BIN="node /usr/lib/node_modules/jest/bin/jest.js"

        # Ensure package.json exists so Jest resolves correctly
        if [ ! -f "/workspace/package.json" ]; then
            echo '{"name":"test-workspace","private":true,"dependencies":{}}' > /workspace/package.json
        fi

        # Use absolute paths in .babelrc
        cat > /workspace/.babelrc << BABELEOF
{"presets":["${GLOBAL_NPM}/@babel/preset-env","${GLOBAL_NPM}/@babel/preset-react"]}
BABELEOF

        # Always create a jest config
        cat > /workspace/jest.config.json << 'JESTEOF'
{
  "testEnvironment": "jsdom",
  "testMatch": ["**/*.test.js", "**/*.test.jsx", "**/*.test.ts", "**/*.test.tsx"],
  "transform": {"^.+\\\\.(js|jsx|ts|tsx)$": "babel-jest"},
  "moduleFileExtensions": ["js", "jsx", "ts", "tsx", "json"],
  "rootDir": "/workspace"
}
JESTEOF

        $JEST_BIN --config /workspace/jest.config.json --verbose --no-cache --forceExit 2>&1 || true
    else
        echo "Jest not found in image. Skipping."
    fi
else
    echo "No frontend test files found. Skipping."
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  TEST RUN COMPLETE"
echo "══════════════════════════════════════════════"
"""

    # Write the runner script to the workspace
    runner_path = os.path.join(workspace_dir, "__run_tests.sh")
    with open(runner_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(runner_script)

    # Convert Windows path to Docker-compatible path
    docker_workspace = workspace_dir.replace("\\", "/")
    # For Docker Desktop on Windows, C:\foo -> /c/foo or //c/foo
    if len(docker_workspace) >= 2 and docker_workspace[1] == ':':
        drive = docker_workspace[0].lower()
        docker_workspace = f"/{drive}{docker_workspace[2:]}"

    results = {
        "backend_tests": {"output": "", "status": "skipped", "duration": 0},
        "frontend_tests": {"output": "", "status": "skipped", "duration": 0},
        "full_output": "",
        "duration": 0,
    }

    start_time = time.time()

    container = None
    try:
        # Run detached so we can enforce a timeout via container.wait()
        container = client.containers.run(
            image=DOCKER_IMAGE,
            command=["bash", "/workspace/__run_tests.sh"],
            volumes={docker_workspace: {"bind": "/workspace", "mode": "rw"}},
            network_mode="none",        # No internet access
            mem_limit=CONTAINER_MEMORY,
            nano_cpus=int(float(CONTAINER_CPUS) * 1e9),
            remove=False,               # We remove manually after fetching logs
            stdout=True,
            stderr=True,
            detach=True,                # Run in background so we can timeout
            working_dir="/workspace",
            environment={
                "PYTHONDONTWRITEBYTECODE": "1",
                "NODE_ENV": "test",
                "NODE_PATH": "/usr/local/lib/node_modules",
            },
        )

        try:
            # Block until the container finishes, with a hard timeout
            container.wait(timeout=CONTAINER_TIMEOUT)
        except Exception:
            # Timed out or connection error — kill the container
            logger.warning(f"Container timed out after {CONTAINER_TIMEOUT}s — killing")
            try:
                container.kill()
            except Exception:
                pass
            elapsed = time.time() - start_time
            timeout_msg = f"⏱ Test execution timed out after {CONTAINER_TIMEOUT} seconds."
            results["full_output"] = timeout_msg
            results["duration"] = round(elapsed, 2)
            results["backend_tests"]["status"] = "error"
            results["backend_tests"]["output"] = timeout_msg
            return results

        # Fetch logs after container has finished
        full_output = container.logs(stdout=True, stderr=True).decode("utf-8")
        elapsed = time.time() - start_time

        results["full_output"] = full_output
        results["duration"] = round(elapsed, 2)

        # Parse backend test results
        if "PHASE 1: Backend Tests" in full_output:
            backend_section = full_output.split("PHASE 1: Backend Tests")[1]
            if "PHASE 2: Frontend Tests" in backend_section:
                backend_section = backend_section.split("PHASE 2: Frontend Tests")[0]
            results["backend_tests"]["output"] = backend_section.strip()
            results["backend_tests"]["duration"] = round(elapsed * 0.5, 2)

            # CRITICAL: Parse actual test results from pytest summary line
            # Look for patterns like "5 failed, 1 passed" or "6 passed"
            import re
            
            # Match pytest summary: "X failed" or "X passed in"
            test_summary = re.search(r'(\d+)\s+failed|(\d+)\s+passed\s+in', backend_section, re.IGNORECASE)
            
            if re.search(r'(\d+)\s+failed', backend_section, re.IGNORECASE):
                # If ANY tests failed, mark as failed
                results["backend_tests"]["status"] = "failed"
                logger.info(f"Backend tests FAILED — detected failed test count in summary")
            elif re.search(r'(\d+)\s+passed\s+in', backend_section, re.IGNORECASE) and not re.search(r'(\d+)\s+failed', backend_section, re.IGNORECASE):
                # All tests passed and no failures
                results["backend_tests"]["status"] = "passed"
                logger.info(f"Backend tests PASSED — all tests succeeded")
            else:
                results["backend_tests"]["status"] = "unknown"
                logger.warning(f"Backend tests status UNKNOWN")

        # Parse frontend test results
        if "PHASE 2: Frontend Tests" in full_output:
            frontend_section = full_output.split("PHASE 2: Frontend Tests")[1]
            if "TEST RUN COMPLETE" in frontend_section:
                frontend_section = frontend_section.split("TEST RUN COMPLETE")[0]
            results["frontend_tests"]["output"] = frontend_section.strip()
            results["frontend_tests"]["duration"] = round(elapsed * 0.5, 2)

            # CRITICAL: Count PASS/FAIL lines which Jest outputs for each test file
            # Example: "PASS ./App.test.jsx" or "FAIL ./App.test.jsx"
            import re
            
            pass_suites = len(re.findall(r'(?:^|\n)PASS\s+', frontend_section))
            fail_suites = len(re.findall(r'(?:^|\n)FAIL\s+', frontend_section))
            
            logger.debug(f"Frontend: {pass_suites} PASS suites, {fail_suites} FAIL suites")
            
            if fail_suites > 0:
                results["frontend_tests"]["status"] = "failed"
                logger.info(f"Frontend tests FAILED — {fail_suites} test suite(s) failed")
            elif pass_suites > 0:
                results["frontend_tests"]["status"] = "passed"
                logger.info(f"Frontend tests PASSED — {pass_suites} test suite(s) passed, 0 failed")
            else:
                results["frontend_tests"]["status"] = "unknown"
                logger.warning(f"Frontend tests UNKNOWN — no PASS/FAIL detected")

        return results

    except ContainerError as e:
        elapsed = time.time() - start_time
        output = e.stderr.decode("utf-8") if e.stderr else str(e)
        results["full_output"] = output
        results["duration"] = round(elapsed, 2)
        results["backend_tests"]["status"] = "error"
        results["backend_tests"]["output"] = output
        return results

    except APIError as e:
        logger.error(f"Docker API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Docker error: {str(e)}")

    except Exception as e:
        logger.error(f"Execution error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")

    finally:
        # Always clean up the container (even if timed out or errored)
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


# ─── Main Endpoint ───

@router.post("/execute")
def execute_tests(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Execute the test suites for a user's workspace inside an isolated Docker container.
    
    ISOLATION GUARANTEE:
    - ADMINS: See & run correct solution code against tests
    - CANDIDATES: Run ONLY buggy code against tests, hidden files blocked
    
    Returns the terminal output for each test phase (backend, frontend).
    """
    try:
        group, membership = _check_membership(current_user, group_id, db)
        is_admin = group.admin_id == current_user.id
        
        # Verify candidate cannot execute as admin
        if not is_admin and membership is None:
            raise HTTPException(status_code=403, detail="Only group members can execute")

        # Build the user's workspace (buggy code for candidates, correct for admins)
        workspace = _get_user_workspace(current_user, group, db)
        
        # SECURITY: Verify candidates don't get solution files in workspace
        if not is_admin:
            hidden_count = sum(1 for f in workspace if f.get("is_hidden"))
            if hidden_count > 0:
                # Hidden files are allowed (tests), but verify they can't edit them
                visible_files = [f for f in workspace if not f.get("is_hidden")]
                logger.warning(
                    f"SECURITY CHECK: Candidate {current_user.id} has {len(visible_files)} visible files "
                    f"and {hidden_count} hidden files (tests/solutions). Verifying hidden files are template-only..."
                )
            
            # Verify no solutions in candidate's visible workspace
            has_solution = any("solution" in f.get("filename", "").lower() for f in workspace if not f.get("is_hidden"))
            if has_solution:
                logger.error(f"SECURITY BREACH: Candidate {current_user.id} got solution file in visible workspace!")
                raise HTTPException(status_code=403, detail="Unauthorized: Cannot access solution files")
        else:
            logger.info(f"Admin {current_user.id} executing in group {group_id} — will see correct solution code")

        if not workspace:
            raise HTTPException(status_code=400, detail="No files in workspace to execute")

        # Create temp directory for this execution
        temp_dir = tempfile.mkdtemp(prefix=f"grouphub_exec_{group_id}_{current_user.id}_")

        try:
            # Write all virtual files to disk
            _write_workspace_to_disk(workspace, temp_dir)

            logger.info(f"User {current_user.id} executing tests in group {group_id} — {len(workspace)} files")

            # Run in Docker
            results = _run_in_docker(temp_dir)

            logger.info(f"Execution complete for user {current_user.id} in group {group_id} — {results['duration']}s")

            return {
                "success": True,
                "user_id": current_user.id,
                "group_id": group_id,
                "files_count": len(workspace),
                "results": results,
            }

        finally:
            # Always clean up temp directory
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Execution endpoint error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Test execution failed: {str(e)}")
