const state = {
  politicians: [],
};

const elements = {
  tableBody: document.querySelector("#politiciansTableBody"),
  resultsInfo: document.querySelector("#resultsInfo"),
  searchInput: document.querySelector("#searchInput"),
  functionInput: document.querySelector("#functionInput"),
  partySelect: document.querySelector("#partySelect"),
  riskSelect: document.querySelector("#riskSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  reloadButton: document.querySelector("#reloadButton"),
};

const currencyFormatter = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function extractNameParts(fullName) {
  const tokens = String(fullName || "")
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^[A-Za-zÀ-ž]{1,10}\.$/.test(token));

  if (tokens.length === 0) {
    return { firstName: "", surname: "" };
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0], surname: tokens[0] };
  }

  return {
    firstName: tokens[0],
    surname: tokens[tokens.length - 1],
  };
}

function compareText(left, right, direction = "asc") {
  const result = left.localeCompare(right, "sk", { sensitivity: "base" });
  return direction === "desc" ? -result : result;
}

function parseIncomeTotal(incomeText) {
  const matches = String(incomeText || "").match(/\d[\d\s]*\s*€/g) || [];
  return matches.reduce((sum, match) => {
    const numericValue = Number(match.replace(/[^\d]/g, ""));
    return sum + (Number.isFinite(numericValue) ? numericValue : 0);
  }, 0);
}

function getIncomeTotal(row) {
  const structuredValue = Number(row.latest_total_income_amount);
  if (Number.isFinite(structuredValue) && structuredValue > 0) {
    return structuredValue;
  }

  return parseIncomeTotal(row.latest_income_text);
}

function getAssetJumpDelta(row) {
  return (Number(row.wealth_item_count) || 0) - (Number(row.previous_wealth_item_count) || 0);
}

function getPartyValue(row) {
  return row.candidate_party || row.parliamentary_club || "";
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "-";
  }

  return currencyFormatter.format(amount);
}

function getIncomeLabel(row) {
  const structuredValue = Number(row.latest_total_income_amount);
  if (Number.isFinite(structuredValue) && structuredValue > 0) {
    return formatCurrency(structuredValue);
  }

  return row.latest_income_text || "-";
}

function getWealthLabel(row) {
  const current = Number(row.wealth_item_count) || 0;

  if (!current) {
    return "0 poloziek";
  }

  return `${current} poloziek`;
}

function getWealthDeltaLabel(row) {
  const current = Number(row.wealth_item_count) || 0;
  const previous = Number(row.previous_wealth_item_count) || 0;

  if (!current && !previous) {
    return "Bez medzirocnej zmeny";
  }

  const delta = current - previous;
  if (!delta) {
    return "Stabilne oproti minulemu roku";
  }

  return delta > 0 ? `Medzirocne +${delta}` : `Medzirocne ${delta}`;
}

function getSuspicionBadge(row) {
  const level = String(row.suspicious_level || "none");
  const score = Number(row.suspicious_score) || 0;
  const labels = {
    high: "Vysoke",
    medium: "Stredne",
    low: "Nizke",
    none: "Bez signalu",
  };

  return `<span class="risk-pill risk-${escapeHtml(level)}">${escapeHtml(labels[level] || labels.none)} ${escapeHtml(score)}</span>`;
}

function sortRows(rows, forcedSortValue = null) {
  const sortValue = forcedSortValue || elements.sortSelect.value;
  const sorted = [...rows];

  sorted.sort((left, right) => {
    const leftName = extractNameParts(left.full_name);
    const rightName = extractNameParts(right.full_name);

    switch (sortValue) {
      case "surnameAsc": {
        return compareText(leftName.surname, rightName.surname, "asc")
          || compareText(leftName.firstName, rightName.firstName, "asc");
      }
      case "firstNameDesc": {
        return compareText(leftName.firstName, rightName.firstName, "desc")
          || compareText(leftName.surname, rightName.surname, "desc");
      }
      case "surnameDesc": {
        return compareText(leftName.surname, rightName.surname, "desc")
          || compareText(leftName.firstName, rightName.firstName, "desc");
      }
      case "wealthDesc": {
        return (Number(right.wealth_item_count) || 0) - (Number(left.wealth_item_count) || 0)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "wealthAsc": {
        return (Number(left.wealth_item_count) || 0) - (Number(right.wealth_item_count) || 0)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "assetJumpDesc": {
        return getAssetJumpDelta(right) - getAssetJumpDelta(left)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "assetJumpAsc": {
        return getAssetJumpDelta(left) - getAssetJumpDelta(right)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "incomeDesc": {
        return getIncomeTotal(right) - getIncomeTotal(left)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "incomeAsc": {
        return getIncomeTotal(left) - getIncomeTotal(right)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "riskDesc": {
        return (Number(right.suspicious_score) || 0) - (Number(left.suspicious_score) || 0)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "riskAsc": {
        return (Number(left.suspicious_score) || 0) - (Number(right.suspicious_score) || 0)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "firstNameAsc":
      default: {
        return compareText(leftName.firstName, rightName.firstName, "asc")
          || compareText(leftName.surname, rightName.surname, "asc");
      }
    }
  });

  return sorted;
}

function renderRows(rows) {
  if (!rows.length) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="6"><div class="error-box">Ziadne vysledky pre aktualny filter.</div></td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>
            <a class="name-link" href="/detail.html?id=${encodeURIComponent(row.id)}">${escapeHtml(row.full_name || "-")}</a>
            <div class="muted-inline">User ID ${escapeHtml(row.nrsr_user_id || "-")}</div>
          </td>
          <td>${escapeHtml(row.latest_public_function || "-")}</td>
          <td>
            <div>${escapeHtml(row.candidate_party || row.parliamentary_club || "-")}</div>
            <div class="muted-inline">${escapeHtml(row.parliamentary_club || "Bez klubu")}</div>
          </td>
          <td>${escapeHtml(getIncomeLabel(row))}</td>
          <td>
            <div>${escapeHtml(getWealthLabel(row))}</div>
            <div class="muted-inline">${escapeHtml(getWealthDeltaLabel(row))}</div>
          </td>
          <td>${getSuspicionBadge(row)}</td>
        </tr>
      `,
    )
    .join("");
}

function populatePartyFilter(rows) {
  const parties = Array.from(
    new Set(rows.map((row) => getPartyValue(row)).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "sk", { sensitivity: "base" }));

  elements.partySelect.innerHTML = [
    '<option value="">Vsetky strany</option>',
    ...parties.map((party) => `<option value="${escapeHtml(party)}">${escapeHtml(party)}</option>`),
  ].join("");
}

function applyFilters() {
  const searchValue = normalize(elements.searchInput.value);
  const functionValue = normalize(elements.functionInput.value);
  const partyValue = normalize(elements.partySelect.value);
  const riskValue = elements.riskSelect.value;

  const filtered = state.politicians.filter((row) => {
    const matchesSearch =
      !searchValue ||
      normalize(row.full_name).includes(searchValue) ||
      normalize(row.nrsr_user_id).includes(searchValue) ||
      normalize(row.candidate_party).includes(searchValue) ||
      normalize(row.parliamentary_club).includes(searchValue);

    const matchesFunction =
      !functionValue || normalize(row.latest_public_function).includes(functionValue);

    const matchesParty = !partyValue || normalize(getPartyValue(row)) === partyValue;

    const matchesRisk = riskValue === "all" || String(row.suspicious_level || "none") === riskValue;

    return matchesSearch && matchesFunction && matchesParty && matchesRisk;
  });

  const sorted = sortRows(filtered);

  elements.resultsInfo.textContent = `${sorted.length} z ${state.politicians.length} politikov`;
  renderRows(sorted);
}

async function loadPoliticians() {
  elements.resultsInfo.textContent = "Nacitavam data...";

  const response = await fetch("/api/politicians?limit=5000");
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const message = payload?.error || "Nepodarilo sa nacitat politikov.";
    if (response.status >= 500) {
      throw new Error(`Server error: ${message}`);
    }

    throw new Error(message);
  }

  state.politicians = payload.rows;
  populatePartyFilter(payload.rows);
  applyFilters();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", applyFilters);
  elements.functionInput.addEventListener("input", applyFilters);
  elements.partySelect.addEventListener("change", applyFilters);
  elements.riskSelect.addEventListener("change", applyFilters);
  elements.sortSelect.addEventListener("change", applyFilters);
  elements.reloadButton.addEventListener("click", () => {
    loadPoliticians().catch(renderError);
  });
}

function renderError(error) {
  elements.resultsInfo.textContent = "Chyba pri nacitani";
  elements.tableBody.innerHTML = `
    <tr>
      <td colspan="6"><div class="error-box">${escapeHtml(error.message || "Nepodarilo sa nacitat data.")}</div></td>
    </tr>
  `;
}

bindEvents();
loadPoliticians().catch(renderError);
