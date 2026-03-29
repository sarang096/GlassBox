from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import string
import random
from database import Base


def generate_group_code(length=8):
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owned_groups = relationship("Group", back_populates="admin", cascade="all, delete-orphan")
    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")
    file_versions = relationship("MemberFileVersion", back_populates="user", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    group_code = Column(String(8), unique=True, index=True, default=generate_group_code)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    admin = relationship("User", back_populates="owned_groups")
    memberships = relationship("Membership", back_populates="group", cascade="all, delete-orphan")
    fields = relationship("GroupField", back_populates="group", cascade="all, delete-orphan")
    files = relationship("GroupFile", back_populates="group", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    role = Column(String(20), default="member")
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="memberships")
    group = relationship("Group", back_populates="memberships")
    profile_values = relationship("MemberProfile", back_populates="membership", cascade="all, delete-orphan")


class GroupField(Base):
    """Fields that the admin defines for members to fill when joining."""
    __tablename__ = "group_fields"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    field_name = Column(String(100), nullable=False)
    field_type = Column(String(20), default="text")  # text, email, number, textarea
    required = Column(Boolean, default=True)
    field_order = Column(Integer, default=0)

    group = relationship("Group", back_populates="fields")
    profile_values = relationship("MemberProfile", back_populates="field", cascade="all, delete-orphan")


class MemberProfile(Base):
    """A member's answer to a group field."""
    __tablename__ = "member_profiles"

    id = Column(Integer, primary_key=True, index=True)
    membership_id = Column(Integer, ForeignKey("memberships.id"), nullable=False)
    field_id = Column(Integer, ForeignKey("group_fields.id"), nullable=False)
    value = Column(Text, default="")

    membership = relationship("Membership", back_populates="profile_values")
    field = relationship("GroupField", back_populates="profile_values")


class GroupFile(Base):
    """A file template created by the admin and distributed to all members."""
    __tablename__ = "group_files"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    language = Column(String(50), default="text")  # python, javascript, json, text, etc.
    content = Column(Text, default="")
    is_hidden = Column(Boolean, default=False)  # Hidden files are only visible to admin
    is_readonly = Column(Boolean, default=False)  # Read-only files cannot be edited by clients
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="files")
    versions = relationship("MemberFileVersion", back_populates="file", cascade="all, delete-orphan")


class MemberFileVersion(Base):
    """Each member's independent copy/fork of a group file."""
    __tablename__ = "member_file_versions"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("group_files.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, default="")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    file = relationship("GroupFile", back_populates="versions")
    user = relationship("User", back_populates="file_versions")
