// T21 core: the event loop (Bus, Registry, Result, CommandExecutor, FrameLoop), every command handler on a
// deep-frozen state (pure, expected result), view codes as Results, and the adapters on fakes. No browser.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, deepFreeze, V9 } = require("./load.js");
const L = load();
vm.runInContext(fs.readFileSync(path.join(V9, "ui_views.js"), "utf8") + "\n;globalThis.__v = {VIEWS};", L.ctx, { filename: "ui_views.js" });
const { VIEWS } = L.ctx.__v;
const { STATE, CTX, CMP, Command, EnvelopeType, FaultCode, FaultHandling, NoticeStyle, Tab, Theme, ResetTarget, ViewCodeError, ViewCodeVersion, ExportSection, ActionStep, CoreErrorCode, CORE_CONFIG,
  Result, createFault, isCommand, Registry, Bus, Store, CommandExecutor, FrameLoop } = L;
const J = o => JSON.parse(JSON.stringify(o));
// values from the vm realm compare by value (their prototypes are the vm's)
const same = (actual, expected, msg) => assert.deepEqual(J(actual), J(expected), msg);
const hasNoFunctions = o => typeof o !== "function" && (o === null || typeof o !== "object" || Object.values(o).every(hasNoFunctions));

// ---------------------------------------------------------------- helpers: a recording bus listener, a manual frame queue
function record(bus, ...types) {
  const seen = [];
  for (const t of types) bus.subscribe(t, e => seen.push(e));
  return seen;
}
function manualFrames() {
  const q = new Map(); let id = 0;
  return {
    requestFrame: run => { id += 1; q.set(id, run); return id; },
    cancelFrame: n => { q.delete(n); },
    runAll() { const runs = [...q.values()]; q.clear(); for (const r of runs) r(); },
    get pending() { return q.size; }
  };
}
// every bus needs a clock (the page passes calendar.nowMs)
const newBus = (extra = {}) => new Bus({ now: () => 0, ...extra });
const baseState = () => Object.assign(STATE.defaults(), { tab: Tab.Compare });
// the tree without the visible tab (what readViewCode returns as state)
const withoutTab = state => { const { tab, ...tree } = state; return tree; };
// v9's comparer state S9 = {cmp, scen, view} from a v10 state, and the v9 code and blob around it (migration inputs)
const toS9 = state => { const view = Object.assign({}, state.prefs); delete view.exportSections; return { cmp: state.comparison, scen: state.assumptions, view }; };
const writeV9Code = ({ state, tab, theme, yr }) => "v9." + STATE.enc({ t: tab, th: theme, c: toS9(state), y: yr });
function handlers() { return VIEWS.registerCommandHandlers(STATE.registerCommandHandlers(new Registry({ name: "test handlers" }))); }
function loop(state, extra = {}) {
  const bus = new Bus({ now: () => 1 }), store = new Store({ state }), frames = manualFrames();
  const loopFrames = new FrameLoop({ bus, store, requestFrame: frames.requestFrame, cancelFrame: frames.cancelFrame, now: () => 2, ...extra });
  const executor = new CommandExecutor({ bus, store, handlers: handlers(), frames: loopFrames, now: () => 3 });
  return { bus, store, frames, loopFrames, executor };
}

// ---------------------------------------------------------------- Result, Fault, Registry
test("T21 Result: ok / err shapes, err fills a missing code and message, isOk", () => {
  same(J(Result.ok(5)), { ok: true, value: 5 });
  same(J(Result.err({ code: "x", message: "y", extra: 1 })), { ok: false, error: { code: "x", message: "y", extra: 1 } });
  const e = Result.err({});
  assert.equal(e.error.code, "unspecified"); assert.ok(e.error.message.length > 0);
  assert.equal(Result.isOk(Result.ok(null)), true); assert.equal(Result.isOk(e), false); assert.equal(Result.isOk(null), false);
  const f = createFault({ code: FaultCode.HandlerFailed, text: "boom", where: "here" });
  assert.ok(Object.isFrozen(f)); same(Object.keys(f).sort(), ["code", "handling", "severity", "text", "where"]);
});

test("T21 Registry: register / get / has / listKeys; a duplicate key throws with the key named", () => {
  const r = new Registry({ name: "things" });
  r.register("a", 1).register("b", 2);
  assert.equal(r.get("a"), 1); assert.equal(r.has("b"), true); assert.equal(r.has("c"), false); assert.equal(r.get("c"), undefined);
  same(r.listKeys(), ["a", "b"]);
  assert.throws(() => r.register("a", 3), e => e.code === CoreErrorCode.DuplicateKey && e.code === "duplicate_key" && /things: "a"/.test(e.message));
  assert.equal(r.get("a"), 1);
});

// ---------------------------------------------------------------- Bus
test("T21 Bus: synchronous delivery, unsubscribe, bad input rejected", () => {
  const bus = newBus(), got = [];
  const off = bus.subscribe("x", e => got.push(e.n));
  bus.emit({ type: "x", n: 1 });
  same(got, [1], "delivered before emit returns");
  off(); bus.emit({ type: "x", n: 2 });
  same(got, [1], "unsubscribed");
  assert.throws(() => bus.emit({ n: 3 }), e => e.code === "bad_envelope");
  assert.throws(() => bus.subscribe("", () => {}), e => e.code === "bad_subscription");
});

test("T21 Bus: emits made while dispatching are queued FIFO and delivered after the current dispatch", () => {
  const bus = newBus(), log = [];
  bus.subscribe("a", () => { log.push("a1"); bus.emit({ type: "b" }); bus.emit({ type: "c" }); log.push("a1 end"); });
  bus.subscribe("a", () => log.push("a2"));
  bus.subscribe("b", () => { log.push("b"); bus.emit({ type: "d" }); });
  bus.subscribe("c", () => log.push("c"));
  bus.subscribe("d", () => log.push("d"));
  bus.emit({ type: "a" });
  same(log, ["a1", "a1 end", "a2", "b", "c", "d"]);
  assert.equal(bus.isDispatching, false);
});

test("T21 Bus: a throwing listener becomes exactly one fault; the other listeners still run", () => {
  const bus = newBus({ now: () => 7 }), faults = record(bus, EnvelopeType.Fault), after = [];
  bus.subscribe("x", () => { throw new Error("listener broke"); });
  bus.subscribe("x", e => after.push(e));
  bus.emit({ type: "x" });
  assert.equal(after.length, 1);
  assert.equal(faults.length, 1);
  assert.equal(faults[0].fault.code, FaultCode.ListenerFailed);
  assert.equal(faults[0].fault.text, "listener broke");
  assert.equal(faults[0].at, 7);
  assert.equal(faults[0].fault.handling, FaultHandling.Logged, "an envelope type without its own handling text");
});

test("T21 Bus: a throwing state.changed listener's fault says the state is kept and that listener skipped the frame", () => {
  const bus = newBus(), faults = record(bus, EnvelopeType.Fault);
  bus.subscribe(EnvelopeType.StateChanged, () => { throw new Error("render broke"); });
  bus.subscribe(EnvelopeType.Notice, () => { throw new Error("toast broke"); });
  bus.emit({ type: EnvelopeType.StateChanged });
  bus.emit(L.createNoticeEnvelope({ text: "n" }));
  same(faults.map(f => [f.fault.code, f.fault.handling]), [[FaultCode.ListenerFailed, FaultHandling.SkippedFrameStep], [FaultCode.ListenerFailed, FaultHandling.SkippedNotice]]);
});

test("T21 Bus: a throwing fault listener is logged, never re-emitted (no loop)", () => {
  const logged = [], bus = newBus({ logListenerFailure: ({ where, error }) => logged.push([where, error.message]) });
  let calls = 0;
  bus.subscribe(EnvelopeType.Fault, () => { calls++; throw new Error("fault reader broke"); });
  bus.subscribe("x", () => { throw new Error("first"); });
  bus.emit({ type: "x" });
  assert.equal(calls, 1, "the fault listener ran once");
  same(logged, [["a fault listener", "fault reader broke"]]);
});

test("T21 Bus: needs a clock; stamps an envelope that has no time with it", () => {
  assert.throws(() => new Bus(), e => e.code === "bad_clock");
  assert.throws(() => new Bus({ now: 5 }), e => e.code === "bad_clock" && /number/.test(e.message));
  const bus = newBus({ now: () => 42 }), got = [];
  bus.subscribe("x", e => got.push(e.at));
  bus.subscribe(EnvelopeType.Notice, e => got.push(e.at));
  bus.emit({ type: "x" }); bus.emit({ type: "x", at: 7 }); bus.emit(L.createNoticeEnvelope({ text: "n" }));
  same(got, [42, 7, 42]);
});

// a fresh realm whose console is recorded, for the paths that end on the console
function loadWithConsole() {
  const logged = [];
  const recordingConsole = { error: (...args) => logged.push(args), warn: (...args) => logged.push(["warn", ...args]), info: (...args) => logged.push(["info", ...args]), log() {} };
  return { P: load(undefined, { globals: { console: recordingConsole } }), logged };
}

test("T21 Bus: a fault logger that throws is reported on the console; the queue keeps moving, nothing stale later", () => {
  const { P, logged } = loadWithConsole();
  const bus = new P.Bus({ now: () => 0, logListenerFailure: () => { throw new Error("logger broke"); } }), seen = [];
  bus.subscribe(P.EnvelopeType.Fault, () => { bus.emit({ type: "y" }); throw new Error("fault reader broke"); });
  bus.subscribe("y", () => seen.push("y"));
  bus.subscribe("z", () => seen.push("z"));
  bus.subscribe("x", () => { throw new Error("first"); });
  bus.emit({ type: "x" });
  same(seen, ["y"], "the envelope queued before the logger failed was still delivered");
  assert.equal(bus.queue.length, 0); assert.equal(bus.isDispatching, false);
  bus.emit({ type: "z" });
  same(seen, ["y", "z"], "a later emit delivers only its own envelope");
  assert.equal(logged.length, 1); assert.equal(logged[0][0], "a fault listener");
  assert.equal(logged[0][1].message, "fault reader broke"); assert.equal(logged[0][3].message, "logger broke");
});

// ---------------------------------------------------------------- CommandExecutor
test("T21 commands are plain data: isCommand refuses a function anywhere; the executor rejects such a command", () => {
  assert.equal(isCommand({ type: Command.SetPref, patch: { units: "usd" } }), true);
  assert.equal(isCommand({ type: Command.ApplyAction, steps: [["link", "fill"]], apply: () => 1 }), false);
  assert.equal(isCommand({ type: Command.SetPref, patch: { f() {} } }), false);
  assert.equal(isCommand(null), false); assert.equal(isCommand({ type: "" }), false);
  const { bus, store, frames, executor } = loop(baseState());
  const faults = record(bus, EnvelopeType.Fault);
  const r = executor.execute({ type: Command.SetPref, patch: { units: "usd" }, later: () => 1 });
  assert.equal(r.ok, false); assert.equal(r.error.code, FaultCode.UnknownCommand); assert.match(r.error.message, /carries a function/);
  assert.equal(faults.length, 1); assert.equal(store.writeCount, 0); assert.equal(frames.pending, 0);
});

test("T21 executor: an unknown command -> Result err + one fault; nothing written, no frame", () => {
  const { bus, store, frames, executor } = loop(baseState());
  const faults = record(bus, EnvelopeType.Fault), notices = record(bus, EnvelopeType.Notice);
  for (const cmd of [{ type: "no.such" }, null, { type: "periodVol.unknown", ticker: "KORU", pct: 100 }]) {
    const r = executor.execute(cmd);
    assert.equal(r.ok, false); assert.equal(r.error.code, FaultCode.UnknownCommand);
  }
  assert.equal(faults.length, 3); assert.ok(faults.every(f => f.fault.code === FaultCode.UnknownCommand));
  assert.equal(notices.length, 0); assert.equal(store.writeCount, 0); assert.equal(frames.pending, 0);
});

test("T21 executor: a throwing handler -> one fault, the v9 toast, store unchanged", () => {
  const bus = newBus(), state = deepFreeze(baseState()), store = new Store({ state }), fr = manualFrames();
  const frames = new FrameLoop({ bus, store, requestFrame: fr.requestFrame, cancelFrame: fr.cancelFrame });
  const reg = new Registry().register("boom", () => { throw new Error("handler broke"); }).register("junk", () => ({ nope: 1 }));
  const executor = new CommandExecutor({ bus, store, handlers: reg, frames });
  const faults = record(bus, EnvelopeType.Fault), notices = record(bus, EnvelopeType.Notice);
  const r = executor.execute({ type: "boom" });
  assert.equal(r.ok, false); assert.equal(r.error.code, FaultCode.HandlerFailed);
  assert.equal(faults.length, 1); assert.match(faults[0].fault.text, /handler broke/);
  assert.equal(notices.length, 1); assert.equal(notices[0].notice.text, "That change could not be applied"); assert.equal(notices[0].notice.style, NoticeStyle.Plain);
  assert.equal(store.read(), state); assert.equal(store.writeCount, 0); assert.equal(fr.pending, 0);
  // a handler that returns something else than {state, notices, faults} is a failure too
  assert.equal(executor.execute({ type: "junk" }).ok, false); assert.equal(faults.length, 2); assert.equal(store.writeCount, 0);
});

test("T21 executor: one store write per command, its notices once each in one batch, one frame mark", () => {
  const { bus, store, frames, executor } = loop(baseState());
  const notices = record(bus, EnvelopeType.Notice), changed = record(bus, EnvelopeType.StateChanged);
  // B's own put unlinks placement: one notice with a relink action
  const r = executor.execute({ type: Command.SetB, path: "values.put", value: 20, source: "test" });
  assert.equal(r.ok, true); assert.equal(store.writeCount, 1);
  assert.equal(store.read().comparison.links.placement, false); assert.equal(store.read().tab, Tab.Compare);
  assert.equal(notices.length, r.value.notices.length); assert.ok(notices.length >= 1);
  assert.ok(notices.every(n => n.batch === notices[0].batch && n.batch.startsWith(Command.SetB)));
  assert.equal(frames.pending, 1); assert.equal(changed.length, 0, "the render waits for the frame");
  // a second command: a new batch
  executor.execute({ type: Command.SetB, path: "fill", value: "nat" });
  assert.equal(store.writeCount, 2); assert.equal(frames.pending, 1, "still one frame");
  assert.notEqual(notices[notices.length - 1].batch, notices[0].batch);
  frames.runAll();
  assert.equal(changed.length, 1); same(changed[0].causes, [Command.SetB, Command.SetB]);
});

test("T21 executor: a command run by a notice listener is applied once and listed after the command that raised the notice", () => {
  const { bus, store, frames, executor } = loop(baseState());
  const changed = record(bus, EnvelopeType.StateChanged);
  let runs = 0;
  bus.subscribe(EnvelopeType.Notice, () => { runs += 1; if (runs === 1) executor.execute({ type: Command.SetPref, patch: { units: "usd" } }); });
  executor.execute({ type: Command.Reset, resetTarget: ResetTarget.Compare });
  assert.equal(store.writeCount, 2); assert.equal(store.read().prefs.units, "usd");
  frames.runAll();
  assert.equal(changed.length, 1); same(changed[0].causes, [Command.Reset, Command.SetPref]);
});

test("T21 executor: ShowTab renders before execute() returns (CORE_CONFIG.renderAtOnce)", () => {
  const { bus, frames, executor } = loop(baseState());
  const changed = record(bus, EnvelopeType.StateChanged);
  executor.execute({ type: Command.SetPref, patch: { units: "usd" } });
  assert.equal(frames.pending, 1);
  const shown = executor.execute({ type: Command.ShowTab, tab: Tab.Compounding });
  assert.equal(shown.value.rendered, true);
  assert.equal(changed.length, 1, "flushed"); assert.equal(frames.pending, 0, "the pending frame was cancelled");
  same(changed[0].causes, [Command.SetPref, Command.ShowTab]);
  assert.equal(changed[0].state.tab, Tab.Compounding);
  assert.ok(CORE_CONFIG.renderAtOnce.includes(Command.ShowTab));
});

test("T21 executor + frames: a slider drag is one command per input event and one state.changed per frame", () => {
  const { bus, store, frames, executor } = loop(baseState());
  const changed = record(bus, EnvelopeType.StateChanged);
  for (const v of [1, 2, 3, 4, 5]) executor.execute({ type: Command.SetAssumption, patch: { ivs: v }, source: "#c-ivs" });
  assert.equal(store.writeCount, 5); assert.equal(store.read().assumptions.ivs, 5);
  frames.runAll();
  assert.equal(changed.length, 1); assert.equal(changed[0].causes.length, 5); assert.equal(changed[0].state.assumptions.ivs, 5);
});

test("T21 executor: ShowTab run inside a state.changed listener renders right after that delivery (rendered: false)", () => {
  const { bus, store, frames, executor } = loop(baseState());
  const log = [];
  let inner = null;
  bus.subscribe(EnvelopeType.StateChanged, frame => {
    log.push(`render ${frame.state.tab}`);
    if (frame.state.tab !== Tab.Compare || inner) return;
    inner = executor.execute({ type: Command.ShowTab, tab: Tab.Compounding });
    log.push(`executed rendered=${inner.value.rendered} tab=${store.read().tab}`);
  });
  bus.subscribe(EnvelopeType.StateChanged, frame => log.push(`after ${frame.state.tab}`));
  executor.execute({ type: Command.SetPref, patch: { units: "usd" } });
  frames.runAll();
  same(log, ["render compare", "executed rendered=false tab=yr", "after compare", "render yr", "after yr"]);
  assert.equal(frames.pending, 0, "the ShowTab frame was delivered, not left scheduled");
  // outside a delivery it renders before execute() returns
  const back = executor.execute({ type: Command.ShowTab, tab: Tab.Compare });
  assert.equal(back.value.rendered, true); same(log.slice(-2), ["render compare", "after compare"]);
});

// ---------------------------------------------------------------- FrameLoop
test("T21 FrameLoop: N marks -> one frame -> one state.changed with every cause and only the notices and faults the marks brought", () => {
  const bus = newBus(), store = new Store({ state: { tab: "yr" } }), fr = manualFrames();
  const frames = new FrameLoop({ bus, store, requestFrame: fr.requestFrame, cancelFrame: fr.cancelFrame, now: () => 9 });
  const changed = record(bus, EnvelopeType.StateChanged);
  // a notice and a fault on the bus with no frame (a "Copied" toast, a logged fault) never ride a later frame
  bus.emit(L.createNoticeEnvelope({ text: "unrelated" }));
  bus.emit(L.createFaultEnvelope({ fault: createFault({ code: "y", text: "unrelated" }) }));
  frames.mark({ cause: "a", notices: [{ text: "hello", actions: [], style: NoticeStyle.Plain }] }); frames.mark({ cause: "b" });
  frames.mark({ cause: "c", faults: [createFault({ code: "x", text: "t" })] });
  bus.emit(L.createNoticeEnvelope({ text: "unrelated too" }));
  assert.equal(fr.pending, 1); assert.equal(changed.length, 0);
  fr.runAll();
  assert.equal(changed.length, 1);
  const f = changed[0];
  same(f.causes, ["a", "b", "c"]); assert.equal(f.at, 9); assert.equal(f.state, store.read());
  same(f.notices.map(n => n.text), ["hello"]); same(f.faults.map(x => x.code), ["x"]);
  // the next frame starts empty; a mark without a cause is a "ui" frame
  frames.mark(); fr.runAll();
  same(changed[1].causes, ["ui"]); same(changed[1].notices, []); same(changed[1].faults, []);
});

test("T21 executor + frames: a state.changed carries the notices and faults of the commands it renders, nothing else", () => {
  const { bus, frames, executor } = loop(baseState());
  const changed = record(bus, EnvelopeType.StateChanged);
  bus.emit(L.createNoticeEnvelope({ text: "Copied" }));
  const r = executor.execute({ type: Command.SetB, path: "values.put", value: 20 });
  executor.execute({ type: Command.SetPref, patch: { nope: 1 } });
  frames.runAll();
  same(changed[0].notices.map(n => n.text), r.value.notices.map(n => n.text));
  same(changed[0].faults.map(x => x.code), [FaultCode.PatchRejected]);
});

test("T21 FrameLoop: flush runs the pending frame now and cancels the scheduled one; nothing pending -> false", () => {
  const bus = newBus(), store = new Store({ state: { tab: "yr" } }), cancelled = [], fr = manualFrames();
  const frames = new FrameLoop({ bus, store, requestFrame: fr.requestFrame, cancelFrame: id => { cancelled.push(id); fr.cancelFrame(id); } });
  const changed = record(bus, EnvelopeType.StateChanged);
  assert.equal(frames.flush(), false); assert.equal(changed.length, 0);
  frames.mark({ cause: "a" });
  assert.equal(frames.flush(), true);
  assert.equal(changed.length, 1); same(cancelled, [1]); assert.equal(fr.pending, 0);
  fr.runAll(); assert.equal(changed.length, 1, "the cancelled frame never runs");
});

test("T21 FrameLoop: the context is built for the visible tab only; a failing builder is one fault and a frame without a context", () => {
  const bus = newBus(), fr = manualFrames(), built = [];
  const store = new Store({ state: { tab: Tab.Compounding } });
  const frames = new FrameLoop({ bus, store, requestFrame: fr.requestFrame, cancelFrame: fr.cancelFrame, buildContext: { [Tab.Compare]: s => { built.push(s); if (s.broken) throw new Error("no context"); return { ctx: true }; } } });
  const changed = record(bus, EnvelopeType.StateChanged), faults = record(bus, EnvelopeType.Fault);
  frames.mark({ cause: "a" }); fr.runAll();
  assert.equal(built.length, 0); assert.equal(changed[0].context, null);
  store.replace({ tab: Tab.Compare }); frames.mark({ cause: "b" }); fr.runAll();
  assert.equal(built.length, 1); same(changed[1].context, { ctx: true });
  store.replace({ tab: Tab.Compare, broken: true }); frames.mark({ cause: "c" }); fr.runAll();
  assert.equal(faults.length, 1); assert.equal(faults[0].fault.code, FaultCode.ContextFailed); assert.equal(faults[0].fault.handling, FaultHandling.ContextMissing);
  // the frame still comes (the tabs and the theme follow the state); it says why it has no context
  assert.equal(changed.length, 3); assert.equal(changed[2].context, null); same(changed[2].causes, ["c"]);
  same(changed[2].faults.map(x => x.code), [FaultCode.ContextFailed]);
  assert.equal(changed[2].faults[0].cause.message, "no context", "the caught error rides along, not enumerable");
  assert.equal(JSON.stringify(changed[2].faults[0]).includes("cause"), false);
});

// ---------------------------------------------------------------- the handlers, each on a deep-frozen state
const ALL = handlers();
function runHandler(state, command) {
  const frozen = deepFreeze(J(state)), snap = JSON.stringify(frozen);
  const out = ALL.get(command.type)({ state: frozen, command: J(command) });
  assert.equal(JSON.stringify(frozen), snap, `${command.type} must not modify its input`);
  assert.ok(Array.isArray(out.notices) && Array.isArray(out.faults), `${command.type}: {state, notices, faults}`);
  JSON.stringify(out.notices);   // notices (and their action commands) are JSON
  for (const n of out.notices) for (const a of n.actions) assert.ok(hasNoFunctions(a), "an action command is plain data");
  return out;
}

test("T21 handlers: every Command has one (SetPeriodVol since v10 part 2b)", () => {
  const missing = Object.values(Command).filter(t => !ALL.has(t));
  same(missing, []);
  assert.equal(ALL.listKeys().length, Object.keys(Command).length);
});

test("T21 handlers: SetA / SetB / Link / Unlink / RelinkAll / Detach / Swap", () => {
  const S = baseState();
  let o = runHandler(S, { type: Command.SetA, path: "values.put", value: 20 });
  assert.equal(o.state.comparison.A.values.put, 20); assert.equal(o.state.tab, Tab.Compare); same(Object.keys(o.state), ["comparison", "assumptions", "prefs", "periodVol", "tab"]);
  o = runHandler(S, { type: Command.SetB, path: "values.put", value: 20 });
  assert.equal(o.state.comparison.links.placement, false); assert.equal(CMP.resolveB(o.state.comparison).values.put, 20);
  const relink = o.notices.flatMap(n => n.actions).find(a => /relink/.test(a.label));
  assert.ok(relink && relink.type === Command.ApplyAction && relink.steps.length);
  const back = runHandler(o.state, relink);
  assert.equal(back.state.comparison.links.placement, true);
  const un = runHandler(S, { type: Command.Unlink, aspect: "fill" });
  assert.equal(un.state.comparison.links.fill, false);
  const li = runHandler(un.state, { type: Command.Link, aspect: "fill" });
  assert.equal(li.state.comparison.links.fill, true); assert.ok(li.notices.some(n => /follows A/.test(n.text)));
  const all = runHandler(un.state, { type: Command.RelinkAll });
  assert.equal(Object.entries(all.state.comparison.links).filter(([a, v]) => a !== "inst" && !v).length, 0);
  const st = runHandler(S, { type: Command.SetA, path: "structure", value: "straddle" }).state;
  const de = runHandler(st, { type: Command.Detach, side: "A" });
  assert.equal(de.state.comparison.A.structure, "strangle"); assert.equal(de.state.comparison.A.legs, "detached");
  const sw = runHandler(S, { type: Command.Swap });
  assert.equal(sw.state.comparison.A.inst.id, CMP.resolveB(S.comparison).inst.id); assert.equal(sw.state.tab, Tab.Compare);
});

test("T21 handlers: SetFrom (lead note first), ApplyFix, ApplyAction quiet undo", () => {
  const S = baseState(), bId = CMP.resolveB(S.comparison).inst.id;
  const o = runHandler(S, { type: Command.SetFrom, side: "A", spec: { inst: { id: bId } }, leadNote: "A dropped its override" });
  assert.equal(o.state.comparison.A.inst.id, bId); assert.equal(o.notices[0].text, "A dropped its override"); assert.equal(o.notices[0].style, NoticeStyle.Event);
  const fx = runHandler(S, { type: Command.ApplyFix, fix: { side: "A", path: "fill", value: "nat" } });
  assert.equal(fx.state.comparison.A.fill, "nat");
  // relinking two aspects offers a quiet undo that unlinks both again
  const two = runHandler(runHandler(S, { type: Command.Unlink, aspect: "fill" }).state, { type: Command.Unlink, aspect: "exp" }).state;
  const re = runHandler(two, { type: Command.RelinkAll });
  const undo = re.notices.flatMap(n => n.actions).find(a => a.label === "undo");
  assert.ok(undo && undo.quiet === true);
  const u = runHandler(re.state, undo);
  assert.equal(u.state.comparison.links.fill, false); assert.equal(u.state.comparison.links.exp, false); assert.equal(u.notices.length, 0);
});

test("T21 handlers: SetSizing / SetExpiryMap / SetAssumption / SetPref validate their patch keys", () => {
  const S = baseState();
  assert.equal(runHandler(S, { type: Command.SetSizing, patch: { rule: "vega" } }).state.comparison.sizing.rule, "vega");
  assert.equal(runHandler(S, { type: Command.SetSizing, patch: { h: 2 } }).state.comparison.sizing.h, 2);
  assert.equal(runHandler(S, { type: Command.SetExpiryMap, expMap: "same" }).state.comparison.expMap, "same");
  assert.equal(runHandler(S, { type: Command.SetAssumption, patch: { dist: "hv" } }).state.assumptions.dist, "hv");
  // v9's listed-vol multiplier is gone: a patch carrying it is refused whole (the period vol replaces it)
  assert.equal(runHandler(S, { type: Command.SetAssumption, patch: { dist: "hv", hvk: 1.2 } }).faults[0].code, FaultCode.PatchRejected);
  assert.equal(runHandler(S, { type: Command.SetPref, patch: { units: "usd", theme: Theme.Dark } }).state.prefs.theme, Theme.Dark);
  for (const [type, patch] of [[Command.SetSizing, { foo: 1 }], [Command.SetAssumption, { unit: "pct" }], [Command.SetPref, { pins: [] }], [Command.SetPref, {}], [Command.SetAssumption, null]]) {
    const frozen = deepFreeze(J(S)), o = ALL.get(type)({ state: frozen, command: { type, patch } });
    assert.equal(o.state, frozen, `${type} ${JSON.stringify(patch)} leaves the state as it was`);
    assert.equal(o.faults.length, 1); assert.equal(o.faults[0].code, FaultCode.PatchRejected);
  }
});

test("T21 handlers: SetMoveUnit converts and turns symmetric off with its note first", () => {
  const S = baseState();
  const o = runHandler(S, { type: Command.SetMoveUnit, unit: "pct", rlo: 30, rhi: 45, wlo: 30, whi: 45 });
  assert.equal(o.state.assumptions.unit, "pct"); assert.equal(o.state.assumptions.rlo, 30); assert.equal(o.state.assumptions.rhi, 45); assert.equal(o.state.assumptions.rlink, false);
  assert.match(o.notices[0].text, /^Range converted to .* symmetric is off/);
  const sym = runHandler(S, { type: Command.SetMoveUnit, unit: "pct", rlo: 40, rhi: 40, wlo: 40, whi: 40 });
  assert.equal(sym.state.assumptions.rlink, true); assert.equal(sym.notices.length, 0);
});

test("T21 handlers: AddPin / RemovePin / ClearPins (12 pins at most)", () => {
  let S = baseState();
  for (let i = 0; i < 14; i++) S = runHandler(S, { type: Command.AddPin, pin: { SA: 10 + i, SB: 20, dA: 1, dB: 2 } }).state;
  assert.equal(S.prefs.pins.length, 12); assert.equal(S.prefs.pins[0].SA, 12);
  S = runHandler(S, { type: Command.RemovePin, index: 0 }).state;
  assert.equal(S.prefs.pins.length, 11); assert.equal(S.prefs.pins[0].SA, 13);
  // a malformed index or pin changes nothing and says why (one bad_command fault)
  for (const command of [{ type: Command.RemovePin }, { type: Command.RemovePin, index: "x" }, { type: Command.RemovePin, index: -1 }, { type: Command.RemovePin, index: 11 }, { type: Command.RemovePin, index: 0.5 },
    { type: Command.AddPin }, { type: Command.AddPin, pin: { SA: 0, SB: 20, dA: 1, dB: 2 } }, { type: Command.AddPin, pin: { SA: 10, SB: NaN, dA: 1, dB: 2 } }]) {
    const o = runHandler(S, command);
    same(o.state, S, JSON.stringify(command)); same(o.faults.map(f => f.code), [FaultCode.BadCommand], JSON.stringify(command));
  }
  same(runHandler(S, { type: Command.ClearPins }).state.prefs.pins, []);
});

test("T21 handlers: ShowTab, LoadView (theme fallback, View loaded first), Reset per target", () => {
  const S = baseState();
  assert.equal(runHandler(S, { type: Command.ShowTab, tab: Tab.Compounding }).state.tab, Tab.Compounding);
  const bad = runHandler(S, { type: Command.ShowTab, tab: "nope" });
  same(bad.state, S); assert.equal(bad.faults.length, 1);
  assert.equal(bad.faults[0].code, FaultCode.BadCommand); assert.equal(bad.faults[0].handling, FaultHandling.KeptTab);
  const other = runHandler(S, { type: Command.SetA, path: "fill", value: "nat" }).state;
  const code = writeV9Code({ state: other, tab: Tab.Compounding, theme: undefined });
  const read = STATE.readViewCode(code);
  assert.equal(read.ok, true);
  const dark = runHandler(S, { type: Command.SetPref, patch: { theme: Theme.Dark } }).state;
  const lv = runHandler(dark, { type: Command.LoadView, view: read.value.state, tab: read.value.tab, theme: read.value.theme, notices: read.value.notices });
  assert.equal(lv.state.comparison.A.fill, "nat"); assert.equal(lv.state.tab, Tab.Compounding); assert.equal(lv.state.prefs.theme, Theme.Dark, "a code without a theme keeps the current one");
  assert.equal(lv.notices[0].text, "View loaded");
  const lv2 = runHandler(dark, { type: Command.LoadView, view: read.value.state, tab: Tab.Compare, theme: Theme.Light, notices: [] });
  assert.equal(lv2.state.prefs.theme, Theme.Light);
  for (const [resetTarget, text, resets] of [[ResetTarget.Compare, "Compare A vs B reset to defaults", true], [ResetTarget.Compounding, "Compounding reset to defaults", false], [ResetTarget.Both, "Both tabs reset to defaults", true]]) {
    const o = runHandler(lv.state, { type: Command.Reset, resetTarget });
    same(o.notices.map(n => [n.text, n.style]), [[text, NoticeStyle.Plain]]);
    assert.equal(o.state.comparison.A.fill === "nat", !resets, resetTarget);
    assert.equal(o.state.prefs.theme, Theme.Dark); assert.equal(o.state.tab, Tab.Compounding);
  }
  const unknownTarget = ALL.get(Command.Reset)({ state: S, command: { type: Command.Reset, resetTarget: "everything" } });
  assert.equal(unknownTarget.state, S); same(unknownTarget.notices, []);
  assert.equal(unknownTarget.faults.length, 1); assert.equal(unknownTarget.faults[0].code, FaultCode.BadCommand); assert.match(unknownTarget.faults[0].text, /everything/);
});

test("T21 handlers: SetExportSection makes a tab's choice explicit (order of first choice), resets keep it, bad fields are refused", () => {
  const S = baseState();
  same(S.prefs.exportSections, {});
  const cmp = runHandler(S, { type: Command.SetExportSection, tab: Tab.Compare, section: ExportSection.Comparison, isOn: false });
  same(cmp.state.prefs.exportSections, { [Tab.Compare]: Object.assign({}, STATE.EXPORT_SECTION_DEFAULTS[Tab.Compare], { comparison: false }) });
  same(cmp.notices, []); same(cmp.faults, []); assert.equal(cmp.state.tab, Tab.Compare);
  const yr = runHandler(cmp.state, { type: Command.SetExportSection, tab: Tab.Compounding, section: ExportSection.Weeks, isOn: true });
  const both = runHandler(yr.state, { type: Command.SetExportSection, tab: Tab.Compare, section: ExportSection.Overview, isOn: true });
  same(Object.keys(both.state.prefs.exportSections), [Tab.Compare, Tab.Compounding]);
  same(STATE.readExportSections({ prefs: both.state.prefs, tab: Tab.Compare }), Object.assign({}, STATE.EXPORT_SECTION_DEFAULTS[Tab.Compare], { comparison: false, overview: true }));
  same(STATE.readExportSections({ prefs: both.state.prefs, tab: Tab.Compounding }).weeks, true);
  for (const resetTarget of Object.values(ResetTarget)) {
    same(runHandler(both.state, { type: Command.Reset, resetTarget }).state.prefs.exportSections, both.state.prefs.exportSections, resetTarget);
  }
  for (const command of [
    { type: Command.SetExportSection, tab: "nope", section: ExportSection.Header, isOn: true },
    { type: Command.SetExportSection, tab: Tab.Compounding, section: ExportSection.Header, isOn: true },
    { type: Command.SetExportSection, tab: Tab.Compare, section: ExportSection.Header, isOn: "yes" }
  ]) {
    const out = runHandler(S, command);
    same(out.state, S); assert.equal(out.faults.length, 1); assert.equal(out.faults[0].code, FaultCode.BadCommand);
  }
  const viaPatch = runHandler(S, { type: Command.SetPref, patch: { exportSections: { compare: { header: false } } } });
  same(viaPatch.state, S); assert.equal(viaPatch.faults[0].code, FaultCode.PatchRejected);
});

test("T21 handlers: a Compare reset keeps the period vol, a reset of both tabs clears it", () => {
  const S = Object.assign(STATE.applyChange(baseState(), s => { s.periodVol = { KORU: { pct: 100, source: "set" } }; }), { tab: Tab.Compare });
  same(S.periodVol, { KORU: { pct: 100, source: "set" } });
  same(runHandler(S, { type: Command.Reset, resetTarget: ResetTarget.Compare }).state.periodVol, S.periodVol);
  same(runHandler(S, { type: Command.Reset, resetTarget: ResetTarget.Compounding }).state.periodVol, S.periodVol);
  same(runHandler(S, { type: Command.Reset, resetTarget: ResetTarget.Both }).state.periodVol, {});
});

test("T21 handlers: PlaceLeg puts the clicked strike on the leg (views' smilePlace on a fresh context)", () => {
  const S = baseState(), C = CTX.ctx9(S);
  const put = C.A.legs.find(l => l.role === "short put"), E = C.A.E;
  const K = E.rows.map(r => r.K).filter((k, i, a) => a.indexOf(k) === i).filter(k => k < put.K).sort((a, b) => b - a)[0];
  const o = runHandler(S, { type: Command.PlaceLeg, side: "A", role: "short put", strike: K });
  const nb = CTX.ctx9(o.state).A;
  assert.equal(nb.legs.find(l => l.role === "short put").K, K);
  assert.equal(o.state.tab, Tab.Compare);
  const refused = runHandler(S, { type: Command.PlaceLeg, side: "A", role: "long call", strike: K });
  assert.match(refused.notices[0].text, /^Not placed/);
});

// ---------------------------------------------------------------- the page's guarded steps and fault log (app.js on stubs)
function loadPage() {
  const { P, logged } = loadWithConsole();
  const src = fs.readFileSync(path.join(V9, "app.js"), "utf8"), withoutMain = src.replace(/\nmain\(\);\s*$/, "\n");
  assert.notEqual(withoutMain, src, "app.js ends with main();");
  vm.runInContext(withoutMain + ";globalThis.__page = { page, runGuarded, logFault, reportStorageFault };", P.ctx, { filename: "app.js" });
  const app = P.ctx.__page;
  app.page.bus = new P.Bus({ now: () => 5 });
  const faults = [];
  app.page.bus.subscribe(P.EnvelopeType.Fault, e => faults.push(e.fault));
  app.page.bus.subscribe(P.EnvelopeType.Fault, app.logFault);
  return { P, app, faults, logged };
}

test("T21 page: a guarded step that throws keeps v9's console line and raises exactly one fault, not printed again", () => {
  const { P, app, faults, logged } = loadPage();
  const boom = new Error("summary broke");
  app.runGuarded({ where: "summary", run: () => { throw boom; } });
  assert.equal(faults.length, 1);
  const f = faults[0];
  assert.equal(f.code, P.FaultCode.GuardedStepFailed); assert.equal(f.handling, P.FaultHandling.LoggedWhereCaught);
  assert.equal(f.where, "summary"); assert.equal(f.text, "summary broke"); assert.equal(f.cause, boom);
  assert.equal(logged.length, 1, "one console line: v9's"); assert.equal(logged[0][0], "summary"); assert.equal(logged[0][1], boom);
  app.runGuarded({ where: "dock", run: () => {} });
  assert.equal(faults.length, 1, "a step that runs raises nothing");
  // any other fault is printed once, with the caught error (its stack) when it has one
  app.page.bus.emit(P.createFaultEnvelope({ fault: P.createFault({ code: "x", text: "t", where: "w", cause: boom }) }));
  assert.equal(logged.length, 2); assert.equal(logged[1][0], "w"); assert.match(logged[1][1], /^x: t \(/); assert.equal(logged[1][2], boom);
});

test("T21 page: a refused storage write is one fault per session", () => {
  const { P, app, faults, logged } = loadPage();
  for (let i = 0; i < 3; i++) app.reportStorageFault({ error: { code: "storage_unavailable", message: "quota" }, handling: P.FaultHandling.ViewNotStored });
  assert.equal(faults.length, 1); assert.equal(faults[0].code, P.FaultCode.StorageFailed); assert.equal(faults[0].severity, P.FaultSeverity.Warning);
  assert.equal(logged.length, 1); assert.equal(logged[0][0], "info", "a warning is not printed at the error or warning level (v9 printed nothing)");
  assert.equal(logged[0][1], "storage"); assert.match(logged[0][2], /quota/);
});

// ---------------------------------------------------------------- view codes as Results
test("T21 readViewCode: not_a_code / unknown_version / undecodable / ok", () => {
  assert.equal(STATE.readViewCode("").error.code, ViewCodeError.NotACode);
  assert.equal(STATE.readViewCode("hello").error.code, ViewCodeError.NotACode);
  assert.equal(STATE.readViewCode("#v7.abc").error.code, ViewCodeError.UnknownVersion);
  assert.equal(STATE.readViewCode("#v9.!!!!").error.code, ViewCodeError.Undecodable);
  assert.equal(STATE.readViewCode("v9.bm90IGpzb24").error.code, ViewCodeError.Undecodable);
  const light = Object.assign(runHandler(baseState(), { type: Command.SetPref, patch: { theme: Theme.Light } }).state, { tab: Tab.Compounding });
  const code = STATE.writeViewCode({ state: light, yr: { a: 1 } });
  assert.ok(code.startsWith("v10."));
  for (const text of [code, "#" + code, "https://example.org/lab.html#" + code]) {
    const r = STATE.readViewCode(text);
    assert.equal(r.ok, true);
    same(r.value.state, withoutTab(light)); assert.equal(r.value.tab, Tab.Compounding); assert.equal(r.value.theme, Theme.Light); same(r.value.yr, { a: 1 });
    same(r.value.notices, []); same(r.value.faults, []);
  }
  const dark = Object.assign(runHandler(baseState(), { type: Command.SetPref, patch: { theme: Theme.Dark } }).state, { tab: Tab.Compare });
  const stored = STATE.readStoredView(JSON.parse(JSON.stringify(STATE.writeStoredView({ state: dark, yr: null }))));
  assert.equal(stored.ok, true); assert.equal(stored.value.theme, Theme.Dark); assert.equal(stored.value.yr, null);
});

test("T21 view-code versions: one list (ViewCodeVersion) for parse and readViewCode", () => {
  same(Object.values(ViewCodeVersion), ["10", "9", "8", "5"]);
  const payload = writeV9Code({ state: baseState(), tab: Tab.Compare }).slice(3);
  for (const version of Object.values(ViewCodeVersion)) {
    assert.ok(STATE.parse(`v${version}.${payload}`), `parse reads v${version}`);
    assert.notEqual(STATE.readViewCode(`v${version}.${payload}`).error?.code, ViewCodeError.UnknownVersion, `readViewCode reads v${version}`);
  }
  assert.equal(STATE.parse(`v11.${payload}`), null); assert.equal(STATE.readViewCode(`v11.${payload}`).error.code, ViewCodeError.UnknownVersion);
  // a payload over two lines is not a code (parse: null), as v9's pattern said
  assert.equal(STATE.parse(`v9.${payload.slice(0, 8)}\n${payload.slice(8)}`), null);
  assert.equal(STATE.readViewCode(`v9.${payload.slice(0, 8)}\n${payload.slice(8)}`).error.code, ViewCodeError.NotACode);
});

test("T21 toast actions: steps are ActionStep values; an unknown step throws CoreErrorCode.UnknownActionStep", () => {
  const S = baseState();
  const ownPut = STATE.cmpOp(S, "setB", "values.put", 20);
  const action = ownPut.events[0].actions[0];
  same(action.steps, [[ActionStep.Link, "placement"]]);
  assert.throws(() => CMP.runAction(S.comparison, { steps: [["teleport"]] }), e => e.code === CoreErrorCode.UnknownActionStep && /teleport/.test(e.message));
});

// ---------------------------------------------------------------- adapters on fakes
test("T21 adapters: storage on a fake localStorage, and on one that refuses", () => {
  const mem = new Map();
  const ok = load(null, { globals: { localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } } });
  same(J(ok.storage.read("k")), { ok: true, value: null });
  assert.equal(ok.storage.write({ key: "k", text: "v" }).ok, true); assert.equal(ok.storage.read("k").value, "v");
  assert.equal(ok.storage.remove("k").ok, true); assert.equal(ok.storage.read("k").value, null);
  assert.equal(ok.storage.read("").error.code, ok.AdapterError.BadKey);
  assert.equal(ok.storage.write({ key: "k", text: 5 }).error.code, ok.AdapterError.BadText);
  const refusing = load(null, { globals: { localStorage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); } } } });
  assert.equal(refusing.storage.read("k").error.code, refusing.AdapterError.StorageUnavailable);
  assert.equal(refusing.storage.write({ key: "k", text: "v" }).error.message, "quota");
  assert.equal(load().storage.read("k").ok, false, "no localStorage at all");
});

test("T21 adapters: clipboard on a fake navigator; calendar formats", async () => {
  const written = [];
  const okC = load(null, { globals: { navigator: { clipboard: { writeText: async t => { written.push(t); } } } } });
  same(J(await okC.clipboard.writeText("abc")), { ok: true, value: { length: 3 } }); same(written, ["abc"]);
  const blocked = load(null, { globals: { navigator: { clipboard: { writeText: async () => { throw new Error("NotAllowed"); } } } } });
  assert.equal((await blocked.clipboard.writeText("abc")).error.code, blocked.AdapterError.ClipboardBlocked);
  assert.equal((await load().clipboard.writeText("abc")).ok, false, "no clipboard at all");
  const { calendar } = L;
  assert.equal(calendar.formatLongDay(new Date(2026, 9, 2)), "2 Oct 2026");
  assert.equal(calendar.formatIsoDay(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(calendar.readUtcDayStart("2026-10-01T16:00:00"), Date.UTC(2026, 9, 1));
  assert.ok(Number.isNaN(calendar.readUtcDayStart("soon")));
  assert.equal(calendar.formatShortUtcDay(new Date(Date.UTC(2026, 9, 5))), "5 Oct");
  assert.equal(calendar.formatShortUtcDay(Date.UTC(2027, 0, 8)), "8 Jan 27");
  assert.equal(calendar.formatShortUtcDay("nonsense"), "–");
  assert.equal(calendar.formatAsOfDay("2026-10-02 16:00"), "2 Oct 2026"); assert.equal(calendar.formatAsOfDay("2026-01-09T10:30"), "9 Jan 2026");
  assert.equal(calendar.formatAsOfDay("live"), "live"); assert.equal(calendar.formatAsOfDay(undefined), "");
});

test("T21 adapters: download refuses a bad filename or an empty file without touching the browser", async () => {
  const { download, AdapterError } = L;
  assert.equal((await download.saveTextFile({ filename: " ", text: "x" })).error.code, AdapterError.BadFilename);
  assert.equal((await download.saveTextFile({ filename: "a.md", text: "" })).error.code, AdapterError.EmptyFile);
  const saved = [];
  const viewer = load(null, { globals: { window: { claude: { use: async () => ({ save: async o => { saved.push(o.filename); } }) } } } });
  same(J(await viewer.download.saveTextFile({ filename: "a.md", text: "x" })), { ok: true, value: { status: "saved", filename: "a.md" } });
  const declining = load(null, { globals: { window: { claude: { use: async () => ({ save: async () => { throw Object.assign(new Error("no"), { code: "declined" }); } }) } } } });
  assert.equal((await declining.download.saveTextFile({ filename: "a.md", text: "x" })).value.status, "declined");
  same(saved, ["a.md"]);
});

// ---------------------------------------------------------------- the never-throw boundaries (fix round 3)
test("T21 boundaries: a cyclic command is refused, not a stack overflow; Result.err / storage.write / saveTextFile without arguments answer err", async () => {
  const cyclic = { units: "usd" }; cyclic.self = cyclic;
  assert.equal(isCommand({ type: Command.SetPref, patch: cyclic }), false);
  const shared = { on: true };
  assert.equal(isCommand({ type: Command.SetPref, patch: { a: shared, b: shared } }), true, "an object reached twice without a cycle is still plain data");
  const { bus, store, frames, executor } = loop(baseState());
  const faults = record(bus, EnvelopeType.Fault);
  const r = executor.execute({ type: Command.SetPref, patch: cyclic });
  assert.equal(r.ok, false); assert.equal(r.error.code, FaultCode.UnknownCommand); assert.match(r.error.message, /cycle/);
  assert.equal(faults.length, 1); assert.equal(store.writeCount, 0); assert.equal(frames.pending, 0);
  const typeless = { a: 1 }; typeless.self = typeless;
  const r2 = executor.execute(/** @type {any} */ (typeless));
  assert.equal(r2.ok, false); assert.match(r2.error.message, /JSON cannot print/);
  const e = Result.err();
  assert.equal(e.ok, false); assert.equal(e.error.code, "unspecified");
  assert.equal(L.storage.write().error.code, L.AdapterError.BadKey);
  assert.equal((await L.download.saveTextFile()).error.code, L.AdapterError.BadFilename);
});

test("T21 handlers: LoadView without a view is a bad_command rejection (state kept), not a handler failure", () => {
  const S = baseState();
  for (const view of [undefined, null, "v9.abc"]) {
    const out = runHandler(S, { type: Command.LoadView, view, tab: Tab.Compare, notices: [] });
    same(out.state, S); same(out.notices, []);
    assert.equal(out.faults.length, 1); assert.equal(out.faults[0].code, FaultCode.BadCommand); assert.equal(out.faults[0].handling, FaultHandling.KeptView);
  }
});

test("T21 readViewCode: an undecodable code's message names the payload", () => {
  const notJson = STATE.readViewCode("v9.bm90IGpzb24");
  assert.equal(notJson.error.code, ViewCodeError.Undecodable); assert.match(notJson.error.message, /v9 view code payload "bm90IGpzb24" is not base64url JSON/);
  const notObject = STATE.readViewCode("v9." + STATE.enc(5));
  assert.equal(notObject.error.code, ViewCodeError.Undecodable); assert.match(notObject.error.message, /is not an object/);
  assert.throws(() => STATE.parse("v9.bm90IGpzb24"), err => err.code === ViewCodeError.Undecodable);
});
