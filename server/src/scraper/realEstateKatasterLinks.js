function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractLvNumber(itemText) {
  const normalized = normalizeText(itemText);
  const match = normalized.match(/\b(?:lv|list\s*vlastnictva)\s*[:.]?\s*(\d{1,8})\b/i);
  return match?.[1] || null;
}

function extractCadastralArea(itemText) {
  const normalized = normalizeText(itemText);
  const match = normalized.match(/kat\.\s*[uú]zemie\s*[:.]?\s*([^;]+)/i);
  return match?.[1]?.trim() || null;
}

export async function buildRealEstateKatasterLinkRows(itemText) {
  const lvNumber = extractLvNumber(itemText);
  const cadastralArea = extractCadastralArea(itemText);

  // Keep API shape stable even when we cannot build a reliable public link.
  if (!lvNumber || !cadastralArea) {
    return [];
  }

  return [];
}
