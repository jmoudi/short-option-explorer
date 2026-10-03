# v10 status

## Done and verified

- **Step 1: the event loop** (tag `step1` in the working repo; pushed as 35ed553). The core is `core.js`: Command, Bus, Store,
  CommandExecutor, FrameLoop, Result and Fault. Adapters for storage, clipboard, download and calendar live in `adapters.js`.
  The appX renames are done and there is a tsc --checkJs gate. The page is identical to v9: the full harness ran 208 runs
  over 984 checkpoints with 0 differences.
- **Step 2, part I** (PLAN_V10.md §1, the period vol):
  - 2a: the one state tree `{comparison, assumptions, prefs, periodVol}`, `#v10.` codes and the `rk-lab-v10` key. v9, v8
    and v5 codes and stored views still load. The harness map `tools/reg/maps/v10_to_v9.js` shows 0 differences against step 1.
  - 2b: the period vol per ticker. This covers:
    - `SetPeriodVol` (Result, floors and clamps as faults, stored source);
    - one accessor `volOf` and one label helper;
    - `DIST.make({expiry, odds, vol})`, with a closed-form cdf and a 7·max(ATM, vol)·√T grid in period-vol mode, and the
      memo keyed on the vol in that mode only;
    - every EV reading on the period vol;
    - "Odds: implied | period vol";
    - the hvk slider removed and migrated;
    - the slot popover's presets (HV30, ATM at a horizon, custom with reference ticks);
    - the summary line "vol 117% (HV30) vs IV 124%".
  - 2c: the Compounding tab reads and writes the same number through `COMPOUND.init({port: {periodVol}})`. Its own rv is no longer
    stored; the migration precedence follows the plan. The Monte Carlo goes stale on a change. The vol range is 0–300.
    The "B differs in vol" override belongs to a run, and a swap flips it.
  - Checks: three verify rounds. Rounds 1 and 2 found 18 and 5 issues, all fixed. Round 3's review found no blocker or
    major issue. Build OK with tsc 0, and 151 tests pass. The harness against step 1 shows only intended differences,
    with 0 console errors. The 14 B-only period-vol scenarios pass.

## Open (minor, from the round-3 review, not yet fixed)

- R3-1: `StandalonePeriodVol.refs` in compound_ui.js has no `this` and re-reads the realized refs. It should read them through
  INST, the one reader.
- R3-2: add `HitBasis` to test/load.js's export list.
- R3-3: one `isFlooredVol` guard and one `C.listVolLabels(ids)` helper, in place of the copies at about 8 call sites.
- R3-4: use the GrowthRate / HitBasis / RunSlot enums on the lines part 2 touched (ui_views.js ~1151–1160, compound_ui.js ~446).
- R3-5: named objects instead of positional tuples in the vol reference rows (compound_ui.js ~295), and `findRef({id, source})`.
- R3-6: in vol mode, B's pair is tagged "own" while it still follows the shared vol. Either show the tag only when the
  override holds a value, or seed the override with the shared value on entering vol mode, as v9's rvB did.
- R3-7: CORE_API.md still lists superseded signatures (DIST, statsHV, hvk).
- R3-8: rename locals named `hv` that hold period-vol stats.
- The round-3 regression run was stopped before it finished. A later `--fast` run had one flaky failure in the
  `view-grid` scenario; it passed when rerun alone.

## Not started

- **Step 3:** options-object signatures across the model, flags → faults, and the rename list. Already recorded for it:
  compound_ui date formatting through the calendar, CMP `apply` closure removal, and `PlaceLeg` model work moving to STATE/CMP.
- **Step 4:** panels as classes.
- **Step 5:** TypeScript.

## How to check

- `python3 build.py` builds and runs the checks, including the tsc gate.
- `node --test test/*.test.js` runs the tests.
- `node tools/reg/pixdiff.js --a <ref.html> --b <new.html> [--map-b tools/reg/maps/v10_to_v9.js] [--fast]` runs the
  harness (in the working folder it lives in scratch/reg; see its README).

## Fixed after part I

- Compounding: dropping run B threw (stale control syncs of B's editor, kept since v8/v9) before the results redrew, so
  the old B row stayed on screen. Binders built in the run dock now register in the dock's own list, which is replaced
  on every rebuild. With B off the bar is a single-run bar (no vs, swap or "B differs in"; a dashed "+ compare with a
  second run"). Check: `node tools_checks/compounding_drop_b.js`.
- The app's name is "Short Options Comparer" (one constant, `CORE_CONFIG.appName`; header, title, exports).

## Done in the trader loop

- **Positions rebuilt from scratch.** It is now two stacked boxes, A on top and B below, drawn by one renderer called
  twice with the same rows. B's relation to A is a chain beside each of B's labels. B's controls stay live: editing a
  linked row sets B on its own, and a toast offers the relink. Each box head shows the position, the net credit and how
  it was filled, the same legs at mid and at natural, the ATM IV (marked "sets σ") and the days left.
- **Typed fills.** Each leg takes the price you actually got, or one net price split over the sold legs by mid. A typed
  price is pinned to its contract (ticker, expiry, strike, put/call). If the leg moves, it stops applying and a warning
  says so. Typed fills feed credit, margin, payoff, EV and the view code. They are never copied from A to B.
- **Legs always visible.** Each box lists its legs: fill and how it was got, the leg's own IV from its mid (the smile
  fit is in the tooltip), $ per contract, bid / ask / spread.
- **The card names its vols.** "period vol 117% (HV30) · ATM IV 124%". "your fill" replaces "mid" when prices are typed.
  "same contracts, only the fill differs" replaces a false "only the instrument differs".
- **Strike placement sweep: Smooth.** A Gaussian window as wide as the strike-step period. A "smoothed" badge shows on
  each chart, the raw lines stay faint, and the hover shows both values.
- **Compounding: a sticky cursor on every chart** (credit, margin call so far, leverage/margin sweep, stress loss by
  week, room by week, loss vs gap, Random years): a line at the nearest point and the values there.
- **Checks** (Playwright, set `PAGE` to the built file): `tools_checks/compounding_drop_b.js`, `dock_fills.js`,
  `sweep_smooth.js`, `compounding_cursor.js`.

## Done after the trader review

- **Weeks, not years.** The Compounding tab speaks in weeks: the Weeks | Stress views, "Over N weeks", "Margin call
  within N wk", "10%–90% of outcomes", Random paths. Path and IV-path growth is typed per week or over the weeks shown.
  The realized-vol references read 52-wk and 260-wk. Recovery time is always in weeks. Views saved with the old words
  migrate. The modules are compound_engine / compound_stress / compound_ui (COMPOUND_ENGINE, COMPOUND_STRESS, COMPOUND),
  and the engine's entry point is runHorizon. Left as is: the serialization key and tab value "yr" inside saved views
  and links (invisible; renaming them needs a format migration).
- **Smoothing strength.** A slider from 0 (off) to 4 strike steps replaces the on/off box. The legend shows the actual
  window, e.g. "smoothed · 6.2Δ window".
- **The sweep prices every placement the same way** (the fill mode). Your typed fill is a ring at your position, and
  the y range includes it, so a fill far from mid stays visible.
- **The card says "ATM IV"** wherever it shows the expiry's IV. The relink pill reads "↺ B follows A again".

## Done in round 3 (part II, two features, five improvements, axes, knobs)

- **Part II, recovery** (`recovery.js`, namespace RECOVERY, pure). One `computeRecovery({built, vol, hit, capital,
  growth, typedRate})` returns a RecoveryReading. It has three growth rates per cycle: best case (credit / capital),
  if no such hit (the log-mean over outcomes above the hit, Gauss–Legendre), and average (the log-mean over all
  outcomes). It also gives the cycles for each, q (the chance of a hit this bad in one cycle) and the honesty line: the
  chance of no such hit over the cycles recovery needs, (1−q)^N, amber below 50%. The hit is a move in σ or a fixed %,
  on the worse side, down or up, measured on margin or on notional. Growth sits in the toolbar. An old `rdG "ev"`
  loads as Average. The export reads the same reading. Tests: T26.
- **Part II, the rest.** "% of A's margin" is a reading unit. The EV row has a knob that explains it: credit, the
  expected settlement at the vol used, and EV, at implied odds or at the period vol.
- **Feature 1: break-even vol.** For each position, the period vol at which the expected P&L at expiry is zero, at its
  own fill (bisection on the closed form). It shows in each box head as "break-even vol 85.3% · −32.0 pts over period
  vol 117%", and as a table row with A − B in vol points.
- **Feature 2: Manage the trade** (`manage.js`, namespace MANAGE, pure). A take-profit / stop rule (% of the credit)
  is simulated over seeded daily paths at the period vol, with marks on the implied smile. It uses antithetic pairs,
  12k paths, a control variate on the exact held EV, and pairwise standard errors. The panel compares managed with held
  to expiry: how often each exit happens and on which day, days held, EV per trade and per day, win rate, and the mean
  of the worst 5%. Tests: T27.
- **Five improvements.**
  - The payoff shows P&L now and half-way (dotted and dashed) beside expiry.
  - The better side of each comparable row is marked.
  - Breakevens show the odds of touching each before expiry.
  - Copy order puts an order ticket on the clipboard: legs, limit, mid, natural and the date of the quotes.
  - With a strike slider focused, the arrow keys step one listed strike.
- **Axis hover (AXES).** Hovering inside an axis shows what that coordinate means.
  - The payoff's price axis: σ, the move, and the odds of ending beyond the price.
  - P&L axes: every unit, and the odds of doing at least that well.
  - The smile: IV against the period vol and the ATM IV, and the 1-day, 1-week and to-expiry moves.
  - The sweep: Δ, placement and strikes.
  - Compounding: week and date, price on the path, NAV, contracts.
  - Check: `tools_checks/axes.js`.
- **Info knobs (KNOBS).** Hover shows the card; a click pins it, and several can stay pinned. A second click, the × or
  Escape closes it. `KNOBS.label` keeps a knob on the line of its label's last word. Knobs are on every comparison row,
  the Compounding headline (Weeks and Stress), recovery, the box heads and the Manage panel. Check:
  `tools_checks/knobs.js`.
- **Layout.** The dock fill row wraps inside its box; B's title wraps instead of cutting the strikes. The Weeks
  headline is a grid, so A and B line up at any width. The Stress strip's "At the low" now turns red on a loss: it had
  two class attributes.
- **Checks.** `compounding_drop_b.js` now tests for B's row itself. Before, it looked for "Shares · lots", which is A's
  label in the default covered-call run.

## Done in round 4 (inputs apart from readings and facts)

- **Payoff: one time at a time.** A Days left slider, from 0 (at expiry) to today. It replaces the now and half-way
  curves. The title says what is shown ("P&L with 8 of 50 days left"). A and B are drawn at that day, and the expiry
  payoff stays as a faint line. The A − B panel and the tooltip read the same day; the tooltip adds A and B at expiry.
  The `pnow` pref is gone and `payLeft` (days left on A) replaces it.
- **Position boxes define the position only.** The head shows the name, the net credit and Copy order. Break-even vol,
  "mid", the mid / natural references, ATM IV and days left are gone from it. Mid and natural for the same legs now
  sit in the Fill editor. The legs list shows each leg, its fill (✎ when typed) and its $ per contract.
- **Summary cards.** They show the position, the legs and the net credit with its % of spot. The fill word, both vols,
  the days and the forward are gone.
- **Market facts** (new panel, `ui_facts.js`, namespace FACTS). It covers each ticker in use:
  - spot (✎ when typed) and the period vol with its references;
  - every listed expiry: days, forward, ATM IV, and the 1σ move to expiry in % and in price;
  - the contracts A and B hold: bid, ask, mid, spread, own IV and delta.
  
  The spot / IV / period vol editor moved here from the box's Instrument row (Edit per ticker). There is one editor
  per side on the ticker; B gets its own only while B sets its instrument on its own.
- **Break-evens.** In the table, "Break-even price" (each price, its move from spot and the odds of touching it) sits
  directly above "Break-even vol".
- **Checks.** `axes.js` centres each band before hovering it, so a band partly under the fixed summary no longer
  reads as silent. T25 reads the floored vol and the editor under Market facts.

## Done in round 5 (junior tabs, capture, separation)

- **Two-level header.** Row 1 holds the parent tabs (Compare A vs B | Compounding). Row 2 holds the shown tab's own
  junior tabs: Compare has Comparison | Capture | Market facts (`prefs.cmpView`); Compounding has Weeks | Stress |
  Credit kept (`ys.view.v`). Offsets run through `--navh`. VIEWS renders only the shown junior view. Pinned info
  cards close on any tab switch.
- **Capture** (`capture.js`, namespace CAPTURE, pure; tests T28). Capture is the share of the maximum payoff (the
  credit, for a short straddle or strangle) a position keeps, weighed by the odds. Scenarios: a lognormal (centred on
  the mean, or on a path's median), with a gap mixed in, a chain's implied distribution, or past closes. Readings:
  mean, median, any percentile, odds of keeping at least x, the curve, the keep band (open ends where they exist), the
  time path, growth on a capital (a wipe-out chance is flagged, and the cycles without one are reported apart), and
  a managed rule (path-centred, with a control variate and its standard error).
- **Compare → Capture** (`ui_capture.js`). It has eight named presets, each with a one-line explanation and a
  pinnable knob: Fixed share, Expected, Median, Odds of keeping at least x, Managed (the Manage panel's rule), Time
  path, Growth (on the Recovery panel's capital; "ends at zero" when a wipe-out is possible) and Empirical (paste
  closes; decimal commas understood, odd jumps flagged). It also has the curve of the odds of keeping at least x,
  what time alone gives at an unchanged price, and a basic "Your variant": odds from period vol, ATM IV or a typed
  vol, a gap, mean / median / percentile, and an early exit. Export section "Capture".
- **Compounding → Credit kept.** Each cycle's own legs, IV and moves vol give the same readings per cycle. The NAV
  column says what they compound to on the account: the engine's contracts re-sized as it does, the fill's haircut on
  the credit, covered calls' shares under the same price spread, and fixed-size runs added up. Growth gives the
  log-average NAV, Expected and Managed the average NAV; a median per cycle "does not compound". The table sits beside
  the full model's typical and log-average NAV. There is a NAV chart per preset (click a row), a "Your variant", and
  an export section "Credit kept". The cache keys on the engine run itself, so a vol, rate or path change recomputes.
- **Separation.**
  - Market facts is its own junior tab: quotes line, tickers, expiries, the contracts in use with strike vs forward,
    intrinsic and time value, the spot / IV / period vol editor, and the smile.
  - The summary cards show the definition only: legs, net credit, and the placement as set.
  - The Positions boxes show target → landed strike, with no achieved Δ; the ATM marks are named, with their Δ in the
    tooltip.
  - The Compounding Runs panel shows only the strike week 1 lands on, plus the ceiling warning.
  - "Legs in detail" is gone; its contents are in Market facts.
- **Sweep smoothing** is on a logarithmic slider from 0 (off) through 0.02 to 2 strike steps. Its middle is about
  0.18 steps, 11× gentler than before; its far right is the old 2.
- **Review round.** A four-lens review workflow (maths, state, trader, browser) with verifiers confirmed 40 findings.
  All are fixed: stale Credit kept, covered-call averages, exposure re-sizing, the swap labels, Managed centring,
  the Growth floor, signed losses, the closes parser and the other minors. Checks: `tools_checks/junior_tabs.js` and
  `tools_checks/capture_review.js`.

## Trader notes from this round

- The KORU 16 Oct straddle filled at 2.90 (mid 4.32) has a break-even vol of 85% against a period vol of 117%: the fill
  gave away 32 vol points, and its EV is about −$108 per contract. The 19/24.5 strangle at mid needs 127.5%.
- At 50% take-profit and 200% stop, the strangle keeps its EV per day and cuts the mean of its worst 5% from −$752 to
  −$579. The straddle at 2.90 stays negative either way.
- On the payoff's "now" curve, an early move hurts the straddle more than the strangle.

## Still open

1. Say what "×0.68" is on the card (B contracts per A contract).
2. Compare tab: a single-position mode (B off), as the Compounding tab has.
3. Skew at the chosen strikes (put IV − call IV).
4. Random paths: the A and B end labels overlap when the medians are close. The sweep's ring can sit on the "ITM leg"
   label.
5. Credit kept is a reading: the Weeks view's engine does not take a preset as its weekly outcome. A "use this preset
   in Weeks" switch would need an engine hook.
6. The empirical presets wait for daily closes from the data feed (`D.u[id].closes`); paste works for now.
7. The stored key and tab value "yr" in saved views and links (invisible) stay until there is a format migration.
8. Step 3 to 5 (options-object signatures, panels as classes, TypeScript), and the R3-1 to R3-8 cleanups above.
