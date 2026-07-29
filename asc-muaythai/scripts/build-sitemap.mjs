// Régénère sitemap.xml à partir des fichiers du site.
//   node scripts/build-sitemap.mjs
//
// Ce n'est pas une étape de build : le site reste servi tel quel. C'est un
// utilitaire à lancer après avoir modifié une page, pour que les <lastmod>
// reflètent la réalité au lieu d'être saisis à la main (et donc oubliés).
//
// Une page n'est ajoutée que si elle est réellement indexable : présente dans
// la liste ci-dessous ET sans "noindex" dans son balisage. C'est ce qui évite
// de resoumettre à Google une page qu'on vient de désindexer.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.asc-muaythai.fr';

const PAGES = [
  { fichier: 'index.html', url: '/', changefreq: 'monthly', priority: '1.0' },
  { fichier: 'inscription.html', url: '/inscription', changefreq: 'yearly', priority: '0.8' },
  { fichier: 'cours-particulier.html', url: '/cours-particulier', changefreq: 'yearly', priority: '0.7' },
  { fichier: 'actualites.html', url: '/actualites', changefreq: 'weekly', priority: '0.7' },
  { fichier: 'galerie.html', url: '/galerie', changefreq: 'monthly', priority: '0.6' },
  { fichier: 'videos.html', url: '/videos', changefreq: 'monthly', priority: '0.6' },
  { fichier: 'partenaires.html', url: '/partenaires', changefreq: 'monthly', priority: '0.6' },
];

const entrees = [];
const ignorees = [];

for (const page of PAGES) {
  const chemin = join(RACINE, page.fichier);
  const html = readFileSync(chemin, 'utf8');

  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) {
    ignorees.push(`${page.fichier} (noindex)`);
    continue;
  }

  const lastmod = statSync(chemin).mtime.toISOString().slice(0, 10);
  entrees.push(
    `  <url>\n` +
    `    <loc>${BASE}${page.url}</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    `    <changefreq>${page.changefreq}</changefreq>\n` +
    `    <priority>${page.priority}</priority>\n` +
    `  </url>`
  );
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entrees.join('\n') + '\n' +
  `</urlset>\n`;

writeFileSync(join(RACINE, 'sitemap.xml'), xml);

console.log(`sitemap.xml régénéré : ${entrees.length} URL`);
if (ignorees.length) console.log(`ignorées : ${ignorees.join(', ')}`);
