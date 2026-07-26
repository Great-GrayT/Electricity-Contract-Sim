export type View = 'home' | 'dashboard' | 'analysis' | 'replay';

export type SlideTheme = 'dark' | 'light' | 'white';

export interface SlideInfo {
  id: string;
  title: string;
  section: string;
  theme: SlideTheme;
}

export const SECTIONS = [
  'Intro',
  'Industry overview',
  'The toolkit',
  'Synthesis',
  'Context and close',
] as const;

export const SLIDES: SlideInfo[] = [
  { id: 'cover',       title: 'Managing Volume, Price & Volatility Exposure', section: 'Intro',                theme: 'dark'  },
  { id: 'exposure',    title: 'The problem you are hedging',                  section: 'Intro',                theme: 'light' },
  { id: 'market',      title: 'The market these instruments plug into',        section: 'Industry overview',    theme: 'light' },
  { id: 'volatile',    title: 'A volatile backdrop, set by gas',               section: 'Industry overview',    theme: 'light' },
  { id: 'transition',  title: 'From fossil-led flexibility to a wind-heavy system', section: 'Industry overview', theme: 'light' },
  { id: 'shape',       title: 'When you generate is not when demand peaks',    section: 'Industry overview',    theme: 'light' },
  { id: 'seasonality', title: 'Seasonality and the weather drivers',           section: 'Industry overview',    theme: 'light' },
  { id: 'cannib',      title: 'Cannibalisation: most output when prices are lowest', section: 'Industry overview', theme: 'white' },
  { id: 'foundation',  title: 'Fix price first, then attack what is left',     section: 'The toolkit',          theme: 'light' },
  { id: 'tail-kit',    title: 'The price-tail toolkit',                        section: 'The toolkit',          theme: 'light' },
  { id: 'exotics',     title: 'For shape and the correlation problem',          section: 'The toolkit',          theme: 'light' },
  { id: 'ppa',         title: 'PPAs: the master structure',                    section: 'The toolkit',          theme: 'light' },
  { id: 'revenue',     title: 'Securing revenue beyond the PPA',               section: 'The toolkit',          theme: 'light' },
  { id: 'physical',    title: 'Real optionality at the last mile',             section: 'The toolkit',          theme: 'light' },
  { id: 'weather',     title: 'Hedging volume, and the correlation, directly', section: 'The toolkit',          theme: 'light' },
  { id: 'stack',       title: 'The hedging stack: anchor to last mile',        section: 'Synthesis',            theme: 'white' },
  { id: 'matrix',      title: 'Exposure to instrument map',                    section: 'Synthesis',            theme: 'light' },
  { id: 'evidence',    title: 'Layering the stack compresses risk',            section: 'Synthesis',            theme: 'light' },
  { id: 'dials',       title: 'How any of these is set',                       section: 'Context and close',    theme: 'light' },
  { id: 'p2p',         title: 'Matching first, then hedge the residual',       section: 'Context and close',    theme: 'light' },
  { id: 'close',       title: 'Build the stack, top down',                     section: 'Context and close',    theme: 'dark'  },
];

export type DotSymbol = 'filled' | 'ring' | 'dot';

export interface DotMatrixRow {
  name: string;
  vol: DotSymbol;
  price: DotSymbol;
  volatility: DotSymbol;
  highlight?: boolean;
}

export const DOT_MATRIX_ROWS: DotMatrixRow[] = [
  { name: 'Forward / baseload PPA',         vol: 'dot',    price: 'filled', volatility: 'ring'   },
  { name: 'Pay-as-produced / shaped PPA',   vol: 'filled', price: 'ring',   volatility: 'dot'    },
  { name: 'Sleeving / P2P matching',        vol: 'filled', price: 'dot',    volatility: 'ring'   },
  { name: 'Cap (bought call)',              vol: 'dot',    price: 'ring',   volatility: 'filled'  },
  { name: 'Collar (cap + floor)',           vol: 'dot',    price: 'filled', volatility: 'filled'  },
  { name: 'Swing option',                  vol: 'filled', price: 'filled', volatility: 'ring'   },
  { name: 'Proxy revenue swap / VFA',       vol: 'filled', price: 'filled', volatility: 'filled', highlight: true },
  { name: 'Capture / quality-factor hedge', vol: 'dot',    price: 'filled', volatility: 'ring'   },
  { name: 'Battery + revenue stacking',    vol: 'ring',   price: 'dot',    volatility: 'filled'  },
  { name: 'Tolling / day-ahead swap',       vol: 'dot',    price: 'ring',   volatility: 'filled'  },
  { name: 'Time-of-use tariff / DSR',       vol: 'filled', price: 'dot',    volatility: 'ring'   },
];

export type AccentColor = 'green' | 'teal' | 'amber' | 'deep' | 'red' | 'green-d' | 'amber-d' | 'muted';

export interface StackBandData {
  time: string;
  name: string;
  instruments: string;
  kills: string;
  color: 'deep' | 'teal' | 'green' | 'amber' | 'green-d' | 'ink';
}

export const STACK_BANDS: StackBandData[] = [
  {
    time: 'YEARS',
    name: 'Anchor',
    instruments: 'Long-dated PPA or CfD for route to market, plus REGOs for green backing.',
    kills: 'Most asset-side price & cannibalisation',
    color: 'deep',
  },
  {
    time: 'SEASONS +',
    name: 'Core price',
    instruments: 'Baseload forwards and swaps on the predictable core of net demand.',
    kills: 'Bulk of price-level risk',
    color: 'teal',
  },
  {
    time: 'SEASONS to MONTHS',
    name: 'Shape',
    instruments: 'Shaped PPAs, swing options, calendar and time-spread options.',
    kills: 'Profile and seasonal shape',
    color: 'green',
  },
  {
    time: 'MONTHS to WEEKS',
    name: 'Tail protection',
    instruments: 'Collars on the residual book, floors on surplus, caps on spike exposure.',
    kills: 'The painful price tail, both sides',
    color: 'amber',
  },
  {
    time: 'SEASONAL',
    name: 'Volume',
    instruments: 'VFAs, revenue puts, wind, temperature and quanto structures.',
    kills: 'Weather volume + price-to-volume correlation',
    color: 'green-d',
  },
  {
    time: 'INTRADAY to HALF-HOURLY',
    name: 'Last mile',
    instruments: 'Battery, DSR, tolling, plus Balancing Mechanism and intraday optimisation.',
    kills: 'Final imbalance at cash-out',
    color: 'ink',
  },
];
