CREATE TABLE IF NOT EXISTS politician_risk_factors (
  politician_id BIGINT PRIMARY KEY REFERENCES politicians(id) ON DELETE CASCADE,
  latest_declaration_id BIGINT REFERENCES declarations(id) ON DELETE SET NULL,
  previous_declaration_id BIGINT REFERENCES declarations(id) ON DELETE SET NULL,
  risk_factor NUMERIC(12, 4) NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'none',
  current_salary_to_income_ratio NUMERIC(12, 4),
  previous_salary_to_income_ratio NUMERIC(12, 4),
  salary_to_income_change_ratio NUMERIC(12, 4),
  current_asset_item_count INT NOT NULL DEFAULT 0,
  previous_asset_item_count INT NOT NULL DEFAULT 0,
  asset_item_count_ratio NUMERIC(12, 4),
  other_income_amount BIGINT,
  average_slovak_annual_salary BIGINT,
  other_income_to_average_salary_ratio NUMERIC(12, 4),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_politician_risk_factors_risk_factor
  ON politician_risk_factors (risk_factor DESC);

WITH salary_reference (declaration_year, average_annual_salary) AS (
  VALUES
    (2018, 12216),
    (2019, 13104),
    (2020, 13632),
    (2021, 14592),
    (2022, 15708),
    (2023, 17280),
    (2024, 18396),
    (2025, 19296),
    (2026, 20208)
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
  updated_at = NOW();