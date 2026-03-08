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
      <p class="message-label">${role === "user" ? "You" : "Database assistant"}</p>
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
    ? "Querying the latest stored database snapshot..."
    : "Ready for a database-backed question.";
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

function renderAnswerSurface(result) {
  if (!result) {
    elements.answerSurface.className = "answer-surface empty-state";
    elements.answerSurface.textContent = "Ask a question to populate this panel.";
    return;
  }

  elements.answerSurface.className = "answer-surface";
  elements.answerSurface.innerHTML = `
    <div class="answer-main">
      <h3>${escapeHtml(result.heading || "Answer")}</h3>
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
            <a class="result-card-link" href="${escapeHtml(card.link || "/")}">Open detail</a>
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
    throw new Error(payload?.error || "The chatbot request failed.");
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
      `<p class="message-copy">${escapeHtml(error.message || "The chatbot request failed.")}</p>`,
    );
    renderAnswerSurface({
      heading: "Request failed",
      answer: error.message || "The chatbot request failed.",
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
}

function init() {
  appendMessage(
    "assistant",
    '<p class="message-copy">Ask me for rankings, politician profiles, or snapshot lookups across assets, gifts, liabilities, jobs, voting, and profile fields. I answer only from the local database-backed backend.</p>',
  );
  renderAnswerSurface(null);
  bindEvents();
}

init();