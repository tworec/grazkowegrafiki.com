(function () {
  'use strict';

  function revealPage() {
    document.body.classList.remove('transition-enabled');
    document.body.classList.add('transition-in');
  }

  function lazyLoadImages() {
    var imgs = document.querySelectorAll('img.js-lazy');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('data-src');
      var srcset = img.getAttribute('data-srcset');
      if (srcset) img.setAttribute('srcset', srcset);
      if (src) img.setAttribute('src', src);
      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');
      img.removeAttribute('height');
      img.style.padding = '';
      img.style.background = '';
    }
  }

  function setupHamburger() {
    var hamburger = document.querySelector('.js-hamburger');
    var close = document.querySelector('.js-close-responsive-nav');
    var navWrap = document.querySelector('.responsive-nav');
    var siteHeader = document.querySelector('.site-header');
    var html = document.documentElement;

    function openNav() {
      html.classList.add('show-responsive-nav');
      if (navWrap) {
        navWrap.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;';
      }
      if (siteHeader) siteHeader.style.display = 'none';
      document.body.style.overflow = 'hidden';
    }

    function closeNav() {
      html.classList.remove('show-responsive-nav');
      if (navWrap) navWrap.style.cssText = '';
      if (siteHeader) siteHeader.style.display = '';
      document.body.style.overflow = '';
    }

    if (hamburger) hamburger.addEventListener('click', openNav);
    if (close) close.addEventListener('click', closeNav);
  }

  var lightboxState = { items: [], index: 0, root: null, img: null };

  function makeButton(cls, label, html, css) {
    var b = document.createElement('button');
    b.className = cls;
    b.setAttribute('aria-label', label);
    b.textContent = html;
    b.style.cssText = css;
    return b;
  }

  function buildLightbox() {
    var root = document.createElement('div');
    root.id = 'lightbox-wrap';
    root.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.94);' +
      'display:none;align-items:center;justify-content:center;z-index:99999;cursor:zoom-out';

    var btnCss = 'position:absolute;background:none;border:0;color:#222;cursor:pointer;padding:0 16px;';
    var prev = makeButton('lb-prev', 'Previous', '‹',
      btnCss + 'left:2vw;top:50%;transform:translateY(-50%);font-size:48px;');
    var next = makeButton('lb-next', 'Next', '›',
      btnCss + 'right:2vw;top:50%;transform:translateY(-50%);font-size:48px;');
    var closeBtn = makeButton('lb-close', 'Close', '×',
      btnCss + 'right:2vw;top:2vh;font-size:32px;');

    var img = document.createElement('img');
    img.className = 'lb-img';
    img.alt = '';
    img.style.cssText = 'max-width:96vw;max-height:92vh;cursor:default;display:block;';

    root.appendChild(prev);
    root.appendChild(next);
    root.appendChild(closeBtn);
    root.appendChild(img);
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target === root) closeLightbox();
    });
    closeBtn.addEventListener('click', closeLightbox);
    prev.addEventListener('click', function (e) {
      e.stopPropagation();
      showSlide(lightboxState.index - 1);
    });
    next.addEventListener('click', function (e) {
      e.stopPropagation();
      showSlide(lightboxState.index + 1);
    });
    img.addEventListener('click', function (e) { e.stopPropagation(); });

    document.addEventListener('keydown', function (e) {
      if (!lightboxState.root || lightboxState.root.style.display !== 'flex') return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showSlide(lightboxState.index - 1);
      else if (e.key === 'ArrowRight') showSlide(lightboxState.index + 1);
    });

    lightboxState.img = img;
    return root;
  }

  function showSlide(i) {
    var n = lightboxState.items.length;
    if (n === 0) return;
    lightboxState.index = ((i % n) + n) % n;
    var item = lightboxState.items[lightboxState.index];
    var img = lightboxState.img;
    img.setAttribute('src', item.src);
    if (item.srcset) img.setAttribute('srcset', item.srcset);
    else img.removeAttribute('srcset');
    img.setAttribute('alt', item.alt || '');
  }

  function openLightbox(items, index) {
    if (!lightboxState.root) lightboxState.root = buildLightbox();
    lightboxState.items = items;
    lightboxState.root.style.display = 'flex';
    document.documentElement.classList.add('lightbox-enabled');
    showSlide(index);
  }

  function closeLightbox() {
    if (!lightboxState.root) return;
    lightboxState.root.style.display = 'none';
    document.documentElement.classList.remove('lightbox-enabled');
  }

  function setupLightboxes() {
    var grids = document.querySelectorAll('.js-grid-main, .js-grid');
    grids.forEach(function (grid) {
      grid.classList.add('grid--ready');
      var containers = grid.querySelectorAll('.js-grid-item-container');
      var items = [];
      containers.forEach(function (c) {
        var img = c.querySelector('img.js-lazy, img.grid__item-image');
        if (!img) return;
        items.push({
          src: img.getAttribute('data-src') || img.getAttribute('src'),
          srcset: img.getAttribute('data-srcset') || img.getAttribute('srcset'),
          alt: img.getAttribute('alt') || ''
        });
      });
      containers.forEach(function (c, i) {
        c.style.cursor = 'zoom-in';
        c.addEventListener('click', function () { openLightbox(items, i); });
      });
    });

    var standalone = document.querySelectorAll('.js-lightbox');
    standalone.forEach(function (el) {
      if (el.closest('.js-grid-item-container')) return;
      var img = el.querySelector('img');
      var src = el.getAttribute('data-src') ||
                (img && (img.getAttribute('data-src') || img.getAttribute('src')));
      if (!src) return;
      el.style.cursor = 'zoom-in';
      el.addEventListener('click', function () {
        openLightbox([{ src: src, alt: img ? img.getAttribute('alt') : '' }], 0);
      });
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    revealPage();
    lazyLoadImages();
    setupHamburger();
    setupLightboxes();
  });
})();
