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

function normalizeFieldLabel(value) {
  return cleanText(value).replace(/:$/, "");
}

function normalizeLabel(value) {
  return cleanText(value).replace(/:$/, "").toLowerCase();
}

function parseInteger(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) {
    return 0;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
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

function extractVotingPoliticianName(value) {
  const cleaned = cleanText(value).replace(/Vytlačiť stránku.*$/i, "").trim();
  const resultMatch = cleaned.match(/Výsledky vyhľadávania v hlasovaniach NR SR\s*-\s*(.+)$/i);
  if (resultMatch) {
    return cleanText(resultMatch[1]);
  }

  if (/Vyhľadávanie v hlasovaniach NR SR/i.test(cleaned)) {
    return null;
  }

  return cleaned || null;
}

const VOTING_SUMMARY_LABELS = {
  za: "zaCount",
  proti: "protiCount",
  "zdržal(a) sa": "zdrzalSaCount",
  "nehlasoval(a)": "nehlasovalCount",
  "neprítomný(á)": "nepritomnyCount",
  "neplatných hlasov": "neplatnychHlasovCount",
};

function getAbsoluteUrl(sourceUrl, href) {
  if (!href) {
    return null;
  }

  return new URL(href, sourceUrl).toString();
}

function parsePostBackHref(value) {
  const match = String(value || "").match(/__doPostBack\('([^']+)','([^']+)'\)/);
  if (!match) {
    return null;
  }

  const pageMatch = match[2].match(/^Page\$(\d+)$/);

  return {
    eventTarget: match[1],
    eventArgument: match[2],
    pageNumber: pageMatch ? Number(pageMatch[1]) : null,
  };
}

function parseVotingResultRow($, row, sourceUrl) {
  const cells = $(row).children("td");
  if (cells.length < 6) {
    return null;
  }

  const detailAnchor = $(cells[2]).find("a").first();
  const detailUrl = getAbsoluteUrl(sourceUrl, detailAnchor.attr("href"));
  const detailVoteId = detailUrl ? Number(new URL(detailUrl).searchParams.get("ID")) : null;
  const cptAnchor = $(cells[3]).find("a").first();
  const cptUrl = getAbsoluteUrl(sourceUrl, cptAnchor.attr("href"));

  return {
    schodzaNumber: cleanText($(cells[0]).text()) || null,
    voteDateText: getCellLines($, cells[1]).join(" ") || null,
    detailVoteId: Number.isFinite(detailVoteId) ? detailVoteId : null,
    voteNumber: cleanText($(cells[2]).text()) || null,
    cptText: cleanText($(cells[3]).text()) || null,
    voteTitle: cleanText($(cells[4]).text()) || "Bez názvu",
    votedAs: cleanText($(cells[5]).text()) || null,
    detailUrl,
    cptUrl,
    rowHtml: $.html(row) || "",
  };
}

function extractDeputyFieldValue($, strong, sourceUrl) {
  const span = $(strong).nextAll("span").first();
  if (!span.length) {
    return null;
  }

  const anchor = span.find("a").first();
  const text = cleanText(span.text());
  const href = anchor.attr("href") || null;

  return {
    text: text || null,
    href: href
      ? (/^(?:mailto:|https?:|\/)/i.test(href) ? getAbsoluteUrl(sourceUrl, href) : href)
      : null,
  };
}

function parseSlovakDate(value) {
  const match = String(value || "").match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function splitCandidatePartyMemberships(value) {
  const normalized = cleanText(String(value || "")).replace(/\s*;\s*/g, "; ");
  if (!normalized) {
    return [];
  }

  const splitByCoalitionTail = (item) => {
    const cleaned = cleanText(item);
    if (!cleaned || !/\sa\s/.test(cleaned) || cleaned.includes(":")) {
      return [cleaned];
    }

    const parts = cleaned
      .split(/\s+a\s+/)
      .map((part) => cleanText(part))
      .filter(Boolean);

    return parts.length > 1 ? parts : [cleaned];
  };

  return normalized
    .split(/\s*[,;]\s*/)
    .flatMap(splitByCoalitionTail)
    .filter(Boolean);
}

function extractDeputyPhotoUrl($, sourceUrl) {
  const image = $(".mp_foto img").first();
  const src = image.attr("src");
  if (!src) {
    return null;
  }

  return getAbsoluteUrl(sourceUrl, src);
}

function buildDeputyTermInfo(cisObdobia) {
  const numericPeriod = Number(cisObdobia);
  if (!Number.isFinite(numericPeriod)) {
    return {};
  }

  return {
    current_term_number: numericPeriod,
    current_term_label: `${numericPeriod}. volebne obdobie`,
    parliament_service: null,
    current_term_service: null,
  };
}

export function parseDeputyProfileHtml({ html, sourceUrl, poslanecId, cisObdobia }) {
  const $ = cheerio.load(html);
  const personalData = {};
  const personalDataLinks = {};

  $(".mp_personal_data strong").each((_, strong) => {
    const label = normalizeFieldLabel($(strong).text());
    const extracted = extractDeputyFieldValue($, strong, sourceUrl);
    const value = extracted?.text || null;
    if (label) {
      personalData[label] = value || null;
      if (extracted?.href) {
        personalDataLinks[label] = extracted.href;
      }
    }
  });

  const memberships = [];
  $(".box").each((_, box) => {
    const heading = cleanText($(box).find("h2").first().text());
    if (!/členstvo/i.test(heading)) {
      return;
    }

    $(box).find("li").each((__, item) => {
      const text = cleanText($(item).text());
      if (text) {
        memberships.push(text);
      }
    });
  });

  const title = $("h1").first().clone();
  title.find(".print").remove();

  const fullName = cleanText(title.text()) || null;
  const parliamentaryClub = memberships.find((item) => /^Klub\s+/i.test(item)) || null;
  const candidatePartyRaw = personalData["Kandidoval(a) za"] || null;
  const candidatePartyMemberships = splitCandidatePartyMemberships(candidatePartyRaw);
  const photoUrl = extractDeputyPhotoUrl($, sourceUrl);
  const termInfo = buildDeputyTermInfo(cisObdobia);

  return {
    poslanecId,
    cisObdobia,
    fullName,
    sourceUrl,
    candidateParty: candidatePartyMemberships.length ? candidatePartyMemberships.join("; ") : candidatePartyRaw,
    candidatePartyMemberships,
    photoUrl,
    termInfo,
    parliamentaryClub: parliamentaryClub ? parliamentaryClub.replace(/^Klub\s+/i, "").trim() : null,
    memberships,
    title: personalData.Titul || null,
    firstName: personalData.Meno || null,
    lastName: personalData.Priezvisko || null,
    birthDate: parseSlovakDate(personalData["Narodený(á)"] || personalData["Narodeny(a)"] || null),
    birthDateText: personalData["Narodený(á)"] || personalData["Narodeny(a)"] || null,
    nationality: personalData.Národnosť || personalData.Narodnost || null,
    residence: personalData.Bydlisko || null,
    region: personalData.Kraj || null,
    email: personalData["E-mail"] || null,
    website: personalDataLinks.WWW || personalData.WWW || null,
    personalData,
  };
}

function cleanDeputyNameCell($, cell) {
  const clone = $(cell).clone();
  clone.find("a").remove();
  const remainder = cleanText(clone.text());
  const partyMatch = remainder.match(/^\((.*)\)$/);

  return {
    partyLabel: partyMatch?.[1] || null,
  };
}

function isActiveMandateStatus(value) {
  return /mand[aá]t(?:\s+n[aá]hradn[ií]ka)?\s+vykon[aá]van/i.test(value);
}

function isInactiveMandateStatus(value) {
  return /mand[aá]t\s+zaniknut|mand[aá]t\s+sa\s+neuplatňuje/i.test(value);
}

function formatServiceRange(startText, endText) {
  if (startText && endText) {
    return `${startText} - ${endText}`;
  }

  if (startText) {
    return `od ${startText}`;
  }

  return null;
}

export function buildTermInfoFromMandateChanges(baseTermInfo = {}, mandateChanges = []) {
  const sorted = [...(mandateChanges || [])]
    .filter((row) => row.date_iso || row.date_text)
    .sort((left, right) => {
      const leftDate = left.date_iso || "";
      const rightDate = right.date_iso || "";
      return leftDate.localeCompare(rightDate);
    });

  let currentTermStart = null;
  let currentTermStartText = null;
  let currentTermStartReason = null;
  let currentTermEnd = null;
  let currentTermEndText = null;
  let currentTermEndReason = null;

  for (const change of sorted) {
    if (isActiveMandateStatus(change.status || "")) {
      currentTermStart = change.date_iso || currentTermStart;
      currentTermStartText = change.date_text || currentTermStartText;
      currentTermStartReason = change.reason || currentTermStartReason;
      currentTermEnd = null;
      currentTermEndText = null;
      currentTermEndReason = null;
      continue;
    }

    if (isInactiveMandateStatus(change.status || "")) {
      currentTermEnd = change.date_iso || currentTermEnd;
      currentTermEndText = change.date_text || currentTermEndText;
      currentTermEndReason = change.reason || currentTermEndReason;
    }
  }

  return {
    ...baseTermInfo,
    source_page: "https://www.nrsr.sk/web/?sid=poslanci/zmeny",
    current_term_start_date: currentTermStart,
    current_term_end_date: currentTermEnd,
    current_term_start_reason: currentTermStartReason,
    current_term_end_reason: currentTermEndReason,
    current_term_service: formatServiceRange(currentTermStartText, currentTermEndText),
    parliament_service: null,
    mandate_changes_count: sorted.length,
  };
}

export function parseDeputyChangesHtml({ html, sourceUrl, pageNumber }) {
  const $ = cheerio.load(html);
  const table = $("#_sectionLayoutContainer_ctl01__ResultGrid2, #_sectionLayoutContainer_ctl01__resultGrid2").first();

  if (table.length === 0) {
    return null;
  }

  const rows = [];
  table.find("tr.tab_zoznam_nonalt, tr.tab_zoznam_alt").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 4) {
      return;
    }

    const anchor = $(cells[1]).find("a").first();
    const href = anchor.attr("href");
    const absoluteUrl = href ? getAbsoluteUrl(sourceUrl, href) : null;
    const url = absoluteUrl ? new URL(absoluteUrl) : null;
    const poslanecId = Number(url?.searchParams.get("PoslanecID"));
    const cisObdobia = Number(url?.searchParams.get("CisObdobia"));
    const dateText = cleanText($(cells[0]).text()) || null;
    const cellDetails = cleanDeputyNameCell($, cells[1]);

    rows.push({
      page_number: pageNumber,
      date_text: dateText,
      date_iso: parseSlovakDate(dateText),
      politician_name: cleanText(anchor.text()) || null,
      poslanecId: Number.isFinite(poslanecId) ? poslanecId : null,
      cisObdobia: Number.isFinite(cisObdobia) ? cisObdobia : null,
      profile_url: absoluteUrl,
      party_label: cellDetails.partyLabel,
      status: cleanText($(cells[2]).text()) || null,
      reason: cleanText($(cells[3]).text()) || null,
    });
  });

  const pager = [];
  table.find("tr.pager a[href*='__doPostBack']").each((_, link) => {
    const parsed = parsePostBackHref($(link).attr("href"));
    if (parsed) {
      pager.push(parsed);
    }
  });

  return {
    pageNumber,
    rows,
    pager,
  };
}

export function parseVotingSummaryHtml({ html, sourceUrl, cisObdobia, poslanecMasterId }) {
  const $ = cheerio.load(html);
  const headingText = cleanText($("h1").first().text()) || cleanText($("title").text());
  const politicianName = extractVotingPoliticianName(headingText);
  const summaryPanel = $("div.voting_stats_summary_full, div.voting_stats_ummary_full").first();

  if (!politicianName || summaryPanel.length === 0) {
    return null;
  }

  const summary = {
    zaCount: 0,
    protiCount: 0,
    zdrzalSaCount: 0,
    nehlasovalCount: 0,
    nepritomnyCount: 0,
    neplatnychHlasovCount: 0,
  };

  summaryPanel.children("div").each((_, section) => {
    const label = normalizeLabel($(section).find("strong").first().text());
    const key = VOTING_SUMMARY_LABELS[label];
    if (!key) {
      return;
    }

    summary[key] = parseInteger($(section).find("span").first().text());
  });

  if (summaryPanel.find("strong").length === 0) {
    return null;
  }

  return {
    cisObdobia,
    poslanecMasterId,
    politicianName,
    sourceUrl,
    ...summary,
  };
}

export function parseVotingResultsHtml({ html, sourceUrl, cisObdobia, cisSchodze, poslanecMasterId, pageNumber }) {
  const $ = cheerio.load(html);
  const headingText = cleanText($("h1").first().text()) || cleanText($("title").text());
  const politicianName = extractVotingPoliticianName(headingText);
  const table = $("#_sectionLayoutContainer_ctl01__resultGrid2").first();

  if (!politicianName || table.length === 0) {
    return null;
  }

  const rows = [];
  table.find("tr.tab_zoznam_nonalt, tr.tab_zoznam_alt").each((_, row) => {
    const parsedRow = parseVotingResultRow($, row, sourceUrl);
    if (parsedRow) {
      rows.push(parsedRow);
    }
  });

  const pager = [];
  table.find("tr.pager a[href*='__doPostBack']").each((_, link) => {
    const parsed = parsePostBackHref($(link).attr("href"));
    if (parsed) {
      pager.push(parsed);
    }
  });

  return {
    cisObdobia,
    cisSchodze,
    poslanecMasterId,
    politicianName,
    pageNumber,
    sourceUrl,
    resultTableHtml: $.html(table) || "",
    rawPageHtml: html,
    summary: parseVotingSummaryHtml({ html, sourceUrl, cisObdobia, poslanecMasterId }),
    pager,
    rows,
  };
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
