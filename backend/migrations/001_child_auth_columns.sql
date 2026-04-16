-- Migration 001: Add child-auth columns to user_profiles
-- Run this once in your Railway / Neon SQL console.
--
--   Railway:  Dashboard → your PostgreSQL service → Data tab → SQL Editor
--   Neon:     Dashboard → your project → SQL Editor
--
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS), so re-running is safe.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pin_hash          VARCHAR;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS child_auth_token  VARCHAR;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username          VARCHAR;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS neon_email        VARCHAR;

-- Optional index: speeds up the child sign-in lookup (username + family_id).
CREATE INDEX IF NOT EXISTS idx_user_profiles_username
    ON user_profiles (username, family_id)
    WHERE username IS NOT NULL;
