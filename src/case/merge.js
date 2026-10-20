/**
 * Builds the Portuguese version of a case by laying its prose over the English
 * entry, which stays the single source of structure.
 *
 * Why not two parallel case files: the media placements are matched by name
 * (`after-takeaway-02`) and the renderer resolves them with `.find()`. If the
 * two languages ever disagreed about how many takeaways a case has, the figure
 * would simply not render — no error, no warning, just a missing image nobody
 * notices until someone reads the page in that language. Deriving one from the
 * other removes the possibility rather than testing for it.
 *
 * So a translation only ever supplies words. Anything a reader cannot read —
 * file names, placements, outcome figures, slugs, years — is taken from
 * English and is identical in both.
 */

/** Overlay one translated string, keeping the original when none was given. */
const pick = (translated, original) => (translated === undefined ? original : translated);

/**
 * Apply a case's Portuguese overlay. Returns a new object; neither input is
 * mutated, because the English entry is rendered too and must stay pristine.
 */
export function applyTranslation(en, pt) {
  if (!pt) return en;

  const media = pt.media ?? {};
  /** The overlay for one media item, found by its file name. */
  const m = (src) => media[src] ?? {};

  return {
    ...en,

    // Hero. `client`, `year` and the slug are deliberately absent: a bank's
    // name and a number do not get translated.
    title: pick(pt.title, en.title),
    headline: pick(pt.headline, en.headline),
    description: pick(pt.description, en.description),
    tag: pick(pt.tag, en.tag),
    discipline: pick(pt.discipline, en.discipline),
    role: pick(pt.role, en.role),
    duration: pick(pt.duration, en.duration),

    whatWeDid: pick(pt.whatWeDid, en.whatWeDid),
    whatMadeItWork: pick(pt.whatMadeItWork, en.whatMadeItWork),
    overview: pick(pt.overview, en.overview),

    // Usually only the caption is translated: a figure, its prefix and its
    // unit are the measurement and read the same in both languages.
    //
    // The exception is a result that is a word rather than a quantity — "a
    // wait that disappeared" has no number — and a word does need
    // translating. So an entry may be a bare string, which is the caption, or
    // `{ value, caption }` when the figure itself is language.
    outcomes: en.outcomes?.map((o, i) => {
      const src = pt.outcomes?.[i];
      if (src == null) return o;
      if (typeof src === 'string') return { ...o, caption: src };
      return { ...o, value: pick(src.value, o.value), caption: pick(src.caption, o.caption) };
    }),

    // `index` comes from English, so the chapter numbering and the media
    // placements that point at it cannot come apart.
    //
    // A translated takeaway gives `body` as one flat list of paragraphs. The
    // English case may split those across several sections, so the paragraphs
    // are dealt back out in order, each section keeping the count it had.
    takeaways: en.takeaways?.map((t, i) => {
      const src = pt.takeaways?.[i];
      if (!src) return t;

      const paras = src.body;
      let taken = 0;

      return {
        ...t,
        title: pick(src.title, t.title),
        sections: t.sections?.map((s, j) => {
          // A section can carry compact figures under its prose. Only the
          // label is translated — the figure is the measurement.
          const stats = s.stats?.map((st, k) => ({
            ...st,
            label: pick(src.stats?.[j]?.[k], st.label),
          }));

          if (!paras) return stats ? { ...s, stats } : s;

          const body = paras.slice(taken, taken + s.body.length);
          taken += s.body.length;
          // Short translation: keep English for the paragraphs it did not reach,
          // rather than dropping them off the page.
          return {
            ...s,
            body: body.length === s.body.length ? body : s.body,
            ...(stats ? { stats } : {}),
          };
        }),
      };
    }),

    notes: en.notes?.map((n, i) => ({
      ...n,
      title: pick(pt.notes?.[i]?.title, n.title),
      body: pick(pt.notes?.[i]?.body, n.body),
    })),

    getInTouch: en.getInTouch && {
      ...en.getInTouch,
      text: pick(pt.getInTouch?.text, en.getInTouch.text),
      button: pick(pt.getInTouch?.button, en.getInTouch.button),
    },

    images: en.images?.map((i) => ({
      ...i,
      alt: pick(m(i.src).alt, i.alt),
      caption: pick(m(i.src).caption, i.caption),
    })),

    videos: en.videos?.map((v) => ({
      ...v,
      alt: pick(m(v.src).alt, v.alt),
      caption: pick(m(v.src).caption, v.caption),
    })),

    // Keyed off the A-side file name, since a comparison is one unit.
    compareVideos: en.compareVideos?.map((v) => ({
      ...v,
      alt: pick(m(v.a).alt, v.alt),
      aLabel: pick(m(v.a).aLabel, v.aLabel),
      bLabel: pick(m(v.a).bLabel, v.bLabel),
      caption: pick(m(v.a).caption, v.caption),
    })),

    gif: en.gif && {
      ...en.gif,
      alt: pick(m(en.gif.src).alt, en.gif.alt),
      caption: pick(m(en.gif.src).caption, en.gif.caption),
    },
  };
}

/**
 * What a translation claims to describe but the English case does not have.
 *
 * Catches the quiet failure mode of keying by file name: rename a clip in
 * cases.js and its Portuguese alt text goes on describing a file that is no
 * longer there, leaving the English alt in place with nothing to say why.
 */
export function translationIssues(en, pt) {
  if (!pt) return [];

  const known = new Set(
    [
      ...(en.images ?? []).map((i) => i.src),
      ...(en.videos ?? []).map((v) => v.src),
      ...(en.compareVideos ?? []).flatMap((v) => [v.a, v.b]),
      en.gif?.src,
    ].filter(Boolean)
  );

  const issues = Object.keys(pt.media ?? {})
    .filter((src) => !known.has(src))
    .map((src) => `media "${src}" is translated but not used by the case`);

  const enCount = en.takeaways?.length ?? 0;
  const ptCount = pt.takeaways?.length ?? 0;
  if (ptCount && ptCount !== enCount) {
    issues.push(`${ptCount} takeaways translated but the case has ${enCount}`);
  }

  const enOut = en.outcomes?.length ?? 0;
  const ptOut = pt.outcomes?.length ?? 0;
  if (ptOut && ptOut !== enOut) {
    issues.push(`${ptOut} outcome captions translated but the case has ${enOut}`);
  }

  // Stats sit two levels down, inside a takeaway's sections, and are easy to
  // add to the English case without noticing the translation needs them too —
  // which is exactly how they shipped untranslated the first time.
  (en.takeaways ?? []).forEach((t, i) => {
    (t.sections ?? []).forEach((s, j) => {
      if (!s.stats?.length) return;
      const translated = pt.takeaways?.[i]?.stats?.[j];
      if (!translated) {
        issues.push(`takeaway ${t.index} section ${j}: ${s.stats.length} stat label(s) not translated`);
      } else if (translated.length !== s.stats.length) {
        issues.push(
          `takeaway ${t.index} section ${j}: ${translated.length} stat labels translated but there are ${s.stats.length}`
        );
      }
    });
  });

  return issues;
}

/**
 * Problems inside one case, regardless of language.
 *
 * Media is attached to a chapter by name — `after-takeaway-02` — and the
 * renderer resolves that with `.find()`, so a placement naming a chapter that
 * does not exist renders nothing and says nothing. A renumbering bug once
 * shifted every takeaway index in the file and three cases silently lost a
 * figure each; it survived several commits and a deploy because nothing ever
 * looked. This is that check.
 */
export function caseIssues(c) {
  const issues = [];
  const indices = (c.takeaways ?? []).map((t) => t.index);

  const expected = indices.map((_, i) => String(i + 1).padStart(2, '0'));
  if (indices.join() !== expected.join()) {
    issues.push(`takeaway indices are ${indices.join(', ')} — expected ${expected.join(', ')}`);
  }

  const chapters = new Set(indices.map((i) => `after-takeaway-${i}`));
  const placements = [
    ...(c.images ?? []),
    ...(c.videos ?? []),
    ...(c.compareVideos ?? []),
    c.gif,
  ].filter(Boolean);

  for (const m of placements) {
    const p = m.placement;
    if (p?.startsWith('after-takeaway-') && !chapters.has(p)) {
      issues.push(`"${m.src ?? m.a}" is placed at ${p}, which no takeaway provides`);
    }
  }

  return issues;
}
