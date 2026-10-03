// ============================================================ ui_lens: three more lenses on the payoff panel
// Decay vs move: for each trading day, how far the price may move that day before the day's decay is gone, against the
// size of a normal day (1σ at the ATM IV and at the period vol) in the market-move colours (MOVES).
// Profit zone: each trading day's break-even prices (P&L 0 at the model's mark) inside the price cone from today.
// EV map: at the chosen day, where the expected P&L comes from across prices (period-vol odds, as every EV reading).
// The math is plain functions of a position and its value at a price; the drawing takes a kit from VIEWS (the render
// context, formatting, the day stops, the payoff's helpers), so this file reads no page state of its own.
// Page contract: LENSES.render({ lens, time, kit }) for PayLens.Move / Zone / Ev; LENSES.math for the tests.
const LENSES = (() => {
  const CONFIG = Object.freeze({ moveLimit: 0.6, moveStep: 0.002, zoneLimit: 2.5, zoneStep: 0.01, bisections: 40, evCells: 400, evSpan: 4.5, evView: 3 });
  const SIGMA_P = Object.freeze({ lo2: 0.02275, lo1: 0.15866, hi1: 0.84134, hi2: 0.97725 });

  // ---------------------------------------------------------- the math (no drawing, no page state)
  // the first log move m along 0 → direction·limit where f turns ≤ 0, refined by bisection; NaN when it never does.
  // A start already at or below 0 is `atStart` (0 for the decay lens: the day loses unmoved; NaN for a zone: none)
  /** @param {{ f: (m: number) => number, direction: number, limit: number, step: number, atStart: number }} input */
  function findEdge({ f, direction, limit, step, atStart }) {
    const f0 = f(0);
    if (!Number.isFinite(f0)) { return NaN; }
    if (f0 <= 0) { return atStart; }
    let inside = 0;
    for (let k = 1; k * step <= limit + 1e-12; k++) {
      const m = direction * k * step, v = f(m);
      if (!Number.isFinite(v) || v > 0) { inside = m; continue; }
      let a = inside, b = m;
      for (let i = 0; i < CONFIG.bisections; i++) { const c = (a + b) / 2; if (f(c) > 0) { a = c; } else { b = c; } }
      return (a + b) / 2;
    }
    return NaN;
  }
  // a position's P&L per share at a price with `tau` years left (its expiry payoff at or past expiry)
  /** @param {{ b: any, price: number, tau: number, shock: any }} input */
  const pnlAt = ({ b, price, tau, shock }) => tau > 1e-9 ? POS.val(b, price, tau, shock) : POS.payoff(b, price);
  // the day's break-even moves: the day P&L when the price goes from `price` (the day before) to price·e^m by the day
  // ends; up and down as simple returns (0: the day loses even unmoved; NaN: no break-even inside the limit)
  // `value(price, tau)` is the position's P&L (any unit) at a price with tau years left
  /** @param {{ value: (price: number, tau: number) => number, price: number, tauBefore: number, tauAfter: number }} input */
  function readDayBreakEvens({ value, price, tauBefore, tauAfter }) {
    const start = value(price, tauBefore);
    const f = m => value(price * Math.exp(m), tauAfter) - start;
    const edge = direction => findEdge({ f, direction, limit: CONFIG.moveLimit, step: CONFIG.moveStep, atStart: 0 });
    const up = edge(1), down = edge(-1);
    return { up: Math.exp(up) - 1, down: Math.exp(down) - 1, decay: f(0) };
  }
  // the profit zone at one time: the break-even prices either side of `price` as simple returns (NaN: none that way,
  // or no profit at `price` itself)
  /** @param {{ value: (price: number, tau: number) => number, price: number, tau: number }} input */
  function readZone({ value, price, tau }) {
    const f = m => value(price * Math.exp(m), tau);
    const edge = direction => findEdge({ f, direction, limit: CONFIG.zoneLimit, step: CONFIG.zoneStep, atStart: NaN });
    return { lo: Math.exp(edge(-1)) - 1, hi: Math.exp(edge(1)) - 1 };
  }
  // the odds a zero-drift lognormal at `vol` over `t` years ends below each simple return (and between two)
  /** @param {{ vol: number, t: number, ret: number }} input */
  const oddsBelow = ({ vol, t, ret }) => ret <= -1 ? 0 : DIST.lognormalCdf({ x: Math.log(1 + ret), vol, t });
  // the EV map at one time: cells of log move with the probability mass, the P&L (page units) and their product; the
  // first and last cell carry the mass beyond the grid at their edge's P&L
  /** @param {{ value: (m: number) => number, cdf: (m: number) => number, span: number }} input */
  function readEvCells({ value, cdf, span }) {
    const n = CONFIG.evCells, cells = [];
    for (let k = 0; k < n; k++) {
      const m0 = -span + 2 * span * k / n, m1 = -span + 2 * span * (k + 1) / n, mid = (m0 + m1) / 2;
      const c0 = k === 0 ? 0 : cdf(m0), c1 = k === n - 1 ? 1 : cdf(m1), mass = Math.max(0, c1 - c0), pnl = value(mid);
      cells.push({ m0, m1, mid, mass, pnl, ev: mass * pnl, running: 0 });
    }
    let total = 0;
    for (const c of cells) { total += c.ev; c.running = total; }
    return { cells, total };
  }

  // ---------------------------------------------------------- shared drawing
  const pct = (v, d = 1) => fS(v, d);
  // a day axis: x by calendar days elapsed; labels today, Mondays (clear of the edges) and expiry
  /** @param {{ ax: SVGElement, stops: any[], X: (e: number) => number, top: number, bottom: number, kit: any }} input */
  function drawDayAxis({ ax, stops, X, top, bottom, kit }) {
    const last = stops.length - 1, elapsedAt = i => stops[0].left - stops[i].left, yb = bottom + 14;
    stops.forEach((stop, i) => {
      const isEdge = i === 0 || i === last, x = X(elapsedAt(i));
      if (!stop.isMonday && !isEdge) { return; }
      if (!isEdge && (x - X(0) < 64 || X(elapsedAt(last)) - x < 64)) { return; }
      const anchor = i === 0 ? "start" : i === last ? "end" : "middle";
      el("line", { x1: x, x2: x, y1: top, y2: bottom }, ax);
      txt(ax, x, yb, i === 0 ? "today" : i === last ? "expiry" : kit.dayLabel(stop.date), { "text-anchor": anchor });
      txt(ax, x, yb + 13, i === last ? "0" : `${MINUS}${stop.left}`, { "text-anchor": anchor, style: "font-size:10px;fill:var(--ink-3)" });
    });
  }
  /** @param {{ ax: SVGElement, lo: number, hi: number, n: number, height: number, Y: (v: number) => number, left: number, right: number, format: (v: number, step: number) => string, kit: any }} input */
  function drawValueTicks({ ax, lo, hi, n, height, Y, left, right, format, kit }) {
    for (const { v, step } of kit.payTicks(lo, hi, n, height)) {
      el("line", { x1: left, x2: right, y1: Y(v), y2: Y(v) }, ax);
      txt(ax, left - 6, Y(v) + 3.5, format(v, step || 0.01), { "text-anchor": "end" });
    }
  }
  const pctTick = (v, step) => pct(v, step >= 0.01 ? 0 : 1);
  // the sides drawn: A, and B unless it repeats A
  const sidesOf = C => [["a", C.A, C.toSA, 1], ["b", C.B, C.toSB, C.h]].filter(([side, b]) => !b.na && !(side === "b" && C.same && C.diff.identical));
  const nameOf = (side, kit) => side === "a" ? "A" : "B" + kit.hb();
  // hover over a day chart: the nearest stop; a click picks it
  /** @param {{ svg: SVGSVGElement, W: number, plot: { x: number, y: number, width: number, height: number }, stops: any[], total: number, X: (e: number) => number, describe: (i: number) => string, kit: any }} input */
  function wireDayHover({ svg, W, plot, stops, total, X, describe, kit }) {
    const elapsedAt = i => stops[0].left - stops[i].left;
    const cross = el("line", { y1: plot.y, y2: plot.y + plot.height, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const hit = el("rect", { ...plot, fill: "transparent", style: "cursor:pointer" }, svg);
    const stopAt = ev => {
      const r = svg.getBoundingClientRect(), e = ((ev.clientX - r.left) * W / r.width - plot.x) / plot.width * total;
      return stops.reduce((best, _, i) => Math.abs(elapsedAt(i) - e) < Math.abs(elapsedAt(best) - e) ? i : best, 0);
    };
    hit.addEventListener("pointermove", ev => {
      const i = stopAt(ev), x = String(X(elapsedAt(i)));
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      showTip(describe(i), ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("click", ev => { kit.stopReplay({ keep: false }); kit.setPref({ payLeft: stops[stopAt(ev)].left }); });
  }
  const daySpan = (stops, i) => i > 0 ? stops[i - 1].left - stops[i].left : 1;
  const yearsOf = (b, days) => b.dte > 0 ? b.T * days / b.dte : days / 365;

  // ---------------------------------------------------------- Decay vs move
  /** @param {{ b: any, price: number, stops: any[], kit: any, shock: any }} input */
  function readMoveSeries({ b, price, stops, kit, shock }) {
    const first = stops[0].left, tauOf = i => kit.tauAfter({ b, elapsed: first - stops[i].left });
    return stops.map((stop, i) => {
      if (i === 0) { return null; }
      const be = readDayBreakEvens({ value: (x, tau) => pnlAt({ b, price: x, tau, shock }), price, tauBefore: tauOf(i - 1), tauAfter: tauOf(i) });
      const t = yearsOf(b, daySpan(stops, i)), implied = b.E.atm * Math.sqrt(t), period = kit.C.volOf(b.tk).pct / 100 * Math.sqrt(t);
      const vol = kit.C.volOf(b.tk).pct / 100;
      const lose = (Number.isFinite(be.down) ? oddsBelow({ vol, t, ret: be.down }) : 0) + (Number.isFinite(be.up) ? 1 - oddsBelow({ vol, t, ret: be.up }) : 0);
      return { ...be, implied, period, lose: Math.min(1, lose) };
    });
  }
  function renderMove({ time, kit }) {
    const { C } = kit, host = kit.host, W = Math.max(host.clientWidth, 600), stops = time.stops, total = Math.max(1, stops[0].left);
    const sides = sidesOf(C);
    if (!sides.length) { host.innerHTML = `<p class="muted">Both positions are n/a.</p>`; return; }
    const at = kit.V().payAt / 100;
    const series = sides.map(([side, b]) => ({ side, b, rows: readMoveSeries({ b, price: b.S * (1 + at), stops, kit, shock: C.shock }) }));
    kit.title(`Decay vs move · how far the price may move in a day before the day's decay is gone${at ? ` (from ${pct(at, 0)} vs spot)` : ""}`);
    const m = { l: 62, r: 54, t: 18, b: 46 }, H1 = 300, plotW = W - m.l - m.r, y1 = m.t, H = y1 + H1 + m.b;
    const X = e => m.l + e / total * plotW, elapsedAt = i => stops[0].left - stops[i].left;
    const lead = series[0].rows;
    const values = series.flatMap(s => s.rows.flatMap(r => r ? [r.up, r.down] : [])).filter(Number.isFinite);
    const sigmas = lead.flatMap(r => r ? [r.implied * MOVES.CLEAR * 1.15, -r.implied * MOVES.CLEAR * 1.15] : []);
    let ylo = Math.min(...values, ...sigmas, -0.01), yhi = Math.max(...values, ...sigmas, 0.01); const pad = (yhi - ylo) * 0.05; ylo -= pad; yhi += pad;
    const Y = v => y1 + (yhi - v) / (yhi - ylo) * H1;
    const svg = /** @type {SVGSVGElement} */ (el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "The day's break-even moves by trading day against a normal day's move" }, host));
    // the market-move zones of each day, by the lead's 1σ day at its ATM IV (a Monday spans the weekend: wider)
    const zones = el("g", { class: "mzones" }, svg), dayW = plotW / total;
    lead.forEach((r, i) => {
      if (!r) { return; }
      const x0 = X(elapsedAt(i)) - Math.min(dayW * daySpan(stops, i), dayW * 3) + 1, x1 = X(elapsedAt(i)) + 1;
      /** @type {[number, number, string][]} */
      const bands = [[MOVES.CLEAR, yhi, "up"], [MOVES.FLAT, MOVES.CLEAR, "note"], [-MOVES.FLAT, MOVES.FLAT, "flat"], [-MOVES.CLEAR, -MOVES.FLAT, "note"], [ylo, -MOVES.CLEAR, "down"]];
      for (const [a, b, kind] of bands) {
        const top = kind === "up" ? yhi : b * r.implied, bottom = kind === "down" ? ylo : a * r.implied;
        el("rect", { x: x0, y: Y(Math.min(top, yhi)), width: Math.max(0.5, x1 - x0), height: Math.max(0, Y(Math.max(bottom, ylo)) - Y(Math.min(top, yhi))), fill: `var(--${kind})`, "fill-opacity": kind === "flat" ? .12 : .14 }, zones);
      }
    });
    const ax = el("g", { class: "ax" }, svg);
    drawValueTicks({ ax, lo: ylo, hi: yhi, n: 6, height: H1, Y, left: m.l, right: W - m.r, format: pctTick, kit });
    drawDayAxis({ ax, stops, X, top: y1, bottom: y1 + H1, kit });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg);
    const xSel = X(elapsedAt(time.index));
    el("line", { x1: xSel, x2: xSel, y1: y1, y2: y1 + H1, stroke: "var(--ink-2)", "stroke-dasharray": "3 3" }, svg);
    // the period vol's 1σ day, dotted, for the lead
    const pts = (rows, pick) => rows.map((r, i) => [elapsedAt(i), r ? pick(r) : NaN]);
    for (const sign of [1, -1]) { el("path", { d: pathOf(pts(lead, r => sign * r.period), X, Y), fill: "none", stroke: "var(--ink-2)", "stroke-width": 1.2, "stroke-dasharray": "1 3" }, svg); }
    for (const s of series) {
      for (const key of ["up", "down"]) {
        el("path", { d: pathOf(pts(s.rows, r => r[key]), X, Y), fill: "none", stroke: `var(--${s.side})`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
        s.rows.forEach((r, i) => { if (r && Number.isFinite(r[key])) { el("circle", { cx: X(elapsedAt(i)), cy: Y(r[key]), r: i === time.index ? 4 : 2, fill: `var(--${s.side})` }, svg); } });
      }
    }
    txt(svg, m.l + 6, y1 + 12, "above: how far up · below: how far down", { fill: "var(--ink-2)", "font-size": 11, ...halo });
    kit.legend(series.map(s => `<span><i style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} ${kit.esc(C.labels[s.side.toUpperCase()].full)}</span>`).join(" ") +
      ` <span class="muted">· shading: a day's move at ${kit.esc(series[0].b.tk)}'s ATM IV, <span class="mvc-flat">flat</span> / <span class="mvc-note">notable</span> / <span class="mvc-up">clear rise</span> / <span class="mvc-down">clear fall</span> · dotted: 1σ day at the period vol</span>`);
    kit.read(describeMoveReadout({ series, time, kit }));
    wireDayHover({ svg, W, plot: { x: m.l, y: y1, width: plotW, height: H1 }, stops, total, X, kit, describe: i => {
      const rows = series.map(s => { const r = s.rows[i]; return r ? `<span class="s">${nameOf(s.side, kit)}</span>` + krow("break-even move down / up", `${pct(r.down)} / ${pct(r.up)}`) + krow("1σ day · ATM IV / period vol", `${pct(r.implied, 1)} / ${pct(r.period, 1)}`) + krow("odds the day loses (period vol)", `${(r.lose * 100).toFixed(0)}%`) : ""; }).join("");
      return `<span class="h">${kit.dayLabel(stops[i].date)}${daySpan(stops, i) > 1 ? ` · spans ${daySpan(stops, i)} calendar days` : ""}</span>${rows || `<span class="s">today: no day before</span>`}`;
    } });
    kit.keep({ move: series.map(s => ({ side: s.side, rows: s.rows })) });
  }
  /** @param {{ series: any[], time: any, kit: any }} input */
  function describeMoveReadout({ series, time, kit }) {
    if (time.index < 1) { return `<span class="muted">Today has no day before it: step a day on to read that day's break-even move.</span>`; }
    return series.map(s => {
      const r = s.rows[time.index], rows = s.rows.filter(Boolean), avgLose = rows.reduce((a, x) => a + x.lose, 0) / rows.length;
      if (!r) { return ""; }
      const sigmaWord = Number.isFinite(r.down) && Number.isFinite(r.up) ? ` = ${(Math.min(-r.down, r.up) / r.implied).toFixed(2)}σ of an ATM-IV day on the nearer side` : "";
      return `<span class="dr"><i class="lsw" style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} · ${kit.esc(kit.dayLabel(time.stops[time.index].date))} keeps its decay between <b>${pct(r.down)}</b> and <b>${pct(r.up)}</b>${sigmaWord} · odds the day loses at the period vol <b>${(r.lose * 100).toFixed(0)}%</b> (every day: ${(avgLose * 100).toFixed(0)}% on average)</span>`;
    }).join("");
  }

  // ---------------------------------------------------------- Profit zone
  /** @param {{ b: any, stops: any[], kit: any, shock: any }} input */
  function readZoneSeries({ b, stops, kit, shock }) {
    const first = stops[0].left;
    // today the P&L is only the entry's edge (the fill against the mark): the zone starts with the first day after
    return stops.map((stop, i) => i === 0 ? { lo: NaN, hi: NaN } : readZone({ value: (x, tau) => pnlAt({ b, price: x, tau, shock }), price: b.S, tau: kit.tauAfter({ b, elapsed: first - stop.left }) }));
  }
  // the cone: quantiles of the lead's price under the odds switch at each stop's days since today
  /** @param {{ b: any, stops: any[], kit: any }} input */
  function readCone({ b, stops, kit }) {
    const d = kit.C.distOf(b), first = stops[0].left;
    return stops.map(stop => {
      const t = yearsOf(b, first - stop.left), q = p => t > 0 && d ? Math.exp(quantAt(d, p, t)) - 1 : 0;
      return { lo2: q(SIGMA_P.lo2), lo1: q(SIGMA_P.lo1), hi1: q(SIGMA_P.hi1), hi2: q(SIGMA_P.hi2), t };
    });
  }
  function renderZone({ time, kit }) {
    const { C } = kit, host = kit.host, W = Math.max(host.clientWidth, 600), stops = time.stops, total = Math.max(1, stops[0].left);
    const sides = sidesOf(C);
    if (!sides.length) { host.innerHTML = `<p class="muted">Both positions are n/a.</p>`; return; }
    const series = sides.map(([side, b]) => ({ side, b, zone: readZoneSeries({ b, stops, kit, shock: C.shock }), cone: readCone({ b, stops, kit }) }));
    const lead = series[0];
    kit.title("Profit zone by day · the break-even prices from today to expiry, inside the price cone");
    const m = { l: 62, r: 54, t: 18, b: 46 }, H1 = 300, plotW = W - m.l - m.r, y1 = m.t, H = y1 + H1 + m.b;
    const X = e => m.l + e / total * plotW, elapsedAt = i => stops[0].left - stops[i].left;
    const values = series.flatMap(s => [...s.zone.flatMap(z => [z.lo, z.hi]), ...s.cone.flatMap(c => [c.lo2, c.hi2])]).filter(Number.isFinite);
    let ylo = Math.min(...values, -0.05), yhi = Math.max(...values, 0.05); const pad = (yhi - ylo) * 0.05; ylo -= pad; yhi += pad;
    const Y = v => y1 + (yhi - v) / (yhi - ylo) * H1;
    const svg = /** @type {SVGSVGElement} */ (el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Break-even prices by trading day inside the price cone" }, host));
    const band = (cone, a, b, fill, opacity) => { const top = cone.map((c, i) => [elapsedAt(i), c[b]]), bottom = cone.map((c, i) => [elapsedAt(i), c[a]]).reverse(); el("path", { d: pathOf(top, X, Y) + "L" + pathOf(bottom, X, Y).slice(1) + "Z", fill, "fill-opacity": opacity }, svg); };
    band(lead.cone, "lo2", "hi2", "var(--flat)", .14); band(lead.cone, "lo1", "hi1", "var(--flat)", .2);
    const ax = el("g", { class: "ax" }, svg);
    drawValueTicks({ ax, lo: ylo, hi: yhi, n: 6, height: H1, Y, left: m.l, right: W - m.r, format: pctTick, kit });
    drawDayAxis({ ax, stops, X, top: y1, bottom: y1 + H1, kit });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg);
    const xSel = X(elapsedAt(time.index));
    el("line", { x1: xSel, x2: xSel, y1: y1, y2: y1 + H1, stroke: "var(--ink-2)", "stroke-dasharray": "3 3" }, svg);
    for (const s of series) {
      if (s !== lead) { for (const key of ["lo1", "hi1"]) { el("path", { d: pathOf(s.cone.map((c, i) => [elapsedAt(i), c[key]]), X, Y), fill: "none", stroke: `var(--${s.side})`, "stroke-width": 1, "stroke-dasharray": "2 3", "stroke-opacity": .7 }, svg); } }
      for (const key of ["lo", "hi"]) {
        el("path", { d: pathOf(s.zone.map((z, i) => [elapsedAt(i), z[key]]), X, Y), fill: "none", stroke: `var(--${s.side})`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
        const z = s.zone[time.index][key];
        if (Number.isFinite(z)) { el("circle", { cx: xSel, cy: Y(z), r: 4, fill: `var(--${s.side})`, stroke: "var(--surface)", "stroke-width": 1.5 }, svg); }
      }
    }
    txt(svg, m.l + 6, y1 + 12, "between a position's two lines it is in profit (at the model's mark that day)", { fill: "var(--ink-2)", "font-size": 11, ...halo });
    kit.legend(series.map(s => `<span><i style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} ${kit.esc(C.labels[s.side.toUpperCase()].full)}</span>`).join(" ") +
      ` <span class="muted">· grey cone: ${kit.esc(lead.b.tk)} ±1σ (darker) and ±2σ under the odds switch (${kit.esc(C.oddsText())})${series.length > 1 && lead.b.tk !== series[1].b.tk ? ` · dotted: ${kit.esc(series[1].b.tk)}'s ±1σ` : ""}</span>`);
    kit.read(describeZoneReadout({ series, time, kit }));
    wireDayHover({ svg, W, plot: { x: m.l, y: y1, width: plotW, height: H1 }, stops, total, X, kit, describe: i => {
      const rows = series.map(s => { const z = s.zone[i], inside = readInsideOdds({ s, i, kit }); return `<span class="s">${nameOf(s.side, kit)}</span>` + krow("break-evens", Number.isFinite(z.lo) || Number.isFinite(z.hi) ? `${pct(z.lo)} / ${pct(z.hi)}` : "no profit at spot") + (Number.isFinite(inside) ? krow("odds inside that day", `${(inside * 100).toFixed(0)}%`) : ""); }).join("");
      return `<span class="h">${kit.dayLabel(stops[i].date)} · ${stops[i].left ? `${stops[i].left} days before expiry` : "expiry"}</span>${rows}`;
    } });
    kit.keep({ zone: series.map(s => ({ side: s.side, zone: s.zone })) });
  }
  // the odds the price sits inside the zone on day i (odds switch); at today the price is where it is
  /** @param {{ s: any, i: number, kit: any }} input */
  function readInsideOdds({ s, i, kit }) {
    const z = s.zone[i], d = kit.C.distOf(s.b), t = s.cone[i].t;
    if (!d || !Number.isFinite(z.lo) || !Number.isFinite(z.hi)) { return NaN; }
    if (!(t > 0)) { return z.lo < 0 && z.hi > 0 ? 1 : 0; }
    return Math.max(0, cdfAt(d, Math.log(1 + z.hi), t) - cdfAt(d, Math.log(1 + z.lo), t));
  }
  /** @param {{ series: any[], time: any, kit: any }} input */
  function describeZoneReadout({ series, time, kit }) {
    const i = time.index, last = time.stops.length - 1;
    if (i === 0) { return `<span class="muted">Today the P&amp;L is only the entry's edge (the fill against the model's mark): step a day on to read that day's profit zone.</span>`; }
    return series.map(s => {
      const z = s.zone[i], first = s.zone[Math.min(1, last)], end = s.zone[last], inside = readInsideOdds({ s, i, kit });
      if (!Number.isFinite(z.lo) && !Number.isFinite(z.hi)) { return `<span class="dr"><i class="lsw" style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} · no profit at spot on ${kit.esc(kit.dayLabel(time.stops[i].date))}</span>`; }
      const width = zz => zz.hi - zz.lo;
      return `<span class="dr"><i class="lsw" style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} · ${kit.esc(kit.dayLabel(time.stops[i].date))}: in profit between <b>${pct(z.lo)}</b> and <b>${pct(z.hi)}</b>${Number.isFinite(inside) ? ` · odds the price is inside that day ${(inside * 100).toFixed(0)}%` : ""}${Number.isFinite(width(first)) && Number.isFinite(width(end)) ? ` · the zone is ${(width(first) * 100).toFixed(0)} points wide after one day and ${(width(end) * 100).toFixed(0)} at expiry` : ""}</span>`;
    }).join("");
  }

  // ---------------------------------------------------------- EV map
  function renderEv({ time, kit }) {
    const { C } = kit, host = kit.host, W = Math.max(host.clientWidth, 600);
    const sides = sidesOf(C);
    if (!sides.length) { host.innerHTML = `<p class="muted">Both positions are n/a.</p>`; return; }
    kit.title(`EV map · where the expected P&L ${time.isExpiry ? "at expiry" : `on ${kit.dayLabel(time.stops[time.index].date)}`} comes from (period-vol odds)`);
    if (time.elapsed < 1) { host.innerHTML = `<p class="muted lensempty">Today the price is where it is: step at least one trading day on (or to expiry) to see where the expected P&amp;L comes from.</p>`; kit.legend(""); kit.read(""); return; }
    const series = sides.map(([side, b, , scale]) => {
      const vol = C.volOf(b.tk).pct / 100, t = yearsOf(b, Math.min(time.elapsed, b.dte)), tau = kit.tauAfter({ b, elapsed: time.elapsed });
      const value = mm => scale * pnlAt({ b, price: b.S * Math.exp(mm), tau, shock: C.shock }) / b.S;
      const cdf = mm => DIST.lognormalCdf({ x: mm, vol, t }), sigma = vol * Math.sqrt(t);
      return { side, b, sigma, ...readEvCells({ value, cdf, span: CONFIG.evSpan * sigma }) };
    });
    const m = { l: 62, r: 100, t: 18, b: 40 }, H1 = 230, H2 = 96, gap = 16, plotW = W - m.l - m.r, y1 = m.t, y2 = y1 + H1 + gap, H = y2 + H2 + m.b;
    // the view: ±3σ of the wider side in log moves (the cells run to ±4.5σ, so the totals include what is off the view)
    const span = Math.max(...series.map(s => CONFIG.evView * s.sigma)), xlo = Math.exp(-span) - 1, xhi = Math.exp(span) - 1;
    const X = r => m.l + (r - xlo) / (xhi - xlo) * plotW, retOf = mm => Math.exp(mm) - 1;
    // density per 1% of move, so the curve's height does not depend on the cell size
    const densityOf = c => c.ev / Math.max(1e-12, (retOf(c.m1) - retOf(c.m0)) * 100);
    const dens = series.flatMap(s => s.cells.map(densityOf)).filter(Number.isFinite);
    let ylo = Math.min(0, ...dens), yhi = Math.max(0, ...dens); const pad = (yhi - ylo) * 0.08 || 1e-6; ylo -= pad; yhi += pad;
    const runs = series.flatMap(s => s.cells.map(c => c.running));
    let rlo = Math.min(0, ...runs), rhi = Math.max(0, ...runs); const rp = (rhi - rlo) * 0.12 || 1e-6; rlo -= rp; rhi += rp;
    const Y = v => y1 + (yhi - v) / (yhi - ylo) * H1, Y2 = v => y2 + (rhi - v) / (rhi - rlo) * H2;
    const svg = /** @type {SVGSVGElement} */ (el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Expected P&L by price, and its running total" }, host)), ax = el("g", { class: "ax" }, svg);
    drawValueTicks({ ax, lo: ylo, hi: yhi, n: 5, height: H1, Y, left: m.l, right: W - m.r, format: (v, step) => kit.fUt(v, step), kit });
    drawValueTicks({ ax, lo: rlo, hi: rhi, n: 3, height: H2, Y: Y2, left: m.l, right: W - m.r, format: (v, step) => kit.fUt(v, step), kit });
    for (const r of kit.payTicks(xlo, xhi, Math.floor(W / 90), plotW).map(t => t.v)) { el("line", { x1: X(r), x2: X(r), y1: y1, y2: y2 + H2 }, ax); txt(ax, X(r), y2 + H2 + 14, pct(r, 0), { "text-anchor": "middle" }); }
    txt(svg, m.l - 8, y2 + H2 + 14, "move", { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg); el("line", { x1: m.l, x2: W - m.r, y1: Y2(0), y2: Y2(0), stroke: "var(--ink-3)" }, svg);
    // A as signed areas (gain / loss colours), B as a line; the running total below for both
    const a = series[0], z = Y(0);
    let gain = "", loss = "";
    for (const c of a.cells.filter(cc => retOf(cc.mid) >= xlo && retOf(cc.mid) <= xhi)) { const x0 = X(retOf(c.m0)), x1 = X(retOf(c.m1)), v = densityOf(c), s = `M${x0.toFixed(1)} ${z}L${x0.toFixed(1)} ${Y(v).toFixed(1)}L${x1.toFixed(1)} ${Y(v).toFixed(1)}L${x1.toFixed(1)} ${z}Z`; if (v >= 0) { gain += s; } else { loss += s; } }
    el("path", { d: gain, fill: "var(--pos)", "fill-opacity": .35 }, svg); el("path", { d: loss, fill: "var(--neg)", "fill-opacity": .35 }, svg);
    for (const s of series) {
      const shown = s.cells.filter(c => retOf(c.mid) >= xlo && retOf(c.mid) <= xhi);
      el("path", { d: pathOf(shown.map(c => [retOf(c.mid), densityOf(c)]), X, Y), fill: "none", stroke: `var(--${s.side})`, "stroke-width": s === a ? 1.4 : 2 }, svg);
      el("path", { d: pathOf(shown.map(c => [retOf(c.m1), c.running]), X, Y2), fill: "none", stroke: `var(--${s.side})`, "stroke-width": 2 }, svg);
    }
    // the totals at the right edge (everything, off the view too); two close totals stack instead of overlapping
    const ends = series.map(s => ({ s, y: Y2(s.total) })).sort((p, r) => p.y - r.y);
    ends.forEach((e, k) => { const y = k > 0 && e.y - ends[k - 1].y < 12 ? ends[k - 1].y + 12 : e.y; e.y = y; txt(svg, W - m.r + 5, y + 4, `${nameOf(e.s.side, kit)} ${kit.fU(e.s.total)}`, { fill: `var(--${e.s.side})`, "font-size": 11, "font-weight": 600 }); });
    txt(svg, m.l + 6, y1 + 12, "P&L × odds, per 1% of move: the area is the expected P&L", { fill: "var(--ink-2)", "font-size": 11, ...halo });
    txt(svg, m.l + 6, y2 + 12, "running total from the left: ends at the expected P&L", { fill: "var(--ink-2)", "font-size": 11, ...halo });
    kit.legend(series.map(s => `<span><i style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} ${kit.esc(C.labels[s.side.toUpperCase()].full)}</span>`).join(" ") + ` <span class="muted">· A's area: <span style="color:var(--pos)">adds</span> / <span style="color:var(--neg)">takes away</span> · odds at each ticker's period vol · ±${CONFIG.evView}σ shown; the totals run to ±${CONFIG.evSpan}σ (beyond: at the edge's P&amp;L)</span>`);
    kit.read(describeEvReadout({ series, time, kit }));
    // hover: the cell under the pointer, for each side
    const cross = el("line", { y1: y1, y2: y2 + H2, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: y1, width: plotW, height: y2 + H2 - y1, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const r0 = svg.getBoundingClientRect(), r = xlo + ((ev.clientX - r0.left) * W / r0.width - m.l) / plotW * (xhi - xlo), mm = Math.log(1 + r);
      cross.setAttribute("x1", String(X(r))); cross.setAttribute("x2", String(X(r))); cross.setAttribute("visibility", "visible");
      const rows = series.map(s => { const c = s.cells.find(cc => mm >= cc.m0 && mm < cc.m1) || s.cells[s.cells.length - 1]; return `<span class="s">${nameOf(s.side, kit)} · ${MOVES.chip(mm / s.sigma)}</span>` + krow("P&amp;L here", kit.fU(c.pnl)) + krow("running total", kit.fU(c.running)); }).join("");
      showTip(`<span class="h">move ${pct(r)}</span>${rows}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
    kit.keep({ ev: series.map(s => ({ side: s.side, total: s.total, cells: s.cells.length })) });
  }
  // the EV in words: the total, and how much of the expected loss sits beyond 1.5σ either way
  /** @param {{ series: any[], time: any, kit: any }} input */
  function describeEvReadout({ series, time, kit }) {
    return series.map(s => {
      const sum = pick => s.cells.filter(pick).reduce((acc, c) => acc + c.ev, 0);
      const losses = sum(c => c.ev < 0), farDown = sum(c => c.ev < 0 && c.mid < -MOVES.CLEAR * s.sigma), farUp = sum(c => c.ev < 0 && c.mid > MOVES.CLEAR * s.sigma);
      const share = v => losses < 0 ? `${(v / losses * 100).toFixed(0)}%` : "–";
      return `<span class="dr"><i class="lsw" style="background:var(--${s.side})"></i>${nameOf(s.side, kit)} · expected P&amp;L ${time.isExpiry ? "at expiry" : `if closed ${kit.esc(kit.dayLabel(time.stops[time.index].date))}`} <b class="${kit.pn(s.total)}">${kit.fU(s.total)}</b> · gains ${kit.fU(sum(c => c.ev > 0))}, losses ${kit.fU(losses)} · of the losses, <span class="mvc-down">${share(farDown)} from a clear fall</span> and <span class="mvc-up">${share(farUp)} from a clear rise</span> (beyond 1.5σ)</span>`;
    }).join("");
  }

  /** @param {{ lens: string, time: any, kit: any }} input */
  function render({ lens, time, kit }) {
    kit.host.innerHTML = "";
    if (lens === PayLens.Move) { renderMove({ time, kit }); return; }
    if (lens === PayLens.Zone) { renderZone({ time, kit }); return; }
    renderEv({ time, kit });
  }
  const math = Object.freeze({ findEdge, readDayBreakEvens, readZone, readEvCells, oddsBelow });
  return Object.freeze({ render, math, CONFIG });
})();
