// ============================================================ rule9: placement and structure resolution (pure)
// One namespace object, RULE. Works on a frozen v9 Expiry (INST); never reads global state.
// Bases: "delta" (forward Δ ×100 on Fpar), "money" (% from Fpar, + = OTM), "sigma" (ln(K/Fpar) in units of the
// position's own Expiry.sigma). Wings measure from their own short (money, sigma) or by their own |Δ| (delta).
const RULE = (() => {
  const BASES = Object.freeze(["delta", "money", "sigma"]);
  const TOL = Object.freeze({ delta: 5, money: 2.5, sigma: 0.10 });          // GAP / FAR tolerance on |snapErr|
  const BOUNDS = Object.freeze({ delta: Object.freeze([0.5, 99.5]), money: Object.freeze([-90, 300]), sigma: Object.freeze([-5, 5]) });
  const WMIN = Object.freeze({ delta: 0.5, money: 0.5, sigma: 0.05 });
  const WMAX = Object.freeze({ delta: 99.5, money: 300, sigma: 5 });
  const WDEF = Object.freeze({ delta: 15, money: 10, sigma: 0.5 });         // wing default / reset value
  const DEF = Object.freeze({ delta: 30, money: 10, sigma: 0.5 });          // short-leg reset value
  const STEP = Object.freeze({ delta: 1, money: 0.5, sigma: 0.05 });        // slider steps (drags only)
  const UNIT = Object.freeze({ delta: "Δ", money: "%", sigma: "σ" });
  const EPS = 1e-9;
  // CHAIN_END needs the target to lie beyond the end strike's value by more than a tenth of the FAR tolerance,
  // so a linked value that overshoots the last strike by a hair (30Δ vs a 30.07Δ end) is not a warning
  const CE_TOL = Object.freeze({ delta: 0.5, money: 0.25, sigma: 0.01 });
  const ROLES = Object.freeze(["short put", "short call", "long call", "long put", "center"]);
  const cpOf = role => role === "short put" || role === "long put" ? "P" : "C";
  const isPutRole = role => role === "short put" || role === "long put";
  const LEGWORD = { "short put": "put", "short call": "call", center: "center", "long call": "call wing", "long put": "put wing" };
  const PATH = { "short put": "values.put", "short call": "values.call", center: "values.center", "long call": "wings.call.value", "long put": "wings.put.value" };
  const LEGKEY = { "short put": "put", "short call": "call", center: "center", "long call": "wingCall", "long put": "wingPut" };
  const last = a => a.length ? a[a.length - 1] : undefined;
  const sgn = v => v < 0 ? "−" : "";
  // a value that rounds to zero at the printed precision prints unsigned ("0%", not "−0%")
  function fmtV(v, basis) {
    if (!Number.isFinite(v)) return "–";
    const n = +Math.abs(v).toFixed(basis === "sigma" ? 2 : 1), u = basis === "delta" ? "Δ" : basis === "money" ? "%" : "σ";
    return (n === 0 ? "" : sgn(v)) + String(n) + u;
  }
  const kc = (K, cp) => fK(K) + (cp || "");

  // ---------------------------------------------------------- achieved values (exact, unrounded)
  function one(E, K, role, basis, Ks) {
    const F = E.Fpar, s = E.sigma;
    if (basis === "delta") { const c = E.callDelta(K) * 100; return isPutRole(role) ? 100 - c : c; }
    if (basis === "money") {
      if (role === "short put") return (1 - K / F) * 100;
      if (role === "long call") return (K / Ks - 1) * 100;
      if (role === "long put") return (1 - K / Ks) * 100;
      return (K / F - 1) * 100;
    }
    if (role === "short put") return -Math.log(K / F) / s;
    if (role === "long call") return Math.log(K / Ks) / s;
    if (role === "long put") return Math.log(Ks / K) / s;
    return Math.log(K / F) / s;
  }
  const achieved = (E, K, role, Ks) => ({ delta: one(E, K, role, "delta", Ks), money: one(E, K, role, "money", Ks), sigma: one(E, K, role, "sigma", Ks) });
  const valueAt = (E, K, role, basis, Ks) => one(E, K, role, basis, Ks);

  // ---------------------------------------------------------- eligible strikes (ascending K), per frozen Expiry
  const EL = new WeakMap();
  function eligible(E) {
    let x = EL.get(E); if (x) return x;
    const put = E.puts.filter(o => o.bid > 0).map(o => o.K), call = E.calls.filter(o => o.bid > 0).map(o => o.K);
    const cs = new Set(call);
    x = Object.freeze({
      put: Object.freeze(put), call: Object.freeze(call), straddle: Object.freeze(put.filter(K => cs.has(K))),
      longCall: Object.freeze(E.calls.filter(o => o.ask > 0).map(o => o.K)), longPut: Object.freeze(E.puts.filter(o => o.ask > 0).map(o => o.K))
    });
    EL.set(E, x); return x;
  }
  function cands(E, role, Ks) {
    const el = eligible(E);
    switch (role) {
      case "short put": return el.put;
      case "short call": return el.call;
      case "center": return el.straddle;
      case "long call": return el.longCall.filter(K => K > Ks);
      case "long put": return el.longPut.filter(K => K < Ks);
    }
    return [];
  }
  // tie-breaks: put → lower K; call → higher K; center → nearer Fpar in |ln K/F|, then higher K; wings further out
  function prefer(E, role, K, cur) {
    if (role === "short put" || role === "long put") return K < cur;
    if (role === "short call" || role === "long call") return K > cur;
    const a = Math.abs(Math.log(K / E.Fpar)), b = Math.abs(Math.log(cur / E.Fpar));
    return a < b - 1e-15 || (Math.abs(a - b) <= 1e-15 && K > cur);
  }
  function snapK(E, list, role, basis, t, Ks) {
    let best = NaN, be = Infinity;
    const tie = 1e-12 * Math.max(1, Math.abs(t));
    for (const K of list) {
      const e = Math.abs(one(E, K, role, basis, Ks) - t);
      if (Number.isNaN(best) || e < be - tie) { best = K; be = e; }
      else if (Math.abs(e - be) <= tie && prefer(E, role, K, best)) { best = K; be = e; }
    }
    return best;
  }
  function nearestF(E, list) {
    let best = NaN, bd = Infinity;
    for (const K of list) {
      const d = Math.abs(K - E.Fpar);
      if (Number.isNaN(best) || d < bd - 1e-12 || (Math.abs(d - bd) <= 1e-12 && prefer(E, "center", K, best))) { best = K; bd = d; }
    }
    return best;
  }
  function mkLeg(E, role, K, target, snapErr, Ks) {
    const cp = cpOf(role);
    return Object.freeze({
      role, K, cp, row: E.row(K, cp), target, achieved: Object.freeze(achieved(E, K, role, Ks)), snapErr,
      itm: cp === "P" ? K > E.Fpar : K < E.Fpar, Kshort: Ks === undefined ? null : Ks
    });
  }

  // snap one leg, with at most one of CHAIN_END / GAP / FAR (and WING_INSIDE for wings)
  function snapLeg(E, role, basis, t, Ks, structure) {
    const list = cands(E, role, Ks);
    if (!list.length || !Number.isFinite(t)) return null;
    const wing = role === "long call" || role === "long put", cp = role === "center" ? "" : cpOf(role), word = LEGWORD[role];
    const path = role === "center" ? "values.center" : PATH[role], legKey = LEGKEY[role];
    const vals = list.map(K => one(E, K, role, basis, Ks));
    let K, flag = null;
    if (wing && basis === "delta" && t >= one(E, Ks, role === "long call" ? "short call" : "short put", "delta") - EPS) {
      K = role === "long call" ? list[0] : last(list);
      flag = { code: "WING_INSIDE", leg: legKey, severity: "note", text: `${word} ${fmtV(t, basis)} is at or inside the short (${fmtV(one(E, Ks, role === "long call" ? "short call" : "short put", "delta"), basis)}): using ${kc(K, cp)}` };
    } else {
      K = snapK(E, list, role, basis, t, Ks);
      const v = one(E, K, role, basis, Ks), err = v - t;
      let beyond;
      if (wing) {
        const outer = role === "long call" ? last(list) : list[0], vOut = one(E, outer, role, basis, Ks), dir = basis === "delta" ? -1 : 1;
        beyond = (t - vOut) * dir > CE_TOL[basis];
      } else {
        const lo = Math.min(...vals), hi = Math.max(...vals);
        beyond = t < lo - CE_TOL[basis] || t > hi + CE_TOL[basis];
      }
      if (beyond) {
        flag = { code: "CHAIN_END", leg: legKey, severity: "warn", text: `${word} ${fmtV(t, basis)} is beyond the chain: ${kc(K, cp)} is the last listed (${fmtV(v, basis)})`, fix: { path, value: v } };
      } else if (Math.abs(err) > TOL[basis]) {
        let i1 = -1;
        for (let i = 0; i + 1 < list.length; i++) if ((t - vals[i]) * (t - vals[i + 1]) <= 0) { i1 = i; break; }
        if (i1 >= 0 && list[i1 + 1] - list[i1] > 1.5 * E.increment + 1e-9) {
          const k1 = list[i1], k2 = list[i1 + 1], inc = E.increment, a = k1 + inc, b = k2 - inc;
          const rng = Math.abs(b - a) < 1e-9 ? fK(a) : `${fK(a)}–${fK(b)}`;
          const listedBetween = E.strikes.some(x => x > k1 + 1e-9 && x < k2 - 1e-9);
          flag = { code: "GAP", leg: legKey, severity: "note", text: `no ${rng}${cp} ${listedBetween ? "with a bid" : "listed"}; ${kc(k1, cp)} ${fmtV(vals[i1], basis)}, ${kc(k2, cp)} ${fmtV(vals[i1 + 1], basis)}` };
        } else {
          let near;
          if (i1 >= 0) near = `nearest strikes ${kc(list[i1], cp)} ${fmtV(vals[i1], basis)}, ${kc(list[i1 + 1], cp)} ${fmtV(vals[i1 + 1], basis)}`;
          else near = `nearest strike ${kc(K, cp)} ${fmtV(v, basis)}`;
          flag = { code: "FAR", leg: legKey, severity: "note", text: `${fmtV(t, basis)} → ${fmtV(v, basis)}: ${near}` };
        }
      }
    }
    const v = one(E, K, role, basis, Ks);
    return { K, v, snapErr: v - t, flag };
  }

  const crosses = (basis, p, c) => basis === "delta" ? p + c > 100 + EPS : p + c < -EPS;

  // fix for a wing with no candidate: move that side's short to the outermost strike that still has a wing beyond it
  function wingFix(E, side, structure, basis) {
    const el = eligible(E);
    if (side === "call") {
      const longs = el.longCall, shorts = structure === "straddle" ? el.straddle : el.call;
      const ok = shorts.filter(K => longs.some(L => L > K)); if (!ok.length) return null;
      const K = last(ok);
      return structure === "straddle" ? { path: "values.center", value: one(E, K, "center", basis) } : { path: "values.call", value: one(E, K, "short call", basis) };
    }
    const longs = el.longPut, shorts = structure === "straddle" ? el.straddle : el.put;
    const ok = shorts.filter(K => longs.some(L => L < K)); if (!ok.length) return null;
    const K = ok[0];
    return structure === "straddle" ? { path: "values.center", value: one(E, K, "center", basis) } : { path: "values.put", value: one(E, K, "short put", basis) };
  }

  function resolveWing(E, side, w, basis0, shortLeg, structure, flags) {
    if (!w || !w.on || !shortLeg) return null;
    const basis = w.basis || basis0, role = side === "call" ? "long call" : "long put", Ks = shortLeg.K, cp = cpOf(role);
    const list = cands(E, role, Ks);
    if (!list.length) {
      const f = { code: "WING_NA", leg: side === "call" ? "wingCall" : "wingPut", severity: "warn", text: `${side} wing n/a (no strike ${side === "call" ? "above" : "below"} ${kc(Ks, cp)})` };
      const fx = wingFix(E, side, structure, basis0); if (fx) f.fix = fx;
      flags.push(Object.freeze(f));
      return null;
    }
    const r = snapLeg(E, role, basis, +w.value, Ks, structure);
    if (r.flag && r.flag.fix && basis !== basis0) delete r.flag.fix;     // a value on another side's basis is not a fix for this side
    if (r.flag) flags.push(Object.freeze(r.flag));
    return mkLeg(E, role, r.K, +w.value, r.snapErr, Ks);
  }

  // ---------------------------------------------------------- RULE.resolve
  function resolve(E, structure, basis, values, wings) {
    const flags = [];
    values = values || {};
    let put = null, call = null, center = null, na = "";
    const el = eligible(E);
    if (structure === "straddle") {
      if (!el.straddle.length) na = "no strike with both a put and a call bid";
      else {
        let K, tgt = values.center, err = 0;
        if (tgt === "atm" || tgt === undefined || tgt === null || !Number.isFinite(+tgt)) { tgt = "atm"; K = nearestF(E, el.straddle); }
        else {
          tgt = +tgt;
          const r = snapLeg(E, "center", basis, tgt);
          K = r.K; err = r.snapErr; if (r.flag) flags.push(Object.freeze(r.flag));
        }
        center = Object.freeze({ K, target: tgt, achieved: Object.freeze(achieved(E, K, "center")), snapErr: err });
        put = mkLeg(E, "short put", K, tgt, err); call = mkLeg(E, "short call", K, tgt, err);
      }
    } else {
      if (!el.put.length || !el.call.length) na = !el.put.length && !el.call.length ? "no put or call with a bid" : !el.put.length ? "no put with a bid" : "no call with a bid";
      else {
        const tp = +values.put, tc = +values.call;
        const p = snapLeg(E, "short put", basis, tp), c = snapLeg(E, "short call", basis, tc);
        const cross = crosses(basis, tp, tc);
        let Kp = p.K, Kc = c.K, moved = "";
        if (cross ? !(Kp > Kc) : !(Kp < Kc)) {
          const pc = cross ? el.put.find(K => K > c.K) : last(el.put.filter(K => K < c.K));
          const cc = cross ? last(el.call.filter(K => K < p.K)) : el.call.find(K => K > p.K);
          const ep = pc !== undefined ? Math.abs(one(E, pc, "short put", basis) - tp) - Math.abs(p.snapErr) : Infinity;
          const ec = cc !== undefined ? Math.abs(one(E, cc, "short call", basis) - tc) - Math.abs(c.snapErr) : Infinity;
          const why = p.K === c.K ? `both legs snapped to ${fK(p.K)}` : `put snapped to ${fK(p.K)}, call to ${fK(c.K)}`;
          const want = cross ? "guts" : "strangle";
          if (ep === Infinity && ec === Infinity) {
            flags.push(Object.freeze({ code: "ONE_STRIKE", severity: "warn", text: `only one usable strike, cannot form a ${want} (${why})` }));
          } else if (ep <= ec + 1e-12) { Kp = pc; moved = "put"; }
          else { Kc = cc; moved = "call"; }
          if (moved) flags.push(Object.freeze({ code: "WIDENED", leg: moved, severity: "note", text: `kept a ${want}: ${moved} ${fK(moved === "put" ? Kp : Kc)} (${why})`, moved, from: moved === "put" ? p.K : c.K, to: moved === "put" ? Kp : Kc }));
        }
        if (p.flag && moved !== "put") flags.push(Object.freeze(p.flag));
        if (c.flag && moved !== "call") flags.push(Object.freeze(c.flag));
        put = mkLeg(E, "short put", Kp, tp, one(E, Kp, "short put", basis) - tp);
        call = mkLeg(E, "short call", Kc, tc, one(E, Kc, "short call", basis) - tc);
      }
    }
    if (na) return Object.freeze({ put: null, call: null, wingCall: null, wingPut: null, center: null, kind: "", na, flags: Object.freeze(flags), basis, structure });
    wings = wings || {};
    const wingCall = resolveWing(E, "call", wings.call, basis, call, structure, flags);
    const wingPut = resolveWing(E, "put", wings.put, basis, put, structure, flags);
    const kind = put.K < call.K ? "strangle" : put.K === call.K ? "straddle" : "guts";
    return Object.freeze({ put, call, wingCall, wingPut, center, kind, na: "", flags: Object.freeze(flags), basis, structure });
  }

  // ---------------------------------------------------------- ranges
  function ends(E, basis, role, Ks) {
    const list = cands(E, role, Ks); if (!list.length) return null;
    let lo = null, hi = null;
    for (const K of list) { const v = one(E, K, role, basis, Ks); if (!lo || v < lo.value) lo = { value: v, K }; if (!hi || v > hi.value) hi = { value: v, K }; }
    return Object.freeze({ lo: Object.freeze(lo), hi: Object.freeze(hi) });
  }
  function range(E, basis, role, Ks) { const e = ends(E, basis, role, Ks); return e ? [e.lo.value, e.hi.value] : [NaN, NaN]; }
  // legs together: one control adds the same increment d to both values; the stop is the first leg to reach its end
  function rangeTogether(E, basis, values) {
    const ep = ends(E, basis, "short put"), ec = ends(E, basis, "short call");
    if (!ep || !ec) return null;
    const p = +values.put, c = +values.call;
    const lp = ep.lo.value - p, lc = ec.lo.value - c, hp = ep.hi.value - p, hc = ec.hi.value - c;
    return Object.freeze({
      dlo: Math.max(lp, lc), dhi: Math.min(hp, hc), loLeg: lp >= lc ? "put" : "call", hiLeg: hp <= hc ? "put" : "call",
      loEnd: lp >= lc ? ep.lo : ec.lo, hiEnd: hp <= hc ? ep.hi : ec.hi, put: [ep.lo.value, ep.hi.value], call: [ec.lo.value, ec.hi.value]
    });
  }

  // ---------------------------------------------------------- continuous target strike K* (no snapping)
  function targetK(E, role, basis, t, Ks) {
    if (!Number.isFinite(t)) return NaN;
    const F = E.Fpar, s = E.sigma, ref = role === "long call" || role === "long put" ? Ks : F;
    if (!(ref > 0)) return NaN;
    if (basis === "money") {
      const K = role === "short put" || role === "long put" ? ref * (1 - t / 100) : ref * (1 + t / 100);
      return K > 0 ? K : NaN;
    }
    if (basis === "sigma") return role === "short put" || role === "long put" ? ref * Math.exp(-t * s) : ref * Math.exp(t * s);
    // delta: callΔ(K) = c*, bisection in ln K; with several roots, the one nearest Fpar
    const cs = isPutRole(role) ? (100 - t) / 100 : t / 100;
    if (!(cs > 0 && cs < 1)) return NaN;
    const f = x => { const K = F * Math.exp(x); return INST.fwdDelta(F, K, E.T, E.smile(K), "C") - cs; };
    const step = 0.01, xmax = 6;
    let found = null;
    const f0 = f(0);
    if (f0 === 0) return F;
    for (let i = 1; i * step <= xmax && !found; i++) {
      for (const sg of [1, -1]) {
        const a = sg * (i - 1) * step, b = sg * i * step, fa = i === 1 ? f0 : f(a), fb = f(b);
        if (fa === 0) { found = [a, a]; break; }
        if (fa * fb < 0) { found = [a, b]; break; }
      }
    }
    if (!found) return NaN;
    let [a, b] = found;
    if (a !== b) { let fa = f(a); for (let i = 0; i < 80; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } } }
    return F * Math.exp((a + b) / 2);
  }

  // ---------------------------------------------------------- clamps
  const clampValue = (basis, v) => Math.min(BOUNDS[basis][1], Math.max(BOUNDS[basis][0], v));
  const clampWing = (basis, v) => Math.min(WMAX[basis], Math.max(WMIN[basis], v));

  // convert one wing value (on basis `from`, measured from short Ks) to basis `to`; resolved strike Kw when known
  function convertWing(E, side, value, from, to, Ks, Kw) {
    if (from === to) return { value, reset: false };
    const role = side === "call" ? "long call" : "long put";
    let K = Kw;
    if (!Number.isFinite(K)) K = Number.isFinite(Ks) ? targetK(E, role, from, +value, Ks) : NaN;
    const beyond = Number.isFinite(K) && Number.isFinite(Ks) && (side === "call" ? K > Ks : K < Ks);
    if (!beyond) return { value: WDEF[to], reset: true };
    const v = one(E, K, role, to, Ks);
    return Number.isFinite(v) ? { value: clampWing(to, v), reset: false } : { value: WDEF[to], reset: true };
  }

  // ---------------------------------------------------------- RULE.convert(exp, pos, toBasis) -> {values, wings, flags}
  function convert(E, pos, to) {
    const from = pos.basis, v = pos.values || {}, W = pos.wings || {}, flags = [];
    const out = { center: v.center, put: v.put, call: v.call };
    const wout = {};
    for (const s of ["call", "put"]) if (W[s]) wout[s] = { on: !!W[s].on, value: W[s].value };
    const anyOther = ["call", "put"].some(s => W[s] && W[s].basis && W[s].basis !== to);
    if (from === to && !anyOther) return { values: out, wings: wout, flags };
    const reset = (what, val) => { flags.push(Object.freeze({ code: "CONVERT_RESET", leg: what, severity: "note", text: `${what} reset to ${val === "atm" ? "ATM" : fmtV(val, to)}: no strike to convert from` })); return val; };
    if (from !== to) {
      if (v.center !== "atm" && v.center !== undefined && v.center !== null) {
        const r = resolve(E, "straddle", from, v, null);
        if (!r.na) out.center = one(E, r.center.K, "center", to);
        else { const K = targetK(E, "center", from, +v.center); out.center = Number.isFinite(K) ? clampValue(to, one(E, K, "center", to)) : reset("center", "atm"); }
      }
      const rs = resolve(E, "strangle", from, v, null);
      if (!rs.na) { out.put = one(E, rs.put.K, "short put", to); out.call = one(E, rs.call.K, "short call", to); }
      else for (const [k, role] of [["put", "short put"], ["call", "short call"]]) {
        const K = targetK(E, role, from, +v[k]);
        out[k] = Number.isFinite(K) ? one(E, K, role, to) : reset(k, DEF[to]);
      }
      for (const k of ["put", "call"]) if (Number.isFinite(out[k])) out[k] = clampValue(to, out[k]);
      if (typeof out.center === "number") out.center = clampValue(to, out.center);
    }
    // wings: resolve the current structure with each wing forced on, then take its strike's value on the new basis
    const forced = {};
    for (const s of ["call", "put"]) if (W[s]) forced[s] = { on: true, value: W[s].value, basis: W[s].basis || from };
    const rw = resolve(E, pos.structure === "straddle" ? "straddle" : "strangle", from, v, forced);
    for (const s of ["call", "put"]) {
      if (!W[s]) continue;
      const wb = W[s].basis || from;
      if (wb === to) { wout[s].value = W[s].value; continue; }
      const leg = rw.na ? null : s === "call" ? rw.wingCall : rw.wingPut, short = rw.na ? null : s === "call" ? rw.call : rw.put;
      const r = convertWing(E, s, W[s].value, wb, to, short ? short.K : NaN, leg ? leg.K : NaN);
      wout[s].value = r.reset ? reset(s + " wing", r.value) : r.value;
    }
    return { values: out, wings: wout, flags };
  }

  // why a strike cannot take a role ("" when it can): used to refuse a smile click with the reason
  function whyNot(E, K, role, Ks) {
    const cp = cpOf(role), o = E.row(K, cp), el = eligible(E);
    if (role === "center") return el.straddle.includes(K) ? "" : `${fK(K)} needs both a put and a call bid to be a straddle strike`;
    if (!o) return `${kc(K, cp)} is not listed`;
    if (role === "short put" || role === "short call") return o.bid > 0 ? "" : `${kc(K, cp)} has no bid, so it cannot be sold`;
    if (!(o.ask > 0)) return `${kc(K, cp)} has no ask, so it cannot be bought`;
    if (role === "long call" && !(K > Ks)) return `the protective call must sit above the short call ${kc(Ks, "C")}`;
    if (role === "long put" && !(K < Ks)) return `the protective put must sit below the short put ${kc(Ks, "P")}`;
    return "";
  }
  // legs together: move one leg to a new value and the other by the same increment (offset kept)
  function shiftTogether(values, leg, v) {
    const d = v - +values[leg], other = leg === "put" ? "call" : "put";
    return { put: leg === "put" ? v : +values.put + d, call: leg === "call" ? v : +values.call + d };
  }
  // public snap for tests and the smile panel: {K, v, snapErr, flag}
  const snap = (E, role, basis, target, Ks) => snapLeg(E, role, basis, target, Ks);

  return Object.freeze({
    BASES, TOL, CE_TOL, BOUNDS, WMIN, WMAX, WDEF, DEF, STEP, UNIT, ROLES,
    resolve, achieved, valueAt, range, ends, rangeTogether, convert, convertWing, targetK, snap, eligible, crosses, whyNot, shiftTogether,
    clampValue, clampWing, fmtV, cpOf, legWord: role => LEGWORD[role]
  });
})();
