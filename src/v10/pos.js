// ============================================================ pos9: building, pricing and marking a position (pure)
// One namespace object, POS. A Position is data; POS.build(pos) resolves it (RULE) on its instrument snapshot
// (INST.make(pos.inst)) and prices the resolved legs (POS.price). Builts are frozen and memoized by
// JSON(canonical pos) | instrument version | expMap.
const POS = (() => {
  let BC = null, PC = null, SC = null;
  const caches = () => { if (!BC) { BC = INST.cache("pos.build"); PC = INST.cache("pos.price"); SC = INST.cache("pos.stats"); } };
  const NOSHOCK = Object.freeze({ ivs: 0, svs: 0, svd: true });
  const qtyOf = role => role === "short put" || role === "short call" ? -1 : 1;
  const cpOf = role => role === "short put" || role === "long put" ? "P" : "C";
  const KEY = Object.freeze({ "short put": "put", "short call": "call", "long call": "wingCall", "long put": "wingPut" });
  const intrinsic = (K, cp, x) => cp === "C" ? Math.max(x - K, 0) : Math.max(K - x, 0);
  // zero-rate Black–Scholes: the exact expectation of a payoff under the zero-drift lognormal (HV odds)
  const bs0 = (S, K, T, s, cp) => { if (!(T > 1e-9) || !(s > 0)) return intrinsic(K, cp, S); const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + s * s / 2 * T) / v, d2 = d1 - v; return cp === "C" ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1); };
  const freeze = INST.deepFreeze;
  const sortLegs = (a, b) => a.K - b.K || (a.cp === b.cp ? 0 : a.cp === "P" ? -1 : 1);

  // ---------------------------------------------------------- canonical position (memo key)
  function canon(pos) {
    const b = pos.basis, v = pos.values || {}, w = pos.wings || {};
    const wing = x => x ? Object.assign({ on: !!x.on, value: +x.value }, x.basis && x.basis !== b ? { basis: x.basis } : {}) : { on: false, value: null };
    return {
      exp: pos.exp, structure: pos.structure, legs: pos.legs, basis: b,
      values: { center: v.center === "atm" || v.center === undefined || v.center === null ? "atm" : +v.center, put: +v.put, call: +v.call },
      wings: { call: wing(w.call), put: wing(w.put) }, fill: pos.fill === "nat" ? "nat" : "mid", fills: canonFills(pos.fills)
    };
  }
  // ---------------------------------------------------------- typed fills (the price the trader actually got)
  // pos.fills = { put | call | wingCall | wingPut: { tk, exp, K, cp, px } }: one typed price per leg slot, pinned to the
  // contract it was typed for. It prices that leg only while the slot still holds that exact contract; a moved strike
  // or another expiry falls back to the fill mode and says so (FILL_NOT_APPLIED).
  const FILL_SLOTS = Object.freeze(["put", "call", "wingCall", "wingPut"]);
  const isTypedFill = f => !!f && typeof f === "object" && typeof f.tk === "string" && typeof f.exp === "string" && Number.isFinite(+f.K) && (f.cp === "P" || f.cp === "C") && Number.isFinite(+f.px) && +f.px >= 0;
  function canonFills(fills) {
    const out = {};
    if (!fills || typeof fills !== "object") { return out; }
    for (const slot of FILL_SLOTS) {
      const f = fills[slot];
      if (isTypedFill(f)) { out[slot] = { tk: f.tk, exp: f.exp, K: +f.K, cp: f.cp, px: +f.px }; }
    }
    return out;
  }

  // ---------------------------------------------------------- mark parameters per leg
  // OTM legs (against Fpar): vol offset pinning the entry mark to the leg's mid. ITM legs whose OTM twin has a bid:
  // the twin (pinned to its own mid) + parity on F(x,τ) + a quote premium that decays to 0 at expiry.
  // A mid with no implied vol (below the model floor): an additive residual that decays with τ/T (NO_IV_PIN).
  function pinOf(E, o) {
    if (Number.isFinite(o.ivm)) return { mode: "pin", K: o.K, cp: o.cp, adj: o.ivm - o.iv };
    return { mode: "resid", K: o.K, cp: o.cp, resid: o.mid - INST.b76(E.Fpar, o.K, E.T, o.iv, o.cp) };
  }
  function markOf(E, o, qty) {
    const itm = o.cp === "P" ? o.K > E.Fpar : o.K < E.Fpar, DF = Math.exp(-R * E.T);
    if (itm) {
      const tw = E.row(o.K, o.cp === "P" ? "C" : "P");
      if (tw && tw.bid > 0 && tw.mid > 0) {
        const parE = tw.mid + (o.cp === "P" ? DF * (o.K - E.Fpar) : DF * (E.Fpar - o.K));
        return { mode: "twin", K: o.K, cp: o.cp, qty, tw: pinOf(E, tw), qp: o.mid - parE, parE, noPin: !Number.isFinite(tw.ivm) };
      }
    }
    const p = pinOf(E, o);
    return Object.assign(p, { qty, noPin: p.mode === "resid" });
  }

  // ---------------------------------------------------------- POS.price(inst, expId, legs, fill) -> Priced
  const price = function (inst, expId, legs, fill, fills) {
    caches();
    fill = fill === "nat" ? "nat" : "mid";
    const E = inst && inst.exp(expId); if (!E) return null;
    const typed = canonFills(fills);
    const key = `${inst.version}|${expId}|${legs.map(l => l.role + ":" + l.K).join(",")}|${fill}|${JSON.stringify(typed)}`;
    const hit = PC.get(key); if (hit) return hit;
    const S = inst.spot, T = E.T, F = E.Fpar, nat = fill === "nat", DF = Math.exp(-R * T);
    const sell = o => nat ? o.bid : o.mid, buy = o => nat ? o.ask : o.mid, hs = o => Math.max(0, (o.ask - o.bid) / 2);
    // the typed price of a leg when its slot holds exactly the contract it was typed for
    const typedFor = (role, o) => {
      const f = typed[KEY[role]];
      const matches = !!f && !!o && f.tk === inst.id && f.exp === expId && Math.abs(f.K - o.K) < 1e-9 && f.cp === o.cp;
      return matches ? f.px : null;
    };
    const pxOf = (role, o) => { const t = typedFor(role, o); if (t !== null) { return t; } return qtyOf(role) < 0 ? sell(o) : buy(o); };
    const rowOut = o => o ? Object.freeze(Object.assign({}, o, { d: o.delta })) : null;
    const byRole = {};
    for (const l of legs) { const o = E.row(l.K, cpOf(l.role)); if (!o) return null; byRole[l.role] = o; }
    const sp = byRole["short put"] || null, sc = byRole["short call"] || null, cw = byRole["long call"] || null, pw = byRole["long put"] || null;
    const crS = (sp ? pxOf("short put", sp) : 0) + (sc ? pxOf("short call", sc) : 0);
    const capPx = cw ? pxOf("long call", cw) : 0, wingPx = capPx + (pw ? pxOf("long put", pw) : 0), cr = crS - wingPx;
    // what the same legs fetch at mid and at natural, whatever the fill: the card and the legs compare against them
    const sideSum = pick => legs.reduce((t, l) => { const o = byRole[l.role]; return t - qtyOf(l.role) * pick(o, qtyOf(l.role)); }, 0);
    const crMid = sideSum(o => o.mid), crNat = sideSum((o, q) => q < 0 ? o.bid : o.ask);
    const exitCost = nat ? (sp ? hs(sp) : 0) + (sc ? hs(sc) : 0) + (cw ? hs(cw) : 0) + (pw ? hs(pw) : 0) : 0;
    const flags = [];
    if (inst.overridden) {
      const parts = []; if (inst.spot !== inst.spotListed) parts.push(`spot ${fN(inst.spot, 2)} (listed ${fN(inst.spotListed, 2)})`); if (inst.ivShift) parts.push(`IV ${inst.ivShift > 0 ? "+" : MINUS}${+Math.abs(inst.ivShift).toFixed(3)} pts`);
      flags.push({ code: "MODEL_QUOTES", severity: "note", text: `model quotes: ${parts.join(" · ")}` });
    }
    // per-leg detail, ascending strike
    const L = [], marks = [];
    for (const l of legs) {
      const o = byRole[l.role], qty = qtyOf(l.role), m = markOf(E, o, qty);
      marks.push(Object.freeze(Object.assign(m, { role: l.role, tw: m.tw ? Object.freeze(m.tw) : undefined })));
      const typedPx = typedFor(l.role, o), fillPx = pxOf(l.role, o), intr = intrinsic(o.K, o.cp, S), itm = o.cp === "P" ? o.K > F : o.K < F;
      const name = fK(o.K) + o.cp;
      if (m.noPin) flags.push({ code: "NO_IV_PIN", leg: KEY[l.role], severity: "note", text: `${name}: mid has no implied vol; marked with a residual that decays to expiry` });
      const tvMid = o.mid - intr, carry = o.K * (1 - DF);
      if (qty < 0 && intr > 0 && (!itm || tvMid < Math.max(0.05, carry))) flags.push({ code: "EARLY_ASSIGN", leg: KEY[l.role], severity: "note", text: `${name}: early assignment risk (intrinsic ${fN(intr, 2)} against spot, time value ${fN(tvMid, 2)})` });
      if (intr > 0 && o.mid < intr - 1e-9) flags.push({ code: "BELOW_INTRINSIC", leg: KEY[l.role], severity: "note", text: `${name}: mid ${fN(o.mid, 2)} is below intrinsic ${fN(intr, 2)}` });
      L.push({
        role: l.role, key: KEY[l.role], cp: o.cp, K: o.K, qty, bid: o.bid, ask: o.ask, mid: o.mid, fillPx, typed: typedPx !== null, perContract: -qty * fillPx * 100,
        iv: o.iv, ivm: o.ivm, delta: o.delta, money: (o.K / F - 1) * 100, sigma: Math.log(o.K / F) / E.sigma,
        itm, intrinsic: intr, timeValue: fillPx - intr, tvMid, quotePremium: m.mode === "twin" ? m.qp : NaN,
        parity: m.mode === "twin" ? m.parE : NaN, markMode: m.mode, model: !!o.model
      });
    }
    L.sort(sortLegs);
    for (const slot of FILL_SLOTS) {
      const f = typed[slot], leg = L.find(x => x.key === slot);
      if (!f || (leg && leg.typed)) { continue; }
      const now = leg ? `this leg is now ${fmtE(expId)} ${fK(leg.K)}${leg.cp}` : "this leg is not in the position now";
      flags.push({ code: "FILL_NOT_APPLIED", leg: slot, severity: "warn", text: `typed fill ${fN(f.px, 2)} was for ${f.tk} ${fmtE(f.exp)} ${fK(f.K)}${f.cp}; ${now}, so it is at ${fill === "nat" ? "natural" : "mid"}` });
    }
    const typedCount = L.filter(x => x.typed).length;
    // v8-compatible intrinsic / time value of the two shorts (against spot)
    const legI = (o, cp) => {
      if (!o) return null;
      const intr = intrinsic(o.K, cp, S), px = pxOf(cp === "P" ? "short put" : "short call", o), m = marks.find(x => x.K === o.K && x.cp === cp && x.qty < 0);
      return { intr, px, tv: px - intr, tvMid: o.mid - intr, below: intr > 0 && o.mid < intr - 1e-9, ea: intr > 0 && o.mid - intr < Math.max(0.05, o.K * (1 - DF)), carry: o.K * (1 - DF), par: m && m.mode === "twin" ? m.parE : NaN, from: m && m.mode === "twin" ? rowOut(E.row(o.K, cp === "P" ? "C" : "P")) : null };
    };
    const iP = legI(sp, "P"), iC = legI(sc, "C");
    const intr = (iP ? iP.intr : 0) + (iC ? iC.intr : 0) - (cw ? intrinsic(cw.K, "C", S) : 0) - (pw ? intrinsic(pw.K, "P", S) : 0), tv = cr - intr;
    let vega = 0; for (const x of L) vega += x.qty * INST.vega76(F, x.K, T, x.iv);
    // Reg T leveraged-ETF margin, symmetric in the wings (v8 exactly when only a call wing exists)
    const lev = inst.lev, f20 = Math.min(1, 0.2 * lev), f10 = Math.min(1, 0.1 * lev);
    let margin = NaN;
    if (sp && sc) {
      const pxP = pxOf("short put", sp), pxC = pxOf("short call", sc);
      const rPn = pxP + Math.max(f20 * S - Math.max(0, S - sp.K), f10 * sp.K);
      const rCn = pxC + Math.max(f20 * S - Math.max(0, sc.K - S), f10 * S);
      const rP = pw ? Math.min(sp.K - pw.K, rPn) : rPn, rC = cw ? Math.min(cw.K - sc.K, rCn) : rCn;
      margin = rP >= rC ? rP + pxC - (cw ? pxOf("long call", cw) : 0) : rC + pxP - (pw ? pxOf("long put", pw) : 0);
    }
    const out = {
      key, tk: inst.id, inst, exp: expId, E, S, T, dte: E.dte, F, Fimpl: F, Fcarry: E.Fcarry, sig: E.sigma, fill,
      sp: rowOut(sp), sc: rowOut(sc), cap: rowOut(cw), capP: rowOut(pw),
      crS, capPx, wingPx, cr, crMid, crNat, typedCount, typedKey: JSON.stringify(typed), exitCost, intr, tv, vega, margin, iP, iC,
      itmP: sp ? sp.K > F : false, itmC: sc ? sc.K < F : false,
      straddle: !!(sp && sc && sp.K === sc.K), guts: !!(sp && sc && sp.K > sc.K), capFb: false,
      legs: L, marks,
      net: { perShare: cr, perContract: cr * 100, isDebit: cr < 0, pctOfSpot: cr / S * 100 },
      flags
    };
    return PC.set(key, freeze(out));
  };

  // ---------------------------------------------------------- labels
  function labelOf(inst, expId, kind, put, call, wc, wp) {
    const short = `${inst.id} ${fmtE(expId)}`;
    const sx = kind === "straddle" ? fK(put.K) : kind === "strangle" ? `${fK(put.K)} / ${fK(call.K)}` : `${fK(put.K)}P / ${fK(call.K)}C`;
    const tabSt = kind === "straddle" ? fK(put.K) : kind === "strangle" ? `${fK(put.K)}/${fK(call.K)}` : `${fK(put.K)}P/${fK(call.K)}C`;
    const parts = []; if (wp) parts.push(fK(wp.K) + "P"); if (wc) parts.push(fK(wc.K) + "C");
    const wings = parts.length === 2 ? `+ ${parts[0]} & ${parts[1]} wings` : parts.length ? `+ ${parts[0]} wing` : "";
    const struct = `short ${kind} ${sx}`;
    return {
      short, kindWord: kind, struct, wings, full: `${short} · ${struct}${wings ? " " + wings : ""}`,
      tab: `${inst.id} ${kind} ${tabSt}${parts.length ? " " + parts.map(p => "+" + p).join(" ") : ""}`
    };
  }
  function naBuilt(key, inst, pos, expId, E, reason, flags, res) {
    const id = inst ? inst.id : String(pos && pos.inst && pos.inst.id || "?");
    const short = expId ? `${id} ${fmtE(expId)}` : id;
    return freeze({
      key, na: true, naReason: reason, tk: id, inst: inst || null, exp: expId || null, E: E || null,
      S: inst ? inst.spot : NaN, T: E ? E.T : NaN, dte: E ? E.dte : NaN, F: E ? E.Fpar : NaN, Fimpl: E ? E.Fpar : NaN, Fcarry: E ? E.Fcarry : NaN, sig: E ? E.sigma : NaN,
      fill: pos && pos.fill === "nat" ? "nat" : "mid", sp: null, sc: null, cap: null, capP: null,
      crS: NaN, capPx: 0, wingPx: 0, cr: NaN, exitCost: 0, intr: NaN, tv: NaN, vega: NaN, margin: NaN, iP: null, iC: null,
      itmP: false, itmC: false, straddle: false, guts: false, capFb: false, inv: false,
      legs: [], marks: [], net: null, kind: "", flags, resolved: res || null, basis: pos ? pos.basis : null, structure: pos ? pos.structure : null,
      label: { short, kindWord: "", struct: "n/a", wings: "", full: `${short} · n/a (${reason})`, tab: `${id} n/a` }
    });
  }

  // ---------------------------------------------------------- POS.build(pos, {expMap}) -> Built
  const build = function (pos, opts) {
    caches();
    const expMap = opts && opts.expMap === "same" ? "same" : "nearest";
    const inst = INST.make(pos && pos.inst);
    const key = JSON.stringify(pos ? canon(pos) : null) + "|" + (inst ? inst.version : "?" + (pos && pos.inst && pos.inst.id)) + "|" + expMap;
    const hit = BC.get(key); if (hit) return hit;
    if (!inst) return BC.set(key, naBuilt(key, null, pos, pos && pos.exp, null, "unknown instrument", []));
    let expId = pos.exp;
    const flags = [];
    if (!inst.expiries.includes(expId)) {
      const m = inst.nearestExp(expId);
      if (expMap === "same" || !m) {
        flags.push({ code: "EXP_NA", severity: "warn", text: `no ${/^\d{8}$/.test(String(expId)) ? fmtE(expId) : "such expiry"} listed`, fix: m ? { path: "exp", value: m } : undefined, from: expId, to: m || null });
        return BC.set(key, naBuilt(key, inst, pos, expId, null, `${inst.id} lists no ${/^\d{8}$/.test(String(expId)) ? fmtE(expId) : "such expiry"}`, freeze(flags)));
      }
      flags.push({ code: "EXP_MAPPED", severity: "warn", text: `no ${/^\d{8}$/.test(String(expId)) ? fmtE(expId) : "such expiry"}: using ${fmtE(m)}`, fix: { path: "exp", value: m }, from: expId, to: m });
      expId = m;
    }
    const E = inst.exp(expId);
    const res = RULE.resolve(E, pos.structure, pos.basis, pos.values, pos.wings);
    for (const f of res.flags) flags.push(f);
    if (res.na) return BC.set(key, naBuilt(key, inst, pos, expId, E, res.na, freeze(flags), res));
    const rlegs = [res.put, res.call, res.wingCall, res.wingPut].filter(Boolean);
    const pr = price(inst, expId, rlegs.map(l => ({ role: l.role, K: l.K })), pos.fill, pos.fills);
    for (const f of pr.flags) flags.push(f);
    const legs = pr.legs.map(x => { const r = rlegs.find(l => l.role === x.role); return Object.assign({}, x, { target: r.target, achieved: r.achieved, snapErr: r.snapErr, Kshort: r.Kshort }); });
    const b = Object.assign({}, pr, {
      key, priced: pr, na: false, naReason: "", kind: res.kind, flags, legs, resolved: res,
      basis: pos.basis, structure: pos.structure, legsMode: pos.legs, center: res.center,
      inv: res.flags.some(f => f.code === "WIDENED"),
      label: labelOf(inst, expId, res.kind, res.put, res.call, res.wingCall, res.wingPut)
    });
    return BC.set(key, freeze(b));
  };

  // ---------------------------------------------------------- marks, value, payoff
  function markAt(b, m, x, tau, sh) {
    const E = b.E, Fx = x * Math.exp(E.g * tau), mm = Math.log(x / b.S);
    const vol = (K, adj) => {
      let v = E.smileF(K, Fx) + adj + (sh.ivs || 0) / 100;
      if (sh.svs) { if (!(sh.svd && mm > 0)) v += sh.svs / 100 * (-mm / 0.1); }
      return Math.max(0.01, v);
    };
    const own = p => p.mode === "pin" ? INST.b76(Fx, p.K, tau, vol(p.K, p.adj), p.cp) : INST.b76(Fx, p.K, tau, vol(p.K, 0), p.cp) + p.resid * tau / b.T;
    if (m.mode === "twin") { const df = Math.exp(-R * tau); return own(m.tw) + (m.cp === "P" ? df * (m.K - Fx) : df * (Fx - m.K)) + m.qp * tau / b.T; }
    return own(m);
  }
  const payoff = function (b, x) {
    if (!b || b.na) return NaN;
    let v = b.cr; for (const m of b.marks) v += m.qty * intrinsic(m.K, m.cp, x);
    return v;
  };
  // P&L per share of closing at price x with τ years left (shock = {ivs, svs, svd}); natural fills pay exitCost
  const val = function (b, x, tau, shock) {
    if (!b || b.na) return NaN;
    if (tau <= 1e-9) return payoff(b, x);
    const sh = shock || NOSHOCK;
    let v = b.cr; for (const m of b.marks) v += m.qty * markAt(b, m, x, tau, sh);
    return v - b.exitCost;
  };
  // per-leg marks and P&L; Σ pnl = val (or payoff at expiry)
  const legsAt = function (b, x, tau, shock) {
    if (!b || b.na) return [];
    const sh = shock || NOSHOCK, exp = tau <= 1e-9, nat = b.fill === "nat";
    return b.marks.map(m => {
      const l = b.legs.find(y => y.role === m.role), mark = exp ? intrinsic(m.K, m.cp, x) : markAt(b, m, x, tau, sh);
      const hsp = nat && !exp ? Math.max(0, (l.ask - l.bid) / 2) : 0;
      return { role: m.role, K: m.K, cp: m.cp, qty: m.qty, mark, pnl: -m.qty * l.fillPx + m.qty * mark - hsp };
    }).sort(sortLegs);
  };

  // ---------------------------------------------------------- generic statistics at expiry
  // Walk the piecewise-linear payoff over all leg strikes: profit = payoff > ε (ε = 1e-9·S); breakevens are the
  // boundaries of the profit set. EV: implied odds = credit + Σ qty·mid (0 at mid fill); period-vol odds = the
  // zero-drift lognormal expectation of the payoff at the period vol (closed form), as v8's HV mode.
  const stats = function (b, d) {
    if (!b || b.na || !d) return null;
    caches();
    const key = b.key + "|" + d.key, hit = SC.get(key); if (hit) return hit;
    const S = b.S, eps = 1e-9 * S, f = x => payoff(b, x) - eps;
    const Ks = [...new Set(b.marks.map(m => m.K))].sort((a, c) => a - c), pts = [0, ...Ks.filter(K => K > 0)];
    const slopeHi = b.marks.reduce((t, m) => t + (m.cp === "C" ? m.qty : 0), 0);
    const iv = [];
    const add = (lo, hi) => { if (!(hi > lo)) return; const p = iv[iv.length - 1]; if (p && Math.abs(p[1] - lo) <= 1e-12 * Math.max(1, lo)) p[1] = hi; else iv.push([lo, hi]); };
    // ε decides what counts as profit; a boundary is reported where the payoff itself crosses 0
    const root = (a, c) => { const pa = payoff(b, a), pc = payoff(b, c); return pa === pc ? a : Math.min(c, Math.max(a, a + (c - a) * pa / (pa - pc))); };
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], c = pts[i + 1], fa = f(a), fc = f(c);
      if (fa > 0 && fc > 0) add(a, c);
      else if (fa > 0) add(a, root(a, c));
      else if (fc > 0) add(root(a, c), c);
    }
    const kn = pts[pts.length - 1], fk = f(kn), pk = payoff(b, kn);
    if (fk > 0 && slopeHi >= 0) add(kn, Infinity);
    else if (fk > 0) add(kn, kn + pk / (-slopeHi));
    else if (slopeHi > 0) add(Math.max(kn, kn + (-pk) / slopeHi), Infinity);
    const bes = [];
    for (const [lo, hi] of iv) { if (lo > 0) bes.push(lo); if (Number.isFinite(hi)) bes.push(hi); }
    let pop = 0; for (const [lo, hi] of iv) pop += (Number.isFinite(hi) ? DIST.cdfK(d, hi) : 1) - DIST.cdfK(d, lo);
    pop = Math.min(1, Math.max(0, pop));
    let legsV = 0;
    if (d.mode === Odds.Implied) for (const l of b.legs) legsV += l.qty * l.mid;
    else for (const m of b.marks) legsV += m.qty * bs0(S, m.K, b.T, d.vol, m.cp);
    const ev = b.cr + legsV;
    const first = iv[0], lastI = iv[iv.length - 1];
    const s = {
      pop, ev, bes, wins: iv.map(x => x.slice()), noBE: bes.length === 0, mode: d.mode,
      beLo: first && first[0] > 0 ? first[0] : null, beHi: lastI && Number.isFinite(lastI[1]) ? lastI[1] : null,
      capBE: b.cap ? b.cap.K + b.capPx : null, pCap: b.cap ? 1 - DIST.cdfK(d, b.cap.K + b.capPx) : null,
      capPBE: b.capP ? b.capP.K - (b.wingPx - b.capPx) : null, pCapP: b.capP ? DIST.cdfK(d, b.capP.K - (b.wingPx - b.capPx)) : null
    };
    return SC.set(key, freeze(s));
  };
  // worst payoff over [Slo, Shi]: the ends and every leg strike inside
  const worstIn = function (b, Slo, Shi) {
    if (!b || b.na) return NaN;
    let w = Math.min(payoff(b, Slo), payoff(b, Shi));
    for (const m of b.marks) if (m.K > Slo && m.K < Shi) w = Math.min(w, payoff(b, m.K));
    return w;
  };

  return Object.freeze({ build, price, val, payoff, legsAt, stats, worstIn, canon, bs0, NOSHOCK });
})();
