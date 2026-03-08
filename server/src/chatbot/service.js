import { listPoliticians, searchSearchableRecords } from "../db/repositories.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 12;
const TABLE_RESULT_LIMIT = 1200;

const GENERIC_SUGGESTIONS = [
  "Who has the most assets?",
  "Show the top 5 highest-income politicians.",
  "Which politicians have the highest risk factor?",
  "Who has a car with brand VOLVO?",
  "Tell me about Robert Fico.",
];

const SUPPORTED_INTENTS = new Set([
  "assets",
  "income",
  "risk",
  "otherIncome",
  "assetJump",
  "assetSearch",
  "textSearch",
  "profile",
  "unknown",
]);

const ASSET_SOURCE_KEYS = [
  "movableAssets",
  "usageMovableAssets",
  "realEstate",
  "usageRealEstate",
  "propertyRights",
  "giftsOrBenefits",
];

const SOURCE_KEY_LABELS = {
  employment: "Employment",
  businessActivities: "Business activity",
  publicFunctionsDuringTerm: "Public function during term",
  publicFunction: "Public function",
  realEstate: "Real estate",
  movableAssets: "Movable asset",
  propertyRights: "Property right",
  liabilities: "Liability",
  usageRealEstate: "Used real estate",
  usageMovableAssets: "Used movable asset",
  giftsOrBenefits: "Gift or benefit",
  voting: "Voting",
  income: "Income text",
  incompatibility: "Incompatibility conditions",
  candidateParty: "Candidate party",
  parliamentaryClub: "Parliamentary club",
  region: "Region",
  residence: "Residence",
  email: "Email",
  website: "Website",
};

const SOURCE_KEY_TABLES = {
  employment: "declaration_employment",
  businessActivities: "declaration_business_activities",
  publicFunctionsDuringTerm: "declaration_public_functions_during_term",
  publicFunction: "declarations.public_function",
  realEstate: "declaration_real_estate",
  movableAssets: "declaration_movable_assets",
  propertyRights: "declaration_property_rights",
  liabilities: "declaration_liabilities",
  usageRealEstate: "declaration_usage_real_estate",
  usageMovableAssets: "declaration_usage_movable_assets",
  giftsOrBenefits: "declaration_gifts_or_benefits",
  voting: "declaration_voting",
  income: "declaration_income",
  incompatibility: "declaration_incompatibility_conditions",
  candidateParty: "politicians.candidate_party",
  parliamentaryClub: "politicians.parliamentary_club",
  region: "politicians.deputy_region",
  residence: "politicians.deputy_residence",
  email: "politicians.deputy_email",
  website: "politicians.deputy_website",
};

const SEARCH_TERM_SYNONYMS = {
  motorka: ["motorka", "motorku", "motorky", "motocykel", "motocykla", "motocykli", "motorcycle", "motorcycles", "motorbike"],
  motorku: ["motorka", "motorku", "motorky", "motocykel", "motocykla", "motocykli", "motorcycle", "motorcycles", "motorbike"],
  motocykel: ["motorka", "motorku", "motorky", "motocykel", "motocykla", "motocykli", "motorcycle", "motorcycles", "motorbike"],
  motorcycle: ["motorka", "motorku", "motocykel", "motocykla", "motorcycle", "motorcycles", "motorbike"],
  auto: ["auto", "auta", "automobil", "automobile", "car", "cars", "vehicle", "vozidlo", "vozidla"],
  car: ["car", "cars", "auto", "auta", "automobil", "vozidlo", "vozidla"],
  byt: ["byt", "bytov", "apartman", "apartment", "flat"],
  dom: ["dom", "domu", "house", "houses", "rodinny dom"],
  pozemok: ["pozemok", "pozemku", "land", "parcel", "parcela"],
  dar: ["dar", "dary", "gift", "gifts", "benefit", "benefits", "vyhoda", "vyhody"],
  liability: ["liability", "liabilities", "debt", "debts", "loan", "loans", "mortgage", "uver", "uvery", "zavazok", "zavazky"],
  uver: ["uver", "uvery", "liability", "liabilities", "debt", "loan", "mortgage", "zavazok", "zavazky"],
  job: ["job", "jobs", "work", "employment", "zamestnanie", "zamestnania", "pracuje", "pracoval"],
  hlasovanie: ["hlasovanie", "hlasovani", "vote", "votes", "voting", "hlasoval", "hlasovala"],
  sperk: ["sperk", "sperky", "šperk", "šperky", "jewelry", "jewellery", "diamond", "zlato", "retiazka", "naramok", "prsten"],
  sperky: ["sperk", "sperky", "šperk", "šperky", "jewelry", "jewellery", "diamond", "zlato", "retiazka", "naramok", "prsten"],
  jewelry: ["sperk", "sperky", "šperk", "šperky", "jewelry", "jewellery", "diamond", "zlato", "retiazka", "naramok", "prsten"],
};

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
  "that",
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

const ASSET_SEARCH_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "asset",
  "assets",
  "brand",
  "brands",
  "car",
  "cars",
  "declaration",
  "declared",
  "gift",
  "gifts",
  "house",
  "houses",
  "item",
  "items",
  "latest",
  "majetok",
  "majetku",
  "model",
  "models",
  "new",
  "old",
  "has",
  "have",
  "own",
  "owned",
  "owner",
  "owners",
  "owns",
  "property",
  "vehicle",
  "vehicles",
  "whose",
  "znacka",
  "znacky",
  "byt",
  "dom",
  "garaz",
  "hnutelna",
  "hnutelne",
  "hnutelnej",
  "nehnutelnost",
  "nehnutelnosti",
  "pozemok",
  "vec",
  "veci",
  "vozidlo",
  "vozidla",
]);

const GLOBAL_SEARCH_STOP_WORDS = new Set([
  ...ASSET_SEARCH_STOP_WORDS,
  "activity",
  "activities",
  "benefit",
  "benefits",
  "business",
  "candidate",
  "club",
  "debt",
  "debts",
  "email",
  "employment",
  "function",
  "functions",
  "gift",
  "gifts",
  "income",
  "incompatibility",
  "job",
  "jobs",
  "liability",
  "liabilities",
  "loan",
  "loans",
  "mortgage",
  "party",
  "region",
  "residence",
  "salary",
  "vote",
  "votes",
  "voting",
  "website",
  "work",
]);

const SOURCE_FILTER_PATTERNS = [
  { sourceKeys: ["giftsOrBenefits"], pattern: /(gift|gifts|benefit|benefits|dar|dary|vyhod)/ },
  { sourceKeys: ["liabilities"], pattern: /(liabilit|debt|debts|loan|loans|mortgage|uver|zavaz|hypotek)/ },
  { sourceKeys: ["employment", "businessActivities", "publicFunctionsDuringTerm"], pattern: /(employment|job|jobs|work|works|working|zamestnan|prac)/ },
  { sourceKeys: ["businessActivities"], pattern: /(business|company|companies|firm|firms|podnik|firma|spolocnost)/ },
  { sourceKeys: ["publicFunctionsDuringTerm", "publicFunction"], pattern: /(public function|function|functions|board|statutar|riadia|funkci)/ },
  { sourceKeys: ["realEstate", "usageRealEstate"], pattern: /(real estate|property|properties|house|houses|apartment|apartments|flat|land|garage|garaz|dom|byt|nehnutel|pozemok)/ },
  { sourceKeys: ["movableAssets", "usageMovableAssets"], pattern: /(car|cars|vehicle|vehicles|auto|automobile|motor|truck|boat|bike|motorcycle|volvo|bmw|audi|tesla|skoda|toyota|ford|mercedes|hnutel|vozid)/ },
  { sourceKeys: ["propertyRights"], pattern: /(property right|property rights|share|shares|stock|stocks|equity|stake|podiel|akci)/ },
  { sourceKeys: ["voting"], pattern: /(vote|votes|voting|hlasov|hlasovani)/ },
  { sourceKeys: ["income"], pattern: /(income text|salary text|income|salary|prijem|prijmy|zarab)/ },
  { sourceKeys: ["incompatibility"], pattern: /(incompatib|conflict|nezlucitel)/ },
  { sourceKeys: ["candidateParty"], pattern: /(candidate party|party|stran)/ },
  { sourceKeys: ["parliamentaryClub"], pattern: /(club|parliamentary club|klub)/ },
  { sourceKeys: ["region"], pattern: /(region|kraj)/ },
  { sourceKeys: ["residence"], pattern: /(residence|address|city|town|village|bydlisko|mesto|obec)/ },
  { sourceKeys: ["email"], pattern: /(email|mail)/ },
  { sourceKeys: ["website"], pattern: /(website|web|url|site)/ },
];

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

function formatDecimal(value, digits = 3) {
  return toNumber(value).toFixed(digits);
}

function truncateText(value, maxLength = 140) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function slugifyText(value) {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "results";
}

function stripSourcePrefix(sourceLabel, itemText) {
  const text = String(itemText || "").trim();
  const prefix = `${String(sourceLabel || "").trim()}:`;
  if (prefix !== ":" && text.startsWith(prefix)) {
    return text.slice(prefix.length).trim();
  }

  return text;
}

function getSourceTableNames(sourceKeys = []) {
  return Array.from(new Set(
    sourceKeys
      .map((sourceKey) => SOURCE_KEY_TABLES[sourceKey] || sourceKey)
      .filter(Boolean),
  ));
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

function sanitizePlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return null;
  }

  const intent = typeof rawPlan.intent === "string" && SUPPORTED_INTENTS.has(rawPlan.intent)
    ? rawPlan.intent
    : null;
  const limit = Number.isFinite(Number(rawPlan.limit))
    ? clamp(Number(rawPlan.limit), 1, MAX_LIMIT)
    : null;
  const year = Number.isFinite(Number(rawPlan.year)) ? Number(rawPlan.year) : null;
  const partyOrClub = typeof rawPlan.partyOrClub === "string" && rawPlan.partyOrClub.trim()
    ? rawPlan.partyOrClub.trim().slice(0, 120)
    : null;
  const searchTerms = Array.isArray(rawPlan.searchTerms)
    ? Array.from(new Set(
      rawPlan.searchTerms
        .map((term) => String(term || "").trim())
        .filter((term) => term.length >= 2),
    )).slice(0, 6)
    : [];
  const sourceKeys = Array.isArray(rawPlan.sourceKeys)
    ? Array.from(new Set(
      rawPlan.sourceKeys
        .map((sourceKey) => String(sourceKey || "").trim())
        .filter(Boolean),
    )).slice(0, 12)
    : [];

  return {
    intent,
    limit,
    year,
    partyOrClub,
    searchTerms,
    sourceKeys,
  };
}

function extractQuotedTerms(question) {
  return Array.from(
    String(question || "").matchAll(/"([^"]+)"|'([^']+)'/g),
    (match) => match[1] || match[2] || "",
  )
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
}

function extractUppercaseTerms(question) {
  return Array.from(
    String(question || "").matchAll(/\b[A-Z0-9-]{3,}\b/g),
    (match) => match[0],
  ).filter((value) => !/^\d+$/.test(value));
}

function extractSourceKeys(question, plan = null, fallbackSourceKeys = []) {
  const plannedSourceKeys = Array.isArray(plan?.sourceKeys) ? plan.sourceKeys : [];
  if (plannedSourceKeys.length) {
    return plannedSourceKeys;
  }

  const normalizedQuestion = normalizeText(question);
  const sourceKeys = new Set();
  for (const candidate of SOURCE_FILTER_PATTERNS) {
    if (!candidate.pattern.test(normalizedQuestion)) {
      continue;
    }

    for (const sourceKey of candidate.sourceKeys) {
      sourceKeys.add(sourceKey);
    }
  }

  if (!sourceKeys.size && Array.isArray(fallbackSourceKeys)) {
    for (const sourceKey of fallbackSourceKeys) {
      sourceKeys.add(sourceKey);
    }
  }

  return Array.from(sourceKeys);
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

function detectIntent(question, plan = null) {
  if (plan?.intent && plan.intent !== "unknown") {
    return plan.intent;
  }

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

  if (
    (/(who has|who owns|find|show|najdi|kto ma|kto vlastni|ktory ma|ktora ma|ukaz)/.test(normalizedQuestion)
      && /(brand|model|car|vehicle|auto|house|apartment|land|gift|volvo|bmw|audi|tesla|skoda|toyota|ford|mercedes|motorcycle|motorcycles|motorbike|motorka|motorku|motocyk|sperk|sperky|jewelry|jewellery|diamond|zlato|retiazka|naramok|prsten|nehnutel|hnutel|byt|dom|pozemok|garaz|znack)/.test(normalizedQuestion))
    || /(brand|model|car|vehicle|auto|house|apartment|land|gift|volvo|bmw|audi|tesla|skoda|toyota|ford|mercedes|motorcycle|motorcycles|motorbike|motorka|motorku|motocyk|sperk|sperky|jewelry|jewellery|diamond|zlato|retiazka|naramok|prsten|nehnutel|hnutel|byt|dom|pozemok|garaz|znack)/.test(normalizedQuestion)
  ) {
    return "assetSearch";
  }

  if (/(who is|tell me about|show me|find|najdi|kto je|povedz mi o|info o|detail)/.test(normalizedQuestion)) {
    return "profile";
  }

  if (extractSourceKeys(question, plan).length || extractQuotedTerms(question).length || extractUppercaseTerms(question).length) {
    return "textSearch";
  }

  return "profile";
}

function buildSearchTokens(question) {
  return normalizeText(question)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !STOP_WORDS.has(token));
}

function expandSearchTerms(terms) {
  const expanded = new Map();

  const appendTerm = (term) => {
    const normalized = normalizeText(term);
    if (!normalized || normalized.length < 2 || expanded.has(normalized)) {
      return;
    }

    expanded.set(normalized, term);
  };

  const appendStemVariants = (normalized) => {
    const endings = ["ami", "ou", "ov", "y", "i", "u", "a", "e"];
    for (const ending of endings) {
      if (normalized.endsWith(ending) && normalized.length - ending.length >= 4) {
        appendTerm(normalized.slice(0, -ending.length));
      }
    }
  };

  for (const term of terms || []) {
    const cleaned = String(term || "").trim();
    if (cleaned.length < 2) {
      continue;
    }

    const normalized = normalizeText(cleaned);
    appendTerm(cleaned);
    appendStemVariants(normalized);

    const candidateKeys = [normalized];
    if (normalized.endsWith("s") && normalized.length > 3) {
      candidateKeys.push(normalized.slice(0, -1));
    }

    for (const candidateKey of candidateKeys) {
      const synonyms = SEARCH_TERM_SYNONYMS[candidateKey] || [];
      for (const synonym of synonyms) {
        appendTerm(synonym);
      }
    }
  }

  return Array.from(expanded.values()).slice(0, 10);
}

function buildAssetSearchTerms(question, plan = null) {
  const plannedTerms = Array.isArray(plan?.searchTerms) ? plan.searchTerms : [];
  if (plannedTerms.length) {
    return plannedTerms;
  }

  const terms = [
    ...extractQuotedTerms(question),
    ...extractUppercaseTerms(question),
    ...buildSearchTokens(question).filter((token) => !ASSET_SEARCH_STOP_WORDS.has(token)),
  ];

  const uniqueTerms = new Map();
  for (const term of terms) {
    const cleaned = String(term || "").trim();
    if (cleaned.length < 2) {
      continue;
    }

    const key = normalizeText(cleaned);
    if (!key || uniqueTerms.has(key)) {
      continue;
    }

    uniqueTerms.set(key, cleaned);
  }

  return expandSearchTerms(Array.from(uniqueTerms.values()).slice(0, 6));
}

function buildGlobalSearchTerms(question, plan = null) {
  const plannedTerms = Array.isArray(plan?.searchTerms) ? plan.searchTerms : [];
  if (plannedTerms.length) {
    return plannedTerms;
  }

  const terms = [
    ...extractQuotedTerms(question),
    ...extractUppercaseTerms(question),
    ...buildSearchTokens(question).filter((token) => !GLOBAL_SEARCH_STOP_WORDS.has(token)),
  ];

  const uniqueTerms = new Map();
  for (const term of terms) {
    const cleaned = String(term || "").trim();
    if (cleaned.length < 2) {
      continue;
    }

    const key = normalizeText(cleaned);
    if (!key || uniqueTerms.has(key)) {
      continue;
    }

    uniqueTerms.set(key, cleaned);
  }

  return expandSearchTerms(Array.from(uniqueTerms.values()).slice(0, 6));
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

function buildAssetMatchCard(row, match) {
  const card = buildCard(row, "Latest declaration asset match");
  card.contextLabel = `${match.asset_source_label} in latest declaration`;
  card.related = [
    { label: "Matched asset", value: truncateText(match.item_text, 120) },
    { label: "Asset type", value: match.asset_source_label || "-" },
    { label: "Match count", value: formatInteger(match.politician_match_count) },
    { label: "Klub", value: row.parliamentary_club || "-" },
  ];
  return card;
}

function buildTextMatchCard(row, match) {
  const card = buildCard(row, "Latest snapshot text match");
  card.contextLabel = `${match.source_label} in latest stored snapshot`;
  card.related = [
    { label: "Matched text", value: truncateText(match.item_text, 120) },
    { label: "Source", value: match.source_label || "-" },
    { label: "Match count", value: formatInteger(match.politician_match_count) },
    { label: "Klub", value: row.parliamentary_club || "-" },
  ];
  return card;
}

function compareMatches(left, right) {
  return toNumber(right.term_match_count) - toNumber(left.term_match_count)
    || toNumber(right.semantic_similarity) - toNumber(left.semantic_similarity)
    || toNumber(right.declaration_year) - toNumber(left.declaration_year)
    || String(left.item_text || "").length - String(right.item_text || "").length
    || String(left.item_text || "").localeCompare(String(right.item_text || ""), "sk");
}

function buildMatchGroups(matches) {
  const groups = new Map();

  for (const match of matches) {
    if (!match.row) {
      continue;
    }

    let group = groups.get(match.politician_id);
    if (!group) {
      group = {
        politicianId: match.politician_id,
        row: match.row,
        matches: [],
        totalMatchCount: 0,
        bestTermMatchCount: 0,
        bestSemanticSimilarity: 0,
        sourceLabels: new Set(),
        sourceTables: new Set(),
        bestMatch: null,
      };
      groups.set(match.politician_id, group);
    }

    group.matches.push(match);
    group.totalMatchCount += 1;
    group.bestTermMatchCount = Math.max(group.bestTermMatchCount, toNumber(match.term_match_count));
    group.bestSemanticSimilarity = Math.max(group.bestSemanticSimilarity, toNumber(match.semantic_similarity));
    group.sourceLabels.add(match.source_label || match.source_key);
    group.sourceTables.add(SOURCE_KEY_TABLES[match.source_key] || match.source_key);

    if (!group.bestMatch || compareMatches(match, group.bestMatch) < 0) {
      group.bestMatch = match;
    }
  }

  return Array.from(groups.values()).sort((left, right) => (
    right.totalMatchCount - left.totalMatchCount
    || right.bestTermMatchCount - left.bestTermMatchCount
    || right.bestSemanticSimilarity - left.bestSemanticSimilarity
    || String(left.row.full_name || "").localeCompare(String(right.row.full_name || ""), "sk")
  ));
}

function buildStructuredMatchCard(group, contextPrefix = "Database match") {
  const match = group.bestMatch;
  const sourceTables = Array.from(group.sourceTables).join(", ");
  const sourceLabels = Array.from(group.sourceLabels).join(", ");

  return {
    ...buildCard(group.row, contextPrefix),
    contextLabel: `${match?.source_label || "Match"} in declaration ${match?.declaration_year || "-"} • ${formatInteger(group.totalMatchCount)} records`,
    related: [
      { label: "Best matched record", value: truncateText(stripSourcePrefix(match?.source_label, match?.item_text), 120) },
      { label: "Matching records", value: formatInteger(group.totalMatchCount) },
      { label: "Matched sources", value: truncateText(sourceLabels, 60) || "-" },
      { label: "Target tables", value: truncateText(sourceTables, 60) || "-" },
    ],
  };
}

function buildResultTable(question, intent, matches, sourceKeys, year) {
  const sourceTableNames = getSourceTableNames(matches.length ? matches.map((match) => match.source_key) : sourceKeys);

  return {
    title: `All matching records (${formatInteger(matches.length)})`,
    description: sourceTableNames.length
      ? `Sorted by match strength from ${sourceTableNames.join(", ")}.`
      : "Sorted by match strength from the searched database sources.",
    exportFileName: `chatbot-${intent}-${slugifyText(question)}${year ? `-${year}` : ""}.csv`,
    columns: [
      { key: "politician", label: "Politician", linkKey: "detailLink" },
      { key: "partyOrClub", label: "Party / club" },
      { key: "declarationYear", label: "Year" },
      { key: "sourceLabel", label: "Source" },
      { key: "sourceTable", label: "Table" },
      { key: "matchedText", label: "Matched record" },
      { key: "politicianMatchCount", label: "Records for politician" },
      { key: "termMatches", label: "Term hits" },
      { key: "semanticScore", label: "Semantic" },
    ],
    rows: matches.map((match) => ({
      politician: match.row.full_name || match.row.nrsr_user_id || "-",
      detailLink: `/detail.html?id=${encodeURIComponent(match.row.id)}`,
      partyOrClub: getDisplayParty(match.row),
      declarationYear: match.declaration_year ? String(match.declaration_year) : "-",
      sourceLabel: match.source_label || match.source_key || "-",
      sourceTable: SOURCE_KEY_TABLES[match.source_key] || match.source_key || "-",
      matchedText: stripSourcePrefix(match.source_label, match.item_text),
      politicianMatchCount: formatInteger(match.politician_match_count),
      termMatches: formatInteger(match.term_match_count),
      semanticScore: formatDecimal(match.semantic_similarity),
    })),
  };
}

function buildStructuredSearchResponse({ question, intent, heading, limit, partyOrClub, year, searchTerms, sourceKeys, matches }) {
  if (!matches.length) {
    return {
      ...buildNoResultsResponse(question, partyOrClub, year),
      relatedFacts: [
        ...(partyOrClub ? [{ label: "Filter", value: partyOrClub }] : []),
        ...(year ? [{ label: "Rok", value: String(year) }] : []),
        ...(searchTerms.length ? [{ label: "Search terms", value: searchTerms.join(", ") }] : []),
        ...(sourceKeys.length ? [{ label: "Target tables", value: getSourceTableNames(sourceKeys).join(", ") }] : []),
      ],
      suggestions: buildSuggestions(intent, []),
    };
  }

  const groups = buildMatchGroups(matches);
  const leader = groups[0];
  const actualSourceKeys = Array.from(new Set(matches.map((match) => match.source_key).filter(Boolean)));
  const actualTables = getSourceTableNames(actualSourceKeys);
  const querySummary = searchTerms.length ? searchTerms.join(", ") : formatSourceLabelSummary(actualSourceKeys);

  return {
    ok: true,
    question,
    intent,
    heading,
    answer: `${leader.row.full_name} is the strongest match for ${querySummary} with ${formatInteger(leader.totalMatchCount)} matching records. The table below lists ${formatInteger(matches.length)} matching database records.`,
    relatedFacts: [
      ...(partyOrClub ? [{ label: "Filter", value: partyOrClub }] : []),
      ...(year ? [{ label: "Rok", value: String(year) }] : []),
      ...(searchTerms.length ? [{ label: "Search terms", value: searchTerms.join(", ") }] : []),
      ...(actualTables.length ? [{ label: "Target tables", value: actualTables.join(", ") }] : []),
      { label: "Politicians", value: formatInteger(groups.length) },
      { label: "Records", value: formatInteger(matches.length) },
    ],
    cards: groups.slice(0, limit).map((group) => buildStructuredMatchCard(group, heading)),
    table: buildResultTable(question, intent, matches, actualSourceKeys, year),
    suggestions: buildSuggestions(intent, groups.slice(0, limit).map((group) => group.row)),
  };
}

function formatSourceLabelSummary(sourceKeys) {
  const labels = Array.from(new Set(
    sourceKeys
      .map((sourceKey) => SOURCE_KEY_LABELS[sourceKey] || sourceKey)
      .filter(Boolean),
  ));

  return labels.join(", ");
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
  if (intent === "assetSearch") {
    return [
      "Who has a car with brand VOLVO?",
      "Who has the most assets?",
      "Show the top 5 highest-income politicians.",
    ];
  }

  if (intent === "textSearch") {
    return [
      "Who has gifts?",
      "Who has liabilities?",
      "Which politicians mention Bratislava?",
    ];
  }

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

async function buildAssetSearchResult(question, rows, limit, partyOrClub, year, plan) {
  const searchTerms = buildAssetSearchTerms(question, plan);
  if (!searchTerms.length) {
    return buildNoResultsResponse(question, partyOrClub, year);
  }

  const datasetById = new Map(rows.map((row) => [row.id, row]));
  const matches = await searchSearchableRecords({
    searchTerms,
    sourceKeys: ASSET_SOURCE_KEYS,
    year,
    limit: TABLE_RESULT_LIMIT,
  });

  const filteredMatches = matches
    .map((match) => ({
      ...match,
      row: datasetById.get(match.politician_id),
    }))
    .filter((match) => match.row)
    .filter((match) => matchesPartyOrClub(match.row, partyOrClub));

  return buildStructuredSearchResponse({
    question,
    intent: "assetSearch",
    heading: "Matching asset records",
    limit,
    partyOrClub,
    year,
    searchTerms,
    sourceKeys: ASSET_SOURCE_KEYS,
    matches: filteredMatches,
  });
}

async function buildTextSearchResult(question, rows, limit, partyOrClub, year, plan, fallbackSourceKeys = []) {
  const sourceKeys = extractSourceKeys(question, plan, fallbackSourceKeys);
  const searchTerms = buildGlobalSearchTerms(question, plan);
  if (!searchTerms.length && !sourceKeys.length) {
    return buildNoResultsResponse(question, partyOrClub, year);
  }

  const datasetById = new Map(rows.map((row) => [row.id, row]));
  const matches = await searchSearchableRecords({
    searchTerms,
    sourceKeys,
    year,
    limit: TABLE_RESULT_LIMIT,
  });

  const filteredMatches = matches
    .map((match) => ({
      ...match,
      row: datasetById.get(match.politician_id),
    }))
    .filter((match) => match.row)
    .filter((match) => matchesPartyOrClub(match.row, partyOrClub));

  return buildStructuredSearchResponse({
    question,
    intent: "textSearch",
    heading: "Database matches",
    limit,
    partyOrClub,
    year,
    searchTerms,
    sourceKeys,
    matches: filteredMatches,
  });
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

export async function answerChatbotQuestion(question, rawPlan = null) {
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) {
    throw new Error("Question is required.");
  }

  const plan = sanitizePlan(rawPlan);
  const dataset = await listPoliticians(10000);
  const limit = plan?.limit ?? getQueryLimit(trimmedQuestion);
  const year = plan?.year ?? getQueryYear(trimmedQuestion);
  const partyOrClub = plan?.partyOrClub ?? inferPartyOrClub(trimmedQuestion, dataset);
  const intent = detectIntent(trimmedQuestion, plan);

  if (intent === "assetSearch") {
    const assetResult = await buildAssetSearchResult(trimmedQuestion, dataset, limit, partyOrClub, year, plan);
    if (assetResult.intent !== "no-results") {
      return assetResult;
    }

    // If strict asset matching fails, fall back to broad text match while keeping the user filters.
    const fallback = await buildTextSearchResult(
      trimmedQuestion,
      dataset,
      limit,
      partyOrClub,
      year,
      plan,
      ASSET_SOURCE_KEYS,
    );
    return fallback.intent === "no-results" ? assetResult : fallback;
  }

  if (intent === "textSearch") {
    return buildTextSearchResult(trimmedQuestion, dataset, limit, partyOrClub, year, plan);
  }

  if (intent === "unknown") {
    const fallback = await buildTextSearchResult(trimmedQuestion, dataset, limit, partyOrClub, year, plan);
    return fallback.intent === "no-results" ? buildUnknownResponse(trimmedQuestion) : fallback;
  }

  const result = buildIntentResult(intent, trimmedQuestion, dataset, limit, partyOrClub, year);
  if (intent === "profile" && result.intent === "no-results") {
    const fallback = await buildTextSearchResult(trimmedQuestion, dataset, limit, partyOrClub, year, plan);
    if (fallback.intent !== "no-results") {
      return fallback;
    }
  }

  return result;
}