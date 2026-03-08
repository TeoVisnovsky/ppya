const TITLE_TOKENS = new Set([
  "bc",
  "bca",
  "csc",
  "doc",
  "dr",
  "ing",
  "judr",
  "llm",
  "mba",
  "mgr",
  "mudr",
  "mvdr",
  "paeddr",
  "pharmdr",
  "phd",
  "phdr",
  "prof",
  "rndr",
  "rsdr",
  "thdr",
]);

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z,\s-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeName(value) {
  return normalizeName(value)
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .filter((token) => !TITLE_TOKENS.has(token));
}

export function getNameKeys(value) {
  const keys = new Set();
  const normalized = normalizeName(value);
  const tokens = tokenizeName(value);

  if (normalized) {
    keys.add(normalized.replace(/,/g, " ").replace(/\s+/g, " ").trim());
  }

  if (tokens.length > 0) {
    keys.add(tokens.join(" "));
    keys.add([...tokens].sort().join(" "));
    keys.add([tokens[0], tokens[tokens.length - 1]].filter(Boolean).join(" "));
  }

  if (normalized.includes(",")) {
    const [lastNamePart, firstNamePart] = normalized.split(",", 2).map((part) => part.trim());
    if (lastNamePart && firstNamePart) {
      const reordered = `${firstNamePart} ${lastNamePart}`.replace(/\s+/g, " ").trim();
      keys.add(reordered);

      const reorderedTokens = tokenizeName(reordered);
      if (reorderedTokens.length > 0) {
        keys.add(reorderedTokens.join(" "));
        keys.add([...reorderedTokens].sort().join(" "));
        keys.add([reorderedTokens[0], reorderedTokens[reorderedTokens.length - 1]].filter(Boolean).join(" "));
      }
    }
  }

  return Array.from(keys).filter(Boolean);
}

export function buildPoliticianLookup(rows) {
  const matches = new Map();
  const ambiguousKeys = new Set();

  for (const row of rows) {
    for (const key of getNameKeys(row.full_name || row.name)) {
      if (ambiguousKeys.has(key)) {
        continue;
      }

      const existing = matches.get(key);
      if (existing && existing.id !== row.id) {
        matches.delete(key);
        ambiguousKeys.add(key);
        continue;
      }

      matches.set(key, row);
    }
  }

  return { matches, ambiguousKeys };
}

export function matchPolitician(targetContext, sourceName) {
  for (const key of getNameKeys(sourceName)) {
    if (targetContext.ambiguousKeys.has(key)) {
      continue;
    }

    const match = targetContext.matches.get(key);
    if (match) {
      return match;
    }
  }

  return null;
}