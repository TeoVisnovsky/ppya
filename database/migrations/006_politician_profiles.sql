ALTER TABLE politicians
ADD COLUMN IF NOT EXISTS deputy_profile_id BIGINT,
ADD COLUMN IF NOT EXISTS deputy_profile_period INT,
ADD COLUMN IF NOT EXISTS deputy_profile_url TEXT,
ADD COLUMN IF NOT EXISTS candidate_party TEXT,
ADD COLUMN IF NOT EXISTS parliamentary_club TEXT,
ADD COLUMN IF NOT EXISTS parliamentary_memberships JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deputy_profile_scraped_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_politicians_deputy_profile_id
  ON politicians (deputy_profile_id);