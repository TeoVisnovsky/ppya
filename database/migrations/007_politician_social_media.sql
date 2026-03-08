ALTER TABLE politicians
ADD COLUMN IF NOT EXISTS instagram TEXT,
ADD COLUMN IF NOT EXISTS facebook TEXT,
ADD COLUMN IF NOT EXISTS twitter TEXT,
ADD COLUMN IF NOT EXISTS social_media_searched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_politicians_instagram
  ON politicians (instagram);

CREATE INDEX IF NOT EXISTS idx_politicians_facebook
  ON politicians (facebook);

CREATE INDEX IF NOT EXISTS idx_politicians_twitter
  ON politicians (twitter);
