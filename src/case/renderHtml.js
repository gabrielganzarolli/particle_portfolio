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

/**
 * A looping walkthrough as an animated GIF.
 *
 * A GIF cannot be paused, so the only way to respect someone who has asked
 * their system for less motion is to serve a still instead. `<picture>` does
 * that natively, with no script: the media query is evaluated by the browser
 * before anything is fetched, so a reduced-motion visitor never downloads the
 * animation at all.
 */
function gif(c, placement, resolve) {
  const g = c.gif;
  if (!g || (g.placement ?? 'after-overview') !== placement) return '';

  const src = resolve(c.slug, g.src);
  if (!src) return '';
  const still = g.still ? resolve(c.slug, g.still) : null;

  // Explicit dimensions so the figure holds its space before the file lands.
  const dims = g.width && g.height ? ` width="${esc(g.width)}" height="${esc(g.height)}"` : '';
  const img =
    `<img src="${esc(src)}" alt="${esc(g.alt ?? '')}"${dims} loading="lazy" decoding="async">`;

  return (
    `<figure class="case-figure reveal">` +
    (still
      ? `<picture>` +
        `<source srcset="${esc(still)}" media="(prefers-reduced-motion: reduce)">` +
        img +
        `</picture>`
      : img) +
    (g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

/**
 * The <video> element for a looping walkthrough, without the surrounding figure.
 *
 * These carry no visible control, by request. That is a real cost and worth
 * knowing about: an autoplaying loop with no pause is the accessibility barrier
 * the brief originally called out, and it is why video.js still refuses to
 * start anything when the visitor has asked for reduced motion, and stops a
 * clip the moment it scrolls out of view. Restoring a control means adding
 * `controls` here and bringing back the button in video.js.
 *
 * `preload="none"` because a case page can carry several of these; fetching
 * them all on load would cost tens of megabytes for clips most visitors never
 * scroll to. The poster is what holds the space and shows the first frame, so
 * nothing looks unloaded while waiting.
 */
function videoEl({ src, poster, alt, width, height }) {
  // The box has to be right before anything loads, and `preload="none"` means
  // nothing loads until the clip is scrolled to. The width/height attributes
  // alone are not enough: the stylesheet gives these a definite width and lets
  // the height follow, and a width attribute does not drive that — so the ratio
  // is stated as `aspect-ratio` too. Without it the element sits at the default
  // 300x150 (or collapses to nothing inside a shrink-to-fit wrapper) and the
  // page jumps when the poster finally decodes.
  const dims = width && height ? ` width="${esc(width)}" height="${esc(height)}"` : '';
  const ratio = width && height ? ` style="aspect-ratio:${esc(width)}/${esc(height)}"` : '';

  return (
    `<video class="case-video" src="${esc(src)}"` +
    (poster ? ` poster="${esc(poster)}"` : '') +
    dims +
    ratio +
    ` autoplay loop muted playsinline preload="none" ` +
    `aria-label="${esc(alt ?? '')}"></video>`
  );
}

/**
 * Every looping walkthrough at a given placement, in data order. A chapter can
 * carry more than one — the decline and the approval are two halves of the same
 * fork and belong together under the takeaway that explains them.
 */
function video(c, placement, resolve) {
  const hero = placement === 'after-cover';
  const cls = hero ? 'case-figure video-figure hero-media' : 'case-figure video-figure reveal';

  return (c.videos ?? [])
    .filter((v) => v.placement === placement)
    .map((spec) => {
      const src = resolve(c.slug, spec.src);
      if (!src) return ''; // not supplied yet — the page simply omits it
      const poster = spec.poster ? resolve(c.slug, spec.poster) : null;
      const width = spec.width && spec.width !== 'full' ? ` data-width="${esc(spec.width)}"` : '';

      return (
        `<figure class="${cls}"${width}>` +
        videoEl({ src, poster, alt: spec.alt, width: spec.w, height: spec.h }) +
        (spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : '') +
        `</figure>`
      );
    })
    .join('');
}

/**
 * Two versions of the same screen, side by side with a label above each.
 *
 * Not the draggable divider used for the before/after stills: dragging a split
 * between two clips that are both moving gives you two half-legible videos and
 * no comparison. Two whole frames, each labelled, is the readable form.
 */
function compareVideo(c, placement, resolve) {
  const spec = (c.compareVideos ?? []).find((v) => v.placement === placement);
  if (!spec) return '';

  const a = resolve(c.slug, spec.a);
  const b = resolve(c.slug, spec.b);
  if (!a || !b) return '';

  const side = (src, posterSrc, label, alt, w, h) =>
    `<div class="cv-side">` +
    `<p class="cv-label">${esc(label)}</p>` +
    videoEl({
      src,
      poster: posterSrc ? resolve(c.slug, posterSrc) : null,
      alt,
      width: w,
      height: h,
    }) +
    `</div>`;

  const alt = spec.alt ?? '';
  const la = spec.aLabel ?? 'A';
  const lb = spec.bLabel ?? 'B';

  return (
    `<figure class="case-figure compare-video reveal">` +
    `<div class="cv-pair">` +
    side(a, spec.aPoster, la, `${alt} — ${la.toLowerCase()}`.trim(), spec.aW, spec.aH) +
    side(b, spec.bPoster, lb, `${alt} — ${lb.toLowerCase()}`.trim(), spec.bW, spec.bH) +
    `</div>` +
    (spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

/** Whatever media sits at this placement — at most one kind is ever present. */
const media = (c, placement, resolve) =>
  image(c, placement, resolve) +
  gif(c, placement, resolve) +
  video(c, placement, resolve) +
  compareVideo(c, placement, resolve);

function hero(c, resolve) {
  // A case leads with a still or with a looping clip, never both.
  const cover = image(c, 'after-cover', resolve, { hero: true }) || video(c, 'after-cover', resolve);

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
    `<header class="case-hero${cover ? '' : ' is-textonly'}">` +
    `<div class="case-eyebrow">` +
    `<span class="case-index">${esc(c.index)}</span>` +
    (c.tag ? `<span class="case-tag">${esc(c.tag)}</span>` : '') +
    `</div>` +
    `<h1 class="case-title">${esc(c.title)}</h1>` +
    `<p class="case-headline">${esc(c.headline)}</p>` +
    `<dl class="case-meta">${meta}</dl>` +
    cover +
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
    out += media(c, `after-takeaway-${t.index}`, resolve);
  }

  return out;
}

/**
 * Short-form notes: a label in the gutter and a few sentences beside it.
 * Deliberately lighter than a takeaway chapter — that weight is what makes a
 * long case long. Each note can be followed by its own image.
 */
function notes(c, resolve) {
  const list = c.notes ?? [];
  if (!list.length) return '';

  return list
    .map((n, i) => {
      const body = `<div class="prose"><p class="reveal">${esc(n.body)}</p></div>`;
      return row(n.title, body, 'row-note') + media(c, `after-notes-${i + 1}`, resolve);
    })
    .join('');
}

function getInTouch(c) {
  const g = c.getInTouch;
  if (!g) return '';

  const button = g.button
    ? `<a class="contact-button reveal" href="${esc(g.href ?? '#')}">${esc(g.button)}</a>`
    : '';

  return row(
    'Get in touch',
    `<div class="contact"><p class="contact-text reveal">${esc(g.text)}</p>${button}</div>`,
    'row-contact'
  );
}

/**
 * A set of images presented as one block. The tall piece leads and the wider
 * ones stack beside it, so three different aspect ratios read as a single
 * composition instead of three unrelated bands. No caption and no label — the
 * images speak for themselves; alt text carries them for anyone who cannot.
 */
function group(c, resolve) {
  const g = c.group;
  if (!g) return '';

  const lead = resolve(c.slug, g.lead);
  if (!lead) return '';

  const shot = (src, alt) =>
    `<img src="${esc(src)}" alt="${esc(alt ?? '')}" loading="lazy" decoding="async">`;

  const rest = (g.rest ?? [])
    .map((r) => {
      const u = resolve(c.slug, r.src);
      return u ? shot(u, r.alt) : '';
    })
    .join('');

  // Two images of very different proportions do not split into columns well —
  // equalising their heights would leave one of them tiny. Below three, stack.
  const count = 1 + (g.rest?.length ?? 0);

  return (
    `<figure class="case-figure gallery-figure reveal">` +
    `<div class="gallery" data-count="${count}">` +
    `<div class="gallery-lead">${shot(lead, g.leadAlt)}</div>` +
    (rest ? `<div class="gallery-stack">${rest}</div>` : '') +
    `</div>` +
    `</figure>`
  );
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
    media(c, 'after-overview', resolve),
    takeaways(c, resolve),
    notes(c, resolve),
    media(c, 'closing', resolve),
    group(c, resolve),
    listRow('What made it work', c.whatMadeItWork),
    getInTouch(c),
    more(c),
  ].join('');

  return hero(c, resolve) + `<main class="case-body">${body}</main>`;
}
