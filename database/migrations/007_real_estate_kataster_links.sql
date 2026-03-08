CREATE TABLE IF NOT EXISTS declaration_real_estate_kataster_links (
  id BIGSERIAL PRIMARY KEY,
  real_estate_id BIGINT NOT NULL REFERENCES declaration_real_estate(id) ON DELETE CASCADE,
  cadastral_area_text TEXT,
  cadastral_area_normalized TEXT,
  matched_display_name TEXT,
  cadastral_unit_code TEXT,
  land_register_number TEXT,
  public_pdf_url TEXT,
  match_status TEXT NOT NULL DEFAULT 'ok',
  is_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_real_estate_kataster_links_real_estate_id
  ON declaration_real_estate_kataster_links (real_estate_id);

CREATE INDEX IF NOT EXISTS idx_real_estate_kataster_links_status
  ON declaration_real_estate_kataster_links (match_status);

CREATE INDEX IF NOT EXISTS idx_real_estate_kataster_links_area_lv
  ON declaration_real_estate_kataster_links (cadastral_area_normalized, land_register_number);