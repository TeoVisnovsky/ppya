const params = new URLSearchParams(window.location.search);
const politicianId = params.get("id");
const requestedDeclarationId = params.get("declarationId");

const elements = {
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  declarationSelect: document.querySelector("#declarationSelect"),
  profileMeta: document.querySelector("#profileMeta"),
  summaryList: document.querySelector("#summaryList"),
  timelineContainer: document.querySelector("#timelineContainer"),
  realEstateContainer: document.querySelector("#realEstateContainer"),
  movableAssetsContainer: document.querySelector("#movableAssetsContainer"),
  riskSummary: document.querySelector("#riskSummary"),
  riskFlags: document.querySelector("#riskFlags"),
  categoriesContainer: document.querySelector("#categoriesContainer"),
  socialMediaIcons: document.querySelector("#socialMediaIcons"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStructuredLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStructuredItem(item, delimiter, firstColumnLabel, specialHandlers = []) {
  const record = {};
  const parts = String(item || "")
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return { [firstColumnLabel]: "-" };
  }

  record[firstColumnLabel] = parts[0];

  for (const rawPart of parts.slice(1)) {
    const specialHandler = specialHandlers.find((handler) => handler.test(rawPart));
    if (specialHandler) {
      const [label, value] = specialHandler.parse(rawPart);
      record[label] = value;
      continue;
    }

    const separatorIndex = rawPart.indexOf(":");
    if (separatorIndex !== -1) {
      const label = normalizeStructuredLabel(rawPart.slice(0, separatorIndex));
      const value = normalizeStructuredLabel(rawPart.slice(separatorIndex + 1));
      record[label] = value;
      continue;
    }

    const fallbackKey = `Poznamka ${Object.keys(record).length}`;
    record[fallbackKey] = rawPart;
  }

  return record;
}

function parseRealEstateItem(item) {
  return parseStructuredItem(item, ";", "Typ", [
    {
      test(value) {
        return /^kat\.\s*územie\s+/i.test(value);
      },
      parse(value) {
        return ["Kat. uzemie", value.replace(/^kat\.\s*územie\s+/i, "").trim()];
      },
    },
  ]);
}

function parseMovableAssetItem(item) {
  return parseStructuredItem(item, ",", "Vec");
}

function getStructuredCategoryRows(categoryKey, items) {
  if (categoryKey === "realEstate") {
    return items.map(parseRealEstateItem);
  }

  if (categoryKey === "movableAssets") {
    return items.map(parseMovableAssetItem);
  }

  return null;
}

function renderStructuredCategoryTable(categoryKey, items) {
  const rows = getStructuredCategoryRows(categoryKey, items);
  if (!rows || !rows.length) {
    return null;
  }

  const columns = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }

  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns.map((column) => `<td>${escapeHtml(row[column] || "-")}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="detail-table-wrap">
      <table class="detail-category-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderCategoryCard(categoryKey, category) {
  if (!category?.items?.length) {
    return `
      <article class="category-card category-card-empty">
        <h3>${escapeHtml(category?.label || "Bez nazvu")}</h3>
        <p class="category-empty">Bez zaznamu.</p>
      </article>
    `;
  }

  const structuredTable = renderStructuredCategoryTable(categoryKey, category.items);
  if (structuredTable) {
    return `
      <article class="category-card category-card-structured">
        <h3>${escapeHtml(category.label)}</h3>
        ${structuredTable}
      </article>
    `;
  }

  return `
    <article class="category-card">
      <h3>${escapeHtml(category.label)}</h3>
      <ul>
        ${category.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderSummary(activeDeclaration) {
  const items = [
    ["Interne cislo", escapeHtml(activeDeclaration.internal_number || "-"), false],
    ["ID oznamenia", escapeHtml(activeDeclaration.declaration_identifier || "-"), false],
    ["Rok", escapeHtml(activeDeclaration.declaration_year || "-"), false],
    ["Podane", escapeHtml(activeDeclaration.submitted_when || "-"), false],
    ["Verejna funkcia", escapeHtml(activeDeclaration.public_function || "-"), false],
    ["Prijmy", escapeHtml(activeDeclaration.income_text || "-"), false],
    ["Prijmy z verejnej funkcie", escapeHtml(activeDeclaration.public_function_income_amount || "-"), false],
    ["Ine prijmy", escapeHtml(activeDeclaration.other_income_amount || "-"), false],
    ["Prijmy spolu", escapeHtml(activeDeclaration.total_income_amount || "-"), false],
    ["Podiel platu na prijmoch", escapeHtml(activeDeclaration.salary_to_income_ratio ?? "-"), false],
    ["Ine prijmy / priemerna rocna mzda", escapeHtml(activeDeclaration.other_income_to_average_salary_ratio ?? "-"), false],
    ["Pocet majetkovych poloziek", escapeHtml(activeDeclaration.asset_item_count ?? 0), false],
    ["Pocet vedlajsich aktivit", escapeHtml(activeDeclaration.side_job_count ?? 0), false],
    ["Nezlucitelnost", escapeHtml(activeDeclaration.incompatibility || "-"), false],
    [
      "Zdroj",
      activeDeclaration.source_url
        ? `<a href="${escapeHtml(activeDeclaration.source_url)}" target="_blank" rel="noreferrer">otvorit zdroj</a>`
        : "-",
      true,
    ],
  ];

  elements.summaryList.innerHTML = items
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${value}</dd>
        </div>
      `,
    )
    .join("");
}

function getSocialMediaIcons() {
  return [
    {
      platform: 'instagram',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2zm0 2C5.7 4 4 5.7 4 7.8v8.4c0 2.1 1.7 3.8 3.8 3.8h8.4c2.1 0 3.8-1.7 3.8-3.8V7.8c0-2.1-1.7-3.8-3.8-3.8H7.8zm8.5 3.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm-4.3 2a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm0 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>'
    },
    {
      platform: 'facebook',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9h-3v5h-2v-5h-3V7h3V5.5c0-1.1.9-2 2-2h3v2h-3v1.5h3v2z"/></svg>'
    },
    {
      platform: 'x',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.637l-5.206-6.807-5.979 6.807h-3.308l7.73-8.835L2.6 2.25h6.636l4.973 6.572 5.735-6.572zM17.55 19.5h1.828L6.281 4.05H4.306l13.244 15.45z"/></svg>'
    },
    {
      platform: 'linkedin',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.48-2.23-1.67-2.23-.91 0-1.45.61-1.69 1.21-.09.21-.11.5-.11.79v5.8h-3.54s.05-9.41 0-10.39h3.54v1.47c.46-.71 1.28-1.72 3.11-1.72 2.27 0 3.97 1.48 3.97 4.66v5.98zM5.37 8.43c-1.14 0-1.88-.76-1.88-1.71 0-.96.73-1.71 1.92-1.71s1.87.75 1.93 1.71c0 .95-.73 1.71-1.97 1.71zm-1.68 12.02h3.55V9.04H3.69v11.41z"/></svg>'
    }
  ];
}

function renderSocialMediaIcons() {
  const icons = getSocialMediaIcons();
  
  elements.socialMediaIcons.innerHTML = `
    <div class="social-icons-container">
      ${icons.map(icon => `
        <div class="social-icon social-icon-${icon.platform}" title="${icon.platform}" aria-label="${icon.platform}">
          ${icon.svg}
        </div>
      `).join('')}
    </div>
  `;
}

function renderProfileMeta(politician) {
  const items = [
    ["Kandidoval(a) za", politician.candidate_party || "-"],
    ["Parlamentny klub", politician.parliamentary_club || "-"],
    [
      "Poslanecke clenstva",
      Array.isArray(politician.parliamentary_memberships) && politician.parliamentary_memberships.length
        ? politician.parliamentary_memberships.join(" | ")
        : "-",
    ],
    [
      "Profil NR SR",
      politician.deputy_profile_url
        ? `<a href="${escapeHtml(politician.deputy_profile_url)}" target="_blank" rel="noreferrer">otvorit profil</a>`
        : "-",
    ],
  ];

  elements.profileMeta.innerHTML = items.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>
  `).join("");
  
  renderSocialMediaIcons();
}

function renderRiskSummary(riskAnalysis) {
  const level = String(riskAnalysis?.risk_level || "none");
  const score = Number(riskAnalysis?.risk_factor) || 0;
  const labels = {
    high: "Vysoke riziko",
    medium: "Stredne riziko",
    low: "Nizke riziko",
    none: "Bez signalov",
  };
  const coefficients = riskAnalysis?.coefficients || {};
  const items = [
    ["Risk faktor", `${labels[level] || labels.none} (${score.toFixed(2)})`],
    ["Tento rok plat / prijmy", coefficients.current_salary_to_income_ratio ?? "-"],
    ["Minuly rok plat / prijmy", coefficients.previous_salary_to_income_ratio ?? "-"],
    ["Pomer tohto a minuleho roku", coefficients.salary_to_income_change_ratio ?? "-"],
    ["Assety tento rok", riskAnalysis?.current_asset_item_count ?? 0],
    ["Assety minuly rok", riskAnalysis?.previous_asset_item_count ?? 0],
    ["Pomer poctu majetkovych poloziek", coefficients.asset_item_count_ratio ?? "-"],
    ["Ine prijmy / priemerna mzda", coefficients.other_income_to_average_salary_ratio ?? "-"],
  ];

  elements.riskSummary.innerHTML = items.map(([label, value]) => `
    <div class="risk-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  const notes = [
    "Vzorec: ((tento rok plat / tento rok prijmy) / (minuly rok plat / minuly rok prijmy)) + (assety tento rok / assety minuly rok) + (ine prijmy / priemerna slovenska mzda).",
  ];

  if (!riskAnalysis?.previous_declaration_id) {
    notes.push("Chyba predchadzajuce priznanie, takze medzirocne pomery mozu byt prazdne.");
  }

  elements.riskFlags.innerHTML = notes.map((note) => `<div class="risk-flag">${escapeHtml(note)}</div>`).join("");
}

function buildMockTimeline(activeDeclaration) {
  const referenceYear = Number(activeDeclaration?.declaration_year) || new Date().getFullYear();
  const baseAssets = Math.max(Number(activeDeclaration?.asset_item_count) || 8, 8);
  const baseIncome = Math.max(Number(activeDeclaration?.total_income_amount) || 48000, 48000);
  const series = [0.72, 0.86, 1].map((multiplier, index) => {
    const year = referenceYear - (2 - index);
    return {
      year,
      assetIndex: Math.round(baseAssets * multiplier),
      incomeIndex: Math.round(baseIncome * multiplier),
    };
  });

  return series;
}

function renderMockTimelineChart(activeDeclaration) {
  const series = buildMockTimeline(activeDeclaration);
  const maxIncome = Math.max(...series.map((point) => point.incomeIndex), 1);
  const stepX = 130;
  const baseY = 164;
  const maxHeight = 110;
  const points = series
    .map((point, index) => {
      const x = 48 + (index * stepX);
      const y = baseY - ((point.incomeIndex / maxIncome) * maxHeight);
      return { ...point, x, y: Number(y.toFixed(1)) };
    });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  elements.timelineContainer.innerHTML = `
    <div class="mock-chart-card">
      <div class="mock-chart-copy">
        <p class="mock-chart-kicker">Mock preview</p>
        <h3>Posledne tri roky</h3>
        <p class="mock-chart-disclaimer">Tento graf je ilustračny a nezobrazuje realne historicke data.</p>
      </div>
      <div class="mock-chart-stage">
        <svg class="mock-chart-svg" viewBox="0 0 360 210" role="img" aria-label="Mock graf poslednych troch rokov">
          <defs>
            <linearGradient id="mock-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="rgba(255,255,255,0.55)" />
              <stop offset="100%" stop-color="rgba(255,255,255,0.95)" />
            </linearGradient>
          </defs>
          <line x1="30" y1="164" x2="330" y2="164" class="mock-chart-axis" />
          <line x1="30" y1="50" x2="30" y2="164" class="mock-chart-axis" />
          <polyline points="${polyline}" class="mock-chart-line" />
          ${points.map((point) => `
            <g>
              <line x1="${point.x}" y1="${point.y}" x2="${point.x}" y2="164" class="mock-chart-guide" />
              <circle cx="${point.x}" cy="${point.y}" r="6" class="mock-chart-point" />
              <text x="${point.x}" y="186" text-anchor="middle" class="mock-chart-label">${escapeHtml(point.year)}</text>
            </g>
          `).join("")}
        </svg>
      </div>
      <div class="mock-chart-metrics">
        ${series.map((point) => `
          <div class="mock-chart-metric">
            <span>${escapeHtml(point.year)}</span>
            <strong>${escapeHtml(point.assetIndex)} poloziek</strong>
            <small>Mock prijmy ${escapeHtml(point.incomeIndex.toLocaleString("sk-SK"))} EUR</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCategories(activeDeclaration) {
  const categories = activeDeclaration?.categories || {};
  const realEstateCategory = categories.realEstate || {
    label: "Vlastnictvo nehnutelnej veci",
    items: [],
  };
  const movableAssetsCategory = categories.movableAssets || {
    label: "Vlastnictvo hnutelnej veci",
    items: [],
  };

  elements.realEstateContainer.innerHTML = renderCategoryCard("realEstate", realEstateCategory);
  elements.movableAssetsContainer.innerHTML = renderCategoryCard("movableAssets", movableAssetsCategory);

  const orderedOtherKeys = [
    "propertyRights",
    "liabilities",
    "income",
    "businessActivities",
    "employment",
    "publicFunctionsDuringTerm",
    "usageRealEstate",
    "usageMovableAssets",
    "giftsOrBenefits",
    "incompatibilityConditions",
  ];

  const remainingCards = orderedOtherKeys
    .filter((categoryKey) => categories[categoryKey])
    .map((categoryKey) => renderCategoryCard(categoryKey, categories[categoryKey]));

  elements.categoriesContainer.innerHTML = remainingCards.length
    ? remainingCards.join("")
    : '<div class="error-box">Zatial nie su k dispozicii dalsie kategorie.</div>';
}

function renderDeclarationOptions(declarations, activeId) {
  elements.declarationSelect.innerHTML = declarations
    .map(
      (declaration) => `
        <option value="${declaration.id}" ${declaration.id === activeId ? "selected" : ""}>
          ${declaration.declaration_year || "bez roku"} | ${declaration.public_function || "bez funkcie"}
        </option>
      `,
    )
    .join("");
}

function renderEmpty() {
  elements.detailSubtitle.textContent = "Pre tohto politika zatial nie je ulozene priznanie.";
  elements.profileMeta.innerHTML = "";
  elements.summaryList.innerHTML = "";
  elements.timelineContainer.innerHTML = "";
  elements.realEstateContainer.innerHTML = '<div class="error-box">Zatial nie su k dispozicii ziadne data.</div>';
  elements.movableAssetsContainer.innerHTML = '<div class="error-box">Zatial nie su k dispozicii ziadne data.</div>';
  elements.riskSummary.innerHTML = "";
  elements.riskFlags.innerHTML = "";
  elements.categoriesContainer.innerHTML = '<div class="error-box">Zatial nie su k dispozicii ziadne data.</div>';
  elements.declarationSelect.innerHTML = "";
}

async function loadDetail(declarationId) {
  if (!politicianId) {
    throw new Error("Chyba parameter id v URL.");
  }

  const query = declarationId ? `?declarationId=${encodeURIComponent(declarationId)}` : "";
  const response = await fetch(`/api/politicians/${encodeURIComponent(politicianId)}${query}`);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Nepodarilo sa nacitat detail politika.");
  }

  const { politician, declarations, activeDeclaration, timeline, riskAnalysis } = payload.detail;
  elements.detailTitle.textContent = politician.full_name || politician.nrsr_user_id;
  elements.detailSubtitle.textContent = `${politician.nrsr_user_id} | ${declarations.length} priznani v databaze`;
  renderProfileMeta(politician);
  renderRiskSummary(riskAnalysis);

  if (!activeDeclaration) {
    renderEmpty();
    return;
  }

  renderDeclarationOptions(declarations, activeDeclaration.id);
  renderSummary(activeDeclaration);
  renderMockTimelineChart(activeDeclaration, timeline);
  renderCategories(activeDeclaration);
}

function renderError(error) {
  elements.detailSubtitle.textContent = "Chyba pri nacitani detailu";
  elements.profileMeta.innerHTML = "";
  elements.summaryList.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
  elements.timelineContainer.innerHTML = "";
  elements.realEstateContainer.innerHTML = "";
  elements.movableAssetsContainer.innerHTML = "";
  elements.riskSummary.innerHTML = "";
  elements.riskFlags.innerHTML = "";
  elements.categoriesContainer.innerHTML = "";
}

elements.declarationSelect.addEventListener("change", (event) => {
  const nextDeclarationId = event.target.value;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("id", politicianId);
  nextUrl.searchParams.set("declarationId", nextDeclarationId);
  window.history.replaceState({}, "", nextUrl);
  loadDetail(nextDeclarationId).catch(renderError);
});

loadDetail(requestedDeclarationId).catch(renderError);
