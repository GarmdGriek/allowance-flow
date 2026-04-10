import os
import pathlib
import json
import dotenv
from fastapi import FastAPI, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware

# Load environment files
# First load shared .env file
dotenv.load_dotenv(".env")

# Then load environment-specific file (defaults to dev)
# Environment-specific values will override shared values
environment = os.getenv("ENV", "dev")
env_file = f".env.{environment}"
dotenv.load_dotenv(env_file, override=True)

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

    jwks_url = os.environ.get("NEON_AUTH_JWKS_URL", "")
    issuer = os.environ.get("NEON_AUTH_ISSUER", "")

    if jwks_url and issuer:
        auth_configs.append(
            AuthConfig(
                issuer=issuer,
                jwks_url=jwks_url,
                audience=None,
            )
        )

    return auth_configs


def create_app() -> FastAPI:
    """Create the app. This is called by uvicorn with the factory option to construct the app object."""
    app = FastAPI()

    # CORS — allow frontend origin(s)
    allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not allowed_origins:
        # Default: allow all (safe fallback for dev; set ALLOWED_ORIGINS in prod)
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
