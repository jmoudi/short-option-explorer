# PLAN_V10 r2: second critique round

I re-ran the figures that matter in node. The scripts are in `/tmp/claude-0/-home-user-voltagent-chat/eab0dce9-3582-5b50-8fc1-369c85131c50/scratchpad/v9/scratch/crit10/`:
- `check_r2.js`: the reference case;
- `grid_r2.js`: how much mass falls off the distribution grid;
- `quad_r2.js`: quadrature accuracy for the default rate;
- `jensen_r2.js`: the compounded rate against the average;
- `round_r2.js`: rounding in the explainer;
- `tscheck/`: a `tsc --checkJs` run over the current bundle.

The reference case reproduces:

| Figure | Value |
|---|---|
| Hit L | 32.08% of margin |
| q | 5.01% a cycle |
| Best case | 25.60% → 1.70 cycles |
| If no such hit | 3.711% → 10.6 cycles |
| Average | 2.01% → 19.4 cycles |
| Chance of no such hit in 11 cycles | (1−q)^11 = 56.8% |
| Axis ⓘ | +29% / −22%; beyond 1.5σ at 117% vol: 4.4% up, 7.1% down |

## Task 1: is the revision consistent with what was accepted?

**1. Blocking: the default rate can be below the average, and once L ≥ the worst loss it does not equal the average.**
- **Problem:** §2 says the rate is "never below the average". §7 tests "≥ average for every L and = average once L ≥ the worst loss". Both hold only for the plain conditional mean. The plan adopted the compounded mean exp(E[ln(1+P) | P > −L]) − 1. My round-1 point 9 said "= average" before point 6 changed the definition, and I did not carry that through. From `jensen_r2.js`:

  | Position | L | If no such hit (compounded) | Plain conditional | Average |
  |---|---|---|---|---|
  | Straddle | 2σ | 1.49% | 3.01% | 2.01% |
  | Straddle | 2.5σ | 0.33% | 2.32% | 2.01% |
  | 20Δ condor, 5Δ wings | 90% (worst is −76%, so q = 0) | **−3.12%** (= exp(E ln(1+P)) − 1) | 1.19% | 1.19% |

  With the plan's text, the condor case would print "rate = average" while a correct implementation prints "never".
- **Change:**
  - §2 should say the rate "falls as L grows. At q = 0 it is the compounded rate exp(E[ln(1+P)]) − 1, which is below the average and can be negative at full margin."
  - Edge text: "this position cannot lose 90% of margin in one cycle (worst −76%); compounded at full margin it shrinks 3.1% a cycle, so it never recovers."
  - An ⓘ line explaining why "if no such hit" can read below "average": losses inside the condition still compound.
  - §7 tests: the rate is non-increasing in L; it equals exp(E ln(1+P)) − 1 once L ≥ the worst loss; the plain conditional mean equals the average there.
  - Guard: L ≥ 1 returns "wiped out" before any log is taken. The straddle's worst case is −1159% of margin.

**2. Important: the default rate has no closed form.**
- **Problem:** §2 says "E and q are computed in closed form". E[P], q and the best case can be. E[ln(1+P) | P > −L] cannot: it is the integral of the log of a linear function of S against a lognormal. An implementer would go looking for a formula that does not exist.
- **Change:**
  - Compute the log-mean by Gauss–Legendre quadrature in ln S.
  - Split the segments at the strikes and at the roots of P = −L, over ±10 period-vol σ√T, with 24 nodes per segment. That is about 120 payoff evaluations per rate.
  - Accuracy: the reference straddle matches a 400k-point midpoint sum to 2e-7; the winged strangle to 2.5e-6, and there the midpoint sum is the less accurate of the two, at the floor.
  - Test: 24 nodes vs 48 nodes agree to 1e-9 (not "closed form vs quadrature to 1e-6").
  - Memoize on (built key, vol, L), because the curve needs about 91 points × 2 sides.

**3. Important: §1 and §4 disagree on the explainer under implied odds.**
- **Problem:** §1 lists the explainer among readings that never follow the odds switch. §4 gives it an implied-odds form. Opened from the overview's EV column (always period vol) under implied odds, it would say "EV = fill vs mid".
- **Change:**
  - The explainer always shows the period-vol block.
  - Only when it is opened from the comparison table's EV row with odds = implied, add one first line: "This row uses implied odds: EV = fill vs mid = $0 at mid (−$x at natural). At 117% vol:".
  - Every EV label names its odds ("EV at 117% vol", "EV · implied"), because the table row and the overview column will now differ under implied odds.
  - The grid's "× odds" tip names the odds too.

**4. Important: the odds strips and grid odds still sit on a grid ±7 implied σ wide, while q is exact.**
- **Problem:** with odds = period vol, part of the mass falls off the grid (`grid_r2.js`):

  | Expiry | 250% | 300% |
  |---|---|---|
  | KORU 16 Oct | 0.07% | 0.55% |
  | RAM 19 Mar ’27 | 0.78% | 4.41% |

  The stored range is now 0–300, so these values are reachable, and the strips and profit odds would disagree with the explainer's q.

  Also, the stale-memo bug is still live: in my run, `DIST.make(E,S,"hv",3.0,1)` after a call at HV30 returned the cached HV30 object.
- **Change:**
  - In period-vol mode, set the grid half-width to 7·max(atm, vol)·√T.
  - In that mode, make `cdfT`/`cdfK` use the closed-form N(·), as `cdfAt` and `quantAt` already do. Profit odds, strips and q then come from one formula.
  - Include the vol in the memo key only in period-vol mode. Otherwise every vol edit would rebuild the Breeden–Litzenberger grid for the implied odds.
  - Drop `spot` from `DIST.make({...})`: E carries S, and E.version already keys the spot override, so a different spot passed in would hit a wrong memo entry.

**5. Important: `computeRecovery({ built, dist, prefs })` (§8.2) contradicts §2.**
- **Problem:** recovery needs the vol, not a grid. `C.d` is the dist that follows the odds switch, so a parameter called "dist" invites passing the implied one. §1 also says every reader goes "through DIST.make", which is not true of recovery.
- **Change:**
  - Signature: `computeRecovery({ built, vol, hit, capital, growth, typedRate })`, with vol taken from `C.volOf(id)`.
  - It returns data (L, q, the three rates, cycles, the honesty figure). The panel and the export format it with one shared formatter.
  - §1 should say: EV goes through `POS.stats` with the period-vol dist; recovery reads the vol directly.

**6. Important: the Compounding swap in vol mode cannot do what §1 says.**
- **Problem:** today `#y-swap` exchanges rv↔rvB so each run keeps its vol. Suppose A reads the shared number, only B can carry an override, and the shared number must not change. After a swap, the new A (old B) needs the override, and there is nowhere to hold it. My round-1 point 14 asked for exactly this and was incoherent.
- **Change:**
  - The override belongs to a run, not to B: `ys.sc.volOverride = { run: "B", KORU: 150 }`.
  - A swap in vol mode flips `run`.
  - Test: after a swap in vol mode, the comparer's vol is unchanged and each run keeps its vol.

**7. Minor: the explainer example does not match what the screen prints.**
- **Problem:** the credit is 432.4999…/contract. The summary's `usd()` prints $432, the settlement is −398.48 and EV is +34.02. The plan prints +$433 / −$399.
- **Change:**
  - Print the credit with the summary's formatter.
  - Make the settlement the plug (printed EV − printed credit).
  - Update the example to +$432 / −$398 / +$34.

**8. Minor: small items dropped or unspecified.**
- **Problem:**
  - The round-1 ⓘ sentence "one number per ticker, used for every expiry; annualized like IV (calendar days)" was dropped. It is true in both tabs: `yr_engine` uses days/365 and the Monte Carlo uses dt/365.
  - The plan does not say what the honesty line shows when the basis is Best case, Average or Typed.
  - `C.volOf` labels are inconsistent: "vol 117% (HV30)" vs "124% (ATM 16 Oct)".
- **Change:**
  - Add the ⓘ sentence to §1.
  - Show the honesty line only under "If no such hit".
  - Label every source as "vol N% (source)".

## Task 2: §8 against CODE_DIRECTIVES.md

**9. Important: (a) the event loop. The outline is faithful; the timing and four missing pieces need fixing.**
- **Problem:**
  - **Timing.** A queue "flushed once per frame" that also applies commands would break code that reads state right after a change, and a command's error would arrive a frame late. Code that reads state right after a change today: `setUnit`/`setRange` read `SUM9.C`; the toast actions; `codeLoaded`.
  - **Missing CommandRegistry.** The directive names "CommandRegistry (lookup)" next to CommandExecutor; without it, the executor turns into one large switch.
  - **No envelope for toasts.** CMP events with undo/relink actions are neither state changes nor faults.
  - **Helpers that must go.** `emit()` in ui9_views (a toast dispatcher named emit) and `cmpEvents` are exactly the helpers the directive bans.
  - **Order.** The dock must render before the charts measure their width (`body.dock-off`).
- **Change:** apply commands synchronously and coalesce only the render notification per frame.

  ```js
  const Command = { SetA: "cmp.setA", SetB: "cmp.setB", Link, Unlink, Detach, Swap, RelinkAll, SetFrom, ApplyFix,
    ApplyAction, SetAssumption, SetPeriodVol, SetPref, SetMoveUnit, AddPin, RemovePin, ClearPins, ShowTab, LoadView, Reset };
  // envelopes: flat, at most 3 levels deep
  { type: Command.SetB, path: "values.put", value: 20, source: "dock" }                        // command
  { type: "state.changed", at, state, context, notices, faults, causes: [Command.SetB] }       // once per frame
  { type: "notice", at, notice: { text, actions: [/* commands */] } }                          // toasts; buttons emit commands
  { type: "fault", at, fault: { code, severity, text, handling, where } }

  class Bus {               // listener table and re-entrancy queue shared by every module
    listeners = new Map(); queue = []; isDispatching = false;
    subscribe(type, listener) /* returns unsubscribe */; emit(envelope) /* synchronous; queued while dispatching; a throwing listener becomes one fault */ }
  class CommandExecutor {   // the only writer of the store: looks up the handler, runs it with context, reports
    constructor({ bus, store, handlers /* new Registry(): Command -> ({state, command}) -> Result<{state, notices, faults}> */, frames }) }
  class FrameLoop {         // any number of changes -> one state.changed per animation frame; context built once
    constructor({ bus, store, buildContext, requestFrame, cancelFrame }) /* requestFrame injected so node tests drive frames */
    pending = null; frameId = 0; mark(change) /* merge; notices deduped by text */; flush() }
  ```

  How the rest plugs in:
  - **Controls.** Binders take `{ read, command }` and call `bus.emit` themselves. Their sync functions (today's SYNC/REG/VSYNC arrays) subscribe to `state.changed`. They keep skipping the focused control, so slider drags work as today: one command per input event, applied at once, one render per frame.
  - **Rendering until panels become classes.** `main` subscribes one ordered render (summary → dock → views → title), plus a separate persistence subscriber. Persistence stops writing `S9.view.theme` (appSave does that today); theme becomes a pref changed by a command.
  - **Hidden tab.** `FrameLoop` builds the context only for the visible tab; `ShowTab` triggers a flush.
  - **Compounding.** It stays off the bus in v10 (see point 19). When it joins later, its subscriber calls its own `schedule()` (140 ms after slider input, 30 ms after a button) and never computes inside the frame flush: its compute is a full engine run for A and B. Its chunked sweep and Monte Carlo jobs keep their own timers.

**10. Important: (b) Result and Fault, and where each one earns its place.**
- **Pays:**
  - Reading a view code: today it throws and is caught at 3 sites (appBoot, ⋯ Load, hashchange). Replace with `readViewCode(text) → Result<{state, tab, faults}>`; error codes not_a_code / undecodable / unknown_version; migration notes as faults.
  - Command handlers, through the one executor catch: replaces cmpDo's try/catch, and the views' `change()`, which has none.
  - The storage, clipboard and download adapters: `writeBlob` swallows errors today.
  - The export, which can report "Compounding has no results yet".
  - `SetPeriodVol`: ok, with a fault when the value is floored to 1% or clamped to 300%.
- **Ceremony:**
  - Maths kernels, `POS.payoff/val/stats`, `DIST`: hot loops, where NaN and `na` already carry failure.
  - `POS.build`: §8.1 proposes a Result. Keep the Built as the value, with `na`, `naReason` and flags→faults as data. A Result adds `.value` at about 100 call sites (`C.A.value.legs`).
  - `INST.make` inside the model: its inputs are sanitized ids, so the fault belongs at the sanitizer boundary.
  - `STATE.change`: return `{state, notices, faults}` plainly; only the executor wraps.
- **Fault shape:**
  - Add `handling`. The directive says a fault records "how it got handled".
  - Split position faults (WIDENED, CHAIN_END…: data on the memoized Built, shown in the warn row, never emitted, or they would fire every frame) from event faults (normaliser, migration, CONVERT_RESET, floors, storage, render exceptions the bus catches), which go on the bus once.

**11. Important: (c) which panels really hold state.**
- **Problem:** the plan's list misses the most stateful piece, `DOCK9`, which holds root, lastKey, the last context and the slider state during drags.
- **Change:** classes for:

  | Class | State it holds today |
  |---|---|
  | `PositionDock` | root, lastKey, last context, slider state |
  | `SummaryStrip` | `SUM9.C`, `PILLS`, the ResizeObserver |
  | `NoticeToast` | notices and timers, today in 3 places: ui_common8 `toast`, `SUM9.toastEvents`, the `VIEWS.emit` fallback |
  | `OverviewPanel` | `OV` cells |
  | `GridPanel` | `GRID` cells, data, hover, csv |
  | `PayoffPanel` | hover, pin on click |
  | `SweepPanel` | hover data |
  | `SmilePanel` | the leg popover |
  | `RecoveryPanel` | curve hover, narrow mode |
  | `ExportMenu` | its host callbacks |

  Infrastructure classes: `Bus`, `CommandExecutor`, `FrameLoop`, a generic `Store`, `ViewPersistence` (lastBlob/lastCode), and `LruCache`, replacing the ad-hoc object from `INST.cache`.

  Rules:
  - Joint, pins and notes stay render functions.
  - One abstract `Panel` (host, bus, isStale, subscribes in its constructor), one level deep.
  - Helpers that do not use `this` stay module functions.
  - Classes live inside their file's namespace (`VIEWS.PayoffPanel`), so build9's one-name-per-file check holds.
  - State the exception: Instrument, Expiry, Built and Stats stay frozen plain records described with JSDoc typedefs. They are memoized and copied with `Object.assign`; a class would add no behaviour.
  - The Compounding closure is out of scope.

**12. Important: (d) Config vs Preferences.**
- **Problem:**
  - `PreferencesRegistry` breaks "`new Registry()`, not `XyzRegistry`".
  - Persisting prefs separately would split the view code, which restores prefs today.
  - `S9.scen.vol.KORU.v` is 4 levels deep.
- **Change:**
  - One in-memory `Store` holds one tree: `comparison` (cmp), `assumptions` (scen), `prefs` (view), and `periodVol` at the top level (`state.periodVol.KORU = { pct, source, expiry? }`, 3 levels deep).
  - The view code carries the whole tree.
  - `Registry` is used for the command lookup now, and for saved comparisons later.
- **Enums:** these give names to the existing stored values; nothing written to storage changes, except `rdG`.
  - Placement and legs: `Basis`, `Role`, `LegKey`, `Structure`, `Kind`, `LegsMode`, `Fill`, `ExpMap`, `MarkMode`.
  - Comparison: `SizingRule`, `Aspect`, `CmpEventType`, `DiffCode`, `FaultCode`, `FaultSeverity`.
  - Assumptions: `MoveUnit` (sig/pct/pts), `ReadingUnit` (pct/usd/cr/margin; the plan's single `Unit` would mix this with `MoveUnit`), `WorstLossRange`, `Odds` (`Implied: "rn"`, `PeriodVol: "hv"`), `Align`.
  - Views: `OverviewMetric`, `GridView`, `GridValue`, `GridTab`, `ContourType`, `ChartScale`, `ChartRange`, `SweepLeg`.
  - Recovery: `HitBasis`, `HitSide`, `RecoveryBase`, `Capital`, `GrowthRate`.
  - Other: `VolSource`, `Theme`, `Tab`, `Side`, `Command`, `ExportSection`.
- **CONFIG per module:**

  | Module | CONFIG contents |
  |---|---|
  | dist | grid points 1000; span 7σ; σ√T floor 0.05 |
  | inst | LRU size 2000; smile floor 0.01; version rounding 6 dp / 3 dp; increment window ±20%; no-op tolerance 1e-9 |
  | rule | today's TOL, CE_TOL, BOUNDS, WMIN/WMAX/WDEF/DEF/STEP |
  | pos | ε 1e-9·S; vol floor 0.01; τ cut-off; early-assignment threshold; margin base 0.20 |
  | cmp/ctx | default comparison; h clamp [0.05, 20] |
  | state | default assumptions and prefs; range caps; vol range 0–300 with a 1% floor |
  | recovery | amber below 50%; tie tolerance 1e-9; quadrature nodes; 104-week year switch |
  | summary | fit stages; three different toast durations (4000 / 2000 / 3800 ms), to unify |
  | views | sweep points 91; height budgets; resize threshold 2 px |
  | export | sections; file name pattern |
  | app | storage keys; resize debounce 120 ms |

**13. Minor: (e) current names that break the directives, with replacements.**
- **`appX` prefix (banned):** `APP`, `appSafe`, `appSave`, `appRender`, `appBoot`, `appInit` → `page`, `runGuarded`, `saveView`, `renderActiveTab`, `readBootState`, `main`.
- **Functions whose only job is to call another (banned):** `cmpRefresh`, `renderViews`, `wireViews`, `toMarkdownCompare`/`toMarkdownCompounding` (top-level copies of the namespace members), `exportWire`.
- **Event-dispatch helpers:** `emit` (views) and `cmpEvents` become bus emits.
- **Wiring to replace:** `cmpChange`/`cmpDo` become commands. `renderAll` becomes the ordered subscriber. `SYNC`, `ASYNC` (it is not async), `REG`, `VSYNC` and `HOOK` become subscriptions.
- **Bare nouns as function names:**
  - INST: `base`, `atmAt`, `dteOf`, `b76`…
  - POS: `val`, `payoff`, `stats`, `legsAt`, `worstIn`, `canon`.
  - RULE: `valueAt`, `range`, `ends`, `achieved`, `eligible`.
  - CMP: `identical` (→ `isIdentical`), `currentB`, `ownValue`.
  - STATE: `code`, `blob`.
  - Context: `ctx9` (→ `buildContext`), `statsHV` (named after what v10 removes).
  - UI: `glyph`, `marks`, `line1..3`, `pillsHtml`, `recRun`…
  - Rename these in step 3, together with their callers.
- **Others:**
  - The export's `sec*` and `ySec*` are "Section" builders; rename them to verbs (`writeResultsMarkdown`).
  - INST, "the instrument registry", also holds Black-76 maths, caches and `deepFreeze`. Split these out (step 3).
  - `VIEWS.LAST` and `YR._state/_res/_sres/_mc` are test hooks in source. The export depends on them and writes into `YR._state().view`; stop that in step 1.
  - One-letter globals `C`, `S9` → `context`, `state`.

**14. Important: (f) build the bus before the v10 features.**
- **Problem:**
  - v10 adds about ten controls and a write from either tab (the period vol). Built on `cmpChange`, they would be rewritten in step 2.
  - A `RecoveryPanel` class in step 1 cannot subscribe to anything yet.
  - A pixel-identical check is cleanest before v10 changes the screens.
- **Change:** a new order.
  1. Bus, executor, FrameLoop, Result, Fault, Command enum and the adapters (storage, clipboard, download), plus the `appX` renames. One ordered subscriber; screens identical. About 70 call sites (dock 13, summary 13, views about 45 including binders); mechanical work.
  2. The v10 features, written on commands.
  3. Model signatures and faults.
  4. Panels as classes, each subscribing itself (this removes the ordered subscriber; a test asserts the dock renders before the charts).
  5. TypeScript.

**15. Important: (g) JS + JSDoc now, with a type check as a developer gate. Not TypeScript yet.**
- **Reasons specific to this page:**
  - The build is Python string concatenation with regex source rules. Its top-level-name regex would not see TS declarations.
  - Tests load raw files into a vm.
  - The artifact must stay one file.
  - Steps 3–4 move every module boundary, so types written now would be rewritten.
- **But type-check now, because step 3 changes every signature:**
  - `tsc` 6.0.2 is installed here. `tsc --noEmit --allowJs --checkJs` over today's bundle gives 48 errors non-strict (30 are `EventTarget.closest`) and about 3,300 strict (mostly implicit any).
  - Gate non-strict now; turn on strict per file as each file is converted.
  - Put the type namespaces (Lab.Position, Lab.Built, LiteralUnion) in one `.d.ts` that is never bundled.
- **Later:** Node 22's `module.stripTypeScriptTypes` exists here and can strip erasable TS without esbuild, if enums are written as const objects (the directive already prefers `as const`).
- **Temporal:** node 22.22 here has no `Temporal`, and the tests run the model in node. Put date handling (DTE, `recDate`, export dates) behind a small `calendar` adapter, so moving to Temporal later is a one-file change. State this deviation from the directive in §8.1.

## Task 3: what is still missing to start step 1 without questions

**16. Blocking: where the shared period vol lives, and how the Compounding tab reaches it.**
- **Problem:**
  - build9 requires the yr files to be "bundled unchanged" and rejects `S9`/`STATE` in them.
  - `ys.sc.rv` is read in about 10 places.
  - `DEF()` and `setState` re-create `rv`.
  - `mcKey()` hashes `ys.sc`, so a vol change made from the comparer would not mark the Monte Carlo result stale.
  - "Reset Compare" (`STATE.defaults()`) would silently reset the Compounding moves.
  - The Compounding slider stops at 250.
- **Change:**
  - Store it at `state.periodVol` (point 12).
  - Inject a port: `YR.init({ periodVol: { read(ticker), write(ticker, pct) } })`, where `write` emits `SetPeriodVol`.
  - `yr_ui` stops storing `sc.rv`: `getState` omits it, and `setState` passes it to migration.
  - `runFor` and `mcKey` include the shared value.
  - Only "Reset both tabs" resets the vol; a single-tab reset says "period vol kept".
  - The Compounding range becomes 0–300.
  - Update build9's header and checks accordingly.

**17. Blocking: "% of own margin" for B breaks the single-scale unit contract.**
- **Problem:**
  - `fU`/`unitName` rescale one number expressed as a fraction of A's notional.
  - `vB`/`pB` already include ×h.
  - The D tab is A − h·B.
  - Per-side own margin would need a side argument on every formatted B value, make the sizing control a no-op in that unit, and redefine D only in that unit.
  - My round-1 point 12 missed this.
- **Change:**
  - Make "% of margin" a rescale by A's margin at entry (v·A.S/M_A), like the other three A-based units.
  - Under "Equal margin" sizing, h = (M_A/S_A)/(M_B/S_B), so B's line equals P_B/M_B exactly and D equals the difference in return on own margin. Say so in the ⓘ, with a one-click "size by margin".
  - The recovery panel keeps each side on its own capital, as today.

**18. Important: versions and stored values.**
- **Problem:** the plan does not decide:
  - the view-code prefix (`#v10.`?), the blob key, or the output file name;
  - how `rdG: "ev"` migrates;
  - where the export section prefs go.
- **Change:**
  - Use `#v10.` and `rk-lab-v10`; read v9 once and never write it, as for v8.
  - Keep `scen.dist` stored as "rn"/"hv" under the new enum names.
  - Map `rdG "ev"` to Average with a note, so old views keep their headline.
  - `hvk` migrates by the agreed precedence.
  - Move the export sections into `prefs` now, since state9 is touched in step 1.

**19. Important: the export alignment is wider than recovery.**
- **Problem:** `ui9_export.js` copies about 15 formatters, `recRun`/`recCycles`/`recTime`/`recDate`/`growthTxt`, and `pairWorst`/`pairPop`, which `VIEWS` already exports. Its "HV30 × hvk" rows will drift from the screen.
- **Change:**
  - One shared format namespace used by the summary, the views and the export.
  - The export calls `computeRecovery` and the VIEWS helpers.
  - Extend the export-vs-panel test to the results-table numbers.

**20. Minor: build and test plumbing.**
- **Problem:** new top-level names (Result, Bus, the enums) would fail build9's name checks and are missing from the test loader, and the new source rules exist in neither place.
- **Change:**
  - Put Result, Fault, Bus, Store and the enums in a new first model-layer file. Add its names to build9's `ALLOWED` and to `test/load.js`'s name list.
  - Add the `.hv` and "HV30" source rules to both build9 `RULES` and t01, `yr_ui.js` included.

## Summary

The revision carries every round-1 point through, but three of my own round-1 points were wrong and the plan inherited them:
- the "if no such hit" rate can sit below the average and goes negative at full margin (condor: −3.1% vs +1.2%);
- the Compounding swap in vol mode is incoherent with a B-only override;
- "% of own margin" for B does not fit the one-scale unit contract.

Also, §1 and §4 disagree on the explainer under implied odds; the distribution grid loses up to 4.4% of the mass at 300% vol; and the default rate needs quadrature, not a closed form.

§8 reads the directives faithfully in outline. It needs:
- commands applied synchronously, with one render per frame;
- a command registry and a notice envelope;
- faults split into position data and one-time events;
- generic `Registry`/`Store` instead of `PreferencesRegistry`;
- the dock added to the class list.

Build the bus first, then v10. Stay on JS with JSDoc and a non-strict `tsc --checkJs` gate (48 errors today); TypeScript and Temporal come later, behind adapters.

The shared vol needs an owner, a port into `yr_ui`, staleness keys and reset rules before step 1 can start.

NOT READY: three blocking text fixes are needed first (the compounded-rate claims and §7 tests, where the shared vol lives and how the Compounding tab reaches it, and "% of margin" as a rescale by A's margin), and the step order must be decided.