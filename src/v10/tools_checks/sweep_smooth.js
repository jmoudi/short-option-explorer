const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const errs = []; p.on('pageerror', e => errs.push(e.stack)); p.on('console', m => m.type() === 'error' && !/CERT/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(800);
  const box = async name => { const el = await p.$('#p-sweep'); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await el.screenshot({ path: '' + name }); };
  await box('sweep_raw.png');
  await p.$eval('#c-swsmooth', i => { i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(500);
  await box('sweep_smooth.png');
  const r = await (await p.$('#sweep svg')).boundingBox(); await p.mouse.move(r.x + r.width * 0.45, r.y + r.height * 0.5); await p.waitForTimeout(300);
  console.log('tip:', await p.evaluate(() => document.querySelector('#tip').innerText.replace(/\n/g, ' | ')));
  console.log('errors', errs); await b.close();
})();
