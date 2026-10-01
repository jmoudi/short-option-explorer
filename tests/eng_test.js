// node v8test/eng_test.js [data8]  — comparer engine tests for v8 (guts, ITM margin, time value, no NaN, v7 equality ≤ 50Δ)
const fs = require('fs'), vm = require('vm'), path = require('path');
const SP = path.join(__dirname, '..');
const dataFile = process.argv[2] === 'data8' && fs.existsSync(SP + '/data8.json') ? 'data8.json' : 'data.json';
const D = JSON.parse(fs.readFileSync(path.join(SP, dataFile)));
const rd = f => fs.readFileSync(path.join(SP, f), 'utf8');
function load(files, pre) {
  const ctx = { console, D: JSON.parse(JSON.stringify(D)) }; vm.createContext(ctx);
  const src = 'var D = this.D;' + (pre || '') + files.map(rd).join('\n') +
    '\n;this.E = { build, payoff, val, statsBase, worstIn, chain, st: () => st, setSt: o => { st = o; }, EXPS, TKS, R, sanitize, maxDelta: typeof maxDelta === "function" ? maxDelta : null, bs, dist, legPx: typeof legPx === "function" ? legPx : null };';
  vm.runInContext(src, ctx, { filename: files.join('+') });
  return ctx.E;
}
const E8 = load(['eng_head6.js', 'eng_state8.js', 'eng_pos8.js', 'eng_dist6.js', 'eng_ctx8.js'], 'const BOOT = { cmp: null };');
const E7 = load(['eng_head6.js', 'eng_state7.js', 'eng_pos6.js', 'eng_dist6.js', 'eng_ctx6.js'], 'var location = { hash: "" }, localStorage = { getItem() { return null; } }, history = {};');
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; if (fails < 40) console.log('FAIL', msg); } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const P0 = { tk: 'KORU', exp: E8.EXPS[2], st: 'str', pd: 30, cd: 30, capd: 17, fill: 'mid' };

// ---------------------------------------------------------------- 1. guts: payoff, breakevens, worst loss, margin
let gutsSeen = 0;
for (const tk of E8.TKS) for (const exp of E8.EXPS) for (const fill of ['mid', 'nat']) for (const [pd, cd] of [[60, 60], [70, 70], [80, 80], [90, 90], [70, 55], [55, 85]]) {
  const b = E8.build({ ...P0, tk, exp, fill, pd, cd });
  if (!b.guts) continue; gutsSeen++;
  const Kp = b.sp.K, Kc = b.sc.K, gap = Kp - Kc, tag = `${tk} ${exp} ${fill} ${pd}/${cd} ${Kp}P/${Kc}C`;
  ok(Kp > Kc, tag + ' put above call');
  for (let i = 0; i <= 10; i++) { const x = Kc + gap * i / 10; ok(near(E8.payoff(b, x), b.cr - gap, 1e-12), tag + ' flat payoff between strikes'); }
  const s = E8.statsBase(b);
  if (b.cr >= gap) {
    ok(near(s.beLo, Kp - b.cr) && near(s.beHi, Kc + b.cr), tag + ' breakevens Kp − credit, Kc + credit');
    ok(Math.abs(E8.payoff(b, s.beLo)) < 1e-9 && Math.abs(E8.payoff(b, s.beHi)) < 1e-9, tag + ' payoff 0 at breakevens');
    ok(s.pop >= 0 && s.pop <= 1, tag + ' pop in [0,1]');
  } else ok(s.beLo == null && s.beHi == null && s.pop === 0, tag + ' no breakeven when credit < strike gap');
  // worst loss: brute force over a fine grid
  const lo = b.S * 0.3, hi = b.S * 2.5; let w = Infinity; for (let i = 0; i <= 20000; i++) w = Math.min(w, E8.payoff(b, lo + (hi - lo) * i / 20000));
  ok(near(E8.worstIn(b, lo, hi), w, 1e-6), tag + ` worst loss ${E8.worstIn(b, lo, hi)} vs brute ${w}`);
  // margin by hand: both legs naked, the in-the-money one with an OTM amount of 0
  const L = D.u[tk].lev, f20 = Math.min(1, .2 * L), f10 = Math.min(1, .1 * L), S = b.S, sell = o => fill === 'nat' ? o.bid : o.mid;
  const rP = sell(b.sp) + Math.max(f20 * S - Math.max(0, S - Kp), f10 * Kp), rC = sell(b.sc) + Math.max(f20 * S - Math.max(0, Kc - S), f10 * S);
  ok(near(b.margin, rP >= rC ? rP + sell(b.sc) : rC + sell(b.sp)), tag + ' margin');
  // time value = credit − intrinsic
  const intr = Math.max(0, Kp - S) + Math.max(0, S - Kc);
  ok(near(b.tv, b.cr - intr) && near(b.intr, intr), tag + ' time value');
  // entry mark: the ITM legs are priced from their OTM siblings, so the entry mark is the parity gap, finite
  ok(Number.isFinite(E8.val(b, S, b.T)), tag + ' entry mark finite');
}
ok(gutsSeen >= 8, `guts positions found: ${gutsSeen}`);
// synthetic guts with credit below the strike gap (a mid below intrinsic): no profit anywhere
{
  const b0 = E8.build({ ...P0, pd: 70, cd: 70 }), b = { ...b0, key: b0.key + '#syn', cr: (b0.sp.K - b0.sc.K) * 0.9 };
  const s = E8.statsBase(b); ok(b.guts && s.pop === 0 && s.beLo == null, 'synthetic guts below intrinsic: pop 0, no breakevens');
}

// ---------------------------------------------------------------- 1b. ITM legs priced from the OTM twin on the parity-implied forward
const parGap = [], parGapS = [];
for (const tk of E8.TKS) for (const exp of E8.EXPS) for (const [pd, cd] of [[60, 20], [75, 20], [90, 20], [20, 60], [20, 75], [20, 90]]) {
  const b = E8.build({ ...P0, tk, exp, pd, cd }), itmPut = pd > 50, o = itmPut ? b.sp : b.sc, par = itmPut ? b.parP : b.parC, li = itmPut ? b.iP : b.iC, cp = itmPut ? 'P' : 'C';
  const tag = `${tk} ${exp} ${pd}/${cd} ${o.K}${cp}`;
  if (!par) continue;
  const atEntry = E8.legPx(b, o.K, cp, par, 0, b.S, b.T);
  ok(near(atEntry, li.par, 1e-6), `${tag} entry value = parity value (${atEntry} vs ${li.par})`);
  for (const f of [0.5, 1, 1.6]) { const x = b.S * f, v = E8.legPx(b, o.K, cp, par, 0, x, 1e-7); ok(Math.abs(v - Math.max(0, cp === 'P' ? o.K - x : x - o.K)) < 1e-3, `${tag} tends to intrinsic at expiry, x${f}`); }
  const Fr = b.S * Math.exp(E8.R * b.T), DF = Math.exp(-E8.R * b.T), naive = li.from.mid + (cp === 'P' ? DF * (o.K - Fr) : DF * (Fr - o.K));
  parGap.push(Math.abs(li.par - o.mid)); parGapS.push(Math.abs(naive - o.mid));
}
const avg = a => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);
console.log(`ITM legs: |parity value − mid| on the implied forward ${avg(parGap).toFixed(3)} vs on S·e^{rT} ${avg(parGapS).toFixed(3)} (mean of ${parGap.length})`);

// ---------------------------------------------------------------- 2. ITM naked margin (single ITM leg)
for (const tk of E8.TKS) for (const exp of E8.EXPS) {
  const b = E8.build({ ...P0, tk, exp, pd: 75, cd: 20 }), S = b.S, L = D.u[tk].lev, f20 = Math.min(1, .2 * L), f10 = Math.min(1, .1 * L);
  if (!(b.sp.K > S)) continue;
  const rP = b.sp.mid + Math.max(f20 * S - 0, f10 * b.sp.K), rC = b.sc.mid + Math.max(f20 * S - Math.max(0, b.sc.K - S), f10 * S);
  ok(near(b.margin, rP >= rC ? rP + b.sc.mid : rC + b.sp.mid), `${tk} ${exp} ITM put margin uses OTM amount 0`);
  const c = E8.build({ ...P0, tk, exp, pd: 20, cd: 75, st: 'cap', capd: 10 });
  if (!c.na && c.sc.K < S) { const rCn = c.sc.mid + Math.max(f20 * S - 0, f10 * S), rCc = Math.min(c.cap.K - c.sc.K, rCn), rP2 = c.sp.mid + Math.max(f20 * S - Math.max(0, S - c.sp.K), f10 * c.sp.K);
    ok(near(c.margin, rP2 >= rCc ? rP2 + c.sc.mid - c.capPx : rCc + c.sp.mid), `${tk} ${exp} capped ITM call margin min(width, naked)`); }
}

// ---------------------------------------------------------------- 3. no NaN anywhere for Δ in 3..90
const fin = x => Number.isFinite(x);
let builds = 0;
for (const tk of E8.TKS) for (const exp of E8.EXPS) for (const s of ['str', 'cap']) for (const fill of ['mid', 'nat']) for (let pd = 3; pd <= 90; pd += (s === 'str' && fill === 'mid' ? 1 : 3)) for (let cd = 3; cd <= 90; cd += (s === 'str' && fill === 'mid' ? 1 : 3)) {
  const b = E8.build({ tk, exp, st: s, pd, cd, capd: 17, fill }); builds++;
  const tag = `${tk} ${exp} ${s} ${fill} ${pd}/${cd}`;
  if (b.na) { ok(s === 'cap', tag + ' only capped positions may be n/a'); continue; }
  for (const k of ['cr', 'tv', 'intr', 'margin', 'vega', 'adjSp', 'adjSc', 'adjCap', 'exitCost']) ok(fin(b[k]), `${tag} ${k}=${b[k]}`);
  ok(b.margin > 0, tag + ' margin > 0');
  const st = E8.st();
  for (const dist of ['rn', 'hv']) { st.dist = dist; const x = E8.statsBase(b); for (const k of ['pop', 'ev']) ok(fin(x[k]), `${tag} ${dist} ${k}=${x[k]}`); ok(x.beLo == null || fin(x.beLo), tag + ' beLo'); }
  st.dist = 'rn';
  for (const f of [0.4, 0.8, 1, 1.25, 2.2]) { ok(fin(E8.val(b, b.S * f, b.T * 0.5)), `${tag} val x${f}`); ok(fin(E8.payoff(b, b.S * f)), `${tag} payoff x${f}`); }
  ok(fin(E8.worstIn(b, b.S * 0.3, b.S * 3)), tag + ' worst');
  if (pd <= 50 && cd <= 50) ok(!b.guts, tag + ' no guts with OTM targets');
}
for (const tk of E8.TKS) for (const exp of E8.EXPS) for (const cp of ['P', 'C']) { const m = E8.maxDelta(tk, exp, cp); ok(m.stop >= 50 && m.stop <= 90 && fin(m.d), `maxDelta ${tk} ${exp} ${cp}`); }

// ---------------------------------------------------------------- 4. v7 equality for every position at or below 50Δ
let same = 0;
for (const tk of E8.TKS) for (const exp of E8.EXPS) for (const s of ['str', 'cap']) for (const fill of ['mid', 'nat']) for (let pd = 5; pd <= 50; pd += 2.5) for (let cd = 5; cd <= 50; cd += 2.5) for (const capd of [10, 17, 30]) {
  const P = { tk, exp, st: s, pd, cd, capd, fill }, a = E8.build(P), b = E7.build(P), tag = `${tk} ${exp} ${s} ${fill} ${pd}/${cd}/${capd}`;
  ok(a.na === b.na && a.sp.K === b.sp.K && a.sc.K === b.sc.K && (a.cap && a.cap.K) === (b.cap && b.cap.K), tag + ' same strikes');
  if (a.na) continue;
  for (const k of ['cr', 'margin', 'vega', 'adjSp', 'adjSc', 'adjCap', 'exitCost']) ok(a[k] === b[k], `${tag} ${k} ${a[k]} vs ${b[k]}`);
  for (const f of [0.6, 1, 1.4]) ok(E8.val(a, a.S * f, a.T / 2) === E7.val(b, b.S * f, b.T / 2), tag + ' val');
  const x = E8.statsBase(a), y = E7.statsBase(b); ok(x.pop === y.pop && x.ev === y.ev && x.beLo === y.beLo && x.beHi === y.beHi, tag + ' stats');
  if (a.intr === 0) { ok(a.tv === a.cr, tag + ' OTM: time value = credit'); same++; }
}
console.log(`data ${dataFile}: ${builds} builds, ${gutsSeen} guts cases, ${same} OTM positions identical to v7 incl. time value = credit`);
console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
