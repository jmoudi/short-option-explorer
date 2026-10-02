// T3 (σ76 refit on Fpar) and T4 (overrides, versions, caches)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const L = load();
const { INST, POS, DIST, CMP, CTX, STATE } = L;
const J = x => JSON.parse(JSON.stringify(x));
const chains = () => INST.list().flatMap(({ id }) => INST.base(id).expiries.map(e => [id, e, INST.base(id).exp(e)]));

test("T3: the refit reprices ≥ 90% of OTM rows within max(half-spread, 3% of mid) on every chain", () => {
  for (const [id, e, E] of chains()) {
    let n = 0, ok = 0;
    for (const o of E.rows) {
      if (!(o.bid > 0)) continue;
      if (!(o.cp === "P" ? o.K <= E.Fpar : o.K > E.Fpar)) continue;
      n++;
      const px = INST.b76(E.Fpar, o.K, E.T, E.smile(o.K), o.cp);
      if (Math.abs(px - o.mid) <= Math.max((o.ask - o.bid) / 2, 0.03 * o.mid) + 1e-12) ok++;
    }
    assert.ok(n >= 5, `${id} ${e} has OTM rows`);
    assert.ok(ok / n >= 0.9, `${id} ${e}: ${ok}/${n} repriced`);
  }
});

test("T3: call Δ is non-increasing in K across [minK, maxK] on all 8 chains", () => {
  assert.equal(chains().length, 8);
  for (const [id, e, E] of chains()) {
    const lo = E.strikes[0], hi = E.strikes[E.strikes.length - 1];
    let prev = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const K = lo * Math.pow(hi / lo, i / 2000), c = INST.fwdDelta(E.Fpar, K, E.T, E.smile(K), "C");
      assert.ok(c <= prev + 1e-12, `${id} ${e}: call Δ rises at K=${K.toFixed(3)}`);
      prev = c;
    }
    // the listed strikes' cached deltas agree with the continuous ones
    for (const K of E.strikes) assert.equal(E.callDelta(K), INST.fwdDelta(E.Fpar, K, E.T, E.smile(K), "C"));
  }
});

test("T3: the smile is continuous at Fpar and the forward / ATM fields are consistent", () => {
  for (const [, , E] of chains()) {
    const a = E.smile(E.Fpar * (1 - 1e-7)), b = E.smile(E.Fpar * (1 + 1e-7));
    assert.ok(Math.abs(a - b) < 1e-5);
    assert.ok(Math.abs(E.atm - E.smile(E.Fpar)) < 1e-12);
    assert.ok(Math.abs(E.sigma - E.atm * Math.sqrt(E.T)) < 1e-12);
    assert.ok(Math.abs(E.g - Math.log(E.Fpar / E.S) / E.T) < 1e-12);
    // ATM call Δ is N(σ√T/2), never 50
    assert.ok(Math.abs(E.callDelta(E.Fpar) - L.N(E.sigma / 2)) < 1e-9);
  }
});

test("T3: Fpar is v8's parity forward (up to 3 pairs nearest spot)", () => {
  const { loadV8 } = require("./load.js"), V = loadV8();
  for (const [id, e, E] of chains()) assert.ok(Math.abs(E.Fpar - V.chain(id, e).Fimpl) < 1e-12, `${id} ${e}`);
});

test("T4: a no-op override returns the base snapshot; a spot override is a new version with model quotes", () => {
  for (const { id } of INST.list()) {
    const B0 = INST.base(id);
    assert.equal(INST.make({ id, spot: B0.spot }), B0);
    assert.equal(INST.make({ id, spot: B0.spot * (1 + 1e-12), ivShift: 0 }), B0);
    assert.equal(INST.make({ id }), B0);
    const O = INST.make({ id, spot: B0.spot * 1.1 });
    assert.notEqual(O.version, B0.version);
    assert.equal(INST.make({ id, spot: B0.spot * 1.1 }), O);           // memoized by version
    assert.ok(O.overridden && !B0.overridden);
    for (const e of B0.expiries) {
      const E0 = B0.exp(e), E1 = O.exp(e);
      assert.deepEqual(J(E1.strikes), J(E0.strikes));
      assert.deepEqual(J(E1.rows.map(o => o.K + o.cp)), J(E0.rows.map(o => o.K + o.cp)));
      assert.ok(Math.abs(E1.Fpar - E0.Fpar * O.spot / B0.spot) < 1e-12);
      // the parity forward from the model mids (pairs with bids, nearest the new spot) equals Fpar·S'/S
      const pairs = [];
      for (const c of E1.calls) { const p = E1.row(c.K, "P"); if (p && c.bid > 0 && p.bid > 0 && c.mid > 0 && p.mid > 0) pairs.push({ K: c.K, F: c.K + Math.exp(L.R * E1.T) * (c.mid - p.mid) }); }
      pairs.sort((a, b) => Math.abs(a.K - O.spot) - Math.abs(b.K - O.spot));
      const near = pairs.slice(0, 3), F = near.reduce((t, p) => t + p.F, 0) / near.length;
      assert.ok(Math.abs(F - E0.Fpar * 1.1) < 1e-9, `${id} ${e}: ${F} vs ${E0.Fpar * 1.1}`);
      assert.ok(E1.rows.every(o => o.model));
      // relative spreads kept
      for (const o of E1.rows) { const o0 = E0.row(o.K, o.cp); if (o0.bid > 0 && o.mid > 0) assert.ok(Math.abs((o.ask - o.bid) / o.mid - (o0.ask - o0.bid) / o0.mid) < 1e-9); }
    }
  }
});

test("T4: every cache misses after a spot override (instrumented counters)", () => {
  const S0 = STATE.defaults();
  CTX.ctx9(S0);
  INST.cacheReset();
  CTX.ctx9(S0);
  const warm = INST.cacheStats();
  for (const k of ["pos.build", "dist.make", "pos.stats"]) assert.equal(warm[k].misses, 0, `${k} warm`);
  INST.cacheReset();
  const r = STATE.cmpOp(S0, "setB", "inst.spot", INST.base(S0.cmp.B.inst.id).spot * 1.0973);
  const C = CTX.ctx9(r.S9);
  const st2 = INST.cacheStats();
  for (const k of ["inst.instrument", "pos.build", "pos.price", "dist.make", "pos.stats"]) assert.ok(st2[k].misses > 0, `${k} misses after override`);
  assert.ok(C.B.inst.overridden && C.B.flags.some(f => f.code === "MODEL_QUOTES"));
  assert.notEqual(C.B.key, CTX.ctx9(S0).B.key);
});

test("T4: the IV shift is continuous at 0 and keeps parity; ivShift re-prices the entry", () => {
  for (const { id } of INST.list()) {
    const B0 = INST.base(id), Ip = INST.make({ id, ivShift: 0.001 }), Im = INST.make({ id, ivShift: -0.001 }), I5 = INST.make({ id, ivShift: 5 });
    for (const e of B0.expiries) {
      const E0 = B0.exp(e), Ep = Ip.exp(e), Em = Im.exp(e), E5 = I5.exp(e);
      assert.equal(E5.Fpar, E0.Fpar);
      for (const o of E0.rows) {
        assert.ok(Math.abs(Ep.row(o.K, o.cp).mid - o.mid) < 1e-3 && Math.abs(Em.row(o.K, o.cp).mid - o.mid) < 1e-3);
        if (o.mid > 0 && o.bid > 0) assert.ok(Math.abs(E5.row(o.K, o.cp).bid / E5.row(o.K, o.cp).mid - o.bid / o.mid) < 1e-9);
      }
      // parity unchanged: C − P is the same at every strike with both rows
      for (const c of E0.calls) { const p = E0.row(c.K, "P"); if (!p) continue; const d0 = c.mid - p.mid, d5 = E5.row(c.K, "C").mid - E5.row(c.K, "P").mid; if (E5.row(c.K, "C").mid > 0 && E5.row(c.K, "P").mid > 0 && E5.row(c.K, "P").mid !== 0) assert.ok(Math.abs(d0 - d5) < 1e-9 || E5.row(c.K, "P").mid === 0 || E5.row(c.K, "C").mid === 0); }
      assert.ok(Math.abs(E5.atm - E0.atm - 0.05) < 1e-12);
    }
    const pos = Object.assign(CMP.defaults().A, { inst: { id } });
    const b0 = POS.build(pos), b5 = POS.build(Object.assign({}, pos, { inst: { id, ivShift: 5 } }));
    assert.ok(b5.cr > b0.cr, "a higher IV re-prices a short entry higher");
    assert.ok(Math.abs(POS.val(b5, b5.S, b5.T)) < 1e-12, "entry P&L is still 0 on model quotes");
  }
});

test("T4: synthetic chains (one strike, a gap, a missing expiry) build without errors", () => {
  const { synthD, range } = require("./synth.js");
  const D = synthD({ inst: [
    { id: "RAM", S: 10, exps: { "20261120": { dte: 50, strikes: [10] }, "20261218": { dte: 78, strikes: range(5, 15, 1).filter(K => K < 9 || K > 11) } } },
    { id: "SYN", S: 20, exps: { "20261218": { dte: 78, strikes: range(10, 30, 1) } } }
  ] });
  const S = load(D);
  assert.deepEqual(J(S.INST.list().map(x => x.id)), ["RAM", "SYN"]);
  const one = S.INST.base("RAM").exp("20261120");
  assert.deepEqual(J(one.strikes), [10]);
  assert.ok(one.fitInfo.flat);
  assert.equal(S.INST.base("SYN").nearestExp("20261120"), "20261218");
  const S9 = S.STATE.defaults();
  const C = S.CTX.ctx9(S9);
  assert.equal(C.A.exp, "20261218");
});

test("T4: overrides never mutate D (unfrozen copy, byte-identical after overrides, builds, distributions and stats)", () => {
  const { realD } = require("./load.js");
  const D = realD(), before = JSON.stringify(D);
  const S = load(D, { freeze: false });
  for (const { id } of S.INST.list()) for (const sd of [{ id }, { id, spot: S.INST.base(id).spot * 1.13 }, { id, ivShift: -7 }, { id, spot: S.INST.base(id).spot * 0.8, ivShift: 12 }]) {
    const I = S.INST.make(sd);
    for (const e of I.expiries) {
      const b = S.POS.build({ inst: sd, exp: e, structure: "strangle", legs: "together", basis: "delta", values: { center: "atm", put: 25, call: 25 }, wings: { call: { on: true, value: 10 }, put: { on: true, value: 10 } }, fill: "nat" });
      if (!b.na) { S.POS.stats(b, S.DIST.make(b.E, b.S, "rn", I.hv, 1)); S.POS.val(b, b.S * 1.1, b.T / 2); }
    }
  }
  S.CTX.ctx9(S.STATE.cmpOp(S.STATE.defaults(), "setB", "inst.spot", 25).S9);
  assert.equal(JSON.stringify(D), before);
  assert.ok(!Object.values(D.u).some(U => Object.values(U.exps).some(E => "_w" in E)), "no _w written onto the data");
});
