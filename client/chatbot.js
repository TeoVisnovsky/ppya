const state = {
  pending: false,
  latestResult: null,
};

const elements = {
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  sendButton: document.querySelector("#sendButton"),
  exportButton: document.querySelector("#exportButton"),
  statusText: document.querySelector("#statusText"),
  conversation: document.querySelector("#conversation"),
  bestSurface: document.querySelector("#bestSurface"),
  tableSurface: document.querySelector("#tableSurface"),
  suggestionBar: document.querySelector("#suggestionBar"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scrollConversationToBottom() {
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function appendMessage(role, html) {
  const wrapper = document.createElement("article");
  wrapper.className = `message message-${role}`;
  wrapper.innerHTML = `
    <div class="message-bubble">
      <p class="message-label">${role === "user" ? "Ty" : "Database assistant"}</p>
      ${html}
    </div>
  `;
  elements.conversation.append(wrapper);
  scrollConversationToBottom();
  return wrapper;
}

function setPending(pending) {
  state.pending = pending;
  elements.sendButton.disabled = pending;
  elements.chatInput.disabled = pending;
  elements.exportButton.disabled = pending;
  elements.statusText.textContent = pending
    ? "Prehladavam ulozenu databazu..."
    : "Pripravene na dotaz nad databazou.";
}

function buildFactCards(facts = []) {
  if (!facts.length) {
    return "";
  }

  return `
    <div class="fact-grid">
      ${facts.map((fact) => `
        <article class="fact-card">
          <span class="fact-label">${escapeHtml(fact.label)}</span>
          <strong class="fact-value">${escapeHtml(fact.value)}</strong>
        </article>
      `).join("")}
    </div>
  `;
}

function buildMetricGrid(items = []) {
  return `
    <div class="metrics-grid">
      ${items.map((item) => `
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${escapeHtml(item.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function buildRelatedGrid(items = []) {
  return `
    <div class="related-grid">
      ${items.map((item) => `
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${escapeHtml(item.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function buildResultTable(table) {
  if (!table || !Array.isArray(table.rows) || !table.rows.length) {
    return '<div class="empty-state">Pre tento dotaz sa nenasli zhodne zaznamy.</div>';
  }

  return `
    <div class="results-table-wrap">
      <table class="results-table">
        <thead>
          <tr>
            ${table.columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${table.rows.map((row) => `
            <tr>
              ${table.columns.map((column) => {
                const value = row[column.key] ?? "";
                const link = column.linkKey ? row[column.linkKey] : null;
                if (link) {
                  return `<td><a class="table-link" href="${escapeHtml(link)}">${escapeHtml(value)}</a></td>`;
                }

                return `<td>${escapeHtml(value)}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBestSurface(result) {
  if (!result) {
    elements.bestSurface.className = "best-surface empty-state";
    elements.bestSurface.textContent = "Poloz dotaz a tu uvidis zhrnutie odpovede.";
    return;
  }

  elements.bestSurface.className = "best-surface";
  elements.bestSurface.innerHTML = `
    <div class="answer-main">
      <h3>${escapeHtml(result.heading || "Odpoved")}</h3>
      <p>${escapeHtml(result.answer || "")}</p>
    </div>
    ${buildFactCards(result.relatedFacts || [])}
    <div class="results-grid">
      ${(result.cards || []).map((card) => `
        <article class="result-card">
          <div class="result-card-top">
            <div>
              <h4>${escapeHtml(card.title)}</h4>
              <p class="result-card-subtitle">${escapeHtml(card.subtitle || "")}</p>
              <p class="result-card-context">${escapeHtml(card.contextLabel || "")}</p>
            </div>
            <a class="result-card-link" href="${escapeHtml(card.link || "/")}">Detail</a>
          </div>
          ${buildMetricGrid(card.metrics || [])}
          ${buildRelatedGrid(card.related || [])}
        </article>
      `).join("")}
    </div>
    ${(result.suggestions || []).length ? `
      <div class="followup-row">
        ${result.suggestions.map((suggestion) => `
          <button class="suggestion-chip followup-chip" type="button" data-prompt="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function renderTableSurface(result) {
  const table = result?.table || null;
  const tableHeader = table
    ? `<div class="table-headline"><strong>${escapeHtml(table.title || "Vysledky")}</strong><span>${escapeHtml(table.description || "")}</span></div>`
    : "";

  elements.tableSurface.className = "table-surface";
  elements.tableSurface.innerHTML = `${tableHeader}${buildResultTable(table)}`;
  elements.exportButton.disabled = !(table && Array.isArray(table.rows) && table.rows.length);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(table) {
  const lines = [];
  lines.push(table.columns.map((column) => escapeCsv(column.label)).join(","));

  for (const row of table.rows || []) {
    lines.push(table.columns.map((column) => escapeCsv(row[column.key] ?? "")).join(","));
  }

  return lines.join("\r\n");
}

function downloadLatestTable() {
  const table = state.latestResult?.table;
  if (!table || !Array.isArray(table.rows) || !table.rows.length) {
    return;
  }

  const csv = buildCsv(table);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = table.exportFileName || "chatbot-results.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function fetchAnswer(message) {
  const response = await fetch("/api/chatbot/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Chatbot request zlyhal.");
  }

  return payload;
}

async function submitPrompt(message) {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage || state.pending) {
    return;
  }

  appendMessage("user", `<p class="message-copy">${escapeHtml(trimmedMessage)}</p>`);
  const loadingNode = appendMessage(
    "assistant",
    '<p class="message-copy"><span class="typing-dots"><span></span><span></span><span></span></span></p>',
  );

  elements.chatInput.value = "";
  setPending(true);

  try {
    const result = await fetchAnswer(trimmedMessage);
    state.latestResult = result;
    loadingNode.remove();
    appendMessage("assistant", `<p class="message-copy">${escapeHtml(result.answer || "")}</p>`);
    renderBestSurface(result);
    renderTableSurface(result);
  } catch (error) {
    loadingNode.remove();
    appendMessage("assistant", `<p class="message-copy">${escapeHtml(error.message || "Chatbot request zlyhal.")}</p>`);
    const fallback = {
      heading: "Chyba spracovania",
      answer: error.message || "Chatbot request zlyhal.",
      relatedFacts: [],
      cards: [],
      suggestions: [],
      table: null,
    };
    state.latestResult = fallback;
    renderBestSurface(fallback);
    renderTableSurface(fallback);
  } finally {
    setPending(false);
    elements.chatInput.focus();
  }
}

function bindSuggestionClicks(container) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt]");
    if (!button) {
      return;
    }

    submitPrompt(button.dataset.prompt);
  });
}

function bindEvents() {
  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitPrompt(elements.chatInput.value);
  });

  elements.exportButton.addEventListener("click", downloadLatestTable);

  bindSuggestionClicks(elements.suggestionBar);
  bindSuggestionClicks(elements.bestSurface);
}

function init() {
  appendMessage(
    "assistant",
    '<p class="message-copy">Zadaj dotaz typu: "Kto ma motorku v roku 2024?" alebo "Kto ma sperky?". Odpovede sa tvoria iba z databazovych zaznamov.</p>',
  );
  renderBestSurface(null);
  renderTableSurface(null);
  bindEvents();
}

init();
