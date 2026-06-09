import {
  Wind, PoundSterling, LineChart, ChevronDown,
} from 'lucide-react';
import { Slide } from '../Slide';
import { Kicker, Footnote, IconBadge, InfoCard } from '../components';

// ---------- Slide 1: Cover ----------

export function SlideCover() {
  return (
    <Slide id="cover" theme="dark" labelledBy="cover-title">
      <div className="slide-split slide-split--60-40">
        <div>
          <Kicker color="wmute">ENERGY TRADING &middot; RISK MANAGEMENT &middot; GB POWER</Kicker>
          <h1 id="cover-title">
            Managing Volume, Price{' '}
            <span style={{ color: 'var(--green)' }}>&amp; Volatility Exposure</span>
          </h1>
          <p className="slide-lead">
            A GB renewable-backed supplier's toolkit of options and structured flexibility.
          </p>
          <p className="slide-body">
            A teaching reference. For each instrument: what it is, the dials you negotiate,
            and how a renewables-backed supplier applies it. Built from a GB market overview
            through to one integrated hedging stack.
          </p>
          <div className="meta-strip">
            <span className="meta-item meta-item--green">21 instruments &amp; structures</span>
            <span className="meta-item">Industry overview &gt; hedging stack</span>
            <span className="meta-item meta-item--amber">GB context 2025 to 2026</span>
          </div>
        </div>

        <div className="slide-col">
          <InfoCard
            icon={<Wind size={18} />}
            iconColor="green"
            title="VOLUME"
            accentColor="green"
            dark
            text="Your generation never equals your demand, MWh by MWh. Every gap is bought or sold."
          />
          <InfoCard
            icon={<PoundSterling size={18} />}
            iconColor="amber"
            title="PRICE"
            accentColor="amber"
            dark
            text="The wholesale level at which you buy shortfall or sell surplus, net of the capture discount."
          />
          <InfoCard
            icon={<LineChart size={18} />}
            iconColor="teal"
            title="VOLATILITY"
            accentColor="teal"
            dark
            text="How far prices swing, and how that swing is correlated with your own volume gap."
          />
        </div>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <ChevronDown size={22} />
      </div>
    </Slide>
  );
}

// ---------- Slide 2: The problem you are hedging ----------

export function SlideExposure() {
  return (
    <Slide id="exposure" theme="light" labelledBy="exposure-title">
      <Kicker>PART 0 &middot; THE EXPOSURE</Kicker>
      <h2 id="exposure-title">The problem you are hedging</h2>
      <p className="slide-lead">
        A renewable-backed supplier sits between two uncertain sides of one book.
      </p>

      <div className="two-sided-book">
        <div className="book-side">
          <div className="book-side__title">Upstream</div>
          <div className="book-side__body">
            Own wind, solar and storage plus PPAs. Volume is weather-driven, and worth least
            exactly when lots of renewables are running.
          </div>
        </div>
        <div className="book-gap">
          <div className="book-gap__label">GAP</div>
          <div className="book-gap__sub">half-hourly</div>
        </div>
        <div className="book-side book-side--amber">
          <div className="book-side__title">Downstream</div>
          <div className="book-side__body">
            Demand that is also weather and behaviour driven, but which you have usually promised
            at a fixed or capped tariff.
          </div>
        </div>
      </div>
      <p className="slide-body" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        The gap between the two sides, settled every half hour, is your exposure. Uncontracted,
        it ultimately cashes out at the punitive imbalance price.
      </p>

      <div className="exposure-cards">
        <div className="info-card info-card--green">
          <IconBadge icon={<Wind size={18} />} color="green" />
          <div className="info-card__body">
            <div className="info-card__title">Volume</div>
            <div className="info-card__text">
              Generation does not equal demand, MWh by MWh. Every gap is bought or sold in the market.
            </div>
          </div>
        </div>
        <div className="info-card info-card--amber">
          <IconBadge icon={<PoundSterling size={18} />} color="amber" />
          <div className="info-card__body">
            <div className="info-card__title">Price</div>
            <div className="info-card__text">
              The level of wholesale prices at which you buy your shortfall or sell your surplus.
            </div>
          </div>
        </div>
        <div className="info-card info-card--teal info-card--dark">
          <IconBadge icon={<LineChart size={18} />} color="teal" />
          <div className="info-card__body">
            <div className="info-card__title">Volatility</div>
            <div className="info-card__text">
              How far prices swing, and how that swing correlates with your gap: short into spikes
              exactly when wind drops.
            </div>
            <div style={{ marginTop: 6 }}>
              <span className="tag-chip tag-chip--teal">covariance = the core enemy</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="sub-risk-label">RENEWABLES ADD FOUR NAMED SUB-RISKS</div>
        <div className="sub-risk-cards">
          {[
            { title: 'Shape / profile', body: 'Output profile misses demand: no solar at the evening peak, wind clustered overnight.' },
            { title: 'Cannibalisation', body: 'When you generate hard so does everyone, so your captured price sits below baseload and erodes.' },
            { title: 'Imbalance / cash-out', body: 'Any final physical mismatch settles at the single cash-out price, the most punitive in the stack.' },
            { title: 'Basis', body: 'The index you hedge on differs from the one you settle on, and the two can drift apart.' },
          ].map((c) => (
            <div key={c.title} className="info-card info-card--teal" style={{ flexDirection: 'column' }}>
              <div className="info-card__title" style={{ marginBottom: 4 }}>{c.title}</div>
              <div className="info-card__text">{c.body}</div>
            </div>
          ))}
        </div>
      </div>

      <Footnote text="Framework: client risk report, Part 0. Every instrument that follows transfers one or more of these risks to a party better placed to carry it." />
    </Slide>
  );
}
