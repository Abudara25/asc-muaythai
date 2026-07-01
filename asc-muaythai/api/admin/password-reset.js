// Gère mot de passe oublié (pas de token dans le body) et réinitialisation (token présent)
import { put, del } from '@vercel/blob';
import { randomBytes, timingSafeEqual } from 'crypto';
import { storePassword, secretPathname } from './_auth.js';

const TOKEN_PATHNAME = secretPathname('reset-token');
const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';
const SENDER_EMAIL = 'noreply@asc-muaythai.fr';
const TOKEN_EXPIRY_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, newPassword } = req.body || {};

  // ── Réinitialisation (token présent dans le body) ───────────────────────────
  if (token) {
    if (typeof token !== 'string') return res.status(400).json({ error: 'Lien invalide ou expiré' });
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
    }

    let stored;
    try {
      const r = await fetch(`${BLOB_BASE}/${TOKEN_PATHNAME}`, { cache: 'no-store' });
      if (!r.ok) return res.status(400).json({ error: 'Lien invalide ou expiré' });
      stored = await r.json();
    } catch {
      return res.status(400).json({ error: 'Lien invalide ou expiré' });
    }

    if (!stored.token || !stored.expiresAt || Date.now() > stored.expiresAt) {
      return res.status(400).json({ error: 'Ce lien a expiré. Fais une nouvelle demande.' });
    }

    const a = Buffer.from(token);
    const b = Buffer.from(stored.token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(400).json({ error: 'Lien invalide ou expiré' });
    }

    await storePassword(newPassword);
    await del(`${BLOB_BASE}/${TOKEN_PATHNAME}`).catch(() => {});
    return res.status(200).json({ success: true });
  }

  // ── Mot de passe oublié (pas de token) ─────────────────────────────────────
  try {
    const existing = await fetch(`${BLOB_BASE}/${TOKEN_PATHNAME}`, { cache: 'no-store' });
    if (existing.ok) {
      const { expiresAt } = await existing.json();
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() > TOKEN_EXPIRY_MS - COOLDOWN_MS) {
        return res.status(429).json({ error: 'Un e-mail a déjà été envoyé. Attends quelques minutes avant de réessayer.' });
      }
    }
  } catch {}

  let adminEmail;
  try {
    const r = await fetch(`${BLOB_BASE}/content.json`, { cache: 'no-store' });
    const content = await r.json();
    adminEmail = content?.contact?.email;
  } catch {}

  if (!adminEmail) {
    return res.status(500).json({ error: "Impossible de récupérer l'adresse e-mail de l'admin." });
  }

  const resetToken = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

  await put(TOKEN_PATHNAME, JSON.stringify({ token: resetToken, expiresAt }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const resetUrl = `https://www.asc-muaythai.fr/admin?reset=${resetToken}`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'ASC Muay Thaï', email: SENDER_EMAIL },
      to: [{ email: adminEmail }],
      subject: 'Réinitialisation de ton mot de passe — ASC Muay Thaï Admin',
      htmlContent: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#ee0000">Réinitialisation du mot de passe</h2>
          <p>Tu as demandé à réinitialiser le mot de passe de l'espace administration du site ASC Muay Thaï.</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}" style="background:#ee0000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">
              Réinitialiser mon mot de passe
            </a>
          </p>
          <p style="color:#888;font-size:13px">Ce lien est valable <strong>1 heure</strong>. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
        </div>
      `,
    }),
  }).catch((err) => console.error('Brevo error:', err));

  return res.status(200).json({ success: true });
}
