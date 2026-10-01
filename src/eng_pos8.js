// ============================================================ positions
// deepest listed delta (×100) on the in-the-money side of a chain: puts with the highest strike, calls with the lowest.
// D.maxDelta[tk][exp] wins when the data file has it ({P, C}, {put, call} or {puts, calls}; percent or fraction)
const MDC = {};
// returns { stop: highest slider target that still means something, d: the deepest strike's delta ×100, K: its strike }
function maxDelta(tk, exp, cp) {
  const k = tk + exp + cp; if (MDC[k]) return MDC[k];
  const { calls, puts } = chain(tk, exp), a = (cp === "P" ? puts : calls).filter(o => o.bid > 0), F = D.u[tk].exps[exp].F;
  const deep = a.length ? (cp === "P" ? a[a.length - 1] : a[0]) : null;
  let v = NaN, mK = NaN;
  try { const m = D.maxDelta && D.maxDelta[tk] && D.maxDelta[tk][exp]; if (m != null && typeof m === "object") { for (const f of (cp === "P" ? ["P", "p", "put", "puts"] : ["C", "c", "call", "calls"])) if (m[f] != null) { v = Math.abs(+m[f]); break; } const mk = +m[cp === "P" ? "putK" : "callK"]; if (Number.isFinite(mk) && mk > 0) mK = mk; } } catch (e) { v = NaN; }
  if (Number.isFinite(v) && v > 0) v = v <= 1 ? v * 100 : v;
  else v = deep ? Math.abs(deep.d) * 100 : 50;
  // with high vol and long dates even in-the-money deltas can read below 50; any target above 50 then picks the deepest strike
  const f = a.length ? a.reduce((x, y) => Math.abs(y.K - F) < Math.abs(x.K - F) ? y : x) : null, deeper = !!f && a.some(o => cp === "P" ? o.K > f.K : o.K < f.K);
  const stop = v > 50.5 ? Math.min(DMAX, Math.round(v * 2) / 2) : deeper ? 51 : 50;
  return MDC[k] = { stop, d: v, K: Number.isFinite(mK) ? mK : deep ? deep.K : NaN };
}
const QC = {};
function chain(tk, exp) {
  const k = tk + exp; if (QC[k]) return QC[k];
  const U = D.u[tk], E = U.exps[exp];
  const q = E.q.map(o => { const iv = smile(E, o.K, E.F); return { K: o.K, cp: o.cp, bid: o.bid || 0, ask: o.ask || 0, mid: Number.isFinite(o.mid) ? o.mid : o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : o.bid || 0, ivm: o.ivm, iv, d: bsDelta(U.S, o.K, E.T, iv, o.cp) }; });
  const calls = q.filter(o => o.cp === "C").sort((a, b) => a.K - b.K), puts = q.filter(o => o.cp === "P").sort((a, b) => a.K - b.K);
  // parity-implied forward from call − put mids at the (up to) three listed strikes nearest the money: F = K + e^{rT}(C − P).
  // On these leveraged ETFs it sits below S·e^{rT} (a borrow cost), so in-the-money legs are priced off it, not off S·e^{rT}
  const pairs = [];
  for (const c of calls) { const p = puts.find(x => x.K === c.K); if (p && c.bid > 0 && p.bid > 0 && c.mid > 0 && p.mid > 0) pairs.push({ K: c.K, F: c.K + Math.exp(R * E.T) * (c.mid - p.mid) }); }
  pairs.sort((a, b) => Math.abs(a.K - U.S) - Math.abs(b.K - U.S));
  const near3 = pairs.slice(0, 3), Fimpl = near3.length ? near3.reduce((t, p) => t + p.F, 0) / near3.length : U.S * Math.exp(R * E.T);
  return QC[k] = { q, calls, puts, Fimpl: Fimpl > 0 ? Fimpl : U.S * Math.exp(R * E.T) };
}
const BC = new Map();
function build(P) {
  const key = [P.tk, P.exp, P.st, P.pd, P.cd, P.capd, P.fill].join("|");
  const hit = BC.get(key); if (hit) return hit;
  const U = D.u[P.tk], E = U.exps[P.exp], S = U.S, T = E.T, F = E.F, { calls, puts } = chain(P.tk, P.exp);
  const pE = puts.filter(o => o.bid > 0), cE = calls.filter(o => o.bid > 0);
  const nearF = a => a.reduce((x, y) => Math.abs(y.K - F) < Math.abs(x.K - F) ? y : x);
  const nearD = (a, t) => a.reduce((x, y) => Math.abs(Math.abs(y.d) - t) < Math.abs(Math.abs(x.d) - t) ? y : x);
  // 50 = the strike nearest the forward; below 50 the strike with the nearest delta (as v7);
  // above 50 the in-the-money strike (put above, call below the forward strike) with the nearest delta
  const pick = (a, t, cp) => {
    if (t === 50) return nearF(a);
    if (t < 50) return nearD(a, t / 100);
    const f = nearF(a), itm = a.filter(o => cp === "P" ? o.K >= f.K : o.K <= f.K);
    return nearD(itm.length ? itm : a, t / 100);
  };
  let sp = pick(pE, P.pd, "P"), sc = pick(cE, P.cd, "C");
  const itmP = P.pd > 50, itmC = P.cd > 50;
  let inv = false;
  // v7 rule, kept for out-of-the-money targets: a put that lands above the call moves down to the call strike.
  // with an in-the-money target the put may sit above the call: a short guts
  if (sp.K > sc.K && !itmP && !itmC) { inv = true; const lo = pE.filter(o => o.K <= sc.K); if (lo.length) sp = lo[lo.length - 1]; }
  const guts = sp.K > sc.K;
  let cap = null, capNA = "", capFb = false;
  if (P.st === "cap") {
    if (P.cd <= P.capd) capNA = "cap Δ at or above the short-call Δ";
    else {
      const up = calls.filter(o => o.K > sc.K && o.ask > 0);
      if (!up.length) capNA = "no listed call above the short call (raise call Δ to free one)";
      else { cap = up.find(o => o.d < P.capd / 100); if (!cap) { cap = up[up.length - 1]; capFb = true; } }
    }
  }
  const nat = P.fill === "nat", sell = o => nat ? o.bid : o.mid, buy = o => nat ? o.ask : o.mid, hs = o => Math.max(0, (o.ask - o.bid) / 2);
  const crS = sell(sp) + sell(sc), capPx = cap ? buy(cap) : 0, cr = crS - capPx;
  const exitCost = nat ? hs(sp) + hs(sc) + (cap ? hs(cap) : 0) : 0;
  const vega = -bsVega(S, sp.K, T, sp.iv) - bsVega(S, sc.K, T, sc.iv) + (cap ? bsVega(S, cap.K, T, cap.iv) : 0);
  // marks are pinned to each leg's traded mid at entry: a per-leg vol offset to the fitted smile, held as spot and time move
  const adj = o => { const v = impliedVol(o.mid, S, o.K, T, o.cp); return Number.isFinite(v) ? v - o.iv : 0; };
  // an in-the-money leg takes its vol offset from the out-of-the-money option at the same strike, so it is priced
  // from that option through put-call parity on the forward (a deep-ITM mid says little about vol)
  // parity runs on the parity-implied forward of this expiry, carried as a rate g so it scales with the spot scenario
  const Fi = chain(P.tk, P.exp).Fimpl, g = Math.log(Fi / S) / T;
  const sib = o => chain(P.tk, P.exp).q.find(x => x.K === o.K && x.cp !== o.cp && x.bid > 0 && x.mid > 0);
  const adjItm = o => { const x = sib(o); if (x) { const v = impliedVol(x.mid, S, x.K, T, x.cp); if (Number.isFinite(v)) return { a: v - x.iv, from: x, par: { cp: x.cp, adj: v - x.iv, g } }; } return { a: adj(o), from: null, par: null }; };
  const jP = itmP ? adjItm(sp) : { a: adj(sp), from: null, par: null }, jC = itmC ? adjItm(sc) : { a: adj(sc), from: null, par: null };
  const adjSp = jP.a, adjSc = jC.a, adjCap = cap ? adj(cap) : 0;
  // intrinsic at entry (against spot) and time value = credit − intrinsic; for out-of-the-money legs time value = credit
  const DF = Math.exp(-R * T);
  const legI = (o, px, cp, j) => {
    const intr = Math.max(0, cp === "P" ? o.K - S : S - o.K), tvl = o.mid - intr, carry = o.K * (1 - DF);
    const par = j && j.from ? j.from.mid + (cp === "P" ? DF * (o.K - Fi) : DF * (Fi - o.K)) : NaN;   // parity value from the OTM twin, on the implied forward
    return { intr, px, tv: px - intr, tvMid: tvl, below: intr > 0 && o.mid < intr - 1e-9, ea: intr > 0 && tvl < Math.max(0.05, carry), carry, par, from: j && j.from };
  };
  const iP = legI(sp, sell(sp), "P", jP), iC = legI(sc, sell(sc), "C", jC);
  const iCap = cap ? Math.max(0, S - cap.K) : 0, intr = iP.intr + iC.intr - iCap, tv = cr - intr;
  const L = U.lev, f20 = Math.min(1, 0.2 * L), f10 = Math.min(1, 0.1 * L);
  const rP = sell(sp) + Math.max(f20 * S - Math.max(0, S - sp.K), f10 * sp.K);
  const rCnaked = sell(sc) + Math.max(f20 * S - Math.max(0, sc.K - S), f10 * S);
  const rC = cap ? Math.min(cap.K - sc.K, rCnaked) : rCnaked;     // a covered call side never costs more than a naked one
  const margin = rP >= rC ? rP + sell(sc) - capPx : rC + sell(sp);
  const b = { key, P, tk: P.tk, exp: P.exp, U, E, S, T, F, dte: E.dte, sig: E.atm * Math.sqrt(T), sp, sc, cap, capNA, capFb, inv,
    straddle: sp.K === sc.K, guts, itmP, itmC, parP: jP.par, parC: jC.par, Fimpl: Fi, crS, capPx, cr, intr, tv, iP, iC, exitCost, vega, margin, adjSp, adjSc, adjCap, na: !!capNA };
  BC.set(key, b); return b;
}
const legTxt = b => (b.straddle ? `${fK(b.sp.K)} straddle` : `${fK(b.sp.K)}P / ${fK(b.sc.K)}C`) + (b.guts ? " guts" : "") + (b.cap ? ` / +${fK(b.cap.K)}C` : "");
// a short guts
// (the put strike above the call strike, which needs at least one leg in the money)
const kindName = P => (P.pd > 50 || P.cd > 50) && TKS.includes(P.tk) && EXPS.includes(P.exp) && build(P).guts ? (P.st === "cap" ? "capped guts" : "guts") : P.st === "cap" ? "capped" : "strangle";
const posName = (P, short) => `${P.tk} ${fmtE(P.exp)} ${kindName(P)}` + (short ? "" : ` · ${dTxt(P)} · ${P.fill === "mid" ? "mid" : "natural"}`);
const dTxt = P => `${P.pd === 50 ? "ATM" : +P.pd.toFixed(1)}/${P.cd === 50 ? "ATM" : +P.cd.toFixed(1)}` + (P.st === "cap" ? `/${+P.capd.toFixed(1)}` : "");

function ivAt(b, K, x, tau, adj) {
  let v = smile(b.E, K, x * Math.exp(R * tau)) + (adj || 0) + st.ivs / 100;
  if (st.svs) { const m = Math.log(x / b.S); if (!(st.svd && m > 0)) v += st.svs / 100 * (-m / 0.1); }
  return Math.max(0.05, v);
}
function payoff(b, x) { let v = b.cr - Math.max(b.sp.K - x, 0) - Math.max(x - b.sc.K, 0); if (b.cap) v += Math.max(x - b.cap.K, 0); return v; }
// a short leg's model value; an in-the-money leg with an out-of-the-money twin is that twin (pinned to its own mid)
// plus the parity term on the implied forward, so it tends to intrinsic at expiry
function legPx(b, K, cp, par, adj, x, tau) {
  if (!par) return bs(x, K, tau, ivAt(b, K, x, tau, adj), cp);
  const tw = bs(x, K, tau, ivAt(b, K, x, tau, par.adj), par.cp), fw = x * Math.exp(par.g * tau), df = Math.exp(-R * tau);
  return tw + (cp === "P" ? df * (K - fw) : df * (fw - K));
}
function val(b, x, tau) {
  if (b.na) return NaN;
  if (tau <= 1e-9) return payoff(b, x);
  let v = b.cr - legPx(b, b.sp.K, "P", b.parP, b.adjSp, x, tau) - legPx(b, b.sc.K, "C", b.parC, b.adjSc, x, tau);
  if (b.cap) v += bs(x, b.cap.K, tau, ivAt(b, b.cap.K, x, tau, b.adjCap), "C");
  return v - b.exitCost;
}

