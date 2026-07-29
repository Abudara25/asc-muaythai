// Contrôles qui exigent un vrai moteur de rendu : une taille de police
// effective ou un débordement horizontal ne se déduisent pas du HTML, ils
// dépendent de la cascade CSS et des requêtes média.
//
//   npx playwright install chromium   (une seule fois)
//   node scripts/check-responsive.mjs
//
// Chaque contrôle correspond à un défaut réellement trouvé sur ce site :
//   - /confidentialite débordait à 360px (largeur min-content d'un tableau)
//   - des champs à 14px déclenchaient le zoom automatique de Safari iOS
//   - le bouton du menu mobile ne faisait que 32x24, sous le minimum tactile

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LARGEURS = [360, 768];
const PAGES = ['/', '/actualites', '/galerie', '/videos', '/partenaires',
  '/inscription', '/cours-particulier', '/confidentialite', '/404.html'];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.xml': 'application/xml',
};

// Serveur minimal reproduisant le routage de Vercel (cleanUrls).
function servir() {
  return new Promise((pret) => {
    const serveur = createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      for (const essai of [p, p + '.html', join(p, 'index.html')]) {
        const fichier = join(RACINE, essai);
        try {
          if (!(await stat(fichier)).isFile()) continue;
          res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream' });
          res.end(await readFile(fichier));
          return;
        } catch { /* essai suivant */ }
      }
      res.writeHead(404).end('introuvable');
    });
    serveur.listen(0, () => pret({ serveur, port: serveur.address().port }));
  });
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error("playwright n'est pas installé. Installation : npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const { serveur, port } = await servir();
const navigateur = await chromium.launch();
const echecs = [];

for (const largeur of LARGEURS) {
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: 800 } });
  const page = await contexte.newPage();

  for (const chemin of PAGES) {
    await page.goto(`http://localhost:${port}${chemin}`, { waitUntil: 'networkidle' });

    const mesures = await page.evaluate(() => {
      const vue = window.innerWidth;
      const petits = [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]),select,textarea')]
        .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
      const burger = document.querySelector('.hamburger');
      const rectBurger = burger && getComputedStyle(burger).display !== 'none'
        ? burger.getBoundingClientRect() : null;
      const deborde = [...document.querySelectorAll('body *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.right > vue + 1 && !e.classList.contains('skip-link');
        })
        .slice(0, 3)
        .map((e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''));
      return {
        largeurDocument: document.documentElement.scrollWidth,
        vue, petits, deborde,
        burger: rectBurger ? { l: Math.round(rectBurger.width), h: Math.round(rectBurger.height) } : null,
      };
    });

    const ou = `${chemin} @${largeur}px`;
    if (mesures.largeurDocument > mesures.vue + 1)
      echecs.push(`${ou} : débordement horizontal (${mesures.largeurDocument}px pour ${mesures.vue}px)` +
        (mesures.deborde.length ? ` — en cause : ${mesures.deborde.join(', ')}` : ''));
    if (mesures.petits)
      echecs.push(`${ou} : ${mesures.petits} champ(s) sous 16px — Safari iOS zoomera au focus`);
    if (mesures.burger && (mesures.burger.l < 44 || mesures.burger.h < 44))
      echecs.push(`${ou} : bouton du menu ${mesures.burger.l}x${mesures.burger.h}, sous la cible tactile de 44px`);
  }
  await contexte.close();
}

await navigateur.close();
serveur.close();

if (echecs.length) {
  console.error(`\n${echecs.length} problème(s) de rendu :\n`);
  for (const e of echecs) console.error(`  ✗ ${e}`);
  console.error('');
  process.exitCode = 1;
} else {
  console.log(`Rendu conforme sur ${PAGES.length} pages × ${LARGEURS.join('/')} px.`);
}
