// ============================================================ state (v8: persistence is app-level, see app_store8.js / app8.js)
// short-leg Δ targets run 3..90 on each leg; 50 = the listed strike nearest the forward, above 50 the leg is in the money
const DMIN = 3, DMAX = 90;
const DEF = {
  A: { tk: "RAM", exp: "20261120", st: "str", pd: 30, cd: 30, capd: 17, fill: "mid" },
  along: "tk", bexp: "20261218", bk: { pd: 20, cd: 20, capd: 10 }, Bf: null, link: true, linkB: true,
  unit: "sig", rlo: 2, rhi: 2, rlink: true, wl: "view", wlo: 2, whi: 2,
  dist: "rn", hvk: 1, ivs: 0, svs: 0, svd: true,
  units: "pct", size: "auto", hc: 1, align: "frac",
  ovm: "cr", ovv: "chart",
  gview: "heat", gval: "pnl", gtab: "D", nm: 13, nd: 7,
  gl: false, ct: "zero", cts: 5, ovk: true, ovc: true, ovb: false, ovs: true, ovo: true, pso: true, pss: true,
  cs: "comp", cr: "auto", crx: 20, shared: true, sweep: "both", jday: -1, pins: [], dock: true, theme: "auto"
};
const ENUMS = {
  along: ["st", "tk", "exp", "k", "fill", "free"], unit: ["sig", "pct", "pts"], wl: ["view", "own"], dist: ["rn", "hv"],
  units: ["pct", "usd", "cr"], size: ["auto", "notional", "credit", "vega", "loss", "margin", "custom"], align: ["frac", "cal"],
  ovm: ["cr", "crs", "crd", "ev", "pop", "worst", "capc", "capp", "rom"], ovv: ["chart", "table"],
  gview: ["heat", "num"], gval: ["pnl", "contrib"], gtab: ["A", "B", "D"], ct: ["zero", "lev"], cs: ["comp", "lin"], cr: ["auto", "fix"],
  sweep: ["both", "pd", "cd", "capd"], theme: ["auto", "light", "dark"],
  nm: [9, 13, 17, 25], nd: [1, 2, 5, 7, 14, 30], cts: [1, 2, 5, 10, 20]
};
function sanP(p, d) {
  const r = { ...d }; if (!p || typeof p !== "object") return r;
  if (TKS.includes(p.tk)) r.tk = p.tk; if (EXPS.includes(p.exp)) r.exp = p.exp;
  if (p.st === "str" || p.st === "cap") r.st = p.st; if (p.fill === "mid" || p.fill === "nat") r.fill = p.fill;
  for (const k of ["pd", "cd"]) if (Number.isFinite(+p[k])) r[k] = clamp(+p[k], DMIN, DMAX);
  if (Number.isFinite(+p.capd)) r.capd = clamp(+p.capd, 3, 40);
  return r;
}
function sanitize(o) {
  const s = JSON.parse(JSON.stringify(DEF));
  if (!o || typeof o !== "object") return s;
  for (const k in s) {
    if (!(k in o) || ["A", "bk", "Bf", "pins"].includes(k)) continue;
    if (ENUMS[k]) { if (ENUMS[k].includes(o[k])) s[k] = o[k]; }
    else if (typeof o[k] === typeof s[k]) s[k] = o[k];
  }
  s.A = sanP(o.A, s.A);
  const bk = sanP({ ...s.A, ...(o.bk || {}) }, { ...s.A, ...s.bk }); s.bk = { pd: bk.pd, cd: bk.cd, capd: bk.capd };
  s.Bf = o.Bf ? sanP(o.Bf, s.A) : null;
  if (!EXPS.includes(s.bexp)) s.bexp = DEF.bexp;
  for (const k of ["rlo", "rhi", "wlo", "whi"]) s[k] = clamp(+s[k] || DEF[k], 0.01, 5000);
  s.ivs = clamp(s.ivs, -30, 60); s.svs = clamp(s.svs, 0, 20); s.hvk = clamp(s.hvk, 0.5, 1.6); s.hc = clamp(s.hc, 0.05, 20); s.crx = clamp(s.crx, 0.5, 200); s.jday = Math.round(clamp(s.jday, -1, 400));
  s.pins = Array.isArray(o.pins) ? o.pins.filter(p => p && p.S && Number.isFinite(+p.S.RAM) && Number.isFinite(+p.S.KORU) && Number.isFinite(+p.dA) && Number.isFinite(+p.dB)).map(p => ({ S: { RAM: +p.S.RAM, KORU: +p.S.KORU }, dA: +p.dA, dB: +p.dB })).slice(0, 12) : [];
  if (s.along === "free" && !s.Bf) s.Bf = { ...s.A, tk: s.A.tk === "RAM" ? "KORU" : "RAM" };
  return s;
}
// st.theme is still read and written so v5 codes keep their theme, but rendering uses APP.theme
function loadState() { return sanitize(BOOT.cmp); }
let st = loadState();
