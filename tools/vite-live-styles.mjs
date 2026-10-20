import { relative } from 'node:path';
import { compileProjectStyles } from './styles.mjs';

// Автокомпиляция сохраняет готовый CSS, а обычные скрипты обновляют документ.
export function liveStyles() {
  return {
    name: 'grammers-live-styles',
    apply: 'serve',
    // В режиме разработки query v зарезервирован Vite для неизменяемых кешей.
    // Убираем его из локальных ресурсов, сохраняя исходные версии для сборки.
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replace(/((?:href|src)="(?!https?:|\/\/)[^"]+\.(?:css|js))\?v=[^"]*(")/g, '$1$2'),
    },
    async configureServer(server) {
      const root = server.config.root;
      await compileProjectStyles(root);
      let timer, running = false, queued = false, closed = false;
      async function rebuild() {
        if (closed) return;
        if (running) { queued = true; return; }
        running = true;
        try {
          await compileProjectStyles(root);
          if (!closed) {
            server.config.logger.info('SCSS: styles.css и Blocks/blocks.css обновлены.');
            server.ws.send({ type: 'full-reload' });
          }
        } catch (error) {
          if (!closed) {
            server.config.logger.error(error.message);
            server.ws.send({ type: 'error', err: { message: error.message, stack: error.stack || '', plugin: 'grammers-live-styles' } });
          }
        } finally {
          running = false;
          if (queued && !closed) { queued = false; timer = setTimeout(rebuild, 80); }
        }
      }
      function change(file) {
        const path = relative(root, file).replaceAll('\\', '/');
        if (/^(?:src\/styles\/|src\/components\/|Blocks\/).*\.scss$/.test(path)) {
          clearTimeout(timer); timer = setTimeout(rebuild, 80);
        } else if (/^(?:Modifications\/|Blocks\/|src\/scripts\/pages\/).*\.js$/.test(path)) {
          server.ws.send({ type: 'full-reload' });
        }
      }
      server.watcher.on('change', change).on('add', change).on('unlink', change);
      // Старые закладки на собранные страницы ведут к живым исходным страницам.
      server.middlewares.use((req, res, next) => {
        if (/^\/dist\/(?:index|cases|case|brodeks|Blocks\/index)\.html(?:\?|$)/.test(req.url || '')) {
          res.writeHead(302, { Location: req.url.replace(/^\/dist\//, '/') }); res.end(); return;
        }
        next();
      });
      server.httpServer?.once('close', () => {
        closed = true; clearTimeout(timer);
        server.watcher.off('change', change).off('add', change).off('unlink', change);
      });
    },
  };
}
