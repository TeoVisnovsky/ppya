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

function absoluteChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  return current - previous;
}

function formatRatio(value) {
  return value == null ? null : round(value, 2);
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

function classifySuspicion(score) {
  if (!Number.isFinite(score) || score <= 0) {
    return "none";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  return "low";
}

export function buildRiskAnalysisFromTimeline(entries) {
  const timeline = (entries || []).map(buildTimelineEntry);
  const current = timeline[0] || null;
  const previous = timeline[1] || null;

  if (!current) {
    return {
      suspicious_score: 0,
      suspicious_level: "none",
      flags: [],
      coefficients: {},
      timeline,
    };
  }

  const flags = [];
  let score = 0;

  const currentSalaryToIncomeRatio = current.salary_to_income_ratio;
  const previousSalaryToIncomeRatio = previous?.salary_to_income_ratio ?? null;
  const salaryRatioDelta = absoluteChange(currentSalaryToIncomeRatio, previousSalaryToIncomeRatio);
  const salaryRatioChange = formatRatio(safeRatio(currentSalaryToIncomeRatio, previousSalaryToIncomeRatio));
  const assetItemCountRatio = formatRatio(safeRatio(current.asset_item_count, previous?.asset_item_count));
  const totalIncomeGrowthRatio = formatRatio(safeRatio(current.total_income_amount, previous?.total_income_amount));
  const otherIncomeGrowthRatio = formatRatio(safeRatio(current.other_income_amount, previous?.other_income_amount));
  const otherIncomeToAverageSalaryRatio = current.other_income_to_average_salary_ratio;
  const otherIncomeShare = current.other_income_share;

  if (otherIncomeToAverageSalaryRatio != null && otherIncomeToAverageSalaryRatio >= 2) {
    score += 35;
    flags.push("Ine prijmy presahuju dvojnasobok priemernej rocnej mzdy.");
  } else if (otherIncomeToAverageSalaryRatio != null && otherIncomeToAverageSalaryRatio >= 1) {
    score += 20;
    flags.push("Ine prijmy su aspon na urovni priemernej rocnej mzdy.");
  }

  if (Math.abs(salaryRatioDelta || 0) >= 0.35) {
    score += 20;
    flags.push("Podiel platu z verejnej funkcie na celkovych prijmoch sa prudko zmenil oproti minulemu roku.");
  } else if (Math.abs(salaryRatioDelta || 0) >= 0.2) {
    score += 10;
    flags.push("Podiel platu z verejnej funkcie na celkovych prijmoch sa citelne zmenil.");
  }

  if (totalIncomeGrowthRatio != null && (totalIncomeGrowthRatio >= 2 || totalIncomeGrowthRatio <= 0.5)) {
    score += 18;
    flags.push("Celkove prijmy medzi rokmi prudko vzrastli alebo klesli.");
  }

  if (
    assetItemCountRatio != null
    && Math.max(current.asset_item_count || 0, previous?.asset_item_count || 0) >= 3
    && (assetItemCountRatio >= 2 || assetItemCountRatio <= 0.5)
  ) {
    score += 15;
    flags.push("Pocet majetkovych poloziek sa medzi rokmi vyrazne zmenil.");
  }

  if (otherIncomeShare != null && otherIncomeShare >= 0.5) {
    score += 15;
    flags.push("Vacsinu priznanych prijmov tvoria ine prijmy.");
  }

  if ((current.side_job_count || 0) > 0 && (otherIncomeToAverageSalaryRatio || 0) >= 1) {
    score += 10;
    flags.push("Politik ma vedlajsie aktivity a sucasne vysoke ine prijmy.");
  }

  if (current.side_job_count >= 4) {
    score += 5;
    flags.push("Politik vykazuje vacsi pocet vedlajsich aktivit alebo funkcii.");
  }

  score = Math.min(score, 100);

  return {
    suspicious_score: score,
    suspicious_level: classifySuspicion(score),
    flags,
    coefficients: {
      current_salary_to_income_ratio: currentSalaryToIncomeRatio,
      previous_salary_to_income_ratio: previousSalaryToIncomeRatio,
      salary_to_income_ratio_change: salaryRatioChange,
      salary_to_income_ratio_delta: formatRatio(salaryRatioDelta),
      asset_item_count_ratio: assetItemCountRatio,
      total_income_growth_ratio: totalIncomeGrowthRatio,
      other_income_growth_ratio: otherIncomeGrowthRatio,
      other_income_to_average_salary_ratio: otherIncomeToAverageSalaryRatio,
    },
    timeline,
  };
}

export function buildListRiskSummary(rawRow) {
  const current = buildTimelineEntry({
    declaration_id: rawRow.latest_declaration_id,
    declaration_year: rawRow.latest_declaration_year,
    public_function: rawRow.latest_public_function,
    public_function_income_amount: rawRow.latest_public_function_income_amount,
    other_income_amount: rawRow.latest_other_income_amount,
    total_income_amount: rawRow.latest_total_income_amount,
    asset_item_count: rawRow.wealth_item_count,
    employment_count: rawRow.latest_employment_count,
    business_activity_count: rawRow.latest_business_activity_count,
    public_function_role_count: rawRow.latest_public_function_role_count,
  });
  const previous = rawRow.previous_declaration_id
    ? buildTimelineEntry({
      declaration_id: rawRow.previous_declaration_id,
      declaration_year: rawRow.previous_declaration_year,
      public_function: rawRow.previous_public_function,
      public_function_income_amount: rawRow.previous_public_function_income_amount,
      other_income_amount: rawRow.previous_other_income_amount,
      total_income_amount: rawRow.previous_total_income_amount,
      asset_item_count: rawRow.previous_wealth_item_count,
      employment_count: rawRow.previous_employment_count,
      business_activity_count: rawRow.previous_business_activity_count,
      public_function_role_count: rawRow.previous_public_function_role_count,
    })
    : null;

  const risk = buildRiskAnalysisFromTimeline(previous ? [current, previous] : [current]);

  return {
    ...risk,
    flags_count: risk.flags.length,
  };
}

export { SLOVAK_AVERAGE_ANNUAL_SALARY_BY_YEAR };