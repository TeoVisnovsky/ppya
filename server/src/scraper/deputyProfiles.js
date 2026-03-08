import axios from "axios";
import * as cheerio from "cheerio";
import {
  buildTermInfoFromMandateChanges,
  parseDeputyChangesHtml,
  parseDeputyProfileHtml,
} from "./parser.js";

export const DEPUTIES_URL = "https://www.nrsr.sk/web/Default.aspx?sid=poslanci/zoznam_abc";
const CHANGES_URL = "https://www.nrsr.sk/web/?sid=poslanci/zmeny";
const PROFILE_URL = "https://www.nrsr.sk/web/Default.aspx?sid=poslanci/poslanec";

export const SCRAPER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function toAbsoluteUrl(href) {
  return new URL(href, "https://www.nrsr.sk").toString();
}

function buildDeputyProfileUrl(poslanecId, cisObdobia) {
  const url = new URL(PROFILE_URL);
  url.searchParams.set("PoslanecID", String(poslanecId));
  if (Number.isFinite(Number(cisObdobia))) {
    url.searchParams.set("CisObdobia", String(cisObdobia));
  }

  return url.toString();
}

function buildChangesUrl(cisObdobia) {
  const url = new URL(CHANGES_URL);
  if (Number.isFinite(Number(cisObdobia))) {
    url.searchParams.set("CisObdobia", String(cisObdobia));
  }

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

function isDeputyProfileErrorHtml(html) {
  return /Neočakávaná chyba|Unexpected error/i.test(String(html || ""));
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

export async function fetchDeputyList() {
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

export async function fetchDeputyMandateChanges(cisObdobia) {
  const cookieJar = new Map();
  const sourceUrl = buildChangesUrl(cisObdobia);
  let currentHtml = await requestHtml({ url: sourceUrl, cookieJar });
  let pageNumber = 1;
  const rows = [];

  while (true) {
    const parsed = parseDeputyChangesHtml({
      html: currentHtml,
      sourceUrl,
      pageNumber,
    });

    if (!parsed) {
      break;
    }

    rows.push(...parsed.rows);

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

  return rows;
}

export function buildDeputyMandateChangesLookup(rows) {
  const lookup = new Map();

  for (const row of rows) {
    if (!Number.isFinite(Number(row.poslanecId))) {
      continue;
    }

    const key = `${row.poslanecId}:${row.cisObdobia || "na"}`;
    const existing = lookup.get(key) || [];
    existing.push(row);
    lookup.set(key, existing);
  }

  return lookup;
}

export async function fetchDeputySummaryById(poslanecId, cisObdobia) {
  const profileUrl = buildDeputyProfileUrl(poslanecId, cisObdobia);
  const response = await axios.get(profileUrl, { timeout: 30000, headers: SCRAPER_HEADERS });

  if (isDeputyProfileErrorHtml(response.data)) {
    return null;
  }

  const profile = parseDeputyProfileHtml({
    html: response.data,
    sourceUrl: profileUrl,
    poslanecId,
    cisObdobia,
  });

  if (!profile?.fullName) {
    return null;
  }

  return {
    id: poslanecId,
    name: profile.fullName,
    full_name: profile.fullName,
    poslanecId,
    cisObdobia,
    profileUrl,
  };
}

export async function fetchDeputyProfile(deputy, mandateChangesLookup = new Map()) {
  const response = await axios.get(deputy.profileUrl, { timeout: 30000, headers: SCRAPER_HEADERS });
  const profile = parseDeputyProfileHtml({
    html: response.data,
    sourceUrl: deputy.profileUrl,
    poslanecId: deputy.poslanecId,
    cisObdobia: deputy.cisObdobia,
  });

  const mandateChanges = mandateChangesLookup.get(`${deputy.poslanecId}:${deputy.cisObdobia || "na"}`) || [];
  const nextProfile = {
    ...profile,
    termInfo: buildTermInfoFromMandateChanges(profile.termInfo, mandateChanges),
  };

  if (!nextProfile.photoUrl) {
    return nextProfile;
  }

  try {
    const photoResponse = await axios.get(nextProfile.photoUrl, {
      timeout: 30000,
      headers: SCRAPER_HEADERS,
      responseType: "arraybuffer",
    });

    return {
      ...nextProfile,
      photoContentType: photoResponse.headers["content-type"] || null,
      photoData: Buffer.from(photoResponse.data),
    };
  } catch {
    return nextProfile;
  }
}