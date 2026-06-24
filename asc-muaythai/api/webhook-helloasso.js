// api/webhook-helloasso.js
// Reçoit les webhooks HelloAsso après paiement confirmé → email de confirmation Brevo
import { timingSafeEqual } from 'crypto';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const CLUB_EMAIL = "ascmuaythai95@gmail.com";

// Les comptes association classiques (par opposition aux comptes "Partenaire
// API") n'ont pas de signatureKey HMAC fournie par HelloAsso. On vérifie donc :
// 1. que la requête vient bien d'une IP HelloAsso connue ;
// 2. qu'elle contient le jeton secret HELLOASSO_WEBHOOK_TOKEN, configuré dans
//    l'URL de callback HelloAsso (ex. .../api/webhook-helloasso?key=...) —
//    cette URL n'apparaît jamais dans le code source public.
const ALLOWED_IPS = ['51.138.206.200', '4.233.135.234']; // prod + sandbox HelloAsso

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

function isValidRequest(req) {
  if (!ALLOWED_IPS.includes(getClientIp(req))) return false;

  const expectedToken = process.env.HELLOASSO_WEBHOOK_TOKEN;
  if (!expectedToken) return false;

  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('key') || '';
  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!isValidRequest(req)) {
    return res.status(401).json({ error: 'Requête non autorisée' });
  }

  try {
    const _n = new Date();
    const _ns = _n.getMonth() >= 5;
    const _d = _ns ? _n.getFullYear() : _n.getFullYear() - 1;
    const saison = `${_d}/${_d + 1}`;

    const payload = req.body;
    const eventType = payload?.eventType || payload?.data?.eventType;

    // On traite uniquement les paiements confirmés
    if (eventType !== "Payment" && eventType !== "Order") {
      return res.status(200).json({ ignored: true });
    }

    const order = payload?.data?.order || payload?.data;
    const payer = order?.payer || {};
    const prenom = escapeHtml(payer?.firstName || "Adhérent");
    const nom = escapeHtml(payer?.lastName || "");
    const email = payer?.email || "";
    const emailDisplay = escapeHtml(email);
    const montant = (order?.amount || 0) / 100; // HelloAsso envoie en centimes

    // Email de confirmation de paiement au club
    await sendEmail({
      to: [{ email: CLUB_EMAIL, name: "ASC Muay Thaï" }],
      subject: `✅ Paiement reçu — ${prenom} ${nom} (${montant}€)`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#111;padding:24px;text-align:center">
            <h1 style="color:#ee0000;font-size:28px;margin:0;letter-spacing:2px">ASC MUAY THAÏ</h1>
            <p style="color:#888;margin:4px 0 0;font-size:12px">PAIEMENT CONFIRMÉ VIA HELLOASSO</p>
          </div>
          <div style="padding:32px;background:#f9f9f9">
            <div style="padding:20px;background:#d4edda;border-left:4px solid #28a745;border-radius:4px;margin-bottom:24px">
              <strong>✅ Paiement confirmé : ${montant}€</strong>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:10px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;width:40%"><strong>Adhérent</strong></td>
                  <td style="padding:10px 0;border-bottom:1px solid #e0e0e0">${prenom} ${nom}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Email</strong></td>
                  <td style="padding:10px 0;border-bottom:1px solid #e0e0e0">${emailDisplay || "Non renseigné"}</td></tr>
              <tr><td style="padding:10px 0;color:#555;font-size:13px"><strong>Montant</strong></td>
                  <td style="padding:10px 0;font-size:18px;color:#28a745;font-weight:bold">${montant}€</td></tr>
            </table>
          </div>
          <div style="padding:16px;text-align:center;background:#111;color:#555;font-size:11px">
            ASC Muay Thaï — Webhook HelloAsso automatique
          </div>
        </div>
      `
    });

    // Email de bienvenue à l'adhérent si on a son email
    if (email) {
      await sendEmail({
        to: [{ email, name: `${prenom} ${nom}` }],
        subject: `🥊 Paiement confirmé — Bienvenue à l'ASC Muay Thaï !`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#111;padding:24px;text-align:center">
              <h1 style="color:#ee0000;font-size:28px;margin:0;letter-spacing:2px">ASC MUAY THAÏ</h1>
              <p style="color:#888;margin:4px 0 0;font-size:12px;letter-spacing:1px">BESSANCOURT — VAL D'OISE (95)</p>
            </div>
            <div style="padding:32px;background:#f9f9f9">
              <h2 style="color:#111;font-size:22px;margin:0 0 16px">Bienvenue ${prenom} ! 🥊</h2>
              <p style="color:#333;line-height:1.6">Ton paiement de <strong style="color:#ee0000">${montant}€</strong> a bien été reçu. Tu fais maintenant partie de l'ASC Muay Thaï !</p>
              <div style="margin:24px 0;padding:20px;background:#fff;border:1px solid #e0e0e0;border-radius:4px">
                <p style="margin:0 0 12px;font-weight:bold;color:#111">📋 Pour la rentrée :</p>
                <p style="margin:6px 0;color:#333">🥋 Présente-toi au dojo avec une tenue de sport</p>
                <p style="margin:6px 0;color:#333">📍 Complexe Marboulus — 21 Chemin de l'Isle, 95550 Bessancourt</p>
                <p style="margin:6px 0;color:#333">✉️ ascmuaythai95@gmail.com pour tout renseignement</p>
              </div>
              <p style="color:#555;font-size:13px">L'équipe ASC Muay Thaï</p>
            </div>
            <div style="padding:16px;text-align:center;background:#111;color:#555;font-size:11px">
              Fédération FFKMDA — Saison ${saison}
            </div>
          </div>
        `
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}

async function sendEmail({ to, subject, html }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "ASC Muay Thaï", email: "ascmuaythai95@gmail.com" },
      to,
      subject,
      htmlContent: html,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
