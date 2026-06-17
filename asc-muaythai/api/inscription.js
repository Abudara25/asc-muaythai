// api/inscription.js
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Saison automatique : nouvelle saison à partir du 15 juin
const _now = new Date();
const _newSeason = _now.getMonth() >= 5;
const _debut = _newSeason ? _now.getFullYear() : _now.getFullYear() - 1;
const SAISON = `${_debut}/${_debut + 1}`;
const CLUB_EMAIL = "ascmuaythai95@gmail.com";
const SENDER_EMAIL = "noreply@asc-muaythai.fr";
const HELLOASSO_URL = "https://www.helloasso.com/associations/association-sportive-citoyenne-asc-muay-thai";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const {
    nouveau, dejaPratique, prenom, nom, sexe, naissanceDate, naissanceLieu,
    profession, adresse, ville, whatsapp, email, telephone, section, reglement, hasPassSport: rawPassSport, message,
    acceptReglement, acceptDroitImage
  } = req.body;

  if (!prenom || !nom || !email || !telephone || !naissanceDate || !naissanceLieu || !adresse || !ville) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  let baseTarif = 290;
  if (section && section.includes("Enfants")) baseTarif = 250;

  const hasPassSport = rawPassSport === true && section.includes("Ados");
  const montant = baseTarif - (hasPassSport ? 70 : 0);

  const reglementLabels = {
    "HelloAsso": "Paiement en ligne (HelloAsso)",
    "PassSport": "Pass'Sport (Réduction 70€ appliquée)",
    "Virement": "Virement bancaire",
    "Cheque": "Chèque bancaire (3x possible)",
    "Especes": "Espèces"
  };
  const reglementText = reglementLabels[reglement] || reglement;


  try {
    // 1. Email au CLUB
    await sendEmail({
      to: [{ email: CLUB_EMAIL, name: "ASC Muay Thaï" }],
      subject: `🥊 Dossier d'inscription — ${prenom} ${nom.toUpperCase()}`,
      html: buildClubEmail({ prenom, nom, sexe, naissanceDate, naissanceLieu, profession, adresse, ville, telephone, email, whatsapp, section, reglementText, montant, nouveau, dejaPratique, acceptDroitImage, message })
    });

    // 2. Email à L'ADHÉRENT
    const instructionsHtml = buildPaymentInstructions(reglement, montant, prenom, nom, hasPassSport);
    let pdfAttachment = null;
    try {
      const pdfBase64 = await generateMemberPDF({ prenom, nom, sexe, naissanceDate, naissanceLieu, profession, adresse, ville, telephone, email, whatsapp, section, reglement, montant, hasPassSport, acceptDroitImage, message, reglementText });
      pdfAttachment = [{ name: `inscription-${prenom}-${nom}-ASC-MuayThai.pdf`, content: pdfBase64 }];
    } catch(e) {
      console.error("PDF generation error:", e.message);
    }
    await sendEmail({
      to: [{ email, name: `${prenom} ${nom}` }],
      subject: `🥊 Confirmation d'inscription — ASC Muay Thaï Bessancourt`,
      html: buildMemberEmail({ prenom, nom, section, reglementText, montant, instructionsHtml, reglement }),
      attachment: pdfAttachment
    });

    // 3. Enregistrer dans Brevo Contacts (non-bloquant)
    try {
      await saveBrevoContact({ prenom, nom, email, telephone, section, montant, reglement, ville, hasPassSport });
      console.log("Brevo contact créé:", email);
    } catch(e) {
      console.error("Brevo Contacts ERREUR:", e.message);
    }

    return res.status(200).json({
      success: true,
      hasPassSport,
      helloassoUrl: reglement === "HelloAsso" ? HELLOASSO_URL : null,
      montant
    });

  } catch (err) {
    console.error("Erreur inscription:", err);
    return res.status(500).json({ error: "Erreur traitement inscription" });
  }
}

// ─── BREVO CONTACTS ───────────────────────────────────────────────────────────
async function saveBrevoContact({ prenom, nom, email, telephone, section, montant, reglement, ville, hasPassSport }) {
  const today = new Date().toISOString().split("T")[0];

  // Convertit 06... / 07... en +336... / +337... pour Brevo SMS
  const smsFormatted = telephone
    ? telephone.replace(/\s/g, "").replace(/^0/, "+33")
    : undefined;

  const fullAttributes = {
    NOM: nom,
    PRENOM: prenom,
    SMS: smsFormatted,
    CITY: ville,
    ASC_SECTION: section,
    ASC_MONTANT: montant,
    ASC_REGLEMENT: reglement,
    ASC_SAISON: SAISON,
    ASC_STATUT: "En attente",
    ASC_PASS_SPORT: hasPassSport ? true : false,
    ASC_DATE_INSCRIPTION: today
  };

  const baseAttributes = {
    NOM: nom,
    PRENOM: prenom,
    SMS: smsFormatted,
    CITY: ville
  };

  // Essaie d'abord avec tous les attributs
  let response = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
    body: JSON.stringify({ email, updateEnabled: true, listIds: [4], attributes: fullAttributes })
  });

  // Si erreur (attributs custom manquants), réessaie avec les attributs de base uniquement
  if (!response.ok) {
    const errText = await response.text();
    console.warn("Brevo full attributes failed, retrying with base:", errText);
    response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
      body: JSON.stringify({ email, updateEnabled: true, listIds: [4], attributes: baseAttributes })
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Brevo Contacts: ${err}`);
    }
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function generateMemberPDF({ prenom, nom, sexe, naissanceDate, naissanceLieu, profession, adresse, ville, telephone, email, whatsapp, section, reglement, montant, hasPassSport, acceptDroitImage, message, reglementText }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const RED   = rgb(0.93, 0, 0);
  const DARK  = rgb(0.086, 0.086, 0.086);
  const GRAY  = rgb(0.43, 0.43, 0.43);
  const LGRAY = rgb(0.96, 0.96, 0.96);
  const WHITE = rgb(1, 1, 1);
  const LINE  = rgb(0.85, 0.85, 0.85);

  const W  = 595.28;
  const H  = 841.89;
  const ML = 40;
  const MR = 40;
  const C2 = 240;

  // En-tete
  page.drawRectangle({ x: 0, y: H - 56, width: W, height: 56, color: DARK });
  page.drawRectangle({ x: 0, y: H - 58, width: W, height: 2,  color: RED  });
  page.drawText('ASC MUAY THAI', { x: ML, y: H - 28, size: 20, font: bold,    color: RED });
  page.drawText(`FICHE D'INSCRIPTION - SAISON ${SAISON}`, { x: ML, y: H - 44, size: 8, font: regular, color: rgb(0.7, 0.7, 0.7) });
  page.drawText('Complexe Marboulus - 21 Chemin de l\'Isle - 95550 Bessancourt', { x: 310, y: H - 30, size: 7, font: regular, color: rgb(0.55, 0.55, 0.55) });
  page.drawText('+33 7 75 70 77 13  |  ascmuaythai95@gmail.com', { x: 310, y: H - 42, size: 7, font: regular, color: rgb(0.55, 0.55, 0.55) });

  let y = H - 70;

  const sec = (title) => {
    page.drawRectangle({ x: ML, y: y - 14, width: W - ML - MR, height: 14, color: RED });
    page.drawText(title, { x: ML + 6, y: y - 10, size: 8, font: bold, color: WHITE });
    y -= 22;
  };

  const row = (label, value) => {
    const val = String(value || '-').slice(0, 65);
    page.drawText(label, { x: ML + 4, y, size: 7,   font: regular, color: GRAY });
    page.drawText(val,   { x: C2,     y, size: 8,   font: bold,    color: DARK });
    page.drawLine({ start: { x: ML, y: y - 3 }, end: { x: W - MR, y: y - 3 }, thickness: 0.3, color: LINE });
    y -= 13;
  };

  const rl = { HelloAsso: 'Paiement en ligne (HelloAsso)', Virement: 'Virement bancaire', Cheque: 'Cheque (3x possible)', Especes: 'Especes' };

  sec('1. PROFIL ADHERENT');
  row('Nom complet', `${nom.toUpperCase()} ${prenom}`);
  row('Sexe', sexe === 'F' ? 'Feminin' : 'Masculin');
  row('Date et lieu de naissance', `Le ${naissanceDate} a ${naissanceLieu}`);
  row('Profession', profession || 'Non renseignee');
  y -= 4;

  sec('2. COORDONNEES');
  row('Adresse', adresse);
  row('Ville & Code Postal', ville);
  row('Telephone', telephone);
  row('Email', email);
  row('Groupe WhatsApp', whatsapp);
  y -= 4;

  sec('3. DOCUMENTS A APPORTER (1ere seance)');
  row('Certificat medical', 'A apporter');
  row("Photo d'identite", 'A apporter');
  row("Piece d'identite", 'A apporter');
  row('Autorisation parentale', 'A apporter si mineur');
  row('Reglement interieur', 'Lu et approuve');
  row("Droit a l'image", acceptDroitImage ? 'Accepte' : 'Refuse');
  y -= 4;

  sec('4. SECTION & COTISATION');
  row('Section demandee', section);
  row('Mode de reglement', rl[reglement] || reglement);
  row("Pass'Sport", hasPassSport ? 'Oui - reduction 70 EUR' : 'Non');
  y -= 6;

  // Montant
  page.drawRectangle({ x: ML, y: y - 22, width: W - ML - MR, height: 22, color: rgb(1, 0.95, 0.95), borderColor: RED, borderWidth: 0.8 });
  page.drawText('MONTANT TOTAL DU', { x: ML + 8, y: y - 9,  size: 7.5, font: regular, color: GRAY });
  page.drawText(`${montant} EUR`,    { x: C2,     y: y - 17, size: 16,  font: bold,    color: RED  });
  y -= 36;

  // Message
  if (message && message.trim()) {
    y -= 4;
    sec('INFORMATIONS COMPLEMENTAIRES');
    const words = message.replace(/[^\x20-\x7E\xC0-\xFF]/g, '').split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(test, 8) > W - ML - MR - 12) {
        if (line) { page.drawText(line, { x: ML + 4, y, size: 8, font: regular, color: DARK }); y -= 11; }
        line = word;
      } else { line = test; }
    }
    if (line) { page.drawText(line, { x: ML + 4, y, size: 8, font: regular, color: DARK }); y -= 11; }
    y -= 4;
  }

  // Signatures
  y -= 10;
  page.drawText('SIGNATURES', { x: ML, y, size: 8, font: bold, color: DARK });
  y -= 8;
  const sigW = (W - ML - MR - 10) / 2;
  const sigH = 45;
  page.drawRectangle({ x: ML,           y: y - sigH, width: sigW, height: sigH, color: LGRAY, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
  page.drawText("Signature de l'adherent",       { x: ML + 5,           y: y - 12, size: 7,   font: regular, color: GRAY });
  page.drawText('(precedee de "Lu et approuve")', { x: ML + 5,           y: y - 22, size: 6.5, font: regular, color: GRAY });
  page.drawRectangle({ x: ML + sigW + 10, y: y - sigH, width: sigW, height: sigH, color: LGRAY, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
  page.drawText('Cachet et signature du club',    { x: ML + sigW + 15,   y: y - 12, size: 7,   font: regular, color: GRAY });
  page.drawText('Date :  ___ / ___ / ________',  { x: ML + sigW + 15,   y: y - 22, size: 7,   font: regular, color: GRAY });

  // Footer
  page.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: DARK });
  page.drawRectangle({ x: 0, y: 22, width: W, height: 1.5, color: RED });
  page.drawText(
    `Document genere le ${new Date().toLocaleDateString('fr-FR')} - ASC Muay Thai Bessancourt - SIRET : 991 686 460 00015 - Federation FFKMDA`,
    { x: ML, y: 8, size: 6, font: regular, color: rgb(0.5, 0.5, 0.5) }
  );

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString('base64');
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, attachment }) {
  const payload = {
    sender: { name: "ASC Muay Thaï", email: SENDER_EMAIL },
    replyTo: { email: CLUB_EMAIL, name: "ASC Muay Thaï" },
    to,
    subject,
    htmlContent: html
  };
  if (attachment) payload.attachment = attachment;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo email: ${err}`);
  }
  return response.json();
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────
function buildClubEmail(d) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#111;padding:24px;text-align:center">
        <h1 style="color:#ee0000;font-size:26px;margin:0;letter-spacing:2px">ASC MUAY THAÏ</h1>
        <p style="color:#888;margin:4px 0 0;font-size:12px;letter-spacing:1px">FICHE D'INSCRIPTION EN LIGNE SAISON ${SAISON}</p>
      </div>
      <div style="padding:32px;background:#f9f9f9;border:1px solid #e0e0e0">
        <h3 style="color:#ee0000;border-bottom:2px solid #ee0000;padding-bottom:6px;margin-top:0;">1. Profil Adhérent</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;width:40%"><strong>Nouveau membre ?</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.nouveau || "Non spécifié"}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Déjà pratiqué la boxe ?</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.dejaPratique || "Non spécifié"}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Nom complet</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px"><strong>${d.nom.toUpperCase()} ${d.prenom}</strong></td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Né(e) le / à</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">Le ${d.naissanceDate} à ${d.naissanceLieu}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Profession</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.profession || "Non renseignée"}</td></tr>
        </table>
        <h3 style="color:#ee0000;border-bottom:2px solid #ee0000;padding-bottom:6px;">2. Contact</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;width:40%"><strong>Adresse</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.adresse}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Ville</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.ville}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Téléphone</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.telephone}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Email</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.email}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>WhatsApp</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.whatsapp}</td></tr>
        </table>
        <h3 style="color:#ee0000;border-bottom:2px solid #ee0000;padding-bottom:6px;">3. Documents à apporter</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;width:40%"><strong>Certificat médical</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0">📄 À apporter</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Photo d'identité</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0">📄 À apporter</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Pièce d'identité</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0">📄 À apporter</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Autorisation parentale</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0">📄 À apporter si mineur</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Droit à l'image</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0">${d.acceptDroitImage ? "✅ Accepté" : "❌ Refusé"}</td></tr>
        </table>
        <h3 style="color:#ee0000;border-bottom:2px solid #ee0000;padding-bottom:6px;">4. Section & Cotisation</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;width:40%"><strong>Section</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px">${d.section}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px"><strong>Règlement</strong></td><td style="padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:14px"><strong>${d.reglementText}</strong></td></tr>
          <tr><td style="padding:8px 0;color:#555;font-size:13px"><strong>Montant dû</strong></td><td style="padding:8px 0;font-size:18px;color:#ee0000;font-weight:bold">${d.montant}€</td></tr>
        </table>
        ${d.message ? `<div style="margin-top:20px;padding:16px;background:#fff;border:1px solid #e0e0e0;border-radius:4px"><strong>Message :</strong><p style="margin:8px 0 0;font-size:14px;white-space:pre-line">${d.message}</p></div>` : ""}
      </div>
      <div style="padding:16px;text-align:center;background:#111;color:#555;font-size:11px">ASC Muay Thaï — Complexe Marboulus, 21 Chemin de l'Isle, 95550 Bessancourt<br>Siège social : 175 rue Général de Gaulle, 95370 Montigny-lès-Cormeilles — SIRET : 991 686 460 00015</div>
    </div>`;
}

function buildMemberEmail({ prenom, nom, section, reglementText, montant, instructionsHtml, reglement }) {
  const paymentReminder = {
    Cheque: `💳 N'oublie pas d'apporter ton/tes chèque(s) de <strong>${montant}€</strong> (ordre : <strong>ASC MUAY THAI</strong>, jusqu'à 3 chèques acceptés).`,
    Especes: `💵 N'oublie pas d'apporter <strong>${montant}€</strong> en espèces exactes.`,
    PassSport: `🎟️ N'oublie pas d'apporter ton <strong>coupon Pass'Sport</strong> pour bénéficier de la réduction de 70€.`
  }[reglement] || null;
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#111;padding:24px;text-align:center">
        <h1 style="color:#ee0000;font-size:28px;margin:0;letter-spacing:2px">ASC MUAY THAÏ</h1>
        <p style="color:#888;margin:4px 0 0;font-size:12px;letter-spacing:1px">BESSANCOURT — VAL D'OISE (95)</p>
      </div>
      <div style="padding:32px;background:#f9f9f9;border:1px solid #e0e0e0">
        <h2 style="color:#111;font-size:22px;margin:0 0 16px">Bonjour ${prenom} 👋</h2>
        <p style="color:#333;line-height:1.6">Ta demande d'inscription a bien été enregistrée ! Voici le récapitulatif de ton dossier.</p>
        <div style="margin:24px 0;padding:20px;background:#fff;border:1px solid #e0e0e0;border-radius:4px">
          <p style="margin:0 0 8px;font-size:13px;color:#555;text-transform:uppercase"><strong>Récapitulatif</strong></p>
          <p style="margin:6px 0">📌 Adhérent : <strong>${prenom} ${nom.toUpperCase()}</strong></p>
          <p style="margin:6px 0">📌 Section : <strong>${section}</strong></p>
          <p style="margin:6px 0">💰 Règlement : <strong>${reglementText}</strong></p>
          <p style="margin:6px 0">💵 Cotisation : <strong style="color:#ee0000;font-size:16px">${montant}€</strong></p>
        </div>
        ${instructionsHtml}
        <div style="padding:16px;background:#f1f3f5;border-radius:4px;margin-bottom:20px;font-size:13px;color:#666;">
          <strong>📋 Prochaine étape :</strong> Ton inscription en ligne est bien enregistrée. Lors de ta première séance, apporte :<br><br>
          🖨️ Ta <strong>fiche d'inscription imprimée et signée</strong> (PDF joint à cet email — imprime-la, signe-la et apporte-la)<br>
          📄 Tes justificatifs : certificat médical, photo d'identité, pièce d'identité${paymentReminder ? `<br>${paymentReminder}` : ""}
        </div>
        <p style="color:#555;font-size:13px;line-height:1.6">Des questions ?<br>
          ✉️ <a href="mailto:ascmuaythai95@gmail.com" style="color:#ee0000">ascmuaythai95@gmail.com</a>
        </p>
      </div>
      <div style="padding:16px;text-align:center;background:#111;color:#555;font-size:11px">ASC Muay Thaï — Saison ${SAISON}<br>Siège social : 175 rue Général de Gaulle, 95370 Montigny-lès-Cormeilles — SIRET : 991 686 460 00015</div>
    </div>`;
}

function buildPaymentInstructions(reglement, montant, prenom, nom, hasPassSport) {
  const passSportWarning = hasPassSport ? `
    <div style="margin-top:10px;padding:10px 12px;background:#fff3cd;border-left:3px solid #ffc107;border-radius:3px;font-size:12px;line-height:1.6;color:#555">
      ⚠️ <strong>Attention Pass'Sport :</strong> La réduction de 70€ est soumise à validation de ton coupon par le club. Si le coupon n'est pas accepté, un complément de <strong>70€</strong> te sera demandé.
    </div>` : "";

  if (reglement === "HelloAsso") return `
    <div style="padding:16px;background:#d4edda;border-left:4px solid #28a745;border-radius:4px;margin-bottom:20px">
      <strong>💳 Paiement en ligne :</strong> Clique sur le lien ci-dessous pour finaliser ton inscription sur HelloAsso :<br><br>
      <a href="${HELLOASSO_URL}" style="display:inline-block;background:#ee0000;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px">Régler ma cotisation (${montant}€) →</a>
    </div>`;
  if (reglement === "Virement") return `
    <div style="padding:16px;background:#e2e3e5;border-left:4px solid #6c757d;border-radius:4px;margin-bottom:20px">
      <strong>💳 Virement bancaire :</strong> Effectue un virement de <strong>${montant}€</strong> :<br>
      <span style="font-family:monospace;background:#fff;padding:6px;display:block;margin:8px 0;border:1px solid #ccc">FR76 1027 8063 4700 0232 4440 117</span>
      Libellé obligatoire : <strong>Cotisation ${prenom} ${nom}</strong>
      ${passSportWarning}
    </div>`;
  if (reglement === "Cheque") return `
    <div style="padding:16px;background:#e2e3e5;border-left:4px solid #6c757d;border-radius:4px;margin-bottom:20px">
      <strong>📝 Chèque :</strong> Total <strong>${montant}€</strong> — jusqu'à 3 chèques acceptés.<br>
      Ordre : <strong>ASC MUAY THAI</strong>. À apporter lors de ta première séance.
      ${passSportWarning}
    </div>`;
  if (reglement === "Especes") return `
    <div style="padding:16px;background:#e2e3e5;border-left:4px solid #6c757d;border-radius:4px;margin-bottom:20px">
      <strong>💵 Espèces :</strong> Apporte <strong>${montant}€</strong> exacts lors de ta première séance.
      ${passSportWarning}
    </div>`;
  return "";
}
