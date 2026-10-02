// pixdiff --map-b module: page B (v10) writes "#v10." codes and the "rk-lab-v10" blob; page A (v9 / step 1) writes
// "#v9." codes and "rk-lab-v9". This function rewrites B's captured state into A's format before the state channel
// compares it: the address, the #vcode field (value and form entry), every code inside a clipboard text, and the
// stored blob (key and content). Anything it cannot convert is left as it is, so it shows up as a difference.
//
// v10 document {tab, comparison, assumptions, prefs, periodVol, yr}  ->  v9 {t: tab, th: prefs.theme, c: S9, y: yr}
//   S9 = {cmp: comparison, scen: assumptions, view: prefs without exportSections}
//   prefs.exportSections {compare, yr} -> yr.view.exportCmp / exportYr, appended in the order they were first chosen
//   periodVol must be {} (v9 has no period vol; anything else is reported)
// v10 blob {v: 10, ...document} -> v9 blob {v: 9, tab, theme, cmp: S9, yr}
// v10 part 2b dropped v9's listed-vol multiplier from the assumptions: v9 wrote scen.hvk (1 unless moved), right after
// scen.dist; the map puts hvk: 1 back in that place (a v10 page with a period vol set is reported, see periodVol above)
// v10 part 2c: the Compounding tab no longer keeps its own moves (v9's yr.sc.rv, B's yr.sc.rvB); it reads the period
// vol and keeps a run override yr.sc.volOverride = {run, [ticker]: pct} for "B differs in vol". The map rebuilds v9's
// fields in v9's key order (rv after iv, rvB after ivB): the run the override names reads it (a ticker without one:
// v9's untouched default, the listed vol rounded), the other run reads the period vol (a "set" entry with an integer
// pct, as v9's Compounding inputs kept them, is folded into rv and leaves periodVol; anything else stays and is
// reported as above).
'use strict';
const fs = require('fs'), path = require('path');
const DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../data.json'), 'utf8'));
const listedRounded = tk => Math.round(DATA.u[tk].hv * 100);
const TICKERS = ['KORU', 'RAM'];   // the order of v9's Compounding vol tables

const V9_EXPORT_KEY = { compare: 'exportCmp', yr: 'exportYr' };
const KEY_V10 = 'rk-lab-v10', KEY_V9 = 'rk-lab-v9';
// v8 / v9's base64url JSON (btoa of the UTF-8 bytes, "+/" -> "-_", no padding)
const enc = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);

// a v10 document -> {tab, theme, s9, yr} as v9 would have written them; throws when v9 cannot express it
function toV9Parts(doc) {
  if (!isObj(doc) || !isObj(doc.prefs)) throw new Error('not a v10 document');
  const moves = withV9Moves(doc.yr, isObj(doc.periodVol) ? doc.periodVol : {});
  if (Object.keys(moves.periodVol).length) throw new Error('periodVol is not empty: v9 has no period vol ' + JSON.stringify(moves.periodVol));
  const view = Object.assign({}, doc.prefs), sections = isObj(view.exportSections) ? view.exportSections : {};
  delete view.exportSections;
  let yr = moves.yr;
  const tabs = Object.keys(sections);
  if (tabs.length) {
    if (!isObj(yr) || !isObj(yr.view)) throw new Error('export sections chosen but the Compounding state has no view to carry them');
    yr = Object.assign({}, yr, { view: Object.assign({}, yr.view) });
    for (const tab of tabs) yr.view[V9_EXPORT_KEY[tab]] = sections[tab];
  }
  return { tab: doc.tab, theme: doc.prefs.theme, s9: { cmp: doc.comparison, scen: withV9VolScale(doc.assumptions), view }, yr };
}
// v10 part 2c yr + periodVol -> v9 yr (rv, rvB) + the period vol entries v9 cannot express
function withV9Moves(yr, periodVol) {
  const hasOverride = isObj(yr) && isObj(yr.sc) && isObj(yr.sc.volOverride);
  if (!hasOverride) return { yr, periodVol };
  const left = Object.assign({}, periodVol), shared = {}, own = {}, override = yr.sc.volOverride;
  for (const tk of TICKERS) {
    const entry = left[tk];
    const isFoldable = isObj(entry) && entry.source === 'set' && Number.isInteger(entry.pct);
    if (isFoldable) delete left[tk];
    shared[tk] = isFoldable ? entry.pct : listedRounded(tk);
    own[tk] = typeof override[tk] === 'number' ? override[tk] : listedRounded(tk);
  }
  const rv = override.run === 'A' ? own : shared, rvB = override.run === 'A' ? shared : own;
  const sc = {};
  for (const [k, v] of Object.entries(yr.sc)) {
    if (k === 'volOverride') continue;
    sc[k] = v;
    if (k === 'iv') sc.rv = rv;
    if (k === 'ivB') sc.rvB = rvB;
  }
  return { yr: Object.assign({}, yr, { sc }), periodVol: left };
}
// v10 assumptions -> v9 scen: hvk 1 after dist (key order is part of the compared JSON)

function withV9VolScale(assumptions) {
  if (!isObj(assumptions) || 'hvk' in assumptions) return assumptions;
  const out = {};
  for (const [k, v] of Object.entries(assumptions)) { out[k] = v; if (k === 'dist') out.hvk = 1; }
  return out;
}
// "v10.<payload>" -> "v9.<payload>"
function convertCode(code) {
  const m = /^v10\.([A-Za-z0-9_-]*)$/.exec(code);
  if (!m) return code;
  try {
    const p = toV9Parts(dec(m[1]));
    return 'v9.' + enc({ t: p.tab, th: p.theme, c: p.s9, y: p.yr });
  } catch (e) { return code + ' [map: ' + e.message + ']'; }
}
// every code in a text: the whole text, or "#v10.<payload>" inside it (the export's "View code" line, an address)
function convertText(text) {
  if (typeof text !== 'string') return text;
  if (/^v10\./.test(text)) return convertCode(text);
  return text.replace(/#(v10\.[A-Za-z0-9_-]+)/g, (_, code) => '#' + convertCode(code));
}
function convertBlob(json) {
  try {
    const doc = JSON.parse(json);
    if (!isObj(doc) || doc.v !== 10) return json;
    const p = toV9Parts(doc);
    return JSON.stringify({ v: 9, tab: p.tab, theme: p.theme, cmp: p.s9, yr: p.yr });
  } catch (e) { return json + ' [map: ' + e.message + ']'; }
}
// B's storage under A's key; a v9 key B wrote itself is kept apart, so it is reported (v10 must never write it)
function convertStorage(ls) {
  if (!isObj(ls)) return ls;
  const out = {};
  for (const [k, v] of Object.entries(ls)) {
    if (k === KEY_V10) out[KEY_V9] = convertBlob(v);
    else if (k === KEY_V9) out[KEY_V9 + ' (written by page B)'] = v;
    else out[k] = v;
  }
  return out;
}

// the captured state channel of page B -> the same in page A's format (a new object; the input is not modified)
module.exports = function mapV10ToV9(state) {
  const out = Object.assign({}, state);
  out.hash = convertText(state.hash);
  out.vcode = convertText(state.vcode);
  if (isObj(state.form)) {
    out.form = Object.assign({}, state.form);
    if (typeof out.form['#vcode'] === 'string') out.form['#vcode'] = convertText(out.form['#vcode']);
  }
  if (Array.isArray(state.clipboard)) out.clipboard = state.clipboard.map(convertText);
  out.localStorage = convertStorage(state.localStorage);
  return out;
};
