"use strict";
// ============================================================ constants & formatting
const R = D.meta.rate, TKS = ["RAM", "KORU"], EXPS = Object.keys(D.u.RAM.exps).sort();
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MINUS = "−";
const fmtE = e => `${+e.slice(6)} ${MON[+e.slice(4, 6) - 1]}` + (e.slice(0, 4) !== "2026" ? ` ’${e.slice(2, 4)}` : "");
const fP = (v, d = 1) => Number.isFinite(v) ? (v < 0 ? MINUS : "") + Math.abs(v * 100).toFixed(d) + "%" : "–";
const fS = (v, d = 1) => Number.isFinite(v) ? (Math.abs(v * 100) < 0.5 * Math.pow(10, -d) ? "" : v < 0 ? MINUS : "+") + Math.abs(v * 100).toFixed(d) + "%" : "–";
const fN = (v, d = 2) => Number.isFinite(v) ? (v < 0 ? MINUS : "") + Math.abs(v).toFixed(d) : "–";
const fK = K => String(+(+K).toFixed(2));
const fPx = v => Number.isFinite(v) ? v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) : "–";   // axis tick prices
const fPx2 = v => Number.isFinite(v) ? v.toFixed(2) : "–";                                // exact prices: breakevens, scenarios
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = s => document.querySelector(s);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ============================================================ math
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const N = x => 0.5 * (1 + erf(x / Math.SQRT2));
const npdf = x => Math.exp(-x * x / 2) / 2.5066282746310002;
function Ninv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let q, r;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
function bs(S, K, T, s, cp) {
  if (T <= 1e-9) return Math.max(0, cp === "C" ? S - K : K - S);
  const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + (R + s * s / 2) * T) / v, d2 = d1 - v;
  return cp === "C" ? S * N(d1) - K * Math.exp(-R * T) * N(d2) : K * Math.exp(-R * T) * N(-d2) - S * N(-d1);
}
function bsDelta(S, K, T, s, cp) { const d1 = (Math.log(S / K) + (R + s * s / 2) * T) / (s * Math.sqrt(T)); return cp === "C" ? N(d1) : N(d1) - 1; }
function bsVega(S, K, T, s) { const d1 = (Math.log(S / K) + (R + s * s / 2) * T) / (s * Math.sqrt(T)); return S * npdf(d1) * Math.sqrt(T); }
// fitted smile: cubic in log-moneyness inside the quoted range; beyond it, total variance continues linearly
// with the slope it has at the edge (capped below Lee's bound of 2), so the wings stay smooth and arbitrage-free
// wing anchors: if the cubic's slope has the wrong sign at a quote edge (smile turning over), move the anchor inward
// to where the slope is zero, so value and slope stay continuous and the implied density has no spike
function wingAnchors(E) {
  if (E._w) return E._w;
  const n = E.coef.length - 1, dp = z => { let y = 0; for (let i = 0; i < n; i++) y = y * z + E.coef[i] * (n - i); return y; };
  const mid = (E.xlo + E.xhi) / 2, root = (a, b) => { for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (Math.sign(dp(m)) === Math.sign(dp(a))) a = m; else b = m; } return (a + b) / 2; };
  let lo = E.xlo, hi = E.xhi;
  if (dp(lo) > 0) lo = dp(mid) <= 0 ? root(lo, mid) : mid;
  if (dp(hi) < 0) hi = dp(mid) >= 0 ? root(mid, hi) : mid;
  return E._w = { lo, hi, dp };
}
function smile(E, K, F) {
  const x = Math.log(K / F), w = wingAnchors(E);
  const p = z => { let y = 0; for (const c of E.coef) y = y * z + c; return y; };
  if (x >= w.lo && x <= w.hi) return Math.max(p(x), 0.05);
  const xb = x < w.lo ? w.lo : w.hi, sb = Math.max(p(xb), 0.05), T = E.T;
  let ws = 2 * sb * w.dp(xb) * T; ws = x < w.lo ? Math.max(Math.min(ws, 0), -1.9) : Math.min(Math.max(ws, 0), 1.9);
  return Math.max(Math.sqrt(Math.max(sb * sb * T + ws * (x - xb), 0.0025 * T) / T), 0.05);
}
function impliedVol(price, S, K, T, cp) {
  const intr = Math.max(0, cp === "C" ? S - K * Math.exp(-R * T) : K * Math.exp(-R * T) - S);
  if (!(price > intr + 1e-6)) return NaN;
  let lo = 0.01, hi = 6;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (bs(S, K, T, m, cp) > price) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
const PCT_CAND = [0, 50, -50, 100, -20, 20, 200, -30, 30, -10, 10, -40, 40, 300, -60, 60, -70, 75, 150, -80, 400, -90, 500, -5, 5, -15, 15, 25, -25, -35, 35, 80, 250, 600, 800, -2.5, 2.5, -95];
// "nice" % moves placed on a log axis, greedily keeping a minimum pixel gap
function pctTicks(lo, hi, pos, gap) {
  const out = [];
  for (const c of PCT_CAND) { const p = c / 100, x = Math.log(1 + p); if (x < lo || x > hi) continue; const y = pos(x); if (out.every(o => Math.abs(o.y - y) >= gap)) out.push({ p, x, y }); }
  return out.sort((a, b) => a.x - b.x);
}
const pctLab = p => (p > 0 ? "+" : p < 0 ? MINUS : "") + +Math.abs(p * 100).toFixed(1) + "%";
function ticks(lo, hi, n) {
  const span = hi - lo; if (!(span > 0)) return [lo];
  const step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
// the size that survives a test, in words, one form for Capture, Recovery, Credit kept and the export:
// "survives this 2σ hit at ≤ 0.61× this size (at least $1,118 of capital a RAM contract, 1.6× its margin)"
const SURVIVAL = (() => {
  const floor2 = v => (Math.floor(v * 100) / 100).toFixed(2);
  // the wipe-out odds the growth readings test, in words: "1 in 20,000 a cycle"
  const oddsWords = odds => `1 in ${Math.round(1 / odds).toLocaleString("en-US")} a cycle`;
  // the capital a contract needs at the surviving size, and that as a multiple of the base it is measured on (rounded
  // up, so the printed multiple is never below what it takes)
  /** @param {{ usd: number, tk: string, multiple?: number, base?: string }} input */
  const capital = ({ usd, tk, multiple, base }) => !Number.isFinite(usd) ? "" :
    `at least $${Math.ceil(usd).toLocaleString("en-US")} of capital a ${tk} contract${Number.isFinite(multiple) && base ? `, ${(Math.ceil(multiple * 10 - 1e-9) / 10).toFixed(1)}× its ${base}` : ""}`;
  /** @param {{ scale: number, test: string, size?: string, capital?: string, plain?: boolean }} input */
  function line({ scale, test, size, capital, plain }) {
    if (!(scale > 0) || !Number.isFinite(scale)) { return `no size survives ${test}`; }
    const at = size || `≤\u00a0${floor2(scale)}×\u00a0this size`;
    return `survives ${test} at ${plain ? at : `<b>${at}</b>`}${capital ? ` (${capital})` : ""}`;
  }
  return Object.freeze({ line, floor2, oddsWords, capital });
})();
