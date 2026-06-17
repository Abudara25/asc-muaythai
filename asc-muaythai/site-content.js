// site-content.js
// Source de vérité unique pour le contenu éditable du site (coordonnées,
// horaires, tarifs, palmarès). Écrit depuis /admin, lu ici en lecture seule.
// Si le fichier distant est indisponible, on retombe sur ces valeurs par défaut
// pour que le site reste toujours fonctionnel.

window.SITE_CONTENT_URL = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com/content.json';

window.SITE_CONTENT_DEFAULTS = {
  contact: {
    email: 'ascmuaythai95@gmail.com',
    telephone: '+33 7 75 70 77 13',
    adresseEntrainement: "Complexe Marboulus, 21 Chemin de l'Isle, 95550 Bessancourt",
  },
  horaires: [
    { jour: 'Lundi',    horaire: '18h00 – 19h00', groupe: 'Ados 13–17 ans',    categorie: 'ados' },
    { jour: 'Lundi',    horaire: '19h00 – 20h30', groupe: 'Adultes',           categorie: 'adultes' },
    { jour: 'Mercredi', horaire: '18h00 – 19h00', groupe: 'Enfants 6–12 ans',  categorie: 'enfants' },
    { jour: 'Mercredi', horaire: '19h00 – 20h30', groupe: 'Adultes',           categorie: 'adultes' },
    { jour: 'Jeudi',    horaire: '18h00 – 19h00', groupe: 'Ados 13–17 ans',    categorie: 'ados' },
    { jour: 'Jeudi',    horaire: '19h00 – 20h30', groupe: 'Adultes',           categorie: 'adultes' },
    { jour: 'Vendredi', horaire: '20h30 – 22h00', groupe: 'Adultes',           categorie: 'adultes' },
    { jour: 'Samedi',   horaire: '10h30 – 12h00', groupe: 'Enfants 6–12 ans',  categorie: 'enfants' },
    { jour: 'Samedi',   horaire: '10h30 – 12h00', groupe: 'Ados 13–17 ans',    categorie: 'ados' },
  ],
  tarifs: [
    {
      section: 'Enfants 6–12 ans',
      prix: 250,
      avantages: ['2 cours / semaine inclus', 'Paiement en 3 fois sans frais', 'Certificat médical obligatoire'],
    },
    {
      section: 'Ados 13–17 ans',
      prix: 290,
      avantages: ['3 cours / semaine inclus', 'Accès aux compétitions', "Pass'Sport (14 ans+) : tarif réduit à 220€", 'Paiement en 3 fois sans frais'],
    },
    {
      section: 'Adultes 18 ans +',
      prix: 290,
      avantages: ['3 cours / semaine inclus', 'Accès aux compétitions', 'Tarif compétiteur sur demande', 'Paiement en 3 fois sans frais'],
    },
  ],
  palmares: {
    saison: '2025/2026',
    trophees: [
      { nombre: '2',  titre: "Champions d'Europe",        sousTitre: 'Catégories jeunes & minimes' },
      { nombre: '8',  titre: 'Champions de France',       sousTitre: 'FFKDA — K1 Style & Muay Thaï' },
      { nombre: '6',  titre: "Vice-Champions d'Europe",   sousTitre: 'Toutes catégories' },
      { nombre: '5+', titre: 'Jeunes vers le Haut Niveau', sousTitre: 'Sportifs de haut niveau en formation' },
    ],
    photos: [],
  },
  clubPhotos: [
    { url: 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com/photos/1780930516798-wDJ5luYLoBx2eolDA0x2bnJuka6CqX.jpg', alt: 'Équipe ASC en compétition', large: true },
    { url: 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com/photos/1780930517515-GO5uERycoLE3BircEee4ZhSsvAMLLG.jpg', alt: 'Équipe ASC', large: false },
    { url: 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com/photos/1780930518187-Qz26SpuVJN1QNBIxqPXWbaYbTKrPn6.jpg', alt: 'Les enfants et leurs médailles', large: false },
  ],
};

window.loadSiteContent = async function loadSiteContent() {
  try {
    const res = await fetch(window.SITE_CONTENT_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('content.json indisponible');
    const data = await res.json();
    return { ...window.SITE_CONTENT_DEFAULTS, ...data };
  } catch (err) {
    console.warn('Contenu distant indisponible, utilisation des valeurs par défaut.', err);
    return window.SITE_CONTENT_DEFAULTS;
  }
};

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// Remplit tout élément [data-content="chemin.vers.valeur"] (texte) ou
// [data-content-attr="attribut:chemin.vers.valeur"] (attribut, ex: href/tel).
window.bindSiteContent = function bindSiteContent(content, root) {
  const scope = root || document;
  scope.querySelectorAll('[data-content]').forEach((el) => {
    const value = resolvePath(content, el.dataset.content);
    if (value != null) el.textContent = value;
  });
  scope.querySelectorAll('[data-content-attr]').forEach((el) => {
    const [attr, path] = el.dataset.contentAttr.split(':');
    const value = resolvePath(content, path);
    if (value != null) el.setAttribute(attr, (el.dataset.contentPrefix || '') + value);
  });
};
