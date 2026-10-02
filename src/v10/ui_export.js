// ============================================================ ui9_export: "Export as Markdown" (page menu ⋯)
// EXPORT9.toMarkdownCompare(C, S9, opts) and EXPORT9.toMarkdownCompounding(ys, res, opts) are pure: they read their
// arguments (and the model / format globals) and return GitHub-flavoured markdown, prose and tables, numbers formatted
// as on screen. EXPORT9.wire(opts) wires the menu entry (Copy, Download .md, Sections ▾) for the active tab.
// Top-level name: EXPORT9.
// The section choice lives in the Compounding state's view (ys.view.exportCmp / exportYr): S9.view is sanitized to its
// own keys, and ys.view rides in the same saved blob and view code.

const EXPORT9 = (() => {
  // ---------------------------------------------------------- sections (key, label, on by default)
  /** @type {[string, string, boolean][]} */
  const CMP_SECTIONS = [["header", "Header", true], ["comparison", "Comparison", true], ["assumptions", "Assumptions", true], ["results", "Results", true],
    ["recovery", "Recovery dynamics", true], ["pins", "Pinned scenarios", true], ["overview", "Overview table", false], ["notes", "Notes", true]];
  /** @type {[string, string, boolean][]} */
  const YR_SECTIONS = [["runs", "Runs", true], ["base", "Base", true], ["strip", "Result", true], ["weeks", "Week by week", false],
    ["stress", "Stress", true], ["random", "Random years", true]];
  const defaults = list => Object.fromEntries(list.map(([k, , on]) => [k, on]));
  const pick = (list, sec) => { const d = defaults(list); if (sec && typeof sec === "object") for (const k of Object.keys(d)) if (typeof sec[k] === "boolean") d[k] = sec[k]; return d; };

  // ---------------------------------------------------------- markdown helpers
  const cell = s => String(s == null || s === "" ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  // a GFM table padded so the raw text lines up too; align: "l" | "r" per column (default: first left, rest right)
  function table(head, rows, align) {
    const n = head.length, al = align || head.map((_, i) => i ? "r" : "l");
    const all = [head, ...rows].map(r => Array.from({ length: n }, (_, i) => cell(r[i])));
    const w = Array.from({ length: n }, (_, i) => Math.max(3, ...all.map(r => r[i].length)));
    const pad = (s, i) => al[i] === "r" ? s.padStart(w[i]) : s.padEnd(w[i]);
    const line = r => "| " + r.map(pad).join(" | ") + " |";
    const sep = "| " + w.map((x, i) => al[i] === "r" ? "-".repeat(x - 1) + ":" : "-".repeat(x)).join(" | ") + " |";
    return [line(all[0]), sep, ...all.slice(1).map(line)].join("\n");
  }
  const para = (...xs) => xs.filter(Boolean).join("\n\n");
  const bullets = xs => xs.filter(Boolean).map(s => "- " + s).join("\n");
  const exportedOn = now => calendar.formatLongDay(now || calendar.today());
  const asofTxt = () => {
    const at = String(INST.asof || ""), ad = calendar.formatAsOfDay(at), tm = at.slice(11, 16);
    return `${ad} ${!tm || tm === "16:00" ? "close" : tm + " ET"}`;
  };

  // ---------------------------------------------------------- number formats (as the summary and the views print them)
  const sgn = (v, t) => v < 0 && (t == null || +t !== 0) ? MINUS : "";
  const sgs = (v, t) => +t === 0 ? "" : v < 0 ? MINUS : "+";
  const num = (v, d, f) => { const t = Math.abs(v).toFixed(d); return f(v, t) + t; };
  const usd = x => { const a = Math.abs(x); return "$" + (a >= 20 || Math.abs(a - Math.round(a)) < 0.05 ? Math.round(a).toLocaleString("en-US") : a.toFixed(1)); };
  const fD = v => Number.isFinite(v) ? num(v, 0, sgn) + "Δ" : "–";
  const fM = v => Number.isFinite(v) ? num(v, 1, sgn) + "%" : "–";
  const fMs = v => Number.isFinite(v) ? num(v, 1, sgs) + "%" : "–";
  const fSg = v => Number.isFinite(v) ? num(v, 2, sgn) + "σ" : "–";
  const fSgs = v => Number.isFinite(v) ? num(v, 2, sgs) + "σ" : "–";
  const fN0 = (v, d = 2) => Number.isFinite(v) ? (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? MINUS : "") + Math.abs(v).toFixed(d) : "–";
  const fP0 = (v, d = 1) => Number.isFinite(v) ? (v < 0 && +Math.abs(v * 100).toFixed(d) !== 0 ? MINUS : "") + Math.abs(v * 100).toFixed(d) + "%" : "–";
  const zeroTxt = t => /\d/.test(t) && !/[1-9]/.test(t);
  function ratioTxt(x, y, fmt) {
    if (!(Number.isFinite(x) && Number.isFinite(y)) || Math.abs(y) <= 1e-12 || (fmt && zeroTxt(fmt(y)))) return "–";
    const r = x / y; return (Math.abs(r) < 0.005 ? "0.00" : fN(r, 2)) + "×";
  }
  const ivTxt = v => `${v > 0 ? "+" : MINUS}${+Math.abs(v).toFixed(2)} pts`;

  // ============================================================ Compare A vs B
  const LEGWORD = { put: "Short put", call: "Short call", wingCall: "Call wing (long)", wingPut: "Put wing (long)" };
  const BASISWORD = { delta: "Δ", money: "% OTM from the forward", sigma: "σ distance (own ATM σ√T)" };
  const sideTk = (C, side) => { const I = side === "A" ? C.instA : C.instB; return I ? I.name || I.id : (side === "A" ? C.A : C.B).tk; };
  const contractsK = C => C.h * C.A.S / C.B.S;
  const sizeName = C => (CTX.SIZES.find(s => s[0] === C.rule) || ["", C.rule])[1].toLowerCase();

  function placementTxt(P, b) {
    const bas = P.basis, f = v => RULE.fmtV(+v, bas);
    let s;
    if (P.structure === "straddle") s = P.values.center === "atm" ? "straddle at the strike nearest the forward (ATM)" : `straddle, center ${f(P.values.center)}`;
    else s = `${P.structure}, put ${f(P.values.put)} / call ${f(P.values.call)}${P.legs === "detached" ? ", legs set on their own" : ", legs together"}`;
    const w = [];
    for (const k of ["call", "put"]) { const x = P.wings && P.wings[k]; if (x && x.on) { const wb = x.basis || bas; w.push(`${k} wing ${RULE.fmtV(+x.value, wb)}${wb === "delta" ? "" : " past its short"}`); } }
    return `by ${BASISWORD[bas] || bas}: ${s}${w.length ? "; " + w.join(", ") : ""}${b && !b.na && b.kind && b.kind !== P.structure ? ` (resolved to a ${b.kind})` : ""}`;
  }
  function legRows(b) {
    return b.legs.map(l => {
      const w = l.qty > 0, wing = l.key === "wingCall" || l.key === "wingPut", bas = b.basis;
      const quote = `${fN(l.bid, 2)} / ${fN(l.mid, 2)} / ${fN(l.ask, 2)}${l.model ? " (model)" : ""}`;
      const fillWord = b.fill === "nat" ? (w ? "ask" : "bid") : "mid";
      const px = l.perContract, money = wing ? `${fM(l.achieved.money)} past short` : fM(l.achieved.money), sig = wing ? `${fSg(l.achieved.sigma)} past short` : fSg(l.achieved.sigma);
      const tgt = b.center && !wing ? (b.center.target === "atm" ? "ATM" : RULE.fmtV(+b.center.target, bas)) : Number.isFinite(+l.target) ? RULE.fmtV(+l.target, bas) : "–";
      return [(LEGWORD[l.key] || l.role) + (l.itm ? " (ITM)" : ""), fK(l.K) + l.cp, quote, `${l.fillPx.toFixed(2)} ${fillWord}`, `${px < 0 ? "debit" : "credit"} ${usd(px)}`, tgt, fD(l.achieved.delta), money, sig];
    });
  }
  const flagLine = f => `${f.severity === "warn" ? "! " : ""}${f.text}`;
  function sideBlock(C, side) {
    const b = side === "A" ? C.A : C.B, P = side === "A" ? C.Ap : C.Bp, I = side === "A" ? C.instA : C.instB, tk = sideTk(C, side);
    const head = `### ${side} · ${b.label.full}`;
    if (b.na) return para(head, `${side} is n/a: ${b.naReason || "no usable strikes"}.`, b.flags.length ? bullets(b.flags.map(flagLine)) : "");
    const ov = I && I.overridden ? ` (override; listed ${fPx2(I.spotListed)}${I.ivShift ? `, IV ${ivTxt(I.ivShift)}` : ""})` : "";
    const fwd = Math.abs(b.F / b.S - 1) > 0.01 ? ` · forward ${fPx2(b.F)}` : "";
    const intro = `${tk} at ${fPx2(b.S)}${ov}${fwd} · expiry ${fmtE(b.exp)}, ${b.dte} days · filled at ${b.fill === "nat" ? "natural (sell at the bid, buy at the ask)" : "mid"}. Placement ${placementTxt(P, b)}.`;
    const legs = table(["Leg", "Strike", "Bid / mid / ask", "Fill", "Per contract", "Target", "Δ", "% OTM", "σ"], legRows(b), ["l", "l", "r", "r", "r", "r", "r", "r", "r"]);
    const naW = b.flags.filter(f => f.code === "WING_NA").map(f => `${f.leg === "wingCall" ? "Call" : "Put"} wing n/a: ${f.text}.`);
    const n = b.net;
    let net = `**Net ${n.isDebit ? "debit" : "credit"} ${usd(n.perContract)} per contract** · ${Math.abs(n.pctOfSpot).toFixed(1)}% of spot`;
    if (b.intr > 0) net += ` · time value ${usd(b.tv * 100)} (intrinsic ${usd(b.intr * 100)} is paid back at expiry)`;
    if (side === "B" && !C.A.na) net += ` · sized ×${contractsK(C).toFixed(2)} B contracts per A contract (${C.cmp.sizing.rule === "auto" ? "auto: " : ""}${sizeName(C)}; h = ${C.h.toFixed(3)} × A's notional)`;
    const fl = b.flags.filter(f => f.code !== "WING_NA").map(flagLine);
    return para(head, intro, legs, naW.join(" "), net, fl.length ? "Flags:\n" + bullets(fl) : "");
  }
  // amber items that repeat a side's own flag (listed under that side) or its resolved kind (in the placement line)
  const FLAGGED = ["KIND", "WIDENED", "WING_NA", "CHAIN_END", "EXP_MAPPED", "NA"];
  function secComparison(C) {
    const d = C.diff, asked = d.items.filter(i => i.asked).map(i => i.text), amber = d.items.filter(i => !i.asked && !FLAGGED.includes(i.code)).map(i => i.text);
    const lead = d.identical ? "A and B are identical." : d.onlyInstrument ? "B follows A in every aspect except the instrument." : `B differs from A in: ${asked.length ? asked.join("; ") : "the instrument only"}.`;
    return para("## Comparison", lead + (amber.length ? "\n\nDifferences you did not ask for:\n" + bullets(amber) : ""), sideBlock(C, "A"), sideBlock(C, "B"),
      "$ per contract are per 100 shares: + credit for a short leg, − debit for a long wing. B's figures are per B contract, before the contract sizing.");
  }

  function secAssumptions(C) {
    const sc = C.scen, rows = [];
    const both = (label, f) => rows.push([label, f("A"), f("B")]);
    const bOf = s => s === "A" ? C.A : C.B, iOf = s => s === "A" ? C.instA : C.instB;
    both("Instrument", s => { const I = iOf(s); return I ? `${I.name || I.id}` : bOf(s).tk; });
    both("Spot", s => { const I = iOf(s); if (!I) return "–"; const o = Math.abs(I.spot - I.spotListed) > 1e-9 * I.spotListed; return o ? `${fPx2(I.spot)} (override; listed ${fPx2(I.spotListed)})` : `${fPx2(I.spot)} (listed)`; });
    both("IV shift on every quote", s => { const I = iOf(s); return I && I.ivShift ? `${ivTxt(I.ivShift)} (re-prices the entry)` : "none"; });
    both(`${labelListedVol()} (IBKR)`, s => { const I = iOf(s); return I ? fP(readListedVol(I), 0) : "–"; });
    both("Leverage", s => { const I = iOf(s); return I ? `${I.lev}×` : "–"; });
    both("Expiry", s => { const b = bOf(s); return b.exp ? `${fmtE(b.exp)} · ${Number.isFinite(b.dte) ? b.dte + " days" : "n/a"}` : "–"; });
    both("ATM IV at expiry", s => { const b = bOf(s); return b.E ? fP(b.E.atm, 1) : "–"; });
    both("Forward", s => { const b = bOf(s); return b.na ? "–" : fPx2(b.F); });
    const T = table(["", "A", "B"], rows, ["l", "r", "r"]);
    const odds = sc.dist === "rn" ? "implied, the risk-neutral distribution from each smile (EV is then fill vs mid, 0 at mid)" : `${labelListedVol()} × ${sc.hvk.toFixed(2)}, a zero-drift lognormal at IBKR's 30-day historical vol`;
    const rng = `${C.uLab(C.lo, C.unit)} to ${C.uLab(C.hi, C.unit)}${C.unit === "sig" && C.sigAxisLabel !== "σ" ? ` (${C.sigAxisLabel})` : ""}: ${sideTk(C, "A")} ${fPx2(C.toSA(C.lo))}–${fPx2(C.toSA(C.hi))}${C.same ? "" : `, ${sideTk(C, "B")} ${fPx2(C.toSB(C.lo))}–${fPx2(C.toSB(C.hi))}`}`;
    const unitW = { sig: "σ = each instrument's ATM vol at A's horizon × √T", pct: "% of spot", pts: `price points on ${sideTk(C, "A")}` }[C.unit];
    const wl = sc.wl === "view" ? "the view range" : `its own range, ${C.uLab(C.wlo, C.unit)} to ${C.uLab(C.whi, C.unit)}`;
    const shock = [sc.ivs ? `IV shock ${sc.ivs > 0 ? "+" : MINUS}${Math.abs(sc.ivs)} pts` : "", sc.svs ? `+${sc.svs} vol pts per −10% spot${sc.svd ? " (down only)" : ""}` : ""].filter(Boolean).join(", ");
    const items = [
      `Odds: ${odds}.`,
      `Move range ${rng}. Move unit ${unitW}. Worst loss is measured over ${wl}.`,
      C.unitsNote ? `Values: ${C.unitsNote}.` : "",
      `Pair sizing: ${C.cmp.sizing.rule === "auto" ? `auto (${sizeName(C)})` : sizeName(C)}, h = ${C.h.toFixed(3)}: B's notional is ${C.h.toFixed(2)}× A's${C.A.na || C.B.na ? "" : `, i.e. ×${contractsK(C).toFixed(2)} B contracts per A contract`}${C.hNote ? ` (${C.hNote})` : ""}.`,
      shock ? `Shocks after entry (marks before expiry and the pins only): ${shock}.` : "",
      C.cmp.expMap === "same" ? "B uses A's expiry only when its chain lists it." : ""
    ];
    return para("## Assumptions", T, bullets(items));
  }

  // the comparison table, row by row as renderCmp prints it (notes become prose above the table)
  const pairWorst = (C, a, b, h) => {
    if (!a || !b || a.na || b.na) return NaN;
    const us = []; for (let i = 0; i <= 400; i++) us.push(C.wlo + (C.whi - C.wlo) * i / 400);
    for (const [p, inv] of [[a, C.uOfSA], [b, C.uOfSB]]) for (const l of p.legs) { const u = inv(l.K); if (u > C.wlo && u < C.whi) us.push(u); }
    let w = Infinity; for (const u of us) w = Math.min(w, POS.payoff(a, C.toSA(u)) / a.S - h * POS.payoff(b, C.toSB(u)) / b.S); return w;
  };
  const pairPop = C => {
    const d = C.d, A = C.A, B = C.B; if (A.na || B.na || !d) return NaN; let pop = 0;
    for (let i = 1; i <= d.n; i++) { const mm = d.cdf[i] - d.cdf[i - 1]; if (mm <= 0) continue; const x = A.S * Math.exp((d.u[i] + d.u[i - 1]) / 2), v = POS.payoff(A, x) / A.S - C.h * POS.payoff(B, x) / B.S; if (v > 1e-9) pop += mm; }
    return pop;
  };
  const levTxt = () => INST.list().map(x => `${x.id} ${x.lev}×`).join(", ");
  function secResults(C) {
    const { A, B, sa, sb, h } = C, nA = A.na, nB = B.na, sc = C.scen, rows = [], notes = [], fU = C.fU;
    const a = (f, nn) => nn ? NaN : f, sB = v => v * h;
    const add = (label, va, vb, fmt, diff = true, rat = true) => rows.push([label, fmt(va), fmt(vb), diff && Number.isFinite(va) && Number.isFinite(vb) ? fmt(va - vb) : "", rat ? ratioTxt(va, vb, fmt) : ""]);
    const pair = C.same && C.sameExp && !nA && !nB;
    if (!C.same && A.tk !== B.tk) notes.push(`No correlation between ${A.tk} and ${B.tk} is modelled, so the pair column only shows figures that add up.`);
    else if (!C.sameExp) notes.push("A and B expire on different dates, so pair odds and pair worst loss at one expiry are not defined. The pair column only shows figures that add up.");
    for (const [t, x] of [["A", A], ["B", B]]) if (x.na) notes.push(`${t} is n/a: ${x.naReason}.`);
    if (C.unitsNote) notes.push(C.unitsNote + ".");
    const legsTxt = b => b.na ? "n/a" : b.label.tab;
    rows.push(["Legs", legsTxt(A), legsTxt(B), "", ""]);
    const anyI = (!nA && A.intr > 0) || (!nB && B.intr > 0), tvC = anyI ? " (on time value)" : "";
    const cv = (b, nn, k) => nn ? "–" : fU(k * b.cr / b.S) + (b.cr < 0 ? " net debit" : "") + (b.intr > 0 ? ` · time value ${fU(k * b.tv / b.S)}` : "");
    const ca = a(A.cr / A.S, nA), cb = a(sB(B.cr / B.S), nB), ta = a(A.tv / A.S, nA), tb = a(sB(B.tv / B.S), nB);
    rows.push([`Credit${anyI ? " (cash · time value)" : ""}`, cv(A, nA, 1), cv(B, nB, h), Number.isFinite(ca) && Number.isFinite(cb) ? fU(ca - cb) + (anyI ? ` · ${fU(ta - tb)}` : "") : "", anyI ? ratioTxt(ta, tb, fU) : ratioTxt(ca, cb, fU)]);
    add(`Credit/σ (size-free, own σ to expiry)${tvC}`, a(A.tv / (A.S * A.sig), nA), a(B.tv / (B.S * B.sig), nB), v => fN0(v, 3), false);
    add(`Credit per day${tvC}`, a(A.tv / A.S / A.dte, nA), a(sB(B.tv / B.S / B.dte), nB), v => fU(v, 3));
    add(`Expected value · ${sc.dist === "rn" ? "implied odds: fill vs mid, 0 at mid" : `${labelListedVol()} ×${sc.hvk.toFixed(2)} odds`}`, a(sa && sa.ev / A.S, nA), a(sb && sB(sb.ev / B.S), nB), v => fU(v, 2));
    rows.push([`Profit odds · ${sc.dist === "rn" ? "implied" : labelListedVol()} (P&L above 0 at expiry)`, nA || !sa ? "–" : fP(sa.pop, 0), nB || !sb ? "–" : fP(sb.pop, 0), pair ? fP(pairPop(C), 0) : "", ""]);
    const pw = pair ? pairWorst(C, A, B, h) : NaN;
    const wr = `${C.uLab(C.wlo, C.unit)} to ${C.uLab(C.whi, C.unit)}: ${C.same ? A.tk : sideTk(C, "A")} ${fPx2(C.toSA(C.wlo))}–${fPx2(C.toSA(C.whi))}${C.same ? "" : `, ${sideTk(C, "B")} ${fPx2(C.toSB(C.wlo))}–${fPx2(C.toSB(C.whi))}`}`;
    rows.push([`Worst loss within ${sc.wl === "view" ? "the view range" : "its own range"} (${wr})`, nA || !sa ? "–" : fU(sa.worst / A.S), nB || !sb ? "–" : fU(sB(sb.worst / B.S)), pair ? fU(pw) : "", nA || nB || !sa || !sb ? "" : ratioTxt(sa.worst / A.S, sB(sb.worst / B.S), fU)]);
    add("Vega per vol point", a(A.vega / 100 / A.S, nA), a(sB(B.vega / 100 / B.S), nB), v => fU(v, 2));
    add(`Margin (approx.: 20% × leverage, ${levTxt()}, Reg-T style)`, a(A.margin / A.S, nA), a(sB(B.margin / B.S), nB), v => fU(v).replace("+", ""), false);
    add(`Credit / margin${tvC}`, a(A.tv / A.margin, nA), a(B.tv / B.margin, nB), v => fP0(v, 1), false);
    const be = (b, s) => b.na || !s ? "–" : s.bes.length ? s.bes.map(fPx2).join(" / ") : "none";
    rows.push(["Breakevens", be(A, sa), be(B, sb), "", ""]);
    if (A.wingPx > 0 || B.wingPx > 0) {
      add("Wing cost", A.wingPx > 0 ? A.wingPx / A.S : NaN, B.wingPx > 0 ? sB(B.wingPx / B.S) : NaN, v => fU(v));
      const cw = (b, s) => b.cap && s ? `${fPx2(s.capBE)} · ${fP(s.pCap, 1)}` : "–", pwg = (b, s) => b.capP && s ? `${fPx2(s.capPBE)} · ${fP(s.pCapP, 1)}` : "–";
      if (A.cap || B.cap) rows.push(["Call wing pays above · odds (spot where the wing has paid for itself)", cw(A, sa), cw(B, sb), "", ""]);
      if (A.capP || B.capP) rows.push(["Put wing pays below · odds (spot where the wing has paid for itself)", pwg(A, sa), pwg(B, sb), "", ""]);
    }
    const hb = Math.abs(h - 1) > 0.005 ? ` ×${h.toFixed(2)}` : "";
    const T = table(["", "A", "B" + hb, "A − " + C.hTxt(), "A / B"], rows);
    return para("## Results", `Values are ${C.unitName()}; B is scaled by h = ${h.toFixed(3)}. Ratios use time value.`, notes.join(" "), T);
  }

  // recovery dynamics, as renderRecovery computes it
  function recRun(C, b, who, vw) {
    if (!b || b.na) return null;
    const capPS = vw.rdCap === "margin" ? b.margin : b.S;
    const hv = C.statsHV(b), ev = hv ? hv.ev : NaN, g = vw.rdG === "custom" ? vw.rdGc / 100 : ev / capPS;
    let L, xMove = null;
    if (vw.rdHit === "fixed") L = vw.rdL / 100;
    else {
      const sg = b.sig, dn = b.S * Math.exp(-vw.rdK * sg), up = b.S * Math.exp(vw.rdK * sg);
      const lDn = -POS.payoff(b, dn) / capPS, lUp = -POS.payoff(b, up) / capPS;
      if (vw.rdDir === "down") { L = lDn; xMove = dn; } else if (vw.rdDir === "up") { L = lUp; xMove = up; } else { L = Math.max(lDn, lUp); xMove = lDn >= lUp ? dn : up; }
    }
    return { b, who, g, L, xMove, days: b.dte };
  }
  function recCycles(L, g, kind, base) {
    if (!(L > 0)) return 0;
    if (!(g > 0)) return Infinity;
    const lg = Math.log(1 + g);
    if (base === "nav" || kind === "rec") return L >= 1 ? Infinity : -Math.log(1 - L) / lg;
    return Math.log(1 + L) / lg;
  }
  function recTime(n, days, L, t0) {
    if (L >= 1) return "wiped out (the hit exceeds the capital)";
    if (!Number.isFinite(n)) return "never (growth cannot get there)";
    if (n === 0) return "none needed";
    const N = Math.ceil(n - 1e-9), wk = N * days / 7;
    return `${wk >= 104 ? `${(N * days / 365.25).toFixed(1)} yr` : `${wk.toFixed(1)} wk`} · ${N} cycle${N === 1 ? "" : "s"} (${n.toFixed(1)} needed) · ${calendar.formatDayAfter({ startMs: t0, days: N * days })}`;
  }
  const growthTxt = g => { if (!Number.isFinite(g)) return "–"; const t = Math.abs(g * 100).toFixed(2); return (+t === 0 ? "" : g > 0 ? "+" : MINUS) + t + "%"; };
  function secRecovery(C) {
    const vw = C.view, base = vw.rdBase, runs = [recRun(C, C.A, "A", vw), recRun(C, C.B, "B", vw)];
    const asof = calendar.readUtcDayStart(INST.asof), t0 = Number.isFinite(asof) ? asof : calendar.nowMs();
    const hitTxt = vw.rdHit === "fixed" ? `a fixed ${vw.rdL}% hit` : `a ${vw.rdK}σ move to its own expiry, ${vw.rdDir === "worse" ? "the worse side" : vw.rdDir}`;
    const col = f => runs.map(r => r ? f(r) : "n/a");
    const rows = [
      ["Position", ...col(r => r.b.label.full)],
      ["Cycle", ...col(r => `${r.days} days`)],
      [`Growth per cycle${vw.rdG === "ev" ? ` (EV at ${labelListedVol()} odds on ${vw.rdCap === "margin" ? "margin" : "notional"})` : " (set by hand)"}`, ...col(r => growthTxt(r.g))],
      [`Hit (% of ${base === "nav" ? "NAV when it lands" : "starting capital"})`, ...col(r => (r.L > 0 ? MINUS + (r.L * 100).toFixed(0) + "%" : "no loss") + (r.xMove ? ` at ${fPx2(r.xMove)}` : ""))],
      ["Recovery (hit first)", ...col(r => recTime(recCycles(r.L, r.g, "rec", base), r.days, r.L, t0))],
      ["Buffer (climb first)", ...col(r => recTime(recCycles(r.L, r.g, "buf", base), r.days, base === "nav" ? r.L : 0, t0))]
    ];
    return para("## Recovery dynamics", `How many cycles of normal compounding one bad hit is worth. The hit is ${hitTxt}; a cycle rolls the same tenor, whole cycles round up, and dates count from ${asofTxt().replace(/ (close|\d\d:\d\d ET)$/, "")}.${base === "nav" ? " Measured against NAV when it lands, recovery and buffer take the same time at a constant growth rate." : ""}`,
      table(["", "A", "B"], rows, ["l", "l", "l"]));
  }

  function secPins(C) {
    const pins = C.view.pins || [];
    if (!pins.length) return "";
    const { A, B } = C, hb = Math.abs(C.h - 1) > 0.005 ? ` ×${C.h.toFixed(2)}` : "";
    const rows = pins.map((p, k) => {
      const a = A.na ? NaN : POS.val(A, p.SA, Math.max(0, A.dte - p.dA) / 365, C.shock) / A.S, b = B.na ? NaN : C.h * POS.val(B, p.SB, Math.max(0, B.dte - p.dB) / 365, C.shock) / B.S;
      const out = !(C.uOfSA(p.SA) >= C.lo && C.uOfSA(p.SA) <= C.hi);
      const scen = `${C.same ? A.tk : sideTk(C, "A")} ${fPx2(p.SA)} ${fS(p.SA / A.S - 1, 1)}${C.same ? "" : ` · ${sideTk(C, "B")} ${fPx2(p.SB)} ${fS(p.SB / B.S - 1, 1)}`}${out ? " (outside the range)" : ""}`;
      const when = `${Math.abs(p.dA - p.dB) < 0.05 ? `day ${+p.dA.toFixed(1)}` : `A day ${+p.dA.toFixed(1)}, B day ${+p.dB.toFixed(1)}`}${p.dA >= A.dte ? " · A at expiry" : ""}${p.dB >= B.dte && !(C.same && B.dte === A.dte) ? " · B at expiry" : ""}`;
      return [String(k + 1), scen, when, C.fU(a), C.fU(b), C.fU(a - b)];
    });
    return para("## Pinned scenarios", `Mark-to-model P&L at each pin, ${C.unitName()}.`, table(["Pin", "Scenario", "When", "A", "B" + hb, "A − " + C.hTxt()], rows, ["r", "l", "l", "r", "r", "r"]));
  }

  // the overview table: every instrument × expiry with A's rule, with and without wings (renderOvTable)
  function secOverview(C) {
    const w = C.Ap.wings, any = !!(w.call.on || w.put.on);
    const off = { call: { on: false, value: +w.call.value }, put: { on: false, value: +w.put.value } };
    const on = any ? { call: { on: !!w.call.on, value: +w.call.value }, put: { on: !!w.put.on, value: +w.put.value } } : { call: { on: true, value: +w.call.value }, put: { on: false, value: +w.put.value } };
    const cells = [];
    INST.list().forEach((it, i) => { const I = INST.make({ id: it.id }); if (!I) return; [off, on].forEach((wings, j) => { for (const e of I.expiries) { const b = POS.build(Object.assign({}, C.Ap, { inst: { id: it.id }, exp: e, wings })); cells.push({ i, j, b, sx: b.na ? null : C.sFor(b, C.ax.toS(b)) }); } }); });
    cells.sort((a, b) => (a.b.dte - b.b.dte) || a.j - b.j || a.i - b.i);
    const anyI = cells.some(c => !c.b.na && c.b.intr > 0);
    const rows = cells.map(({ b, sx }) => {
      const wf = b.na ? null : b.flags.find(f => f.code === "WING_NA"), name = b.na ? b.label.short : `${b.label.short} · ${b.label.tab.slice(b.tk.length + 1)}${wf ? ` (${wf.leg === "wingPut" ? "put" : "call"} wing n/a)` : ""}`;
      if (b.na || !sx) return [name, "n/a: " + b.naReason, "", "", "", "", "", "", "", ""];
      const own = (v, d, z) => (z ? fS : fP0)(v, d), hv = C.statsHV(b), wp = b.cap ? sx.pCap : b.capP ? sx.pCapP : NaN;
      return [name, own(b.tv / b.S, 1) + (b.intr > 0 ? ` (cash ${own(b.cr / b.S, 1)})` : ""), fN0(b.tv / (b.S * b.sig), 3), own(b.tv / b.S / b.dte, 3), hv ? own(hv.ev / b.S, 2, true) : "–", fP(sx.pop, 0), own(sx.worst / b.S, 1, true),
        b.wingPx > 0 ? `${own(b.wingPx / b.S, 1)} · pays ${Number.isFinite(wp) ? fP(wp, 0) : "–"}` : "–", fP0(b.tv / b.margin, 1), sx.bes.length ? sx.bes.map(fPx2).join(" / ") : "none"];
    });
    const P = C.Ap, place = P.structure === "straddle" ? (P.values.center === "atm" ? "the strike nearest the forward" : `center ${RULE.fmtV(+P.values.center, P.basis)}`) : `${RULE.fmtV(+P.values.put, P.basis)} put, ${RULE.fmtV(+P.values.call, P.basis)} call`;
    return para("## Overview", `A's ${P.structure} placed by A's rule (${place}), filled at ${P.fill === "mid" ? "mid" : "natural"}, on every listed expiry at listed spot and IV, with and without wings. Values are % of each position's own notional. Profit odds are ${C.scen.dist === "rn" ? "implied" : labelListedVol()}; EV uses ${labelListedVol()}.`,
      table(["Position", anyI ? "Credit, time value" : "Credit", "Credit / σ", "Credit per day", `EV (${labelListedVol()})`, "Profit odds", "Worst loss", "Wing cost · pays odds", "Credit / margin", "Breakevens"], rows));
  }

  function secNotes(C, withFlags, withResults) {
    const xs = [];
    if (withFlags) for (const f of C.flags) xs.push(`${f.side}: ${flagLine(f)}`);
    if (C.hNote) xs.push(`Sizing: ${C.hNote}.`);
    if (C.clampNote) xs.push(C.clampNote + ".");
    if ((C.instA && C.instA.overridden) || (C.instB && C.instB.overridden)) xs.push("A spot or IV override re-prices every quote of that instrument from the model; its credit comes from model quotes.");
    if (!withResults) xs.push(`Margin is approximate (Reg-T style, 20% × leverage); IBKR's real leveraged-ETF requirement may differ.`);
    xs.push(`Not modelled: ${withResults && !C.same ? "" : "correlation between instruments, "}early assignment (flagged only), dividends, leveraged-ETF path decay beyond what the smile implies.`);
    return para("## Notes", bullets(xs));
  }

  function toMarkdownCompare(C, S9, opts = {}) {
    const on = pick(CMP_SECTIONS, opts.sections), out = [];
    if (on.header) {
      const I = INST.list().map(x => INST.base(x.id)).filter(Boolean);
      out.push(para(`# ${C.labels.title}`, `RAM · KORU options lab, Compare A vs B · IBKR quotes at ${asofTxt()} (spot ${I.map(x => `${x.id} ${fPx2(x.spotListed)}`).join(", ")}) · exported ${exportedOn(opts.now)}`,
        opts.code ? `View code (paste into ⋯ → Load a view code, or append to the lab's address): #${opts.code}` : ""));
    }
    if (on.comparison) out.push(secComparison(C));
    if (on.assumptions) out.push(secAssumptions(C));
    if (on.results) out.push(secResults(C));
    if (on.recovery) out.push(secRecovery(C));
    if (on.pins) { const p = secPins(C); if (p) out.push(p); }
    if (on.overview) out.push(secOverview(C));
    if (on.notes) out.push(secNotes(C, !on.comparison, on.results));
    return out.filter(Boolean).join("\n\n") + "\n";
  }

  // ============================================================ Compounding
  const f$ = v => !Number.isFinite(v) ? "–" : (v < 0 ? MINUS : "") + "$" + (Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toFixed(2) + "B" : Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? (Math.abs(v) / 1e3).toFixed(1) + "k" : Math.round(Math.abs(v)).toLocaleString("en-US"));
  const fPc = (v, d = 1) => !Number.isFinite(v) ? "–" : (v < 0 ? MINUS : "") + Math.abs(v * 100).toFixed(d) + "%";
  const fPs = (v, d = 1) => !Number.isFinite(v) ? "–" : (v > 0 ? "+" : v < 0 ? MINUS : "") + Math.abs(v * 100).toFixed(d) + "%";
  const fX = v => "×" + (v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const fKs = K => "$" + (+(+K).toFixed(2));
  const fInt = v => Math.round(v).toLocaleString("en-US");
  const hasYRE = () => typeof YRE !== "undefined";
  const famTxt = r => r.fam === "cc" ? (r.puts ? "covered strangle" : r.cd >= 50 ? "ITM covered calls" : "covered calls") : (r.pd > 50 && r.cd > 50 ? "short guts" : r.cd === 50 && r.pd === 50 ? "straddle" : "strangle") + (r.wcd || r.wpd ? " + wings" : "");
  const cadTxt = r => r.cad === "wk" ? "weekly" : "monthly";
  const modusTxt = m => `${{ reinvest: "reinvest", rebal: "rebalance", cash: "keep as cash" }[m.credit]} · ${m.call === "ibkr" ? "IBKR minimum" : `back to ${(+m.target).toFixed(2)}x`} · ${m.move === "keep" ? "keeps trading" : "stops"}`;
  const defTxt = r => `${r.tk} · ${cadTxt(r)} · ${famTxt(r)} · ${r.fam === "cc" ? `call ${r.cd}Δ${r.puts ? `, put ${r.pd}Δ` : ""} · ${r.lev.toFixed(2)}x` : `put ${r.pd}Δ / call ${r.cd}Δ · ${Math.round(r.use * 100)}% of margin`}${r.wcd || r.wpd ? ` · wings ${[r.wpd ? r.wpd + "Δ put" : "", r.wcd ? r.wcd + "Δ call" : ""].filter(Boolean).join(" / ")}` : ""}`;
  const BDIFFW = { strategy: "strategy", ticker: "ticker", cadence: "cadence", strikes: "strikes", size: "size", modus: "modus operandi", vol: "IV and moves", any: "anything" };
  const runsOf = res => [["A", res && res.A], ["B", res && res.B]].filter(x => x[1]);

  function ySecRuns(ys, res) {
    const rows = runsOf(res).map(([w, R]) => [w, defTxt(R.run), modusTxt(R.run.modus)]);
    return para("## Runs", res.B ? `B differs from A in: ${BDIFFW[ys.bDiff] || ys.bDiff}.` : "One run (no B).", table(["Run", "What is sold", "Modus operandi (credit · margin call · during a move)"], rows, ["l", "l", "l"]));
  }
  function ySecBase(ys, res) {
    const sc = ys.sc, p = sc.path, W = sc.W, tks = [...new Set(runsOf(res).map(([, R]) => R.run.tk))], tkA = res.A.run.tk;
    const m = res.mult || [], endM = m.length ? m[m.length - 1] : 1;
    const pathTxt = p.mode === "flat" ? `flat at ${fKs(sc.S0[tkA])}` : p.mode === "line" ? `a line from ${fKs(sc.S0[tkA])} to ${fKs(p.end * sc.S0[tkA])}${p.geo ? " (same % each week)" : ""}` : p.mode === "growth" ? `growth of ${p.gUnit === "yr" ? fPc(p.g, 1) + " a year" : (+p.g).toFixed(3) + "% a week"}, ending at ${fKs(endM * sc.S0[tkA])}` : `${p.pts.length} point${p.pts.length === 1 ? "" : "s"} (${p.pts.map(x => `wk ${x[0]} ${fKs(x[1] * sc.S0[tkA])}`).join(", ")}), ending at ${fKs(endM * sc.S0[tkA])}`;
    const start = hasYRE() ? ` from ${calendar.formatShortUtcDay(YRE.START)} to ${calendar.formatShortUtcDay(YRE.weekDate(W))}` : "";
    const vol = [];
    for (const tk of tks) vol.push([tk, `${sc.iv[tk]}%`, `${sc.rv[tk]}%`]);
    if (res.B && ys.bDiff === "vol") vol.push([`B ${res.B.run.tk}`, `${sc.ivB[res.B.run.tk]}%`, `${sc.rvB[res.B.run.tk]}%`]);
    const ivp = ys.ivp, ivA = sc.iv[tkA];
    const ivpTxt = ivp.mode === "flat" ? "flat, IV stays at the input all year" : `${ivp.mode === "line" ? `a line to ${Math.round(ivp.end * ivA)}% at week ${W}` : ivp.mode === "growth" ? `${ivp.g}% a year` : `${ivp.pts.length} points (${ivp.pts.map(x => `wk ${x[0]} ${Math.round(x[1] * ivA)}%`).join(", ")})`}; ${ivp.rule === "gap" ? "realized moves keep their gap to IV" : "realized moves stay constant"}`;
    return para("## Base", bullets([`Start $${fInt(sc.cap0)}, ${W} weeks${start}.`, `Price path (${tkA}, typical price each week, never falls): ${pathTxt}.`, `IV path ${ivpTxt}.`]),
      table(["Ticker", "Implied vol (prices every option)", "Realized moves around the path"], vol), "The gap between implied vol and realized moves is the edge: premium is priced at IV, payouts settle over moves at the realized number.");
  }
  function ySecStrip(ys, res) {
    const typ = ys.view.reading === "typ", cap0 = ys.sc.cap0, W = ys.sc.W;
    const rows = runsOf(res).map(([w, R]) => {
      const z = R.main.end, ex = R.exact.end, cc = R.run.fam === "cc", big = typ ? z.med : z.avg;
      return [w, `${f$(big)} ${fX(big / cap0)}`, `${f$(z.c10)} – ${f$(z.c90)}`, z.called > 0.0005 ? `${fPc(z.called, 0)} (${cc ? "on drops" : "either way"})` : "none",
        cc ? `${fInt(z.shMed)} shares · ${Math.min(z.lots, ys.costs.liq || 1e9)} lots` : `${Math.floor(z.kMed + 1e-9)} contracts`, f$(typ ? z.avg : z.med), f$(ex.med)];
    });
    return para("## Result", `NAV at week ${W} from $${fInt(cap0)}. The main number is the ${typ ? "typical (median)" : "average"} year.`,
      table(["Run", `${typ ? "Typical" : "Average"} NAV, week ${W}`, "10%–90% of years", "Margin call in the year", "Size (typical)", typ ? "Average" : "Typical", "Exactly on the path"], rows));
  }
  function ySecWeeks(ys, res) {
    const out = ["## Week by week"];
    for (const [w, R] of runsOf(res)) {
      const cc = R.run.fam === "cc";
      /** @type {any[][]} column label, row formatter */
      const cols = [["Week", r => r.w1], ["Expiry", r => calendar.formatShortUtcDay(r.date)], ["Days", r => r.days], ["Price", r => fKs(r.S0)], ["Strikes", r => [r.Kp ? fKs(r.Kp) + "P" : "", r.Kc ? fKs(r.Kc) + "C" : ""].filter(Boolean).join(" / ")], ["Δ", r => [r.Kp ? (r.dp * 100).toFixed(0) : "", r.Kc ? (r.dc * 100).toFixed(0) : ""].filter(Boolean).join(" / ")], ["% away", r => [r.Kp ? fPs(r.Kp / r.S0 - 1, 0) : "", r.Kc ? fPs(r.Kc / r.S0 - 1, 0) : ""].filter(Boolean).join(" / ")],
        ["Premium", r => fPc((r.pc + r.pp) / r.S0, 2)], ["Time value", r => fPc((r.tvc + r.tvp) / r.S0, 2)], [cc ? "Shares" : "Contracts", r => cc ? fInt(r.shMed) : Math.floor(r.kMed)], ...(cc ? [["Lots", r => r.lots]] : []), ["NAV typical", r => f$(r.med)], ["10%", r => f$(r.c10)], ["90%", r => f$(r.c90)], ["Average", r => f$(r.avg)], ["Credit", r => f$(r.credit)], ["Margin call so far", r => fPc(r.called, 1)], ["Cushion", r => r.cush < 1 ? fPs(-r.cush, 0) : "–"], ...(cc ? [["Typical λ", r => r.lamTyp.toFixed(2)]] : [])];
      out.push(`### ${w} · ${defTxt(R.run)}`, table(cols.map(c => c[0]), R.main.rows.map(r => cols.map(c => String(c[1](r)))), cols.map(() => "r")));
    }
    return out.join("\n\n");
  }
  function scenTxt(S) {
    const x = `${S.X > 0 ? "+" : S.X < 0 ? MINUS : ""}${Math.abs(S.X)}%${S.unit === "index" ? " on the index" : ""}`;
    return S.shape === "gap" ? `gap ${x}` : S.shape === "run" ? `${S.k} weekly gaps of ${x}` : S.shape === "dd" ? `drawdown ${x} over ${S.n} weeks` : `spike ${x}, back after ${S.back} sessions`;
  }
  function ySecStress(ys, sres) {
    if (!sres || !sres.A || !sres.A.cur) return "";
    const S = ys.ss || {}, wk = sres.week, runs = [["A", sres.A], ["B", sres.B]].filter(x => x[1]);
    const rows = runs.map(([w, o]) => {
      const r = o.cur, c = r.ev.call, nb = r.navBefore, cc = o.R.run.fam === "cc", sn = o.snaps[wk - 1];
      let used = "";
      if (typeof YRS !== "undefined" && YRS.margin) { const u = YRS.margin(sn, sn.S, sn.iv, sn.el0 || 0, o.rules.mAfter); used = `${fPc(u.req / Math.max(1, u.elv), 0)} of margin`; }
      const before = `${f$(nb)}${cc ? ` · ${(sn.n * sn.S / Math.max(1, nb)).toFixed(2)}x` : ""}${used ? " · " + used : ""}`;
      const room = o.room ? `margin call at ${o.room.callDown != null ? fPs(o.room.callDown, 0) : "no drop"}${o.room.callUp != null ? ` or ${fPs(o.room.callUp, 0)}` : cc ? " (no call on rallies)" : ""}, NAV 0 at ${o.room.zeroDown != null ? fPs(o.room.zeroDown, 0) : "no drop"}` : "–";
      return [w, before, `${fPs(-r.lossLow / nb)} (${f$(-r.lossLow)})`, `${fPs(-r.lossEnd / nb)} (${f$(-r.lossEnd)})`,
        c ? `day ${c.day} at ${fKs(c.x)}, sold ${fPc(r.ev.sold / Math.max(1, r.ev.n0), 0)} of shares${r.ev.closedAt ? " · closed" : ""}` : "none",
        r.ev.deficit > 0 ? `you owe IBKR ${f$(r.ev.deficit)}` : "none", o.given > 1 ? f$(o.given) : "–", room];
    });
    // the deficit and upside-given-up columns only when a run has one, as the strip shows them
    const keep = [0, 1, 2, 3, 4, ...(runs.some(([, o]) => o.cur.ev.deficit > 0) ? [5] : []), ...(runs.some(([, o]) => o.given > 1) ? [6] : []), 7];
    const head = ["Run", "Before the move", "At the low", "End of the move", "Margin call", "Deficit", "Upside given up (not a loss)", "Room this week"], al = ["l", "r", "r", "r", "l", "l", "r", "l"];
    const when = hasYRE() ? ` (${calendar.formatShortUtcDay(YRE.weekDate(wk - 1))})` : "";
    return para("## Stress", `Scenario: ${scenTxt(S)}, landing in week ${wk}${when}${S.week === "worst" ? ", the week of A's largest loss" : ""}. IV after the move: +${S.ivDown} pts per 10% drop, +${S.ivUp} per 10% rise, capped at ${S.ivCap}%.`,
      table(keep.map(i => head[i]), rows.map(r => keep.map(i => r[i])), keep.map(i => al[i])));
  }
  function ySecRandom(ys, mc) {
    if (!mc || !mc.parts || !mc.parts.length) return "";
    const qn = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
    const rows = mc.parts.map(P => {
      const e = P.out.map(o => o.end).sort((a, b) => a - b), dd = P.out.map(o => o.dd).sort((a, b) => a - b), n = e.length, w5 = e.slice(0, Math.max(1, Math.floor(n * 0.05))), pc = P.out.reduce((t, o) => t + o.call, 0) / n, se = Math.sqrt(pc * (1 - pc) / n);
      return [P.who, f$(qn(e, .05)), f$(qn(e, .1)), f$(qn(e, .5)), f$(qn(e, .9)), f$(qn(e, .95)), f$(w5.reduce((a, b) => a + b, 0) / w5.length), `${fPc(qn(dd, .5), 0)} / ${fPc(qn(dd, .9), 0)}`, `${fPc(pc, 1)} ± ${(se * 100).toFixed(1)}`, fPc(P.out.reduce((t, o) => t + o.wiped, 0) / n, 1)];
    });
    const chk = mc.parts.map(P => { const e = P.out.map(o => o.end).sort((a, b) => a - b), med = qn(e, .5), pc = P.out.reduce((t, o) => t + o.call, 0) / e.length; return `${P.who}: median ${f$(med)} vs the engine's ${f$(P.R.main.end.med)} (${fPs(med / P.R.main.end.med - 1)}), margin call ${fPc(pc, 0)} vs ${fPc(P.R.main.end.called, 0)}`; });
    const M = ys.mc || {};
    return para("## Random years", `${(mc.parts[0].out.length).toLocaleString("en-US")} paths per run${M.seed != null ? `, seed ${M.seed}` : ""}. Plain lognormal daily moves, no jumps; each run sees the same random paths.${mc.stale ? " **The inputs changed since this run: these figures are stale.**" : ""}`,
      table(["Run", "5%", "10%", "Median", "90%", "95%", "Worst 5% avg", "Drawdown med / 90%", "≥ 1 margin call", "NAV ≤ 0"], rows), "Check against the engine: " + chk.join("; ") + ".");
  }
  function toMarkdownCompounding(ys, res, opts = {}) {
    const on = pick(YR_SECTIONS, opts.sections), out = [];
    if (!ys || !res || !res.A) return "# Compounding\n\nNo results yet: open the Compounding tab once.\n";
    const stress = ys.view && ys.view.v === "stress";
    out.push(para(`# Compounding · ${runsOf(res).map(([w, R]) => `${w} ${R.run.tk} ${cadTxt(R.run)} ${famTxt(R.run)}`).join(" vs ")}`,
      `RAM · KORU options lab, Compounding · a model year on your price path, not market quotes · exported ${exportedOn(opts.now)}`,
      opts.code ? `View code (paste into ⋯ → Load a view code, or append to the lab's address): #${opts.code}` : ""));
    if (on.runs) out.push(ySecRuns(ys, res));
    if (on.base) out.push(ySecBase(ys, res));
    if (on.strip) out.push(ySecStrip(ys, res));
    if (on.weeks) out.push(ySecWeeks(ys, res));
    if (on.stress && stress) out.push(ySecStress(ys, opts.sres));
    if (on.random) out.push(ySecRandom(ys, opts.mc));
    return out.filter(Boolean).join("\n\n") + "\n";
  }

  // ============================================================ the menu entry
  // opts = {tab(), readState(), code(), save()}
  let H = null;
  const yrView = () => { try { const s = typeof YR !== "undefined" && YR._state ? YR._state() : null; return s && s.view ? s.view : null; } catch (e) { return null; } };
  const MEM = { compare: null, yr: null };
  const secKey = t => t === "yr" ? "exportYr" : "exportCmp";
  function getSecs(t) { const v = yrView(), list = t === "yr" ? YR_SECTIONS : CMP_SECTIONS; return pick(list, (v && v[secKey(t)]) || MEM[t]); }
  function setSec(t, k, on) {
    const cur = getSecs(t); cur[k] = on; MEM[t] = cur;
    const v = yrView(); if (v) v[secKey(t)] = cur;
    if (H && H.save) H.save();
  }
  function makeExport() {
    const t = H.tab();
    if (t === "yr") {
      const y = YR._state(), r = YR._res();
      return { md: EXPORT9.toMarkdownCompounding(y, r, { sections: getSecs("yr"), sres: YR._sres ? YR._sres() : null, mc: YR._mc ? YR._mc() : null, code: H.code() }), name: "compounding" };
    }
    const s = H.readState();
    return { md: EXPORT9.toMarkdownCompare(CTX.ctx9(s), s, { sections: getSecs("compare"), code: H.code() }), name: "compare" };
  }
  function syncSecs() {
    const t = H.tab(), list = t === "yr" ? YR_SECTIONS : CMP_SECTIONS, on = getSecs(t), host = document.querySelector("#xsecs");
    const tw = document.querySelector("#xtab"); if (tw) tw.textContent = t === "yr" ? "· Compounding" : "· Compare A vs B";
    if (!host) return;
    host.innerHTML = list.map(([k, l]) => `<label class="chk"><input type="checkbox" data-x="${k}"${on[k] ? " checked" : ""}>${l}</label>`).join("");
  }
  function wire(opts) {
    H = opts; const q = s => document.querySelector(s);
    if (!q("#xcopy")) return;
    q("#xcopy").addEventListener("click", () => { let r; try { r = makeExport(); } catch (e) { console.error("export", e); page.bus.emit(createNoticeEnvelope({ text: "The export failed" })); return; } copyText({ text: r.md, fallbackField: q("#xfall") }); });
    q("#xdl").addEventListener("click", async () => {
      let r; try { r = makeExport(); } catch (e) { console.error("export", e); page.bus.emit(createNoticeEnvelope({ text: "The export failed" })); return; }
      const saved = await download.saveTextFile({ filename: `ram-koru-lab-${r.name}-${calendar.formatIsoDay(calendar.today())}.md`, text: r.md });
      if (saved.ok) { page.bus.emit(createNoticeEnvelope({ text: saved.value.status === "declined" ? "Download cancelled" : "Downloaded " + saved.value.filename })); return; }
      console.error("download", saved.error); page.bus.emit(createNoticeEnvelope({ text: "The download failed: " + saved.error.message }));
    });
    q("#xsecs").addEventListener("change", e => { const c = e.target.closest("input[data-x]"); if (c) setSec(H.tab(), c.dataset.x, c.checked); });
    q("#pmenu").addEventListener("toggle", () => { if (q("#pmenu").open) { q("#xfall").hidden = true; syncSecs(); } });
    syncSecs();
  }
  return Object.freeze({ toMarkdownCompare, toMarkdownCompounding, wire, CMP_SECTIONS, YR_SECTIONS, table });
})();
