from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


# ─── Auth Schemas ───
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── Group Field Schemas ───
class GroupFieldCreate(BaseModel):
    field_name: str
    field_type: str = "text"
    required: bool = True
    field_order: int = 0


class GroupFieldResponse(BaseModel):
    id: int
    field_name: str
    field_type: str
    required: bool
    field_order: int

    class Config:
        from_attributes = True


# ─── Profile Schemas ───
class ProfileValueSubmit(BaseModel):
    field_id: int
    value: str


class ProfileValueResponse(BaseModel):
    field_id: int
    field_name: str
    value: str

    class Config:
        from_attributes = True


# ─── Group Schemas ───
class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    fields: Optional[List[GroupFieldCreate]] = []


class GroupJoin(BaseModel):
    group_code: str
    profile_values: Optional[List[ProfileValueSubmit]] = []


class MemberResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    joined_at: datetime
    profile: Optional[List[ProfileValueResponse]] = []


class GroupResponse(BaseModel):
    id: int
    name: str
    description: str
    group_code: str
    admin_id: int
    admin_username: str
    created_at: datetime
    member_count: int
    fields: Optional[List[GroupFieldResponse]] = []

    class Config:
        from_attributes = True


class GroupDetailResponse(GroupResponse):
    members: List[MemberResponse]


# ─── File Schemas ───
class FileCreate(BaseModel):
    filename: str
    language: str = "text"
    content: str = ""
    is_hidden: bool = False
    is_readonly: bool = False


class AiBulkFileItem(BaseModel):
    """Single file from N8N AI generation response."""
    category: str  # frontend, backend, db, test
    fileName: str
    code: str = ""
    permission: str = "read-write"  # "read" or "read-write"
    visibility: str = "visible"  # "visible" or "hidden"


class AiBulkImport(BaseModel):
    """Bulk import payload from N8N."""
    files: List[AiBulkFileItem]


class FileUpdate(BaseModel):
    filename: Optional[str] = None
    language: Optional[str] = None
    content: Optional[str] = None
    is_hidden: Optional[bool] = None
    is_readonly: Optional[bool] = None


class FileResponse(BaseModel):
    id: int
    filename: str
    language: str
    content: str
    is_hidden: bool
    is_readonly: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MemberVersionResponse(BaseModel):
    id: int
    file_id: int
    user_id: int
    username: str
    content: str
    updated_at: datetime

    class Config:
        from_attributes = True


class MemberVersionUpdate(BaseModel):
    content: str


class FileWithVersionsResponse(FileResponse):
    """Admin view: file with all member versions."""
    versions: List[MemberVersionResponse] = []
