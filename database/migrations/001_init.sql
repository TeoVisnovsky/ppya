DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pgvector extension is not available, continuing without vector support';
  END;
END
$$;

CREATE TABLE IF NOT EXISTS politicians (
  id BIGSERIAL PRIMARY KEY,
  nrsr_user_id TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS declarations (
  id BIGSERIAL PRIMARY KEY,
  politician_id BIGINT NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  internal_number TEXT,
  declaration_identifier TEXT,
  declarant_title_name TEXT,
  declaration_year INT,
  submitted_when TEXT,
  public_function TEXT,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (politician_id, declaration_year, declaration_identifier)
);

CREATE TABLE IF NOT EXISTS declaration_income (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  income_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id)
);

CREATE TABLE IF NOT EXISTS declaration_incompatibility_conditions (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id)
);

CREATE TABLE IF NOT EXISTS declaration_employment (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_business_activities (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_public_functions_during_term (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_real_estate (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_movable_assets (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_property_rights (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_liabilities (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_usage_real_estate (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_usage_movable_assets (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_gifts_or_benefits (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS declaration_voting (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (declaration_id, item_hash)
);

CREATE TABLE IF NOT EXISTS searchable_chunks (
  id BIGSERIAL PRIMARY KEY,
  declaration_id BIGINT NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_row_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_declarations_politician_year
  ON declarations (politician_id, declaration_year DESC);

CREATE INDEX IF NOT EXISTS idx_real_estate_declaration_id
  ON declaration_real_estate (declaration_id);

CREATE INDEX IF NOT EXISTS idx_searchable_chunks_declaration_id
  ON searchable_chunks (declaration_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    BEGIN
      ALTER TABLE searchable_chunks
      ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
    EXCEPTION
      WHEN duplicate_column THEN
        NULL;
    END;

    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_searchable_chunks_embedding
      ON searchable_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    ';
  END IF;
END
$$;
