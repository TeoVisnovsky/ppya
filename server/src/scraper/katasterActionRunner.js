import fs from "node:fs/promises";
import path from "node:path";
import { searchKatasterLv } from "./katasterLvSearch.js";

const OUTPUT_PATH = path.resolve("artifacts/kataster-action-results.json");
const PROGRESS_PATH = path.resolve("artifacts/kataster-action-results-progress.txt");
const CADASTRAL_AREA = "STARÁ TURÁ";
const LV_NUMBER = "2482";
const ACTIONS = ["Detail", "HTML", "PDF"];

async function writeProgress(message) {
  await fs.mkdir(path.dirname(PROGRESS_PATH), { recursive: true });
  await fs.appendFile(PROGRESS_PATH, `${new Date().toISOString()} ${message}\n`, "utf8");
}

async function runAction(actionLabel) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await writeProgress(`${actionLabel} attempt ${attempt} start`);
    try {
      const result = await searchKatasterLv({
        cadastralArea: CADASTRAL_AREA,
        lvNumber: LV_NUMBER,
        headless: false,
        debug: true,
        timeoutMs: 45000,
        slowMoMs: 250,
        openAction: actionLabel,
      });

      await writeProgress(`${actionLabel} attempt ${attempt} success ${result.action?.clicked} ${result.action?.mechanism || "none"}`);
      return {
        actionLabel,
        attempt,
        ok: true,
        result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeProgress(`${actionLabel} attempt ${attempt} error ${message}`);
      if (attempt === 5) {
        return {
          actionLabel,
          attempt,
          ok: false,
          error: message,
          artifacts: error?.artifacts || null,
        };
      }
    }
  }

  return {
    actionLabel,
    ok: false,
    error: "Unreachable state.",
  };
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(PROGRESS_PATH, "", "utf8");

  const results = [];
  for (const actionLabel of ACTIONS) {
    results.push(await runAction(actionLabel));
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ cadastralArea: CADASTRAL_AREA, lvNumber: LV_NUMBER, results }, null, 2), "utf8");
  console.log(OUTPUT_PATH);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});