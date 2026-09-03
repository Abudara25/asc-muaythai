import crypto from 'crypto';
import { put, del } from '@vercel/blob';
import { requireAuth } from './_auth.js';
import { CONTENT_PATHNAME, isValidContent } from './_content.js';
import { getAdherents, saveAdherents, isValidAdherent, withDefaults, missingDocTypes, DOC_TYPE_LABELS } from './_adherents.js';

const ADH_DOC_URL_FIELDS = ['docCertificatUrl', 'docPhotoUrl', 'docIdentiteUrl', 'docAutorisationUrl', 'docAttestationUrl'];

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SITE_ORIGIN = 'https://www.asc-muaythai.fr';
const SENDER_EMAIL = 'noreply@asc-muaythai.fr';
const CLUB_EMAIL = 'ascmuaythai95@gmail.com';

const CLUB_ADRESSE = "Complexe Marboulus, 21 Chemin de l'Isle, 95550 Bessancourt";
// Pied de page présent sur les deux templates ci-dessous : un e-mail
// transactionnel avec juste un titre, un bouton et rien d'autre (pas
// d'adresse postale, pas d'équivalent texte brut) ressemble à ce que les
// filtres anti-spam associent à du phishing. Ça n'élimine pas un souci
// d'authentification de domaine côté Brevo (SPF/DKIM/DMARC), mais ça retire
// un signal de plus.
function emailFooterHtml() {
  return `<p style="color:#999;font-size:11px;margin-top:28px;border-top:1px solid #eee;padding-top:12px">ASC Muay Thaï Bessancourt — ${CLUB_ADRESSE} — <a href="mailto:${CLUB_EMAIL}" style="color:#999">${CLUB_EMAIL}</a></p>`;
}
function emailFooterText() {
  return `\n\n--\nASC Muay Thaï Bessancourt\n${CLUB_ADRESSE}\n${CLUB_EMAIL}`;
}

async function sendDocReminderEmail({ email, prenom, nom, missing, token }) {
  const link = `${SITE_ORIGIN}/completer-dossier?token=${token}`;
  const items = missing.map((t) => `<li>${DOC_TYPE_LABELS[t]}${t === 'autorisation' ? ` (<a href="${SITE_ORIGIN}/autorisation-parentale.pdf">modèle à télécharger</a>)` : ''}</li>`).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222">
      <h2 style="color:#ee0000">ASC Muay Thaï Bessancourt</h2>
      <p>Bonjour ${prenom},</p>
      <p>Il manque un ou plusieurs documents à ton dossier d'inscription :</p>
      <ul>${items}</ul>
      <p>Tu peux les envoyer directement depuis ce lien :</p>
      <p><a href="${link}" style="display:inline-block;background:#ee0000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px">Compléter mon dossier</a></p>
      <p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur : ${link}</p>
      <p>Merci,<br>ASC Muay Thaï Bessancourt</p>
      ${emailFooterHtml()}
    </div>`;
  const text = `Bonjour ${prenom},\n\nIl manque un ou plusieurs documents à ton dossier d'inscription :\n${missing.map((t) => '- ' + DOC_TYPE_LABELS[t]).join('\n')}\n\nTu peux les envoyer depuis ce lien : ${link}\n\nMerci,\nASC Muay Thaï Bessancourt${emailFooterText()}`;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'ASC Muay Thaï', email: SENDER_EMAIL },
      replyTo: { email: CLUB_EMAIL, name: 'ASC Muay Thaï' },
      to: [{ email, name: `${prenom} ${nom}` }],
      subject: 'Il manque un document à ton dossier — ASC Muay Thaï',
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!response.ok) throw new Error(`Brevo email: ${await response.text()}`);
}

async function sendRenewalEmail({ email, prenom, nom, token }) {
  const link = `${SITE_ORIGIN}/inscription?renew=${token}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222">
      <h2 style="color:#ee0000">ASC Muay Thaï Bessancourt</h2>
      <p>Bonjour ${prenom},</p>
      <p>La nouvelle saison démarre ! Pour réinscrire ${prenom}, utilise ce lien : le formulaire reprend automatiquement ce qu'on a déjà (nom, coordonnées, section, et les documents encore valables) — il ne reste que le certificat médical à jour et les infos qui ont pu changer.</p>
      <p><a href="${link}" style="display:inline-block;background:#ee0000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px">Réinscrire ${prenom}</a></p>
      <p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur : ${link}</p>
      <p>Merci,<br>ASC Muay Thaï Bessancourt</p>
      ${emailFooterHtml()}
    </div>`;
  const text = `Bonjour ${prenom},\n\nLa nouvelle saison démarre ! Pour réinscrire ${prenom}, utilise ce lien : ${link}\nLe formulaire reprend automatiquement ce qu'on a déjà ; il ne reste que le certificat médical à jour et les infos qui ont pu changer.\n\nMerci,\nASC Muay Thaï Bessancourt${emailFooterText()}`;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'ASC Muay Thaï', email: SENDER_EMAIL },
      replyTo: { email: CLUB_EMAIL, name: 'ASC Muay Thaï' },
      to: [{ email, name: `${prenom} ${nom}` }],
      subject: 'Réinscription — nouvelle saison à l\'ASC Muay Thaï',
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!response.ok) throw new Error(`Brevo email: ${await response.text()}`);
}

// Mute l'adhérent (jeton + date de relance) et envoie l'e-mail ; n'écrit rien
// sur le blob elle-même, à l'appelant de sauvegarder la liste une fois toutes
// les relances de l'appel en cours traitées (voir "send-doc-link-bulk").
async function sendReminderFor(adherent) {
  const missing = missingDocTypes(adherent);
  if (!missing.length) return { ok: false, status: 400, error: 'Aucun document manquant pour cet adhérent' };
  if (!adherent.email) return { ok: false, status: 400, error: "Cet adhérent n'a pas d'adresse e-mail" };

  const token = crypto.randomBytes(24).toString('hex');
  try {
    await sendDocReminderEmail({ email: adherent.email, prenom: adherent.prenom, nom: adherent.nom, missing, token });
  } catch (e) {
    console.error('Envoi relance documents ERREUR:', e.message);
    return { ok: false, status: 502, error: "L'e-mail n'a pas pu être envoyé" };
  }
  adherent.docsToken = token;
  adherent.docsRelanceEnvoyeeLe = new Date().toISOString().slice(0, 10);
  return { ok: true, missing };
}

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

    if (action === 'send-doc-link') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id requis' });
      const list = await getAdherents();
      const adherent = list.find((a) => a.id === id);
      if (!adherent) return res.status(404).json({ error: 'Adhérent introuvable' });

      const result = await sendReminderFor(adherent);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      await saveAdherents(list);
      return res.status(200).json({ success: true, missing: result.missing, docsRelanceEnvoyeeLe: adherent.docsRelanceEnvoyeeLe });
    }

    // Relance groupée : une seule lecture/écriture du blob pour tous les
    // adhérents ciblés, plutôt que N requêtes individuelles qui se
    // marcheraient dessus (chaque écriture réécrit la liste entière).
    if (action === 'send-doc-link-bulk') {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids requis' });
      const list = await getAdherents();
      const sent = [];
      const failed = [];
      for (const id of ids) {
        const adherent = list.find((a) => a.id === id);
        if (!adherent) { failed.push({ id, error: 'Adhérent introuvable' }); continue; }
        const result = await sendReminderFor(adherent);
        if (result.ok) sent.push({ id, docsRelanceEnvoyeeLe: adherent.docsRelanceEnvoyeeLe });
        else failed.push({ id, error: result.error });
      }
      if (sent.length) await saveAdherents(list);
      return res.status(200).json({ success: true, sent, failed });
    }

    if (action === 'send-renewal-link') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id requis' });
      const list = await getAdherents();
      const adherent = list.find((a) => a.id === id);
      if (!adherent) return res.status(404).json({ error: 'Adhérent introuvable' });
      if (!adherent.email) return res.status(400).json({ error: "Cet adhérent n'a pas d'adresse e-mail" });

      const token = crypto.randomBytes(24).toString('hex');
      try {
        await sendRenewalEmail({ email: adherent.email, prenom: adherent.prenom, nom: adherent.nom, token });
      } catch (e) {
        console.error('Envoi lien de réinscription ERREUR:', e.message);
        return res.status(502).json({ error: "L'e-mail n'a pas pu être envoyé" });
      }
      adherent.renewalToken = token;
      await saveAdherents(list);
      return res.status(200).json({ success: true });
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
