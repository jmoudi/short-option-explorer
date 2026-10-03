// ============================================================ ui9_views: the comparer's view panels (v9)
// Panels: overview, payoff + comparison table, P&L grid + pins + numbers, joint moves, strike sweep, recovery
// dynamics, smile + leg popover, notes. They read only the render context C (CTX.ctx9), the state tree's assumptions and prefs
// state, and INST. Every position name comes from built.label; every strike loop runs over b.legs.
// Page contract: VIEWS.wire({host}) once, then VIEWS.render(C) on every Compare frame. State changes are commands on
// the page's executor; the one compound change that needs the views' own helpers (a click on a smile quote) is the
// PlaceLeg command, whose handler VIEWS.registerCommandHandlers adds.
const VIEWS = (() => {
  let C = null, HOST = null;
  const q = s => HOST.querySelector(s);
  const S = () => page.store.read();
  const V = () => S().prefs, SC = () => S().assumptions;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safe = (f, n) => { try { f(); } catch (e) { console.error("views: " + n, e); } };

  // ---------------------------------------------------------- state changes
  const run = command => page.executor.execute(Object.assign({ source: "views" }, command));
  const setPref = patch => run({ type: Command.SetPref, patch });
  const setAssumption = patch => run({ type: Command.SetAssumption, patch });
  const askFrame = () => page.frames.mark({ cause: FrameCause.Ui });

  // ---------------------------------------------------------- formatting on the current context
  const fU = (v, d) => C.fU(v, d), fUt = (t, s) => C.fUt(t, s), uLab = (u, unit, d) => STATE.uLab(u, unit, d);
  const hTxt = () => C.hTxt(), hb = () => Math.abs(C.h - 1) > 0.005 ? ` ×${C.h.toFixed(2)}` : "";
  const trow = (label, v, cls) => `<span class="r"><span class="k">${cls ? `<i class="sw" style="background:var(--${cls})"></i>` : ""}${label}</span><span class="v ${pn(v)}">${fU(v)}</span></span>`;
  // the sign class follows the printed value: C.fU prints a value that rounds to zero as an unsigned, uncoloured 0
  const pn = (v, d) => { const t = fU(v, d); return t.charAt(0) === MINUS ? "neg" : t.charAt(0) === "+" ? "pos" : ""; };
  // zero-safe fN / fP: a value that rounds to zero at the printed precision prints unsigned ("0.000", "0.0%")
  const fN0 = (v, d = 2) => Number.isFinite(v) ? (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? MINUS : "") + Math.abs(v).toFixed(d) : "–";
  const fP0 = (v, d = 1) => Number.isFinite(v) ? (v < 0 && +Math.abs(v * 100).toFixed(d) !== 0 ? MINUS : "") + Math.abs(v * 100).toFixed(d) + "%" : "–";
  // a printed number is zero when it has digits and none of them is 1–9 ("0.000", "0.0%", "$0", "0.00×")
  const zeroTxt = t => /\d/.test(t) && !/[1-9]/.test(t);
  // the A / B cell: "–" unless both are numbers and B's value, printed with fmt (its cell's own precision), is not zero
  function ratioTxt(x, y, fmt) {
    if (!(Number.isFinite(x) && Number.isFinite(y)) || Math.abs(y) <= 1e-12 || (fmt && zeroTxt(fmt(y)))) return "–";
    const r = x / y; return (Math.abs(r) < 0.005 ? "0.00" : fN(r, 2)) + "×";
  }
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
  // every views host (#views and the Capture host) puts its sticky table heads just below the fixed summary
  const setStick = () => { if (!HOST) { return; } const top = Math.round(stickTop()) + "px"; document.querySelectorAll(".v9views").forEach(host => /** @type {HTMLElement} */ (host).style.setProperty("--v9-stick", top)); };

  // ============================================================ overview: every instrument × expiry, with and without wings
  // the second series shows A's wings when A has any, else A's position with a protective call at A's call-wing value
  function ovVariants(Ap) {
    const w = Ap.wings, any = !!(w.call.on || w.put.on);
    const off = { call: { on: false, value: +w.call.value }, put: { on: false, value: +w.put.value } };
    const on = any ? { call: { on: !!w.call.on, value: +w.call.value }, put: { on: !!w.put.on, value: +w.put.value } } : { call: { on: true, value: +w.call.value }, put: { on: false, value: +w.put.value } };
    const word = on.call.on && on.put.on ? "+ both wings" : on.call.on ? "+ call wing" : "+ put wing";
    return [{ key: "plain", wings: off, word: "" }, { key: "wing", wings: on, word }];
  }
  // every instrument at its listed spot and IV: "Set as A/B" loads exactly what the overview shows, so a spot/IV
  // override on A or B is not carried into it (that side is drawn as its own point instead)
  const ovSlot = (Cx, id) => ({ id });
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
    crs: { l: "Credit/σ", f: b => b.tv / (b.S * b.sig), kind: "ratio", fmt: v => fN0(v, 3), tip: "Credit ÷ (spot × ATM IV × √T): credit per unit of the expiry's own implied move, σ to its own expiry. In-the-money legs count time value only" },
    crd: { l: "Credit per day", f: b => b.tv / b.S / b.dte, kind: "money", d: 3 },
    ev: { l: "EV at period vol", f: b => { const s = C.statsAtPeriodVol(b); return s ? s.ev / b.S : NaN; }, kind: "money", d: 2, zero: true, tip: "" },
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
    if (M.kind === "pct") return fP0(v, 0);
    const x = v * b.S * 100, xd = Math.abs(x).toFixed(Math.abs(x) < 10 ? 2 : 0), usd = ` <span class="muted">${x < 0 && +xd !== 0 ? MINUS : ""}$${xd}</span>`;
    return (M.zero ? fS : fP0)(v, M.d ?? 1) + (plain ? "" : usd);
  }
  const mk = (sh, x, y, r, fill, col) => sh === "c" ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${col}" stroke-width="1.6"/>` : `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="${col}" stroke-width="1.6"/>`;
  const wingFlag = b => b.na ? null : b.flags.find(f => f.code === "WING_NA");
  const cellDesc = c => `${c.b.label.full}${wingFlag(c.b) ? ` <span class="warnc">! ${esc(wingFlag(c.b).text)}</span>` : ""}`;
  // "Set as A/B": that side takes the cell's instrument at its listed spot and IV, expiry and wings. An override the
  // side had is dropped (also on the same instrument), and the toast says so
  function setFromCell(side, c) {
    const w = c.wings, wing = s => w[s].on ? { on: true, value: w[s].value } : false;
    const I = side === "A" ? C.instA : C.instB, cur = side === "A" ? C.Ap.inst : C.Bp.inst, had = !!(I && I.overridden);
    const inst = had && cur.id === c.id ? { id: c.id, spot: INST.base(c.id).spotListed, ivShift: 0 } : { id: c.id };
    const ov = had ? [Math.abs(I.spot - I.spotListed) > 1e-9 * I.spotListed ? `spot ${fPx2(I.spot)}` : "", I.ivShift ? `IV ${I.ivShift > 0 ? "+" : MINUS}${+Math.abs(I.ivShift).toFixed(2)} pts` : ""].filter(Boolean).join(", ") : "";
    const leadNote = had ? `${side} now uses ${c.id} at its listed spot and IV, as the overview shows it; ${side}'s ${I.id} override (${ov}) is off` : "";
    run({ type: Command.SetFrom, side, spec: { inst, exp: c.e, wings: { call: wing("call"), put: wing("put") } }, leadNote });
  }
  let OV = [];
  function renderOverview() {
    const P = q("#p-over");
    q("#ov-title").textContent = `Overview of all ${ovCount()} positions`;
    q("#ov-sub").textContent = `${INST.list().map(x => x.id).join(" and ")}, every listed expiry, with and without wings · open to scan and pick A or B`;
    if (!P.open) return;
    const vw = V(), table = vw.ovv === "table";
    OV = ovCells(C);
    const isA = c => sameTrade(c.b, C.A), isB = c => sameTrade(c.b, C.B), aOwnOn = !C.A.na && !OV.some(isA), bOwnOn = !C.B.na && !OV.some(isB);
    const ovd = s => { const I = s === "A" ? C.instA : C.instB; return !!(I && I.overridden); };
    const ownTxt = s => `${s} differs from every point${ovd(s) ? " (its ✎ spot/IV override is not applied here)" : ""}, so it is drawn as its own ${s === "A" ? "A-coloured" : "orange"} point`;
    q("#ovgrid").hidden = table; q("#ovtable").hidden = !table; q("#ovlgd").hidden = table;
    const nI = INST.list().length;
    let lg = "";
    for (let i = 0; i < nI; i++) for (let j = 0; j < 2; j++) { const y = serStyle(i, j); lg += `<span><svg width="30" height="12" aria-hidden="true"><line x1="0" x2="30" y1="6" y2="6" stroke="${y.col}" stroke-width="1.8" stroke-dasharray="${y.dash}"/>${mk(y.shape, 15, 6, 3.5, y.fill, y.col)}</svg>${esc(serName(OV, i, j))}</span>`; }
    q("#ovlgd").innerHTML = lg + `<span><svg width="20" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--a)" stroke-width="2"/></svg>A <svg width="20" height="14" aria-hidden="true" style="margin-left:6px"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--b)" stroke-width="2"/></svg>B</span>`;
    const Ap = C.Ap, place = Ap.structure === "straddle" ? (Ap.values.center === "atm" ? "the strike nearest the forward" : `center ${RULE.fmtV(+Ap.values.center, Ap.basis)}`) : `${RULE.fmtV(+Ap.values.put, Ap.basis)} put, ${RULE.fmtV(+Ap.values.call, Ap.basis)} call`;
    const vols = INST.ids().map(id => `${id} ${C.volOf(id).label}`).join(", ");
    q("#ovcap").innerHTML = `Each point is A's ${Ap.structure} placed by A's rule (${place}) and filled at ${Ap.fill === "mid" ? "mid" : "natural"}, on each instrument's own chain at its listed spot and IV${aOwnOn ? "; " + ownTxt("A") : ""}${bOwnOn ? "; " + ownTxt("B") : ""}. Set as A or B loads that listed instrument, without spot or IV overrides. Values are % of each position's own notional, $ per contract in the tooltips. Profit odds are ${SC().dist === Odds.Implied ? "implied" : "at each ticker's period vol"}; EV always uses the period vol (${esc(vols)}), since under implied odds it is just fill vs mid. Worst loss covers ${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}${C.unit === "sig" ? " (each instrument's σ over A's horizon)" : C.unit === "pts" ? ` on ${C.A.tk}, the same % elsewhere` : ""}.`;
    if (table) return renderOvTable(isA, isB);
    const host = q("#ovgrid"); host.innerHTML = "";
    const dts = [...new Set(OV.map(c => c.dte).filter(Number.isFinite))].sort((a, b) => a - b), expAt = d => OV.find(c => c.dte === d).e;
    const anyI = OV.some(c => !c.b.na && c.b.intr > 0) || (aOwnOn && C.A.intr > 0) || (bOwnOn && C.B.intr > 0);
    OVM.rom.tip = `Approximate margin: Reg-T style, 20% × leverage (${levTxt()}). In-the-money legs count time value only`;
    OVM.ev.l = `EV ${C.volOddsText({ ids: INST.ids(), isCompact: true })}`;
    OVM.ev.tip = `Expected P&L at expiry under a zero-drift lognormal at each ticker's period vol: ${INST.ids().map(id => `${id} ${C.volOf(id).label}`).join(", ")}`;
    for (const k of Object.keys(OVM)) {
      const M0 = OVM[k], M = k === "cr" && anyI ? Object.assign({}, M0, { l: "Credit, time value", tip: "Credit minus intrinsic value at entry; for out-of-the-money legs it is the whole credit. Cash credit is in the tooltip" }) : M0;
      const box = document.createElement("span"); box.className = "ovc"; host.appendChild(box);
      box.innerHTML = `<h3>${M.l}${M.tip ? `<span class="info" tabindex="0" data-tip="${esc(M.tip)}">i</span>` : ""}</h3>`;
      const W = Math.max(box.clientWidth, 220), Hh = 162, m = { l: 48, r: 12, t: 12, b: 32 };
      const vals = OV.map(c => Object.assign({}, c, { v: c.b.na || !c.sx ? NaN : M.f(c.b, c.sx) }));
      const owns = [["A", aOwnOn, C.A, C.sa], ["B", bOwnOn, C.B, C.sb]].filter(o => o[1]).map(([who, , b, sx]) => ({ b, sx, own: who, dte: b.dte, v: sx ? M.f(b, sx) : NaN }));
      const fin = vals.concat(owns).map(p => p.v).filter(Number.isFinite);
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
      for (const o of owns) if (Number.isFinite(o.v)) { const x = X(o.dte, o.own === "A" ? -8 : 8), y = Y(o.v); el("circle", { cx: x, cy: y, r: 3.6, fill: `var(--${o.own.toLowerCase()})` }, svg); pts.push({ p: o, x, y }); }
      const aPt = aOwnOn ? pts.find(t => t.p.own === "A") : pts.find(t => !t.p.own && isA(t.p)), bPt = bOwnOn ? pts.find(t => t.p.own === "B") : pts.find(t => !t.p.own && isB(t.p));
      if (bPt) el("circle", { cx: bPt.x, cy: bPt.y, r: aPt && Math.hypot(aPt.x - bPt.x, aPt.y - bPt.y) < 4 ? 11.5 : 8, fill: "none", stroke: "var(--b)", "stroke-width": 2.2 }, svg);
      if (aPt) el("circle", { cx: aPt.x, cy: aPt.y, r: 8, fill: "none", stroke: "var(--a)", "stroke-width": 2.2 }, svg);
      const hov = el("circle", { r: 10, fill: "none", stroke: "var(--ink-2)", "stroke-width": 1, visibility: "hidden" }, svg);
      const hit = el("rect", { x: 0, y: 0, width: W, height: Hh - m.b + 6, fill: "transparent", style: "cursor:pointer" }, svg);
      const near = (ev, rad) => { const r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * W / r.width, my = (ev.clientY - r.top) * Hh / r.height; return pts.map(t => Object.assign({}, t, { dd: Math.hypot(t.x - mx, t.y - my) })).filter(t => t.dd <= rad).sort((a, b) => a.dd - b.dd); };
      const cands = n => n.filter(t => !t.p.own);
      hit.addEventListener("pointermove", ev => {
        const n = near(ev, 16); if (!n.length) { hov.setAttribute("visibility", "hidden"); hideTip(); return; }
        const t = n[0], c = cands(n), b = t.p.b; hov.setAttribute("cx", t.x); hov.setAttribute("cy", t.y); hov.setAttribute("visibility", "visible");
        showTip(`<span class="h">${t.p.own ? t.p.own + ": " : ""}${esc(b.label.full)}</span>${wingFlag(b) ? `<span class="s">! ${esc(wingFlag(b).text)}</span>` : ""}${krow(M.l, b.na ? "n/a" : fOwn(t.p.v, b, M))}${k === "cr" && !b.na && b.intr > 0 ? krow("Cash credit", fOwn(b.cr / b.S, b, M)) : ""}<span class="s" style="margin:4px 0 0">${t.p.own ? `${t.p.own}'s own position${ovd(t.p.own) ? " (✎ override)" : ""}; edit ${t.p.own} in Positions` + (c.length ? " · click to pick a nearby position" : "") : "click to set as A or B"}${c.length > 1 ? ` · ${c.length} positions here` : ""}</span>`, ev.clientX, ev.clientY);
      });
      hit.addEventListener("pointerleave", () => { hov.setAttribute("visibility", "hidden"); hideTip(); });
      hit.addEventListener("click", ev => {
        ev.stopPropagation(); const close = cands(near(ev, 16)); if (!close.length) return;
        const html = close.map((t, i) => { const a = isA(t.p), bb = isB(t.p); return `<span class="cand"><span class="h">${cellDesc(t.p)}</span><span class="s">${t.p.b.na ? "n/a: " + esc(t.p.b.naReason) : `${M.l} ${fOwn(t.p.v, t.p.b, M, true)}`}</span><span class="btns"><button type="button" data-i="${i}" data-set="A"${a ? " disabled" : ""}>${key("A")}Set as A</button><button type="button" data-i="${i}" data-set="B"${bb ? " disabled" : ""}>${key("B")}Set as B</button></span></span>`; }).join("");
        openPopAt(html, ev.clientX, ev.clientY, e => { const b = e.target.closest("button[data-set]"); if (!b || b.disabled) return; $("#pop").hidden = true; setFromCell(b.dataset.set, close[+b.dataset.i].p); });
      });
    }
  }
  // overview Breakevens cell: one price per line, low first ("none" when the position never profits at expiry)
  const besTxt = bes => bes && bes.length ? bes.map(fPx2).join("<br>") : "none";
  function renderOvTable(isA, isB) {
    const cols = [OV.some(c => !c.b.na && c.b.intr > 0) ? "Credit, time value" : "Credit", "Credit / σ", "Credit per day", `EV ${C.volOddsText({ ids: INST.ids(), isCompact: true })}`, "Profit odds", "Worst loss", "Wing cost · pays odds", "Credit / margin", "Breakevens"];
    let h = `<thead><tr><th class="st l">Set</th><th class="st2 l">Position</th>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    const order = OV.map((c, i) => Object.assign({ idx: i }, c)).sort((a, b) => a.dte - b.dte || a.j - b.j || a.i - b.i);
    let lastD = null;
    for (const c of order) {
      const b = c.b, x = c.sx, a = isA(c), bb = isB(c), sep = lastD !== null && c.dte !== lastD; lastD = c.dte;
      const cls = `${sep ? "sep" : ""} ${a ? "isA" : ""} ${bb ? "isB" : ""}`;
      const btns = `<button type="button" data-i="${c.idx}" data-set="A"${a ? " disabled" : ""} title="Set as A">A</button> <button type="button" data-i="${c.idx}" data-set="B"${bb ? " disabled" : ""} title="Set as B">B</button>`;
      const wf = wingFlag(b), name = `<span title="${esc(b.label.full)}">${esc(b.label.short)}</span><small>${esc(b.na ? "n/a" : b.label.tab.slice(b.tk.length + 1))}${wf ? `<span class="warnc wn" title="${esc(wf.text)}">! ${wf.leg === "wingPut" ? "put" : "call"} wing n/a</span>` : ""}</small>`;
      if (b.na || !x) { h += `<tr class="${cls}"><td class="st">${btns}</td><td class="st2 l">${name}</td><td class="l" colspan="${cols.length}">n/a: ${esc(b.naReason)}</td></tr>`; continue; }
      const o = (k, v) => fOwn(v, b, OVM[k], true), hv = C.statsAtPeriodVol(b);
      // the cash credit sits under the time value, as the Position cell stacks its parts (keeps the table narrow)
      const cash = b.intr > 0 ? `<small class="cash">cash ${o("cr", b.cr / b.S)}</small>` : "";
      const wp = OVM.wingp.f(b, x);
      h += `<tr class="${cls}" title="${esc(b.label.full)} · $ per contract: ${b.cr < 0 ? "net debit" : "credit"} $${Math.abs(b.cr * 100).toFixed(0)}${b.intr > 0 ? `, time value $${(b.tv * 100).toFixed(0)}` : ""}, EV ${C.volOddsText({ ids: [b.tk] })} $${hv ? (hv.ev * 100).toFixed(0) : "–"}, worst $${(x.worst * 100).toFixed(0)}"><td class="st">${btns}</td><td class="st2 l">${name}</td><td>${o("cr", b.tv / b.S)}${cash}</td><td>${fN0(b.tv / (b.S * b.sig), 3)}</td><td>${o("crd", b.tv / b.S / b.dte)}</td><td>${hv ? o("ev", hv.ev / b.S) : "–"}</td><td>${fP(x.pop, 0)}</td><td>${o("worst", x.worst / b.S)}</td><td>${b.wingPx > 0 ? `${o("wingc", b.wingPx / b.S)}<small class="cash">pays ${Number.isFinite(wp) ? fP(wp, 0) : "–"}</small>` : "–"}</td><td>${fP0(b.tv / b.margin, 1)}</td><td>${besTxt(x.bes)}</td></tr>`;
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
  // the roundest number in [a, b] (0 < a <= b) with its step: the largest 1/2/5 step that has a multiple there,
  // and that step's outermost multiple
  function niceIn(a, b) {
    if (!(a > 0 && b >= a)) return null;
    for (let e = Math.ceil(Math.log10(b)); e > -15; e--) for (const m of [5, 2, 1]) {
      const st = m * Math.pow(10, e), v = +(Math.floor(b / st + 1e-9) * st).toPrecision(12);
      if (v > 0 && v >= a * (1 - 1e-9) && v <= b * (1 + 1e-9)) return { v, step: st };
    }
    return null;
  }
  // payoff y ticks [{v, step}]: nice ticks over [lo, hi]; when one side of zero spans more than 12% of the range but
  // got no tick (a lopsided range), the outermost tick of a finer nice set on that side is added, at least 14px from
  // the zero line (px = chart height), labelled at its own step; on a short panel (the 92px A − h·B panel), where no
  // finer set has a tick in that band, the roundest number between 12px from zero and the edge is used (12px keeps
  // two 10.5px labels apart and buys a rounder number than a 14px floor would), so every side 12px or taller has a tick
  function payTicks(lo, hi, n, px) {
    const t = ticks(lo, hi, n), step = t.length > 1 ? t[1] - t[0] : (hi - lo) || 0.01, out = t.map(v => ({ v, step }));
    for (const sg of [1, -1]) {
      if (!(sg * (sg > 0 ? hi : lo) > 0.12 * (hi - lo)) || t.some(v => sg * v > 1e-12)) continue;
      let got = false;
      for (const k of [2, 3, 4, 6]) {
        const tf = ticks(lo, hi, n * k), sf = tf.length > 1 ? tf[1] - tf[0] : step;
        const cand = tf.filter(v => sg * v > 1e-12 && Math.abs(v) / (hi - lo) * px >= 14);
        if (cand.length) { const v = sg > 0 ? Math.max(...cand) : Math.min(...cand); out.push({ v, step: sf }); got = true; break; }
      }
      if (!got) { const r = niceIn(12 / px * (hi - lo), sg > 0 ? hi : -lo); if (r) out.push({ v: sg * r.v, step: r.step }); }
    }
    return out.sort((a, b) => a.v - b.v);
  }
  function renderPayoff() {
    const time = readPayoffTime();
    describeLensControls(time);
    const lens = V().payLens;
    if (lens === PayLens.Decay) { renderDecayLens(time); return; }
    if (lens === PayLens.Move || lens === PayLens.Zone || lens === PayLens.Ev) { describePayoffTime(time); LENSES.render({ lens, time, kit: readLensKit() }); return; }
    renderPriceLens(time);
  }
  // what the lenses in ui_lens.js may use: the render context, formatting, the day stops and the panel's slots
  function readLensKit() {
    return {
      C, V, host: q("#pay"), setPref, stopReplay, tauAfter, dayLabel, payTicks, fU, fUt, pn, hb, esc,
      title: text => { q("#pay-h").textContent = text; }, legend: html => { q("#pay-lgd").innerHTML = html; },
      read: html => { q("#pay-read").innerHTML = html; }, keep: readings => { Object.assign(LAST, readings); }
    };
  }
  // the P&L and day-change lenses: values across the move axis at the chosen stop, A − B below
  function renderPriceLens(time) {
    const host = q("#pay"); host.innerHTML = "";
    const { A, B, lo, hi } = C, vw = V(), W = Math.max(host.clientWidth, 600), two = !C.same;
    const n = 600, us = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
    const kinks = [];
    for (const [b, inv] of [[A, C.uOfSA], [B, C.uOfSB]]) for (const K of legsOf(b).map(l => l.K)) { const u = inv(K); if (u > lo && u < hi) kinks.push(u); }
    LAST.payKinks = kinks.slice();
    const ux = [...us, ...kinks].sort((p, r) => p - r);
    // one time at a time: the chosen days left, with the expiry payoff behind it as a faint reference
    const lens = V().payLens === PayLens.Day ? PayLens.Day : PayLens.Pnl, at = readLensValues({ time, lens });
    const a = ux.map(u => [u, at.a(u)]), b = ux.map(u => [u, at.b(u)]), df = ux.map(u => [u, at.a(u) - at.b(u)]);
    const ghosts = time.isExpiry || lens === PayLens.Day ? [] : [{ side: "b", points: ux.map(u => [u, C.pB(u)]) }, { side: "a", points: ux.map(u => [u, C.pA(u)]) }];
    const ext = at.ext ? [{ side: "b", points: C.B.na ? [] : ux.map(u => [u, at.ext.b(u)]) }, { side: "a", points: C.A.na ? [] : ux.map(u => [u, at.ext.a(u)]) }] : [];
    const ivPts = lens === PayLens.Pnl && !time.isExpiry ? V().payIv : 0, ivBands = ivPts ? readIvBands({ time, ivPts, ux }) : [];
    describePayoffTime(time);
    if (lens === PayLens.Day) { q("#pay-h").textContent = at.title; }
    const ys = [...a, ...b, ...ghosts.flatMap(g => g.points), ...ext.flatMap(g => g.points), ...ivBands.flatMap(g => g.points)].map(p => p[1]).filter(Number.isFinite);
    let ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0); const pad = (yhi - ylo) * 0.08 || 0.01; ylo -= pad; yhi += pad;
    const dys = df.map(p => p[1]).filter(Number.isFinite); let dlo = Math.min(...dys, 0), dhi = Math.max(...dys, 0); const dp = (dhi - dlo) * 0.14 || 0.005; dlo -= dp; dhi += dp;
    const H1 = 270, H2 = 92, nStrip = vw.pso ? (two || diffExp() ? 2 : 1) : 0, H3 = nStrip * 22, gap = 14, m = { l: 62, r: 54, t: two && C.unit !== "sig" ? 28 : 16, b: two ? 52 : 40 };
    const y1 = m.t, y2 = y1 + H1 + gap, y3 = y2 + H2 + (H3 ? gap : 0), H = y3 + H3 + m.b;
    const X = u => m.l + (u - lo) / (hi - lo) * (W - m.l - m.r), Y = v => y1 + (yhi - v) / (yhi - ylo) * H1, Y2 = v => y2 + (dhi - v) / (dhi - dlo) * H2;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Payoff at expiry for A, B and the pair" }, host), ax = el("g", { class: "ax" }, svg);
    // both panels: a lopsided range still gets a tick on its short side (payTicks)
    const t1 = payTicks(ylo, yhi, 6, H1), t2 = payTicks(dlo, dhi, 3, H2);
    LAST.payTicks = t1.map(t => t.v); LAST.payDiffTicks = t2.map(t => t.v); LAST.payDiffRange = [dlo, dhi];
    for (const { v: t, step } of t1) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 6, Y(t) + 3.5, fUt(t, step || 0.01), { "text-anchor": "end" }); }
    for (const { v: t, step } of t2) { el("line", { x1: m.l, x2: W - m.r, y1: Y2(t), y2: Y2(t) }, ax); txt(ax, m.l - 6, Y2(t) + 3.5, fUt(t, step || 0.01), { "text-anchor": "end" }); }
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
    drawIvBands({ svg, bands: ivBands, X, Y, ivPts, xEnd: W - m.r });
    for (const { side, points } of ghosts) { el("path", { d: pathOf(points, X, Y), fill: "none", stroke: `var(--${side})`, "stroke-width": 1.2, "stroke-opacity": .35, "stroke-linejoin": "round" }, svg); }
    el("path", { d: pathOf(b, X, Y), fill: "none", stroke: "var(--b)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    el("path", { d: pathOf(a, X, Y), fill: "none", stroke: "var(--a)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-dasharray": C.diff.identical ? "6 4" : "" }, svg);
    // extrapolation: the accent colour, dashed, and said in words on the chart itself
    for (const { side, points } of ext) {
      el("path", { d: pathOf(points, X, Y), fill: "none", stroke: "var(--y)", "stroke-width": side === "a" ? 2.2 : 1.6, "stroke-dasharray": side === "a" ? "7 4" : "2 3", "stroke-linejoin": "round" }, svg);
    }
    if (at.ext) { txt(svg, m.l + 8, y1 + 14, `EXTRAPOLATED · ${at.extWords}`, { fill: "var(--y)", "font-size": 11.5, "font-weight": 700, ...halo }); }
    drawMoveZones({ svg, X, lo, hi, y: y3 + H3, elapsed: time.elapsed });
    const dl = df.filter(p => Number.isFinite(p[1])), leftHigh = dl.length && dl[0][1] > (dlo + dhi) / 2;
    txt(svg, m.l + 6, leftHigh ? y2 + H2 - 6 : y2 + 13, `A − ${hTxt()}`, { fill: "var(--ink)", "font-size": 11.5, "font-weight": 600, ...halo });
    const endLab = (pts, s, col, other) => { const p = pts[pts.length - 1], o = other[other.length - 1]; if (!p || !Number.isFinite(p[1])) return; const above = !Number.isFinite(o[1]) || p[1] >= o[1]; txt(svg, W - m.r + 5, Y(p[1]) + (above ? -2 : 10) + 4, s, { "text-anchor": "start", fill: `var(--${col})`, "font-size": 11.5, "font-weight": 600, ...halo }); };
    if (C.diff.identical && !hb()) endLab(a, "A = B", "ink", a); else { endLab(a, "A", "a", b); endLab(b, "B" + hb(), "b", a); }
    const naSides = [["A", A], ["B", B]].filter(([, x]) => x.na);
    if (naSides.length) txt(svg, m.l + 10, y1 + 18, naSides.map(([t, x]) => `${t} is n/a: ${x.naReason}`).join(" · "), { fill: "var(--neg)", "font-size": 12, "font-weight": 600, ...halo });
    q("#pay-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A ${esc(C.labels.A.full)}</span> <span><i style="background:var(--b)"></i>B${hb()} ${esc(C.labels.B.full)}</span>${ghosts.length ? ` <span class="muted">· faint: the same at expiry</span>` : ""}${at.ext ? ` <span class="ybadge">extrapolated (dashed): ${esc(at.extWords)}</span>` : ""}${ivBands.length ? ` <span class="muted">· shaded: IV ±${ivPts} points</span>` : V().payIv && lens === PayLens.Pnl ? ` <span class="muted">· IV band: none at expiry (no time value left)</span>` : ""}${C.diff.identical ? ` <span class="vnote">A and B are the same trade</span>` : ""}${C.unitsNote ? ` <span class="badge">${esc(C.unitsNote)}</span>` : ""}`;
    const cross = el("line", { y1: y1, y2: y3 + H3, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const dots = ["a", "b", "ink"].map(c => el("circle", { r: 4, fill: `var(--${c})`, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg));
    const hit = el("rect", { x: m.l, y: y1, width: W - m.l - m.r, height: y3 + H3 - y1, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, u = clamp(lo + (px - m.l) / (W - m.l - m.r) * (hi - lo), lo, hi);
      cross.setAttribute("x1", X(u)); cross.setAttribute("x2", X(u)); cross.setAttribute("visibility", "visible");
      const va = at.a(u), vb = at.b(u), vd = va - vb;
      const lensRows = (lens === PayLens.Day ? `<span class="s">${esc(at.since)}</span>` : "") + (at.ext ? `<span class="s" style="color:var(--y)">extrapolated to expiry</span>${C.A.na ? "" : trow("A", at.ext.a(u), "y")}${C.B.na ? "" : trow("B" + hb(), at.ext.b(u), "y")}` : "") + moveZoneRow({ u, elapsed: time.elapsed }) + describeIvRows({ time, ivPts, u });
      [[va, Y], [vb, Y], [vd, Y2]].forEach(([v, f], i) => { if (Number.isFinite(v)) { dots[i].setAttribute("cx", X(u)); dots[i].setAttribute("cy", f(v)); dots[i].setAttribute("visibility", "visible"); } else dots[i].setAttribute("visibility", "hidden"); });
      showTip(`<span class="h">${uLab(u, C.unit, 2)} · ${C.same ? A.tk : tkOf("A")} ${fPx2(C.toSA(u))} <span class="muted">${fS(C.toSA(u) / A.S - 1, 1)}</span></span>${C.same ? "" : `<span class="s">${tkOf("B")} ${fPx2(C.toSB(u))} (${fS(C.toSB(u) / B.S - 1, 1)})</span>`}${trow("A", va, "a")}${trow("B" + hb(), vb, "b")}${trow("A − " + hTxt(), vd, "ink")}${lensRows}${time.isExpiry || lens === PayLens.Day ? "" : describeExpiryRows(u)}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dots.forEach(d => d.setAttribute("visibility", "hidden")); });
    // the axes answer questions too: a price below, a P&L on the left of each panel
    const plotW = W - m.l - m.r;
    AXES.attach({ svg, orient: "x", band: { x: m.l, y: y3 + H3, width: plotW, height: H - y3 - H3 }, guide: { from: y1, to: y3 + H3 },
      toValue: px => clamp(lo + (px - m.l) / plotW * (hi - lo), lo, hi), toPx: X, describe: describePriceOnAxis });
    AXES.attach({ svg, orient: "y", band: { x: 0, y: y1, width: m.l, height: H1 }, guide: { from: m.l, to: W - m.r },
      toValue: py => yhi - (py - y1) / H1 * (yhi - ylo), toPx: Y, describe: lens === PayLens.Day ? v => `<span class="h">${esc(at.since)} ${fU(v)}</span>${describeUnitRows(v)}` : describeValueOnAxis });
    AXES.attach({ svg, orient: "y", band: { x: 0, y: y2, width: m.l, height: H2 }, guide: { from: m.l, to: W - m.r },
      toValue: py => dhi - (py - y2) / H2 * (dhi - dlo), toPx: Y2, describe: v => `<span class="h">A − ${hTxt()} ${time.isExpiry ? "at expiry" : esc(time.phrase)} ${fU(v)}</span>${describeUnitRows(v)}` });
  }
  // ---------------------------------------------------------- the EV explainer (a knob on the table's EV row)
  // credit, the expected settlement at the period vol (the plug, so the lines add up), EV in $, on margin and notional;
  // the odds of the recovery panel's hit and the three growth rates. Under implied odds the row is fill vs mid first.
  /** @param {{ isImpliedRow: boolean }} input */
  function describeEvExplainer({ isImpliedRow }) {
    const blocks = [["A", C.A], ["B", C.B]].map(([side, b]) => {
      if (b.na) { return ""; }
      const stats = C.statsAtPeriodVol(b), vol = C.volOf(b.tk);
      if (!stats) { return ""; }
      const credit = b.cr * 100, ev = stats.ev * 100, settlement = ev - credit;
      const usdSigned = v => formatSigned({ value: v, digits: 0, prefix: "$" });
      const implied = C.stats(b, Odds.Implied), impliedEv = implied ? implied.ev * 100 : NaN;
      const hit = { basis: V().rdHit, k: V().rdK, side: V().rdDir, fraction: V().rdL / 100 };
      const rec = RECOVERY.computeRecovery({ built: b, vol: vol.pct / 100, hit, capital: Capital.Margin, growth: GrowthRate.IfNoSuchHit, typedRate: 0 });
      const hitLine = rec.status === "ok" ? krow(`loss ≥ ${(rec.Lmargin * 100).toFixed(1)}% of margin (the recovery hit)`, `${(rec.q * 100).toFixed(1)}% a cycle`) : "";
      const rateLine = rec.status === "ok" ? krow("growth a cycle · best case", growthTxt(rec.rates.best)) + krow("growth a cycle · if no such hit", growthTxt(rec.rates.noHit)) + krow("growth a cycle · average", growthTxt(rec.rates.average)) : "";
      return `<span class="s">${side} · ${esc(b.label.full)}</span>` +
        (isImpliedRow ? krow("this row (implied odds): fill vs mid", usdSigned(impliedEv)) : "") +
        krow("credit", `${usdSigned(credit)} a contract`) + krow(`expected settlement at ${esc(vol.label)}`, usdSigned(settlement)) +
        krow("expected value", `${usdSigned(ev)} = ${formatSigned({ value: stats.ev / b.margin * 100, digits: 1, suffix: "%" })} of margin · ${formatSigned({ value: stats.ev / b.S * 100, digits: 1, suffix: "%" })} of notional`) +
        hitLine + rateLine;
    }).join("");
    return blocks;
  }
  // ---------------------------------------------------------- what a value on an axis means (payoff and friends)
  // the share of a position's expiry distribution whose P&L (page units, scaled like its line) is at least threshold
  /** @param {{ b: any, d: any, threshold: number, scale: number }} input */
  function probAtLeast({ b, d, threshold, scale }) {
    if (!b || b.na || !d || !d.cdf) { return NaN; }
    let mass = 0, total = 0;
    for (let i = 1; i <= d.n; i++) {
      const cell = d.cdf[i] - d.cdf[i - 1];
      if (cell <= 0) { continue; }
      total += cell;
      const price = b.S * Math.exp((d.u[i] + d.u[i - 1]) / 2);
      if (scale * POS.payoff(b, price) / b.S >= threshold - 1e-12) { mass += cell; }
    }
    return total > 0 ? mass / total : NaN;
  }
  const fPct = p => Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "–";
  // signed with the typographic minus; a value that rounds to zero prints unsigned
  /** @param {{ value: number, digits: number, prefix?: string, suffix?: string }} input */
  function formatSigned({ value, digits, prefix = "", suffix = "" }) {
    const text = Math.abs(value).toFixed(digits);
    const sign = +text === 0 ? "" : value < 0 ? MINUS : "+";
    return `${sign}${prefix}${text}${suffix}`;
  }
  // one value in every reading unit at once
  function describeUnitRows(v) {
    const A = C.A, rows = [["% of A's notional", formatSigned({ value: v * 100, digits: 2, suffix: "%" })]];
    if (!A.na) { rows.push(["$ per A contract", formatSigned({ value: v * A.S * 100, digits: 0, prefix: "$" })]); }
    if (!A.na && A.tv > 0) { rows.push([A.intr > 0 ? "× A's time value" : "× A's credit", formatSigned({ value: v / (A.tv / A.S), digits: 2, suffix: "×" })]); }
    if (!A.na && A.margin > 0) { rows.push(["% of A's margin", formatSigned({ value: v * A.S / A.margin * 100, digits: 1, suffix: "%" })]); }
    return rows.map(([k, val]) => krow(k, val)).join("");
  }
  // a price on the move axis: where it is in σ (implied and period vol), and the odds of ending beyond or touching it
  function describePriceOnAxis(u) {
    const parts = [`<span class="h">${uLab(u, C.unit, 2)}</span>`];
    for (const [side, b, toS] of [["A", C.A, C.toSA], ["B", C.B, C.toSB]]) {
      const isRepeat = side === "B" && C.same;
      if (b.na || isRepeat) { continue; }
      const price = toS(u), x = Math.log(price / b.S), vol = C.volOf(b.tk).pct / 100;
      const implied = C.distOf(b, Odds.Implied), periodVol = C.distOf(b, Odds.PeriodVol);
      const belowImplied = implied ? cdfT(implied, x) : NaN, belowPeriod = periodVol ? cdfT(periodVol, x) : NaN;
      const beyondPeriod = x < 0 ? belowPeriod : 1 - belowPeriod;
      parts.push(`<span class="s">${esc(b.tk)} ${fPx2(price)} (${fS(price / b.S - 1, 1)}) · to ${fmtE(b.exp)}</span>` +
        krow(`σ at ATM IV ${(b.E.atm * 100).toFixed(0)}%`, `${(x / b.sig).toFixed(2)}σ`) +
        krow(`σ at period vol ${(vol * 100).toFixed(0)}%`, `${(x / (vol * Math.sqrt(b.T))).toFixed(2)}σ`) +
        krow("ends below · implied / period vol", `${fPct(belowImplied)} / ${fPct(belowPeriod)}`) +
        krow("ends above · implied / period vol", `${fPct(1 - belowImplied)} / ${fPct(1 - belowPeriod)}`) +
        krow("touched before expiry (period vol)", `≈ ${fPct(Math.min(1, 2 * beyondPeriod))}`) +
        krow(`${side} P&amp;L at expiry here`, fU(side === "A" ? C.pA(u) : C.pB(u))));
    }
    return parts.join("");
  }
  // a P&L on the payoff axis: in every unit, and how likely each position ends at or above it (period vol)
  function describeValueOnAxis(v) {
    const odds = [["A", C.A, 1], ["B", C.B, C.h]].map(([side, b, scale]) => {
      const p = probAtLeast({ b, d: C.distOf(b, Odds.PeriodVol), threshold: v, scale });
      return Number.isFinite(p) ? krow(`${side} ends at or above (period vol)`, fPct(p)) : "";
    }).join("");
    return `<span class="h">P&amp;L at expiry ${fU(v)}</span>${describeUnitRows(v)}${odds}`;
  }
  // ---------------------------------------------------------- the payoff's time: trading days before A's expiry
  // The chart is read at one stop: expiry (0, the right end) or a trading day before it, counted in calendar days
  // (−1, −2, … and over a weekend from −4 to −7); weekends are never stops, and each Monday marks a week's start.
  // Each position's own days left follow from the days elapsed, so a later expiry still has time when A expires.
  const DAY_MS = 864e5, WEEKDAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const expiryDate = b => new Date(Date.UTC(+b.exp.slice(0, 4), +b.exp.slice(4, 6) - 1, +b.exp.slice(6, 8)));
  const dayLabel = date => `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MON[date.getUTCMonth()]}`;
  // the stops from today (left) to expiry (right): calendar days left, the date, whether it starts a week
  /** @returns {{ left: number, date: Date, isMonday: boolean }[]} */
  function listTradingStops() {
    const lead = !C.A.na ? C.A : !C.B.na ? C.B : null;
    if (!lead) { return [{ left: 0, date: new Date(0), isMonday: false }]; }
    const end = expiryDate(lead), stops = [];
    for (let left = lead.dte; left >= 0; left--) {
      const date = new Date(end.getTime() - left * DAY_MS), weekday = date.getUTCDay();
      const isTradingDay = weekday !== 0 && weekday !== 6;
      if (isTradingDay || left === 0 || left === lead.dte) { stops.push({ left, date, isMonday: weekday === 1 }); }
    }
    return stops;
  }
  // the stop nearest a number of calendar days left (a stored value from before the stops, or a weekend)
  const nearestStop = (stops, left) => stops.reduce((best, s, i) => Math.abs(s.left - left) < Math.abs(stops[best].left - left) ? i : best, stops.length - 1);
  // replay: a looping slideshow over the stops, forwards (towards expiry) or backwards, at a chosen pace; while it runs
  // only the payoff redraws, and the stop it pauses on is kept
  const REPLAY = { timer: 0, index: /** @type {number | null} */ (null), direction: 1, stepsPerSecond: 2 };
  /** @returns {{ left: number, total: number, elapsed: number, isExpiry: boolean, phrase: string, title: string, stops: any[], index: number }} */
  function readPayoffTime() {
    const stops = listTradingStops();
    const index = REPLAY.index !== null ? clamp(REPLAY.index, 0, stops.length - 1) : nearestStop(stops, Math.round(V().payLeft));
    return timeAtIndex({ stops, index });
  }
  /** @param {{ stops: any[], index: number }} input */
  function timeAtIndex({ stops, index }) {
    const total = stops[0].left, stop = stops[index], left = stop.left, isExpiry = left === 0;
    const phrase = isExpiry ? "at expiry" : `${left} day${left === 1 ? "" : "s"} before expiry (${dayLabel(stop.date)}${left === total ? ", today" : ""})`;
    return { left, total, elapsed: total - left, isExpiry, phrase, title: isExpiry ? "Payoff at expiry" : `P&L ${phrase}`, stops, index };
  }
  // a position's time to expiry in years once `elapsed` days have passed; 0 at or past its expiry
  /** @param {{ b: any, elapsed: number }} input */
  const tauAfter = ({ b, elapsed }) => b.dte > 0 ? b.T * Math.max(0, b.dte - elapsed) / b.dte : 0;
  // A's and B's P&L at the payoff's time, on the move axis (B scaled like its line): marked to the model before expiry
  function valuesAt(time) {
    if (time.isExpiry) { return { a: C.pA, b: C.pB }; }
    const markOr = (b, value, payoff) => { const tau = tauAfter({ b, elapsed: time.elapsed }); return tau > 0 ? u => value(u, tau) : payoff; };
    return { a: C.A.na ? C.pA : markOr(C.A, C.vA, C.pA), b: C.B.na ? C.pB : markOr(C.B, C.vB, C.pB) };
  }
  // ---------------------------------------------------------- the payoff's lenses
  // P&L: each position's P&L at the chosen stop. Day change: what each made since the stop before (on the first stop,
  // since entry: the fill against the model's mark), at every price, with A − B below. Extrapolation (a toggle, P&L
  // and Time decay lenses): the last day's change repeated over the trading days left, drawn dashed in the accent colour.
  const ZERO_VALUES = Object.freeze({ a: () => 0, b: () => 0 });
  /** @param {{ time: any, lens: string }} input */
  function readLensValues({ time, lens }) {
    const at = valuesAt(time), prevTime = time.index > 0 ? timeAtIndex({ stops: time.stops, index: time.index - 1 }) : null;
    const prev = prevTime ? valuesAt(prevTime) : ZERO_VALUES;
    const change = { a: u => at.a(u) - prev.a(u), b: u => at.b(u) - prev.b(u) };
    const stopDay = dayLabel(time.stops[time.index].date);
    const since = prevTime ? `change ${stopDay} vs ${dayLabel(prevTime.stops[prevTime.index].date)}` : "change since entry (the fill against the model's mark)";
    // the pace is per calendar day (a Monday's change carries the weekend), carried over the calendar days left
    const gap = prevTime ? prevTime.left - time.left : 0, perDay = gap > 0 ? time.left / gap : 0;
    const isExtended = lens === PayLens.Pnl && !!V().payExtra && prevTime !== null && time.left > 0;
    const ext = isExtended ? { a: u => at.a(u) + perDay * change.a(u), b: u => at.b(u) + perDay * change.b(u) } : null;
    const extWords = `the last day's pace${gap > 1 ? ` (its ${gap} calendar days)` : ""} carried over the ${time.left} calendar day${time.left === 1 ? "" : "s"} left`;
    const values = lens === PayLens.Day ? change : at;
    const title = prevTime ? `Day change · ${stopDay} vs the trading day before` : "Day change · today vs entry";
    return { a: values.a, b: values.b, ext, extWords, since, title, change, prevTime };
  }
  // the IV band: the P&L at the chosen stop with every implied vol shifted ± points on top of the page's shock
  /** @param {{ time: any, ivPts: number, ux: number[] }} input */
  function readIvBands({ time, ivPts, ux }) {
    const bands = [];
    for (const [side, b, toS, scale] of [["a", C.A, C.toSA, 1], ["b", C.B, C.toSB, C.h]]) {
      const tau = b.na ? 0 : tauAfter({ b, elapsed: time.elapsed });
      if (!(tau > 0) || (side === "b" && C.same && C.diff.identical)) { continue; }
      for (const sign of [1, -1]) {
        const shock = Object.assign({}, C.shock, { ivs: (C.shock.ivs || 0) + sign * ivPts });
        bands.push({ side, sign, points: ux.map(u => [u, scale * POS.val(b, toS(u), tau, shock) / b.S]) });
      }
    }
    return bands;
  }
  /** @param {{ svg: SVGElement, bands: any[], X: (u: number) => number, Y: (v: number) => number, ivPts: number, xEnd: number }} input */
  function drawIvBands({ svg, bands, X, Y, ivPts, xEnd }) {
    for (const side of ["b", "a"]) {
      const up = bands.find(g => g.side === side && g.sign > 0), down = bands.find(g => g.side === side && g.sign < 0);
      if (!up || !down) { continue; }
      el("path", { d: pathOf(up.points, X, Y) + "L" + pathOf(down.points.slice().reverse(), X, Y).slice(1) + "Z", fill: `var(--${side})`, "fill-opacity": .18 }, svg);
      const endOf = g => g.points[g.points.length - 1][1], upIsHigher = endOf(up) >= endOf(down);
      for (const g of [up, down]) {
        el("path", { d: pathOf(g.points, X, Y), fill: "none", stroke: `var(--${side})`, "stroke-width": 1, "stroke-dasharray": "1 2" }, svg);
        const end = endOf(g), isHigher = (g === up) === upIsHigher;
        if (side === "a" && Number.isFinite(end)) { txt(svg, xEnd - 4, Y(end) + (isHigher ? -5 : 12), `IV ${g.sign > 0 ? "+" : MINUS}${ivPts}`, { "text-anchor": "end", fill: "var(--a)", "font-size": 10, ...halo }); }
      }
    }
  }
  /** @param {{ time: any, ivPts: number, u: number }} input */
  function describeIvRows({ time, ivPts, u }) {
    if (!ivPts) { return ""; }
    const rows = [["A", C.A, C.toSA, 1, "a"], ["B" + hb(), C.B, C.toSB, C.h, "b"]].map(([name, b, toS, scale, cls]) => {
      const tau = b.na ? 0 : tauAfter({ b, elapsed: time.elapsed });
      if (!(tau > 0)) { return ""; }
      const at = sign => scale * POS.val(b, toS(u), tau, Object.assign({}, C.shock, { ivs: (C.shock.ivs || 0) + sign * ivPts })) / b.S;
      return trow(`${name} at IV +${ivPts} / ${MINUS}${ivPts}`, at(1), cls).replace("</span></span>", ` / ${fU(at(-1))}</span></span>`);
    }).join("");
    return rows ? `<span class="s">IV band</span>${rows}` : "";
  }
  // the lens controls follow the lens and the stop: extrapolation needs a day before and days left
  function describeLensControls(time) {
    const lens = V().payLens, last = time.stops.length - 1, on = !!V().payExtra;
    const extends_ = lens === PayLens.Pnl || lens === PayLens.Decay, canExtend = extends_ && time.index > 0 && time.index < last;
    const btn = /** @type {HTMLButtonElement} */ (q("#c-extra"));
    btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", String(on)); btn.disabled = !extends_;
    btn.innerHTML = `${ICONS.trendingUp}<span>${on ? "Extrapolating" : "Extrapolate"}</span>`;
    const why = time.index === 0 ? "step at least one trading day on from today" : "at expiry no days are left";
    btn.title = !extends_ ? "Extrapolation reads in the P&L and Time decay lenses" : canExtend ? "Repeat the last day's change over the trading days left (dashed, in the accent colour)" : `Extrapolation repeats the last day's change: ${why}`;
    q("#c-payatw").hidden = lens !== PayLens.Decay && lens !== PayLens.Move;
    q("#c-ivw").classList.toggle("off", lens !== PayLens.Pnl);
    q("#c-ivw").title = lens === PayLens.Pnl ? "The P&L at the implied vols shifted by ± these points (before expiry)" : "The IV band reads in the P&L lens";
    const atInput = /** @type {HTMLInputElement} */ (q("#c-payat"));
    if (document.activeElement !== atInput) { atInput.value = String(V().payAt); }
    const onPriceAxis = lens === PayLens.Pnl || lens === PayLens.Day;
    for (const id of ["#c-pso", "#c-pss"]) { /** @type {HTMLElement} */ (q(id).closest("label")).hidden = !onPriceAxis; }
    q("#pay-xhint").hidden = !(on && extends_ && !canExtend);
    q("#pay-xhint").textContent = `Extrapolation is on but shows nothing here: ${why}.`;
    q("#pay-read").innerHTML = lens === PayLens.Day ? describeDayReadout(time) : "";
  }
  // the day lens in words, at an unchanged price: each position's change on the day against the day before
  function describeDayReadout(time) {
    if (time.index < 1) { return `<span class="muted">Today is the first stop: the lines show the change since entry. Step a day on to read a day's change.</span>`; }
    const lead = !C.A.na ? C.A : C.B, u = !C.A.na ? C.uOfSA(lead.S) : C.uOfSB(lead.S);
    const now = readLensValues({ time, lens: PayLens.Day }).change;
    const before = time.index > 1 ? readLensValues({ time: timeAtIndex({ stops: time.stops, index: time.index - 1 }), lens: PayLens.Day }).change : null;
    const gap = time.stops[time.index - 1].left - time.left, weekend = gap > 1 ? ` · this day spans ${gap} calendar days (a weekend)` : "";
    const sideText = (side, b, cls) => {
      if (b.na) { return ""; }
      const v = now[side](u), w = before ? before[side](u) : NaN;
      const ratio = Number.isFinite(w) && Math.abs(w) > 1e-9 ? ` · ${(v / w).toFixed(1)}× the day before (${fU(w)})` : "";
      return `<span class="dr"><i class="lsw" style="background:var(--${cls})"></i>${side === "a" ? "A" : "B" + hb()} <b class="${pn(v)}">${fU(v)}</b>${ratio}</span>`;
    };
    const pair = now.a(u) - now.b(u);
    return `<span class="lbl">At an unchanged price, ${esc(dayLabel(time.stops[time.index].date))}${weekend}</span>${sideText("a", C.A, "a")}${C.same && C.diff.identical ? "" : sideText("b", C.B, "b")}${C.A.na || C.B.na ? "" : `<span class="dr">A − ${hTxt()} <b class="${pn(pair)}">${fU(pair)}</b></span>`}`;
  }
  // ---------------------------------------------------------- market moves on the price axis
  // A move from entry is judged in σ of the days it took (at A's ATM IV; a day at least): grey flat, yellow notable,
  // green a clear rise, red a clear fall (MOVES). The band sits under the plot; the hover names the zone.
  /** @param {number} elapsed calendar days since entry */
  function moveSigma(elapsed) {
    const lead = !C.A.na ? C.A : C.B;
    if (lead.na || !(lead.sig > 0) || !(lead.dte > 0)) { return { sigma: NaN, days: 0, lead }; }
    const days = Math.max(1, elapsed);
    return { sigma: lead.sig * Math.sqrt(days / lead.dte), days, lead };
  }
  /** @param {{ svg: SVGElement, X: (u: number) => number, lo: number, hi: number, y: number, elapsed: number }} input */
  function drawMoveZones({ svg, X, lo, hi, y, elapsed }) {
    const { sigma, lead } = moveSigma(elapsed);
    if (!Number.isFinite(sigma)) { return; }
    const uOf = lead === C.A ? C.uOfSA : C.uOfSB, at = z => clamp(uOf(lead.S * Math.exp(z * sigma)), lo, hi);
    const edges = [lo, at(-MOVES.CLEAR), at(-MOVES.FLAT), at(MOVES.FLAT), at(MOVES.CLEAR), hi], kinds = ["down", "note", "flat", "note", "up"];
    const band = el("g", { class: "mzones" }, svg);
    kinds.forEach((kind, i) => { const x0 = X(edges[i]), x1 = X(edges[i + 1]); if (x1 - x0 > 0.5) { el("rect", { x: x0, y: y + 1, width: x1 - x0, height: 4, fill: `var(--${kind})`, "fill-opacity": kind === "flat" ? .55 : .85 }, band); } });
  }
  function moveZoneRow({ u, elapsed }) {
    const { sigma, days, lead } = moveSigma(elapsed);
    if (!Number.isFinite(sigma)) { return ""; }
    const x = lead === C.A ? C.xA(u) : C.xB(u);
    return krow(`${esc(lead.tk)} move over ${days} day${days === 1 ? "" : "s"}`, MOVES.chip(x / sigma));
  }
  // ---------------------------------------------------------- the time-decay lens
  // At one price (unchanged, or a typed move of the lead's), the price to close each position at every stop from today
  // to expiry: what is left of the credit to buy back. The straight line from today's to expiry's shows whether the
  // decay is even (on the line), back-loaded (the curve stays above it and drops late) or front-loaded (below it).
  // The bars are the decay each stop brings; a Monday carries the weekend's three calendar days.
  /** @param {{ side: string, b: any, value: Function, payoff: Function, scale: number, u: number, stops: any[] }} input */
  function readDecaySeries({ side, b, value, payoff, scale, u, stops }) {
    const credit = scale * b.cr / b.S, total = Math.max(1, stops[0].left);
    const close = stops.map(s => { const tau = tauAfter({ b, elapsed: stops[0].left - s.left }); return credit - (tau > 0 ? value(u, tau) : payoff(u)); });
    const start = close[0], end = close[close.length - 1];
    const straight = stops.map(s => start + (end - start) * (stops[0].left - s.left) / total);
    const burn = close.map((c, i) => i ? close[i - 1] - c : NaN);
    return { side, b, close, straight, burn, start, end, timeValue: start - end };
  }
  // the share of the time value gone at a stop, and the straight line's share at the same stop
  /** @param {{ s: any, index: number, stops: any[] }} input */
  function readDecayShare({ s, index, stops }) {
    if (!(Math.abs(s.timeValue) > 1e-7)) { return null; }
    const gone = (s.start - s.close[index]) / s.timeValue, even = (stops[0].left - stops[index].left) / Math.max(1, stops[0].left);
    return { gone, even };
  }
  // back-loaded, even or front-loaded, read at the stop nearest half the days
  /** @param {{ s: any, stops: any[] }} input */
  function describeDecayShape({ s, stops }) {
    const half = nearestStop(stops, stops[0].left / 2), share = readDecayShare({ s, index: half, stops });
    if (!share) { return "no time value to decay at this price"; }
    const word = share.gone < share.even - 0.08 ? "back-loaded: most of the decay comes late" : share.gone > share.even + 0.08 ? "front-loaded: most of the decay comes early" : "close to even (near the straight line)";
    return `${word} · at ${(share.even * 100).toFixed(0)}% of the days ${(share.gone * 100).toFixed(0)}% of it is gone`;
  }
  function renderDecayLens(time) {
    const host = q("#pay"); host.innerHTML = "";
    const { A, B } = C, W = Math.max(host.clientWidth, 600), stops = time.stops, last = stops.length - 1, total = Math.max(1, stops[0].left);
    const lead = !A.na ? A : B;
    describePayoffTime(time);
    if (lead.na) { host.innerHTML = `<p class="muted">Both positions are n/a.</p>`; return; }
    const price = lead.S * (1 + V().payAt / 100), u = lead === A ? C.uOfSA(price) : C.uOfSB(price);
    const sides = [["a", A, C.vA, C.pA, 1], ["b", B, C.vB, C.pB, C.h]].filter(([side, b]) => !b.na && !(side === "b" && C.same && C.diff.identical));
    const series = sides.map(([side, b, value, payoff, scale]) => readDecaySeries({ side, b, value, payoff, scale, u, stops }));
    const index = time.index, isExtended = !!V().payExtra && index > 0 && index < last;
    // the chosen day's decay per calendar day (a Monday's carries the weekend), carried on to expiry
    const gapAt = i => i > 0 ? stops[i - 1].left - stops[i].left : 1, paceOf = s => s.burn[index] / Math.max(1, gapAt(index));
    const extOf = s => s.close.map((_, j) => j < index ? NaN : s.close[index] - paceOf(s) * (stops[index].left - stops[j].left));
    const exts = isExtended ? series.map(extOf) : [];
    const elapsedAt = i => stops[0].left - stops[i].left;
    q("#pay-h").textContent = `Time decay at ${fPx2(price)}${V().payAt ? ` (${fS(V().payAt / 100, 0)} vs spot)` : " (unchanged price)"} · price to close`;
    const m = { l: 62, r: 54, t: 18, b: 46 }, H1 = 240, H2 = 96, gap = 16, y1 = m.t, y2 = y1 + H1 + gap, H = y2 + H2 + m.b, plotW = W - m.l - m.r;
    const X = e => m.l + e / total * plotW;
    const vals = [...series.flatMap(s => [...s.close, ...s.straight]), ...exts.flat()].filter(Number.isFinite);
    let ylo = Math.min(0, ...vals), yhi = Math.max(0, ...vals); const pad = (yhi - ylo) * 0.08 || 0.001; ylo -= pad; yhi += pad;
    const bars = series.flatMap(s => s.burn).filter(Number.isFinite);
    let blo = Math.min(0, ...bars), bhi = Math.max(0, ...bars); const bp = (bhi - blo) * 0.12 || 0.0005; blo -= bp; bhi += bp;
    const Y = v => y1 + (yhi - v) / (yhi - ylo) * H1, Y2 = v => y2 + (bhi - v) / (bhi - blo) * H2;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Price to close by trading day, and the decay each day" }, host), ax = el("g", { class: "ax" }, svg);
    for (const { v, step } of payTicks(ylo, yhi, 5, H1)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, ax); txt(ax, m.l - 6, Y(v) + 3.5, fUt(v, step || 0.01), { "text-anchor": "end" }); }
    for (const { v, step } of payTicks(blo, bhi, 3, H2)) { el("line", { x1: m.l, x2: W - m.r, y1: Y2(v), y2: Y2(v) }, ax); txt(ax, m.l - 6, Y2(v) + 3.5, fUt(v, step || 0.01), { "text-anchor": "end" }); }
    const yb = y2 + H2 + 14;
    stops.forEach((stop, i) => {
      const isEdge = i === 0 || i === last;
      if (!stop.isMonday && !isEdge) { return; }
      const nearEdge = !isEdge && (X(elapsedAt(i)) - X(0) < 64 || X(elapsedAt(last)) - X(elapsedAt(i)) < 64);
      if (nearEdge) { return; }
      const x = X(elapsedAt(i)), an = i === 0 ? "start" : i === last ? "end" : "middle";
      el("line", { x1: x, x2: x, y1: y1, y2: y2 + H2 }, ax);
      txt(ax, x, yb, i === 0 ? "today" : i === last ? "expiry" : dayLabel(stop.date), { "text-anchor": an });
      txt(ax, x, yb + 13, i === last ? "0" : `${MINUS}${stop.left}`, { "text-anchor": an, style: "font-size:10px;fill:var(--ink-3)" });
    });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg); el("line", { x1: m.l, x2: W - m.r, y1: Y2(0), y2: Y2(0), stroke: "var(--ink-3)" }, svg);
    txt(svg, m.l + 6, y2 + 12, "decay on each trading day (a Monday carries the weekend)", { fill: "var(--ink-2)", "font-size": 11, ...halo });
    const xSel = X(elapsedAt(index));
    el("line", { x1: xSel, x2: xSel, y1: y1, y2: y2 + H2, stroke: "var(--ink-2)", "stroke-dasharray": "3 3" }, svg);
    // bars: the model's decay per stop; with extrapolation, the repeated last day as outlines after the chosen stop
    const dayW = plotW / total, nS = series.length, bw = clamp(dayW * 0.72 / nS, 2, 14);
    series.forEach((s, k) => {
      const off = (k - (nS - 1) / 2) * bw;
      s.burn.forEach((v, i) => {
        if (!Number.isFinite(v)) { return; }
        const x = X(elapsedAt(i)) + off - bw / 2, top = Math.min(Y2(v), Y2(0)), h = Math.abs(Y2(v) - Y2(0));
        el("rect", { x, y: top, width: bw - 0.6, height: Math.max(0.5, h), fill: `var(--${s.side})`, "fill-opacity": i === index ? 1 : .45 }, svg);
        if (isExtended && i > index) { const ve = paceOf(s) * gapAt(i), t2 = Math.min(Y2(ve), Y2(0)); el("rect", { x, y: t2, width: bw - 0.6, height: Math.max(0.5, Math.abs(Y2(ve) - Y2(0))), fill: "none", stroke: "var(--y)", "stroke-width": 1.2 }, svg); }
      });
    });
    const pts = arr => arr.map((v, i) => [elapsedAt(i), v]);
    for (const s of series) {
      el("path", { d: pathOf(pts(s.straight), X, Y), fill: "none", stroke: `var(--${s.side})`, "stroke-width": 1.2, "stroke-dasharray": "5 4", "stroke-opacity": .6 }, svg);
      el("path", { d: pathOf(pts(s.close), X, Y), fill: "none", stroke: `var(--${s.side})`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      s.close.forEach((v, i) => el("circle", { cx: X(elapsedAt(i)), cy: Y(v), r: i === index ? 4 : 2, fill: `var(--${s.side})`, stroke: i === index ? "var(--surface)" : "none", "stroke-width": 1.5 }, svg));
    }
    exts.forEach((e, k) => el("path", { d: pathOf(pts(e), X, Y), fill: "none", stroke: "var(--y)", "stroke-width": k === 0 ? 2.2 : 1.6, "stroke-dasharray": k === 0 ? "7 4" : "2 3" }, svg));
    if (isExtended) { txt(svg, m.l + 8, y1 + 14, `EXTRAPOLATED · the decay pace of ${dayLabel(stops[index].date)} (per calendar day) carried to expiry`, { fill: "var(--y)", "font-size": 11.5, "font-weight": 700, ...halo }); }
    const label = s => s.side === "a" ? "A" : "B" + hb();
    q("#pay-lgd").innerHTML = series.map(s => `<span><i style="background:var(--${s.side})"></i>${label(s)} ${esc(C.labels[s.side.toUpperCase()].full)}</span>`).join(" ") +
      ` <span class="muted">· dashed thin: a straight line from today to expiry</span>${isExtended ? ` <span class="ybadge">extrapolated (dashed): the last day's decay pace carried on</span>` : ""}`;
    LAST.decay = series.map(s => ({ side: s.side, close: s.close.slice(), straight: s.straight.slice(), burn: s.burn.slice() }));
    q("#pay-read").innerHTML = series.map(s => describeDecayReadout({ s, time, label: label(s) })).join("");
    // hover: the nearest stop; a click picks it
    const cross = el("line", { y1: y1, y2: y2 + H2, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: y1, width: plotW, height: y2 + H2 - y1, fill: "transparent", style: "cursor:pointer" }, svg);
    const stopAt = ev => { const r = svg.getBoundingClientRect(), e = ((ev.clientX - r.left) * W / r.width - m.l) / plotW * total; return stops.reduce((best, stop, i) => Math.abs(elapsedAt(i) - e) < Math.abs(elapsedAt(best) - e) ? i : best, 0); };
    hit.addEventListener("pointermove", ev => {
      const i = stopAt(ev), x = X(elapsedAt(i)), stop = stops[i];
      cross.setAttribute("x1", String(x)); cross.setAttribute("x2", String(x)); cross.setAttribute("visibility", "visible");
      const rows = series.map((s, k) => {
        const share = readDecayShare({ s, index: i, stops });
        return `<span class="s">${label(s)}</span>` + krow("price to close", fU(s.close[i])) + krow("straight line", fU(s.straight[i])) +
          (i ? krow("decay since the stop before", fU(s.burn[i])) : "") + (share ? krow("time value gone", `${(share.gone * 100).toFixed(0)}% (straight line ${(share.even * 100).toFixed(0)}%)`) : "") +
          (isExtended && i > index ? krow(`<span style="color:var(--y)">extrapolated</span>`, fU(exts[k][i])) : "");
      }).join("");
      showTip(`<span class="h">${dayLabel(stop.date)} · ${stop.left ? `${stop.left} day${stop.left === 1 ? "" : "s"} before expiry` : "expiry"}</span>${rows}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("click", ev => { stopReplay({ keep: false }); setPref({ payLeft: stops[stopAt(ev)].left }); });
  }
  // one position's decay in words: today's time value at this price, the chosen day's decay against an even pace,
  // the shape, and how much the last week carries
  /** @param {{ s: any, time: any, label: string }} input */
  function describeDecayReadout({ s, time, label }) {
    const stops = time.stops, i = time.index, last = stops.length - 1, total = Math.max(1, stops[0].left);
    const even = s.timeValue / total, gap = i ? stops[i - 1].left - stops[i].left : 0;
    const lastWeek = stops.findIndex(stop => stop.left <= 7), lateShare = lastWeek >= 0 && Math.abs(s.timeValue) > 1e-7 ? (s.close[lastWeek] - s.end) / s.timeValue : NaN;
    const day = i ? `${esc(dayLabel(stops[i].date))}: <b>${fU(s.burn[i])}</b> (${fU(s.burn[i] / gap)} a calendar day; even pace ${fU(even)})` : `${esc(dayLabel(stops[0].date))} is today: step on to read a day's decay`;
    return `<span class="dr"><i class="lsw" style="background:var(--${s.side})"></i>${label} · time value today ${fU(s.timeValue)} · ${day} · ${esc(describeDecayShape({ s, stops }))}${Number.isFinite(lateShare) && last > 0 ? ` · the last 7 days carry ${(lateShare * 100).toFixed(0)}%` : ""}</span>`;
  }
  // the panel's title, the slider, its Monday marks and the readout follow the time
  function describePayoffTime(time) {
    q("#pay-h").textContent = time.title;
    const slider = /** @type {HTMLInputElement} */ (q("#c-payleft")), last = time.stops.length - 1;
    slider.max = String(last);
    if (document.activeElement !== slider || REPLAY.timer) { slider.value = String(time.index); }
    const stop = time.stops[time.index];
    q("#c-paylefto").innerHTML = time.isExpiry ? `<b>0</b> (Expiry) · ${dayLabel(stop.date)}` : `<b>${MINUS}${time.left}</b> · ${dayLabel(stop.date)}${time.left === time.total ? " · today" : ""}`;
    const marksKey = time.stops.map(s => s.left).join(",");
    const marks = q("#tl-marks");
    if (marks.dataset.key !== marksKey) {
      marks.dataset.key = marksKey;
      marks.innerHTML = time.stops.map((s, i) => s.isMonday && i > 0 ? `<i class="tl-mon" style="left:calc(8px + (100% - 16px) * ${(i / Math.max(1, last)).toFixed(5)})" title="Monday ${dayLabel(s.date)}: a week starts"></i>` : "").join("") + `<i class="tl-exp" title="expiry"></i>`;
    }
    q("#tl-play").innerHTML = REPLAY.timer && REPLAY.direction > 0 ? ICONS.pause : ICONS.play;
    q("#tl-back").innerHTML = REPLAY.timer && REPLAY.direction < 0 ? ICONS.pause : `<span class="flip">${ICONS.play}</span>`;
    q("#tl-play").classList.toggle("on", !!REPLAY.timer && REPLAY.direction > 0);
    q("#tl-back").classList.toggle("on", !!REPLAY.timer && REPLAY.direction < 0);
  }
  // one replay step: the next stop that way, wrapping round at either end; only the payoff redraws
  function stepReplay() {
    const stops = listTradingStops(), last = stops.length - 1, from = REPLAY.index !== null ? REPLAY.index : nearestStop(stops, Math.round(V().payLeft));
    REPLAY.index = from + REPLAY.direction > last ? 0 : from + REPLAY.direction < 0 ? last : from + REPLAY.direction;
    safe(renderPayoff, "payoff");
  }
  function stopReplay({ keep }) {
    if (!REPLAY.timer) { return; }
    clearInterval(REPLAY.timer); REPLAY.timer = 0;
    const stops = listTradingStops(), index = REPLAY.index;
    REPLAY.index = null;
    if (keep && index !== null) { setPref({ payLeft: stops[clamp(index, 0, stops.length - 1)].left }); } else { safe(renderPayoff, "payoff"); }
  }
  /** @param {number} direction 1 forwards (towards expiry), −1 backwards */
  function toggleReplay(direction) {
    const isSame = REPLAY.timer && REPLAY.direction === direction;
    stopReplay({ keep: true });
    if (isSame) { return; }
    REPLAY.direction = direction;
    REPLAY.index = readPayoffTime().index;
    REPLAY.timer = setInterval(stepReplay, 1000 / REPLAY.stepsPerSecond);
    safe(renderPayoff, "payoff");
  }
  function jumpTo(edge) {
    stopReplay({ keep: false });
    const stops = listTradingStops();
    setPref({ payLeft: edge === "expiry" ? 0 : stops[0].left });
  }
  // the hover's reference rows when the chart shows a time before expiry: A and B at expiry, at this price
  function describeExpiryRows(u) {
    return `<span class="s">at expiry</span>${C.A.na ? "" : trow("A", C.pA(u), "a")}${C.B.na ? "" : trow("B" + hb(), C.pB(u), "b")}`;
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
  // the chance of touching a price before expiry at the period vol: 2 × the chance of ending beyond it, capped at 1
  /** @param {{ b: any, price: number }} input */
  function touchOdds({ b, price }) {
    const d = C.distOf(b, Odds.PeriodVol);
    if (!d || !(price > 0)) { return NaN; }
    const x = Math.log(price / b.S), below = cdfT(d, x), beyond = x < 0 ? below : 1 - below;
    return Math.min(1, 2 * beyond);
  }
  // the comparison table's definitions, one knob per row
  const ROW_INFO = Object.freeze({
    credit: ["Credit", "What the fill collects per share, as a share of the page unit. In the money, part of the cash is intrinsic value that is paid back at expiry; time value is the rest, and every ratio below uses it."],
    creditSigma: ["Credit / σ", "Time value divided by the move the market prices to expiry (spot × σ√T at the ATM IV): how many expected moves of cushion the premium buys. Size-free, so A and B compare directly."],
    creditDay: ["Credit per day", "Time value divided by the days to expiry: the decay a day if nothing moves. Longer expiries collect more in total but less a day."],
    odds: ["Profit odds", "The chance the P&L at expiry is above zero, under the odds switch (implied, or the period vol). It says nothing about the size of the losses."],
    worst: ["Worst loss", "The lowest P&L at expiry anywhere inside the range shown, in the page unit. Beyond the range it can be worse (unbounded for naked legs)."],
    vega: ["Vega per vol point", "The change in value now if every IV moves one point, in the page unit: negative for a short position. What a vol spike costs before any price move."],
    margin: ["Margin", "Approximate Reg T margin at entry: 20% of spot × the ETF's leverage (capped at 100%) on the worse side plus the premium. Brokers' house rates for leveraged ETFs are higher (the Compounding tab uses them)."],
    creditMargin: ["Credit / margin", "Time value divided by the margin: the return on capital if the position expires worthless. The best case of the recovery panel."]
  });
  const rowKnob = id => KNOBS.html({ id: `cmp-${id}`, title: ROW_INFO[id][0], body: ROW_INFO[id][1] });
  // "better" in one direction: a higher EV, odds, break-even vol, credit/σ or credit/margin; a smaller worst loss
  const Better = Object.freeze({ High: "high", Low: "low" });
  /** @param {{ a: number, b: number, better: string }} input -> "A" | "B" | "" (no direction, a tie, or a missing side) */
  function pickBetterSide({ a, b, better }) {
    if (!better || !Number.isFinite(a) || !Number.isFinite(b)) { return ""; }
    const isTie = Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    if (isTie) { return ""; }
    const aWins = better === Better.High ? a > b : a < b;
    return aWins ? "A" : "B";
  }
  const winClass = (winner, side) => winner === side ? ` class="win" title="the better side on this row"` : "";
  function renderCmp() {
    const { A, B, sa, sb, h } = C, nA = A.na, nB = B.na, rows = [], sc = SC();
    const a = (f, nn) => nn ? NaN : f, sB = v => v * h;
    // every A / B cell reads "–" when B's value prints as zero in its own cell
    // one row: A, B, their difference and ratio; better marks the side that wins where "better" has one direction
    /** @param {{ label: string, a: number, b: number, format: (v: number) => string, showDiff?: boolean, showRatio?: boolean, rowClass?: string, better?: string }} row */
    const addRow = ({ label, a: va, b: vb, format, showDiff = true, showRatio = true, rowClass = "", better = "" }) => {
      const winner = pickBetterSide({ a: va, b: vb, better });
      rows.push(`<tr class="${rowClass}"><td>${label}</td><td${winClass(winner, "A")}>${format(va)}</td><td${winClass(winner, "B")}>${format(vb)}</td><td>${showDiff && Number.isFinite(va) && Number.isFinite(vb) ? format(va - vb) : ""}</td><td>${showRatio ? ratioTxt(va, vb, format) : ""}</td></tr>`);
    };
    const pair = C.same && C.sameExp && !nA && !nB;
    if (!C.same && A.tk !== B.tk) rows.push(`<tr class="note"><td colspan="5">No correlation between ${A.tk} and ${B.tk} is modelled, so the pair column only shows figures that add up. The joint-moves panel shows the pair across independent moves.</td></tr>`);
    else if (!C.sameExp) rows.push(`<tr class="note"><td colspan="5">A and B expire on different dates, so pair odds and pair worst loss at one expiry are not defined. The pair column only shows figures that add up.</td></tr>`);
    for (const [t, x] of [["A", A], ["B", B]]) if (x.na) rows.push(`<tr class="note"><td colspan="5">${key(t)} is n/a: ${esc(x.naReason)}.</td></tr>`);
    if (C.unitsNote) rows.push(`<tr class="note"><td colspan="5">${esc(C.unitsNote)}.</td></tr>`);
    const legsTd = b => b.na ? `<td class="legs">${esc(structTxt(b))}</td>` : `<td class="legs" title="${esc(b.label.full)}">${esc(b.label.tab)}</td>`;
    rows.push(`<tr class="grp xmore"><td>Legs</td>${legsTd(A)}${legsTd(B)}<td></td><td></td></tr>`);
    // cash credit (a debit spelled out), with time value beside it where a leg is in the money; every ratio below uses time value
    const anyI = (!nA && A.intr > 0) || (!nB && B.intr > 0), tvC = anyI ? `<span class="cap">on time value</span>` : "";
    const cv = (b, nn, k) => nn ? "–" : fU(k * b.cr / b.S) + (b.cr < 0 ? ` <span class="debit">net debit</span>` : "") + (b.intr > 0 ? ` <span class="muted">· time value ${fU(k * b.tv / b.S)}</span>` : "");
    const ca = a(A.cr / A.S, nA), cb = a(sB(B.cr / B.S), nB), ta = a(A.tv / A.S, nA), tb = a(sB(B.tv / B.S), nB);
    rows.push(`<tr><td>Credit${rowKnob("credit")}${anyI ? `<span class="cap" title="Time value = cash credit − intrinsic value at entry">cash · time value</span>` : ""}</td><td>${cv(A, nA, 1)}</td><td>${cv(B, nB, h)}</td><td>${Number.isFinite(ca) && Number.isFinite(cb) ? fU(ca - cb) + (anyI ? ` <span class="muted">· ${fU(ta - tb)}</span>` : "") : ""}</td><td>${anyI ? ratioTxt(ta, tb, fU) : ratioTxt(ca, cb, fU)}</td></tr>`);
    addRow({ label: `Credit/σ${rowKnob("creditSigma")}<span class="cap">size-free, own σ to expiry</span>${tvC}`, a: a(A.tv / (A.S * A.sig), nA), b: a(B.tv / (B.S * B.sig), nB), format: v => fN0(v, 3), showDiff: false, better: Better.High, rowClass: "xmore" });
    addRow({ label: `Credit per day${rowKnob("creditDay")}${tvC}`, a: a(A.tv / A.S / A.dte, nA), b: a(sB(B.tv / B.S / B.dte), nB), format: v => fU(v, 3), rowClass: "grp xmore" });
    addRow({ label: `Expected value${KNOBS.html({ id: "cmp-ev", title: "Expected value, explained", body: describeEvExplainer({ isImpliedRow: sc.dist === Odds.Implied }) })}<span class="cap">${sc.dist === Odds.Implied ? "implied odds: fill vs mid, 0 at mid" : C.volOddsText()}</span>`, a: a(sa && sa.ev / A.S, nA), b: a(sb && sB(sb.ev / B.S), nB), format: v => fU(v, 2), better: Better.High });
    const edge = b => { const r = b.na ? null : RECOVERY.findBreakEvenVol({ built: b }); return r && r.ok ? r.value : NaN; };
    const ea = edge(A), eb = edge(B);
    // break-even: the spot move first (what loses money), then the vol (what the fill gave away)
    const be = (b, s) => b.na || !s ? "–" : s.bes.length ? s.bes.map(price => `${fPx2(price)} <span class="muted">${fS(price / b.S - 1, 1)} · touch ${fPct(touchOdds({ b, price }))}</span>`).join("<br>") : "none";
    rows.push(`<tr class="grp"><td>Break-even price${KNOBS.html({ id: "cmp-touch", title: "Touching a breakeven", body: "The chance the price trades through the breakeven at some point before expiry, at the ticker's period vol: about twice the chance of ending beyond it (the reflection principle for a driftless walk). Ending beyond it is what loses money; touching it is when you have to decide whether to adjust." })}<span class="cap">the move from spot, and the odds of touching it before expiry</span></td><td>${be(A, sa)}</td><td>${be(B, sb)}</td><td></td><td></td></tr>`);
    rows.push(`<tr><td>Break-even vol${KNOBS.html({ id: "cmp-edge", title: "Break-even vol", body: "The period vol at which the position's EV at expiry is zero, at its fill. Above the vol you assume, the trade has an edge of that many vol points; below it, it gives one away. It moves with the fill: a typed fill below mid lowers it." })}<span class="cap">the period vol at which EV is 0</span></td><td${winClass(pickBetterSide({ a: ea, b: eb, better: Better.High }), "A")}>${fP(ea, 1)}</td><td${winClass(pickBetterSide({ a: ea, b: eb, better: Better.High }), "B")}>${fP(eb, 1)}</td><td>${Number.isFinite(ea) && Number.isFinite(eb) ? formatSigned({ value: (ea - eb) * 100, digits: 1, suffix: " pts" }) : ""}</td><td></td></tr>`);
    rows.push(`<tr><td>Profit odds${rowKnob("odds")}<span class="cap">P&amp;L above 0 at expiry</span></td><td${winClass(pickBetterSide({ a: sa && !nA ? sa.pop : NaN, b: sb && !nB ? sb.pop : NaN, better: Better.High }), "A")}>${nA || !sa ? "–" : fP(sa.pop, 0)}</td><td${winClass(pickBetterSide({ a: sa && !nA ? sa.pop : NaN, b: sb && !nB ? sb.pop : NaN, better: Better.High }), "B")}>${nB || !sb ? "–" : fP(sb.pop, 0)}</td><td>${pair ? fP(pairPop(C), 0) : ""}</td><td></td></tr>`);
    const sel = `<select data-wl aria-label="Worst-loss range"><option value="view"${sc.wl === "view" ? " selected" : ""}>the view range</option><option value="own"${sc.wl === "own" ? " selected" : ""}>its own range</option></select>`;
    const own = sc.wl === "own" ? ` −<input type="number" data-wlo value="${+sc.wlo.toFixed(2)}" step="${STATE.uStep(C.unit)}" min="0" style="width:56px"> to +<input type="number" data-whi value="${+sc.whi.toFixed(2)}" step="${STATE.uStep(C.unit)}" min="0" style="width:56px"> ${STATE.UNAME[C.unit]}` : "";
    const pw = pair ? pairWorst(C, A, B, h) : NaN;
    const worstWinner = pickBetterSide({ a: nA || !sa ? NaN : sa.worst / A.S, b: nB || !sb ? NaN : sB(sb.worst / B.S), better: Better.High });
    rows.push(`<tr class="grp"><td>Worst loss${rowKnob("worst")} within ${sel}${own}<span class="cap" style="display:block;margin:0">${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}${sigWord()}: ${C.same ? A.tk : tkOf("A")} ${fPx2(C.toSA(C.wlo))}–${fPx2(C.toSA(C.whi))}${C.same ? "" : `, ${tkOf("B")} ${fPx2(C.toSB(C.wlo))}–${fPx2(C.toSB(C.whi))}`}</span></td><td${winClass(worstWinner, "A")}>${nA || !sa ? "–" : fU(sa.worst / A.S)}</td><td${winClass(worstWinner, "B")}>${nB || !sb ? "–" : fU(sB(sb.worst / B.S))}</td><td>${pair ? fU(pw) : ""}</td><td>${nA || nB || !sa || !sb ? "" : ratioTxt(sa.worst / A.S, sB(sb.worst / B.S), fU)}</td></tr>`);
    addRow({ label: `Vega per vol point${rowKnob("vega")}`, a: a(A.vega / 100 / A.S, nA), b: a(sB(B.vega / 100 / B.S), nB), format: v => fU(v, 2), rowClass: "xmore" });
    addRow({ label: `Margin${rowKnob("margin")}<span class="cap">approx.: 20% × leverage (${levTxt()}), Reg-T style</span>`, a: a(A.margin / A.S, nA), b: a(sB(B.margin / B.S), nB), format: v => fU(v).replace("+", ""), showDiff: false });
    addRow({ label: `Credit / margin${rowKnob("creditMargin")}${tvC}`, a: a(A.tv / A.margin, nA), b: a(B.tv / B.margin, nB), format: v => fP0(v, 1), showDiff: false, rowClass: "grp xmore", better: Better.High });
    if (A.wingPx > 0 || B.wingPx > 0) {
      addRow({ rowClass: "xmore", label: "Wing cost", a: A.wingPx > 0 ? A.wingPx / A.S : NaN, b: B.wingPx > 0 ? sB(B.wingPx / B.S) : NaN, format: v => fU(v) });
      const cw = (b, s) => b.cap && s ? `${fPx2(s.capBE)} · ${fP(s.pCap, 1)}` : "–", pwg = (b, s) => b.capP && s ? `${fPx2(s.capPBE)} · ${fP(s.pCapP, 1)}` : "–";
      if (A.cap || B.cap) rows.push(`<tr class="xmore"><td>Call wing pays above · odds<span class="cap">spot where the wing has paid for itself</span></td><td>${cw(A, sa)}</td><td>${cw(B, sb)}</td><td></td><td></td></tr>`);
      if (A.capP || B.capP) rows.push(`<tr class="xmore"><td>Put wing pays below · odds<span class="cap">spot where the wing has paid for itself</span></td><td>${pwg(A, sa)}</td><td>${pwg(B, sb)}</td><td></td><td></td></tr>`);
    }
    // the core rows always; the rest behind one chip
    const hidden = rows.filter(r => r.includes('class="xmore"') || r.includes(' xmore"')).length, isMore = !!V().cmpMore;
    if (hidden) { rows.push(`<tr class="xtoggle"><td colspan="5"><button type="button" class="xbtn" data-xmore="1" aria-expanded="${isMore}">${isMore ? `fewer rows ▾` : `show ${hidden} more rows ▸`}</button> <span class="cap">${isMore ? "" : "legs, credit per σ and per day, vega, credit / margin, wings"}</span></td></tr>`); }
    q("#cmp").classList.toggle("showmore", isMore);
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
    q("#gInfo").dataset.tip = `Across: the move range (${uLab(C.lo, C.unit)} to ${uLab(C.hi, C.unit)}${sigWord()}${C.same ? "" : `, ${tkOf("B")} moving ${C.unit === "sig" ? "the same number of its own σ" : "the same %"}`}). Down: ${C.cal ? "calendar days from today; an expired position keeps its expiry payoff and odds" : C.sameExp ? "days from today" : "share of each position's life"}, today at the top. Colour: ${vw.gval === "contrib" ? "P&L × the odds of that column on that grid's own instrument and clock, so a row sums to the expected mark" : "mark-to-model P&L, each leg pinned to its traded mid at entry"}. Column odds (× odds, the bottom strip): ${C.oddsText()}. The ±σ cones use each position's own ATM vol on its own clock. The contour line is break-even. Click a cell to pin it.`;
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
  /** @returns {[number, string][]} */
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
    run({ type: Command.AddPin, pin: { SA: +C.toSA(u).toFixed(4), SB: +C.toSB(u).toFixed(4), dA: +w.dA.toFixed(3), dB: +w.dB.toFixed(3) } });
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
    const basis = Cx.Ap.basis, E = b.E, opts = side === "B" ? { expMap: Cx.comparison.expMap } : undefined;
    // every placement on the sweep is priced the same way (the fill mode); typed fills belong to the traded contracts
    // only, and are drawn as one point at the position as set (sweepTypedPoint)
    let P = Object.assign({}, side === "A" ? Cx.Ap : Cx.Bp, { fills: {} });
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
    const run = s => uniq.map(x => measureSweepPoint({ Cx, side: s.side, x, b: POS.build(s.at(x), s.opts) }));
    const sa = sides.A ? run(sides.A) : null, sb = sides.B ? run(sides.B) : null, pairOK = Cx.same && Cx.sameExp;
    const sd = sa && sb ? sa.map((p, i) => ({ x: p.x, cr: p.cr - sb[i].cr, ev: p.ev - sb[i].ev, worst: pairOK ? pairWorst(Cx, p.b, sb[i].b, Cx.h) : NaN })) : null;
    return { mode, basis, lo, hi, xs: uniq, sides, sa, sb, sd, pairOK };
  }
  // ---------------------------------------------------------- smoothing the sweep (an override, off by default)
  // The stepped curve is real: each point re-picks listed strikes. The smoothed one averages that snapping out with a
  // Gaussian window whose width is the strike-step period on the axis (the mean distance between points where a short
  // leg's strike changes), so what remains is the trend across placements rather than the chunking.
  // the mean distance on the axis between the points where one leg's strike changes; NaN when it changes fewer than twice
  /** @param {{ series: any[], role: string }} input */
  function measureLegStepPeriod({ series, role }) {
    const strikeAt = p => {
      if (p.b.na) { return NaN; }
      const leg = p.b.legs.find(x => x.role === role);
      return leg ? leg.K : NaN;
    };
    const changes = [];
    for (let i = 1; i < series.length; i++) {
      const isChange = strikeAt(series[i]) !== strikeAt(series[i - 1]);
      if (isChange) { changes.push((series[i].x + series[i - 1].x) / 2); }
    }
    if (changes.length < 2) { return NaN; }
    return (changes[changes.length - 1] - changes[0]) / (changes.length - 1);
  }
  const rolesIn = series => [...new Set(series.flatMap(p => p.b.na ? [] : p.b.legs.map(l => l.role)))];
  // the strike-step period of a sweep: its coarsest leg's period
  /** @param {any[]} series @returns {LabResult} */
  function measureStrikeStepPeriod(series) {
    const periods = rolesIn(series).map(role => measureLegStepPeriod({ series, role })).filter(Number.isFinite);
    if (!periods.length) { return Result.err({ code: "no_steps", message: "no leg's strike steps across this sweep" }); }
    return Result.ok(Math.max(...periods));
  }
  // the smoothing window: the widest strike-step period among the sides that have a sweep
  // the window is the strength (how many strike steps) times the widest strike-step period among the sides
  /** @param {{ seriesList: any[][], strength: number }} input @returns {LabResult} */
  function pickSmoothingWindow({ seriesList, strength }) {
    const measured = seriesList.filter(Boolean).map(measureStrikeStepPeriod).filter(r => r.ok);
    if (!measured.length) { return Result.err({ code: "no_steps", message: "the strikes do not step here" }); }
    return Result.ok(strength * Math.max(...measured.map(r => r.value)));
  }
  // the Smoothing slider is logarithmic: position 0 is off, then the strength runs from a hair (minSteps strike steps)
  // to maxSteps, about the most smoothing that still shows the shape; the middle is a tenth of a step or so
  const SMOOTHING = Object.freeze({ positions: 20, minSteps: 0.02, maxSteps: 2 });
  const smoothingAt = position => position <= 0 ? 0 : SMOOTHING.minSteps * Math.pow(SMOOTHING.maxSteps / SMOOTHING.minSteps, (Math.min(position, SMOOTHING.positions) - 1) / (SMOOTHING.positions - 1));
  const smoothingPositionOf = strength => !(strength > 0) ? 0 : clamp(Math.round(1 + (SMOOTHING.positions - 1) * Math.log(strength / SMOOTHING.minSteps) / Math.log(SMOOTHING.maxSteps / SMOOTHING.minSteps)), 1, SMOOTHING.positions);
  const describeSmoothingStrength = strength => !(strength > 0) ? "off" : `${strength < 0.1 ? strength.toFixed(3) : strength.toFixed(2)} strike steps`;
  /** @param {{ windowResult: LabResult, basis: string }} input */
  function describeSmoothing({ windowResult, basis }) {
    if (!windowResult.ok) { return " Smoothing is on, but the strikes do not step here, so nothing is averaged."; }
    return ` Smoothed over a ${RULE.fmtV(windowResult.value, basis)} window (Smoothing × the strike-step period here); the raw stepped lines are faint, and the hover shows both.`;
  }
  // every series of one chart smoothed with the same window (or left as they are when there is none)
  /** @param {{ bySide: Object<string, any[]>, field: string, width: number }} input */
  function smoothEach({ bySide, field, width }) {
    const out = {};
    for (const [side, series] of Object.entries(bySide)) { out[side] = Number.isFinite(width) ? smoothSeries({ series, field, width }) : series; }
    return out;
  }
  /** @param {{ series: any[], field: string, width: number }} input */
  function smoothSeries({ series, field, width }) {
    if (!series || !(width > 0)) { return series; }
    const sigma = width;
    return series.map(p => {
      let sum = 0, weight = 0;
      for (const o of series) {
        const v = o[field];
        if (!Number.isFinite(v)) { continue; }
        const w = Math.exp(-0.5 * ((o.x - p.x) / sigma) ** 2);
        sum += w * v; weight += w;
      }
      return Object.assign({}, p, { [field]: Number.isFinite(p[field]) && weight > 0 ? sum / weight : NaN });
    });
  }
  // one point of a sweep in the page units: time-value credit, EV at the period vol and the worst loss in the range,
  // B scaled by h
  /** @param {{ Cx: any, side: string, x: number, b: any }} input */
  function measureSweepPoint({ Cx, side, x, b }) {
    if (b.na) { return { x, b, cr: NaN, ev: NaN, worst: NaN, itm: false }; }
    const scale = (side === "A" ? 1 : Cx.h) / b.S, toS = side === "A" ? Cx.toSA : Cx.toSB, stats = Cx.statsAtPeriodVol(b);
    return {
      x, b, cr: b.tv * scale, ev: stats ? stats.ev * scale : NaN,
      worst: POS.worstIn(b, toS(Cx.wlo), toS(Cx.whi)) * scale, itm: b.legs.some(l => l.qty < 0 && l.itm)
    };
  }
  // the position as traded, with its typed fills, on the sweep's axis: null when nothing is typed or it is off the axis
  /** @param {{ Cx: any, side: string, sweep: any, lo: number, hi: number }} input */
  function sweepTypedPoint({ Cx, side, sweep, lo, hi }) {
    const b = side === "A" ? Cx.A : Cx.B;
    const hasTyped = !!sweep && !b.na && b.typedCount > 0;
    if (!hasTyped || !(sweep.x0 >= lo && sweep.x0 <= hi)) { return null; }
    return measureSweepPoint({ Cx, side, x: sweep.x0, b });
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
    q("#sw-cap").textContent = `Varies on the ${basis === "delta" ? "Δ" : basis === "money" ? "% OTM" : "σ"} basis. ${sideTxt("A")} · ${sideTxt("B")}. Shaded: a short leg is in the money against the forward. Dashed lines: the positions as set.${[C.A, C.B].some(b => !b.na && b.typedCount > 0) ? " Every placement is priced at the fill mode; a ring marks the position as traded, at your typed fill." : ""}`;
    // ATM on the x axis: 0 on % and σ; on Δ the forward strike's Δ (none for the mean of a strangle's two legs)
    const atmX = s => { const x = sides[s]; if (!x || mode === "wingCall") return NaN; if (basis !== "delta") return 0; if (mode === "both" && !x.straddle) return NaN; const c = x.b.E.callDelta(x.b.E.Fpar) * 100; return mode === "put" ? 100 - c : c; };
    const strength = +V().sweepSmoothing || 0;
    const windowResult = strength > 0 ? pickSmoothingWindow({ seriesList: [sa, sb], strength }) : null;
    const smoothWindow = windowResult && windowResult.ok ? windowResult.value : NaN;
    const isSmoothed = Number.isFinite(smoothWindow);
    if (windowResult) { q("#sw-cap").textContent += describeSmoothing({ windowResult, basis }); }
    if (isSmoothed) { q("#sw-lgd").insertAdjacentHTML("beforeend", ` <span class="swbadge" title="strike steps averaged out over this window; the raw lines stay faint">smoothed · ${esc(RULE.fmtV(smoothWindow, basis))} window</span>`); }
    for (const [k, label] of [["cr", anyI ? "Credit, time value" : "Credit"], ["ev", `Expected value ${C.volOddsText({ isCompact: true })}`], ["worst", `Worst loss, ${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}`]]) {
      const evTip = `At expiry under a zero-drift lognormal at each ticker's period vol: ${[...new Set([C.A.tk, C.B.tk])].map(id => `${id} ${C.volOf(id).label}`).join(", ")}`;
      const box = document.createElement("span"); box.className = "sw"; box.innerHTML = `<h3>${label}${k === "cr" && anyI ? `<span class="info" tabindex="0" data-tip="Credit minus intrinsic value at entry. Out of the money it is the whole credit; in the money the cash credit also returns intrinsic value paid back at expiry.">i</span>` : ""}${k === "ev" ? `<span class="info" tabindex="0" data-tip="${esc(evTip)}">i</span>` : ""}</h3>`; host.appendChild(box);
      const W = Math.max(box.clientWidth, 220), H = 178, m = { l: 52, r: 16, t: 14, b: 34 };
      // the positions as traded (typed fills) are part of the range: they are the points that matter most
      const typedPoints = ["A", "B"].map(side => sweepTypedPoint({ Cx: C, side, sweep: sides[side], lo, hi })).filter(Boolean);
      const ys = [...(sa || []), ...(sb || []), ...(sd || []), ...typedPoints].map(p => p[k]).filter(Number.isFinite);
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
      const smooth = smoothEach({ bySide: { A: sa, B: sb, D: sd }, field: k, width: smoothWindow });
      for (const [s, ser, cv] of /** @type {[string, any[], string][]} */ ([["B", sb, "b"], ["A", sa, "a"]])) {
        if (!ser) continue; const x0 = sides[s].x0;
        if (Number.isFinite(x0) && x0 >= lo && x0 <= hi) el("line", { x1: X(x0), x2: X(x0), y1: m.t, y2: H - m.b, stroke: `var(--${cv})`, "stroke-dasharray": "3 3", "stroke-opacity": .8 }, svg);
        if (isSmoothed) { el("path", { d: pathOf(ser.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": 1, "stroke-opacity": .35, "stroke-linejoin": "round" }, svg); }
        el("path", { d: pathOf(smooth[s].map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      }
      if (sd) {
        if (isSmoothed) { el("path", { d: pathOf(sd.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: "var(--ink)", "stroke-width": 1, "stroke-opacity": .3, "stroke-linejoin": "round" }, svg); }
        el("path", { d: pathOf(smooth.D.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: "var(--ink)", "stroke-width": 1.4, "stroke-linejoin": "round" }, svg);
      }
      for (const side of ["A", "B"]) {
        const typed = sweepTypedPoint({ Cx: C, side, sweep: sides[side], lo, hi });
        if (!typed || !Number.isFinite(typed[k])) { continue; }
        const ring = el("circle", { cx: X(typed.x), cy: Y(typed[k]), r: 4.5, fill: "var(--surface)", stroke: `var(--${side.toLowerCase()})`, "stroke-width": 2 }, svg);
        el("title", {}, ring).textContent = `${side} as traded, at your typed fill: ${fU(typed[k])}`;
      }
      const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
      const hit = el("rect", { x: m.l, y: m.t, width: pw, height: H - m.t - m.b, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", ev => {
        const r = svg.getBoundingClientRect(), x = clamp(xOfPx((ev.clientX - r.left) * W / r.width), lo, hi);
        let i = 0; for (let j = 1; j < xs.length; j++) if (Math.abs(xs[j] - x) < Math.abs(xs[i] - x)) i = j;
        cross.setAttribute("x1", X(xs[i])); cross.setAttribute("x2", X(xs[i])); cross.setAttribute("visibility", "visible");
        const f = (p, ps) => !p ? "n/a" : p.b.na ? "n/a" : `${isSmoothed && ps ? `${fU(ps[k])} smoothed · raw ${fU(p[k])}` : fU(p[k])} <span class="muted">${legsTxt(p.b)}${p.itm ? " · ITM" : ""}</span>`;
        showTip(`<span class="h">${sweepAxisName(mode, basis, sides)} ${RULE.fmtV(xs[i], basis)}</span>${krow(`<i class="sw" style="background:var(--a)"></i>A`, f(sa && sa[i], smooth.A && smooth.A[i]))}${krow(`<i class="sw" style="background:var(--b)"></i>B${hb()}`, f(sb && sb[i], smooth.B && smooth.B[i]))}${sd ? krow(`<i class="sw" style="background:var(--ink)"></i>A − ${hTxt()}`, fU(sd[i][k])) : ""}`, ev.clientX, ev.clientY);
      });
      hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
      const plotH = H - m.t - m.b;
      AXES.attach({ svg, orient: "x", band: { x: m.l, y: H - m.b, width: pw, height: m.b }, guide: { from: m.t, to: H - m.b },
        toValue: px => clamp(xOfPx(px), lo, hi), toPx: X, describe: x => describePlacementOnAxis({ x, xs, sa, sb, basis, mode, sides, field: k }) });
      AXES.attach({ svg, orient: "y", band: { x: 0, y: m.t, width: m.l, height: plotH }, guide: { from: m.l, to: W - m.r },
        toValue: py => yhi - (py - m.t) / plotH * (yhi - ylo), toPx: Y, describe: v => `<span class="h">${label} ${fU(v)}</span>${describeUnitRows(v)}` });
    }
  }
  // a placement value on the sweep's axis: what A and B resolve to there, and their readings at that point
  /** @param {{ x: number, xs: number[], sa: any[], sb: any[], basis: string, mode: string, sides: any, field: string }} input */
  function describePlacementOnAxis({ x, xs, sa, sb, basis, mode, sides, field }) {
    let i = 0;
    for (let j = 1; j < xs.length; j++) { if (Math.abs(xs[j] - x) < Math.abs(xs[i] - x)) { i = j; } }
    const rows = [["A", sa], ["B", sb]].map(([side, series]) => {
      const point = series && series[i];
      if (!point || point.b.na) { return ""; }
      const credit = point.b.cr * 100;
      return `<span class="s">${side}: ${esc(legsTxt(point.b))} · ${point.b.cr < 0 ? "debit" : "credit"} $${Math.abs(credit).toFixed(0)}${point.itm ? " · a leg ITM" : ""}</span>` +
        krow(`${side} credit, time value`, fU(point.cr)) + krow(`${side} EV at period vol`, fU(point.ev)) + krow(`${side} worst loss in range`, fU(point.worst));
    }).join("");
    return `<span class="h">${esc(sweepAxisName(mode, basis, sides))} ${RULE.fmtV(xs[i], basis)}</span>${rows}`;
  }

  // ============================================================ manage the trade: take profit, stop, or hold (manage.js)
  // seeded paths at each ticker's period vol, marked daily on the implied smile; computed after paint (a 50-day
  // position takes a few hundred ms), memoized, and drawn when ready
  const MANAGE_VIEW = { job: 0 };
  const manageInputs = (b, vw) => ({ built: b, vol: C.volOf(b.tk).pct / 100, takeProfit: vw.mgTp / 100, stopLoss: vw.mgSl / 100, shock: C.shock });
  function renderManage() {
    const vw = V(), host = q("#mg"), sides = [["A", C.A], ["B", C.B]].filter(([, b]) => !b.na);
    q("#mg-knob").innerHTML = KNOBS.html({ id: "mg-method", title: "How the management rule is simulated", body: `Price paths at each ticker's period vol (zero-drift lognormal, one step a calendar day), the same ${MANAGE.CONFIG.paths.toLocaleString("en-US")} seeded paths for every rule. Each day the position is marked with the model's marks on the implied smile (what you could close it for, at mid; natural fills also pay half the spread to close), and closed when its P&amp;L reaches the take profit (a share of the credit) or the stop (a loss of a multiple of the credit). Otherwise it settles at expiry. Holding to expiry has an exact EV, which also corrects the managed EV's noise (control variate); ± is one standard error. Not modelled: gaps inside a day, IV moving with the price, early assignment.` });
    q("#mg-cap").textContent = `${vw.mgTp > 0 ? `Close at +${vw.mgTp}% of the credit` : "No take profit"}, ${vw.mgSl > 0 ? `close at a loss of ${vw.mgSl}% of the credit` : "no stop"}; otherwise hold to expiry. $ a contract of each position; marks at the implied smile, moves at the period vol.`;
    const pending = sides.filter(([, b]) => b.cr > 0 && !MANAGE.peek(manageInputs(b, vw)));
    if (pending.length) {
      host.innerHTML = `<span class="cap">computing ${MANAGE.CONFIG.paths.toLocaleString("en-US")} paths…</span>`;
      const job = ++MANAGE_VIEW.job;
      setTimeout(() => { if (job !== MANAGE_VIEW.job) { return; } for (const [, b] of pending) { MANAGE.simulate(manageInputs(b, vw)); } if (job === MANAGE_VIEW.job) { renderManage(); } }, 30);
      return;
    }
    const results = sides.map(([side, b]) => [side, b, MANAGE.simulate(manageInputs(b, vw))]);
    host.innerHTML = describeManageTable(results);
  }
  /** @param {any[]} results [side, built, Result] */
  function describeManageTable(results) {
    const usd = v => { const dollars = Math.abs(v * 100); return formatSigned({ value: v * 100, digits: dollars >= 100 ? 0 : dollars >= 10 ? 1 : 2, prefix: "$" }); };
    const cell = (r, f) => !r.ok ? `<td class="muted">${esc(r.error.message)}</td>` : `<td>${f(r.value)}</td>`;
    const row = (label, f, tip) => `<tr><td>${label}${tip ? KNOBS.html({ body: tip }) : ""}</td>${results.map(([, , r]) => cell(r, f)).join("")}</tr>`;
    const day = d => Number.isFinite(d) ? ` · day ${d.toFixed(1)}` : "";
    const head = `<tr><th></th>${results.map(([side, b]) => `<th>${key(side)} <span class="muted">${esc(b.label.tab)}</span></th>`).join("")}</tr>`;
    return `<table class="cmp mgt"><thead>${head}</thead><tbody>` +
      row("Take profit hit", v => `${fPct(v.takeProfit.share)}${day(v.takeProfit.meanDay)}`) +
      row("Stop hit", v => `${fPct(v.stop.share)}${day(v.stop.meanDay)}`) +
      row("Held to expiry", v => fPct(v.expiry.share)) +
      row("Days held, on average", v => `${v.meanDays.toFixed(1)} of ${v.days}`) +
      row("EV a trade · managed / held", v => `<b>${usd(v.managedMean)}</b> ±${(v.managedError * 100).toFixed(1)} / ${usd(v.heldMean)}`, "Expected P&L per contract. Managed: closed by the rule; held: to expiry, exact. A take profit gives up the decay of the last days; a stop cuts the tail. The difference is what the rule costs or earns per trade.") +
      row("EV a day held · managed / held", v => `<b>${usd(v.managedPerDay)}</b> / ${usd(v.heldPerDay)}`, "EV per day the margin is tied up. If the freed margin goes straight into the next trade, this is the rate that compounds.") +
      row("Win rate · managed / held", v => `${fPct(v.winRate)} / ${fPct(v.heldWinRate)}`) +
      row("Worst 5%, mean · managed / held", v => `${usd(v.managedWorst)} / ${usd(v.heldWorst)}`, "The mean of the worst 5% of outcomes per contract: what the stop is for.") +
      `</tbody></table>`;
  }

  // ============================================================ recovery dynamics: how many cycles one bad hit is worth
  // a kσ hit uses the position's own σ to its own expiry; the headline is whole cycles × days, as the date beside it
  // one side's recovery reading: the hit, the three growth rates and the chosen one (recovery.js does the maths)
  function recRun(Cx, b, who, vw) {
    if (!b || b.na) { return null; }
    const hit = { basis: vw.rdHit, k: vw.rdK, side: vw.rdDir, fraction: vw.rdL / 100 };
    const rec = RECOVERY.computeRecovery({ built: b, vol: Cx.volOf(b.tk).pct / 100, hit, capital: vw.rdCap, growth: vw.rdG, typedRate: vw.rdGc / 100 });
    if (rec.status === "na") { return null; }
    const capPS = vw.rdCap === Capital.Notional ? b.S : b.margin;
    return { b, who, rec, g: rec.status === "ok" ? rec.growth : NaN, L: rec.L, xMove: rec.price, days: b.dte, capPS };
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
    // whole cycles × days, always in weeks (the view counts weeks)
    const N = Math.ceil(n - 1e-9), wk = N * days / 7;
    return { v: `${wk.toFixed(1)} wk`, s: `${N} cycle${N === 1 ? "" : "s"}`, d: `${n.toFixed(1)} needed · ${N} × ${days}d →\u00a0${dstr(N * days)}` };
  }
  // growth a cycle, signed from its printed value: "+1.41%", "−1.41%", and "0.00%" for anything that rounds to zero
  const growthTxt = g => { if (!Number.isFinite(g)) return "–"; const t = Math.abs(g * 100).toFixed(2); return (+t === 0 ? "" : g > 0 ? "+" : MINUS) + t + "%"; };
  const RATE_WORD = Object.freeze({ [GrowthRate.IfNoSuchHit]: "if no such hit", [GrowthRate.Average]: "average", [GrowthRate.BestCase]: "best case", [GrowthRate.Typed]: "typed" });
  const rateKnob = () => KNOBS.html({ id: "rec-rates", title: "Three growth rates a cycle", body: "Best case: the most the position can make in one cycle, on its capital (the full credit if the price pins the strike). If no such hit: the compounded growth a cycle in the cycles where no loss as large as the hit happens; the smaller losses still compound in it, so it falls as the hit grows and can sit below the average. Average: the expected P&amp;L a cycle, plain; the expected NAV, but not a compounding rate at full margin. All at the ticker's period vol (zero-drift lognormal), at expiry." });
  const honestyKnob = () => KNOBS.html({ id: "rec-honesty", title: "Chance of no such hit", body: "The if-no-such-hit rate assumes the hit does not happen again while recovering. q is the chance of a loss at least as large as the hit in one cycle; (1 − q)^N is the chance it does not happen in any of the N cycles the recovery takes. Amber below 50%: then the recovery more likely than not meets another such hit." });
  /** @param {{ run: any, vw: any, base: string, dstr: (days: number) => string }} input */
  function describeRecoveryRun({ run, vw, base, dstr }) {
    const r = run.rec, head = `<span class="rh">${esc(run.b.label.full)} · ${run.days}-day cycles</span>`;
    if (r.status === "wiped") { return `<span class="rrun">${key(run.who)}${head}<span class="rv hc"><span class="l">Hit</span><span class="v neg">wiped out</span><span class="d">${describeHitBases(r)} · the hit exceeds the capital</span></span></span>`; }
    if (r.status === "none") { return `<span class="rrun">${key(run.who)}${head}<span class="rv hc"><span class="l">Hit</span><span class="v">no loss</span><span class="d">the move does not cost this position anything</span></span></span>`; }
    const recovery = recTime(recCycles(r.L, r.growth, "rec", base), run.days, r.L, dstr), buffer = recTime(recCycles(r.L, r.growth, "buf", base), run.days, base === "nav" ? r.L : 0, dstr);
    const where = run.xMove ? `at ${fPx2(run.xMove)} (${fS(run.xMove / run.b.S - 1, 1)})` : "a fixed share";
    const onMargin = vw.rdCap !== Capital.Notional, other = onMargin ? `${MINUS}${(r.Lnotional * 100).toFixed(1)}% of notional` : `${MINUS}${(r.Lmargin * 100).toFixed(1)}% of margin`;
    // against NAV when the hit lands, recovery and buffer take the same time: one column then
    const isSameTime = base === "nav";
    const timeCell = (label, t) => `<span class="rv"><span class="l">${label}</span><span class="v">${t.v}<small>${t.s ? ` (${t.s})` : ""}</small></span><span class="d">${t.d}</span></span>`;
    return `<span class="rrun">${key(run.who)}${head}` +
      `<span class="rv hc"><span class="l">Hit</span><span class="v ${r.L >= 1 ? "neg" : ""}">${MINUS}${(r.L * 100).toFixed(1)}%<small> of ${onMargin ? "margin" : "notional"}</small></span><span class="d">${other} · ${where}</span></span>` +
      (isSameTime ? timeCell("Recovery", recovery) : timeCell("Recovery (hit first)", recovery) + timeCell("Buffer (climb first)", buffer)) +
      `<span class="rrates">${describeRates({ rec: r, chosen: vw.rdG })}${rateKnob()}</span>` +
      (vw.rdG === GrowthRate.IfNoSuchHit ? `<span class="rhon${r.isAmber ? " w" : ""}">${describeHonesty(r)}${honestyKnob()}</span>` : "") + `</span>`;
  }
  const describeHitBases = r => `${MINUS}${(r.Lmargin * 100).toFixed(1)}% of margin · ${MINUS}${(r.Lnotional * 100).toFixed(1)}% of notional`;
  // the three rates side by side, the chosen one bold, each with its cycles
  /** @param {{ rec: any, chosen: string }} input */
  function describeRates({ rec, chosen }) {
    const cyc = n => Number.isFinite(n) ? `${n.toFixed(1)} cycles` : "never";
    const items = [[GrowthRate.IfNoSuchHit, rec.rates.noHit, rec.cycles.noHit], [GrowthRate.Average, rec.rates.average, rec.cycles.average], [GrowthRate.BestCase, rec.rates.best, rec.cycles.best]];
    if (chosen === GrowthRate.Typed) { items.push([GrowthRate.Typed, rec.rates.typed, rec.cycles.chosen]); }
    return items.map(([id, rate, n]) => { const text = `${growthTxt(rate)} ${RATE_WORD[id]} (${cyc(n)})`; return id === chosen ? `<b>${text}</b>` : text; }).join(" · ");
  }
  function describeHonesty(r) {
    if (!Number.isFinite(r.wholeCycles)) { return `no such hit in any one cycle: ${((1 - r.q) * 100).toFixed(1)}% (${(r.q * 100).toFixed(1)}% a cycle); it never recovers at this rate`; }
    return `chance of no such hit in the ${r.wholeCycles} cycle${r.wholeCycles === 1 ? "" : "s"}: <b>${(r.survival * 100).toFixed(0)}%</b> (${(r.q * 100).toFixed(1)}% a cycle)`;
  }
  function renderRecovery() {
    const host = q("#rec"), vw = V();
    const runs = [recRun(C, C.A, "A", vw), recRun(C, C.B, "B", vw)].filter(Boolean);
    // dates count from the data's as-of day (UTC), or from now when the data has none
    const asof = calendar.readUtcDayStart(INST.asof), t0 = Number.isFinite(asof) ? asof : calendar.nowMs();
    const dstr = days => calendar.formatDayAfter({ startMs: t0, days }).replace(/ /g, "\u00a0");   // the date never breaks across lines
    const hitTxt = vw.rdHit === "fixed" ? `a fixed ${vw.rdL}% hit` : `a ${vw.rdK}σ move to its own expiry, ${vw.rdDir === "worse" ? "the worse side" : vw.rdDir}`;
    const narrow = host.clientWidth < 900;
    host.classList.toggle("narrow", narrow);
    const base = vw.rdBase;
    let L = `<span class="rl">` + runs.map(r => describeRecoveryRun({ run: r, vw, base, dstr })).join("") +
      `<span class="cap rcap pnote">${hitTxt}; a cycle rolls the same tenor; whole cycles round up, because a partly elapsed cycle cannot be traded.${base === "nav" ? " Measured against NAV when it lands, recovery and buffer take the same time at a constant growth rate." : ""}</span></span>`;
    host.innerHTML = L + `<span class="rr"><span id="rec-ch" class="rch"></span><span class="cap rcap">cycles needed (capped at 60) against the hit · ${base === "nav" ? "recovery = buffer when the hit is a % of NAV" : "solid: recovery, dashed: buffer"}</span></span>`;
    LAST.rec = runs.map(r => ({ who: r.who, L: r.L, g: r.g, rec: recCycles(r.L, r.g, "rec", base), headline: recTime(recCycles(r.L, r.g, "rec", base), r.days, r.L, dstr) }));
    const box = q("#rec-ch"), W = Math.max(320, box.getBoundingClientRect().width), H = 220, m = { l: 48, r: 24, t: 10, b: 28 }, pw = W - m.l - m.r;
    const hs = []; for (let h = 0.05; h <= 0.951; h += 0.01) hs.push(h);
    // the curve: each hit size with the chosen rate at that size (the if-no-such-hit rate depends on the hit)
    const rateAt = (r, h) => { if (vw.rdG === GrowthRate.Typed) { return vw.rdGc / 100; } const x = RECOVERY.ratesFor({ built: r.b, vol: C.volOf(r.b.tk).pct / 100, capital: r.capPS, hit: h }); return vw.rdG === GrowthRate.Average ? x.average : vw.rdG === GrowthRate.BestCase ? x.best : x.noHit; };
    const runsOk = runs.filter(r => r.rec.status === "ok" || r.rec.status === "wiped" || r.rec.status === "none");
    let ymax = 1; for (const r of runsOk) for (const h of hs) for (const k of ["rec", "buf"]) { const n = recCycles(h, rateAt(r, h), k, base); if (Number.isFinite(n)) ymax = Math.max(ymax, Math.min(n, 60)); }
    ymax = Math.min(ymax, 60) * 1.05; const X = h => m.l + (h - 0.05) / 0.9 * pw, Y = n => m.t + (1 - Math.min(n, ymax) / ymax) * (H - m.t - m.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "cycles needed against hit size" }, box), ax = el("g", { class: "ax" }, svg);
    for (const t of ticks(0, ymax, 4)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, String(t), { "text-anchor": "end" }); }
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) txt(ax, X(t), H - 10, MINUS + Math.round(t * 100) + "%", { "text-anchor": "middle" });
    for (const r of runs) {
      const cv = r.who.toLowerCase();
      for (const [k, dash] of [["rec", ""], ["buf", "5 4"]]) { const pts = hs.map(h => [h, recCycles(h, rateAt(r, h), k, base)]).filter(p => Number.isFinite(p[1]) && p[1] <= ymax); if (pts.length > 1) el("path", { d: pathOf(pts, X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": dash ? 1.4 : 2, "stroke-dasharray": dash }, svg); }
      if (r.L > 0.05 && r.L < 0.95) for (const k of ["rec", "buf"]) { const n = recCycles(r.L, r.g, k, base); if (Number.isFinite(n) && n <= ymax) el("circle", { cx: X(r.L), cy: Y(n), r: 3.5, fill: k === "rec" ? `var(--${cv})` : "var(--surface)", stroke: `var(--${cv})`, "stroke-width": 1.5 }, svg); }
      const last = hs.map(h => [h, recCycles(h, rateAt(r, h), "rec", base)]).filter(p => Number.isFinite(p[1]) && p[1] <= ymax).pop(); if (last) txt(svg, Math.min(X(last[0]) + 4, W - m.r + 4), Y(last[1]) + 4, r.who, { fill: `var(--${cv})`, "font-weight": 600, "font-size": 11 });
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
  // pure: state -> {state (the tree), events}. The value is the clicked strike's unrounded achieved value on the side's current basis,
  // so it resolves back to exactly that strike. On B it goes through setB, which unlinks placement (or that wing) only.
  function smilePlace(stateX, Cx, tag, role, K) {
    // setOp names the side's CMP mutator for STATE.cmpOp and is the same step in the toast's action
    const isB = tag === "B", setOp = isB ? ActionStep.SetB : ActionStep.SetA, P = isB ? Cx.Bp : Cx.Ap, b = isB ? Cx.B : Cx.A, E = b.E, basis = P.basis;
    const opt = smileOptions(Cx, tag, b, K, RULE.cpOf(role === "center" ? "short put" : role)).find(o => o.role === role) || smileOptions(Cx, tag, b, K, "C").find(o => o.role === role);
    const why = opt ? opt.why : `${fK(K)} cannot take that role`;
    if (why) return { state: stateX, events: [{ type: "note", aspects: [], text: `Not placed: ${why}`, actions: [] }], refused: why };
    let r, extra = [];
    if (role === "center") r = STATE.cmpOp(stateX, setOp, "values.center", RULE.valueAt(E, K, "center", basis));
    else if (role === "short put" || role === "short call") {
      const leg = role === "short put" ? "put" : "call", other = leg === "put" ? "call" : "put", v = RULE.valueAt(E, K, role, basis);
      if (P.legs === "together") {
        const nv = RULE.shiftTogether(P.values, leg, v), keep = +P.values[other];
        r = STATE.cmpOp(stateX, setOp, "values", { put: nv.put, call: nv.call });
        extra.push({ type: "note", aspects: [], text: `${tag}'s ${leg} is on ${fK(K)}${leg === "put" ? "P" : "C"}; the legs are together, so the ${other} moved by the same step`, actions: [CMP.createAction({ label: "detach legs to move only this leg", steps: [[setOp, "legs", "detached"], [setOp, "values." + other, keep]] })] });
      } else r = STATE.cmpOp(stateX, setOp, "values." + leg, v);
    } else {
      const s = role === "long call" ? "call" : "put", Ks = (b.legs.find(l => l.role === (s === "call" ? "short call" : "short put")) || {}).K;
      r = STATE.cmpOp(stateX, setOp, `wings.${s}.value`, RULE.valueAt(E, K, role, basis, Ks));
    }
    // check that the clicked leg landed on the clicked strike
    const nb = isB ? CMP.buildB(r.state.comparison) : CMP.buildA(r.state.comparison), want = role === "center" ? "short put" : role, got = nb.na ? null : nb.legs.find(l => l.role === want);
    if (!got || got.K !== K) extra.push({ type: "note", aspects: [], text: `${tag}'s ${ROLEWORD[role]} resolved to ${got ? fK(got.K) : "n/a"}, not ${fK(K)}${(nb.flags.find(f => f.code === "WIDENED") || {}).text ? ": " + nb.flags.find(f => f.code === "WIDENED").text : ""}`, actions: [] });
    return { state: r.state, events: r.events.concat(extra), landed: got ? got.K : null };
  }
  // PlaceLeg: a click on a smile quote puts one leg on exactly that strike. Pure: the context is rebuilt from the state
  // the command runs on, so the handler sees what the popover showed
  function placeLeg({ state, command }) {
    const r = smilePlace(state, CTX.ctx9(state), command.side, command.role, command.strike);
    return STATE.convertToOutcome({ state, result: r });
  }
  function registerCommandHandlers(registry) { registry.register(Command.PlaceLeg, placeLeg); return registry; }
  function openLegPop(p, gr, ev) {
    let h = `<span class="h">${fK(p.K)}${p.cp} · ${gr.inst.id} ${fmtE(p.e)}</span><span class="s">${(Math.abs(p.delta) * 100).toFixed(1)}Δ fwd · ${p.bid.toFixed(2)} / ${p.ask.toFixed(2)}${p.model ? " · model quote" : ""}</span>`;
    const opts = [];
    for (const [tag, b] of gr.pos) if (b.exp === p.e) for (const o of smileOptions(C, tag, b, p.K, p.cp)) opts.push(Object.assign({ tag }, o));
    if (!opts.length) h += `<span class="s" style="font-family:var(--f-ui)">No leg of A or B uses this chain and expiry.</span>`;
    opts.forEach((o, i) => {
      const P = o.tag === "A" ? C.Ap : C.Bp, now = (o.tag === "A" ? C.A : C.B).legs.find(l => l.role === (o.role === "center" ? "short put" : o.role));
      h += `<button type="button" data-i="${i}"${o.why ? ` disabled title="${esc(o.why)}"` : ""}>${key(o.tag)}Use as ${ROLEWORD[o.role]}${now ? ` <span class="muted">now ${fK(now.K)}</span>` : ""}${o.tag === "B" && C.comparison.links.placement && !o.role.startsWith("long") ? ` <span class="muted">· B's strikes then set on their own</span>` : ""}${P.legs === "together" && P.structure !== "straddle" && !o.role.startsWith("long") ? ` <span class="muted">· both legs move</span>` : ""}</button>${o.why ? `<span class="why">${esc(o.why)}</span>` : ""}`;
    });
    openPopAt(h, ev.clientX, ev.clientY, e => {
      const btn = e.target.closest("button[data-i]"); if (!btn || btn.disabled) return;
      const o = opts[+btn.dataset.i];
      $("#pop").hidden = true; run({ type: Command.PlaceLeg, side: o.tag, role: o.role, strike: p.K });
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
      const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
      AXES.attach({ svg, orient: "x", band: { x: m.l, y: H - m.b, width: plotW, height: m.b }, guide: { from: m.t, to: H - m.b },
        toValue: px => xlo + (px - m.l) / plotW * (xhi - xlo), toPx: X, describe: K => describeStrikeOnAxis({ strike: K, inst: I, expiries: exps }) });
      AXES.attach({ svg, orient: "y", band: { x: 0, y: m.t, width: m.l, height: plotH }, guide: { from: m.l, to: W - m.r },
        toValue: py => yhi - (py - m.t) / plotH * (yhi - ylo), toPx: Y, describe: iv => describeIvOnAxis({ iv, inst: I, expiries: exps }) });
    }
    q("#sm-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A legs</span> <span><i style="background:var(--b)"></i>B legs, dashed</span> <span class="muted">+ = long wing</span>`;
  }

  // a strike on the smile's axis: where it sits, the fitted IV and its skew, and the listed quotes nearest to it
  /** @param {{ strike: number, inst: any, expiries: string[] }} input */
  function describeStrikeOnAxis({ strike, inst, expiries }) {
    let html = `<span class="h">${esc(inst.id)} strike ${fPx2(strike)}</span>`;
    for (const expiry of expiries) {
      const E = inst.exp(expiry), listed = E.strikes.reduce((best, k) => Math.abs(k - strike) < Math.abs(best - strike) ? k : best, E.strikes[0]);
      const put = E.row(listed, "P"), call = E.row(listed, "C"), fit = E.smile(strike);
      const quote = o => o ? `${o.bid.toFixed(2)} / ${o.ask.toFixed(2)}` : "none";
      html += `<span class="s">${fmtE(expiry)} · forward ${fPx2(E.Fpar)}</span>` +
        krow("from the forward", `${fS(strike / E.Fpar - 1, 1)} · ${(Math.log(strike / E.Fpar) / E.sigma).toFixed(2)}σ`) +
        krow("call Δ / put Δ", `${(E.callDelta(strike) * 100).toFixed(0)} / ${(100 - E.callDelta(strike) * 100).toFixed(0)}`) +
        krow("fitted IV · vs ATM", `${fP(fit, 1)} · ${formatSigned({ value: (fit - E.atm) * 100, digits: 1, suffix: " pts" })}`) +
        krow(`listed ${fK(listed)}: put · call bid / ask`, `${quote(put)} · ${quote(call)}`);
    }
    return html;
  }
  // an IV level on the smile's axis: the moves it implies, and an ATM straddle priced at it
  /** @param {{ iv: number, inst: any, expiries: string[] }} input */
  function describeIvOnAxis({ iv, inst, expiries }) {
    const periodVol = C.volOf(inst.id).pct / 100;
    let html = `<span class="h">IV ${fP(iv, 1)}</span>` + krow("1-day move (1σ)", `±${fP(iv / Math.sqrt(365), 2)}`) + krow("1-week move (1σ)", `±${fP(iv * Math.sqrt(7 / 365), 1)}`) +
      krow(`vs period vol ${fP(periodVol, 0)}`, formatSigned({ value: (iv - periodVol) * 100, digits: 1, suffix: " pts" }));
    for (const expiry of expiries) {
      const E = inst.exp(expiry), move = iv * Math.sqrt(E.T), straddle = 0.7979 * E.Fpar * move * 100;
      html += `<span class="s">${fmtE(expiry)} · ${E.dte} d</span>` + krow("move to expiry (1σ)", `±${fP(move, 1)}`) +
        krow("vs ATM IV", formatSigned({ value: (iv - E.atm) * 100, digits: 1, suffix: " pts" })) + krow("ATM straddle at this IV", `≈ $${straddle.toFixed(0)} a contract`);
    }
    return html;
  }

  // ============================================================ notes
  function notes() {
    const at = String(INST.asof || ""), ad = calendar.formatAsOfDay(at), tm = at.slice(11, 16), when = !tm || tm === "16:00" ? "close" : tm + " ET";
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
      `Odds: implied is the risk-neutral distribution from the smile (Breeden–Litzenberger on the forward); before expiry it is shrunk by √(t/T). Period vol is a zero-drift lognormal at the ticker's period vol: one number per ticker for every expiry, annualized like IV, by default IBKR's listed 30-day historical vol (${nameVolSource({ source: VolSource.Hv30 })}), set under Market facts (Edit beside the ticker). Profit means a P&L above 0 at expiry; the breakevens are every price where the payoff crosses 0, so a net debit that cannot profit shows 0% and no breakeven. Under implied odds EV is fill vs mid; every other EV reading (the sweep, the overview's EV, recovery, the export) uses the period vol whatever the odds switch says. σ stays implied everywhere: the move axis, the worst-loss range, sizing and placement.`,
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
    <div class="ph"><span class="tools"><label class="chk"><input type="checkbox" id="c-pso">odds strip</label><label class="chk"><input type="checkbox" id="c-pss">±1σ, ±2σ</label></span><h2 id="pay-h">Payoff at expiry</h2><span class="lgd" id="pay-lgd"></span></div>
    <div class="tline" id="tline" title="Read the chart at a trading day before A's expiry. Before expiry the P&amp;L is the model's mark (the implied smile, with the shocks under P&amp;L through time); the expiry payoff stays as a faint line">
      <span class="tl-lbl">Days to expiry</span>
      <span class="tl-track"><span class="tl-marks" id="tl-marks"></span><input type="range" id="c-payleft" min="0" max="1" step="1" aria-label="Trading day before A's expiry"></span>
      <output class="tl-out" id="c-paylefto"></output>
      <span class="tl-replay" role="group" aria-label="Replay">
        <span class="tl-rl">Replay</span>
        <button type="button" class="ibtn" id="tl-start" title="To today"></button><button type="button" class="ibtn" id="tl-back" title="Replay backwards (loops)"></button><button type="button" class="ibtn" id="tl-play" title="Replay towards expiry (loops)"></button><button type="button" class="ibtn" id="tl-end" title="To expiry"></button>
        <select id="tl-speed" aria-label="Replay speed" title="Replay speed"><option value="1">1 day/s</option><option value="2" selected>2 days/s</option><option value="4">4 days/s</option><option value="8">8 days/s</option></select>
      </span>
    </div>
    <div class="lensbar" id="lensbar">
      <span class="tl-lbl">Lens</span><span class="seg" id="c-lens" aria-label="Lens"></span>
      <span class="lb-tools"><span class="ctl" id="c-payatw" hidden><span class="lbl">at a move of</span><input type="number" id="c-payat" min="-90" max="300" step="1" style="width:56px" aria-label="Price move for the lens, %">%</span><span class="ctl" id="c-ivw"><span class="lbl">IV band</span><span class="seg" id="c-iv"></span></span><button type="button" class="ytog" id="c-extra" aria-pressed="false"></button></span>
    </div>
    <p class="ybadge wide" id="pay-xhint" hidden></p>
    <div class="chart" id="pay"></div>
    <div class="lensread" id="pay-read"></div>
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
        <span class="mrow cap">Moves marks before expiry: this grid, the joint map and the pins. Entry prices and at-expiry views stay. To re-price the entry itself, give the instrument an IV shift under Market facts.</span>
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
  <section class="panel" id="p-manage">
    <div class="ph"><span class="tools"><span class="ctl"><span class="lbl">Take profit at</span><input type="number" id="c-mgtp" min="0" max="95" step="5" style="width:52px"> % of the credit</span><span class="ctl" style="margin-right:0"><span class="lbl">Stop at a loss of</span><input type="number" id="c-mgsl" min="0" max="1000" step="25" style="width:58px"> % of the credit</span></span><h2>Manage the trade</h2><span id="mg-knob"></span></div>
    <span class="cap mgcap pnote" id="mg-cap"></span>
    <div class="mg" id="mg"></div>
  </section>
  <section class="panel" id="p-joint"></section>
  <section class="panel" id="p-sweep">
    <div class="ph"><span class="tools"><span class="ctl"><span class="lbl">Vary</span><span class="seg" id="c-sweep"></span></span><span class="ctl" style="margin-right:0" title="How hard to average out the steps the listed $1 strikes make: a Gaussian window of this many strike steps (the axis distance between strike changes), on a logarithmic slider: the left half only rounds the corners, the right end averages over about two strikes. Far left = the raw stepped lines, which stay faint behind a smoothed one."><span class="lbl">Smoothing</span><input type="range" id="c-swsmooth" min="0" max="20" step="1" style="width:110px;vertical-align:middle"><output id="c-swsmootho" style="display:inline-block;min-width:74px;margin-left:5px"></output></span></span><h2>Strike placement sweep</h2><span class="info" tabindex="0" data-tip="Each line re-picks strikes as the placement value moves on the current basis, everything else held. At expiry, in the page units, with B scaled by the current h. Worst loss uses the worst-loss range from the payoff table. Dashed lines mark the positions as set; each sits on its own curve.">i</span></div>
    <span class="lgd swlgd" id="sw-lgd"></span>
    <div class="sweep" id="sweep"></div>
    <span class="cap swcap pnote" id="sw-cap"></span>
  </section>
  <section class="panel" id="p-rec">
    <div class="ph"><span class="tools"><span class="ctl"><span class="lbl">Hit</span><span class="seg" id="c-rdhit"></span></span><span class="ctl" id="rd-hitin"></span><span class="ctl"><span class="lbl">Growth</span><span class="seg" id="c-rdg"></span></span>
      <details class="menu" id="m-rd"><summary>Basis</summary><span class="mb" style="width:330px">
        <span class="mt">How the hit and the growth are measured</span>
        <span class="mrow"><span class="lbl">The hit is a % of</span><span class="seg" id="c-rdbase"></span></span>
        <span class="mrow"><span class="lbl">Capital per position</span><span class="seg" id="c-rdcap"></span></span>
        <span class="mrow"><span class="lbl">Typed growth</span><span id="rd-gc"><input type="number" id="c-rdgc" step="0.1" style="width:56px">% a cycle (when Growth says Typed)</span></span>
        <span class="cap">With the hit as a % of NAV when it lands, recovery and buffer take the same number of cycles at a constant growth rate. Measured against the starting capital they split: recovery needs ln(1/(1−L)) of log-growth, the buffer only ln(1+L).</span></span></details></span><h2>Recovery dynamics</h2><span class="info" tabindex="0" data-tip="How many cycles of normal compounding one bad hit is worth. Recovery: the hit lands in the first cycle, then the account compounds back to its starting NAV. Buffer: the account compounds first, until the same hit would leave it at or above the starting NAV. A cycle is one roll of the same tenor; real time is whole cycles × days. A kσ hit uses each position's own σ to its own expiry.">i</span></div>
    <div class="rec" id="rec"></div>
  </section>
  <section class="panel" id="p-smile">
    <div class="ph"><span class="lgd tools" id="sm-lgd"></span><h2>Smile and legs</h2><span class="sub">Click a quote to put a leg on exactly that strike.</span></div>
    <div class="smile" id="smile"></div>
  </section>
  <details class="panel notes" id="p-notes"><summary><h2>Method and caveats</h2></summary><ul id="notes"></ul></details>`;

  function wire(opts) {
    opts = opts || {};
    HOST = opts.host || document.querySelector("#views");
    if (!HOST) { HOST = document.createElement("div"); HOST.id = "views"; (document.querySelector("#tab-cmp") || document.body).appendChild(HOST); }
    HOST.classList.add("v9views"); HOST.innerHTML = MARKUP;
    // a control on one prefs / assumptions key: its value goes into the patch as is
    const pref = k => v => ({ type: Command.SetPref, patch: { [k]: v } }), assume = k => v => ({ type: Command.SetAssumption, patch: { [k]: v } });
    const prefNumber = k => v => ({ type: Command.SetPref, patch: { [k]: +v } });
    seg({ el: q("#c-ovv"), options: [["chart", "Charts"], ["table", "Table"]], read: state => state.prefs.ovv, command: pref("ovv") });
    q("#p-over").addEventListener("toggle", () => { if (C) safe(renderOverview, "overview"); });
    q("#ovtable").addEventListener("click", e => { const b = e.target.closest("button[data-set]"); if (!b || b.disabled) return; const c = OV[+b.dataset.i]; if (c) setFromCell(b.dataset.set, c); });
    // the slider moves over the trading-day stops; its value is the stop's index, the pref the calendar days left
    q("#c-payleft").addEventListener("input", ev => { stopReplay({ keep: false }); const stops = listTradingStops(), i = clamp(+(/** @type {HTMLInputElement} */ (ev.target)).value, 0, stops.length - 1); setPref({ payLeft: stops[i].left }); });
    q("#tl-start").innerHTML = ICONS.skipBack; q("#tl-end").innerHTML = ICONS.skipForward;
    seg({ el: q("#c-lens"), options: [[PayLens.Pnl, "P&amp;L", "Each position's P&L at the chosen day"], [PayLens.Day, "Day change", "What each position made since the trading day before, at every price; A − B below"], [PayLens.Decay, "Time decay", "The price to close at one price, day by day, against a straight line; the decay each day"], [PayLens.Move, "Decay vs move", "How far the price may move in a day before that day's decay is gone, against a normal day's move"], [PayLens.Zone, "Profit zone", "The break-even prices from today to expiry, inside the price cone"], [PayLens.Ev, "EV map", "Where the expected P&L comes from across prices, on the chosen day"]], read: state => state.prefs.payLens, command: pref("payLens") });
    q("#c-extra").addEventListener("click", () => setPref({ payExtra: !V().payExtra }));
    seg({ el: q("#c-iv"), options: [["0", "off"], ["5", "±5"], ["10", "±10"]], read: state => String(state.prefs.payIv), command: v => ({ type: Command.SetPref, patch: { payIv: +v } }) });
    // the chart steps through the days with the arrow keys (Home: today, End: expiry)
    q("#pay").tabIndex = 0;
    q("#pay").title = "Click the chart, then ← → step the trading days (Home: today, End: expiry)";
    q("#pay").addEventListener("keydown", ev => {
      const keys = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
      if (!(ev.key in keys)) { return; }
      ev.preventDefault(); stopReplay({ keep: false });
      const time = readPayoffTime(), last = time.stops.length - 1, index = clamp(time.index + keys[ev.key], 0, last);
      setPref({ payLeft: time.stops[Number.isFinite(index) ? index : keys[ev.key] < 0 ? 0 : last].left });
    });
    q("#c-payat").addEventListener("change", ev => setPref({ payAt: +(/** @type {HTMLInputElement} */ (ev.target)).value || 0 }));
    q("#tl-play").addEventListener("click", () => toggleReplay(1));
    q("#tl-back").addEventListener("click", () => toggleReplay(-1));
    q("#tl-start").addEventListener("click", () => jumpTo("today"));
    q("#tl-end").addEventListener("click", () => jumpTo("expiry"));
    q("#tl-speed").addEventListener("change", ev => {
      REPLAY.stepsPerSecond = +(/** @type {HTMLSelectElement} */ (ev.target)).value;
      if (REPLAY.timer) { clearInterval(REPLAY.timer); REPLAY.timer = setInterval(stepReplay, 1000 / REPLAY.stepsPerSecond); }
    }); bindChk({ input: "#c-pso", read: state => state.prefs.pso, command: pref("pso") }); bindChk({ input: "#c-pss", read: state => state.prefs.pss, command: pref("pss") });
    q("#cmp").addEventListener("click", e => { if (/** @type {Element} */ (e.target).closest("[data-xmore]")) { setPref({ cmpMore: !V().cmpMore }); } });
    q("#cmp").addEventListener("change", e => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      // "own" starts from the move range in view (the render context's bounds)
      if (t.matches("[data-wl]")) { const v = t.value; setAssumption(v === "own" ? { wl: v, wlo: -C.lo, whi: C.hi } : { wl: v }); }
      if (t.matches("[data-wlo],[data-whi]")) { const v = Math.abs(parseFloat(t.value)); if (v > 0) setAssumption({ [t.matches("[data-wlo]") ? "wlo" : "whi"]: v }); else askFrame(); }
    });
    seg({ el: q("#c-align"), options: [["frac", "% of life", "Rows are the same share of each position's life"], ["cal", "Same date", "Rows are calendar days; an expired position keeps its expiry payoff"]], read: state => state.assumptions.align, command: assume("align") });
    seg({ el: q("#c-gval"), options: [["pnl", "P&L"], ["contrib", "× odds", "P&L weighted by the odds of each column: shows where the expected value comes from"]], read: state => state.prefs.gval, command: pref("gval") });
    seg({ el: q("#c-gview"), options: [["heat", "Heatmap"], ["num", "Numbers"]], read: state => state.prefs.gview, command: pref("gview") });
    seg({ el: q("#c-gtab"), options: [["A", "A"], ["B", "B"], ["D", "A − h·B"]], read: state => state.prefs.gtab, command: pref("gtab") });
    bindRange({ input: "#c-ivs", output: "#o-ivs", read: state => state.assumptions.ivs, command: assume("ivs"), format: v => (v > 0 ? "+" : v < 0 ? MINUS : "±") + Math.abs(v) + " vol pts" });
    bindRange({ input: "#c-svs", output: "#o-svs", read: state => state.assumptions.svs, command: assume("svs"), format: v => v ? `+${v} pts per −10%` : "off" });
    bindChk({ input: "#c-svd", read: state => state.assumptions.svd, command: assume("svd") });
    q("#shockReset").addEventListener("click", () => setAssumption({ ivs: 0, svs: 0 }));
    bindChk({ input: "#c-gl", read: state => state.prefs.gl, command: pref("gl") });
    seg({ el: q("#c-ct"), options: [["zero", "Break-even"], ["lev", "Levels"]], read: state => state.prefs.ct, command: pref("ct") });
    bindSelect({ input: "#c-cts", options: [[1, "every 1%"], [2, "every 2%"], [5, "every 5%"], [10, "every 10%"], [20, "every 20%"]], read: state => state.prefs.cts, command: prefNumber("cts") });
    for (const k of ["ovk", "ovc", "ovb", "ovs", "ovo"]) bindChk({ input: "#c-" + k, read: state => state.prefs[k], command: pref(k) });
    seg({ el: q("#c-cs"), options: [["comp", "Compressed"], ["lin", "Linear"]], read: state => state.prefs.cs, command: pref("cs") });
    seg({ el: q("#c-cr"), options: [["auto", "Full range"], ["fix", "Fixed"]], read: state => state.prefs.cr, command: pref("cr") });
    const crx = /** @type {HTMLInputElement} */ (q("#c-crx"));
    crx.addEventListener("change", () => { const v = parseFloat(crx.value); if (v > 0) setPref({ crx: v }); else askFrame(); });
    subscribeSync({ sync: state => { if (document.activeElement !== crx) crx.value = state.prefs.crx; } });
    bindChk({ input: "#c-shared", read: state => state.prefs.shared, command: pref("shared") });
    bindSelect({ input: "#c-nm", options: [[9, "9"], [13, "13"], [17, "17"], [25, "25"]], read: state => state.prefs.nm, command: prefNumber("nm") });
    bindSelect({ input: "#c-nd", options: [[1, "1 day"], [2, "2 days"], [5, "5 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"]], read: state => state.prefs.nd, command: prefNumber("nd") });
    q("#csvBtn").addEventListener("click", () => copyText({ text: GRID.csv || "", fallbackField: q("#csvFallback") }));
    q("#pins").addEventListener("click", e => {
      const t = /** @type {HTMLElement} */ (e.target), b = /** @type {HTMLElement} */ (t.closest("button[data-k]"));
      if (b) run({ type: Command.RemovePin, index: +b.dataset.k });
      if (t.id === "pinclr") run({ type: Command.ClearPins });
    });
    q("#p-joint").addEventListener("click", e => { if (/** @type {HTMLElement} */ (e.target).id !== "jgo") return; const other = INST.list().find(x => x.id !== C.A.tk); if (other) run({ type: Command.SetB, path: "inst", value: { id: other.id } }); });
    q("#p-joint").addEventListener("input", e => { const t = /** @type {HTMLInputElement} */ (e.target); if (t.id === "c-jday") setPref({ jday: +t.value }); });
    bindRange({ input: q("#c-swsmooth"), output: q("#c-swsmootho"), read: state => smoothingPositionOf(state.prefs.sweepSmoothing), command: position => ({ type: Command.SetPref, patch: { sweepSmoothing: +smoothingAt(+position).toFixed(4) } }), format: position => describeSmoothingStrength(smoothingAt(position)) });
    seg({ el: q("#c-sweep"), options: [["both", "Short legs"], ["put", "Put"], ["call", "Call"], ["wingCall", "Protective call"]], read: state => state.prefs.sweep, command: pref("sweep") });
    // recovery
    seg({ el: q("#c-rdhit"), options: [["move", "From a move"], ["fixed", "Fixed %"]], read: state => state.prefs.rdHit, command: pref("rdHit") });
    seg({ el: q("#c-rdbase"), options: [["nav", "NAV when it lands"], ["start", "starting capital"]], read: state => state.prefs.rdBase, command: pref("rdBase") });
    seg({ el: q("#c-rdcap"), options: [["margin", "Margin"], ["notional", "Notional"]], read: state => state.prefs.rdCap, command: pref("rdCap") });
    seg({ el: q("#c-rdg"), options: [[GrowthRate.IfNoSuchHit, "If no such hit", "Compounded growth in the cycles without a loss as large as the hit (the default)"], [GrowthRate.Average, "Average", "Expected P&L a cycle"], [GrowthRate.BestCase, "Best", "The most one cycle can make"], [GrowthRate.Typed, "Typed", "Your own rate (under Basis)"]], read: state => state.prefs.rdG, command: pref("rdG") });
    q("#rd-hitin").innerHTML = `<span id="rd-mv"><input type="number" id="c-rdk" min="0.25" max="6" step="0.25" style="width:52px">σ <span class="seg" id="c-rddir"></span></span><span id="rd-fx"><input type="number" id="c-rdl" min="1" max="99" step="1" style="width:52px">%</span>`;
    seg({ el: q("#c-rddir"), options: [["worse", "worse side"], ["down", "down"], ["up", "up"]], read: state => state.prefs.rdDir, command: pref("rdDir") });
    const num = ({ id, key, lo, hi }) => {
      const i = /** @type {HTMLInputElement} */ (q(id));
      i.addEventListener("change", () => { const v = parseFloat(i.value); if (Number.isFinite(v)) setPref({ [key]: clamp(v, lo, hi) }); else askFrame(); });
      subscribeSync({ sync: state => { if (document.activeElement !== i) i.value = state.prefs[key]; } });
    };
    num({ id: "#c-mgtp", key: "mgTp", lo: 0, hi: 95 }); num({ id: "#c-mgsl", key: "mgSl", lo: 0, hi: 1000 });
    num({ id: "#c-rdk", key: "rdK", lo: 0.25, hi: 6 }); num({ id: "#c-rdl", key: "rdL", lo: 1, hi: 99 }); num({ id: "#c-rdgc", key: "rdGc", lo: -20, hi: 50 });
    subscribeSync({ sync: state => { const vw = state.prefs; q("#rd-mv").hidden = vw.rdHit !== "move"; q("#rd-fx").hidden = vw.rdHit !== "fixed"; q("#rd-gc").style.opacity = vw.rdG === GrowthRate.Typed ? "1" : ".5"; } });
    if (typeof ResizeObserver === "function") { let w0 = 0; new ResizeObserver(es => { const w = Math.round(es[0].contentRect.width); if (w0 && Math.abs(w - w0) > 2) askFrame(); w0 = w; }).observe(HOST); }
    notes();
    return HOST;
  }
  function render(c) {
    if (!HOST) return;
    C = c || CTX.ctx9(S());
    setStick();
    // only the shown junior view: Comparison draws every panel but the smile, Market facts only the smile
    const view = V().cmpView;
    if (view === CompareView.Capture) { return; }
    if (view === CompareView.Facts) { safe(renderSmile, "smile"); return; }
    safe(renderOverview, "overview"); safe(renderPayoff, "payoff"); safe(renderCmp, "comparison table");
    safe(renderGrid, "grid"); safe(renderPins, "pins"); safe(renderJoint, "joint"); safe(renderManage, "manage"); safe(renderSweep, "sweep");
    safe(renderRecovery, "recovery"); safe(notes, "notes");
    requestAnimationFrame(setStick);
  }
  // the payoff lens for the export, as last drawn on the page (its title, day and readout lines); null without a readout
  function exportLens() {
    if (!HOST) { return null; }
    const lines = [...q("#pay-read").querySelectorAll(".dr")].map(node => node.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!lines.length) { return null; }
    return { title: q("#pay-h").textContent, day: q("#c-paylefto").textContent.replace(/\s+/g, " ").trim(), lines };
  }
  return {
    render, wire, notes, LAST, registerCommandHandlers, exportLens,
    // pure helpers (node-testable): no DOM, they take the context explicitly
    ovVariants, ovCells, sameTrade, sweepSide, sweepData, recRun, recCycles, recTime, growthTxt, besTxt, gridRows, fN0, fP0, zeroTxt, ratioTxt, payTicks, niceIn, smileGroups, smileOptions, smilePlace, pairWorst, pairPop
  };
})();
