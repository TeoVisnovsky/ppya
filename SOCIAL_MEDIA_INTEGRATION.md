# Social Media Integration for Politicians

This module enables searching for and storing social media accounts (Instagram, Facebook, Twitter) for politicians in the database.

## Database Schema Changes

A new migration (`007_politician_social_media.sql`) adds three columns to the `politicians` table:

- `instagram` (TEXT) - Instagram username/handle
- `facebook` (TEXT) - Facebook user ID or page ID
- `twitter` (TEXT) - Twitter username/handle
- `social_media_searched_at` (TIMESTAMPTZ) - Timestamp of when the social media search was last performed

## Components

### 1. Social Media Searcher (`socialMediaSearcher.js`)

Searches for politician accounts on Instagram, Facebook, and Twitter.

**Features:**
- Searches each platform independently
- Uses name similarity matching to find the most likely account
- Returns top 5 matches per platform sorted by relevance
- Calculates similarity scores based on name matching

**Usage:**
```javascript
import { SocialMediaSearcher } from "./scraper/socialMediaSearcher.js";

const searcher = new SocialMediaSearcher();

// Search individual platforms
const instagramResults = await searcher.searchInstagram("John Doe");
const twitterResults = await searcher.searchTwitter("John Doe", twitterBearerToken);
const facebookResults = await searcher.searchFacebook("John Doe", facebookAccessToken);

// Or search all platforms at once
const allResults = await searcher.searchAllPlatforms("John Doe", {
  twitter: twitterBearerToken,
  facebook: facebookAccessToken,
});

// Get the best match for each platform
const bestMatches = await searcher.findBestMatches("John Doe", {
  twitter: twitterBearerToken,
  facebook: facebookAccessToken,
});
```

### 2. Social Media Sync (`socialMediaSync.js`)

Orchestrates searching and storing social media accounts in the database.

**Features:**
- Syncs multiple politicians in batches
- Automatically rates limits searches (1 second delay between politicians)
- Tracks statistics (processed, updated, failed, skipped)
- Can sync all politicians or only those missing data

**Usage:**

```javascript
import { SocialMediaSync } from "./scraper/socialMediaSync.js";

const sync = new SocialMediaSync();

// Sync first 100 politicians
const result = await sync.syncBatch(100, {
  twitter: process.env.TWITTER_BEARER_TOKEN,
  facebook: process.env.FACEBOOK_ACCESS_TOKEN,
});

console.log(result.stats);
```

### 3. Database Functions (`repositories.js`)

New export functions for social media data management:

#### `updatePoliticianSocialMedia(politicianId, socialMediaData, dbPool)`

Updates a politician's social media accounts.

```javascript
await updatePoliticianSocialMedia(1, {
  instagram: "john.doe.politician",
  facebook: "123456789",
  twitter: "johndoepolitician",
});
```

#### `getPoliticianSocialMedia(politicianId, dbPool)`

Retrieves a politician's social media data.

```javascript
const data = await getPoliticianSocialMedia(1);
// Returns: { id, full_name, instagram, facebook, twitter, social_media_searched_at }
```

#### `listPoliticiansWithoutSocialMedia(limit, dbPool)`

Gets politicians missing social media data (for batch processing).

```javascript
const politicians = await listPoliticiansWithoutSocialMedia(50);
```

#### `listAllPoliticiansSocialMedia(dbPool)`

Gets all politicians with their social media accounts.

```javascript
const allData = await listAllPoliticiansSocialMedia();
```

## Setup Instructions

### 1. Apply Database Migration

Run the migration to add social media columns:

```bash
# Using your migration tool
npm run migrate
```

Or manually execute:

```sql
psql -d your_database -f database/migrations/007_politician_social_media.sql
```

### 2. Set Up API Credentials (Optional)

For full functionality, obtain API tokens:

**Twitter API v2:**
- Visit: https://developer.twitter.com/en/portal/dashboard
- Create a project and get your Bearer Token
- Set environment variable: `TWITTER_BEARER_TOKEN`

**Facebook Graph API:**
- Visit: https://developers.facebook.com/
- Create an app and get your Access Token
- Set environment variable: `FACEBOOK_ACCESS_TOKEN`

Add to `.env`:

```
TWITTER_BEARER_TOKEN=your_token_here
FACEBOOK_ACCESS_TOKEN=your_token_here
```

### 3. Run Social Media Sync

**Option A: Automated batch sync**

```bash
node server/src/scraper/socialMediaSync.js
```

This will sync the first 10 politicians and display statistics.

**Option B: Custom node script**

```javascript
import { SocialMediaSync } from "./scraper/socialMediaSync.js";

const sync = new SocialMediaSync();

await sync.syncBatch(50, {
  twitter: process.env.TWITTER_BEARER_TOKEN,
  facebook: process.env.FACEBOOK_ACCESS_TOKEN,
});

sync.displayStats();
```

## API Limitations & Notes

### Instagram
- Uses web search endpoints (no official API for this)
- May require additional headers/authentication
- Results sorted by popularity/verification status

### Twitter
- Requires Twitter API v2 Bearer Token
- Limited to authenticated requests
- Searches tweets mentioning the name

### Facebook
- Requires Facebook Graph API access token
- Limited search functionality in standard API
- User search may have privacy restrictions

## Example Workflow

```javascript
import { SocialMediaSync } from "./scraper/socialMediaSync.js";
import { getPoliticianSocialMedia } from "./db/repositories.js";

const sync = new SocialMediaSync();

// 1. Sync 100 politicians
await sync.syncBatch(100);

// 2. Get data for a specific politician
const politicianData = await getPoliticianSocialMedia(42);
console.log(`Instagram: @${politicianData.instagram}`);
console.log(`Facebook: https://facebook.com/${politicianData.facebook}`);
console.log(`Twitter: @${politicianData.twitter}`);

// 3. Display stats
sync.displayStats();
```

## Troubleshooting

### No Results Found
- Verify politician name is spelled correctly
- Try searching with partial names or nicknames
- Some politicians may not have public social media accounts

### API Errors
- Check API tokens are valid and have appropriate permissions
- Verify rate limits haven't been exceeded
- Check network connectivity

### Database Errors
- Ensure migration has been applied
- Verify politician IDs exist in database
- Check database connection configuration

## Future Enhancements

- [ ] Add LinkedIn profile support
- [ ] Implement manual verification UI
- [ ] Store confidence scores for matches
- [ ] Add profile image URLs
- [ ] Track search history for auditing
- [ ] Implement webhook for real-time updates
