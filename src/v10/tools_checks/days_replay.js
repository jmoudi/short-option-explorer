// Days to expiry: starts at 0 (Expiry) at the right; steps left are trading days in calendar days (a weekend jumps
// −4 Mon → −7 Fri); Mondays are marked; Replay loops and the stop it pauses on is kept; LaTeX renders as MathML
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(900);
  await p.selectOption('#d9A select[data-act=inst]', 'KORU'); await p.waitForTimeout(300);
  await p.selectOption('#d9A select[data-act=exp]', '20261016'); await p.waitForTimeout(500);
  const read = () => p.evaluate(() => document.querySelector('#c-paylefto').innerText.split(' ')[0]);
  const out = { start: await read() };
  await p.locator('#c-payleft').focus();
  const seq = []; for (let i = 0; i < 5; i++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200); seq.push(await read()); }
  out.steps = seq.join(' ');
  out.weekendJump = seq[3] === '−4' && seq[4] === '−7';
  out.mondays = await p.evaluate(() => document.querySelectorAll('#tl-marks .tl-mon').length);
  await p.click('#tl-play'); await p.waitForTimeout(3200); await p.click('#tl-play'); await p.waitForTimeout(400);
  out.afterReplay = await read(); out.kept = await p.evaluate(() => page.store.read().prefs.payLeft);
  await p.click('#tabs [data-tab=yr]'); await p.waitForTimeout(2500);
  out.mathInWeekCard = await p.evaluate(() => document.querySelectorAll('#y-growth math').length);
  console.log(JSON.stringify(out)); console.log('errors', errs); await b.close();
})();
