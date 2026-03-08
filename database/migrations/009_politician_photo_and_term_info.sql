ALTER TABLE politicians
ADD COLUMN IF NOT EXISTS deputy_photo_url TEXT,
ADD COLUMN IF NOT EXISTS deputy_photo_content_type TEXT,
ADD COLUMN IF NOT EXISTS deputy_photo_data BYTEA,
ADD COLUMN IF NOT EXISTS deputy_photo_scraped_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deputy_term_info JSONB NOT NULL DEFAULT '{}'::jsonb;