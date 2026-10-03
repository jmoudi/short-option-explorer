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
  const ok = !out.pnlExpiry.badge && out.pnlExt.badge && !out.pnlExt.hint && out.pnlExtToday.hint && !out.pnlExtToday.badge &&
    out.day.extDisabled && /vs the trading day before/.test(out.day.title) && out.decayTitleHasPrice && out.decay.payAt && out.pnlExpiry.zones >= 3;
  console.log(JSON.stringify(out, null, 1)); console.log('lenses ok', ok); console.log('errors', errs);
  await b.close();
})();
