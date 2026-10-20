/*****************************************************************************
 * ЭКЗЕМПЛЯР: УВЕДОМЛЕНИЕ COOKIE CASES — cookie-notice-cases
 * Стили: src/styles/pages/cases.scss → styles.css; разметка: cases.html.
 * Корень data-cookie-notice-cases; принятие data-cookie-notice-accept.
 * Хранение 365 дней: cookie на сайте, localStorage как резерв/для file://.
 * data-cookie-notice-preview: только пример, без записи и автопоказа.
 * data-cookie-notice-show="ID" на кнопке повторно показывает выбранный пример.
 * API CasesCookieNotice.init/destroy/show(id); WAAPI, без зависимости от GSAP.
 * Движение 120%→0 за900мс (.33,1,.68,1), обратно600мс (.32,0,.67,0).
 * Reduced motion — мгновенно; очистка возвращает исходные атрибуты и фокус.
 *****************************************************************************/
(() => {
  window.CasesCookieNotice?.destroy();
  const key = 'grammers:cookie-notice', cookieName = 'grammers_cookie_notice';
  let cleanup, instances = [];
  function accepted() {
    try { if (document.cookie.split(';').some(value => value.trim() === cookieName + '=accepted')) return true; } catch { /* Используем резервное хранилище. */ }
    try { return JSON.parse(localStorage.getItem(key) || 'null')?.expires > Date.now(); } catch { return false; }
  }
  function persist() {
    try { document.cookie = cookieName + '=accepted; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch { /* Сайт работает и без записи cookie. */ }
    try { localStorage.setItem(key, JSON.stringify({ expires: Date.now() + 31536000000 })); } catch { /* Недоступное хранилище не мешает закрыть плашку. */ }
  }
  function show(id) { instances.find(item => !id || item.root.id === id)?.show(); }
  function init() {
    if (cleanup) return;
    const controller = new AbortController(), { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    instances = [...document.querySelectorAll('[data-cookie-notice-cases]')].map(root => {
      const button = root.querySelector('[data-cookie-notice-accept]');
      if (!button) return null;
      const preview = root.hasAttribute('data-cookie-notice-preview');
      const initialHidden = root.hidden, initialDisabled = button.disabled;
      let animation, closing = false, previous;
      function open() {
        if (closing) return;
        animation?.cancel(); previous = document.activeElement;
        root.hidden = false; button.disabled = false;
        if (!reduced.matches && root.animate) animation = root.animate([{ transform: 'translateY(120%)' }, { transform: 'translateY(0)' }], { duration: 900, easing: 'cubic-bezier(.33,1,.68,1)', fill: 'backwards' });
      }
      function hide() {
        animation?.cancel(); root.hidden = true; closing = false; button.disabled = initialDisabled;
        if (root.contains(document.activeElement) && previous?.isConnected && !root.contains(previous)) previous.focus({ preventScroll: true });
      }
      button.addEventListener('click', () => {
        if (closing) return;
        closing = true; button.disabled = true;
        if (!preview) persist();
        animation?.cancel();
        if (reduced.matches || !root.animate) { hide(); return; }
        animation = root.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(120%)' }], { duration: 600, easing: 'cubic-bezier(.32,0,.67,0)', fill: 'forwards' });
        animation.onfinish = hide;
      }, { signal });
      reduced.addEventListener('change', () => { if (reduced.matches) { if (closing) hide(); else animation?.cancel(); } }, { signal });
      root.hidden = true;
      if (!preview && !accepted()) {
        if (document.documentElement.hasAttribute('data-page-transition-busy')) document.addEventListener('page-transition:ready', open, { once: true, signal });
        else open();
      }
      return { root, show: open, destroy() { animation?.cancel(); root.hidden = initialHidden; button.disabled = initialDisabled; } };
    }).filter(Boolean);
    document.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-cookie-notice-show]');
      if (trigger) show(trigger.getAttribute('data-cookie-notice-show'));
    }, { signal });
    cleanup = () => { controller.abort(); instances.forEach(item => item.destroy()); instances = []; cleanup = null; };
  }
  function destroy() { document.removeEventListener('DOMContentLoaded', init); cleanup?.(); }
  window.CasesCookieNotice = { init, destroy, show };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
