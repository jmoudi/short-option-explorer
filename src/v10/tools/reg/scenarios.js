// pixdiff scenarios: each one runs the same DOM-only steps on page A and page B; every d.snap(label) is a
// checkpoint compared on all channels. Selectors come from shell.html, yr_shell.html and the ui_* / yr_ui / app
// sources (data-act / data-side / data-path / data-v / data-aspect attributes and ids).
'use strict';

// ------------------------------------------------------------------ selector helpers
const dock = (side, path, v) => `#d9t [data-act="set"][data-side="${side}"][data-path="${path}"][data-v="${v}"]`;
const link = a => `#d9t [data-act="link"][data-aspect="${a}"]`;
const segB = (id, v) => `${id} button[data-v="${v}"]`;
const ASPECTS = ['inst', 'exp', 'structure', 'legs', 'placement', 'wingCall', 'wingPut', 'fill'];
const YR = { quiet: 300, minWait: 450 };   // the Compounding tab renders through 140 ms timers and saves after 400 ms

const S = [];
const add = (id, family, desc, run, extra) => S.push(Object.assign({ id, family, desc, run }, extra || {}));
async function yrTab(d) { await d.click('#tb-yr', { min: 600, quiet: 400 }); }
async function menu(d) { await d.open('#pmenu'); }

// ================================================================== load and scroll
add('load-default', 'load', 'default load, top of the page', async d => { await d.snap('top'); });
add('scroll-middle-bottom', 'load', 'scrolled to the middle, to the bottom, back up by wheel', async d => {
  await d.scrollTo('middle'); await d.snap('middle');
  await d.scrollTo('bottom'); await d.snap('bottom');
  await d.wheel(-700); await d.snap('wheel-up');
});

// ================================================================== dock
add('dock-structure', 'dock', 'structure seg for A and for B (B unlinked)', async d => {
  await d.click(dock('A', 'structure', 'straddle')); await d.snap('A-straddle');
  await d.click(link('structure')); await d.snap('unlinked');
  await d.click(dock('B', 'structure', 'straddle')); await d.snap('B-straddle');
  await d.click(dock('A', 'structure', 'strangle')); await d.snap('A-strangle');
});
add('dock-basis', 'dock', 'strikes-by basis for A, then B on its own', async d => {
  await d.click(dock('A', 'basis', 'money')); await d.snap('A-money');
  await d.click(dock('A', 'basis', 'sigma')); await d.snap('A-sigma');
  await d.click(link('placement')); await d.snap('unlinked');
  await d.click(dock('B', 'basis', 'money')); await d.snap('B-money');
  await d.click(dock('B', 'basis', 'delta')); await d.snap('B-delta');
});
add('dock-legs', 'dock', 'legs seg together/detached for A and B, symmetric popover', async d => {
  await d.click(dock('A', 'legs', 'detached')); await d.snap('A-detached');
  await d.click('#d9t [data-act="legsinfo"]'); await d.snap('legsinfo-pop');
  await d.press('Escape'); await d.snap('escaped');
  await d.click(link('legs')); await d.snap('legs-unlinked');
  await d.click(dock('B', 'legs', 'detached')); await d.snap('B-detached');
  await d.click(dock('A', 'legs', 'together')); await d.snap('A-together');
});
add('dock-fill', 'dock', 'fill seg for A and B', async d => {
  await d.click(dock('A', 'fill', 'nat')); await d.snap('A-nat');
  await d.click(link('fill')); await d.click(dock('B', 'fill', 'mid')); await d.snap('B-mid');
  await d.click(dock('A', 'fill', 'mid')); await d.snap('A-mid');
});
add('dock-unlink-each', 'dock', 'unlink each aspect in turn (toast each time), then link each back', async d => {
  for (const a of ASPECTS.slice(1)) { await d.click(link(a)); await d.snap('unlink-' + a); }
  for (const a of ASPECTS) { await d.click(link(a)); await d.snap('link-' + a); }
});
add('dock-detach-relink', 'dock', 'straddle, detach legs, then relink all from the pills', async d => {
  await d.click(dock('A', 'structure', 'straddle')); await d.snap('straddle');
  await d.click('#d9t [data-act="detach"][data-side="A"]'); await d.snap('detached');
  await d.click(link('fill')); await d.click(link('exp')); await d.snap('two-unlinked');
  await d.click('#s9pills [data-all]'); await d.snap('relinked-all');
});
add('dock-wings', 'dock', 'protective wings on/off for A and B, value by number of slider keys', async d => {
  await d.click(dock('A', 'wings.call.on', 'true')); await d.snap('A-call-on');
  await d.click(dock('A', 'wings.put.on', 'true')); await d.snap('A-put-on');
  await d.focus('#d9t input[data-sl="wsl:A:call"]'); await d.press('ArrowRight'); await d.press('ArrowRight'); await d.snap('A-call-keys');
  await d.click(link('wingPut')); await d.snap('B-put-own');
  await d.click(dock('B', 'wings.put.on', 'false')); await d.snap('B-put-off');
  await d.click(dock('A', 'wings.call.on', 'false')); await d.snap('A-call-off');
});
add('dock-slider-drag', 'dock', 'real mouse drag of the put & call slider (mid-drag and released)', async d => {
  await d.drag('#d9t input[data-sl="sl:A:both"]', 0.15, { midSnap: 'mid-drag' }); await d.snap('released');
  await d.drag('#d9t input[data-sl="sl:A:both"]', 0.9); await d.snap('released-2');
});
add('dock-wing-drag', 'dock', 'real mouse drag of a wing slider and of B own put slider', async d => {
  await d.click(dock('A', 'wings.put.on', 'true'));
  await d.drag('#d9t input[data-sl="wsl:A:put"]', 0.8, { midSnap: 'wing-mid' }); await d.snap('wing-released');
  await d.click(link('placement')); await d.click(link('legs')); await d.click(dock('B', 'legs', 'detached'));
  await d.drag('#d9t input[data-sl="sl:B:put"]', 0.3, { midSnap: 'Bput-mid' }); await d.snap('Bput-released');
});
add('dock-straddle-center', 'dock', 'straddle center slider drag and back to ATM', async d => {
  await d.click(dock('A', 'structure', 'straddle'));
  await d.drag('#d9t input[data-sl="sl:A:center"]', 0.7); await d.snap('moved');
  await d.click('#d9t [data-act="atm"][data-side="A"]'); await d.snap('atm');
});
add('dock-inst-override', 'dock', 'instrument override popover: spot and IV shift inputs, reset', async d => {
  await d.click('#d9t [data-act="instx"][data-side="A"]'); await d.snap('open');
  await d.fill('#d9t input[data-act="spot"][data-side="A"]', '15.2'); await d.snap('spot');
  await d.fill('#d9t input[data-act="ivs"][data-side="A"]', '7', { commit: 'tab' }); await d.snap('ivshift');
  await d.click('#d9t [data-act="ovreset"][data-side="A"]'); await d.snap('reset');
  await d.click('#d9t [data-act="instx"][data-side="B"]'); await d.fill('#d9t input[data-act="ivs"][data-side="B"]', '-5'); await d.snap('B-ivshift');
  await d.click('#d9t [data-act="instx"][data-side="A"]'); await d.snap('A-closed');
});
add('dock-inst-exp', 'dock', 'instrument and expiry selects; expiry-map popover', async d => {
  await d.select('#d9t select[data-act="inst"][data-side="B"]', 'RAM'); await d.snap('B-RAM');
  await d.select('#d9t select[data-act="inst"][data-side="A"]', 'KORU'); await d.snap('A-KORU');
  const opts = await d.page.locator('#d9t select[data-act="exp"][data-side="A"] option').evaluateAll(o => o.map(x => x.value));
  await d.select('#d9t select[data-act="exp"][data-side="A"]', opts[opts.length - 1]); await d.snap('A-last-exp');
  await d.click('#d9t [data-act="expmap"]'); await d.snap('expmap-pop');
  await d.click('#pop [data-pop="expmap"][data-v="same"]'); await d.snap('expmap-same');
  await d.click(link('exp')); await d.select('#d9t select[data-act="exp"][data-side="B"]', opts[0]); await d.snap('B-own-exp');
});
add('dock-collapse', 'dock', 'hide and show the dock; legs in detail', async d => {
  await d.click('#dockBtn'); await d.snap('hidden');
  await d.click('#dockOpen'); await d.snap('shown');
  await d.open('#d9legs'); await d.snap('legs-detail');
});
add('dock-sizing', 'dock', 'pair sizing select through every rule, custom h input (valid and invalid)', async d => {
  await d.open('#d9size'); await d.snap('open');
  for (const v of ['notional', 'credit', 'loss', 'margin']) { await d.select('#d9-size', v); await d.snap('size-' + v); }
  await d.select('#d9-size', 'custom'); await d.fill('#d9-hc', '1.75'); await d.snap('h-1.75');
  await d.fill('#d9-hc', '-2'); await d.snap('h-invalid');
  await d.fill('#d9-hc', '99'); await d.snap('h-clamped');
});

// ================================================================== summary
add('sum-unit', 'summary', 'move unit σ / % / price (price needs one instrument)', async d => {
  await d.click(segB('#s9-unit', 'pct')); await d.snap('pct');
  await d.select('#d9t select[data-act="inst"][data-side="B"]', 'RAM'); await d.snap('same-inst');
  await d.click(segB('#s9-unit', 'pts')); await d.snap('price');
  await d.click(segB('#s9-unit', 'sig')); await d.snap('sigma');
});
add('sum-range', 'summary', 'move range inputs: valid, invalid, symmetric off', async d => {
  await d.fill('#s9-rhi', '3'); await d.snap('rhi-3');
  await d.fill('#s9-rlo', '0'); await d.snap('rlo-0-invalid');
  await d.fill('#s9-rlo', 'abc'); await d.snap('rlo-text-invalid');
  await d.open('#s9-rmenu'); await d.snap('menu');
  await d.check('#s9-rlink', false); await d.snap('rlink-off');
  await d.fill('#s9-rlo', '1.2', { commit: 'change' }); await d.press('Tab'); await d.snap('asym');
  await d.open('#s9-rmenu'); await d.check('#s9-rlink', true); await d.snap('rlink-on');
});
add('sum-reading', 'summary', 'reading units, odds seg and the HV30 slider', async d => {
  await d.open('#s9-rmenu');
  await d.click(segB('#s9-units', 'usd')); await d.snap('usd');
  await d.click(segB('#s9-units', 'cr')); await d.snap('credit');
  await d.click(segB('#s9-dist', 'hv')); await d.snap('hv');
  await d.drag('#s9-hvk', 0.8, { midSnap: 'hvk-mid' }); await d.snap('hvk');
  await d.press('Escape'); await d.snap('closed');
});
add('sum-pills-swap', 'summary', 'difference pills: open in dock, relink one, swap, relink all', async d => {
  await d.click(link('placement')); await d.click(dock('B', 'basis', 'money')); await d.snap('pill');
  await d.click('#s9pills [data-pi]'); await d.wait(1600); await d.idle(); await d.snap('pill-reveal');
  await d.click('#s9pills [data-relink]'); await d.snap('relink-one');
  await d.click(dock('A', 'structure', 'straddle')); await d.click('#d9t [data-act="detach"][data-side="A"]'); await d.snap('detached');
  await d.click('#s9swap'); await d.snap('swapped');
  await d.click(link('fill')); await d.click('#s9pills [data-all]'); await d.snap('relink-all');
});
add('sum-toast-action', 'summary', 'a notice toast with an action button: click it', async d => {
  await d.click(link('fill')); await d.click(link('fill'), { keepToast: true }); await d.snap('toast', { keepToast: true });
  await d.click('#toast .t9a'); await d.snap('undone');
  await d.click(link('wingCall')); await d.click(link('wingCall'), { keepToast: true }); await d.click('#toast .t9a'); await d.snap('undone-2');
});

// ================================================================== views
add('view-overview', 'views', 'overview open/close, charts vs table, set A from a table cell', async d => {
  await d.open('#p-over'); await d.snap('charts');
  await d.click(segB('#c-ovv', 'table')); await d.snap('table');
  await d.click('#ovtable button[data-set]', { nth: 3 }); await d.snap('set-from-cell');
  await d.click(segB('#c-ovv', 'chart')); await d.snap('charts-again');
  await d.close('#p-over'); await d.snap('closed');
});
add('view-grid', 'views', 'grid tabs, values, numbers view with its selects', async d => {
  await d.click(segB('#c-gval', 'contrib')); await d.snap('contrib');
  await d.click(link('exp')); await d.select('#d9t select[data-act="exp"][data-side="B"]', { index: 0 }); await d.click(segB('#c-align', 'cal')); await d.snap('same-date');
  await d.click(segB('#c-gview', 'num')); await d.snap('numbers');
  for (const v of ['A', 'B']) { await d.click(segB('#c-gtab', v)); await d.snap('tab-' + v); }
  await d.select('#c-nm', '25'); await d.select('#c-nd', '2'); await d.snap('num-selects');
  await d.click('#csvBtn'); await d.snap('csv-copied');
  await d.click(segB('#c-gtab', 'D')); await d.click(segB('#c-gview', 'heat')); await d.snap('back');
});
add('view-grid-display', 'views', 'grid display menu: lines, contours, overlays, colour, fixed range + crx', async d => {
  await d.open('#m-gdisp'); await d.snap('menu');
  await d.check('#c-gl', true); await d.click(segB('#c-ct', 'lev')); await d.select('#c-cts', '10'); await d.snap('contours');
  for (const k of ['ovk', 'ovc', 'ovb', 'ovs', 'ovo']) await d.click('#c-' + k);
  await d.snap('overlays-toggled');
  await d.click(segB('#c-cs', 'lin')); await d.click(segB('#c-cr', 'fix')); await d.snap('fixed');
  await d.fill('#c-crx', '35'); await d.snap('crx-35');
  await d.fill('#c-crx', '-4'); await d.snap('crx-invalid');
  await d.check('#c-shared', false); await d.snap('own-scales');
  await d.press('Escape'); await d.snap('closed');
});
add('view-shocks', 'views', 'shock sliders (drag), down-only checkbox, clear', async d => {
  await d.open('#m-shock'); await d.snap('menu');
  await d.drag('#c-ivs', 0.75, { midSnap: 'ivs-mid' }); await d.snap('ivs');
  await d.drag('#c-svs', 0.5); await d.snap('svs');
  await d.click('#c-svd'); await d.snap('svd');
  await d.click('#shockReset'); await d.snap('cleared');
});
add('view-payoff', 'views', 'payoff strips, worst-loss range select and inputs', async d => {
  await d.click('#c-pso'); await d.click('#c-pss'); await d.snap('strips-off');
  await d.select('#cmp select[data-wl]', 'own'); await d.snap('wl-own');
  await d.fill('#cmp [data-wlo]', '1.5'); await d.snap('wlo');
  await d.fill('#cmp [data-whi]', '0'); await d.snap('whi-invalid');
  await d.click('#c-pso'); await d.snap('strip-on');
});
add('view-pins', 'views', 'pins: add by clicking the grid, remove one, clear', async d => {
  await d.mouseClickAt('.gcell[data-g="A"] canvas.ov', 0.3, 0.3); await d.snap('pin1');
  await d.mouseClickAt('.gcell[data-g="D"] canvas.ov', 0.7, 0.6); await d.mouseClickAt('.gcell[data-g="B"] canvas.ov', 0.5, 0.9); await d.snap('pin3');
  await d.click('#pins button[data-k]', { nth: 1 }); await d.snap('removed');
  await d.click('#pinclr'); await d.snap('cleared');
});
add('view-joint', 'views', 'joint moves day slider drag; one-instrument state and its button', async d => {
  await d.drag('#c-jday', 0.3, { midSnap: 'day-mid' }); await d.snap('day');
  await d.select('#d9t select[data-act="inst"][data-side="B"]', 'RAM'); await d.snap('one-inst');
  await d.click('#jgo'); await d.snap('jgo');
});
add('view-sweep-smile', 'views', 'sweep seg; a smile quote popover and Use as', async d => {
  for (const v of ['put', 'call', 'wingCall']) { await d.click(segB('#c-sweep', v)); await d.snap('sweep-' + v); }
  await d.click('#smile .qpt', { nth: 4 }); await d.snap('quote-pop');
  await d.click('#pop button[data-i]:not([disabled])'); await d.snap('placed');
  await d.click('#smile .qpt', { nth: -2 }); await d.press('Escape'); await d.snap('pop-escaped');
});
add('view-recovery', 'views', 'recovery dynamics: every control', async d => {
  await d.fill('#c-rdk', '1.5'); await d.snap('k');
  for (const v of ['down', 'up']) { await d.click(segB('#c-rddir', v)); await d.snap('dir-' + v); }
  await d.click(segB('#c-rdhit', 'fixed')); await d.snap('fixed');
  await d.fill('#c-rdl', '35'); await d.snap('L35');
  await d.fill('#c-rdl', '500'); await d.snap('L-clamped');
  await d.open('#m-rd'); await d.click(segB('#c-rdbase', 'start')); await d.snap('base-start');
  await d.click(segB('#c-rdcap', 'notional')); await d.snap('cap-notional');
  await d.click(segB('#c-rdg', 'custom')); await d.fill('#c-rdgc', '4.5'); await d.snap('typed');
  await d.press('Escape'); await d.snap('closed');
});
add('hover-charts-1', 'hover', 'tooltips: payoff, grid, joint, sweep', async d => {
  await d.hover('#pay svg', 0.42, 0.3); await d.snap('payoff', { hover: true });
  await d.hover('.gcell[data-g="A"] canvas.ov', 0.4, 0.5); await d.snap('grid-A', { hover: true });
  await d.hover('.gcell[data-g="D"] canvas.ov', 0.6, 0.2); await d.snap('grid-D', { hover: true });
  await d.hover('#p-joint canvas.ov', 0.5, 0.5); await d.snap('joint', { hover: true });
  await d.hover('#sweep svg', 0.5, 0.5); await d.snap('sweep', { hover: true });
});
add('hover-charts-2', 'hover', 'tooltips: recovery, smile quote, overview point, info ⓘ', async d => {
  await d.hover('#rec svg', 0.5, 0.5); await d.snap('recovery', { hover: true });
  await d.hover('#smile .qpt', 0.5, 0.5, { nth: 3 }); await d.snap('smile', { hover: true });
  await d.open('#p-over'); await d.hover('#ovgrid svg', 0.5, 0.45); await d.snap('overview', { hover: true });
  await d.hover('#gInfo'); await d.snap('grid-info', { hover: true });
  await d.hover('#sum9 .info'); await d.snap('summary-info', { hover: true });
});
add('info-pop-escape', 'hover', 'ⓘ by keyboard focus, #pop popovers, Escape closes', async d => {
  await d.focus('#gInfo'); await d.snap('focus-tip', { hover: true });
  await d.click('#d9t [data-act="expmap"]'); await d.snap('pop');
  await d.press('Escape'); await d.snap('esc');
  await d.open('#m-shock'); await d.press('Escape'); await d.snap('menu-esc');
  await d.mouseClickAt('#pay svg', 0.3, 0.2); await d.snap('payoff-click');
});

// ================================================================== page menu
add('menu-theme', 'menu', 'theme auto / light / dark from the page menu', async d => {
  await menu(d); await d.snap('menu');
  await d.click(segB('#c-theme', 'dark')); await d.snap('dark');
  await d.click(segB('#c-theme', 'light')); await d.snap('light');
  await d.click(segB('#c-theme', 'auto')); await d.snap('auto');
});
add('menu-code', 'menu', 'view code copy; load a valid code; load an invalid code', async (d, data) => {
  await menu(d); await d.click('#vcopy'); await d.snap('copied');
  await menu(d); await d.fill('#vload', 'v9.garbage', { commit: 'none' }); await d.click('#vgo'); await d.snap('invalid');
  await menu(d); await d.fill('#vload', data.code1, { commit: 'none' }); await d.click('#vgo'); await d.snap('valid');
});
add('menu-reset', 'menu', 'reset this tab and reset both tabs', async d => {
  await d.click(dock('A', 'structure', 'straddle')); await d.click(segB('#c-gval', 'contrib'));
  await yrTab(d); await d.click('#y-A-fam button[data-v="str"]'); await d.click('#tb-compare');
  await menu(d); await d.click('#vreset'); await d.snap('reset-compare');
  await yrTab(d); await d.snap('yr-kept');
  await d.click('#tb-compare'); await d.click(segB('#c-gview', 'num'));
  await menu(d); await d.click('#vresetAll'); await d.snap('reset-both');
  await yrTab(d); await d.snap('yr-reset');
}, YR);
add('menu-export', 'menu', 'export: open, toggle a Sections checkbox, Copy, Download', async d => {
  await menu(d); await d.open('#pmenu details.xsec'); await d.snap('sections');
  await d.click('#xsecs input[data-x]', { nth: 1 }); await d.snap('toggled');
  await d.click('#xcopy'); await d.snap('copied');
  await menu(d); await d.download('#xdl'); await d.snap('downloaded');
  await yrTab(d); await menu(d); await d.click('#xcopy'); await d.snap('yr-copied');
}, YR);

// ================================================================== tabs, address, persistence, viewport
add('tabs-keys-scroll', 'tabs', 'tab strip click and arrow keys; each tab keeps its scroll', async d => {
  await d.scrollTo(1400); await yrTab(d); await d.snap('yr');
  await d.scrollTo(500); await d.click('#tb-compare'); await d.snap('compare-kept-scroll');
  await d.focus('#tb-compare'); await d.press('ArrowRight', { min: 600 }); await d.snap('arrow-right');
  await d.press('ArrowLeft', { min: 400 }); await d.snap('arrow-left');
  await d.press('ArrowLeft', { min: 600 }); await d.snap('arrow-wrap');
}, YR);
add('hash-valid', 'address', 'open page#<valid code taken from a run>', async d => { await d.snap('loaded'); }, { hash: data => data.code1 });
add('hash-yr', 'address', 'open page#<code whose tab is Compounding>', async d => { await d.snap('loaded'); }, Object.assign({ hash: data => data.code2 }, YR));
add('hash-garbage', 'address', 'open page#garbage: toast, default view', async d => { await d.snap('loaded'); }, { hash: 'v9.not-a-code' });
add('hash-change', 'address', 'a hashchange to another code while open, then to garbage', async (d, data) => {
  await d.setHash(data.code1); await d.snap('code1');
  await d.setHash('v9.###'); await d.snap('garbage');
  await d.setHash(data.code2, { min: 700, quiet: 400 }); await d.snap('code2');
});
add('persist-reload', 'persistence', 'three changes, reload, compare', async d => {
  await d.click(dock('A', 'structure', 'straddle')); await d.click(segB('#c-gview', 'num')); await d.click(segB('#c-gtab', 'B')); await d.click(link('fill'));
  await d.snap('before');
  await d.reload(); await d.snap('after-reload');
});
add('viewport-resize', 'viewport', 'resize 1200 <-> 1440 while open', async d => {
  await d.resize(d.W === 1200 ? 1440 : 1200); await d.snap('resized');
  await d.resize(d.combo.W); await d.snap('back');
});

// ================================================================== Compounding
add('yr-default', 'yr', 'Compounding tab default render (stable engine result)', async d => {
  await yrTab(d); await d.snap('top');
  await d.scrollTo('bottom'); await d.snap('bottom');
}, YR);
add('yr-controls', 'yr', 'strategy, ticker, sliders, modus operandi, B differs', async d => {
  await yrTab(d);
  await d.click('#y-A-fam button[data-v="str"]'); await d.snap('strangle');
  await d.drag('#y-A-cd', 0.6, { midSnap: 'cd-mid' }); await d.snap('call-delta');
  await d.open('#y-edA details.sub:has(#y-A-mcr)'); await d.click('#y-A-mcr button[data-v="cash"]'); await d.snap('modus-cash');
  await d.click('#y-A-mcall button[data-v="target"]'); await d.fill('#y-A-mtgt', '0.8'); await d.snap('modus-target');
  await d.click('#y-A-tk button[data-v="RAM"]'); await d.snap('ram');
  await d.click('#y-bdiff button', { nth: 2 }); await d.snap('bdiff');
  await d.fill('#y-W', '30'); await d.select('#y-pmode', 'growth'); await d.snap('path-growth');
  await d.click('#y-swap'); await d.snap('swap');
}, YR);
add('yr-views', 'yr', 'stack menu, reading, week table, path menu, dock hide/show', async d => {
  await yrTab(d);
  await d.open('#y-stackmenu'); await d.click('#y-band button[data-v="a"]'); await d.click('#y-exact'); await d.snap('stack-menu');
  await d.open('#y-read'); await d.snap('reading-menu');
  await d.click('#y-rd button[data-v="avg"]', { dispatch: true }); await d.snap('average');   // the menu opens off-screen to the left at this width
  await d.open('#y-tablep'); await d.snap('table');
  await d.open('#y-pmenu'); await d.click('#y-pgeo button[data-v="1"]'); await d.snap('path-menu');
  await d.press('Escape'); await d.click('#y-dockhide'); await d.snap('dock-hidden');
  await d.click('#y-dockshow'); await d.snap('dock-shown');
}, YR);
add('yr-hover', 'yr', 'Compounding chart hover and pin click', async d => {
  await yrTab(d);
  await d.hover('#y-stack svg', 0.5, 0.4); await d.snap('stack-tip', { hover: true });
  await d.mouseClickAt('#y-stack svg', 0.3, 0.4); await d.snap('pinned');
}, YR);
add('yr-stress', 'yr', 'Stress view: shapes, size, week slider, worst, rules', async d => {
  await yrTab(d);
  await d.click('#y-view button', { nth: 1 }); await d.snap('stress');
  await d.click('#y-sshape button[data-v="run"]'); await d.snap('run');
  await d.fill('#y-sX', '-25'); await d.snap('X');
  await d.drag('#y-sw', 0.4, { midSnap: 'week-mid' }); await d.snap('week');
  await d.click('#y-sworst'); await d.snap('worst');
  await d.open('#y-srules'); await d.click('#y-sland button[data-v="3"]'); await d.snap('rules');
  await d.press('Escape'); await d.click('#y-sshape button[data-v="spike"]'); await d.snap('spike');
}, YR);
add('yr-random-years', 'yr', 'Random years (Monte Carlo) run to completion, new seed, rerun', async d => {
  await yrTab(d); await d.click('#y-view button', { nth: 1 });
  await d.open('#y-mc'); await d.snap('opened');
  await d.click('#y-mcn button[data-v="1000"]'); await d.click('#y-mcrun');
  await d.waitText('#y-mcp', /paths per run/, { timeout: 90000 }); await d.snap('done');
  await d.click('#y-mcns'); await d.snap('stale');
}, Object.assign({}, YR));
add('yr-reset', 'yr', 'Compounding changes then reset this tab', async d => {
  await yrTab(d); await d.click('#y-A-fam button[data-v="str"]'); await d.fill('#y-cap0', '50000');
  await menu(d); await d.click('#vreset'); await d.snap('reset');
  await d.click('#tb-compare'); await d.snap('compare-untouched');
}, YR);

// ================================================================== long session
const FAMILIES = [
  '#d9t [data-act="set"]', '#d9t [data-act="link"]', '#sum9 .seg button', '#views .seg button', '#s9swap',
  '#views input[type="checkbox"]', '#d9t [data-act="detach"]', '#s9pills [data-pi], #s9pills [data-relink], #s9pills [data-all]',
  'details.menu > summary', '#views select', '#d9t select', '#s9-rlo, #s9-rhi, #c-rdk, #d9-hc', '#views input[type="range"], #d9t input[type="range"]'
];
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
add('long-session', 'random', '25 seeded random DOM actions across the families (same seed both pages)', async d => {
  const r = rng(20261002);
  for (let i = 0; i < 25; i++) {
    const fam = FAMILIES[Math.floor(r() * FAMILIES.length)], pick = r(), extra = r();
    const els = await d.randomPick(fam);
    if (!els.length) continue;
    const sel = els[Math.floor(pick * els.length)];
    const tag = await d.page.locator(sel).evaluate(e => e.tagName + ':' + (e.type || ''));
    if (tag.startsWith('SELECT')) { const n = await d.page.locator(sel + ' option').count(); await d.select(sel, await d.page.locator(sel + ' option').nth(Math.floor(extra * n)).getAttribute('value')); }
    else if (tag === 'INPUT:range') await d.drag(sel, 0.1 + 0.8 * extra);
    else if (tag === 'INPUT:number') await d.fill(sel, String(+(0.5 + extra * 3).toFixed(2)));
    else await d.click(sel);
    if (i % 5 === 4) await d.snap('step' + (i + 1));
  }
  await d.press('Escape'); await d.snap('end');
});

// ------------------------------------------------------------------ shared inputs from a run of page A
async function prepare({ browser, file, runSide, COMBOS }) {
  const data = {};
  const scen = {
    id: 'prepare', run: async (d, out) => {
      await d.click(dock('A', 'structure', 'straddle')); await d.click(link('fill')); await d.click(dock('B', 'fill', 'nat'));
      await d.click(segB('#c-gval', 'contrib')); await d.open('#s9-rmenu'); await d.click(segB('#s9-units', 'usd')); await d.press('Escape');
      out.code1 = await d.value('#vcode');
      await d.click('#tb-yr', { min: 600, quiet: 400 }); await d.click('#y-A-fam button[data-v="str"]', { min: 600, quiet: 400 });
      out.code2 = await d.value('#vcode');
    }
  };
  const r = await runSide(browser, file, 'A', COMBOS['1200-light'], scen, data);
  if (r.fail || !data.code1 || !data.code2 || data.code1 === data.code2) throw new Error('prepare failed: ' + (r.fail || 'no codes') + '\n' + r.errors.join('\n'));
  return data;
}

module.exports = { list: () => S.slice(), prepare };
