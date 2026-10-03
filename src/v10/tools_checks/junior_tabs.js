// the two-level header: each tab shows only its own junior tabs; every junior view renders with no page error;
// the Capture and Credit kept tables carry every preset with a reading; the choice survives a reload
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/CERT/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(900);
  const shown = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
  const out = {};
  out.compareStrip = await shown('#sub-cmp') && !(await shown('#sub-yr'));
  for (const v of ['results', 'capture', 'facts']) {
    await p.click(`#sub-cmp [data-sub=${v}]`); await p.waitForTimeout(v === 'capture' ? 2500 : 900);
    out[v] = { views: await shown('#p-pay'), capture: await shown('#cap-table'), facts: await shown('#facts'), smile: await shown('#p-smile') };
  }
  await p.click('#sub-cmp [data-sub=capture]'); await p.waitForTimeout(2500);
  out.captureRows = await p.evaluate(() => [...document.querySelectorAll('#cap-table tbody tr')].map(tr => tr.dataset.preset + ':' + tr.querySelectorAll('.cv')[0].textContent.trim()));
  out.curve = await p.evaluate(() => document.querySelectorAll('#cap-curve path').length);
  await p.reload(); await p.waitForTimeout(1500);
  out.afterReload = await p.evaluate(() => document.body.dataset.cmpview);
  await p.click('#tabs [data-tab=yr]'); await p.waitForTimeout(2500);
  out.yrStrip = await shown('#sub-yr') && !(await shown('#sub-cmp'));
  for (const v of ['weeks', 'stress', 'kept']) {
    await p.click(`#sub-yr button[data-v=${v}]`); await p.waitForTimeout(2500);
    out['yr_' + v] = { weeks: await shown('#y-strip'), stress: await shown('#y-sstrip'), kept: await shown('#y-ktable') };
  }
  out.keptRows = await p.evaluate(() => [...document.querySelectorAll('#y-ktable tbody tr')].map(tr => (tr.dataset.preset || 'ref') + ':' + (tr.querySelector('.cv') || tr.querySelector('.knav') || {}).textContent));
  out.keptChart = await p.evaluate(() => document.querySelectorAll('#y-kchart path').length);
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', errs); await b.close();
})();
