// Mesure d'audience — chargé par toutes les pages publiques.
// Doit rester un script SYNCHRONE en <head> : le consentement par défaut
// (mode "denied") doit être posé avant que gtag ne s'initialise.
// Le choix de l'utilisateur est ensuite appliqué par /cookie-consent.js.
//
// Google Tag Manager (conteneur GTM-TJLXG2LB) a été retiré : il était chargé
// sur toutes les pages mais ne contenait aucune balise, soit 318 Ko de
// JavaScript tiers par visite pour rien. Pour le remettre, réinsérer le
// chargement de gtm.js ici — mais alors vérifier que le conteneur ne contient
// pas une balise GA4, sinon les pages vues seraient comptées deux fois.
(function (w, d) {
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

  var first = d.getElementsByTagName('script')[0];

  var ga = d.createElement('script');
  ga.async = true;
  ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
  first.parentNode.insertBefore(ga, first);

  gtag('js', new Date());
  gtag('config', GA4_ID);
})(window, document);
