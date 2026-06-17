(function () {
  var STORAGE_KEY = 'asc_cookie_consent';
  var saved = localStorage.getItem(STORAGE_KEY);

  function updateConsent(granted) {
    if (typeof gtag !== 'function') return;
    gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied',
      analytics_storage: granted ? 'granted' : 'denied'
    });
  }

  if (saved === 'granted' || saved === 'denied') {
    updateConsent(saved === 'granted');
    return;
  }

  var banner = document.createElement('div');
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Consentement aux cookies');
  banner.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:1000;' +
    'background:#0a0a0a;color:#fff;border-top:2px solid #e00;' +
    'padding:18px 24px;display:flex;flex-wrap:wrap;gap:16px;' +
    'align-items:center;justify-content:space-between;' +
    'font-family:Barlow,Arial,sans-serif;font-size:14px;line-height:1.5;';

  banner.innerHTML =
    '<p style="margin:0;flex:1;min-width:240px;color:#ddd;">' +
    "Ce site utilise Google Analytics pour mesurer son audience. " +
    'Vous pouvez accepter ou refuser ce suivi. ' +
    '<a href="/confidentialite#cookies" style="color:#fff;text-decoration:underline;">En savoir plus</a>' +
    '</p>' +
    '<div style="display:flex;gap:10px;flex-shrink:0;">' +
    '<button type="button" data-choice="refuse" style="background:transparent;color:#fff;border:1px solid #555;padding:10px 20px;font-family:inherit;font-size:13px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">Refuser</button>' +
    '<button type="button" data-choice="accept" style="background:#e00;color:#fff;border:none;padding:10px 20px;font-family:inherit;font-size:13px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">Accepter</button>' +
    '</div>';

  banner.addEventListener('click', function (e) {
    var choice = e.target.getAttribute('data-choice');
    if (!choice) return;
    var granted = choice === 'accept';
    localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied');
    updateConsent(granted);
    banner.remove();
  });

  document.body.appendChild(banner);
})();
