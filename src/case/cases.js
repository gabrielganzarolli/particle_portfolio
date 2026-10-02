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

  {
    slug: 'selecao-de-premios',
    // Social/search description. 120-160 chars, drawn from this page's own
    // content rather than boilerplate.
    description:
      'A World Cup prize mechanic inside Itaú\'s relationship programme: weekly spins and missions built to reward customers, never to feel like a bet.',
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
        src: '05-progression.png',
        alt: 'Programme level and progress, and the recommended next activity',
        caption: 'Programme level and the next step — the slower progression under the weekly loop.',
        placement: 'after-takeaway-02',
        width: 'full',
      },
      // Stands on its own after the chapters rather than under one of them:
      // it illustrated the compliance takeaway, which is gone, so the caption
      // describes what the screen shows instead of arguing the removed point.
      {
        src: '04-how-it-works.png',
        alt: 'How the mechanic works, explained in the flow itself, and the headline draws',
        caption: 'How the mechanic works, and the draws it feeds — the campaign explained in the flow itself.',
        placement: 'closing',
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
          'Support cases across the whole campaign — low friction relative to volume',
      },
    ],

    overview: [
      'Itaú ran a promotional campaign across the 2026 World Cup, built inside Minhas Vantagens and fronted by Ronaldo. Weekly missions earned lucky numbers and spins — register a Pix key, connect Open Finance, set up automatic payments, start investing.',
      'Those entered customers into instant prizes and headline draws — up to a million reais in gold bars, a trip, dinner with Ronaldo. More than twenty products across the bank fed the mission system.',
      'The hard part was never the interface. A spinning wheel with a gold jackpot is, visually, the language of gambling. This had to read as the opposite — a bank rewarding customers who were already its own.',
      'Three decisions carried that: nothing was ever staked, every customer got a lucky number just for being a client, and the visual language stayed close to the bank’s restrained voice rather than the category’s loud default.',
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
        index: '05',
        title: 'Rewarding, never wagering',
        sections: [
          {
            body: [
              'The mechanic was built so a customer could never lose anything. Chances were earned by doing something, never bought or bet. That rule did more for trust than any visual reassurance could, and it made every screen easier to write: there was never a loss to explain away.',
              'It is also why we resisted the category’s pull toward flashing, jackpot-styled design. Staying restrained cost some excitement and bought what mattered — a customer believing the prize was real.',
            ],
          },
        ],
      },
      {
        index: '01',
        title: 'Borrowed from games, not from casinos',
        sections: [
          {
            body: [
              'We studied what brings people back to a game: a weekly rhythm, an immediate reward, and a slower progression underneath. Level in the programme meant more lucky numbers, so a long-standing customer saw their relationship reflected in their odds.',
              'Launching to the whole base at once meant a spike, not a curve. What loads first, what can wait, what a customer sees when something is slow — settled with engineering and marketing ahead of time. The platform held. Reach on campaign communications ran to 19.7MM, and enrolment came in at roughly ten times the previous internal benchmark.',
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
  //   [[ confirmar ]]  `role`. `year` is 2024, which the date picker in the
  //                    product confirms (screen shows 10/02/2024).
  //
  //   [[ confirmar ]]  `whatWeDid` was drafted from the overview rather than
  //                    from a brief, so it describes what the screens imply was
  //                    done, not a recorded account of it. Check it before this
  //                    page is used.
  //
  //   [[ confirmar ]]  Outcomes. The block below is staged but commented out:
  //                    there are no measured figures for this case, and the
  //                    Outcomes treatment is a row of large numerals, so empty
  //                    placeholders would render as a broken section rather than
  //                    as an honest gap. Supply the three numbers and uncomment.
  {
    slug: 'minhas-vantagens-console',
    index: '02',
    title: 'Minhas Vantagens console',
    headline: 'The manager who had to ask the client',
    description:
      'An internal console giving Itaú branch managers the same view of the relationship programme their clients see, plus the reasons a level was lost.',
    tag: 'Product design',
    client: 'Itaú Unibanco',
    year: '2024',
    discipline: 'Product design',
    role: 'Senior product designer',

    // A looping walkthrough rather than stills. The three frames this replaced
    // were all pulled from this same recording.
    gif: {
      src: 'console.gif',
      // Shown instead of the animation under prefers-reduced-motion.
      still: '01-client-overview.png',
      width: 999,
      height: 737,
      alt: 'A walkthrough of the console: the client overview, the step history, and the history filtered by event type and date',
      caption:
        'The console end to end: the client overview, then the step history filtered to the events a client actually asks about.',
      placement: 'after-overview',
    },

    whatWeDid: [
      'Discovery with branch managers to map what they couldn’t answer for clients',
      'Information architecture for the client overview and step history',
      'Interaction design for filtering history by event type and date',
      'Content design translating programme rules into plain reasons for a lost or gained step',
      'Handoff and build support',
    ],

    // Live at last: read off the internal results deck for the platform.
    //
    //   [[ confirmar ]]  The fourth card on that slide reports a drop in
    //                    escalation to second-level support. The figure under
    //                    it is obscured by glare in the photo, so the claim is
    //                    stated without a number rather than guessed at.
    outcomes: [
      { prefix: '+', value: '81', unit: 'K', caption: 'Views of the step history, around 2,300 a day' },
      { value: '7', unit: 'd', caption: 'The old wait for an answer, now given live at the desk' },
      { value: '12', unit: 'K', caption: 'Hours of support work removed in 2026' },
    ],

    overview: [
      'An internal console that shows a branch manager where a client stands in Minhas Vantagens, the bank’s relationship programme. Before it existed, managers had no view of the programme at all: when a client asked why a benefit had gone, the manager had to ask the client to explain their own account.',
    ],

    takeaways: [
      {
        index: '05',
        title: 'The question was pointed the wrong way',
        sections: [
          {
            body: [
              'A client walks into a branch and asks what happened to their level. The manager is the one person in the room who should be able to answer, and the only information available was whatever the client could recall. Giving the manager the same picture the client sees, plus the reasons behind it, was the whole project.',
            ],
          },
        ],
      },
      {
        index: '01',
        title: 'Loss is the part people ask about',
        sections: [
          {
            body: [
              'Programme dashboards tend to show progress and stop there. This one leads with the risk: steps lost, and a warning when the client is close to a downgrade. The history can be filtered to lost steps, rule changes and segment changes, because those are the events a client comes in angry about and the ones a manager could never explain.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'An abstract programme priced in steps',
        sections: [
          {
            body: [
              'Each product carries what it is worth, and the accumulation products show a figure against a threshold rather than a vague sense of progress. That turns a loyalty programme into a concrete conversation at a desk: here is where you are, here is what closes the gap.',
            ],
          },
        ],
      },
    ],

    // Stated plainly and no further: the award's name is known, its categories
    // and criteria are not, and a portfolio is the wrong place to pad a
    // credential with detail nobody checked.
    notes: [
      {
        title: 'Recognition',
        body: 'The Minhas Vantagens platform won the Itubers Transformam award at Itaú.',
      },
    ],

    getInTouch: {
      text: 'Want the longer version of this one? That is a better conversation than a page.',
      button: 'Ask me about it',
      href: 'mailto:gabrielganza@gmail.com',
    },
  },



  // ── REAL CASE ────────────────────────────────────────────────────────────
  // Same template and palette as selecao-de-premios. Notes from the brief:
  //
  {
    slug: 'retiree-hub',
    // Social/search description. 120-160 chars, drawn from this page's own
    // content rather than boilerplate.
    description:
      'A space inside the Itaú app where retirees link and manage INSS benefits, pensions and allowances in one place instead of across separate channels.',
    index: '03',
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
      'A dedicated space within the Itaú app where retirees can link and manage their financial benefits in one place. Retired customers often juggle several income sources — INSS retirement, survivor pensions, temporary leave allowances — each living in a different channel with its own payment dates and rules. For an audience that values stability above all, not knowing what’s arriving and when is a constant source of anxiety.',
      'We consolidated it into a single, clear view: simplified navigation, a visual hierarchy that scales across touchpoints, and an easy path to add, consult and update each benefit.',
    ],

    takeaways: [
      {
        index: '05',
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
        index: '01',
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
        index: '02',
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
    // Slug stays atm-accessibility: it is the published URL, and both the
    // canonical and og:url are built from it.
    slug: 'atm-accessibility',
    // Social/search description. 120-160 chars, drawn from this page's own
    // content rather than boilerplate.
    description:
      'A full redesign of Itaú\'s ATM network and the design system built for it, for customers who cannot read a screen, see it, or aim precisely.',
    index: '04',
    title: 'ATM redesign',
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

    // Shown together as one block rather than as three separate bands: they
    // are one artefact — the system — not three moments in a journey. No
    // caption or label by request; the alt text carries the description for
    // anyone who cannot see them.
    group: {
      lead: '08-components.png',
      leadAlt: 'Button components across primary, secondary and disabled states, in two sizes',
      rest: [
        {
          src: '05-spec-input-field.png',
          alt: 'Specification of how the input field grows with its content',
        },
      ],
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
      'A full redesign of Itaú’s ATM network, and a new design system built for it from the ground up. An ATM is used standing up, often outdoors, often in a hurry — by people with low vision, limited mobility, people who cannot read, and older customers with a queue behind them.',
      'The existing terminal had grown into a wall of equal-weight options, with the important detail set in the smallest type. Its hardware could not run the screen-reader software already standard on phones. For a blind customer there was no accessible path at all.',
      'We rebuilt it around what field research showed people actually do at an ATM: they don’t read. They orient by shape, colour, position and touch. So: fewer options per screen, larger targets, higher contrast, icons alongside words, the same three exits in the same place every time.',
      'The design system was inherited from the bank’s app, so terminal and phone speak the same language. And because no existing screen reader would run on the machines, the bank built its own audio layer — every journey designed twice, once on screen and once as a spoken sequence.',
    ],

    takeaways: [
      {
        index: '05',
        title: 'People do not read at an ATM',
        sections: [
          {
            body: [
              'Field visits to branches and lab sessions with older customers, blind customers, customers with motor disabilities and customers who cannot read all pointed the same way. Nobody reads a screen while standing at a machine with people waiting behind them. They scan for shape, colour and position, and they confirm with their hands.',
              'That finding decided the rest. The secondary microcopy that used to carry the important detail was removed, the numbers that matter were made large enough to check at a glance, and every constraint was stated in words rather than implied by a disabled control.',
            ],
          },
        ],
      },
      {
        index: '01',
        title: 'Complexity does not need more steps',
        sections: [
          {
            body: [
              'Splitting a credit limit between cards is the most complicated thing a customer can do at one of these machines. It fits in a single screen. Source on the left, destination on the right, current and maximum limits side by side, and a confirm button that stays inactive until there is a real choice to confirm.',
              'Card art and brand marks do part of the work, because a customer who cannot read the card name still recognises it by sight.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'A system built to be built',
        sections: [
          {
            body: [
              'The design system was derived from the bank’s app system, reusing its tokens so the terminal would not become an island. What changed came from the physical context: type sizes and touch targets scaled for a screen viewed at arm’s length, contrast raised for glare, options per screen cut. And the same three anchors repeat at the bottom of every screen, so a customer can leave from anywhere without hunting.',
              'Developers received the system and an accessibility specification alongside it, which is the part that decides whether any of this survives contact with the build.',
            ],
          },
        ],
      },
    ],

    whatMadeItWork: [
      'No existing screen reader could run on the machines, so the bank built its own audio layer — a customer listens and touches, never speaks',
      'Developers received two specifications per journey, screens and voice, which is what made it possible to build consistently',
    ],
  },


  // ── REAL CASE ────────────────────────────────────────────────────────────
  // Transcribed from case-01-uniclass-card-first.md. This is the first case to
  // use the `videos` and `compareVideos` blocks; everything is a screen
  // recording, so there are no stills on this page at all.
  //
  //   [[ confirmar ]]  Which of the two walkthrough directions won the A/B
  //                    test. The caption says only that both were tested.
  {
    slug: 'uniclass-card-first-acquisition',
    // Client work that cannot be shown. Every figure on this page is blurred
    // by the stylesheet. See the note in renderHtml.js about what that does
    // and does not protect: the files are still served as they are.
    confidential: true,
    description:
      'Raising account-opening conversion at Itaú Uniclass by leading with the credit card people came for, and keeping customers a premium decline would have lost.',
    index: '05',
    title: 'Uniclass card-first acquisition',
    // Still naming both products, but not as a swap performed on someone.
    // "The card they came for, the account they left with" described the same
    // journey as a bait — which is not what the work was, and not a thing to
    // put at the top of a page. This is the overview's own phrase.
    headline: 'One journey, two products',
    tag: 'Product design',
    client: 'Itaú Unibanco',
    year: '2026',
    discipline: 'Product design',
    role: 'Senior product designer',
    duration: '3 weeks',

    // Dimensions are the encoded size of each mp4, carried here so the renderer
    // can reserve the right box before the file lands. `width: 'phone'` marks a
    // portrait capture, which is bounded by height rather than by the text
    // measure — at full width one would run close to two screens tall.
    videos: [
      {
        src: '02-benefits-carousel.mp4',
        contentWidth: 0.817,
        poster: '02-benefits-carousel.jpg',
        w: 732,
        h: 1396,
        alt: 'The landing page opening with card benefits, cycling through the global account, credit and the bank’s AI assistant',
        // Sits with the savings calculator under the first takeaway: one shows
        // the page leading with what the card gives you, the other turns that
        // into a number. Same argument, two screens.
        placement: 'after-takeaway-01',
        width: 'phone',
      },
      {
        src: '01-savings-calculator.mp4',
        contentWidth: 0.94,
        poster: '01-savings-calculator.jpg',
        w: 728,
        h: 1394,
        alt: 'The savings panel, showing a monthly total that expands into cashback, loyalty programme and waived card fee',
        placement: 'after-takeaway-01',
        width: 'phone',
      },
      {
        src: '06-decline-to-signature.mp4',
        contentWidth: 0.806,
        poster: '06-decline-to-signature.jpg',
        w: 742,
        h: 1376,
        alt: 'The decline sequence, moving from the refusal to the alternative card and its limit',
        placement: 'after-takeaway-02',
        width: 'phone',
      },
      {
        src: '05-black-approval.mp4',
        contentWidth: 0.805,
        poster: '05-black-approval.jpg',
        w: 742,
        h: 1376,
        alt: 'The approval screen for the premium card, showing the approved limit',
        placement: 'after-takeaway-02',
        width: 'phone',
      },
      {
        src: '07-personnalite-studies.mp4',
        contentWidth: 0.805,
        poster: '07-personnalite-studies.jpg',
        w: 1080,
        h: 960,
        alt: 'Studies for the Itaú Personnalité landing page',
        // The one caption left on this page. It is doing work the image cannot:
        // without it these read as part of the Uniclass page rather than as the
        // project the Uniclass result won.
        caption:
          'From a separate landing page project, for Itaú Personnalité — briefed right after the Uniclass page proved itself.',
        placement: 'closing',
      },
    ],

    compareVideos: [
      {
        a: '03-walkthrough-a.mp4',
        aContentWidth: 0.99,
        aPoster: '03-walkthrough-a.jpg',
        aLabel: 'Version A',
        aW: 728,
        aH: 1562,
        b: '04-walkthrough-b.mp4',
        bContentWidth: 0.817,
        bPoster: '04-walkthrough-b.jpg',
        bLabel: 'Version B',
        bW: 742,
        bH: 1380,
        alt: 'Two walkthroughs of the same landing page in two design directions',
        caption:
          'Both versions went to A/B test, with deliberately small differences between them.',
        // The page's opening asset: the whole journey, twice, before any of the
        // chapters start pulling single screens out of it.
        placement: 'after-overview',
      },
    ],

    whatWeDid: [
      'Journey audit of the existing acquisition flow',
      'Behavioural analysis of real sessions in FullStory',
      'Facilitated a cross-functional pain-point and hypothesis workshop',
      'Interaction and content design across landing, offer and in-app recovery',
      'Alternative offer path for profiles declined on the premium card',
      'Executive review and handoff to build',
    ],

    // No outcomes block. The lift figures this case used to show were removed
    // by request; the renderer drops the whole section when there are none,
    // rather than printing a label over empty space.

    overview: [
      'The brief was to raise conversion on account opening for Uniclass, Itaú’s mid-income segment. The strategy was to enter through the credit card instead: the premium card was what people were shopping for, the account was what the bank needed them to leave with. One journey, two products, with a fallback offer for anyone whose credit profile did not clear the premium tier.',
      'I audited the journey against real behaviour — session recordings in FullStory, funnel data with the product manager and the data team — and found three drop-off points: the landing page, the final offer screen, and the resumption screen in the app. All three were the same mistake, the product describing the bank’s process instead of the customer’s reason for being there.',
    ],

    takeaways: [
      {
        index: '05',
        title: 'Selling the reason, not the process',
        sections: [
          {
            body: [
              'The brief pointed at conversion, which usually means fixing the form. Real sessions showed people leaving earlier, before deciding it was worth starting at all. So instead of listing benefits, the page adds them up — one figure for what the customer saves each month, opened into the cashback, the loyalty programme and the waived fee behind it. The claim stops being a promise and becomes an amount they can check. That figure is what the account application is asking to be worth.',
            ],
          },
        ],
      },
      {
        index: '01',
        title: 'A decline that keeps the customer',
        sections: [
          {
            body: [
              'The alternative card appears only after credit analysis, so it reads as an approved offer rather than a hedge — earlier would have made the premium card feel conditional for everyone, later would have lost the customer at the moment of rejection. The sequence states the decline once, plainly, then spends the rest of the screen on what the customer can have: the limit, the waived fee, what it does for them now. Clarity about the no is what makes the yes credible.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Structure outperformed style',
        sections: [
          {
            body: [
              'I designed versions across the full range, from a digital-bank aesthetic to the bank’s own traditional voice, and presented them to director level. The conservative one was chosen — and the results still came, which made the point unarguable: the gain was in the order of the journey and the language on each screen, not the visual style. A refresh alone would have shipped the same three drop-off points in a nicer typeface.',
            ],
          },
        ],
      },
    ],

    notes: [
      {
        title: 'Adjacent work',
        body: 'Studies for the Personnalité landing page, the bank’s high-income segment. The Uniclass page working is what won the next brief, and the same approach carried over to a different product and a different audience.',
      },
    ],

    getInTouch: {
      text: 'Want the longer version of this one? That is a better conversation than a page.',
      button: 'Ask me about it',
      href: 'mailto:gabrielganza@gmail.com',
    },
  },

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
];

export const bySlug = (slug) => CASES.find((c) => c.slug === slug);
