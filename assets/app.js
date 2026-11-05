// Category and detail pages. Each generated page (site-source/pages.js) only sets window.TSUGI
// ({ view, cat, kind, page, slug, lang }); everything else is rendered here from /data/<cat>.json.
(function () {
  var C = window.TSUGI;
  var t = window.TSUGI_I18N[C.lang];
  // Same maps as gen.js / build.js (CAT_SLUGS) — keep in sync.
  var CAT_SLUGS = { anime: 'anime', manga: 'manga', manhwa: 'manhwa', manhua: 'manhua', webtoon: 'webtoon', series: 'series', drama: 'dramas', movie: 'films', game: 'jeux' };
  var NUMS = { anime: '01', manga: '02', manhwa: '03', manhua: '04', webtoon: '05', series: '06', drama: '07', movie: '08', game: '09' };
  var LANG_PREFIX = { fr: '', en: '/en', nl: '/nl' };
  var COMICS = ['manga', 'manhwa', 'manhua', 'webtoon'];
  // Films: All / In cinemas / Streaming — Dramas: All / Series / Films.
  var FILTERS = { movie: { def: 'cinema', keys: ['cinema', 'streaming'] }, drama: { def: 'series', keys: ['series', 'film'] } };
  var KIND_SLUG = { cinema: 'cinema', streaming: 'streaming', series: 'series', film: 'films' };
  var PER_PAGE = 10;
  var app = document.getElementById('app');
  var base = LANG_PREFIX[C.lang] + '/' + CAT_SLUGS[C.cat] + '/';

  function node(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function link(cls, href, text) { var a = node('a', cls, text); a.href = href; return a; }
  function listPath(kind, page) {
    return base + (kind && kind !== 'all' ? KIND_SLUG[kind] + '/' : '') + (page > 1 ? page + '/' : '');
  }
  function poster(it) {
    if (it.poster) { var img = node('img'); img.src = it.poster; img.alt = it.title; img.loading = 'lazy'; return img; }
    return node('div', 'cat-card-fallback', (it.title || '?').charAt(0).toUpperCase());
  }
  function load(done) {
    fetch('/data/' + C.cat + '.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) { done(Array.isArray(list) ? list : []); });
  }

  function renderCategory(items) {
    var F = FILTERS[C.cat];
    var kind = F ? C.kind || 'all' : 'all';
    var kindOf = function (it) { return it.kind || (F && F.def); };
    var list = kind === 'all' ? items : items.filter(function (it) { return kindOf(it) === kind; });
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    var page = Math.min(Math.max(1, C.page || 1), pages);

    app.appendChild(link('see-more cp-back', LANG_PREFIX[C.lang] + '/#categories', '← ' + t.backHome));
    var head = node('div', 'cat-strip-head');
    head.appendChild(node('span', 'cat-num', NUMS[C.cat]));
    head.appendChild(node('h1', '', t.cats[C.cat]));
    head.appendChild(node('span', 'pill', COMICS.indexOf(C.cat) >= 0 ? t.popular : t.upcoming));
    app.appendChild(head);

    if (F) {
      var chips = node('div', 'kind-chips');
      ['all'].concat(F.keys).forEach(function (k) {
        var n = k === 'all' ? items.length : items.filter(function (it) { return kindOf(it) === k; }).length;
        chips.appendChild(link('kind-chip' + (kind === k ? ' active' : ''), listPath(k, 1), (k === 'all' ? t.filterAll : t.kinds[k]) + ' (' + n + ')'));
      });
      app.appendChild(chips);
    }

    if (!list.length) { app.appendChild(node('p', 'cp-empty', t.empty)); return; }
    var grid = node('div', 'cat-grid page-grid');
    list.slice((page - 1) * PER_PAGE, page * PER_PAGE).forEach(function (it, i) {
      var card = link('cat-card', base + it.slug + '/');
      card.appendChild(node('span', 'idx', String((page - 1) * PER_PAGE + i + 1).padStart(2, '0')));
      card.appendChild(node('h3', '', it.title));
      card.appendChild(poster(it));
      card.appendChild(node('p', 'release-date', it.date[C.lang] || it.date.fr));
      if (it.blurb) card.appendChild(node('p', 'blurb', it.blurb.length > 140 ? it.blurb.slice(0, 140) + '…' : it.blurb));
      grid.appendChild(card);
    });
    app.appendChild(grid);

    if (pages > 1) {
      var pager = node('nav', 'pager');
      pager.appendChild(page > 1 ? link('btn btn-ghost', listPath(kind, page - 1), '← ' + t.prev) : node('span', 'btn btn-ghost disabled', '← ' + t.prev));
      pager.appendChild(node('span', '', t.pageOf.replace('{p}', page).replace('{n}', pages)));
      pager.appendChild(page < pages ? link('btn btn-ghost', listPath(kind, page + 1), t.next + ' →') : node('span', 'btn btn-ghost disabled', t.next + ' →'));
      app.appendChild(pager);
    }
  }

  function renderWorld(it, into) {
    var CONT = { BE: 'eu', FR: 'eu', NL: 'eu', GB: 'eu', DE: 'eu', ES: 'eu', IT: 'eu', US: 'am', CA: 'am', MX: 'am', BR: 'am', AR: 'am',
                 KR: 'as', JP: 'as', CN: 'as', IN: 'as', TH: 'as', AU: 'oc', NZ: 'oc', ZA: 'af', MA: 'af', NG: 'af', AE: 'af' };
    var locale = { fr: 'fr-FR', en: 'en-GB', nl: 'nl-NL' }[C.lang];
    var names = window.Intl && Intl.DisplayNames ? new Intl.DisplayNames([C.lang], { type: 'region' }) : null;
    var section = node('section', 'fiche-world');
    section.appendChild(node('h2', 'fiche-h2', t.world));
    section.appendChild(node('p', 'fiche-note', t.worldNote));
    var grid = node('div', 'world-grid');
    ['eu', 'am', 'as', 'oc', 'af'].forEach(function (k) {
      var rows = it.world.filter(function (w) { return CONT[w.c] === k; });
      if (!rows.length) return;
      var box = node('div', 'world-box');
      box.appendChild(node('h3', '', t.continents[k]));
      rows.forEach(function (w) {
        var row = node('div', 'world-row');
        row.appendChild(node('span', '', names ? names.of(w.c) : w.c));
        row.appendChild(node('span', 'world-kind ' + w.k, w.p || t.kinds[w.k]));
        row.appendChild(node('span', 'world-date', new Date(w.d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })));
        box.appendChild(row);
      });
      grid.appendChild(box);
    });
    section.appendChild(grid);
    into.appendChild(section);
  }

  function renderFiche(items) {
    app.appendChild(link('see-more cp-back', base, '← ' + t.backCat + ' · ' + t.cats[C.cat]));
    var it = items.filter(function (x) { return x.slug === C.slug; })[0];
    if (!it) { app.appendChild(node('p', 'cp-empty', t.notFound)); return; }
    var body = node('article', 'fiche-body');
    var left = node('div', 'fiche-poster');
    left.appendChild(poster(it));
    body.appendChild(left);
    var info = node('div', 'fiche-info');
    info.appendChild(node('span', 'pill', t.cats[C.cat]));
    info.appendChild(node('h1', '', it.title));
    info.appendChild(node('p', 'release-date', it.date[C.lang] || it.date.fr));
    if (it.blurb) { info.appendChild(node('h2', 'fiche-h2', t.synopsis)); info.appendChild(node('p', 'fiche-blurb', it.blurb)); }
    if (it.world && it.world.length) renderWorld(it, info);
    var actions = node('div', 'fiche-actions');
    actions.appendChild(link('btn btn-primary', 'https://play.google.com/store/apps/details?id=app.tsugi.android', t.follow));
    if (it.url) { var src = link('btn btn-ghost', it.url, t.source + ' ↗'); src.target = '_blank'; src.rel = 'noopener'; actions.appendChild(src); }
    info.appendChild(actions);
    body.appendChild(info);
    app.appendChild(body);
  }

  load(C.view === 'fiche' ? renderFiche : renderCategory);
})();
