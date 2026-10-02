/**
 * Generates work/<slug>.html with the case content inlined.
 *
 * Runs before `vite dev` and `vite build` (see the npm pre-scripts), so the
 * pages on disk always match src/case/cases.js. The browser bundle no longer
 * renders any text — it only attaches interactive behaviour to markup that is
 * already there.
 *
 * Image URLs are written as paths relative to work/, which Vite picks up from
 * the HTML entry and rewrites to hashed asset URLs at build time.
 */

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CASES } from '../src/case/cases.js';
import { CASES_PT } from '../src/case/cases.pt.js';
import { applyTranslation, translationIssues } from '../src/case/merge.js';
import { renderCaseHtml } from '../src/case/renderHtml.js';
import { UI, HTML_LANG } from '../src/case/ui.js';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Production origin, used for canonical and og: URLs, which must be absolute.
 * Change this in one place if the domain changes.
 */
const SITE_URL = 'https://particle-portfolio.vercel.app';

/**
 * Map every image in a case's folder by basename, so the data can name
 * "01-main.png" and still resolve after the file was re-encoded as .jpg.
 *
 * One basename can carry several files: a clip and the poster that covers it
 * are "03-walkthrough-a.mp4" and "03-walkthrough-a.jpg". So keep every
 * candidate and let the resolver choose, rather than letting whichever name
 * sorts last win for both.
 */
function imageIndex(slug) {
  const dir = resolvePath(root, 'src/images', slug);
  if (!existsSync(dir)) return new Map();
  const index = new Map();
  for (const f of readdirSync(dir)) {
    const base = f.replace(/\.[^.]+$/, '');
    if (!index.has(base)) index.set(base, []);
    index.get(base).push(f);
  }
  return index;
}

const isVideo = (f) => /\.(mp4|webm|mov|m4v)$/i.test(f);

const missing = [];

function makeResolver(slug) {
  const index = imageIndex(slug);
  return (_slug, file) => {
    const name = String(file);
    const base = name.replace(/\.[^.]+$/, '');
    const candidates = index.get(base) ?? [];
    // Exact name first, then anything of the same kind — so a re-encode still
    // resolves, but a poster never lands on the clip it was meant to cover.
    const found =
      candidates.find((f) => f === name) ??
      candidates.find((f) => isVideo(f) === isVideo(name)) ??
      candidates[0];
    if (!found) {
      missing.push(`${slug}/${file}`);
      return null;
    }
    return `../src/images/${slug}/${found}`;
  };
}

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const page = (c, content, pt) => {
  const title = `${c.title} — Gabriel Ganzarolli`;
  const description = c.description ?? c.headline;
  const url = `${SITE_URL}/work/${c.slug}.html`;
  const ogImage = `${SITE_URL}/og/${c.slug}.png`;

  // The Portuguese page, carried as data rather than as a second set of
  // elements. Duplicating the markup and hiding one copy with CSS looked
  // simpler until the reveal animation: src/case/main.js snapshots `.reveal`
  // once at load and unobserves each element after it fires, so the hidden
  // copy would be left outside that cycle and could stay invisible after a
  // switch. One DOM, swapped on demand, has no such failure.
  //
  // `<` is escaped so the markup inside cannot close this script element.
  const ptPayload = pt
    ? `\n    <script type="application/json" id="i18n-pt">${JSON.stringify(pt).replace(
        /</g,
        '\\u003c'
      )}</script>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(url)}" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Gabriel Ganzarolli" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(ogImage)}" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&display=swap"
      rel="stylesheet"
    />
  </head>

  <!-- GENERATED by scripts/build-cases.mjs from src/case/cases.js.
       Edit the case data, not this file. -->
  <body data-case="${esc(c.slug)}">
    <nav class="case-nav">
      <a class="home" href="../index.html">${esc(UI.en.home)}</a>
      <a href="../index.html#work" data-i18n="allWork">${esc(UI.en.allWork)}</a>
      ${
        pt
          ? `<button type="button" class="lang-toggle" data-lang-toggle>${esc(UI.en.switchTo)}</button>`
          : ''
      }
    </nav>

    <div id="case">${content}</div>

    <footer class="case-foot">
      <p>${esc(UI.en.footer)}</p>
      <a href="../index.html" data-i18n="backToWork">${esc(UI.en.backToWork)}</a>
    </footer>${ptPayload}

    <script type="module" src="/src/case/main.js"></script>
  </body>
</html>
`;
};

// Every case in Portuguese, built once: the "More work" list on a translated
// page has to name its siblings in the language the reader is in.
const CASES_PT_FULL = CASES.map((c) => applyTranslation(c, CASES_PT[c.slug]));

let written = 0;
const untranslated = [];
const problems = [];

for (const c of CASES) {
  const resolver = makeResolver(c.slug);
  const content = renderCaseHtml(c, resolver, 'en');

  const overlay = CASES_PT[c.slug];
  if (!overlay) untranslated.push(c.slug);

  for (const issue of translationIssues(c, overlay)) {
    problems.push(`${c.slug}: ${issue}`);
  }

  // Everything the switch has to replace, rendered once here rather than
  // reconstructed in the browser: the body, the two strings in <head> that a
  // tab and a shared link show, and the labels outside #case.
  const pt = overlay
    ? {
        html: renderCaseHtml(applyTranslation(c, overlay), resolver, 'pt', CASES_PT_FULL),
        title: `${applyTranslation(c, overlay).title} — Gabriel Ganzarolli`,
        description: overlay.description ?? c.description ?? c.headline,
        lang: HTML_LANG.pt,
        ui: { allWork: UI.pt.allWork, backToWork: UI.pt.backToWork, switchTo: UI.pt.switchTo },
        en: {
          title: `${c.title} — Gabriel Ganzarolli`,
          description: c.description ?? c.headline,
          lang: HTML_LANG.en,
          ui: { allWork: UI.en.allWork, backToWork: UI.en.backToWork, switchTo: UI.en.switchTo },
        },
      }
    : null;

  writeFileSync(resolvePath(root, 'work', `${c.slug}.html`), page(c, content, pt), 'utf8');
  written++;
}

console.log(`build-cases: wrote ${written} page(s)`);
if (untranslated.length) {
  console.log(
    `build-cases: ${untranslated.length} case(s) still English-only: ${untranslated.join(', ')}`
  );
}
if (problems.length) {
  console.log(`build-cases: translation problems:\n  ${problems.join('\n  ')}`);
}
if (missing.length) {
  console.log(`build-cases: ${missing.length} image(s) not found:\n  ${missing.join('\n  ')}`);
}
