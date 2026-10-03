// hover every Compounding chart: each must show a cursor line and a tip with values
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const errs = []; p.on('pageerror', e => errs.push(e.stack)); p.on('console', m => m.type() === 'error' && !/CERT/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(800);
  await p.click('#tabs [data-tab=yr]'); await p.waitForTimeout(3000);
  const hover = async (sel, frac, shot) => {
    const svg = await p.$(sel); if (!svg) { console.log(sel, 'MISSING'); return; }
    await svg.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    const r = await svg.boundingBox(); await p.mouse.move(r.x + r.width * frac, r.y + r.height * 0.45); await p.waitForTimeout(250);
    const tip = await p.evaluate(() => { const t = document.querySelector('#tip'); return t && !t.hidden ? t.innerText.replace(/\n/g, ' | ') : '(no tip)'; });
    const cross = await p.evaluate(s => !![...document.querySelector(s).querySelectorAll('.ycross')].find(c => c.getAttribute('visibility') === 'visible'), sel);
    console.log(sel.padEnd(22), 'cross', cross, '|', tip.slice(0, 160));
    if (shot) await p.screenshot({ path: '' + shot });
  };
  await hover('#y-credit svg', 0.5, 'cmp_credit.png'); await hover('#y-margin svg', 0.7);
  await p.click('#y-sweep h3'); await p.waitForTimeout(2500); await hover('#y-sweep svg', 0.5, 'cmp_sweep.png');
  await p.click('#sub-yr button[data-v=stress]'); await p.waitForTimeout(3500);
  await hover('#y-sbw svg', 0.4); await hover('#y-sroom svg', 0.4); await hover('#y-scurve svg', 0.3, 'cmp_scurve.png');
  await p.evaluate(() => { document.querySelector('#y-mc').open = true; document.querySelector('#y-mcrun').click(); });
  for (let i = 0; i < 90; i++) { await p.waitForTimeout(1000); const t = await p.evaluate(() => (document.querySelector('#y-mcp') || {}).textContent || ''); if (/paths per run/.test(t)) break; }
  await hover('#y-mcb svg', 0.6, 'cmp_mc.png');
  console.log('errors', errs); await b.close();
})();
