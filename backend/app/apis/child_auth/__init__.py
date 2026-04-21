"""Child authentication API.

Unauthenticated endpoint that validates a child's PIN and returns
the credentials needed for the frontend to complete sign-in via Neon Auth.

This module is intentionally auth-free (disableAuth: true in routers.json)
because the child does not have a JWT yet — they are trying to get one.
"""

import asyncpg
import base64
import hashlib
import hmac
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
        return hmac.compare_digest(dk, expected)
    except Exception as exc:
        print(f"[child-auth] _verify_pin: exception {type(exc).__name__}: {exc}")
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
    # Defensive: strip anything that isn't a digit. The frontend PIN input
    # doesn't filter non-digits, so autofill extensions or virtual keyboards
    # sometimes sneak in whitespace / zero-width chars. Hashing on both sides
    # must see the same bytes.
    raw_pin = body.pin
    pin = re.sub(r"\D", "", raw_pin)
    if raw_pin != pin:
        print(
            f"[child-auth] pin had non-digit chars stripped: "
            f"len_before={len(raw_pin)} len_after={len(pin)} "
            f"codepoints={[ord(c) for c in raw_pin]}"
        )

    try:
        conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    except Exception as exc:
        print(f"[child-auth] DB connect error: {exc}")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    try:
        # Step 1: look up by stored username slug (fast path for accounts created
        # with the new code).  If the column throws (pre-migration) or returns
        # nothing (account created before username was stored), fall through to
        # the name-based fallback in Step 2.
        row = None
        try:
            row = await conn.fetchrow(
                """
                SELECT user_id, pin_hash, child_auth_token, neon_email
                FROM user_profiles
                WHERE username = $1
                  AND family_id = $2
                  AND role = 'child'
                  AND status = 'active'
                """,
                username_slug,
                family_id,
            )
        except Exception as exc:
            print(f"[child-auth] username lookup error: {exc}")

        # Step 2: if not found by username (NULL username = account predates the
        # column, or column is missing), fetch all children in the family and
        # match by normalising the stored display name in Python.  This handles
        # ØÆÅ correctly regardless of how/when the username column was populated.
        if row is None:
            try:
                children = await conn.fetch(
                    """
                    SELECT user_id, name, pin_hash, child_auth_token, neon_email
                    FROM user_profiles
                    WHERE family_id = $1 AND role = 'child' AND status = 'active'
                    """,
                    family_id,
                )
            except Exception:
                # Columns don't exist yet (pre-migration) — fetch base schema only.
                try:
                    children = await conn.fetch(
                        """
                        SELECT user_id, name,
                               NULL::text AS pin_hash,
                               NULL::text AS child_auth_token,
                               NULL::text AS neon_email
                        FROM user_profiles
                        WHERE family_id = $1 AND role = 'child' AND status = 'active'
                        """,
                        family_id,
                    )
                except Exception as exc2:
                    print(f"[child-auth] fallback query failed: {exc2}")
                    raise HTTPException(status_code=503, detail="Service temporarily unavailable")

            row = next(
                (c for c in children if _normalise_username(c["name"] or "") == username_slug),
                None,
            )

        if row is None:
            print(
                f"[child-auth] no match: username_slug={username_slug!r} "
                f"family_id={family_id!r}"
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        pin_hash: str | None = row["pin_hash"]
        auth_token: str | None = row["child_auth_token"]
        # neon_email is the permanent email registered in Neon Auth.
        # It never changes even when the family ID is renamed.
        # Fall back to reconstructing it for legacy accounts that predate this column.
        neon_email: str = row["neon_email"] or f"{username_slug}.{family_id}@allowanceflow.app"

        if not pin_hash or not auth_token:
            # Backward compat: account created before the pin_hash flow; the PIN
            # was used directly as the Better Auth password.
            return ChildSignInResponse(virtual_email=neon_email, auth_token=pin)

        if not _verify_pin(pin, pin_hash):
            print(
                f"[child-auth] PIN mismatch for username={username_slug!r} "
                f"family_id={family_id!r} user_id={row['user_id']!r} "
                f"received_len={len(pin)} received_codepoints={[ord(c) for c in pin]} "
                f"stored_hash_len={len(pin_hash)} stored_hash_prefix={pin_hash[:24]!r}"
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return ChildSignInResponse(virtual_email=neon_email, auth_token=auth_token)
    finally:
        await conn.close()
