const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const effect = readFileSync(join(__dirname, '..', 'Modifications/page-transition.js'), 'utf8');
const start = effect.indexOf('    function destination(event) {');
const destination = effect.slice(start, effect.indexOf('    function leave(', start)).trim();

function setupBoot({ reduced = false } = {}) {
  const attributes = new Map(), timers = new Map(), appended = [];
  const window = {};
  const document = {
    readyState: 'loading', currentScript: { src: 'https://local.test/Modifications/page-transition.js' },
    documentElement: { setAttribute: (k, v) => attributes.set(k, v), removeAttribute: k => attributes.delete(k) },
    createElement: () => ({ textContent: '', isConnected: true }),
    head: { append: element => appended.push(element) },
    addEventListener() {}, removeEventListener() {},
  };
  vm.runInNewContext(effect, { window, document, URL,
    matchMedia: () => ({ matches: reduced }), setTimeout: (f, ms) => { timers.set(ms, f); return ms; }, clearTimeout: id => timers.delete(id),
  });
  return { window, attributes, timers, appended };
}

test('Прямое открытие получает раннюю маску без атрибутов body и хранилища', () => {
  const h = setupBoot();
  assert.ok(h.attributes.has('data-page-transition-pending'));
  assert.equal(h.appended.length, 1);
  assert.match(h.appended[0].textContent, /scrollbar-gutter: stable/);
  assert.equal(typeof h.window.PageTransition.init, 'function');
});
test('Reduced motion не закрывает документ', () => {
  assert.equal(setupBoot({ reduced: true }).attributes.size, 0);
});
test('При отсутствии запуска контроллера таймер снимает раннюю маску', () => {
  const h = setupBoot(); h.timers.get(12000)(); assert.equal(h.attributes.size, 0);
});
test('Ранний destroy снимает маску и таймер', () => {
  const h = setupBoot(); h.window.PageTransition.destroy();
  assert.equal(h.attributes.size, 0); assert.equal(h.timers.size, 0);
});

function resolver(href = 'https://local.test/index.html', reduced = false) {
  const url = new URL(href);
  return vm.runInNewContext('(' + destination + ')', { URL, reduced: { matches: reduced }, location: url });
}
function click(href, extra = {}, attrs = {}) {
  const link = { href, target: '', rel: '', hasAttribute: name => name in attrs, ...attrs };
  return { button: 0, defaultPrevented: false, target: { closest: () => link }, ...extra };
}
test('Внутренние документы любого раздела работают без списка страниц', () => {
  const resolve = resolver();
  assert.equal(resolve(click('https://local.test/cases.html')).pathname, '/cases.html');
  assert.equal(resolve(click('https://local.test/other/case.html')).pathname, '/other/case.html');
  assert.equal(resolve(click('https://local.test/new-section/')).pathname, '/new-section/');
  assert.equal(resolve(click('https://local.test/project')).pathname, '/project');
  for (const href of ['https://external.test/cases.html', 'https://local.test/file.pdf', 'mailto:test@example.test', 'https://local.test/index.html#contact']) assert.equal(resolve(click(href)), null);
});
test('Модификаторы, новая вкладка, download, skip и reduced motion сохраняют ссылки', () => {
  const resolve = resolver(), href = 'https://local.test/cases.html';
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) assert.equal(resolve(click(href, extra)), null);
  for (const attrs of [{ target: '_blank' }, { download: '' }, { 'data-page-transition-skip': '' }, { rel: 'external noopener' }]) assert.equal(resolve(click(href, {}, attrs)), null);
  assert.equal(resolver('https://local.test/index.html', true)(click(href)), null);
});
test('Подпапки и локальные HTML работают без настройки корня', () => {
  assert.equal(resolver('https://local.test/Blocks/index.html')(click('https://local.test/cases.html')).pathname, '/cases.html');
  const resolve = resolver('file:///C:/Project/index.html');
  assert.equal(resolve(click('file:///C:/Project/cases.html')).pathname, '/C:/Project/cases.html');
  assert.equal(resolve(click('file:///C:/Other/cases.html')).pathname, '/C:/Other/cases.html');
  assert.equal(resolve(click('file:///C:/Project/photo.webp')), null);
});
