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

  /* --- Works data + grid render ----------------------------------------- */
  let WORKS = [];   // module-scoped cache (used by filter + lightbox in later tasks)

  async function loadWorks() {
    const res = await fetch('data/works.json');
    if (!res.ok) throw new Error(`works.json HTTP ${res.status}`);
    WORKS = await res.json();
  }

  function renderGrid() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.replaceChildren();
    grid.removeAttribute('aria-busy');
    if (!WORKS.length) {
      const p = document.createElement('p');
      p.className = 'grid__empty';
      p.textContent = 'Wkrótce więcej!';
      grid.appendChild(p);
      return;
    }
    const frag = document.createDocumentFragment();
    WORKS.forEach((w, idx) => {
      const card = document.createElement('a');
      card.className = 'grid__card';
      card.href = `#work=${encodeURIComponent(w.id)}`;
      card.dataset.category = w.category;
      card.dataset.index = String(idx);

      const img = document.createElement('img');
      img.src = w.thumb;
      img.alt = w.alt;
      img.loading = 'lazy';
      img.addEventListener('error', () => { card.style.display = 'none'; });

      const title = document.createElement('span');
      title.className = 'grid__card-title';
      title.textContent = w.title;

      card.append(img, title);
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function setGridMessage(text, cls) {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.replaceChildren();
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    grid.appendChild(p);
  }

  /* --- Filter ---------------------------------------------------------- */
  const VALID_FILTERS = ['all', 'komiksowe', 'kreskowkowe', 'akwarelove', 'zaproszenia', 'gadzety', 'gry'];

  function initFilters() {
    const bar = document.getElementById('filters');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      const f = btn.dataset.filter;
      if (!VALID_FILTERS.includes(f)) return;
      applyFilter(f);
      writeFilterToHash(f);
    });
    const initial = readFilterFromHash() || 'all';
    applyFilter(initial);
    window.addEventListener('hashchange', () => {
      const f = readFilterFromHash() || 'all';
      applyFilter(f);
    });
  }

  function applyFilter(filter) {
    document.querySelectorAll('.chip').forEach(c => {
      const active = c.dataset.filter === filter;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-selected', String(active));
    });
    const cards = document.querySelectorAll('.grid__card');
    let visible = 0;
    cards.forEach(card => {
      const match = filter === 'all' || card.dataset.category === filter;
      card.classList.toggle('is-hidden', !match);
      if (match) visible++;
    });
    const grid = document.getElementById('grid');
    const existingEmpty = grid.querySelector('.grid__empty');
    if (existingEmpty) existingEmpty.remove();
    if (!visible) {
      const p = document.createElement('p');
      p.className = 'grid__empty';
      p.textContent = 'Wkrótce więcej!';
      grid.appendChild(p);
    }
  }

  // URL hash format: #prace?filter=komiksowe   (or #prace, #work=<id>)
  function readFilterFromHash() {
    const m = location.hash.match(/[?&]filter=([^&]+)/);
    if (!m) return null;
    const f = decodeURIComponent(m[1]);
    return VALID_FILTERS.includes(f) ? f : null;
  }

  function writeFilterToHash(filter) {
    const newHash = filter === 'all' ? '#prace' : `#prace?filter=${filter}`;
    if (location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }
  }

  /* --- Boot ------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    initScrollSpy();
    initHamburger();
    initSmoothScroll();
    try {
      await loadWorks();
      renderGrid();
      initFilters();
    } catch (e) {
      console.error('Failed to load works:', e);
      setGridMessage('Nie udało się wczytać prac.', 'grid__empty');
    }
  });
})();
