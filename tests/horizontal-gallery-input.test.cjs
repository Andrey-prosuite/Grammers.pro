const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// Проверяем настоящий контроллер с управляемыми временем и событиями ввода.
const source = readFileSync(join(__dirname, '..', 'Blocks/blocks.js'), 'utf8');
const code = source.slice(0, source.lastIndexOf('/*****', source.indexOf('* БЛОК 03.')));

function setup(mode = 'linear', reduced = false) {
  let time = 0, sequence = 0;
  const frames = new Map(), timers = new Map(), calls = [];
  class Target {
    constructor() { this.attributes = new Map(); this.listeners = new Map(); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    querySelectorAll() { return []; }
    matches() { return false; }
    addEventListener(type, listener, options = {}) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
      options.signal?.addEventListener('abort', () => this.listeners.get(type).delete(listener), { once: true });
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    emit(type, extra = {}) {
      const event = { type, target: this, preventDefault() {}, stopPropagation() {}, ...extra };
      [...(this.listeners.get(type) || [])].forEach((listener) => listener(event));
    }
  }
  const root = new Target(), viewport = new Target(), track = new Target();
  const document = new Target(), window = new Target(), media = new Target();
  root.setAttribute('data-gallery-mode', mode);
  viewport.scrollLeft = 100; viewport.clientWidth = 300; viewport.clientLeft = 0; viewport.scrollWidth = 1000;
  viewport.getBoundingClientRect = () => ({ left: 0 });
  track.children = [0, 1, 2].map((index) => {
    const item = new Target(); item.setAttribute('data-gallery-item', '');
    item.getBoundingClientRect = () => ({ left: index * 350 - viewport.scrollLeft, right: index * 350 + 300 - viewport.scrollLeft });
    return item;
  });
  root.querySelector = (selector) => selector === '[data-gallery-viewport]' ? viewport : selector === '[data-gallery-track]' ? track : null;
  document.querySelectorAll = () => [root]; document.readyState = 'complete'; document.hidden = false;
  media.matches = reduced;
  window.gsap = {};
  window.ScrollReel = { create() {
    root.setAttribute('data-reel-ready', '');
    return { setManual: (...args) => calls.push(args), getRestVelocity: () => .05, wrapPosition: (value) => value, isAutomaticScroll: () => false, destroy() {} };
  } };
  vm.runInNewContext(code, {
    window, document, AbortController, performance: { now: () => time }, matchMedia: () => media,
    getComputedStyle: () => ({ paddingLeft: '0px', paddingRight: '0px' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++sequence, { callback, due: time + delay }); return sequence; },
    clearTimeout: (id) => timers.delete(id),
  });
  function advance(duration, step = 1000 / 60) {
    const end = time + duration;
    while (time < end) {
      time = Math.min(end, time + step);
      for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.callback(); }
      const pending = [...frames]; frames.clear(); pending.forEach(([, callback]) => callback(time));
    }
  }
  function drag() {
    viewport.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 500, clientY: 20, target: { closest: () => null } });
    advance(20);
    window.emit('pointermove', { pointerId: 1, buttons: 1, clientX: 400, clientY: 20 });
    advance(20);
    window.emit('pointermove', { pointerId: 1, buttons: 1, clientX: 300, clientY: 20 });
    window.emit('pointerup', { pointerId: 1 });
  }
  return { root, viewport, window, calls, advance, drag, frames };
}

test('Передача touch-жеста браузеру не запускает ленту до отпускания и окончания прокрутки', () => {
  const h = setup();
  h.viewport.emit('pointerdown', { pointerId: 7, pointerType: 'touch', target: { closest: () => null } });
  h.viewport.emit('touchstart');
  h.window.emit('pointercancel', { pointerId: 7 });
  h.viewport.emit('scrollend'); h.advance(500);
  assert.equal(h.calls.some(([manual]) => !manual), false);
  h.window.emit('touchend', { touches: [] });
  for (let i = 0; i < 5; i++) { h.advance(100); h.viewport.scrollLeft += 20; h.viewport.emit('scroll'); }
  assert.equal(h.calls.some(([manual]) => !manual), false);
  h.viewport.emit('scrollend');
  assert.deepEqual(h.calls.at(-1), [false, true]);
});

test('Мышь продолжает движение после отпускания и плавно достигает скорости ленты', () => {
  const h = setup(); h.drag();
  assert.equal(h.root.hasAttribute('data-gallery-inertia'), true);
  h.viewport.emit('scrollend');
  assert.equal(h.calls.some(([manual]) => !manual), false);
  const released = h.viewport.scrollLeft;
  h.advance(200); const first = h.viewport.scrollLeft;
  h.advance(200); const second = h.viewport.scrollLeft;
  assert.ok(first > released);
  assert.ok(second - first < first - released);
  h.advance(5000);
  assert.equal(h.root.hasAttribute('data-gallery-inertia'), false);
  assert.deepEqual(h.calls.at(-1), [false, false]);
});

test('Инерция сохраняет расстояние на дисплеях 60 и 120 Гц', () => {
  const a = setup(), b = setup(); a.drag(); b.drag();
  a.advance(600, 1000 / 60); b.advance(600, 1000 / 120);
  assert.ok(Math.abs(a.viewport.scrollLeft - b.viewport.scrollLeft) < .01);
});

test('Статичная лента ограничивает инерцию краем без отскока', () => {
  const h = setup('static'); h.drag(); h.advance(5000);
  assert.equal(h.viewport.scrollLeft, 700);
  assert.equal(h.root.hasAttribute('data-gallery-inertia'), false);
});

test('Reduced motion отключает инерцию и плавный разгон', () => {
  const h = setup('linear', true); h.drag();
  assert.equal(h.root.hasAttribute('data-gallery-inertia'), false);
  assert.deepEqual(h.calls.at(-1), [false, false]);
});

test('Очистка прекращает инерцию и восстанавливает служебные атрибуты', () => {
  const h = setup(); h.drag(); h.window.HorizontalGallery.destroy();
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.hasAttribute('data-gallery-inertia'), false);
  assert.equal(h.root.hasAttribute('data-gallery-ready'), false);
});
