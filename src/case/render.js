import { CASES } from './cases.js';

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

function renderHero(c) {
  const hero = el('header', 'case-hero');
  hero.appendChild(el('p', 'case-index', c.index));
  hero.appendChild(el('h1', 'case-title', c.title));
  hero.appendChild(el('p', 'case-headline', c.headline));

  const meta = el('dl', 'case-meta');
  const pairs = [
    ['Year', c.year],
    ['Discipline', c.discipline],
    ['Role', c.role],
    ['Duration', c.duration],
  ];
  for (const [k, v] of pairs) {
    if (!v) continue;
    meta.appendChild(el('dt', null, k));
    meta.appendChild(el('dd', null, v));
  }
  hero.appendChild(meta);

  return hero;
}

function renderWhatWeDid(c) {
  const ul = el('ul', 'did-list');
  for (const item of c.whatWeDid ?? []) ul.appendChild(el('li', 'reveal', item));
  return row('What I did', ul);
}

function renderOutcomes(c) {
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

function renderTakeaways(c) {
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
      sub.appendChild(el('h3', 'chapter-sub reveal', s.title));

      const prose = el('div', 'prose');
      for (const p of s.body ?? []) prose.appendChild(el('p', 'reveal', p));
      sub.appendChild(prose);

      if (s.quote) {
        const q = el('figure', 'inline-quote reveal');
        q.appendChild(el('blockquote', null, `“${s.quote.text}”`));
        q.appendChild(el('figcaption', null, s.quote.name));
        sub.appendChild(q);
      }

      chapter.appendChild(sub);
    }

    nodes.push(chapter);
  }

  return nodes;
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

  mount.appendChild(renderHero(c));

  const main = el('main', 'case-body');
  const parts = [
    renderWhatWeDid(c),
    renderOutcomes(c),
    renderOverview(c),
    renderQuote(c),
    ...renderTakeaways(c),
    renderMore(c),
  ];
  for (const part of parts) if (part) main.appendChild(part);
  mount.appendChild(main);
}
