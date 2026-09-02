// api/admin/_helloasso.js
// Client minimal pour l'API Partenaire HelloAsso (OAuth2 client_credentials),
// utilisé pour retrouver après coup l'attestation de paiement d'un adhérent.
import { put, del } from '@vercel/blob';

const HELLOASSO_ORG_SLUG = 'association-sportive-citoyenne-asc-muay-thai';
const TOKEN_URL = 'https://api.helloasso.com/oauth2/token';
const API_BASE = 'https://api.helloasso.com/v5';

// Le token est valable ~30 min ; le cache module-level évite un aller-retour
// OAuth2 à chaque appel tant que l'instance serverless reste chaude.
let _cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 5000) return _cachedToken.value;

  const clientId = process.env.HELLOASSO_CLIENT_ID;
  const clientSecret = process.env.HELLOASSO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('HELLOASSO_CLIENT_ID/HELLOASSO_CLIENT_SECRET manquants');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Authentification HelloAsso échouée : ${await res.text()}`);
  const data = await res.json();
  _cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 1700) * 1000 };
  return _cachedToken.value;
}

// Retrouve le paiement HelloAsso d'un adhérent par email (+ montant si connu,
// pour départager d'éventuels doublons) et renvoie l'URL de son attestation
// de paiement, ou null si rien ne correspond.
async function findHelloAssoReceiptUrl({ email, montant }, token) {
  if (!email) return null;

  const params = new URLSearchParams({ userSearchKey: email, pageSize: '20', sortOrder: 'Desc' });
  const res = await fetch(`${API_BASE}/organizations/${HELLOASSO_ORG_SLUG}/payments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Recherche paiement HelloAsso échouée : ${await res.text()}`);
  const data = await res.json();
  const payments = Array.isArray(data?.data) ? data.data : [];

  const montantCentimes = typeof montant === 'number' ? Math.round(montant * 100) : null;
  const sameEmail = (p) => p.payer?.email?.toLowerCase() === email.toLowerCase();

  const match =
    payments.find((p) => sameEmail(p) && montantCentimes != null && p.amount === montantCentimes && p.paymentReceiptUrl) ||
    payments.find((p) => sameEmail(p) && p.paymentReceiptUrl);

  return match?.paymentReceiptUrl || null;
}

const EXT_BY_CONTENT_TYPE = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

// Recherche puis télécharge le fichier d'attestation d'un adhérent — aucun
// accès à la liste des adhérents ici. Séparé de attachReceiptFile() ci-dessous
// pour que l'appelant puisse ne relire/écrire la liste qu'une fois cette
// partie réseau (potentiellement longue : OAuth2 + recherche + téléchargement)
// terminée, et réduire d'autant la fenêtre de lecture/écriture concurrente.
export async function downloadHelloAssoReceipt({ email, montant }) {
  let receiptUrl, token;
  try {
    token = await getAccessToken();
    receiptUrl = await findHelloAssoReceiptUrl({ email, montant }, token);
  } catch (e) {
    console.error('Recherche attestation HelloAsso ERREUR:', e.message);
    return { ok: false, status: 502, error: "Impossible d'interroger l'API HelloAsso" };
  }
  if (!receiptUrl) return { ok: false, status: 404, error: 'Aucune attestation trouvée sur HelloAsso pour ce paiement' };

  try {
    // paymentReceiptUrl n'est pas documenté comme public : on transmet le
    // bearer token au cas où il serait requis, ce qui ne coûte rien s'il ne
    // l'est pas (lien pré-signé).
    const fileRes = await fetch(receiptUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
    const contentType = (fileRes.headers.get('content-type') || '').split(';')[0].trim() || 'application/pdf';
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { ok: true, buffer, contentType };
  } catch (e) {
    console.error('Téléchargement attestation HelloAsso ERREUR:', e.message);
    return { ok: false, status: 502, error: "Le téléchargement de l'attestation a échoué" };
  }
}

// Réhéberge un fichier déjà téléchargé sur un adhérent précis (mutation de
// l'objet + upload/suppression blob, aucun appel HelloAsso). Muter juste avant
// saveAdherents() permet à l'appelant de relire la liste au dernier moment.
export async function attachReceiptFile(adherent, { buffer, contentType }) {
  const ext = EXT_BY_CONTENT_TYPE[contentType] || 'pdf';
  const previousUrl = adherent.docAttestationUrl;
  const blob = await put(`attestations/${adherent.id}.${ext}`, buffer, {
    access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true,
  });
  if (previousUrl && previousUrl !== blob.url) {
    await del(previousUrl).catch((e) => console.error('Suppression ancienne attestation ERREUR:', e.message));
  }
  adherent.docAttestationUrl = blob.url;
  return blob.url;
}

// Combine les deux étapes ci-dessus. Pratique pour l'admin (qui relit/écrit
// déjà la liste dans le même geste) ; le webhook, lui, appelle
// downloadHelloAssoReceipt() puis attachReceiptFile() séparément pour garder
// sa fenêtre de lecture/écriture de la liste aussi courte que possible.
export async function fetchAndAttachAttestation(adherent) {
  if (adherent.reglement !== 'HelloAsso') return { ok: false, status: 400, error: "Cet adhérent n'a pas payé via HelloAsso" };
  if (!adherent.email) return { ok: false, status: 400, error: "Cet adhérent n'a pas d'adresse e-mail" };

  const file = await downloadHelloAssoReceipt({ email: adherent.email, montant: adherent.montant });
  if (!file.ok) return file;

  const url = await attachReceiptFile(adherent, file);
  return { ok: true, url };
}
