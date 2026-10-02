// T20 export: toMarkdownCompare is pure and node-testable. Three states (default; B call wing only; guts):
// A / B labels, per-leg credit / debit lines, the net, the EV row with its odds label, no undefined / NaN / [object,
// and every table has the same number of columns on every row.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, V9 } = require("./load.js");
const L = load();
vm.runInContext(fs.readFileSync(path.join(V9, "ui9_export.js"), "utf8") + "\n;globalThis.__e = {toMarkdownCompare, EXPORT9};", L.ctx, { filename: "ui9_export.js" });
const { toMarkdownCompare, EXPORT9 } = L.ctx.__e, { STATE, CTX } = L;
const ops = (S, list) => { for (const [o, ...a] of list) S = STATE.cmpOp(S, o, ...a).S9; return S; };
const usd = x => { const a = Math.abs(x); return "$" + (a >= 20 || Math.abs(a - Math.round(a)) < 0.05 ? Math.round(a).toLocaleString("en-US") : a.toFixed(1)); };
const STATES = {
  default: STATE.defaults(),
  bWing: ops(STATE.defaults(), [["unlink", "wingCall"], ["setB", "wings.call.on", true]]),
  guts: ops(STATE.defaults(), [["setA", "values", { put: 60, call: 60 }]])
};
const ALL = Object.fromEntries(EXPORT9.CMP_SECTIONS.map(([k]) => [k, true]));
// split a markdown table row into cells, honouring escaped pipes
const cells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/);
function tables(md) {
  const out = []; let cur = null;
  for (const line of md.split("\n")) {
    if (/^\|/.test(line)) { if (!cur) out.push(cur = []); cur.push(line); } else cur = null;
  }
  return out;
}

for (const [name, S] of Object.entries(STATES)) {
  test(`T20 export (${name}): labels, legs, net, EV row, clean text, square tables`, () => {
    const C = CTX.ctx9(S);
    const md = toMarkdownCompare(C, S, { sections: ALL, code: STATE.code(S, { tab: "compare", theme: "auto" }), now: new Date(2026, 9, 2) });
    assert.ok(md.includes(`### A · ${C.A.label.full}`), "A label");
    assert.ok(md.includes(`### B · ${C.B.label.full}`), "B label");
    assert.ok(md.includes(C.labels.title), "title");
    for (const b of [C.A, C.B]) {
      assert.ok(!b.na);
      for (const l of b.legs) {
        const word = l.perContract < 0 ? "debit" : "credit", row = md.split("\n").find(x => x.startsWith("|") && x.includes(` ${String(+l.K.toFixed(2))}${l.cp} `) && x.includes(`${word} ${usd(l.perContract)}`));
        assert.ok(row, `${b.label.short} ${l.K}${l.cp}: a leg row with "${word} ${usd(l.perContract)}"`);
      }
      assert.ok(md.includes(`**Net ${b.net.isDebit ? "debit" : "credit"} ${usd(b.net.perContract)} per contract**`), `${b.label.short} net`);
    }
    if (name === "bWing") assert.ok(/\| Call wing \(long\) \| 33C .* debit \$\d+/.test(md), "the wing's debit line");
    const ev = md.split("\n").find(x => x.startsWith("| Expected value"));
    assert.ok(ev && ev.includes("implied odds: fill vs mid"), "EV row carries its odds label");
    const S2 = STATE.applyChange(S, s => { s.scen.dist = "hv"; });
    const ev2 = toMarkdownCompare(CTX.ctx9(S2), S2, {}).split("\n").find(x => x.startsWith("| Expected value"));
    assert.ok(ev2 && ev2.includes("HV30 ×1.00 odds"), "EV row under HV30 says so");
    assert.ok(md.includes("#v9."), "view code");
    const text = md.replace(/#v9\.\S+/, "#v9.CODE");   // the code is base64: any letters may appear in it
    for (const bad of ["undefined", "NaN", "[object", "null"]) assert.ok(!text.includes(bad), `no "${bad}"`);
    const T = tables(md);
    assert.ok(T.length >= 5, `${T.length} tables`);
    for (const t of T) {
      const n = cells(t[0]).length;
      assert.ok(/^\|( *:?-+:? *\|)+$/.test(t[1]), "separator row");
      for (const r of t) assert.equal(cells(r).length, n, `row "${r}"`);
    }
    if (name === "guts") assert.ok(md.includes("(resolved to a guts)") && md.includes("(ITM)"));
  });
}
test("T20 export: sections switch on and off; the overview table is off by default", () => {
  const S = STATE.defaults(), C = CTX.ctx9(S);
  const md = toMarkdownCompare(C, S, {});
  assert.ok(!md.includes("## Overview") && md.includes("## Results") && md.includes("## Recovery dynamics"));
  const only = toMarkdownCompare(C, S, { sections: { header: false, comparison: false, assumptions: false, results: true, recovery: false, pins: false, overview: false, notes: false } });
  assert.ok(only.startsWith("## Results"));
  assert.ok(!toMarkdownCompare(C, S, {}).includes("## Pinned"), "no pins, no section");
  const P = STATE.applyChange(S, s => { s.view.pins = [{ SA: 13, SB: 20, dA: 10, dB: 10 }]; });
  assert.ok(toMarkdownCompare(CTX.ctx9(P), P, {}).includes("## Pinned scenarios"));
});
test("T20 export: the table helper pads columns and escapes pipes", () => {
  const t = EXPORT9.table(["a", "b"], [["x|y", "1"], ["long text", "22"]]).split("\n");
  assert.equal(new Set(t.map(l => l.length)).size, 1, "every line the same width");
  assert.ok(t[2].includes("x\\|y"));
});
