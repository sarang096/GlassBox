from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging
from database import get_db
from models import User, Group, Membership, GroupFile, MemberFileVersion
from schemas import (
    FileCreate, FileUpdate, FileResponse, MemberVersionResponse,
    MemberVersionUpdate, FileWithVersionsResponse,
    AiBulkImport, AiBulkFileItem
)
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/groups/{group_id}/files", tags=["Files"])


# ─── Extension → Language map ───
EXT_LANG_MAP = {
    "py": "python", "js": "javascript", "jsx": "javascript", "ts": "typescript", "tsx": "typescript",
    "java": "java", "c": "c", "cpp": "cpp", "h": "c", "go": "go", "rs": "rust", "rb": "ruby",
    "html": "html", "css": "css", "json": "json", "sql": "sql", "csv": "csv",
    "md": "markdown", "txt": "text", "xml": "xml", "yaml": "yaml", "yml": "yaml",
}

def _detect_language(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return EXT_LANG_MAP.get(ext, "text")


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


def _check_admin(user: User, group: Group):
    if group.admin_id != user.id:
        raise HTTPException(status_code=403, detail="Only the admin can do this")


# ─── Bulk AI Import (called by N8N — no auth required) ───

@router.post("/ai-import", status_code=201)
def ai_bulk_import(group_id: int, data: AiBulkImport, db: Session = Depends(get_db)):
    """
    Bulk-create files from N8N AI generation.
    No JWT auth — N8N calls this directly from Docker.
    """
    try:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        created = []
        for item in data.files:
            category = item.category.lower()
            # Sanitize: strip embedded newlines/descriptions the AI may append
            raw_filename = item.fileName.split("\n")[0].strip()
            filename = f"{category}/{raw_filename}"
            language = _detect_language(raw_filename)
            content = item.code or ""

            # Permission: "read" → readonly, DB is always readonly
            is_readonly = category == "db" or item.permission == "read"

            # Visibility: "hidden" → hidden, test files always hidden
            is_hidden = category in ("test", "testing") or item.visibility == "hidden"

            gf = GroupFile(
                group_id=group.id,
                filename=filename,
                language=language,
                content=content,
                is_hidden=is_hidden,
                is_readonly=is_readonly,
            )
            db.add(gf)
            db.commit()
            db.refresh(gf)

            # Auto-create member versions for non-hidden files
            if not gf.is_hidden:
                memberships = db.query(Membership).filter(
                    Membership.group_id == group.id
                ).all()
                for m in memberships:
                    if m.user_id != group.admin_id:
                        version = MemberFileVersion(
                            file_id=gf.id,
                            user_id=m.user_id,
                            content=gf.content,
                        )
                        db.add(version)
                db.commit()

            created.append({
                "id": gf.id,
                "filename": gf.filename,
                "language": gf.language,
                "is_hidden": gf.is_hidden,
                "is_readonly": gf.is_readonly,
            })

        logger.info(f"AI bulk import: {len(created)} files created in group {group_id}")
        return {"success": True, "files_created": len(created), "files": created}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in AI bulk import: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk import error: {str(e)}")


# ─── File CRUD (Admin) ───

@router.post("", response_model=FileResponse, status_code=201)
def create_file(group_id: int, data: FileCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a file template for group (admin only)"""
    try:
        group, _ = _check_membership(current_user, group_id, db)
        _check_admin(current_user, group)

        # Validate filename
        filename = (data.filename or "").strip()
        if not filename or len(filename) > 255:
            raise HTTPException(status_code=400, detail="Filename is required and must not exceed 255 characters")
        
        # Validate language
        language = (data.language or "text").strip() if data.language else "text"
        valid_langs = ["text", "python", "javascript", "typescript", "json", "html", "css", "sql", "java", "cpp", "c", "ruby", "go", "rust", "csv", "markdown", "xml", "yaml"]
        if language not in valid_langs:
            language = "text"  # Default to text if invalid
        
        # Validate content size (max 10MB)
        content = data.content or ""
        if len(content.encode('utf-8')) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File content too large (max 10MB)")

        gf = GroupFile(
            group_id=group.id,
            filename=filename,
            language=language,
            content=content,
            is_hidden=data.is_hidden or False,
            is_readonly=data.is_readonly or False
        )
        db.add(gf)
        db.commit()
        db.refresh(gf)

        # Auto-create a version for EVERY existing member (except admin)
        # But NOT for hidden files — those are admin-only
        if not gf.is_hidden:
            memberships = db.query(Membership).filter(
                Membership.group_id == group.id
            ).all()
            for m in memberships:
                if m.user_id != current_user.id:  # skip admin
                    version = MemberFileVersion(
                        file_id=gf.id,
                        user_id=m.user_id,
                        content=gf.content
                    )
                    db.add(version)
        db.commit()
        
        logger.info(f"File created: {gf.id} in group {group.id} by user {current_user.id}")
        return FileResponse.model_validate(gf)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating file: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Error creating file")


@router.get("", response_model=list[FileResponse])
def list_files(group_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group, _ = _check_membership(current_user, group_id, db)
    query = db.query(GroupFile).filter(GroupFile.group_id == group_id)
    # Send all files to everyone, front-end will handle the separated display 
    files = query.order_by(GroupFile.created_at).all()
    return [FileResponse.model_validate(f) for f in files]


@router.get("/{file_id}", response_model=FileResponse)
def get_file(group_id: int, file_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_membership(current_user, group_id, db)
    gf = db.query(GroupFile).filter(GroupFile.id == file_id, GroupFile.group_id == group_id).first()
    if not gf:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse.model_validate(gf)


@router.put("/{file_id}", response_model=FileResponse)
def update_file(group_id: int, file_id: int, data: FileUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a file template (admin only)"""
    try:
        group, _ = _check_membership(current_user, group_id, db)
        _check_admin(current_user, group)

        gf = db.query(GroupFile).filter(GroupFile.id == file_id, GroupFile.group_id == group_id).first()
        if not gf:
            raise HTTPException(status_code=404, detail="File not found")

        if data.filename is not None:
            filename = data.filename.strip()
            if not filename or len(filename) > 255:
                raise HTTPException(status_code=400, detail="Filename is required and must not exceed 255 characters")
            gf.filename = filename
        
        if data.language is not None:
            language = data.language.strip() if data.language else "text"
            valid_langs = ["text", "python", "javascript", "json", "html", "css", "sql", "java", "cpp", "c", "ruby", "go", "rust"]
            gf.language = language if language in valid_langs else "text"
        
        if data.content is not None:
            content = data.content or ""
            if len(content.encode('utf-8')) > 10 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="File content too large (max 10MB)")
            gf.content = content

        if data.is_hidden is not None:
            gf.is_hidden = data.is_hidden

        if data.is_readonly is not None:
            gf.is_readonly = data.is_readonly

        db.commit()
        db.refresh(gf)
        
        logger.info(f"File updated: {gf.id} in group {group.id} by user {current_user.id}")
        return FileResponse.model_validate(gf)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating file: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Error updating file")


@router.delete("/{file_id}", status_code=204)
def delete_file(group_id: int, file_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group, _ = _check_membership(current_user, group_id, db)
    _check_admin(current_user, group)

    gf = db.query(GroupFile).filter(GroupFile.id == file_id, GroupFile.group_id == group_id).first()
    if not gf:
        raise HTTPException(status_code=404, detail="File not found")

    db.delete(gf)
    db.commit()
    return None


# ─── Member Versions ───

@router.get("/{file_id}/my-version", response_model=MemberVersionResponse)
def get_my_version(group_id: int, file_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Member gets their own copy of the file."""
    _check_membership(current_user, group_id, db)

    version = db.query(MemberFileVersion).filter(
        MemberFileVersion.file_id == file_id,
        MemberFileVersion.user_id == current_user.id
    ).first()

    if not version:
        # Create one from the template
        gf = db.query(GroupFile).filter(GroupFile.id == file_id, GroupFile.group_id == group_id).first()
        if not gf:
            raise HTTPException(status_code=404, detail="File not found")
        version = MemberFileVersion(file_id=gf.id, user_id=current_user.id, content=gf.content)
        db.add(version)
        db.commit()
        db.refresh(version)

    return MemberVersionResponse(
        id=version.id,
        file_id=version.file_id,
        user_id=version.user_id,
        username=current_user.username,
        content=version.content,
        updated_at=version.updated_at
    )


@router.put("/{file_id}/my-version", response_model=MemberVersionResponse)
def update_my_version(group_id: int, file_id: int, data: MemberVersionUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Member saves edits to their own copy."""
    try:
        _check_membership(current_user, group_id, db)

        # Validate content size (max 10MB)
        content = data.content or ""
        if len(content.encode('utf-8')) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File content too large (max 10MB)")

        version = db.query(MemberFileVersion).filter(
            MemberFileVersion.file_id == file_id,
            MemberFileVersion.user_id == current_user.id
        ).first()

        if not version:
            gf = db.query(GroupFile).filter(GroupFile.id == file_id, GroupFile.group_id == group_id).first()
            if not gf:
                raise HTTPException(status_code=404, detail="File not found")
            version = MemberFileVersion(file_id=gf.id, user_id=current_user.id, content=content)
            db.add(version)
        else:
            version.content = content

        db.commit()
        db.refresh(version)

        logger.info(f"User {current_user.id} updated file version {version.id}")
        return MemberVersionResponse(
            id=version.id,
            file_id=version.file_id,
            user_id=version.user_id,
            username=current_user.username,
            content=version.content,
            updated_at=version.updated_at
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating member version: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Error updating file")


@router.get("/{file_id}/versions", response_model=list[MemberVersionResponse])
def get_all_versions(group_id: int, file_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin-only: view all members' versions of a file."""
    group, _ = _check_membership(current_user, group_id, db)
    _check_admin(current_user, group)

    versions = db.query(MemberFileVersion).filter(MemberFileVersion.file_id == file_id).all()
    result = []
    for v in versions:
        user = db.query(User).filter(User.id == v.user_id).first()
        result.append(MemberVersionResponse(
            id=v.id,
            file_id=v.file_id,
            user_id=v.user_id,
            username=user.username if user else "unknown",
            content=v.content,
            updated_at=v.updated_at
        ))
    return result


@router.get("/{file_id}/versions/{user_id}", response_model=MemberVersionResponse)
def get_member_version(group_id: int, file_id: int, user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin-only: view a specific member's version."""
    group, _ = _check_membership(current_user, group_id, db)
    _check_admin(current_user, group)

    version = db.query(MemberFileVersion).filter(
        MemberFileVersion.file_id == file_id,
        MemberFileVersion.user_id == user_id
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="No version found for this member")

    user = db.query(User).filter(User.id == user_id).first()
    return MemberVersionResponse(
        id=version.id,
        file_id=version.file_id,
        user_id=version.user_id,
        username=user.username if user else "unknown",
        content=version.content,
        updated_at=version.updated_at
    )
