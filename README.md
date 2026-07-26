# GB Renewable-Backed Supplier, Hedging Simulation & Replay Platform

A TypeScript/Node platform that **replays** a GB renewables-backed electricity supplier's
hedging book over real half-hourly market data, and **simulates** the instruments and
structures from `GB_Renewable_Supplier_Risk_Report.docx` (caps/floors/collars, swing,
proxy revenue swap, PPA shapes, BESS arbitrage, integrated portfolio risk).

## Data provenance rules (strict)

- **No data is fabricated.** Real inputs come only from the source files listed below.
- Blanks in the source are preserved as `NaN`, never zero-filled. Drop an updated source file
  into `data/` and re-run `npm run extract`, the pipeline is column-driven and picks up new columns.
- The browser loader forward-fills gaps so the simulator sees a continuous series. Those carried
  values are flagged (`Dataset.filledMask`) and the analysis page excludes them by default, so
  analysis only ever reports observations.
- Model output (price scenarios, option premia) is **calibrated to real history** and
  always **labelled `model-derived`**. It is used only where no real future/forward exists.

## Real dataset

Half-hourly, **2015-01-01 → 2026-06-02, 200,208 periods, 52 columns** (43 MB raw / 13 MB gzipped;
measurements are float32, time axes float64).

The row space is a **generated, gap-free half-hourly grid spanning every half-hourly source** |
the GB sheet is one input, not the row space, so the Elexon extracts and the workbook keep the
years they reach back to instead of being clipped at 2020. Everything joins on the settlement key
`round(excel_serial * 48)`. NBP is excluded from the span (daily, back to 2001) so it cannot
stretch the grid with rows only one column could fill.

Each column therefore starts and stops at its own date; `gb.meta.json` records `coverage`
(first/last populated timestamp) per column, and the analysis page shows it in each field's
tooltip. Charts trim themselves to the span of the series they draw, so a 2020-only series does
not open with five years of blank axis.

What actually exists before 2020 (audited against the source files, not assumed):

| Series | Earliest | Source |
|---|---|---|
| NBP gas spot | 2001-10-15, clipped to the 2015 grid start | NBP workbook |
| Weather: weighted, per-farm, per-city | 2015-01-01 | `gb_renewable_datasets.xlsx` |
| Workbook power price (hourly, ends 2020-12-31) | 2015-01-01 | `gb_renewable_datasets.xlsx` |
| Cash-out, NIV, accepted volumes | 2015-11-06 | Elexon system prices |
| INDO / ITSDO demand | 2016-02-29 | Elexon demand outturn |
| Elexon wind and solar outturn | 2016-02-29 | Elexon wind/solar actuals |
| BM offer/bid volumes | 2016-09-12 | Elexon BM accepted volumes |
| **Day-ahead price, system load, ENTSO-E generation mix, base weather** | **2020-01-01** | `GB-realtime-data.xlsx` |

The last row is a property of the source, not of the pipeline: every sheet in
`GB-realtime-data.xlsx` (`GB` and `GB_adjust` are both 112,363 rows; the rest are pivot
summaries) starts at 2020-01-01. There is no earlier day-ahead price, load or fuel-level
generation mix anywhere in the supplied files. DC clearing prices cover 2021-09 to 2022-10,
DM/DR 2022 only.

Because of that, `Dataset.window(column)` + `Dataset.slice(from, to)` exist: the simulator and
replay run over the dense day-ahead-price window (112,560 periods, 2020 on), while the analysis
page keeps the whole grid.

| Source | Contributes |
|---|---|
| `GB-realtime-data.xlsx` (sheet `GB`) | day-ahead price, load, full ENTSO-E generation mix, temperature, wind speed 10/100 m |
| `data/elexon_system_prices_*.parquet` | settlement period, cash-out sell/buy, NIV, reserve scarcity, replacement price, accepted offer/bid volumes |
| `data/elexon_wind_solar_actuals_*.parquet` | Elexon solar / offshore / onshore wind outturn |
| `data/elexon_demand_outturn_*.parquet` | INDO and ITSDO national demand |
| `data/elexon_bm_accepted_volumes_*.parquet` | BOALF offer/bid/net volumes and acceptance counts |
| `data/gb_renewable_datasets.xlsx` | per-farm wind speed (Hornsea One, Dogger Bank A, Sheringham Shoal, Walney Ext, Whitelee), per-city temperature (London, Manchester, Edinburgh, Birmingham), weighted weather indices, DC/DM/DR clearing prices, and its own hourly power price for 2015-2020 (`workbook_price_gbp_mwh`) |
| `data/NBP spot_*.xlsx` (first sheet) | NBP natural-gas spot, GBp/therm, daily | joined on calendar day and carried forward at most 5 days over non-trading days |

Verified: per-year price reproduces the report exactly (2022 £198, 2025 £80, 2026 £92); wind
capture £86.6 vs baseload £98.6 → quality factor **0.878** (real cannibalisation). `gb.meta.json`
carries a unit and one-line description for every column, which is what labels the analysis axes.

**`workbook_price_gbp_mwh` is not the day-ahead price.** It is the workbook's own hourly power
price, the only price series covering 2015-2019, but on their 2020 overlap it correlates 0.79
with `da_price_gbp_mwh` at a mean absolute difference of £6.7/MWh. The two are kept as separate
columns and never merged.

## Analysis page (`apps/web/src/analysis/`)

A data explorer over the same dataset: pick a chart, an index, measures and filters, then export
what you see.

- **72 fields** | every raw column plus derived quantities (total generation, renewable/wind share,
  residual demand, gas £/MWh, clean spark spread, cash-out spread, wind-farm speed basis) and
  calendar attributes (settlement day, delivery day, week/month/quarter, year, month of year,
  day of week, hour, weekend flag).
- **Filters** | field conditions (`>`, `between`, `is one of`, `is missing`, …) combined with
  all/any, plus formula conditions such as `renewShare < 0.2 and nbpPence > 100`. Formulas are
  parsed and compiled, never `eval`'d; a missing value never satisfies a condition.
- **Custom fields** | name a formula (`(totalWind + solar) / totalGen`) and it joins every picker.
- **Formula completion** | both formula boxes suggest field keys, functions and keywords as you
  type: Tab or Enter inserts, Ctrl+Space lists everything, functions bring their brackets, and an
  operator row inserts brackets, commas, comparisons and the and/or/not logic at the caret.
- **21 chart types** across trend, distribution, relationship, matrix and 3-D families, each with a
  hover guide covering what it is for, how to wire it up and how to read it.
- **Table + export** | sortable, paginated, exports to CSV and XLSX with a Definition sheet
  recording the dataset span, filters, formulas and row counts that produced the extract.

## Layout

```
scripts/extract_gb.py          Phase 0, sources -> data/gb.f64 (column-major f64) + .z + gb.meta.json
packages/core/                 quant engine (pure TS, no synthetic real-inputs)
  src/dataset.ts               columnar loader, raw+alias columns, derived series
  src/stats.ts                 NaN-aware mean/std/corr/quantile/VaR/CVaR
  src/replay.ts                Phase 1, supply book, settle vs real da_price, capture/margin
  src/rng.ts  scenario.ts      Phase 2, OU + jumps + slow factor, MC paths, forward curve
  src/pricing.ts instruments.ts Phase 3, Bachelier/Black-76, collar solver; proxy swap, PPA, swing
  src/battery.ts               Phase 4, BESS arbitrage daily-SoC dynamic programming
  src/portfolio.ts             Phase 5a, block-bootstrap risk waterfall + real-day stress tests
  test/*.ts                    runnable demos for each phase
apps/web/                      Phase 5b, Vite + React dashboard (loads real data, live controls)
  src/analysis/                data explorer: field catalogue, formula parser, filters,
                               21 chart types (Plotly, lazy-loaded), table + CSV/XLSX export
```

## Run

```bash
npm install
npm run extract                       # build data/gb.f64 from data/ sources (needs python + pyarrow)
npm run verify                        # round-trip + report cross-checks on real data
npm run test:web                      # dashboard, analysis engine and export smoke tests
npx tsx packages/core/test/replay-demo.ts        # supply-book replay
npx tsx packages/core/test/scenario-demo.ts      # price model calibration + validation
npx tsx packages/core/test/instruments-demo.ts   # option pricing + hedge backtest
npx tsx packages/core/test/battery-demo.ts        # BESS arbitrage + duration value
npx tsx packages/core/test/portfolio-demo.ts      # capstone risk waterfall + stress

npm run build -w @gbsim/core          # compile engine to dist (web imports this)
npm run dev   -w @gbsim/web           # dashboard at http://localhost:5173
```

## Headline results (real data, default 1%-of-GB book)

- Capture £88.4 vs baseload £98.6 → quality factor 0.897; merchant nose £124m.
- 2022 margin collapses (£52m vs £210m in 2020), book is short the residual into the spike.
- Zero-cost collar (model-priced, real backtest): margin CVaR95 cut **92.8%**, std 32%.
- BESS arbitrage: 2h £52k/MW/yr, rising with duration (1h £31k → 4h £79k).
- Integrated waterfall: collar+battery cut annual-margin std 31%, lift worst-5% margin £122m→£171m.

## Known limitations (self-review, to revisit)

1. **Scenario downside tail too fat.** Jumps are symmetric, so the model over-produces
   negative spikes (min −£531 vs real −£103; neg-price share 5.9% vs 1.86%). Upside p99
   slightly under-shoots (£282 vs £395). Fix: asymmetric/upward-biased jump distribution.
2. **No traded forward/vol.** The forward curve and option vol are model-derived under the
   real-world measure (no risk-neutral calibration), since the data has no GB forwards.
   Premia are indicative, not market-consistent. Provide a forward curve to make them so.
3. **Battery dispatch is a perfect-foresight upper bound** (daily SoC DP, free terminal SoC).
   Real revenue under forecast/persistence dispatch is lower. Arbitrage-only by design.
4. **Bootstrap block length** (mean 30 days) is a modelling choice; the annual-margin
   spread is sensitive to it. It retains intra-month dependence but underweights the rare
   multi-year regime (e.g. an all-2022). Stress tests cover the regime tail separately.
5. **Stress "annualised impact"** assumes the adverse day-type persists all year, an
   upper-bound illustration, not an expected annual figure.
6. **Proxy revenue swap** is reported at the generator/bankability level. At this book's
   integrated-margin level its own generation is a natural hedge of demand cost, so the
   swap there trades that offset away, surfaced explicitly, not hidden.

## Deferred pending data (you will provide)

- **BMRS imbalance / cash-out** (`systemSellPrice`, `netImbalanceVolume`) → residual settlement leg.
- **BM / frequency-response / Capacity Market** prices → full BESS revenue stacking.
- **Participant-level generators/consumers** → P2P matching (§7) and demand-side response (§5C).
