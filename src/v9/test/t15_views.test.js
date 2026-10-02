// T15 (node part): the view data helpers of ui9_views.js. Rendering with Proxy-wrapped positions runs in the browser
// harness (scratch/views/t15.js); here: the sweep marks the actual position, the smile click lands on the clicked
// strike, recovery and calendar odds, overview Set as A/B, frozen S9, and the source rules.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, deepFreeze, V9 } = require("./load.js");
const L = load();
vm.runInContext(fs.readFileSync(path.join(V9, "ui9_views.js"), "utf8") + "\n;globalThis.__v = {VIEWS, renderViews, wireViews};", L.ctx, { filename: "ui9_views.js" });
const { VIEWS } = L.ctx.__v, { STATE, CTX, CMP, RULE, INST } = L;
const ops = (S, list) => { for (const [o, ...a] of list) S = STATE.cmpOp(S, o, ...a).S9; return S; };
const onCurve = (C, d, side) => { const s = d.sides[side], i = d.xs.indexOf(s.x0), ser = side === "A" ? d.sa : d.sb; return i >= 0 && VIEWS.sameTrade(ser[i].b, side === "A" ? C.A : C.B); };

test("T15 sweep: each position sits on its own curve at its marker, on the current basis, legs together or detached", () => {
  const states = {
    default: [],
    "finding 41: A detached 15/45": [["setA", "legs", "detached"], ["setA", "values.put", 15], ["setA", "values.call", 45]],
    "A straddle vs B strangle": [["setA", "structure", "straddle"], ["setB", "structure", "strangle"]],
    "B detached from A's straddle": [["setA", "structure", "straddle"], ["detach", "B"]],
    "B on its own money basis": [["setB", "basis", "money"], ["setB", "values.put", 12]],
    "sigma basis with both wings": [["setA", "wings.call.on", true], ["setA", "wings.put.on", true], ["setA", "basis", "sigma"]],
    "B's own wing on money": [["setA", "wings.call.on", true], ["setB", "basis", "money"], ["setB", "wings.call.value", 20]]
  };
  for (const [name, list] of Object.entries(states)) {
    const C = CTX.ctx9(ops(STATE.defaults(), list));
    for (const mode of ["both", "put", "call", "wingCall"]) {
      const d = VIEWS.sweepData(C, mode, 24);
      for (const side of ["A", "B"]) {
        const s = d.sides[side]; if (!Number.isFinite(s.x0)) { assert.equal(mode, "wingCall", `${name} ${mode} ${side} has no marker`); continue; }
        assert.ok(onCurve(C, d, side), `${name} · ${mode} · ${side}: the curve at the marker is not the position as set`);
      }
    }
  }
  // finding 41: "both" with detached legs keeps the 30Δ offset, so the marker at the mean (30) is the real 10P/17C
  const C = CTX.ctx9(ops(STATE.defaults(), states["finding 41: A detached 15/45"]));
  const d = VIEWS.sweepData(C, "both", 24);
  assert.equal(d.sides.A.x0, 30);
  const p = d.sa[d.xs.indexOf(30)].b;
  assert.deepEqual(p.legs.map(l => l.K), C.A.legs.map(l => l.K));
  const P5 = d.sides.A.at(35);
  assert.equal(P5.values.call - P5.values.put, 30, "the offset is kept");
});

test("T15 smile click: the clicked leg lands on exactly that strike on every basis; B's click unlinks only that aspect", () => {
  let n = 0;
  for (const basis of ["delta", "money", "sigma"]) for (const cfg of ["detached", "straddle", "wing"]) {
    let S = ops(STATE.defaults(), [["setA", "exp", "20261218"], ["setA", "basis", basis]]);
    if (cfg === "detached") S = ops(S, [["setA", "legs", "detached"]]);
    if (cfg === "straddle") S = ops(S, [["setA", "structure", "straddle"]]);
    if (cfg === "wing") S = ops(S, [["setA", "legs", "detached"], ["setA", "wings.call.on", true], ["setA", "wings.put.on", true]]);
    const S0 = deepFreeze(JSON.parse(JSON.stringify(S))), C = CTX.ctx9(S0);
    for (const tag of ["A", "B"]) {
      const b = tag === "A" ? C.A : C.B;
      for (const o of b.E.rows) for (const opt of VIEWS.smileOptions(C, tag, b, o.K, o.cp)) {
        const r = VIEWS.smilePlace(S0, C, tag, opt.role, o.K);
        if (opt.why) { assert.equal(r.refused, opt.why); assert.equal(r.S9, S0); continue; }
        const other = opt.role === "short put" ? b.legs.find(l => l.role === "short call") : opt.role === "short call" ? b.legs.find(l => l.role === "short put") : null;
        const crossing = other && (opt.role === "short put" ? o.K >= other.K : o.K <= other.K);
        if (!crossing) { assert.equal(r.landed, o.K, `${basis} ${cfg} ${tag} ${opt.role} ${o.K}${o.cp}`); n++; }
        const ch = Object.keys(S0.cmp.links).filter(k => S0.cmp.links[k] !== r.S9.cmp.links[k]);
        if (tag === "A") assert.deepEqual(ch, []);
        else for (const k of ch) assert.equal(k, opt.role === "long call" ? "wingCall" : opt.role === "long put" ? "wingPut" : "placement");
      }
    }
  }
  assert.ok(n > 500, `only ${n} clicks checked`);
  // a refused click says why (no bid / inside the smallest wing value)
  const C = CTX.ctx9(STATE.defaults()), E = C.A.E, noBid = E.calls.find(o => !(o.bid > 0));
  if (noBid) assert.match(VIEWS.smileOptions(C, "A", C.A, noBid.K, "C")[0].why, /no bid/);
});

test("T15 smile click with legs together: the clicked leg lands, the other follows, and the toast offers detaching", () => {
  const S = deepFreeze(STATE.defaults()), C = CTX.ctx9(S);
  const r = VIEWS.smilePlace(S, C, "A", "short put", 12);
  assert.equal(r.landed, 12);
  const v = r.S9.cmp.A.values; assert.ok(Math.abs((v.call - v.put) - 0) < 1e-9, "offset kept (30/30 together)");
  const ev = r.events.find(e => e.actions && e.actions.some(a => /detach legs/.test(a.label)));
  assert.ok(ev, "toast action to detach");
  const r2 = STATE.applyAction(r.S9, ev.actions[0]);
  assert.equal(r2.S9.cmp.A.legs, "detached");
  assert.equal(r2.S9.cmp.A.values.call, 30, "the other leg goes back");
  assert.equal(CMP.buildA(r2.S9.cmp).legs.find(l => l.role === "short put").K, 12);
});

test("T15 recovery: the headline counts whole cycles (finding 26), the hit uses the position's own σ", () => {
  const C = CTX.ctx9(STATE.defaults()), vw = Object.assign({}, C.view, { rdK: 1 });
  const r = VIEWS.recRun(C, C.A, "A", vw), n = VIEWS.recCycles(r.L, r.g, "rec", vw.rdBase);
  assert.ok(n > 2 && n < 3, `n = ${n}`);
  const t = VIEWS.recTime(n, r.days, r.L, d => String(d));
  assert.equal(t.v, `${(3 * r.days / 7).toFixed(1)} wk`);
  assert.equal(t.s, "3 cycles");
  assert.ok(Math.abs(r.xMove - C.A.S * Math.exp(-C.A.sig)) < 1e-9 || Math.abs(r.xMove - C.A.S * Math.exp(C.A.sig)) < 1e-9);
});

test("T15 calendar alignment: an expired position keeps its expiry odds (finding 28)", () => {
  const S = STATE.applyChange(ops(STATE.defaults(), [["setB", "exp", "20261218"]]), s => { s.scen.align = "cal"; });
  const C = CTX.ctx9(S), rows = VIEWS.gridRows(C);
  assert.ok(C.cal && rows.length > 2);
  for (const w of rows) { assert.equal(w.tA, Math.min(w.d, C.A.dte) / 365); assert.equal(w.tB, Math.min(w.d, C.B.dte) / 365); }
  assert.equal(rows[rows.length - 1].tA, C.A.dte / 365);
});

test("T15 overview: every instrument × expiry × wing variant, named by label; Set as B unlinks only what differs (findings 2, 29)", () => {
  const S = deepFreeze(STATE.defaults()), C = CTX.ctx9(S), cells = VIEWS.ovCells(C);
  const want = INST.list().reduce((t, x) => t + INST.base(x.id).expiries.length * 2, 0);
  assert.equal(cells.length, want);
  assert.equal(cells.filter(c => VIEWS.sameTrade(c.b, C.A)).length, 1);
  assert.equal(cells.filter(c => VIEWS.sameTrade(c.b, C.B)).length, 1);
  for (const c of cells) assert.match(c.b.label.full, /^\S+ \d+ \w+.* · short (straddle|strangle|guts) /);
  // KORU 20 Nov with a call wing as B: only wingCall unlinks
  const cell = cells.find(c => c.id === C.B.tk && c.e === C.B.exp && c.j === 1);
  const r = STATE.cmpOp(S, "setFrom", "B", { inst: cell.slot, exp: cell.e, wings: { call: { on: true, value: cell.wings.call.value }, put: false } });
  assert.deepEqual(Object.keys(S.cmp.links).filter(k => S.cmp.links[k] !== r.S9.cmp.links[k]), ["wingCall"]);
  assert.ok(VIEWS.sameTrade(CMP.buildB(r.S9.cmp), cell.b));
  // Set as A onto B's position: allowed, and the identical event says so (finding 40)
  const cb = cells.find(c => VIEWS.sameTrade(c.b, C.B));
  const r2 = STATE.cmpOp(S, "setFrom", "A", { inst: cb.slot, exp: cb.e, wings: { call: false, put: false } });
  assert.ok(r2.events.some(e => e.type === "identical"));
});

test("T15 views read a frozen S9 without writing; source rules hold for ui9_views.js", () => {
  const S = deepFreeze(ops(STATE.defaults(), [["setA", "wings.put.on", true], ["setB", "structure", "straddle"]]));
  const C = CTX.ctx9(S);
  VIEWS.ovCells(C); VIEWS.sweepData(C, "both", 12); VIEWS.sweepData(C, "wingCall", 12); VIEWS.gridRows(C); VIEWS.smileGroups(C);
  VIEWS.recRun(C, C.B, "B", S.view); VIEWS.pairWorst(C, C.A, C.B, C.h); VIEWS.pairPop(C);
  for (const tag of ["A", "B"]) VIEWS.smileOptions(C, tag, tag === "A" ? C.A : C.B, 14, "P");
  const src = fs.readFileSync(path.join(V9, "ui9_views.js"), "utf8") + fs.readFileSync(path.join(V9, "views9.css"), "utf8");
  for (const re of [/\bD\.u\b/, /\b(TKS|EXPS)\b/, /["'](RAM|KORU)["']/, /\bst\./, /(^|[^.\w$])(smile|wingAnchors|chain|maxDelta|build|dist|val|legPx|ivAt|statsBase|context)\(/m, /\b(wrinkle|seam|smell)/i, /ATM\/ATM|ATMΔ/])
    assert.ok(!re.test(src), `ui9_views.js matches ${re}`);
});
