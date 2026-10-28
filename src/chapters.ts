export type View = { lat: number; lon: number; range: number; heading: number; pitch: number }

export type Link = { label: string; href: string }

export type Chapter = {
  id: string
  place: string
  view: View
  title?: string
  tagline?: string
  body?: string[]
  stack?: string
  links?: Link[]
  footage?: { webp: string; avif?: string; alt: string }
}

const CS = '/work'

export const chapters: Chapter[] = [
  {
    id: 'orbit',
    place: 'Earth',
    view: { lat: 33, lon: -84, range: 17500, heading: 0, pitch: 90 },
  },
  {
    id: 'chicago',
    place: 'Chicago',
    view: { lat: 41.8822, lon: -87.6282, range: 5.4, heading: 256, pitch: 27 },
    title: 'Chicago Open World',
    tagline: 'A city you can fly through.',
    body: [
      'All of Chicago in the browser, built from City of Chicago and OpenStreetMap data. More than 100,000 buildings stand at their true heights, streamed nearest first, and light up floor by floor as the real sun goes down.',
      'The skyline under you right now is 72,000 of those buildings, from the same data, lit by the same sun.',
    ],
    stack: 'React Three Fiber, Three.js, GLSL',
    links: [
      { label: 'Fly it live', href: 'https://chicago-open-world.vercel.app' },
      { label: 'Case study', href: `${CS}/chicago-open-world/` },
      { label: 'Code', href: 'https://github.com/AllStreets/Chicago-Open-World' },
    ],
    footage: { webp: '/footage/chicago.webp', alt: 'Chicago Open World: the camera drifts around the skyline at dusk, seen from over Lake Michigan' },
  },
  {
    id: 'melbourne',
    place: 'Albert Park, Melbourne',
    view: { lat: -37.8478, lon: 144.9705, range: 6.2, heading: 345, pitch: 50 },
    title: 'F1 Pixel Cup',
    tagline: "Arcade racing, played by a real paddock's rules.",
    body: [
      'The 2025 grid on all 24 circuits of the calendar, traced from their real layouts. Rain, night races, and power-ups that recast Mario Kart items as F1 rules.',
      'The line lapping below is Albert Park from the same circuit outlines, laid exactly where the track runs around the lake. An unofficial fan project.',
    ],
    stack: 'Three.js, Canvas',
    links: [
      { label: 'Race it live', href: 'https://f1-pixel-cup.vercel.app' },
      { label: 'Code', href: 'https://github.com/AllStreets/F1PixelCup' },
    ],
    footage: { webp: '/footage/f1.webp', alt: 'F1 Pixel Cup: the full field fighting through the first corner at Albert Park' },
  },
  {
    id: 'hongkong',
    place: 'Victoria Harbour, Hong Kong',
    view: { lat: 22.2, lon: 114.165, range: 24, heading: 352, pitch: 34 },
    title: 'CORANTO',
    tagline: 'The news, placed on the planet.',
    body: [
      'Live headlines on a 3D globe, each carrying its publisher, link, time and place. Stories are grouped across outlets, a source that goes down says so instead of going quiet, and anything a model wrote is labeled as such.',
      "Built on Bilawal Sidhu's God's Eye View; I added the news layer and the grounded briefs.",
    ],
    stack: 'CesiumJS, Node, Supabase',
    links: [
      { label: 'Read it live', href: 'https://coranto-production.up.railway.app' },
      { label: 'Code', href: 'https://github.com/AllStreets/coranto' },
    ],
    footage: { webp: '/footage/coranto.webp', alt: 'CORANTO: the globe turns across the dawn line, a click on the Hong Kong story, and the camera flies down over Victoria Harbour' },
  },
  {
    id: 'bletchley',
    place: 'Bletchley Park, England',
    view: { lat: 51.35, lon: -0.95, range: 330, heading: 4, pitch: 52 },
    title: 'Bombechat',
    tagline: 'Messages that never touch the internet.',
    body: [
      'Encrypted messages between laptops in the same room, sent by sound on sixteen tones between 17.6 and 19.8 kHz, or by light from one screen to the other laptop’s camera. No account, no server, and no network code in the build.',
      'It looks and sounds like the machine Turing designed here to break Enigma: three rows of drums on the front, every setting a patch cord on the back.',
    ],
    stack: 'Rust, Tauri, three.js, SQLCipher',
    links: [{ label: 'Code', href: 'https://github.com/AllStreets/bombechat' }],
    footage: {
      webp: '/footage/bombechat.webp',
      avif: '/footage/bombechat.avif',
      alt: 'Bombechat: the drums turning as a message arrives by sound and settles in type, then the machine turns round to its patch panel',
    },
  },
  {
    id: 'teardown',
    place: 'Chicago, at my desk',
    view: { lat: 41.8869, lon: -87.6415, range: 2.6, heading: 112, pitch: 20 },
    title: 'Teardown',
    tagline: 'Every app on your Mac, taken apart.',
    body: [
      'Reads each installed app the way a reverse engineer would, with Apple’s own tools, and explains it in plain English with the evidence beside every claim. Then it lets you act: roll back an update, take back a permission, switch off a background service.',
      'On my Mac it found 21 separate copies of Chromium.',
    ],
    stack: 'TypeScript, Rust, React',
    links: [
      { label: 'Case study', href: `${CS}/teardown/` },
      { label: 'Code', href: 'https://github.com/AllStreets/teardown' },
    ],
    footage: { webp: '/footage/teardown.webp', alt: 'Teardown reading the Claude desktop app: the overview of every installed app, then a radial map of its bundle' },
  },
  {
    id: 'onexus',
    place: 'Chicago, at my desk',
    view: { lat: 41.8925, lon: -87.6205, range: 3.4, heading: 205, pitch: 30 },
    title: 'ONEXUS',
    tagline: 'AI agents you can watch think.',
    body: [
      'A local-first runtime for AI agents. Every tool call is checked against the manifest the agent declared and written to a hash-chained ledger, and a permission card says what an agent will be able to do before you approve it.',
      'I attacked it myself in three published red-team rounds and fixed each finding; the last put launched agents in a locked-down container behind an egress proxy.',
    ],
    stack: 'Python, JavaScript, Docker',
    links: [
      { label: 'Case study', href: `${CS}/aegis/` },
      { label: 'Red-team report', href: 'https://github.com/AllStreets/ONEXUS/blob/main/docs/REDTEAM-AEGIS.md' },
      { label: 'Code', href: 'https://github.com/AllStreets/ONEXUS' },
      { label: 'Agent catalog', href: 'https://onexus-agents.vercel.app' },
    ],
    footage: { webp: '/footage/onexus.webp', alt: 'ONEXUS: a request is sent, routed to Council, the window warms to red, and Allow once clears a permission card' },
  },
  {
    id: 'crucible',
    place: 'Chicago, at my desk',
    view: { lat: 41.8786, lon: -87.6232, range: 4.2, heading: 330, pitch: 34 },
    title: 'Crucible',
    tagline: 'A lab notebook for AI agents.',
    body: [
      'Open-source agents, cloned at pinned commits, are set against each other on one shared machine. 520 pair runs and 8 confirmed attacks, published as an editorial record where every number on the page is a count of rows you can open.',
      'Every colour is set by measured contrast, and the 3D figure has a full table beside it.',
    ],
    stack: 'Next.js, TypeScript, Python',
    links: [
      { label: 'Read it live', href: 'https://crucible-weld.vercel.app' },
      { label: 'Case study', href: `${CS}/crucible/` },
      { label: 'Code', href: 'https://github.com/AllStreets/crucible' },
    ],
    footage: { webp: '/footage/crucible.webp', alt: 'Crucible: the published record of agent-against-agent runs' },
  },
  {
    id: 'path',
    place: 'Chapel Hill to Barcelona to Chicago',
    view: { lat: 37, lon: -36, range: 10400, heading: 0, pitch: 90 },
  },
]

export type Entry = { name: string; what: string; links: Link[] }

export const index: Entry[] = [
  { name: 'Chicago Open World', what: 'All of Chicago in 3D, at true heights, lit by the real sun.', links: [{ label: 'Live', href: 'https://chicago-open-world.vercel.app' }, { label: 'Case study', href: `${CS}/chicago-open-world/` }, { label: 'Code', href: 'https://github.com/AllStreets/Chicago-Open-World' }] },
  { name: 'F1 Pixel Cup', what: 'Arcade F1 on all 24 real circuits of the 2025 calendar.', links: [{ label: 'Live', href: 'https://f1-pixel-cup.vercel.app' }, { label: 'Code', href: 'https://github.com/AllStreets/F1PixelCup' }] },
  { name: 'CORANTO', what: 'Live, sourced headlines placed on a photoreal globe.', links: [{ label: 'Live', href: 'https://coranto-production.up.railway.app' }, { label: 'Code', href: 'https://github.com/AllStreets/coranto' }] },
  { name: 'Bombechat', what: 'An offline encrypted messenger that sends by sound and light.', links: [{ label: 'Code', href: 'https://github.com/AllStreets/bombechat' }] },
  { name: 'Teardown', what: 'Takes every Mac app apart, then lets you act on what it finds.', links: [{ label: 'Case study', href: `${CS}/teardown/` }, { label: 'Code', href: 'https://github.com/AllStreets/teardown' }] },
  { name: 'ONEXUS', what: 'A local-first runtime that gates every tool call an agent makes.', links: [{ label: 'Case study', href: `${CS}/aegis/` }, { label: 'Red-team', href: 'https://github.com/AllStreets/ONEXUS/blob/main/docs/REDTEAM-AEGIS.md' }, { label: 'Code', href: 'https://github.com/AllStreets/ONEXUS' }] },
  { name: 'ONEXUS Agents', what: 'A catalog of open-source agents that says how each was verified.', links: [{ label: 'Live', href: 'https://onexus-agents.vercel.app' }, { label: 'Code', href: 'https://github.com/AllStreets/ONEXUS-Agents' }] },
  { name: 'Crucible', what: 'Real agents run against each other; every number is a row.', links: [{ label: 'Live', href: 'https://crucible-weld.vercel.app' }, { label: 'Case study', href: `${CS}/crucible/` }, { label: 'Code', href: 'https://github.com/AllStreets/crucible' }] },
  { name: 'The Forge review', what: 'One accessible review in place of 22 popups, with one button to undo.', links: [{ label: 'Case study', href: `${CS}/forge/` }, { label: 'Code', href: 'https://github.com/AllStreets/ember' }] },
  { name: 'Assay', what: 'A bill of materials for the whole Mac, checked against advisories.', links: [{ label: 'Code', href: 'https://github.com/AllStreets/Assay' }] },
  { name: 'EDM-DAW', what: 'A music studio in a tab, with an AI whose every change you can undo.', links: [{ label: 'Live', href: 'https://edm-daw.vercel.app' }, { label: 'Code', href: 'https://github.com/AllStreets/edm-daw' }] },
  { name: 'ember', what: 'An offline survival console with a local AI advisor and offline maps.', links: [{ label: 'Code', href: 'https://github.com/AllStreets/ember' }] },
  { name: 'AUSPEX', what: 'A public globe of the planet’s perils and breakthroughs.', links: [{ label: 'Code', href: 'https://github.com/AllStreets/AUSPEX' }] },
  { name: 'HYPERION', what: 'Run a private orbital agency over a living Earth.', links: [{ label: 'Live', href: 'https://hyperion-flax.vercel.app' }, { label: 'Code', href: 'https://github.com/AllStreets/GAM3' }] },
  { name: 'SMADP', what: 'Pairwise safety analysis for agents that share one machine.', links: [{ label: 'Site', href: 'https://allstreets.github.io/SMADP/' }, { label: 'Code', href: 'https://github.com/AllStreets/SMADP' }] },
  { name: 'LOOM', what: 'An offline computer that writes, tests and commits its own tools.', links: [{ label: 'Code', href: 'https://github.com/AllStreets/loom' }] },
]

export const PATH: { name: string; lat: number; lon: number; when: string; what: string }[] = [
  { name: 'Chapel Hill', lat: 35.9132, lon: -79.0558, when: '2022 to 2026', what: 'UNC, two degrees, and two companies: OurCity, a nightlife app that peaked above 1,000 daily users, and Cozy: Parenting, an AI app we took to the App Store.' },
  { name: 'Barcelona', lat: 41.3874, lon: 2.1686, when: 'Summer 2025', what: 'Revenue analyst at Top Spin RevOps Consulting: market maps, lead sourcing and revenue decks.' },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, when: 'Since June 2026', what: 'Flexport. I built the entire frontend of Scout, an internal tool now used by sales reps in more than 30 countries, alongside my sales role.' },
]
