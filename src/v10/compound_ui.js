// ============================================================ Compounding tab UI (own state, own controls; reads COMPOUND_ENGINE and D only)
const COMPOUND = ((COMPOUND_ENGINE, COMPOUND_STRESS) => {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs, parent) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const st_ = (parent, x, y, s, attrs = {}) => { const t = sv("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
  const MIN = "−";
  const clone = o => JSON.parse(JSON.stringify(o));
  const TKS = ["KORU", "RAM"];
  const spot = tk => D.u[tk].S;
  const firstExp = tk => Object.values(D.u[tk].exps)[0];
  const atmIV = tk => Math.round(firstExp(tk).atm * 100);
  // the listed vol through the one period-vol accessor (before the page's port is attached)
  const listedPct = tk => readPeriodVol({ record: D.u[tk] }).pct;
  const weeklyOK = tk => D.cal && D.cal[tk] ? !!D.cal[tk].weekly : tk === "KORU";
  const listedTxt = tk => D.cal && D.cal[tk] ? D.cal[tk].listed.slice(0, 8).map(d => { const s = String(d).replace(/-/g, ""); return `${+s.slice(6, 8)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+s.slice(4, 6) - 1]}${s.slice(0, 4) !== "2026" ? " " + s.slice(2, 4) : ""}`; }).join(", ") : "16 Oct, 20 Nov, 18 Dec, 19 Mar 27, Jan 28, Jan 29";
  // the pricing IV's reference buttons ([label, value (null: the first expiry's ATM)]); the moves' references are the
  // page's period-vol reference list (port.periodVol.refs), the one list the comparer's period-vol box shows
  const IV_REF = { KORU: [["weekly today", 121], ["monthly today", 130]], RAM: [["monthly today", null]] };

  // ---------------------------------------------------------- formats
  const f$ = v => !Number.isFinite(v) ? "–" : (v < 0 ? MIN : "") + "$" + (Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toFixed(2) + "B" : Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? (Math.abs(v) / 1e3).toFixed(1) + "k" : Math.round(Math.abs(v)).toLocaleString("en-US"));
  // a dollar axis: one scale for every tick ($k from $10,000, $M from $1M) and the decimals its step needs
  // a date tick near either end of the plot is anchored inward, so its text is never cut at the edge
  const tickAnchor = (x, left, right) => x > right - 26 ? "end" : x < left + 26 ? "start" : "middle";
  const axis$ = ticks => {
    const top = Math.max(...ticks.map(Math.abs)), step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : top, div = top >= 1e6 ? 1e6 : top >= 1e4 ? 1e3 : 1, unit = div === 1e6 ? "M" : div === 1e3 ? "k" : "";
    let d = 0; while (d < 2 && Math.abs(Math.round(step / div * 10 ** d) - step / div * 10 ** d) > 1e-6) d++;
    return t => +Math.abs(t / div).toFixed(d) === 0 ? "$0" : (t < 0 ? MIN : "") + "$" + Math.abs(t / div).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + unit;
  };
  const fPc = (v, d = 1) => !Number.isFinite(v) ? "–" : (v < 0 ? MIN : "") + Math.abs(v * 100).toFixed(d) + "%";
  const fPs = (v, d = 1) => !Number.isFinite(v) ? "–" : (v > 0 ? "+" : v < 0 ? MIN : "") + Math.abs(v * 100).toFixed(d) + "%";
  const fX = v => "×" + (v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const fKs = K => "$" + (+(+K).toFixed(2));
  const fInt = v => Math.round(v).toLocaleString("en-US");
  const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fD = d => `${d.getUTCDate()} ${MONS[d.getUTCMonth()]}${d.getUTCFullYear() !== 2026 ? " " + String(d.getUTCFullYear()).slice(2) : ""}`;

  // ---------------------------------------------------------- the period vol (v10 part 2c)
  // Every run's realized moves are the page's period vol of its ticker, read and written through the port: one number
  // per ticker, shared with Compare A vs B, which also shows and edits it. A run keeps its own moves only while B
  // differs in vol: that override belongs to a run (sc.volOverride = {run: "B", KORU: 150}; a ticker without one reads
  // the shared value), and a swap flips run, so the shared number never changes on a swap and each run keeps its vol.
  // The pricing IV (sc.iv; sc.ivB for B while B differs in vol) stays this tab's own.
  // the moves (the shared period vol, and a run's own moves while B differs in vol) keep the period vol's stored range,
  // PERIOD_VOL_CONFIG.range (0 = exactly on the path, where the comparer reads its 1% floor). The pricing IV's own range
  const YR_CONFIG = Object.freeze({ ivRange: Object.freeze([40, 250]) });

  // ---------------------------------------------------------- state
  const MODUS0 = { credit: "reinvest", call: "ibkr", target: 1.0, move: "keep" };
  const RUN0 = { tk: "KORU", cad: "wk", fam: "cc", cd: 30, pd: 20, puts: false, lev: 1.2, use: 0.5, wcd: 0, wpd: 0, modus: { ...MODUS0 } };
  const DEF = () => ({
    A: clone(RUN0),
    B: { ...clone(RUN0), fam: "str", cd: 20, pd: 20 },
    bOn: true, bDiff: "strategy",
    sc: { cap0: 30000, W: 52, path: { mode: "flat", end: 1.5, pts: [[26, 1.2], [52, 1.5]], g: 0.5, gUnit: "span", geo: false }, S0: { KORU: spot("KORU"), RAM: spot("RAM") },
      iv: { KORU: 130, RAM: atmIV("RAM") }, ivB: { KORU: 121, RAM: atmIV("RAM") }, volOverride: /** @type {Object<string, any>} */ ({ run: RunSlot.B }) },

    costs: { give: 0.25, comm: 0.65, commSh: 0.005, liq: 250, whole: true, grid: { KORU: 1, RAM: 1 }, mOvr: { KORU: 0.75, RAM: 0.5 } },
    rates: { tiered: true, bm: 4.0, loan: 5.5, cash: 3.5 },
    ivp: { mode: "flat", end: 0.85, pts: [[26, 0.92], [52, 0.85]], g: -15, gUnit: "span", rule: "gap" },
    view: { v: "weeks", reading: "typ", band: "both", exact: false, wiggle: true, pin: 1, gRun: "A", sweepRun: "A", creditView: "cum", tableRun: "A", dockOff: false },
    // Credit kept: the share x, the managed rule, the preset the NAV chart shows, the custom variant
    ck: { x: 50, tp: 50, sl: 200, show: "growth", src: "rv", vol: 100, gapP: 0, gapS: 30, gapSide: "down", read: "mean", pct: 25, details: false }
  });
  let ys = DEF();
  const FIELDS = { [RunDiff.Strategy]: ["fam", "cd", "pd", "puts", "lev", "use", "wcd", "wpd"], [RunDiff.Ticker]: ["tk"], [RunDiff.Cadence]: ["cad"], [RunDiff.Strikes]: ["cd", "pd", "wcd", "wpd"], [RunDiff.Size]: ["lev", "use"], [RunDiff.Modus]: ["modus"], [RunDiff.Vol]: [] };
  const BDIFF = [[RunDiff.Strategy, "Strategy"], [RunDiff.Ticker, "Ticker"], [RunDiff.Cadence, "Cadence"], [RunDiff.Strikes, "Strikes"]];
  const BDIFF2 = [[RunDiff.Size, "Size"], [RunDiff.Modus, "Modus"], [RunDiff.Vol, "Vol"], [RunDiff.Any, "Anything"]];
  function fixRun(r) { if (!weeklyOK(r.tk)) r.cad = "mo"; r.cd = Math.min(90, Math.max(3, r.cd)); r.pd = Math.min(90, Math.max(3, r.pd)); r.lev = Math.min(r.lev, 1 / ys.costs.mOvr[r.tk]); return r; }
  function runA() { return fixRun({ ...ys.A, modus: { ...MODUS0, ...ys.A.modus } }); }
  function runB() {
    if (!ys.bOn) return null;
    const A = ys.A; let b;
    if (ys.bDiff === "any") b = { ...ys.B };
    else { b = { ...A }; for (const f of FIELDS[ys.bDiff]) b[f] = ys.B[f]; }
    b.modus = { ...MODUS0, ...b.modus };
    return fixRun(b);
  }
  // when "B differs in" changes, make B actually differ in that dimension
  function setBDiff(v) {
    ys.bDiff = v; const A = ys.A, B = ys.B;
    if (v === "any") { for (const k of Object.keys(RUN0)) if (B[k] === undefined) B[k] = clone(A[k]); return; }
    for (const f of FIELDS[v]) if (JSON.stringify(B[f]) !== JSON.stringify(A[f])) return;
    if (v === "strategy") { B.fam = A.fam === "cc" ? "str" : "cc"; B.cd = B.fam === "str" ? 20 : 30; B.pd = 20; }
    if (v === "ticker") B.tk = A.tk === "KORU" ? "RAM" : "KORU";
    if (v === "cadence") B.cad = A.cad === "wk" ? "mo" : "wk";
    if (v === "strikes") { B.cd = Math.min(90, A.cd + 10); B.pd = Math.min(90, A.pd + 10); }
    if (v === "size") { B.lev = A.lev >= 1.1 ? 1.0 : 1.2; B.use = A.use >= 0.4 ? 0.3 : 0.5; }
    if (v === "modus") B.modus = { ...A.modus, credit: A.modus.credit === "reinvest" ? "rebal" : "reinvest" };
  }
  // the shared period vol of a ticker in % (the listed vol when the port has none)
  function readSharedVol(tk) {
    const pct = port.periodVol.read(tk);
    if (Number.isFinite(pct)) { return pct; }
    return listedPct(tk);
  }
  // a swap moves the runs between the slots. While B differs in vol, a run's own vols go with it, both of them: the
  // pricing IVs trade places (sc.iv is A's, sc.ivB is B's) and the moves override's run flips, so the shared period vol
  // never changes on a swap. Outside vol mode both own vols are dormant and stay with their slot, together, and wake
  // there when vol mode returns
  function flipOverrideRun() {
    const override = ys.sc.volOverride;
    override.run = override.run === RunSlot.A ? RunSlot.B : RunSlot.A;
  }
  function swapRuns() {
    if (!ys.bOn) { return; }
    const A = runA(), B = runB();
    ys.A = clone(B);
    ys.B = clone(A);
    if (ys.bDiff === RunDiff.Vol) {
      [ys.sc.iv, ys.sc.ivB] = [ys.sc.ivB, ys.sc.iv];
      flipOverrideRun();
    }
    dockSig = "";
    schedule(10);
  }
  // only while B differs in vol, and only the run slot the override names
  const carriesOverride = slot => ys.bDiff === RunDiff.Vol && ys.sc.volOverride.run === slot;
  // the moves a run slot reads, in %: its own while it carries the override (a ticker without one: the shared value)
  /** @param {{ tk: string, slot: string }} input */
  function readMovesPct({ tk, slot }) {
    const own = ys.sc.volOverride[tk];
    const hasOwn = carriesOverride(slot) && Number.isFinite(own);
    if (hasOwn) { return own; }
    return readSharedVol(tk);
  }
  // a run's own moves inside the stored range: {pct, note}; note says what moved, in the words of the period vol's toast
  function placeOwnMoves({ tk, slot, pct }) {
    const [lo, hi] = PERIOD_VOL_CONFIG.range, asked = +pct.toFixed(2), who = `${slot}'s own ${tk} moves`;
    if (pct < lo) { return { pct: lo, note: `${who} floored at ${lo}% (asked ${asked}%)` }; }
    if (pct > hi) { return { pct: hi, note: `${who} capped at ${hi}% (asked ${asked}%)` }; }
    return { pct: Math.round(pct), note: "" };
  }
  // an edit of a slot's moves: the run's own while it carries the override, else the shared period vol (the page runs
  // it as a command: floors, caps and their toast are the page's). A run's own moves outside the range toast the same way
  /** @param {{ tk: string, slot: string, pct: number, source?: string, expiry?: string }} edit */
  function writeMoves({ tk, slot, pct, source, expiry }) {
    if (!Number.isFinite(pct)) { return; }
    if (!carriesOverride(slot)) {
      port.periodVol.write({ ticker: tk, pct, source, expiry });
      return;
    }
    const placed = placeOwnMoves({ tk, slot, pct });
    ys.sc.volOverride[tk] = placed.pct;
    if (placed.note) { port.showNotice(placed.note); }
  }
  // the vols a run prices and moves at, as fractions: its pricing IV (B's own while B differs in vol) and its moves
  /** @param {{ run: any, slot: string }} input */
  function readRunVol({ run, slot }) {
    const hasOwnIv = ys.bDiff === RunDiff.Vol && slot === RunSlot.B;
    const iv = (hasOwnIv ? ys.sc.ivB : ys.sc.iv)[run.tk];
    return { iv: iv / 100, rv: readMovesPct({ tk: run.tk, slot }) / 100 };
  }
  function pathSpec() { const p = ys.sc.path, W = ys.sc.W;
    if (p.mode === "growth") { const g = p.gUnit === "span" ? Math.pow(1 + Math.max(0, p.g), 1 / Math.max(1, ys.sc.W)) - 1 : Math.max(0, p.g / 100); return { mode: "growth", g }; }
    if (p.mode === "line") return { mode: "line", end: Math.max(1, p.end), geo: p.geo };
    if (p.mode === "pts") return { mode: "pts", pts: p.pts.filter(x => x[0] > 0 && x[0] <= W), geo: p.geo };
    return { mode: "flat" }; }
  const mult = () => COMPOUND_ENGINE.pathMult(pathSpec(), ys.sc.W);
  // IV path: multiples of the IV input, may fall; realized moves keep their gap to IV, or stay constant
  function ivMult() { const p = ys.ivp, W = ys.sc.W;
    if (p.mode === "line") return COMPOUND_ENGINE.pathMult({ mode: "line", end: Math.max(0.2, p.end), geo: true }, W, false);
    if (p.mode === "growth") return COMPOUND_ENGINE.pathMult({ mode: "growth", g: Math.pow(1 + Math.max(-0.95, p.g / 100), 1 / Math.max(1, W)) - 1 }, W, false);
    if (p.mode === "pts") return COMPOUND_ENGINE.pathMult({ mode: "pts", pts: p.pts.filter(x => x[0] > 0 && x[0] <= W).sort((a, b) => a[0] - b[0]) }, W, false);
    return Array(W + 1).fill(1); }
  // the vols a run reads week by week (its flat vols on the IV path): what the Monte Carlo and the sweep keys hold
  /** @param {{ run: any, slot: string }} input */
  function readRunVolPath({ run, slot }) {
    const flat = readRunVol({ run, slot });
    return volArrays(flat.iv, flat.rv);
  }
  const volArrays = (iv, rv) => { const m = ivMult(); if (ys.ivp.mode === "flat") return { iv, rv }; return { iv: m.map(k => iv * k), rv: m.map(k => ys.ivp.rule === "gap" ? Math.max(0, rv + iv * (k - 1)) : rv) }; };
  // points: sort, merge duplicate weeks, enforce a path that never falls; returns notes
  function normPts() { const p = ys.sc.path, notes = {}; const by = new Map();
    for (const [w, m] of p.pts) { const ww = Math.round(w); if (!(ww >= 1)) continue; by.set(ww, Math.max(m, 0.01)); }
    const arr = [...by.entries()].sort((a, b) => a[0] - b[0]); let prev = 1;
    for (const a of arr) { if (a[1] < prev - 1e-9) { notes[a[0]] = `held at ${fKs(prev * ys.sc.S0[ys.A.tk])}: the path cannot fall`; a[1] = prev; } prev = a[1]; }
    p.pts = arr; return notes; }
  const costsOf = () => ({ ...COMPOUND_ENGINE.COSTS, ...ys.costs, hsPct: 0.07, hsMin: 0.025, hsSh: 0.005 });
  const ratesOf = () => ({ tiered: ys.rates.tiered, bm: ys.rates.bm / 100, loan: ys.rates.loan / 100, cash: ys.rates.cash / 100 });

  // ---------------------------------------------------------- compute (cached)
  const CACHE = new Map();
  // one run of the engine, memoized; the key holds the vols the run reads (the shared period vol included), so a vol
  // changed on Compare A vs B recomputes on this tab's next render
  /** @param {{ run: any, slot: string, extra?: any }} input */
  function runFor({ run, slot, extra = {} }) {
    const v0 = readRunVol({ run, slot }), m = mult(), v = volArrays(v0.iv, v0.rv);
    const sc = { cap0: ys.sc.cap0, W: ys.sc.W, S0: ys.sc.S0[run.tk], mult: m, iv: v.iv, rv: v.rv };
    const key = JSON.stringify([run, sc.cap0, sc.W, sc.S0, m, v, ys.costs, ys.rates, extra]);
    if (CACHE.has(key)) return CACHE.get(key);
    const out = COMPOUND_ENGINE.runHorizon(run, sc, costsOf(), ratesOf(), extra);
    if (CACHE.size > 160) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, out); return out;
  }
  /** @type {{ A: any, B?: any, ms?: number, mult?: any }} */
  let RES = null;
  function compute() {
    const A = runA(), B = runB();
    const t0 = performance.now();
    const exact = { literal: true };
    RES = { A: { run: A, vol: readRunVol({ run: A, slot: RunSlot.A }), main: runFor({ run: A, slot: RunSlot.A }), exact: runFor({ run: A, slot: RunSlot.A, extra: exact }) } };
    if (B) RES.B = { run: B, vol: readRunVol({ run: B, slot: RunSlot.B }), main: runFor({ run: B, slot: RunSlot.B }), exact: runFor({ run: B, slot: RunSlot.B, extra: exact }) };
    RES.ms = performance.now() - t0; RES.mult = mult();
    return RES;
  }

  // ---------------------------------------------------------- tiny binders (own registry, so the comparer never repaints)
  const SY = [];
  // where a binder registers its sync: SY for controls built once, the run dock's own list while the dock is being
  // (re)built, so a rebuilt dock drops the syncs of controls that no longer exist (a dropped B's editor)
  let syncTarget = SY;
  let T_ = 0;
  function schedule(ms = 140) { clearTimeout(T_); T_ = setTimeout(() => render("full"), ms); syncAll(); }
  function syncAll() { for (const f of SY) f(); }
  function segY(host, opts, get, set) {
    host.innerHTML = opts.map(([v, l, t, dis]) => `<button type="button" data-v="${v}"${t ? ` title="${t}"` : ""}${dis ? " disabled" : ""}>${l}</button>`).join("");
    host.onclick = e => { const b = e.target.closest("button"); if (!b || b.disabled) return; set(b.dataset.v); schedule(30); };
    const sync = () => host.querySelectorAll("button").forEach(b => { const on = b.dataset.v === String(get()); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    syncTarget.push(sync); sync();
  }
  function numY(inp, get, set, opt = {}) {
    inp.onchange = () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) set(opt.min != null ? Math.max(opt.min, opt.max != null ? Math.min(opt.max, v) : v) : v); schedule(30); };
    const sync = () => { if (document.activeElement !== inp) inp.value = get(); }; syncTarget.push(sync); sync();
  }
  function rangeY(inp, out, get, set, fmt) {
    inp.oninput = () => { set(+inp.value); out.textContent = fmt(get()); schedule(); };
    const sync = () => { if (document.activeElement !== inp) inp.value = get(); out.textContent = fmt(get()); }; syncTarget.push(sync); sync();
  }

  // ---------------------------------------------------------- sticky bar
  const { modus: modusTxt, name: runName } = COMPOUND_ENGINE.WORDS;
  // the chip's second line: strikes and size, plus any modus that differs; what differs from the other run is in stronger ink
  function runKeys(r, other) {
    const diff = [], same = [], add = (txt, isSame) => (other && !isSame ? diff : same).push(other && !isSame ? `<b>${txt}</b>` : txt);
    if (r.fam === "cc") {
      add(`${r.cd}Δ calls${r.puts ? `, ${r.pd}Δ puts` : ""}`, other && r.cd === other.cd && (!(r.puts || other.puts) || r.pd === other.pd) && !!r.puts === !!other.puts);
      add(`${r.lev.toFixed(2)}× leverage`, other && r.lev === other.lev);
    } else {
      add(`${r.pd}/${r.cd}Δ`, other && r.cd === other.cd && r.pd === other.pd);
      add(`${Math.round(r.use * 100)}% of margin`, other && r.use === other.use);
    }
    if (other && r.modus.credit !== other.modus.credit) add(COMPOUND_ENGINE.WORDS.credit(r.modus.credit), false);
    const callOf = m => m.call === "ibkr" ? "IBKR minimum on a call" : `back to ${(+m.target).toFixed(2)}× on a call`;
    if (other && callOf(r.modus) !== callOf(other.modus)) add(callOf(r.modus), false);
    if (other && r.modus.move !== other.modus.move) add(r.modus.move === "keep" ? "keeps trading" : "stops", false);
    return [...diff, ...same].join(" · "); // what tells the runs apart comes first, so a cut never hides it
  }
  const chipHtml = (who, r, other) => `<span class="key ${who.toLowerCase()}">${who}</span><span class="nm">${runName(r)}</span><span class="dif">${runKeys(r, other)}</span>`;
  function renderBar() {
    const A = runA(), B = runB();
    q("#y-chipA").innerHTML = chipHtml("A", A, B);
    q("#y-chipA").title = defTxt(A);
    const cb = q("#y-chipB");
    if (B) { cb.innerHTML = chipHtml("B", B, A); cb.title = defTxt(B); }
    else { cb.innerHTML = `<span class="nm muted">+ compare with a second run</span>`; cb.title = "Add run B to compare with A"; }
    q("#ybar").classList.toggle("single", !B);
    q("#y-bmore").classList.toggle("on", BDIFF2.some(([v]) => v === ys.bDiff));
    // vol group: one pair per ticker in use; B's pair in orange when B differs in vol
    const tks = [...new Set([A.tk, B && B.tk].filter(Boolean))], host = q("#y-vol");
    // redrawn when the tickers, the mode, the override's run or the reference list (ATM follows Compare's A horizon) change
    const sig = tks.join() + ys.bDiff + ys.sc.volOverride.run + JSON.stringify(tks.map(tk => port.periodVol.refs(tk)));
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig; SYV.length = 0;
      host.innerHTML = `<span class="lbl" title="The IV the options are priced at, then the realized moves of the price around your path">IV · realized</span>` + tks.map(tk => volHTML(tk, "")).join(" ") + (B && ys.bDiff === RunDiff.Vol ? volHTML(B.tk, "B") : "");
      for (const tk of tks) wireVol(tk, ""); if (B && ys.bDiff === RunDiff.Vol) wireVol(B.tk, "B");
    }
    for (const f of SYV) f();
    const w = [];
    if (A.tk === "RAM" || (B && B.tk === "RAM")) w.push(`RAM lists monthly options only, so its runs roll on third Fridays (a cycle every 4 or 5 weeks).`);
    const notes = ys.sc.path.mode === "pts" ? Object.values(lastPtsNotes) : [];
    if (notes.length) w.push(...notes.slice(0, 2));
    if (RES && RES.A.main.note) w.push("A: " + RES.A.main.note);
    q("#y-warn").hidden = !w.length; q("#y-warn").innerHTML = w.map(s => `<span class="w">${s}</span>`).join("");
    q("#y-readsum").innerHTML = `Outcome: <b>${ys.view.reading === "typ" ? "typical" : "average"}</b> ▾`;
  }
  const defTxt = r => `${COMPOUND_ENGINE.WORDS.def(r)} · ${modusTxt(r.modus)}`;
  const SYV = [];
  // what a pair's moves field edits: the shared period vol, or the run's own moves while it carries the override
  /** @param {{ tk: string, slot: string }} input */
  function describeMoves({ tk, slot }) {
    if (carriesOverride(slot)) { return { title: `${slot}'s own realized moves around your path, %, while B has its own vol (Compare A vs B keeps the ${tk} period vol)`, label: `Realized moves around your path, % (${slot}'s own, while B has its own vol)` }; }
    return { title: `${tk} period vol: realized moves around your path, %, shared with Compare A vs B; 0 = exactly on the path`, label: "Realized moves around your path, % (the period vol, shared with Compare A vs B)" };
  }
  // the pair's name on the bar: B's pair in B's colour; the pair that carries a run's own moves (B differs in vol) is
  // named with its run, in its colour, and tagged "own", so the bar always shows which field is the shared period vol
  /** @param {{ tk: string, slot: string, isBPair: boolean }} input */
  function nameVolPair({ tk, slot, isBPair }) {
    const isOwn = carriesOverride(slot), run = isBPair || isOwn ? `${slot} ` : "";
    const own = isOwn ? `<span class="own" title="${slot}'s own moves while B has its own vol; the other pair is the ${tk} period vol, shared with Compare A vs B">own</span>` : "";
    const colour = isBPair ? "b" : isOwn ? "a" : "";
    return `<span class="tk ${colour}">${run}${tk}${own}</span>`;
  }
  function volHTML(tk, who) {
    const id = `y-v-${tk}${who}`, [ivLo, ivHi] = YR_CONFIG.ivRange, [mLo, mHi] = PERIOD_VOL_CONFIG.range;
    const slot = who ? RunSlot.B : RunSlot.A, moves = describeMoves({ tk, slot });
    return `<span class="vv">${nameVolPair({ tk, slot, isBPair: !!who })}<input type="number" id="${id}-iv" min="${ivLo}" max="${ivHi}" step="1" title="Implied vol, %">/<input type="number" id="${id}-rv" min="${mLo}" max="${mHi}" step="1" title="${moves.title}"><details class="menu sl" id="${id}-m"><summary>▾</summary><span class="mb" style="width:330px" id="${id}-mb"></span></details></span>`;
  }
  // one ticker's pair (who "" = A's, or both runs' unless B differs in vol; "B" = B's): the pricing IV is this tab's
  // own, the moves go through readMovesPct / writeMoves (the shared period vol or the run's override)
  function wireVol(tk, who) {
    const id = `y-v-${tk}${who}`, slot = who ? RunSlot.B : RunSlot.A;
    // the pricing IV table this pair edits, looked up at each read and write: a reset or a loaded view replaces ys.sc
    // without redrawing the pair
    const readIvTable = () => (who ? ys.sc.ivB : ys.sc.iv);
    const [ivLo, ivHi] = YR_CONFIG.ivRange, [mLo, mHi] = PERIOD_VOL_CONFIG.range;
    // [label, shown value, source?, expiry?, value written?]: a preset of the period vol keeps its source (the listed vol,
    // ATM with its expiry) and writes the reference's own pct (ATM unrounded, as the comparer's ATM preset stores it)
    const ivRefs = IV_REF[tk].map(([l, v]) => [l, v ?? atmIV(tk)]);
    const rvRefs = port.periodVol.refs(tk).map(r => {
      const isPreset = r.source !== VolSource.Set;
      return [r.label, Math.round(r.pct), isPreset ? r.source : "", r.expiry || "", isPreset ? r.pct : Math.round(r.pct)];
    });
    const mb = q(`#${id}-mb`);
    const sl = (k, lo, hi, refs, lab) => `<span class="mrow"><span class="lbl">${lab}</span><input type="range" id="${id}-${k}s" min="${lo}" max="${hi}" step="1" list="${id}-${k}l" style="width:200px"> <output id="${id}-${k}o"></output>
      <datalist id="${id}-${k}l">${refs.map(r => `<option value="${r[1]}"></option>`).join("")}</datalist>
      <span class="cap" style="display:block">${refs.map(r => `<button type="button" class="btn" data-k="${k}" data-v="${r[4] ?? r[1]}"${r[2] ? ` data-src="${r[2]}"` : ""}${r[3] ? ` data-exp="${r[3]}"` : ""} style="padding:0 6px;margin:3px 4px 0 0">${r[0]} ${r[1]}</button>`).join("")}${k === "rv" ? `<button type="button" class="btn" data-k="rv" data-v="0" style="padding:0 6px;margin:3px 4px 0 0">exactly on the path 0</button>` : ""}</span></span>`;
    mb.innerHTML = `<span class="mt">${who ? "B: " : ""}${tk} implied vol and realized moves</span>` + sl("iv", ivLo, ivHi, ivRefs, "Implied vol, % (prices every option)") + sl("rv", mLo, mHi, rvRefs, describeMoves({ tk, slot }).label) +
      `<span class="cap">The gap between the two is the edge: premium is priced at IV, payouts are settled over moves at the realized number.</span>`;
    // write({pct, source?, expiry?}): a typed or dragged pct is a whole %; a preset (source named) writes its own pct
    const fields = {
      iv: {
        read: () => readIvTable()[tk],
        write: ({ pct }) => { readIvTable()[tk] = Math.max(ivLo, Math.min(ivHi, Math.round(pct))); }
      },
      rv: {
        read: () => readMovesPct({ tk, slot }),
        write: ({ pct, source, expiry }) => writeMoves({ tk, slot, pct: source ? pct : Math.round(pct), source, expiry })
      }
    };
    for (const k of ["iv", "rv"]) {
      const field = fields[k], inp = q(`#${id}-${k}`), s = q(`#${id}-${k}s`), o = q(`#${id}-${k}o`);
      const shown = () => Math.round(field.read());
      inp.onchange = () => {
        const pct = parseFloat(inp.value);
        if (Number.isFinite(pct)) { field.write({ pct }); }
        // the field shows what was applied, also while it keeps focus (a value floored, capped or rounded)
        inp.value = String(shown());
        schedule(30);
      };
      s.oninput = () => {
        field.write({ pct: +s.value });
        o.textContent = shown() + "%";
        if (document.activeElement !== inp) { inp.value = String(shown()); }
        schedule();
      };
      SYV.push(() => {
        if (document.activeElement !== inp) { inp.value = String(shown()); }
        if (document.activeElement !== s) { s.value = String(field.read()); }
        o.textContent = shown() + "%";
      });
    }
    mb.onclick = e => {
      const b = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest("button[data-k]"));
      if (!b) return;
      fields[b.dataset.k].write({ pct: +b.dataset.v, source: b.dataset.src, expiry: b.dataset.exp });
      schedule(30);
    };
  }

  function renderPathCtl() {
    const p = ys.sc.path, tk = ys.A.tk, S0 = ys.sc.S0[tk], host = q("#y-pnum");
    const sig = p.mode + p.gUnit + tk;
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      if (p.mode === "line") { host.innerHTML = ` ending at $<input type="number" id="y-pend" step="0.5" min="0" style="width:62px">`; }
      else if (p.mode === "growth") { host.innerHTML = ` <input type="number" id="y-pg" step="0.1" min="0" style="width:56px">% <select id="y-pgu"><option value="wk">per week</option><option value="span">over the weeks shown</option></select>`; }
      else host.innerHTML = ` <span class="vv" id="y-pinfo"></span>`;
      const e = q("#y-pend"); if (e) e.onchange = () => { let v = parseFloat(e.value) / ys.sc.S0[ys.A.tk]; if (!Number.isFinite(v)) return; if (v < 1) { port.showNotice("The path cannot fall: an end below the start becomes flat"); v = 1; } ys.sc.path.end = v; schedule(30); };
      const g = q("#y-pg"); if (g) g.onchange = () => { let v = parseFloat(g.value); if (!Number.isFinite(v)) return; if (v < 0) { port.showNotice("The path cannot fall: negative growth becomes 0"); v = 0; } ys.sc.path.g = ys.sc.path.gUnit === "span" ? v / 100 : v; schedule(30); };
      const gu = q("#y-pgu"); if (gu) gu.onchange = () => { const P = ys.sc.path; P.g = gu.value === "span" ? Math.pow(1 + P.g / 100, Math.max(1, ys.sc.W)) - 1 : (Math.pow(1 + P.g, 1 / Math.max(1, ys.sc.W)) - 1) * 100; P.gUnit = gu.value; host.dataset.sig = ""; schedule(30); };
    }
    const e = q("#y-pend"); if (e && document.activeElement !== e) e.value = (p.end * S0).toFixed(2);
    const g = q("#y-pg"); if (g && document.activeElement !== g) g.value = p.gUnit === "span" ? +(p.g * 100).toFixed(2) : +(+p.g).toFixed(3);
    const gu = q("#y-pgu"); if (gu) gu.value = p.gUnit;
    const inf = q("#y-pinfo"); if (inf) { const m = mult(); inf.textContent = p.mode === "flat" ? `at ${fKs(S0)}` : `${p.pts.length} point${p.pts.length === 1 ? "" : "s"}, ends ${fKs(m[m.length - 1] * S0)}`; }
    q("#y-pmode").value = p.mode;
    const mb = q("#y-pmb");
    if (!mb.dataset.built) {
      mb.dataset.built = 1;
      mb.innerHTML = `<span class="mt">Price path</span>
        <span class="mrow"><span class="lbl">Start price (week 0), A's ticker</span>$<input type="number" id="y-ps0" step="0.01" style="width:70px"> <button type="button" class="btn" id="y-ps0r">reset to spot</button></span>
        <span class="mrow"><span class="lbl">Between points</span><span class="seg" id="y-pgeo"></span></span>
        <span class="cap">One path for both runs, stored as a multiple of the start; with two tickers each moves by the same %. The path never falls: the app holds any lower point at the previous price and says so.</span>`;
      const s0 = q("#y-ps0"); s0.onchange = () => { const v = parseFloat(s0.value); if (v > 0) ys.sc.S0[ys.A.tk] = v; schedule(30); };
      q("#y-ps0r").onclick = () => { ys.sc.S0[ys.A.tk] = spot(ys.A.tk); schedule(30); };
      segY(q("#y-pgeo"), [["0", "same $ each week"], ["1", "same % each week"]], () => ys.sc.path.geo ? "1" : "0", v => { ys.sc.path.geo = v === "1"; });
    }
    const s0 = q("#y-ps0"); if (document.activeElement !== s0) s0.value = ys.sc.S0[ys.A.tk].toFixed(2);
  }

  // ---------------------------------------------------------- dock: run editors
  let dockSig = "";
  function renderDock() {
    const A = runA(), B = runB();
    const sig = JSON.stringify([A.tk, A.fam, A.cad, A.puts, !!A.wcd, !!A.wpd, ys.bOn, ys.bDiff, B && [B.tk, B.fam, B.cad, B.puts, !!B.wcd, !!B.wpd]]);
    if (sig !== dockSig) { dockSig = sig; buildDock(); }
    for (const f of SYD) f();
  }
  const SYD = [];
  function buildDock() {
    SYD.length = 0; syncTarget = SYD;
    try { buildDockControls(); } finally { syncTarget = SY; }
  }
  function buildDockControls() {
    const db = q("#y-db"), B = runB();
    db.innerHTML = `<span class="ds" id="y-dsA"><h3><span class="key a">A</span>Run A</h3><span id="y-edA"></span></span>
      <span class="ds" id="y-dsB"><h3><span class="key b">B</span>Run B${B ? "" : ` <span class="sub">off</span>`}</h3><span id="y-edB"></span></span>
      <span class="ds"><details class="sub" id="y-costs"><summary>Costs and rates <span class="sv" id="y-costsum"></span></summary><span class="sb" id="y-costb"></span></details></span>`;
    editor(q("#y-edA"), "A", ys.A, null);
    if (!B) q("#y-edB").innerHTML = `<button type="button" class="btn" id="y-addB">Add B</button>`, q("#y-addB").onclick = () => { ys.bOn = true; schedule(10); };
    else if (ys.bDiff === "any") editor(q("#y-edB"), "B", ys.B, null);
    else editor(q("#y-edB"), "B", ys.B, FIELDS[ys.bDiff]);
    costsEditor(q("#y-costb"));
  }
  function editor(host, who, R, only) {
    const show = f => !only || only.includes(f), id = s => `y-${who}-${s}`;
    const eff = () => who === "A" ? runA() : runB();
    let h = "";
    if (only) h += `<p class="bnote">Same as A, but ${{ strategy: "a different <b>strategy</b>", ticker: "on <b>another ticker</b>", cadence: "on <b>another cadence</b>", strikes: "with <b>other strikes</b>", size: "with <b>another size</b>", modus: "<b>run differently</b>", vol: "priced with <b>its own IV and moves</b> (set in the bar at the top)" }[ys.bDiff]}.</p>`;
    if (show("tk")) h += `<span class="row"><span class="lbl">Ticker</span><span class="seg eq" id="${id("tk")}"></span></span>`;
    if (show("cad")) h += `<span class="row"><span class="lbl">Cadence</span><span class="seg eq" id="${id("cad")}"></span></span><span class="why" id="${id("cadwhy")}" hidden></span>`;
    if (show("fam")) h += `<span class="row"><span class="lbl">Strategy</span><span class="seg eq" id="${id("fam")}"></span></span>`;
    if (show("cd")) h += `<span class="row sl"><span class="lbl">Call Δ</span><input type="range" min="3" max="90" step="1" id="${id("cd")}"><output id="${id("cdo")}"></output></span><span class="ro" id="${id("cdr")}"></span>`;
    if (show("pd") && (eff().fam === "str" || eff().puts)) h += `<span class="row sl"><span class="lbl">Put Δ</span><input type="range" min="3" max="90" step="1" id="${id("pd")}"><output id="${id("pdo")}"></output></span><span class="ro" id="${id("pdr")}"></span>`;
    if (show("lev") && eff().fam === "cc") h += `<span class="row sl"><span class="lbl">Leverage</span><input type="range" min="0.5" step="0.01" id="${id("lev")}"><output id="${id("levo")}"></output></span><span class="ro" id="${id("levr")}"></span>`;
    if (show("use") && eff().fam === "str") h += `<span class="row sl"><span class="lbl">Margin used</span><input type="range" min="0.1" max="1" step="0.05" id="${id("use")}"><output id="${id("useo")}"></output></span><span class="ro" id="${id("user")}"></span>`;
    if (show("puts") && eff().fam === "cc") h += `<details class="sub"><summary>More legs <span class="sv" id="${id("putsv")}"></span></summary><span class="sb"><label class="chk"><input type="checkbox" id="${id("puts")}">also sell puts (covered strangle)</label></span></details>`;
    if (show("wcd") && eff().fam === "str") h += `<details class="sub"><summary>Protection <span class="sv" id="${id("wsv")}"></span></summary><span class="sb">
      <span class="row sl"><span class="lbl">Call wing</span><input type="range" min="0" max="25" step="1" id="${id("wcd")}"><output id="${id("wcdo")}"></output></span>
      <span class="row sl"><span class="lbl">Put wing</span><input type="range" min="0" max="25" step="1" id="${id("wpd")}"><output id="${id("wpdo")}"></output></span><span class="cap">Δ of the long wing; 0 = none. A one-sided wing is margined as the naked side plus the width; check it with an IBKR what-if order.</span></span></details>`;
    if (show("modus")) h += `<details class="sub"><summary>Modus operandi <span class="sv" id="${id("msv")}"></span></summary><span class="sb">
      <span class="mrow" style="display:block;margin-bottom:8px"><span class="lbl" style="display:block">Credit after expiry</span><span class="seg" id="${id("mcr")}"></span></span>
      <span class="mrow" style="display:block;margin-bottom:8px"><span class="lbl" style="display:block">On a margin call</span><span class="seg" id="${id("mcall")}"></span> <span id="${id("mtg")}"><input type="number" id="${id("mtgt")}" min="0" max="2" step="0.05" style="width:52px">x</span></span>
      <span class="mrow" style="display:block"><span class="lbl" style="display:block">During a multi-week move (Stress view)</span><span class="seg" id="${id("mmove")}"></span></span>
      <span class="cap">How the account is run, separate from what is sold. The week-by-week engine, Stress and Random paths all read these rules.</span></span></details>`;
    host.innerHTML = h;
    const set = (f, v) => { R[f] = v; if (who === "A" && (f === "tk")) { fixRun(ys.A); } };
    const g = id;
    if (show("tk")) segY(q("#" + g("tk")), TKS.map(t => [t, t]), () => eff().tk, v => { set("tk", v); if (!weeklyOK(v)) R.cad = "mo"; });
    if (show("cad")) {
      segY(q("#" + g("cad")), [["wk", "Weekly", "", !weeklyOK(eff().tk)], ["mo", "Monthly"]], () => eff().cad, v => set("cad", v));
      SYD.push(() => { const w = q("#" + g("cadwhy")); if (!weeklyOK(eff().tk)) { w.hidden = false; w.textContent = `${eff().tk} lists monthly options only (third Fridays). As of ${D.cal ? D.cal[eff().tk].asOf : "1 Oct 2026"}: ${listedTxt(eff().tk)}.`; } else w.hidden = true; });
    }
    if (show("fam")) segY(q("#" + g("fam")), [["cc", "Covered calls"], ["str", "Strangle"]], () => eff().fam, v => { set("fam", v); if (v === "str" && R.cd > 40 && R.cd !== 50) R.cd = 20; });
    const dfmt = d => d === 50 ? "50 ATM" : d > 50 ? `${d} ITM` : `${d}Δ`;
    if (show("cd")) rangeY(q("#" + g("cd")), q("#" + g("cdo")), () => eff().cd, v => set("cd", v), dfmt);
    if (q("#" + g("pd"))) rangeY(q("#" + g("pd")), q("#" + g("pdo")), () => eff().pd, v => set("pd", v), dfmt);
    if (q("#" + g("lev"))) { const s = q("#" + g("lev")); s.max = (1 / ys.costs.mOvr[eff().tk]).toFixed(4); rangeY(s, q("#" + g("levo")), () => eff().lev, v => set("lev", v), v => `${(+v).toFixed(2)}x`); }
    if (q("#" + g("use"))) rangeY(q("#" + g("use")), q("#" + g("useo")), () => eff().use, v => set("use", v), v => `${Math.round(v * 100)}%`);
    if (q("#" + g("puts"))) { const c = q("#" + g("puts")); c.onchange = () => { R.puts = c.checked; schedule(30); }; SYD.push(() => { c.checked = !!eff().puts; q("#" + g("putsv")).textContent = eff().puts ? "puts" : ""; }); }
    if (q("#" + g("wcd"))) { const wf = v => v ? `${v}Δ` : "none"; rangeY(q("#" + g("wcd")), q("#" + g("wcdo")), () => eff().wcd, v => set("wcd", v), wf); rangeY(q("#" + g("wpd")), q("#" + g("wpdo")), () => eff().wpd, v => set("wpd", v), wf);
      SYD.push(() => { const r = eff(); q("#" + g("wsv")).textContent = r.wcd || r.wpd ? `${r.wpd ? r.wpd + "Δ put" : ""}${r.wpd && r.wcd ? " / " : ""}${r.wcd ? r.wcd + "Δ call" : ""}` : "none"; }); }
    if (show("modus")) {
      const M = () => { if (!R.modus) R.modus = { ...MODUS0 }; return R.modus; };
      segY(q("#" + g("mcr")), [["reinvest", "Reinvest", "Covered calls: the kept credit × leverage buys KORU. Strangles: the next cycle is sized from the grown NAV."], ["rebal", "Rebalance", "Shares go back to target leverage × NAV at each expiry"], ["cash", "Keep as cash", "Baseline: shares stay at the starting count; strangles sized from the starting capital"]], () => eff().modus.credit, v => { M().credit = v; });
      segY(q("#" + g("mcall")), [["ibkr", "Only what IBKR requires", "Sell the smallest amount that restores the requirement; the account then rides the limit"], ["target", "Back to"]], () => eff().modus.call, v => { M().call = v; });
      numY(q("#" + g("mtgt")), () => eff().modus.target, v => { M().target = v; }, { min: 0, max: 2 });
      segY(q("#" + g("mmove")), [["keep", "Keeps trading"], ["stop", "Stops at the first move"]], () => eff().modus.move, v => { M().move = v; });
      SYD.push(() => { q("#" + g("msv")).textContent = modusTxt(eff().modus); q("#" + g("mtg")).style.visibility = eff().modus.call === "target" ? "visible" : "hidden"; });
    }
    SYD.push(() => readouts(who));
  }
  function readouts(who) {
    const r = who === "A" ? runA() : runB(); if (!r) return;
    const id = s => q(`#y-${who}-${s}`);
    const S0 = ys.sc.S0[r.tk], v = readRunVol({ run: r, slot: who }), cy = COMPOUND_ENGINE.cycles(r.cad, ys.sc.W)[0], T = Math.round((cy.exp - cy.t0) / 864e5) / 365, g = ys.costs.grid[r.tk];
    // the run's definition only: the strike week 1 lands on; its real Δ, premium and the margin-call distances are
    // readings, in the Weeks view's week card and the Credit kept view
    const legTxt = (cp, d) => `${fKs(COMPOUND_ENGINE.pickStrike(S0, T, v.iv, cp, d, g))}${cp}`;
    if (id("cdr")) id("cdr").textContent = "Week 1: " + legTxt("C", r.cd);
    if (id("pdr")) id("pdr").textContent = "Week 1: " + legTxt("P", r.pd);
    const m = ys.costs.mOvr[r.tk];
    // only the limit of the input itself stays here: leverage at the broker's ceiling
    if (id("levr")) { const isCeiling = r.lev >= 1 / m - 1e-6; id("levr").textContent = isCeiling ? "at the ceiling: the first tick down is a margin call" : ""; id("levr").classList.toggle("warn", isCeiling); }
    if (id("user")) { id("user").textContent = ""; }
  }
  function costsEditor(host) {
    host.innerHTML = `<span class="row"><span class="lbl">Fill</span>give up <input type="number" id="y-cgive" min="0" max="1" step="0.05" style="width:50px"> of the half-spread</span>
      <span class="row"><span class="lbl">Per contract</span>$<input type="number" id="y-ccomm" min="0" step="0.05" style="width:50px"></span>
      <span class="row"><span class="lbl">Stock</span>$<input type="number" id="y-csh" min="0" step="0.001" style="width:56px"> a share</span>
      <span class="row"><span class="lbl">Liquidity</span>at most <input type="number" id="y-cliq" min="0" step="10" style="width:56px"> contracts (0 = none)</span>
      <span class="row"><label class="chk"><input type="checkbox" id="y-cwhole">whole shares and contracts</label></span>
      <span class="row"><span class="lbl">Strikes</span>KORU <span class="seg" id="y-cgK"></span> RAM <span class="seg" id="y-cgR"></span></span>
      <span class="cap" style="display:block;margin:-2px 0 8px">Every strike sits on a listed grid: $1 unless set to $0.50 here.</span>
      <span class="row"><span class="lbl">Margin</span>KORU <input type="number" id="y-cmK" min="0.25" max="1" step="0.05" style="width:50px"> RAM <input type="number" id="y-cmR" min="0.25" max="1" step="0.05" style="width:50px"></span>
      <span class="cap" style="display:block;margin:-2px 0 8px">Share requirement, initial = maintenance (IBKR: 25% × leverage factor). Raise it to test a house increase.</span>
      <span class="row"><span class="lbl">Rates</span><span class="seg" id="y-crt"></span> benchmark <input type="number" id="y-cbm" min="0" max="15" step="0.25" style="width:50px">%</span>
      <span class="row" id="y-cflat"><span class="lbl"></span>loan <input type="number" id="y-cloan" step="0.25" style="width:50px">% · cash <input type="number" id="y-ccash" step="0.25" style="width:50px">%</span>`;
    const CO = ys.costs, Rt = ys.rates;
    numY(q("#y-cgive"), () => CO.give, v => CO.give = v, { min: 0, max: 1 });
    numY(q("#y-ccomm"), () => CO.comm, v => CO.comm = v, { min: 0 });
    numY(q("#y-csh"), () => CO.commSh, v => CO.commSh = v, { min: 0 });
    numY(q("#y-cliq"), () => CO.liq, v => CO.liq = Math.round(v), { min: 0 });
    const w = q("#y-cwhole"); w.onchange = () => { CO.whole = w.checked; schedule(30); }; syncTarget.push(() => { w.checked = CO.whole; });
    segY(q("#y-cgK"), [["1", "$1"], ["0.5", "$0.50"]], () => String(CO.grid.KORU), v => CO.grid.KORU = +v);
    segY(q("#y-cgR"), [["1", "$1"], ["0.5", "$0.50"]], () => String(CO.grid.RAM), v => CO.grid.RAM = +v);
    numY(q("#y-cmK"), () => CO.mOvr.KORU, v => CO.mOvr.KORU = v, { min: 0.25, max: 1 });
    numY(q("#y-cmR"), () => CO.mOvr.RAM, v => CO.mOvr.RAM = v, { min: 0.25, max: 1 });
    segY(q("#y-crt"), [["1", "IBKR tiered"], ["0", "flat"]], () => Rt.tiered ? "1" : "0", v => Rt.tiered = v === "1");
    numY(q("#y-cbm"), () => Rt.bm, v => Rt.bm = v, { min: 0 });
    numY(q("#y-cloan"), () => Rt.loan, v => Rt.loan = v, { min: 0 });
    numY(q("#y-ccash"), () => Rt.cash, v => Rt.cash = v, { min: 0 });
    syncTarget.push(() => { q("#y-cflat").hidden = Rt.tiered; q("#y-costsum").textContent = `$${CO.comm}/contract · ${CO.grid.KORU === 1 && CO.grid.RAM === 1 ? "$1 strikes" : "$0.50 strikes on " + TKS.filter(t => CO.grid[t] === 0.5).join(", ")} · ${Rt.tiered ? "tiered " + Rt.bm + "%" : "flat"}`; });
  }

  // ---------------------------------------------------------- result strip
  // margin-call odds are said loudly from 10% (notable) and 25% (high), with the size that keeps them at 10% or less:
  // read off the leverage (covered calls) or margin-used (strangle) sweep once it has run for that run
  const CALL_BANDS = Object.freeze({ note: 0.10, high: 0.25 });
  const callTone = p => p >= CALL_BANDS.high ? "risk-high" : p >= CALL_BANDS.note ? "risk-note" : "";
  // the size that keeps the margin-call odds at 10% or less, found for each run that needs one (not just the run the
  // sweep chart shows): the run's own policy over the sweep's sizes up to the first that breaks 10%, then one step
  // between the last size that keeps it and that one; sliced so the page stays live; cached per run and inputs
  /** @type {{ key: Object<string, string>, result: Object<string, any>, job: Object<string, number> }} */
  const SAFE = { key: {}, result: {}, job: {} };
  const safeKey = who => JSON.stringify([who, RES[who].run, ys.sc, ys.costs, ys.rates, readRunVolPath({ run: RES[who].run, slot: who })]);
  /** @param {string} who */
  function readSafeSizeSpec(who) {
    const run = RES[who].run;
    if (run.fam === "cc") { const top = 1 / ys.costs.mOvr[run.tk]; return { kind: "lev", xs: [...new Set([0.5, 0.75, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, top].filter(x => x <= top + 1e-9).map(x => +x.toFixed(4)))].sort((a, b) => a - b) }; }
    return { kind: "use", xs: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] };
  }
  // the search itself, one size at a time (a yield after each run, so the caller can slice it): the sizes up to the
  // first that breaks 10%, then one step between the last size that keeps it and that one
  /** @param {string} kind @param {number[]} xs @param {(x: number) => number} calledAt */
  function* searchSafeSize(kind, xs, calledAt) {
    const points = [];
    for (const x of xs) { const called = calledAt(x); points.push({ x, called }); yield; if (called > CALL_BANDS.note) { break; } }
    let safe = null, over = null;
    for (const p of points) { if (p.called <= CALL_BANDS.note) { safe = p; } else { over = p; break; } }
    if (safe && over) { const mid = +((safe.x + over.x) / 2).toFixed(2), called = calledAt(mid); if (called <= CALL_BANDS.note) { safe = { x: mid, called }; } }
    return { kind, safe, first: points[0] };
  }
  /** @param {string} who @param {{ sync?: boolean }} [options] sync: run to the end now (the export), else sliced */
  function findSafeSize(who, { sync = false } = {}) {
    const key = safeKey(who);
    if (SAFE.key[who] === key && (SAFE.result[who] || !sync)) { return; }
    SAFE.key[who] = key; SAFE.result[who] = null;
    const job = (SAFE.job[who] || 0) + 1; SAFE.job[who] = job;
    const { kind, xs } = readSafeSizeSpec(who), base = RES[who].run;
    const calledAt = x => runFor({ run: kind === "lev" ? { ...base, lev: x } : { ...base, use: x }, slot: who }).end.called;
    const search = searchSafeSize(kind, xs, calledAt);
    const finish = result => { SAFE.result[who] = result; refreshCallSafeSize(); };
    if (sync) { let n = search.next(); while (!n.done) { n = search.next(); } finish(n.value); return; }
    const step = () => {
      if (SAFE.job[who] !== job) { return; }
      const t0 = performance.now();
      let n = search.next();
      while (!n.done) { if (performance.now() - t0 >= 25) { setTimeout(step, 0); return; } n = search.next(); }
      finish(n.value);
    };
    setTimeout(step, 30);
  }
  /** @param {string} who @param {{ sync?: boolean }} [options] */
  function describeCallSafeSize(who, { sync = false } = {}) {
    if (sync) { findSafeSize(who, { sync: true }); }
    const res = SAFE.key[who] === safeKey(who) ? SAFE.result[who] : null;
    if (!res) { findSafeSize(who); return "finding the size that keeps the odds at 10% or less…"; }
    const sizeTxt = x => res.kind === "lev" ? `${x.toFixed(2)}× leverage` : `${Math.round(x * 100)}% of margin used`;
    const oddsTxt = p => fPc(p, p > 0 && p < 0.01 ? 1 : 0);
    if (!res.safe) { return `no size tried keeps the odds at 10% or less: ${oddsTxt(res.first.called)} even at ${sizeTxt(res.first.x)}`; }
    return `odds at 10% or less: ${sizeTxt(res.safe.x)} or lower (${oddsTxt(res.safe.called)} there)`;
  }
  function renderStrip(live) {
    const host = q("#y-strip"); host.classList.toggle("live", !!live);
    const rows = [["A", RES.A], RES.B ? ["B", RES.B] : null].filter(Boolean);
    host.innerHTML = rows.map(([who, R]) => {
      const z = R.main.end, ex = R.exact.end, cap0 = ys.sc.cap0, cc = R.run.fam === "cc";
      const big = ys.view.reading === "typ" ? z.med : z.avg;
      const callTxt = z.called > 0.0005 ? `${fPc(z.called, 0)}<small>${cc ? "on drops" : "either way"}</small>` : "none";
      const label = (text, id, title, body) => KNOBS.label(text, { id: `yr-${id}`, title, body });
      return `<span class="sr"><span class="key ${who.toLowerCase()}">${who}</span>
        <span class="cell big"><span class="l">${label(`${ys.view.reading === "typ" ? "Typical" : "Average"} NAV, week ${ys.sc.W}`, "nav", "Typical and average NAV", "Typical: the median outcome at the last week, half the outcomes end above it. Average: the mean, pulled up by the best outcomes. ×n is the multiple of the starting capital. Outcomes spread from the realized moves around your price path, at the realized vol.")}</span><span class="v">${f$(big)}<small>${fX(big / cap0)}</small></span></span>
        <span class="cell c2"><span class="l">${label(`10%–90%`, "band", "The 10%–90% band", "One outcome in ten ends below the first number and one in ten above the second: the range a plan should survive, not the worst case.")}</span><span class="v" style="font-size:14px">${f$(z.c10)} – ${f$(z.c90)}</span></span>
        <span class="cell c3"><span class="l">${label(`Margin call within ${ys.sc.W} wk`, "call", "Margin call odds", "The share of outcomes with at least one margin call by the last week. On drops: the calls come from falls (covered calls hold the shares on margin). Either way: from falls or rallies (a strangle is short both sides). What the account does then follows the run's modus operandi: IBKR's own liquidation to the minimum, or back to the target leverage.")}</span><span class="v ${callTone(z.called)}" style="font-size:14px">${callTxt}</span>${callTone(z.called) ? `<span class="rk" data-safe="${who}">${describeCallSafeSize(who)}</span>` : ""}</span>
        <span class="cell c4"><span class="l">${label(`${cc ? "Shares · lots (typical)" : "Contracts (typical)"}`, "size", "Size at the end", "What the typical account carries at the last week: shares and 100-share lots for covered calls, contracts for a strangle. It grows as credit is reinvested.")}</span><span class="v" style="font-size:14px">${cc ? `${fInt(z.shMed)} · ${Math.min(z.lots, ys.costs.liq || 1e9)}` : Math.floor(z.kMed + 1e-9)}</span></span>
        <span class="cell sm"><span class="l">${label(`${ys.view.reading === "typ" ? "Average" : "Typical"} · exactly on the path`, "path", "Exactly on the path", "The NAV if the price followed your path exactly, with no realized moves around it: every credit kept, no assignment from noise. An upper reference, not a forecast.")}</span><span class="v">${f$(ys.view.reading === "typ" ? z.avg : z.med)} · ${f$(ex.med)}</span></span>
        <span class="bd">${defTxt(R.run)}</span></span>`;
    }).join("");
  }

  // ---------------------------------------------------------- stacked charts (one x geometry)
  let GEO = null, lastPtsNotes = {};
  function geo() {
    const host = q("#y-stack"), W = ys.sc.W, pts = ys.sc.path.mode === "pts";
    const width = Math.max(600, host.clientWidth), l = 62, r = (pts ? 236 : 0) + 104, pw = width - l - r;
    return { width, l, r, pw, W, x: w => l + w / W * pw, w: x => Math.round(Math.min(W, Math.max(0, (x - l) / pw * W))) };
  }
  function yLin(lo, hi, top, h) { return v => top + (hi - v) / (hi - lo) * h; }
  function niceTicks(lo, hi, n) { const span = hi - lo, step0 = span / n, p = Math.pow(10, Math.floor(Math.log10(step0))), s = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= step0) || 10 * p; const out = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10)); return out; }
  function logTicks(lo, hi) { const out = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const k of [1, 2, 5]) { const v = k * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); } return out; }
  function renderStack() {
    const host = q("#y-stack"); host.innerHTML = ""; GEO = geo(); const G = GEO, W = ys.sc.W;
    const runs = [["a", RES.A], RES.B ? ["b", RES.B] : null].filter(Boolean), m = RES.mult, tkA = RES.A.run.tk;
    const twoTk = RES.B && RES.B.run.tk !== tkA, unitMult = twoTk;
    q("#y-stackh").textContent = `Over ${ys.sc.W} weeks`;
    q("#y-stacksub").textContent = `${fD(COMPOUND_ENGINE.START)} → ${fD(COMPOUND_ENGINE.weekDate(W))} · ${twoTk ? "price as a multiple of the start (each run's own strikes)" : tkA + " price"} · NAV on a log scale`;
    // ---- price
    const hd1 = document.createElement("span"); hd1.className = "yhd"; hd1.innerHTML = `Price path and strikes<span class="cap">${ys.view.wiggle ? "grey band: one realized move either side at each expiry" : ""}</span>`; host.appendChild(hd1);
    const H1 = 170, s1 = sv("svg", { width: G.width, height: H1 + 22, viewBox: `0 0 ${G.width} ${H1 + 22}` }, host);
    const pv = w => unitMult ? m[w] : m[w] * ys.sc.S0[tkA];
    let lo = Infinity, hi = -Infinity;
    for (let w = 0; w <= W; w++) { lo = Math.min(lo, pv(w)); hi = Math.max(hi, pv(w)); }
    for (const [, R] of runs) for (const r of R.main.rows) for (const K of [r.Kc, r.Kp]) if (K) { const k = unitMult ? K / ys.sc.S0[R.run.tk] : K; lo = Math.min(lo, k); hi = Math.max(hi, k); }
    if (ys.view.wiggle) for (const r of RES.A.main.rows) { const k = unitMult ? 1 / ys.sc.S0[tkA] : 1; lo = Math.min(lo, r.S1 * Math.exp(-r.sigma) * k); hi = Math.max(hi, r.S1 * Math.exp(r.sigma) * k); }
    const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad; const Y1 = yLin(lo, hi, 6, H1 - 6);
    const ax1 = sv("g", { class: "yax" }, s1);
    for (const t of niceTicks(lo, hi, 4)) { sv("line", { x1: G.l, x2: G.l + G.pw, y1: Y1(t), y2: Y1(t) }, ax1); st_(ax1, G.l - 6, Y1(t) + 3.5, unitMult ? "×" + (+t.toFixed(2)) : "$" + (+t.toFixed(2)), { "text-anchor": "end" }); }
    for (const w of weekTicks(W, G.pw)) st_(ax1, G.x(w), H1 + 14, fD(COMPOUND_ENGINE.weekDate(w)), { "text-anchor": tickAnchor(G.x(w), G.l, G.l + G.pw) });
    if (ys.view.wiggle) { const rs = RES.A.main.rows, k = unitMult ? 1 / ys.sc.S0[tkA] : 1; let d = `M${G.x(0)},${Y1(pv(0))}`; for (const r of rs) d += `L${G.x(r.w1)},${Y1(r.S1 * Math.exp(r.sigma) * k)}`; for (let i = rs.length - 1; i >= 0; i--) d += `L${G.x(rs[i].w1)},${Y1(rs[i].S1 * Math.exp(-rs[i].sigma) * k)}`; d += `L${G.x(0)},${Y1(pv(0))}Z`; sv("path", { d, fill: "var(--ink-3)", opacity: 0.12 }, s1); }
    for (const [cls, R] of runs) { const k = unitMult ? 1 / ys.sc.S0[R.run.tk] : 1;
      for (const r of R.main.rows) {
        if (r.Kc) sv("line", { x1: G.x(r.w0), x2: G.x(r.w1), y1: Y1(r.Kc * k), y2: Y1(r.Kc * k), stroke: `var(--${cls})`, "stroke-width": 2 }, s1);
        if (r.Kp) sv("line", { x1: G.x(r.w0), x2: G.x(r.w1), y1: Y1(r.Kp * k), y2: Y1(r.Kp * k), stroke: `var(--${cls})`, "stroke-width": 2, "stroke-dasharray": "4 3" }, s1);
        if (r.Kc && r.S1 > r.Kc) sv("circle", { cx: G.x(r.w1), cy: Y1(r.S1 * k), r: 2.6, fill: "var(--neg)" }, s1);
      } }
    let pd = ""; for (let w = 0; w <= W; w++) pd += (w ? "L" : "M") + G.x(w) + "," + Y1(pv(w)); sv("path", { d: pd, fill: "none", stroke: "var(--ink)", "stroke-width": 1.6, id: "y-pathline" }, s1);
    if (ys.sc.path.mode === "pts") ptsEditor(s1, Y1, lo, hi, unitMult);
    // ---- IV path strip
    const hdv = document.createElement("span"); hdv.className = "yhd"; hdv.innerHTML = `IV path <select id="y-ivpm"><option value="flat">Flat</option><option value="line">Line</option><option value="pts">Points</option><option value="growth">Growth</option></select> <span id="y-ivpn"></span> <span class="seg" id="y-ivpr" style="margin-left:8px"></span><span class="cap" id="y-ivpc"></span>`; host.appendChild(hdv);
    ivPathCtl();
    if (ys.ivp.mode !== "flat") { const Hv = 80, sV = sv("svg", { width: G.width, height: Hv + 6, viewBox: `0 0 ${G.width} ${Hv + 6}` }, host), tks = [...new Set(runs.map(([, R]) => R.run.tk))], im = ivMult();
      let vlo = Infinity, vhi = -Infinity; const serV = []; for (const [cls, R] of runs) { const v0 = readRunVol({ run: R.run, slot: cls === "b" ? RunSlot.B : RunSlot.A }), va = volArrays(v0.iv, v0.rv); serV.push([cls, va]); for (let w = 0; w <= W; w++) { const a = Array.isArray(va.iv) ? va.iv[w] : va.iv, b = Array.isArray(va.rv) ? va.rv[w] : va.rv; vlo = Math.min(vlo, a, b); vhi = Math.max(vhi, a, b); } }
      vlo = Math.max(0, vlo - 0.05); vhi += 0.05; const YV = yLin(vlo, vhi, 4, Hv - 4), axv = sv("g", { class: "yax" }, sV);
      for (const t of niceTicks(vlo, vhi, 2)) { sv("line", { x1: G.l, x2: G.l + G.pw, y1: YV(t), y2: YV(t) }, axv); st_(axv, G.l - 6, YV(t) + 3.5, Math.round(t * 100) + "%", { "text-anchor": "end" }); }
      for (const [cls, va] of serV) { for (const [k, dash, wdt] of [["iv", "", 1.8], ["rv", "4 3", 1.1]]) { let d = ""; for (let w = 0; w <= W; w++) d += (w ? "L" : "M") + G.x(w) + "," + YV(Array.isArray(va[k]) ? va[k][w] : va[k]); sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": wdt, "stroke-dasharray": dash, opacity: cls === "b" && tks.length === 1 && ys.bDiff !== "vol" ? 0 : 1 }, sV); } }
      st_(sV, G.l + G.pw + 5, YV(Array.isArray(serV[0][1].iv) ? serV[0][1].iv[W] : serV[0][1].iv) + 4, "IV", { fill: "var(--ink-2)", "font-size": 10.5 }); st_(sV, G.l + G.pw + 5, YV(Array.isArray(serV[0][1].rv) ? serV[0][1].rv[W] : serV[0][1].rv) + 4, "moves", { fill: "var(--ink-3)", "font-size": 10.5 }); }
    // ---- NAV
    const hd2 = document.createElement("span"); hd2.className = "yhd"; hd2.innerHTML = `NAV<span class="cap">${ys.view.reading === "typ" ? "typical (median)" : "average"} line${ys.view.band !== "off" ? ", band = 10%–90% of outcomes" : ""}${ys.view.exact ? ", dashed = exactly on the path" : ""}; grey = ${tkA} held with no loan</span>`; host.appendChild(hd2);
    const H2 = 300, s2 = sv("svg", { width: G.width, height: H2 + 8, viewBox: `0 0 ${G.width} ${H2 + 8}` }, host);
    const cap0 = ys.sc.cap0; let nlo = cap0, nhi = cap0;
    const tr = (R, k) => [cap0, ...R.main.rows.map(r => r[k])];
    const xs = R => [0, ...R.main.rows.map(r => Math.min(r.w1, W))];
    for (const [cls, R] of runs) { const showBand = ys.view.band === "both" || ys.view.band === cls; for (const k of [ys.view.reading === "typ" ? "med" : "avg", ...(showBand ? ["c10", "c90"] : [])]) for (const v of tr(R, k)) { nlo = Math.min(nlo, v); nhi = Math.max(nhi, v); }
      if (ys.view.exact) for (const v of tr({ main: R.exact }, "med")) { nlo = Math.min(nlo, v); nhi = Math.max(nhi, v); } }
    for (let w = 0; w <= W; w++) { nlo = Math.min(nlo, cap0 * m[w]); nhi = Math.max(nhi, cap0 * m[w]); }
    nlo *= 0.9; nhi *= 1.1; const Y2 = v => 6 + (Math.log(nhi) - Math.log(Math.max(v, 1))) / (Math.log(nhi) - Math.log(nlo)) * (H2 - 12);
    const ax2 = sv("g", { class: "yax" }, s2);
    for (const t of logTicks(nlo, nhi)) { sv("line", { x1: G.l, x2: G.l + G.pw, y1: Y2(t), y2: Y2(t) }, ax2); st_(ax2, G.l - 6, Y2(t) + 3.5, f$(t), { "text-anchor": "end" }); }
    sv("line", { x1: G.l, x2: G.l + G.pw, y1: Y2(cap0), y2: Y2(cap0), stroke: "var(--ink-3)", "stroke-dasharray": "2 3" }, s2);
    let bd = ""; for (let w = 0; w <= W; w++) bd += (w ? "L" : "M") + G.x(w) + "," + Y2(cap0 * m[w]); sv("path", { d: bd, fill: "none", stroke: "var(--ink-3)", "stroke-width": 1.2 }, s2);
    const ends = [];
    for (const [cls, R] of runs) {
      const X = xs(R), showBand = ys.view.band === "both" || ys.view.band === cls;
      if (showBand) { const a = tr(R, "c90"), b = tr(R, "c10"); let d = ""; X.forEach((w, i) => d += (i ? "L" : "M") + G.x(w) + "," + Y2(a[i])); for (let i = X.length - 1; i >= 0; i--) d += "L" + G.x(X[i]) + "," + Y2(b[i]); sv("path", { d: d + "Z", fill: `var(--${cls})`, opacity: 0.1 }, s2); }
      if (ys.view.exact) { const e = tr({ main: R.exact }, "med"); let d = ""; X.forEach((w, i) => d += (i ? "L" : "M") + G.x(w) + "," + Y2(e[i])); sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": 1.2, "stroke-dasharray": "5 4" }, s2); }
      const t = tr(R, ys.view.reading === "typ" ? "med" : "avg"); let d = ""; X.forEach((w, i) => d += (i ? "L" : "M") + G.x(w) + "," + Y2(t[i]));
      sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": 2.2 }, s2);
      // margin-call odds marks: where this cycle adds ≥ 2 points of called outcomes
      ends.push([cls, Y2(t[t.length - 1]), `${cls.toUpperCase()} ${f$(t[t.length - 1])} ${fX(t[t.length - 1] / cap0)}`]);
    }
    ends.sort((a, b) => a[1] - b[1]); for (let i = 1; i < ends.length; i++) if (ends[i][1] - ends[i - 1][1] < 13) ends[i][1] = ends[i - 1][1] + 13;
    for (const [cls, y, s] of ends) st_(s2, G.l + G.pw + 5, y + 4, s, { class: "yhalo", fill: `var(--${cls})`, "font-size": 11, "font-weight": 600 });
    // ---- shares / contracts
    const hd3 = document.createElement("span"); hd3.className = "yhd"; hd3.innerHTML = `Shares and contracts<span class="cap">typical account · left: contracts, right: shares (100 = 1 contract) · thin line = shares ÷ 100</span>`; host.appendChild(hd3);
    const H3 = 140, s3 = sv("svg", { width: G.width, height: H3 + 8, viewBox: `0 0 ${G.width} ${H3 + 8}` }, host);
    let kmax = 1; const ser = runs.map(([cls, R]) => { const cc = R.run.fam === "cc"; const rows = R.main.rows;
      const k = rows.map(r => cc ? Math.min(Math.floor((r === rows[0] ? r.n / 100 : rows[rows.indexOf(r) - 1].shMed / 100) + 1e-9), ys.costs.liq || 1e9) : Math.floor(r === rows[0] ? r.k : rows[rows.indexOf(r) - 1].kMed));
      const sh = cc ? [rows[0].n / 100, ...rows.map(r => r.shMed / 100)] : null; for (const v of k) kmax = Math.max(kmax, v); if (sh) for (const v of sh) kmax = Math.max(kmax, v); return { cls, R, k, sh }; });
    kmax *= 1.12; const Y3 = yLin(0, kmax, 6, H3 - 12);
    const ax3 = sv("g", { class: "yax" }, s3);
    for (const t of niceTicks(0, kmax, 3)) { sv("line", { x1: G.l, x2: G.l + G.pw, y1: Y3(t), y2: Y3(t) }, ax3); st_(ax3, G.l - 6, Y3(t) + 3.5, String(t), { "text-anchor": "end" }); st_(ax3, G.l + G.pw + 6, Y3(t) + 3.5, fInt(t * 100), {}); }
    for (const S of ser) { let d = ""; S.R.main.rows.forEach((r, i) => { d += (i ? "L" : "M") + G.x(r.w0) + "," + Y3(S.k[i]) + "L" + G.x(Math.min(r.w1, W)) + "," + Y3(S.k[i]); });
      sv("path", { d, fill: "none", stroke: `var(--${S.cls})`, "stroke-width": 2 }, s3);
      if (S.sh) { let e = ""; const X = xs(S.R); X.forEach((w, i) => e += (i ? "L" : "M") + G.x(w) + "," + Y3(S.sh[i])); sv("path", { d: e, fill: "none", stroke: `var(--${S.cls})`, "stroke-width": 1, opacity: 0.7 }, s3); }
      S.R.main.rows.forEach((r, i) => { if (ys.costs.liq && S.k[i] >= ys.costs.liq) sv("rect", { x: G.x(r.w0), y: Y3(S.k[i]) - 3, width: Math.max(1, G.x(r.w1) - G.x(r.w0)), height: 3, fill: "var(--shade)" }, s3); }); }
    // ---- crosshair, tooltip and pin across the three
    const svgs = [s1, s2, s3], cross = svgs.map(s => sv("line", { class: "ycross", y1: 0, y2: +s.getAttribute("height") - 8, visibility: "hidden" }, s));
    const pinL = svgs.map(s => sv("line", { class: "ypin", y1: 0, y2: +s.getAttribute("height") - 8 }, s));
    const placePin = () => pinL.forEach(l => { l.setAttribute("x1", G.x(ys.view.pin)); l.setAttribute("x2", G.x(ys.view.pin)); });
    placePin();
    for (const s of svgs) {
      const hit = sv("rect", { x: G.l, y: 0, width: G.pw, height: s.getAttribute("height"), fill: "transparent" }, s);
      if (s === s1 && ys.sc.path.mode === "pts") s1.insertBefore(hit, s1.querySelector("#y-anch"));
      hit.addEventListener("pointermove", ev => { const rc = s.getBoundingClientRect(), w = G.w(ev.clientX - rc.left); cross.forEach(c => { c.setAttribute("x1", G.x(w)); c.setAttribute("x2", G.x(w)); c.setAttribute("visibility", "visible"); }); showTip(stackTip(w), ev.clientX, ev.clientY); });
      hit.addEventListener("pointerleave", () => { cross.forEach(c => c.setAttribute("visibility", "hidden")); hideTip(); });
      hit.addEventListener("click", ev => { const rc = s.getBoundingClientRect(); ys.view.pin = Math.max(1, G.w(ev.clientX - rc.left)); placePin(); renderGrowth(); renderTable(); saveSoon(); });
      hit.addEventListener("dblclick", ev => { if (ys.sc.path.mode !== "pts") return; const rc = s.getBoundingClientRect(), w = Math.max(1, G.w(ev.clientX - rc.left)); const mm = mult(); ys.sc.path.pts.push([w, mm[w]]); schedule(10); });
    }
    // the axes answer questions too: the week axis, the price, NAV and contracts scales
    const plotTop = 6;
    AXES.attach({ svg: s1, orient: "x", band: { x: G.l, y: H1 - 6, width: G.pw, height: 28 }, guide: { from: plotTop, to: H1 - 6 },
      toValue: px => G.w(px), toPx: G.x, describe: describeWeekOnAxis });
    AXES.attach({ svg: s1, orient: "y", band: { x: 0, y: plotTop, width: G.l, height: H1 - 12 }, guide: { from: G.l, to: G.l + G.pw },
      toValue: py => hi - (py - plotTop) / (H1 - 6) * (hi - lo), toPx: Y1, describe: v => describePriceOnAxis({ value: v, isMultiple: unitMult, ticker: tkA }) });
    AXES.attach({ svg: s2, orient: "y", band: { x: 0, y: plotTop, width: G.l, height: H2 - 12 }, guide: { from: G.l, to: G.l + G.pw },
      toValue: py => Math.exp(Math.log(nhi) - (py - plotTop) / (H2 - 12) * (Math.log(nhi) - Math.log(nlo))), toPx: Y2, describe: describeNavOnAxis });
    AXES.attach({ svg: s3, orient: "y", band: { x: 0, y: plotTop, width: G.l, height: H3 - 18 }, guide: { from: G.l, to: G.l + G.pw },
      toValue: py => kmax - (py - plotTop) / (H3 - 12) * kmax, toPx: Y3, describe: describeContractsOnAxis });
  }
  // ---------------------------------------------------------- what a value on a Compounding axis means
  function describeWeekOnAxis(week) {
    const w = Math.max(0, Math.round(week)), tkA = RES.A.run.tk, price = RES.mult[w] * ys.sc.S0[tkA];
    let html = `<span class="h">Week ${w} of ${ys.sc.W} · ${fD(COMPOUND_ENGINE.weekDate(w))}</span><span class="s">day ${w * 7} · ${tkA} on the path ${fKs(price)} (${fPs(RES.mult[w] - 1)} from the start)</span>`;
    for (const [who, R] of [["A", RES.A], ["B", RES.B]]) {
      if (!R || w === 0) { continue; }
      const rows = R.main.rows, r = rowAt(R, w), cycle = rows.indexOf(r) + 1;
      html += tipRow(who.toLowerCase(), `${who} cycle ${cycle} of ${rows.length}`, `${fD(r.t0)} → ${fD(r.date)}`);
    }
    return html;
  }
  /** @param {{ value: number, isMultiple: boolean, ticker: string }} input */
  function describePriceOnAxis({ value, isMultiple, ticker }) {
    const start = ys.sc.S0[ticker], multiple = isMultiple ? value : value / start;
    const price = isMultiple ? `×${value.toFixed(3)} of each run's start` : `${ticker} ${fKs(value)}`;
    return `<span class="h">${price}</span>${tipRow("ink-3", "from the start", fPs(multiple - 1))}${isMultiple ? "" : tipRow("ink-3", "× the start", fX(multiple))}`;
  }
  // a NAV: the multiple of the start, the steady weekly growth it takes, and where it falls in each run's final spread
  function describeNavOnAxis(nav) {
    const cap0 = ys.sc.cap0, W = ys.sc.W, multiple = nav / cap0;
    let html = `<span class="h">NAV ${f$(nav)}</span>${tipRow("ink-3", "× the start", fX(multiple))}${tipRow("ink-3", `steady growth for this in ${W} wk`, `${fPs(Math.pow(multiple, 1 / W) - 1, 2)} a week`)}`;
    for (const [who, R] of [["A", RES.A], ["B", RES.B]]) {
      if (!R) { continue; }
      const end = rowAt(R, W);
      html += tipRow(who.toLowerCase(), `${who} at week ${W}`, describeSpreadPosition({ value: nav, low: end.c10, middle: end.med, high: end.c90 }));
    }
    return html;
  }
  /** @param {{ value: number, low: number, middle: number, high: number }} spread */
  function describeSpreadPosition({ value, low, middle, high }) {
    if (!Number.isFinite(low) || !Number.isFinite(high)) { return "–"; }
    if (value < low) { return "below its 10% line"; }
    if (value < middle) { return "between its 10% line and the median"; }
    if (value < high) { return "between the median and its 90% line"; }
    return "above its 90% line";
  }
  function describeContractsOnAxis(contracts) {
    const n = Math.max(0, contracts), tkA = RES.A.run.tk, start = ys.sc.S0[tkA];
    return `<span class="h">${n.toFixed(1)} contracts</span>${tipRow("ink-3", "shares", fInt(n * 100))}${tipRow("ink-3", `notional at ${tkA}'s start ${fKs(start)}`, f$(n * 100 * start))}`;
  }

  function ivPathCtl() {
    const p = ys.ivp, sel = q("#y-ivpm"); sel.value = p.mode; sel.onchange = () => { p.mode = sel.value; schedule(10); };
    const n = q("#y-ivpn"), tk = ys.A.tk, iv0 = ys.sc.iv[tk];
    if (p.mode === "line") n.innerHTML = `to <input type="number" id="y-ivpe" min="20" max="300" step="1" style="width:52px">% at week ${ys.sc.W}`;
    else if (p.mode === "growth") n.innerHTML = `<input type="number" id="y-ivpg" min="-90" max="200" step="1" style="width:52px">% over the ${ys.sc.W} weeks`;
    else if (p.mode === "pts") n.innerHTML = p.pts.map((x, i) => `<span class="vv" style="margin-right:8px">wk <input type="number" data-i="${i}" data-f="w" value="${x[0]}" min="1" max="104" style="width:44px"> <input type="number" data-i="${i}" data-f="v" value="${Math.round(x[1] * iv0)}" min="20" max="300" style="width:48px">% <button type="button" class="btn" data-del="${i}" style="padding:0 5px">×</button></span>`).join("") + `<button type="button" class="btn" id="y-ivpadd" style="padding:0 7px">+ point</button>`;
    else n.innerHTML = `<span class="cap">IV stays at your input throughout</span>`;
    const e = q("#y-ivpe"); if (e) { e.value = Math.round(p.end * iv0); e.onchange = () => { const v = parseFloat(e.value); if (v > 0) p.end = v / iv0; schedule(10); }; }
    const g = q("#y-ivpg"); if (g) { g.value = p.g; g.onchange = () => { const v = parseFloat(g.value); if (Number.isFinite(v)) p.g = Math.max(-90, v); schedule(10); }; }
    if (p.mode === "pts") { n.onchange = ev => { const i = ev.target.dataset.i; if (i === undefined) return; const v = parseFloat(ev.target.value); if (!Number.isFinite(v)) return; if (ev.target.dataset.f === "w") p.pts[+i][0] = Math.round(v); else p.pts[+i][1] = v / iv0; schedule(10); };
      n.onclick = ev => { const d = ev.target.dataset && ev.target.dataset.del; if (d !== undefined) { p.pts.splice(+d, 1); schedule(10); } if (ev.target.id === "y-ivpadd") { const last = p.pts[p.pts.length - 1] || [0, 1]; p.pts.push([Math.min(ys.sc.W, last[0] + 8), last[1]]); schedule(10); } }; }
    const rr = q("#y-ivpr"); rr.hidden = p.mode === "flat";
    segY(rr, [["gap", "moves keep the gap to IV", "Realized moves follow IV, so the edge holds"], ["const", "moves stay constant", "A falling IV shrinks the edge and can turn it negative"]], () => p.rule, v => p.rule = v);
    q("#y-ivpc").textContent = p.mode === "flat" ? "" : ` · ${tk} IV ${iv0}% → ${Math.round(ivMult()[ys.sc.W] * iv0)}% by week ${ys.sc.W}; the IV path may fall`;
  }
  const weekTicks = (W, px = 800) => { const raw = W * 74 / Math.max(200, px), step = [1, 2, 4, 8, 13, 26, 52].find(k => k >= raw) || 52; const out = []; for (let w = 0; w <= W; w += step) out.push(w); if (out[out.length - 1] !== W && W - out[out.length - 1] > step / 2) out.push(W); return out; };
  function rowAt(R, w) { const rs = R.main.rows; return rs.find(r => w > r.w0 && w <= r.w1) || rs.find(r => w >= r.w0 && w <= r.w1) || rs[rs.length - 1]; }
  function stackTip(w) {
    const m = RES.mult, tkA = RES.A.run.tk; let h = `<span class="h">Week ${w} · ${fD(COMPOUND_ENGINE.weekDate(w))}</span><span class="s">${tkA} ${fKs(m[w] * ys.sc.S0[tkA])}${RES.B && RES.B.run.tk !== tkA ? ` · ${RES.B.run.tk} ${fKs(m[w] * ys.sc.S0[RES.B.run.tk])}` : ""} · path ${fPs(m[w] - 1)}</span>`;
    for (const [who, R] of [["A", RES.A], ["B", RES.B]]) { if (!R) continue; const r = rowAt(R, Math.max(1, w)), cc = R.run.fam === "cc";
      h += `<span class="r"><span class="k"><i class="sw" style="background:var(--${who.toLowerCase()})"></i>${who} typical NAV</span><span class="v">${f$(w === 0 ? ys.sc.cap0 : r.med)}</span></span>`;
      if (w) h += `<span class="r"><span class="k">10%–90%</span><span class="v">${f$(r.c10)} – ${f$(r.c90)}</span></span>`;
      h += `<span class="r"><span class="k">strikes this cycle</span><span class="v">${[r.Kp ? fKs(r.Kp) + "P" : "", r.Kc ? fKs(r.Kc) + "C" : ""].filter(Boolean).join(" / ")}</span></span>`;
      h += `<span class="r"><span class="k">${cc ? "shares (typical)" : "contracts (typical)"}</span><span class="v">${cc ? fInt(r.shMed) : Math.floor(r.kMed)}</span></span>`;
      if (r.called > 0.0005) h += `<span class="r"><span class="k">margin call so far</span><span class="v">${fPc(r.called, 0)}</span></span>`; }
    return h + `<span class="s" style="margin:4px 0 0">click to pin this week in the growth card</span>`;
  }
  // points editor: anchors on the price chart + a table in the right margin
  function ptsEditor(s1, Y1, lo, hi, unitMult) {
    const G = GEO, P = ys.sc.path, S0 = ys.sc.S0[ys.A.tk], toY = mm => Y1(unitMult ? mm : mm * S0), fromY = y => { const v = hi - (y - 6) / (Y1(lo) - 6) * (hi - lo); return unitMult ? v : v / S0; };
    const g = sv("g", { id: "y-anch" }, s1);
    P.pts.forEach((p, i) => {
      if (p[0] > ys.sc.W) return;
      const c = sv("circle", { cx: G.x(p[0]), cy: toY(p[1]), r: 5.5, fill: "var(--surface)", stroke: lastPtsNotes[p[0]] ? "var(--warn)" : "var(--ink)", "stroke-width": 2, style: "cursor:ns-resize", tabindex: 0 }, g);
      c.addEventListener("pointerdown", ev => { ev.preventDefault(); c.setPointerCapture(ev.pointerId); const rc = s1.getBoundingClientRect();
        const prev = i ? P.pts[i - 1][1] : 1;
        const mv = e => { let v = fromY(e.clientY - rc.top); const held = v < prev; v = Math.max(prev, v); p[1] = v; c.setAttribute("cy", toY(v)); c.setAttribute("stroke", held ? "var(--warn)" : "var(--ink)");
          const mm = mult(); let d = ""; for (let w = 0; w <= ys.sc.W; w++) d += (w ? "L" : "M") + G.x(w) + "," + toY(mm[w]); s1.querySelector("#y-pathline").setAttribute("d", d); showTip(`<span class="h">Week ${p[0]}: ${fKs(v * S0)}</span>${held ? `<span class="s">held at ${fKs(prev * S0)}: the path cannot fall</span>` : ""}`, e.clientX, e.clientY); };
        const up = () => { c.removeEventListener("pointermove", mv); c.removeEventListener("pointerup", up); hideTip(); schedule(10); };
        c.addEventListener("pointermove", mv); c.addEventListener("pointerup", up); });
      c.addEventListener("keydown", ev => { if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return; ev.preventDefault(); const stp = (ev.shiftKey ? 1 : 0.1) / S0; p[1] = Math.max(i ? P.pts[i - 1][1] : 1, p[1] + (ev.key === "ArrowUp" ? stp : -stp)); schedule(60); });
    });
    // table
    const t = document.createElement("span"); t.className = "ypts";
    t.innerHTML = `<table><tr><th style="text-align:left">week</th><th>price</th><th>from start</th><th></th></tr><tr><td style="text-align:left">0</td><td>${fKs(S0)}</td><td></td><td></td></tr>${P.pts.map((p, i) => `<tr><td style="text-align:left"><input type="number" data-i="${i}" data-f="w" value="${p[0]}" min="1" max="104" step="1" style="width:44px"${p[0] > ys.sc.W ? ' class="muted"' : ""}></td><td><input type="number" data-i="${i}" data-f="p" value="${(p[1] * S0).toFixed(2)}" step="0.5"></td><td>${fPs(p[1] - 1, 0)}</td><td><button type="button" class="btn" data-del="${i}" style="padding:0 6px">×</button></td></tr>${lastPtsNotes[p[0]] ? `<tr><td colspan="4" class="held">${lastPtsNotes[p[0]]}</td></tr>` : ""}${p[0] > ys.sc.W ? `<tr><td colspan="4" class="held">after week ${ys.sc.W}, not used</td></tr>` : ""}`).join("")}</table><button type="button" class="btn" id="y-addpt" style="margin-top:4px">+ point</button> <span class="cap">drag a dot, or double-click the chart</span>`;
    q("#y-stack").appendChild(t);
    t.onchange = e => { const tg = /** @type {HTMLInputElement} */ (e.target), i = tg.dataset.i; if (i === undefined) return; const v = parseFloat(tg.value); if (!Number.isFinite(v)) return; if (tg.dataset.f === "w") P.pts[+i][0] = Math.round(v); else P.pts[+i][1] = v / S0; schedule(10); };
    t.onclick = e => { const tg = /** @type {HTMLElement} */ (e.target), d = tg.dataset && tg.dataset.del; if (d !== undefined) { P.pts.splice(+d, 1); schedule(10); } if (tg.id === "y-addpt") { const last = P.pts.length ? P.pts[P.pts.length - 1] : [0, 1]; const w = Math.min(ys.sc.W, last[0] + 8); P.pts.push([w, last[1]]); schedule(10); } };
  }

  // ---------------------------------------------------------- growth card (pinned week)
  function renderGrowth() {
    const host = q("#y-growth"), who = RES.B && ys.view.gRun === "B" ? "B" : "A", R = RES[who], run = R.run, rows = R.main.rows;
    const w = Math.max(1, Math.min(ys.sc.W, ys.view.pin)), r = rowAt(R, w), i = rows.indexOf(r), prev = i ? rows[i - 1] : null;
    const S0 = r.S0, T = r.days / 365, v = r.sigma, g = r.S1 / r.S0 - 1, rates = ratesOf(), m = R.main.m;
    const y = r.pc / S0, a = r.Kc ? r.Kc / S0 - 1 : NaN;
    const e = r.Kc ? COMPOUND_ENGINE.bs(r.S1 * Math.exp(v * v / 2 - 0.04 * T), r.Kc, Math.max(T, 1e-9), v / Math.sqrt(Math.max(T, 1e-9)), "C") * Math.exp(0.04 * T) / S0 : 0;
    const ePrice = r.Kc ? COMPOUND_ENGINE.bs(S0, r.Kc, T, v / Math.sqrt(T), "C") * Math.exp(0.04 * T) / S0 : 0;
    const edge = r.Kc ? 1 - ePrice / y : NaN;
    let body = "";
    const seg2 = RES.B ? `<span class="seg" id="y-grun"><button type="button" data-v="A" class="${who === "A" ? "on" : ""}">A</button><button type="button" data-v="B" class="${who === "B" ? "on" : ""}">B</button></span> ` : "";
    const head = `<h3>Growth, week ${w}<span class="sub">${fD(r.t0)} → ${fD(r.date)} · ${r.days} days · path ${fPs(g, 2)}</span><span class="stp">${seg2}<button type="button" class="btn" id="y-gp">◀</button> <button type="button" class="btn" id="y-gn">▶</button></span></h3>`;
    if (run.fam === "cc") {
      const lam = prev ? prev.lamTyp : run.lev, sh = prev ? prev.shMed : r.n, lots = Math.min(Math.floor(sh / 100 + 1e-9), ys.costs.liq || 1e9), c = sh > 0 ? Math.min(1, lots * 100 / sh) : 0;
      const loanR = lam > 1 ? COMPOUND_ENGINE.loanRate((lam - 1) * (prev ? prev.med : ys.sc.cap0), rates) : rates.tiered ? 0 : rates.cash;
      const Rex = lam * (g + c * (y - Math.max(0, g - a))) + (1 - lam) * loanR * T, Ravg = lam * (Math.exp(v * v / 2) * (1 + g) - 1 + c * (y - e)) + (1 - lam) * loanR * T;
      const cred = lots * 100 * r.pc, buy = x => Math.floor(cred * x / S0);
      // the cycle's return, set in LaTeX: the formula, its symbols with this week's values, and both readings worked out
      const pctTex = (v, d = 2) => `${v < 0 ? "-" : ""}${Math.abs(v * 100).toFixed(d)}\\%`, sgnTex = (v, d = 2) => `${v > 0 ? "{+}" : v < 0 ? "{-}" : ""}${Math.abs(v * 100).toFixed(d)}\\%`;
      const payPath = Math.max(0, g - a), weeks = T * 52;
      const formula = TEX.html(String.raw`R = \lambda\,\bigl(g + c\,(y - e)\bigr) + (1-\lambda)\,r\,T`, { display: true });
      const symbols = [
        [String.raw`\lambda`, lam.toFixed(2), "typical leverage"],
        ["c", c.toFixed(2), "calls per share held"],
        ["y", fPc(y, 2), `premium of the ${fKs(r.Kc)} call (really ${(r.dc * 100).toFixed(0)}Δ, ${fPs(a)} away)`],
        ["g", fPs(g, 2), "the path's move this cycle"],
        ["e", fPc(e, 2), "the call's average payout over the realized moves"],
        [String.raw`r\,T`, `${fPc(loanR, 2)} × ${weeks.toFixed(2)} wk`, "loan or cash rate over the cycle"]
      ];
      const worked = TEX.html(String.raw`R_{\text{path}} = ${lam.toFixed(2)}\,\bigl(${pctTex(g)} + ${c.toFixed(2)}\,(${pctTex(y)} - ${pctTex(payPath)})\bigr) + (1-${lam.toFixed(2)})\,${pctTex(loanR)}\cdot\tfrac{${weeks.toFixed(2)}}{52} = ${sgnTex(Rex)}`, { display: true });
      const average = TEX.html(String.raw`\bar R = ${sgnTex(Ravg)}\quad\text{(the shares' average move and } e = ${pctTex(e)}\text{)}`, { display: true });
      body = `<span class="ytex">${formula}<table class="ysym">${symbols.map(([sym, val, what]) => `<tr><td>${TEX.html(sym)}</td><td>${val}</td><td>${what}</td></tr>`).join("")}</table>${worked}${average}</span>
        <span class="kv">Edge kept <b>${fPc(edge, 0)}</b> of the premium</span><span class="kv">Odds the call ends in the money <b>${fPc(r.pitm, 0)}</b></span>
        <p style="margin:6px 0 0">This cycle's credit on the typical account: <b>${f$(cred)}</b> (${lots} calls). Kept in full it buys ${fInt(buy(lam))} ${run.tk} at ${lam.toFixed(2)}x, ${fInt(buy(1 / m))} at the ${(1 / m).toFixed(2)}x ceiling, ${fInt(buy(1))} with no loan${cred > 0 ? `: a new 100-share lot every ${(100 * S0 / (cred * lam)).toFixed(1)} cycles exactly on the path` : ""}.</p>
        <p class="cap" style="margin:4px 0 0">The same credit in SPY buys 2× overnight (Reg T 50%); 4× is intraday buying power only. ${run.tk} at IBKR: ${(1 / m).toFixed(2)}× at most, and initial = maintenance, so the last dollar of buying power has no cushion. The engine reinvests only after expiry, never the day the premium is received.</p>`;
    } else {
      const k = prev ? Math.floor(prev.kMed) : r.k, cred = k * 100 * (r.pc + r.pp);
      const premium = TEX.html(String.raw`\frac{p_P + p_C}{S_0} = \frac{${r.pp.toFixed(2)} + ${r.pc.toFixed(2)}}{${S0.toFixed(2)}} = ${((r.pc + r.pp) / S0 * 100).toFixed(2)}\%`, { display: true });
      const rows = [["strikes", `${fKs(r.Kp)}P (really ${(r.dp * 100).toFixed(0)}Δ) / ${fKs(r.Kc)}C (really ${(r.dc * 100).toFixed(0)}Δ)${r.Kp > r.Kc ? " · short guts: the put sits above the call" : ""}`],
        ...((r.tvc + r.tvp) < r.pc + r.pp - 1e-6 ? [["time value", `${fPc((r.tvc + r.tvp) / S0, 2)} of spot`]] : []),
        ["contracts", `${k} (${Math.round(run.use * 100)}% of the margin the account allows)`],
        ["margin call", `on ${Number.isFinite(r.cushUp) ? fPs(r.cushUp, 0) : "no rally"} or ${r.cush < 1 ? fPs(-r.cush, 0) : "no drop"} from the cycle start`]];
      body = `<span class="ytex">${premium}<table class="ysym">${rows.map(([k_, v_]) => `<tr><td>${k_}</td><td colspan="2">${v_}</td></tr>`).join("")}</table></span>
        <p style="margin:6px 0 0">This cycle's credit on the typical account: <b>${f$(cred)}</b>.</p>`;
    }
    host.innerHTML = head + `<span class="ygc">${body}</span>`;
    q("#y-gp").onclick = () => { ys.view.pin = Math.max(1, w - 1); renderGrowth(); renderStackPin(); };
    q("#y-gn").onclick = () => { ys.view.pin = Math.min(ys.sc.W, w + 1); renderGrowth(); renderStackPin(); };
    const sg = q("#y-grun"); if (sg) sg.onclick = e => { const b = e.target.closest("button"); if (!b) return; ys.view.gRun = b.dataset.v; renderGrowth(); };
  }
  const renderStackPin = () => qa(".ypin").forEach(l => { l.setAttribute("x1", GEO.x(ys.view.pin)); l.setAttribute("x2", GEO.x(ys.view.pin)); });

  // ---------------------------------------------------------- sweep (stage 2, sliced)
  let SW = { key: "", data: null, job: 0 };
  // the strip's safe-size lines, once the sweep has an answer
  function refreshCallSafeSize() { for (const node of document.querySelectorAll("#y-strip [data-safe]")) { node.innerHTML = describeCallSafeSize(/** @type {HTMLElement} */ (node).dataset.safe || "A"); } }
  function sweepSpec() { const who = RES.B && ys.view.sweepRun === "B" ? "B" : "A", run = RES[who].run, m = ys.costs.mOvr[run.tk];
    if (run.fam === "cc") { const top = 1 / m, xs = [...new Set([0.5, 0.75, 1, 1.1, 1.2, 1.25, 1.3, top, run.lev].filter(x => x <= top + 1e-9).map(x => +x.toFixed(4)))].sort((a, b) => a - b);
      // the run's own credit policy first (the solid line), then the one it is most often weighed against
      const own = run.modus.credit, other = own === "reinvest" ? "rebal" : "reinvest";
      return { who, run, kind: "lev", xs, pols: [own, other] }; }
    const xs = [...new Set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, run.use].map(x => +x.toFixed(2)))].sort((a, b) => a - b); return { who, run, kind: "use", xs, pols: [run.modus.credit] }; }
  function renderSweep() {
    const host = q("#y-sweep"), S = sweepSpec(), key = JSON.stringify([S, ys.sc, ys.costs, ys.rates, readRunVolPath({ run: S.run, slot: S.who })]);
    const seg2 = RES.B ? `<span class="seg" id="y-swrun" style="float:right"><button type="button" data-v="A" class="${S.who === "A" ? "on" : ""}">A</button><button type="button" data-v="B" class="${S.who === "B" ? "on" : ""}">B</button></span>` : "";
    host.innerHTML = `<h3>${S.kind === "lev" ? "Leverage" : "Margin used"} sweep<span class="sub">typical NAV at week ${ys.sc.W}; strip = odds of a margin call${S.pols.length > 1 ? ` · solid = ${COMPOUND_ENGINE.WORDS.credit(S.pols[0])} (this run), dashed = ${COMPOUND_ENGINE.WORDS.credit(S.pols[1])}` : ""}</span>${seg2}</h3><span id="y-swb"><span class="cap">computing…</span></span>`;
    const sg = q("#y-swrun"); if (sg) sg.onclick = e => { const b = e.target.closest("button"); if (!b) return; ys.view.sweepRun = b.dataset.v; renderSweep(); };
    if (SW.key === key && SW.data) return drawSweep(S, SW.data);
    const job = ++SW.job, out = []; const todo = []; for (const pol of S.pols) for (const x of S.xs) todo.push([pol, x]);
    const step = () => { if (job !== SW.job) return; const t0 = performance.now();
      while (todo.length && performance.now() - t0 < 30) { const [pol, x] = todo.shift(); const run = { ...S.run, modus: { ...S.run.modus, credit: pol } }; if (S.kind === "lev") run.lev = x; else run.use = x; const r = runFor({ run, slot: S.who }); out.push({ pol, x, med: r.end.med, called: r.end.called, sh: r.end.shMed }); }
      if (todo.length) setTimeout(step, 0); else { SW = { key, data: out, job }; if (q("#y-swb")) drawSweep(S, out); } };
    setTimeout(step, 30);
  }
  function drawSweep(S, data) {
    const host = q("#y-swb"); host.innerHTML = ""; const Wd = Math.max(320, q("#y-sweep").clientWidth), H = 190, H2 = 50, l = 56, r = 16, pw = Wd - l - r;
    const s = sv("svg", { width: Wd, height: H + H2 + 30, viewBox: `0 0 ${Wd} ${H + H2 + 30}` }, host);
    const xlo = S.xs[0], xhi = S.xs[S.xs.length - 1], X = x => l + (x - xlo) / (xhi - xlo || 1) * pw;
    const meds = data.map(d => d.med), lo = Math.min(...meds, ys.sc.cap0) * 0.95, hi = Math.max(...meds) * 1.05, Y = yLin(lo, hi, 6, H - 18), Yc = yLin(0, 1, H + 10, H2 - 4);
    const ax = sv("g", { class: "yax" }, s);
    { const TK = niceTicks(lo, hi, 4), fa = axis$(TK); for (const t of TK) { sv("line", { x1: l, x2: l + pw, y1: Y(t), y2: Y(t) }, ax); st_(ax, l - 6, Y(t) + 3.5, fa(t), { "text-anchor": "end" }); } }
    for (const t of [0, 0.5, 1]) { sv("line", { x1: l, x2: l + pw, y1: Yc(t), y2: Yc(t) }, ax); st_(ax, l - 6, Yc(t) + 3.5, fPc(t, 0), { "text-anchor": "end" }); }
    let lastX = -1e9; for (const x of S.xs) { if (X(x) - lastX < 38 && x !== S.xs[S.xs.length - 1]) continue; if (x === S.xs[S.xs.length - 1] && X(x) - lastX < 38) continue; lastX = X(x); st_(ax, X(x), H + H2 + 24, S.kind === "lev" ? x.toFixed(2) + "x" : Math.round(x * 100) + "%", { "text-anchor": "middle" }); }
    const cls = S.who.toLowerCase();
    S.pols.forEach((pol, k) => { const pts = data.filter(d => d.pol === pol).sort((a, b) => a.x - b.x), mine = k === 0; // the run's own policy is pols[0]
      let d = "", dc = ""; pts.forEach((p, i) => { d += (i ? "L" : "M") + X(p.x) + "," + Y(p.med); dc += (i ? "L" : "M") + X(p.x) + "," + Yc(p.called); });
      sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": mine ? 2 : 1.4, "stroke-dasharray": mine ? "" : "5 4" }, s);
      sv("path", { d: dc, fill: "none", stroke: `var(--${cls})`, "stroke-width": mine ? 1.6 : 1.1, "stroke-dasharray": mine ? "" : "5 4" }, s);
      
      for (const p of pts) { sv("circle", { cx: X(p.x), cy: Y(p.med), r: Math.abs(p.x - (S.kind === "lev" ? S.run.lev : S.run.use)) < 1e-6 && mine ? 5 : 2.5, fill: `var(--${cls})` }, s); } });
    const xLabel = x => S.kind === "lev" ? x.toFixed(2) + "x" : Math.round(x * 100) + "% of margin";
    attachCursor({ svg: s, left: l, width: pw, top: 6, bottom: H + H2 + 8, xs: S.xs, toPx: X,
      tipAt: x => `<span class="h">${S.who} at ${xLabel(x)}</span>` + S.pols.map(pol => { const p = data.find(d => d.pol === pol && Math.abs(d.x - x) < 1e-9); if (!p) { return ""; }
        const name = S.pols.length > 1 ? `${COMPOUND_ENGINE.WORDS.credit(pol)} · ` : "";
        return tipRow(cls, `${name}typical NAV`, f$(p.med)) + tipRow(cls, `${name}margin call within ${ys.sc.W} wk`, fPc(p.called, 1)) + (p.sh ? tipRow(cls, `${name}shares (typical)`, fInt(p.sh)) : ""); }).join("") });
    if (S.kind === "lev") { const top = S.xs[S.xs.length - 1]; sv("line", { x1: X(top), x2: X(top), y1: 6, y2: H + H2 + 8, stroke: "var(--warn)", "stroke-dasharray": "2 3" }, s); st_(s, X(top) - 3, H - 16, "ceiling", { "text-anchor": "end", class: "yhalo", fill: "var(--warn)", "font-size": 10.5 }); }
  }

  // ---------------------------------------------------------- the sticky cursor every chart on this tab shares
  // a vertical line at the data point nearest the pointer and that point's values in the tip, as on the Compare tab
  /** @param {{ svg: SVGSVGElement, left: number, width: number, top: number, bottom: number, xs: number[], toPx: (x: number) => number, tipAt: (x: number) => string, onPick?: (x: number) => void }} spec */
  function attachCursor({ svg, left, width, top, bottom, xs, toPx, tipAt, onPick }) {
    if (!xs.length) { return; }
    const cross = sv("line", { class: "ycross", y1: top, y2: bottom, visibility: "hidden" }, svg);
    const hit = sv("rect", { x: left, y: top, width, height: Math.max(1, bottom - top), fill: "transparent", style: onPick ? "cursor:pointer" : "" }, svg);
    const nearest = ev => {
      const box = svg.getBoundingClientRect(), px = (ev.clientX - box.left) * (+svg.getAttribute("width") / box.width);
      let best = xs[0];
      for (const x of xs) { if (Math.abs(toPx(x) - px) < Math.abs(toPx(best) - px)) { best = x; } }
      return best;
    };
    hit.addEventListener("pointermove", ev => {
      const x = nearest(ev);
      cross.setAttribute("x1", String(toPx(x))); cross.setAttribute("x2", String(toPx(x))); cross.setAttribute("visibility", "visible");
      showTip(tipAt(x), ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
    if (onPick) { hit.addEventListener("click", ev => onPick(nearest(ev))); }
  }
  const tipRow = (cls, label, value) => `<span class="r"><span class="k"><i class="sw" style="background:var(--${cls})"></i>${label}</span><span class="v">${value}</span></span>`;

  // ---------------------------------------------------------- credit and margin panels
  function lineChart(host, title, sub, series, fmt, y0, y1) {
    host.innerHTML = `<h3>${title}<span class="sub">${sub}</span></h3>`;
    const Wd = Math.max(320, host.clientWidth), H = 190, l = 56, r = 16, pw = Wd - l - r, W = ys.sc.W, X = w => l + w / W * pw;
    const s = sv("svg", { width: Wd, height: H + 22, viewBox: `0 0 ${Wd} ${H + 22}` }, host);
    let lo = y0 ?? Infinity, hi = y1 ?? -Infinity; if (y0 == null || y1 == null) for (const S of series) for (const p of S.pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    if (y0 == null) lo = Math.min(lo, 0); if (!(hi > lo)) hi = lo + 1; const Y = yLin(lo, hi * 1.04, 6, H - 8);
    const ax = sv("g", { class: "yax" }, s);
    { const TK = niceTicks(lo, hi, 4), fa = fmt === f$ ? axis$(TK) : fmt; for (const t of TK) { sv("line", { x1: l, x2: l + pw, y1: Y(t), y2: Y(t) }, ax); st_(ax, l - 6, Y(t) + 3.5, fa(t), { "text-anchor": "end" }); } }
    for (const w of weekTicks(W, pw)) st_(ax, X(w), H + 14, fD(COMPOUND_ENGINE.weekDate(w)), { "text-anchor": tickAnchor(X(w), l, l + pw) });
    for (const S of series) { let d = ""; S.pts.forEach((p, i) => d += (i ? "L" : "M") + X(p[0]) + "," + Y(p[1])); sv("path", { d, fill: "none", stroke: `var(--${S.cls})`, "stroke-width": 2 }, s);
      const lp = S.pts[S.pts.length - 1]; st_(s, X(lp[0]) - 2, Y(lp[1]) - 6, `${S.cls.toUpperCase()} ${fmt(lp[1])}`, { "text-anchor": "end", class: "yhalo", fill: `var(--${S.cls})`, "font-size": 11, "font-weight": 600 }); }
    // the value of a stepped series at week w: its last point at or before w
    const valueAt = (S, w) => { let v = NaN; for (const p of S.pts) { if (p[0] <= w + 1e-9) { v = p[1]; } } return v; };
    const weeks = [...new Set(series.flatMap(S => S.pts.map(p => p[0])))].sort((a, b) => a - b);
    AXES.attach({ svg: s, orient: "x", band: { x: l, y: H - 8, width: pw, height: 30 }, guide: { from: 6, to: H - 8 }, toValue: px => Math.round(Math.min(W, Math.max(0, (px - l) / pw * W))), toPx: X, describe: describeWeekOnAxis });
    attachCursor({ svg: s, left: l, width: pw, top: 6, bottom: H - 8, xs: weeks, toPx: X,
      tipAt: w => `<span class="h">${title}, week ${Math.round(w)} · ${fD(COMPOUND_ENGINE.weekDate(Math.round(w)))}</span>` + series.map(S => tipRow(S.cls, S.cls.toUpperCase(), fmt(valueAt(S, w)))).join("") });
  }
  function renderCreditMargin() {
    const runs = [["a", RES.A], RES.B ? ["b", RES.B] : null].filter(Boolean), W = ys.sc.W;
    lineChart(q("#y-credit"), "Credit collected", "cumulative, averaged over the outcomes", runs.map(([cls, R]) => ({ cls, pts: [[0, 0], ...R.main.rows.map(r => [Math.min(r.w1, W), r.cumCredit])] })), f$);
    lineChart(q("#y-margin"), "Margin call so far", "share of outcomes with at least one margin call by that week", runs.map(([cls, R]) => ({ cls, pts: [[0, 0], ...R.main.rows.map(r => [Math.min(r.w1, W), r.called])] })), v => fPc(v, 0), 0, 1);
  }

  // ---------------------------------------------------------- table
  // each cycle's price move from the cycle before, coloured by its size in σ of the days it took at the pricing IV
  // (MOVES: grey flat, yellow notable, green a clear rise, red a clear fall); the CSV keeps the plain number
  /** @param {{ R: any, who: string }} input */
  function readCycleMoves({ R, who }) {
    const { iv } = readRunVol({ run: R.run, slot: who === "B" ? RunSlot.B : RunSlot.A }), cells = new Map();
    R.main.rows.forEach((r, i) => {
      const before = i ? R.main.rows[i - 1] : null;
      if (!before || !(before.S0 > 0) || !(r.S0 > 0)) { return; }
      const move = r.S0 / before.S0 - 1, sigma = iv * Math.sqrt(Math.max(1, before.days) / 365), z = Math.log(1 + move) / sigma;
      cells.set(r, `<span class="mvc-${MOVES.classify(z)}" title="${MOVES.WORDS[MOVES.classify(z)]}: ${z.toFixed(1)}σ over ${before.days} days at ${(iv * 100).toFixed(0)}% IV">${fPs(move, 1)}</span>`);
    });
    return cells;
  }
  function renderTable() {
    const who = RES.B && ys.view.tableRun === "B" ? "B" : "A", R = RES[who], cc = R.run.fam === "cc";
    q("#y-tablesub").textContent = `run ${who} · ${R.main.rows.length} cycles · click a row to pin its week`;
    q("#y-tabletools").innerHTML = RES.B ? `<span class="seg" id="y-trun"><button type="button" data-v="A" class="${who === "A" ? "on" : ""}">A</button><button type="button" data-v="B" class="${who === "B" ? "on" : ""}">B</button></span> <button type="button" class="btn" id="y-csv">Copy CSV</button>` : `<button type="button" class="btn" id="y-csv">Copy CSV</button>`;
    const moveOf = readCycleMoves({ R, who });
    /** @type {any[][]} column label, row formatter */
    const cols = [["Week", r => r.w1], ["Expiry", r => fD(r.date)], ["Days", r => r.days], ["Price", r => fKs(r.S0)], ["Move", r => moveOf.get(r) || ""], ["Strikes", r => [r.Kp ? fKs(r.Kp) + "P" : "", r.Kc ? fKs(r.Kc) + "C" : ""].filter(Boolean).join(" / ")], ["Δ", r => [r.Kp ? (r.dp * 100).toFixed(0) : "", r.Kc ? (r.dc * 100).toFixed(0) : ""].filter(Boolean).join(" / ")], ["% away", r => [r.Kp ? fPs(r.Kp / r.S0 - 1, 0) : "", r.Kc ? fPs(r.Kc / r.S0 - 1, 0) : ""].filter(Boolean).join(" / ")],
      ["Premium", r => fPc((r.pc + r.pp) / r.S0, 2)], ["Time value", r => fPc((r.tvc + r.tvp) / r.S0, 2)], [cc ? "Shares" : "Contracts", r => cc ? fInt(r.shMed) : Math.floor(r.kMed)], ...(cc ? [["Lots", r => r.lots]] : []), ["NAV typical", r => f$(r.med)], ["10%", r => f$(r.c10)], ["90%", r => f$(r.c90)], ["Average", r => f$(r.avg)], ["Credit", r => f$(r.credit)], ["Margin call so far", r => fPc(r.called, 1)], ["Cushion", r => r.cush < 1 ? fPs(-r.cush, 0) : "–"], ...(cc ? [["Typical λ", r => r.lamTyp.toFixed(2)]] : [])];
    const pinR = rowAt(R, ys.view.pin);
    q("#y-table").innerHTML = `<table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${R.main.rows.map(r => `<tr data-w="${Math.min(r.w1, ys.sc.W)}" class="${r === pinR ? "pin" : ""}">${cols.map(c => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    q("#y-table").onclick = e => { const tr = e.target.closest("tr[data-w]"); if (!tr) return; ys.view.pin = +tr.dataset.w; renderGrowth(); renderStackPin(); renderTable(); };
    const tr_ = q("#y-trun"); if (tr_) tr_.onclick = e => { const b = e.target.closest("button"); if (!b) return; ys.view.tableRun = b.dataset.v; renderTable(); };
    q("#y-csv").onclick = () => { const csv = [cols.map(c => c[0]).join(","), ...R.main.rows.map(r => cols.map(c => `"${String(c[1](r)).replace(/<[^>]*>/g, "").replace(/"/g, "")}"`).join(","))].join("\n"); clipboard.writeText(csv).then(r => port.showNotice(r.ok ? "Copied" : "Clipboard blocked")); };
  }

  // ============================================================ Credit kept: each cycle's share of its maximum payoff
  // Per run, every cycle's own legs (its strikes, pricing IV and days) priced flat at that IV; the price spread at the
  // run's moves vol around the path (the median on the path, as the Weeks view reads it). The readings are CAPTURE's.
  // What they compound to is the account: the engine's own contracts per NAV dollar (cycle 1, re-sized each cycle as
  // the engine does: ∝ 1/price), the fill's haircut on the credit only, and for covered calls the shares under the
  // same price spread. Runs that keep the credit as cash have fixed counts and add up instead of compounding.
  // Options and shares only: no margin calls, interest or assignment mechanics; the full model is the Weeks view.
  const KEPT_PRESETS = Object.freeze([
    { id: CAPTURE.Preset.Fixed, tex: String.raw`c = x`, name: "Fixed share", line: "an assumption: {x} of the maximum kept every cycle", knob: "A typed assumption, not a reading: the rule of thumb ‘expect half the credit’. Under it: how often cycle 1 actually keeps that much. Its NAV is the average NAV the plan implies if it held (the shares averaged over the same price spread as Expected, so the two compare)." },
    { id: CAPTURE.Preset.Expected, tex: String.raw`\bar c = \frac{\mathbb{E}[\text{P\&L}]}{M} \approx 1 - \frac{\sigma_{\text{period}}}{\sigma_{\text{IV}}}`, name: "Expected", line: "the average outcome of each cycle, held to expiry", knob: "Each cycle's expected option P&L over its maximum payoff, with the price spread at the run's realized vol around the path. Pricing IV above the realized vol makes it positive; below, negative. Compounded cycle by cycle (the shares averaged over the same spread) it gives the average NAV, which the few best runs pull up; the typical NAV is the Growth row." },
    { id: CAPTURE.Preset.Median, tex: String.raw`\tilde c = \frac{\operatorname{median}(\text{P\&L})}{M} \approx 1 - 0.845\,\frac{\sigma_{\text{period}}}{\sigma_{\text{IV}}}`, name: "Median", line: "what a typical cycle keeps", knob: "Half the cycles keep more, half less. It sits above the average because short premium wins small and often and loses large and rarely; out of the money it is often the whole credit. A median per cycle does not compound to the median NAV (the product of medians is not a median): the Growth row is the typical NAV." },
    { id: CAPTURE.Preset.OddsAtLeast, tex: String.raw`P(c \ge x) \approx 2\,\Phi\!\Big(0.80\,(1-x)\,\frac{\sigma_{\text{IV}}}{\sigma_{\text{period}}}\Big) - 1`, name: "Odds of keeping at least x", line: "how often cycle 1 keeps {x} or more", knob: "The share of outcomes of cycle 1 whose option P&L is at least x of the maximum payoff. Shown as odds, so its NAV column is empty." },
    { id: CAPTURE.Preset.Managed, tex: String.raw`\frac{\mathbb{E}[\text{P\&L}_{\tau}]}{M},\quad \tau = \min(t_{\text{TP}},\, t_{\text{stop}},\, T)`, name: "Managed", line: "closed at the take profit or the stop above, else held", knob: "Seeded daily paths at the realized vol for cycle 1, centred on the path like every other row and marked at the pricing IV; the cycle closes when its P&L reaches the take profit or the stop. ± is the Monte Carlo error. The same share is assumed for every cycle; the days a take profit frees are not reinvested here." },
    { id: CAPTURE.Preset.TimePath, tex: String.raw`c(t) = \frac{V(S_0,T) - V(S_0,T-t)}{M} \approx 1 - \sqrt{1 - t/T}`, name: "Time path", line: "kept half-way through cycle 1 if the price does not move", knob: "Time decay alone: the cycle's own mark at an unchanged price. For an at-the-money position about 29% half-way; half the maximum only after about three quarters of the cycle. Not a cycle outcome, so its NAV column is empty." },
    { id: CAPTURE.Preset.Growth, tex: String.raw`g = \mathbb{E}\,\ln\!\Big(1 + \frac{\text{P\&L}}{C}\Big),\qquad c_{\text{eq}} = \frac{(e^{g}-1)\,C}{M}`, name: "Growth", line: "the fixed share that compounds like the real outcomes", knob: "Compounding multiplies outcomes, so the rate that compounds is each cycle's average of ln(1 + the account's return), shares included for covered calls. Shown as the fixed share of the credit that, kept every cycle, compounds to the same; its NAV is the log-average (typical) NAV of the options and shares alone. For covered calls the growth includes the levered shares' own swings, which compounding penalises, so the equivalent share can sit well below Expected (even below zero) while the account still grows. With any chance of losing the whole account in one cycle it ends at zero; with the credit kept as cash nothing compounds." },
    { id: CAPTURE.Preset.Empirical, tex: String.raw`\bar c = \frac{1}{n}\sum_{i} \frac{\text{P\&L}\big(S_0\,S_{i+h}/S_i\big)}{M}`, name: "Empirical", line: "the ticker's own past moves over a cycle", knob: "Every overlapping window of daily closes as long as a cycle, applied to cycle 1. Needs daily price history: paste closes under Compare A vs B → Capture, or they arrive with the data feed." },
    { id: CAPTURE.Preset.Custom, tex: String.raw`\bar c,\ \tilde c\ \text{or}\ c_{p}\ \text{of}\ \text{P\&L}/M\ \text{under your odds}`, name: "Your variant", line: "the adjuster below the chart", knob: "The odds, gap and reading set in the adjuster under the NAV chart, applied to every cycle. Its NAV is shown for the average only: a median or percentile per cycle does not compound to anything." }
  ]);
  // the presets whose per-cycle share compounds to something: Growth to the log-average NAV, Expected and Managed to
  // the average NAV (independent cycles), Fixed to what its assumption implies, the variant when it reads the average
  const KEPT_SHOWN = Object.freeze([[CAPTURE.Preset.Growth, "Growth"], [CAPTURE.Preset.Expected, "Expected"], [CAPTURE.Preset.Fixed, "Fixed share"], [CAPTURE.Preset.Managed, "Managed"], [CAPTURE.Preset.Custom, "Your variant"]]);
  const NAV_WORD = Object.freeze({ [CAPTURE.Preset.Growth]: "typical NAV (log-average)", [CAPTURE.Preset.Expected]: "average NAV", [CAPTURE.Preset.Fixed]: "average NAV, if it held", [CAPTURE.Preset.Managed]: "average NAV", [CAPTURE.Preset.Custom]: "average NAV" });
  const KEPT_CONFIG = Object.freeze({ managedPaths: 6000 });
  const KEPT_CK_DEF = Object.freeze({ x: 50, tp: 50, sl: 200, show: "growth", src: "rv", vol: 100, gapP: 0, gapS: 30, gapSide: "down", read: "mean", pct: 25, details: false });
  // a loaded ck: unknown choices back to their defaults, numbers clamped to the inputs' ranges
  function sanitizeKeptSettings(ck) {
    const d = KEPT_CK_DEF, pick = (v, list, dv) => list.includes(v) ? v : dv, num = (v, lo, hi, dv) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dv;
    return { x: num(ck.x, -300, 100, d.x), tp: num(ck.tp, 0, 95, d.tp), sl: num(ck.sl, 0, 1000, d.sl), show: pick(ck.show, KEPT_SHOWN.map(k => k[0]), d.show), src: pick(ck.src, ["rv", "iv", "typed"], d.src), vol: num(ck.vol, 1, 400, d.vol), gapP: num(ck.gapP, 0, 100, d.gapP), gapS: num(ck.gapS, 0, 95, d.gapS), gapSide: pick(ck.gapSide, ["down", "either"], d.gapSide), read: pick(ck.read, ["mean", "median", "pct"], d.read), pct: num(ck.pct, 1, 99, d.pct), details: ck.details === true };
  }
  const ordinal = n => { const k = Math.round(n), tens = k % 100; return k + (tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"); };
  // results per engine run (a new R.main whenever any engine input changes) and per setting of this view
  const keptMemo = new WeakMap();
  // one cycle's option legs, per share (−1 short, +1 long): covered calls the call (and the put when on); strangles both
  // legs and the wings
  function cycleLegs(row, run) {
    const legs = [{ K: row.Kc, cp: "C", qty: -1 }, { K: row.Kp, cp: "P", qty: -1 }];
    if (run.fam !== "cc") { legs.push({ K: row.Kwc, cp: "C", qty: 1 }, { K: row.Kwp, cp: "P", qty: 1 }); }
    return legs.filter(l => l.K > 0);
  }
  // how the run is sized, from the engine's first cycle: option shares per NAV dollar, the fill's haircut on the credit,
  // the shares' leverage (covered calls), and whether counts stay fixed (the credit kept as cash)
  function readSizing(R, first) {
    const r0 = R.main.rows[0], cc = R.run.fam === "cc", count = cc ? r0.calls : r0.k, cap0 = ys.sc.cap0;
    const perNav = count > 0 ? 100 * count / cap0 : 0, fillCredit = count > 0 ? r0.credit / (100 * count) : 0;
    return { cc, perNav, haircut: first.credit > 0 ? Math.max(0, 1 - fillCredit / first.credit) : 0, leverage: cc ? r0.lam : 0, isFixed: R.run.modus.credit === "cash", S0: r0.S0 };
  }
  // the account's return over one cycle at price S (per NAV dollar at the cycle start, or per starting dollar when the
  // counts are fixed): the shares' move plus the options at mid less the haircut on the credit; the option count per
  // dollar follows the engine (∝ 1/price, except fixed covered calls whose calls stay the same)
  function cycleAccount({ row, position, sizing }) {
    const countScale = sizing.cc && sizing.isFixed ? 1 : sizing.S0 / row.S0, optionShare = sizing.perNav * countScale;
    const shareWeight = sizing.isFixed ? sizing.leverage * row.S0 / sizing.S0 : sizing.leverage;
    const cost = sizing.haircut * position.credit;
    return { optionShare, shareWeight, cost, returnAt: S => shareWeight * (S / row.S0 - 1) + optionShare * (position.payoff(S) - cost), returnFor: (kept, max, priceRatio) => shareWeight * (priceRatio - 1) + optionShare * (kept * max - cost) };
  }
  const meanPriceRatio = (scenario, S0) => { let m = 0; for (let i = 0; i < scenario.S.length; i++) { m += scenario.w[i] * scenario.S[i]; } return m / S0; };
  // a cycle the horizon cuts short is held for its share of the days and marked at the rest (as the engine does)
  function readHolding(row) {
    const natural = Math.max(1, Math.round(row.days / 7)), weeks = row.w1 - row.w0;
    const heldDays = weeks < natural - 0.5 ? Math.max(1, Math.round(row.days * weeks / natural)) : row.days;
    return { heldDays, tauLeft: (row.days - heldDays) / 365 };
  }
  // the custom variant's scenario for one cycle
  function keptCustomScenario(row, heldDays) {
    const ck = ys.ck, vol = ck.src === "iv" ? row.iv : ck.src === "typed" ? ck.vol / 100 : row.rv;
    const base = CAPTURE.lognormal({ S0: row.S0, vol: Math.max(vol, 1e-4), years: heldDays / 365, mu: Math.log(row.S1 / row.S0) });
    return CAPTURE.withGap({ scenario: base, chance: ck.gapP / 100, size: ck.gapS / 100, side: ck.gapSide });
  }
  const readKeptCustom = measured => ys.ck.read === CAPTURE.Reading.Median ? measured.median : ys.ck.read === CAPTURE.Reading.Percentile ? measured.quantile(ys.ck.pct / 100) : measured.mean;
  // every cycle of one run: its position, maximum, readings at the moves vol, the account's growth, the custom reading
  function readCycles(R) {
    const rows = R.main.rows, run = R.run, r0 = rows[0];
    const first = CAPTURE.fromLegs({ S0: r0.S0, days: r0.days, iv: r0.iv, rate: 0, legs: cycleLegs(r0, run), price: COMPOUND_ENGINE.bs });
    const sizing = readSizing(R, first);
    return rows.map(row => {
      const position = CAPTURE.fromLegs({ S0: row.S0, days: row.days, iv: row.iv, rate: 0, legs: cycleLegs(row, run), price: COMPOUND_ENGINE.bs });
      const maxResult = CAPTURE.findMaxPayoff(position);
      if (!maxResult.ok) { return { row, na: maxResult.error.message }; }
      const max = maxResult.value, holding = readHolding(row);
      const pnl = holding.tauLeft > 0 ? S => position.value(S, holding.tauLeft) : position.payoff;
      const scenario = CAPTURE.lognormal({ S0: row.S0, vol: Math.max(row.rv, 1e-4), years: holding.heldDays / 365, mu: Math.log(row.S1 / row.S0) });
      const measured = CAPTURE.measure({ pnl, scenario, maxPayoff: max });
      const account = cycleAccount({ row, position: Object.assign({}, position, { payoff: pnl }), sizing });
      const growth = sizing.isFixed ? null : CAPTURE.growth({ pnl: account.returnAt, scenario, capitalPerShare: 1, maxPayoff: 1 }).value;
      const customScenario = keptCustomScenario(row, holding.heldDays), custom = CAPTURE.measure({ pnl, scenario: customScenario, maxPayoff: max });
      return { row, position, max, measured, account, growth, priceRatio: meanPriceRatio(scenario, row.S0), custom: readKeptCustom(custom), customMeasured: custom, customPriceRatio: meanPriceRatio(customScenario, row.S0) };
    });
  }
  // cycle 1's slower readings: the time path, the managed rule (centred on the path), the past moves
  function readFirstCycle(c1, run) {
    if (!c1 || c1.na) { return null; }
    const p = c1.position, x = ys.ck.x / 100, mu = Math.log(c1.row.S1 / c1.row.S0);
    const time = CAPTURE.timePath({ value: p.value, S0: p.S0, years: p.years, days: p.days, maxPayoff: c1.max, x });
    const managed = CAPTURE.managed({ value: p.value, payoff: p.payoff, S0: p.S0, years: p.years, days: p.days, vol: Math.max(c1.row.rv, 1e-4), maxPayoff: c1.max, takeProfit: ys.ck.tp / 100, stopLoss: ys.ck.sl / 100, mu, paths: KEPT_CONFIG.managedPaths });
    const closes = typeof CAPTURE_VIEW !== "undefined" ? CAPTURE_VIEW.closesFor(run.tk) : [];
    const past = CAPTURE.fromCloses({ S0: p.S0, closes, days: p.days });
    const empirical = past.ok ? Result.ok(CAPTURE.measure({ pnl: p.payoff, scenario: past.value, maxPayoff: c1.max })) : past;
    return { time, managed, empirical };
  }
  // the growth-equivalent share of one cycle: the fixed share whose return (on the same footing as Expected: the
  // shares at their scenario mean, the haircut on the credit) equals e^(log growth) − 1
  const growthShare = c => c.growth && !c.growth.isRuinous && c.account.optionShare > 0 ? (Math.exp(c.growth.logMean) - 1 - c.account.shareWeight * (c.priceRatio - 1) + c.account.optionShare * c.account.cost) / (c.account.optionShare * c.max) : NaN;
  // the share each preset keeps in a cycle (NaN where a preset has no per-cycle share)
  function keptShare(id, cycle, first) {
    if (id === CAPTURE.Preset.Fixed) { return ys.ck.x / 100; }
    if (id === CAPTURE.Preset.Expected) { return cycle.measured.mean; }
    if (id === CAPTURE.Preset.Median) { return cycle.measured.median; }
    if (id === CAPTURE.Preset.Managed) { return first && first.managed.ok ? first.managed.value.mean : NaN; }
    if (id === CAPTURE.Preset.Empirical) { return first && first.empirical.ok ? first.empirical.value.mean : NaN; }
    if (id === CAPTURE.Preset.Custom) { return cycle.custom; }
    if (id === CAPTURE.Preset.Growth) { return growthShare(cycle); }
    return NaN;
  }
  // the price ratio each preset's shares move by: the scenario mean (Fixed, Expected, Managed: the same spread; the
  // variant: its own spread, the gap included), so the presets' NAVs compare on one footing
  const priceRatioFor = (id, c) => id === CAPTURE.Preset.Custom ? c.customPriceRatio : c.priceRatio;
  // NAV by week if every cycle kept its preset share; null where the preset does not compound to anything
  function projectNav(id, cycles, first, isFixed) {
    const doesNotCompound = (id === CAPTURE.Preset.Custom && ys.ck.read !== CAPTURE.Reading.Mean) || (id === CAPTURE.Preset.Growth && isFixed);
    if (doesNotCompound) { return null; }
    const cap0 = ys.sc.cap0;
    let nav = cap0;
    const pts = [[0, nav]];
    for (const c of cycles) {
      if (c.na) { return null; }
      if (id === CAPTURE.Preset.Growth) {
        if (!c.growth || c.growth.isRuinous) { return null; }
        nav *= Math.exp(c.growth.logMean);
      } else {
        const kept = keptShare(id, c, first);
        if (!Number.isFinite(kept)) { return null; }
        const r = c.account.returnFor(kept, c.max, priceRatioFor(id, c));
        nav = isFixed ? Math.max(0, nav + cap0 * r) : nav * Math.max(0, 1 + r);
      }
      pts.push([Math.min(c.row.w1, ys.sc.W), nav]);
    }
    return pts;
  }
  function readKept(R) {
    const key = JSON.stringify([ys.ck, ys.sc.cap0, typeof CAPTURE_VIEW !== "undefined" ? CAPTURE_VIEW.readClosesVersion() : 0]);
    let byKey = keptMemo.get(R.main);
    if (!byKey) { byKey = new Map(); keptMemo.set(R.main, byKey); }
    const cached = byKey.get(key);
    if (cached) { return Object.assign({}, cached, { R }); }
    const cycles = readCycles(R), first = readFirstCycle(cycles[0], R.run), isFixed = R.run.modus.credit === "cash";
    const result = { R, cycles, first, isFixed, nav: Object.fromEntries(KEPT_SHOWN.map(([id]) => [id, projectNav(id, cycles, first, isFixed)])) };
    byKey.clear(); byKey.set(key, result);
    return result;
  }
  // one preset's cell for one run: cycle 1's reading, and the NAV at the last week
  function describeKeptCell(preset, K) {
    const c1 = K.cycles[0], first = K.first, x = ys.ck.x / 100;
    if (!c1 || c1.na) { return { text: "–", sub: c1 ? c1.na : "", nav: "" }; }
    const end = K.nav[preset.id], navWord = preset.id === CAPTURE.Preset.Growth && K.isFixed ? "" : NAV_WORD[preset.id];
    const nav = end ? `${f$(end[end.length - 1][1])}${navWord ? `<span class="cps">${navWord}${K.isFixed ? ", added up (fixed size)" : ""}</span>` : ""}` : "";
    const share = keptShare(preset.id, c1, first);
    if (preset.id === CAPTURE.Preset.Fixed) { return { text: fPs(x, 0), sub: `cycle 1 keeps that often: ${fPc(c1.measured.oddsAtLeast(x), 0)}`, nav }; }
    if (preset.id === CAPTURE.Preset.OddsAtLeast) { return { text: fPc(c1.measured.oddsAtLeast(x), 1), sub: `profit ${fPc(c1.measured.oddsAtLeast(0), 0)}`, nav: "" }; }
    if (preset.id === CAPTURE.Preset.TimePath) { return first ? { text: `${fPs(first.time.atHalf)} half-way`, sub: Number.isFinite(first.time.dayToX) ? `x kept on day ${first.time.dayToX.toFixed(1)} of ${first.time.days}` : "x not kept before expiry", nav: "" } : { text: "–", nav: "" }; }
    if (preset.id === CAPTURE.Preset.Managed && first && first.managed.ok) { const m = first.managed.value; return { text: `${fPs(share)} <small>±${(m.error * 100).toFixed(1)}</small>`, sub: `take profit ${fPc(m.takeProfitShare, 0)} · ${m.meanDays.toFixed(1)} of ${m.days} days`, nav }; }
    if (preset.id === CAPTURE.Preset.Empirical && first && !first.empirical.ok) { return { text: "needs closes", sub: esc(first.empirical.error.message), nav: "" }; }
    if (preset.id === CAPTURE.Preset.Growth) {
      if (K.isFixed) { return { text: "–", sub: "the credit is kept as cash: the size stays fixed and nothing compounds", nav: "" }; }
      if (!c1.growth) { return { text: "–", nav: "" }; }
      if (c1.growth.isRuinous) { return { text: "ends at zero", tone: "neg", alert: describeKeptSurvival(c1.growth.survivalScale, K.R.run), sub: `at this size the account is wiped out in ${fPc(c1.growth.ruin, 2)} of cycles`, nav: "" }; }
      return { text: fPs(share), sub: `${fPs(Math.exp(c1.growth.logMean) - 1, 2)} a cycle on the account`, nav };
    }
    if (preset.id === CAPTURE.Preset.Median) { return { text: fPs(share), sub: `average ${fPs(c1.measured.mean)}`, nav: `<span class="cps">does not compound: see Growth</span>` }; }
    if (preset.id === CAPTURE.Preset.Custom && !end) { return { text: fPs(share), sub: "", nav: `<span class="cps">a ${ys.ck.read === "median" ? "median" : "percentile"} does not compound</span>` }; }
    return { text: fPs(share), sub: "", nav };
  }
  // the next step after a wipe-out: the size per dollar of the account that survives (CAPTURE's survivalScale)
  // in the run's own size unit: margin used for a strangle, leverage for covered calls
  const describeKeptSurvival = (scale, run) => SURVIVAL.line({ scale, test: `with wipe-out odds under ${SURVIVAL.oddsWords(CAPTURE.CONFIG.ruinShown)}`,
    size: !(scale > 0) || !Number.isFinite(scale) ? "" : run.fam === "cc" ? `≤ ${SURVIVAL.floor2(scale * run.lev)}× leverage` : `≤ ${Math.floor(scale * run.use * 100)}% of margin used` });
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const keptTone = v => !Number.isFinite(v) ? "" : v > 0.0005 ? "pos" : v < -0.0005 ? "neg" : "";
  function renderKeptTable(kepts) {
    const runs = kepts.map(([who, K]) => ({ who, K, c1: K.cycles[0] }));
    q("#y-khead").innerHTML = runs.map(({ who, K, c1 }) => !c1 || c1.na ? `<span class="key ${who.toLowerCase()}">${who}</span> n/a` :
      `<span class="key ${who.toLowerCase()}">${who}</span><b>${esc(runName(K.R.run))}</b> · cycle 1: ${c1.position.strikes.map((K_, i) => fKs(K_) + cycleLegs(c1.row, K.R.run)[i].cp).join(" / ")}, ${c1.row.days} days<span class="xdet">, maximum ${fKs(c1.max)} a share (${fPc(c1.max / c1.row.S0, 2)} of the price) · pricing IV ${fPc(c1.row.iv, 0)}, moves ${fPc(c1.row.rv, 0)} · credit ${fPc(c1.account.optionShare * c1.max, 2)} of NAV a cycle${c1.account.cost > 0 ? ` (${fPc(c1.account.cost / c1.position.credit, 1)} of it lost to the fill)` : ""}</span>`).join("<br>");
    const head = `<tr><th>Preset</th>${runs.map(({ who }) => `<th><span class="key ${who.toLowerCase()}">${who}</span> kept a cycle</th><th>NAV week ${ys.sc.W}</th>`).join("")}</tr>`;
    const shownIds = KEPT_SHOWN.map(k => k[0]);
    const rows = KEPT_PRESETS.map(p => {
      const name = `<b>${esc(p.name)}</b>${KNOBS.html({ id: `kept-${p.id}`, title: p.name, body: p.knob })}<span class="cap">${esc(p.line.replace(/\{x\}/g, `${ys.ck.x}%`))}</span>${p.tex ? `<span class="ftex">${TEX.html(p.tex)}</span>` : ""}`;
      const cells = runs.map(({ K }) => { const c = describeKeptCell(p, K), share = K.cycles[0] && !K.cycles[0].na ? keptShare(p.id, K.cycles[0], K.first) : NaN; return `<td><span class="cv ${c.tone || (p.id === CAPTURE.Preset.OddsAtLeast || p.id === CAPTURE.Preset.TimePath ? "" : keptTone(share))}">${c.text}</span>${c.alert ? `<span class="cpa">${c.alert}</span>` : ""}${c.sub ? `<span class="cps">${c.sub}</span>` : ""}</td><td class="knav">${c.nav}</td>`; }).join("");
      const isShown = shownIds.includes(p.id);
      return `<tr data-preset="${p.id}" class="${p.id === ys.ck.show ? "kon" : ""}${isShown ? " kpick" : ""}"${isShown ? ` title="Show this preset on the NAV chart"` : ""}><td>${name}</td>${cells}</tr>`;
    }).join("");
    const reference = (label, pick) => `<tr class="kref"><td>${label}</td>${runs.map(({ K }) => `<td></td><td class="knav">${pick(K.R)}</td>`).join("")}</tr>`;
    q("#y-ktable").classList.toggle("one", runs.length === 1);
    q("#y-ktable").innerHTML = `<thead>${head}</thead><tbody>${rows}${reference("<b>Full model</b><span class=\"cap\">the Weeks view: moves, margin calls, assignment, interest and costs</span>", R => `${f$(R.main.end.med)}<span class="cps">typical · log-average ${f$(R.main.end.geo)}</span>`)}${reference("<b>Exactly on the path</b><span class=\"cap\">no moves around the path: every credit kept</span>", R => f$(R.exact.end.med))}</tbody>`;
  }
  // NAV by week for the shown preset (A and B), with the full model's typical NAV faint behind
  function renderKeptChart(kepts) {
    const host = q("#y-kchart"); host.innerHTML = "";
    const id = ys.ck.show, word = (KEPT_SHOWN.find(k => k[0] === id) || KEPT_SHOWN[0])[1].toLowerCase(), W = ys.sc.W, Wd = Math.max(480, host.clientWidth), H = 240, l = 64, r = 96, pw = Wd - l - r, X = w => l + w / W * pw;
    const lines = kepts.map(([who, K]) => ({ cls: who.toLowerCase(), who, pts: K.nav[id], model: [[0, ys.sc.cap0], ...K.R.main.rows.map(row => [Math.min(row.w1, W), row.med])] }));
    const values = lines.flatMap(L => [...(L.pts || []), ...L.model].map(p => p[1])).filter(v => v > 0);
    if (!values.length) { host.innerHTML = `<span class="cap">This preset has no share per cycle to compound.</span>`; return; }
    const lo = Math.log(Math.min(...values) * 0.95), hi = Math.log(Math.max(...values) * 1.05), Y = v => 8 + (hi - Math.log(Math.max(v, 1e-9))) / (hi - lo) * (H - 30);
    const s = sv("svg", { width: Wd, height: H, viewBox: `0 0 ${Wd} ${H}` }, host), ax = sv("g", { class: "yax" }, s);
    { const TK = niceTicks(Math.exp(lo), Math.exp(hi), 4), fa = axis$(TK); for (const t of TK) { if (t <= 0) { continue; } sv("line", { x1: l, x2: l + pw, y1: Y(t), y2: Y(t) }, ax); st_(ax, l - 6, Y(t) + 3.5, fa(t), { "text-anchor": "end" }); } }
    for (const w of weekTicks(W, pw)) { st_(ax, X(w), H - 6, fD(COMPOUND_ENGINE.weekDate(w)), { "text-anchor": tickAnchor(X(w), l, l + pw) }); }
    const path = pts => pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("");
    for (const L of lines) { sv("path", { d: path(L.model), fill: "none", stroke: `var(--${L.cls})`, "stroke-width": 1.2, "stroke-opacity": .35, "stroke-dasharray": "4 3" }, s); }
    for (const L of lines) {
      if (!L.pts) { continue; }
      sv("path", { d: path(L.pts), fill: "none", stroke: `var(--${L.cls})`, "stroke-width": 2 }, s);
      const last = L.pts[L.pts.length - 1]; st_(s, X(last[0]) + 4, Y(last[1]) + 4, `${L.who} ${f$(last[1])}`, { class: "yhalo", fill: `var(--${L.cls})`, "font-size": 11, "font-weight": 600 });
    }
    const weeks = [...new Set(lines.flatMap(L => [...(L.pts || []), ...L.model].map(p => p[0])))].sort((a, b) => a - b);
    const valueAt = (pts, w) => { let v = NaN; for (const p of pts || []) { if (p[0] <= w + 1e-9) { v = p[1]; } } return v; };
    attachCursor({ svg: s, left: l, width: pw, top: 8, bottom: H - 22, xs: weeks, toPx: X,
      tipAt: w => `<span class="h">Week ${Math.round(w)} · ${fD(COMPOUND_ENGINE.weekDate(Math.round(w)))}</span>` + lines.map(L => tipRow(L.cls, `${L.who} ${word} · full model`, `${L.pts ? f$(valueAt(L.pts, w)) : "–"} · ${f$(valueAt(L.model, w))}`)).join("") });
    AXES.attach({ svg: s, orient: "x", band: { x: l, y: H - 22, width: pw, height: 22 }, guide: { from: 8, to: H - 22 }, toValue: px => Math.round(Math.min(W, Math.max(0, (px - l) / pw * W))), toPx: X, describe: describeWeekOnAxis });
  }
  function describeKeptCustom(kepts) {
    const ck = ys.ck, vol = ck.src === "iv" ? "each cycle's pricing IV" : ck.src === "typed" ? `${ck.vol}% vol` : "the run's realized vol";
    const gap = ck.gapP > 0 && ck.gapS > 0 ? `, plus a ${ck.gapP}% chance a cycle of a ${ck.gapS}% gap ${ck.gapSide === CAPTURE.GapSide.Either ? "either way" : "down"}` : "";
    const reading = ck.read === CAPTURE.Reading.Median ? "the median" : ck.read === CAPTURE.Reading.Percentile ? `the ${ordinal(ck.pct)} percentile` : "the average";
    const out = kepts.map(([who, K]) => { const c1 = K.cycles[0], end = K.nav[CAPTURE.Preset.Custom]; return !c1 || c1.na ? "" : `<span class="ccv"><span class="key ${who.toLowerCase()}">${who}</span><b class="${keptTone(c1.custom)}">${fPs(c1.custom)}</b><span class="muted"> cycle 1 · NAV week ${ys.sc.W} ${end ? f$(end[end.length - 1][1]) : "– (does not compound)"}</span></span>`; }).join("");
    return `${out}<span class="cap">${esc(`${reading} of a lognormal around the path at ${vol}${gap}, every cycle held to expiry`)}.</span>`;
  }
  function renderKept() {
    const kepts = [["A", RES.A], RES.B ? ["B", RES.B] : null].filter(Boolean).map(([who, R]) => [who, readKept(R)]);
    q("#y-kp").classList.toggle("nodetail", !ys.ck.details);
    q("#y-kdet").textContent = ys.ck.details ? "hide formulas and details ▾" : "show formulas and details ▸";
    renderKeptTable(kepts); renderKeptChart(kepts);
    q("#y-kcout").innerHTML = describeKeptCustom(kepts);
    q("#y-kchartt").textContent = `NAV if every cycle kept: ${(KEPT_SHOWN.find(k => k[0] === ys.ck.show) || KEPT_SHOWN[0])[1].toLowerCase()}`;
  }
  function buildKeptControls() {
    numY(q("#y-kx"), () => ys.ck.x, v => { ys.ck.x = v; }, { min: -300, max: 100 });
    q("#y-kdet").onclick = () => { ys.ck.details = !ys.ck.details; schedule(10); };
    numY(q("#y-ktp"), () => ys.ck.tp, v => { ys.ck.tp = v; }, { min: 0, max: 95 });
    numY(q("#y-ksl"), () => ys.ck.sl, v => { ys.ck.sl = v; }, { min: 0, max: 1000 });
    segY(q("#y-kshow"), KEPT_SHOWN.map(([v, l]) => [v, l]), () => ys.ck.show, v => { ys.ck.show = v; });
    segY(q("#y-ksrc"), [["rv", "realized vol"], ["iv", "pricing IV"], ["typed", "typed"]], () => ys.ck.src, v => { ys.ck.src = v; });
    numY(q("#y-kvol"), () => ys.ck.vol, v => { ys.ck.vol = v; }, { min: 1, max: 400 });
    numY(q("#y-kgapp"), () => ys.ck.gapP, v => { ys.ck.gapP = v; }, { min: 0, max: 100 });
    numY(q("#y-kgaps"), () => ys.ck.gapS, v => { ys.ck.gapS = v; }, { min: 0, max: 95 });
    segY(q("#y-kgapside"), [["down", "down"], ["either", "either way"]], () => ys.ck.gapSide, v => { ys.ck.gapSide = v; });
    segY(q("#y-kread"), [["mean", "average"], ["median", "median"], ["pct", "percentile"]], () => ys.ck.read, v => { ys.ck.read = v; });
    numY(q("#y-kpct"), () => ys.ck.pct, v => { ys.ck.pct = v; }, { min: 1, max: 99 });
    SY.push(() => { q("#y-kvolw").hidden = ys.ck.src !== "typed"; q("#y-kpctw").hidden = ys.ck.read !== "pct"; });
    // a row of a compounding preset picks what the NAV chart shows
    q("#y-ktable").onclick = ev => { const tr = ev.target.closest("tr.kpick[data-preset]"); if (!tr) { return; } ys.ck.show = tr.dataset.preset; schedule(10); };
  }

  // ---------------------------------------------------------- notes
  function renderNotes() {
    q("#y-notesb").innerHTML = `<h3>The reading of your path</h3><p>The path is ${"KORU"}'s typical (median) price each week; it never falls. In each cycle the end price is spread lognormally around the path's next price at the realized-moves number. Premium is priced with Black-Scholes at the IV input (4% rate). The gap between IV and realized moves is the edge; with realized moves at 0 every result collapses to the literal toy ("exactly on the path").</p>
      <h3>Strikes and contracts</h3><p>Each cycle picks the listed strike whose Δ is nearest the target, on a $1 grid unless the ticker is set to $0.50 in Costs and rates. Ties go further from the money. Contracts and shares are whole; covered calls need full 100-share lots. Δ runs to 90 on either leg; above 50 a leg is in the money, and two legs above 50 make a short guts (the put above the call). Ratios use time value, so intrinsic value never inflates the yield.</p>
      <h3>Margin (IBKR, leveraged ETFs)</h3><p>Shares: 25% × the leverage factor, initial and maintenance alike (KORU 75%, RAM 50%), so ${"1/m"} is the most leverage (KORU 1.33x) and the last dollar of buying power has no cushion. Naked options: the Reg T percentages × the leverage factor (KORU 60% / 30%). Equity with loan value leaves US options out. Margin is checked daily (the trigger is shifted by one daily move).</p>
      <h3>Modus operandi</h3><p><b>Reinvest</b>: the kept credit × leverage buys more shares at expiry; leverage drifts up after drops and down after rallies. <b>Rebalance</b>: shares return to target leverage each expiry. <b>Keep as cash</b>: the baseline. <b>Only what IBKR requires</b>: after a margin call the account rides the limit, selling as it makes new lows (equity ∝ price^(1/m)), then holds from the cycle's low; computed from the joint odds of each cycle's low and close. <b>Back to a target</b>: sell down to the target leverage at the trigger. Strangles are closed at the trigger under both rules (an approximation for the IBKR rule).</p>
      <h3>Typical, average and the bands</h3><p>The engine carries the distribution of ln NAV week by week (a lattice over leverage for share runs) and reads the median and 10%/90% from its first three moments. "Average" is the mean NAV. Margin-call odds are the share of outcomes with at least one call. Each cycle is independent given its start; correlation between two tickers is not modelled, so A and B are never compared path by path.</p>
      <h3>Not modelled</h3><p>Early assignment, dividends, IV changes within a cycle, the skew (flat IV across strikes), trading halts, gaps beyond the lognormal spread (see the Stress view), IBKR's own choice of what to liquidate, portfolio margin.</p>`;
  }

  // ---------------------------------------------------------- reading / stack menus
  function buildMenus() {
    q("#y-readmb").innerHTML = `<span class="mt">How results are read</span><span class="mrow"><span class="lbl">Main number and line</span><span class="seg" id="y-rd"></span></span><span class="cap">Typical = the median outcome. Average is pulled up by the best outcomes.</span>`;
    segY(q("#y-rd"), [["typ", "Typical"], ["avg", "Average"]], () => ys.view.reading, v => ys.view.reading = v);
    q("#y-stackmb").innerHTML = `<span class="mt">Chart display</span><span class="mrow"><span class="lbl">10%–90% band</span><span class="seg" id="y-band"></span></span>
      <span class="mrow"><label class="chk"><input type="checkbox" id="y-exact">exactly on the path (dashed)</label></span><span class="mrow"><label class="chk"><input type="checkbox" id="y-wig">realized-move band on the price</label></span>`;
    segY(q("#y-band"), [["off", "Off"], ["a", "A"], ["b", "B"], ["both", "Both"]], () => ys.view.band, v => ys.view.band = v);
    const ex = q("#y-exact"); ex.onchange = () => { ys.view.exact = ex.checked; schedule(10); }; SY.push(() => ex.checked = ys.view.exact);
    const wg = q("#y-wig"); wg.onchange = () => { ys.view.wiggle = wg.checked; schedule(10); }; SY.push(() => wg.checked = ys.view.wiggle);
  }


  // ============================================================ Stress view
  const SS0 = { shape: "gap", X: -35, unit: "etf", k: 3, n: 4, back: 2, arrive: "gap", week: "worst", land: 0, ivDown: 10, ivUp: 5, ivCap: 250, mAfter: 0, slipSh: 1, slipOptK: 2 };
  const ssOf = () => { if (!ys.ss) ys.ss = { ...SS0 }; return ys.ss; };
  const scenOf = () => { const S = ssOf(); return { shape: S.shape, X: S.X / 100, unit: S.unit, k: S.k, n: S.n, back: S.back, arrive: S.shape === "dd" ? "spread" : S.arrive, land: S.land }; };
  const rulesOf = tk => { const S = ssOf(); return { ivDown: S.ivDown / 100, ivUp: S.ivUp / 100, ivCap: S.ivCap / 100, mAfter: S.mAfter > 0 ? S.mAfter / 100 : ys.costs.mOvr[tk], slipSh: S.slipSh / 100, slipOptK: S.slipOptK }; };
  const scenTxt = () => { const S = ssOf(), x = `${S.X > 0 ? "+" : S.X < 0 ? MIN : ""}${Math.abs(S.X)}%${S.unit === "index" ? " on the index" : ""}`;
    return S.shape === "gap" ? `gap ${x}` : S.shape === "run" ? `${S.k} weekly gaps of ${x}` : S.shape === "dd" ? `drawdown ${x} over ${S.n} weeks` : `spike ${x}, back after ${S.back} sessions`; };
  let SRES = null;
  function computeStress() {
    const S = ssOf(), scen = scenOf(), W = ys.sc.W, out = {};
    for (const who of ["A", "B"]) { const R = RES[who]; if (!R) continue;
      const main = { ...R.main, run: R.run }, sc = { cap0: ys.sc.cap0, W, mult: RES.mult }, costs = costsOf(), rules = rulesOf(R.run.tk);
      const snaps = Array.from({ length: W }, (_, w) => COMPOUND_STRESS.snapshot(main, w, sc, costs));
      const by = snaps.map(sn => { const r = COMPOUND_STRESS.run(sn, scen, rules, costs); return { w: sn.w + 1, nav: r.navBefore, loss: r.lossEnd, lossLow: r.lossLow, call: r.ev.call, wiped: r.ev.wiped, deficit: r.ev.deficit, r }; });
      const rooms = snaps.map(sn => COMPOUND_STRESS.room(sn, rules, costs));
      out[who] = { R, snaps, by, rooms, rules, costs };
    }
    // the chosen week: fixed, or the week of A's largest $ loss
    let wk = S.week === "worst" ? out.A.by.reduce((b, x) => x.loss > b.loss ? x : b, out.A.by[0]).w : Math.min(W, Math.max(1, +S.week));
    out.week = wk;
    for (const who of ["A", "B"]) { const o = out[who]; if (!o) continue; const sn = o.snaps[wk - 1];
      o.cur = COMPOUND_STRESS.run(sn, scen, o.rules, o.costs); o.given = COMPOUND_STRESS.givenUp(sn, scen, o.rules, o.costs);
      o.curve = []; for (let m = -90; m <= 100; m += 2.5) { const r = COMPOUND_STRESS.run(sn, { shape: "gap", X: m / 100, unit: "etf" }, { ...o.rules }, o.costs); o.curve.push([m / 100, (r.navEnd - r.navBefore), !!r.ev.call, r.ev.wiped]); }
      o.room = o.rooms[wk - 1]; }
    return SRES = out;
  }
  function stressBar() {
    const S = ssOf(), L = COMPOUND_ENGINE.LEV[ys.A.tk];
    const one = S.unit === "index" ? Math.max(-1, L * S.X / 100) : S.X / L / 100;
    q("#y-seq").textContent = S.unit === "index" ? `= ${ys.A.tk} ${fPs(one, 1)} in a session` : `= index ${fPs(one, 1)} in one session`;
    const sh = q("#y-sshp"), sig = S.shape;
    if (sh.dataset.sig !== sig) { sh.dataset.sig = sig;
      sh.innerHTML = S.shape === "run" ? `<input type="number" id="y-sk" min="1" max="8" step="1" style="width:44px"> weeks · <span class="seg" id="y-sarr"></span>` : S.shape === "dd" ? `over <input type="number" id="y-sn" min="1" max="12" step="1" style="width:44px"> weeks` : S.shape === "spike" ? `back after <input type="number" id="y-sb" min="0" max="10" step="1" style="width:44px"> sessions` : "";
      if (q("#y-sk")) { numY(q("#y-sk"), () => S.k, v => S.k = Math.round(v), { min: 1, max: 8 }); segY(q("#y-sarr"), [["gap", "Monday gaps"], ["spread", "spread"]], () => S.arrive, v => S.arrive = v); }
      if (q("#y-sn")) numY(q("#y-sn"), () => S.n, v => S.n = Math.round(v), { min: 1, max: 12 });
      if (q("#y-sb")) numY(q("#y-sb"), () => S.back, v => S.back = Math.round(v), { min: 0, max: 10 }); }
    const sl = q("#y-sw"); sl.max = ys.sc.W; if (document.activeElement !== sl) sl.value = SRES ? SRES.week : 1;
    q("#y-swo").textContent = (S.week === "worst" ? "worst: " : "") + (SRES ? `${SRES.week} (${fD(COMPOUND_ENGINE.weekDate(SRES.week - 1))})` : "");
    q("#y-sworst").classList.toggle("on", S.week === "worst");
    const ivEnd = SRES && SRES.A.cur ? SRES.A.cur.ivEnd : null; q("#y-sivsum").innerHTML = ivEnd ? `IV → <b>${Math.round(ivEnd * 100)}%</b>` : "IV";
  }
  function buildStressBar() {
    const S = ssOf();
    segY(q("#y-sshape"), [["gap", "Gap"], ["run", "Run"], ["dd", "Drawdown"], ["spike", "Spike"]], () => S.shape, v => { S.shape = v; if (v === "spike" && S.X < 0) S.X = 45; if (v !== "spike" && S.X > 0 && v !== "gap") S.X = -20; if (v === "dd") S.X = -60; if (v === "run") S.X = -20; });
    numY(q("#y-sX"), () => S.X, v => S.X = Math.max(-100, Math.min(300, v)));
    segY(q("#y-sunit"), [["etf", "ETF", "The move in the ETF itself (KORU or RAM)"], ["index", "index", "A one-session move in the index; the ETF moves by its leverage with the daily reset"]], () => S.unit, v => S.unit = v);
    const sl = q("#y-sw"); sl.oninput = () => { S.week = +sl.value; schedule(60); };
    q("#y-sworst").onclick = () => { S.week = "worst"; schedule(10); };
    q("#y-sivmb").innerHTML = `<span class="mt">IV after the move (marks the open options)</span><span class="mrow"><span class="lbl">Points of IV per 10% drop</span><input type="number" id="y-sivd" min="0" max="50" step="1"></span><span class="mrow"><span class="lbl">Points of IV per 10% rise</span><input type="number" id="y-sivu" min="0" max="50" step="1"></span><span class="mrow"><span class="lbl">Cap, %</span><input type="number" id="y-sivc" min="50" max="400" step="5"></span><span class="cap">Applies to the marks of open legs (and so to the margin requirement) and to any option sold during the move.</span>`;
    numY(q("#y-sivd"), () => S.ivDown, v => S.ivDown = v, { min: 0 }); numY(q("#y-sivu"), () => S.ivUp, v => S.ivUp = v, { min: 0 }); numY(q("#y-sivc"), () => S.ivCap, v => S.ivCap = v, { min: 50 });
    q("#y-srulesmb").innerHTML = `<span class="mt">Rules of the move (rarely changed)</span>
      <span class="mrow"><span class="lbl">Lands on</span><span class="seg" id="y-sland"></span></span>
      <span class="mrow"><span class="lbl">Forced-sale fills at the gap</span>shares ${MIN}<input type="number" id="y-sslip" min="0" max="10" step="0.5" style="width:46px">% · options mark + <input type="number" id="y-sopt" min="0" max="5" step="0.5" style="width:46px">× half-spread</span>
      <span class="mrow"><span class="lbl">Share maintenance after the move, % (0 = the run's)</span><input type="number" id="y-smaf" min="0" max="100" step="5" style="width:56px"></span>
      <span class="cap">On a margin call and during a multi-week move the account follows each run's Modus operandi (dock): <span id="y-smod"></span>.</span>`;
    segY(q("#y-sland"), ["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => [String(i), d]), () => String(S.land), v => S.land = +v);
    numY(q("#y-sslip"), () => S.slipSh, v => S.slipSh = v, { min: 0 }); numY(q("#y-sopt"), () => S.slipOptK, v => S.slipOptK = v, { min: 0 }); numY(q("#y-smaf"), () => S.mAfter, v => S.mAfter = v, { min: 0, max: 100 });
  }
  function renderStress() {
    computeStress(); stressBar();
    q("#y-smod").textContent = ["A", "B"].filter(w => RES[w]).map(w => `${w}: ${modusTxt(RES[w].run.modus)}`).join("; ");
    const runs = [["A", SRES.A], SRES.B ? ["B", SRES.B] : null].filter(Boolean), wk = SRES.week;
    // strip
    // one grid for both rows, so A and B line up; the deficit and upside-given-up columns appear for both rows when
    // either run has one ("–" for the other), and every label is one line (cut with …, full text in its title)
    const hasDef = runs.some(([, o]) => o.cur.ev.deficit > 0), hasGiven = runs.some(([, o]) => o.given > 1);
    const strip = q("#y-sstrip");
    strip.style.setProperty("--scols", ["24px", "minmax(226px,1.3fr)", "minmax(124px,.85fr)", "minmax(124px,.85fr)", "minmax(196px,1.6fr)", ...(hasDef ? ["minmax(130px,1fr)"] : []), ...(hasGiven ? ["minmax(130px,1fr)"] : [])].join(" "));
    strip.innerHTML = runs.map(([who, o]) => { const r = o.cur, nb = r.navBefore, cc = o.R.run.fam === "cc", sn = o.snaps[wk - 1];
      const used = COMPOUND_STRESS.margin(sn, sn.S, sn.iv, sn.el0 || 0, o.rules.mAfter), lev = cc ? sn.n * sn.S / Math.max(1, nb) : null;
      const label = (text, id, title, body) => `<span class="l" title="${esc(text)}">${KNOBS.label(text, { id: `ys-${id}`, title, body })}</span>`;
      const cell = (l, v, cls = "") => `<span class="cell ${cls}">${l}${v}</span>`;
      const pair = (frac, usd, tone) => `<span class="v ${tone}">${fPs(frac)} <small>${f$(usd)}</small></span>`;
      const callTxt = COMPOUND_STRESS.callWords(r, cc, fKs);
      return `<span class="sr"><span class="key ${who.toLowerCase()}">${who}</span>
        ${cell(label(`Before the move, week ${wk}`, "before", "Before the move", "The typical NAV at the start of the hit week, before the move. For covered calls the leverage is share value over NAV; the share of margin is the requirement over what the account may borrow against."), `<span class="v">${f$(nb)}</span><span class="sub">${cc ? `${lev.toFixed(2)}× leverage · ` : ""}${fPc(used.req / Math.max(1, used.elv), 0)} of margin used</span>`, "big")}
        ${cell(label("At the low", "low", "At the low", "The change in NAV at the worst price of the move, the options marked at the shocked IV. Margin calls are tested here."), pair(-r.lossLow / nb, -r.lossLow, r.lossLow > 0 ? "neg" : ""))}
        ${cell(label("End of the move", "end", "End of the move", "The change in NAV once the move is over, marked at the price it ends on. It sits above the low when the price comes back part of the way; a cut at the bottom locks the low in."), pair(-r.lossEnd / nb, -r.lossEnd, r.lossEnd > 0 ? "neg" : "pos"))}
        ${cell(label("Margin call", "call", "Margin call in the move", "The day and price of the first margin call inside the move, and what the broker does under the run's modus operandi: covered calls sell part of the shares (and the calls on them); strangles buy contracts back and sell any assigned shares."), `<span class="v two" title="${esc(callTxt)}">${callTxt}</span>`, "call")}
        ${hasDef ? cell(`<span class="l">Deficit</span>`, r.ev.deficit > 0 ? `<span class="v neg">you owe IBKR ${f$(r.ev.deficit)}</span>` : `<span class="v">–</span>`) : ""}
        ${hasGiven ? cell(`<span class="l" title="Upside given up (not a loss)">Upside given up (not a loss)</span>`, `<span class="v">${o.given > 1 ? f$(o.given) : "–"}</span>`) : ""}
        <span class="bd">${scenTxt()} · room this week: margin call at ${o.room.callDown != null ? fPs(o.room.callDown, 0) : "no drop"}${o.room.callUp != null ? ` or ${fPs(o.room.callUp, 0)}` : cc ? " (no call on rallies: the calls are covered)" : ""}, NAV 0 at ${o.room.zeroDown != null ? fPs(o.room.zeroDown, 0) : "no drop"}${o.room.zeroUp != null ? ` or ${fPs(o.room.zeroUp, 0)}` : ""} (the index ${o.room.callDown != null ? fPs(o.room.callDown / COMPOUND_ENGINE.LEV[o.R.run.tk], 1) : "–"} for the margin call)</span></span>`; }).join("");
    q("#y-sbwsub").textContent = `${scenTxt()} · click a week to inspect it`;
    // loss by week: $ and % stacked
    const host = q("#y-sbw"); host.innerHTML = ""; const Wd = Math.max(600, host.parentElement.clientWidth - 30), l = 62, rM = 110, pw = Wd - l - rM, W = ys.sc.W, X = w => l + (w - 1) / Math.max(1, W - 1) * pw;
    const mkChart = (H, valOf, fmt, title) => { const s = sv("svg", { width: Wd, height: H + 26, viewBox: `0 0 ${Wd} ${H + 26}` }, host); let lo = 0, hi = 0;
      for (const [, o] of runs) for (const b of o.by) { const v = valOf(b); lo = Math.min(lo, v); hi = Math.max(hi, v); } if (hi - lo < 1e-9) hi = lo + 1; const pad = (hi - lo) * 0.08; const Y = yLin(lo - pad, hi + pad, 16, H - 16);
      const ax = sv("g", { class: "yax" }, s); st_(s, l, 10, title, { "font-size": 11, fill: "var(--ink-2)" });
      { const TK = niceTicks(lo - pad, hi + pad, 4), fa = fmt === f$ ? axis$(TK) : fmt; for (const t of TK) { sv("line", { x1: l, x2: l + pw, y1: Y(t), y2: Y(t) }, ax); st_(ax, l - 6, Y(t) + 3.5, fa(t), { "text-anchor": "end" }); } }
      for (const w of weekTicks(W, pw)) if (w >= 1) st_(ax, X(w), H + 14, fD(COMPOUND_ENGINE.weekDate(w - 1)), { "text-anchor": tickAnchor(X(w), l, l + pw) });
      for (const [who, o] of runs) { const cls = who.toLowerCase(); let d = ""; o.by.forEach((b, i) => d += (i ? "L" : "M") + X(b.w) + "," + Y(valOf(b))); sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": 2 }, s);
        for (const b of o.by) { if (b.wiped) sv("circle", { cx: X(b.w), cy: Y(valOf(b)), r: 3.2, fill: "var(--neg)" }, s); else if (b.call) sv("circle", { cx: X(b.w), cy: Y(valOf(b)), r: 3, fill: "none", stroke: "var(--shade)", "stroke-width": 1.4 }, s); }
        const lb = o.by[o.by.length - 1]; st_(s, l + pw + 6, Y(valOf(lb)) + 4, `${who} ${fmt(valOf(lb))}`, { class: "yhalo", fill: `var(--${cls})`, "font-size": 11, "font-weight": 600 }); }
      sv("line", { x1: X(wk), x2: X(wk), y1: 14, y2: H - 10, stroke: "var(--ink-3)", "stroke-dasharray": "2 3" }, s);
      const hit = sv("rect", { x: l, y: 0, width: pw, height: H, fill: "transparent", style: "cursor:pointer" }, s);
      const cross = sv("line", { class: "ycross", y1: 14, y2: H - 10, visibility: "hidden" }, s); s.insertBefore(cross, hit);
      hit.addEventListener("pointerleave", () => cross.setAttribute("visibility", "hidden"));
      hit.addEventListener("pointermove", ev => { const rc = s.getBoundingClientRect(), w = Math.max(1, Math.min(W, Math.round((ev.clientX - rc.left - l) / pw * (W - 1)) + 1));
        cross.setAttribute("x1", String(X(w))); cross.setAttribute("x2", String(X(w))); cross.setAttribute("visibility", "visible");
        showTip(`<span class="h">Hits in week ${w} · ${fD(COMPOUND_ENGINE.weekDate(w - 1))}</span>` + runs.map(([who, o]) => { const b = o.by[w - 1]; return `<span class="r"><span class="k"><i class="sw" style="background:var(--${who.toLowerCase()})"></i>${who}: NAV ${f$(b.nav)}</span><span class="v neg">${f$(-b.loss)} (${fPs(-b.loss / b.nav)})</span></span>${b.call ? `<span class="s">margin call day ${b.call.day}${b.wiped ? " · wiped out" : ""}</span>` : ""}`; }).join(""), ev.clientX, ev.clientY); });
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("click", ev => { const rc = s.getBoundingClientRect(); ssOf().week = Math.max(1, Math.min(W, Math.round((ev.clientX - rc.left - l) / pw * (W - 1)) + 1)); schedule(10); }); };
    mkChart(220, b => -b.loss, f$, "Change in NAV, $ (amber ring = margin call, red dot = wiped out)");
    mkChart(110, b => -b.loss / b.nav, v => fPs(v, 0), "Change in NAV, % of NAV at that week");
    // room by week
    const rh = q("#y-sroom"); rh.innerHTML = ""; const H = 230, s = sv("svg", { width: Wd, height: H + 26, viewBox: `0 0 ${Wd} ${H + 26}` }, rh);
    let lo = -1, hi = 0; for (const [, o] of runs) for (const r of o.rooms) for (const k of ["callUp", "zeroUp"]) if (r[k] != null) hi = Math.max(hi, Math.min(r[k], 2));
    hi = Math.max(hi, 0.2); const Y = yLin(lo, hi * 1.05, 8, H - 12), ax = sv("g", { class: "yax" }, s);
    for (const t of niceTicks(lo, hi, 6)) { sv("line", { x1: l, x2: l + pw, y1: Y(t), y2: Y(t) }, ax); st_(ax, l - 6, Y(t) + 3.5, fPs(t, 0), { "text-anchor": "end" }); st_(ax, l + pw + 6, Y(t) + 3.5, "index " + fPs(t / COMPOUND_ENGINE.LEV[ys.A.tk], 0), {}); }
    for (const w of weekTicks(W, pw)) if (w >= 1) st_(ax, X(w), H + 14, fD(COMPOUND_ENGINE.weekDate(w - 1)), { "text-anchor": tickAnchor(X(w), l, l + pw) });
    sv("line", { x1: l, x2: l + pw, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, s);
    if (ys.A.tk === "KORU") for (const [v, t] of [[-0.353, "worst open gap, 3 Mar 26: −35.3%"], [-0.514, "worst week low: −51.4%"]]) { sv("line", { x1: l, x2: l + pw, y1: Y(v), y2: Y(v), stroke: "var(--warn)", "stroke-dasharray": "1 3" }, s); st_(s, l + 4, Y(v) - 3, t, { class: "yhalo", fill: "var(--warn)", "font-size": 10 }); }
    for (const [who, o] of runs) { const cls = who.toLowerCase();
      for (const [k, dash] of [["callDown", ""], ["zeroDown", "5 4"], ["callUp", ""], ["zeroUp", "5 4"]]) { let d = "", on = false; o.rooms.forEach((r, i) => { const v = r[k]; if (v == null || Math.abs(v) > 2) { on = false; return; } d += (on ? "L" : "M") + X(i + 1) + "," + Y(v); on = true; }); if (d) sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": dash ? 1.3 : 2, "stroke-dasharray": dash }, s); } }
    const roomTxt = v => v == null ? "none" : fPs(v, 0);
    attachCursor({ svg: s, left: l, width: pw, top: 8, bottom: H - 12, xs: Array.from({ length: W }, (_, i) => i + 1), toPx: X,
      tipAt: w => `<span class="h">Room in week ${w} · ${fD(COMPOUND_ENGINE.weekDate(w - 1))}</span>` + runs.map(([who, o]) => { const r = o.rooms[w - 1] || {}, cls = who.toLowerCase();
        return tipRow(cls, `${who} margin call at`, `${roomTxt(r.callDown)}${r.callUp != null ? ` / ${roomTxt(r.callUp)}` : ""}`) + tipRow(cls, `${who} NAV 0 at`, `${roomTxt(r.zeroDown)}${r.zeroUp != null ? ` / ${roomTxt(r.zeroUp)}` : ""}`); }).join("") });
    // curve at the chosen week + breakdown
    const ch = q("#y-scurve"); ch.innerHTML = `<h3>Loss against the size of a gap<span class="sub">week ${wk}, one-session gap in the ETF</span></h3>`; const Wc = Math.max(320, ch.getBoundingClientRect().width), Hc = 230, lc = 56, pc = Wc - lc - 16, sc_ = sv("svg", { width: Wc, height: Hc + 26, viewBox: `0 0 ${Wc} ${Hc + 26}` }, ch);
    let clo = 0, chi = 0; for (const [, o] of runs) for (const c of o.curve) { clo = Math.min(clo, c[1]); chi = Math.max(chi, c[1]); } const Xc = m => lc + (m + 0.9) / 1.9 * pc, Yc = yLin(clo * 1.05, chi * 1.1 + 1, 8, Hc - 12), axc = sv("g", { class: "yax" }, sc_);
    { const TK = niceTicks(clo, chi, 4), fa = axis$(TK); for (const t of TK) { sv("line", { x1: lc, x2: lc + pc, y1: Yc(t), y2: Yc(t) }, axc); st_(axc, lc - 6, Yc(t) + 3.5, fa(t), { "text-anchor": "end" }); } }
    for (const t of [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1]) st_(axc, Xc(t), Hc + 14, fPs(t, 0), { "text-anchor": "middle" });
    sv("line", { x1: Xc(0), x2: Xc(0), y1: 8, y2: Hc - 12, stroke: "var(--ink-3)" }, sc_); sv("line", { x1: lc, x2: lc + pc, y1: Yc(0), y2: Yc(0), stroke: "var(--ink-3)" }, sc_);
    for (const [who, o] of runs) { const cls = who.toLowerCase(); let d = ""; o.curve.forEach((c, i) => d += (i ? "L" : "M") + Xc(c[0]) + "," + Yc(c[1])); sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": 2 }, sc_);
      const lc_ = o.curve[o.curve.length - 1]; st_(sc_, Xc(lc_[0]) - 2, Yc(lc_[1]) - 6, who, { "text-anchor": "end", class: "yhalo", fill: `var(--${cls})`, "font-size": 11, "font-weight": 600 });
      const fc = o.curve.find(c => c[2] && c[0] < 0 && !o.curve.some(e => e[2] && e[0] > c[0] && e[0] < 0)); if (fc) sv("circle", { cx: Xc(fc[0]), cy: Yc(fc[1]), r: 3.5, fill: "none", stroke: "var(--shade)", "stroke-width": 1.6 }, sc_); }
    const gaps = [...new Set(runs.flatMap(([, o]) => o.curve.map(c => c[0])))].sort((a, b) => a - b);
    attachCursor({ svg: sc_, left: lc, width: pc, top: 8, bottom: Hc - 12, xs: gaps, toPx: Xc,
      tipAt: m => `<span class="h">ETF gap ${fPs(m, 1)} · week ${wk}</span>` + runs.map(([who, o]) => { const c = o.curve.find(e => Math.abs(e[0] - m) < 1e-9); return c ? tipRow(who.toLowerCase(), who, `${f$(c[1])}${c[2] ? " · call assigned" : ""}`) : ""; }).join("") });
    if (ssOf().shape === "gap") { const mv = ssOf().unit === "index" ? Math.max(-1, COMPOUND_ENGINE.LEV[ys.A.tk] * ssOf().X / 100) : ssOf().X / 100; sv("line", { x1: Xc(mv), x2: Xc(mv), y1: 8, y2: Hc - 12, stroke: "var(--ink)", "stroke-dasharray": "3 3" }, sc_); }
    // breakdown
    const bh = q("#y-sbreak"); bh.innerHTML = `<h3>What happened, week ${wk}<span class="sub">${scenTxt()}</span></h3>` + runs.map(([who, o]) => { const r = o.cur, nb = r.navBefore, sh = r.ev.pnlSh, opt = (r.navEnd - nb) - sh + r.ev.slip;
      return `<span class="ygc" style="display:block;margin-bottom:10px"><span class="key ${who.toLowerCase()}">${who}</span> <span class="f">NAV before          ${f$(nb).padStart(10)}
shares              ${f$(sh).padStart(10)}
options and cash    ${f$(opt).padStart(10)}
forced-sale fills   ${f$(-r.ev.slip).padStart(10)}
NAV after           ${f$(r.navEnd).padStart(10)}  (${fPs((r.navEnd - nb) / nb)})${o.given > 1 ? `\nupside given up     ${f$(o.given).padStart(10)}  (not a loss)` : ""}${r.ev.deficit > 0 ? `\ndeficit             ${f$(r.ev.deficit).padStart(10)}` : ""}</span></span>`; }).join("");
    q("#y-snotesb").innerHTML = `<p>The account hit is the typical account of the week-by-week engine at the chosen week: its shares, cash and this cycle's open legs. The move is a sequence of sessions; gaps land at the open. At each session every leg is marked (Black at the IV after the move, with the time left), IBKR's maintenance test runs (equity with loan value excludes US options; covered shares count at the lower of price and strike; naked legs use the Reg T percentages × the leverage factor), and on a breach the run's Modus operandi decides what is sold: only what IBKR requires (the smallest pro-rata fraction, whole units, rounded up) or back to the target leverage. Fills at the gap: shares at the price less the slippage, options at the mark plus a multiple of the half-spread. At expiry, in-the-money legs are assigned and the test runs again; the strategy then keeps trading or stops, as the run says. NAV below zero after everything is closed is a deficit owed to IBKR.</p>
      <p>Index moves convert through the fund's daily reset: one session of r on the index is max(0, 1 + L·r) − 1 for the ETF, so a −33.3% index session takes KORU to 0. KRX halts trading for 20 minutes at −8% and −15% on KOSPI and ends the session at −20% (each once a day), so one Korean session caps near KORU −60%; weekends and US holidays can stack sessions. Upside given up by covered calls is shown apart from losses: it is what the same shares alone would have gained above what the strategy made.</p>
      <p>Not modelled: trading halts, IBKR's own choice of what to liquidate, house margin changes unless set under Rules, intraday paths inside a session.</p>`;
  }

  // ---------------------------------------------------------- Random paths (Monte Carlo, opt-in, sliced on the main thread)
  let MC = { key: "", res: null, job: 0, prog: 0 };
  // the Monte Carlo inputs: the runs, this tab's state and the vol paths the runs read (the shared period vol lives
  // outside this tab's state, so a vol changed on Compare A vs B marks the last run stale; the IV path shapes them too)
  function mcKey() {
    const A = runA(), B = runB();
    const vols = [readRunVolPath({ run: A, slot: RunSlot.A }), B ? readRunVolPath({ run: B, slot: RunSlot.B }) : null];
    return JSON.stringify([A, B, ys.sc, ys.costs, ys.rates, ys.mc || {}, vols]);
  }
  function renderMCTools() {
    const M = ys.mc || (ys.mc = { paths: 2000, seed: 20261001 });
    q("#y-mctools").innerHTML = `<span class="ctl"><span class="lbl">Paths</span><span class="seg" id="y-mcn"></span></span><span class="ctl"><span class="lbl">Seed</span><input type="number" id="y-mcs" style="width:96px"> <button type="button" class="btn" id="y-mcns">new seed</button></span><button type="button" class="btn fix" id="y-mcrun">Run</button> <span class="cap" id="y-mcp"></span>`;
    segY(q("#y-mcn"), [["1000", "1,000"], ["2000", "2,000"], ["5000", "5,000"]], () => String(M.paths), v => M.paths = +v);
    numY(q("#y-mcs"), () => M.seed, v => M.seed = Math.round(v));
    q("#y-mcns").onclick = () => { M.seed = (M.seed * 1103515245 + 12345) % 2147483647; schedule(10); };
    q("#y-mcrun").onclick = () => runMC();
    const stale = MC.res && MC.key !== mcKey(); q("#y-mcp").textContent = MC.prog && MC.prog < 1 ? `running… ${Math.round(MC.prog * 100)}%` : stale ? "inputs changed: run again" : MC.res ? "" : "press Run";
    if (MC.res) drawMC(stale);
  }
  function runMC() {
    const M = ys.mc, job = ++MC.job, key = mcKey(), W = ys.sc.W, costs = costsOf();
    const parts = [["A", RES.A], RES.B ? ["B", RES.B] : null].filter(Boolean).map(([who, R]) => ({ who, R, snap: COMPOUND_STRESS.snapshot({ ...R.main, run: R.run }, 0, { cap0: ys.sc.cap0, W, mult: RES.mult }, costs), vol: (v0 => volArrays(v0.iv, v0.rv))(readRunVol({ run: R.run, slot: who })),
 mA: ys.costs.mOvr[R.run.tk], out: [] }));
    let i = 0; const N = M.paths, step = () => { if (job !== MC.job) return; const t0 = performance.now();
      while (i < N && performance.now() - t0 < 40) { const to = Math.min(N, i + 25); for (const P of parts) P.out.push(...COMPOUND_STRESS.mcRun(P.snap, RES.mult, P.vol.rv, W, M.seed, i, to, costs, P.mA, Array.isArray(P.vol.iv) ? P.vol.iv : null)); i = to; }
      MC.prog = i / N; const pe = q("#y-mcp"); if (pe) pe.textContent = `running… ${Math.round(MC.prog * 100)}%`;
      if (i < N) setTimeout(step, 0); else { MC = { key, job, prog: 1, res: parts }; if (q("#y-mcb")) drawMC(false); const pe2 = q("#y-mcp"); if (pe2) pe2.textContent = `${N.toLocaleString("en-US")} paths per run, seed ${M.seed}`; } };
    setTimeout(step, 0);
  }
  function drawMC(stale) {
    const host = q("#y-mcb"); host.innerHTML = ""; host.style.opacity = stale ? 0.45 : 1; const parts = MC.res, W = ys.sc.W;
    const qn = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
    const Wd = Math.max(600, host.parentElement.clientWidth - 30), H = 260, l = 62, rM = 110, pw = Wd - l - rM, X = w => l + w / W * pw;
    const s = sv("svg", { width: Wd, height: H + 26, viewBox: `0 0 ${Wd} ${H + 26}` }, host);
    const bands = parts.map(P => { const cols = []; for (let w = 0; w < W; w++) { const v = P.out.map(o => o.wk[w]).sort((a, b) => a - b); cols.push([0.05, 0.25, 0.5, 0.75, 0.95].map(p => qn(v, p))); } return cols; });
    let lo = Infinity, hi = -Infinity; for (const b of bands) for (const c of b) { lo = Math.min(lo, c[0]); hi = Math.max(hi, c[4]); } lo = Math.max(lo * 0.9, 500); hi *= 1.1;
    const Y = v => 8 + (Math.log(hi) - Math.log(Math.max(v, lo))) / (Math.log(hi) - Math.log(lo)) * (H - 16), ax = sv("g", { class: "yax" }, s);
    for (const t of logTicks(lo, hi)) { sv("line", { x1: l, x2: l + pw, y1: Y(t), y2: Y(t) }, ax); st_(ax, l - 6, Y(t) + 3.5, f$(t), { "text-anchor": "end" }); }
    for (const w of weekTicks(W, pw)) st_(ax, X(w), H + 14, fD(COMPOUND_ENGINE.weekDate(w)), { "text-anchor": tickAnchor(X(w), l, l + pw) });
    parts.forEach((P, k) => { const cls = P.who.toLowerCase(), b = bands[k], xs = b.map((_, w) => X(w + 1));
      for (const [i0, i1, op] of [[0, 4, 0.08], [1, 3, 0.16]]) { let d = `M${X(0)},${Y(ys.sc.cap0)}`; b.forEach((c, w) => d += `L${xs[w]},${Y(c[i1])}`); for (let w = b.length - 1; w >= 0; w--) d += `L${xs[w]},${Y(b[w][i0])}`; sv("path", { d: d + "Z", fill: `var(--${cls})`, opacity: op }, s); }
      let d = `M${X(0)},${Y(ys.sc.cap0)}`; b.forEach((c, w) => d += `L${xs[w]},${Y(c[2])}`); sv("path", { d, fill: "none", stroke: `var(--${cls})`, "stroke-width": 2.2 }, s);
      const er = P.R.main.rows; let e = `M${X(0)},${Y(ys.sc.cap0)}`; er.forEach(r => e += `L${X(Math.min(r.w1, W))},${Y(r.med)}`); sv("path", { d: e, fill: "none", stroke: `var(--${cls})`, "stroke-width": 1.2, "stroke-dasharray": "4 4" }, s);
      st_(s, l + pw + 6, Y(b[W - 1][2]) + 4, `${P.who} ${f$(b[W - 1][2])}`, { class: "yhalo", fill: `var(--${cls})`, "font-size": 11, "font-weight": 600 }); });
    AXES.attach({ svg: s, orient: "y", band: { x: 0, y: 8, width: l, height: H - 16 }, guide: { from: l, to: l + pw },
      toValue: py => Math.exp(Math.log(hi) - (py - 8) / (H - 16) * (Math.log(hi) - Math.log(lo))), toPx: Y, describe: describeNavOnAxis });
    AXES.attach({ svg: s, orient: "x", band: { x: l, y: H - 8, width: pw, height: 30 }, guide: { from: 8, to: H - 8 }, toValue: px => Math.round(Math.min(W, Math.max(0, (px - l) / pw * W))), toPx: X, describe: describeWeekOnAxis });
    attachCursor({ svg: s, left: l, width: pw, top: 8, bottom: H - 8, xs: Array.from({ length: W }, (_, i) => i + 1), toPx: X,
      tipAt: w => `<span class="h">Random paths, week ${w} · ${fD(COMPOUND_ENGINE.weekDate(w))}</span>` + parts.map((P, k) => { const c = bands[k][w - 1], cls = P.who.toLowerCase();
        return tipRow(cls, `${P.who} median`, f$(c[2])) + tipRow(cls, `${P.who} 25–75%`, `${f$(c[1])} – ${f$(c[3])}`) + tipRow(cls, `${P.who} 5–95%`, `${f$(c[0])} – ${f$(c[4])}`); }).join("") });
    const tb = document.createElement("span"); tb.className = "ytab"; host.appendChild(tb);
    const row = P => { const e = P.out.map(o => o.end).sort((a, b) => a - b), dd = P.out.map(o => o.dd).sort((a, b) => a - b), n = e.length, w5 = e.slice(0, Math.max(1, Math.floor(n * 0.05))), pc = P.out.reduce((t, o) => t + o.call, 0) / n, se = Math.sqrt(pc * (1 - pc) / n);
      return `<tr><td><span class="key ${P.who.toLowerCase()}">${P.who}</span></td><td>${f$(qn(e, .05))}</td><td>${f$(qn(e, .1))}</td><td><b>${f$(qn(e, .5))}</b></td><td>${f$(qn(e, .9))}</td><td>${f$(qn(e, .95))}</td><td>${f$(w5.reduce((a, b) => a + b, 0) / w5.length)}</td><td>${fPc(qn(dd, .5), 0)} / ${fPc(qn(dd, .9), 0)}</td><td>${fPc(pc, 1)} ± ${(se * 100).toFixed(1)}</td><td>${fPc(P.out.reduce((t, o) => t + o.wiped, 0) / n, 1)}</td></tr>`; };
    tb.innerHTML = `<table><thead><tr><th></th><th>5%</th><th>10%</th><th>median</th><th>90%</th><th>95%</th><th>worst 5% avg</th><th>drawdown med / 90%</th><th>≥ 1 margin call</th><th>NAV ≤ 0</th></tr></thead><tbody>${parts.map(row).join("")}</tbody></table>
      <p style="margin:6px 0 0;font-size:12px">${parts.map(P => { const e = P.out.map(o => o.end).sort((a, b) => a - b), med = qn(e, .5), pc = P.out.reduce((t, o) => t + o.call, 0) / e.length; return `<span class="key ${P.who.toLowerCase()}">${P.who}</span> check against the engine: median ${f$(med)} vs ${f$(P.R.main.end.med)} (${fPs(med / P.R.main.end.med - 1)}), margin call ${fPc(pc, 0)} vs ${fPc(P.R.main.end.called, 0)}`; }).join(" &nbsp; ")}</p>
      <p class="cap" style="margin-top:6px">Solid line and bands: random paths (median, 25–75%, 5–95%). Dashed: the engine's typical track. Each run sees the same random ${ys.A.tk} paths. Plain lognormal daily moves, Monday carrying three days; no jumps. Options are marked with the time actually left, so strangle margin calls come out more often here than in the engine, which marks at half the cycle.</p>`;
  }
  // ---------------------------------------------------------- persistence (the app saves; we expose state)
  // the page's port (COMPOUND.init({port})): saveView writes the blob and the address, showNotice toasts, periodVol reads
  // and writes the page's period vol (read(ticker) -> % as stored, 0 allowed; write({ticker, pct, source?, expiry?}) runs the
  // page's command, source Set unless a preset is named). Until init it is inert, with a period vol of its own
  /** @typedef {{ source: string, label: string, short: string, pct: number, expiry?: string }} YrVolRef */
  /** @typedef {{ read: (ticker: string) => number, write: (edit: { ticker: string, pct: number, source?: string, expiry?: string }) => any, refs: (ticker: string) => YrVolRef[] }} YrPeriodVolPort */
  // The period vol of the tab on its own, before (or without) the page's port.
  // Why a class: it keeps per-ticker values between writes and reads, the state a port of plain functions would hide
  // in a loose object; the page's port replaces it at init
  class StandalonePeriodVol {
    constructor() {
      /** @type {Map<string, number>} */
      this.pcts = new Map();
    }
    /** @param {string} ticker */
    read(ticker) {
      if (this.pcts.has(ticker)) { return this.pcts.get(ticker); }
      return listedPct(ticker);
    }
    /** @param {{ ticker: string, pct: number, source?: string, expiry?: string }} edit */
    write({ ticker, pct, source }) {
      if (source === VolSource.Hv30) {
        this.pcts.delete(ticker);
        return;
      }
      this.pcts.set(ticker, pct);
    }
    // the listed vol and the data's realized vols (the page's list adds ATM at Compare's A horizon)
    /** @param {string} ticker */
    refs(ticker) {
      const listedName = nameVolSource({ source: VolSource.Hv30 });
      const realized = Array.isArray(D.u[ticker].realized) ? D.u[ticker].realized : [];
      /** @type {YrVolRef[]} */
      const refs = [{ source: VolSource.Hv30, label: listedName, short: listedName, pct: listedPct(ticker) }];
      return refs.concat(realized.map(r => ({ source: VolSource.Set, label: r.label, short: r.short, pct: r.vol * 100 })));
    }
  }
  /** @type {{ saveView: () => void, showNotice: (text: string) => void, periodVol: YrPeriodVolPort }} */
  let port = { saveView: () => {}, showNotice: (text) => {}, periodVol: new StandalonePeriodVol() };
  let saveT = 0; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(() => port.saveView(), 400); };
  // the state the page saves: the moves are not in it (they are the page's period vol, plus a run's own override)
  function getState() { return clone(ys); }
  // the vol fields of a loaded state: the old per-tab moves (rv, rvB) are gone, since the page's view readers turned
  // them into the period vol and the run override before the state arrives here (any left are dropped); the override
  // is {run: A | B, [ticker]: pct in range}
  function sanitizeVolFields(sc) {
    const out = { ...sc }, [lo, hi] = PERIOD_VOL_CONFIG.range;
    delete out.rv;
    delete out.rvB;
    const given = out.volOverride && typeof out.volOverride === "object" ? out.volOverride : {};
    const override = { run: given.run === RunSlot.A ? RunSlot.A : RunSlot.B };
    for (const tk of TKS) {
      const pct = given[tk];
      const isUsable = typeof pct === "number" && Number.isFinite(pct);
      if (isUsable) { override[tk] = Math.max(lo, Math.min(hi, pct)); }
    }
    out.volOverride = override;
    return out;
  }
  function setState(s) { if (!s || typeof s !== "object") return; const d = DEF(); ys = { ...d, ...s, A: { ...d.A, ...(s.A || {}) }, B: { ...d.B, ...(s.B || {}) }, sc: { ...d.sc, ...(s.sc || {}), path: { ...d.sc.path, ...((s.sc || {}).path || {}) } }, costs: { ...d.costs, ...(s.costs || {}) }, rates: { ...d.rates, ...(s.rates || {}) }, view: { ...d.view, ...(s.view || {}) }, ck: { ...d.ck, ...(s.ck || {}) } }; if (!["weeks", "stress", "kept"].includes(ys.view.v)) { ys.view.v = "weeks"; } ys.ck = sanitizeKeptSettings(ys.ck);
    ys.sc = sanitizeVolFields(ys.sc);
    ys = migrateWeeksVocabulary(ys);
    for (const r of [ys.A, ys.B]) { r.modus = { ...MODUS0, ...(r.modus || {}) }; if (r.tk === "RAM" && r.cad === "wk") { r.cad = "mo"; setTimeout(() => port.showNotice("RAM lists monthly options only: the run was set to monthly"), 0); } } dockSig = ""; }
  // views saved before the tab spoke only in weeks: the "year" view is the Weeks view, and growth rates typed per 52
  // weeks become growth over the weeks shown (the same rate compounded over W weeks)
  const overWeeks = ({ perFiftyTwo, weeks }) => Math.pow(1 + perFiftyTwo, weeks / 52) - 1;
  function migrateWeeksVocabulary(state) {
    const next = clone(state), weeks = Math.max(1, +next.sc.W || 52);
    if (next.view && next.view.v === "year") { next.view.v = "weeks"; }
    const path = next.sc.path;
    if (path && path.gUnit === "yr") { path.g = overWeeks({ perFiftyTwo: +path.g || 0, weeks }); path.gUnit = "span"; }
    const ivPath = next.ivp;
    if (ivPath && ivPath.gUnit !== "span") { ivPath.g = +(overWeeks({ perFiftyTwo: (+ivPath.g || 0) / 100, weeks }) * 100).toFixed(4); ivPath.gUnit = "span"; }
    return next;
  }
  function reset() { ys = DEF(); dockSig = ""; CACHE.clear(); SW.key = ""; }

  // ---------------------------------------------------------- render
  let inited = false;
  function init(options) {
    if (options && options.port) port = Object.assign({}, port, options.port);
    if (inited) return; inited = true;
    segY(q("#y-bdiff"), BDIFF.map(([v, l]) => [v, l]), () => ys.bDiff, v => { ys.bOn = true; setBDiff(v); });
    segY(q("#y-bdiff2"), BDIFF2.map(([v, l]) => [v, l]), () => ys.bDiff, v => { ys.bOn = true; setBDiff(v); q("#y-bmore").open = false; });
    q("#y-swap").onclick = swapRuns;
    q("#y-chipB").onclick = () => { if (!ys.bOn) { ys.bOn = true; schedule(10); } };
    q("#y-dropb").onclick = () => { ys.bOn = false; schedule(10); };
    numY(q("#y-cap0"), () => ys.sc.cap0, v => ys.sc.cap0 = v, { min: 1000 });
    numY(q("#y-W"), () => ys.sc.W, v => { ys.sc.W = Math.round(v); ys.view.pin = Math.min(ys.view.pin, ys.sc.W); }, { min: 4, max: 104 });
    q("#y-pmode").onchange = e => { ys.sc.path.mode = e.target.value; if (ys.sc.path.mode === "pts" && !ys.sc.path.pts.length) ys.sc.path.pts = [[Math.round(ys.sc.W / 2), 1.2], [ys.sc.W, 1.5]]; schedule(10); };
    q("#y-dockhide").onclick = () => { ys.view.dockOff = true; document.body.classList.add("ydock-off"); setTimeout(() => render("full"), 30); };
    q("#y-dockshow").onclick = () => { ys.view.dockOff = false; document.body.classList.remove("ydock-off"); setTimeout(() => render("full"), 30); };
    buildMenus(); renderNotes(); buildStressBar();
    q("#y-sbase").onclick = () => { ys.view.v = "weeks"; schedule(10); };
    // the junior tabs in the header's second row: the weeks, the stress and what each cycle keeps of its credit
    segY(q("#sub-yr"), [["weeks", "Weeks"], ["stress", "Stress"], ["kept", "Credit kept"]], () => ys.view.v || "weeks", v => { if (v !== ys.view.v) { KNOBS.closeAll(); } ys.view.v = v; scrollTo(0, 0); });
    buildKeptControls();
    let rz = 0; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (document.body.dataset.tab === "yr") render("full"); }, 150); });
  }
  function render(mode = "full") {
    init();
    if (ys.sc.path.mode === "pts") lastPtsNotes = normPts(); else lastPtsNotes = {};
    document.body.classList.toggle("ydock-off", !!ys.view.dockOff);
    compute();
    renderBar(); renderPathCtl(); renderDock(); syncAll();
    const stress = ys.view.v === "stress", kept = ys.view.v === "kept";
    q("#y-yearv").hidden = stress || kept; q("#y-stressv").hidden = !stress; q("#y-keptv").hidden = !kept; for (const id of ["#y-srow", "#y-srow2", "#y-srow3"]) { q(id).hidden = !stress; } for (const id of ["#y-row2", "#y-row2b", "#y-row3"]) { q(id).hidden = stress; } q("#y-read").hidden = stress;
    const baseTxt = `Base: ${f$(ys.sc.cap0).replace(".0k", "k")} · ${ys.sc.W} wk · ${{ flat: "flat", line: "line", pts: "points", growth: "growth" }[ys.sc.path.mode]} path · ` + [...new Set([ys.A.tk, ys.bOn && runB() ? runB().tk : null].filter(Boolean))].map(t => `${t} IV ${ys.sc.iv[t]}%, realized ${Math.round(readMovesPct({ tk: t, slot: RunSlot.A }))}%`).join(" · ");
    q("#y-sbase").textContent = baseTxt; q("#y-sbase").title = `${baseTxt}. Click to edit the base in the Weeks view.`;

    if (stress) { renderStress(); renderMCTools(); PANELS.decorate(q("#tab-yr")); saveSoon(); return; }
    if (kept) { renderKept(); PANELS.decorate(q("#tab-yr")); saveSoon(); return; }
    renderStrip(mode === "live");
    renderStack(); renderGrowth(); renderCreditMargin(); renderTable();
    if (mode !== "live") renderSweep();
    PANELS.decorate(q("#tab-yr"));
    saveSoon();
  }
  // the Credit kept table for the export, as plain text (null before the first run)
  function exportKept() {
    if (!RES || !RES.A) { return null; }
    const plain = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const kepts = [["A", RES.A], RES.B ? ["B", RES.B] : null].filter(Boolean).map(([who, R]) => [who, readKept(R)]);
    const head = ["Preset", ...kepts.flatMap(([who]) => [`${who} kept a cycle`, `${who} NAV week ${ys.sc.W}`])];
    const rows = KEPT_PRESETS.map(p => [p.name, ...kepts.flatMap(([, K]) => { const c = describeKeptCell(p, K); return [plain([c.text, c.alert, c.sub].filter(Boolean).join(" · ")), plain(c.nav)]; })]);
    rows.push(["Full model (Weeks view)", ...kepts.flatMap(([, K]) => ["", f$(K.R.main.end.med)])]);
    return { intro: kepts.map(([who, K]) => `${who}: ${runName(K.R.run)}`).join(" · ") + `. Share x = ${ys.ck.x}%; managed: take profit ${ys.ck.tp}%, stop ${ys.ck.sl}%.`, head, rows, note: "Cycle 1's own legs at its pricing IV; the price spread at the run's realized vol around the path. NAV: the options and shares alone (no margin calls, interest or assignment)." };
  }
  // describeCallSafeSize is the export's: it runs the search to the end, so the document never carries the progress text
  return { init, render, getState, setState, reset, exportKept, describeCallSafeSize: who => RES && RES[who] ? describeCallSafeSize(who, { sync: true }) : "", _state: () => ys, _res: () => RES, _sres: () => SRES, _mc: () => (MC.res ? { parts: MC.res, stale: MC.key !== mcKey() } : null) };
})(COMPOUND_ENGINE, COMPOUND_STRESS);
