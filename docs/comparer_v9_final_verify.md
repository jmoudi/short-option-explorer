# Final verifier, round 2

**Verdict: not all clear.** One minor item is still open: OPEN-3 is fixed for its repro and for the round 1 sweep, but a smaller form of it remains. OPEN-1, OPEN-2 and the extra `placeTxt` fix are verified. Nothing blocking or important is open, and the regression sweep is clean.

## Build under test

| Check | Result |
|---|---|
| Build | `python3 build9.py` reports "checks: OK" and rewrites `/home/user/short-option-explorer/dist/ram_koru_lab_v9.html` (583,195 B) and `ram_koru_lab_v9_artifact.html` (583,057 B). Both are newer than every touched source. |
| Node tests | `node --test test/*.test.js`: 83/83 pass (73 earlier tests plus 10 in `t20_fixfinal2.test.js`). |
| Banned words | 0 hits in both built files and in `ui9_views.js`, `views9.css`, `cmp9.js` and the T20 test. `CORE_API.md` line 37 states the rule itself, which it did before this round too. |
| Browser | Chromium through Playwright, 1200 and 1440, light and dark |
| Console | 0 console or page errors in every run below, on both tabs |

- Screenshots are in `shots_final_r2/` (154 files). I looked at every one referenced here.
- Scripts and their output are in `scratch/vf2/`.

**Control build.** I rebuilt the pre-fix sources from `scratch/fixF2/bak/` to `scratch/vf2/old/oldlab.html` with `build9.py --out`. My own tick checker (`sweep3.js`) flags the old A − h·B panel in 22 of 60 states, which shows the checker can catch the bug.

## The three open items from round 1

| # | Item | Status | Evidence |
|---|---|---|---|
| OPEN-1 | A − h·B payoff panel had no tick on a lopsided side | **fixed** | **How I checked.** `dt2.js` and `sweep3.js` read the rendered SVG: the zero lines, panel edges and the axis label text and positions. They do not use the page's `LAST` values.<br>**Repro 1, bCall:** the panel has 32px above zero and 60px below, with labels "+40% 0% −50%". Same in all 4 viewports (`open1-bCall-*.png`). Round 1 had only "0% −50%".<br>**Repro 2, s9:** "+5% 0% −4%" (`open1-s9-*.png`). Round 1 had only "+5% 0%".<br>**Other cases:**<br>• s3: "+100% 0% −200%";<br>• default: "+30% +20% +10% 0% −8%";<br>• bDetach: "+20% +10% 0% −10%".<br>**Fallback band,** two cases found independently:<br>• RAM 19 Mar strangle 16/30 vs KORU 23/38: "−20%" sits 13.1px under zero on a 16.7px side;<br>• guts: "−10%" at 13.6px.<br>Both read cleanly (`open1-fb0-*.png`).<br>**`sweep3.js`,** 1,250 states (seeds 1357/4242/8642; 1200/1440; light/dark):<br>• 2,437 lopsided main-panel sides and 2,245 lopsided A − h·B sides, all with a tick: tick1 = 0, tick2 = 0;<br>• 0 sign errors, 0 scale inconsistencies, 0 duplicate labels;<br>• closest labels 12.0px apart, 0 under 10px;<br>• 0 cases where a main-panel label sits within 11px of an A − h·B label. |
| OPEN-2 | Recovery header printed "growth -0.00%", with ASCII hyphens | **fixed** | **Repro (`recz.js`):**<br>• A reads "… growth −1.41% a cycle (EV at HV30 odds on margin)";<br>• B reads "… growth 0.00% a cycle";<br>• with fill natural: "−7.96%" and "−8.20%".<br>Screenshot: `recz-growth-1200-light.png`.<br>**`negz3.js`,** seeds 99991 and 31337, 160 states each. It scans the whole Compare tab and the dock: text, titles and tips, with the overview shown as table and as charts.<br>• 0 signed zeros;<br>• 0 ASCII-hyphen negatives;<br>• 640 growth headers, all in the form `+x.xx%`, `−x.xx%` or `0.00%`. |
| OPEN-3 | Overview table scrolled sideways at 1200 with the dock open, cutting Breakevens | **mostly fixed, residual open (OPEN-3b below)** | **The round 1 repro** (`values {put 62, call 62}` + both wings):<br>• `#full` is 766px in a 766px scroller at 1200 and 1006/1006 at 1440, light and dark;<br>• Breakevens is stacked low over high, with no slash ("12.22⏎17.77");<br>• the cash figure is its own `display:block` line;<br>• rows stay 38px (`open3-ov-itm-*.png`).<br>**`vf1/ovsweep.js`** run unchanged, seed 777, 120 states: 0 overflows at 1200 and 0 at 1440 (round 1: 38, up to 68px).<br>**Wider sweep** (`ovprobe.js`, 640 states, which adds fill natural and two-wing states): 8 still overflow, by 2–19px. See OPEN-3b. |
| extra | Difference strip printed "B strikes 1.08 / -0.12σ" | **fixed** | **`pillneg.js`:**<br>• strip "B strikes 1.08 / −0.12σ";<br>• B line 3 "1.08 / −0.12σ → …";<br>• dock "1.08 / −0.12σ → 12P 1.13σ · 20C −0.07σ";<br>• a put of −0.0004σ prints as "0" in the strip and on line 3.<br>Screenshots: `pill-neg-*.png`. |

## Regression sweep

| Check | Result |
|---|---|
| Console errors, both tabs | 0. Covers:<br>• 64 Compare loads (16 states × 4 viewports);<br>• the 11-item script, including 40 Compounding controls clicked in each viewport;<br>• the Compounding Year and Stress views in 4 viewports;<br>• titles and `#notes`;<br>• every sweep and probe in this report;<br>• the full round 3 script set, re-run. |
| Summary height and stickiness | 121px at top 29 in all 64 state-viewports (`shots.js`). Also at 0/25/50/75/100% scroll with the dock collapsed to its rail, at 1200 and 1440, light and dark (`stick.js`, `nodock-mid-1200-light.png`). In 1,250 sweep states: 0 over budget. |
| Per-leg credit/debit for A and B | One "+$" or "−$" per leg plus "net credit $…" on both cards in every state. Examples:<br>• default: A "13P +$165 · 20C +$90 · net credit $255", B "18P +$245 · 30C +$148 · net credit $393";<br>• worst: "8P −$100 · 25P +$1,015 · 30C +$385 · 38C −$290 · net credit $1,010".<br>`a3.js` re-run, seeds 777/2026/99991, 250 states × 3 viewports each: 0 problems. |
| Difference strip | **Default:** "same position, only the instrument differs".<br>**Straddle vs strangle:** structure underlined on both cards plus "↺ all" (`strVsStd-*.png`).<br>**B wing only:** "! B: call wing at chain end 33C (23.3Δ)" plus "↺ all", with "+ 33C wing" underlined.<br>**B detached:** "B strikes 41.7 / 58.3Δ ↺" plus "↺ all" (`bDetach-*.png`).<br>**Override:** "same position, only the instrument differs" plus "B spot +10% (override)".<br>**Identical:** "A and B are the same trade".<br>**Worst:** 3 pills plus "+1 ▾" at 1200 and 4 pills at 1440 (`worst-1440-dark.png`). |
| Horizontal scroll at 1200 | The page never scrolls sideways, on either tab, in any state measured. Only the overview's own scroller does, in OPEN-3b. |
| Card symmetry (round 3 OPEN-1) | `sweep3.js`, 1,250 states: 0 differences between A and B in line 1 or line 2 stage classes, 0 in line 1 font size, 0 overflows, 0 wraps. `n3.js`, 200 states at 1200 and at 1440: 0 / 0 / 0. |
| Ratio cells and signed zeros (round 3 OPEN-2) | 9,966 ratio cells: none over a B value that prints as zero. `n10` R1 reads "0.000 0.417 0.00×". In R2 every A / B cell reads "–". |
| The 11 round 1 fix items | `items.js` output is byte-identical to round 1, which verified all 11 as fixed. |
| Round 3 scripts re-run | I re-ran `m1`–`m9`, `a1`–`a10` and `n1` against this build and diffed the output with round 3's. Every difference comes from an earlier fix:<br>• ×k on line 2;<br>• A/B-symmetric fit classes;<br>• the Legs in detail convention;<br>• the overview caption;<br>• "(3 cycles)";<br>• dock rows moved up 24px by the 18px wing rows;<br>• a toast left on screen by `a1`'s previous step.<br>`a2`: 0 splits, 0 collapses. `n1`: 600 dock actions, 0 problems. |
| Fonts | Line 1 is 21px (20 when fitted). Nothing else on the Compare tab or in the dock is above 15px. The Compounding tab's maximum is 20px (its headline values), which is unchanged. |

## OPEN

### OPEN-3b (minor): at 1200 with the dock open, the overview table still cuts off Breakevens in some states

**Repro (1200, light or dark, dock open):**
```
setA inst.id KORU; exp 20261120; structure strangle; basis delta; values {put 65.36, call 33.32};
wings.call.on true; wings.call.value 6.38; wings.put.on true; wings.put.value 18.04; fill nat
```
Then open "Overview of all 16 positions" as a Table.
- `#full` is 785px in a 766px scroller.
- The "Breakevens" header ends at x = 818 against the scroller's right edge at 799.
- The header reads "Breake", the values read "13." and "19.", and a scrollbar appears inside the panel.
- Screenshots: `open3-residual-1200-light.png`, and `open3-residual-scrolled-1200-light.png` scrolled to the end.
- At 1440 it fits (1006/1006). The page itself does not scroll sideways.

**How often:** 8 of 640 random states at 1200 (`ovprobe.js`, seeds 777/2468/1357/4242), by 2–19px. Round 1 found 38 of 120, up to 68px.
- The triggers are two-wing positions with natural fill. The wider cells are:
  - "Wing cost · pays odds", e.g. "13.5% · 10%", which makes the column 85px;
  - a "cash 100.5%" line under the time value;
  - long Position names, e.g. "strangle 31.75/32.5 +14.25P +55.5C".

**Fix:** two changes, measured together in the page (`ovvar.js`):

1. `ui9_views.js` `renderOvTable` (line 247): stack the wing cell the way the cash line already stacks. In the wing cell, replace
   `` `${o("wingc", b.wingPx / b.S)} · ${Number.isFinite(wp) ? fP(wp, 0) : "–"}` ``
   with
   `` `${o("wingc", b.wingPx / b.S)}<small class="cash">pays ${Number.isFinite(wp) ? fP(wp, 0) : "–"}</small>` ``.
   The existing `.full td small.cash{display:block}` rule then applies.
2. `views9.css` line 48: change `.v9views .full th,.v9views .full td{padding:4px 4px;…}` to `padding:4px 3px`.

**Results on the same 640 states:**

| Change | States that overflow | Least slack |
|---|---|---|
| Both | 0 | 24px |
| (1) alone | 0 | 2px |
| (2) alone | 0 | 3px |

- Row heights are unchanged (38/52px).
- Screenshot of the simulated fix: `open3-residual-fixaf-1200-light.png`. Breakevens is fully visible, with "pays 10%" under "13.5%".
- I do not recommend letting the Position cell's second line wrap. It also clears the overflow, but it re-wraps names in 57 of 61 states that already fit, which adds clutter (`open3-residual-fixb-1200-light.png`).

## Observations (not open)

- **A − h·B fallback ticks.** The fallback puts a tick as close as 12.0px from the zero line, for example "0%" over "−20%" in `open1-fb0-*.png`. The two labels stay apart and read cleanly.
- **Empty recovery chart.** When both runs never recover, the recovery chart still draws an empty 0–1 axis (`recz-growth-1200-light.png`). This predates the fix rounds and was noted in round 1.
- **Two different multipliers.** B's line 2 shows contracts (×k, e.g. "×0.58"). The chart legend, the "B ×h" chart labels and the Pair sizing summary show notional h ("B ×0.84"). This is by design (item 1), and B's ⓘ explains both.
