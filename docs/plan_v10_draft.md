# Plan v10 (revised after critique round 1): period vol as one source of truth, honest recovery dynamics, markdown export, code direction

Status: DRAFT r2 for the second critique round. No model or recovery code changes yet. The markdown export is implemented (see §5) and will be brought into line with this plan in step 1 of §8.

Code base: `SP/v9/` (SP = `/tmp/claude-0/-home-user-voltagent-chat/eab0dce9-3582-5b50-8fc1-369c85131c50/scratchpad`). `CORE_API.md` documents the layers; `CODE_DIRECTIVES.md` is the user's coding standard; `scratch/crit10/critique_r1.md` is round 1. Reference case throughout: KORU 16 Oct 21 straddle at mid, 15 days, HV30 117.3%, ATM 123.9%, margin $16.89/sh, credit $4.325/sh.

What the user asked for:
1. "Rather than just using HV30 naively, I can define what the IV will be in the looked-at period." Clarified: N% is the assumed vol of the **underlying's moves** over the period, "long-termish for these purposes". It does **not** touch the IV of any option leg.
2. One common source of truth early in the pipeline; every panel, including EV and therefore recovery, reads from it.
3. Recovery dynamics must match its own definition ("compound without suffering another such loss") and must not appear to contradict the payoff chart.
4. Export results to markdown, human-readable.
5. Better features and UX where they earn their place; code to migrate gradually to the directives: named-dict parameters, Result objects, an event loop.

---

## 1. Period vol: one number per ticker, read by every EV-based panel

**Where it lives: per ticker, in the assumptions block of the state**, not on an A/B slot and not in `Instrument.version`.

```js
S9.scen.vol = { KORU: { v: 100, src: "set" } }   // absent entry = HV30 of that ticker; src ∈ {"hv30", "atm", "set"}
C.volOf(id) -> { v, src, label }                 // the only accessor; label: "vol 117% (HV30)" / "vol 100% (set)" / "124% (ATM 16 Oct)"
DIST.make({ expiry, spot, odds, vol })            // memo key includes the vol actually used; the hvk multiplier is gone
```

Why per ticker and not per slot (accepted from the critique): slots belong to sides, and the overview builds its 16 cells on bare `{id}` slots; "Set as A/B" and a ticker round-trip would drop a per-slot number; and `same`, `isIdentical`, `sameTrade`, `smileGroups` and every pricing memo key include the instrument version, none of which should change when an odds assumption changes. Leg prices never depend on this number.

**Readers** (all through `DIST.make` with the ticker's vol):
- EV-based readings **always** use the period vol, whatever the odds switch says: recovery growth, the sweep's EV line, the overview's EV column, the EV explainer. Labelled "at 117% vol". (Under implied odds EV is fill vs mid, 0 at mid, which is why these never follow the switch.)
- The odds switch (`scen.dist`) keeps governing profit odds, the odds strips, the grid's column odds and the comparison table's EV row.
- The Compounding tab's per-ticker "moves" input **is** this number (one block, editable from either tab). Its IV path scales the Compounding IV input, and under the "keep the gap" rule the moves follow from the shared starting value; the Compounding's separate flat pricing IV stays tab-local. `rvB` (B differs in vol) stays Compounding-only and the Compounding swap exchanges only that override.
- Stress and Random years take the ticker's vol.

**Not readers:** leg prices and leg IVs (quotes), the implied odds model (the smile), marks of open legs before expiry (today's smile), and the smile fit's flat fallback in `inst9.js:142`, which must stay on listed HV30 because it is leg pricing. A source rule in the purity test enforces it: no `.hv` read outside `inst9` and `C.volOf`, and no "HV30" literal outside one label helper.

**Range and rounding.** Stored range 0–300 (the Compounding tab's 0 means "exactly on the path"); the comparer floors it at 1% with a note. The source is stored, so a Compounding edit that leaves the value at HV30 to display precision does not flip the source to "set".

**Presets** in the slot popover, renamed **"spot / IV / period vol ▾"**: HV30 (117%), ATM at A's horizon stored when chosen and labelled "124% (ATM 16 Oct)", custom N% (number box plus slider with reference ticks; the 1-year and 5-year realized ticks exist for KORU only, so RAM shows HV30 and ATM).

**Where it shows.** The fixed summary's small line: "vol 117% (HV30) vs implied 124%" per card; that gap is what drives EV. A hand-set value gets the ✎ mark. The Reading menu's odds switch is relabelled **Odds: implied | period vol**.

**Migration.** `scen.hvk` goes away: if an old code carries a Compounding `rv` that differs from rounded HV30, take it; otherwise `hv × hvk`. One note per ticker on load.

**The σ yardstick stays implied** (decision 1, resolved per the critique): the move range, the worst-loss range and "equal worst loss" sizing are stored in σ and are not odds; the placement basis σ is implied; and the hit size must not change when only the view of its likelihood changes. Where σ meets odds, both are printed, e.g. the axis ⓘ: "1σ = +29% / −22% (implied 124%); at 117% vol, beyond 1.5σ: 4.4% up, 7.1% down". A later option: "kσ of period vol" as a third hit basis.

---

## 2. Recovery dynamics: three growth rates, "if no such hit" as the default

Per cycle, P = P&L per unit of capital at expiry (capital = each side's own Reg T margin at entry by default, or notional), under the period-vol distribution; L = the hit as a fraction of capital. E and q are computed in closed form (piecewise-linear payoff × lognormal, as EV already does) rather than on the odds grid, which only spans ±7 implied σ.

| Rate | Definition | Reference case | Reads as |
|---|---|---|---|
| Best case | max payoff / capital (= the credit for straddles and strangles; less for guts or ITM legs; ≤ 0 for a net debit, printed "best case −x% (net debit)") | 25.6% → 1.7 cycles | nothing ever goes wrong |
| **If no such hit (default)** | exp(E[ln(1+P) \| P > −L]) − 1: the compounded average given no loss as large as the hit | 3.7% → 10.6 cycles | the user's definition, with the losses inside the condition still compounding |
| Average | E[P], plain | 2.0% → 19.4 cycles | expected NAV; not a compounding rate at full margin |

- Conditioning is on the **P&L**, not the move: right for capped and asymmetric positions and fixed-% hits alike, monotone in L, never below the average. A tie at a flat floor (L = worst loss) counts as a hit.
- When L is at or beyond the worst loss, q = 0 and the rate equals the average; the panel says "this position cannot lose 90% of margin in one cycle (worst −76%)". L ≤ 0 → "none needed".
- **Honesty line, the companion of the conditional rate:** q = P(P ≤ −L) per cycle and the chance that the condition holds for the whole recovery, (1−q)^N: "chance of no such hit in the 11 cycles: 57% (5.0% a cycle)". Amber below 50%.
- **Hit cell on both bases at chart precision:** "−32.1% of margin · −25.7% of notional", so the cross-check against the payoff chart holds. The reference hit: a 1.5σ move on the worse (up) side, +45.8%; the down side at 1.5σ costs only 13.1%; q counts both sides at the same loss (4.4% up beyond +45.8%, 0.6% down beyond about −47%).
- The hit is measured **at expiry** (decision 2): the growth rate comes from the expiry distribution, the Hit then equals the payoff chart, and a mark at day d would need the IV-shock inputs. Later submenu option: "gap on day d, closed at the mark".
- Basis menu "Growth per cycle": **If no such hit | Average | Best case | Typed**. The curve draws only the selected rate, recomputed per hit size g(h); the other two rates go to the tooltip and a small line "best case 1.7 · average 19.4 cycles". No "range" wording.
- The hit's σ is each position's own implied σ to its own expiry; the caption says so.
- Cycle tenor = the expiry's DTE, "15-day cycles, the same tenor rolled".
- The ⓘ explains why best case (25.6%, full credit if price pins the strike) differs from the table's "Credit / margin" on time value (25.1%).

---

## 3. "% of margin" as a reading unit

Added to Reading units (% of notional · $ per contract · × credit · **% of margin**), defined as **each side's own margin at entry**: fixed at the entry spot, so the payoff curve divides by a constant; and own-margin for B, so h cancels, B's figures match B's recovery Hit, and A − B becomes a difference in return on capital. The ⓘ states that this margin is approximate Reg T (20% × leverage plus premium) while the Compounding tab uses house rates (75% / 50%); one shared margin rate per ticker is a later item. Tight wings cap margin near the width, so the scale jumps when a wing is toggled. With no margin, fall back to % of notional, as `unitsNote` already does for × credit.

---

## 4. EV explainer

One popover from the EV row, the overview's EV column and the recovery panel, computed once and rounded so the lines add up:

```
Credit                          +$433 /contract
Expected settlement at 117% vol −$399   (period vol: HV30)
Expected value                   +$34  = +2.0% of margin · +1.6% of notional
Loss ≥ 32.1% of margin (the 1.5σ hit): 5.0% a cycle · ≥ 56% (2σ): 1.3%
Growth a cycle: 25.6% best case · 3.7% if no such hit · 2.0% average
```

Under implied odds the first two lines read "settlement = the legs' mid value; EV = fill vs mid".

---

## 5. Markdown export (implemented; to be aligned in step 1)

Done by the export agent: ⋯ menu → "Export as Markdown · Compare A vs B / Compounding", Copy and Download .md, Sections ▾ with persisted checkboxes; 88 tests pass; samples in `scratch/export/`. Two alignments in step 1: (1) the export must call the same pure recovery and label functions as the panel instead of copying them, so v10's rates and labels cannot drift; (2) the section preferences move from the Compounding state into the comparer's prefs once `state9` is touched. A third, from the directives: `toMarkdown` takes an options object and returns a Result.

---

## 6. Later, kept separate on purpose

- IV path for marks before expiry (comparer): changes marks, not odds; pluggable through the mark `shock` argument.
- Saved comparisons (named view codes in the ⋯ menu).
- Odds overlay: implied vs period-vol distribution drawn together on the odds strip.
- One shared margin rate per ticker across both tabs.
- "kσ of period vol" as a hit basis; "gap on day d" as a hit timing.

---

## 7. Tests (replacing the draft's list)

- `DIST.make` misses when the vol changes and hits when it returns (the stale-memo case); the distribution at vol = HV30 equals today's.
- The overview's EV column reads the ticker's vol; "Set as A" and swap keep it; a Compounding swap in vol mode leaves the comparer's vol unchanged.
- Rates: best case = credit for straddles and strangles, < credit for guts, ≤ 0 for a net debit; "if no such hit" ≥ average for every L and = average once L ≥ the worst loss; q includes the floor at a wing; (1−q)^N and the amber threshold; L ≤ 0 → none needed; no NaN anywhere.
- Closed-form E and q agree with a fine quadrature to 1e-6.
- The export's recovery figures equal the panel's; labels come from the one helper.
- Migration precedence (Compounding rv vs hvk) and `#v9.` codes still load.
- Screens: summary small line, slot popover, recovery panel with the honesty line, Reading units with % of margin; 1200/1440, light/dark.

---

## 8. Code direction: migrating to the code directives (`CODE_DIRECTIVES.md`)

The directives are written for TS; the lab is plain JS concatenated into one HTML page. The migration is gradual: every piece of new or touched code follows the directives; untouched code is converted module by module, never in one rewrite.

**8.1 What the directives change here**

| Directive | What it means in this codebase |
|---|---|
| Named-dict parameters | Every model entry point takes one options object: `DIST.make({ expiry, spot, odds, vol })`, `POS.build({ position, expMap })`, `POS.stats({ built, dist })`, `RULE.resolve({ expiry, structure, basis, values, wings })`, `CMP.setB({ comparison, path, value })`. Two-number maths helpers (`bs`, `N`) stay positional. A module and all its callers are converted together; no delegating shims. |
| Result objects | A `Result` namespace: `{ ok: true, value, faults }` or `{ ok: false, error: { code, message, details }, faults }`, with `isOk` / `isErr` guards. Used where it matters: parsing and migrating view codes, `INST.make` (unknown id, bad override), state changes (`STATE.applyChange` returns the new state and the faults the change produced), the markdown export, building a position (`ok: true` with faults for an n/a position, because the page still renders it). |
| Fault messages | Today's flags ("widened to keep a strangle", "wing n/a", "chain end", "point held: the path cannot fall", "RAM has no weeklies") become `Fault` records `{ code, severity, text, where }`: handled defects, logged on the bus and shown in the warn row, never thrown. |
| Event loop / bus | A `Bus` class (listeners, a queue flushed once per animation frame, an `isDispatching` flag; the "why a class" comment goes on it). Controls emit **commands** (`{ type: Command.SetB, path, value }`); one `CommandExecutor` applies them through `STATE` and emits a `state.changed` envelope `{ type, at, state, context, faults }`; panels subscribe and render themselves. Replaces the `cmpChange(fn) → renderAll()` wiring and the `SYNC` arrays. No `emitX` / `publishX` helpers: callers emit on the bus directly. |
| Classes vs functions | Stateful things become classes with a "why a class" comment and every method using `this`: `Bus`, `CommandExecutor`, `PreferencesRegistry` (localStorage; durable beyond a session), `SessionStore` (in-memory), and the panels that hold DOM or hover state (`PayoffPanel`, `GridPanel`, `OverviewPanel`, `RecoveryPanel`, `SummaryStrip`). Pure transforms stay functions: resolve, price, stats, distributions, formatting, markdown. |
| Config vs Preferences | `S9.view` becomes `prefs` (user-changeable). Hard-coded knobs move to a `CONFIG` object at the top of each module (distribution grid size and range, tolerances, slider steps, colours, height budgets). Magic strings become enums: `Basis`, `Structure`, `Odds`, `Fill`, `Unit`, `GrowthRate`, `Command`, `FaultSeverity`. |
| Errors and guards | `createXError({ code, message, details })` with complete messages (expected vs received); `isSlotDef`, `isPosition`, `isBuilt`, `isResult` guards; early returns in entry points; no boolean soup or ternary chains in new code. |
| Adapters | `localStorage`, the clipboard and `Blob` download behind small utils (`storage`, `clipboard`, `download`). |
| Comments | A role-describing header block per file; comments explain the role in the module, not the next line. |
| Naming | Functions are verbs; "Registry" only for things durable beyond a session; no `AppX`, no `xyzSection`. |

**8.2 Order (each step shipped and verified on its own)**

1. **v10 in the new style.** Period vol, the recovery rates, % of margin, the EV explainer and the export alignment, written with options objects, Result, enums/config and guards. `DIST.make` is the first converted signature; recovery becomes a pure `computeRecovery({ built, dist, prefs })` shared by the panel and the export, plus a small `RecoveryPanel` class.
2. **Bus and command executor.** Behaviour pixel-identical; the v9 screenshot and finding re-checks are the regression suite. The Compounding tab joins the bus afterwards.
3. **Model signatures and faults** across `RULE`, `POS`, `CMP`, `STATE`, `CTX`; tests rewritten alongside.
4. **Panels as classes** where they hold state.
5. **Optional: TypeScript** via esbuild into the same single HTML, once the module boundaries have settled; JSDoc types until then.

**Decision point 3:** is "event loop" the bus-and-commands design above (with a per-frame flush)? **Decision point 4:** TypeScript now, or JS + JSDoc through steps 1–4?

---

## Responses to critique round 1

| # | Verdict | Note |
|---|---|---|
| 1 per-ticker vol, not slot/version | accepted | §1 rewritten; `S9.scen.vol`, `C.volOf(id)`, version untouched |
| 2 DIST memo key | accepted | key on the vol used; hvk removed; stale-memo test |
| 3 unlisted readers | accepted | export via shared functions; label helper; inst9:142 stays on listed HV30; source rule in t01; yr rounding handled by stored source |
| 4 which odds feed recovery | accepted | EV-based readings always on period vol; odds switch governs POP, strips, grid odds, the table's EV row |
| 5 wrong example numbers | accepted (already corrected before round 1 closed) | model figures everywhere; tests compute them |
| 6 compounded average | accepted | exp(E[ln(1+P) \| P > −L]) − 1 = 3.7%, 10.6 cycles; "average" labelled expected NAV |
| 7 honesty line | accepted | (1−q)^N shown; amber below 50% |
| 8 curve per hit size | accepted | only the selected rate drawn, g(h) per point; others in tooltip; no "range" |
| 9 edge cases | accepted | best case = max payoff / capital; floor ties count; net debit text; L ≥ worst → average; closed-form E and q; §7 test fixed |
| 10 keep σ implied | accepted | decision 1 resolved; probabilities printed where σ meets odds |
| 11 hit at expiry | accepted | reasons added |
| 12 % of margin definition | accepted | own margin at entry; Reg T vs house rates stated; precision |
| 13 explainer lines | accepted | as given |
| 14 Compounding unification | accepted | wording, range 0–300 with comparer floor, stored source, rvB tab-only, IV input tab-local, RAM ticks, migration precedence |
| 15 wording | accepted | all terms adopted |
| 16 tests | accepted | §7 |

Nothing rejected. One addition the critic did not see: §8 (code directives), which needs the same scrutiny.
