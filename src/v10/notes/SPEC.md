# Comparer v9 spec: instruments, positions and comparison as separate layers

Scratchpad root (SP): `/tmp/claude-0/-home-user-voltagent-chat/eab0dce9-3582-5b50-8fc1-369c85131c50/scratchpad`. v9 lives in `SP/v9/`.

**Scope**
- This rebuilds the *Compare A vs B* tab of the RAM · KORU options lab.
- The Compounding tab (yr_*.js) is not touched and must keep working.
- v8 files stay untouched. v9 is a new set of files plus a new build script `SP/v9/build9.py`. Outputs:
  - `/home/user/short-option-explorer/dist/ram_koru_lab_v9.html` (standalone);
  - `SP/v9/ram_koru_lab_v9_artifact.html` (no doctype, for the artifact).

**Inputs to read first**
- `SP/audit/result.json`: 51 verified findings with their repros.
- `SP/audit/arch.md`: the coupling map and the target interfaces. This spec refines it.
- The v8 sources: `eng_head6.js`, `eng_state8.js`, `eng_pos8.js`, `eng_dist6.js`, `eng_ctx8.js`, `ui_common8.js`, `ui_cmp8.js`, `app_store8.js`, `app8.js`, `shell8.html`, `build8.py`.
- Data: `data8.json`.

---

## 0. The user's requirements (verbatim intent; every one must be met)

**Layers**
1. **Instrument ≠ position.** You load an equity from the predefined list (RAM, KORU) into slot A or B, together with its spot and option IVs, and can override spot and IV by hand. An instrument holds the spot, the option chain and IV surface, the strike grid, the leverage factor, the HV and the listed expiries. A position is what you build on an instrument.

**Linking A and B**
2. **The default keeps both positions the same.** B mirrors A in every aspect except the instrument. A RAM straddle compares against a KORU straddle at the same placement, and moving A's controls moves B.
3. **Each aspect links and unlinks independently:** instrument, expiry, structure (straddle / strangle), leg link, placement basis and values, protective call, protective put, fill. Examples:
   - RAM strangle vs KORU straddle;
   - only B has a protective call;
   - only B's legs are detached.

   Changing one aspect must never cut the other links.
4. **Legs link inside a position.** A straddle is one strike, a deliberate structure. A strangle has a put and a call. Detaching the legs turns a straddle into a flat-topped strangle, and the put and call then move independently.

**Placement**
5. **Common placement basis.** Strikes can be placed by the same **Δ**, the same **moneyness** (% from the forward) or the same **σ distance** (in units of that position's own ATM σ√T). Linked A and B then share the value, so you never set both sliders.

**Visibility**
6. **The comparison summary is always visible, in large type.**
   - It is fixed at the top whatever the scroll.
   - At a glance it says what is compared: "RAM 16 Oct · short straddle 15" vs "KORU 16 Oct · short strangle 21.5 / 22".
   - Any aspect where A and B differ is highlighted.
   - After ten minutes in another tab, one glance answers straddle or strangle.
7. **Per-leg credit and debit are always shown.** Every leg of A and B shows its price per contract, as a credit for a short leg and a debit for a long protective leg, plus the net for the position.
8. **Typography means font size.** Hierarchy comes from strongly different font sizes:

   | Level | Size |
   |---|---|
   | Identity | 20–22px |
   | Per-leg prices | 14–15px |
   | Labels | 12px |
   | Fine print | 11px |

   Rarely needed detail sits in expandable sections or info popups (ⓘ).
9. **Leave out clutter**, and keep rarely used options in submenus.

**Code**
10. **SOLID-ish code.** Small modules with narrow interfaces. Pure model functions (no reads of the global UI state, no writes to it), testable in node.

**Standing preferences**
- Desktop only, from 1200px wide.
- Span grouping, not flex everywhere.
- Never use the words wrinkle, seam or smell in any UI text.

---

## 1. Modules (each file is one module; the build concatenates them in this order after eng_head6.js and eng_dist6.js)

### 1.1 `inst9.js`: the instrument registry

```js
const INST = {
  list()                    // [{id, name, lev}] from D.u, with no hard-coded tickers anywhere else in v9
  base(id)                  // instrument built from D.u[id]
  make(slotDef)             // slotDef = {id, spot?: number, ivShift?: number /* vol points */}
                            //   -> Instrument snapshot with a version string; cache key = id+spot+ivShift
}
Instrument = { id, name, lev, spot, spotListed, hv, ivShift, overridden: bool, version,
               expiries: [expId...],           // this instrument's own listed expiries (sorted)
               exp(expId) -> Expiry }
Expiry = { id, dte, T, Fcarry, Fpar /* parity forward, the declared forward */, atm /* incl. ivShift */,
           sigma /* atm·√T */, smile(K) -> iv /* fitted smile incl. ivShift */,
           chain: [{K, cp, bid, ask, mid, iv, model: bool}]   // see below
           strikes: [K...] (listed, sorted), limits: {call: {minK, maxK}, put: {...}} }
```

- **Declared forward.** The forward is the parity forward `Fpar`: the average over the 2–3 strikes nearest spot of `K + e^{rT}(C − P)` from the mids. Without valid pairs it falls back to `Fcarry = S·e^{rT}`. One forward per expiry is used for Δ, moneyness, ATM, σ distance and parity pricing.
  - The smile is still evaluated at `x = ln(K / Fcarry_listed)` as fitted, plus `ivShift`. Document this in a comment.
- **Overrides.**
  - Spot: the chain is regenerated as model quotes with a sticky-moneyness smile (K scales with spot/spotListed). Each quote's mid comes from Black on the fitted smile; bid and ask keep the listed relative half-spread of the nearest listed strike. Mark these quotes `model: true`.
  - IV shift alone: the mids are re-priced with the shifted IV, and the listed relative spreads are kept.
  - No override: the listed quotes are used as they are.
- **Caches** are keyed by `version`. Never mutate D (v8 writes `E._w` into D; v9 must not).

### 1.2 `rule9.js`: placement and structure resolution (pure)

```js
Structure = { short: "straddle" | "strangle", legsLinked: bool,      // legsLinked only matters for a strangle
              wings: { call: bool, put: bool } }                       // protective long call / long put
Basis = "delta" | "money" | "sigma"
Values (on the basis):
  straddle: { center }           // delta: call Δ of the strike (50 = Δ-neutral); money: % from Fpar (0 = ATM);
                                  // sigma: σ from Fpar (0 = ATM)
  strangle: { put, call }        // delta: |Δ| 1..99 (step 1); money: % OTM of each leg (negative = ITM);
                                  // sigma: σ distance of each leg (negative = ITM). legsLinked => put === call.
  wings:    { call, put }        // same basis: delta = |Δ| of the long leg; money/sigma = distance beyond its
                                  // short leg (always strictly further OTM than the short)
resolve(exp, structure, basis, values) -> {
  put: {K, target, achieved: {delta, money, sigma}}, call: {...}, wingCall?, wingPut?,
  kind: "straddle" | "strangle" | "guts" (put above call),
  flags: [{code, text}]
}
```

**Resolution rules**
- **Continuous target, then snap.** Compute the continuous target strike K* on the declared forward, then snap to the nearest listed strike, with ties going further OTM.
- **Straddle.** One strike for both legs, always: snap the center.
- **Strangle.**
  - If the snapped put ≥ the snapped call while the targets do not cross: widen the put to the next lower listed strike and add the flag "widened to keep a strangle". Reason: on a coarse grid two near-ATM targets would otherwise collapse to a straddle by accident.
  - If the targets themselves cross (both legs ITM): the result is guts, labelled as guts.
- **ITM status** comes from the chosen strike against `Fpar`, never from the target.
- **Achieved values.** Every leg reports its achieved Δ, moneyness and σ distance, whatever the basis.
- **Wings** must be strictly further OTM than their short leg, at least one listed strike beyond it.
  - If the chain has no such strike: the wing is n/a, flagged, and the position is shown without that wing. It is never silently replaced by a fallback cap.
  - With both wings on a strangle, it is an iron condor; the label says "strangle + call & put wings".
- **The chain end.** A target beyond the last listed strike snaps to the end strike, with a visible flag that says which side and which strike.
- **Δ convention.** Black-76 on Fpar with the smile IV at that strike; call Δ = e^{−rT}·N(d1) and put |Δ| = e^{−rT}·N(−d1), both reported as plain percentages.

### 1.3 `pos9.js`: building a position (pure)

```js
Position = { inst: slotDef, exp: expId, structure, basis, values, fill: "mid" | "nat" }
build(pos) -> Built   // memo key = JSON(pos) + instrument.version
```

`Built` must keep every field the v8 views read: `sp`, `sc`, `cap`, `cr`, `tv`, `intr`, `margin`, `vega`, `S`, `T`, `F`, `dte`, `E`, `sig`, `key`, `tk`, `exp`, `straddle`, `guts`, `itmP`, `itmC`, `parP`, `parC`, `Fimpl`, `adjSp`, `adjSc`, `adjCap`, `capPx`, `na`, `iP`, `iC`, `exitCost`, `crS` and the rest. Read eng_pos8.js `build()` for the full list and keep the semantics, so that `payoff`, `val`, `legPx` and the v8 views still work. It adds:

```js
legs: [{ role: "short put"|"short call"|"long call"|"long put", cp, K, qty: -1|+1,
         bid, ask, mid, fillPx, perContract /* fillPx·100, signed: +credit for shorts, −debit for longs */,
         iv, delta, money, sigma, itm: bool, intrinsic, timeValue, model: bool }],
net: { perShare, perContract /* signed: + credit, − debit */, isDebit },
kind, label: { short: "RAM 16 Oct", struct: "short straddle 15" | "short strangle 21.5 / 22"
               | "short guts 22P / 21C" | "… + 25 call wing", full },
flags: [...]   // from resolve plus pricing flags (mid below intrinsic, early assignment likely, model quotes)
```

**Pricing**
- **OTM legs** use the listed quote, or the model quote when overridden. ITM legs use v8's parity method on Fpar, from the OTM twin.
- **Entry P&L must be 0 at entry for every leg** (audit finding: instant P&L on ITM legs). The per-leg IV offset pins the model mark to the fill basis that is used for the credit.
- **Margin.** Reg T leveraged-ETF rules, as in v8, using `inst.lev`.
- **Strangles and straddles are margined alike;** a straddle is a strangle with one strike.
- **Wings use spread margin.** Call wing: min(width, naked). With both wings: the larger width.

**Statistics**
- `stats(built, dist)` is pure: EV, profit odds, breakevens.
- It must handle net debits (no profit odds or breakevens when the position cannot profit; the audit has repros) and guts with a cap below the put strike.
- `dist` is passed in, never read from `st`.

### 1.4 `cmp9.js`: the comparison model (pure, plus a small mutator API)

```js
Comparison = {
  A: Position,
  B: { inst: slotDef, ... any aspect values used when unlinked },
  links: { exp: true, structure: true, legs: true, basis: true, values: true, wingCall: true, wingPut: true, fill: true },
  expMap: "same" | "nearest",   // when exp is linked and B's instrument lacks A's expiry: nearest DTE, with a flag
  sizing: { rule: "auto"|"notional"|"credit"|"vega"|"loss"|"margin"|"custom", h },
}
resolveB(c) -> Position         // for each aspect: links[aspect] ? A[aspect] : B[aspect]; instrument never linked
unlink(c, aspect)               // copies A's current value into B, then sets the link false
link(c, aspect)                 // sets true and drops B's own value
setA(c, path, value) / setB(c, path, value)
                                // setB on a linked aspect unlinks that aspect first, copying A, then sets it.
                                //   It never unlinks anything else.
swap(c)                         // exchanges A and B including instruments; links stay; B's own values become A's view
diff(c) -> [aspect...]          // aspects where the resolved A and B differ (including resolved kind:
                                //   straddle vs strangle)
```

- **Wings and basis.** A wing aspect is the on/off flag plus its value. A basis switch converts the current values to the new basis from the resolved strikes, so the position does not jump.
- **Migration.** Old v8 states (`st.A`, `along`, `bk`, `Bf`, `link`, `linkB`) migrate:

  | v8 `along` | v9 unlinked aspect |
  |---|---|
  | tk | (nothing besides the instrument) |
  | st | structure / wings |
  | exp | expiry |
  | k | values |
  | fill | fill |
  | free | everything |

  B's own values come from bk, Bf and bexp. v8's `st: "cap"` becomes `wings.call = true` with the cap Δ.

### 1.5 `state9.js`: application state and persistence

```js
S9 = { cmp: Comparison, scen: {unit, rlo, rhi, rlink, wl, wlo, whi, dist, hvk, ivs, svs, svd},
       view: {...all v8 view prefs: units, size?, overview, grid, sweep, recovery (rd*), pins, dock, theme} }
```

- Each part has its own sanitizer. Keep all v8 scenario and view features.
- Persistence goes through the existing app shell (`app_store8.js` / `app8.js` copied to v9 names). Blob `{v:9, tab, theme, cmp: S9, yr}`; hash `#v9.`. Load `#v8.` and `#v5.` through migration.
- Listen for `hashchange`, so a pasted view link loads (audit finding).
- `context()` becomes pure. `ctx9(S9) -> C` holds the same fields as v8's `C` (`A, B, Ap, Bp, h, same, unit, ax, toSA, toSB, uOfSA, uOfSB, lo, hi, wlo, whi, sameExp, cal, Hd, d, dB, sa, sb, rule, clampNote` and so on), plus `diff`, `labels` and `flags`.
- **The σ convention for B** is one rule everywhere, stated once. Move-axis σ uses each instrument's ATM σ at the **comparison horizon** (A's expiry): that is the scenario axis. Placement σ uses each position's own expiry. Label both accordingly.

### 1.6 UI, rebuilt from scratch: `ui9_summary.js` (fixed comparison summary) and `ui9_dock.js` (side panel)

**Fixed summary**
- It replaces v8's chip row and is always visible, sticky under the tab strip.
- Two cards side by side, A (purple key) and B (orange key). Each card has:
  - **Line 1, 20–22px semibold:** instrument and expiry plus the structure label with strikes, e.g. "RAM 16 Oct · short straddle 15".
  - **Line 2, 14–15px:** every leg with its price per contract, e.g. "short 15P +$85 · short 15C +$92 · net credit **$177** /contract". Long wings appear as "long 19C −$10 (debit)". A net debit is shown as a debit, in the debit colour.
  - **Line 3, 12px muted:** placement and achieved values, e.g. "Δ 30/30 → 31Δ/29Δ · 8.1%/9.0% from fwd · 0.33σ/0.37σ", plus the expiry DTE and flags (model quotes, widened, chain end, n/a wing).
- **Between the cards:** a compact "vs" plus the **difference strip**, one pill per differing aspect, e.g. "instrument" or "structure: straddle ≠ strangle".
  - A difference the user did not ask for is shown in amber: B linked but resolved differently, as in grid-induced straddle vs strangle.
  - An unlinked aspect shows in neutral ink.
- The summary must also carry the swap button and a compact "move range" row (v8 row 2: range inputs, unit seg, symmetric, Reading menu), so the sticky block is one unit.
- **Height budget:** ≤ 150px at 1200, ≤ 130px at 1440.

**Side panel ("Positions")**
- About 360px wide; the main column narrows accordingly. It is a two-column table, aspect rows by A | link | B:

  | Aspect row | A column | link toggle | B column |
  |---|---|---|---|
  | Instrument | ticker select + "spot/IV ▾" overrides | (never linked) | ticker select + overrides |
  | Expiry | seg / select | 🔗 | "= A" or own control |
  | Structure | Straddle / Strangle | 🔗 | |
  | Legs | linked / detached (strangle only) | 🔗 | |
  | Placement basis | Δ / % / σ | 🔗 | |
  | Placement values | slider(s): center, or put + call | 🔗 | |
  | Protective call | off / on + value | 🔗 | |
  | Protective put | off / on + value | 🔗 | |
  | Fill | mid / natural | 🔗 | |

- The link toggle is a small chain button. **Linked:** B shows "= A" with the resolved value in muted type. **Unlinked:** B's own control appears, starting from A's value.
- Below the table, a collapsed **"Legs in detail" ▾** with one line per leg for A and B: strike, cp, quote bid/mid/ask, fill, IV, Δ, moneyness, σ, ITM, intrinsic / time value, flags.
- **Pair sizing** stays as a collapsed section, as in v8.
- Sliders use integer steps: Δ 1, moneyness 0.5%, σ 0.05. Each shows the target → the achieved strike and value. A slider stops at the chain's limits, with a note.

**Clicking a smile quote** puts the leg that the clicked side and strike imply on that exact strike: it sets the value on the current basis from the achieved value at that strike. Audit finding: v8 placed a different strike.

### 1.7 Views (payoff, P&L grid, joint, sweep, smile, overview, recovery, notes)

- **Rule:** reuse the v8 view code from `ui_cmp8.js` in `ui9_views.js`, adapted to read only `C`, `S9.scen`, `S9.view` and INST. No direct `D.u` reads and no hard-coded tickers.
- **Every view-level finding in `result.json`** gets fixed, among them:
  - straddle labels;
  - the "EV (HV30)" column label versus its content;
  - debit and guts odds;
  - the recovery headline rounding;
  - "× credit" units falling back to % silently;
  - calendar-alignment odds after expiry;
  - the sweep ignoring unlinked legs;
  - the sticky table keys hidden under the bar;
  - the sticky-bar wrap at 1200;
  - recovery overlaps.
- **Overview:** positions are named by resolved kind and strikes.
- **The sweep varies on the current basis.** Δ / % / σ appears on the x axis, legs as they are linked or detached.
- **Fixed-summary consistency:** every place that names a position uses `built.label`.

---

## 2. Process and quality bar

**Tests**
- The model layer (inst9, rule9, pos9, cmp9, state9) ships with node tests (`SP/v9/test/*.js`). They cover:
  - every resolution rule above (straddle stays one strike; no accidental straddle from a strangle; guts only when the targets cross; ITM by strike; chain-end flags; wings strictly OTM or n/a);
  - link and unlink semantics (setB on one aspect never changes another link);
  - swap symmetry;
  - migration of v8 and v5 codes;
  - parity of `Built` against v8 `build()` for every v8-expressible position at Δ ≤ 49 (strikes, credit, margin, payoff identical within 1e-9) where v9 rules agree;
  - entry P&L = 0;
  - overrides (spot +10%: the chain is regenerated, every cache misses, no mutation of D).

**Every finding is re-checked.** Each of the 51 findings in `SP/audit/result.json` is re-run against v9, with a short table of finding → fixed / not applicable (with reason) / still open.

**A critical screenshot pass that you LOOK at:**
- 1200 and 1440, light and dark.
- States:
  - default;
  - RAM straddle vs KORU straddle;
  - RAM strangle vs KORU straddle;
  - only B with a protective call;
  - B legs detached;
  - placement by % and by σ;
  - B on an overridden spot;
  - guts;
  - scrolled to the middle and the bottom (the summary must stay visible).
- **Things to check:**
  - the font-size hierarchy reads at a glance;
  - no clipped text;
  - no overlap;
  - the difference strip is correct;
  - per-leg credit and debit are shown for both;
  - the sticky block is within its height budget;
  - no horizontal scroll at 1200;
  - no console errors.

**Build.** `build9.py` concatenates "use strict", app_store9, eng_head6, eng_dist6, inst9, rule9, pos9, cmp9, state9, ctx9, ui_common8, ui9_summary, ui9_dock, ui9_views, the Compounding yr files (unchanged, plus their YR stub logic as in build8), and app9. Shell: `shell9.html`. Data: `data8.json`.

**Git.** Push to `https://github.com/jmoudi/short-option-explorer` (clone at `/home/user/short-option-explorer`, branch main). Copy the v9 sources to `src/v9/` and the build to `dist/`. Commit with a message that describes what was done. Only the orchestrator pushes. Never push anywhere else.
