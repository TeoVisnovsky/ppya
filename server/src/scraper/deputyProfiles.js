export const SCRAPER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

export async function fetchDeputyList() {
  return [];
}

export async function fetchDeputyProfile(id) {
  return null;
}

export async function fetchDeputyMandateChanges(id) {
  return [];
}

export function buildDeputyMandateChangesLookup(changes) {
  return new Map();
}
