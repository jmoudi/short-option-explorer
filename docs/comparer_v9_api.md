# v9 model layer: core API for the UI implementers

Files (all in `SP/v9/`): `dist9.js`, `inst9.js`, `rule9.js`, `pos9.js`, `cmp9.js`, `state9.js`, `ctx9.js`.
Tests: `SP/v9/test/*.test.js`. Run with `node --test test/*.test.js` from `SP/v9` (62 tests with T15 and T18, about 20 s).

This file documents what the code does. Where it says something SPEC_FINAL.md does not, the "Interpretations" section at the end explains why.

---

## 0. Bundling and conventions

**Bundle order (spec §3.1):** `"use strict"`, app_store9, **eng_head6**, **dist9**, **inst9**, **rule9**, **pos9**, **cmp9**, **state9**, **ctx9**, ui_common8, ui9_*, yr files, app9.
- dist9 comes before inst9 but only uses `INST` at call time, so the order is safe.
- The model needs only eng_head6 and a global `D` (`data8.json`). It does not need app_store or ui_common8.

**Globals from eng_head6 that the model uses:** `R`, `N`, `npdf`, `Ninv`, `bs`, `impliedVol`, `smile`, `wingAnchors` (inst9 only), `fK`, `fN`, `fmtE`, `MINUS`, `clamp`.

**Top-level names:** each file declares exactly one namespace object: `INST`, `RULE`, `POS`, `DIST`, `CMP`, `STATE`, `CTX`. dist9 also declares `cdfT`, `cdfAt` and `quantAt`, copied verbatim from v8. There are no collisions with ui_common8, app8 or the yr files (checked).

**Purity**
- No module reads `st`, `C`, `S9`, the DOM or `D`. The one exception is inst9, which reads `D` once through `makeRegistry(D)`.
- No function writes to its inputs. Tests run on a deep-frozen `D` and a deep-frozen `S9` in strict mode.
- Memo caches are internal LRUs of 2000 entries, keyed by instrument version.

**Frozen snapshots:** Instrument, Expiry, Resolved, Built, Priced, stats and dist objects are deep-frozen.
- Never mutate them.
- Copy before adding fields: `Object.assign({}, b, {...})`.

**Mutable results:**
- `CMP.*` returns plain new comparison objects.
- `STATE.*` returns plain new S9 objects.
- Treat both as immutable and change state only through `STATE.change`, `STATE.applyChange` or `STATE.cmpOp`.

**Source rules (§3.1) hold for every model file:**
- no `D.u`, `TKS`, `EXPS`, quoted tickers or `st.`;
- no bare calls to `smile(`, `build(`, `dist(`, `val(` and the rest of the list;
- no wrinkle, seam or smell.

`test/t01_purity.test.js` re-checks these rules. Note that the bare-call regex also matches comments, so do not write `dist()` or `build()` in a comment either.

---

## 1. `INST` (inst9.js): the instrument registry

```js
INST.list()                 -> [{id, name, lev}]            // order of D.u; the only list of tickers in v9
INST.ids()                  -> [id]
INST.has(id)                -> bool
INST.base(id)               -> Instrument | null            // listed spot, no IV shift
INST.make(slotDef)          -> Instrument | null            // slotDef = {id, spot?, ivShift? /* vol points */}
INST.atmAt(inst, T)         -> ATM vol at horizon T          // exact at a listed T; else total variance atm²T linear in T; flat vol beyond the ends
INST.dteOf(expId)           -> days to an expiry id          // from any instrument listing it, else from the date vs D.meta.asof
INST.asof                   -> D.meta.asof
INST.b76(F, K, T, σ, cp)    -> Black-76 price                // = bs(F·e^{−RT}, K, T, σ, cp)
INST.iv76(px, F, K, T, cp)  -> Black-76 implied vol | NaN
INST.fwdDelta(F, K, T, σ, cp) -> call N(d1); put N(d1) − 1 (signed)
INST.vega76(F, K, T, σ)     -> Black-76 vega
INST.r                      -> rate
INST.makeRegistry(D2)       -> a separate registry over another data object (tests)
INST.cache(name), INST.cacheStats(), INST.cacheReset(), INST.deepFreeze(o)   // utilities
```

**`make()` details**
- `make()` is memoized by version and returns the same frozen object for the same key.
- A no-op override returns the base snapshot: `|S′ − S| < 1e-9·S` and `ivShift == 0`.
- `spot` is stored rounded to 6 decimals and `ivShift` to 3, which matches the version string.

**Instrument**
```js
{ id, name, lev, hv, spot, spotListed, ivShift, overridden, version /* id|S.toFixed(6)|ivShift.toFixed(3)|asof */,
  expiries: [expId…] /* own, sorted */, exp(expId) -> Expiry | null, nearestExp(expId) -> expId /* nearest DTE, ties → longer */,
  slot /* the canonical slotDef: {id} or {id, spot, ivShift} */ }
```

**Expiry.** Every field reflects the instrument's overrides.
```js
{ id, instId, version, dte, T, S /* instrument spot */, Fpar, g /* ln(Fpar/S)/T */, Fcarry /* S·e^{rT}, informational */,
  atm /* σ76(Fpar) + ivShift/100 */, sigma /* atm·√T */,
  smile(K)      -> σ at K (refit on Fpar, sticky moneyness, IV shift included, floor 0.01)
  smileF(K, F)  -> σ at K for a moved forward F (used by marks)
  callDelta(K)  -> forward call Δ (fraction) with smile(K); cached for listed strikes
  rows: [{K, cp, bid, ask, mid, iv /* smile(K) */, ivm /* σ76 from this row's mid or NaN */, delta /* signed fwd Δ */, model}],
  puts, calls /* rows by type, ascending K */, row(K, cp) -> row | null,
  strikes /* listed, sorted, unique */, increment /* modal spacing within ±20% of Fpar */,
  model /* = instrument overridden */, fitInfo: {flat, npts, xlo, xhi, coef} }
```
- Rows are sorted by K, then P before C.
- **Model quotes.** With a spot override, every row is `model: true`. With an IV shift only, every row is `model: true` too: the quotes are no longer the listed ones.
- A row whose bid is 0 cannot be sold, and a row whose ask is 0 cannot be bought.

---

## 2. `RULE` (rule9.js): placement and structure resolution

```js
Basis = "delta" | "money" | "sigma"
Role  = "short put" | "short call" | "long call" | "long put" | "center"     // "center" = the straddle center
RULE.resolve(E, structure, basis, values, wings) -> Resolved
RULE.achieved(E, K, role, Ks?)       -> {delta, money, sigma}    // exact; Ks = the wing's own short strike (wing roles only)
RULE.valueAt(E, K, role, basis, Ks?) -> number                   // = achieved(...)[basis]; smile click, detach, conversion
RULE.range(E, basis, role, Ks?)      -> [min, max]               // over eligible strikes (center: straddle-eligible; wings: beyond Ks)
RULE.ends(E, basis, role, Ks?)       -> {lo: {value, K}, hi: {value, K}} | null    // range plus the end strikes, for stop notes
RULE.rangeTogether(E, basis, values) -> {dlo, dhi, loLeg, hiLeg, loEnd, hiEnd, put: [..], call: [..]} | null
                                        // legs together: allowed shared increment d (put + d, call + d), and which leg stops
RULE.shiftTogether(values, leg, v)   -> {put, call}              // move one leg to v and the other by the same increment
RULE.convert(E, pos, toBasis)        -> {values, wings, flags}   // pos = {basis, structure, values, wings}
RULE.convertWing(E, side, value, from, to, Ks, Kw?) -> {value, reset}
RULE.targetK(E, role, basis, target, Ks?) -> continuous K* | NaN // Δ: bisection, root nearest Fpar
RULE.snap(E, role, basis, target, Ks?)    -> {K, v, snapErr, flag} | null   // one leg in isolation
RULE.eligible(E)  -> {put, call, straddle, longCall, longPut}    // K lists, ascending
RULE.whyNot(E, K, role, Ks?) -> "" | reason                       // refuse a smile click with the reason
RULE.crosses(basis, put, call) -> bool                            // Δ: p + c > 100; money/σ: p + c < 0 (1e-9 slack)
RULE.clampValue(basis, v), RULE.clampWing(basis, v), RULE.fmtV(v, basis) /* "32.3Δ", "10%", "0.25σ"; a value that rounds to 0 prints unsigned ("0%") */, RULE.cpOf(role), RULE.legWord(role)
Constants: BASES, TOL {delta 5, money 2.5, sigma 0.10}, CE_TOL {delta 0.5, money 0.25, sigma 0.01},
           BOUNDS {delta [0.5, 99.5], money [−90, 300], sigma [−5, 5]}, WMIN {0.5, 0.5, 0.05}, WMAX {99.5, 300, 5},
           WDEF {15, 10, 0.5} (wing default / reset), DEF {30, 10, 0.5} (short-leg reset), STEP {1, 0.5, 0.05} (drag steps), UNIT {Δ, %, σ}, ROLES
```

**Values by basis**

| Basis | put | call / center | wing |
|---|---|---|---|
| delta | 100 − 100·callΔ(K) | 100·callΔ(K) | \|Δ\|·100 of the long leg |
| money | (1 − K/Fpar)·100 | (K/Fpar − 1)·100 | (K/Ks − 1)·100 for a call wing; (1 − K/Ks)·100 for a put wing |
| sigma | −ln(K/Fpar)/E.sigma | ln(K/Fpar)/E.sigma | ±ln(K/Ks)/E.sigma |

**Resolved**
```js
{ put: Leg, call: Leg, wingCall: Leg | null, wingPut: Leg | null,
  center: {K, target /* number | "atm" */, achieved, snapErr} | null,   // straddle only
  kind: "straddle" | "strangle" | "guts" | "" (n/a), na: "" | reason, flags: [Flag], basis, structure }
Leg = { role, K, cp, row, target, achieved: {delta, money, sigma}, snapErr /* achieved − target, active basis */, itm /* vs Fpar */, Kshort /* wings */ }
```
- For a straddle, both legs carry `target` = the center target and `snapErr` = the center's snapErr.
- `"atm"` means the straddle-eligible strike nearest Fpar in |K − Fpar|. Ties go to the strike nearer in |ln K/F|, then to the higher K.

---

## 3. `POS` (pos9.js): building, pricing and marking

```js
Position = { inst: SlotDef, exp: expId, structure: "straddle"|"strangle", legs: "together"|"detached", basis,
             values: {center: number|"atm", put, call}, wings: {call: Wing, put: Wing}, fill: "mid"|"nat" }
Wing     = { on, value, basis? /* only from CMP.resolveB */ }
POS.build(pos, {expMap: "nearest"|"same"} = nearest) -> Built        // memo: JSON(canonical pos)|inst.version|expMap
POS.price(inst, expId, [{role, K}], fill)            -> Priced | null // pure pricing of given legs; memo by version|exp|legs|fill
POS.val(b, x, tau, shock?)  -> P&L per share of closing at price x with tau years left   // shock = {ivs, svs, svd}
POS.payoff(b, x)            -> P&L per share at expiry
POS.legsAt(b, x, tau, shock?) -> [{role, K, cp, qty, mark, pnl}]  // ascending K; Σ pnl = val (or payoff at expiry)
POS.stats(b, dist)          -> Stats | null
POS.worstIn(b, Slo, Shi)    -> worst payoff on [Slo, Shi]
POS.canon(pos), POS.bs0(S, K, T, σ, cp) /* zero-rate BS */, POS.NOSHOCK
```

**Built.** Deep-frozen. The listed fields are kept from v8 unless marked new.

| Field | Meaning |
|---|---|
| `key` | memo key (contains the instrument version) |
| `tk` | instrument id, for display only |
| `inst` | the Instrument (new) |
| `exp` | the resolved (possibly mapped) expiry id |
| `E` | the frozen v9 Expiry (null when the expiry is n/a) |
| `S`, `T`, `dte` | spot (override included), years, days |
| `F`, `Fimpl` | both = Fpar |
| `Fcarry` | S·e^{rT}, informational (new) |
| `sig` | `E.sigma` |
| `fill` | "mid" or "nat" |
| `sp`, `sc` | short put / short call rows `{K, cp, bid, ask, mid, iv, ivm, delta, d /* = delta, signed fwd Δ */, model}` |
| `cap`, `capP` | call-wing and put-wing rows, or null (`capP` is new) |
| `crS` | short credit (sell at mid, or at the bid at natural) |
| `capPx` | call-wing debit |
| `wingPx` | total wing debit (new) |
| `cr` | net credit per share = crS − wingPx |
| `exitCost` | natural fill: Σ half-spreads over all legs, wings included; mid: 0 |
| `intr`, `tv` | intrinsic against spot (wings included) and time value = cr − intr |
| `vega` | Black-76 on Fpar, signed (shorts negative), wings included |
| `margin` | Reg T leveraged-ETF formula with `inst.lev`, symmetric in the wings (v8 exactly when only a call wing exists) |
| `iP`, `iC` | v8-shaped `{intr, px, tv, tvMid, below, ea, carry, par, from}` for the two shorts |
| `itmP`, `itmC` | by strike against Fpar |
| `straddle`, `guts` | from the final strikes |
| `capFb` | always false |
| `inv` | true when `WIDENED` fired |
| `na` | true only with no usable shorts, an unknown instrument, or an unlisted expiry under `expMap "same"` |
| `naReason` | "" or the reason (replaces `capNA`; a wing n/a is a flag, not na) |
| `kind` | "straddle" / "strangle" / "guts" ("" when na) |
| `flags` | `[Flag]` (see §8) |
| `legs` | see below |
| `net` | `{perShare: cr, perContract: cr·100 /* + credit, − debit */, isDebit: cr < 0, pctOfSpot: cr/S·100 /* a percent number */}` |
| `label` | `{short: "RAM 16 Oct", kindWord, struct: "short straddle 15" \| "short strangle 21.5 / 22" \| "short guts 22P / 21C", wings: "" \| "+ 25C wing" \| "+ 9P wing" \| "+ 9P & 25C wings", full: "RAM 16 Oct · short straddle 15 + 25C wing", tab: "RAM straddle 15" \| "KORU strangle 21.5/22" \| "RAM guts 22P/21C" (+ " +9P +25C" with wings)}` |
| `resolved` | the frozen Resolved |
| `center` | `resolved.center` |
| `basis`, `structure`, `legsMode` | echo of the position |
| `priced` | the shared Priced object (identical for every position resolving to the same legs and fill) |
| `marks` | internal mark parameters. Do not use them |

- **Dropped:** `P`, `U`, `parP`, `parC`, `adjSp`, `adjSc`, `adjCap`, `capNA`.
- **na Built:** it keeps `key`, `tk`, `inst`, `exp`, `E` (null when the expiry is not listed), `S`, `label` (`struct: "n/a"`, `full: "... · n/a (reason)"`, `tab: "RAM n/a"`), `flags`, `naReason`. Numbers are NaN, `legs` is `[]` and `net` is null. Views must check `b.na` first.

**`Built.legs[]`** (ascending strike; on equal strikes the put comes first):
```js
{ role, key /* "put"|"call"|"wingCall"|"wingPut", matches Flag.leg */, cp, K, qty /* −1 short, +1 long */,
  bid, ask, mid, fillPx /* sell at bid / buy at ask at natural; mid otherwise */,
  perContract /* −qty·fillPx·100: + credit for shorts, − debit for longs */,
  iv /* smile(K) */, ivm, delta /* signed fwd Δ, fraction */, money /* (K/Fpar − 1)·100, signed vs fwd */, sigma /* ln(K/Fpar)/E.sigma */,
  itm /* vs Fpar */, intrinsic /* vs spot */, timeValue /* fillPx − intrinsic */, tvMid /* mid − intrinsic */,
  quotePremium /* ITM leg priced from its OTM twin: mid − parity value at entry; else NaN */, parity, markMode /* "pin"|"twin"|"resid" */, model,
  target, achieved: {delta, money, sigma} /* role-oriented: put money = % OTM, as on line 3 */, snapErr, Kshort }
```

**Marks (`POS.val`)**
- OTM leg: Black-76 on F(x,τ) = x·e^{gτ}, at σ′(K; F(x,τ)) + adj, where adj pins the entry mark to the mid.
- ITM leg (against Fpar) whose OTM twin has a bid: the twin's pinned mark, plus parity on F(x,τ), plus quotePremium·τ/T.
- A mid with no implied vol: model plus residual·τ/T, flagged `NO_IV_PIN`.
- Shock: `ivs` vol points; skew `svs` as v8; `svd` = skew on down moves only. The vol floor is 0.01.
- Entry P&L: at mid it is 0 (|v| < 1e-12). At natural it is exactly −Σ(ask − bid).
- At τ ≤ 1e-9, `val` returns `payoff`, with no exit cost, as in v8.

**Stats**
```js
{ pop, ev, bes: [x…] /* every breakeven, ascending */, wins: [[lo, hi]…] /* profit intervals, hi may be Infinity */, noBE, mode,
  beLo /* first breakeven, or null when profit starts at 0 */, beHi /* last breakeven, or null when profit extends to ∞ */,
  capBE, pCap /* call wing: K + debit, P(S_T > capBE) */, capPBE, pCapP /* put wing mirror */, worst? /* sFor only */ }
```
- Profit means payoff > ε, with ε = 1e-9·S. A breakeven is the exact x where the payoff crosses 0.
- **UI note:** render `bes` (for example "none" when it is empty). v8's `beLo / beHi` pair cannot describe a debit or a guts with a wing.
- EV under RN = `cr + Σ qty·mid`, which is 0 at mid fill. EV under HV = the zero-drift lognormal expectation of the payoff, in closed form.

---

## 4. `DIST` (dist9.js)

```js
DIST.make(E, spot, mode /* "rn"|"hv" */, hv, hvk) -> {key, exp, version, T, S, Fpar, u, cdf, ulo, uhi, du, n, mode, hs}   // frozen, memo version|exp|mode|hvk
DIST.cdfK(d, K) -> P(S_T ≤ K)
cdfT(d, x), cdfAt(d, x, t), quantAt(d, p, t)     // v8 verbatim, x = ln(K/S)
```
- RN mode runs Breeden–Litzenberger on Black-76 calls on Fpar with `E.smile`.
- HV mode is v8's zero-drift lognormal at `hv·hvk`.

---

## 5. `CMP` (cmp9.js): the comparison

```js
Comparison = { A: Position,
               B: { inst: SlotDef, exp?, structure?, legs?, basis? & values? (placement), wings?: {call?, put?}, fill? },  // own values; kept as stash while linked
               links: { inst: false, exp, structure, legs, placement, wingCall, wingPut, fill },
               expMap: "nearest" | "same", sizing: { rule: "auto"|"notional"|"credit"|"vega"|"loss"|"margin"|"custom", h } }
Event = { type: "unlinked"|"restored"|"linked"|"swapUnlinked"|"identical"|"migrated"|"note", aspects: [aspect], text, actions: [{label, apply: c -> {c, events}}] }
```

**Mutators.** Each returns `{c, events}` and is pure.

| Call | What it does |
|---|---|
| `CMP.setA(c, path, value)` | Never changes links. `basis` converts A's values and wings on A's chain, so A's strikes stay. `inst.id` (or a new `inst`) moves A to the nearest listed expiry if needed. Emits `identical` only when the change makes A and B identical (not on every change while they stay identical). |
| `CMP.setB(c, path, value)` | On a linked aspect this is an implicit unlink: it copies B's current resolution (never the stash), applies the value and emits `unlinked` with "↺ relink". `basis` converts B's values on B's chain. |
| `CMP.link(c, aspect)` | Sets the link and keeps B's value as the stash. Emits `linked` with "undo". |
| `CMP.unlink(c, aspect)` | Restores a valid stash (emits `restored` with "start from A instead"). With no stash, it copies B's current resolution, so B does not move, and emits nothing. |
| `CMP.detach(c, "A"\|"B")` | On a side that resolves to a straddle: strangle, legs detached, put/call = `valueAt(K)` on that side's basis, which gives a flat top through `WIDENED`. On A it changes no link. On B it unlinks structure, legs and placement (`unlinked`, with actions "↺ relink placement" and "↺ relink all three"). On a strangle or guts ("Detach legs" from the legs control): legs = detached; on B, while placement is linked, it also unlinks placement with a copy of what B resolves to (nothing moves), because B reading A's values could not move its legs on their own. Event "B's legs are detached: B's strikes are now set on their own" with "↺ relink placement" (and "↺ relink both" when legs was linked too). The dock routes B's "detached" click here while placement is linked. |
| `CMP.setFrom(c, "A"\|"B", {inst?, exp?, structure?, legs?, wings?: {call?: bool \| {on, value}, put?: …}, fill?})` | Overview "Set as A/B". Calls setA/setB only for values that differ from that side's current resolution. Several implicit unlinks are merged into one event. |
| `CMP.relinkAll(c)` / `CMP.relinkSome(c, aspects)` | Links every aspect except `inst` ("make B = A"). Stashes are kept. Emits `linked` with "undo". |
| `CMP.swap(c)` | Exchanges A and B, own values included. A custom `h` becomes 1/h. A linked aspect whose swapped B would not resolve to old A's strikes or date (a mapped expiry, a wing carried on another basis) is unlinked with old A's value, emitting `swapUnlinked`. **Use `STATE.swap(S9)`**, which also swaps the pins. |
| `CMP.applyFix(c, fix)` | `fix = {side, path, value}` goes through setA or setB of that side only. A fix on B never changes A. |

**Paths**

| Path | Aspect |
|---|---|
| `inst`, `inst.id`, `inst.spot`, `inst.ivShift` | inst. `inst.spot` / `inst.ivShift` set to null or "" removes the override; `inst.id` drops overrides |
| `exp` | exp |
| `structure` | structure |
| `legs` | legs |
| `basis`, `values` (merge), `values.center` (number or "atm"), `values.put`, `values.call` | placement |
| `wings.call` (`{on, value}`), `wings.call.on`, `wings.call.value` | wingCall |
| `wings.put`, `wings.put.on`, `wings.put.value` | wingPut |
| `fill` | fill |

Stored values are clamped to the sanitizer bounds and never rounded.

**Queries**
```js
CMP.defaults(list?)  // A = list[0], B = list[1]; first common expiry with DTE ≥ 30; 30/30Δ strangle, legs together, wings off at 15Δ, mid, auto; all links but inst
CMP.sanitize(o)      // a full valid Comparison (an unlinked aspect always gets B's own value)
CMP.resolveB(c)      // B's full Position; a linked wing = {...A.wings.x, basis: A.basis}
CMP.buildA(c), CMP.buildB(c)   // POS.build with c.expMap for B
CMP.currentB(c, aspect)        // what B resolves to for that aspect now
CMP.ownValue(c, aspect)        // B's own/stash value or undefined
CMP.identical(c), CMP.aspectOf(path), CMP.placeTxt(basis, values, structure)
CMP.ASPECTS, CMP.NAMES, CMP.SIZE_RULES
CMP.diff(c, bA?, bB?) -> { items: [DiffItem], identical, onlyInstrument }
DiffItem = { aspect, code, text, asked, side, relink, dockRow }
```

**DiffItem kinds**
- **Neutral** (`asked: true`). These have `code: "UNLINKED"` and `relink: true`. Aspects: exp, structure, legs, placement, wingCall, wingPut, fill. They are emitted only when the resolved values differ.
  - Text examples: "B 18 Dec", "B straddle", "B legs detached", "B strikes 20 / 20Δ", "B protective call 10Δ", "B natural fill".
  - `code: "OVERRIDE"` (`aspect: "override"`, `relink: false`) reads like "B spot +9.1% (override)" or "A IV +5 pts (override)".
  - No item is ever emitted for the instrument itself.
  - Moot aspects are skipped: legs when either side is a straddle or placement is linked; a wing's value when the wing is off on both sides.
- **Amber** (`asked: false`). The text already starts with `"! "` and names the side.

  | Code | Trigger | Example text |
  |---|---|---|
  | `KIND` | 1 | "! B resolved to guts 22P / 21C" |
  | `WIDENED` | 2 | "! A: put widened to 14 to keep a strangle" |
  | `WING_NA` | 3 | "! B: call wing n/a (no strike above 38C)" |
  | `CHAIN_END` | 4 | "! A: call at chain end 38C (38.6Δ)" |
  | `EXP_MAPPED` | 5 | "! B has no 16 Oct: using 20 Nov" |
  | `ACHIEVED` | 6 | "! call A 32.7Δ vs B 16.9Δ", "! center A +19.3% vs B −0.5%" (centers on % and σ are signed) |
  | `WING_WIDTH` | 7 | "! call wing A 0.3σ vs B 0.1σ wide" |
  | `DEBIT` | 8 | "! B is a net debit" |
  | `NA` | (added) | "! B is n/a: reason" |

- `dockRow` is the dock row to open: inst / exp / structure / legs / placement / wingCall / wingPut / fill.
- **Tokens vs pills (§2.2).**
  - Aspects exp, structure, wingCall, wingPut and fill have a token on lines 1–2, so they are underlined there.
  - placement, legs and override items become pills.
  - Every amber item is also a pill.
- The default comparison has no items, `onlyInstrument: true`.
- `onlyInstrument` = not identical, no amber item and no `UNLINKED` item: an unlinked aspect that is moot or resolves to A's value (B's legs detached while its strikes follow A, an unlinked fill set back to mid) does not count as a difference. Override items do not count either.

---

## 6. `STATE` (state9.js)

```js
S9 = { cmp: Comparison,
       scen: { unit: "sig"|"pct"|"pts", rlo, rhi, rlink, wl: "view"|"own", wlo, whi, dist: "rn"|"hv", hvk, ivs, svs, svd, align: "frac"|"cal" },
       view: { units: "pct"|"usd"|"cr", ovm: "cr"|"crs"|"crd"|"ev"|"pop"|"worst"|"wingc"|"wingp"|"rom", ovv, gview, gval, gtab, nm: 9|13|17|25, nd, gl, ct, cts,
               ovk, ovc, ovb, ovs, ovo, pso, pss, cs, cr, crx, shared, sweep: "both"|"put"|"call"|"wingCall", jday, pins: [{SA, SB, dA, dB}],
               dock, theme, rdHit, rdK, rdDir, rdL, rdBase, rdCap, rdG, rdGc } }
STATE.defaults()                     -> S9
STATE.sanitize9(o)                   -> S9            // one sanitizer per part, then the normaliser
STATE.change(S9, fn)                 -> {S9, events}  // fn edits a deep copy; sanitizers + normaliser run; events = normaliser notes
STATE.applyChange(S9, fn)            -> S9            // change() without the events
STATE.cmpOp(S9, op, ...args)         -> {S9, events}  // e.g. STATE.cmpOp(S9, "setB", "values.put", 20); op = any CMP mutator name
STATE.applyAction(S9, action)        -> {S9, events}  // run a toast action (event.actions[i]) on S9.cmp
STATE.swap(S9)                       -> {S9, events}  // CMP.swap + pins SA↔SB, dA↔dB
STATE.normalise(S9)                  -> {S9, events}  // on a copy (input untouched); change() runs it
STATE.code(S9, {tab, theme, yr})     -> "v9." + enc({t, th, c: S9, y})      // put it after "#"
STATE.blob(S9, {tab, theme, yr})     -> {v: 9, tab, theme, cmp: S9, yr}     // localStorage["rk-lab-v9"]
STATE.parse(str)                     -> {src: "v9"|"v8"|"v5", tab, theme, cmp, yr} | null (not a code); throws on a bad code
STATE.migrate(code | blob)           -> {S9, events, tab, theme, yr, src}  // throws on a bad code string
STATE.enc / STATE.dec                // v8's URL-safe base64 JSON
STATE.uStep(unit), uRound(v, unit), rangeCaps(unit, S), uLab(u, unit, dec), UNAME {sig: "σ", pct: "%", pts: "price"}
STATE.SCEN_DEF, STATE.VIEW_DEF, STATE.ENUMS, STATE.sanScen, STATE.sanView
```

**`migrate()` inputs and results**
- Accepted inputs:
  - a `#v9.`, `#v8.` or `#v5.` code, with or without the page address;
  - a `{v: 9}` blob;
  - a `{v: 8}` blob (from `rk-lab-v8`);
  - a bare v5 state object (the `rk-lab-v5` store).
- Any v8 or v5 input emits `migrated`: "Loaded a v8 view: strikes re-resolved with v9 rules".
- v9 inputs emit nothing.
- `yr` passes through unchanged. `tab` is "compare" for v5 inputs.

**Migration notes (§1.6 table)**
- When `along` is st, exp, k or fill, v8 kept B on A's ticker. v9 therefore sets `links.inst = true`, and B's stashed instrument is the other ticker.
- `along: tk` leaves inst unlinked, with B = the first other id.
- `along: free` unlinks every aspect.
- The v8 50/50 with linked legs maps to a straddle at "atm".
- Other value maps:
  - `ovm` capc / capp → wingc / wingp;
  - `sweep` pd / cd / capd → put / call / wingCall;
  - `nm` → the nearest of 9 / 13 / 17 / 25;
  - pins `{S: {RAM, KORU}, dA, dB}` → `{SA: S[A.tk], SB: S[B.tk], dA, dB}`.

**Normaliser (runs on every change)**
- The price unit (`unit: "pts"`) needs `same` (the same instrument id and version). Otherwise the range is converted to σ and a `note` event is emitted.
- The range is clamped to `rangeCaps`, with a `note` event.
- A's expiry is always one that A's instrument lists.

**Persistence (for app9)**
- Write `STATE.blob(...)` to `rk-lab-v9` and the hash `"#" + STATE.code(...)`.
- On first load with no v9 blob, migrate `rk-lab-v8`, then `rk-lab-v5`. Never write the old keys.
- `hashchange`: ignore it when `location.hash.slice(1) === lastCode`. Otherwise `STATE.migrate(location.hash)`; on a throw, toast and keep the state.

---

## 7. `CTX` (ctx9.js): the render context

`CTX.ctx9(S9) -> C`. It is pure and does not freeze C.

**From S9 and the builds**
- `S9`, `cmp`, `scen`, `view`.
- `Ap`, `Bp`: v9 Positions. Bp is resolved, with no v8 fields.
- `A`, `B`: Builts. B is built with `cmp.expMap`.
- `instA`, `instB`: Instruments.
- `same`: same instrument id and version.

**Statistics and sizing**
- `stats(b, mode?)` and `statsHV(b)` return Stats.
- `sFor(b, toS, mode?)` returns Stats plus `worst` over [wlo, whi].
- `sa`, `sb`: `sFor` for A and B.
- `worstIn9(b, Slo, Shi)`.
- `distOf(b, mode?)` returns the dist. `d` and `dB` are A's and B's.
- `h`, `hNote`, `rule`: v8 semantics; auto = notional when `same`, else vega.
- `hRatio(rule, A, B, sa, sb, h)`, `SIZES`.

**Move axis**
- `unit`.
- `ax = {unit, T, sig(x), sigTk(x), toS(x), uOf(x)}`. `x` is "A", "B", an Instrument or a Built.
  - Axis σ = that instrument's ATM at **A's horizon** (`INST.atmAt`) × √T_A.
  - v8 `C.ax.toS(b.tk)` becomes `C.ax.toS(b)`.
- `axis(unit)` builds an axis for another unit (v8 `axisFor(A, v)`).
- `sA`, `sB`: axis σ.
- `toSA`, `toSB`, `uOfSA`, `uOfSB`.
- `lo`, `hi`, `wlo`, `whi` (signed).
- `clampNote`: set when a bound sits at its cap.
- `shock = {ivs, svs, svd}`.

**Values on the shared axis**
- `vA(u, τ)`, `vB(u, τ)`: the B value already includes ×h and per notional.
- `pA(u)`, `pB(u)`, `xA(u)`, `xB(u)`.

**Units**
- `fU(v, d?)`, `fUt(t, step)`, `unitName()`, `hTxt()`.
- `unitsNote`: set when units = "cr" but A's time value is ≤ 0. It says the values show % of A's notional, and fU / unitName then use %.
- `uStep`, `uRound`, `rangeCaps`, `uLab`, `UNAME`.

**Calendar**
- `sameExp` (A.dte === B.dte), `cal`, `Hd` (v8 semantics).

**Comparison**
- `diff`: from `CMP.diff`.
- `labels = {A: A.label, B: B.label, title: "RAM straddle 15 vs KORU strangle 21.5/22"}`. Set `document.title = C.labels.title`.
- `flags`: every flag of A and B with `side` added. A `fix` also gets `side`, so `CMP.applyFix(c, flag.fix)` works directly.

**σ labels**
- `sigAxisLabel`: "σ", or "σ over A's 15 days" when the expiries differ.
- `sigOwnSuffix(b)`: "" or " to 19 Mar" (summary line 3).

Grid odds with calendar alignment should use `cdfAt(d, x, Math.min(day, b.dte) / 365)` (§2.4).

---

## 8. Flags

`Flag = {code, leg?, severity: "note"|"warn", text, fix?: {path, value}}`.
- `side` is added in `C.flags`.
- `leg` ∈ put / call / center / wingCall / wingPut. It matches `Built.legs[].key`; "center" means both straddle legs.

| Code | Sev. | From | Meaning / text example |
|---|---|---|---|
| `CHAIN_END` | warn | rule | "call 30Δ is beyond the chain: 38C is the last listed (24Δ)". Fix: set the value to the end strike's value |
| `GAP` | note | rule | "no 22–24P listed; 21P 74.4Δ, 25P 85.5Δ" ("with a bid" when listed but not sellable) |
| `FAR` | note | rule | "30Δ → 24Δ: nearest strikes 16C 24Δ, 15C 36Δ" |
| `WIDENED` | note | rule | "kept a strangle: put 14 (both legs snapped to 15)". Extra fields: `moved`, `from`, `to` |
| `ONE_STRIKE` | warn | rule | "only one usable strike, cannot form a strangle (...)" |
| `WING_NA` | warn | rule | "call wing n/a (no strike above 38C)". Fix: move that side's short to the outermost strike that still has a wing beyond |
| `WING_INSIDE` | note | rule | Δ wing at or inside the short; uses the first strike beyond |
| `CONVERT_RESET` | note | convert | Becomes a `note` event on a basis switch |
| `EXP_MAPPED` | warn | pos | "no 16 Oct: using 20 Nov". Fields `from`, `to`; fix `{path: "exp", value}` |
| `EXP_NA` | warn | pos | n/a under `expMap "same"` |
| `MODEL_QUOTES` | note | pos | "model quotes: spot 23.20 (listed 21.09) · IV +10 pts" |
| `NO_IV_PIN` | note | pos | The mid has no implied vol; a decaying residual is used |
| `EARLY_ASSIGN` | note | pos | A short leg with intrinsic vs spot that is OTM vs Fpar, or has time value < max(0.05, K(1 − e^{−rT})) |
| `BELOW_INTRINSIC` | note | pos | mid < intrinsic |

---

## 9. Recipes for the UI

- **Summary line 1:** `b.label.short`, glyph from `b.kind` plus wings, `b.label.struct` and `b.label.wings`. Overrides: `b.inst.overridden`, `b.inst.spot`, `b.inst.ivShift`.
- **Summary line 2:** `b.legs` (each has `perContract` and `role`; wings have `qty` +1), then `b.net`.
  - n/a wing: a `WING_NA` flag with leg wingCall or wingPut.
  - Fill: `b.fill`. B's ×h: `C.h`.
- **Summary line 3:**
  - strangle: `values` + `basis` → `legs[].achieved.delta`, `.money` (% OTM), `.sigma`, then `b.dte`;
  - straddle: `b.center.achieved.money` (signed vs fwd), `b.center.achieved.sigma`, and the put/call `achieved.delta`;
  - forward note: `b.F` vs `b.S`.
- **ATM tick:** call `E.callDelta(E.Fpar)·100`; put 100 − that. Δ-neutral tick for the straddle center: 50.
- **Slider stops:** `RULE.ends(E, basis, role[, Ks])`. With legs together: `RULE.rangeTogether(E, basis, values)` (`loLeg` / `hiLeg` name the leg that stops). B's chain-end tick on A's slider: `RULE.ends(C.B.E, basis, role)`.
- **Slider readout "30Δ → 13P 32.3Δ":** `leg.target`, `leg.K + leg.cp`, `leg.achieved[basis]`.
- **Smile click:** check `RULE.whyNot(E, K, role, Ks)`, then `v = RULE.valueAt(E, K, role, basis, Ks)`. With legs together, use `RULE.shiftTogether(values, leg, v)`. Then setA, or setB for B (which unlinks placement only).
- **Basis seg:** `setA(c, "basis", b)` (or setB). Strikes stay; "atm" stays "atm".
- **Detach legs button:** `STATE.cmpOp(S9, "detach", side)`.
- **Sweep:** build positions with `POS.build({...C.Ap, values: …})` on the current basis. "Both" uses `RULE.shiftTogether`. Use `C.statsHV` for EV.
- **Toasts:** show every event's `text` plus a button per action. Run an action with `STATE.applyAction(S9, action)`.
- **Dock B cell (linked):** take B's result from `C.B` (strikes plus `achieved`), never A's target. Amber when `C.diff.items` has an unasked item with that `dockRow`.
- **"strangle values 30 / 30 (used by B)" row:** show it when placement is linked and `C.Bp.structure !== C.Ap.structure`. Edit it with `setA(c, "values.put" | "values.call" | "values.center", v)`.

---

## 10. Interpretations and small additions (vs SPEC_FINAL.md)

1. **`CHAIN_END` tolerance.** The target must lie beyond the end strike's value by more than `CE_TOL` (Δ 0.5, money 0.25, σ 0.01). Otherwise a linked 30Δ against a 30.07Δ last strike would raise a warning and an amber item for a 0.07Δ overshoot. Slider ranges come from `RULE.range`, so A can never be beyond.
2. **Amber trigger 6 local spacing** (fix round 1) = the gap, on the basis, between the listed strikes either side of the resolved strike (twice the one-sided gap at a chain end), as §1.5 says. The threshold is max(tol, ½ × the larger spacing), i.e. about one strike increment.
   - Pure grid granularity never fires: the default at every expiry (16 Oct: RAM 17C 25.9Δ vs KORU 24.5C 30.4Δ, with RAM's 16C at 35.4Δ) and ATM straddles on Δ, % and σ.
   - A straddle center at "atm" is skipped: each side takes its own nearest strike to its own forward.
   - It fires on real mismatches: listed strikes with no bid around the target, a widened leg (T16 builds one with no bids on B's 11–13 strikes).
   - Legs at a chain end are left to trigger 4.
3. **Crossing values whose snapped put is below the call** (possible only around strikes without bids) are widened into a guts the same way as equal strikes. This guarantees "guts iff the values cross" (T5).
4. **Breakevens** are the exact zero crossings. ε only decides what counts as a profit, so the exact-gap case reports [8, 12].
5. **EV under RN** = `cr + Σ qty·mid`, as in v8, so it is 0 at mid. The spec's "net credit − Σ qty·mid" with qty = −1 for shorts would double-count.
6. **IV-shift-only rows** are `model: true`, and `MODEL_QUOTES` fires for any override. The flag is a note.
7. **The vol floor** under shocks and negative IV shifts is 0.01. v8 used 0.05, which would break the entry pin for mids below 5 vol.
8. **`identical` fires only on the transition** into identical. Otherwise it would toast on every drag while A and B stay identical.
9. **Event type `"note"`** was added for normaliser messages and `CONVERT_RESET`.
10. **B's own wing values** are read on B's effective basis. When that basis changes (setA/setB `basis`, or link/unlink of placement), B's own wings are converted so their strikes stay. This is tested.
11. **A linked wing carried on A's basis** gets no `fix` on B: the value would be on the wrong basis.
12. **Migration** links `inst` for `along` st, exp, k and fill (see §6).
13. **Diff adds an `NA` amber item** when a side is n/a.
14. **Strike agreement with v8** (reported, not asserted):
    - 63% on critic E's symmetric 3..49Δ sweep;
    - 37% over the whole v8 grid with ITM, cap and asymmetric targets.
    Wherever the legs agree, every pricing field matches v8 exactly.
15. **Wing anchors without a slope break** (added at integration). eng_head6's `wingAnchors` moves a quote-edge anchor inward to where the cubic's slope is zero. When the slope has the wrong sign all the way in, it stopped at the midpoint of the quoted range, where the slope is not zero. The smile then broke slope and went flat from there, and the implied density got a spike (KORU 19 Mar ’27: 2.1% of the mass in one bin near 16.4, with every call above it on one vol). inst9's `smoothAnchors` moves that anchor to the point between the midpoint and the edge with the smallest |slope| (the quote edge on today's chains). eng_head6 is unchanged. Effect: KORU 19 Mar ’27 30Δ put now resolves to 18P (28.9Δ) instead of 19P; T18 checks the densities and the slope continuity.

---

## 11. Tests (`node --test test/*.test.js`)

| File | Covers |
|---|---|
| `t01_purity.test.js` | T1 (frozen D, strict writes throw, every entry point on frozen data), T2 (frozen S9: ctx9, every C helper, STATE functions leave their input untouched), §3.1 source rules |
| `t03_t04_inst.test.js` | T3 (≥ 90% repriced, monotone call Δ on 8 chains, continuity at Fpar, Fpar = v8 Fimpl), T4 (no-op override, parity forward ×1.1 to 1e-9, every cache misses, IV shift continuous and parity-preserving, D byte-identical after overrides, synthetic chains) |
| `t05_t08_rule.test.js` | T5 (straddle one strike, guts iff cross, WIDENED least error, ITM by strike, CHAIN_END both ends, GAP 21P–25P, FAR, ONE_STRIKE, n/a, mapped expiry), T6 (round trip on every eligible strike, basis and role; conversion keeps strikes), T7 (reachability), T8 (wings), smile-click helpers |
| `t09_t11_pos.test.js` | T9 (17,578 v8 positions: crS, capPx, cr, intr, tv, exitCost, margin, payoff at 200 prices, worst difference 0), T10 (entry P&L, τ → 0, same legs → same marks), T11 (stats vs brute force: debit, capped guts, guts with a put wing, iron condor, exact gap, HV EV) |
| `t12_t17_cmp.test.js` | T12 (setB one link, unlink and stash, link and undo, structure toggles, cross-structure values, wing on A's basis, detach A/B, setFrom, fixes as data, basis switch keeps strikes), T13 (swap and swap∘swap: legs, h, pins, mapped expiry, wing basis), T16 (default no amber, triggers 1–8, neutral and moot items, identical / onlyInstrument), T17 (defaults, labels) |
| `t14_migrate.test.js` | T14 (each `along`, no wrap, free, finding-35 v5 code, 50/50 → straddle, pins, nm, sweep/ovm maps, v9 code and blob round trips, bad codes, audit repro states) |
| `t15_views.test.js` | T15, node part (views on Proxy-wrapped positions; see the views report) |
| `t18_dist_smooth.test.js` | T18 (added at integration): no RN density bin above 2.5× the 90th-percentile bin; smile slope continuous inside the quoted range, on all 8 chains |
