// ============================================================ inst9: the instrument registry (v9 model layer)
// One namespace object, INST. The only v9 module that reads the data object (through makeRegistry(D)).
// An Instrument is a frozen snapshot: spot, listed expiries, per-expiry chains with Black-76 marks on the parity
// forward (Fpar), a smile refitted on Fpar, strike grid, leverage and HV. Overrides (spot, IV shift) produce a
// new snapshot with a new version; nothing is ever written to D.
const INST = (() => {
  const LRU_MAX = 2000;
  const CACHES = [];
  // small LRU with hit/miss counters; every model cache is one of these, so tests can see that caches miss
  function cache(name, max) {
    const m = new Map(), lim = max || LRU_MAX, ctr = { name, hits: 0, misses: 0 };
    const c = {
      get(k) { if (m.has(k)) { const v = m.get(k); m.delete(k); m.set(k, v); ctr.hits++; return v; } ctr.misses++; return undefined; },
      set(k, v) { if (m.has(k)) m.delete(k); m.set(k, v); if (m.size > lim) m.delete(m.keys().next().value); return v; },
      has(k) { return m.has(k); },
      clear() { m.clear(); },
      get size() { return m.size; },
      ctr
    };
    CACHES.push(c);
    return c;
  }
  function cacheStats() { const o = {}; for (const c of CACHES) { const k = o[c.ctr.name] ? c.ctr.name + "#" + CACHES.indexOf(c) : c.ctr.name; o[k] = { hits: c.ctr.hits, misses: c.ctr.misses, size: c.size }; } return o; }
  function cacheReset() { for (const c of CACHES) { c.ctr.hits = 0; c.ctr.misses = 0; } }

  // ---------------------------------------------------------- Black-76 on top of eng_head6 (S = F·e^{−RT})
  const b76 = (F, K, T, s, cp) => bs(F * Math.exp(-R * T), K, T, s, cp);
  const iv76 = (px, F, K, T, cp) => impliedVol(px, F * Math.exp(-R * T), K, T, cp);
  // forward delta: call N(d1), put N(d1) − 1 (signed), d1 = (ln(F/K) + σ²T/2)/(σ√T)
  function fwdDelta(F, K, T, s, cp) {
    let c;
    if (!(T > 1e-9) || !(s > 0)) c = K < F ? 1 : K > F ? 0 : 0.5;
    else c = N((Math.log(F / K) + s * s * T / 2) / (s * Math.sqrt(T)));
    return cp === "C" ? c : c - 1;
  }
  function vega76(F, K, T, s) {
    if (!(T > 1e-9) || !(s > 0)) return 0;
    const v = s * Math.sqrt(T), d1 = (Math.log(F / K) + s * s * T / 2) / v;
    return Math.exp(-R * T) * F * npdf(d1) * Math.sqrt(T);
  }

  // ---------------------------------------------------------- deep freeze for snapshots
  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
    return o;
  }

  // ---------------------------------------------------------- weighted least squares cubic (coef high → low)
  function wls(pts, deg) {
    const n = deg + 1, A = [], y = [];
    for (let i = 0; i < n; i++) { A.push(new Array(n).fill(0)); y.push(0); }
    for (const p of pts) {
      const row = []; for (let j = 0; j < n; j++) row.push(Math.pow(p.x, deg - j));
      for (let i = 0; i < n; i++) { y[i] += p.w * row[i] * p.y; for (let j = 0; j < n; j++) A[i][j] += p.w * row[i] * row[j]; }
    }
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-300) return null;
      [A[c], A[piv]] = [A[piv], A[c]]; [y[c], y[piv]] = [y[piv], y[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; y[r] -= f * y[c]; }
    }
    return y.map((v, i) => v / A[i][i]);
  }
  const polyAt = (coef, x) => { let v = 0; for (const c of coef) v = v * x + c; return v; };
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

  // σ76 refit on Fpar: OTM-vs-Fpar listed mids with a bid, cubic in ln(K/Fpar), weight 1/relative spread (floor 2%),
  // one pass dropping |resid| > max(3·wrmse, 0.15). Fewer than 5 points: flat median σ76.
  function fitSmile(rows, Fpar, T, fallback) {
    const pts = [];
    for (const o of rows) {
      if (!(o.bid > 0) || !(o.mid > 0)) continue;
      const otm = o.cp === "P" ? o.K <= Fpar : o.K > Fpar;
      if (!otm) continue;
      const v = iv76(o.mid, Fpar, o.K, T, o.cp);
      if (!Number.isFinite(v)) continue;
      const rel = Math.max((o.ask - o.bid) / o.mid, 0.02);
      pts.push({ x: Math.log(o.K / Fpar), y: v, w: 1 / rel, K: o.K, cp: o.cp });
    }
    const flat = (m, why) => ({ coef: [m], xlo: -1, xhi: 1, T, flat: true, npts: pts.length, why });
    if (pts.length < 5) {
      const m = pts.length ? median(pts.map(p => p.y)) : fallback;
      return flat(Number.isFinite(m) && m > 0 ? m : 0.8, pts.length ? "fewer than 5 OTM quotes" : "no OTM quote");
    }
    let use = pts, c = wls(use, 3);
    if (!c) return flat(median(pts.map(p => p.y)), "fit failed");
    const res = use.map(p => p.y - polyAt(c, p.x)), sw = use.reduce((t, p) => t + p.w, 0);
    const wr = Math.sqrt(use.reduce((t, p, i) => t + p.w * res[i] * res[i], 0) / sw), thr = Math.max(3 * wr, 0.15);
    const keep = use.filter((p, i) => Math.abs(res[i]) <= thr);
    const dropped = use.filter((p, i) => Math.abs(res[i]) > thr).map(p => p.cp + p.K);
    if (keep.length < use.length && keep.length >= 5) { const c2 = wls(keep, 3); if (c2) { c = c2; use = keep; } }
    const xs = use.map(p => p.x);
    return { coef: c, xlo: Math.min(...xs), xhi: Math.max(...xs), T, flat: false, npts: use.length, dropped };
  }

  // wingAnchors (eng_head6) moves a quote-edge anchor inward to where the cubic's slope is zero. When the slope has the
  // wrong sign all the way in, it stops at the midpoint of the quoted range, where the slope is not zero: the smile
  // then breaks slope there and goes flat beyond it, and the implied density gets a spike at that strike (KORU 19 Mar ’27:
  // 2% of the mass in one bin near 16.4, every call above it on one flat vol). In that case the anchor goes instead to
  // the point between the midpoint and the edge with the smallest |slope| (the quote edge itself on today's chains), so
  // the fitted cubic holds over the quoted range and the remaining slope break is as small as the fit allows.
  function smoothAnchors(fit) {
    const w = fit._w; if (!w || fit.flat) return;
    const mid = (fit.xlo + fit.xhi) / 2;
    const least = (a, b) => { let x0 = a, v0 = Math.abs(w.dp(a)); for (let i = 1; i <= 400; i++) { const x = a + (b - a) * i / 400, v = Math.abs(w.dp(x)); if (v < v0) { v0 = v; x0 = x; } } return x0; };
    let lo = w.lo, hi = w.hi;
    if (lo === mid && w.dp(mid) > 0) lo = least(mid, fit.xlo);
    if (hi === mid && w.dp(mid) < 0) hi = least(mid, fit.xhi);
    if (lo !== w.lo || hi !== w.hi) fit._w = { lo, hi, dp: w.dp };
  }

  // ---------------------------------------------------------- registry factory
  function makeRegistry(D) {
    const asof = String(D.meta && D.meta.asof || "");
    const asofDay = (() => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asof); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; })();
    const ids = Object.keys(D.u);
    const LIST = deepFreeze(ids.map(id => ({ id, name: D.u[id].name || id, lev: +D.u[id].lev || 1 })));
    const instC = cache("inst.instrument");
    const baseInst = new Map(), baseExpC = new Map();
    const dteOf = e => {
      for (const id of ids) { const E = D.u[id].exps[e]; if (E && Number.isFinite(+E.dte)) return +E.dte; }
      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(e));
      return m && Number.isFinite(asofDay) ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - asofDay) / 864e5) : NaN;
    };

    // listed data of one expiry at listed spot: rows, Fpar, the refitted smile (computed once)
    function baseExp(id, e) {
      const k = id + "|" + e; if (baseExpC.has(k)) return baseExpC.get(k);
      const U = D.u[id], E0 = U.exps[e], S = +U.S, T = +E0.T, dte = +E0.dte;
      const rows = E0.q.map(o => {
        const bid = o.bid || 0, ask = o.ask || 0;
        const mid = Number.isFinite(o.mid) ? o.mid : bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || 0;
        return { K: +o.K, cp: o.cp, bid, ask, mid };
      }).sort((a, b) => a.K - b.K || (a.cp === b.cp ? 0 : a.cp === "P" ? -1 : 1));
      // parity forward exactly as v8 chain(): up to 3 call/put pairs nearest spot, both with bid > 0 and mid > 0
      const calls = rows.filter(o => o.cp === "C"), puts = rows.filter(o => o.cp === "P"), pairs = [];
      for (const c of calls) { const p = puts.find(x => x.K === c.K); if (p && c.bid > 0 && p.bid > 0 && c.mid > 0 && p.mid > 0) pairs.push({ K: c.K, F: c.K + Math.exp(R * T) * (c.mid - p.mid) }); }
      pairs.sort((a, b) => Math.abs(a.K - S) - Math.abs(b.K - S));
      const near3 = pairs.slice(0, 3), Fc = S * Math.exp(R * T);
      let Fpar = near3.length ? near3.reduce((t, p) => t + p.F, 0) / near3.length : Fc;
      if (!(Fpar > 0)) Fpar = Fc;
      const fit = fitSmile(rows, Fpar, T, +U.hv);
      wingAnchors(fit);            // writes fit._w on the v9-owned object, before it is frozen
      smoothAnchors(fit);          // no slope break where wingAnchors fell back to the midpoint
      deepFreeze(fit);
      const strikes = [...new Set(rows.map(o => o.K))].sort((a, b) => a - b);
      const out = { id: e, S, T, dte, rows, Fpar, Fcarry: Fc, fit, strikes };
      baseExpC.set(k, out);
      return out;
    }

    function increment(strikes, F) {
      const band = strikes.filter(K => K >= 0.8 * F && K <= 1.2 * F), use = band.length >= 2 ? band : strikes;
      const cnt = new Map();
      for (let i = 1; i < use.length; i++) { const d = +(use[i] - use[i - 1]).toFixed(6); if (d > 0) cnt.set(d, (cnt.get(d) || 0) + 1); }
      let best = NaN, bc = 0;
      for (const [d, n] of cnt) if (n > bc || (n === bc && d < best)) { best = d; bc = n; }
      return Number.isFinite(best) ? best : Math.max(F * 0.05, 0.01);
    }

    // one expiry of one instrument snapshot
    function makeExpiry(id, e, S, ivShift, version, overridden) {
      const b = baseExp(id, e), T = b.T, sh = ivShift / 100, spotMoved = S !== b.S;
      const Fpar = spotMoved ? b.Fpar * S / b.S : b.Fpar, g = Math.log(b.Fpar / b.S) / T;
      const fit = b.fit;
      // σ at K given a forward F (sticky moneyness), IV shift included; σ76 alone = smileF(K, Fpar) with no shift
      const s76 = (K, F) => smile(fit, K, F);
      const smileF = (K, F) => Math.max(0.01, s76(K, F) + sh);
      const smileK = K => smileF(K, Fpar);
      const cdC = new Map();
      const callDelta = K => { let v = cdC.get(K); if (v === undefined) { v = fwdDelta(Fpar, K, T, smileK(K), "C"); if (cdC.size < 4000) cdC.set(K, v); } return v; };
      const rows = b.rows.map(o => {
        let bid = o.bid, ask = o.ask, mid = o.mid, model = false;
        const iv = smileK(o.K);
        if (spotMoved) {
          model = true;
          const m2 = b76(Fpar, o.K, T, iv, o.cp), h = o.mid > 0 ? (o.ask - o.bid) / (2 * o.mid) : 1;
          mid = m2; bid = o.bid > 0 ? Math.max(0, m2 * (1 - h)) : 0; ask = o.ask > 0 ? m2 * (1 + h) : 0;
        } else if (sh !== 0) {
          model = true;
          const s0 = s76(o.K, b.Fpar), m2 = Math.max(0, o.mid + b76(b.Fpar, o.K, T, iv, o.cp) - b76(b.Fpar, o.K, T, s0, o.cp));
          bid = o.mid > 0 ? m2 * o.bid / o.mid : 0; ask = o.mid > 0 ? m2 * o.ask / o.mid : 0; mid = m2;
        }
        const ivm = mid > 0 ? iv76(mid, Fpar, o.K, T, o.cp) : NaN, c = callDelta(o.K);
        return { K: o.K, cp: o.cp, bid, ask, mid, iv, ivm, delta: o.cp === "C" ? c : c - 1, model };
      });
      const byKey = new Map(rows.map(o => [o.K + o.cp, o]));
      const atm = smileF(Fpar, Fpar);
      const E = {
        id: e, instId: id, version, dte: b.dte, T, S, Fpar, g, Fcarry: S * Math.exp(R * T),
        atm, sigma: atm * Math.sqrt(T),
        smile: smileK, smileF, callDelta,
        rows, puts: rows.filter(o => o.cp === "P"), calls: rows.filter(o => o.cp === "C"),
        row: (K, cp) => byKey.get(K + cp) || null,
        strikes: b.strikes, increment: increment(b.strikes, Fpar),
        model: overridden, fitInfo: { flat: fit.flat, npts: fit.npts, xlo: fit.xlo, xhi: fit.xhi, coef: fit.coef }
      };
      for (const o of rows) Object.freeze(o);
      Object.freeze(E.rows); Object.freeze(E.puts); Object.freeze(E.calls); Object.freeze(E.fitInfo);
      return Object.freeze(E);
    }

    function makeInst(id, S, ivShift) {
      const U = D.u[id], spotListed = +U.S, overridden = !(S === spotListed && ivShift === 0);
      const version = `${id}|${S.toFixed(6)}|${ivShift.toFixed(3)}|${asof}`;
      const expiries = Object.keys(U.exps).sort();
      const EC = new Map();
      const exp = e => {
        if (!Object.prototype.hasOwnProperty.call(U.exps, e)) return null;
        let x = EC.get(e); if (!x) { x = makeExpiry(id, e, S, ivShift, version, overridden); EC.set(e, x); }
        return x;
      };
      const nearestExp = e => {
        if (expiries.includes(e)) return e;
        const t = dteOf(e); if (!Number.isFinite(t) || !expiries.length) return expiries[0] || null;
        let best = null, bd = Infinity, bt = -Infinity;
        for (const x of expiries) { const d = +U.exps[x].dte, dd = Math.abs(d - t); if (dd < bd - 1e-12 || (Math.abs(dd - bd) <= 1e-12 && d > bt)) { best = x; bd = dd; bt = d; } }
        return best;
      };
      return Object.freeze({
        id, name: U.name || id, lev: +U.lev || 1, hv: +U.hv, spot: S, spotListed, ivShift, overridden, version,
        expiries: Object.freeze(expiries), exp, nearestExp, slot: Object.freeze(overridden ? { id, spot: S, ivShift } : { id })
      });
    }

    function base(id) {
      if (!Object.prototype.hasOwnProperty.call(D.u, id)) return null;
      let x = baseInst.get(id); if (!x) { x = makeInst(id, +D.u[id].S, 0); baseInst.set(id, x); }
      return x;
    }
    function make(sd) {
      if (!sd || !Object.prototype.hasOwnProperty.call(D.u, sd.id)) return null;
      const S0 = +D.u[sd.id].S;
      let S = Number.isFinite(+sd.spot) && sd.spot !== null && sd.spot !== "" && +sd.spot > 0 ? +sd.spot : S0;
      let iv = Number.isFinite(+sd.ivShift) && sd.ivShift !== null && sd.ivShift !== "" ? +sd.ivShift : 0;
      if (Math.abs(S - S0) < 1e-9 * S0) S = S0;
      if (S !== S0) S = +S.toFixed(6);
      iv = +iv.toFixed(3); if (Object.is(iv, -0)) iv = 0;
      if (Math.abs(S - S0) < 1e-9 * S0) S = S0;
      if (S === S0 && iv === 0) return base(sd.id);
      const version = `${sd.id}|${S.toFixed(6)}|${iv.toFixed(3)}|${asof}`;
      const hit = instC.get(version); if (hit) return hit;
      return instC.set(version, makeInst(sd.id, S, iv));
    }
    // ATM vol at horizon T: the listed expiry with that T, else total variance atm²·T interpolated linearly in T
    // between the expiries either side, flat vol beyond the ends. IV shift included (Expiry.atm carries it).
    function atmAt(inst, T) {
      const ex = inst.expiries.map(e => inst.exp(e)).sort((a, b) => a.T - b.T);
      if (!ex.length) return NaN;
      for (const E of ex) if (Math.abs(E.T - T) < 1e-12) return E.atm;
      if (T <= ex[0].T) return ex[0].atm;
      if (T >= ex[ex.length - 1].T) return ex[ex.length - 1].atm;
      for (let i = 1; i < ex.length; i++) if (T < ex[i].T) {
        const a = ex[i - 1], b2 = ex[i], w = (T - a.T) / (b2.T - a.T), tv = a.atm * a.atm * a.T + w * (b2.atm * b2.atm * b2.T - a.atm * a.atm * a.T);
        return Math.sqrt(Math.max(tv, 1e-12) / T);
      }
      return ex[ex.length - 1].atm;
    }

    return {
      list: () => LIST,
      ids: () => ids.slice(),
      has: id => Object.prototype.hasOwnProperty.call(D.u, id),
      base, make, atmAt, dteOf, asof,
      makeRegistry, b76, iv76, fwdDelta, vega76, r: R, cache, cacheStats, cacheReset, deepFreeze
    };
  }

  return makeRegistry(D);
})();
