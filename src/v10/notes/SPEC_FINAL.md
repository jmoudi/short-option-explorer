# Comparer v9 spec (final): instruments, positions and comparison as separate layers

Scratchpad root (SP): `/tmp/claude-0/-home-user-voltagent-chat/eab0dce9-3582-5b50-8fc1-369c85131c50/scratchpad`. v9 lives in `SP/v9/`; scratch work goes in `SP/v9/scratch/`.

This file is the contract. It revises `SP/v9/SPEC.md` after a UX review (critic U) and an engineering review (critic E). §4 lists what changed.

**Scope**
- This rebuilds the *Compare A vs B* tab of the RAM · KORU options lab.
- The Compounding tab (`yr_*.js`) is not touched and must keep working.
- v8 files stay untouched. v9 is a new set of files plus a new build script, `SP/v9/build9.py`. Outputs:
  - `/home/user/short-option-explorer/dist/ram_koru_lab_v9.html` (standalone);
  - `SP/v9/ram_koru_lab_v9_artifact.html` (no doctype, for the artifact).

**Inputs to read first**
- `SP/audit/result.json`: 51 verified findings with their repros.
- `SP/audit/arch.md`: the coupling map and target interfaces. This spec supersedes it wherever they differ.
- The v8 sources: `eng_head6.js`, `eng_state8.js`, `eng_pos8.js`, `eng_dist6.js`, `eng_ctx8.js`, `ui_common8.js`, `ui_cmp8.js`, `app_store8.js`, `app8.js`, `shell8.html`, `build8.py`.
  - `eng_state8`, `eng_pos8`, `eng_dist6` and `eng_ctx8` are **reference only**. They are not bundled in v9.
- Data: `data8.json` (as of 2026-10-01 close; r = 4%; RAM 14.45, 2× leverage; KORU 21.09, 3× leverage; expiries 16 Oct, 20 Nov, 18 Dec, 19 Mar ’27).

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

## 1. Model layer

**Module conventions (all model files)**
- Each file defines **one namespace object** and no other top-level names: `INST` (inst9), `RULE` (rule9), `POS` (pos9), `DIST` (dist9), `CMP` (cmp9), `STATE` (state9), `CTX` (ctx9).
  - The one exception: dist9 keeps v8's `cdfT`, `cdfAt` and `quantAt` verbatim as top-level functions.
- **Pure.**
  - No reads of `st`, `C`, `S9`, the DOM or `D`. The only exception is inst9, which reads the data object it is given through `makeRegistry(D)`.
  - No writes to any input.
  - Every returned snapshot (Instrument, Expiry, Resolved, Built, dist) is frozen.
- **Black-76 helpers** are defined once, in inst9, on top of eng_head6's `bs` and `impliedVol` with S = F·e^{−RT}:
  - `INST.b76(F, K, T, σ, cp)`;
  - `INST.iv76(px, F, K, T, cp)`;
  - `INST.fwdDelta(F, K, T, σ, cp)`.

  Every Δ, σ distance and model price in v9 uses them.

### 1.1 `inst9.js`: the instrument registry

```js
const INST = makeRegistry(D);   // factory: node tests pass synthetic chains (one strike, a gap, a missing expiry)
INST.list()          -> [{id, name, lev}]      // order of D.u. The only reader of D.u in v9; no tickers hard-coded elsewhere
INST.base(id)        -> Instrument             // listed spot, no IV shift
INST.make(slotDef)   -> Instrument             // slotDef = {id, spot?: number, ivShift?: number /* vol points */}
                                               //   memoized by version; returns the same frozen object for the same key
Instrument = { id, name, lev, hv, spot, spotListed, ivShift, overridden: bool, version,
               expiries: [expId...],           // this instrument's own listed expiries, sorted
               exp(expId) -> Expiry | null,
               nearestExp(expId) -> expId }    // nearest DTE; ties go to the longer expiry
Expiry = { id, dte, T, Fpar, g /* ln(Fpar/spot)/T */, Fcarry /* S·e^{rT}, informational only */,
           atm /* σ76(Fpar) + ivShift/100 */, sigma /* atm·√T */,
           smile(K) -> σ76 at K, overrides included,
           rows: [{K, cp, bid, ask, mid, iv /* smile(K) */, ivm /* σ76 implied from this row's mid, or NaN */,
                   delta /* signed forward Δ */, model: bool}],
           strikes: [K...] /* listed, sorted */,
           increment /* modal spacing of listed strikes within ±20% of Fpar */ }
```

Every Expiry field reflects the instrument's overrides: Fpar, smile, atm, sigma and rows.

**Declared forward**
- `Fpar` is computed exactly as v8 `chain()` does:
  - take the pairs where the call and the put both have bid > 0 and mid > 0;
  - sort by |K − spot| and keep up to 3;
  - average `K + e^{rT}(C − P)`;
  - fall back to `S·e^{rT}` when there is no pair or the result is ≤ 0.
- This single forward is used for Δ, moneyness, ATM, σ distance, ITM status, parity and the RN distribution. `Fcarry` is never used in a computation.

**Smile, refitted on Fpar (once, when the instrument is built)**
- The `coef` in `data8.json` was fitted with Black-Scholes on spot (Fcarry). Most of its skew is borrow cost, not vol. On KORU 19 Mar ’27, Black-76 on Fpar with that smile misprices the 10P by +33% and the 38C by −28%, so v9 refits:
  1. Take σ76 from each listed mid that is OTM against **Fpar** (put K ≤ Fpar, call K > Fpar) and has bid > 0.
  2. Fit a cubic in x = ln(K/Fpar), weighted by 1/relative spread.
  3. Run one pass that drops points with |resid| > max(3·wrmse, 0.15). This is the recipe in the data note.
  4. Store `{coef, xlo, xhi, T}` on a **v9-owned** object.
  5. Call `wingAnchors` on that object once, before freezing it. `smile()` writes `_w`.
  6. Evaluate with eng_head6's `smile(obj, K, Fpar)`, so the wing logic is reused.
- With fewer than 5 points, use the flat median σ76.
- `D.u[].exps[].coef`, `D.u[].exps[].atm`, `D.u[].exps[].F` and `D.maxDelta` are not used by v9.
- No v9 code passes a D object to `smile()`, `wingAnchors()` or `chain()`.

**Overrides**
- Strikes and the set of listed `(K, cp)` rows never change. Only prices change. There are no extra strikes beyond the listed grid; a spot that moves past it produces chain-end flags (§1.2).
- **Spot S′** (with or without an IV shift):
  - `Fpar′ = Fpar·S′/S`; the implied carry g stays fixed.
  - The smile is sticky-moneyness: `σ′(K) = σ76(K·S/S′) + ivShift/100`.
  - `mid′ = b76(Fpar′, K, T, σ′(K), cp)`.
  - `bid/ask = mid′·(1 ∓ h)`, where h is **that row's** listed relative half-spread.
  - A row whose model bid is ≤ 0 cannot be sold.
  - Every row is `model: true`. The credit moves from listed to model quotes, and the MODEL_QUOTES flag says so.
- **IV shift only:**
  - `mid′ = mid_listed + [b76(σ76 + shift) − b76(σ76)]`;
  - spreads keep their listed relative size;
  - parity is unchanged, and the result is continuous at shift 0.
- **No-op overrides.** If `|S′ − S| < 1e-9·S` and `ivShift == 0`, the instrument is not overridden: `make()` returns the base snapshot (the same object and version).
- `ivShift` re-prices the entry. Scenario `scen.ivs` is a shock after entry. The UI labels differ: "IV +x pts (re-prices entry)" vs "IV shock".

**Versions and caches**
- `version = id|S.toFixed(6)|ivShift.toFixed(3)|D.meta.asof`.
- Every cache is keyed by version and is an LRU of about 2000 entries.
- D is never mutated (v8 wrote `E._w` into D; v9 must not).

### 1.2 `rule9.js`: placement and structure resolution (pure)

```js
Basis  = "delta" | "money" | "sigma"
Values = { center: number | "atm", put: number, call: number }     // all three always stored, full precision
Wing   = { on: bool, value: number, basis?: Basis }                 // basis is set only by CMP.resolveB (§1.5)
RULE.resolve(exp, structure, basis, values, wings) -> Resolved
Resolved = { put: Leg, call: Leg, wingCall: Leg | null, wingPut: Leg | null,
             kind: "straddle" | "strangle" | "guts", na: "" | reason, flags: [Flag] }
Leg  = { role: "short put"|"short call"|"long call"|"long put", K, cp, row,
         target, achieved: {delta, money, sigma}, snapErr, itm: bool }
Flag = { code, side?: "A"|"B" /* added by cmp9 */, leg?, severity: "note"|"warn", text, fix?: {side, path, value} }
RULE.achieved(exp, K, role)        -> {delta, money, sigma}   // exact, unrounded
RULE.valueAt(exp, K, role, basis)  -> number                  // used by smile clicks, detach and conversion
RULE.range(exp, basis, role)       -> [min, max]              // in basis units, from eligible strikes
RULE.convert(exp, pos, toBasis)    -> {values, wings, flags}
```

**Bases.** σ√T is the position's **own** `Expiry.sigma`.

| Basis | put value | call value | straddle center | wing value (beyond its own short) |
|---|---|---|---|---|
| delta | put \|Δ\|·100 = 100 − callΔ(K) | callΔ(K)·100 | callΔ(K)·100 | \|Δ\|·100 of the long leg |
| money ("% OTM") | (1 − K/Fpar)·100; negative = ITM | (K/Fpar − 1)·100; negative = ITM | (K/Fpar − 1)·100, signed "vs fwd" | call wing at K_short·(1 + w/100); put wing at K_short·(1 − w/100) |
| sigma | −ln(K/Fpar)/σ√T | ln(K/Fpar)/σ√T | ln(K/Fpar)/σ√T, signed | K_short·e^{±w·σ√T} |

- `center: "atm"` means the straddle-eligible strike nearest Fpar on **each side's own chain**, whatever the basis. It is the default center. It stays "atm" through basis switches until the user moves the center slider.
- **Stored values are never rounded.**
  - Slider steps (Δ 1, money 0.5, σ 0.05) apply to drags only.
  - Converted, clicked and detached values keep full precision, so the strike they came from snaps back exactly.
- **Sanitizer bounds:**
  - delta 0.5–99.5;
  - money −90 to 300;
  - sigma −5 to 5;
  - wing value > 0, with a minimum of 0.5 (Δ), 0.5% (money) or 0.05σ (σ).

**Δ convention.** Δ is the **forward delta** on Fpar with the smile at that strike:
- call Δ = N(d1), put |Δ| = N(−d1), with d1 = (ln(Fpar/K) + σ²T/2)/(σ√T);
- call + |put| = 100 exactly, so 50 is exactly Δ-neutral;
- no spot delta and no e^{−rT} factor. One ⓘ line says this.

At these vols the Δ-neutral strike sits 2–43% above the forward. The ATM strike's call Δ is 54–67. The UI therefore never treats 50 as ATM:
- the Δ slider shows an "ATM (58Δ)" tick at the forward strike's Δ (call N(σ√T/2), put N(−σ√T/2));
- a straddle center slider also shows a "Δ-neutral" tick at 50;
- no text may say "above 50 is in the money".

**Eligible strikes**
- Short put: the put row has bid > 0. Short call: the call row has bid > 0.
- Straddle: a K with both a sellable put and a sellable call.
- Long wing: ask > 0.

**Snap in basis units.**
- Each leg takes the eligible strike that minimises |achieved(K, role) − target| on the active basis. On the Δ basis this is v8's nearest-Δ rule, without inverting K.
- Ties:
  - put → lower K;
  - call → higher K;
  - straddle center → nearer Fpar in |ln K/Fpar|, then higher K.

**Crossing is decided from the values**, so it does not depend on the instrument:
- Δ: put + call > 100;
- money and σ: put + call < 0.

Equal targets do not cross. Neither do the values a detach produces (§1.5): they sum to exactly 100, or to 0.

**Straddle.** One strike for both legs, always.
- `"atm"` → the straddle-eligible strike nearest Fpar.
- A number → snap among straddle-eligible strikes; on Δ the call role's achieved value is used.
- No straddle-eligible strike → `na: "no strike with both a put and a call bid"`.

**Strangle**
1. Snap both legs.
2. If they **do not cross** and the snapped put ≥ the snapped call, widen:
   - candidates are put = the largest eligible put strictly below the snapped call, and call = the smallest eligible call strictly above the snapped put;
   - take the candidate with the smaller added |snapErr|; on a tie, move the put; if only one can move, move it;
   - flag `WIDENED` (note): "kept a strangle: put 14 (both legs snapped to 15)".
3. If neither leg can move: kind = straddle, flag `ONE_STRIKE` (warn): "only one usable strike, cannot form a strangle".
4. If the values **cross** and the snapped strikes are equal: widen into a guts the same way, with flag `WIDENED`.
5. `kind` always comes from the final strikes:
   - put < call → strangle;
   - put = call → straddle;
   - put > call → guts.

On the real data, collisions occur at 47–49Δ on RAM 16 Oct, 20 Nov and 19 Mar.

`legs` ("together" / "detached") does not affect resolution. It only changes the controls and the sweep (§1.5, §2.3).

**Every leg reports `snapErr`** (achieved − target on the active basis). At most one of these flags applies to a leg:
- `CHAIN_END` (warn): the target lies beyond the achieved value of the outermost eligible strike, at the **OTM end or the ITM end**. The leg snaps to that end strike. Example: "call 30Δ is beyond the chain: 38C is the last listed (24Δ)".
- `GAP` (note): |snapErr| > tolerance, and the two eligible strikes either side of the target are more than 1.5× `Expiry.increment` apart. Example: "no 22–24P listed; 21P 74.5Δ, 25P 85.5Δ".
- `FAR` (note): |snapErr| > tolerance otherwise, i.e. a coarse grid. Example: "30Δ → 24Δ: nearest strikes 16C 24Δ, 15C 36Δ".

Tolerances: Δ 5, money 2.5 percentage points, σ 0.10.

**Slider ranges**
- `RULE.range` returns [min, max] in basis units over the eligible strikes for that role; for the center role it uses straddle-eligible strikes.
- With legs together, the shared control's range is the intersection of the put range and the call range, shifted by the offset between them. At the stop, the note names the leg that stops.

**Wings**
- **Candidates** are eligible long strikes strictly beyond the resolved short of the same type:
  - call wing: K > short call;
  - put wing: K < short put.
- **Outcomes**

  | Situation | Result | Flag |
  |---|---|---|
  | No candidate | The wing is n/a. The position is built and shown **without** it; `na` stays "" | `WING_NA` (warn) |
  | Target beyond the last candidate | The end strike | `CHAIN_END` (warn) |
  | Δ target at or inside the short (wing Δ ≥ the short's achieved Δ) | The first candidate beyond the short | `WING_INSIDE` (note) |

- With both wings on a strangle the position is an iron condor. The label still names its parts (§1.3).

**ITM status** comes from the chosen strike against **Fpar**: put ITM iff K > Fpar, call ITM iff K < Fpar. It never comes from a target.

**Basis conversion** (`RULE.convert`). Each stored value becomes the **unrounded** achieved value, on the new basis, of the strike it resolves to now on that side's own chain:
- center, put and call are resolved as their own structure, even the one not in use;
- wings use the current structure;
- `"atm"` stays `"atm"`;
- a wing with no candidate converts through its continuous target strike K* (bisection on the smile; if there are several roots, the one nearest Fpar). If that fails, it resets to the basis default (Δ 15, 10%, 0.5σ) with flag `CONVERT_RESET` (note).

### 1.3 `pos9.js`: building a position (pure)

```js
SlotDef  = { id, spot?, ivShift? }
Position = { inst: SlotDef, exp: expId,
             structure: "straddle" | "strangle",
             legs: "together" | "detached",          // read for a strangle only
             basis: Basis,
             values: { center: number | "atm", put: number, call: number },
             wings: { call: Wing, put: Wing },
             fill: "mid" | "nat" }
POS.price(inst, expId, legs: [{role, K}], fill) -> Priced    // pure; no targets involved
POS.build(pos) -> Built        // RULE.resolve, then POS.price. Memo key: JSON(canonical pos)|inst.version
POS.val(b, x, tau, shock)      // shock = {ivs, svs, svd}, passed in from S9.scen
POS.payoff(b, x)
POS.legsAt(b, x, tau, shock)
```

- **Invariant.** Two positions that resolve to the same legs and fill give deep-equal pricing, whatever their values, basis or targets.
- `POS.build(pos, {expMap} = {expMap: "nearest"})` maps an expiry the instrument does not list (§1.5): to the nearest DTE with `EXP_MAPPED` (warn), or `na` with `EXP_NA`. `expMap` is part of the memo key. Stored expiry values are never rewritten.

**`Built` compatibility contract.** The v8 views are adapted to this contract.

**Kept with their v8 meaning**
- `sp`, `sc`: rows `{K, cp, bid, ask, mid, iv, ivm, d /* signed forward Δ */, model}`.
- `S`, `T`, `dte`, `exp` (the resolved expiry), `tk` (= instrument id, for display only).
- `cr`, `crS`, `intr`, `tv`, `iP`, `iC`, `exitCost`, `margin`, `straddle`, `guts`.

**Changed**

| Field | v9 meaning |
|---|---|
| `F`, `Fimpl` | both = Fpar; new `Fcarry` |
| `E` | the frozen v9 Expiry |
| `sig` | `E.sigma` |
| `vega` | Black-76 vega on Fpar |
| `key` | includes the instrument version |
| `itmP`, `itmC` | by strike against Fpar |
| `cap` | the call-wing row; new `capP` is the put-wing row |
| `capPx` | call-wing debit; new `wingPx` is the total wing debit |
| `capFb` | always false |
| `inv` | true when `WIDENED` is set |
| `na` | true only with no usable shorts or an unmapped expiry |
| `capNA` | replaced by `naReason`. ui_cmp8 lines 83, 304, 364, 398, 511, 623 and 659 read `naReason`. A wing n/a is a flag, not `na` |

**Dropped:** `P`, `U`, `parP`, `parC`, `adjSp`, `adjSc`, `adjCap`. They become internal to `POS.val`.

**Added**

```js
legs: [{ role, cp, K, qty: -1|+1, bid, ask, mid, fillPx,
         perContract /* fillPx·100, signed: + credit for shorts, − debit for longs */,
         iv, delta, money, sigma, itm, intrinsic, timeValue, quotePremium, model }]   // ascending strike
net:  { perShare, perContract /* + credit, − debit */, isDebit, pctOfSpot }
kind, flags,
label: { short: "RAM 16 Oct", kindWord: "straddle"|"strangle"|"guts",
         struct: "short straddle 15" | "short strangle 21.5 / 22" | "short guts 22P / 21C",
         wings: "" | "+ 25C wing" | "+ 9P wing" | "+ 9P & 25C wings",
         full: "RAM 16 Oct · short straddle 15 + 25C wing",
         tab: "RAM straddle 15" }
```

- Every place that names a position uses `built.label`: summary, dock, legends, overview, sweep, notes and `document.title`.
- Labels always carry every strike.
- There is never "ATM/ATMΔ" text and never a Δ unit after the word ATM.

**Pricing**
- **Fills always use the leg's own quote**, listed or model: the mid, or bid/ask at natural (sell at the bid, buy at the ask). This matches v8 `crS`.
- **Marks** (`POS.val`):
  - **OTM legs:** Black-76 on `F(x, τ) = x·e^{gτ}` at `σ′(K; x) + adj`. σ′ is sticky-moneyness against the moved forward, as v8 `ivAt` does. `adj` pins the entry mark to the leg's **mid**.
  - **ITM legs** (against Fpar) whose OTM twin has bid > 0: the twin's mark (pinned to the twin's mid), plus parity on `F(x, τ)`, plus `quotePremium·(τ/T)`, where `quotePremium = mid_ITM − parityValue_entry`.
    - The premium decays to 0 at expiry.
    - It is shown per leg in Legs in detail as "quote premium over parity".
  - **No IV pins the mid** (mid below the model floor): use the same decaying additive residual, with flag `NO_IV_PIN` (note).
- **Entry P&L**
  - mid fill: exactly 0 per leg;
  - natural fill: exactly −(ask − bid) per leg (sell at the bid, mark at mid, close at the ask). This is v8's `exitCost` convention; the ⓘ states it.
- **Intrinsic vs ITM status.** Intrinsic and time value are measured against **spot**. ITM status is measured against **Fpar**.
  - When the two disagree, both are shown.
  - A call with Fpar < K < S is OTM with intrinsic > 0. It gets `EARLY_ASSIGN` (note). So does any leg that is ITM against spot with time value < max(0.05, K·(1 − e^{−rT})).
- `BELOW_INTRINSIC` (note): mid < intrinsic.
- `exitCost`, `intr`, `tv` and `vega` include both wings.
- **Margin**, Reg T leveraged-ETF rules with `inst.lev`, symmetric. It reproduces v8 exactly when only a call wing exists. A straddle is a strangle with one strike.

  ```
  f20 = min(1, 0.2·lev), f10 = min(1, 0.1·lev)
  rPn = sell(sp) + max(f20·S − max(0, S−Kp), f10·Kp)
  rCn = sell(sc) + max(f20·S − max(0, Kc−S), f10·S)
  rP  = putWing  ? min(Kp − Kwp, rPn) : rPn
  rC  = callWing ? min(Kwc − Kc, rCn) : rCn
  margin = rP >= rC ? rP + sell(sc) − buy(callWing) : rC + sell(sp) − buy(putWing)
  ```

- `POS.val`, `POS.payoff` and `POS.legsAt` iterate `b.legs`. Nothing reads `st`. A put wing therefore appears in P&L, odds, worst loss and strike lines.

### 1.4 `dist9.js` and statistics (pure)

**Distributions**
- `DIST.make(expiry, spot, mode, hv, hvk)` replaces eng_dist6's `dist()`, which read `st` and wrote `E._w` onto D.
  - Key: `version|exp|mode|hvk`.
  - In RN mode, Breeden–Litzenberger runs on Black-76 calls on **Fpar** with `Expiry.smile`, so the mean is Fpar.
  - HV mode is as in v8.
- `cdfT`, `cdfAt` and `quantAt` are copied verbatim.

**Statistics.** `POS.stats(b, dist)` is generic:
- Sort all leg strikes and walk the piecewise-linear payoff to find every zero crossing. Those crossings are the breakevens; "none" when there is no crossing.
- `pop` = the distribution mass where payoff > ε, with ε = 1e-9·S. A P&L of exactly 0 is not a profit.
- EV under RN = net credit − Σ qty·mid over all legs, wings included. EV under HV integrates the payoff.

This one algorithm covers:
- net debits: odds 0% and breakevens "none" when the position cannot profit;
- a guts with a wing below the put;
- iron condors;
- the exact-gap case.

### 1.5 `cmp9.js`: the comparison model (pure)

```js
Comparison = {
  A: Position,
  B: { inst: SlotDef, ...own values per aspect },   // absent until first set; kept while linked (the "stash")
  links: { inst: false, exp: true, structure: true, legs: true, placement: true,
           wingCall: true, wingPut: true, fill: true },
  expMap: "nearest" | "same",
  sizing: { rule: "auto"|"notional"|"credit"|"vega"|"loss"|"margin"|"custom", h },
}
// every mutator is pure: (c, ...) -> { c: newComparison, events: [Event] }
Event = { type: "unlinked"|"restored"|"linked"|"swapUnlinked"|"identical"|"migrated", aspects, text, actions: [{label, apply}] }
CMP.defaults(list) -> Comparison
CMP.resolveB(c) -> Position
CMP.link(c, aspect) / CMP.unlink(c, aspect)
CMP.setA(c, path, value) / CMP.setB(c, path, value)
CMP.detach(c, side)          // requirement 4 on a straddle
CMP.setFrom(c, side, {inst?, exp?, wings?})   // the overview's "Set as A/B"
CMP.relinkAll(c)
CMP.swap(c)
CMP.diff(c, bA, bB) -> { items: [DiffItem], identical: bool, onlyInstrument: bool }
DiffItem = { aspect, text, asked: bool, side?, relink: bool, dockRow }
```

**Aspects.** `resolveB` and `setB` use exactly this table.

| Aspect | Paths | Linked by default |
|---|---|---|
| inst | `inst` (with its overrides) | **no** (requirement 2) |
| exp | `exp` | yes |
| structure | `structure` | yes |
| legs | `legs` | yes |
| placement | `basis`, `values.center`, `values.put`, `values.call` | yes |
| wingCall | `wings.call` (on, value) | yes |
| wingPut | `wings.put` (on, value) | yes |
| fill | `fill` | yes |

- **Basis and values are one aspect (`placement`).** Basis-unlinked with values-linked would read A's "30" as 30σ on B, so it cannot be expressed.
  - Unlinked: B has its own basis and values. It starts from A's, or from its stash.
  - With different bases there is nothing to share.
- **Values across structures.**
  - Every Position stores `center`, `put` and `call`. The structure decides which are read.
  - With placement linked and different structures, B reads A's stored field for **B's** structure. For example, a B strangle facing an A straddle uses A's stored put/call (default 30/30Δ).
  - In the dock, A's column then shows that field as one muted extra row, "strangle values 30 / 30 (used by B)". It is editable and changes only A's storage.
  - Switching structure back and forth restores that structure's stored values.
- **Linked wings carry A's basis.** `resolveB` returns `wings.call = {...A.wings.call, basis: A.basis}`. A linked wing on a B with its own basis is therefore resolved with A's basis and value, beyond B's own short.

**Link and unlink**
- `unlink(c, aspect)` sets the link false.
  - If B holds its own value for that aspect and it is still valid on B's instrument (for example, the expiry is listed), that value is **restored**. Event `restored`: "restored B's 20Δ", with the action "start from A instead".
  - Otherwise B gets a copy of what it **currently resolves to**, so B does not move:
    - expiry: the mapped date;
    - placement: A's basis and values;
    - wing: A's on/value, converted into B's basis from B's resolved wing strike when the bases differ;
    - instrument: A's slotDef.
- `link(c, aspect)` sets the link true and **keeps** B's own value as the stash. Event `linked`, with the action "undo".
- `setB(c, path, value)` on a linked aspect is an implicit unlink. It always **copies what B currently resolves to** (never the stash), applies the change and emits `unlinked`: "B's strikes are now set on their own", with the action "↺ relink".
  - It never touches any other link.
  - A smile click on B's chain is an implicit unlink of placement only.
- `setA` never changes links. If the change leaves A and B identical, it emits `identical`. The change is allowed.
- `setFrom(c, side, {inst, exp, wings})` (the overview's "Set as A/B") calls setA/setB **only for the aspects whose value differs** from that side's current resolved value.
- `relinkAll` links every aspect except `inst`. It is "make B = A" in the strip menu.

**Detach (requirement 4).** `detach(c, side)` acts on a side that resolves to a straddle at strike K and sets:
- `structure = "strangle"`;
- `legs = "detached"`;
- `values.put = RULE.valueAt(exp, K, "short put", basis)` and `values.call = RULE.valueAt(exp, K, "short call", basis)`.

These values do not cross (they sum to 100, or 0), so both legs snap to K and the strangle rule widens one leg: a flat top. The stored `center` is kept.
- On **A**: no link changes. A linked B follows: it becomes a strangle, detached, on A's new put/call values.
- On **B**: this is the one deliberate exception to "one aspect at a time". The gesture changes structure, legs and placement together, so it unlinks exactly those three, copying B's current resolution first.
  - Placement must unlink too: otherwise B would read A's stored strangle values and not be a flat top at B's own strike.
  - Event `unlinked`, listing the three, with the actions "↺ relink placement" and "↺ relink all three".

**Legs**
- **Together:** one control moves both legs by the same increment and keeps their offset.
  - Re-joining never re-strikes a leg.
  - The sanitizer does not force put = call.
  - A row ⓘ menu offers "make symmetric".
- **Detached:** the two legs move independently.
- Only the controls depend on `legs`, never the resolution.

**Swap.** `swap(c)` is called through `STATE.swap(S9)`:
- It exchanges A and B, own values included, and the instruments (a no-op on them when `inst` is linked).
- It keeps the colours: A stays purple and on the left.
- With a custom sizing rule, `h → 1/h`.
- Every pin swaps `SA ↔ SB` and `dA ↔ dB`.
- Swap unlinks a linked aspect whose swapped B would not resolve to the same strikes or date (an expiry mapped to the nearest one, or a wing carried on another basis). It stores the old value and emits `swapUnlinked`.
- Test: swap∘swap gives the same resolved A and B legs and the same h and pins.

**Expiry mapping.**
- `expMap: "nearest"` (default): B on an instrument that lacks A's date takes the nearest DTE, with `EXP_MAPPED`.
- `"same"`: B is n/a with `EXP_NA`.

**One-click fixes are data:** `fix = {side, path, value}`, applied through setA or setB of that side only. A fix on B never changes A.

**`diff(c, bA, bB)`**
- **`identical`:** same instrument id and version, same resolved expiry, every leg's strike and role, and the same fill.
- **`onlyInstrument`:** not identical, every non-instrument aspect linked, and no amber item.
- **No item is ever emitted for the instrument itself**: line 1 already shows it.
- **Neutral items** (`asked: true`, `relink: true`) are emitted for:
  - every unlinked aspect whose resolved values differ;
  - an override on either side's instrument (spot or IV): "B spot +10% (override)", with `relink: false`.
- **Moot aspects are skipped:**
  - legs, when either side resolves to a straddle, or while B's placement is linked;
  - a wing's value, when that wing is off on both sides.
- **Amber items** (`asked: false`), each with its text. One item per cause, naming the side:
  1. structure linked but the kinds differ (strangle vs guts, or `ONE_STRIKE`): "! B resolved to guts 22P / 21C";
  2. structure linked and `WIDENED` on one side only: "! B: put widened to 20.5 to keep a strangle";
  3. a wing that is on resolves n/a, on either side: "! B: call wing n/a (no strike above 38C)";
  4. `CHAIN_END` on either side: "! A: call at chain end 38C (24Δ)";
  5. the expiry mapped: "! B has no 16 Oct: using 20 Nov";
  6. placement linked, and a leg's achieved values on the active basis differ between A and B by more than max(tol, ½ × the larger local strike spacing on that basis). tol is Δ 3, money 1.5 points, σ 0.10. The local spacing is the gap between the listed strikes either side of the resolved strike, expressed on the basis. Example: "! put 24Δ vs 31Δ";
  7. a wing linked and on, whose width (short → long) in σ units differs by more than 1.5×: "! call wing 0.4σ vs 1.1σ wide";
  8. one side a net debit while the other is a credit: "! B is a net debit".

  The default RAM-vs-KORU comparison (20 Nov, 30/30Δ) must produce no amber item. With Fpar-consistent Δ the achieved values are roughly 32/29Δ (RAM 13P / 20C) vs 30/30Δ (KORU 18P / 30C).

**Default comparison.** `CMP.defaults(INST.list())`:
- A = `list()[0]` and B = `list()[1]` (or `[0]` with a single instrument), both at listed spot;
- expiry = the first expiry listed by **both** with DTE ≥ 30 (else the longest common one, else A's first);
- structure strangle, legs together, basis Δ, values `{center: "atm", put: 30, call: 30}`;
- wings off, with values Δ 15;
- fill mid, sizing auto;
- every link true except `inst`; `expMap: "nearest"`.

On today's data this gives RAM vs KORU, 20 Nov, 30/30Δ strangles, the same as v8's default.

### 1.6 `state9.js` and `ctx9.js`

```js
S9 = { cmp: Comparison,
       scen: { unit, rlo, rhi, rlink, wl, wlo, whi, dist, hvk, ivs, svs, svd, align },
       view: { units, ovm, ovv, gview, gval, gtab, nm, nd, gl, ct, cts, ovk, ovc, ovb, ovs, ovo, pso, pss,
               cs, cr, crx, shared, sweep, jday, pins: [{SA, SB, dA, dB}], dock, theme, rdHit, rdK, rdDir, rdL,
               rdBase, rdCap, rdG, rdGc } }
STATE.sanitize9(o) -> S9                 // one sanitizer per part
STATE.applyChange(S9, fn) -> S9          // fn edits a copy; then sanitizers and the normaliser run
STATE.migrate(code | blob) -> {S9, events}
STATE.swap(S9) -> {S9, events}
CTX.ctx9(S9) -> C                        // pure
```

**Normaliser.** v8 `ensureUnit` and the range clamps in `context()` move into a normaliser that runs after every change to cmp or scen. `ctx9` only reports `clampNote`. It never writes.

**Sweep.**
- `sweep` values are `both | put | call | wingCall`.
- It varies on the current basis.
- "Both" shifts both legs with their offset kept. It marks the actual position, whether the legs are together or detached.

**`ctx9(S9) → C`** has the same fields as v8's `C`: `A, B, Ap, Bp, h, same, unit, ax, toSA, toSB, uOfSA, uOfSB, lo, hi, wlo, whi, sameExp, cal, Hd, d, dB, sa, sb, rule, clampNote`, and so on. It adds:
- `diff`, `labels`, `flags`;
- the bound helpers that eng_ctx8 used to provide (eng_ctx8 is not bundled): `stats`, `worstIn9`, `axis`, `uStep`, `uRound`, `rangeCaps`, `uLab`, `hRatio(rule, A, B, sa, sb, h)`, `vA`/`vB`/`pA`/`pB`/`xA`/`xB`, `fU`/`fUt`, `unitName`, `hTxt`.

`C.Ap` and `C.Bp` are v9 Positions, resolved for B. No view reads the v8 fields `tk`, `st`, `pd`, `cd` or `capd` from them.

`C.same` = same instrument id **and** same version. The price unit (v8 `pts`) requires `same`.

**σ conventions**, one table. Labels say which σ is meant.

| Use | σ |
|---|---|
| Move axis: payoff x, grid columns, worst-loss range, joint axes, move-range inputs, pins, ±kσ marks | axis σ = each instrument's ATM at **A's horizon T_A** |
| Strike placement (σ basis), sweep x on the σ basis, line 3 of the summary | the position's own `Expiry.sigma` |
| Recovery "kσ hit", grid odds cones and strips | the position's own distribution and expiry; calendar alignment uses t = min(d, dte)/365 |

Axis σ for B:
- If B lists A's expiry, use B's ATM there.
- Otherwise interpolate B's total variance atm²·T linearly in T between the expiries either side, flat beyond the ends. This removes v8's crash path.
- `ivShift` is included.

When A and B have different expiries:
- the summary's σ reads "0.33σ to 19 Mar";
- the chart axis reads "σ over A's 15 days";
- one ⓘ states the rule.

When the expiries are equal, the label is plain "σ".

**Persistence**
- Copy the shell to `app_store9.js` / `app9.js`.
  - Blob: `{v: 9, tab, theme, cmp: S9, yr}` in `localStorage["rk-lab-v9"]`.
  - Hash: `#v9.` + code.
- On first load with no v9 blob, read `rk-lab-v8`, then `rk-lab-v5`, and migrate. **Never write the old keys**: the v8 page stays deployed.
- `#v8.` and `#v5.` codes load through migration. `yr` carries over unchanged.
- **`hashchange`.**
  - Ignore it when `location.hash.slice(1) === lastCode` (our own `replaceState`).
  - Otherwise load the code, toast "View loaded" and re-render.
  - A bad code toasts and keeps the current state.

**Migration from v8**

| v8 keys | S9 destination |
|---|---|
| `A`, `along`, `bexp`, `bk`, `Bf`, `link`, `linkB` | `cmp` |
| `size`, `hc` | `cmp.sizing.{rule, h}` |
| `unit`, `rlo`, `rhi`, `rlink`, `wl`, `wlo`, `whi`, `dist`, `hvk`, `ivs`, `svs`, `svd`, `align` | `scen` |
| everything else | `view` |

Value maps:
- `sweep`: `pd → put`, `cd → call`, `capd → wingCall`.
- `ovm`: `capc`/`capp` → their wing equivalents.
- v5 `nm` 8/12/16/24 → the nearest of 9/13/17/25.
- pins `{S: {RAM, KORU}, dA, dB}` → `{SA: S[A.tk], SB: S[B.tk], dA, dB}`.

A v8 position maps to:
- basis Δ, `values.put = pd`, `values.call = cd`, `center: "atm"`;
- `structure: "strangle"` and `legs = link && pd === cd ? "together" : "detached"`;
- `st: "cap"` → `wings.call = {on: true, value: capd}`.

Exception: `pd = cd = 50` with link → `structure: "straddle", center: "atm"`, which keeps v8's "nearest the forward" meaning.

| v8 `along` | v9 |
|---|---|
| tk | B instrument = the first id in the list ≠ A's; nothing else unlinked |
| st | `wingCall` unlinked, B's call wing on = !A capped, value = A.capd |
| exp | `exp` unlinked, `B.exp = bexp`. If `bexp === A.exp`, use the next longer expiry (the next shorter for the longest). **Never wrap** |
| k | `placement` and `legs` unlinked from `bk`; `B.legs = linkB && bk.pd === bk.cd ? together : detached`. If A is capped and `bk.capd ≠ A.capd`, also unlink `wingCall` with value `bk.capd` |
| fill | `fill` unlinked, the opposite of A's |
| free | every aspect unlinked from `Bf` |

- v5 codes (no `linkB`): `linkB := link`. A side with pd ≠ cd loads detached.
- Any migrated load emits `migrated`: "Loaded a v8 view: strikes re-resolved with v9 rules". v9 picks the same strikes as v8 in only about 55% of linked targets.

---

## 2. UI, rebuilt: `ui9_summary.js`, `ui9_dock.js`, `ui9_views.js`

### 2.1 Common rules

**Type scale (Compare tab)**

| Tier | Size |
|---|---|
| Identity (summary line 1 only) | 21px semibold, `var(--f-cond)` (IBM Plex Sans Condensed, already loaded) |
| Section titles (panel titles) | at most 15px/600 |
| Per-leg prices | 14–15px |
| Labels | 12px |
| Fine print | 11px |

- Nothing on the Compare tab except line 1 exceeds 15px.
- The dock header "Positions" is 14px.

**Colours**
- A = purple key, B = orange key (v8 tokens).
- New tokens `--diff-warn` (amber) and `--debit`, defined for light and dark.
  - `--diff-warn` sits at least 30° of OKLCH hue away from `--b`, so amber never reads as "about B".
  - Both have text contrast ≥ 4.5:1 against the surface. A build-time check confirms both rules.
- An amber item always carries a "!" glyph and names its side.
- A debit is always spelled out ("net debit $12"), never shown by colour alone.

**Words**
- "Linked" means A↔B only. Legs are "together / detached".
- The A↔B toggle is an inline SVG chain, with a broken-chain state. Tooltips: "B follows A" / "B set on its own". No emoji.
- Never use wrinkle, seam or smell. The build checks this.

**Layout**
- Desktop from 1200px. No horizontal scroll at 1200.
- Use inline span grouping. Flex or grid only where a row truly needs alignment: the dock table and the summary's card pair.

**Events → toasts.** Every cmp9 event becomes a 4-second toast with its actions.

**`document.title`** = "RAM straddle 15 vs KORU strangle 21.5/22" (from `label.tab`).

### 2.2 Fixed comparison summary (`ui9_summary.js`)

It replaces v8's chip row and row 2. It is sticky under the tab strip and **spans the full window width**; the dock starts below it.

```
[A card ......................................]  vs ⇄  [B card ......................................]
[pills · notices ...........................................]   [Move −2σ … +2σ  σ | % | price  ▾]
```

**Cards.** At 1200 each card is about 556px wide, with a 4px left border in the key colour.

**Line 1, identity (21px).**
- Content: `RAM` · `20 Nov` · glyph · `short strangle 13 / 20` · wing part.
- An overridden instrument shows a 12px span after the ticker: "✎ 23.20 · IV +10".
- **Glyph:** an inline 28×16 SVG in the key colour that mirrors the payoff shape:
  - peak for a straddle;
  - flat top for a strangle;
  - raised flat top for guts;
  - tails clipped for each wing.
- Worst case ("KORU 19 Mar ’27 · short strangle 21.5 / 22 + 9P & 33C wings") must fit one line at 1200. If it does not in the browser, step line 1 to 20px. **Never wrap.**

**Line 2, prices (14px, tabular numbers).**
- Every leg in ascending strike, then the net:
  - `9P wing −$4   13P +$85   20C +$92   25C wing −$10   ·  net credit $163`.
- The net is 15px/600. A net debit reads "net debit $12" in `--debit`.
- A wing that is n/a shows in place as "call wing n/a" (amber).
- Then 12px: "· 11.3%" (net as % of spot; title "net as % of spot") and "· mid" or "· natural".
- On B only, also "· ×1.02", with an ⓘ "B contracts per A contract · equal vega" (the active rule's name).
- One ⓘ at the end of A's line 2 says: "$ per contract (100 shares). B's figures are per B contract, before ×h." No "/contract" token appears elsewhere.

**Line 3, placement (12px muted).**
- Strangle: "Δ 30 / 30 → 32Δ / 29Δ · 10.0% / 38.5% OTM · 0.25σ / 0.77σ · 50 d".
- Straddle at "atm": "ATM · strike +0.4% vs fwd · +0.01σ · put 42Δ / call 58Δ · 50 d".
- Straddle at a numeric center: "center 61Δ → 61Δ · strike −2.1% vs fwd · …".
- When |Fpar/S − 1| > 1%, add "fwd 19.96 (spot 21.09)".
- The σ suffix "to 19 Mar" appears when the expiries differ (§1.6).
- Then flags: notes muted, warns in `--diff-warn` with "!".
- No ITM tag on straddle legs here; one leg is always ITM. That lives in Legs in detail.

**Highlighting differences**
- On lines 1–2, the differing token (expiry, structure word with its glyph, wing part, fill) gets a 2px underline:
  - neutral ink for an asked difference;
  - `--diff-warn` for an unasked one.
- **Pills** on the bottom row:
  - every amber item, with its full text; clicking it opens the dock and scrolls to that row;
  - a neutral pill only for aspects with no token on lines 1–2: placement, legs, overrides. Neutral pills carry "↺" (relink).
- If any aspect is unlinked, "↺ all" appears at the end of the pills (`CMP.relinkAll`).
- If the pills overflow, show the first ones and "+3 ▾".
- **Notices** (muted, in place of pills):
  - "A and B are the same trade" when `identical`;
  - "same position, only the instrument differs" when `onlyInstrument`.

**Between the cards:** "vs" (12px) and the swap button ⇄.

**Move range (right of the bottom row, 12px):**
- "Move −2σ … +2σ" with two compact inputs, and the seg "Move axis: σ | % | price".
- Symmetric, the price-range readouts and Reading go into one "▾" popover.

**Height budget:** ≤ 150px at 1200 and ≤ 130px at 1440. Expected: about 115px (three lines ≈ 80px plus the bottom row ≤ 28px).

### 2.3 Side panel ("Positions", `ui9_dock.js`)

About 360px wide. It sits below the sticky summary and scrolls on its own. It is collapsible as in v8.

**Discrete aspects: a table of A | link | B**

| Row | A cell | Link | B cell |
|---|---|---|---|
| Instrument | ticker select + "spot/IV ▾" (spot, IV shift, reset) | chain, default **broken** | the same |
| Expiry | select (own expiries, with DTE) | chain | own select; ▾ "If B lacks A's date: nearest DTE / mark n/a" (`expMap`) |
| Structure | Straddle \| Strangle | chain | |
| Legs | strangle: together \| detached, row ⓘ menu "make symmetric"; straddle: "Detach legs" button | chain | the same controls for B |
| Strikes by | Δ \| % OTM \| σ | chain (placement) | |
| Protective call | off \| on | chain | |
| Protective put | off \| on | chain | |
| Fill | mid \| natural | chain | |

- **Linked B cell:** shows **B's resolved result** in muted type, never A's target. Example: "= A · 18P / 30C · 28Δ / 30Δ". It turns amber when diff marks that aspect unasked.
- **Unlinked B cell:** B's own control appears, starting from A's resolved value or from B's restored stash.
- **Implicit unlinks:** the neutral pill appears in the summary and the toast offers "↺ relink".

**Sliders: full-width rows**
- Below "Strikes by":
  - A's slider(s): center for a straddle; one "put & call" control for legs together (readout "30 / 30"); a put slider and a call slider when detached.
  - Then B's line beneath: "= A · 18P / 30C · 28Δ / 30Δ", or B's own full-width slider(s) when placement is unlinked.
- When B reads an A field that A does not use (§1.5), that field appears as one muted extra slider row under A: "strangle values 30 / 30 (used by B)".
- Wing sliders appear under each wing row when that wing is on on either side, in the same A-then-B layout.
- **Each slider readout:** target → achieved strike and value, e.g. "30Δ → 13P 32.3Δ".
- **Ticks and stops:**
  - Δ sliders: "ATM (58Δ)". A straddle center also gets "Δ-neutral" at 50.
  - When placement is linked, A's slider also shows a tick where B's chain ends.
  - Stops come from `RULE.range`, with a note naming the end strike and its value. With legs together, the stop note names the leg that stops.

**Collapsed sections below the table**
- **"Legs in detail ▾":** one line per leg for A and B:
  - strike and cp;
  - quote bid / mid / ask and the fill;
  - IV, Δ, moneyness, σ;
  - ITM against the forward, and intrinsic against spot when they disagree;
  - intrinsic / time value and the quote premium over parity;
  - flags.
- **"Pair sizing ▾"** as in v8.

**Clicking a smile quote** puts the leg that the clicked side and strike imply on **exactly** that strike.
- It sets the value to the clicked strike's **unrounded** achieved value on the current basis. Test: resolving it gives back that strike.
- The row must be eligible for the role; otherwise the click is refused with the reason.
- For a straddle, the strike must be straddle-eligible; the click sets the center.
- With legs together, the clicked leg lands exactly and the other leg follows by the same increment. The toast offers "detach legs to move only this leg".
- On B's chain the click goes through `setB`, which unlinks placement only.

### 2.4 Views (`ui9_views.js`): payoff, P&L grid, joint, sweep, smile, overview, recovery, notes

- Reuse the v8 view code from `ui_cmp8.js`, adapted to read only `C`, `S9.scen`, `S9.view` and INST. There are no `D.u` reads and no hard-coded tickers. The ticker sites listed in arch.md §2 (lines 207, 223–224, 299, 594, 651) read `INST.list()` and `inst.lev`.
- **Every strike or leg loop uses `b.legs`:**
  - payoff kinks (v8 line 333);
  - worst loss (382) and `worstIn`;
  - grid lines (559);
  - joint (698);
  - the smile panel (776–789);
  - `legTxt`.
- **Functions that read the v8 position fields are rewritten:** `pName`, `posShort`, `dTxt`, `kindName`, `posName`, the sweep's `run` / `cur`, the overview's `isA` / `isBcell` / `desc` / `nm`, `openLegPop`, `capFix` / `capFixFor` and the editors. `setAlong`, `swapAB`, `strikeOwner` and the `along` branches are deleted.
- **View-level findings fixed:**
  - straddle labels everywhere;
  - the "EV (HV30)" column uses HV statistics in both odds modes;
  - debit and guts odds (§1.4);
  - the recovery headline uses ceil(n)·days/7;
  - "× credit" units, when A's time value or credit is ≤ 0, say they show % of notional, or are disabled with that reason;
  - calendar-alignment odds use t = min(d, dte);
  - the sweep handles detached legs;
  - the comparison table's A/B column keys stick just below the summary;
  - recovery cells wrap or stack at 1200 without overprinting.
- **Overview:** positions are named by `label`. "Set as A/B" calls `CMP.setFrom` (instrument, expiry, wings).
- **Sweep:** varies on the current basis, with Δ / % / σ on the x axis; it shows the legs as together or detached.
- **σ labels** follow §1.6.

---

## 3. Process and quality bar

### 3.1 Build (`build9.py`)

**Bundle order**
1. `"use strict"`
2. app_store9
3. eng_head6
4. dist9
5. inst9
6. rule9
7. pos9
8. cmp9
9. state9
10. ctx9
11. ui_common8
12. ui9_summary
13. ui9_dock
14. ui9_views
15. the Compounding yr files, unchanged, with their YR stub logic as in build8
16. app9

Shell: `shell9.html`. Data: `data8.json`.

**The build fails if:**
- any v9 module except inst9 matches any of:
  - `\bD\.u\b`;
  - `\b(TKS|EXPS)\b`;
  - `["'](RAM|KORU)["']`;
  - `\bst\.`;
  - a bare call `(^|[^.\w$])(smile|wingAnchors|chain|maxDelta|build|dist|val|legPx|ivAt|statsBase|context)\(`;
- a v9 module declares a top-level name other than its namespace object (dist9's three cdf functions are allowed);
- any UI string contains wrinkle, seam or smell;
- in either theme, `--diff-warn` is less than 30° of OKLCH hue from `--b`, or `--diff-warn` / `--debit` has text contrast below 4.5:1 against the surface.

**The app9 ↔ UI contract is explicit:** `cmpWire`, `renderAll`, `renderNotes`, `refresh`, `RAF`, `getS9` / `setS9`, `sanitize9`, `migrate`.

### 3.2 Node tests (`SP/v9/test/*.js`)

| ID | What it checks |
|---|---|
| T1 | `deepFreeze(D)` before loading the model. Every model test runs, and any write throws (strict mode). |
| T2 | `deepFreeze(S9)`; `ctx9(S9)` and every view data function run without writes. |
| T3 | σ76 refit: ≥ 90% of OTM rows repriced within max(half-spread, 3% of mid); call Δ non-increasing in K across [minK, maxK] on all 8 chains; the smile is continuous at Fpar. |
| T4 | Overrides: `make({id, spot: listed}) === base`. Spot +10% gives a parity forward from model mids equal to `Fpar·1.1` (1e-9) and a new version; every cache misses (instrumented counters); strikes are unchanged. The IV shift is continuous at 0. |
| T5 | Resolution on real and synthetic chains (list below). |
| T6 | Round trip: for every eligible strike, chain, basis and role, `resolve(valueAt(K))` gives back K. This covers the smile click, basis switch and detach. |
| T7 | Reachability: every eligible strike is reached by some value on every basis. |
| T8 | Wings: strictly beyond the short; no candidate → `WING_NA` and the position is priced without the wing; a target beyond the end → end strike plus `CHAIN_END`; a target inside the short → first strike beyond plus `WING_INSIDE`. |
| T9 | **Pricing parity** on the v8 grid (str/cap, pd and cd 3..90 sampled, capd 5..25, both fills). `POS.price(inst, exp, legs_from_v8, fill)` equals v8 `crS`, `capPx`, `cr`, `intr`, `tv`, `exitCost`, `margin` and `payoff` at 200 prices, within 1e-9. Strike agreement with v8 is **reported** by cause, not asserted (expect about 55%). |
| T10 | `val(b, S, T)` is 0 at mid and −Σ spread at natural for every position with an ITM leg; `val` at τ → 0 equals `payoff`; positions with the same legs mark identically whatever their values or basis. |
| T11 | Stats match brute-force integration of payoff > ε on the distribution grid (1e-3): debits, a guts with a wing below the put, iron condors, the exact-gap case. |
| T12 | Links (list below). |
| T13 | Swap: swap∘swap restores the resolved legs, h and pins; resolved A and B exchange; a custom h becomes 1/h; pins exchange `SA`/`SB` and `dA`/`dB`; an aspect with a mapped expiry is unlinked with an event. |
| T14 | Migration: each `along` value; the finding-35 v5 code loads detached; `exp` with `bexp === A.exp` does not wrap; `free`; pins per slot; nm 12 → 13; v8 50/50 → straddle "atm"; a v9 code round-trips; the audit repro codes load as described. |
| T15 | Views: render every panel with `C.Ap` / `C.Bp` wrapped in a Proxy that throws on `tk`, `st`, `pd`, `cd`, `capd`. A put-wing position appears in payoff kinks, worst loss, grid lines and the smile panel. |
| T16 | `diff` (list below). |
| T17 | Defaults and labels: the default comparison is RAM vs KORU 20 Nov 30/30Δ strangle, with every link true except inst. `label` strings for straddle, strangle, guts, one wing and two wings carry every strike and never "ATM/ATMΔ". `document.title` comes from `label.tab`. |

**T5 covers**
- straddle → always one strike;
- strangle:
  - never a straddle unless `ONE_STRIKE`;
  - `WIDENED` picks the least-error leg (RAM 16 Oct, 20 Nov and 19 Mar at 47–49Δ);
  - guts if and only if the values cross;
- ITM by strike against Fpar;
- `CHAIN_END` at both ends;
- `GAP` on RAM 20 Nov with a put target inside the 21P–25P gap (finding 18), naming both neighbours;
- `FAR` on a coarse grid.

**T12 covers**
- `setB` on each aspect changes only that link.
- `unlink` with no stash leaves resolved B unchanged.
- `unlink` with a stash restores it, and "start from A" gives the no-move result.
- `link` keeps the stash, and undo works.
- Structure toggles A → straddle → strangle keep the strangle values.
- A linked B with a different structure reads A's stored set for its own structure.
- A linked wing on a B with another basis resolves on A's basis.
- `detach` on A changes no link.
- `detach` on B unlinks exactly structure, legs and placement and yields a flat top.
- `setFrom` touches only aspects that differ.

**T16 covers**
- The default (20 Nov) shows no amber.
- Each amber trigger 1–8 fires on a constructed case.
- Neutral items: one per unlinked aspect that differs, none for the instrument.
- Moot aspects are skipped.
- `identical` and `onlyInstrument` are reported.

### 3.3 Every finding is re-checked

Each of the 51 findings in `SP/audit/result.json` is re-run against v9. Report a short table: finding → fixed / not applicable (with reason) / still open.

Where each one is addressed:

| Findings | Addressed by |
|---|---|
| 1, 17, 25, 31, 42 (straddle named strangle) | §1.3 `label` from resolved kind; summary line 1 and glyph |
| 2, 29 (one-axis "along") | §1.5 per-aspect links; `setFrom` |
| 3, 10, 11 (ITM by Δ 50) | §1.2 ITM by strike vs Fpar, ATM tick; §1.3 marks; T10 |
| 4, 14 (silent chain end) | §1.2 `CHAIN_END` both ends, ranges |
| 5 (cap divergence) | §1.2 wings on a shared basis, `WING_NA`; amber triggers 3 and 7 |
| 6, 20, 21 (debit and guts odds) | §1.4 generic stats with ε; amber trigger 8 |
| 7 (fix rewrites A) | §1.5 fixes as data |
| 8, 16, 33 (Δ only) | §1.2 bases; line 3; smile click on an exact strike |
| 9 (smile click wrong strike) | §2.3 smile click; T6 |
| 12 (unreachable calls) | §1.2 snap in basis units; T7 |
| 13, 32, 44 (B's achieved values hidden) | §2.2 lines 1–3 for both; `FAR`; dock B cell shows B's result |
| 15 (two forwards) | §1.1 Fpar and refit; T3 |
| 18 (gap reported as chain stop) | §1.2 `GAP` |
| 19 (linked legs split at a stop) | §1.2 range intersection |
| 22 (ITM day-0 P&L) | §1.3 marks; T10 |
| 23, 26, 27, 28, 48, 51 (view numbers and layout) | §2.4 |
| 24 (σ means two things) | §1.6 σ table and labels |
| 30, 36 (B reset or stale on re-entry) | §1.5 stash; own values absent until set |
| 34 (expiry wraps) | §1.5 `expMap`; migration never wraps |
| 35 (v5 linkB) | §1.6 migration |
| 37 (relink re-strikes) | §1.5 legs together keep their offset; visible toggles |
| 38 (swap h and pins) | §1.5 swap; T13 |
| 39 (pasted link ignored) | §1.6 `hashchange` |
| 40, 46 (identical A and B) | `identical` event and notice |
| 41 (sweep ignores detached legs) | §1.6 sweep |
| 43 (structure mismatch silent) | §1.5 amber trigger 1 |
| 45, 49 (typography, bar wraps at 1200) | §2.1 type scale; §2.2 layout and height budget |
| 47 (capped hides base and cap strike) | §1.3 `label.wings` with strikes |
| 50 ("ATM/ATMΔ") | §2.2 line 3 straddle format |

### 3.4 A critical screenshot pass that you LOOK at

- 1200 and 1440, light and dark.
- **States:**
  - default;
  - RAM straddle vs KORU straddle;
  - RAM strangle vs KORU straddle;
  - only B with a protective call;
  - B's legs detached, starting from an A straddle (B detach);
  - A straddle vs B strangle with placement linked;
  - placement by % and by σ;
  - B on an overridden spot (round listed strikes, the ✎ mark, the override pill);
  - guts;
  - identical A and B (the notice);
  - after a swap (h inverted, pins swapped);
  - the worst case: KORU 19 Mar ’27, strangle + both wings, model quotes, every flag;
  - one state per amber trigger;
  - scrolled to the middle and the bottom (the summary stays visible).
- **Check:**
  - the font-size hierarchy reads at a glance;
  - the measured line 1 is 20–22px, and nothing else on the Compare tab is above 15px;
  - no clipped text, no overlap, and no wrap of summary lines at 1200 with the dock open;
  - the difference underlines, pills and notices are correct, and the default shows no amber;
  - per-leg credit and debit are shown for both sides;
  - the sticky block is within its height budget;
  - no horizontal scroll at 1200;
  - no console errors.

### 3.5 Git

- Push to `https://github.com/jmoudi/short-option-explorer` (clone at `/home/user/short-option-explorer`, branch main).
- Copy the v9 sources to `src/v9/` and the build to `dist/`.
- Commit with a message that describes what was done.
- Only the orchestrator pushes. Never push anywhere else.

---

## 4. Changes from review

**Accepted from critic U**
- U1: basis and values merged into one `placement` link.
- U2: every Position stores center, put and call (not per basis, see below).
- U3: detach on a straddle (on B it unlinks three aspects; see below); moot aspects skipped in diff.
- U4: instrument link, default off.
- U5: default comparison stated; straddle center `"atm"` on every basis; ATM and Δ-neutral ticks; no ITM tag on straddle legs in the summary.
- U6: explicit amber triggers with tests (threshold modified, see below).
- U7: full-width summary with the dock below; pills and range on one row; short wing tokens; "/contract" stated once; worst-case no-wrap check.
- U8: % of spot on the net; ×h shown for B.
- U9: override mark on line 1 and an override pill; fill shown.
- U10: round listed strikes under a spot override.
- U11: shape glyph; underlined differing tokens; pills only where no token exists.
- U12: no instrument pill; "identical" and "only the instrument differs" notices; ↺ on pills; relink all.
- U13: "together / detached"; SVG chain toggle.
- U14: toasts for implicit unlinks; `setFrom` touches only differing aspects.
- U15: link keeps B's value; unlink restores it.
- U16, U17, U18: basis-switch wording; "% OTM" / "vs fwd" labels; fwd shown when away from spot; σ horizon labels.
- U19: leg order and labels with wing strikes; n/a wing on line 2.
- U20, U21: full-width slider rows; the linked B cell shows B's result.
- U22: smile click with legs together; values never rounded.
- U23: swap inverts h and swaps pins.
- U25 to U29: section-title tier; move-range popover; `expMap` submenu; colour tokens and "!"; `document.title`.
- U-D: screenshot additions.

**Accepted from critic E**
- B1–B6 and C1–C13: smile refit on Fpar; forward Δ N(d1); override formulas; resolution algorithm; wings, margin and labels; fills and marks; generic stats and dist9; caches and frozen snapshots; aspect table; swap; diff; fixes as data; migration table; storage keys; hashchange guard; pure ctx9; `Built` contract; σ table; build checks.
- Tests T1–T15.

**Rejected or modified (one line each)**
- U2 "values per basis": rejected; one value set converted from resolved strikes keeps every position in place without hidden per-basis state.
- U3 "on B unlinks structure and legs only" (and E C9.5 likewise): modified; placement must unlink too, or B would read A's stored strangle values instead of forming a flat top at its own strike.
- U3 flag text "detached from straddle 15": modified; the `WIDENED` note "kept a strangle: put 14 (both legs snapped to 15)" covers detach and collisions with one text.
- U5 "Δ-neutral ≠ 50 because of e^{−rT}": superseded by E C2's forward Δ, where 50 is exactly Δ-neutral.
- U6 fixed amber thresholds alone: modified to max(tol, ½ local strike spacing). At 16 Oct, 30Δ puts differ by 3.5Δ (RAM 13P vs KORU 19P) purely from RAM's 1.00 grid; trigger 2 also requires a linked structure, so a deliberate detach on B is not amber.
- U8 "×h at the end of B's line 1": moved to line 2; line 1's worst case already fills the card width.
- U9 "line 3 starts with the fill": moved to the end of line 2, next to the prices it qualifies (as E C9.10).
- U10 "extend the strike grid past the listed strikes": rejected; rows never change (E C3), and chain-end flags explain a spot moved past the grid.
- U17 "Move axis: σ | % | $": the third option is "price", to avoid confusion with $ per contract.
- U24 "migrate by v8's resolved legs": rejected; it needs v8's engine bundled. Only 50/50 maps to a straddle, and a `migrated` toast says strikes were re-resolved.
- E C9.1 "the instrument is never linked": rejected; requirement 3 lists the instrument (default unlinked, per requirement 2).
- E C9.3 "values link suspended while bases differ": superseded by the merged `placement` link.
- E C9.4 "unlink always copies the current value": modified; the explicit toggle restores B's kept value (finding 30); implicit unlinks via `setB` copy the current value.
- E C4.7 `GAP` "target between two adjacent strikes": refined; every interior target is, so `GAP` requires neighbours more than 1.5× the usual increment apart; otherwise `FAR`.
- E C10.6 "expiry with DTE nearest 45": replaced by "first common expiry with DTE ≥ 30", which guarantees that B lists it; on today's data both give 20 Nov.
- E C13 grep for `build(` and `dist(`: narrowed to bare calls, so namespaced `POS.build(` and `DIST.make(` pass.
