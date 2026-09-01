import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

// Every case page is its own HTML entry. Discovered from the directory rather
// than listed by hand, so adding a case is: drop a stub in /work, add the
// matching entry to src/case/cases.js. Nothing to remember to update here.
const casePages = Object.fromEntries(
  readdirSync(resolve(root, 'work'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [`work/${f.replace(/\.html$/, '')}`, resolve(root, 'work', f)])
);

export default defineConfig({
  // Relative asset paths so the built dist/ also opens straight from file://.
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        ...casePages,
      },
    },
  },
});
