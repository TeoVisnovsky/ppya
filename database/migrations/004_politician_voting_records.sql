CREATE TABLE IF NOT EXISTS politician_voting_page_snapshots (
  id BIGSERIAL PRIMARY KEY,
  politician_id BIGINT REFERENCES politicians(id) ON DELETE SET NULL,
  cis_obdobia INT NOT NULL,
  cis_schodze INT NOT NULL DEFAULT 0,
  poslanec_master_id BIGINT NOT NULL,
  source_politician_name TEXT NOT NULL,
  page_number INT NOT NULL,
  source_url TEXT NOT NULL,
  result_table_html TEXT NOT NULL,
  raw_page_html TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cis_obdobia, cis_schodze, poslanec_master_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_politician_voting_page_snapshots_politician_id
  ON politician_voting_page_snapshots (politician_id);

CREATE INDEX IF NOT EXISTS idx_politician_voting_page_snapshots_source
  ON politician_voting_page_snapshots (cis_obdobia, cis_schodze, poslanec_master_id, page_number);

CREATE TABLE IF NOT EXISTS politician_voting_records (
  id BIGSERIAL PRIMARY KEY,
  politician_id BIGINT REFERENCES politicians(id) ON DELETE SET NULL,
  page_snapshot_id BIGINT NOT NULL REFERENCES politician_voting_page_snapshots(id) ON DELETE CASCADE,
  cis_obdobia INT NOT NULL,
  cis_schodze INT NOT NULL DEFAULT 0,
  poslanec_master_id BIGINT NOT NULL,
  source_politician_name TEXT NOT NULL,
  page_number INT NOT NULL,
  schodza_number TEXT,
  vote_date_text TEXT,
  detail_vote_id BIGINT,
  vote_number TEXT,
  cpt_text TEXT,
  vote_title TEXT NOT NULL,
  voted_as TEXT,
  detail_url TEXT,
  cpt_url TEXT,
  row_hash TEXT NOT NULL,
  row_html TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_snapshot_id, row_hash)
);

CREATE INDEX IF NOT EXISTS idx_politician_voting_records_politician_id
  ON politician_voting_records (politician_id);

CREATE INDEX IF NOT EXISTS idx_politician_voting_records_detail_vote_id
  ON politician_voting_records (detail_vote_id);

CREATE INDEX IF NOT EXISTS idx_politician_voting_records_source
  ON politician_voting_records (cis_obdobia, cis_schodze, poslanec_master_id, page_number);