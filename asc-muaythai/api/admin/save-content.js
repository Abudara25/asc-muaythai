import { put, del } from '@vercel/blob';
import { requireAuth } from './_auth.js';
import { CONTENT_PATHNAME, isValidContent } from './_content.js';
import { getAdherents, saveAdherents, isValidAdherent, withDefaults } from './_adherents.js';

const ADH_DOC_URL_FIELDS = ['docCertificatUrl', 'docPhotoUrl', 'docIdentiteUrl', 'docAutorisationUrl'];

// Purge effective des justificatifs (droit à l'effacement) : supprimer le seul
// enregistrement JSON ne suffit pas, les fichiers doivent disparaître aussi.
async function deleteAdherentDocs(adherent) {
  const urls = ADH_DOC_URL_FIELDS.map((f) => adherent[f]).filter(Boolean);
  await Promise.all(urls.map((url) => del(url).catch((e) => {
    console.error('Suppression justificatif ERREUR:', url, e.message);
  })));
}

const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';
const ACTUALITES_PATHNAME = 'actualites.json';
const VIDEOS_PATHNAME = 'videos.json';

async function getArticles() {
  try {
    const r = await fetch(`${BLOB_BASE}/${ACTUALITES_PATHNAME}`, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function saveArticles(articles) {
  return put(ACTUALITES_PATHNAME, JSON.stringify(articles), {
    access: 'public', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0,
  });
}

async function getVideos() {
  try {
    const r = await fetch(`${BLOB_BASE}/${VIDEOS_PATHNAME}`, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function saveVideos(videos) {
  return put(VIDEOS_PATHNAME, JSON.stringify(videos), {
    access: 'public', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0,
  });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { type } = req.query;

  // ── GET : lecture sans cache CDN (usage admin) ────────────────────────────
  if (req.method === 'GET') {
    if (type === 'articles-list') return res.status(200).json(await getArticles());
    if (type === 'videos-list')   return res.status(200).json(await getVideos());
    if (type === 'adherents') {
      const list = await getAdherents();
      list.sort((a, b) => (b.dateInscription || '').localeCompare(a.dateInscription || ''));
      return res.status(200).json(list);
    }
    return res.status(400).json({ error: 'type inconnu' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  if (type === 'adherents') {
    const { action } = req.body || {};

    if (action === 'save') {
      const incoming = req.body.adherent;
      if (!isValidAdherent(incoming)) {
        return res.status(400).json({ error: 'Adhérent invalide : nom, prénom et email requis' });
      }
      const adherent = withDefaults(incoming);
      const list = await getAdherents();
      const idx = list.findIndex((a) => a.id === adherent.id);
      if (idx >= 0) {
        // Un justificatif remplacé (nouvel upload sur un champ qui en avait
        // déjà un) ne doit pas laisser l'ancien fichier orphelin sur le stockage.
        const previous = list[idx];
        const toRemove = ADH_DOC_URL_FIELDS
          .map((f) => previous[f])
          .filter((oldUrl, i) => oldUrl && oldUrl !== adherent[ADH_DOC_URL_FIELDS[i]]);
        if (toRemove.length) {
          await Promise.all(toRemove.map((url) => del(url).catch((e) => {
            console.error('Suppression ancien justificatif ERREUR:', url, e.message);
          })));
        }
        list[idx] = adherent;
      } else {
        list.push(adherent);
      }
      await saveAdherents(list);
      return res.status(200).json({ success: true, adherent });
    }

    if (action === 'delete') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id requis' });
      const list = await getAdherents();
      const toDelete = list.find((a) => a.id === id);
      if (toDelete) await deleteAdherentDocs(toDelete);
      await saveAdherents(list.filter((a) => a.id !== id));
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'action inconnue' });
  }

  if (type === 'article-save') {
    const { id, titre, date, extrait, contenu, image } = req.body || {};
    if (!titre || !date) return res.status(400).json({ error: 'Titre et date requis' });
    const articles = await getArticles();
    const articleId = id || `art-${Date.now()}`;
    const article = { id: articleId, titre, date, extrait: extrait || '', contenu: contenu || '', image: image || '' };
    const idx = articles.findIndex(a => a.id === articleId);
    if (idx >= 0) articles[idx] = article; else articles.push(article);
    await saveArticles(articles);
    return res.status(200).json({ success: true, id: articleId, articles });
  }

  if (type === 'video-save') {
    const { id, titre, url, description } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL YouTube requise' });
    const videos = await getVideos();
    const videoId = id || `vid-${Date.now()}`;
    const video = { id: videoId, titre: titre || '', url, description: description || '', date: new Date().toISOString().slice(0, 10) };
    const idx = videos.findIndex(v => v.id === videoId);
    if (idx >= 0) videos[idx] = video; else videos.push(video);
    await saveVideos(videos);
    return res.status(200).json({ success: true, id: videoId });
  }

  if (type === 'video-delete') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id requis' });
    const videos = await getVideos();
    await saveVideos(videos.filter(v => v.id !== id));
    return res.status(200).json({ success: true });
  }

  if (type === 'article-delete') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id requis' });
    const articles = await getArticles();
    const updated = articles.filter(a => a.id !== id);
    await saveArticles(updated);
    return res.status(200).json({ success: true, articles: updated });
  }

  const content = req.body;
  if (!isValidContent(content)) return res.status(400).json({ error: 'Contenu invalide ou incomplet' });
  try {
    const blob = await put(CONTENT_PATHNAME, JSON.stringify(content, null, 2), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
    });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error('save-content error:', err);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }
}
