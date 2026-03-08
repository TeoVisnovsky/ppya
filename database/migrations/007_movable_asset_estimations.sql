CREATE TABLE IF NOT EXISTS declaration_movable_asset_estimations (
  id BIGSERIAL PRIMARY KEY,
  movable_asset_id BIGINT NOT NULL REFERENCES declaration_movable_assets(id) ON DELETE CASCADE,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  raw_item_text TEXT NOT NULL,
  asset_type TEXT,
  brand_or_maker TEXT,
  year_of_manufacture INT,
  llm_estimated_price_eur NUMERIC(12, 2),
  final_price_eur NUMERIC(12, 2) NOT NULL,
  estimation_source TEXT NOT NULL,
  confidence NUMERIC(4, 3),
  applied_rule TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (movable_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_movable_asset_estimations_declaration_id
  ON declaration_movable_asset_estimations (declaration_id);
