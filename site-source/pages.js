// Writes the clean-URL pages GitHub Pages serves as /<cat>/, /<cat>/<page>/, /<cat>/<filter>/,
// /<cat>/<item-slug>/ and the same under /en/ and /nl/. Each page is a small shell: content comes
// from /data/<cat>.json via /assets/app.js. Run after build.js (needs data/*.json and assets/i18n.json).
// Every run wipes and rewrites these folders, so an announcement that left the lists loses its page.
import fs from 'fs';

const root = new URL('../', import.meta.url);
// Same map as build.js / app.js (CAT_SLUGS) — keep in sync.
const CAT_SLUGS = { anime: 'anime', manga: 'manga', manhwa: 'manhwa', manhua: 'manhua', webtoon: 'webtoon', series: 'series', drama: 'dramas', movie: 'films', game: 'jeux' };
const LANG_PREFIX = { fr: '', en: 'en/', nl: 'nl/' };
const FILTERS = { movie: { def: 'cinema', keys: ['cinema', 'streaming'] }, drama: { def: 'series', keys: ['series', 'film'] } };
const KIND_SLUG = { cinema: 'cinema', streaming: 'streaming', series: 'series', film: 'films' };
const PER_PAGE = 10;
const I18N = JSON.parse(fs.readFileSync(new URL('assets/i18n.json', root), 'utf-8'));
const langs = Object.keys(LANG_PREFIX);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

for (const lp of Object.values(LANG_PREFIX)) for (const dir of Object.values(CAT_SLUGS)) fs.rmSync(new URL(lp + dir, root), { recursive: true, force: true });

function page(relPath, lang, config, title, description) {
  // Language switch: the same page in the other languages.
  const tail = relPath.slice(LANG_PREFIX[lang].length);
  const switcher = langs.map(l => `<a href="/${LANG_PREFIX[l]}${tail}"${l === lang ? ' class="active"' : ''}>${l.toUpperCase()}</a>`).join('');
  const html = `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header class="site-nav">
  <a class="brand" href="/${LANG_PREFIX[lang]}#categories"><span class="glyph">次</span><strong>TSUGI</strong></a>
  <div class="nav-right">
    <div class="lang-switch">${switcher}</div>
    <a class="btn btn-play" href="https://play.google.com/store/apps/details?id=app.tsugi.android">Google Play</a>
  </div>
</header>
<main class="section cat-page${config.view === 'fiche' ? ' fiche' : ''} hue-${config.cat}" id="app"></main>
<script>window.TSUGI = ${JSON.stringify({ ...config, lang })};</script>
<script src="/assets/i18n.js"></script>
<script src="/assets/app.js"></script>
</body></html>
`;
  const dir = new URL(relPath, root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(new URL('index.html', dir), html);
}

let count = 0;
for (const [cat, slug] of Object.entries(CAT_SLUGS)) {
  const file = new URL(`data/${cat}.json`, root);
  const items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
  const F = FILTERS[cat];
  const kinds = F ? ['all', ...F.keys] : ['all'];
  for (const lang of langs) {
    const t = I18N[lang];
    const catName = t.cats[cat];
    for (const kind of kinds) {
      const n = kind === 'all' ? items.length : items.filter(it => (it.kind || F.def) === kind).length;
      const pages = Math.max(1, Math.ceil(n / PER_PAGE));
      for (let p = 1; p <= pages; p++) {
        const rel = `${LANG_PREFIX[lang]}${slug}/${kind === 'all' ? '' : KIND_SLUG[kind] + '/'}${p > 1 ? p + '/' : ''}`;
        const label = kind === 'all' ? catName : `${catName} · ${t.kinds[kind]}`;
        page(rel, lang, { view: 'cat', cat, kind, page: p }, `TSUGI — ${label}${p > 1 ? ` (${p})` : ''}`, `${label} — TSUGI`);
        count++;
      }
    }
    for (const it of items) {
      page(`${LANG_PREFIX[lang]}${slug}/${it.slug}/`, lang, { view: 'fiche', cat, slug: it.slug },
        `${it.title} — TSUGI`, (it.blurb || `${it.title} · ${catName}`).slice(0, 160));
      count++;
    }
  }
}
console.log('Generated', count, 'pages');
