# Case copy — editorial pass, 2026-09-28

Two problems found while reviewing the case pages. Both are fixed. This
records what changed and why, so the reasoning survives the edit.

All copy lives in `src/case/cases.js`; the `work/*.html` pages are generated.
Regenerate with `npm run cases`.

---

## 1. Two cases read as walls of text — fixed

Seleção de Prêmios and the ATM case ran 29–30 word sentences against the 22
word average of the other three, with paragraphs up to 125 words. Structure
was never the problem — every case has the same shape (overview, three
takeaways).

**Decision at the time:** tighten, keep every point. No takeaway dropped.
Only the two outliers touched; the other three already read at the right
density. (Superseded in part — see §3, where the Seleção compliance takeaway
was later removed outright.)

**Result**, against the untouched cases as the benchmark:

| case | avg sentence | longest para | paras over 70w |
|---|---|---|---|
| selecao-de-premios | 30w → **17w** | 125w → **58w** | 3 → **0 of 10** |
| atm-accessibility | 29w → **20w** | 96w → **70w** | 2 → **0 of 10** |
| retiree-hub *(untouched)* | 22w | 68w | 0 of 5 |
| minhas-vantagens-console *(untouched)* | 22w | 60w | 0 of 4 |

**What actually did the work** — in order of effect:

1. **Splitting run-on sentences.** The biggest lever by far. Three-clause
   chains joined by em-dashes became two or three sentences. Nothing was cut
   to achieve this.
2. **Splitting paragraphs at their existing seams.** `.prose` is a CSS grid
   (`case.css:232`) so it takes any number of paragraphs, and takeaway
   `body` is already an array. Both overviews went from 2 dense blocks to 4
   short ones; long takeaways split where they changed subject. This is what
   removed the "wall" feeling — the word count barely moved.
3. **Pulling metrics out of subordinate clauses.** `19.7MM` and "ten times
   the benchmark" used to land at the tail of a 60-word sentence.

**Note on word count:** total words are roughly flat, not down 25–30% as
first proposed. Cutting that much and keeping every point were incompatible
goals, and keeping every point won. What changed is density and rhythm, which
is what made the pages feel heavy — not their length.

---

## 2. The Uniclass case never stated its own strategy — fixed

The case is about **selling the account by leading with the card and its
benefits.** That inversion was stated once, in the Overview, and never again.

"card" appeared in 12 fields, "account" in 3 — two of which are invisible to a
reader (the SEO `description` and a video `alt`). So on the visible page the
word appeared exactly once, below everything a skimmer reads first: the
headline, the title, and the outcome figures all said *card* only.

**Changed:**

- **Headline** — "Leading with the card people actually came for" →
  **"The card they came for, the account they left with."** Carries both
  halves; breaks across two lines with the pivot at the comma.
- **Outcome captions** — "…to application start" → "…to **account**
  application"; "in-app resumption step" → "in-app **account** resumption
  step." The numbers a skimmer jumps to now say what they are about.
- **Takeaway 01** — one closing sentence tying the monthly savings figure back
  to the account application it was in service of. It built the figure out of
  card benefits and never closed the loop.

**Open, and deliberately left to you:** the headline is a voice decision I
made rather than one you chose. The other candidates were "Selling the account
by leading with the card" and "Leading with the card to win the account."
One line in `cases.js` to swap.

This case measured fine on density (23w sentences) and was left alone
otherwise — clarity and length were separate problems.

---

## 3. Where the length actually comes from — and the compliance cut

Trimming prose barely moved the pages, which prompted a measurement of what
they are actually made of. On Seleção, at 12.9 screens:

| share | what |
|---|---|
| **40%** | media — 4 full-bleed figures at ~840px each |
| 22% | chapter text |
| 7% | overview |
| 31% | hero, outcomes, More work, What made it work, takeaways index, What I did |

**Prose was 29% of the page.** That is why the earlier sentence-level pass
changed nothing visible. Measured live in the browser: capping figure width
at 680px gives −10%; tightening chapter type and padding gives −7%; dropping
the takeaways index gives −4%.

A single chapter breaks down as body copy 42%, heading 22%, padding and gap
36% — so halving the writing in a chapter shrinks it by about a fifth. The
title is 56px against 16px body.

**Removed:** the Seleção takeaway 02, *Compliance is content design*, at the
author's request. Knock-on changes handled with it:

- Takeaway 03 renumbered to 02; the index label is computed from the list
  length, so it says "2 takeaways" on its own.
- `04-how-it-works.png` unplaced. It illustrated that chapter and its caption
  carried the argument ("The rules, written where the decision happens…"), so
  it had nothing left to support. The file remains in `src/images/`.
- `05-progression.png` moved from `after-takeaway-03` to `after-takeaway-02`,
  which would otherwise never render with only two takeaways.
- The `580 support cases` outcome lost the chapter that explained it. Kept as
  a figure — low support volume at scale stands on its own — but its caption
  was cut back to match the plain style of its siblings.

Result: **12.9 → 10.6 screens, −18%.**

Still open, in order of remaining impact: constraining or pairing the
full-bleed figures (40% of the page), cutting the takeaways index across all
five cases, and dropping "What made it work" — five bullets of platform
engineering (LE3, Kafka, Devin) in a product design case.

---

## Measuring

```
node --input-type=module -e '
const {CASES} = await import("./src/case/cases.js");
const w = s => String(s||"").trim().split(/\s+/).filter(Boolean).length;
const sent = s => String(s).split(/(?<=[.!?])\s+/).filter(Boolean).length;
for (const c of CASES) {
  const paras = [...(c.overview??[]),
    ...(c.takeaways??[]).flatMap(t=>(t.sections??[]).flatMap(s=>s.body??[]))];
  const ws = paras.map(w);
  const total = ws.reduce((a,b)=>a+b,0);
  console.log(String(total).padStart(4),
    "avg-sent", String(Math.round(total/paras.map(sent).reduce((a,b)=>a+b,0))).padStart(2)+"w",
    "longest", String(Math.max(...ws)).padStart(3)+"w",
    "over-70w", String(ws.filter(x=>x>70).length)+"/"+ws.length, c.slug);
}'
```
