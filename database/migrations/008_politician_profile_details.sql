ALTER TABLE politicians
ADD COLUMN IF NOT EXISTS deputy_title TEXT,
ADD COLUMN IF NOT EXISTS deputy_first_name TEXT,
ADD COLUMN IF NOT EXISTS deputy_last_name TEXT,
ADD COLUMN IF NOT EXISTS deputy_birth_date DATE,
ADD COLUMN IF NOT EXISTS deputy_birth_date_text TEXT,
ADD COLUMN IF NOT EXISTS deputy_nationality TEXT,
ADD COLUMN IF NOT EXISTS deputy_residence TEXT,
ADD COLUMN IF NOT EXISTS deputy_region TEXT,
ADD COLUMN IF NOT EXISTS deputy_email TEXT,
ADD COLUMN IF NOT EXISTS deputy_website TEXT,
ADD COLUMN IF NOT EXISTS candidate_party_memberships JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deputy_personal_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_politicians_deputy_email
  ON politicians (deputy_email);