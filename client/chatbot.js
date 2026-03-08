const state = {
  pending: false,
  latestResult: null,
};

const elements = {
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  sendButton: document.querySelector("#sendButton"),
  statusText: document.querySelector("#statusText"),
  conversation: document.querySelector("#conversation"),
  answerSurface: document.querySelector("#answerSurface"),
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
      <p class="message-label">${role === "user" ? "Vy" : "Databázový asistent"}</p>
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
  elements.statusText.textContent = pending
    ? "Vyhľadávam v najnovšej uloženej databázovej snímke..."
    : "Pripravené na databázovú otázku.";
}

function buildFactCards(facts = []) {
  if (!facts.length) {
    return "";
  }

  return `
    <div class="fact-grid">
      ${facts
        .map(
          (fact) => `
        <article class="fact-card">
          <span class="fact-label">${escapeHtml(fact.label)}</span>
          <strong class="fact-value">${escapeHtml(fact.value)}</strong>
        </article>
      `,
        )
        .join("")}
    </div>
  `;
}

function buildMetricGrid(items = []) {
  return `
    <div class="metrics-grid">
      ${items
        .map(
          (item) => `
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${escapeHtml(item.value)}</strong>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function buildRelatedGrid(items = []) {
  return `
    <div class="related-grid">
      ${items
        .map(
          (item) => `
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${escapeHtml(item.value)}</strong>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function buildResultTable(table) {
  if (!table || !Array.isArray(table.rows) || !table.rows.length) {
    return "";
  }

  return `
    <section class="table-panel">
      <div class="table-toolbar">
        <div>
          <h3>${escapeHtml(table.title || "Nájdené záznamy")}</h3>
          <p>${escapeHtml(table.description || "")}</p>
        </div>
        <button class="table-export-button" type="button" data-action="export-csv">Stiahnuť CSV</button>
      </div>
      <div class="results-table-wrap glass-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              ${table.columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${table.rows
              .map(
                (row) => `
              <tr>
                ${table.columns
                  .map((column) => {
                    const value = row[column.key] ?? "";
                    const link = column.linkKey ? row[column.linkKey] : null;
                    if (link) {
                      return `<td><a class="table-link" href="${escapeHtml(link)}">${escapeHtml(value)}</a></td>`;
                    }

                    return `<td>${escapeHtml(value)}</td>`;
                  })
                  .join("")}
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[";\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(table) {
  const separatorHint = "sep=;";
  const header = table.columns.map((column) => escapeCsv(column.label)).join(";");
  const rows = (table.rows || []).map((row) => table.columns.map((column) => escapeCsv(row[column.key] ?? "")).join(";"));
  return [separatorHint, header, ...rows].join("\r\n");
}

function downloadLatestTable() {
  const table = state.latestResult?.table;
  if (!table || !Array.isArray(table.rows) || !table.rows.length) {
    return;
  }

  const blob = new Blob(["\ufeff", buildCsv(table)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = table.exportFileName || "chatbot-vysledky.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function renderAnswerSurface(result) {
  if (!result) {
    elements.answerSurface.className = "answer-surface empty-state";
    elements.answerSurface.textContent = "Položte otázku a tento panel sa vyplní odpoveďou.";
    elements.tableSurface.className = "table-surface empty-state";
    elements.tableSurface.textContent = "Položte otázku a vygeneruje sa exportovateľná tabuľka.";
    return;
  }

  elements.answerSurface.className = "answer-surface";
  elements.answerSurface.innerHTML = `
    <div class="answer-main">
      <h3>${escapeHtml(result.heading || "Odpoveď")}</h3>
      <p>${escapeHtml(result.answer || "")}</p>
    </div>
    ${buildFactCards(result.relatedFacts || [])}
    <div class="results-grid">
      ${(result.cards || [])
        .map(
          (card) => `
        <article class="result-card">
          <div class="result-card-top">
            <div>
              <h4>${escapeHtml(card.title)}</h4>
              <p class="result-card-subtitle">${escapeHtml(card.subtitle || "")}</p>
              <p class="result-card-context">${escapeHtml(card.contextLabel || "")}</p>
            </div>
            <a class="result-card-link" href="${escapeHtml(card.link || "/")}">Otvoriť detail</a>
          </div>
          ${buildMetricGrid(card.metrics || [])}
          ${buildRelatedGrid(card.related || [])}
        </article>
      `,
        )
        .join("")}
    </div>
    ${(result.suggestions || []).length
      ? `
      <div class="followup-row">
        ${result.suggestions
          .map(
            (suggestion) => `
          <button class="suggestion-chip followup-chip" type="button" data-prompt="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>
        `,
          )
          .join("")}
      </div>
    `
      : ""}
  `;

  if (result.table?.rows?.length) {
    elements.tableSurface.className = "table-surface";
    elements.tableSurface.innerHTML = buildResultTable(result.table);
  } else {
    elements.tableSurface.className = "table-surface empty-state";
    elements.tableSurface.textContent = "Táto odpoveď neobsahuje výsledkovú tabuľku.";
  }
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
    throw new Error(payload?.error || "Požiadavka na chatbot zlyhala.");
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
    appendMessage(
      "assistant",
      `<p class="message-copy">${escapeHtml(result.answer || "")}</p>`,
    );
    renderAnswerSurface(result);
  } catch (error) {
    loadingNode.remove();
    appendMessage(
      "assistant",
      `<p class="message-copy">${escapeHtml(error.message || "Požiadavka na chatbot zlyhala.")}</p>`,
    );
    renderAnswerSurface({
      heading: "Požiadavka zlyhala",
      answer: error.message || "Požiadavka na chatbot zlyhala.",
      relatedFacts: [],
      cards: [],
      suggestions: [],
    });
  } finally {
    setPending(false);
    elements.chatInput.focus();
  }
}

function bindSuggestionClicks(container) {
  container.addEventListener("click", (event) => {
    const exportButton = event.target.closest("[data-action='export-csv']");
    if (exportButton) {
      downloadLatestTable();
      return;
    }

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

  bindSuggestionClicks(elements.suggestionBar);
  bindSuggestionClicks(elements.answerSurface);
  bindSuggestionClicks(elements.tableSurface);
}

function init() {
  appendMessage(
    "assistant",
    '<p class="message-copy">Pýtajte sa prirodzene. Vpravo uvidíte najlepšie zhody a dole kompletnú tabuľku, ktorú si môžete stiahnuť ako CSV.</p>',
  );
  renderAnswerSurface(null);
  bindEvents();
}

init();
