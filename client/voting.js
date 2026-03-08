const state = {
  rows: [],
};

const elements = {
  tableBody: document.querySelector("#votingTableBody"),
  resultsInfo: document.querySelector("#votingResultsInfo"),
  searchInput: document.querySelector("#votingSearchInput"),
  periodSelect: document.querySelector("#votingPeriodSelect"),
  sortSelect: document.querySelector("#votingSortSelect"),
  reloadButton: document.querySelector("#votingReloadButton"),
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

function compareText(left, right, direction = "asc") {
  const result = left.localeCompare(right, "sk", { sensitivity: "base" });
  return direction === "desc" ? -result : result;
}

function renderRows(rows) {
  if (!rows.length) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="10"><div class="error-box">Žiadne výsledky pre aktuálny filter.</div></td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.full_name || "-")}</td>
        <td>${escapeHtml(row.nrsr_user_id || "-")}</td>
        <td>${escapeHtml(row.cis_obdobia)}</td>
        <td>${escapeHtml(row.record_count || 0)}</td>
        <td>${escapeHtml(row.za_count || 0)}</td>
        <td>${escapeHtml(row.proti_count || 0)}</td>
        <td>${escapeHtml(row.zdrzal_sa_count || 0)}</td>
        <td>${escapeHtml(row.nehlasoval_count || 0)}</td>
        <td>${escapeHtml(row.nepritomny_count || 0)}</td>
        <td><div class="transcript-cell">${escapeHtml(row.transcript_text || "-")}</div></td>
      </tr>
    `).join("");
}

function populatePeriodFilter(rows) {
  const periods = Array.from(new Set(rows.map((row) => row.cis_obdobia).filter((value) => value != null)))
    .sort((left, right) => right - left);

  elements.periodSelect.innerHTML = [
    '<option value="">Všetky obdobia</option>',
    ...periods.map((period) => `<option value="${period}">${period}</option>`),
  ].join("");
}

function sortRows(rows) {
  const sorted = [...rows];
  const sortValue = elements.sortSelect.value;

  sorted.sort((left, right) => {
    switch (sortValue) {
      case "dateDesc":
        return compareText(right.scraped_at || "", left.scraped_at || "", "asc")
          || compareText(left.full_name || "", right.full_name || "", "asc");
      case "schodzaAsc":
        return (Number(left.record_count) || 0) - (Number(right.record_count) || 0)
          || compareText(left.full_name || "", right.full_name || "", "asc");
      case "voteAsc":
        return (Number(left.za_count) || 0) - (Number(right.za_count) || 0)
          || compareText(left.full_name || "", right.full_name || "", "asc");
      case "nameAsc":
      default:
        return compareText(left.full_name || "", right.full_name || "", "asc")
          || (Number(right.record_count) || 0) - (Number(left.record_count) || 0);
    }
  });

  return sorted;
}

function applyFilters() {
  const searchValue = normalize(elements.searchInput.value);
  const periodValue = elements.periodSelect.value;

  const filtered = state.rows.filter((row) => {
    const matchesSearch = !searchValue
      || normalize(row.full_name).includes(searchValue)
      || normalize(row.nrsr_user_id).includes(searchValue);
    const matchesPeriod = !periodValue || String(row.cis_obdobia) === periodValue;
    return matchesSearch && matchesPeriod;
  });

  const sorted = sortRows(filtered);
  elements.resultsInfo.textContent = `${sorted.length} / ${state.rows.length} záznamov`;
  renderRows(sorted);
}

async function loadVotingStats() {
  elements.resultsInfo.textContent = "Načítavam dáta...";
  const response = await fetch("/api/voting-transcripts?limit=5000");
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    if (payload?.error) {
      throw new Error(payload.error);
    }

    if (response.status === 404) {
      throw new Error("API route /api/voting-transcripts nie je dostupná. Reštartuj aktuálny server.");
    }

    if (response.status >= 500) {
      throw new Error("Server vrátil neplatnú odpoveď. Skontroluj migrácie a reštart servera.");
    }

    throw new Error("Nepodarilo sa načítať hlasovania.");
  }

  state.rows = payload.rows;
  populatePeriodFilter(payload.rows);
  applyFilters();
}

function renderError(error) {
  elements.resultsInfo.textContent = "Chyba pri načítaní";
  elements.tableBody.innerHTML = `
    <tr>
      <td colspan="10"><div class="error-box">${escapeHtml(error.message || "Nepodarilo sa načítať dáta.")}</div></td>
    </tr>
  `;
}

function bindEvents() {
  elements.searchInput.addEventListener("input", applyFilters);
  elements.periodSelect.addEventListener("change", applyFilters);
  elements.sortSelect.addEventListener("change", applyFilters);
  elements.reloadButton.addEventListener("click", () => {
    loadVotingStats().catch(renderError);
  });
}

bindEvents();
loadVotingStats().catch(renderError);