// T23 storage keys in the built page (Chromium): the page writes only "rk-lab-v10"; a v9 blob in "rk-lab-v9" is read
// once, when there is no v10 blob, into the v10 tree, and is never written or removed. The page is built into a
// temporary folder under scratch/ (as T22 does) and driven through the DOM; every localStorage write and removal is
// recorded by an init script.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { load, V9 } = require("./load.js");
const { STATE } = load();
const PLAYWRIGHT = "/opt/node22/lib/node_modules/playwright";
const KEY_V10 = "rk-lab-v10", KEY_V9 = "rk-lab-v9";
const J = o => JSON.parse(JSON.stringify(o));

// a v9 blob as the v9 page wrote it: A filled at natural, $ per contract, dark theme, a Compounding state that
// carries v9's export section choice
function writeV9Blob() {
  const tree = STATE.applyChange(STATE.cmpOp(STATE.defaults(), "setA", "fill", "nat").state, s => { s.prefs.units = "usd"; s.prefs.theme = "dark"; });
  const view = Object.assign({}, tree.prefs);
  delete view.exportSections;
  const yr = { view: { exportCmp: { header: true, comparison: false, assumptions: true, results: true, recovery: true, pins: true, overview: true, notes: true } } };
  return { v: 9, tab: "compare", theme: "dark", cmp: { cmp: tree.comparison, scen: tree.assumptions, view }, yr };
}
// before the page's scripts: record every localStorage write / removal / clear (except the test's own seeding)
function recordStorage() {
  const writes = window.__storageWrites = [];
  const proto = Storage.prototype, setItem = proto.setItem, removeItem = proto.removeItem, clear = proto.clear;
  proto.setItem = function (key, value) { if (!window.__seeding) { writes.push(["set", String(key)]); } return setItem.call(this, key, value); };
  proto.removeItem = function (key) { if (!window.__seeding) { writes.push(["remove", String(key)]); } return removeItem.call(this, key); };
  proto.clear = function () { if (!window.__seeding) { writes.push(["clear", ""]); } return clear.call(this); };
}
const readStored = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const readCode = page => page.evaluate(() => /** @type {HTMLInputElement} */ (document.querySelector("#vcode")).value);
// until the stored v10 blob holds value at path (a list of keys)
async function waitForStoredView(page, { path: keys, value }) {
  await page.waitForFunction(([key, keys, value]) => {
    const text = localStorage.getItem(key);
    if (!text) { return false; }
    const found = keys.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), JSON.parse(text));
    return found === value;
  }, [KEY_V10, keys, value], { timeout: 15000 });
}

test("T23 storage: rk-lab-v10 is the only key the page writes; a v9 blob is read once into the v10 tree and never written", { timeout: 120000 }, async () => {
  let playwright;
  try { playwright = require(PLAYWRIGHT); } catch (error) { assert.fail(`Playwright is needed at ${PLAYWRIGHT}: ${error.message}`); }
  fs.mkdirSync(path.join(V9, "scratch"), { recursive: true });
  const out = fs.mkdtempSync(path.join(V9, "scratch", "rk_t23_"));
  const browser = await playwright.chromium.launch();
  try {
    const built = spawnSync("python3", [path.join(V9, "build.py"), "--no-tsc", "--out", path.join(out, "lab.html")], { encoding: "utf8", cwd: V9 });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await context.route(/^https?:/, route => route.abort());   // fonts: the test needs no network
    await context.addInitScript(recordStorage);
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", e => problems.push("pageerror: " + e.message));
    // the aborted font requests log "Failed to load resource"; anything else on the console is a problem
    page.on("console", m => {
      const isProblem = (m.type() === "error" || m.type() === "warning") && !/^Failed to load resource/.test(m.text());
      if (isProblem) { problems.push(`console.${m.type()}: ${m.text()}`); }
    });
    const url = "file://" + path.join(out, "lab.html");
    const writes = [];
    const collectWrites = async () => { writes.push(...await page.evaluate(() => window.__storageWrites.splice(0))); };

    // 1. a first visit stores a v10 view (defaults)
    await page.goto(url);
    await waitForStoredView(page, { path: ["v"], value: 10 });
    assert.match(await readCode(page), /^v10\./);
    // 2. only a v9 blob in storage: it loads, migrated, and is left exactly as it was
    const v9Text = JSON.stringify(writeV9Blob());
    await page.evaluate(([key, text]) => { window.__seeding = true; localStorage.clear(); localStorage.setItem(key, text); window.__seeding = false; }, [KEY_V9, v9Text]);
    await collectWrites();
    await page.goto(url);   // without the address code, which would win over the stored blob
    await waitForStoredView(page, { path: ["comparison", "A", "fill"], value: "nat" });
    const migrated = JSON.parse(await readStored(page, KEY_V10));
    assert.equal(migrated.prefs.units, "usd"); assert.equal(migrated.prefs.theme, "dark");
    assert.equal(migrated.prefs.exportSections.compare.comparison, false); assert.equal(migrated.prefs.exportSections.compare.overview, true);
    assert.equal(migrated.yr.view.exportCmp, undefined, "the Compounding state no longer carries the export choice");
    assert.deepEqual(J(migrated.periodVol), {});
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
    const code = STATE.readViewCode(await readCode(page));
    assert.equal(code.ok, true); assert.equal(code.value.state.comparison.A.fill, "nat");
    assert.equal(await readStored(page, KEY_V9), v9Text, "the v9 blob is untouched");
    // 3. a change is stored under the v10 key; after a reload the v10 view wins over the v9 blob
    await page.click('#d9t [data-act="set"][data-side="A"][data-path="fill"][data-v="mid"]');
    await waitForStoredView(page, { path: ["comparison", "A", "fill"], value: "mid" });
    await collectWrites();
    await page.goto(url);   // without the address code, which would win over the stored blob
    await waitForStoredView(page, { path: ["comparison", "A", "fill"], value: "mid" });
    assert.equal(STATE.readViewCode(await readCode(page)).value.state.comparison.A.fill, "mid");
    assert.equal(await readStored(page, KEY_V9), v9Text, "the v9 blob is still untouched");
    await collectWrites();
    // every write went to the v10 key; nothing was removed or cleared
    assert.ok(writes.length > 0, "the page stored its view");
    assert.deepEqual([...new Set(writes.map(([kind, key]) => `${kind} ${key}`))], [`set ${KEY_V10}`]);
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
});
