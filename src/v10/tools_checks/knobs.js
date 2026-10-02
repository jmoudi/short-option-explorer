// info knobs: hover shows, click pins (several at once), a second click / × / Escape closes
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(900);
  const knobs = p.locator('.info[data-tip]:not([data-act])');
  const n = await knobs.count(); const pins = () => p.evaluate(() => document.querySelectorAll('.pintip').length);
  await knobs.nth(0).click(); await p.waitForTimeout(150);
  await knobs.nth(1).click(); await p.waitForTimeout(150);
  const two = await pins();
  await p.screenshot({ path: 'knobs_pinned.png', clip: { x: 0, y: 0, width: 1440, height: 400 } });
  await knobs.nth(0).click(); await p.waitForTimeout(150); const one = await pins();
  await p.keyboard.press('Escape'); await p.waitForTimeout(150); const none = await pins();
  console.log({ knobs: n, two, one, none }, 'errors', errs); await b.close();
  if (two !== 2 || one !== 1 || none !== 0) process.exit(1);
})();
