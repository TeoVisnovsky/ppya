import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const SEARCH_URL = "https://kataster.skgeodesy.sk/eskn-portal/search/lv";
const OUTPUT_PATH = path.resolve("artifacts/kataster-detail-probe.json");
const PROGRESS_PATH = path.resolve("artifacts/kataster-detail-probe-progress.txt");
const ERROR_PATH = path.resolve("artifacts/kataster-detail-probe-error.txt");
const CADASTRAL_AREA = "STARÁ TURÁ";
const LV_NUMBER = "2482";
const DEFAULT_TIMEOUT_MS = 45000;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function writeProgress(message) {
  await fs.mkdir(path.dirname(PROGRESS_PATH), { recursive: true });
  await fs.appendFile(PROGRESS_PATH, `${new Date().toISOString()} ${message}\n`, "utf8");
}

async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      // Try the next installed browser.
    }
  }

  return chromium.launch({ headless: true });
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
    ({ selector, expected }) => {
      const element = document.querySelector(selector);
      if (!element || !("value" in element) || !element.value) {
        return false;
      }

      const normalized = element.value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      return normalized.includes(expected);
    },
    { selector: hiddenSelector, expected: normalizeText(CADASTRAL_AREA) },
    { timeout: Math.min(timeoutMs, 5000) },
  ).then(() => true).catch(() => false);
}

async function chooseAutocompleteOption(page, input, desiredText, timeoutMs) {
  const metadata = await getAutocompleteMetadata(input);
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click({ timeout: 5000, force: true }).catch(() => {});
  await page.keyboard.press("Control+A").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await page.waitForTimeout(200);
  await page.keyboard.type(String(desiredText), { delay: 140 });
  await page.waitForTimeout(1200);

  const options = page.locator(`${metadata.panelSelector} li`);
  try {
    await options.first().waitFor({ state: "visible", timeout: Math.min(timeoutMs, 5000) });
  } catch {
    await input.press("ArrowDown").catch(() => {});
    await page.waitForTimeout(300);
    await input.press("Enter").catch(() => {});
    return waitForAutocompleteSelection(page, metadata.hiddenSelector, timeoutMs);
  }

  await input.press("ArrowDown").catch(() => {});
  await page.waitForTimeout(300);
  await input.press("Enter").catch(() => {});
  return waitForAutocompleteSelection(page, metadata.hiddenSelector, timeoutMs);
}

async function search(page, timeoutMs) {
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});

  const areaInput = page.locator("#div_ku input.ui-autocomplete-input").first();
  const areaSelected = await chooseAutocompleteOption(page, areaInput, CADASTRAL_AREA, timeoutMs);
  if (!areaSelected) {
    throw new Error("Failed to select cadastral area from autocomplete.");
  }

  const lvInput = page.locator("#cislo_lv_input").first();
  await lvInput.click();
  await lvInput.fill(String(LV_NUMBER));
  await lvInput.press("Tab");

  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {}),
    page.locator("#button_search").click(),
  ]);
  await page.waitForTimeout(1500);

  const bodyText = await page.locator("body").innerText();
  if (!/Našli sme pre Vás 1 výsledok|Detail|PDF|HTML/i.test(bodyText)) {
    throw new Error("Search did not reach the expected result page.");
  }
}

async function dumpActionCandidates(page, actionLabel) {
  return page.evaluate((label) => {
    const expression = new RegExp(label, "i");
    const nodes = Array.from(document.querySelectorAll("a, button, td, span, div"));
    return nodes
      .filter((node) => expression.test((node.textContent || "").replace(/\s+/g, " ").trim()))
      .slice(0, 20)
      .map((node) => {
        const element = node;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          text: (element.textContent || "").replace(/\s+/g, " ").trim(),
          id: element.id || null,
          className: element.className || null,
          href: element.getAttribute("href"),
          onclick: element.getAttribute("onclick"),
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
          outerHTML: element.outerHTML.slice(0, 500),
        };
      });
  }, actionLabel);
}

async function capturePageState(page) {
  return {
    url: page.url(),
    title: await page.title(),
    bodyPreview: (await page.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 2000),
  };
}

async function clickAction(page, actionLabel) {
  const beforeUrl = page.url();
  const pattern = new RegExp(`^${actionLabel}$`, "i");
  const candidates = [
    page.getByRole("link", { name: pattern }),
    page.locator("td").filter({ hasText: pattern }),
    page.getByText(pattern),
    page.locator(`a:has-text('${actionLabel}')`),
    page.locator(`text=/^${actionLabel}$/i`),
  ];

  for (const candidate of candidates) {
    if (await candidate.count() === 0) {
      continue;
    }

    const target = candidate.first();
    try {
      const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
      const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
      await target.click({ force: true, timeout: 5000 });
      const popup = await popupPromise;
      const download = await downloadPromise;

      if (popup) {
        await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await popup.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        const state = await capturePageState(popup);
        await popup.close().catch(() => {});
        return {
          worked: true,
          mechanism: "popup",
          ...state,
        };
      }

      if (download) {
        const suggestedFilename = download.suggestedFilename();
        return {
          worked: true,
          mechanism: "download",
          filename: suggestedFilename,
          url: page.url(),
          title: await page.title(),
        };
      }

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const state = await capturePageState(page);
      return {
        worked: true,
        mechanism: state.url === beforeUrl ? "same-page" : "navigation",
        ...state,
      };
    } catch {
      // Try the next candidate.
    }
  }

  return {
    worked: false,
    mechanism: "none",
  };
}

async function testAction(browser, actionLabel) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await writeProgress(`action_${actionLabel}_attempt_${attempt}_start`);

    try {
        await search(page, DEFAULT_TIMEOUT_MS);
        const before = {
          ...await capturePageState(page),
          candidates: await dumpActionCandidates(page, actionLabel),
        };
        const clickResult = await clickAction(page, actionLabel);
        const afterCandidates = clickResult.mechanism === "popup"
          ? []
          : await dumpActionCandidates(page, actionLabel);

        await writeProgress(`action_${actionLabel}_attempt_${attempt}_worked_${clickResult.worked}_${clickResult.mechanism}`);
        return {
          actionLabel,
          attempt,
          before,
          result: {
            ...clickResult,
            candidatesAfter: afterCandidates,
          },
        };
    } catch (error) {
      await writeProgress(`action_${actionLabel}_attempt_${attempt}_error ${error instanceof Error ? error.message : String(error)}`);
      if (attempt === 5) {
        return {
          actionLabel,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  return {
    actionLabel,
    error: "Unreachable state.",
  };
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(PROGRESS_PATH, "", "utf8");
  await fs.rm(ERROR_PATH, { force: true }).catch(() => {});
  await writeProgress("start");

  const browser = await launchBrowser();
  await writeProgress("browser_launched");

  try {
    const results = [];
    for (const actionLabel of ["Detail", "HTML", "PDF"]) {
      results.push(await testAction(browser, actionLabel));
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify({ cadastralArea: CADASTRAL_AREA, lvNumber: LV_NUMBER, results }, null, 2), "utf8");
    await writeProgress("output_written");
    console.log(OUTPUT_PATH);
  } finally {
    await writeProgress("closing");
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  fs.mkdir(path.dirname(ERROR_PATH), { recursive: true })
    .then(() => fs.writeFile(ERROR_PATH, error instanceof Error ? error.stack || error.message : String(error), "utf8"))
    .catch(() => {});
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});