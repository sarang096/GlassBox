import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, Group, Membership, GroupField, MemberProfile, GroupFile, MemberFileVersion
from schemas import (
    GroupCreate, GroupJoin, GroupResponse, GroupDetailResponse,
    MemberResponse, ProfileValueResponse, GroupFieldResponse, GroupFieldCreate
)
from auth import get_current_user
from config import MAX_GROUP_NAME_LENGTH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/groups", tags=["Groups"])


def _build_group_response(group: Group, db: Session) -> GroupResponse:
    member_count = db.query(Membership).filter(Membership.group_id == group.id).count()
    fields = db.query(GroupField).filter(GroupField.group_id == group.id).order_by(GroupField.field_order).all()
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description or "",
        group_code=group.group_code,
        admin_id=group.admin_id,
        admin_username=group.admin.username,
        created_at=group.created_at,
        member_count=member_count,
        fields=[GroupFieldResponse.model_validate(f) for f in fields]
    )


def _build_member_response(membership: Membership, db: Session, is_admin_viewing: bool = False) -> MemberResponse:
    user = db.query(User).filter(User.id == membership.user_id).first()
    profile = []
    if is_admin_viewing or True:  # admin can always see profile
        profile_values = db.query(MemberProfile).filter(MemberProfile.membership_id == membership.id).all()
        for pv in profile_values:
            field = db.query(GroupField).filter(GroupField.id == pv.field_id).first()
            if field:
                profile.append(ProfileValueResponse(
                    field_id=field.id,
                    field_name=field.field_name,
                    value=pv.value
                ))
    return MemberResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=membership.role,
        joined_at=membership.joined_at,
        profile=profile
    )


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(data: GroupCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new group with validation"""
    try:
        # Validate group name
        group_name = (data.name or "").strip()
        if not group_name or len(group_name) == 0:
            raise HTTPException(status_code=400, detail="Group name is required")
        
        if len(group_name) > MAX_GROUP_NAME_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Group name must not exceed {MAX_GROUP_NAME_LENGTH} characters"
            )
        
        # Validate description
        description = (data.description or "").strip()[:500]  # Max 500 chars
        
        group = Group(
            name=group_name,
            description=description,
            admin_id=current_user.id
        )
        db.add(group)
        db.commit()
        db.refresh(group)

        # Add admin as first member
        membership = Membership(user_id=current_user.id, group_id=group.id, role="admin")
        db.add(membership)

        # Create fields defined by admin (max 50 fields)
        if data.fields:
            if len(data.fields) > 50:
                raise HTTPException(status_code=400, detail="Maximum 50 fields allowed per group")
            
            for i, field_data in enumerate(data.fields):
                field_name = field_data.field_name.strip()
                if not field_name or len(field_name) > 100:
                    raise HTTPException(status_code=400, detail="Field name is required and must not exceed 100 characters")
                
                # Validate field type
                valid_types = ["text", "email", "number", "textarea"]
                if field_data.field_type not in valid_types:
                    raise HTTPException(status_code=400, detail=f"Invalid field type. Must be one of: {', '.join(valid_types)}")
                
                field = GroupField(
                    group_id=group.id,
                    field_name=field_name,
                    field_type=field_data.field_type,
                    required=field_data.required,
                    field_order=field_data.field_order or i
                )
                db.add(field)

        db.commit()
        logger.info(f"Group created: {group.id} by user {current_user.id}")
        return _build_group_response(group, db)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating group: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="An error occurred while creating the group")


@router.get("", response_model=list[GroupResponse])
def list_my_groups(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memberships = db.query(Membership).filter(Membership.user_id == current_user.id).all()
    group_ids = [m.group_id for m in memberships]
    if not group_ids:
        return []
    groups = db.query(Group).filter(Group.id.in_(group_ids)).order_by(Group.created_at.desc()).all()
    return [_build_group_response(g, db) for g in groups]


@router.post("/join", response_model=GroupResponse)
def join_group(data: GroupJoin, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = data.group_code.strip().upper()
    group = db.query(Group).filter(Group.group_code == code).first()

    if not group:
        raise HTTPException(status_code=404, detail="No group found with this code. Please check and try again.")

    existing = db.query(Membership).filter(
        Membership.user_id == current_user.id,
        Membership.group_id == group.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You are already a member of this group")

    # Create membership
    membership = Membership(user_id=current_user.id, group_id=group.id, role="member")
    db.add(membership)
    db.commit()
    db.refresh(membership)

    # Save profile values
    if data.profile_values:
        for pv in data.profile_values:
            field = db.query(GroupField).filter(GroupField.id == pv.field_id, GroupField.group_id == group.id).first()
            if field:
                mp = MemberProfile(membership_id=membership.id, field_id=pv.field_id, value=pv.value)
                db.add(mp)

    # Auto-create member versions for all existing non-hidden files
    files = db.query(GroupFile).filter(GroupFile.group_id == group.id, GroupFile.is_hidden == False).all()
    for f in files:
        version = MemberFileVersion(file_id=f.id, user_id=current_user.id, content=f.content)
        db.add(version)

    db.commit()
    return _build_group_response(group, db)


@router.get("/lookup/{code}", response_model=GroupResponse)
def lookup_group_by_code(code: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Look up a group by code before joining (to see required fields)."""
    group = db.query(Group).filter(Group.group_code == code.strip().upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="No group found with this code")
    return _build_group_response(group, db)


@router.get("/{group_id}", response_model=GroupDetailResponse)
def get_group(group_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    membership = db.query(Membership).filter(
        Membership.user_id == current_user.id, Membership.group_id == group.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    is_admin = group.admin_id == current_user.id
    memberships = db.query(Membership).filter(Membership.group_id == group.id).all()
    members = [_build_member_response(m, db, is_admin_viewing=is_admin) for m in memberships]

    base = _build_group_response(group, db)
    return GroupDetailResponse(**base.model_dump(), members=members)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.admin_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the admin can delete this group")
    db.delete(group)
    db.commit()
    return None


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(group_id: int, data: GroupCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update group name and description (admin only)"""
    try:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        if group.admin_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only the admin can update this group")
        
        # Validate new name
        group_name = (data.name or "").strip()
        if not group_name or len(group_name) == 0:
            raise HTTPException(status_code=400, detail="Group name is required")
        
        if len(group_name) > 100:
            raise HTTPException(status_code=400, detail=f"Group name must not exceed 100 characters")
        
        # Update group
        group.name = group_name
        group.description = (data.description or "").strip()[:500]
        
        db.commit()
        db.refresh(group)
        
        logger.info(f"Group updated: {group.id} by user {current_user.id}")
        return _build_group_response(group, db)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating group: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Error updating group")


@router.post("/{group_id}/leave", status_code=200)
def leave_group(group_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    membership = db.query(Membership).filter(
        Membership.user_id == current_user.id, Membership.group_id == group.id
    ).first()
    if not membership:
        raise HTTPException(status_code=400, detail="You are not a member")
    if group.admin_id == current_user.id:
        raise HTTPException(status_code=400, detail="Admin cannot leave. Delete the group instead.")
    db.delete(membership)
    db.commit()
    return {"message": "Left the group"}


# ─── Add fields to existing group ───
@router.post("/{group_id}/fields", response_model=GroupFieldResponse, status_code=201)
def add_field(group_id: int, data: GroupFieldCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or group.admin_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only admin can add fields")
    field = GroupField(
        group_id=group.id,
        field_name=data.field_name,
        field_type=data.field_type,
        required=data.required,
        field_order=data.field_order
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return GroupFieldResponse.model_validate(field)
