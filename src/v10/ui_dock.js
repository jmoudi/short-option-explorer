// ============================================================ ui9_dock: the Positions dock (Compare tab)
// A table of aspects, A | link | B (instrument with spot/IV overrides, expiry, structure, legs, strikes by,
// protective call, protective put, fill), full-width placement and wing sliders under their rows, then the
// collapsed "Legs in detail" and "Pair sizing" sections. Reads only C and the store; changes state only through
// commands. Top-level name: DOCK9.
const DOCK9 = (() => {
  const q = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const att = s => esc(s).replace(/'/g, "&#39;");
  // signs follow the printed text: a value that rounds to zero prints unsigned ("0.00σ", never "−0.00σ")
  const sgn = (v, t) => v < 0 && (t == null || +t !== 0) ? MINUS : "";
  const sgs = (v, t) => +t === 0 ? "" : v < 0 ? MINUS : "+";
  const f2 = v => { if (!Number.isFinite(v)) return "–"; const t = Math.abs(v).toFixed(2); return sgn(v, t) + t; };
  const usd = x => { const a = Math.abs(x); return "$" + (a >= 20 || Math.abs(a - Math.round(a)) < 0.05 ? Math.round(a).toLocaleString("en-US") : a.toFixed(1)); };
  const fV = (v, b) => RULE.fmtV(v, b);
  const fC = (v, b) => { const t = fV(v, b); return (b !== "delta" && v > 0 && parseFloat(t) !== 0 ? "+" : "") + t; };   // a straddle center off the forward, signed
  const fT = (v, b) => { const t = String(+Math.abs(+v).toFixed(b === "sigma" ? 2 : 1)); return sgn(+v, t) + t; };
  const BASIS = [["delta", "Δ", "Place strikes by forward delta (call N(d1) on the forward, put = 100 − call)"], ["money", "% OTM", "Place strikes by % from the forward (negative = in the money)"], ["sigma", "σ", "Place strikes by distance from the forward in units of the position's own ATM σ√T"]];
  const BNAME = { delta: "Δ", money: "% OTM", sigma: "σ" };
  const ROWS = { inst: "Instrument", exp: "Expiry", structure: "Structure", legs: "Legs", placement: "Strikes by", wingCall: "Protective call", wingPut: "Protective put", fill: "Fill" };
  // the A↔B link toggle: a closed chain (B follows A) or a broken one (B set on its own)
  const CH_ON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6.6 9.4 9.4 6.6"/><path d="M7.2 4.8 8.7 3.3a2.6 2.6 0 0 1 3.7 3.7L10.9 8.5"/><path d="M8.8 11.2 7.3 12.7a2.6 2.6 0 0 1-3.7-3.7L5.1 7.5"/></svg>`;
  const CH_OFF = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8.4 3.6 9.6 2.4a2.6 2.6 0 0 1 3.7 3.7L12.1 7.3"/><path d="M7.6 12.4 6.4 13.6a2.6 2.6 0 0 1-3.7-3.7L3.9 8.7"/><path d="M5.6 2.2 6.2 4.2M2.2 5.6 4.2 6.2M10.4 13.8 9.8 11.8M13.8 10.4 11.8 9.8"/></svg>`;

  let root = null, lastKey = "", C = null, SL = {};
  const ui = { inst: { A: false, B: false } };
  // the sizing select's sync (bindSelect hands it over): run in syncSizing, as v9's list was, so it runs only while
  // the dock shows and only when the dock rendered
  const SIZING_SYNCS = [];
  const posOf = side => side === "A" ? C.Ap : C.Bp;
  const bOf = side => side === "A" ? C.A : C.B;
  const instOf = side => side === "A" ? C.instA : C.instB;
  const run = command => page.executor.execute(Object.assign({ source: "dock" }, command));
  /** @param {{ side: string, path: string, value: any }} edit */
  const setSide = ({ side, path, value }) => run({ type: side === "A" ? Command.SetA : Command.SetB, path, value });
  const readAValues = () => { const stateNow = page.store.read(); return stateNow.cmp.A.values; };
  const setPref = patch => run({ type: Command.SetPref, patch });
  const askFrame = () => page.frames.mark({ cause: FrameCause.Ui });
  const amber = (side, row) => C.diff.items.filter(it => !it.asked && it.side === side && it.dockRow === row);
  const legOf = (b, key) => b && !b.na ? b.legs.find(l => l.key === key) || null : null;
  const segH = (side, path, opts, cur, eq) => `<span class="seg${eq === false ? "" : " eq"}">${opts.map(([v, l, t]) => `<button type="button" data-act="set" data-side="${side}" data-path="${path}" data-v="${v}" class="${String(cur) === v ? "on" : ""}" aria-pressed="${String(cur) === v}"${t ? ` title="${att(t)}"` : ""}>${l}</button>`).join("")}</span>`;
  const ovShort = I => Math.abs(I.spot - I.spotListed) > 1e-9 * I.spotListed ? fPx2(I.spot) : `IV ${I.ivShift > 0 ? "+" : MINUS}${+Math.abs(I.ivShift).toFixed(2)}`;
  const kc = l => l ? fK(l.K) + l.cp : "–";

  // ---------------------------------------------------------- cells
  function instCell(side) {
    const P = posOf(side), I = instOf(side);
    return `<select data-act="inst" data-side="${side}" aria-label="${side} instrument">${INST.list().map(x => `<option value="${esc(x.id)}"${x.id === P.inst.id ? " selected" : ""}>${esc(x.name || x.id)}</option>`).join("")}</select>` +
      `<button type="button" class="d9ov${I && I.overridden ? " on" : ""}" data-act="instx" data-side="${side}" aria-expanded="${ui.inst[side]}" title="${I && I.overridden ? att(`Override: spot ${fPx2(I.spot)} (listed ${fPx2(I.spotListed)})${I.ivShift ? `, IV ${I.ivShift > 0 ? "+" : MINUS}${Math.abs(I.ivShift)} pts` : ""}`) : "Override spot or implied vol"}">${I && I.overridden ? "✎ on" : "spot/IV"} ▾</button>`;
  }
  function expCell(side) {
    const I = instOf(side), cur = bOf(side).exp;
    return I ? `<select data-act="exp" data-side="${side}" aria-label="${side} expiry" style="max-width:100%">${I.expiries.map(e => `<option value="${e}"${e === cur ? " selected" : ""}>${fmtE(e)} · ${I.exp(e).dte}d</option>`).join("")}</select>` : "–";
  }
  // the rarely used expiry mapping rule sits behind the row label's ⓘ, so both expiry selects get the full cell
  const mapBtn = () => `<button type="button" class="info" data-act="expmap" title="If B's instrument lacks A's expiry: use the nearest date, or mark B n/a" aria-label="Expiry mapping">i</button>`;
  const structCell = side => segH(side, "structure", [["straddle", "Straddle", "One strike for put and call"], ["strangle", "Strangle", "A put below and a call above"]], posOf(side).structure);
  const legsCell = side => posOf(side).structure === "straddle"
    ? `<button type="button" class="d9btn" data-act="detach" data-side="${side}" title="Turn the straddle into a flat-topped strangle whose put and call move on their own">Detach legs</button>`
    : segH(side, "legs", [["together", "together", "One control moves put and call by the same amount, keeping their offset"], ["detached", "detached", "Put and call move on their own"]], posOf(side).legs);
  const basisCell = side => segH(side, "basis", BASIS, posOf(side).basis, false);
  const wingCell = (side, s) => segH(side, `wings.${s}.on`, [["false", "off"], ["true", "on", `Buy a protective ${s} beyond the short ${s}`]], String(!!posOf(side).wings[s].on));
  const fillCell = side => segH(side, "fill", [["mid", "mid", "Filled at mid"], ["nat", "natural", "Sell at the bid, buy at the ask; marks before expiry also pay half the spread to close"]], posOf(side).fill);
  // a linked B cell: B's resolved result in muted type (amber when diff marks that aspect unasked)
  function linkedB(a) {
    const b = C.B, P = C.Bp, am = amber("B", a);
    let t = "";
    switch (a) {
      case "inst": { const I = C.instB; t = (I ? I.name || I.id : P.inst.id) + (I && I.overridden ? " ✎ " + ovShort(I) : ""); break; }
      case "exp": { const f = b.flags.find(x => x.code === "EXP_MAPPED"); t = b.exp ? fmtE(b.exp) + (f ? ` (no ${fmtE(f.from)})` : "") : "n/a"; break; }
      case "structure": t = b.na ? "n/a" : b.kind + (b.kind !== P.structure ? ` ${b.kind === "straddle" ? fK(b.sp.K) : fK(b.sp.K) + "P / " + fK(b.sc.K) + "C"}` : ""); break;
      case "legs": t = P.legs; break;
      case "placement": t = BNAME[P.basis]; break;
      case "wingCall": case "wingPut": {
        const s = a === "wingCall" ? "call" : "put", l = legOf(b, a), na = b.flags.find(x => x.code === "WING_NA" && x.leg === a);
        t = !P.wings[s].on ? "off" : na ? "on · n/a" : l ? `on · ${kc(l)}` : "on"; break;
      }
      case "fill": t = P.fill === "nat" ? "natural" : "mid"; break;
    }
    const w = am.length > 0;
    return `<span class="d9m${w ? " w" : ""}"${w ? ` title="${att(am.map(x => x.text).join(" · "))}"` : ` title="B follows A: this is what B resolves to"`}>${w ? "! " : ""}${esc(t)}</span>`;
  }
  const linkBtn = a => { const on = !!C.cmp.links[a]; return `<button type="button" class="d9lk${on ? "" : " off"}" data-act="link" data-aspect="${a}" title="${on ? "B follows A" : "B set on its own"}" aria-label="${on ? "B follows A; click to set B on its own" : "B set on its own; click to make B follow A"}" aria-pressed="${on}">${on ? CH_ON : CH_OFF}</button>`; };

  // ---------------------------------------------------------- sliders
  // spec = {side, name, muted, lo, hi, value, step, readout, warnRo, ticks: [{v, t, bx, pri}], note, noteWarn, input(v)}
  function slider(key, spec) {
    SL[key] = spec;
    return {
      key, cls: `d9F d9sl ${spec.side.toLowerCase()}${spec.muted ? " m" : ""}`,
      inner: () => `<span class="d9sh"><span class="key ${spec.side.toLowerCase()}">${spec.side}</span><span class="d9sn">${esc(spec.name)}</span><span class="d9ro"></span></span><span class="d9tr"><input type="range" step="any" data-sl="${key}" aria-label="${att(spec.side + " " + spec.name)}"><span class="d9tks"></span></span><span class="d9note" hidden></span>`,
      upd: el => updSlider(el, SL[key])
    };
  }
  function updSlider(el, s) {
    const inp = el.querySelector("input"), lo = s.lo, hi = Math.max(s.hi, s.lo + 1e-9);
    if (document.activeElement !== inp) { inp.min = lo; inp.max = hi; inp.value = clamp(s.value, lo, hi); }
    inp.title = `${fV(s.lo, s.basis)} to ${fV(s.hi, s.basis)}`;
    const ro = el.querySelector(".d9ro"); ro.innerHTML = s.readout; ro.classList.toggle("w", !!s.warnRo);
    // ticks, placed greedily by priority: centred on the mark, else starting or ending at it, else left out
    const W = Math.max(120, el.querySelector(".d9tr").clientWidth || 320), span = hi - lo, placed = [];
    const ext = (t, al) => al === "l" ? [t.x, t.x + t.w] : al === "r" ? [t.x - t.w, t.x] : [t.x - t.w / 2, t.x + t.w / 2];
    const tk = (s.ticks || []).filter(t => Number.isFinite(t.v) && t.v >= lo - 1e-9 && t.v <= hi + 1e-9)
      .map(t => ({ ...t, x: 7 + (t.v - lo) / span * (W - 14), w: t.t.length * 5.9 + 4 }))
      .sort((a, b) => (a.pri || 0) - (b.pri || 0));
    // a tick joins when some choice of alignments (centred, starting or ending at the mark) keeps every label apart
    const fits = set => {
      let best = null;
      const rec = (i, acc, score) => {
        if (i === set.length) { if (!best || score < best.score) best = { al: acc.slice(), score }; return; }
        for (const al of ["", "l", "r"]) {
          const [a, b] = ext(set[i], al);
          if (a < 0 || b > W) continue;
          if (acc.some((u, k) => { const [c, d] = ext(set[k], u); return a < d + 5 && b > c - 5; })) continue;
          acc.push(al); rec(i + 1, acc, score + (al ? 1 : 0)); acc.pop();
        }
      };
      rec(0, [], 0); return best;
    };
    for (const t of tk) {
      if (placed.some(u => Math.abs(u.x - t.x) < 3) || placed.length >= 4) continue;
      const r = fits(placed.concat([t]));
      if (r) { placed.push(t); placed.forEach((u, k) => { u.al = r.al[k]; }); }
    }
    const shown = placed.sort((a, b) => a.x - b.x);
    el.querySelector(".d9tr").classList.toggle("noticks", !shown.length);
    el.querySelector(".d9tks").innerHTML = shown.map(t => `<span class="d9tk ${t.al}${t.bx ? " bx" : ""}" style="left:${t.x.toFixed(1)}px"${t.tip ? ` title="${att(t.tip)}"` : ""}>${esc(t.t)}</span>`).join("");
    const n = el.querySelector(".d9note"); n.hidden = !s.note; n.textContent = s.note || ""; n.classList.toggle("w", !!s.noteWarn);
  }
  // drags step (Δ 1, % 0.5, σ 0.05); within half a step of an end the value lands exactly on it
  function stepped(raw, s) {
    const st = RULE.STEP[s.basis] || 1;
    if (raw <= s.lo + st / 2) return s.lo;
    if (raw >= s.hi - st / 2) return s.hi;
    return +(Math.round(raw / st) * st).toFixed(6);
  }
  const atmV = (E, basis, role) => basis !== "delta" ? 0 : role === "short put" ? 100 - E.callDelta(E.Fpar) * 100 : E.callDelta(E.Fpar) * 100;
  const atmT = (E, basis, role, word) => basis === "delta" ? `${word || "ATM"} ${Math.round(atmV(E, basis, role))}Δ` : (word || "ATM");
  const atEnd = (v, e, basis) => { const st = (RULE.STEP[basis] || 1) / 2; return v <= e.lo.value + st ? "lo" : v >= e.hi.value - st ? "hi" : ""; };

  // the placement sliders of one side (A, or B with its own placement); bE = B's chain for "B end" ticks on A
  function placeSliders(side, P, b, out, opt) {
    opt = opt || {};
    const E = opt.E || b.E, bas = P.basis, sk = side + (opt.tag || "");
    if (!E) return;
    const lp = legOf(b, "put"), lc = legOf(b, "call"), muted = !!opt.muted, name = n => opt.name || n;
    const bE = opt.bE, input = opt.input || ((path, v) => setSide({ side, path, value: v }));
    if (P.structure === "straddle") {
      const e = RULE.ends(E, bas, "center"); if (!e) return;
      const c = b.center, atm = P.values.center === "atm";
      const v = atm ? (c ? c.achieved[bas] : atmV(E, bas, "short call")) : +P.values.center;
      const ticks = [{ v: atmV(E, bas, "short call"), t: atmT(E, bas, "short call"), pri: 0, tip: "the strike at the forward" }];
      if (bas === "delta") ticks.push({ v: 50, t: "Δ-neutral", pri: 2, tip: "call Δ 50: the delta-neutral straddle" });
      if (bE) { const eb = RULE.ends(bE, bas, "center"); if (eb) for (const w of ["lo", "hi"]) if (eb[w].value > e.lo.value + 1e-6 && eb[w].value < e.hi.value - 1e-6) ticks.push({ v: eb[w].value, t: "B end", bx: true, pri: 1, tip: `B's chain ends at ${fK(eb[w].K)} (${fV(eb[w].value, bas)})` }); }
      const end = atEnd(v, e, bas);
      out.push(slider(`sl:${sk}:center`, {
        side, basis: bas, name: name("center"), muted, lo: e.lo.value, hi: e.hi.value, value: v, ticks,
        readout: `${atm ? "ATM" : fC(+P.values.center, bas)} → ${c ? `${fK(c.K)} ${fC(c.achieved[bas], bas)}` : "n/a"}` + (!atm && !opt.noAtm ? ` <button type="button" class="d9i" data-act="atm" data-side="${side}" title="Back to the strike nearest the forward">ATM</button>` : ""),
        note: end ? `${opt.whose ? opt.whose + "center " : ""}stops at ${fK(e[end].K)}, the ${end === "lo" ? "lowest" : "highest"} strike with a put and a call bid (${fV(e[end].value, bas)})` : "",
        input: v2 => input("values.center", v2)
      }));
      return;
    }
    const vp = +P.values.put, vc = +P.values.call;
    const ro = (l, cp) => l ? `${fK(l.K)}${cp} ${fV(l.achieved[bas], bas)}` : "n/a";
    if (P.legs === "together" || opt.together) {
      const rt = RULE.rangeTogether(E, bas, P.values); if (!rt) return;
      const lo = vp + rt.dlo, hi = Math.max(vp + rt.dhi, lo);
      const ticks = [{ v: atmV(E, bas, "short put"), t: atmT(E, bas, "short put", "put ATM"), pri: 0, tip: "the put at the forward" }, { v: vp + (atmV(E, bas, "short call") - vc), t: atmT(E, bas, "short call", "call ATM"), pri: 0, tip: "the call at the forward" }];
      if (bE) { const rb = RULE.rangeTogether(bE, bas, P.values); if (rb) for (const [d, leg] of /** @type {[number, string][]} */ ([[rb.dlo, rb.loLeg], [rb.dhi, rb.hiLeg]])) { const x = vp + d; if (x > lo + 1e-6 && x < hi - 1e-6) ticks.push({ v: x, t: "B end", bx: true, pri: 1, tip: `B's ${leg} reaches the end of its chain here` }); } }
      const st = (RULE.STEP[bas] || 1) / 2, end = vp <= lo + st ? "lo" : vp >= hi - st ? "hi" : "";
      const leg = end === "lo" ? rt.loLeg : rt.hiLeg, ex = end === "lo" ? rt.loEnd : rt.hiEnd;
      out.push(slider(`sl:${sk}:both`, {
        side, basis: bas, name: name("put & call"), muted, lo, hi, value: vp, ticks,
        readout: `${fT(vp, bas)} / ${fT(vc, bas)}${RULE.UNIT[bas]} → ${opt.ro ? opt.ro : `${ro(lp, "P")} · ${ro(lc, "C")}`}`,
        note: end ? `${opt.whose || ""}${leg} stops at ${fK(ex.K)}${leg === "put" ? "P" : "C"}, the last ${leg} with a bid (${fV(ex.value, bas)})` : "",
        input: v2 => { const cur = opt.cur ? opt.cur() : P.values; input("values", RULE.shiftTogether(cur, "put", v2)); }
      }));
      return;
    }
    for (const [k, role, l, cp, v] of [["put", "short put", lp, "P", vp], ["call", "short call", lc, "C", vc]]) {
      const e = RULE.ends(E, bas, role); if (!e) continue;
      const ticks = [{ v: atmV(E, bas, role), t: atmT(E, bas, role), pri: 0, tip: `the ${k} at the forward` }];
      if (bE) { const eb = RULE.ends(bE, bas, role); if (eb) for (const w of ["lo", "hi"]) if (eb[w].value > e.lo.value + 1e-6 && eb[w].value < e.hi.value - 1e-6) ticks.push({ v: eb[w].value, t: "B end", bx: true, pri: 1, tip: `B's ${k} chain ends at ${fK(eb[w].K)}${cp} (${fV(eb[w].value, bas)})` }); }
      const end = atEnd(v, e, bas);
      out.push(slider(`sl:${sk}:${k}`, {
        side, basis: bas, name: name(k), muted, lo: e.lo.value, hi: e.hi.value, value: v, ticks,
        readout: `${fV(v, bas)} → ${ro(l, cp)}`, warnRo: !!(l && b.flags.some(f => f.code === "CHAIN_END" && f.leg === k)),
        note: end ? `${opt.whose || ""}${k} stops at ${fK(e[end].K)}${cp}, the last ${k} with a bid (${fV(e[end].value, bas)})` : "",
        input: v2 => input("values." + k, v2)
      }));
    }
  }
  function wingSlider(side, s, P, b, wbas, out) {
    const key = s === "call" ? "wingCall" : "wingPut", role = s === "call" ? "long call" : "long put", sh = legOf(b, s), l = legOf(b, key);
    const na = b.flags.find(f => f.code === "WING_NA" && f.leg === key), E = b.E;
    if (!E || !sh) return;
    const e = RULE.ends(E, wbas, role, sh.K);
    if (!e) { out.push({ key: `wna:${side}:${s}`, cls: "d9F d9bl w", inner: () => `<span class="key ${side.toLowerCase()}">${side}</span>! ${esc(na ? na.text : s + " wing n/a")}` }); return; }
    const v = +P.wings[s].value, end = atEnd(v, e, wbas);
    out.push(slider(`wsl:${side}:${s}`, {
      side, basis: wbas, name: `protective ${s}`, lo: e.lo.value, hi: e.hi.value, value: v, ticks: [],
      readout: `${fV(v, wbas)} → ${l ? `${kc(l)} ${fV(l.achieved[wbas], wbas)}` : "n/a"}`, warnRo: !!b.flags.find(f => f.leg === key && f.severity === "warn"),
      note: end ? `stops at ${fK(e[end].K)}${s === "call" ? "C" : "P"}, the ${end === "lo" ? (wbas === "delta" ? "farthest" : "nearest") : (wbas === "delta" ? "nearest" : "farthest")} ${s} with an ask beyond the short ${kc(sh)} (${fV(e[end].value, wbas)})` : "",
      input: v2 => setSide({ side, path: `wings.${s}.value`, value: v2 })
    }));
  }
  function bLine(key, html, warn, title) { return { key, cls: `d9F d9bl${warn ? " w" : ""}`, inner: () => `<span class="key b">B</span>${html}`, title }; }

  // ---------------------------------------------------------- the component list (its keys decide when to rebuild)
  function comps() {
    const out = [], L = C.cmp.links, A = C.Ap, B = C.Bp;
    SL = {};
    const cell = (key, cls, inner, row) => out.push({ key, cls, inner, row });
    const row = (a, label, fa, fb, extra) => {
      cell(`L:${a}`, "d9L", () => label, a);
      cell(`A:${a}`, "d9A", fa, a);
      cell(`K:${a}`, "d9K", () => linkBtn(a), a);
      const linkedCell = L[a] && !(a === "legs" && B.structure === "straddle");
      cell(`B:${a}:${linkedCell ? "l" : "o"}`, "d9B", linkedCell ? () => linkedB(a) : fb, a);
      if (extra) extra();
    };
    cell("hd:L", "d9L", () => ""); cell("hd:A", "d9A d9hd", () => `<span class="key a">A</span>`); cell("hd:K", "d9K", () => ""); cell("hd:B", "d9B d9hd", () => `<span class="key b">B</span>`);
    row("inst", ROWS.inst, () => instCell("A"), () => instCell("B"), () => {
      for (const side of ["A", "B"]) if (ui.inst[side] && (side === "A" || !L.inst)) out.push({ key: `instx:${side}`, cls: "d9F", row: "inst", inner: () => instX(side), upd: el => updInstX(el, side) });
    });
    row("exp", `${ROWS.exp}${mapBtn()}`, () => expCell("A"), () => expCell("B"));
    row("structure", ROWS.structure, () => structCell("A"), () => structCell("B"));
    row("legs", `${ROWS.legs}<button type="button" class="info" data-act="legsinfo" title="Together or detached; make symmetric">i</button>`, () => legsCell("A"), () => legsCell("B"));
    row("placement", ROWS.placement, () => basisCell("A"), () => basisCell("B"), () => {
      // "B end" ticks only on the row whose field B reads (B with another structure reads the extra row below)
      placeSliders("A", A, C.A, out, { bE: L.placement && !C.B.na && B.structure === A.structure ? C.B.E : null });
      // B reads an A field that A does not use: show it as one muted extra row (edits A's storage only)
      if (L.placement && B.structure !== A.structure && !C.B.na && C.B.E) {
        const used = B.structure === "strangle" ? "strangle values" : "straddle center";
        const Pv = Object.assign({}, A, { structure: B.structure, legs: "together" });
        placeSliders("A", Pv, C.B, out, {
          E: C.B.E, tag: ":forB", whose: "B's ", muted: true, name: `${used} (used by B)`, together: true, noAtm: true,
          ro: (() => { const p = legOf(C.B, "put"), c = legOf(C.B, "call"); return p && c ? `B ${kc(p)} · ${kc(c)}` : "B n/a"; })(),
          cur: readAValues, input: (path, v) => setSide({ side: "A", path, value: v })
        });
      }
      if (L.placement) {
        const b = C.B, am = amber("B", "placement"), bas = B.basis;
        let t;
        if (b.na) t = "n/a";
        else if (b.kind === "straddle" && b.center) { const v = b.center.achieved[bas]; t = `${fK(b.center.K)} · ${fC(v, bas)}`; }
        else { const p = legOf(b, "put"), c = legOf(b, "call"); t = `${kc(p)} / ${kc(c)} · ${fV(p.achieved[bas], bas)} / ${fV(c.achieved[bas], bas)}`; }
        out.push(bLine("bl:placement", `= A · ${esc(t)}${am.length ? ` · <span title="${att(am.map(x => x.text).join(" · "))}">${esc(am[0].text.replace(/^! B: /, "! ").replace(/ at chain end .*/, " at chain end"))}${am.length > 1 ? ` +${am.length - 1}` : ""}</span>` : ""}`, am.length > 0));
        // B's legs detached while its strikes follow A: they cannot move on their own; one click sets B's strikes free
        if (!L.legs && B.structure === "strangle" && B.legs === "detached" && !b.na)
          out.push(bLine("bl:legsmoot", `legs detached, strikes follow A <button type="button" class="d9i" data-act="ownplace" title="B's put and call can move on their own once B's strikes are set on their own (unlinks Strikes by)">unlink strikes</button>`, false));
      } else if (!C.B.na) placeSliders("B", B, C.B, out, {});
    });
    for (const [a, s] of [["wingCall", "call"], ["wingPut", "put"]]) {
      row(a, ROWS[a], () => wingCell("A", s), () => wingCell("B", s), () => {
        if (A.wings[s].on && !C.A.na) wingSlider("A", s, A, C.A, A.basis, out);
        if (B.wings[s].on && !C.B.na) {
          if (L[a]) {
            const l = legOf(C.B, a), na = C.B.flags.find(f => f.code === "WING_NA" && f.leg === a), am = amber("B", a), wb = B.wings[s].basis || A.basis;
            out.push(bLine(`bl:${a}`, `= A · ${na ? esc(na.text) : l ? `${kc(l)} ${fV(l.achieved[wb], wb)}` : "n/a"}${am.length && !na ? ` · <span title="${att(am.map(x => x.text).join(" · "))}">${esc(am[0].text.replace(/^! B: /, "! ").replace(/ at chain end .*/, " at chain end").replace(/^! (call|put) wing /, "! "))}</span>` : ""}`, !!na || am.length > 0));
          } else wingSlider("B", s, B, C.B, B.wings[s].basis || B.basis, out);
        }
      });
    }
    row("fill", ROWS.fill, () => fillCell("A"), () => fillCell("B"));
    return out;
  }
  function instX(side) {
    const I = instOf(side); if (!I) return "";
    return `<span class="d9x"><span class="key ${side.toLowerCase()}">${side}</span> spot <input type="number" data-act="spot" data-side="${side}" step="0.01" min="0" aria-label="${side} spot override"> <span class="muted">listed ${fPx2(I.spotListed)}</span>` +
      `<br>IV shift <input type="number" data-act="ivs" data-side="${side}" step="1" aria-label="${side} implied vol shift in vol points"> vol pts <button type="button" class="d9btn" data-act="ovreset" data-side="${side}">Reset</button>` +
      `<span class="cap">IV +x pts re-prices the entry from model quotes. The IV shock under P&amp;L through time is a move after entry.</span></span>`;
  }
  function updInstX(el, side) {
    const I = instOf(side); if (!I) return;
    const s = el.querySelector('[data-act="spot"]'), v = el.querySelector('[data-act="ivs"]');
    if (s && document.activeElement !== s) s.value = +I.spot.toFixed(4);
    if (v && document.activeElement !== v) v.value = +I.ivShift.toFixed(2);
  }

  // ---------------------------------------------------------- Legs in detail and Pair sizing
  // a leg's distance from the forward, in the summary's line 3 convention: a straddle's strike signed vs the forward
  // ("strike +0.3% / +0.01σ vs fwd"); any other leg as % and σ out of the money ("25.2% / 0.26σ OTM vs fwd",
  // negative = in the money)
  function place(b, l) {
    const pc = (v, d) => { const t = Math.abs(v).toFixed(d); return { s: sgs(v, t), m: sgn(v, t), t }; };
    if (b.center && b.kind === "straddle" && l.qty < 0) { const m = pc(l.money, 1), g = pc(l.sigma, 2); return `strike ${m.s}${m.t}% / ${g.s}${g.t}σ vs fwd`; }
    const o = l.cp === "P" ? -1 : 1, m = pc(o * l.money, 1), g = pc(o * l.sigma, 2);
    return `${m.m}${m.t}% / ${g.m}${g.t}σ OTM vs fwd`;
  }
  function legsDetail() {
    return ["A", "B"].map(side => {
      const b = bOf(side), sideFlags = b.flags.filter(f => !f.leg);
      let h = `<span class="d9lg"><span class="h"><span class="key ${side.toLowerCase()}">${side}</span>${esc(b.label.full)}</span>`;
      h += sideFlags.map(f => `<span class="lf${f.severity === "warn" ? " w" : ""}">${f.severity === "warn" ? "! " : ""}${esc(f.text)}</span>`).join("");
      if (b.na) return h + `<span class="lf w">n/a: ${esc(b.naReason)}</span></span>`;
      h += `<span class="lf">fwd ${fPx2(b.F)} · spot ${fPx2(b.S)} · ATM IV ${fP(b.E.atm, 1)} · σ√T ${b.sig.toFixed(3)} · ${b.dte} d · ${b.fill === "nat" ? "natural fill" : "mid fill"}</span>`;
      for (const l of b.legs) {
        const w = l.qty > 0, fills = b.fill === "nat" ? (w ? "ask" : "bid") : "mid";
        const lf = b.flags.filter(f => f.leg === l.key || (f.leg === "center" && (l.key === "put" || l.key === "call")));
        let itm;
        if (l.itm && l.intrinsic > 0) itm = `ITM vs fwd · intrinsic ${f2(l.intrinsic)} vs spot · time value ${f2(l.timeValue)}`;
        else if (l.itm) itm = `ITM vs fwd ${fPx2(b.F)}, no intrinsic vs spot ${fPx2(b.S)} · time value ${f2(l.timeValue)}`;
        else if (l.intrinsic > 0) itm = `OTM vs fwd ${fPx2(b.F)}, but ${f2(l.intrinsic)} intrinsic vs spot ${fPx2(b.S)} · time value ${f2(l.timeValue)}`;
        else itm = `OTM · all time value`;
        if (Number.isFinite(l.quotePremium)) itm += ` · quote premium over parity ${f2(l.quotePremium)}`;
        h += `<span class="d9leg"><span class="t"><b>${fK(l.K)}${l.cp}</b> ${w ? "long" : "short"} ${l.cp === "P" ? "put" : "call"}${w ? " (protective)" : ""}<span class="px">${l.perContract < 0 ? "debit " + usd(l.perContract) : "credit " + usd(l.perContract)}</span></span>` +
          `<span class="q">bid ${f2(l.bid)} · mid ${f2(l.mid)} · ask ${f2(l.ask)} · fill ${f2(l.fillPx)} at ${fills}${l.model ? " · model quote" : ""}</span>` +
          `<span class="q">IV ${fP(l.iv, 1)} · ${(Math.abs(l.delta) * 100).toFixed(1)}Δ · ${place(b, l)}</span>` +
          `<span class="q">${esc(itm)}</span>` + lf.map(f => `<span class="q${f.severity === "warn" ? " w" : ""}">${f.severity === "warn" ? "! " : ""}${esc(f.text)}</span>`).join("") + `</span>`;
      }
      return h + `</span>`;
    }).join("") + `<span class="cap">$ per contract (100 shares). Δ is the forward delta with the smile at the strike. % and σ OTM are measured from the forward, as on the summary's third line (negative = in the money); ITM is measured against the forward, intrinsic against spot.</span>`;
  }
  function syncSizing() {
    for (const sync of SIZING_SYNCS) { sync(C.S9); }
    const sz = C.cmp.sizing, rn = r => (CTX.SIZES.find(s => s[0] === r) || ["", r])[1].toLowerCase();
    q("#d9-rhc").hidden = sz.rule !== "custom";
    const hc = q("#d9-hc"); if (document.activeElement !== hc) hc.value = +(+sz.h).toFixed(3);
    const k = C.A.na || C.B.na ? NaN : C.h * C.A.S / C.B.S, nm = I => I ? I.name || I.id : "";
    q("#d9-sizesv").textContent = `· ${sz.rule === "auto" ? `auto: ${rn(C.rule)}` : rn(C.rule)}, B ×${C.h.toFixed(2)}`;
    q("#d9-oh").innerHTML = (sz.rule === "auto" ? `Auto uses equal notional when A and B are the same instrument at the same spot and IV, equal vega otherwise (${INST.list().map(x => `${esc(x.name || x.id)} ${x.lev}×`).join(", ")} leveraged). ` : "") +
      `B is held at h = ${C.h.toFixed(3)} × A's notional${C.same || !Number.isFinite(k) ? "." : nm(C.instA) === nm(C.instB) ? `, about ${k.toFixed(2)} B contracts per A contract.` : `, about ${k.toFixed(2)} ${esc(nm(C.instB))} contracts per ${esc(nm(C.instA))} contract.`}` + (C.hNote ? `<br><span class="badge">${esc(C.hNote)}</span>` : "");
  }

  // ---------------------------------------------------------- events
  function onClick(ev) {
    const t = ev.target.closest("[data-act]"); if (!t || t.disabled) return;
    const side = t.dataset.side, act = t.dataset.act;
    if (act === "set") {
      const v = t.dataset.v, val = v === "true" ? true : v === "false" ? false : v; if (t.classList.contains("on")) return;
      // B's legs detached while B's strikes follow A could not move: the gesture also sets B's strikes on their own
      if (side === "B" && t.dataset.path === "legs" && val === "detached" && C.cmp.links.placement) { run({ type: Command.Detach, side: "B" }); return; }
      setSide({ side, path: t.dataset.path, value: val });
    }
    else if (act === "ownplace") {
      // unlinking may restore B's own strikes (that toast says so); a silent unlink gets this one
      const r = run({ type: Command.Unlink, aspect: "placement" });
      const isSilent = r.ok && !r.value.notices.length;
      if (isSilent) {
        const relink = CMP.createAction({ label: "↺ relink", steps: [[ActionStep.Link, "placement"]] });
        const event = { type: "unlinked", aspects: ["placement"], text: "B's strikes are now set on their own: its put and call move on their own", actions: [relink] };
        page.bus.emit(createNoticeEnvelope(STATE.convertEventToNotice(event)));
      }
    }
    else if (act === "link") { const a = t.dataset.aspect; run({ type: C.cmp.links[a] ? Command.Unlink : Command.Link, aspect: a }); }
    else if (act === "detach") run({ type: Command.Detach, side });
    else if (act === "instx") { ui.inst[side] = !ui.inst[side]; askFrame(); }
    else if (act === "ovreset") setSide({ side, path: "inst", value: { id: posOf(side).inst.id } });
    else if (act === "atm") setSide({ side, path: "values.center", value: "atm" });
    else if (act === "expmap") {
      const r = t.getBoundingClientRect(), m = C.cmp.expMap;
      openPopAt(`<span class="h">If B's instrument lacks A's expiry</span><span class="s">B follows A's date when it lists it</span>` +
        `<button type="button" data-pop="expmap" data-v="nearest"${m === "nearest" ? " disabled" : ""}>Use the nearest date (by days)${m === "nearest" ? " ✓" : ""}</button>` +
        `<button type="button" data-pop="expmap" data-v="same"${m === "same" ? " disabled" : ""}>Mark B n/a${m === "same" ? " ✓" : ""}</button>`, r.left, r.bottom, onPop);
    } else if (act === "legsinfo") {
      const r = t.getBoundingClientRect(), btn = side2 => { const P = posOf(side2), b = bOf(side2); if (P.structure !== "strangle" || b.na) return ""; const m = (+P.values.put + +P.values.call) / 2; return `<button type="button" data-pop="sym" data-side="${side2}"${Math.abs(P.values.put - P.values.call) < 1e-9 ? " disabled" : ""}>Make ${side2} symmetric: put = call = ${fV(m, P.basis)}${side2 === "B" && C.cmp.links.placement ? " (sets B's strikes on its own)" : ""}</button>`; };
      openPopAt(`<span class="h">Legs</span><span class="s" style="font-family:var(--f-ui);white-space:normal;max-width:300px">Together: one control moves put and call by the same amount and keeps their offset. Detached: put and call move on their own. A straddle is one strike; Detach legs turns it into a flat-topped strangle.</span>` + btn("A") + btn("B"), r.left, r.bottom, onPop);
    }
  }
  function onPop(ev) {
    const b = ev.target.closest("[data-pop]"); if (!b || b.disabled) return;
    q("#pop").hidden = true;
    if (b.dataset.pop === "expmap") run({ type: Command.SetExpiryMap, expMap: b.dataset.v });
    if (b.dataset.pop === "sym") { const side = b.dataset.side, P = posOf(side), m = (+P.values.put + +P.values.call) / 2; setSide({ side, path: "values", value: { put: m, call: m } }); }
  }
  function onChange(ev) {
    const t = ev.target, act = t.dataset && t.dataset.act, side = t.dataset && t.dataset.side; if (!act) return;
    if (act === "inst") setSide({ side, path: "inst.id", value: t.value });
    else if (act === "exp") setSide({ side, path: "exp", value: t.value });
    else if (act === "spot") { const v = parseFloat(t.value); setSide({ side, path: "inst.spot", value: Number.isFinite(v) && v > 0 ? v : null }); }
    else if (act === "ivs") { const v = parseFloat(t.value); setSide({ side, path: "inst.ivShift", value: Number.isFinite(v) && v !== 0 ? v : null }); }
  }
  function onInput(ev) {
    const t = ev.target; if (!t.dataset || !t.dataset.sl) return;
    const s = SL[t.dataset.sl]; if (!s) return;
    s.input(stepped(+t.value, s));
  }

  // ---------------------------------------------------------- init, render, reveal
  function init() {
    root = q("#d9t");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("input", onInput);
    q("#dockBtn").addEventListener("click", () => setPref({ dock: false }));
    q("#dockOpen").addEventListener("click", () => setPref({ dock: true }));
    bindSelect({ input: "#d9-size", options: CTX.SIZES, read: state => state.cmp.sizing.rule, command: v => ({ type: Command.SetSizing, patch: { rule: v } }), syncList: SIZING_SYNCS });
    const hc = q("#d9-hc"); hc.addEventListener("change", () => { const v = parseFloat(hc.value); if (Number.isFinite(v) && v > 0) run({ type: Command.SetSizing, patch: { h: clamp(v, 0.05, 20) } }); else askFrame(); });
  }
  function render(c) {
    C = c;
    document.body.classList.toggle("dock-off", !C.view.dock);
    if (!C.view.dock) return;
    const list = comps(), key = list.map(x => x.key).join("|");
    if (key !== lastKey) {
      root.innerHTML = list.map(x => `<span class="${x.cls}" data-ck="${att(x.key)}"${x.row ? ` data-row="${x.row}"` : ""}></span>`).join("");
      lastKey = key;
    }
    const els = root.children;
    list.forEach((x, i) => {
      const el = els[i]; if (!el) return;
      // sliders keep their input element (a drag must survive the re-render); everything else is redrawn,
      // except a cell holding the focused input or select
      if (SL[x.key]) { if (!el.querySelector("input")) el.innerHTML = x.inner(); x.upd(el); return; }
      const a = document.activeElement;
      if (a && el.contains(a) && (a.tagName === "INPUT" || a.tagName === "SELECT")) { if (x.upd) x.upd(el); return; }
      el.innerHTML = x.inner(); if (x.title) el.title = x.title;
      if (x.upd) x.upd(el);
    });
    q("#d9-legb").innerHTML = legsDetail();
    q("#d9-legsv").textContent = `· ${C.A.na ? 0 : C.A.legs.length} + ${C.B.na ? 0 : C.B.legs.length} legs, quotes, IV, ITM`;
    syncSizing();
  }
  // open the dock and bring one row into view (from a summary pill)
  function reveal(row, side) {
    if (row === "inst" && side) ui.inst[side === "B" && C && C.cmp.links.inst ? "A" : side] = true;
    if (C && !C.view.dock) setPref({ dock: true }); else askFrame();
    const go = () => {
      const els = root.querySelectorAll(`[data-row="${row}"]`); if (!els.length) return;
      els[0].scrollIntoView({ block: "center", behavior: "smooth" });
      els.forEach(e => { e.classList.add("d9fl"); setTimeout(() => e.classList.remove("d9fl"), 1400); });
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
  }
  return { init, render, reveal, ui };
})();
