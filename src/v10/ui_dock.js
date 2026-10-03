// ============================================================ ui_dock: the Positions dock (Compare tab)
// Two position boxes, A on top and B below: the same kind of thing with two identities, so one box renderer called
// twice, the same rows in the same order (instrument, expiry, structure, legs,
// strikes by with the placement sliders, protective call, protective put, fill with the typed fills, the legs).
// B's relation to A is part of B's box: a chain after each of B's row labels (closed: B follows A there; editing the
// control sets B on its own, and the toast offers the relink; open: B set on its own, click to follow A again).
// Below both boxes: Legs in detail and Pair sizing (a property of the pair). Reads only C and the store; changes state
// only through commands. The period vol belongs to the ticker, not the side. Top-level name: DOCK9.
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

  const DOCK_CONFIG = Object.freeze({
  });
  let C = null, SL = {};
  const roots = { A: null, B: null }, lastKeys = { A: "", B: "" };
  // local view state, not stored: which side's typed-fill editor is open
  const ui = { fills: { A: false, B: false } };
  // the sizing select's sync (bindSelect hands it over): run in syncSizing, while the dock shows
  // the sizing select's sync (bindSelect hands it over): run in syncSizing, as v9's list was, so it runs only while
  // the dock shows and only when the dock rendered
  const SIZING_SYNCS = [];
  const posOf = side => side === "A" ? C.Ap : C.Bp;
  const bOf = side => side === "A" ? C.A : C.B;
  const instOf = side => side === "A" ? C.instA : C.instB;
  const run = command => page.executor.execute(Object.assign({ source: "dock" }, command));
  /** @param {{ side: string, path: string, value: any }} edit */
  const setSide = ({ side, path, value }) => run({ type: side === "A" ? Command.SetA : Command.SetB, path, value });
  const readAValues = () => { const stateNow = page.store.read(); return stateNow.comparison.A.values; };
  const setPref = patch => run({ type: Command.SetPref, patch });
  const askFrame = () => page.frames.mark({ cause: FrameCause.Ui });
  const amber = (side, row) => C.diff.items.filter(it => !it.asked && it.side === side && it.dockRow === row);
  const legOf = (b, key) => b && !b.na ? b.legs.find(l => l.key === key) || null : null;
  const segH = (side, path, opts, cur, eq) => `<span class="seg${eq === false ? "" : " eq"}">${opts.map(([v, l, t]) => `<button type="button" data-act="set" data-side="${side}" data-path="${path}" data-v="${v}" class="${String(cur) === v ? "on" : ""}" aria-pressed="${String(cur) === v}"${t ? ` title="${att(t)}"` : ""}>${l}</button>`).join("")}</span>`;
  const kc = l => l ? fK(l.K) + l.cp : "–";
  // ---------------------------------------------------------- cells
  // the ticker only: its market facts (spot, IV, period vol) are read and edited under Market facts
  function instCell(side) {
    const P = posOf(side);
    return `<select data-act="inst" data-side="${side}" aria-label="${side} instrument">${INST.list().map(x => `<option value="${esc(x.id)}"${x.id === P.inst.id ? " selected" : ""}>${esc(x.name || x.id)}</option>`).join("")}</select>`;
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
  const linkBtn = a => { const on = !!C.comparison.links[a]; return `<button type="button" class="d9lk${on ? "" : " off"}" data-act="link" data-aspect="${a}" title="${on ? "B follows A" : "B set on its own"}" aria-label="${on ? "B follows A; click to set B on its own" : "B set on its own; click to make B follow A"}" aria-pressed="${on}">${on ? CH_ON : CH_OFF}</button>`; };
  // ---------------------------------------------------------- sliders
  // spec = {side, name, muted, lo, hi, value, step, readout, warnRo, ticks: [{v, t, bx, pri}], keepMarks, note, noteWarn, input(v)}
  function slider(key, spec) {
    SL[key] = spec;
    return {
      key, cls: `d9F d9sl ${spec.side.toLowerCase()}${spec.muted ? " m" : ""}`,
      inner: () => `<span class="d9sh"><span class="key ${spec.side.toLowerCase()}">${spec.side}</span><span class="d9sn">${esc(spec.name)}</span><span class="d9ro"></span></span><span class="d9tr"><input type="range" step="any" data-sl="${key}" aria-label="${att(spec.side + " " + spec.name)}"><span class="d9tks"></span></span><span class="d9note" hidden></span>`,
      upd: el => updSlider(el, SL[key])
    };
  }
  function updSlider(el, s) {
    const inp = el.querySelector('input[type="range"]'), lo = s.lo, hi = Math.max(s.hi, s.lo + 1e-9), fmt = s.format || (v => fV(v, s.basis));
    if (document.activeElement !== inp) { inp.min = lo; inp.max = hi; inp.value = clamp(s.value, lo, hi); }
    inp.title = `${fmt(s.lo)} to ${fmt(s.hi)}`;
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
    // spec.keepMarks: a tick left without a label still draws its mark (the label is named elsewhere)
    const bare = s.keepMarks ? tk.filter(t => !placed.includes(t)) : [];
    el.querySelector(".d9tr").classList.toggle("noticks", !shown.length && !bare.length);
    el.querySelector(".d9tks").innerHTML = shown.map(t => `<span class="d9tk ${t.al}${t.bx ? " bx" : ""}" style="left:${t.x.toFixed(1)}px"${t.tip ? ` title="${att(t.tip)}"` : ""}>${esc(t.t)}</span>`).join("") +
      bare.map(t => `<span class="d9tk nl" style="left:${t.x.toFixed(1)}px"${t.tip ? ` title="${att(t.tip)}"` : ""}></span>`).join("");
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
  // the ATM marks name the place only; the Δ there (a fact of the chain) is in the mark's tooltip
  const atmT = (E, basis, role, word) => word || "ATM";
  const atmTip = (E, basis, role, text) => basis === "delta" ? `${text}: ${Math.round(atmV(E, basis, role))}Δ` : text;
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
      const ticks = [{ v: atmV(E, bas, "short call"), t: atmT(E, bas, "short call"), pri: 0, tip: atmTip(E, bas, "short call", "the strike at the forward") }];
      if (bas === "delta") ticks.push({ v: 50, t: "Δ-neutral", pri: 2, tip: "call Δ 50: the delta-neutral straddle" });
      if (bE) { const eb = RULE.ends(bE, bas, "center"); if (eb) for (const w of ["lo", "hi"]) if (eb[w].value > e.lo.value + 1e-6 && eb[w].value < e.hi.value - 1e-6) ticks.push({ v: eb[w].value, t: "B end", bx: true, pri: 1, tip: `B's chain ends at ${fK(eb[w].K)} (${fV(eb[w].value, bas)})` }); }
      const end = atEnd(v, e, bas);
      out.push(slider(`sl:${sk}:center`, {
        side, basis: bas, name: name("center"), muted, lo: e.lo.value, hi: e.hi.value, value: v, ticks,
        readout: `${atm ? "ATM" : fC(+P.values.center, bas)} → ${c ? fK(c.K) : "n/a"}` + (!atm && !opt.noAtm ? ` <button type="button" class="d9i" data-act="atm" data-side="${side}" title="Back to the strike nearest the forward">ATM</button>` : ""),
        note: end ? `${opt.whose ? opt.whose + "center " : ""}stops at ${fK(e[end].K)}, the ${end === "lo" ? "lowest" : "highest"} strike with a put and a call bid (${fV(e[end].value, bas)})` : "",
        input: v2 => input("values.center", v2), step: c ? { E, role: "short call", K: c.K } : null
      }));
      return;
    }
    const vp = +P.values.put, vc = +P.values.call;
    const ro = (l, cp) => l ? `${fK(l.K)}${cp}` : "n/a";
    if (P.legs === "together" || opt.together) {
      const rt = RULE.rangeTogether(E, bas, P.values); if (!rt) return;
      const lo = vp + rt.dlo, hi = Math.max(vp + rt.dhi, lo);
      const ticks = [{ v: atmV(E, bas, "short put"), t: atmT(E, bas, "short put", "put ATM"), pri: 0, tip: atmTip(E, bas, "short put", "the put at the forward") }, { v: vp + (atmV(E, bas, "short call") - vc), t: atmT(E, bas, "short call", "call ATM"), pri: 0, tip: atmTip(E, bas, "short call", "the call at the forward") }];
      if (bE) { const rb = RULE.rangeTogether(bE, bas, P.values); if (rb) for (const [d, leg] of /** @type {[number, string][]} */ ([[rb.dlo, rb.loLeg], [rb.dhi, rb.hiLeg]])) { const x = vp + d; if (x > lo + 1e-6 && x < hi - 1e-6) ticks.push({ v: x, t: "B end", bx: true, pri: 1, tip: `B's ${leg} reaches the end of its chain here` }); } }
      const st = (RULE.STEP[bas] || 1) / 2, end = vp <= lo + st ? "lo" : vp >= hi - st ? "hi" : "";
      const leg = end === "lo" ? rt.loLeg : rt.hiLeg, ex = end === "lo" ? rt.loEnd : rt.hiEnd;
      out.push(slider(`sl:${sk}:both`, {
        side, basis: bas, name: name("put & call"), muted, lo, hi, value: vp, ticks,
        readout: `${fT(vp, bas)} / ${fT(vc, bas)}${RULE.UNIT[bas]} → ${opt.ro ? opt.ro : `${ro(lp, "P")} · ${ro(lc, "C")}`}`,
        note: end ? `${opt.whose || ""}${leg} stops at ${fK(ex.K)}${leg === "put" ? "P" : "C"}, the last ${leg} with a bid (${fV(ex.value, bas)})` : "",
        input: v2 => { const cur = opt.cur ? opt.cur() : P.values; input("values", RULE.shiftTogether(cur, "put", v2)); }, step: lp ? { E, role: "short put", K: lp.K } : null
      }));
      return;
    }
    for (const [k, role, l, cp, v] of [["put", "short put", lp, "P", vp], ["call", "short call", lc, "C", vc]]) {
      const e = RULE.ends(E, bas, role); if (!e) continue;
      const ticks = [{ v: atmV(E, bas, role), t: atmT(E, bas, role), pri: 0, tip: atmTip(E, bas, role, `the ${k} at the forward`) }];
      if (bE) { const eb = RULE.ends(bE, bas, role); if (eb) for (const w of ["lo", "hi"]) if (eb[w].value > e.lo.value + 1e-6 && eb[w].value < e.hi.value - 1e-6) ticks.push({ v: eb[w].value, t: "B end", bx: true, pri: 1, tip: `B's ${k} chain ends at ${fK(eb[w].K)}${cp} (${fV(eb[w].value, bas)})` }); }
      const end = atEnd(v, e, bas);
      out.push(slider(`sl:${sk}:${k}`, {
        side, basis: bas, name: name(k), muted, lo: e.lo.value, hi: e.hi.value, value: v, ticks,
        readout: `${fV(v, bas)} → ${ro(l, cp)}`, warnRo: !!(l && b.flags.some(f => f.code === "CHAIN_END" && f.leg === k)),
        note: end ? `${opt.whose || ""}${k} stops at ${fK(e[end].K)}${cp}, the last ${k} with a bid (${fV(e[end].value, bas)})` : "",
        input: v2 => input("values." + k, v2), step: l ? { E, role, K: l.K } : null
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
      readout: `${fV(v, wbas)} → ${l ? kc(l) : "n/a"}`, warnRo: !!b.flags.find(f => f.leg === key && f.severity === "warn"),
      note: end ? `stops at ${fK(e[end].K)}${s === "call" ? "C" : "P"}, the ${end === "lo" ? (wbas === "delta" ? "farthest" : "nearest") : (wbas === "delta" ? "nearest" : "farthest")} ${s} with an ask beyond the short ${kc(sh)} (${fV(e[end].value, wbas)})` : "",
      input: v2 => setSide({ side, path: `wings.${s}.value`, value: v2 }), step: l ? { E, role, K: l.K, Kshort: sh.K } : null
    }));
  }

  // ---------------------------------------------------------- one position box
  const FILL_SLOT_NAME = Object.freeze({ put: "put", call: "call", wingCall: "protective call", wingPut: "protective put" });
  const legWord = l => l.qty < 0 ? "sold" : "bought";
  const pxOf = v => Number.isFinite(v) ? v.toFixed(2) : "–";
  const signedUsd = v => (v < 0 ? MINUS : "+") + usd(v);
  // the label cell; on B it also carries the chain (B's relation to A for this row) and a "!" when the row differs
  // from A in a way the comparison flags
  function rowLabel(side, aspect, label) {
    if (side !== "B") { return `<span class="plbl">${label}</span>`; }
    const marks = amber("B", aspect);
    const warn = marks.length ? `<span class="pwarn" title="${att(marks.map(x => x.text).join(" · "))}">!</span>` : "";
    return `<span class="plbl">${label}${linkBtn(aspect)}${warn}</span>`;
  }
  // the box head: which position and what it collects; how the fill was got lives in the Fill row, the market facts
  // under Market facts, and every reading of the position in the comparison
  function boxHead(side) {
    const b = bOf(side), key = `<span class="key ${side.toLowerCase()}">${side}</span>`;
    // the instrument is set on its own by default (B is usually another ticker): only the other rows call for it
    const relink = side === "B" && Object.entries(C.comparison.links).some(([aspect, on]) => !on && aspect !== "inst") ? `<button type="button" class="d9btn prl" data-act="relinkall" title="Make every row of B follow A again">Follow A everywhere</button>` : "";
    if (b.na) { return `<span class="pt">${key}<span class="pname">${esc(b.label ? b.label.full : side)}</span>${relink}</span><span class="pnet w">n/a: ${esc(b.naReason)}</span>`; }
    const copy = `<button type="button" class="d9btn pcopy" data-act="copyorder" data-side="${side}" title="Copy an order ticket for this position: the combo, its net limit and every leg">Copy order</button>`;
    return `<span class="pt">${key}<span class="pname">${esc(b.label.full)}</span>${copy}${relink}</span>${creditEditor(side, b)}`;
  }
  // the credit you actually got, typed right in the head: one net price a share (as on the order ticket), split over
  // the sold legs by mid; every reading in the app uses it. Per leg prices stay in the Fill row's editor
  function creditEditor(side, b) {
    const isDebit = b.cr < 0, isTyped = b.typedCount > 0;
    const state = isTyped
      ? `<span class="pcst on">your price ✎</span><button type="button" class="d9btn pcrst" data-act="fillreset" data-side="${side}" title="Forget the typed prices; back to ${b.fill === "nat" ? "natural" : "mid"}">back to ${b.fill === "nat" ? "natural" : "mid"}</button>`
      : "";
    return `<label class="pcred${isTyped ? " typed" : ""}${isMatchTarget(side) ? " matched" : ""}"><span class="pcl" title="Type the net price from your order ticket, per share; empty or 'back to mid' uses the chain">${isDebit ? "Debit paid" : "Credit got"}</span>` +
      `<input type="number" step="0.01" min="0" class="pcin" data-act="fillnet" data-keep="1" data-side="${side}" value="${Math.abs(b.cr).toFixed(2)}" aria-label="${side} ${isDebit ? "debit paid" : "credit received"}, per share">` +
      `<span class="pcu">/share · <b>${usd(b.cr * 100)}</b></span></label>${state || describeShareOfMid(b) ? `<span class="pcstate">${state}${describeShareOfMid(b)}</span>` : ""}${matchControl(side)}`;
  }
  // ---------------------------------------------------------- the credit as a share of the chain's mid, and matching it
  // A and B are not coupled: a side can take the other's share of mid (got 67% of mid on A → 67% of mid on B), or not
  const otherSide = side => side === "A" ? "B" : "A";
  const shareOfMid = b => !b.na && b.crMid > 0 ? b.cr / b.crMid : NaN;
  const isMatchTarget = side => C.prefs.fillMatch === otherSide(side);
  const describeShareOfMid = b => Number.isFinite(shareOfMid(b)) && Math.abs(shareOfMid(b) - 1) > 0.0005 ? ` · ${(shareOfMid(b) * 100).toFixed(0)}% of the chain's mid ${usd(b.crMid * 100)}` : "";
  function matchControl(side) {
    const from = otherSide(side), src = bOf(from), ratio = shareOfMid(src);
    if (isMatchTarget(side)) { return `<span class="pmatch on">follows ${from}: ${(ratio * 100).toFixed(0)}% of mid <button type="button" class="d9btn" data-act="fillmatch" data-v="off" data-side="${side}">unlink</button></span>`; }
    if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.0005) { return ""; }
    return `<span class="pmatch"><button type="button" class="d9btn" data-act="fillmatch" data-v="${from}" data-side="${side}" title="Set this side's credit to the same share of its own chain mid as ${from}'s, and keep it so while ${from} changes">use ${from}'s ${(ratio * 100).toFixed(0)}% of mid here</button></span>`;
  }
  // the matched side follows: its net credit = the source's share of mid × its own mid (one command, next frame agrees)
  let matchPending = false;
  function applyFillMatch() {
    const from = C.prefs.fillMatch;
    if (from === "off" || matchPending) { return; }
    const to = otherSide(from), src = bOf(from), dst = bOf(to), ratio = shareOfMid(src);
    if (!Number.isFinite(ratio) || dst.na || !(dst.crMid > 0)) { return; }
    const want = +(ratio * dst.crMid).toFixed(2);
    if (Math.abs(dst.cr - want) < 0.006) { return; }
    matchPending = true;
    setTimeout(() => { matchPending = false; setNetFill({ side: to, net: want }); }, 0);
  }
  // ---------------------------------------------------------- the order ticket
  const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  const ticketExpiry = exp => `${+exp.slice(6, 8)} ${MONTHS[+exp.slice(4, 6) - 1]} ${exp.slice(2, 4)}`;
  // one position as order-ticket text: the combo with its net limit, then each leg with its side, contract and price
  function describeOrderTicket(b) {
    const expiry = ticketExpiry(b.exp), isCredit = b.cr >= 0, how = b.typedCount ? "your typed fill" : b.fill === "nat" ? "natural" : "mid";
    const legs = b.legs.map(l => `  ${l.qty < 0 ? "SELL" : "BUY "} 1 ${b.tk} ${expiry} ${fK(l.K)} ${l.cp === "P" ? "PUT " : "CALL"} @ ${l.fillPx.toFixed(2)}${l.typed ? " (typed)" : ""}`);
    return [
      `${isCredit ? "SELL" : "BUY"} 1 ${b.tk} ${expiry} ${(b.label.struct || b.kind).replace(/^short /, "")} · net ${isCredit ? "credit" : "debit"} ${Math.abs(b.cr).toFixed(2)} limit (${how})`,
      ...legs,
      `mid ${b.crMid.toFixed(2)} · natural ${b.crNat.toFixed(2)} · ${b.dte} days · quotes as of ${String(INST.asof || "").slice(0, 10)}`
    ].join("\n");
  }
  const fillCellBox = side => {
    const b = bOf(side), open = ui.fills[side];
    const notApplied = b.na ? 0 : b.flags.filter(f => f.code === "FILL_NOT_APPLIED").length;
    const label = notApplied ? "! per-leg prices" : `per-leg prices${b.typedCount ? ` (${b.typedCount} typed)` : ""}`;
    // every leg typed: the mode prices nothing, so it reads as secondary
    const allTyped = !b.na && b.typedCount === b.legs.length;
    const mode = allTyped ? `<span class="pdim" title="Every leg has your typed price; mid / natural applies to legs without one">${fillCell(side)}</span>` : fillCell(side);
    return mode + ` <button type="button" class="xbtn pfb${notApplied ? " w" : ""}" data-act="fills" data-side="${side}" aria-expanded="${open}" title="Type the price of each leg you got (the head's credit splits one net price by mid)">${label} ${open ? "▾" : "▸"}</button>`;
  };
  // the typed-fill editor: one input per leg (empty = the fill mode), and one net price split over the sold legs by mid
  function fillsEditor(side) {
    const b = bOf(side);
    if (b.na) { return ""; }
    const rows = b.legs.map(l => {
      const modePx = b.fill === "nat" ? (l.qty < 0 ? l.bid : l.ask) : l.mid;
      const nat = l.qty < 0 ? `bid ${pxOf(l.bid)}` : `ask ${pxOf(l.ask)}`;
      return `<span class="pfl"><span class="pfk">${fK(l.K)}${l.cp} ${legWord(l)}</span><span class="pfq">mid ${pxOf(l.mid)} · ${nat}</span>` +
        `<input type="number" step="0.01" min="0" data-act="fillpx" data-side="${side}" data-slot="${l.key}" placeholder="${pxOf(modePx)}" aria-label="${side} ${att(FILL_SLOT_NAME[l.key])} fill price per share">` +
        `<button type="button" class="d9i" data-act="fillclr" data-side="${side}" data-slot="${l.key}" title="Back to ${b.fill === "nat" ? "natural" : "mid"}"${l.typed ? "" : " hidden"}>×</button></span>`;
    }).join("");
    const stale = b.flags.filter(f => f.code === "FILL_NOT_APPLIED").map(f => `<span class="pfw">! ${esc(f.text)}</span>`).join("");
    return `<span class="pfx">${rows}<span class="pfl"><span class="pfk">net</span><span class="pfq" title="split over the sold legs in proportion to their mids">${b.cr < 0 ? "debit" : "credit"} / share</span>` +
      `<input type="number" step="0.01" min="0" data-act="fillnet" data-side="${side}" placeholder="${pxOf(Math.abs(b.cr))}" aria-label="${side} net fill per share"></span>${stale}` +
      `<span class="pfr">the same legs: mid ${usd(b.crMid * 100)} · natural ${usd(b.crNat * 100)} a contract</span>` +
      `<span class="cap">Per share, as on the order ticket ($ per contract = ×100). A typed price belongs to its contract: if the strike or expiry changes, it stops applying and says so.</span></span>`;
  }
  function updFillsEditor(el, side) {
    const b = bOf(side);
    if (b.na) { return; }
    for (const input of el.querySelectorAll('[data-act="fillpx"]')) {
      if (document.activeElement === input) { continue; }
      const leg = legOf(b, input.dataset.slot);
      input.value = leg && leg.typed ? leg.fillPx.toFixed(2) : "";
    }
  }
  // the legs, always visible: each leg, its fill (✎ = typed) and its $ per contract; the contract's quote and IV are
  // market facts (Market facts, Contracts in use)
  function legsList(side) {
    const b = bOf(side);
    if (b.na) { return ""; }
    return b.legs.map(l => `<span class="plg${l.typed ? " t" : ""}"><span class="plk">${fK(l.K)}${l.cp}</span><span class="plw">${legWord(l)} ${pxOf(l.fillPx)}${l.typed ? " ✎" : ""}</span><span class="plp">${signedUsd(l.perContract)}</span></span>`).join("");
  }
  // the box's components in order; keys decide when the box is rebuilt (sliders keep their input across renders)
  function boxComps(side) {
    const out = [], P = posOf(side), b = bOf(side), k = side + ":";
    const row = (aspect, label, control) => out.push({ key: `${k}r:${aspect}`, cls: "prow", row: aspect, inner: () => rowLabel(side, aspect, label) + `<span class="pctl">${control()}</span>` });
    out.push({ key: `${k}head`, cls: "phead", inner: () => boxHead(side) });
    row("inst", ROWS.inst, () => instCell(side));
    row("exp", ROWS.exp + (side === "B" ? mapBtn() : ""), () => expCell(side));
    row("structure", ROWS.structure, () => structCell(side));
    row("legs", `${ROWS.legs}<button type="button" class="info" data-act="legsinfo" title="Together or detached; make symmetric">i</button>`, () => legsCell(side));
    row("placement", ROWS.placement, () => basisCell(side));
    if (!b.na) {
      // A's sliders mark where B's chain ends while B follows A's strikes on the same structure
      const followsA = side === "A" && C.comparison.links.placement && !C.B.na && C.Bp.structure === P.structure;
      placeSliders(side, P, b, out, followsA ? { bE: C.B.E } : {});
    }
    for (const [aspect, s] of [["wingCall", "call"], ["wingPut", "put"]]) {
      row(aspect, ROWS[aspect], () => wingCell(side, s));
      if (P.wings[s].on && !b.na) { wingSlider(side, s, P, b, P.wings[s].basis || P.basis, out); }
    }
    row("fill", ROWS.fill, () => fillCellBox(side));
    if (ui.fills[side]) { out.push({ key: `${k}fills`, cls: "pfull", row: "fill", inner: () => fillsEditor(side), upd: el => updFillsEditor(el, side) }); }
    out.push({ key: `${k}legsList`, cls: "plegs", inner: () => legsList(side) });
    return out;
  }
  // the net typed price split over the sold legs in proportion to their mids; bought legs keep their current fill
  /** @param {{ side: string, net: number }} input */
  function setNetFill({ side, net }) {
    const b = bOf(side);
    if (b.na || !Number.isFinite(net) || net < 0) { return; }
    const sold = b.legs.filter(l => l.qty < 0), bought = b.legs.filter(l => l.qty > 0);
    const soldMid = sold.reduce((t, l) => t + l.mid, 0), boughtPx = bought.reduce((t, l) => t + l.fillPx, 0);
    if (!(soldMid > 0)) { return; }
    const target = net + boughtPx;
    let left = target;
    sold.forEach((l, i) => {
      const isLast = i === sold.length - 1;
      const px = isLast ? Math.max(0, +left.toFixed(4)) : Math.max(0, +(l.mid * target / soldMid).toFixed(2));
      left -= px;
      setSide({ side, path: `fills.${l.key}`, value: { tk: b.tk, exp: b.exp, K: l.K, cp: l.cp, px } });
    });
  }

  // ---------------------------------------------------------- Pair sizing
  function syncSizing() {
    for (const sync of SIZING_SYNCS) { sync(C.state); }
    const sz = C.comparison.sizing, rn = r => (CTX.SIZES.find(s => s[0] === r) || ["", r])[1].toLowerCase();
    q("#d9-rhc").hidden = sz.rule !== "custom";
    // the custom size is typed in contracts (B contracts per A contract); the state keeps h = k · S_B / S_A, inside
    // CTX.H_RANGE, so the box's bounds are that range in contracts for this pair
    const k = C.k, nm = I => I ? I.name || I.id : "", hc = q("#d9-hc"), kBounds = sizeBounds();
    if (kBounds) { hc.min = kBounds[0].toFixed(2); hc.max = kBounds[1].toFixed(2); }
    if (document.activeElement !== hc) hc.value = Number.isFinite(k) ? k.toFixed(2) : String(+(+sz.h).toFixed(3));
    q("#d9-sizesv").textContent = `${sz.rule === "auto" ? "auto: " : ""}${C.ruleWords}`; // the rule only: the dock defines, the size sentence below states the result
    q("#d9-oh").innerHTML = (sz.rule === "auto" ? `Auto uses equal notional when A and B are the same instrument at the same spot and IV, equal vega otherwise (${INST.list().map(x => `${esc(x.name || x.id)} ${x.lev}×`).join(", ")} leveraged). ` : "") +
      `${esc(C.sizeStatement().replace(/^./, ch => ch.toUpperCase()))}.` + (C.hNote ? `<br><span class="badge">${esc(C.hNote)}</span>` : "");
  }
  // the custom size's bounds in contracts (B per A) for this pair, from the notional range; null while A or B is n/a
  function sizeBounds() {
    if (!(Number.isFinite(C.k) && C.k > 0 && C.h > 0)) return null;
    const perH = C.k / C.h;
    // two decimals, rounded inward, so the bounds the box and the notice print are sizes the range allows
    return [Math.ceil(CTX.H_RANGE[0] * perH * 100) / 100, Math.floor(CTX.H_RANGE[1] * perH * 100) / 100];
  }
  function setCustomSize(/** @type {HTMLInputElement} */ hc) {
    const v = parseFloat(hc.value), b = sizeBounds();
    if (!(Number.isFinite(v) && v > 0) || !b) { askFrame(); return; }
    const kv = clamp(v, b[0], b[1]);
    if (kv !== v) page.bus.emit(createNoticeEnvelope({ text: `B's size is held between ${b[0].toFixed(2)} and ${b[1].toFixed(2)} ${C.instB.name || C.instB.id} contracts per ${C.instA.name || C.instA.id} contract for this pair; set to ${kv.toFixed(2)}` }));
    hc.value = kv.toFixed(2);
    run({ type: Command.SetSizing, patch: { h: kv * C.h / C.k } });
  }

  // ---------------------------------------------------------- events
  function onClick(ev) {
    const t = ev.target.closest("[data-act]"); if (!t || t.disabled) return;
    const side = t.dataset.side, act = t.dataset.act;
    if (act === "set") {
      const v = t.dataset.v, val = v === "true" ? true : v === "false" ? false : v; if (t.classList.contains("on")) return;
      // B's legs detached while B's strikes follow A could not move: the gesture also sets B's strikes on their own
      if (side === "B" && t.dataset.path === "legs" && val === "detached" && C.comparison.links.placement) { run({ type: Command.Detach, side: "B" }); return; }
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
    else if (act === "link") { const a = t.dataset.aspect; run({ type: C.comparison.links[a] ? Command.Unlink : Command.Link, aspect: a }); }
    else if (act === "detach") run({ type: Command.Detach, side });
    else if (act === "fills") { ui.fills[side] = !ui.fills[side]; askFrame(); }
    else if (act === "fillclr") { setSide({ side, path: `fills.${t.dataset.slot}`, value: null }); }
    else if (act === "fillmatch") { setPref({ fillMatch: t.dataset.v }); }
    else if (act === "fillreset") { if (C.prefs.fillMatch === otherSide(side)) { setPref({ fillMatch: "off" }); } for (const l of bOf(side).legs.filter(x => x.typed)) { setSide({ side, path: `fills.${l.key}`, value: null }); } }
    else if (act === "relinkall") { run({ type: Command.RelinkAll }); }
    else if (act === "copyorder") { const b = bOf(side); if (!b.na) { copyText({ text: describeOrderTicket(b) }); } }
    else if (act === "atm") setSide({ side, path: "values.center", value: "atm" });
    else if (act === "expmap") {
      const r = t.getBoundingClientRect(), m = C.comparison.expMap;
      openPopAt(`<span class="h">If B's instrument lacks A's expiry</span><span class="s">B follows A's date when it lists it</span>` +
        `<button type="button" data-pop="expmap" data-v="nearest"${m === "nearest" ? " disabled" : ""}>Use the nearest date (by days)${m === "nearest" ? " ✓" : ""}</button>` +
        `<button type="button" data-pop="expmap" data-v="same"${m === "same" ? " disabled" : ""}>Mark B n/a${m === "same" ? " ✓" : ""}</button>`, r.left, r.bottom, onPop);
    } else if (act === "legsinfo") {
      const r = t.getBoundingClientRect(), btn = side2 => { const P = posOf(side2), b = bOf(side2); if (P.structure !== "strangle" || b.na) return ""; const m = (+P.values.put + +P.values.call) / 2; return `<button type="button" data-pop="sym" data-side="${side2}"${Math.abs(P.values.put - P.values.call) < 1e-9 ? " disabled" : ""}>Make ${side2} symmetric: put = call = ${fV(m, P.basis)}${side2 === "B" && C.comparison.links.placement ? " (sets B's strikes on its own)" : ""}</button>`; };
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
    else if (act === "fillpx") {
      const b = bOf(side), leg = legOf(b, t.dataset.slot), px = parseFloat(t.value);
      if (!leg) { return; }
      const value = Number.isFinite(px) && px >= 0 ? { tk: b.tk, exp: b.exp, K: leg.K, cp: leg.cp, px } : null;
      setSide({ side, path: `fills.${t.dataset.slot}`, value });
    }
    else if (act === "fillnet") {
      // typing on a matched side unlinks it: the typed price wins
      if (C.prefs.fillMatch === otherSide(side)) { setPref({ fillMatch: "off" }); }
      setNetFill({ side, net: parseFloat(t.value) });
      if (t.dataset.keep) { t.blur(); } else { t.value = ""; }
    }
  }
  function onInput(ev) {
    const t = ev.target;
    if (!t.dataset || !t.dataset.sl) return;
    const s = SL[t.dataset.sl]; if (!s) return;
    s.input(stepped(+t.value, s));
  }


  // ---------------------------------------------------------- arrow keys step one listed strike
  // strikes are chunked, so a strike is the natural step: ←/↓ and →/↑ on a placement or wing slider move to the next
  // listed strike whose value lies that way (on the slider's own basis), inside the slider's ends
  const STEP_KEYS = Object.freeze({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 });
  /** @param {{ spec: any, direction: number }} input -> the value at the next strike that way, or NaN */
  function findNextStrikeValue({ spec, direction }) {
    const step = spec.step, strikes = step && step.E ? step.E.strikes : null;
    if (!strikes || !strikes.length) { return NaN; }
    const valueOf = K => RULE.valueAt(step.E, K, step.role, spec.basis, step.Kshort);
    // from the strike the leg sits on now (the slider's target may lie between strikes)
    const atStrike = valueOf(step.K), current = Number.isFinite(atStrike) ? atStrike : spec.value, tolerance = 1e-9 * Math.max(1, Math.abs(current));
    const candidates = strikes.map(K => valueOf(K)).filter(v => Number.isFinite(v) && v >= spec.lo - tolerance && v <= spec.hi + tolerance);
    const ahead = candidates.filter(v => direction > 0 ? v > current + tolerance : v < current - tolerance);
    if (!ahead.length) { return NaN; }
    return direction > 0 ? Math.min(...ahead) : Math.max(...ahead);
  }
  function onKeyDown(ev) {
    const t = ev.target, direction = STEP_KEYS[ev.key];
    if (!direction || !t.dataset || !t.dataset.sl) { return; }
    const spec = SL[t.dataset.sl];
    if (!spec || !spec.step) { return; }
    const next = findNextStrikeValue({ spec, direction });
    ev.preventDefault();
    if (Number.isFinite(next)) { spec.input(next); }
  }

  // ---------------------------------------------------------- init, render, reveal
  function init() {
    const host = q("#d9t");
    host.innerHTML = `<section class="pbox a" id="d9A" aria-label="Position A"></section><section class="pbox b" id="d9B" aria-label="Position B"></section>`;
    roots.A = q("#d9A"); roots.B = q("#d9B");
    for (const el of [roots.A, roots.B]) {
      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);
      el.addEventListener("input", onInput);
      el.addEventListener("keydown", onKeyDown);
    }
    q("#dockBtn").addEventListener("click", () => setPref({ dock: false }));
    q("#dockOpen").addEventListener("click", () => setPref({ dock: true }));
    bindSelect({ input: "#d9-size", options: CTX.SIZES, read: state => state.comparison.sizing.rule, command: v => ({ type: Command.SetSizing, patch: { rule: v } }), syncList: SIZING_SYNCS });
    const hc = /** @type {HTMLInputElement} */ (q("#d9-hc")); hc.addEventListener("change", () => setCustomSize(hc));
  }
  // one box: rebuilt when its component keys change; otherwise each component is refreshed in place, except that a
  // slider keeps its input element (a drag must survive the render) and a component holding the focused input or
  // select is only updated, never redrawn
  function renderBox(side) {
    const root = roots[side], list = boxComps(side), key = list.map(x => x.key).join("|");
    if (key !== lastKeys[side]) {
      root.innerHTML = list.map(x => `<span class="${x.cls}" data-ck="${att(x.key)}"${x.row ? ` data-row="${x.row}"` : ""}></span>`).join("");
      lastKeys[side] = key;
    }
    const els = root.children;
    list.forEach((x, i) => {
      const el = els[i];
      if (!el) { return; }
      if (SL[x.key]) { if (!el.querySelector("input")) { el.innerHTML = x.inner(); } x.upd(el); return; }
      const active = document.activeElement;
      const holdsFocus = !!active && el.contains(active) && (active.tagName === "INPUT" || active.tagName === "SELECT");
      if (holdsFocus) { if (x.upd) { x.upd(el); } return; }
      el.innerHTML = x.inner();
      if (x.upd) { x.upd(el); }
    });
  }
  function render(c) {
    C = c;
    document.body.classList.toggle("dock-off", !C.prefs.dock);
    if (!C.prefs.dock) { return; }
    SL = {};
    renderBox("A"); renderBox("B");
    applyFillMatch();
    syncSizing();
  }
  // open the dock and bring one row of one box into view (from a summary pill)
  function reveal(row, side) {
    const box = side === "B" ? "B" : "A";
    if (row === "fill") { ui.fills[box] = true; }
    if (C && !C.prefs.dock) { setPref({ dock: true }); } else { askFrame(); }
    const go = () => {
      const els = roots[box].querySelectorAll(`[data-row="${row}"]`);
      if (!els.length) { return; }
      els[0].scrollIntoView({ block: "center", behavior: "smooth" });
      els.forEach(e => { e.classList.add("d9fl"); setTimeout(() => e.classList.remove("d9fl"), 1400); });
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
  }
  // the head's credit field, from a summary card's net credit
  function focusCredit(side) {
    if (C && !C.prefs.dock) { setPref({ dock: true }); }
    requestAnimationFrame(() => { const input = /** @type {HTMLInputElement} */ (roots[side === "B" ? "B" : "A"].querySelector(".pcin")); if (input) { input.scrollIntoView({ block: "center" }); input.focus(); input.select(); } });
  }
  return { init, render, reveal, updSlider, focusCredit, ui };
})();
