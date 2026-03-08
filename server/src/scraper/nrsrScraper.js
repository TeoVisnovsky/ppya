import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { saveDeclaration, savePoliticianProfile } from "../db/repositories.js";
import { closeAllPools, getScraperWriteTargets } from "../db/pool.js";
import { parseDeclarationHtml } from "./parser.js";
import { buildPoliticianLookup, matchPolitician } from "./nameMatching.js";
import {
  SCRAPER_HEADERS,
  buildDeputyMandateChangesLookup,
  fetchDeputyList,
  fetchDeputyMandateChanges,
  fetchDeputyProfile,
} from "./deputyProfiles.js";

const __filename = fileURLToPath(import.meta.url);

const LIST_URL = "https://www.nrsr.sk/web/Default.aspx?sid=vnf/zoznam&ViewType=1";
const DETAIL_URL = "https://www.nrsr.sk/web/Default.aspx?sid=vnf/oznamenie&UserId=";
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchList() {
  const response = await (await import("axios")).default.get(LIST_URL, { timeout: 30000, headers: SCRAPER_HEADERS });
  const cheerio = await import("cheerio");
  const $ = cheerio.load(response.data);

  const map = new Map();

  $("a[href*='sid=vnf/oznamenie&UserId=']").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) {
      return;
    }

    const absoluteUrl = new URL(href, "https://www.nrsr.sk").toString();
    const url = new URL(absoluteUrl);
    const userId = url.searchParams.get("UserId");
    const label = $(anchor).text().trim();

    if (!userId) {
      return;
    }

    if (!map.has(userId)) {
      map.set(userId, { userId, name: label, url: absoluteUrl });
    }
  });

  return Array.from(map.values());
}

async function fetchDeclarationForPolitician({ userId, name }) {
  const url = `${DETAIL_URL}${encodeURIComponent(userId)}`;
  const response = await (await import("axios")).default.get(url, { timeout: 30000, headers: SCRAPER_HEADERS });

  return parseDeclarationHtml({
    html: response.data,
    sourceUrl: url,
    userId,
    fallbackName: name,
  });
}

export async function runScrape({ limit } = {}) {
  const politicians = await fetchList();
  const deputyList = await fetchDeputyList();
  const deputyMandateChanges = await fetchDeputyMandateChanges(deputyList[0]?.cisObdobia);
  const deputyMandateChangesLookup = buildDeputyMandateChangesLookup(deputyMandateChanges);
  const deputyLookup = buildPoliticianLookup(deputyList);
  const deputyProfileCache = new Map();
  const selected = typeof limit === "number" ? politicians.slice(0, limit) : politicians;
  const targets = getScraperWriteTargets();

  let saved = 0;
  const errors = [];
  const byTarget = Object.fromEntries(targets.map((target) => [target.name, { saved: 0, errors: 0 }]));

  for (const politician of selected) {
    try {
      const declaration = await fetchDeclarationForPolitician(politician);
      const matchedDeputy = matchPolitician(deputyLookup, declaration.titleName || politician.name);
      let savedAnywhere = false;

      for (const target of targets) {
        try {
          const saveResult = await saveDeclaration(declaration, target.pool);

          if (matchedDeputy) {
            const cacheKey = `${matchedDeputy.poslanecId}:${matchedDeputy.cisObdobia || "na"}`;
            let deputyProfile = deputyProfileCache.get(cacheKey);
            if (!deputyProfile) {
              deputyProfile = await fetchDeputyProfile(matchedDeputy, deputyMandateChangesLookup);
              deputyProfileCache.set(cacheKey, deputyProfile);
            }

            await savePoliticianProfile({
              politicianId: saveResult.politicianId,
              deputyProfileId: deputyProfile.poslanecId,
              deputyProfilePeriod: deputyProfile.cisObdobia,
              deputyProfileUrl: deputyProfile.sourceUrl,
              candidateParty: deputyProfile.candidateParty,
              parliamentaryClub: deputyProfile.parliamentaryClub,
              parliamentaryMemberships: deputyProfile.memberships,
              deputyTitle: deputyProfile.title,
              deputyFirstName: deputyProfile.firstName,
              deputyLastName: deputyProfile.lastName,
              deputyBirthDate: deputyProfile.birthDate,
              deputyBirthDateText: deputyProfile.birthDateText,
              deputyNationality: deputyProfile.nationality,
              deputyResidence: deputyProfile.residence,
              deputyRegion: deputyProfile.region,
              deputyEmail: deputyProfile.email,
              deputyWebsite: deputyProfile.website,
              candidatePartyMemberships: deputyProfile.candidatePartyMemberships,
              deputyPersonalData: deputyProfile.personalData,
              deputyPhotoUrl: deputyProfile.photoUrl,
              deputyPhotoContentType: deputyProfile.photoContentType,
              deputyPhotoData: deputyProfile.photoData,
              deputyTermInfo: deputyProfile.termInfo,
            }, target.pool);
          }

          savedAnywhere = true;
          saved += 1;
          byTarget[target.name].saved += 1;
        } catch (error) {
          byTarget[target.name].errors += 1;
          errors.push({
            userId: politician.userId,
            target: target.name,
            message: error.message,
          });
        }
      }

      if (!savedAnywhere && targets.length === 0) {
        errors.push({
          userId: politician.userId,
          message: "No configured database targets available",
        });
      }
    } catch (error) {
      errors.push({
        userId: politician.userId,
        message: error.message,
      });
    }

    if (config.scraperDelayMs > 0) {
      await sleep(config.scraperDelayMs);
    }
  }

  return {
    targets: targets.map((target) => target.name),
    totalDiscovered: politicians.length,
    attempted: selected.length,
    saved,
    byTarget,
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const limitArg = Number(process.argv[2]);
  const limit = Number.isFinite(limitArg) ? limitArg : undefined;

  runScrape({ limit })
    .then(async (result) => {
      console.log(JSON.stringify(result, null, 2));
      await closeAllPools();
    })
    .catch(async (error) => {
      console.error(error);
      await closeAllPools();
      process.exitCode = 1;
    });
}
