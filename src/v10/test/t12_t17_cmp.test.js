// T12 (links), T13 (swap), T16 (diff), T17 (defaults and labels)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load, deepFreeze } = require("./load.js"), { synthD, range } = require("./synth.js");
const L = load();
const { INST, RULE, POS, CMP, STATE, CTX } = L;
const J = x => JSON.parse(JSON.stringify(x));
const legsOf = b => b.na ? "n/a" : b.exp + ":" + b.legs.map(l => l.role + "@" + l.K).join(",") + ":" + b.fill;
const resB = c => legsOf(CMP.buildB(c)), resA = c => legsOf(CMP.buildA(c));
const D0 = () => deepFreeze(CMP.defaults());
const others = (links, a) => CMP.ASPECTS.filter(x => x !== a).map(x => links[x]);

test("T12: setB on each aspect unlinks only that aspect (an implicit unlink copies B's current resolution)", () => {
  const vals = { inst: { id: "RAM" }, exp: "20261218", structure: "straddle", legs: "detached", basis: "money", "values.put": 20, "wings.call.on": true, "wings.put.value": 10, fill: "nat" };
  for (const [path, v] of Object.entries(vals)) {
    const c = D0(), a = CMP.aspectOf(path);
    const r = CMP.setB(c, path, v);
    if (a !== "inst") { assert.equal(r.c.links[a], false, path); assert.equal(r.events[0].type, "unlinked"); assert.ok(r.events[0].actions[0].label.includes("relink")); }
    assert.deepEqual(others(r.c.links, a), others(c.links, a), `${path} touched another link`);
    assert.equal(resA(r.c), resA(c), `${path} moved A`);
  }
  // the copy is B's current resolution, never the stash
  let c = D0();
  c = CMP.setB(c, "values.put", 20).c; c = CMP.link(c, "placement").c;     // stash {put 20}
  const before = resB(c);
  const r = CMP.setB(c, "values.call", 25);
  assert.equal(r.c.B.values.put, 30, "copied A's value (what B resolved to), not the stash");
  assert.equal(r.c.B.values.call, 25);
  assert.notEqual(resB(r.c), before);
});

test("T12: unlink with no stash leaves resolved B unchanged; with a stash it restores, and 'start from A' gives the no-move result", () => {
  for (const a of CMP.ASPECTS) {
    let c = D0();
    c = CMP.setA(c, "wings.call.on", true).c;
    const before = resB(c);
    const r = CMP.unlink(c, a);
    assert.equal(r.c.links[a], false);
    assert.equal(resB(r.c), before, `unlink ${a} moved B`);
    assert.equal(r.events.length, 0);
  }
  let c = D0();
  c = CMP.setB(c, "values", { put: 20, call: 20 }).c;
  const own = resB(c);
  c = CMP.link(c, "placement").c;
  assert.notEqual(resB(c), own);
  const followA = resB(c);
  const r = CMP.unlink(c, "placement");
  assert.equal(r.events[0].type, "restored"); assert.equal(r.events[0].text, "restored B's 20 / 20Δ");
  assert.equal(resB(r.c), own, "restored B's 20/20Δ");
  const s = r.events[0].actions.find(x => x.label === "start from A instead").apply(r.c);
  assert.equal(resB(s.c), followA, "start from A: no move from the linked result");
  assert.equal(s.c.links.placement, false);
});

test("T12: link keeps B's value as the stash and 'undo' restores it", () => {
  let c = CMP.setB(D0(), "fill", "nat").c;
  const r = CMP.link(c, "fill");
  assert.equal(r.c.links.fill, true); assert.equal(r.c.B.fill, "nat"); assert.equal(CMP.resolveB(r.c).fill, "mid");
  const u = r.events[0].actions.find(x => x.label === "undo").apply(r.c);
  assert.equal(u.c.links.fill, false); assert.equal(CMP.resolveB(u.c).fill, "nat");
});

test("T12: structure toggles keep each structure's stored values; a linked B reads A's set for B's own structure", () => {
  let c = D0();
  c = CMP.setA(c, "values", { put: 22, call: 18 }).c;
  c = CMP.setA(c, "structure", "straddle").c;
  c = CMP.setA(c, "values.center", 55).c;
  c = CMP.setA(c, "structure", "strangle").c;
  assert.deepEqual([c.A.values.put, c.A.values.call, c.A.values.center], [22, 18, 55]);
  c = CMP.setA(c, "structure", "straddle").c;
  assert.equal(c.A.values.center, 55);
  // B strangle (structure unlinked) facing an A straddle, placement linked: B uses A's stored put/call
  const r = CMP.setB(c, "structure", "strangle");
  const rb = CMP.resolveB(r.c), bB = CMP.buildB(r.c);
  assert.equal(rb.structure, "strangle"); assert.deepEqual([rb.values.put, rb.values.call], [22, 18]);
  const E = bB.E, x = RULE.resolve(E, "strangle", "delta", { put: 22, call: 18 }, {});
  assert.deepEqual([bB.sp.K, bB.sc.K], [x.put.K, x.call.K]);
  assert.equal(r.c.links.placement, true);
});

test("T12: a linked wing on a B with another basis resolves on A's basis, beyond B's own short", () => {
  let c = D0();
  c = CMP.setA(c, "wings.call", { on: true, value: 12 }).c;
  c = CMP.setB(c, "basis", "sigma").c;
  assert.equal(c.links.placement, false); assert.equal(c.links.wingCall, true);
  const rb = CMP.resolveB(c), bB = CMP.buildB(c);
  assert.equal(rb.basis, "sigma"); assert.equal(rb.wings.call.basis, "delta"); assert.equal(rb.wings.call.value, 12);
  const r = RULE.resolve(bB.E, "strangle", "sigma", rb.values, { call: { on: true, value: 12, basis: "delta" } });
  assert.equal(bB.cap.K, r.wingCall.K); assert.ok(bB.cap.K > bB.sc.K);
  assert.equal(RULE.snap(bB.E, "long call", "delta", 12, bB.sc.K).K, bB.cap.K);
  // the basis switch converted B's values on B's chain: B's shorts did not move
  assert.equal(legsOf(CMP.buildB(CMP.setB(D0(), "values.put", 30).c)).split(",")[0].split(":")[1], legsOf(bB).split(",")[0].split(":")[1]);
});

test("T12: detach on A changes no link; detach on B unlinks exactly structure, legs and placement and yields a flat top", () => {
  let c = CMP.setA(D0(), "structure", "straddle").c;
  const bA = CMP.buildA(c); assert.equal(bA.kind, "straddle");
  const r = CMP.detach(c, "A");
  assert.deepEqual(J(r.c.links), J(c.links));
  assert.equal(r.c.A.structure, "strangle"); assert.equal(r.c.A.legs, "detached"); assert.equal(r.c.A.values.center, c.A.values.center);
  const a1 = CMP.buildA(r.c);
  assert.equal(a1.kind, "strangle"); assert.ok(a1.flags.some(f => f.code === "WIDENED"));
  assert.ok([a1.sp.K, a1.sc.K].includes(bA.sp.K), "one leg stays at the straddle strike");
  const adj = Math.abs(RULE.eligible(a1.E).put.indexOf(a1.sp.K) - RULE.eligible(a1.E).put.indexOf(a1.sc.K)) <= 1 || Math.abs(RULE.eligible(a1.E).call.indexOf(a1.sp.K) - RULE.eligible(a1.E).call.indexOf(a1.sc.K)) <= 1;
  assert.ok(adj, "flat top: neighbouring strikes");
  const b1 = CMP.buildB(r.c); assert.equal(b1.kind, "strangle", "a linked B follows A's detach");
  const bB = CMP.buildB(c);
  const s = CMP.detach(c, "B");
  assert.deepEqual(J(CMP.ASPECTS.filter(a => c.links[a] && !s.c.links[a]).sort()), ["legs", "placement", "structure"]);
  assert.equal(s.events[0].type, "unlinked"); assert.deepEqual(J(s.events[0].actions.map(x => x.label)), ["↺ relink placement", "↺ relink all three"]);
  const b2 = CMP.buildB(s.c);
  assert.equal(b2.kind, "strangle"); assert.ok([b2.sp.K, b2.sc.K].includes(bB.sp.K), "flat top at B's own strike");
  assert.equal(resA(s.c), resA(c), "A untouched");
  const back = s.events[0].actions[1].apply(s.c);
  assert.equal(resB(back.c), resB(c));
});

test("T12: Detach legs on a B strangle whose strikes follow A also sets B's strikes on their own; nothing moves", () => {
  // the dock: unlink Legs, then B = detached. With placement linked B reads A's values, so the gesture copies them
  const c = CMP.unlink(D0(), "legs").c, before = resB(c);
  const r = CMP.detach(c, "B");
  assert.deepEqual(J(CMP.ASPECTS.filter(a => c.links[a] !== r.c.links[a])), ["placement"]);
  assert.equal(CMP.resolveB(r.c).legs, "detached"); assert.equal(resB(r.c), before); assert.equal(resA(r.c), resA(c));
  assert.equal(r.events[0].text, "B's legs are detached: B's strikes are now set on their own");
  assert.deepEqual(J(r.events[0].actions.map(x => x.label)), ["↺ relink placement"]);
  const d = CMP.diff(r.c);
  assert.deepEqual(J(d.items.map(i => i.text)), ["B legs detached"]); assert.equal(d.onlyInstrument, false);
  // B's put now moves alone, A does not
  const m = CMP.setB(r.c, "values.put", 20).c;
  assert.equal(resA(m), resA(c)); assert.notEqual(resB(m), before); assert.equal(CMP.buildB(m).sc.K, CMP.buildB(r.c).sc.K);
  // relink placement: B's detached legs are moot again; nothing differs but the instrument
  const back = r.events[0].actions[0].apply(r.c).c;
  assert.equal(back.links.placement, true); assert.equal(CMP.resolveB(back).legs, "detached");
  const d2 = CMP.diff(back); assert.deepEqual(J(d2.items), []); assert.equal(d2.onlyInstrument, true);
  // from fully linked legs: both links go, with "relink both"; on A only the legs change, no link
  const r2 = CMP.detach(D0(), "B");
  assert.deepEqual(J(CMP.ASPECTS.filter(a => !r2.c.links[a]).sort()), ["inst", "legs", "placement"]);
  assert.deepEqual(J(r2.events[0].actions.map(x => x.label)), ["↺ relink placement", "↺ relink both"]);
  assert.equal(resB(r2.events[0].actions[1].apply(r2.c).c), resB(D0()));
  const r3 = CMP.detach(D0(), "A");
  assert.deepEqual(J(r3.c.links), J(D0().links)); assert.equal(r3.c.A.legs, "detached"); assert.equal(resA(r3.c), resA(D0()));
});

test("T12: setFrom touches only aspects that differ (finding 2: B keeps following A's strikes and fill)", () => {
  const c = D0();
  const r = CMP.setFrom(c, "B", { inst: "KORU", exp: "20261120", wings: { call: true } });
  assert.deepEqual(J(CMP.ASPECTS.filter(a => c.links[a] !== r.c.links[a])), ["wingCall"]);
  let c2 = CMP.setA(r.c, "values", { put: 20, call: 20 }).c; c2 = CMP.setA(c2, "fill", "nat").c;
  const rb = CMP.resolveB(c2);
  assert.deepEqual([rb.values.put, rb.values.call, rb.fill, rb.inst.id], [20, 20, "nat", "KORU"]);
  assert.equal(rb.wings.call.on, true);
  // setting A from the overview so that A equals B emits identical (finding 40)
  let c3 = CMP.setA(D0(), "inst", { id: "KORU" }).c;
  assert.equal(CMP.identical(c3), true);
  const c4 = CMP.setFrom(CMP.setA(D0(), "fill", "nat").c, "A", { inst: "KORU", fill: "mid" });
  assert.ok(c4.events.some(e => e.type === "identical"));
});

test("T12: one-click fixes are data and a fix on B never changes A (finding 7)", () => {
  let c = CMP.setA(D0(), "exp", "20270319").c;
  c = CMP.setA(c, "wings.call", { on: true, value: 17 }).c;
  const C = CTX.ctx9(STATE.sanitize9({ cmp: c }));
  const f = C.flags.find(x => x.code === "WING_NA" && x.side === "A") || C.flags.find(x => x.code === "WING_NA");
  assert.ok(f && f.fix && f.fix.side && f.fix.path && Number.isFinite(f.fix.value));
  const bf = C.flags.find(x => x.side === "B" && x.fix);
  if (bf) { const r = CMP.applyFix(c, bf.fix); assert.equal(resA(r.c), resA(c)); assert.deepEqual(J(r.c.A), J(c.A)); }
  const synthFix = { side: "B", path: "values.call", value: 20 };
  const r = CMP.applyFix(c, synthFix);
  assert.deepEqual(J(r.c.A), J(c.A)); assert.equal(r.c.links.placement, false);
});

test("T13: swap exchanges resolved A and B; swap∘swap restores legs, h and pins; a custom h becomes 1/h", () => {
  const variants = [
    s => s,
    s => STATE.cmpOp(s, "setB", "structure", "straddle").S9,
    s => STATE.cmpOp(STATE.cmpOp(s, "setB", "basis", "sigma").S9, "setA", "wings.call", { on: true, value: 12 }).S9,
    s => STATE.cmpOp(STATE.cmpOp(s, "setB", "exp", "20270319").S9, "setB", "fill", "nat").S9,
    s => STATE.cmpOp(s, "setB", "inst.spot", 23.2).S9,
    s => STATE.cmpOp(STATE.cmpOp(s, "setA", "structure", "straddle").S9, "detach", "B").S9
  ];
  for (const f of variants) {
    let S9 = STATE.applyChange(f(STATE.defaults()), s => { s.cmp.sizing = { rule: "custom", h: 2 }; s.view.pins = [{ SA: 15, SB: 20, dA: 40, dB: 120 }]; });
    deepFreeze(S9);
    const a0 = resA(S9.cmp), b0 = resB(S9.cmp);
    const r1 = STATE.swap(S9);
    assert.equal(resA(r1.S9.cmp), b0); assert.equal(resB(r1.S9.cmp), a0);
    assert.equal(r1.S9.cmp.sizing.h, 0.5);
    assert.deepEqual(J(r1.S9.view.pins), [{ SA: 20, SB: 15, dA: 120, dB: 40 }]);
    const r2 = STATE.swap(r1.S9);
    assert.equal(resA(r2.S9.cmp), a0); assert.equal(resB(r2.S9.cmp), b0);
    assert.equal(r2.S9.cmp.sizing.h, 2); assert.deepEqual(J(r2.S9.view.pins), J(S9.view.pins));
    const C1 = CTX.ctx9(r1.S9), C0 = CTX.ctx9(S9);
    assert.equal(C1.labels.A.full, C0.labels.B.full); assert.equal(C1.labels.B.full, C0.labels.A.full);
  }
  // a mapped expiry: the swapped linked expiry would differ → exp is unlinked with an event
  const D = synthD({ inst: [
    { id: "RAM", S: 10, exps: { "20261016": { dte: 15, strikes: range(5, 16, 1) }, "20261120": { dte: 50, strikes: range(5, 16, 1) } } },
    { id: "SYN", S: 20, exps: { "20261120": { dte: 50, strikes: range(10, 32, 1) } } }
  ] });
  const S = load(D);
  let c = S.CMP.setA(S.CMP.defaults(), "exp", "20261016").c;
  assert.ok(S.CMP.buildB(c).flags.some(f => f.code === "EXP_MAPPED"));
  const a0 = legsOf(S.CMP.buildA(c)), b0 = legsOf(S.CMP.buildB(c));
  const r = S.CMP.swap(c);
  assert.equal(r.events[0].type, "swapUnlinked"); assert.deepEqual(J(r.events[0].aspects), ["exp"]);
  assert.equal(legsOf(S.CMP.buildA(r.c)), b0); assert.equal(legsOf(S.CMP.buildB(r.c)), a0);
  const r2 = S.CMP.swap(r.c);
  assert.equal(legsOf(S.CMP.buildA(r2.c)), a0); assert.equal(legsOf(S.CMP.buildB(r2.c)), b0);
  // a wing carried on another basis is unlinked by the swap when it would move
  let w = CMP.setA(D0(), "wings.call", { on: true, value: 12 }).c; w = CMP.setB(w, "basis", "money").c;
  const wa = resA(w), wb = resB(w), ws = CMP.swap(w);
  assert.equal(resA(ws.c), wb); assert.equal(resB(ws.c), wa);
});

test("T16: the default (20 Nov) shows no amber; identical / onlyInstrument are reported", () => {
  const c = D0(), d = CMP.diff(c);
  assert.deepEqual(J(d.items), []); assert.equal(d.onlyInstrument, true); assert.equal(d.identical, false);
  const same = CMP.setB(c, "inst", { id: "RAM" }).c;
  assert.equal(CMP.diff(same).identical, true);
  const lk = CMP.link(c, "inst").c;
  assert.equal(CMP.diff(lk).identical, true);
  // every expiry of the default pair at 30/30Δ: report amber counts
  for (const e of ["20261016", "20261120", "20261218", "20270319"]) CMP.diff(CMP.setA(c, "exp", e).c);
});

test("T16: each amber trigger 1–8 fires on a constructed case", () => {
  const amber = (c, code) => CMP.diff(c).items.filter(i => !i.asked && i.code === code);
  // 1 kinds differ with structure linked (RAM 16 Oct 48/48: A strangle via widening is fine; force B ONE_STRIKE via a synthetic chain)
  const D = synthD({ inst: [
    { id: "RAM", S: 10, exps: { "20261120": { dte: 50, strikes: range(5, 16, 1) } } },
    { id: "ONE", S: 10, exps: { "20261120": { dte: 50, strikes: [10] } } }
  ] });
  const S = load(D);
  assert.ok(amber_(S, S.CMP.defaults(), "KIND").length === 1);
  function amber_(S, c, code) { return S.CMP.diff(c).items.filter(i => !i.asked && i.code === code); }
  assert.match(amber_(S, S.CMP.defaults(), "KIND")[0].text, /^! B resolved to straddle 10$/);
  // 2 WIDENED on one side only: RAM 16 Oct 48/48 widens A; KORU 21.5/22 does not
  let c = CMP.setA(D0(), "exp", "20261016").c; c = CMP.setA(c, "values", { put: 48, call: 48 }).c;
  const w = amber(c, "WIDENED"); assert.equal(w.length, 1); assert.match(w[0].text, /^! A: put widened to 14 to keep a strangle$/);
  // 3 a wing that is on resolves n/a
  c = CMP.setA(CMP.setA(D0(), "exp", "20270319").c, "wings.call", { on: true, value: 17 }).c;
  assert.ok(amber(c, "WING_NA").some(i => /^! A: call wing n\/a \(no strike above 30C\)$/.test(i.text)));
  // 4 CHAIN_END
  c = CMP.setA(D0(), "values", { put: 30, call: 12 }).c;
  assert.ok(amber(c, "CHAIN_END").some(i => /^! [AB]: call at chain end \d+(\.\d+)?C \([\d.]+Δ\)$/.test(i.text)));
  // 5 expiry mapped
  const D5 = synthD({ inst: [
    { id: "RAM", S: 10, exps: { "20261016": { dte: 15, strikes: range(5, 16, 1) }, "20261120": { dte: 50, strikes: range(5, 16, 1) } } },
    { id: "SYN", S: 20, exps: { "20261120": { dte: 50, strikes: range(10, 32, 1) } } }
  ] });
  const S5 = load(D5);
  const c5 = S5.CMP.setA(S5.CMP.defaults(), "exp", "20261016").c;
  assert.equal(S5.CMP.diff(c5).items.find(i => i.code === "EXP_MAPPED").text, "! B has no 16 Oct: using 20 Nov");
  // 6 achieved values differ beyond max(tol, ½ spacing), spacing = the gap between the listed strikes either side.
  // Pure grid granularity never fires: the default at every expiry (16 Oct: RAM 17C 26Δ vs KORU 30Δ, RAM's 16C is
  // 35Δ) and ATM straddles on every basis. Only a real mismatch does: B has no bid on the 11–13 calls
  for (const e of ["20261016", "20261120", "20261218"]) assert.deepEqual(J(CMP.diff(CMP.setA(D0(), "exp", e).c).items), [], "default at " + e);
  for (const e of ["20261016", "20261120", "20261218", "20270319"]) for (const basis of ["delta", "money", "sigma"]) {
    let cc = CMP.setA(D0(), "exp", e).c; cc = CMP.setA(cc, "structure", "straddle").c; cc = CMP.setA(cc, "basis", basis).c;
    assert.deepEqual(J(amber(cc, "ACHIEVED")), [], `ATM straddles ${e} ${basis}`);
    assert.deepEqual(J(CMP.diff(cc).items.filter(i => !i.asked)), [], `ATM straddles ${e} ${basis}: no amber at all`);
  }
  const D6 = synthD({ inst: [
    { id: "RAM", S: 10, exps: { "20261120": { dte: 50, strikes: range(5, 16, 1) } } },
    { id: "SYN", S: 10, exps: { "20261120": { dte: 50, strikes: range(5, 16, 1), noBid: ["C11", "C12", "C13", "P11", "P12", "P13", "C11"] } } }
  ] });
  const S6 = load(D6), am6 = (c, code) => S6.CMP.diff(c).items.filter(i => !i.asked && i.code === code);
  const a6 = am6(S6.CMP.defaults(), "ACHIEVED");
  assert.equal(a6.length, 1); assert.match(a6[0].text, /^! call A [\d.]+Δ vs B [\d.]+Δ$/); assert.equal(a6[0].side, "B");
  let c6 = S6.CMP.setA(S6.CMP.defaults(), "structure", "straddle").c; c6 = S6.CMP.setA(c6, "basis", "money").c;
  assert.deepEqual(J(am6(c6, "ACHIEVED")), [], "ATM center: each side's own nearest strike, never amber");
  c6 = S6.CMP.setA(c6, "values.center", 15).c;
  const ac = am6(c6, "ACHIEVED"); assert.equal(ac.length, 1); assert.match(ac[0].text, /^! center A \+[\d.]+% vs B [−+][\d.]+%$/);
  // 7 wing widths differ by more than 1.5× in σ
  let hit7 = 0;
  for (const e of ["20261120", "20261218", "20270319"]) for (const wv of [3, 5, 8, 12, 20]) for (const v of [10, 20, 30]) {
    let cc = CMP.setA(D0(), "exp", e).c; cc = CMP.setA(cc, "values", { put: v, call: v }).c; cc = CMP.setA(cc, "wings.call", { on: true, value: wv }).c; cc = CMP.setA(cc, "wings.put", { on: true, value: wv }).c;
    const a = amber(cc, "WING_WIDTH"); hit7 += a.length; for (const i of a) assert.match(i.text, /^! (call|put) wing A [\d.]+σ vs B [\d.]+σ wide$/);
  }
  assert.ok(hit7 > 0, "trigger 7 fires");
  // 8 one side a net debit, the other a credit
  c = CMP.setA(D0(), "exp", "20261016").c; c = CMP.setB(c, "values", { put: 5, call: 15 }).c; c = CMP.setB(c, "wings.call", { on: true, value: 5 }).c; c = CMP.setB(c, "fill", "nat").c; c = CMP.setB(c, "legs", "detached").c;
  const bB = CMP.buildB(c);
  if (bB.cr < 0) assert.equal(amber(c, "DEBIT")[0].text, "! B is a net debit");
  else { let found = false; for (const p of [3, 5, 8]) for (const wv of [3, 5, 8]) { let cc = CMP.setB(c, "values", { put: p, call: p }).c; cc = CMP.setB(cc, "wings.call", { on: true, value: wv }).c; cc = CMP.setB(cc, "wings.put", { on: true, value: wv }).c; if (CMP.buildB(cc).cr < 0) { assert.equal(amber(cc, "DEBIT")[0].text, "! B is a net debit"); found = true; } } assert.ok(found, "a debit case exists"); }
});

test("T16: neutral items, one per unlinked aspect that differs, none for the instrument; moot aspects skipped", () => {
  let c = D0();
  c = CMP.setB(c, "fill", "nat").c;
  c = CMP.setB(c, "exp", "20261218").c;
  c = CMP.setB(c, "inst", { id: "KORU", spot: 23 }).c;
  const d = CMP.diff(c);
  const neutral = d.items.filter(i => i.asked);
  assert.deepEqual(J(neutral.map(i => i.aspect)).sort(), ["exp", "fill", "override"]);
  assert.ok(!d.items.some(i => i.aspect === "inst"));
  assert.equal(neutral.find(i => i.aspect === "override").relink, false);
  assert.match(neutral.find(i => i.aspect === "override").text, /^B spot \+9\.1% \(override\)$/);
  // an unlinked aspect with equal values is not an item
  assert.equal(CMP.diff(CMP.unlink(D0(), "fill").c).items.length, 0);
  // legs moot while placement is linked or a side is a straddle; a wing value moot while off on both sides
  assert.equal(CMP.diff(CMP.setB(D0(), "legs", "detached").c).items.length, 0);
  let m = CMP.setB(CMP.setB(D0(), "values.put", 25).c, "legs", "detached").c;
  assert.ok(CMP.diff(m).items.some(i => i.aspect === "legs"));
  m = CMP.setA(m, "structure", "straddle").c;
  assert.ok(!CMP.diff(m).items.some(i => i.aspect === "legs"));
  assert.equal(CMP.diff(CMP.setB(D0(), "wings.call.value", 5).c).items.length, 0);
});

test("T17: defaults: RAM vs KORU, 20 Nov, 30/30Δ strangle, every link true except inst; labels carry every strike", () => {
  const c = CMP.defaults();
  assert.equal(c.A.inst.id, "RAM"); assert.equal(c.B.inst.id, "KORU"); assert.equal(c.A.exp, "20261120");
  assert.deepEqual([c.A.structure, c.A.legs, c.A.basis, c.A.values.center, c.A.values.put, c.A.values.call, c.A.fill], ["strangle", "together", "delta", "atm", 30, 30, "mid"]);
  assert.deepEqual(J(c.links), { inst: false, exp: true, structure: true, legs: true, placement: true, wingCall: true, wingPut: true, fill: true });
  assert.deepEqual([c.A.wings.call.on, c.A.wings.call.value, c.A.wings.put.on, c.A.wings.put.value], [false, 15, false, 15]);
  assert.deepEqual(J(c.sizing), { rule: "auto", h: 1 }); assert.equal(c.expMap, "nearest");
  const C = CTX.ctx9(STATE.defaults());
  assert.equal(C.labels.title, "RAM strangle 13/20 vs KORU strangle 18/30");
  const lab = pos => POS.build(Object.assign({}, c.A, pos)).label;
  const st = lab({ exp: "20261016", structure: "straddle" });
  assert.deepEqual(J(st), { short: "RAM 16 Oct", kindWord: "straddle", struct: "short straddle 14", wings: "", full: "RAM 16 Oct · short straddle 14", tab: "RAM straddle 14" });
  assert.match(lab({ inst: { id: "KORU" }, exp: "20261016", values: { center: "atm", put: 48, call: 48 } }).full, /^KORU 16 Oct · short strangle \d+(\.\d+)? \/ \d+(\.\d+)?$/);
  const g = lab({ values: { center: "atm", put: 70, call: 70 } });
  assert.match(g.struct, /^short guts \d+(\.\d+)?P \/ \d+(\.\d+)?C$/); assert.equal(g.kindWord, "guts");
  const w1 = lab({ wings: { call: { on: true, value: 10 }, put: { on: false, value: 15 } } });
  assert.match(w1.wings, /^\+ \d+(\.\d+)?C wing$/); assert.ok(w1.full.endsWith(w1.wings));
  const w2 = lab({ inst: { id: "KORU" }, exp: "20261218", values: { center: "atm", put: 20, call: 20 }, wings: { call: { on: true, value: 10 }, put: { on: true, value: 10 } } });
  assert.match(w2.wings, /^\+ \d+(\.\d+)?P & \d+(\.\d+)?C wings$/);
  assert.match(w2.full, /^KORU 18 Dec · short strangle [\d.]+ \/ [\d.]+ \+ [\d.]+P & [\d.]+C wings$/);
  for (const l of [st, g, w1, w2]) for (const s of Object.values(l)) assert.ok(!/ATM/.test(s), s);
  const w3 = lab({ inst: { id: "KORU" }, exp: "20270319", wings: { call: { on: true, value: 10 }, put: { on: true, value: 10 } } });
  assert.equal(w3.full, "KORU 19 Mar ’27 · short strangle 18 / 38 + 9P wing");   // the call wing is n/a (flagged), never silently dropped from the flags
  // (18P 28.9Δ vs 19P 31.2Δ on the fitted smile; it was 19P while inst9 flattened every strike above 16.4 to one vol)
  assert.ok(POS.build(Object.assign({}, c.A, { inst: { id: "KORU" }, exp: "20270319", wings: { call: { on: true, value: 10 }, put: { on: true, value: 10 } } })).flags.some(f => f.code === "WING_NA"));
});

test("T12: a basis switch keeps the switching side's strikes (A's own; B's through an implicit unlink of placement only)", () => {
  for (const e of ["20261016", "20261120", "20261218", "20270319"]) for (const [from, to] of [["delta", "money"], ["delta", "sigma"], ["money", "sigma"], ["sigma", "delta"]]) {
    let c = CMP.setA(D0(), "exp", e).c;
    c = CMP.setA(c, "wings.call", { on: true, value: 10 }).c; c = CMP.setA(c, "wings.put", { on: true, value: 10 }).c;
    if (from !== "delta") c = CMP.setA(c, "basis", from).c;
    const a0 = resA(c), b0 = resB(c);
    const ra = CMP.setA(c, "basis", to);
    assert.equal(resA(ra.c), a0, `${e} A ${from}->${to}`);
    assert.equal(ra.c.A.basis, to); assert.equal(ra.c.links.placement, true);
    const rb = CMP.setB(c, "basis", to);
    assert.equal(resB(rb.c), b0, `${e} B ${from}->${to}`);
    // B's own (unlinked) wing is converted with it and stays on its strike; so does a link of placement back to A
    const cw = CMP.setB(c, "wings.call.value", from === "delta" ? 8 : from === "money" ? 25 : 0.7).c, bw = resB(cw);
    const rw = CMP.setB(cw, "basis", to);
    assert.equal(resB(rw.c), bw, `${e} B own wing ${from}->${to}`);
    const lw = CMP.link(rw.c, "placement");
    assert.equal(legsOf(CMP.buildB(lw.c)).split(",").filter(x => x.startsWith("long call")).join(), bw.split(",").filter(x => x.startsWith("long call")).join(), `${e} B own wing after relinking placement`);
    assert.equal(resA(rb.c), a0);
    assert.deepEqual(J(CMP.ASPECTS.filter(x => c.links[x] !== rb.c.links[x])), ["placement"]);
  }
  // legs together / detached never re-strikes (finding 37)
  let c = CMP.setA(D0(), "legs", "detached").c; c = CMP.setA(c, "values", { put: 20, call: 40 }).c;
  const before = resA(c);
  assert.equal(resA(CMP.setA(c, "legs", "together").c), before);
});
