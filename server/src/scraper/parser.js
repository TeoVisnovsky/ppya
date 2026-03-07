import * as cheerio from "cheerio";

const LABELS = {
  internalNumber: "interné číslo",
  declarationId: "id oznámenia",
  titleName: "titul, meno, priezvisko",
  year: "oznámenie za rok",
  submittedWhen: "oznámenie bolo podané",
  publicFunction: "vykonávaná verejná funkcia",
  incomeText: "príjmy za rok",
  incompatibility:
    "spĺňam podmienky nezlučiteľnosti výkonu funkcie verejného funkcionára s výkonom iných funkcií, zamestnaní alebo činností podľa čl. 5 ods. 1 a 2 ú. z. č. 357/2004 z. z.",
  employment:
    "vykonávam nasledovné zamestnanie v pracovnom pomere alebo obdobnom pracovnom vzťahu alebo štátnozamestnaneckom vzťahu (čl. 7 ods. 1 písm. b) ú. z. č. 357/2004 z. z.)",
  businessActivities:
    "vykonávam nasledovnú podnikateľskú činnosť (čl. 5 ods. 2 až 5 a čl. 7 ods. 1 písm. b) ú. z. č. 357/2004 z. z.)",
  publicFunctionsDuringTerm:
    "počas výkonu verejnej funkcie mám tieto funkcie (čl. 5 ods. 4 a čl. 7 ods. 1 písm. c) ú. z. č. 357/2004 z. z.)",
  realEstate: "vlastníctvo nehnuteľnej veci",
  movableAssets: "vlastníctvo hnuteľnej veci",
  propertyRights: "vlastníctvo majetkového práva alebo inej majetkovej hodnoty",
  liabilities: "existencia záväzku",
  usageRealEstate: "užívanie nehnuteľnej veci vo vlastníctve inej fyzickej alebo inej právnickej osoby",
  usageMovableAssets: "užívanie hnuteľnej veci vo vlastníctve inej fyzickej alebo inej právnickej osoby",
  giftsOrBenefits: "prijaté dary alebo iné výhody",
  voting: "hlasovanie",
};

const RECORD_BOUNDARY_AFTER_SHARE = /(?<=podiel:\s*\d+\/\d+)\s+(?=[A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])/g;

function cleanText(value) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLabel(value) {
  return cleanText(value).replace(/:$/, "").toLowerCase();
}

function parseEuroAmount(value) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIncomeFields(incomeText) {
  if (!incomeText) {
    return {
      publicFunctionIncomeAmount: null,
      otherIncomeAmount: null,
      totalIncomeAmount: null,
    };
  }

  const publicFunctionMatch = incomeText.match(/([\d\s]+)\s*€\s*\(z výkonu verejnej funkcie\)/i);
  const otherMatch = incomeText.match(/([\d\s]+)\s*€\s*\(iné\)/i);
  const allEuroMatches = incomeText.match(/\d[\d\s]*\s*€/g) || [];

  const publicFunctionIncomeAmount = parseEuroAmount(publicFunctionMatch?.[1] || null);
  const otherIncomeAmount = parseEuroAmount(otherMatch?.[1] || null);
  const totalIncomeAmount = allEuroMatches.reduce((sum, item) => sum + (parseEuroAmount(item) || 0), 0) || null;

  return {
    publicFunctionIncomeAmount,
    otherIncomeAmount,
    totalIncomeAmount,
  };
}

function splitCompoundLine(line) {
  const splitByShare = line
    .split(RECORD_BOUNDARY_AFTER_SHARE)
    .map((item) => cleanText(item))
    .filter(Boolean);

  if (splitByShare.length > 1) {
    return splitByShare;
  }

  return [line];
}

function getCellLines($, cell) {
  const html = $(cell).html() || "";
  const withNewlines = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n");

  const text = cheerio.load(`<div>${withNewlines}</div>`)("div").text();
  const lines = text
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  if (lines.length === 1) {
    const single = lines[0];
    const splitLines = splitCompoundLine(single);
    if (splitLines.length > 1) {
      return splitLines;
    }
  }

  return lines;
}

function findRowValue(rowsByLabel, key) {
  const needle = LABELS[key];
  for (const [label, value] of rowsByLabel.entries()) {
    if (label.startsWith(needle)) {
      return value;
    }
  }
  return [];
}

function appendRowValue(rowsByLabel, label, lines) {
  if (!label || !lines.length) {
    return;
  }

  const existing = rowsByLabel.get(label) || [];
  rowsByLabel.set(label, [...existing, ...lines]);
}

function extractRowsFromSequentialCells($) {
  const rowsByLabel = new Map();
  let pendingLabel = null;

  $("td.label, td.value").each((_, cell) => {
    const className = $(cell).attr("class") || "";

    if (className.includes("label")) {
      const label = normalizeLabel($(cell).text());
      if (label) {
        pendingLabel = label;
      }
      return;
    }

    if (className.includes("value") && pendingLabel) {
      appendRowValue(rowsByLabel, pendingLabel, getCellLines($, cell));
      pendingLabel = null;
    }
  });

  return rowsByLabel;
}

function extractRowsFromTwoColumnRows($) {
  const rowsByLabel = new Map();

  $("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) {
      return;
    }

    const label = normalizeLabel($(cells[0]).text());
    if (!label) {
      return;
    }

    appendRowValue(rowsByLabel, label, getCellLines($, cells[1]));
  });

  return rowsByLabel;
}

export function parseDeclarationHtml({ html, sourceUrl, userId, fallbackName }) {
  const $ = cheerio.load(html);
  const rowsByLabel = extractRowsFromSequentialCells($);

  if (rowsByLabel.size === 0) {
    const fallbackRows = extractRowsFromTwoColumnRows($);
    for (const [label, lines] of fallbackRows.entries()) {
      rowsByLabel.set(label, lines);
    }
  }

  const yearValue = (findRowValue(rowsByLabel, "year")[0] || "").match(/\d{4}/)?.[0] || null;
  const incomeText = findRowValue(rowsByLabel, "incomeText").join(" | ") || null;
  const incomeFields = parseIncomeFields(incomeText);

  const declaration = {
    userId,
    sourceUrl,
    internalNumber: findRowValue(rowsByLabel, "internalNumber")[0] || null,
    declarationId: findRowValue(rowsByLabel, "declarationId")[0] || null,
    titleName: findRowValue(rowsByLabel, "titleName")[0] || fallbackName || null,
    year: yearValue ? Number(yearValue) : null,
    submittedWhen: findRowValue(rowsByLabel, "submittedWhen")[0] || null,
    publicFunction: findRowValue(rowsByLabel, "publicFunction")[0] || null,
    incomeText,
    publicFunctionIncomeAmount: incomeFields.publicFunctionIncomeAmount,
    otherIncomeAmount: incomeFields.otherIncomeAmount,
    totalIncomeAmount: incomeFields.totalIncomeAmount,
    incompatibility: findRowValue(rowsByLabel, "incompatibility").join(" | ") || null,
    categories: {
      employment: findRowValue(rowsByLabel, "employment"),
      businessActivities: findRowValue(rowsByLabel, "businessActivities"),
      publicFunctionsDuringTerm: findRowValue(rowsByLabel, "publicFunctionsDuringTerm"),
      realEstate: findRowValue(rowsByLabel, "realEstate"),
      movableAssets: findRowValue(rowsByLabel, "movableAssets"),
      propertyRights: findRowValue(rowsByLabel, "propertyRights"),
      liabilities: findRowValue(rowsByLabel, "liabilities"),
      usageRealEstate: findRowValue(rowsByLabel, "usageRealEstate"),
      usageMovableAssets: findRowValue(rowsByLabel, "usageMovableAssets"),
      giftsOrBenefits: findRowValue(rowsByLabel, "giftsOrBenefits"),
      voting: findRowValue(rowsByLabel, "voting"),
    },
  };

  declaration.raw = {
    extractedRows: Object.fromEntries(rowsByLabel.entries()),
  };

  return declaration;
}
