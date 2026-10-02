/**
 * The lab's runtime core, loaded before everything else and shared by both tabs: the closed vocabularies (commands,
 * envelope types, fault codes, tabs, themes), the Result and Fault records that cross module boundaries, and the
 * event loop. A change is a command: one executor applies it synchronously to the one store and says what happened
 * on a synchronous bus; a frame loop turns any number of changes into one "state.changed" per animation frame, which
 * the render and persistence subscribers consume. Model layer: no DOM and no browser globals (frames and the clock
 * are injected: the bus needs a clock and stamps every envelope that has no time), so the node tests drive all of it.
 *
 * Timing contract: a command in CORE_CONFIG.renderAtOnce (ShowTab) renders before execute() returns when it runs
 * from a DOM event. Run from inside a bus listener, its frame is queued behind the envelope being delivered (the bus
 * never interleaves); execute() then answers rendered: false and the caller waits for that state.changed.
 *
 * Envelopes are flat, at most three levels deep:
 *   command        { type: Command.SetB, path: "values.put", value: 20, source: "dock" }
 *   state.changed  { type, at, state, context, notices, faults, causes: [Command.SetB] }   once per frame; notices and
 *                  faults are those of the commands it renders; context is null on a tab without a builder or when the
 *                  builder failed (then the ContextFailed fault is in faults)
 *   notice         { type, at, batch, notice: { text, actions: [command], style } }         a toast; buttons run commands
 *   fault          { type, at, fault: { code, severity, text, handling, where } }           a defect the page handled
 */

/**
 * @typedef {{ type: string, source?: string, [field: string]: any }} LabCommand
 *   plain JSON data: no functions, so a command can sit in a notice, a log or a test fixture
 * @typedef {{ text: string, actions: LabCommand[], style: string }} LabNotice
 * @typedef {{ code: string, severity: string, text: string, handling: string, where: string, cause?: any }} LabFault
 *   cause (not enumerable, so not in JSON) is the caught error, kept for its stack
 * @typedef {{ type: string, at?: number, batch: string, notice: LabNotice }} NoticeEnvelope
 * @typedef {{ type: string, at?: number, fault: LabFault }} FaultEnvelope
 * @typedef {{ type: string, at: number, state: any, context: any, notices: LabNotice[], faults: LabFault[], causes: string[] }} StateChangedEnvelope
 * @typedef {NoticeEnvelope | FaultEnvelope | StateChangedEnvelope} LabEnvelope
 * @typedef {{ state: any, notices: LabNotice[], faults: LabFault[] }} HandlerOutcome
 * @typedef {(input: { state: any, command: LabCommand }) => HandlerOutcome} CommandHandler
 * @typedef {{ code: string, message: string, [detail: string]: any }} LabError
 * @typedef {{ ok: boolean, value?: any, error?: LabError }} LabResult   ok: true carries value, ok: false carries error
 * @typedef {{ state: any, notices: LabNotice[], faults: LabFault[], rendered: boolean }} ExecutedCommand
 *   the value of a successful execute(); rendered: its state.changed was delivered before execute() returned
 * @typedef {{ cause?: string, notices?: LabNotice[], faults?: LabFault[] }} FrameRequest
 */

// ---------------------------------------------------------------- vocabularies (the values are what is stored or emitted)
// every change the page can make; the handlers are registered by the state module (and the views for leg placement)
const Command = Object.freeze({
  SetA: "cmp.setA", SetB: "cmp.setB", Link: "cmp.link", Unlink: "cmp.unlink", Detach: "cmp.detach", Swap: "cmp.swap",
  RelinkAll: "cmp.relinkAll", SetFrom: "cmp.setFrom", ApplyFix: "cmp.applyFix", ApplyAction: "cmp.applyAction",
  // the pair settings outside A and B (dock: Pair sizing, the expiry map popover) and a click on a smile quote
  SetSizing: "cmp.setSizing", SetExpiryMap: "cmp.setExpiryMap", PlaceLeg: "cmp.placeLeg",
  SetAssumption: "assumptions.set", SetMoveUnit: "assumptions.setMoveUnit", SetPeriodVol: "periodVol.set",
  SetPref: "prefs.set", AddPin: "prefs.addPin", RemovePin: "prefs.removePin", ClearPins: "prefs.clearPins",
  // one export section on or off for one tab (prefs.exportSections); it changes what the export writes, not the screen
  SetExportSection: "prefs.setExportSection",
  ShowTab: "page.showTab", LoadView: "page.loadView", Reset: "page.reset"
});
const EnvelopeType = Object.freeze({ StateChanged: "state.changed", Notice: "notice", Fault: "fault" });
const FaultCode = Object.freeze({
  UnknownCommand: "unknown_command", HandlerFailed: "handler_failed", ListenerFailed: "listener_failed",
  ContextFailed: "context_failed", PatchRejected: "patch_rejected",
  // a command whose fields are not usable (an unknown tab or reset target, a pin index outside the list)
  BadCommand: "bad_command",
  // a page step that keeps v9's own try/catch and console line (a render, a Compounding call)
  GuardedStepFailed: "guarded_step_failed",
  // localStorage refused (a private window) or the stored view did not load
  StorageFailed: "storage_failed", StoredViewFailed: "stored_view_failed",
  // a value outside its range, applied at the nearest end (a period vol below the comparer's floor or above the cap)
  ValueClamped: "value_clamped"
});
const FaultSeverity = Object.freeze({ Error: "error", Warning: "warning" });
// what the page did about a fault, in words a log reader understands
const FaultHandling = Object.freeze({
  ToastKeptState: "toast; the state was kept", Logged: "logged; nothing changed",
  IgnoredCommand: "ignored the command; the state was kept", KeptTab: "ignored the command; the current tab was kept",
  KeptView: "ignored the command; the current view was kept",
  // a state.changed listener (a render step, the persistence) that threw: the change itself stands
  SkippedFrameStep: "logged; the state is kept, this listener skipped the frame",
  SkippedNotice: "logged; this listener skipped the notice",
  ContextMissing: "logged; the tabs and the theme updated, the panels kept their last render",
  IgnoredPatch: "ignored the whole patch",
  // the console line was printed where the error was caught (v9's text); fault readers must not print it again
  LoggedWhereCaught: "logged where it was caught; the page carried on",
  ViewNotStored: "logged once; the view was not stored", StartedWithoutStore: "logged; the page started without the stored view",
  AppliedClamped: "applied at the nearest end of the range; a toast says so"
});
const Tab = Object.freeze({ Compare: "compare", Compounding: "yr" });
const Theme = Object.freeze({ Auto: "auto", Light: "light", Dark: "dark" });
// v9's two toast looks, kept apart until one notice panel unifies them: plain text (3.8 s) and event chips with
// action buttons (4 s)
const NoticeStyle = Object.freeze({ Plain: "plain", Event: "event" });
// why a frame was asked for when no command changed the state
const FrameCause = Object.freeze({ Ui: "ui", Boot: "boot", Resize: "resize", ColorScheme: "colorScheme", Fonts: "fonts" });
const ViewCodeError = Object.freeze({ NotACode: "not_a_code", Undecodable: "undecodable", UnknownVersion: "unknown_version" });
// the view-code versions the page reads ("#v10." ...), newest first; the one list parse and readViewCode share. The page
// writes only the first (codes and the stored blob); the others load through migration
const ViewCodeVersion = Object.freeze({ V10: "10", V9: "9", V8: "8", V5: "5" });
// the sections of the markdown export, per tab in document order (STATE holds which are on by default, the export
// their labels); prefs.exportSections stores the reader's choice
const ExportSection = Object.freeze({
  Header: "header", Comparison: "comparison", Assumptions: "assumptions", Results: "results", Recovery: "recovery", Pins: "pins",
  Overview: "overview", Notes: "notes",
  Runs: "runs", Base: "base", Strip: "strip", Weeks: "weeks", Stress: "stress", Random: "random"
});
// the steps a toast action runs on the comparison ([step, ...args] in an ApplyAction command), see CMP.runAction
const ActionStep = Object.freeze({ Link: "link", Unlink: "unlink", RelinkSome: "relinkSome", StartFromA: "startFromA", SetA: "setA", SetB: "setB" });
// the comparison operations a command runs through STATE.cmpOp (the CMP function of that name)
const CmpOperation = Object.freeze({
  SetA: "setA", SetB: "setB", Link: "link", Unlink: "unlink", Detach: "detach", RelinkAll: "relinkAll", SetFrom: "setFrom", ApplyFix: "applyFix"
});
// the type of a comparison / normaliser event (CMP and STATE events, before they become notices)
const CmpEventType = Object.freeze({
  Note: "note", Identical: "identical", Restored: "restored", Linked: "linked", Unlinked: "unlinked", SwapUnlinked: "swapUnlinked", Migrated: "migrated"
});
// the codes of the errors the core throws at a caller that broke its contract (a programming error, not a fault)
const CoreErrorCode = Object.freeze({
  DuplicateKey: "duplicate_key", BadClock: "bad_clock", BadSubscription: "bad_subscription", BadEnvelope: "bad_envelope",
  BadOutcome: "bad_outcome", UnknownActionStep: "unknown_action_step"
});
// what a Reset command puts back to defaults
const ResetTarget = Object.freeze({ Compare: "compare", Compounding: "yr", Both: "both" });
// where a ticker's period vol came from (state.periodVol[id].source; absent = the listed 30-day historical vol). The
// source is stored with the value and never inferred from it: a hand-set value equal to the listed one stays Set
const VolSource = Object.freeze({ Hv30: "hv30", Atm: "atm", Set: "set" });
// the odds behind profit odds, the odds strips, the grid's column odds and the comparison table's EV row
// (assumptions.dist; the stored values are v8's). EV readings elsewhere always use the period vol
const Odds = Object.freeze({ Implied: "rn", PeriodVol: "hv" });
// the period vol's numbers, shared by the state (sanitizer, SetPeriodVol), the comparer (its reader and its box) and
// the Compounding tab's vol control: the stored range in % (0 = "exactly on the path", meaningful only to the
// Compounding tab), the floor each reader applies (the comparer's odds need a positive vol), the stored precision
const PERIOD_VOL_CONFIG = Object.freeze({
  range: Object.freeze([0, 300]),
  floor: Object.freeze({ [Tab.Compare]: 1, [Tab.Compounding]: 0 }),
  decimals: 2
});
// the assumptions' stored values (step 3 names the rest of §8.1's enums): the move axis unit, the worst-loss range
// (the view's or its own), the expiry alignment of the charts' time axis
const MoveUnit = Object.freeze({ Sigma: "sig", Percent: "pct", Points: "pts" });
const WorstLossRange = Object.freeze({ View: "view", Own: "own" });
const Align = Object.freeze({ Fraction: "frac", Calendar: "cal" });
// the readings' unit (prefs.units): % of notional, $ per contract, × credit
const ReadingUnit = Object.freeze({ Percent: "pct", Usd: "usd", Credit: "cr", Margin: "margin" });
// the recovery panel's growth rate per cycle (prefs.rdG): the EV at the period vol, or the reader's own number
// the recovery panel's growth a cycle (the old "ev" reading is Average): see recovery.js
const GrowthRate = Object.freeze({ IfNoSuchHit: "nohit", Average: "avg", BestCase: "best", Typed: "custom" });
// what a recovery is measured against: each side's Reg T margin at entry, or its notional
const Capital = Object.freeze({ Margin: "margin", Notional: "notional" });
// which side of a move hurts: the worse of the two, or one side
const HitSide = Object.freeze({ Worse: "worse", Down: "down", Up: "up" });
// the recovery panel's hit (prefs.rdHit): a kσ move to the position's own expiry, or a fixed % of NAV
const HitBasis = Object.freeze({ Move: "move", Fixed: "fixed" });
// the Compounding tab's two runs (the run that carries a "B differs in vol" override: yr.sc.volOverride.run)
const RunSlot = Object.freeze({ A: "A", B: "B" });
// what the Compounding tab's B differs from A in (yr.bDiff)
const RunDiff = Object.freeze({
  Strategy: "strategy", Ticker: "ticker", Cadence: "cadence", Strikes: "strikes", Size: "size", Modus: "modus", Vol: "vol", Any: "any"
});
// the closed lists, in display order (the tab strip, the theme control, the validators)
const TABS = Object.freeze(Object.values(Tab)), THEMES = Object.freeze(Object.values(Theme));

const CORE_CONFIG = Object.freeze({
  appName: "Short Options Comparer",                             // the product's name: page title, header, exports
  // their frame runs before execute() returns, unless the bus is delivering (see the timing contract above)
  renderAtOnce: /** @type {readonly string[]} */ (Object.freeze([Command.ShowTab])),
  failedChangeText: "That change could not be applied",        // the toast for a handler that threw (v9's text)
  // what the page did when a listener of this envelope type threw (the fault's handling); other types: Logged
  listenerFailureHandling: Object.freeze({ [EnvelopeType.StateChanged]: FaultHandling.SkippedFrameStep, [EnvelopeType.Notice]: FaultHandling.SkippedNotice })
});

// ---------------------------------------------------------------- Result, Fault and envelope records
const Result = Object.freeze({
  /** @returns {LabResult} */
  ok(value) { return { ok: true, value }; },
  /** @param {{ code: string, message: string, [detail: string]: any }} error @returns {LabResult} */
  err({ code, message, ...detail } = { code: "", message: "" }) {
    return { ok: false, error: { code: code || "unspecified", message: message || `failed with ${code || "no code"}`, ...detail } };
  },
  isOk(result) { return !!result && result.ok === true; }
});
/** @param {{ code: string, message: string }} fields @returns {Error & { code: string }} */
function createCoreError({ code, message }) {
  const error = new Error(message);
  return Object.assign(error, { code });
}
// the message of anything thrown (an Error, a string, undefined)
function describeThrown(error) {
  if (error && error.message) { return String(error.message); }
  return String(error);
}
/**
 * @param {{ code: string, severity?: string, text?: string, handling?: string, where?: string, cause?: any }} fields
 * @returns {LabFault}
 */
function createFault({ code, severity, text, handling, where, cause }) {
  const fault = { code, severity: severity || FaultSeverity.Error, text: String(text || code), handling: handling || FaultHandling.Logged, where: String(where || "") };
  if (cause !== undefined) { Object.defineProperty(fault, "cause", { value: cause, enumerable: false }); }
  return Object.freeze(fault);
}
// "at" is optional on both envelopes: the bus stamps an envelope that has none with its own clock
/** @param {{ fault: LabFault, at?: number }} fields @returns {FaultEnvelope} */
function createFaultEnvelope({ fault, at }) {
  return { type: EnvelopeType.Fault, at, fault };
}
// a notice without a batch shows on its own; notices sharing a batch (one command's events) share one toast
/** @param {{ text: string, actions?: LabCommand[], style?: string, batch?: string, at?: number }} fields @returns {NoticeEnvelope} */
function createNoticeEnvelope({ text, actions, style, batch, at }) {
  const notice = { text: String(text || ""), actions: actions || [], style: style || NoticeStyle.Plain };
  return { type: EnvelopeType.Notice, at, batch: batch || "", notice };
}
// commands and envelopes share this shape: an object whose type is a non-empty string
function hasTypeField(value) {
  const isObject = !!value && typeof value === "object";
  if (!isObject) { return false; }
  const hasTypeName = typeof value.type === "string" && value.type.length > 0;
  return hasTypeName;
}
// plain JSON data all the way down: no functions and no cycles, so a command can ride in a notice, a log or a test
// fixture (and JSON.stringify of it cannot throw). Only the objects on the current path count as a cycle: one object
// shared by two branches is still plain data
/** @param {any} value @param {Set<object>} [ancestors] */
function isPlainData(value, ancestors = new Set()) {
  if (typeof value === "function") { return false; }
  if (value === null || typeof value !== "object") { return true; }
  if (ancestors.has(value)) { return false; }
  ancestors.add(value);
  const isPlain = Object.values(value).every(child => isPlainData(child, ancestors));
  ancestors.delete(value);
  return isPlain;
}
// JSON text for a message; a value JSON cannot print (a cycle, a BigInt) is described by its type instead
function describeValue(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `(a ${typeof value} JSON cannot print: ${describeThrown(error)})`;
  }
}
const isCommand = value => hasTypeField(value) && isPlainData(value);
function isHandlerOutcome(value) {
  const hasState = !!value && typeof value === "object" && value.state !== undefined;
  return hasState && Array.isArray(value.notices) && Array.isArray(value.faults);
}

// ---------------------------------------------------------------- the period vol: one accessor, one label
// The assumed vol of a ticker's moves over the period (annualized like IV, calendar days), one number per ticker for
// every expiry. It defaults to IBKR's listed 30-day historical vol of the instrument (or raw data record). Every
// reader outside inst.js comes through readPeriodVol, and every label through labelPeriodVol / nameVolSource (build
// rule: the hv field is read only in inst.js and readPeriodVol, the listed vol's name is spelled only in
// nameVolSource), so the
// listed vol has exactly one door. pct is in % (117.32 = 117.32%); the stored entry wins when it has a finite pct.
/** @param {{ entry?: { pct: number, source?: string, expiry?: string } | null, record?: any }} input */
function readPeriodVol({ entry, record }) {
  if (entry && Number.isFinite(entry.pct)) { return { pct: entry.pct, source: entry.source || VolSource.Set, expiry: entry.expiry || "" }; }
  return { pct: record ? +record.hv * 100 : NaN, source: VolSource.Hv30, expiry: "" };
}
// the source as labels print it: the listed vol's name, "set", or "ATM 16 Oct" (the expiry the ATM was read at)
/** @param {{ source: string, expiry?: string }} vol */
function nameVolSource({ source, expiry }) {
  if (source === VolSource.Set) { return "set"; }
  if (source === VolSource.Atm) { return expiry ? `ATM ${fmtE(expiry)}` : "ATM"; }
  return "HV30";
}
// "vol 117% (<the listed vol's name>)", "vol 100% (set)", "vol 124% (ATM 16 Oct)": every label of a period vol. A
// reader that floored the stored value (storedPct below pct) says so: "vol 1% (set 0%, floored)"
/** @param {{ pct: number, source: string, expiry?: string, storedPct?: number }} vol */
function labelPeriodVol(vol) {
  const pct = Number.isFinite(vol.pct) ? `${Math.round(vol.pct)}%` : "–";
  const isFloored = Number.isFinite(vol.storedPct) && vol.storedPct < vol.pct;
  if (isFloored) { return `vol ${pct} (${nameVolSource(vol)} ${+vol.storedPct.toFixed(2)}%, floored)`; }
  return `vol ${pct} (${nameVolSource(vol)})`;
}

// ---------------------------------------------------------------- Registry
// Why a class: it owns one Map and the rule that a key is registered once. Every lookup table of the lab (the command
// handlers now, saved comparisons later) is the same generic collection over a different value type, so the rule
// lives in one place instead of in each table. It stores values as given: callers normalize.
class Registry {
  /** @param {{ name?: string }} [options] */
  constructor({ name } = { name: "registry" }) {
    this.name = name || "registry";
    this.entries = new Map();
  }
  register(key, value) {
    if (this.entries.has(key)) {
      throw createCoreError({ code: CoreErrorCode.DuplicateKey, message: `${this.name}: ${JSON.stringify(key)} is already registered (keys: ${[...this.entries.keys()].join(", ")})` });
    }
    this.entries.set(key, value);
    return this;
  }
  get(key) { return this.entries.get(key); }
  has(key) { return this.entries.has(key); }
  listKeys() { return [...this.entries.keys()]; }
}

// ---------------------------------------------------------------- Bus
// Why a class: delivery order is state. The bus holds its listeners per envelope type, the queue of envelopes
// emitted while it is delivering, and whether it is delivering; re-entrant emits wait their turn (FIFO) instead of
// interleaving with the envelope being delivered. A listener that throws becomes one fault envelope; a fault
// listener that throws is only logged, so a broken fault reader cannot loop. It owns the clock every envelope
// without a time is stamped with.
class Bus {
  /** @param {{ now: () => number, logListenerFailure?: (failure: { where: string, error: any }) => void }} options */
  constructor({ now, logListenerFailure } = { now: undefined }) {
    if (typeof now !== "function") {
      throw createCoreError({ code: CoreErrorCode.BadClock, message: `a Bus needs a clock: {now: () => milliseconds}, got now = ${typeof now}` });
    }
    this.listeners = new Map();
    this.queue = [];
    this.isDispatching = false;
    this.now = now;
    this.logListenerFailure = logListenerFailure || (({ where, error }) => console.error(where, error));
  }
  /** @returns {() => void} unsubscribe */
  subscribe(type, listener) {
    if (typeof type !== "string" || !type || typeof listener !== "function") {
      throw createCoreError({ code: CoreErrorCode.BadSubscription, message: `bus.subscribe needs an envelope type and a function, got ${JSON.stringify(type)} and ${typeof listener}` });
    }
    this.listeners.set(type, (this.listeners.get(type) || []).concat([listener]));
    return () => { this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x !== listener)); };
  }
  /** synchronous: delivered before emit() returns, unless the bus is already delivering (then queued, FIFO) */
  emit(envelope) {
    if (!hasTypeField(envelope)) {
      throw createCoreError({ code: CoreErrorCode.BadEnvelope, message: `bus.emit needs an envelope with a type, got ${JSON.stringify(envelope)}` });
    }
    this.queue.push(this.stamp(envelope));
    if (this.isDispatching) { return; }
    this.isDispatching = true;
    try {
      while (this.queue.length) { this.deliver(this.queue.shift()); }
    } finally {
      this.isDispatching = false;
    }
  }
  stamp(envelope) {
    if (typeof envelope.at === "number") { return envelope; }
    return { ...envelope, at: this.now() };
  }
  deliver(envelope) {
    // the list is replaced on (un)subscribe, so this snapshot is stable while listeners run
    const listeners = this.listeners.get(envelope.type) || [];
    for (const listener of listeners) {
      try { listener(envelope); } catch (error) { this.reportListenerFailure({ envelope, error }); }
    }
  }
  reportListenerFailure({ envelope, error }) {
    const where = `a ${envelope.type} listener`;
    if (envelope.type === EnvelopeType.Fault) {
      this.logFaultListenerFailure({ where, error });
      return;
    }
    const handling = CORE_CONFIG.listenerFailureHandling[envelope.type] || FaultHandling.Logged;
    const fault = createFault({ code: FaultCode.ListenerFailed, severity: FaultSeverity.Error, text: describeThrown(error), handling, where, cause: error });
    this.queue.push(createFaultEnvelope({ fault, at: this.now() }));
  }
  // the end of the line: a logger that throws too is reported on the console and dropped, so the queue keeps moving
  logFaultListenerFailure({ where, error }) {
    try {
      this.logListenerFailure({ where, error });
    } catch (loggerError) {
      console.error(where, error, "and the fault logger failed:", loggerError);
    }
  }
}

// ---------------------------------------------------------------- Store
// Why a class: the lab has exactly one state tree and one rule about it: only the executor replaces it. An instance
// lets the executor, the frame loop and the readers share the tree without a global variable, and counts the
// replacements so a test can assert one write per command.
class Store {
  constructor({ state }) {
    this.state = state;
    this.writeCount = 0;
  }
  read() { return this.state; }
  replace(state) {
    this.state = state;
    this.writeCount += 1;
  }
}

// ---------------------------------------------------------------- CommandExecutor
// Why a class: it binds the bus, the store, the handler registry and the frame loop into the one path every change
// takes, and numbers the notice batches it emits. It is the store's only writer and the one try/catch around
// handlers: a throw leaves the store as it was, becomes one fault and the v9 toast.
class CommandExecutor {
  /** @param {{ bus: Bus, store: Store, handlers: Registry, frames: FrameLoop, now?: () => number }} parts */
  constructor({ bus, store, handlers, frames, now }) {
    this.bus = bus;
    this.store = store;
    this.handlers = handlers;
    this.frames = frames;
    this.now = now || (() => bus.now());
    this.batchCount = 0;
  }
  /** @param {LabCommand} command @returns {LabResult} ok(ExecutedCommand) */
  execute(command) {
    const handler = this.findHandler(command);
    if (!handler) { return this.rejectUnknown(command); }
    let outcome;
    try {
      outcome = handler({ state: this.store.read(), command });
    } catch (error) {
      return this.reportHandlerFailure({ command, error });
    }
    if (!isHandlerOutcome(outcome)) {
      return this.reportHandlerFailure({ command, error: createCoreError({ code: CoreErrorCode.BadOutcome, message: `the ${command.type} handler returned ${JSON.stringify(outcome)}, not {state, notices, faults}` }) });
    }
    this.store.replace(outcome.state);
    // marked before the notices go out: a command a notice listener runs is marked (and listed in causes) after this one
    this.frames.mark({ cause: command.type, notices: outcome.notices, faults: outcome.faults });
    this.deliverOutcome({ command, outcome });
    const rendered = this.renderNowIfAsked(command);
    return Result.ok({ ...outcome, rendered });
  }
  findHandler(command) {
    if (!isCommand(command) || !this.handlers.has(command.type)) { return null; }
    return this.handlers.get(command.type);
  }
  renderNowIfAsked(command) {
    if (!CORE_CONFIG.renderAtOnce.includes(command.type)) { return false; }
    return this.frames.flush();
  }
  deliverOutcome({ command, outcome }) {
    this.batchCount += 1;
    const batch = `${command.type}#${this.batchCount}`, at = this.now();
    for (const notice of outcome.notices) { this.bus.emit(createNoticeEnvelope({ ...notice, batch, at })); }
    for (const fault of outcome.faults) { this.bus.emit(createFaultEnvelope({ fault, at })); }
  }
  rejectUnknown(command) {
    const message = this.describeRejection(command);
    const fault = createFault({ code: FaultCode.UnknownCommand, severity: FaultSeverity.Error, text: message, handling: FaultHandling.Logged, where: "executor" });
    this.bus.emit(createFaultEnvelope({ fault, at: this.now() }));
    return Result.err({ code: FaultCode.UnknownCommand, message });
  }
  describeRejection(command) {
    const registered = this.handlers.listKeys().join(", ");
    if (!hasTypeField(command)) { return `not a command (an object with a type): ${describeValue(command)} (registered: ${registered})`; }
    if (!isPlainData(command)) { return `the ${command.type} command carries a function or a cycle; commands are plain data`; }
    return `no handler for command ${command.type} (registered: ${registered})`;
  }
  reportHandlerFailure({ command, error }) {
    const message = `${command.type} failed: ${describeThrown(error)}`;
    const fault = createFault({ code: FaultCode.HandlerFailed, severity: FaultSeverity.Error, text: message, handling: FaultHandling.ToastKeptState, where: `command ${command.type}`, cause: error });
    this.bus.emit(createFaultEnvelope({ fault, at: this.now() }));
    this.bus.emit(createNoticeEnvelope({ text: CORE_CONFIG.failedChangeText, style: NoticeStyle.Plain, at: this.now() }));
    return Result.err({ code: FaultCode.HandlerFailed, message });
  }
}

// ---------------------------------------------------------------- FrameLoop
// Why a class: coalescing is state. The loop holds whether a frame is scheduled (and its id, to cancel it), and what
// the marks since the last frame brought: their causes, and the notices and faults of the commands among them. Any
// number of marks give one "state.changed", which carries only what produced it; the context is built for the
// visible tab only. requestFrame / cancelFrame are injected (requestAnimationFrame in the page, a manual queue in
// node tests).
class FrameLoop {
  /**
   * @param {{ bus: Bus, store: Store, buildContext?: { [tab: string]: (state: any) => any }, requestFrame: (run: () => void) => any,
   *   cancelFrame: (id: any) => void, readVisibleTab?: (state: any) => string, now?: () => number }} parts
   */
  constructor({ bus, store, buildContext, requestFrame, cancelFrame, readVisibleTab, now }) {
    this.bus = bus;
    this.store = store;
    this.buildContext = buildContext || {};   // {[tab]: state -> context}; a tab without a builder gets null
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.readVisibleTab = readVisibleTab || (state => state && state.tab);
    this.now = now || (() => bus.now());
    this.frameId = null;
    this.isScheduled = false;
    this.pending = { causes: [], notices: [], faults: [] };
  }
  /** @param {FrameRequest} [change] */
  mark(change) {
    const { cause, notices, faults } = change || {};
    this.pending.causes.push(cause || FrameCause.Ui);
    this.pending.notices.push(...(notices || []));
    this.pending.faults.push(...(faults || []));
    if (this.isScheduled) { return; }
    this.isScheduled = true;
    this.frameId = this.requestFrame(() => this.runFrame());
  }
  /** runs the scheduled frame now; true when its state.changed was delivered before flush() returned */
  flush() {
    if (!this.isScheduled) { return false; }
    this.cancelFrame(this.frameId);
    return this.runFrame();
  }
  // false when the bus was delivering: the state.changed then waits in the bus queue
  runFrame() {
    this.isScheduled = false;
    this.frameId = null;
    const { causes, notices, faults } = this.pending;
    this.pending = { causes: [], notices: [], faults: [] };
    const state = this.store.read(), built = this.buildVisibleContext(state);
    const frameFaults = built.ok ? faults : faults.concat([built.error.fault]);
    const context = built.ok ? built.value : null;
    const isQueued = this.bus.isDispatching;
    this.bus.emit({ type: EnvelopeType.StateChanged, at: this.now(), state, context, notices, faults: frameFaults, causes });
    return !isQueued;
  }
  buildVisibleContext(state) {
    const tab = this.readVisibleTab(state), builder = this.buildContext[tab];
    if (typeof builder !== "function") { return Result.ok(null); }
    try {
      return Result.ok(builder(state));
    } catch (error) {
      const text = describeThrown(error);
      const fault = createFault({ code: FaultCode.ContextFailed, severity: FaultSeverity.Error, text, handling: FaultHandling.ContextMissing, where: `context for the ${tab} tab`, cause: error });
      this.bus.emit(createFaultEnvelope({ fault, at: this.now() }));
      return Result.err({ code: FaultCode.ContextFailed, message: text, fault });
    }
  }
}
