const state = {
  politicians: [],
};

const elements = {
  tableBody: document.querySelector("#politiciansTableBody"),
  resultsInfo: document.querySelector("#resultsInfo"),
  searchInput: document.querySelector("#searchInput"),
  functionInput: document.querySelector("#functionInput"),
  yearSelect: document.querySelector("#yearSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  reloadButton: document.querySelector("#reloadButton"),
};

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

function sortRows(rows) {
  const sortValue = elements.sortSelect.value;
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
      case "incomeDesc": {
        return getIncomeTotal(right) - getIncomeTotal(left)
          || compareText(leftName.surname, rightName.surname, "asc");
      }
      case "incomeAsc": {
        return getIncomeTotal(left) - getIncomeTotal(right)
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
        <td colspan="8"><div class="error-box">Ziadne vysledky pre aktualny filter.</div></td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.full_name || "-")}</td>
          <td>${escapeHtml(row.nrsr_user_id)}</td>
          <td>${escapeHtml(row.latest_declaration_year || "-")}</td>
          <td>${escapeHtml(row.latest_public_function || "-")}</td>
          <td>${escapeHtml(row.latest_income_text || "-")}</td>
          <td>${escapeHtml(row.wealth_item_count ?? 0)}</td>
          <td>${escapeHtml(row.declaration_count)}</td>
          <td><a class="table-link" href="/detail.html?id=${encodeURIComponent(row.id)}">Otvorit</a></td>
        </tr>
      `,
    )
    .join("");
}

function populateYearFilter(rows) {
  const years = Array.from(
    new Set(rows.map((row) => row.latest_declaration_year).filter(Boolean)),
  ).sort((left, right) => right - left);

  elements.yearSelect.innerHTML = [
    '<option value="">Vsetky roky</option>',
    ...years.map((year) => `<option value="${year}">${year}</option>`),
  ].join("");
}

function applyFilters() {
  const searchValue = normalize(elements.searchInput.value);
  const functionValue = normalize(elements.functionInput.value);
  const yearValue = elements.yearSelect.value;

  const filtered = state.politicians.filter((row) => {
    const matchesSearch =
      !searchValue ||
      normalize(row.full_name).includes(searchValue) ||
      normalize(row.nrsr_user_id).includes(searchValue);

    const matchesFunction =
      !functionValue || normalize(row.latest_public_function).includes(functionValue);

    const matchesYear = !yearValue || String(row.latest_declaration_year || "") === yearValue;

    return matchesSearch && matchesFunction && matchesYear;
  });

  const sorted = sortRows(filtered);

  elements.resultsInfo.textContent = `${sorted.length} / ${state.politicians.length} politikov`;
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
  populateYearFilter(payload.rows);
  applyFilters();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", applyFilters);
  elements.functionInput.addEventListener("input", applyFilters);
  elements.yearSelect.addEventListener("change", applyFilters);
  elements.sortSelect.addEventListener("change", applyFilters);
  elements.reloadButton.addEventListener("click", () => {
    loadPoliticians().catch(renderError);
  });
}

function renderError(error) {
  elements.resultsInfo.textContent = "Chyba pri nacitani";
  elements.tableBody.innerHTML = `
    <tr>
      <td colspan="8"><div class="error-box">${escapeHtml(error.message || "Nepodarilo sa nacitat data.")}</div></td>
    </tr>
  `;
}

bindEvents();
loadPoliticians().catch(renderError);
