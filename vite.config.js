import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const modificationsScript = './Modifications/modifications.js';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'local-modifications',
    apply: 'build',
    // Обычный скрипт сохраняется без модулей: корневой HTML работает как файл.
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(`<script defer src="${modificationsScript}"></script>`, ''),
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'Modifications/modifications.js',
          source: readFileSync(new URL(modificationsScript, import.meta.url), 'utf8'),
        });
        // В сборку возвращается тот же локальный скрипт, без внешних запросов.
        const html = bundle['index.html'];
        html.source = String(html.source).replace('</head>', `  <script defer src="${modificationsScript}"></script>\n  </head>`);
      },
    },
  }],
});
