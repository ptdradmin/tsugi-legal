#!/usr/bin/env node
/**
 * Build script for tsugi-legal landing page
 * Fetches real upcoming releases from APIs and injects into index.html
 * Runs daily via GitHub Actions
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// ========== CONFIGURATION ==========
// Secrets pasted into GitHub with a trailing newline/space broke the IGDB call ("Invalid character
// in header content") — every value is trimmed so that can't happen again.
const env = (name) => process.env[name]?.trim() || undefined;
const CONFIG = {
  // API Keys (set via GitHub Secrets)
  TMDB_API_KEY: env('TMDB_API_KEY'),
  ANILIST_CLIENT_ID: env('ANILIST_CLIENT_ID'),
  ANILIST_CLIENT_SECRET: env('ANILIST_CLIENT_SECRET'),
  IGDB_CLIENT_ID: env('IGDB_CLIENT_ID'),
  IGDB_CLIENT_SECRET: env('IGDB_CLIENT_SECRET'),
  BETASERIES_API_KEY: env('BETASERIES_API_KEY'),
  BETASERIES_TOKEN: env('BETASERIES_TOKEN'),
  // Same Supabase project the Android app uses, for the IGDB proxy (games have no free direct API).
  // SUPABASE_ANON_KEY is the public/RLS-protected key — same one already shipped inside the app's
  // compiled APK — but it's read from env like every other credential here, not hardcoded.
  SUPABASE_URL: env('SUPABASE_URL'),
  SUPABASE_ANON_KEY: env('SUPABASE_ANON_KEY')?.replace(/[^A-Za-z0-9._-]/g, ''),
  // Optional: AI for descriptions
  OPENAI_API_KEY: env('OPENAI_API_KEY'),
  ANTHROPIC_API_KEY: env('ANTHROPIC_API_KEY'),
  
  // Filters
  DAYS_AHEAD: 30, // Calendar covers 30 days, Feed shows 30+ days
  LIMIT_PER_CATEGORY: 4, // How many items to show per category on landing page
  FULL_LIMIT: 50, // How many items each category's "Voir plus" page lists (paginated client-side)
  
  // Paths
  TEMPLATE_PATH: path.resolve('../index.html'),
  OUTPUT_PATH: path.resolve('../index.html'),
  DATA_DIR: path.resolve('../data'),
};

// ========== UTILITIES ==========
// TMDB discover returns 20 results per page — concatenates pages 1..n of the same query.
async function tmdbResults(url, pages) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const data = await (await fetch(url.replace('&page=1&', `&page=${p}&`))).json();
    all.push(...(data.results || []));
    if (p >= (data.total_pages || 1)) break;
  }
  return all;
}

function log(stage, msg) {
  const time = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${time}] [${stage}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== API CLIENTS ==========

// TMDB
// Films: what matters is when it reaches cinemas HERE, not its first release anywhere — a Korean
// film out in July in Seoul only lands in Belgian/French theatres in October. Candidates are films
// with a BE or FR theatrical release, minus old re-releases; each one's displayed date is its
// earliest BE/FR theatrical date (TMDB release_dates), and the 30-day rule is applied to that date.
const LOCAL_REGIONS = ['BE', 'FR'];
// Countries shown in the detail page's "release by continent" table (fiche.html groups them).
const WORLD_COUNTRIES = ['BE', 'FR', 'NL', 'GB', 'DE', 'ES', 'IT', 'US', 'CA', 'MX', 'BR', 'AR', 'KR', 'JP', 'CN', 'IN', 'TH', 'AU', 'NZ', 'ZA', 'MA', 'NG', 'AE'];

// TMDB notes are free text ("On Youtube", "Subtitled Version", a channel name...): keep only real
// platforms, normalized; anything else falls back to the subscription-provider lookup.
const PLATFORMS = [
  [/netflix/i, 'Netflix'], [/prime|amazon/i, 'Prime Video'], [/disney/i, 'Disney+'], [/apple/i, 'Apple TV'],
  [/canal/i, 'Canal+'], [/arte/i, 'Arte.tv'], [/france\.?tv|france t[ée]l/i, 'France.tv'], [/m6/i, 'M6+'], [/tf1/i, 'TF1+'],
  [/tv5/i, 'TV5+'], [/crunchyroll/i, 'Crunchyroll'], [/\bmax\b|hbo/i, 'Max'], [/paramount/i, 'Paramount+'],
  [/mubi/i, 'MUBI'], [/youtube/i, 'YouTube'], [/vrt/i, 'VRT MAX'], [/auvio|rtbf/i, 'RTBF Auvio'], [/streamz/i, 'Streamz'],
  [/goplay/i, 'GoPlay'], [/pickx|proximus/i, 'Pickx'], [/sky/i, 'SkyShowtime'], [/universcin/i, 'UniversCiné'],
];
function platformName(note) {
  const hit = PLATFORMS.find(([re]) => re.test(note || ''));
  return hit ? hit[1] : null;
}

// Fallback when the digital release has no note: the BE (else FR) subscription platform.
async function subscriptionPlatform(id) {
  try {
    const r = (await (await fetch(`https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${CONFIG.TMDB_API_KEY}`)).json()).results || {};
    for (const c of LOCAL_REGIONS) if (r[c]?.flatrate?.length) return r[c].flatrate[0].provider_name;
  } catch (e) {}
  return null;
}

// First BE/FR release, in cinemas (TMDB types 2 limited / 3 theatrical) or on streaming (4 digital),
// plus each listed country's first release for the detail page.
async function localRelease(id, types = [2, 3, 4], fromDate = null) {
  try {
    const data = await (await fetch(`https://api.themoviedb.org/3/movie/${id}/release_dates?api_key=${CONFIG.TMDB_API_KEY}`)).json();
    const firstOf = (countries) => (data.results || []).filter(c => countries.includes(c.iso_3166_1))
      .flatMap(c => (c.release_dates || []).map(d => ({ ...d, country: c.iso_3166_1 })))
      .filter(d => types.includes(d.type) && d.release_date && (!fromDate || d.release_date.slice(0, 10) >= fromDate))
      // "Streaming" alone says nothing: TMDB's note on a digital release names the platform ("Netflix").
      .map(d => ({ country: d.country, date: d.release_date.slice(0, 10), kind: d.type === 4 ? 'streaming' : 'cinema', platform: d.type === 4 ? platformName(d.note) : null }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const local = firstOf(LOCAL_REGIONS)[0];
    // The world table always shows every release kind, whatever filter picked the local date.
    if (types.length < 3 || fromDate) { types = [2, 3, 4]; fromDate = null; }
    if (!local) return null;
    if (local.kind === 'streaming' && !local.platform) local.platform = await subscriptionPlatform(id);
    const world = [];
    for (const r of firstOf(WORLD_COUNTRIES)) if (!world.some(w => w.country === r.country)) world.push(r);
    return { ...local, world };
  } catch (e) { return null; }
}

async function fetchTMDBUpcomingMovies() {
  if (!CONFIG.TMDB_API_KEY) return [];
  try {
    const seen = new Set();
    const candidates = [];
    for (const region of LOCAL_REGIONS) {
      const url = `https://api.themoviedb.org/3/discover/movie?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&region=${region}&with_release_type=2|3|4&sort_by=popularity.desc&include_adult=false&include_video=false&page=1&release_date.gte=${getDateOffset(0)}&release_date.lte=${getDateOffset(365)}&primary_release_date.gte=${getDateOffset(-730)}`;
      for (const m of await tmdbResults(url, 5)) if (!seen.has(m.id)) { seen.add(m.id); candidates.push(m); }
    }
    candidates.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    const minLocal = getDateOffset(CONFIG.DAYS_AHEAD);
    const out = [];
    for (let k = 0; k < candidates.length && out.length < CONFIG.FULL_LIMIT; k += 10) {
      const batch = candidates.slice(k, k + 10);
      const releases = await Promise.all(batch.map(m => localRelease(m.id)));
      batch.forEach((m, n) => {
        const local = releases[n];
        // Already out in BE/FR (cinema or streaming) or within the calendar window: not "upcoming".
        if (!local || local.date < minLocal || out.length >= CONFIG.FULL_LIMIT) return;
        out.push({
          type: 'movie',
          title: m.title,
          original_title: m.original_title,
          release_date: local.date,
          releaseKind: local.kind,
          platform: local.platform,
          world: local.world,
          overview: m.overview,
          poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
          genre_ids: m.genre_ids,
          vote_average: m.vote_average,
          id: m.id,
        });
      });
    }
    return out;
  } catch (e) {
    log('TMDB-Movies', `Error: ${e.message}`);
    return [];
  }
}

const ASIAN_LANGS = ['ko', 'ja', 'zh', 'cn'];

// Dramas: TMDB Korean/Japanese/Chinese live-action series, same source as the app's Dramas tab
// (BetaSeries' planning/upcoming endpoint is dead — it answers "No entry ..." as plain text).
async function fetchTMDBDramas() {
  if (!CONFIG.TMDB_API_KEY) return [];
  const langs = 'ko|ja|zh';
  // Dramas = Korean/Japanese/Chinese live action, series AND films (animation belongs to Anime).
  const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&sort_by=popularity.desc&include_adult=false&page=1&first_air_date.gte=${getDateOffset(CONFIG.DAYS_AHEAD)}&first_air_date.lte=${getDateOffset(730)}&with_original_language=${langs}&without_genres=16,10763,10764,10766,10767`;
  // Most of these films never reach BE/FR cinemas: the date shown is the release in their own country.
  const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&sort_by=popularity.desc&include_adult=false&include_video=false&page=1&primary_release_date.gte=${getDateOffset(CONFIG.DAYS_AHEAD)}&primary_release_date.lte=${getDateOffset(730)}&with_original_language=${langs}&without_genres=16,99,10402`;  // no animation, documentaries, concert films
  const poster = (p) => p ? `https://image.tmdb.org/t/p/w342${p}` : null;
  try {
    const en = (u) => u.replace('&language=fr-FR&', '&language=en-US&');
    const [tv, films, tvEn, filmsEn] = await Promise.all([tmdbResults(tvUrl, 3), tmdbResults(movieUrl, 3), tmdbResults(en(tvUrl), 3), tmdbResults(en(movieUrl), 3)]);
    // No French title -> TMDB falls back to the original script (신의 구슬); the English one is readable here.
    const enName = new Map([...tvEn.map(x => [`tv${x.id}`, x.name]), ...filmsEn.map(x => [`m${x.id}`, x.title])]);
    const readable = (fr, original, key) => (fr && fr !== original) ? fr : (enName.get(key) || fr);
    const series = tv.map(s => ({
      type: 'drama', dramaKind: 'series', tmdbType: 'tv', name: readable(s.name, s.original_name, `tv${s.id}`), first_air_date: s.first_air_date,
      overview: s.overview, poster_path: poster(s.poster_path), id: s.id, popularity: s.popularity,
    }));
    const movies = films.map(m => ({
      type: 'drama', dramaKind: 'film', tmdbType: 'movie', title: readable(m.title, m.original_title, `m${m.id}`), release_date: m.release_date,
      overview: m.overview, poster_path: poster(m.poster_path), id: `m${m.id}`, tmdbId: m.id, popularity: m.popularity,
    }));
    // Series first (fewer of them), films fill the rest; then most popular first.
    return [...series, ...movies].slice(0, CONFIG.FULL_LIMIT).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  } catch (e) {
    log('TMDB-DRAMA', `Error: ${e.message}`);
    return [];
  }
}

async function fetchTMDBUpcomingTV() {
  if (!CONFIG.TMDB_API_KEY) return [];
  const url = `https://api.themoviedb.org/3/discover/tv?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&sort_by=popularity.desc&include_adult=false&page=1&first_air_date.gte=${getDateOffset(CONFIG.DAYS_AHEAD)}&first_air_date.lte=${getDateOffset(365)}&without_genres=16,10763,10764,10766,10767`;
  try {
    return (await tmdbResults(url, 5)).filter(s => !ASIAN_LANGS.includes(s.original_language)).slice(0, CONFIG.FULL_LIMIT).map(s => ({
      type: 'series',
      name: s.name,
      original_name: s.original_name,
      first_air_date: s.first_air_date,
      overview: s.overview,
      poster_path: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : null,
      genre_ids: s.genre_ids,
      vote_average: s.vote_average,
      original_language: s.original_language,
      id: s.id,
    }));
  } catch (e) {
    log('TMDB-TV', `Error: ${e.message}`);
    return [];
  }
}

// AniList (GraphQL)
async function fetchAniListUpcoming() {
  const query = `
    query ($date: FuzzyDateInt) {
      Page(perPage: 50) {
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, startDate_greater: $date) {
          id
          title { romaji english native }
          coverImage { large }
          startDate { year month day }
          nextAiringEpisode { airingAt episode }
          genres
          averageScore
          format
          episodes
        }
      }
    }
  `;
  const variables = { date: getDateOffsetInt(CONFIG.DAYS_AHEAD) };
  
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const data = await res.json();
    return (data.data?.Page?.media || []).slice(0, CONFIG.FULL_LIMIT).map(a => ({
      type: 'anime',
      title: a.title.english || a.title.romaji || a.title.native,
      romaji: a.title.romaji,
      startDate: a.startDate,
      nextAiring: a.nextAiringEpisode,
      coverImage: a.coverImage?.large,
      genres: a.genres,
      score: a.averageScore,
      format: a.format,
      episodes: a.episodes,
      id: a.id,
    }));
  } catch (e) {
    log('AniList', `Error: ${e.message}`);
    return [];
  }
}

// Manga / manhwa / manhua: comics have no "release date" to announce, so the strip shows what is
// trending right now among ongoing titles, split by country of origin like the app does.
async function fetchAniListComics(country, type) {
  const query = `
    query ($country: CountryCode) {
      Page(perPage: 50) {
        media(type: MANGA, countryOfOrigin: $country, status: RELEASING, sort: TRENDING_DESC, isAdult: false) {
          id
          title { romaji english native }
          coverImage { large }
          description(asHtml: false)
        }
      }
    }
  `;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { country } })
    });
    const data = await res.json();
    return (data.data?.Page?.media || []).filter(m => m.coverImage?.large).slice(0, CONFIG.FULL_LIMIT).map(m => ({
      type,
      title: m.title.english || m.title.romaji || m.title.native,
      coverImage: m.coverImage.large,
      overview: (m.description || '').replace(/<[^>]+>/g, '').replace(/\(Source:[^)]*\)/i, '').trim(),
      statusKey: 'ongoing',
      id: m.id,
    }));
  } catch (e) {
    log('AniList-' + type, `Error: ${e.message}`);
    return [];
  }
}

// Webtoon: MangaDex's "Long Strip" tag is the vertical-scroll format itself, most-followed ongoing first.
async function fetchMangaDexWebtoons() {
  const LONG_STRIP = '3e2b8dae-350e-4ab8-a8ce-016e844b9f0d';
  const url = `https://api.mangadex.org/manga?limit=70&includedTags[]=${LONG_STRIP}&status[]=ongoing&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]=en`;
  try {
    const data = await (await fetch(url, { headers: { 'User-Agent': 'tsugi-legal-build' } })).json();
    const list = (data.data || []).map(m => {
      const t = m.attributes?.title || {};
      return {
        type: 'webtoon',
        // Main title is often the romanized original; the English one sits in altTitles (longest = not an acronym like "TBATE").
        title: t.en || (m.attributes?.altTitles || []).map(a => a.en).filter(Boolean).sort((a, b) => b.length - a.length)[0] || Object.values(t)[0] || '',
        overview: m.attributes?.description?.fr || m.attributes?.description?.en || '',
        statusKey: 'ongoing',
        alId: parseInt(m.attributes?.links?.al, 10) || null,
        id: m.id,
      };
    }).filter(w => w.title && w.alId);
    // Covers come from AniList (via MangaDex's own AniList link): uploads.mangadex.org serves a
    // "read it on mangadex.org" placeholder instead of the cover when embedded on another site.
    const covers = {};
    const ids = list.map(w => w.alId);
    for (let k = 0; k < ids.length; k += 50) {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: MANGA) { id coverImage { large } } } }', variables: { ids: ids.slice(k, k + 50) } }),
      });
      for (const m of (await res.json()).data?.Page?.media || []) if (m.coverImage?.large) covers[m.id] = m.coverImage.large;
    }
    return list.map(w => ({ ...w, coverImage: covers[w.alId] || null })).filter(w => w.coverImage).slice(0, CONFIG.FULL_LIMIT);
  } catch (e) {
    log('MangaDex', `Error: ${e.message}`);
    return [];
  }
}

async function fetchTMDBStreamingMovies() {
  if (!CONFIG.TMDB_API_KEY) return [];
  try {
    const seen = new Set();
    const candidates = [];
    for (const region of LOCAL_REGIONS) {
      const url = `https://api.themoviedb.org/3/discover/movie?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&region=${region}&with_release_type=4&sort_by=popularity.desc&include_adult=false&include_video=false&page=1&release_date.gte=${getDateOffset(0)}&release_date.lte=${getDateOffset(365)}`;
      for (const m of await tmdbResults(url, 5)) if (!seen.has(m.id)) { seen.add(m.id); candidates.push(m); }
    }
    candidates.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    const out = [];
    for (let k = 0; k < candidates.length && out.length < CONFIG.FULL_LIMIT; k += 10) {
      const batch = candidates.slice(k, k + 10);
      const releases = await Promise.all(batch.map(m => localRelease(m.id, [4], getDateOffset(0))));
      batch.forEach((m, n) => {
        const local = releases[n];
        if (!local || out.length >= CONFIG.FULL_LIMIT) return;
        out.push({
          type: 'movie', title: m.title, original_title: m.original_title, release_date: local.date,
          releaseKind: 'streaming', platform: local.platform, world: local.world, overview: m.overview,
          poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
          genre_ids: m.genre_ids, vote_average: m.vote_average, id: m.id,
        });
      });
    }
    return out;
  } catch (e) {
    log('TMDB-Streaming', `Error: ${e.message}`);
    return [];
  }
}

// IGDB, via the same Supabase RPC proxy the Android app uses (games have no free direct API).
async function fetchIGDBGames() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    log('IGDB', 'Skipped (SUPABASE_URL/SUPABASE_ANON_KEY not set)');
    return [];
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec + CONFIG.DAYS_AHEAD * 86400;
  const query = `fields name, slug, first_release_date, summary, cover.url, cover.image_id, hypes; where first_release_date >= ${fromSec} & hypes > 0 & cover != null; sort hypes desc; limit ${CONFIG.FULL_LIMIT};`;
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/igdb_proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_endpoint: 'games', p_query: query }),
    });
    const data = await res.json();
    if (!Array.isArray(data)) log('IGDB', `Unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
    const games = Array.isArray(data) ? data : [];
    return games.slice(0, CONFIG.FULL_LIMIT).map(g => ({
      type: 'game',
      title: g.name,
      release_date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().split('T')[0] : null,
      overview: g.summary,
      igdbSlug: g.slug,
      poster_path: g.cover?.url ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}` : null,
      id: g.id,
    }));
  } catch (e) {
    log('IGDB', `Error: ${e.message}`);
    return [];
  }
}

// ========== DATE HELPERS ==========
function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getDateOffsetInt(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return parseInt(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

function formatDateFR(dateStr) {
  if (!dateStr) return 'Date TBA';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateEN(dateStr) {
  if (!dateStr) return 'Date TBA';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateNL(dateStr) {
  if (!dateStr) return 'Datum TBA';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ========== AI DESCRIPTION GENERATOR (OPTIONAL) ==========
async function generateAIBlurb(item, lang) {
  if (!CONFIG.OPENAI_API_KEY && !CONFIG.ANTHROPIC_API_KEY) {
    // Fallback: use existing overview/description
    return item.overview || item.description || '';
  }
  
  const prompts = {
    fr: `Écris une phrase accrocheuse (max 160 caractères) pour cette sortie ${item.type}: "${item.title || item.name}". Date: ${formatDateFR(item.release_date || item.first_air_date || item.startDate?.year + '-' + String(item.startDate?.month).padStart(2,'0') + '-' + String(item.startDate?.day).padStart(2,'0'))}. Genres: ${item.genres?.join(', ') || item.genre_ids?.join(', ')}.`,
    en: `Write a catchy one-liner (max 160 chars) for this ${item.type} release: "${item.title || item.name}". Date: ${formatDateEN(item.release_date || item.first_air_date || item.startDate?.year + '-' + String(item.startDate?.month).padStart(2,'0') + '-' + String(item.startDate?.day).padStart(2,'0'))}. Genres: ${item.genres?.join(', ') || item.genre_ids?.join(', ')}.`,
    nl: `Schrijf een aantrekkelijke one-liner (max 160 tekens) voor deze ${item.type} release: "${item.title || item.name}". Datum: ${formatDateNL(item.release_date || item.first_air_date || item.startDate?.year + '-' + String(item.startDate?.month).padStart(2,'0') + '-' + String(item.startDate?.day).padStart(2,'0'))}. Genres: ${item.genres?.join(', ') || item.genre_ids?.join(', ')}.`
  };
  
  // Simplified - in production would call OpenAI/Anthropic
  return item.overview || item.description || prompts[lang];
}

// ========== URLS ==========
// Clean URLs: /anime/, /films/streaming/2/, /jeux/silver-palace/, /en/... (site-source/pages.js writes them).
// Same map as site-source/gen.js (CAT_SLUGS) — keep both in sync.
const CAT_SLUGS = { anime: 'anime', manga: 'manga', manhwa: 'manhwa', manhua: 'manhua', webtoon: 'webtoon', series: 'series', drama: 'dramas', movie: 'films', game: 'jeux' };
const LANG_PREFIX = { fr: '', en: '/en', nl: '/nl' };
// Path segments an item slug must never take: page numbers and filter names live at the same level.
const RESERVED = new Set(['cinema', 'streaming', 'series', 'films']);

function slugify(text) {
  return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
}

// Unique within the category; titles with no Latin letters (신의 구슬) fall back to the id.
function assignSlugs(items, category) {
  const used = new Set();
  for (const it of items) {
    let base = slugify(it.title || it.name || it.romaji);
    if (!base || /^\d+$/.test(base) || RESERVED.has(base)) base = `${category}-${String(it.id).replace(/[^a-z0-9]/gi, '')}`;
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    it.pageSlug = slug;
  }
}

function itemPath(item, category, lang) {
  return `${LANG_PREFIX[lang]}/${CAT_SLUGS[category]}/${item.pageSlug}/`;
}

// ========== HTML GENERATOR ==========
const CAT_LABELS = {
  fr: { movie: 'Film', series: 'Série', anime: 'Anime', drama: 'Drama', game: 'Jeu', manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', webtoon: 'Webtoon' },
  en: { movie: 'Movie', series: 'Series', anime: 'Anime', drama: 'Drama', game: 'Game', manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', webtoon: 'Webtoon' },
  nl: { movie: 'Film', series: 'Serie', anime: 'Anime', drama: 'Drama', game: 'Game', manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', webtoon: 'Webtoon' }
};
const STATUS_LABELS = { fr: { ongoing: 'En cours' }, en: { ongoing: 'Ongoing' }, nl: { ongoing: 'Lopend' } };
const KIND_LABELS = { fr: { cinema: 'Au cinéma', streaming: 'En streaming' }, en: { cinema: 'In cinemas', streaming: 'Streaming' }, nl: { cinema: 'In de bioscoop', streaming: 'Streaming' } };
const DRAMA_KIND_LABELS = { fr: { series: 'Série', film: 'Film' }, en: { series: 'Series', film: 'Film' }, nl: { series: 'Serie', film: 'Film' } };

// AniList's startDate often has only a year for not-yet-released anime (month/day unannounced):
// a full date string is only built when all three parts are real ("Invalid Date" otherwise).
function itemFullDate(item) {
  const sd = item.startDate;
  return item.release_date || item.first_air_date ||
    (sd && sd.year && sd.month && sd.day ? `${sd.year}-${String(sd.month).padStart(2,'0')}-${String(sd.day).padStart(2,'0')}` : null);
}

function itemDateLabel(item, category, lang) {
  const sd = item.startDate;
  const date = itemFullDate(item);
  const partial = !date && sd && sd.year
    ? (sd.month ? new Date(sd.year, sd.month - 1, 1).toLocaleDateString({ fr: 'fr-FR', en: 'en-US', nl: 'nl-NL' }[lang], { month: 'long', year: 'numeric' }) : String(sd.year))
    : null;
  const dateFormatter = { fr: formatDateFR, en: formatDateEN, nl: formatDateNL }[lang];
  const when = (item.statusKey && STATUS_LABELS[lang][item.statusKey]) || partial || dateFormatter(date);
  const kind = item.releaseKind ? ` · ${(item.releaseKind === 'streaming' && item.platform) || KIND_LABELS[lang][item.releaseKind]}`
    : item.dramaKind ? ` · ${DRAMA_KIND_LABELS[lang][item.dramaKind]}` : '';
  return `${CAT_LABELS[lang][category] || category}${kind} · ${when}`;
}

// Sort key for "soonest first"; unknown month/day sort last within their year, undated keeps rank order.
function itemSortKey(item) {
  const sd = item.startDate;
  return itemFullDate(item) || (sd && sd.year ? `${sd.year}-${String(sd.month || 99).padStart(2,'0')}-99` : '');
}
const byDate = (list) => [...list].sort((a, b) => itemSortKey(a).localeCompare(itemSortKey(b)));

// Where the detail page's "source" link points, per category.
function sourceUrl(item, category) {
  switch (category) {
    case 'movie': return `https://www.themoviedb.org/movie/${item.id}`;
    case 'series': return `https://www.themoviedb.org/tv/${item.id}`;
    case 'drama': return item.tmdbType === 'movie' ? `https://www.themoviedb.org/movie/${item.tmdbId}` : `https://www.themoviedb.org/tv/${item.id}`;
    case 'anime': return `https://anilist.co/anime/${item.id}`;
    case 'manga': case 'manhwa': case 'manhua': return `https://anilist.co/manga/${item.id}`;
    case 'webtoon': return `https://mangadex.org/title/${item.id}`;
    case 'game': return item.igdbSlug ? `https://www.igdb.com/games/${item.igdbSlug}` : null;
    default: return null;
  }
}

function toPublicItem(item, category) {
  return {
    id: String(item.id),
    slug: item.pageSlug,
    title: item.title || item.name || item.romaji || '',
    poster: item.poster_path || item.coverImage || null,
    blurb: (item.overview || item.description || '').slice(0, 1500),
    url: sourceUrl(item, category),
    ...(item.releaseKind || item.dramaKind ? { kind: item.releaseKind || item.dramaKind } : {}),
    ...(item.world ? { world: item.world.map(w => ({ c: w.country, d: w.date, k: w.kind, ...(w.platform ? { p: w.platform } : {}) })) } : {}),
    date: { fr: itemDateLabel(item, category, 'fr'), en: itemDateLabel(item, category, 'en'), nl: itemDateLabel(item, category, 'nl') },
  };
}
function generateCategoryHTML(items, category, lang) {
  if (!items.length) return '<!-- No upcoming releases -->';

  return items.map((item, i) => {
    const rawTitle = item.title || item.name || item.romaji || 'Sans titre';
    const title = esc(rawTitle);
    const poster = item.poster_path || item.coverImage;
    const blurb = esc(item.overview || item.description || '');
    // Some very recently announced titles have no poster on TMDB/AniList at all yet (checked
    // directly against the API — not a language-fallback gap, the field is genuinely empty) —
    // an empty <img> slot read as a broken card, so show the category-colored initial instead.
    const media = poster
      ? `<img src="${poster}" alt="${title}" loading="lazy">`
      : `<div class="cat-card-fallback">${esc(rawTitle.charAt(0).toUpperCase())}</div>`;

    return `
      <a class="cat-card dynamic" data-cat="${category}" data-reveal style="grid-column: span 1;" href="${itemPath(item, category, lang)}">
        <span class="idx">${String(i+1).padStart(2,'0')}</span>
        <h3>${title}</h3>
        ${media}
        <p class="release-date">${esc(itemDateLabel(item, category, lang))}</p>
        <p class="blurb">${blurb.slice(0, 120)}${blurb.length > 120 ? '…' : ''}</p>
      </a>
    `;
  }).join('\n');
}

// ========== MAIN BUILD ==========
async function main() {
  log('BUILD', 'Starting tsugi-legal build...');
  
  // Fetch all data in parallel
  log('FETCH', 'Calling APIs...');
  const [cinemaMovies, series, streamingMovies, anime, games, dramas, webtoons] = await Promise.all([
    fetchTMDBUpcomingMovies(),
    fetchTMDBUpcomingTV(),
    fetchTMDBStreamingMovies(),
    fetchAniListUpcoming(),
    fetchIGDBGames(),
    fetchTMDBDramas(),
    fetchMangaDexWebtoons(),
  ]);
  // Films = cinema + streaming; a film in both keeps its cinema entry (ids must stay unique for fiche.html).
  // 80 films (8 pages of 10): half cinema, half streaming, the other side filling in if one is short.
  const FILMS_TOTAL = 80;
  const cinemaIds = new Set(cinemaMovies.map(m => m.id));
  const streamOnly = streamingMovies.filter(m => !cinemaIds.has(m.id));
  const nCinema = Math.min(cinemaMovies.length, Math.max(FILMS_TOTAL / 2, FILMS_TOTAL - streamOnly.length));
  const movies = [...cinemaMovies.slice(0, nCinema), ...streamOnly.slice(0, FILMS_TOTAL - nCinema)];
  log('FETCH', `Films: ${cinemaMovies.length} cinema + ${streamingMovies.length} streaming`);
  // AniList rate-limits bursts: the three comic queries go one after another.
  const manga = await fetchAniListComics('JP', 'manga');
  const manhwa = await fetchAniListComics('KR', 'manhwa');
  const manhua = await fetchAniListComics('CN', 'manhua');

  log('FETCH', `Got ${movies.length} movies, ${series.length} series, ${anime.length} anime, ${games.length} games, ${dramas.length} dramas, ${manga.length} manga, ${manhwa.length} manhwa, ${manhua.length} manhua, ${webtoons.length} webtoons`);

  // Load template
  let html = fs.readFileSync(CONFIG.TEMPLATE_PATH, 'utf-8');
  const $ = cheerio.load(html);

  // Inject into each language panel
  const langs = ['fr', 'en', 'nl'];
  const categories = {
    movie: movies,
    series: series,
    anime: anime,
    game: games,
    drama: dramas,
    manga,
    manhwa,
    manhua,
    webtoon: webtoons,
  };

  for (const [catKey, items] of Object.entries(categories)) assignSlugs(items, catKey);

  for (const lang of langs) {
    for (const [catKey, items] of Object.entries(categories)) {
      const sectionId = `#categories-${lang}`;
      // Each category has its own strip/.cat-grid (data-catkey="movie"/"anime"/etc.) — grabbing
      // just the first .cat-grid in the section used to dump every category's cards into whichever
      // one happened to come first in the markup.
      const catGrid = $(sectionId).find(`.cat-grid[data-catkey="${catKey}"]`);

      // Category tile: count + three real covers of that category.
      const countLabel = { fr: 'titres', en: 'titles', nl: 'titels' }[lang];
      if (items.length) $(sectionId).find(`.tile-count[data-tilekey="${catKey}"]`).text(`${items.length} ${countLabel}`);
      const covers = items.map(it => it.poster_path || it.coverImage).filter(Boolean).slice(0, 3);
      if (covers.length) $(sectionId).find(`.tile-covers[data-tilekey="${catKey}"]`).html(covers.map(u => `<img src="${u}" alt="" loading="lazy">`).join(''));

      // A failed fetch (dead API, bad secret) keeps yesterday's cards instead of blanking the strip.
      if (!items.length) { log('INJECT', `${catKey}: no items, keeping previous cards in ${lang}`); continue; }
      if (catGrid.length) {
        // Yesterday's run already injected .dynamic cards into this same committed index.html —
        // without clearing them first, every successful run piles more on top of the last forever.
        catGrid.find('.cat-card.dynamic').remove();
        // Films: up to two streaming releases, the rest of the four from cinema.
        const streamPick = catKey === 'movie' ? items.filter(m => m.releaseKind === 'streaming').slice(0, 2)
          : catKey === 'drama' ? items.filter(m => m.dramaKind === 'film').slice(0, 2) : [];
        const landing = byDate([...streamPick, ...items.filter(m => !streamPick.includes(m)).slice(0, CONFIG.LIMIT_PER_CATEGORY - streamPick.length)]);
        catGrid.append(generateCategoryHTML(landing, catKey, lang));
        log('INJECT', `Injected ${landing.length} ${catKey} items into ${lang}`);
      }
    }
  }

  // "Voir plus" pages read these. An empty fetch keeps yesterday's file rather than blanking the page.
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  for (const [catKey, items] of Object.entries(categories)) {
    if (!items.length) { log('DATA', `${catKey}: no items, keeping previous file`); continue; }
    fs.writeFileSync(path.join(CONFIG.DATA_DIR, `${catKey}.json`), JSON.stringify(byDate(items).map(it => toPublicItem(it, catKey))));
    log('DATA', `${catKey}: ${items.length} items`);
  }

  // Add last updated timestamp — remove yesterday's before adding today's, same reason as above.
  const now = new Date().toISOString();
  $('footer .foot-brand .last-updated').remove();
  $('footer .foot-brand').prepend(`<span class="last-updated" style="margin-right:16px;font-size:11px;color:var(--ink-faint);">Mis à jour: ${now.slice(0,10)}</span>`);
  
  // Write output
  fs.writeFileSync(CONFIG.OUTPUT_PATH, $.html());
  log('BUILD', `Written to ${CONFIG.OUTPUT_PATH}`);
  log('BUILD', 'Done!');
}

main().catch(e => {
  log('ERROR', e.message);
  process.exit(1);
});
