// T25 (v10 part 2c): the Compounding tab on the period vol. Migration precedence of the vols older views kept (the
// view's own period vol, else the Compounding tab's rv when it differs from the listed vol as that tab rounded it, else
// listed × hvk; one note per ticker; rv / rvB leave the Compounding state, B's differing moves become the run
// override), and, on the built page (Chromium, through the DOM and the page's executor), the port: the Compounding
// state carries no rv, its moves field writes the shared vol (reader Compounding: 0 allowed, 300 cap with a toast), a
// vol changed on the comparer marks the Random paths run stale, and a swap in vol mode flips the override's run while
// the shared vol stays.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { load, V9 } = require("./load.js");
const { STATE } = load();
const PLAYWRIGHT = "/opt/node22/lib/node_modules/playwright";
const J = o => JSON.parse(JSON.stringify(o));

// the Compounding state as v9 (and v10 before part 2c) wrote it: its own moves per ticker for A and for B
const legacyYr = ({ rv, rvB, bDiff = "strategy" }) => ({
  bDiff, sc: { cap0: 30000, W: 52, path: { mode: "flat" }, S0: { KORU: 21.09, RAM: 14.45 }, iv: { KORU: 130, RAM: 114 }, rv, ivB: { KORU: 121, RAM: 114 }, rvB },
  view: { v: "weeks" }
});
const v9Code = ({ hvk = 1, yr }) => {
  const tree = STATE.defaults();
  return "v9." + STATE.enc({ t: "yr", th: "auto", c: { cmp: tree.comparison, scen: Object.assign({}, tree.assumptions, { hvk }), view: tree.prefs }, y: yr });
};
const noteTexts = r => J(r.value.notices.map(n => n.text));

test("T25 migration: the Compounding tab's own vol wins over hvk; a vol equal to the rounded listed vol is no vol", () => {
  // KORU's Compounding vol 150 differs from the rounded listed 117: it wins; RAM's equals the rounded 102: hvk applies
  const r = STATE.readViewCode(v9Code({ hvk: 1.2, yr: legacyYr({ rv: { KORU: 150, RAM: 102 }, rvB: { KORU: 117, RAM: 102 } }) }));
  assert.equal(r.ok, true);
  assert.deepEqual(J(r.value.state.periodVol), { RAM: { pct: 122.64, source: "set" }, KORU: { pct: 150, source: "set" } });
  assert.deepEqual(noteTexts(r), [
    "RAM period vol set to 123%: the loaded view scaled HV30 102% by 1.20",
    "KORU period vol set to 150%: the loaded view's Compounding tab moved KORU at 150% (HV30 117%)"
  ], "one note per ticker, in ticker order");
  // both at the rounded listed vol and hvk 1: nothing set, no note
  const plain = STATE.readViewCode(v9Code({ yr: legacyYr({ rv: { KORU: 117, RAM: 102 }, rvB: { KORU: 117, RAM: 102 } }) }));
  assert.deepEqual(J(plain.value.state.periodVol), {}); assert.deepEqual(noteTexts(plain), []);
  // at the rounded listed vol with hvk 1.2: hvk applies to both
  const scaled = STATE.readViewCode(v9Code({ hvk: 1.2, yr: legacyYr({ rv: { KORU: 117, RAM: 102 }, rvB: {} }) }));
  assert.deepEqual(J(scaled.value.state.periodVol), { RAM: { pct: 122.64, source: "set" }, KORU: { pct: 140.78, source: "set" } });
  // 0 ("exactly on the path") is a vol of its own; a value above the cap is capped
  const edge = STATE.readViewCode(v9Code({ yr: legacyYr({ rv: { KORU: 0, RAM: 400 }, rvB: {} }) }));
  assert.deepEqual(J(edge.value.state.periodVol), { RAM: { pct: 300, source: "set" }, KORU: { pct: 0, source: "set" } });
});

test("T25 migration: a period vol the view already has is kept; rv / rvB leave the Compounding state; rvB becomes the run override", () => {
  const tree = STATE.defaults();
  const yr = legacyYr({ rv: { KORU: 150, RAM: 102 }, rvB: { KORU: 90, RAM: 102 }, bDiff: "vol" });
  const doc = { v: 10, tab: "yr", comparison: tree.comparison, assumptions: tree.assumptions, prefs: tree.prefs, periodVol: { KORU: { pct: 80, source: "set" } }, yr };
  const r = STATE.readStoredView(J(doc));
  assert.equal(r.ok, true);
  assert.deepEqual(J(r.value.state.periodVol), { KORU: { pct: 80, source: "set" } }, "the v10 document's own period vol wins; RAM at the listed vol");
  assert.deepEqual(noteTexts(r), []);
  assert.deepEqual(J(Object.keys(r.value.yr.sc)), ["cap0", "W", "path", "S0", "iv", "ivB", "volOverride"]);
  assert.deepEqual(J(r.value.yr.sc.volOverride), { run: "B", KORU: 90 }, "B's moves where they differ from A's");
  assert.equal(yr.sc.rv.KORU, 150, "the input is untouched");
  // a Compounding state without the old fields passes unchanged (the same object)
  const current = { sc: { iv: { KORU: 130 }, volOverride: { run: "A", KORU: 150 } }, k: 1 };
  const kept = STATE.readStoredView(J(Object.assign({}, doc, { yr: current })));
  assert.deepEqual(J(kept.value.yr), current);
  const bare = STATE.migrate({ v: 9, tab: "compare", theme: "auto", cmp: { cmp: tree.comparison, scen: tree.assumptions, view: tree.prefs }, yr: { k: 2 } });
  assert.deepEqual(J(bare.yr), { k: 2 });
  // a v8 blob's Compounding state migrates too
  const v8 = STATE.migrate({ v: 8, tab: "yr", cmp: {}, yr: legacyYr({ rv: { KORU: 160, RAM: 102 }, rvB: { KORU: 160, RAM: 102 } }) });
  assert.deepEqual(J(v8.state.periodVol), { KORU: { pct: 160, source: "set" } });
  assert.deepEqual(J(v8.yr.sc.volOverride), { run: "B" }, "B moved with A: no override");
});

test("T25 the built page: the port, the stale Random paths run, a swap in vol mode", { timeout: 240000 }, async () => {
  let playwright;
  try { playwright = require(PLAYWRIGHT); } catch (error) { assert.fail(`Playwright is needed at ${PLAYWRIGHT}: ${error.message}`); }
  fs.mkdirSync(path.join(V9, "scratch"), { recursive: true });
  const out = fs.mkdtempSync(path.join(V9, "scratch", "rk_t25_"));
  const browser = await playwright.chromium.launch();
  try {
    const built = spawnSync("python3", [path.join(V9, "build.py"), "--no-tsc", "--out", path.join(out, "lab.html")], { encoding: "utf8", cwd: V9 });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", e => problems.push("pageerror: " + e.message));
    page.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !/^Failed to load resource/.test(m.text())) { problems.push(`console.${m.type()}: ${m.text()}`); } });
    const toasts = [];
    await page.exposeFunction("__toast", text => toasts.push(text));
    await context.addInitScript(() => {
      addEventListener("DOMContentLoaded", () => {
        const host = document.querySelector("#toast");
        if (host) { new MutationObserver(() => { const t = host.textContent.trim(); if (t) { window.__toast(t); } }).observe(host, { childList: true, subtree: true, characterData: true }); }
      });
    });
    const settle = () => page.waitForTimeout(700);
    const read = expr => page.evaluate(expr);
    const typeMoves = async (sel, value) => { await page.fill(sel, value); await page.press(sel, "Enter"); await settle(); };
    const periodVol = () => read(() => J(page.store.read().periodVol));
    await page.addInitScript(() => { window.J = o => JSON.parse(JSON.stringify(o)); });
    // a v9 code carrying the Compounding tab's own KORU moves (150): the period vol, and no rv in the tab's state
    const code = v9Code({ yr: legacyYr({ rv: { KORU: 150, RAM: 102 }, rvB: { KORU: 117, RAM: 102 } }) });
    await page.goto("file://" + path.join(out, "lab.html") + "#" + code);
    await settle();
    assert.deepEqual(await periodVol(), { KORU: { pct: 150, source: "set" } });
    const sc = await read(() => COMPOUND.getState().sc);
    assert.ok(!("rv" in sc) && !("rvB" in sc), "getState carries no rv / rvB: " + JSON.stringify(Object.keys(sc)));
    assert.equal(await read(() => COMPOUND._res().A.vol.rv), 1.5, "the run moves at the shared vol");
    assert.equal(await read(() => JSON.parse(localStorage.getItem("rk-lab-v10")).yr.sc.rv), undefined, "nor does the stored view");

    // the moves field writes the shared vol: 0 stays 0 (the Compounding floor), 400 is capped at 300 with a toast
    await typeMoves("#y-v-KORU-rv", "0");
    assert.deepEqual(await periodVol(), { KORU: { pct: 0, source: "set" } });
    assert.equal(await read(() => COMPOUND._res().A.vol.rv), 0);
    await typeMoves("#y-v-KORU-rv", "400");
    assert.deepEqual(await periodVol(), { KORU: { pct: 300, source: "set" } });
    assert.ok(toasts.some(t => /KORU period vol capped at 300% \(asked 400%\)/.test(t)), JSON.stringify(toasts));
    await typeMoves("#y-v-KORU-rv", "120");
    // the field shows what was applied, also while it keeps focus (fix round 2): -5 is floored at 0 on screen too
    await typeMoves("#y-v-KORU-rv", "-5");
    assert.deepEqual(await read(() => [document.querySelector("#y-v-KORU-rv").value, document.activeElement.id]), ["0", "y-v-KORU-rv"]);
    await typeMoves("#y-v-KORU-rv", "120");
    // the pricing IV after a loaded view (a new ys.sc, the pair not redrawn): a typed IV still lands (fix round 2)
    await read(() => { COMPOUND.setState(COMPOUND.getState()); COMPOUND.render(); });
    await typeMoves("#y-v-KORU-iv", "150");
    assert.equal(await read(() => COMPOUND.getState().sc.iv.KORU), 150, "the typed pricing IV reaches the state");
    await typeMoves("#y-v-KORU-iv", "130");

    // Random paths: a run, then a vol changed on the comparer marks it stale on the tab's next render
    await page.click('#y-view button:nth-child(2)'); await settle();
    await page.click("#y-mc summary"); await page.click('#y-mcn button[data-v="1000"]'); await page.click("#y-mcrun");
    await page.waitForFunction(() => /paths per run/.test(document.querySelector("#y-mcp").textContent), null, { timeout: 120000 });
    assert.equal(await read(() => COMPOUND._mc().stale), false);
    await page.click("#tb-compare"); await settle();
    const changed = await read(() => page.executor.execute({ type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 140 }).ok);
    assert.equal(changed, true);
    await page.click("#tb-yr"); await settle();
    assert.equal(await read(() => COMPOUND._mc().stale), true, "the comparer's vol change marks the run stale");
    assert.equal(await read(() => document.querySelector("#y-mcp").textContent), "inputs changed: run again");
    assert.equal(await read(() => COMPOUND._res().A.vol.rv), 1.4, "the next render uses the new value");
    // back to the vol the run was made with: no longer stale
    await read(() => page.executor.execute({ type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 120 }));
    await page.click("#y-view button:nth-child(1)"); await settle(); await page.click("#y-view button:nth-child(2)"); await settle();
    assert.equal(await read(() => COMPOUND._mc().stale), false, "the key holds the vol, not a change counter");

    // B differs in vol: B's own moves, A's on the shared vol; a swap flips the run and keeps the shared vol
    await page.click("#y-view button:nth-child(1)"); await settle();
    await page.click("#y-bmore summary"); await page.click('#y-bdiff2 button[data-v="vol"]'); await settle();
    await typeMoves("#y-v-KORUB-rv", "150");
    assert.deepEqual(await periodVol(), { KORU: { pct: 120, source: "set" } }, "B's own moves leave the shared vol");
    const pairNames = () => read(() => [...document.querySelectorAll("#y-vol .tk")].map(e => e.textContent));
    assert.deepEqual(await pairNames(), ["KORU", "B KORUown"], "the pair with a run's own moves is tagged");
    assert.deepEqual(await read(() => [COMPOUND._res().A.vol.rv, COMPOUND._res().B.vol.rv]), [1.2, 1.5]);
    await page.click("#y-swap"); await settle();
    assert.deepEqual(await periodVol(), { KORU: { pct: 120, source: "set" } }, "a swap never changes the shared vol");
    assert.deepEqual(await read(() => J(COMPOUND.getState().sc.volOverride)), { run: "A", KORU: 150 });
    assert.deepEqual(await read(() => [COMPOUND._res().A.vol.rv, COMPOUND._res().B.vol.rv]), [1.5, 1.2], "each run keeps its vol");
    assert.deepEqual(await read(() => [document.querySelector("#y-v-KORU-rv").value, document.querySelector("#y-v-KORUB-rv").value]), ["150", "120"]);
    assert.deepEqual(await pairNames(), ["A KORUown", "B KORU"], "after the swap A's pair carries the own moves, and says so");
    assert.deepEqual(await read(() => [COMPOUND._res().A.vol.iv, COMPOUND._res().B.vol.iv]), [1.21, 1.3], "the pricing IVs swapped with the runs");
    // the comparer reads the shared vol, not a run's override
    assert.equal(await read(() => CTX.ctx9(page.store.read()).volOf("KORU").pct), 120);
    // a run's own moves outside the range: applied at the end, with a toast worded like the period vol's
    await typeMoves("#y-v-KORU-rv", "400");
    assert.deepEqual(await read(() => J(COMPOUND.getState().sc.volOverride)), { run: "A", KORU: 300 });
    assert.ok(toasts.some(t => /A's own KORU moves capped at 300% \(asked 400%\)/.test(t)), JSON.stringify(toasts));
    await typeMoves("#y-v-KORU-rv", "150");
    // a swap outside vol mode leaves both own vols (pricing IV and moves) with their slot, together: back in vol mode
    // the slot that had them still has both (fix round 2: they never split between the runs)
    await page.click("#y-bdiff button[data-v=\"strategy\"]"); await settle();
    await page.click("#y-swap"); await settle();
    assert.equal(await read(() => COMPOUND.getState().sc.volOverride.run), "A", "the dormant override stays with its slot");
    await page.click("#y-bmore summary"); await page.click('#y-bdiff2 button[data-v="vol"]'); await settle();
    assert.deepEqual(await read(() => [COMPOUND._res().A.vol.iv, COMPOUND._res().A.vol.rv, COMPOUND._res().B.vol.iv, COMPOUND._res().B.vol.rv]), [1.21, 1.5, 1.3, 1.2], "A keeps its own IV and moves, B the shared vol");
    // the moves menu lists the comparer's references (one list): the listed vol, ATM at A's horizon, the realized vols
    const refs = await read(() => [...document.querySelectorAll('#y-v-KORU-mb button[data-k="rv"]')].map(b => b.textContent));
    assert.deepEqual(refs, ["HV30 117", "ATM 20 Nov 130", "52-wk realized 173", "260-wk realized 101", "exactly on the path 0"]);
    // ATM follows Compare's A horizon
    await read(() => page.executor.execute({ type: Command.SetA, path: "exp", value: "20261016" }));
    await read(() => COMPOUND.render());
    assert.equal(await read(() => document.querySelector('#y-v-KORU-mb button[data-src="atm"]').textContent), "ATM 16 Oct 124");
    // the ATM tick sets the period vol at ATM, with the expiry it was read at and its unrounded pct (fix round 2: the
    // port dropped the expiry and the command was refused). B's pair is the shared one here (A carries its own moves)
    await page.click("#y-v-KORUB-m summary");
    await page.click('#y-v-KORUB-mb button[data-src="atm"]'); await settle();
    await page.click("#y-v-KORUB-m summary");
    assert.deepEqual(await periodVol(), { KORU: { pct: 123.93, source: "atm", expiry: "20261016" } });
    assert.equal(await read(() => CTX.ctx9(page.store.read()).volOf("KORU").label), "vol 124% (ATM 16 Oct)");
    // Random paths: the IV path shapes the moves ("keep the gap"), so a path change marks the run stale
    await page.click('#y-view button:nth-child(2)'); await settle();
    await page.click("#y-mcrun");
    await page.waitForFunction(() => /paths per run/.test(document.querySelector("#y-mcp").textContent), null, { timeout: 120000 });
    assert.equal(await read(() => COMPOUND._mc().stale), false);
    await read(() => { COMPOUND.setState(Object.assign(COMPOUND.getState(), { ivp: Object.assign(COMPOUND.getState().ivp, { mode: "line", end: 0.7 }) })); COMPOUND.render(); });
    assert.equal(await read(() => COMPOUND._mc().stale), true, "an IV-path change marks the Random paths run stale");
    // a Compounding 0 reads on the comparer as its 1% floor, and says so
    await page.click('#y-view button:nth-child(1)'); await settle();
    await read(() => page.executor.execute({ type: Command.SetPeriodVol, ticker: "KORU", source: VolSource.Set, pct: 0, reader: Tab.Compounding }));
    await page.click("#tb-compare"); await settle();
    assert.match(await read(() => document.querySelector("#s9B .s9vol").textContent), /vol 1% \(set 0%, floored\)/);
    // the comparer's box shows what was applied, also while it keeps focus (fix round 2): 400 shows 300, 0 shows 1
    await page.click('#d9t [data-act="instx"][data-side="B"]'); await settle();
    const box = '#d9t .d9pv.b input[data-act="pvnum"]';
    const boxNow = () => page.evaluate(sel => [document.querySelector(sel).value, document.activeElement === document.querySelector(sel)], box);
    await page.fill(box, "400"); await page.press(box, "Enter"); await settle();
    assert.deepEqual(await boxNow(), ["300", true]);
    assert.deepEqual(await periodVol(), { KORU: { pct: 300, source: "set" } });
    await page.fill(box, "0"); await page.press(box, "Enter"); await settle();
    assert.deepEqual(await boxNow(), ["1", true]);
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
});
