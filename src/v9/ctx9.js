// ============================================================ ctx9: the render context C, computed from S9 (pure)
// One namespace object, CTX. CTX.ctx9(S9) returns C with v8's fields plus the bound helpers eng_ctx8 used to
// provide (eng_ctx8 is not bundled). It reads only its argument (and the model modules); it never writes.
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
      if (unit === "sig") { const s = sig(I); return u => S0 * Math.exp(u * s); }
      if (unit === "pct") return u => S0 * (1 + u / 100);
      return isA(I) ? u => S0 + u : u => S0 * (1 + u / SA);
    };
    const uOf = x => {
      const I = pick(x), S0 = I.spot;
      if (unit === "sig") { const s = sig(I); return S => Math.log(S / S0) / s; }
      if (unit === "pct") return S => (S / S0 - 1) * 100;
      return isA(I) ? S => S - S0 : S => (S / S0 - 1) * SA;
    };
    return Object.freeze({ unit, T: TA, sig, sigTk: sig, toS, uOf });
  }

  function ctx9(S9) {
    const cmp = S9.cmp, scen = S9.scen, view = S9.view;
    const Ap = cmp.A, Bp = CMP.resolveB(cmp);
    const A = POS.build(Ap), B = POS.build(Bp, { expMap: cmp.expMap });
    const instA = A.inst || INST.make(Ap.inst), instB = B.inst || INST.make(Bp.inst);
    const same = !!(instA && instB && instA.version === instB.version);
    const unit = scen.unit, TA = Number.isFinite(A.T) ? A.T : (instA && instA.exp(instA.nearestExp(Ap.exp)) || { T: 0.1 }).T;
    const SA = instA ? instA.spot : NaN;
    const ax = makeAxis(instA, instB, TA, unit, SA);
    const axis = u => makeAxis(instA, instB, TA, u || unit, SA);
    const toSA = ax.toS(instA), toSB = ax.toS(instB), uOfSA = ax.uOf(instA), uOfSB = ax.uOf(instB);
    const sA = ax.sig(instA), sB = ax.sig(instB);
    const [capLo, capHi] = STATE.rangeCaps(unit, SA);
    let clampNote = "";
    if (scen.rlo >= capLo) clampNote = `The lower bound is capped at ${STATE.uLab(-capLo, unit)}`;
    if (scen.rhi >= capHi) clampNote = `The upper bound is capped at ${STATE.uLab(capHi, unit)}`;
    const lo = -Math.min(scen.rlo, capLo), hi = Math.min(scen.rhi, capHi);
    const [wlo, whi] = scen.wl === "view" ? [lo, hi] : [-Math.min(scen.wlo, capLo), Math.min(scen.whi, capHi)];
    const shock = Object.freeze({ ivs: scen.ivs, svs: scen.svs, svd: scen.svd });
    const distOf = (b, mode) => b && b.E ? DIST.make(b.E, b.S, mode || scen.dist, b.inst.hv, scen.hvk) : null;
    const stats = (b, mode) => b && !b.na ? POS.stats(b, distOf(b, mode)) : null;
    const statsHV = b => stats(b, "hv");
    const worstIn9 = (b, Slo, Shi) => POS.worstIn(b, Slo, Shi);
    const sFor = (b, toS, mode) => { const s = stats(b, mode); return s ? Object.assign({}, s, { worst: worstIn9(b, toS(wlo), toS(whi)) }) : null; };
    const sa = sFor(A, toSA), sb = sFor(B, toSB);
    const rule = cmp.sizing.rule === "auto" ? (same ? "notional" : "vega") : cmp.sizing.rule;
    let h = 1, hNote = "";
    if (rule === "custom") h = clamp(+cmp.sizing.h || 1, 0.05, 20);
    else if (!A.na && !B.na) { const r = hRatio(rule, A, B, sa, sb, cmp.sizing.h); if (Number.isFinite(r) && r > 0) h = r; else hNote = rule === "loss" ? "one side has no loss inside the worst-loss range; using h = 1" : "rule undefined here; using h = 1"; }
    else if (rule !== "notional") hNote = "a position is n/a; using h = 1";
    const sameExp = A.dte === B.dte, cal = scen.align === "cal" || sameExp;
    const Hd = cal ? Math.max(A.dte, B.dte) : null;
    const d = distOf(A), dB = distOf(B);
    // values on the shared move axis u, in units of A's notional (B scaled by h)
    const vA = (u, tau) => POS.val(A, toSA(u), tau, shock) / A.S;
    const vB = (u, tau) => h * POS.val(B, toSB(u), tau, shock) / B.S;
    const pA = u => A.na ? NaN : POS.payoff(A, toSA(u)) / A.S;
    const pB = u => B.na ? NaN : h * POS.payoff(B, toSB(u)) / B.S;
    const xA = u => Math.log(toSA(u) / A.S);
    const xB = u => Math.log(toSB(u) / B.S);
    const units = view.units, crOK = !A.na && A.tv > 0;
    function fU(v, dd) {
      if (!Number.isFinite(v)) return "–";
      // a value that rounds to zero at the printed precision (pinning noise is ~1e-9 of notional) prints as 0, unsigned
      const sg = n => +n === 0 ? n : (v < 0 ? MINUS : "+") + n;
      if (units === "usd") { const x = Math.abs(v * A.S * 100); return sg(x.toFixed(dd ?? (x < 10 ? 2 : 0))).replace(/^([−+]?)/, "$1$$"); }
      if (units === "cr" && crOK) { const x = Math.abs(v / (A.tv / A.S)); const k = dd != null && x >= 1 ? dd : x >= 10 ? 1 : x >= 1 ? 2 : Math.min(4, Math.max(2, 1 - Math.floor(Math.log10(x || 1e-9)))); return sg(x.toFixed(k)) + "×"; }
      const x = Math.abs(v * 100); return sg(x.toFixed(dd ?? (x < 1 ? 2 : 1))) + "%";
    }
    function fUt(t, step) {
      let s = step * 100;
      if (units === "usd") s = step * A.S * 100; else if (units === "cr" && crOK) s = step / (A.tv / A.S);
      return fU(t, s >= 1 ? 0 : s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3);
    }
    const unitName = () => units === "usd" ? "$ per A contract" : units === "cr" && crOK ? (A.intr > 0 ? "multiples of A's time value" : "multiples of A's credit") : "% of A's notional";
    const unitsNote = units === "cr" && !crOK ? (A.na ? "A is n/a, so values show % of A's notional" : "A's time value is not positive, so values show % of A's notional instead of multiples of it") : "";
    const hTxt = () => Math.abs(h - 1) < 0.005 ? "B" : `${h.toFixed(2)}·B`;
    const diff = CMP.diff(cmp, A, B);
    const labels = Object.freeze({ A: A.label, B: B.label, title: `${A.label.tab} vs ${B.label.tab}` });
    const tag = (f, side) => Object.freeze(Object.assign({}, f, { side }, f.fix ? { fix: Object.freeze(Object.assign({}, f.fix, { side })) } : {}));
    const flags = Object.freeze([...A.flags.map(f => tag(f, "A")), ...B.flags.map(f => tag(f, "B"))]);
    const diffExp = A.exp !== B.exp;
    const sigAxisLabel = diffExp && Number.isFinite(A.dte) ? `σ over A's ${A.dte} days` : "σ";
    const sigOwnSuffix = b => diffExp && b && b.exp ? ` to ${fmtE(b.exp)}` : "";
    return {
      S9, cmp, scen, view, Ap, Bp, A, B, instA, instB, sa, sb, sFor, stats, statsHV, worstIn9, distOf, h, hNote, rule, same, unit,
      ax, axis, sA, sB, toSA, toSB, uOfSA, uOfSB, lo, hi, wlo, whi, sameExp, cal, Hd, d, dB, clampNote, shock,
      vA, vB, pA, pB, xA, xB, fU, fUt, unitName, unitsNote, hTxt, hRatio, uStep: STATE.uStep, uRound: STATE.uRound, rangeCaps: STATE.rangeCaps, uLab: STATE.uLab,
      UNAME: STATE.UNAME, SIZES, diff, labels, flags, sigAxisLabel, sigOwnSuffix
    };
  }
  return Object.freeze({ ctx9, hRatio, makeAxis, SIZES });
})();
