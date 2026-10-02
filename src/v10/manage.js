// ============================================================ manage: take profit, stop, or hold to expiry (pure)
// A short-premium trade is rarely held blindly to expiry. This simulates one management rule on seeded daily price
// paths at the ticker's period vol (zero-drift lognormal, calendar days, as every EV reading): each day the position is
// marked with the model's own marks (the implied smile, the market's pricing) and closed when its P&L reaches the take
// profit (a share of the credit) or the stop (a loss of a multiple of the credit); otherwise it settles at expiry.
// The same paths held to expiry give the comparison. Marks are computed once per day on a log-price grid and read by
// interpolation along the paths. One namespace: MANAGE.
const MANAGE = (() => {
  const MANAGE_CONFIG = Object.freeze({
    paths: 12000,           // seeded paths per position (the mark grid, not the paths, is the cost)
    gridPoints: 241,        // marks per day on the log-price grid
    gridSpan: 7,            // the grid spans ±gridSpan of the period vol's σ√T
    seed: 20261001,
    worstShare: 0.05,       // "worst 5%": the mean of the worst share of outcomes
    memoSize: 200
  });
  const ExitKind = Object.freeze({ TakeProfit: "takeProfit", Stop: "stop", Expiry: "expiry" });
  const memo = new Map();

  // ---------------------------------------------------------- seeded standard normals (mulberry32 + Box–Muller)
  function createNormals(seed) {
    let state = seed >>> 0, spare = NaN;
    const uniform = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => {
      if (!Number.isNaN(spare)) { const z = spare; spare = NaN; return z; }
      const u = Math.max(uniform(), 1e-12), v = uniform(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
  }

  // ---------------------------------------------------------- the day-by-day marks on a log-price grid
  /** @param {{ built: any, vol: number, shock: any }} input */
  function createMarkGrid({ built, vol, shock }) {
    const days = Math.max(1, Math.round(built.dte)), half = MANAGE_CONFIG.gridSpan * vol * Math.sqrt(built.T);
    const n = MANAGE_CONFIG.gridPoints, step = 2 * half / (n - 1), lo = -half;
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const tau = Math.max(0, (days - d) / 365), row = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const price = built.S * Math.exp(lo + i * step);
        row[i] = d === days ? POS.payoff(built, price) : POS.val(built, price, tau, shock);
      }
      rows.push(row);
    }
    // the mark at day d (1-based) and log move x from entry, by linear interpolation (flat beyond the grid's ends)
    const markAt = (d, x) => {
      const row = rows[d - 1], f = (x - lo) / step;
      if (f <= 0) { return row[0]; }
      if (f >= n - 1) { return row[n - 1]; }
      const i = Math.floor(f), t = f - i;
      return row[i] * (1 - t) + row[i + 1] * t;
    };
    return { days, markAt };
  }

  // ---------------------------------------------------------- one rule on the paths
  /** @param {{ outcomes: number[], share: number }} input */
  function meanOfWorst({ outcomes, share }) {
    const sorted = outcomes.slice().sort((a, b) => a - b), k = Math.max(1, Math.floor(sorted.length * share));
    let sum = 0;
    for (let i = 0; i < k; i++) { sum += sorted[i]; }
    return sum / k;
  }
  // control variate: holding to expiry has an exact EV (closed form), and on the same paths the managed and held
  // outcomes move together; correcting the managed mean by the held sample's error (times their regression slope)
  // takes most of the Monte Carlo noise out of the comparison
  /** @param {{ managed: number[], held: number[], exactHeld: number }} input */
  function correctWithExactHold({ managed, held, exactHeld }) {
    const n = managed.length, mean = a => a.reduce((t, v) => t + v, 0) / n;
    const mm = mean(managed), mh = mean(held);
    let cov = 0, varHeld = 0;
    for (let i = 0; i < n; i++) { cov += (managed[i] - mm) * (held[i] - mh); varHeld += (held[i] - mh) * (held[i] - mh); }
    const slope = varHeld > 0 ? cov / varHeld : 0;
    const isExact = Number.isFinite(exactHeld);
    // the standard error of the corrected mean, over antithetic pairs (a pair is one independent draw)
    const pairs = Math.floor(n / 2);
    let residual = 0;
    for (let k = 0; k < pairs; k++) {
      const r = ((managed[2 * k] + managed[2 * k + 1]) / 2 - mm) - slope * ((held[2 * k] + held[2 * k + 1]) / 2 - mh);
      residual += r * r;
    }
    return { managedMean: isExact ? mm - slope * (mh - exactHeld) : mm, heldMean: isExact ? exactHeld : mh, managedError: Math.sqrt(residual / Math.max(1, pairs - 1) / Math.max(1, pairs)) };
  }
  /**
   * @param {{ built: any, vol: number, takeProfit: number, stopLoss: number, shock?: any, paths?: number, seed?: number }} input
   *   takeProfit: the share of the credit that closes it (0 = no take profit); stopLoss: the loss, in credits, that
   *   closes it (0 = no stop)
   * @returns {LabResult}
   */
  function simulate({ built, vol, takeProfit, stopLoss, shock, paths = MANAGE_CONFIG.paths, seed = MANAGE_CONFIG.seed }) {
    if (!built || built.na || !(built.T > 0)) { return Result.err({ code: "not_available", message: "the position is n/a" }); }
    if (!(built.cr > 0)) { return Result.err({ code: "net_debit", message: "a net debit has no credit to take a share of" }); }
    if (!(vol > 0)) { return Result.err({ code: "no_vol", message: "no period vol" }); }
    const key = `${built.key}|${vol}|${takeProfit}|${stopLoss}|${JSON.stringify(shock || {})}|${paths}|${seed}`;
    const cached = memo.get(key);
    if (cached) { return cached; }
    const grid = createMarkGrid({ built, vol, shock }), normal = createNormals(seed);
    const dt = 1 / 365, drift = -0.5 * vol * vol * dt, diffusion = vol * Math.sqrt(dt);
    const target = takeProfit > 0 ? takeProfit * built.cr : Infinity, floor = stopLoss > 0 ? -stopLoss * built.cr : -Infinity;
    const managed = new Array(paths), held = new Array(paths), counts = { [ExitKind.TakeProfit]: 0, [ExitKind.Stop]: 0, [ExitKind.Expiry]: 0 };
    let daysHeld = 0, takeProfitDays = 0, stopDays = 0;
    // antithetic pairs: every odd path is its even partner's mirror image (half the noise in the means, for free)
    const shocks = new Float64Array(grid.days);
    for (let p = 0; p < paths; p++) {
      const isMirror = p % 2 === 1;
      if (!isMirror) { for (let d = 0; d < grid.days; d++) { shocks[d] = normal(); } }
      let x = 0, exit = null;
      for (let d = 1; d <= grid.days; d++) {
        x += drift + diffusion * (isMirror ? -shocks[d - 1] : shocks[d - 1]);
        if (exit) { continue; }
        const pnl = grid.markAt(d, x), isLast = d === grid.days;
        if (!isLast && pnl >= target) { exit = { kind: ExitKind.TakeProfit, day: d, pnl }; }
        else if (!isLast && pnl <= floor) { exit = { kind: ExitKind.Stop, day: d, pnl }; }
        else if (isLast) { exit = { kind: ExitKind.Expiry, day: d, pnl }; }
      }
      held[p] = grid.markAt(grid.days, x);
      managed[p] = exit.pnl;
      counts[exit.kind]++;
      daysHeld += exit.day;
      if (exit.kind === ExitKind.TakeProfit) { takeProfitDays += exit.day; }
      if (exit.kind === ExitKind.Stop) { stopDays += exit.day; }
    }
    const meanDays = daysHeld / paths;
    const { managedMean, heldMean, managedError } = correctWithExactHold({ managed, held, exactHeld: RECOVERY.expectedPnl({ built, vol }) });
    const result = Result.ok(Object.freeze({
      paths, days: grid.days,
      takeProfit: Object.freeze({ share: counts[ExitKind.TakeProfit] / paths, meanDay: counts[ExitKind.TakeProfit] ? takeProfitDays / counts[ExitKind.TakeProfit] : NaN }),
      stop: Object.freeze({ share: counts[ExitKind.Stop] / paths, meanDay: counts[ExitKind.Stop] ? stopDays / counts[ExitKind.Stop] : NaN }),
      expiry: Object.freeze({ share: counts[ExitKind.Expiry] / paths }),
      meanDays, managedMean, heldMean, managedError,
      managedPerDay: managedMean / meanDays, heldPerDay: heldMean / grid.days,
      winRate: managed.filter(v => v > 0).length / paths, heldWinRate: held.filter(v => v > 0).length / paths,
      managedWorst: meanOfWorst({ outcomes: managed, share: MANAGE_CONFIG.worstShare }), heldWorst: meanOfWorst({ outcomes: held, share: MANAGE_CONFIG.worstShare })
    }));
    if (memo.size > MANAGE_CONFIG.memoSize) { memo.clear(); }
    memo.set(key, result);
    return result;
  }
  // the memoized result for these inputs, or null when it still has to be computed (the view computes after paint)
  /** @param {{ built: any, vol: number, takeProfit: number, stopLoss: number, shock?: any }} input */
  function peek({ built, vol, takeProfit, stopLoss, shock }) {
    if (!built || built.na) { return null; }
    return memo.get(`${built.key}|${vol}|${takeProfit}|${stopLoss}|${JSON.stringify(shock || {})}|${MANAGE_CONFIG.paths}|${MANAGE_CONFIG.seed}`) || null;
  }
  return Object.freeze({ simulate, peek, ExitKind, CONFIG: MANAGE_CONFIG });
})();
