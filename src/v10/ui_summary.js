// ============================================================ ui9_summary: the fixed comparison summary (Compare tab)
// Two cards (A | vs ⇄ | B), each three lines: identity (21px), per-leg prices (14px, net 15px), placement with the
// ticker's period vol against the expiry's implied vol (12px); then one row of difference pills / notices and the move
// range. Reads only the render context C (CTX.ctx9) and the
// store; changes state only through commands. Also the page's toast: every notice on the bus shows here.
// Top-level name: SUM9.

const SUM9 = (() => {
  const SUMMARY_CONFIG = Object.freeze({
    // the axis ⓘ prints the period-vol odds beyond 1σ and beyond the recovery hit's kσ, else beyond this many σ
    tailSigmas: 2,
    // a line overflows when its text is wider than its content box by more than this (px): scrollWidth rounds to whole
    // pixels, so a line 0.06 px too wide read as fitting while Chromium still drew the ellipsis
    overflowTolerancePx: 0.01,
    // keys that press the card's period-vol reading (a role="button" span)
    pressKeys: Object.freeze(["Enter", " "])
  });
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
      const tip = `${w ? "Long" : "Short"} ${fK(l.K)}${l.cp} ${w ? "bought" : "sold"} at ${l.fillPx.toFixed(2)} (${l.typed ? "your typed fill" : b.fill === "nat" ? (w ? "ask" : "bid") : "mid"}): ${px < 0 ? "debit" : "credit"} ${usd(px)} per contract`;
      h += `<span class="s9leg${w ? " w" : ""}" title="${tipEsc(tip)}"><span class="k">${fK(l.K)}${l.cp}${w ? `<span class="s9wl"> wing</span>` : ""}</span>${px < 0 ? MINUS : "+"}${usd(px)}</span>`;
    }
    h += naF.filter(f => f.leg === "wingCall").map(naTok).join("");
    const n = b.net, deb = n.isDebit;
    const netTxt = `<span class="s9nw">net </span>${deb ? "debit" : "credit"} ${usd(n.perContract)}`;
    h += `<span class="s9dv"></span>${tok("s9net" + (deb ? " debit" : "") + " " + (m.net || ""), netTxt)}`;
    // what it collects, not how the fill was got (that is set and shown in the box's Fill row)
    h += `<span class="s9t">`;
    // B's line 2 sits beside $ per contract, so its multiplier is B contracts per A contract (k = h · S_A / S_B);
    // h (B's share of A's notional) is what the charts use, and it stays in the ⓘ
    if (side === "B" && !C.A.na) {
      const k = contractsK(C), rn = (CTX.SIZES.find(s => s[0] === C.rule) || ["", C.rule])[1].toLowerCase();
      const auto = C.comparison.sizing.rule === "auto" ? "auto: " : "";
      const nm = I => I ? I.name || I.id : "", twin = nm(C.instA) === nm(C.instB);
      h += `<span class="s9h"> · ×${k.toFixed(2)}</span><span class="info" tabindex="0" data-tip="${tipEsc(`B contracts per A contract · ${auto}${rn} (${k.toFixed(2)} ${twin ? "B" : nm(C.instB)} contract${Math.abs(k - 1) < 0.005 ? "" : "s"} per ${twin ? "A" : nm(C.instA)} contract); the charts show B at h = ${C.h.toFixed(3)} × A's notional.${C.hNote ? " " + C.hNote + "." : ""} Change it under Pair sizing.`)}">i</span>`;
    }
    if (side === "A") {
      const k = !C.B.na ? ` before the ×${contractsK(C).toFixed(2)} contract sizing` : "";
      h += `<span class="info" tabindex="0" data-tip="${tipEsc(`$ per contract (100 shares): + credit for a short leg, − debit for a long protective leg. B's figures are per B contract,${k}.`)}">i</span>`;
    }
    return h + `</span>`;
  }
  // line 3 comes in levels for fitPair(), the same ten on both cards so they can shorten together: 0 full; 1 flags
  // folded into one "N warnings, M notes" token; 2 the "to <expiry>" σ suffix without its calendar part; 3 the forward note
  // without spot; 4 the period-vol reading compact ("vs IV 124%"); 5–7 one, two, three secondary readings fewer; 8 no
  // days; 9 "N flags". The days (one short token, shown nowhere else on the summary) outlast the secondary readings
  const L3N = 10;
  /** @param {{ b: any, P: any, C: any, side: string }} input */
  function line3({ b, P, C, side }) {
    const fl = flagsHtml(b, b.na), flags = b.flags.filter(f => b.na || f.code !== "WING_NA");
    const nw = flags.filter(f => f.severity === "warn").length, nn = flags.length - nw;
    const allTip = tipEsc(flags.map(f => (f.severity === "warn" ? "! " : "") + f.text).join(" · "));
    const fold = flags.length ? `<span class="s9fl${nw ? " s9wn" : ""}" data-tip="${allTip}">${nw ? `! ${nw} warning${nw > 1 ? "s" : ""}` : ""}${nw && nn ? ", " : ""}${nn ? `${nn} note${nn > 1 ? "s" : ""}` : ""}</span>` : "";
    if (b.na) { const full = fl.join(" · "); return Array.from({ length: L3N }, (_, i) => i ? fold : full); }
    const fold2 = flags.length > 1 ? `<span class="s9fl${nw ? " s9wn" : ""}" data-tip="${allTip}">${nw ? "! " : ""}${flags.length} flags</span>` : fold;
    const bas = P.basis, sfxL = C.sigOwnSuffix(b), sfxS = sfxL.replace(/ ’\d\d$/, "");
    const lp = b.legs.find(l => l.role === "short put"), lc = b.legs.find(l => l.role === "short call");
    // the placement as set (the basis and its targets): where the strikes landed is line 1, and the readings of the
    // landed strikes (achieved Δ, % and σ from the forward) are under Market facts
    const parts = () => {
      if (P.structure === "straddle" && b.center) {
        const c = b.center;
        return { head: [c.target === "atm" ? "placed ATM" : `center by ${RULE.UNIT[bas] === "Δ" ? "Δ " + fT(c.target, bas) : fT(c.target, bas) + RULE.UNIT[bas]}`], extra: [] };
      }
      if (!(lp && lc)) { return { head: [], extra: [] }; }
      const tg = `${fT(P.values.put, bas)} / ${fT(P.values.call, bas)}`;
      return { head: [bas === "delta" ? `placed by Δ ${tg}` : bas === "money" ? `placed ${tg}% OTM` : `placed ${tg}σ out`], extra: [] };
    };
    const tail = x => x ? " · " + x : "";
    // o = {sfx, fw, volCompact, dte, drop (secondary readings dropped from the end), fl ("all" | "fold" | "fold2")}
    const mk = o => {
      const { head, extra } = parts(), rest = extra.slice(0, Math.max(0, extra.length - o.drop));
      // the position's placement only: the market facts (vols, days, forward) are under Market facts
      const base = [...head.map(esc), ...rest.map(esc)].join(" · ");
      return o.fl === "all" ? base + fl.map(x => " · " + x).join("") : base + tail(o.fl === "fold" ? fold : fold2);
    };
    const levels = [], o = { sfx: sfxL, drop: 0, fl: "all" };
    const push = ch => { Object.assign(o, ch); levels.push(mk(o)); };
    push({}); push({ fl: "fold" }); push({ sfx: sfxS }); push({ sfx: sfxS }); push({ sfx: sfxS });
    push({ drop: 1 }); push({ drop: 2 }); push({ drop: 3 }); push({ drop: 3 }); push({ fl: "fold2" });
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
  // the line's text is wider than its content box: whole-pixel overflow, else the text's own width (a Range) against the
  // box, so a sub-pixel overflow (which Chromium draws as an ellipsis) counts too
  function over(e) {
    if (e.scrollWidth > e.clientWidth + 0.5) { return true; }
    const range = document.createRange();
    range.selectNodeContents(e);
    const textWidth = range.getBoundingClientRect().width;
    const style = getComputedStyle(e);
    const boxWidth = e.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    return textWidth > boxWidth + SUMMARY_CONFIG.overflowTolerancePx;
  }
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
    for (const [k, order, keep] of /** @type {[string, string[], string[]][]} */ ([["l1", L1F, ["f20"]], ["l2", L2F, []]])) {
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
    const d = C.diff, L = C.comparison.links, list = [];
    for (const it of d.items) {
      if (!it.asked) list.push({ cls: "w", text: it.text, row: it.dockRow, side: it.side });
      else if (d.identical) continue;   // §2.2: the "same trade" notice stands in place of the neutral pills ("↺ all" stays)
      else if (it.aspect === "placement" || it.aspect === "legs" || it.aspect === "override") list.push({ cls: it.relink ? "rl" : "", text: it.text, row: it.dockRow, side: it.side, relink: it.relink ? it.aspect : "" });
    }
    const notes = [];
    if (d.identical) notes.push("A and B are the same trade");
    else if (d.onlyTypedFill) notes.push("same contracts, only the fill differs (typed prices)");
    else if (d.onlyInstrument) notes.push("same position, only the instrument differs");
    const any = Object.keys(L).some(a => a !== "inst" && !L[a]);
    return { list, notes, any };
  }
  const pillHtml = (p, i) => `<span class="s9pill ${p.cls}" data-pi="${i}" data-row="${esc(p.row || "")}" data-side="${esc(p.side || "")}" title="${tipEsc(p.text + (p.relink ? " · click to open in Positions, ↺ makes B follow A again" : " · click to open in Positions"))}">${esc(p.text)}${p.relink ? `<button type="button" class="s9rl" data-relink="${p.relink}" aria-label="B follows A again">↺</button>` : ""}</span>`;
  let PILLS = [];
  function renderPills(C) {
    const host = q("#s9pills"), { list, notes, any } = pillsHtml(C);
    PILLS = list;
    const tail = (any ? `<span class="s9pill all" data-all="1" title="Make B follow A in every aspect except the instrument">↺ B follows A again</span>` : "");
    const draw = n => notes.map(t => `<span class="s9note">${esc(t)}</span>`).join("") + list.slice(0, n).map(pillHtml).join("") +
      (n < list.length ? `<span class="s9pill" data-more="${n}">+${list.length - n} ▾</span>` : "") + tail;
    host.innerHTML = draw(list.length);
    let n = list.length;
    while (n > 0 && host.scrollWidth > host.clientWidth + 0.5) { n--; host.innerHTML = draw(n); }
  }

  // ---------------------------------------------------------- move range: σ | % | price, with a ▾ popover
  // the move-unit seg: the range (and an own worst-loss range) is converted to the new unit on A's axis; null when the
  // unit cannot change (same unit, or price moves on two instruments)
  function buildMoveUnitCommand(v) {
    const C = SUM9.C, isUnchanged = !C || v === C.unit || (v === "pts" && !C.same);
    if (isUnchanged) { return null; }
    const uo = C.axis(v).uOf("A"), cv = S => STATE.uRound(uo(S), v);
    const lo = Math.max(-cv(C.toSA(C.lo)), 0.05), hi = Math.max(cv(C.toSA(C.hi)), 0.05);
    const wlo = Math.max(-cv(C.toSA(C.wlo)), 0.05), whi = Math.max(cv(C.toSA(C.whi)), 0.05);
    return { type: Command.SetMoveUnit, unit: v, rlo: lo, rhi: hi, wlo, whi };
  }
  // a typed bound; with symmetric on, both bounds take it (capped at the unit's lower-bound cap on A's spot)
  /** @param {{ bound: string, field: HTMLInputElement }} typed  bound: "rlo" or "rhi" */
  function commitRangeBound({ bound, field }) {
    const C = SUM9.C; let v = Math.abs(parseFloat(field.value));
    if (!C || !Number.isFinite(v) || v <= 0) { page.frames.mark({ cause: FrameCause.Ui }); return; }
    v = Math.max(+v.toFixed(2), C.unit === "pct" ? 0.5 : 0.05);
    const assumptions = page.store.read().assumptions;
    const both = Math.min(v, STATE.rangeCaps(assumptions.unit, C.A.S)[0]);
    const patch = assumptions.rlink ? { [bound]: v, rlo: both, rhi: both } : { [bound]: v };
    page.executor.execute({ type: Command.SetAssumption, patch, source: field.id });
  }
  // symmetric on: both bounds take the larger one (capped)
  function buildSymmetricCommand(on) {
    const C = SUM9.C, assumptions = page.store.read().assumptions;
    if (!on) { return { type: Command.SetAssumption, patch: { rlink: false } }; }
    const both = Math.min(Math.max(assumptions.rlo, assumptions.rhi), STATE.rangeCaps(assumptions.unit, C.A.S)[0]);
    return { type: Command.SetAssumption, patch: { rlink: true, rlo: both, rhi: both } };
  }
  // the range row's binder syncs, run in syncRange with the frame's state (as v9's REG list): only when the summary
  // renders, after its cards are fitted
  const RANGE_SYNCS = [];
  function wireRange() {
    seg({ el: "#s9-unit", options: [["sig", "σ", "Multiples of each instrument's implied move over A's horizon"], ["pct", "%", "Simple % change"], ["pts", "price", "Price change in $ (one instrument only)"]], read: state => state.assumptions.unit, command: buildMoveUnitCommand, syncList: RANGE_SYNCS });
    for (const [id, bound] of [["#s9-rlo", "rlo"], ["#s9-rhi", "rhi"]]) { const field = q(id); field.addEventListener("change", () => commitRangeBound({ bound, field })); }
    bindChk({ input: "#s9-rlink", read: state => state.assumptions.rlink, command: buildSymmetricCommand, syncList: RANGE_SYNCS });
    seg({ el: "#s9-units", options: [["pct", "% of A's notional"], ["usd", "$ per A contract"], ["cr", "× A's credit"], ["margin", "% of A's margin", "Everything divided by A's Reg T margin at entry (approx.: 20% × leverage plus premium). Under the Equal margin sizing, B's line is B's own return on its margin."]], read: state => state.prefs.units, command: v => ({ type: Command.SetPref, patch: { units: v } }), syncList: RANGE_SYNCS });
    seg({ el: "#s9-dist", options: [[Odds.Implied, "implied", "The risk-neutral distribution from each fitted smile"], [Odds.PeriodVol, "period vol", "A zero-drift lognormal at each ticker's period vol"]], read: state => state.assumptions.dist, command: v => ({ type: Command.SetAssumption, patch: { dist: v } }), syncList: RANGE_SYNCS });
  }
  function syncRange(C) {
    for (const sync of RANGE_SYNCS) { sync(C.state); }
    const sc = C.assumptions, step = C.uStep(C.unit), lo = q("#s9-rlo"), hi = q("#s9-rhi");
    lo.step = step; hi.step = step;
    if (document.activeElement !== lo) lo.value = +sc.rlo.toFixed(2);
    if (document.activeElement !== hi) hi.value = +sc.rhi.toFixed(2);
    const pb = q('#s9-unit [data-v="pts"]');
    pb.disabled = !C.same; pb.title = C.same ? "Price change in $" : "Price moves need one instrument: A and B trade at different prices";
    const nm = b => b.inst ? b.inst.name || b.inst.id : b.tk;
    const rng = (b, toS) => `${nm(b)} ${fPx2(toS(C.lo))}–${fPx2(toS(C.hi))}`;
    q("#s9-rngeq").textContent = "Prices in view: " + rng(C.A, C.toSA) + (C.same ? "" : " · " + rng(C.B, C.toSB));
    const sd = (b, I) => { const s = C.ax.sig(I); return `${nm(b)}: ATM ${fP(INST.atmAt(I, C.ax.T), 0)} × √(${Math.round(C.ax.T * 365)}/365) = ${s.toFixed(3)}, so +1σ = ${fS(Math.exp(s) - 1, 0)} and −1σ = ${fS(Math.exp(-s) - 1, 0)} (implied ${fP(INST.atmAt(I, C.ax.T), 0)}); ${describeTailOdds({ C, b, I })}`; };
    q("#s9-uinfo").textContent = C.unit === "sig"
      ? `σ = each instrument's ATM implied vol at A's horizon (${C.A.dte} days) × √(days/365), on log price${C.sameExp ? "" : " (B's vol interpolated to A's horizon; the chart axis reads “" + C.sigAxisLabel + "”)"}. ${sd(C.A, C.instA)}.${C.same ? "" : ` ${sd(C.B, C.instB)}. Both move the same number of their own σ.`} Strike placement by σ uses each position's own expiry instead.`
      : (C.unit === "pct" ? `Simple % change of the underlying.${C.same ? "" : " Both instruments move the same %."}` : `Change of ${nm(C.A)}'s price in $. Offered only when A and B are on one instrument.`) +
        (C.sameExp ? "" : ` The payoff's ±σ marks use each instrument's ${C.sigAxisLabel} (B's vol interpolated to A's horizon), not its own expiry.`);
    const vols = [...new Set([C.A.tk, C.B.tk])].map(id => `${id} ${C.volOf(id).label}`).join(", ");
    q("#s9-oddsinfo").textContent = `The odds set profit odds, the odds strips, the grid's column odds and the comparison table's EV row (under implied odds that row is fill vs mid). EV readings elsewhere (overview, sweep, recovery, export) always use the period vol: ${vols}. Set it under Market facts (Compare A vs B → Market facts → Edit).`;
  }
  // where σ meets odds: the move is in implied σ, its odds at the ticker's period vol over A's horizon, beyond 1σ and
  // beyond the recovery panel's kσ hit (2σ when the hit is a fixed %): "at 117% vol, beyond 1σ: 15.2% up, 17.9% down;
  // beyond 1.5σ: 4.4% up, 7.1% down"
  /** @param {{ C: any, b: any, I: any }} input */
  function describeTailOdds({ C, b, I }) {
    const d = C.distOf(b, Odds.PeriodVol), s = C.ax.sig(I);
    if (!d || !Number.isFinite(s)) { return "the period vol has no odds here"; }
    const hitK = C.prefs.rdHit === HitBasis.Move ? C.prefs.rdK : SUMMARY_CONFIG.tailSigmas;
    const tail = k => `beyond ${+k.toFixed(2)}σ: ${fP(1 - cdfAt(d, k * s, C.ax.T), 1)} up, ${fP(cdfAt(d, -k * s, C.ax.T), 1)} down`;
    const ks = [...new Set([1, hitK])];
    return `${C.volOddsText({ ids: [b.tk] })}, ${ks.map(tail).join("; ")}`;
  }

  // ---------------------------------------------------------- toasts: every notice on the bus
  // A notice without a batch replaces the toast; the notices of one batch (one command's events) share it. Plain
  // notices print as text for 3.8 s, event notices as chips with their action buttons (commands) for 4 s, v9's two
  // looks; hovering holds the toast, leaving gives it 2 s more.
  const TOAST_MS = Object.freeze({ [NoticeStyle.Plain]: 3800, [NoticeStyle.Event]: 4000, afterHover: 2000 });
  const shownToast = { batch: "", notices: [] };   // the event notices on screen, for their buttons
  let toastT = 0;
  function hideToastAfter(ms) {
    const t = q("#toast");
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, ms);
  }
  // one chip per event notice: its text, then a button per action (data-e: the notice, data-a: the action)
  const renderNoticeChip = (notice, noticeIndex) => `<span class="t9e">${esc(notice.text)}${notice.actions.map((action, actionIndex) => `<button type="button" class="t9a" data-e="${noticeIndex}" data-a="${actionIndex}">${esc(action.label)}</button>`).join("")}</span>`;
  function showNotice(envelope) {
    const notice = envelope.notice;
    if (!notice || !notice.text) { return; }
    const toast = q("#toast");
    if (notice.style === NoticeStyle.Plain) {
      shownToast.batch = "";
      toast.textContent = notice.text;
      toast.hidden = false;
      hideToastAfter(TOAST_MS[NoticeStyle.Plain]);
      return;
    }
    const isSameBatch = !!envelope.batch && envelope.batch === shownToast.batch;
    shownToast.notices = isSameBatch ? shownToast.notices.concat([notice]) : [notice];
    shownToast.batch = envelope.batch;
    toast.innerHTML = shownToast.notices.map(renderNoticeChip).join("");
    toast.hidden = false;
    hideToastAfter(TOAST_MS[NoticeStyle.Event]);
  }
  function wireToast() {
    const t = q("#toast");
    page.bus.subscribe(EnvelopeType.Notice, showNotice);
    t.addEventListener("click", ev => {
      const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest(".t9a"));
      if (!b) { return; }
      const notice = shownToast.notices[+b.dataset.e], command = notice && notice.actions[+b.dataset.a];
      if (!command) { return; }
      t.hidden = true;
      page.executor.execute(command);
    });
    t.addEventListener("pointerenter", () => clearTimeout(toastT));
    t.addEventListener("pointerleave", () => hideToastAfter(TOAST_MS.afterHover));
  }

  // ---------------------------------------------------------- wiring and rendering
  function onPills(ev) {
    const rl = ev.target.closest("[data-relink]");
    if (rl) { ev.stopPropagation(); page.executor.execute({ type: Command.Link, aspect: rl.dataset.relink, source: "pills" }); return; }
    if (ev.target.closest("[data-all]")) { page.executor.execute({ type: Command.RelinkAll, source: "pills" }); return; }
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
    q("#s9swap").addEventListener("click", () => page.executor.execute({ type: Command.Swap, source: "summary" }));
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
      return { card, l3: line3({ b, P, C, side }) };
    });
    fitPair(cards);
    renderPills(C);
    syncRange(C);
  }
  return { init, render, glyph, marks, commonStages, contractsK, L1F, L2F, C: null };
})();
