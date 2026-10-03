// ============================================================ ui_facts: Market facts (Compare tab)
// What is known about the underlyings and their chains, ingested or typed in, apart from any position: per ticker in
// use its spot and period vol; per listed expiry its days, forward, ATM IV and the 1σ move to expiry; the contracts A
// and B hold with their quotes, own IV and delta. The spot / IV / period vol editor lives here (one per side whose
// ticker it is; B's only while B sets its instrument on its own). Reads only C and the store; changes state only
// through commands. Top-level name: FACTS.
const FACTS = (() => {
  const q = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const att = s => esc(s).replace(/'/g, "&#39;");
  const pxOf = v => Number.isFinite(v) ? v.toFixed(2) : "–";
  const FACTS_CONFIG = Object.freeze({
    instBoxName: "spot / IV / period vol",
    // the period-vol slider's step in % (its span: the comparer's floor to the stored cap, PERIOD_VOL_CONFIG)
    periodVolStep: 1,
    periodVolInfo: "One number per ticker, used for every expiry; annualized like IV (calendar days). Every EV reading uses it (the overview's EV, the sweep, recovery, the export), and so do the odds when the odds switch says period vol. Leg prices and IVs stay at their quotes. The ticks mark the reference vols listed under the slider."
  });
  let C = null, lastEditorKey = "";
  // local view state, not stored: which tickers' editors are open
  const open = new Set();
  const run = command => page.executor.execute(Object.assign({ source: "facts" }, command));
  /** @param {{ side: string, path: string, value: any }} edit */
  const setSide = ({ side, path, value }) => run({ type: side === "A" ? Command.SetA : Command.SetB, path, value });
  const posOf = side => side === "A" ? C.Ap : C.Bp;
  const bOf = side => side === "A" ? C.A : C.B;
  const instOf = side => side === "A" ? C.instA : C.instB;
  const keyHtml = side => `<span class="key ${side.toLowerCase()}">${side}</span>`;

  // ---------------------------------------------------------- which tickers, which editors
  // the tickers A and B are on, A's first; each with the sides on it
  function listTickers() {
    const out = [];
    for (const side of ["A", "B"]) {
      const I = instOf(side);
      if (!I) { continue; }
      const found = out.find(t => t.id === I.id);
      if (found) { found.sides.push(side); } else { out.push({ id: I.id, sides: [side] }); }
    }
    return out;
  }
  // a ticker's editors: one per side on it, B's only when B sets its instrument on its own (else it follows A's)
  const editorSides = ticker => ticker.sides.filter(side => side === "A" || !C.comparison.links.inst || !ticker.sides.includes("A"));

  // ---------------------------------------------------------- the facts
  function describeTickerLine(ticker) {
    const I = instOf(ticker.sides[0]), vol = C.volOf(ticker.id), keys = ticker.sides.map(keyHtml).join("");
    const spot = I.overridden && Math.abs(I.spot - I.spotListed) > 1e-9 * I.spotListed ? `spot <b>${pxOf(I.spot)}</b> ✎ <span class="muted">listed ${pxOf(I.spotListed)}</span>` : `spot <b>${pxOf(I.spot)}</b>`;
    const shift = I.ivShift ? ` · IV shift ${I.ivShift > 0 ? "+" : MINUS}${Math.abs(I.ivShift)} pts ✎` : "";
    // the other references beside the one in use (the period vol's own label already names that one)
    const inUse = String(vol.label);
    const refs = C.periodVolRefs(ticker.id).filter(r => !inUse.includes(r.label)).map(r => `${r.label} ${Math.round(r.pct)}%`).join(" · ");
    const isOpen = open.has(ticker.id);
    return `<span class="fxt">${keys}<b class="fxn">${esc(I.name || I.id)}</b>${spot}${shift} · period vol <b>${esc(vol.label.replace(/^vol /, ""))}</b>${vol.source === VolSource.Set ? " ✎" : ""}` +
      `<button type="button" class="d9btn fxe" data-act="fxedit" data-id="${att(ticker.id)}" aria-expanded="${isOpen}">${isOpen ? "Done" : "Edit"}</button>` +
      `${refs ? `<span class="fxrefs muted">also: ${esc(refs)}</span>` : ""}</span>`;
  }
  // every listed expiry of the ticker: days, forward, ATM IV, the 1σ move to expiry; the ones in use marked
  function describeExpiries(ticker) {
    const I = instOf(ticker.sides[0]);
    const users = e => ["A", "B"].filter(side => !bOf(side).na && bOf(side).tk === ticker.id && bOf(side).exp === e);
    const rows = I.expiries.map(e => {
      const E = I.exp(e), on = users(e);
      return `<tr${on.length ? ` class="on"` : ""}><td>${on.map(keyHtml).join("")}${esc(fmtE(e))}</td><td>${E.dte}</td><td>${pxOf(E.Fpar)}</td><td>${fP(E.atm, 1)}</td><td>±${(E.sigma * 100).toFixed(1)}%</td><td>±${pxOf(E.Fpar * E.sigma)}</td></tr>`;
    }).join("");
    return `<table class="fxx"><thead><tr><th>Expiry</th><th>Days</th><th>Forward</th><th>ATM IV</th><th colspan="2">1σ move to expiry</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  // the contracts A and B hold: quote, own IV (from the mid; * = the smile fit), forward delta, where the strike sits
  // against the forward (% and the expiry's σ), and the mid's intrinsic value (against spot) and time value
  const signed = (v, digits, suffix) => { const t = Math.abs(v).toFixed(digits); return (+t === 0 ? "" : v < 0 ? MINUS : "+") + t + suffix; };
  function describeContracts() {
    const rows = ["A", "B"].flatMap(side => {
      const b = bOf(side);
      if (b.na) { return []; }
      return b.legs.map(l => {
        const iv = Number.isFinite(l.ivm) ? fP(l.ivm, 1) : fP(l.iv, 1) + "*";
        const timeValue = Number.isFinite(l.tvMid) ? l.tvMid : l.mid - l.intrinsic;
        return `<tr><td>${keyHtml(side)}${esc(b.tk)} ${esc(fmtE(b.exp))} ${fK(l.K)}${l.cp}</td><td>${pxOf(l.bid)}</td><td>${pxOf(l.ask)}</td><td>${pxOf(l.mid)}</td><td>${pxOf(l.ask - l.bid)}</td><td>${iv}</td><td>${(Math.abs(l.delta) * 100).toFixed(0)}Δ</td>` +
          `<td>${signed(l.money, 1, "%")} · ${signed(l.sigma, 2, "σ")}</td><td>${pxOf(l.intrinsic)}</td><td>${pxOf(timeValue)}</td><td class="muted">${l.model ? "model quote" : ""}</td></tr>`;
      });
    }).join("");
    return `<table class="fxx fxc"><thead><tr><th>Contracts in use</th><th>Bid</th><th>Ask</th><th>Mid</th><th>Spread</th><th>IV</th><th>Delta</th><th>Strike vs forward</th><th>Intrinsic</th><th>Time value</th><th></th></tr></thead><tbody>${rows}</tbody></table>${describeSkew()}`;
  }
  // the skew at the chosen strikes: each leg's IV against the expiry's ATM IV, and the put wing against the call wing
  // (positive: the puts are dearer, the usual shape; a leveraged ETF's call wing can be the dearer one)
  const legIv = l => Number.isFinite(l.ivm) ? l.ivm : l.iv;
  function describeSkew() {
    const lines = ["A", "B"].map(side => {
      const b = bOf(side);
      if (b.na || !b.E || !(b.E.atm > 0)) { return ""; }
      const pts = v => signed(v * 100, 1, " pts"), puts = b.legs.filter(l => l.cp === "P"), calls = b.legs.filter(l => l.cp === "C");
      const vsAtm = b.legs.map(l => `${fK(l.K)}${l.cp} ${pts(legIv(l) - b.E.atm)}`).join(" · ");
      const wing = puts.length && calls.length ? ` · put wing over call wing <span class="fsk">${pts(Math.max(...puts.map(legIv)) - Math.max(...calls.map(legIv)))}</span>` : "";
      return `<span class="fskew">${keyHtml(side)} vs ATM IV ${fP(b.E.atm, 1)}: ${vsAtm}${wing}</span>`;
    }).filter(Boolean);
    return lines.length ? `<span class="fskews"><span class="lbl">Skew at the chosen strikes</span>${lines.join("")}</span>` : "";
  }

  function instX(side) {
    const I = instOf(side); if (!I) return "";
    return `<span class="d9x"><span class="d9sh"><span class="key ${side.toLowerCase()}">${side}</span><span class="d9sn">${esc(FACTS_CONFIG.instBoxName)} · ${esc(I.id)}</span></span>spot <input type="number" data-act="spot" data-side="${side}" step="0.01" min="0" aria-label="${side} spot override"> <span class="muted">listed ${fPx2(I.spotListed)}</span>` +
      `<br>IV shift <input type="number" data-act="ivs" data-side="${side}" step="1" aria-label="${side} implied vol shift in vol points"> vol pts <button type="button" class="d9btn" data-act="ovreset" data-side="${side}">Reset</button>` +
      `<span class="cap">IV +x pts re-prices the entry from model quotes. The IV shock under P&amp;L through time is a move after entry.</span>` +
      periodVolHtml({ side, instrument: I }) + `</span>`;
  }
  // ---------------------------------------------------------- the ticker's period vol (inside the editor)
  // presets: the listed vol, ATM at A's horizon (stored with A's expiry), custom (the box or the slider, 1–300%). The
  // presets and ticks come from the one reference list both tabs show (C.periodVolRefs)
  const periodVolSpan = () => ({ lo: PERIOD_VOL_CONFIG.floor[Tab.Compare], hi: PERIOD_VOL_CONFIG.range[1], step: FACTS_CONFIG.periodVolStep });
  const findRef = (id, source) => C.periodVolRefs(id).find(r => r.source === source) || null;
  // which preset reads as chosen: the stored source, except an ATM read at another horizon than A's current one (it
  // stays as stored, and a click on ATM re-reads it at A's horizon)
  function findActivePreset(id) {
    const vol = C.volOf(id);
    if (vol.source !== VolSource.Atm) { return vol.source; }
    const atm = findRef(id, VolSource.Atm);
    const isCurrent = !!atm && atm.expiry === vol.expiry;
    return isCurrent ? VolSource.Atm : "";
  }
  function describePreset({ id, source }) {
    const ref = findRef(id, source);
    if (source === VolSource.Hv30) { return { label: `${ref.label} ${Math.round(ref.pct)}%`, tip: `IBKR's listed 30-day historical vol of ${id}` }; }
    if (source === VolSource.Atm) {
      const vol = C.volOf(id), isStale = vol.source === VolSource.Atm && vol.expiry !== ref.expiry;
      const stale = isStale ? `. The vol in use was read at ${fmtE(vol.expiry)}: click to re-read it at ${fmtE(ref.expiry)}` : "";
      return { label: `${ref.label} ${Math.round(ref.pct)}%`, tip: `${id}'s ATM implied vol at A's horizon (${fmtE(ref.expiry)}), listed (no IV shift), kept as a number when chosen${stale}` };
    }
    return { label: "custom", tip: "Type a number or drag the slider" };
  }
  /** @param {{ side: string, instrument: any }} input */
  function periodVolHtml({ side, instrument }) {
    const id = instrument.id, active = findActivePreset(id), span = periodVolSpan();
    const sources = [VolSource.Hv30, VolSource.Atm, VolSource.Set].filter(source => source === VolSource.Set || !!findRef(id, source));
    const seg = sources.map(source => {
      const preset = describePreset({ id, source }), isOn = active === source;
      return `<button type="button" data-act="pvset" data-side="${side}" data-v="${source}" class="${isOn ? "on" : ""}" aria-pressed="${isOn}" title="${att(preset.tip)}">${esc(preset.label)}</button>`;
    }).join("");
    // each reference on its own unbreakable run, so a line breaks only between them
    const refs = C.periodVolRefs(id).map(r => `<span class="d9nw">${esc(`${r.label} ${Math.round(r.pct)}%`)}</span>`).join(" · ");
    return `<span class="d9pv ${side.toLowerCase()}"><span class="d9sh"><span class="d9sn">Period vol · ${esc(id)}</span><span class="info" tabindex="0" data-tip="${att(FACTS_CONFIG.periodVolInfo)}">i</span><span class="d9ro"></span></span>` +
      `<span class="seg d9pvs">${seg}</span><span class="d9pvn"><input type="number" data-act="pvnum" data-side="${side}" min="${span.lo}" max="${span.hi}" step="${span.step}" aria-label="${side} ${esc(id)} period vol in %">%</span>` +
      `<span class="d9tr"><input type="range" data-act="pvsl" data-side="${side}" step="${span.step}" aria-label="${side} ${esc(id)} period vol"><span class="d9tks"></span></span><span class="d9note" hidden></span><span class="d9pvref">${refs}</span></span>`;
  }
  // the box's note: the other side on the same ticker, a stored value below the comparer's floor
  /** @param {{ side: string, id: string }} input */
  function describePeriodVolNote({ side, id }) {
    const vol = C.volOf(id), other = side === "A" ? C.B : C.A, notes = [];
    const shares = !other.na && other.tk === id;
    if (shares) { notes.push(`${side === "A" ? "B" : "A"} is on ${id} too: one period vol for both`); }
    const isFloored = Number.isFinite(vol.storedPct) && vol.storedPct < vol.pct;
    if (isFloored) { notes.push(`${+vol.storedPct.toFixed(2)}% set on Compounding (exactly on the path); Compare reads ${Math.round(vol.pct)}%, its floor`); }
    return notes.join(". ");
  }
  // the slider spec of the period-vol box: its ticks are the reference list (a tick whose label has no room keeps its
  // mark; the list under the slider names it)
  /** @param {{ side: string, instrument: any }} input */
  function periodVolSpec({ side, instrument }) {
    const id = instrument.id, vol = C.volOf(id), span = periodVolSpan();
    const ticks = C.periodVolRefs(id).map((r, i) => ({ v: r.pct, t: r.short, pri: i, tip: `${r.label} ${Math.round(r.pct)}%` }));
    return { side, lo: span.lo, hi: span.hi, value: vol.pct, ticks, keepMarks: true, format: v => `${Math.round(v)}%`, readout: esc(vol.label), note: describePeriodVolNote({ side, id }) };
  }
  function updInstX(el, side) {
    const I = instOf(side); if (!I) return;
    const s = el.querySelector('[data-act="spot"]'), v = el.querySelector('[data-act="ivs"]');
    if (s && document.activeElement !== s) s.value = +I.spot.toFixed(4);
    if (v && document.activeElement !== v) v.value = +I.ivShift.toFixed(2);
    const box = el.querySelector(".d9pv"), num = el.querySelector('[data-act="pvnum"]'), active = findActivePreset(I.id);
    if (box) { DOCK9.updSlider(box, periodVolSpec({ side, instrument: I })); }
    if (num && document.activeElement !== num) { num.value = String(+C.volOf(I.id).pct.toFixed(1)); }
    // the cell is not redrawn while one of its inputs has focus: the preset buttons follow the state here
    for (const button of el.querySelectorAll('[data-act="pvset"]')) {
      const isOn = button.dataset.v === active;
      button.classList.toggle("on", isOn);
      button.setAttribute("aria-pressed", String(isOn));
    }
  }
  // one ticker's period vol; source Set from the box or the slider, a preset from its button (ATM: read at A's horizon
  // now, stored with that expiry)
  /** @param {{ side: string, source: string, pct?: number }} edit @returns {LabResult | null} null: no instrument or no ATM */
  function setPeriodVol({ side, source, pct }) {
    const I = instOf(side);
    if (!I) { return null; }
    const command = { type: Command.SetPeriodVol, ticker: I.id, source };
    if (source === VolSource.Atm) {
      const atm = findRef(I.id, VolSource.Atm);
      if (!atm) { return null; }
      Object.assign(command, { pct: atm.pct, expiry: atm.expiry });
    }
    if (source === VolSource.Set) { Object.assign(command, { pct }); }
    return run(command);
  }
  // the box after a typed value: it shows what the comparer reads, also while it keeps focus (the frame leaves a focused
  // box alone), so a value floored or capped by SetPeriodVol never stays on screen as typed
  /** @param {{ input: HTMLInputElement, side: string }} target */
  function showAppliedPeriodVol({ input, side }) {
    const I = instOf(side);
    if (!I) { return; }
    const applied = CTX.readTickerVol({ periodVol: page.store.read().periodVol, id: I.id });
    input.value = String(+applied.pct.toFixed(1));
  }


  // ---------------------------------------------------------- events
  function onClick(ev) {
    const t = ev.target.closest("[data-act]"); if (!t || t.disabled) return;
    const side = t.dataset.side, act = t.dataset.act;
    if (act === "fxedit") { const id = t.dataset.id; if (open.has(id)) { open.delete(id); } else { open.add(id); } page.frames.mark({ cause: FrameCause.Ui }); }
    else if (act === "pvset") { if (!t.classList.contains("on")) setPeriodVol({ side, source: t.dataset.v, pct: C.volOf(instOf(side).id).pct }); }
    else if (act === "ovreset") setSide({ side, path: "inst", value: { id: posOf(side).inst.id } });
  }
  function onChange(ev) {
    const t = ev.target, act = t.dataset && t.dataset.act, side = t.dataset && t.dataset.side; if (!act) return;
    if (act === "spot") { const v = parseFloat(t.value); setSide({ side, path: "inst.spot", value: Number.isFinite(v) && v > 0 ? v : null }); }
    else if (act === "ivs") { const v = parseFloat(t.value); setSide({ side, path: "inst.ivShift", value: Number.isFinite(v) && v !== 0 ? v : null }); }
    else if (act === "pvnum") {
      const pct = parseFloat(t.value);
      if (Number.isFinite(pct)) { setPeriodVol({ side, source: VolSource.Set, pct }); }
      showAppliedPeriodVol({ input: t, side });
    }
  }
  function onInput(ev) {
    const t = ev.target;
    if (t.dataset && t.dataset.act === "pvsl") { setPeriodVol({ side: t.dataset.side, source: VolSource.Set, pct: +t.value }); }
  }

  // ---------------------------------------------------------- init, render, reveal
  function init() {
    const host = q("#facts");
    host.innerHTML = `<div class="ph phc"><h2>Market facts</h2><span class="sub" id="fx-sum"></span></div><div class="fxb" id="fx-body"></div><div class="fxeds" id="fx-eds"></div>`;
    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    host.addEventListener("input", onInput);
  }
  // the tables redraw every frame (no inputs in them); the editors are rebuilt only when which ones show changes,
  // else updated in place (a typed value or a dragged slider survives the frame)
  function renderEditors(tickers) {
    const sides = tickers.filter(t => open.has(t.id)).flatMap(editorSides), host = q("#fx-eds"), key = sides.join("|") + "|" + sides.map(side => instOf(side).id).join("|");
    if (key !== lastEditorKey) { host.innerHTML = sides.map(side => `<div class="fxed" data-side="${side}">${instX(side)}</div>`).join(""); lastEditorKey = key; }
    for (const el of host.querySelectorAll(".fxed")) { updInstX(el, /** @type {HTMLElement} */ (el).dataset.side); }
  }
  function render(c) {
    C = c;
    const tickers = listTickers();
    for (const id of [...open]) { if (!tickers.some(t => t.id === id)) { open.delete(id); } }
    // the quotes line (written by the views from the data's as-of) is a fact of the data: shown here on this tab
    const asof = q("#asof");
    q("#fx-sum").textContent = asof ? asof.textContent : "";
    q("#fx-body").innerHTML = tickers.map(t => `<div class="fxtk">${describeTickerLine(t)}${describeExpiries(t)}</div>`).join("") + describeContracts() +
      `<span class="cap">Ingested from the quotes, or typed in under Edit (✎). The ATM IV sets σ and the chart range; the period vol sets every EV and, under that odds switch, the odds. * = the smile fit at the strike (no IV from the mid).</span>`;
    renderEditors(tickers);
  }
  return { init, render };
})();
