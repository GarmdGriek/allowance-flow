# Claude Instructions for allowance-flow

## Git Workflow — ALWAYS follow this

1. **Never commit directly to `main`.** The `main` branch is protected.
2. **Before starting any work**, create a feature branch:
   ```
   git checkout -b fix/short-description
   # or
   git checkout -b feat/short-description
   ```
3. **Commit changes** to the feature branch with clear messages.
4. **Push the branch** and open a PR into `main` when the work is done:
   ```
   git push -u origin <branch-name>
   gh pr create ...
   ```
5. **Report the PR URL** wrapped in `<pr-created>` tags.

## Branch naming

- `fix/` — bug fixes (e.g. `fix/child-nav-visibility`)
- `feat/` — new features (e.g. `feat/recurring-tasks`)
- `chore/` — maintenance, deps, config (e.g. `chore/railway-build-cmd`)

## Project layout

- `frontend/` — React + TypeScript + Vite (deployed to Railway)
- `backend/` — Python FastAPI (deployed to Railway)
- `backend/app/apis/` — API route modules
- `frontend/src/pages/` — Page components
- `frontend/src/components/` — Reusable components
- `frontend/src/utils/i18n.ts` — All translations (English + Norwegian)

## Deployment

Both frontend and backend auto-deploy from `main` via Railway on merge.
Railway env vars that must be set on the **backend** service:
- `NEON_AUTH_ISSUER` — Neon Auth base URL (includes `/neondb/auth`)
- `NEON_AUTH_JWKS_URL` — JWKS endpoint for JWT verification
- `DATABASE_URL` — Neon PostgreSQL connection string

## Key conventions

- Translation keys live in `frontend/src/utils/i18n.ts` for both `en` and `nb`
- Always add translation keys to **both** languages when adding new UI text
- Child accounts have `null` email (PIN-only); parent accounts have real emails
- Virtual child emails end in `.local` (legacy — prefer null-email check)
