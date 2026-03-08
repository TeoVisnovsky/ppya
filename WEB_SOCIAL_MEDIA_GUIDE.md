# Social Media Profile Finder - Web Scraping Approach

This system searches **X (Twitter)**, **Facebook**, and **Instagram** for politician profiles and stores the first found result in the database.

## How It Works

1. **Searches by politician name** on each social media platform
2. **Clicks the first profile** from search results
3. **Extracts the profile username/ID** 
4. **Stores in database** for future reference

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

This will install Playwright (browser automation) which the scraper uses.

### 2. Apply Database Migration

Make sure the migration has been applied:

```bash
npm run migrate
```

This adds `instagram`, `facebook`, `twitter` columns to the `politicians` table.

### 3. Verify Environment (Optional)

You can control browser headless mode in `.env`:

```env
# Optional: Set to 'true' to see the browser automation in action
PLAYWRIGHT_HEADLESS=false
```

## Usage

### Run Social Media Search

**Search first 10 politicians:**
```bash
npm run scrape:social
```

**Search first N politicians:**
```bash
node src/scraper/webSocialMediaSync.js 50
```

### Example Output

```
============================================================
📱 Starting social media web search for up to 10 politicians...
============================================================

Found 10 politicians needing social media updates

[1/10] Processing: John Doe
────────────────────────────────────────────────────────────
🎯 Searching for politician: "John Doe"

🔍 Searching X for: "John Doe"
✓ Found X profile: @johndoe_politician

🔍 Searching Facebook for: "John Doe"
✓ Found Facebook profile: john.doe.123456

🔍 Searching Instagram for: "John Doe"
✓ Found Instagram profile: @johndoe_pol

📌 Stored profiles:
   • Twitter/X: @johndoe_politician
   • Facebook: john.doe.123456
   • Instagram: @johndoe_pol

⏳ Waiting 3 seconds before next search...
```

## Database Schema

Added columns to `politicians` table:

| Column | Type | Description |
|--------|------|-------------|
| `instagram` | TEXT | Instagram username |
| `facebook` | TEXT | Facebook ID or username |
| `twitter` | TEXT | X (Twitter) username |
| `social_media_searched_at` | TIMESTAMPTZ | When search was last performed |

## API Functions

### In Your Code

```javascript
import { WebSocialMediaSync } from "./scraper/webSocialMediaSync.js";

const sync = new WebSocialMediaSync();

// Search 50 politicians
const result = await sync.syncBatch(50);

// Display stats
sync.displayStats();
// Output:
// 📊 ============================================================ 📊
// Sync Statistics:
//   • Processed: 50
//   • Updated:   45
//   • Failed:    2
//   • Skipped:   3
// 📊 ============================================================ 📊
```

### Database Functions

```javascript
import {
  getPoliticianSocialMedia,
  listAllPoliticiansSocialMedia,
} from "./db/repositories.js";

// Get one politician's accounts
const politician = await getPoliticianSocialMedia(1);
// Returns: { id, full_name, instagram, facebook, twitter, social_media_searched_at }

// Get all politicians with their accounts
const all = await listAllPoliticiansSocialMedia();
```

## URL Formats

After data is stored, you can construct URLs:

```javascript
const politician = await getPoliticianSocialMedia(1);

if (politician.twitter) {
  console.log(`X: https://x.com/${politician.twitter}`);
}
if (politician.facebook) {
  console.log(`Facebook: https://facebook.com/${politician.facebook}`);
}
if (politician.instagram) {
  console.log(`Instagram: https://instagram.com/${politician.instagram}`);
}
```

## Important Notes

⚠️ **Search Delays**: The system waits 3 seconds between each search to:
- Avoid overwhelming social media servers
- Prevent rate limiting
- Allow browser pages to fully load

⚠️ **First Result Only**: The scraper takes the first profile from search results. For common names, this **may not always be accurate**. Review results manually for important politicians.

⚠️ **Search Failures**: Some searches may fail due to:
- Network issues
- Page load timeouts
- Changes in website structure
- Blocked country access

⚠️ **Missing Accounts**: Not all politicians have social media accounts. Empty fields (NULL) mean no profile was found.

## Troubleshooting

### "Module not found: playwright"
```bash
cd server
npm install
```

### Searches are very slow
This is normal - the browser needs time to load pages. Each politician takes 20-30 seconds.

### No profiles found
- Check internet connection
- Try running with `PLAYWRIGHT_HEADLESS=false` to see what's happening
- Manually verify politicians have public profiles

### "Timeout waiting for selector"
The website structure may have changed. Website selectors may need updating.

## See Also

- [Social Media Integration Documentation](../SOCIAL_MEDIA_INTEGRATION.md) - API-based approach (not currently in use)
- [Database Schema](../database/migrations/007_politician_social_media.sql)
