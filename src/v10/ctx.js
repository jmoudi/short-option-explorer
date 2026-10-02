// ============================================================ ctx9: the render context C, computed from the state tree (pure)
// One namespace object, CTX. CTX.ctx9(state) returns C with v8's fields plus the bound helpers eng_ctx8 used to
// provide (eng_ctx8 is not bundled). It reads only its argument (and the model modules); it never writes. C carries
// the state it was built from (C.state) and its parts under the tree's names (comparison, assumptions, prefs).
// Odds: C.volOf(id) is the one reader of a ticker's period vol (stored entry or the listed vol, floored at the
// comparer's 1%); every EV reading (C.statsAtPeriodVol) uses it whatever the odds switch says; C.stats / C.d follow the
// switch (assumptions.dist). σ stays implied everywhere (the move axis, sizing, placement).
const CTX = (() => {
  const SIZES = Object.freeze([["auto", "Auto"], ["notional", "Equal notional"], ["credit", "Equal credit"], ["vega", "Equal vega"], ["loss", "Equal worst loss"], ["margin", "Equal margin (approx.)"], ["custom", "Custom h"]]);
  // h = B contracts per A contract under each rule (v8 hRatio, h passed in instead of read from the state)
  function hRatio(rule, A, B, sa, sb, h) {
    switch (rule) {
      case "notional": return 1;
      case "credit": return (A.tv / A.S) / (B.tv / B.S);
      case "vega": return (A.vega / A.S) / (B.vega / B.S);
      case "loss": return sa && sb && sa.worst < 0 && sb.worst < 0 ? (sa.worst / A.S) / (sb.worst / B.S) : NaN;
      case "margin": return (A.margin / A.S) / (B.margin / B.S);
      default: return h;
    }
  }
  // the move axis: σ = each instrument's ATM at A's horizon T_A (variance-interpolated), on log price
  function makeAxis(instA, instB, TA, unit, SA) {
    const pick = x => x === "A" ? instA : x === "B" ? instB : x && x.inst !== undefined && x.spot === undefined ? x.inst : x;
    const sig = x => { const I = pick(x); return I ? INST.atmAt(I, TA) * Math.sqrt(TA) : NaN; };
    const isA = I => !!I && !!instA && I.version === instA.version;
    const toS = x => {
      const I = pick(x), S0 = I.spot;
      if (unit === MoveUnit.Sigma) { const s = sig(I); return u => S0 * Math.exp(u * s); }
      if (unit === MoveUnit.Percent) return u => S0 * (1 + u / 100);
      return isA(I) ? u => S0 + u : u => S0 * (1 + u / SA);
    };
    const uOf = x => {
      const I = pick(x), S0 = I.spot;
      if (unit === MoveUnit.Sigma) { const s = sig(I); return S => Math.log(S / S0) / s; }
      if (unit === MoveUnit.Percent) return S => (S / S0 - 1) * 100;
      return isA(I) ? S => S - S0 : S => (S / S0 - 1) * SA;
    };
    return Object.freeze({ unit, T: TA, sig, sigTk: sig, toS, uOf });
  }

  // the period vol of one ticker as a reader reads it (the one reader of state.periodVol; reader: Tab, default the
  // comparer): {pct, source, expiry, storedPct, label}. pct is at least the reader's floor: the comparer reads a 0 set on
  // the Compounding tab ("exactly on the path") as its 1% floor, and the label says so ("vol 1% (set 0%, floored)");
  // the Compounding tab (its port) reads the stored value as it is. NaN for a ticker the data does not list
  /** @param {{ periodVol: any, id: string, reader?: string }} input */
  function readTickerVol({ periodVol, id, reader = Tab.Compare }) {
    const floor = PERIOD_VOL_CONFIG.floor[reader];
    const isListed = typeof id === "string" && INST.has(id);
    const entry = isListed && periodVol && Object.prototype.hasOwnProperty.call(periodVol, id) ? periodVol[id] : null;
    const read = readPeriodVol({ entry, record: isListed ? INST.base(id) : null });
    const isFloorable = Number.isFinite(read.pct) && Number.isFinite(floor);
    const vol = Object.assign({}, read, { storedPct: read.pct, pct: isFloorable ? Math.max(read.pct, floor) : read.pct });
    return Object.freeze(Object.assign(vol, { label: labelPeriodVol(vol) }));
  }
  // A's horizon as the period vol's ATM reference reads it: {T, expiry} of A's listed expiry, or null when A's
  // instrument is not listed
  function readAHorizon(comparison) {
    const Ap = comparison && comparison.A;
    const id = Ap && Ap.inst ? Ap.inst.id : "";
    if (!INST.has(id)) { return null; }
    const I = INST.base(id), expiry = I.nearestExp(Ap.exp);
    if (!expiry) { return null; }
    return { T: I.exp(expiry).T, expiry };
  }
  // the reference vols of one ticker, the one list both tabs show (the comparer's period-vol box, its presets and slider
  // ticks; the Compounding tab's vol menu through its port): the listed vol, ATM at A's horizon (of the listed
  // instrument: a slot's IV shift is a pricing override, not an odds assumption), then the data's realized vols.
  // [{source (VolSource: the preset it sets), label, short (a tick's label), pct, expiry?}]
  /** @param {{ id: string, comparison: any }} input */
  function listPeriodVolRefs({ id, comparison }) {
    if (!INST.has(id)) { return []; }
    const I = INST.base(id), listed = readPeriodVol({ record: I }), horizon = readAHorizon(comparison);
    /** @type {{ source: string, label: string, short: string, pct: number, expiry?: string }[]} */
    const refs = [{ source: VolSource.Hv30, label: nameVolSource(listed), short: nameVolSource(listed), pct: listed.pct }];
    if (horizon) {
      const atm = { source: VolSource.Atm, expiry: horizon.expiry };
      refs.push(Object.assign(atm, { label: nameVolSource(atm), short: "ATM", pct: INST.atmAt(I, horizon.T) * 100 }));
    }
    const listing = INST.list().find(x => x.id === id);
    const realized = listing ? listing.realized : [];
    return refs.concat(realized.map(r => ({ source: VolSource.Set, label: r.label, short: r.short, pct: r.pct })));
  }
  // how an EV label names its odds: "at 117% vol" when every ticker shown has the same rounded vol, else
  // "at period vol (KORU 117%, RAM 102%)" (compact: "at period vol", for a heading whose tip lists the vols)
  /** @param {{ ids: string[], volOf: (id: string) => any, isCompact?: boolean }} input */
  function describeVolOdds({ ids, volOf, isCompact }) {
    const unique = [...new Set(ids.filter(Boolean))];
    const pcts = unique.map(id => Math.round(volOf(id).pct));
    if (!unique.length) { return "at period vol"; }
    if (new Set(pcts).size === 1) { return `at ${pcts[0]}% vol`; }
    if (isCompact) { return "at period vol"; }
    return `at period vol (${unique.map((id, i) => `${id} ${pcts[i]}%`).join(", ")})`;
  }

  function ctx9(state) {
    const comparison = state.comparison, assumptions = state.assumptions, prefs = state.prefs;
    const volCache = new Map();
    const volOf = id => {
      if (!volCache.has(id)) { volCache.set(id, readTickerVol({ periodVol: state.periodVol, id })); }
      return volCache.get(id);
    };
    const Ap = comparison.A, Bp = CMP.resolveB(comparison);
    const A = POS.build(Ap), B = POS.build(Bp, { expMap: comparison.expMap });
    const instA = A.inst || INST.make(Ap.inst), instB = B.inst || INST.make(Bp.inst);
    const same = !!(instA && instB && instA.version === instB.version);
    const unit = assumptions.unit, TA = Number.isFinite(A.T) ? A.T : (instA && instA.exp(instA.nearestExp(Ap.exp)) || { T: 0.1 }).T;
    const SA = instA ? instA.spot : NaN;
    const ax = makeAxis(instA, instB, TA, unit, SA);
    const axis = u => makeAxis(instA, instB, TA, u || unit, SA);
    const toSA = ax.toS(instA), toSB = ax.toS(instB), uOfSA = ax.uOf(instA), uOfSB = ax.uOf(instB);
    const sA = ax.sig(instA), sB = ax.sig(instB);
    const [capLo, capHi] = STATE.rangeCaps(unit, SA);
    let clampNote = "";
    if (assumptions.rlo >= capLo) clampNote = `The lower bound is capped at ${STATE.uLab(-capLo, unit)}`;
    if (assumptions.rhi >= capHi) clampNote = `The upper bound is capped at ${STATE.uLab(capHi, unit)}`;
    const lo = -Math.min(assumptions.rlo, capLo), hi = Math.min(assumptions.rhi, capHi);
    const [wlo, whi] = assumptions.wl === WorstLossRange.View ? [lo, hi] : [-Math.min(assumptions.wlo, capLo), Math.min(assumptions.whi, capHi)];
    const shock = Object.freeze({ ivs: assumptions.ivs, svs: assumptions.svs, svd: assumptions.svd });
    // a position's distribution at its own expiry: under the odds switch, or the odds asked for
    const distOf = (b, odds) => b && b.E ? DIST.make({ expiry: b.E, odds: odds || assumptions.dist, vol: volOf(b.inst.id).pct / 100 }) : null;
    const stats = (b, odds) => b && !b.na ? POS.stats(b, distOf(b, odds)) : null;
    // every EV reading: at the ticker's period vol, whatever the switch says
    const statsAtPeriodVol = b => stats(b, Odds.PeriodVol);
    const periodVolRefs = id => listPeriodVolRefs({ id, comparison });
    // {ids?: tickers (default A's and B's), isCompact?: one shared phrase when the vols differ}
    /** @param {{ ids?: string[], isCompact?: boolean }} [options] */
    const volOddsText = ({ ids, isCompact } = {}) => describeVolOdds({ ids: ids || [A.tk, B.tk], volOf, isCompact: !!isCompact });
    // the odds switch in words: "implied", or the period vol ("at 117% vol")
    const oddsText = () => assumptions.dist === Odds.Implied ? "implied" : volOddsText();
    const worstIn9 = (b, Slo, Shi) => POS.worstIn(b, Slo, Shi);
    const sFor = (b, toS, mode) => { const s = stats(b, mode); return s ? Object.assign({}, s, { worst: worstIn9(b, toS(wlo), toS(whi)) }) : null; };
    const sa = sFor(A, toSA), sb = sFor(B, toSB);
    const rule = comparison.sizing.rule === "auto" ? (same ? "notional" : "vega") : comparison.sizing.rule;
    let h = 1, hNote = "";
    if (rule === "custom") h = clamp(+comparison.sizing.h || 1, 0.05, 20);
    else if (!A.na && !B.na) { const r = hRatio(rule, A, B, sa, sb, comparison.sizing.h); if (Number.isFinite(r) && r > 0) h = r; else hNote = rule === "loss" ? "one side has no loss inside the worst-loss range; using h = 1" : "rule undefined here; using h = 1"; }
    else if (rule !== "notional") hNote = "a position is n/a; using h = 1";
    const sameExp = A.dte === B.dte, cal = assumptions.align === Align.Calendar || sameExp;
    const Hd = cal ? Math.max(A.dte, B.dte) : null;
    const d = distOf(A), dB = distOf(B);
    // values on the shared move axis u, in units of A's notional (B scaled by h)
    const vA = (u, tau) => POS.val(A, toSA(u), tau, shock) / A.S;
    const vB = (u, tau) => h * POS.val(B, toSB(u), tau, shock) / B.S;
    const pA = u => A.na ? NaN : POS.payoff(A, toSA(u)) / A.S;
    const pB = u => B.na ? NaN : h * POS.payoff(B, toSB(u)) / B.S;
    const xA = u => Math.log(toSA(u) / A.S);
    const xB = u => Math.log(toSB(u) / B.S);
    // % of margin rescales the one page scale by A's margin at entry (fixed, so the payoff divides by a constant); under
    // "Equal margin" sizing B's line is then B's own return on its margin
    const units = prefs.units, crOK = !A.na && A.tv > 0, marginOK = !A.na && A.margin > 0;
    function fU(v, dd) {
      if (!Number.isFinite(v)) return "–";
      // a value that rounds to zero at the printed precision (pinning noise is ~1e-9 of notional) prints as 0, unsigned
      const sg = n => +n === 0 ? n : (v < 0 ? MINUS : "+") + n;
      if (units === ReadingUnit.Usd) { const x = Math.abs(v * A.S * 100); return sg(x.toFixed(dd ?? (x < 10 ? 2 : 0))).replace(/^([−+]?)/, "$1$$"); }
      if (units === ReadingUnit.Credit && crOK) { const x = Math.abs(v / (A.tv / A.S)); const k = dd != null && x >= 1 ? dd : x >= 10 ? 1 : x >= 1 ? 2 : Math.min(4, Math.max(2, 1 - Math.floor(Math.log10(x || 1e-9)))); return sg(x.toFixed(k)) + "×"; }
      if (units === ReadingUnit.Margin && marginOK) { const x = Math.abs(v * A.S / A.margin * 100); return sg(x.toFixed(dd ?? (x < 1 ? 2 : 1))) + "% m"; }
      const x = Math.abs(v * 100); return sg(x.toFixed(dd ?? (x < 1 ? 2 : 1))) + "%";
    }
    function fUt(t, step) {
      let s = step * 100;
      if (units === ReadingUnit.Usd) s = step * A.S * 100; else if (units === ReadingUnit.Credit && crOK) s = step / (A.tv / A.S);
      else if (units === ReadingUnit.Margin && marginOK) s = step * A.S / A.margin * 100;
      return fU(t, s >= 1 ? 0 : s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3);
    }
    const unitName = () => units === ReadingUnit.Usd ? "$ per A contract" : units === ReadingUnit.Margin && marginOK ? "% of A's margin" : units === ReadingUnit.Credit && crOK ? (A.intr > 0 ? "multiples of A's time value" : "multiples of A's credit") : "% of A's notional";
    const unitsNote = units === ReadingUnit.Margin && !marginOK ? "A has no margin figure, so values show % of A's notional" : units === ReadingUnit.Credit && !crOK ? (A.na ? "A is n/a, so values show % of A's notional" : "A's time value is not positive, so values show % of A's notional instead of multiples of it") : "";
    const hTxt = () => Math.abs(h - 1) < 0.005 ? "B" : `${h.toFixed(2)}·B`;
    const diff = CMP.diff(comparison, A, B);
    const labels = Object.freeze({ A: A.label, B: B.label, title: `${A.label.tab} vs ${B.label.tab}` });
    const tag = (f, side) => Object.freeze(Object.assign({}, f, { side }, f.fix ? { fix: Object.freeze(Object.assign({}, f.fix, { side })) } : {}));
    const flags = Object.freeze([...A.flags.map(f => tag(f, "A")), ...B.flags.map(f => tag(f, "B"))]);
    const diffExp = A.exp !== B.exp;
    const sigAxisLabel = diffExp && Number.isFinite(A.dte) ? `σ over A's ${A.dte} days` : "σ";
    const sigOwnSuffix = b => diffExp && b && b.exp ? ` to ${fmtE(b.exp)}` : "";
    return {
      state, comparison, assumptions, prefs, Ap, Bp, A, B, instA, instB, sa, sb, sFor, stats, statsAtPeriodVol, volOf, periodVolRefs, volOddsText, oddsText, worstIn9, distOf, h, hNote, rule, same, unit,
      ax, axis, sA, sB, toSA, toSB, uOfSA, uOfSB, lo, hi, wlo, whi, sameExp, cal, Hd, d, dB, clampNote, shock,
      vA, vB, pA, pB, xA, xB, fU, fUt, unitName, unitsNote, hTxt, hRatio, uStep: STATE.uStep, uRound: STATE.uRound, rangeCaps: STATE.rangeCaps, uLab: STATE.uLab,
      UNAME: STATE.UNAME, SIZES, diff, labels, flags, sigAxisLabel, sigOwnSuffix
    };
  }
  return Object.freeze({ ctx9, hRatio, makeAxis, readTickerVol, listPeriodVolRefs, describeVolOdds, SIZES });
})();
