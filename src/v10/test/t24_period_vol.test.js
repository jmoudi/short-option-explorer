// T24 (v10 part 2b): the period vol. One number per ticker in state.periodVol, read through context.volOf and named
// by one label helper; DIST's period-vol odds (closed-form cdf, memo per vol, grid wide enough), SetPeriodVol (floors,
// caps, faults, the stored source), the readers (every EV reading at the period vol whatever the odds switch says),
// resets, and the migration of v9's listed-vol multiplier (hvk). Reference case from the plan: KORU 16 Oct 21
// straddle at mid, 15 days, period vol = listed 117.3%: EV +$34.02 per contract = 2.01% of margin, 1.61% of notional.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, deepFreeze, V9 } = require("./load.js");
const { synthD, range } = require("./synth.js");
const L = load();
vm.runInContext(["ui_views.js", "ui_export.js"].map(f => fs.readFileSync(path.join(V9, f), "utf8")).join("\n") + "\n;globalThis.__v = {VIEWS, EXPORT9};", L.ctx, { filename: "views+export" });
const { VIEWS, EXPORT9 } = L.ctx.__v;
const { STATE, CTX, POS, DIST, INST, Odds, VolSource, Command, FaultCode, FaultSeverity, Tab, ResetTarget, readPeriodVol, labelPeriodVol, nameVolSource, cdfT } = L;
const J = o => JSON.parse(JSON.stringify(o));
const withTab = tree => Object.assign({ tab: Tab.Compare }, tree);
const run = (state, command) => STATE.HANDLERS[command.type]({ state: deepFreeze(J(state)), command });
const REF_POS = { inst: { id: "KORU" }, exp: "20261016", structure: "straddle", legs: "together", basis: "money", values: { center: "atm", put: 30, call: 30 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" };
const refState = () => withTab(STATE.applyChange(STATE.defaults(), s => { s.comparison.A = J(REF_POS); }));
const listedPct = id => readPeriodVol({ record: INST.base(id) }).pct;

test("T24 DIST memo: a second vol misses, the first vol hits again; the implied distribution ignores the vol", () => {
  const E = INST.base("KORU").exp("20261016");
  const d1 = DIST.make({ expiry: E, odds: Odds.PeriodVol, vol: 1.0 });
  const d2 = DIST.make({ expiry: E, odds: Odds.PeriodVol, vol: 1.4 });
  assert.notEqual(d1, d2, "another vol is another distribution");
  assert.notEqual(d1.key, d2.key);
  assert.equal(DIST.make({ expiry: E, odds: Odds.PeriodVol, vol: 1.0 }), d1, "back to the first vol: the memo hits");
  const i1 = DIST.make({ expiry: E, odds: Odds.Implied, vol: 1.0 }), i2 = DIST.make({ expiry: E, odds: Odds.Implied, vol: 2.2 });
  assert.equal(i1, i2, "a vol edit never rebuilds the implied distribution");
  assert.ok(!/\|1\b|\|2\.2/.test(i1.key.split("|").slice(-1)[0]), "the implied key carries no vol");
  assert.equal(d1.mode, Odds.PeriodVol); assert.equal(d1.vol, 1.0); assert.equal(i1.mode, Odds.Implied); assert.ok(Number.isNaN(i1.vol));
});

test("T24 DIST: at vol = the listed vol the period-vol distribution equals v9's lognormal (grid error), EV exactly", () => {
  let worst = 0;
  for (const { id } of INST.list()) {
    const I = INST.base(id), vol = listedPct(id) / 100;
    for (const e of I.expiries) {
      const E = I.exp(e), d = DIST.make({ expiry: E, odds: Odds.PeriodVol, vol });
      // v9's period distribution: grid ±7·ATM·√T, lognormal cdf at the grid points, linear interpolation between them
      const n = 1000, v0 = Math.max(E.atm * Math.sqrt(E.T), 0.05), lo = -7 * v0, du = 14 * v0 / n, sd = vol * Math.sqrt(E.T), mu = -0.5 * sd * sd;
      const old = x => { const f = (x - lo) / du; const at = i => L.N((lo + du * i - mu) / sd); if (f <= 0) return at(0); if (f >= n) return at(n); const i = Math.floor(f), t = f - i; return at(i) * (1 - t) + at(i + 1) * t; };
      for (let k = -60; k <= 60; k++) { const x = k / 60 * 5 * sd; worst = Math.max(worst, Math.abs(cdfT(d, x) - old(x))); }
      const b = POS.build(Object.assign(J(REF_POS), { inst: { id }, exp: e, structure: "strangle", basis: "delta" }));
      if (b.na) continue;
      const evOld = b.cr + b.marks.reduce((t, m) => t + m.qty * POS.bs0(b.S, m.K, b.T, vol, m.cp), 0);
      assert.ok(Math.abs(POS.stats(b, d).ev - evOld) < 1e-12, `${id} ${e}: EV at the listed vol is v9's`);
    }
  }
  assert.ok(worst < 1e-5, `cdf within the grid's interpolation error (worst ${worst.toExponential(2)})`);
});

test("T24 DIST: the closed-form cdf matches the period-vol grid and, on a flat smile, the implied distribution", () => {
  const E = INST.base("RAM").exp(INST.base("RAM").expiries[1]);
  for (const vol of [0.3, 1.0, 3.0]) {
    const d = DIST.make({ expiry: E, odds: Odds.PeriodVol, vol });
    assert.ok(d.uhi >= 7 * Math.max(E.atm, vol) * Math.sqrt(E.T) - 1e-12, `grid ±7·max(ATM, vol)·√T at ${vol}`);
    assert.ok(d.cdf[0] < 1e-6 && 1 - d.cdf[d.n] < 1e-6, `no mass lost off the grid at ${vol}`);
    let worst = 0;
    for (let i = 0; i < d.n; i++) { const x = d.u[i] + 0.37 * d.du, grid = d.cdf[i] * 0.63 + d.cdf[i + 1] * 0.37; worst = Math.max(worst, Math.abs(cdfT(d, x) - grid)); }
    // linear interpolation of a normal cdf: error ≤ du²/8 · max|pdf'| (pdf' peaks at 0.242/σ² in u)
    const sd = vol * Math.sqrt(E.T), bound = d.du * d.du / 8 * 0.242 / (sd * sd) + 1e-12;
    assert.ok(worst <= bound, `closed form vs its own grid at ${vol}: ${worst.toExponential(2)} (bound ${bound.toExponential(2)})`);
  }
  // a flat 80% smile (quotes inside ±(−0.7, +0.55) log-moneyness, tight spreads, so the refit is flat): the implied
  // (Breeden–Litzenberger) distribution is the lognormal at 80% around the forward
  const S = load(synthD({ inst: [{ id: "RAM", S: 20, hv: 0.8, exps: { "20261120": { dte: 50, strikes: range(10, 35, 0.5), vol: 0.8, spread: 0.02 } } }] }));
  const Ef = S.INST.base("RAM").exp("20261120");
  const di = S.DIST.make({ expiry: Ef, odds: S.Odds.Implied }), shift = Math.log(Ef.Fpar / Ef.S);
  let worst = 0;
  for (let k = -40; k <= 40; k++) { const x = k / 40 * 1.5 * Ef.sigma; worst = Math.max(worst, Math.abs(S.cdfT(di, x) - S.DIST.lognormalCdf({ x: x - shift, vol: Ef.atm, t: Ef.T }))); }
  assert.ok(Math.abs(Ef.atm - 0.8) < 1e-4, `the refit is flat (ATM ${Ef.atm})`);
  assert.ok(worst < 2e-4, `implied grid vs the closed form on a flat smile: ${worst.toExponential(2)}`);
});

test("T24 volOf and the label helper: listed by default, set, ATM with its expiry; one floor for the comparer", () => {
  const S = refState(), C = CTX.ctx9(S);
  assert.deepEqual(J(C.volOf("KORU")), { pct: listedPct("KORU"), storedPct: listedPct("KORU"), source: VolSource.Hv30, expiry: "", label: `vol 117% (${nameVolSource({ source: VolSource.Hv30 })})` });
  assert.equal(labelPeriodVol({ pct: 100, source: VolSource.Set }), "vol 100% (set)");
  assert.equal(labelPeriodVol({ pct: 123.9, source: VolSource.Atm, expiry: "20261016" }), "vol 124% (ATM 16 Oct)");
  assert.equal(nameVolSource({ source: VolSource.Hv30 }), "HV30");
  const set = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 100 }).state;
  assert.equal(CTX.ctx9(set).volOf("KORU").label, "vol 100% (set)");
  assert.equal(CTX.ctx9(set).volOf("RAM").source, VolSource.Hv30, "the other ticker keeps its listed vol");
  const atm = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Atm, pct: 123.927, expiry: "20261016" }).state;
  assert.deepEqual(J(atm.periodVol.KORU), { pct: 123.93, source: VolSource.Atm, expiry: "20261016" });
  assert.equal(CTX.ctx9(atm).volOf("KORU").label, "vol 124% (ATM 16 Oct)");
  const zero = withTab(STATE.applyChange(S, s => { s.periodVol.KORU = { pct: 0, source: VolSource.Set }; }));
  assert.equal(zero.periodVol.KORU.pct, 0, "the state keeps 0 (Compounding's 'exactly on the path')");
  assert.equal(CTX.ctx9(zero).volOf("KORU").pct, 1, "the comparer reads it at its 1% floor");
  assert.equal(CTX.ctx9(zero).volOf("KORU").label, "vol 1% (set 0%, floored)", "and its label says the stored value was floored");
  assert.equal(CTX.readTickerVol({ periodVol: zero.periodVol, id: "KORU", reader: Tab.Compounding }).pct, 0, "the Compounding reader keeps the 0");
  assert.ok(Number.isNaN(CTX.readTickerVol({ periodVol: {}, id: "XYZ" }).pct), "an unlisted ticker reads NaN");
  assert.equal(C.volOddsText(), "at 117% vol");
  assert.equal(CTX.ctx9(withTab(STATE.defaults())).volOddsText(), "at period vol (RAM 102%, KORU 117%)");
  assert.equal(CTX.ctx9(withTab(STATE.defaults())).volOddsText({ isCompact: true }), "at period vol");
});

test("T24 SetPeriodVol: Result ok with a warning fault when floored or capped; the source is stored, never inferred", () => {
  const S = refState();
  const floored = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 0.4 });
  assert.equal(floored.state.periodVol.KORU.pct, 1);
  assert.equal(floored.faults.length, 1); assert.equal(floored.faults[0].code, FaultCode.ValueClamped); assert.equal(floored.faults[0].severity, FaultSeverity.Warning);
  assert.match(floored.notices[0].text, /floored at 1%/);
  const kept0 = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 0, reader: Tab.Compounding });
  assert.equal(kept0.state.periodVol.KORU.pct, 0); assert.equal(kept0.faults.length, 0, "the Compounding tab's floor is 0");
  const capped = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 450 });
  assert.equal(capped.state.periodVol.KORU.pct, 300); assert.equal(capped.faults[0].code, FaultCode.ValueClamped); assert.match(capped.notices[0].text, /capped at 300%/);
  // a hand-set value equal to the listed vol stays "set", through the view code too
  const same = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: listedPct("KORU") });
  assert.equal(same.faults.length, 0);
  assert.deepEqual(J(same.state.periodVol.KORU), { pct: 117.32, source: VolSource.Set });
  const back = STATE.readViewCode(STATE.writeViewCode({ state: same.state, yr: null }));
  assert.ok(back.ok); assert.deepEqual(J(back.value.state.periodVol), { KORU: { pct: 117.32, source: VolSource.Set } });
  // the listed preset removes the entry (absent = listed); an expiry rides only with ATM
  assert.deepEqual(J(run(same.state, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Hv30 }).state.periodVol), {});
  assert.deepEqual(J(run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 90, expiry: "20261016" }).state.periodVol.KORU), { pct: 90, source: VolSource.Set });
  // commands that cannot apply leave the state and say why
  for (const bad of [{ ticker: "XYZ", source: VolSource.Set, pct: 90 }, { ticker: "KORU", source: "guess", pct: 90 }, { ticker: "KORU", source: VolSource.Set, pct: NaN },
    { ticker: "KORU", source: VolSource.Set }, { ticker: "KORU", source: VolSource.Set, pct: "90" }, { ticker: "KORU", source: VolSource.Set, pct: 90, reader: "nowhere" }]) {
    const frozen = deepFreeze(J(S)), o = STATE.HANDLERS[Command.SetPeriodVol]({ state: frozen, command: Object.assign({ type: Command.SetPeriodVol }, bad) });
    assert.equal(o.state, frozen, JSON.stringify(bad)); assert.equal(o.faults[0].code, FaultCode.BadCommand, JSON.stringify(bad));
  }
});

test("T24 readers: every EV reading uses the period vol whatever the odds switch says; the switch governs the rest", () => {
  const S = refState(), C0 = CTX.ctx9(S);
  // the plan's reference case at the listed vol
  const ev0 = C0.statsAtPeriodVol(C0.A).ev;
  assert.ok(Math.abs(ev0 * 100 - 34.02) < 0.005, `EV $${(ev0 * 100).toFixed(3)} per contract`);
  assert.ok(Math.abs(C0.A.cr * 100 - 432.5) < 1e-6 && Math.abs(C0.A.margin - 16.889) < 1e-3);
  assert.ok(Math.abs(ev0 / C0.A.margin * 100 - 2.01) < 0.005 && Math.abs(ev0 / C0.A.S * 100 - 1.61) < 0.005);
  const S2 = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 140 }).state, C2 = CTX.ctx9(S2);
  const ev2 = C2.statsAtPeriodVol(C2.A).ev;
  assert.ok(ev2 < ev0, "a higher vol costs the short straddle EV");
  assert.equal(ev2, POS.stats(C2.A, DIST.make({ expiry: C2.A.E, odds: Odds.PeriodVol, vol: 1.4 })).ev);
  // implied odds (the default): the switch's readings do not move with the vol; period-vol odds: they do
  assert.equal(S2.assumptions.dist, Odds.Implied);
  assert.equal(C2.d, C0.d, "the implied distribution is the same object"); assert.equal(C2.sa.pop, C0.sa.pop); assert.equal(C2.sa.ev, C0.sa.ev);
  const P0 = withTab(STATE.applyChange(S, s => { s.assumptions.dist = Odds.PeriodVol; })), P2 = withTab(STATE.applyChange(S2, s => { s.assumptions.dist = Odds.PeriodVol; }));
  assert.notEqual(CTX.ctx9(P0).sa.pop, CTX.ctx9(P2).sa.pop, "profit odds follow the vol under period-vol odds");
  assert.equal(CTX.ctx9(P2).sa.ev, ev2, "the table's EV row at period-vol odds is the period-vol EV");
  // the sweep's EV line and the recovery growth read the period vol
  const sw = VIEWS.sweepData(C2, "both", 12), at = sw.xs.indexOf(sw.sides.A.x0);
  assert.ok(Math.abs(sw.sa[at].ev - ev2 / C2.A.S) < 1e-12, "the sweep's EV at the marker");
  const rr = VIEWS.recRun(C2, C2.A, "A", Object.assign({}, S2.prefs, { rdG: "ev", rdCap: "margin" }));
  assert.ok(Math.abs(rr.g - ev2 / C2.A.margin) < 1e-12, "recovery growth = EV at the period vol / margin");
  // the overview's cells (every ticker × expiry at listed spot and IV) read each ticker's own vol
  const cell = VIEWS.ovCells(C2).find(c => c.id === "KORU" && c.e === "20261016" && c.j === 0);
  assert.equal(C2.statsAtPeriodVol(cell.b).ev, POS.stats(cell.b, DIST.make({ expiry: cell.b.E, odds: Odds.PeriodVol, vol: 1.4 })).ev);
  // the export names the odds of every EV line
  const md = EXPORT9.toMarkdownCompare(C2, S2, {});
  assert.ok(md.includes("| Expected value · implied odds: fill vs mid, 0 at mid"), "the table's EV row under implied odds says so");
  assert.ok(md.includes("(EV at 140% vol on margin)"), "recovery growth names its vol (A and B both on KORU)");
  assert.ok(md.includes("KORU vol 140% (set)"), "the assumptions list the period vol");
  const mdP = EXPORT9.toMarkdownCompare(CTX.ctx9(P2), P2, {});
  assert.ok(mdP.includes("| Expected value · at 140% vol"), "the table's EV row under period-vol odds names the vol");
  const R2 = withTab(STATE.applyChange(P2, s => { s.comparison.B.inst = { id: "RAM" }; })), mdR = EXPORT9.toMarkdownCompare(CTX.ctx9(R2), R2, {});
  assert.ok(mdR.includes("| Expected value · at period vol (KORU 140%, RAM 102%)"), "two tickers: the table's EV row names both vols");
  assert.ok(mdR.includes("(EV at period vol on margin)") && !/\([^()|]*\([^()|]*\)[^()|]*\)/.test(mdR), "the recovery row stays compact (the vols are in the assumptions): no nested parentheses");
  assert.ok(mdR.includes("KORU vol 140% (set)") && mdR.includes("RAM vol 102% (HV30)"), "the assumptions list both vols");
});

test("T24 resets, swap and Set as A keep the period vol; only Reset both tabs clears it", () => {
  const S = run(refState(), { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 150 }).state;
  const cmp = run(S, { type: Command.Reset, resetTarget: ResetTarget.Compare });
  assert.deepEqual(J(cmp.state.periodVol), { KORU: { pct: 150, source: VolSource.Set } }); assert.match(cmp.notices[0].text, /period vol kept$/);
  assert.match(run(S, { type: Command.Reset, resetTarget: ResetTarget.Compounding }).notices[0].text, /period vol kept$/);
  const both = run(S, { type: Command.Reset, resetTarget: ResetTarget.Both });
  assert.deepEqual(J(both.state.periodVol), {}); assert.ok(!/period vol/.test(both.notices[0].text));
  assert.ok(!/period vol/.test(run(refState(), { type: Command.Reset, resetTarget: ResetTarget.Compare }).notices[0].text), "nothing kept, nothing said");
  assert.deepEqual(J(run(S, { type: Command.Swap }).state.periodVol), J(S.periodVol));
  assert.deepEqual(J(run(S, { type: Command.SetFrom, side: "A", spec: { inst: { id: "RAM" }, exp: "20261120", wings: { call: false, put: false } } }).state.periodVol), J(S.periodVol));
});

test("T24 migration: v9's multiplier (hvk ≠ 1) becomes a hand-set period vol per ticker with one note each", () => {
  const base = STATE.defaults();
  const v9code = hvk => "v9." + STATE.enc({ t: "compare", th: "auto", c: { cmp: base.comparison, scen: Object.assign({}, base.assumptions, { hvk }), view: base.prefs }, y: null });
  const r = STATE.readViewCode(v9code(1.2));
  assert.ok(r.ok);
  const want = id => +(listedPct(id) * 1.2).toFixed(2);
  assert.deepEqual(J(r.value.state.periodVol), { RAM: { pct: want("RAM"), source: VolSource.Set }, KORU: { pct: want("KORU"), source: VolSource.Set } });
  assert.equal(r.value.notices.length, 2);
  assert.ok(r.value.notices.every(n => /period vol set to \d+%: the loaded view scaled HV30 \d+% by 1\.20/.test(n.text)), JSON.stringify(r.value.notices.map(n => n.text)));
  assert.ok(!("hvk" in r.value.state.assumptions), "the multiplier is gone from the assumptions");
  const one = STATE.readViewCode(v9code(1));
  assert.deepEqual(J(one.value.state.periodVol), {}); assert.equal(one.value.notices.length, 0);
  // the v9 blob, a v8 blob and a step-2a v10 document carrying hvk; a ticker that already has a vol keeps it
  const blob = STATE.readStoredView({ v: 9, tab: "compare", theme: "auto", cmp: { cmp: base.comparison, scen: Object.assign({}, base.assumptions, { hvk: 0.8 }), view: base.prefs }, yr: null });
  assert.equal(blob.value.state.periodVol.KORU.pct, +(listedPct("KORU") * 0.8).toFixed(2)); assert.equal(blob.value.notices.length, 2);
  const v8 = STATE.readStoredView({ v: 8, tab: "compare", cmp: { hvk: 1.5 } });
  assert.equal(v8.value.state.periodVol.RAM.pct, +(listedPct("RAM") * 1.5).toFixed(2));
  const v10 = STATE.readStoredView({ v: 10, tab: "compare", comparison: base.comparison, assumptions: Object.assign({}, base.assumptions, { hvk: 1.2 }), prefs: base.prefs, periodVol: { KORU: { pct: 90, source: "set" } }, yr: null });
  assert.deepEqual(J(v10.value.state.periodVol), { KORU: { pct: 90, source: VolSource.Set }, RAM: { pct: want("RAM"), source: VolSource.Set } });
  assert.equal(v10.value.notices.length, 1, "one note: only RAM was scaled");
});

test("T24 ATM: SetPeriodVol needs the listed expiry the ATM was read at; a stored ATM without one becomes a hand-set number", () => {
  const S = refState();
  for (const expiry of [undefined, "", "garbage", "20261017", 20261016, "<b>x"]) {
    const o = run(S, { type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Atm, pct: 124, expiry });
    assert.equal(o.faults[0].code, FaultCode.BadCommand, `expiry ${JSON.stringify(expiry)}`);
    assert.deepEqual(J(o.state.periodVol), {});
  }
  // B's box on another ticker reads ATM at A's horizon: any listed expiry is a place an ATM can have been read
  assert.deepEqual(J(run(S, { type: Command.SetPeriodVol, ticker: "RAM", source: VolSource.Atm, pct: 106, expiry: "20261016" }).state.periodVol.RAM), { pct: 106, source: VolSource.Atm, expiry: "20261016" });
  // a view that carries a bad expiry loads the number as hand-set
  const doc = Object.assign(J(STATE.defaults()), { v: 10, tab: Tab.Compare, periodVol: { KORU: { pct: 50, source: VolSource.Atm, expiry: "<b>x" }, RAM: { pct: 60, source: VolSource.Atm } } });
  const r = STATE.readStoredView(doc);
  assert.equal(r.ok, true);
  assert.deepEqual(J(r.value.state.periodVol), { KORU: { pct: 50, source: VolSource.Set }, RAM: { pct: 60, source: VolSource.Set } });
});

test("T24 references: one list for both tabs; ATM at A's horizon on the listed instrument (a slot's IV shift stays out)", () => {
  const S = refState(), C = CTX.ctx9(S);
  const refs = C.periodVolRefs("KORU");
  assert.deepEqual(J(refs.map(r => [r.source, r.label, r.short, Math.round(r.pct)])), [
    [VolSource.Hv30, "HV30", "HV30", 117], [VolSource.Atm, "ATM 16 Oct", "ATM", 124], [VolSource.Set, "1-year realized", "1y", 173], [VolSource.Set, "5-year realized", "5y", 101]
  ]);
  assert.equal(refs[1].expiry, "20261016");
  assert.deepEqual(J(CTX.listPeriodVolRefs({ id: "KORU", comparison: S.comparison })), J(refs), "the port's list is the context's");
  // A with an IV shift of +10 pts: the slot's ATM moves, the reference does not
  const shifted = withTab(STATE.applyChange(S, s => { s.comparison.A.inst = { id: "KORU", ivShift: 10 }; }));
  const Cs = CTX.ctx9(shifted);
  assert.ok(Math.abs(INST.atmAt(Cs.instA, Cs.ax.T) - INST.atmAt(C.instA, C.ax.T) - 0.1) < 1e-9, "the slot's own ATM carries the shift");
  assert.equal(Cs.periodVolRefs("KORU")[1].pct, refs[1].pct, "the ATM reference is the listed one");
  // RAM (B's ticker in another view) reads its ATM at A's horizon too; it has no realized references in the data
  assert.deepEqual(J(C.periodVolRefs("RAM").map(r => [r.source, r.short])), [[VolSource.Hv30, "HV30"], [VolSource.Atm, "ATM"]]);
  assert.deepEqual(J(CTX.listPeriodVolRefs({ id: "XYZ", comparison: S.comparison })), []);
});

test("T24 DIST: the period-vol grid is built on its first read only, then kept", () => {
  const E = INST.base("KORU").exp("20261120");
  const d = DIST.make({ expiry: E, odds: Odds.PeriodVol, vol: 2.345 });
  const desc = Object.getOwnPropertyDescriptor(d, "cdf");
  assert.equal(typeof desc.get, "function", "cdf is computed on demand");
  assert.ok(Object.isFrozen(d));
  assert.ok(cdfT(d, 0.1) > 0 && Object.getOwnPropertyDescriptor(d, "u").get, "the closed-form readers never touch the grid");
  const cdf = d.cdf;
  assert.equal(cdf.length, d.n + 1); assert.equal(d.u.length, d.n + 1);
  assert.equal(d.cdf, cdf, "read once, kept");
  assert.ok(Math.abs(cdf[500] - DIST.lognormalCdf({ x: d.u[500], vol: 2.345, t: E.T })) < 1e-15);
  const i = DIST.make({ expiry: E, odds: Odds.Implied });
  assert.equal(Object.getOwnPropertyDescriptor(i, "cdf").get, undefined, "the implied grid is the distribution: built at once");
});
