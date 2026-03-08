import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import * as cheerio from "cheerio";
import { config } from "../config.js";
import {
  listPoliticiansForMatching,
  savePoliticianVotingStats,
  savePoliticianVotingTranscript,
} from "../db/repositories.js";
import { closeAllPools, getScraperWriteTargets } from "../db/pool.js";
import { buildPoliticianLookup, matchPolitician } from "./nameMatching.js";
import { parseVotingResultsHtml } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);

const SCRAPER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTranscriptText(rows) {
  return rows
    .map((row) => {
      const parts = [
        row.schodzaNumber ? `Cislo schodze: ${row.schodzaNumber}` : null,
        row.voteDateText ? `Datum: ${row.voteDateText}` : null,
        row.voteNumber ? `Cislo: ${row.voteNumber}` : null,
        row.cptText ? `CPT: ${row.cptText}` : null,
        row.voteTitle ? `Nazov: ${row.voteTitle}` : null,
        row.votedAs ? `Hlasoval: ${row.votedAs}` : null,
      ].filter(Boolean);

      return parts.join(" | ");
    })
    .join("\n");
}

function buildRawPagesPayload(pages) {
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    sourceUrl: page.sourceUrl,
    resultTableHtml: page.resultTableHtml,
    rawPageHtml: page.rawPageHtml,
  }));
}

function buildVotingUrl(cisObdobia, cisSchodze, poslanecMasterId) {
  const url = new URL("https://www.nrsr.sk/web/Default.aspx");
  url.searchParams.set("sid", "schodze/hlasovanie/poslanci_vysledok");
  url.searchParams.set("ZakZborID", "13");
  url.searchParams.set("CisObdobia", String(cisObdobia));
  url.searchParams.set("Text", "");
  url.searchParams.set("CPT", "");
  url.searchParams.set("CisSchodze", String(cisSchodze));
  url.searchParams.set("DatumOd", "1900-1-1 0:0:0");
  url.searchParams.set("DatumDo", "2100-1-1 0:0:0");
  url.searchParams.set("FullText", "True");
  url.searchParams.set("PoslanecMasterID", String(poslanecMasterId));
  return url.toString();
}

function updateCookieJar(cookieJar, response) {
  const setCookieHeaders = response.headers?.["set-cookie"] || [];
  for (const cookieHeader of setCookieHeaders) {
    const pair = String(cookieHeader).split(";", 1)[0];
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = pair.slice(0, separatorIndex);
    const value = pair.slice(separatorIndex + 1);
    cookieJar.set(name, value);
  }
}

function buildCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

async function requestHtml({ url, method = "get", body, cookieJar }) {
  const headers = { ...SCRAPER_HEADERS };
  const cookieHeader = buildCookieHeader(cookieJar);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (method === "post") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await axios({
    url,
    method,
    data: body,
    headers,
    timeout: 30000,
  });

  updateCookieJar(cookieJar, response);
  return response.data;
}

function extractFormState(html, fallbackUrl) {
  const $ = cheerio.load(html);
  const form = $("form#_f");
  const fields = {};

  form.find("input[name], select[name], textarea[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) {
      return;
    }

    const tagName = element.tagName?.toLowerCase();
    if (tagName === "input") {
      const type = ($(element).attr("type") || "text").toLowerCase();
      if ((type === "checkbox" || type === "radio") && !$(element).attr("checked")) {
        return;
      }

      fields[name] = $(element).attr("value") || "";
      return;
    }

    if (tagName === "select") {
      const selected = $(element).find("option[selected]").first();
      if (selected.length) {
        fields[name] = selected.attr("value") ?? selected.text();
        return;
      }

      const firstOption = $(element).find("option").first();
      fields[name] = firstOption.attr("value") ?? firstOption.text() ?? "";
      return;
    }

    fields[name] = $(element).text() || "";
  });

  return {
    actionUrl: new URL(form.attr("action") || fallbackUrl, fallbackUrl).toString(),
    fields,
  };
}

async function fetchVotingPagesForPolitician({ cisObdobia, cisSchodze, poslanecMasterId }) {
  const cookieJar = new Map();
  const sourceUrl = buildVotingUrl(cisObdobia, cisSchodze, poslanecMasterId);
  let currentHtml = await requestHtml({ url: sourceUrl, cookieJar });
  const pages = [];
  let pageNumber = 1;

  while (true) {
    const parsed = parseVotingResultsHtml({
      html: currentHtml,
      sourceUrl,
      cisObdobia,
      cisSchodze,
      poslanecMasterId,
      pageNumber,
    });

    if (!parsed || !parsed.politicianName) {
      return pages.length > 0
        ? {
            politicianName: pages[0].politicianName,
            pages,
            summary: pages[0].summary,
          }
        : null;
    }

    pages.push(parsed);

    const nextPageTarget = parsed.pager.find((item) => item.pageNumber === pageNumber + 1);
    if (!nextPageTarget) {
      break;
    }

    const formState = extractFormState(currentHtml, sourceUrl);
    formState.fields.__EVENTTARGET = nextPageTarget.eventTarget;
    formState.fields.__EVENTARGUMENT = nextPageTarget.eventArgument;

    currentHtml = await requestHtml({
      url: formState.actionUrl,
      method: "post",
      body: new URLSearchParams(formState.fields).toString(),
      cookieJar,
    });

    pageNumber += 1;
  }

  return {
    politicianName: pages[0]?.politicianName || null,
    pages,
    summary: pages[0]?.summary || null,
  };
}

async function buildTargetContexts() {
  const targets = getScraperWriteTargets();
  const contexts = [];

  for (const target of targets) {
    const politicians = await listPoliticiansForMatching(target.pool);
    const lookup = buildPoliticianLookup(politicians);
    contexts.push({
      name: target.name,
      pool: target.pool,
      matches: lookup.matches,
      ambiguousKeys: lookup.ambiguousKeys,
    });
  }

  return contexts;
}

export async function runVotingScrape({ maxPoliticianMasterId, cisObdobia, cisSchodze } = {}) {
  const effectiveMaxPoliticianMasterId = Number.isFinite(maxPoliticianMasterId)
    ? maxPoliticianMasterId
    : config.votingScraperMaxPoliticianMasterId;
  const effectiveCisObdobia = Number.isFinite(cisObdobia)
    ? cisObdobia
    : config.votingScraperCisObdobia;
  const effectiveCisSchodze = Number.isFinite(cisSchodze)
    ? cisSchodze
    : config.votingScraperCisSchodze;
  const targetContexts = await buildTargetContexts();
  const seenNames = new Set();
  let consecutiveMissing = 0;
  let consecutiveRepeatedNames = 0;

  const result = {
    targets: targetContexts.map((target) => target.name),
    cisObdobia: effectiveCisObdobia,
    cisSchodze: effectiveCisSchodze,
    attempted: 0,
    discovered: 0,
    saved: 0,
    transcriptsSaved: 0,
    unmatched: 0,
    errors: [],
    byTarget: Object.fromEntries(targetContexts.map((target) => [target.name, {
      statsSaved: 0,
      transcriptsSaved: 0,
      unmatched: 0,
    }])),
  };

  for (let poslanecMasterId = 1; poslanecMasterId <= effectiveMaxPoliticianMasterId; poslanecMasterId += 1) {
    result.attempted += 1;

    try {
      const scraped = await fetchVotingPagesForPolitician({
        cisObdobia: effectiveCisObdobia,
        cisSchodze: effectiveCisSchodze,
        poslanecMasterId,
      });

      if (!scraped || !scraped.politicianName || scraped.pages.length === 0) {
        consecutiveMissing += 1;
        if (consecutiveMissing >= config.votingScraperConsecutiveMissThreshold) {
          break;
        }

        if (config.scraperDelayMs > 0) {
          await sleep(config.scraperDelayMs);
        }
        continue;
      }

      consecutiveMissing = 0;
      const normalizedName = normalizeName(scraped.politicianName);
      if (seenNames.has(normalizedName)) {
        consecutiveRepeatedNames += 1;
        if (consecutiveRepeatedNames >= config.votingScraperRepeatThreshold) {
          break;
        }

        if (config.scraperDelayMs > 0) {
          await sleep(config.scraperDelayMs);
        }
        continue;
      }

      seenNames.add(normalizedName);
      consecutiveRepeatedNames = 0;
      result.discovered += 1;
      const rows = scraped.pages.flatMap((page) => page.rows);
      const transcriptText = buildTranscriptText(rows);
      const rawPages = buildRawPagesPayload(scraped.pages);

      for (const target of targetContexts) {
        try {
          const match = matchPolitician(target, scraped.politicianName);
          if (!match) {
            result.unmatched += 1;
            result.byTarget[target.name].unmatched += 1;
          }

          if (match && scraped.summary) {
            await savePoliticianVotingStats(
              {
                politicianId: match.id,
                cisObdobia: scraped.summary.cisObdobia,
                poslanecMasterId: scraped.summary.poslanecMasterId,
                sourcePoliticianName: scraped.summary.politicianName,
                zaCount: scraped.summary.zaCount,
                protiCount: scraped.summary.protiCount,
                zdrzalSaCount: scraped.summary.zdrzalSaCount,
                nehlasovalCount: scraped.summary.nehlasovalCount,
                nepritomnyCount: scraped.summary.nepritomnyCount,
                neplatnychHlasovCount: scraped.summary.neplatnychHlasovCount,
                sourceUrl: scraped.summary.sourceUrl,
              },
              target.pool,
            );

            result.saved += 1;
            result.byTarget[target.name].statsSaved += 1;
          }

          await savePoliticianVotingTranscript(
            {
              politicianId: match?.id ?? null,
              cisObdobia: effectiveCisObdobia,
              cisSchodze: effectiveCisSchodze,
              poslanecMasterId,
              sourcePoliticianName: scraped.politicianName,
              sourceUrl: scraped.pages[0]?.sourceUrl || buildVotingUrl(effectiveCisObdobia, effectiveCisSchodze, poslanecMasterId),
              pageCount: scraped.pages.length,
              recordCount: rows.length,
              zaCount: scraped.summary?.zaCount || 0,
              protiCount: scraped.summary?.protiCount || 0,
              zdrzalSaCount: scraped.summary?.zdrzalSaCount || 0,
              nehlasovalCount: scraped.summary?.nehlasovalCount || 0,
              nepritomnyCount: scraped.summary?.nepritomnyCount || 0,
              neplatnychHlasovCount: scraped.summary?.neplatnychHlasovCount || 0,
              transcriptText,
              transcriptRecords: rows,
              rawPages,
            },
            target.pool,
          );

          result.transcriptsSaved += 1;
          result.byTarget[target.name].transcriptsSaved += 1;
        } catch (error) {
          if (result.errors.length < 100) {
            result.errors.push({
              cisObdobia: effectiveCisObdobia,
              cisSchodze: effectiveCisSchodze,
              poslanecMasterId,
              target: target.name,
              message: error.message,
            });
          }
        }
      }
    } catch (error) {
      if (result.errors.length < 100) {
        result.errors.push({
          cisObdobia: effectiveCisObdobia,
          cisSchodze: effectiveCisSchodze,
          poslanecMasterId,
          message: error.message,
        });
      }
    }

    if (config.scraperDelayMs > 0) {
      await sleep(config.scraperDelayMs);
    }
  }

  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const maxPoliticianMasterIdArg = Number(process.argv[2]);
  const cisObdobiaArg = Number(process.argv[3]);
  const cisSchodzeArg = Number(process.argv[4]);

  runVotingScrape({
    maxPoliticianMasterId: Number.isFinite(maxPoliticianMasterIdArg) ? maxPoliticianMasterIdArg : undefined,
    cisObdobia: Number.isFinite(cisObdobiaArg) ? cisObdobiaArg : undefined,
    cisSchodze: Number.isFinite(cisSchodzeArg) ? cisSchodzeArg : undefined,
  })
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