// ============================================================ capture: the share of its maximum payoff a position keeps (pure)
// Capture = P&L / the maximum payoff at expiry. For a short straddle or strangle the maximum is the credit (the
// price pins the strike, or ends between the strikes), so 100% is everything kept, 0% a break-even and below 0% a
// loss. The readings weigh every outcome by its odds:
//   - a scenario is a list of prices with weights that sum to 1: a zero-drift lognormal at a vol (with an optional
//     gap mixed in), the implied distribution of a chain, or the past moves of a ticker (empirical);
//   - measure() turns a scenario and a P&L function into the mean, the median, any percentile, the odds of keeping
//     at least x, and the whole curve of those odds;
//   - timePath() is what is kept so far when the price does not move; growth() the average log growth a cycle on a
//     capital, and the fixed capture that compounds to the same; managed() a take-profit / stop rule on seeded daily
//     paths, for positions the comparer's MANAGE does not cover (the Compounding tab's cycles).
// A position is described by plain functions, per share: { S0, years, days, payoff(S), value(S, tau), strikes }.
// payoff(S) is the P&L at expiry (credit included); value(S, tau) the P&L if closed with tau years left. One
// namespace: CAPTURE.
const CAPTURE = (() => {
  const CAPTURE_CONFIG = Object.freeze({
    cells: 1601,            // cells of a lognormal scenario
    span: 8,                // a lognormal scenario spans ±span σ√T
    curveLow: -3,           // the capture curve runs from −300% ...
    curveHigh: 1,           // ... to +100%
    curvePoints: 201,
    minEmpiricalWindows: 30,
    tradingDaysPerYear: 252,
    managedPaths: 6000,
    managedGrid: 201,
    managedGridSpan: 7,
    seed: 20261003,
    ruinFloor: 1e-9,        // a capital that would go to or below 0 counts as this share of itself (as the engine does)
    ruinShown: 0.00005,     // a wipe-out chance a cycle above this makes the growth "ends at zero" (the floor would set it)
    timePathSteps: 400
  });
  const Preset = Object.freeze({
    Fixed: "fixed", Expected: "expected", Median: "median", OddsAtLeast: "odds", Managed: "managed",
    TimePath: "time", Growth: "growth", Empirical: "empirical", Custom: "custom"
  });
  // the custom variant's choices
  const VolSourceChoice = Object.freeze({ PeriodVol: "pv", AtmIv: "atm", Typed: "typed" });
  const GapSide = Object.freeze({ Down: "down", Either: "either" });
  const Reading = Object.freeze({ Mean: "mean", Median: "median", Percentile: "pct" });
  const Exit = Object.freeze({ Expiry: "expiry", DaysLeft: "days" });

  // ---------------------------------------------------------- the maximum payoff
  // a piecewise-linear payoff peaks at a strike or at an end: the largest of those, per share
  /** @param {{ payoff: (S: number) => number, strikes: number[], S0: number }} position @returns {LabResult} */
  function findMaxPayoff({ payoff, strikes, S0 }) {
    const candidates = [...strikes, S0, S0 * 1e-4, S0 * 100].filter(S => S > 0);
    const best = Math.max(...candidates.map(payoff).filter(Number.isFinite));
    if (!(best > 0)) { return Result.err({ code: "no_profit", message: "this position cannot make money at expiry" }); }
    return Result.ok(best);
  }

  // ---------------------------------------------------------- scenarios: prices with weights summing to 1
  /** @typedef {{ S: Float64Array, w: Float64Array }} Scenario */
  // a lognormal over `years` at `vol`: centred on the mean (zero drift, ln S_T ~ N(ln S0 − σ²T/2, σ²T)) or on a
  // log move `mu` (the Compounding tab's paths are medians); each cell carries its exact probability mass
  /** @param {{ S0: number, vol: number, years: number, mu?: number }} input @returns {Scenario} */
  function lognormal({ S0, vol, years, mu }) {
    const n = CAPTURE_CONFIG.cells, v = vol * Math.sqrt(Math.max(years, 1e-9)), center = mu === undefined ? -v * v / 2 : mu;
    const lo = center - CAPTURE_CONFIG.span * v, step = 2 * CAPTURE_CONFIG.span * v / n;
    const S = new Float64Array(n), w = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const a = lo + i * step, b = a + step;
      w[i] = N((b - center) / v) - N((a - center) / v);
      S[i] = S0 * Math.exp((a + b) / 2);
      total += w[i];
    }
    for (let i = 0; i < n; i++) { w[i] /= total; }
    return { S, w };
  }
  // a gap mixed into a scenario: with `chance` the price also moves by `size` (down, or half down and half up)
  /** @param {{ scenario: Scenario, chance: number, size: number, side: string }} input @returns {Scenario} */
  function withGap({ scenario, chance, size, side }) {
    const p = Math.min(1, Math.max(0, chance)), gap = Math.min(0.99, Math.max(0, size));
    if (!(p > 0) || !(gap > 0)) { return scenario; }
    const shifts = side === GapSide.Either ? [[1 - gap, p / 2], [1 + gap, p / 2]] : [[1 - gap, p]];
    const n = scenario.S.length, parts = [[1, 1 - p], ...shifts];
    const S = new Float64Array(n * parts.length), w = new Float64Array(n * parts.length);
    parts.forEach(([factor, share], k) => {
      for (let i = 0; i < n; i++) { S[k * n + i] = scenario.S[i] * factor; w[k * n + i] = scenario.w[i] * share; }
    });
    return { S, w };
  }
  // a chain's own distribution (DIST: log-moneyness cells u with a cumulative cdf), as the comparer's odds read it
  /** @param {{ S0: number, d: any }} input @returns {LabResult} */
  function fromDistribution({ S0, d }) {
    if (!d || !d.cdf || !d.u) { return Result.err({ code: "no_distribution", message: "no distribution for this expiry" }); }
    const S = [], w = [];
    let total = 0;
    const add = (u, mass) => { if (mass > 0) { S.push(S0 * Math.exp(u)); w.push(mass); total += mass; } };
    // the mass below the grid sits at its first point, the mass above at its last (none of it is dropped)
    add(d.u[0], d.cdf[0]);
    for (let i = 1; i <= d.n; i++) { add((d.u[i] + d.u[i - 1]) / 2, d.cdf[i] - d.cdf[i - 1]); }
    add(d.u[d.n], 1 - d.cdf[d.n]);
    if (!(total > 0)) { return Result.err({ code: "no_distribution", message: "the distribution is empty" }); }
    return Result.ok({ S: Float64Array.from(S), w: Float64Array.from(w.map(x => x / total)) });
  }
  // a ticker's past moves over the position's horizon, applied to today's price: every overlapping window of daily
  // closes (oldest first) as long as the horizon in trading days, each weighed the same
  /** @param {{ S0: number, closes: number[], days: number }} input @returns {LabResult} */
  function fromCloses({ S0, closes, days }) {
    const clean = (closes || []).filter(x => Number.isFinite(x) && x > 0);
    const steps = Math.max(1, Math.round(days * CAPTURE_CONFIG.tradingDaysPerYear / 365)), windows = clean.length - steps;
    if (windows < CAPTURE_CONFIG.minEmpiricalWindows) {
      return Result.err({ code: "too_few_closes", message: `needs at least ${CAPTURE_CONFIG.minEmpiricalWindows + steps} daily closes (${steps}-day windows); has ${clean.length}` });
    }
    const S = new Float64Array(windows), w = new Float64Array(windows).fill(1 / windows);
    for (let i = 0; i < windows; i++) { S[i] = S0 * clean[i + steps] / clean[i]; }
    return Result.ok({ S, w });
  }
  // closes typed or pasted as text, line by line: a line that is one number with a decimal comma ("21,42") is that
  // number; otherwise every number on the line (separated by commas, semicolons or spaces) counts, and anything else
  // (dates, headers) is skipped
  const DECIMAL_COMMA = /^\s*\d+,\d+\s*$/;
  function parseCloses(text) {
    return String(text || "").split(/\r?\n/).flatMap(line => DECIMAL_COMMA.test(line) ? [Number(line.trim().replace(",", "."))] : line.split(/[\s,;]+/).map(Number))
      .filter(x => Number.isFinite(x) && x > 0);
  }
  // what was understood from pasted closes: the count, the first and last, and the day-to-day jumps beyond ×1.5 or
  // ÷1.5 (a misread format shows up there)
  /** @param {number[]} closes */
  function checkCloses(closes) {
    let jumps = 0;
    for (let i = 1; i < closes.length; i++) { const r = closes[i] / closes[i - 1]; if (r > 1.5 || r < 1 / 1.5) { jumps++; } }
    return { count: closes.length, first: closes[0], last: closes[closes.length - 1], jumps };
  }

  // ---------------------------------------------------------- the readings of one scenario
  /** @typedef {{ mean: number, median: number, quantile: (p: number) => number, oddsAtLeast: (x: number) => number, curve: {x: number, odds: number}[] }} Measured */
  // capture of every outcome, sorted, with its weight; then the mean, any quantile and the odds of at least x
  /** @param {{ pnl: (S: number) => number, scenario: Scenario, maxPayoff: number }} input @returns {Measured} */
  function measure({ pnl, scenario, maxPayoff }) {
    const n = scenario.S.length, order = new Array(n), c = new Float64Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) { c[i] = pnl(scenario.S[i]) / maxPayoff; order[i] = i; mean += scenario.w[i] * c[i]; }
    order.sort((a, b) => c[a] - c[b]);
    const sorted = Float64Array.from(order, i => c[i]), cum = new Float64Array(n);
    let run = 0;
    order.forEach((i, k) => { run += scenario.w[i]; cum[k] = run; });
    const quantile = p => { const target = Math.min(1, Math.max(0, p)) * run; let k = 0; while (k < n - 1 && cum[k] < target) { k++; } return sorted[k]; };
    // the share of the weight at or above x (a capture equal to x counts: 100% is reachable)
    const oddsAtLeast = x => {
      let lo = 0, hi = n;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < x - 1e-12) { lo = mid + 1; } else { hi = mid; } }
      return lo === 0 ? 1 : 1 - cum[lo - 1] / run;
    };
    const curve = [];
    for (let k = 0; k < CAPTURE_CONFIG.curvePoints; k++) {
      const x = CAPTURE_CONFIG.curveLow + (CAPTURE_CONFIG.curveHigh - CAPTURE_CONFIG.curveLow) * k / (CAPTURE_CONFIG.curvePoints - 1);
      curve.push({ x, odds: oddsAtLeast(x) });
    }
    return { mean, median: quantile(0.5), quantile, oddsAtLeast, curve };
  }
  // the price band that keeps at least x of the maximum (where the expiry P&L is ≥ x · max), as [low, high] or null
  /** @param {{ payoff: (S: number) => number, maxPayoff: number, x: number, S0: number }} input */
  function findKeepBand({ payoff, maxPayoff, x, S0 }) {
    const target = x * maxPayoff, n = 4000, lo = Math.log(S0) - 3, hi = Math.log(S0) + 3;
    const priceAt = i => Math.exp(lo + (hi - lo) * i / n), keeps = S => payoff(S) >= target - 1e-12;
    let first = -1, last = -1;
    for (let i = 0; i <= n; i++) { if (keeps(priceAt(i))) { if (first < 0) { first = i; } last = i; } }
    if (first < 0) { return null; }
    // each edge to a hair by bisection between the last price outside and the first inside; an edge at the scan's end
    // is open (null): every lower (higher) price keeps x too
    const refine = (outside, inside) => { let a = outside, b = inside; for (let k = 0; k < 60; k++) { const m = Math.sqrt(a * b); if (keeps(m)) { b = m; } else { a = m; } } return b; };
    return [first > 0 ? refine(priceAt(first - 1), priceAt(first)) : null, last < n ? refine(priceAt(last + 1), priceAt(last)) : null];
  }

  // ---------------------------------------------------------- the time path: kept so far if the price stays put
  /** @param {{ value: (S: number, tau: number) => number, S0: number, years: number, days: number, maxPayoff: number, x: number }} input */
  function timePath({ value, S0, years, days, maxPayoff, x }) {
    const steps = CAPTURE_CONFIG.timePathSteps, curve = [];
    let dayToX = NaN;
    for (let k = 0; k <= steps; k++) {
      const share = k / steps, tau = years * (1 - share), kept = (k === steps ? value(S0, 0) : value(S0, tau)) / maxPayoff;
      curve.push({ day: share * days, kept });
      if (!Number.isFinite(dayToX) && kept >= x - 1e-9) { dayToX = share * days; }
    }
    const atHalf = value(S0, years / 2) / maxPayoff;
    return { curve, atHalf, dayToX, days };
  }

  // ---------------------------------------------------------- growth on a capital: the rate that compounds
  // the average log growth a cycle of a capital that carries the position (capitalPerShare of capital per share),
  // and the fixed capture that compounds to the same: (e^g − 1) · capital / max
  /** @param {{ pnl: (S: number) => number, scenario: Scenario, capitalPerShare: number, maxPayoff: number }} input */
  function growth({ pnl, scenario, capitalPerShare, maxPayoff }) {
    if (!(capitalPerShare > 0)) { return Result.err({ code: "no_capital", message: "no capital to grow" }); }
    let logMean = 0, ruin = 0, survivorLog = 0;
    for (let i = 0; i < scenario.S.length; i++) {
      const after = 1 + pnl(scenario.S[i]) / capitalPerShare;
      if (after <= CAPTURE_CONFIG.ruinFloor) { ruin += scenario.w[i]; } else { survivorLog += scenario.w[i] * Math.log(after); }
      logMean += scenario.w[i] * Math.log(Math.max(CAPTURE_CONFIG.ruinFloor, after));
    }
    // with any chance of a wipe-out the compounded result ends at zero sooner or later, and the log mean is set by the
    // floor: the growth of the cycles without one is reported apart (survivorPerCycle), the headline is not finite
    const perCycle = Math.exp(logMean) - 1, survivorPerCycle = ruin < 1 ? Math.exp(survivorLog / (1 - ruin)) - 1 : NaN;
    const isRuinous = ruin > CAPTURE_CONFIG.ruinShown;
    return Result.ok({ logMean, perCycle, ruin, isRuinous, survivorPerCycle, equivalentCapture: perCycle * capitalPerShare / maxPayoff, survivorCapture: survivorPerCycle * capitalPerShare / maxPayoff });
  }

  // ---------------------------------------------------------- a take-profit / stop rule on seeded daily paths
  // marks once per day on a log-price grid, read by interpolation; lognormal steps at `vol`, centred like lognormal():
  // on the mean (zero drift) or, with `mu`, on that log move over the life (the median on a path); closes at
  // +takeProfit · max or at −stopLoss · max, else settles at expiry. Antithetic pairs, and a control variate: held to
  // expiry has an exact mean on the same scenario, and the managed mean is corrected by the held sample's error
  /** @param {{ value: (S: number, tau: number) => number, payoff: (S: number) => number, S0: number, years: number, days: number, vol: number, maxPayoff: number, takeProfit: number, stopLoss: number, mu?: number, paths?: number, seed?: number }} input */
  function managed({ value, payoff, S0, years, days, vol, maxPayoff, takeProfit, stopLoss, mu, paths = CAPTURE_CONFIG.managedPaths, seed = CAPTURE_CONFIG.seed }) {
    const nDays = Math.max(1, Math.round(days));
    if (!(vol > 0) || !(maxPayoff > 0)) { return Result.err({ code: "not_available", message: "no vol or no maximum payoff" }); }
    const totalDrift = mu === undefined ? -0.5 * vol * vol * years : mu;
    const g = CAPTURE_CONFIG.managedGrid, half = CAPTURE_CONFIG.managedGridSpan * vol * Math.sqrt(years) + Math.abs(totalDrift), step = 2 * half / (g - 1);
    const rows = [];
    for (let d = 1; d <= nDays; d++) {
      const tau = years * (nDays - d) / nDays, row = new Float64Array(g);
      for (let i = 0; i < g; i++) { const S = S0 * Math.exp(-half + i * step); row[i] = d === nDays ? payoff(S) : value(S, tau); }
      rows.push(row);
    }
    const markAt = (d, x) => { const row = rows[d - 1], f = (x + half) / step; if (f <= 0) { return row[0]; } if (f >= g - 1) { return row[g - 1]; } const i = Math.floor(f), t = f - i; return row[i] * (1 - t) + row[i + 1] * t; };
    const normal = MANAGE.createNormals(seed), dt = years / nDays, drift = totalDrift / nDays, diffusion = vol * Math.sqrt(dt);
    const target = takeProfit > 0 ? takeProfit * maxPayoff : Infinity, floor = stopLoss > 0 ? -stopLoss * maxPayoff : -Infinity;
    const outcomes = new Float64Array(paths), held = new Float64Array(paths), shocks = new Float64Array(nDays);
    let tp = 0, stops = 0, daysHeld = 0;
    for (let p = 0; p < paths; p++) {
      const isMirror = p % 2 === 1;
      if (!isMirror) { for (let d = 0; d < nDays; d++) { shocks[d] = normal(); } }
      let x = 0, done = false;
      for (let d = 1; d <= nDays; d++) {
        x += drift + diffusion * (isMirror ? -shocks[d - 1] : shocks[d - 1]);
        if (done) { continue; }
        const pnl = markAt(d, x), isLast = d === nDays;
        if (!isLast && pnl >= target) { outcomes[p] = pnl; tp++; daysHeld += d; done = true; }
        else if (!isLast && pnl <= floor) { outcomes[p] = pnl; stops++; daysHeld += d; done = true; }
        else if (isLast) { outcomes[p] = pnl; daysHeld += d; done = true; }
      }
      held[p] = markAt(nDays, x);
    }
    const exactHeld = measure({ pnl: payoff, scenario: lognormal({ S0, vol, years, mu: mu === undefined ? undefined : mu }), maxPayoff }).mean * maxPayoff;
    const corrected = MANAGE.correctWithExactHold({ managed: Array.from(outcomes), held: Array.from(held), exactHeld });
    const scenario = { S: Float64Array.from(outcomes), w: new Float64Array(paths).fill(1 / paths) };
    const measured = measure({ pnl: v => v, scenario, maxPayoff });
    const meanDays = daysHeld / paths, mean = corrected.managedMean / maxPayoff;
    return Result.ok({ ...measured, mean, error: corrected.managedError / maxPayoff, takeProfitShare: tp / paths, stopShare: stops / paths, meanDays, perDay: mean / meanDays, days: nDays });
  }

  // ---------------------------------------------------------- a position from plain legs at one flat IV (Black–Scholes)
  // the Compounding tab's cycles: legs [{K, cp, qty}] per share (−1 short, +1 long), priced at `iv`; the credit is
  // what the short legs bring in less what the long legs cost
  /** @param {{ S0: number, days: number, iv: number, rate: number, legs: {K: number, cp: string, qty: number}[], price: (S: number, K: number, T: number, s: number, cp: string) => number }} input */
  function fromLegs({ S0, days, iv, rate, legs, price }) {
    const years = days / 365, live = legs.filter(l => l.K > 0 && l.qty !== 0);
    const intrinsic = (S, l) => l.cp === "C" ? Math.max(0, S - l.K) : Math.max(0, l.K - S);
    const credit = -live.reduce((t, l) => t + l.qty * price(S0, l.K, years, iv, l.cp), 0);
    const payoff = S => credit + live.reduce((t, l) => t + l.qty * intrinsic(S, l), 0);
    const value = (S, tau) => tau > 0 ? credit + live.reduce((t, l) => t + l.qty * price(S, l.K, tau, iv, l.cp), 0) : payoff(S);
    return { S0, years, days, credit, payoff, value, strikes: live.map(l => l.K), rate };
  }

  return Object.freeze({
    findMaxPayoff, lognormal, withGap, fromDistribution, fromCloses, parseCloses, checkCloses, measure, findKeepBand, timePath, growth, managed, fromLegs,
    Preset, VolSourceChoice, GapSide, Reading, Exit, CONFIG: CAPTURE_CONFIG
  });
})();
