/**
 * The page's composition root, loaded last. It reads the boot view, builds the event loop (bus, store, executor,
 * frame loop), wires both tabs, the tab strip and the page menu (theme, view codes, resets), and subscribes the two
 * consumers of every frame: one ordered render (theme and tabs, then summary → dock → title → views: the dock must
 * render before the charts measure their width) and the persistence that writes the stored blob and the address.
 * The Compounding tab lives in COMPOUND (init({port}), render(mode), getState, setState, reset) and stays off the bus: it
 * renders on its own schedule, calls port.saveView when its state settles, and reads and writes the period vol through
 * port.periodVol (its writes are commands; their frames on that tab persist without a render).

 * The store holds the one state tree (comparison, assumptions, prefs, periodVol) plus the visible tab; the page writes
 * it, with the Compounding tab's state, as a "#v10." code and the "rk-lab-v10" blob, and reads older views once.
 */

const PAGE_CONFIG = Object.freeze({
  resizeDebounceMs: 120, colorSchemeQuery: "(prefers-color-scheme: dark)",
  // the console method each fault severity prints with. v9 printed nothing for what are now warnings (a refused
  // storage, a malformed command), so they stay below the error and warning levels a console filter shows by default
  consoleBySeverity: Object.freeze({ [FaultSeverity.Error]: "error", [FaultSeverity.Warning]: "info" }),
  // commands that change only what is saved, not what either tab shows: their frames persist without a render (v9
  // saved the export section choice without redrawing)
  saveOnlyCauses: /** @type {readonly string[]} */ (Object.freeze([Command.SetExportSection])),
  // commands a tab runs through its port while it renders itself on its own schedule: their frames on that tab
  // persist without a render (the Compounding tab's vol slider stays one debounced render per drag, as before)
  selfRenderedCauses: Object.freeze({ [Tab.Compounding]: /** @type {readonly string[]} */ (Object.freeze([Command.SetPeriodVol])) })
});

// what only the page keeps: the event loop once main() built it, each tab's scroll position, the shell's own title,
// the last code and blob written (an unchanged one is not written again), and whether a storage fault was reported
// (once per session: a private window would refuse every frame)
const page = {
  bus: null, store: null, executor: null, frames: null,
  scroll: { [Tab.Compare]: 0, [Tab.Compounding]: 0 }, title: document.title, saved: { code: "", blob: "" },
  hasReportedStorageFault: false
};

// ---------------------------------------------------------------- guarded steps and faults
// v9's console line where a page step failed, then one fault for the bus readers (logFault does not print it again)
function reportCaught({ where, error }) {
  console.error(where, error);
  if (!page.bus) { return; }
  const fault = createFault({ code: FaultCode.GuardedStepFailed, text: describeThrown(error), handling: FaultHandling.LoggedWhereCaught, where, cause: error });
  page.bus.emit(createFaultEnvelope({ fault }));
}
/** @param {{ where: string, run: () => void }} step @returns {LabResult} ok when the step ran to its end */
function runGuarded({ where, run }) {
  try {
    run();
    return Result.ok(null);
  } catch (error) {
    reportCaught({ where, error });
    return Result.err({ code: FaultCode.GuardedStepFailed, message: `${where}: ${describeThrown(error)}` });
  }
}
function readYrState() {
  try {
    return COMPOUND.getState();
  } catch (error) {
    reportCaught({ where: "COMPOUND.getState", error });
    return null;
  }
}
/** @param {{ error: LabError, handling: string }} report */
function reportStorageFault({ error, handling }) {
  if (page.hasReportedStorageFault) { return; }
  page.hasReportedStorageFault = true;
  const fault = createFault({ code: FaultCode.StorageFailed, severity: FaultSeverity.Warning, text: `${error.code}: ${error.message}`, handling, where: "storage" });
  page.bus.emit(createFaultEnvelope({ fault }));
}
// every fault once on the console at its severity's level, with the caught error (its stack) when there is one
function logFault(envelope) {
  const fault = envelope.fault;
  if (fault.handling === FaultHandling.LoggedWhereCaught) { return; }
  const line = `${fault.code}: ${fault.text} (${fault.handling})`;
  const print = console[PAGE_CONFIG.consoleBySeverity[fault.severity] || "error"];
  if (fault.cause === undefined) {
    print(fault.where, line);
    return;
  }
  print(fault.where, line, fault.cause);
}

// ---------------------------------------------------------------- persistence: one blob for both tabs, the address
// localStorage "rk-lab-v10" holds the blob; the address carries the same view as a #v10. code (the older keys and
// codes are only read). The persistence subscriber saves the frame's state; a save without a frame (the Compounding
// tab's port) saves the store's current state.
/** @param {{ state?: any }} [options] */
function saveView({ state } = {}) {
  const viewState = state || page.store.read(), yr = readYrState();
  writeStoredBlob(JSON.stringify(STATE.writeStoredView({ state: viewState, yr })));
  writeAddressCode(STATE.writeViewCode({ state: viewState, yr }));
}
function writeStoredBlob(blob) {
  if (blob === page.saved.blob) { return; }
  page.saved.blob = blob;
  const written = storage.write({ key: STORAGE_KEY.V10, text: blob });
  if (!written.ok) { reportStorageFault({ error: written.error, handling: FaultHandling.ViewNotStored }); }
}
function writeAddressCode(code) {
  if (code === page.saved.code) { return; }
  page.saved.code = code;
  const field = /** @type {HTMLInputElement} */ ($("#vcode"));
  if (field) { field.value = code; }
  try { history.replaceState(null, "", "#" + code); } catch (e) { }
}
// v9 did not save when the Compare context failed to build
function persistFrame(frame) {
  const isCompareWithoutContext = frame.state.tab === Tab.Compare && !frame.context;
  if (isCompareWithoutContext) { return; }
  saveView({ state: frame.state });
}

// ---------------------------------------------------------------- the ordered render of one frame
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === Theme.Auto) {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", theme);
}
function syncTabs(tab) {
  document.body.dataset.tab = tab;
  $("#tab-cmp").hidden = tab !== Tab.Compare;
  $("#tab-yr").hidden = tab !== Tab.Compounding;
  document.querySelectorAll("#tabs [data-tab]").forEach(node => {
    const button = /** @type {HTMLElement} */ (node), isOn = button.dataset.tab === tab;
    button.classList.toggle("on", isOn);
    button.setAttribute("aria-selected", String(isOn));
    button.tabIndex = isOn ? 0 : -1;
  });
}
// summary → dock → title → views. DOCK9.render sets body.dock-off, which changes the main column's width before the
// charts measure it. The title names A vs B once the summary rendered (v9's summary set it at its end, so a summary
// that threw kept the previous name) and before the views, so a views failure does not keep the previous name
function renderCompare(context) {
  const summary = runGuarded({ where: "summary", run: () => SUM9.render(context) });
  runGuarded({ where: "dock", run: () => DOCK9.render(context) });
  runGuarded({ where: "facts", run: () => FACTS.render(context) });
  const hasTitle = summary.ok && context.labels && context.labels.title;
  if (hasTitle) { document.title = context.labels.title; }
  VIEWS.render(context);
}
function renderCompounding() {
  runGuarded({ where: "COMPOUND.render", run: () => COMPOUND.render("full") });
  document.title = "Compounding · " + page.title;
}
// the visible tab only: a hidden tab is display:none and renders when it is shown. body.dock-off follows the state on
// either tab (the Compare dock keeps its width while the Compounding tab shows). A Compare frame without a context
// (its builder failed: one context_failed fault) still switches the tab and the theme; the panels keep their last
// render, as v9's did
function renderActiveTab(frame) {
  const isSaveOnly = frame.causes.length > 0 && frame.causes.every(cause => PAGE_CONFIG.saveOnlyCauses.includes(cause));
  if (isSaveOnly) { return; }
  const state = frame.state;
  const selfRendered = PAGE_CONFIG.selfRenderedCauses[state.tab] || [];
  const isRenderedByTab = frame.causes.length > 0 && frame.causes.every(cause => selfRendered.includes(cause));
  if (isRenderedByTab) { return; }
  applyTheme(state.prefs.theme);
  syncTabs(state.tab);
  document.body.classList.toggle("dock-off", !state.prefs.dock);
  if (state.tab === Tab.Compounding) {
    renderCompounding();
    return;
  }
  if (!frame.context) { return; }
  renderCompare(frame.context);
}

// ---------------------------------------------------------------- boot, tabs, view codes
// first load: a code in the address wins over the stored blob (v10, else the v9 blob, else the v8 blob or the v5 store,
// see BOOT). -> {state: the tree with the theme applied, plus the visible tab; yr, notices, faults, isBadHash}
function readBootState() {
  let tree = null, tab = Tab.Compare, theme = Theme.Auto, yr = null, notices = [];
  const faults = [];
  const stored = BOOT.blob || BOOT.legacy, fromStore = stored ? STATE.readStoredView(stored) : null;
  if (fromStore && !fromStore.ok) {
    console.warn("stored view did not load", fromStore.error.cause);
    faults.push(createFault({ code: FaultCode.StoredViewFailed, severity: FaultSeverity.Warning, text: fromStore.error.message, handling: FaultHandling.LoggedWhereCaught, where: "boot", cause: fromStore.error.cause }));
  }
  if (fromStore && fromStore.ok) {
    ({ state: tree, tab, theme, yr, notices } = fromStore.value);
  }
  const fromHash = STATE.readViewCode(BOOT.hash), isBadHash = !fromHash.ok && fromHash.error.code === ViewCodeError.Undecodable;
  if (fromHash.ok) {
    const h = fromHash.value;
    tree = h.state;
    notices = h.notices;
    tab = h.tab;
    if (h.theme !== undefined) { theme = h.theme; }
    if (h.yr !== undefined) { yr = h.yr; }
  }
  if (!TABS.includes(tab)) { tab = Tab.Compare; }
  if (!THEMES.includes(theme)) { theme = Theme.Auto; }
  const withTheme = STATE.applyChange(tree || STATE.defaults(), s => { s.prefs.theme = theme; });
  return { state: Object.assign(withTheme, { tab }), yr, notices, faults, isBadHash };
}
// switching keeps each tab's own scroll position. ShowTab renders before execute() returns when it runs from a DOM
// event; run from inside a bus listener it renders after the current delivery, and the scroll waits for that frame
function showTab(tab) {
  const current = page.store.read().tab;
  const isSwitch = TABS.includes(tab) && tab !== current;
  if (!isSwitch) { return; }
  page.scroll[current] = scrollY;
  const shown = page.executor.execute({ type: Command.ShowTab, tab, source: "tabs" });
  if (!shown.ok) { return; }
  const restoreScroll = () => window.scrollTo(0, page.scroll[tab] || 0);
  if (shown.value.rendered) {
    restoreScroll();
    return;
  }
  const unsubscribe = page.bus.subscribe(EnvelopeType.StateChanged, () => {
    unsubscribe();
    restoreScroll();
  });
}
function findNextTab({ tab, forward }) {
  const index = TABS.indexOf(tab), offset = forward ? 1 : TABS.length - 1;
  return TABS[(index + offset) % TABS.length];
}
// a view read from a code: the Compounding tab takes its part, the store the rest (toast: "View loaded" + migration
// notes); a tab switch starts the new tab at the top
function loadView(view) {
  if (view.yr != null) { runGuarded({ where: "COMPOUND.setState", run: () => COMPOUND.setState(view.yr) }); }
  const current = page.store.read().tab;
  if (view.tab !== current) {
    page.scroll[current] = scrollY;
    page.scroll[view.tab] = 0;
  }
  page.executor.execute({ type: Command.LoadView, view: view.state, tab: view.tab, theme: view.theme, notices: view.notices, source: "view code" });
}
// ⋯ → Load
function loadTypedCode({ menu, field }) {
  const read = STATE.readViewCode(field.value);
  if (!read.ok) {
    page.bus.emit(createNoticeEnvelope({ text: "That code didn't load. Copy it again from ‘View code’." }));
    return;
  }
  field.value = "";
  menu.open = false;
  loadView(read.value);
}
// a pasted or edited address: our own replaceState never fires hashchange, but compare with the last code anyway
function loadAddressCode() {
  const code = location.hash.slice(1);
  if (!code || code === page.saved.code) { return; }
  const read = STATE.readViewCode(location.hash);
  if (read.ok) {
    loadView(read.value);
    return;
  }
  if (read.error.code !== ViewCodeError.Undecodable) { return; }
  page.bus.emit(createNoticeEnvelope({ text: "The view code in the address didn't load; the current view is kept." }));
  page.saved.code = "";
  page.frames.mark({ cause: FrameCause.Ui });
}
function resetCompounding() {
  runGuarded({ where: "COMPOUND.reset", run: () => COMPOUND.reset() });
}

// ---------------------------------------------------------------- wiring
function buildEventLoop(state) {
  const bus = new Bus({ now: () => calendar.nowMs() }), store = new Store({ state });
  const frames = new FrameLoop({
    bus, store, buildContext: { [Tab.Compare]: s => CTX.ctx9(s) },
    requestFrame: run => requestAnimationFrame(run), cancelFrame: id => cancelAnimationFrame(id)
  });
  const registry = new Registry({ name: "command handlers" });
  const handlers = VIEWS.registerCommandHandlers(STATE.registerCommandHandlers(registry));
  const executor = new CommandExecutor({ bus, store, handlers, frames });
  Object.assign(page, { bus, store, frames, executor });
}
// the faults readBootState found before the bus existed: a refused storage read, a stored view that did not load
function reportBootFaults(boot) {
  if (BOOT.storageError) { reportStorageFault({ error: BOOT.storageError, handling: FaultHandling.StartedWithoutStore }); }
  for (const fault of boot.faults) { page.bus.emit(createFaultEnvelope({ fault })); }
}
// the Compare tab: summary, dock, then the views (they build their panels inside #views) and their notes
function wireCompare() {
  SUM9.init();
  DOCK9.init();
  FACTS.init();
  VIEWS.wire({ host: $("#views") });
  VIEWS.notes();
  EXPORT9.wire({ readState: () => page.store.read(), code: () => page.saved.code });
}
function wireTabStrip() {
  const tabs = $("#tabs");
  tabs.addEventListener("click", e => {
    const button = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest("[data-tab]"));
    if (button) { showTab(button.dataset.tab); }
  });
  tabs.addEventListener("keydown", e => {
    const isArrow = e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!isArrow) { return; }
    const next = findNextTab({ tab: page.store.read().tab, forward: e.key === "ArrowRight" });
    showTab(next);
    /** @type {HTMLElement} */ (tabs.querySelector(`[data-tab="${next}"]`)).focus();
    e.preventDefault();
  });
}
// ⋯ page menu: theme, view code, resets
function wirePageMenu() {
  const menu = /** @type {HTMLDetailsElement} */ ($("#pmenu")), field = /** @type {HTMLInputElement} */ ($("#vload"));
  seg({ el: "#c-theme", options: [[Theme.Auto, "Auto"], [Theme.Light, "Light"], [Theme.Dark, "Dark"]], read: state => state.prefs.theme, command: v => ({ type: Command.SetPref, patch: { theme: v } }), everyTab: true });
  $("#vcopy").addEventListener("click", () => copyText({ text: $("#vcode").value, fallbackField: $("#vcode") }));
  $("#vgo").addEventListener("click", () => loadTypedCode({ menu, field }));
  $("#vreset").addEventListener("click", () => {
    const resetTarget = page.store.read().tab === Tab.Compare ? ResetTarget.Compare : ResetTarget.Compounding;
    if (resetTarget === ResetTarget.Compounding) { resetCompounding(); }
    page.executor.execute({ type: Command.Reset, resetTarget, source: "page menu" });
    menu.open = false;
  });
  $("#vresetAll").addEventListener("click", () => {
    resetCompounding();
    menu.open = false;
    page.executor.execute({ type: Command.Reset, resetTarget: ResetTarget.Both, source: "page menu" });
  });
}
// listeners that apply to whichever tab is showing
function wireWindow() {
  addEventListener("hashchange", loadAddressCode);
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => page.frames.mark({ cause: FrameCause.Resize }), PAGE_CONFIG.resizeDebounceMs);
  });
  if (!window.matchMedia) { return; }
  matchMedia(PAGE_CONFIG.colorSchemeQuery).addEventListener?.("change", () => page.frames.mark({ cause: FrameCause.ColorScheme }));
}
// The Compounding tab's port. The tab stays off the bus: it saves through the page, toasts through the bus, and reads
// and writes the period vol, the one number per ticker Compare A vs B reads too. read(ticker) goes through the same
// reader as the comparer (CTX.readTickerVol) as reader Compounding, whose floor is 0: the tab's 0 means "exactly on the
// path", where the comparer reads its 1% floor. write({ticker, pct, source?, expiry?}) runs SetPeriodVol through the
// executor (source Set unless the tab names a preset; ATM carries the expiry it was read at; reader Compounding) and
// returns its Result; a value it clamps comes back
// as a toast. refs(ticker) is the reference list the comparer's period-vol box shows (CTX.listPeriodVolRefs: the listed
// vol, ATM at A's horizon, the data's realized vols), so the two tabs cannot list different references
function createCompoundingPort() {
  const read = ticker => CTX.readTickerVol({ periodVol: page.store.read().periodVol, id: ticker, reader: Tab.Compounding }).pct;
  /** @param {{ ticker: string, pct: number, source?: string, expiry?: string }} edit */
  const write = ({ ticker, pct, source, expiry }) => {
    const command = { type: Command.SetPeriodVol, ticker, source: source || VolSource.Set, pct, reader: Tab.Compounding };
    if (expiry) { Object.assign(command, { expiry }); }
    return page.executor.execute(command);
  };
  const refs = ticker => CTX.listPeriodVolRefs({ id: ticker, comparison: page.store.read().comparison });
  return { saveView, showNotice: text => page.bus.emit(createNoticeEnvelope({ text })), periodVol: { read, write, refs } };
}
// the Compounding tab: off the bus, it reaches the page through its port
function startCompounding(yr) {
  const host = $("#tab-yr");
  if (!host.children.length) { host.innerHTML = `<p class="yrnone">The Compounding tab is not part of this build.</p>`; }
  const port = createCompoundingPort();
  try {
    COMPOUND.init({ port });

    if (yr != null) { COMPOUND.setState(yr); }
  } catch (error) {
    reportCaught({ where: "COMPOUND.init", error });
  }
}
function showBootNotices(boot) {
  if (boot.isBadHash) {
    page.bus.emit(createNoticeEnvelope({ text: "The view code in the address didn't load; the last saved view is shown." }));
    return;
  }
  for (const notice of boot.notices) { page.bus.emit(createNoticeEnvelope({ ...notice, batch: "boot" })); }
}
function redrawWhenFontsLoad() {
  const fontsReady = document.fonts && document.fonts.ready;
  if (!fontsReady) { return; }
  fontsReady.then(() => page.frames.mark({ cause: FrameCause.Fonts }));
}

function main() {
  const boot = readBootState();
  buildEventLoop(boot.state);
  page.bus.subscribe(EnvelopeType.Fault, logFault);
  reportBootFaults(boot);
  wireCompare();
  wireTabStrip();
  wirePageMenu();
  wireWindow();
  // after the binders: their sync functions run before the render, as v9's sync lists did
  page.bus.subscribe(EnvelopeType.StateChanged, renderActiveTab);
  page.bus.subscribe(EnvelopeType.StateChanged, persistFrame);
  startCompounding(boot.yr);
  page.frames.mark({ cause: FrameCause.Boot });
  page.frames.flush();
  showBootNotices(boot);
  redrawWhenFontsLoad();
}
main();
