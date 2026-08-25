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
| `SUPABASE_URL` | Same value as the Android app's `.env` | ❌ Games, via IGDB proxy |
| `SUPABASE_ANON_KEY` | Same value as the Android app's `.env` (public/RLS-protected key) | ❌ Games, via IGDB proxy |
| `BETASERIES_API_KEY` | BetaSeries Dev | ❌ Dramas |
| `BETASERIES_TOKEN` | BetaSeries Dev | ❌ (not currently used — `/planning/upcoming` only needs the API key) |
| `OPENAI_API_KEY` | OpenAI Platform | ❌ (AI blurbs — not wired in yet, falls back to the source's own overview text) |
| `ANTHROPIC_API_KEY` | Anthropic Console | ❌ (AI blurbs — not wired in yet, falls back to the source's own overview text) |

`IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` are no longer read by `build.js` — games go through the Supabase proxy (`SUPABASE_URL`/`SUPABASE_ANON_KEY` above), the same path the Android app uses, instead of talking to IGDB/Twitch directly.

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
3. Add to `categories` object for injection — the key must match a `data-catkey` on a `.cat-grid` in
   `index.html` (currently: `movie`, `series`, `anime`, `game`, `drama`) or the items have nowhere to land
4. Add CSS for any new card types

`manga`/`manhwa`/`manhua`/`webtoon` have bento tiles in the categories section but no "à venir" strip —
there's no daily-upcoming data source wired up for them yet (Jikan covers manga upcoming volumes in the
Android app; manhwa/manhua/webtoon would need their own source). Add a `.cat-strip`/`.cat-grid` for them
in `site-source/gen.js` once a fetcher exists.

## Editing the design

`index.html` is generated, not hand-edited — content and layout live in `site-source/`:
- `site-source/gen.js` — copy (FR/EN/NL) and HTML structure. Regenerate with `node site-source/gen.js`
  from the repo root (overwrites `index.html`'s static content; run `tsugi-legal-build/build.js`
  afterward to re-inject the dynamic cards).
- `site-source/style.css` — the whole visual design (one shared stylesheet, not duplicated per language).

The CSS radio-button i18n mechanism (`#lang-{x}:checked ~ main .lang-panel-{x} { display: ... }`) hides/shows
per language via `!important` + equal specificity — any element that's both `.lang-panel-*` and needs a
non-`block`/`flex` display (the hero's `display: grid`, for instance) must set that display value through
a `#lang-{x}:checked ~ ...` rule, never as a plain `.some-class { display: ... !important }`, or it silently
wins over the hide rule by coming later in the file and all three languages render stacked at once.

## GitHub Pages

The site is served from `index.html` at the repo root.
GitHub Pages config: **Deploy from branch `main` / root**.

## Architecture Notes

- **Static-first**: Base HTML is hand-crafted, dynamic content injected
- **No runtime JS**: Pure HTML/CSS, fast, SEO-friendly
- **i18n**: FR/EN/NL via CSS radio-button technique (no JS)
- **Responsive**: Mobile-first, works without JS
