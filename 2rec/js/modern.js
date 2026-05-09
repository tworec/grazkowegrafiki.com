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

  /* --- Lightbox -------------------------------------------------------- */
  const lb = {
    el: null, img: null, title: null, counter: null,
    closeBtn: null, prevBtn: null, nextBtn: null,
    visibleIds: [], currentIdx: -1,
    touchStartX: 0,
  };

  function initLightbox() {
    lb.el       = document.getElementById('lightbox');
    lb.img      = document.getElementById('lightbox-img');
    lb.title    = document.getElementById('lightbox-title');
    lb.counter  = document.getElementById('lightbox-counter');
    lb.closeBtn = document.getElementById('lightbox-close');
    lb.prevBtn  = document.getElementById('lightbox-prev');
    lb.nextBtn  = document.getElementById('lightbox-next');
    if (!lb.el) return;

    document.getElementById('grid').addEventListener('click', (e) => {
      const card = e.target.closest('.grid__card');
      if (!card) return;
      e.preventDefault();
      openLightbox(card.dataset.index);
    });

    lb.closeBtn.addEventListener('click', closeLightbox);
    lb.prevBtn.addEventListener('click', () => navigate(-1));
    lb.nextBtn.addEventListener('click', () => navigate(+1));
    lb.el.addEventListener('click', (e) => { if (e.target === lb.el) closeLightbox(); });

    document.addEventListener('keydown', (e) => {
      if (lb.el.hidden) return;
      if (e.key === 'Escape')    closeLightbox();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(+1);
    });

    lb.el.addEventListener('touchstart', (e) => { lb.touchStartX = e.touches[0].clientX; }, { passive: true });
    lb.el.addEventListener('touchend',   (e) => {
      const dx = e.changedTouches[0].clientX - lb.touchStartX;
      if (Math.abs(dx) > 50) navigate(dx > 0 ? -1 : +1);
    });

    // Deep-link via hash
    if (location.hash.startsWith('#work=')) {
      const id = decodeURIComponent(location.hash.slice('#work='.length));
      const idx = WORKS.findIndex(w => w.id === id);
      if (idx >= 0) openLightbox(idx);
    }
  }

  function refreshVisibleIds() {
    lb.visibleIds = [...document.querySelectorAll('.grid__card:not(.is-hidden)')]
      .map(c => Number(c.dataset.index));
  }

  function openLightbox(indexAttr) {
    refreshVisibleIds();
    const targetIdx = Number(indexAttr);
    const pos = lb.visibleIds.indexOf(targetIdx);
    lb.currentIdx = pos >= 0 ? pos : 0;
    showCurrent();
    lb.el.hidden = false;
    document.body.classList.add('is-lightbox-open');
  }

  function closeLightbox() {
    lb.el.hidden = true;
    document.body.classList.remove('is-lightbox-open');
    if (location.hash.startsWith('#work=')) {
      history.replaceState(null, '', '#prace');
    }
  }

  function navigate(delta) {
    if (!lb.visibleIds.length) return;
    lb.currentIdx = (lb.currentIdx + delta + lb.visibleIds.length) % lb.visibleIds.length;
    showCurrent();
  }

  function showCurrent() {
    const work = WORKS[lb.visibleIds[lb.currentIdx]];
    if (!work) return;
    const inner = document.getElementById('lightbox-inner');
    const desc  = document.getElementById('lightbox-desc');
    const more  = document.getElementById('lightbox-more');
    const dots  = document.getElementById('lightbox-dots');
    const isTrybB = Boolean(work.description);
    inner.classList.toggle('is-tryb-b', isTrybB);

    const images = isTrybB && Array.isArray(work.gallery) && work.gallery.length
      ? [work.full, ...work.gallery]
      : [work.full];

    setImage(images[0], work.alt);

    lb.title.textContent = work.title;
    lb.counter.textContent = `${lb.currentIdx + 1} / ${lb.visibleIds.length}`;

    if (isTrybB) {
      desc.textContent = work.description;
      desc.hidden = false;
      if (work.moreUrl) {
        more.setAttribute('href', work.moreUrl);
        more.hidden = false;
      } else {
        more.hidden = true;
      }
      renderDots(images, dots);
    } else {
      desc.hidden = true;
      more.hidden = true;
      dots.hidden = true;
    }

    history.replaceState(null, '', `#work=${encodeURIComponent(work.id)}`);
  }

  function setImage(src, alt) {
    lb.img.src = src;
    lb.img.alt = alt || '';
  }

  function renderDots(images, dotsEl) {
    if (images.length <= 1) {
      dotsEl.hidden = true;
      return;
    }
    dotsEl.hidden = false;
    dotsEl.replaceChildren();
    images.forEach((src, i) => {
      const b = document.createElement('button');
      b.setAttribute('aria-label', `Obraz ${i + 1} z ${images.length}`);
      if (i === 0) b.classList.add('is-active');
      b.addEventListener('click', () => {
        setImage(images[i], lb.img.alt);
        [...dotsEl.children].forEach((d, j) => d.classList.toggle('is-active', i === j));
      });
      dotsEl.appendChild(b);
    });
  }

  /* --- Contact form (Web3Forms AJAX) ----------------------------------- */
  function initOrderForm() {
    const form = document.getElementById('orderForm');
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const submitTxt = submitBtn.querySelector('.submit-text');
    const msg = document.getElementById('formMessage');
    const subject = document.getElementById('formSubject');
    const imie = document.getElementById('imie');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      subject.value = 'Zamówienie portretu — ' + imie.value.trim();
      const original = submitTxt.textContent;
      submitTxt.textContent = 'Wysyłanie…';
      submitBtn.disabled = true;
      msg.hidden = true;
      msg.classList.remove('is-success', 'is-error');
      try {
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
        const data = await res.json();
        if (res.ok) {
          form.reset();
          msg.textContent = 'Wiadomość wysłana! Odezwę się wkrótce.';
          msg.classList.add('is-success');
        } else {
          msg.textContent = 'Błąd: ' + (data.message || 'spróbuj jeszcze raz');
          msg.classList.add('is-error');
        }
      } catch {
        msg.textContent = 'Błąd połączenia. Napisz bezpośrednio na grazkowegrafiki@gmail.com.';
        msg.classList.add('is-error');
      } finally {
        submitTxt.textContent = original;
        submitBtn.disabled = false;
        msg.hidden = false;
      }
    });
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
      initLightbox();
      initOrderForm();
    } catch (e) {
      console.error('Failed to load works:', e);
      setGridMessage('Nie udało się wczytać prac.', 'grid__empty');
    }
  });
})();
