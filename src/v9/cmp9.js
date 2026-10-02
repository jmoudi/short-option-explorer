// ============================================================ cmp9: the comparison model (pure)
// One namespace object, CMP. A Comparison holds A (a full Position), B's own values per aspect (absent until set,
// kept as a stash while linked), one link per aspect, the expiry mapping rule and the sizing rule.
// Every mutator is pure: (c, ...) -> { c: newComparison, events: [Event] }. Inputs are never modified.
const CMP = (() => {
  const ASPECTS = Object.freeze(["inst", "exp", "structure", "legs", "placement", "wingCall", "wingPut", "fill"]);
  const NAMES = Object.freeze({ inst: "instrument", exp: "expiry", structure: "structure", legs: "legs", placement: "strikes", wingCall: "protective call", wingPut: "protective put", fill: "fill" });
  const UNL = Object.freeze({
    inst: "B's instrument is now set on its own", exp: "B's expiry is now set on its own", structure: "B's structure is now set on its own",
    legs: "B's legs are now set on their own", placement: "B's strikes are now set on their own", wingCall: "B's protective call is now set on its own",
    wingPut: "B's protective put is now set on its own", fill: "B's fill is now set on its own"
  });
  const SIZE_RULES = Object.freeze(["auto", "notional", "credit", "vega", "loss", "margin", "custom"]);
  const STRUCTS = ["straddle", "strangle"], LEGSM = ["together", "detached"], FILLS = ["mid", "nat"];
  const ACH_TOL = Object.freeze({ delta: 3, money: 1.5, sigma: 0.10 });   // amber trigger 6
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const fillWord = f => f === "nat" ? "natural" : "mid";
  const wingAspect = s => s === "call" ? "wingCall" : "wingPut";

  // ---------------------------------------------------------- aspects <-> paths
  function aspectOf(path) {
    const p = String(path), h = p.split(".")[0];
    if (h === "inst") return "inst";
    if (h === "basis" || h === "values") return "placement";
    if (p === "wings.call" || p.startsWith("wings.call.")) return "wingCall";
    if (p === "wings.put" || p.startsWith("wings.put.")) return "wingPut";
    if (ASPECTS.includes(h)) return h;
    return null;
  }
  function fromA(A, a) {
    switch (a) {
      case "placement": return { basis: A.basis, values: clone(A.values) };
      case "wingCall": return { on: !!A.wings.call.on, value: +A.wings.call.value };
      case "wingPut": return { on: !!A.wings.put.on, value: +A.wings.put.value };
      default: return clone(A[a]);
    }
  }
  function ownGet(B, a) {
    if (!B) return undefined;
    switch (a) {
      case "placement": return B.basis !== undefined && B.values ? { basis: B.basis, values: B.values } : undefined;
      case "wingCall": return B.wings && B.wings.call ? B.wings.call : undefined;
      case "wingPut": return B.wings && B.wings.put ? B.wings.put : undefined;
      default: return B[a];
    }
  }
  function ownSet(B, a, v) {
    switch (a) {
      case "placement": B.basis = v.basis; B.values = clone(v.values); break;
      case "wingCall": B.wings = B.wings || {}; B.wings.call = { on: !!v.on, value: +v.value }; break;
      case "wingPut": B.wings = B.wings || {}; B.wings.put = { on: !!v.on, value: +v.value }; break;
      default: B[a] = clone(v);
    }
  }

  // ---------------------------------------------------------- resolving B
  function resolveB(c) {
    const A = c.A, B = c.B || {}, L = c.links;
    const get = a => L[a] ? fromA(A, a) : ownGet(B, a) !== undefined ? clone(ownGet(B, a)) : fromA(A, a);
    const pl = get("placement");
    const wing = (s) => L[wingAspect(s)] ? Object.assign(fromA(A, wingAspect(s)), { basis: A.basis }) : get(wingAspect(s));
    return {
      inst: get("inst"), exp: get("exp"), structure: get("structure"), legs: get("legs"),
      basis: pl.basis, values: pl.values, wings: { call: wing("call"), put: wing("put") }, fill: get("fill")
    };
  }
  const buildA = c => POS.build(c.A);
  const buildB = c => POS.build(resolveB(c), { expMap: c.expMap });
  const effBasisB = c => c.links.placement ? c.A.basis : (c.B && c.B.basis) || c.A.basis;
  const legOf = (b, role) => b && !b.na ? b.legs.find(l => l.role === role) || null : null;

  // what B currently resolves to for one aspect (used to copy on unlink, so B does not move)
  function currentB(c, a) {
    const rB = resolveB(c);
    switch (a) {
      case "exp": { const b = buildB(c); return b.E ? b.exp : rB.exp; }
      case "placement": return { basis: rB.basis, values: rB.values };
      case "wingCall": case "wingPut": {
        const s = a === "wingCall" ? "call" : "put", w = rB.wings[s], out = { on: !!w.on, value: +w.value };
        const wb = w.basis || rB.basis, tb = rB.basis;
        if (wb !== tb) {
          const b = buildB(c);
          if (b.E) out.value = RULE.convertWing(b.E, s, +w.value, wb, tb, (legOf(b, s === "call" ? "short call" : "short put") || {}).K, (legOf(b, s === "call" ? "long call" : "long put") || {}).K).value;
        }
        return out;
      }
      default: return clone(rB[a]);
    }
  }
  // B's own wing values are read on B's effective basis; when that basis changes, convert them so their strikes stay
  function post(c0, c1) {
    const b0 = effBasisB(c0), b1 = effBasisB(c1);
    if (b0 === b1 || !c1.B || !c1.B.wings) return c1;
    const bb = buildB(c0);
    if (!bb.E) return c1;
    for (const s of ["call", "put"]) {
      const w = c1.B.wings[s]; if (!w) continue;
      const own = !c0.links[wingAspect(s)], short = legOf(bb, s === "call" ? "short call" : "short put"), leg = own ? legOf(bb, s === "call" ? "long call" : "long put") : null;
      const r = RULE.convertWing(bb.E, s, +w.value, b0, b1, short ? short.K : NaN, leg ? leg.K : NaN);
      c1.B.wings[s] = { on: !!w.on, value: r.value };
    }
    return c1;
  }
  function validOwn(c, a, own) {
    if (a === "exp") { const sd = c.links.inst ? c.A.inst : c.B.inst, I = INST.make(sd); return !!I && I.expiries.includes(own); }
    if (a === "inst") return !!own && INST.has(own.id);
    if (a === "placement") return RULE.BASES.includes(own.basis) && !!own.values;
    return own !== undefined && own !== null;
  }
  function describe(c, a, v) {
    switch (a) {
      case "inst": return v.id;
      case "exp": return /^\d{8}$/.test(v) ? fmtE(v) : String(v);
      case "structure": return v;
      case "legs": return "legs " + v;
      case "fill": return fillWord(v) + " fill";
      case "placement": return placeTxt(v.basis, v.values, (c.B && c.B.structure) || c.A.structure);
      case "wingCall": case "wingPut": return `${a === "wingCall" ? "protective call" : "protective put"} ${v.on ? RULE.fmtV(+v.value, effBasisB(c)) : "off"}`;
    }
    return a;
  }
  function placeTxt(basis, values, structure) {
    if (structure === "straddle") return values.center === "atm" ? "ATM center" : "center " + RULE.fmtV(+values.center, basis);
    const u = RULE.UNIT[basis], f = v => String(+(+v).toFixed(basis === "sigma" ? 2 : 1));
    return `${f(values.put)} / ${f(values.call)}${u}`;
  }

  // ---------------------------------------------------------- applying a path to one side's own position
  function applyPath(P, path, value, E, side) {
    const p = String(path), notes = [];
    if (p === "inst") { P.inst = clone(value); return notes; }
    if (p === "inst.id") { P.inst = { id: value }; return notes; }
    if (p === "inst.spot" || p === "inst.ivShift") { P.inst = Object.assign({}, P.inst); const k = p.slice(5); if (value === null || value === undefined || value === "") delete P.inst[k]; else P.inst[k] = +value; return notes; }
    if (p === "exp" || p === "structure" || p === "legs" || p === "fill") { P[p] = value; return notes; }
    if (p === "basis") {
      if (value === P.basis || !RULE.BASES.includes(value)) return notes;
      const pos = { basis: P.basis, values: P.values, wings: side === "A" ? P.wings : {}, structure: P.structure };
      const r = E ? RULE.convert(E, pos, value) : { values: P.values, wings: {}, flags: [] };
      P.basis = value; P.values = r.values;
      if (side === "A") for (const s of ["call", "put"]) if (r.wings[s]) P.wings[s] = { on: !!P.wings[s].on, value: r.wings[s].value };
      for (const f of r.flags) notes.push(f.text);
      return notes;
    }
    if (p === "values") { P.values = Object.assign({}, P.values, clone(value)); return notes; }
    if (p.startsWith("values.")) { P.values = Object.assign({}, P.values); const k = p.slice(7); P.values[k] = k === "center" && value === "atm" ? "atm" : +value; return notes; }
    if (p === "wings.call" || p === "wings.put") { P.wings = Object.assign({}, P.wings); P.wings[p.slice(6)] = { on: !!value.on, value: +value.value }; return notes; }
    const m = /^wings\.(call|put)\.(on|value)$/.exec(p);
    if (m) { P.wings = Object.assign({}, P.wings); const w = Object.assign({}, P.wings[m[1]]); w[m[2]] = m[2] === "on" ? !!value : +value; P.wings[m[1]] = w; return notes; }
    throw new Error("unknown path " + p);
  }
  // keep stored values inside the sanitizer bounds (never rounded)
  function tidy(P) {
    if (P.values && RULE.BASES.includes(P.basis)) {
      for (const k of ["put", "call"]) if (Number.isFinite(+P.values[k])) P.values[k] = RULE.clampValue(P.basis, +P.values[k]);
      if (P.values.center !== "atm" && Number.isFinite(+P.values.center)) P.values.center = RULE.clampValue(P.basis, +P.values.center);
    }
    if (P.wings) for (const s of ["call", "put"]) if (P.wings[s] && RULE.BASES.includes(P.basis)) P.wings[s] = { on: !!P.wings[s].on, value: RULE.clampWing(P.basis, Number.isFinite(+P.wings[s].value) ? +P.wings[s].value : RULE.WDEF[P.basis]) };
    return P;
  }
  function tidyB(c) {
    const B = c.B, bb = effBasisB(c);
    if (B.values && B.basis) tidy({ basis: B.basis, values: B.values });
    if (B.wings) for (const s of ["call", "put"]) if (B.wings[s]) B.wings[s] = { on: !!B.wings[s].on, value: RULE.clampWing(bb, Number.isFinite(+B.wings[s].value) ? +B.wings[s].value : RULE.WDEF[bb]) };
    return c;
  }

  // ---------------------------------------------------------- identity and the A-side mutator
  function legsEq(a, b) {
    if (a.na || b.na || a.legs.length !== b.legs.length) return false;
    for (let i = 0; i < a.legs.length; i++) if (a.legs[i].role !== b.legs[i].role || a.legs[i].K !== b.legs[i].K) return false;
    return true;
  }
  const isIdentical = (bA, bB) => !bA.na && !bB.na && bA.inst.version === bB.inst.version && bA.exp === bB.exp && legsEq(bA, bB) && bA.fill === bB.fill;
  const identical = c => isIdentical(buildA(c), buildB(c));
  const evIdentical = () => ({ type: "identical", aspects: [], text: "A and B are now the same trade", actions: [] });
  const note = text => ({ type: "note", aspects: [], text, actions: [] });

  function setA(c, path, value) {
    const a = aspectOf(path); if (!a) throw new Error("unknown path " + path);
    const before = identical(c), n = clone(c);
    const E = path === "basis" ? INST.make(n.A.inst).exp(n.A.exp) : null;
    const notes = applyPath(n.A, path, value, E, "A");
    if (a === "inst") {
      if (path === "inst.id" || (path === "inst" && value && c.A.inst.id !== value.id)) {
        const I = INST.make(n.A.inst); if (I && !I.expiries.includes(n.A.exp)) n.A.exp = I.nearestExp(n.A.exp);
      }
    }
    tidy(n.A);
    const out = tidyB(post(c, n)), events = notes.map(note);
    if (!before && identical(out)) events.push(evIdentical());
    return { c: out, events };
  }

  // ---------------------------------------------------------- links
  function startFromA(c, a) {
    const t = clone(c); t.links[a] = true;
    const cur = currentB(t, a), n = clone(c); n.links[a] = false; ownSet(n.B, a, cur);
    return { c: tidyB(post(c, n)), events: [] };
  }
  function unlink(c, a) {
    if (!ASPECTS.includes(a) || !c.links[a]) return { c, events: [] };
    const own = ownGet(c.B, a), n = clone(c);
    if (own !== undefined && validOwn(c, a, own)) {
      const cur = currentB(c, a);
      n.links[a] = false;
      if (JSON.stringify(cur) === JSON.stringify(clone(own))) return { c: tidyB(post(c, n)), events: [] };
      return { c: tidyB(post(c, n)), events: [{ type: "restored", aspects: [a], text: `restored B's ${describe(c, a, own)}`, actions: [{ label: "start from A instead", apply: cc => startFromA(cc, a) }] }] };
    }
    n.links[a] = false; ownSet(n.B, a, currentB(c, a));
    return { c: tidyB(post(c, n)), events: [] };
  }
  function link(c, a) {
    if (!ASPECTS.includes(a) || c.links[a]) return { c, events: [] };
    const n = clone(c); n.links[a] = true;
    return { c: tidyB(post(c, n)), events: [{ type: "linked", aspects: [a], text: `B follows A's ${NAMES[a]}`, actions: [{ label: "undo", apply: cc => unlink(cc, a) }] }] };
  }
  function relinkSome(c, aspects) {
    let cur = c; const done = [];
    for (const a of aspects) if (!cur.links[a]) { cur = link(cur, a).c; done.push(a); }
    if (!done.length) return { c, events: [] };
    return { c: cur, events: [{ type: "linked", aspects: done, text: done.length > 1 ? "B follows A again" : `B follows A's ${NAMES[done[0]]}`, actions: [{ label: "undo", apply: cc => { let x = cc; for (const a of done) x = unlink(x, a).c; return { c: x, events: [] }; } }] }] };
  }
  const relinkAll = c => relinkSome(c, ASPECTS.filter(a => a !== "inst"));

  // ---------------------------------------------------------- the B-side mutator (implicit unlink of one aspect)
  function setB(c, path, value) {
    const a = aspectOf(path); if (!a) throw new Error("unknown path " + path);
    let n = clone(c); const events = [];
    if (c.links[a]) {
      n.links[a] = false; ownSet(n.B, a, currentB(c, a));
      events.push({ type: "unlinked", aspects: [a], text: UNL[a], actions: [{ label: "↺ relink", apply: cc => link(cc, a) }] });
    }
    // apply on B's own (complete) position view, then store back only this aspect
    const own = resolveB(n);
    const E = path === "basis" ? (() => { const b = POS.build(own, { expMap: n.expMap }); return b.E; })() : null;
    for (const notesText of applyPath(own, path, value, E, "B")) events.push(note(notesText));
    if (a === "inst") ownSet(n.B, "inst", own.inst);
    else if (a === "placement") { tidy(own); ownSet(n.B, "placement", { basis: own.basis, values: own.values }); }
    else if (a === "wingCall" || a === "wingPut") { const s = a === "wingCall" ? "call" : "put"; ownSet(n.B, a, { on: own.wings[s].on, value: own.wings[s].value }); }
    else ownSet(n.B, a, own[a]);
    return { c: tidyB(post(c, n)), events };
  }
  const applyFix = (c, fix) => fix.side === "B" ? setB(c, fix.path, fix.value) : setA(c, fix.path, fix.value);

  // ---------------------------------------------------------- detach (requirement 4 on a straddle)
  function detach(c, side) {
    const b = side === "B" ? buildB(c) : buildA(c);
    if (b.na) return { c, events: [] };
    if (b.kind !== "straddle") return detachLegs(c, side);
    const K = legOf(b, "short put").K, E = b.E;
    if (side !== "B") {
      const n = clone(c), bs = n.A.basis;
      n.A.structure = "strangle"; n.A.legs = "detached";
      n.A.values = Object.assign({}, n.A.values, { put: RULE.valueAt(E, K, "short put", bs), call: RULE.valueAt(E, K, "short call", bs) });
      return { c: tidyB(post(c, n)), events: [] };
    }
    const three = ["structure", "legs", "placement"], n = clone(c), un = [];
    for (const a of three) if (n.links[a]) { ownSet(n.B, a, currentB(c, a)); n.links[a] = false; un.push(a); }
    if (!n.B.basis) ownSet(n.B, "placement", currentB(c, "placement"));
    const bs = n.B.basis;
    n.B.structure = "strangle"; n.B.legs = "detached";
    n.B.values = Object.assign({}, n.B.values, { put: RULE.valueAt(E, K, "short put", bs), call: RULE.valueAt(E, K, "short call", bs) });
    const events = un.length ? [{ type: "unlinked", aspects: un, text: "B's legs are detached: B's structure, legs and strikes are now set on their own", actions: [{ label: "↺ relink placement", apply: cc => link(cc, "placement") }, { label: "↺ relink all three", apply: cc => relinkSome(cc, three) }] }] : [];
    return { c: tidyB(post(c, n)), events };
  }

  // "Detach legs" on a strangle: legs = detached. On B with placement linked, B reads A's values, so detached legs
  // could not move on their own; the gesture therefore also sets B's strikes on their own (a copy of what B resolves
  // to now, so nothing moves), the same exception as detach on a B straddle
  function detachLegs(c, side) {
    if (side !== "B") return c.A.legs === "detached" ? { c, events: [] } : setA(c, "legs", "detached");
    const n = clone(c), un = [];
    n.B = n.B || {};
    for (const a of ["legs", "placement"]) if (n.links[a]) { ownSet(n.B, a, currentB(c, a)); n.links[a] = false; un.push(a); }
    const was = resolveB(c).legs;
    n.B.legs = "detached";
    if (!un.length && was === "detached") return { c, events: [] };
    const events = !un.length ? [] : un.includes("placement")
      ? [{ type: "unlinked", aspects: un, text: "B's legs are detached: B's strikes are now set on their own", actions: [{ label: "↺ relink placement", apply: cc => link(cc, "placement") }].concat(un.length > 1 ? [{ label: "↺ relink both", apply: cc => relinkSome(cc, un) }] : []) }]
      : [{ type: "unlinked", aspects: un, text: UNL.legs, actions: [{ label: "↺ relink", apply: cc => link(cc, "legs") }] }];
    return { c: tidyB(post(c, n)), events };
  }

  // ---------------------------------------------------------- setFrom: only the aspects that differ
  function setFrom(c, side, spec) {
    spec = spec || {};
    const isB = side === "B", res = isB ? resolveB(c) : clone(c.A), built = isB ? buildB(c) : buildA(c);
    let cur = c; const events = [];
    const set = (path, v) => { const r = isB ? setB(cur, path, v) : setA(cur, path, v); cur = r.c; for (const e of r.events) events.push(e); };
    if (spec.inst !== undefined) {
      const sd = typeof spec.inst === "string" ? { id: spec.inst } : clone(spec.inst);
      const now = res.inst, same = sd.id === now.id && (sd.spot === undefined || sd.spot === now.spot) && (sd.ivShift === undefined || sd.ivShift === now.ivShift);
      if (!same) set("inst", sd.spot === undefined && sd.ivShift === undefined && sd.id === now.id ? now : sd);
    }
    if (spec.exp !== undefined && spec.exp !== (built.E ? built.exp : res.exp)) set("exp", spec.exp);
    if (spec.structure !== undefined && spec.structure !== res.structure) set("structure", spec.structure);
    if (spec.legs !== undefined && spec.legs !== res.legs) set("legs", spec.legs);
    if (spec.wings) for (const s of ["call", "put"]) {
      if (spec.wings[s] === undefined) continue;
      const want = typeof spec.wings[s] === "boolean" ? { on: spec.wings[s] } : spec.wings[s], has = res.wings[s];
      if (!!want.on !== !!has.on) set(`wings.${s}.on`, !!want.on);
      if (want.value !== undefined && +want.value !== +has.value) set(`wings.${s}.value`, +want.value);
    }
    if (spec.fill !== undefined && spec.fill !== res.fill) set("fill", spec.fill);
    return { c: cur, events: mergeEvents(events) };
  }
  function mergeEvents(ev) {
    const un = ev.filter(e => e.type === "unlinked"), rest = ev.filter(e => e.type !== "unlinked");
    if (un.length <= 1) return ev;
    const aspects = [...new Set(un.flatMap(e => e.aspects))];
    return [{ type: "unlinked", aspects, text: `B's ${aspects.map(a => NAMES[a]).join(", ")} are now set on their own`, actions: [{ label: "↺ relink", apply: cc => relinkSome(cc, aspects) }] }, ...rest];
  }

  // ---------------------------------------------------------- swap
  function swap(c) {
    const L = c.links, bA0 = buildA(c), bB0 = buildB(c), rB = resolveB(c);
    const nA = clone(rB);
    if (bB0.E) nA.exp = bB0.exp;
    for (const s of ["call", "put"]) {
      const w = nA.wings[s];
      if (w.basis && w.basis !== nA.basis && bB0.E) {
        w.value = RULE.convertWing(bB0.E, s, +w.value, w.basis, nA.basis, (legOf(bB0, s === "call" ? "short call" : "short put") || {}).K, (legOf(bB0, s === "call" ? "long call" : "long put") || {}).K).value;
      }
      nA.wings[s] = { on: !!w.on, value: +w.value };
    }
    const nB = { inst: L.inst ? clone(c.B.inst) : clone(c.A.inst) };
    for (const a of ASPECTS) {
      if (a === "inst") continue;
      if (L[a]) { const own = ownGet(c.B, a); if (own !== undefined) ownSet(nB, a, own); }
      else ownSet(nB, a, fromA(c.A, a));
    }
    const sizing = clone(c.sizing); if (sizing.rule === "custom" && sizing.h > 0) sizing.h = 1 / sizing.h;
    let n = { A: tidy(nA), B: nB, links: clone(L), expMap: c.expMap, sizing };
    // a linked aspect whose swapped B would not resolve to old A's strikes or date is unlinked, keeping old A's value
    const un = [];
    for (let it = 0; it < 4; it++) {
      const b1 = buildB(n), bad = [];
      if (n.links.exp && bA0.E && b1.exp !== bA0.exp) bad.push("exp");
      else {
        for (const [s, role] of [["call", "long call"], ["put", "long put"]]) {
          const a = wingAspect(s), x = legOf(b1, role), y = legOf(bA0, role);
          if (n.links[a] && ((x ? x.K : null) !== (y ? y.K : null))) bad.push(a);
        }
        for (const role of ["short put", "short call"]) {
          const x = legOf(b1, role), y = legOf(bA0, role);
          if (n.links.placement && (x ? x.K : null) !== (y ? y.K : null) && !bad.includes("placement")) bad.push("placement");
        }
      }
      if (!bad.length) break;
      n = clone(n);
      for (const a of bad) { n.links[a] = false; ownSet(n.B, a, fromA(c.A, a)); un.push(a); }
    }
    const events = un.length ? [{ type: "swapUnlinked", aspects: un, text: `after the swap B's ${un.map(a => NAMES[a]).join(", ")} ${un.length > 1 ? "are" : "is"} set on ${un.length > 1 ? "their" : "its"} own, so both positions keep their strikes`, actions: [{ label: "↺ relink", apply: cc => relinkSome(cc, un) }] }] : [];
    return { c: tidyB(n), events };
  }

  // ---------------------------------------------------------- diff
  // local strike spacing on the basis: the gap between the listed strikes either side of the resolved strike
  // (twice the one-sided gap at a chain end), so ½ × spacing is the usual distance to the next strike
  function spacing(E, leg, basis) {
    const ks = E.strikes, i = ks.indexOf(leg.K), v = K => RULE.valueAt(E, K, leg.role, basis, leg.Kshort === null ? undefined : leg.Kshort);
    if (i < 0) return 0;
    const lo = i > 0 ? ks[i - 1] : null, hi = i + 1 < ks.length ? ks[i + 1] : null;
    if (lo !== null && hi !== null) return Math.abs(v(hi) - v(lo));
    if (lo !== null) return 2 * Math.abs(v(leg.K) - v(lo));
    if (hi !== null) return 2 * Math.abs(v(hi) - v(leg.K));
    return 0;
  }
  // a signed value for a straddle center off the forward (% and σ), as line 3 prints it
  const fmtC = (v, bas) => (bas !== "delta" && v > 0 ? "+" : "") + RULE.fmtV(v, bas);
  const strikesTxt = b => b.kind === "straddle" ? fK(b.sp.K) : b.kind === "strangle" ? `${fK(b.sp.K)} / ${fK(b.sc.K)}` : `${fK(b.sp.K)}P / ${fK(b.sc.K)}C`;
  const LEGW = { put: "put", call: "call", center: "center", wingCall: "call wing", wingPut: "put wing" };
  const ROLE_OF = { put: "short put", call: "short call", center: "short call", wingCall: "long call", wingPut: "long put" };
  function diff(c, bA, bB) {
    bA = bA || buildA(c); bB = bB || buildB(c);
    const A = c.A, rB = resolveB(c), L = c.links, items = [];
    const ident = isIdentical(bA, bB);
    const straddleEither = bA.kind === "straddle" || bB.kind === "straddle";
    // neutral: unlinked aspects whose resolved values differ (never the instrument itself)
    for (const a of ASPECTS) {
      if (a === "inst" || L[a]) continue;
      if (a === "legs" && (straddleEither || L.placement)) continue;
      let differ = false, text = "";
      if (a === "exp") { differ = bA.exp !== bB.exp; text = `B ${bB.exp ? fmtE(bB.exp) : "n/a"}`; }
      else if (a === "structure") { differ = A.structure !== rB.structure; text = `B ${rB.structure}`; }
      else if (a === "legs") { differ = A.legs !== rB.legs; text = `B legs ${rB.legs}`; }
      else if (a === "fill") { differ = A.fill !== rB.fill; text = `B ${fillWord(rB.fill)} fill`; }
      else if (a === "placement") {
        const used = p => p.structure === "straddle" ? ["center"] : ["put", "call"], ks = [...new Set([...used(A), ...used(rB)])];
        differ = A.basis !== rB.basis || ks.some(k => String(A.values[k]) !== String(rB.values[k]));
        text = `B strikes ${placeTxt(rB.basis, rB.values, rB.structure)}`;
      } else {
        const s = a === "wingCall" ? "call" : "put", wa = A.wings[s], wb = rB.wings[s];
        if (wa.on || wb.on) differ = !!wa.on !== !!wb.on || +wa.value !== +wb.value || (wb.basis || rB.basis) !== A.basis;
        text = `B ${s === "call" ? "protective call" : "protective put"} ${wb.on ? RULE.fmtV(+wb.value, wb.basis || rB.basis) : "off"}`;
      }
      if (differ) items.push({ aspect: a, code: "UNLINKED", text, asked: true, side: "B", relink: true, dockRow: a });
    }
    // neutral: overrides on either side's instrument
    for (const [side, b] of L.inst ? [["A", bA]] : [["A", bA], ["B", bB]]) {
      const I = b.inst; if (!I || !I.overridden) continue;
      const parts = [];
      if (I.spot !== I.spotListed) { const pct = (I.spot / I.spotListed - 1) * 100; parts.push(`spot ${pct >= 0 ? "+" : MINUS}${+Math.abs(pct).toFixed(1)}%`); }
      if (I.ivShift) parts.push(`IV ${I.ivShift > 0 ? "+" : MINUS}${+Math.abs(I.ivShift).toFixed(2)} pts`);
      items.push({ aspect: "override", code: "OVERRIDE", text: `${L.inst ? "A and B" : side} ${parts.join(", ")} (override)`, asked: true, side, relink: false, dockRow: "inst" });
    }
    const amber = (side, aspect, code, text, dockRow) => items.push({ aspect, code, text: "! " + text, asked: false, side, relink: false, dockRow: dockRow || aspect });
    for (const [s, b] of [["A", bA], ["B", bB]]) if (b.na) amber(s, "placement", "NA", `${s} is n/a: ${b.naReason}`, s === "B" && !b.E ? "exp" : "placement");
    // 1: structure linked but the resolved kinds differ
    if (L.structure && !bA.na && !bB.na && bA.kind !== bB.kind) {
      const devB = bB.kind !== rB.structure || bA.kind === A.structure, s = devB ? "B" : "A", b = devB ? bB : bA;
      amber(s, "structure", "KIND", `${s} resolved to ${b.kind} ${strikesTxt(b)}`);
    }
    // 2: structure linked and WIDENED on one side only
    if (L.structure && !bA.na && !bB.na && bA.inv !== bB.inv) {
      const s = bA.inv ? "A" : "B", b = bA.inv ? bA : bB, f = b.flags.find(x => x.code === "WIDENED");
      amber(s, "structure", "WIDENED", `${s}: ${f.moved} widened to ${fK(f.to)} to keep a ${b.kind === "guts" ? "guts" : "strangle"}`);
    }
    // 3, 4, 5: per-side flags
    for (const [s, b] of [["A", bA], ["B", bB]]) for (const f of b.flags) {
      if (f.code === "WING_NA") amber(s, f.leg, "WING_NA", `${s}: ${f.text}`);
      else if (f.code === "CHAIN_END") {
        const leg = legOf(b, ROLE_OF[f.leg]);
        const wing = f.leg === "wingCall" || f.leg === "wingPut", bas = wing ? (leg && leg.role === "long call" ? (rWingBasis(c, s, "call")) : rWingBasis(c, s, "put")) : (s === "A" ? A.basis : rB.basis);
        amber(s, wing ? f.leg : "placement", "CHAIN_END", `${s}: ${LEGW[f.leg]} at chain end ${leg ? fK(leg.K) + (f.leg === "center" ? "" : leg.cp) : ""} (${leg ? RULE.fmtV(leg.achieved[bas], bas) : "–"})`);
      } else if (f.code === "EXP_MAPPED") amber(s, "exp", "EXP_MAPPED", `${s} has no ${fmtE(f.from)}: using ${fmtE(f.to)}`);
    }
    // 6: placement linked, achieved values on the active basis differ by more than max(tol, ½ local spacing)
    if (L.placement && !bA.na && !bB.na && A.structure === rB.structure) {
      const bas = A.basis, ce = b => new Set(b.flags.filter(f => f.code === "CHAIN_END").map(f => f.leg));
      const ceA = ce(bA), ceB = ce(bB);
      // a straddle at "atm" takes the strike nearest each side's own forward: nothing to compare
      const pairs = A.structure === "straddle" ? (A.values.center === "atm" ? [] : [["center", "short call"]]) : [["put", "short put"], ["call", "short call"]];
      for (const [k, role] of pairs) {
        if (ceA.has(k) || ceB.has(k)) continue;
        const la = legOf(bA, role), lb = legOf(bB, role); if (!la || !lb) continue;
        const va = la.achieved[bas], vb = lb.achieved[bas], f = k === "center" ? fmtC : RULE.fmtV;
        const thr = Math.max(ACH_TOL[bas], 0.5 * Math.max(spacing(bA.E, la, bas), spacing(bB.E, lb, bas)));
        if (Math.abs(va - vb) > thr) amber("B", "placement", "ACHIEVED", `${k} A ${f(va, bas)} vs B ${f(vb, bas)}`);
      }
    }
    // 7: a linked wing that is on, whose width in σ differs by more than 1.5×
    for (const s of ["call", "put"]) {
      const a = wingAspect(s); if (!L[a] || !A.wings[s].on) continue;
      const role = s === "call" ? "long call" : "long put", sr = s === "call" ? "short call" : "short put";
      const w = b => { const l = legOf(b, role), sh = legOf(b, sr); return l && sh ? Math.abs(Math.log(l.K / sh.K)) / b.sig : NaN; };
      const wa = w(bA), wb = w(bB);
      if (wa > 0 && wb > 0 && Math.max(wa, wb) / Math.min(wa, wb) > 1.5) amber("B", a, "WING_WIDTH", `${s} wing A ${wa.toFixed(1)}σ vs B ${wb.toFixed(1)}σ wide`);
    }
    // 8: one side a net debit while the other is a credit
    if (!bA.na && !bB.na && ((bA.cr < 0 && bB.cr > 0) || (bB.cr < 0 && bA.cr > 0))) { const s = bA.cr < 0 ? "A" : "B"; amber(s, "fill", "DEBIT", `${s} is a net debit`); }
    // only the instrument differs: no amber, and every unlinked aspect is moot or resolves to A's value (an unlinked
    // fill set back to mid, or B's legs detached while B's strikes follow A, changes nothing)
    const onlyInstrument = !ident && !items.some(i => !i.asked || i.code === "UNLINKED");
    return INST.deepFreeze({ items, identical: ident, onlyInstrument });
  }
  function rWingBasis(c, side, s) {
    if (side === "A") return c.A.basis;
    const rB = resolveB(c); return rB.wings[s].basis || rB.basis;
  }

  // ---------------------------------------------------------- defaults and sanitizer
  function defaults(list) {
    list = list || INST.list();
    const a = list[0].id, b = (list[1] || list[0]).id, IA = INST.base(a), IB = INST.base(b);
    const common = IA.expiries.filter(e => IB.expiries.includes(e));
    const exp = common.find(e => IA.exp(e).dte >= 30) || common[common.length - 1] || IA.expiries[0];
    return {
      A: { inst: { id: a }, exp, structure: "strangle", legs: "together", basis: "delta", values: { center: "atm", put: 30, call: 30 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" },
      B: { inst: { id: b } },
      links: { inst: false, exp: true, structure: true, legs: true, placement: true, wingCall: true, wingPut: true, fill: true },
      expMap: "nearest", sizing: { rule: "auto", h: 1 }
    };
  }
  const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
  function sanSlot(s, defId) {
    const id = isObj(s) && INST.has(s.id) ? s.id : defId, out = { id };
    if (isObj(s) && s.id === id) {
      const I = INST.base(id);
      if (Number.isFinite(+s.spot) && s.spot !== null && s.spot !== "" && +s.spot > 0 && Math.abs(+s.spot - I.spotListed) >= 1e-9 * I.spotListed) out.spot = Math.min(100 * I.spotListed, Math.max(0.01 * I.spotListed, +s.spot));
      if (Number.isFinite(+s.ivShift) && s.ivShift !== null && s.ivShift !== "" && +s.ivShift !== 0) out.ivShift = Math.min(200, Math.max(-50, +s.ivShift));
    }
    return out;
  }
  function sanWing(w, basis) {
    const v = isObj(w) && Number.isFinite(+w.value) && w.value !== null ? +w.value : RULE.WDEF[basis];
    return { on: isObj(w) && w.on === true, value: RULE.clampWing(basis, v) };
  }
  function sanValues(v, basis, def) {
    v = isObj(v) ? v : {};
    const num = (x, d) => Number.isFinite(+x) && x !== null && x !== "" && typeof x !== "boolean" ? RULE.clampValue(basis, +x) : d;
    return { center: v.center === "atm" ? "atm" : num(v.center, "atm"), put: num(v.put, def.put), call: num(v.call, def.call) };
  }
  function sanPos(p, d) {
    p = isObj(p) ? p : {};
    const inst = sanSlot(p.inst, d.inst.id), I = INST.make(inst);
    let exp = typeof p.exp === "string" && /^\d{8}$/.test(p.exp) ? p.exp : d.exp;
    if (!I.expiries.includes(exp)) exp = I.nearestExp(exp);
    const basis = RULE.BASES.includes(p.basis) ? p.basis : "delta";
    const dv = basis === d.basis ? d.values : { center: "atm", put: RULE.DEF[basis], call: RULE.DEF[basis] };
    const w = isObj(p.wings) ? p.wings : {};
    return {
      inst, exp, structure: STRUCTS.includes(p.structure) ? p.structure : d.structure, legs: LEGSM.includes(p.legs) ? p.legs : d.legs,
      basis, values: sanValues(p.values, basis, dv), wings: { call: sanWing(w.call, basis), put: sanWing(w.put, basis) }, fill: FILLS.includes(p.fill) ? p.fill : d.fill
    };
  }
  function sanitize(o) {
    const list = INST.list(), d = defaults(list);
    if (!isObj(o)) return d;
    const A = sanPos(o.A, d.A);
    const links = {}; const ol = isObj(o.links) ? o.links : {};
    for (const a of ASPECTS) links[a] = typeof ol[a] === "boolean" ? ol[a] : d.links[a];
    const ob = isObj(o.B) ? o.B : {};
    const otherId = (list.find(x => x.id !== A.inst.id) || list[0]).id;
    const B = { inst: sanSlot(ob.inst, isObj(ob.inst) && INST.has(ob.inst.id) ? ob.inst.id : otherId) };
    if (typeof ob.exp === "string" && /^\d{8}$/.test(ob.exp)) B.exp = ob.exp;
    if (STRUCTS.includes(ob.structure)) B.structure = ob.structure;
    if (LEGSM.includes(ob.legs)) B.legs = ob.legs;
    if (FILLS.includes(ob.fill)) B.fill = ob.fill;
    if (RULE.BASES.includes(ob.basis) && isObj(ob.values)) { B.basis = ob.basis; B.values = sanValues(ob.values, ob.basis, { put: RULE.DEF[ob.basis], call: RULE.DEF[ob.basis] }); }
    const bb = links.placement ? A.basis : B.basis || A.basis;
    if (isObj(ob.wings)) { const w = {}; for (const s of ["call", "put"]) if (isObj(ob.wings[s])) w[s] = sanWing(ob.wings[s], bb); if (w.call || w.put) B.wings = w; }
    // an unlinked aspect always has B's own value
    for (const a of ASPECTS) if (!links[a] && ownGet(B, a) === undefined) ownSet(B, a, fromA(A, a));
    const sz = isObj(o.sizing) ? o.sizing : {};
    const h = Number.isFinite(+sz.h) && +sz.h > 0 ? Math.min(20, Math.max(0.05, +sz.h)) : 1;
    return { A, B, links, expMap: o.expMap === "same" ? "same" : "nearest", sizing: { rule: SIZE_RULES.includes(sz.rule) ? sz.rule : "auto", h } };
  }

  return Object.freeze({
    ASPECTS, NAMES, SIZE_RULES,
    defaults, sanitize, resolveB, buildA, buildB, aspectOf, ownValue: (c, a) => ownGet(c.B, a), currentB,
    link, unlink, setA, setB, detach, setFrom, relinkAll, relinkSome, swap, diff, applyFix, identical, placeTxt
  });
})();
