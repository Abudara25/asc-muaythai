// api/admin/delete-photo.js
// Supprime une photo du palmarès stockée sur Vercel Blob.
import { del } from '@vercel/blob';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  const { url } = req.body || {};
  if (typeof url !== 'string' || !url.includes('.public.blob.vercel-storage.com/photos/')) {
    return res.status(400).json({ error: 'URL invalide' });
  }

  try {
    await del(url);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('delete-photo error:', err);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }
}
