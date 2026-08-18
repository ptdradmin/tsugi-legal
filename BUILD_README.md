# tsugi-legal — Living Landing Page Build System

This repo hosts the **legal/landing page** for the Tsugi Android app (app.tsugi.android).
The page is **rebuilt daily** via GitHub Actions to show real upcoming releases from:
- **TMDB** — Movies & Series (cinema + streaming)
- **AniList** — Anime (NOT_YET_RELEASED, 30+ days ahead)
- **IGDB** — Video Games (via Supabase proxy)
- **BetaSeries** — Dramas & Series

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Action (daily 06:00 UTC)                            │
│    └─> Checkout repo                                        │
│    └─> Setup Node.js + install deps                         │
│    └─> Run build.js (fetches APIs, injects into index.html) │
│    └─> If index.html changed → commit + push                │
│    └─> GitHub Pages auto-deploys                            │
└─────────────────────────────────────────────────────────────┘
```

## Required GitHub Secrets

| Secret | Source | Required |
|--------|--------|----------|
| `TMDB_API_KEY` | TMDB Developer Settings | ✅ Movies/Series |
| `ANILIST_CLIENT_ID` | AniList API Settings | ❌ (public works) |
| `ANILIST_CLIENT_SECRET` | AniList API Settings | ❌ |
| `IGDB_CLIENT_ID` | IGDB/Twitch Dev Console | ❌ (via Supabase) |
| `IGDB_CLIENT_SECRET` | IGDB/Twitch Dev Console | ❌ |
| `BETASERIES_API_KEY` | BetaSeries Dev | ❌ |
| `BETASERIES_TOKEN` | BetaSeries Dev | ❌ |
| `OPENAI_API_KEY` | OpenAI Platform | ❌ (AI blurbs) |
| `ANTHROPIC_API_KEY` | Anthropic Console | ❌ (AI blurbs) |

## Local Development

```bash
cd tsugi-legal-build
npm install
TMDB_API_KEY=your_key node build.js
```

## Customization

- **Categories shown**: Edit `LIMIT_PER_CATEGORY` in `build.js`
- **Days ahead filter**: Edit `DAYS_AHEAD` (default 30 = matches Calendar window)
- **Styling**: Dynamic cards use `.cat-card.dynamic` class
- **AI descriptions**: Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for generated blurbs

## Adding New Data Sources

1. Add fetch function in `build.js`
2. Add to `Promise.all` in `main()`
3. Add to `categories` object for injection
4. Add CSS for any new card types

## GitHub Pages

The site is served from `index.html` at the repo root.
GitHub Pages config: **Deploy from branch `main` / root**.

## Architecture Notes

- **Static-first**: Base HTML is hand-crafted, dynamic content injected
- **No runtime JS**: Pure HTML/CSS, fast, SEO-friendly
- **i18n**: FR/EN/NL via CSS radio-button technique (no JS)
- **Responsive**: Mobile-first, works without JS
