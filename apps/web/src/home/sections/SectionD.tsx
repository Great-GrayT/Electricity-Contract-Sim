import { Slide } from '../Slide';
import { Kicker, Footnote, ChartFigure, DotSym } from '../components';
import { STACK_BANDS, DOT_MATRIX_ROWS } from '../home-deck.data';

// ---------- Slide 16: The hedging stack ----------

export function SlideStack() {
  return (
    <Slide id="stack" theme="white" labelledBy="stack-title">
      <Kicker>PART 7 &middot; PUTTING IT TOGETHER</Kicker>
      <h2 id="stack-title">The hedging stack: anchor to last mile</h2>
      <p className="slide-lead">
        No single instrument solves everything. Real desks layer them, from the slow-moving anchor
        down to the half-hourly residual.
      </p>

      <div className="stack-bands">
        {STACK_BANDS.map((band) => (
          <div key={band.name} className={`stack-band stack-band--${band.color}`}>
            <div className="stack-band__time">{band.time}</div>
            <div className="stack-band__name">{band.name}</div>
            <div className="stack-band__instruments">{band.instruments}</div>
            <div className="stack-band__kills">
              <strong>KILLS</strong>
              {band.kills}
            </div>
          </div>
        ))}
      </div>

      <Footnote text="Framework: client risk report, Part 7. Build top-down: anchor the asset side, fix the price core, then spend the hedging budget on shape and correlation." />
    </Slide>
  );
}

// ---------- Slide 17: Exposure to instrument map ----------

const EXPOSURE_ROWS = [
  { exposure: 'Price level',                     tools: 'Forwards, swaps, caps, collars, swaptions; CfD / VPPA' },
  { exposure: 'Price spikes (tail)',              tools: 'Caps, collars, spark-spread options, battery / tolling' },
  { exposure: 'Low / negative prices',           tools: 'Floors, collars (generator side), CfD, revenue put' },
  { exposure: 'Shape / profile',                 tools: 'Swing options, time-spread options, shaped PPAs, VFA, storage' },
  { exposure: 'Cannibalisation / capture',       tools: 'CfD / VPPA, proxy revenue swap, storage time-shifting' },
  { exposure: 'Volume (weather)',                tools: 'Wind / temperature derivatives, quanto, VFA, revenue put' },
  { exposure: 'Price x volume correlation',      tools: 'Quanto (the targeted tool), proxy revenue swap', highlight: true },
  { exposure: 'Imbalance / cash-out',            tools: 'Forecasting + intraday trading, battery / DSR, BM participation' },
];

export function SlideMatrix() {
  return (
    <Slide id="matrix" theme="light" labelledBy="matrix-title">
      <Kicker>PART 7 &middot; QUICK REFERENCE</Kicker>
      <h2 id="matrix-title">Exposure to instrument map</h2>

      <div className="slide-split">
        <div>
          <div className="exposure-table-wrap">
            <table className="exposure-table">
              <thead>
                <tr>
                  <th>Exposure</th>
                  <th>Primary tools</th>
                </tr>
              </thead>
              <tbody>
                {EXPOSURE_ROWS.map((r) => (
                  <tr key={r.exposure} className={r.highlight ? 'et-highlight' : undefined}>
                    <td>{r.exposure}</td>
                    <td>{r.tools}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="table-scroll">
            <table className="dot-matrix">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Vol</th>
                  <th>Price</th>
                  <th>Volat.</th>
                </tr>
              </thead>
              <tbody>
                {DOT_MATRIX_ROWS.map((r) => (
                  <tr key={r.name} className={r.highlight ? 'dm-highlight' : undefined}>
                    <td>{r.name}</td>
                    <td><DotSym sym={r.vol} /></td>
                    <td><DotSym sym={r.price} /></td>
                    <td><DotSym sym={r.volatility} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span><span className="dm-filled">&#9679;</span> primary lever</span>
            <span><span className="dm-ring">&#9675;</span> secondary effect</span>
            <span><span className="dm-dot">&#8901;</span> limited</span>
          </div>
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 7 and Section 6 matrix. The proxy revenue swap is the row that lights up across all three exposures." />
    </Slide>
  );
}

// ---------- Slide 18: Evidence ----------

export function SlideEvidence() {
  return (
    <Slide id="evidence" theme="light" labelledBy="evidence-title">
      <Kicker color="amber">THE EVIDENCE &middot; RISK REDUCTION</Kicker>
      <h2 id="evidence-title">Layering the stack compresses risk</h2>

      <div className="slide-grid-2" style={{ marginBottom: 20 }}>
        <ChartFigure
          src="/charts/hedged-vs-unhedged-margin.png"
          alt="Monte-Carlo distribution showing annual gross margin for hedged versus unhedged positions. Hedging narrows the spread and removes the fat left tail."
          caption="Monte-Carlo annual gross margin, hedged versus unhedged. Hedging narrows the spread and removes the fat left tail."
          width={975} height={510}
        />
        <ChartFigure
          src="/charts/var-reduction-waterfall.png"
          alt="Waterfall chart showing illustrative attribution: each hedging layer removes a slice of 95% Value-at-Risk, from £8.0m unhedged to a £0.4m residual."
          caption="Illustrative attribution: each layer removes a slice of 95% Value-at-Risk, from £8.0m unhedged to a £0.4m residual."
          width={975} height={510}
        />
      </div>

      <div className="slide-grid-3">
        {[
          { title: 'Tail cut, not just spread', color: 'var(--green)', body: 'Hedging lifts the 5% worst-case annual margin from about £2.3m to £3.9m. The protection is concentrated where the book is short into spikes.' },
          { title: 'Structure does the heavy lifting', color: 'var(--teal)', body: 'PPA shape removes about £2.2m of VaR and the proxy revenue swap a further £2.8m: together most of the structural work.' },
          { title: 'Options and flex trim the rest', color: 'var(--amber)', body: 'Collar and swing take off £1.1m, battery stacking £0.9m and demand flexibility £0.6m, down to a small residual.' },
        ].map((c) => (
          <div key={c.title} className="info-card" style={{ borderLeftColor: c.color }}>
            <div className="info-card__body">
              <div className="info-card__title" style={{ color: c.color }}>{c.title}</div>
              <div className="info-card__text">{c.body}</div>
            </div>
          </div>
        ))}
      </div>

      <Footnote text="Source: client risk report, Figures 4 and 5 (illustrative synthetic Monte-Carlo outputs, included to show target form, not calibrated estimates)." />
    </Slide>
  );
}
