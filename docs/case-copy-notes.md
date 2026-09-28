# Case copy — open editorial work

Two unrelated problems found on 2026-09-28 while reviewing the case pages.
Both live in `src/case/cases.js`; neither needs renderer or CSS changes.
Regenerate with `npm run cases` after editing.

---

## 1. Two cases run long — approved in principle, not started

Measured body prose — overview paragraphs plus takeaway bodies, which is what
the reader actually reads through. Reproduce with the snippet at the bottom.

| prose words | avg sentence | longest para | case |
|---|---|---|---|
| **456** | **30w** | **125w / 3 sentences** | selecao-de-premios |
| **463** | **29w** | 96w (both overview paras >90w) | atm-accessibility |
| 352 | 23w | 83w | uniclass-card-first-acquisition |
| 263 | 22w | 68w | retiree-hub |
| 216 | 22w | 60w | minhas-vantagens-console |

The bottom three are the healthy pattern. The top two run 30–35% longer
sentences and roughly double the paragraph length. Structure is not the
problem — every case has the same shape (2 overview paragraphs, 3 takeaways).

**Decided:** tighten the writing, keep every point. No takeaway gets dropped —
the 3-takeaway index is a structural rhythm across all five pages. Touch only
the two outliers; the other three already read at the right density.

**Targets**, derived from the lighter cases rather than picked arbitrarily:
~22-word average sentence, no paragraph over ~70 words. That takes
selecao-de-premios 456 → ~320 and atm-accessibility 463 → ~330, landing both
between retiree-hub (263) and uniclass (352).

**Method** — every argument, metric and concrete detail survives; only
sentence construction changes:

- Break 40-word chains into two sentences. Keep em-dash asides that carry a
  real aside; drop them where they splice a third clause onto a full sentence.
- Pull metrics out of subordinate clauses into their own short sentence.
  `19.7MM` and "ten times the benchmark" currently land at the end of a
  60-word sentence.
- Cut throat-clearing that restates the heading. "That rule did more for trust
  than any visual reassurance could" is the takeaway title in other words.

**Worked example** — selecao-de-premios, takeaway 03, the worst offender
(125 words, 3 sentences, ~42 w/sentence):

> **Before** — "We studied what genuinely brings people back to a game: a
> weekly rhythm, a reward that arrives immediately, and a slower progression
> underneath it — level in the programme meant more lucky numbers, so a
> long-standing customer saw the relationship they already had reflected in
> their odds. Launching to the entire base at once meant a spike in the first
> minutes rather than a curve, so planning what loads first, what can wait,
> and what a customer sees if something is slow — with engineering and
> marketing, ahead of time — was as much a part of the design as the screens
> themselves. The platform held: reach on campaign communications ran to
> 19.7MM, and enrolment came in at roughly ten times the previous internal
> benchmark."

> **After** (89 words, 5 sentences, ~18 w/sentence) — "We studied what brings
> people back to a game: a weekly rhythm, an immediate reward, and a slower
> progression underneath. Level in the programme meant more lucky numbers, so
> a long-standing customer saw their relationship reflected in their odds.
> Launching to the whole base at once meant a spike, not a curve. What loads
> first, what can wait, what a customer sees when something is slow — settled
> with engineering and marketing ahead of time. Reach ran to 19.7MM, and
> enrolment came in at ten times the internal benchmark."

**Suggested order:** do selecao-de-premios first and review the full diff
before touching atm-accessibility. The real risk is flattening the voice.

---

## 2. The Uniclass case does not state its own strategy clearly

The case is about **selling the account by leading with the card and its
benefits.** That inversion is the interesting part — and it is stated once,
late, then never again.

Counting mentions across the whole case entry: "card" appears in 12 fields,
"account" in 3 — and two of those three are invisible to a reader (the SEO
`description` and a video `alt`). **On the visible page the word "account"
appears exactly once**, in the first sentence of the Overview.

That matters because of reading order. The reader passes three things before
the Overview, and all three say *card*:

| What they hit | What it says | What's missing |
|---|---|---|
| Headline — biggest type on the page | "Leading with the card people actually came for" | the account entirely |
| Title / tag | "Uniclass card-first acquisition" | acquisition *of what?* |
| Outcomes — where skimmers jump | "+24% conversion from landing page to application start" | application *for what?* |

The Overview then lands it well, and this is the best line on the page:

> "the premium card was what people were shopping for, the account was what
> the bank needed them to leave with. One journey, two products."

But the three takeaways never return to it. Takeaway 01 builds the savings
figure out of cashback, loyalty and the waived fee — card benefits — and never
closes the loop back to the account it was in service of. A skim-reader can
finish this page thinking it was a credit card landing page project.

**Fix — headline plus three captions, not a rewrite:**

1. **Headline carries both halves.** Candidates (pick one; this is a voice
   decision, not a mechanical one):
   - "Selling the account by leading with the card"
   - "The card they came for, the account they left with"
   - "Leading with the card to win the account"
2. **Attribute the outcome numbers** — "conversion from landing page to
   **account** application start."
3. **One clause in takeaway 01** tying the savings figure back to the account
   opening it was buying.

Note this case measured *fine* on density (352w, 23w sentences). This is a
clarity problem, not a length problem — the two do not conflict.

---

## Measuring

To re-run the numbers in the tables above:

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
    "longest", String(Math.max(...ws)).padStart(3)+"w", c.slug);
}'
```
