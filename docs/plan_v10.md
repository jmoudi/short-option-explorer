# Plan v10 (final after two critique rounds): period vol as one source of truth, honest recovery dynamics, markdown export, code direction

Status: FINAL DRAFT, awaiting the user's decisions in §0. No model, recovery or wiring code has been changed. The markdown export is implemented and published (§5).

Code base: `SP/v9/` (SP = `/tmp/claude-0/-home-user-voltagent-chat/eab0dce9-3582-5b50-8fc1-369c85131c50/scratchpad`). `CORE_API.md` documents the layers; `CODE_DIRECTIVES.md` is the coding standard; the two critique rounds are `scratch/crit10/critique_r1.md` and `critique_r2.md` with their check scripts. Reference case throughout: KORU 16 Oct 21 straddle at mid, 15 days, HV30 117.3%, ATM 123.9%, margin $16.89/sh, credit $4.325/sh.

---

## 0. Decisions for the user

1. **"Event loop" = a command bus with one render per frame** (§8.1): controls emit commands, one executor applies them synchronously, a frame loop coalesces the render notification. Confirm or correct.
2. **Order: build the bus first, then the v10 features on it** (§8.2). The bus step is mechanical (about 70 call sites) and must leave the screens pixel-identical. Alternative: features first, rewired later (written twice).
3. **Language: JS with JSDoc and a `tsc --checkJs` gate now; TypeScript later** behind the adapters (§8.3). Alternative: TypeScript now, which needs a new build step before anything else.
4. **Default growth rate for recovery: "if no such hit"** (compounded, with the honesty line and its amber threshold), §2. Alternatives: Average or Best case as the default.
5. **"% of margin" reading unit = everything rescaled by A's margin at entry**, with "Equal margin" sizing making B's line its own return on margin (§3). The alternative, each side on its own margin, breaks the page's one-scale contract and is kept to the recovery panel only.

Everything else below is settled unless you object.

---

## 1. Period vol: one number per ticker, read by every EV-based reading

**What it is.** The assumed vol of the underlying's moves over the period, per ticker, "long-termish for these purposes". It never touches the IV of any option leg; legs stay at their quotes.

**Where it lives.** At the top of the state, three levels deep, owned by neither tab:

```js
state.periodVol = { KORU: { pct: 100, source: "set" } }   // absent = HV30; source ∈ VolSource {Hv30, Atm, Set}; Atm stores the expiry it was taken from
context.volOf(id) -> { pct, source, label }                // the only accessor; label always "vol 117% (HV30)" / "vol 100% (set)" / "vol 124% (ATM 16 Oct)"
DIST.make({ expiry, odds, vol })                            // no spot argument (the expiry carries it); the hvk multiplier is gone
```

Why per ticker, not per A/B slot and not in `Instrument.version`: slots belong to sides; the overview builds its 16 cells on bare `{id}` slots; "Set as A/B" and a ticker round-trip would drop a per-slot number; and `same`, `isIdentical`, `sameTrade`, `smileGroups` and every pricing memo key include the instrument version, none of which may change when an odds assumption changes.

**Readers.**
- EV-based readings always use the period vol, whatever the odds switch says: recovery growth, the sweep's EV line, the overview's EV column, the EV explainer. EV goes through `POS.stats` with the period-vol distribution; recovery reads the vol directly (§2). Every EV label names its odds: "EV at 117% vol", "EV · implied".
- The odds switch (`Odds: implied | period vol`) governs profit odds, the odds strips, the grid's column odds and the comparison table's EV row (under implied odds that row is fill vs mid, 0 at mid, and says so).
- The Compounding tab reads the same number through an injected port: `YR.init({ periodVol: { read(ticker), write(ticker, pct) } })`, where `write` emits `SetPeriodVol`. `yr_ui` stops storing `sc.rv` (`getState` omits it, `setState` hands old values to migration); `runFor` and `mcKey` include the shared value so a change made on the comparer marks the Monte Carlo stale; the Compounding slider range becomes 0–300. A "B differs in vol" override belongs to a run, `ys.sc.volOverride = { run: "B", KORU: 150 }`, and a swap flips `run`, so the shared number never changes on a swap. The Compounding IV path scales its own flat pricing IV, and under "keep the gap" the moves follow from the shared starting value. Its separate pricing IV stays tab-local.
- Stress and Random years take the ticker's vol.

**Not readers:** leg prices and IVs, the implied odds model (the smile), marks of open legs before expiry, and the smile fit's flat fallback in `inst9.js:142`, which stays on listed HV30 because it is leg pricing. Source rules in `build9` and `t01`, `yr_ui.js` included: no `.hv` read outside `inst9` and `volOf`; no "HV30" literal outside one label helper.

**Distribution in period-vol mode.** Grid half-width 7·max(ATM, vol)·√T (at 300% vol the old ±7 implied σ grid lost up to 4.4% of the mass on RAM Mar); `cdfT`/`cdfK` use the closed-form normal, so profit odds, strips and the recovery q come from one formula; the memo key includes the vol in this mode only (the implied grid must not rebuild on a vol edit). Stale-memo test: a second `make` at another vol must miss.

**Range, rounding, resets.** Stored 0–300 (0 means "exactly on the path" in Compounding); the comparer floors at 1% with a fault. The source is stored, so an edit that leaves the value at HV30 to display precision does not flip it to "set". Only "Reset both tabs" resets the vol; a single-tab reset says "period vol kept".

**Presets** in the slot popover, renamed "spot / IV / period vol ▾": HV30, ATM at A's horizon (stored when chosen, "vol 124% (ATM 16 Oct)"), custom N% (number box plus slider with reference ticks; the 1-year and 5-year realized ticks exist for KORU only). ⓘ: "one number per ticker, used for every expiry; annualized like IV (calendar days)".

**Where it shows.** The fixed summary's small line: "vol 117% (HV30) vs implied 124%" per card; a hand-set value gets ✎.

**σ stays implied everywhere** (the move range, worst-loss range and sizing are stored in σ; the placement basis σ is implied; a hit's size must not change when only its likelihood changes). Where σ meets odds, both are printed, e.g. the axis ⓘ: "1σ = +29% / −22% (implied 124%); at 117% vol, beyond 1.5σ: 4.4% up, 7.1% down". Later option: "kσ of period vol" as a third hit basis.

**Migration.** `#v10.` codes and the `rk-lab-v10` key; v9 read once, never written. `hvk` → if an old code carries a Compounding `rv` that differs from rounded HV30, take it, else `hv × hvk`; one note per ticker. `scen.dist` keeps its stored values under the enum names. The export section preferences move into `prefs`.

---

## 2. Recovery dynamics: three growth rates, "if no such hit" as the default

Per cycle, P = P&L per unit of capital at expiry (capital = each side's own Reg T margin at entry by default, or notional), under the lognormal at the ticker's period vol; L = the hit as a fraction of capital. `computeRecovery({ built, vol, hit, capital, growth, typedRate })` returns data (L, q, the three rates, cycles, the honesty figure); the panel and the export format it with one shared formatter.

| Rate | Definition | Reference case | Reads as |
|---|---|---|---|
| Best case | max payoff / capital (= the credit for straddles and strangles; less for guts or ITM legs; ≤ 0 for a net debit, printed "best case −x% (net debit)") | 25.6% → 1.7 cycles | nothing ever goes wrong |
| **If no such hit (default)** | exp(E[ln(1+P) \| P > −L]) − 1: the compounded average given no loss as large as the hit | 3.7% → 10.6 cycles | the user's definition, with the losses inside the condition still compounding |
| Average | E[P], plain | 2.0% → 19.4 cycles | expected NAV; not a compounding rate at full margin |

- Conditioning is on the **P&L**, not the move: right for capped and asymmetric positions and fixed-% hits alike. A tie at a flat floor (L = worst loss) counts as a hit.
- **The default rate falls as L grows and can sit below the average**, because losses inside the condition still compound: straddle at 2σ 1.5% vs 2.0% average; at 2.5σ 0.3%. At q = 0 (L at or beyond the worst loss) it is exp(E[ln(1+P)]) − 1, which at full margin can be negative (20Δ condor with 5Δ wings, L = 90%: −3.1% a cycle, "never"). The panel then says "this position cannot lose 90% of margin in one cycle (worst −76%); compounded at full margin it shrinks 3.1% a cycle, so it never recovers". An ⓘ explains why "if no such hit" can read below "average". L ≥ 1 returns "wiped out" before any log is taken (the straddle's worst case is −1159% of margin); L ≤ 0 → "none needed".
- **Computation.** E[P], q and the best case in closed form (piecewise-linear payoff × lognormal). The log-mean by Gauss–Legendre quadrature in ln S, segments split at the strikes and at the roots of P = −L, over ±10 σ√T of the period vol, 24 nodes per segment (about 120 payoff evaluations per rate; the reference straddle matches a 400k-point midpoint sum to 2e-7). Memoized on (built key, vol, L) because the curve needs about 91 × 2 points.
- **Honesty line**, shown only under "If no such hit": q = P(P ≤ −L) per cycle and the chance that the condition holds for the whole recovery, (1−q)^N: "chance of no such hit in the 11 cycles: 57% (5.0% a cycle)". Amber below 50%.
- **Hit cell on both bases at chart precision:** "−32.1% of margin · −25.7% of notional". The reference hit is a 1.5σ move on the worse (up) side, +45.8%; the down side at 1.5σ costs only 13.1%; q counts both sides at the same loss (4.4% up beyond +45.8%, 0.6% down beyond about −47%).
- The hit is measured **at expiry**: the growth rate comes from the expiry distribution, the Hit then equals the payoff chart, and a mark at day d would need the IV-shock inputs. Later: "gap on day d, closed at the mark".
- Basis menu "Growth per cycle": **If no such hit | Average | Best case | Typed** (old `rdG: "ev"` maps to Average with a note, so old views keep their headline). The curve draws only the selected rate, recomputed per hit size; the other rates go to the tooltip and a small line "best case 1.7 · average 19.4 cycles". No "range" wording.
- The hit's σ is each position's own implied σ to its own expiry; the caption says so. Cycle tenor = the expiry's DTE, "15-day cycles, the same tenor rolled".
- The ⓘ explains why best case (25.6%, the full credit if price pins the strike) differs from the table's "Credit / margin" on time value (25.1%).

---

## 3. "% of margin" as a reading unit

Added to the reading units (`ReadingUnit`: % of notional · $ per contract · × credit · % of margin). Like the other three it rescales one number expressed in A's notional: v·S_A/M_A, with M_A = A's margin at entry (fixed, so the payoff curve divides by a constant). B's line is then h·P_B/M_A; under "Equal margin" sizing, h = (M_A/S_A)/(M_B/S_B), so B's line equals P_B/M_B exactly and the A − h·B tab is the difference in return on own margin. The ⓘ says so, with a one-click "size by margin". The recovery panel keeps each side on its own capital. The ⓘ also states that this margin is approximate Reg T (20% × leverage plus premium) while the Compounding tab uses house rates (75% / 50%); one shared margin rate per ticker is a later item. Tight wings cap margin near the width, so the scale jumps when a wing is toggled. With no margin, fall back to % of notional, as `unitsNote` does for × credit.

---

## 4. EV explainer

One popover from the EV row, the overview's EV column and the recovery panel. It always shows the period-vol block; when opened from the comparison table's EV row under implied odds, one first line is added: "This row uses implied odds: EV = fill vs mid = $0 at mid (−$x at natural). At 117% vol:". The credit uses the summary's formatter and the settlement is the plug, so the lines add up:

```
Credit                          +$432 /contract
Expected settlement at 117% vol −$398   (period vol: HV30)
Expected value                   +$34  = +2.0% of margin · +1.6% of notional
Loss ≥ 32.1% of margin (the 1.5σ hit): 5.0% a cycle · ≥ 56% (2σ): 1.3%
Growth a cycle: 25.6% best case · 3.7% if no such hit · 2.0% average
```

The grid's "× odds" tip names its odds too.

---

## 5. Markdown export (implemented; alignment in step 2)

Done and published: ⋯ menu → "Export as Markdown · Compare A vs B / Compounding", Copy, Download .md (through the viewer's downloads capability inside claude.ai, a Blob anchor standalone), Sections ▾; 88 tests. Alignment in step 2: the export calls `computeRecovery`, the `VIEWS` helpers (`pairWorst`, `pairPop`) and one shared format namespace instead of its own copies (about 15 formatters today), reads nothing from `YR._state()` or `VIEWS.LAST` (test hooks), takes an options object and returns a Result, and the export-vs-panel test extends to the results-table numbers.

---

## 6. Later, kept separate on purpose

- IV path for marks before expiry (comparer): changes marks, not odds; pluggable through the mark `shock` argument.
- Saved comparisons (named view codes; `Registry` once it exists).
- Odds overlay: implied vs period-vol distribution on the odds strip.
- One shared margin rate per ticker across both tabs.
- "kσ of period vol" as a hit basis; "gap on day d" as a hit timing.
- Temporal for dates, once node has it (the tests run the model in node 22, which does not); until then dates go through one `calendar` adapter.

---

## 7. Tests

- `DIST.make` misses when the vol changes and hits when it returns; the distribution at vol = HV30 equals today's; the closed-form cdf matches the grid on the implied side.
- The overview's EV column reads the ticker's vol; "Set as A" and swap keep it; a Compounding swap in vol mode leaves the comparer's vol unchanged and each run keeps its vol; a vol change from the comparer marks the Monte Carlo stale.
- Rates: best case = credit for straddles and strangles, < credit for guts, ≤ 0 for a net debit; "if no such hit" is non-increasing in L and equals exp(E ln(1+P)) − 1 once L ≥ the worst loss, where the plain conditional mean equals the average; q includes the floor at a wing; (1−q)^N and the amber threshold; L ≥ 1 → wiped out; L ≤ 0 → none needed; no NaN anywhere.
- Quadrature: 24 nodes vs 48 nodes agree to 1e-9; closed-form E and q against a fine midpoint sum.
- The export's recovery and results-table numbers equal the panel's; labels come from the one helper.
- Migration precedence (Compounding rv vs hvk), `rdG` mapping, `#v9.` codes still load.
- Screens: summary small line, slot popover, recovery panel with the honesty line, Reading units with % of margin; 1200/1440, light/dark.

---

## 8. Code direction: migrating to the code directives

The directives are written for TS; the lab is plain JS concatenated into one HTML page by a Python build with regex source rules. The migration is gradual: every piece of new or touched code follows the directives; untouched code is converted module by module.

### 8.1 Design

**Event loop (decision 1).** Commands are applied synchronously; only the render notification is coalesced per animation frame. Reasons: code reads state right after a change (`setUnit`/`setRange`, toast actions, `codeLoaded`), and a command's error must arrive at once.

```js
const Command = { SetA: "cmp.setA", SetB: "cmp.setB", Link, Unlink, Detach, Swap, RelinkAll, SetFrom, ApplyFix, ApplyAction,
  SetAssumption, SetPeriodVol, SetPref, SetMoveUnit, AddPin, RemovePin, ClearPins, ShowTab, LoadView, Reset };
// envelopes are flat, at most 3 levels deep
{ type: Command.SetB, path: "values.put", value: 20, source: "dock" }                       // command
{ type: "state.changed", at, state, context, notices, faults, causes: [Command.SetB] }      // once per frame
{ type: "notice", at, notice: { text, actions: [/* commands */] } }                         // toasts; buttons emit commands
{ type: "fault", at, fault: { code, severity, text, handling, where } }

class Bus { listeners; queue; isDispatching; subscribe(type, listener) /* returns unsubscribe */; emit(envelope) /* synchronous; queued while dispatching; a throwing listener becomes one fault */ }
class CommandExecutor { constructor({ bus, store, handlers /* Registry: Command -> ({state, command}) -> {state, notices, faults} */, frames }) }  // the only writer of the store
class FrameLoop { constructor({ bus, store, buildContext, requestFrame, cancelFrame }); pending; frameId; mark(change); flush() }                // any number of changes -> one state.changed per frame; requestFrame injected so node tests drive frames
```

- Controls: binders take `{ read, command }` and emit on the bus themselves; their sync functions (today's SYNC/REG/VSYNC arrays) subscribe to `state.changed` and keep skipping the focused control, so slider drags stay one command per input event, one render per frame.
- Until panels are classes, `main` subscribes one ordered render (summary → dock → views → title; the dock must render before the charts measure their width) plus a separate persistence subscriber. Theme becomes a pref changed by a command.
- `FrameLoop` builds the context only for the visible tab; `ShowTab` flushes.
- The Compounding tab stays off the bus in v10. When it joins, its subscriber calls its own `schedule()` and never computes inside the frame flush (its compute is a full engine run); its chunked sweep and Monte Carlo jobs keep their own timers.
- No `emitX` / `publishX` helpers: the views' `emit()` toast dispatcher and `cmpEvents` go; callers emit on the bus.

**Result and Fault, where they pay.** `readViewCode(text) → Result<{state, tab, faults}>` (codes `not_a_code`, `undecodable`, `unknown_version`; migration notes as faults) replaces three try/catch sites; command handlers through the one executor catch; the storage, clipboard, download and calendar adapters; the export ("Compounding has no results yet"); `SetPeriodVol` (ok, with a fault when floored or clamped). Not wrapped: maths kernels, `POS.payoff/val/stats`, `DIST` (hot loops, NaN and `na` already carry failure), `POS.build` (the Built stays the value, with `na`, `naReason` and flags as data), `INST.make` inside the model (its ids are sanitized at the boundary), `STATE.change` (returns `{state, notices, faults}` plainly; only the executor wraps). Fault records carry `handling`. Position faults (WIDENED, CHAIN_END…) are data on the memoized Built, shown in the warn row, never emitted; event faults (normaliser, migration, CONVERT_RESET, floors, storage, render exceptions the bus catches) go on the bus once.

**Classes** (stateful, each with a "why a class" comment, every method using `this`), one abstract `Panel` (host, bus, isStale, subscribes in its constructor), one level deep, classes inside their file's namespace so the one-name-per-file build check holds:

| Class | State it holds today |
|---|---|
| `PositionDock` | root, lastKey, last context, slider state during drags |
| `SummaryStrip` | the context, the pills, the ResizeObserver |
| `NoticeToast` | notices and timers (unifying three toast paths and three durations) |
| `OverviewPanel`, `GridPanel`, `PayoffPanel`, `SweepPanel`, `SmilePanel`, `RecoveryPanel`, `ExportMenu` | cells, hover, pins, popovers, narrow mode, host callbacks |
| `Bus`, `CommandExecutor`, `FrameLoop`, `Store`, `ViewPersistence`, `LruCache`, `Registry` (generic) | infrastructure |

Joint moves, pins and notes stay render functions. Instrument, Expiry, Built and Stats stay frozen plain records with JSDoc typedefs (memoized, copied with `Object.assign`; a class would add no behaviour). Helpers that do not use `this` stay module functions. The Compounding closure is out of scope until it joins the bus.

**State, Config, Preferences.** One in-memory `Store` holds one tree: `comparison`, `assumptions` (today's scen), `prefs` (today's view), `periodVol`; the view code carries the whole tree. `Registry` is generic (`new Registry()` for the command lookup now, saved comparisons later). Enums name the existing stored values (nothing stored changes except `rdG`): placement `Basis`, `Role`, `LegKey`, `Structure`, `Kind`, `LegsMode`, `Fill`, `ExpMap`, `MarkMode`; comparison `SizingRule`, `Aspect`, `CmpEventType`, `DiffCode`, `FaultCode`, `FaultSeverity`; assumptions `MoveUnit` (sig/pct/pts), `ReadingUnit` (pct/usd/cr/margin), `WorstLossRange`, `Odds` (`Implied: "rn"`, `PeriodVol: "hv"`), `Align`; views `OverviewMetric`, `GridView`, `GridValue`, `GridTab`, `ContourType`, `ChartScale`, `ChartRange`, `SweepLeg`; recovery `HitBasis`, `HitSide`, `RecoveryBase`, `Capital`, `GrowthRate`; other `VolSource`, `Theme`, `Tab`, `Side`, `Command`, `ExportSection`. A `CONFIG` block per module: dist (grid points, span, σ√T floor), inst (LRU size, smile floor, version rounding, increment window, no-op tolerance), rule (TOL, CE_TOL, BOUNDS, WMIN/WMAX/WDEF/DEF/STEP), pos (ε, vol floor, τ cut-off, early-assignment threshold, margin base 0.20), cmp/ctx (default comparison, h clamp), state (defaults, range caps, vol range with the 1% floor), recovery (amber threshold, tie tolerance, quadrature nodes, 104-week year switch), summary (fit stages, one toast duration), views (sweep points, height budgets, resize threshold), export (sections, file-name pattern), app (storage keys, resize debounce).

**Renames** (step 3, with callers): the `appX` family → `page`, `runGuarded`, `saveView`, `renderActiveTab`, `readBootState`, `main`; pure forwarders (`cmpRefresh`, `renderViews`, `wireViews`, `exportWire`, the top-level copies of the export namespace members) removed; `cmpChange`/`cmpDo` → commands; `renderAll` → the ordered subscriber; `SYNC`, `ASYNC`, `REG`, `VSYNC`, `HOOK` → subscriptions; bare-noun functions get verbs (`INST.base/atmAt/dteOf/b76`, `POS.val/payoff/stats/legsAt/worstIn/canon`, `RULE.valueAt/range/ends/achieved/eligible`, `CMP.identical → isIdentical`, `STATE.code/blob`, `ctx9 → buildContext`, `statsHV` goes, UI `glyph/marks/line1..3/pillsHtml/recRun`, export `sec*/ySec*` → `write…Markdown`); `INST` splits its Black-76 maths, caches and `deepFreeze` out of the registry; `VIEWS.LAST` and `YR._state/_res/_sres/_mc` test hooks leave the source; `C`, `S9` → `context`, `state`. Adapters: `storage`, `clipboard`, `download`, `calendar`.

### 8.2 Order (decision 2), each step shipped and verified on its own

1. **Bus, executor, FrameLoop, Result, Fault, Command enum, the adapters, the `appX` renames; one ordered subscriber.** Screens pixel-identical (the v9 screenshot and finding re-checks are the regression suite). New top-level names (Result, Fault, Bus, Store, Registry, the enums) live in a new first model-layer file registered in `build9`'s allowed names and the test loader; the `.hv` / "HV30" source rules go into both.
2. **The v10 features on commands:** period vol with its port into the Compounding tab, the recovery rates, % of margin, the EV explainer, the export alignment, `#v10.`.
3. **Model signatures and faults:** options objects across `RULE`, `POS`, `CMP`, `STATE`, `CTX`, flags → faults, `createXError`, the renames; tests rewritten alongside.
4. **Panels as classes**, each subscribing itself; the ordered subscriber goes; a test asserts the dock renders before the charts.
5. **TypeScript** (§8.3).

### 8.3 Language (decision 3)

JS with JSDoc now, with a type check as a developer gate: `tsc --noEmit --allowJs --checkJs` over the bundle gives 48 errors non-strict today (30 are `EventTarget.closest`) and about 3,300 strict. Gate non-strict now; turn strict on per file as each file is converted. Type namespaces (`Lab.Position`, `Lab.Built`, `LiteralUnion`) in one `.d.ts` that is never bundled. Reasons specific to this page: the build is string concatenation with regex rules that would not see TS declarations; the tests load raw files into a vm; the artifact must stay one file; steps 3–4 move every module boundary. Later, node 22's `module.stripTypeScriptTypes` can strip erasable TS without esbuild if enums are written as `as const` objects, which the directive already prefers.

---

## Resolution log (two rounds, all points accepted)

Round 1 (16 points): period vol per ticker, not per slot; the dist memo keyed on the vol; unlisted readers and label helper; EV readings always on period vol; model figures replace the rough ones; the compounded conditional rate; the honesty figure; the curve per hit size; edge cases; σ stays implied; hit at expiry; % of margin definition; the explainer lines; Compounding unification; wording; tests.

Round 2 (20 points): the compounded rate can sit below the average and goes negative at full margin (the "never below average" claim and its test were wrong); no closed form for the log-mean, quadrature instead; the explainer under implied odds; grid width and closed-form cdf in period-vol mode, vol in the memo key only there, no spot argument; `computeRecovery` takes the vol, not a dist; the Compounding vol override belongs to a run and a swap flips it (the round-1 version was incoherent); explainer rounding; dropped ⓘ and label consistency; synchronous commands with a per-frame render, a command registry, a notice envelope, no emit helpers, dock before charts; Result where it pays and Fault with `handling`, position faults split from event faults; the full class list with `PositionDock`; one Store and generic `Registry`, `periodVol` at the top level, the enum and CONFIG lists; the rename list; bus before features; JS + JSDoc with a `tsc --checkJs` gate and a calendar adapter in place of Temporal; the shared vol's owner and port; "% of margin" as a rescale by A's margin (own-margin per side broke the one-scale contract); versions and stored values; the export alignment is wider than recovery; build and test plumbing.
