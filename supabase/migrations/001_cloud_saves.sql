-- =============================================================================
-- AFL Manager – Cloud Saves
-- Run this in the Supabase SQL editor for project:
--   https://supabase.com/dashboard/project/ghufqvsfunmavmgwcxaz
-- =============================================================================

-- ---------------------------------------------------------------------------
-- cloud_saves
-- One row per save-slot per user.  The full serialised GameState is stored in
-- state_json so any device can restore it without ever touching another user's
-- data.  The (user_id, local_save_id) unique constraint means upserts are
-- idempotent – uploading the same save twice is safe.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cloud_saves (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- mirrors SaveSlotMeta fields so we can display metadata without parsing JSON
  local_save_id    TEXT        NOT NULL,
  save_name        TEXT        NOT NULL,
  club_id          TEXT        NOT NULL,
  club_name        TEXT        NOT NULL,
  manager_name     TEXT        NOT NULL,
  current_year     INTEGER     NOT NULL,
  current_round    INTEGER     NOT NULL,
  phase            TEXT        NOT NULL,
  version          TEXT        NOT NULL,
  schema_version   INTEGER     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  last_saved       TIMESTAMPTZ NOT NULL,

  -- server-side timestamp of the most recent upload
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- full serialised GameState
  state_json       JSONB       NOT NULL,

  CONSTRAINT cloud_saves_unique_user_save UNIQUE (user_id, local_save_id)
);

-- Index for fast per-user listing
CREATE INDEX IF NOT EXISTS cloud_saves_user_idx ON public.cloud_saves (user_id, last_saved DESC);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Users may only read/write their own rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cloud_saves ENABLE ROW LEVEL SECURITY;

-- Drop and recreate so this script is idempotent
DROP POLICY IF EXISTS "Users can manage own cloud saves" ON public.cloud_saves;

CREATE POLICY "Users can manage own cloud saves"
  ON public.cloud_saves
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
