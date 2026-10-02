// every chart with an axis band: hovering it shows a tip and the guide line, with no page error
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(900);
  const sweepBands = async (label, scope) => {
    const bands = p.locator(`${scope} .axhit`), n = await bands.count(); let ok = 0, bad = [];
    for (let i = 0; i < n; i++) {
      const band = bands.nth(i); await band.scrollIntoViewIfNeeded(); const r = await band.boundingBox(); if (!r) { bad.push(i); continue; }
      await p.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5); await p.waitForTimeout(120);
      const tip = await p.evaluate(() => { const t = document.querySelector('#tip'); return t && !t.hidden ? t.innerText : ''; });
      const guide = await p.evaluate(() => [...document.querySelectorAll('.axguide')].some(g => g.getAttribute('visibility') === 'visible'));
      if (tip && guide) ok++; else bad.push(i);
      if (i === 0 || i === n - 1) console.log(label, i, tip.replace(/\n/g, ' | ').slice(0, 220));
    }
    console.log(label, `${ok}/${n} axis bands answer`, bad.length ? 'silent: ' + bad : '');
    return bad.length;
  };
  let silent = await sweepBands('compare', '#tab-cmp');
  await p.click('#tabs [data-tab=yr]'); await p.waitForTimeout(3000);
  silent += await sweepBands('compounding', '#tab-yr');
  console.log('errors', errs); await b.close();
  if (silent || errs.length) process.exit(1);
})();
