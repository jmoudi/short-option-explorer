// ============================================================ ui_capture: Capture, the Compare tab's second junior tab
// What A and B keep of their maximum payoff (the credit, for a short straddle or strangle), weighed by the odds:
// named presets with their explanations, the curve of the odds of keeping at least x, what time alone gives when the
// price does not move, and one basic custom variant. The maths is CAPTURE (capture.js); the managed preset reads the
// comparer's MANAGE simulator with the Manage panel's rule. Reads only C and the store; changes state only through
// commands. Top-level name: CAPTURE_VIEW.
const CAPTURE_VIEW = (() => {
  let C = null, HOST = null;
  const q = s => HOST.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const V = () => page.store.read().prefs;
  const run = command => page.executor.execute(Object.assign({ source: "capture" }, command));
  const setPref = patch => run({ type: Command.SetPref, patch });
  const askFrame = () => page.frames.mark({ cause: FrameCause.Ui });
  const SIDES = Object.freeze(["A", "B"]);
  const keyHtml = side => `<span class="key ${side.toLowerCase()}">${side}</span>`;
  // daily closes typed or pasted for the empirical preset, per ticker, for this session (the data feed may bring them)
  const pastedCloses = new Map(), pastedText = new Map();
  let closesVersion = 0;
  const memo = new Map();
  const VIEW_CONFIG = Object.freeze({ memoSize: 40, chartHeight: 230, lowestShown: -3, managedDelayMs: 30 });
  const MANAGE_JOB = { id: 0 };

  // ---------------------------------------------------------- formatting
  const signedPct = (v, digits = 1) => { if (!Number.isFinite(v)) { return "–"; } const t = Math.abs(v * 100).toFixed(digits); return (+t === 0 ? "" : v < 0 ? MINUS : "+") + t + "%"; };
  const plainPct = (v, digits = 0) => Number.isFinite(v) ? (v * 100).toFixed(digits) + "%" : "–";
  const pts = v => { if (!Number.isFinite(v)) { return ""; } const t = Math.abs(v * 100).toFixed(1); return (+t === 0 ? "" : v < 0 ? MINUS : "+") + t + " pts"; };
  // dollars with the sign of the amount: a loss prints with its minus
  const usd = v => (v < 0 && Math.round(Math.abs(v)) !== 0 ? MINUS : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
  const ordinal = n => { const k = Math.round(n), tens = k % 100; return k + (tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"); };
  const tone = v => !Number.isFinite(v) ? "" : v > 0.0005 ? "pos" : v < -0.0005 ? "neg" : "";

  // ---------------------------------------------------------- one side's readings
  // the position as plain functions per share, for CAPTURE: P&L at expiry, P&L if closed with tau years left
  function adaptPosition(b) {
    const payoff = S => POS.payoff(b, S);
    const value = (S, tau) => tau > 0 ? POS.val(b, S, tau) : POS.payoff(b, S);
    return { payoff, value, strikes: b.legs.map(l => l.K), S0: b.S, years: b.T, days: b.dte };
  }
  const closesFor = id => pastedCloses.get(id) || (INST.base(id) && INST.base(id).closes) || [];
  // the custom variant's scenario and P&L, from the prefs
  /** @param {{ b: any, position: any, vw: any }} input */
  function buildCustom({ b, position, vw }) {
    const vol = vw.ccSrc === CAPTURE.VolSourceChoice.AtmIv ? b.E.atm : vw.ccSrc === CAPTURE.VolSourceChoice.Typed ? vw.ccVol / 100 : C.volOf(b.tk).pct / 100;
    // closing early happens at least a day before expiry: the days left are capped at the position's life − 1
    const daysLeft = vw.ccExit === CAPTURE.Exit.DaysLeft ? clamp(Math.round(vw.ccLeft), 0, Math.max(0, b.dte - 1)) : 0;
    const elapsedYears = b.T * (b.dte - daysLeft) / b.dte, tauLeft = b.T * daysLeft / b.dte;
    const base = CAPTURE.lognormal({ S0: b.S, vol, years: elapsedYears });
    const scenario = CAPTURE.withGap({ scenario: base, chance: vw.ccGapP / 100, size: vw.ccGapS / 100, side: vw.ccGapSide });
    const pnl = daysLeft > 0 ? S => position.value(S, tauLeft) : position.payoff;
    return { vol, daysLeft, scenario, pnl };
  }
  const readCustom = ({ measured, vw }) => vw.ccRead === CAPTURE.Reading.Median ? measured.median : vw.ccRead === CAPTURE.Reading.Percentile ? measured.quantile(vw.ccPct / 100) : measured.mean;
  // every reading of one side, memoized on what it depends on
  /** @param {{ side: string, b: any, vw: any }} input */
  function readSide({ side, b, vw }) {
    if (b.na) { return { side, b, na: true, reason: b.naReason }; }
    const vol = C.volOf(b.tk).pct / 100, closes = closesFor(b.tk);
    const capital = vw.rdCap === Capital.Notional ? b.S : b.margin;
    const key = [b.key, b.typedKey, vol, capital, vw.capX, vw.ccSrc, vw.ccVol, vw.ccGapP, vw.ccGapS, vw.ccGapSide, vw.ccRead, vw.ccPct, vw.ccExit, vw.ccLeft, closes.length, closes[closes.length - 1]].join("|");
    const cached = memo.get(key);
    if (cached) { return Object.assign({}, cached, { side, b, managed: readManaged({ b, vw }) }); }
    const position = adaptPosition(b), maxResult = CAPTURE.findMaxPayoff(position);
    if (!maxResult.ok) { return { side, b, na: true, reason: maxResult.error.message }; }
    const max = maxResult.value, x = vw.capX / 100;
    const scenario = CAPTURE.lognormal({ S0: b.S, vol, years: b.T });
    const measured = CAPTURE.measure({ pnl: position.payoff, scenario, maxPayoff: max });
    // the market's own odds: the comparer's implied EV (the fill against mid), the same number as its EV row
    const implied = C.stats(b, Odds.Implied), impliedMean = implied ? implied.ev / max : NaN;
    const time = CAPTURE.timePath({ value: position.value, S0: b.S, years: b.T, days: b.dte, maxPayoff: max, x });
    const growth = CAPTURE.growth({ pnl: position.payoff, scenario, capitalPerShare: capital, maxPayoff: max });
    const band = CAPTURE.findKeepBand({ payoff: position.payoff, maxPayoff: max, x, S0: b.S });
    const empiricalScenario = CAPTURE.fromCloses({ S0: b.S, closes, days: b.dte });
    const empirical = empiricalScenario.ok ? Result.ok(CAPTURE.measure({ pnl: position.payoff, scenario: empiricalScenario.value, maxPayoff: max })) : empiricalScenario;
    const custom = buildCustom({ b, position, vw }), customMeasured = CAPTURE.measure({ pnl: custom.pnl, scenario: custom.scenario, maxPayoff: max });
    const reading = { side, b, na: false, max, vol, x, capitalWord: vw.rdCap === Capital.Notional ? "notional" : "margin", capitalPerShare: capital, measured, impliedMean, time, growth, band, empirical, custom: { ...custom, measured: customMeasured, value: readCustom({ measured: customMeasured, vw }) } };
    if (memo.size > VIEW_CONFIG.memoSize) { memo.clear(); }
    memo.set(key, reading);
    return Object.assign({}, reading, { managed: readManaged({ b, vw }) });
  }
  // the Manage panel's rule on this position: the memoized simulation, or null while it still has to run
  const manageInputs = ({ b, vw }) => ({ built: b, vol: C.volOf(b.tk).pct / 100, takeProfit: vw.mgTp / 100, stopLoss: vw.mgSl / 100, shock: C.shock });
  const readManaged = ({ b, vw }) => b.cr > 0 ? MANAGE.peek(manageInputs({ b, vw })) : Result.err({ code: "net_debit", message: "a net debit has no credit to manage" });
  // the simulations still missing run after this paint, then the view draws again
  function scheduleManaged(readings, vw) {
    const pending = readings.filter(r => !r.na && r.managed === null);
    if (!pending.length) { return; }
    const job = ++MANAGE_JOB.id;
    setTimeout(() => {
      if (job !== MANAGE_JOB.id) { return; }
      for (const r of pending) { MANAGE.simulate(manageInputs({ b: r.b, vw })); }
      askFrame();
    }, VIEW_CONFIG.managedDelayMs);
  }

  // ---------------------------------------------------------- the named presets
  // each preset: its name, one line on what it is, the knob's detail, and per side { value, text, sub }
  /** @typedef {{ value: number, text: string, sub?: string, alert?: string, unit: string, tone?: string }} PresetCell */
  const PRESETS = Object.freeze([
    {
      id: CAPTURE.Preset.Fixed, tex: String.raw`c = x`, name: "Fixed share", line: "an assumption: {x} of the maximum kept every cycle",
      knob: "A typed assumption, not a reading: the rule of thumb ‘expect half the credit’. It is a target for closing a trade early, not what a held trade averages. Under it: how often a cycle actually keeps that much. Use it to see what a plan built on it implies, never as the expectation.",
      cell: r => ({ value: r.x, text: signedPct(r.x, 0), sub: `actually kept that often: ${plainPct(r.measured.oddsAtLeast(r.x))}`, unit: "capture" })
    },
    {
      id: CAPTURE.Preset.Expected, tex: String.raw`\bar c = \frac{\mathbb{E}[\text{P\&L}]}{M} \approx 1 - \frac{\sigma_{\text{period}}}{\sigma_{\text{IV}}}`, name: "Expected", line: "the average outcome: every expiry price weighed by its odds, held to expiry",
      knob: "Expected P&L at expiry over the maximum payoff, with the price spread at the ticker's period vol (a zero-drift lognormal, as every EV reading here). For an at-the-money straddle it is about 1 − period vol / implied vol: the vol edge of the fill, counted in credits. It is 0 at the break-even vol. The Comparison's Expected value row matches this only when its odds are set to period vol. Under it: the market's own odds (the implied distribution), which measure only the fill against mid; the Comparison's EV row shows the same at implied odds.",
      cell: r => ({ value: r.measured.mean, text: signedPct(r.measured.mean), sub: `market's own odds: ${signedPct(r.impliedMean)}`, unit: "capture" })
    },
    {
      id: CAPTURE.Preset.Median, tex: String.raw`\tilde c = \frac{\operatorname{median}(\text{P\&L})}{M} \approx 1 - 0.845\,\frac{\sigma_{\text{period}}}{\sigma_{\text{IV}}}`, name: "Median", line: "what a typical cycle keeps: half keep more, half less",
      knob: "Short premium makes many small wins and a few large losses, so a typical cycle keeps more than the average. With no vol edge an at-the-money straddle's median keeps about 15% while its average is about 0: the gap is what the rare large losses cost.",
      cell: r => ({ value: r.measured.median, text: signedPct(r.measured.median), sub: `average ${signedPct(r.measured.mean)}`, unit: "capture" })
    },
    {
      id: CAPTURE.Preset.OddsAtLeast, tex: String.raw`P(c \ge x) \approx 2\,\Phi\!\Big(0.80\,(1-x)\,\frac{\sigma_{\text{IV}}}{\sigma_{\text{period}}}\Big) - 1`, name: "Odds of keeping at least x", line: "how often a cycle keeps {x} or more; at 0, the profit odds",
      knob: "The share of outcomes whose expiry P&L is at least x of the maximum payoff, at the period vol. Under it: the price band that keeps x, and the profit odds (x = 0).",
      cell: r => ({ value: r.measured.oddsAtLeast(r.x), text: plainPct(r.measured.oddsAtLeast(r.x), 1), sub: `${describeBand(r.band)} · profit ${plainPct(r.measured.oddsAtLeast(0))}`, unit: "odds" })
    },
    {
      id: CAPTURE.Preset.Managed, tex: String.raw`\frac{\mathbb{E}[\text{P\&L}_{\tau}]}{M},\quad \tau = \min(t_{\text{TP}},\, t_{\text{stop}},\, T)`, name: "Managed", line: "closed at the take profit or the stop of Manage the trade, else held",
      knob: "Seeded daily price paths at the period vol, each day marked on the implied smile; the trade closes when its P&L reaches the take profit or the stop set in Comparison → Manage the trade. The average over all paths, in % of the maximum payoff. Under it: the share closed at the take profit and the average per day held, the rate at which freed margin can be put to work again.",
      cell: r => describeManagedCell(r)
    },
    {
      id: CAPTURE.Preset.TimePath, tex: String.raw`c(t) = \frac{V(S_0,T) - V(S_0,T-t)}{M} \approx 1 - \sqrt{1 - t/T}`, name: "Time path", line: "kept so far if the price does not move at all",
      knob: "The position's own mark (the implied smile) at an unchanged price as days pass: time decay alone. For an at-the-money straddle it is close to 1 − √(time left / total time): about 29% half-way, and half the maximum only after about three quarters of the time. This is where ‘half the credit’ comes from: what a quiet market gives late in a cycle.",
      cell: r => ({ value: r.time.atHalf, text: `${signedPct(r.time.atHalf)} half-way`, sub: Number.isFinite(r.time.dayToX) ? `x kept on day ${r.time.dayToX.toFixed(1)} of ${r.time.days}` : `x not kept before expiry`, unit: "capture" })
    },
    {
      id: CAPTURE.Preset.Growth, tex: String.raw`g = \mathbb{E}\,\ln\!\Big(1 + \frac{\text{P\&L}}{C}\Big),\qquad c_{\text{eq}} = \frac{(e^{g}-1)\,C}{M}`, name: "Growth", line: "the fixed share that compounds like the real outcomes, on the Recovery panel's capital",
      knob: "Compounding multiplies outcomes: losing 50% needs +100% to get back. So the rate that compounds is the average of ln(1 + P&L / capital), not the average P&L. The capital is the one the Recovery panel uses (Recovery dynamics → Measured on ▾ → Capital per position: margin or notional). Shown as the fixed share of the maximum that, kept every cycle, compounds to the same growth; it sits below the expected share. When one cycle can lose the whole capital, compounding ends at zero sooner or later: the cell says so, and gives the growth of the cycles without a wipe-out. Sizing the position to a smaller share of the capital (or measuring on notional) avoids it.",
      cell: r => describeGrowthCell(r)
    },
    {
      id: CAPTURE.Preset.Empirical, tex: String.raw`\bar c = \frac{1}{n}\sum_{i} \frac{\text{P\&L}\big(S_0\,S_{i+h}/S_i\big)}{M}`, name: "Empirical", line: "the ticker's own past moves over the same number of days",
      knob: "Every overlapping window of daily closes as long as the position's life, applied to today's position and weighed the same. It shows what actually happened, large moves and gaps included, but only what happened in the sample. Needs daily price history: paste closes below (oldest first), or they arrive with the data feed.",
      cell: r => !r.empirical.ok ? { value: NaN, text: "needs closes", sub: esc(r.empirical.error.message), unit: "capture" } : ({ value: r.empirical.value.mean, text: signedPct(r.empirical.value.mean), sub: `median ${signedPct(r.empirical.value.median)} · keeps ≥ ${Math.round(r.x * 100)}% in ${plainPct(r.empirical.value.oddsAtLeast(r.x))} of cycles`, unit: "capture" })
    }
  ]);
  // the prices that keep at least x: a band, a side (one edge open) or every price
  function describeBand(band) {
    if (!band) { return "no price keeps that much"; }
    const [low, high] = band;
    if (low === null && high === null) { return "at any price"; }
    if (low === null) { return `below ${fPx2(high)}`; }
    if (high === null) { return `above ${fPx2(low)}`; }
    return `inside ${fPx2(low)}–${fPx2(high)}`;
  }
  // Growth: not finite when a wipe-out is possible (the floor would set it); the cycles without one reported apart
  /** @returns {PresetCell} */
  function describeGrowthCell(r) {
    if (!r.growth.ok) { return { value: NaN, text: "–", sub: esc(r.growth.error.message), unit: "capture" }; }
    const g = r.growth.value;
    if (g.isRuinous) { return { value: NaN, text: "ends at zero", alert: describeSurvival(r, g.survivalScale), sub: `at this size the ${r.capitalWord} is wiped out in ${plainPct(g.ruin, 2)} of cycles; without those: ${signedPct(g.survivorCapture)}`, unit: "capture", tone: "neg" }; }
    return { value: g.equivalentCapture, text: signedPct(g.equivalentCapture), sub: `${signedPct(g.perCycle, 2)} a cycle on ${r.capitalWord}`, unit: "capture" };
  }
  // the next step after a wipe-out: the size that survives, said first and in the loss colour
  const describeSurvival = (r, scale) => SURVIVAL.line({ scale, test: `with wipe-out odds under ${SURVIVAL.oddsWords(CAPTURE.CONFIG.ruinShown)}`,
    capital: Number.isFinite(scale) && scale > 0 ? SURVIVAL.capital({ usd: r.capitalPerShare * 100 / +SURVIVAL.floor2(scale), tk: esc(r.b.tk), multiple: 1 / +SURVIVAL.floor2(scale), base: r.capitalWord }) : "" });
  /** @returns {PresetCell} */
  function describeManagedCell(r) {
    if (r.managed === null) { return { value: NaN, text: "computing…", unit: "capture" }; }
    if (!r.managed.ok) { return { value: NaN, text: "–", sub: esc(r.managed.error.message), unit: "capture" }; }
    const m = r.managed.value, capture = m.managedMean / r.max;
    return { value: capture, text: signedPct(capture), sub: `take profit ${plainPct(m.takeProfit.share)} · ${signedPct(m.managedPerDay / r.max, 2)} a day held`, unit: "capture" };
  }

  // ---------------------------------------------------------- the table
  function describeHeader(readings) {
    return readings.map(r => r.na ? `${keyHtml(r.side)} n/a: ${esc(r.reason)}` : `${keyHtml(r.side)}<b>${esc(r.b.label.tab)}</b> maximum <b>${usd(r.max * 100)}</b> a contract${Math.abs(r.max - r.b.cr) < 1e-9 ? " (the credit)" : ""} · odds at ${esc(C.volOf(r.b.tk).label)}`).join("<br>");
  }
  function describeTable(readings) {
    const live = readings.filter(r => !r.na), vw = V();
    const head = `<tr><th>Preset</th>${live.map(r => `<th>${keyHtml(r.side)}</th>`).join("")}${live.length === 2 ? "<th>A − B</th>" : ""}</tr>`;
    const rows = PRESETS.map(preset => {
      const cells = live.map(r => preset.cell(r));
      const diff = cells.length === 2 && Number.isFinite(cells[0].value) && Number.isFinite(cells[1].value) && preset.id !== CAPTURE.Preset.Fixed ? pts(cells[0].value - cells[1].value) : "";
      const name = `<b>${esc(preset.name)}</b>${KNOBS.html({ id: `cap-${preset.id}`, title: preset.name, body: preset.knob })}<span class="cap">${esc(preset.line.replace(/\{x\}/g, `${vw.capX}%`))}</span>${preset.tex ? `<span class="ftex">${TEX.html(preset.tex)}</span>` : ""}`;
      return `<tr data-preset="${preset.id}"><td>${name}</td>${cells.map(c => `<td><span class="cv ${c.tone || (c.unit === "capture" ? tone(c.value) : "")}">${c.text}</span>${c.alert ? `<span class="cpa">${c.alert}</span>` : ""}${c.sub ? `<span class="cps">${c.sub}</span>` : ""}</td>`).join("")}${live.length === 2 ? `<td class="cd">${diff}</td>` : ""}</tr>`;
    }).join("");
    return `<thead>${head}</thead><tbody>${rows}</tbody>`;
  }

  // ---------------------------------------------------------- the charts
  // the odds of keeping at least x: A and B at the period vol (solid), the custom variant (dashed), x marked
  function renderCurve(readings) {
    const host = q("#cap-curve"); host.innerHTML = "";
    const live = readings.filter(r => !r.na);
    if (!live.length) { return; }
    const W = Math.max(host.clientWidth, 420), H = VIEW_CONFIG.chartHeight, m = { l: 44, r: 14, t: 14, b: 34 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const floorAt = Math.min(-1, ...live.map(r => Math.floor(r.measured.quantile(0.01) * 2) / 2));
    const lo = Math.max(VIEW_CONFIG.lowestShown, floorAt), hi = 1, x = V().capX / 100;
    const X = v => m.l + (v - lo) / (hi - lo) * pw, Y = p => m.t + (1 - p) * ph, xOfPx = px => lo + (px - m.l) / pw * (hi - lo);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Odds of keeping at least each share of the maximum payoff" }, host), ax = el("g", { class: "ax" }, svg);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, plainPct(t), { "text-anchor": "end" }); }
    for (const t of ticks(lo, hi, Math.max(3, Math.floor(pw / 70)))) { el("line", { x1: X(t), x2: X(t), y1: m.t, y2: H - m.b }, ax); txt(ax, X(t), H - m.b + 14, signedPct(t, 0), { "text-anchor": "middle" }); }
    txt(svg, m.l + pw / 2, H - 4, "kept, % of the maximum payoff (at least)", { "text-anchor": "middle", fill: "var(--ink-3)", "font-size": 10 });
    if (x >= lo && x <= hi) { el("line", { x1: X(x), x2: X(x), y1: m.t, y2: H - m.b, stroke: "var(--ink-3)", "stroke-dasharray": "4 3" }, svg); txt(svg, X(x) + 4, m.t + 10, `x ${signedPct(x, 0)}`, { fill: "var(--ink-3)", "font-size": 10, ...halo }); }
    const curveOf = measured => measured.curve.filter(p => p.x >= lo - 1e-9).map(p => [p.x, p.odds]);
    const showsVariant = !isVariantDefault(V());
    for (const r of live) {
      const col = `var(--${r.side.toLowerCase()})`;
      if (showsVariant) { el("path", { d: pathOf(curveOf(r.custom.measured), X, Y), fill: "none", stroke: col, "stroke-width": 1.3, "stroke-dasharray": "5 4", "stroke-opacity": .8 }, svg); }
      el("path", { d: pathOf(curveOf(r.measured), X, Y), fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      if (x >= lo && x <= hi) { el("circle", { cx: X(x), cy: Y(r.measured.oddsAtLeast(x)), r: 3.5, fill: col, stroke: "var(--surface)", "stroke-width": 1.5 }, svg); }
    }
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const r = svg.getBoundingClientRect(), v = clamp(xOfPx((ev.clientX - r.left) * W / r.width), lo, hi);
      cross.setAttribute("x1", X(v)); cross.setAttribute("x2", X(v)); cross.setAttribute("visibility", "visible");
      showTip(describeKeepAtLeast({ x: v, live }), ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
    AXES.attach({ svg, orient: "x", band: { x: m.l, y: H - m.b, width: pw, height: m.b }, guide: { from: m.t, to: H - m.b }, toValue: px => clamp(xOfPx(px), lo, hi), toPx: X, describe: v => describeKeepAtLeast({ x: v, live }) });
    AXES.attach({ svg, orient: "y", band: { x: 0, y: m.t, width: m.l, height: ph }, guide: { from: m.l, to: W - m.r }, toValue: py => clamp(1 - (py - m.t) / ph, 0, 1), toPx: Y, describe: p => describeKeptWithOdds({ odds: p, live }) });
  }
  /** @param {{ x: number, live: any[] }} input */
  function describeKeepAtLeast({ x, live }) {
    const showsVariant = !isVariantDefault(V());
    const rows = live.map(r => krow(`<i class="sw" style="background:var(--${r.side.toLowerCase()})"></i>${r.side} at period vol${showsVariant ? " · your variant" : ""}`, `${plainPct(r.measured.oddsAtLeast(x), 1)}${showsVariant ? ` · ${plainPct(r.custom.measured.oddsAtLeast(x), 1)}` : ""}`)).join("");
    const dollars = live.map(r => krow(`${r.side}: that is`, x < 0 ? `a loss of ${usd(-x * r.max * 100)} a contract or less` : `${usd(x * r.max * 100)} a contract or more`)).join("");
    return `<span class="h">keeps at least ${signedPct(x, 0)} of the maximum</span>${rows}${dollars}`;
  }
  /** @param {{ odds: number, live: any[] }} input */
  function describeKeptWithOdds({ odds, live }) {
    const rows = live.map(r => krow(`${r.side} keeps at least`, `${signedPct(r.measured.quantile(1 - odds))} · ${usd(r.measured.quantile(1 - odds) * r.max * 100)} a contract`)).join("");
    return `<span class="h">with odds ${plainPct(odds)}</span>${rows}`;
  }
  // kept with no move, by day: A and B, the x line
  function renderTimePath(readings) {
    const host = q("#cap-time"); host.innerHTML = "";
    const live = readings.filter(r => !r.na);
    if (!live.length) { return; }
    const W = Math.max(host.clientWidth, 300), H = VIEW_CONFIG.chartHeight, m = { l: 44, r: 14, t: 14, b: 34 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const days = Math.max(...live.map(r => r.time.days)), x = V().capX / 100;
    const lo = Math.min(0, ...live.flatMap(r => r.time.curve.map(p => p.kept))), hi = 1;
    const X = d => m.l + d / days * pw, Y = v => m.t + (hi - v) / (hi - lo) * ph;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Kept with no move, by day" }, host), ax = el("g", { class: "ax" }, svg);
    for (const t of ticks(lo, hi, 4)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, signedPct(t, 0), { "text-anchor": "end" }); }
    for (const t of ticks(0, days, Math.max(3, Math.floor(pw / 60)))) { txt(ax, X(t), H - m.b + 14, String(Math.round(t)), { "text-anchor": "middle" }); }
    txt(svg, m.l + pw / 2, H - 4, "days since entry, price unchanged", { "text-anchor": "middle", fill: "var(--ink-3)", "font-size": 10 });
    if (x > lo && x < hi) { el("line", { x1: m.l, x2: W - m.r, y1: Y(x), y2: Y(x), stroke: "var(--ink-3)", "stroke-dasharray": "4 3" }, svg); }
    for (const r of live) { el("path", { d: pathOf(r.time.curve.map(p => [p.day, p.kept]), X, Y), fill: "none", stroke: `var(--${r.side.toLowerCase()})`, "stroke-width": 2 }, svg); }
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const rect = svg.getBoundingClientRect(), d = clamp(((ev.clientX - rect.left) * W / rect.width - m.l) / pw * days, 0, days);
      cross.setAttribute("x1", X(d)); cross.setAttribute("x2", X(d)); cross.setAttribute("visibility", "visible");
      const rows = live.map(r => { const p = r.time.curve.reduce((best, c) => Math.abs(c.day - d) < Math.abs(best.day - d) ? c : best); return krow(`<i class="sw" style="background:var(--${r.side.toLowerCase()})"></i>${r.side}${d > r.time.days ? " (expired)" : ""}`, `${signedPct(p.kept)} · ${usd(p.kept * r.max * 100)}`); }).join("");
      showTip(`<span class="h">day ${d.toFixed(1)}, price unchanged</span>${rows}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
  }

  // ---------------------------------------------------------- the custom variant
  // the variant at its defaults is the Expected preset: period vol, no gap, the average, held to expiry
  const isVariantDefault = vw => vw.ccSrc === CAPTURE.VolSourceChoice.PeriodVol && !(vw.ccGapP > 0 && vw.ccGapS > 0) && vw.ccRead === CAPTURE.Reading.Mean && vw.ccExit === CAPTURE.Exit.Expiry;
  function describeCustomSetup(vw) {
    const vol = vw.ccSrc === CAPTURE.VolSourceChoice.AtmIv ? "each expiry's ATM IV" : vw.ccSrc === CAPTURE.VolSourceChoice.Typed ? `${vw.ccVol}% vol` : "each ticker's period vol";
    const gap = vw.ccGapP > 0 && vw.ccGapS > 0 ? `, plus a ${vw.ccGapP}% chance a cycle of a ${vw.ccGapS}% gap ${vw.ccGapSide === CAPTURE.GapSide.Either ? "either way" : "down"}` : "";
    const reading = vw.ccRead === CAPTURE.Reading.Median ? "the median" : vw.ccRead === CAPTURE.Reading.Percentile ? `the ${ordinal(vw.ccPct)} percentile` : "the average";
    const exit = vw.ccExit === CAPTURE.Exit.DaysLeft ? ", closed early at the model's mark (days left per side below)" : ", held to expiry";
    return `${reading} of a lognormal at ${vol}${gap}${exit}`;
  }
  function describeCustomOutput(readings, vw) {
    const live = readings.filter(r => !r.na);
    const cells = live.map(r => `<span class="ccv">${keyHtml(r.side)}<b class="${tone(r.custom.value)}">${signedPct(r.custom.value)}</b><span class="muted"> · ${usd(r.custom.value * r.max * 100)} a ${esc(r.b.tk)} contract · keeps ≥ ${vw.capX}% in ${plainPct(r.custom.measured.oddsAtLeast(r.x))} of cycles${vw.ccSrc !== CAPTURE.VolSourceChoice.PeriodVol ? ` · vol ${plainPct(r.custom.vol)}` : ""}${vw.ccExit === CAPTURE.Exit.DaysLeft ? ` · closed with ${r.custom.daysLeft} of ${r.b.dte} days left` : ""}</span></span>`).join("");
    const note = isVariantDefault(vw) ? " At these settings it is the Expected preset; change a setting to see it as a dashed curve." : " Dashed on the curve.";
    return `${cells}<span class="cap">${esc(describeCustomSetup(vw))}.${note}</span>`;
  }

  // ---------------------------------------------------------- empirical closes
  function describeClosesEditor(readings) {
    const ids = [...new Set(readings.filter(r => !r.na).map(r => r.b.tk))];
    return ids.map(id => `<span class="ceed"><span class="lbl">${esc(id)}</span><textarea data-closes="${esc(id)}" rows="2" placeholder="daily closes, oldest first: 20.1, 20.4, 19.8, … (one per line may use a decimal comma)" aria-label="${esc(id)} daily closes">${esc(pastedText.get(id) || "")}</textarea><span class="muted" data-closes-n="${esc(id)}"></span><span class="mvrow" data-closes-mv="${esc(id)}"></span></span>`).join("");
  }

  // what was understood from the closes: the count, first and last, and a warning when day-to-day jumps look misread
  function describeClosesCheck(closes) {
    if (!closes.length) { return "no closes"; }
    const c = CAPTURE.checkCloses(closes);
    return `${c.count} closes, ${fPx2(c.first)} → ${fPx2(c.last)}${c.jumps ? `<br><span class="warnc">${c.jumps} day-to-day jump${c.jumps === 1 ? "" : "s"} over 50%: check the format</span>` : ""}`;
  }
  // the pasted days as a strip of market-move colours (MOVES), each day judged in σ of the series' own daily moves
  const MOVE_STRIP_DAYS = 120;
  function describeDailyMoves(closes) {
    const moves = closes.slice(1).map((v, i) => Math.log(v / closes[i])).filter(Number.isFinite);
    if (moves.length < 5) { return ""; }
    const mean = moves.reduce((a, b) => a + b, 0) / moves.length;
    const sd = Math.sqrt(moves.reduce((a, b) => a + (b - mean) ** 2, 0) / (moves.length - 1));
    if (!(sd > 0)) { return ""; }
    const kinds = moves.map(x => MOVES.classify(x / sd)), count = k => kinds.filter(x => x === k).length;
    const shown = moves.slice(-MOVE_STRIP_DAYS), offset = moves.length - shown.length;
    const cells = shown.map((x, i) => `<i class="mvd mvd-${kinds[offset + i]}" title="day ${offset + i + 1}: ${fS(Math.exp(x) - 1, 1)} (${(x / sd).toFixed(1)}σ)"></i>`).join("");
    return `<span class="mvstrip">${cells}</span><span class="mvsum">daily σ ${(sd * 100).toFixed(1)}% · <span class="mvc-down">${count("down")} clear fall${count("down") === 1 ? "" : "s"}</span> · <span class="mvc-up">${count("up")} clear rise${count("up") === 1 ? "" : "s"}</span> · <span class="mvc-note">${count("note")} notable</span> · <span class="mvc-flat">${count("flat")} flat</span>${shown.length < moves.length ? ` · strip: the last ${shown.length} days` : ""}</span>`;
  }
  // ---------------------------------------------------------- markup, wiring, render
  const MARKUP = `
  <section class="panel" id="cap-head">
    <div class="ph phc"><span class="tools"><button type="button" class="xbtn phx" id="cap-det"></button><span class="ctl"><span class="lbl">Share x</span><input type="number" id="cap-x" min="-300" max="100" step="5" style="width:58px" aria-label="Share x of the maximum payoff, %"> % of the maximum</span></span><h2>Capture</h2><span class="sub">the share of its maximum payoff a position keeps, weighed by the odds</span></div>
    <span class="capmax" id="cap-max"></span>
    <table class="cmp cpt" id="cap-table"></table>
    <details class="capem" id="cap-emp"><summary>Price history for the empirical preset</summary><span class="cap">Paste daily closes per ticker, oldest first, for this session; the data feed can bring them later.</span><span id="cap-closes"></span></details>
  </section>
  <section class="panel" id="cap-charts">
    <div class="ph"><h2>Odds of keeping at least x</h2><span class="lgd" id="cap-lgd"></span></div>
    <div class="captwo"><span class="capc"><span class="capct">Odds of keeping at least each share of the maximum, held to expiry</span><span id="cap-curve"></span></span><span class="capc"><span class="capct">Kept with no move, by day (time decay alone)</span><span id="cap-time"></span></span></div>
  </section>
  <section class="panel" id="cap-custom">
    <div class="ph phc"><h2>Your variant</h2><span class="sub">a basic adjuster to pin the idea down; the named presets are the workhorses</span></div>
    <span class="ccrow">
      <span class="ctl"><span class="lbl">Odds from</span><span class="seg" id="cc-src"></span> <span class="ccu" id="cc-volw"><input type="number" id="cc-vol" min="1" max="400" step="1" style="width:52px" aria-label="Typed vol, %">%</span></span>
      <span class="ctl"><span class="lbl">Gap</span><input type="number" id="cc-gapp" min="0" max="100" step="1" style="width:46px" aria-label="Gap chance a cycle, %">% a cycle of <input type="number" id="cc-gaps" min="0" max="95" step="5" style="width:46px" aria-label="Gap size, %">% <span class="seg" id="cc-gapside"></span></span>
      <span class="ctl"><span class="lbl">Read as</span><span class="seg" id="cc-read"></span> <span class="ccu" id="cc-pctw"><input type="number" id="cc-pct" min="1" max="99" step="1" style="width:46px" aria-label="Percentile"> percentile</span></span>
      <span class="ctl"><span class="lbl">Exit</span><span class="seg" id="cc-exit"></span> <span class="ccu" id="cc-leftw"><input type="number" id="cc-left" min="0" max="400" step="1" style="width:46px" aria-label="Days left at the exit"> days left</span></span>
    </span>
    <span class="ccout" id="cc-out"></span>
  </section>`;
  // a number input on one prefs key, clamped
  function bindNumber({ id, key, lo, hi }) {
    const input = /** @type {HTMLInputElement} */ (q(id));
    input.addEventListener("change", () => { const v = parseFloat(input.value); if (Number.isFinite(v)) { setPref({ [key]: clamp(v, lo, hi) }); } else { askFrame(); } });
    subscribeSync({ sync: state => { if (document.activeElement !== input) { input.value = state.prefs[key]; } } });
  }
  function init() {
    HOST = document.querySelector("#capture");
    HOST.innerHTML = MARKUP;
    const pref = k => v => ({ type: Command.SetPref, patch: { [k]: v } });
    bindNumber({ id: "#cap-x", key: "capX", lo: -300, hi: 100 });
    // the second line under each number (what it rests on) is behind one chip
    q("#cap-det").addEventListener("click", () => setPref({ capDetails: !V().capDetails }));
    seg({ el: q("#cc-src"), options: [[CAPTURE.VolSourceChoice.PeriodVol, "period vol"], [CAPTURE.VolSourceChoice.AtmIv, "ATM IV"], [CAPTURE.VolSourceChoice.Typed, "typed"]], read: state => state.prefs.ccSrc, command: pref("ccSrc") });
    seg({ el: q("#cc-gapside"), options: [[CAPTURE.GapSide.Down, "down"], [CAPTURE.GapSide.Either, "either way"]], read: state => state.prefs.ccGapSide, command: pref("ccGapSide") });
    seg({ el: q("#cc-read"), options: [[CAPTURE.Reading.Mean, "average"], [CAPTURE.Reading.Median, "median"], [CAPTURE.Reading.Percentile, "percentile"]], read: state => state.prefs.ccRead, command: pref("ccRead") });
    seg({ el: q("#cc-exit"), options: [[CAPTURE.Exit.Expiry, "at expiry"], [CAPTURE.Exit.DaysLeft, "early"]], read: state => state.prefs.ccExit, command: pref("ccExit") });
    bindNumber({ id: "#cc-vol", key: "ccVol", lo: 1, hi: 400 }); bindNumber({ id: "#cc-gapp", key: "ccGapP", lo: 0, hi: 100 }); bindNumber({ id: "#cc-gaps", key: "ccGapS", lo: 0, hi: 95 });
    bindNumber({ id: "#cc-pct", key: "ccPct", lo: 1, hi: 99 }); bindNumber({ id: "#cc-left", key: "ccLeft", lo: 0, hi: 400 });
    subscribeSync({ sync: state => { const vw = state.prefs; q("#cc-volw").hidden = vw.ccSrc !== CAPTURE.VolSourceChoice.Typed; q("#cc-pctw").hidden = vw.ccRead !== CAPTURE.Reading.Percentile; q("#cc-leftw").hidden = vw.ccExit !== CAPTURE.Exit.DaysLeft; } });
    q("#cap-closes").addEventListener("change", ev => {
      const area = /** @type {HTMLTextAreaElement} */ (ev.target), id = area.dataset && area.dataset.closes;
      if (!id) { return; }
      pastedCloses.set(id, CAPTURE.parseCloses(area.value)); pastedText.set(id, area.value); closesVersion++;
      memo.clear(); askFrame();
    });
  }
  function render(c) {
    if (!HOST) { return; }
    C = c;
    const vw = V(), readings = SIDES.map(side => readSide({ side, b: side === "A" ? C.A : C.B, vw }));
    q("#cap-max").innerHTML = describeHeader(readings);
    q("#cap-head").classList.toggle("nodetail", !vw.capDetails);
    q("#cap-det").textContent = vw.capDetails ? "hide formulas and details ▾" : "show formulas and details ▸";
    q("#cap-table").innerHTML = describeTable(readings);
    q("#cap-lgd").innerHTML = `<span class="lg1"><span><i style="background:var(--a)"></i>A</span> <span><i style="background:var(--b)"></i>B</span> <span class="muted">solid: period vol · dashed: your variant · x = ${vw.capX}%</span></span>`;
    renderCurve(readings); renderTimePath(readings);
    q("#cc-out").innerHTML = describeCustomOutput(readings, vw);
    const closesHost = q("#cap-closes"), idsKey = readings.filter(r => !r.na).map(r => r.b.tk).join("|");
    if (closesHost.dataset.ids !== idsKey) { closesHost.innerHTML = describeClosesEditor(readings); closesHost.dataset.ids = idsKey; }
    for (const n of closesHost.querySelectorAll("[data-closes-n]")) { const id = /** @type {HTMLElement} */ (n).dataset.closesN; n.innerHTML = describeClosesCheck(closesFor(id)); }
    for (const n of closesHost.querySelectorAll("[data-closes-mv]")) { const id = /** @type {HTMLElement} */ (n).dataset.closesMv; n.innerHTML = describeDailyMoves(closesFor(id)); }
    scheduleManaged(readings, vw);
  }
  // ---------------------------------------------------------- export: the presets as a plain table
  // plain text of the page's html; a side key ("A", "B") becomes "A: " so it does not run into the name
  const plainText = html => String(html || "").replace(/<span class="key [ab]">([AB])<\/span>/g, "$1: ").replace(/<br\s*\/?>/g, "; ").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  function exportTable(c) {
    C = c;
    const vw = V(), readings = SIDES.map(side => readSide({ side, b: side === "A" ? C.A : C.B, vw }));
    // the managed rule computed now when the view has not run it yet
    for (const r of readings) { if (!r.na && r.managed === null) { r.managed = MANAGE.simulate(manageInputs({ b: r.b, vw })); } }
    const live = readings.filter(r => !r.na);
    const head = ["Preset", ...live.map(r => `${r.side} ${r.b.label.tab}`), ...(live.length === 2 ? ["A − B"] : [])];
    const rows = PRESETS.map(p => {
      const cells = live.map(r => p.cell(r));
      const diff = cells.length === 2 && Number.isFinite(cells[0].value) && Number.isFinite(cells[1].value) && p.id !== CAPTURE.Preset.Fixed ? pts(cells[0].value - cells[1].value) : "";
      return [p.name, ...cells.map(c => plainText([c.text, /** @type {PresetCell} */ (c).alert, c.sub].filter(Boolean).join(" · "))), ...(live.length === 2 ? [diff] : [])];
    });
    return { intro: plainText(describeHeader(readings)) + `. Share x = ${vw.capX}%.`, head, rows, note: `Your variant: ${describeCustomSetup(vw)}.` };
  }
  return { init, render, closesFor, readClosesVersion: () => closesVersion, exportTable, PRESETS };
})();
