import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import * as cheerio from "cheerio";
import {
  listPoliticiansForMatching,
  savePoliticianProfile,
} from "../db/repositories.js";
import { closeAllPools, getScraperWriteTargets } from "../db/pool.js";
import { buildPoliticianLookup, matchPolitician } from "./nameMatching.js";
import { parseDeputyProfileHtml } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);

const DEPUTIES_URL = "https://www.nrsr.sk/web/Default.aspx?sid=poslanci";

const SCRAPER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function toAbsoluteUrl(href) {
  return new URL(href, "https://www.nrsr.sk").toString();
}

async function fetchDeputyList() {
  const response = await axios.get(DEPUTIES_URL, { timeout: 30000, headers: SCRAPER_HEADERS });
  const $ = cheerio.load(response.data);
  const deputies = [];

  $("a[href*='sid=poslanci/poslanec']").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const name = $(anchor).text().trim();

    if (!href || !name) {
      return;
    }

    const absoluteUrl = toAbsoluteUrl(href);
    const url = new URL(absoluteUrl);
    const poslanecId = Number(url.searchParams.get("PoslanecID"));
    const cisObdobia = Number(url.searchParams.get("CisObdobia"));

    if (!Number.isFinite(poslanecId)) {
      return;
    }

    deputies.push({
      id: poslanecId,
      name,
      poslanecId,
      cisObdobia: Number.isFinite(cisObdobia) ? cisObdobia : null,
      profileUrl: absoluteUrl,
    });
  });

  return deputies;
}

async function fetchDeputyProfile(deputy) {
  const response = await axios.get(deputy.profileUrl, { timeout: 30000, headers: SCRAPER_HEADERS });
  return parseDeputyProfileHtml({
    html: response.data,
    sourceUrl: deputy.profileUrl,
    poslanecId: deputy.poslanecId,
    cisObdobia: deputy.cisObdobia,
  });
}

export async function syncDeputyProfiles() {
  const deputyList = await fetchDeputyList();
  const deputyLookup = buildPoliticianLookup(deputyList);
  const profileCache = new Map();
  const targets = getScraperWriteTargets();
  const summary = {
    targets: targets.map((target) => target.name),
    discoveredDeputies: deputyList.length,
    matchedPoliticians: 0,
    updated: 0,
    missingMatches: [],
    errors: [],
  };

  for (const target of targets) {
    const politicians = await listPoliticiansForMatching(target.pool);

    for (const politician of politicians) {
      const matchedDeputy = matchPolitician(deputyLookup, politician.full_name);
      if (!matchedDeputy) {
        continue;
      }

      summary.matchedPoliticians += 1;

      try {
        const cacheKey = `${matchedDeputy.poslanecId}:${matchedDeputy.cisObdobia || "na"}`;
        let deputyProfile = profileCache.get(cacheKey);
        if (!deputyProfile) {
          deputyProfile = await fetchDeputyProfile(matchedDeputy);
          profileCache.set(cacheKey, deputyProfile);
        }

        await savePoliticianProfile({
          politicianId: politician.id,
          deputyProfileId: deputyProfile.poslanecId,
          deputyProfilePeriod: deputyProfile.cisObdobia,
          deputyProfileUrl: deputyProfile.sourceUrl,
          candidateParty: deputyProfile.candidateParty,
          parliamentaryClub: deputyProfile.parliamentaryClub,
          parliamentaryMemberships: deputyProfile.memberships,
        }, target.pool);

        summary.updated += 1;
      } catch (error) {
        summary.errors.push({
          target: target.name,
          politicianId: politician.id,
          fullName: politician.full_name,
          message: error.message,
        });
      }
    }
  }

  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  syncDeputyProfiles()
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