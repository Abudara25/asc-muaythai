// api/admin/save-content.js
// Écrit le contenu éditable du site (coordonnées, horaires, tarifs, palmarès)
// dans un unique fichier JSON public sur Vercel Blob, lu directement par le site.
import { put } from '@vercel/blob';
import { requireAuth } from './_auth.js';
import { CONTENT_PATHNAME, isValidContent } from './_content.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  const content = req.body;
  if (!isValidContent(content)) {
    return res.status(400).json({ error: 'Contenu invalide ou incomplet' });
  }

  try {
    const blob = await put(CONTENT_PATHNAME, JSON.stringify(content, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error('save-content error:', err);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }
}
