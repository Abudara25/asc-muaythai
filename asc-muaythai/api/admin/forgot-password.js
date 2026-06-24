// api/admin/forgot-password.js
import { put } from '@vercel/blob';
import { randomBytes } from 'crypto';
import { secretPathname } from './_auth.js';

const TOKEN_PATHNAME = secretPathname('reset-token');
const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';
const SENDER_EMAIL = 'noreply@asc-muaythai.fr';
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1h
const COOLDOWN_MS = 5 * 60 * 1000;      // 5 min entre deux envois

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // Anti-spam : bloquer si un token a été généré il y a moins de 5 min
  try {
    const existing = await fetch(`${BLOB_BASE}/${TOKEN_PATHNAME}`, { cache: 'no-store' });
    if (existing.ok) {
      const { expiresAt } = await existing.json();
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() > TOKEN_EXPIRY_MS - COOLDOWN_MS) {
        return res.status(429).json({ error: 'Un e-mail a déjà été envoyé. Attends quelques minutes avant de réessayer.' });
      }
    }
  } catch {}

  // Récupérer l'e-mail admin depuis content.json (coordonnées)
  let adminEmail;
  try {
    const r = await fetch(`${BLOB_BASE}/content.json`, { cache: 'no-store' });
    const content = await r.json();
    adminEmail = content?.contact?.email;
  } catch {}

  if (!adminEmail) {
    return res.status(500).json({ error: "Impossible de récupérer l'adresse e-mail de l'admin." });
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

  await put(TOKEN_PATHNAME, JSON.stringify({ token, expiresAt }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const resetUrl = `https://www.asc-muaythai.fr/admin?reset=${token}`;

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
