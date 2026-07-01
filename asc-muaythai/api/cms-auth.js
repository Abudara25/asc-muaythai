// Gère le flux OAuth GitHub pour DecapCMS : démarrage (provider=github) + callback (code=...)
export default async function handler(req, res) {
  const { provider, code, error } = req.query;

  // ── Callback OAuth ──────────────────────────────────────────────────────────
  if (code || error) {
    const sendMessage = (type, payload) => {
      const json = JSON.stringify(payload);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script id="__payload" type="application/json">${json}<\/script>
<script>
(function(){
  var p=JSON.parse(document.getElementById('__payload').textContent);
  var msg='authorization:github:${type}:'+JSON.stringify(p);
  if(window.opener){window.opener.postMessage(msg,'*');}
  window.close();
})();
<\/script>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    };

    if (error) return sendMessage('error', { message: error });

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await tokenRes.json();
      if (!data.access_token) {
        return sendMessage('error', { message: data.error_description || 'Erreur d\'authentification' });
      }
      return sendMessage('success', { token: data.access_token, provider: 'github' });
    } catch {
      return sendMessage('error', { message: 'Erreur serveur lors de l\'échange du token' });
    }
  }

  // ── Démarrage OAuth ─────────────────────────────────────────────────────────
  if (provider !== 'github') {
    return res.status(400).send('Fournisseur non supporté');
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('GITHUB_CLIENT_ID manquant dans les variables d\'environnement');
  }

  const siteUrl = process.env.SITE_URL || 'https://www.asc-muaythai.fr';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${siteUrl}/api/callback`,
    scope: 'repo,user',
  });

  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
