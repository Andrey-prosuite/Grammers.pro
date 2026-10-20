/*****************************************************************************
 * БЛОК 01. ОДИНОЧНОЕ ИЗОБРАЖЕНИЕ
 * Разметка: templates/single-image.html; стили: blocks.scss → blocks.css.
 * Отдельный контроллер не нужен. Опции zoom/parallax/appear подключают
 * ImageViewer и PhotoParallax из Modifications/modifications.js, секции 08/09.
 * Подключать этот файл с defer после общего файла модификаций.
 *****************************************************************************/

/*****************************************************************************
 * БЛОК 02. ГОРИЗОНТАЛЬНАЯ ГАЛЕРЕЯ
 * Стили: ./blocks.scss → ./blocks.css; разметка: templates/horizontal-gallery.html.
 * Корень data-horizontal-gallery, режим data-gallery-mode:
 * static / linear / scroll / controls. Окно data-gallery-viewport,
 * трек data-gallery-track, прямые карточки data-gallery-item.
 * Увеличение: data-gallery-zoom="true", по умолчанию false; ImageViewer секции 08 Modifications/modifications.js.
 * Внешние стрелки: data-gallery-prev-selector / data-gallery-next-selector
 * на корне с CSS-селекторами кнопок; по умолчанию локальные классы __prev/next.
 * Переход стрелок 300 мс, swing; шаг по реальным размерам и зазорам.
 * Автодвижение использует ScrollReel секции 10 Modifications/modifications.js: scroll 15с, linear 60с,
 * отдельные data-gallery-scroll-duration / data-gallery-linear-duration.
 * Мышь перетаскивает, touch/тачпад прокручивают нативно во всех режимах.
 * Удержание приостанавливает движение; после жеста оно продолжается с новой позиции.
 * Reduced motion/без GSAP: ручная галерея; без JS доступен нативный скролл.
 * Очистка и повторный запуск: HorizontalGallery.destroy()/init().
 *****************************************************************************/
(() => {
  let cleanup;
  function create(root) {
    const viewport = root.querySelector('[data-gallery-viewport]');
    const track = root.querySelector('[data-gallery-track]');
    const items = track ? [...track.children].filter((item) => item.hasAttribute('data-gallery-item')) : [];
    if (!viewport || !track || !items.length) return null;
    const requested = root.getAttribute('data-gallery-mode');
    const mode = ['static', 'linear', 'scroll', 'controls'].includes(requested) ? requested : 'static';
    const moving = mode === 'linear' || mode === 'scroll';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController();
    const { signal } = controller;
    function buttons(attribute, fallback) {
      if (mode !== 'controls') return [];
      const selector = root.getAttribute(attribute);
      try { return [...(selector ? document.querySelectorAll(selector) : root.querySelectorAll(fallback))].filter((button) => button.matches('button')); }
      catch { return []; }
    }
    const previous = buttons('data-gallery-prev-selector', '.horizontal-gallery__prev');
    const next = buttons('data-gallery-next-selector', '.horizontal-gallery__next');
    const controls = [...new Set([...root.querySelectorAll('[data-gallery-controls]'), ...[...previous, ...next].map((button) => button.closest('[data-gallery-controls]')).filter(Boolean)])];
    const originals = new Map();
    function remember(element, names) { originals.set(element, new Map(names.map((name) => [name, element.getAttribute(name)]))); }
    remember(root, ['data-gallery-ready', 'data-gallery-dragging', 'data-gallery-animating', 'data-gallery-inertia']);
    [...previous, ...next].forEach((button) => remember(button, ['hidden', 'disabled', 'aria-controls']));
    controls.forEach((element) => remember(element, ['hidden']));
    // Увеличение включается явно для экземпляра; обёртки для обычных img не нужны.
    if (root.getAttribute('data-gallery-zoom') === 'true') {
      items.forEach((item) => item.querySelectorAll('img').forEach((image) => {
        if (image.closest('a, button')) return;
        remember(image, ['data-gallery-zoom-trigger', 'tabindex', 'role', 'aria-label']);
        image.setAttribute('data-gallery-zoom-trigger', '');
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', `Увеличить: ${image.alt || 'изображение проекта'}`);
      }));
    } else {
      items.forEach((item) => item.querySelectorAll('a.photo-zoom, button.photo-zoom, a[data-image-viewer], button[data-image-viewer]').forEach((link) => {
        remember(link, ['tabindex']); link.tabIndex = -1;
      }));
    }
    const setting = Number(root.getAttribute('data-gallery-duration') || 300);
    const duration = Number.isFinite(setting) && setting >= 0 ? setting : 300;
    let positions = [], limit = 0, frame = 0, resizeFrame = 0, destination = null;
    let pointer = null, suppressUntil = 0, resumeTimer = 0, manual = false, destroyed = false;
    let inertiaFrame = 0, touching = false;
    // Скорость в px/ms, затухание 5% за кадр 60 Гц независимо от частоты дисплея.
    const frameTime = 1000 / 60, decayRate = -Math.log(.95) / frameTime;
    const reel = moving && window.gsap && window.ScrollReel?.create ? window.ScrollReel.create({root, viewport, track, items, mode, manual: true, native: true}) : null;
    const automatic = () => reel && !reduced.matches && root.hasAttribute('data-reel-ready');
    const clamp = (value) => Math.max(0, Math.min(limit, value));
    function update() {
      const value = destination ?? viewport.scrollLeft;
      previous.forEach((button) => { button.disabled = value <= .5; });
      next.forEach((button) => { button.disabled = value >= limit - .5; });
    }
    function stop() {
      cancelAnimationFrame(frame); frame = 0; destination = null;
      cancelAnimationFrame(inertiaFrame); inertiaFrame = 0;
      root.removeAttribute('data-gallery-inertia');
      root.removeAttribute('data-gallery-animating');
    }
    function beginManual() {
      clearTimeout(resumeTimer);
      if (!manual) { manual = true; reel?.setManual(true); }
    }
    function resume(smooth = true) {
      clearTimeout(resumeTimer);
      if (pointer || touching || inertiaFrame || !manual) return;
      manual = false; reel?.setManual(false, smooth && !reduced.matches);
    }
    function deferResume() {
      clearTimeout(resumeTimer);
      if (!pointer && !touching && !inertiaFrame) resumeTimer = setTimeout(resume, 150);
    }
    function coast(velocity) {
      if (reduced.matches || Math.abs(velocity) * frameTime < .01) return false;
      let position = viewport.scrollLeft, lastTime = performance.now();
      beginManual(); root.setAttribute('data-gallery-inertia', '');
      function paint(time) {
        const elapsed = Math.min(64, Math.max(0, time - lastTime)); lastTime = time;
        const target = automatic() ? reel.getRestVelocity() : 0;
        const decay = Math.exp(-decayRate * elapsed);
        position += target * elapsed + (velocity - target) * (1 - decay) / decayRate;
        velocity = target + (velocity - target) * decay;
        if (automatic()) position = reel.wrapPosition(position);
        else {
          const bounded = Math.max(0, Math.min(limit, position));
          if (bounded !== position) velocity = 0;
          position = bounded;
        }
        viewport.scrollLeft = position;
        suppressUntil = performance.now() + 500;
        update();
        if (Math.abs(velocity - target) * frameTime >= .01 && !document.hidden) inertiaFrame = requestAnimationFrame(paint);
        else {
          inertiaFrame = 0; root.removeAttribute('data-gallery-inertia'); resume(false);
        }
      }
      inertiaFrame = requestAnimationFrame(paint);
      return true;
    }
    function sample(state, time) {
      state.samples.push({ time, left: viewport.scrollLeft });
      while (state.samples.length > 2 && state.samples[1].time < time - 100) state.samples.shift();
    }
    function finishPointer(allowInertia = false) {
      if (!pointer) return;
      const old = pointer; pointer = null;
      const time = performance.now();
      let velocity = 0;
      if (allowInertia && old.mouse && old.dragging && time - old.samples[old.samples.length - 1].time <= 80) {
        sample(old, time);
        const first = old.samples[0], last = old.samples[old.samples.length - 1];
        if (last.time > first.time) velocity = (last.left - first.left) / (last.time - first.time);
      }
      if (old.dragging || (old.mouse && time - old.started >= 250)) suppressUntil = time + 500;
      root.removeAttribute('data-gallery-dragging');
      if (viewport.hasPointerCapture?.(old.id)) viewport.releasePointerCapture(old.id);
      if (!old.mouse) deferResume();
      else if (!coast(velocity)) resume();
      update();
    }
    function moveTo(target) {
      stop(); finishPointer(); resume();
      const start = viewport.scrollLeft, end = clamp(target);
      if (reduced.matches || !duration || Math.abs(end - start) < .5) { viewport.scrollLeft = end; update(); return; }
      destination = end; root.setAttribute('data-gallery-animating', ''); update();
      const started = performance.now();
      function paint(time) {
        const progress = Math.min(1, (time - started) / duration);
        viewport.scrollLeft = start + (end - start) * (.5 - Math.cos(Math.PI * progress) / 2);
        if (progress < 1) frame = requestAnimationFrame(paint);
        else { stop(); update(); }
      }
      frame = requestAnimationFrame(paint);
    }
    function step(direction) {
      const value = destination ?? viewport.scrollLeft;
      const target = direction > 0 ? positions.find((position) => position > value + .5) : positions.findLast((position) => position < value - .5);
      moveTo(target ?? (direction > 0 ? limit : 0));
    }
    function measure() {
      resizeFrame = 0;
      if (!viewport.clientWidth) return;
      const oldIndex = positions.reduce((best, value, index) => Math.abs(value - (destination ?? viewport.scrollLeft)) < Math.abs(positions[best] - (destination ?? viewport.scrollLeft)) ? index : best, 0);
      const offset = viewport.getBoundingClientRect().left + viewport.clientLeft;
      const padding = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const rightPadding = parseFloat(getComputedStyle(track).paddingRight) || 0;
      limit = Math.max(0, items[items.length - 1].getBoundingClientRect().right - offset + viewport.scrollLeft + rightPadding - viewport.clientWidth);
      const measured = [...new Set(items.map((item) => clamp(item.getBoundingClientRect().left - offset + viewport.scrollLeft - padding)))];
      if (positions.length && measured.length === positions.length && measured.every((value, index) => Math.abs(value - positions[index]) < .5)) { update(); return; }
      stop(); finishPointer();
      const firstMeasure = !positions.length;
      positions = measured;
      if (!firstMeasure && !automatic()) viewport.scrollLeft = positions[Math.min(oldIndex, positions.length - 1)];
      update(); resume();
    }
    const refresh = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(measure); };
    previous.forEach((button) => button.addEventListener('click', () => step(-1), { signal }));
    next.forEach((button) => button.addEventListener('click', () => step(1), { signal }));
    viewport.addEventListener('keydown', (event) => {
      if (event.target.matches('[data-gallery-zoom-trigger]') && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); event.target.click(); return;
      }
      if (event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Home' || event.key === 'End') moveTo(event.key === 'Home' ? 0 : limit);
      else step(event.key === 'ArrowRight' ? 1 : -1);
    }, { signal });
    viewport.addEventListener('pointerdown', (event) => {
      if ((event.pointerType === 'mouse' && event.button !== 0) || pointer || event.target.closest('button, input, select, textarea, [contenteditable]')) return;
      stop(); suppressUntil = 0; beginManual();
      const time = performance.now();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, dragging: false, mouse: event.pointerType === 'mouse', started: time, samples: [{ time, left: viewport.scrollLeft }] };
    }, { signal });
    window.addEventListener('pointermove', (event) => {
      if (!pointer || !pointer.mouse || event.pointerId !== pointer.id) return;
      if (!(event.buttons & 1)) { finishPointer(true); return; }
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!pointer.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { finishPointer(); return; }
        pointer.dragging = true; root.setAttribute('data-gallery-dragging', '');
        viewport.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, pointer.left - dx));
      sample(pointer, performance.now());
    }, { signal });
    const release = (event) => { if (event.pointerId === pointer?.id) finishPointer(event.type === 'pointerup'); };
    window.addEventListener('pointerup', release, { signal });
    window.addEventListener('pointercancel', release, { signal });
    viewport.addEventListener('lostpointercapture', release, { signal });
    // pointercancel передаёт touch-жест браузеру, но не означает отпускание пальца.
    viewport.addEventListener('touchstart', () => { touching = true; stop(); beginManual(); }, { signal, passive: true });
    const touchEnd = (event) => {
      if (!touching) return;
      touching = event.touches.length > 0;
      if (!touching) { finishPointer(); deferResume(); }
    };
    window.addEventListener('touchend', touchEnd, { signal, passive: true });
    window.addEventListener('touchcancel', touchEnd, { signal, passive: true });
    window.addEventListener('blur', () => { touching = false; stop(); finishPointer(); resume(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { touching = false; stop(); finishPointer(); resume(); } }, { signal });
    document.addEventListener('image-viewer:change', (event) => { if (event.detail.open) { touching = false; stop(); finishPointer(); resume(false); } }, { signal });
    viewport.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
    viewport.addEventListener('click', (event) => {
      if (event.detail && performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); suppressUntil = 0; }
    }, { signal, capture: true });
    viewport.addEventListener('wheel', (event) => {
      stop();
      if (event.deltaX || event.shiftKey) { beginManual(); deferResume(); }
      else resume();
    }, { signal, passive: true });
    viewport.addEventListener('scroll', () => {
      update();
      if (inertiaFrame || !automatic() || reel.isAutomaticScroll()) return;
      beginManual(); deferResume();
    }, { signal, passive: true });
    viewport.addEventListener('scrollend', () => { if (manual && !pointer && !touching && !inertiaFrame) resume(); }, { signal });
    track.addEventListener('load', refresh, { signal, capture: true });
    reduced.addEventListener('change', () => { const end = destination; stop(); finishPointer(); resume(); if (end !== null) viewport.scrollLeft = end; refresh(); }, { signal });
    const observer = new ResizeObserver(refresh);
    observer.observe(viewport); items.forEach((item) => observer.observe(item));
    root.setAttribute('data-gallery-ready', '');
    controls.forEach((element) => { element.hidden = mode !== 'controls'; });
    [...previous, ...next].forEach((button) => { button.hidden = false; if (viewport.id) button.setAttribute('aria-controls', viewport.id); });
    measure();
    document.fonts?.ready.then(() => { if (!destroyed) refresh(); });
    return () => {
      destroyed = true; stop(); finishPointer(); clearTimeout(resumeTimer); controller.abort(); observer.disconnect(); cancelAnimationFrame(resizeFrame); reel?.destroy();
      originals.forEach((attributes, element) => attributes.forEach((value, name) => {
        if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      }));
    };
  }
  function init() {
    if (cleanup) return;
    const instances = [...document.querySelectorAll('[data-horizontal-gallery]')].map(create).filter(Boolean);
    cleanup = () => { instances.forEach((destroy) => destroy()); cleanup = null; };
  }
  function destroy() { document.removeEventListener('DOMContentLoaded', init); cleanup?.(); }
  window.HorizontalGallery = { init, destroy };
  // Совместимость API: старые имена обращаются к одному общему контроллеру.
  window.ImageReel = window.CaseGallery = window.HorizontalGallery;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();


/*****************************************************************************
 * БЛОК 03. УВЕДОМЛЕНИЕ COOKIE — cookie-notice
 * Стили: blocks.scss → blocks.css, блок 03; templates/cookie-notice.html.
 * Корень data-cookie-notice; принятие data-cookie-notice-accept.
 * Хранение 365 дней: cookie на сайте, localStorage как резерв/для file://.
 * data-cookie-notice-preview: только пример, без записи и автопоказа.
 * data-cookie-notice-show="ID" на кнопке повторно показывает выбранный пример.
 * API CookieNotice.init/destroy/show(id); WAAPI, без зависимости от GSAP.
 * Движение 120%→0 за900мс (.33,1,.68,1), обратно600мс (.32,0,.67,0).
 * Reduced motion — мгновенно; очистка возвращает исходные атрибуты и фокус.
 *****************************************************************************/
(() => {
  window.CookieNotice?.destroy();
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
    instances = [...document.querySelectorAll('[data-cookie-notice]')].map(root => {
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
  window.CookieNotice = { init, destroy, show };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

/*****************************************************************************
 * БЛОКИ 04–06. ТЕКСТОВЫЕ КОМПОНЕНТЫ
 * Разметка: templates/text-summary.html, text-tasks.html, text-feature.html.
 * Собственного контроллера нет; появление — TextReveal, модификация 14.
 *****************************************************************************/
