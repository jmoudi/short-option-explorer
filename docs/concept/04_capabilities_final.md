# The options lab: final capability list (04)

Status: final. Author: Oppa. Inputs: 05_brief_for_oppa.md (the instruction), 03_grand_concept_fable.md (final),
01_capabilities_envoy.md, 02_capabilities_oppa.md, the v10 page and source (for defaults).

Every capability of 01 and 02 appears once below, under its new home, or in the cut list (section 6). Old ids always
carry their list: `01.A1`, `02.D1`. New ids are `<page>.<n>`. Defaults are in brackets; where v10 had a default, it is
v10's. Section 7 maps every old id.

**Marks.** new · kept · merged (from old ids) · renamed (from old name) · demoted (from where, to where) · cut (why).

**Entry lines.** Answers · Knobs · Outputs · Place · Reads (sidebar cards and clock; for a reading also "day one", the
structures it reads and which of them need new math, marked **new**) · From.

**Names added** (not in 03 §4.1; for Fable's glossary)
- **Card head**: the top of the A and B cards (name line, legs with quote and fill, net credit, Copy order).
- **Summary line**: the one line a collapsed card shows.
- **B differs**: the one sentence under B's head naming every detached aspect.
- **Size statement**: the sentence that gives the pair size ("B is sized at 0.71 KORU contracts per RAM contract").
- **Copy order**: the order ticket on the clipboard.
- **Modus**: credit after expiry, on a margin call, during a move (part of "on the account").
- **Capital**, **Costs**, **Liquidity**, **Strike grid**, **Rates**: the Account card's rows.
- **Spot override**: a typed spot per ticker (Assumptions "more").
- **Past closes**: the pasted daily closes that feed "odds from past closes".
- **Close early**: the time part of the exit rule (n days before expiry).
- **Reference vols** and **use**: the vols on Market that can be written into Assumptions.
- **Lens switch**; **Pins table**; **Overlays**.
- **x**: the threshold of "odds of at least x" and of "every cycle keeps x".
- **Days held**; **How it ends** (closed at take profit, at stop, held to expiry); **Worst 5%**; **Touch odds**.
- **Metric**, **Vary**, **Smoothing**: the Placement controls; **Placement table**: the old overview.
- **Expiries**: Market's table per listed date.
- **Smile**, **Skew**, **Contracts in use**: Market's facts.
- **Upside given up**, **Deficit**, **What happened**: Loss readings.
- **Ceiling**: a survival test drawn on the Size chart.
- **1σ band**: the price path's band of one period-vol move either side (Weeks).
- **Credit collected**, **Margin call so far**, **Growth card**, **Week table**: Weeks readings.
- **Fan**, **Engine check**: Paths readings.
- **Caption**: the one line under a large graphic.

**Combinations read on day one.** Per 05 §4 and open question 3 of 03: every structure is read at both scales until the
user answers. New math falls in four places, flagged in each entry: (1) covered call and covered strangle at the trade
scale; (2) straddle, wings by % OTM or σ, placement by % OTM or σ, mid / natural / typed fills at the account scale;
(3) "odds from past closes" and "odds from implied" outside the readings that had them (v10: the per-cycle presets only; Weeks always
used period vol); (4) the exit rule (managed) on the account scale, and "at the low / at the end" of a multi-session
shock at the trade scale.

---

## 1. Sidebar cards

The only definition area, on every page. Five cards: A, B, Account, Assumptions, Shock. The cards a page reads are open,
the others show their summary line; any card opens anywhere, and the choice is remembered (Menu.3).

### 1.1 A and B (one card type)

**Card.A.1 Instrument** — **merged** (from 02.D2, 02.D21 ticker, 01.A5 add an instrument)
Answers: which underlying does this trade sell?
Knobs: instrument: RAM | KORU | one the user added by pasting a chain (paste box; name) [A: RAM, B: KORU].
Outputs: the chain, spot, smile and leverage (RAM 2×, KORU 3×) loaded; the card head's name line.
Place: sidebar card A / B (core).
Reads: Market (the listed chains).
From: 02.D2, 02.D21, 01.A1, 01.A5.

**Card.A.2 Expiry** — **kept**
Answers: which listed date?
Knobs: expiry: the listed dates with days left (16 Oct 15d … 19 Mar '27 169d) [v10's]. The trade scale reads this date;
the account scale reads the cadence (Card.A.12) and re-lands each cycle.
Outputs: days left; B's mapping flag (Card.B.4).
Place: sidebar card A / B (core).
From: 02.D3.

**Card.A.3 Structure** — **merged** (from 02.D4, 02.D21 strategy and more legs)
Answers: what do I sell?
Knobs: covered call | straddle | strangle [strangle]; on a covered call: add puts (off | on) [off], making a covered
strangle; on a straddle: "turn into a flat-topped strangle" (action).
Outputs: one or two short strikes, plus shares on a covered call.
Place: sidebar card A / B (core).
Reads: day one: covered call at the trade scale **new**; straddle at the account scale **new**.
From: 02.D4, 02.D21, 01.A4.

**Card.A.4 Placement** — **merged** (from 02.D6, 02.D21 call Δ and put Δ)
Answers: how far out are the strikes?
Knobs: by Δ | % OTM | σ [Δ]; one target for both legs when together (e.g. 30 / 30Δ) [30Δ]; straddle centre ATM | a
price [ATM]; slider with marks for put ATM, call ATM and B end (where B's chain ends); arrow keys step one listed
strike; a quote clicked on Market places a leg on that strike.
Outputs: target → landed strikes ("30 / 30Δ → 13P · 20C"); at the account scale, week 1's strikes ("week 1: $24C");
flags (Card.A.11).
Place: sidebar card A / B (core).
Reads: Market; Account (strike grid, account scale). Day one: % OTM and σ at the account scale **new**.
From: 02.D6, 02.D21, 01.A1, 01.A4.

**Card.A.5 Legs** — **demoted** (from a dock row, to the card's "more")
Answers: do put and call move as one?
Knobs: together | detached [together]; make symmetric (action).
Outputs: one placement control, or one per leg.
Place: sidebar card A / B (more).
From: 02.D5, 01.A1.

**Card.A.6 Wings** — **renamed** (from "Protective call / put", "Protection"), **demoted** (from a dock row, to "more")
Answers: do I buy a long call or a long put beyond the short legs?
Knobs: call wing off | on [off], its own basis (Δ | % OTM | σ) and target; put wing the same [off].
Outputs: the long legs and their debit on the card head; flags when n/a or inside the short strike.
Place: sidebar card A / B (more).
Reads: day one: wings by % OTM or σ at the account scale **new**.
From: 02.D7, 02.D21, 01.A1, 01.A4.

**Card.A.7 Fill** — **demoted** (from a dock row, to "more")
Answers: at what price did I trade?
Knobs: mid | natural [mid]. Natural sells at the bid, buys at the ask, and pays half the spread to close before expiry
(managed exits).
Outputs: the fill per leg on the card head; the credit and every reading.
Place: sidebar card A / B (more).
Reads: day one: fills at the account scale **new** (they replace the old give-up share; Card.Acct.3 keeps the cost row).
From: 02.D8, 01.A1.

**Card.A.8 Typed fills** — **demoted** (from a dock row, to "more")
Answers: what did I actually get?
Knobs: credit got (net per share, split over the sold legs by mid) | per-leg prices (one per leg); back to mid (action).
Outputs: ✎ on the net credit; "mid $255 · natural $240 a contract"; a note-colour warning when a typed price no longer
applies (its contract changed); typed fills travel in the view code.
Place: sidebar card A / B (more).
Reads: day one: at the account scale **new** (the typed share of mid carried to every cycle).
From: 02.D9, 02.D14 (✎ type the credit), 02.Notices.fill, 01.A1.

**Card.A.9 Card head and summary line** — **merged** (from 02.D1 box head, 02.D14 quotes, 02.D20 run chips, 01.G3)
Answers: what is this trade, as filled?
Knobs: none (a fact and the definition; no calculation).
Outputs: the name line ("RAM 20 Nov · short strangle 13 / 20"); each leg with its quote (bid × ask, in the fact style)
and the fill got; the net credit per contract and per share (✎ when typed); Copy order (Card.A.10); placement flags
(Card.A.11). Collapsed: one summary line, the settings that differ from the other card in stronger ink.
Place: sidebar card A / B (head).
From: 02.D1, 02.D14, 02.D20, 02.C1 (credit on the head), 01.A1, 01.B1, 01.G3.

**Card.A.10 Copy order** — **kept**
Answers: give me the ticket.
Knobs: Copy order (action).
Outputs: an order ticket on the clipboard: the combo, net limit, mid, natural, every leg, the quote date; toast
"Copied" or "Clipboard blocked".
Place: sidebar card A / B (head).
From: 02.D13, 01.I.copy.

**Card.A.11 Placement flags** — **kept**
Answers: did the strikes land where I asked?
Outputs: chain end; widened to keep a strangle; only one strike; far target; coarse or gapped grid; expiry mapped / n/a;
wing n/a / inside; conversion reset; early assignment risk; mid below intrinsic; no IV at the mid; model quotes;
override; set on its own.
Place: sidebar card A / B, beside the row each concerns.
From: 02.Notices.flags, 01.I.notices.

*On the account (inside "more ▸")*

**Card.A.12 Cadence** — **demoted** (from the runs dock, to "more › on the account")
Answers: how often is it sold again?
Knobs: weekly | monthly [weekly]; RAM lists monthly options only (weekly locked, toast says why).
Outputs: the cycle length every account reading uses.
Place: sidebar card A / B (more).
From: 02.D21, 01.A4.

**Card.A.13 Size on the account** — **demoted** (from the runs dock, to "more › on the account")
Answers: how much of the account does it use?
Knobs: leverage for shares (covered call, covered strangle) [1.2×]; margin used for options (straddle, strangle) [50%].
Outputs: shares · lots or contracts at week 1.
Place: sidebar card A / B (more). Read by Weeks, Paths, Loss (account rows), Recovery; swept on Size.
From: 02.D21, 01.A4.

**Card.A.14 Modus** — **renamed** (from "Modus operandi"), **demoted** (from the runs dock, to "more › on the account")
Answers: how is the account run, apart from what is sold?
Knobs: credit after expiry: reinvest | rebalance | keep as cash [reinvest]; on a margin call: only what IBKR requires |
back to a target leverage (target) [only what IBKR requires]; during a multi-week move: keep trading | stop at the
first move [keep trading].
Outputs: read by Weeks, Paths, Loss, Size.
Place: sidebar card A / B (more).
From: 02.D23, 01.A4.

*B only*

**Card.B.1 B off / add B** — **merged** (from 02.D20 single-run mode; new at the trade scale)
Answers: do I compare, or read one trade?
Knobs: "B off" | "add B" [B on]; sits between the two cards.
Outputs: with B off every page reads A alone; the A − B pane and column and the Pair page say "needs B".
Place: sidebar, between cards A and B.
From: 02.D20, 02.Interactions.singlerun, 01.A4.

**Card.B.2 Swap A ⇄ B** — **merged** (from 02.D12, 02.D20 swap)
Answers: flip the sides.
Knobs: ⇄ (action).
Outputs: everything swaps, pins too.
Place: sidebar, between cards A and B.
From: 02.D12, 02.D20, 01.A2, 01.A4.

**Card.B.3 Link chain and B differs** — **merged** (from 02.D11, 02.D22)
Answers: which aspects of B are its own?
Knobs: a chain beside each of B's rows: detach | relink; editing a linked row detaches it (the toast offers a relink);
relink all ("B follows A again"). Aspects: instrument, expiry, structure, legs, placement, call wing, put wing, fill,
cadence, size on the account, modus.
Outputs: "set on its own" on each detached row; one sentence under B's head naming every difference ("B differs in the
instrument"; "same contracts, the fill differs"); a difference you did not ask for, in the note colour.
Place: sidebar card B (each row; the sentence under the head).
From: 02.D11, 02.D22, 01.A2, 01.A4.

**Card.B.4 Expiry mapping** — **kept**
Answers: what if B's instrument does not list A's date?
Knobs: nearest date | n/a [nearest date].
Outputs: flag "expiry mapped" or "n/a".
Place: sidebar card B (core, under expiry).
From: 02.D3.

**Card.B.5 Fill match** — **demoted** (from the fill editor, to B's "more")
Answers: can B be filled as well or as badly as A, against its own mid?
Knobs: off | on [off]: B's credit set to the same share of its own chain mid as A's, and kept so.
Outputs: B's fill tracks A's.
Place: sidebar card B (more).
From: 02.D10.

**Card.B.6 Pair size** — **renamed** (rule "equal worst loss" to "equal loss at the shock"), **demoted** (from a dock
section, to B's "more")
Answers: how many B contracts per A contract?
Knobs: auto | equal notional | equal credit | equal vega | equal loss at the shock | equal margin | custom (B per A)
[auto]. Auto: equal notional on one instrument at the same spot and IV, equal vega otherwise. Equal margin reads the
house rule.
Outputs: the size statement ("B is sized at 0.71 KORU contracts per RAM contract (equal vega)") under B's head, in
legends and in the export; a fall-back to equal notional said in words.
Place: sidebar card B (more).
Reads: Shock (equal loss at the shock), Account (margin rule).
From: 02.Z1, 02.D15, 01.A3, 01.E1.

### 1.2 Account

**Card.Acct.1 Capital** — **renamed** (from "Start $")
Answers: how big is the account?
Knobs: capital, $ [30,000].
Outputs: read by Weeks, Paths, Size, Recovery and Loss (account rows).
Place: sidebar card Account (core).
From: 02.D25, 01.F8.

**Card.Acct.2 Weeks** — **kept**
Answers: over how many weeks?
Knobs: weeks N [52].
Outputs: the horizon of every account reading.
Place: sidebar card Account (core).
From: 02.D25, 01.F8.

**Card.Acct.3 Costs** — **renamed** (fill wording "give up x of the half-spread" to the fill's cost row), **demoted**
(from the runs dock, to "more")
Answers: what does trading cost?
Knobs: $ per contract [0.65]; $ per share [0.005]; the fill's cost row: the share of the half-spread given up to close
[0.25].
Outputs: costs in every account reading; the summary line.
Place: sidebar card Account (more).
From: 02.D24, 01.F8.

**Card.Acct.4 Liquidity** — **demoted** (from the runs dock, to "more")
Answers: how many contracts can I really trade?
Knobs: at most N contracts [250].
Place: sidebar card Account (more).
From: 02.D24.

**Card.Acct.5 Strike grid** — **demoted** (from the runs dock, to "more")
Answers: on what grid do the account's strikes land each cycle?
Knobs: per ticker $1 | $0.50 [$1]. (The trade scale lands on the listed chain.)
Place: sidebar card Account (more).
From: 02.D24.

**Card.Acct.6 Margin rule** — **merged** (from 02.D24 share margin requirement, 02.C6), **demoted** (to "more")
Answers: what margin does IBKR ask?
Knobs: one IBKR house rule for leveraged ETFs, shares and naked short options alike; share requirement per ticker with
the house increase test [KORU 75%, RAM 50%].
Outputs: read by the Scorecard margin row, the unit "% of margin", credit per margin, "equal margin", every margin call.
Place: sidebar card Account (more).
From: 02.D24, 02.C6, 01.E2.

**Card.Acct.7 Rates** — **demoted** (from the runs dock, to "more")
Answers: what do I pay on the loan and earn on cash?
Knobs: IBKR tiered | flat % [tiered; benchmark 4%].
Place: sidebar card Account (more).
From: 02.D24.

**Card.Acct.8 Summary line** — **kept**
Outputs: "$30k · 52 wk · $0.65/contract · $1 strikes · tiered 4%".
Place: sidebar card Account (collapsed).
From: 02.D24, 02.D25 ("Base: $30k · 52 wk" line).

### 1.3 Assumptions

**Card.Asm.1 Summary line** — **merged** (from 02.K10 "pricing IV vs moves" header, 01.F8)
Outputs: always visible: "vol 117% (HV30) · odds from period vol · held to expiry · flat path"; names the odds basis
once per page, so no label carries it.
Place: sidebar card Assumptions (head).
From: 02.K10.

**Card.Asm.2 Period vol** — **merged** (from 02.V1, 02.V2 realized moves, 02.M6 presets)
Answers: what vol moves the price?
Knobs: per ticker: HV30 | typed (1–300%) | picked from a reference on Market with "use" [HV30].
Outputs: "vol 117% (HV30)"; read by every EV, every odds under "odds from period vol", Weeks, Paths, Recovery, Size;
floored / capped notes (Note.5).
Place: sidebar card Assumptions (core).
From: 02.V1, 02.V2, 02.M6, 02.Global.odds, 01.A5, 01.H.odds, 01.F8.

**Card.Asm.3 Odds from** — **merged** (from 02.V3, 02.K12 odds from, 02.K8 Empirical)
Answers: where do the odds come from?
Knobs: implied | period vol | past closes [period vol]. Read by every odds and every EV, no exception.
Outputs: under implied, EV is fill vs mid (0 at mid) and says so; past closes without closes says "needs closes (N)".
Place: sidebar card Assumptions (core).
Reads: day one: past closes and implied outside Outcomes, and implied on the account pages **new**.
From: 02.V3, 02.K12, 02.K8, 02.Global.odds, 01.H.odds, 01.B5.

**Card.Asm.4 IV override** — **merged** (from 02.M6 IV shift, 02.V2 implied vol), **demoted** (to "more")
Answers: what if IV were different from the chain?
Knobs: per ticker: the chain's ATM at the horizon | typed IV | shift in points [the chain's ATM].
Outputs: "model quotes" said on the cards and on Market while on; every option re-priced.
Place: sidebar card Assumptions (more).
From: 02.M6, 02.V2.

**Card.Asm.5 Spot override** — **demoted** (from Market facts › Edit, to Assumptions "more")
Answers: what if spot were different?
Knobs: per ticker typed spot [the listed spot].
Outputs: "model quotes" said; ✎ beside the spot on Market.
Place: sidebar card Assumptions (more).
From: 02.M6, 02.M1 (spot ✎).

**Card.Asm.6 Past closes** — **renamed** (from the "Empirical" paste box), **demoted** (to "more")
Answers: what did the price really do?
Knobs: per ticker paste box of daily closes (decimal commas accepted).
Outputs: odd jumps flagged; a strip of daily moves in the move colours; feeds "odds from past closes".
Place: sidebar card Assumptions (more).
From: 02.K8.

**Card.Asm.7 Exit rule** — **merged** (from 02.X1, 02.K5, 02.K10 managed, 02.K12 exit)
Answers: do I hold to expiry or manage?
Knobs: hold to expiry | take profit at x% of the credit [50] and stop at a loss of y% [200] [hold to expiry]; close
early: off | n days before expiry [off]. The only take-profit / stop in the app.
Outputs: every reading shows held solid, managed dashed; the managed column of Outcomes.
Place: sidebar card Assumptions (more).
Reads: day one: managed on the account pages **new**.
From: 02.X1, 02.K5, 02.K10, 02.K12, 01.F7, 01.B5, 01.B6.

**Card.Asm.8 Price path** — **demoted** (from the Compounding bar, to "more")
Answers: which way does the price drift over the weeks?
Knobs: flat | line | points | growth [flat]; start price (reset to spot); between points same $ | same % a week
[same $].
Outputs: the path on Weeks; toast "the path cannot fall".
Place: sidebar card Assumptions (more).
From: 02.D25, 01.F8.

**Card.Asm.9 IV path** — **demoted** (from Weeks › Over N weeks, to "more")
Answers: does IV change over the weeks?
Knobs: flat | line | points | growth [flat]; rule: moves keep the gap to IV | moves stay constant [keep the gap].
Outputs: the IV line on Weeks.
Place: sidebar card Assumptions (more).
From: 02.D26, 01.F8.

### 1.4 Shock

Open on the Risk pages, one summary line elsewhere. Stored in % of the instrument's price; shown in the move scale.

**Card.Shock.1 Size** — **merged** (from 02.Q1 size, 02.R1 kσ, 02.L2 range)
Answers: how big is the bad move?
Knobs: size [−30%], shown and typed in the move scale (typing 2σ converts at that moment); given as % of the ETF | of the
index [ETF] (the index converted through the daily reset).
Outputs: the stored % of price; its σ and price equivalents in the knob.
Place: sidebar card Shock (core).
From: 02.Q1, 02.R1, 02.L2, 01.C5, 01.C6.

**Card.Shock.2 Side** — **merged** (from 02.R1 side, 02.Q1 sign)
Answers: down, up, or whichever hurts?
Knobs: down | up | worse side [down].
Place: sidebar card Shock (core).
From: 02.R1, 02.Q1, 01.C6.

**Card.Shock.3 Shape** — **merged** (from 02.Q1 move, 02.L2 and its own range)
Answers: how does the move unfold?
Knobs: gap | run over k weeks [3] (Monday gaps | spread) | drawdown over n weeks [4] | spike, back after n sessions [2] |
anywhere up to [gap]. "Anywhere up to" takes the worst landing price between spot and the size, at expiry: the old
range row and metric of 02.L2.
Place: sidebar card Shock (core).
From: 02.Q1, 02.L2, 02.Global.odds (worst-loss range), 01.C2, 01.H.worstrange.

**Card.Shock.4 When** — **merged** (from 02.Q1 week, 02.L3 day)
Answers: when does it land?
Knobs: the day into the trade [today]; the week into the run: worst | a chosen week [worst].
Outputs: the day read by Loss (trade rows), Pair and Payoff's "at the shock's IV"; the week read by Loss (account rows).
Place: sidebar card Shock (core).
From: 02.Q1, 02.L3, 01.C4, 01.C5.

**Card.Shock.5 IV after** — **merged** (from 02.Q2, 02.T8)
Answers: what does IV do in the move?
Knobs: by rule: points per 10% drop [10], per 10% rise [5], cap [250%] | a set number of points | none [by rule]
(rise points 0 = "only on the way down").
Outputs: "IV → 173%"; open legs and margin marked at it.
Place: sidebar card Shock (core).
From: 02.Q2, 02.T8, 01.C5.

**Card.Shock.6 Rules of the move** — **demoted** (from Stress › Rules ▾, to the Shock card's "more")
Answers: how does the break play out?
Knobs: lands Mon | Tue | Wed | Thu | Fri [Mon]; forced-sale fills: shares −x% [1%], options mark + k × half-spread [2];
share maintenance after the move: the house rule | typed % [the house rule].
Place: sidebar card Shock (more).
From: 02.Q3, 01.C5.

**Card.Shock.7 Summary line** — **new**
Outputs: "−30% gap · week worst · IV by rule".
Place: sidebar card Shock (collapsed, on every page but Risk).

---

## 2. Trade

The trade at the trade scale, in days. First screen: Trade › Payoff with A and B.

### 2.1 Payoff

P&L over price and over time, in seven lenses, with the numbers of the trade below.

**Payoff.1 Readout** — **new**
Answers: what are the head numbers of each trade, at a glance?
Outputs: per trade: credit · EV · odds of profit · delta · theta · vega (the Scorecard's modules and knobs); readings
only, no quotes.
Place: Trade › Payoff, Outcomes, Placement › Readout (not on Market).
Reads: A, B, Account (margin), Assumptions. Values as of today; the day cursor does not move it.
From: 02.G1 (three Greeks up front), 01.C8.

**Payoff.2 Payoff chart** — **kept**
Answers: what is my P&L at each price?
Knobs: the lens switch (Payoff.3); the day cursor (Clock.1); the range (View.3).
Outputs: A and B curves; the expiry payoff as a faint line; the pair pane (A − B) beneath; move axis with zone colours;
hover rows; the pins (Payoff.6).
Place: Trade › Payoff › large graphic.
Reads: A, B, Assumptions; Day. Day one: covered call **new**.
From: 02.L1, 01.C1.

**Payoff.3 Lens switch** — **merged** (from 02.L1 lens bar, 02.T7 grid as a lens)
Answers: which view of the P&L surface?
Knobs: price views: P&L | All days | Profit zone | EV map; day views: Day change | Time decay | Decay vs move [P&L].
Place: Trade › Payoff › large graphic.
From: 02.L1, 02.T7.

**Payoff.4 P&L lens** — **kept**
Answers: P&L at each price on the chosen day.
Outputs: A, B, A − B in the reading unit; break-evens where shown (Payoff.25).
Place: Trade › Payoff › large graphic.
Reads: A, B, Assumptions; Day.
From: 02.L1, 01.C1.

**Payoff.5 All days** — **renamed** (from "P&L through time"), **demoted** (from its own panel, to a lens)
Answers: P&L at every price and every day at once.
Knobs: heat map | numbers [heat map]; A | B | A − B [A − B]; align by % of life | same date [% of life]; P&L | × odds
[P&L]; contours: break-even | levels, step 1 | 2 | 5 | 10 | 20 [break-even; 5]; numbers: columns 9 | 13 | 17 | 25 [13],
rows every 1 | 2 | 5 | 7 | 14 | 30 days [7]; Copy CSV; click a cell to pin.
Outputs: the surface in the reading unit; under × odds each column weighed by its odds, so a row sums to EV; σ cones;
today at the top.
Place: Trade › Payoff › large graphic.
Reads: A, B, Assumptions; Day.
From: 02.T7, 02.E4, 01.F6, 01.H.align.

**Payoff.6 Pins and pins table** — **demoted** (from P&L through time, to under All days)
Answers: the P&L at this exact price and day?
Knobs: click a cell to pin (up to 12); × removes one; clear pins.
Outputs: table: scenario (price per instrument, move), day, A, B, A − B; "outside the range"; a pin shows on every lens
and survives changes to A, B, unit, range and swap; exported.
Place: Trade › Payoff › ghettoized (under All days).
Reads: A, B, Assumptions.
From: 02.L5, 01.I.pins, 02.Interactions.clicks.

**Payoff.7 Profit zone** — **kept**
Answers: between which prices am I in profit on each day?
Outputs: break-even prices per day inside the ±1σ / ±2σ cone; zone width; odds inside.
Place: Trade › Payoff › large graphic (lens).
Reads: A, B, Assumptions; Day.
From: 02.T5, 01.F5, 01.C3 (break-even lines over time).

**Payoff.8 EV map** — **renamed** (from "expected P&L")
Answers: where across prices does the EV come from?
Outputs: P&L × odds per 1% of move (A as areas, B as a line); running total to the EV if closed on the cursor's day;
gains vs losses; share of the losing part from clear falls and clear rises (beyond 1.5σ).
Place: Trade › Payoff › large graphic (lens).
Reads: A, B, Assumptions (odds from); Day. Day one: past closes **new**.
From: 02.E3, 01.D2.

**Payoff.9 Day change** — **kept**
Answers: what did each trade make since the trading day before, at each price?
Outputs: curves and A − B; at an unchanged price, today vs the day before (×); weekend span named.
Place: Trade › Payoff › large graphic (lens).
Reads: A, B, Assumptions; Day.
From: 02.T2, 01.F2.

**Payoff.10 Time decay** — **merged** (from 02.T3, 02.K6 Time path)
Answers: how fast does the premium bleed?
Knobs: at a move of x, in the move scale [0].
Outputs: price to close day by day vs a straight line; daily decay bars (Mondays carry the weekend); shape
(back-loaded | even | front-loaded); share gone at half the days; share in the last 7 days; in the unit kept, the share
kept with no move by day and the day x is reached.
Place: Trade › Payoff › large graphic (lens).
Reads: A, B, Assumptions; Day.
From: 02.T3, 02.K6, 01.F3, 01.B5.

**Payoff.11 Decay vs move** — **kept**
Answers: how big a move wipes out a day's decay?
Knobs: at a move of x, in the move scale [0].
Outputs: per day the up and down move that cancels the decay, against normal-day shading and the period-vol 1σ day;
σ multiple; odds the day loses, and the every-day average.
Place: Trade › Payoff › large graphic (lens).
Reads: A, B, Assumptions; Day.
From: 02.T4, 02.P5, 01.F4.

**Payoff.12 Scorecard** — **merged** (from the Comparison table, 02.G1 panel, 02.Colour.better)
Answers: the numbers of the trade.
Knobs: "more rows ▸" [closed].
Outputs: rows × columns A, B, A − B (B at its pair size), and A / B on credit and on loss at the shock; the better side
per row marked; a knob on every row name.
Place: Trade › Payoff › below (position 1).
Reads: A, B, Account, Assumptions, Shock.
From: 02.E1, 02.L2, 02.G1, 01.B1, 01.C8.

**Payoff.13 Credit** — **kept**
Answers: how much premium do I take in?
Outputs: net credit per contract and per share; % of spot; each leg's credit; the label reads "time value" when a leg is
in the money; ✎ when typed.
Place: Trade › Payoff › below (Scorecard row 1).
Reads: A, B.
From: 02.C1, 01.B1.

**Payoff.14 EV** — **renamed** (from "Expected value", "EV at period vol", "Expected", "average")
Answers: what is the trade worth?
Outputs: per trade and A − B, in the reading unit; held or managed per the exit rule; the knob gives credit, settlement
at the vol used, and EV.
Place: Trade › Payoff › below (Scorecard row 2).
Reads: A, B, Assumptions. Day one: covered call, past closes **new**.
From: 02.E1, 02.E2, 01.D1.

**Payoff.15 Odds of profit** — **renamed** (from "Profit odds")
Answers: how often does it end in profit?
Outputs: odds of P&L above zero at expiry, per trade.
Place: Trade › Payoff › below (Scorecard row 3).
Reads: A, B, Assumptions (odds from).
From: 02.P1, 01.D3.

**Payoff.16 Break-even prices** — **kept**
Answers: where does it start losing, and how likely is the price to get there?
Outputs: each break-even price, its move from spot in the move scale, its touch odds before expiry.
Place: Trade › Payoff › below (Scorecard row 4).
Reads: A, B, Assumptions.
From: 02.P2, 01.C3.

**Payoff.17 Break-even vol** — **kept**
Answers: at what period vol is this fill zero-EV?
Outputs: per trade, and A − B in vol points.
Place: Trade › Payoff › below (Scorecard row 5).
Reads: A, B, Assumptions.
From: 02.E7, 01.D4, 01.C3.

**Payoff.18 Loss at the shock** — **renamed** (from "Worst loss", "worst loss in range")
Answers: what does the bad move cost this trade at expiry?
Outputs: per trade in the reading unit, at expiry; A / B. With the shape "anywhere up to" it is the old range row.
Place: Trade › Payoff › below (Scorecard row 6).
Reads: A, B, Assumptions, Shock.
From: 02.L2, 01.C2.

**Payoff.19 Margin** — **merged** (from 02.C6 on the IBKR house rule)
Answers: how much capital does it tie up?
Outputs: margin per contract ($) and % of notional, per trade.
Place: Trade › Payoff › below (Scorecard row 7).
Reads: A, B, Account (margin rule).
From: 02.C6, 01.E2.

**Payoff.20 Time value** — **demoted** (from a table knob, to "more rows")
Answers: how much of the credit is really premium?
Outputs: credit − intrinsic; ITM legs flagged; the ratios below use it.
Place: Trade › Payoff › below (Scorecard, more rows).
From: 02.C2, 01.B1.

**Payoff.21 Credit per σ** — **demoted** (to "more rows")
Answers: how many 1σ moves of cushion does the credit buy?
Outputs: credit ÷ (spot × ATM IV × √T), size-free.
Place: Trade › Payoff › below (Scorecard, more rows).
From: 02.C3, 01.B2.

**Payoff.22 Credit per day** — **demoted** (to "more rows")
Answers: what decay does it earn per day if nothing moves?
Outputs: time value ÷ days, $ a day.
Place: Trade › Payoff › below (Scorecard, more rows).
From: 02.C4, 01.B2.

**Payoff.23 Credit per margin** — **renamed** (from "Credit / margin"), **demoted** (to "more rows")
Answers: the return on capital if it expires worthless?
Outputs: time value ÷ margin (house rule), %; the knob says it is Recovery's "best case" rate.
Place: Trade › Payoff › below (Scorecard, more rows).
Reads: Account (margin rule).
From: 02.C5, 01.B2.

**Payoff.24 Greeks** — **demoted** (from the Greeks now panel, to "more rows"; delta, theta, vega stay up in the Readout)
Answers: what does it act like now?
Outputs: delta (shares), dollar delta, gamma (shares per 1%), dollar gamma, theta ($ a day), vega ($ per IV point); B per
contract and at its pair size; A − B on the dollar rows only across tickers.
Place: Trade › Payoff › below (Scorecard, more rows).
Reads: A, B, Assumptions.
From: 02.G1, 01.C8.

*Payoff gear*

**Payoff.25 Overlays** — **demoted** (from panel toggles, to the gear)
Knobs: strikes, ±1σ ±2σ, break-evens, spot, odds strip (each on | off) [σ marks and odds strip on].
Outputs: lines and a density strip under the chart, on every lens that has a price axis.
Place: Trade › Payoff › gear.
Reads: Assumptions (odds from).
From: 02.P3, 02.T7 (overlays), 01.C1, 01.D3.

**Payoff.26 IV band** — **demoted** (from the P&L lens bar, to the gear)
Knobs: off | ±5 | ±10 IV points [off]. Display only; no input to the model.
Outputs: shaded band and hover rows; "none at expiry (no time value left)".
Place: Trade › Payoff › gear.
From: 02.T9, 02.L1, 01.C1.

**Payoff.27 At the shock's IV** — **new**
Answers: what does the surface look like after IV has moved per the Shock?
Knobs: off | on [off].
Outputs: every lens, All days and the pins re-marked at the Shock's "IV after" (not entry, not at expiry); said in the
caption.
Place: Trade › Payoff › gear.
Reads: Shock (IV after, when).
From: 02.T8.

**Payoff.28 Extrapolate** — **demoted** (from the lens bar, to the gear)
Knobs: off | on [off]; reads in the P&L and Time decay lenses.
Outputs: dashed magenta line, "EXTRAPOLATED" on the chart and in the legend; says why when it cannot draw.
Place: Trade › Payoff › gear.
From: 02.T6.

**Payoff.29 Heat-map colour and grid lines** — **demoted** (from the grid's own gear, to the page gear)
Knobs: colour compressed | linear [compressed]; scale full | fixed ±x% [full; 20%]; one shared scale for A and B [on];
grid lines [off].
Place: Trade › Payoff › gear.
From: 02.T7.

### 2.2 Outcomes

The distribution of the trade's P&L; read in the unit "kept", it is the trade per cycle.

Readout: Payoff.1.

**Outcomes.1 Outcomes curve** — **merged** (from 02.K4 chart, 02.K12 dashed curve)
Answers: how often do I do at least x?
Outputs: odds of doing at least x against x (reading unit), A and B; held solid, managed dashed; x marked; hover gives the
price band that does x.
Place: Trade › Outcomes › large graphic.
Reads: A, B, Assumptions (odds from, exit rule); Day [expiry]. Day one: covered call, managed covered call **new**.
From: 02.K4, 02.K12, 01.B5.

**Outcomes.2 x** — **renamed** (from "Share x", "Fixed share")
Answers: what level do I care about?
Knobs: x in the reading unit [half the credit]. The same x is the hypothetical "every cycle keeps x" on Weeks.
Place: Trade › Outcomes › below (the table's input).
From: 02.K1, 02.K9, 01.B5, 01.B6.

**Outcomes.3 EV** — **merged** (from 02.K2, 02.E8, 02.K12 average)
Answers: what is it worth, held and managed?
Outputs: per trade and per day held; held and managed; ± s.e. on managed.
Place: Trade › Outcomes › below (table row 1).
Reads: A, B, Assumptions; Day.
From: 02.K2, 02.E8, 02.K12, 02.X1.

**Outcomes.4 Median** — **kept**
Answers: what does a typical trade make?
Outputs: median P&L per trade in the reading unit, held and managed.
Place: Trade › Outcomes › below (table row 2).
From: 02.K3, 02.K12 (read as median).

**Outcomes.5 Odds of at least x** — **renamed** (from "Odds of keeping at least x")
Answers: how often do I do x or better?
Outputs: odds per trade, held and managed; the price band that does x.
Place: Trade › Outcomes › below (table row 3).
From: 02.K4, 02.K9.

**Outcomes.6 Odds of profit** — **merged** (from 02.K4 at x = 0, 02.X1 win rate)
Outputs: the Scorecard's odds of profit, held and managed.
Place: Trade › Outcomes › below (table row 4).
From: 02.K4, 02.X1.

**Outcomes.7 Worst 5%** — **merged** (from 02.L4, 02.K12 read as percentile)
Answers: how bad are the bad outcomes?
Outputs: mean of the worst 5%, per trade, held and managed.
Place: Trade › Outcomes › below (table row 5).
From: 02.L4, 02.X1, 02.K12.

**Outcomes.8 Days held** — **kept**
Answers: how long is the money tied up?
Outputs: average days held, managed (held = days to expiry).
Place: Trade › Outcomes › below (table row 6).
From: 02.X1, 02.K5.

**Outcomes.9 How it ends** — **renamed** (from "take profit / stop" counts of Manage the trade)
Answers: how often does the exit rule close it?
Outputs: share closed at take profit (and the average day), at stop (and the day), held to expiry.
Place: Trade › Outcomes › below (table row 7).
Reads: Assumptions (exit rule).
From: 02.X1, 02.K5, 01.F7.

**Outcomes.10 Held and managed columns** — **merged** (from 02.X1, 02.K5, 02.K10 Managed)
Answers: does the exit rule help?
Outputs: columns per trade, held | managed side by side; with no exit rule, held only; "a net debit has no credit to
manage".
Place: Trade › Outcomes › below (table columns).
From: 02.X1, 02.K5, 02.K10, 01.F7.

**Outcomes.11 Outcomes gear** — **new**
Knobs: lines held | managed | both [both]; grid lines [off].
Place: Trade › Outcomes › gear.

### 2.3 Placement

The alternatives across strikes (the sweep) and across expiries and wings (the table).

Readout: Payoff.1.

**Placement.1 Sweep** — **merged** (from 02.S1, 02.E6)
Answers: how does the metric change as I move the strikes?
Knobs: vary: short legs | put | call | call wing [short legs]; smoothing (log slider) [0]; the metric (Placement.2).
Outputs: the metric across placement for A, B and A − B; ITM shading; marks at the trades as set; a typed fill as a
ring; "smoothed" said.
Place: Trade › Placement › large graphic.
Reads: A, B, Account, Assumptions, Shock; Day [expiry]. Day one: covered call **new**.
From: 02.S1, 02.E6, 01.B4.

**Placement.2 Metric** — **merged** (from 02.S1's three charts, 02.S2 columns)
Knobs: credit (time value when ITM) | credit per σ | credit per day | EV | odds of profit | loss at the shock | wing cost ·
pays back (odds) | credit per margin | break-evens [credit].
Outputs: the chart's y; the lit column of the table. Same modules as the Scorecard.
Place: Trade › Placement › large graphic (metric switch).
From: 02.S1, 02.S2, 01.B3, 01.B4.

**Placement.3 Placement table** — **renamed** (from "Overview of all 16 positions")
Answers: across A's and B's instruments, every listed expiry, with and without wings, which is best?
Knobs: set as A | set as B per row (loads that listed instrument, without overrides).
Outputs: rows: instrument × listed expiry × without | with wings; columns: the metric list; the best cell per expiry lit.
Place: Trade › Placement › below (position 1).
Reads: A, B, Account, Assumptions, Shock.
From: 02.S2, 02.E5, 01.B3.

**Placement.4 Placement gear** — **merged** (from 01.B3 series toggles, 02.S1 shading)
Knobs: series A | B | A − B (each on | off) [all on]; ITM shading [on]; marks at the trades as set [on].
Place: Trade › Placement › gear.
From: 01.B3, 02.S1.

### 2.4 Market

A fact page: the quotes, no Readout, no model.

**Market.1 Smile and legs** — **kept**
Answers: where do my strikes sit on the smile?
Knobs: click a quote to place a leg on that strike (writes card A or B).
Outputs: per ticker: fitted smile, quote dots, spot and forward, A's and B's legs (B dashed, + = long wing); axis hover:
IV vs period vol and ATM IV, 1-day, 1-week and to-expiry moves.
Place: Trade › Market › large graphic.
Reads: A, B, Assumptions (period vol for the hover).
From: 02.M5, 01.G2.

**Market.2 Quote line and ticker facts** — **kept**
Answers: what is the data and when?
Outputs: "IBKR option quotes at the 1 Oct 2026 close · spot RAM 14.45, KORU 21.09 · four expiries each"; per ticker spot
(✎ when overridden) and leverage.
Place: Trade › Market › below (position 1).
From: 02.M1, 01.A5.

**Market.3 Reference vols** — **merged** (from 02.M1 "also:", 02.V2 references, 02.M6 presets)
Answers: which vols could I assume?
Knobs: "use" beside each (writes Assumptions period vol for that ticker).
Outputs: per ticker: HV30, ATM at A's horizon, today's weekly and monthly ATM, 52-wk vol, 260-wk vol; the one in use
marked.
Place: Trade › Market › below (position 2).
From: 02.M1, 02.V2, 02.M6.

**Market.4 Expiries** — **renamed** (from "Expiry table")
Answers: what does each expiry imply?
Outputs: per expiry: days, forward, ATM IV, 1σ move to expiry in % and in price; A's and B's expiry marked.
Place: Trade › Market › below (position 3).
From: 02.M2, 01.G1.

**Market.5 Contracts in use** — **kept**
Answers: what are my legs' markets?
Outputs: per leg of A and B: bid, ask, mid, spread, own IV (* = smile fit), delta, strike vs forward in % and σ,
intrinsic, time value.
Place: Trade › Market › below (position 4).
From: 02.M3, 01.G1.

**Market.6 Skew** — **kept**
Answers: are my strikes rich or cheap against ATM?
Outputs: each leg's IV vs the ATM IV in points; put wing over call wing.
Place: Trade › Market › below (position 5).
From: 02.M4, 01.G1.

**Market.7 Market gear** — **merged** (from 01.G2 smile per expiry)
Knobs: smile of A's and B's expiries | every listed expiry [A's and B's]; quote dots on | off [on].
Place: Trade › Market › gear.
From: 01.G2.

---

## 3. Risk

What a bad move costs and how big I may be. Every page reads the one Shock, at both scales; the Shock card is open.

### 3.1 Loss

The loss at the shock, at both scales, in one table.

**Loss.1 Loss against shock size** — **merged** (from 02.Q6, with a new trade pane)
Answers: how does the loss scale with the size of the move?
Knobs: none on the chart (the Shock card defines the marked size; the gear picks panes).
Outputs: x = shock size in the move scale (−90% … +100% of price); trade pane: loss at the shock in the reading unit (at
the low solid, at expiry dotted); account pane: NAV change in % of NAV, margin-call rings, wiped-out dots; the defined
shock marked (magenta). A and B.
Place: Risk › Loss › large graphic.
Reads: A, B, Account, Assumptions, Shock; Day and Week of "when". Day one: trade pane **new**; covered call, straddle
**new** per Combinations.
From: 02.Q6, 01.C5.

**Loss.2 At the shock (table)** — **merged** (from 02.Q1 outputs, 02.L2 row)
Answers: what does the defined shock cost, at both scales?
Outputs: columns A, B (A − B at the trade scale); row groups trade (Loss.3) and account (Loss.4–Loss.7); the Shock's
summary line as the table's head.
Place: Risk › Loss › below (position 1).
Reads: A, B, Account, Assumptions, Shock.
From: 02.Q1, 02.L2.

**Loss.3 Trade rows** — **merged** (from 02.L2 at expiry, 02.Q1 at the low and at the end)
Outputs: P&L at the low, at the end, at expiry, in the reading unit, at the shocked IV.
Place: Risk › Loss › below (table, row group trade).
Reads: Day (when). Day one: at the low and at the end at the trade scale **new**.
From: 02.L2, 02.Q1, 01.C2.

**Loss.4 NAV rows** — **kept**
Outputs: NAV before (leverage, margin used); NAV at the low; NAV at the end; $ and % of NAV.
Place: Risk › Loss › below (table, row group account).
Reads: Week (when).
From: 02.Q1, 01.C5.

**Loss.5 Margin call** — **kept**
Outputs: day, price, what the broker did (shares sold, options bought back); any deficit ("you owe IBKR $x").
Place: Risk › Loss › below (table, row group account).
From: 02.Q1, 01.C5.

**Loss.6 Upside given up** — **kept**
Outputs: the gain the trade gave away on an up shock, $ and % of NAV.
Place: Risk › Loss › below (table, row group account).
From: 02.Q1, 01.C5.

**Loss.7 Room this week** — **kept**
Answers: how big a move can the account take now?
Outputs: the largest one-session move to a margin call and to NAV 0, in the move scale (ETF and index).
Place: Risk › Loss › below (table, row group account).
From: 02.Q1, 02.Q5, 01.C5, 01.C7.

**Loss.8 By-week chart** — **merged** (from 02.Q4, 02.Q5)
Answers: when is the account most exposed?
Knobs: click a week to inspect it (What happened).
Outputs: the loss by the week the shock lands ($ and %), margin-call rings, wiped-out dots; room before a margin call
(solid) and before NAV 0 (dashed) by week, drops and rallies; historical references (worst open gap, worst week low).
Place: Risk › Loss › below (position 2).
Reads: A, B, Account, Assumptions, Shock; Week.
From: 02.Q4, 02.Q5, 01.C5, 01.C7, 02.Interactions.clicks.

**Loss.9 What happened** — **demoted** (from a Stress panel, to ghettoized)
Answers: where did the loss come from?
Outputs: for the chosen week: NAV before, shares, options, cash, forced-sale fills, NAV after.
Place: Risk › Loss › ghettoized.
From: 02.Q7.

**Loss.10 Loss gear** — **merged** (from 02.Q5 display parts)
Knobs: panes trade | account | both [both]; historical references [on]; index equivalent on the room axis [on].
Place: Risk › Loss › gear.
From: 02.Q5.

### 3.2 Recovery

The cycles needed to earn the shock back.

**Recovery.1 Cycles to earn it back** — **renamed** (from "Recovery dynamics")
Answers: how many cycles does the bad move cost?
Outputs: x = shock size in the move scale, y = cycles, A and B; capped (Recovery.4); the defined shock marked.
Place: Risk › Recovery › large graphic.
Reads: A, B, Account (capital), Assumptions, Shock. Day one: covered call **new**.
From: 02.R1, 01.C6.

**Recovery.2 Recovery sentence** — **merged** (from 02.R1 outputs, 02.Notices.honesty)
Outputs: per trade, one sentence: cycles and days; the chance of no repeat while recovering (yellow below 50%); the
growth rate used; other rates and "recovery = buffer" in the knob.
Place: Risk › Recovery › below (position 1).
From: 02.R1, 01.C6.

**Recovery.3 Growth rate** — **kept**
Knobs: if no repeat | average | best case | typed % a cycle [if no repeat; typed 2%]. A reading choice, on this page.
Place: Risk › Recovery › below (in the sentence's row).
From: 02.R1, 01.C6.

**Recovery.4 Recovery gear** — **kept**
Knobs: cap of the cycles axis [60].
Place: Risk › Recovery › gear.
From: 02.R1.

### 3.3 Size

How big I may be: one chart, two ceilings, one sentence.

**Size.1 Size chart** — **merged** (from 02.Z4, 02.Z3, 02.Z2)
Answers: how do NAV and margin-call odds change with size?
Outputs: x = size on the account (leverage for shares, margin used for options), y = NAV at week N (typical) and
margin-call odds; reinvest solid, rebalance dashed; ceilings: margin-call odds ≤ 10% (ordinary course) and survives the
shock; the size as set marked; A and B.
Place: Risk › Size › large graphic.
Reads: A, B, Account, Assumptions, Shock. Day one: "survives the shock" on the account **new**; straddle **new**.
From: 02.Z4, 02.Z3, 02.Z2, 01.E3, 01.E4, 01.C7.

**Size.2 Safe-size sentence** — **merged** (from 02.Z2, 02.Z3, 02.K7 survives line, 02.R1 size that survives)
Outputs: per trade: "Safe size: ≤ 1.05× leverage (margin-call odds 10%) · ≤ 0.61× this size under the shock"; at the
trade scale the capital per contract and its multiple of margin; the loss at the shock as % of margin and of notional.
Place: Risk › Size › below (position 1).
From: 02.Z2, 02.Z3, 02.K7, 02.R1, 01.E4, 01.C6, 01.B5, 01.B6.

**Size.3 Size gear** — **merged** (from 02.Z4 run A | B)
Knobs: trades A | B | both [both]; the second modus line (rebalance) on | off [on].
Place: Risk › Size › gear.
From: 02.Z4.

### 3.4 Pair

The loss over two independent moves, one per ticker.

**Pair.1 Pair map** — **renamed** (from "Joint moves")
Answers: what if A's and B's instruments move differently?
Outputs: A − B heat map over every pair of moves within the range, each in its own σ (or %, per the move scale), at the
Shock's day and IV after; solid diagonal = the same-σ path the other pages assume; dashed = the same-% alternative.
Place: Risk › Pair › large graphic.
Reads: A, B, Assumptions, Shock (when, IV after); range (View.3). With A and B on one instrument, says so.
From: 02.L3, 01.C4.

**Pair.2 Worst cell** — **kept**
Outputs: the worst A − B cell and the two moves.
Place: Risk › Pair › below (position 1).
From: 02.L3, 01.C4.

**Pair.3 Worst on the same-σ line and the same-% curve** — **kept**
Outputs: the worst along the diagonal and along the alternative curve.
Place: Risk › Pair › below (position 2).
From: 02.L3, 01.C4.

**Pair.4 No-correlation note** — **kept**
Outputs: "the diagonal is the path the other pages assume; anything off it is risk they cannot show".
Place: Risk › Pair › below (position 3).
From: 02.L3.

**Pair.5 Pair gear** — **new**
Knobs: numbers in cells on | off [off]; the alternative curve on | off [on].
Place: Risk › Pair › gear.

---

## 4. Account

The account in the ordinary course over N weeks (no shock), in weeks.

### 4.1 Weeks

**Weeks.1 Weeks chart** — **kept**
Answers: how does it unfold over the weeks?
Knobs: the reading switch (Weeks.2); the week cursor (Clock.2).
Outputs: stacked: price path and strikes (with the 1σ band); IV path; NAV (typical with the 10–90% band; held solid,
managed dashed); shares or contracts; A and B; headline figures as the large legend (Weeks.3).
Place: Account › Weeks › large graphic.
Reads: A, B, Account, Assumptions; Week. Day one: straddle, % OTM / σ placement, fills, managed **new**.
From: 02.W2, 02.D26, 01.F8.

**Weeks.2 Reading switch** — **renamed** (from "Outcome ▾")
Knobs: typical | average [typical].
Outputs: NAV line, headline and table follow it.
Place: Account › Weeks › large graphic.
From: 02.W1, 01.F8.

**Weeks.3 Headline figures** — **merged** (from 02.W1, 02.Z3 ceiling moved to Size)
Outputs: NAV at week N and its multiple; 10–90%; margin-call odds within N weeks (on drops | either way [on drops]; ▲
loud when high); shares · lots or contracts.
Place: Account › Weeks › large graphic (legend).
From: 02.W1, 01.C7, 01.F8.

**Weeks.4 Credit collected** — **kept**
Answers: how much premium comes in?
Outputs: cumulative credit averaged over outcomes, per trade, $.
Place: Account › Weeks › below (position 1, left).
From: 02.W4, 01.F8.

**Weeks.5 Margin call so far** — **kept**
Answers: how likely is a margin call by week n?
Outputs: share of outcomes with at least one call by each week, per trade.
Place: Account › Weeks › below (position 1, right).
From: 02.W5, 01.C7, 01.F8.

**Weeks.6 NAV at week N table** — **merged** (from 02.K10, 02.K11, 02.K7 equivalent share, 02.W8, 02.W1 "average ·
exactly on the path")
Answers: where does the account end, per reading and per hypothetical?
Knobs: click a row to draw it on the chart.
Outputs: rows typical, average, every cycle keeps x, exactly on the path; the line "typical ≡ every cycle keeps y%" (or
"ends at zero"); columns per trade, held | managed.
Place: Account › Weeks › below (position 2).
From: 02.K10, 02.K11, 02.K7, 02.W8, 02.W1, 01.B6, 02.Interactions.clicks.

**Weeks.7 Growth card** — **demoted** (from a Weeks panel, to ghettoized)
Answers: where does one cycle's return come from?
Knobs: trade A | B [A]; follows the week cursor.
Outputs: R = λ(g + c(y − e)) + (1 − λ)rT with each term; the path return and the average; edge kept; odds the call ends
ITM; credit on the typical account and what it buys; credit as % of NAV and the part lost to the fill; a leverage note.
Place: Account › Weeks › ghettoized.
From: 02.W3, 02.K10, 01.F8.

**Weeks.8 Week table** — **demoted** (stays collapsed; now ghettoized)
Answers: what happens each cycle?
Knobs: trade A | B [A]; Copy CSV; click a row to set the week cursor.
Outputs: week, expiry, days, price, move, strikes, Δ, % away, premium, time value, shares, lots, NAV typical, 10%, 90%,
average, credit, margin call so far, cushion, typical λ.
Place: Account › Weeks › ghettoized.
From: 02.W6, 01.F8.

*Weeks gear*

**Weeks.9 Band** — **kept**
Knobs: 10–90% band off | A | B | both [both].
Place: Account › Weeks › gear.
From: 02.W2.

**Weeks.10 Hypotheticals** — **merged** (from 02.K11 preset lines, 02.W8)
Knobs: every cycle keeps x (x = Outcomes.2) on | off [off]; exactly on the path on | off [off].
Outputs: magenta NAV lines on the chart.
Place: Account › Weeks › gear.
From: 02.K11, 02.W8, 02.W2, 01.B6.

**Weeks.11 References** — **kept**
Knobs: held with no loan [on]; the 1σ band on the price [on].
Place: Account › Weeks › gear.
From: 02.W2.

### 4.2 Paths

The spread of NAV paths from a simulation, checked against the engine: the account's Outcomes.

**Paths.1 Fan** — **renamed** (from "Random paths"; promoted from a Stress panel to a page)
Answers: how wide is the spread of paths?
Outputs: NAV median, 25–75, 5–95 over the weeks against the engine's track; A and B.
Place: Account › Paths › large graphic.
Reads: A, B, Account, Assumptions; Week. Day one: as Weeks.1 **new**.
From: 02.W7, 01.F8.

**Paths.2 Percentile table** — **kept**
Outputs: 5%, 10%, median, 90%, 95%, worst 5% average, drawdown median and 90%, odds of at least one margin call ± s.e.,
odds of NAV 0; per trade.
Place: Account › Paths › below (position 1).
From: 02.W7.

**Paths.3 Engine check** — **kept**
Outputs: the simulation's median and margin-call odds against the engine's, with the gap said.
Place: Account › Paths › below (position 2).
From: 02.W7.

**Paths.4 Paths gear** — **kept**
Knobs: paths 1,000 | 2,000 | 5,000 [2,000]; seed [20261001]; new seed; Run (on demand).
Outputs: "inputs changed: run again" when stale.
Place: Account › Paths › gear.
From: 02.W7, 02.Notices.cannot.

---

## 5. Frame

**Tabs.1 Parent tabs and junior strip** — **merged** (from 02.Interactions.tabs)
Knobs: Trade (Payoff · Outcomes · Placement · Market) | Risk (Loss · Recovery · Size · Pair) | Account (Weeks · Paths)
[Trade › Payoff]; pinned knobs close on a page switch.
Place: header (row 1: parents; row 2: the junior strip).
From: 02.Interactions.tabs.

*Clocks*

**Clock.1 Day** — **merged** (from 02.T1, the grid's rows, 02.L3 day)
Answers: what does it look like on a given day?
Knobs: one cursor per Trade page [Payoff: today; Outcomes, Placement: expiry]; trading-day stops, Mondays marked;
replay ◀ ▶ to today / to expiry, play, step, speed 1–8 days a second; ← → Home End on the chart.
Outputs: every chart, table and lens on the page at that day; the caption names it.
Place: Trade › Payoff, Outcomes, Placement › large graphic (on the chart). Market has none.
From: 02.T1, 01.F1, 02.Interactions.keys.

**Clock.2 Week** — **merged** (from 02.W3 ◀ ▶ week, 02.W6 pin a week, the sticky cursor)
Knobs: one cursor per Account page; ◀ ▶; a week-table row sets it.
Outputs: a sticky cursor with values across the stacked charts; the growth card at that week.
Place: Account › Weeks, Paths › large graphic.
From: 02.W3, 02.W6, 02.Interactions.hover, 01.I.pins.

*View bar*

**View.1 Reading unit** — **merged** (from 02.Global.units, 02.K1 % of max)
Knobs: $ per A contract | % of credit (kept) | % of notional | % of margin | × credit [$ per A contract]; falls back with
a note when a unit cannot apply. Account pages show $ and % of NAV and hide the unit.
Place: View bar.
From: 02.Global.units, 02.K1, 01.H.unit.

**View.2 Move scale** — **merged** (from 02.Global.range unit, the move words of 02.R1, 02.Q1, 02.T3)
Knobs: σ | % | price [σ]. Re-labels the range, the shock, the axes and every move; converts, never redefines.
Place: View bar.
From: 02.Global.range, 01.H.range.

**View.3 Range** — **kept**
Knobs: down / up [2σ / 2σ]; symmetric [on]. Stored in % of price.
Outputs: the window of prices the charts show; prices in view and the σ arithmetic in its knob.
Place: View bar.
From: 02.Global.range, 01.H.range.

**Gear.1 One gear per page** — **merged** (from the per-panel gears of 02.T7 and 02.W2)
Knobs: the page's display settings only (each page's gear entries above).
Place: one gear per page, at the right of the page title.
From: 02.T7, 02.W2.

*Explanation*

**Knob.1 Knob** — **merged** (from 02.Interactions.knobs, 02.Explanations.knobs, 02.E2, 02.Explanations.formulas)
Knobs: hover shows one sentence; click pins the definition and the formula (several at once); × / Escape / second click
closes.
Outputs: the glossary entry, identical wherever the name appears.
Place: on every reading name.
From: 02.Interactions.knobs, 02.Explanations.knobs, 02.E2, 02.Explanations.formulas, 02.Explanations.captions, 01.I.explain.

**Method.1 Method** — **merged** (from three Method and caveats panels, notes ▸)
Outputs: one document, ordered by the glossary: what is modelled and what is not, per concept (instruments, forward,
placement, wings, link, smile, marks, fills, odds, σ, credit, margin, pair size, path, modus, bands, the shock, sessions,
index conversion, KRX halts).
Place: header (Method).
From: 02.Explanations.method, 02.Explanations.notes, 01.I.explain.

**Caption.1 Caption** — **kept**
Outputs: one line under each large graphic: what it shows, at which day or week, and the shock or IV in force.
Place: under the large graphic of every page.
From: 02.Explanations.captions, 02.Global.range (range captions).

*Header menu: preferences, sharing, export, reset*

**Menu.1 Theme** — **kept**
Knobs: auto | light | dark [auto].
Place: header menu.
From: 02.Global.theme, 01.H.theme.

**Menu.2 Sidebar open | rail** — **merged** (from 02.Global.dock positions and runs docks)
Knobs: open | rail [open].
Place: header menu.
From: 02.Global.dock, 01.H.dock.

**Menu.3 Open cards and "more"** — **renamed** (from the remembered collapse of panels, now of cards)
Knobs: which cards and which "more ▸" are open, remembered per browser.
Place: header menu (preferences).
From: 01.H.dock.

**Menu.4 Share link** — **merged** (from 02.Persistence.viewcode, copy view code)
Knobs: copy link (the view code in the address); copy view code; load a pasted code.
Place: header menu.
From: 02.Persistence.viewcode, 01.I.copy.

**Menu.5 Export** — **merged** (from two per-tab exports)
Knobs: copy | download .md; sections: header (A, B, Account, Assumptions, Shock), Payoff, Outcomes, Placement, Market,
Loss, Recovery, Size, Pair, Weeks, Paths, pins (each on | off).
Outputs: Markdown; every page has a section.
Place: header menu.
From: 02.Persistence.export, 01.I.export.

**Menu.6 Reset** — **merged** (from 02.Global.reset this tab | both tabs)
Knobs: this page (its display) | everything (definitions, assumptions, period vol, display).
Place: header menu.
From: 02.Global.reset.

*Persistence*

**Keep.1 View code** — **kept**
Outputs: the whole state; kept after # in the address; older codes (v5, v7–v10) load and migrate, with notes.
Place: header menu (Menu.4).
From: 02.Persistence.viewcode, 01.I.copy.

**Keep.2 Stored view** — **kept**
Outputs: the page remembers its state in this browser; a fault when storage is refused.
From: 02.Persistence.stored, 01.I.copy.

*Notices and faults*

**Note.1 Toasts** — **kept**
Outputs: toasts with an action: Copied / Clipboard blocked; relink; undo; "the path cannot fall"; "RAM lists monthly
options only".
From: 02.Notices.toasts, 01.I.notices.

**Note.2 Faults** — **kept**
Outputs: storage refused (private window); stored view did not load; bad view code; a value clamped; a step that failed
(state kept).
From: 02.Notices.faults, 01.I.notices.

**Note.3 Cannot compute** — **kept**
Outputs: a reading that cannot compute says why: "needs closes (N)", "a net debit has no credit to manage", "wiped out",
"no values", "needs B", "inputs changed: run again", "outside the range".
From: 02.Notices.cannot.

**Note.4 Honesty flags** — **kept**
Outputs: the chance of no repeat below 50% in yellow; ▲ high margin-call odds; "ends at zero".
From: 02.Notices.honesty.

**Note.5 Vol notes** — **kept**
Outputs: period vol floored or capped; a loaded view rescaled the vol.
From: 02.Notices.vol.

*Colour semantics*

**Colour.1 Sides and accents** — **kept**
Outputs: A violet, B orange; teal (soft glow): A − B, the active tab, focus, links, the cursors; magenta (soft glow):
extrapolated, shocked, the hypotheticals, the shock marker.
From: 02.Colour.sides, 01.I.colour.

**Colour.2 Gain, loss and market moves** — **kept**
Outputs: P&L green / red (checked for colour blindness), contour = break-even; moves up green, down red, notable yellow,
flat grey (under 0.5σ flat, to 1.5σ notable, beyond clear) on the move axis, hover, past closes, week table.
From: 02.Colour.pnl, 02.Colour.moves, 01.I.colour.

**Colour.3 Note, danger, reference** — **merged** (from 02.Colour.amber; amber becomes the note yellow)
Outputs: yellow: warnings, honesty lines, high margin-call odds; red: wiped out, margin call, NAV 0, "at the low" on a
loss; grey: reference lines, held with no loan, quotes.
From: 02.Colour.amber.

**Colour.4 Line styles and fills** — **merged** (from B dashed on the smile, full model dashed on Credit kept)
Outputs: solid = as set / held; dashed = managed, B's legs on the smile; dotted = reference; fills only for bands and
gain / loss areas; a state is a word in the accent, never a pill.
From: 02.Colour.sides.

**Colour.5 Better side and best cell** — **kept**
Outputs: the better side per Scorecard row marked; the best cell per expiry lit in the Placement table.
From: 02.Colour.better.

*Interactions and keyboard*

**Input.1 Keyboard** — **kept**
Knobs: arrow keys step one listed strike on a focused placement slider; ← → Home End on the day cursor; Escape closes
knobs; a focus ring on every control.
From: 02.Interactions.focus, 02.Interactions.keys, 01.I.pins.

**Input.2 Hover** — **kept**
Outputs: axis hover on every chart (price axes: σ, move, odds beyond; P&L axes: every unit and the odds of doing at
least that well); hover rows on Payoff; the full text in a tooltip wherever text is shortened.
From: 02.P4, 02.Interactions.hover, 01.I.explain.

**Input.3 Click actions** — **kept** (index of the clicks placed above)
Outputs: pin a cell (Payoff.6); place a leg from a quote (Market.1); set as A / B (Placement.3); inspect a week
(Loss.8); set the week (Weeks.8); draw a NAV row (Weeks.6).
From: 02.Interactions.clicks.

**Input.4 Copy actions** — **kept**
Knobs: Copy order (Card.A.10); Copy CSV (All days numbers, Week table); copy view code and link (Menu.4).
From: 02.Interactions.copy, 01.I.copy.

---

## 6. Cut

**Cut.1 Summary cards at the top of Compare** — **cut** (the sidebar is the one definition area; each leg's quote moves
to the card head; chart legends name A and B). From: 02.D14, 01.A1.

**Cut.2 Approximate Reg-T margin** — **cut** (one margin rule, the IBKR house rule; a second model made "% of margin"
and margin calls disagree). From: 02.C6, 01.E2, 02.Z1 ("equal margin (approx.)").

**Cut.3 The "1 in 20,000" survival test, and growth "without" that outcome** — **cut** (it is the shock test under
another name; Size carries the two tests). From: 02.K7, 01.E4, 01.B5.

**Cut.4 Fixed share as a reading** — **cut** (it is an input: x, Outcomes.2). From: 02.K9.

**Cut.5 "Typed" as an odds basis** — **cut** (a typed vol is a typed period vol, Card.Asm.2). From: 02.K12.

**Cut.6 The variant's gap (chance per cycle, size, side)** — **cut** (a per-cycle gap is a second shock model; the app
has one Shock, and the Weeks engine already models ordinary moves through period vol). From: 02.K12, 01.B5, 01.B6.

**Cut.7 Per-panel hide / show** — **cut** (the junior tabs are the hiding; the open cards are remembered, Menu.3).
From: 02.Global.panelhide, 01.H.dock.

**Cut.8 Notes chips, "show formulas and details", per-panel gears** — **cut** (the knob and the Method document carry
every explanation; one gear per page). From: 02.Explanations.notes, 02.Explanations.formulas, 02.K1, 02.K10, 01.I.explain.

**Cut.9 The second link model and second swap ("Change in B: strategy | ticker | cadence | strikes; more: size | modus
| vol | anything")** — **cut** (one link model: B's chains per aspect, Card.B.3). From: 02.D22, 01.A4.

**Cut.10 Recovery's "Measured on" (NAV when it lands | starting capital; margin | notional)** — **cut** (Recovery reads
the Account's capital and the trade's size on the account). From: 02.R1, 01.C6.

**Cut.11 Recovery's fixed-loss form ("a fixed loss %")** — **cut** (the Shock defines a move and the trade turns it into
the loss; the x axis of Recovery still spans every shock size). From: 02.R1, 01.C6.

**Cut.12 The overview's chart view (dots by expiry)** — **cut** (the page's chart is the sweep; the table lights the best
cell per expiry). From: 02.S2, 01.B3.

**Cut.13 B's own vol on the same ticker** — **cut** (vol is an assumption about the ticker, defined once per ticker in
Assumptions; A and B on different tickers still read their own vols). From: 02.D22 (vol), 02.V2 (B-only override),
01.F8.

**Cut.14 The market's odds shown under the per-cycle EV (02.K2)** — **cut** (one odds basis with no second route; switch
"odds from" to implied to read it). From: 02.K2.

**Cut.15 A free percentile reading ("read as percentile p")** — **cut** (the tail figure is Worst 5%; average and median
are rows). From: 02.K12.

**Cut.16 Words** — **cut** (years in anything the GUI shows; protection, Expected, realized moves, pricing IV, hit, worst
loss, wipe-out odds, Capture, Credit kept, Stress, Joint moves, Manage the trade, Recovery dynamics as names). No
capability; listed so the builder does not carry them.

---

## 7. The check

New ids reached by no old id: Card.Shock.7, Outcomes.11, Pair.5 (all **new**); Cut.16 (words only, no capability).

| Old id | Old name | New home (new id) | Mark |
|---|---|---|---|
| 01.A1 | Two positions side by side | Card.A.1, Card.A.3–Card.A.9 | merged |
| 01.A1 | (summary cards at the top) | Cut.1 | cut: one definition area |
| 01.A2 | B follows A (links) | Card.B.3, Card.B.2 | merged |
| 01.A3 | Pair sizing | Card.B.6 | renamed (equal worst loss → equal loss at the shock) |
| 01.A4 | A run for Compounding | Card.A.3, Card.A.4, Card.A.6, Card.A.12–Card.A.14, Card.B.1–Card.B.3 | merged |
| 01.A4 | ("Change in B" categories) | Cut.9 | cut: one link model |
| 01.A5 | Instruments and data | Card.A.1, Card.Asm.2, Market.2 | merged |
| 01.B1 | Credit | Payoff.13, Payoff.20, Card.A.9, Payoff.12 | merged |
| 01.B2 | Credit ratios | Payoff.21, Payoff.22, Payoff.23 | demoted |
| 01.B3 | Overview | Placement.3, Placement.2, Placement.4 | renamed |
| 01.B3 | (overview charts) | Cut.12 | cut: the sweep is the chart |
| 01.B4 | Strike placement sweep | Placement.1, Placement.2 | merged |
| 01.B5 | Credit kept per cycle (Capture) | Outcomes.1, Outcomes.2, Card.Asm.3, Card.Asm.7, Payoff.10, Size.2 | merged |
| 01.B5 | (gap; 1 in 20,000) | Cut.6, Cut.3 | cut: one Shock; the shock test |
| 01.B6 | Credit kept, compounded | Weeks.6, Weeks.10, Outcomes.2, Card.Asm.7, Size.2 | merged |
| 01.B6 | (gap) | Cut.6 | cut: one Shock |
| 01.C1 | Payoff at expiry and before it | Payoff.4, Clock.1, Payoff.25, Payoff.26 | merged |
| 01.C2 | Worst loss over a range | Payoff.18, Card.Shock.3, Loss.3 | renamed |
| 01.C3 | Break-evens | Payoff.16, Payoff.17, Payoff.7 | merged |
| 01.C4 | Joint moves | Pair.1–Pair.3, Card.Shock.4 | renamed |
| 01.C5 | Stress move | Card.Shock.1–Card.Shock.6, Loss.1–Loss.8 | merged |
| 01.C6 | Recovery from a hit | Recovery.1–Recovery.3, Card.Shock.1, Card.Shock.2, Size.2 | merged |
| 01.C6 | (measured on; fixed loss) | Cut.10, Cut.11 | cut: reads the Account; the Shock is a move |
| 01.C7 | Margin-call odds and room | Weeks.3, Weeks.5, Size.1, Loss.7, Loss.8 | merged |
| 01.C8 | Greeks now | Payoff.24, Payoff.1, Payoff.12 | demoted |
| 01.D1 | Expected value | Payoff.14 | renamed (one name: EV) |
| 01.D2 | EV map lens | Payoff.8 | renamed |
| 01.D3 | Profit odds | Payoff.15, Payoff.25 | renamed |
| 01.D4 | Break-even vol | Payoff.17 | kept |
| 01.E1 | Pair sizing (see A3) | Card.B.6 | merged |
| 01.E2 | Margin | Payoff.19, Card.Acct.6 | merged |
| 01.E2 | (approximate Reg-T) | Cut.2 | cut: one margin rule |
| 01.E3 | Leverage / margin-used sweep | Size.1 | merged |
| 01.E4 | Size that survives | Size.1, Size.2 | merged |
| 01.E4 | (1 in 20,000 test) | Cut.3 | cut: the shock test under another name |
| 01.F1 | Days slider and replay | Clock.1 | merged |
| 01.F2 | Day change lens | Payoff.9 | kept |
| 01.F3 | Time decay lens | Payoff.10 | kept |
| 01.F4 | Decay vs move lens | Payoff.11 | kept |
| 01.F5 | Profit zone lens | Payoff.7 | kept |
| 01.F6 | P&L through time (grid) | Payoff.5 | renamed, demoted |
| 01.F7 | Manage the trade | Card.Asm.7, Outcomes.9, Outcomes.10 | merged |
| 01.F8 | Compounding weeks | Card.Acct.1, Card.Acct.2, Card.Acct.3, Card.Asm.1, Card.Asm.2, Card.Asm.8, Card.Asm.9, Weeks.1–Weeks.8, Paths.1 | merged |
| 01.F8 | (B's own vol when B differs in vol) | Cut.13 | cut: one vol per ticker |
| 01.G1 | Market facts | Market.4, Market.5, Market.6 | kept |
| 01.G2 | Smile and legs | Market.1, Market.7 | kept |
| 01.G3 | Quote line on the cards | Card.A.9 | kept |
| 01.H.unit | Reading unit | View.1 | merged |
| 01.H.range | Chart range | View.2, View.3 | merged |
| 01.H.odds | Odds basis and period vol | Card.Asm.3, Card.Asm.2 | merged |
| 01.H.worstrange | Worst-loss range | Card.Shock.3 | merged (shape "anywhere up to") |
| 01.H.align | Alignment of two expiries | Payoff.5 | demoted (to an All days knob) |
| 01.H.theme | Theme | Menu.1 | kept |
| 01.H.dock | Dock open or closed; panels collapsed | Menu.2, Menu.3 | merged |
| 01.H.dock | (panels collapsed) | Cut.7 | cut: the junior tabs are the hiding |
| 01.I.pins | Pins, shared cursor, keyboard steps | Payoff.6, Clock.2, Input.1 | merged |
| 01.I.copy | Copy order, CSV, share link, view code, saved state | Card.A.10, Input.4, Menu.4, Keep.1, Keep.2 | merged |
| 01.I.export | Markdown export | Menu.5 | merged |
| 01.I.explain | Explanations | Knob.1, Method.1, Input.2 | merged |
| 01.I.explain | (panel notes, show formulas) | Cut.8 | cut: knob and Method |
| 01.I.notices | Notices | Note.1, Note.2, Card.A.11 | kept |
| 01.I.colour | Colour language | Colour.1, Colour.2 | kept |
| 02.D1 | Two positions, A and B | Card.A.9 | merged |
| 02.D2 | Instrument | Card.A.1 | kept |
| 02.D3 | Expiry | Card.A.2, Card.B.4 | kept |
| 02.D4 | Structure | Card.A.3 | merged |
| 02.D5 | Legs together or detached | Card.A.5 | demoted |
| 02.D6 | Strike placement basis and targets | Card.A.4 | merged |
| 02.D7 | Protective wings | Card.A.6 | renamed, demoted |
| 02.D8 | Fill mode | Card.A.7 | demoted |
| 02.D9 | Typed fills | Card.A.8 | demoted |
| 02.D10 | Fill match | Card.B.5 | demoted |
| 02.D11 | Links: B follows A | Card.B.3 | merged |
| 02.D12 | Swap A and B | Card.B.2 | merged |
| 02.D13 | Copy order | Card.A.10 | kept |
| 02.D14 | Summary cards (quotes, ✎) | Card.A.9, Card.A.8 | merged |
| 02.D14 | Summary cards (the cards) | Cut.1 | cut: one definition area |
| 02.D15 | Size statement | Card.B.6 | merged |
| 02.D20 | Compounding runs A and B | Card.B.1, Card.B.2, Card.A.9 | merged |
| 02.D21 | Run definition | Card.A.1, Card.A.3, Card.A.4, Card.A.6, Card.A.12, Card.A.13 | merged |
| 02.D22 | B differs in | Card.B.3 | merged |
| 02.D22 | (categories, Anything; Vol) | Cut.9, Cut.13 | cut: one link model; one vol per ticker |
| 02.D23 | Modus operandi | Card.A.14 | renamed, demoted |
| 02.D24 | Costs and rates | Card.Acct.3–Card.Acct.8 | demoted |
| 02.D25 | Base scenario | Card.Acct.1, Card.Acct.2, Card.Acct.8, Card.Asm.8 | merged |
| 02.D26 | IV path | Card.Asm.9, Weeks.1 | demoted |
| 02.M1 | Quote line and ticker facts | Market.2, Market.3, Card.Asm.5 | kept |
| 02.M2 | Expiry table | Market.4 | renamed |
| 02.M3 | Contracts in use | Market.5 | kept |
| 02.M4 | Skew at the chosen strikes | Market.6 | kept |
| 02.M5 | Smile and legs | Market.1 | kept |
| 02.M6 | Spot / IV shift / period vol editor | Card.Asm.2, Card.Asm.4, Card.Asm.5, Market.3 | merged |
| 02.C1 | Net credit | Payoff.13, Card.A.9 | kept |
| 02.C2 | Time value vs cash credit | Payoff.20 | demoted |
| 02.C3 | Credit per σ | Payoff.21 | demoted |
| 02.C4 | Credit per day | Payoff.22 | demoted |
| 02.C5 | Credit / margin | Payoff.23 | renamed, demoted |
| 02.C6 | Margin (Compare) | Payoff.19, Card.Acct.6 | merged |
| 02.C6 | (Reg-T model) | Cut.2 | cut: one margin rule |
| 02.P1 | Profit odds | Payoff.15 | renamed |
| 02.P2 | Break-even prices and touch odds | Payoff.16 | kept |
| 02.P3 | Odds strip and σ marks | Payoff.25 | demoted |
| 02.P4 | Axis hover odds | Input.2 | kept |
| 02.P5 | Odds the day loses | Payoff.11 | kept |
| 02.E1 | Expected value row | Payoff.14, Payoff.12 | renamed |
| 02.E2 | EV explainer | Knob.1, Payoff.14 | merged |
| 02.E3 | EV map lens | Payoff.8 | renamed |
| 02.E4 | P&L × odds grid | Payoff.5 | merged |
| 02.E5 | EV at period vol across positions | Placement.3 | renamed |
| 02.E6 | Sweep EV curve | Placement.1 | merged |
| 02.E7 | Break-even vol | Payoff.17 | kept |
| 02.E8 | EV of a managed trade | Outcomes.3 | merged |
| 02.L1 | Payoff / P&L at the chosen day | Payoff.2, Payoff.3, Payoff.4, Payoff.26 | kept |
| 02.L2 | Worst loss in range | Payoff.18, Card.Shock.1, Card.Shock.3, Loss.2, Loss.3, Payoff.12 | renamed |
| 02.L3 | Joint moves | Pair.1–Pair.4, Card.Shock.4 | renamed |
| 02.L4 | Worst 5% mean | Outcomes.7 | merged |
| 02.L5 | Pinned scenarios | Payoff.6 | demoted |
| 02.T1 | Day slider and replay | Clock.1 | merged |
| 02.T2 | Day change lens | Payoff.9 | kept |
| 02.T3 | Time decay lens | Payoff.10 | kept |
| 02.T4 | Decay vs move lens | Payoff.11 | kept |
| 02.T5 | Profit zone lens | Payoff.7 | kept |
| 02.T6 | Extrapolation | Payoff.28 | demoted |
| 02.T7 | P&L through time grid | Payoff.5, Payoff.3, Payoff.25, Payoff.29, Gear.1 | renamed, demoted |
| 02.T8 | Shocks after entry | Card.Shock.5, Payoff.27 | merged |
| 02.T9 | IV band | Payoff.26 | demoted |
| 02.G1 | Greeks now | Payoff.24, Payoff.1, Payoff.12 | demoted |
| 02.S1 | Strike placement sweep | Placement.1, Placement.2, Placement.4 | merged |
| 02.S2 | Overview of all 16 positions | Placement.3, Placement.2 | renamed |
| 02.S2 | (charts view) | Cut.12 | cut: the sweep is the chart |
| 02.K1 | Share x and the capture table | Outcomes.2, View.1 | merged |
| 02.K1 | (formulas toggle) | Cut.8 | cut: knob and Method |
| 02.K2 | Expected (capture) | Outcomes.3 | renamed (to EV) |
| 02.K2 | (the market's odds under it) | Cut.14 | cut: one odds basis |
| 02.K3 | Median | Outcomes.4 | kept |
| 02.K4 | Odds of keeping at least x | Outcomes.1, Outcomes.5, Outcomes.6 | merged |
| 02.K5 | Managed (capture) | Card.Asm.7, Outcomes.8, Outcomes.9, Outcomes.10 | merged |
| 02.K6 | Time path | Payoff.10 | merged |
| 02.K7 | Growth (capture) | Size.2, Weeks.6 | merged |
| 02.K7 | (1 in 20,000; without wipe-outs) | Cut.3 | cut: the shock test under another name |
| 02.K8 | Empirical | Card.Asm.3, Card.Asm.6 | merged |
| 02.K9 | Fixed share | Outcomes.2, Outcomes.5 | merged |
| 02.K9 | (as a preset reading) | Cut.4 | cut: it is an input |
| 02.K10 | Credit kept per cycle (Compounding) | Outcomes.10, Weeks.6, Weeks.7, Card.Asm.1, Card.Asm.7 | merged |
| 02.K10 | (formulas toggle) | Cut.8 | cut: knob and Method |
| 02.K11 | NAV if every cycle kept | Weeks.6, Weeks.10 | merged |
| 02.K12 | Your variant: odds from | Card.Asm.3 | merged |
| 02.K12 | Your variant: exit | Card.Asm.7 | merged |
| 02.K12 | Your variant: read as average, median; the dashed curve | Outcomes.3, Outcomes.4, Outcomes.7, Outcomes.1 | merged |
| 02.K12 | Your variant: gap | Cut.6 | cut: a per-cycle gap is a second shock model |
| 02.K12 | Your variant: typed; percentile p | Cut.5, Cut.15 | cut: typed vol is period vol; one tail figure |
| 02.X1 | Manage the trade | Card.Asm.7, Outcomes.3, Outcomes.6–Outcomes.10 | merged |
| 02.Z1 | Pair sizing | Card.B.6 | renamed, demoted |
| 02.Z2 | Recovery's size that survives | Size.1, Size.2 | merged |
| 02.Z3 | Margin-call-safe size | Size.1, Size.2 | merged |
| 02.Z4 | Leverage sweep | Size.1, Size.3 | merged |
| 02.R1 | Recovery dynamics | Recovery.1–Recovery.4, Card.Shock.1, Card.Shock.2, Size.2 | merged |
| 02.R1 | (measured on; fixed loss) | Cut.10, Cut.11 | cut: reads the Account; the Shock is a move |
| 02.W1 | Weeks headline | Weeks.2, Weeks.3, Weeks.6 | merged |
| 02.W2 | Over N weeks | Weeks.1, Weeks.9, Weeks.10, Weeks.11, Gear.1 | kept |
| 02.W3 | Growth, week N card | Weeks.7, Clock.2 | demoted |
| 02.W4 | Credit collected | Weeks.4 | kept |
| 02.W5 | Margin call so far | Weeks.5 | kept |
| 02.W6 | Week by week table | Weeks.8, Clock.2 | demoted |
| 02.W7 | Random paths | Paths.1–Paths.4 | renamed |
| 02.W8 | Exactly on the path | Weeks.6, Weeks.10 | merged |
| 02.Q1 | Stress move | Card.Shock.1–Card.Shock.4, Loss.2–Loss.7 | merged |
| 02.Q2 | IV after the move | Card.Shock.5 | merged |
| 02.Q3 | Rules of the move | Card.Shock.6 | demoted |
| 02.Q4 | Loss by the week the move hits | Loss.8 | merged |
| 02.Q5 | Room before a margin call and NAV 0 | Loss.7, Loss.8, Loss.10 | merged |
| 02.Q6 | Loss against the size of a gap | Loss.1 | merged |
| 02.Q7 | What happened | Loss.9 | demoted |
| 02.V1 | Period vol (Compare) | Card.Asm.2 | merged |
| 02.V2 | IV · realized (Compounding) | Card.Asm.2, Card.Asm.4, Market.3 | merged |
| 02.V2 | (B-only override) | Cut.13 | cut: one vol per ticker |
| 02.V3 | Odds basis | Card.Asm.3 | renamed (to odds from) |
| 02.Global.range | Chart range | View.2, View.3, Caption.1 | merged |
| 02.Global.units | P&L units | View.1 | merged |
| 02.Global.odds | Odds basis, period vol, worst-loss range | Card.Asm.3, Card.Asm.2, Card.Shock.3 | merged |
| 02.Global.theme | Theme | Menu.1 | kept |
| 02.Global.dock | Dock visibility | Menu.2 | merged |
| 02.Global.panelhide | Panel hide | Cut.7 | cut: the junior tabs are the hiding |
| 02.Global.reset | Reset | Menu.6 | merged |
| 02.Interactions.tabs | Tabs | Tabs.1 | merged |
| 02.Interactions.keys | Replay, day stepping, strike keys | Clock.1, Input.1 | merged |
| 02.Interactions.clicks | Pins and click actions | Input.3, Payoff.6, Loss.8, Weeks.6, Weeks.8, Market.1, Placement.3 | kept |
| 02.Interactions.hover | Axis hover, sticky cursor, tooltips | Input.2, Clock.2 | kept |
| 02.Interactions.knobs | Knobs | Knob.1 | merged |
| 02.Interactions.copy | Copy order, CSV, view code | Input.4 | kept |
| 02.Interactions.singlerun | Single-run mode | Card.B.1 | merged |
| 02.Interactions.focus | Focus ring | Input.1 | kept |
| 02.Persistence.viewcode | View code | Keep.1, Menu.4 | kept |
| 02.Persistence.stored | Stored view | Keep.2 | kept |
| 02.Persistence.export | Markdown export | Menu.5 | merged |
| 02.Notices.flags | Placement flags | Card.A.11 | kept |
| 02.Notices.fill | Typed price no longer applies | Card.A.8 | kept |
| 02.Notices.vol | Period vol floored / capped | Note.5 | kept |
| 02.Notices.toasts | Toasts | Note.1 | kept |
| 02.Notices.faults | Faults | Note.2 | kept |
| 02.Notices.cannot | Readings that cannot compute | Note.3, Paths.4 | kept |
| 02.Notices.honesty | Honesty flags | Note.4, Recovery.2 | kept |
| 02.Colour.sides | A, B, A − B, accents | Colour.1, Colour.4 | kept |
| 02.Colour.pnl | P&L green / red | Colour.2 | kept |
| 02.Colour.moves | Market-move colours | Colour.2 | kept |
| 02.Colour.better | Better side, best cell | Colour.5, Payoff.12 | kept |
| 02.Colour.amber | Amber rings, honesty, red dot | Colour.3 | merged |
| 02.Explanations.method | Method and caveats (three) | Method.1 | merged |
| 02.Explanations.notes | notes ▸ and captions | Method.1, Caption.1 | merged |
| 02.Explanations.notes | (the notes chips) | Cut.8 | cut: knob and Method |
| 02.Explanations.knobs | Knobs | Knob.1 | merged |
| 02.Explanations.formulas | Show formulas and details | Knob.1 | merged |
| 02.Explanations.formulas | (the toggle) | Cut.8 | cut: knob and Method |
| 02.Explanations.captions | Range captions, facts footnote | Caption.1, Knob.1 | merged |

Old ids: 186 (01: 51; 02: 135). Mapped to a new home: 185 (25 of them also lose a part to the cut list). Cut whole: 1
(02.Global.panelhide). None lost.

---

## Notes for Fable

- Call: "odds from" defaults to period vol (v10 defaulted to implied); 03's and 05's summary line say "odds from period
  vol", and under implied every EV is fill vs mid.
- Call: the exit rule gains "close early: n days before expiry", so the variant's "exit N days before expiry" (02.K12)
  is not lost; it adds no second take-profit / stop.
- Call: spot override (02.M6), unplaced in 03 and 05, goes to Assumptions "more" beside the IV override.
- Call: one x, shared by Outcomes ("odds of at least x") and Weeks ("every cycle keeps x").
- Call: "read as percentile p", Recovery's fixed-loss form, the overview's chart view, B's own vol on the same ticker
  and the market's odds under the old per-cycle EV are cut (Cut.11–Cut.15); each was a second route to something kept.
- Call: the Readout shows values as of today; the day cursor moves the large graphic and the tables, not the Readout.
- Call: the Shock defaults to −30% gap, down, landing today / worst week (the summary line's example); v10's default
  was −35%.
- 05 lists the Loss table's three marks as rows; 03 §3.3 had them as columns. The list follows 05 (rows).
- 02 refers to a "W10" in three places; no such entry exists. It meant W7 (random paths), mapped above.
