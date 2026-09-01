// api/admin/upload-photo.js
// Reçoit une image (multipart/form-data), la redimensionne et la convertit
// en WebP, la stocke sur Vercel Blob et renvoie son URL publique.
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { requireAuth } from './_auth.js';

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Les fonctions serverless Vercel plafonnent le corps des requêtes à 4,5 Mo :
// inutile d'annoncer davantage, la plateforme rejetterait la requête avant nous.
// L'admin réduit déjà les images dans le navigateur, on ne devrait jamais s'en approcher.
const MAX_SIZE = 4 * 1024 * 1024;

// Chaque usage a ses contraintes d'affichage : inutile de stocker du 4000 px
// pour un logo affiché en 120 px de large.
const PRESETS = {
  photo: { maxWidth: 1600, maxHeight: 1600, quality: 80 }, // galerie, palmarès, actualités
  logo: { maxWidth: 400, maxHeight: 400, quality: 85 },    // logos partenaires
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Parseur multipart minimal : le champ fichier "photo" et le champ texte "preset".
function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  const boundary = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]);
  if (!boundary) return null;

  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    const next = buffer.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    parts.push(buffer.slice(start + delimiter.length, next));
    start = next;
  }

  const result = { file: null, preset: null };
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const nameMatch = /name="([^"]*)"/.exec(header);
    if (!nameMatch) continue;

    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString('utf8') === '\r\n') body = body.slice(0, -2);

    if (nameMatch[1] === 'photo') {
      const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
      const filenameMatch = /filename="([^"]*)"/.exec(header);
      result.file = {
        contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
        filename: filenameMatch ? filenameMatch[1] : 'photo',
        data: body,
      };
    } else if (nameMatch[1] === 'preset') {
      result.preset = body.toString('utf8').trim();
    }
  }
  return result.file ? result : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  let buffer;
  try {
    buffer = await readBody(req);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Image trop volumineuse (4 Mo max après réduction)' });
    }
    return res.status(400).json({ error: 'Requête invalide' });
  }

  const parsed = parseMultipart(buffer, req.headers['content-type']);
  if (!parsed || !parsed.file.data.length) {
    return res.status(400).json({ error: 'Aucune image reçue' });
  }
  const { file } = parsed;
  if (!ALLOWED_TYPES.includes(file.contentType)) {
    return res.status(415).json({ error: 'Format non supporté (JPEG, PNG ou WebP uniquement)' });
  }

  // Object.hasOwn et pas un simple PRESETS[x] : "constructor" ou "__proto__"
  // renverraient une valeur héritée truthy, et le redimensionnement sauterait.
  const preset = Object.hasOwn(PRESETS, parsed.preset) ? PRESETS[parsed.preset] : PRESETS.photo;

  let optimized;
  try {
    optimized = await sharp(file.data)
      // .rotate() sans argument applique l'orientation EXIF : sans lui, les photos
      // prises en portrait au téléphone s'afficheraient couchées une fois les
      // métadonnées supprimées par le ré-encodage.
      .rotate()
      .resize(preset.maxWidth, preset.maxHeight, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: preset.quality })
      .toBuffer();
  } catch (err) {
    console.error('upload-photo: traitement impossible', err);
    return res.status(400).json({ error: "Fichier illisible ou image corrompue" });
  }

  try {
    const blob = await put(`photos/${Date.now()}.webp`, optimized, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: true,
    });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error('upload-photo error:', err);
    return res.status(500).json({ error: "Échec de l'envoi de l'image" });
  }
}
