import asyncio
import os
import pathlib
import json
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import init_pool, close_pool

# Load .env files for local development.
# On Railway, env vars are injected directly so python-dotenv is optional.
try:
    from dotenv import load_dotenv
    load_dotenv(".env")
    environment = os.getenv("ENV", "dev")
    env_file = f".env.{environment}"
    load_dotenv(env_file, override=True)
except ImportError:
    pass

print(f"Loaded environment: {environment}")

from databutton_app.mw.auth_mw import AuthConfig, get_authorized_user


def get_router_config() -> dict:
    try:
        # Note: This file is not available to the agent
        cfg = json.loads(open("routers.json").read())
    except:
        return False
    return cfg


def is_auth_disabled(router_config: dict, name: str) -> bool:
    return router_config["routers"][name]["disableAuth"]


def import_api_routers() -> APIRouter:
    """Create top level router including all user defined endpoints."""
    routes = APIRouter(prefix="/api")

    router_config = get_router_config()

    src_path = pathlib.Path(__file__).parent

    # Import API routers from "src/app/apis/*/__init__.py"
    apis_path = src_path / "app" / "apis"

    api_names = [
        p.relative_to(apis_path).parent.as_posix()
        for p in apis_path.glob("*/__init__.py")
    ]

    api_module_prefix = "app.apis."

    for name in api_names:
        print(f"Importing API: {name}")
        try:
            api_module = __import__(api_module_prefix + name, fromlist=[name])
            api_router = getattr(api_module, "router", None)
            if isinstance(api_router, APIRouter):
                routes.include_router(
                    api_router,
                    dependencies=(
                        []
                        if is_auth_disabled(router_config, name)
                        else [Depends(get_authorized_user)]
                    ),
                )
        except Exception as e:
            print(e)
            continue

    print(routes.routes)

    return routes


def parse_auth_configs() -> list[AuthConfig]:
    """Parse auth configs from Neon Auth (Better Auth) env vars."""
    auth_configs: list[AuthConfig] = []

    # Strip whitespace/leading = that Railway may inject
    raw_jwks = os.environ.get("NEON_AUTH_JWKS_URL", "")
    raw_issuer = os.environ.get("NEON_AUTH_ISSUER", "")
    jwks_url = raw_jwks.strip().lstrip("=").strip().rstrip("/")
    issuer = raw_issuer.strip().lstrip("=").strip().rstrip("/")

    print(f"[auth-config] NEON_AUTH_ISSUER={issuer!r}")
    print(f"[auth-config] NEON_AUTH_JWKS_URL={jwks_url!r}")

    # Auto-derive JWKS URL from issuer when not explicitly set
    # Better Auth exposes JWKS at <issuer>/jwks (no .json suffix)
    if issuer and not jwks_url:
        jwks_url = f"{issuer}/jwks"
        print(f"[auth-config] Auto-derived JWKS URL: {jwks_url!r}")

    if issuer:
        # Try both the configured/derived URL and the well-known fallback
        candidates: list[str] = []
        if jwks_url:
            candidates.append(jwks_url)
        # Also try common Better Auth JWKS paths as fallbacks
        for suffix in ("/jwks", "/.well-known/jwks.json", "/api/auth/jwks"):
            candidate = f"{issuer}{suffix}"
            if candidate not in candidates:
                candidates.append(candidate)

        # Use primary URL for config; extras passed as fallbacks
        primary = candidates[0]
        fallbacks = candidates[1:]
        print(f"[auth-config] Using JWKS URL: {primary!r}")
        print(f"[auth-config] Fallback JWKS URLs: {fallbacks!r}")

        auth_configs.append(
            AuthConfig(
                issuer=issuer,
                jwks_url=primary,
                jwks_url_fallbacks=fallbacks,
                audience=None,
            )
        )
    else:
        print("[auth-config] NEON_AUTH_ISSUER not set — JWT validation disabled")

    return auth_configs


async def _recurring_tasks_scheduler():
    """Background task: run the recurring-task automation once per day at 06:00 UTC.

    Importing the handler here avoids circular imports at module load time.
    Each uvicorn worker runs this loop independently, but the idempotency guard
    inside process_recurring_tasks prevents duplicate instance creation.
    """
    from app.apis.recurring_automation import process_recurring_tasks
    while True:
        now = datetime.now(timezone.utc)
        # Next 06:00 UTC — if we are already past today's run time, schedule for tomorrow.
        target = now.replace(hour=6, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        delay = (target - now).total_seconds()
        print(f"[scheduler] Recurring tasks scheduled at {target.isoformat()} (in {delay:.0f}s)")
        await asyncio.sleep(delay)
        try:
            result = await process_recurring_tasks()
            print(f"[scheduler] Recurring tasks done — created {result.tasks_created} instance(s)")
        except Exception as exc:
            print(f"[scheduler] Error running recurring tasks: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    scheduler_task = asyncio.create_task(_recurring_tasks_scheduler())
    yield
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    await close_pool()


def create_app() -> FastAPI:
    """Create the app. This is called by uvicorn with the factory option to construct the app object."""
    app = FastAPI(lifespan=lifespan)

    # Global exception handler: catches unhandled errors so they return JSON.
    #
    # IMPORTANT: @app.exception_handler(Exception) is registered with
    # ServerErrorMiddleware, which sits OUTSIDE CORSMiddleware in the stack:
    #   ServerErrorMiddleware → CORSMiddleware → ExceptionMiddleware → Routes
    # That means the JSONResponse returned here never passes through
    # CORSMiddleware, so we must add CORS headers manually.
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        print(f"[error] Unhandled exception on {request.method} {request.url.path}: {exc}")
        traceback.print_exc()
        # Manually mirror CORS headers so cross-origin callers can read the error.
        origin = request.headers.get("origin", "")
        cors_headers: dict[str, str] = {}
        if origin:
            cors_headers["access-control-allow-origin"] = origin
            cors_headers["access-control-allow-credentials"] = "true"
            cors_headers["vary"] = "Origin"
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "error": str(exc)},
            headers=cors_headers,
        )

    # CORS — allow frontend origin(s)
    allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not allowed_origins:
        if environment == "production":
            raise RuntimeError(
                "ALLOWED_ORIGINS must be set in production. "
                "Example: ALLOWED_ORIGINS=https://your-app.railway.app"
            )
        # Dev/staging: allow all origins for local convenience
        allowed_origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(import_api_routers())

    for route in app.routes:
        if hasattr(route, "methods"):
            for method in route.methods:
                print(f"{method} {route.path}")

    auth_configs = parse_auth_configs()

    if len(auth_configs) == 0:
        print("No auth extensions found")
        app.state.auth_configs = None
    else:
        print(f"Found {len(auth_configs)} auth config(s)")
        app.state.auth_configs = auth_configs

    return app


app = create_app()
