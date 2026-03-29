"""
Code Execution Engine — Run tests inside isolated Docker containers.

Endpoint: POST /api/groups/{group_id}/execute
- Collects the user's workspace files (their edited versions + test templates)
- Writes them into a temp directory
- Spins up an isolated Docker container to run test suites
- Returns stdout/stderr for each test phase
"""

import os
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
CONTAINER_TIMEOUT = 60       # seconds
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
    Build the user's complete workspace.
    - For non-hidden files: use the member's edited version (or template fallback)
    - For hidden files (tests): always use the admin's template
    """
    files = db.query(GroupFile).filter(GroupFile.group_id == group.id).all()
    workspace = []
    is_admin = group.admin_id == user.id

    for gf in files:
        if is_admin or gf.is_hidden:
            # Admin always gets template; hidden test files use template for everyone
            content = gf.content
        else:
            # Client gets their own version
            version = db.query(MemberFileVersion).filter(
                MemberFileVersion.file_id == gf.id,
                MemberFileVersion.user_id == user.id
            ).first()
            content = version.content if version else gf.content

        workspace.append({
            "filename": gf.filename,
            "content": content or "",
            "is_hidden": gf.is_hidden,
        })

    return workspace


def _write_workspace_to_disk(workspace: list[dict], base_dir: str):
    """Write virtual files to real filesystem for Docker mounting."""
    for item in workspace:
        filepath = os.path.join(base_dir, item["filename"])
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
    # Flatten: move all .py and .csv files to workspace root if they're inside category dirs
    for category_dir in backend db test; do
        if [ -d "$category_dir" ]; then
            find "$category_dir" -type f \\( -name "*.py" -o -name "*.csv" \\) -exec cp {} /workspace/ \\;
        fi
    done

    echo "Found test files:$BACKEND_TEST"
    echo "---"
    
    # Run pytest with verbose output
    python -m pytest /workspace/test_*.py -v --tb=short 2>&1 || true
else
    echo "No Python test files found. Skipping."
fi

echo ""
echo "┌──────────────────────────────────────────┐"
echo "│  PHASE 2: Frontend Tests (Jest)          │"
echo "└──────────────────────────────────────────┘"
echo ""

if [ -n "$FRONTEND_TEST" ]; then
    # Flatten frontend files too
    if [ -d "frontend" ]; then
        find frontend -type f \\( -name "*.jsx" -o -name "*.js" -o -name "*.tsx" -o -name "*.ts" \\) -exec cp {} /workspace/ \\;
    fi

    echo "Found test files:$FRONTEND_TEST"
    echo "---"
    
    # Initialize npm and install testing deps
    cd /workspace
    npm init -y --silent 2>/dev/null
    npm install --save-dev --silent @testing-library/react @testing-library/jest-dom jest babel-jest @babel/preset-env @babel/preset-react react react-dom 2>&1 | tail -3
    
    # Create babel config for JSX
    echo '{"presets":["@babel/preset-env","@babel/preset-react"]}' > .babelrc
    
    # Run Jest
    npx jest --verbose --no-cache --forceExit 2>&1 || true
else
    echo "No frontend test files (*.test.jsx / *.test.js) found. Skipping."
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

    try:
        container = client.containers.run(
            image=DOCKER_IMAGE,
            command=["bash", "/workspace/__run_tests.sh"],
            volumes={docker_workspace: {"bind": "/workspace", "mode": "rw"}},
            network_mode="none",        # No internet access
            mem_limit=CONTAINER_MEMORY,
            nano_cpus=int(float(CONTAINER_CPUS) * 1e9),
            remove=True,                # Auto-remove when done
            stdout=True,
            stderr=True,
            detach=False,               # Wait for completion
            working_dir="/workspace",
            environment={
                "PYTHONDONTWRITEBYTECODE": "1",
                "NODE_ENV": "test",
            },
        )

        # container.run with detach=False returns bytes
        full_output = container.decode("utf-8") if isinstance(container, bytes) else str(container)
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

            if "passed" in backend_section.lower():
                results["backend_tests"]["status"] = "passed"
            elif "failed" in backend_section.lower() or "error" in backend_section.lower():
                results["backend_tests"]["status"] = "failed"
            else:
                results["backend_tests"]["status"] = "unknown"

        # Parse frontend test results
        if "PHASE 2: Frontend Tests" in full_output:
            frontend_section = full_output.split("PHASE 2: Frontend Tests")[1]
            if "TEST RUN COMPLETE" in frontend_section:
                frontend_section = frontend_section.split("TEST RUN COMPLETE")[0]
            results["frontend_tests"]["output"] = frontend_section.strip()
            results["frontend_tests"]["duration"] = round(elapsed * 0.5, 2)

            if "passed" in frontend_section.lower() or "tests passed" in frontend_section.lower():
                results["frontend_tests"]["status"] = "passed"
            elif "failed" in frontend_section.lower() or "error" in frontend_section.lower():
                results["frontend_tests"]["status"] = "failed"
            else:
                results["frontend_tests"]["status"] = "unknown"

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


# ─── Main Endpoint ───

@router.post("/execute")
def execute_tests(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Execute the test suites for a user's workspace inside an isolated Docker container.
    
    Returns the terminal output for each test phase (backend, frontend)
    so the client can see their results.
    """
    try:
        group, membership = _check_membership(current_user, group_id, db)

        # Build the user's workspace
        workspace = _get_user_workspace(current_user, group, db)

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
