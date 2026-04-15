"""Child authentication API.

Unauthenticated endpoint that validates a child's PIN and returns
the credentials needed for the frontend to complete sign-in via Neon Auth.

This module is intentionally auth-free (disableAuth: true in routers.json)
because the child does not have a JWT yet — they are trying to get one.
"""

import asyncpg
import base64
import hashlib
import os
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/child-auth", tags=["child-auth"])

# Transliteration map — keeps Nordic / accented chars working in usernames.
# Must stay in sync with the same map in family/__init__.py.
_CHAR_MAP: dict[str, str] = {
    "å": "a", "ø": "o", "æ": "ae",
    "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
    "à": "a", "â": "a", "á": "a", "ã": "a",
    "è": "e", "ê": "e", "é": "e", "ë": "e",
    "î": "i", "í": "i", "ì": "i", "ï": "i",
    "ô": "o", "ó": "o", "ò": "o", "õ": "o",
    "û": "u", "ú": "u", "ù": "u",
    "ç": "c", "ñ": "n",
}


def _normalise_username(raw: str) -> str:
    """Apply the same normalisation as _make_username_slug in family/__init__.py.

    This means a child can enter their display name ('Vårin') or the slug
    ('varin') and both resolve to the same stored username.
    """
    s = raw.lower().strip()
    s = "".join(_CHAR_MAP.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", ".", s)
    s = s.strip(".")
    return s or "child"


def _verify_pin(pin: str, stored_hash: str) -> bool:
    """Constant-time PBKDF2-SHA256 PIN verification."""
    try:
        salt_b64, dk_b64 = stored_hash.split(":", 1)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, 200_000)
        return hashlib.compare_digest(dk, expected)
    except Exception:
        return False


class ChildSignInRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=60)
    family_id: str = Field(..., min_length=1, max_length=100)
    pin: str = Field(..., min_length=4, max_length=8)


class ChildSignInResponse(BaseModel):
    """Credentials for the frontend to use when calling Neon Auth sign-in directly."""
    virtual_email: str
    auth_token: str


@router.post("/sign-in", response_model=ChildSignInResponse)
async def child_sign_in(body: ChildSignInRequest) -> ChildSignInResponse:
    """Validate a child's PIN and return credentials for Neon Auth sign-in.

    The child can enter their display name ('Vårin') or the normalised slug
    ('varin') — both work because we apply the same transliteration on input.

    Lookup is done via the `username` column in user_profiles (family-scoped),
    so it works even if neon_auth.users_sync is unavailable.

    Backward compat: accounts created before the pin_hash flow (PIN was used
    directly as the Better Auth password) fall back to returning the PIN as
    the auth_token so the frontend can still sign in.
    """
    username_slug = _normalise_username(body.username)
    family_id = body.family_id.strip()

    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Ensure columns exist — this endpoint may be called before any child
        # account is created (which is the other place the migration runs).
        await conn.execute("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pin_hash VARCHAR")
        await conn.execute("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS child_auth_token VARCHAR")
        await conn.execute("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username VARCHAR")

        # Look up by username slug + family_id — no email reconstruction needed.
        row = await conn.fetchrow(
            """
            SELECT up.user_id, up.pin_hash, up.child_auth_token
            FROM user_profiles up
            WHERE up.username = $1
              AND up.family_id = $2
              AND up.role = 'child'
              AND up.status = 'active'
            """,
            username_slug,
            family_id,
        )

        if row is None:
            # Generic error — don't reveal whether the account exists.
            raise HTTPException(status_code=401, detail="Invalid credentials")

        pin_hash: str | None = row["pin_hash"]
        auth_token: str | None = row["child_auth_token"]
        user_id: str = row["user_id"]

        # Reconstruct the virtual email for the Neon Auth sign-in call.
        virtual_email = f"{username_slug}.{family_id}@allowanceflow.app"

        if not pin_hash or not auth_token:
            # Backward compat: account was created before the new flow where PIN
            # was used directly as the Better Auth password.  Pass the PIN through
            # as the auth_token so the frontend can still complete sign-in.
            # Wrong PINs will be rejected by Neon Auth itself.
            return ChildSignInResponse(virtual_email=virtual_email, auth_token=body.pin)

        if not _verify_pin(body.pin, pin_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return ChildSignInResponse(virtual_email=virtual_email, auth_token=auth_token)
    finally:
        await conn.close()
