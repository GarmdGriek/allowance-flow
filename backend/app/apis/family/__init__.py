

"""Family management API.

Handles invite creation, member approval, and family member management.
"""

import asyncpg
import base64
import hashlib
import httpx
import os
import re
import secrets
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthorizedUser
from app.libs.models import UserRole

router = APIRouter(prefix="/family", tags=["family"])


# Request/Response Models
class CreateInviteRequest(BaseModel):
    """Request model for creating a family invite."""
    role: UserRole
    invited_name: Optional[str] = None  # Optional name like "Emma"


class FamilyInviteResponse(BaseModel):
    """Response model for a family invite."""
    id: str
    family_id: str
    role: UserRole
    invite_code: str
    invited_name: Optional[str] = None
    created_by: str
    created_at: str
    used_by: Optional[str] = None
    used_at: Optional[str] = None
    revoked: bool
    revoked_at: Optional[str] = None


class PendingMemberResponse(BaseModel):
    """Response model for a pending family member."""
    user_id: str
    role: UserRole
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: str


class ApproveMemberRequest(BaseModel):
    """Request model for approving a pending member."""
    user_id: str
    role: UserRole  # Parent decides the role


class ChildResponse(BaseModel):
    """Response model for child information"""
    user_id: str
    name: str | None = None  # Make name optional since it can be None
    email: str | None = None
    total_earned: str
    total_paid: str
    pending_amount: str
    phone_number: str | None = None


class ParentResponse(BaseModel):
    """Response model for parent data."""
    user_id: str
    name: str


class UpdateChildRequest(BaseModel):
    """Request model for updating a child's profile."""
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    phone_number: Optional[str] = None  # For Vipps payment integration


class CreateChildAccountRequest(BaseModel):
    """Request for parent to create a child account directly (no email needed)."""
    display_name: str = Field(..., min_length=1, max_length=50)
    pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")
    currency: str = Field(default="USD", min_length=3, max_length=3)


class ChildAccountResponse(BaseModel):
    """Response after creating a child account, includes login credentials."""
    user_id: str
    display_name: str
    username: str        # The part before @allowanceflow.app — shown to the child
    virtual_email: str   # Full virtual email used internally
    family_id: str
    currency: str


class UpdateChildPinRequest(BaseModel):
    """Request for parent to change a child's PIN."""
    new_pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")


class RenameFamilyIdRequest(BaseModel):
    """Request to rename the family's public ID."""
    new_family_id: str = Field(
        ...,
        min_length=3,
        max_length=30,
        pattern=r"^[a-z0-9][a-z0-9_-]*[a-z0-9]$",
        description="Lowercase letters, numbers, underscores and hyphens. Must start and end with a letter or number.",
    )


class RenameFamilyIdResponse(BaseModel):
    new_family_id: str


class WeeklySummarySettingsResponse(BaseModel):
    """Response model for weekly summary notification settings."""
    enabled: bool
    day: int  # 0=Sunday, 1=Monday, ..., 6=Saturday
    hour: int  # 0-23


class UpdateWeeklySummarySettingsRequest(BaseModel):
    """Request model for updating weekly summary settings."""
    enabled: Optional[bool] = None
    day: Optional[int] = Field(None, ge=0, le=6)  # 0-6 for days of week
    hour: Optional[int] = Field(None, ge=0, le=23)  # 0-23 for hours


@router.get("/children")
async def list_children(user: AuthorizedUser) -> list[ChildResponse]:
    """List all active children in the user's family.
    
    Only parents can view children.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Get user's profile
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can view children"
            )
        
        # Fetch all children with their allowance totals
        children_data = await conn.fetch(
            """
            SELECT 
                up.user_id,
                up.name,
                up.phone_number,
                COALESCE(SUM(CASE WHEN t.status IN ('completed', 'paid') THEN t.value ELSE 0 END), 0) as total_earned,
                COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.value ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.value ELSE 0 END), 0) as pending_amount
            FROM user_profiles up
            LEFT JOIN tasks t ON t.assigned_to_user_id = up.user_id AND t.family_id = up.family_id
            WHERE up.family_id = $1 AND up.role = 'child' AND up.status = 'active'
            GROUP BY up.user_id, up.name, up.phone_number
            ORDER BY up.created_at
            """,
            profile["family_id"]
        )

        return [
            ChildResponse(
                user_id=child["user_id"],
                name=child["name"] or "Unnamed Child",  # Provide default if None
                email=None,  # We don't store email in our database
                total_earned=str(child["total_earned"]),
                total_paid=str(child["total_paid"]),
                pending_amount=str(child["pending_amount"]),
                phone_number=child["phone_number"]
            )
            for child in children_data
        ]
    finally:
        await conn.close()


@router.get("/parents")
async def list_parents(user: AuthorizedUser) -> list[ParentResponse]:
    """List all parents in the user's family.
    
    Available to all family members.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Get user's profile
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get all parents in the family
        rows = await conn.fetch(
            """
            SELECT 
                up.user_id,
                COALESCE(up.name, us.name, us.email, up.user_id) as name
            FROM user_profiles up
            LEFT JOIN neon_auth.users_sync us ON up.user_id = us.id
            WHERE up.family_id = $1 AND up.role = 'parent' AND up.status = 'active'
            ORDER BY up.created_at
            """,
            profile["family_id"]
        )
        
        return [
            ParentResponse(
                user_id=row["user_id"],
                name=row["name"]
            )
            for row in rows
        ]
    finally:
        await conn.close()


@router.post("/invites", response_model=FamilyInviteResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(body: CreateInviteRequest, user: AuthorizedUser) -> FamilyInviteResponse:
    """Create a new family invite link.
    
    Only parents can create invites.
    Generates a unique invite code that can be shared with family members.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if user is a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can create invites"
            )
        
        # Generate a unique invite code
        invite_code = f"inv_{secrets.token_urlsafe(12)}"
        
        # Create the invite
        invite = await conn.fetchrow(
            """
            INSERT INTO family_invites (family_id, role, invite_code, invited_name, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at
            """,
            profile["family_id"],
            body.role,
            invite_code,
            body.invited_name,
            user.sub
        )
        
        return FamilyInviteResponse(
            id=str(invite["id"]),
            family_id=invite["family_id"],
            role=invite["role"],
            invite_code=invite["invite_code"],
            invited_name=invite["invited_name"],
            created_by=invite["created_by"],
            created_at=invite["created_at"].isoformat(),
            used_by=invite["used_by"],
            used_at=invite["used_at"].isoformat() if invite["used_at"] else None,
            revoked=invite["revoked"],
            revoked_at=invite["revoked_at"].isoformat() if invite["revoked_at"] else None
        )
    finally:
        await conn.close()


@router.get("/invites", response_model=List[FamilyInviteResponse])
async def list_invites(user: AuthorizedUser) -> List[FamilyInviteResponse]:
    """List all invites for the user's family.
    
    Only parents can view invites.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if user is a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can view invites"
            )
        
        # Get all invites for the family
        invites = await conn.fetch(
            """
            SELECT id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at
            FROM family_invites
            WHERE family_id = $1
            ORDER BY created_at DESC
            """,
            profile["family_id"]
        )
        
        return [
            FamilyInviteResponse(
                id=str(invite["id"]),
                family_id=invite["family_id"],
                role=invite["role"],
                invite_code=invite["invite_code"],
                invited_name=invite["invited_name"],
                created_by=invite["created_by"],
                created_at=invite["created_at"].isoformat(),
                used_by=invite["used_by"],
                used_at=invite["used_at"].isoformat() if invite["used_at"] else None,
                revoked=invite["revoked"],
                revoked_at=invite["revoked_at"].isoformat() if invite["revoked_at"] else None
            )
            for invite in invites
        ]
    finally:
        await conn.close()


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, user: AuthorizedUser) -> dict:
    """Revoke a family invite.
    
    Only the parent who created the invite can revoke it.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if user is a parent and owns this invite
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can revoke invites"
            )
        
        # Revoke the invite
        result = await conn.execute(
            """
            UPDATE family_invites
            SET revoked = TRUE, revoked_at = NOW()
            WHERE id = $1 AND family_id = $2 AND revoked = FALSE
            """,
            invite_id,
            profile["family_id"]
        )
        
        if result == "UPDATE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found or already revoked"
            )
        
        return {"message": "Invite revoked successfully"}
    finally:
        await conn.close()


@router.get("/pending-members", response_model=List[PendingMemberResponse])
async def list_pending_members(user: AuthorizedUser) -> List[PendingMemberResponse]:
    """List all pending members waiting for approval.
    
    Only parents can view pending members.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if user is a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can view pending members"
            )
        
        # Get all pending members in the family
        members = await conn.fetch(
            """
            SELECT up.user_id, up.role, up.created_at, u.name, u.email
            FROM user_profiles up
            LEFT JOIN neon_auth.users_sync u ON up.user_id = u.id
            WHERE up.family_id = $1 AND up.status = 'pending'
            ORDER BY up.created_at DESC
            """,
            profile["family_id"]
        )
        
        return [
            PendingMemberResponse(
                user_id=member["user_id"],
                role=member["role"],
                name=member["name"],
                email=member["email"],
                created_at=member["created_at"].isoformat()
            )
            for member in members
        ]
    finally:
        await conn.close()


@router.post("/approve-member")
async def approve_member(body: ApproveMemberRequest, user: AuthorizedUser) -> dict:
    """Approve a pending family member and assign them a role.
    
    Only parents can approve members.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if user is a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can approve members"
            )
        
        # Approve the member
        result = await conn.execute(
            """
            UPDATE user_profiles
            SET status = 'active', role = $1
            WHERE user_id = $2 AND family_id = $3 AND status = 'pending'
            """,
            body.role,
            body.user_id,
            profile["family_id"]
        )
        
        if result == "UPDATE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending member not found"
            )
        
        return {"message": "Member approved successfully"}
    finally:
        await conn.close()


@router.delete("/reject-member/{user_id}")
async def reject_member(user_id: str, user: AuthorizedUser) -> dict:
    """Reject a pending family member.
    
    Only parents can reject members.
    This will delete their profile.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if user is a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can reject members"
            )
        
        # Delete the pending member's profile
        result = await conn.execute(
            """
            DELETE FROM user_profiles
            WHERE user_id = $1 AND family_id = $2 AND status = 'pending'
            """,
            user_id,
            profile["family_id"]
        )
        
        if result == "DELETE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending member not found"
            )
        
        return {"message": "Member rejected successfully"}
    finally:
        await conn.close()


@router.put("/children/{child_user_id}", response_model=ChildResponse)
async def update_child_profile(child_user_id: str, body: UpdateChildRequest, user: AuthorizedUser) -> ChildResponse:
    """Update a child's profile information.
    
    Only parents can update children in their family.
    Currently supports updating name only.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Verify user is a parent
        parent_profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not parent_profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        if parent_profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can update children"
            )
        
        # Verify child belongs to same family
        child_profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            child_user_id
        )
        
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child not found")
        
        if child_profile["family_id"] != parent_profile["family_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child is not in your family"
            )
        
        if child_profile["role"] != "child":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not a child"
            )
        
        # Build update query dynamically based on provided fields
        update_fields = []
        params = []
        param_count = 1
        
        if body.name is not None:
            update_fields.append(f"name = ${param_count}")
            params.append(body.name)
            param_count += 1
        
        if body.email is not None:
            update_fields.append(f"email = ${param_count}")
            params.append(body.email)
            param_count += 1
        
        if body.phone_number is not None:
            update_fields.append(f"phone_number = ${param_count}")
            params.append(body.phone_number)
            param_count += 1
        
        # Always update updated_at
        update_fields.append("updated_at = NOW()")
        
        if not update_fields:
            raise HTTPException(
                status_code=400,
                detail="No fields to update"
            )
        
        # Update the profile
        params.append(child_user_id)
        params.append(parent_profile["family_id"])
        
        query = f"""
            UPDATE user_profiles
            SET {', '.join(update_fields)}
            WHERE user_id = ${param_count} AND family_id = ${param_count + 1}
            RETURNING user_id
        """
        
        updated = await conn.fetchrow(query, *params)
        
        # Fetch updated child data with allowance totals
        child_data = await conn.fetchrow(
            """
            SELECT 
                up.user_id,
                up.name,
                up.phone_number,
                COALESCE(SUM(CASE WHEN t.status IN ('completed', 'paid') THEN t.value ELSE 0 END), 0) as total_earned,
                COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.value ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.value ELSE 0 END), 0) as pending_amount
            FROM user_profiles up
            LEFT JOIN tasks t ON t.assigned_to_user_id = up.user_id AND t.family_id = up.family_id
            WHERE up.user_id = $1 AND up.family_id = $2
            GROUP BY up.user_id, up.name, up.phone_number
            """,
            child_user_id,
            parent_profile["family_id"]
        )
        
        return ChildResponse(
            user_id=child_data["user_id"],
            name=child_data["name"],
            email=None,  # We don't store email in our database
            total_earned=str(child_data["total_earned"]),
            total_paid=str(child_data["total_paid"]),
            pending_amount=str(child_data["pending_amount"]),
            phone_number=child_data["phone_number"]
        )
    finally:
        await conn.close()


@router.get("/weekly-summary-settings", response_model=WeeklySummarySettingsResponse)
async def get_weekly_summary_settings(user: AuthorizedUser) -> WeeklySummarySettingsResponse:
    """Get weekly summary notification settings for the family.
    
    Only parents can view settings.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Get user's profile and verify they are a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can view notification settings"
            )
        
        # Get family settings
        family = await conn.fetchrow(
            """
            SELECT weekly_summary_enabled, weekly_summary_day, weekly_summary_hour
            FROM families
            WHERE id = $1
            """,
            profile["family_id"]
        )
        
        if not family:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        return WeeklySummarySettingsResponse(
            enabled=family["weekly_summary_enabled"] or False,
            day=family["weekly_summary_day"] or 0,
            hour=family["weekly_summary_hour"] or 18
        )
    finally:
        await conn.close()


@router.put("/weekly-summary-settings", response_model=WeeklySummarySettingsResponse)
async def update_weekly_summary_settings(
    body: UpdateWeeklySummarySettingsRequest,
    user: AuthorizedUser
) -> WeeklySummarySettingsResponse:
    """Update weekly summary notification settings for the family.
    
    Only parents can update settings.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Get user's profile and verify they are a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        if profile["role"] != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can update notification settings"
            )
        
        # Build update query dynamically
        update_fields = []
        params = []
        param_count = 1
        
        if body.enabled is not None:
            update_fields.append(f"weekly_summary_enabled = ${param_count}")
            params.append(body.enabled)
            param_count += 1
        
        if body.day is not None:
            update_fields.append(f"weekly_summary_day = ${param_count}")
            params.append(body.day)
            param_count += 1
        
        if body.hour is not None:
            update_fields.append(f"weekly_summary_hour = ${param_count}")
            params.append(body.hour)
            param_count += 1
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        update_fields.append("updated_at = NOW()")
        params.append(profile["family_id"])
        
        query = f"""
            UPDATE families
            SET {', '.join(update_fields)}
            WHERE id = ${param_count}
            RETURNING weekly_summary_enabled, weekly_summary_day, weekly_summary_hour
        """
        
        updated_family = await conn.fetchrow(query, *params)
        
        if not updated_family:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        return WeeklySummarySettingsResponse(
            enabled=updated_family["weekly_summary_enabled"],
            day=updated_family["weekly_summary_day"],
            hour=updated_family["weekly_summary_hour"]
        )
    finally:
        await conn.close()


def _hash_pin(pin: str) -> str:
    """Return a salted PBKDF2-SHA256 hash of a PIN, safe to store in the DB."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, 200_000)
    return base64.b64encode(salt).decode() + ":" + base64.b64encode(dk).decode()


def _verify_pin(pin: str, stored_hash: str) -> bool:
    """Constant-time verification of a PIN against a stored hash."""
    try:
        salt_b64, dk_b64 = stored_hash.split(":", 1)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, 200_000)
        return hashlib.compare_digest(dk, expected)
    except Exception:
        return False


_CHAR_MAP: dict[str, str] = {
    # Norwegian / Nordic
    "å": "a", "ø": "o", "æ": "ae",
    # German umlauts
    "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
    # French / Spanish / Portuguese accents
    "à": "a", "â": "a", "á": "a", "ã": "a",
    "è": "e", "ê": "e", "é": "e", "ë": "e",
    "î": "i", "í": "i", "ì": "i", "ï": "i",
    "ô": "o", "ó": "o", "ò": "o", "õ": "o",
    "û": "u", "ú": "u", "ù": "u",
    "ç": "c", "ñ": "n",
}


def _make_username_slug(display_name: str) -> str:
    """Convert a display name to a URL-safe ASCII lowercase slug.

    Transliterates common accented/Nordic characters before stripping so that
    e.g. 'Vårin' → 'varin' rather than 'v.rin'.
    """
    slug = display_name.lower().strip()
    slug = "".join(_CHAR_MAP.get(c, c) for c in slug)
    slug = re.sub(r"[^a-z0-9]+", ".", slug)
    slug = slug.strip(".")
    return slug or "child"


@router.post("/children/create-account", response_model=ChildAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_child_account(body: CreateChildAccountRequest, user: AuthorizedUser) -> ChildAccountResponse:
    """Parent creates a child account directly using a display name + PIN.

    No real email address needed. A virtual email is generated in the form
    {slug}.{familyId}@allowanceflow.app so the child can log in with just
    their name and PIN from the simplified child login page.
    """
    neon_auth_url = os.environ.get("NEON_AUTH_ISSUER", "").rstrip("/")
    if not neon_auth_url:
        raise HTTPException(status_code=500, detail="Auth service not configured")

    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Verify caller is a parent
        profile = await conn.fetchrow(
            "SELECT family_id, role FROM user_profiles WHERE user_id = $1 AND status = 'active'",
            user.sub,
        )
        if not profile:
            raise HTTPException(status_code=403, detail="Active profile required")
        if profile["role"] != "parent":
            raise HTTPException(status_code=403, detail="Only parents can create child accounts")

        family_id: str = profile["family_id"]
        slug = _make_username_slug(body.display_name)

        # Guard: verify the migration has been applied (probe column directly).
        # The app DB user cannot ALTER tables — run migrations/001_child_auth_columns.sql
        # in the Railway / Neon SQL console to add the required columns.
        try:
            await conn.fetchval("SELECT pin_hash FROM user_profiles LIMIT 0")
        except asyncpg.exceptions.UndefinedColumnError:
            raise HTTPException(
                status_code=503,
                detail="Database migration required: run migrations/001_child_auth_columns.sql in your SQL console",
            )

        # Ensure uniqueness within the family by appending a short random suffix if needed
        base_slug = slug
        attempt = 0
        while True:
            candidate = f"{base_slug}{('.' + secrets.token_hex(2)) if attempt else ''}"
            existing = await conn.fetchval(
                "SELECT user_id FROM user_profiles WHERE family_id = $1 AND username = $2",
                family_id, candidate,
            )
            if not existing:
                slug = candidate
                break
            attempt += 1
            if attempt > 10:
                raise HTTPException(status_code=409, detail="Could not generate unique username")

        virtual_email = f"{slug}.{family_id}@allowanceflow.app"

        # Generate a random internal auth token (used as the Better Auth password).
        # The PIN is stored separately as a hash — this way changing the PIN is a
        # pure DB operation and never requires a Better Auth admin API.
        child_auth_token = secrets.token_urlsafe(32)
        pin_hash = _hash_pin(body.pin)

        # Create the Neon Auth account using the random token as the password.
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{neon_auth_url}/sign-up/email",
                json={"email": virtual_email, "password": child_auth_token, "name": body.display_name},
            )
            if resp.status_code not in (200, 201):
                detail = resp.text[:200]
                raise HTTPException(status_code=502, detail=f"Failed to create auth account: {detail}")
            auth_data = resp.json()

        child_user_id: str = (
            auth_data.get("user", {}).get("id")
            or auth_data.get("id")
            or auth_data.get("userId")
        )
        if not child_user_id:
            raise HTTPException(status_code=502, detail="Auth service did not return a user ID")

        # Create the profile — active immediately since parent is creating it.
        # Store username slug, neon_email, pin_hash and child_auth_token so the child
        # can log in with username + PIN.  neon_email is the permanent email in Neon Auth
        # — it never changes even if the family ID is later renamed.
        await conn.execute(
            """
            INSERT INTO user_profiles (user_id, role, family_id, currency, status, name, username, neon_email, pin_hash, child_auth_token)
            VALUES ($1, 'child', $2, $3, 'active', $4, $5, $6, $7, $8)
            ON CONFLICT (user_id) DO UPDATE SET
                username = EXCLUDED.username,
                neon_email = EXCLUDED.neon_email,
                pin_hash = EXCLUDED.pin_hash,
                child_auth_token = EXCLUDED.child_auth_token
            """,
            child_user_id, family_id, body.currency, body.display_name, slug, virtual_email, pin_hash, child_auth_token,
        )

        return ChildAccountResponse(
            user_id=child_user_id,
            display_name=body.display_name,
            username=slug,
            virtual_email=virtual_email,
            family_id=family_id,
            currency=body.currency,
        )
    finally:
        await conn.close()


@router.put("/children/{child_user_id}/pin")
async def update_child_pin(child_user_id: str, body: UpdateChildPinRequest, user: AuthorizedUser) -> dict:
    """Parent changes a child's PIN.

    The PIN is stored as a PBKDF2 hash in user_profiles — no Better Auth admin
    API needed, so this works with Neon Auth's hosted instance.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Verify caller is a parent in the same family as the child
        parent_profile = await conn.fetchrow(
            "SELECT family_id, role FROM user_profiles WHERE user_id = $1 AND status = 'active'",
            user.sub,
        )
        if not parent_profile or parent_profile["role"] != "parent":
            raise HTTPException(status_code=403, detail="Only parents can change child PINs")

        child_profile = await conn.fetchrow(
            "SELECT family_id, role FROM user_profiles WHERE user_id = $1",
            child_user_id,
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child not found")
        if child_profile["family_id"] != parent_profile["family_id"]:
            raise HTTPException(status_code=403, detail="Child is not in your family")
        if child_profile["role"] != "child":
            raise HTTPException(status_code=400, detail="User is not a child")

        new_pin_hash = _hash_pin(body.new_pin)
        result = await conn.execute(
            "UPDATE user_profiles SET pin_hash = $1, updated_at = NOW() WHERE user_id = $2",
            new_pin_hash, child_user_id,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Child profile not found")
    finally:
        await conn.close()

    return {"success": True}


@router.put("/rename-id", response_model=RenameFamilyIdResponse)
async def rename_family_id(body: RenameFamilyIdRequest, user: AuthorizedUser) -> RenameFamilyIdResponse:
    """Rename the family's public ID.

    Only parents can do this.  The operation is atomic:
    1. Ensure new ID is not taken.
    2. Insert a new families row with the new ID (copy of old).
    3. Update all child tables (user_profiles, tasks, family_invites, notifications).
    4. Delete the old families row.

    Child Neon Auth accounts are unaffected because we store `neon_email`
    in user_profiles — child login never reconstructs the email from the ID.
    """
    new_id = body.new_family_id.lower().strip()

    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Verify caller is an active parent
        profile = await conn.fetchrow(
            "SELECT family_id, role FROM user_profiles WHERE user_id = $1 AND status = 'active'",
            user.sub,
        )
        if not profile or profile["role"] != "parent":
            raise HTTPException(status_code=403, detail="Only parents can rename the family ID")

        old_id: str = profile["family_id"]

        if old_id == new_id:
            return RenameFamilyIdResponse(new_family_id=new_id)

        # Check new ID is not already taken
        exists = await conn.fetchval("SELECT id FROM families WHERE id = $1", new_id)
        if exists:
            raise HTTPException(status_code=409, detail="That family ID is already taken")

        async with conn.transaction():
            # 1. Copy the family row under the new ID
            await conn.execute(
                """
                INSERT INTO families (id, name, language, created_at, updated_at,
                                      weekly_summary_enabled, weekly_summary_day, weekly_summary_hour)
                SELECT $1, name, language, created_at, NOW(),
                       weekly_summary_enabled, weekly_summary_day, weekly_summary_hour
                FROM families WHERE id = $2
                """,
                new_id, old_id,
            )

            # 2. Update all child tables to point to the new ID
            await conn.execute("UPDATE user_profiles SET family_id = $1 WHERE family_id = $2", new_id, old_id)
            await conn.execute("UPDATE tasks SET family_id = $1 WHERE family_id = $2", new_id, old_id)
            await conn.execute("UPDATE family_invites SET family_id = $1 WHERE family_id = $2", new_id, old_id)
            await conn.execute("UPDATE notifications SET family_id = $1 WHERE family_id = $2", new_id, old_id)

            # 3. Delete the old family row (child tables no longer reference it so
            #    ON DELETE CASCADE has nothing to remove)
            await conn.execute("DELETE FROM families WHERE id = $1", old_id)

    finally:
        await conn.close()

    return RenameFamilyIdResponse(new_family_id=new_id)
