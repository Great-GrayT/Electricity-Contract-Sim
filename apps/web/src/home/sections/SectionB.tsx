import {
  Sun, Wind, Plug, Zap, Factory, Settings as SettingsIcon, Award, TrendingUp,
} from 'lucide-react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Slide } from '../Slide';
import { Kicker, Footnote, IconBadge, StatTile, ChartFigure } from '../components';

// ---------- Slide 3: The market ----------

const DONUT_DATA = [
  { name: 'Renewables 41.7%', value: 41.7, color: '#1FA98C' },
  { name: 'Fossil 39.1%',     value: 39.1, color: '#5E747B' },
  { name: 'Nuclear 17.2%',    value: 17.2, color: '#147E92' },
  { name: 'Other 2.0%',       value: 2.0,  color: '#B9CDD2' },
];

export function SlideMarket() {
  return (
    <Slide id="market" theme="light" labelledBy="market-title">
      <Kicker>INDUSTRY OVERVIEW &middot; GB POWER</Kicker>
      <h2 id="market-title">The market these instruments plug into</h2>

      <div className="slide-split slide-split--40-60">
        <div>
          <div className="slide-grid-2" style={{ marginBottom: 16 }}>
            <StatTile value="41.7%" label="renewables share of generation, 2020 to 2026 sample average" color="green" />
            <StatTile value="54%" label="renewable share reached by 2026, from 34% in 2021" color="green" />
            <StatTile value="£198" label="peak 2022 day-ahead, per MWh, versus £33 in 2020" color="red" />
            <StatTile value="97%" label="of 2021 hours gas set the price, on 37% of output" color="amber" />
          </div>

          <div className="plumbing-cards">
            {[
              { icon: <Factory size={16} />, name: 'NESO', text: 'Operates the system and the Balancing Mechanism in real time.' },
              { icon: <SettingsIcon size={16} />, name: 'Elexon', text: 'Administers the Balancing & Settlement Code; one cash-out price.' },
              { icon: <Award size={16} />, name: 'REGO', text: 'Certificates evidence each MWh of renewable supply.' },
              { icon: <TrendingUp size={16} />, name: 'CfD AR7', text: 'About 14.7 GW secured; contracts now run to 20 years.' },
            ].map((c) => (
              <div key={c.name} className="plumbing-card">
                <IconBadge icon={c.icon} color="deep" small />
                <div className="plumbing-card__body">
                  <div className="plumbing-card__name">{c.name}</div>
                  <div className="plumbing-card__text">{c.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="donut-wrapper">
          <div className="donut-title">Average GB generation mix</div>
          <div className="donut-sub">2020 to 2026 sample, excluding pumped storage</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={DONUT_DATA}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {DONUT_DATA.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ background: '#fff', border: '1px solid var(--line)', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Footnote text="Source: GB market data, 2020 to 2026; client risk report, Sections 0 and 2. Post-REMA (July 2025) kept a single national wholesale price." />
    </Slide>
  );
}

// ---------- Slide 4: A volatile backdrop ----------

export function SlideVolatile() {
  return (
    <Slide id="volatile" theme="light" labelledBy="volatile-title">
      <Kicker>INDUSTRY OVERVIEW &middot; DEMAND &amp; PRICE</Kicker>
      <h2 id="volatile-title">A volatile backdrop, set by gas</h2>

      <div className="slide-grid-2" style={{ marginBottom: 20 }}>
        <ChartFigure
          src="/charts/demand-profile-by-hour.png"
          alt="Bar chart showing average electricity demand by hour of day (2020 to 2026), forming a U-shape from about 21 GW overnight rising to a 32 to 34 GW peak at 16:00 to 19:00."
          caption="Average demand by hour, 2020 to 2026. A stable U-shape: about 21 GW overnight, rising to a 32 to 34 GW peak at 16:00 to 19:00."
          width={1446} height={615}
          eager
        />
        <ChartFigure
          src="/charts/day-ahead-prices-by-hour-year.png"
          alt="Line chart showing average GB day-ahead electricity price by hour and year from 2020 to 2026, with a spike to roughly £198/MWh in 2021 to 2022 and a partial rebound to about £92 by 2026."
          caption="Average day-ahead price by hour and year. The 2021 to 2022 shock to roughly £198/MWh, then a partial 2026 rebound to about £92."
          width={1071} height={609}
        />
      </div>

      <div className="slide-grid-3">
        {[
          { year: '2021', color: 'var(--amber)', body: 'Post-COVID reopening lifted fuel demand into constrained gas supply. Low wind output and the IFA interconnector fire tightened the system toward record prices.' },
          { year: '2022', color: 'var(--red)',   body: 'The Russia-Ukraine war drove a European gas-price spike and risk premium, fed in through gas-fired marginal generation, plus high carbon costs and French nuclear outages.' },
          { year: 'The mechanism', color: 'var(--teal)', body: 'Not a demand story. Gas sets the GB clearing price most of the time, so gas costs pass straight into power. Marginal pricing then amplifies the shock.' },
        ].map((c) => (
          <div key={c.year} className="info-card" style={{ borderLeftColor: c.color }}>
            <div className="info-card__body">
              <div className="info-card__title" style={{ color: c.color }}>{c.year}</div>
              <div className="info-card__text">{c.body}</div>
            </div>
          </div>
        ))}
      </div>

      <Footnote text="Source: GB day-ahead and demand data, 2020 to 2026; client risk report, Section 0. Gas set the power price about 97% of the time in 2021 on 37% of generation." />
    </Slide>
  );
}

// ---------- Slide 5: The transition ----------

export function SlideTransition() {
  return (
    <Slide id="transition" theme="light" labelledBy="transition-title">
      <Kicker>INDUSTRY OVERVIEW &middot; THE TRANSITION</Kicker>
      <h2 id="transition-title">From fossil-led flexibility to a wind-heavy system</h2>

      <div className="slide-grid-2" style={{ marginBottom: 20 }}>
        <ChartFigure
          src="/charts/generation-mix-2020-2026.png"
          alt="Stacked area chart showing GB generation mix from 2020 to 2026, with fossil share falling as renewables climb above half of output."
          caption="Generation mix, 2020 to 2026. Fossil share falls as renewables climb above half of output."
          width={1281} height={604}
        />
        <ChartFigure
          src="/charts/generation-by-fuel-year.png"
          alt="Bar chart showing GB generation by fuel type and year. Gas stays the largest single source but its share shrinks; coal reaches zero by 2025."
          caption="Generation by fuel and year, in MW. Gas stays the largest single source but its share shrinks; coal reaches zero."
          width={962} height={581}
        />
      </div>

      <div className="slide-grid-4">
        <StatTile value="33.8% to 54.2%" label="renewable share of generation, 2021 to 2026" color="green" />
        <StatTile value="20.3% to 38.2%" label="wind share: the transition is wind-led" color="green" />
        <StatTile value="Coal to 0" label="coal generation reaches zero by 2025" color="muted" />
        <StatTile value="9.8 GW" label="average gas, swinging 6.6 GW overnight to 13.3 GW at 18:00" color="amber" />
      </div>

      <Footnote text="Source: GB generation-by-fuel data, 2020 to 2026; client risk report, Section 0. Gas remains the flexible backbone even as its share falls." />
    </Slide>
  );
}

// ---------- Slide 6: Shape / profile ----------

export function SlideShape() {
  return (
    <Slide id="shape" theme="light" labelledBy="shape-title">
      <Kicker>INDUSTRY OVERVIEW &middot; THE RENEWABLE SHAPE</Kicker>
      <h2 id="shape-title">When you generate is not when demand peaks</h2>

      <div className="slide-split">
        <ChartFigure
          src="/charts/hourly-generation-radar.png"
          alt="Radar chart showing average hourly generation by fuel type. Solar bulges at midday; gas and pumped storage swing out into the evening peak."
          caption="Average hourly generation by fuel. Solar bulges at midday; gas and pumped storage swing out into the evening."
          width={958} height={590}
        />

        <div className="slide-col">
          {[
            { icon: <Sun size={18} />, color: 'green' as const, title: 'Solar', body: 'Near zero overnight rising to about 4.8 GW at midday. The strongest daily shape of any source.' },
            { icon: <Zap size={18} />, color: 'amber' as const, title: 'Gas + pumped storage', body: 'Gas swings up to about 13.3 GW and pumped storage to about 0.86 GW into the 16:00 to 19:00 peak.' },
            { icon: <Plug size={18} />, color: 'teal' as const, title: 'Nuclear', body: 'Almost flat at about 4.43 GW. Baseload that does not follow the daily shape.' },
          ].map((r) => (
            <div key={r.title} className="info-card" style={{ borderLeftColor: `var(--${r.color})` }}>
              <IconBadge icon={r.icon} color={r.color} />
              <div className="info-card__body">
                <div className="info-card__title">{r.title}</div>
                <div className="info-card__text">{r.body}</div>
              </div>
            </div>
          ))}
          <div className="info-card info-card--dark info-card--deep">
            <div className="info-card__body">
              <div className="info-card__title">The mismatch</div>
              <div className="info-card__text">
                Demand peaks at 18:00 when solar is gone. The gap between when you generate and
                when demand peaks is profile risk.
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footnote text="Source: GB hourly generation data, 2020 to 2026; client risk report, Section 0. The diurnal mismatch is the root of shape and profile risk." />
    </Slide>
  );
}

// ---------- Slide 7: Seasonality ----------

export function SlideSeasonality() {
  return (
    <Slide id="seasonality" theme="light" labelledBy="seasonality-title">
      <Kicker>INDUSTRY OVERVIEW &middot; SEASONALITY</Kicker>
      <h2 id="seasonality-title">Seasonality and the weather drivers</h2>

      <div className="slide-split">
        <ChartFigure
          src="/charts/wind-vs-solar-monthly.png"
          alt="Line chart comparing total monthly GB wind and solar generation. Wind leads in winter, solar leads in summer."
          caption="Total wind versus solar by month. Wind leads winter, solar leads summer, so they partly offset."
          width={1230} height={512}
        />

        <div className="slide-col">
          <ChartFigure
            src="/charts/wind-output-windspeed-temp.png"
            alt="Scatter chart showing GB wind output plotted against 10 m and 100 m wind speed and temperature."
            caption="Wind output with 10 m and 100 m wind speed and temperature."
            width={1253} height={564}
          />
          <ChartFigure
            src="/charts/solar-output-temp.png"
            alt="Scatter chart showing GB solar output plotted against temperature, tracking daylight and seasonal patterns."
            caption="Solar output with temperature. Solar tracks daylight and the seasons."
            width={1413} height={562}
          />
        </div>
      </div>

      <div className="corr-tiles">
        <div className="corr-tile">
          <div className="corr-tile__val">r = +0.74</div>
          <div className="corr-tile__label">wind output vs 100 m wind speed</div>
        </div>
        <div className="corr-tile corr-tile--teal">
          <div className="corr-tile__val corr-tile--teal">r = -0.66</div>
          <div className="corr-tile__label">wind output vs temperature</div>
        </div>
        <div className="corr-tile corr-tile--amber">
          <div className="corr-tile__val" style={{ color: 'var(--amber)' }}>r = +0.71</div>
          <div className="corr-tile__label">solar output vs temperature</div>
        </div>
        <div className="corr-tile corr-tile--deep">
          <div className="corr-tile__val" style={{ color: 'var(--deep)' }}>r = -0.41</div>
          <div className="corr-tile__label">solar vs wind, month to month</div>
        </div>
      </div>
      <p className="corr-summary">
        Wind averages 5.86 GW with winter output about 2.7 times summer; solar averages 1.46 GW
        and is up about 53% since 2020. Wind is roughly 4 times solar and about 80% of combined
        renewable output.
      </p>

      <Footnote text="Source: GB monthly generation and ERA5-style weather data, 2020 to 2026; client risk report, Section 0." />
    </Slide>
  );
}

// ---------- Slide 8: Cannibalisation ----------

export function SlideCannib() {
  return (
    <Slide id="cannib" theme="white" labelledBy="cannib-title">
      <Kicker color="amber">INDUSTRY OVERVIEW &gt; THE CORE PROBLEM</Kicker>
      <h2 id="cannib-title">Cannibalisation: most output when prices are lowest</h2>

      <div className="slide-split slide-split--60-40">
        <ChartFigure
          src="/charts/cannibalisation.png"
          alt="Line chart showing a representative day where renewable output peaks at midday when the wholesale price is lowest, illustrating how captured price falls below baseload."
          caption="Representative day. Renewable output peaks at midday when the wholesale price is lowest, so the captured price falls below baseload."
          width={975} height={495}
        />

        <div className="slide-col">
          <p className="slide-lead" style={{ marginBottom: 12 }}>
            The single most important risk for a renewable supplier.
          </p>
          <div className="slide-grid-2" style={{ marginBottom: 12 }}>
            <div className="stat-tile stat-tile--teal">
              <div className="stat-tile__num stat-tile__num--teal">£103</div>
              <div className="stat-tile__label">baseload average</div>
            </div>
            <div className="stat-tile stat-tile--amber">
              <div className="stat-tile__num stat-tile__num--amber">£86</div>
              <div className="stat-tile__label">captured price</div>
            </div>
          </div>

          <div className="slide-col" style={{ gap: 8, marginBottom: 12 }}>
            {[
              'You produce most at midday and overnight, when the price you capture is lowest.',
              'The capture rate erodes further as renewable penetration rises across the grid.',
              'It leaves a basis between your hedge or CfD reference and the price you actually capture.',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--green)', marginTop: 2, flexShrink: 0 }}>&#9679;</span>
                <span>{t}</span>
              </div>
            ))}
          </div>

          <div className="callout-panel callout-panel--amber">
            <div className="callout-panel__body">
              This is why naive volume hedging backfires, and why the rest of this toolkit exists.
            </div>
          </div>
        </div>
      </div>

      <Footnote text="Source: client risk report, Figure 1 and Section 3. Capture price, or quality factor, is the revenue a fleet earns relative to the baseload average." />
    </Slide>
  );
}
