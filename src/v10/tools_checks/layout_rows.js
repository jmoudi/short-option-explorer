// Layout rule check: a row exists by design, never because content overflowed. For each width, on every view of
// both tabs, across payoff lenses and replay stops, and in the states that lengthen text (B on another expiry or
// ticker, wings, a detached B, the dock closed, Extrapolate on; Path = Growth, Stress with two tickers, one run):
//  (1) one-row containers keep every child on one line;
//  (2) no container's height changes between the states of one sequence (lenses, replay stops);
//  (3) nothing overflows its box sideways, and nothing clips without an ellipsis or a line clamp;
//  (4) panel heads: a plain head is one row (≤ 34px), a .ph2/.phc head two (≤ 64px); lead, caption and tools never
//      overlap; a caption with text keeps at least 60px;
//  (5) nothing visible sticks out past the right edge of its panel or bar (menus, tips and scroll boxes aside);
//  (6) every cut text shows its full text on hover (a title on it or an ancestor after a mouseover);
//  (7) the payoff head's caption does not move sideways across replay stops.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ONE_ROW = ['.ph > .phl', '.ph > .pht > .tools:not(.tools2)', '.lensbar .lb-tools', '.tline', '.tl-replay', '.phead .pt > .pname', 'details.panel > summary', '#y-growth h3', '.crow', '.ccrow > .ctl', '.phlg > .lg1', '.phlg > .lg2', '.swlgd > .lg1', '.swlgd > .lg2'];
const STABLE = ['.ph', '.lensbar', '.tline', 'details.panel > summary', '.phead', '.crow', '#y-strip .sr', '#y-sstrip .sr', '.phlg', '.swlgd', '.ybar'];
const STABLE_X = ['#p-pay > .ph > .phm'];
(async () => {
  const widths = (process.env.WIDTHS || '1200,1440,1920').split(',').map(Number);
  const b = await chromium.launch(), problems = [];
  for (const width of widths) {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + process.env.PAGE); await p.waitForTimeout(1200);
    const exec = x => p.evaluate(x => page.executor.execute(x), x).then(() => p.waitForTimeout(300));
    const set = x => exec({ type: 'prefs.set', patch: x });
    const measure = (tag) => p.evaluate(({ ONE_ROW, STABLE, STABLE_X, tag }) => {
      const out = { rows: [], heights: {}, xs: {}, overflow: [] };
      const visible = el => el.offsetParent !== null && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const name = el => (el.closest('[id]') ? '#' + el.closest('[id]').id + ' ' : '') + el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
      const R = el => el.getBoundingClientRect();
      // (1) one-row containers
      for (const sel of ONE_ROW) for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const kids = [...el.children].filter(k => visible(k) && getComputedStyle(k).position !== 'absolute');
        if (kids.length < 2) continue;
        const tops = kids.map(R), mid = r => r.top + r.height / 2, first = mid(tops[0]);
        if (tops.some(r => Math.abs(mid(r) - first) > Math.max(8, tops[0].height * 0.6))) out.rows.push(`${tag}: ${sel} → ${name(el)} has children on more than one line`);
      }
      // (2) heights and (7) x positions, compared across the states of a sequence by the caller
      STABLE.forEach(sel => [...document.querySelectorAll(sel)].forEach((el, i) => { if (visible(el)) out.heights[`${sel}#${i}:${name(el)}`] = Math.round(R(el).height); }));
      STABLE_X.forEach(sel => { const el = document.querySelector(sel); if (el && visible(el)) out.xs[sel] = Math.round(R(el).left); });
      // (3) sideways overflow and clipping
      for (const el of document.querySelectorAll('.ph, .lensbar, .tline, .crow, .phead, details > summary, .ccrow, .phlg, .swlgd')) {
        if (!visible(el)) continue;
        if (el.scrollWidth > el.clientWidth + 1) out.overflow.push(`${tag}: ${name(el)} overflows by ${el.scrollWidth - el.clientWidth}px`);
      }
      for (const el of document.querySelectorAll('.ph *, .lensbar *, .tline *, .ybar *, .phead *, summary *, .ccrow *, .s9card *, .phlg *, .swlgd *, .ystrip *')) {
        if (!visible(el) || el.closest('svg')) continue;
        const cs = getComputedStyle(el), tagName = el.tagName;
        const hidesX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && tagName !== 'INPUT' && tagName !== 'SELECT';
        const hidesY = cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none' && tagName !== 'INPUT' && tagName !== 'SELECT';
        if (hidesX) out.overflow.push(`${tag}: ${name(el)} clips ${el.scrollWidth - el.clientWidth}px sideways`);
        if (hidesY) out.overflow.push(`${tag}: ${name(el)} hides ${el.scrollHeight - el.clientHeight}px below (a wrapped line?)`);
      }
      // (4) panel heads
      for (const head of document.querySelectorAll('.ph')) {
        if (!visible(head)) continue;
        const rows = 1 + (head.classList.contains('ph2') ? 1 : 0) + (head.classList.contains('phc') ? 1 : 0) + (head.querySelector('.tools2') ? 1 : 0), two = rows > 1, h = R(head).height;
        if (h > 34 * rows) out.overflow.push(`${tag}: ${name(head)} head is ${Math.round(h)}px tall (${rows} row(s) by design)`);
        const slots = ['phl', 'phm', 'pht'].map(c => head.querySelector(`:scope > .${c}`)).filter(s => s && visible(s) && R(s).width > 0);
        for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
          const a = R(slots[i]), c = R(slots[j]);
          const overlapX = Math.min(a.right, c.right) - Math.max(a.left, c.left), overlapY = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (overlapX > 1 && overlapY > 1) out.overflow.push(`${tag}: ${name(head)} .${slots[i].className} and .${slots[j].className} overlap by ${Math.round(overlapX)}px`);
        }
        const mid = head.querySelector(':scope > .phm');
        if (mid && visible(mid) && mid.textContent.trim() && R(mid).width < 60) out.overflow.push(`${tag}: ${name(head)} caption squeezed to ${Math.round(R(mid).width)}px`);
      }
      // (5) nothing past the right edge of its panel or bar
      const skip = el => el.closest('.mb, .tip, .pop, [role=tooltip], svg, select, option') || [...(function* () { for (let a = el.parentElement; a; a = a.parentElement) yield a; })()].some(a => /auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX) && a.scrollWidth > a.clientWidth); // scroll boxes and clipping lines
      for (const box of document.querySelectorAll('section.panel, details.panel, .cbar')) {
        if (!visible(box)) continue;
        const right = R(box).right;
        for (const el of box.querySelectorAll('*')) {
          if (!visible(el) || getComputedStyle(el).position === 'fixed') continue;
          const r = R(el); if (r.width === 0 || r.right <= right + 1) continue;
          if (skip(el)) continue;
          out.overflow.push(`${tag}: ${name(el)} sticks out ${Math.round(r.right - right)}px past ${name(box)}`); break;
        }
      }
      // (6) cut text shows its full text on hover
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || el.closest('svg') || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'OPTION') continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none') continue;
        const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2;
        if (!cut || !el.textContent.trim()) continue;
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const titled = el.closest('[title]');
        if (!titled || !titled.getAttribute('title').trim()) out.overflow.push(`${tag}: ${name(el)} is cut with no full text on hover`);
      }
      return out;
    }, { ONE_ROW, STABLE, STABLE_X, tag });
    const runStates = async (label, states) => {
      const seen = {}, seenX = {};
      for (const [i, st] of states.entries()) {
        if (st) await st();
        const m = await measure(`${width}px ${label} state ${i}`);
        problems.push(...m.rows, ...m.overflow);
        for (const [k, h] of Object.entries(m.heights)) { if (k in seen && Math.abs(seen[k] - h) > 1) problems.push(`${width}px ${label}: ${k} height ${seen[k]} → ${h} (state ${i})`); seen[k] = h; }
        for (const [k, x] of Object.entries(m.xs)) { if (k in seenX && Math.abs(seenX[k] - x) > 1) problems.push(`${width}px ${label}: ${k} moves sideways ${seenX[k]} → ${x} (state ${i})`); seenX[k] = x; }
      }
    };
    // Compare: every lens, and every replay stop on the P&L lens
    const lensStates = ['pnl', 'day', 'decay', 'move', 'zone', 'ev'].map(l => () => set({ payLens: l, payLeft: 9 }));
    const replay = []; for (let left = 50; left >= 0; left -= 1) replay.push(() => set({ payLens: 'pnl', payLeft: left }));
    await runStates('lenses', lensStates);
    await runStates('replay', replay);
    await set({ payLeft: 0, payLens: 'pnl' });
    for (const v of ['capture', 'facts', 'results']) { await set({ cmpView: v }); await runStates(`view ${v}`, [null]); }
    // the states that lengthen text or change the panels' widths, each on the main views
    const views = async label => { for (const v of ['results', 'facts', 'capture']) { await set({ cmpView: v }); await runStates(`${label}, view ${v}`, [null]); } };
    await set({ payExtra: true, payLens: 'day', payLeft: 9 }); await runStates('Extrapolate on, day change', [null]);
    await set({ payExtra: true, payLens: 'decay', payLeft: 9 }); await runStates('Extrapolate on, time decay', [null]);
    await set({ payExtra: false, payLens: 'pnl', payLeft: 0 });
    await set({ dock: false }); await views('dock closed'); await set({ dock: true });
    await exec({ type: 'cmp.setA', path: 'wings.put.on', value: true }); await exec({ type: 'cmp.setA', path: 'wings.call.on', value: true }); await views('wings on');
    await exec({ type: 'cmp.setB', path: 'exp', value: await p.evaluate(() => { const S = page.store.read(); const C = CTX.ctx9(S); const list = INST.make(S.comparison.B.inst).expiries; return list[list.length - 1]; }) }); await views('B on another expiry');
    await exec({ type: 'cmp.detach', side: 'B' }); await views('B detached');
    await exec({ type: 'cmp.setB', path: 'inst.id', value: await p.evaluate(() => { const S = page.store.read(); return INST.list().map(x => x.id).find(id => id !== S.comparison.B.inst.id); }) }); await views('B on another ticker');
    // Compounding
    await p.click('#tabs [data-tab=yr]'); await p.waitForTimeout(5000);
    for (const v of ['weeks', 'stress', 'kept']) { await p.click(`#sub-yr button[data-v=${v}]`); await p.waitForTimeout(3500); await runStates(`compounding ${v}`, [null]); }
    // B differing in vol (the widest vol row), Path = Growth, B on another ticker in Stress, then one run only
    await p.click('#sub-yr button[data-v=weeks]'); await p.waitForTimeout(1500);
    await p.evaluate(() => { const s = COMPOUND.getState(); s.bDiff = RunDiff.Vol; COMPOUND.setState(s); COMPOUND.render(); }); await p.waitForTimeout(3500);
    await runStates('compounding B differs in vol', [null]);
    await p.selectOption('#y-pmode', 'growth'); await p.waitForTimeout(3000);
    await runStates('compounding Path = Growth', [null]);
    await p.evaluate(() => { const s = COMPOUND.getState(); s.bDiff = RunDiff.Ticker; COMPOUND.setState(s); COMPOUND.render(); }); await p.waitForTimeout(3000);
    await p.click('#sub-yr button[data-v=stress]'); await p.waitForTimeout(4000);
    await runStates('compounding stress, B on another ticker', [null]);
    await p.click('#y-dropb'); await p.waitForTimeout(3500);
    for (const v of ['stress', 'kept', 'weeks']) { await p.click(`#sub-yr button[data-v=${v}]`); await p.waitForTimeout(3500); await runStates(`compounding one run, ${v}`, [null]); }
    problems.push(...errs.map(e => `${width}px page error: ${e}`));
    await p.close();
  }
  const unique = [...new Set(problems.map(x => x.replace(/ state \d+/, '').replace(/\(state \d+\)/, '')))];
  console.log(unique.slice(0, 120).join('\n')); console.log(`layout problems: ${unique.length}`); console.log('errors', []);
  await b.close();
})();
