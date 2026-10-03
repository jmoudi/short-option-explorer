// the payoff's lenses: P&L, Day change, Time decay; the extrapolation toggle and its hints; market-move zones
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.env.PAGE); await p.waitForTimeout(900);
  const set = patch => p.evaluate(x => page.executor.execute({ type: 'prefs.set', patch: x }), patch).then(() => p.waitForTimeout(350));
  const read = () => p.evaluate(() => ({
    title: document.querySelector('#pay-h').textContent,
    badge: !!document.querySelector('#pay-lgd .ybadge'), hint: !document.querySelector('#pay-xhint').hidden,
    extDisabled: document.querySelector('#c-extra').disabled, zones: document.querySelectorAll('#pay .mzones rect').length,
    read: document.querySelector('#pay-read').innerText.slice(0, 90), payAt: !document.querySelector('#c-payatw').hidden
  }));
  const out = {};
  await set({ payLens: 'pnl', payExtra: false, payLeft: 0 }); out.pnlExpiry = await read();
  await set({ payExtra: true, payLeft: 5 }); out.pnlExt = await read();
  await set({ payLeft: 999 }); out.pnlExtToday = await read();
  await set({ payLens: 'day', payLeft: 5 }); out.day = await read();
  await set({ payLens: 'decay' }); out.decay = await read();
  // decay bars add up to the time value: the sum of the per-stop decay equals today's price to close minus expiry's
  out.decayTitleHasPrice = /Time decay at/.test(out.decay.title);
  await p.click('#pay svg rect[style*=pointer]', { position: { x: 30, y: 100 } }); await p.waitForTimeout(350);
  out.clickPicksStop = await p.evaluate(() => page.store.read().prefs.payLeft);
  for (const lens of ['move', 'zone', 'ev']) {
    await set({ payLens: lens, payLeft: 5 });
    out[lens] = await p.evaluate(() => ({ svg: !!document.querySelector('#pay svg'), lines: document.querySelectorAll('#pay-read .dr').length, title: document.querySelector('#pay-h').textContent }));
  }
  await set({ payLens: 'ev', payLeft: 999 }); out.evToday = await p.evaluate(() => !!document.querySelector('#pay .lensempty'));
  await set({ payLens: 'pnl', payLeft: 14, payIv: 10, payExtra: false }); out.ivBand = await p.evaluate(() => /IV ±10/.test(document.querySelector('#pay-lgd').textContent));
  await p.focus('#pay'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); out.keyStep = await p.evaluate(() => page.store.read().prefs.payLeft);
  const md = await p.evaluate(() => { page.executor.execute({ type: 'prefs.set', patch: { payLens: 'zone', payLeft: 5 } }); return new Promise(r => setTimeout(() => r(VIEWS.exportLens()), 400)); });
  out.exportLens = !!(md && md.lines.length);
  const more = ['move', 'zone', 'ev'].every(l => out[l].svg && out[l].lines >= 1) && out.evToday && out.ivBand && out.keyStep < 14 && out.exportLens;
  const ok = more && !out.pnlExpiry.badge && out.pnlExt.badge && !out.pnlExt.hint && out.pnlExtToday.hint && !out.pnlExtToday.badge &&
    out.day.extDisabled && /vs the trading day before/.test(out.day.title) && out.decayTitleHasPrice && out.decay.payAt && out.pnlExpiry.zones >= 3;
  console.log(JSON.stringify(out, null, 1)); console.log('lenses ok', ok); console.log('errors', errs);
  await b.close();
})();
