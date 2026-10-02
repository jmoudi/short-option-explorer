// drop B, re-add, drop again, toggle strategy with B off: no errors, results show A only, sync list does not grow
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/CERT/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(800);
  await p.click('#tabs [data-tab=yr]'); await p.waitForTimeout(2500);
  const rowsB = () => p.evaluate(() => document.querySelector('#tab-yr').innerText.includes('Shares · lots'));
  console.log('B result row before drop:', await rowsB());
  await p.click('#y-chipB .y-dropb'); await p.waitForTimeout(2500);
  console.log('after drop: B row', await rowsB(), '| bar single', await p.evaluate(() => document.querySelector('#ybar').classList.contains('single')));
  await p.screenshot({ path: "drop_b_single.png", clip: { x: 0, y: 0, width: 1440, height: 620 } });
  for (let i = 0; i < 3; i++) { await p.click('#y-chipB'); await p.waitForTimeout(1500); await p.click('#y-chipB .y-dropb'); await p.waitForTimeout(1500); }
  await p.click('#y-A-fam button[data-v=cc]'); await p.waitForTimeout(2000);
  console.log('after 3 add/drop cycles + strategy change: B row', await rowsB(), '| title', await p.title());
  await p.click('#y-chipB'); await p.waitForTimeout(2500);
  console.log('re-added: B row', await rowsB());
  await p.screenshot({ path: "drop_b_pair.png", clip: { x: 0, y: 0, width: 1440, height: 620 } });
  console.log('errors', errs); await b.close();
})();
