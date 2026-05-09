/* ============================================================
   Grażkowe Grafiki — modern.js
   Vanilla JS; one IIFE-scoped file with small modules per concern.
   No innerHTML — all DOM construction via createElement / textContent.
   ============================================================ */

(function () {
  'use strict';

  /* --- Scroll-spy: highlight nav link of section in viewport ------------ */
  function initScrollSpy() {
    const links = document.querySelectorAll('.topnav__links a[data-section]');
    if (!links.length) return;
    const navHeight = getCssVar('--topnav-height') || '64px';

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const id = visible[0].target.id;
      links.forEach(a => a.classList.toggle('is-active', a.dataset.section === id));
    }, {
      rootMargin: `-${navHeight} 0px -60% 0px`,
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });

    ['prace', 'o-mnie', 'opinie', 'kontakt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* --- Hamburger toggle (mobile rules in Task 12) ---------------------- */
  function initHamburger() {
    const btn = document.getElementById('hamburger');
    const links = document.getElementById('topnav-links');
    if (!btn || !links) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      links.classList.toggle('is-open', !open);
    });
    links.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        btn.setAttribute('aria-expanded', 'false');
        links.classList.remove('is-open');
      }
    });
  }

  /* --- Smooth scroll for in-page anchors -------------------------------- */
  function initSmoothScroll() {
    document.documentElement.style.scrollBehavior = 'smooth';
  }

  /* --- Boot ------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initScrollSpy();
    initHamburger();
    initSmoothScroll();
  });
})();
