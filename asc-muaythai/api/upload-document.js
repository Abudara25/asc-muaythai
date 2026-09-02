// api/upload-document.js
// Reçoit un justificatif d'inscription (certificat médical, pièce d'identité,
// photo, autorisation parentale) envoyé par un adhérent depuis /inscription,
// le stocke tel quel sur Vercel Blob et renvoie son URL. Endpoint public
// (aucune authentification admin) : n'importe quel visiteur du formulaire
// d'inscription doit pouvoir l'utiliser.
import { put } from '@vercel/blob';
import { loadRateLimitState, isLocked, recordFailedLogin } from './admin/_rateLimit.js';
import { readMultipartBody, parseMultipartParts } from './_multipart.js';

export const config = { api: { bodyParser: false } };

// Endpoint public (aucune authentification) : n'importe qui peut y poster un
// fichier. Sans limite, il pourrait servir à stocker gratuitement des fichiers
// arbitraires sur notre Blob ou à en épuiser le quota. 30 envois / 15 min par
// IP couvre largement une famille qui inscrit plusieurs enfants.
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const UPLOAD_MAX = 30;

const EXT_BY_TYPE = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
// La photo d'identité doit être une vraie photo, pas un PDF (le champ file
// côté client le limite déjà via l'attribut accept, mais accept n'est qu'une
// suggestion d'UI — un client qui l'ignore ne doit pas pouvoir passer un PDF
// pour ce champ). Les autres documents (certificat, pièce d'identité,
// autorisation parentale) sont classiquement des scans PDF ou des photos.
const ALLOWED_TYPES_BY_DOC = {
  certificat: ['application/pdf', 'image/jpeg', 'image/png'],
  photo: ['image/jpeg', 'image/png'],
  identite: ['application/pdf', 'image/jpeg', 'image/png'],
  autorisation: ['application/pdf', 'image/jpeg', 'image/png'],
};
// Les fonctions serverless Vercel plafonnent le corps des requêtes à 4,5 Mo :
// inutile d'annoncer davantage, la plateforme rejetterait la requête avant nous.
const MAX_SIZE = 4 * 1024 * 1024;

const DOC_TYPES = new Set(Object.keys(ALLOWED_TYPES_BY_DOC));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const rateLimit = await loadRateLimitState(req, 'upload-document');
  const waitMin = isLocked(rateLimit, UPLOAD_MAX);
  if (waitMin) {
    return res.status(429).json({ error: `Trop d'envois. Réessaie dans ${waitMin} min.` });
  }
  await recordFailedLogin(rateLimit, UPLOAD_WINDOW_MS);

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
  const docType = parts.find((p) => p.name === 'docType')?.data.toString('utf8').trim();
  if (!file || !file.data.length) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }
  if (!DOC_TYPES.has(docType)) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  const allowed = ALLOWED_TYPES_BY_DOC[docType];
  if (!allowed.includes(file.contentType)) {
    const formats = allowed.includes('application/pdf') ? 'PDF, JPEG ou PNG' : 'JPEG ou PNG';
    return res.status(415).json({ error: `Format non supporté (${formats} uniquement)` });
  }
  const ext = EXT_BY_TYPE[file.contentType];

  try {
    // Chemin non listé publiquement nulle part sur le site : ces documents
    // (certificats médicaux, pièces d'identité) ne sont partagés que par le
    // lien envoyé dans l'email interne au club, jamais affichés sur une page.
    const blob = await put(`justificatifs/${docType}/${Date.now()}.${ext}`, file.data, {
      access: 'public',
      contentType: file.contentType,
      addRandomSuffix: true,
    });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error('upload-document error:', err);
    return res.status(500).json({ error: "Échec de l'envoi du document" });
  }
}
