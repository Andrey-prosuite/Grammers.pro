/*****************************************************************************
 * МОДИФИКАЦИЯ 13. ГЛОБАЛЬНАЯ ШТОРКА — ОДНО ПОДКЛЮЧЕНИЕ В HEAD ДО CSS
 * Стили, ранняя маска и контроллер находятся здесь. Атрибуты body не нужны.
 * GSAP используется общий; при его отсутствии загружается локальный vendor.
 * Уход 700мс; вход 1350мс, ожидание шрифтов/первого экрана не более 5с.
 * API: PageTransition.init/destroy/preview; подробности docs/page-transition.md.
 *****************************************************************************/
(() => {
  window.PageTransition?.destroy();
  const scriptURL = document.currentScript.src;
  const reducedAtStart = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let style, rescueTimer, starting = false, revision = 0, gsapPromise;
  const css = `.page-curtain { position: fixed; inset: 0; height: 100vh; height: 100dvh; width: 100%; z-index: 2147483645; opacity: 0; visibility: hidden; pointer-events: none; }
.page-curtain[data-curtain-active] { pointer-events: all; }
.page-curtain__layer { position: absolute; inset: 0; height: 0; will-change: height, transform; }
.page-curtain__dark { background: #1a1a1a; z-index: 2; }
.page-curtain__light { background: #fff; z-index: 1; }
.page-curtain__shade { height: 100%; background: #0e0e0e; opacity: 0; }
/* Место под полосу прокрутки сохраняется и при overflow:hidden, и после него. */
html { scrollbar-gutter: stable; }
html[data-page-transition-busy] { overflow: hidden; }
html[data-page-transition-busy] .go-cursor-layer { visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .page-curtain { display: none; } }

html[data-page-transition-pending]::before { content: ""; position: fixed; inset: 0; background: #1a1a1a; z-index: 2147483645; pointer-events: all; animation: page-curtain-rescue 0s 12s forwards; }
@keyframes page-curtain-rescue { to { visibility: hidden; pointer-events: none; } }
`;
  function ensureStyle() {
    if (style?.isConnected) return;
    style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }
  function release() {
    clearTimeout(rescueTimer);
    document.documentElement.removeAttribute('data-page-transition-pending');
  }
  function ensureGsap() {
    if (window.gsap) return Promise.resolve();
    if (!gsapPromise) gsapPromise = new Promise((resolve, reject) => {
      const library = document.createElement('script');
      library.src = new URL('vendor/gsap.min.js', scriptURL).href;
      library.onload = () => window.gsap ? resolve() : reject();
      library.onerror = reject;
      document.head.append(library);
    });
    return gsapPromise;
  }
  ensureStyle();
  if (!reducedAtStart) {
    document.documentElement.setAttribute('data-page-transition-pending', '');
    rescueTimer = setTimeout(release, 12000);
  }
  let cleanup, runPreview;
  async function init() {
    if (cleanup || starting) return;
    starting = true;
    const generation = ++revision;
    ensureStyle();
    try { await ensureGsap(); } catch { release(); starting = false; return; }
    if (generation !== revision) return;
    starting = false;
    const content = document.querySelector('main');
    const { gsap } = window;
    const controller = new AbortController(), { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.createElement('div');
    root.className = 'page-curtain'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="page-curtain__layer page-curtain__dark"></div><div class="page-curtain__layer page-curtain__light"></div><div class="page-curtain__layer page-curtain__shade"></div>';
    document.body.append(root);
    const dark = root.querySelector('.page-curtain__dark'), light = root.querySelector('.page-curtain__light'), shade = root.querySelector('.page-curtain__shade');
    const saved = new Map(['transform', 'translate', 'rotate', 'scale', 'filter', 'opacity', 'visibility'].map(name => [name, [content?.style.getPropertyValue(name) || '', content?.style.getPropertyPriority(name) || '']]));
    const wasInert = content?.inert;
    let timeline, watchdog = 0, readyTimer = 0, busy = false, destroyed = false, readyCancel = null, targetURL = null;
    function restore() {
      if (!content) return;
      gsap.set(content, { clearProps: 'transform,translate,rotate,scale,filter,opacity,visibility' });
      saved.forEach(([value, priority], name) => { if (value) content.style.setProperty(name, value, priority); });
      content.inert = wasInert;
    }
    function reset() {
      timeline?.kill(); timeline = null;
      readyCancel?.(); readyCancel = null;
      clearTimeout(watchdog); clearTimeout(readyTimer);
      root.removeAttribute('data-curtain-active');
      document.documentElement.removeAttribute('data-page-transition-busy');
      gsap.set(root, { autoAlpha: 0 }); restore(); busy = false; targetURL = null;
      release();
    }
    function finish() {
      reset();
      window.ScrollTrigger?.refresh();
      document.dispatchEvent(new CustomEvent('page-transition:ready'));
    }
    function lock() {
      busy = true; if (content) content.inert = true;
      root.setAttribute('data-curtain-active', '');
      document.documentElement.setAttribute('data-page-transition-busy', '');
      gsap.set(root, { autoAlpha: 1 });
    }
    function ready() {
      // Не ждать изображения ниже первого экрана и бесконечные видеопотоки.
      const pending = [];
      if (document.fonts?.ready) pending.push(document.fonts.ready);
      const images = [...(content || document.body).querySelectorAll('img')].filter(image => {
        const rect = image.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && image.loading !== 'lazy';
      });
      images.forEach(image => pending.push(new Promise(resolve => {
        if (image.complete) { resolve(); return; }
        image.addEventListener('load', resolve, { once: true, signal });
        image.addEventListener('error', resolve, { once: true, signal });
      })));
      let settle;
      const timeout = new Promise(resolve => { settle = resolve; readyTimer = setTimeout(resolve, 5000); });
      readyCancel = () => { clearTimeout(readyTimer); settle(); };
      return Promise.race([Promise.allSettled(pending), timeout]).then(() => { clearTimeout(readyTimer); });
    }
    async function enter() {
      if (reduced.matches) { finish(); return; }
      lock();
      watchdog = setTimeout(finish, 8000);
      gsap.set([dark, light], { height: '100%', yPercent: 0 });
      gsap.set(shade, { autoAlpha: 0 });
      release();
      await ready();
      if (destroyed || !busy) return;
      if (reduced.matches) { finish(); return; }
      timeline = gsap.timeline({ onComplete: finish })
        .to(dark, { yPercent: 100, duration: .7, ease: 'power3.inOut' }, 0)
        .to(root, { autoAlpha: 0, duration: .5, ease: 'power1.out' }, .5);
      if (content) timeline.fromTo(content, { y: 300, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power1.out' }, .35);
    }
    function destination(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduced.matches) return null;
      const link = event.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download') || link.hasAttribute('data-page-transition-skip') || (link.target && link.target !== '_self') || link.rel.split(/\s+/).includes('external')) return null;
      let url;
      try { url = new URL(link.href, location.href); } catch { return null; }
      if (url.origin !== location.origin || url.protocol !== location.protocol || !['http:', 'https:', 'file:'].includes(url.protocol)) return null;
      if (url.pathname === location.pathname && url.search === location.search) return null;
      // Документы любого раздела сайта; файлы ресурсов оставляем браузеру.
      const leaf = url.pathname.split('/').pop();
      if (url.protocol === 'file:' ? !/\.html?$/i.test(leaf) : /\.[^./]+$/.test(leaf) && !/\.(?:html?|php)$/i.test(leaf)) return null;
      return url;
    }
    function leave(complete) {
      lock();
      timeline = gsap.timeline({ onComplete: complete })
        .fromTo([dark, light], { height: 0, yPercent: 0 }, { height: '100%', duration: .7, ease: 'power3.inOut' }, 0)
        .to(shade, { autoAlpha: .33, duration: .7, ease: 'power1.out' }, 0);
      if (content) timeline.fromTo(content, { y: 0, filter: 'blur(0px)' }, { y: '20vw', filter: 'blur(15px)', duration: .7, ease: 'power2.inOut' }, 0);
    }
    runPreview = () => {
      if (busy || reduced.matches) return;
      leave(() => { restore(); enter(); });
    };
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-page-transition-preview]')) { runPreview(); return; }
      const url = destination(event);
      if (!url) return;
      if (busy) { event.preventDefault(); return; }
      event.preventDefault(); targetURL = url.href;
      leave(() => {
        try {
          location.assign(url.href);
          watchdog = setTimeout(finish, 5000);
        } catch { finish(); }
      });
    }, { signal });
    window.addEventListener('pageshow', event => { if (event.persisted) { reset(); enter(); } }, { signal });
    window.addEventListener('pagehide', () => { clearTimeout(watchdog); }, { signal });
    reduced.addEventListener('change', () => { if (reduced.matches && busy) { const target = targetURL; finish(); if (target) location.assign(target); } }, { signal });
    cleanup = () => { destroyed = true; controller.abort(); reset(); root.remove(); runPreview = null; cleanup = null; };
    enter();
  }
  function destroy() { ++revision; starting = false; document.removeEventListener('DOMContentLoaded', init); cleanup?.(); release(); }
  window.PageTransition = { init, destroy, preview() { runPreview?.(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
