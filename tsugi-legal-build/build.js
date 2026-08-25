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
const CONFIG = {
  // API Keys (set via GitHub Secrets)
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  ANILIST_CLIENT_ID: process.env.ANILIST_CLIENT_ID,
  ANILIST_CLIENT_SECRET: process.env.ANILIST_CLIENT_SECRET,
  IGDB_CLIENT_ID: process.env.IGDB_CLIENT_ID,
  IGDB_CLIENT_SECRET: process.env.IGDB_CLIENT_SECRET,
  BETASERIES_API_KEY: process.env.BETASERIES_API_KEY,
  BETASERIES_TOKEN: process.env.BETASERIES_TOKEN,
  // Same Supabase project the Android app uses, for the IGDB proxy (games have no free direct API).
  // SUPABASE_ANON_KEY is the public/RLS-protected key — same one already shipped inside the app's
  // compiled APK — but it's read from env like every other credential here, not hardcoded.
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  // Optional: AI for descriptions
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  
  // Filters
  DAYS_AHEAD: 30, // Calendar covers 30 days, Feed shows 30+ days
  LIMIT_PER_CATEGORY: 4, // How many items to show per category on landing page
  
  // Paths
  TEMPLATE_PATH: path.resolve('../index.html'),
  OUTPUT_PATH: path.resolve('../index.html'),
};

// ========== UTILITIES ==========
function log(stage, msg) {
  const time = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${time}] [${stage}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ========== API CLIENTS ==========

// TMDB
async function fetchTMDBUpcomingMovies() {
  if (!CONFIG.TMDB_API_KEY) return [];
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&region=BE&sort_by=release_date.asc&include_adult=false&include_video=false&page=1&release_date.gte=${getDateOffset(CONFIG.DAYS_AHEAD)}&release_date.lte=${getDateOffset(365)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).slice(0, CONFIG.LIMIT_PER_CATEGORY).map(m => ({
      type: 'movie',
      title: m.title,
      original_title: m.original_title,
      release_date: m.release_date,
      overview: m.overview,
      poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
      genre_ids: m.genre_ids,
      vote_average: m.vote_average,
      id: m.id,
    }));
  } catch (e) {
    log('TMDB-Movies', `Error: ${e.message}`);
    return [];
  }
}

async function fetchTMDBUpcomingTV() {
  if (!CONFIG.TMDB_API_KEY) return [];
  const url = `https://api.themoviedb.org/3/discover/tv?api_key=${CONFIG.TMDB_API_KEY}&language=fr-FR&sort_by=first_air_date.asc&include_adult=false&page=1&first_air_date.gte=${getDateOffset(CONFIG.DAYS_AHEAD)}&first_air_date.lte=${getDateOffset(365)}&without_genres=16,10763,10764,10766,10767`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).slice(0, CONFIG.LIMIT_PER_CATEGORY).map(s => ({
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
      Page(perPage: 20) {
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
    return (data.data?.Page?.media || []).slice(0, CONFIG.LIMIT_PER_CATEGORY).map(a => ({
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

// IGDB, via the same Supabase RPC proxy the Android app uses (games have no free direct API).
async function fetchIGDBGames() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    log('IGDB', 'Skipped (SUPABASE_URL/SUPABASE_ANON_KEY not set)');
    return [];
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const query = `fields name, first_release_date, summary, cover.url, cover.image_id; where first_release_date >= ${nowSec}; sort first_release_date asc; limit ${CONFIG.LIMIT_PER_CATEGORY};`;
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
    const games = Array.isArray(data) ? data : [];
    return games.slice(0, CONFIG.LIMIT_PER_CATEGORY).map(g => ({
      type: 'game',
      title: g.name,
      release_date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().split('T')[0] : null,
      overview: g.summary,
      poster_path: g.cover?.url ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}` : null,
      id: g.id,
    }));
  } catch (e) {
    log('IGDB', `Error: ${e.message}`);
    return [];
  }
}

// BetaSeries — dramas & series planning
async function fetchBetaSeriesUpcoming() {
  if (!CONFIG.BETASERIES_API_KEY) return [];
  try {
    const res = await fetch('https://api.betaseries.com/planning/upcoming', {
      headers: {
        'X-BetaSeries-Key': CONFIG.BETASERIES_API_KEY,
        'X-BetaSeries-Version': '3.0',
      },
    });
    const data = await res.json();
    const items = data.episodes || data.planning || [];
    return items.filter(it => it.show).slice(0, CONFIG.LIMIT_PER_CATEGORY).map(it => ({
      type: 'drama',
      title: it.show.title,
      release_date: it.date ? it.date.split(' ')[0] : null,
      overview: it.show.description,
      poster_path: it.show.poster || it.show.images?.poster,
      id: it.show.id,
    }));
  } catch (e) {
    log('BetaSeries', `Error: ${e.message}`);
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

// ========== HTML GENERATOR ==========
function generateCategoryHTML(items, category, lang) {
  if (!items.length) return '<!-- No upcoming releases -->';
  
  const labels = {
    fr: { movie: 'Film', series: 'Série', anime: 'Anime', drama: 'Drama', game: 'Jeu' },
    en: { movie: 'Movie', series: 'Series', anime: 'Anime', drama: 'Drama', game: 'Game' },
    nl: { movie: 'Film', series: 'Serie', anime: 'Anime', drama: 'Drama', game: 'Game' }
  };
  
  const label = labels[lang][category] || category;
  const dateFormatter = { fr: formatDateFR, en: formatDateEN, nl: formatDateNL }[lang];
  
  return items.map((item, i) => {
    const date = item.release_date || item.first_air_date || 
      (item.startDate ? `${item.startDate.year}-${String(item.startDate.month).padStart(2,'0')}-${String(item.startDate.day).padStart(2,'0')}` : null);
    const title = item.title || item.name || item.romaji || 'Sans titre';
    const poster = item.poster_path || item.coverImage;
    const blurb = item.overview || item.description || '';
    
    return `
      <div class="cat-card dynamic" data-cat="${category}" data-reveal style="grid-column: span 1;">
        <span class="idx">${String(i+1).padStart(2,'0')}</span>
        <h3>${title}</h3>
        ${poster ? `<img src="${poster}" alt="${title}" style="width:100%;border-radius:8px;margin:8px 0;">` : ''}
        <p class="release-date">${label} · ${dateFormatter(date)}</p>
        <p class="blurb">${blurb.slice(0, 120)}${blurb.length > 120 ? '…' : ''}</p>
      </div>
    `;
  }).join('\n');
}

// ========== MAIN BUILD ==========
async function main() {
  log('BUILD', 'Starting tsugi-legal build...');
  
  // Fetch all data in parallel
  log('FETCH', 'Calling APIs...');
  const [movies, series, anime, games, dramas] = await Promise.all([
    fetchTMDBUpcomingMovies(),
    fetchTMDBUpcomingTV(),
    fetchAniListUpcoming(),
    fetchIGDBGames(),
    fetchBetaSeriesUpcoming(),
  ]);

  log('FETCH', `Got ${movies.length} movies, ${series.length} series, ${anime.length} anime, ${games.length} games, ${dramas.length} dramas`);

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
  };

  for (const lang of langs) {
    for (const [catKey, items] of Object.entries(categories)) {
      const sectionId = `#categories-${lang}`;
      const catGrid = $(sectionId).find('.cat-grid').first();

      if (catGrid.length) {
        // Yesterday's run already injected .dynamic cards into this same committed index.html —
        // without clearing them first, every successful run piles more on top of the last forever.
        catGrid.find(`.cat-card.dynamic[data-cat="${catKey}"]`).remove();
        const dynamicHTML = generateCategoryHTML(items, catKey, lang);
        catGrid.append(dynamicHTML);
        log('INJECT', `Injected ${items.length} ${catKey} items into ${lang}`);
      }
    }
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
