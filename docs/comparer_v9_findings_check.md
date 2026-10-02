# Round 3 verifier F: the 51 audit findings re-run against v9 (after fix round 2)

**Build under test.** `/home/user/short-option-explorer/dist/ram_koru_lab_v9.html`, the standalone twin of `ram_koru_lab_v9_artifact.html`.
- Both script blocks and the style block are byte-identical between the two files.
- `build9.py --out scratch/r3f/rebuild/lab.html` reproduces both files byte for byte, so the build is current with the sources. Checks: OK (colour rules: light warn-vs-B hue 35°, warn 5.45:1, debit 6.35:1; dark 45°, 9.16:1, 7.07:1).
- `node --test test/*.test.js`: 63/63 pass.

**How it was run.**
- Chromium through Playwright at 1200 and 1440, light and dark. Each repro is adapted to the v9 state API (`STATE.cmpOp`, `STATE.change`, dock chain toggles and controls, sliders, overview "Set as A/B", smile quote clicks, ⇄, `location.hash`), keeping the intent of each repro.
- Every round 2 script (`m1`–`m9`, `a1`–`a10`) was re-run unchanged against the current build. Their JSON output is identical to round 2, except for the intended fix-round-2 changes:
  - no neutral pill next to "A and B are the same trade";
  - Legs cells now use `label.tab`;
  - line 1 fit classes are now `fa` / `fw` rather than `fx`;
  - the fill token now has a long and a short span ("natural" / "nat").
- New probes for this round:
  - `n1`: UI fuzz of link independence, 600 random dock actions;
  - `n2`: overrides, instrument link and unlink, expMap;
  - `n3` and `n4`: whether A and B use the same fit stages;
  - `n5`: type scale over the whole tab;
  - `n6`: the round 2 OPEN repros;
  - `n7`: toast placement;
  - `n8` to `n10`: signed zeros and ratios in the comparison table;
  - `a3` re-run with new seeds 2026 and 99991, 250 states × 3 viewports each.
- Scripts, output and screenshots are in `scratch/r3f/`.
- No console or page errors in any run. Only `rk-lab-v9` is written to storage.

| # | id | status | evidence |
|---|---|---|---|
| 1 | structure-chip-calls-straddle-strangle | fixed | `m1`: 2,368 positions; `label.kindWord` matches the legs and `label.full` carries every strike (0 bad). RAM 16 Oct 48/48 gives "short strangle 14 / 15" vs "21 / 21.5" with amber "! A: put widened to 14 to keep a strangle". Straddle gives "short straddle 14" vs "short straddle 21". |
| 2 | structure-two-aspects-force-anything | fixed | Overview "B" on "KORU 20 Nov strangle 18/30 +33C" unlinks only `wingCall`. A's together slider at 20 → B follows (15P/33C). A → KORU → toast and notice "A and B are now the same trade". |
| 3 | structure-itm-keyed-to-delta-50 | fixed | ITM matches strike vs Fpar on all 18,720 legs, overrides included. RAM 19 Mar 45/55 gives 17P (ITM, twin mark, intrinsic 2.55) and 18C (OTM). Forward-Δ ATM ticks at 54.3–66.7 by chain. |
| 4 | structure-otm-chain-end-silent | fixed | RAM 20 Nov 15/15: B CHAIN_END, amber "! B: call at chain end 33C (23.3Δ)"; B line 3 reads "Δ 15 / 15 → 15Δ / 23Δ". On 19 Mar 20/20 both sides are flagged. |
| 5 | structure-cap-divergence | fixed | 792 wing combinations: 89/89 with a σ-width ratio > 2 and 45/45 with one side n/a raise amber. Default + 15Δ wings: "! call wing A 0.5σ vs B 0.2σ wide". |
| 6 | structure-natural-debit-profit-odds | fixed | B natural debit: "net debit $15", amber "! B is a net debit", odds 0%, breakevens "none". The literal KORU 16 Oct repro is a $10 credit in v9. |
| 7 | structure-fix-rewrites-A | fixed | Fixes carry a side. B's fixes leave A unchanged and unlink only placement. No UI path rewrites A. |
| 8 | structure-same-delta-different-distance | fixed | "Strikes by Δ \| % OTM \| σ", linked by default. Line 3 shows Δ / % / σ for both sides. On σ: A 13P 0.25σ / 20C 0.77σ, B 18P 0.29σ / 30C 0.77σ. |
| 9 | selection-smile-click-wrong-strike | fixed | UI clicks on KORU Mar 25C and 22C, RAM Mar 18C, KORU Dec 23.5C and KORU Nov 23C each land on exactly that strike. B's chain click unlinks placement only. |
| 10 | selection-itm-split-by-target | fixed | (a) 16P: ITM vs fwd 14.44, intrinsic 1.55, quote premium 0.05.<br>(b) 15C: OTM, "all time value".<br>(c) KORU Mar: 23C/26P guts, 26P ITM. |
| 11 | selection-same-legs-two-marks | fixed | 3,747 pairs of different targets resolving to the same legs: `POS.val` is identical at 5 points (max diff 0). |
| 12 | selection-unreachable-calls | fixed | 8,622 `valueAt` → resolve round trips, base chain and spot ×0.9, 3 bases: 0 failures. |
| 13 | selection-b-achieved-hidden | fixed | B line 3 "Δ 20 / 20 → 20Δ / 36Δ". Dock: "= A · 14P / 38C · 19.9Δ / 36Δ · ! call at chain end". |
| 14 | selection-otm-end-no-stop | fixed | `RULE.ends` gives an OTM stop on all 8 chains (e.g. RAM Mar call 30.0Δ @30C). Capped 19 Mar: "call wing n/a (no strike above 30C)". |
| 15 | selection-forward-borrow-bias | fixed | F = Fimpl = Fpar on all 8 chains. "atm" is the strike nearest Fpar (KORU Mar 20, KORU Dec 20.5, RAM 14). |
| 16 | selection-no-moneyness-sigma | fixed | As #8. |
| 17 | selection-straddle-named-strangle | fixed | As #1. |
| 18 | selection-stop-message-gap | fixed | RAM Nov put 80 → 25P with GAP "no 22–24P listed; 21P 74.4Δ, 25P 85.5Δ". Line 3 reads "gap in strikes", with that text as the tooltip. |
| 19 | selection-linked-desync-at-stop | fixed | KORU Mar together slider [35.95, 64.05]. Dragged to 80 it stops at 64.05/64.05, note "put stops at 38P, the last put with a bid (64Δ)". |
| 20 | numbers-capped-guts-zero-odds | fixed | 18P/12C + 16C: odds 25.4% (brute force 25.4%), breakeven 16.15. The table shows 25% / 16.15. |
| 21 | numbers-net-debit-shows-profit | fixed | Credit −0.10: odds 0%, breakevens "none", line 2 "net debit $10". |
| 22 | numbers-itm-day0-phantom-pnl | fixed | 2,664 ITM positions: day-0 mark is 0 at mid. The grid's day-0 0σ cell is "0.00%", uncoloured, in tabs A, B and D. |
| 23 | numbers-overview-table-ev-not-hv | fixed | Under rn, "EV (HV30)" for RAM 16 Oct 13P/17C reads +0.51%. |
| 24 | numbers-sigma-means-two-things | fixed | Axis "move in σ over A's 50 days". Line 3 "to 20 Nov" / "to 18 Dec". In % units the caption reads "±1σ, ±2σ marks: σ over A's 15 days". |
| 25 | numbers-structure-label-straddle | fixed | "short straddle 14 + 25C wing". Grid headers, recovery, sweep legend and title use the labels. |
| 26 | numbers-recovery-weeks-vs-cycles | fixed | A: "21.4 wk · 3 cycles · 2.5 needed · 3 × 50d → 28 Feb 27". B: "14.3 wk · 2 cycles". |
| 27 | numbers-credit-units-silent-fallback | fixed | A tv −0.15 / −0.10: "A's time value is not positive, so values show % of A's notional instead of multiples of it", in the legend and the table. |
| 28 | numbers-cal-odds-past-expiry | fixed | Calendar alignment: tA = 50/365 at day 50 and at day 78. |
| 29 | state-along-single-axis | fixed | As #2. `n1` fuzz: 600 random UI actions, 0 unexpected link changes (acceptance below). |
| 30 | state-anything-reentry-wipes-B | fixed | B's own 15/15 + wing → link placement → unlink gives "restored B's 15 / 15Δ · start from A instead". "↺ all", then unlinking again, restores the wing too. |
| 31 | state-no-straddle-label | fixed | Dock Straddle \| Strangle; labels and glyph follow the resolved kind. |
| 32 | state-b-legs-invisible-in-dock | fixed | Linked B cell "= A · 21P / 21.5C · 46.6Δ / 49.7Δ" (RAM 16 Oct 48/48), amber with "!" when diff marks it. Legs in detail lists B's legs. |
| 33 | state-delta-only-strike-rule | fixed | As #8. |
| 34 | state-exp-silent-wrap | fixed | B unlinked at 19 Mar. A → 19 Mar and A → 18 Dec both leave B at 19 Mar. |
| 35 | state-v5-linkB-migration | fixed | `#v5.` loads "Loaded a v5 view…". A detached 25/35; B's own detached placement 15/45. Nudging B's put to 16 leaves its call at 45. |
| 36 | state-strikes-mode-stale-start | fixed | A at 40/40, then unlink placement: B starts at 40/40 and stays at 21P/26C. |
| 37 | state-relink-and-hidden-link | fixed | A detached 20/40 → together keeps 20/40 and 11P/18C (B 15P/26C). The Legs control is visible; B gets its own control when unlinked. |
| 38 | state-swap-custom-h-pins | fixed | Custom h 2 → 0.5. Pin {SA 21.09, SB 14.45, dA 120, dB 40}; ⇄⇄ restores it. 300 random swaps pass (a8). |
| 39 | state-pasted-link-ignored | fixed | A pasted `#v8.` loads with "View loaded" and is rewritten to `#v9.`. A bad code toasts and keeps the state. |
| 40 | state-setA-equals-B | fixed | Overview "A" on KORU 20 Nov strangle: toast and notice "A and B are now the same trade". |
| 41 | state-sweep-ignores-unlinked | fixed | A detached 15/45: the sweep point at x0 = 30 is 10P/17C (= actual A); "offset 30Δ kept, legs detached". |
| 42 | glance-straddle-named-strangle | fixed | Overview legend "RAM straddle / … + call wing / KORU straddle". Grid "RAM straddle 14". Title "RAM straddle 14 vs KORU straddle 21". |
| 43 | glance-structure-mismatch-silent | fixed | Amber WIDENED / KIND. 5,760 linked-B states: none collapses or turns into guts without amber. Case 2: "B strikes 20 / 20Δ ↺" + "! A: put widened to 15 …". |
| 44 | glance-strikes-not-in-fixed-ui | fixed | `#sum9` stays at top 29px at every scroll position, dock open or hidden. Both cards show strikes, per-leg $, net, fill, ×h, Δ/%/σ. |
| 45 | glance-typography-inverted | fixed | Line 1 is 21px (20 when fitted); leg prices 14px; net 15px/600. `n5`: with every section open, no text outside line 1 exceeds 15px (1200 and 1440). Differing tokens are underlined. See OPEN-1 for a fit-stage consistency residual. |
| 46 | glance-identical-positions-shown-as-different | fixed | RAM vs RAM 23/23 vs 27/27 → 12P/21C both: "A and B are the same trade". The neutral pill is now suppressed. |
| 47 | glance-capped-hides-base-and-cap-strike | fixed | "RAM 20 Nov · short straddle 14 + 25C wing" vs "short straddle 14"; line 2 "25C wing −$43". |
| 48 | glance-table-keys-scroll-under-bar | fixed | `#cmp` thead is sticky at 150px, the summary's bottom edge, at 1200 and 1440, light and dark. |
| 49 | glance-1200-bar-wraps | fixed (residual OPEN-1) | Summary 121px; never wraps or clips. The round 2 OPEN-1 repros (s111, a10) now fit. `a3`: 0 overflow in 2,400 state-viewports (seeds 777, 2026, 99991). The fit stages are applied per card, though, so A and B often read differently: OPEN-1. |
| 50 | glance-atm-label-garbled | fixed | No "ATM/ATM", "ATMΔ" or "ATM Δ" in any text, tooltip or the built file. |
| 51 | glance-recovery-text-overlap-1200 | fixed | Narrow layout at 1200: 0 overlapping and 0 clipped boxes, light and dark. |

## Spec acceptance items

| Item | Result | Evidence |
|---|---|---|
| Linking independence | pass | **`n1` fuzz.** 3 seeds × 200 random dock actions:<br>• chain toggles 137;<br>• A/B segs 264;<br>• selects 108;<br>• sliders 76;<br>• detach 14;<br>• "atm" 1.<br>Results: 0 link changes beyond what the action allows. Each chain toggle flips only its own link. A-side actions change no link. A B-side action unlinks only its own aspect. The designed exceptions hold: B's detach unlinks structure, legs and placement, and B's "detached" while placement is linked also unlinks placement. An unlink without a stash never moved B. Every linked aspect resolves to A's value.<br>**`a1` matrix** passes as in round 2.<br>**The spec examples** work: RAM strangle vs KORU straddle; only B with a protective call; only B's legs detached. |
| Straddle never splits | pass | `a2`: 23,040 A positions (spot 0.3–3×, IV −60 to +100, 3 bases, extreme values) plus 5,760 linked-B positions: 0 splits. |
| Strangle never collapses silently | pass | Same grids: 0 collapses without ONE_STRIKE. 3,442 collisions widen with WIDENED, which is amber when one-sided. |
| Per-leg credit/debit for both | pass | `a3`: 2,400 state-viewports. Line 2 on both cards has one "+$" or "−$" token per built leg, "call/put wing n/a" where relevant, and the net spelled out ("net credit/debit $…", or "credit/debit $…" at fit stage f4). Legs in detail repeats it per leg. |
| Summary always visible | pass | Top 29px at every scroll position, dock open or hidden, 121px tall. Toasts sit at the bottom (842–876px) and never cover it. A pill click opens a hidden dock at the row. |

## OPEN

### OPEN-1 (minor; residual of #49/#45, requirement 6 "at a glance"): fit stages are chosen per card, so identical aspects read differently on A and B at 1200

**Repro.** 1200 light, dock open. In the dock, set A's Expiry to 18 Dec and turn Protective call and Protective put on (B follows). Equivalently: `setA exp 20261218; setA wings.call.on true; setA wings.put.on true`.

**What happens.** The pill row says "same position, only the instrument differs", but the cards read differently.
- **Line 1:**
  - A, 21px: "RAM · 18 Dec · short strangle 13 / 22 + 9P & 30C wings";
  - B, 20px, `fa`: "KORU · 18 Dec · strangle 18 / 34.25 + 13.25P & 47C wings".
- **Line 2:**
  - A: "… net credit $223 · 15.4% · mid";
  - B, f4 f3 f2 f1: "… credit $298 · mid · ×1.22". The word "net" and the % of spot are dropped on B only.
- Screenshot: `scratch/r3f/shots/n4-c3-1200.png`. Other repros:
  - `n6` s111: B "strangle … + 10.5P & 36.25C" with no "wings", vs A "short strangle … + 36.25C wing";
  - `n10` R2: "short straddle … wings · net credit $20" vs "straddle … · credit $26".

**How often.** In 200 random states at 1200 (`n3`):
- 36 show "short" or "wings" dropped on one card only, for the same kind or wing set;
- 25 show "wing" dropped on line 2 of one card only.

B's % of spot is often hidden while A's is shown, so that compared number is missing on one side. At 1440 the same states are symmetric.

**Expected.** Wording that does not differ between A and B reads the same on both cards, and only real differences stand out. For example, run the fit on both cards and apply the larger stage set (and the same line 1 font size) to both. Only the underlined tokens should look different.

### OPEN-2 (minor, cosmetic; residual of round 2 OPEN-2): comparison table still prints signed zeros, and a huge A/B ratio when the B value prints as zero

**Repro 1 (signed zero; `n10` R1, 1200):**
`setA inst.id RAM; setA exp 20261016; setA basis sigma; setA legs detached; setA values {put:-0.46948, call:1.05353}; setA wings.put.on true; setA wings.put.value 0.65572; setB values {put:-0.04965, call:-0.41241}`.
- A's time value is −6.7e-16.
- The table reads "Credit/σ … on time value **−0.000** 0.417 0.00×" and "Credit / margin … on time value **−0.0%** 12.7% 0.00×".
- Cause: these two rows use `fN(v, 3)` and `fP(v, 1)` (`ui9_views.js` lines 331 and 341), not a zero-safe formatter. The Credit per day row next to them correctly prints "0.000%".

**Repro 2 (ratio over a zero; `n10` R2, 1200):**
`setA inst.id KORU; exp 20261218; structure straddle; basis money; wings.call.on true (13.3476); wings.put.on true (8.3375); fill nat; setB inst.id KORU; setB inst.spot 24.7592; setB inst.ivShift 4; setB wings.call.on true`.
- B's time value is −0.00052, printed as "0.00%" / "−0.000" / "−0.0%".
- The A / B column reads:
  - Credit **14806.12×**;
  - Credit/σ "−0.030 −0.000 **906.42×**";
  - Credit per day **14806.12×**;
  - Credit / margin "−13.7% −0.0% **1071.34×**".
- Screenshot: `scratch/r3f/shots/n10-R2-1200.png`.
- Cause: `ratio()` (`ui9_views.js` line 317) only guards |y| > 1e-12.

**Expected.**
- These rows print a value that rounds to zero unsigned ("0.000", "0.0%").
- The ratio cell is "–" whenever the B value prints as zero at its shown precision.

**Frequency.** About 1 in 250 random states (`a3` seed 99991 #110, `n9` #190). The leg prices and summary are unaffected, hence minor.

## Observations (not OPEN)

- **Vega ratio.** With auto sizing on equal vega and near-zero vega (two-wing straddles), the Vega row reads "0.00% 0.00% … 1.00×". That is correct under the rule.
- **Extreme spot override.** With B's spot at 6× listed, B resolves to "strangle 32 / 33" (1Δ put, 99Δ call). Amber items flag it ("put A 32.3Δ vs B 1.2Δ", chain end, widened), so nothing is silent.
- **expMap "same".** It cannot be exercised on today's data: both instruments list all four expiries. The popover works and the setting persists.
