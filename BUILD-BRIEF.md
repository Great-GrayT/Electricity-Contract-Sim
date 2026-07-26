# Build Brief: "Managing Volume, Price and Volatility Exposure" as the website home page

## How to use this file with Claude Code

1. Drop this file in your repo root (or anywhere) and drop the `charts/` folder somewhere accessible (the brief tells Claude Code where to move it).
2. Paste the kickoff prompt below into Claude Code. It points Claude Code at this brief.
3. Optionally also attach the original `.pptx` so Claude Code can see the intended visual design as a reference. The full content is already written out in this brief, so the `.pptx` is helpful but not required.

### Kickoff prompt (paste this)

> Read `BUILD-BRIEF.md` in the repo. Step 0: inspect this project and report back the framework, router, language/build setup, styling system, and any existing nav or home page you find, plus your implementation plan. Wait for my go-ahead on the plan. Then implement the home page deck and the navbar exactly per the brief, matching the conventions already in this repo. Hard rule: never write an em dash (the "|" character) anywhere, in copy, comments, or code. Ask me before adding any new dependency.

---

## 1. Goal

Turn the entire home page into a polished, scrollable "presentation" of the attached deck (a teaching reference on how a GB renewable-backed electricity supplier manages volume, price, and volatility exposure with options and structured flexibility). Add a navigation bar that overlays the deck and links to the site's other pages.

This is a **responsive web rebuild** of the deck, not a slideshow of exported images. Every piece of slide copy must be real, selectable HTML text (for SEO and accessibility). The 13 data charts are provided as image assets and should be used as `<img>`/optimized images. Recreate the deck's design language (palette, type, card motifs, dark/light rhythm) in the site's existing styling system.

## 2. Step 0 (do this first, before writing code)

Inspect the repo and report:
- Framework and rendering model (for example Next.js App Router or Pages Router, Remix, Astro, SvelteKit, a Vite + React SPA, or an Express server rendering templates).
- Language and build tooling (TypeScript config, bundler, lint/format rules).
- Styling system in use (Tailwind, CSS Modules, styled-components, vanilla CSS, SCSS). **Reuse whatever is already there. Do not introduce a second styling system.** If there is none, propose one and wait for confirmation.
- Existing navigation component and existing routes/pages, so the navbar can link to the real pages.
- Where static assets live (for example `public/`, `src/assets/`, `static/`).
- Icon library already in the project, if any.

Then produce a short implementation plan and wait for approval. Match all existing conventions (file layout, naming, imports, formatting).

## 3. Interaction model (the home page UX)

- The home page is a vertical stack of full-viewport "slide" sections using **CSS scroll snapping**.
  - Scroll container: `scroll-snap-type: y proximity;` (proximity, not mandatory, so dense slides on small screens are not trapped).
  - Each slide section: `min-height: 100svh;` (use `svh`, not `vh`, so mobile browser chrome does not clip content), `scroll-snap-align: start;`. Use `min-height`, never a fixed height, so a slide that is taller than the viewport on mobile grows naturally instead of clipping.
- **Keyboard navigation:** ArrowDown / ArrowUp / PageDown / PageUp / Home / End move between sections via `scrollIntoView`. Respect `prefers-reduced-motion` (use instant scroll when reduced motion is requested, smooth otherwise).
- **Progress rail:** a fixed vertical rail of small dots on the right (one per slide), grouped/labelled by the five sections (Intro, Industry overview, The toolkit, Synthesis, Context and close). Hovering a dot shows the slide title; clicking jumps to it; the current slide's dot is highlighted and marked `aria-current`. Hide the rail on small screens.
- **Scroll hint:** a subtle animated chevron on the cover that points down, hidden after the first scroll and when reduced motion is set.
- Section reveal animations are optional and must be subtle (short fade/translate) and fully disabled under `prefers-reduced-motion`.
- Optional nice-to-have (only if quick): a "deck mode" toggle that shows one slide at a time with on-screen prev/next arrows. Default is the scroll experience above.

## 4. Design system (match the deck)

Add these as your styling system's tokens (CSS custom properties shown; convert to Tailwind theme keys or your token format as appropriate). Colors are the exact deck palette.

```css
:root {
  --ink:      #08313B; /* darkest petrol, dark slide backgrounds */
  --ink-2:    #0C414E; /* dark panel / tile on dark */
  --deep:     #0E5566; /* deep teal */
  --teal:     #147E92; /* primary teal */
  --green:    #1FA98C; /* renewable seafoam, primary accent */
  --green-d:  #15876E;
  --amber:    #E0922F; /* price / risk accent */
  --amber-d:  #C2781B;
  --red:      #C0492F; /* spike / danger, use sparingly */
  --light:    #F2F6F7; /* cool off-white, light slide background */
  --card:     #FFFFFF;
  --line:     #DCE5E7; /* hairline borders */
  --text:     #10242B; /* near-black body text */
  --muted:    #5E747B; /* muted text, captions only */
  --wmute:    #9FBDC4; /* muted text on dark */
  --ice:      #CFE3E7; /* light text/detail on dark */
}
```

**Typography.** Headings use a serif with character (the deck uses Georgia). Keep Georgia, or if you want a sharper web serif, use a Google font such as Spectral or Fraunces (load with `display=swap`). Body uses a clean sans (Inter or the system stack, or whatever the site already uses). Do not introduce a font that clashes with the existing site; prefer the site's fonts if it has a system. Type scale (desktop): slide title 30 to 44px bold serif; section kicker 11 to 12px uppercase, letter-spaced ~3px, colored (teal or green); body 14 to 16px; captions 9 to 11px muted; large stat numbers 30 to 44px serif.

**Visual motifs to carry across every slide (this is what makes it feel designed):**
- A small uppercase, letter-spaced "kicker" eyebrow above each slide title (for example `PART 2 · VANILLA OPTIONS`). Kickers are styled spans, not headings.
- Cards with a soft shadow, ~8px radius, and a thin (about 6px) colored left edge in an accent color.
- Icons sit inside a filled colored circle (icon in white, circle in an accent color).
- Stat callouts: a large serif number in an accent color with a small label beneath.
- Alternating rhythm: the cover and the closing slide use the dark `--ink` background with light text; content slides use `--light` or white.
- Do **not** put a decorative underline rule directly beneath titles, and do not add full-width colored header/footer bars. Use whitespace and the kicker for structure.
- Each slide has a small italic footnote (source/framework line) at the bottom, in `--muted` (or `--wmute` on dark).

## 5. Suggested component architecture

Keep slide content in one typed data module (for example `home-deck.data.ts`) and render it through reusable components, so copy can be edited without touching layout. Suggested components:

- `NavBar` (see section 6)
- `Deck` (scroll container + keyboard handling + progress rail)
- `Slide` (full-viewport section wrapper: props for `theme: 'dark' | 'light'`, `id`, `aria-labelledby`)
- `Kicker`, `SlideTitle`, `Footnote`
- `IconBadge` (icon in colored circle)
- `StatTile` (big number + label + accent edge)
- `InfoCard` (icon + title + body, optional accent edge and tag chip)
- `InstrumentCard` (the What / Set / Apply motif: icon, name, optional tag chip, and up to three labelled rows)
- `ChartFigure` (responsive image + italic caption, lazy-loaded)
- `DataTable` (styled table; horizontally scrollable on mobile)
- `DotMatrix` (the instrument x exposure grid with filled / ring / dot symbols)
- `CalloutPanel` (dark `--ink` panel with accent edge, title, body, optional sub-cards)
- `StackBands` (the layered hedging stack)
- `FlowDiagram` (nodes joined by arrows; stacks vertically on mobile)
- `Donut` (small donut; either an inline SVG/conic-gradient, or use the project's chart lib if one exists)
- Small bespoke pieces: `TwoSidedBook`, `ExposureCards`, `QuantoConditions`, `SwingDimmer`, `Steps`, `Takeaways`

Map concepts to icons (use the project's icon set; lucide-react names shown as a guide): wind = Wind, solar = Sun, price/pound = PoundSterling, chart = LineChart or AreaChart, protection = ShieldCheck, lock = Lock, clock = Clock, swap = ArrowLeftRight, layers = Layers, battery = BatteryCharging, temperature = Thermometer, target/quanto = Crosshair or Target, network = Network, market/industry = Factory, settings/BM = Settings, sleeving/route = Route or Workflow, cold = Snowflake, up = ArrowUp, down = ArrowDown, percent = Percent, check = Check, swing = RefreshCw, weather = CloudSun, expand = Maximize2.

## 6. Navbar spec

- Fixed at the top, overlaying the deck. Translucent with `backdrop-filter: blur(...)`; becomes a touch more solid/elevated after the user scrolls past the cover.
- Left: brand/logo (reuse existing if present). Right: links to the site's real pages (detect them in Step 0). If there are no other pages yet, scaffold these placeholder routes and link them: About, Approach, Insights, Contact. Add a clear note in the PR/summary that these are placeholders to wire up.
- Must stay legible over both dark and light slides. Simplest robust approach: give the bar its own consistent treatment (for example a translucent dark `--ink` background at low opacity that increases on scroll), so link contrast is constant. Confirm contrast meets WCAG AA.
- Active-page state on links. Mobile: a hamburger that opens an accessible menu (focus trap, Escape to close, `aria-expanded`). Include a "skip to content" link as the first focusable element.
- If the site already has a navbar, extend it rather than replacing it; just make it overlay the home deck and keep it working on other pages.

## 7. Assets

Move the provided `charts/` folder into the project's static assets location (for example `public/charts/` in Next.js, or `src/assets/charts/`). Reference each chart in the corresponding slide via `ChartFigure`. Use `loading="lazy"` and `decoding="async"` for every chart except the first visible one, and set explicit width/height (intrinsic sizes below) to avoid layout shift. If the framework provides an optimized image component (for example `next/image`), use it.

Chart files and intrinsic pixel sizes:
- `demand-profile-by-hour.png` (1446x615)
- `day-ahead-prices-by-hour-year.png` (1071x609)
- `generation-mix-2020-2026.png` (1281x604)
- `generation-by-fuel-year.png` (962x581)
- `hourly-generation-radar.png` (958x590)
- `wind-output-windspeed-temp.png` (1253x564)
- `solar-output-temp.png` (1413x562)
- `wind-vs-solar-monthly.png` (1230x512)
- `cannibalisation.png` (975x495)
- `zero-cost-collar.png` (975x495)
- `battery-arbitrage.png` (975x495)
- `hedged-vs-unhedged-margin.png` (975x510)
- `var-reduction-waterfall.png` (975x510)

Give each chart descriptive `alt` text (the slide caption is a good basis).

## 8. Responsive, accessibility, SEO, performance

**Responsive**
- Desktop (>= 1024px): mirror the deck composition (two-column splits, 2x2 and 3-up grids, side panels).
- Tablet (640 to 1024px): collapse multi-column grids (4-up to 2-up, side panels stack under the chart).
- Mobile (< 640px): single column, charts full width, stat grids stacked. Tables (PPA flavours, exposure map) become horizontally scrollable inside an `overflow-x: auto` wrapper, or restructure into stacked cards. The instrument-by-exposure matrix should restructure into stacked rows on mobile rather than a tiny grid.
- No horizontal page overflow at any width.

**Accessibility**
- Each slide is a `<section aria-labelledby="...">` with the title as its labelling heading. Cover title is the page `<h1>`; every other slide title is an `<h2>`. Kickers and footnotes are not headings.
- Charts: meaningful `alt`. Purely decorative shapes/icons get `aria-hidden`.
- Visible focus styles; full keyboard operability for the navbar, progress dots, and any toggles.
- Honor `prefers-reduced-motion` for scroll behavior and reveals.
- Verify color contrast: use `--text` for body on light, `--ice`/white on dark, and reserve `--muted` for non-essential captions.

**SEO**
- All slide copy is real text. Set the home page `<title>` and meta description (suggest title: "Managing Volume, Price and Volatility Exposure, GB Renewable Supplier Toolkit"). One `<h1>` only.

**Performance**
- Lazy-load below-the-fold charts; the cover should be light. Fonts via `display=swap`, subset if added. Avoid large JS for the scroll behavior; CSS scroll-snap plus a small keyboard handler is enough.

## 9. Hard rules

- **Never use an em dash ("|") anywhere**, in UI copy, comments, commit messages, or code. Use commas, colons, parentheses, hyphens, or the word "to" for ranges. Do not use en dashes ("–") as separators either; use "to".
- TypeScript strict, no `any`. Match the repo's lint/format config.
- Reuse the existing styling system and conventions. Add tokens, do not fork the system.
- Do not break existing routes. Replace only the home/index content and add or extend the navbar.
- Ask before adding any dependency. Prefer what is already installed.
- Keep deck copy in one typed data module; render via components.

## 10. Slide-by-slide content

Five sections, 21 slides. `theme` is the background. Copy is final and em-dash-free; use it verbatim. Layout notes describe the intended composition; adapt responsively per section 8.

### Section A, Intro

**Slide 1, Cover.** theme: dark.
- Kicker: `ENERGY TRADING · RISK MANAGEMENT · GB POWER`
- Title (h1): `Managing Volume, Price & Volatility Exposure` (render "& Volatility Exposure" in `--green`).
- Lead (italic): `A GB renewable-backed supplier's toolkit of options and structured flexibility.`
- Body: `A teaching reference. For each instrument: what it is, the dials you negotiate, and how a renewables-backed supplier applies it. Built from a GB market overview through to one integrated hedging stack.`
- Meta strip: `21 instruments & structures` (green) · `Industry overview > hedging stack` (muted) · `GB context 2025 to 2026` (amber).
- Right side: three tiles (accent edge + icon badge + label + line):
  - VOLUME (green, wind): `Your generation never equals your demand, MWh by MWh. Every gap is bought or sold.`
  - PRICE (amber, pound): `The wholesale level at which you buy shortfall or sell surplus, net of the capture discount.`
  - VOLATILITY (teal, chart): `How far prices swing, and how that swing is correlated with your own volume gap.`

**Slide 2, The problem you are hedging.** theme: light. kicker `PART 0 · THE EXPOSURE`. subtitle (italic, near title): `A renewable-backed supplier sits between two uncertain sides of one book.`
- Two-sided book row: left card UPSTREAM (green edge) `Own wind, solar and storage plus PPAs. Volume is weather-driven, and worth least exactly when lots of renewables are running.`; a center node `GAP` / `half-hourly`; right card DOWNSTREAM (amber edge) `Demand that is also weather and behaviour driven, but which you have usually promised at a fixed or capped tariff.` Caption beneath: `The gap between the two sides, settled every half hour, is your exposure. Uncontracted, it ultimately cashes out at the punitive imbalance price.`
- Three exposure cards (the third is highlighted on dark):
  1. Volume (green, wind): `Generation does not equal demand, MWh by MWh. Every gap is bought or sold in the market.`
  2. Price (amber, pound): `The level of wholesale prices at which you buy your shortfall or sell your surplus.`
  3. Volatility (teal, chart; dark card): `How far prices swing, and how that swing correlates with your gap: short into spikes exactly when wind drops.` Tag/footnote on the card: `covariance = the core enemy`.
- Then a label `RENEWABLES ADD FOUR NAMED SUB-RISKS` and four small cards (teal edge):
  - Shape / profile: `Output profile misses demand: no solar at the evening peak, wind clustered overnight.`
  - Cannibalisation: `When you generate hard so does everyone, so your captured price sits below baseload and erodes.`
  - Imbalance / cash-out: `Any final physical mismatch settles at the single cash-out price, the most punitive in the stack.`
  - Basis: `The index you hedge on differs from the one you settle on, and the two can drift apart.`
- Footnote: `Framework: client risk report, Part 0. Every instrument that follows transfers one or more of these risks to a party better placed to carry it.`

### Section B, Industry overview

**Slide 3, The market these instruments plug into.** theme: light. kicker `INDUSTRY OVERVIEW · GB POWER`.
- Left: four stat tiles (2x2):
  - `41.7%` (green): `renewables share of generation, 2020 to 2026 sample average`
  - `54%` (green): `renewable share reached by 2026, from 34% in 2021`
  - `£198` (red): `peak 2022 day-ahead, per MWh, versus £33 in 2020`
  - `97%` (amber): `of 2021 hours gas set the price, on 37% of output`
- Right: a donut titled `Average GB generation mix` with subtitle `2020 to 2026 sample, excluding pumped storage`. Segments: Renewables 41.7% (green), Fossil 39.1% (slate `#5E747B`), Nuclear 17.2% (teal), Other 2.0% (`#B9CDD2`). Show a small legend with the percentages.
- Bottom: four plumbing cards (deep icon badges): NESO `Operates the system and the Balancing Mechanism in real time.`; Elexon `Administers the Balancing & Settlement Code; one cash-out price.`; REGO `Certificates evidence each MWh of renewable supply.`; CfD AR7 `About 14.7 GW secured; contracts now run to 20 years.`
- Footnote: `Source: GB market data, 2020 to 2026; client risk report, Sections 0 and 2. Post-REMA (July 2025) kept a single national wholesale price.`

**Slide 4, A volatile backdrop, set by gas.** theme: light. kicker `INDUSTRY OVERVIEW · DEMAND & PRICE`.
- Two charts side by side:
  - `demand-profile-by-hour.png`, caption `Average demand by hour, 2020 to 2026. A stable U-shape: about 21 GW overnight, rising to a 32 to 34 GW peak at 16:00 to 19:00.`
  - `day-ahead-prices-by-hour-year.png`, caption `Average day-ahead price by hour and year. The 2021 to 2022 shock to roughly £198/MWh, then a partial 2026 rebound to about £92.`
- Three narrative cards: `2021` (amber) `Post-COVID reopening lifted fuel demand into constrained gas supply. Low wind output and the IFA interconnector fire tightened the system toward record prices.`; `2022` (red) `The Russia-Ukraine war drove a European gas-price spike and risk premium, fed in through gas-fired marginal generation, plus high carbon costs and French nuclear outages.`; `The mechanism` (teal) `Not a demand story. Gas sets the GB clearing price most of the time, so gas costs pass straight into power. Marginal pricing then amplifies the shock.`
- Footnote: `Source: GB day-ahead and demand data, 2020 to 2026; client risk report, Section 0. Gas set the power price about 97% of the time in 2021 on 37% of generation.`

**Slide 5, From fossil-led flexibility to a wind-heavy system.** theme: light. kicker `INDUSTRY OVERVIEW · THE TRANSITION`.
- Two charts: `generation-mix-2020-2026.png` caption `Generation mix, 2020 to 2026. Fossil share falls as renewables climb above half of output.`; `generation-by-fuel-year.png` caption `Generation by fuel and year, in MW. Gas stays the largest single source but its share shrinks; coal reaches zero.`
- Four stat tiles: `33.8% > 54.2%` (green) `renewable share of generation, 2021 to 2026`; `20.3% > 38.2%` (green) `wind share: the transition is wind-led`; `Coal > 0` (slate) `coal generation reaches zero by 2025`; `9.8 GW` (amber) `average gas, swinging 6.6 GW overnight to 13.3 GW at 18:00`.
- Footnote: `Source: GB generation-by-fuel data, 2020 to 2026; client risk report, Section 0. Gas remains the flexible backbone even as its share falls.`

**Slide 6, When you generate is not when demand peaks.** theme: light. kicker `INDUSTRY OVERVIEW · THE RENEWABLE SHAPE`.
- Left: chart `hourly-generation-radar.png`, caption `Average hourly generation by fuel. Solar bulges at midday; gas and pumped storage swing out into the evening.`
- Right: four rows (icon + title + line), the last highlighted on dark:
  - Solar (green, sun): `Near zero overnight rising to about 4.8 GW at midday. The strongest daily shape of any source.`
  - Gas + pumped storage (amber, bolt): `Gas swings up to about 13.3 GW and pumped storage to about 0.86 GW into the 16:00 to 19:00 peak.`
  - Nuclear (teal, plug): `Almost flat at about 4.43 GW. Baseload that does not follow the daily shape.`
  - The mismatch (deep, dark card): `Demand peaks at 18:00 when solar is gone. The gap between when you generate and when demand peaks is profile risk.`
- Footnote: `Source: GB hourly generation data, 2020 to 2026; client risk report, Section 0. The diurnal mismatch is the root of shape and profile risk.`

**Slide 7, Seasonality and the weather drivers.** theme: light. kicker `INDUSTRY OVERVIEW · SEASONALITY`.
- Left: chart `wind-vs-solar-monthly.png`, caption `Total wind versus solar by month. Wind leads winter, solar leads summer, so they partly offset.`
- Right: two smaller charts stacked: `wind-output-windspeed-temp.png` caption `Wind output with 10 m and 100 m wind speed and temperature.`; `solar-output-temp.png` caption `Solar output with temperature. Solar tracks daylight and the seasons.`
- Four correlation tiles (big value + label): `r = +0.74` (green) `wind output vs 100 m wind speed`; `r = -0.66` (teal) `wind output vs temperature`; `r = +0.71` (amber) `solar output vs temperature`; `r = -0.41` (deep) `solar vs wind, month to month`.
- Summary line (italic muted): `Wind averages 5.86 GW with winter output about 2.7 times summer; solar averages 1.46 GW and is up about 53% since 2020. Wind is roughly 4 times solar and about 80% of combined renewable output.`
- Footnote: `Source: GB monthly generation and ERA5-style weather data, 2020 to 2026; client risk report, Section 0.`

**Slide 8, Cannibalisation: most output when prices are lowest.** theme: white. kicker `INDUSTRY OVERVIEW > THE CORE PROBLEM` (amber kicker).
- Left: chart `cannibalisation.png`, caption `Representative day. Renewable output peaks at midday when the wholesale price is lowest, so the captured price falls below baseload.`
- Right: lead (italic): `The single most important risk for a renewable supplier.` Two stat callouts: `£103` (teal) `baseload average`; `£86` (amber) `captured price`. Three points (icon + text): `You produce most at midday and overnight, when the price you capture is lowest.`; `The capture rate erodes further as renewable penetration rises across the grid.`; `It leaves a basis between your hedge or CfD reference and the price you actually capture.` Then a dark callout (amber edge): `This is why naive volume hedging backfires, and why the rest of this toolkit exists.`
- Footnote: `Source: client risk report, Figure 1 and Section 3. Capture price, or quality factor, is the revenue a fleet earns relative to the baseload average.`

### Section C, The toolkit

**Slide 9, Fix price first, then attack what is left.** theme: light. kicker `PART 1 · THE FOUNDATION LAYER`.
- Lead (italic): `Before options, fix the bulk of price risk with linear, delta-one instruments. They are cheap and liquid, but they manage price only, which is exactly the gap everything after this fills.`
- Two instrument cards (left), each with a `LINEAR` tag:
  - Forwards & futures (teal, chart): WHAT `Buy or sell a flat block of power for a future period at a price fixed today. Traded as seasons, quarters, months and EFA blocks.` SET `Delivery period, shape (baseload or peak), MW notional, price, cleared on ICE or EEX or bilateral.` APPLY `Lock the price on the predictable core of net demand: the volume you will need whatever the weather.`
  - Fixed-for-floating swap (deep, swap): WHAT `Exchange a floating spot or index price for a fixed price over a period. The same risk transfer as a forward, but purely financial.` SET `Fixed swap rate, floating reference index, volume profile, tenor.` APPLY `Convert a floating-price PPA or purchase obligation into a fixed cost without touching the physical flow.`
- Right dark panel `Why a forward is not enough` (amber edge): `A forward fixes price for an assumed volume. If the wind under-delivers, you have fixed the price on power you no longer have, and must buy the gap at the spot or imbalance price. That residual is what the rest of the toolkit manages.` Two sub-tiles: `Financial options` (green, shield) `Caps, floors, collars, swing options, swaptions.` italic `Price conditional on volume.`; `Structured flexibility` (amber, cubes) `PPAs, proxy swaps, VFAs, batteries, tolling, DSR.` italic `Shape and volatility itself.`
- Footnote: `Framework: client risk report, Part 1. Linear hedges manage price level; the two families that follow manage volume, shape and volatility.`

**Slide 10, The price-tail toolkit.** theme: light. kicker `PART 2 · VANILLA OPTIONS`. subtitle (italic): `Pay a premium for protection while keeping the upside.`
- 2x2 instrument cards (WHAT and APPLY each):
  - Cap (amber, shield; tag `call`): WHAT `Right to buy power at strike K; pays when price is above K.` APPLY `A ceiling on the cost of power you must buy. Pays out when a wind lull meets a price spike.`
  - Floor (green, down; tag `put`): WHAT `Right to sell power at strike K; pays when price is below K.` APPLY `A minimum sale price for surplus generation. Guards against low and negative prices.`
  - Collar (teal, lock; tag `band`): WHAT `Buy a cap, sell a floor, tuned so the premiums roughly offset.` APPLY `A band of certainty on the residual book at near-zero cash cost, giving up the extreme upside.`
  - Swaption (deep, clock; tag `on a swap`): WHAT `Right, at a future date, to enter a fixed swap or forward at a set rate.` APPLY `Keep flexibility over whether and when to lock a hedge, for uncertain future volume.`
- Right: chart `zero-cost-collar.png`, caption `Zero-cost collar. The floor premium funds the cap, so the effective cost is locked in a band.` Below it a dark `Worked example` callout (amber edge): `Buy a £120/MWh cap and sell a roughly £45/MWh floor on your winter shortfall. Whatever the spot does, your effective purchase price is locked between the two, and the premium nets to close to nil.`
- Footnote: `Framework: client risk report, Part 2 and Figure 2. The collar is the workhorse for the residual purchase book.`

**Slide 11, For shape and the correlation problem.** theme: light. kicker `PART 3 · STRUCTURED & EXOTIC OPTIONS`.
- Hero dark card: `Swing option · volume optionality` (green, RefreshCw), tag `MOST USEFUL FOR SHAPE`. WHAT `A contract to vary how much you take within agreed bounds at a pre-agreed price: a forward with a dimmer switch on volume.` APPLY `Follow your residual shape cheaply: take more when renewables under-deliver, less when they over-deliver.` On the right of the hero, a "dimmer" illustration: a horizontal track labelled `VOLUME YOU TAKE` with `min` and `max` markers and a slider knob, captioned `take more on low-generation days, less on high`.
- Three cards below:
  - Asian / average-rate (teal, compress): WHAT `The payoff is based on the average reference price over a period, not a single fix.` SET `Averaging window and frequency, strike, notional.` APPLY `Matches a supplier's continuous, averaged cost; removes single-day fixing risk and is cheaper than the vanilla.`
  - Spread options (amber, swap): three lines: `Time / calendar` `winter vs summer, peak vs off-peak.`; `Spark / dark` `power minus fuel; run a peaker only when power beats fuel.`; `Locational` `mostly interconnector spreads, since GB keeps one national price.`
  - Strips & series (deep, layers): WHAT `A portfolio of options across many delivery periods bundled into one trade.` SET `The schedule of strikes, periods and notionals.` APPLY `Match a whole season's protection in one ticket; the standard way to express a view across a delivery year.`
- Footnote: `Framework: client risk report, Part 3. Vanilla options fix the price tail; these structures attack shape and the volume-to-price correlation directly.`

**Slide 12, PPAs: the master structure.** theme: light. kicker `PART 4 · STRUCTURED FLEXIBILITY`. subtitle (italic): `Who carries which risk depends entirely on the volume structure.`
- Lead (italic): `A long-term contract to buy a generator's output. The flavour you pick decides how much shape and volume risk lands back on you to manage with everything else here.`
- Table. Columns: Structure, Volume, Shape, Price, Best for. Color-code the risk cells: Buyer = amber tint/text, Seller = teal tint/text, Shared = green tint/text, Pre-agreed = slate tint/text. Rows:
  - Pay-as-produced | Buyer | Buyer | Buyer | `Generator wants max revenue; buyer can absorb shape`
  - Baseload | Seller | Seller | Buyer | `Buyer wants a firm flat block; seller firms it`
  - Shaped / profiled | Shared | Pre-agreed | Buyer | `Negotiated middle ground, with a risk-and-shape fee`
  - Pay-as-nominated | Seller +pen. | Seller | Buyer | `Buyer wants predictability; seller forecasts, is penalised`
  - Legend: Buyer carries / Seller carries / Shared / Pre-agreed.
- Right column: Physical PPA (teal, plug) WHAT `Real MWh and REGO certificates are delivered; you take title and balance the volume.` APPLY `Direct green sourcing you control and shape yourself.`; Virtual / financial PPA (deep, swap) WHAT `No physical flow; a swap settles against a strike, REGOs transfer separately.` APPLY `A private CfD: a fixed price without taking the power.`; then a dark `Your anchor` callout (green edge, layers): `Secures green volume and a known cost on the sourcing side: the slow-moving base of the stack.`
- Footnote: `Framework: client risk report, Part 4.1. Term is typically 10 to 20 years or more; price can be fixed, indexed, discount-to-market, or floor-plus-share.`

**Slide 13, Securing revenue beyond the PPA.** theme: light. kicker `PART 4 · ROUTE TO MARKET & REVENUE`.
- Seven compact cards (icon + name + WHAT + APPLY). Highlight "Proxy revenue swap" with a `WORKHORSE` tag on a dark card.
  - Government CfD (teal, hands): WHAT `Two-way contract with the state counterparty: topped up to or paid down to a fixed strike.` APPLY `Turns merchant price risk into near-fixed revenue; removes most cannibalisation risk.`
  - Private / corporate CfD (deep, swap): WHAT `The same difference-settled mechanic, contracted privately (often a VPPA).` APPLY `A fixed effective price without owning the asset, on terms you control.`
  - Proxy revenue swap (green, target; dark; tag WORKHORSE): WHAT `Swap actual, weather-driven revenue for a fixed payment, settled on a weather proxy not the meter.` APPLY `Strips out price and weather-volume volatility in one trade.`
  - Volume Firming Agt. (amber, expand): WHAT `Pays the gap between actual output and an agreed firm shape, valued at an index.` APPLY `Turn a pay-as-produced PPA close to baseload, then hedge with forwards.`
  - Revenue put (green-d, shield): WHAT `Insurance-like option guaranteeing a minimum revenue, up to about 95% of forecast.` APPLY `A clean revenue backstop for an asset, often used to satisfy lenders.`
  - Tolling / VPP (amber-d, battery): WHAT `Pay a fee for the right to dispatch a flexible asset, battery or peaker, as if you owned it.` APPLY `Rent flexibility to firm renewables and monetise spikes without owning plant.`
  - Sleeving (deep, route): WHAT `You sit in the middle, routing power from a generator to a corporate buyer for a fee.` APPLY `A service line that also helps match your own book to demand that fits its profile.`
- Footnote: `Framework: client risk report, Parts 4.2 to 4.8. The proxy revenue swap is the only single instrument that addresses volume, price and volatility at once.`

**Slide 14, Real optionality at the last mile.** theme: light. kicker `PART 5 · PHYSICAL & DEMAND-SIDE FLEXIBILITY`.
- Left: chart `battery-arbitrage.png`, caption `Battery arbitrage on a representative day: charge through the cheap troughs, discharge into the evening peak, tracked by state of charge.`
- Right: four rows (icon + title + line):
  - Battery / storage (green, battery; tag `VOLATILITY PLAY`): `Charge when power is cheap or surplus, discharge when scarce. Time-shifts surplus into the peak and arbitrages intraday swings.`
  - Demand-side response (amber, down): `Pay or signal customers to shift or cut demand exactly when you are short and prices are high. A volume hedge on the demand side.`
  - Time-of-use tariffs (teal, clock): `Tariffs that vary by time or track wholesale. Pass volatility to willing customers and pull demand into cheap, green hours.`
  - Balancing Mechanism (deep, settings): `Forecasting plus intraday trading and BM bids minimise the volume left to settle at the punitive cash-out price.`
- Footnote: `Framework: client risk report, Part 5 and Figure 3. These give optionality through physical control, often the cheapest way to handle the half-hourly mismatch.`

**Slide 15, Hedging volume, and the correlation, directly.** theme: light. kicker `PART 6 · WEATHER & VOLUME DERIVATIVES`.
- Lead (italic): `Everything so far mostly hedges price. These hedge volume, and the best of them hedge the covariance that is the renewable supplier's core enemy.`
- Left: two instrument cards:
  - Wind / generation index swap (green, wind): WHAT `Settles against a production index (site or regional wind speed or load factor), not output you must deliver.` APPLY `Receive a payout in low-wind periods to offset buying replacement power. A direct volume hedge, free of operational basis.`
  - Temperature derivatives (HDD / CDD) (amber, thermometer): WHAT `Swaps or options on Heating or Cooling Degree Days at a chosen weather station.` APPLY `Hedge weather-driven demand volume; pay out when an unusual cold spell lifts consumption and your shortfall.`
- Right dark `Quanto` hero (green, target), tag `THE CORRELATION HEDGE`: WHAT `A payoff that depends on the product of two variables, typically price times volume, and sometimes weather too. It pays on the combination, not each leg separately.` APPLY `Built for the killer risk. It hedges the covariance directly, which separate price and volume hedges cannot do as cleanly.` Then three condition chips joined by plus signs: `Cold` (snowflake) + `High price` (up) + `You are short` (down), leading to a green bar: `all at once > the quanto pays out`.
- Footnote: `Framework: client risk report, Part 6. A quanto can pay when it is cold and prices are high and you are short, all at the same moment.`

### Section D, Synthesis

**Slide 16, The hedging stack: anchor to last mile.** theme: white. kicker `PART 7 · PUTTING IT TOGETHER`.
- Lead (italic): `No single instrument solves everything. Real desks layer them, from the slow-moving anchor down to the half-hourly residual.`
- Six stacked bands, each: a timescale chip, a layer name, the instruments, and a "KILLS" note. Color per band.
  - `YEARS` | Anchor (deep) | `Long-dated PPA or CfD for route to market, plus REGOs for green backing.` | KILLS `Most asset-side price & cannibalisation`
  - `SEASONS +` | Core price (teal) | `Baseload forwards and swaps on the predictable core of net demand.` | KILLS `Bulk of price-level risk`
  - `SEASONS to MONTHS` | Shape (green) | `Shaped PPAs, swing options, calendar and time-spread options.` | KILLS `Profile and seasonal shape`
  - `MONTHS to WEEKS` | Tail protection (amber) | `Collars on the residual book, floors on surplus, caps on spike exposure.` | KILLS `The painful price tail, both sides`
  - `SEASONAL` | Volume (green-d) | `VFAs, revenue puts, wind, temperature and quanto structures.` | KILLS `Weather volume + price-to-volume correlation`
  - `INTRADAY to HALF-HOURLY` | Last mile (ink) | `Battery, DSR, tolling, plus Balancing Mechanism and intraday optimisation.` | KILLS `Final imbalance at cash-out`
- Footnote: `Framework: client risk report, Part 7. Build top-down: anchor the asset side, fix the price core, then spend the hedging budget on shape and correlation.`

**Slide 17, Exposure to instrument map.** theme: light. kicker `PART 7 · QUICK REFERENCE`.
- Left table: Exposure | Primary tools.
  - Price level | `Forwards, swaps, caps, collars, swaptions; CfD / VPPA`
  - Price spikes (tail) | `Caps, collars, spark-spread options, battery / tolling`
  - Low / negative prices | `Floors, collars (generator side), CfD, revenue put`
  - Shape / profile | `Swing options, time-spread options, shaped PPAs, VFA, storage`
  - Cannibalisation / capture | `CfD / VPPA, proxy revenue swap, storage time-shifting`
  - Volume (weather) | `Wind / temperature derivatives, quanto, VFA, revenue put`
  - Price x volume correlation (highlight green) | `Quanto (the targeted tool), proxy revenue swap`
  - Imbalance / cash-out | `Forecasting + intraday trading, battery / DSR, BM participation`
- Right matrix: rows are instruments, columns Vol / Price / Volatility, cells are one of three symbols: filled dot (primary lever, green), ring (secondary effect, amber), small dot (limited, muted). Highlight the "Proxy revenue swap / VFA" row.
  - Forward / baseload PPA: small, filled, ring
  - Pay-as-produced / shaped PPA: filled, ring, small
  - Sleeving / P2P matching: filled, small, ring
  - Cap (bought call): small, ring, filled
  - Collar (cap + floor): small, filled, filled
  - Swing option: filled, filled, ring
  - Proxy revenue swap / VFA: filled, filled, filled
  - Capture / quality-factor hedge: small, filled, ring
  - Battery + revenue stacking: ring, small, filled
  - Tolling / day-ahead swap: small, ring, filled
  - Time-of-use tariff / DSR: filled, small, ring
  - Legend: filled = primary lever; ring = secondary effect; small dot = limited / not the tool.
- Footnote: `Framework: client risk report, Part 7 and Section 6 matrix. The proxy revenue swap is the row that lights up across all three exposures.`

**Slide 18, Layering the stack compresses risk.** theme: light. kicker `THE EVIDENCE · RISK REDUCTION` (amber kicker).
- Two charts: `hedged-vs-unhedged-margin.png` caption `Monte-Carlo annual gross margin, hedged versus unhedged. Hedging narrows the spread and removes the fat left tail.`; `var-reduction-waterfall.png` caption `Illustrative attribution: each layer removes a slice of 95% Value-at-Risk, from £8.0m unhedged to a £0.4m residual.`
- Three cards: `Tail cut, not just spread` (green) `Hedging lifts the 5% worst-case annual margin from about £2.3m to £3.9m. The protection is concentrated where the book is short into spikes.`; `Structure does the heavy lifting` (teal) `PPA shape removes about £2.2m of VaR and the proxy revenue swap a further £2.8m: together most of the structural work.`; `Options and flex trim the rest` (amber) `Collar and swing take off £1.1m, battery stacking £0.9m and demand flexibility £0.6m, down to a small residual.`
- Footnote: `Source: client risk report, Figures 4 and 5 (illustrative synthetic Monte-Carlo outputs, included to show target form, not calibrated estimates).`

### Section E, Context and close

**Slide 19, How any of these is set.** theme: light. kicker `PART 8 · THE DIALS & THE PLUMBING`.
- Left label `THE DIALS THAT RECUR IN EVERY INSTRUMENT` then a 3x3 grid of dial cards (small color mark + name + note): Notional `MW or a shaped MWh schedule.`; Strike `Price or revenue level where protection bites.`; Premium / fee `What you pay for the right or service.`; Tenor & granularity `The period, and how finely it is measured.`; Reference index `What you settle against; a mismatch is basis.`; Exercise style `European, American, Bermudan or swing.`; Settlement `Cash (financial) or physical delivery.`; Credit & docs `ISDA, EFET, GTMA; collateral; counterparty.`; Green attributes `REGO transfer and additionality.`
- Right dark panel `THE GB PLUMBING · 2025 TO 2026` with four grouped items (colored left bar + heading + body):
  - Wholesale references (green): `Day-ahead via N2EX (Nord Pool) and EPEX SPOT GB; forwards on ICE and EEX; the intraday EFA block and day structure.`
  - Balancing & settlement (teal): `NESO operates the system and the Balancing Mechanism; Elexon administers the Balancing & Settlement Code; mismatches settle at one cash-out price.`
  - Green & route to market (amber): `REGO certificates evidence renewable supply. CfD Allocation Round 7 secured about 14.7 GW, contracts now to 20 years, plus legacy ROCs and the Capacity Market.`
  - Post-REMA, decided July 2025 (light green): `GB kept a single national wholesale price; zonal pricing was rejected. Locational signals come through network charges (TNUoS), so there is no internal zonal basis to hedge.`
- Footnote: `Framework: client risk report, Part 8 and Section 2. The dials are the negotiable parameters common to every contract above.`

**Slide 20, Matching first, then hedge the residual.** theme: light. kicker `CONTEXT · THE PEER-TO-PEER MODEL`.
- Flow row of three nodes joined by arrows: `Diverse generators` (green, wind) `Wind, solar and hydro with different correlation structures.` arrow to `ML half-hourly matching` (dark hub, network) `Names generators to consumers and optimises the match every half hour.` arrow to `Consumers` (amber, factory) `Corporate and domestic load on a fixed tariff with a price cap.` Caption beneath (italic): `The matching engine is itself a structured-flexibility product: it firms volume and shape physically, before any derivative is layered on.`
- Two columns:
  - `Why it works` (teal edge): bullets `Decouples participants from the gas-indexed wholesale price.` / `Drives portfolio imbalance down to a fraction of a conventional supplier's.` / `The matching engine firms volume and shape before any hedge.` / `A fixed tariff with a price cap is, in effect, a cap option handed to the customer.`
  - `The residual you still hedge` (amber edge): bullets `Capture and cannibalisation on the generators being routed.` / `Spike protection on the thin residual still settled at cash-out.` / `Monetising flexibility (battery, DSR, agile tariffs) to turn volatility into margin, not only defend against it.`
- Footnote: `Context: client risk report, Sections 2 and 7 (UrbanChain-style peer-to-peer renewable supply, Manchester, Ofgem-licensed).`

**Slide 21, Build the stack, top down.** theme: dark. kicker `HOW TO USE THIS` (green).
- Title (h2): `Build the stack, top down`.
- Left: three numbered steps (large number + heading + line):
  1. `Size your three exposures`, `Run volume, price and volatility on your actual book before choosing any instrument.`
  2. `Anchor, then fix the core`, `Anchor the asset side with a PPA or CfD, then fix the predictable price core with forwards.`
  3. `Spend on shape & correlation`, `Put the hedging budget where forwards fall short: swing options, quantos, VFAs and storage.`
- Right label `KEY TAKEAWAYS` then four tiles (check icon, accent edge):
  - (green) `Forwards and PPAs handle the price level; options handle price conditional on volume; structured flexibility handles shape and volatility.`
  - (teal) `The proxy revenue swap is the only single instrument that addresses all three exposures at once.`
  - (amber) `Battery revenue stacking is the primary volatility play, and stacking streams reduces volatility through diversification.`
  - (green-d) `For a peer-to-peer supplier, physical matching firms most volume and shape before any financial hedge is needed.`
- Disclaimer (small, muted, bottom): `An educational overview, not financial, legal or trading advice. Specific structures should be sized and documented with your risk, trading and legal teams.`

## 11. Acceptance checklist

- [ ] Step 0 inspection done; plan approved before coding.
- [ ] Home page renders all 21 slides as full-viewport, scroll-snapped sections in order.
- [ ] Navbar overlays the deck, links to real pages, is legible over dark and light slides, works on mobile, and is keyboard accessible.
- [ ] Keyboard navigation between slides works and respects reduced motion. Progress rail works and shows the current slide.
- [ ] Palette and type match the tokens in section 4; the card / kicker / icon-badge / stat motifs are applied consistently.
- [ ] All 13 charts render from `charts/`, lazy-loaded with descriptive alt text and no layout shift.
- [ ] Fully responsive with no horizontal overflow; tables and the matrix reflow on mobile.
- [ ] One `<h1>` (cover), `<h2>` per slide; sections are labelled; contrast meets AA.
- [ ] Home `<title>` and meta description set.
- [ ] TypeScript strict, lint/format clean, no new dependencies added without asking.
- [ ] No em dash anywhere in the codebase or copy (grep for the character and confirm zero hits).
- [ ] Deck copy lives in one typed data module and renders through components.
