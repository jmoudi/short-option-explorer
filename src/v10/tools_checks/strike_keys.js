// arrow keys on a placement slider step one listed strike at a time
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(900);
  const legs = () => p.evaluate(() => document.querySelector('#d9A .plegs').innerText.split('\n').filter(l => /^\d/.test(l)).map(l => l.split(/\s/)[0]).join(' '));
  const slider = p.locator('#d9A input[type=range][data-sl]').first();
  const seen = [await legs()];
  await slider.focus();
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']) { await p.keyboard.press(key); await p.waitForTimeout(250); seen.push(await legs()); }
  console.log(seen.join('  →  '));
  const changed = seen.slice(1).every((v, i) => v !== seen[i]);
  console.log('every key moved the strikes:', changed, 'errors', errs); await b.close();
  if (!changed || errs.length) process.exit(1);
})();
