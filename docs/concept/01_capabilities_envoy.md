# Capability inventory, envoy's list (01)

The record of what the Short Options Comparer (v10) can do. It is grouped by the question a trader asks, not by
today's tabs. Each entry gives what it answers, its knobs, its outputs, and where it lives today (abbreviated as
"Compare > Comparison > panel" or "Compounding > Weeks > panel"). "Siblings" names other places that answer the same
or a close question. How things are computed is left out on purpose.

Written independently of Oppa's list (02).

---

## A. Defining a position (the "what is the trade" layer)

**A1. Two positions side by side (A and B)**
- Answers: which of two short-option trades is better?
- Knobs per side: instrument (RAM, KORU, or one added by the user), expiry, structure (straddle / strangle), strike
  basis (Δ, % OTM, σ), put and call placement (one slider for both, or legs detached), protective call and put wings
  (on/off, own basis), fill (mid / natural), per-leg typed fill prices, typed actual credit.
- Outputs: the position card (title, legs with $ per leg, net credit or debit, placement words, bid × ask per leg).
- Where: summary cards at the top; Positions dock (right).

**A2. B follows A (links)**
- Answers: compare only what I deliberately changed.
- Knobs: per-field link and unlink, "Follow A everywhere", detach B, the swap A⇄B, "start B from A".
- Outputs: link icons, amber underlines for differences you did not ask for, notices with undo or relink buttons.
- Where: dock rows, card underlines, toasts.

**A3. Pair sizing (how many B per A)**
- Answers: at what size is B compared with A?
- Knobs: rule (auto, equal notional, credit, vega, worst loss, margin, custom contracts).
- Outputs: one sentence ("B is sized at 0.71 KORU contracts per RAM contract (equal vega)"), and the fallback note
  when a rule cannot be met.
- Where: dock (Size B), note row under the cards, legends, export.
- Siblings: survival size (E4), safe leverage (G6); all three are "how big", with no shared form.

**A4. A run (a repeated strategy) for Compounding**
- Answers: what if I sell this every week or month for N weeks?
- Knobs: run A and optional run B; ticker, cadence (weekly / monthly), family (covered calls / strangle), call Δ,
  put Δ, puts on covered calls, wings, leverage (covered calls) or margin used (strangles), modus operandi (credit:
  reinvest / rebalance / keep as cash; on a margin call: IBKR minimum / back to a target leverage; during a move:
  keep trading / stop), "Change in B" (strategy, ticker, cadence, strikes, size, modus, vol, anything), swap and drop B.
- Outputs: two run chips (name plus key settings, differences in strong ink).
- Where: Compounding bar; Runs dock.
- Siblings: A1. It is a separate definition system with its own vocabulary (Δ only, no fills, no typed credits).

**A5. Instruments and data**
- Answers: what is listed and at what price?
- Knobs: add an instrument (paste a chain), period vol per ticker (listed 30-day, typed, or from Compounding).
- Outputs: listed expiries, spot, chain, smile.
- Where: dock instrument select; Market facts; Compounding vol row.

---

## B. What do I collect?

**B1. Credit**: net credit or debit per contract, credit per leg, time value vs cash credit when in the money.
Where: cards, Comparison table, Overview, export.

**B2. Credit ratios**: credit / σ (credit per unit of implied move), credit per day, credit / margin (return on
capital if it expires worthless). Where: Comparison table, Overview columns, strike sweep (credit curve).

**B3. Credit across all listed expiries and wings (Overview)**
- Answers: of every expiry, with and without wings, which pays best?
- Knobs: table or charts, the metric for charts (credit, credit/σ, credit per day, EV, profit odds, worst loss, wing
  cost, wing pays back), toggles for series.
- Outputs: a table with the best cell per expiry lit; charts of four dots per expiry; click a row to make it A or B.
- Where: Compare > Comparison > Overview (collapsed).

**B4. Credit across strike placements (Strike placement sweep)**
- Answers: where on the chain do I get paid most for the risk?
- Knobs: which leg to vary (both, put, call, wing), smoothing.
- Outputs: three small charts across placement (credit or time value, EV at period vol, worst loss over the chart
  range); ITM shading; the positions as set.
- Where: Compare > Comparison > Strike placement sweep.

**B5. Credit kept per cycle (Capture)**
- Answers: of the credit sold, how much do I keep on average, typically, with odds, when managed?
- Knobs: share x for the fixed preset; odds of keeping at least x; take profit and stop (managed); a custom variant
  (vol source, typed vol, gap chance, gap size, gap side, reading mean / median / percentile, exit at expiry or N days
  before); show formulas.
- Outputs: a table of presets (fixed share, expected, median, odds of keeping at least x, managed, time path,
  growth, empirical, your variant), a curve of keep odds, a growth reading that can end at zero with the surviving
  size.
- Where: Compare > Capture.
- Siblings: B6, D1 (Expected = EV in other words), E4 (survival).

**B6. Credit kept, compounded (Credit kept)**
- Answers: if every cycle keeps preset X, where does NAV end?
- Knobs: preset shown, share x, take profit and stop, the custom variant (vol source, vol, gap chance, gap size).
- Outputs: a table per preset (kept a cycle, NAV at week N, with references to the full model and to exactly on the
  path); a NAV chart; the survival size per run.
- Where: Compounding > Credit kept.
- Siblings: B5 (the same presets, read per cycle instead of compounded).

---

## C. What can I lose? (risk and shocks)

**C1. Payoff at expiry and before it**
- Answers: what is my P&L at each price, on a chosen day?
- Knobs: days to expiry (slider with stops), replay (play, step, speed), odds strip, ±1σ/±2σ marks, IV band (±5,
  ±10 points), chart range.
- Outputs: A, B and A − B curves; break-evens; pins; tooltip with σ and move colour.
- Where: Compare > Comparison > Payoff (P&L lens).

**C2. Worst loss over a range**
- Answers: what is the most I lose if the price lands anywhere in a range?
- Knobs: the range (the chart range, or its own range).
- Outputs: worst loss per position and for the pair, in the reading unit.
- Where: Comparison table, Overview column, sweep chart, export.
- Siblings: C5 (stress move), C6 (recovery hit), C4 (joint worst cell). These are four shock readings with four
  different definitions, names and forms.

**C3. Break-evens**: break-even prices (at expiry), break-even vol (the period vol at which EV is zero), break-even
lines over time (Profit zone lens). Where: Comparison table, Profit zone lens, sweep.

**C4. Joint moves (two tickers)**
- Answers: what if RAM and KORU move by different amounts?
- Knobs: day; σ or % diagonal.
- Outputs: a heatmap of A − B over both moves; worst cell; worst on the assumed same-σ line.
- Where: Compare > Comparison > Joint moves.

**C5. Stress move (Compounding)**
- Answers: what does a gap, run, drawdown or spike do to the account in a given week?
- Knobs: move size (% of ETF or index), shape, which week (or the worst), IV response (points per 10% drop or rise,
  cap), rules (landing day, forced-sale slippage, maintenance after the move).
- Outputs: per run: NAV before (leverage, margin used), change at the low and at the end, the margin call (day,
  price, what the broker did), any deficit, upside given up; the room this week (move to a margin call and to zero);
  loss by week charts; room charts.
- Where: Compounding > Stress.
- Siblings: C2, C6.

**C6. Recovery from a hit**
- Answers: if I take a hit of size X, how many cycles to earn it back, and what size survives it?
- Knobs: the hit (a price move in σ, worse side / down / up, or a fixed loss %), growth after the hit (if no
  repeat, average, best case, typed), capital base (margin or notional), NAV or recovery basis.
- Outputs: the size that survives the hit; cycles and days to recover; the chance of no repeat while recovering; a
  curve of cycles against hit size.
- Where: Compare > Comparison > Recovery dynamics.
- Siblings: C5 (a hit on the account, in weeks), E4.

**C7. Margin-call odds and room (Compounding)**
- Answers: how likely is a margin call within N weeks, and how much room is there?
- Outputs: margin-call odds in the Weeks strip (loud when high), the size that keeps the odds at 10% or less, the
  margin-call-so-far chart, the room chart in Stress.
- Where: Compounding > Weeks strip; Stress.

**C8. Greeks now**: delta, dollar delta, gamma, dollar gamma (per 1% move), theta per day, vega per IV point; per
contract, B at its size, A − B (dollar rows only across tickers). Where: Compare > Comparison > Greeks.
Siblings: vega also in the Comparison table (sizing uses it).

---

## D. What is it worth on average? (expectation)

**D1. Expected value**
- Answers: what does the trade make on average?
- Knobs: odds basis (implied vs period vol), period vol per ticker.
- Outputs: EV per position and for the pair.
- Where: Comparison table (EV row), Overview (EV column), strike sweep (EV chart), Capture (Expected preset),
  managed EV (Manage the trade), EV map lens, export.
- Siblings: D2, B5. EV exists in at least six places with three names ("Expected value", "EV at period vol",
  "Expected").

**D2. EV map lens**: where across prices the expected P&L comes from (P&L × odds per 1% of move), with a running
total. Where: Payoff > EV map.

**D3. Profit odds**: the odds the P&L is above zero at expiry; the odds strip on the payoff. Where: Comparison
table, Overview, payoff odds strip.

**D4. Break-even vol**: the period vol at which EV is zero (the edge in vol points). Where: Comparison table.

---

## E. How big should it be? (sizing and survival)

**E1. Pair sizing**: see A3.

**E2. Margin**: approximate margin per contract (Reg-T style, × leverage), credit / margin. Where: Comparison table.

**E3. Leverage / margin-used sweep**: typical NAV and margin-call odds across leverage (covered calls) or margin
used (strangles), the run's own credit policy solid and another dashed. Where: Compounding > Weeks.

**E4. Size that survives**: the largest size that survives a test: wipe-out odds under 1 in 20,000 a cycle
(Capture growth, Credit kept), a hit (Recovery), and margin-call odds of 10% or less (Compounding strip).
Where: three places, three tests, one sentence form.

---

## F. How does it behave over time?

**F1. Days slider and replay**: step the payoff day by day to expiry, play it, step on trading days (a Monday
carries the weekend). Where: Payoff.

**F2. Day change lens**: what each position made since the trading day before, at every price; A − B below. With
extrapolation (repeat the last day's change to expiry). Where: Payoff > Day change.

**F3. Time decay lens**: the cost to buy back at an unchanged price (or a set move), day by day, against a straight
line; daily decay below; extrapolation. Where: Payoff > Time decay.

**F4. Decay vs move lens**: how far the price may move in a day before that day's decay is gone; colour key for
moves. Where: Payoff > Decay vs move.

**F5. Profit zone lens**: break-even prices by day inside the price cone. Where: Payoff > Profit zone.

**F6. P&L through time (grid)**
- Answers: P&L for every day and price at once.
- Knobs: heatmap or table, value shown, A / B / A − B, contour lines, pins, alignment of two expiries (% of life
  or same date), copy CSV.
- Where: Compare > Comparison > P&L through time.
- Siblings: F1 to F5 (one-day slices of the same surface).

**F7. Manage the trade**: take profit at x% of the credit, stop at y%; odds of each, days to them, EV a trade and
a day held, worst 5% mean, managed vs held. Where: Compare > Comparison > Manage the trade.
Siblings: Capture Managed preset (B5), Credit kept Managed.

**F8. Compounding weeks**
- Answers: if I repeat it week after week, where does NAV go?
- Knobs: start capital, weeks, price path (flat, line, points, growth; start price; between points), IV and
  realized vol per ticker (B's own when B differs in vol), outcome shown (typical or average), costs and margin
  overrides.
- Outputs: headline strip (typical NAV and its multiple, 10%–90% band, margin-call odds, shares or contracts),
  stacked charts over N weeks (NAV, credit collected, margin call so far), growth week by week (with the formula),
  credit and margin panel, the week table (expiry, price, move, strikes, Δ, premium, time value, size, lots), the
  sweep (E3), random paths (median and bands).
- Where: Compounding > Weeks; Stress > Random paths.

---

## G. What does the market quote?

**G1. Market facts**: bid, ask, mid, spread, IV, Δ, strike vs forward, time value, intrinsic, contracts in use;
forward; 1σ move to expiry; skew line. Where: Compare > Market facts.

**G2. Smile and legs**: IV smile per expiry with the legs marked; click a quote to put a leg on that strike.
Where: Compare > Market facts.

**G3. Quote line on the cards**: bid × ask per leg. Where: cards.

---

## H. Cross-cutting settings

- Reading unit: $ per A contract, multiples of A's credit, % of A's notional, % of A's margin.
- Chart range: down and up, in σ, % or price (also the worst-loss range unless it has its own).
- Odds basis: implied or period vol; the period vol per ticker (shared by both tabs).
- Worst-loss range: the chart range or its own.
- Alignment of two expiries: % of life or the same date.
- Theme: auto, light, dark.
- Dock open or closed; panels collapsed (remembered).

## I. Interaction, sharing, explanation

- Pins (click to pin a price and day; shared across charts), a shared cursor on the Compounding charts, keyboard
  steps on strikes and days.
- Copy order (per position), copy CSV (grid, week table), share link and view code (both tabs), load a view code,
  saved state between visits.
- Export as Markdown with chosen sections (Compare: header, comparison, assumptions, results, recovery, pins,
  overview, notes, capture, lens; Compounding: runs, base, strip, weeks, stress, random, kept).
- Explanations: (i) knobs that pin open, panel notes, "show formulas and details", Method and caveats (both tabs),
  hover text on anything cut.
- Notices: toasts with actions (undo, relink, apply a fix), faults (handled defects), warnings (RAM monthly only,
  path notes).
- Colour language: A purple, B orange, A − B ink; P&L green / red; market moves grey / yellow / green / red; accent
  for extrapolation.

---

## Overlap clusters (named, not resolved)

1. **Expectation**: EV row, EV column, EV sweep chart, EV map lens, Capture "Expected", managed EV, Credit kept
   "Expected". Three names, two vol bases, no single place.
2. **Shocks**: worst loss over a range (Compare), joint worst cell, recovery hit, stress move (Compounding), and
   the room to a margin call. Each defines the shock differently (range, σ pair, σ or %, gap shapes) and reports in
   a different form.
3. **Survival and size**: pair sizing, survival size (three tests), safe leverage, the leverage sweep.
4. **Keeping the credit**: Capture per cycle, Credit kept compounded, Manage the trade, the Managed presets.
5. **Time**: the days slider, five lenses, the grid, Manage (days to targets), Compounding weeks. One surface (P&L
   over price and time) is shown in several partial slices.
6. **Two definition systems**: Compare positions (A1) vs Compounding runs (A4), with different knobs and words.
7. **Odds and vol**: odds basis implied vs period vol, IV vs realized in Compounding, ATM IV in facts, the custom
   variant's vol source. The same idea appears under four switches.
