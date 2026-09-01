// api/upload-document.js
// Reçoit un justificatif d'inscription (certificat médical, pièce d'identité,
// photo, autorisation parentale) envoyé par un adhérent depuis /inscription,
// le stocke tel quel sur Vercel Blob et renvoie son URL. Endpoint public
// (aucune authentification admin) : n'importe quel visiteur du formulaire
// d'inscription doit pouvoir l'utiliser.
import { put } from '@vercel/blob';
import { loadRateLimitState, isLocked, recordFailedLogin } from './admin/_rateLimit.js';

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

// Parseur multipart minimal : le champ fichier "document" et le champ texte "docType".
// (identique au parseur utilisé par api/admin/upload-photo.js)
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

  const result = { file: null, docType: null };
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const nameMatch = /name="([^"]*)"/.exec(header);
    if (!nameMatch) continue;

    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString('utf8') === '\r\n') body = body.slice(0, -2);

    if (nameMatch[1] === 'document') {
      const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
      result.file = {
        contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
        data: body,
      };
    } else if (nameMatch[1] === 'docType') {
      result.docType = body.toString('utf8').trim();
    }
  }
  return result.file ? result : null;
}

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
    buffer = await readBody(req);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (5 Mo max)' });
    }
    return res.status(400).json({ error: 'Requête invalide' });
  }

  const parsed = parseMultipart(buffer, req.headers['content-type']);
  if (!parsed || !parsed.file.data.length) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }
  if (!DOC_TYPES.has(parsed.docType)) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  const { file } = parsed;
  const allowed = ALLOWED_TYPES_BY_DOC[parsed.docType];
  if (!allowed.includes(file.contentType)) {
    const formats = allowed.includes('application/pdf') ? 'PDF, JPEG ou PNG' : 'JPEG ou PNG';
    return res.status(415).json({ error: `Format non supporté (${formats} uniquement)` });
  }
  const ext = EXT_BY_TYPE[file.contentType];

  try {
    // Chemin non listé publiquement nulle part sur le site : ces documents
    // (certificats médicaux, pièces d'identité) ne sont partagés que par le
    // lien envoyé dans l'email interne au club, jamais affichés sur une page.
    const blob = await put(`justificatifs/${parsed.docType}/${Date.now()}.${ext}`, file.data, {
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
