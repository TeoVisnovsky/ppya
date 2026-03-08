import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import {
  listPoliticiansForMatching,
  savePoliticianProfile,
} from "../db/repositories.js";
import { closeAllPools, getScraperWriteTargets } from "../db/pool.js";
import { buildPoliticianLookup, matchPolitician } from "./nameMatching.js";
import {
  buildDeputyMandateChangesLookup,
  fetchDeputyList,
  fetchDeputyMandateChanges,
  fetchDeputyProfile,
  fetchDeputySummaryById,
} from "./deputyProfiles.js";

const __filename = fileURLToPath(import.meta.url);

function buildPeriodsDescending(maxPeriod) {
  const periods = [];
  for (let period = Number(maxPeriod) || 0; period >= 1; period -= 1) {
    periods.push(period);
  }

  return periods;
}

function mergeDeputiesByPoslanecId(currentDeputies, rangeDeputies) {
  const merged = new Map();

  for (const deputy of currentDeputies) {
    if (Number.isFinite(Number(deputy.poslanecId))) {
      merged.set(Number(deputy.poslanecId), deputy);
    }
  }

  for (const deputy of rangeDeputies) {
    const key = Number(deputy.poslanecId);
    if (!Number.isFinite(key) || merged.has(key)) {
      continue;
    }

    merged.set(key, deputy);
  }

  return Array.from(merged.values());
}

function buildUniquePoliticianNameRows(targetPoliticians, deputyLookup) {
  const uniqueRows = new Map();

  for (const politicians of targetPoliticians.values()) {
    for (const politician of politicians) {
      if (matchPolitician(deputyLookup, politician.full_name)) {
        continue;
      }

      if (!uniqueRows.has(politician.full_name)) {
        uniqueRows.set(politician.full_name, {
          id: politician.full_name,
          full_name: politician.full_name,
        });
      }
    }
  }

  return Array.from(uniqueRows.values());
}

async function discoverHistoricalDeputies(unmatchedPoliticians) {
  const maxPoslanecId = Number(config.profileScraperMaxPoslanecId);
  const startPoslanecId = Math.max(1, Number(config.profileScraperStartPoslanecId) || 1);
  const maxPeriod = Math.max(1, Number(config.profileScraperMaxPeriod) || 1);
  const concurrency = Math.max(1, Number(config.profileScraperConcurrency) || 1);
  const consecutiveMissThreshold = Math.max(0, Number(config.profileScraperConsecutiveMissThreshold) || 0);

  if (maxPoslanecId < startPoslanecId || unmatchedPoliticians.length === 0) {
    return {
      discoveredDeputies: [],
      scannedIds: 0,
      matchedNames: 0,
      remainingNames: unmatchedPoliticians.length,
    };
  }

  const unmatchedLookup = buildPoliticianLookup(unmatchedPoliticians);
  const remainingNames = new Set(unmatchedPoliticians.map((row) => row.full_name));
  const matchedDeputiesById = new Map();
  const periods = buildPeriodsDescending(maxPeriod);

  let scannedIds = 0;
  let consecutiveMisses = 0;
  let stopRequested = false;

  async function scanSingleId(poslanecId) {
    for (const cisObdobia of periods) {
      let summary = null;

      try {
        summary = await fetchDeputySummaryById(poslanecId, cisObdobia);
      } catch {
        summary = null;
      }

      if (!summary) {
        continue;
      }

      const matchedPolitician = matchPolitician(unmatchedLookup, summary.name);
      if (!matchedPolitician || !remainingNames.has(matchedPolitician.full_name)) {
        return false;
      }

      matchedDeputiesById.set(summary.poslanecId, summary);
      remainingNames.delete(matchedPolitician.full_name);
      return true;
    }

    return false;
  }

  async function scanWorker(offset) {
    for (let poslanecId = startPoslanecId + offset; poslanecId <= maxPoslanecId; poslanecId += concurrency) {
      if (stopRequested || remainingNames.size === 0) {
        return;
      }

      const matched = await scanSingleId(poslanecId);
      scannedIds += 1;

      if (matched) {
        consecutiveMisses = 0;
      } else {
        consecutiveMisses += 1;
        if (consecutiveMissThreshold > 0 && consecutiveMisses >= consecutiveMissThreshold) {
          stopRequested = true;
        }
      }

      if (scannedIds % 250 === 0) {
        console.log(JSON.stringify({
          phase: "profile-range-scan",
          scannedIds,
          matchedNames: unmatchedPoliticians.length - remainingNames.size,
          remainingNames: remainingNames.size,
        }));
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, (_, index) => scanWorker(index)),
  );

  return {
    discoveredDeputies: Array.from(matchedDeputiesById.values()),
    scannedIds,
    matchedNames: unmatchedPoliticians.length - remainingNames.size,
    remainingNames: remainingNames.size,
  };
}

export async function syncDeputyProfiles() {
  const targets = getScraperWriteTargets();
  const targetPoliticians = new Map();
  const currentDeputies = await fetchDeputyList();
  const currentDeputyLookup = buildPoliticianLookup(currentDeputies);
  const unmatchedPoliticians = [];

  for (const target of targets) {
    const politicians = await listPoliticiansForMatching(target.pool);
    targetPoliticians.set(target.name, politicians);
  }

  const uniqueUnmatchedPoliticians = buildUniquePoliticianNameRows(targetPoliticians, currentDeputyLookup);
  const rangeDiscovery = await discoverHistoricalDeputies(uniqueUnmatchedPoliticians);
  const deputyList = mergeDeputiesByPoslanecId(currentDeputies, rangeDiscovery.discoveredDeputies);
  const deputyLookup = buildPoliticianLookup(deputyList);
  const profileCache = new Map();
  const mandateChangesLookupCache = new Map();
  const summary = {
    targets: targets.map((target) => target.name),
    discoveredDeputies: deputyList.length,
    currentListDeputies: currentDeputies.length,
    rangeMatchedDeputies: rangeDiscovery.discoveredDeputies.length,
    rangeScannedIds: rangeDiscovery.scannedIds,
    remainingUnmatchedUniqueNames: rangeDiscovery.remainingNames,
    matchedPoliticians: 0,
    updated: 0,
    missingMatches: [],
    errors: [],
  };

  async function getMandateChangesLookup(cisObdobia) {
    const periodKey = Number.isFinite(Number(cisObdobia)) ? Number(cisObdobia) : null;
    if (!Number.isFinite(periodKey)) {
      return new Map();
    }

    if (!mandateChangesLookupCache.has(periodKey)) {
      const rows = await fetchDeputyMandateChanges(periodKey);
      mandateChangesLookupCache.set(periodKey, buildDeputyMandateChangesLookup(rows));
    }

    return mandateChangesLookupCache.get(periodKey);
  }

  for (const target of targets) {
    const politicians = targetPoliticians.get(target.name) || [];
    const unmatchedPoliticians = [];

    for (const politician of politicians) {
      const matchedDeputy = matchPolitician(deputyLookup, politician.full_name);
      if (!matchedDeputy) {
        unmatchedPoliticians.push({ politicianId: politician.id, fullName: politician.full_name });
        continue;
      }

      summary.matchedPoliticians += 1;

      try {
        const cacheKey = `${matchedDeputy.poslanecId}:${matchedDeputy.cisObdobia || "na"}`;
        let deputyProfile = profileCache.get(cacheKey);
        if (!deputyProfile) {
          const mandateChangesLookup = await getMandateChangesLookup(matchedDeputy.cisObdobia);
          deputyProfile = await fetchDeputyProfile(matchedDeputy, mandateChangesLookup);
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

    summary.missingMatches.push({
      target: target.name,
      count: unmatchedPoliticians.length,
      sample: unmatchedPoliticians.slice(0, 20),
    });
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