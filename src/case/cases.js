/**
 * ============================================================================
 * Case content. One object per case; the page templates read from here, so a
 * case can be edited without touching layout code.
 *
 * Structure of a case:
 *   slug        URL segment; must match the filename in /work
 *   index       the "01" shown in the list and hero
 *   title       project name
 *   headline    one-line statement of what the work achieved
 *   year, discipline, role, duration — the meta row
 *   whatWeDid   flat list of disciplines
 *   outcomes    big numerals: { prefix, value, unit, caption }
 *   overview    array of paragraphs
 *   quote       { text, name, role } — optional
 *   takeaways   numbered chapters, each with sections
 * ============================================================================
 */

export const CASES = [

  // ── REAL CASE ────────────────────────────────────────────────────────────
  // Transcribed from case02selecaodepremios.md. Two notes carried over from the
  // brief's own annotations:
  //
  //   [[ confirmar ]]  `duration` is the campaign length, not necessarily how
  //                    long you were on it. Confirm before publishing.
  //
  //   [[ sigilo ]]     If outcomes are added back, note that the absolute
  //                    figures in the brief (customer counts, mission and spin
  //                    totals, the cross-campaign comparison) expose base size
  //                    and were meant for the NDA version only.
  {
    slug: 'selecao-de-premios',
    index: '01',
    title: 'Seleção de Prêmios',
    headline: 'A prize mechanic that had to feel like a bank, not a bet',
    tag: 'Gamification',
    client: 'Itaú Unibanco',
    year: '2026',
    discipline: 'Product design',
    role: 'Senior product designer',
    duration: '12-week campaign',

    // Order is fixed by the brief. Entries whose file is not yet in
    // src/images/selecao-de-premios/ are skipped at render time.
    images: [
      {
        src: '01-main.png',
        alt: 'Seleção de Prêmios campaign key visual — the promotion lockup and “São experiências e prêmios fenomenais”, with Ronaldo and the five stars',
        placement: 'after-cover',
        width: 'full',
      },
      {
        src: '02-campaign-home.png',
        alt: 'Campaign home with the available spin, the countdown to the final draw, and the programme explainer',
        caption: 'Campaign home: the spin you have, the draw you are counting down to, and what the programme is.',
        placement: 'after-overview',
        width: 'full',
      },
      {
        src: '03-spin-and-draws.png',
        alt: 'The prize spin, and the screen tracking which draws a customer is entered into',
        caption: 'The spin, and the lucky numbers already earned — chances held, not staked.',
        placement: 'after-takeaway-01',
        width: 'full',
      },
      {
        src: '04-how-it-works.png',
        alt: 'How the mechanic works, explained in the flow itself, and the headline draws',
        caption: 'The rules, written where the decision happens rather than in a regulation nobody opens.',
        placement: 'after-takeaway-02',
        width: 'full',
      },
      {
        src: '05-progression.png',
        alt: 'Programme level and progress, and the recommended next activity',
        caption: 'Programme level and the next step — the slower progression under the weekly loop.',
        placement: 'after-takeaway-03',
        width: 'full',
      },
    ],

    whatWeDid: [
      'Game mechanic design with product, engineering and the sweepstake partner',
      'Gamification research into what makes people return to a game',
      'Interaction design for the weekly spin, missions and prize journeys',
      'Content design with legal, turning compliance into plain language',
      'Coordination across legal, marketing, engineering and brand assets',
      'Review with superintendents and directors through to launch',
    ],

    // MM = millions, matching the convention used in the source brief.
    outcomes: [
      { value: '4.3', unit: 'MM', caption: 'Customers enrolled in the campaign' },
      { value: '1', unit: 'MM', caption: 'Of those net-new to Minhas Vantagens' },
      { value: '11', unit: 'MM', caption: 'Prize spins executed' },
      { value: '4.6', unit: 'MM', caption: 'Missions completed' },
      { value: '86', unit: '%', caption: 'Campaign opt-in conversion rate' },
      {
        value: '580',
        caption:
          'Support cases across the whole campaign — spin accounting, sign-up and rules; low friction relative to volume',
      },
    ],

    overview: [
      'Itaú ran a promotional campaign across the 2026 World Cup, built inside Minhas Vantagens, the bank’s relationship programme, and fronted by Ronaldo. Customers earned lucky numbers and spins by completing weekly missions — registering a Pix key, connecting Open Finance, setting up automatic payments, starting to invest — which entered them into instant prizes and a set of headline draws, up to a million reais in gold bars, a trip, and dinner with Ronaldo. More than twenty products across the bank were wired into the mission system.',
      'The hard part was not the interface. A spinning wheel with a gold jackpot behind it is, visually, the language of gambling, and this had to read as the opposite: a bank rewarding people who were already its customers. Three decisions carried that. Nothing was ever staked — customers did not bet, they earned chances, so there was no way to lose anything. Every customer received a lucky number each week simply for being a client, with more arriving the more they used the bank, which made the mechanic a reward rather than a lottery ticket. And the visual language was deliberately restrained, close to the bank’s own voice rather than to the loud register the category invites.',
      'I worked closely with legal for the whole campaign, and the compliance work ended up being content design rather than legal notices. The rules had to be present at the moment they mattered, in words a customer could act on, with no fine print and no asterisks — while keeping the playful tone the mechanic needed to work at all. Alongside that ran research into game design: what makes a weekly loop worth coming back to, how instant reward and slower progression sit together, and why a player returns on week six. It launched to the whole customer base at once, which made the first hour its own design constraint.',
    ],

    whatMadeItWork: [
      'Reused the existing LE3 solution for partner campaigns rather than building new',
      'Near-real-time mission data over Kafka, which made new product types possible inside the programme',
      'The Platform Evolution Program ran ahead of launch to close resilience, security and scalability gaps',
      'Devin used for structural delivery and bug fixes',
      'Targeted multichannel campaigns and non-QR advertising both drove opt-in growth — conversion held across acquisition paths',
    ],

    takeaways: [
      {
        index: '01',
        title: 'Rewarding, never wagering',
        sections: [
          {
            title: 'Nothing is ever staked',
            body: [
              'The mechanic was built so a customer could not lose anything: chances were earned by doing something, never bought or bet. That single rule did more for trust than any amount of visual reassurance, and it made every screen easier to write — there was never a loss to explain away.',
            ],
          },
          {
            title: 'Restraint reads as credible',
            body: [
              'The category pulls hard toward flashing, loud, jackpot-styled design. Staying close to the bank’s own visual language cost some immediate excitement and bought the thing it actually needed, which was for a customer to believe the prize was real.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Compliance is content design',
        sections: [
          {
            title: 'No asterisks',
            body: [
              'Rather than push the rules into a regulation document nobody opens, we put what mattered where the decision happened, in the customer’s words — when a spin unlocks, how long a mission takes to credit, when a result is published. Legal reviewed language rather than approving disclaimers, which meant the constraint shaped the writing instead of arriving after it.',
            ],
          },
          {
            title: 'Clear enough to be quiet',
            body: [
              'Across a campaign of this scale, support tickets stayed in the hundreds, and the recurring ones were about counting spins and registration rather than confusion about how to win. For a promotional mechanic that is the result worth reporting — it means the rules landed the first time.',
            ],
          },
        ],
      },
      {
        index: '03',
        title: 'Borrowed from games, not from casinos',
        sections: [
          {
            title: 'Designing the return, not the visit',
            body: [
              'The team studied what genuinely brings people back to a game: a weekly rhythm, a reward that arrives immediately, and a slower progression underneath it. Level in the programme meant more lucky numbers, so a long-standing customer saw the relationship he already had reflected in his odds.',
            ],
          },
          {
            title: 'The first hour is a design problem',
            body: [
              'Launching to the entire base meant an enormous spike in the first minutes rather than a curve. Planning that with engineering and marketing ahead of time — what loads first, what can wait, what a customer sees if something is slow — was as much part of the design as the screens themselves.',
              'The platform held. Reach on campaign communications ran to 19.7MM, and enrolment came in at roughly ten times the previous internal benchmark campaign.',
            ],
            // Compact figures rather than the big numerals used for Outcomes:
            // these are evidence for the point above, not headline results.
            stats: [
              { value: '18×', label: 'Screen views, within 50 minutes' },
              { value: '4.8×', label: 'Total requests, within 50 minutes' },
              { value: '5×', label: 'Requests per second, within 50 minutes' },
              { value: '3–3.8×', label: 'Peak burst in a 3-minute window (21:40)' },
              { value: '13×', label: 'Opt-ins in under an hour, at the 4h mark' },
            ],
          },
        ],
      },
    ],
  },



  // ── REAL CASE ────────────────────────────────────────────────────────────
  // Same template and palette as selecao-de-premios. Notes from the brief:
  //
  {
    slug: 'retiree-hub',
    index: '02',
    title: 'Retiree Hub',
    headline: 'A unified space for financial benefits',
    tag: 'Banking',
    client: 'Itaú Unibanco',
    year: '2025',
    discipline: 'Product design',
    role: 'Product designer',

    images: [
      {
        src: '01-hero.png',
        alt: 'The INSS benefits hub inside the Itaú app',
        placement: 'after-cover',
        width: 'full',
      },
      {
        src: '06-why-bother.png',
        alt: 'The benefits of linking, and the single field that starts the request',
        caption:
          'The case for linking a benefit, and then the single field that starts the request.',
        placement: 'after-takeaway-01',
        width: 'full',
      },
      {
        src: '02-step-by-step.png',
        alt: 'Benefit detail screen and the step-by-step for finding the INSS benefit number',
        caption:
          'Benefit details, and the step-by-step for finding the number in the government app — one tap from the field that asks for it.',
        placement: 'after-takeaway-03',
        width: 'full',
      },
      {
        src: '03-multi-select.png',
        alt: 'Multi-select benefit picker and the request status timeline',
        caption:
          'Selecting more than one benefit at once. Each card carries the last payment and the beneficiary’s name — the two details people actually use to tell their benefits apart.',
        placement: 'after-takeaway-02',
        width: 'full',
      },
    ],

    whatWeDid: [
      'Discovery and research with retired customers',
      'Information architecture for the benefits hub',
      'Interaction design for linking, unlinking and status',
      'Content design for the request and its waiting states',
      'Prototyping and usability testing',
      'Handoff and build support',
    ],

    outcomes: [
      { value: '87', unit: '%', caption: 'Positive customer rating' },
      { value: '5', unit: 'M+', caption: 'Clients impacted' },
      { prefix: '+', value: '21', unit: '%', caption: 'In financial product sales to this audience' },
      { prefix: '−', value: '67', unit: '%', caption: 'In customer service complaints' },
    ],

    overview: [
      'A dedicated space within the Itaú app where retirees can link and manage their financial benefits in one place. Instead of tracking retirement pay, pensions, and government allowances across separate channels, customers get a single, clear view of everything they receive.',
      'Retired customers often juggle multiple income sources: social security retirement (INSS), survivor pensions, temporary leave allowances, and other benefits. Each one lives in a different place, with different payment dates and rules. Keeping track of what arrives, when, and how much becomes a constant source of uncertainty for an audience that values stability and predictability above all.',
      'We consolidated the product into a single cohesive experience — simplifying navigation and establishing a clear visual hierarchy. The new system scaled across all touchpoints while remaining flexible enough for future growth. Itaú makes it easy to add, consult and update benefits.',
    ],

    takeaways: [
      {
        index: '01',
        title: 'A number nobody has memorised',
        sections: [
          {
            body: [
              'The whole flow hinges on a ten-digit benefit number printed on a card most people have not looked at in years. Rather than treat that as the customer’s problem, we wrote a step-by-step for finding it inside the government app, put it one tap from the field, and let people leave and come back without losing what they had typed.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Nobody has exactly one benefit',
        sections: [
          {
            body: [
              'The first version assumed a single benefit per person. Support tickets said otherwise — pensions and retirements stack, often across family members. So the picker became multi-select, each card carrying the last payment amount and the beneficiary name, because that is how people actually tell two benefits apart.',
            ],
          },
        ],
      },
      {
        index: '03',
        title: 'Saying “wait” without losing anyone',
        sections: [
          {
            body: [
              'The INSS can take up to four months to answer. A spinner would have been a lie. The status timeline names every stage, dates the ones that have happened, and gives an honest outer bound for the one that has not — so the answer to “did it work?” is on the screen instead of in a phone queue.',
            ],
          },
        ],
      },
    ],
  },


  // ── REAL CASE ────────────────────────────────────────────────────────────
  // Uses the standard template, like the other real cases. The brief asked for
  // "the long layout of Retiree Hub", but that layout was retired when Retiree
  // Hub was moved onto this one — see the note there.
  //
  //   [[ confirmar ]]  `year` — screens show Feb 2024 but the project ran over
  //                    a year. `role` — confirm the title you want to use.
  //
  //   [[ confirmar ]]  Time saved is stated as 30% because the source was
  //                    "quase 40, trinta e poucos" — thirty-something is
  //                    certain, 35 was not. Raise it once confirmed.
  //
  //   [[ revisar ]]    04-refinancing is deliberately not included: the brief
  //                    flags that screen as showing four fields with the same
  //                    label and value, so probably a component-variant sheet
  //                    rather than the final screen. The file is not imported.
  {
    slug: 'atm-accessibility',
    index: '03',
    title: 'ATM accessibility',
    headline: 'Rebuilding the ATM and its design system around accessibility',
    tag: 'Design system',
    client: 'Itaú Unibanco',
    year: '2024',
    discipline: 'Product design, design systems',
    role: 'Senior product designer',
    duration: 'Over a year',

    // Before/after slider, shown in the hero position.
    compare: {
      before: '01a-home-before.png',
      after: '01b-home-after.png',
      labelBefore: 'Before',
      labelAfter: 'After',
      alt: 'The ATM home screen before and after the redesign',
      caption:
        'Twelve competing options became eight, each with an icon and a target sized for an unsteady hand.',
    },

    images: [
      {
        src: '02-payment-input.png',
        alt: 'The payment amount screen, with an on-screen keypad and the invoice amount shown for reference',
        caption: 'The amount being paid sits directly under the field, so checking it costs nothing.',
        placement: 'after-takeaway-01',
        width: 'full',
      },
      {
        src: '07-limit-split.png',
        alt: 'Splitting a credit limit between two cards',
        caption: 'One screen, one decision, with both sides of the transfer visible at once.',
        placement: 'after-takeaway-02',
        width: 'full',
      },
      {
        src: '06-spec-spacing.png',
        alt: 'Spacing annotated on the payment confirmation screen using the design system tokens',
        caption:
          'Spacing annotated in shared tokens, so the terminal and the app measure the same way.',
        placement: 'after-takeaway-03',
        width: 'full',
      },
      {
        src: '03-date-picker.png',
        alt: 'Choosing a due date in the renegotiation flow',
        caption:
          'Unavailable dates stay visible in grey, and the chosen date is repeated in words next to the range that allows it.',
        placement: 'after-overview',
        width: 'full',
      },
    ],

    whatWeDid: [
      'Field research in branches and lab sessions with disabled and older customers',
      'Full redesign of the terminal’s screens and journeys',
      'A design system built from scratch for the ATM',
      'Voice journeys designed alongside every screen',
      'Accessibility specification for the build',
      'Handoff and support through development',
    ],

    outcomes: [
      { prefix: '+', value: '50', unit: '%', caption: 'Increase in NPS for the ATM experience' },
      { prefix: '−', value: '30', unit: '%', caption: 'Median time to complete a transaction' },
      {
        value: '2',
        unit: '×',
        caption: 'Every journey designed twice, once on screen and once in voice',
      },
    ],

    overview: [
      'A full redesign of Itaú’s ATM network, together with a new design system built for it from the ground up. The guiding principle was not visual: the terminal had to work for people with low vision, people with limited mobility, people who cannot read, and older customers standing in a queue with a line behind them.',
      'An ATM is used standing up, often outdoors, often in a hurry, by a customer base that includes people who cannot read a sentence on a screen, people who cannot see it at all, and people whose hands do not land precisely where they aim. The existing terminal had grown into a wall of options of equal visual weight, with the important detail set in the smallest type on the screen. The technology running the machines could not support the screen reader software that already existed on phones and computers, so there was no accessible path at all for a blind customer.',
      'We rebuilt the terminal around what field research showed people actually do at an ATM: they do not read, they orient by shape, colour, position and touch. Fewer options per screen, larger targets, higher contrast, icons carrying meaning alongside words, and the same three exits repeated in the same place on every screen. Underneath it sits a design system built from scratch for the terminal, inheriting the tokens and visual language of the bank’s app so the two products speak the same language. Because no existing screen reader would run on the machines, the bank built its own audio layer, and we designed every journey a second time as a spoken sequence.',
    ],

    takeaways: [
      {
        index: '01',
        title: 'People do not read at an ATM',
        sections: [
          {
            body: [
              'Field visits to branches and lab sessions with older customers, blind customers, customers with motor disabilities and customers who cannot read all pointed the same way. Nobody reads a screen while standing at a machine with people waiting behind them. They scan for shape, colour and position, and they confirm with their hands.',
              'That finding decided the rest: the secondary microcopy that used to carry the important detail was removed, the numbers that matter were made large enough to check at a glance, and every constraint was stated in words rather than implied by a disabled control.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Complexity does not need more steps',
        sections: [
          {
            body: [
              'Splitting a credit limit between cards is the most complicated thing a customer can do at one of these machines, and it fits in a single screen. Source on the left, destination on the right, current and maximum limits side by side, and a confirm button that stays inactive until there is a real choice to confirm. Card art and brand marks do part of the work, because a customer who cannot read the card name still recognises it by sight.',
            ],
          },
        ],
      },
      {
        index: '03',
        title: 'A system built to be built',
        sections: [
          {
            body: [
              'The design system was derived from the bank’s app system, reusing its tokens so the terminal would not become an island. What changed came from the physical context: type sizes and touch targets scaled for a screen viewed at arm’s length, contrast raised for glare, options per screen cut, and the same three anchors repeated at the bottom of every screen so a customer can leave from anywhere without hunting.',
              'Developers received the system and an accessibility specification alongside it, which is the part that decides whether any of this survives contact with the build.',
            ],
          },
        ],
      },
    ],

    whatMadeItWork: [
      'None of the assistive technology that works on a phone would run on the terminals, so the bank built proprietary audio software for its own ATMs',
      'That left an open design question: what does a journey sound like. The customer never speaks — they listen and they touch the screen',
      'Each flow was designed a second time as a spoken sequence, with its own wording, its own order, and its own decisions about what is said aloud in a public place',
      'Developers received two specifications per journey, the screens and the voice, which is what made it possible to build consistently',
    ],
  },


];

export const bySlug = (slug) => CASES.find((c) => c.slug === slug);
