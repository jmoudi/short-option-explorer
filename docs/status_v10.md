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
  - 2c: the Compounding tab reads and writes the same number through `YR.init({port: {periodVol}})`. Its own rv is no longer
    stored; the migration precedence follows the plan. The Monte Carlo goes stale on a change. The vol range is 0–300.
    The "B differs in vol" override belongs to a run, and a swap flips it.
  - Checks: three verify rounds. Rounds 1 and 2 found 18 and 5 issues, all fixed. Round 3's review found no blocker or
    major issue. Build OK with tsc 0, and 151 tests pass. The harness against step 1 shows only intended differences,
    with 0 console errors. The 14 B-only period-vol scenarios pass.

## Open (minor, from the round-3 review, not yet fixed)

- R3-1: `StandalonePeriodVol.refs` in yr_ui.js has no `this` and re-reads the realized refs. It should read them through
  INST, the one reader.
- R3-2: add `HitBasis` to test/load.js's export list.
- R3-3: one `isFlooredVol` guard and one `C.listVolLabels(ids)` helper, in place of the copies at about 8 call sites.
- R3-4: use the GrowthRate / HitBasis / RunSlot enums on the lines part 2 touched (ui_views.js ~1151–1160, yr_ui.js ~446).
- R3-5: named objects instead of positional tuples in the vol reference rows (yr_ui.js ~295), and `findRef({id, source})`.
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
  yr_ui date formatting through the calendar, CMP `apply` closure removal, and `PlaceLeg` model work moving to STATE/CMP.
- **Step 4:** panels as classes.
- **Step 5:** TypeScript.

## How to check

- `python3 build.py` builds and runs the checks, including the tsc gate.
- `node --test test/*.test.js` runs the tests.
- `node tools/reg/pixdiff.js --a <ref.html> --b <new.html> [--map-b tools/reg/maps/v10_to_v9.js] [--fast]` runs the
  harness (in the working folder it lives in scratch/reg; see its README).
