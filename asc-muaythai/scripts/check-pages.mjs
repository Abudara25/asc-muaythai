// Contrôles automatiques du site. Aucune dépendance : Node seul.
//
//   node scripts/check-pages.mjs
//
// Chaque contrôle correspond à un bug réellement survenu sur ce site. Le but
// n'est pas de vérifier « du HTML valide » en général, mais d'empêcher la
// répétition de ces erreurs précises — celles qui ne se voient pas à l'œil nu
// et coûtent des semaines d'indexation.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.asc-muaythai.fr';

// Pages publiques indexables. admin et cms sont des outils internes en noindex.
const PUBLIQUES = [
  'index.html', 'actualites.html', 'galerie.html', 'videos.html',
  'partenaires.html', 'inscription.html', 'cours-particulier.html',
];
const AVEC_CONSENTEMENT = [...PUBLIQUES, 'confidentialite.html', 'admin.html', '404.html'];
const AVEC_MENU_MOBILE = ['index.html', 'actualites.html', 'galerie.html', 'videos.html', 'partenaires.html'];

const echecs = [];
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const echec = (fichier, message) => echecs.push(`${fichier} : ${message}`);

// ── 1. Mesure d'audience et consentement ────────────────────────────────────
// Bug survenu : 4 pages sur 8 n'avaient ni analytics ni bandeau cookies. La
// moitié du site n'était pas mesurée et n'offrait aucun moyen de refuser.
for (const f of AVEC_CONSENTEMENT) {
  const h = lire(f);
  if (!h.includes('/analytics.js')) echec(f, 'analytics.js absent (page non mesurée)');
  if (!h.includes('/cookie-consent.js')) echec(f, 'cookie-consent.js absent (pas de moyen de refuser le suivi)');
}

// ── 2. Cohérence du menu de navigation ──────────────────────────────────────
// Bug survenu : la page /videos n'était liée depuis aucun menu, Google ne la
// découvrait pas. Le menu étant recopié dans chaque page, l'oubli est invisible.
const menus = new Map();
for (const f of AVEC_MENU_MOBILE) {
  const h = lire(f);
  const nav = h.match(/<nav>[\s\S]*?<\/nav>/)?.[0] ?? '';
  const liens = [...nav.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]).filter((l) => l !== '/');
  menus.set(f, new Set(liens));
}
const reference = menus.get('index.html');
for (const [f, liens] of menus) {
  if (f === 'index.html') continue;
  const manquants = [...reference].filter((l) => !liens.has(l));
  const surplus = [...liens].filter((l) => !reference.has(l));
  if (manquants.length) echec(f, `liens absents du menu : ${manquants.join(', ')}`);
  if (surplus.length) echec(f, `liens en trop dans le menu : ${surplus.join(', ')}`);
}

// ── 3. Données structurées ──────────────────────────────────────────────────
// Google compare le fil d'Ariane balisé au fil d'Ariane affiché : s'ils
// divergent, il ignore le balisage.
for (const f of PUBLIQUES) {
  const h = lire(f);
  for (const [, brut] of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(brut); } catch (e) { echec(f, `JSON-LD invalide : ${e.message.slice(0, 60)}`); }
  }

  const filVisible = h.match(/aria-current="page">([^<]+)</)?.[1]?.trim();
  const blocFil = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(([, b]) => { try { return JSON.parse(b); } catch { return null; } })
    .find((j) => j?.['@type'] === 'BreadcrumbList');

  if (f !== 'index.html') {
    if (!filVisible) echec(f, "fil d'Ariane visible absent");
    if (!blocFil) echec(f, 'BreadcrumbList absent des données structurées');
    if (filVisible && blocFil) {
      const balise = blocFil.itemListElement.at(-1)?.name;
      if (balise !== filVisible)
        echec(f, `fil d'Ariane désynchronisé : affiché « ${filVisible} », balisé « ${balise} »`);
    }
  }
}

// ── 4. Accessibilité ────────────────────────────────────────────────────────
for (const f of AVEC_CONSENTEMENT) {
  const h = lire(f);
  if (!h.includes('class="skip-link"')) echec(f, "lien d'évitement absent");
  if (!/<main[ >]/.test(h)) echec(f, '<main> absent (pas de repère de contenu principal)');
}
for (const f of AVEC_MENU_MOBILE) {
  const h = lire(f);
  const burger = h.match(/<button class="hamburger"[^>]*>/)?.[0] ?? '';
  if (!burger.includes('aria-expanded'))
    echec(f, 'bouton du menu mobile sans aria-expanded (état invisible aux lecteurs d\'écran)');
}
for (const f of readdirSync(RACINE).filter((x) => x.endsWith('.html'))) {
  const sansAlt = [...lire(f).matchAll(/<img (?![^>]*\balt=)[^>]*>/g)];
  if (sansAlt.length) echec(f, `${sansAlt.length} image(s) sans attribut alt`);
}

// ── 5. Appels tiers ─────────────────────────────────────────────────────────
// Bug survenu : polices chargées chez Google (transmission d'IP sans
// consentement) et jsPDF depuis un CDN sans contrôle d'intégrité, sur la page
// qui traite les données personnelles.
const TIERS_INTERDITS = [
  [/fonts\.(googleapis|gstatic)\.com/, 'polices chargées chez Google (RGPD : transmission d\'IP)'],
  [/cdnjs\.cloudflare\.com/, 'script chargé depuis un CDN tiers'],
];
for (const f of readdirSync(RACINE).filter((x) => x.endsWith('.html'))) {
  const h = lire(f);
  for (const [motif, quoi] of TIERS_INTERDITS) if (motif.test(h)) echec(f, quoi);
}

// ── 6. Indexation ───────────────────────────────────────────────────────────
for (const f of PUBLIQUES) {
  const h = lire(f);
  if (!/<link rel="canonical"/.test(h)) echec(f, 'balise canonique absente');
  if (/name="robots"[^>]*noindex/.test(h)) echec(f, 'page publique marquée noindex');
}

const sitemap = lire('sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const url of urls) {
  const chemin = url.replace(BASE, '').replace(/^\/$/, '/index') + '.html';
  const fichier = chemin.replace(/^\//, '');
  if (!existsSync(join(RACINE, fichier))) {
    echec('sitemap.xml', `${url} ne correspond à aucun fichier (${fichier})`);
    continue;
  }
  if (/name="robots"[^>]*noindex/.test(lire(fichier)))
    echec('sitemap.xml', `${url} est listé alors que la page est en noindex`);
}
for (const f of PUBLIQUES) {
  const canonique = lire(f).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonique && !urls.includes(canonique))
    echec('sitemap.xml', `${canonique} est indexable mais absent du sitemap`);
}

// ── Résultat ────────────────────────────────────────────────────────────────
if (echecs.length) {
  console.error(`\n${echecs.length} problème(s) détecté(s) :\n`);
  for (const e of echecs) console.error(`  ✗ ${e}`);
  console.error('');
  process.exitCode = 1;
} else {
  console.log('Tous les contrôles passent.');
}
