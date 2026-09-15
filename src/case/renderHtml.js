import { CASES } from './cases.js';

/**
 * Case markup as a string, with no DOM involved.
 *
 * This runs in Node at build time (scripts/build-cases.mjs) so the text ships
 * inside the HTML the server sends. It used to run in the browser and build the
 * page with createElement, which meant a shared link previewed empty, search
 * engines saw nothing, and a failed bundle left a blank page.
 *
 * The markup here must stay identical to what the DOM version produced — the
 * stylesheet is unchanged, so any difference in tags or class names would show
 * up as a visual change.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Label in the left gutter, content in the right column. */
const row = (label, body, className = '') =>
  `<section class="row${className ? ' ' + className : ''}">` +
  `<h2 class="row-label">${esc(label)}</h2>` +
  `<div class="row-body">${body}</div>` +
  `</section>`;

/**
 * One image at a given placement, or '' if that file has not been added yet.
 *
 * Per the brief: no frame, no shadow, no device mockup, no typographic overlay.
 */
function image(c, placement, resolve, { hero = false } = {}) {
  const spec = (c.images ?? []).find((i) => i.placement === placement);
  if (!spec) return '';

  const url = resolve(c.slug, spec.src);
  if (!url) return ''; // not supplied yet — section simply omits it

  // The cover is above the fold on every case page; everything below is not.
  const eager = placement === 'after-cover';
  const width = spec.width && spec.width !== 'full' ? ` data-width="${esc(spec.width)}"` : '';
  const cls = hero ? 'case-figure hero-media' : 'case-figure reveal';

  return (
    `<figure class="${cls}"${width}>` +
    `<img src="${esc(url)}" alt="${esc(spec.alt ?? '')}" ` +
    `loading="${eager ? 'eager' : 'lazy'}" decoding="async">` +
    (spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

function hero(c, resolve) {
  const media = image(c, 'after-cover', resolve, { hero: true });

  const meta = [
    ['Client', c.client],
    ['Year', c.year],
    ['Discipline', c.discipline],
    ['Role', c.role],
    ['Duration', c.duration],
  ]
    // Each pair is wrapped so it stays together as one grid cell. Loose dt/dd
    // children flow independently and split across rows once the column
    // narrows, putting a value under someone else's label.
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="meta-pair"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');

  return (
    `<header class="case-hero${media ? '' : ' is-textonly'}">` +
    `<div class="case-eyebrow">` +
    `<span class="case-index">${esc(c.index)}</span>` +
    (c.tag ? `<span class="case-tag">${esc(c.tag)}</span>` : '') +
    `</div>` +
    `<h1 class="case-title">${esc(c.title)}</h1>` +
    `<p class="case-headline">${esc(c.headline)}</p>` +
    `<dl class="case-meta">${meta}</dl>` +
    media +
    `</header>`
  );
}

/**
 * Before/after comparison. Only the markup lives here; the drag and keyboard
 * behaviour is attached in the browser by compare.js.
 */
function compare(c, resolve) {
  const spec = c.compare;
  if (!spec) return '';

  const before = resolve(c.slug, spec.before);
  const after = resolve(c.slug, spec.after);
  if (!before || !after) return '';

  const lb = spec.labelBefore ?? 'Before';
  const la = spec.labelAfter ?? 'After';
  const alt = spec.alt ?? '';

  return (
    `<figure class="compare reveal">` +
    `<div class="compare-frame" style="--pos:50%">` +
    `<img class="compare-img" src="${esc(before)}" ` +
    `alt="${esc(`${alt} — ${lb.toLowerCase()}`.trim())}" decoding="async">` +
    `<div class="compare-after">` +
    `<img class="compare-img" src="${esc(after)}" ` +
    `alt="${esc(`${alt} — ${la.toLowerCase()}`.trim())}" decoding="async">` +
    `</div>` +
    `<span class="compare-tag is-before">${esc(lb)}</span>` +
    `<span class="compare-tag is-after">${esc(la)}</span>` +
    // Rendered with its resting value so the control is complete and operable
    // before any script runs.
    `<button type="button" class="compare-handle" role="slider" ` +
    `aria-label="${esc(`Compare ${lb.toLowerCase()} and ${la.toLowerCase()}`)}" ` +
    `aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" ` +
    `aria-valuetext="${esc(`50% ${lb.toLowerCase()}, 50% ${la.toLowerCase()}`)}" ` +
    `aria-orientation="horizontal"></button>` +
    `</div>` +
    (spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

const listRow = (label, items) =>
  items?.length
    ? row(label, `<ul class="did-list">${items.map((i) => `<li class="reveal">${esc(i)}</li>`).join('')}</ul>`)
    : '';

function outcomes(c) {
  // No figures, no section — an "Outcomes" label over empty space reads as a
  // page that failed to load rather than as a deliberate omission.
  if (!c.outcomes?.length) return '';

  const cells = c.outcomes
    .map(
      (o) =>
        `<div class="outcome reveal">` +
        `<p class="outcome-figure">` +
        (o.prefix ? `<span class="outcome-prefix">${esc(o.prefix)}</span>` : '') +
        `<span class="outcome-value">${esc(o.value)}</span>` +
        (o.unit ? `<span class="outcome-unit">${esc(o.unit)}</span>` : '') +
        `</p>` +
        `<p class="outcome-caption">${esc(o.caption)}</p>` +
        `</div>`
    )
    .join('');

  return row('Outcomes', `<div class="outcomes">${cells}</div>`);
}

const prose = (paras) =>
  `<div class="prose">${(paras ?? []).map((p) => `<p class="reveal">${esc(p)}</p>`).join('')}</div>`;

function takeaways(c, resolve) {
  const list = c.takeaways ?? [];
  if (!list.length) return '';

  // Index first — the reference lists the chapters before expanding them.
  const index = list
    .map(
      (t) =>
        `<li class="reveal">` +
        `<span class="takeaway-num">${esc(t.index)}</span>` +
        `<span class="takeaway-name">${esc(t.title)}</span>` +
        `</li>`
    )
    .join('');

  let out = row(`${list.length} takeaways`, `<ol class="takeaway-index">${index}</ol>`, 'row-index');

  for (const t of list) {
    const sections = (t.sections ?? [])
      .map((s) => {
        // Sections may omit the gutter sub-title; an empty h3 would still
        // occupy the column and misalign the prose beside it.
        const sub = s.title ? `<h3 class="chapter-sub reveal">${esc(s.title)}</h3>` : '';

        // Supporting figures, deliberately smaller than the Outcomes numerals:
        // these are evidence for the point just made, not headline results.
        const stats = s.stats?.length
          ? `<dl class="stat-list reveal">` +
            s.stats
              .map(
                (st) =>
                  `<div class="stat">` +
                  `<dt class="stat-value">${esc(st.value)}</dt>` +
                  `<dd class="stat-label">${esc(st.label)}</dd>` +
                  `</div>`
              )
              .join('') +
            `</dl>`
          : '';

        const quote = s.quote
          ? `<figure class="inline-quote reveal">` +
            `<blockquote>${esc(`“${s.quote.text}”`)}</blockquote>` +
            `<figcaption>${esc(s.quote.name)}</figcaption>` +
            `</figure>`
          : '';

        return `<div class="chapter-section">${sub}${prose(s.body)}${stats}${quote}</div>`;
      })
      .join('');

    out +=
      `<section class="chapter">` +
      `<div class="chapter-head reveal">` +
      `<p class="chapter-num">${esc(t.index)}</p>` +
      `<h2 class="chapter-title">${esc(t.title)}</h2>` +
      `</div>` +
      sections +
      `</section>`;

    // Each chapter is followed by its own image, so the imagery reads as
    // evidence for the point just made rather than as a gallery at the end.
    out += image(c, `after-takeaway-${t.index}`, resolve);
  }

  return out;
}

function more(current) {
  const items = CASES.filter((c) => c.slug !== current.slug)
    .map(
      (c) =>
        `<li class="more-item reveal">` +
        `<a href="./${esc(c.slug)}.html">` +
        `<span class="more-num">${esc(c.index)}</span>` +
        `<span class="more-title">${esc(c.title)}</span>` +
        `<span class="more-meta">${esc(c.discipline)}</span>` +
        `</a></li>`
    )
    .join('');

  return row('More work', `<ol class="more-list">${items}</ol>`, 'row-more');
}

/** The full contents of the #case container, as a string. */
export function renderCaseHtml(c, resolve) {
  // Page order is fixed by the brief; images sit between sections rather than
  // inside them, so they run the full width of the container.
  const body = [
    compare(c, resolve),
    listRow('What I did', c.whatWeDid),
    outcomes(c),
    row('Overview', prose(c.overview)),
    image(c, 'after-overview', resolve),
    takeaways(c, resolve),
    // 'closing' is still a supported placement; no case currently uses one.
    image(c, 'closing', resolve),
    listRow('What made it work', c.whatMadeItWork),
    more(c),
  ].join('');

  return hero(c, resolve) + `<main class="case-body">${body}</main>`;
}
