import functools
import json
import os
from http import HTTPStatus
from typing import Annotated, Any, Callable

import jwt
from fastapi import Depends, HTTPException, WebSocket, WebSocketException, status
from fastapi.datastructures import URL
from fastapi.requests import HTTPConnection
from jwt import PyJWKClient
from pydantic import BaseModel
from starlette.requests import Request

from ..extensions.auth import AuthConfig
from ..parsing import parse_dict
from ..state import databutton_app_state

# https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library


class User(BaseModel):
    # The subject, or user ID, from the authenticated token
    sub: str

    # Optional extra user data
    user_id: str | None = None
    name: str | None = None
    picture: str | None = None
    email: str | None = None


def get_auth_configs(request: HTTPConnection) -> list[AuthConfig]:
    auth_configs: list[AuthConfig] = (
        getattr(request.app.state.databutton_app_state, "auth_configs", None) or []
    )
    return auth_configs


AuthConfigsDep = Annotated[list[AuthConfig], Depends(get_auth_configs)]


def get_audit_log(request: HTTPConnection) -> Callable[[str], None] | None:
    return getattr(request.app.state.databutton_app_state, "audit_log", None)


AuditLogDep = Annotated[Callable[[str], None] | None, Depends(get_audit_log)]


def get_authorized_user(
    request: HTTPConnection,
    auth_configs: AuthConfigsDep,
    audit_log: AuditLogDep,
) -> User:
    try:
        if isinstance(request, WebSocket):
            user = authorize_websocket(request, auth_configs, audit_log)
        elif isinstance(request, Request):
            user = authorize_request(request, auth_configs, audit_log)
        else:
            raise ValueError("Unexpected request type")

        if user is not None:
            return user
        if audit_log:
            audit_log("Request authentication returned no user")
    except Exception as e:
        if audit_log:
            audit_log(f"Request authentication failed: {e}")

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
    # TODO: We may want to cache keys on disk to survive hotreloads
    return PyJWKClient(url, cache_keys=True)


def get_signing_key(url: str, token: str) -> tuple[str, str]:
    client = get_jwks_client(url)
    signing_key = client.get_signing_key_from_jwt(token)
    key = signing_key.key
    alg = signing_key.algorithm_name
    if alg not in ("RS256", "ES256"):
        raise ValueError(f"Unsupported signing algorithm: {alg}")
    return (key, alg)


def validate_token(
    token: str,
    expected_audience: str,
    auth_config: AuthConfig,
    options: dict[str, Any] | None,
    audit_log: Callable[[str], None] | None,
) -> dict[str, Any] | None:
    try:
        key, alg = get_signing_key(auth_config.jwks_url, token)
    except Exception as e:
        if audit_log:
            audit_log(f"Failed to get signing key {e}")
        return None

    try:
        payload = jwt.decode(
            token,
            key=key,
            algorithms=[alg],
            audience=expected_audience,
            options=options,
        )
    except jwt.PyJWTError as e:
        if audit_log:
            audit_log(f"Failed to decode and validate token {e}")
        return None

    if "sub" not in payload:
        if audit_log:
            audit_log("Missing sub in token payload")
        return None

    # Optional sub check
    if auth_config.sub and payload.get("sub") != auth_config.sub:
        if audit_log:
            audit_log(
                f"Sub mismatch in token payload {payload.get('sub')} != {auth_config.sub}"
            )
        return None

    # Optional email check
    if auth_config.email and not (
        payload.get("email_verified") and payload.get("email") == auth_config.email
    ):
        if audit_log:
            audit_log(
                f"Email mismatch in token payload {payload.get('email')} != {auth_config.email}"
            )
        return None

    # Optional sub override used for giving scheduler a fixed and intuitive sub from user code
    if auth_config.present_as_sub:
        payload["sub"] = auth_config.present_as_sub
        payload["user_id"] = auth_config.present_as_sub

    return payload


def determine_expected_audience(
    token_aud: str | None, auth_cfg: AuthConfig, url: URL
) -> str | None:
    if not token_aud:
        return None

    audiences: tuple[str, ...] = (
        (auth_cfg.audience,) if auth_cfg.audience is not None else auth_cfg.audiences
    )

    if token_aud in audiences:
        return token_aud

    for aud_templ in audiences:
        if token_aud == aud_templ.replace("{path}", url.path):
            return token_aud

    return None


def authorize_token(
    token: str,
    url: URL,
    auth_configs: list[AuthConfig],
    audit_log: Callable[[str], None] | None,
    options: dict[str, Any] | None,
) -> User | None:
    # Partially parse token without verification
    unverified_payload = jwt.decode(
        token,
        options={
            "verify_signature": False,
            "verify_aud": False,
            "verify_iss": False,
        },
    )
    token_aud: str | None = unverified_payload.get("aud")
    token_iss: str | None = unverified_payload.get("iss")

    for auth_cfg in auth_configs:
        if token_iss != auth_cfg.issuer:
            continue

        expected_audience = determine_expected_audience(token_aud, auth_cfg, url)
        if not expected_audience:
            if audit_log:
                audit_log(
                    f"Auth audience mismatch path={url.path} iss={token_iss} aud={token_aud}"
                )
            continue

        payload = validate_token(token, expected_audience, auth_cfg, options, audit_log)
        if payload is None:
            continue

        try:
            user = parse_dict(payload, User)
            if audit_log:
                audit_log(f"User {user.sub} authenticated")
            return user
        except Exception as e:
            if audit_log:
                audit_log(f"Failed to parse token payload {e}")
            return None

    if audit_log:
        audit_log("Failed to validate authorization token")
    return None


def insecure_auth_options_for_dev(request: Request) -> dict[str, Any] | None:
    """Configure auth options for doing only partial JWT verification for development testing.

    Requests can set one or more of these query parameters to bypass auth:
      ?verify_signature=false
      ?verify_aud=false
      ?verify_exp=false

    IT IS REALLY IMPORTANT THAT WE DON'T ENABLE THIS IN PRODUCTION!
    """
    # This should only run when explicitly enabled
    if os.environ.get("INSECURE_AUTH_BYPASS_ENABLED") != "true":
        raise RuntimeError("Insecure auth options are not enabled")
    # This should never run in production
    if os.environ.get("ENVIRONMENT") != "development":
        raise RuntimeError("Accidentally enabled insecure auth options in production?")
    # This should never run in deployed apps
    if os.environ.get("DATABUTTON_SERVICE_TYPE") != "devx":
        return None

    options: dict[str, Any] = {}

    if "disable-verify" in request.url.query:
        options["verify_signature"] = False

    if "disable-aud" in request.url.query:
        options["verify_aud"] = False

    if "disable-exp" in request.url.query:
        options["verify_exp"] = False

    if len(options) == 0:
        return None

    print(f"ENABLED INSECURE AUTH OPTIONS FOR DEBUGGING {json.dumps(options)}")

    return options


def authorize_websocket(
    request: WebSocket,
    auth_configs: list[AuthConfig],
    audit_log: Callable[[str], None] | None,
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
        if audit_log:
            audit_log(f"Missing bearer {prefix}.<token> in protocols")
        return None

    options = None

    # Can't replace header here
    # request.headers[header] = sep.join(p for p in protocols if not p.startswith(prefix))

    url = request.url

    return authorize_token(token, url, auth_configs, audit_log, options)


def authorize_request(
    request: Request,
    auth_configs: list[AuthConfig],
    audit_log: Callable[[str], None] | None,
) -> User | None:
    cfg = databutton_app_state(request).cfg

    auth_header_name = "Authorization"

    auth_header = request.headers.get(auth_header_name)
    if not auth_header:
        if audit_log:
            audit_log(f'Missing header "{auth_header_name}"')
        return None

    token = auth_header.startswith("Bearer ") and auth_header.removeprefix("Bearer ")
    if not token:
        if audit_log:
            audit_log(f'Missing bearer token in "{auth_header_name}"')
        return None

    in_development = cfg.ENVIRONMENT == "development"
    options = insecure_auth_options_for_dev(request) if in_development else None

    # Short term solution for allowing MCP auth code to bypass the auth system.
    # The INTERNAL_MCP_TOKEN is generated randomly on service startup.
    if (
        cfg.ENABLE_MCP
        and cfg.INTERNAL_MCP_TOKEN
        and token.startswith(cfg.INTERNAL_MCP_TOKEN)
    ):
        mcp_client_id = request.headers.get("X-MCP-Client-Id")
        if audit_log:
            audit_log(f"Internal token accepted for MCP client {mcp_client_id}")
        return User(sub="mcp-client", name=mcp_client_id or None)

    url = request.url

    return authorize_token(token, url, auth_configs, audit_log, options)
