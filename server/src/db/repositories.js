import crypto from "node:crypto";
import {
  buildActiveSideJobs,
  buildRiskAnalysis,
  buildTimelineEntry,
} from "../analysis/politicianRisk.js";
import { estimateMovableAsset } from "../analysis/movableAssetEstimator.js";
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

const AVERAGE_SALARY_VALUES_SQL = `
        (2018, 12216),
        (2019, 13104),
        (2020, 13632),
        (2021, 14592),
        (2022, 15708),
        (2023, 17280),
        (2024, 18396),
        (2025, 19296),
        (2026, 20208)
`;

const POLITICIAN_RISK_FACTOR_UPSERT_SQL = `
  WITH salary_reference (declaration_year, average_annual_salary) AS (
    VALUES
${AVERAGE_SALARY_VALUES_SQL}
  ),
  base AS (
    SELECT
      p.id AS politician_id,
      latest.id AS latest_declaration_id,
      previous.id AS previous_declaration_id,
      latest.declaration_year AS latest_declaration_year,
      COALESCE(latest_income.public_function_income_amount, 0)::NUMERIC AS latest_public_function_income_amount,
      COALESCE(latest_income.other_income_amount, 0)::NUMERIC AS latest_other_income_amount,
      COALESCE(latest_income.total_income_amount, 0)::NUMERIC AS latest_total_income_amount,
      COALESCE(previous_income.public_function_income_amount, 0)::NUMERIC AS previous_public_function_income_amount,
      COALESCE(previous_income.total_income_amount, 0)::NUMERIC AS previous_total_income_amount,
      COALESCE(latest_assets.asset_item_count, 0)::INT AS current_asset_item_count,
      COALESCE(previous_assets.asset_item_count, 0)::INT AS previous_asset_item_count,
      salary_reference.average_annual_salary::NUMERIC AS average_slovak_annual_salary
    FROM politicians p
    LEFT JOIN LATERAL (
      SELECT id, declaration_year
      FROM declarations
      WHERE politician_id = p.id
      ORDER BY declaration_year DESC NULLS LAST, id DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT id
      FROM declarations
      WHERE politician_id = p.id AND (latest.id IS NULL OR id <> latest.id)
      ORDER BY declaration_year DESC NULLS LAST, id DESC
      LIMIT 1
    ) previous ON true
    LEFT JOIN declaration_income latest_income ON latest_income.declaration_id = latest.id
    LEFT JOIN declaration_income previous_income ON previous_income.declaration_id = previous.id
    LEFT JOIN LATERAL (
      SELECT (
        COALESCE((SELECT COUNT(*) FROM declaration_real_estate WHERE declaration_id = latest.id), 0)
        + COALESCE((SELECT COUNT(*) FROM declaration_movable_assets WHERE declaration_id = latest.id), 0)
        + COALESCE((SELECT COUNT(*) FROM declaration_property_rights WHERE declaration_id = latest.id), 0)
      )::INT AS asset_item_count
    ) latest_assets ON true
    LEFT JOIN LATERAL (
      SELECT (
        COALESCE((SELECT COUNT(*) FROM declaration_real_estate WHERE declaration_id = previous.id), 0)
        + COALESCE((SELECT COUNT(*) FROM declaration_movable_assets WHERE declaration_id = previous.id), 0)
        + COALESCE((SELECT COUNT(*) FROM declaration_property_rights WHERE declaration_id = previous.id), 0)
      )::INT AS asset_item_count
    ) previous_assets ON true
    LEFT JOIN salary_reference ON salary_reference.declaration_year = latest.declaration_year
    WHERE ($1::BIGINT IS NULL OR p.id = $1)
  ),
  ratios AS (
    SELECT
      politician_id,
      latest_declaration_id,
      previous_declaration_id,
      ROUND(latest_public_function_income_amount / NULLIF(latest_total_income_amount, 0), 4) AS current_salary_to_income_ratio,
      ROUND(previous_public_function_income_amount / NULLIF(previous_total_income_amount, 0), 4) AS previous_salary_to_income_ratio,
      current_asset_item_count,
      previous_asset_item_count,
      latest_other_income_amount::BIGINT AS other_income_amount,
      average_slovak_annual_salary::BIGINT AS average_slovak_annual_salary
    FROM base
  ),
  merged AS (
    SELECT
      politician_id,
      latest_declaration_id,
      previous_declaration_id,
      current_salary_to_income_ratio,
      previous_salary_to_income_ratio,
      ROUND(current_salary_to_income_ratio / NULLIF(previous_salary_to_income_ratio, 0), 4) AS salary_to_income_change_ratio,
      current_asset_item_count,
      previous_asset_item_count,
      ROUND(current_asset_item_count::NUMERIC / NULLIF(previous_asset_item_count, 0), 4) AS asset_item_count_ratio,
      other_income_amount,
      average_slovak_annual_salary,
      ROUND(other_income_amount::NUMERIC / NULLIF(average_slovak_annual_salary, 0), 4) AS other_income_to_average_salary_ratio
    FROM ratios
  ),
  final AS (
    SELECT
      politician_id,
      latest_declaration_id,
      previous_declaration_id,
      current_salary_to_income_ratio,
      previous_salary_to_income_ratio,
      salary_to_income_change_ratio,
      current_asset_item_count,
      previous_asset_item_count,
      asset_item_count_ratio,
      other_income_amount,
      average_slovak_annual_salary,
      other_income_to_average_salary_ratio,
      ROUND(
        COALESCE(salary_to_income_change_ratio, 0)
        + COALESCE(asset_item_count_ratio, 0)
        + COALESCE(other_income_to_average_salary_ratio, 0),
        4
      ) AS risk_factor
    FROM merged
  )
  INSERT INTO politician_risk_factors (
    politician_id,
    latest_declaration_id,
    previous_declaration_id,
    risk_factor,
    risk_level,
    current_salary_to_income_ratio,
    previous_salary_to_income_ratio,
    salary_to_income_change_ratio,
    current_asset_item_count,
    previous_asset_item_count,
    asset_item_count_ratio,
    other_income_amount,
    average_slovak_annual_salary,
    other_income_to_average_salary_ratio,
    calculated_at,
    updated_at
  )
  SELECT
    politician_id,
    latest_declaration_id,
    previous_declaration_id,
    risk_factor,
    CASE
      WHEN risk_factor >= 4 THEN 'high'
      WHEN risk_factor >= 2 THEN 'medium'
      WHEN risk_factor > 0 THEN 'low'
      ELSE 'none'
    END AS risk_level,
    current_salary_to_income_ratio,
    previous_salary_to_income_ratio,
    salary_to_income_change_ratio,
    current_asset_item_count,
    previous_asset_item_count,
    asset_item_count_ratio,
    other_income_amount,
    average_slovak_annual_salary,
    other_income_to_average_salary_ratio,
    NOW(),
    NOW()
  FROM final
  ON CONFLICT (politician_id)
  DO UPDATE SET
    latest_declaration_id = EXCLUDED.latest_declaration_id,
    previous_declaration_id = EXCLUDED.previous_declaration_id,
    risk_factor = EXCLUDED.risk_factor,
    risk_level = EXCLUDED.risk_level,
    current_salary_to_income_ratio = EXCLUDED.current_salary_to_income_ratio,
    previous_salary_to_income_ratio = EXCLUDED.previous_salary_to_income_ratio,
    salary_to_income_change_ratio = EXCLUDED.salary_to_income_change_ratio,
    current_asset_item_count = EXCLUDED.current_asset_item_count,
    previous_asset_item_count = EXCLUDED.previous_asset_item_count,
    asset_item_count_ratio = EXCLUDED.asset_item_count_ratio,
    other_income_amount = EXCLUDED.other_income_amount,
    average_slovak_annual_salary = EXCLUDED.average_slovak_annual_salary,
    other_income_to_average_salary_ratio = EXCLUDED.other_income_to_average_salary_ratio,
    calculated_at = NOW(),
    updated_at = NOW()
`;

function stableHash(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function refreshPoliticianRiskFactor(client, politicianId = null) {
  await client.query(POLITICIAN_RISK_FACTOR_UPSERT_SQL, [politicianId]);
}

async function hasStaleOrMissingPoliticianRiskFactor(client, politicianId = null) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM politicians p
        LEFT JOIN politician_risk_factors risk ON risk.politician_id = p.id
        LEFT JOIN LATERAL (
          SELECT id
          FROM declarations
          WHERE politician_id = p.id
          ORDER BY declaration_year DESC NULLS LAST, id DESC
          LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT id
          FROM declarations
          WHERE politician_id = p.id AND (latest.id IS NULL OR id <> latest.id)
          ORDER BY declaration_year DESC NULLS LAST, id DESC
          LIMIT 1
        ) previous ON true
        WHERE ($1::BIGINT IS NULL OR p.id = $1)
          AND (
            risk.politician_id IS NULL
            OR risk.latest_declaration_id IS DISTINCT FROM latest.id
            OR risk.previous_declaration_id IS DISTINCT FROM previous.id
          )
      ) AS has_stale_or_missing
    `,
    [politicianId],
  );

  return result.rows[0]?.has_stale_or_missing === true;
}

async function ensurePoliticianRiskFactorsCurrent(client, politicianId = null) {
  if (await hasStaleOrMissingPoliticianRiskFactor(client, politicianId)) {
    await refreshPoliticianRiskFactor(client, politicianId);
  }
}

async function fetchPoliticianRiskFactor(client, politicianId) {
  const result = await client.query(
    `
      SELECT *
      FROM politician_risk_factors
      WHERE politician_id = $1
      LIMIT 1
    `,
    [politicianId],
  );

  return result.rows[0] || null;
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

async function refreshMovableAssetEstimations(client, declarationId) {
  const movableAssetsResult = await client.query(
    `
      SELECT id, item_text
      FROM declaration_movable_assets
      WHERE declaration_id = $1
      ORDER BY id ASC
    `,
    [declarationId],
  );

  const movableAssetIds = movableAssetsResult.rows.map((row) => row.id);
  if (movableAssetIds.length === 0) {
    await client.query(
      `DELETE FROM declaration_movable_asset_estimations WHERE declaration_id = $1`,
      [declarationId],
    );
    return;
  }

  for (const movableAsset of movableAssetsResult.rows) {
    const estimation = await estimateMovableAsset(movableAsset.item_text);
    await client.query(
      `
        INSERT INTO declaration_movable_asset_estimations (
          movable_asset_id,
          declaration_id,
          raw_item_text,
          asset_type,
          brand_or_maker,
          year_of_manufacture,
          llm_estimated_price_eur,
          final_price_eur,
          estimation_source,
          confidence,
          applied_rule,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (movable_asset_id)
        DO UPDATE SET
          declaration_id = EXCLUDED.declaration_id,
          raw_item_text = EXCLUDED.raw_item_text,
          asset_type = EXCLUDED.asset_type,
          brand_or_maker = EXCLUDED.brand_or_maker,
          year_of_manufacture = EXCLUDED.year_of_manufacture,
          llm_estimated_price_eur = EXCLUDED.llm_estimated_price_eur,
          final_price_eur = EXCLUDED.final_price_eur,
          estimation_source = EXCLUDED.estimation_source,
          confidence = EXCLUDED.confidence,
          applied_rule = EXCLUDED.applied_rule,
          updated_at = NOW()
      `,
      [
        movableAsset.id,
        declarationId,
        estimation.raw,
        estimation.assetType,
        estimation.brandOrMaker,
        estimation.yearOfManufacture,
        estimation.llmEstimatedPriceEur,
        estimation.finalPriceEur,
        estimation.estimationSource,
        estimation.confidence,
        estimation.appliedRule,
      ],
    );
  }

  await client.query(
    `
      DELETE FROM declaration_movable_asset_estimations
      WHERE declaration_id = $1
        AND movable_asset_id <> ALL($2::BIGINT[])
    `,
    [declarationId, movableAssetIds],
  );
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

    await refreshMovableAssetEstimations(client, declarationId);

    await refreshPoliticianRiskFactor(client, politicianId);

    await client.query("COMMIT");
    return { politicianId, declarationId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function savePoliticianProfile(payload, dbPool = pool) {
  await dbPool.query(
    `
      UPDATE politicians
      SET
        deputy_profile_id = COALESCE($2, deputy_profile_id),
        deputy_profile_period = COALESCE($3, deputy_profile_period),
        deputy_profile_url = COALESCE($4, deputy_profile_url),
        candidate_party = COALESCE($5, candidate_party),
        parliamentary_club = COALESCE($6, parliamentary_club),
        parliamentary_memberships = COALESCE($7::jsonb, parliamentary_memberships),
        deputy_profile_scraped_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      payload.politicianId,
      payload.deputyProfileId ?? null,
      payload.deputyProfilePeriod ?? null,
      payload.deputyProfileUrl ?? null,
      payload.candidateParty ?? null,
      payload.parliamentaryClub ?? null,
      JSON.stringify(payload.parliamentaryMemberships || []),
    ],
  );
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

async function upsertPoliticianVotingPageSnapshot(client, payload) {
  const result = await client.query(
    `
      INSERT INTO politician_voting_page_snapshots (
        politician_id,
        cis_obdobia,
        cis_schodze,
        poslanec_master_id,
        source_politician_name,
        page_number,
        source_url,
        result_table_html,
        raw_page_html,
        scraped_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (cis_obdobia, cis_schodze, poslanec_master_id, page_number)
      DO UPDATE SET
        politician_id = EXCLUDED.politician_id,
        source_politician_name = EXCLUDED.source_politician_name,
        source_url = EXCLUDED.source_url,
        result_table_html = EXCLUDED.result_table_html,
        raw_page_html = EXCLUDED.raw_page_html,
        scraped_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [
      payload.politicianId,
      payload.cisObdobia,
      payload.cisSchodze,
      payload.poslanecMasterId,
      payload.sourcePoliticianName,
      payload.pageNumber,
      payload.sourceUrl,
      payload.resultTableHtml,
      payload.rawPageHtml,
    ],
  );

  return result.rows[0].id;
}

export async function savePoliticianVotingPage(payload, dbPool = pool) {
  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");

    const snapshotId = await upsertPoliticianVotingPageSnapshot(client, payload);

    await client.query(
      `DELETE FROM politician_voting_records WHERE page_snapshot_id = $1`,
      [snapshotId],
    );

    for (const row of payload.rows) {
      const rowHash = stableHash(
        [
          row.detailVoteId || "",
          row.voteNumber || "",
          row.schodzaNumber || "",
          row.voteDateText || "",
          row.cptText || "",
          row.voteTitle || "",
          row.votedAs || "",
        ].join("|"),
      );

      await client.query(
        `
          INSERT INTO politician_voting_records (
            politician_id,
            page_snapshot_id,
            cis_obdobia,
            cis_schodze,
            poslanec_master_id,
            source_politician_name,
            page_number,
            schodza_number,
            vote_date_text,
            detail_vote_id,
            vote_number,
            cpt_text,
            vote_title,
            voted_as,
            detail_url,
            cpt_url,
            row_hash,
            row_html,
            scraped_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
          ON CONFLICT (page_snapshot_id, row_hash)
          DO UPDATE SET
            politician_id = EXCLUDED.politician_id,
            schodza_number = EXCLUDED.schodza_number,
            vote_date_text = EXCLUDED.vote_date_text,
            detail_vote_id = EXCLUDED.detail_vote_id,
            vote_number = EXCLUDED.vote_number,
            cpt_text = EXCLUDED.cpt_text,
            vote_title = EXCLUDED.vote_title,
            voted_as = EXCLUDED.voted_as,
            detail_url = EXCLUDED.detail_url,
            cpt_url = EXCLUDED.cpt_url,
            row_html = EXCLUDED.row_html,
            scraped_at = NOW(),
            updated_at = NOW()
        `,
        [
          payload.politicianId,
          snapshotId,
          payload.cisObdobia,
          payload.cisSchodze,
          payload.poslanecMasterId,
          payload.sourcePoliticianName,
          payload.pageNumber,
          row.schodzaNumber || null,
          row.voteDateText || null,
          row.detailVoteId ?? null,
          row.voteNumber || null,
          row.cptText || null,
          row.voteTitle,
          row.votedAs || null,
          row.detailUrl || null,
          row.cptUrl || null,
          rowHash,
          row.rowHtml,
        ],
      );
    }

    await client.query("COMMIT");
    return {
      snapshotId,
      rowCount: payload.rows.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function savePoliticianVotingTranscript(payload, dbPool = pool) {
  const result = await dbPool.query(
    `
      INSERT INTO politician_voting_transcripts (
        politician_id,
        cis_obdobia,
        cis_schodze,
        poslanec_master_id,
        source_politician_name,
        source_url,
        page_count,
        record_count,
        za_count,
        proti_count,
        zdrzal_sa_count,
        nehlasoval_count,
        nepritomny_count,
        neplatnych_hlasov_count,
        transcript_text,
        transcript_records,
        raw_pages,
        scraped_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, NOW(), NOW())
      ON CONFLICT (cis_obdobia, cis_schodze, poslanec_master_id)
      DO UPDATE SET
        politician_id = EXCLUDED.politician_id,
        source_politician_name = EXCLUDED.source_politician_name,
        source_url = EXCLUDED.source_url,
        page_count = EXCLUDED.page_count,
        record_count = EXCLUDED.record_count,
        za_count = EXCLUDED.za_count,
        proti_count = EXCLUDED.proti_count,
        zdrzal_sa_count = EXCLUDED.zdrzal_sa_count,
        nehlasoval_count = EXCLUDED.nehlasoval_count,
        nepritomny_count = EXCLUDED.nepritomny_count,
        neplatnych_hlasov_count = EXCLUDED.neplatnych_hlasov_count,
        transcript_text = EXCLUDED.transcript_text,
        transcript_records = EXCLUDED.transcript_records,
        raw_pages = EXCLUDED.raw_pages,
        scraped_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [
      payload.politicianId,
      payload.cisObdobia,
      payload.cisSchodze,
      payload.poslanecMasterId,
      payload.sourcePoliticianName,
      payload.sourceUrl,
      payload.pageCount,
      payload.recordCount,
      payload.zaCount,
      payload.protiCount,
      payload.zdrzalSaCount,
      payload.nehlasovalCount,
      payload.nepritomnyCount,
      payload.neplatnychHlasovCount,
      payload.transcriptText,
      JSON.stringify(payload.transcriptRecords || []),
      JSON.stringify(payload.rawPages || []),
    ],
  );

  return result.rows[0];
}

export async function listPoliticians(limit = 100) {
  const client = await pool.connect();
  try {
    await ensurePoliticianRiskFactorsCurrent(client);

    const result = await client.query(
      `
      SELECT
        p.id,
        p.nrsr_user_id,
        p.full_name,
        p.candidate_party,
        p.parliamentary_club,
        p.parliamentary_memberships,
        p.created_at,
        p.updated_at,
        latest.id AS latest_declaration_id,
        latest.declaration_year AS latest_declaration_year,
        latest.public_function AS latest_public_function,
        latest.scraped_at AS latest_scraped_at,
        latestIncome.income_text AS latest_income_text,
        latestIncome.public_function_income_amount AS latest_public_function_income_amount,
        latestIncome.other_income_amount AS latest_other_income_amount,
        latestIncome.total_income_amount AS latest_total_income_amount,
        latestSideJobs.employment_count AS latest_employment_count,
        latestSideJobs.business_activity_count AS latest_business_activity_count,
        latestSideJobs.public_function_role_count AS latest_public_function_role_count,
        previous.id AS previous_declaration_id,
        previous.declaration_year AS previous_declaration_year,
        previous.public_function AS previous_public_function,
        previousIncome.public_function_income_amount AS previous_public_function_income_amount,
        previousIncome.other_income_amount AS previous_other_income_amount,
        previousIncome.total_income_amount AS previous_total_income_amount,
        COALESCE(risk.current_asset_item_count, 0)::INT AS wealth_item_count,
        COALESCE(risk.previous_asset_item_count, 0)::INT AS previous_wealth_item_count,
        previousSideJobs.employment_count AS previous_employment_count,
        previousSideJobs.business_activity_count AS previous_business_activity_count,
        previousSideJobs.public_function_role_count AS previous_public_function_role_count,
        COALESCE(risk.risk_factor, 0) AS risk_factor,
        COALESCE(risk.risk_level, 'none') AS risk_level,
        risk.current_salary_to_income_ratio,
        risk.previous_salary_to_income_ratio,
        risk.salary_to_income_change_ratio,
        risk.asset_item_count_ratio,
        risk.other_income_to_average_salary_ratio,
        COUNT(d.id)::INT AS declaration_count
      FROM politicians p
      LEFT JOIN declarations d ON d.politician_id = p.id
      LEFT JOIN politician_risk_factors risk ON risk.politician_id = p.id
      LEFT JOIN LATERAL (
        SELECT id, declaration_year, public_function, scraped_at
        FROM declarations
        WHERE politician_id = p.id
        ORDER BY declaration_year DESC NULLS LAST, id DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT id, declaration_year, public_function
        FROM declarations
        WHERE politician_id = p.id AND (latest.id IS NULL OR id <> latest.id)
        ORDER BY declaration_year DESC NULLS LAST, id DESC
        LIMIT 1
      ) previous ON true
      LEFT JOIN LATERAL (
        SELECT income_text, public_function_income_amount, other_income_amount, total_income_amount
        FROM declaration_income
        WHERE declaration_id = latest.id
        LIMIT 1
      ) latestIncome ON true
      LEFT JOIN LATERAL (
        SELECT public_function_income_amount, other_income_amount, total_income_amount
        FROM declaration_income
        WHERE declaration_id = previous.id
        LIMIT 1
      ) previousIncome ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE((SELECT COUNT(*) FROM declaration_employment WHERE declaration_id = latest.id), 0)::INT AS employment_count,
          COALESCE((SELECT COUNT(*) FROM declaration_business_activities WHERE declaration_id = latest.id), 0)::INT AS business_activity_count,
          COALESCE((SELECT COUNT(*) FROM declaration_public_functions_during_term WHERE declaration_id = latest.id), 0)::INT AS public_function_role_count
      ) latestSideJobs ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE((SELECT COUNT(*) FROM declaration_employment WHERE declaration_id = previous.id), 0)::INT AS employment_count,
          COALESCE((SELECT COUNT(*) FROM declaration_business_activities WHERE declaration_id = previous.id), 0)::INT AS business_activity_count,
          COALESCE((SELECT COUNT(*) FROM declaration_public_functions_during_term WHERE declaration_id = previous.id), 0)::INT AS public_function_role_count
      ) previousSideJobs ON true
      GROUP BY p.id, risk.politician_id, latest.id, latest.declaration_year, latest.public_function, latest.scraped_at, latestIncome.income_text, latestIncome.public_function_income_amount, latestIncome.other_income_amount, latestIncome.total_income_amount, latestSideJobs.employment_count, latestSideJobs.business_activity_count, latestSideJobs.public_function_role_count, previous.id, previous.declaration_year, previous.public_function, previousIncome.public_function_income_amount, previousIncome.other_income_amount, previousIncome.total_income_amount, previousSideJobs.employment_count, previousSideJobs.business_activity_count, previousSideJobs.public_function_role_count, risk.current_asset_item_count, risk.previous_asset_item_count, risk.risk_factor, risk.risk_level, risk.current_salary_to_income_ratio, risk.previous_salary_to_income_ratio, risk.salary_to_income_change_ratio, risk.asset_item_count_ratio, risk.other_income_to_average_salary_ratio
      ORDER BY p.full_name NULLS LAST
      LIMIT $1
      `,
      [limit],
    );

    return result.rows;
  } finally {
    client.release();
  }
}

export async function listPoliticianVotingStats(limit = 5000) {
  const result = await pool.query(
    `
      SELECT
        pvs.id,
        pvs.politician_id,
        p.full_name,
        p.nrsr_user_id,
        pvs.cis_obdobia,
        pvs.poslanec_master_id,
        pvs.za_count,
        pvs.proti_count,
        pvs.zdrzal_sa_count,
        pvs.nehlasoval_count,
        pvs.nepritomny_count,
        pvs.neplatnych_hlasov_count,
        pvs.source_url,
        pvs.scraped_at
      FROM politician_voting_stats pvs
      JOIN politicians p ON p.id = pvs.politician_id
      ORDER BY pvs.cis_obdobia DESC, p.full_name ASC, pvs.id DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows;
}

export async function listPoliticianVotingRecords(limit = 5000) {
  const result = await pool.query(
    `
      SELECT
        pvr.id,
        pvr.politician_id,
        COALESCE(p.full_name, pvr.source_politician_name) AS full_name,
        p.nrsr_user_id,
        pvr.cis_obdobia,
        pvr.cis_schodze,
        pvr.poslanec_master_id,
        pvr.page_number,
        pvr.schodza_number,
        pvr.vote_date_text,
        pvr.detail_vote_id,
        pvr.vote_number,
        pvr.cpt_text,
        pvr.vote_title,
        pvr.voted_as,
        pvr.detail_url,
        pvr.cpt_url,
        pvr.scraped_at
      FROM politician_voting_records pvr
      LEFT JOIN politicians p ON p.id = pvr.politician_id
      ORDER BY full_name ASC, pvr.page_number ASC, pvr.detail_vote_id ASC NULLS LAST, pvr.id ASC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows;
}

export async function listPoliticianVotingTranscripts(limit = 5000) {
  const result = await pool.query(
    `
      SELECT
        pvt.id,
        pvt.politician_id,
        COALESCE(p.full_name, pvt.source_politician_name) AS full_name,
        p.nrsr_user_id,
        pvt.cis_obdobia,
        pvt.cis_schodze,
        pvt.poslanec_master_id,
        pvt.page_count,
        pvt.record_count,
        pvt.za_count,
        pvt.proti_count,
        pvt.zdrzal_sa_count,
        pvt.nehlasoval_count,
        pvt.nepritomny_count,
        pvt.neplatnych_hlasov_count,
        pvt.transcript_text,
        pvt.transcript_records,
        pvt.raw_pages,
        pvt.source_url,
        pvt.scraped_at
      FROM politician_voting_transcripts pvt
      LEFT JOIN politicians p ON p.id = pvt.politician_id
      ORDER BY full_name ASC, pvt.cis_obdobia DESC, pvt.poslanec_master_id ASC
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

async function fetchDeclarationTimeline(client, politicianId) {
  const result = await client.query(
    `
      SELECT
        d.id AS declaration_id,
        d.declaration_year,
        d.public_function,
        di.public_function_income_amount,
        di.other_income_amount,
        di.total_income_amount,
        COALESCE(realEstate.count, 0)
          + COALESCE(movableAssets.count, 0)
          + COALESCE(propertyRights.count, 0) AS asset_item_count,
        COALESCE(employment.count, 0) AS employment_count,
        COALESCE(businessActivities.count, 0) AS business_activity_count,
        COALESCE(publicFunctionsDuringTerm.count, 0) AS public_function_role_count
      FROM declarations d
      LEFT JOIN declaration_income di ON di.declaration_id = d.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS count FROM declaration_real_estate WHERE declaration_id = d.id
      ) realEstate ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS count FROM declaration_movable_assets WHERE declaration_id = d.id
      ) movableAssets ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS count FROM declaration_property_rights WHERE declaration_id = d.id
      ) propertyRights ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS count FROM declaration_employment WHERE declaration_id = d.id
      ) employment ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS count FROM declaration_business_activities WHERE declaration_id = d.id
      ) businessActivities ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS count FROM declaration_public_functions_during_term WHERE declaration_id = d.id
      ) publicFunctionsDuringTerm ON true
      WHERE d.politician_id = $1
      ORDER BY d.declaration_year DESC NULLS LAST, d.id DESC
    `,
    [politicianId],
  );

  return result.rows;
}

export async function getPoliticianDetail(politicianId, declarationId = null) {
  const client = await pool.connect();
  try {
    const politicianResult = await client.query(
      `
        SELECT
          id,
          nrsr_user_id,
          full_name,
          candidate_party,
          parliamentary_club,
          parliamentary_memberships,
          deputy_profile_id,
          deputy_profile_period,
          deputy_profile_url,
          deputy_profile_scraped_at,
          created_at,
          updated_at
        FROM politicians
        WHERE id = $1
      `,
      [politicianId],
    );

    const politician = politicianResult.rows[0];
    if (!politician) {
      return null;
    }

    await ensurePoliticianRiskFactorsCurrent(client, politicianId);

    const declarations = await listDeclarationsByPolitician(politicianId);
    const timelineRows = await fetchDeclarationTimeline(client, politicianId);
    const timeline = timelineRows.map(buildTimelineEntry);
    const riskRow = await fetchPoliticianRiskFactor(client, politicianId);
    const riskAnalysis = buildRiskAnalysis(riskRow, timeline);
    const activeDeclaration = declarationId
      ? declarations.find((item) => item.id === declarationId)
      : declarations[0];

    if (!activeDeclaration) {
      return {
        politician,
        declarations,
        timeline,
        riskAnalysis,
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
        timeline,
        riskAnalysis,
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

    const activeTimelineEntry = timeline.find((entry) => entry.declaration_id === declaration.id) || null;
    const activeSideJobs = buildActiveSideJobs(categories);

    return {
      politician,
      declarations,
      timeline,
      riskAnalysis,
      activeDeclaration: {
        ...declaration,
        income_text: income?.income_text ?? null,
        public_function_income_amount: income?.public_function_income_amount ?? null,
        other_income_amount: income?.other_income_amount ?? null,
        total_income_amount: income?.total_income_amount ?? null,
        incompatibility,
        asset_item_count: activeTimelineEntry?.asset_item_count ?? 0,
        salary_to_income_ratio: activeTimelineEntry?.salary_to_income_ratio ?? null,
        other_income_to_average_salary_ratio: activeTimelineEntry?.other_income_to_average_salary_ratio ?? null,
        side_job_count: activeTimelineEntry?.side_job_count ?? 0,
        side_jobs: activeSideJobs,
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
