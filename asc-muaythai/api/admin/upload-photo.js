// api/admin/upload-photo.js
// Reçoit une image (multipart/form-data), la redimensionne et la convertit
// en WebP, la stocke sur Vercel Blob et renvoie son URL publique.
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { requireAuth } from './_auth.js';
import { readMultipartBody, parseMultipartParts } from '../_multipart.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  let buffer;
  try {
    buffer = await readMultipartBody(req, MAX_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Image trop volumineuse (4 Mo max après réduction)' });
    }
    return res.status(400).json({ error: 'Requête invalide' });
  }

  const parts = parseMultipartParts(buffer, req.headers['content-type']);
  const file = parts.find((p) => p.name === 'photo');
  const presetName = parts.find((p) => p.name === 'preset')?.data.toString('utf8').trim();
  if (!file || !file.data.length) {
    return res.status(400).json({ error: 'Aucune image reçue' });
  }
  if (!ALLOWED_TYPES.includes(file.contentType)) {
    return res.status(415).json({ error: 'Format non supporté (JPEG, PNG ou WebP uniquement)' });
  }

  // Object.hasOwn et pas un simple PRESETS[x] : "constructor" ou "__proto__"
  // renverraient une valeur héritée truthy, et le redimensionnement sauterait.
  const preset = Object.hasOwn(PRESETS, presetName) ? PRESETS[presetName] : PRESETS.photo;

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
