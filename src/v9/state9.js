// ============================================================ state9: the comparer state S9, sanitizers, migration (pure)
// One namespace object, STATE. S9 = { cmp: Comparison, scen: scenario, view: view settings }.
// Every function returns new objects; inputs are never modified (they may be deep-frozen).
const STATE = (() => {
  const SCEN_DEF = Object.freeze({ unit: "sig", rlo: 2, rhi: 2, rlink: true, wl: "view", wlo: 2, whi: 2, dist: "rn", hvk: 1, ivs: 0, svs: 0, svd: true, align: "frac" });
  const VIEW_DEF = Object.freeze({
    units: "pct", ovm: "cr", ovv: "chart", gview: "heat", gval: "pnl", gtab: "D", nm: 13, nd: 7, gl: false, ct: "zero", cts: 5,
    ovk: true, ovc: true, ovb: false, ovs: true, ovo: true, pso: true, pss: true, cs: "comp", cr: "auto", crx: 20, shared: true,
    sweep: "both", jday: -1, pins: Object.freeze([]), dock: true, theme: "auto",
    rdHit: "move", rdK: 2, rdDir: "worse", rdL: 60, rdBase: "nav", rdCap: "margin", rdG: "ev", rdGc: 2
  });
  const ENUMS = Object.freeze({
    unit: ["sig", "pct", "pts"], wl: ["view", "own"], dist: ["rn", "hv"], align: ["frac", "cal"],
    units: ["pct", "usd", "cr"], ovm: ["cr", "crs", "crd", "ev", "pop", "worst", "wingc", "wingp", "rom"], ovv: ["chart", "table"],
    gview: ["heat", "num"], gval: ["pnl", "contrib"], gtab: ["A", "B", "D"], ct: ["zero", "lev"], cs: ["comp", "lin"], cr: ["auto", "fix"],
    sweep: ["both", "put", "call", "wingCall"], theme: ["auto", "light", "dark"],
    rdHit: ["move", "fixed"], rdDir: ["worse", "down", "up"], rdBase: ["nav", "start"], rdCap: ["margin", "notional"], rdG: ["ev", "custom"],
    nm: [9, 13, 17, 25], nd: [1, 2, 5, 7, 14, 30], cts: [1, 2, 5, 10, 20]
  });
  const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const fin = v => typeof v === "number" && Number.isFinite(v);

  // ---------------------------------------------------------- move units (shared with ctx9)
  const UNAME = Object.freeze({ sig: "σ", pct: "%", pts: "price" });
  const uStep = unit => unit === "sig" ? 0.25 : unit === "pct" ? 5 : 0.5;
  const uRound = (v, unit) => unit === "sig" ? Math.round(v * 20) / 20 : unit === "pct" ? Math.round(v) : Math.round(v * 20) / 20;
  const rangeCaps = (unit, S) => unit === "pct" ? [95, 2000] : unit === "pts" ? [+(S * 0.95).toFixed(2), +(S * 20).toFixed(2)] : [12, 12];
  function uLab(u, unit, dec) {
    const sg = Math.abs(u) < 1e-9 ? "" : u < 0 ? MINUS : "+", a = Math.abs(u);
    if (unit === "sig") return sg + String(+a.toFixed(dec ?? 2)) + "σ";
    if (unit === "pct") return sg + String(+a.toFixed(dec ?? 1)) + "%";
    return sg + String(+a.toFixed(dec ?? 2));
  }

  // ---------------------------------------------------------- one sanitizer per part
  function sanFlat(o, DEF) {
    const s = clone(DEF);
    if (!isObj(o)) return s;
    for (const k in s) {
      if (!(k in o) || k === "pins") continue;
      if (ENUMS[k]) { if (ENUMS[k].includes(o[k])) s[k] = o[k]; }
      else if (typeof o[k] === typeof s[k] && (typeof o[k] !== "number" || Number.isFinite(o[k]))) s[k] = o[k];
    }
    return s;
  }
  function sanScen(o) {
    const s = sanFlat(o, SCEN_DEF);
    for (const k of ["rlo", "rhi", "wlo", "whi"]) s[k] = clamp(+s[k] || SCEN_DEF[k], 0.01, 5000);
    s.ivs = clamp(s.ivs, -30, 60); s.svs = clamp(s.svs, 0, 20); s.hvk = clamp(s.hvk, 0.5, 1.6);
    return s;
  }
  const sanPins = a => Array.isArray(a) ? a.filter(p => isObj(p) && fin(+p.SA) && +p.SA > 0 && fin(+p.SB) && +p.SB > 0 && fin(+p.dA) && fin(+p.dB)).map(p => ({ SA: +p.SA, SB: +p.SB, dA: +p.dA, dB: +p.dB })).slice(0, 12) : [];
  function sanView(o) {
    const s = sanFlat(o, VIEW_DEF);
    s.crx = clamp(s.crx, 0.5, 200); s.jday = Math.round(clamp(s.jday, -1, 400));
    s.pins = sanPins(isObj(o) ? o.pins : null);
    return s;
  }

  // ---------------------------------------------------------- normaliser (v8 ensureUnit + range clamps)
  // in place: only ever called on a fresh copy (change / sanitize9); the exported normalise() copies first
  function normIn(S9) {
    const s = S9, events = [], sc = s.scen;
    const bA = POS.build(s.cmp.A), bB = CMP.buildB(s.cmp);
    const same = !!(bA.inst && bB.inst && bA.inst.version === bB.inst.version);
    if (sc.unit === "pts" && !same && !bA.na) {
      const S = bA.S, sg = bA.sig, uOf = x => Math.log(x / S) / sg;
      const lo = Math.max(sc.rlo, 0), hi = Math.max(sc.rhi, 0);
      sc.unit = "sig"; sc.rlo = uRound(-uOf(Math.max(S - lo, S * 0.05)), "sig") || 0.05; sc.rhi = uRound(uOf(S + hi), "sig") || 0.05;
      sc.wlo = sc.rlo; sc.whi = sc.rhi; if (Math.abs(sc.rlo - sc.rhi) > 1e-9) sc.rlink = false;
      events.push({ type: "note", aspects: [], text: "Price moves need one instrument, so the move range was converted to σ", actions: [] });
    }
    const [capLo, capHi] = rangeCaps(sc.unit, bA.na ? bA.S || 1 : bA.S);
    let note = "";
    if (sc.rlo > capLo) { sc.rlo = capLo; note = `The lower bound is capped at ${uLab(-capLo, sc.unit)}`; }
    if (sc.rhi > capHi) { sc.rhi = capHi; note = `The upper bound is capped at ${uLab(capHi, sc.unit)}`; }
    if (note && sc.rlink && Math.abs(sc.rlo - sc.rhi) > 1e-9) sc.rlink = false;
    if (sc.wlo > capLo) sc.wlo = capLo; if (sc.whi > capHi) sc.whi = capHi;
    if (note) events.push({ type: "note", aspects: [], text: note, actions: [] });
    return { S9: s, events };
  }

  const normalise = S9 => normIn(clone(S9));
  function defaults() { return sanitize9(null); }
  function sanitize9(o) {
    o = isObj(o) ? o : {};
    return normIn({ cmp: CMP.sanitize(o.cmp), scen: sanScen(o.scen), view: sanView(o.view) }).S9;
  }
  // fn edits a deep copy; then the sanitizers and the normaliser run. change() also returns normaliser notes.
  function change(S9, fn) {
    const s = clone(S9);
    if (fn) fn(s);
    return normIn({ cmp: CMP.sanitize(s.cmp), scen: sanScen(s.scen), view: sanView(s.view) });
  }
  const applyChange = (S9, fn) => change(S9, fn).S9;
  // run one CMP mutator on S9.cmp: STATE.cmpOp(S9, "setA", "values.put", 20) -> {S9, events}
  function cmpOp(S9, op, ...args) {
    const r = CMP[op](S9.cmp, ...args);
    const n = change(S9, s => { s.cmp = r.c; });
    return { S9: n.S9, events: r.events.concat(n.events) };
  }
  // apply an event action (from a toast): {S9, events}
  function applyAction(S9, action) {
    const r = action.apply(S9.cmp);
    const n = change(S9, s => { s.cmp = r.c; });
    return { S9: n.S9, events: (r.events || []).concat(n.events) };
  }
  function swap(S9) {
    const r = CMP.swap(S9.cmp);
    const n = change(S9, s => { s.cmp = r.c; s.view.pins = (s.view.pins || []).map(p => ({ SA: p.SB, SB: p.SA, dA: p.dB, dB: p.dA })); });
    return { S9: n.S9, events: r.events.concat(n.events) };
  }

  // ---------------------------------------------------------- view codes and blobs
  const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
  // "v9." + enc({t: tab, th: theme, c: S9, y: yr})
  const code = (S9, o) => "v9." + enc({ t: o && o.tab, th: o && o.theme, c: S9, y: o ? o.yr : undefined });
  const blob = (S9, o) => ({ v: 9, tab: o && o.tab, theme: o && o.theme, cmp: S9, yr: o ? o.yr : undefined });
  // a view code, with or without "#" or the page address -> {src, tab, theme, cmp, yr}; null when it is not one; throws on a bad one
  function parse(s) {
    s = String(s || "").trim().replace(/^.*#/, "");
    const m = /^v(9|8|5)\.(.*)$/.exec(s); if (!m) return null;
    const o = dec(m[2]); if (!isObj(o)) throw new Error("bad view code");
    if (m[1] === "5") return { src: "v5", tab: "compare", theme: o.theme, cmp: o, yr: undefined };
    return { src: "v" + m[1], tab: o.t, theme: o.th, cmp: o.c, yr: o.y };
  }

  // ---------------------------------------------------------- migration from v8 / v5
  const V8 = Object.freeze({ A: Object.freeze({ exp: "20261120", st: "str", pd: 30, cd: 30, capd: 17, fill: "mid" }), bexp: "20261218", bk: Object.freeze({ pd: 20, cd: 20, capd: 10 }) });
  const ALONG = ["st", "tk", "exp", "k", "fill", "free"];
  function v8pos(p, d) {
    const ids = INST.ids(), r = Object.assign({}, d);
    if (!isObj(p)) return r;
    if (ids.includes(p.tk)) r.tk = p.tk;
    if (typeof p.exp === "string" && /^\d{8}$/.test(p.exp)) r.exp = p.exp;
    if (p.st === "str" || p.st === "cap") r.st = p.st;
    if (p.fill === "mid" || p.fill === "nat") r.fill = p.fill;
    for (const k of ["pd", "cd"]) if (p[k] !== null && p[k] !== "" && Number.isFinite(+p[k])) r[k] = clamp(+p[k], 3, 90);
    if (p.capd !== null && p.capd !== "" && Number.isFinite(+p.capd)) r.capd = clamp(+p.capd, 3, 40);
    return r;
  }
  function mapPos(p, together) {
    const pos = {
      inst: { id: p.tk }, exp: p.exp, structure: "strangle", legs: together && p.pd === p.cd ? "together" : "detached", basis: "delta",
      values: { center: "atm", put: p.pd, call: p.cd }, wings: { call: { on: p.st === "cap", value: p.capd }, put: { on: false, value: 15 } }, fill: p.fill
    };
    if (together && p.pd === 50 && p.cd === 50) pos.structure = "straddle";   // v8's "nearest the forward"
    return pos;
  }
  function fromV8(o, src) {
    o = isObj(o) ? o : {};
    const ids = INST.ids(), other = id => ids.find(x => x !== id) || id;
    const link = typeof o.link === "boolean" ? o.link : true;
    const linkB = src === "v5" || typeof o.linkB !== "boolean" ? link : o.linkB;
    const pA = v8pos(o.A, Object.assign({ tk: ids[0] }, V8.A));
    {   // A's expiry must be one A's instrument lists (v8 used the union)
      const I = INST.base(pA.tk); if (!I.expiries.includes(pA.exp)) pA.exp = I.nearestExp(pA.exp);
    }
    const A = mapPos(pA, link);
    const along = ALONG.includes(o.along) ? o.along : "tk";
    const links = { inst: false, exp: true, structure: true, legs: true, placement: true, wingCall: true, wingPut: true, fill: true };
    let B = { inst: { id: other(pA.tk) } }, bTk = pA.tk;
    if (along !== "tk" && along !== "free") links.inst = true;      // v8 kept B on A's ticker in these modes
    switch (along) {
      case "tk": bTk = other(pA.tk); break;
      case "st": links.wingCall = false; B.wings = { call: { on: pA.st !== "cap", value: pA.capd } }; break;
      case "exp": {
        links.exp = false;
        const ex = INST.base(pA.tk).expiries;
        let e = typeof o.bexp === "string" && /^\d{8}$/.test(o.bexp) ? o.bexp : V8.bexp;
        if (!ex.includes(e)) e = INST.base(pA.tk).nearestExp(e);
        if (e === pA.exp) { const i = ex.indexOf(pA.exp); e = i + 1 < ex.length ? ex[i + 1] : i > 0 ? ex[i - 1] : ex[i]; }   // never wrap
        B.exp = e; break;
      }
      case "k": {
        links.placement = false; links.legs = false;
        const bk = v8pos(Object.assign({}, pA, isObj(o.bk) ? o.bk : V8.bk), pA);
        B.basis = "delta"; B.values = { center: "atm", put: bk.pd, call: bk.cd };
        B.legs = linkB && bk.pd === bk.cd ? "together" : "detached";
        const bStruct = linkB && bk.pd === 50 && bk.cd === 50 ? "straddle" : "strangle";
        if (bStruct !== A.structure) { links.structure = false; B.structure = bStruct; }
        if (pA.st === "cap" && bk.capd !== pA.capd) { links.wingCall = false; B.wings = { call: { on: true, value: bk.capd } }; }
        break;
      }
      case "fill": links.fill = false; B.fill = pA.fill === "mid" ? "nat" : "mid"; break;
      case "free": {
        const pf = isObj(o.Bf) ? v8pos(o.Bf, pA) : Object.assign({}, pA, { tk: other(pA.tk) });
        bTk = pf.tk;
        const bp = mapPos(pf, linkB);
        for (const a of CMP.ASPECTS) links[a] = false;
        B = { inst: bp.inst, exp: bp.exp, structure: bp.structure, legs: bp.legs, basis: bp.basis, values: bp.values, wings: bp.wings, fill: bp.fill };
        break;
      }
    }
    const cmp = { A, B, links, expMap: "nearest", sizing: { rule: CMP.SIZE_RULES.includes(o.size) ? o.size : "auto", h: Number.isFinite(+o.hc) && +o.hc > 0 ? +o.hc : 1 } };
    const scen = {}; for (const k of Object.keys(SCEN_DEF)) if (k in o) scen[k] = o[k];
    const view = {};
    for (const k of Object.keys(VIEW_DEF)) if (k in o && k !== "pins") view[k] = o[k];
    const SW = { pd: "put", cd: "call", capd: "wingCall", both: "both" }; if ("sweep" in o) view.sweep = SW[o.sweep] || "both";
    const OV = { capc: "wingc", capp: "wingp" }; if (o.ovm in OV) view.ovm = OV[o.ovm];
    if (fin(+o.nm) && !ENUMS.nm.includes(+o.nm)) view.nm = ENUMS.nm.reduce((b, x) => Math.abs(x - o.nm) < Math.abs(b - o.nm) ? x : b, ENUMS.nm[0]);
    view.pins = Array.isArray(o.pins) ? o.pins.filter(p => isObj(p) && isObj(p.S)).map(p => ({ SA: +p.S[pA.tk], SB: +p.S[bTk], dA: +p.dA, dB: +p.dB })) : [];
    const S9 = sanitize9({ cmp, scen, view });
    return { S9, events: [{ type: "migrated", aspects: [], text: `Loaded a ${src} view: strikes re-resolved with v9 rules`, actions: [] }] };
  }
  // STATE.migrate(code | blob) -> {S9, events, tab, theme, yr, src}
  function migrate(input) {
    if (typeof input === "string") {
      const h = parse(input); if (!h) throw new Error("not a view code");
      if (h.src === "v9") return { S9: sanitize9(h.cmp), events: [], tab: h.tab, theme: h.theme, yr: h.yr, src: "v9" };
      const r = fromV8(h.cmp, h.src);
      return Object.assign(r, { tab: h.src === "v8" ? h.tab : "compare", theme: h.theme, yr: h.src === "v8" ? h.yr : undefined, src: h.src });
    }
    if (!isObj(input)) return { S9: defaults(), events: [], tab: "compare", theme: "auto", yr: undefined, src: "none" };
    if (input.v === 9) return { S9: sanitize9(input.cmp), events: [], tab: input.tab, theme: input.theme, yr: input.yr, src: "v9" };
    if (input.v === 8) return Object.assign(fromV8(input.cmp, "v8"), { tab: input.tab, theme: input.theme, yr: input.yr, src: "v8" });
    return Object.assign(fromV8(input, "v5"), { tab: "compare", theme: input.theme, yr: undefined, src: "v5" });   // the rk-lab-v5 store holds the bare state
  }

  return Object.freeze({
    SCEN_DEF, VIEW_DEF, ENUMS, UNAME, uStep, uRound, rangeCaps, uLab,
    defaults, sanitize9, sanScen, sanView, normalise, change, applyChange, cmpOp, applyAction, swap,
    migrate, parse, code, blob, enc, dec
  });
})();
