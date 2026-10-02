const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 2200 }, colorScheme: process.env.TH || 'dark' });
  const errs = []; p.on('pageerror', e => errs.push(e.stack)); p.on('console', m => m.type() === 'error' && !/CERT/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(800);
  const W = ms => p.waitForTimeout(ms || 250);
  await p.screenshot({ path: 'dock_0_default.png', clip: { x: 1440 - 380, y: 0, width: 380, height: 1500 } });
  await p.selectOption('#d9A select[data-act=inst]', 'KORU'); await W();
  await p.selectOption('#d9A select[data-act=exp]', '20261016'); await W();
  await p.click('#d9A [data-path=structure][data-v=straddle]'); await W();
  await p.click('#d9A [data-act=fills]'); await W();
  const put = '#d9A input[data-act=fillpx][data-slot=put]', call = '#d9A input[data-act=fillpx][data-slot=call]';
  await p.fill(put, '1.40'); await p.press(put, 'Enter'); await p.locator(put).blur(); await W();
  await p.fill(call, '1.50'); await p.press(call, 'Enter'); await p.locator(call).blur(); await W(500);
  await p.screenshot({ path: 'dock_1_typed.png', clip: { x: 1440 - 380, y: 0, width: 380, height: 1500 } });
  await p.screenshot({ path: 'page_1_typed.png', clip: { x: 0, y: 0, width: 1440, height: 700 } });
  // B: edit a linked row (structure) -> B set on its own
  await p.click('#d9B [data-path=structure][data-v=strangle]'); await W(600);
  await p.screenshot({ path: 'dock_2_b_own.png', clip: { x: 1440 - 380, y: 0, width: 380, height: 1700 } });
  console.log('toast:', await p.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.innerText : ''; }));
  console.log('errors', errs); await b.close();
})();
