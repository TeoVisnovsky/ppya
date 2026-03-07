import crypto from "node:crypto";
import { pool } from "./pool.js";

const CATEGORY_TABLES = {
  employment: "declaration_employment",
  businessActivities: "declaration_business_activities",
  publicFunctionsDuringTerm: "declaration_public_functions_during_term",
  realEstate: "declaration_real_estate",
  movableAssets: "declaration_movable_assets",
  propertyRights: "declaration_property_rights",
  liabilities: "declaration_liabilities",
  usageRealEstate: "declaration_usage_real_estate",
  usageMovableAssets: "declaration_usage_movable_assets",
  giftsOrBenefits: "declaration_gifts_or_benefits",
  voting: "declaration_voting",
};

const CATEGORY_LABELS = {
  employment: "Zamestnanie",
  businessActivities: "Podnikateľská činnosť",
  publicFunctionsDuringTerm: "Funkcie počas výkonu verejnej funkcie",
  realEstate: "Vlastníctvo nehnuteľnej veci",
  movableAssets: "Vlastníctvo hnuteľnej veci",
  propertyRights: "Majetkové práva a iné majetkové hodnoty",
  liabilities: "Záväzky",
  usageRealEstate: "Užívanie cudzej nehnuteľnosti",
  usageMovableAssets: "Užívanie cudzej hnuteľnej veci",
  giftsOrBenefits: "Dary alebo iné výhody",
  voting: "Hlasovanie",
};

function stableHash(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function upsertPolitician(client, { userId, fullName }) {
  const result = await client.query(
    `
      INSERT INTO politicians (nrsr_user_id, full_name)
      VALUES ($1, $2)
      ON CONFLICT (nrsr_user_id)
      DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, politicians.full_name), updated_at = NOW()
      RETURNING id
    `,
    [userId, fullName || null],
  );
  return result.rows[0].id;
}

async function upsertDeclaration(client, politicianId, declaration) {
  const result = await client.query(
    `
      INSERT INTO declarations (
        politician_id, internal_number, declaration_identifier, declarant_title_name,
        declaration_year, submitted_when, public_function, source_url, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (politician_id, declaration_year, declaration_identifier)
      DO UPDATE SET
        internal_number = EXCLUDED.internal_number,
        declarant_title_name = EXCLUDED.declarant_title_name,
        submitted_when = EXCLUDED.submitted_when,
        public_function = EXCLUDED.public_function,
        source_url = EXCLUDED.source_url,
        raw_payload = EXCLUDED.raw_payload,
        scraped_at = NOW()
      RETURNING id
    `,
    [
      politicianId,
      declaration.internalNumber || null,
      declaration.declarationId || null,
      declaration.titleName || null,
      declaration.year || null,
      declaration.submittedWhen || null,
      declaration.publicFunction || null,
      declaration.sourceUrl,
      JSON.stringify(declaration.raw || {}),
    ],
  );
  return result.rows[0].id;
}

async function upsertSingleRow(client, tableName, declarationId, valueColumn, value) {
  if (!value) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${tableName} (declaration_id, ${valueColumn})
      VALUES ($1, $2)
      ON CONFLICT (declaration_id)
      DO UPDATE SET ${valueColumn} = EXCLUDED.${valueColumn}
    `,
    [declarationId, value],
  );
}

async function upsertIncome(client, declarationId, payload) {
  if (
    !payload.incomeText
    && payload.publicFunctionIncomeAmount == null
    && payload.otherIncomeAmount == null
    && payload.totalIncomeAmount == null
  ) {
    return;
  }

  await client.query(
    `
      INSERT INTO declaration_income (
        declaration_id,
        income_text,
        public_function_income_amount,
        other_income_amount,
        total_income_amount
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (declaration_id)
      DO UPDATE SET
        income_text = EXCLUDED.income_text,
        public_function_income_amount = EXCLUDED.public_function_income_amount,
        other_income_amount = EXCLUDED.other_income_amount,
        total_income_amount = EXCLUDED.total_income_amount
    `,
    [
      declarationId,
      payload.incomeText || null,
      payload.publicFunctionIncomeAmount ?? null,
      payload.otherIncomeAmount ?? null,
      payload.totalIncomeAmount ?? null,
    ],
  );
}

async function replaceCategoryItems(client, tableName, declarationId, items) {
  await client.query(`DELETE FROM ${tableName} WHERE declaration_id = $1`, [declarationId]);

  for (const item of items) {
    const cleaned = item.trim();
    if (!cleaned) {
      continue;
    }

    await client.query(
      `
        INSERT INTO ${tableName} (declaration_id, item_text, item_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (declaration_id, item_hash)
        DO NOTHING
      `,
      [declarationId, cleaned, stableHash(cleaned)],
    );
  }
}

export async function saveDeclaration(payload, dbPool = pool) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");

    const politicianId = await upsertPolitician(client, {
      userId: payload.userId,
      fullName: payload.titleName,
    });

    const declarationId = await upsertDeclaration(client, politicianId, payload);

    await upsertIncome(client, declarationId, payload);
    await upsertSingleRow(
      client,
      "declaration_incompatibility_conditions",
      declarationId,
      "response_text",
      payload.incompatibility || null,
    );

    for (const [key, tableName] of Object.entries(CATEGORY_TABLES)) {
      const items = Array.isArray(payload.categories[key]) ? payload.categories[key] : [];
      await replaceCategoryItems(client, tableName, declarationId, items);
    }

    await client.query("COMMIT");
    return { politicianId, declarationId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listPoliticiansForMatching(dbPool = pool) {
  const result = await dbPool.query(
    `
      SELECT id, nrsr_user_id, full_name
      FROM politicians
      WHERE full_name IS NOT NULL
      ORDER BY id ASC
    `,
  );

  return result.rows;
}

export async function savePoliticianVotingStats(payload, dbPool = pool) {
  const result = await dbPool.query(
    `
      INSERT INTO politician_voting_stats (
        politician_id,
        cis_obdobia,
        poslanec_master_id,
        source_politician_name,
        za_count,
        proti_count,
        zdrzal_sa_count,
        nehlasoval_count,
        nepritomny_count,
        neplatnych_hlasov_count,
        source_url,
        scraped_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (politician_id, cis_obdobia)
      DO UPDATE SET
        poslanec_master_id = EXCLUDED.poslanec_master_id,
        source_politician_name = EXCLUDED.source_politician_name,
        za_count = EXCLUDED.za_count,
        proti_count = EXCLUDED.proti_count,
        zdrzal_sa_count = EXCLUDED.zdrzal_sa_count,
        nehlasoval_count = EXCLUDED.nehlasoval_count,
        nepritomny_count = EXCLUDED.nepritomny_count,
        neplatnych_hlasov_count = EXCLUDED.neplatnych_hlasov_count,
        source_url = EXCLUDED.source_url,
        scraped_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [
      payload.politicianId,
      payload.cisObdobia,
      payload.poslanecMasterId,
      payload.sourcePoliticianName,
      payload.zaCount,
      payload.protiCount,
      payload.zdrzalSaCount,
      payload.nehlasovalCount,
      payload.nepritomnyCount,
      payload.neplatnychHlasovCount,
      payload.sourceUrl,
    ],
  );

  return result.rows[0];
}

export async function listPoliticians(limit = 100) {
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.nrsr_user_id,
        p.full_name,
        p.created_at,
        p.updated_at,
        latest.declaration_year AS latest_declaration_year,
        latest.public_function AS latest_public_function,
        latest.scraped_at AS latest_scraped_at,
        latestIncome.income_text AS latest_income_text,
        latestIncome.public_function_income_amount AS latest_public_function_income_amount,
        latestIncome.other_income_amount AS latest_other_income_amount,
        latestIncome.total_income_amount AS latest_total_income_amount,
        COALESCE(wealth.wealth_item_count, 0)::INT AS wealth_item_count,
        COUNT(d.id)::INT AS declaration_count
      FROM politicians p
      LEFT JOIN declarations d ON d.politician_id = p.id
      LEFT JOIN LATERAL (
        SELECT id, declaration_year, public_function, scraped_at
        FROM declarations
        WHERE politician_id = p.id
        ORDER BY declaration_year DESC NULLS LAST, id DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT income_text, public_function_income_amount, other_income_amount, total_income_amount
        FROM declaration_income
        WHERE declaration_id = latest.id
        LIMIT 1
      ) latestIncome ON true
      LEFT JOIN LATERAL (
        SELECT
          (
            COALESCE((SELECT COUNT(*) FROM declaration_real_estate WHERE declaration_id = latest.id), 0)
            + COALESCE((SELECT COUNT(*) FROM declaration_movable_assets WHERE declaration_id = latest.id), 0)
            + COALESCE((SELECT COUNT(*) FROM declaration_property_rights WHERE declaration_id = latest.id), 0)
          )::INT AS wealth_item_count
      ) wealth ON true
      GROUP BY p.id, latest.declaration_year, latest.public_function, latest.scraped_at, latestIncome.income_text, latestIncome.public_function_income_amount, latestIncome.other_income_amount, latestIncome.total_income_amount, wealth.wealth_item_count
      ORDER BY p.full_name NULLS LAST
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

export async function listDeclarationsByPolitician(politicianId) {
  const result = await pool.query(
    `
      SELECT id, declaration_year, declaration_identifier, internal_number, public_function, scraped_at
      FROM declarations
      WHERE politician_id = $1
      ORDER BY declaration_year DESC NULLS LAST, id DESC
    `,
    [politicianId],
  );
  return result.rows;
}

async function fetchSingleValueTable(client, tableName, declarationId, valueColumn) {
  const result = await client.query(
    `
      SELECT ${valueColumn} AS value
      FROM ${tableName}
      WHERE declaration_id = $1
      LIMIT 1
    `,
    [declarationId],
  );

  return result.rows[0]?.value ?? null;
}

async function fetchIncome(client, declarationId) {
  const result = await client.query(
    `
      SELECT
        income_text,
        public_function_income_amount,
        other_income_amount,
        total_income_amount
      FROM declaration_income
      WHERE declaration_id = $1
      LIMIT 1
    `,
    [declarationId],
  );

  return result.rows[0] || null;
}

async function fetchItemTable(client, tableName, declarationId) {
  const result = await client.query(
    `
      SELECT item_text
      FROM ${tableName}
      WHERE declaration_id = $1
      ORDER BY id ASC
    `,
    [declarationId],
  );

  return result.rows.map((row) => row.item_text);
}

export async function getPoliticianDetail(politicianId, declarationId = null) {
  const client = await pool.connect();
  try {
    const politicianResult = await client.query(
      `
        SELECT id, nrsr_user_id, full_name, created_at, updated_at
        FROM politicians
        WHERE id = $1
      `,
      [politicianId],
    );

    const politician = politicianResult.rows[0];
    if (!politician) {
      return null;
    }

    const declarations = await listDeclarationsByPolitician(politicianId);
    const activeDeclaration = declarationId
      ? declarations.find((item) => item.id === declarationId)
      : declarations[0];

    if (!activeDeclaration) {
      return {
        politician,
        declarations,
        activeDeclaration: null,
      };
    }

    const declarationResult = await client.query(
      `
        SELECT
          id,
          internal_number,
          declaration_identifier,
          declarant_title_name,
          declaration_year,
          submitted_when,
          public_function,
          source_url,
          scraped_at
        FROM declarations
        WHERE id = $1 AND politician_id = $2
      `,
      [activeDeclaration.id, politicianId],
    );

    const declaration = declarationResult.rows[0];
    if (!declaration) {
      return {
        politician,
        declarations,
        activeDeclaration: null,
      };
    }

    const income = await fetchIncome(client, declaration.id);
    const incompatibility = await fetchSingleValueTable(
      client,
      "declaration_incompatibility_conditions",
      declaration.id,
      "response_text",
    );

    const categories = {};
    for (const [key, tableName] of Object.entries(CATEGORY_TABLES)) {
      categories[key] = {
        label: CATEGORY_LABELS[key],
        items: await fetchItemTable(client, tableName, declaration.id),
      };
    }

    return {
      politician,
      declarations,
      activeDeclaration: {
        ...declaration,
        income_text: income?.income_text ?? null,
        public_function_income_amount: income?.public_function_income_amount ?? null,
        other_income_amount: income?.other_income_amount ?? null,
        total_income_amount: income?.total_income_amount ?? null,
        incompatibility,
        categories,
      },
    };
  } finally {
    client.release();
  }
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error("Invalid table name");
  }

  return `"${identifier}"`;
}

export async function listDatabaseTables() {
  const result = await pool.query(
    `
      SELECT
        t.table_name,
        COALESCE(s.n_live_tup::BIGINT, 0) AS estimated_rows
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name ASC
    `,
  );

  return result.rows;
}

export async function getTableData(tableName, limit = 100, offset = 0) {
  const tables = await listDatabaseTables();
  const allowedNames = new Set(tables.map((table) => table.table_name));

  if (!allowedNames.has(tableName)) {
    throw new Error("Unknown table");
  }

  const safeTableName = quoteIdentifier(tableName);
  const columnsResult = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName],
  );

  const countResult = await pool.query(`SELECT COUNT(*)::BIGINT AS total_count FROM ${safeTableName}`);
  const rowsResult = await pool.query(
    `SELECT * FROM ${safeTableName} ORDER BY 1 DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    tableName,
    columns: columnsResult.rows.map((row) => row.column_name),
    totalCount: Number(countResult.rows[0]?.total_count || 0),
    rows: rowsResult.rows,
  };
}
