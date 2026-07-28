// Mesure d'audience — chargé par toutes les pages publiques.
// Doit rester un script SYNCHRONE en <head> : le consentement par défaut
// (mode "denied") doit être posé avant que GTM ou gtag ne s'initialisent.
// Le choix de l'utilisateur est ensuite appliqué par /cookie-consent.js.
(function (w, d) {
  var GTM_ID = 'GTM-TJLXG2LB';
  var GA4_ID = 'G-W9TTYY8WKL';

  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }
  w.gtag = gtag;

  // RGPD : rien n'est déposé tant que l'utilisateur n'a pas accepté.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });

  w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  var first = d.getElementsByTagName('script')[0];

  var gtm = d.createElement('script');
  gtm.async = true;
  gtm.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
  first.parentNode.insertBefore(gtm, first);

  var ga = d.createElement('script');
  ga.async = true;
  ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
  first.parentNode.insertBefore(ga, first);

  gtag('js', new Date());
  gtag('config', GA4_ID);
})(window, document);
