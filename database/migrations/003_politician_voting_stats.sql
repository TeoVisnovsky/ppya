CREATE TABLE IF NOT EXISTS politician_voting_stats (
  id BIGSERIAL PRIMARY KEY,
  politician_id BIGINT NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  cis_obdobia INT NOT NULL,
  poslanec_master_id BIGINT NOT NULL,
  source_politician_name TEXT NOT NULL,
  za_count INT NOT NULL DEFAULT 0,
  proti_count INT NOT NULL DEFAULT 0,
  zdrzal_sa_count INT NOT NULL DEFAULT 0,
  nehlasoval_count INT NOT NULL DEFAULT 0,
  nepritomny_count INT NOT NULL DEFAULT 0,
  neplatnych_hlasov_count INT NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (politician_id, cis_obdobia)
);

CREATE INDEX IF NOT EXISTS idx_politician_voting_stats_politician_id
  ON politician_voting_stats (politician_id);

CREATE INDEX IF NOT EXISTS idx_politician_voting_stats_poslanec_period
  ON politician_voting_stats (poslanec_master_id, cis_obdobia);