# pixdiff: the byte-identical regression harness

`pixdiff.js` proves that a refactor left the RAM/KORU lab page behaving exactly like a reference page. It drives
**two built pages** (A = reference, B = candidate) through the same scenarios **through the DOM only** (clicks,
typing with change/input events, keys, real mouse moves and drags, reload, viewport resize, address hash changes)
and compares every checkpoint on four channels. It never calls a page global (`S9`, `renderAll`, `STATE`,
`cmpDo`, ... may be renamed in B); it reads the page only through standard DOM / browser APIs.

## Run

```sh
cd scratch/reg
node pixdiff.js                                   # A = ref_v9.html, B = dist/ram_koru_lab_v10.html, all scenarios x 4 combos
node pixdiff.js --a ref_v9.html --b v10_baseline.html   # the harness self-check: must be 0 differences
node pixdiff.js --fast                            # 1200-light only
node pixdiff.js --only '^dock-' --combos 1440-dark,1200-light
node pixdiff.js --list                            # the scenarios
```

Options: `--a FILE`, `--b FILE`, `--only REGEX` (scenario ids), `--combos LIST` (`1200-light,1200-dark,1440-light,1440-dark`),
`--fast` (= `--combos 1200-light`), `--list`, `--jobs N` (parallel scenario x combo jobs, default 6; each worker has
its own Chromium, each job runs A and B side by side in two contexts), `--out DIR` (default `scratch/reg/out`; use
your own when several runs may overlap), `--verbose` (idle timeouts and similar notes).
`PIXDIFF_FLAGS="..."` overrides the Chromium flags and `PIXDIFF_PROFILE=1` (with `--verbose`) prints where each page
spent its time (experiments only).

Exit code: 0 = identical everywhere, 1 = at least one difference or a scenario that could not run, 2 = usage error.
Output: a summary table on stdout (one row per scenario x combo: checkpoints, differing pixels (checkpoints),
DOM, state keys, console messages, run failure), the first differences in full, and `out/report.json` listing
**every** difference. For every checkpoint whose pixels differ, `out/` gets `<scenario>__<combo>__<nn>_<label>__a.png`,
`__b.png` and `__diff.png` (differing pixels red over a faded A). The `.png` / `.json` files in `out/` are deleted at
the start of each run.

Runtime on this 4-core container: the full run (52 scenarios x 4 combos = 208 jobs, 984 checkpoints) takes about
9–9.5 minutes with the default 6 jobs when nothing else is running (measured 8.3–9.6 min over five runs); `--fast` about 2 minutes. It is CPU-bound
(software raster): another heavy process on the machine stretches it.

Requirements: node 22, Playwright from `/opt/node22/lib/node_modules/playwright` with its preinstalled Chromium,
the fonts in `scratch/ui/fonts` (Google Fonts requests are routed there, as in `lib_v9.js`). No npm installs.

## Channels (compared at every checkpoint, `d.snap(label)`)

| Channel | What is compared |
|---|---|
| **pixels** | The full page, as viewport screenshots tiled down the page (see *Determinism*), byte for byte. When bytes differ both are decoded (`png.js`, a small PNG codec on node's zlib) and the differing pixels are counted; the a/b/diff PNGs are written. A checkpoint taken while the mouse is in use (hover, mid-drag) is one viewport screenshot instead, so the page is not scrolled under the pointer. Each toast shown since the previous checkpoint adds the viewport screenshot taken once its step settled, toast up (see *Toasts*). |
| **dom** | `document.body.innerHTML` of a clone with the `<script>` elements removed. The first differing offset is reported with 160 characters of context from each page. |
| **state** | `document.title`; `location.hash`; the `#vcode` value; the visible toast text (or none); the visible `#tip` and `#pop` text; the active element (id, or a path of tag + data attributes + position); scroll position, viewport and document size; every `localStorage` entry; the value / checked state of every input, select and textarea; every text the page wrote to the clipboard (`navigator.clipboard.writeText` is recorded by an init script and resolves at once; the real write still runs, but its outcome is not passed on, because parallel pages share one system clipboard); the texts of the toasts seen after each step since the previous checkpoint (`toastsSinceLastCheckpoint`). |
| **console** | Every `console.error` / `console.warn` and every uncaught page error on either page. Any one is a failure, even if both pages log it. |
| **run** | A scenario step that cannot be performed (missing element, timeout) on either page, or a different number of checkpoints. |

## Scenarios

`scenarios.js`, 52 scenarios (`node pixdiff.js --list`), each a list of DOM steps with checkpoints:
load and scroll; the Positions dock (structure, basis, legs, fill segs for A and B; unlink and link each aspect;
detach; relink all; wings on/off and values; real mouse drags of the put & call, straddle-center, wing and B-own
sliders with a checkpoint mid-drag while the button is held and one after release; the ✎ spot/IV override popover
with spot and IV-shift inputs and reset; instrument and expiry selects; the expiry-map popover; hide/show;
"Legs in detail"; pair sizing select through every rule and the custom h input, valid and invalid); the fixed summary
(move unit σ/%/price; range inputs valid and invalid; symmetric checkbox; reading units; odds seg; HV30 slider drag;
pills: open in the dock, relink one, swap, relink all; a toast with an action button, clicked); the views (overview
open/close, charts/table, set from a table cell; grid values, alignment, numbers view, its tabs and selects, Copy CSV;
grid display menu: lines, contours, overlays, colour, fixed range and its input; shocks: slider drags, checkbox, clear;
payoff strips and worst-loss range select and inputs; pins added by clicking the grid, removed, cleared; joint-moves
day slider and the one-instrument state; sweep seg; smile quote popover and "Use as"; every recovery-dynamics
control); hover tooltips on every chart (mouse at a fixed point; `#tip` in the screenshot); ⓘ tips by hover and
by keyboard focus; `#pop` popovers and Escape; the ⋯ page menu (theme auto/light/dark; view code Copy; load a valid
and an invalid code; reset this tab; reset both; Export: open, Sections checkbox, Copy, Download); the tab strip by
click and ArrowLeft/ArrowRight with per-tab scroll; the address (`page#<code>` taken from a run, a Compounding-tab
code, `page#garbage`, hashchange to a code and to garbage while open); persistence (three changes, reload); a
viewport resize 1200 ↔ 1440; the Compounding tab (default render, strategy, sliders, modus operandi, ticker,
"B differs", path, swap, stack/reading/table/path menus, dock hide/show, chart hover and pin, Stress view with
shapes, size, week slider drag, worst, rules, Random years run to completion and a new seed, reset); and a
**long session** of 25 seeded random DOM actions over the control families (same seed, and the same choice among
the visible enabled candidates in document order, on both pages).

The view codes used by the address and "load a code" scenarios are taken from a short run of page A before the
scenarios start (`prepare` in `scenarios.js`) and fed to both pages.

## Determinism

Each of these was needed: without it the harness reported differences between the two identical pages (or between
two loads of the same page).

- **Software raster on one thread** (`CHROME_FLAGS`: `--disable-gpu --disable-gpu-compositing
  --num-raster-threads=1 ...`). With GPU / threaded raster, anti-aliased edges of the composited sticky summary and
  fixed dock came out 1 LSB apart between runs under load.
- **No `fullPage` screenshots**: Chromium's beyond-viewport capture rasters off-screen canvases (the grid, the joint
  map) nondeterministically (2-4 distinct images in 10 loads of the same page). The page is instead scrolled in
  steps of (viewport − 200 px), one viewport screenshot per stop (CDP `Page.captureScreenshot`), and the scroll
  restored; viewport screenshots were identical in every trial. The diff PNGs show the tiles stacked (they overlap).
- **Fonts before the first layout**: the Google Fonts requests are routed to `scratch/ui/fonts` (as in `lib_v9.js`),
  and the init script also installs every face of `plex.css` as a `FontFace` built from the file's bytes, which
  Chromium loads synchronously. Through the routes alone the fonts arrive after the first layout, and a `<select>`
  laid out with the fallback font kept its text 1 px low after the swap (at random, on the Compounding tab opened
  from the address). After every load all faces are loaded and `document.fonts.ready` is awaited.
- Fixed viewport (1200 or 1440 × 900) and `colorScheme` per combo, `reducedMotion: reduce` (the page's transitions
  are off under it), locale en-US, timezone UTC, device scale 1, caret hidden by a style in `<head>`.
- A fixed clock: `new Date()` / `Date.now()` return 2 Oct 2026 15:00 UTC (init script); timers run normally.
- A fresh browser context per page per scenario (empty `localStorage`); clipboard permissions granted.
- **Idle wait** after every step: fonts ready, two animation frames, then quiet for 150 ms (300 ms on the
  Compounding tab) and at least 50 ms (450 ms there) in all. Quiet means: no DOM mutation, no scroll, **no pending
  short timer** (the init script tracks `setTimeout` calls of ≤ 1 s: render debounces, the 400 ms save, resize
  handlers, the chunked sweep / Random-years jobs) and no "computing…" / "running…" text on the Compounding tab.
  Without the timer tracking a mid-drag checkpoint on the Compounding tab caught the URL hash before or after its
  140 ms debounced render depending on load.
- **Typed values are committed with Enter** (one native `change`). A synthetic `change` event was followed by a
  native one when focus left the field, which re-rendered the dock in the middle of the next click (the click was
  lost at random).
- **The pointer is parked at (0, 0)** (over the sticky tab strip) right after every step and before every
  checkpoint, unless the scenario is about hover or a drag in progress. A click that closes a menu or re-renders
  leaves new content under a resting pointer, and Chromium's delayed synthetic mouse move then hovered it (the
  Compounding chart drew its crosshair) or not, depending on when the harness next moved the pointer. Harness
  pointer moves jump in one step (no intermediate points over other content).
- **Toasts**: a toast hides itself 2–4 s after it shows, so whether it is still up when the page has settled
  depends on how long the step took (a Compounding reset took over 4 s to settle on one page and not on the other;
  checking "two frames after the step" failed too, as the frames themselves were blocked by the render). So the init
  script holds every toast the moment it shows: a mutation observer logs its text and dispatches a `pointerenter` on
  `#toast`, whose own page handler clears the hide timer, as when the pointer rests on it. After the step settles the
  held toast is screenshotted (viewport) and dismissed with the real pointer (onto it and away: the page hides it
  2 s later, the harness waits for that). The texts of all toasts shown and the toast screenshots join the next
  checkpoint, so every step starts toast-free. `{ keepToast: true }` on a step leaves its toast up for a following
  click on its button.
- **The pointer is parked at (0, 0)** (over the sticky tab strip) right after every step and before every
  checkpoint, unless the scenario is about hover or a drag in progress. A click that closes a menu or re-renders
  leaves new content under a resting pointer, and Chromium's delayed synthetic mouse move then hovered it (the
  Compounding chart drew its crosshair) or not, depending on when the harness next moved the pointer. Harness
  pointer moves jump in one step (no intermediate points over other content).
- **Toasts**: a toast hides itself 2–4 s after it shows, so whether it is still up when the page has settled
  depends on how long the step took (a Compounding reset took over 4 s on one page and not on the other). So two
  frames after every step (a fixed point) a visible toast is recorded and the pointer is put on it, which stops its
  hide timer; after the idle wait the held toast is screenshotted (viewport) and dismissed (pointer away, the page
  hides it 2 s later, the harness waits for that). The texts and screenshots join the next checkpoint. Every step
  therefore starts toast-free; `{ keepToast: true }` on a step leaves its toast up for a following click.
- Elements near the viewport edges are first scrolled to the middle (`scrollIntoView({block: 'center'})`) so the
  sticky summary and the toast never cover the target (a pointer resting on the toast also stops its hide timer);
  both pages get the same scrolls.

## Writing a scenario

```js
add('my-id', 'family', 'what it covers', async (d, data) => {
  await d.click('#d9t [data-act="set"][data-side="A"][data-path="fill"][data-v="nat"]');
  await d.snap('nat');                         // a checkpoint: all channels
  await d.drag('#c-ivs', 0.75, { midSnap: 'held' });   // real drag; checkpoint while the button is held
  await d.fill('#s9-rhi', '3');                 // click, select all, type, Enter (commit: 'change' | 'tab' | 'none')
  await d.hover('#pay svg', 0.4, 0.3); await d.snap('tip', { hover: true });
}, { quiet: 300, minWait: 450, hash: 'v9....' });
```

Driver actions: `click`, `clickText`, `dblclick`, `select`, `check`, `fill`, `press`, `focus`, `open` / `close`
(a `<details>` by its summary), `hover`, `mouseClickAt`, `drag`, `wheel`, `scrollTo`, `reload`, `resize`,
`setHash`, `wait`, `waitText`, `download`, `randomPick`; reads: `value`, `text`, `exists`, `visible`.

## Known limits

- The pixels channel is exact byte equality (PNG bytes, then decoded pixels) under the flags above, on this
  machine's Chromium (headless shell 1194, Playwright 1.56). A different Chromium build or GPU raster gives different (but self-consistent) images:
  always run A and B in the same harness run, never compare against stored images.
- Canvas content (the grid heatmaps, the joint map) enters only through the screenshots; the DOM channel sees the
  `<canvas>` elements, not their pixels.
- Hover and mid-drag checkpoints are a single viewport screenshot (the page cannot be scrolled under the pointer).
- Tiles overlap by 200 px and the sticky header and fixed dock repeat in every tile: a difference there is
  counted once per tile.
- Each toast costs about 2 s of waiting (most of the run time of the dock scenarios). The toast's own auto-hide
  (3.8 / 4 s after it shows) is never exercised, since the harness holds every toast; only the 2 s hide after the
  pointer leaves is. The hold relies on the page's `pointerenter` handler on `#toast` clearing the timer: if a
  refactor dropped that handler, toasts would vanish at random and the harness would report it as differences.
- The Compounding "Reading" menu opens off-screen to the left at these widths, so its "Average" button is clicked
  with a DOM click event (`{ dispatch: true }`) instead of the mouse.
- The download scenario checks only that no page error occurs and compares the resulting toast; the file is discarded.
- Each scenario starts from an empty `localStorage`; old v8/v5 blobs and codes are not exercised.
- Real time is fixed only through `Date`; `performance.now()` (used by the Compounding tab's chunked jobs) runs, so
  the harness waits for those jobs to finish rather than catching them mid-way (no checkpoint shows "running… 40%").
- The idle wait treats every pending `setTimeout` of ≤ 1 s as work in progress; a page that re-armed such a timer
  forever would hit the 15 s idle cap on every step (reported with `--verbose`). The current pages do not.
- Fonts are installed by the harness before the page's own stylesheet arrives, so a change to the page's font
  link (another family or weight) shows only through the faces of `scratch/ui/fonts/plex.css`.
- The random long session picks among elements visible at each step; when B diverges from A the two sessions can
  pick different elements after the divergence (the divergence itself is reported at the next checkpoint).
