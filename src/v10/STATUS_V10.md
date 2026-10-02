# v10 status (where the work stopped)

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

- **Step 2, part II:**
  - recovery dynamics with the three growth rates (`computeRecovery`, Gauss–Legendre log-mean, the honesty line, Hit on
    both bases, `rdG "ev"` → Average);
  - the "% of margin" reading unit;
  - the EV explainer;
  - the export alignment (shared formatters, `computeRecovery`, no test hooks, Result).
  - See PLAN_V10.md §2–§5 and §7. The numeric oracles are in the v9 scratch `crit10/check_r2.js`, `jensen_r2.js` and
    `quad_r2.js`.
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

## Still open

1. Part II, the most useful next step for trading: honest recovery rates (if no such hit / average / best case), the EV
   explainer (credit, expected settlement at the period vol, EV), and % of margin as a reading unit (PLAN_V10 §2–§4).
   The recovery panel today reads "Hit −71% at 34.86 · of NAV when it lands", which is hard to read and needs that
   rework.
2. Export alignment (PLAN_V10 §5).
3. Say what "×0.68" is on the card (B contracts per A contract).
4. Compare tab: a single-position mode (B off), as the Compounding tab has.
5. Skew at the chosen strikes (put IV − call IV).
6. Random paths: the A and B end labels overlap when the medians are close. The sweep's ring can sit on the "ITM leg"
   label.
