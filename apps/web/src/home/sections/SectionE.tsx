import { Wind, Network, Factory, Check } from 'lucide-react';
import { Slide } from '../Slide';
import { Kicker, Footnote, IconBadge } from '../components';

// ---------- Slide 19: The dials ----------

const DIALS = [
  { name: 'Notional', note: 'MW or a shaped MWh schedule.' },
  { name: 'Strike', note: 'Price or revenue level where protection bites.' },
  { name: 'Premium / fee', note: 'What you pay for the right or service.' },
  { name: 'Tenor & granularity', note: 'The period, and how finely it is measured.' },
  { name: 'Reference index', note: 'What you settle against; a mismatch is basis.' },
  { name: 'Exercise style', note: 'European, American, Bermudan or swing.' },
  { name: 'Settlement', note: 'Cash (financial) or physical delivery.' },
  { name: 'Credit & docs', note: 'ISDA, EFET, GTMA; collateral; counterparty.' },
  { name: 'Green attributes', note: 'REGO transfer and additionality.' },
];

const PLUMBING = [
  { bar: '', title: 'Wholesale references', body: 'Day-ahead via N2EX (Nord Pool) and EPEX SPOT GB; forwards on ICE and EEX; the intraday EFA block and day structure.' },
  { bar: 'teal', title: 'Balancing & settlement', body: 'NESO operates the system and the Balancing Mechanism; Elexon administers the Balancing & Settlement Code; mismatches settle at one cash-out price.' },
  { bar: 'amber', title: 'Green & route to market', body: 'REGO certificates evidence renewable supply. CfD Allocation Round 7 secured about 14.7 GW, contracts now to 20 years, plus legacy ROCs and the Capacity Market.' },
  { bar: 'green-d', title: 'Post-REMA, decided July 2025', body: 'GB kept a single national wholesale price; zonal pricing was rejected. Locational signals come through network charges (TNUoS), so there is no internal zonal basis to hedge.' },
];

export function SlideDials() {
  return (
    <Slide id="dials" theme="light" labelledBy="dials-title">
      <Kicker>PART 8 &middot; THE DIALS &amp; THE PLUMBING</Kicker>
      <h2 id="dials-title">How any of these is set</h2>

      <div className="slide-split">
        <div>
          <div className="sub-risk-label" style={{ marginBottom: 12 }}>
            THE DIALS THAT RECUR IN EVERY INSTRUMENT
          </div>
          <div className="dials-grid">
            {DIALS.map((d) => (
              <div key={d.name} className="dial-card">
                <div className="dial-card__name">{d.name}</div>
                <div className="dial-card__note">{d.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="plumbing-panel">
          <div className="plumbing-panel__title">THE GB PLUMBING &middot; 2025 TO 2026</div>
          {PLUMBING.map((p) => (
            <div key={p.title} className="plumbing-item">
              <div className={`plumbing-item__bar${p.bar ? ` plumbing-item__bar--${p.bar}` : ''}`} />
              <div>
                <div className="plumbing-item__title">{p.title}</div>
                <div className="plumbing-item__body">{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 8 and Section 2. The dials are the negotiable parameters common to every contract above." />
    </Slide>
  );
}

// ---------- Slide 20: Peer-to-peer ----------

export function SlideP2P() {
  return (
    <Slide id="p2p" theme="light" labelledBy="p2p-title">
      <Kicker>CONTEXT &middot; THE PEER-TO-PEER MODEL</Kicker>
      <h2 id="p2p-title">Matching first, then hedge the residual</h2>

      <div style={{ marginBottom: 20 }}>
        <div className="flow-diagram">
          <div className="flow-node flow-node--green">
            <span aria-hidden="true"><Wind size={20} color="var(--green)" /></span>
            <div className="flow-node__title">Diverse generators</div>
            <div className="flow-node__body">Wind, solar and hydro with different correlation structures.</div>
          </div>
          <div className="flow-arrow" aria-hidden="true">&#8594;</div>
          <div className="flow-node flow-node--dark">
            <span aria-hidden="true"><Network size={20} color="var(--green)" /></span>
            <div className="flow-node__title">ML half-hourly matching</div>
            <div className="flow-node__body">Names generators to consumers and optimises the match every half hour.</div>
          </div>
          <div className="flow-arrow" aria-hidden="true">&#8594;</div>
          <div className="flow-node flow-node--amber">
            <span aria-hidden="true"><Factory size={20} color="var(--amber)" /></span>
            <div className="flow-node__title">Consumers</div>
            <div className="flow-node__body">Corporate and domestic load on a fixed tariff with a price cap.</div>
          </div>
        </div>
        <div className="flow-caption">
          The matching engine is itself a structured-flexibility product: it firms volume and shape
          physically, before any derivative is layered on.
        </div>
      </div>

      <div className="slide-grid-2">
        <div>
          <div className="sub-risk-label" style={{ color: 'var(--teal)', marginBottom: 10 }}>
            WHY IT WORKS
          </div>
          <div className="slide-col" style={{ gap: 8 }}>
            {[
              'Decouples participants from the gas-indexed wholesale price.',
              'Drives portfolio imbalance down to a fraction of a conventional supplier\'s.',
              'The matching engine firms volume and shape before any hedge.',
              'A fixed tariff with a price cap is, in effect, a cap option handed to the customer.',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--teal)', marginTop: 2, flexShrink: 0 }}>&#9679;</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="sub-risk-label" style={{ color: 'var(--amber)', marginBottom: 10 }}>
            THE RESIDUAL YOU STILL HEDGE
          </div>
          <div className="slide-col" style={{ gap: 8 }}>
            {[
              'Capture and cannibalisation on the generators being routed.',
              'Spike protection on the thin residual still settled at cash-out.',
              'Monetising flexibility (battery, DSR, agile tariffs) to turn volatility into margin, not only defend against it.',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--amber)', marginTop: 2, flexShrink: 0 }}>&#9679;</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footnote text="Context: client risk report, Sections 2 and 7 (UrbanChain-style peer-to-peer renewable supply, Manchester, Ofgem-licensed)." />
    </Slide>
  );
}

// ---------- Slide 21: Closing ----------

export function SlideClose() {
  return (
    <Slide id="close" theme="dark" labelledBy="close-title">
      <Kicker color="green">HOW TO USE THIS</Kicker>
      <h2 id="close-title">Build the stack, top down</h2>

      <div className="slide-split slide-split--40-60">
        <div className="steps">
          {[
            { n: '1', title: 'Size your three exposures', body: 'Run volume, price and volatility on your actual book before choosing any instrument.' },
            { n: '2', title: 'Anchor, then fix the core', body: 'Anchor the asset side with a PPA or CfD, then fix the predictable price core with forwards.' },
            { n: '3', title: 'Spend on shape & correlation', body: 'Put the hedging budget where forwards fall short: swing options, quantos, VFAs and storage.' },
          ].map((s) => (
            <div key={s.n} className="step">
              <div className="step__num">{s.n}</div>
              <div>
                <div className="step__title">{s.title}</div>
                <div className="step__body">{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="sub-risk-label" style={{ color: 'var(--wmute)', marginBottom: 12 }}>KEY TAKEAWAYS</div>
          <div className="takeaways">
            <div className="takeaway">
              <span className="takeaway__icon" aria-hidden="true"><Check size={16} /></span>
              <span className="takeaway__text">Forwards and PPAs handle the price level; options handle price conditional on volume; structured flexibility handles shape and volatility.</span>
            </div>
            <div className="takeaway takeaway--teal">
              <span className="takeaway__icon" aria-hidden="true"><Check size={16} /></span>
              <span className="takeaway__text">The proxy revenue swap is the only single instrument that addresses all three exposures at once.</span>
            </div>
            <div className="takeaway takeaway--amber">
              <span className="takeaway__icon" aria-hidden="true"><Check size={16} /></span>
              <span className="takeaway__text">Battery revenue stacking is the primary volatility play, and stacking streams reduces volatility through diversification.</span>
            </div>
            <div className="takeaway takeaway--green-d">
              <span className="takeaway__icon" aria-hidden="true"><Check size={16} /></span>
              <span className="takeaway__text">For a peer-to-peer supplier, physical matching firms most volume and shape before any financial hedge is needed.</span>
            </div>
          </div>
        </div>
      </div>

      <p className="slide-disclaimer">
        An educational overview, not financial, legal or trading advice. Specific structures should
        be sized and documented with your risk, trading and legal teams.
      </p>

      <p className="slide-footnote" style={{ borderTopColor: 'rgba(207,227,231,0.15)', color: 'var(--wmute)' }}>
        &nbsp;
      </p>
    </Slide>
  );
}
