// Comportement du menu de navigation, partagé par toutes les pages.
// Les liens du menu mobile appellent closeMobile() / toggleMobGroup(this)
// via des attributs onclick : ces fonctions doivent rester globales.
(function () {
  function menu() { return document.getElementById('mobileMenu'); }
  function burger() { return document.querySelector('.hamburger'); }

  function sync(open) {
    var b = burger();
    if (!b) return;
    b.classList.toggle('open', open);
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  window.toggleMobile = function () {
    var m = menu();
    if (m) sync(m.classList.toggle('open'));
  };

  window.closeMobile = function () {
    var m = menu();
    if (m) m.classList.remove('open');
    sync(false);
  };

  window.toggleMobGroup = function (btn) {
    var open = btn.parentElement.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  // Échap referme le menu mobile
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu() && menu().classList.contains('open')) {
      window.closeMobile();
      burger().focus();
    }
  });
})();
