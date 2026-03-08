const SLOVAK_AVERAGE_ANNUAL_SALARY_BY_YEAR = {
  2018: 12216,
  2019: 13104,
  2020: 13632,
  2021: 14592,
  2022: 15708,
  2023: 17280,
  2024: 18396,
  2025: 19296,
  2026: 20208,
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeRatio(numerator, denominator) {
  const left = toNumber(numerator);
  const right = toNumber(denominator);

  if (left == null || right == null || right <= 0) {
    return null;
  }

  return left / right;
}

function formatRatio(value, decimals = 2) {
  const numericValue = toNumber(value);
  return numericValue == null ? null : round(numericValue, decimals);
}

function deduplicateStrings(values) {
  const unique = new Set();
  for (const value of values || []) {
    const cleaned = String(value || "").trim();
    if (cleaned) {
      unique.add(cleaned);
    }
  }
  return Array.from(unique);
}

export function getAverageSalaryForYear(year) {
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) {
    return null;
  }

  return SLOVAK_AVERAGE_ANNUAL_SALARY_BY_YEAR[numericYear] ?? null;
}

export function buildActiveSideJobs(categories = {}) {
  return deduplicateStrings([
    ...(categories.employment?.items || []),
    ...(categories.businessActivities?.items || []),
    ...(categories.publicFunctionsDuringTerm?.items || []),
  ]);
}

export function buildTimelineEntry(rawEntry) {
  const declarationYear = Number(rawEntry.declaration_year);
  const publicFunctionIncomeAmount = toNumber(rawEntry.public_function_income_amount) ?? 0;
  const otherIncomeAmount = toNumber(rawEntry.other_income_amount) ?? 0;
  const totalIncomeAmount = toNumber(rawEntry.total_income_amount)
    ?? publicFunctionIncomeAmount
    + otherIncomeAmount;
  const assetItemCount = toNumber(rawEntry.asset_item_count) ?? 0;
  const employmentCount = toNumber(rawEntry.employment_count) ?? 0;
  const businessActivityCount = toNumber(rawEntry.business_activity_count) ?? 0;
  const publicFunctionRoleCount = toNumber(rawEntry.public_function_role_count) ?? 0;
  const sideJobCount = employmentCount + businessActivityCount + publicFunctionRoleCount;
  const averageAnnualSalary = getAverageSalaryForYear(declarationYear);

  return {
    declaration_id: rawEntry.declaration_id,
    declaration_year: Number.isFinite(declarationYear) ? declarationYear : null,
    public_function: rawEntry.public_function || null,
    public_function_income_amount: publicFunctionIncomeAmount,
    other_income_amount: otherIncomeAmount,
    total_income_amount: totalIncomeAmount,
    asset_item_count: assetItemCount,
    employment_count: employmentCount,
    business_activity_count: businessActivityCount,
    public_function_role_count: publicFunctionRoleCount,
    side_job_count: sideJobCount,
    average_slovak_annual_salary: averageAnnualSalary,
    salary_to_income_ratio: formatRatio(safeRatio(publicFunctionIncomeAmount, totalIncomeAmount)),
    other_income_share: formatRatio(safeRatio(otherIncomeAmount, totalIncomeAmount)),
    other_income_to_average_salary_ratio: formatRatio(safeRatio(otherIncomeAmount, averageAnnualSalary)),
  };
}

export function classifyRiskFactor(score) {
  if (!Number.isFinite(score) || score <= 0) {
    return "none";
  }

  if (score >= 4) {
    return "high";
  }

  if (score >= 2) {
    return "medium";
  }

  return "low";
}

function buildLiveRiskAnalysis({
  latestDeclarationId = null,
  previousDeclarationId = null,
  latestDeclarationYear = null,
  latestPublicFunctionIncomeAmount = null,
  latestOtherIncomeAmount = null,
  latestTotalIncomeAmount = null,
  previousPublicFunctionIncomeAmount = null,
  previousTotalIncomeAmount = null,
  currentAssetItemCount = null,
  previousAssetItemCount = null,
  timeline = [],
} = {}) {
  const currentSalaryToIncomeRatio = formatRatio(
    safeRatio(latestPublicFunctionIncomeAmount, latestTotalIncomeAmount),
    4,
  );
  const previousSalaryToIncomeRatio = formatRatio(
    safeRatio(previousPublicFunctionIncomeAmount, previousTotalIncomeAmount),
    4,
  );
  const salaryToIncomeChangeRatio = formatRatio(
    safeRatio(currentSalaryToIncomeRatio, previousSalaryToIncomeRatio),
    4,
  );
  const assetItemCountRatio = formatRatio(
    safeRatio(currentAssetItemCount, previousAssetItemCount),
    4,
  );
  const averageSlovakAnnualSalary = getAverageSalaryForYear(latestDeclarationYear);
  const otherIncomeToAverageSalaryRatio = formatRatio(
    safeRatio(latestOtherIncomeAmount, averageSlovakAnnualSalary),
    4,
  );
  const riskFactor = round(
    (salaryToIncomeChangeRatio ?? 0)
      + (assetItemCountRatio ?? 0)
      + (otherIncomeToAverageSalaryRatio ?? 0),
    4,
  ) ?? 0;

  return {
    risk_factor: riskFactor,
    risk_level: classifyRiskFactor(riskFactor),
    latest_declaration_id: latestDeclarationId,
    previous_declaration_id: previousDeclarationId,
    current_asset_item_count: toNumber(currentAssetItemCount) ?? 0,
    previous_asset_item_count: toNumber(previousAssetItemCount) ?? 0,
    other_income_amount: toNumber(latestOtherIncomeAmount),
    average_slovak_annual_salary: toNumber(averageSlovakAnnualSalary),
    coefficients: {
      current_salary_to_income_ratio: currentSalaryToIncomeRatio,
      previous_salary_to_income_ratio: previousSalaryToIncomeRatio,
      salary_to_income_change_ratio: salaryToIncomeChangeRatio,
      asset_item_count_ratio: assetItemCountRatio,
      other_income_to_average_salary_ratio: otherIncomeToAverageSalaryRatio,
    },
    timeline,
  };
}

export function buildRiskAnalysisFromListRow(row) {
  return buildLiveRiskAnalysis({
    latestDeclarationId: row?.latest_declaration_id ?? null,
    previousDeclarationId: row?.previous_declaration_id ?? null,
    latestDeclarationYear: row?.latest_declaration_year ?? null,
    latestPublicFunctionIncomeAmount: row?.latest_public_function_income_amount ?? null,
    latestOtherIncomeAmount: row?.latest_other_income_amount ?? null,
    latestTotalIncomeAmount: row?.latest_total_income_amount ?? null,
    previousPublicFunctionIncomeAmount: row?.previous_public_function_income_amount ?? null,
    previousTotalIncomeAmount: row?.previous_total_income_amount ?? null,
    currentAssetItemCount: row?.wealth_item_count ?? null,
    previousAssetItemCount: row?.previous_wealth_item_count ?? null,
  });
}

export function buildRiskAnalysis(rawRiskRow, timeline = []) {
  if (Array.isArray(timeline) && timeline.length) {
    const latest = timeline[0];
    const previous = timeline[1] || null;

    return buildLiveRiskAnalysis({
      latestDeclarationId: latest?.declaration_id ?? null,
      previousDeclarationId: previous?.declaration_id ?? null,
      latestDeclarationYear: latest?.declaration_year ?? null,
      latestPublicFunctionIncomeAmount: latest?.public_function_income_amount ?? null,
      latestOtherIncomeAmount: latest?.other_income_amount ?? null,
      latestTotalIncomeAmount: latest?.total_income_amount ?? null,
      previousPublicFunctionIncomeAmount: previous?.public_function_income_amount ?? null,
      previousTotalIncomeAmount: previous?.total_income_amount ?? null,
      currentAssetItemCount: latest?.asset_item_count ?? null,
      previousAssetItemCount: previous?.asset_item_count ?? null,
      timeline,
    });
  }

  const riskFactor = formatRatio(rawRiskRow?.risk_factor, 4) ?? 0;

  return {
    risk_factor: riskFactor,
    risk_level: rawRiskRow?.risk_level || classifyRiskFactor(riskFactor),
    latest_declaration_id: rawRiskRow?.latest_declaration_id ?? null,
    previous_declaration_id: rawRiskRow?.previous_declaration_id ?? null,
    current_asset_item_count: toNumber(rawRiskRow?.current_asset_item_count) ?? 0,
    previous_asset_item_count: toNumber(rawRiskRow?.previous_asset_item_count) ?? 0,
    other_income_amount: toNumber(rawRiskRow?.other_income_amount),
    average_slovak_annual_salary: toNumber(rawRiskRow?.average_slovak_annual_salary),
    coefficients: {
      current_salary_to_income_ratio: formatRatio(rawRiskRow?.current_salary_to_income_ratio, 4),
      previous_salary_to_income_ratio: formatRatio(rawRiskRow?.previous_salary_to_income_ratio, 4),
      salary_to_income_change_ratio: formatRatio(rawRiskRow?.salary_to_income_change_ratio, 4),
      asset_item_count_ratio: formatRatio(rawRiskRow?.asset_item_count_ratio, 4),
      other_income_to_average_salary_ratio: formatRatio(rawRiskRow?.other_income_to_average_salary_ratio, 4),
    },
    timeline,
  };
}

export { SLOVAK_AVERAGE_ANNUAL_SALARY_BY_YEAR };