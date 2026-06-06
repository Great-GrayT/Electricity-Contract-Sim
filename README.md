# GB Renewable-Backed Supplier — Hedging Simulation & Replay Platform

A TypeScript/Node platform that **replays** a GB renewables-backed electricity supplier's
hedging book over real half-hourly market data, and **simulates** the instruments and
structures from `GB_Renewable_Supplier_Risk_Report.docx` (caps/floors/collars, swing,
proxy revenue swap, PPA shapes, BESS arbitrage, integrated portfolio risk).

## Data provenance rules (strict)

- **No data is fabricated.** Real inputs come only from `GB-realtime-data.xlsx` (sheet `GB`).
- Blanks in the source are preserved as `NaN`, never zero-filled. Populate the xlsx and
  re-run `npm run extract` — the pipeline is column-driven and picks up new columns.
- Model output (price scenarios, option premia) is **calibrated to real history** and
  always **labelled `model-derived`**. It is used only where no real future/forward exists.

## Real dataset

Sheet `GB`: half-hourly, **2020-01-01 → 2026-06-02, 112,363 periods**. Columns: `da_price`,
`load_mw`, full generation mix (biomass, gas, coal, oil, hydro PS/ROR, nuclear, other, solar,
wind on/off), `temperature_2m`, `wind_speed_10m/100m`. Verified: per-year price reproduces the
report exactly (2022 £198, 2025 £80, 2026 £92); wind capture £86.6 vs baseload £98.6 → quality
factor **0.878** (real cannibalisation).

## Layout

```
scripts/extract_gb.py          Phase 0 — xlsx sheet -> data/gb.f64 (column-major f64) + gb.meta.json
packages/core/                 quant engine (pure TS, no synthetic real-inputs)
  src/dataset.ts               columnar loader, raw+alias columns, derived series
  src/stats.ts                 NaN-aware mean/std/corr/quantile/VaR/CVaR
  src/replay.ts                Phase 1 — supply book, settle vs real da_price, capture/margin
  src/rng.ts  scenario.ts      Phase 2 — OU + jumps + slow factor, MC paths, forward curve
  src/pricing.ts instruments.ts Phase 3 — Bachelier/Black-76, collar solver; proxy swap, PPA, swing
  src/battery.ts               Phase 4 — BESS arbitrage daily-SoC dynamic programming
  src/portfolio.ts             Phase 5a — block-bootstrap risk waterfall + real-day stress tests
  test/*.ts                    runnable demos for each phase
apps/web/                      Phase 5b — Vite + React dashboard (loads real data, live controls)
```

## Run

```bash
npm install
npm run extract                       # build data/gb.f64 from the xlsx (needs python)
npm run verify                        # round-trip + report cross-checks on real data
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
- 2022 margin collapses (£52m vs £210m in 2020) — book is short the residual into the spike.
- Zero-cost collar (model-priced, real backtest): margin CVaR95 cut **92.8%**, std 32%.
- BESS arbitrage: 2h £49k/MW/yr, rising with duration (1h £30k → 4h £71k).
- Integrated waterfall: collar+battery cut annual-margin std 31%, lift worst-5% margin £122m→£171m.

## Known limitations (self-review — to revisit)

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
5. **Stress "annualised impact"** assumes the adverse day-type persists all year — an
   upper-bound illustration, not an expected annual figure.
6. **Proxy revenue swap** is reported at the generator/bankability level. At this book's
   integrated-margin level its own generation is a natural hedge of demand cost, so the
   swap there trades that offset away — surfaced explicitly, not hidden.

## Deferred pending data (you will provide)

- **BMRS imbalance / cash-out** (`systemSellPrice`, `netImbalanceVolume`) → residual settlement leg.
- **BM / frequency-response / Capacity Market** prices → full BESS revenue stacking.
- **Participant-level generators/consumers** → P2P matching (§7) and demand-side response (§5C).
