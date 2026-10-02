# Critique of PLAN_V10: period vol, recovery dynamics, reading base

I checked every figure below against the v9 model in node. The scripts are in `/tmp/claude-0/-home-user-voltagent-chat/eab0dce9-3582-5b50-8fc1-369c85131c50/scratchpad/v9/scratch/crit10/` (`check.js`, `edge.js`, `edge2.js`, `memo.js`).

Reference case: KORU 16 Oct 21 straddle at mid, 15 days. HV30 is 117.3%, ATM is 123.9%, margin is $16.89/sh and the credit is $4.325/sh.

## (a) One source of truth

**1. Blocking: the period vol should be stored per ticker, not on the slot and not in `Instrument.version`.**

Problem: slots belong to sides (A and B), not to tickers. "One number per instrument" therefore turns into two numbers when A and B share a ticker, and into no number at all for a ticker that sits on neither slot. Specifically:
- The overview builds every cell on `ovSlot = {id}` (ui9_views.js:105), so its EV column would stay on HV30.
- "Set as A/B" (`setFromCell`) writes `{id}`, so it would silently drop the side's period vol. `setA("inst.id")` drops overrides too, so going KORU→RAM→KORU would lose it.
- If rv goes into the version, these change for no reason:
  - `same` (ctx9:42, state9:66): the normaliser would convert a price-unit range to σ, and auto sizing would flip from notional to vega.
  - `isIdentical` (cmp9:174).
  - `sameTrade`: the overview would draw A as its own point, with the wrong "spot/IV override" text.
  - `smileGroups`: the same smile would be drawn twice.
  - Every pricing memo would miss (`POS.price` and `POS.build` keys include the version), although no leg price depends on rv. The user's note says this directly: the period vol is an odds input, not a leg-pricing input.
- The Compounding tab is per ticker (`ys.sc.rv[tk]`), so a per-side number has no clean mapping to it.

Change:
- Store `vol: {KORU: {v: 1.00, src: "set"}}` at S9 level. An absent entry means HV30.
- Give it one accessor, `C.volOf(id) → {v, src}`, and call `DIST.make(E, S, mode, v)`.
- Leave `Instrument.version` alone. Swap, link/unlink, Set as A/B and the overview then need no extra code.

**2. Blocking: the DIST memo key ignores the vol.**

Problem: `dist9.js:11` keys on `version|exp|mode|hvk`. I confirmed that `DIST.make(E,S,"hv",1.0,1)` after a call at 1.1732 returns the cached 117% object (`memo.js`). This is only safe today because hv comes along with the version.

Change:
- Key on the vol actually used.
- Remove `hvk` from the signature.
- Add a test: dist and stats miss when the vol changes, and hit again when it returns.

**3. Important: readers the plan does not list.**
- **`ui9_export.js`** (being written now) copies `recRun` (lines 191–192) and hard-codes "HV30" and "HV30 × hvk" (lines 115, 121, 167, 168, 229, 270). Ask the export agent now to call the panel's own recovery function and a shared label helper. Otherwise the v10 export will disagree with the screen.
- **Labels:**
  - ui9_views.js:124, 233, 247, 387, 789, 876, 1034, 1159
  - ui9_summary.js:278–298
  - shell9.html:528 (the hvk row, to be removed)
- **`inst9.js:142`** uses HV30 as the flat-smile fallback when a chain has no OTM quote. That is leg pricing, so it must stay on listed HV30. The plan should say so, so nobody routes rv there.
- **yr_ui.js:13/16/36:** `hv30()` rounds to an integer, and the defaults for `rv` and `rvB` are rounded copies.

Change: add a source rule to t01: no `.hv` read outside inst9 and `C.volOf`, and no "HV30" literal outside the label helper.

**4. Important: §1 and §2 disagree on which odds feed recovery.**

Problem: §2 says P is "distributed under the current odds model". Under implied odds, EV is fill vs mid, which is 0 at mid. The average rate would then be 0 or below, and recovery would read "never". Today recovery, sweep EV and overview EV are wired to `statsHV` whatever the switch says, and that is right.

Change:
- State that all EV-based readings (recovery, sweep EV, overview EV, the EV explainer) always use the period vol, labelled "at 117% vol".
- The odds switch keeps governing profit odds, the odds strips, the grid odds and the comparison table's EV row.

## (b) Growth rates

**5. Blocking: the example numbers come from a normal distribution, not from the definition the plan states.**

Problem: 13% and "every 7.5 cycles" are P(|z|>1.5) for a symmetric normal (13.36%, 1/q = 7.48). The "5% beyond 2σ" is that normal's 4.55%. The plan's own `plan10/rates.js` prints the model figures:

| KORU 21 straddle, capital = margin | Draft | Model |
|---|---|---|
| Credit kept | 25.5% | 25.6% → 1.7 cycles |
| E[P \| P > −L] | 7.4% | **4.75% → 8.3 cycles** (9 × 15d ≈ 19 wk) |
| Average | 2.0%, 18.6 cycles | 2.0% → **19.4 cycles** (18.6 is the notional figure) |
| q = P(loss ≥ 32.1% of margin) | 13%, 1 in 7.5 | **5.0%, 1 in 20** |

The 1.5σ hit comes from the up side: a +45.8% move costs 32.1% of margin. A 1.5σ down move (−31.4%) costs only 13.1%. q counts both sides at the same loss: up beyond +45.8% (4.4%) and down beyond about −47% (0.6%).

Change: replace every example in §2 and §4 with the model figures, and have the tests compute them from the model.

**6. Important: compounding needs the compounded (log) average, not the plain average.**

Problem: E[P | P > −L] is a plain average, but the cycle count compounds it. Losses up to −L still happen inside the condition, and they pull the compounded rate down:
- at 1.5σ: 4.75% plain vs 3.71% compounded (8.3 vs 10.6 cycles);
- at 2σ: 3.0% vs 1.5% (28 vs 56 cycles).

Change:
- Make the default exp(E[ln(1+P) | P > −L]) − 1 and call it "typical, if no such hit".
- Keep "average" as the plain E[P], labelled "expected NAV". At full margin it is not a compounding rate: there is a 0.12% chance per cycle of losing more than the whole margin.

**7. Important: the honesty line should show the chance of finishing, not 1/q.**

Problem: "every 20 cycles" next to a 9-cycle recovery reads as safe. But the chance of no such hit in 9 cycles is (1−q)^9 = 63%; over the 11 cycles of the compounded rate it is 57%. The draft's amber rule (1/q < N) only fires once that chance falls below about 37%.

Change:
- Show "chance of no such hit in the 9 cycles: 63% (5.0% a cycle)".
- Turn it amber below 50%.
- This number is the probability of the very condition the conditional rate assumes, so the two belong together.

**8. Important: the curve needs a growth rate per hit size.**

Problem: with the conditional rate, g depends on L. The "cycles against the hit" curve must therefore recompute g(h) at each of its 91 points. The curve stays monotone, because the numerator rises as g falls. Showing three rates × recovery/buffer × A/B also gives 12 lines.

Change:
- Draw only the selected rate.
- Put the other two in the tooltip and in the small line "credit kept 1.7 · average 19.4 cycles".
- Drop the word "range", which reads like a confidence band.

**9. Important: edge cases, and one wrong test in §7.**
- **L at or beyond the worst loss:** q = 0, so the conditional rate equals the *average*, not credit kept. Example: a 20Δ iron condor with 5Δ wings and L = 90% gives 1.19%, which is the average; credit kept is 14.8%. The §7 test is wrong. Suggested text: "this position cannot lose 90% of margin in one cycle (worst −76%)".
- **Ties at a flat floor:** with a 30Δ strangle and 15Δ wings, L equals the worst loss (53.9%). Count P ≤ −L(1−1e-9) as a hit, so q includes the floor.
- **Guts / ITM legs:** credit over capital overstates the best case. For the guts 24.5P/19C, credit is 37.6% of margin but the most it can make is 10.5%.
  - Use "best case" = max payoff / capital. That equals the credit for straddles and strangles.
  - For this straddle that gives 25.6%, while the table's "Credit / margin" row uses time value and shows 25.1%. Use the same figure in both, or explain the difference in the ⓘ.
- **Net debit:** the best case is 0 or below, so every rate reads "never". Print "best case −x% (net debit)".
- **L ≤ 0, or an empty condition:** show "none needed" and guard against NaN.
- **How to compute:** compute E and q in closed form (piecewise-linear payoff × lognormal, as EV already does with `bs0`). The dist grid only spans ±7× the implied σ; at 300% vol about 0.5% of the mass falls outside it. If the odds strips need the grid, widen it to max(implied, period vol).

## (c) Decision point 1: the σ yardstick

**10. Important: keep σ = implied ATM everywhere; do not switch it with the odds model.**

Against switching to period vol:
- The range, the worst-loss range (`wlo`/`whi`) and "Equal worst loss" sizing are all stored in σ. Flipping the odds switch or editing the vol would move the range, the worst-loss figures and h, and none of those are odds.
- The placement basis "σ" (`ln(K/F)/E.sigma`) stays implied, so a 0.5σ strike would no longer sit on the axis' 0.5σ tick.
- The hit size would change when only your view of its likelihood changes.

For switching: "beyond 1.5σ" would then always have the same probability. Printing that probability gives the same information without the side effects.

Change:
- Keep the axis σ as ATM at A's horizon.
- Keep the recovery hit on each position's own σ to its own expiry, as today, and say "own expiry" in the caption.
- Where σ meets odds, print both. For example in the axis ⓘ: "1σ = +29% / −22% (implied 124%); at 117% vol, beyond 1.5σ: 4.4% up, 7.1% down."
- Later, if wanted: "kσ of period vol" as a third option in the hit submenu.

## (d) Decision point 2: when the hit is measured

**11. Minor: agree, measure it at expiry.** Reasons to add to the plan:
- The growth rate comes from the expiry distribution, so a hit marked at day d would mix two time points.
- At expiry the Hit equals the payoff chart, which is the user's point 3.
- A mark at day d also depends on the IV-shock inputs and needs σ·√(d/T).

Later, as a submenu option: "gap on day d, closed at the mark".

## (e) "% of margin" as a reading unit

**12. Important: define it as each side's own margin at entry.**
- **Fixed at the entry spot.** Otherwise the payoff curve divides by a margin that moves along the x-axis.
- **Each side over its own margin.** Then h cancels (h·P_B over h·M_B), so:
  - B's figures match B's recovery Hit;
  - A − B becomes a difference in return on capital, independent of sizing.
  - "% of A's margin" for B would depend on h and bring back the −25/−32 problem for B.
- **It is approximate Reg T:** 20% × leverage (KORU 60%, RAM 40%) plus premium. The Compounding tab uses IBKR house rates of 75% / 50% (`costs.mOvr`), so the two tabs' "margin" will not agree. Say so in the ⓘ; one shared margin rate per ticker is a later item.
- **Wings:** tight wings cap margin near the width, so the scale jumps when a wing is toggled.
- **Missing margin:** fall back to % of notional, as `unitsNote` already does for × credit.
- **Precision:** print the Hit at the chart's precision, "−32.1% of margin · −25.7% of notional". With "−26%", the cross-check against the chart fails by rounding alone.

## (f) EV explainer

**13. Important: corrected lines.**
```
Credit                          +$433 /contract
Expected settlement at 117% vol −$399   (period vol: HV30)
Expected value                   +$34  = +2.0% of margin · +1.6% of notional
Loss ≥ 32.1% of margin (the 1.5σ hit): 5.0% a cycle · ≥ 56% (2σ): 1.3%
Growth a cycle: 25.6% best case · 3.7% typical if no such hit · 2.0% average
```
- "Moves beyond 1.5σ" mixes up a move with the loss that defines the hit, and for a straddle the two differ by side. Use the loss.
- Compute EV once and round so the lines add up: the draft's 433 − 398 = 35 is off by one.
- "at 117% moves" reads as a 117% move. Write "at 117% vol".
- Under implied odds the explainer should say: "settlement = the legs' mid value; EV = fill vs mid".

## (g) Compounding tab

**14. Important: the unification works, with five fixes.**
- **The keep-the-gap rule survives.** `rv + iv·(k−1)` only needs a starting rv, and I found no assertion test on rv (yrtest only has screenshot scripts). But the draft's wording is wrong: the IV path scales the Compounding IV input, and moves follow it starting from the shared number. Write it that way.
- **Ranges differ.** Compounding allows 0–250, where 0 means "exactly on the path". The draft slider is 20–300, and the comparer's lognormal breaks at 0. Pick one stored range (for example 0–300), with a floor on the comparer and a note when it applies.
- **Rounding.** Compounding stores 117; the comparer uses 117.32. Touching the Compounding input would flip the source to "set" and show ✎. Store the source ("hv30") and compare at display precision.
- **B-vol mode.** With `bDiff = "vol"`, B has its own `rvB`, and the Compounding swap exchanges `rv` and `rvB`. That swap would then rewrite the comparer's vol. Keep `rvB` Compounding-only (it follows the shared number until edited), and have the swap exchange only the B override.
- **The separate IV input stays tab-local.** It is a flat model IV that prices every option, which matches the user's note. The reference ticks (1-year 173%, 5-year 101%) are hard-coded and exist for KORU only; the slot popover should show only HV30 and ATM for RAM.
- **Migration precedence:** an old code can carry both a Compounding `rv.KORU = 150` and `hvk = 1.2`. Pick a rule: I would take the Compounding value if it differs from rounded HV30, otherwise hv × hvk. Show one note per ticker with the result.

## (h) Additions, drops, wording

**15. Minor: wording.**
- "realized" reads as history for what is a forward assumption. Use "Odds: implied | period vol".
- "moves at 117%" reads as a 117% move. Use "vol 117% (HV30)", and name the slot popover "spot / IV / period vol ▾".
- Basis menu: "If no such hit | Average | Best case | Typed" instead of "Conditional".
- Summary small line: "vol 117% (HV30) vs implied 124%". That gap is what drives EV.
- "ATM implied" preset: say whether it follows A's expiry and the IV shift live, or is stored when chosen. I suggest storing it, labelled "124% (ATM 16 Oct)".
- ⓘ text: "one number per ticker, used for every expiry; annualized like IV (calendar days)". If IBKR annualizes HV30 over trading days, the 15-day spread comes out about 3% narrower than a trading-day count would give.

**16. Minor: tests to add**, on top of §7:
- the stale-memo case from point 2;
- the overview EV reads the ticker's vol;
- Set as A and swap keep the vol;
- a Compounding swap in vol mode leaves the comparer unchanged;
- the export's recovery figures equal the panel's;
- q includes the floor at a wing;
- conditional = average once L ≥ the worst loss.

Keep the IV path for marks, saved comparisons and the odds overlay in "later", as drafted.

## Summary: what I agree with
- One period vol per ticker, set once and read by every EV-based panel through DIST; legs and the smile stay on quotes.
- Conditioning on the P&L rather than the move is the right reading of "without another such loss". It is monotone in L and never below the average.
- The conditional rate needs an honesty figure beside it, and printing the Hit on both bases fixes the −25% vs −32% confusion.
- The hit should be measured at expiry; the IV path for marks, saved comparisons and the odds overlay stay later.
- "% of margin" as a reading unit and one shared EV explainer are worth adding, with the definitions above.