const params = new URLSearchParams(window.location.search);
const politicianId = params.get("id");
const requestedDeclarationId = params.get("declarationId");

const elements = {
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  declarationSelect: document.querySelector("#declarationSelect"),
  profilePhoto: document.querySelector("#profilePhoto"),
  profileContact: document.querySelector("#profileContact"),
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

const realEstateMapState = {
  map: null,
  markersLayer: null,
};

const REAL_ESTATE_GEOCODE_CACHE_KEY = "ppya-real-estate-geocode-cache-v1";
const realEstateGeocodeCache = new Map();

hydrateRealEstateGeocodeCache();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDeputyPhotoSource(politician) {
  if (politician?.deputy_photo_data && politician?.deputy_photo_content_type) {
    return `data:${politician.deputy_photo_content_type};base64,${politician.deputy_photo_data}`;
  }

  return politician?.deputy_photo_url || null;
}

function renderProfilePhoto(politician) {
  const photoSource = getDeputyPhotoSource(politician);
  if (!photoSource) {
    elements.profilePhoto.innerHTML = "";
    return;
  }

  elements.profilePhoto.innerHTML = `
    <div class="profile-photo-card">
      <img src="${escapeHtml(photoSource)}" alt="${escapeHtml(politician.full_name || "Profilova fotografia")}" class="profile-photo-image" />
    </div>
  `;
}

function renderProfileContact(politician) {
  const links = [];

  if (politician?.deputy_email) {
    links.push(`
      <a class="profile-contact-link" href="mailto:${escapeHtml(politician.deputy_email)}">
        ${escapeHtml(politician.deputy_email)}
      </a>
    `);
  }

  if (politician?.deputy_website) {
    links.push(`
      <a class="profile-contact-link" href="${escapeHtml(politician.deputy_website)}" target="_blank" rel="noreferrer">
        Webstranka
      </a>
    `);
  }

  elements.profileContact.innerHTML = links.length
    ? `<div class="profile-contact-card">${links.join("")}</div>`
    : "";
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

function buildRealEstateRows(category) {
  const records = Array.isArray(category?.records) ? category.records : [];
  if (!records.length) {
    return [];
  }

  return records.map((record) => ({
    ...parseRealEstateItem(record.item_text),
    __katasterLinks: Array.isArray(record.kataster_links) ? record.kataster_links : [],
  }));
}

function getStructuredCategoryRows(categoryKey, items) {
  if (categoryKey === "movableAssets") {
    return items.map(parseMovableAssetItem);
  }

  return null;
}

function renderLvButtons(katasterLinks) {
  const usableLinks = katasterLinks.filter((link) => link?.publicPdfUrl);
  if (!usableLinks.length) {
    return '<span class="muted-inline">LV nedostupne</span>';
  }

  return `
    <div class="lv-link-group">
      ${usableLinks.map((link, index) => `
        <a class="table-link lv-link" href="${escapeHtml(link.publicPdfUrl)}" target="_blank" rel="noreferrer">
          ${escapeHtml(usableLinks.length > 1 ? `LV ${index + 1}` : "LV")}
        </a>
      `).join("")}
    </div>
  `;
}

function normalizeTextForMap(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readCachedGeocodeEntries() {
  try {
    const raw = localStorage.getItem(REAL_ESTATE_GEOCODE_CACHE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistGeocodeCache() {
  try {
    localStorage.setItem(
      REAL_ESTATE_GEOCODE_CACHE_KEY,
      JSON.stringify(Array.from(realEstateGeocodeCache.entries())),
    );
  } catch {
    // Ignore persistence failures in private mode or restricted environments.
  }
}

function hydrateRealEstateGeocodeCache() {
  const entries = readCachedGeocodeEntries();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      continue;
    }

    const [key, value] = entry;
    if (typeof key !== "string" || !value || typeof value !== "object") {
      continue;
    }

    if (Number.isFinite(value.lat) && Number.isFinite(value.lon)) {
      realEstateGeocodeCache.set(key, value);
    }
  }
}

function destroyRealEstateMap() {
  if (realEstateMapState.map) {
    realEstateMapState.map.remove();
  }

  realEstateMapState.map = null;
  realEstateMapState.markersLayer = null;
}

function extractLandRegisterNumbers(itemText) {
  const source = String(itemText || "");
  const match = source.match(/(?:č[ií]slo|cislo)\s*LV\s*:\s*([^;]+?)(?=;|$)/i);
  if (!match?.[1]) {
    return [];
  }

  return Array.from(new Set(Array.from(match[1].matchAll(/\d+/g), (hit) => hit[0])));
}

function buildRealEstateMapRecords(category) {
  const records = Array.isArray(category?.records) ? category.records : [];
  return records
    .map((record) => {
      const parsed = parseRealEstateItem(record.item_text);
      const links = Array.isArray(record.kataster_links) ? record.kataster_links : [];
      const derivedArea = String(parsed["Kat. uzemie"] || "").trim();
      const fallbackArea = links.find((link) => link?.cadastralArea)?.cadastralArea
        || links.find((link) => link?.matchedDisplayName)?.matchedDisplayName
        || "";
      const cadastralArea = derivedArea || String(fallbackArea || "").trim();

      return {
        id: record.id,
        type: String(parsed.Typ || "Nehnutelnost"),
        cadastralArea,
        landRegisterNumbers: extractLandRegisterNumbers(record.item_text),
        katasterLinks: links,
      };
    })
    .filter((entry) => entry.cadastralArea);
}

async function geocodeCadastralArea(cadastralArea) {
  const key = normalizeTextForMap(cadastralArea);
  if (!key) {
    return null;
  }

  const cached = realEstateGeocodeCache.get(key);
  if (cached) {
    return cached;
  }

  const query = `${cadastralArea}, Slovakia`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "sk");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const result = { lat, lon };
  realEstateGeocodeCache.set(key, result);
  persistGeocodeCache();
  return result;
}

function renderRealEstateMapSection() {
  return `
    <section class="real-estate-map-section" aria-label="Mapa nehnutelnosti politika">
      <div class="real-estate-map-heading">
        <h4>Mapa nehnutelnosti na Slovensku</h4>
        <p id="realEstateMapStatus" class="real-estate-map-status">Nacitavam mapu...</p>
      </div>
      <div id="realEstateMap" class="real-estate-map" role="img" aria-label="Mapa Slovenska s nehnutelnostami"></div>
    </section>
  `;
}

async function renderRealEstateMap(category) {
  const mapElement = document.querySelector("#realEstateMap");
  const statusElement = document.querySelector("#realEstateMapStatus");
  if (!mapElement || !statusElement) {
    return;
  }

  destroyRealEstateMap();

  const entries = buildRealEstateMapRecords(category);
  if (!entries.length) {
    statusElement.textContent = "Pre tuto deklaraciu sa nenasli pouzitelne kat. uzemia.";
    return;
  }

  if (typeof window.L === "undefined") {
    statusElement.textContent = "Mapova kniznica sa nepodarila nacitat.";
    return;
  }

  const map = window.L.map(mapElement, {
    center: [48.7, 19.5],
    zoom: 7,
    minZoom: 6,
    maxZoom: 14,
    zoomControl: true,
  });
  realEstateMapState.map = map;

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const geocodedEntries = await Promise.all(
    entries.map(async (entry) => {
      const coords = await geocodeCadastralArea(entry.cadastralArea);
      return { ...entry, coords };
    }),
  );

  const located = geocodedEntries.filter((entry) => entry.coords);
  if (!located.length) {
    statusElement.textContent = "Nepodarilo sa geokodovat kat. uzemia pre mapu.";
    return;
  }

  const markersLayer = window.L.layerGroup().addTo(map);
  realEstateMapState.markersLayer = markersLayer;

  const bounds = [];
  for (const entry of located) {
    const marker = window.L.marker([entry.coords.lat, entry.coords.lon]);
    const lvLinks = entry.katasterLinks
      .filter((link) => link?.publicPdfUrl)
      .map((link, index) => `<a class="table-link lv-link" href="${escapeHtml(link.publicPdfUrl)}" target="_blank" rel="noreferrer">${escapeHtml(entry.katasterLinks.length > 1 ? `LV ${index + 1}` : "LV")}</a>`)
      .join(" ");

    marker.bindPopup(`
      <div class="real-estate-popup">
        <strong>${escapeHtml(entry.type)}</strong>
        <div>${escapeHtml(entry.cadastralArea)}</div>
        <div>LV: ${escapeHtml(entry.landRegisterNumbers.join(", ") || "-")}</div>
        <div class="real-estate-popup-links">${lvLinks || ""}</div>
      </div>
    `);
    marker.addTo(markersLayer);
    bounds.push([entry.coords.lat, entry.coords.lon]);
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], 10);
  } else {
    map.fitBounds(bounds, { padding: [24, 24] });
  }

  const missingCount = entries.length - located.length;
  statusElement.textContent = missingCount > 0
    ? `Zobrazene: ${located.length}/${entries.length}. ${missingCount} poloziek sa nepodarilo lokalizovat.`
    : `Zobrazene vsetky nehnutelnosti (${located.length}).`;

  window.setTimeout(() => {
    map.invalidateSize();
  }, 0);
}

function renderRealEstateCategoryTable(category) {
  const rows = buildRealEstateRows(category);
  if (!rows.length) {
    return `${renderRealEstateMapSection()}<div class="muted-inline">Bez zaznamov nehnutelnosti.</div>`;
  }

  const columns = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "__katasterLinks") {
        continue;
      }

      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  columns.push("LV");

  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns.map((column) => {
        if (column === "LV") {
          return `<td>${renderLvButtons(row.__katasterLinks || [])}</td>`;
        }

        return `<td>${escapeHtml(row[column] || "-")}</td>`;
      }).join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    ${renderRealEstateMapSection()}
    <div class="detail-table-wrap">
      <table class="detail-category-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderStructuredCategoryTable(categoryKey, category) {
  if (categoryKey === "realEstate") {
    return renderRealEstateCategoryTable(category);
  }

  const rows = getStructuredCategoryRows(categoryKey, category.items);
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

  const structuredTable = renderStructuredCategoryTable(categoryKey, category);
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
  const candidatePartyList = Array.isArray(politician.candidate_party_memberships)
    && politician.candidate_party_memberships.length
    ? politician.candidate_party_memberships.join(" ; ")
    : (politician.candidate_party || "-");

  function normalizeNameParts(fullName) {
    const raw = String(fullName || "").trim();
    if (!raw) {
      return { firstName: null, lastName: null };
    }

    const compact = raw
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const filteredParts = compact
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !part.includes("."));

    if (filteredParts.length < 2) {
      return { firstName: null, lastName: null };
    }

    return {
      firstName: filteredParts[0],
      lastName: filteredParts[filteredParts.length - 1],
    };
  }

  function latin2PercentEncode(value) {
    // Use ISO-8859-2 (Latin-2) mapping for Slovak diacritics in ORSR query params.
    const ISO_8859_2_MAP = {
      "Á": 0xC1,
      "Ä": 0xC4,
      "Č": 0xC8,
      "Ď": 0xCF,
      "É": 0xC9,
      "Í": 0xCD,
      "Ĺ": 0xC5,
      "Ľ": 0xA5,
      "Ň": 0xD2,
      "Ó": 0xD3,
      "Ô": 0xD4,
      "Ŕ": 0xC0,
      "Š": 0xA9,
      "Ť": 0xAB,
      "Ú": 0xDA,
      "Ý": 0xDD,
      "Ž": 0xAE,
      "á": 0xE1,
      "ä": 0xE4,
      "č": 0xE8,
      "ď": 0xEF,
      "é": 0xE9,
      "í": 0xED,
      "ĺ": 0xE5,
      "ľ": 0xB5,
      "ň": 0xF2,
      "ó": 0xF3,
      "ô": 0xF4,
      "ŕ": 0xE0,
      "š": 0xB9,
      "ť": 0xBB,
      "ú": 0xFA,
      "ý": 0xFD,
      "ž": 0xBE,
    };

    const input = String(value || "");

    let encoded = "";
    for (const originalChar of input) {
      let char = originalChar;
      let code = ISO_8859_2_MAP[char];

      if (code == null) {
        code = char.charCodeAt(0);
      }

      if (code > 0xff) {
        const fallback = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        char = fallback || char;
        code = char.charCodeAt(0);
      }

      if (/[A-Za-z0-9_.~-]/.test(char)) {
        encoded += char;
        continue;
      }

      if (char === " ") {
        encoded += "%20";
        continue;
      }

      if (code <= 0xff) {
        encoded += `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
        continue;
      }

      encoded += encodeURIComponent(char);
    }

    return encoded;
  }

  function buildOrsrUrl(fullName) {
    const { firstName, lastName } = normalizeNameParts(fullName);
    if (!firstName || !lastName) {
      return null;
    }

    const encodedLastName = latin2PercentEncode(lastName.toLowerCase());
    const encodedFirstName = latin2PercentEncode(firstName.toLowerCase());

    return `https://www.orsr.sk/hladaj_osoba.asp?PR=${encodedLastName}&MENO=${encodedFirstName}&SID=0&T=f0&R=on`;
  }

  function buildProfileLinks() {
    const links = [];
    const orsrUrl = buildOrsrUrl(politician.full_name);
    if (orsrUrl) {
      links.push({ label: "ORSR", url: orsrUrl });
    }

    if (politician.deputy_profile_url) {
      links.push({ label: "NR SR", url: politician.deputy_profile_url });
    }

    return links;
  }

  const profileLinks = buildProfileLinks();
  const profileLinksMarkup = profileLinks.length
    ? `<div class="profile-link-list">${profileLinks
      .map((link) => `
        <a class="table-link profile-link-button" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>
      `)
      .join("")}</div>`
    : "-";

  const items = [
    ["Titul", politician.deputy_title || "-"],
    ["Meno", politician.deputy_first_name || "-"],
    ["Priezvisko", politician.deputy_last_name || "-"],
    ["Kandidoval(a) za", candidatePartyList],
    ["Parlamentny klub", politician.parliamentary_club || "-"],
    ["Narodeny(a)", politician.deputy_birth_date_text || "-"],
    ["Narodnost", politician.deputy_nationality || "-"],
    ["Bydlisko", politician.deputy_residence || "-"],
    ["Kraj", politician.deputy_region || "-"],
    ["Aktualne volebne obdobie", politician.deputy_term_info?.current_term_label || "-"],
    ["Posobenie v parlamente", politician.deputy_term_info?.parliament_service || "-"],
    ["Posobenie v tomto obdobi", politician.deputy_term_info?.current_term_service || "-"],
    [
      "Poslanecke clenstva",
      Array.isArray(politician.parliamentary_memberships) && politician.parliamentary_memberships.length
        ? politician.parliamentary_memberships.join(" | ")
        : "-",
    ],
    ["Profily", profileLinksMarkup],
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

  const formulaParts = [
    coefficients.salary_to_income_change_ratio ?? 0,
    coefficients.asset_item_count_ratio ?? 0,
    coefficients.other_income_to_average_salary_ratio ?? 0,
  ].map((value) => Number(value || 0).toFixed(2));

  const notes = [
    `Live vypocet: ${formulaParts.join(" + ")} = ${score.toFixed(2)}`,
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
  destroyRealEstateMap();

  const categories = activeDeclaration?.categories || {};
  const realEstateCategory = categories.realEstate || {
    label: "Vlastnictvo nehnutelnej veci",
    items: [],
    records: [],
  };
  const movableAssetsCategory = categories.movableAssets || {
    label: "Vlastnictvo hnutelnej veci",
    items: [],
  };

  elements.realEstateContainer.innerHTML = renderCategoryCard("realEstate", realEstateCategory);
  elements.movableAssetsContainer.innerHTML = renderCategoryCard("movableAssets", movableAssetsCategory);
  renderRealEstateMap(realEstateCategory).catch(() => {
    const statusElement = document.querySelector("#realEstateMapStatus");
    if (statusElement) {
      statusElement.textContent = "Pri nacitani mapy nastala chyba.";
    }
  });

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
  elements.profilePhoto.innerHTML = "";
  elements.profileContact.innerHTML = "";
  elements.profileMeta.innerHTML = "";
  elements.summaryList.innerHTML = "";
  elements.timelineContainer.innerHTML = "";
  elements.realEstateContainer.innerHTML = '<div class="error-box">Zatial nie su k dispozicii ziadne data.</div>';
  elements.movableAssetsContainer.innerHTML = '<div class="error-box">Zatial nie su k dispozicii ziadne data.</div>';
  elements.riskSummary.innerHTML = "";
  elements.riskFlags.innerHTML = "";
  elements.categoriesContainer.innerHTML = '<div class="error-box">Zatial nie su k dispozicii ziadne data.</div>';
  elements.declarationSelect.innerHTML = "";
  destroyRealEstateMap();
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
  renderProfilePhoto(politician);
  renderProfileContact(politician);
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
  elements.profilePhoto.innerHTML = "";
  elements.profileContact.innerHTML = "";
  elements.profileMeta.innerHTML = "";
  elements.summaryList.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
  elements.timelineContainer.innerHTML = "";
  elements.realEstateContainer.innerHTML = "";
  elements.movableAssetsContainer.innerHTML = "";
  elements.riskSummary.innerHTML = "";
  elements.riskFlags.innerHTML = "";
  elements.categoriesContainer.innerHTML = "";
  destroyRealEstateMap();
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
