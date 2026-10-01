// ============================================================ statistics at expiry
// EV and odds are closed-form: EV = credit − e^{rT}·(model value of the legs) under implied odds, or the
// zero-drift lognormal value under HV30 odds; profit odds come from the distribution at the breakevens.
const bs0 = (S, K, T, s, cp) => { const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + s * s / 2 * T) / v, d2 = d1 - v; return cp === "C" ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1); };
const SB = new Map();
function statsBase(b) {
  if (b.na) return null;
  const key = b.key + st.dist + st.hvk, hit = SB.get(key); if (hit) return hit;
  const d = dist(b.tk, b.exp), S = b.S, T = b.T;
  let legs;
  if (st.dist === "rn") legs = b.sp.mid + b.sc.mid - (b.cap ? b.cap.mid : 0);   // market value of the legs at entry
  else { const h = d.hs; legs = bs0(S, b.sp.K, T, h, "P") + bs0(S, b.sc.K, T, h, "C") - (b.cap ? bs0(S, b.cap.K, T, h, "C") : 0); }
  const ev = b.cr - legs;
  const beLo = b.sp.K - b.cr;
  const beHi = b.cap ? (b.sc.K + b.cr < b.cap.K ? b.sc.K + b.cr : null) : b.sc.K + b.cr;
  const F = K => K <= 0 ? 0 : cdfT(d, Math.log(K / S));
  const pop = (beHi ? F(beHi) : 1) - F(beLo);
  const capBE = b.cap ? b.cap.K + b.capPx : null;
  const pCap = capBE ? 1 - F(capBE) : null;
  const s = { pop, ev, beLo, beHi, capBE, pCap }; SB.set(key, s); return s;
}
function worstIn(b, Slo, Shi) {
  if (b.na) return NaN;
  let w = Math.min(payoff(b, Slo), payoff(b, Shi));
  for (const K of [b.sp.K, b.sc.K, b.cap && b.cap.K]) if (K && K > Slo && K < Shi) w = Math.min(w, payoff(b, K));
  return w;
}

// ============================================================ move units, one scenario axis for every panel
// u is a move in the header unit. σ = ATM implied vol at A's expiry × √(A's days / 365), per ticker, on log price.
// A's ticker: price = A's spot moved by u. Other ticker: same number of its own σ (σ), same % (%), or
// in points mode the same % as A's points (points are only offered with one ticker in the pair).
const UNAME = { sig: "σ", pct: "%", pts: "points" };
const uStep = unit => unit === "sig" ? 0.25 : unit === "pct" ? 5 : 0.5;
const uRound = (v, unit) => unit === "sig" ? Math.round(v * 20) / 20 : unit === "pct" ? Math.round(v) : Math.round(v * 20) / 20;
function axisFor(A, unit) {
  const sigTk = tk => (D.u[tk].exps[A.exp].atm) * Math.sqrt(A.T);
  const toS = tk => {
    const S0 = D.u[tk].S;
    if (unit === "sig") { const s = sigTk(tk); return u => S0 * Math.exp(u * s); }
    if (unit === "pct") return u => S0 * (1 + u / 100);
    return tk === A.tk ? u => S0 + u : u => S0 * (1 + u / A.S);
  };
  const uOf = tk => {
    const S0 = D.u[tk].S;
    if (unit === "sig") { const s = sigTk(tk); return S => Math.log(S / S0) / s; }
    if (unit === "pct") return S => (S / S0 - 1) * 100;
    return tk === A.tk ? S => S - S0 : S => (S / S0 - 1) * A.S;
  };
  return { sigTk, toS, uOf };
}
function rangeCaps(unit, S) { return unit === "pct" ? [95, 2000] : unit === "pts" ? [+(S * 0.95).toFixed(2), +(S * 20).toFixed(2)] : [12, 12]; }
function uLab(u, unit, dec) {
  const sg = Math.abs(u) < 1e-9 ? "" : u < 0 ? MINUS : "+", a = Math.abs(u);
  if (unit === "sig") return sg + String(+a.toFixed(dec ?? 2)) + "σ";
  if (unit === "pct") return sg + String(+a.toFixed(dec ?? 1)) + "%";
  return sg + String(+a.toFixed(dec ?? 2));
}

// ============================================================ A, B, sizing
function Bdef() {
  const A = st.A;
  switch (st.along) {
    case "st": return { ...A, st: A.st === "cap" ? "str" : "cap" };
    case "tk": return { ...A, tk: A.tk === "RAM" ? "KORU" : "RAM" };
    case "fill": return { ...A, fill: A.fill === "mid" ? "nat" : "mid" };
    case "exp": { let e = st.bexp; if (e === A.exp) e = EXPS[(EXPS.indexOf(A.exp) + 1) % EXPS.length]; return { ...A, exp: e }; }
    case "k": return { ...A, ...st.bk };
    default: return st.Bf || { ...A };
  }
}
const SIZES = [["auto", "Auto"], ["notional", "Equal notional"], ["credit", "Equal credit"], ["vega", "Equal vega"], ["loss", "Equal worst loss"], ["margin", "Equal margin (approx.)"], ["custom", "Custom h"]];
function hRatio(rule, A, B, sa, sb) {
  switch (rule) {
    case "notional": return 1;
    case "credit": return (A.cr / A.S) / (B.cr / B.S);
    case "vega": return (A.vega / A.S) / (B.vega / B.S);
    case "loss": return (sa.worst < 0 && sb.worst < 0) ? (sa.worst / A.S) / (sb.worst / B.S) : NaN;
    case "margin": return (A.margin / A.S) / (B.margin / B.S);
    default: return st.hc;
  }
}
// keep points valid: points need one ticker; convert the range to σ when B moves to the other ticker
let unitNote = "";
function ensureUnit() {
  const B = Bdef();
  if (st.unit === "pts" && B.tk !== st.A.tk) {
    const A = build(st.A), ax = axisFor(A, "sig"), S = A.S;
    const lo = Math.max(st.rlo, 0), hi = Math.max(st.rhi, 0);
    st.unit = "sig"; st.rlo = uRound(-ax.uOf(A.tk)(Math.max(S - lo, S * 0.05)), "sig") || 0.05; st.rhi = uRound(ax.uOf(A.tk)(S + hi), "sig") || 0.05;
    st.wlo = st.rlo; st.whi = st.rhi; if (Math.abs(st.rlo - st.rhi) > 1e-9) st.rlink = false;
    unitNote = "Points need one ticker, so the move range was converted to σ";
  }
}
let C = null;
function context() {
  const Ap = st.A, Bp = Bdef(), A = build(Ap), B = build(Bp);
  const same = A.tk === B.tk, unit = st.unit;
  const ax = axisFor(A, unit), toSA = ax.toS(A.tk), toSB = ax.toS(B.tk), uOfSA = ax.uOf(A.tk), uOfSB = ax.uOf(B.tk);
  const sA = ax.sigTk(A.tk), sB = ax.sigTk(B.tk);
  // clamp the range itself so the inputs always show what the charts use
  const [capLo, capHi] = rangeCaps(unit, A.S);
  let clampNote = "";
  if (st.rlo > capLo) { st.rlo = capLo; clampNote = `The lower bound is capped at ${uLab(-capLo, unit)}`; }
  if (st.rhi > capHi) { st.rhi = capHi; clampNote = `The upper bound is capped at ${uLab(capHi, unit)}`; }
  if (clampNote && st.rlink && Math.abs(st.rlo - st.rhi) > 1e-9) st.rlink = false;
  if (st.wlo > capLo) st.wlo = capLo; if (st.whi > capHi) st.whi = capHi;
  const lo = -st.rlo, hi = st.rhi;
  const [wlo, whi] = st.wl === "view" ? [lo, hi] : [-st.wlo, st.whi];
  const sFor = (b, toS) => { const s = statsBase(b); return s ? { ...s, worst: worstIn(b, toS(wlo), toS(whi)) } : null; };
  const sa = sFor(A, toSA), sb = sFor(B, toSB);
  const rule = st.size === "auto" ? (same ? "notional" : "vega") : st.size;
  let h = 1, hNote = "";
  if (rule === "custom") h = clamp(+st.hc || 1, 0.05, 20);
  else if (!A.na && !B.na) { const r = hRatio(rule, A, B, sa, sb); if (Number.isFinite(r) && r > 0) h = r; else hNote = rule === "loss" ? "one side has no loss inside the worst-loss range; using h = 1" : "rule undefined here; using h = 1"; }
  else if (rule !== "notional") hNote = "a position is n/a; using h = 1";
  const sameExp = A.dte === B.dte, cal = st.align === "cal" || sameExp;
  const Hd = cal ? Math.max(A.dte, B.dte) : null;
  return C = { Ap, Bp, A, B, sa, sb, sFor, h, hNote, rule, same, unit, ax, sA, sB, toSA, toSB, uOfSA, uOfSB, lo, hi, wlo, whi, sameExp, cal, Hd, d: dist(A.tk, A.exp), dB: dist(B.tk, B.exp), clampNote };
}
// values on the shared move axis u, in units of A's notional (B scaled by h)
const vA = (u, tau) => val(C.A, C.toSA(u), tau) / C.A.S;
const vB = (u, tau) => C.h * val(C.B, C.toSB(u), tau) / C.B.S;
const pA = u => C.A.na ? NaN : payoff(C.A, C.toSA(u)) / C.A.S;
const pB = u => C.B.na ? NaN : C.h * payoff(C.B, C.toSB(u)) / C.B.S;
const xA = u => Math.log(C.toSA(u) / C.A.S);
const xB = u => Math.log(C.toSB(u) / C.B.S);
function fU(v, d) {
  if (!Number.isFinite(v)) return "–";
  const sg = Math.abs(v) < 1e-12 ? "" : v < 0 ? MINUS : "+";
  if (st.units === "usd") { const x = Math.abs(v * C.A.S * 100); return sg + "$" + x.toFixed(d ?? (x < 10 ? 2 : 0)); }
  if (st.units === "cr" && !C.A.na && C.A.cr > 0) { const x = Math.abs(v / (C.A.cr / C.A.S)); const dd = d != null && x >= 1 ? d : x >= 10 ? 1 : x >= 1 ? 2 : Math.min(4, Math.max(2, 1 - Math.floor(Math.log10(x || 1e-9)))); return sg + x.toFixed(dd) + "×"; }
  const x = Math.abs(v * 100); return sg + x.toFixed(d ?? (x < 1 ? 2 : 1)) + "%";
}
function fUt(t, step) {
  let s = step * 100;
  if (st.units === "usd") s = step * C.A.S * 100; else if (st.units === "cr" && !C.A.na && C.A.cr > 0) s = step / (C.A.cr / C.A.S);
  return fU(t, s >= 1 ? 0 : s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3);
}
const unitName = () => st.units === "usd" ? "$ per A contract" : st.units === "cr" ? "multiples of A's credit" : "% of A's notional";
const hTxt = () => Math.abs(C.h - 1) < 0.005 ? "B" : `${C.h.toFixed(2)}·B`;
