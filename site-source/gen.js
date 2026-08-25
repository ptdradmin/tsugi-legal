#!/usr/bin/env node
// One-time authoring aid: generates the new index.html from structured content.
// Not part of the ongoing build pipeline (build.js still does the daily data injection).
import fs from 'fs';

const CATS = [
  { key: 'anime',   num: '01', hue: 'anime' },
  { key: 'manga',   num: '02', hue: 'manga' },
  { key: 'manhwa',  num: '03', hue: 'manhwa' },
  { key: 'manhua',  num: '04', hue: 'manhua' },
  { key: 'webtoon', num: '05', hue: 'webtoon' },
  { key: 'series',  num: '06', hue: 'series' },
  { key: 'drama',   num: '07', hue: 'drama' },
  { key: 'movie',   num: '08', hue: 'movie' },
  { key: 'game',    num: '09', hue: 'game' },
];
// keys above match build.js's `categories` map exactly (movie/series/anime/game/drama) so the
// dynamic injection (data-catkey) lands in the right strip — manga/manhwa/manhua/webtoon have no
// dynamic source in build.js, so they stay bento-tile-only, no strip.

const T = {
  fr: {
    nav: ['Catégories', 'Fonctionnalités', 'FAQ', 'Confidentialité'],
    heroKicker: 'TSUGI — ce qui arrive',
    heroTitle: ['Tout ce que vous suivez.', 'Un seul endroit.'],
    heroBody: "Animes, mangas, manhwas, manhuas, webtoons, séries, dramas, films et jeux vidéo — une seule bibliothèque, des alertes de sortie, et une synchronisation entre tous vos appareils.",
    ctaPlay: 'Voir sur Google Play', ctaCats: 'Voir les catégories',
    catsKicker: 'Neuf mondes, un seul hub', catsTitle: 'Arrêtez de jongler entre dix applications.',
    catsBody: "Chaque catégorie a son propre univers de fans — et sa propre app dédiée. TSUGI les réunit toutes, avec les mêmes outils de suivi partout.",
    cats: {
      anime: ['Anime', 'Saisons, films et OAV suivis épisode par épisode.'],
      manga: ['Manga', 'Chapitres lus, séries en cours ou terminées.'],
      manhwa: ['Manhwa', "Webtoons coréens, du one-shot à la série longue."],
      manhua: ['Manhua', 'Bande dessinée chinoise, cultivation et fantasy.'],
      webtoon: ['Webtoon', 'Format vertical, mise à jour au fil des sorties.'],
      series: ['Séries', "Renouvellements suivis, même quand une date change."],
      drama: ['Dramas', 'K-drama, J-drama et C-drama, diffusion en cours.'],
      movie: ['Films', "Sorties à venir, du festival à la salle obscure."],
      game: ['Jeux', "Dates de sortie confirmées, jusqu'à plusieurs années."],
    },
    upcomingLabel: 'À venir',
    featKicker: 'Pourquoi TSUGI', featTitle: "Pensé pour qu'on ne rate plus une sortie.",
    feats: [
      ['Alertes de sortie', "Un nouvel épisode, chapitre ou une nouvelle saison sort ? TSUGI vous notifie directement, sans avoir à vérifier dix sites."],
      ['Bibliothèque personnelle', "Progression épisode par épisode ou chapitre par chapitre, statut de suivi et note sur 5 étoiles pour chaque titre."],
      ['Synchronisé partout', "Votre liste vous suit d'un appareil à l'autre, en continu, sans rien faire de plus."],
      ['Filtres avancés', "Genre, statut de diffusion, recherche par titre — sur chaque catégorie, pour retrouver exactement ce que vous cherchez."],
      ['IA & Recommandations de sorties', "Alimenté par l'IA : recherche en langage naturel et recommandations intelligentes des sorties et nouveautés à venir."],
    ],
    faqKicker: 'Questions fréquentes', faqTitle: 'Ce qu’on nous demande le plus.',
    faqs: [
      ['Est-ce que TSUGI est gratuit ?', "Oui. Toutes les fonctions essentielles (flux, calendrier, suivi, recherche, Top 100) sont gratuites. Un abonnement Premium facultatif est proposé pour soutenir le projet."],
      ['Ai-je besoin d’un compte ?', "Non, l'app fonctionne en mode invité. Un compte gratuit sert uniquement à synchroniser votre liste entre appareils et à voter au Top 100."],
      ['Comment marche la liste de suivi ?', "Touchez l'icône signet sur n'importe quelle fiche pour l'ajouter à votre bibliothèque. Vous la retrouvez dans l'onglet Bibliothèque, et elle se synchronise dans le cloud si vous êtes connecté."],
      ['Puis-je lire des mangas ou regarder des animes ici ?', "Non. TSUGI est un agrégateur d'informations et un calendrier de sorties. Chaque fiche vous oriente vers les plateformes officielles via la section « Où regarder »."],
      ['Que contient l’abonnement Premium ?', "Le Premium est un soutien optionnel au développement. Le paiement est traité de façon sécurisée par Google Play Billing et rattaché à votre compte ; aucune donnée bancaire ne transite par TSUGI."],
      ['Comment fonctionne le Top 100 ?', "C'est un classement communautaire : chaque utilisateur connecté peut voter une fois par titre. Les compteurs sont mis à jour en temps réel via Supabase."],
      ["L'application fonctionne-t-elle hors connexion ?", "Votre liste suivie et vos réglages restent accessibles hors ligne. La recherche, le calendrier et l'actualité nécessitent une connexion internet."],
      ['Mes données sont-elles en sécurité ?', "Oui : stockage local chiffré (AES-256), transferts en HTTPS, et isolation par utilisateur (RLS) côté serveur. Aucune publicité ni traqueur."],
      ["D'où viennent les données ?", "Les épisodes d'anime viennent d'AniList et de MyAnimeList (Jikan), les chapitres de manga/manhwa/manhua/webtoon de MangaDex, les films de TMDB, les séries de TVMaze et les jeux de RAWG."],
      ['Comment supprimer mon compte ?', "Depuis Réglages › Compte › Supprimer le compte. Toutes vos données (liste, votes, abonnement) sont définitivement effacées de nos serveurs."],
      ['Comment activer les notifications ?', "Dans Réglages › Notifications, activez les alertes souhaitées et accordez la permission Android. TSUGI vérifie alors périodiquement les nouveautés de vos titres suivis."],
      ['Comment souscrire ou résilier le Premium ?', "Depuis Réglages › Premium (vous devez être connecté). La résiliation se fait à tout moment depuis Google Play › Abonnements ; l'abonnement reste actif jusqu'à la fin de la période payée."],
    ],
    joinTitle: 'Rejoignez TSUGI', joinBody: 'Une seule bibliothèque pour tout ce que vous suivez.',
    ctaContact: 'Nous contacter',
    footLinks: ['FAQ', 'Politique de confidentialité', 'Conditions d’utilisation'],
  },
  en: {
    nav: ['Categories', 'Features', 'FAQ', 'Privacy'],
    heroKicker: "TSUGI — what's coming",
    heroTitle: ['Everything you follow.', 'One place.'],
    heroBody: "Anime, manga, manhwa, manhua, webtoons, series, dramas, movies and video games — one library, release alerts, and sync across all your devices.",
    ctaPlay: 'Get it on Google Play', ctaCats: 'View categories',
    catsKicker: 'Nine worlds, one hub', catsTitle: 'Stop juggling ten different apps.',
    catsBody: "Every category has its own fandom — and its own dedicated app. TSUGI brings them all together, with the same tracking tools everywhere.",
    cats: {
      anime: ['Anime', 'Seasons, movies and OVAs tracked episode by episode.'],
      manga: ['Manga', 'Chapters read, series ongoing or completed.'],
      manhwa: ['Manhwa', 'Korean webtoons, from one-shots to long-running series.'],
      manhua: ['Manhua', 'Chinese comics, cultivation and fantasy.'],
      webtoon: ['Webtoon', 'Vertical format, updated as new episodes drop.'],
      series: ['Series', 'Renewals tracked, even when a date changes.'],
      drama: ['Dramas', 'K-drama, J-drama and C-drama, currently airing.'],
      movie: ['Movies', 'Upcoming releases, from festival premieres to theaters.'],
      game: ['Games', 'Confirmed release dates, even years out.'],
    },
    upcomingLabel: 'Upcoming',
    featKicker: 'Why TSUGI', featTitle: 'Built so you never miss a release again.',
    feats: [
      ['Release alerts', 'A new episode, chapter, or season drops? TSUGI notifies you directly — no need to check ten different sites.'],
      ['Personal library', 'Episode-by-episode or chapter-by-chapter progress, tracking status, and a 5-star rating for every title.'],
      ['Synced everywhere', 'Your list follows you from one device to the next, automatically, with nothing extra to do.'],
      ['Advanced filters', "Genre, airing status, title search — on every category, so you find exactly what you're looking for."],
      ['AI & Upcoming Release Recommendations', 'AI-powered natural language search and smart recommendations for upcoming releases and new titles.'],
    ],
    faqKicker: 'Frequently asked', faqTitle: 'What people ask us the most.',
    faqs: [
      ['Is TSUGI free?', 'Yes. All the essential features (feed, calendar, tracking, search, Top 100) are free. An optional Premium subscription is available to support the project.'],
      ['Do I need an account?', 'No, the app works in guest mode. A free account is only needed to sync your list across devices and to vote in the Top 100.'],
      ['How does the tracking list work?', "Tap the bookmark icon on any title to add it to your library. You'll find it under the Library tab, and it syncs to the cloud if you're signed in."],
      ['Can I read manga or watch anime here?', 'No. TSUGI is an information aggregator and release calendar. Every title page points you to official platforms via the "Where to watch" section.'],
      ["What's included in Premium?", 'Premium is an optional way to support development. Payment is processed securely by Google Play Billing and tied to your account; no payment data ever passes through TSUGI.'],
      ['How does the Top 100 work?', "It's a community ranking: every signed-in user can vote once per title. Counts update in real time via Supabase."],
      ['Does the app work offline?', 'Your tracked list and settings stay available offline. Search, calendar, and news require an internet connection.'],
      ['Is my data safe?', 'Yes: encrypted local storage (AES-256), HTTPS transfers, and per-user isolation (RLS) server-side. No ads, no trackers.'],
      ['Where does the data come from?', 'Anime episodes come from AniList and MyAnimeList (Jikan), manga/manhwa/manhua/webtoon chapters from MangaDex, movies from TMDB, series from TVMaze, and games from RAWG.'],
      ['How do I delete my account?', 'From Settings › Account › Delete account. All your data (list, votes, subscription) is permanently erased from our servers.'],
      ['How do I enable notifications?', 'In Settings › Notifications, turn on the alerts you want and grant the Android permission. TSUGI then periodically checks for updates on your tracked titles.'],
      ['How do I subscribe or cancel Premium?', "From Settings › Premium (you need to be signed in). Cancel anytime from Google Play › Subscriptions; your subscription stays active until the end of the paid period."],
    ],
    joinTitle: 'Join TSUGI', joinBody: 'One library for everything you follow.',
    ctaContact: 'Contact us',
    footLinks: ['FAQ', 'Privacy Policy', 'Terms of Use'],
  },
  nl: {
    nav: ['Categorieën', 'Functies', 'FAQ', 'Privacy'],
    heroKicker: 'TSUGI — wat eraan komt',
    heroTitle: ['Alles wat je volgt.', 'Eén plek.'],
    heroBody: 'Anime, manga, manhwa, manhua, webtoons, series, dramas, films en games — één bibliotheek, releasemeldingen, en synchronisatie op al je apparaten.',
    ctaPlay: 'Verkrijgbaar via Google Play', ctaCats: 'Bekijk categorieën',
    catsKicker: 'Negen werelden, één hub', catsTitle: 'Stop met jongleren tussen tien apps.',
    catsBody: 'Elke categorie heeft zijn eigen fandom — en zijn eigen app. TSUGI brengt ze allemaal samen, met overal dezelfde volgtools.',
    cats: {
      anime: ['Anime', "Seizoenen, films en OVA's, episode per episode gevolgd."],
      manga: ['Manga', 'Gelezen hoofdstukken, lopende of afgeronde series.'],
      manhwa: ['Manhwa', 'Koreaanse webtoons, van oneshot tot langlopende serie.'],
      manhua: ['Manhua', 'Chinese strips, cultivation en fantasy.'],
      webtoon: ['Webtoon', 'Verticaal formaat, bijgewerkt bij elke nieuwe release.'],
      series: ['Series', 'Verlengingen gevolgd, ook als een datum verandert.'],
      drama: ['Dramas', 'K-drama, J-drama en C-drama, nu in uitzending.'],
      movie: ['Films', 'Aankomende releases, van festival tot bioscoop.'],
      game: ['Games', 'Bevestigde releasedata, zelfs jaren vooruit.'],
    },
    upcomingLabel: 'Binnenkort',
    featKicker: 'Waarom TSUGI', featTitle: 'Gemaakt zodat je nooit meer een release mist.',
    feats: [
      ['Releasemeldingen', 'Een nieuwe episode, hoofdstuk of seizoen verschijnt? TSUGI stuurt je direct een melding — geen tien sites meer checken.'],
      ['Persoonlijke bibliotheek', 'Voortgang per episode of hoofdstuk, volgstatus en een beoordeling van 5 sterren per titel.'],
      ['Overal gesynchroniseerd', 'Je lijst volgt je van het ene apparaat naar het andere, automatisch, zonder extra moeite.'],
      ['Geavanceerde filters', 'Genre, uitzendstatus, titel zoeken — bij elke categorie, zodat je precies vindt wat je zoekt.'],
      ['AI & Aanbevelingen voor komende releases', 'Aangedreven door AI: zoeken in natuurlijke taal en slimme aanbevelingen voor aankomende releases en titels.'],
    ],
    faqKicker: 'Veelgestelde vragen', faqTitle: 'Wat we het meest gevraagd krijgen.',
    faqs: [
      ['Is TSUGI gratis?', 'Ja. Alle essentiële functies (feed, kalender, volgen, zoeken, Top 100) zijn gratis. Een optioneel Premium-abonnement is beschikbaar om het project te steunen.'],
      ['Heb ik een account nodig?', 'Nee, de app werkt in gastmodus. Een gratis account is alleen nodig om je lijst tussen apparaten te synchroniseren en te stemmen in de Top 100.'],
      ['Hoe werkt de volglijst?', 'Tik op het bladwijzericoon op een titel om deze aan je bibliotheek toe te voegen. Je vindt hem terug onder het tabblad Bibliotheek, en hij synchroniseert naar de cloud als je bent ingelogd.'],
      ['Kan ik hier manga lezen of anime kijken?', 'Nee. TSUGI is een informatie-aggregator en releasekalender. Elke titelpagina verwijst je naar officiële platforms via de sectie "Waar te kijken".'],
      ['Wat zit er in het Premium-abonnement?', 'Premium is een optionele steun aan de ontwikkeling. Betaling wordt veilig verwerkt via Google Play Billing en gekoppeld aan je account; er gaan nooit betaalgegevens via TSUGI.'],
      ['Hoe werkt de Top 100?', 'Het is een community-ranking: elke ingelogde gebruiker kan één keer per titel stemmen. Tellers worden in realtime bijgewerkt via Supabase.'],
      ['Werkt de app offline?', 'Je volglijst en instellingen blijven offline beschikbaar. Zoeken, kalender en nieuws vereisen een internetverbinding.'],
      ['Zijn mijn gegevens veilig?', 'Ja: versleutelde lokale opslag (AES-256), HTTPS-overdracht, en isolatie per gebruiker (RLS) op de server. Geen advertenties, geen trackers.'],
      ['Waar komen de gegevens vandaan?', 'Anime-episodes komen van AniList en MyAnimeList (Jikan), manga/manhwa/manhua/webtoon-hoofdstukken van MangaDex, films van TMDB, series van TVMaze en games van RAWG.'],
      ['Hoe verwijder ik mijn account?', 'Via Instellingen › Account › Account verwijderen. Al je gegevens (lijst, stemmen, abonnement) worden definitief van onze servers gewist.'],
      ['Hoe activeer ik meldingen?', 'Zet in Instellingen › Meldingen de gewenste meldingen aan en geef de Android-toestemming. TSUGI controleert dan periodiek op nieuws over je gevolgde titels.'],
      ['Hoe neem of zeg ik Premium op?', 'Via Instellingen › Premium (je moet ingelogd zijn). Opzeggen kan op elk moment via Google Play › Abonnementen; het abonnement blijft actief tot het einde van de betaalde periode.'],
    ],
    joinTitle: 'Word deel van TSUGI', joinBody: 'Eén bibliotheek voor alles wat je volgt.',
    ctaContact: 'Contacteer ons',
    footLinks: ['FAQ', 'Privacybeleid', 'Gebruiksvoorwaarden'],
  },
};

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function navHtml(lang) {
  const t = T[lang];
  return `
    <nav class="nav-links lang-panel lang-panel-${lang}">
      <a href="#categories-${lang}">${esc(t.nav[0])}</a>
      <a href="#feat-${lang}">${esc(t.nav[1])}</a>
      <a href="#faq-${lang}">${esc(t.nav[2])}</a>
      <a href="privacy-policy.html">${esc(t.nav[3])}</a>
    </nav>`;
}

function heroHtml(lang) {
  const t = T[lang];
  return `
  <section class="hero lang-panel lang-panel-${lang}">
    <div class="hero-copy">
      <p class="kicker"><span class="glyph">次</span> ${esc(t.heroKicker)}</p>
      <h1>${esc(t.heroTitle[0])}<br><span class="grad">${esc(t.heroTitle[1])}</span></h1>
      <p class="hero-body">${esc(t.heroBody)}</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="https://play.google.com/store/apps/details?id=app.tsugi.android">${esc(t.ctaPlay)}</a>
        <a class="btn btn-ghost" href="#categories-${lang}">${esc(t.ctaCats)}</a>
      </div>
      <div class="social-proof">
        <div class="avatars" aria-hidden="true"><span></span><span></span><span></span></div>
        <span>9 catégories, une seule app</span>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <img class="phone phone-a" src="img/shot-feed.png" alt="" loading="eager">
      <img class="phone phone-b" src="img/shot-calendrier.png" alt="" loading="eager">
      <img class="phone phone-c" src="img/shot-maliste.png" alt="" loading="eager">
    </div>
  </section>`;
}

function categoriesHtml(lang) {
  const t = T[lang];
  const tiles = CATS.map(c => {
    const [name, desc] = t.cats[c.key];
    return `
        <a class="cat-tile hue-${c.hue}" href="#cat-${c.key}-${lang}" data-reveal>
          <span class="cat-num">${c.num}</span>
          <h3>${esc(name)}</h3>
          <p>${esc(desc)}</p>
        </a>`;
  }).join('');
  const strips = CATS.filter(c => ['movie','series','anime','game','drama'].includes(c.key)).map(c => `
        <div class="cat-strip hue-${c.hue}" id="cat-${c.key}-${lang}">
          <div class="cat-strip-head"><span class="cat-num">${c.num}</span><h3>${esc(t.cats[c.key][0])}</h3><span class="pill">${esc(t.upcomingLabel)}</span></div>
          <div class="cat-grid" data-catkey="${c.key}"></div>
        </div>`).join('');
  return `
  <section id="categories-${lang}" class="lang-panel lang-panel-${lang}">
    <div class="section-head">
      <p class="kicker">${esc(t.catsKicker)}</p>
      <h2>${esc(t.catsTitle)}</h2>
      <p class="section-body">${esc(t.catsBody)}</p>
    </div>
    <div class="cat-bento">${tiles}
    </div>
    <div class="cat-strips">${strips}
    </div>
  </section>`;
}

function featuresHtml(lang) {
  const t = T[lang];
  const cards = t.feats.map((f, i) => `
        <div class="feat-card${i === 4 ? ' feat-wide' : ''}" data-reveal>
          <div class="num">${String(i + 1).padStart(2, '0')}</div>
          <h3>${esc(f[0])}</h3>
          <p>${esc(f[1])}</p>
        </div>`).join('');
  return `
  <section id="feat-${lang}" class="lang-panel lang-panel-${lang}">
    <div class="section-head">
      <p class="kicker">${esc(t.featKicker)}</p>
      <h2>${esc(t.featTitle)}</h2>
    </div>
    <div class="feat-grid">${cards}
    </div>
  </section>`;
}

function faqHtml(lang) {
  const t = T[lang];
  const items = t.faqs.map(([q, a]) => `
        <details class="faq-item">
          <summary>${esc(q)}<span class="chev" aria-hidden="true"></span></summary>
          <p>${esc(a)}</p>
        </details>`).join('');
  return `
  <section id="faq-${lang}" class="lang-panel lang-panel-${lang}">
    <div class="section-head">
      <p class="kicker">${esc(t.faqKicker)}</p>
      <h2>${esc(t.faqTitle)}</h2>
    </div>
    <div class="faq-list">${items}
    </div>
  </section>`;
}

function joinHtml(lang) {
  const t = T[lang];
  return `
  <section class="join lang-panel lang-panel-${lang}">
    <div class="join-card">
      <h2>${esc(t.joinTitle)}</h2>
      <p>${esc(t.joinBody)}</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="https://play.google.com/store/apps/details?id=app.tsugi.android">${esc(t.ctaPlay)}</a>
        <a class="btn btn-ghost" href="mailto:contact-tsugi@stud-in.be">${esc(t.ctaContact)}</a>
      </div>
    </div>
  </section>`;
}

function footerBrand(lang) {
  const t = T[lang];
  return `
    <div class="foot-brand lang-panel lang-panel-${lang}">
      <span class="glyph">次</span>
      <span>© <span class="year"></span> TSUGI — <a href="mailto:contact-tsugi@stud-in.be">contact-tsugi@stud-in.be</a></span>
      <nav class="foot-links">
        <a href="#faq-${lang}">${esc(t.footLinks[0])}</a>
        <a href="privacy-policy.html">${esc(t.footLinks[1])}</a>
        <a href="terms.html">${esc(t.footLinks[2])}</a>
      </nav>
    </div>`;
}

const langs = ['fr', 'en', 'nl'];
const style = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf-8');

const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TSUGI — Un hub, pas dix apps</title>
<link rel="icon" type="image/svg+xml" href="img/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="img/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="img/favicon-192.png">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
<meta name="description" content="Anime, manga, manhwa, manhua, webtoons, series, dramas, movies and video games — tracked, rated and updated in one place, on every device.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${style}
</style>
</head>
<body>

<input type="radio" name="lang" id="lang-fr" checked>
<input type="radio" name="lang" id="lang-en">
<input type="radio" name="lang" id="lang-nl">

<header class="site-nav">
  <a class="brand" href="#top"><span class="glyph">次</span><strong>TSUGI</strong></a>
${langs.map(navHtml).join('')}
  <div class="nav-right">
    <div class="lang-switch">
      <label for="lang-fr">FR</label><label for="lang-en">EN</label><label for="lang-nl">NL</label>
    </div>
    <a class="btn btn-play" href="https://play.google.com/store/apps/details?id=app.tsugi.android">Google Play</a>
  </div>
</header>

<main id="top">
${langs.map(heroHtml).join('')}
${langs.map(categoriesHtml).join('')}
${langs.map(featuresHtml).join('')}
${langs.map(faqHtml).join('')}
${langs.map(joinHtml).join('')}
</main>

<footer>
${langs.map(footerBrand).join('')}
</footer>

<script>document.querySelectorAll('.year').forEach(function(e){e.textContent=new Date().getFullYear();});</script>
</body></html>
`;

fs.writeFileSync(new URL('../index.html', import.meta.url), html);
console.log('Generated', html.length, 'bytes');
