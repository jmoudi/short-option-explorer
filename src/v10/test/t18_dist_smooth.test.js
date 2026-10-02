// The implied (RN) distribution has no point mass from a slope break in the smile (integration finding: KORU 19 Mar '27
// had 2.1% of the mass in one bin near 16.4 when wingAnchors fell back to the midpoint of the quoted range).
"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./load.js");
const M = load();
test("T18 RN distributions: no bin holds more than 2.5× the 90th-percentile bin mass, on every chain", () => {
  for (const it of M.INST.list()) {
    const I = M.INST.base(it.id);
    for (const e of I.expiries) {
      const E = I.exp(e), d = M.DIST.make({ expiry: E, odds: "rn" }), m = [];
      for (let i = 1; i <= d.n; i++) m.push(d.cdf[i] - d.cdf[i - 1]);
      const s = m.slice().sort((a, b) => a - b), p90 = s[Math.floor(s.length * 0.9)], mx = s[s.length - 1];
      assert.ok(mx <= 2.5 * p90, `${it.id} ${e}: max bin ${mx.toFixed(4)} vs p90 ${p90.toFixed(4)}`);
    }
  }
});
test("T18 smile: value and slope continuous at the wing anchors (no slope break inside the quoted range)", () => {
  for (const it of M.INST.list()) {
    const I = M.INST.base(it.id);
    for (const e of I.expiries) {
      const E = I.exp(e), f = E.fitInfo; if (f.flat) continue;
      for (let i = 1; i < 200; i++) {
        // slope in x = ln(K/F) on either side of the point; a break larger than the fit's own curvature over h fails
        const x = f.xlo + (f.xhi - f.xlo) * i / 200, K = E.Fpar * Math.exp(x), h = 1e-4;
        const sl = (E.smile(K * Math.exp(h)) - E.smile(K)) / h, sr = (E.smile(K) - E.smile(K * Math.exp(-h))) / h;
        assert.ok(Math.abs(sl - sr) < 0.01, `${it.id} ${e} K ${K.toFixed(2)}: slope ${sr.toFixed(4)} → ${sl.toFixed(4)}`);
      }
    }
  }
});
