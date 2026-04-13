import functools
import os
from http import HTTPStatus
from typing import Annotated, Callable

import httpx
import jwt
from fastapi import Depends, HTTPException, WebSocket, WebSocketException, status
from fastapi.requests import HTTPConnection
from jwt import PyJWKClient
from pydantic import BaseModel
from starlette.requests import Request


class AuthConfig(BaseModel):
    issuer: str
    jwks_url: str
    # Additional JWKS URLs to try if the primary fails (auto-derived fallbacks)
    jwks_url_fallbacks: list[str] = []
    audience: str | None = None
    audiences: tuple[str, ...] = ()


class User(BaseModel):
    # The subject, or user ID, from the authenticated token
    sub: str

    # Optional extra user data
    user_id: str | None = None
    name: str | None = None
    picture: str | None = None
    email: str | None = None


def get_auth_configs(request: HTTPConnection) -> list[AuthConfig]:
    """Return auth configs — empty list is allowed (Neon session auth doesn't need JWKS)."""
    auth_configs: list[AuthConfig] | None = request.app.state.auth_configs
    return auth_configs or []


AuthConfigsDep = Annotated[list[AuthConfig], Depends(get_auth_configs)]


async def get_authorized_user(
    request: HTTPConnection,
    auth_configs: AuthConfigsDep,
) -> User:
    try:
        if isinstance(request, WebSocket):
            user = authorize_websocket(request, auth_configs)
        elif isinstance(request, Request):
            user = await authorize_request(request, auth_configs)
        else:
            raise ValueError("Unexpected request type")

        if user is not None:
            return user
        print("[auth] Request authentication returned no user")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[auth] Request authentication failed: {e}")

    if isinstance(request, WebSocket):
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION, reason="Not authenticated"
        )
    else:
        raise HTTPException(
            status_code=HTTPStatus.UNAUTHORIZED, detail="Not authenticated"
        )


AuthorizedUser = Annotated[User, Depends(get_authorized_user)]


@functools.cache
def get_jwks_client(url: str):
    """Reuse client cached by its url, client caches keys by default."""
    return PyJWKClient(url, cache_keys=True)


def get_signing_key(url: str, token: str) -> tuple[str, str]:
    client = get_jwks_client(url)
    signing_key = client.get_signing_key_from_jwt(token)
    key = signing_key.key
    alg = signing_key.algorithm_name
    if alg not in ("RS256", "ES256", "EdDSA"):
        raise ValueError(f"Unsupported signing algorithm: {alg}")
    return (key, alg)


def authorize_websocket(
    request: WebSocket,
    auth_configs: list[AuthConfig],
) -> User | None:
    # Parse Sec-Websocket-Protocol
    header = "Sec-Websocket-Protocol"
    sep = ","
    prefix = "Authorization.Bearer."
    protocols_header = request.headers.get(header)
    protocols = (
        [h.strip() for h in protocols_header.split(sep)] if protocols_header else []
    )

    token: str | None = None
    for p in protocols:
        if p.startswith(prefix):
            token = p.removeprefix(prefix)
            break

    if not token:
        print(f"[auth] Missing bearer {prefix}.<token> in protocols")
        return None

    return authorize_token_jwt(token, auth_configs)


async def authorize_request(
    request: Request,
    auth_configs: list[AuthConfig],
) -> User | None:
    auth_header = request.headers.get("authorization")
    if not auth_header:
        print("[auth] Missing header 'authorization'")
        return None

    token = auth_header.startswith("Bearer ") and auth_header.removeprefix("Bearer ")
    if not token:
        print("[auth] Missing bearer token in 'authorization'")
        return None

    # Try JWT validation first (only if we have JWKS-based auth configs)
    if auth_configs:
        try:
            user = authorize_token_jwt(token, auth_configs)
            if user is not None:
                return user
        except Exception as e:
            print(f"[auth] JWT validation skipped (opaque token?): {e}")

    # Fallback: validate opaque session token via Neon Auth session endpoint
    # Strip whitespace, tabs, and any leading = that Railway might inject
    raw = os.environ.get("NEON_AUTH_ISSUER", "")
    neon_auth_url = raw.strip().lstrip("=").strip().rstrip("/")
    print(f"[auth] neon_auth_url={neon_auth_url!r} token_prefix={token[:8]!r}")
    if neon_auth_url:
        user = await validate_neon_session(token, neon_auth_url)
        if user is not None:
            print(f"[auth] User {user.sub} authenticated via Neon Auth session")
            return user
        else:
            print("[auth] Neon Auth session validation returned no user")
    else:
        print("[auth] NEON_AUTH_ISSUER not set, skipping session validation")

    return None


async def validate_neon_session(token: str, neon_auth_url: str) -> User | None:
    """Try all known ways Better Auth accepts a session token for server-side validation."""
    url = f"{neon_auth_url}/get-session"
    attempts = [
        ("x-session-token", {"x-session-token": token, "Accept": "application/json"}),
        ("cookie",          {"Cookie": f"better-auth.session_token={token}", "Accept": "application/json"}),
        ("bearer",          {"Authorization": f"Bearer {token}", "Accept": "application/json"}),
    ]
    async with httpx.AsyncClient(timeout=5.0) as client:
        for method_name, headers in attempts:
            try:
                response = await client.get(url, headers=headers)
                print(f"[auth] {method_name}: status={response.status_code} body={response.text[:300]!r}")
                if response.status_code == 200 and response.text not in ("null", "", "null\n"):
                    data = response.json()
                    if data and isinstance(data, dict):
                        user_data = data.get("user") or {}
                        user_id = user_data.get("id")
                        if user_id:
                            print(f"[auth] {method_name} succeeded! user_id={user_id}")
                            return User(
                                sub=user_id,
                                user_id=user_id,
                                name=user_data.get("name"),
                                email=user_data.get("email"),
                            )
                        else:
                            print(f"[auth] {method_name} data={data}")
            except Exception as e:
                print(f"[auth] {method_name} error: {e}")
    print(f"[auth] all methods failed for token {token[:8]}...")
    return None


def authorize_token_jwt(
    token: str,
    auth_configs: list[AuthConfig],
) -> User | None:
    # Partially parse token without verification — raises DecodeError for opaque tokens
    try:
        unverified_header = jwt.get_unverified_header(token)
        unverified_payload = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_iss": False,
            },
        )
    except Exception as e:
        print(f"[auth] Failed to decode token header/payload (not a JWT?): {e}")
        return None

    token_iss: str | None = unverified_payload.get("iss")
    token_kid: str | None = unverified_header.get("kid")
    token_alg: str | None = unverified_header.get("alg")
    print(f"[auth] JWT header: alg={token_alg!r} kid={token_kid!r} iss={token_iss!r}")

    for auth_config in auth_configs:
        # Skip if issuer is present and doesn't match (allow missing iss — Neon Auth omits it)
        if token_iss is not None and token_iss != auth_config.issuer:
            print(f"[auth] Issuer mismatch: token has {token_iss!r}, config has {auth_config.issuer!r}")
            continue

        # Try primary JWKS URL, then fallbacks
        all_jwks_urls = [auth_config.jwks_url] + auth_config.jwks_url_fallbacks
        key, alg = None, None
        for jwks_url in all_jwks_urls:
            try:
                key, alg = get_signing_key(jwks_url, token)
                print(f"[auth] Got signing key from {jwks_url!r} alg={alg!r}")
                break
            except Exception as e:
                print(f"[auth] Failed to get signing key from {jwks_url!r}: {e}")

        if key is None:
            print(f"[auth] Could not find signing key in any JWKS URL for kid={token_kid!r}")
            continue

        try:
            payload = jwt.decode(
                token,
                key=key,
                algorithms=[alg],
                options={"verify_aud": False},  # Neon Auth JWTs may omit aud
            )
        except jwt.PyJWTError as e:
            print(f"[auth] Failed to decode and validate token: {e}")
            continue

        # Extract user ID — Better Auth uses 'sub'; fall back to 'id' or 'userId'
        user_id = payload.get("sub") or payload.get("id") or payload.get("userId")
        if not user_id:
            print(f"[auth] JWT payload has no sub/id/userId: {list(payload.keys())}")
            continue

        user = User(
            sub=user_id,
            user_id=user_id,
            name=payload.get("name"),
            email=payload.get("email"),
        )
        print(f"[auth] User {user.sub} authenticated via JWT (alg={alg})")
        return user

    print("[auth] Failed to validate authorization token with any auth config")
    return None
