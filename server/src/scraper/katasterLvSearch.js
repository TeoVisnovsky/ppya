import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);

const SEARCH_URL = "https://kataster.skgeodesy.sk/eskn-portal/search/lv";
const DEFAULT_TIMEOUT_MS = 30000;
const CADASTRAL_AREA_INPUT_SELECTOR = "#div_ku input.ui-autocomplete-input";
const CADASTRAL_AREA_HIDDEN_SELECTOR = "#div_ku input[type='hidden']";
const LV_INPUT_SELECTOR = "#cislo_lv_input";
const SEARCH_BUTTON_SELECTOR = "#button_search";
const isDirectExecution = Boolean(process.argv[1]) && path.basename(process.argv[1]) === path.basename(__filename);
const DEFAULT_SLOW_MO_MS = 250;
const ARTIFACTS_DIR = path.resolve(path.dirname(__filename), "../../artifacts/kataster-lv");

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function coerceBoolean(value, fallback = true) {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function createLogger(enabled) {
  return (...args) => {
    if (!enabled) {
      return;
    }

    console.error("[kataster:lv]", ...args);
  };
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeFileSegment(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function createArtifactToken(cadastralArea, lvNumber) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  return `${timestamp}_${sanitizeFileSegment(cadastralArea)}_${sanitizeFileSegment(lvNumber)}`;
}

async function ensureArtifactDir(dirPath = ARTIFACTS_DIR) {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

async function writeFailureArtifacts({
  page,
  artifactDir,
  token,
  cadastralArea,
  lvNumber,
  error,
}) {
  const directory = await ensureArtifactDir(artifactDir);
  const screenshotPath = path.join(directory, `${token}.png`);
  const htmlPath = path.join(directory, `${token}.html`);
  const metaPath = path.join(directory, `${token}.json`);

  if (page) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) {
      await fs.writeFile(htmlPath, html, "utf8").catch(() => {});
    }
  }

  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        cadastralArea,
        lvNumber,
        finalUrl: page ? page.url() : null,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
    "utf8",
  ).catch(() => {});

  return {
    screenshotPath,
    htmlPath,
    metaPath,
  };
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const trimmed = token.slice(2);
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex >= 0) {
      result[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
      continue;
    }

    const nextToken = argv[index + 1];
    if (nextToken && !nextToken.startsWith("--")) {
      result[trimmed] = nextToken;
      index += 1;
      continue;
    }

    result[trimmed] = true;
  }

  return result;
}

async function launchBrowser(headless, slowMoMs) {
  const launchOptions = {
    headless,
    slowMo: slowMoMs,
  };

  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ ...launchOptions, channel });
    } catch {
      // Try another installed browser before falling back to bundled Chromium.
    }
  }

  return chromium.launch(launchOptions);
}

async function listVisibleTextInputs(page) {
  return page.locator("input").evaluateAll((nodes) => {
    return nodes
      .map((node, index) => {
        const element = node;
        const type = (element.getAttribute("type") || "text").toLowerCase();
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return {
          index,
          type,
          id: element.id || "",
          name: element.getAttribute("name") || "",
          className: element.className || "",
          placeholder: element.getAttribute("placeholder") || "",
          ariaLabel: element.getAttribute("aria-label") || "",
          visible: !element.disabled
            && type !== "hidden"
            && style.display !== "none"
            && style.visibility !== "hidden"
            && rect.width > 0
            && rect.height > 0,
        };
      })
      .filter((item) => item.visible);
  });
}

function scoreInput(item, needles) {
  const haystack = normalizeText([
    item.id,
    item.name,
    item.className,
    item.placeholder,
    item.ariaLabel,
  ].join(" "));

  return needles.reduce((score, needle) => (haystack.includes(needle) ? score + 1 : score), 0);
}

async function resolveCadastralAreaInput(page) {
  const exact = page.locator(CADASTRAL_AREA_INPUT_SELECTOR);
  if (await exact.count() > 0 && await exact.first().isVisible()) {
    return {
      locator: exact.first(),
      index: await exact.first().evaluate((node) => Array.from(document.querySelectorAll("input")).indexOf(node)),
    };
  }

  const inputs = await listVisibleTextInputs(page);
  const ranked = [...inputs].sort((left, right) => {
    return scoreInput(right, ["obec", "katastral", "uzemie", "autocomplete", "vyber"])
      - scoreInput(left, ["obec", "katastral", "uzemie", "autocomplete", "vyber"]);
  });

  const match = ranked[0];
  if (!match) {
    throw new Error("Nepodarilo sa nájsť vstup pre obec alebo katastrálne územie.");
  }

  return {
    locator: page.locator("input").nth(match.index),
    index: match.index,
  };
}

async function resolveLvNumberInput(page, excludedIndex) {
  const exact = page.locator(LV_INPUT_SELECTOR);
  if (await exact.count() > 0 && await exact.first().isVisible()) {
    return exact.first();
  }

  const inputs = await listVisibleTextInputs(page);
  const candidates = inputs.filter((item) => item.index !== excludedIndex);
  const ranked = [...candidates].sort((left, right) => {
    return scoreInput(right, ["list", "vlastnict", "lv", "cislo"])
      - scoreInput(left, ["list", "vlastnict", "lv", "cislo"]);
  });

  const match = ranked[0];
  if (!match) {
    throw new Error("Nepodarilo sa nájsť vstup pre číslo listu vlastníctva.");
  }

  return page.locator("input").nth(match.index);
}

async function getAutocompleteMetadata(input) {
  return input.evaluate((element) => {
    const inputId = element.id || "";
    const root = element.closest("span.ui-autocomplete");
    const rootId = root?.id || inputId.replace(/_input$/, "");

    return {
      inputId,
      rootId,
      panelSelector: rootId ? `#${rootId}_panel` : ".ui-autocomplete-panel",
      hiddenSelector: rootId ? `#${rootId}_hinput` : "#div_ku input[type='hidden']",
    };
  });
}

async function waitForAutocompleteSelection(page, hiddenSelector, timeoutMs) {
  return page.waitForFunction(
    (selector) => {
      const element = document.querySelector(selector);
      return Boolean(element && "value" in element && element.value);
    },
    hiddenSelector,
    { timeout: Math.min(timeoutMs, 5000) },
  ).then(() => true).catch(() => false);
}

async function logAutocompleteState(page, metadata, log = () => {}) {
  const state = await page.evaluate((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    const options = panel
      ? Array.from(panel.querySelectorAll("li")).map((item) => item.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean).slice(0, 10)
      : [];

    return {
      panelExists: Boolean(panel),
      panelClassName: panel?.className || null,
      panelText: panel?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) || null,
      optionCount: options.length,
      options,
    };
  }, metadata.panelSelector);

  log("autocomplete panel state", state);
}

async function moveCursorToAndClickInput(page, input, log = () => {}) {
  log("moving cursor to cadastral area input");
  await input.scrollIntoViewIfNeeded().catch(() => {});
  const box = await input.boundingBox().catch(() => null);
  if (box) {
    const targetX = box.x + (box.width / 2);
    const targetY = box.y + (box.height / 2);
    await page.mouse.move(targetX, targetY, { steps: 12 }).catch(() => {});
  } else {
    await input.hover().catch(() => {});
  }
  log("clicking cadastral area input");

  try {
    if (box) {
      await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2), { delay: 80 });
    } else {
      await input.click({ timeout: 5000 });
    }
    return true;
  } catch {
    log("direct click blocked, using DOM focus fallback");
    await input.evaluate((element) => {
      element.focus();
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    return false;
  }
}

async function chooseAutocompleteOption(page, input, desiredText, timeoutMs, log = () => {}) {
  const metadata = await getAutocompleteMetadata(input);
  log("autocomplete metadata", metadata);
  await moveCursorToAndClickInput(page, input, log);
  log("clearing cadastral area input");
  await page.keyboard.press("Control+A").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await page.waitForTimeout(200);
  log("typing cadastral area input letter by letter", desiredText);
  await page.keyboard.type(String(desiredText), { delay: 140 });
  await page.waitForTimeout(1200);

  const options = page.locator(`${metadata.panelSelector} li`);

  log("waiting for autocomplete options");
  try {
    await options.first().waitFor({ state: "visible", timeout: Math.min(timeoutMs, 5000) });
  } catch {
    await logAutocompleteState(page, metadata, log);
    log("autocomplete options not visible, using keyboard fallback");
    await input.press("ArrowDown");
    await page.waitForTimeout(300);
    await input.press("Enter");
    const selected = await waitForAutocompleteSelection(page, metadata.hiddenSelector, timeoutMs);
    log("keyboard fallback selected", selected);
    return selected;
  }

  const count = await options.count();
  log("autocomplete options visible", count);
  await logAutocompleteState(page, metadata, log);
  await input.press("ArrowDown");
  await page.waitForTimeout(250);
  await input.press("Enter");
  let selected = await waitForAutocompleteSelection(page, metadata.hiddenSelector, timeoutMs);
  if (!selected) {
    log("keyboard first-option select did not populate hidden input, trying DOM click");
    await options.first().evaluate((element) => {
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }).catch(() => {});
    selected = await waitForAutocompleteSelection(page, metadata.hiddenSelector, timeoutMs);
  }
  log("first autocomplete option selected", selected);
  return selected;
}

async function clickSearchButton(page, timeoutMs) {
  const exact = page.locator(SEARCH_BUTTON_SELECTOR);
  if (await exact.count() > 0 && await exact.first().isVisible()) {
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {}),
      exact.first().click(),
    ]);
    await page.waitForTimeout(1000);
    return;
  }

  const candidates = [
    page.getByRole("button", { name: /Vyhľadať|Vyhladať/i }),
    page.locator("button:has-text('Vyhľadať'), button:has-text('Vyhladať')"),
    page.locator(".ui-button:has-text('Vyhľadať'), .ui-button:has-text('Vyhladať')"),
    page.locator("input[type='submit']"),
  ];

  for (const candidate of candidates) {
    if (await candidate.count() === 0) {
      continue;
    }

    const button = candidate.first();
    if (!(await button.isVisible())) {
      continue;
    }

    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {}),
      button.click(),
    ]);
    await page.waitForTimeout(1000);
    return;
  }

  throw new Error("Nepodarilo sa nájsť tlačidlo Vyhľadať.");
}

async function extractSearchResult(page) {
  const bodyText = await page.locator("body").innerText();
  const messages = await page.locator("#main_messages, .ui-messages, .ui-growl-message").evaluateAll((nodes) => {
    return nodes
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
      .filter(Boolean);
  });
  const tables = await page.locator("table").evaluateAll((nodes) => {
    return nodes
      .map((table) => {
        const element = table;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
          return null;
        }

        const rows = Array.from(element.querySelectorAll("tr"))
          .map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() || ""))
          .filter((row) => row.some(Boolean));

        return rows.length > 0 ? rows : null;
      })
      .filter(Boolean)
      .slice(0, 10);
  });

  const links = await page.locator("a[href]").evaluateAll((nodes) => {
    return nodes
      .map((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
        const href = node.getAttribute("href") || "";
        return text && href ? { text, href } : null;
      })
      .filter(Boolean)
      .slice(0, 30);
  });

  return {
    finalUrl: page.url(),
    title: await page.title(),
    notFound: /nena[jd]en|žiadne záznamy|bez výsledku/i.test(bodyText),
    messages,
    bodyPreview: bodyText.replace(/\s+/g, " ").trim().slice(0, 4000),
    tables,
    links,
  };
}

export async function searchKatasterLv({
  cadastralArea,
  lvNumber,
  headless = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  screenshotPath,
  debug = false,
  slowMoMs,
  artifactDir = ARTIFACTS_DIR,
} = {}) {
  if (!cadastralArea) {
    throw new Error("Missing cadastralArea");
  }

  if (!lvNumber) {
    throw new Error("Missing lvNumber");
  }

  const log = createLogger(debug);
  const effectiveSlowMoMs = parseNumber(slowMoMs, headless ? 0 : DEFAULT_SLOW_MO_MS);
  const artifactToken = createArtifactToken(cadastralArea, lvNumber);
  log("launching browser", { headless, timeoutMs, slowMoMs: effectiveSlowMoMs });
  const browser = await launchBrowser(headless, effectiveSlowMoMs);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    log("opening page", SEARCH_URL);
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    log("page loaded", page.url());

    const { locator: cadastralAreaInput, index: cadastralAreaIndex } = await resolveCadastralAreaInput(page);
    log("resolved cadastral area input", { cadastralAreaIndex, cadastralArea });
    const areaSelected = await chooseAutocompleteOption(page, cadastralAreaInput, cadastralArea, timeoutMs, log);
    log("cadastral area selected", areaSelected);

    const lvInput = await resolveLvNumberInput(page, cadastralAreaIndex);
    await lvInput.click();
    await lvInput.fill(String(lvNumber));
    await lvInput.press("Tab");
    log("lv number filled before search click", lvNumber);

    await clickSearchButton(page, timeoutMs);
    log("search submitted after cadastral area selection and lv number fill", page.url());

    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log("screenshot saved", screenshotPath);
    }

    const result = await extractSearchResult(page);
    result.options = {
      cadastralArea,
      lvNumber: String(lvNumber),
      headless,
      timeoutMs,
      slowMoMs: effectiveSlowMoMs,
    };
    log("result extracted", { notFound: result.notFound, finalUrl: result.finalUrl });
    return result;
  } catch (error) {
    const artifacts = await writeFailureArtifacts({
      page,
      artifactDir,
      token: artifactToken,
      cadastralArea,
      lvNumber,
      error,
    });
    log("failure artifacts written", artifacts);
    if (error && typeof error === "object") {
      error.artifacts = artifacts;
    }
    throw error;
  } finally {
    log("closing browser");
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

if (isDirectExecution) {
  const args = parseArgs(process.argv.slice(2));

  searchKatasterLv({
    cadastralArea: args.cadastralArea || args.katastralneUzemie || args.obec,
    lvNumber: args.lvNumber || args.lv || args.cisloLv,
    headless: coerceBoolean(args.headless, true),
    timeoutMs: parseNumber(args.timeoutMs, DEFAULT_TIMEOUT_MS),
    screenshotPath: args.screenshot,
    debug: coerceBoolean(args.debug, false),
    slowMoMs: parseNumber(args.slowMoMs, undefined),
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        artifacts: error?.artifacts || null,
      }, null, 2));
      process.exitCode = 1;
    });
}