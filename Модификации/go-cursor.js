/*
 * Модификация: круг с плавным следованием и деформацией внутри .go.
 * Связанный CSS: ./go-cursor.css — подключить через <link rel="stylesheet">.
 * Подключение JS: <script defer src="…/go-cursor.js"></script>, без type="module".
 * Запуск автоматический. Новые .go работают без повторной инициализации.
 * Настройки вида — CSS-переменные на .go, перечисленные в go-cursor.css.
 * Зависимостей нет. Физика: экспоненциальное приближение, растяжение по скорости.
 * Поддерживаются несколько и вложенные .go; приоритет у ближайшего к указателю.
 * Сенсорные касания не включают эффект; системный указатель остаётся доступным.
 * При reduced motion круг движется без задержки и деформации.
 * Очистка: window.GoCursor.destroy(); повторный запуск: window.GoCursor.init().
 * Удаляются обработчики, круг и цикл анимации. Повторный запуск безопасен.
 */
(() => {
  'use strict';

  window.GoCursor?.destroy();
  let cleanup = null;

  function init() {
    if (cleanup) return;
    const controller = new AbortController();
    const { signal } = controller;
    const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const layer = document.createElement('div');
    layer.className = 'go-cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    const circle = document.createElement('div');
    circle.className = 'go-cursor-layer__circle';
    layer.append(circle);
    document.body.append(layer);

    let active = null;
    let frame = 0;
    let previousTime = 0;
    let pointerX = 0;
    let pointerY = 0;
    let x = 0;
    let y = 0;

    function hide() {
      active = null;
      layer.classList.remove('is-visible');
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }

    function targetAtPointer() {
      return document.elementFromPoint(pointerX, pointerY)?.closest('.go') || null;
    }

    function configure(target) {
      active = target;
      const styles = getComputedStyle(target);
      for (const name of ['size', 'color', 'blend', 'opacity']) {
        const property = `--go-cursor-${name}`;
        const value = styles.getPropertyValue(property).trim();
        if (value) layer.style.setProperty(property, value);
        else layer.style.removeProperty(property);
      }
      layer.style.borderTopLeftRadius = styles.borderTopLeftRadius;
      layer.style.borderTopRightRadius = styles.borderTopRightRadius;
      layer.style.borderBottomLeftRadius = styles.borderBottomLeftRadius;
      layer.style.borderBottomRightRadius = styles.borderBottomRightRadius;
    }

    function render(time) {
      frame = 0;
      if (!active?.isConnected || !finePointer.matches) {
        hide();
        return;
      }
      // Повторная проверка учитывает прокрутку, перекрытие и удаление класса .go.
      const target = targetAtPointer();
      if (!target) {
        hide();
        return;
      }
      if (target !== active) configure(target);
      const rect = active.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        hide();
        return;
      }
      // Координаты в окне позволяют не менять разметку и позиционирование .go.
      Object.assign(layer.style, {
        left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
      });
      const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
      previousTime = time;
      const follow = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / 0.075);
      const dx = (pointerX - x) * follow;
      const dy = (pointerY - y) * follow;
      x += dx;
      y += dy;
      // Скорость задаёт направление и силу деформации, как у курсора Cuberto.
      const speed = Math.hypot(dx, dy) / Math.max(dt, 0.001);
      const stretch = reducedMotion.matches ? 0 : Math.min(speed * 0.0015, 0.225);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      circle.style.transform = `translate(${x - rect.left}px, ${y - rect.top}px) translate(-50%, -50%) rotate(${angle}deg) scale(${1 + stretch}, ${1 - stretch})`;
      layer.classList.add('is-visible');
      frame = requestAnimationFrame(render);
    }

    function move(event) {
      if (event.pointerType === 'touch' || !finePointer.matches) {
        hide();
        return;
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      const target = targetAtPointer();
      if (!target) {
        hide();
        return;
      }
      if (!active) {
        // При входе круг появляется под указателем, без прилёта из прошлого блока.
        x = pointerX;
        y = pointerY;
      }
      if (active !== target) configure(target);
      if (!frame) frame = requestAnimationFrame(render);
    }

    document.addEventListener('pointermove', move, { signal, passive: true });
    document.addEventListener('pointerover', move, { signal, passive: true });
    document.documentElement.addEventListener('pointerleave', hide, { signal });
    document.addEventListener('pointercancel', hide, { signal });
    window.addEventListener('blur', hide, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
    }, { signal });
    finePointer.addEventListener('change', hide, { signal });

    cleanup = () => {
      hide();
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
