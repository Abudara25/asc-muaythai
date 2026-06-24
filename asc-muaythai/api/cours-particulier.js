const BREVO_API_KEY = process.env.BREVO_API_KEY;
const CLUB_EMAIL = "ascmuaythai95@gmail.com";
const SENDER_EMAIL = "noreply@asc-muaythai.fr";
const SITE_ORIGIN = "https://www.asc-muaythai.fr";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", SITE_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  let { prenom, nom, email, telephone, niveau, dispos, objectif } = req.body;

  if (!prenom || !nom || !email || !telephone) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }

  prenom = escapeHtml(prenom);
  nom = escapeHtml(nom);
  telephone = escapeHtml(telephone);
  niveau = escapeHtml(niveau);
  objectif = escapeHtml(objectif);
  const emailDisplay = escapeHtml(email);

  const disposText = escapeHtml(Array.isArray(dispos) && dispos.length > 0 ? dispos.join(", ") : "Non précisé");

  try {
    await sendEmail({
      to: [{ email: CLUB_EMAIL, name: "ASC Muay Thaï" }],
      subject: `🥊 Demande de cours particulier — ${prenom} ${nom.toUpperCase()}`,
      html: buildClubEmail({ prenom, nom, email: emailDisplay, telephone, niveau, disposText, objectif })
    });

    await sendEmail({
      to: [{ email, name: `${prenom} ${nom}` }],
      subject: `🥊 Votre demande de cours particulier — ASC Muay Thaï`,
      html: buildMemberEmail({ prenom, niveau, disposText, objectif })
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Erreur cours particulier:", err);
    return res.status(500).json({ error: "Erreur lors de l'envoi de la demande" });
  }
}

async function sendEmail({ to, subject, html }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "ASC Muay Thaï", email: SENDER_EMAIL },
      replyTo: { email: CLUB_EMAIL, name: "ASC Muay Thaï" },
      to,
      subject,
      htmlContent: html
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo email: ${err}`);
  }
  return response.json();
}

function buildClubEmail({ prenom, nom, email, telephone, niveau, disposText, objectif }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#111;padding:24px;text-align:center">
        <h1 style="color:#ee0000;font-size:26px;margin:0;letter-spacing:2px">ASC MUAY THAÏ</h1>
        <p style="color:#888;margin:4px 0 0;font-size:12px;letter-spacing:1px">DEMANDE DE COURS PARTICULIER</p>
      </div>
      <div style="padding:32px;background:#f9f9f9;border:1px solid #e0e0e0">
        <h3 style="color:#ee0000;border-bottom:2px solid #ee0000;padding-bottom:6px;margin-top:0;">Coordonnées</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;width:40%"><strong>Nom complet</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px"><strong>${nom.toUpperCase()} ${prenom}</strong></td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Email</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px"><a href="mailto:${email}" style="color:#ee0000">${email}</a></td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Téléphone</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px"><a href="tel:${telephone}" style="color:#ee0000">${telephone}</a></td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Niveau</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${niveau || "Non précisé"}</td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:13px"><strong>Disponibilités</strong></td><td style="padding:8px 0;font-size:14px">${disposText}</td></tr>
        </table>
        ${objectif ? `<div style="padding:16px;background:#fff;border:1px solid #e0e0e0;border-radius:4px"><strong>Objectif / Message :</strong><p style="margin:8px 0 0;font-size:14px;white-space:pre-line;color:#333">${objectif}</p></div>` : ""}
      </div>
      <div style="padding:16px;text-align:center;background:#111;color:#555;font-size:11px">ASC Muay Thaï — Complexe Marboulus, 21 Chemin de l'Isle, 95550 Bessancourt<br>Siège social : 175 rue Général de Gaulle, 95370 Montigny-lès-Cormeilles — SIRET : 991 686 460 00015</div>
    </div>`;
}

function buildMemberEmail({ prenom, niveau, disposText, objectif }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#111;padding:24px;text-align:center">
        <h1 style="color:#ee0000;font-size:28px;margin:0;letter-spacing:2px">ASC MUAY THAÏ</h1>
        <p style="color:#888;margin:4px 0 0;font-size:12px;letter-spacing:1px">BESSANCOURT — VAL D'OISE (95)</p>
      </div>
      <div style="padding:32px;background:#f9f9f9;border:1px solid #e0e0e0">
        <h2 style="color:#111;font-size:22px;margin:0 0 16px">Bonjour ${prenom} 👋</h2>
        <p style="color:#333;line-height:1.6;margin-bottom:20px">Votre demande de cours particulier a bien été reçue ! Nous vous contacterons dans les plus brefs délais pour convenir d'un rendez-vous.</p>
        <div style="margin:24px 0;padding:20px;background:#fff;border:1px solid #e0e0e0;border-radius:4px">
          <p style="margin:0 0 8px;font-size:13px;color:#555;text-transform:uppercase"><strong>Récapitulatif de votre demande</strong></p>
          <p style="margin:6px 0">📌 Niveau : <strong>${niveau || "Non précisé"}</strong></p>
          <p style="margin:6px 0">📅 Disponibilités : <strong>${disposText}</strong></p>
          ${objectif ? `<p style="margin:6px 0">💬 Objectif : <em style="color:#555">${objectif}</em></p>` : ""}
        </div>
        <div style="padding:16px;background:#f1f3f5;border-radius:4px;font-size:13px;color:#666;">
          <strong>📧 Pour nous contacter :</strong><br><br>
          ✉️ <a href="mailto:ascmuaythai95@gmail.com" style="color:#ee0000">ascmuaythai95@gmail.com</a>
        </div>
      </div>
      <div style="padding:16px;text-align:center;background:#111;color:#555;font-size:11px">ASC Muay Thaï — Complexe Marboulus, 21 Chemin de l'Isle, 95550 Bessancourt<br>Siège social : 175 rue Général de Gaulle, 95370 Montigny-lès-Cormeilles — SIRET : 991 686 460 00015</div>
    </div>`;
}
