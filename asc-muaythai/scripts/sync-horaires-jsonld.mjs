// Resynchronise les horaires d'ouverture de la fiche Google (JSON-LD de
// index.html) avec les horaires réels du site.
//
//   node scripts/sync-horaires-jsonld.mjs
//
// Pourquoi ce script existe : les horaires affichés sur le site sont injectés
// en JavaScript depuis /admin, or Google ne lit pas le contenu injecté en
// JavaScript. Ils doivent donc être écrits une seconde fois « en dur » dans le
// JSON-LD. Sans ce script, modifier un horaire depuis /admin laisse la fiche
// Google sur l'ancien — silencieusement.
//
// À lancer après chaque changement d'horaire dans /admin.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const JOURS = {
  lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday',
  vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday',
};
const ORDRE = Object.values(JOURS);

// site-content.js s'exécute dans un navigateur et écrit dans `window` :
// on lui en fabrique un faux pour récupérer les valeurs par défaut.
function lireDefauts() {
  const source = readFileSync(join(RACINE, 'site-content.js'), 'utf8');
  const bac = { window: {}, fetch: () => {}, console };
  bac.window.fetch = bac.fetch;
  vm.createContext(bac);
  vm.runInContext(source, bac);
  return bac.window.SITE_CONTENT_DEFAULTS;
}

// Le contenu réellement servi prime sur les valeurs par défaut du dépôt.
async function lireContenuPublie(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.log(`Contenu distant indisponible (${err.message}) — on retombe sur les valeurs par défaut.`);
    return null;
  }
}

function creneaux(horaires) {
  // Une journée peut compter plusieurs cours : on retient l'amplitude totale,
  // de l'ouverture du premier à la fermeture du dernier.
  const parJour = new Map();

  for (const { jour, horaire } of horaires) {
    const cle = JOURS[String(jour).trim().toLowerCase()];
    if (!cle) { console.log(`Jour non reconnu, ignoré : « ${jour} »`); continue; }

    const heures = [...String(horaire).matchAll(/(\d{1,2})\s*h\s*(\d{2})?/g)]
      .map((m) => `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`);
    if (heures.length < 2) { console.log(`Horaire illisible, ignoré : « ${horaire} »`); continue; }

    const [debut, fin] = [heures[0], heures[heures.length - 1]];
    const actuel = parJour.get(cle);
    parJour.set(cle, actuel
      ? { opens: debut < actuel.opens ? debut : actuel.opens, closes: fin > actuel.closes ? fin : actuel.closes }
      : { opens: debut, closes: fin });
  }

  // Les jours qui partagent la même amplitude sont regroupés en une seule entrée.
  const groupes = new Map();
  for (const jour of ORDRE) {
    const c = parJour.get(jour);
    if (!c) continue;
    const cle = `${c.opens}-${c.closes}`;
    if (!groupes.has(cle)) groupes.set(cle, { jours: [], ...c });
    groupes.get(cle).jours.push(jour);
  }

  return [...groupes.values()].map((g) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: g.jours.length === 1 ? g.jours[0] : g.jours,
    opens: g.opens,
    closes: g.closes,
  }));
}

// Pas de process.exit() après un fetch : sous Windows, couper le processus
// alors qu'une connexion est encore ouverte fait planter libuv. On renvoie un
// code de sortie et on laisse Node terminer proprement.
async function main() {
  const defauts = lireDefauts();
  const sourceUrl = readFileSync(join(RACINE, 'site-content.js'), 'utf8')
    .match(/SITE_CONTENT_URL\s*=\s*'([^']+)'/)?.[1];

  const publie = sourceUrl ? await lireContenuPublie(sourceUrl) : null;
  const horaires = publie?.horaires ?? defauts.horaires;
  console.log(`Source : ${publie?.horaires ? 'contenu publié' : 'valeurs par défaut du dépôt'} (${horaires.length} créneaux)`);

  const specification = creneaux(horaires);

  const chemin = join(RACINE, 'index.html');
  let html = readFileSync(chemin, 'utf8');

  const bloc = html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"SportsClub"[\s\S]*?\})\s*<\/script>/);
  if (!bloc) {
    console.error('Bloc JSON-LD SportsClub introuvable dans index.html — rien modifié.');
    return 1;
  }

  const fiche = JSON.parse(bloc[1]);
  const avant = JSON.stringify(fiche.openingHoursSpecification);
  fiche.openingHoursSpecification = specification;

  if (avant === JSON.stringify(specification)) {
    console.log('Les horaires de la fiche Google sont déjà à jour.');
    return 0;
  }

  html = html.replace(bloc[0], `<script type="application/ld+json">\n${JSON.stringify(fiche, null, 2)}\n</script>`);
  writeFileSync(chemin, html);

  console.log('Fiche Google mise à jour :');
  for (const c of specification) {
    const jours = Array.isArray(c.dayOfWeek) ? c.dayOfWeek.join(', ') : c.dayOfWeek;
    console.log(`  ${jours} : ${c.opens} – ${c.closes}`);
  }
  return 0;
}

process.exitCode = await main();
