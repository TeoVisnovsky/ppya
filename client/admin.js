const state = {
  tables: [],
  selectedTable: null,
  limit: 50,
  offset: 0,
};

const elements = {
  tablesList: document.querySelector("#tablesList"),
  tablesInfo: document.querySelector("#tablesInfo"),
  reloadTablesButton: document.querySelector("#reloadTablesButton"),
  limitSelect: document.querySelector("#limitSelect"),
  tableTitle: document.querySelector("#tableTitle"),
  tableMeta: document.querySelector("#tableMeta"),
  tableContainer: document.querySelector("#tableContainer"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function renderTables() {
  if (!state.tables.length) {
    elements.tablesList.innerHTML = '<div class="error-box">Ziadne tabulky.</div>';
    return;
  }

  elements.tablesInfo.textContent = `${state.tables.length} tabuliek`;
  elements.tablesList.innerHTML = state.tables
    .map((table) => {
      const active = table.table_name === state.selectedTable ? "table-item active" : "table-item";
      return `
        <button class="${active}" type="button" data-table-name="${escapeHtml(table.table_name)}">
          <span>${escapeHtml(table.table_name)}</span>
          <small>${escapeHtml(table.estimated_rows)}</small>
        </button>
      `;
    })
    .join("");

  elements.tablesList.querySelectorAll("[data-table-name]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTable = button.dataset.tableName;
      state.offset = 0;
      renderTables();
      loadTableData().catch(renderTableError);
    });
  });
}

function renderRows(result) {
  if (!result.rows.length) {
    elements.tableContainer.innerHTML = '<div class="error-box">Tabulka je prazdna.</div>';
    return;
  }

  const header = result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = result.rows
    .map((row) => {
      const cells = result.columns.map((column) => {
        const value = row[column];
        const normalized = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
        return `<td>${escapeHtml(normalized)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  elements.tableContainer.innerHTML = `
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function loadTables() {
  elements.tablesInfo.textContent = "Nacitavam...";
  const payload = await fetchJson("/api/admin/tables");
  state.tables = payload.rows;
  if (!state.selectedTable && state.tables[0]) {
    state.selectedTable = state.tables[0].table_name;
  }
  renderTables();
  if (state.selectedTable) {
    await loadTableData();
  }
}

async function loadTableData() {
  if (!state.selectedTable) {
    return;
  }

  elements.tableTitle.textContent = state.selectedTable;
  elements.tableMeta.textContent = "Nacitavam riadky...";

  const payload = await fetchJson(`/api/admin/tables/${encodeURIComponent(state.selectedTable)}?limit=${state.limit}&offset=${state.offset}`);
  const { result } = payload;

  elements.tableTitle.textContent = result.tableName;
  elements.tableMeta.textContent = `Zobrazenych ${result.rows.length} z ${result.totalCount} riadkov | offset ${state.offset}`;
  elements.prevPageButton.disabled = state.offset === 0;
  elements.nextPageButton.disabled = state.offset + state.limit >= result.totalCount;
  renderRows(result);
}

function renderTableError(error) {
  elements.tableMeta.textContent = "Chyba pri nacitani tabulky";
  elements.tableContainer.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
}

function bindEvents() {
  elements.reloadTablesButton.addEventListener("click", () => {
    loadTables().catch(renderTableError);
  });

  elements.limitSelect.addEventListener("change", () => {
    state.limit = Number(elements.limitSelect.value);
    state.offset = 0;
    loadTableData().catch(renderTableError);
  });

  elements.prevPageButton.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    loadTableData().catch(renderTableError);
  });

  elements.nextPageButton.addEventListener("click", () => {
    state.offset += state.limit;
    loadTableData().catch(renderTableError);
  });
}

bindEvents();
loadTables().catch(renderTableError);
