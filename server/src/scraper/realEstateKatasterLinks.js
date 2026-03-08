import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOOKUP_PATH = path.resolve(__dirname, "../data/cadastral-area-lookup.json");
const PDF_URL_BASE = "https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic";

const MANUAL_ITEM_URL_OVERRIDES = new Map([
  [
    JSON.stringify({
      politicianFullName: "JUDr. ROBERT KALIŇÁK",
      itemText: "BYT; kat. územie BRATISLAVA - STARÉ MESTO; číslo LV: 6227; podiel: 1/2",
    }),
    [
      "https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic?prfNumber=6227&cadastralUnitCode=804096&outputType=pdf",
    ],
  ],
  [
    JSON.stringify({
      politicianFullName: "JUDr. ROBERT KALIŇÁK",
      itemText: "BYT; kat. územie BRATISLAVA - STARÉ MESTO; číslo LV: 8520; podiel: 1/2",
    }),
    [
      "https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic?prfNumber=8520&cadastralUnitCode=804096&outputType=pdf",
    ],
  ],
  [
    JSON.stringify({
      politicianFullName: "JUDr. ROBERT KALIŇÁK",
      itemText: "GARÁŽ; kat. územie BRATISLAVA - STARÉ MESTO; číslo LV: 8520; podiel: 1/2",
    }),
    [
      "https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic?prfNumber=8520&cadastralUnitCode=804096&outputType=pdf",
    ],
  ],
]);

let lookupCachePromise = null;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[-,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function deduplicate(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function loadLookup() {
  if (!lookupCachePromise) {
    lookupCachePromise = fs.readFile(LOOKUP_PATH, "utf8")
      .then((content) => JSON.parse(content))
      .then((payload) => {
        const records = Array.isArray(payload?.records) ? payload.records : [];
        const byNormalizedName = new Map(
          records
            .filter((record) => record && typeof record.normalizedName === "string")
            .map((record) => [record.normalizedName, record]),
        );

        return {
          ...payload,
          records,
          byNormalizedName,
        };
      });
  }

  return lookupCachePromise;
}

export function normalizeCadastralAreaName(value) {
  return normalizeText(value);
}

export function extractCadastralArea(itemText) {
  const match = String(itemText || "").match(/kat\.\s*[úu]zemie\s*([^;]+?)(?=;|$)/i);
  return match?.[1]?.trim() || null;
}

export function extractLandRegisterNumbers(itemText) {
  const text = String(itemText || "");
  const explicitMatch = text.match(/(?:č[ií]slo|cislo)\s*LV\s*:\s*([^;]+?)(?=;|$)/i);
  const fallbackMatch = explicitMatch ? null : text.match(/\bLV\b[^\d]*([\d\s,\/.-]+)(?=;|$)/i);
  const source = explicitMatch?.[1] || fallbackMatch?.[1] || "";
  return deduplicate(Array.from(source.matchAll(/\d+/g), (match) => match[0]));
}

export function buildKatasterPublicPdfUrl({ landRegisterNumber, cadastralUnitCode }) {
  if (!landRegisterNumber || !cadastralUnitCode) {
    return null;
  }

  const url = new URL(PDF_URL_BASE);
  url.searchParams.set("prfNumber", String(landRegisterNumber));
  url.searchParams.set("cadastralUnitCode", String(cadastralUnitCode));
  url.searchParams.set("outputType", "pdf");
  return url.toString();
}

function getManualItemOverride({ politicianFullName, itemText }) {
  if (!politicianFullName || !itemText) {
    return null;
  }

  return MANUAL_ITEM_URL_OVERRIDES.get(JSON.stringify({ politicianFullName, itemText })) || null;
}

export async function resolveCadastralAreaLookup(cadastralArea) {
  const normalizedName = normalizeCadastralAreaName(cadastralArea);
  if (!normalizedName) {
    return {
      cadastralArea: cadastralArea || null,
      normalizedName: null,
      match: null,
    };
  }

  const lookup = await loadLookup();
  return {
    cadastralArea,
    normalizedName,
    match: lookup.byNormalizedName.get(normalizedName) || null,
  };
}

export async function buildRealEstateKatasterLinkRows(itemText, options = {}) {
  const manualOverrideUrls = getManualItemOverride({
    politicianFullName: options.politicianFullName || null,
    itemText,
  });
  const cadastralArea = extractCadastralArea(itemText);
  const landRegisterNumbers = extractLandRegisterNumbers(itemText);
  const normalizedCadastralArea = normalizeCadastralAreaName(cadastralArea);

  if (manualOverrideUrls) {
    return manualOverrideUrls.map((publicPdfUrl, index) => ({
      cadastralArea,
      normalizedCadastralArea,
      matchedDisplayName: cadastralArea,
      cadastralUnitCode: String(new URL(publicPdfUrl).searchParams.get("cadastralUnitCode") || ""),
      landRegisterNumber: String(new URL(publicPdfUrl).searchParams.get("prfNumber") || landRegisterNumbers[index] || ""),
      publicPdfUrl,
      matchStatus: "manual_override",
      isAmbiguous: false,
    }));
  }

  if (!cadastralArea && landRegisterNumbers.length === 0) {
    return [
      {
        cadastralArea,
        normalizedCadastralArea: null,
        matchedDisplayName: null,
        cadastralUnitCode: null,
        landRegisterNumber: null,
        publicPdfUrl: null,
        matchStatus: "missing_both",
        isAmbiguous: false,
      },
    ];
  }

  if (!cadastralArea) {
    return landRegisterNumbers.map((landRegisterNumber) => ({
      cadastralArea: null,
      normalizedCadastralArea: null,
      matchedDisplayName: null,
      cadastralUnitCode: null,
      landRegisterNumber,
      publicPdfUrl: null,
      matchStatus: "missing_cadastral_area",
      isAmbiguous: false,
    }));
  }

  if (landRegisterNumbers.length === 0) {
    return [
      {
        cadastralArea,
        normalizedCadastralArea,
        matchedDisplayName: null,
        cadastralUnitCode: null,
        landRegisterNumber: null,
        publicPdfUrl: null,
        matchStatus: "missing_lv",
        isAmbiguous: false,
      },
    ];
  }

  const { match } = await resolveCadastralAreaLookup(cadastralArea);
  if (!match) {
    return landRegisterNumbers.map((landRegisterNumber) => ({
      cadastralArea,
      normalizedCadastralArea,
      matchedDisplayName: null,
      cadastralUnitCode: null,
      landRegisterNumber,
      publicPdfUrl: null,
      matchStatus: "missing_lookup",
      isAmbiguous: false,
    }));
  }

  const icutjValues = deduplicate(Array.isArray(match.icutjValues) ? match.icutjValues.map(String) : []);
  const matchedDisplayName = Array.isArray(match.displayNames) && match.displayNames.length
    ? match.displayNames[0]
    : cadastralArea;
  const matchStatus = match.isAmbiguous ? "ambiguous_icutj" : "ok";

  return landRegisterNumbers.flatMap((landRegisterNumber) => {
    return icutjValues.map((cadastralUnitCode) => ({
      cadastralArea,
      normalizedCadastralArea,
      matchedDisplayName,
      cadastralUnitCode,
      landRegisterNumber,
      publicPdfUrl: buildKatasterPublicPdfUrl({ landRegisterNumber, cadastralUnitCode }),
      matchStatus,
      isAmbiguous: Boolean(match.isAmbiguous),
    }));
  });
}
