import { put } from '@vercel/blob';
import { requireAuth } from './_auth.js';
import { CONTENT_PATHNAME, isValidContent } from './_content.js';

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
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 30,
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
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 30,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  const { type } = req.query;

  if (type === 'article-save') {
    const { id, titre, date, extrait, contenu, image } = req.body || {};
    if (!titre || !date) return res.status(400).json({ error: 'Titre et date requis' });
    const articles = await getArticles();
    const articleId = id || `art-${Date.now()}`;
    const article = { id: articleId, titre, date, extrait: extrait || '', contenu: contenu || '', image: image || '' };
    const idx = articles.findIndex(a => a.id === articleId);
    if (idx >= 0) articles[idx] = article; else articles.push(article);
    await saveArticles(articles);
    return res.status(200).json({ success: true, id: articleId });
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
    await saveArticles(articles.filter(a => a.id !== id));
    return res.status(200).json({ success: true });
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
