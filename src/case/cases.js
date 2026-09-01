/**
 * ============================================================================
 * PLACEHOLDER CONTENT — every string below is scaffolding, not real work.
 *
 * The numbers, outcomes and quotes are deliberately generic: no client names,
 * no dollar figures, no attributable claims. Replace them before this goes
 * anywhere public. The shape follows work.co's case studies — label in the left
 * gutter, content in the right column — so you can swap copy without touching
 * the layout.
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
    slug: 'project-01',
    index: '01',
    title: 'Project title',
    headline: 'Rebuilding a core flow around how people actually decide',
    year: '2026',
    discipline: 'Product design',
    role: 'Lead product designer',
    duration: '9 months',
    whatWeDid: [
      'Discovery and user research',
      'Service blueprint',
      'Interaction design',
      'Design system foundations',
      'Prototyping and usability testing',
      'Handoff and build support',
    ],
    outcomes: [
      { value: '2', unit: '×', caption: 'Completion rate on the primary task after redesign' },
      { prefix: '−', value: '40', unit: '%', caption: 'Median time to finish the core flow' },
      { value: '12', unit: '', caption: 'Screens collapsed into a single guided sequence' },
    ],
    overview: [
      'The existing flow had grown by accretion — each new requirement added a step, and nobody had gone back to ask whether the sequence still matched how people actually made the decision. Completion was falling and support volume was rising in step with it.',
      'We started by watching people use it rather than by redrawing it. The research made the failure obvious: the flow asked for commitment before it gave people enough to commit to. Reordering it around the moment of decision, rather than around the internal data model, did more than any amount of visual work would have.',
      'The rebuild shipped incrementally behind a flag, which let us measure each step against the old flow rather than betting the whole thing on one release.',
    ],
    quote: {
      text: 'The reordering seems obvious in hindsight. It was not obvious before someone sat with our customers and watched them get stuck in the same place eleven times in a row.',
      name: 'Placeholder name',
      role: 'Placeholder role, Placeholder company',
    },
    takeaways: [
      {
        index: '01',
        title: 'Finding the real failure',
        sections: [
          {
            title: 'Research before redraw',
            body: [
              'The brief asked for a visual refresh. The sessions showed the problem was structural — people abandoned at a consistent point, and it was not the point anyone internally expected. Reframing the brief was the highest-leverage thing that happened on the project.',
            ],
          },
          {
            title: 'Mapping the decision, not the screens',
            body: [
              'We rebuilt the service blueprint around what a person needs to know at each moment, then checked the existing flow against it. The mismatch was the roadmap.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Rebuilding in the open',
        sections: [
          {
            title: 'Shipping behind a flag',
            body: [
              'Each stage went out to a slice of traffic and was measured against the flow it replaced. That turned a redesign into a sequence of small, reversible bets.',
            ],
          },
          {
            title: 'Foundations that outlast the project',
            body: [
              'The components built for this flow became the first real entries in a shared library, which meant the next team started from something rather than from nothing.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'project-02',
    index: '02',
    title: 'Project title',
    headline: 'Making an internal tool fast enough to be trusted',
    year: '2025',
    discipline: 'Design engineering',
    role: 'Design engineer',
    duration: '5 months',
    whatWeDid: [
      'Performance audit',
      'Interaction prototyping',
      'Front-end architecture',
      'Component library',
      'Instrumentation',
    ],
    outcomes: [
      { prefix: '−', value: '80', unit: '%', caption: 'Time to first meaningful interaction' },
      { value: '60', unit: 'fps', caption: 'Sustained on the previously unusable data view' },
      { value: '3', unit: '×', caption: 'Daily active use in the quarter after launch' },
    ],
    overview: [
      'The tool worked, in the sense that every feature it claimed to have was present. It was also slow enough that the team it was built for had quietly gone back to spreadsheets.',
      'Treating performance as a design problem rather than an engineering cleanup task changed what we built. The interactions people used constantly got a budget; the ones they used monthly did not.',
    ],
    quote: {
      text: 'Nobody files a ticket saying the tool is too slow to think in. They just stop opening it.',
      name: 'Placeholder name',
      role: 'Placeholder role, Placeholder company',
    },
    takeaways: [
      {
        index: '01',
        title: 'Budgets before features',
        sections: [
          {
            title: 'Measuring the real path',
            body: [
              'Instrumenting the actual sequence people run every morning — not a synthetic benchmark — showed the cost was concentrated in one view that nobody had thought to profile.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Designing to the budget',
        sections: [
          {
            title: 'Prototyping in the real runtime',
            body: [
              'Every interaction was prototyped in the production stack rather than in a design tool, so a proposal that could not hit frame budget was caught while it was still cheap to change.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'project-03',
    index: '03',
    title: 'Project title',
    headline: 'One design language across teams that had stopped talking',
    year: '2025',
    discipline: 'Design system',
    role: 'Systems lead',
    duration: 'Ongoing',
    whatWeDid: [
      'Interface audit',
      'Token architecture',
      'Component library',
      'Documentation',
      'Adoption and governance',
      'Contribution model',
    ],
    outcomes: [
      { value: '400', unit: '+', caption: 'Components and variants in the shared library' },
      { prefix: '−', value: '65', unit: '%', caption: 'Duplicate components across product teams' },
      { value: '9', unit: '', caption: 'Teams shipping from the same foundations' },
    ],
    overview: [
      'Four teams had independently built four button components, three date pickers and two entirely separate ideas about what "danger" meant. None of this was anyone\'s fault; it was the predictable result of shipping quickly without a shared floor.',
      'The audit came first and was deliberately unflattering — every variant in production, screenshotted side by side. It made the case better than a proposal could have.',
      'Governance turned out to matter more than the components. A library nobody can contribute to becomes a bottleneck, and then becomes abandoned.',
    ],
    takeaways: [
      {
        index: '01',
        title: 'Making the problem visible',
        sections: [
          {
            title: 'The audit as argument',
            body: [
              'Putting every production variant on one wall replaced a long debate about whether a system was needed with a short conversation about where to start.',
            ],
          },
        ],
      },
      {
        index: '02',
        title: 'Building for contribution',
        sections: [
          {
            title: 'A path in, not just a path out',
            body: [
              'Teams could propose and land components through a documented route. Adoption followed, because using the library stopped being slower than working around it.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'project-04',
    index: '04',
    title: 'Project title',
    headline: 'Proving a concept before committing a roadmap to it',
    year: '2024',
    discipline: 'Prototype',
    role: 'Product designer',
    duration: '6 weeks',
    whatWeDid: [
      'Concept definition',
      'Interactive prototyping',
      'Technical feasibility spike',
      'Concept testing',
      'Recommendation',
    ],
    outcomes: [
      { value: '6', unit: 'wks', caption: 'From open question to evidence-backed decision' },
      { value: '4', unit: '', caption: 'Directions tested with real users' },
      { value: '1', unit: '', caption: 'Direction taken forward — and three retired early' },
    ],
    overview: [
      'The organisation was about to commit a year of roadmap to an idea that had never been in front of a customer. The cheapest useful thing to build was not the product — it was the evidence.',
      'Three of the four directions failed in testing, which is the point. Retiring them in six weeks cost a fraction of retiring them after launch.',
    ],
    takeaways: [
      {
        index: '01',
        title: 'Building the smallest real thing',
        sections: [
          {
            title: 'Prototype fidelity as a choice',
            body: [
              'Each direction was built only to the fidelity its open question required. The riskiest assumption got a working prototype; the rest got clickable flows.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'project-05',
    index: '05',
    title: 'Project title',
    headline: 'Understanding a behaviour nobody in the building had seen',
    year: '2024',
    discipline: 'Research',
    role: 'Research lead',
    duration: '4 months',
    whatWeDid: [
      'Study design',
      'Contextual interviews',
      'Diary study',
      'Behavioural analysis',
      'Synthesis and workshops',
    ],
    outcomes: [
      { value: '38', unit: '', caption: 'Contextual sessions across three regions' },
      { value: '2', unit: '', caption: 'Assumptions in the strategy that did not survive contact' },
      { value: '5', unit: '', caption: 'Opportunity areas taken into the roadmap' },
    ],
    overview: [
      'A significant segment of users behaved in a way the analytics could see but not explain. The numbers showed what was happening; only sitting with people showed why.',
      'The synthesis deliberately ended in a workshop rather than a report. Findings that a team argues with in a room get acted on; findings that arrive as a PDF do not.',
    ],
    takeaways: [
      {
        index: '01',
        title: 'Going where the behaviour is',
        sections: [
          {
            title: 'Context over lab',
            body: [
              'Sessions ran where people actually used the product. Most of what mattered — the interruptions, the workarounds, the second device — is invisible in a usability lab.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'project-06',
    index: '06',
    title: 'Project title',
    headline: 'An interface that gets out of the way of the work',
    year: '2023',
    discipline: 'Interface',
    role: 'Product designer',
    duration: '7 months',
    whatWeDid: [
      'Information architecture',
      'Interaction design',
      'Visual design',
      'Accessibility review',
      'Design QA',
    ],
    outcomes: [
      { prefix: '−', value: '50', unit: '%', caption: 'Clicks to complete the most frequent task' },
      { value: 'AA', unit: '', caption: 'Conformance level met across the redesigned surface' },
      { value: '4', unit: '', caption: 'Navigation levels reduced to two' },
    ],
    overview: [
      'The product was used all day by people who knew it well. That changes the brief: for expert users, discoverability matters far less than speed, density and predictability.',
      'Much of the work was subtraction — removing chrome, decoration and confirmation steps that protected against mistakes these users were not making.',
    ],
    takeaways: [
      {
        index: '01',
        title: 'Designing for the expert',
        sections: [
          {
            title: 'Density is a feature',
            body: [
              'Generous spacing helps a first-time user and punishes a daily one. We tuned density to the person who opens the product every morning.',
            ],
          },
        ],
      },
    ],
  },
];

export const bySlug = (slug) => CASES.find((c) => c.slug === slug);
