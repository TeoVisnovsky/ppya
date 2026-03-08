import { config } from "../config.js";

const FALLBACK_PRICE_EUR = 28560;
const CAR_ESTIMATE_MAX_EUR = 28560;

const CAR_KEYWORDS = [
  "automobil",
  "auto",
  "vozidlo",
  "motorkar",
  "motorka",
  "motocykel",
];

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return stripDiacritics(value).toLowerCase().trim();
}

function extractAssetFields(itemText) {
  const raw = String(itemText || "").trim();
  const assetType = raw.split(",")[0]?.trim() || null;
  const brandMatch = raw.match(/tov[aá]rensk[aá]\s+zna[cč]ka:\s*([^,]+)/i);
  const yearMatch = raw.match(/rok\s+v[yý]roby:\s*(\d{4})/i);

  return {
    raw,
    assetType,
    brandOrMaker: brandMatch?.[1]?.trim() || null,
    yearOfManufacture: yearMatch ? Number(yearMatch[1]) : null,
  };
}

function isLikelyCarAsset(assetType, rawText) {
  const normalized = normalizeText(`${assetType || ""} ${rawText || ""}`);
  return CAR_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function parsePriceFromLlmContent(content) {
  if (!content) {
    return null;
  }

  const fencedJsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
  const jsonCandidate = fencedJsonMatch?.[1] || content;

  try {
    const parsed = JSON.parse(jsonCandidate);
    const numeric = Number(parsed?.estimated_price_eur);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  } catch {
    const numericMatch = content.match(/"estimated_price_eur"\s*:\s*(\d+(?:\.\d+)?)/i)
      || content.match(/(\d+(?:\.\d+)?)/);
    if (!numericMatch) {
      return null;
    }

    const numeric = Number(numericMatch[1]);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }
}

function buildEstimationPromptPayload(fields) {
  return JSON.stringify({
    task: "Estimate fair market price in EUR.",
    country: "Slovakia",
    asset_type: fields.assetType,
    brand_or_maker: fields.brandOrMaker,
    year_of_manufacture: fields.yearOfManufacture,
    raw_item_text: fields.raw,
    response_schema: { estimated_price_eur: "number" },
  });
}

function joinUrl(baseUrl, suffix) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}

function parseGeminiContent(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

async function estimateCarPriceWithGemini(fields, signal) {
  const endpoint = joinUrl(
    config.aiEstimationApiUrl,
    `${config.aiEstimationModel}:generateContent?key=${encodeURIComponent(config.aiEstimationApiKey)}`,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You estimate current market prices of Slovak movable assets in EUR. Output only JSON with key estimated_price_eur and a numeric value.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildEstimationPromptPayload(fields),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = parseGeminiContent(payload);
  return parsePriceFromLlmContent(content);
}

async function estimateCarPriceWithOpenAiCompatible(fields, signal) {
  const response = await fetch(config.aiEstimationApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiEstimationApiKey}`,
    },
    body: JSON.stringify({
      model: config.aiEstimationModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You estimate current market prices of Slovak movable assets in EUR. Output only JSON with key estimated_price_eur and a numeric value.",
        },
        {
          role: "user",
          content: buildEstimationPromptPayload(fields),
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  return parsePriceFromLlmContent(content);
}

async function estimateCarPriceWithLlm(fields) {
  if (!config.aiEstimationEnabled || !config.aiEstimationApiKey || !config.aiEstimationApiUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiEstimationTimeoutMs);

  try {
    if (String(config.aiEstimationProvider).toLowerCase() === "gemini") {
      return await estimateCarPriceWithGemini(fields, controller.signal);
    }

    return await estimateCarPriceWithOpenAiCompatible(fields, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function estimateMovableAsset(itemText) {
  const fields = extractAssetFields(itemText);
  const looksLikeCar = isLikelyCarAsset(fields.assetType, fields.raw);

  if (!looksLikeCar) {
    return {
      ...fields,
      llmEstimatedPriceEur: null,
      finalPriceEur: FALLBACK_PRICE_EUR,
      estimationSource: "fallback",
      appliedRule: "non_car_or_low_detail_fallback_28560",
      confidence: 0.2,
    };
  }

  const llmEstimate = await estimateCarPriceWithLlm(fields);
  if (!llmEstimate) {
    return {
      ...fields,
      llmEstimatedPriceEur: null,
      finalPriceEur: FALLBACK_PRICE_EUR,
      estimationSource: "fallback",
      appliedRule: "car_estimation_failed_fallback_28560",
      confidence: 0.3,
    };
  }

  const roundedEstimate = Math.round(llmEstimate);
  if (roundedEstimate < CAR_ESTIMATE_MAX_EUR) {
    return {
      ...fields,
      llmEstimatedPriceEur: roundedEstimate,
      finalPriceEur: roundedEstimate,
      estimationSource: "llm",
      appliedRule: "car_estimate_below_28000_use_estimate",
      confidence: 0.65,
    };
  }

  return {
    ...fields,
    llmEstimatedPriceEur: roundedEstimate,
    finalPriceEur: FALLBACK_PRICE_EUR,
    estimationSource: "llm_thresholded",
    appliedRule: "car_estimate_ge_28000_force_28560",
    confidence: 0.55,
  };
}
