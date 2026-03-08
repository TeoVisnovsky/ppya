import { listPoliticians } from "../db/repositories.js";

const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 8;

const GENERIC_SUGGESTIONS = [
  "Who has the most assets?",
  "Show the top 5 highest-income politicians.",
  "Which politicians have the highest risk factor?",
  "Tell me about Robert Fico.",
];

const STOP_WORDS = new Set([
  "a",
  "about",
  "all",
  "an",
  "and",
  "are",
  "best",
  "by",
  "for",
  "give",
  "highest",
  "how",
  "i",
  "in",
  "is",
  "just",
  "me",
  "most",
  "my",
  "of",
  "on",
  "please",
  "politician",
  "politicians",
  "show",
  "tell",
  "the",
  "them",
  "to",
  "top",
  "what",
  "which",
  "who",
  "with",
  "za",
  "o",
  "mi",
  "ma",
  "na",
  "od",
  "pre",
  "pri",
  "sa",
  "su",
  "s",
  "v",
  "vo",
  "z",
  "zo",
  "ktory",
  "ktora",
  "ktore",
  "kto",
  "ukaz",
  "ukazat",
  "povedz",
  "naj",
  "najdi",
  "najst",
  "politik",
  "politici",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatInteger(value) {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 }).format(toNumber(value));
}

function formatCurrency(value) {
  const amount = toNumber(value);
  if (amount <= 0) {
    return "0 EUR";
  }

  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRisk(value) {
  return toNumber(value).toFixed(2);
}

function getAssetCount(row) {
  return toNumber(row.wealth_item_count);
}

function getPreviousAssetCount(row) {
  return toNumber(row.previous_wealth_item_count);
}

function getAssetDelta(row) {
  return getAssetCount(row) - getPreviousAssetCount(row);
}

function getIncomeTotal(row) {
  return toNumber(row.latest_total_income_amount);
}

function getOtherIncome(row) {
  return toNumber(row.latest_other_income_amount);
}

function getRiskFactor(row) {
  return toNumber(row.risk_factor);
}

function getDisplayParty(row) {
  return row.candidate_party || row.parliamentary_club || "Bez strany alebo klubu";
}

function getDisplayFunction(row) {
  return row.latest_public_function || "Neuvedena funkcia";
}

function getQueryLimit(question) {
  const matchers = [
    /\btop\s+(\d{1,2})\b/i,
    /\b(?:first|best|show|list)\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+(?:results|rows|cards|politicians|people)\b/i,
    /\b(\d{1,2})\b/,
  ];

  for (const matcher of matchers) {
    const match = String(question || "").match(matcher);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return clamp(parsed, 1, MAX_LIMIT);
    }
  }

  return DEFAULT_LIMIT;
}

function getQueryYear(question) {
  const match = String(question || "").match(/\b(20\d{2})\b/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferPartyOrClub(question, rows) {
  const normalizedQuestion = normalizeText(question);
  const values = new Map();

  for (const row of rows) {
    for (const value of [row.candidate_party, row.parliamentary_club]) {
      const cleaned = String(value || "").trim();
      if (!cleaned) {
        continue;
      }

      const normalizedValue = normalizeText(cleaned);
      if (!normalizedValue || normalizedValue.length < 3) {
        continue;
      }

      if (normalizedQuestion.includes(normalizedValue)) {
        const existing = values.get(normalizedValue);
        if (!existing || cleaned.length > existing.length) {
          values.set(normalizedValue, cleaned);
        }
      }
    }
  }

  return Array.from(values.values()).sort((left, right) => right.length - left.length)[0] || null;
}

function matchesPartyOrClub(row, value) {
  if (!value) {
    return true;
  }

  const normalizedValue = normalizeText(value);
  return [row.candidate_party, row.parliamentary_club]
    .filter(Boolean)
    .some((item) => normalizeText(item) === normalizedValue);
}

function matchesYear(row, year) {
  return !year || toNumber(row.latest_declaration_year) === year;
}

function detectIntent(question) {
  const normalizedQuestion = normalizeText(question);

  if (!normalizedQuestion) {
    return "unknown";
  }

  if (/(most|highest|largest|richest|wealthiest|najviac|najvacsi|najvacsie|najbohatsi).*(asset|assets|wealth|majet|poloziek)/.test(normalizedQuestion)
    || /(asset|assets|wealth|majet|poloziek).*(most|highest|largest|najviac|najvacsi|najvacsie)/.test(normalizedQuestion)) {
    return "assets";
  }

  if (/(income|salary|earns|prijem|prijmy|zaraba).*(most|highest|najviac|najvyss)/.test(normalizedQuestion)
    || /(most|highest|najviac|najvyss).*(income|salary|prijem|prijmy|zaraba)/.test(normalizedQuestion)) {
    return "income";
  }

  if (/(risk|risky|suspicious|podozriv|rizik)/.test(normalizedQuestion)) {
    return "risk";
  }

  if (/(other income|side income|ine prijmy|ine prijem|vedlajsie prijmy|vedlajsi prijem)/.test(normalizedQuestion)) {
    return "otherIncome";
  }

  if (/(increase|growth|jump|narast|narastol|prirastok|zvysenie).*(asset|assets|majet|poloziek)/.test(normalizedQuestion)
    || /(asset|assets|majet|poloziek).*(increase|growth|jump|narast|prirastok|zvysenie)/.test(normalizedQuestion)) {
    return "assetJump";
  }

  if (/(who is|tell me about|show me|find|najdi|kto je|povedz mi o|info o|detail)/.test(normalizedQuestion)) {
    return "profile";
  }

  return "profile";
}

function buildSearchTokens(question) {
  return normalizeText(question)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token));
}

function extractProfileHint(question) {
  return normalizeText(question)
    .replace(/\b(who is|tell me about|show me|find|najdi|kto je|povedz mi o|info o|detail)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildProfileMatches(rows, question, limit, partyOrClub, year) {
  const normalizedQuestion = normalizeText(question);
  const profileHint = extractProfileHint(question);
  const tokens = buildSearchTokens(profileHint || question);

  const scored = rows
    .filter((row) => matchesPartyOrClub(row, partyOrClub) && matchesYear(row, year))
    .map((row) => {
      const haystacks = {
        fullName: normalizeText(row.full_name),
        party: normalizeText(row.candidate_party),
        club: normalizeText(row.parliamentary_club),
        fn: normalizeText(row.latest_public_function),
        userId: normalizeText(row.nrsr_user_id),
      };

      const allTokensInName = tokens.length > 1 && tokens.every((token) => haystacks.fullName.includes(token));

      let score = 0;
      if (haystacks.fullName && normalizedQuestion && haystacks.fullName.includes(normalizedQuestion)) {
        score += 12;
      }

      if (profileHint && haystacks.fullName.includes(profileHint)) {
        score += 18;
      }

      if (allTokensInName) {
        score += 14;
      }

      for (const token of tokens) {
        if (haystacks.fullName.includes(token)) {
          score += 6;
        }
        if (haystacks.party.includes(token) || haystacks.club.includes(token)) {
          score += 4;
        }
        if (haystacks.fn.includes(token)) {
          score += 2;
        }
        if (haystacks.userId.includes(token)) {
          score += 2;
        }
      }

      if (tokens.length > 1 && !allTokensInName && score < 12) {
        return { row, score: 0 };
      }

      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.row.full_name.localeCompare(right.row.full_name, "sk"))
    .slice(0, limit)
    .map((item) => item.row);

  return scored;
}

function buildCard(row, contextLabel) {
  return {
    id: row.id,
    title: row.full_name || row.nrsr_user_id,
    subtitle: `${getDisplayFunction(row)} • ${getDisplayParty(row)}`,
    contextLabel,
    link: `/detail.html?id=${encodeURIComponent(row.id)}`,
    metrics: [
      { label: "Priznanie", value: row.latest_declaration_year ? String(row.latest_declaration_year) : "-" },
      { label: "Majetok", value: `${formatInteger(getAssetCount(row))} poloziek` },
      { label: "Prijem", value: formatCurrency(getIncomeTotal(row)) },
      { label: "Risk", value: formatRisk(getRiskFactor(row)) },
    ],
    related: [
      { label: "Zmena majetku", value: `${getAssetDelta(row) >= 0 ? "+" : ""}${formatInteger(getAssetDelta(row))}` },
      { label: "Ine prijmy", value: formatCurrency(getOtherIncome(row)) },
      { label: "Klub", value: row.parliamentary_club || "-" },
      { label: "User ID", value: row.nrsr_user_id || "-" },
    ],
  };
}

function averageOf(rows, selector) {
  if (!rows.length) {
    return 0;
  }

  return rows.reduce((sum, row) => sum + selector(row), 0) / rows.length;
}

function buildRelatedFacts(intent, rows, partyOrClub, year) {
  const facts = [];

  if (partyOrClub) {
    facts.push({ label: "Filter", value: partyOrClub });
  }

  if (year) {
    facts.push({ label: "Rok", value: String(year) });
  }

  facts.push({ label: "Zhody", value: formatInteger(rows.length) });

  if (!rows.length) {
    return facts;
  }

  if (intent === "assets" || intent === "assetJump") {
    facts.push({ label: "Priemer majetku", value: `${formatInteger(averageOf(rows, getAssetCount))} poloziek` });
  }

  if (intent === "income" || intent === "otherIncome") {
    facts.push({ label: "Priemer prijmu", value: formatCurrency(averageOf(rows, getIncomeTotal)) });
  }

  if (intent === "risk") {
    facts.push({ label: "Priemerny risk", value: formatRisk(averageOf(rows, getRiskFactor)) });
  }

  return facts;
}

function buildSuggestions(intent, rows) {
  if (intent === "profile" && rows[0]) {
    return [
      `Show ${rows[0].full_name}'s income ranking.`,
      `How risky is ${rows[0].full_name}?`,
      `Who has more assets than ${rows[0].full_name}?`,
    ];
  }

  return GENERIC_SUGGESTIONS;
}

function buildNoResultsResponse(question, partyOrClub, year) {
  return {
    ok: true,
    question,
    intent: "no-results",
    heading: "No matching data",
    answer: "I could not find a politician snapshot matching that question with the current filters.",
    relatedFacts: [
      ...(partyOrClub ? [{ label: "Filter", value: partyOrClub }] : []),
      ...(year ? [{ label: "Rok", value: String(year) }] : []),
    ],
    cards: [],
    suggestions: GENERIC_SUGGESTIONS,
  };
}

function buildUnknownResponse(question) {
  return {
    ok: true,
    question,
    intent: "unknown",
    heading: "Try a ranking or a name",
    answer: "I currently answer database-backed ranking and profile questions about assets, income, risk, and individual politicians.",
    relatedFacts: [],
    cards: [],
    suggestions: GENERIC_SUGGESTIONS,
  };
}

function buildIntentResult(intent, question, rows, limit, partyOrClub, year) {
  const filtered = rows.filter((row) => matchesPartyOrClub(row, partyOrClub) && matchesYear(row, year));
  let heading = "";
  let answer = "";
  let sorted = [];
  let contextLabel = "";

  switch (intent) {
    case "assets":
      sorted = [...filtered].sort((left, right) => getAssetCount(right) - getAssetCount(left) || getIncomeTotal(right) - getIncomeTotal(left));
      heading = "Most assets";
      contextLabel = "Latest declared asset count";
      break;
    case "income":
      sorted = [...filtered].sort((left, right) => getIncomeTotal(right) - getIncomeTotal(left) || getAssetCount(right) - getAssetCount(left));
      heading = "Highest income";
      contextLabel = "Latest declared total income";
      break;
    case "risk":
      sorted = [...filtered].sort((left, right) => getRiskFactor(right) - getRiskFactor(left) || getAssetCount(right) - getAssetCount(left));
      heading = "Highest risk factor";
      contextLabel = "Current risk score";
      break;
    case "otherIncome":
      sorted = [...filtered].sort((left, right) => getOtherIncome(right) - getOtherIncome(left) || getIncomeTotal(right) - getIncomeTotal(left));
      heading = "Highest other income";
      contextLabel = "Other income vs salary mix";
      break;
    case "assetJump":
      sorted = [...filtered].sort((left, right) => getAssetDelta(right) - getAssetDelta(left) || getAssetCount(right) - getAssetCount(left));
      heading = "Largest asset jump";
      contextLabel = "Year-over-year asset count change";
      break;
    case "profile":
      sorted = buildProfileMatches(rows, question, limit, partyOrClub, year);
      heading = sorted.length === 1 ? "Politician profile" : "Matching politicians";
      contextLabel = "Latest stored snapshot";
      break;
    default:
      return buildUnknownResponse(question);
  }

  const topRows = sorted.slice(0, limit);
  if (!topRows.length) {
    return buildNoResultsResponse(question, partyOrClub, year);
  }

  const leader = topRows[0];
  if (intent === "assets") {
    answer = `${leader.full_name} currently has the largest declared asset set with ${formatInteger(getAssetCount(leader))} asset items in the latest declaration.`;
  } else if (intent === "income") {
    answer = `${leader.full_name} has the highest latest declared total income at ${formatCurrency(getIncomeTotal(leader))}.`;
  } else if (intent === "risk") {
    answer = `${leader.full_name} currently has the highest calculated risk factor at ${formatRisk(getRiskFactor(leader))}.`;
  } else if (intent === "otherIncome") {
    answer = `${leader.full_name} has the highest reported other income at ${formatCurrency(getOtherIncome(leader))}.`;
  } else if (intent === "assetJump") {
    answer = `${leader.full_name} shows the largest year-over-year asset-count increase at ${getAssetDelta(leader) >= 0 ? "+" : ""}${formatInteger(getAssetDelta(leader))} items.`;
  } else if (intent === "profile") {
    answer = sorted.length === 1
      ? `${leader.full_name} is the best match. I used the latest stored declaration snapshot and profile metadata.`
      : `I found ${formatInteger(sorted.length)} matching politicians and ranked the strongest matches first.`;
  }

  return {
    ok: true,
    question,
    intent,
    heading,
    answer,
    relatedFacts: buildRelatedFacts(intent, sorted, partyOrClub, year),
    cards: topRows.map((row) => buildCard(row, contextLabel)),
    suggestions: buildSuggestions(intent, topRows),
  };
}

export async function answerChatbotQuestion(question) {
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) {
    throw new Error("Question is required.");
  }

  const dataset = await listPoliticians(10000);
  const limit = getQueryLimit(trimmedQuestion);
  const year = getQueryYear(trimmedQuestion);
  const partyOrClub = inferPartyOrClub(trimmedQuestion, dataset);
  const intent = detectIntent(trimmedQuestion);

  return buildIntentResult(intent, trimmedQuestion, dataset, limit, partyOrClub, year);
}