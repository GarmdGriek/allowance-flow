from fastapi import APIRouter
from pydantic import BaseModel
import os
import asyncpg
from app.auth import AuthorizedUser

router = APIRouter(prefix="/language")

# Response models
class LanguagePreferences(BaseModel):
    """User and family language preferences"""
    user_language: str | None  # User's personal language preference
    family_language: str  # Family's default language
    effective_language: str  # The language that should be used (user pref or family default)

class UpdateUserLanguageRequest(BaseModel):
    """Request to update user's language preference"""
    language: str | None  # null to use family default

class UpdateFamilyLanguageRequest(BaseModel):
    """Request to update family's default language (parents only)"""
    language: str

class UpdateResponse(BaseModel):
    success: bool
    message: str

# Helper function to get database connection
async def get_db_connection():
    return await asyncpg.connect(os.environ.get("DATABASE_URL"))


@router.get("/preferences")
async def get_language_preferences(user: AuthorizedUser) -> LanguagePreferences:
    """
    Get the current user's language preferences.
    Returns both the user's personal preference and the family default.
    """
    conn = await get_db_connection()
    try:
        # Get user profile and family language
        row = await conn.fetchrow(
            """
            SELECT 
                up.language_preference as user_language,
                f.language as family_language
            FROM user_profiles up
            LEFT JOIN families f ON f.id = up.family_id
            WHERE up.user_id = $1
            """,
            user.sub
        )
        
        if not row:
            # User not found, return defaults
            return LanguagePreferences(
                user_language=None,
                family_language="en",
                effective_language="en"
            )
        
        user_language = row["user_language"]
        family_language = row["family_language"] or "en"
        effective_language = user_language if user_language else family_language
        
        return LanguagePreferences(
            user_language=user_language,
            family_language=family_language,
            effective_language=effective_language
        )
    finally:
        await conn.close()


@router.put("/user")
async def update_user_language(body: UpdateUserLanguageRequest, user: AuthorizedUser) -> UpdateResponse:
    """
    Update the current user's language preference.
    Set to null to use the family's default language.
    Only parents can set personal language preferences - children always use family language.
    """
    conn = await get_db_connection()
    try:
        # Check if user is a parent - only parents can set personal language preferences
        profile = await conn.fetchrow(
            "SELECT role FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile:
            return UpdateResponse(
                success=False,
                message="Profile not found"
            )
        
        if profile["role"] != "parent":
            return UpdateResponse(
                success=False,
                message="Children automatically use the family's default language"
            )
        
        await conn.execute(
            """
            UPDATE user_profiles
            SET language_preference = $1
            WHERE user_id = $2
            """,
            body.language,
            user.sub
        )
        
        return UpdateResponse(
            success=True,
            message="Language preference updated successfully"
        )
    finally:
        await conn.close()


@router.put("/family")
async def update_family_language(body: UpdateFamilyLanguageRequest, user: AuthorizedUser) -> UpdateResponse:
    """
    Update the family's default language.
    Only parents can update the family language.
    """
    conn = await get_db_connection()
    try:
        # Check if user is a parent
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )
        
        if not profile or profile["role"] != "parent":
            return UpdateResponse(
                success=False,
                message="Only parents can update the family language"
            )
        
        # Update family language
        await conn.execute(
            """
            UPDATE families
            SET language = $1
            WHERE id = $2
            """,
            body.language,
            profile["family_id"]
        )
        
        return UpdateResponse(
            success=True,
            message="Family language updated successfully"
        )
    finally:
        await conn.close()
