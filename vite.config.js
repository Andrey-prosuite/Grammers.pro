import { defineConfig } from 'vite';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'node:url';
import home from './src/data/home.json';

const templates = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'page-templates',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const env = new nunjucks.Environment(
            new nunjucks.FileSystemLoader(templates, { noCache: true }),
            {
              autoescape: true,
              throwOnUndefined: true,
              trimBlocks: true,
              lstripBlocks: true,
            },
          );
          return env.renderString(html, home);
        },
      },
      handleHotUpdate({ file, server }) {
        if (file.endsWith('.njk') || file.includes('/src/data/')) {
          server.ws.send({ type: 'full-reload' });
        }
      },
    },
  ],
});
