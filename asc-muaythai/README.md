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

## Webhook HelloAsso
Après déploiement, configurer dans HelloAsso :
- URL : `https://TON-DOMAINE.vercel.app/api/webhook-helloasso`
- Événements : `Payment`, `Order`
