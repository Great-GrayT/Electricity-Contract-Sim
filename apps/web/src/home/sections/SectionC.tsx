import {
  LineChart as LineChartIcon, ArrowLeftRight, ShieldCheck, ArrowDown,
  Lock, Clock, RefreshCw, AreaChart, Layers, Wind, BatteryCharging,
  ArrowDown as ArrowDn, Clock as ClockIcon, Settings as SettingsIcon,
  Handshake, Target, Maximize2, Route, Shield, Plug,
} from 'lucide-react';
import { Slide } from '../Slide';
import { Kicker, Footnote, InstrumentCard, ChartFigure, CalloutPanel } from '../components';

// ---------- Slide 9: Foundation layer ----------

export function SlideFoundation() {
  return (
    <Slide id="foundation" theme="light" labelledBy="foundation-title">
      <Kicker>PART 1 &middot; THE FOUNDATION LAYER</Kicker>
      <h2 id="foundation-title">Fix price first, then attack what is left</h2>
      <p className="slide-lead">
        Before options, fix the bulk of price risk with linear, delta-one instruments. They are
        cheap and liquid, but they manage price only, which is exactly the gap everything after
        this fills.
      </p>

      <div className="slide-split slide-split--60-40">
        <div className="slide-col">
          <InstrumentCard
            icon={<LineChartIcon size={18} />}
            iconColor="teal"
            name="Forwards &amp; futures"
            tag="LINEAR"
            tagColor="teal"
            accentColor="teal"
            rows={[
              { label: 'WHAT', text: 'Buy or sell a flat block of power for a future period at a price fixed today. Traded as seasons, quarters, months and EFA blocks.' },
              { label: 'SET', text: 'Delivery period, shape (baseload or peak), MW notional, price, cleared on ICE or EEX or bilateral.' },
              { label: 'APPLY', text: 'Lock the price on the predictable core of net demand: the volume you will need whatever the weather.' },
            ]}
          />
          <InstrumentCard
            icon={<ArrowLeftRight size={18} />}
            iconColor="deep"
            name="Fixed-for-floating swap"
            tag="LINEAR"
            tagColor="teal"
            accentColor="deep"
            rows={[
              { label: 'WHAT', text: 'Exchange a floating spot or index price for a fixed price over a period. The same risk transfer as a forward, but purely financial.' },
              { label: 'SET', text: 'Fixed swap rate, floating reference index, volume profile, tenor.' },
              { label: 'APPLY', text: 'Convert a floating-price PPA or purchase obligation into a fixed cost without touching the physical flow.' },
            ]}
          />
        </div>

        <CalloutPanel
          title="Why a forward is not enough"
          accentColor="amber"
          body="A forward fixes price for an assumed volume. If the wind under-delivers, you have fixed the price on power you no longer have, and must buy the gap at the spot or imbalance price. That residual is what the rest of the toolkit manages."
          subTiles={[
            { icon: <ShieldCheck size={14} />, label: 'Financial options', note: 'Caps, floors, collars, swing options, swaptions. Price conditional on volume.' },
            { icon: <Layers size={14} />, label: 'Structured flexibility', note: 'PPAs, proxy swaps, VFAs, batteries, tolling, DSR. Shape and volatility itself.' },
          ]}
        />
      </div>

      <Footnote text="Framework: client risk report, Part 1. Linear hedges manage price level; the two families that follow manage volume, shape and volatility." />
    </Slide>
  );
}

// ---------- Slide 10: Vanilla options ----------

export function SlideTailKit() {
  return (
    <Slide id="tail-kit" theme="light" labelledBy="tail-kit-title">
      <Kicker>PART 2 &middot; VANILLA OPTIONS</Kicker>
      <h2 id="tail-kit-title">The price-tail toolkit</h2>
      <p className="slide-lead">Pay a premium for protection while keeping the upside.</p>

      <div className="slide-split slide-split--60-40">
        <div className="slide-grid-2">
          <InstrumentCard
            icon={<ShieldCheck size={18} />}
            iconColor="amber"
            name="Cap"
            tag="call"
            tagColor="amber"
            accentColor="amber"
            rows={[
              { label: 'WHAT', text: 'Right to buy power at strike K; pays when price is above K.' },
              { label: 'APPLY', text: 'A ceiling on the cost of power you must buy. Pays out when a wind lull meets a price spike.' },
            ]}
          />
          <InstrumentCard
            icon={<ArrowDown size={18} />}
            iconColor="green"
            name="Floor"
            tag="put"
            accentColor="green"
            rows={[
              { label: 'WHAT', text: 'Right to sell power at strike K; pays when price is below K.' },
              { label: 'APPLY', text: 'A minimum sale price for surplus generation. Guards against low and negative prices.' },
            ]}
          />
          <InstrumentCard
            icon={<Lock size={18} />}
            iconColor="teal"
            name="Collar"
            tag="band"
            tagColor="teal"
            accentColor="teal"
            rows={[
              { label: 'WHAT', text: 'Buy a cap, sell a floor, tuned so the premiums roughly offset.' },
              { label: 'APPLY', text: 'A band of certainty on the residual book at near-zero cash cost, giving up the extreme upside.' },
            ]}
          />
          <InstrumentCard
            icon={<Clock size={18} />}
            iconColor="deep"
            name="Swaption"
            tag="on a swap"
            tagColor="deep"
            accentColor="deep"
            rows={[
              { label: 'WHAT', text: 'Right, at a future date, to enter a fixed swap or forward at a set rate.' },
              { label: 'APPLY', text: 'Keep flexibility over whether and when to lock a hedge, for uncertain future volume.' },
            ]}
          />
        </div>

        <div className="slide-col">
          <ChartFigure
            src="/charts/zero-cost-collar.png"
            alt="Chart showing a zero-cost collar: the floor premium funds the cap, locking the effective purchase price in a band."
            caption="Zero-cost collar. The floor premium funds the cap, so the effective cost is locked in a band."
            width={975} height={495}
          />
          <CalloutPanel
            title="Worked example"
            accentColor="amber"
            body="Buy a £120/MWh cap and sell a roughly £45/MWh floor on your winter shortfall. Whatever the spot does, your effective purchase price is locked between the two, and the premium nets to close to nil."
          />
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 2 and Figure 2. The collar is the workhorse for the residual purchase book." />
    </Slide>
  );
}

// ---------- Slide 11: Structured & exotic options ----------

export function SlideExotics() {
  return (
    <Slide id="exotics" theme="light" labelledBy="exotics-title">
      <Kicker>PART 3 &middot; STRUCTURED &amp; EXOTIC OPTIONS</Kicker>
      <h2 id="exotics-title">For shape and the correlation problem</h2>

      <div className="slide-split slide-split--60-40" style={{ marginBottom: 16 }}>
        <div className="info-card info-card--dark info-card--green" style={{ flexDirection: 'column', gap: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="icon-badge icon-badge--green" aria-hidden="true"><RefreshCw size={18} /></span>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ice)' }}>Swing option &middot; volume optionality</span>
            <span className="tag-chip tag-chip--workhorse" style={{ background: 'rgba(31,169,140,0.25)', color: 'var(--green)' }}>MOST USEFUL FOR SHAPE</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--wmute)' }}>
            <strong style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wmute)', marginBottom: 3 }}>WHAT</strong>
            A contract to vary how much you take within agreed bounds at a pre-agreed price: a forward with a dimmer switch on volume.
          </div>
          <div style={{ fontSize: 13, color: 'var(--wmute)' }}>
            <strong style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wmute)', marginBottom: 3 }}>APPLY</strong>
            Follow your residual shape cheaply: take more when renewables under-deliver, less when they over-deliver.
          </div>
        </div>

        <div className="swing-dimmer">
          <div className="swing-dimmer__title">VOLUME YOU TAKE</div>
          <div className="swing-dimmer__labels"><span>min</span><span>max</span></div>
          <div className="swing-dimmer__track">
            <div className="swing-dimmer__fill" />
            <div className="swing-dimmer__knob" />
          </div>
          <div className="swing-dimmer__caption">take more on low-generation days, less on high</div>
        </div>
      </div>

      <div className="slide-grid-3">
        <div className="instrument-card instrument-card--teal">
          <div className="instrument-card__header">
            <span className="icon-badge icon-badge--teal" aria-hidden="true"><AreaChart size={18} /></span>
            <span className="instrument-card__name">Asian / average-rate</span>
          </div>
          <div className="instrument-card__row">
            <strong className="instrument-card__row-label">WHAT</strong>
            <p className="instrument-card__row-text">The payoff is based on the average reference price over a period, not a single fix.</p>
          </div>
          <div className="instrument-card__row">
            <strong className="instrument-card__row-label">SET</strong>
            <p className="instrument-card__row-text">Averaging window and frequency, strike, notional.</p>
          </div>
          <div className="instrument-card__row">
            <strong className="instrument-card__row-label">APPLY</strong>
            <p className="instrument-card__row-text">Matches a supplier's continuous, averaged cost; removes single-day fixing risk and is cheaper than the vanilla.</p>
          </div>
        </div>

        <div className="instrument-card instrument-card--amber">
          <div className="instrument-card__header">
            <span className="icon-badge icon-badge--amber" aria-hidden="true"><ArrowLeftRight size={18} /></span>
            <span className="instrument-card__name">Spread options</span>
          </div>
          {[
            { label: 'Time / calendar', text: 'winter vs summer, peak vs off-peak.' },
            { label: 'Spark / dark', text: 'power minus fuel; run a peaker only when power beats fuel.' },
            { label: 'Locational', text: 'mostly interconnector spreads, since GB keeps one national price.' },
          ].map((r) => (
            <div key={r.label} className="instrument-card__row">
              <strong className="instrument-card__row-label">{r.label}</strong>
              <p className="instrument-card__row-text">{r.text}</p>
            </div>
          ))}
        </div>

        <div className="instrument-card instrument-card--deep">
          <div className="instrument-card__header">
            <span className="icon-badge icon-badge--deep" aria-hidden="true"><Layers size={18} /></span>
            <span className="instrument-card__name">Strips &amp; series</span>
          </div>
          <div className="instrument-card__row">
            <strong className="instrument-card__row-label">WHAT</strong>
            <p className="instrument-card__row-text">A portfolio of options across many delivery periods bundled into one trade.</p>
          </div>
          <div className="instrument-card__row">
            <strong className="instrument-card__row-label">SET</strong>
            <p className="instrument-card__row-text">The schedule of strikes, periods and notionals.</p>
          </div>
          <div className="instrument-card__row">
            <strong className="instrument-card__row-label">APPLY</strong>
            <p className="instrument-card__row-text">Match a whole season's protection in one ticket; the standard way to express a view across a delivery year.</p>
          </div>
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 3. Vanilla options fix the price tail; these structures attack shape and the volume-to-price correlation directly." />
    </Slide>
  );
}

// ---------- Slide 12: PPAs ----------

export function SlidePPA() {
  return (
    <Slide id="ppa" theme="light" labelledBy="ppa-title">
      <Kicker>PART 4 &middot; STRUCTURED FLEXIBILITY</Kicker>
      <h2 id="ppa-title">PPAs: the master structure</h2>
      <p className="slide-lead">Who carries which risk depends entirely on the volume structure.</p>
      <p className="slide-body" style={{ marginBottom: 14 }}>
        A long-term contract to buy a generator's output. The flavour you pick decides how much
        shape and volume risk lands back on you to manage with everything else here.
      </p>

      <div className="slide-split slide-split--60-40">
        <div>
          <div className="table-scroll">
            <table className="deck-table">
              <thead>
                <tr>
                  <th>Structure</th>
                  <th>Volume</th>
                  <th>Shape</th>
                  <th>Price</th>
                  <th>Best for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Pay-as-produced</td>
                  <td className="cell-buyer">Buyer</td>
                  <td className="cell-buyer">Buyer</td>
                  <td className="cell-buyer">Buyer</td>
                  <td>Generator wants max revenue; buyer can absorb shape</td>
                </tr>
                <tr>
                  <td>Baseload</td>
                  <td className="cell-seller">Seller</td>
                  <td className="cell-seller">Seller</td>
                  <td className="cell-buyer">Buyer</td>
                  <td>Buyer wants a firm flat block; seller firms it</td>
                </tr>
                <tr>
                  <td>Shaped / profiled</td>
                  <td className="cell-shared">Shared</td>
                  <td className="cell-pre">Pre-agreed</td>
                  <td className="cell-buyer">Buyer</td>
                  <td>Negotiated middle ground, with a risk-and-shape fee</td>
                </tr>
                <tr>
                  <td>Pay-as-nominated</td>
                  <td className="cell-seller">Seller +pen.</td>
                  <td className="cell-seller">Seller</td>
                  <td className="cell-buyer">Buyer</td>
                  <td>Buyer wants predictability; seller forecasts, is penalised</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <span className="cell-buyer">Buyer carries</span>
            <span className="cell-seller">Seller carries</span>
            <span className="cell-shared">Shared</span>
            <span className="cell-pre">Pre-agreed</span>
          </div>
        </div>

        <div className="slide-col">
          <div className="instrument-card instrument-card--teal">
            <div className="instrument-card__header">
              <span className="icon-badge icon-badge--teal" aria-hidden="true"><Plug size={18} /></span>
              <span className="instrument-card__name">Physical PPA</span>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">WHAT</strong>
              <p className="instrument-card__row-text">Real MWh and REGO certificates are delivered; you take title and balance the volume.</p>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">APPLY</strong>
              <p className="instrument-card__row-text">Direct green sourcing you control and shape yourself.</p>
            </div>
          </div>
          <div className="instrument-card instrument-card--deep">
            <div className="instrument-card__header">
              <span className="icon-badge icon-badge--deep" aria-hidden="true"><ArrowLeftRight size={18} /></span>
              <span className="instrument-card__name">Virtual / financial PPA</span>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">WHAT</strong>
              <p className="instrument-card__row-text">No physical flow; a swap settles against a strike, REGOs transfer separately.</p>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">APPLY</strong>
              <p className="instrument-card__row-text">A private CfD: a fixed price without taking the power.</p>
            </div>
          </div>
          <div className="callout-panel callout-panel--green">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span aria-hidden="true"><Layers size={16} color="var(--green)" /></span>
              <span className="callout-panel__title" style={{ margin: 0 }}>Your anchor</span>
            </div>
            <div className="callout-panel__body">
              Secures green volume and a known cost on the sourcing side: the slow-moving base of the stack.
            </div>
          </div>
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 4.1. Term is typically 10 to 20 years or more; price can be fixed, indexed, discount-to-market, or floor-plus-share." />
    </Slide>
  );
}

// ---------- Slide 13: Revenue beyond the PPA ----------

const REVENUE_CARDS = [
  { icon: <Handshake size={16} />, color: 'teal' as const, name: 'Government CfD', dark: false, tag: undefined as string | undefined,
    what: 'Two-way contract with the state counterparty: topped up to or paid down to a fixed strike.',
    apply: 'Turns merchant price risk into near-fixed revenue; removes most cannibalisation risk.' },
  { icon: <ArrowLeftRight size={16} />, color: 'deep' as const, name: 'Private / corporate CfD', dark: false, tag: undefined,
    what: 'The same difference-settled mechanic, contracted privately (often a VPPA).',
    apply: 'A fixed effective price without owning the asset, on terms you control.' },
  { icon: <Target size={16} />, color: 'green' as const, name: 'Proxy revenue swap', dark: true, tag: 'WORKHORSE',
    what: 'Swap actual, weather-driven revenue for a fixed payment, settled on a weather proxy not the meter.',
    apply: 'Strips out price and weather-volume volatility in one trade.' },
  { icon: <Maximize2 size={16} />, color: 'amber' as const, name: 'Volume Firming Agt.', dark: false, tag: undefined,
    what: 'Pays the gap between actual output and an agreed firm shape, valued at an index.',
    apply: 'Turn a pay-as-produced PPA close to baseload, then hedge with forwards.' },
  { icon: <Shield size={16} />, color: 'green-d' as const, name: 'Revenue put', dark: false, tag: undefined,
    what: 'Insurance-like option guaranteeing a minimum revenue, up to about 95% of forecast.',
    apply: 'A clean revenue backstop for an asset, often used to satisfy lenders.' },
  { icon: <BatteryCharging size={16} />, color: 'amber-d' as const, name: 'Tolling / VPP', dark: false, tag: undefined,
    what: 'Pay a fee for the right to dispatch a flexible asset, battery or peaker, as if you owned it.',
    apply: 'Rent flexibility to firm renewables and monetise spikes without owning plant.' },
  { icon: <Route size={16} />, color: 'deep' as const, name: 'Sleeving', dark: false, tag: undefined,
    what: 'You sit in the middle, routing power from a generator to a corporate buyer for a fee.',
    apply: 'A service line that also helps match your own book to demand that fits its profile.' },
];

export function SlideRevenue() {
  return (
    <Slide id="revenue" theme="light" labelledBy="revenue-title">
      <Kicker>PART 4 &middot; ROUTE TO MARKET &amp; REVENUE</Kicker>
      <h2 id="revenue-title">Securing revenue beyond the PPA</h2>

      <div className="slide-grid-7">
        {REVENUE_CARDS.map((c) => (
          <div
            key={c.name}
            className={`instrument-card instrument-card--${c.color}${c.dark ? ' instrument-card--dark' : ''}`}
          >
            <div className="instrument-card__header">
              <span className={`icon-badge icon-badge--${c.color}`} aria-hidden="true">{c.icon}</span>
              <span className="instrument-card__name">{c.name}</span>
              {c.tag && <span className="tag-chip tag-chip--workhorse">{c.tag}</span>}
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">WHAT</strong>
              <p className="instrument-card__row-text">{c.what}</p>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">APPLY</strong>
              <p className="instrument-card__row-text">{c.apply}</p>
            </div>
          </div>
        ))}
      </div>

      <Footnote text="Framework: client risk report, Parts 4.2 to 4.8. The proxy revenue swap is the only single instrument that addresses volume, price and volatility at once." />
    </Slide>
  );
}

// ---------- Slide 14: Physical flexibility ----------

export function SlidePhysical() {
  return (
    <Slide id="physical" theme="light" labelledBy="physical-title">
      <Kicker>PART 5 &middot; PHYSICAL &amp; DEMAND-SIDE FLEXIBILITY</Kicker>
      <h2 id="physical-title">Real optionality at the last mile</h2>

      <div className="slide-split slide-split--60-40">
        <ChartFigure
          src="/charts/battery-arbitrage.png"
          alt="Line chart showing battery arbitrage on a representative day: charging through cheap overnight troughs, discharging into the evening peak, tracked by state of charge."
          caption="Battery arbitrage on a representative day: charge through the cheap troughs, discharge into the evening peak, tracked by state of charge."
          width={975} height={495}
        />

        <div className="slide-col">
          {[
            { icon: <BatteryCharging size={18} />, color: 'green' as const, title: 'Battery / storage', tag: 'VOLATILITY PLAY', tagColor: 'green' as const, body: 'Charge when power is cheap or surplus, discharge when scarce. Time-shifts surplus into the peak and arbitrages intraday swings.' },
            { icon: <ArrowDn size={18} />, color: 'amber' as const, title: 'Demand-side response', tag: undefined, tagColor: undefined, body: 'Pay or signal customers to shift or cut demand exactly when you are short and prices are high. A volume hedge on the demand side.' },
            { icon: <ClockIcon size={18} />, color: 'teal' as const, title: 'Time-of-use tariffs', tag: undefined, tagColor: undefined, body: 'Tariffs that vary by time or track wholesale. Pass volatility to willing customers and pull demand into cheap, green hours.' },
            { icon: <SettingsIcon size={18} />, color: 'deep' as const, title: 'Balancing Mechanism', tag: undefined, tagColor: undefined, body: 'Forecasting plus intraday trading and BM bids minimise the volume left to settle at the punitive cash-out price.' },
          ].map((r) => (
            <div key={r.title} className={`info-card info-card--${r.color}`}>
              <span className={`icon-badge icon-badge--${r.color}`} aria-hidden="true">{r.icon}</span>
              <div className="info-card__body">
                <div className="info-card__title">
                  {r.title}
                  {r.tag && <span className={`tag-chip${r.tagColor ? ` tag-chip--${r.tagColor}` : ''}`}>{r.tag}</span>}
                </div>
                <div className="info-card__text">{r.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 5 and Figure 3. These give optionality through physical control, often the cheapest way to handle the half-hourly mismatch." />
    </Slide>
  );
}

// ---------- Slide 15: Weather & volume derivatives ----------

export function SlideWeather() {
  return (
    <Slide id="weather" theme="light" labelledBy="weather-title">
      <Kicker>PART 6 &middot; WEATHER &amp; VOLUME DERIVATIVES</Kicker>
      <h2 id="weather-title">Hedging volume, and the correlation, directly</h2>
      <p className="slide-lead">
        Everything so far mostly hedges price. These hedge volume, and the best of them hedge the
        covariance that is the renewable supplier's core enemy.
      </p>

      <div className="slide-split">
        <div className="slide-col">
          <div className="instrument-card instrument-card--green">
            <div className="instrument-card__header">
              <span className="icon-badge icon-badge--green" aria-hidden="true"><Wind size={18} /></span>
              <span className="instrument-card__name">Wind / generation index swap</span>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">WHAT</strong>
              <p className="instrument-card__row-text">Settles against a production index (site or regional wind speed or load factor), not output you must deliver.</p>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">APPLY</strong>
              <p className="instrument-card__row-text">Receive a payout in low-wind periods to offset buying replacement power. A direct volume hedge, free of operational basis.</p>
            </div>
          </div>
          <div className="instrument-card instrument-card--amber">
            <div className="instrument-card__header">
              <span className="icon-badge icon-badge--amber" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                </svg>
              </span>
              <span className="instrument-card__name">Temperature derivatives (HDD / CDD)</span>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">WHAT</strong>
              <p className="instrument-card__row-text">Swaps or options on Heating or Cooling Degree Days at a chosen weather station.</p>
            </div>
            <div className="instrument-card__row">
              <strong className="instrument-card__row-label">APPLY</strong>
              <p className="instrument-card__row-text">Hedge weather-driven demand volume; pay out when an unusual cold spell lifts consumption and your shortfall.</p>
            </div>
          </div>
        </div>

        <div>
          <div className="callout-panel callout-panel--green">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span className="icon-badge icon-badge--green" aria-hidden="true"><Target size={18} /></span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Quanto</span>
              <span className="tag-chip" style={{ background: 'rgba(31,169,140,0.25)', color: 'var(--green)' }}>THE CORRELATION HEDGE</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--wmute)', marginBottom: 8 }}>
              <strong style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wmute)', marginBottom: 3 }}>WHAT</strong>
              A payoff that depends on the product of two variables, typically price times volume, and sometimes weather too. It pays on the combination, not each leg separately.
            </div>
            <div style={{ fontSize: 13, color: 'var(--wmute)', marginBottom: 12 }}>
              <strong style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wmute)', marginBottom: 3 }}>APPLY</strong>
              Built for the killer risk. It hedges the covariance directly, which separate price and volume hedges cannot do as cleanly.
            </div>
            <div className="quanto-conditions">
              <div className="quanto-chip">
                <span aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12h20M12 2l10 10-10 10"/>
                  </svg>
                </span>
                Cold
              </div>
              <span className="quanto-plus">+</span>
              <div className="quanto-chip">
                <span aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </span>
                High price
              </div>
              <span className="quanto-plus">+</span>
              <div className="quanto-chip">
                <span aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </span>
                You are short
              </div>
              <span className="quanto-plus">&#8594;</span>
              <div className="quanto-result">
                <span aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </span>
                all at once: the quanto pays out
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 6. A quanto can pay when it is cold and prices are high and you are short, all at the same moment." />
    </Slide>
  );
}
