const params = new URLSearchParams(window.location.search);
const politicianId = params.get("id");
const requestedDeclarationId = params.get("declarationId");

const elements = {
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  declarationSelect: document.querySelector("#declarationSelect"),
  profileMeta: document.querySelector("#profileMeta"),
  riskSummary: document.querySelector("#riskSummary"),
  riskFlags: document.querySelector("#riskFlags"),
  summaryList: document.querySelector("#summaryList"),
  timelineContainer: document.querySelector("#timelineContainer"),
  categoriesContainer: document.querySelector("#categoriesContainer"),
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
}

function renderRiskSummary(riskAnalysis) {
  const level = String(riskAnalysis?.suspicious_level || "none");
  const score = Number(riskAnalysis?.suspicious_score) || 0;
  const labels = {
    high: "Vysoke riziko",
    medium: "Stredne riziko",
    low: "Nizke riziko",
    none: "Bez signalov",
  };
  const coefficients = riskAnalysis?.coefficients || {};
  const items = [
    ["Skore", `${labels[level] || labels.none} (${score}/100)`],
    ["Tento rok plat / prijmy", coefficients.current_salary_to_income_ratio ?? "-"],
    ["Minuly rok plat / prijmy", coefficients.previous_salary_to_income_ratio ?? "-"],
    ["Zmena pomeru plat / prijmy", coefficients.salary_to_income_ratio_change ?? "-"],
    ["Pomer poctu majetkovych poloziek", coefficients.asset_item_count_ratio ?? "-"],
    ["Ine prijmy / priemerna mzda", coefficients.other_income_to_average_salary_ratio ?? "-"],
  ];

  elements.riskSummary.innerHTML = items.map(([label, value]) => `
    <div class="risk-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  const flags = Array.isArray(riskAnalysis?.flags) ? riskAnalysis.flags : [];
  if (!flags.length) {
    elements.riskFlags.innerHTML = '<p class="category-empty">Zatial bez heuristickych varovnych signalov.</p>';
    return;
  }

  elements.riskFlags.innerHTML = flags.map((flag) => `<div class="risk-flag">${escapeHtml(flag)}</div>`).join("");
}

function renderTimeline(timeline) {
  if (!Array.isArray(timeline) || !timeline.length) {
    elements.timelineContainer.innerHTML = '<div class="error-box">Nie je k dispozicii historia vyvoja.</div>';
    return;
  }

  elements.timelineContainer.innerHTML = `
    <table class="detail-category-table">
      <thead>
        <tr>
          <th>Rok</th>
          <th>Funkcia</th>
          <th>Plat z funkcie</th>
          <th>Ine prijmy</th>
          <th>Prijmy spolu</th>
          <th>Majetkove polozky</th>
          <th>Vedlajsie aktivity</th>
          <th>Ine prijmy / priemerna mzda</th>
        </tr>
      </thead>
      <tbody>
        ${timeline.map((entry) => `
          <tr>
            <td>${escapeHtml(entry.declaration_year || "-")}</td>
            <td>${escapeHtml(entry.public_function || "-")}</td>
            <td>${escapeHtml(entry.public_function_income_amount ?? 0)}</td>
            <td>${escapeHtml(entry.other_income_amount ?? 0)}</td>
            <td>${escapeHtml(entry.total_income_amount ?? 0)}</td>
            <td>${escapeHtml(entry.asset_item_count ?? 0)}</td>
            <td>${escapeHtml(entry.side_job_count ?? 0)}</td>
            <td>${escapeHtml(entry.other_income_to_average_salary_ratio ?? "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCategories(activeDeclaration) {
  const cards = Object.entries(activeDeclaration.categories).map(([categoryKey, category]) => {
    if (!category.items.length) {
      return `
        <article class="category-card">
          <h3>${escapeHtml(category.label)}</h3>
          <p class="category-empty">Bez zaznamu.</p>
        </article>
      `;
    }

    const structuredTable = renderStructuredCategoryTable(categoryKey, category.items);
    if (structuredTable) {
      return `
        <article class="category-card">
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
  });

  elements.categoriesContainer.innerHTML = cards.join("");
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
  elements.riskSummary.innerHTML = "";
  elements.riskFlags.innerHTML = "";
  elements.summaryList.innerHTML = "";
  elements.timelineContainer.innerHTML = "";
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
  renderTimeline(timeline);

  if (!activeDeclaration) {
    renderEmpty();
    return;
  }

  renderDeclarationOptions(declarations, activeDeclaration.id);
  renderSummary(activeDeclaration);
  renderCategories(activeDeclaration);
}

function renderError(error) {
  elements.detailSubtitle.textContent = "Chyba pri nacitani detailu";
  elements.profileMeta.innerHTML = "";
  elements.riskSummary.innerHTML = "";
  elements.riskFlags.innerHTML = "";
  elements.summaryList.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
  elements.timelineContainer.innerHTML = "";
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
