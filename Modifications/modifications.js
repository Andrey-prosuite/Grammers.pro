/*****************************************************************************
 * МОДИФИКАЦИЯ 01. КУРСОР ВНУТРИ .go
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 01».
 * Подключение: <script defer src="./Modifications/modifications.js"></script>.
 * Запуск автоматический; достаточно класса .go, включая новые элементы.
 * Движение: 0.5 с, expo.out, новая цель перезаписывает незавершённое движение.
 * Деформация: min(расстояние × 0.001, 0.15) × skewing; для стрелки skewing = 2.
 * Переход skewing от 1.5 к 2: 0.5 с, power1.out, как GSAP по умолчанию.
 * Внешних зависимостей нет: ниже воспроизведены формулы easing эффекта.
 * Очистка: window.GoCursor.destroy(); запуск: window.GoCursor.init().
 * Сенсорный ввод отключён; reduced motion убирает задержку и деформацию.
 * Область эффекта — прямоугольник .go со скруглениями. Для повёрнутых,
 * многострочных и обрезанных нестандартной маской элементов нужна своя маска.
 *****************************************************************************/
(() => {
  'use strict';
  window.GoCursor?.destroy();
  let cleanup = null;
  const duration = 500;
  const hideDuration = 300;

  // Точная expo.out из GSAP эффекта: инверсия его скорректированной expo.in.
  function expoOut(t) {
    const u = 1 - t;
    return 1 - (2 ** (10 * (u - 1)) * u + u ** 6 * (1 - u));
  }

  function init() {
    if (cleanup) return;
    const controller = new AbortController();
    const { signal } = controller;
    const finePointer = matchMedia('(pointer: fine)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const layer = document.createElement('div');
    layer.className = 'go-cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    const follower = document.createElement('div');
    follower.className = 'go-cursor-layer__follower';
    const inner = document.createElement('div');
    inner.className = 'go-cursor-layer__inner';
    const arrow = document.createElement('div');
    arrow.className = 'go-cursor-layer__arrow';
    // Стрелка направлена вверх-вправо.
    arrow.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 13 13 3m0 8.65V3H4.35" stroke="currentColor" stroke-width="2"/></svg>';
    inner.append(arrow);
    follower.append(inner);
    layer.append(follower);
    document.body.append(layer);

    let active = null;
    let visible = false;
    let frame = 0;
    let hiddenAt = 0;
    let enteredAt = 0;
    let pointerX = 0;
    let pointerY = 0;
    let x = 0;
    let y = 0;
    let fromX = 0;
    let fromY = 0;
    let moveAt = 0;

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      active = null;
      visible = false;
      layer.classList.remove('is-visible', 'is-pressed');
    }

    function hide(immediate = false) {
      if (visible) {
        visible = false;
        hiddenAt = performance.now();
        layer.classList.remove('is-visible', 'is-pressed');
      }
      if (immediate) stop();
    }

    function targetAtPointer() {
      return document.elementFromPoint(pointerX, pointerY)?.closest('.go') || null;
    }

    function configure(target) {
      active = target;
      const styles = getComputedStyle(target);
      for (const name of ['unit', 'color', 'blend']) {
        const property = `--go-cursor-${name}`;
        const value = styles.getPropertyValue(property).trim();
        if (value) layer.style.setProperty(property, value);
        else layer.style.removeProperty(property);
      }
      for (const corner of ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight']) {
        layer.style[`border${corner}Radius`] = styles[`border${corner}Radius`];
      }
    }

    function positionAt(time) {
      const progress = reducedMotion.matches ? 1 : Math.min(1, Math.max(0, (time - moveAt) / duration));
      const eased = expoOut(progress);
      x = fromX + (pointerX - fromX) * eased;
      y = fromY + (pointerY - fromY) * eased;
    }

    function paint(time) {
      positionAt(time);
      const rect = active.getBoundingClientRect();
      Object.assign(layer.style, {
        left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
      });
      const dx = pointerX - x;
      const dy = pointerY - y;
      const progress = Math.min(1, Math.max(0, (time - enteredAt) / duration));
      const skewing = 1.5 + 0.5 * (1 - (1 - progress) ** 2);
      const stretch = reducedMotion.matches ? 0 : Math.min(Math.hypot(dx, dy) * 0.001, 0.15) * skewing;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      follower.style.transform = `translate(${x - rect.left}px, ${y - rect.top}px) rotate(${angle}deg) scale(${1 + stretch}, ${1 - stretch})`;
      // Обратный поворот сохраняет направление стрелки при деформации круга.
      inner.style.transform = `rotate(${-angle}deg)`;
    }

    function render(time) {
      frame = 0;
      if (!active?.isConnected || !finePointer.matches) {
        stop();
        return;
      }
      if (visible && targetAtPointer() !== active) hide();
      paint(time);
      if (!visible && time - hiddenAt >= hideDuration) {
        stop();
        return;
      }
      frame = requestAnimationFrame(render);
    }

    function move(event) {
      if (event.pointerType === 'touch' || !finePointer.matches) {
        hide(true);
        return;
      }
      const now = performance.now();
      // Завершаем расчёт старого движения перед перезаписью цели, как overwrite.
      if (active) positionAt(now);
      fromX = x;
      fromY = y;
      pointerX = event.clientX;
      pointerY = event.clientY;
      moveAt = now;
      const target = targetAtPointer();
      if (!target) {
        hide();
        return;
      }
      if (!visible || target !== active) {
        const wasActive = Boolean(active);
        configure(target);
        if (!wasActive) {
          x = fromX = pointerX;
          y = fromY = pointerY;
        }
        if (!visible) {
          enteredAt = now;
          paint(now);
          // Фиксируем scale(0) перед включением перехода: круг вырастает из точки.
          getComputedStyle(follower, '::before').transform;
          layer.classList.add('is-visible');
          visible = true;
        }
      }
      if (!frame) frame = requestAnimationFrame(render);
    }

    document.addEventListener('pointermove', move, { signal, passive: true });
    document.addEventListener('pointerover', move, { signal, passive: true });
    document.addEventListener('pointerdown', () => {
      if (visible) layer.classList.add('is-pressed');
    }, { signal });
    document.addEventListener('pointerup', () => layer.classList.remove('is-pressed'), { signal });
    document.documentElement.addEventListener('pointerleave', () => hide(), { signal });
    document.addEventListener('pointercancel', () => hide(true), { signal });
    window.addEventListener('blur', () => hide(true), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide(true);
    }, { signal });
    finePointer.addEventListener('change', () => hide(true), { signal });
    cleanup = () => {
      stop();
      controller.abort();
      layer.remove();
      cleanup = null;
    };
  }

  function destroy() {
    document.removeEventListener('DOMContentLoaded', init);
    cleanup?.();
  }

  window.GoCursor = { init, destroy };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 02. ПЛАВНЫЙ СКРОЛЛ НА ВСЕХ СТРАНИЦАХ
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 02».
 * Зависимость: SmoothScroll 1.4.10, CDN-скрипт с integrity перед этим файлом.
 * Подключать оба скрипта с defer в общем head каждой страницы.
 * Параметры заданы пользователем; время анимации 800 мс = 0.8 секунды.
 * При недоступности CDN сохраняется обычный скролл без ошибки JS.
 * При reduced motion библиотека отключается, остаётся системный скролл.
 * Очистка обработчиков библиотеки: window.SmoothScroll.destroy().
 *****************************************************************************/
(() => {
  'use strict';
  if (typeof window.SmoothScroll !== 'function') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.SmoothScroll.destroy();
    return;
  }

  window.SmoothScroll({
    // Время скролла: 800 мс = 0.8 секунды.
    animationTime: 800,
    // Размер шага в пикселях.
    stepSize: 75,
    // Интервал и предел ускорения.
    accelerationDelta: 30,
    accelerationMax: 2,
    // Управление клавиатурой и шаг стрелок в пикселях.
    keyboardSupport: true,
    arrowScroll: 50,
    // Параметры импульсного сглаживания.
    pulseAlgorithm: true,
    pulseScale: 4,
    pulseNormalize: 1,
    // Сохранён параметр из настройки пользователя; см. ограничения в README.
    touchpadSupport: true,
  });
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 03. SMART-HEADER
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 03».
 * Разметка: класс .uc-smart-header на header; следующий элемент — main.
 * Скрытие вниз при scrollY >= 150; показ вверх при scrollY >= 100.
 * В зоне scrollY <= 50 и при фокусе внутри шапка всегда видна.
 * Пороги взяты из кода пользователя и означают координаты страницы, не путь.
 * lastScroll обновляется и возле верха, чтобы верно определять направление.
 * Отступ main сохраняет место шапки, учитывает мобильную высоту и загрузку шрифта.
 * Внешних зависимостей нет; совместимо с SmoothScroll и нативным скроллом.
 * Очистка: window.SmartHeader.destroy(); запуск: window.SmartHeader.init().
 *****************************************************************************/
(() => {
  'use strict';
  window.SmartHeader?.destroy();
  let cleanup = null;

  function init() {
    if (cleanup) return;
    const menu = document.querySelector('.uc-smart-header');
    if (!menu) return;
    const controller = new AbortController();
    const { signal } = controller;
    const content = menu.nextElementSibling;
    const hideThreshold = 150;
    const showThreshold = 100;
    const previousOffset = content?.style.getPropertyValue('--smart-header-height') || '';
    let lastScroll = Math.max(0, window.scrollY);
    let frame = 0;
    menu.classList.add('show-fixed-zero');

    function measure() {
      content?.style.setProperty('--smart-header-height', `${menu.getBoundingClientRect().height}px`);
    }

    function update() {
      frame = 0;
      const currentScroll = Math.max(0, window.scrollY);
      const isScrollingUp = currentScroll < lastScroll;
      if (currentScroll <= 50 || menu.contains(document.activeElement)) {
        menu.classList.add('show-fixed-zero');
      } else if (currentScroll > lastScroll && currentScroll >= hideThreshold) {
        menu.classList.remove('show-fixed-zero');
      } else if (isScrollingUp && currentScroll >= showThreshold) {
        menu.classList.add('show-fixed-zero');
      }
      lastScroll = currentScroll;
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { signal, passive: true });
    window.addEventListener('resize', measure, { signal, passive: true });
    menu.addEventListener('focusin', () => menu.classList.add('show-fixed-zero'), { signal });
    const observer = new ResizeObserver(measure);
    observer.observe(menu);
    measure();
    cleanup = () => {
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      menu.classList.add('show-fixed-zero');
      if (previousOffset) content?.style.setProperty('--smart-header-height', previousOffset);
      else content?.style.removeProperty('--smart-header-height');
      cleanup = null;
    };
  }

  function destroy() {
    document.removeEventListener('DOMContentLoaded', init);
    cleanup?.();
  }

  window.SmartHeader = { init, destroy };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 04. НАВЕДЕНИЕ НА ПРЕВЬЮ ПРОЕКТА
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 04».
 * CSS-модификация без собственного JS. Для круга на div.project-card__media
 * используется класс .go и код секции 01. Инициализация и очистка — GoCursor.
 *****************************************************************************/

/*****************************************************************************
 * МОДИФИКАЦИЯ 05. ЭКРАН САЙТА ВНУТРИ ПРЕВЬЮ ПРОЕКТА
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 05».
 * На десктопе — наведение и фокус на CSS; до 959px выбираем одну картинку у центра.
 * Расстояние между центрами картинки и экрана не больше высоты картинки.
 * При пересечении зон работает только ближайшая картинка; заголовки не учитываются.
 * JS меняет только data-project-preview-active на вложенном .project-preview.
 * Скриншот — локальный img в project-preview__screen; цикл до конца и обратно.
 * Зависимостей нет; без JS остаются фон и обычная ссылка.
 * Очистка: window.ProjectPreview.destroy(); запуск: window.ProjectPreview.init().
 * После добавления карточек повторить destroy/init; повторный init безопасен.
 *****************************************************************************/
(() => {
  'use strict';
  window.ProjectPreview?.destroy();
  let cleanup = null;

  function init() {
    if (cleanup) return;
    const previews = [...document.querySelectorAll('.project-card .project-preview')];
    if (!previews.length) return;

    const controller = new AbortController();
    const { signal } = controller;
    const mobile = matchMedia('(max-width: 959px)');
    const activeAttribute = 'data-project-preview-active';
    let active = null;
    let frame = 0;

    function activate(preview) {
      if (active === preview) return;
      active?.removeAttribute(activeAttribute);
      active = preview;
      active?.setAttribute(activeAttribute, '');
    }

    function update() {
      frame = 0;
      if (!mobile.matches || document.hidden) {
        activate(null);
        return;
      }
      const viewportTop = window.visualViewport?.offsetTop || 0;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const viewportCenter = viewportTop + viewportHeight / 2;
      let nearest = null;
      let nearestDistance = Infinity;
      previews.forEach((preview) => {
        const rect = preview.getBoundingClientRect();
        // Высота до scale(0.95), чтобы анимация сжатия не меняла зону запуска.
        const height = preview.offsetHeight;
        if (!height || rect.bottom <= viewportTop || rect.top >= viewportBottom) return;
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (distance <= height && (distance < nearestDistance ||
            (distance === nearestDistance && preview === active))) {
          nearest = preview;
          nearestDistance = distance;
        }
      });
      activate(nearest);
    }

    function schedule() {
      if (!frame && mobile.matches && !document.hidden) frame = requestAnimationFrame(update);
    }

    function refresh() {
      cancelAnimationFrame(frame);
      frame = 0;
      activate(null);
      schedule();
    }

    previews.forEach((preview) => preview.removeAttribute(activeAttribute));
    window.addEventListener('scroll', schedule, { signal, passive: true });
    window.addEventListener('resize', schedule, { signal, passive: true });
    window.addEventListener('load', schedule, { signal });
    window.visualViewport?.addEventListener('scroll', schedule, { signal, passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { signal, passive: true });
    mobile.addEventListener('change', refresh, { signal });
    document.addEventListener('visibilitychange', refresh, { signal });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    previews.forEach((preview) => observer?.observe(preview));
    cleanup = () => {
      controller.abort();
      observer?.disconnect();
      cancelAnimationFrame(frame);
      activate(null);
      cleanup = null;
    };
    refresh();
  }

  function destroy() {
    document.removeEventListener('DOMContentLoaded', init);
    cleanup?.();
  }

  window.ProjectPreview = { init, destroy };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 06. ВИДЕО КЕЙСА С УЧЁТОМ REDUCED MOTION
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 06».
 * Разметка: video[data-case-video] с autoplay, muted, loop, playsinline, controls.
 * Размеры и фон — блок case-video в src/styles/blocks.scss.
 * При reduced motion автозапуск отключён; доступен ручной запуск через controls.
 * Скрытая вкладка приостанавливает видео и возобновляет только игравшие ролики.
 * Зависимостей нет. Очистка: CaseVideo.destroy(); повторный запуск: init().
 *****************************************************************************/
(() => {
  'use strict';
  window.CaseVideo?.destroy();
  let cleanup = null;

  function init() {
    if (cleanup) return;
    const videos = [...document.querySelectorAll('video[data-case-video]')];
    if (!videos.length) return;
    const controller = new AbortController();
    const { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const resume = new Set();
    const autoplay = new Map(videos.map((video) => [video, video.autoplay]));

    function play(video) {
      video.play()?.catch(() => {});
    }

    function preference() {
      resume.clear();
      videos.forEach((video) => {
        video.autoplay = autoplay.get(video) && !reduced.matches;
        if (document.hidden && video.autoplay) resume.add(video);
        if (reduced.matches || document.hidden) video.pause();
        else if (video.autoplay) play(video);
      });
    }

    function visibility() {
      videos.forEach((video) => {
        if (document.hidden) {
          if (!video.paused) resume.add(video);
          video.pause();
        } else if (resume.delete(video) && !reduced.matches) {
          play(video);
        }
      });
    }

    reduced.addEventListener('change', preference, { signal });
    document.addEventListener('visibilitychange', visibility, { signal });
    cleanup = () => {
      controller.abort();
      resume.clear();
      videos.forEach((video) => {
        video.pause();
        video.autoplay = autoplay.get(video);
      });
      cleanup = null;
    };
    preference();
  }

  function destroy() {
    document.removeEventListener('DOMContentLoaded', init);
    cleanup?.();
  }

  window.CaseVideo = { init, destroy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 07. ВКЛАДКИ И ПРОКРУТКА ЭКРАНОВ КЕЙСА
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 07».
 * Корень: data-case-tabs или data-screen-group без вкладок; список: data-case-tablist,
 * кнопки: data-case-tab,
 * панели: data-case-panel с уникальными ID и связями aria-controls.
 * data-tabs-mobile включает вкладки только до 1023px; иначе видны обе панели.
 * data-screen-scroll запускает CSS-цикл; data-screen-hold — пауза удержанием мыши.
 * Без JS панели и ссылки доступны; при очистке исходные атрибуты восстанавливаются.
 * Зависимостей нет. Очистка/повторный запуск: CaseLayouts.destroy()/init().
 *****************************************************************************/
/* Удержание мыши: общий помощник для экранов и бегущих лент секций 07/10/11. */
window.MouseHoldPause = (() => {
  function create(target, change) {
    const controller = new AbortController();
    const options = { signal: controller.signal, capture: true };
    let pointer = null, started = 0, startX = 0, startY = 0, moved = false, suppressUntil = 0;
    function release() {
      if (pointer === null) return;
      if (moved || performance.now() - started >= 250) suppressUntil = performance.now() + 500;
      pointer = null;
      change(false);
    }
    target.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || pointer !== null) return;
      pointer = event.pointerId; started = performance.now(); startX = event.clientX; startY = event.clientY;
      moved = false; suppressUntil = 0;
      change(true);
    }, options);
    window.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointer) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6) moved = true;
      if (!(event.buttons & 1)) release();
    }, options);
    window.addEventListener('pointerup', (event) => { if (event.pointerId === pointer && !(event.buttons & 1)) release(); }, options);
    window.addEventListener('pointercancel', (event) => { if (event.pointerId === pointer) release(); }, options);
    window.addEventListener('blur', release, options);
    document.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse' && (event.target === document || event.target === document.documentElement)) release();
    }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); }, options);
    target.addEventListener('dragstart', (event) => { if (pointer !== null) event.preventDefault(); }, options);
    target.addEventListener('click', (event) => {
      if (event.button === 0 && event.detail !== 0 && performance.now() < suppressUntil) {
        event.preventDefault(); event.stopImmediatePropagation(); suppressUntil = 0;
      }
    }, options);
    return { destroy() { controller.abort(); release(); } };
  }
  return { create };
})();

(() => {
  'use strict';
  window.CaseLayouts?.destroy();
  let cleanup = null;

  function init() {
    if (cleanup) return;
    const roots = [...document.querySelectorAll('[data-case-tabs], [data-screen-group]')];
    const shots = [...document.querySelectorAll('[data-screen-scroll]')];
    if (!roots.length && !shots.length) return;
    const controller = new AbortController();
    const { signal } = controller;
    const narrow = matchMedia('(max-width: 1023px)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let viewerOpen = Boolean(document.querySelector('.image-viewer[open]'));
    const originals = new Map();
    const remember = (element, names) => {
      if (!originals.has(element)) originals.set(element, new Map());
      names.forEach((name) => originals.get(element).set(name, element.getAttribute(name)));
    };

    function syncMotion() {
      shots.forEach((shot) => {
        const rect = shot.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
        shot.toggleAttribute('data-screen-running', Boolean(observer) && visible && !document.hidden && !reduced.matches && !viewerOpen);
      });
    }

    const instances = roots.map((root) => {
      const list = root.querySelector('[data-case-tablist]');
      if (!list) return null;
      const tabs = [...list.querySelectorAll('[data-case-tab]')];
      const panels = tabs.map((tab) => [...root.querySelectorAll('[data-case-panel]')].find((panel) => panel.id === tab.getAttribute('aria-controls')));
      if (!tabs.length || panels.some((panel) => !panel)) return null;
      let index = Math.max(0, tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'));
      const enabled = () => !root.hasAttribute('data-tabs-mobile') || narrow.matches;
      remember(list, ['hidden', 'aria-orientation']);
      tabs.forEach((tab) => remember(tab, ['aria-selected', 'tabindex']));
      panels.forEach((panel) => remember(panel, ['hidden', 'role', 'aria-labelledby']));

      function render() {
        const on = enabled();
        list.hidden = !on;
        list.setAttribute('aria-orientation', root.classList.contains('case-pages') && !narrow.matches ? 'vertical' : 'horizontal');
        tabs.forEach((tab, position) => {
          tab.setAttribute('aria-selected', String(position === index));
          tab.tabIndex = position === index ? 0 : -1;
          const panel = panels[position];
          panel.hidden = on && position !== index;
          if (on) {
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tab.id);
          } else {
            panel.removeAttribute('role');
            panel.removeAttribute('aria-labelledby');
          }
        });
      }

      function select(next, focus = false) {
        const frame = root.querySelector('.case-pages__panels');
        const before = frame?.getBoundingClientRect();
        const top = before ? before.top + scrollY : 0;
        const passed = before && before.top < 0 ? Math.min(1, (scrollY - top) / Math.max(1, before.height - innerHeight)) : null;
        index = next;
        render();
        if (passed !== null && !narrow.matches) {
          const height = frame.getBoundingClientRect().height;
          window.scrollTo(0, Math.round(top + passed * Math.max(0, height - innerHeight)));
        }
        if (focus) tabs[index].focus({ preventScroll: true });
        if (list.getAttribute('aria-orientation') === 'horizontal') {
          const bounds = list.getBoundingClientRect();
          const selected = tabs[index].getBoundingClientRect();
          if (selected.left < bounds.left + 4) list.scrollLeft += selected.left - bounds.left - 4;
          else if (selected.right > bounds.right - 4) list.scrollLeft += selected.right - bounds.right + 4;
        }
        syncMotion();
      }

      tabs.forEach((tab, position) => {
        tab.addEventListener('click', () => select(position), { signal });
        tab.addEventListener('keydown', (event) => {
          const vertical = list.getAttribute('aria-orientation') === 'vertical';
          const step = event.key === (vertical ? 'ArrowDown' : 'ArrowRight') ? 1 : event.key === (vertical ? 'ArrowUp' : 'ArrowLeft') ? -1 : 0;
          if (!step && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          event.stopPropagation();
          select(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (position + step + tabs.length) % tabs.length, true);
        }, { signal });
      });
      render();
      return { render };
    }).filter(Boolean);

    const holds = roots.flatMap((root) => {
      const target = root.querySelector('[data-screen-hold]');
      if (!target) return [];
      remember(root, ['data-screen-paused']);
      return [window.MouseHoldPause.create(target, (paused) => root.toggleAttribute('data-screen-paused', paused))];
    });
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(syncMotion, { threshold: 0 }) : null;
    shots.forEach((shot) => observer?.observe(shot));
    function refresh() { instances.forEach((instance) => instance.render()); syncMotion(); }
    narrow.addEventListener('change', refresh, { signal });
    reduced.addEventListener('change', syncMotion, { signal });
    document.addEventListener('visibilitychange', syncMotion, { signal });
    document.addEventListener('image-viewer:change', (event) => { viewerOpen = event.detail.open; syncMotion(); }, { signal });
    cleanup = () => {
      controller.abort();
      observer?.disconnect();
      shots.forEach((shot) => shot.removeAttribute('data-screen-running'));
      holds.forEach((hold) => hold.destroy());
      originals.forEach((attributes, element) => attributes.forEach((value, name) => {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }));
      cleanup = null;
    };
    syncMotion();
  }

  function destroy() { document.removeEventListener('DOMContentLoaded', init); cleanup?.(); }
  window.CaseLayouts = { init, destroy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 08. ОБЩИЙ ПРОСМОТР ИЗОБРАЖЕНИЙ
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 08».
 * Вход: a.photo-zoom с href изображения и img; необязательный
 * data-image-title меняет подпись. Ctrl/Cmd-клик сохраняет обычную ссылку.
 * Допустим также button.photo-zoom с img, источник берётся из currentSrc.
 * Прежний data-image-viewer поддерживается; классы блоков не требуются.
 * Один dialog на страницу создаётся при первом открытии; showModal обеспечивает
 * удержание фокуса и недоступность фона. Закрытие: Esc, кнопка, фон или лист.
 * Перетаскивание/касание с движением не считается нажатием для закрытия.
 * API: ImageViewer.open({src, alt, title, opener}), close(), init(), destroy().
 * Зависимостей нет; очистка удаляет dialog, обработчики и блокировку страницы.
 *****************************************************************************/
(() => {
  'use strict';
  window.ImageViewer?.destroy();
  let cleanup = null;
  let dialog = null;
  let viewport = null;
  let image = null;
  let title = null;
  let expand = null;
  let closeButton = null;
  let hint = null;
  let opener = null;
  let wasLocked = false;
  let opened = false;
  let bodyPadding = null;
  let scrollPosition = { x: 0, y: 0 };
  let pointer = null;
  let moved = false;

  function notify(open) { document.dispatchEvent(new CustomEvent('image-viewer:change', { detail: { open } })); }
  function restore() {
    if (!opened) return;
    opened = false;
    if (!wasLocked) document.documentElement.classList.remove('image-viewer-open');
    if (bodyPadding !== null) {
      document.body.style.paddingRight = bodyPadding;
      bodyPadding = null;
    }
    window.scrollTo(scrollPosition.x, scrollPosition.y);
    notify(false);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
    image?.removeAttribute('src');
  }
  function close() { if (dialog?.open) { dialog.close(); restore(); } }
  function centerImage() {
    if (dialog?.open) viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
  }

  function build(signal) {
    dialog = document.createElement('dialog');
    dialog.className = 'image-viewer';
    dialog.setAttribute('aria-labelledby', 'grammers-image-viewer-title');
    dialog.innerHTML = '<header class="image-viewer__bar"><p class="image-viewer__title" id="grammers-image-viewer-title"></p><div class="image-viewer__tools"><button class="image-viewer__button" type="button" aria-pressed="false">Крупнее</button><button class="image-viewer__button image-viewer__button-close" type="button" autofocus>Закрыть ×</button></div></header><div class="image-viewer__viewport"><img class="image-viewer__image" alt="" decoding="async"></div><p class="image-viewer__hint" role="status"></p>';
    document.body.append(dialog);
    title = dialog.querySelector('.image-viewer__title');
    viewport = dialog.querySelector('.image-viewer__viewport');
    image = dialog.querySelector('.image-viewer__image');
    expand = dialog.querySelector('.image-viewer__button');
    closeButton = dialog.querySelector('.image-viewer__button-close');
    hint = dialog.querySelector('.image-viewer__hint');
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Прокрутка изображения');

    closeButton.addEventListener('click', close, { signal });
    dialog.addEventListener('close', () => { if (!dialog.open) restore(); }, { signal });
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = [expand, closeButton, viewport];
      const index = controls.indexOf(document.activeElement);
      const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[next].focus({ preventScroll: true });
    }, { signal });
    expand.addEventListener('click', () => {
      const expanded = dialog.toggleAttribute('data-expanded');
      expand.textContent = expanded ? 'Мельче' : 'Крупнее';
      expand.setAttribute('aria-pressed', String(expanded));
      hint.removeAttribute('data-dismissed');
      hint.textContent = expanded ? 'Перемещайте изображение прокруткой' : 'Листайте, чтобы посмотреть страницу целиком';
      centerImage();
    }, { signal });
    image.addEventListener('transitionend', (event) => { if (event.propertyName === 'width') centerImage(); }, { signal });
    image.addEventListener('load', () => {
      dialog.removeAttribute('aria-busy');
      hint.textContent = 'Листайте, чтобы посмотреть страницу целиком';
    }, { signal });
    image.addEventListener('error', () => {
      if (!dialog.open) return;
      dialog.removeAttribute('aria-busy');
      hint.removeAttribute('data-dismissed');
      hint.textContent = 'Не удалось загрузить изображение.';
    }, { signal });
    viewport.addEventListener('pointerdown', (event) => { pointer = { x: event.clientX, y: event.clientY }; moved = false; }, { signal, passive: true });
    viewport.addEventListener('pointermove', (event) => {
      if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) moved = true;
    }, { signal, passive: true });
    viewport.addEventListener('pointercancel', () => { pointer = null; moved = true; }, { signal });
    viewport.addEventListener('click', (event) => {
      if (!moved && (event.target === viewport || event.target === image)) close();
      pointer = null;
    }, { signal });
    viewport.addEventListener('scroll', () => {
      if (dialog.getAttribute('aria-busy') !== 'true') hint.setAttribute('data-dismissed', '');
    }, { signal, passive: true });
  }

  let currentSignal = null;
  function open(options) {
    if (!options?.src || typeof HTMLDialogElement === 'undefined') return false;
    let source;
    try { source = new URL(options.src, document.baseURI); } catch { return false; }
    if (!['http:', 'https:', 'file:', 'data:', 'blob:'].includes(source.protocol)) return false;
    init();
    if (!dialog) build(currentSignal);
    if (!dialog.open) {
      wasLocked = document.documentElement.classList.contains('image-viewer-open');
      opener = options.opener || document.activeElement;
      scrollPosition = { x: scrollX, y: scrollY };
      if (!wasLocked) {
        // Компенсируем полосу прокрутки, сохраняя ширину контента и единицы vw.
        const scrollbar = innerWidth - document.documentElement.clientWidth;
        bodyPadding = document.body.style.paddingRight;
        if (scrollbar > 0) document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + scrollbar}px`;
      }
    }
    opened = true;
    title.textContent = options.title || options.alt || 'Просмотр изображения';
    image.alt = options.alt || options.title || '';
    image.removeAttribute('width');
    image.removeAttribute('height');
    if (options.width && options.height) { image.width = options.width; image.height = options.height; }
    dialog.removeAttribute('data-expanded');
    expand.textContent = 'Крупнее';
    expand.setAttribute('aria-pressed', 'false');
    dialog.setAttribute('aria-busy', 'true');
    hint.removeAttribute('data-dismissed');
    hint.textContent = 'Загрузка изображения…';
    image.src = source.href;
    document.documentElement.classList.add('image-viewer-open');
    if (!dialog.open) dialog.showModal();
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
    closeButton.focus({ preventScroll: true });
    notify(true);
    return true;
  }

  function init() {
    if (cleanup) return;
    const controller = new AbortController();
    currentSignal = controller.signal;
    const imageFrames = new Map();
    document.querySelectorAll('[data-single-image][data-image-zoom="true"] [data-image-frame]').forEach((frame) => {
      if (frame.matches('a[href], button')) return;
      imageFrames.set(frame, new Map(['tabindex', 'role', 'aria-label'].map((name) => [name, frame.getAttribute(name)])));
      frame.tabIndex = 0;
      frame.setAttribute('role', 'button');
      frame.setAttribute('aria-label', `Увеличить: ${frame.querySelector('img')?.alt || 'изображение проекта'}`);
    });
    document.addEventListener('keydown', (event) => {
      if (!imageFrames.has(event.target) || !['Enter', ' '].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault(); event.target.click();
    }, { signal: currentSignal });
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const trigger = event.target.closest('a.photo-zoom, button.photo-zoom, a[data-image-viewer], button[data-image-viewer], [data-gallery-zoom-trigger], [data-single-image][data-image-zoom="true"] [data-image-frame]');
      if (!trigger || dialog?.contains(trigger)) return;
      const gallery = trigger.closest('[data-horizontal-gallery]');
      if (gallery && gallery.getAttribute('data-gallery-zoom') !== 'true') { event.preventDefault(); return; }
      const single = trigger.closest('[data-single-image]');
      if (single && single.getAttribute('data-image-zoom') !== 'true') { event.preventDefault(); return; }
      const shot = trigger.matches('img') ? trigger : [...trigger.querySelectorAll('img')].find((item) => item.getClientRects().length);
      if (!shot) return;
      const opened = open({
        src: trigger.tagName === 'A' ? trigger.href : shot.currentSrc || shot.src,
        alt: shot.alt,
        title: trigger.getAttribute('data-image-title') || shot.alt,
        width: shot.getAttribute('width'), height: shot.getAttribute('height'), opener: window.ScrollReel?.getOriginal(trigger) || trigger,
      });
      if (opened) event.preventDefault();
    }, { signal: currentSignal });
    cleanup = () => {
      if (dialog?.open) dialog.close();
      restore();
      controller.abort();
      imageFrames.forEach((attributes, frame) => attributes.forEach((value, name) => {
        if (value === null) frame.removeAttribute(name); else frame.setAttribute(name, value);
      }));
      dialog?.remove();
      dialog = viewport = image = title = expand = closeButton = hint = null;
      opener = pointer = null;
      currentSignal = null;
      cleanup = null;
    };
  }
  function destroy() { document.removeEventListener('DOMContentLoaded', init); cleanup?.(); }
  window.ImageViewer = { init, destroy, open, close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 09. ПАРАЛЛАКС ЛЮБОЙ ФОТОГРАФИИ
 * Связанные стили: modifications.css, секция 09; размеры задаёт сам блок.
 * Запуск: photo-parallax на существующем контейнере с img или picture.
 * Также single-image с data-image-parallax="true" и кадром data-image-frame;
 * появление видимого при загрузке кадра включено вместе с этой опцией.
 * data-image-appear="rise": y300px→0, opacity0→1 за1с, запуск top 85%.
 * Необязательный data-parallax-media выбирает вложенный слой; прежний
 * data-case-parallax поддерживается. data-parallax-trigger на внешнем контейнере
 * включает его в расчёт пути (например, вместе с подписью). Обёртки не создаются.
 * Требуются локальные GSAP и ScrollTrigger перед этим файлом.
 * Параметры: scale 1.05; -10% → 10%; top bottom → bottom top; scrub true.
 * Reduced motion, очистка и безопасный повторный запуск через PhotoParallax.
 *****************************************************************************/
(() => {
  let cleanup;
  function init() {
    if (cleanup || !window.gsap || !window.ScrollTrigger) return;
    const roots = [...document.querySelectorAll('.photo-parallax, [data-case-parallax], [data-single-image][data-image-parallax="true"] [data-image-frame], [data-single-image][data-image-appear="rise"] [data-image-frame]')];
    if (!roots.length) return;
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const frames = [];
      roots.forEach((root) => {
        const single = root.closest('[data-single-image]');
        const parallax = !single || single.getAttribute('data-image-parallax') === 'true';
        const rise = single?.getAttribute('data-image-appear') === 'rise';
        const image = root.querySelector('[data-parallax-media]') || root.querySelector(':scope > picture, :scope > img, :scope > video');
        if (!image) return;
        if (parallax && (root.classList.contains('photo-parallax') || root.hasAttribute('data-image-frame')) && image.parentElement === root) {
          // Сохраняем естественные пропорции кадра без дополнительных обёрток.
          const source = image.matches('picture') ? image.querySelector('img') : image;
          const width = root.clientWidth || Number(source?.getAttribute('width')) || source?.naturalWidth || source?.videoWidth;
          const height = root.clientHeight || Number(source?.getAttribute('height')) || source?.naturalHeight || source?.videoHeight;
          const naturalFrame = getComputedStyle(root).aspectRatio === 'auto';
          if (naturalFrame && width && height) {
            gsap.set(root, { aspectRatio: `${width} / ${height}` });
          }
          // Скрытый или ещё не загруженный кадр без размеров остаётся в потоке.
          if (!naturalFrame || (width && height)) {
            frames.push([root, root.getAttribute('data-photo-parallax-ready')]);
            root.setAttribute('data-photo-parallax-ready', '');
          }
        }
        const trigger = root.closest('[data-parallax-trigger]') || (rise ? single : root);
        if (parallax) {
          gsap.fromTo(image, { scale: 1.05, yPercent: -10 }, {
            scale: 1.05, yPercent: 10, ease: 'none',
            scrollTrigger: { trigger, start: 'top bottom', end: 'bottom top', scrub: true },
          });
        }
        if (rise) {
          // Отдельное появление кадра не требует параллакса изображения внутри.
          gsap.fromTo(root, { y: 300, opacity: 0 }, {
            y: 0, opacity: 1, duration: 1, ease: 'power1.out',
            scrollTrigger: { trigger: single, start: 'top 85%', once: true },
          });
          return;
        }
        const rect = root.getBoundingClientRect();
        const reveal = root.hasAttribute('data-parallax-reveal') || root.closest('[data-single-image]')?.getAttribute('data-image-parallax') === 'true';
        if (reveal && rect.top < innerHeight && rect.bottom > 0) {
          const radius = getComputedStyle(root).borderTopLeftRadius;
          gsap.timeline().set(root, { willChange: 'transform' })
            .fromTo(root, { clipPath: `inset(5% 10% round ${radius})`, scale: 0.9 }, { clipPath: `inset(0% 0% round ${radius})`, scale: 1, ease: 'expo.out', duration: 2.5 }, 0.1)
            .fromTo(root, { opacity: 0 }, { opacity: 1, duration: 1 }, 0.1)
            .set(root, { willChange: 'auto' });
        } else {
          gsap.fromTo(image, { opacity: 0 }, {
            opacity: 1, duration: 1,
            scrollTrigger: { trigger, start: 'top bottom', once: true },
          });
        }
      });
      return () => frames.forEach(([root, value]) => {
        if (value === null) root.removeAttribute('data-photo-parallax-ready');
        else root.setAttribute('data-photo-parallax-ready', value);
      });
    });
    let frame;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    };
    const observer = new ResizeObserver(refresh);
    roots.forEach((root) => observer.observe(root));
    let destroyed = false;
    document.fonts?.ready.then(() => { if (!destroyed) refresh(); });
    cleanup = () => { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); media.revert(); cleanup = null; };
  }
  function destroy() { document.removeEventListener('DOMContentLoaded', init); cleanup?.(); }
  window.PhotoParallax = { init, destroy };
  // Совместимость с первоначальным названием контроллера кейсов.
  window.CaseParallax = window.PhotoParallax;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/*****************************************************************************
 * МОДИФИКАЦИЯ 10. БЕГУЩАЯ СТРОКА СЛЕДУЮЩЕГО КЕЙСА И МЕДИАКУРСОР
 * Связанные стили: modifications.css, секция 10; размеры — blocks.scss.
 * Разметка: data-case-next → ссылка data-next-link → data-next-track/word;
 * img[data-next-image] либо video[data-next-video] задаёт медиа курсора.
 * Цикл 15 с, ease none; скролл -0.3 × дельта кадра; минимум ±1;
 * изменение скорости 1 с expo.out, overwrite true. Вниз — влево.
 * Курсор: следование 0.5 с expo.out, деформация min(speed × .001,.15) × 0.5.
 * Пауза удержанием левой кнопки мыши; reduced motion, скрытая вкладка и просмотрщик
 * останавливают движение. CaseNext.destroy()/init() очищают свои экземпляры.
 *****************************************************************************/
/* Общий механизм секции 10: галерея секции 11 также поддерживает mode: 'linear'. */
window.ScrollReel = (() => {
  const originals = new WeakMap();
  function create({ root, viewport, track, items, manual = false, native = false, mode = 'scroll', onSuspend = () => {} }) {
    const gsap = window.gsap;
    if (!gsap || !items.length) return { destroy() {}, isPaused: () => true };
    const controller = new AbortController();
    const { signal } = controller;
    const match = gsap.matchMedia();
    const originalStyle = track.getAttribute('style');
    const originalScroll = viewport.scrollLeft;
    const originalReady = root.hasAttribute('data-reel-ready');
    const originalManual = root.hasAttribute('data-reel-manual');
    const scrollDriven = mode !== 'linear';
    const setting = root.getAttribute(scrollDriven ? 'data-gallery-scroll-duration' : 'data-gallery-linear-duration')
      ?? root.getAttribute(scrollDriven ? 'data-reel-scroll-duration' : 'data-reel-linear-duration');
    // Старый атрибут сохраняет скорость ранее подключённых лент со скроллом.
    const configured = Number(setting ?? (scrollDriven ? root.getAttribute('data-reel-duration') : null));
    const duration = Number.isFinite(configured) && configured > 0 ? configured : scrollDriven ? 15 : 60;
    let timeline, period = 0, measuredViewport = 0, resizeFrame, focusFrame, destroyed = false;
    let visible = false, held = false, focused = false, interacting = false, writtenLeft = null;
    let viewerOpen = document.documentElement.classList.contains('image-viewer-open');
    let lastScroll = window.scrollY, lastDirection = -1, settling = true;
    const isPaused = () => !visible || document.hidden || viewerOpen || held || focused || interacting;
    function paintNative() {
      if (!native || interacting || focused || !timeline || !period) return;
      writtenLeft = period * (2 - timeline.progress());
      viewport.scrollLeft = writtenLeft;
      writtenLeft = viewport.scrollLeft;
    }
    function syncNative() {
      if (!native || !timeline || !period) return;
      const phase = ((-viewport.scrollLeft % period) + period) % period;
      timeline.progress(phase / period, true);
      paintNative();
    }
    function setManual(value, smooth = false) {
      interacting = value;
      if (native && timeline) {
        gsap.killTweensOf(timeline);
        if (!value) {
          timeline.timeScale(lastDirection); settling = true; lastScroll = window.scrollY;
          syncNative();
        }
      }
      setPlaying();
      if (!value && smooth && native && timeline && !isPaused()) {
        timeline.timeScale(0);
        gsap.to(timeline, { timeScale: lastDirection, duration: 1, ease: 'expo.out', overwrite: true });
      }
    }
    function setPlaying() {
      const paused = isPaused();
      if (!paused && timeline?.paused() && Math.sign(timeline.timeScale()) !== lastDirection) {
        gsap.killTweensOf(timeline);
        timeline.timeScale(lastDirection);
        settling = true;
      }
      timeline?.paused(paused);
      if (paused && !held) onSuspend();
    }
    function removeClones() { track.querySelectorAll('[data-reel-clone]').forEach((clone) => clone.remove()); }
    function cloneItem(item, index) {
      const clone = item.cloneNode(true);
      const sourceNodes = [item, ...item.querySelectorAll('*')];
      const cloneNodes = [clone, ...clone.querySelectorAll('*')];
      cloneNodes.forEach((node, position) => {
        originals.set(node, sourceNodes[position]);
        node.removeAttribute('id');
        node.removeAttribute('aria-controls');
        node.removeAttribute('aria-labelledby');
        node.removeAttribute('aria-describedby');
        if (node.matches('a, button, input, select, textarea, [tabindex]')) node.setAttribute('tabindex', '-1');
      });
      clone.setAttribute('data-reel-clone', String(index));
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    }
    function build() {
      resizeFrame = null;
      const first = items[0].getBoundingClientRect();
      const last = items[items.length - 1].getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const nextPeriod = last.right - first.left + gap;
      const nextViewport = viewport.clientWidth;
      if (!nextPeriod || !nextViewport || items.some((item) => !item.getBoundingClientRect().width)) return;
      if (timeline && Math.abs(nextPeriod - period) < 0.01 && nextViewport === measuredViewport) return;
      const progress = timeline?.progress() || 0;
      const rate = scrollDriven ? timeline?.timeScale() || lastDirection : -1;
      if (timeline) { gsap.killTweensOf(timeline); timeline.kill(); }
      period = nextPeriod; measuredViewport = nextViewport;
      removeClones();
      const copies = Math.ceil(nextViewport / period) + (native ? 3 : 1);
      const fragment = document.createDocumentFragment();
      for (let copy = 0; copy < copies; copy++) items.forEach((item, index) => fragment.append(cloneItem(item, index)));
      track.append(fragment);
      root.setAttribute('data-reel-ready', '');
      if (!native) gsap.set(track, { willChange: 'transform' });
      timeline = gsap.timeline({ paused: true, repeat: -1, onUpdate: paintNative, onReverseComplete() { this.totalTime(this.duration() * 100); } });
      timeline.fromTo(native ? {} : track, { x: -period }, { x: 0, duration, ease: 'none' });
      // Запас циклов позволяет сразу двигаться влево и разворачиваться без сброса.
      timeline.totalTime(duration * (100 + progress)).timeScale(rate);
      setPlaying();
    }
    function measure() { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(build); }
    function tick() {
      const current = window.scrollY;
      const delta = current - lastScroll;
      lastScroll = current;
      if (delta) lastDirection = -Math.sign(delta);
      if (!timeline || timeline.paused()) return;
      if (delta) {
        const speed = delta * -0.3;
        const target = speed > 0 ? Math.max(1, speed) : Math.min(-1, speed);
        gsap.to(timeline, { timeScale: target, duration: 1, ease: 'expo.out', overwrite: true });
        settling = false;
      } else if (!settling) {
        gsap.to(timeline, { timeScale: lastDirection, duration: 1, ease: 'expo.out', overwrite: true });
        settling = true;
      }
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; setPlaying(); });
    observer.observe(viewport);
    document.addEventListener('visibilitychange', setPlaying, { signal });
    document.addEventListener('image-viewer:change', (event) => { viewerOpen = event.detail.open; setPlaying(); }, { signal });
    const hold = native ? null : window.MouseHoldPause.create(viewport, (paused) => { held = paused; setPlaying(); });
    if (manual) {
      viewport.addEventListener('focusin', (event) => {
        // Клик не должен менять координаты картинки между нажатием и отпусканием.
        if (!event.target.matches(':focus-visible')) return;
        focused = true;
        root.setAttribute('data-reel-manual', '');
        setPlaying();
        if (native && period && event.target === viewport) viewport.scrollLeft = ((viewport.scrollLeft % period) + period) % period;
        cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => {
          if (!focused || event.target === viewport) return;
          const area = viewport.getBoundingClientRect(), target = event.target.getBoundingClientRect();
          if (target.left < area.left) viewport.scrollLeft += target.left - area.left;
          else if (target.right > area.right) viewport.scrollLeft += target.right - area.right;
        });
      }, { signal });
      viewport.addEventListener('focusout', (event) => {
        if (!focused || viewport.contains(event.relatedTarget)) return;
        focused = false; cancelAnimationFrame(focusFrame);
        root.removeAttribute('data-reel-manual');
        if (native) syncNative(); else viewport.scrollLeft = 0;
        setPlaying();
      }, { signal });
    }
    match.add('(prefers-reduced-motion: no-preference)', () => {
      period = 0; measuredViewport = 0; lastScroll = window.scrollY;
      build();
      const resize = new ResizeObserver(measure);
      resize.observe(viewport); resize.observe(track); items.forEach((item) => resize.observe(item));
      const onLoad = () => measure();
      track.addEventListener('load', onLoad, true);
      // Равномерный режим не читает скролл и не меняет скорость/направление.
      if (scrollDriven) gsap.ticker.add(tick);
      return () => {
        const manualLeft = native && period ? ((viewport.scrollLeft % period) + period) % period : null;
        resize.disconnect(); cancelAnimationFrame(resizeFrame);
        track.removeEventListener('load', onLoad, true);
        if (scrollDriven) gsap.ticker.remove(tick);
        if (timeline) { gsap.killTweensOf(timeline); timeline.kill(); timeline = null; }
        removeClones();
        if (manualLeft !== null) { viewport.scrollLeft = manualLeft; writtenLeft = null; }
        root.toggleAttribute('data-reel-ready', originalReady);
        if (originalStyle === null) track.removeAttribute('style'); else track.setAttribute('style', originalStyle);
      };
    });
    document.fonts?.ready.then(() => { if (!destroyed && timeline) measure(); });
    function destroy() {
      destroyed = true; controller.abort(); observer.disconnect(); cancelAnimationFrame(focusFrame); hold?.destroy(); match.revert();
      root.toggleAttribute('data-reel-manual', originalManual); viewport.scrollLeft = originalScroll;
      onSuspend();
    }
    return { destroy, isPaused, refresh: measure, setManual,
      getRestVelocity: () => native && visible && !focused && !viewerOpen && !document.hidden ? -lastDirection * period / duration / 1000 : 0,
      wrapPosition: (value) => native && period ? period + ((value - period) % period + period) % period : value,
      isAutomaticScroll: () => writtenLeft !== null && Math.abs(viewport.scrollLeft - writtenLeft) < 1 };
  }
  return { create, getOriginal: (node) => originals.get(node) || node };
})();

(() => {
  let cleanup;
  function create(root, gsap) {
    const link = root.querySelector('[data-next-link]');
    const track = root.querySelector('[data-next-track]');
    const word = root.querySelector('[data-next-word]');
    if (!link || !track || !word) return () => {};
    const match = gsap.matchMedia();
    const pos = { x: 0, y: 0 };
    let cursor, cursorVideo, pointerInside = false, moveTween;
    function hideCursor() {
      pointerInside = false;
      root.removeAttribute('data-next-media-active');
      cursor?.removeAttribute('data-visible');
      cursorVideo?.pause();
    }
    const reel = window.ScrollReel.create({ root, viewport: link, track, items: [word], onSuspend: hideCursor });
    match.add('(pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      const source = root.querySelector('[data-next-video], [data-next-image]');
      if (!source) return;
      const localController = new AbortController();
      const options = { signal: localController.signal };
      const skewing = { value: 1.5 };
      cursor = document.createElement('div');
      cursor.className = 'case-next-cursor'; cursor.setAttribute('aria-hidden', 'true');
      const media = document.createElement('div'); media.className = 'case-next-cursor__media';
      const box = document.createElement('div'); box.className = 'case-next-cursor__box';
      const image = source.cloneNode(true);
      image.hidden = false; image.removeAttribute('id'); image.removeAttribute('class');
      image.removeAttribute('data-next-image'); image.removeAttribute('data-next-video');
      if (image.tagName === 'VIDEO') { cursorVideo = image; image.muted = true; image.loop = true; image.playsInline = true; image.removeAttribute('controls'); image.removeAttribute('autoplay'); }
      box.append(image); media.append(box); cursor.append(media); document.body.append(cursor);
      const draw = (targetX, targetY) => {
        if (!cursor) return;
        const dx = targetX - pos.x, dy = targetY - pos.y;
        const skew = Math.min(Math.hypot(dx, dy) * 0.001, 0.15) * skewing.value;
        const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
        gsap.set(cursor, { x: pos.x, y: pos.y, rotation, scaleX: 1 + skew, scaleY: 1 - skew });
        gsap.set(media, { rotation: -rotation });
      };
      link.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse' || reel.isPaused()) return;
        if (!pointerInside) {
          pointerInside = true;
          gsap.to(skewing, { value: 0.5, duration: 0.5, ease: 'power1.out', overwrite: true });
          pos.x = event.clientX; pos.y = event.clientY;
          draw(pos.x, pos.y);
          root.setAttribute('data-next-media-active', ''); cursor.setAttribute('data-visible', '');
          cursorVideo?.play().catch(() => {});
        }
        moveTween = gsap.to(pos, { x: event.clientX, y: event.clientY, duration: 0.5, ease: 'expo.out', overwrite: true, onUpdate: () => draw(event.clientX, event.clientY) });
      }, options);
      link.addEventListener('pointerleave', () => { hideCursor(); gsap.to(skewing, { value: 1.5, duration: 0.5, ease: 'power1.out', overwrite: true }); }, options);
      window.addEventListener('blur', hideCursor, options);
      return () => {
        hideCursor(); localController.abort(); moveTween?.kill(); gsap.killTweensOf(pos); gsap.killTweensOf(box); gsap.killTweensOf(skewing);
        cursorVideo?.pause(); cursor?.remove(); cursor = cursorVideo = null;
      };
    });
    return () => { reel.destroy(); match.revert(); hideCursor(); };
  }

  function init() {
    if (cleanup || !window.gsap) return;
    const instances = [...document.querySelectorAll('[data-case-next]')].map((root) => create(root, window.gsap));
    cleanup = () => { instances.forEach((destroy) => destroy()); cleanup = null; };
  }
  function destroy() { document.removeEventListener('DOMContentLoaded', init); cleanup?.(); }
  window.CaseNext = { init, destroy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/*****************************************************************************
 * СЕКЦИИ 11/12. ГОРИЗОНТАЛЬНАЯ ГАЛЕРЕЯ ПЕРЕНЕСЕНА В БИБЛИОТЕКУ БЛОКОВ
 * Контроллер: ../Blocks/blocks.js, блок 02; стили: ../Blocks/blocks.css.
 * Не создавать второй контроллер. ScrollReel секции 10 остаётся общей
 * модификацией движения; ImageViewer секции 08 отвечает за увеличение.
 *****************************************************************************/

/*****************************************************************************
 * МОДИФИКАЦИЯ 13. ГЛОБАЛЬНАЯ ШТОРКА — page-transition.js
 * Единственное подключение в head до CSS; стили и контроллер в одном файле.
 * Не создавать второй контроллер здесь. Инструкция: ../docs/page-transition.md.
 *****************************************************************************/
