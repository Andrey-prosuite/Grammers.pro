const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '..', 'Modifications/modifications.js'), 'utf8');
const code = source.slice(source.indexOf('(() => {', source.indexOf('* МОДИФИКАЦИЯ 14.')));

function setup({ reduced = false, missing = false, busy = false, fail = false } = {}) {
  class Style {
    constructor() { this.values = new Map(); }
    getPropertyValue(k) { return this.values.get(k) || ''; }
    getPropertyPriority() { return ''; }
    setProperty(k, v) { this.values.set(k, v); }
    removeProperty(k) { this.values.delete(k); }
  }
  const listeners = new Map(), calls = [], state = { busy, reverted: 0 };
  const root = { getAttribute: () => null, querySelectorAll: () => targets };
  const list = { children: [] };
  const targets = [false, true, true, true].map(li => ({
    style: new Style(), parentElement: list, closest: () => root,
    getAttribute: () => null, matches: () => li, hasAttribute: () => true,
  }));
  list.children = targets.slice(1);
  const document = {
    readyState: 'complete', querySelectorAll: () => [root],
    documentElement: { hasAttribute: k => k === 'data-page-transition-busy' && state.busy },
    addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k),
  };
  const window = { ScrollTrigger: {}, gsap: missing ? undefined : {
    registerPlugin() {},
    matchMedia: () => ({ add(q, f) { if (!reduced) f(); }, revert() { state.reverted++; } }),
    fromTo(target, from, to) {
      if (fail && calls.length === 1) throw Error('animation unavailable');
      calls.push({ target, from, to }); target.style.setProperty('opacity', '0'); target.style.setProperty('visibility', 'hidden');
    },
  }};
  vm.runInNewContext(code, { document, window, Number, Map });
  return { window, document, targets, calls, state, listeners };
}

test('Без GSAP и при reduced motion текст не скрывается', () => {
  for (const options of [{ missing: true }, { reduced: true }]) {
    const h = setup(options); assert.equal(h.calls.length, 0);
    h.targets.forEach(t => assert.equal(t.style.getPropertyValue('opacity'), ''));
  }
});
test('Списки получают реальные задержки, появление однократное и запускается при входе', () => {
  const h = setup(); assert.equal(h.calls.length, 4);
  assert.deepEqual(h.calls.map(c => c.to.delay), [0, 0, .1, .2]);
  h.calls.forEach(c => { assert.equal(c.to.duration, 3); assert.equal(c.to.scrollTrigger.start, 'top bottom'); assert.equal(c.to.scrollTrigger.once, true); });
  h.window.TextReveal.init(); assert.equal(h.calls.length, 4);
});
test('Кривая появления имеет верные границы и плавный хвост', () => {
  const ease = setup().calls[0].to.ease;
  assert.equal(ease(0), 0); assert.equal(ease(1), 1); assert.ok(ease(.5) > .95);
  let previous = 0; for (let i = 0; i <= 100; i++) { const value = ease(i / 100); assert.ok(value >= previous); previous = value; }
});
test('Занятая шторка откладывает запуск до готовности страницы', () => {
  const h = setup({ busy: true }); assert.equal(h.calls.length, 0);
  assert.ok(h.listeners.has('page-transition:ready'));
  h.state.busy = false; h.listeners.get('page-transition:ready')();
  assert.equal(h.calls.length, 4); assert.equal(h.listeners.has('page-transition:ready'), false);
});
test('Завершение и очистка возвращают стили, повторный запуск безопасен', () => {
  const h = setup(); h.calls[0].to.onComplete();
  assert.equal(h.targets[0].style.getPropertyValue('opacity'), '');
  h.window.TextReveal.destroy(); assert.equal(h.state.reverted, 1);
  h.targets.forEach(t => assert.equal(t.style.getPropertyValue('visibility'), ''));
  h.window.TextReveal.init(); assert.equal(h.calls.length, 8);
});
test('Ошибка после начала инициализации возвращает весь текст', () => {
  const h = setup({ fail: true }); assert.equal(h.state.reverted, 1);
  h.targets.forEach(t => { assert.equal(t.style.getPropertyValue('visibility'), ''); assert.equal(t.style.getPropertyValue('opacity'), ''); });
});
