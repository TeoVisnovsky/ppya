const state = {
  tables: [],
  selectedTable: null,
  limit: 50,
  offset: 0,
  tableQuery: "",
  rowQuery: "",
  currentTableResult: null,
};

const elements = {
  tablesList: document.querySelector("#tablesList"),
  tablesInfo: document.querySelector("#tablesInfo"),
  reloadTablesButton: document.querySelector("#reloadTablesButton"),
  tableSearchInput: document.querySelector("#tableSearchInput"),
  limitSelect: document.querySelector("#limitSelect"),
  tableTitle: document.querySelector("#tableTitle"),
  tableMeta: document.querySelector("#tableMeta"),
  rowSearchInput: document.querySelector("#rowSearchInput"),
  schemaContainer: document.querySelector("#schemaContainer"),
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

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function getColumnDefinitions(result) {
  return (result.columns || []).map((column) => {
    if (typeof column === "string") {
      return {
        name: column,
        dataType: "unknown",
        nullable: true,
        defaultValue: null,
      };
    }

    return {
      name: column.name,
      dataType: column.dataType || column.udtName || "unknown",
      nullable: Boolean(column.nullable),
      defaultValue: column.defaultValue ?? null,
    };
  });
}

function formatCellValue(value) {
  if (value == null) {
    return '<span class="db-null">NULL</span>';
  }

  if (typeof value === "object") {
    return `<pre class="db-cell-pre">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }

  const stringValue = String(value);
  if (stringValue.length > 120 || stringValue.includes("\n")) {
    return `<pre class="db-cell-pre">${escapeHtml(stringValue)}</pre>`;
  }

  return escapeHtml(stringValue);
}

function rowMatchesQuery(row, columnDefinitions, rowQuery) {
  if (!rowQuery) {
    return true;
  }

  return columnDefinitions.some((column) => normalize(
    typeof row[column.name] === "object" && row[column.name] !== null
      ? JSON.stringify(row[column.name])
      : row[column.name],
  ).includes(rowQuery));
}

function renderSchema(result) {
  const columnDefinitions = getColumnDefinitions(result);

  if (!columnDefinitions.length) {
    elements.schemaContainer.innerHTML = "";
    return;
  }

  elements.schemaContainer.innerHTML = `
    <div class="db-schema-summary">
      <div class="db-schema-stat">
        <span>Stlpce</span>
        <strong>${escapeHtml(columnDefinitions.length)}</strong>
      </div>
      <div class="db-schema-stat">
        <span>Riadky celkom</span>
        <strong>${escapeHtml(result.totalCount)}</strong>
      </div>
      <div class="db-schema-stat">
        <span>Nacitane</span>
        <strong>${escapeHtml(result.rows.length)}</strong>
      </div>
    </div>
    <div class="db-schema-list">
      ${columnDefinitions.map((column) => `
        <article class="db-schema-card">
          <h3>${escapeHtml(column.name)}</h3>
          <p>${escapeHtml(column.dataType)}</p>
          <small>${column.nullable ? "nullable" : "required"}${column.defaultValue ? ` | default ${escapeHtml(column.defaultValue)}` : ""}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTables() {
  const visibleTables = state.tables.filter((table) => (
    !state.tableQuery || normalize(table.table_name).includes(state.tableQuery)
  ));

  if (!visibleTables.length) {
    elements.tablesList.innerHTML = '<div class="error-box">Ziadne tabulky.</div>';
    elements.tablesInfo.textContent = state.tableQuery ? "0 tabuliek pre hladany vyraz" : "Ziadne tabulky";
    return;
  }

  elements.tablesInfo.textContent = `${visibleTables.length} z ${state.tables.length} tabuliek`;
  elements.tablesList.innerHTML = visibleTables
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
  const columnDefinitions = getColumnDefinitions(result);
  const rowQuery = normalize(state.rowQuery);
  const visibleRows = result.rows.filter((row) => rowMatchesQuery(row, columnDefinitions, rowQuery));

  if (!result.rows.length) {
    elements.tableContainer.innerHTML = '<div class="error-box">Tabulka je prazdna.</div>';
    return;
  }

  if (!visibleRows.length) {
    elements.tableContainer.innerHTML = '<div class="error-box">Pre aktualny filter riadkov neexistuje zhoda.</div>';
    return;
  }

  const header = columnDefinitions.map((column) => `<th>${escapeHtml(column.name)}</th>`).join("");
  const body = visibleRows
    .map((row) => {
      const cells = columnDefinitions.map((column) => {
        const value = row[column.name];
        return `<td>${formatCellValue(value)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  elements.tableContainer.innerHTML = `
    <table class="db-data-table">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;

  elements.tableMeta.textContent = `Zobrazenych ${visibleRows.length} z ${result.rows.length} nacitanych | celkom ${result.totalCount} riadkov | ${columnDefinitions.length} stlpcov | offset ${state.offset}`;
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

  state.currentTableResult = result;
  elements.tableTitle.textContent = result.tableName;
  renderSchema(result);
  elements.prevPageButton.disabled = state.offset === 0;
  elements.nextPageButton.disabled = state.offset + state.limit >= result.totalCount;
  renderRows(result);
}

function renderTableError(error) {
  elements.tableMeta.textContent = "Chyba pri nacitani tabulky";
  elements.schemaContainer.innerHTML = "";
  elements.tableContainer.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
}

function bindEvents() {
  elements.reloadTablesButton.addEventListener("click", () => {
    loadTables().catch(renderTableError);
  });

  elements.tableSearchInput.addEventListener("input", () => {
    state.tableQuery = normalize(elements.tableSearchInput.value);
    renderTables();
  });

  elements.limitSelect.addEventListener("change", () => {
    state.limit = Number(elements.limitSelect.value);
    state.offset = 0;
    loadTableData().catch(renderTableError);
  });

  elements.rowSearchInput.addEventListener("input", () => {
    state.rowQuery = elements.rowSearchInput.value;
    if (state.currentTableResult) {
      renderRows(state.currentTableResult);
    }
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
