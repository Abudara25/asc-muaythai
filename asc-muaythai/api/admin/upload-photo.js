// api/admin/upload-photo.js
// Reçoit une image (multipart/form-data), la stocke sur Vercel Blob
// et renvoie son URL publique à insérer dans le palmarès.
import { put } from '@vercel/blob';
import { requireAuth } from './_auth.js';

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo

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

// Parseur multipart minimal : suffisant pour un unique champ fichier "photo".
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

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    if (!/name="photo"/.test(header)) continue;

    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
    const filenameMatch = /filename="([^"]*)"/.exec(header);
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString('utf8') === '\r\n') body = body.slice(0, -2);

    return {
      contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
      filename: filenameMatch ? filenameMatch[1] : 'photo',
      data: body,
    };
  }
  return null;
}

function extensionFor(contentType) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType] || 'jpg';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  let buffer;
  try {
    buffer = await readBody(req);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Image trop volumineuse (8 Mo max)' });
    }
    return res.status(400).json({ error: 'Requête invalide' });
  }

  const file = parseMultipart(buffer, req.headers['content-type']);
  if (!file || !file.data.length) {
    return res.status(400).json({ error: 'Aucune image reçue' });
  }
  if (!ALLOWED_TYPES.includes(file.contentType)) {
    return res.status(415).json({ error: 'Format non supporté (JPEG, PNG ou WebP uniquement)' });
  }

  try {
    const blob = await put(`photos/${Date.now()}.${extensionFor(file.contentType)}`, file.data, {
      access: 'public',
      contentType: file.contentType,
      addRandomSuffix: true,
    });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error('upload-photo error:', err);
    return res.status(500).json({ error: "Échec de l'envoi de l'image" });
  }
}
