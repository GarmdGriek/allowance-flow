"""User profile management API.

Handles profile creation and retrieval for the onboarding flow.
"""

import asyncpg
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthorizedUser
from app.libs.models import UserRole

router = APIRouter(prefix="/profile", tags=["profile"])


# Request/Response Models
class CreateProfileRequest(BaseModel):
    """Request model for creating a user profile."""
    role: Optional[UserRole] = None  # Optional if invite_code is provided
    family_id: Optional[str] = Field(None, min_length=1, max_length=100)  # Optional if invite_code is provided
    currency: str = Field(default="USD", min_length=3, max_length=3)
    invite_code: Optional[str] = None  # Invite code from URL
    language: str = Field(default="en", min_length=2, max_length=10)  # Family language preference


class ProfileResponse(BaseModel):
    """Response model for user profile data."""
    user_id: str
    role: UserRole
    family_id: str
    currency: str
    status: str  # 'active' or 'pending'
    created_at: str
    updated_at: str
    
    # User info from Stack Auth
    name: Optional[str] = None
    email: Optional[str] = None


@router.get("/me")
async def get_my_profile(user: AuthorizedUser) -> ProfileResponse:
    """Get the current user's profile"""
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        row = await conn.fetchrow(
            """
            SELECT user_id, role, family_id, currency, status, created_at, updated_at
            FROM user_profiles
            WHERE user_id = $1
            """,
            user.sub
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        return ProfileResponse(
            user_id=row["user_id"],
            role=row["role"],
            family_id=row["family_id"],
            currency=row["currency"],
            status=row["status"],
            created_at=row["created_at"].isoformat(),
            updated_at=row["updated_at"].isoformat()
        )
    finally:
        await conn.close()


@router.post("/setup", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def setup_profile(body: CreateProfileRequest, user: AuthorizedUser) -> ProfileResponse:
    """Create a user profile during onboarding.
    
    This endpoint is called when a new user completes the profile setup form.
    If the user already has a profile, it returns a 409 Conflict error.
    
    Supports two flows:
    1. With invite code: Auto-approve with role from invite
    2. Without invite code: Create pending profile, parent must approve
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Check if profile already exists
        existing_profile = await conn.fetchrow(
            "SELECT user_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if existing_profile:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Profile already exists"
            )
        
        # Variables to store final values
        final_role = body.role
        final_family_id = body.family_id
        final_status = "pending"  # Default to pending
        
        # Check if invite code is provided
        if body.invite_code:
            # Validate invite code
            invite = await conn.fetchrow(
                """
                SELECT id, family_id, role, revoked, used_by
                FROM family_invites
                WHERE invite_code = $1
                """,
                body.invite_code
            )
            
            if not invite:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Invalid invite code"
                )
            
            if invite["revoked"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This invite has been revoked"
                )
            
            if invite["used_by"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This invite has already been used"
                )
            
            # Use role and family_id from invite
            final_role = invite["role"]
            final_family_id = invite["family_id"]
            final_status = "active"  # Auto-approve with invite
            
            # Mark invite as used
            await conn.execute(
                """
                UPDATE family_invites
                SET used_by = $1, used_at = NOW()
                WHERE id = $2
                """,
                user.sub,
                invite["id"]
            )
        else:
            # No invite code - require role and family_id
            if not final_role or not final_family_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="role and family_id are required when not using an invite code"
                )
            
            # Check if this is the first parent in a new family
            if final_role == "parent":
                # Check if any other users exist in this family
                existing_members = await conn.fetchval(
                    "SELECT COUNT(*) FROM user_profiles WHERE family_id = $1",
                    final_family_id
                )
                
                if existing_members == 0:
                    # First parent in new family, auto-approve
                    final_status = "active"
                    
                    # Create family record with language setting
                    await conn.execute(
                        """
                        INSERT INTO families (id, language)
                        VALUES ($1, $2)
                        ON CONFLICT (id) DO UPDATE SET language = $2
                        """,
                        final_family_id,
                        body.language
                    )
                # else: joining existing family, remains "pending"
            # Children without invite remain "pending"

        # Create the profile
        profile = await conn.fetchrow(
            """
            INSERT INTO user_profiles (user_id, role, family_id, currency, status)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING user_id, role, family_id, currency, status, created_at, updated_at
            """,
            user.sub,
            final_role,
            final_family_id,
            body.currency,
            final_status
        )
        
        # Try to get user info from Stack Auth sync table (might not exist yet)
        user_info = await conn.fetchrow(
            "SELECT name, email FROM neon_auth.users_sync WHERE id = $1",
            user.sub
        )
        
        return ProfileResponse(
            user_id=profile["user_id"],
            role=profile["role"],
            family_id=profile["family_id"],
            currency=profile["currency"],
            status=profile["status"],
            created_at=profile["created_at"].isoformat(),
            updated_at=profile["updated_at"].isoformat(),
            name=user_info["name"] if user_info else None,
            email=user_info["email"] if user_info else None
        )
    finally:
        await conn.close()


@router.put("/update", response_model=ProfileResponse)
async def update_profile(body: CreateProfileRequest, user: AuthorizedUser) -> ProfileResponse:
    """Update an existing user profile.
    
    Allows users to change their role or family.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Update the profile
        profile = await conn.fetchrow(
            """
            UPDATE user_profiles
            SET role = $1, family_id = $2
            WHERE user_id = $3
            RETURNING user_id, role, family_id, created_at, updated_at
            """,
            body.role,
            body.family_id,
            user.sub
        )
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        # Get user info from Stack Auth
        user_info = await conn.fetchrow(
            "SELECT name, email FROM neon_auth.users_sync WHERE id = $1",
            user.sub
        )
        
        return ProfileResponse(
            user_id=profile["user_id"],
            role=profile["role"],
            family_id=profile["family_id"],
            created_at=profile["created_at"].isoformat(),
            updated_at=profile["updated_at"].isoformat(),
            name=user_info["name"] if user_info else None,
            email=user_info["email"] if user_info else None
        )
    finally:
        await conn.close()
