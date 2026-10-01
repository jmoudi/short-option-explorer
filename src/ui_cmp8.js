// ============================================================ comparer tab (A vs B)
const trow = (label, v, cls) => `<span class="r"><span class="k">${cls ? `<i class="sw" style="background:var(--${cls})"></i>` : ""}${label}</span><span class="v ${v < 0 ? "neg" : v > 0 ? "pos" : ""}">${fU(v)}</span></span>`;
const hb = () => Math.abs(C.h - 1) > 0.005 ? ` ×${C.h.toFixed(2)}` : "";
const posShort = P => `${P.tk} ${fmtE(P.exp)} ${kindName(P)}`;
// name a position so that A and B never read the same: add Δ targets or fill when those are what differs
function pName(P, other) {
  let s = posShort(P);
  if (!other) return s;
  if (P.pd !== other.pd || P.cd !== other.cd || (P.st === "cap" && P.capd !== other.capd)) s += ` · ${dTxt(P)}Δ`;
  if (P.fill !== other.fill) s += ` · ${P.fill === "mid" ? "mid" : "natural"}`;
  return s;
}

// ============================================================ comparison: what B is relative to A
const ALONG_MAIN = [["tk", "Ticker"], ["st", "Structure"], ["exp", "Expiry"], ["k", "Strikes"]];
const ALONG_MORE = [["fill", "Fill"], ["free", "Anything"]];
function setAlong(v) {
  if (v === st.along) return;
  if (v === "free") st.Bf = { ...Bdef() };
  if (v === "exp" && st.bexp === st.A.exp) st.bexp = EXPS[(EXPS.indexOf(st.A.exp) + 1) % EXPS.length];
  st.along = v;
}
function swapAB() {
  const A = { ...st.A }, B = { ...Bdef() };
  if (st.along === "exp") st.bexp = A.exp;
  if (st.along === "k") st.bk = { pd: A.pd, cd: A.cd, capd: A.capd };
  if (st.along === "free") st.Bf = A;
  if (st.along === "k" || st.along === "free") [st.link, st.linkB] = [st.linkB, st.link];
  st.A = B;
}
function setA(tk, s, e) { st.A = { ...st.A, tk, st: s, exp: e }; }
function setB(tk, s, e) {
  if (st.along === "free") { st.Bf = { ...Bdef(), tk, st: s, exp: e }; return; }
  const A = st.A, diff = [tk !== A.tk && "tk", s !== A.st && "st", e !== A.exp && "exp"].filter(Boolean);
  if (!diff.length) { toast("That is A. Pick a different position for B."); return; }
  if (diff.length === 1 && st.along !== "k" && st.along !== "fill") {
    const dim = diff[0];
    if (st.along !== dim) { setAlong(dim); toast(`B now differs from A in ${dim === "tk" ? "ticker" : dim === "st" ? "structure" : "expiry"}`); }
    if (dim === "exp") st.bexp = e;
    return;
  }
  const base = Bdef(); toast("B is now set independently of A (Anything)"); st.along = "free"; st.Bf = { ...base, tk, st: s, exp: e };
}
const strikeOwner = tag => tag === "A" ? st.A : st.along === "k" ? st.bk : st.along === "free" ? st.Bf : st.A;
// one-click fix for an n/a capped position; T is the object whose Δ targets get changed
function capFixFor(P, T, note) {
  const b = build(P);
  if (!b.na) return null;
  if (b.capNA.startsWith("cap")) { const v = Math.max(3, Math.min(Math.round(P.cd) - 5, 40)); return { label: `Lower cap Δ to ${v}${note}`, apply: () => { T.capd = v; } }; }
  const { calls } = chain(P.tk, P.exp), elig = calls.filter(o => o.bid > 0 && calls.some(c => c.K > o.K && c.ask > 0));
  if (!elig.length) return null;
  const best = elig[elig.length - 1], v = clamp(+(Math.abs(best.d) * 100).toFixed(1), 5, 50);
  return { label: `Raise call Δ to ${v} (short ${fK(best.K)}C)${note}`, apply: () => { if (T === st.A) st.link = false; else st.linkB = false; T.cd = v; if (T.capd >= v) T.capd = Math.max(3, Math.round(v) - 5); } };
}
function capFix(tag) {
  const P = tag === "A" ? st.A : Bdef(), T = strikeOwner(tag);
  const shared = tag === "B" ? T === st.A : !["k", "free"].includes(st.along);
  return capFixFor(P, T, shared ? " (A and B share these strikes)" : "");
}
const FIXES = {};
function renderHeader() {
  const { A, B, Ap, Bp } = C;
  const chip = (id, tag, P, other, b, sz) => {
    const el = $(id), nm = pName(P, other), extra = nm.slice(posShort(P).length);
    el.classList.toggle("hasz", !!sz);
    el.innerHTML = `<span class="key ${tag.toLowerCase()}">${tag}</span><span class="nm">${posShort(P)}</span>${extra ? `<span class="sz">${extra.replace(/^ · /, "")}</span>` : ""}${sz ? `<span class="sz">${sz}</span>` : ""}`;
    el.title = `${nm} · ${b.na ? "n/a" : legTxt(b)} · ${P.fill === "mid" ? "mid" : "natural"}${sz ? ` · held at ${sz.trim()} of A's notional` : ""}. Click to edit.`;
  };
  chip("#chipA", "A", Ap, Bp, A, ""); chip("#chipB", "B", Bp, Ap, B, hb());
  const more = ALONG_MORE.find(x => x[0] === st.along);
  $("#alongMore").textContent = more ? more[1] : "More"; $("#m-along").classList.toggle("on", !!more);
  const ptsBtn = $("#c-unit").querySelector('[data-v="pts"]'); ptsBtn.disabled = !C.same; ptsBtn.title = C.same ? "Underlying price change in $" : "Points only work with one ticker: RAM and KORU trade at different prices";
  const step = uStep(C.unit);
  $("#c-rlo").step = step; $("#c-rhi").step = step;
  if (document.activeElement !== $("#c-rlo")) $("#c-rlo").value = +st.rlo.toFixed(2);
  if (document.activeElement !== $("#c-rhi")) $("#c-rhi").value = +st.rhi.toFixed(2);
  const rng = (tk, toS) => `${tk} ${fPx2(toS(C.lo))}–${fPx2(toS(C.hi))}`;
  $("#rngEq").textContent = rng(A.tk, C.toSA) + (C.same ? "" : " · " + rng(B.tk, C.toSB));
  const sdesc = tk => { const s = C.ax.sigTk(tk); return `${tk} ${fP(D.u[tk].exps[A.exp].atm, 0)} × √(${A.dte}/365) = ${s.toFixed(3)}, so +1σ = ${fS(Math.exp(s) - 1, 0)} and −1σ = ${fS(Math.exp(-s) - 1, 0)}`; };
  $("#unitInfo").dataset.tip = C.unit === "sig" ? `σ = ATM implied vol at A's expiry (${fmtE(A.exp)}) × √(A's days / 365), on log price. ${sdesc(A.tk)}.${C.same ? "" : ` ${sdesc(B.tk)}. Both tickers move the same number of their own σ.`} Every panel, B and the overview use this same σ, so all of them see the same scenarios.` : C.unit === "pct" ? `Simple % change of the underlying.${C.same ? "" : " Both tickers move the same %."} Every panel uses the same scenarios.` : `Change of ${A.tk}'s price in $. Offered only when A and B are on one ticker; the overview shows the other ticker at the same % move.`;
  const out = [];
  for (const [tag, b, P] of [["A", A, Ap], ["B", B, Bp]]) {
    if (b.na) { const fx = capFix(tag); FIXES[tag] = fx; out.push(`<span class="w"><span class="key ${tag.toLowerCase()}">${tag}</span> ${posShort(P)} is n/a: ${b.capNA.replace(/ \(raise.*\)/, "")}.${fx ? `<button class="btn fix" type="button" data-fix="${tag}">${fx.label}</button>` : ""}</span>`); }
    else if (b.capFb) out.push(`<span class="w"><span class="key ${tag.toLowerCase()}">${tag}</span> cap is the highest listed call, ${fK(b.cap.K)}C at ${(b.cap.d * 100).toFixed(0)}Δ; nothing is listed below ${+P.capd.toFixed(1)}Δ.</span>`);
    if (b.na) continue;
    const key = `<span class="key ${tag.toLowerCase()}">${tag}</span>`;
    for (const [k, o, li, cp, nm] of [["pd", b.sp, b.iP, "P", "put"], ["cd", b.sc, b.iC, "C", "call"]]) {
      const mx = maxDelta(b.tk, b.exp, cp);
      if (P[k] > mx.stop + 1e-9 && tag === "B" && !["k", "free"].includes(st.along)) out.push(`<span class="w">${key} ${b.tk} ${fmtE(b.exp)} lists no ${nm} deeper than ${mx.d.toFixed(0)}Δ, so the ${+P[k].toFixed(1)}Δ target uses ${fK(o.K)}${cp}.</span>`);
      if (li.below) out.push(`<span class="w">${key} ${fK(o.K)}${cp} mid ${o.mid.toFixed(2)} is below its intrinsic ${li.intr.toFixed(2)}: a stale or wide quote, so its time value reads negative.</span>`);
    }
  }
  $("#warnrow").innerHTML = out.join(""); $("#warnrow").hidden = !out.length;
  $("#hvRow").hidden = st.dist !== "hv";
  $("#viewSum").textContent = `${st.units === "pct" ? "% of A's notional" : st.units === "usd" ? "$ per A contract" : A.na ? "% of A's notional (× credit needs A)" : A.intr > 0 ? "× A's time value" : "× A's credit"} · ${st.dist === "rn" ? "implied odds" : `HV30 ×${st.hvk.toFixed(2)} odds`}`;
  $("#hvinfo").textContent = `IBKR HV30: RAM ${fP(D.u.RAM.hv, 0)}, KORU ${fP(D.u.KORU.hv, 0)}. HV30 odds are a zero-drift lognormal at that vol.`;
}
// switch the move unit, converting the current range so the same prices stay in view
function setUnit(v) {
  if (v === st.unit || (v === "pts" && !C.same)) return;
  const A = C.A, uo = axisFor(A, v).uOf(A.tk), cv = S => uRound(uo(S), v);
  const lo = Math.max(-cv(C.toSA(C.lo)), 0.05), hi = Math.max(cv(C.toSA(C.hi)), 0.05);
  const wlo = Math.max(-cv(C.toSA(C.wlo)), 0.05), whi = Math.max(cv(C.toSA(C.whi)), 0.05);
  st.unit = v; st.rlo = lo; st.rhi = hi; if (st.wl === "own") { st.wlo = wlo; st.whi = whi; }
  if (st.rlink && Math.abs(lo - hi) > 1e-9) { st.rlink = false; toast(`Range converted to ${uLab(-lo, v)} to ${uLab(hi, v)}; symmetric is off because the converted range is not symmetric`); }
}

// ============================================================ sidebar editors
const EDITORS = [];
const segRow = (f, l) => `<span class="row"><span class="lbl">${l}</span><span class="seg eq" data-f="${f}"></span></span>`;
const slRow = (id, f, l, lo, hi, tip) => `<span class="row sl" data-r="${f}"><label class="lbl" for="${id}-${f}" title="${tip}">${l}</label><input type="range" id="${id}-${f}" min="${lo}" max="${hi}" step="0.5" title="${f === "capd" ? "Amber part: cap Δ at or above the call Δ, where no cap is possible" : f === "cd" ? "Amber part: call Δ at or below the cap Δ, where no cap is possible" : ""}"> <output></output></span>`;
const SEGOPT = { tk: TKS.map(t => [t, t]), exp: EXPS.map(e => [e, fmtE(e).replace(" ’27", "")]), st: [["str", "Strangle"], ["cap", "Capped"]], fill: [["mid", "Mid"], ["nat", "Natural", "Sell at bid, buy at ask; marks before expiry also pay half the spread to close"]] };
const TIPS = { pd: "Short put target delta, 3 to 90. 50 = strike nearest the forward (ATM); above 50 the put is in the money.", cd: "Short call target delta, 3 to 90. 50 = strike nearest the forward (ATM); above 50 the call is in the money. Both above 50 = a short guts.", capd: "Cap = lowest listed call above the short call with delta below this." };
// slider track: ATM mark at 50, the in-the-money part tinted, the part past the deepest listed strike faded, an amber part where no cap is possible
const dPos = v => (v - DMIN) / (DMAX - DMIN) * 100;
function trackFor(f, P, stop, capOn) {
  if (f === "capd") return capOn ? `linear-gradient(90deg, var(--line) 0 ${clamp((P.cd - 3) / 37 * 100, 0, 100)}%, var(--shade) ${clamp((P.cd - 3) / 37 * 100, 0, 100)}% 100%)` : "var(--line)";
  const a = dPos(50), s = dPos(Math.max(50, stop)), seg = [];
  if (f === "cd" && capOn && P.capd > DMIN) seg.push([0, dPos(P.capd), "var(--shade)"]);
  const lo = seg.length ? seg[0][1] : 0;
  if (lo < a - 0.6) seg.push([lo, a - 0.6, "var(--line)"]);
  seg.push([Math.max(lo, a - 0.6), Math.max(lo, a + 0.6), "var(--ink-3)"]);
  if (s > a + 0.6) seg.push([a + 0.6, s, "var(--itm)"]);
  if (s < 100) seg.push([s, 100, "var(--grid)"]);
  return `linear-gradient(90deg, ${seg.map(([x, y, col]) => `${col} ${x.toFixed(2)}% ${y.toFixed(2)}%`).join(", ")})`;
}
const capOf = ed => { const b = ed.built(); return b ? { P: maxDelta(b.tk, b.exp, "P"), C: maxDelta(b.tk, b.exp, "C") } : { P: { stop: DMAX }, C: { stop: DMAX } }; };
function makeEditor(root, id, kind, cfg) {
  const sl = slRow(id, "pd", "Put Δ", DMIN, DMAX, TIPS.pd) + slRow(id, "cd", "Call Δ", DMIN, DMAX, TIPS.cd) + slRow(id, "capd", "Cap Δ", 3, 40, TIPS.capd) + `<span class="cap dnote" data-dnote hidden></span>`;
  const head = segRow("tk", "Ticker") + segRow("exp", "Expiry") + segRow("st", "Type");
  const linkChk = `<label class="chk" style="display:block;margin-top:2px"><input type="checkbox" data-link>Move put and call together</label>`;
  let h = "";
  if (kind === "A") h = head + sl + `<details class="sub" data-sub><summary>Execution and legs <span class="sv"></span></summary><span class="sb">${segRow("fill", "Fill")}${linkChk}</span></details>`;
  if (kind === "bk") h = sl + `<details class="sub" data-sub><summary>Leg linking <span class="sv"></span></summary><span class="sb">${linkChk}</span></details>`;
  if (kind === "bf") h = head + sl + `<details class="sub" data-sub><summary>Execution and legs <span class="sv"></span></summary><span class="sb">${segRow("fill", "Fill")}${linkChk}</span></details>`;
  root.insertAdjacentHTML("beforeend", h);
  const ed = { id, root, kind, linkKey: kind === "A" ? "link" : "linkB", ...cfg, out: {}, inp: {}, rows: {} };
  root.querySelectorAll(".seg[data-f]").forEach(el => { const f = el.dataset.f; seg(el, SEGOPT[f], () => cfg.get()[f], v => { cfg.get()[f] = v; }); });
  for (const f of ["pd", "cd", "capd"]) {
    const row = root.querySelector(`[data-r="${f}"]`), inp = row.querySelector("input");
    ed.rows[f] = row; ed.inp[f] = inp; ed.out[f] = row.querySelector("output"); ed[f + "Lbl"] = row.querySelector("label");
    // Δ sliders stop at the deepest listed strike of their own chain
    inp.addEventListener("input", () => {
      const P = ed.capTarget && f === "capd" ? ed.capTarget() : cfg.get(), v = +inp.value;
      if (f === "capd") P[f] = v;
      else { const m = capOf(ed), cl = (k, x) => Math.min(x, m[k === "pd" ? "P" : "C"].stop); P[f] = cl(f, v); if (st[ed.linkKey]) { P.pd = cl("pd", v); P.cd = cl("cd", v); } if (P[f] !== v) inp.value = P[f]; }
      refresh();
    });
  }
  ed.link = root.querySelector("[data-link]");
  ed.link.addEventListener("change", () => { st[ed.linkKey] = ed.link.checked; if (ed.link.checked) { const P = cfg.get(), m = capOf(ed), v = Math.max(P.pd, P.cd); P.pd = Math.min(v, m.P.stop); P.cd = Math.min(v, m.C.stop); } refresh(); });
  ed.dnote = root.querySelector("[data-dnote]");
  ed.sub = root.querySelector("[data-sub]");
  EDITORS.push(ed); return ed;
}
function syncEditor(ed) {
  const P = ed.get(), b = ed.built(), cb = ed.capBuilt ? ed.capBuilt() : b, capOn = !!cb && cb.P.st === "cap";
  for (const f of ["pd", "cd", "capd"]) if (document.activeElement !== ed.inp[f]) ed.inp[f].value = P[f];
  ed.link.checked = !!st[ed.linkKey];
  const m = capOf(ed);
  // readout: target → achieved delta and strike; ITM legs carry a tag, and their flags go in the tooltip
  const r = (tgt, o, cp, li, mx) => {
    const ach = Math.abs(o.d * 100), base = `${tgt === 50 ? "ATM" : +tgt.toFixed(1)}→${ach.toFixed(ach < 10 ? 1 : 0)}Δ ${fK(o.K)}${cp}`;
    if (tgt <= 50) return { txt: base, warn: tgt < 50 && Math.abs(ach - tgt) > 5, flags: [] };
    const flags = [];
    if (tgt > mx.stop + 1e-9 || (Math.abs(ach - tgt) > 5 && o.K === mx.K)) flags.push(`The chain stops here: deepest listed ${cp === "P" ? "put" : "call"} is ${fK(mx.K)}${cp} at ${mx.d.toFixed(0)}Δ`);
    else if (Math.abs(ach - tgt) > 5) flags.push("Strikes are coarse here: the achieved delta is far from the target");
    if (li.below) flags.push(`Mid ${o.mid.toFixed(2)} is below intrinsic ${li.intr.toFixed(2)}: the quote is stale or the spread is wide`);
    if (li.ea) flags.push(`Early assignment likely: time value ${li.tvMid < 0 ? MINUS : ""}$${Math.abs(li.tvMid).toFixed(2)} is below $${Math.max(0.05, li.carry).toFixed(2)} (the larger of $0.05 and the carry on the strike). The model stays European`);
    return { html: `${base} <b class="itm">ITM${li.below || li.ea ? " !" : ""}</b>`, warn: Math.abs(ach - tgt) > 5 || li.below, flags };
  };
  const itmTip = li => li.intr > 0 ? `In the money by ${li.intr.toFixed(2)}: of the ${li.px.toFixed(2)} received, ${li.tv < 0 ? MINUS : ""}${Math.abs(li.tv).toFixed(2)} is time value` + (li.from ? `. Priced from the ${fK(li.from.K)}${li.from.cp} (out of the money) through put-call parity on the parity-implied forward: value ${li.par.toFixed(2)} against a mid of ${(li.tvMid + li.intr).toFixed(2)}` : "") : "";
  const rp = r(P.pd, b.sp, "P", b.iP, m.P), rc = r(P.cd, b.sc, "C", b.iC, m.C), coarse = "Strikes are coarse here: the achieved delta is far from the target";
  for (const [o, rr] of [[ed.out.pd, rp], [ed.out.cd, rc]]) { if (rr.html) o.innerHTML = rr.html; else o.textContent = rr.txt; o.classList.toggle("warn", !!rr.warn); }
  const tip = (...a) => a.filter(Boolean).join(". ") + ".";
  ed.out.pd.title = tip(rp.warn && !rp.flags.length ? coarse : "target → achieved delta, strike", b.straddle && "Straddle: put and call share a strike", b.guts && "Short guts: the put strike is above the call strike", P.pd > 50 && itmTip(b.iP), ...rp.flags);
  ed.out.cd.title = tip(rc.warn && !rc.flags.length ? coarse : "target → achieved delta, strike", b.inv && "Put moved down to stay at or below the call strike", b.guts && "Short guts: the put strike is above the call strike", P.cd > 50 && itmTip(b.iC), ...rc.flags);
  const dn = [];
  for (const [k, cp, nm] of [["pd", "P", "put"], ["cd", "C", "call"]]) { const mx = m[cp]; if (P[k] > 50 && mx.stop < DMAX && P[k] >= mx.stop - 1e-9) dn.push(`deepest listed ${nm}: ${mx.d.toFixed(0)}Δ (${fK(mx.K)}${cp})`); }
  ed.dnote.hidden = !dn.length; ed.dnote.textContent = dn.join(" · ");
  ed.rows.capd.hidden = !capOn;
  if (capOn) {
    ed.capdLbl.textContent = cb === b ? "Cap Δ" : "B cap Δ"; ed.capdLbl.title = cb === b ? TIPS.capd : "B's cap: B is the capped one here and uses A's put and call targets";
    ed.rows.capd.classList.toggle("na", !!cb.capNA);
    ed.out.capd.textContent = cb.capNA ? (cb.capNA.startsWith("no") ? "no call above" : "cap ≥ call Δ") : cb.cap ? `${+cb.P.capd.toFixed(1)}→${(cb.cap.d * 100).toFixed(1)}Δ ${fK(cb.cap.K)}C` + (cb.capFb ? " !" : "") : "–";
    ed.out.capd.title = cb.capNA ? "Capped position is n/a: " + cb.capNA : cb.capFb ? `No listed call below ${cb.P.capd}Δ above the short call; the highest listed call is used` : "target → achieved delta, strike";
    ed.out.capd.classList.toggle("warn", !!cb.capFb);
  }
  ed.inp.pd.style.setProperty("--trk", trackFor("pd", P, m.P.stop, false));
  ed.inp.cd.style.setProperty("--trk", trackFor("cd", P, m.C.stop, capOn));
  ed.inp.capd.style.setProperty("--trk", trackFor("capd", P, 0, capOn));
  if (ed.sub) ed.sub.querySelector(".sv").textContent = `· ${ed.kind === "bk" ? "" : (P.fill === "mid" ? "mid" : "natural")}${st[ed.linkKey] ? (ed.kind === "bk" ? "linked" : " · linked") : (ed.kind === "bk" ? "independent" : "")}`;
}
function renderSide() {
  const { Bp } = C, a = st.along;
  $("#bnote").innerHTML = {
    st: `Same as A, but <b>${Bp.st === "cap" ? "capped" : "a plain strangle"}</b>.`,
    tk: `Same as A, but on <b>${Bp.tk}</b>, with strikes from the same Δ targets on its own chain.`,
    fill: `Same as A, but filled at <b>${Bp.fill === "mid" ? "mid" : "natural"}</b>.`,
    exp: `Same as A, at another expiry:`, k: `Same as A, with its own strikes:`, free: `Set independently of A:`
  }[a] + ` <span class="cap">What B differs in is set at the top of the page.</span>`;
  $("#bExp").hidden = a !== "exp"; $("#bK").hidden = a !== "k"; $("#bF").hidden = a !== "free";
  document.querySelectorAll("#c-bexp button").forEach(b => b.disabled = b.dataset.v === st.A.exp);
  $("#r-hc").hidden = st.size !== "custom";
  const rname = r => SIZES.find(s => s[0] === r)[1].toLowerCase();
  $("#sizeSv").textContent = `· ${st.size === "auto" ? `auto: ${rname(C.rule)}` : rname(C.rule)}, h ${C.h.toFixed(2)}`;
  $("#o-h").innerHTML = (st.size === "auto" ? `Auto uses equal notional for one ticker and equal vega across tickers (RAM is 2×, KORU 3× leveraged). ` : "") + `B is held at h = ${C.h.toFixed(3)} × A's notional` + (C.same ? "." : `, about ${(C.h * C.A.S / C.B.S).toFixed(2)} ${C.B.tk} contracts per ${C.A.tk} contract.`) + (C.hNote ? `<br><span class="badge">${C.hNote}</span>` : "");
}

// ============================================================ overview (collapsed): all 16 positions
const OVM = {
  // credit ratios use time value (credit − intrinsic at entry); for out-of-the-money legs that is the credit itself
  cr: { l: "Credit", f: b => b.tv / b.S, kind: "money" },
  crs: { l: "Credit/σ", f: b => b.tv / (b.S * b.sig), kind: "ratio", fmt: v => fN(v, 3), tip: "Credit ÷ (spot × ATM IV × √T): credit per unit of the expiry's own implied move. In-the-money legs count time value only" },
  crd: { l: "Credit per day", f: b => b.tv / b.S / b.dte, kind: "money", d: 3 },
  ev: { l: "Expected value · HV30", f: b => statsHV(b).ev / b.S, kind: "money", d: 2, zero: true },
  pop: { l: "Profit odds", f: (b, s) => s.pop, kind: "pct" },
  worst: { l: "Worst loss in range", f: (b, s) => s.worst / b.S, kind: "money", zero: true, tip: "Worst expiry P&L over the worst-loss range; a positive value means no loss anywhere in the range" },
  capc: { l: "Cap cost", f: b => b.cap ? b.capPx / b.S : NaN, kind: "money", tip: "Premium paid for the cap; capped positions only" },
  capp: { l: "Cap pays odds", f: (b, s) => b.cap ? s.pCap : NaN, kind: "pct", tip: "Odds that spot ends above cap strike + cap premium, where the cap has paid for itself" },
  rom: { l: "Credit / margin", f: b => b.tv / b.margin, kind: "pct", tip: "Approximate margin: Reg-T style, 20% × leverage. In-the-money legs count time value only" }
};
const SERIES = [["RAM", "str"], ["RAM", "cap"], ["KORU", "str"], ["KORU", "cap"]];
const serStyle = (tk, s) => ({ col: tk === "RAM" ? "var(--ink)" : "var(--ink-3)", dash: s === "cap" ? "5 4" : "", shape: tk === "RAM" ? "c" : "s", fill: s === "cap" ? "var(--surface)" : (tk === "RAM" ? "var(--ink)" : "var(--ink-3)"), off: { "RAM|str": -5, "RAM|cap": -1.7, "KORU|str": 1.7, "KORU|cap": 5 }[tk + "|" + s] });
const ovStats = b => { const base = statsBase(b); if (!base) return null; const toS = C.ax.toS(b.tk); return { ...base, worst: worstIn(b, toS(C.wlo), toS(C.whi)) }; };
function ovPositions() {
  const out = [];
  for (const [tk, s] of SERIES) for (const e of EXPS) { const b = build({ ...st.A, tk, st: s, exp: e }); out.push({ tk, s, e, b, sx: ovStats(b) }); }
  return out;
}
const bOwnLegs = () => { const A = C.Ap, B = C.Bp; return !(A.pd === B.pd && A.cd === B.cd && A.capd === B.capd && A.fill === B.fill); };
function fOwn(v, b, M, plain) {
  if (!Number.isFinite(v)) return "–";
  if (M.kind === "ratio") return M.fmt(v);
  if (M.kind === "pct") return fP(v, 0);
  const x = v * b.S * 100, usd = ` <span class="muted">${x < 0 ? MINUS : ""}$${Math.abs(x).toFixed(Math.abs(x) < 10 ? 2 : 0)}/lot</span>`;
  return (M.zero ? fS : fP)(v, M.d ?? 1) + (plain ? "" : usd);
}
const mk = (sh, x, y, r, fill, col) => sh === "c" ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${col}" stroke-width="1.6"/>` : `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="${col}" stroke-width="1.6"/>`;
function renderOverview() {
  if (!$("#p-over").open) return;
  const pos = ovPositions(), table = st.ovv === "table";
  $("#ovgrid").hidden = table; $("#ovtable").hidden = !table; $("#ovlgd").hidden = table;
  $("#ovlgd").innerHTML = SERIES.map(([tk, s]) => { const y = serStyle(tk, s); return `<span><svg width="30" height="12" aria-hidden="true"><line x1="0" x2="30" y1="6" y2="6" stroke="${y.col}" stroke-width="1.8" stroke-dasharray="${y.dash}"/>${mk(y.shape, 15, 6, 3.5, y.fill, y.col)}</svg>${tk} ${s === "cap" ? "capped" : "strangle"}</span>`; }).join("") + `<span><svg width="20" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--a)" stroke-width="2"/></svg>A <svg width="20" height="14" aria-hidden="true" style="margin-left:6px"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--b)" stroke-width="2"/></svg>B</span>`;
  $("#ovcap").innerHTML = `Each point is a position built with A's strike targets (${dTxt(C.Ap)}Δ) and fill (${C.Ap.fill === "mid" ? "mid" : "natural"})${bOwnLegs() ? ", so B, which has its own legs, is drawn as its own orange point" : ""}. Values are % of each position's own notional, with $ per contract in the tooltips. Profit odds are ${st.dist === "rn" ? "implied" : "HV30"}; EV always uses HV30, since under implied odds it is just fill vs mid. Worst loss covers ${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}${C.unit === "sig" ? " (each ticker's σ over A's horizon)" : C.unit === "pts" ? ` on ${C.A.tk}, the same % on the other ticker` : ""}, the same scenarios as the rest of the page.`;
  if (table) return renderOvTable(pos);
  const host = $("#ovgrid"); host.innerHTML = "";
  const dts = EXPS.map(e => D.u.RAM.exps[e].dte), sq = Math.sqrt;
  const isA = p => C.Ap.tk === p.tk && C.Ap.st === p.s && C.Ap.exp === p.e;
  const isBcell = p => !bOwnLegs() && C.Bp.tk === p.tk && C.Bp.st === p.s && C.Bp.exp === p.e;
  const anyI = pos.some(p => !p.b.na && p.b.intr > 0) || (bOwnLegs() && !C.B.na && C.B.intr > 0);
  for (const key of Object.keys(OVM)) {
    const M0 = OVM[key], M = key === "cr" && anyI ? { ...M0, l: "Credit, time value", tip: "Credit minus intrinsic value at entry; for out-of-the-money legs it is the whole credit. Cash credit is in the tooltip" } : M0, box = document.createElement("span"); box.className = "ovc"; box.style.display = "block";
    box.innerHTML = `<h3>${M.l}${M.tip ? `<span class="info" tabindex="0" data-tip="${M.tip}">i</span>` : ""}</h3>`; host.appendChild(box);
    const W = Math.max(box.clientWidth, 240), H = 162, m = { l: 48, r: 12, t: 12, b: 32 };
    const vals = pos.map(p => ({ ...p, v: p.b.na || !p.sx ? NaN : M.f(p.b, p.sx), na: p.b.na }));
    let bOwn = null;
    if (bOwnLegs()) { const bb = C.B, sx = ovStats(bb); bOwn = { tk: C.Bp.tk, s: C.Bp.st, e: C.Bp.exp, b: bb, sx, v: bb.na || !sx ? NaN : M.f(bb, sx), na: bb.na, own: true }; }
    const fin = vals.concat(bOwn ? [bOwn] : []).map(p => p.v).filter(Number.isFinite);
    if (!fin.length) { box.insertAdjacentHTML("beforeend", `<span class="gna" style="padding:40px 0">no values</span>`); continue; }
    let lo = Math.min(...fin), hi = Math.max(...fin); if (M.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 0.01; lo -= pad; hi += pad;
    const X = (dte, off) => m.l + 14 + dts.indexOf(dte) / Math.max(1, EXPS.length - 1) * (W - m.l - m.r - 28) + (off || 0), Y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${M.l} for all 16 positions by expiry` }, box), ax = el("g", { class: "ax" }, svg);
    const yt = ticks(lo, hi, 4), ys = (yt[1] - yt[0]) * 100;
    for (const t of yt) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 6, Y(t) + 3.5, M.kind === "ratio" ? fN(t, 2) : fP(t, ys >= 1 ? 0 : ys >= 0.1 ? 1 : 2), { "text-anchor": "end" }); }
    if (lo < 0 && hi > 0) el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg);
    EXPS.forEach((e, i) => { txt(ax, X(dts[i]), H - 16, fmtE(e).replace(" ’27", ""), { "text-anchor": "middle", style: "fill:var(--ink-2)" }); txt(ax, X(dts[i]), H - 4, `${dts[i]}d`, { "text-anchor": "middle", style: "font-size:9.5px" }); });
    for (const [tk, s] of SERIES) { const sty = serStyle(tk, s); el("path", { d: pathOf(EXPS.map((e, i) => [dts[i], vals.find(q => q.tk === tk && q.s === s && q.e === e).v]), d => X(d, sty.off), Y), fill: "none", stroke: sty.col, "stroke-width": 1.8, "stroke-dasharray": sty.dash }, svg); }
    const pts = [];
    for (const p of vals) {
      const sty = serStyle(p.tk, p.s), x = X(p.b.dte, sty.off);
      if (!Number.isFinite(p.v)) { if (p.na || (M.kind !== "ratio" && key.startsWith("cap") && p.s === "cap")) { const y = H - m.b - 4; svg.insertAdjacentHTML("beforeend", `<text x="${x}" y="${y}" text-anchor="middle" style="font:600 10px var(--f-ui);fill:${sty.col}">×</text>`); pts.push({ p, x, y }); } continue; }
      const y = Y(p.v); svg.insertAdjacentHTML("beforeend", mk(sty.shape, x, y, 3.6, sty.fill, sty.col)); pts.push({ p, x, y });
    }
    if (bOwn && Number.isFinite(bOwn.v)) { const x = X(bOwn.b.dte, 8), y = Y(bOwn.v); el("circle", { cx: x, cy: y, r: 3.6, fill: "var(--b)" }, svg); pts.push({ p: bOwn, x, y }); }
    // rings last, so they sit on top; concentric when A and B share a point
    const aPt = pts.find(q => !q.p.own && isA(q.p)), bPt = bOwn ? pts.find(q => q.p.own) : pts.find(q => !q.p.own && isBcell(q.p));
    if (bPt) el("circle", { cx: bPt.x, cy: bPt.y, r: aPt && Math.hypot(aPt.x - bPt.x, aPt.y - bPt.y) < 4 ? 11.5 : 8, fill: "none", stroke: "var(--b)", "stroke-width": 2.2 }, svg);
    if (aPt) el("circle", { cx: aPt.x, cy: aPt.y, r: 8, fill: "none", stroke: "var(--a)", "stroke-width": 2.2 }, svg);
    const hov = el("circle", { r: 10, fill: "none", stroke: "var(--ink-2)", "stroke-width": 1, visibility: "hidden" }, svg);
    const hit = el("rect", { x: 0, y: 0, width: W, height: H - m.b + 6, fill: "transparent", style: "cursor:pointer" }, svg);
    const near = (ev, rad) => { const r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * W / r.width, my = (ev.clientY - r.top) * H / r.height; return pts.map(q => ({ ...q, dd: Math.hypot(q.x - mx, q.y - my) })).filter(q => q.dd <= rad).sort((a, b) => a.dd - b.dd); };
    const desc = q => `${q.p.own ? "B: " : ""}${posShort(q.p.own ? C.Bp : { ...C.Ap, tk: q.p.tk, st: q.p.s, exp: q.p.e })}`;
    const cands = n => n.filter(q => !q.p.own);
    hit.addEventListener("pointermove", ev => { const n = near(ev, 16); if (!n.length) { hov.setAttribute("visibility", "hidden"); hideTip(); return; } const q = n[0], c = cands(n); hov.setAttribute("cx", q.x); hov.setAttribute("cy", q.y); hov.setAttribute("visibility", "visible"); showTip(`<span class="h">${desc(q)}</span><span class="s">${q.p.na ? q.p.b.capNA : legTxt(q.p.b)}${q.p.b.capFb ? " · cap fallback" : ""}</span>${krow(M.l, q.p.na ? "n/a" : fOwn(q.p.v, q.p.b, M))}${key === "cr" && !q.p.na && q.p.b.intr > 0 ? krow("Cash credit", fOwn(q.p.b.cr / q.p.b.S, q.p.b, M)) : ""}<span class="s" style="margin:4px 0 0">${q.p.own ? "B's own legs; edit B in Positions" + (c.length ? " · click to pick a nearby position" : "") : "click to set as A or B"}${c.length > 1 ? ` · ${c.length} positions here` : ""}</span>`, ev.clientX, ev.clientY); });
    hit.addEventListener("pointerleave", () => { hov.setAttribute("visibility", "hidden"); hideTip(); });
    hit.addEventListener("click", ev => {
      ev.stopPropagation(); const close = cands(near(ev, 16));
      if (!close.length) return;
      const html = close.map((q, i) => { const a = isA(q.p); return `<span class="cand"><span class="h">${desc(q)}</span><span class="s">${q.p.na ? "n/a: " + q.p.b.capNA : `${legTxt(q.p.b)} · ${M.l} ${fOwn(q.p.v, q.p.b, M, true)}`}</span><span class="btns"><button type="button" data-i="${i}" data-set="A"${a ? " disabled" : ""}><span class="key a">A</span>Set as A</button><button type="button" data-i="${i}" data-set="B"${a ? " disabled" : ""}><span class="key b">B</span>Set as B</button></span></span>`; }).join("");
      openPopAt(html, ev.clientX, ev.clientY, e => { const b = e.target.closest("button[data-set]"); if (!b || b.disabled) return; const q = close[+b.dataset.i].p; if (b.dataset.set === "A") setA(q.tk, q.s, q.e); else setB(q.tk, q.s, q.e); $("#pop").hidden = true; refresh(); });
    });
  }
}
function renderOvTable(pos) {
  const cols = [pos.some(p => !p.b.na && p.b.intr > 0) ? "Credit, time value" : "Credit", "Credit/σ", "Credit/day", "EV (HV30)", "Profit odds", "Worst loss", "Cap cost", "Cap pays odds", "Credit/margin", "Breakevens"];
  let h = `<thead><tr><th class="st l">Set</th><th class="st2 l">Position</th>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for (const e of EXPS) for (const [tk, s] of [["RAM", "str"], ["KORU", "str"], ["RAM", "cap"], ["KORU", "cap"]]) {
    const p = pos.find(q => q.tk === tk && q.s === s && q.e === e), b = p.b, x = p.sx, nm = posShort({ ...C.Ap, tk, st: s, exp: e });
    const isA = C.Ap.tk === tk && C.Ap.st === s && C.Ap.exp === e, isB = !bOwnLegs() && C.Bp.tk === tk && C.Bp.st === s && C.Bp.exp === e;
    const cls = `${tk === "RAM" && s === "str" && e !== EXPS[0] ? "sep" : ""} ${isA ? "isA" : ""} ${isB ? "isB" : ""}`;
    const btns = `<button type="button" data-tk="${tk}" data-s="${s}" data-e="${e}" data-set="A"${isA ? " disabled" : ""} title="Set as A">A</button> <button type="button" data-tk="${tk}" data-s="${s}" data-e="${e}" data-set="B"${isA || isB ? " disabled" : ""} title="Set as B">B</button>`;
    if (b.na) { const fx = capFixFor({ ...st.A, tk, st: s, exp: e }, st.A, ""); h += `<tr class="${cls}"><td class="st">${btns}</td><td class="st2 l">${nm}<small>n/a: ${b.capNA.replace(/ \(raise.*\)/, "")}</small></td><td class="l" colspan="${cols.length}">${fx ? `<button class="btn fix" type="button" data-rowfix="${tk}|${s}|${e}">${fx.label.replace("Raise", "Raise A's").replace("Lower", "Lower A's")}</button>` : ""}</td></tr>`; continue; }
    const o = (k, v) => fOwn(v, b, OVM[k], true);
    const cash = b.intr > 0 ? ` <span class="muted">cash ${o("cr", b.cr / b.S)}</span>` : "";
    h += `<tr class="${cls}" title="${nm} · ${legTxt(b)} · $ per contract: credit $${(b.cr * 100).toFixed(0)}${b.intr > 0 ? `, time value $${(b.tv * 100).toFixed(0)}` : ""}, EV (HV30) $${b.na ? "–" : (statsHV(b).ev * 100).toFixed(0)}, worst $${(x.worst * 100).toFixed(0)}"><td class="st">${btns}</td><td class="st2 l">${nm}<small>${legTxt(b)}${b.capFb ? " · cap fallback" : ""}</small></td><td>${o("cr", b.tv / b.S)}${cash}</td><td>${fN(b.tv / (b.S * b.sig), 3)}</td><td>${o("crd", b.tv / b.S / b.dte)}</td><td>${o("ev", x.ev / b.S)}</td><td>${fP(x.pop, 0)}</td><td>${o("worst", x.worst / b.S)}</td><td>${b.cap ? o("capc", b.capPx / b.S) : "–"}</td><td>${b.cap ? fP(x.pCap, 1) : "–"}</td><td>${fP(b.tv / b.margin, 1)}</td><td>${x.beLo == null ? "none" : `${fPx2(x.beLo)} / ${x.beHi ? fPx2(x.beHi) : "none"}`}</td></tr>`;
  }
  $("#full").innerHTML = h + "</tbody>";
}



// ============================================================ payoff at expiry + comparison numbers
function sigmaMarks() {
  const out = [], { A, B } = C;
  for (const k of [-2, -1, 1, 2]) {
    const u = C.uOfSA(A.S * Math.exp(k * C.sA)); if (u > C.lo && u < C.hi) out.push([u, (k > 0 ? "+" : MINUS) + Math.abs(k) + "σ" + (C.same || C.unit === "sig" ? "" : " " + A.tk), "a"]);
    if (!C.same && C.unit !== "sig") { const v = C.uOfSB(B.S * Math.exp(k * C.sB)); if (v > C.lo && v < C.hi) out.push([v, (k > 0 ? "+" : MINUS) + Math.abs(k) + "σ " + B.tk, "b"]); }
  }
  return out;
}
function oddsStrip(svg, d, xOf, lo, hi, t, X, y0, h, label) {
  const nd = 160, dens = []; for (let i = 0; i < nd; i++) { const ua = lo + (hi - lo) * i / nd, ub = lo + (hi - lo) * (i + 1) / nd; dens.push([(ua + ub) / 2, cdfAt(d, xOf(ub), t) - cdfAt(d, xOf(ua), t)]); }
  const dm = Math.max(...dens.map(p => p[1]), 1e-9); let dd = `M${X(lo)} ${y0 + h}`; for (const [u, v] of dens) dd += `L${X(u).toFixed(1)} ${(y0 + h - v / dm * (h - 2)).toFixed(1)}`; dd += `L${X(hi)} ${y0 + h}Z`;
  el("path", { d: dd, fill: "var(--ink-3)", "fill-opacity": .3 }, svg); txt(svg, X(lo) - 6, y0 + h - 3, label, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
}
function renderPayoff() {
  const host = $("#pay"); host.innerHTML = "";
  const { A, B, lo, hi } = C, W = Math.max(host.clientWidth, 600), two = !C.same;
  const n = 600, us = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
  const kinks = [];
  for (const [b, inv] of [[A, C.uOfSA], [B, C.uOfSB]]) if (!b.na) for (const K of [b.sp.K, b.sc.K, b.cap && b.cap.K]) if (K) { const u = inv(K); if (u > lo && u < hi) kinks.push(u); }
  const ux = [...us, ...kinks].sort((p, q) => p - q);
  const a = ux.map(u => [u, pA(u)]), b = ux.map(u => [u, pB(u)]), df = ux.map(u => [u, pA(u) - pB(u)]);
  const ys = [...a, ...b].map(p => p[1]).filter(Number.isFinite);
  let ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0); const pad = (yhi - ylo) * 0.08 || 0.01; ylo -= pad; yhi += pad;
  const dys = df.map(p => p[1]).filter(Number.isFinite); let dlo = Math.min(...dys, 0), dhi = Math.max(...dys, 0); const dp = (dhi - dlo) * 0.14 || 0.005; dlo -= dp; dhi += dp;
  const H1 = 270, H2 = 92, nStrip = st.pso ? (two ? 2 : 1) : 0, H3 = nStrip * 22, gap = 14, m = { l: 62, r: 54, t: two && C.unit !== "sig" ? 28 : 16, b: two ? 52 : 40 };
  const y1 = m.t, y2 = y1 + H1 + gap, y3 = y2 + H2 + (H3 ? gap : 0), H = y3 + H3 + m.b;
  const X = u => m.l + (u - lo) / (hi - lo) * (W - m.l - m.r), Y = v => y1 + (yhi - v) / (yhi - ylo) * H1, Y2 = v => y2 + (dhi - v) / (dhi - dlo) * H2;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Payoff at expiry for A, B and the pair" }, host), ax = el("g", { class: "ax" }, svg);
  const t1 = ticks(ylo, yhi, 6), t2 = ticks(dlo, dhi, 3);
  for (const t of t1) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 6, Y(t) + 3.5, fUt(t, t1[1] - t1[0] || 0.01), { "text-anchor": "end" }); }
  for (const t of t2) { el("line", { x1: m.l, x2: W - m.r, y1: Y2(t), y2: Y2(t) }, ax); txt(ax, m.l - 6, Y2(t) + 3.5, fUt(t, t2[1] - t2[0] || 0.01), { "text-anchor": "end" }); }
  const yb = y3 + H3 + 14;
  for (const u of axisTicks(lo, hi, Math.floor(W / 85))) { const x = X(u), an = x - m.l < 18 ? "start" : W - m.r - x < 18 ? "end" : "middle"; el("line", { x1: x, x2: x, y1: y1, y2: y3 + H3 }, ax); txt(ax, x, yb, uLab(u, C.unit), { "text-anchor": an }); txt(ax, x, yb + 13, fPx(C.toSA(u)), { "text-anchor": an, style: "font-size:9.5px" }); if (two) txt(ax, x, yb + 26, fPx(C.toSB(u)), { "text-anchor": an, style: "font-size:9.5px" }); }
  txt(svg, m.l - 8, yb, "move", { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 }); txt(svg, m.l - 8, yb + 13, A.tk, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 }); if (two) txt(svg, m.l - 8, yb + 26, B.tk, { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
  el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg); el("line", { x1: m.l, x2: W - m.r, y1: Y2(0), y2: Y2(0), stroke: "var(--ink-3)" }, svg);
  if (st.pss) sigmaMarks().forEach(([u, l, who], k) => { el("line", { x1: X(u), x2: X(u), y1: y1, y2: y3 + H3, stroke: who === "b" ? "var(--b)" : "var(--ink-3)", "stroke-dasharray": "2 3", "stroke-opacity": who === "b" ? .7 : 1 }, svg); txt(svg, X(u), y1 - 4 - (who === "b" ? 12 : 0), l, { "text-anchor": "middle", fill: who === "b" ? "var(--b)" : "var(--ink-3)", "font-size": 10, ...halo }); });
  const z = Y2(0); let dPos = "", dNeg = "";
  for (let i = 0; i < df.length - 1; i++) { const [xa, va] = df[i], [xb, vb] = df[i + 1]; if (!Number.isFinite(va) || !Number.isFinite(vb)) continue; const s = `M${X(xa).toFixed(1)} ${z}L${X(xa).toFixed(1)} ${Y2(va).toFixed(1)}L${X(xb).toFixed(1)} ${Y2(vb).toFixed(1)}L${X(xb).toFixed(1)} ${z}Z`; if ((va + vb) / 2 >= 0) dPos += s; else dNeg += s; }
  el("path", { d: dPos, fill: "var(--pos)", "fill-opacity": .22 }, svg); el("path", { d: dNeg, fill: "var(--neg)", "fill-opacity": .22 }, svg);
  el("path", { d: pathOf(df, X, Y2), fill: "none", stroke: "var(--ink)", "stroke-width": 1.5 }, svg);
  if (nStrip) { oddsStrip(svg, C.d, xA, lo, hi, A.T, X, y3, 20, two ? `${A.tk} odds` : "odds"); if (two) oddsStrip(svg, C.dB, xB, lo, hi, B.T, X, y3 + 22, 20, `${B.tk} odds`); }
  el("path", { d: pathOf(b, X, Y), fill: "none", stroke: "var(--b)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
  el("path", { d: pathOf(a, X, Y), fill: "none", stroke: "var(--a)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
  // labels with a surface halo so lines never strike through them
  const dl = df.filter(p => Number.isFinite(p[1])), leftHigh = dl.length && dl[0][1] > (dlo + dhi) / 2;
  txt(svg, m.l + 6, leftHigh ? y2 + H2 - 6 : y2 + 13, `A − ${hTxt()}`, { fill: "var(--ink)", "font-size": 11.5, "font-weight": 600, ...halo });
  const endLab = (pts, s, col, other) => { const p = pts[pts.length - 1], q = other[other.length - 1]; if (!Number.isFinite(p[1])) return; const above = !Number.isFinite(q[1]) || p[1] >= q[1]; txt(svg, W - m.r + 5, Y(p[1]) + (above ? -2 : 10) + 4, s, { "text-anchor": "start", fill: `var(--${col})`, "font-size": 11.5, "font-weight": 600, ...halo }); };
  endLab(a, "A", "a", b); endLab(b, "B" + hb(), "b", a);
  const naSides = [["A", A], ["B", B]].filter(([, x]) => x.na);
  if (naSides.length) { const msg = naSides.map(([t, x]) => `${t} is n/a: ${x.capNA.replace(/ \(raise.*\)/, "")}`).join(" · "); const t = txt(svg, m.l + 10, y1 + 18, msg, { fill: "var(--neg)", "font-size": 12, "font-weight": 600, ...halo }); }
  $("#pay-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A ${pName(C.Ap, C.Bp)}</span> <span><i style="background:var(--b)"></i>B${hb()} ${pName(C.Bp, C.Ap)}</span>`;
  const cross = el("line", { y1: y1, y2: y3 + H3, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
  const dots = ["a", "b", "ink"].map(c => el("circle", { r: 4, fill: `var(--${c})`, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg));
  const hit = el("rect", { x: m.l, y: y1, width: W - m.l - m.r, height: y3 + H3 - y1, fill: "transparent" }, svg);
  hit.addEventListener("pointermove", ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, u = clamp(lo + (px - m.l) / (W - m.l - m.r) * (hi - lo), lo, hi);
    cross.setAttribute("x1", X(u)); cross.setAttribute("x2", X(u)); cross.setAttribute("visibility", "visible");
    const va = pA(u), vb = pB(u), vd = va - vb;
    [[va, Y], [vb, Y], [vd, Y2]].forEach(([v, f], i) => { if (Number.isFinite(v)) { dots[i].setAttribute("cx", X(u)); dots[i].setAttribute("cy", f(v)); dots[i].setAttribute("visibility", "visible"); } else dots[i].setAttribute("visibility", "hidden"); });
    showTip(`<span class="h">${uLab(u, C.unit, 2)} · ${A.tk} ${fPx2(C.toSA(u))} <span class="muted">${fS(C.toSA(u) / A.S - 1, 1)}</span></span>${C.same ? "" : `<span class="s">${B.tk} ${fPx2(C.toSB(u))} (${fS(C.toSB(u) / B.S - 1, 1)})</span>`}${trow("A", va, "a")}${trow("B" + hb(), vb, "b")}${trow("A − " + hTxt(), vd, "ink")}`, ev.clientX, ev.clientY);
  });
  hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dots.forEach(d => d.setAttribute("visibility", "hidden")); });
}
// pair worst loss over the worst-loss range when one price drives both (same ticker and expiry)
function pairWorst(a, b, h, toSa, toSb) {
  if (a.na || b.na) return NaN;
  const us = []; for (let i = 0; i <= 400; i++) us.push(C.wlo + (C.whi - C.wlo) * i / 400);
  for (const [p, inv] of [[a, C.uOfSA], [b, C.uOfSB]]) for (const K of [p.sp.K, p.sc.K, p.cap && p.cap.K]) if (K) { const u = inv(K); if (u > C.wlo && u < C.whi) us.push(u); }
  let w = Infinity; for (const u of us) w = Math.min(w, payoff(a, toSa(u)) / a.S - h * payoff(b, toSb(u)) / b.S); return w;
}
function pairPop() {
  const d = C.d, A = C.A, B = C.B; if (A.na || B.na) return NaN; let pop = 0;
  for (let i = 1; i <= d.n; i++) { const m = d.cdf[i] - d.cdf[i - 1]; if (m <= 0) continue; const S = A.S * Math.exp((d.u[i] + d.u[i - 1]) / 2), v = payoff(A, S) / A.S - C.h * payoff(B, S) / B.S; if (v > 0) pop += m; }
  return pop;
}
function renderCmp() {
  const { A, B, sa, sb, h } = C, nA = A.na, nB = B.na, rows = [];
  const a = (f, nn) => nn ? NaN : f, sB = v => v * h;
  const ratio = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) > 1e-12 ? fN(x / y, 2) + "×" : "–";
  const add = (label, va, vb, fmt, diff = true, rat = true, cls = "") => rows.push(`<tr class="${cls}"><td>${label}</td><td>${fmt(va)}</td><td>${fmt(vb)}</td><td>${diff && Number.isFinite(va) && Number.isFinite(vb) ? fmt(va - vb) : ""}</td><td>${rat ? ratio(va, vb) : ""}</td></tr>`);
  const pair = C.same && C.sameExp && !nA && !nB;
  if (!C.same) rows.push(`<tr class="note"><td colspan="5">No correlation between ${A.tk} and ${B.tk} is modelled, so the pair column only shows figures that add up. The joint-moves panel shows the pair across independent moves.</td></tr>`);
  else if (!C.sameExp) rows.push(`<tr class="note"><td colspan="5">A and B expire on different dates, so pair odds and pair worst loss at one expiry aren't defined. The pair column only shows figures that add up.</td></tr>`);
  for (const [t, x] of [["A", A], ["B", B]]) if (x.na) rows.push(`<tr class="note"><td colspan="5"><span class="key ${t.toLowerCase()}">${t}</span> is n/a: ${x.capNA.replace(/ \(raise.*\)/, "")}. The fix is in the header.</td></tr>`);
  rows.push(`<tr class="grp"><td>Legs</td><td class="legs">${nA ? "n/a" : legTxt(A)}</td><td class="legs">${nB ? "n/a" : legTxt(B)}</td><td></td><td></td></tr>`);
  // cash credit, with time value beside it where a leg is in the money; every ratio below uses time value
  const anyI = (!nA && A.intr > 0) || (!nB && B.intr > 0), tvC = anyI ? `<span class="cap">on time value</span>` : "";
  if (!anyI) add("Credit", a(A.cr / A.S, nA), a(sB(B.cr / B.S), nB), v => fU(v));
  else {
    const cv = (b, nn, k) => nn ? "–" : fU(k * b.cr / b.S) + (b.intr > 0 ? ` <span class="muted">· time value ${fU(k * b.tv / b.S)}</span>` : "");
    const ca = a(A.cr / A.S, nA), cb = a(sB(B.cr / B.S), nB), ta = a(A.tv / A.S, nA), tb = a(sB(B.tv / B.S), nB);
    rows.push(`<tr><td>Credit<span class="cap" title="Time value = cash credit − intrinsic value at entry">cash · time value</span></td><td>${cv(A, nA, 1)}</td><td>${cv(B, nB, h)}</td><td>${Number.isFinite(ca) && Number.isFinite(cb) ? fU(ca - cb) + ` <span class="muted">· ${fU(ta - tb)}</span>` : ""}</td><td>${Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(tb) > 1e-12 ? fN(ta / tb, 2) + "×" : "–"}</td></tr>`);
  }
  add(`Credit/σ<span class="cap">size-free</span>${tvC}`, a(A.tv / (A.S * A.sig), nA), a(B.tv / (B.S * B.sig), nB), v => fN(v, 3), false);
  add(`Credit per day${tvC}`, a(A.tv / A.S / A.dte, nA), a(sB(B.tv / B.S / B.dte), nB), v => fU(v, 3), true, true, "grp");
  add(`Expected value<span class="cap">${st.dist === "rn" ? "implied odds: fill vs mid, 0 at mid" : "HV30 odds"}</span>`, a(sa && sa.ev / A.S, nA), a(sb && sB(sb.ev / B.S), nB), v => fU(v, 2));
  rows.push(`<tr><td>Profit odds</td><td>${nA ? "–" : fP(sa.pop, 0)}</td><td>${nB ? "–" : fP(sb.pop, 0)}</td><td>${pair ? fP(pairPop(), 0) : ""}</td><td></td></tr>`);
  const sel = `<select data-wl aria-label="Worst-loss range"><option value="view"${st.wl === "view" ? " selected" : ""}>the view range</option><option value="own"${st.wl === "own" ? " selected" : ""}>its own range</option></select>`;
  const own = st.wl === "own" ? ` −<input type="number" data-wlo value="${+st.wlo.toFixed(2)}" step="${uStep(C.unit)}" min="0" style="width:56px"> to +<input type="number" data-whi value="${+st.whi.toFixed(2)}" step="${uStep(C.unit)}" min="0" style="width:56px"> ${UNAME[C.unit]}` : "";
  const pw = pair ? pairWorst(A, B, h, C.toSA, C.toSB) : NaN;
  rows.push(`<tr class="grp"><td>Worst loss within ${sel}${own}<span class="cap" style="display:block;margin:0">${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}: ${A.tk} ${fPx2(C.toSA(C.wlo))}–${fPx2(C.toSA(C.whi))}${C.same ? "" : `, ${B.tk} ${fPx2(C.toSB(C.wlo))}–${fPx2(C.toSB(C.whi))}`}</span></td><td>${nA ? "–" : fU(sa.worst / A.S)}</td><td>${nB ? "–" : fU(sB(sb.worst / B.S))}</td><td>${pair ? fU(pw) : ""}</td><td>${nA || nB ? "" : ratio(sa.worst / A.S, sB(sb.worst / B.S))}</td></tr>`);
  add("Vega per vol point", a(A.vega / 100 / A.S, nA), a(sB(B.vega / 100 / B.S), nB), v => fU(v, 2));
  add(`Margin<span class="cap">approx.: 20% × leverage, Reg-T style</span>`, a(A.margin / A.S, nA), a(sB(B.margin / B.S), nB), v => fU(v).replace("+", ""), false);
  add(`Credit / margin${tvC}`, a(A.tv / A.margin, nA), a(B.tv / B.margin, nB), v => fP(v, 1), false, true, "grp");
  const be = (b, s) => b.na ? "–" : s.beLo == null ? "none" : `${fPx2(s.beLo)} / ${s.beHi ? fPx2(s.beHi) : "none"}`;
  rows.push(`<tr><td>Breakevens</td><td>${be(A, sa)}</td><td>${be(B, sb)}</td><td></td><td></td></tr>`);
  if (A.cap || B.cap) {
    add("Cap cost", A.cap ? A.capPx / A.S : NaN, B.cap ? sB(B.capPx / B.S) : NaN, v => fU(v));
    const cb = (b, s) => b.cap ? `${fPx2(s.capBE)} · ${fP(s.pCap, 1)}` : "–";
    rows.push(`<tr><td>Cap pays above · odds<span class="cap">spot where the cap has paid for itself</span></td><td>${cb(A, sa)}</td><td>${cb(B, sb)}</td><td></td><td></td></tr>`);
  }
  $("#cmp").innerHTML = `<thead><tr><th></th><th><span class="key a">A</span></th><th><span class="key b">B${hb()}</span></th><th><span class="key d">A − ${hTxt()}</span></th><th>A / B</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

// ============================================================ P&L through time (move across, time down)
const GRID = { cells: {}, data: null, hov: null };
function gridRows() {
  const { A, B } = C;
  if (C.cal) { const Hd = C.Hd, n = Math.min(Hd, 100); return Array.from({ length: n + 1 }, (_, i) => { const d = Hd * i / n; return { d, dA: Math.min(d, A.dte), dB: Math.min(d, B.dte), tA: d / 365, tB: d / 365 }; }); }
  const n = Math.min(Math.max(A.dte, B.dte), 100);
  return Array.from({ length: n + 1 }, (_, i) => { const f = i / n; return { f, dA: f * A.dte, dB: f * B.dte, tA: f * A.T, tB: f * B.T }; });
}
function gridData(nX) {
  const { A, B, lo, hi } = C, rows = gridRows(), nT = rows.length;
  const us = Array.from({ length: nX }, (_, i) => lo + (hi - lo) * i / (nX - 1));
  const Z = { A: [], B: [], D: [] };
  for (let r = 0; r < nT; r++) {
    const ra = new Float64Array(nX), rb = new Float64Array(nX), rd = new Float64Array(nX), w = rows[r];
    for (let i = 0; i < nX; i++) { ra[i] = vA(us[i], (A.dte - w.dA) / 365); rb[i] = vB(us[i], (B.dte - w.dB) / 365); rd[i] = ra[i] - rb[i]; }
    Z.A.push(ra); Z.B.push(rb); Z.D.push(rd);
  }
  // each grid uses its own underlying's odds: B on B's ticker and clock, A and the pair on A's
  const tOf = { A: w => w.tA, B: w => w.tB, D: w => w.tA }, distOf = { A: C.d, B: C.dB, D: C.d }, xOf = { A: xA, B: xB, D: xA }, mass = {};
  for (const g of ["A", "B", "D"]) { const xe = Array.from({ length: nX + 1 }, (_, i) => xOf[g](lo + (hi - lo) * (i - 0.5) / (nX - 1))); mass[g] = rows.map(w => { const t = tOf[g](w), rm = new Float64Array(nX); for (let i = 0; i < nX; i++) rm[i] = cdfAt(distOf[g], xe[i + 1], t) - cdfAt(distOf[g], xe[i], t); return rm; }); }
  return { rows, nT, nX, us, Z, mass, tOf };
}
function setupGrid() {
  const host = $("#gwrap"); if (host.children.length) return;
  host.insertAdjacentHTML("beforeend", `<span class="gut"><span class="gh"></span><canvas aria-hidden="true"></canvas></span>`);
  GRID.gut = host.querySelector(".gut canvas");
  for (const g of ["A", "B", "D"]) {
    host.insertAdjacentHTML("beforeend", `<span class="gcell" data-g="${g}"><span class="gh"></span><span class="gc"><canvas class="hm"></canvas><canvas class="ov"></canvas></span><span class="gna" hidden></span></span>`);
    const cell = host.lastElementChild, ov = cell.querySelector("canvas.ov");
    const hov = ev => { const h = gridHit(g, ev); GRID.hov = h; drawOverlays(); if (h) gridTip(h, ev.clientX, ev.clientY); else hideTip(); };
    ov.addEventListener("pointermove", hov);
    ov.addEventListener("click", ev => { const h = gridHit(g, ev); if (!h) return; addPin(g, h); });
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
const rowDay = (w, g) => C.cal ? w.d : g === "B" ? w.dB : w.dA;
function rowTxt(w) {
  if (C.cal) return `day ${Math.round(w.d)}` + (w.d > C.A.dte ? " · A expired" : w.d > C.B.dte ? " · B expired" : "");
  return C.sameExp ? `day ${w.dA.toFixed(0)}` : `${Math.round(w.f * 100)}% of life · A day ${w.dA.toFixed(0)}, B day ${w.dB.toFixed(0)}`;
}
function gridTip(h, cx, cy) {
  const G = GRID.data, w = G.rows[h.r], u = G.us[h.i], { A, B } = C, pm = G.mass[h.g][h.r][h.i];
  showTip(`<span class="h">${uLab(u, C.unit, 2)} · ${A.tk} ${fPx2(C.toSA(u))} <span class="muted">${fS(C.toSA(u) / A.S - 1, 1)}</span></span>${C.same ? "" : `<span class="s">${B.tk} ${fPx2(C.toSB(u))} (${fS(C.toSB(u) / B.S - 1, 1)})</span>`}<span class="s">${rowTxt(w)}</span>${trow("A", G.Z.A[h.r][h.i], "a")}${trow("B" + hb(), G.Z.B[h.r][h.i], "b")}${trow("A − " + hTxt(), G.Z.D[h.r][h.i], "ink")}<span class="s" style="margin:4px 0 0">${h.g === "B" ? B.tk : A.tk} column odds ${fP(pm, 2)}${st.gval === "contrib" ? ` · weighted ${fU(G.Z[h.g][h.r][h.i] * pm, 3)}` : ""} · click to pin</span>`, cx, cy);
}
function colorFn(L) {
  const MID = rgb(css("--mid")), POS = rgb(css("--pos")), NEG = rgb(css("--neg")), soft = L / 7;
  return v => { const a = Math.min(Math.abs(v), L); const t = st.cs === "lin" ? a / L : Math.asinh(a / soft) / Math.asinh(L / soft); return mix(MID, v >= 0 ? POS : NEG, t); };
}
const shockOn = () => st.ivs !== 0 || st.svs > 0;
const shockTxt = () => [st.ivs ? `IV ${st.ivs > 0 ? "+" : MINUS}${Math.abs(st.ivs)}` : "", st.svs ? `+${st.svs}/−10%${st.svd ? " down" : ""}` : ""].filter(Boolean).join(" · ");
const GH = 330;
function gridGeo(W) { const o = { l: 4, r: 8, t: 4, b: 30 + (st.ovo ? 8 : 0) + (C.same ? 0 : 11) }; o.pw = W - o.l - o.r; o.ph = GH - o.t - o.b; return o; }
function renderGrid() {
  setupGrid();
  const host = $("#gwrap"), num = st.gview === "num";
  $("#alignCtl").hidden = C.sameExp;
  $("#c-gtab").hidden = !num; host.hidden = num; $("#numwrap").hidden = !num;
  $("#shockSum").innerHTML = shockOn() ? `Shocks <span class="chip">${shockTxt()}</span>` : "Shocks";
  $("#c-cts").hidden = st.ct !== "lev"; $("#crxW").hidden = st.cr !== "fix";
  $("#gInfo").dataset.tip = `Across: the move range from the header (${uLab(C.lo, C.unit)} to ${uLab(C.hi, C.unit)}${C.same ? "" : `, ${C.B.tk} moving ${C.unit === "sig" ? "the same number of its own σ" : "the same %"}`}). Down: ${C.cal ? "calendar days from today" : C.sameExp ? "days from today" : "share of each position's life"}, today at the top. Colour: ${st.gval === "contrib" ? "P&L × the odds of that column on that grid's own ticker, so a row sums to the expected mark" : "mark-to-model P&L, with each leg's vol pinned to its traded mid at entry"}. The contour line is break-even. The colour scale runs to the largest |value|. Click a cell to pin it.`;
  const nX = 120, G = GRID.data = gridData(nX);
  if (num) { renderNumbers(); $("#gfoot").innerHTML = shockOn() ? `<span class="chip" style="margin-left:0">shocks: ${shockTxt()}</span>` : ""; return; }
  const V = {};
  for (const g of ["A", "B", "D"]) V[g] = st.gval === "contrib" ? G.Z[g].map((r, j) => r.map((v, i) => v * G.mass[g][j][i])) : G.Z[g];
  const maxAbs = g => { let m = 0; for (const r of V[g]) for (const v of r) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v)); return Math.max(m, 1e-6); };
  const lim = {};
  if (st.cr === "fix" && st.gval === "pnl") for (const g of ["A", "B", "D"]) lim[g] = Math.max(st.crx / 100, 1e-4);
  else if (st.shared) { const L = Math.max(maxAbs("A"), maxAbs("B"), maxAbs("D")); lim.A = lim.B = lim.D = L; }
  else for (const g of ["A", "B", "D"]) lim[g] = maxAbs(g);
  let geo0 = null;
  for (const g of ["A", "B", "D"]) {
    const c = GRID.cells[g]; c.geo = null;
    const bad = (g === "A" && C.A.na) || (g === "B" && C.B.na) || (g === "D" && (C.A.na || C.B.na));
    c.gh.innerHTML = (g === "A" ? `<span class="key a">A</span><span class="t">${pName(C.Ap, C.Bp)}</span>` : g === "B" ? `<span class="key b">B${hb()}</span><span class="t">${pName(C.Bp, C.Ap)}</span>` : `<span class="key d">A − ${hTxt()}</span><span class="t">the pair</span>`) + (!st.shared || st.cr === "fix" ? `<span class="rng2">±${fU(lim[g]).replace("+", "")}</span>` : "");
    c.gc.hidden = bad; c.na.hidden = !bad;
    if (bad) { c.na.textContent = `n/a: ${(C.A.na ? C.A : C.B).capNA.replace(/ \(raise.*\)/, "")}`; continue; }
    drawHeat(g, c, V[g], lim[g]); geo0 = geo0 || c.geo;
  }
  drawGutter(geo0);
  drawOverlays();
  const L = lim.A, MID = rgb(css("--mid")), POS = rgb(css("--pos")), NEG = rgb(css("--neg"));
  $("#gfoot").innerHTML = (st.shared || st.cr === "fix" ? `<span>${fU(-L)}<span class="bar" style="background:linear-gradient(90deg,rgb(${NEG}),rgb(${MID}),rgb(${POS}))"></span>${fU(L)}</span> ` : "") +
    `<span>${st.gval === "contrib" ? "P&L × column odds" : "P&L"}${st.cs === "comp" ? ", compressed" : ""}${st.cr === "fix" ? ", fixed range" : ", full range"}</span> <span>contour line = break-even</span> <span>today at the top</span> ${st.ovo ? `<span>bottom strip = odds at the last row</span>` : ""} ${shockOn() ? `<span class="chip" style="margin-left:0">shocks: ${shockTxt()}</span>` : ""}`;
}
function yTicks() {
  const n = GRID.data.nT - 1;
  if (C.cal) return ticks(0, C.Hd, 5).map(d => [d / C.Hd * n, d + "d"]);
  if (C.sameExp) return ticks(0, C.A.dte, 5).map(d => [d / C.A.dte * n, d + "d"]);
  return ticks(0, 100, 4).map(p => [p / 100 * n, p + "%"]);
}
function drawGutter(o) {
  const cv = GRID.gut, W = 34, dpr = window.devicePixelRatio || 1;
  cv.hidden = !o; if (!o) return;
  cv.width = W * dpr; cv.height = GH * dpr; cv.style.width = W + "px"; cv.style.height = GH + "px";
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, GH);
  ctx.fillStyle = css("--ink-3"); ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.textAlign = "right";
  const ch = o.ph / GRID.data.nT;
  for (const [r, s] of yTicks()) ctx.fillText(s, W - 2, Math.min(Math.max(o.t + (r + .5) * ch + 3.5, o.t + 9), o.t + o.ph));
  if (!C.same) { const y0 = o.t + o.ph + 4 + (st.ovo ? 8 : 0); ctx.font = "9px 'IBM Plex Sans Condensed', sans-serif"; ctx.fillText(C.A.tk, W - 2, y0 + 20); ctx.fillText(C.B.tk, W - 2, y0 + 31); ctx.fillText("move", W - 2, y0 + 9); }
}
function drawHeat(g, c, V, L) {
  const G = GRID.data, W = c.gc.clientWidth || 300, H = GH, dpr = window.devicePixelRatio || 1;
  const o = gridGeo(W); o.cw = o.pw / G.nX; o.ch = o.ph / G.nT; c.geo = o;
  for (const cv of [c.hm, c.ov]) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; }
  const ctx = c.hm.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const off = document.createElement("canvas"); off.width = G.nX; off.height = G.nT;
  const oc = off.getContext("2d"), img = oc.createImageData(G.nX, G.nT), col = colorFn(L), SURF = rgb(css("--surface"));
  for (let r = 0; r < G.nT; r++) for (let i = 0; i < G.nX; i++) { const v = V[r][i], cc = Number.isFinite(v) ? col(v) : SURF, k = (r * G.nX + i) * 4; img.data[k] = cc[0]; img.data[k + 1] = cc[1]; img.data[k + 2] = cc[2]; img.data[k + 3] = 255; }
  oc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, o.l, o.t, o.pw, o.ph);
  const X = i => o.l + (i + 0.5) * o.cw, Y = r => o.t + (r + 0.5) * o.ch, XU = u => o.l + o.cw / 2 + (u - C.lo) / (C.hi - C.lo) * (o.pw - o.cw);
  const ink = css("--ink"), ink2 = css("--ink-2"), ink3 = css("--ink-3"), xt = axisTicks(C.lo, C.hi, Math.floor(o.pw / 64)).filter((u, k, a) => k === 0 || k === a.length - 1 || Math.min(Math.abs(u - C.lo), Math.abs(C.hi - u)) / (C.hi - C.lo) * o.pw > 40), yt = yTicks();
  ctx.save(); ctx.beginPath(); ctx.rect(o.l, o.t, o.pw, o.ph); ctx.clip();
  if (st.gl) { ctx.strokeStyle = ink3; ctx.globalAlpha = .4; ctx.lineWidth = 1; ctx.beginPath(); for (const u of xt) { ctx.moveTo(XU(u), o.t); ctx.lineTo(XU(u), o.t + o.ph); } for (const [r] of yt) { ctx.moveTo(o.l, Y(r)); ctx.lineTo(o.l + o.pw, Y(r)); } ctx.stroke(); ctx.globalAlpha = 1; }
  const Z = G.Z[g];
  if (st.ct === "lev") { ctx.strokeStyle = ink2; ctx.lineWidth = .8; ctx.globalAlpha = .7; const step = st.cts / 100; let mx = 0; for (const r of Z) for (const v of r) if (Number.isFinite(v)) mx = Math.max(mx, Math.abs(v)); for (let k = -Math.floor(mx / step); k <= Math.floor(mx / step); k++) if (k) contour(ctx, Z, k * step, X, Y); ctx.globalAlpha = 1; }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.4; contour(ctx, Z, 0, X, Y);
  ctx.lineWidth = 1; ctx.font = "10px 'IBM Plex Sans Condensed', sans-serif";
  if (st.ovs) { ctx.strokeStyle = ink2; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(XU(0), o.t); ctx.lineTo(XU(0), o.t + o.ph); ctx.stroke(); ctx.globalAlpha = 1; }
  if (st.ovc) {
    const isB = g === "B", atm = isB ? C.B.E.atm : C.A.E.atm, S0 = isB ? C.B.S : C.A.S, inv = isB ? C.uOfSB : C.uOfSA; ctx.setLineDash([2, 3]); ctx.strokeStyle = ink2;
    for (const k of [-2, -1, 1, 2]) { ctx.beginPath(); let pen = false; G.rows.forEach((w, r) => { const u = inv(S0 * Math.exp(k * atm * Math.sqrt(G.tOf[g](w)))); if (u < C.lo || u > C.hi) { pen = false; return; } pen ? ctx.lineTo(XU(u), Y(r)) : ctx.moveTo(XU(u), Y(r)); pen = true; }); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  const lines = [], addLegs = (b, inv, colVar, tag) => { if (b.na) return; for (const [K, l] of [[b.sp.K, "P"], [b.sc.K, "C"], [b.cap && b.cap.K, " cap"]]) if (K) lines.push({ u: inv(K), l: `${tag}${fK(K)}${l}`, col: colVar }); };
  if (st.ovk) { if (g !== "B") addLegs(C.A, C.uOfSA, "--a", g === "D" ? "A " : ""); if (g !== "A") addLegs(C.B, C.uOfSB, "--b", g === "D" ? "B " : ""); }
  if (st.ovb) for (const [b, s, inv, colVar] of [[C.A, C.sa, C.uOfSA, "--a"], [C.B, C.sb, C.uOfSB, "--b"]]) { if (!s || (g === "A" && b === C.B) || (g === "B" && b === C.A)) continue; for (const be of [s.beLo, s.beHi]) if (be > 0) lines.push({ u: inv(be), l: "BE", col: colVar, be: true }); }
  const placed = [];
  lines.sort((p, q) => p.u - q.u);
  for (const L2 of lines) {
    const x = XU(L2.u); if (x < o.l || x > o.l + o.pw) continue;
    ctx.strokeStyle = css(L2.col); ctx.setLineDash(L2.be ? [1, 3] : [5, 3]); ctx.beginPath(); ctx.moveTo(x, o.t); ctx.lineTo(x, o.t + o.ph); ctx.stroke();
    const tw = ctx.measureText(L2.l).width, left = x + tw + 8 > o.l + o.pw, lx = left ? x - tw - 6 : x + 2; let ly = o.t + 3; while (placed.some(p => Math.abs(p.x - lx) < tw + 6 && p.y === ly)) ly += 13; placed.push({ x: lx, y: ly });
    ctx.setLineDash([]); ctx.fillStyle = css("--surface"); ctx.globalAlpha = .85; ctx.fillRect(lx, ly, tw + 4, 11); ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textAlign = "left"; ctx.fillText(L2.l, lx + 2, ly + 9);
  }
  ctx.setLineDash([]); ctx.restore();
  let yAx = o.t + o.ph + 4;
  if (st.ovo) { let mm = 0; const ms = G.mass[g][G.nT - 1]; for (const m of ms) mm = Math.max(mm, m); for (let i = 0; i < G.nX; i++) { ctx.fillStyle = ink3; ctx.globalAlpha = .1 + .8 * ms[i] / (mm || 1); ctx.fillRect(o.l + i * o.cw, yAx, Math.ceil(o.cw), 4); } ctx.globalAlpha = 1; yAx += 8; }
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
// pins are stored as a price on each ticker plus a calendar day, so they keep their scenario when A, B or the unit change
function addPin(g, h) {
  const G = GRID.data, u = G.us[h.i], w = G.rows[h.r];
  st.pins.push({ S: { RAM: +C.ax.toS("RAM")(u).toFixed(4), KORU: +C.ax.toS("KORU")(u).toFixed(4) }, dA: +w.dA.toFixed(3), dB: +w.dB.toFixed(3) });
  if (st.pins.length > 12) st.pins.shift(); refresh();
}
function pinVals(p) {
  const { A, B } = C, SA = p.S[A.tk], SB = p.S[B.tk];
  return { SA, SB, a: val(A, SA, Math.max(0, A.dte - p.dA) / 365) / A.S, b: C.h * val(B, SB, Math.max(0, B.dte - p.dB) / 365) / B.S };
}
function drawOverlays() {
  const G = GRID.data; if (!G) return;
  const ink = css("--ink"), surf = css("--surface");
  for (const g of ["A", "B", "D"]) {
    const c = GRID.cells[g]; if (!c || !c.geo) continue;
    const o = c.geo, dpr = window.devicePixelRatio || 1, ctx = c.ov.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, c.ov.width, c.ov.height);
    st.pins.forEach((p, k) => {
      const u = g === "B" ? C.uOfSB(p.S[C.B.tk]) : C.uOfSA(p.S[C.A.tk]); if (!(u >= C.lo && u <= C.hi)) return;
      const dd = g === "B" ? p.dB : p.dA, span = C.cal ? C.Hd : g === "B" ? C.B.dte : C.A.dte; if (dd > span) return;
      const x = o.l + o.cw / 2 + (u - C.lo) / (C.hi - C.lo) * (o.pw - o.cw), y = o.t + (dd / span * (G.nT - 1) + .5) * o.ch;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke();
      ctx.fillStyle = ink; ctx.font = "600 9px 'IBM Plex Sans Condensed', sans-serif"; ctx.textAlign = "center"; ctx.fillText(k + 1, x, y + 3);
    });
    const h = GRID.hov; if (!h) continue;
    const x = o.l + (h.i + .5) * o.cw, y = o.t + (h.r + .5) * o.ch;
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(o.l, y); ctx.lineTo(o.l + o.pw, y); ctx.moveTo(x, o.t); ctx.lineTo(x, o.t + o.ph); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5; ctx.strokeRect(x - Math.max(o.cw, 4) / 2, y - Math.max(o.ch, 4) / 2, Math.max(o.cw, 4), Math.max(o.ch, 4));
  }
}
function renderNumbers() {
  const { A, B } = C, g = st.gtab;
  if ((g === "A" && A.na) || (g === "B" && B.na) || (g === "D" && (A.na || B.na))) { $("#ntab").innerHTML = `<tr><td>n/a: ${(A.na ? A : B).capNA.replace(/ \(raise.*\)/, "")}</td></tr>`; GRID.csv = ""; return; }
  const n = st.nm, cols = Array.from({ length: n }, (_, i) => C.lo + (C.hi - C.lo) * i / (n - 1)), days = [], Hd = C.cal ? C.Hd : A.dte;
  for (let d = 0; d < Hd; d += st.nd) days.push(d); days.push(Hd);
  const cell = (u, d) => { const dA = C.cal ? Math.min(d, A.dte) : d, dB = C.cal ? Math.min(d, B.dte) : d / A.dte * B.dte, a = vA(u, (A.dte - dA) / 365), b = vB(u, (B.dte - dB) / 365); return g === "A" ? a : g === "B" ? b : a - b; };
  const pxRows = g === "B" ? [[B.tk, C.toSB]] : g === "D" && !C.same ? [[A.tk, C.toSA], [B.tk, C.toSB]] : [[A.tk, C.toSA]];
  $("#ntab").innerHTML = `<thead><tr><th>${C.cal ? "Day" : "A day"}</th>${cols.map(u => `<th>${uLab(u, C.unit)}${pxRows.map(([tk, f]) => `<small>${pxRows.length > 1 ? tk + " " : ""}${fPx2(f(u))}</small>`).join("")}</th>`).join("")}</tr></thead><tbody>${days.map(d => `<tr><td>${d}</td>${cols.map(u => { const v = cell(u, d); return `<td class="${v < 0 ? "neg" : v > 0 ? "pos" : ""}">${fU(v, 2)}</td>`; }).join("")}</tr>`).join("")}</tbody>`;
  const conv = v => st.units === "usd" ? (v * A.S * 100).toFixed(2) : st.units === "cr" ? (v / (A.tv / A.S)).toFixed(4) : (v * 100).toFixed(4);
  const name = g === "A" ? `A: ${pName(C.Ap, C.Bp)} (${legTxt(A)})` : g === "B" ? `B: ${pName(C.Bp, C.Ap)} (${legTxt(B)}) x h=${C.h.toFixed(3)}` : `Pair A - ${C.h.toFixed(3)}*B: A ${pName(C.Ap, C.Bp)} (${legTxt(A)}); B ${pName(C.Bp, C.Ap)} (${legTxt(B)})`;
  GRID.csv = [`# ${name}`, `# values: ${unitName()}; mark-to-model before expiry, payoff at expiry; move unit ${UNAME[C.unit]}${shockOn() ? "; shocks " + shockTxt() : ""}`,
    [C.cal ? "day" : "A day", ...cols.map(u => uLab(u, C.unit).replace(MINUS, "-"))].join(","),
    ...pxRows.map(([tk, f]) => [`${tk} price`, ...cols.map(u => fPx2(f(u)))].join(",")),
    ...days.map(d => [d, ...cols.map(u => conv(cell(u, d)))].join(","))].join("\n");
}
function renderPins() {
  const host = $("#pins");
  if (!st.pins.length || !GRID.data) { host.innerHTML = ""; return; }
  const { A, B } = C, cl = v => v < 0 ? "neg" : v > 0 ? "pos" : "";
  let h = `<table><thead><tr><th>Pin</th><th>Scenario</th><th>When</th><th><span class="key a">A</span></th><th><span class="key b">B${hb()}</span></th><th><span class="key d">A − ${hTxt()}</span></th><th></th></tr></thead><tbody>`;
  st.pins.forEach((p, k) => {
    const v = pinVals(p), out = !(C.uOfSA(v.SA) >= C.lo && C.uOfSA(v.SA) <= C.hi);
    h += `<tr><td>${k + 1}</td><td>${A.tk} ${fPx2(v.SA)} ${fS(v.SA / A.S - 1, 1)}${C.same ? "" : ` · ${B.tk} ${fPx2(v.SB)} ${fS(v.SB / B.S - 1, 1)}`}${out ? ' <span class="badge">outside the range</span>' : ""}</td><td>${Math.abs(p.dA - p.dB) < 0.05 ? `day ${+p.dA.toFixed(1)}` : `A day ${+p.dA.toFixed(1)}, B day ${+p.dB.toFixed(1)}`}${p.dA >= A.dte ? " · A at expiry" : ""}${p.dB >= B.dte && !(C.same && B.dte === A.dte) ? " · B at expiry" : ""}</td><td class="${cl(v.a)}">${fU(v.a)}</td><td class="${cl(v.b)}">${fU(v.b)}</td><td class="${cl(v.a - v.b)}">${fU(v.a - v.b)}</td><td><button type="button" class="x" data-k="${k}" aria-label="Remove pin ${k + 1}">×</button></td></tr>`;
  });
  host.innerHTML = h + `</tbody></table><span class="cap" style="display:block;margin-top:6px">Pins keep their prices and calendar day while you change A, B, the unit or the range. <button type="button" class="btn" id="pinclr">Clear pins</button></span>`;
}

// ============================================================ joint moves (two tickers)
function renderJoint() {
  const P = $("#p-joint"), { A, B } = C;
  if (C.same) { P.className = "panel slim"; P.innerHTML = `<h2>Joint moves</h2><span class="sub">Only for two tickers: set “B differs in” to Ticker at the top.</span><button class="btn" type="button" id="jgo">Compare ${A.tk} with ${A.tk === "RAM" ? "KORU" : "RAM"}</button>`; return; }
  P.className = "panel";
  const maxD = Math.min(A.dte, B.dte), day = st.jday < 0 || st.jday > maxD ? maxD : st.jday;
  if (!P.querySelector("#c-jday")) P.innerHTML = `<div class="ph"><h2>Joint moves</h2><span class="sub" id="j-note"></span><span class="tools"><span class="ctl" style="margin-right:0"><span class="lbl">Day</span><input type="range" id="c-jday" min="0" max="50" step="1" style="width:160px" aria-label="Day"> <output id="o-jday"></output></span></span></div><div id="joint"></div>`;
  const ji = $("#c-jday"); ji.max = maxD; if (document.activeElement !== ji) ji.value = day;
  $("#o-jday").textContent = `day ${day}` + (day === maxD ? ` (${A.dte === maxD ? "A" : "B"} expiry)` : "");
  $("#j-note").innerHTML = `A − ${hTxt()} when ${A.tk} and ${B.tk} move independently, both axes over the move range${shockOn() ? ` <span class="chip">shocks: ${shockTxt()}</span>` : ""}`;
  const host = $("#joint");
  if (A.na || B.na) { host.innerHTML = `<span class="gna">n/a: ${(A.na ? A : B).capNA.replace(/ \(raise.*\)/, "")}</span>`; return; }
  const { lo, hi } = C, W = 520, Hh = 470, o = { l: 70, r: 10, t: 8, b: 44 }, pw = W - o.l - o.r, ph = Hh - o.t - o.b, n = 90;
  host.innerHTML = `<div class="joint"><span class="gc" style="width:${W}px"><canvas></canvas><canvas class="ov"></canvas></span><span class="jside" id="jside" style="display:block"></span></div>`;
  const cv = host.querySelector("canvas"), ov = host.querySelector("canvas.ov"), dpr = window.devicePixelRatio || 1;
  for (const c of [cv, ov]) { c.width = W * dpr; c.height = Hh * dpr; c.style.width = W + "px"; c.style.height = Hh + "px"; }
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tauA = (A.dte - day) / 365, tauB = (B.dte - day) / 365, us = Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
  const fa = u => val(A, C.toSA(u), tauA) / A.S, fb = u => C.h * val(B, C.toSB(u), tauB) / B.S;
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
  const sB0 = C.B.E.atm * Math.sqrt(C.B.T), sA0 = C.A.E.atm * Math.sqrt(C.A.T);
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
  // worst on the assumed line, evaluated densely and at every strike kink
  const lu = []; for (let i = 0; i <= 1200; i++) lu.push(lo + (hi - lo) * i / 1200);
  for (const [b, inv] of [[A, C.uOfSA], [B, C.uOfSB]]) for (const K of [b.sp.K, b.sc.K, b.cap && b.cap.K]) if (K) { const u = inv(K); if (u > lo && u < hi) lu.push(u); }
  let minLine = Infinity; for (const u of lu) minLine = Math.min(minLine, fa(u) - fb(u));
  let minAll = Infinity; for (const r of Z) for (const v of r) minAll = Math.min(minAll, v);
  $("#jside").innerHTML = `<p class="big">Worst cell <b class="num neg">${fU(minAll)}</b><br>Worst on the assumed ${curLab} line <b class="num ${minLine < 0 ? "neg" : "pos"}">${fU(minLine)}</b></p>
  <p>Each cell values the pair on day ${day} for one ${A.tk} move (across) and one ${B.tk} move (up), both over ${uLab(lo, C.unit)} to ${uLab(hi, C.unit)}${C.unit === "sig" ? ", each in its own σ" : ""}. The colour scale runs to the largest |value|.</p>
  <p>The solid diagonal is the path the payoff and grid panels assume; the dashed curve is the ${altLab} alternative. Anything off the diagonal is risk those panels can't show. Correlation is not modelled, so this shows outcomes, not their odds.</p>`;
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

// ============================================================ strike sweep (A, B and the pair)
// the sweep always prices EV with HV30 odds: under implied odds EV is fill vs mid, which is flat across strikes
function statsHV(b) { const d0 = st.dist; st.dist = "hv"; try { return statsBase(b); } finally { st.dist = d0; } }
function renderSweep() {
  const host = $("#sweep"); host.innerHTML = "";
  const v = st.sweep, isCap = v === "capd", lo = isCap ? 3 : 5, hi = isCap ? 40 : DMAX;
  const pairOK = C.same && C.sameExp;
  // credit is time value here: past 50 the cash credit is mostly intrinsic
  const run = (P, scale, toS) => { const out = []; for (let x = lo; x <= hi; x += 1) { const Q = { ...P }; if (v === "both") { Q.pd = x; Q.cd = x; } else Q[v] = x; const b = build(Q), s = statsHV(b), k = scale / b.S; out.push({ x, b, cr: b.na ? NaN : b.tv * k, ev: s ? s.ev * k : NaN, worst: s ? worstIn(b, toS(C.wlo), toS(C.whi)) * k : NaN }); } return out; };
  const Pa = st.A, Pb = C.Bp, sa = run(Pa, 1, C.toSA), sb = run(Pb, C.h, C.toSB), cur = P => v === "both" ? (P.pd + P.cd) / 2 : P[v];
  const sd = sa.map((p, i) => ({ x: p.x, cr: p.cr - sb[i].cr, ev: p.ev - sb[i].ev, worst: pairOK ? pairWorst(p.b, sb[i].b, C.h, C.toSA, C.toSB) : NaN }));
  const anyI = [...sa, ...sb].some(p => !p.b.na && p.b.intr > 0);
  $("#sw-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A</span> <span><i style="background:var(--b)"></i>B${hb()}</span> <span><i style="background:var(--ink);height:1.5px"></i>A − ${hTxt()}${pairOK ? "" : " (worst loss needs one ticker and expiry)"}</span>`;
  for (const [k, label] of [["cr", anyI ? "Credit, time value" : "Credit"], ["ev", "Expected value · HV30 odds"], ["worst", `Worst loss, ${uLab(C.wlo, C.unit)} to ${uLab(C.whi, C.unit)}`]]) {
    const box = document.createElement("span"); box.className = "sw"; box.style.display = "block"; box.innerHTML = `<h3>${label}${k === "cr" && anyI ? `<span class="info" tabindex="0" data-tip="Credit minus intrinsic value at entry. Out of the money it is the whole credit; in the money the cash credit also returns intrinsic value you pay back at expiry.">i</span>` : ""}</h3>`; host.appendChild(box);
    const W = Math.max(box.clientWidth, 220), H = 170, m = { l: 52, r: 16, t: isCap ? 8 : 18, b: 24 };   // Δ sweeps: room above the plot for the region label
    const ys = [...sa, ...sb, ...sd].map(p => p[k]).filter(Number.isFinite);
    if (!ys.length) { box.insertAdjacentHTML("beforeend", `<span class="gna">n/a for every value</span>`); continue; }
    let ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0); const pad = (yhi - ylo) * .08 || .005; ylo -= pad; yhi += pad;
    // Δ sweeps put ATM mid-axis: 5 to 50 on the left half, 50 to 90 on the right
    const pw = W - m.l - m.r, X = isCap ? x => m.l + (x - lo) / (hi - lo) * pw : x => m.l + (x <= 50 ? (x - lo) / (50 - lo) : 1 + (x - 50) / (hi - 50)) * pw / 2;
    const xOfPx = px => { const f = (px - m.l) / pw; return isCap ? lo + f * (hi - lo) : f <= .5 ? lo + f * 2 * (50 - lo) : 50 + (f - .5) * 2 * (hi - 50); };
    const Y = y => m.t + (yhi - y) / (yhi - ylo) * (H - m.t - m.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label + " against target delta" }, box), ax = el("g", { class: "ax" }, svg);
    if (!isCap) {
      el("rect", { x: X(50), y: 0, width: X(hi) - X(50), height: H - m.b, fill: "var(--itm-bg)" }, svg);
      const wide = X(hi) - X(50) > 150;   // the long label only where the shaded half can hold it
      txt(svg, X(hi) - 4, 12, v === "both" ? (wide ? "guts: both legs in the money" : "guts") : wide ? `${v === "pd" ? "put" : "call"} in the money` : "ITM", { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
    }
    const yt = ticks(ylo, yhi, 4);
    for (const t of yt) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, fUt(t, yt[1] - yt[0] || .01), { "text-anchor": "end" }); }
    const xt = isCap ? ticks(lo, hi, 5) : pw >= 330 ? [5, 10, 20, 30, 40, 50, 60, 70, 80, 90] : [5, 20, 35, 50, 70, 90];
    for (const t of xt) txt(ax, X(t), H - 8, !isCap && t === 50 ? "ATM" : t + "Δ", { "text-anchor": "middle", ...(!isCap && t === 50 ? { style: "fill:var(--ink-2)" } : {}) });
    if (!isCap) el("line", { x1: X(50), x2: X(50), y1: m.t, y2: H - m.b, stroke: "var(--ink-3)", "stroke-width": 1 }, svg);
    if (ylo < 0 && yhi > 0) el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--ink-3)" }, svg);
    for (const [P, ser, cv] of [[Pb, sb, "b"], [Pa, sa, "a"]]) {
      el("line", { x1: X(cur(P)), x2: X(cur(P)), y1: m.t, y2: H - m.b, stroke: `var(--${cv})`, "stroke-dasharray": "3 3", "stroke-opacity": .8 }, svg);
      el("path", { d: pathOf(ser.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    }
    el("path", { d: pathOf(sd.map(p => [p.x, p[k]]), X, Y), fill: "none", stroke: "var(--ink)", "stroke-width": 1.4, "stroke-linejoin": "round" }, svg);
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => { const r = svg.getBoundingClientRect(), x = Math.round(clamp(xOfPx((ev.clientX - r.left) * W / r.width), lo, hi)); cross.setAttribute("x1", X(x)); cross.setAttribute("x2", X(x)); cross.setAttribute("visibility", "visible");
      const a = sa[x - lo], b = sb[x - lo], d = sd[x - lo], f = p => p.b.na ? "n/a" : `${fU(p[k])} <span class="muted">${legTxt(p.b)}</span>`;
      const lab = isCap ? x + "Δ" : x === 50 ? "ATM" : x > 50 ? `${x}Δ ITM` : x + "Δ";
      showTip(`<span class="h">${isCap ? "Cap" : v === "pd" ? "Put" : v === "cd" ? "Call" : "Short legs"} at ${lab}</span>${krow(`<i class="sw" style="background:var(--a)"></i>A`, f(a))}${krow(`<i class="sw" style="background:var(--b)"></i>B${hb()}`, f(b))}${krow(`<i class="sw" style="background:var(--ink)"></i>A − ${hTxt()}`, fU(d[k]))}`, ev.clientX, ev.clientY); });
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
  }
  if (st.along === "k" && v !== "capd") host.insertAdjacentHTML("beforeend", `<span class="cap" style="grid-column:1/-1">B differs only in strikes, so varying a strike gives both lines the same path apart from sizing.</span>`);
}

// ============================================================ smile & legs
function renderSmile() {
  const host = $("#smile"); host.innerHTML = "";
  const { A, B } = C, groups = A.tk === B.tk ? [{ tk: A.tk, pos: [["A", A], ["B", B]] }] : [{ tk: A.tk, pos: [["A", A]] }, { tk: B.tk, pos: [["B", B]] }];
  host.classList.toggle("two", groups.length > 1);
  for (const gr of groups) {
    const box = document.createElement("span"); box.className = "sm"; box.style.display = "block"; host.appendChild(box);
    const U = D.u[gr.tk], S = U.S, exps = [...new Set(gr.pos.map(p => p[1].exp))];
    box.innerHTML = `<h3>${gr.tk} · ${exps.map(fmtE).join(" and ")}</h3>`;
    const W = Math.max(box.clientWidth, 300), H = 260, m = { l: 42, r: 10, t: 30, b: 28 }, pts = [];
    for (const e of exps) for (const q of chain(gr.tk, e).q) { const F = U.exps[e].F; if (q.ivm && q.bid > 0 && ((q.cp === "P" && q.K <= F) || (q.cp === "C" && q.K >= F))) pts.push({ ...q, e }); }
    const Ks = pts.map(p => p.K).concat(gr.pos.flatMap(([, b]) => [b.sp.K, b.sc.K, b.cap && b.cap.K].filter(Boolean)));
    const xlo = Math.max(Math.min(...Ks) * 0.94, S * 0.25), xhi = Math.min(Math.max(...Ks) * 1.04, S * 3.5);
    const curves = exps.map(e => { const E = U.exps[e], c = []; for (let i = 0; i <= 160; i++) { const K = xlo + (xhi - xlo) * i / 160; c.push([K, smile(E, K, E.F)]); } return { e, c }; });
    const ys = pts.map(p => p.ivm).concat(curves.flatMap(c => c.c.map(q => q[1]))), ylo = Math.min(...ys) * .96, yhi = Math.max(...ys) * 1.04;
    const X = x => m.l + (x - xlo) / (xhi - xlo) * (W - m.l - m.r), Y = y => m.t + (yhi - y) / (yhi - ylo) * (H - m.t - m.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${gr.tk} implied volatility smile with selected strikes` }, box), ax = el("g", { class: "ax" }, svg);
    for (const t of ticks(ylo, yhi, 4)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, (t * 100).toFixed(0) + "%", { "text-anchor": "end" }); }
    for (const t of ticks(xlo, xhi, Math.max(4, Math.floor(W / 70)))) txt(ax, X(t), H - 10, t, { "text-anchor": "middle" });
    el("line", { x1: X(S), x2: X(S), y1: m.t, y2: H - m.b, stroke: "var(--ink-3)" }, svg); txt(svg, X(S) + 3, H - m.b - 4, "spot", { fill: "var(--ink-3)", "font-size": 10 });
    const twoExp = exps.length > 1, colE = e => twoExp ? (e === A.exp ? "var(--a)" : "var(--b)") : "var(--ink-2)";
    for (const cv of curves) el("path", { d: pathOf(cv.c, X, Y), fill: "none", stroke: colE(cv.e), "stroke-width": 1.6 }, svg);
    const used = {};
    for (const [tag, b] of gr.pos) for (const [K, l] of [[b.sp.K, "P"], [b.sc.K, "C"], [b.cap && b.cap.K, "cap"]]) {
      if (!K) continue; const x = X(K), k = Math.round(x / 6); used[k] = (used[k] || 0) + 1;
      el("line", { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: `var(--${tag.toLowerCase()})`, "stroke-width": 1.2, "stroke-dasharray": tag === "B" ? "4 3" : "" }, svg);
      txt(svg, x, m.t - 6 - 11 * (used[k] - 1), `${tag}·${l}`, { "text-anchor": "middle", fill: `var(--${tag.toLowerCase()})`, "font-size": 10.5, "font-weight": 600 });
    }
    for (const p of pts) {
      const g = el("g", { class: "qpt", tabindex: 0, role: "button", "aria-label": `${fK(p.K)}${p.cp} ${fmtE(p.e)}, place a leg here` }, svg);
      el("circle", { cx: X(p.K), cy: Y(p.ivm), r: 3.6, fill: "var(--surface)", stroke: colE(p.e), "stroke-width": 1.5 }, g);
      el("circle", { cx: X(p.K), cy: Y(p.ivm), r: 9, fill: "transparent" }, g);
      g.addEventListener("click", ev => { ev.stopPropagation(); openLegPop(p, gr.tk, ev); });
      g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); const r = g.getBoundingClientRect(); openLegPop(p, gr.tk, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); } });
      g.addEventListener("pointerenter", ev => showTip(`<span class="h">${fK(p.K)}${p.cp} · ${fmtE(p.e)}</span>${krow("delta (fit)", (p.d * 100).toFixed(1))}${krow("bid / ask", `${p.bid.toFixed(2)} / ${p.ask.toFixed(2)}`)}${krow("IV mid / fit", `${fP(p.ivm, 1)} / ${fP(p.iv, 1)}`)}`, ev.clientX, ev.clientY));
      g.addEventListener("pointerleave", hideTip);
    }
  }
  $("#sm-lgd").innerHTML = `<span><i style="background:var(--a)"></i>A legs</span> <span><i style="background:var(--b)"></i>B legs, dashed</span>`;
}
function openLegPop(q, tk, ev) {
  const Bp = C.Bp, opts = [], bEdit = st.along === "k" || st.along === "free";
  const target = who => who === "A" ? st.A : st.along === "k" ? st.bk : st.Bf, P = who => who === "A" ? st.A : Bp;
  for (const who of ["A", "B"]) {
    if (who === "B" && !bEdit) continue;
    if (P(who).tk !== tk || P(who).exp !== q.e) continue;
    if (q.cp === "P") opts.push([who, "pd", "short put"]);
    else { opts.push([who, "cd", "short call"]); if (who === "A" ? (st.A.st === "cap" || (!bEdit && Bp.st === "cap")) : Bp.st === "cap") opts.push([who, "capd", "cap"]); }
  }
  let h = `<span class="h">${fK(q.K)}${q.cp} · ${tk} ${fmtE(q.e)}</span><span class="s">${(q.d * 100).toFixed(1)}Δ · ${q.bid.toFixed(2)} / ${q.ask.toFixed(2)}</span>`;
  if (!opts.length) h += `<span class="s" style="font-family:var(--f-ui)">No leg of A${bEdit ? " or B" : ""} uses this chain.${bEdit ? "" : " B follows A's strikes; set “B differs in” to Strikes to place B's legs."}</span>`;
  for (const [who, f, l] of opts) { const b = build(P(who)); const dis = f === "capd" && q.K <= b.sc.K ? ` disabled title="The cap must sit above the short call"` : ""; h += `<button type="button" data-who="${who}" data-f="${f}"${dis}><span class="key ${who.toLowerCase()}">${who}</span>Use as ${l}</button>`; }
  openPopAt(h, ev.clientX, ev.clientY, e => {
    const btn = e.target.closest("button[data-f]"); if (!btn || btn.disabled) return;
    const who = btn.dataset.who, f = btn.dataset.f, T = target(who), lk = who === "A" ? "link" : "linkB";
    if (f === "capd") { const b = build(P(who)), up = chain(tk, q.e).calls.filter(o => o.K > b.sc.K && o.ask > 0), i = up.findIndex(o => o.K === q.K), prev = i > 0 ? up[i - 1] : null; T.capd = clamp(+(prev ? (prev.d + q.d) / 2 * 100 : q.d * 100 + 0.5).toFixed(1), 3, 40); }
    else { if (st[lk]) { st[lk] = false; toast(`${who}'s put and call unlinked so one leg can move alone`); } T[f] = clamp(+(Math.abs(q.d) * 100).toFixed(2), DMIN, 50); }
    $("#pop").hidden = true; refresh();
  });
}

// ============================================================ notes
function renderNotes() {
  const at = String(D.meta.asof || ""), ad = /^\d{4}-\d{2}-\d{2}/.test(at) ? `${+at.slice(8, 10)} ${MON[+at.slice(5, 7) - 1]} ${at.slice(0, 4)}` : "30 Sep 2026", tm = at.slice(11, 16), when = !tm || tm === "16:00" ? "close" : tm + " ET";
  $("#asof").textContent = `IBKR option quotes at the ${ad} ${when} · spot RAM ${D.u.RAM.S}, KORU ${D.u.KORU.S}` + (D.u.RAM.pre != null && D.u.KORU.pre != null ? ` (pre-market ${D.u.RAM.pre} / ${D.u.KORU.pre})` : "") + ` · same ${["", "one", "two", "three", "four", "five", "six", "seven", "eight"][EXPS.length] || EXPS.length} expiries on both`;
  $("#notes").innerHTML = [
    "Move range (header): every chart's move axis spans exactly this range, with the range ends labelled. σ = ATM implied vol at A's expiry × √(A's days / 365), per ticker, on log price; the same σ is used for B and for every position in the overview, so all panels see the same scenarios. % = simple % change. Points = $ change of A's ticker, offered only when A and B share it. With two tickers, σ mode moves each by the same number of its own σ and % mode moves both by the same %.",
    "Only the move axis is set by you. P&L axes fit their data, and heatmap colour scales run to the largest |value| unless you fix the range in the grid's settings.",
    "Legs: each short leg is the listed strike whose fitted-smile delta is nearest its target, from 3 to 90. At 50 it snaps to the strike nearest the forward, so both at 50 is a straddle. Above 50 the leg is in the money: the strike is picked on the in-the-money side of the forward strike. Where the listed chain stops before 90, the slider stops at the deepest listed strike and says so. With both legs out of the money, a put that would land above the call moves down to the call strike; with an in-the-money leg the put may sit above the call, a short guts, whose payoff between the strikes is flat at credit − (put strike − call strike) and whose breakevens are still put strike − credit and call strike + credit. Cap = lowest listed call above the short call with delta below the cap target; if none is below the target the highest listed call is used (flagged in the header). If no call is listed above the short call, the capped position is n/a and the header offers a one-click fix.",
    "Fills: mid, or natural (sell at bid, buy at ask). With natural fills, marks before expiry also pay half the quoted spread on each leg to close.",
    "Smile: weighted cubic in log-moneyness per expiry; beyond the quoted strikes, total variance continues linearly with its edge slope (capped at Lee's bound), which keeps the implied distribution smooth. Marks reprice every leg with Black-Scholes at r = 4% on that smile anchored to the new forward, with each leg's vol offset so that it marks at its traded mid at entry, plus the shocks set on the P&L grid.",
    "Odds: ‘Implied’ is the risk-neutral distribution from the fitted smile; EV = credit − e^{rT} × the model value of the legs, so it measures the gap between the fill and the fitted smile. ‘HV30’ is a zero-drift lognormal at IBKR's 30-day historical vol times the scaler, with EV in closed form. Profit odds and cap-pays odds read the distribution at the breakevens. Before expiry the implied distribution is shrunk by √(t/T).",
    "Credit and time value: an in-the-money leg's cash credit includes its intrinsic value (against spot at entry), which is paid back at expiry. Time value = credit − intrinsic. Credit/σ, credit per day, credit/margin, the overview's credit chart and table, the sweep, × credit units and the Equal credit sizing rule all use time value. For out-of-the-money legs time value is the credit, so those numbers are unchanged.",
    "In-the-money legs: the vol offset that pins a leg to its mid is taken from the out-of-the-money option at the same strike, so the in-the-money leg is priced from it through put-call parity on the forward; a deep in-the-money mid is mostly intrinsic and says little about vol. A mid below intrinsic is flagged in the header. The model is European; a leg's tooltip flags early assignment as likely when its time value is below $0.05 or below the carry on the strike (strike × (1 − e^{−rT})).",
    "Margin (approximate): Reg-T style, 20% × leverage (2× RAM, 3× KORU) on the naked side, with the out-of-the-money amount at 0 for an in-the-money leg; a capped call side is charged the smaller of the spread width and the naked charge. IBKR's real leveraged-ETF requirement may differ.",
    "Sizing: the pair is A − h·B in units of A's notional. Auto = equal notional for one ticker, equal vega across tickers.",
    "Not modelled: correlation between RAM and KORU, early assignment (flagged only), dividends, borrow, leveraged-ETF path decay beyond what the smile implies, vol-of-vol."
  ].map(s => `<li>${s}</li>`).join("");
}

// ============================================================ wiring
function cmpWire() {
  seg("#c-along", ALONG_MAIN, () => st.along, setAlong);
  seg("#c-along2", ALONG_MORE, () => st.along, v => { setAlong(v); $("#m-along").open = false; });
  $("#swap").addEventListener("click", () => { swapAB(); refresh(); });
  for (const [id, sec] of [["#chipA", "#edA"], ["#chipB", "#edB"]]) { const go = () => { if (document.body.classList.contains("dock-off")) setDock(false); $(sec).scrollIntoView({ block: "start" }); }; $(id).addEventListener("click", go); $(id).addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }); }
  $("#warnrow").addEventListener("click", e => { const b = e.target.closest("[data-fix]"); if (!b) return; const fx = FIXES[b.dataset.fix]; if (fx) { fx.apply(); toast("Done: " + fx.label.replace(/ \(A and B.*\)/, "")); refresh(); } });
  seg("#c-unit", [["sig", "σ", "Multiples of each ticker's implied move over A's horizon"], ["pct", "%", "Simple % change"], ["pts", "pts", "Price change in $ (one ticker only)"]], () => st.unit, setUnit);
  const rlo = $("#c-rlo"), rhi = $("#c-rhi");
  const setR = (which, inp) => { let v = Math.abs(parseFloat(inp.value)); if (Number.isFinite(v) && v > 0) { v = Math.max(+v.toFixed(2), st.unit === "pct" ? 0.5 : 0.05); st[which] = v; if (st.rlink) { const cap = rangeCaps(st.unit, C.A.S)[0]; st.rlo = st.rhi = Math.min(v, cap); } } refresh(); requestAnimationFrame(() => { rlo.value = +st.rlo.toFixed(2); rhi.value = +st.rhi.toFixed(2); }); };
  rlo.addEventListener("change", () => setR("rlo", rlo)); rhi.addEventListener("change", () => setR("rhi", rhi));
  bindChk("#c-rlink", () => st.rlink, v => { st.rlink = v; if (v) { const cap = rangeCaps(st.unit, C.A.S)[0]; st.rlo = st.rhi = Math.min(Math.max(st.rlo, st.rhi), cap); } });
  seg("#c-units", [["pct", "% of A's notional"], ["usd", "$ per A contract"], ["cr", "× A's credit"]], () => st.units, v => st.units = v);
  seg("#c-dist", [["rn", "Implied", "Risk-neutral distribution from the fitted smile"], ["hv", "HV30", "Lognormal at IBKR HV30"]], () => st.dist, v => st.dist = v);
  bindRange("#c-hvk", "#o-hvk", () => st.hvk, v => st.hvk = v, v => v.toFixed(2) + "×");
  makeEditor($("#edA"), "a", "A", { get: () => st.A, built: () => C.A, capBuilt: () => st.A.st === "cap" ? C.A : (!["k", "free"].includes(st.along) && C.Bp.st === "cap") ? C.B : null, capTarget: () => st.A });
  seg("#c-bexp", EXPS.map(e => [e, fmtE(e).replace(" ’27", "")]), () => C ? C.Bp.exp : st.bexp, v => { st.bexp = v; });
  makeEditor($("#bK"), "bk", "bk", { get: () => st.bk, built: () => C.B });
  makeEditor($("#bF"), "bf", "bf", { get: () => { if (!st.Bf) st.Bf = { ...Bdef() }; return st.Bf; }, built: () => C.B });
  $("#dockBtn").addEventListener("click", () => setDock(true)); $("#dockOpen").addEventListener("click", () => setDock(false));
  bindSelect("#c-size", SIZES, () => st.size, v => st.size = v);
  const hc = $("#c-hc"); hc.addEventListener("change", () => { const v = parseFloat(hc.value); if (Number.isFinite(v) && v > 0) st.hc = clamp(v, 0.05, 20); refresh(); }); SYNC.push(() => { if (document.activeElement !== hc) hc.value = st.hc; });
  $("#p-over").addEventListener("toggle", () => renderOverview());
  seg("#c-ovv", [["chart", "Charts"], ["table", "Table"]], () => st.ovv, v => st.ovv = v);
  $("#ovtable").addEventListener("click", e => {
    const f = e.target.closest("[data-rowfix]"); if (f) { const [tk, s, ex] = f.dataset.rowfix.split("|"), fx = capFixFor({ ...st.A, tk, st: s, exp: ex }, st.A, ""); if (fx) { fx.apply(); toast("Done: " + fx.label.replace("Raise", "raised A's").replace("Lower", "lowered A's")); refresh(); } return; }
    const b = e.target.closest("button[data-set]"); if (!b || b.disabled) return; const { tk, s, e: ex } = b.dataset; if (b.dataset.set === "A") setA(tk, s, ex); else setB(tk, s, ex); refresh();
  });
  bindChk("#c-pso", () => st.pso, v => st.pso = v); bindChk("#c-pss", () => st.pss, v => st.pss = v);
  $("#cmp").addEventListener("change", e => {
    if (e.target.matches("[data-wl]")) { st.wl = e.target.value; if (st.wl === "own") { st.wlo = -C.lo; st.whi = C.hi; } refresh(); }
    if (e.target.matches("[data-wlo],[data-whi]")) { const v = Math.abs(parseFloat(e.target.value)); if (v > 0) st[e.target.matches("[data-wlo]") ? "wlo" : "whi"] = v; refresh(); }
  });
  seg("#c-align", [["frac", "% of life"], ["cal", "Same date"]], () => st.align, v => st.align = v);
  seg("#c-gval", [["pnl", "P&L"], ["contrib", "× odds", "P&L weighted by the odds of each column: shows where the expected value comes from"]], () => st.gval, v => st.gval = v);
  seg("#c-gview", [["heat", "Heatmap"], ["num", "Numbers"]], () => st.gview, v => st.gview = v);
  seg("#c-gtab", [["A", "A"], ["B", "B"], ["D", "A − h·B"]], () => st.gtab, v => st.gtab = v);
  bindRange("#c-ivs", "#o-ivs", () => st.ivs, v => st.ivs = v, v => (v > 0 ? "+" : v < 0 ? MINUS : "±") + Math.abs(v) + " vol pts");
  bindRange("#c-svs", "#o-svs", () => st.svs, v => st.svs = v, v => v ? `+${v} pts per −10%` : "off");
  bindChk("#c-svd", () => st.svd, v => st.svd = v);
  $("#shockReset").addEventListener("click", () => { st.ivs = 0; st.svs = 0; refresh(); });
  bindChk("#c-gl", () => st.gl, v => st.gl = v);
  seg("#c-ct", [["zero", "Break-even"], ["lev", "Levels"]], () => st.ct, v => st.ct = v);
  bindSelect("#c-cts", [[1, "every 1%"], [2, "every 2%"], [5, "every 5%"], [10, "every 10%"], [20, "every 20%"]], () => st.cts, v => st.cts = +v);
  bindChk("#c-ovk", () => st.ovk, v => st.ovk = v); bindChk("#c-ovc", () => st.ovc, v => st.ovc = v); bindChk("#c-ovb", () => st.ovb, v => st.ovb = v); bindChk("#c-ovs", () => st.ovs, v => st.ovs = v); bindChk("#c-ovo", () => st.ovo, v => st.ovo = v);
  seg("#c-cs", [["comp", "Compressed"], ["lin", "Linear"]], () => st.cs, v => st.cs = v);
  seg("#c-cr", [["auto", "Full range"], ["fix", "Fixed"]], () => st.cr, v => st.cr = v);
  const crx = $("#c-crx"); crx.addEventListener("change", () => { const v = parseFloat(crx.value); if (v > 0) st.crx = v; refresh(); }); SYNC.push(() => { if (document.activeElement !== crx) crx.value = st.crx; });
  bindChk("#c-shared", () => st.shared, v => st.shared = v);
  bindSelect("#c-nm", [[9, "9"], [13, "13"], [17, "17"], [25, "25"]], () => st.nm, v => st.nm = +v);
  bindSelect("#c-nd", [[1, "1 day"], [2, "2 days"], [5, "5 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"]], () => st.nd, v => st.nd = +v);
  $("#csvBtn").addEventListener("click", () => copyText(GRID.csv || "", $("#csvFallback")));
  $("#pins").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) { st.pins.splice(+b.dataset.k, 1); refresh(); } if (e.target.id === "pinclr") { st.pins = []; refresh(); } });
  $("#p-joint").addEventListener("click", e => { if (e.target.id === "jgo") { setAlong("tk"); refresh(); } });
  $("#p-joint").addEventListener("input", e => { if (e.target.id === "c-jday") { st.jday = +e.target.value; refresh(); } });
  wireRecovery();
  seg("#c-sweep", [["both", "Both short legs"], ["pd", "Put"], ["cd", "Call"], ["capd", "Cap"]], () => st.sweep, v => st.sweep = v);
}
function setDock(off) { document.body.classList.toggle("dock-off", off); st.dock = !off; setTimeout(refresh, 30); }
// renders the comparer only; theme and the tab strip are app-level (app8.js). Stays global for the v7 interaction scripts.
// ============================================================ recovery dynamics: how many cycles one bad hit is worth
function recFor(b, who) {
  if (!b || b.na) return null;
  const capPS = st.rdCap === "margin" ? b.margin : b.S;   // capital per share of the position
  const ev = statsHV(b).ev, g = st.rdG === "custom" ? st.rdGc / 100 : ev / capPS;
  let L, xMove = null;
  if (st.rdHit === "fixed") L = st.rdL / 100;
  else {
    const sg = D.u[b.tk].exps[b.exp].atm * Math.sqrt(b.T), dn = b.S * Math.exp(-st.rdK * sg), up = b.S * Math.exp(st.rdK * sg);
    const lDn = -payoff(b, dn) / capPS, lUp = -payoff(b, up) / capPS;
    if (st.rdDir === "down") { L = lDn; xMove = dn; } else if (st.rdDir === "up") { L = lUp; xMove = up; } else { L = Math.max(lDn, lUp); xMove = lDn >= lUp ? dn : up; }
  }
  return { b, who, g, L, xMove, days: b.dte, ev, capPS };
}
// cycles needed; Infinity when growth cannot get there
function recCycles(L, g, kind) {
  if (!(L > 0)) return 0;
  if (!(g > 0)) return Infinity;
  const lg = Math.log(1 + g);
  if (st.rdBase === "nav" || kind === "rec") return L >= 1 ? Infinity : -Math.log(1 - L) / lg;
  return Math.log(1 + L) / lg;   // buffer against a hit measured on the starting capital
}
function renderRecovery() {
  const host = $("#rec"); if (!host) return;
  const runs = [recFor(C.A, "A"), recFor(C.B, "B")].filter(Boolean);
  const at = String(D.meta && D.meta.asof || "2026-10-01"), t0 = Date.UTC(+at.slice(0, 4), +at.slice(5, 7) - 1, +at.slice(8, 10));
  const dstr = days => { const d = new Date(t0 + days * 864e5); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${d.getUTCFullYear() !== 2026 ? " " + String(d.getUTCFullYear()).slice(2) : ""}`; };
  const fmtT = (n, days, L) => L >= 1 ? { v: "wiped out", s: "", d: "the hit exceeds the capital" } : !Number.isFinite(n) ? { v: "never", s: "", d: "growth can't get there" } : n === 0 ? { v: "none needed", s: "", d: "" } : { v: `${(n * days / 7).toFixed(1)} wk`, s: `${Math.ceil(n - 1e-9)} cycle${Math.ceil(n - 1e-9) === 1 ? "" : "s"}`, d: `${Math.ceil(n - 1e-9)} × ${days}d → ${dstr(Math.ceil(n - 1e-9) * days)}` };
  const hitTxt = st.rdHit === "fixed" ? `a fixed ${st.rdL}% hit` : `a ${st.rdK}σ move ${st.rdDir === "worse" ? "(worse side)" : st.rdDir}`;
  let L = `<span class="rl">` + runs.map(r => { const rc = recCycles(r.L, r.g, "rec"), bf = recCycles(r.L, r.g, "buf"), a = fmtT(rc, r.days, r.L), c = fmtT(bf, r.days, st.rdBase === "nav" ? r.L : 0);
    return `<span class="rrun"><span class="key ${r.who.toLowerCase()}">${r.who}</span><span class="rh">${posShort(r.b.P)} · ${r.days}-day cycles · growth ${r.g > 0 ? "+" : ""}${(r.g * 100).toFixed(2)}% a cycle${st.rdG === "ev" ? " (EV at HV30 odds" + (st.rdCap === "margin" ? " on margin" : " on notional") + ")" : ""}</span>
      <span class="rv hc"><span class="l">Hit</span><span class="v ${r.L >= 1 ? "neg" : ""}">${r.L > 0 ? "−" + (r.L * 100).toFixed(0) + "%" : "no loss"}<small>${r.xMove ? "at " + fPx2(r.xMove) : ""}</small></span><span class="d">of ${st.rdBase === "nav" ? "NAV when it lands" : "starting capital"}</span></span>
      <span class="rv"><span class="l">Recovery (hit first)</span><span class="v">${a.v}<small>${a.s}</small></span><span class="d">${a.d}</span></span>
      <span class="rv"><span class="l">Buffer (climb first)</span><span class="v">${c.v}<small>${c.s}</small></span><span class="d">${c.d}</span></span></span>`; }).join("") + `<span class="cap" style="display:block;margin-top:4px">${hitTxt}; a cycle rolls the same tenor; whole cycles round up, because a partly elapsed cycle can't be traded.${st.rdBase === "nav" ? " Measured against NAV when it lands, the two times are equal at a constant growth rate." : ""}</span></span>`;
  host.innerHTML = L + `<span class="rr" id="rec-ch"></span>`;
  // curve: cycles needed against hit size, recovery solid, buffer dashed
  const box = $("#rec-ch"), W = Math.max(320, box.getBoundingClientRect().width), H = 230, m = { l: 48, r: 60, t: 18, b: 28 }, pw = W - m.l - m.r;
  const hs = []; for (let h = 0.05; h <= 0.951; h += 0.01) hs.push(h);
  let ymax = 1; for (const r of runs) for (const h of hs) for (const k of ["rec", "buf"]) { const n = recCycles(h, r.g, k); if (Number.isFinite(n)) ymax = Math.max(ymax, Math.min(n, 60)); }
  ymax = Math.min(ymax, 60) * 1.05; const X = h => m.l + (h - 0.05) / 0.9 * pw, Y = n => m.t + (1 - Math.min(n, ymax) / ymax) * (H - m.t - m.b);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "cycles needed against hit size" }, box), ax = el("g", { class: "ax" }, svg);
  for (const t of ticks(0, ymax, 4)) { el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, ax); txt(ax, m.l - 5, Y(t) + 3.5, String(t), { "text-anchor": "end" }); }
  for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) txt(ax, X(t), H - 10, "−" + Math.round(t * 100) + "%", { "text-anchor": "middle" });
  txt(svg, m.l, 9, `cycles needed (capped at 60) · ${st.rdBase === "nav" ? "recovery = buffer when the hit is a % of NAV" : "solid: recovery, dashed: buffer"}`, { fill: "var(--ink-3)", "font-size": 10 });
  for (const r of runs) { const cv = r.who.toLowerCase();
    for (const [k, dash] of [["rec", ""], ["buf", "5 4"]]) { const pts = hs.map(h => [h, recCycles(h, r.g, k)]).filter(p => Number.isFinite(p[1]) && p[1] <= ymax);
      if (pts.length > 1) el("path", { d: pathOf(pts, X, Y), fill: "none", stroke: `var(--${cv})`, "stroke-width": dash ? 1.4 : 2, "stroke-dasharray": dash }, svg); }
    if (r.L > 0.05 && r.L < 0.95) for (const k of ["rec", "buf"]) { const n = recCycles(r.L, r.g, k); if (Number.isFinite(n) && n <= ymax) el("circle", { cx: X(r.L), cy: Y(n), r: 3.5, fill: k === "rec" ? `var(--${cv})` : "var(--surface)", stroke: `var(--${cv})`, "stroke-width": 1.5 }, svg); }
    const last = hs.map(h => [h, recCycles(h, r.g, "rec")]).filter(p => Number.isFinite(p[1]) && p[1] <= ymax).pop(); if (last) txt(svg, Math.min(X(last[0]) + 4, W - m.r + 4), Y(last[1]) + 4, r.who, { fill: `var(--${cv})`, "font-weight": 600, "font-size": 11 }); }
  txt(svg, W - 4, H - 10, "hit", { "text-anchor": "end", fill: "var(--ink-3)", "font-size": 10 });
  const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-2)", visibility: "hidden" }, svg), hit = el("rect", { x: m.l, y: m.t, width: pw, height: H - m.t - m.b, fill: "transparent" }, svg);
  hit.addEventListener("pointermove", ev => { const rr = svg.getBoundingClientRect(), h = clamp(0.05 + ((ev.clientX - rr.left) * W / rr.width - m.l) / pw * 0.9, 0.05, 0.95); cross.setAttribute("x1", X(h)); cross.setAttribute("x2", X(h)); cross.setAttribute("visibility", "visible");
    showTip(`<span class="h">Hit −${Math.round(h * 100)}%</span>` + runs.map(r => { const a = fmtT(recCycles(h, r.g, "rec"), r.days, h), c = fmtT(recCycles(h, r.g, "buf"), r.days, 0); return krow(`<i class="sw" style="background:var(--${r.who.toLowerCase()})"></i>${r.who} recovery`, `${a.v} ${a.s}`) + krow(`${r.who} buffer`, `${c.v} ${c.s}`); }).join(""), ev.clientX, ev.clientY); });
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
}
function wireRecovery() {
  seg("#c-rdhit", [["move", "From a move"], ["fixed", "Fixed %"]], () => st.rdHit, v => st.rdHit = v);
  seg("#c-rdbase", [["nav", "NAV when it lands"], ["start", "starting capital"]], () => st.rdBase, v => st.rdBase = v);
  seg("#c-rdcap", [["margin", "Margin"], ["notional", "Notional"]], () => st.rdCap, v => st.rdCap = v);
  seg("#c-rdg", [["ev", "EV · HV30"], ["custom", "Typed"]], () => st.rdG, v => st.rdG = v);
  const hin = $("#rd-hitin");
  hin.innerHTML = `<span id="rd-mv"><input type="number" id="c-rdk" min="0.25" max="6" step="0.25" style="width:52px">σ <span class="seg" id="c-rddir"></span></span><span id="rd-fx"><input type="number" id="c-rdl" min="1" max="99" step="1" style="width:52px">%</span>`;
  seg("#c-rddir", [["worse", "worse side"], ["down", "down"], ["up", "up"]], () => st.rdDir, v => st.rdDir = v);
  const num = (id, key, lo, hi) => { const i = $(id); i.addEventListener("change", () => { const v = parseFloat(i.value); if (Number.isFinite(v)) st[key] = clamp(v, lo, hi); refresh(); }); SYNC.push(() => { if (document.activeElement !== i) i.value = st[key]; }); };
  num("#c-rdk", "rdK", 0.25, 6); num("#c-rdl", "rdL", 1, 99); num("#c-rdgc", "rdGc", -20, 50);
  SYNC.push(() => { $("#rd-mv").hidden = st.rdHit !== "move"; $("#rd-fx").hidden = st.rdHit !== "fixed"; $("#rd-gc").style.visibility = st.rdG === "custom" ? "visible" : "hidden"; });
}
function renderAll() {
  ensureUnit(); context();
  if (unitNote) { toast(unitNote); unitNote = ""; } else if (C.clampNote) toast(C.clampNote);
  for (const f of SYNC) f();
  renderHeader(); renderSide();
  for (const ed of EDITORS) if (ed.id === "a" || (ed.id === "bk" && st.along === "k") || (ed.id === "bf" && st.along === "free")) syncEditor(ed);
  const safe = (f, n) => { try { f(); } catch (e) { console.error(n, e); } };
  safe(renderOverview, "overview"); safe(renderPayoff, "payoff"); safe(renderCmp, "cmp");
  safe(renderGrid, "grid"); safe(renderPins, "pins"); safe(renderJoint, "joint"); safe(renderSweep, "sweep"); safe(renderRecovery, "recovery"); safe(renderSmile, "smile");
  appSave();
}
