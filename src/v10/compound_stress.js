// ============================================================ Stress engine (pure): what a move does to the account at a given week
// Snapshot of the typical account (from the week-by-week engine) + a scenario + rules -> path through the move and a loss breakdown.
// Moves may fall, gap and reverse here; the week-by-week engine's own path never falls.
const COMPOUND_STRESS = ((COMPOUND_ENGINE) => {
  const { bs, pickStrike, naked, reqStr, LEV } = COMPOUND_ENGINE;
  const hsOf = p => p > 0 ? Math.max(0.025, 0.07 * p) : 0;
  const markOf = (l, x, iv, el) => { const tau = Math.max(0, (l.days - el) / 365); return tau > 1e-9 ? bs(x, l.K, tau, iv, l.cp) : Math.max(0, l.cp === "C" ? x - l.K : l.K - x); };
  const navAt = (s, x, iv, el) => { let v = s.cash + s.n * x; for (const l of s.legs) v += 100 * l.q * markOf(l, x, iv, el); return v; };

  // ---------------------------------------------------------- snapshot of the typical account at week w (after that week's trades)
  function snapshot(R, w, sc, costs) {
    const run = R.run, rows = R.rows, W = sc.W; w = Math.max(0, Math.min(W - 1, w));
    let i = rows.findIndex(r => w >= r.w0 && w < r.w1); if (i < 0) i = rows.length - 1;
    const r = rows[i], prev = i ? rows[i - 1] : null, nav0 = prev ? prev.med : sc.cap0, S0 = r.S0, iv = r.iv;
    const sell = p => p - costs.give * hsOf(p), buy = p => p + costs.give * hsOf(p);
    const s = { tk: run.tk, run, w, iv, cash: 0, n: 0, legs: [], credNet: 0 };
    if (run.fam === "cc") {
      const m = 1 / R.LMAX, lam = run.modus.credit === "rebal" ? run.lev : (prev ? prev.lamTyp : run.lev);
      s.n = Math.floor(Math.min(lam, 1 / m) * nav0 / S0 + 1e-9);
      const calls = r.Kc ? Math.min(Math.floor(s.n / 100 + 1e-9), costs.liq || 1e9) : 0, puts = run.puts && r.Kp ? calls : 0;
      if (calls) s.legs.push({ cp: "C", q: -calls, K: r.Kc, days: r.days });
      if (puts) s.legs.push({ cp: "P", q: -puts, K: r.Kp, days: r.days });
      s.credNet = 100 * calls * sell(r.pc) + 100 * puts * sell(r.pp) - costs.comm * (calls + puts);
      s.cash = nav0 - s.n * S0 + s.credNet;
    } else {
      const L = { Kc: r.Kc, Kp: r.Kp, Kwc: r.Kwc, Kwp: r.Kwp }, q = reqStr(run.tk, S0, L, r.pc, r.pp), base = run.modus.credit === "cash" ? sc.cap0 : nav0;
      const k = Math.min(Math.floor(run.use * base / (100 * q) + 1e-9), costs.liq || 1e9);
      if (k > 0) { s.legs.push({ cp: "C", q: -k, K: r.Kc, days: r.days }, { cp: "P", q: -k, K: r.Kp, days: r.days });
        if (r.Kwc) s.legs.push({ cp: "C", q: k, K: r.Kwc, days: r.days }); if (r.Kwp) s.legs.push({ cp: "P", q: k, K: r.Kwp, days: r.days });
        s.credNet = 100 * k * (sell(r.pc) + sell(r.pp) - (r.Kwc ? buy(bs(S0, r.Kwc, r.days / 365, iv, "C")) : 0) - (r.Kwp ? buy(bs(S0, r.Kwp, r.days / 365, iv, "P")) : 0)) - costs.comm * k * s.legs.length; }
      s.cash = nav0 + s.credNet;
    }
    // inside a monthly cycle: the cycle-start position, marked at this week's price with the time left
    const dw = w - r.w0, el0 = 7 * dw, Sw = S0 * (sc.mult[w] / sc.mult[r.w0]);
    s.S = Sw; s.el0 = el0; s.nav = navAt(s, Sw, iv, el0); s.navStart = nav0;
    return s;
  }

  // ---------------------------------------------------------- IBKR margin (Reg T, leveraged-ETF factors); US options excluded from equity
  function margin(s, x, iv, el, mStock) {
    const L = LEV[s.tk], a = Math.min(1, 0.2 * L), b = Math.min(1, 0.1 * L);
    const scs = s.legs.filter(l => l.cp === "C" && l.q < 0), sps = s.legs.filter(l => l.cp === "P" && l.q < 0);
    const lcs = s.legs.filter(l => l.cp === "C" && l.q > 0), lps = s.legs.filter(l => l.cp === "P" && l.q > 0);
    const shortC = scs.reduce((t, l) => t - l.q, 0), covC = Math.min(shortC, Math.floor(s.n / 100 + 1e-9)), Kc = scs.length ? scs[0].K : Infinity;
    const nCov = 100 * covC, nUnc = s.n - nCov, stockVal = Math.max(0, nUnc) * x + nCov * Math.min(x, Kc);
    const elv = s.cash + stockVal; let req = mStock * stockVal;
    const nakC = shortC - covC, nakP = sps.reduce((t, l) => t - l.q, 0);
    const mc = scs.length ? markOf(scs[0], x, iv, el) : 0, mp = sps.length ? markOf(sps[0], x, iv, el) : 0;
    if (lcs.length || lps.length) { // wings: spread rules
      const Ls = { Kc: scs.length ? scs[0].K : 0, Kp: sps.length ? sps[0].K : 0, Kwc: lcs.length ? lcs[0].K : 0, Kwp: lps.length ? lps[0].K : 0 };
      req += 100 * Math.max(nakC, nakP) * reqStr(s.tk, x, Ls, mc, mp);
    } else {
      const rc = scs.length ? mc + Math.max(a * x - Math.max(0, scs[0].K - x), b * x) : 0;
      const rp = sps.length ? mp + Math.max(a * x - Math.max(0, x - sps[0].K), b * sps[0].K) : 0;
      const pair = Math.min(nakC, nakP);
      req += 100 * pair * Math.max(rc + mp, rp + mc) + 100 * (nakC - pair) * rc + 100 * (nakP - pair) * rp;
    }
    return { elv, req, stockVal };
  }

  // ---------------------------------------------------------- scenarios -> trading days after the snapshot (Friday close)
  // scen: {shape:'gap'|'run'|'dd'|'spike', X (fraction, signed), unit:'etf'|'index', k (weeks), n (weeks), back (sessions), arrive:'gap'|'spread', land (0..4)}
  function compile(scen, L) {
    if (scen.shape === "list") return scen.days;
    const toK = r => scen.unit === "index" ? Math.max(0, 1 + L * r) - 1 : r;
    const wk = (tot, arrive) => {
      if (arrive === "gap") { const m = [1, 1, 1, 1, 1]; m[scen.land || 0] = 1 + toK(scen.unit === "index" ? tot : tot); return m; }
      const per = Math.pow(1 + tot, 1 / 5) - 1; return Array(5).fill(1 + toK(per));
    };
    const weeks = [];
    if (scen.shape === "gap") weeks.push(wk(scen.X, "gap"));
    if (scen.shape === "spike") { const m = wk(scen.X, "gap"), d = scen.back || 0, at = (scen.land || 0) + d; if (d > 0) { if (at < 5) m[at] = 1 / m[scen.land || 0]; else { weeks.push(m); const m2 = [1, 1, 1, 1, 1]; m2[at - 5] = 1 / m[scen.land || 0]; weeks.push(m2); } } if (!(d > 0 && at >= 5)) weeks.push(m); }
    if (scen.shape === "run") for (let k = 0; k < (scen.k || 3); k++) weeks.push(wk(scen.X, scen.arrive || "gap"));
    if (scen.shape === "dd") { const n = scen.n || 4, per = Math.pow(1 + scen.X, 1 / n) - 1; for (let k = 0; k < n; k++) weeks.push(wk(per, scen.arrive || "spread")); }
    const days = []; weeks.forEach((m, w) => m.forEach((mult, d) => days.push({ el: 7 * w + 3 + d, wk: w, dow: d, mult })));
    return days;
  }
  const kOfMove = (X, unit, L) => unit === "index" ? Math.max(-1, L * X) : X; // one-session equivalent

  // ---------------------------------------------------------- open the next cycle at x (keeps trading), following the run's rules
  function openCycle(s, x, iv, costs, days, mStock) {
    const run = s.run, T = days / 365, g = costs.grid && costs.grid[run.tk] != null ? costs.grid[run.tk] : 1, sell = p => p - costs.give * hsOf(p);
    const nav = s.cash + s.n * x; s.legs = []; s.credNet = 0; if (nav <= 0) return;
    if (run.fam === "cc") {
      const lam = Math.min(run.lev, 1 / mStock), base = s.nPre ?? s.n, cap = Math.floor(nav / (mStock * x) + 1e-9); let tgt = Math.min(base, cap);
      if (run.modus.credit === "rebal") tgt = Math.floor(lam * nav / x);
      else if (run.modus.credit === "reinvest" && s.lastRes !== undefined) tgt = Math.max(0, Math.min(Math.floor(base + lam * s.lastRes / x), cap));
      const dn = tgt - s.n; s.cash -= dn * x + Math.abs(dn) * (costs.commSh + 0.005); s.n = tgt;
      const K = pickStrike(x, T, iv, "C", run.cd, g), calls = Math.min(Math.floor(s.n / 100 + 1e-9), costs.liq || 1e9);
      if (calls > 0) { s.legs.push({ cp: "C", q: -calls, K, days }); s.credNet = 100 * calls * sell(bs(x, K, T, iv, "C")) - costs.comm * calls; s.cash += s.credNet; }
    } else {
      const Kc = pickStrike(x, T, iv, "C", run.cd, g), Kp = pickStrike(x, T, iv, "P", run.pd, g), pc = bs(x, Kc, T, iv, "C"), pp = bs(x, Kp, T, iv, "P");
      const q = reqStr(run.tk, x, { Kc, Kp, Kwc: 0, Kwp: 0 }, pc, pp), k = Math.min(Math.floor(run.use * nav / (100 * q)), costs.liq || 1e9);
      if (k > 0) { s.legs.push({ cp: "C", q: -k, K: Kc, days }, { cp: "P", q: -k, K: Kp, days }); s.credNet = 100 * k * (sell(pc) + sell(pp)) - 2 * costs.comm * k; s.cash += s.credNet; }
    }
  }

  const RULES = { ivDown: 0.10, ivUp: 0.05, ivShift: 0, ivCap: 2.5, mAfter: null, slipSh: 0.01, slipOptK: 2, shareOnly: false, assign: "hold" };
  // ---------------------------------------------------------- one stress run
  function run(snap0, scen, rules = {}, costs) {
    const Rl = { ...RULES, ...rules }, run_ = snap0.run, L = LEV[snap0.tk];
    const s = { ...snap0, legs: snap0.legs.map(l => ({ ...l })) };
    if (Rl.shareOnly) s.legs = s.legs.filter(l => !(l.cp === "C" && l.q < 0)), s.cash -= 0;
    const S0 = snap0.S, iv0 = snap0.iv;
    const mS = Rl.mAfter ?? Math.min(1, 0.25 * L);
    let ivB = iv0; const ivAt = x => { const lm = Math.log(Math.max(x, 1e-9) / S0); return Math.min(Rl.ivCap, Math.max(0.05, ivB + Rl.ivShift + Rl.ivDown * Math.max(0, -lm) / 0.1 + Rl.ivUp * Math.max(0, lm) / 0.1)); };
    const navBefore = navAt(s, S0, iv0, snap0.el0 || 0), days = compile(scen, L);
    let x = S0, low = navBefore, high = navBefore, cyc0 = -(snap0.el0 || 0);
    const ev = { call: null, sold: 0, slip: 0, wiped: false, deficit: 0, assigned: 0, closedAt: null, pnlSh: 0, n0: snap0.n };
    const tl = scen.lite ? null : [{ el: 0, x, iv: iv0, nav: navBefore }]; let peak = navBefore, maxDD = 0, lastEl = 0;
    const modus = run_.modus || { call: "ibkr", target: 1, move: "keep" };
    for (const d of days) {
      if (ev.wiped) break;
      if (scen.ivw) ivB = scen.ivw[Math.min(d.wk + (snap0.w || 0), scen.ivw.length - 1)];
      const xPrev = x; x = Math.max(0, x * d.mult); const iv = ivAt(x), el = d.el - cyc0; ev.pnlSh = (ev.pnlSh || 0) + s.n * (x - xPrev);
      if (s.dump) { const k = Math.min(s.dump, s.n); s.cash += k * x * (1 - Rl.slipSh); s.n -= k; ev.slip += k * x * Rl.slipSh; s.dump = 0; } // assigned shares of a strangle sold at the open
      const mg = margin(s, x, iv, el, mS);
      if (mg.elv < mg.req - 1e-9) {
        if (!ev.call) ev.call = { el: d.el, day: d.wk * 5 + d.dow + 1, x, short: mg.req - mg.elv };
        const legPx = l => { const mk = markOf(l, x, iv, el); return mk + (l.q < 0 ? 1 : -1) * Rl.slipOptK * hsOf(mk); };
        let f;
        if (modus.call === "target" && s.n > 0) { // puts back, shares down to the target leverage, calls on sold lots back
          for (const l of s.legs) if (l.cp === "P" && l.q < 0) { const px = legPx(l); s.cash += 100 * l.q * px; ev.slip += 100 * -l.q * (px - markOf(l, x, iv, el)); l.q = 0; }
          const nv = navAt(s, x, iv, el), keep = Math.max(0, Math.min(s.n, (modus.target ?? 1) * nv / x)); f = nv <= 0 ? 1 : 1 - keep / s.n;
        } else if (modus.call === "target") f = 1; // strangles: closed
        else { // only what IBKR requires: the smallest pro-rata fraction that restores the requirement (whole units, rounded up)
          let D = s.n * x * (1 - Rl.slipSh) - mg.stockVal; for (const l of s.legs) D += 100 * l.q * legPx(l);
          const den = mg.req + D; f = den > 0 ? (mg.req - mg.elv) / den : 1; if (!(f > 0) || f > 1) f = 1;
          const units = Math.max(s.n, ...s.legs.map(l => Math.abs(l.q))); if (units > 0) f = Math.min(1, Math.ceil(f * units + 1e-9) / units);
        }
        const nSold = s.n * f; ev.sold += nSold; ev.slip += nSold * x * Rl.slipSh; s.cash += nSold * x * (1 - Rl.slipSh); s.n -= nSold;
        for (const l of s.legs) { const px = legPx(l); s.cash += 100 * f * l.q * px; ev.slip += 100 * f * Math.abs(l.q) * Math.abs(px - markOf(l, x, iv, el)); l.q *= 1 - f; }
        if (f >= 1 - 1e-9 && !ev.closedAt) ev.closedAt = { el: d.el, x };
        s.legs = s.legs.filter(l => Math.abs(l.q) > 1e-9); if (!s.legs.length) s.nextOpen = cyc0 + (run_.cad === "wk" ? 7 : 28);
        const after = navAt(s, x, iv, el); if (after <= 0) { ev.wiped = true; ev.deficit = -after; }
      }
      const nv = navAt(s, x, iv, el); low = Math.min(low, nv); high = Math.max(high, nv);
      if (scen.weekly && d.dow === 4) scen.weekly.push(nv);
      if (tl) tl.push({ el: d.el, x, iv, nav: nv }); else { if (nv > peak) peak = nv; else if (peak > 0) maxDD = Math.max(maxDD, 1 - nv / peak); } lastEl = d.el;
      // expiry (the legs' last day; after a full close, the next cycle start): settle, then a fresh cycle if the move continues
      const cycDays = run_.cad === "wk" ? 7 : 28;
      const isExp = s.legs.length ? s.legs.some(l => l.q !== 0 && l.days - el <= 0.5) : (d.dow === 4 && d.el >= (s.nextOpen ?? 0));
      if (isExp) {
        let pay = 0; for (const l of s.legs) if (l.q < 0) pay += 100 * -l.q * Math.max(0, l.cp === "C" ? x - l.K : l.K - x);
        s.lastRes = s.credNet - pay;
        // in-the-money legs settle at intrinsic (assignment and an immediate stock trade), as in the week-by-week engine
        s.nPre = s.n;
        for (const l of s.legs) { const itm = Math.max(0, l.cp === "C" ? x - l.K : l.K - x); if (!(itm > 0) || !l.q) continue;
          if (l.cp === "C" && l.q < 0 && s.n > 0) { // covered lots are delivered at the strike; the rest pays intrinsic
            const cov = Math.min(-l.q, Math.floor(s.n / 100 + 1e-9)); s.n -= 100 * cov; s.cash += 100 * cov * l.K + 100 * (l.q + cov) * itm; ev.assigned += cov; continue; }
          if (Rl.assign === "hold" && l.cp === "P" && l.q < 0) { // assigned shares arrive at the strike and are exposed to the next session's open
            s.n += 100 * -l.q; s.cash -= 100 * -l.q * l.K; ev.assigned += -l.q; if (run_.fam !== "cc") s.dump = (s.dump || 0) + 100 * -l.q; continue; }
          s.cash += 100 * l.q * itm; if (l.q < 0) { s.cash -= 100 * -l.q * (costs.commSh + 0.005); ev.assigned += -l.q; } }
        s.legs = []; cyc0 = d.el; s.nextOpen = d.el + cycDays;
        const mg2 = margin(s, x, iv, 0, mS);
        if (mg2.elv < mg2.req - 1e-9 && s.n > 0) { const need = Math.ceil((mg2.req - mg2.elv) / ((mS - Rl.slipSh) * x)); const k = Math.min(s.n, need); s.cash += k * x * (1 - Rl.slipSh); s.n -= k; ev.sold += k; ev.slip += k * x * Rl.slipSh; if (!ev.call) ev.call = { el: d.el, day: d.wk * 5 + d.dow + 1, x, short: mg2.req - mg2.elv, afterAssign: true }; }
        if (navAt(s, x, iv, 0) <= 0) { ev.wiped = true; ev.deficit = Math.max(ev.deficit, -navAt(s, x, iv, 0)); }
        const more = scen.shape === "list" ? d !== days[days.length - 1] : days.some(e => e.el > d.el);
        if (more && modus.move !== "stop" && !ev.wiped) openCycle(s, x, iv, costs, cycDays, mS);
      }
    }
    const ivE = ivAt(x), navEnd = navAt(s, x, ivE, (lastEl - cyc0));
    return { navBefore, navEnd, low, high, lossLow: navBefore - low, lossEnd: navBefore - navEnd, x, xMove: x / S0 - 1, ev, tl, s, ivEnd: ivE, maxDD };
  }

  // upside given up by covered calls: same shares and cash with no calls, minus the strategy
  function givenUp(snap, scen, rules, costs) {
    if (snap.run.fam !== "cc") return 0;
    const a = run(snap, scen, rules, costs), b = run({ ...snap, run: { ...snap.run, modus: { ...snap.run.modus, move: "stop" } } }, scen, { ...rules, shareOnly: true }, costs);
    return Math.max(0, (b.navEnd - b.navBefore) - (a.navEnd - a.navBefore));
  }

  // largest single gap (in the ETF) before a margin call and before NAV 0, down and up
  function room(snap, rules, costs) {
    const solve = (dir, test) => { const hiX = dir < 0 ? 0.999 : 4; let lo = 0, hi = hiX;
      const bad = X => { const r = run({ ...snap, run: { ...snap.run, modus: { ...snap.run.modus, move: "stop" } } }, { shape: "gap", X: dir * X, unit: "etf" }, rules, costs); return test(r); };
      if (!bad(hi)) return null; for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (bad(m)) hi = m; else lo = m; } return dir * hi; };
    return { callDown: solve(-1, r => !!r.ev.call), zeroDown: solve(-1, r => r.navEnd <= 1e-6 || r.ev.wiped), callUp: solve(1, r => !!r.ev.call), zeroUp: solve(1, r => r.navEnd <= 1e-6 || r.ev.wiped) };
  }

  // ---------------------------------------------------------- Random paths: seeded daily lognormal moves around the path (no jumps)
  const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  function mcDays(mult, rv, W, seed, i) {
    const rnd = mulberry((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0), days = [];
    for (let w = 0; w < W; w++) { const mu = Math.log(mult[w + 1] / mult[w]), rvw = Array.isArray(rv) ? rv[Math.min(w, rv.length - 1)] : rv;
      for (let d = 0; d < 5; d++) { const dt = d === 0 ? 3 : 1; let u1 = rnd(), u2 = rnd(); if (u1 < 1e-12) u1 = 1e-12;
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        days.push({ el: 7 * w + 3 + d, wk: w, dow: d, mult: Math.exp(mu * dt / 7 + rvw * Math.sqrt(dt / 365) * z) }); } }
    return days;
  }
  function mcRun(snap0, mult, rv, W, seed, from, to, costs, mAfter, ivw) {
    const snap = { ...snap0, run: { ...snap0.run, modus: { ...snap0.run.modus, move: "keep" } } }, out = [];
    for (let i = from; i < to; i++) { const wk = [], r = run(snap, { shape: "list", lite: true, weekly: wk, ivw, days: mcDays(mult, rv, W, seed, i) }, { ivDown: 0, ivUp: 0, ivShift: 0, mAfter, assign: "settle", slipOptK: 1, slipSh: 0.005 }, costs);
      while (wk.length < W) wk.push(wk.length ? wk[wk.length - 1] : r.navEnd);
      out.push({ end: Math.max(0, r.navEnd) - (r.ev.deficit || 0), dd: r.maxDD, call: r.ev.call ? 1 : 0, wiped: r.ev.wiped ? 1 : 0, def: r.ev.deficit > 0 ? 1 : 0, wk }); }
    return out;
  }

  return { snapshot, margin, compile, run, givenUp, room, navAt, RULES, mcRun, mcDays };
})(COMPOUND_ENGINE);
if (typeof module !== "undefined") module.exports = COMPOUND_STRESS;
