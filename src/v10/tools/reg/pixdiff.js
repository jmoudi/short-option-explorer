#!/usr/bin/env node
// pixdiff: drives two built pages of the RAM/KORU lab through the same DOM-only scenarios and proves they behave
// byte-identically: full-page screenshots, normalized body HTML, page state (localStorage, hash, #vcode, title,
// toast, focus, scroll, form values, clipboard writes) and console errors/warnings, per scenario x combo.
// It never calls the page's own globals (the refactor renames them); it only clicks, types, presses keys, moves
// and drags the mouse, reloads, resizes and edits the address. See README.md.
//
//   node pixdiff.js [--a FILE] [--b FILE] [--only REGEX] [--combos LIST] [--fast] [--list] [--jobs N] [--out DIR] [--verbose]
//                   [--map-b FILE] [--mask SELECTORS]...
// A scenario with bOnly: true runs page B alone (a feature A does not have): its checkpoints are written as PNGs to
// OUT/bonly/, and only its console, run failures and the expectations it states (d.expect) are reported.
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PNG = require('./png.js');
const SCEN = require('./scenarios.js');

const HERE = __dirname;
let OUT = path.join(HERE, 'out');
const DEF_A = path.join(HERE, 'ref_v9.html');
const DEF_B = '/home/user/short-option-explorer/dist/ram_koru_lab_v10.html';
const COMBOS = { '1200-light': { W: 1200, theme: 'light' }, '1200-dark': { W: 1200, theme: 'dark' }, '1440-light': { W: 1440, theme: 'light' }, '1440-dark': { W: 1440, theme: 'dark' } };
const VIEW_H = 900;
// software raster on one thread: with GPU / threaded raster, anti-aliased edges of composited layers (the sticky
// summary, the fixed dock) came out 1 LSB apart between runs under load
const CHROME_FLAGS = ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--disable-gpu', '--disable-gpu-compositing',
  '--disable-gpu-rasterization', '--num-raster-threads=1', '--disable-partial-raster', '--disable-skia-runtime-opts', '--disable-threaded-animation',
  '--disable-threaded-scrolling', '--disable-checker-imaging'];
const FIXED_NOW = Date.UTC(2026, 9, 2, 15, 0, 0);   // the fake clock: 2 Oct 2026 15:00 UTC

// ------------------------------------------------------------------ CLI
function parseArgs(argv) {
  const o = { a: DEF_A, b: DEF_B, only: null, combos: Object.keys(COMBOS), list: false, jobs: 6, out: null, verbose: false, mapB: null, mapBFile: null, masks: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { if (i + 1 >= argv.length) die(`${k} needs a value`); return argv[++i]; };
    if (k === '--a') o.a = path.resolve(v());
    else if (k === '--b') o.b = path.resolve(v());
    else if (k === '--only') o.only = new RegExp(v());
    else if (k === '--combos') o.combos = v().split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--fast') o.combos = ['1200-light'];
    else if (k === '--list') o.list = true;
    else if (k === '--jobs') o.jobs = Math.max(1, +v() || 1);
    else if (k === '--out') o.out = path.resolve(v());
    else if (k === '--map-b') { o.mapBFile = path.resolve(v()); o.mapB = loadMap(o.mapBFile); }
    else if (k === '--mask') o.masks.push(v());   // a CSS selector list; repeatable
    else if (k === '--verbose' || k === '-v') o.verbose = true;
    else if (k === '--help' || k === '-h') { console.log('node pixdiff.js [--a FILE] [--b FILE] [--only REGEX] [--combos 1200-light,1200-dark,1440-light,1440-dark] [--fast] [--list] [--jobs N] [--out DIR] [--map-b FILE] [--mask SELECTORS]... [--verbose]'); process.exit(0); }
    else die(`unknown argument ${k}`);
  }
  for (const c of o.combos) if (!COMBOS[c]) die(`unknown combo ${c} (known: ${Object.keys(COMBOS).join(', ')})`);
  return o;
}
function die(m) { console.error('pixdiff: ' + m); process.exit(2); }
// --map-b FILE: a node module exporting one function (B's captured state channel) -> the same in A's format. Used when
// B writes its view codes and stored blob in another format on purpose (v10 vs v9): the codes are compared by content
function loadMap(file) {
  if (!fs.existsSync(file)) die(`--map-b: no file ${file}`);
  const fn = require(file);
  if (typeof fn !== 'function') die(`--map-b: ${file} must export a function (state) -> state, got ${typeof fn}`);
  return fn;
}
// with --map-b the #vcode field shows codes of different formats on the two pages: its text is made transparent on
// both (the state channel compares its mapped value), so the pixels compare everything around it
let MASK_CODE_FIELD = false;
// --mask SELECTORS (repeatable): elements an intended change touches. They are blanked (visibility: hidden, so the
// layout stays) in every screenshot on both pages and removed from the DOM comparison and the form values, so a
// verifier can isolate an intended change and prove that nothing else moved. "" = no mask
let MASK = '';

// ------------------------------------------------------------------ browser context setup
const FONTS = path.resolve(HERE, '../ui/fonts');
const PLEX = fs.readFileSync(path.join(FONTS, 'plex.css'), 'utf8').replace(/url\(([^)]+\.woff2)\)/g, 'url(https://fonts.gstatic.com/$1)');
// every face of plex.css with its file's bytes: the init script installs them as FontFace objects built from the
// bytes, which Chromium loads synchronously, so the page's very first layout already has its fonts. (Loaded through
// the routes alone they arrive after the first layout; a <select> laid out with the fallback font kept its text
// 1 px low after the swap, at random, on the Compounding tab opened from the address.)
const FACES = PLEX.split('@font-face').slice(1).map(b => {
  const g = re => { const m = b.match(re); return m ? m[1].trim() : null; };
  return { family: g(/font-family:\s*'([^']+)'/), style: g(/font-style:\s*([^;]+);/), weight: g(/font-weight:\s*([^;]+);/), unicodeRange: g(/unicode-range:\s*([^;]+);/), b64: fs.readFileSync(path.join(FONTS, path.basename(g(/url\(([^)]+)\)/)))).toString('base64') };
});
async function fontRoutes(ctx) {   // the routing of lib_v9.js: Google Fonts served from scratch/ui/fonts
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: PLEX, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://fonts.gstatic.com/**', r => { const f = path.join(FONTS, path.basename(new URL(r.request().url()).pathname)); if (fs.existsSync(f)) r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } }); else r.abort(); });
}
// runs in the page before any of its scripts: a fixed clock, a mutation/scroll activity stamp for the idle wait, and a
// recorder of clipboard writes (browser APIs only; nothing of the app is touched)
function initScript({ now, faces, maskCodeField, mask }) {
  for (const f of faces) {
    try {
      const bin = atob(f.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      document.fonts.add(new FontFace(f.family, u.buffer, { style: f.style, weight: f.weight, unicodeRange: f.unicodeRange, display: 'swap' }));
    } catch (e) { }
  }
  const OD = Date;
  class FD extends OD { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return now; } }
  window.Date = FD;
  const st = window.__pixdiff = { last: performance.now(), clip: [] };
  // no blinking caret in screenshots (in <head>, outside the compared body HTML)
  // --mask: the masked elements are hidden only while a screenshot is taken (class on <html>, outside the compared body)
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '*{caret-color:transparent!important}' + (maskCodeField ? '#vcode{color:transparent!important}' : '') + (mask ? `html.__pixdiff_mask :is(${mask}){visibility:hidden!important}` : ''); document.head.appendChild(s); });
  const bump = () => { st.last = performance.now(); };
  // every toast is logged and held the moment it shows (a pointerenter on #toast: the page's own handler clears the
  // hide timer, as when the pointer rests on it), so whether it is still up later never depends on timing
  st.toastLog = [];
  new MutationObserver(recs => {
    bump();
    const t = document.getElementById('toast'); if (!t) return;
    if (!recs.some(r => r.target === t || t.contains(r.target))) return;
    if (t.hidden) return;
    st.toastLog.push(t.textContent);
    t.dispatchEvent(new PointerEvent('pointerenter'));
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener('scroll', bump, true);
  // pending short timers (<= 1 s: render debounces, saves, chunked jobs) keep the page busy for the idle wait; the
  // toast's 2-4 s hide timers do not. Same semantics as the native functions.
  const pend = new Set(), oST = window.setTimeout, oCT = window.clearTimeout;
  window.setTimeout = function (fn, ms, ...args) {
    let id = 0;
    id = oST.call(window, function () { pend.delete(id); return typeof fn === 'function' ? fn.apply(this, args) : (0, eval)(String(fn)); }, ms);
    if (!(+ms > 1000)) pend.add(id);
    return id;
  };
  window.clearTimeout = function (id) { pend.delete(id); return oCT.call(window, id); };
  st.pending = () => pend.size;
  try {
    const cb = navigator.clipboard;
    // the write is recorded and resolves at once (a microtask, so the page's "Copied" toast shows within the same
    // task); the real system-clipboard write still runs, its outcome is not passed on (parallel pages share it)
    if (cb) { const w = cb.writeText.bind(cb); cb.writeText = t => { st.clip.push(String(t)); w(t).catch(() => undefined); return Promise.resolve(); }; }
  } catch (e) { }
}

class Driver {
  constructor(page, side, combo, file, scen) { this.page = page; this.side = side; this.combo = combo; this.file = file; this.scen = scen; this.snaps = []; this.W = combo.W; this.H = VIEW_H; this.hoverMode = false; this.logs = []; this.quiet = scen.quiet || 150; this.minWait = scen.minWait || 50; this.T = { shot: 0, nshot: 0, idle: 0, state: 0 }; this.toastShots = []; this.expectFails = []; }
  // a stated expectation (B-only scenarios): fn runs in the page with arg and must return true; anything else (false,
  // a text) is reported with the description
  async expect(desc, fn, arg) {
    let r;
    try { r = await this.page.evaluate(fn, arg); } catch (e) { r = 'threw: ' + String(e && e.message || e); }
    if (r !== true) this.expectFails.push(`${desc}: ${r === false ? 'false' : r}`);
  }
  url(hash) { return 'file://' + this.file + (hash ? '#' + hash.replace(/^#/, '') : ''); }
  async goto(hash) {
    await this.page.goto(this.url(hash)); await this.ready();
  }
  // after a load: every @font-face of the page is loaded up front (faces load lazily on first use, which let a
  // control first shown later be laid out before its face arrived), then the idle wait
  async ready(opt) {
    await this.page.evaluate(() => Promise.all([...document.fonts].map(f => f.load().catch(() => null))).then(() => document.fonts.ready).then(() => 0));
    await this.idle(Object.assign({ min: 250 }, opt || {}));
    await this.releaseToast(opt || {});
  }
  // wait until the page is idle: fonts ready, two frames, then no DOM mutation or scroll for `quiet` ms (and at least `min` ms in all)
  async idle(opt) {
    opt = opt || {};
    const quiet = opt.quiet || this.quiet, min = opt.min != null ? opt.min : this.minWait, max = opt.max || 15000;
    const r = await this.page.evaluate(async ([quiet, min, max]) => {
      const t0 = performance.now(), st = window.__pixdiff;
      await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (;;) {
        const now = performance.now();
        // the Compounding tab computes its sweep and its Random years in timer chunks with no DOM change until done
        const busy = [...document.querySelectorAll('#tab-yr:not([hidden]) .cap, #tab-yr:not([hidden]) #y-mcp')].some(e => /computing…|running…/.test(e.textContent));
        if (busy || st.pending() > 0) st.last = now;
        if (now - t0 >= min && now - st.last >= quiet) return { ok: true, ms: now - t0 };
        if (now - t0 > max) return { ok: false, ms: now - t0 };
        await new Promise(r => setTimeout(r, 20));
      }
    }, [quiet, min, max]);
    if (!r.ok) this.logs.push(`idle timeout after ${Math.round(r.ms)} ms`);
    this.T.idle += r.ms;
    return r;
  }
  loc(sel, nth) { const l = this.page.locator(sel); return nth == null ? l.first() : nth < 0 ? l.last() : l.nth(nth); }
  // bring an element to the middle of the viewport when it is near an edge (under the sticky summary or the toast)
  async center(l) {
    await l.waitFor({ state: 'attached', timeout: 10000 });
    await l.evaluate(e => { const r = e.getBoundingClientRect(); if (r.top < 150 || r.bottom > innerHeight - 100) e.scrollIntoView({ block: 'center', inline: 'nearest' }); });
    return l;
  }
  async L(sel, nth) { return this.center(this.loc(sel, nth)); }
  // After every action the pointer leaves, the page settles, then a toast that is up is screenshotted (viewport) and
  // dismissed: pointer onto it and away, the page hides it 2 s later. The toast cannot vanish on its own meanwhile:
  // the init script holds every toast the moment it shows (see initScript), however long the step takes to settle.
  // The screenshots and the texts of all toasts shown go to the next checkpoint. opt.keepToast leaves the toast up
  // (the next step clicks its button).
  async after(opt = {}) {
    this.hoverMode = false;
    // the pointer leaves at once (opt.stay keeps it): a click that closes a menu or re-renders leaves new content
    // under a resting pointer, and Chromium's delayed synthetic mouse move then hovers it (a Compounding chart
    // drew its crosshair) or not, depending on when the harness next moved the pointer
    if (!opt.stay) await this.page.mouse.move(0, 0);
    await this.idle(opt);
    await this.releaseToast(opt);
  }
  async releaseToast(opt = {}) {
    const p = this.page;
    const t = await p.evaluate(() => { const e = document.querySelector('#toast'); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (!t) return;
    this.toastShots.push(await this.shot());
    await p.mouse.move(t.x, t.y);
    if (opt.keepToast) return;
    await p.mouse.move(0, 0);
    await p.waitForFunction(() => { const t = document.querySelector('#toast'); return !t || t.hidden; }, null, { timeout: 8000, polling: 50 }).catch(() => this.logs.push('toast still up'));
    await this.idle({ min: 60 });
  }

  // ---- actions (DOM only)
  // opt.dispatch: a DOM click event on the element instead of the mouse (for a control the layout puts off-screen)
  async click(sel, opt = {}) {
    const l = await this.L(sel, opt.nth);
    if (opt.dispatch) await l.dispatchEvent('click'); else await l.click({ position: opt.position, timeout: 10000, force: !!opt.force });
    await this.after(opt);
  }
  async clickText(sel, text, opt = {}) { await (await this.center(this.page.locator(sel, { hasText: text }).first())).click({ timeout: 10000 }); await this.after(opt); }
  async dblclick(sel, opt = {}) { await (await this.L(sel, opt.nth)).dblclick({ position: opt.position, timeout: 10000 }); await this.after(opt); }
  async select(sel, value, opt = {}) { await (await this.L(sel, opt.nth)).selectOption(typeof value === "object" ? value : String(value), { timeout: 10000 }); await this.after(opt); }
  async check(sel, on, opt = {}) { const l = await this.L(sel, opt.nth); if ((await l.isChecked()) !== on) await l.click({ timeout: 10000 }); await this.after(opt); }
  // type a value: click into the field, select its text, type, then commit with Enter (default), a change event or Tab
  async fill(sel, value, opt = {}) {
    const l = await this.L(sel, opt.nth);
    await l.click({ timeout: 10000 });
    await l.press('ControlOrMeta+a');
    if (String(value).length > 40) await l.fill(String(value));   // a pasted view code: one input event
    else await l.pressSequentially(String(value));
    // default commit: Enter, which fires one native change and leaves nothing for a later blur to commit again (a
    // synthetic change event would be followed by a native one when focus leaves, re-rendering in the middle of
    // the next click)
    const how = opt.commit || 'enter';
    if (how === 'change') await l.dispatchEvent('change');
    else if (how === 'enter') await l.press('Enter');
    else if (how === 'tab') await l.press('Tab');
    await this.after(opt);
  }
  async press(key, opt = {}) { await this.page.keyboard.press(key); await this.after(opt); }
  async focus(sel, opt = {}) { await this.loc(sel, opt.nth).focus(); await this.after(opt); }
  async open(detailsSel, opt = {}) {   // open a <details> by clicking its summary (no-op when open)
    const l = await this.L(detailsSel, opt.nth);
    if (!(await l.evaluate(d => d.open))) await l.locator(':scope > summary').click({ timeout: 10000 });
    await this.after(opt);
  }
  async close(detailsSel, opt = {}) {
    const l = this.loc(detailsSel, opt.nth);
    if (await l.evaluate(d => d.open)) await l.locator(':scope > summary').click({ timeout: 10000 });
    await this.after(opt);
  }
  async box(sel, nth) { const l = await this.L(sel, nth); const b = await l.boundingBox(); if (!b) throw new Error(`no box for ${sel}`); return b; }
  // a real hover: the mouse at a fixed fraction of the element's box; the next snap keeps the mouse there
  async hover(sel, fx = 0.5, fy = 0.5, opt = {}) {
    const b = await this.box(sel, opt.nth), x = b.x + b.width * fx, y = b.y + b.height * fy;
    await this.page.mouse.move(x - 7, y - 3); await this.page.mouse.move(x, y, { steps: 3 });
    await this.idle(opt); this.hoverMode = true;
  }
  async mouseClickAt(sel, fx, fy, opt = {}) {
    const b = await this.box(sel, opt.nth), x = b.x + b.width * fx, y = b.y + b.height * fy;
    await this.page.mouse.move(x, y); await this.page.mouse.click(x, y); await this.after(opt);
  }
  // a real drag on a range input: press on the thumb (its position from min/max/value), move in steps to the target
  // fraction of the track, optionally snap while the button is held, release
  async drag(sel, to, opt = {}) {
    const l = await this.L(sel, opt.nth);
    const b = await l.boundingBox(); if (!b) throw new Error(`no box for ${sel}`);
    const f0 = await l.evaluate(i => { const lo = +i.min || 0, hi = i.max === '' ? 100 : +i.max, v = +i.value; return hi > lo ? (v - lo) / (hi - lo) : 0; });
    const th = 16, X = f => b.x + th / 2 + f * (b.width - th), y = b.y + b.height / 2;
    await this.page.mouse.move(X(f0), y); await this.page.mouse.down();
    const mid = opt.midFrac != null ? opt.midFrac : (f0 + to) / 2;
    await this.page.mouse.move(X(mid), y, { steps: 6 });
    await this.idle(opt);
    if (opt.midSnap) { this.hoverMode = true; await this.snap(opt.midSnap, { hover: true }); }
    await this.page.mouse.move(X(to), y, { steps: 6 });
    await this.page.mouse.up();
    await this.after(opt);
  }
  async wheel(dy, opt = {}) { await this.page.mouse.move(this.W / 3, this.H / 2); await this.page.mouse.wheel(0, dy); await this.after(opt); }
  async scrollTo(where, opt = {}) {
    await this.page.evaluate(w => { const h = document.documentElement.scrollHeight - innerHeight; scrollTo(0, w === 'bottom' ? h : w === 'middle' ? Math.round(h / 2) : w === 'top' ? 0 : +w); }, where);
    await this.after(opt);
  }
  async reload(opt = {}) { await this.page.reload(); await this.ready(opt); }
  async resize(W, H, opt = {}) { this.W = W; this.H = H || VIEW_H; await this.page.setViewportSize({ width: W, height: this.H }); await this.after(Object.assign({ min: 400 }, opt)); }
  async setHash(code, opt = {}) { await this.page.evaluate(h => { location.hash = h; }, code); await this.after(Object.assign({ min: 300 }, opt)); }
  async wait(ms) { await this.page.waitForTimeout(ms); }
  async waitText(sel, re, opt = {}) {   // wait until an element's text matches (e.g. a run finished), then idle
    await this.page.waitForFunction(([s, src]) => { const e = document.querySelector(s); return !!e && new RegExp(src).test(e.textContent); }, [sel, re.source], { timeout: opt.timeout || 60000, polling: 100 });
    await this.after(opt);
  }
  async exists(sel) { return (await this.page.locator(sel).count()) > 0; }
  async visible(sel) { return this.page.locator(sel).first().isVisible(); }
  async value(sel) { return this.page.locator(sel).first().inputValue(); }
  async text(sel) { return (await this.page.locator(sel).first().textContent()) || ''; }
  async download(sel) {   // click a download control; the file itself is discarded
    const [dl] = await Promise.all([this.page.waitForEvent('download', { timeout: 10000 }), (await this.L(sel)).click()]);
    await dl.delete().catch(() => { });
    await this.after();
  }
  // seeded random DOM actions: pick among the visible, enabled elements of a family (document order), act with the mouse
  async randomPick(sel) {
    return this.page.evaluate(s => {
      const vis = e => { if (e.disabled) return false; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let p = e; p; p = p.parentElement) { if (p.hidden) return false; const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false; if (p.tagName === 'DETAILS' && !p.open && p !== e && !e.closest('summary')) { if (!(p.firstElementChild && p.firstElementChild.tagName === 'SUMMARY' && p.firstElementChild.contains(e))) return false; } } return true; };
      const path = e => { const out = []; for (let p = e; p && p !== document.body; p = p.parentElement) { if (p.id) { out.unshift('#' + CSS.escape(p.id)); return out.join(' > '); } const i = [...p.parentElement.children].indexOf(p) + 1; out.unshift(`${p.tagName.toLowerCase()}:nth-child(${i})`); } return 'body > ' + out.join(' > '); };
      return [...document.querySelectorAll(s)].filter(vis).map(path);
    }, sel);
  }
  // ---- screenshots. Chromium's fullPage capture rasters off-screen canvases nondeterministically (the same page
  // gives 2-3 different images), so the full page is taken as viewport tiles: scroll by (viewport - 200 px) so the
  // sticky header and the toast never hide a strip of content, one viewport screenshot per stop, scroll restored.
  // With the mouse in use (hover / mid-drag) the page is not scrolled: one viewport screenshot.
  // a viewport screenshot through CDP (PNG at fast zlib settings: about 30% quicker than page.screenshot; the
  // caret is hidden by the init script's style and transitions are off under reducedMotion)
  async shot() {
    const t = Date.now();
    if (!this.cdp) this.cdp = await this.page.context().newCDPSession(this.page);
    if (MASK) await this.page.evaluate(() => new Promise(r => { document.documentElement.classList.add('__pixdiff_mask'); requestAnimationFrame(() => requestAnimationFrame(r)); }));
    const r = Buffer.from((await this.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
    if (MASK) await this.page.evaluate(() => { document.documentElement.classList.remove('__pixdiff_mask'); });
    this.T.shot += Date.now() - t; this.T.nshot++; return r;
  }
  async frames() { await this.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
  async tiles() {
    const p = this.page, [x0, y0, H, vh] = await p.evaluate(() => [scrollX, scrollY, document.documentElement.scrollHeight, innerHeight]);
    const out = [], step = Math.max(200, vh - 200);
    for (let y = 0; ; y += step) {
      const yy = Math.max(0, Math.min(y, H - vh));
      await p.evaluate(v => scrollTo(0, v), yy); await this.frames();
      out.push(await this.shot());
      if (yy >= H - vh) break;
    }
    await p.evaluate(([x, y]) => scrollTo(x, y), [x0, y0]); await this.frames();
    return out;
  }
  // ---- checkpoint
  // A toast hides itself 3.8-4 s after it shows, so its presence at an arbitrary later moment depends on timing.
  // Each checkpoint therefore (1) captures the state right after the action settles, toast text included, (2) takes a
  // viewport screenshot at once when a toast shows, (3) waits for the toast to hide before the full-page tiles (so every
  // checkpoint starts the next steps toast-free and a toast seen later is always a fresh one). keepToast: the scenario
  // acts on the toast next, so only the viewport screenshot is taken and the toast is left up.
  async snap(label, opt = {}) {
    const p = this.page, hover = !!(opt.hover || this.hoverMode);
    if (!hover) { await p.mouse.move(0, 0); await this.idle({ min: 60 }); }
    const t0 = Date.now(); const st = await p.evaluate(captureState, MASK); this.T.state += Date.now() - t0;
    const png = this.toastShots; this.toastShots = [];
    if (st.state.toast != null) {   // a toast up at the checkpoint itself (kept by the last step, or shown by a timer)
      png.push(await this.shot());
      if (!opt.keepToast) {
        // pointer over the toast and away: the page then hides it 2 s later (instead of up to 4 s)
        const tb = await p.locator('#toast').boundingBox().catch(() => null);
        if (tb && tb.width) { await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.mouse.move(0, 0); }
        await p.waitForFunction(() => { const t = document.querySelector('#toast'); return !t || t.hidden; }, null, { timeout: 8000, polling: 50 }).catch(() => this.logs.push(`toast still up at ${label}`));
        await this.idle({ min: 60 });
      }
    }
    if (!opt.keepToast) { if (hover) png.push(await this.shot()); else png.push(...await this.tiles()); }
    this.snaps.push({ label, png, hover, dom: st.dom, state: st.state });
    this.hoverMode = false;
  }
}

// runs in the page: normalized body HTML and the state channel
function captureState(mask) {
  const body = document.body.cloneNode(true);
  body.querySelectorAll('script').forEach(s => s.remove());
  if (mask) body.querySelectorAll(mask).forEach(e => e.remove());
  const dom = body.innerHTML.replace(/\s+$/, '');
  const desc = e => {
    if (!e || e === document.body) return e ? 'body' : null;
    if (e.id) return '#' + e.id;
    const out = []; for (let p = e; p && p !== document.body; p = p.parentElement) {
      if (p.id) { out.unshift('#' + p.id); break; }
      const ds = Object.entries(p.dataset || {}).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"]`).join('');
      out.unshift(p.tagName.toLowerCase() + ds + `:nth-child(${[...p.parentElement.children].indexOf(p) + 1})`);
    }
    return out.join(' > ');
  };
  const ls = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); } } catch (e) { ls.__error = String(e); }
  const t = document.querySelector('#toast'), toast = t && !t.hidden ? t.innerText : null;
  const vc = document.querySelector('#vcode');
  const form = {};
  // a masked input is left out before the fields are numbered, so the other fields keep their keys
  [...document.querySelectorAll('input, select, textarea')].filter(e => !(mask && e.closest(mask))).forEach((e, i) => {
    const k = desc(e) + (e.id ? '' : '@' + i);
    form[k] = e.type === 'checkbox' || e.type === 'radio' ? (e.checked ? 'checked' : 'unchecked') : e.value;
  });
  const tip = document.querySelector('#tip'), pop = document.querySelector('#pop');
  return {
    dom, state: {
      title: document.title, hash: location.hash, vcode: vc ? vc.value : null, toast,
      active: desc(document.activeElement), scroll: [scrollX, scrollY], viewport: [innerWidth, innerHeight],
      docSize: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      tip: tip && !tip.hidden ? tip.innerText : null, pop: pop && !pop.hidden ? pop.innerText : null,
      clipboard: (window.__pixdiff && window.__pixdiff.clip.slice()) || [],
      toastsSinceLastCheckpoint: window.__pixdiff ? window.__pixdiff.toastLog.splice(0) : [],
      localStorage: ls, form
    }
  };
}

// ------------------------------------------------------------------ one job: a scenario on one combo, A and B side by side
async function runSide(browser, file, side, combo, scen, ctxData) {
  const errors = [];
  const ctx = await browser.newContext({
    viewport: { width: combo.W, height: VIEW_H }, colorScheme: combo.theme, reducedMotion: 'reduce', deviceScaleFactor: 1,
    locale: 'en-US', timezoneId: 'UTC', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write']
  });
  await fontRoutes(ctx);
  await ctx.addInitScript(initScript, { now: FIXED_NOW, faces: FACES, maskCodeField: MASK_CODE_FIELD, mask: MASK });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  const d = new Driver(page, side, combo, file, scen);
  d.data = ctxData;
  let fail = null;
  try {
    if (!scen.noGoto) await d.goto(scen.hash ? (typeof scen.hash === 'function' ? scen.hash(ctxData) : scen.hash) : '');
    await scen.run(d, ctxData);
  } catch (e) { fail = String(e && e.stack || e).split('\n').slice(0, 4).join('\n'); }
  await ctx.close().catch(() => { });
  if (process.env.PIXDIFF_PROFILE) d.logs.push('profile ' + JSON.stringify(d.T));
  return { snaps: d.snaps, errors, fail, logs: d.logs, expectFails: d.expectFails };
}

// stack viewport tiles into one image (decoded RGBA)
function stitch(tiles) {
  const imgs = tiles.map(t => PNG.decode(t)), W = Math.max(...imgs.map(i => i.width)), H = imgs.reduce((t, i) => t + i.height, 0), data = Buffer.alloc(W * H * 4);
  let y0 = 0; for (const im of imgs) { for (let y = 0; y < im.height; y++) im.data.copy(data, ((y0 + y) * W) * 4, y * im.width * 4, (y + 1) * im.width * 4); y0 += im.height; }
  return { width: W, height: H, data };
}
function firstDiff(a, b) { const n = Math.min(a.length, b.length); let i = 0; while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++; return i === n && a.length === b.length ? -1 : i; }
function ctxAround(s, i, w = 160) { return (i > w ? '…' : '') + s.slice(Math.max(0, i - w), i) + '⟦' + s.slice(i, i + w) + '⟧' + (i + w < s.length ? '…' : ''); }
function stateDiffs(a, b, pfx = '') {
  const out = [], keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) out.push(...stateDiffs(x, y, pfx + k + '.'));
    else if (JSON.stringify(x) !== JSON.stringify(y)) {
      const sx = JSON.stringify(x) || 'undefined', sy = JSON.stringify(y) || 'undefined';
      if (sx.length > 300 || sy.length > 300) { const i = firstDiff(sx, sy); out.push({ key: pfx + k, a: ctxAround(sx, i, 100), b: ctxAround(sy, i, 100) }); }
      else out.push({ key: pfx + k, a: x, b: y });
    }
  }
  return out;
}
const safeName = s => s.replace(/[^A-Za-z0-9._-]+/g, '_');

// a B-only scenario: page B alone; its checkpoints go to OUT/bonly as PNGs (tiles stacked), and its console, run
// failures and failed expectations are the differences
async function runBOnlyJob(browser, opt, scen, comboName, ctxData) {
  const combo = COMBOS[comboName], t0 = Date.now();
  const rb = await runSide(browser, opt.b, 'B', combo, scen, ctxData);
  const res = { scenario: scen.id, combo: comboName, bOnly: true, ms: 0, snaps: rb.snaps.length, px: 0, pxSnaps: 0, dom: 0, state: 0, console: 0, failures: [], diffs: [] };
  if (rb.fail) res.failures.push({ channel: 'run', side: 'B', error: rb.fail });
  for (const e of rb.errors) { res.console++; res.diffs.push({ channel: 'console', side: 'B', message: e }); }
  for (const e of rb.expectFails) res.diffs.push({ channel: 'expect', side: 'B', message: e });
  for (const l of rb.logs) if (opt.verbose) console.log(`  [${scen.id} ${comboName} B] ${l}`);
  const dir = path.join(OUT, 'bonly'); fs.mkdirSync(dir, { recursive: true });
  rb.snaps.forEach((sn, i) => {
    if (!sn.png.length) return;
    try { fs.writeFileSync(path.join(dir, safeName(`${scen.id}__${comboName}__${String(i).padStart(2, '0')}_${sn.label}`) + '.png'), PNG.encode(stitch(sn.png))); }
    catch (e) { res.diffs.push({ channel: 'run', message: `could not write the ${sn.label} PNG: ${e}` }); }
  });
  res.ms = Date.now() - t0;
  return res;
}

async function runJob(browser, opt, scen, comboName, ctxData) {
  if (scen.bOnly) return runBOnlyJob(browser, opt, scen, comboName, ctxData);
  const combo = COMBOS[comboName], t0 = Date.now();
  const [ra, rb] = await Promise.all([runSide(browser, opt.a, 'A', combo, scen, ctxData), runSide(browser, opt.b, 'B', combo, scen, ctxData)]);
  const res = { scenario: scen.id, combo: comboName, ms: 0, snaps: Math.max(ra.snaps.length, rb.snaps.length), px: 0, pxSnaps: 0, dom: 0, state: 0, console: 0, failures: [], diffs: [] };
  for (const [s, r] of [['A', ra], ['B', rb]]) {
    if (r.fail) res.failures.push({ channel: 'run', side: s, error: r.fail });
    for (const e of r.errors) { res.console++; res.diffs.push({ channel: 'console', side: s, message: e }); }
    for (const l of r.logs) if (opt.verbose) console.log(`  [${scen.id} ${comboName} ${s}] ${l}`);
  }
  if (ra.snaps.length !== rb.snaps.length) res.diffs.push({ channel: 'run', message: `checkpoint count differs: A ${ra.snaps.length}, B ${rb.snaps.length}` });
  const n = Math.min(ra.snaps.length, rb.snaps.length);
  for (let i = 0; i < n; i++) {
    const a = ra.snaps[i], b = rb.snaps[i], label = a.label;
    // pixels
    if (a.png.length !== b.png.length || a.png.some((t, j) => !t.equals(b.png[j]))) {
      let count = -1, bbox = null, dims = null, err = null;
      try {
        const da = stitch(a.png), db = stitch(b.png), df = PNG.diff(da, db);
        count = df.count; bbox = df.bbox; dims = [[da.width, da.height], [db.width, db.height]];
        if (df.png) {
          fs.mkdirSync(OUT, { recursive: true });
          const base = path.join(OUT, safeName(`${scen.id}__${comboName}__${String(i).padStart(2, '0')}_${label}`));
          fs.writeFileSync(base + '__a.png', PNG.encode(da)); fs.writeFileSync(base + '__b.png', PNG.encode(db)); fs.writeFileSync(base + '__diff.png', df.png);
        }
      } catch (e) { err = String(e); }
      if (count !== 0) { res.px += Math.max(count, 1); res.pxSnaps++; res.diffs.push({ channel: 'pixels', checkpoint: label, pixels: count, bbox, sizes: dims, error: err, files: count > 0 ? safeName(`${scen.id}__${comboName}__${String(i).padStart(2, '0')}_${label}`) + '__{a,b,diff}.png' : null }); }
    }
    // DOM
    if (a.dom !== b.dom) {
      const k = firstDiff(a.dom, b.dom); res.dom++;
      res.diffs.push({ channel: 'dom', checkpoint: label, offset: k, lengths: [a.dom.length, b.dom.length], a: ctxAround(a.dom, k), b: ctxAround(b.dom, k) });
    }
    // state (B's mapped into A's format with --map-b; a map that throws is a difference)
    let bState = b.state;
    if (opt.mapB) {
      try { bState = opt.mapB(b.state); } catch (e) { bState = Object.assign({}, b.state, { mapError: String(e && e.message || e) }); }
    }
    const sd = stateDiffs(a.state, bState);
    if (sd.length) { res.state += sd.length; res.diffs.push({ channel: 'state', checkpoint: label, keys: sd }); }
  }
  res.ms = Date.now() - t0;
  return res;
}

// ------------------------------------------------------------------ main
async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const all = SCEN.list();
  const scens = all.filter(s => !opt.only || opt.only.test(s.id));
  if (opt.list) { for (const s of all) console.log(`${s.id.padEnd(30)} ${s.family.padEnd(10)} ${s.bOnly ? '[B only] ' : ''}${s.desc}`); console.log(`${all.length} scenarios; combos: ${Object.keys(COMBOS).join(', ')}`); return; }
  if (!scens.length) die('no scenario matches --only');
  for (const f of [opt.a, opt.b]) if (!fs.existsSync(f)) die(`missing page ${f}`);
  if (opt.out) OUT = opt.out;
  MASK_CODE_FIELD = !!opt.mapB;
  MASK = opt.masks.join(', ');
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/\.(png|json)$/.test(f)) fs.rmSync(path.join(OUT, f));   // only our own outputs
  const bonlyDir = path.join(OUT, 'bonly');
  if (fs.existsSync(bonlyDir)) for (const f of fs.readdirSync(bonlyDir)) if (/\.png$/.test(f)) fs.rmSync(path.join(bonlyDir, f));
  const T0 = Date.now();
  console.log(`pixdiff  A = ${opt.a}\n         B = ${opt.b}${opt.mapB ? `\n         B's state mapped by ${opt.mapBFile} (#vcode text masked on both pages)` : ''}${MASK ? `\n         masked (blank pixels, out of the DOM and form comparison): ${MASK}` : ''}\n         ${scens.length} scenarios x ${opt.combos.length} combos (${opt.combos.join(', ')}), ${opt.jobs} parallel jobs`);
  // one Chromium per worker: a single browser funnels every page's compositing through one display process
  const launch = () => chromium.launch({ args: process.env.PIXDIFF_FLAGS != null ? process.env.PIXDIFF_FLAGS.split(' ').filter(Boolean) : CHROME_FLAGS });
  const browser = await launch();
  // shared inputs taken from a run of page A (the same values feed both pages)
  const ctxData = await SCEN.prepare({ browser, file: opt.a, runSide, COMBOS });
  const jobs = []; for (const s of scens) for (const c of opt.combos) jobs.push([s, c]);
  const results = []; let next = 0, done = 0;
  await browser.close();
  const worker = async () => {
    const browser = process.env.PIXDIFF_ONEBROWSER ? shared : await launch();
    while (next < jobs.length) {
      const [s, c] = jobs[next++];
      let r;
      try { r = await runJob(browser, opt, s, c, ctxData); }
      catch (e) { r = { scenario: s.id, combo: c, ms: 0, snaps: 0, px: 0, pxSnaps: 0, dom: 0, state: 0, console: 0, failures: [{ channel: 'run', error: String(e && e.stack || e) }], diffs: [] }; }
      results.push(r); done++;
      const bad = r.px || r.dom || r.state || r.console || r.failures.length || r.diffs.length;
      process.stdout.write(`  [${String(done).padStart(3)}/${jobs.length}] ${bad ? 'DIFF' : 'ok  '} ${r.scenario} ${r.combo} (${(r.ms / 1000).toFixed(1)} s)\n`);
    }
    if (browser !== shared) await browser.close();
  };
  const shared = process.env.PIXDIFF_ONEBROWSER ? await launch() : null;
  await Promise.all(Array.from({ length: Math.min(opt.jobs, jobs.length) }, worker));
  if (shared) await shared.close();
  const order = new Map(jobs.map(([s, c], i) => [s.id + '|' + c, i]));
  results.sort((x, y) => order.get(x.scenario + '|' + x.combo) - order.get(y.scenario + '|' + y.combo));
  const secs = (Date.now() - T0) / 1000;
  // summary table
  const bad = r => r.px || r.dom || r.state || r.console || r.failures.length || r.diffs.length;
  const rows = [['scenario', 'combo', 'snaps', 'pixels', 'dom', 'state', 'console', 'run', 'result']];
  for (const r of results) rows.push([r.scenario + (r.bOnly ? ' [B only]' : ''), r.combo, r.snaps, r.bOnly ? '-' : r.px ? `${r.px} (${r.pxSnaps})` : 0, r.bOnly ? '-' : r.dom, r.bOnly ? `${r.diffs.filter(d => d.channel === 'expect').length} expect` : r.state, r.console, r.failures.length ? 'FAIL' : '', bad(r) ? 'DIFF' : 'ok']);
  const w = rows[0].map((_, j) => Math.max(...rows.map(r => String(r[j]).length)));
  console.log('\n' + rows.map((r, i) => r.map((c, j) => String(c).padEnd(w[j])).join('  ') + (i === 0 ? '\n' + w.map(x => '-'.repeat(x)).join('  ') : '')).join('\n'));
  const nBad = results.filter(bad).length, nSnaps = results.reduce((t, r) => t + r.snaps, 0);
  const report = { a: opt.a, b: opt.b, mapB: opt.mapBFile, masks: opt.masks, combos: opt.combos, scenarios: scens.length, jobs: results.length, checkpoints: nSnaps, seconds: +secs.toFixed(1), differing: nBad, results: results.map(r => ({ scenario: r.scenario, combo: r.combo, bOnly: !!r.bOnly, ms: r.ms, snaps: r.snaps, pixels: r.px, dom: r.dom, state: r.state, console: r.console, failures: r.failures, diffs: r.diffs })) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`\n${results.length} runs, ${nSnaps} checkpoints compared, ${nBad} with differences, ${secs.toFixed(0)} s. Report: ${path.join(OUT, 'report.json')}`);
  for (const r of results.filter(bad).slice(0, 12)) {
    console.log(`\n# ${r.scenario} ${r.combo}`);
    for (const f of r.failures) console.log(`  run failure (${f.side || ''}): ${f.error}`);
    for (const d of r.diffs.slice(0, 6)) console.log('  ' + JSON.stringify(d).slice(0, 600));
  }
  process.exitCode = nBad ? 1 : 0;
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });
module.exports = { Driver, COMBOS, captureState, runSide };
