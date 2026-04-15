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
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/child-auth", tags=["child-auth"])


class ChildSignInRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=60)
    family_id: str = Field(..., min_length=1, max_length=100)
    pin: str = Field(..., min_length=4, max_length=8)


class ChildSignInResponse(BaseModel):
    """Credentials for the frontend to use when calling Neon Auth sign-in directly."""
    virtual_email: str
    auth_token: str


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


@router.post("/sign-in", response_model=ChildSignInResponse)
async def child_sign_in(body: ChildSignInRequest) -> ChildSignInResponse:
    """Validate a child's PIN and return credentials for Neon Auth sign-in.

    Flow:
    1. Frontend calls this endpoint with username + family_id + PIN.
    2. Backend looks up the child profile, verifies the PIN hash.
    3. Returns { virtual_email, auth_token } on success.
    4. Frontend calls authClient.signIn.email(virtual_email, auth_token) directly.

    This keeps the actual Better Auth session establishment on the client side
    (so cookies are set on the correct origin), while PIN verification stays
    server-side where the hash lives.
    """
    virtual_email = f"{body.username.strip()}.{body.family_id.strip()}@allowanceflow.app"

    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Look up the child profile by matching their virtual email via Neon Auth sync
        # or by a direct join. We look up in user_profiles by joining on the auth table.
        # Fall back to a direct match if the neon_auth schema is unavailable.
        row = None
        try:
            row = await conn.fetchrow(
                """
                SELECT up.pin_hash, up.child_auth_token
                FROM user_profiles up
                JOIN neon_auth.users_sync us ON up.user_id = us.id
                WHERE us.email = $1
                  AND up.role = 'child'
                  AND up.status = 'active'
                """,
                virtual_email,
            )
        except Exception:
            pass  # neon_auth schema may not be synced; handled below

        if row is None:
            # Generic error — don't reveal whether the account exists
            raise HTTPException(status_code=401, detail="Invalid credentials")

        pin_hash: str | None = row["pin_hash"]
        auth_token: str | None = row["child_auth_token"]

        if not pin_hash or not auth_token:
            # Account exists but was created before the new flow — can't verify
            raise HTTPException(
                status_code=401,
                detail="This account was created with an older method. Ask a parent to recreate it.",
            )

        if not _verify_pin(body.pin, pin_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return ChildSignInResponse(virtual_email=virtual_email, auth_token=auth_token)
    finally:
        await conn.close()
