// ============================================================ ui9_views: the comparer's view panels (v9)
// Panels: overview, payoff + comparison table, P&L grid + pins + numbers, joint moves, strike sweep, recovery
// dynamics, smile + leg popover, notes. They read only the render context C (CTX.ctx9), the S9 scenario and view
// state, and INST. Every position name comes from built.label; every strike loop runs over b.legs.
// Page contract: wireViews({host, getS9, setS9, onEvents}) once, then renderViews(C) on every render.
// State changes go through STATE.change / STATE.cmpOp and the page's setS9, then refresh() (ui_common8).
const VIEWS = (() => {
  let C = null, HOST = null;
  const VSYNC = [];
  const HOOK = { get: () => getS9(), set: s => setS9(s), onEvents: null };
  const q = s => HOST.querySelector(s);
  const S = () => HOOK.get();
  const V = () => S().view, SC = () => S().scen;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safe = (f, n) => { try { f(); } catch (e) { console.error("views: " + n, e); } };

  // ---------------------------------------------------------- state changes and events
  let toastT = 0;
  function emit(events) {
    const ev = (events || []).filter(e => e && e.text);
    if (!ev.length) return;
    if (typeof HOOK.onEvents === "function") return HOOK.onEvents(ev);
    if (typeof showEvents === "function") return showEvents(ev);   // the page's shared toast handler, when it has one
    const t = document.querySelector("#toast"); if (!t) return;
    t.innerHTML = ev.map((e, i) => `<span class="vt">${esc(e.text)}${(e.actions || []).map((a, j) => ` <button type="button" class="tbtn" data-e="${i}" data-a="${j}">${esc(a.label)}</button>`).join("")}</span>`).join(" · ");
    t.hidden = false;
    t.onclick = e => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      const r = STATE.applyAction(S(), ev[+b.dataset.e].actions[+b.dataset.a]);
      HOOK.set(r.S9); t.hidden = true; emit(r.events); refresh();
    };
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; t.onclick = null; }, 4000);
  }
  function change(fn) { const r = STATE.change(S(), fn); HOOK.set(r.S9); emit(r.events); }
  const setView = (k, v) => change(s => { s.view[k] = v; });
  const setScen = (k, v) => change(s => { s.scen[k] = v; });
  function op(name, ...args) { const r = STATE.cmpOp(S(), name, ...args); HOOK.set(r.S9); emit(r.events); return r; }

  // ---------------------------------------------------------- formatting on the current context
  const fU = (v, d) => C.fU(v, d), fUt = (t, s) => C.fUt(t, s), uLab = (u, unit, d) => STATE.uLab(u, unit, d);
  const hTxt = () => C.hTxt(), hb = () => Math.abs(C.h - 1) > 0.005 ? ` ×${C.h.toFixed(2)}` : "";
  const trow = (label, v, cls) => `<span class="r"><span class="k">${cls ? `<i class="sw" style="background:var(--${cls})"></i>` : ""}${label}</span><span class="v ${pn(v)}">${fU(v)}</span></span>`;
  // the sign class follows the printed value: C.fU prints a value that rounds to zero as an unsigned, uncoloured 0
  const pn = (v, d) => { const t = fU(v, d); return t.charAt(0) === MINUS ? "neg" : t.charAt(0) === "+" ? "pos" : ""; };
  // instrument names per side; when A and B are the same ticker on different inputs (an override), "A KORU" / "B KORU ✎"
  const twin = () => !C.same && C.A.tk === C.B.tk;
  const tkOf = side => { const b = side === "A" ? C.A : C.B, I = side === "A" ? C.instA : C.instB; return twin() ? `${side} ${b.tk}${I && I.overridden ? " ✎" : ""}` : b.tk; };
  const tkS = side => twin() ? side : (side === "A" ? C.A : C.B).tk;
  const key = t => `<span class="key ${t === "D" ? "d" : t.toLowerCase()}">${t}</span>`;
  const legTag = l => (l.qty > 0 ? "+" : "") + fK(l.K) + l.cp;
  const legsOf = b => b && !b.na ? b.legs : [];
  const legsTxt = b => !b || b.na ? "n/a" : b.legs.map(legTag).join(" / ");
  const structTxt = b => b.na ? `n/a: ${b.naReason}` : b.label.struct + (b.label.wings ? " " + b.label.wings : "");
  const levTxt = () => INST.list().map(x => `${x.id} ${x.lev}×`).join(", ");
  const diffExp = () => C.A.exp !== C.B.exp;
  const sigWord = () => C.unit === "sig" && C.sigAxisLabel !== "σ" ? ` (${C.sigAxisLabel})` : "";
  // a position marks to the same trade: same instrument version, expiry, legs and fill
  const sameTrade = (x, y) => !!x && !!y && !x.na && !y.na && x.inst.version === y.inst.version && x.exp === y.exp && x.fill === y.fill &&
    x.legs.length === y.legs.length && x.legs.every((l, k) => l.role === y.legs[k].role && l.K === y.legs[k].K);
  // colours from CSS tokens in any CSS colour syntax, as [r, g, b]
  let CV = null;
  function rgbOf(name) {
    const v = css(name) || "#888";
    if (!CV) { const c = document.createElement("canvas"); c.width = c.height = 1; CV = c.getContext("2d", { willReadFrequently: true }); }
    CV.clearRect(0, 0, 1, 1); CV.fillStyle = "#000"; CV.fillStyle = v; CV.fillRect(0, 0, 1, 1);
    const d = CV.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  }

  // ---------------------------------------------------------- the sticky offset for table keys (just below the summary)
  function stickTop() {
    let top = 0;
    const look = el => {
      const cs = getComputedStyle(el); if (cs.position !== "sticky" && cs.position !== "fixed") return;
      const t = parseFloat(cs.top); if (!Number.isFinite(t) || t > 240) return;
      const r = el.getBoundingClientRect(); if (r.height > 260 || r.width < innerWidth * 0.4) return;
      top = Math.max(top, t + r.height);
    };
    for (let n = HOST; n && n !== document.body; n = n.parentElement)
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) { look(s); for (const c of s.children) { look(c); for (const g of c.children) look(g); } }
    return top;
  }
  const setStick = () => { if (HOST) HOST.style.setProperty("--v9-stick", Math.round(stickTop()) + "px"); };

  // ============================================================ overview: every instrument × expiry, with and without wings
  // the second series shows A's wings when A has any, else A's position with a protective call at A's call-wing value
  function ovVariants(Ap) {
    const w = Ap.wings, any = !!(w.call.on || w.put.on);
    const off = { call: { on: false, value: +w.call.value }, put: { on: false, value: +w.put.value } };
    const on = any ? { call: { on: !!w.call.on, value: +w.call.value }, put: { on: !!w.put.on, value: +w.put.value } } : { call: { on: true, value: +w.call.value }, put: { on: false, value: +w.put.value } };
    const word = on.call.on && on.put.on ? "+ both wings" : on.call.on ? "+ call wing" : "+ put wing";
    return [{ key: "plain", wings: off, word: "" }, { key: "wing", wings: on, word }];
  }
  // A's instrument slot keeps A's overrides, B's keeps B's; any other instrument is loaded at its listed spot
  const ovSlot = (Cx, id) => id === Cx.Ap.inst.id ? Cx.Ap.inst : id === Cx.Bp.inst.id ? Cx.Bp.inst : { id };
  function ovCells(Cx) {
    const vars = ovVariants(Cx.Ap), out = [];
    INST.list().forEach((it, i) => {
      const slot = ovSlot(Cx, it.id), I = INST.make(slot); if (!I) return;
      vars.forEach((vr, j) => {
        for (const e of I.expiries) {
          const b = POS.build(Object.assign({}, Cx.Ap, { inst: slot, exp: e, wings: vr.wings }));
          out.push({ id: it.id, slot, i, j, vword: vr.word, wings: vr.wings, e, dte: b.dte, b, sx: b.na ? null : Cx.sFor(b, Cx.ax.toS(b)) });
        }
      });
    });
    return out;
  }
  const ovCount = () => INST.list().reduce((t, it) => { const I = INST.base(it.id); return t + (I ? I.expiries.length * 2 : 0); }, 0);
  const OVM = {
    cr: { l: "Credit", f: b => b.tv / b.S, kind: "money" },
    crs: { l: "Credit/σ", f: b => b.tv / (b.S * b.sig), kind: "ratio", fmt: v => fN(v, 3), tip: "Credit ÷ (spot × ATM IV × √T): credit per unit of the expiry's own implied move, σ to its own expiry. In-the-money legs count time value only" },
    crd: { l: "Credit per day", f: b => b.tv / b.S / b.dte, kind: "money", d: 3 },
    ev: { l: "Expected value · HV30", f: b => { const s = C.statsHV(b); return s ? s.ev / b.S : NaN; }, kind: "money", d: 2, zero: true },
    pop: { l: "Profit odds", f: (b, s) => s.pop, kind: "pct" },
    worst: { l: "Worst loss in range", f: (b, s) => s.worst / b.S, kind: "money", zero: true, tip: "Worst expiry P&L over the worst-loss range; a positive value means no loss anywhere in the range" },
    wingc: { l: "Wing cost", f: b => b.wingPx > 0 ? b.wingPx / b.S : NaN, kind: "money", tip: "Premium paid for the protective wings; positions with a wing only" },
    wingp: { l: "Wing pays odds", f: (b, s) => b.cap ? s.pCap : b.capP ? s.pCapP : NaN, kind: "pct", tip: "Odds that spot ends beyond the wing strike plus its premium, where the wing has paid for itself (the call wing; the put wing when there is no call wing)" },
    rom: { l: "Credit / margin", f: b => b.tv / b.margin, kind: "pct", tip: "" }
  };
  const serStyle = (i, j) => { const c = i % 2 ? "var(--ink-3)" : "var(--ink)"; return { col: c, dash: j ? "5 4" : "", shape: i % 2 ? "s" : "c", fill: j ? "var(--surface)" : c, off: [-5, -1.7, 1.7, 5][(i * 2 + j) % 4] }; };
  // series name from the resolved kinds of its points, never from the targets
  function serName(cells, i, j) {
    const cs = cells.filter(c => c.i === i && c.j === j), kinds = [...new Set(cs.filter(c => !c.b.na).map(c => c.b.kind))];
    return `${cs.length ? cs[0].id : ""} ${kinds.join(" / ") || "n/a"}${cs.length && cs[0].vword ? " " + cs[0].vword : ""}`;
  }
  function fOwn(v, b, M, plain) {
    if (!Number.isFinite(v)) return "–";
    if (M.kind === "ratio") return M.fmt(v);
    if (M.kind === "pct") return fP(v, 0);
    const x = v * b.S * 100, usd = ` <span class="muted">${x < 0 ? MINUS : ""}$${Math.abs(x).toFixed(Math.abs(x) < 10 ? 2 : 0)}</span>`;
    return (M.zero ? fS : fP)(v, M.d ?? 1) + (plain ? "" : usd);
  }
  const mk = (sh, x, y, r, fill, col) => sh === "c" ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${col}" stroke-width="1.6"/>` : `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="${col}" stroke-width="1.6"/>`;
  const wingFlag = b => b.na ? null : b.flags.find(f => f.code === "WING_NA");
  const cellDesc = c => `${c.b.label.full}${wingFlag(c.b) ? ` <span class="warnc">! ${esc(wingFlag(c.b).text)}</span>` : ""}`;
  function setFromCell(side, c) {
    const w = c.wings, wing = s => w[s].on ? { on: true, value: w[s].value } : false;
    op("setFrom", side, { inst: c.slot, exp: c.e, wings: { call: wing("call"), put: wing("put") } });
    refresh();
  }
  let OV = [];
  function renderOverview() {
    const P = q("#p-over");
    q("#ov-title").textContent = `Overview of all ${ovCount()} positions`;
    q("#ov-sub").textContent = `${INST.list().map(x => x.id).join(" and ")}, every listed expiry, with and without wings · open to scan and pick A or B`;
    if (!P.open) return;
    const vw = V(), table = vw.ovv === "table";
    OV = ovCells(C);
    const isA = c => sameTrade(c.b, C.A), isB = c => sameTrade(c.b, C.B), bOwnOn = !C.B.na && !OV.some(isB);
    q("#ovgrid").hidden = table; q("#ovtable").hidden = !table; q("#ovlgd").hidden = table;
    const nI = INST.list().length;
    let lg = "";
    for (let i = 0; i < nI; i++) for (let j = 0; j < 2; j++) { const y = serStyle(i, j); lg += `<span><svg width="30" height="12" aria-hidden="true"><line x1="0" x2="30" y1="6" y2="6" stroke="${y.col}" stroke-width="1.8" stroke-dasharray="${y.dash}"/>${mk(y.shape, 15, 6, 3.5, y.fill, y.col)}</svg>${esc(serName(OV, i, j))}</span>`; }
    q("#ovlgd").innerHTML = lg + `<span><svg width="20" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--a)" stroke-width="2"/></svg>A <svg width="20" height="14" aria-hidden="true" style="margin-left:6px"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--b)" stroke-width="2"/></svg>B</span>`;
    const Ap = C.Ap, place = Ap.structure === "straddle" ? (Ap.values.center === "atm" ? "the strike nearest the forward" : `center ${RULE.fmtV(+Ap.values.center, Ap.basis)}`) : `${RULE.fmtV(+Ap.values.put, Ap.basis)} put, ${RULE.fmtV(+Ap.values.call, Ap.basis)} call`;
    q("#ovcap").innerHTML = `Each point is A's ${Ap.structure} placed by A's rule (${place}) and filled at ${Ap.fill === "mid" ? "mid" : "natural"}, on each instrument's own chain${bOwnOn ? "; B differs from every point, so it is drawn as its own orange point" : ""}. Values are % of each position's own notional, $ per contract in the tooltips. Profit odds are ${SC().dist === "rn" ? "implied" : "HV30"}; EV always uses HV30, since under implied odds it is just fill vs mid. Worst loss covers ${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}${C.unit === "sig" ? " (each instrument's σ over A's horizon)" : C.unit === "pts" ? ` on ${C.A.tk}, the same % elsewhere` : ""}.`;
    if (table) return renderOvTable(isA, isB);
    const host = q("#ovgrid"); host.innerHTML = "";
    const dts = [...new Set(OV.map(c => c.dte).filter(Number.isFinite))].sort((a, b) => a - b), expAt = d => OV.find(c => c.dte === d).e;
    const anyI = OV.some(c => !c.b.na && c.b.intr > 0) || (bOwnOn && C.B.intr > 0);
    OVM.rom.tip = `Approximate margin: Reg-T style, 20% × leverage (${levTxt()}). In-the-money legs count time value only`;
    for (const k of Object.keys(OVM)) {
      const M0 = OVM[k], M = k === "cr" && anyI ? Object.assign({}, M0, { l: "Credit, time value", tip: "Credit minus intrinsic value at entry; for out-of-the-money legs it is the whole credit. Cash credit is in the tooltip" }) : M0;
      const box = document.createElement("span"); box.className = "ovc"; host.appendChild(box);
      box.innerHTML = `<h3>${M.l}${M.tip ? `<span class="info" tabindex="0" data-tip="${esc(M.tip)}">i</span>` : ""}</h3>`;
      const W = Math.max(box.clientWidth, 220), Hh = 162, m = { l: 48, r: 12, t: 12, b: 32 };
      const vals = OV.map(c => Object.assign({}, c, { v: c.b.na || !c.sx ? NaN : M.f(c.b, c.sx) }));
      const own = bOwnOn ? { b: C.B, sx: C.sb, own: true, dte: C.B.dte, v: C.sb ? M.f(C.B, C.sb) : NaN } : null;
      const fin = vals.concat(own ? [own] : []).map(p => p.v).filter(Number.isFinite);
      if (!fin.length) { box.insertAdjacentHTML("beforeend", `<span class="gna" style="padding:40px 0">no values</span>`); continue; }
      let lo = Math.min(...fin), hi = Math.max(...fin); if (M.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 0.01; lo -= pad; hi += pad;
      const X = (dte, off) => m.l + 14 + Math.max(0, dts.indexOf(dte)) / Math.max(1, dts.length - 1) * (W - m.l - m.r - 28) + (off || 0), Y = v => m.t + (hi - v) / (hi - lo) * (Hh - m.t - m.b);
      const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": `${M.l} for every position by expiry` }, box), ax = el("g", { class: "ax" }, svg);
      const yt = ticks(lo, hi, 4), ys = (yt[1] - yt[0]) * 100;
      for (const t of yt) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 6, Y(t) + 3.5, M.kind === "ratio" ? fN(t, 2) : fP(t, ys >= 1 ? 0 : ys >= 0.1 ? 1 : 2), { "text-anchor": "end" }); }
      if (lo < 0 && hi > 0) el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg);
      dts.forEach(d => { txt(ax, X(d), Hh - 16, fmtE(expAt(d)).replace(/ ’\d\d$/, ""), { "text-anchor": "middle", style: "fill:var(--ink-2)" }); txt(ax, X(d), Hh - 4, `${d}d`, { "text-anchor": "middle", style: "font-size:9.5px" }); });
      for (let i = 0; i < nI; i++) for (let j = 0; j < 2; j++) {
        const sty = serStyle(i, j), pts = vals.filter(c => c.i === i && c.j === j).sort((a, b) => a.dte - b.dte);
        el("path", { d: pathOf(pts.map(c => [c.dte, c.v]), d => X(d, sty.off), Y), fill: "none", stroke: sty.col, "stroke-width": 1.8, "stroke-dasharray": sty.dash }, svg);
      }
      const pts = [];
      for (const p of vals) {
        const sty = serStyle(p.i, p.j), x = X(p.dte, sty.off);
        if (!Number.isFinite(p.v)) { if (p.b.na || (k.startsWith("wing") && p.j)) { const y = Hh - m.b - 4; svg.insertAdjacentHTML("beforeend", `<text x="${x}" y="${y}" text-anchor="middle" style="font:600 10px var(--f-ui);fill:${sty.col}">×</text>`); pts.push({ p, x, y }); } continue; }
        const y = Y(p.v); svg.insertAdjacentHTML("beforeend", mk(sty.shape, x, y, 3.6, sty.fill, sty.col)); pts.push({ p, x, y });
      }
      if (own && Number.isFinite(own.v)) { const x = X(own.dte, 8), y = Y(own.v); el("circle", { cx: x, cy: y, r: 3.6, fill: "var(--b)" }, svg); pts.push({ p: own, x, y }); }
      const aPt = pts.find(t => !t.p.own && isA(t.p)), bPt = own ? pts.find(t => t.p.own) : pts.find(t => !t.p.own && isB(t.p));
      if (bPt) el("circle", { cx: bPt.x, cy: bPt.y, r: aPt && Math.hypot(aPt.x - bPt.x, aPt.y - bPt.y) < 4 ? 11.5 : 8, fill: "none", stroke: "var(--b)", "stroke-width": 2.2 }, svg);
      if (aPt) el("circle", { cx: aPt.x, cy: aPt.y, r: 8, fill: "none", stroke: "var(--a)", "stroke-width": 2.2 }, svg);
      const hov = el("circle", { r: 10, fill: "none", stroke: "var(--ink-2)", "stroke-width": 1, visibility: "hidden" }, svg);
      const hit = el("rect", { x: 0, y: 0, width: W, height: Hh - m.b + 6, fill: "transparent", style: "cursor:pointer" }, svg);
      const near = (ev, rad) => { const r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * W / r.width, my = (ev.clientY - r.top) * Hh / r.height; return pts.map(t => Object.assign({}, t, { dd: Math.hypot(t.x - mx, t.y - my) })).filter(t => t.dd <= rad).sort((a, b) => a.dd - b.dd); };
      const cands = n => n.filter(t => !t.p.own);
      hit.addEventListener("pointermove", ev => {
        const n = near(ev, 16); if (!n.length) { hov.setAttribute("visibility", "hidden"); hideTip(); return; }
        const t = n[0], c = cands(n), b = t.p.b; hov.setAttribute("cx", t.x); hov.setAttribute("cy", t.y); hov.setAttribute("visibility", "visible");
        showTip(`<span class="h">${t.p.own ? "B: " : ""}${esc(b.label.full)}</span>${wingFlag(b) ? `<span class="s">! ${esc(wingFlag(b).text)}</span>` : ""}${krow(M.l, b.na ? "n/a" : fOwn(t.p.v, b, M))}${k === "cr" && !b.na && b.intr > 0 ? krow("Cash credit", fOwn(b.cr / b.S, b, M)) : ""}<span class="s" style="margin:4px 0 0">${t.p.own ? "B's own position; edit B in Positions" + (c.length ? " · click to pick a nearby position" : "") : "click to set as A or B"}${c.length > 1 ? ` · ${c.length} positions here` : ""}</span>`, ev.clientX, ev.clientY);
      });
      hit.addEventListener("pointerleave", () => { hov.setAttribute("visibility", "hidden"); hideTip(); });
      hit.addEventListener("click", ev => {
        ev.stopPropagation(); const close = cands(near(ev, 16)); if (!close.length) return;
        const html = close.map((t, i) => { const a = isA(t.p), bb = isB(t.p); return `<span class="cand"><span class="h">${cellDesc(t.p)}</span><span class="s">${t.p.b.na ? "n/a: " + esc(t.p.b.naReason) : `${M.l} ${fOwn(t.p.v, t.p.b, M, true)}`}</span><span class="btns"><button type="button" data-i="${i}" data-set="A"${a ? " disabled" : ""}>${key("A")}Set as A</button><button type="button" data-i="${i}" data-set="B"${bb ? " disabled" : ""}>${key("B")}Set as B</button></span></span>`; }).join("");
        openPopAt(html, ev.clientX, ev.clientY, e => { const b = e.target.closest("button[data-set]"); if (!b || b.disabled) return; $("#pop").hidden = true; setFromCell(b.dataset.set, close[+b.dataset.i].p); });
      });
    }
  }
  function renderOvTable(isA, isB) {
    const cols = [OV.some(c => !c.b.na && c.b.intr > 0) ? "Credit, time value" : "Credit", "Credit / σ", "Credit per day", "EV (HV30)", "Profit odds", "Worst loss", "Wing cost · pays odds", "Credit / margin", "Breakevens"];
    let h = `<thead><tr><th class="st l">Set</th><th class="st2 l">Position</th>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    const order = OV.map((c, i) => Object.assign({ idx: i }, c)).sort((a, b) => a.dte - b.dte || a.j - b.j || a.i - b.i);
    let lastD = null;
    for (const c of order) {
      const b = c.b, x = c.sx, a = isA(c), bb = isB(c), sep = lastD !== null && c.dte !== lastD; lastD = c.dte;
      const cls = `${sep ? "sep" : ""} ${a ? "isA" : ""} ${bb ? "isB" : ""}`;
      const btns = `<button type="button" data-i="${c.idx}" data-set="A"${a ? " disabled" : ""} title="Set as A">A</button> <button type="button" data-i="${c.idx}" data-set="B"${bb ? " disabled" : ""} title="Set as B">B</button>`;
      const wf = wingFlag(b), name = `<span title="${esc(b.label.full)}">${esc(b.label.short)}</span><small>${esc(b.na ? "n/a" : b.label.tab.slice(b.tk.length + 1))}${wf ? `<span class="warnc wn" title="${esc(wf.text)}">! ${wf.leg === "wingPut" ? "put" : "call"} wing n/a</span>` : ""}</small>`;
      if (b.na || !x) { h += `<tr class="${cls}"><td class="st">${btns}</td><td class="st2 l">${name}</td><td class="l" colspan="${cols.length}">n/a: ${esc(b.naReason)}</td></tr>`; continue; }
      const o = (k, v) => fOwn(v, b, OVM[k], true), hv = C.statsHV(b);
      const cash = b.intr > 0 ? ` <span class="muted">cash ${o("cr", b.cr / b.S)}</span>` : "";
      const wp = OVM.wingp.f(b, x);
      h += `<tr class="${cls}" title="${esc(b.label.full)} · $ per contract: ${b.cr < 0 ? "net debit" : "credit"} $${Math.abs(b.cr * 100).toFixed(0)}${b.intr > 0 ? `, time value $${(b.tv * 100).toFixed(0)}` : ""}, EV (HV30) $${hv ? (hv.ev * 100).toFixed(0) : "–"}, worst $${(x.worst * 100).toFixed(0)}"><td class="st">${btns}</td><td class="st2 l">${name}</td><td>${o("cr", b.tv / b.S)}${cash}</td><td>${fN(b.tv / (b.S * b.sig), 3)}</td><td>${o("crd", b.tv / b.S / b.dte)}</td><td>${hv ? o("ev", hv.ev / b.S) : "–"}</td><td>${fP(x.pop, 0)}</td><td>${o("worst", x.worst / b.S)}</td><td>${b.wingPx > 0 ? `${o("wingc", b.wingPx / b.S)} · ${Number.isFinite(wp) ? fP(wp, 0) : "–"}` : "–"}</td><td>${fP(b.tv / b.margin, 1)}</td><td>${x.bes.length ? x.bes.map(fPx2).join(" / ") : "none"}</td></tr>`;
    }
    q("#full").innerHTML = h + "</tbody>";
  }

  // ============================================================ payoff at expiry + comparison numbers
  function sigmaMarks() {
    const out = [], { A, B } = C;
    for (const k of [-2, -1, 1, 2]) {
      const lab = (k > 0 ? "+" : MINUS) + Math.abs(k) + "σ";
      const u = C.uOfSA(A.S * Math.exp(k * C.sA)); if (u > C.lo && u < C.hi) out.push([u, lab + (C.same || C.unit === "sig" ? "" : " " + tkS("A")), "a"]);
      if (!C.same && C.unit !== "sig") { const v = C.uOfSB(B.S * Math.exp(k * C.sB)); if (v > C.lo && v < C.hi) out.push([v, lab + " " + tkS("B"), "b"]); }
    }
    return out;
  }
  function oddsStrip(svg, d, xOf, lo, hi, t, X, y0, h, label) {
    const nd = 160, dens = []; for (let i = 0; i < nd; i++) { const ua = lo + (hi - lo) * i / nd, ub = lo + (hi - lo) * (i + 1) / nd; dens.push([(ua + ub) / 2, cdfAt(d, xOf(ub), t) - cdfAt(d, xOf(ua), t)]); }
    const dm = Math.max(...dens.map(p => p[1]), 1e-9); let dd = `M${X(lo)} ${y0 + h}`; for (const [u, v] of dens) dd += `L${X(u).toFixed(1)} ${(y0 + h - v / dm * (h - 2)).toFixed(1)}`; dd += `L${X(hi)} ${y0 + h}Z`;
    el("path", { d: dd, fill: "var(--ink-3)", "fill-opacity": .3 }, svg); txt(svg, X(lo) - 6, y0 + h - 3, label, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
  }
  const LAST = {};
  function renderPayoff() {
    const host = q("#pay"); host.innerHTML = "";
    const { A, B, lo, hi } = C, vw = V(), W = Math.max(host.clientWidth, 600), two = !C.same;
    const n = 600, us = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
    const kinks = [];
    for (const [b, inv] of [[A, C.uOfSA], [B, C.uOfSB]]) for (const K of legsOf(b).map(l => l.K)) { const u = inv(K); if (u > lo && u < hi) kinks.push(u); }
    LAST.payKinks = kinks.slice();
    const ux = [...us, ...kinks].sort((p, r) => p - r);
    const a = ux.map(u => [u, C.pA(u)]), b = ux.map(u => [u, C.pB(u)]), df = ux.map(u => [u, C.pA(u) - C.pB(u)]);
    const ys = [...a, ...b].map(p => p[1]).filter(Number.isFinite);
    let ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0); const pad = (yhi - ylo) * 0.08 || 0.01; ylo -= pad; yhi += pad;
    const dys = df.map(p => p[1]).filter(Number.isFinite); let dlo = Math.min(...dys, 0), dhi = Math.max(...dys, 0); const dp = (dhi - dlo) * 0.14 || 0.005; dlo -= dp; dhi += dp;
    const H1 = 270, H2 = 92, nStrip = vw.pso ? (two || diffExp() ? 2 : 1) : 0, H3 = nStrip * 22, gap = 14, m = { l: 62, r: 54, t: two && C.unit !== "sig" ? 28 : 16, b: two ? 52 : 40 };
    const y1 = m.t, y2 = y1 + H1 + gap, y3 = y2 + H2 + (H3 ? gap : 0), H = y3 + H3 + m.b;
    const X = u => m.l + (u - lo) / (hi - lo) * (W - m.l - m.r), Y = v => y1 + (yhi - v) / (yhi - ylo) * H1, Y2 = v => y2 + (dhi - v) / (dhi - dlo) * H2;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Payoff at expiry for A, B and the pair" }, host), ax = el("g", { class: "ax" }, svg);
    const t1 = ticks(ylo, yhi, 6), t2 = ticks(dlo, dhi, 3);
    for (const t of t1) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 6, Y(t) + 3.5, fUt(t, t1[1] - t1[0] || 0.01), { "text-anchor": "end" }); }
    for (const t of t2) { el("line", { x1: m.l, x2: W - m.r, y1: Y2(t), y2: Y2(t) }, ax); txt(ax, m.l - 6, Y2(t) + 3.5, fUt(t, t2[1] - t2[0] || 0.01), { "text-anchor": "end" }); }
    const yb = y3 + H3 + 14;
    for (const u of axisTicks(lo, hi, Math.floor(W / 85))) { const x = X(u), an = x - m.l < 18 ? "start" : W - m.r - x < 18 ? "end" : "middle"; el("line", { x1: x, x2: x, y1: y1, y2: y3 + H3 }, ax); txt(ax, x, yb, uLab(u, C.unit), { "text-anchor": an }); txt(ax, x, yb + 13, fPx(C.toSA(u)), { "text-anchor": an, style: "font-size:9.5px" }); if (two) txt(ax, x, yb + 26, fPx(C.toSB(u)), { "text-anchor": an, style: "font-size:9.5px" }); }
    txt(svg, m.l - 8, yb, "move", { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 }); txt(svg, m.l - 8, yb + 13, two ? tkOf("A") : A.tk, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 }); if (two) txt(svg, m.l - 8, yb + 26, tkOf("B"), { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
    if (sigWord()) txt(svg, W - m.r, yb + (two ? 39 : 26), `move in ${C.sigAxisLabel}`, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
    // in % or price units the σ marks still use A's horizon: say so when the expiries differ
    else if (vw.pss && C.sigAxisLabel !== "σ") txt(svg, W - m.r, yb + (two ? 39 : 26), `±1σ, ±2σ marks: ${C.sigAxisLabel}`, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg); el("line", { x1: m.l, x2: W - m.r, y1: Y2(0), y2: Y2(0), stroke: "var(--ink-3)" }, svg);
    if (vw.pss) sigmaMarks().forEach(([u, l, who]) => { el("line", { x1: X(u), x2: X(u), y1: y1, y2: y3 + H3, stroke: who === "b" ? "var(--b)" : "var(--ink-3)", "stroke-dasharray": "2 3", "stroke-opacity": who === "b" ? .7 : 1 }, svg); txt(svg, X(u), y1 - 4 - (who === "b" ? 12 : 0), l, { "text-anchor": "middle", fill: who === "b" ? "var(--b)" : "var(--ink-3)", "font-size": 10, ...halo }); });
    const z = Y2(0); let dPos = "", dNeg = "";
    for (let i = 0; i < df.length - 1; i++) { const [xa, va] = df[i], [xb, vb] = df[i + 1]; if (!Number.isFinite(va) || !Number.isFinite(vb)) continue; const s = `M${X(xa).toFixed(1)} ${z}L${X(xa).toFixed(1)} ${Y2(va).toFixed(1)}L${X(xb).toFixed(1)} ${Y2(vb).toFixed(1)}L${X(xb).toFixed(1)} ${z}Z`; if ((va + vb) / 2 >= 0) dPos += s; else dNeg += s; }
    el("path", { d: dPos, fill: "var(--pos)", "fill-opacity": .22 }, svg); el("path", { d: dNeg, fill: "var(--neg)", "fill-opacity": .22 }, svg);
    el("path", { d: pathOf(df, X, Y2), fill: "none", stroke: "var(--ink)", "stroke-width": 1.5 }, svg);
    // odds strips: each position's own distribution, to its own expiry
    const horizon = (b, y) => { if (diffExp()) txt(svg, W - m.r - 4, y + 17, "to " + fmtE(b.exp), { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10, ...halo }); };
    if (nStrip && !A.na && C.d) { oddsStrip(svg, C.d, C.xA, lo, hi, A.T, X, y3, 20, nStrip > 1 ? `${tkS("A")} odds` : "odds"); horizon(A, y3); }
    if (nStrip > 1 && !B.na && C.dB) { oddsStrip(svg, C.dB, C.xB, lo, hi, B.T, X, y3 + 22, 20, `${tkS("B")} odds`); horizon(B, y3 + 22); }
    el("path", { d: pathOf(b, X, Y), fill: "none", stroke: "var(--b)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    el("path", { d: pathOf(a, X, Y), fill: "none", stroke: "var(--a)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-dasharray": C.diff.identical ? "6 4" : "" }, svg);
    const dl = df.filter(p => Number.isFinite(p[1])), leftHigh = dl.length && dl[0][1] > (dlo + dhi) / 2;
    txt(svg, m.l + 6, leftHigh ? y2 + H2 - 6 : y2 + 13, `A − ${hTxt()}`, { fill: "var(--ink)", "font-size": 11.5, "font-weight": 600, ...halo });
    const endLab = (pts, s, col, other) => { const p = pts[pts.length - 1], o = other[other.length - 1]; if (!p || !Number.isFinite(p[1])) return; const above = !Number.isFinite(o[1]) || p[1] >= o[1]; txt(svg, W - m.r + 5, Y(p[1]) + (above ? -2 : 10) + 4, s, { "text-anchor": "start", fill: `var(--${col})`, "font-size": 11.5, "font-weight": 600, ...halo }); };
    if (C.diff.identical && !hb()) endLab(a, "A = B", "ink", a); else { endLab(a, "A", "a", b); endLab(b, "B" + hb(), "b", a); }
    const naSides = [["A", A], ["B", B]].filter(([, x]) => x.na);
    if (naSides.length) txt(svg, m.l + 10, y1 + 18, naSides.map(([t, x]) => `${t} is n/a: ${x.naReason}`).join(" · "), { fill: "var(--neg)", "font-size": 12, "font-weight": 600, ...halo });
    q("#pay-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A ${esc(C.labels.A.full)}</span> <span><i style="background:var(--b)"></i>B${hb()} ${esc(C.labels.B.full)}</span>${C.diff.identical ? ` <span class="vnote">A and B are the same trade</span>` : ""}${C.unitsNote ? ` <span class="badge">${esc(C.unitsNote)}</span>` : ""}`;
    const cross = el("line", { y1: y1, y2: y3 + H3, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const dots = ["a", "b", "ink"].map(c => el("circle", { r: 4, fill: `var(--${c})`, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg));
    const hit = el("rect", { x: m.l, y: y1, width: W - m.l - m.r, height: y3 + H3 - y1, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, u = clamp(lo + (px - m.l) / (W - m.l - m.r) * (hi - lo), lo, hi);
      cross.setAttribute("x1", X(u)); cross.setAttribute("x2", X(u)); cross.setAttribute("visibility", "visible");
      const va = C.pA(u), vb = C.pB(u), vd = va - vb;
      [[va, Y], [vb, Y], [vd, Y2]].forEach(([v, f], i) => { if (Number.isFinite(v)) { dots[i].setAttribute("cx", X(u)); dots[i].setAttribute("cy", f(v)); dots[i].setAttribute("visibility", "visible"); } else dots[i].setAttribute("visibility", "hidden"); });
      showTip(`<span class="h">${uLab(u, C.unit, 2)} · ${C.same ? A.tk : tkOf("A")} ${fPx2(C.toSA(u))} <span class="muted">${fS(C.toSA(u) / A.S - 1, 1)}</span></span>${C.same ? "" : `<span class="s">${tkOf("B")} ${fPx2(C.toSB(u))} (${fS(C.toSB(u) / B.S - 1, 1)})</span>`}${trow("A", va, "a")}${trow("B" + hb(), vb, "b")}${trow("A − " + hTxt(), vd, "ink")}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dots.forEach(d => d.setAttribute("visibility", "hidden")); });
  }
  // pair worst loss over the worst-loss range when one price drives both (same instrument and expiry)
  function pairWorst(Cx, a, b, h) {
    if (!a || !b || a.na || b.na) return NaN;
    const us = []; for (let i = 0; i <= 400; i++) us.push(Cx.wlo + (Cx.whi - Cx.wlo) * i / 400);
    for (const [p, inv] of [[a, Cx.uOfSA], [b, Cx.uOfSB]]) for (const l of p.legs) { const u = inv(l.K); if (u > Cx.wlo && u < Cx.whi) us.push(u); }
    let w = Infinity; for (const u of us) w = Math.min(w, POS.payoff(a, Cx.toSA(u)) / a.S - h * POS.payoff(b, Cx.toSB(u)) / b.S); return w;
  }
  function pairPop(Cx) {
    const d = Cx.d, A = Cx.A, B = Cx.B; if (A.na || B.na || !d) return NaN; let pop = 0;
    const eps = 1e-9;
    for (let i = 1; i <= d.n; i++) { const mm = d.cdf[i] - d.cdf[i - 1]; if (mm <= 0) continue; const x = A.S * Math.exp((d.u[i] + d.u[i - 1]) / 2), v = POS.payoff(A, x) / A.S - Cx.h * POS.payoff(B, x) / B.S; if (v > eps) pop += mm; }
    return pop;
  }
  function renderCmp() {
    const { A, B, sa, sb, h } = C, nA = A.na, nB = B.na, rows = [], sc = SC();
    const a = (f, nn) => nn ? NaN : f, sB = v => v * h;
    const ratio = (x, y) => { if (!(Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) > 1e-12)) return "–"; const r = x / y; return (Math.abs(r) < 0.005 ? "0.00" : fN(r, 2)) + "×"; };
    const add = (label, va, vb, fmt, diff = true, rat = true, cls = "") => rows.push(`<tr class="${cls}"><td>${label}</td><td>${fmt(va)}</td><td>${fmt(vb)}</td><td>${diff && Number.isFinite(va) && Number.isFinite(vb) ? fmt(va - vb) : ""}</td><td>${rat ? ratio(va, vb) : ""}</td></tr>`);
    const pair = C.same && C.sameExp && !nA && !nB;
    if (!C.same && A.tk !== B.tk) rows.push(`<tr class="note"><td colspan="5">No correlation between ${A.tk} and ${B.tk} is modelled, so the pair column only shows figures that add up. The joint-moves panel shows the pair across independent moves.</td></tr>`);
    else if (!C.sameExp) rows.push(`<tr class="note"><td colspan="5">A and B expire on different dates, so pair odds and pair worst loss at one expiry are not defined. The pair column only shows figures that add up.</td></tr>`);
    for (const [t, x] of [["A", A], ["B", B]]) if (x.na) rows.push(`<tr class="note"><td colspan="5">${key(t)} is n/a: ${esc(x.naReason)}.</td></tr>`);
    if (C.unitsNote) rows.push(`<tr class="note"><td colspan="5">${esc(C.unitsNote)}.</td></tr>`);
    const legsTd = b => b.na ? `<td class="legs">${esc(structTxt(b))}</td>` : `<td class="legs" title="${esc(b.label.full)}">${esc(b.label.tab)}</td>`;
    rows.push(`<tr class="grp"><td>Legs</td>${legsTd(A)}${legsTd(B)}<td></td><td></td></tr>`);
    // cash credit (a debit spelled out), with time value beside it where a leg is in the money; every ratio below uses time value
    const anyI = (!nA && A.intr > 0) || (!nB && B.intr > 0), tvC = anyI ? `<span class="cap">on time value</span>` : "";
    const cv = (b, nn, k) => nn ? "–" : fU(k * b.cr / b.S) + (b.cr < 0 ? ` <span class="debit">net debit</span>` : "") + (b.intr > 0 ? ` <span class="muted">· time value ${fU(k * b.tv / b.S)}</span>` : "");
    const ca = a(A.cr / A.S, nA), cb = a(sB(B.cr / B.S), nB), ta = a(A.tv / A.S, nA), tb = a(sB(B.tv / B.S), nB);
    rows.push(`<tr><td>Credit${anyI ? `<span class="cap" title="Time value = cash credit − intrinsic value at entry">cash · time value</span>` : ""}</td><td>${cv(A, nA, 1)}</td><td>${cv(B, nB, h)}</td><td>${Number.isFinite(ca) && Number.isFinite(cb) ? fU(ca - cb) + (anyI ? ` <span class="muted">· ${fU(ta - tb)}</span>` : "") : ""}</td><td>${anyI ? ratio(ta, tb) : ratio(ca, cb)}</td></tr>`);
    add(`Credit/σ<span class="cap">size-free, own σ to expiry</span>${tvC}`, a(A.tv / (A.S * A.sig), nA), a(B.tv / (B.S * B.sig), nB), v => fN(v, 3), false);
    add(`Credit per day${tvC}`, a(A.tv / A.S / A.dte, nA), a(sB(B.tv / B.S / B.dte), nB), v => fU(v, 3), true, true, "grp");
    add(`Expected value<span class="cap">${sc.dist === "rn" ? "implied odds: fill vs mid, 0 at mid" : `HV30 ×${sc.hvk.toFixed(2)} odds`}</span>`, a(sa && sa.ev / A.S, nA), a(sb && sB(sb.ev / B.S), nB), v => fU(v, 2));
    rows.push(`<tr><td>Profit odds<span class="cap">P&amp;L above 0 at expiry</span></td><td>${nA || !sa ? "–" : fP(sa.pop, 0)}</td><td>${nB || !sb ? "–" : fP(sb.pop, 0)}</td><td>${pair ? fP(pairPop(C), 0) : ""}</td><td></td></tr>`);
    const sel = `<select data-wl aria-label="Worst-loss range"><option value="view"${sc.wl === "view" ? " selected" : ""}>the view range</option><option value="own"${sc.wl === "own" ? " selected" : ""}>its own range</option></select>`;
    const own = sc.wl === "own" ? ` −<input type="number" data-wlo value="${+sc.wlo.toFixed(2)}" step="${STATE.uStep(C.unit)}" min="0" style="width:56px"> to +<input type="number" data-whi value="${+sc.whi.toFixed(2)}" step="${STATE.uStep(C.unit)}" min="0" style="width:56px"> ${STATE.UNAME[C.unit]}` : "";
    const pw = pair ? pairWorst(C, A, B, h) : NaN;
    rows.push(`<tr class="grp"><td>Worst loss within ${sel}${own}<span class="cap" style="display:block;margin:0">${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}${sigWord()}: ${C.same ? A.tk : tkOf("A")} ${fPx2(C.toSA(C.wlo))}–${fPx2(C.toSA(C.whi))}${C.same ? "" : `, ${tkOf("B")} ${fPx2(C.toSB(C.wlo))}–${fPx2(C.toSB(C.whi))}`}</span></td><td>${nA || !sa ? "–" : fU(sa.worst / A.S)}</td><td>${nB || !sb ? "–" : fU(sB(sb.worst / B.S))}</td><td>${pair ? fU(pw) : ""}</td><td>${nA || nB || !sa || !sb ? "" : ratio(sa.worst / A.S, sB(sb.worst / B.S))}</td></tr>`);
    add("Vega per vol point", a(A.vega / 100 / A.S, nA), a(sB(B.vega / 100 / B.S), nB), v => fU(v, 2));
    add(`Margin<span class="cap">approx.: 20% × leverage (${levTxt()}), Reg-T style</span>`, a(A.margin / A.S, nA), a(sB(B.margin / B.S), nB), v => fU(v).replace("+", ""), false);
    add(`Credit / margin${tvC}`, a(A.tv / A.margin, nA), a(B.tv / B.margin, nB), v => fP(v, 1), false, true, "grp");
    const be = (b, s) => b.na || !s ? "–" : s.bes.length ? s.bes.map(fPx2).join(" / ") : "none";
    rows.push(`<tr><td>Breakevens</td><td>${be(A, sa)}</td><td>${be(B, sb)}</td><td></td><td></td></tr>`);
    if (A.wingPx > 0 || B.wingPx > 0) {
      add("Wing cost", A.wingPx > 0 ? A.wingPx / A.S : NaN, B.wingPx > 0 ? sB(B.wingPx / B.S) : NaN, v => fU(v));
      const cw = (b, s) => b.cap && s ? `${fPx2(s.capBE)} · ${fP(s.pCap, 1)}` : "–", pwg = (b, s) => b.capP && s ? `${fPx2(s.capPBE)} · ${fP(s.pCapP, 1)}` : "–";
      if (A.cap || B.cap) rows.push(`<tr><td>Call wing pays above · odds<span class="cap">spot where the wing has paid for itself</span></td><td>${cw(A, sa)}</td><td>${cw(B, sb)}</td><td></td><td></td></tr>`);
      if (A.capP || B.capP) rows.push(`<tr><td>Put wing pays below · odds<span class="cap">spot where the wing has paid for itself</span></td><td>${pwg(A, sa)}</td><td>${pwg(B, sb)}</td><td></td><td></td></tr>`);
    }
    q("#cmp").innerHTML = `<thead><tr><th></th><th>${key("A")}</th><th><span class="key b">B${hb()}</span></th><th><span class="key d">A − ${hTxt()}</span></th><th>A / B</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  }

  // ============================================================ P&L through time (move across, time down)
  const GRID = { cells: {}, data: null, hov: null, csv: "" };
  // calendar alignment reads each position's odds at min(day, its own days): an expired position keeps its expiry odds
  function gridRows(Cx) {
    const { A, B } = Cx;
    if (Cx.cal) { const Hd = Cx.Hd, n = Math.min(Hd, 100); return Array.from({ length: n + 1 }, (_, i) => { const d = Hd * i / n, dA = Math.min(d, A.dte), dB = Math.min(d, B.dte); return { d, dA, dB, tA: dA / 365, tB: dB / 365 }; }); }
    const n = Math.min(Math.max(A.dte, B.dte), 100);
    return Array.from({ length: n + 1 }, (_, i) => { const f = i / n; return { f, dA: f * A.dte, dB: f * B.dte, tA: f * A.T, tB: f * B.T }; });
  }
  function gridData(nX) {
    const { A, B, lo, hi } = C, rows = gridRows(C), nT = rows.length;
    const us = Array.from({ length: nX }, (_, i) => lo + (hi - lo) * i / (nX - 1));
    const Z = { A: [], B: [], D: [] };
    for (let r = 0; r < nT; r++) {
      const ra = new Float64Array(nX), rb = new Float64Array(nX), rd = new Float64Array(nX), w = rows[r];
      for (let i = 0; i < nX; i++) { ra[i] = C.vA(us[i], (A.dte - w.dA) / 365); rb[i] = C.vB(us[i], (B.dte - w.dB) / 365); rd[i] = ra[i] - rb[i]; }
      Z.A.push(ra); Z.B.push(rb); Z.D.push(rd);
    }
    // each grid uses its own instrument's odds on its own clock: B on B's, A and the pair on A's
    const tOf = { A: w => w.tA, B: w => w.tB, D: w => w.tA }, dOf = { A: C.d, B: C.dB, D: C.d }, xOf = { A: C.xA, B: C.xB, D: C.xA }, mass = {};
    for (const g of ["A", "B", "D"]) {
      const xe = Array.from({ length: nX + 1 }, (_, i) => xOf[g](lo + (hi - lo) * (i - 0.5) / (nX - 1)));
      mass[g] = rows.map(w => { const t = tOf[g](w), rm = new Float64Array(nX); if (dOf[g]) for (let i = 0; i < nX; i++) rm[i] = cdfAt(dOf[g], xe[i + 1], t) - cdfAt(dOf[g], xe[i], t); return rm; });
    }
    return { rows, nT, nX, us, Z, mass, tOf };
  }
  function setupGrid() {
    const host = q("#gwrap"); if (host.children.length) return;
    host.insertAdjacentHTML("beforeend", `<span class="gut"><span class="gh"></span><canvas aria-hidden="true"></canvas></span>`);
    GRID.gut = host.querySelector(".gut canvas");
    for (const g of ["A", "B", "D"]) {
      host.insertAdjacentHTML("beforeend", `<span class="gcell" data-g="${g}"><span class="gh"></span><span class="gc"><canvas class="hm"></canvas><canvas class="ov"></canvas></span><span class="gna" hidden></span></span>`);
      const cell = host.lastElementChild, ov = cell.querySelector("canvas.ov");
      const hov = ev => { const hh = gridHit(g, ev); GRID.hov = hh; drawOverlays(); if (hh) gridTip(hh, ev.clientX, ev.clientY); else hideTip(); };
      ov.addEventListener("pointermove", hov);
      ov.addEventListener("click", ev => { const hh = gridHit(g, ev); if (hh) addPin(hh); });
      ov.addEventListener("pointerleave", () => { GRID.hov = null; drawOverlays(); hideTip(); });
      GRID.cells[g] = { cell, hm: cell.querySelector("canvas.hm"), ov, gh: cell.querySelector(".gh"), na: cell.querySelector(".gna"), gc: cell.querySelector(".gc") };
    }
  }
  function gridHit(g, ev) {
    const c = GRID.cells[g], G = GRID.data; if (!G || !c.geo) return null;
    const rc = c.ov.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top, o = c.geo;
    const i = Math.floor((x - o.l) / o.cw), r = Math.floor((y - o.t) / o.ch);
    if (i < 0 || r < 0 || i >= G.nX || r >= G.nT) return null; return { i, r, g };
  }
  function rowTxt(w) {
    if (C.cal) return `day ${Math.round(w.d)}` + (w.d > C.A.dte ? " · A expired" : w.d > C.B.dte ? " · B expired" : "");
    return C.sameExp ? `day ${w.dA.toFixed(0)}` : `${Math.round(w.f * 100)}% of life · A day ${w.dA.toFixed(0)}, B day ${w.dB.toFixed(0)}`;
  }
  function gridTip(hh, cx, cy) {
    const G = GRID.data, w = G.rows[hh.r], u = G.us[hh.i], { A, B } = C, pm = G.mass[hh.g][hh.r][hh.i];
    showTip(`<span class="h">${uLab(u, C.unit, 2)} · ${C.same ? A.tk : tkOf("A")} ${fPx2(C.toSA(u))} <span class="muted">${fS(C.toSA(u) / A.S - 1, 1)}</span></span>${C.same ? "" : `<span class="s">${tkOf("B")} ${fPx2(C.toSB(u))} (${fS(C.toSB(u) / B.S - 1, 1)})</span>`}<span class="s">${rowTxt(w)}</span>${trow("A", G.Z.A[hh.r][hh.i], "a")}${trow("B" + hb(), G.Z.B[hh.r][hh.i], "b")}${trow("A − " + hTxt(), G.Z.D[hh.r][hh.i], "ink")}<span class="s" style="margin:4px 0 0">${C.same ? A.tk : tkOf(hh.g === "B" ? "B" : "A")} column odds ${fP(pm, 2)}${V().gval === "contrib" ? ` · weighted ${fU(G.Z[hh.g][hh.r][hh.i] * pm, 3)}` : ""} · click to pin</span>`, cx, cy);
  }
  function colorFn(L) {
    const MID = rgbOf("--mid"), POSC = rgbOf("--pos"), NEG = rgbOf("--neg"), soft = L / 7, lin = V().cs === "lin";
    return v => { const a = Math.min(Math.abs(v), L); const t = lin ? a / L : Math.asinh(a / soft) / Math.asinh(L / soft); return mix(MID, v >= 0 ? POSC : NEG, t); };
  }
  const shockOn = () => SC().ivs !== 0 || SC().svs > 0;
  const shockTxt = () => { const s = SC(); return [s.ivs ? `IV shock ${s.ivs > 0 ? "+" : MINUS}${Math.abs(s.ivs)} pts` : "", s.svs ? `+${s.svs} pts per −10%${s.svd ? " (down only)" : ""}` : ""].filter(Boolean).join(" · "); };
  const GH = 330;
  function gridGeo(W) { const o = { l: 4, r: 8, t: 4, b: 30 + (V().ovo ? 8 : 0) + (C.same ? 0 : 11) }; o.pw = W - o.l - o.r; o.ph = GH - o.t - o.b; return o; }
  function renderGrid() {
    setupGrid();
    const vw = V(), num = vw.gview === "num";
    q("#alignCtl").hidden = C.sameExp;
    q("#c-gtab").hidden = !num; q("#gwrap").hidden = num; q("#numwrap").hidden = !num;
    q("#shockSum").innerHTML = shockOn() ? `Shocks <span class="chip">${shockTxt()}</span>` : "Shocks";
    q("#c-cts").hidden = vw.ct !== "lev"; q("#crxW").hidden = vw.cr !== "fix";
    q("#gInfo").dataset.tip = `Across: the move range (${uLab(C.lo, C.unit)} to ${uLab(C.hi, C.unit)}${sigWord()}${C.same ? "" : `, ${tkOf("B")} moving ${C.unit === "sig" ? "the same number of its own σ" : "the same %"}`}). Down: ${C.cal ? "calendar days from today; an expired position keeps its expiry payoff and odds" : C.sameExp ? "days from today" : "share of each position's life"}, today at the top. Colour: ${vw.gval === "contrib" ? "P&L × the odds of that column on that grid's own instrument and clock, so a row sums to the expected mark" : "mark-to-model P&L, each leg pinned to its traded mid at entry"}. The ±σ cones use each position's own ATM vol on its own clock. The contour line is break-even. Click a cell to pin it.`;
    const nX = 120, G = GRID.data = gridData(nX);
    GRID.gw = gutW(); q("#gwrap").style.setProperty("--gutw", GRID.gw + "px");
    if (num) { renderNumbers(); q("#gfoot").innerHTML = shockOn() ? `<span class="chip" style="margin-left:0">shocks: ${shockTxt()}</span>` : ""; return; }
    const Vv = {};
    for (const g of ["A", "B", "D"]) Vv[g] = vw.gval === "contrib" ? G.Z[g].map((r, j) => r.map((v, i) => v * G.mass[g][j][i])) : G.Z[g];
    const maxAbs = g => { let mm = 0; for (const r of Vv[g]) for (const v of r) if (Number.isFinite(v)) mm = Math.max(mm, Math.abs(v)); return Math.max(mm, 1e-6); };
    const lim = {};
    if (vw.cr === "fix" && vw.gval === "pnl") for (const g of ["A", "B", "D"]) lim[g] = Math.max(vw.crx / 100, 1e-4);
    else if (vw.shared) { const L = Math.max(maxAbs("A"), maxAbs("B"), maxAbs("D")); lim.A = lim.B = lim.D = L; }
    else for (const g of ["A", "B", "D"]) lim[g] = maxAbs(g);
    let geo0 = null; LAST.gridLines = {};
    for (const g of ["A", "B", "D"]) {
      const c = GRID.cells[g]; c.geo = null;
      const bad = (g === "A" && C.A.na) || (g === "B" && C.B.na) || (g === "D" && (C.A.na || C.B.na));
      const lab = b => `<span class="t" title="${esc(b.label.full)}">${esc(b.label.tab)}</span>`;
      c.gh.innerHTML = (g === "A" ? `${key("A")}${lab(C.A)}` : g === "B" ? `<span class="key b">B${hb()}</span>${lab(C.B)}` : `<span class="key d">A − ${hTxt()}</span><span class="t">the pair</span>`) + (!vw.shared || vw.cr === "fix" ? `<span class="rng2">±${fU(lim[g]).replace("+", "")}</span>` : "");
      c.gc.hidden = bad; c.na.hidden = !bad;
      if (bad) { c.na.textContent = `n/a: ${(C.A.na ? C.A : C.B).naReason}`; continue; }
      drawHeat(g, c, Vv[g], lim[g]); geo0 = geo0 || c.geo;
    }
    drawGutter(geo0);
    drawOverlays();
    const L = lim.A, MID = rgbOf("--mid"), POSC = rgbOf("--pos"), NEG = rgbOf("--neg");
    q("#gfoot").innerHTML = (vw.shared || vw.cr === "fix" ? `<span>${fU(-L)}<span class="bar" style="background:linear-gradient(90deg,rgb(${NEG}),rgb(${MID}),rgb(${POSC}))"></span>${fU(L)}</span> ` : "") +
      `<span>${vw.gval === "contrib" ? "P&L × column odds" : "P&L"}${vw.cs === "comp" ? ", compressed" : ""}${vw.cr === "fix" ? ", fixed range" : ", full range"}</span> <span>contour line = break-even</span> <span>today at the top</span> ${vw.ovo ? `<span>bottom strip = odds at the last row</span>` : ""} ${shockOn() ? `<span class="chip" style="margin-left:0">shocks: ${shockTxt()}</span>` : ""}${C.unitsNote ? ` <span class="badge">${esc(C.unitsNote)}</span>` : ""}`;
  }
  function yTicks() {
    const n = GRID.data.nT - 1;
    if (C.cal) return ticks(0, C.Hd, 5).map(d => [d / C.Hd * n, d + "d"]);
    if (C.sameExp) return ticks(0, C.A.dte, 5).map(d => [d / C.A.dte * n, d + "d"]);
    return ticks(0, 100, 4).map(p => [p / 100 * n, p + "%"]);
  }
  // the gutter is as wide as its labels: the day ticks and, for two instruments, the price-row names ("B KORU ✎")
  function gutW() {
    const ctx = GRID.gut.getContext("2d"); let w = 0;
    ctx.font = "10px 'IBM Plex Mono', monospace"; for (const [, s] of yTicks()) w = Math.max(w, ctx.measureText(s).width);
    if (!C.same) { ctx.font = "9px 'IBM Plex Sans Condensed', sans-serif"; for (const s of [tkOf("A"), tkOf("B"), "move"]) w = Math.max(w, ctx.measureText(s).width); }
    return Math.max(34, Math.ceil(w) + 4);
  }
  function drawGutter(o) {
    const cv = GRID.gut, W = GRID.gw || 34, dpr = window.devicePixelRatio || 1;
    cv.hidden = !o; if (!o) return;
    cv.width = W * dpr; cv.height = GH * dpr; cv.style.width = W + "px"; cv.style.height = GH + "px";
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, GH);
    ctx.fillStyle = css("--ink-3"); ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.textAlign = "right";
    const ch = o.ph / GRID.data.nT;
    for (const [r, s] of yTicks()) ctx.fillText(s, W - 2, Math.min(Math.max(o.t + (r + .5) * ch + 3.5, o.t + 9), o.t + o.ph));
    if (!C.same) { const y0 = o.t + o.ph + 4 + (V().ovo ? 8 : 0); ctx.font = "9px 'IBM Plex Sans Condensed', sans-serif"; ctx.fillText(tkOf("A"), W - 2, y0 + 20); ctx.fillText(tkOf("B"), W - 2, y0 + 31); ctx.fillText("move", W - 2, y0 + 9); }
  }
  function drawHeat(g, c, Vg, L) {
    const G = GRID.data, vw = V(), W = c.gc.clientWidth || 300, H = GH, dpr = window.devicePixelRatio || 1;
    const o = gridGeo(W); o.cw = o.pw / G.nX; o.ch = o.ph / G.nT; c.geo = o;
    for (const cv of [c.hm, c.ov]) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; }
    const ctx = c.hm.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const off = document.createElement("canvas"); off.width = G.nX; off.height = G.nT;
    const oc = off.getContext("2d"), img = oc.createImageData(G.nX, G.nT), col = colorFn(L), SURF = rgbOf("--surface");
    for (let r = 0; r < G.nT; r++) for (let i = 0; i < G.nX; i++) { const v = Vg[r][i], cc = Number.isFinite(v) ? col(v) : SURF, k = (r * G.nX + i) * 4; img.data[k] = cc[0]; img.data[k + 1] = cc[1]; img.data[k + 2] = cc[2]; img.data[k + 3] = 255; }
    oc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, o.l, o.t, o.pw, o.ph);
    const X = i => o.l + (i + 0.5) * o.cw, Y = r => o.t + (r + 0.5) * o.ch, XU = u => o.l + o.cw / 2 + (u - C.lo) / (C.hi - C.lo) * (o.pw - o.cw);
    const ink = css("--ink"), ink2 = css("--ink-2"), ink3 = css("--ink-3"), xt = axisTicks(C.lo, C.hi, Math.floor(o.pw / 64)).filter((u, k, a) => k === 0 || k === a.length - 1 || Math.min(Math.abs(u - C.lo), Math.abs(C.hi - u)) / (C.hi - C.lo) * o.pw > 40), yt = yTicks();
    ctx.save(); ctx.beginPath(); ctx.rect(o.l, o.t, o.pw, o.ph); ctx.clip();
    if (vw.gl) { ctx.strokeStyle = ink3; ctx.globalAlpha = .4; ctx.lineWidth = 1; ctx.beginPath(); for (const u of xt) { ctx.moveTo(XU(u), o.t); ctx.lineTo(XU(u), o.t + o.ph); } for (const [r] of yt) { ctx.moveTo(o.l, Y(r)); ctx.lineTo(o.l + o.pw, Y(r)); } ctx.stroke(); ctx.globalAlpha = 1; }
    const Z = G.Z[g];
    if (vw.ct === "lev") { ctx.strokeStyle = ink2; ctx.lineWidth = .8; ctx.globalAlpha = .7; const step = vw.cts / 100; let mx = 0; for (const r of Z) for (const v of r) if (Number.isFinite(v)) mx = Math.max(mx, Math.abs(v)); for (let k = -Math.floor(mx / step); k <= Math.floor(mx / step); k++) if (k) contour(ctx, Z, k * step, X, Y); ctx.globalAlpha = 1; }
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4; contour(ctx, Z, 0, X, Y);
    ctx.lineWidth = 1; ctx.font = "10px 'IBM Plex Sans Condensed', sans-serif";
    if (vw.ovs) { ctx.strokeStyle = ink2; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(XU(0), o.t); ctx.lineTo(XU(0), o.t + o.ph); ctx.stroke(); ctx.globalAlpha = 1; }
    if (vw.ovc) {   // ±1σ, ±2σ cones: each position's own ATM vol on its own clock
      const isB = g === "B", b0 = isB ? C.B : C.A, atm = b0.E ? b0.E.atm : NaN, S0 = b0.S, inv = isB ? C.uOfSB : C.uOfSA; ctx.setLineDash([2, 3]); ctx.strokeStyle = ink2;
      for (const k of [-2, -1, 1, 2]) { ctx.beginPath(); let pen = false; G.rows.forEach((w, r) => { const u = inv(S0 * Math.exp(k * atm * Math.sqrt(G.tOf[g](w)))); if (!(u >= C.lo && u <= C.hi)) { pen = false; return; } pen ? ctx.lineTo(XU(u), Y(r)) : ctx.moveTo(XU(u), Y(r)); pen = true; }); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // strike lines: every leg, wings included (a long leg is marked +)
    const lines = [], addLegs = (b, inv, colVar, tag) => { for (const l of legsOf(b)) lines.push({ u: inv(l.K), l: `${tag}${legTag(l)}`, col: colVar }); };
    if (vw.ovk) { if (g !== "B") addLegs(C.A, C.uOfSA, "--a", g === "D" ? "A " : ""); if (g !== "A") addLegs(C.B, C.uOfSB, "--b", g === "D" ? "B " : ""); }
    if (vw.ovb) for (const [b, s, inv, colVar] of [[C.A, C.sa, C.uOfSA, "--a"], [C.B, C.sb, C.uOfSB, "--b"]]) { if (!s || (g === "A" && b === C.B) || (g === "B" && b === C.A)) continue; for (const be of s.bes) if (be > 0) lines.push({ u: inv(be), l: "BE", col: colVar, be: true }); }
    LAST.gridLines[g] = lines.map(x => x.l);
    // two passes: every strike line first, then every label box, so no later line runs through an earlier label
    const placed = [], shown = [];
    lines.sort((p, r) => p.u - r.u);
    for (const L2 of lines) {
      const x = XU(L2.u); if (!(x >= o.l && x <= o.l + o.pw)) continue;
      ctx.strokeStyle = css(L2.col); ctx.setLineDash(L2.be ? [1, 3] : [5, 3]); ctx.beginPath(); ctx.moveTo(x, o.t); ctx.lineTo(x, o.t + o.ph); ctx.stroke();
      const tw = ctx.measureText(L2.l).width, left = x + tw + 8 > o.l + o.pw, lx = left ? x - tw - 6 : x + 2; let ly = o.t + 3; while (placed.some(p => Math.abs(p.x - lx) < tw + 6 && p.y === ly)) ly += 13; placed.push({ x: lx, y: ly });
      shown.push({ t: L2.l, lx, ly, tw });
    }
    ctx.setLineDash([]); ctx.textAlign = "left";
    for (const s of shown) { ctx.fillStyle = css("--surface"); ctx.globalAlpha = .85; ctx.fillRect(s.lx, s.ly, s.tw + 4, 11); ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.fillText(s.t, s.lx + 2, s.ly + 9); }
    ctx.setLineDash([]); ctx.restore();
    let yAx = o.t + o.ph + 4;
    if (vw.ovo) { let mm = 0; const ms = G.mass[g][G.nT - 1]; for (const v of ms) mm = Math.max(mm, v); for (let i = 0; i < G.nX; i++) { ctx.fillStyle = ink3; ctx.globalAlpha = .1 + .8 * ms[i] / (mm || 1); ctx.fillRect(o.l + i * o.cw, yAx, Math.ceil(o.cw), 4); } ctx.globalAlpha = 1; yAx += 8; }
    const rowsPx = g === "B" ? [C.toSB] : g === "D" && !C.same ? [C.toSA, C.toSB] : [C.toSA];
    xt.forEach(u => { const x = XU(u); ctx.textAlign = x - o.l < 16 ? "left" : o.l + o.pw - x < 16 ? "right" : "center"; ctx.fillStyle = ink2; ctx.font = "10.5px 'IBM Plex Mono', monospace"; ctx.fillText(uLab(u, C.unit), x, yAx + 9); ctx.fillStyle = ink3; ctx.font = "9.5px 'IBM Plex Mono', monospace"; rowsPx.forEach((f, k) => ctx.fillText(fPx(f(u)), x, yAx + 20 + 11 * k)); });
  }
  function contour(ctx, Z, lev, X, Y) {
    const nY = Z.length, nT = Z[0].length; ctx.beginPath();
    for (let j = 0; j < nY - 1; j++) for (let i = 0; i < nT - 1; i++) {
      const a = Z[j][i] - lev, b = Z[j][i + 1] - lev, c = Z[j + 1][i + 1] - lev, d = Z[j + 1][i] - lev;
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const p = [];
      if ((a >= 0) !== (b >= 0)) { const t = a / (a - b); p.push([X(i + t), Y(j)]); }
      if ((b >= 0) !== (c >= 0)) { const t = b / (b - c); p.push([X(i + 1), Y(j + t)]); }
      if ((c >= 0) !== (d >= 0)) { const t = c / (c - d); p.push([X(i + 1 - t), Y(j + 1)]); }
      if ((d >= 0) !== (a >= 0)) { const t = d / (d - a); p.push([X(i), Y(j + 1 - t)]); }
      if (p.length >= 2) { ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); }
      if (p.length === 4) { ctx.moveTo(p[2][0], p[2][1]); ctx.lineTo(p[3][0], p[3][1]); }
    }
    ctx.stroke();
  }
  // pins keep a price on A's and on B's instrument plus a day for each, so they keep their scenario when A, B or the unit change
  function addPin(hh) {
    const G = GRID.data, u = G.us[hh.i], w = G.rows[hh.r];
    const pins = (V().pins || []).concat([{ SA: +C.toSA(u).toFixed(4), SB: +C.toSB(u).toFixed(4), dA: +w.dA.toFixed(3), dB: +w.dB.toFixed(3) }]).slice(-12);
    setView("pins", pins); refresh();
  }
  const pinVals = p => ({ SA: p.SA, SB: p.SB, a: C.A.na ? NaN : POS.val(C.A, p.SA, Math.max(0, C.A.dte - p.dA) / 365, C.shock) / C.A.S, b: C.B.na ? NaN : C.h * POS.val(C.B, p.SB, Math.max(0, C.B.dte - p.dB) / 365, C.shock) / C.B.S });
  function drawOverlays() {
    const G = GRID.data; if (!G) return;
    const ink = css("--ink"), surf = css("--surface"), pins = V().pins || [];
    for (const g of ["A", "B", "D"]) {
      const c = GRID.cells[g]; if (!c || !c.geo) continue;
      const o = c.geo, dpr = window.devicePixelRatio || 1, ctx = c.ov.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, c.ov.width, c.ov.height);
      pins.forEach((p, k) => {
        const u = g === "B" ? C.uOfSB(p.SB) : C.uOfSA(p.SA); if (!(u >= C.lo && u <= C.hi)) return;
        const dd = g === "B" ? p.dB : p.dA, span = C.cal ? C.Hd : g === "B" ? C.B.dte : C.A.dte; if (dd > span) return;
        const x = o.l + o.cw / 2 + (u - C.lo) / (C.hi - C.lo) * (o.pw - o.cw), y = o.t + (dd / span * (G.nT - 1) + .5) * o.ch;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke();
        ctx.fillStyle = ink; ctx.font = "600 9px 'IBM Plex Sans Condensed', sans-serif"; ctx.textAlign = "center"; ctx.fillText(k + 1, x, y + 3);
      });
      const hh = GRID.hov; if (!hh) continue;
      const x = o.l + (hh.i + .5) * o.cw, y = o.t + (hh.r + .5) * o.ch;
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(o.l, y); ctx.lineTo(o.l + o.pw, y); ctx.moveTo(x, o.t); ctx.lineTo(x, o.t + o.ph); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5; ctx.strokeRect(x - Math.max(o.cw, 4) / 2, y - Math.max(o.ch, 4) / 2, Math.max(o.cw, 4), Math.max(o.ch, 4));
    }
  }
  function renderNumbers() {
    const { A, B } = C, vw = V(), g = vw.gtab;
    if ((g === "A" && A.na) || (g === "B" && B.na) || (g === "D" && (A.na || B.na))) { q("#ntab").innerHTML = `<tr><td>n/a: ${esc((A.na ? A : B).naReason)}</td></tr>`; GRID.csv = ""; return; }
    const n = vw.nm, cols = Array.from({ length: n }, (_, i) => C.lo + (C.hi - C.lo) * i / (n - 1)), days = [], Hd = C.cal ? C.Hd : A.dte;
    for (let d = 0; d < Hd; d += vw.nd) days.push(d); days.push(Hd);
    const cell = (u, d) => { const dA = C.cal ? Math.min(d, A.dte) : d, dB = C.cal ? Math.min(d, B.dte) : d / A.dte * B.dte, a = C.vA(u, (A.dte - dA) / 365), b = C.vB(u, (B.dte - dB) / 365); return g === "A" ? a : g === "B" ? b : a - b; };
    const pxRows = g === "B" ? [[tkOf("B"), C.toSB]] : g === "D" && !C.same ? [[tkOf("A"), C.toSA], [tkOf("B"), C.toSB]] : [[A.tk, C.toSA]];
    q("#ntab").innerHTML = `<thead><tr><th>${C.cal ? "Day" : "A day"}</th>${cols.map(u => `<th>${uLab(u, C.unit)}${pxRows.map(([tk, f]) => `<small>${pxRows.length > 1 ? tk + " " : ""}${fPx2(f(u))}</small>`).join("")}</th>`).join("")}</tr></thead><tbody>${days.map(d => `<tr><td>${d}</td>${cols.map(u => { const v = cell(u, d); return `<td class="${pn(v, 2)}">${fU(v, 2)}</td>`; }).join("")}</tr>`).join("")}</tbody>`;
    const conv = v => vw.units === "usd" ? (v * A.S * 100).toFixed(2) : vw.units === "cr" && A.tv > 0 ? (v / (A.tv / A.S)).toFixed(4) : (v * 100).toFixed(4);
    const name = g === "A" ? `A: ${A.label.full}` : g === "B" ? `B: ${B.label.full} x h=${C.h.toFixed(3)}` : `Pair A - ${C.h.toFixed(3)}*B: A ${A.label.full}; B ${B.label.full}`;
    GRID.csv = [`# ${name}`, `# values: ${C.unitName()}; mark-to-model before expiry, payoff at expiry; move unit ${STATE.UNAME[C.unit]}${shockOn() ? "; shocks " + shockTxt() : ""}`,
      [C.cal ? "day" : "A day", ...cols.map(u => uLab(u, C.unit).replace(MINUS, "-"))].join(","),
      ...pxRows.map(([tk, f]) => [`${tk} price`, ...cols.map(u => fPx2(f(u)))].join(",")),
      ...days.map(d => [d, ...cols.map(u => conv(cell(u, d)))].join(","))].join("\n");
  }
  function renderPins() {
    const host = q("#pins"), pins = V().pins || [];
    if (!pins.length || !GRID.data) { host.innerHTML = ""; return; }
    const { A, B } = C, cl = pn;
    let h = `<table><thead><tr><th>Pin</th><th>Scenario</th><th>When</th><th>${key("A")}</th><th><span class="key b">B${hb()}</span></th><th><span class="key d">A − ${hTxt()}</span></th><th></th></tr></thead><tbody>`;
    pins.forEach((p, k) => {
      const v = pinVals(p), out = !(C.uOfSA(v.SA) >= C.lo && C.uOfSA(v.SA) <= C.hi);
      h += `<tr><td>${k + 1}</td><td>${C.same ? A.tk : tkOf("A")} ${fPx2(v.SA)} ${fS(v.SA / A.S - 1, 1)}${C.same ? "" : ` · ${tkOf("B")} ${fPx2(v.SB)} ${fS(v.SB / B.S - 1, 1)}`}${out ? ' <span class="badge">outside the range</span>' : ""}</td><td>${Math.abs(p.dA - p.dB) < 0.05 ? `day ${+p.dA.toFixed(1)}` : `A day ${+p.dA.toFixed(1)}, B day ${+p.dB.toFixed(1)}`}${p.dA >= A.dte ? " · A at expiry" : ""}${p.dB >= B.dte && !(C.same && B.dte === A.dte) ? " · B at expiry" : ""}</td><td class="${cl(v.a)}">${fU(v.a)}</td><td class="${cl(v.b)}">${fU(v.b)}</td><td class="${cl(v.a - v.b)}">${fU(v.a - v.b)}</td><td><button type="button" class="x" data-k="${k}" aria-label="Remove pin ${k + 1}">×</button></td></tr>`;
    });
    host.innerHTML = h + `</tbody></table><span class="cap" style="display:block;margin-top:6px">Pins keep a price on A's and on B's instrument and a day for each while you change A, B, the unit or the range; a swap swaps them. <button type="button" class="btn" id="pinclr">Clear pins</button></span>`;
  }

  // ============================================================ joint moves (two instruments)
  function renderJoint() {
    const P = q("#p-joint"), { A, B } = C, vw = V();
    if (C.same || A.tk === B.tk) {   // one underlying (an override only changes its spot or IV inputs)
      const other = INST.list().find(x => x.id !== A.tk);
      P.className = "panel slim"; P.innerHTML = `<h2>Joint moves</h2><span class="sub">Only for two instruments: B is on ${A.tk} too.</span>${other ? `<button class="btn" type="button" id="jgo">Compare with ${other.id}</button>` : ""}`; return;
    }
    P.className = "panel";
    const maxD = Math.min(A.dte, B.dte), day = vw.jday < 0 || vw.jday > maxD ? maxD : vw.jday;
    if (!P.querySelector("#c-jday")) P.innerHTML = `<div class="ph"><span class="tools"><span class="ctl" style="margin-right:0"><span class="lbl">Day</span><input type="range" id="c-jday" min="0" max="50" step="1" style="width:160px" aria-label="Day"> <output id="o-jday"></output></span></span><h2>Joint moves</h2> <span class="sub" id="j-note"></span></div><div id="joint"></div>`;
    const ji = P.querySelector("#c-jday"); ji.max = maxD; if (document.activeElement !== ji) ji.value = day;
    P.querySelector("#o-jday").textContent = `day ${day}` + (day === maxD ? ` (${A.dte === maxD ? "A" : "B"} expiry)` : "");
    P.querySelector("#j-note").textContent = `A − ${hTxt()}, ${A.tk} and ${B.tk} moving independently`;
    const host = P.querySelector("#joint");
    if (A.na || B.na) { host.innerHTML = `<span class="gna">n/a: ${esc((A.na ? A : B).naReason)}</span>`; return; }
    const { lo, hi } = C, W = 520, Hh = 470, o = { l: 70, r: 10, t: 8, b: 44 }, pw = W - o.l - o.r, ph = Hh - o.t - o.b, n = 90;
    host.innerHTML = `<div class="joint"><span class="gc" style="width:${W}px"><canvas></canvas><canvas class="ov"></canvas></span><span class="jside" id="jside"></span></div>`;
    const cv = host.querySelector("canvas"), ov = host.querySelector("canvas.ov"), dpr = window.devicePixelRatio || 1;
    for (const c of [cv, ov]) { c.width = W * dpr; c.height = Hh * dpr; c.style.width = W + "px"; c.style.height = Hh + "px"; }
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tauA = (A.dte - day) / 365, tauB = (B.dte - day) / 365, us = Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
    const fa = u => POS.val(A, C.toSA(u), tauA, C.shock) / A.S, fb = u => C.h * POS.val(B, C.toSB(u), tauB, C.shock) / B.S;
    const pa = us.map(fa), pb = us.map(fb);
    const Z = []; for (let j = 0; j < n; j++) { const r = new Float64Array(n), vb = pb[n - 1 - j]; for (let i = 0; i < n; i++) r[i] = pa[i] - vb; Z.push(r); }
    let L = 1e-6; for (const r of Z) for (const v of r) L = Math.max(L, Math.abs(v)); const col = colorFn(L);
    const off = document.createElement("canvas"); off.width = n; off.height = n; const oc = off.getContext("2d"), img = oc.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const c = col(Z[j][i]), k = (j * n + i) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255; }
    oc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, o.l, o.t, pw, ph);
    const cw = pw / n, ch = ph / n, X = i => o.l + (i + .5) * cw, Y = j => o.t + (j + .5) * ch;
    const PX = u => o.l + cw / 2 + (u - lo) / (hi - lo) * (pw - cw), PY = u => o.t + ch / 2 + (hi - u) / (hi - lo) * (ph - ch);
    const ink = css("--ink"), ink2 = css("--ink-2"), ink3 = css("--ink-3");
    ctx.save(); ctx.beginPath(); ctx.rect(o.l, o.t, pw, ph); ctx.clip();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4; contour(ctx, Z, 0, X, Y);
    const alt = C.unit === "sig" ? u => C.uOfSB(B.S * (C.toSA(u) / A.S)) : u => C.uOfSB(B.S * Math.exp(Math.log(C.toSA(u) / A.S) * C.sB / C.sA));
    const altLab = C.unit === "sig" ? "same %" : "same σ", curLab = C.unit === "sig" ? "same σ" : "same %";
    ctx.lineWidth = 1.6; ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(PX(lo), PY(lo)); ctx.lineTo(PX(hi), PY(hi)); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = ink2; ctx.setLineDash([4, 4]); ctx.beginPath(); let pen = false;
    for (let i = 0; i <= 80; i++) { const u = lo + (hi - lo) * i / 80, v = alt(u); if (!Number.isFinite(v) || v < lo || v > hi) { pen = false; continue; } pen ? ctx.lineTo(PX(u), PY(v)) : ctx.moveTo(PX(u), PY(v)); pen = true; }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = ink3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PX(0), o.t); ctx.lineTo(PX(0), o.t + ph); ctx.moveTo(o.l, PY(0)); ctx.lineTo(o.l + pw, PY(0)); ctx.stroke();
    const tag = (s, x, y, strong) => { ctx.font = "600 11px 'IBM Plex Sans Condensed', sans-serif"; const tw = ctx.measureText(s).width; x = Math.min(Math.max(x, o.l + 2), o.l + pw - tw - 6); y = Math.min(Math.max(y, o.t + 12), o.t + ph - 4); ctx.fillStyle = css("--surface"); ctx.globalAlpha = .85; ctx.fillRect(x - 2, y - 10, tw + 4, 13); ctx.globalAlpha = 1; ctx.fillStyle = strong ? ink : ink2; ctx.textAlign = "left"; ctx.fillText(s, x, y); };
    const uL = lo + (hi - lo) * 0.8; tag(curLab + " (assumed)", PX(uL) + 6, PY(uL) + 4, true);
    const uM = lo + (hi - lo) * 0.25, vM = alt(uM); if (Number.isFinite(vM) && vM > lo && vM < hi) tag(altLab, PX(uM) + 6, PY(vM) + 14, false);
    ctx.restore();
    const xt = axisTicks(lo, hi, 5), yt = axisTicks(lo, hi, 6);
    for (const u of xt) { ctx.textAlign = PX(u) - o.l < 16 ? "left" : o.l + pw - PX(u) < 16 ? "right" : "center"; ctx.font = "10.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = ink2; ctx.fillText(uLab(u, C.unit), PX(u), Hh - o.b + 14); ctx.font = "9.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = ink3; ctx.fillText(fPx(C.toSA(u)), PX(u), Hh - o.b + 26); }
    ctx.textAlign = "right";
    for (const u of yt) { const yy = Math.min(Math.max(PY(u), o.t + 8), o.t + ph - 10); ctx.font = "10.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = ink2; ctx.fillText(uLab(u, C.unit), o.l - 8, yy); ctx.font = "9.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = ink3; ctx.fillText(fPx(C.toSB(u)), o.l - 8, yy + 10); }
    ctx.textAlign = "left"; ctx.fillStyle = ink2; ctx.font = "600 11px 'IBM Plex Sans Condensed', sans-serif";
    ctx.fillText(`${A.tk} move →`, o.l + 2, Hh - 4); ctx.save(); ctx.translate(12, o.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText(`${B.tk} move →`, 0, 0); ctx.restore();
    // worst on the assumed line, evaluated densely and at every strike kink (wings included)
    const lu = []; for (let i = 0; i <= 1200; i++) lu.push(lo + (hi - lo) * i / 1200);
    for (const [b, inv] of [[A, C.uOfSA], [B, C.uOfSB]]) for (const l of b.legs) { const u = inv(l.K); if (u > lo && u < hi) lu.push(u); }
    let minLine = Infinity; for (const u of lu) minLine = Math.min(minLine, fa(u) - fb(u));
    let minAll = Infinity; for (const r of Z) for (const v of r) minAll = Math.min(minAll, v);
    P.querySelector("#jside").innerHTML = `${shockOn() ? `<p><span class="chip" style="margin-left:0">shocks: ${shockTxt()}</span></p>` : ""}<p class="big">Worst cell <b class="num neg">${fU(minAll)}</b><br>Worst on the assumed ${curLab} line <b class="num ${pn(minLine)}">${fU(minLine)}</b></p>
    <p>Each cell values the pair on day ${day} for one ${A.tk} move (across) and one ${B.tk} move (up), both over ${uLab(lo, C.unit)} to ${uLab(hi, C.unit)}${C.unit === "sig" ? `, each in its own σ${diffExp() ? " over A's horizon" : ""}` : ""}. The colour scale runs to the largest |value|.</p>
    <p>The solid diagonal is the path the payoff and grid panels assume; the dashed curve is the ${altLab} alternative. Anything off the diagonal is risk those panels cannot show. Correlation is not modelled, so this shows outcomes, not their odds.</p>`;
    const octx = ov.getContext("2d"); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ov.addEventListener("pointermove", ev => {
      const r = ov.getBoundingClientRect(), i = Math.floor((ev.clientX - r.left - o.l) / cw), j = Math.floor((ev.clientY - r.top - o.t) / ch);
      octx.clearRect(0, 0, W, Hh); if (i < 0 || j < 0 || i >= n || j >= n) { hideTip(); return; }
      octx.strokeStyle = ink; octx.globalAlpha = .55; octx.beginPath(); octx.moveTo(o.l, Y(j)); octx.lineTo(o.l + pw, Y(j)); octx.moveTo(X(i), o.t); octx.lineTo(X(i), o.t + ph); octx.stroke(); octx.globalAlpha = 1;
      const ua = us[i], ub = us[n - 1 - j], va = pa[i], vb = pb[n - 1 - j];
      showTip(`<span class="h">${A.tk} ${uLab(ua, C.unit, 2)} → ${fPx2(C.toSA(ua))}</span><span class="h">${B.tk} ${uLab(ub, C.unit, 2)} → ${fPx2(C.toSB(ub))}</span><span class="s">day ${day}</span>${trow("A", va, "a")}${trow("B" + hb(), vb, "b")}${trow("A − " + hTxt(), va - vb, "ink")}`, ev.clientX, ev.clientY);
    });
    ov.addEventListener("pointerleave", () => { octx.clearRect(0, 0, W, Hh); hideTip(); });
  }

  // ============================================================ strike sweep: vary the placement on the current basis
  // x is in A's placement basis. B on its own basis is converted to A's (its strikes stay), so both vary on one axis.
  //   both, strangle: put and call move by the same step and keep their offset; x = their mean (legs together or detached)
  //   put / call, strangle: that leg alone
  //   straddle (any mode but the wing): its one strike moves; x is read on the put side for "put", the call side otherwise
  //   wingCall: the protective call's value (switched on for a side that has none)
  // The current position sits on its curve at x0: the curve point at x0 is exactly the position as set.
  function sweepSide(Cx, side, mode) {
    const b = side === "A" ? Cx.A : Cx.B; if (!b || b.na || !b.E) return null;
    const basis = Cx.Ap.basis, E = b.E, opts = side === "B" ? { expMap: Cx.cmp.expMap } : undefined;
    let P = side === "A" ? Cx.Ap : Cx.Bp;
    const plainW = w => ({ on: !!w.on, value: +w.value });
    if (P.basis !== basis || P.wings.call.basis || P.wings.put.basis) {
      const r = RULE.convert(E, { basis: P.basis, structure: P.structure, values: P.values, wings: P.wings }, basis);
      P = Object.assign({}, P, { basis, values: r.values, wings: { call: plainW(Object.assign({}, P.wings.call, r.wings.call || {})), put: plainW(Object.assign({}, P.wings.put, r.wings.put || {})) } });
    } else P = Object.assign({}, P, { wings: { call: plainW(P.wings.call), put: plainW(P.wings.put) } });
    const v = P.values, straddle = P.structure === "straddle", legX = role => { const l = b.legs.find(x => x.role === role); return l ? l.achieved[basis] : NaN; };
    let x0, at, rng, what;
    if (mode === "wingCall") {
      const Ks = (b.legs.find(l => l.role === "short call") || {}).K;
      x0 = P.wings.call.on ? +P.wings.call.value : NaN;
      at = x => Object.assign({}, P, { wings: { call: { on: true, value: RULE.clampWing(basis, x) }, put: P.wings.put } });
      rng = RULE.range(E, basis, "long call", Ks); what = P.wings.call.on ? "protective call" : "protective call (added: none now)";
    } else if (straddle) {
      const flip = mode === "put" ? (basis === "delta" ? x => 100 - x : x => -x) : x => x;   // put side <-> center (call side); self-inverse
      x0 = v.center === "atm" ? (mode === "put" ? legX("short put") : legX("short call")) : flip(+v.center);
      at = x => Object.assign({}, P, { values: Object.assign({}, v, { center: RULE.clampValue(basis, flip(x)) }) });
      const r = RULE.range(E, basis, "center"); rng = mode === "put" ? [flip(r[1]), flip(r[0])] : r; what = "straddle strike";
    } else if (mode === "both") {
      const m0 = (+v.put + +v.call) / 2; x0 = m0;
      at = x => { const d = x - m0; return Object.assign({}, P, { values: Object.assign({}, v, { put: RULE.clampValue(basis, +v.put + d), call: RULE.clampValue(basis, +v.call + d) }) }); };
      const rt = RULE.rangeTogether(E, basis, v); rng = rt ? [m0 + rt.dlo, m0 + rt.dhi] : [NaN, NaN];
      const off = RULE.fmtV(+v.call - +v.put, basis);   // an offset that prints as 0 is no offset
      what = parseFloat(off) === 0 ? "put and call" : `put and call, offset ${off} kept`;
    } else {
      const leg = mode; x0 = +v[leg];
      at = x => Object.assign({}, P, { values: Object.assign({}, v, { [leg]: RULE.clampValue(basis, x) }) });
      rng = RULE.range(E, basis, leg === "put" ? "short put" : "short call"); what = `${leg} alone`;
    }
    return { side, P, b, x0, at, rng, straddle, basis, opts, what, legsMode: P.legs };
  }
  function sweepData(Cx, mode, nPts) {
    const sides = { A: sweepSide(Cx, "A", mode), B: sweepSide(Cx, "B", mode) }, basis = Cx.Ap.basis;
    const wing = mode === "wingCall", lim = wing ? [RULE.WMIN[basis], RULE.WMAX[basis]] : RULE.BOUNDS[basis];
    let lo = Infinity, hi = -Infinity;
    for (const s of Object.values(sides)) if (s) { for (const x of [...s.rng, s.x0]) if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }
    if (!(hi > lo)) { lo = lim[0]; hi = Math.min(lim[1], lim[0] + 50); }
    const pad = (hi - lo) * 0.04; lo = Math.max(lim[0], lo - pad); hi = Math.min(lim[1], hi + pad);
    const n = nPts || 72, xs = [];
    for (let i = 0; i <= n; i++) xs.push(lo + (hi - lo) * i / n);
    for (const s of Object.values(sides)) if (s && Number.isFinite(s.x0) && s.x0 >= lo && s.x0 <= hi) xs.push(s.x0);
    xs.sort((a, b) => a - b);
    const uniq = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-12);
    const toS = { A: Cx.toSA, B: Cx.toSB }, scale = { A: 1, B: Cx.h };
    const run = s => uniq.map(x => {
      const b = POS.build(s.at(x), s.opts), k = scale[s.side] / b.S, st9 = b.na ? null : Cx.statsHV(b);
      return { x, b, cr: b.na ? NaN : b.tv * k, ev: st9 ? st9.ev * k : NaN, worst: b.na ? NaN : POS.worstIn(b, toS[s.side](Cx.wlo), toS[s.side](Cx.whi)) * k, itm: !b.na && b.legs.some(l => l.qty < 0 && l.itm) };
    });
    const sa = sides.A ? run(sides.A) : null, sb = sides.B ? run(sides.B) : null, pairOK = Cx.same && Cx.sameExp;
    const sd = sa && sb ? sa.map((p, i) => ({ x: p.x, cr: p.cr - sb[i].cr, ev: p.ev - sb[i].ev, worst: pairOK ? pairWorst(Cx, p.b, sb[i].b, Cx.h) : NaN })) : null;
    return { mode, basis, lo, hi, xs: uniq, sides, sa, sb, sd, pairOK };
  }
  function sweepAxisName(mode, basis, sides) {
    const u = { delta: "Δ", money: "% OTM", sigma: "σ from the forward" }[basis];
    if (mode === "wingCall") return `call wing ${basis === "delta" ? "Δ" : basis === "money" ? "% beyond the short call" : "σ beyond the short call"}`;
    const strd = ["A", "B"].some(s => sides[s] && sides[s].straddle), strg = ["A", "B"].some(s => sides[s] && !sides[s].straddle);
    const leg = mode === "both" ? (strg ? "mean of put and call" : "") : mode;
    const ctr = strd ? (mode === "put" ? "straddle strike, read as a put" : "straddle strike") : "";
    return [leg, ctr].filter(Boolean).join(" · ") + " " + u;
  }
  function renderSweep() {
    const host = q("#sweep"); host.innerHTML = "";
    const mode = V().sweep, D9 = sweepData(C, mode), { lo, hi, basis, sides, sa, sb, sd, pairOK } = D9;
    LAST.sweep = D9;
    const anyI = [...(sa || []), ...(sb || [])].some(p => !p.b.na && p.b.intr > 0);
    const sideTxt = s => { const x = sides[s]; if (!x) return `${s} n/a`; const legs = x.straddle ? "" : x.legsMode === "detached" ? ", legs detached" : ", legs together"; return `${s}: ${x.what}${legs}`; };
    q("#sw-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A ${esc(C.labels.A.tab)}</span> <span><i style="background:var(--b)"></i>B${hb()} ${esc(C.labels.B.tab)}</span> <span><i style="background:var(--ink);height:1.5px"></i>A − ${hTxt()}${pairOK ? "" : " (worst loss needs one instrument and expiry)"}</span>`;
    q("#sw-cap").textContent = `Varies on the ${basis === "delta" ? "Δ" : basis === "money" ? "% OTM" : "σ"} basis. ${sideTxt("A")} · ${sideTxt("B")}. Shaded: a short leg is in the money against the forward. Dashed lines: the positions as set.`;
    // ATM on the x axis: 0 on % and σ; on Δ the forward strike's Δ (none for the mean of a strangle's two legs)
    const atmX = s => { const x = sides[s]; if (!x || mode === "wingCall") return NaN; if (basis !== "delta") return 0; if (mode === "both" && !x.straddle) return NaN; const c = x.b.E.callDelta(x.b.E.Fpar) * 100; return mode === "put" ? 100 - c : c; };
    for (const [k, label] of [["cr", anyI ? "Credit, time value" : "Credit"], ["ev", "Expected value · HV30 odds"], ["worst", `Worst loss, ${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}`]]) {
      const box = document.createElement("span"); box.className = "sw"; box.innerHTML = `<h3>${label}${k === "cr" && anyI ? `<span class="info" tabindex="0" data-tip="Credit minus intrinsic value at entry. Out of the money it is the whole credit; in the money the cash credit also returns intrinsic value paid back at expiry.">i</span>` : ""}</h3>`; host.appendChild(box);
      const W = Math.max(box.clientWidth, 220), H = 178, m = { l: 52, r: 16, t: 14, b: 34 };
      const ys = [...(sa || []), ...(sb || []), ...(sd || [])].map(p => p[k]).filter(Number.isFinite);
      if (!ys.length) { box.insertAdjacentHTML("beforeend", `<span class="gna">n/a for every value</span>`); continue; }
      let ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0); const pad = (yhi - ylo) * .08 || .005; ylo -= pad; yhi += pad;
      const pw = W - m.l - m.r, X = x => m.l + (x - lo) / (hi - lo) * pw, xOfPx = px => lo + (px - m.l) / pw * (hi - lo), Y = y => m.t + (yhi - y) / (yhi - ylo) * (H - m.t - m.b);
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${label} against the placement value` }, box), ax = el("g", { class: "ax" }, svg);
      // in-the-money shading from the resolved strikes against the forward
      const xs = D9.xs, itm = xs.map((x, i) => (sa && sa[i].itm) || (sb && sb[i].itm));
      for (let i = 0; i < xs.length; i++) if (itm[i]) { let j = i; while (j + 1 < xs.length && itm[j + 1]) j++; const a = i ? (xs[i - 1] + xs[i]) / 2 : xs[i], b2 = j + 1 < xs.length ? (xs[j] + xs[j + 1]) / 2 : xs[j]; el("rect", { x: X(a), y: m.t, width: Math.max(1, X(b2) - X(a)), height: H - m.t - m.b, fill: "var(--itm-bg)" }, svg); if (X(b2) - X(a) > 70) txt(svg, (X(a) + X(b2)) / 2, H - m.b - 4, "ITM leg", { "text-anchor": "middle", fill: "var(--ink-3)", "font-size": 10 }); i = j; }
      const yt = ticks(ylo, yhi, 4);
      for (const t of yt) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, fUt(t, yt[1] - yt[0] || .01), { "text-anchor": "end" }); }
      const xt = ticks(lo, hi, Math.max(3, Math.floor(pw / 60)));
      for (const t of xt) txt(ax, X(t), H - 20, RULE.fmtV(t, basis), { "text-anchor": "middle" });
      txt(svg, m.l + pw / 2, H - 4, sweepAxisName(mode, basis, sides), { "text-anchor": "middle", fill: "var(--ink-3)", "font-size": 10 });
      for (const s of ["A", "B"]) { const xa = atmX(s); if (Number.isFinite(xa) && xa > lo && xa < hi && (s === "A" || Math.abs(xa - atmX("A")) > (hi - lo) / 40)) { el("line", { x1: X(xa), x2: X(xa), y1: H - m.b, y2: H - m.b + 4, stroke: `var(--${s.toLowerCase()})`, "stroke-width": 2 }, svg); txt(svg, X(xa), m.t - 3, "ATM", { "text-anchor": "middle", fill: `var(--${s.toLowerCase()})`, "font-size": 9.5 }); } }
      if (ylo < 0 && yhi > 0) el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg);
      for (const [s, ser, cv] of [["B", sb, "b"], ["A", sa, "a"]]) {
        if (!ser) continue; const x0 = sides[s].x0;
        if (Number.isFinite(x0) && x0 >= lo && x0 <= hi) el("line", { x1: X(x0), x2: X(x0), y1: m.t, y2: H - m.b, stroke: `var(--${cv})`, "stroke-dasharray": "3 3", "stroke-opacity": .8 }, svg);
        el("path", { d: pathOf(ser.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      }
      if (sd) el("path", { d: pathOf(sd.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: "var(--ink)", "stroke-width": 1.4, "stroke-linejoin": "round" }, svg);
      const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
      const hit = el("rect", { x: m.l, y: m.t, width: pw, height: H - m.t - m.b, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", ev => {
        const r = svg.getBoundingClientRect(), x = clamp(xOfPx((ev.clientX - r.left) * W / r.width), lo, hi);
        let i = 0; for (let j = 1; j < xs.length; j++) if (Math.abs(xs[j] - x) < Math.abs(xs[i] - x)) i = j;
        cross.setAttribute("x1", X(xs[i])); cross.setAttribute("x2", X(xs[i])); cross.setAttribute("visibility", "visible");
        const f = p => !p ? "n/a" : p.b.na ? "n/a" : `${fU(p[k])} <span class="muted">${legsTxt(p.b)}${p.itm ? " · ITM" : ""}</span>`;
        showTip(`<span class="h">${sweepAxisName(mode, basis, sides)} ${RULE.fmtV(xs[i], basis)}</span>${krow(`<i class="sw" style="background:var(--a)"></i>A`, f(sa && sa[i]))}${krow(`<i class="sw" style="background:var(--b)"></i>B${hb()}`, f(sb && sb[i]))}${sd ? krow(`<i class="sw" style="background:var(--ink)"></i>A − ${hTxt()}`, fU(sd[i][k])) : ""}`, ev.clientX, ev.clientY);
      });
      hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
    }
  }

  // ============================================================ recovery dynamics: how many cycles one bad hit is worth
  // a kσ hit uses the position's own σ to its own expiry; the headline is whole cycles × days, as the date beside it
  function recRun(Cx, b, who, vw) {
    if (!b || b.na) return null;
    const capPS = vw.rdCap === "margin" ? b.margin : b.S;
    const hv = Cx.statsHV(b), ev = hv ? hv.ev : NaN, g = vw.rdG === "custom" ? vw.rdGc / 100 : ev / capPS;
    let L, xMove = null;
    if (vw.rdHit === "fixed") L = vw.rdL / 100;
    else {
      const sg = b.sig, dn = b.S * Math.exp(-vw.rdK * sg), up = b.S * Math.exp(vw.rdK * sg);
      const lDn = -POS.payoff(b, dn) / capPS, lUp = -POS.payoff(b, up) / capPS;
      if (vw.rdDir === "down") { L = lDn; xMove = dn; } else if (vw.rdDir === "up") { L = lUp; xMove = up; } else { L = Math.max(lDn, lUp); xMove = lDn >= lUp ? dn : up; }
    }
    return { b, who, g, L, xMove, days: b.dte, ev, capPS };
  }
  // cycles needed; Infinity when growth cannot get there
  function recCycles(L, g, kind, base) {
    if (!(L > 0)) return 0;
    if (!(g > 0)) return Infinity;
    const lg = Math.log(1 + g);
    if (base === "nav" || kind === "rec") return L >= 1 ? Infinity : -Math.log(1 - L) / lg;
    return Math.log(1 + L) / lg;   // buffer against a hit measured on the starting capital
  }
  function recTime(n, days, L, dstr) {
    if (L >= 1) return { v: "wiped out", s: "", d: "the hit exceeds the capital" };
    if (!Number.isFinite(n)) return { v: "never", s: "", d: "growth cannot get there" };
    if (n === 0) return { v: "none needed", s: "", d: "" };
    const N = Math.ceil(n - 1e-9);
    return { v: `${(N * days / 7).toFixed(1)} wk`, s: `${N} cycle${N === 1 ? "" : "s"}`, d: `${n.toFixed(1)} needed · ${N} × ${days}d → ${dstr(N * days)}` };
  }
  function renderRecovery() {
    const host = q("#rec"), vw = V();
    const runs = [recRun(C, C.A, "A", vw), recRun(C, C.B, "B", vw)].filter(Boolean);
    const at = String(INST.asof || ""), t0 = /^\d{4}-\d{2}-\d{2}/.test(at) ? Date.UTC(+at.slice(0, 4), +at.slice(5, 7) - 1, +at.slice(8, 10)) : Date.now(), y0 = new Date(t0).getUTCFullYear();
    const dstr = days => { const d = new Date(t0 + days * 864e5); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${d.getUTCFullYear() !== y0 ? " " + String(d.getUTCFullYear()).slice(2) : ""}`; };
    const hitTxt = vw.rdHit === "fixed" ? `a fixed ${vw.rdL}% hit` : `a ${vw.rdK}σ move to its own expiry, ${vw.rdDir === "worse" ? "the worse side" : vw.rdDir}`;
    const narrow = host.clientWidth < 900;
    host.classList.toggle("narrow", narrow);
    const base = vw.rdBase;
    let L = `<span class="rl">` + runs.map(r => {
      const rc = recCycles(r.L, r.g, "rec", base), bf = recCycles(r.L, r.g, "buf", base), a = recTime(rc, r.days, r.L, dstr), c = recTime(bf, r.days, base === "nav" ? r.L : 0, dstr);
      return `<span class="rrun">${key(r.who)}<span class="rh">${esc(r.b.label.full)} · ${r.days}-day cycles · growth ${r.g > 0 ? "+" : ""}${(r.g * 100).toFixed(2)}% a cycle${vw.rdG === "ev" ? " (EV at HV30 odds" + (vw.rdCap === "margin" ? " on margin" : " on notional") + ")" : ""}</span>` +
      `<span class="rv hc"><span class="l">Hit</span><span class="v ${r.L >= 1 ? "neg" : ""}">${r.L > 0 ? MINUS + (r.L * 100).toFixed(0) + "%" : "no loss"}</span><span class="d">${r.xMove ? "at " + fPx2(r.xMove) + " · " : ""}of ${base === "nav" ? "NAV when it lands" : "starting capital"}</span></span>` +
      `<span class="rv"><span class="l">Recovery (hit first)</span><span class="v">${a.v}<small>${a.s}</small></span><span class="d">${a.d}</span></span>` +
      `<span class="rv"><span class="l">Buffer (climb first)</span><span class="v">${c.v}<small>${c.s}</small></span><span class="d">${c.d}</span></span></span>`;
    }).join("") + `<span class="cap rcap">${hitTxt}; a cycle rolls the same tenor; whole cycles round up, because a partly elapsed cycle cannot be traded, and the weeks count whole cycles.${base === "nav" ? " Measured against NAV when it lands, the two times are equal at a constant growth rate." : ""}</span></span>`;
    host.innerHTML = L + `<span class="rr"><span id="rec-ch" class="rch"></span><span class="cap rcap">cycles needed (capped at 60) against the hit · ${base === "nav" ? "recovery = buffer when the hit is a % of NAV" : "solid: recovery, dashed: buffer"}</span></span>`;
    LAST.rec = runs.map(r => ({ who: r.who, L: r.L, g: r.g, rec: recCycles(r.L, r.g, "rec", base), headline: recTime(recCycles(r.L, r.g, "rec", base), r.days, r.L, dstr) }));
    const box = q("#rec-ch"), W = Math.max(320, box.getBoundingClientRect().width), H = 220, m = { l: 48, r: 24, t: 10, b: 28 }, pw = W - m.l - m.r;
    const hs = []; for (let h = 0.05; h <= 0.951; h += 0.01) hs.push(h);
    let ymax = 1; for (const r of runs) for (const h of hs) for (const k of ["rec", "buf"]) { const n = recCycles(h, r.g, k, base); if (Number.isFinite(n)) ymax = Math.max(ymax, Math.min(n, 60)); }
    ymax = Math.min(ymax, 60) * 1.05; const X = h => m.l + (h - 0.05) / 0.9 * pw, Y = n => m.t + (1 - Math.min(n, ymax) / ymax) * (H - m.t - m.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "cycles needed against hit size" }, box), ax = el("g", { class: "ax" }, svg);
    for (const t of ticks(0, ymax, 4)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, String(t), { "text-anchor": "end" }); }
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) txt(ax, X(t), H - 10, MINUS + Math.round(t * 100) + "%", { "text-anchor": "middle" });
    for (const r of runs) {
      const cv = r.who.toLowerCase();
      for (const [k, dash] of [["rec", ""], ["buf", "5 4"]]) { const pts = hs.map(h => [h, recCycles(h, r.g, k, base)]).filter(p => Number.isFinite(p[1]) && p[1] <= ymax); if (pts.length > 1) el("path", { d: pathOf(pts, X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": dash ? 1.4 : 2, "stroke-dasharray": dash }, svg); }
      if (r.L > 0.05 && r.L < 0.95) for (const k of ["rec", "buf"]) { const n = recCycles(r.L, r.g, k, base); if (Number.isFinite(n) && n <= ymax) el("circle", { cx: X(r.L), cy: Y(n), r: 3.5, fill: k === "rec" ? `var(--${cv})` : "var(--surface)", stroke: `var(--${cv})`, "stroke-width": 1.5 }, svg); }
      const last = hs.map(h => [h, recCycles(h, r.g, "rec", base)]).filter(p => Number.isFinite(p[1]) && p[1] <= ymax).pop(); if (last) txt(svg, Math.min(X(last[0]) + 4, W - m.r + 4), Y(last[1]) + 4, r.who, { fill: `var(--${cv})`, "font-weight": 600, "font-size": 11 });
    }
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg), hit = el("rect", { x: m.l, y: m.t, width: pw, height: H - m.t - m.b, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const rr = svg.getBoundingClientRect(), h = clamp(0.05 + ((ev.clientX - rr.left) * W / rr.width - m.l) / pw * 0.9, 0.05, 0.95); cross.setAttribute("x1", X(h)); cross.setAttribute("x2", X(h)); cross.setAttribute("visibility", "visible");
      showTip(`<span class="h">Hit ${MINUS}${Math.round(h * 100)}%</span>` + runs.map(r => { const a = recTime(recCycles(h, r.g, "rec", base), r.days, h, dstr), c = recTime(recCycles(h, r.g, "buf", base), r.days, 0, dstr); return krow(`<i class="sw" style="background:var(--${r.who.toLowerCase()})"></i>${r.who} recovery`, `${a.v} ${a.s}`) + krow(`${r.who} buffer`, `${c.v} ${c.s}`); }).join(""), ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  }

  // ============================================================ smile & legs: click a quote to put a leg on exactly that strike
  function smileGroups(Cx) {
    const gs = [];
    for (const [tag, b] of [["A", Cx.A], ["B", Cx.B]]) {
      if (!b || !b.inst || !b.E) continue;
      let g = gs.find(x => x.version === b.inst.version);
      if (!g) gs.push(g = { version: b.inst.version, inst: b.inst, pos: [] });
      g.pos.push([tag, b]);
    }
    return gs;
  }
  // the roles a clicked quote can take on one side, each with "" or the reason it is refused
  function smileOptions(Cx, tag, b, K, cp) {
    const P = tag === "A" ? Cx.Ap : Cx.Bp, E = b.E, out = [], basis = P.basis;
    const shortK = role => (b.legs.find(l => l.role === role) || {}).K;
    // a value the sanitizer would clamp cannot hold that strike: refuse it with the reason
    const inBounds = (role, Ks) => {
      const v = RULE.valueAt(E, K, role, basis, Ks), wing = role.startsWith("long"), lo = wing ? RULE.WMIN[basis] : RULE.BOUNDS[basis][0], hi = wing ? RULE.WMAX[basis] : RULE.BOUNDS[basis][1];
      if (v < lo) return wing ? `${fK(K)}${cp} is ${RULE.fmtV(v, basis)} from the short, inside the smallest wing value (${RULE.fmtV(lo, basis)})` : `${fK(K)}${cp} is at ${RULE.fmtV(v, basis)}, below the smallest value (${RULE.fmtV(lo, basis)})`;
      if (v > hi) return `${fK(K)}${cp} is at ${RULE.fmtV(v, basis)}, beyond the largest value (${RULE.fmtV(hi, basis)})`;
      return "";
    };
    const add = (role, Ks) => { const why = RULE.whyNot(E, K, role, Ks) || inBounds(role, Ks); out.push(Ks === undefined ? { role, why } : { role, Ks, why }); };
    if (P.structure === "straddle") add("center");
    else add(cp === "P" ? "short put" : "short call");
    if (cp === "C" && P.wings.call.on && Number.isFinite(shortK("short call"))) add("long call", shortK("short call"));
    if (cp === "P" && P.wings.put.on && Number.isFinite(shortK("short put"))) add("long put", shortK("short put"));
    return out;
  }
  const ROLEWORD = { center: "straddle strike", "short put": "short put", "short call": "short call", "long call": "protective call", "long put": "protective put" };
  // pure: S9 -> {S9, events}. The value is the clicked strike's unrounded achieved value on the side's current basis,
  // so it resolves back to exactly that strike. On B it goes through setB, which unlinks placement (or that wing) only.
  function smilePlace(S9x, Cx, tag, role, K) {
    const isB = tag === "B", setOp = isB ? "setB" : "setA", P = isB ? Cx.Bp : Cx.Ap, b = isB ? Cx.B : Cx.A, E = b.E, basis = P.basis;
    const opt = smileOptions(Cx, tag, b, K, RULE.cpOf(role === "center" ? "short put" : role)).find(o => o.role === role) || smileOptions(Cx, tag, b, K, "C").find(o => o.role === role);
    const why = opt ? opt.why : `${fK(K)} cannot take that role`;
    if (why) return { S9: S9x, events: [{ type: "note", aspects: [], text: `Not placed: ${why}`, actions: [] }], refused: why };
    let r, extra = [];
    if (role === "center") r = STATE.cmpOp(S9x, setOp, "values.center", RULE.valueAt(E, K, "center", basis));
    else if (role === "short put" || role === "short call") {
      const leg = role === "short put" ? "put" : "call", other = leg === "put" ? "call" : "put", v = RULE.valueAt(E, K, role, basis);
      if (P.legs === "together") {
        const nv = RULE.shiftTogether(P.values, leg, v), keep = +P.values[other];
        r = STATE.cmpOp(S9x, setOp, "values", { put: nv.put, call: nv.call });
        extra.push({ type: "note", aspects: [], text: `${tag}'s ${leg} is on ${fK(K)}${leg === "put" ? "P" : "C"}; the legs are together, so the ${other} moved by the same step`, actions: [{ label: "detach legs to move only this leg", apply: c => { const set = isB ? CMP.setB : CMP.setA, r1 = set(c, "legs", "detached"), r2 = set(r1.c, "values." + other, keep); return { c: r2.c, events: r1.events.concat(r2.events) }; } }] });
      } else r = STATE.cmpOp(S9x, setOp, "values." + leg, v);
    } else {
      const s = role === "long call" ? "call" : "put", Ks = (b.legs.find(l => l.role === (s === "call" ? "short call" : "short put")) || {}).K;
      r = STATE.cmpOp(S9x, setOp, `wings.${s}.value`, RULE.valueAt(E, K, role, basis, Ks));
    }
    // check that the clicked leg landed on the clicked strike
    const nb = isB ? CMP.buildB(r.S9.cmp) : CMP.buildA(r.S9.cmp), want = role === "center" ? "short put" : role, got = nb.na ? null : nb.legs.find(l => l.role === want);
    if (!got || got.K !== K) extra.push({ type: "note", aspects: [], text: `${tag}'s ${ROLEWORD[role]} resolved to ${got ? fK(got.K) : "n/a"}, not ${fK(K)}${(nb.flags.find(f => f.code === "WIDENED") || {}).text ? ": " + nb.flags.find(f => f.code === "WIDENED").text : ""}`, actions: [] });
    return { S9: r.S9, events: r.events.concat(extra), landed: got ? got.K : null };
  }
  function openLegPop(p, gr, ev) {
    let h = `<span class="h">${fK(p.K)}${p.cp} · ${gr.inst.id} ${fmtE(p.e)}</span><span class="s">${(Math.abs(p.delta) * 100).toFixed(1)}Δ fwd · ${p.bid.toFixed(2)} / ${p.ask.toFixed(2)}${p.model ? " · model quote" : ""}</span>`;
    const opts = [];
    for (const [tag, b] of gr.pos) if (b.exp === p.e) for (const o of smileOptions(C, tag, b, p.K, p.cp)) opts.push(Object.assign({ tag }, o));
    if (!opts.length) h += `<span class="s" style="font-family:var(--f-ui)">No leg of A or B uses this chain and expiry.</span>`;
    opts.forEach((o, i) => {
      const P = o.tag === "A" ? C.Ap : C.Bp, now = (o.tag === "A" ? C.A : C.B).legs.find(l => l.role === (o.role === "center" ? "short put" : o.role));
      h += `<button type="button" data-i="${i}"${o.why ? ` disabled title="${esc(o.why)}"` : ""}>${key(o.tag)}Use as ${ROLEWORD[o.role]}${now ? ` <span class="muted">now ${fK(now.K)}</span>` : ""}${o.tag === "B" && C.cmp.links.placement && !o.role.startsWith("long") ? ` <span class="muted">· B's strikes then set on their own</span>` : ""}${P.legs === "together" && P.structure !== "straddle" && !o.role.startsWith("long") ? ` <span class="muted">· both legs move</span>` : ""}</button>${o.why ? `<span class="why">${esc(o.why)}</span>` : ""}`;
    });
    openPopAt(h, ev.clientX, ev.clientY, e => {
      const btn = e.target.closest("button[data-i]"); if (!btn || btn.disabled) return;
      const o = opts[+btn.dataset.i], r = smilePlace(S(), C, o.tag, o.role, p.K);
      $("#pop").hidden = true; HOOK.set(r.S9); emit(r.events); refresh();
    });
  }
  function renderSmile() {
    const host = q("#smile"); host.innerHTML = "";
    const groups = smileGroups(C);
    host.classList.toggle("two", groups.length > 1);
    LAST.smileLines = [];
    for (const gr of groups) {
      const box = document.createElement("span"); box.className = "sm"; host.appendChild(box);
      const I = gr.inst, S0 = I.spot, exps = [...new Set(gr.pos.map(p => p[1].exp))];
      box.innerHTML = `<h3>${I.id} · ${exps.map(fmtE).join(" and ")}${I.overridden ? ` <span class="muted" title="spot ${fN(I.spot, 2)} (listed ${fN(I.spotListed, 2)})${I.ivShift ? `, IV ${I.ivShift > 0 ? "+" : MINUS}${Math.abs(I.ivShift)} pts` : ""}">· model quotes</span>` : ""}</h3>`;
      const W = Math.max(box.clientWidth, 300), H = 260, m = { l: 42, r: 10, t: 30, b: 28 }, pts = [];
      for (const e of exps) { const E = I.exp(e); for (const o of E.rows) if (Number.isFinite(o.ivm) && o.bid > 0 && ((o.cp === "P" && o.K <= E.Fpar) || (o.cp === "C" && o.K > E.Fpar))) pts.push(Object.assign({ e }, o)); }
      const Ks = pts.map(p => p.K).concat(gr.pos.flatMap(([, b]) => legsOf(b).map(l => l.K)));
      if (!Ks.length) { box.insertAdjacentHTML("beforeend", `<span class="gna">no quotes</span>`); continue; }
      const xlo = Math.max(Math.min(...Ks) * 0.94, S0 * 0.25), xhi = Math.min(Math.max(...Ks) * 1.04, S0 * 3.5);
      const curves = exps.map(e => { const E = I.exp(e), c = []; for (let i = 0; i <= 160; i++) { const K = xlo + (xhi - xlo) * i / 160; c.push([K, E.smile(K)]); } return { e, c, F: E.Fpar }; });
      const ys = pts.map(p => p.ivm).concat(curves.flatMap(c => c.c.map(r => r[1]))), ylo = Math.min(...ys) * .96, yhi = Math.max(...ys) * 1.04;
      const X = x => m.l + (x - xlo) / (xhi - xlo) * (W - m.l - m.r), Y = y => m.t + (yhi - y) / (yhi - ylo) * (H - m.t - m.b);
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${I.id} implied volatility smile with the chosen strikes` }, box), ax = el("g", { class: "ax" }, svg);
      for (const t of ticks(ylo, yhi, 4)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, (t * 100).toFixed(0) + "%", { "text-anchor": "end" }); }
      for (const t of ticks(xlo, xhi, Math.max(4, Math.floor(W / 70)))) txt(ax, X(t), H - 10, t, { "text-anchor": "middle" });
      el("line", { x1: X(S0), x2: X(S0), y1: m.t, y2: H - m.b, stroke: "var(--ink-3)" }, svg); txt(svg, X(S0) + 3, H - m.b - 4, "spot", { fill: "var(--ink-3)", "font-size": 10 });
      const twoExp = exps.length > 1, colE = e => twoExp ? (e === C.A.exp ? "var(--a)" : "var(--b)") : "var(--ink-2)";
      for (const cv of curves) { el("path", { d: pathOf(cv.c, X, Y), fill: "none", stroke: colE(cv.e), "stroke-width": 1.6 }, svg); if (cv.F > xlo && cv.F < xhi && Math.abs(X(cv.F) - X(S0)) > 2) { el("line", { x1: X(cv.F), x2: X(cv.F), y1: H - m.b - 14, y2: H - m.b, stroke: colE(cv.e), "stroke-dasharray": "2 2" }, svg); txt(svg, X(cv.F) + 3, H - m.b - 16, "fwd", { fill: "var(--ink-3)", "font-size": 10 }); } }
      const used = {};
      for (const [tag, b] of gr.pos) for (const l of legsOf(b)) {
        const x = X(l.K), k = Math.round(x / 6); used[k] = (used[k] || 0) + 1;
        const lab = `${tag}·${l.qty > 0 ? "+" : ""}${l.cp}`; LAST.smileLines.push(`${tag} ${legTag(l)}`);
        el("line", { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: `var(--${tag.toLowerCase()})`, "stroke-width": 1.2, "stroke-dasharray": tag === "B" ? "4 3" : "" }, svg);
        txt(svg, x, m.t - 6 - 11 * (used[k] - 1), lab, { "text-anchor": "middle", fill: `var(--${tag.toLowerCase()})`, "font-size": 10.5, "font-weight": 600 });
      }
      for (const p of pts) {
        const g = el("g", { class: "qpt", tabindex: 0, role: "button", "aria-label": `${fK(p.K)}${p.cp} ${fmtE(p.e)}, place a leg here` }, svg);
        el("circle", { cx: X(p.K), cy: Y(p.ivm), r: 3.6, fill: "var(--surface)", stroke: colE(p.e), "stroke-width": 1.5 }, g);
        el("circle", { cx: X(p.K), cy: Y(p.ivm), r: 7, fill: "transparent" }, g);
        g.addEventListener("click", ev => { ev.stopPropagation(); openLegPop(p, gr, ev); });
        g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); const r = g.getBoundingClientRect(); openLegPop(p, gr, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); } });
        g.addEventListener("pointerenter", ev => showTip(`<span class="h">${fK(p.K)}${p.cp} · ${fmtE(p.e)}</span>${krow("forward Δ", (Math.abs(p.delta) * 100).toFixed(1))}${krow("bid / ask", `${p.bid.toFixed(2)} / ${p.ask.toFixed(2)}`)}${krow("IV mid / fit", `${fP(p.ivm, 1)} / ${fP(p.iv, 1)}`)}<span class="s" style="margin:4px 0 0">click to put a leg on this strike</span>`, ev.clientX, ev.clientY));
        g.addEventListener("pointerleave", hideTip);
      }
    }
    q("#sm-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A legs</span> <span><i style="background:var(--b)"></i>B legs, dashed</span> <span class="muted">+ = long wing</span>`;
  }

  // ============================================================ notes
  function notes() {
    const at = String(INST.asof || ""), ad = /^\d{4}-\d{2}-\d{2}/.test(at) ? `${+at.slice(8, 10)} ${MON[+at.slice(5, 7) - 1]} ${at.slice(0, 4)}` : at, tm = at.slice(11, 16), when = !tm || tm === "16:00" ? "close" : tm + " ET";
    const L = INST.list(), base = L.map(x => INST.base(x.id)).filter(Boolean);
    const nE = [...new Set(base.map(I => I.expiries.length))];
    const num = n => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] || String(n);
    const asof = q("#asof") || document.querySelector("#asof");
    if (asof && !asof.dataset.owner) asof.textContent = `IBKR option quotes at the ${ad} ${when} · spot ${base.map(I => `${I.id} ${I.spotListed}`).join(", ")} · ${nE.length === 1 ? `${num(nE[0])} expiries each` : base.map(I => `${I.id} ${I.expiries.length} expiries`).join(", ")}`;
    const items = [
      "Instruments and positions: an instrument (spot, option chain, smile, strike grid, leverage, HV) is loaded into slot A or B; a position is built on it. Overriding the spot or adding an IV shift re-prices every quote from the model (the credit then comes from model quotes and says so). The scenario IV shock on the P&L grid is different: a shock after entry that leaves the entry prices alone.",
      "One forward per expiry: the parity forward from the listed call and put mids nearest spot. Δ, % OTM, σ distance, ATM, in-the-money status, parity and the implied distribution all use it. On these leveraged ETFs it sits well below spot × e^{rT}, because of borrow cost.",
      "Placing strikes: by forward Δ (call N(d1), put N(−d1) on the forward, so put + call = 100 and 50 is Δ-neutral, not ATM: the at-the-money call is 54–67Δ here), by % OTM from the forward, or by σ distance in units of the position's own ATM σ√T. Each leg takes the listed strike with a bid whose value on that basis is nearest the target. A straddle is one strike, by default the one nearest the forward. A strangle whose legs would meet keeps a strangle by moving the leg that costs least, and says so. A target beyond the last listed strike stops there and is flagged; so are gaps between listed strikes and coarse grids.",
      "Protective wings: a long call above the short call or a long put below the short put, placed on the same basis measured from its own short (Δ of the wing itself, % or σ beyond the short). With no listed strike beyond the short the wing is n/a and the position is shown without it.",
      "Linking A and B: B follows A in every aspect except the instrument until you set an aspect on B; then only that aspect is B's own. A linked B reads A's values on B's own chain, so the strikes can differ; the summary marks any difference you did not ask for.",
      "Smile: refitted on the forward from the out-of-the-money mids (weighted cubic in log-moneyness, one pass dropping outliers); beyond the quoted strikes, total variance continues linearly with its edge slope, capped at Lee's bound.",
      "Marks before expiry: Black-76 on the moved forward with the smile sticky in moneyness. An out-of-the-money leg carries a vol offset that pins it to its traded mid at entry. An in-the-money leg is priced from its out-of-the-money twin through parity, plus the quote premium of its mid over parity, which decays to zero at expiry. So a position filled at mid marks to exactly 0 today with no move, and at natural fill to minus its full spread, whatever the target that chose its strikes.",
      "Fills: mid, or natural (sell at the bid, buy at the ask). With natural fills, marks before expiry also pay half the quoted spread on each leg to close.",
      "Odds: implied is the risk-neutral distribution from the smile (Breeden–Litzenberger on the forward); before expiry it is shrunk by √(t/T). HV30 is a zero-drift lognormal at IBKR's 30-day historical vol times the scaler. Profit means a P&L above 0 at expiry; the breakevens are every price where the payoff crosses 0, so a net debit that cannot profit shows 0% and no breakeven. Under implied odds EV is fill vs mid; the sweep, the overview's EV and recovery use HV30.",
      "σ: the move axis uses each instrument's ATM vol at A's horizon (interpolated in total variance when B does not list A's date), so every panel sees the same scenarios. Strike placement on the σ basis, credit/σ and the recovery hit use the position's own σ to its own expiry; the grid's cones and odds strips use each position's own clock. Labels say which applies when the expiries differ.",
      "Credit and time value: an in-the-money leg's cash credit includes its intrinsic value against spot, paid back at expiry. Time value = credit − intrinsic. Credit/σ, credit per day, credit/margin, the overview, the sweep, × credit units and the equal-credit sizing rule use time value; × credit units fall back to % of notional, and say so, when A's time value is not positive.",
      `Margin (approximate): Reg-T style, 20% × leverage (${levTxt()}) on the naked side, at least 10% × leverage; a side with a wing is charged the smaller of the spread width and the naked charge. IBKR's real leveraged-ETF requirement may differ.`,
      "Sizing: the pair is A − h·B in units of A's notional. Auto = equal notional on one instrument, equal vega across instruments.",
      "Not modelled: correlation between the instruments, early assignment (flagged only), dividends, borrow beyond what the forward implies, leveraged-ETF path decay beyond what the smile implies, vol-of-vol."
    ];
    const nl = q("#notes"); if (nl) nl.innerHTML = items.map(s => `<li>${esc(s)}</li>`).join("");
  }

  // ============================================================ markup and wiring
  const MARKUP = `
  <details class="panel" id="p-over">
    <summary><h2 id="ov-title">Overview</h2><span class="sub" id="ov-sub"></span></summary>
    <span class="ovtools"><span class="seg" id="c-ovv"></span><span class="ovlgd" id="ovlgd"></span><span class="ovcap" id="ovcap"></span></span>
    <div class="ovgrid" id="ovgrid"></div>
    <div class="tblx" id="ovtable" hidden><table class="full" id="full"></table></div>
  </details>
  <section class="panel" id="p-pay">
    <div class="ph"><span class="tools"><label class="chk"><input type="checkbox" id="c-pso">odds strip</label><label class="chk"><input type="checkbox" id="c-pss">±1σ, ±2σ</label></span><h2>Payoff at expiry</h2><span class="lgd" id="pay-lgd"></span></div>
    <div class="chart" id="pay"></div>
    <table class="cmp" id="cmp"></table>
  </section>
  <section class="panel" id="p-grid">
    <div class="ph"><span class="tools">
      <span class="ctl" id="alignCtl" title="Line up A and B by share of each one's life, or by the same calendar date"><span class="seg" id="c-align"></span></span><span class="seg" id="c-gval"></span><span class="seg" id="c-gview"></span>
      <details class="menu" id="m-shock"><summary id="shockSum">Shocks</summary><span class="mb">
        <span class="mt">Shocks after entry</span>
        <span class="mrow"><span class="lbl">IV shock</span><input type="range" id="c-ivs" min="-30" max="60" step="1" aria-label="IV shock in vol points"> <output id="o-ivs"></output></span>
        <span class="mrow"><span class="lbl">Vol rises as spot falls</span><input type="range" id="c-svs" min="0" max="20" step="0.5" aria-label="Vol points added per 10% spot drop"> <output id="o-svs"></output></span>
        <span class="mrow"><label class="chk"><input type="checkbox" id="c-svd">Only on the way down</label></span>
        <span class="mrow cap">Moves marks before expiry: this grid, the joint map and the pins. Entry prices and at-expiry views stay. To re-price the entry itself, give the instrument an IV shift in Positions.</span>
        <span class="mrow"><button class="btn" type="button" id="shockReset">Clear shocks</button></span>
      </span></details>
      <details class="menu" id="m-gdisp"><summary aria-label="Grid display settings">⚙</summary><span class="mb">
        <span class="mt">Grid display</span>
        <span class="mrow"><label class="chk"><input type="checkbox" id="c-gl">Grid lines at the axis ticks</label></span>
        <span class="mrow"><span class="lbl">Contours</span><span class="seg" id="c-ct"></span> <select id="c-cts" aria-label="Contour step"></select></span>
        <span class="mrow"><span class="lbl">Overlays</span><label class="chk"><input type="checkbox" id="c-ovk">Strikes</label> <label class="chk"><input type="checkbox" id="c-ovc">±1σ, ±2σ</label> <label class="chk"><input type="checkbox" id="c-ovb">Breakevens</label> <label class="chk"><input type="checkbox" id="c-ovs">Spot</label> <label class="chk"><input type="checkbox" id="c-ovo">Odds strip</label></span>
        <hr>
        <span class="mrow"><span class="lbl">Colour</span><span class="seg" id="c-cs"></span></span>
        <span class="mrow"><span class="lbl">Range</span><span class="seg" id="c-cr"></span> <span id="crxW">± <input type="number" id="c-crx" min="0.5" max="200" step="0.5"> <span class="cap">% notional</span></span></span>
        <span class="mrow"><label class="chk"><input type="checkbox" id="c-shared">One colour scale for A, B and A − h·B</label></span>
      </span></details>
    </span><h2>P&amp;L through time</h2><span class="info" tabindex="0" id="gInfo">i</span></div>
    <span class="seg gtabs" id="c-gtab"></span>
    <div class="gwrap" id="gwrap"></div>
    <div id="numwrap" hidden>
      <div class="numctl"><span class="ctl"><span class="lbl">Columns</span><select id="c-nm" aria-label="Number of move columns"></select></span><span class="ctl"><span class="lbl">Rows every</span><select id="c-nd" aria-label="Day step"></select></span><button class="btn" id="csvBtn" type="button">Copy CSV</button></div>
      <div class="ntwrap"><table class="ntab" id="ntab"></table></div>
      <textarea id="csvFallback" hidden rows="4" style="width:100%;margin-top:6px"></textarea>
    </div>
    <div class="gfoot" id="gfoot"></div>
    <div class="pins" id="pins"></div>
  </section>
  <section class="panel" id="p-joint"></section>
  <section class="panel" id="p-sweep">
    <div class="ph"><span class="tools"><span class="ctl" style="margin-right:0"><span class="lbl">Vary</span><span class="seg" id="c-sweep"></span></span></span><h2>Strike placement sweep</h2><span class="info" tabindex="0" data-tip="Each line re-picks strikes as the placement value moves on the current basis, everything else held. At expiry, in the page units, with B scaled by the current h. Worst loss uses the worst-loss range from the payoff table. Dashed lines mark the positions as set; each sits on its own curve.">i</span></div>
    <span class="lgd swlgd" id="sw-lgd"></span>
    <div class="sweep" id="sweep"></div>
    <span class="cap swcap" id="sw-cap"></span>
  </section>
  <section class="panel" id="p-rec">
    <div class="ph"><span class="tools"><span class="ctl"><span class="lbl">Hit</span><span class="seg" id="c-rdhit"></span></span><span class="ctl" id="rd-hitin"></span>
      <details class="menu" id="m-rd"><summary>Basis</summary><span class="mb" style="width:330px">
        <span class="mt">How the hit and the growth are measured</span>
        <span class="mrow"><span class="lbl">The hit is a % of</span><span class="seg" id="c-rdbase"></span></span>
        <span class="mrow"><span class="lbl">Capital per position</span><span class="seg" id="c-rdcap"></span></span>
        <span class="mrow"><span class="lbl">Growth per cycle</span><span class="seg" id="c-rdg"></span> <span id="rd-gc"><input type="number" id="c-rdgc" step="0.1" style="width:56px">% a cycle</span></span>
        <span class="cap">With the hit as a % of NAV when it lands, recovery and buffer take the same number of cycles at a constant growth rate. Measured against the starting capital they split: recovery needs ln(1/(1−L)) of log-growth, the buffer only ln(1+L).</span></span></details></span><h2>Recovery dynamics</h2><span class="info" tabindex="0" data-tip="How many cycles of normal compounding one bad hit is worth. Recovery: the hit lands in the first cycle, then the account compounds back to its starting NAV. Buffer: the account compounds first, until the same hit would leave it at or above the starting NAV. A cycle is one roll of the same tenor; real time is whole cycles × days. A kσ hit uses each position's own σ to its own expiry.">i</span></div>
    <div class="rec" id="rec"></div>
  </section>
  <section class="panel" id="p-smile">
    <div class="ph"><span class="lgd tools" id="sm-lgd"></span><h2>Smile and legs</h2><span class="sub">Click a quote to put a leg on exactly that strike.</span></div>
    <div class="smile" id="smile"></div>
  </section>
  <details class="panel notes" id="p-notes"><summary>Method and caveats</summary><ul id="notes"></ul></details>`;

  function wire(opts) {
    opts = opts || {};
    if (opts.getS9) HOOK.get = opts.getS9;
    if (opts.setS9) HOOK.set = opts.setS9;
    if (opts.onEvents) HOOK.onEvents = opts.onEvents;
    HOST = opts.host || document.querySelector("#views");
    if (!HOST) { HOST = document.createElement("div"); HOST.id = "views"; (document.querySelector("#tab-cmp") || document.body).appendChild(HOST); }
    HOST.classList.add("v9views"); HOST.innerHTML = MARKUP;
    const R9 = VSYNC, sv = k => v => setView(k, v), ss = k => v => setScen(k, v);
    seg(q("#c-ovv"), [["chart", "Charts"], ["table", "Table"]], () => V().ovv, sv("ovv"), R9);
    q("#p-over").addEventListener("toggle", () => { if (C) safe(renderOverview, "overview"); });
    q("#ovtable").addEventListener("click", e => { const b = e.target.closest("button[data-set]"); if (!b || b.disabled) return; const c = OV[+b.dataset.i]; if (c) setFromCell(b.dataset.set, c); });
    bindChk("#c-pso", () => V().pso, sv("pso"), R9); bindChk("#c-pss", () => V().pss, sv("pss"), R9);
    q("#cmp").addEventListener("change", e => {
      if (e.target.matches("[data-wl]")) { const v = e.target.value; change(s => { s.scen.wl = v; if (v === "own") { s.scen.wlo = -C.lo; s.scen.whi = C.hi; } }); refresh(); }
      if (e.target.matches("[data-wlo],[data-whi]")) { const v = Math.abs(parseFloat(e.target.value)); if (v > 0) setScen(e.target.matches("[data-wlo]") ? "wlo" : "whi", v); refresh(); }
    });
    seg(q("#c-align"), [["frac", "% of life", "Rows are the same share of each position's life"], ["cal", "Same date", "Rows are calendar days; an expired position keeps its expiry payoff"]], () => SC().align, ss("align"), R9);
    seg(q("#c-gval"), [["pnl", "P&L"], ["contrib", "× odds", "P&L weighted by the odds of each column: shows where the expected value comes from"]], () => V().gval, sv("gval"), R9);
    seg(q("#c-gview"), [["heat", "Heatmap"], ["num", "Numbers"]], () => V().gview, sv("gview"), R9);
    seg(q("#c-gtab"), [["A", "A"], ["B", "B"], ["D", "A − h·B"]], () => V().gtab, sv("gtab"), R9);
    bindRange("#c-ivs", "#o-ivs", () => SC().ivs, ss("ivs"), v => (v > 0 ? "+" : v < 0 ? MINUS : "±") + Math.abs(v) + " vol pts", R9);
    bindRange("#c-svs", "#o-svs", () => SC().svs, ss("svs"), v => v ? `+${v} pts per −10%` : "off", R9);
    bindChk("#c-svd", () => SC().svd, ss("svd"), R9);
    q("#shockReset").addEventListener("click", () => { change(s => { s.scen.ivs = 0; s.scen.svs = 0; }); refresh(); });
    bindChk("#c-gl", () => V().gl, sv("gl"), R9);
    seg(q("#c-ct"), [["zero", "Break-even"], ["lev", "Levels"]], () => V().ct, sv("ct"), R9);
    bindSelect("#c-cts", [[1, "every 1%"], [2, "every 2%"], [5, "every 5%"], [10, "every 10%"], [20, "every 20%"]], () => V().cts, v => setView("cts", +v), R9);
    for (const k of ["ovk", "ovc", "ovb", "ovs", "ovo"]) bindChk("#c-" + k, () => V()[k], sv(k), R9);
    seg(q("#c-cs"), [["comp", "Compressed"], ["lin", "Linear"]], () => V().cs, sv("cs"), R9);
    seg(q("#c-cr"), [["auto", "Full range"], ["fix", "Fixed"]], () => V().cr, sv("cr"), R9);
    const crx = q("#c-crx"); crx.addEventListener("change", () => { const v = parseFloat(crx.value); if (v > 0) setView("crx", v); refresh(); }); R9.push(() => { if (document.activeElement !== crx) crx.value = V().crx; });
    bindChk("#c-shared", () => V().shared, sv("shared"), R9);
    bindSelect("#c-nm", [[9, "9"], [13, "13"], [17, "17"], [25, "25"]], () => V().nm, v => setView("nm", +v), R9);
    bindSelect("#c-nd", [[1, "1 day"], [2, "2 days"], [5, "5 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"]], () => V().nd, v => setView("nd", +v), R9);
    q("#csvBtn").addEventListener("click", () => copyText(GRID.csv || "", q("#csvFallback")));
    q("#pins").addEventListener("click", e => {
      const b = e.target.closest("button[data-k]"); if (b) { const k = +b.dataset.k; change(s => { s.view.pins.splice(k, 1); }); refresh(); }
      if (e.target.id === "pinclr") { setView("pins", []); refresh(); }
    });
    q("#p-joint").addEventListener("click", e => { if (e.target.id !== "jgo") return; const other = INST.list().find(x => x.id !== C.A.tk); if (other) { op("setB", "inst", { id: other.id }); refresh(); } });
    q("#p-joint").addEventListener("input", e => { if (e.target.id === "c-jday") { setView("jday", +e.target.value); refresh(); } });
    seg(q("#c-sweep"), [["both", "Short legs"], ["put", "Put"], ["call", "Call"], ["wingCall", "Protective call"]], () => V().sweep, sv("sweep"), R9);
    // recovery
    seg(q("#c-rdhit"), [["move", "From a move"], ["fixed", "Fixed %"]], () => V().rdHit, sv("rdHit"), R9);
    seg(q("#c-rdbase"), [["nav", "NAV when it lands"], ["start", "starting capital"]], () => V().rdBase, sv("rdBase"), R9);
    seg(q("#c-rdcap"), [["margin", "Margin"], ["notional", "Notional"]], () => V().rdCap, sv("rdCap"), R9);
    seg(q("#c-rdg"), [["ev", "EV · HV30"], ["custom", "Typed"]], () => V().rdG, sv("rdG"), R9);
    q("#rd-hitin").innerHTML = `<span id="rd-mv"><input type="number" id="c-rdk" min="0.25" max="6" step="0.25" style="width:52px">σ <span class="seg" id="c-rddir"></span></span><span id="rd-fx"><input type="number" id="c-rdl" min="1" max="99" step="1" style="width:52px">%</span>`;
    seg(q("#c-rddir"), [["worse", "worse side"], ["down", "down"], ["up", "up"]], () => V().rdDir, sv("rdDir"), R9);
    const num = (id, k, lo, hi) => { const i = q(id); i.addEventListener("change", () => { const v = parseFloat(i.value); if (Number.isFinite(v)) setView(k, clamp(v, lo, hi)); refresh(); }); R9.push(() => { if (document.activeElement !== i) i.value = V()[k]; }); };
    num("#c-rdk", "rdK", 0.25, 6); num("#c-rdl", "rdL", 1, 99); num("#c-rdgc", "rdGc", -20, 50);
    R9.push(() => { const vw = V(); q("#rd-mv").hidden = vw.rdHit !== "move"; q("#rd-fx").hidden = vw.rdHit !== "fixed"; q("#rd-gc").style.visibility = vw.rdG === "custom" ? "visible" : "hidden"; });
    if (typeof ResizeObserver === "function") { let w0 = 0; new ResizeObserver(es => { const w = Math.round(es[0].contentRect.width); if (w0 && Math.abs(w - w0) > 2) refresh(); w0 = w; }).observe(HOST); }
    notes();
    return HOST;
  }
  function render(c) {
    if (!HOST) return;
    C = c || CTX.ctx9(HOOK.get());
    for (const f of VSYNC) f();
    setStick();
    safe(renderOverview, "overview"); safe(renderPayoff, "payoff"); safe(renderCmp, "comparison table");
    safe(renderGrid, "grid"); safe(renderPins, "pins"); safe(renderJoint, "joint"); safe(renderSweep, "sweep");
    safe(renderRecovery, "recovery"); safe(renderSmile, "smile"); safe(notes, "notes");
    requestAnimationFrame(setStick);
  }
  return {
    render, wire, notes, LAST,
    // pure helpers (node-testable): no DOM, they take the context explicitly
    ovVariants, ovCells, sameTrade, sweepSide, sweepData, recRun, recCycles, recTime, gridRows, smileGroups, smileOptions, smilePlace, pairWorst, pairPop
  };
})();
function renderViews(c) { return VIEWS.render(c); }
function wireViews(opts) { return VIEWS.wire(opts); }
