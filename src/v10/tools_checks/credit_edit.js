// the credit you got: typed in each box head (or from a card's net credit); "back to mid" forgets it; B can take A's
// share of mid and keeps following it; typing on B unlinks it
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../../dist/ram_koru_lab_v10.html'))); await p.waitForTimeout(900);
  const read = () => p.evaluate(() => { const C = CTX.ctx9(page.store.read()); return { A: +C.A.cr.toFixed(3), Amid: +C.A.crMid.toFixed(3), B: +C.B.cr.toFixed(3), Bmid: +C.B.crMid.toFixed(3), match: C.prefs.fillMatch }; });
  const out = { start: await read() };
  await p.click('#s9A [data-credit]'); await p.waitForTimeout(300);
  out.focusFromCard = await p.evaluate(() => document.activeElement.classList.contains('pcin') && document.activeElement.dataset.side === 'A');
  const amid = out.start.Amid, typed = +(amid * 0.8).toFixed(2);
  await p.keyboard.type(String(typed)); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  out.afterTyping = await read();
  out.matchOffered = await p.evaluate(() => (document.querySelector('#d9B .pmatch') || {}).innerText || '');
  await p.click('#d9B [data-act=fillmatch]'); await p.waitForTimeout(1200);
  out.afterMatch = await read();
  out.ratios = { A: +(out.afterMatch.A / out.afterMatch.Amid).toFixed(3), B: +(out.afterMatch.B / out.afterMatch.Bmid).toFixed(3) };
  // A changes: B follows
  await p.fill('#d9A .pcin', String(+(amid * 0.6).toFixed(2))); await p.press('#d9A .pcin', 'Enter'); await p.waitForTimeout(1200);
  const s2 = await read(); out.follows = +(s2.B / s2.Bmid).toFixed(3) + ' vs ' + +(s2.A / s2.Amid).toFixed(3);
  // typing on B unlinks
  await p.fill('#d9B .pcin', String(+(s2.Bmid * 0.95).toFixed(2))); await p.press('#d9B .pcin', 'Enter'); await p.waitForTimeout(1000);
  out.unlinked = (await read()).match;
  await p.click('#d9A [data-act=fillreset]'); await p.waitForTimeout(800);
  out.resetA = await read();
  await p.screenshot({ path: require('path').join(__dirname, 'credit_edit.png'), clip: { x: 1070, y: 180, width: 370, height: 700 } });
  console.log(JSON.stringify(out, null, 1)); console.log('errors', errs); await b.close();
})();
