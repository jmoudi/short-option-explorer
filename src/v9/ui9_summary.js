// ============================================================ ui9_summary: the fixed comparison summary (Compare tab)
// Two cards (A | vs ⇄ | B), each three lines: identity (21px), per-leg prices (14px, net 15px), placement (12px);
// then one row of difference pills / notices and the move range. Reads only C (CTX.ctx9) and getS9();
// changes state only through STATE (cmpDo / cmpChange below), then cmpRefresh().
// Top-level names: SUM9, cmpRefresh, cmpDo, cmpChange, cmpEvents.

// one refresh entry point for every UI change on the Compare tab (ui_common8's RAF-batched refresh)
function cmpRefresh() { refresh(); }
// run one CMP mutator (or "swap") on S9.cmp through STATE, toast its events, refresh
function cmpDo(op, ...args) {
  let r;
  try { r = op === "swap" ? STATE.swap(getS9()) : STATE.cmpOp(getS9(), op, ...args); }
  catch (e) { console.error("cmpDo " + op, e); toast("That change could not be applied"); return null; }
  setS9(r.S9); cmpEvents(r.events); cmpRefresh(); return r;
}
// edit a copy of S9 (scen, view, cmp.sizing, cmp.expMap); sanitizers and the normaliser run in STATE.change
function cmpChange(fn, extra) {
  const r = STATE.change(getS9(), fn);
  setS9(r.S9); cmpEvents((extra || []).concat(r.events)); cmpRefresh(); return r;
}
// every cmp9 / normaliser event becomes one 4-second toast with its actions
function cmpEvents(events) { SUM9.toastEvents(events); }

const SUM9 = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const q = s => document.querySelector(s);
  // signs follow the printed text: a value that rounds to zero prints unsigned ("0.00σ", never "−0.00σ")
  const sgn = (v, t) => v < 0 && (t == null || +t !== 0) ? MINUS : "";
  const sgs = (v, t) => +t === 0 ? "" : v < 0 ? MINUS : "+";
  const num = (v, d, f) => { const t = Math.abs(v).toFixed(d); return f(v, t) + t; };
  // $ per contract: whole dollars from $20, one decimal below unless whole
  const usd = x => { const a = Math.abs(x); return "$" + (a >= 20 || Math.abs(a - Math.round(a)) < 0.05 ? Math.round(a).toLocaleString("en-US") : a.toFixed(1)); };
  const fD = v => Number.isFinite(v) ? num(v, 0, sgn) + "Δ" : "–";
  const fM = v => Number.isFinite(v) ? num(v, 1, sgn) + "%" : "–";
  const fMs = v => Number.isFinite(v) ? num(v, 1, sgs) + "%" : "–";
  const fSg = v => Number.isFinite(v) ? num(v, 2, sgn) + "σ" : "–";
  const fSgs = v => Number.isFinite(v) ? num(v, 2, sgs) + "σ" : "–";
  const fT = (v, basis) => { const t = String(+Math.abs(+v).toFixed(basis === "sigma" ? 2 : 1)); return sgn(+v, t) + t; };
  const tipEsc = s => esc(s).replace(/'/g, "&#39;");
  const LEGN = { put: "put", call: "call", center: "strike", wingCall: "call wing", wingPut: "put wing" };
  const FSHORT = {
    CHAIN_END: f => `${LEGN[f.leg] || "leg"} at chain end`, GAP: () => "gap in strikes", FAR: () => "coarse strikes",
    WIDENED: f => `${f.moved || "leg"} widened`, ONE_STRIKE: () => "one usable strike", WING_INSIDE: () => "wing at its short",
    CONVERT_RESET: () => "reset on basis switch", EXP_MAPPED: f => f.from && f.to ? `no ${fmtE(f.from)}: ${fmtE(f.to)}` : "expiry mapped",
    EXP_NA: () => "expiry n/a", MODEL_QUOTES: () => "model quotes", NO_IV_PIN: () => "mid has no IV",
    EARLY_ASSIGN: () => "early-assignment risk", BELOW_INTRINSIC: () => "mid below intrinsic"
  };

  // ---------------------------------------------------------- the payoff-shape glyph (28×16, key colour)
  // straddle: a peak; strangle: a flat top; guts: a higher, narrower flat top; a wing clips its tail flat
  function glyph(kind, wc, wp, col) {
    const top = kind === "straddle" ? "L14 2.5" : kind === "guts" ? "L10 1.5 L18 1.5" : "L8.5 5 L19.5 5";
    const d = (wp ? "M1 11 L4.5 11 " : "M1 14.5 ") + top + (wc ? " L23.5 11 L27 11" : " L27 14.5");
    return `<svg class="s9g" viewBox="0 0 28 16" aria-hidden="true"><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  // ---------------------------------------------------------- difference marks per side, from C.diff
  // dn = an asked difference (ink underline), dw = an unasked one (amber underline, named side only)
  function marks(diff, side) {
    const m = {};
    const put = (k, w) => { m[k] = w || m[k] === "dw" ? "dw" : "dn"; };
    for (const it of diff.items) {
      const amber = !it.asked;
      if (amber && it.side !== side) continue;
      let k = null;
      if (it.code === "UNLINKED") k = { exp: "exp", structure: "struct", wingCall: "wing", wingPut: "wing", fill: "fill" }[it.aspect] || null;
      else if (it.code === "KIND" || it.code === "WIDENED") k = "struct";
      else if (it.code === "EXP_MAPPED") k = "exp";
      else if (it.code === "WING_WIDTH") k = "wing";
      else if (it.code === "WING_NA") k = it.aspect === "wingCall" ? "naC" : "naP";
      else if (it.code === "DEBIT") k = "net";
      if (k) put(k, amber);
    }
    return m;
  }
  // B contracts per A contract: h is B's notional as a multiple of A's, so k = h · S_A / S_B (= h on one instrument)
  const contractsK = C => C.h * C.A.S / C.B.S;
  const tok = (cls, html, title) => `<span class="s9tok ${cls || ""}"${title ? ` title="${tipEsc(title)}"` : ""}>${html}</span>`;

  // ---------------------------------------------------------- the three lines of one card
  function line1(b, side, m) {
    const I = b.inst, tk = esc(I ? I.name || I.id : b.tk), col = side === "A" ? "var(--a)" : "var(--b)";
    let ov = "";
    if (I && I.overridden) {
      const parts = [];
      if (Math.abs(I.spot - I.spotListed) > 1e-9 * I.spotListed) parts.push(fPx2(I.spot));
      if (I.ivShift) parts.push(`IV ${I.ivShift > 0 ? "+" : MINUS}${+Math.abs(I.ivShift).toFixed(2)}`);
      ov = `<span class="s9ov" title="${tipEsc(`Override: spot ${fPx2(I.spot)} (listed ${fPx2(I.spotListed)})${I.ivShift ? `, IV ${I.ivShift > 0 ? "+" : MINUS}${Math.abs(I.ivShift)} pts (re-prices entry)` : ""}`)}">✎<span class="s9ovd"> ${parts.join(" · ")}</span></span>`;
    }
    const sep = `<span class="s9sep">·</span>`, exp = b.exp ? fmtE(b.exp) : "–";
    if (b.na) return `${tk}${ov}${sep}${tok(m.exp, esc(exp))}${sep}<span class="s9na">n/a</span>`;
    const wc = b.legs.some(l => l.key === "wingCall"), wp = b.legs.some(l => l.key === "wingPut");
    const st = esc(b.label.struct).replace(/^short /, `<span class="s9w0">short </span>`);
    const wings = b.label.wings ? " " + tok(m.wing, esc(b.label.wings).replace(/ (wings?)$/, `<span class="s9ww"> $1</span>`)) : "";
    return `${tk}${ov}${sep}${tok(m.exp, esc(exp))}${sep}${tok(m.struct, glyph(b.kind, wc, wp, col) + st)}${wings}`;
  }
  function line2(b, side, m, C) {
    if (b.na) return `<span class="s9leg na">n/a: ${esc(b.naReason || "no usable strikes")}</span>`;
    const naF = b.flags.filter(f => f.code === "WING_NA");
    const naTok = f => `<span class="s9leg na"><span class="s9tok ${f.leg === "wingCall" ? m.naC || "dw" : m.naP || "dw"}" title="${tipEsc(f.text)}">${f.leg === "wingCall" ? "call" : "put"} wing n/a</span></span>`;
    let h = naF.filter(f => f.leg === "wingPut").map(naTok).join("");
    for (const l of b.legs) {
      const w = l.qty > 0, px = l.perContract;
      const tip = `${w ? "Long" : "Short"} ${fK(l.K)}${l.cp} ${w ? "bought" : "sold"} at ${l.fillPx.toFixed(2)} (${b.fill === "nat" ? (w ? "ask" : "bid") : "mid"}): ${px < 0 ? "debit" : "credit"} ${usd(px)} per contract`;
      h += `<span class="s9leg${w ? " w" : ""}" title="${tipEsc(tip)}"><span class="k">${fK(l.K)}${l.cp}${w ? `<span class="s9wl"> wing</span>` : ""}</span>${px < 0 ? MINUS : "+"}${usd(px)}</span>`;
    }
    h += naF.filter(f => f.leg === "wingCall").map(naTok).join("");
    const n = b.net, deb = n.isDebit;
    const netTxt = `<span class="s9nw">net </span>${deb ? "debit" : "credit"} ${usd(n.perContract)}`;
    h += `<span class="s9dv"></span>${tok("s9net" + (deb ? " debit" : "") + " " + (m.net || ""), netTxt)}`;
    const fillTxt = b.fill === "nat" ? `<span class="s9fL">natural</span><span class="s9fS">nat</span>` : "mid";
    h += `<span class="s9t"><span class="s9pct" title="net as % of spot"> · ${Math.abs(n.pctOfSpot).toFixed(1)}%</span><span class="s9fi"> · ${tok(m.fill, fillTxt, b.fill === "nat" ? "natural fill: sell at the bid, buy at the ask" : "filled at mid")}</span>`;
    // B's line 2 sits beside $ per contract, so its multiplier is B contracts per A contract (k = h · S_A / S_B);
    // h (B's share of A's notional) is what the charts use, and it stays in the ⓘ
    if (side === "B" && !C.A.na) {
      const k = contractsK(C), rn = (CTX.SIZES.find(s => s[0] === C.rule) || ["", C.rule])[1].toLowerCase();
      const auto = C.cmp.sizing.rule === "auto" ? "auto: " : "";
      const nm = I => I ? I.name || I.id : "", twin = nm(C.instA) === nm(C.instB);
      h += `<span class="s9h"> · ×${k.toFixed(2)}</span><span class="info" tabindex="0" data-tip="${tipEsc(`B contracts per A contract · ${auto}${rn} (${k.toFixed(2)} ${twin ? "B" : nm(C.instB)} contract${Math.abs(k - 1) < 0.005 ? "" : "s"} per ${twin ? "A" : nm(C.instA)} contract); the charts show B at h = ${C.h.toFixed(3)} × A's notional.${C.hNote ? " " + C.hNote + "." : ""} Change it under Pair sizing.`)}">i</span>`;
    }
    if (side === "A") {
      const k = !C.B.na ? ` before the ×${contractsK(C).toFixed(2)} contract sizing` : "";
      h += `<span class="info" tabindex="0" data-tip="${tipEsc(`$ per contract (100 shares): + credit for a short leg, − debit for a long protective leg. B's figures are per B contract,${k}.`)}">i</span>`;
    }
    return h + `</span>`;
  }
  // line 3 comes in levels for fitPair(), the same nine on both cards so they can shorten together: 0 full; 1 flags
  // folded into one "N warnings, M notes" token; 2 the "to <expiry>" σ suffix without its year; 3 the forward note
  // without spot; 4 no days; 5–7 one, two, three secondary readings fewer; 8 "N flags"
  const L3N = 9;
  function line3(b, P, C) {
    const fl = flagsHtml(b, b.na), flags = b.flags.filter(f => b.na || f.code !== "WING_NA");
    const nw = flags.filter(f => f.severity === "warn").length, nn = flags.length - nw;
    const allTip = tipEsc(flags.map(f => (f.severity === "warn" ? "! " : "") + f.text).join(" · "));
    const fold = flags.length ? `<span class="s9fl${nw ? " s9wn" : ""}" data-tip="${allTip}">${nw ? `! ${nw} warning${nw > 1 ? "s" : ""}` : ""}${nw && nn ? ", " : ""}${nn ? `${nn} note${nn > 1 ? "s" : ""}` : ""}</span>` : "";
    if (b.na) { const full = fl.join(" · "); return Array.from({ length: L3N }, (_, i) => i ? fold : full); }
    const fold2 = flags.length > 1 ? `<span class="s9fl${nw ? " s9wn" : ""}" data-tip="${allTip}">${nw ? "! " : ""}${flags.length} flags</span>` : fold;
    const bas = P.basis, sfxL = C.sigOwnSuffix(b), sfxS = sfxL.replace(/ ’\d\d$/, "");
    const lp = b.legs.find(l => l.role === "short put"), lc = b.legs.find(l => l.role === "short call");
    // head: the active basis (always kept); extra: the other readings, dropped from the end when space runs out
    const parts = sfx => {
      const head = [], extra = [];
      if (P.structure === "straddle" && b.center) {
        const c = b.center, ach = c.achieved, atm = c.target === "atm";
        head.push(atm ? "ATM" : `center ${fT(c.target, bas)}${RULE.UNIT[bas]} → ${bas === "delta" ? fD(ach.delta) : bas === "money" ? fMs(ach.money) + " vs fwd" : fSgs(ach.sigma) + sfx}`);
        if (atm || bas !== "money") extra.push(`strike ${fMs(ach.money)} vs fwd`);
        if (atm || bas !== "sigma") extra.push(fSgs(ach.sigma) + sfx);
        if (lp && lc) extra.push(`put ${fD(lp.achieved.delta)} / call ${fD(lc.achieved.delta)}`);
      } else if (lp && lc) {
        const a = (l, k) => k === "delta" ? fD(l.achieved.delta) : k === "money" ? fM(l.achieved.money) : fSg(l.achieved.sigma);
        const pair = k => `${a(lp, k)} / ${a(lc, k)}${k === "money" ? " OTM" : k === "sigma" ? sfx : ""}`;
        const tg = `${fT(P.values.put, bas)} / ${fT(P.values.call, bas)}`;
        head.push(bas === "delta" ? `Δ ${tg} → ${pair("delta")}` : bas === "money" ? `${tg}% OTM → ${a(lp, "money")} / ${a(lc, "money")}` : `${tg}σ → ${pair("sigma")}`);
        for (const k of ["delta", "money", "sigma"]) if (k !== bas) extra.push(pair(k));
      }
      return { head, extra };
    };
    const away = Math.abs(b.F / b.S - 1) > 0.01;
    const fwL = away ? ` · fwd ${fPx2(b.F)} (spot ${fPx2(b.S)})` : "", fwS = away ? ` · <span title="spot ${fPx2(b.S)}">fwd ${fPx2(b.F)}</span>` : "";
    const tail = x => x ? " · " + x : "";
    // o = {sfx, fw, dte, drop (secondary readings dropped from the end), fl ("all" | "fold" | "fold2")}
    const mk = o => {
      const { head, extra } = parts(o.sfx), items = head.concat(extra.slice(0, Math.max(0, extra.length - o.drop)));
      if (o.dte) items.push(`${b.dte} d`);
      const base = items.map(esc).join(" · ") + o.fw;
      return o.fl === "all" ? base + fl.map(x => " · " + x).join("") : base + tail(o.fl === "fold" ? fold : fold2);
    };
    const levels = [], o = { sfx: sfxL, fw: fwL, dte: true, drop: 0, fl: "all" };
    const push = ch => { Object.assign(o, ch); levels.push(mk(o)); };
    push({}); push({ fl: "fold" }); push({ sfx: sfxS }); push({ fw: fwS }); push({ dte: false });
    push({ drop: 1 }); push({ drop: 2 }); push({ drop: 3 }); push({ fl: "fold2" });
    return levels;
  }
  function flagsHtml(b, all) {
    return b.flags.filter(f => all || f.code !== "WING_NA").map(f => {
      const w = f.severity === "warn", s = (FSHORT[f.code] || (() => f.code.toLowerCase()))(f);
      return `<span class="s9fl${w ? " s9wn" : ""}" data-tip="${tipEsc(f.text)}">${w ? "! " : ""}${esc(s)}</span>`;
    });
  }

  // never wrap, never clip. Line 1: 20px, then drop "short", then the word "wings", then tighten the separators and
  // shorten the override mark to ✎ (details in its title); an ellipsis only as a last resort.
  // Line 2: f1 tighten the gaps, f2 drop the word "wing", f3 the % of spot, f4 the word "net", f5 "natural" → "nat",
  // f6 tighter gaps, f7 the ×k figure (k stays in the ⓘ), f8 the fill token. Line 3: the levels of line3(), then
  // ellipsis (full text in the title)
  // Each card first finds its own stages: a stage is applied only while the line still overflows, then each earlier
  // stage is given back when the line still fits without it (f20 is never given back). Both cards then take the union
  // of the two sets, so identical wording reads the same on A and B (and line 1 has one font size); a stage of the
  // union is given back only when both cards still fit without it. Line 3 takes the larger of the two levels.
  const L1F = ["f20", "fa", "fw", "fx"], L2F = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
  // pure: the shared set. order = all stages in order, sets = each card's own set, fits(set) -> every card fits with
  // set applied, keep = stages never given back
  function commonStages(order, sets, fits, keep) {
    let U = order.filter(f => sets.some(s => s.includes(f)));
    for (const f of U.slice().reverse()) {
      if (keep && keep.includes(f)) continue;
      const t = U.filter(g => g !== f);
      if (fits(t)) U = t;
    }
    return U;
  }
  const over = e => e.scrollWidth > e.clientWidth + 0.5;
  const setStages = (el, order, on) => { el.classList.remove(...order); if (on.length) el.classList.add(...on); };
  function ownStages(el, order, keep) {
    setStages(el, order, []); const on = [];
    for (const f of order) if (over(el)) { el.classList.add(f); on.push(f); }
    for (const f of on.slice(0, -1).reverse()) if (!keep.includes(f)) { el.classList.remove(f); if (over(el)) el.classList.add(f); }
    return order.filter(f => el.classList.contains(f));
  }
  function fitPair(list) {
    const L = list.map(x => ({ l1: x.card.querySelector(".s9l1"), l2: x.card.querySelector(".s9l2"), l3: x.card.querySelector(".s9l3"), lv: x.l3 }));
    for (const x of L) { x.l1.classList.remove("cut"); x.l1.title = ""; }
    for (const [k, order, keep] of [["l1", L1F, ["f20"]], ["l2", L2F, []]]) {
      const own = L.map(x => ownStages(x[k], order, keep));
      const fits = set => { for (const x of L) setStages(x[k], order, set); return L.every(x => !over(x[k])); };
      const U = commonStages(order, own, fits, keep);
      for (const x of L) setStages(x[k], order, U);
    }
    for (const x of L) if (over(x.l1)) { x.l1.classList.add("cut"); x.l1.title = x.l1.textContent; }
    const at = (x, k) => { x.l3.innerHTML = x.lv[k]; while (over(x.l3) && k + 1 < x.lv.length) x.l3.innerHTML = x.lv[++k]; return k; };
    const lev = Math.max(...L.map(x => at(x, 0)));
    for (const x of L) { at(x, Math.min(lev, x.lv.length - 1)); x.l3.title = over(x.l3) ? x.l3.textContent : ""; }
  }

  // ---------------------------------------------------------- pills and notices (bottom row)
  function pillsHtml(C) {
    const d = C.diff, L = C.cmp.links, list = [];
    for (const it of d.items) {
      if (!it.asked) list.push({ cls: "w", text: it.text, row: it.dockRow, side: it.side });
      else if (d.identical) continue;   // §2.2: the "same trade" notice stands in place of the neutral pills ("↺ all" stays)
      else if (it.aspect === "placement" || it.aspect === "legs" || it.aspect === "override") list.push({ cls: it.relink ? "rl" : "", text: it.text, row: it.dockRow, side: it.side, relink: it.relink ? it.aspect : "" });
    }
    const notes = [];
    if (d.identical) notes.push("A and B are the same trade");
    else if (d.onlyInstrument) notes.push("same position, only the instrument differs");
    const any = Object.keys(L).some(a => a !== "inst" && !L[a]);
    return { list, notes, any };
  }
  const pillHtml = (p, i) => `<span class="s9pill ${p.cls}" data-pi="${i}" data-row="${esc(p.row || "")}" data-side="${esc(p.side || "")}" title="${tipEsc(p.text + (p.relink ? " · click to open in Positions, ↺ makes B follow A again" : " · click to open in Positions"))}">${esc(p.text)}${p.relink ? `<button type="button" class="s9rl" data-relink="${p.relink}" aria-label="B follows A again">↺</button>` : ""}</span>`;
  let PILLS = [];
  function renderPills(C) {
    const host = q("#s9pills"), { list, notes, any } = pillsHtml(C);
    PILLS = list;
    const tail = (any ? `<span class="s9pill all" data-all="1" title="Make B follow A in every aspect except the instrument">↺ all</span>` : "");
    const draw = n => notes.map(t => `<span class="s9note">${esc(t)}</span>`).join("") + list.slice(0, n).map(pillHtml).join("") +
      (n < list.length ? `<span class="s9pill" data-more="${n}">+${list.length - n} ▾</span>` : "") + tail;
    host.innerHTML = draw(list.length);
    let n = list.length;
    while (n > 0 && host.scrollWidth > host.clientWidth + 0.5) { n--; host.innerHTML = draw(n); }
  }

  // ---------------------------------------------------------- move range: σ | % | price, with a ▾ popover
  function setUnit(v) {
    const C = SUM9.C; if (!C || v === C.unit || (v === "pts" && !C.same)) return;
    const uo = C.axis(v).uOf("A"), cv = S => STATE.uRound(uo(S), v);
    const lo = Math.max(-cv(C.toSA(C.lo)), 0.05), hi = Math.max(cv(C.toSA(C.hi)), 0.05);
    const wlo = Math.max(-cv(C.toSA(C.wlo)), 0.05), whi = Math.max(cv(C.toSA(C.whi)), 0.05);
    const extra = [];
    cmpChange(s => {
      s.scen.unit = v; s.scen.rlo = lo; s.scen.rhi = hi; if (s.scen.wl === "own") { s.scen.wlo = wlo; s.scen.whi = whi; }
      if (s.scen.rlink && Math.abs(lo - hi) > 1e-9) { s.scen.rlink = false; extra.push({ type: "note", aspects: [], text: `Range converted to ${STATE.uLab(-lo, v)} to ${STATE.uLab(hi, v)}; symmetric is off because the converted range is not symmetric`, actions: [] }); }
    }, extra);
  }
  function setRange(which, inp) {
    const C = SUM9.C; let v = Math.abs(parseFloat(inp.value));
    if (!C || !Number.isFinite(v) || v <= 0) { cmpRefresh(); return; }
    v = Math.max(+v.toFixed(2), C.unit === "pct" ? 0.5 : 0.05);
    cmpChange(s => { s.scen[which] = v; if (s.scen.rlink) { const cap = STATE.rangeCaps(s.scen.unit, C.A.S)[0]; s.scen.rlo = s.scen.rhi = Math.min(v, cap); } });
  }
  const REG = [];   // this module's sync functions (run in render)
  function wireRange() {
    seg("#s9-unit", [["sig", "σ", "Multiples of each instrument's implied move over A's horizon"], ["pct", "%", "Simple % change"], ["pts", "price", "Price change in $ (one instrument only)"]], () => getS9().scen.unit, setUnit, REG);
    for (const [id, k] of [["#s9-rlo", "rlo"], ["#s9-rhi", "rhi"]]) { const i = q(id); i.addEventListener("change", () => setRange(k, i)); }
    bindChk("#s9-rlink", () => getS9().scen.rlink, v => {
      const C = SUM9.C; cmpChange(s => { s.scen.rlink = v; if (v) { const cap = STATE.rangeCaps(s.scen.unit, C.A.S)[0]; s.scen.rlo = s.scen.rhi = Math.min(Math.max(s.scen.rlo, s.scen.rhi), cap); } });
    }, REG);
    seg("#s9-units", [["pct", "% of A's notional"], ["usd", "$ per A contract"], ["cr", "× A's credit"]], () => getS9().view.units, v => cmpChange(s => { s.view.units = v; }), REG);
    seg("#s9-dist", [["rn", "Implied", "Risk-neutral distribution from the fitted smile"], ["hv", "HV30", "Lognormal at IBKR HV30"]], () => getS9().scen.dist, v => cmpChange(s => { s.scen.dist = v; }), REG);
    bindRange("#s9-hvk", "#s9-ohvk", () => getS9().scen.hvk, v => cmpChange(s => { s.scen.hvk = v; }), v => v.toFixed(2) + "×", REG);
  }
  function syncRange(C) {
    for (const f of REG) f();
    const sc = C.scen, step = C.uStep(C.unit), lo = q("#s9-rlo"), hi = q("#s9-rhi");
    lo.step = step; hi.step = step;
    if (document.activeElement !== lo) lo.value = +sc.rlo.toFixed(2);
    if (document.activeElement !== hi) hi.value = +sc.rhi.toFixed(2);
    const pb = q('#s9-unit [data-v="pts"]');
    pb.disabled = !C.same; pb.title = C.same ? "Price change in $" : "Price moves need one instrument: A and B trade at different prices";
    const nm = b => b.inst ? b.inst.name || b.inst.id : b.tk;
    const rng = (b, toS) => `${nm(b)} ${fPx2(toS(C.lo))}–${fPx2(toS(C.hi))}`;
    q("#s9-rngeq").textContent = "Prices in view: " + rng(C.A, C.toSA) + (C.same ? "" : " · " + rng(C.B, C.toSB));
    const sd = (b, I) => { const s = C.ax.sig(I); return `${nm(b)}: ATM ${fP(INST.atmAt(I, C.ax.T), 0)} × √(${Math.round(C.ax.T * 365)}/365) = ${s.toFixed(3)}, so +1σ = ${fS(Math.exp(s) - 1, 0)} and −1σ = ${fS(Math.exp(-s) - 1, 0)}`; };
    q("#s9-uinfo").textContent = C.unit === "sig"
      ? `σ = each instrument's ATM implied vol at A's horizon (${C.A.dte} days) × √(days/365), on log price${C.sameExp ? "" : " (B's vol interpolated to A's horizon; the chart axis reads “" + C.sigAxisLabel + "”)"}. ${sd(C.A, C.instA)}.${C.same ? "" : ` ${sd(C.B, C.instB)}. Both move the same number of their own σ.`} Strike placement by σ uses each position's own expiry instead.`
      : (C.unit === "pct" ? `Simple % change of the underlying.${C.same ? "" : " Both instruments move the same %."}` : `Change of ${nm(C.A)}'s price in $. Offered only when A and B are on one instrument.`) +
        (C.sameExp ? "" : ` The payoff's ±σ marks use each instrument's ${C.sigAxisLabel} (B's vol interpolated to A's horizon), not its own expiry.`);
    q("#s9-hvrow").hidden = sc.dist !== "hv";
    q("#s9-hvinfo").textContent = `IBKR HV30: ${INST.list().map(x => `${x.name || x.id} ${fP(INST.base(x.id).hv, 0)}`).join(", ")}. HV30 odds are a zero-drift lognormal at that vol.`;
  }

  // ---------------------------------------------------------- toasts with actions
  let toastEvs = [];
  function toastEvents(events) {
    const evs = (events || []).filter(e => e && e.text);
    if (!evs.length) return;
    const t = q("#toast"); toastEvs = evs;
    t.innerHTML = evs.map((e, i) => `<span class="t9e">${esc(e.text)}${(e.actions || []).map((a, j) => `<button type="button" class="t9a" data-e="${i}" data-a="${j}">${esc(a.label)}</button>`).join("")}</span>`).join("");
    t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4000);
  }
  function wireToast() {
    const t = q("#toast");
    t.addEventListener("click", ev => {
      const b = ev.target.closest(".t9a"); if (!b) return;
      const e = toastEvs[+b.dataset.e], a = e && e.actions[+b.dataset.a]; if (!a) return;
      t.hidden = true;
      const r = STATE.applyAction(getS9(), a); setS9(r.S9); cmpEvents(r.events); cmpRefresh();
    });
    t.addEventListener("pointerenter", () => clearTimeout(toastT));
    t.addEventListener("pointerleave", () => { clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2000); });
  }

  // ---------------------------------------------------------- wiring and rendering
  function onPills(ev) {
    const rl = ev.target.closest("[data-relink]");
    if (rl) { ev.stopPropagation(); cmpDo("link", rl.dataset.relink); return; }
    if (ev.target.closest("[data-all]")) { cmpDo("relinkAll"); return; }
    const mo = ev.target.closest("[data-more]");
    if (mo) {
      const n = +mo.dataset.more, r = mo.getBoundingClientRect();
      openPopAt(`<span class="h">More differences</span>` + PILLS.slice(n).map((p, i) => `<span style="display:block;margin-top:5px">${pillHtml(p, n + i)}</span>`).join(""), r.left, r.bottom, onPills);
      return;
    }
    const p = ev.target.closest("[data-pi]");
    if (p) { const pop = q("#pop"); if (pop && pop.contains(p)) pop.hidden = true; if (typeof DOCK9 !== "undefined") DOCK9.reveal(p.dataset.row, p.dataset.side); }
  }
  let ro = null;
  function init() {
    q("#s9swap").addEventListener("click", () => cmpDo("swap"));
    q("#s9pills").addEventListener("click", onPills);
    wireRange(); wireToast();
    const sum = q("#sum9"), setH = () => document.documentElement.style.setProperty("--sumh", Math.ceil(sum.getBoundingClientRect().height) + "px");
    if (window.ResizeObserver) { ro = new ResizeObserver(setH); ro.observe(sum); }
    setH();
  }
  function render(C) {
    SUM9.C = C;
    const cards = ["A", "B"].map(side => {
      const card = q(side === "A" ? "#s9A" : "#s9B"), b = side === "A" ? C.A : C.B, P = side === "A" ? C.Ap : C.Bp, m = marks(C.diff, side);
      card.querySelector(".s9l1").innerHTML = line1(b, side, m);
      card.querySelector(".s9l2").innerHTML = line2(b, side, m, C);
      card.setAttribute("aria-label", `${side}: ${b.label.full}`);
      return { card, l3: line3(b, P, C) };
    });
    fitPair(cards);
    renderPills(C);
    syncRange(C);
    if (C.labels && C.labels.title) document.title = C.labels.title;
  }
  return { init, render, glyph, marks, toastEvents, setUnit, commonStages, contractsK, L1F, L2F, C: null };
})();
