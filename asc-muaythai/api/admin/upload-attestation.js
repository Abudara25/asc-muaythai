// api/admin/upload-attestation.js
// Upload manuel d'une attestation de paiement (PDF/JPEG/PNG) sur la fiche
// d'un adhérent, en secours de la récupération automatique via l'API
// HelloAsso (paiement introuvable côté API, réglé par un autre moyen que
// HelloAsso, etc.). Authentifié : à la différence de /api/upload-document, ce
// n'est pas un champ que l'adhérent renseigne lui-même.
import { put } from '@vercel/blob';
import { requireAuth } from './_auth.js';
import { readMultipartBody, parseMultipartParts } from '../_multipart.js';

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const EXT_BY_TYPE = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
// Les fonctions serverless Vercel plafonnent le corps des requêtes à 4,5 Mo :
// inutile d'annoncer davantage, la plateforme rejetterait la requête avant nous.
const MAX_SIZE = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  let buffer;
  try {
    buffer = await readMultipartBody(req, MAX_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (4 Mo max)' });
    }
    return res.status(400).json({ error: 'Requête invalide' });
  }

  const parts = parseMultipartParts(buffer, req.headers['content-type']);
  const file = parts.find((p) => p.name === 'document');
  if (!file || !file.data.length) return res.status(400).json({ error: 'Aucun fichier reçu' });
  if (!ALLOWED_TYPES.includes(file.contentType)) {
    return res.status(415).json({ error: 'Format non supporté (PDF, JPEG ou PNG uniquement)' });
  }
  const ext = EXT_BY_TYPE[file.contentType];

  try {
    const blob = await put(`attestations/${Date.now()}.${ext}`, file.data, {
      access: 'public',
      contentType: file.contentType,
      addRandomSuffix: true,
    });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error('upload-attestation error:', err);
    return res.status(500).json({ error: "Échec de l'envoi de l'attestation" });
  }
}
