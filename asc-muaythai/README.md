# ASC Muay Thaï — Site web

## Stack
- **Frontend** : HTML statique single-file (Vercel)
- **Backend** : Vercel Functions (Node.js)
- **Emails** : Brevo API
- **Paiements** : HelloAsso

## Structure
```
/
├── index.html                  → Site principal
├── api/
│   ├── inscription.js          → Formulaire → emails Brevo
│   └── webhook-helloasso.js    → Webhook paiement HelloAsso → emails Brevo
├── vercel.json
└── .env.example
```

## Variables d'environnement (Vercel)
| Variable | Valeur |
|---|---|
| `BREVO_API_KEY` | Clé API Brevo |

## Déploiement
1. Push sur GitHub
2. Connecter le repo sur vercel.com
3. Ajouter `BREVO_API_KEY` dans Settings > Environment Variables
4. Deploy

## Maintenance

Trois scripts, à lancer depuis le dossier `asc-muaythai/`. Aucun n'est
obligatoire pour déployer : le site fonctionne sans.

| Commande | Quand | Ce que ça fait |
|---|---|---|
| `node scripts/sync-horaires-jsonld.mjs` | **après chaque changement d'horaire dans /admin** | Recopie les horaires dans la fiche Google d'`index.html`. Sans ça, Google garde les anciens : il ne lit pas le contenu injecté en JavaScript. |
| `node scripts/build-sitemap.mjs` | après ajout ou suppression d'une page | Régénère `sitemap.xml` avec les vraies dates de modification, et exclut les pages en `noindex`. |
| `node scripts/check-pages.mjs` | avant d'envoyer du code | Vérifie menus cohérents, analytics et bandeau cookies partout, fil d'Ariane synchronisé avec les données Google, aucun appel tiers, sitemap cohérent. |

Un quatrième contrôle vérifie le rendu à 360 et 768 px (débordements,
champs sous 16 px qui font zoomer Safari iOS, cibles tactiles). Il demande
un navigateur :

```
npm install --no-save playwright && npx playwright install chromium
node scripts/check-responsive.mjs
```

Les deux contrôles tournent **automatiquement à chaque envoi sur GitHub**
(onglet *Actions*). En cas d'échec, GitHub envoie un mail avec le détail.
Rien n'est modifié automatiquement : ils signalent, c'est tout.

## Webhook HelloAsso
Après déploiement, configurer dans HelloAsso :
- URL : `https://TON-DOMAINE.vercel.app/api/webhook-helloasso`
- Événements : `Payment`, `Order`
