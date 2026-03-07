CREATE TABLE IF NOT EXISTS politician_voting_transcripts (
  id BIGSERIAL PRIMARY KEY,
  politician_id BIGINT REFERENCES politicians(id) ON DELETE SET NULL,
  cis_obdobia INT NOT NULL,
  cis_schodze INT NOT NULL DEFAULT 0,
  poslanec_master_id BIGINT NOT NULL,
  source_politician_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  page_count INT NOT NULL DEFAULT 0,
  record_count INT NOT NULL DEFAULT 0,
  za_count INT NOT NULL DEFAULT 0,
  proti_count INT NOT NULL DEFAULT 0,
  zdrzal_sa_count INT NOT NULL DEFAULT 0,
  nehlasoval_count INT NOT NULL DEFAULT 0,
  nepritomny_count INT NOT NULL DEFAULT 0,
  neplatnych_hlasov_count INT NOT NULL DEFAULT 0,
  transcript_text TEXT NOT NULL DEFAULT '',
  transcript_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cis_obdobia, cis_schodze, poslanec_master_id)
);

CREATE INDEX IF NOT EXISTS idx_politician_voting_transcripts_politician_id
  ON politician_voting_transcripts (politician_id);

CREATE INDEX IF NOT EXISTS idx_politician_voting_transcripts_source
  ON politician_voting_transcripts (cis_obdobia, cis_schodze, poslanec_master_id);