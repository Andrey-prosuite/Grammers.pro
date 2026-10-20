import { defineConfig } from 'vite';
import { liveStyles } from './tools/vite-live-styles.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const modificationsScript = './Modifications/modifications.js';
const modificationsVersion = '20261020-global-curtain-1';
const animationScripts = ['gsap.min.js', 'ScrollTrigger.min.js'];
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 4181, strictPort: true },
  preview: { host: '127.0.0.1', port: 4181, strictPort: true },
  build: {
    rollupOptions: {
      input: { home: 'index.html', cases: 'cases.html', caseDetail: 'case.html', blockLibrary: 'Blocks/index.html' },
    },
  },
  plugins: [liveStyles(), {
    name: 'local-modifications',
    apply: 'build',
    // Обычный скрипт сохраняется без модулей: корневой HTML работает как файл.
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html
        .replace(/<script defer src="\.\/src\/scripts\/pages\/(?:home|cases|brodeks)\.js(?:\?[^"]*)?"><\/script>/g, '')
        .replace(/<script src="(?:\.\/|\.\.\/)Modifications\/page-transition\.js(?:\?[^"]*)?"><\/script>/g, '')
        .replace(/<script defer src="(?:\.\/|\.\.\/)(?:Modifications\/modifications|Blocks\/blocks)\.js(?:\?[^\"]*)?"><\/script>/g, '')
        .replace(/<script defer src="(?:\.\/|\.\.\/)Modifications\/vendor\/(?:gsap|ScrollTrigger)\.min\.js"><\/script>/g, ''),
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const viewerAssets = new Map();
        // Служебный каталог содержит реальные ссылки на инструкции и шаблоны.
        const libraryFiles = ['Blocks/README.md', 'Blocks/AGENTS.md', 'Blocks/METHODOLOGY.md', 'Blocks/templates/single-image.html', 'Blocks/templates/horizontal-gallery.html', 'Blocks/templates/cookie-notice.html', 'Blocks/images/README.md', 'Modifications/README.md', 'Modifications/AGENTS.md', 'AGENTS.md', 'README.md'];
        for (const name of readdirSync(new URL('./docs/', import.meta.url))) {
          if (name.endsWith('.md')) libraryFiles.push(`docs/${name}`);
        }
        for (const path of libraryFiles) {
          this.emitFile({ type: 'asset', fileName: path, source: readFileSync(new URL(`./${path}`, import.meta.url)) });
        }

        for (const name of animationScripts) {
          this.emitFile({ type: 'asset', fileName: `Modifications/vendor/${name}`, source: readFileSync(new URL(`./Modifications/vendor/${name}`, import.meta.url)) });
        }
        this.emitFile({
          type: 'asset',
          fileName: 'Modifications/modifications.js',
          source: readFileSync(new URL(modificationsScript, import.meta.url), 'utf8'),
        });
        for (const name of ['home', 'cases', 'brodeks']) this.emitFile({ type: 'asset', fileName: `src/scripts/pages/${name}.js`, source: readFileSync(new URL(`./src/scripts/pages/${name}.js`, import.meta.url)) });
        this.emitFile({ type: 'asset', fileName: 'Modifications/page-transition.js', source: readFileSync(new URL('./Modifications/page-transition.js', import.meta.url)) });
        this.emitFile({ type: 'asset', fileName: 'Blocks/blocks.js', source: readFileSync(new URL('./Blocks/blocks.js', import.meta.url), 'utf8') });
        // В сборку возвращается тот же локальный скрипт, без внешних запросов.
        for (const asset of Object.values(bundle)) {
          if (asset.type === 'asset' && asset.fileName.endsWith('.html')) {
            // Ссылка без JS должна открывать тот же ресурс и в собранной странице.
            const html = String(asset.source).replace(/<a\b[^>]*>/g, (tag) => {
              const classes = tag.match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) || [];
              if (!classes.includes('photo-zoom') && !/\sdata-image-viewer(?:\s|>|=)/.test(tag)) return tag;
              return tag.replace(/\bhref="([^"]+)"/, (attribute, href) => {
                if (!/^\.\/images\/.+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(href)) return attribute;
                if (!viewerAssets.has(href)) {
                  const sourcePath = resolve(projectRoot, decodeURIComponent(href));
                  const reference = this.emitFile({ type: 'asset', name: basename(sourcePath), source: readFileSync(sourcePath) });
                  viewerAssets.set(href, `./${this.getFileName(reference)}`);
                }
                return `href="${viewerAssets.get(href)}"`;
              });
            });
            const prefix = asset.fileName.startsWith('Blocks/') ? '../' : './';
            const libraries = animationScripts.map((name) => `<script defer src="${prefix}Modifications/vendor/${name}"></script>`).join('\n  ');
            const withBoot = html.replace('</title>', `</title>\n  <script src="${prefix}Modifications/page-transition.js?v=${modificationsVersion}"></script>`);
            const pageScript = ({ 'index.html': 'home', 'cases.html': 'cases', 'case.html': 'brodeks' })[asset.fileName];
            const instanceScript = pageScript ? `<script defer src="./src/scripts/pages/${pageScript}.js?v=${modificationsVersion}"></script>` : '';
            asset.source = withBoot.replace('</head>', `  ${libraries}\n  <script defer src="${prefix}Modifications/modifications.js?v=${modificationsVersion}"></script>\n  <script defer src="${prefix}Blocks/blocks.js?v=${modificationsVersion}"></script>\n  ${instanceScript}\n  </head>`);
          }
        }
      },
    },
  }],
});
