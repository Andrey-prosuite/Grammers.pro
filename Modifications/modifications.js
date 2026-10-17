/*****************************************************************************
 * МОДИФИКАЦИЯ 01. КУРСОР ВНУТРИ .go
 * Связанные стили: ./modifications.css, секция «МОДИФИКАЦИЯ 01».
 * Подключение: <script defer src="./Modifications/modifications.js"></script>.
 * Запуск автоматический; достаточно класса .go, включая новые элементы.
 * Параметры считаны из Cursor Cuberto и GSAP, ссылки приведены в README.md.
 * Движение: 0.5 с, expo.out, новая цель перезаписывает незавершённое движение.
 * Деформация: min(расстояние × 0.001, 0.15) × skewing; для стрелки skewing = 2.
 * Переход skewing от 1.5 к 2: 0.5 с, power1.out, как GSAP по умолчанию.
 * Внешних зависимостей нет: ниже воспроизведены формулы easing референса.
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

  // Точная expo.out из GSAP референса: инверсия его скорректированной expo.in.
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
    // Стрелка направлена вверх-вправо, геометрия соответствует референсу.
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
      // У Cuberto сила зависит от отставания от мыши, а не скорости за кадр.
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
 * Эффект целиком выполняется на CSS: обработчики, таймеры и запуск не нужны.
 * Скриншот — локальный img в project-preview__screen; движение до его конца.
 * Очистка: убрать класс project-preview и его внутренние слои из HTML.
 *****************************************************************************/
