import { CASES } from './cases.js';
import { imageUrl, reportMissing } from './images.js';
import { buildCompare } from './compare.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * A labelled row: small label in the left gutter, content in the right column.
 * This is the layout primitive the whole page is built from — it's what gives
 * the reference its "information displacement", and keeping it as one function
 * means every section lines up on the same grid without restating it.
 */
function row(label, content, { className = '' } = {}) {
  const section = el('section', `row ${className}`.trim());
  section.appendChild(el('h2', 'row-label', label));

  const body = el('div', 'row-body');
  for (const node of [].concat(content)) body.appendChild(node);
  section.appendChild(body);

  return section;
}

function renderHero(c, image) {
  const hero = el('header', 'case-hero');

  const eyebrow = el('div', 'case-eyebrow');
  eyebrow.appendChild(el('span', 'case-index', c.index));
  if (c.tag) eyebrow.appendChild(el('span', 'case-tag', c.tag));
  hero.appendChild(eyebrow);

  hero.appendChild(el('h1', 'case-title', c.title));
  hero.appendChild(el('p', 'case-headline', c.headline));

  const meta = el('dl', 'case-meta');
  const pairs = [
    ['Client', c.client],
    ['Year', c.year],
    ['Discipline', c.discipline],
    ['Role', c.role],
    ['Duration', c.duration],
  ];
  for (const [k, v] of pairs) {
    if (!v) continue;
    // Each label/value pair is wrapped so it stays together as one grid cell.
    // Loose dt/dd children flow independently and split across rows once the
    // column narrows, which puts a value under someone else's label.
    const cell = el('div', 'meta-pair');
    cell.appendChild(el('dt', null, k));
    cell.appendChild(el('dd', null, v));
    meta.appendChild(cell);
  }
  hero.appendChild(meta);

  // The cover sits beside the facts rather than as a band underneath, so the
  // first screen carries both what the project was and what it looked like.
  const media = image('after-cover');
  if (media) {
    media.classList.add('hero-media');
    media.classList.remove('reveal'); // above the fold; nothing to reveal into
    hero.appendChild(media);
  } else {
    hero.classList.add('is-textonly');
  }

  return hero;
}

function renderWhatWeDid(c) {
  const ul = el('ul', 'did-list');
  for (const item of c.whatWeDid ?? []) ul.appendChild(el('li', 'reveal', item));
  return row('What I did', ul);
}

function renderOutcomes(c) {
  // No figures, no section — an "Outcomes" label over empty space reads as a
  // page that failed to load rather than as a deliberate omission.
  if (!c.outcomes?.length) return null;

  const grid = el('div', 'outcomes');

  for (const o of c.outcomes ?? []) {
    const item = el('div', 'outcome reveal');

    // The numeral is one line: optional prefix, the value, then a raised unit —
    // the shape the reference uses for $100M / 2X / 60%.
    const fig = el('p', 'outcome-figure');
    if (o.prefix) fig.appendChild(el('span', 'outcome-prefix', o.prefix));
    fig.appendChild(el('span', 'outcome-value', o.value));
    if (o.unit) fig.appendChild(el('span', 'outcome-unit', o.unit));

    item.appendChild(fig);
    item.appendChild(el('p', 'outcome-caption', o.caption));
    grid.appendChild(item);
  }

  return row('Outcomes', grid);
}

function renderOverview(c) {
  const prose = el('div', 'prose');
  for (const p of c.overview ?? []) prose.appendChild(el('p', 'reveal', p));
  return row('Overview', prose);
}

function renderQuote(c) {
  if (!c.quote) return null;

  const fig = el('figure', 'pull-quote reveal');
  fig.appendChild(el('blockquote', null, `“${c.quote.text}”`));

  const cap = el('figcaption');
  cap.appendChild(el('span', 'quote-name', c.quote.name));
  if (c.quote.role) cap.appendChild(el('span', 'quote-role', c.quote.role));
  fig.appendChild(cap);

  return fig;
}

function renderTakeaways(c, image) {
  const takeaways = c.takeaways ?? [];
  if (!takeaways.length) return [];

  const nodes = [];

  // Index first — the reference lists the chapters before expanding them.
  const list = el('ol', 'takeaway-index');
  for (const t of takeaways) {
    const li = el('li', 'reveal');
    li.appendChild(el('span', 'takeaway-num', t.index));
    li.appendChild(el('span', 'takeaway-name', t.title));
    list.appendChild(li);
  }
  nodes.push(row(`${takeaways.length} takeaways`, list, { className: 'row-index' }));

  for (const t of takeaways) {
    const chapter = el('section', 'chapter');

    const head = el('div', 'chapter-head reveal');
    head.appendChild(el('p', 'chapter-num', t.index));
    head.appendChild(el('h2', 'chapter-title', t.title));
    chapter.appendChild(head);

    for (const s of t.sections ?? []) {
      const sub = el('div', 'chapter-section');
      // Sections may omit the gutter sub-title; an empty h3 would still
      // occupy the column and misalign the prose beside it.
      if (s.title) sub.appendChild(el('h3', 'chapter-sub reveal', s.title));

      const prose = el('div', 'prose');
      for (const p of s.body ?? []) prose.appendChild(el('p', 'reveal', p));
      sub.appendChild(prose);

      // Supporting figures. Deliberately smaller than the Outcomes numerals:
      // these are evidence for the point just made, not headline results, and
      // sizing them the same would flatten that distinction.
      if (s.stats?.length) {
        const list = el('dl', 'stat-list reveal');
        for (const st of s.stats) {
          const cell = el('div', 'stat');
          cell.appendChild(el('dt', 'stat-value', st.value));
          cell.appendChild(el('dd', 'stat-label', st.label));
          list.appendChild(cell);
        }
        sub.appendChild(list);
      }

      if (s.quote) {
        const q = el('figure', 'inline-quote reveal');
        q.appendChild(el('blockquote', null, `“${s.quote.text}”`));
        q.appendChild(el('figcaption', null, s.quote.name));
        sub.appendChild(q);
      }

      chapter.appendChild(sub);
    }

    nodes.push(chapter);

    // Each chapter is followed by its own image, so the imagery is read as
    // evidence for the point just made rather than as a gallery at the end.
    const after = image(`after-takeaway-${t.index}`);
    if (after) nodes.push(after);
  }

  return nodes;
}

/**
 * One image at a given placement, or null if that file has not been added yet.
 *
 * Per the brief: no frame, no shadow, no device mockup, no typographic overlay.
 * The screen compositions already sit on black and meet the page background
 * seamlessly, so the figure adds nothing around them.
 */
function renderImage(c, placement) {
  const spec = (c.images ?? []).find((i) => i.placement === placement);
  if (!spec) return null;

  const url = imageUrl(c.slug, spec.src);
  if (!url) return null; // not supplied yet — section simply omits it

  const fig = el('figure', 'case-figure reveal');
  if (spec.width && spec.width !== 'full') fig.dataset.width = String(spec.width);

  const img = document.createElement('img');
  img.src = url;
  img.alt = spec.alt ?? '';
  // The cover is above the fold on every case page; everything below it is not.
  img.loading = placement === 'after-cover' ? 'eager' : 'lazy';
  img.decoding = 'async';
  fig.appendChild(img);

  if (spec.caption) fig.appendChild(el('figcaption', null, spec.caption));

  return fig;
}

function renderMadeItWork(c) {
  if (!c.whatMadeItWork?.length) return null;
  const ul = el('ul', 'did-list');
  for (const item of c.whatMadeItWork) ul.appendChild(el('li', 'reveal', item));
  return row('What made it work', ul);
}

function renderMore(current) {
  const others = CASES.filter((c) => c.slug !== current.slug);
  const ol = el('ol', 'more-list');

  for (const c of others) {
    const li = el('li', 'more-item reveal');
    const a = el('a');
    a.href = `./${c.slug}.html`;
    a.appendChild(el('span', 'more-num', c.index));
    a.appendChild(el('span', 'more-title', c.title));
    a.appendChild(el('span', 'more-meta', c.discipline));
    li.appendChild(a);
    ol.appendChild(li);
  }

  return row('More work', ol, { className: 'row-more' });
}

/** Builds the whole case page into `mount`. */
export function renderCase(c, mount) {
  document.title = `${c.title} — Gabriel Ganzarolli`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', c.headline);

  reportMissing(c.slug, c.images ?? []);
  const image = (placement) => renderImage(c, placement);

  // The cover is consumed by the hero, so it is not repeated below.
  mount.appendChild(renderHero(c, image));

  // A before/after comparison takes the hero image's place when a case has one.
  const compare = buildCompare(c.slug, c.compare);

  // Page order is fixed by the brief; images sit between sections rather than
  // inside them, so they run the full width of the container.
  const main = el('main', 'case-body');
  const parts = [
    compare,
    renderWhatWeDid(c),
    renderOutcomes(c),
    renderOverview(c),
    image('after-overview'),
    renderQuote(c),
    ...renderTakeaways(c, image),
    // 'closing' is still a supported placement; no case currently uses one.
    image('closing'),
    renderMadeItWork(c),
    renderMore(c),
  ];
  for (const part of parts) if (part) main.appendChild(part);
  mount.appendChild(main);
}
