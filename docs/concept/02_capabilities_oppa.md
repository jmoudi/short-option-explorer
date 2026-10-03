# Short Options Comparer: capability inventory (Oppa)

The record of what the app (v10, built 3 Oct 2026) can do, collected independently by driving the built page and
reading its panels, menus, knobs, lenses and views, plus the docs. It covers what the app does, not how the code does it.

**Conventions.** Each entry has a name, the trader's question, then **K** (knobs and inputs, by name), **O** (outputs),
**@** (where it lives today: tab > junior tab > panel) and **≈** (siblings that answer the same or a nearly identical
question elsewhere). Tabs are abbreviated: **Cmp** = Compare A vs B (junior tabs *Comparison*, *Capture*, *Market
facts*); **Cpd** = Compounding (junior tabs *Weeks*, *Stress*, *Credit kept*). "Dock" = the Positions dock (Cmp) and
"Runs dock" = the Compounding dock. IDs (e.g. `L4`) let the overlap section point back.

Groups (by the trader's question, not by tab):

- **D.** What exactly am I trading? (definition inputs)
- **M.** What does the market quote?
- **C.** What do I collect?
- **P.** How likely is it to pay?
- **E.** What is it worth on average?
- **L.** What can I lose, and where?
- **T.** How does it behave before expiry?
- **G.** What are its sensitivities right now?
- **S.** Which strikes and which expiry?
- **K.** How much of the credit do I really keep?
- **X.** How should I manage it once it is on?
- **Z.** How big should it be?
- **R.** What happens if I repeat it, cycle after cycle?
- **W.** What happens to an account that runs it weekly?
- **Q.** What happens in a crash or a squeeze?
- **V.** Which vol am I assuming?
- **Global settings**, **Interactions**, **Persistence and export**, **Notices and faults**, **Colour semantics**,
  **Explanations**
- **Overlaps and near-duplicates**

---

## D. What exactly am I trading? (definition inputs)

**D1 Two positions, A and B.** *What two trades am I comparing?*
K: one editor per side (A box on top, B box below). O: a head per box with the name ("RAM 20 Nov · short strangle
13 / 20"), net credit and Copy order. @ Cmp > Dock. ≈ Cpd runs A and B (D20), with a different editor and a different
way of linking.

**D2 Instrument.** *Which underlying?* K: RAM or KORU per side. O: chain, spot, smile and leverage loaded. @ Cmp > Dock
> Instrument. ≈ Cpd Run > Ticker (D21). The Overview's "Set as A/B" also sets it (S2).

**D3 Expiry.** *Which listed date?* K: the expiry list with days left (16 Oct 15d … 19 Mar '27 169d); for B, Expiry
mapping (use the nearest date, or mark B n/a). O: the days, plus a flag when B lacks A's date. @ Cmp > Dock > Expiry.
≈ Cpd Cadence weekly/monthly (D21); Overview's per-expiry rows (S2).

**D4 Structure.** *Straddle or strangle?* K: Straddle | Strangle; "turn the straddle into a flat-topped strangle".
O: one or two strikes. @ Cmp > Dock > Structure. ≈ Cpd Strategy: covered calls | strangle (+ covered strangle) (D21).

**D5 Legs together or detached.** *Do put and call move as one?* K: together | detached; make symmetric. O: one or two
placement controls. @ Cmp > Dock > Legs (with knob).

**D6 Strike placement basis and targets.** *How far out are the strikes?* K: Strikes by Δ | % OTM | σ; put & call
target (e.g. 30 / 30Δ), straddle centre (ATM or a value); slider with marks for put ATM, call ATM and "B end" (where B's
chain ends); arrow keys step one listed strike. O: target → landed strikes ("30 / 30Δ → 13P · 20C"); flags when the
chain ends or the strangle had to widen. @ Cmp > Dock > Strikes by / put & call. ≈ Cpd Call Δ / Put Δ sliders (Δ only,
"Week 1: $24C") (D21); Smile click-to-place (M5); Sweep (S1) varies the same value.

**D7 Protective wings.** *Do I buy a wing?* K: Protective call off/on (+ placement), Protective put off/on. O: long-wing
legs and their debit; flags when n/a or inside. @ Cmp > Dock. ≈ Cpd Protection: call wing Δ, put wing Δ (D21);
Overview "with and without wings" (S2); Sweep "Vary: Protective call" (S1).

**D8 Fill mode.** *At what price did I trade?* K: mid | natural (sell at bid, buy at ask; natural also pays half the
spread to close before expiry). O: credit, all readings. @ Cmp > Dock > Fill. ≈ Cpd Costs "Fill: give up x of the
half-spread" (D24); Manage's "natural pays half the spread to close" (X1).

**D9 Typed fills.** *What did I actually get?* K: "Credit got" net per share (split over the sold legs by mid), or
"per-leg prices ▸" with a price per leg; Back to mid. O: credit, margin, payoff, EV, view code use your fill; a ✎ mark;
the same legs at mid and at natural ("mid $255 · natural $240 a contract"); a warning when a typed price no longer
applies (its contract changed). @ Cmp > Dock > Credit got / per-leg prices. ≈ Summary card's ✎ "type the credit"
(C1); Facts' spot ✎ (M1).

**D10 Fill match.** *Can B be filled as well/badly as A, relative to its own mid?* K: "set this side's credit to the
same share of its own chain mid as A's, and keep it so". O: B's fill tracks A's. @ Cmp > Dock > Fill editor.

**D11 Links: B follows A.** *Which aspects of B are its own?* K: a chain beside each B row (click to detach or
relink); editing a linked row detaches it; the toast offers a relink; pills under the cards with ↺ per aspect and
"↺ B follows A again" (relink all). Aspects: instrument, expiry, structure, legs, placement, call wing, put wing,
fill. O: a "set on its own" mark; pills naming every difference ("same position, only the instrument differs",
"same contracts, only the fill differs"). @ Cmp > Dock (chains), Summary (pills). ≈ Cpd "Change in B" (D22), a
different linking model.

**D12 Swap A and B.** *Flip sides.* K: ⇄. O: everything swaps, pins too. @ Cmp > Summary (between cards). ≈ Cpd ⇄
in the run bar (D20).

**D13 Copy order.** *Give me the ticket.* K: button. O: clipboard order ticket: the combo, net limit, mid, natural,
every leg, the quote date. @ Cmp > Dock > box head.

**D14 Summary cards.** *What is being compared, at a glance?* O: per side: ticker · expiry · structure glyph · name;
each leg's credit; net credit (✎ to type); "placed by Δ 30 / 30"; bid × ask per leg. Info knob on the $ convention.
@ Cmp > fixed summary bar (all three junior tabs). ≈ Dock box heads (D1); Facts "contracts in use" (M3).

**D15 Size statement.** *How many B contracts per A contract?* O: one sentence everywhere: "B is sized at 0.71 KORU
contracts per RAM contract (equal vega)". @ Cmp > Summary bottom line, Dock > Pair sizing, chart legends, export,
Method notes. ≈ Z1.

**D20 Compounding runs A and B.** *Which two account strategies am I comparing?* K: run chips (name + key settings,
the differing ones in stronger ink), ⇄ swap, × drop B, "+ compare with a second run" when B is off. O: single-run
mode when B is off. @ Cpd > run bar (all junior tabs). ≈ D1 (Cmp has no single-position mode).

**D21 Run definition.** *What does each run sell?* K: Ticker (KORU | RAM; RAM monthly only), Cadence (Weekly |
Monthly), Strategy (Covered calls | Strangle), Call Δ, Put Δ (week-1 strike shown), Leverage (covered calls) or Margin
used (strangle), More legs (also sell puts: covered strangle), Protection (call wing Δ, put wing Δ; 0 = none).
@ Cpd > Runs dock. ≈ D2–D7.

**D22 B differs in.** *What makes B different from A?* K: Change in B: Strategy | Ticker | Cadence | Strikes; More:
Size | Modus | Vol | Anything ("Anything" gives B its full editor in the dock). O: B's dock shows only the differing
controls ("Same as A, but a different strategy"). @ Cpd > run bar. ≈ D11 (Cmp's per-aspect chains).

**D23 Modus operandi.** *How is the account run, apart from what is sold?* K: Credit after expiry: Reinvest |
Rebalance | Keep as cash; On a margin call: Only what IBKR requires | Back to a target leverage; During a multi-week
move: Keeps trading | Stops at the first move. O: read by Weeks, Stress and Random paths. @ Cpd > Runs dock > Modus
operandi.

**D24 Costs and rates.** *What does trading cost?* K: Fill (give up x of the half-spread), $ per contract, $ per share
of stock, Liquidity (at most N contracts), Strike grid per ticker ($1 | $0.50), Share margin requirement per ticker
(house increase test), Rates (IBKR tiered | flat benchmark %). O: summary "$0.65/contract · $1 strikes · tiered 4%".
@ Cpd > Runs dock > Costs and rates. ≈ Cmp has no commissions; its fill is D8/D9.

**D25 Base scenario.** *Over what horizon and path?* K: Start $, Weeks, Price path (Flat | Line | Points | Growth, at
a price; More: start price, reset to spot, between points same $ | same % each week). O: one path for both runs; a
notice when the path would fall ("the path cannot fall"). @ Cpd > run bar (Weeks, Credit kept); summarised as "Base:
$30k · 52 wk · flat path …" in Stress (click to edit).

**D26 IV path.** *Does implied vol change over the weeks?* K: Flat | Line | Points | Growth; rule: moves keep the gap
to IV | moves stay constant. O: the IV line on the Weeks chart. @ Cpd > Weeks > Over N weeks. ≈ T8 IV shock, Q2 IV after
the move, V2.

---

## M. What does the market quote?

**M1 Quote line and ticker facts.** *What is the data and when?* O: "IBKR option quotes at the 1 Oct 2026 close · spot
RAM 14.45, KORU 21.09 · four expiries each"; per ticker: spot (✎ when typed), period vol with its source, "also:" the
other references (ATM at A's horizon, 52-wk and 260-wk realized). @ Cmp > Market facts; quote line also under the
tabs in Cpd. ≈ V1.

**M2 Expiry table.** *What does each expiry imply?* O: per expiry: days, forward, ATM IV, 1σ move to expiry in % and
in price; A's and B's expiry marked. @ Cmp > Market facts. ≈ Range caption under Chart range ▾ (σ arithmetic).

**M3 Contracts in use.** *What are my legs' markets?* O: per leg of A and B: bid, ask, mid, spread, own IV (* = smile
fit), delta, strike vs forward in % and σ, intrinsic, time value. @ Cmp > Market facts. ≈ Summary card bid × ask (D14);
Dock per-leg prices (D9).

**M4 Skew at the chosen strikes.** *Are my strikes rich or cheap against ATM?* O: each leg's IV vs the ATM IV in
points; put wing over call wing. @ Cmp > Market facts.

**M5 Smile and legs.** *Where do my strikes sit on the smile?* O: per ticker: fitted smile, quote dots, spot and
forward, A and B legs marked (B dashed, + = long wing); click a quote to put a leg on exactly that strike. Axis hover:
IV vs period vol and ATM IV, 1-day, 1-week and to-expiry moves. @ Cmp > Market facts > Smile and legs.

**M6 Spot / IV shift / period vol editor.** *What if spot or IV were different?* K: per ticker (one per side while B
sets its instrument on its own): spot override, IV shift, period vol presets (HV30, ATM at A's horizon, custom with a
slider 1–300% and reference ticks). O: "model quotes" mode (every quote re-priced from the model, said so); the period
vol used everywhere. @ Cmp > Market facts > Edit. ≈ V1; Cpd IV · realized field (V2).

---

## C. What do I collect?

**C1 Net credit.** *How much premium do I take in?* O: net credit per contract and per share, each leg's credit, % of
spot; ✎ when typed. @ Summary cards; Dock box head ("Credit got … /share · $255"); Comparison table "Credit" row (with
A − B and A / B). ≈ Overview Credit column; Sweep "Credit, time value"; Facts time value; Cpd Credit collected (W8).

**C2 Time value vs cash credit.** *How much of it is really premium?* O: credit − intrinsic; ITM legs flagged; ratios
use time value. @ Comparison table knob; Overview/Sweep switch label to "Credit, time value"; Facts columns.

**C3 Credit per σ.** *How many expected moves of cushion does it buy?* O: credit ÷ (spot × ATM IV × √T), size-free.
@ Comparison table (more rows); Overview "Credit/σ". ≈ Capture Expected ≈ 1 − period vol / IV (K2).

**C4 Credit per day.** *What decay does it earn per day if nothing moves?* O: time value ÷ days. @ Comparison table
(more rows); Overview "Credit per day". ≈ Greeks Theta (G1); Time decay lens (T3).

**C5 Credit / margin.** *What is the return on capital if it expires worthless?* O: time value ÷ approximate margin.
@ Comparison table (more rows); Overview "Credit / margin". ≈ Recovery "best case" growth (R1) — the knob says so.

**C6 Margin (Compare).** *How much capital does it tie up?* O: approximate Reg-T margin (20% × leverage, naked side,
spread width with a wing). @ Comparison table "Margin" row. ≈ Cpd house margin (W6, D24) — a second, different margin
model.

---

## P. How likely is it to pay?

**P1 Profit odds.** *How often does it end in profit?* O: P&L above 0 at expiry, under the odds switch. @ Comparison
table; Overview "Profit odds". ≈ Capture "Odds of keeping at least x" at x = 0 (K4); Profit zone lens's "odds the
price is inside" (T5).

**P2 Break-even prices and touch odds.** *Where does it start losing, and how likely is the price to get there?*
O: each break-even price, its move from spot, the odds of touching it before expiry. @ Comparison table "Break-even
price". ≈ Payoff overlay breakevens; grid overlay breakevens; Profit zone lens (T5).

**P3 Odds strip and σ marks on the payoff.** *Where is the price likely to end?* K: odds strip, ±1σ ±2σ toggles. O: a
density strip and σ lines under the payoff. @ Cmp > Comparison > Payoff panel. ≈ grid odds strip and σ cones (T7).

**P4 Axis hover odds.** *What are the odds of ending beyond this price or doing at least this well?* O: on the price
axis: σ, move, odds beyond; on P&L axes: every unit and odds of doing at least that well. @ Payoff and other Cmp
charts.

**P5 Odds the day loses.** *How likely is a losing day?* O: per day, at period vol (and the every-day average). @ Payoff
> Decay vs move lens (T4).

---

## E. What is it worth on average?

**E1 Expected value row.** *What is the trade worth?* O: EV per side, A − B; under implied odds it is fill vs mid (0 at
mid) and says so; at period vol a real EV. Better side marked. @ Comparison table "Expected value". ≈ every E entry.

**E2 EV explainer.** *Why is the EV what it is?* O: credit, expected settlement at the vol used, EV, at implied odds
or at the period vol. @ Knob on the EV row. ≈ Capture Expected knob (K2).

**E3 EV map lens.** *Where across prices does the EV come from?* K: day. O: P&L × odds per 1% of move (A as areas, B as
a line), running total to the expected P&L if closed that day; gains vs losses; share of the expected loss from clear
falls and clear rises (beyond 1.5σ). @ Payoff > Lens: EV map. ≈ grid "× odds" view (E4).

**E4 P&L × odds grid.** *Which price columns carry the EV?* K: P&L | × odds. O: grid weighted by each column's odds.
@ P&L through time. ≈ E3.

**E5 EV at period vol across positions.** *Which expiry/structure has the best EV?* O: one value per position. @
Overview "EV at period vol" column/chart. ≈ E1, S1.

**E6 Sweep EV curve.** *How does EV change with placement?* O: EV at period vol against placement. @ Sweep middle
chart (S1).

**E7 Break-even vol.** *At what realized vol is this fill zero-EV?* O: per side, A − B in vol points. @ Comparison
table. ≈ Capture Expected is 0 at the break-even vol (K2).

**E8 EV of a managed trade.** *What is it worth with a take-profit and stop?* O: EV a trade and a day held, managed vs
held, with standard error. @ Manage the trade (X1). ≈ Capture Managed (K5), Credit kept Managed (K11).

---

## L. What can I lose, and where?

**L1 Payoff at expiry / P&L at the chosen day.** *What is my P&L at each price?* K: day slider, IV band (off ±5 ±10),
Extrapolate, odds strip, ±σ marks; chart range. O: A, B and an A − B panel beneath; expiry payoff as a faint line;
move axis with zone colours; hover rows. @ Cmp > Comparison > Payoff panel, Lens P&L. ≈ grid (T7); Joint moves (L3).

**L2 Worst loss in range.** *What is the worst at expiry within a range?* K: within the chart range | its own range
(down/up). O: per side, A / B ratio. @ Comparison table "Worst loss". ≈ Overview "Worst loss in range" (S2); Sweep
"Worst loss" chart (S1); Joint moves worst cell (L3); Recovery hit (R1); Stress (Q1); Manage worst 5% (X1).

**L3 Joint moves.** *What if RAM and KORU move differently?* K: day. O: A − B heat map over every pair of moves (each
in its own σ); worst cell; worst on the same-σ line; same-% dashed curve. @ Cmp > Comparison > Joint moves.

**L4 Worst 5% mean.** *How bad are the bad outcomes?* O: mean of the worst 5% per contract, managed vs held. @ Manage
the trade. ≈ Random paths "worst 5% avg" (W10).

**L5 Pinned scenarios.** *What is the P&L at this exact price and day?* K: click the grid to pin; × to remove; Clear
pins. O: table: scenario (price per instrument, move), day, A, B, A − B; "outside the range" badge; pins survive
changes to A, B, unit, range, swap. @ P&L through time > pins. Exported.

---

## T. How does it behave before expiry?

**T1 Day slider and replay.** *What does it look like on a given day?* K: Days to expiry slider (trading-day stops,
Mondays marked), Replay ◀ ▶ to today / to expiry, speed 1–8 days/s; ← → Home End on the chart. O: chart and table at
that day; title says which day. @ Payoff panel. ≈ grid rows (T7), Joint moves Day (L3).

**T2 Day change lens.** *What did each position make since yesterday at each price?* O: curves and A − B; at unchanged
price: today vs the day before (×), weekend span named. @ Payoff > Lens: Day change.

**T3 Time decay lens.** *How fast does the premium bleed?* K: at a move of %, Extrapolate. O: price to close day by
day vs a straight line; daily decay bars (Mondays carry the weekend); shape (back-loaded/even/front-loaded); share
gone at half the days; share in the last 7 days. @ Payoff > Lens: Time decay. ≈ Capture "Time path" and "Kept with no
move, by day" (K6); Theta (G1); Credit per day (C4).

**T4 Decay vs move lens.** *How big a move wipes out a day's decay?* K: at a move of %. O: per day the up and down move
that cancels decay, against normal-day shading and the period-vol 1σ day; σ multiple; odds the day loses. @ Payoff >
Lens: Decay vs move.

**T5 Profit zone lens.** *Between which prices am I in profit on each day?* O: break-even prices per day inside the
±1σ/±2σ cone; zone width; odds inside. @ Payoff > Lens: Profit zone. ≈ P1, P2.

**T6 Extrapolation.** *What if the last day's pace continued?* K: Extrapolate (P&L and Time decay only). O: dashed
magenta line, "EXTRAPOLATED" mark and legend badge; hint when it cannot draw. @ Lens bar.

**T7 P&L through time grid.** *What is the P&L at every price and every day?* K: align by % of life | same date; P&L |
× odds; Heatmap | Numbers; tab A | B | A − B; Shocks (T8); ⚙ display: grid lines, contours (break-even | levels, step),
overlays (strikes, ±1σ ±2σ, breakevens, spot, odds strip), colour compressed | linear, range full | fixed ±%, one
shared scale; Numbers: columns 9–25, rows every 1–30 days, Copy CSV. O: heat map or table; pins (L5). @ Cmp >
Comparison > P&L through time.

**T8 Shocks after entry.** *What if IV moves after I trade?* K: IV shock (vol points), vol rises as spot falls (points
per −10%), only on the way down, Clear shocks. O: re-marked grid, joint map and pins (not entry, not at-expiry). @ P&L
through time > Shocks. ≈ IV band (L1); Facts IV shift (M6); Stress IV after the move (Q2); Cpd IV path (D26).

**T9 IV band.** *How much does an IV change of ±5/±10 points move the P&L?* O: shaded band and hover rows. @ Payoff >
P&L lens. ≈ T8, Vega (G1).

---

## G. What are its sensitivities right now?

**G1 Greeks now.** *What does it act like now?* O: delta (shares), dollar delta, gamma (shares per 1%), dollar gamma,
theta ($ a day), vega ($ per IV point); columns A per contract, B per contract, B at its pair size, A − B (dollar rows
only across tickers). @ Cmp > Comparison > Greeks now. ≈ Vega row in the table (more rows); Credit per day (C4).

---

## S. Which strikes and which expiry?

**S1 Strike placement sweep.** *How do credit, EV and worst loss change as I move the strikes?* K: Vary: short legs |
put | call | protective call; Smoothing (log slider). O: three charts (credit/time value, EV at period vol, worst loss in
range) for A, B and A − B; ITM shading; dashed marks for the positions as set; typed fill as a ring; "smoothed" badge.
@ Cmp > Comparison > Strike placement sweep.

**S2 Overview of all 16 positions.** *Across both tickers, every expiry, with and without a wing, which is best?* K:
Charts | Table; Set as A / Set as B per row. O: columns Credit, Credit/σ, Credit per day, EV at period vol, Profit odds,
Worst loss, Wing cost · pays back (odds), Credit / margin, Breakevens; best cell per expiry lit; charts by expiry.
@ Cmp > Comparison > Overview (collapsed). ≈ table rows (C, E, L).

---

## K. How much of the credit do I really keep? (capture)

The Compare tab and the Compounding tab each carry a full set of the same presets.

**K1 Share x and the capture table (Compare).** *What share of the maximum payoff does it keep?* K: Share x %; formulas
and details toggle. O: per side the maximum (the credit) and the vol used; table Preset | A | B | A − B. @ Cmp > Capture.
≈ K10.

**K2 Expected (capture).** *What share is kept on average?* O: % of max, plus the market's own odds under it. @ Capture,
Credit kept. ≈ E1/E2 (the knob says the EV row matches it only at period vol).

**K3 Median.** *What does a typical cycle keep?* O: % and the average under it. @ Capture, Credit kept ("does not
compound"). ≈ Cpd "Typical" outcome (W2).

**K4 Odds of keeping at least x.** *How often do I keep x or more?* O: odds, the price band that keeps x, profit odds;
a curve of odds vs x. @ Capture (row + "Odds of keeping at least x" chart), Credit kept. ≈ P1.

**K5 Managed (capture).** *What is kept with the take-profit/stop rule?* O: % kept, share closed at take profit, per
day held. @ Capture (uses Manage the trade's rule). ≈ X1; K11 (own rule).

**K6 Time path.** *What is kept if the price does not move?* O: % half-way; day x is reached; a chart of kept-with-no-
move by day. @ Capture, Credit kept. ≈ T3.

**K7 Growth (capture).** *What fixed share compounds like the real outcomes?* O: equivalent share or "ends at zero",
with wipe-out frequency, growth without wipe-outs, and the size that survives (≤ 0.19× this size, capital a contract,
× margin). @ Capture (on the Recovery panel's capital), Credit kept. ≈ R1, Z2, Z3.

**K8 Empirical.** *What would past moves have kept?* K: pasted daily closes per ticker (decimal commas, odd jumps
flagged, a strip of daily moves coloured). O: share kept, or "needs closes (N)". @ Capture (paste box), Credit kept
(reads the same closes).

**K9 Fixed share.** *What if I assume "half the credit"?* O: x, and how often it is actually kept. @ Capture, Credit
kept.

**K10 Credit kept per cycle (Compounding).** *What does each cycle keep, and what does that compound to?* K: Share x,
Managed take profit % · stop %, formulas toggle; click a row for its chart. O: per run: cycle-1 legs, max per share,
pricing IV vs moves, credit % of NAV, fill loss; table Preset | kept | NAV week N (Fixed, Expected, Median, Odds,
Managed, Time path, Growth, Empirical, Your variant, Full model, Exactly on the path). @ Cpd > Credit kept.

**K11 NAV if every cycle kept.** *What NAV path does a preset give?* K: preset (Growth, Expected, Fixed share, Managed,
Your variant). O: NAV line per run with the full model dashed. @ Cpd > Credit kept.

**K12 Your variant (capture).** *What if I use my own odds, a gap, or another reading?* K (Cmp): Odds from period vol
| ATM IV | typed; Gap % a cycle of % down | either way; Read as average | median | percentile; Exit at expiry | early.
K (Cpd): Odds from realized vol | pricing IV | typed; Gap; Read as. O: kept, $, odds of keeping x, and a dashed curve.
@ Capture > Your variant; Credit kept > Your variant (no Exit there).

---

## X. How should I manage it once it is on?

**X1 Manage the trade.** *Does a take-profit/stop help?* K: take profit % of credit, stop at a loss of % of credit.
O: per side: take profit hit (share, day), stop hit, held to expiry, days held, EV a trade and a day (managed vs held,
± s.e.), win rate, worst 5% mean. @ Cmp > Comparison > Manage the trade. ≈ K5, K11 (its own take-profit/stop), K12 Exit
early; Cpd "Stops at the first move" (D23).

---

## Z. How big should it be?

**Z1 Pair sizing.** *How many B per A?* K: Size B: Auto | Equal notional | Equal credit | Equal vega | Equal worst loss
| Equal margin (approx.) | Custom (B contracts per A). O: the size statement (D15); clamps and fall-backs said in
words. @ Cmp > Dock > Pair sizing. ≈ Cpd "Size" in B differs (D22), leverage/margin used (D21).

**Z2 Recovery's size that survives.** *At what size does the hit not wipe me out?* O: "≤ 0.61× this size", the loss as
% of margin and notional, the capital needed per contract and its multiple of margin. @ Cmp > Comparison > Recovery
dynamics. ≈ K7; Z3.

**Z3 Margin-call-safe size (Compounding).** *What leverage keeps margin-call odds at 10% or less?* O: "odds at 10% or
less: 1.05× leverage or lower (9% there)" / "35% of margin used or lower". @ Cpd > Weeks headline. ≈ Z2, K7, W7.

**Z4 Leverage sweep.** *How do NAV and margin-call odds change with leverage?* K: run A | B. O: typical NAV at week N
vs leverage or margin used, reinvest solid vs rebalance dashed, margin-call strip, ceiling marked. @ Cpd > Weeks.

---

## R. What happens if I repeat it, cycle after cycle?

**R1 Recovery dynamics.** *How many cycles does one bad hit cost?* K: The hit: a price move (kσ; worse side | down |
up) | a fixed loss %; Growth after the hit: if no repeat | average | best case | typed; Measured on ▾: hit as % of NAV
when it lands | starting capital; capital per position margin | notional; typed growth % a cycle. O: per side: the
size that survives (Z2), cycles needed vs hit size (curve, capped at 60), recovery = buffer note, the chance of no such
hit over the recovery (amber below 50%), other rates in the tooltip. @ Cmp > Comparison > Recovery dynamics. ≈ K7,
W1, W10.

---

## W. What happens to an account that runs it weekly?

**W1 Weeks headline.** *Where does the account end up?* K: Outcome ▾ Typical | Average. O: per run: typical (or
average) NAV at week N with ×multiple; 10%–90%; margin call within N wk (on drops | either way, ▲ high); the safe size
(Z3); shares · lots or contracts; average · exactly on the path; the run's settings line. @ Cpd > Weeks.

**W2 Over N weeks.** *How does it unfold?* K: ⚙ chart display: 10–90% band off | A | B | both; exactly on the path
(dashed); realized-move band on the price. O: price path and strikes with a band; IV path; NAV (typical, band, KORU
held with no loan); shares and contracts. @ Cpd > Weeks.

**W3 Growth, week N card.** *Where does one cycle's return come from?* K: run A | B; ◀ ▶ week. O: formula R = λ(g +
c(y − e)) + (1 − λ)rT with each term, the path return and the average; edge kept; odds the call ends ITM; credit on
the typical account and what it buys; a leverage note. @ Cpd > Weeks.

**W4 Credit collected.** *How much premium comes in over the weeks?* O: cumulative credit averaged over outcomes, per
run. @ Cpd > Weeks. ≈ C1.

**W5 Margin call so far.** *How likely is a margin call by week N?* O: share of outcomes with at least one call by
each week. @ Cpd > Weeks. ≈ W1, Z4 strip, Q1, W10.

**W6 Week by week table.** *What happens each cycle?* K: run A | B; Copy CSV; click a row to pin its week. O: week,
expiry, days, price, move (when the path moves), strikes, Δ, % away, premium, time value, shares, lots, NAV typical,
10%, 90%, average, credit, margin call so far, cushion, typical λ. @ Cpd > Weeks (collapsed).

**W7 Random paths.** *Does a simulation agree with the engine?* K: Paths 1,000 | 2,000 | 5,000; Seed; new seed; Run
(opt-in; goes stale on change). O: fan chart (median, 25–75, 5–95) against the engine's track; table 5%, 10%, median,
90%, 95%, worst 5% avg, drawdown median/90%, ≥ 1 margin call ± s.e., NAV ≤ 0; check vs engine. @ Cpd > Stress.

**W8 Exactly on the path.** *What if the price followed my path exactly?* O: NAV with every credit kept. @ Weeks
headline; Credit kept row; Weeks chart (dashed).

---

## Q. What happens in a crash or a squeeze?

**Q1 Stress move.** *What does one bad move do to the account?* K: Move: Gap | Run (k weeks, Monday gaps | spread) |
Drawdown (over n weeks) | Spike (back after n sessions); size %; ETF | index (index converted through the daily
reset); Hits in week (worst | a chosen week). O: per run: before the move (NAV, leverage, margin used), at the low, end
of the move, margin call (day, price, what was sold or bought back), upside given up, room this week. @ Cpd > Stress.
≈ L2, R1 (other worst-loss forms).

**Q2 IV after the move.** *What happens to IV in the move?* K: points per 10% drop, per 10% rise, cap. O: "IV → 173%";
marks open legs and margin. @ Stress > IV ▾. ≈ T8.

**Q3 Rules of the move.** *How does the break play out?* K: lands on Mon–Fri; forced-sale fills (shares −%, options
mark + × half-spread); share maintenance after the move. @ Stress > Rules ▾.

**Q4 Loss by the week the move hits.** *When is the account most exposed?* O: change in NAV in $ and in % by week, amber
ring = margin call, red dot = wiped out; click a week to inspect. @ Stress.

**Q5 Room before a margin call and before NAV 0.** *How big a gap can the account take, week by week?* O: largest
one-session gap for margin call (solid) and NAV 0 (dashed), drops and rallies, index equivalent; historical references
(worst open gap, worst week low). @ Stress.

**Q6 Loss against the size of a gap.** *How does the loss scale with the gap?* O: NAV change vs gap −90%…+100% per
run, chosen gap marked. @ Stress.

**Q7 What happened.** *Where did the loss come from?* O: NAV before, shares, options and cash, forced-sale fills, NAV
after. @ Stress.

---

## V. Which vol am I assuming?

**V1 Period vol (Compare).** *What vol do I expect the stock to realize?* K: per ticker, HV30 default, ATM, custom (M6).
O: drives every EV, recovery, capture, manage and (under the switch) the odds; the label "vol 117% (HV30)". @ Cmp >
Market facts > Edit. ≈ V2 (the same number, named "realized moves").

**V2 IV · realized (Compounding).** *What vol prices the options, and what vol moves the price?* K: per ticker: implied
vol (this tab's own; weekly/monthly today references), realized moves (= the period vol, shared; references HV30, ATM,
52-wk, 260-wk, 0 = exactly on the path); a B-only override while B differs in vol. @ Cpd > run bar ▾. ≈ V1, M2 (ATM
IV), D26.

**V3 Odds basis.** *Implied or my vol?* K: Odds: implied | period vol. O: drives profit odds, odds strips, the grid's
column odds and the EV row; caption lists what it does not drive. @ Cmp > Chart range ▾ > Reading. ≈ K12 "Odds from";
Cpd always uses realized.

---

## Global settings

- **Chart range**: down/up, in σ | % | price; Symmetric; captions with prices in view and σ arithmetic. @ Cmp summary.
- **P&L units**: % of A's notional | $ per A contract | × A's credit | % of A's margin (falls back with a note). @ Chart
  range ▾ > Reading. Cpd always shows $ and %.
- **Odds basis**: V3. **Period vol**: V1/V2. **Worst-loss range**: L2's own range.
- **Theme**: Auto | Light | Dark. @ Theme · share · export ▾.
- **Dock visibility**: Positions Hide/rail; Runs Hide/Show runs.
- **Panel hide ▾**: every panel collapses, remembered in this browser.
- **Reset**: this tab | both tabs (only "both" resets the period vol).

## Interactions

- Tabs: parent (Compare A vs B | Compounding), junior strip per tab; pinned cards close on tab switch.
- Replay and day stepping (T1); ← → Home End on the payoff; arrow keys step listed strikes on a focused strike slider.
- Pins on the grid (L5); click a week row to pin it (W6); click a week on the Stress chart to inspect it (Q4); click a
  Credit kept row to chart it (K11); click a smile quote to place a leg (M5); Set as A/B from the Overview (S2).
- Axis hover on every Cmp chart and Cpd chart (meaning of the coordinate); sticky cursor with values on every Cpd
  chart; hover rows on the payoff; tooltips with full text where text is cut.
- Knobs (i): hover shows, click pins (several at once), ×/Escape/second click closes.
- Copy order (D13), Copy CSV (grid numbers; week by week), Copy view code.
- Single-run mode in Cpd (drop B / add B).
- Keyboard focus ring on every control.

## Persistence and export

- **View code**: both tabs, this exact setup; copy; load a pasted code; also kept after # in the address (bookmark);
  older codes (v5, v7–v9) load and migrate (with notes).
- **Stored view**: the page remembers its state in this browser.
- **Markdown export** per tab: Copy, Download .md, Sections ▾. Compare: Header, Comparison, Assumptions, Results
  (+ Greeks), Recovery dynamics, Payoff lens, Capture, Pinned scenarios, Overview table, Notes. Compounding: Runs,
  Base, Result, Credit kept, Week by week, Stress, Random paths. (Manage, Sweep, Joint moves have no section.)

## Notices and faults

- Placement flags: chain end, widened to keep a strangle, only one strike, far target, coarse/gapped grid, expiry
  mapped / n/a, wing n/a / inside, conversion reset, early assignment risk, mid below intrinsic, no IV at the mid,
  model quotes, override, unlinked.
- Fill: typed price no longer applies (warning).
- Period vol floored/capped; loaded view rescaled the vol (notes).
- Toasts: Copied / Clipboard blocked; relink offer; "the path cannot fall"; "RAM lists monthly options only".
- Faults: storage refused (private window), stored view did not load, bad view code, a value clamped, a step that
  failed (state kept).
- Readings that cannot compute say why ("needs closes", "a net debit has no credit to manage", "wiped out", "no
  values"); Random paths "inputs changed: run again"; "outside the range" on pins.
- Honesty flags: amber chance of no such hit, ▲ high margin-call odds, "ends at zero".

## Colour semantics

- A purple, B orange, A − B teal (also the accent), magenta second accent (extrapolation).
- P&L green gains / red losses (validated for colour blindness), contour = break-even.
- Market moves: up green, down red, notable yellow, flat grey (under 0.5σ flat, to 1.5σ notable, beyond clear) on the
  move axis, hover, pasted closes, week table.
- Better side per row marked; best cell per expiry lit in the Overview.
- Amber: margin-call rings, honesty line; red dot: wiped out; red "At the low" on a loss.

## Explanations

- Method and caveats: Compare (instruments, forward, placement, wings, linking, smile, marks, fills, odds, σ, credit,
  margin, sizing, not modelled); Weeks (path, strikes, IBKR margin, modus, bands, not modelled); Stress (account hit,
  sessions, index conversion, KRX halts, not modelled).
- notes ▸ on Manage, Sweep, Recovery; captions under each chart.
- Knobs on every comparison row, Greeks names (dotted underline), Capture/Credit kept presets, Weeks headline, Stress
  cells, Recovery rates and honesty, Manage method, EV explainer.
- "Show formulas and details" on Capture and Credit kept (formula per preset plus a second line per cell).
- Range ▾ captions (σ arithmetic, what the odds switch governs); Facts footnote (what the ATM IV and the period vol
  set).

---

## Overlaps and near-duplicates

Each cluster is a set of capabilities that answer the same, or nearly the same, question in different places, under
different names or in different forms.

1. **Expected value (≥ 12 forms).** E1 "Expected value" row (switch-dependent: fill vs mid under implied); E2 EV
   explainer; E3 EV map lens "expected P&L"; E4 grid "× odds"; E5 Overview "EV at period vol"; E6 Sweep "Expected
   value at period vol"; K2 Capture "Expected" (% of max, market's own odds under it); K12 variant "average"; K10 Credit
   kept "Expected" (+ average NAV); X1 "EV a trade · managed / held"; R1 growth "average"; E7 break-even vol (where EV
   = 0); W1 "Average" NAV; W3 "R̄". Names: expected value, EV, expected P&L, Expected, average.
2. **Worst loss / tail loss (≥ 10 forms, 4 scales).** L2 Worst loss row (σ chart range or own range, at expiry); S2
   Overview worst loss; S1 Sweep worst loss; L3 Joint moves worst cell / worst on same-σ line; T7 grid; X1 / L4 worst
   5% mean; R1 the hit (kσ on own expiry, or a fixed % loss); Q1 Stress move (% gap, ETF or index, run, drawdown,
   spike) with at the low / end of the move; Q5 room before margin call / NAV 0; Q6 loss vs gap; W7 worst 5% avg and
   drawdown; W1 10%–90%. Compare speaks σ at expiry; Recovery kσ to its own expiry; Stress % gaps in sessions;
   Compounding percentiles.
3. **How big can it be (survival size, 3+ forms).** Z2 Recovery "size that survives this hit ≤ 0.61×" + capital per
   contract; K7 Capture/Credit kept Growth "survives with wipe-out odds under 1 in 20,000 at ≤ 0.19×"; Z3 Weeks "odds at
   10% or less: 1.05× leverage or lower"; Z4 leverage sweep; Z1 pair sizing (relative only). Different tests (a hit,
   wipe-out odds, margin-call odds), different words.
4. **Margin and margin calls (two models).** C6 Compare approximate Reg-T margin, C5 credit/margin, units "% of A's
   margin", Recovery capital = margin; vs Compounding house margin (25% × leverage, Reg T × leverage for naked legs),
   D24 margin override, W1 "Margin call within N wk", W5 margin call so far, Z4 strip, Q1 margin call in the move, Q3
   share maintenance after, Q5 room, W7 "≥ 1 margin call". Compare has no margin-call reading at all.
5. **Capture vs Credit kept (one concept, two builds).** K1–K9/K12 on Compare > Capture and K10–K12 on Compounding >
   Credit kept: the same presets with different headers, a different variant (Cmp "Odds from period vol/ATM IV/typed",
   Exit; Cpd "realized vol/pricing IV/typed", no Exit), and a different Managed rule source (Cmp borrows Manage the
   trade's; Cpd has its own take-profit/stop). Empirical closes pasted in Cmp feed Cpd.
6. **Managed trade (4 places).** X1 Manage the trade; K5 Capture Managed; K10/K11 Credit kept Managed (own knobs); K12
   variant "Exit early"; D23 "Stops at the first move" / strangles closed at the trigger.
7. **Compounded growth (5+ forms).** R1 growth after the hit (if no repeat / average / best case / typed); K7 Growth
   (fixed share that compounds alike); K10 Growth row "typical NAV (log-average)"; W1 typical NAV ×multiple; W7 random
   median; C5 credit/margin "= Recovery best case"; W3 growth card R. Capital basis differs: Recovery margin|notional
   (K7 borrows it), Compounding start $.
8. **Time decay (6 forms).** T3 Time decay lens; K6 Time path + "Kept with no move, by day"; G1 Theta; C4 Credit per
   day (+ Overview); T2 Day change; T4 Decay vs move; X1 days held.
9. **Odds of a good outcome (7+ forms).** P1 profit odds (table, Overview); K4 odds of keeping ≥ x (profit at x = 0);
   T5 odds inside the zone; P2 touch odds; P3/T7 odds strips; P4 axis odds; P5 odds the day loses; R1 q and the
   chance of no such hit; X1 win rate; K9 "actually kept that often".
10. **Vol in many names.** "period vol" (Cmp) = "realized moves" (Cpd) = "realized vol" (Credit kept variant) = "moves"
    (Credit kept header): one number; "ATM IV" (Cmp) vs "Implied vol, % (prices every option)" / "pricing IV" (Cpd, a
    separate tab-local number); references listed twice (M1 "also:" and V2 chips); vol edits in M6 Edit and V2 field.
    IV changes: M6 IV shift (re-prices entry), T8 IV shock and skew rule (after entry), T9 IV band (±5/±10), Q2 IV after
    the move, D26 IV path.
11. **Odds basis switches (3).** V3 global Odds implied | period vol; K12 Cmp variant Odds from period vol | ATM IV |
    typed; K12 Cpd variant realized vol | pricing IV | typed. EV readings ignore V3 everywhere except the EV row.
12. **A vs B definition (two editors, two link models).** D1/D11 Positions dock with per-aspect chains, pills and
    relink; D20/D22 Runs dock with "Change in B" categories and "Anything". Swap exists in both; drop B only in Cpd.
13. **Strike placement (5 places).** D6 dock Strikes by Δ/%/σ; S1 Sweep; S2 Overview; M5 smile click; D21 Cpd Δ-only
    sliders on a $1/$0.50 grid; D22 "Strikes" as a B difference.
14. **Wings (4 places).** D7 dock protective call/put; S2 Overview with/without wing, wing cost, pays back; S1 vary
    protective call; D21 Cpd protection call/put wing Δ.
15. **Fill cost (5 forms).** D8 mid/natural; D9 typed fills; D10 fill match; D24 give up x of the half-spread; K10 "x%
    of it lost to the fill"; Q3 forced-sale fills; X1 natural pays half the spread to close.
16. **Credit metrics.** C1 net credit (cards, dock head, table); C2 time value (table, Overview, Sweep, Facts); C3
    credit/σ; C4 per day; C5 credit/margin; W4 credit collected; K10 credit % of NAV; W3 premium y.
17. **Price-move scales.** Chart range in σ | % | price; worst-loss range; R1 kσ to its own expiry or fixed %; Q1 % of ETF
    or index; T3/T4 "at a move of %"; S1 Δ axis; move-zone colours in σ of a day or of the days since entry.
18. **Results-reading words.** Cpd Outcome Typical | Average; K3 Median vs K2 Expected; K12 Read as average | median |
    percentile; W1 10%–90%; W7 5/10/50/90/95 percentiles.
19. **Explanations in several forms.** Three Method and caveats panels; notes ▸; knobs; "show formulas and details"; the
    W3 formula card; range-menu captions; chart captions.
20. **Copy/export in several forms.** Copy order; two Copy CSV buttons; Markdown export (per tab, sections, not every
    panel); view code / address hash.
