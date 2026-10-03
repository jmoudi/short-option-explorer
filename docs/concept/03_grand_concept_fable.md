# The options lab: one trade, two scales, one shock

Status: final
Author: Fable (senior designer)
Inputs: 01_capabilities_envoy.md, 02_capabilities_oppa.md, user_screenshot_dark.webp, directive_UX.md, directive_code.md,
STATUS_V10.md, the live v10 page (six full-page screenshots under ../fable_work/), and the envoy's evaluation of draft 1
(03b_envoy_eval.md), weighed point by point in the appendix.

This is the grand concept for the rebuild. Section 1 says what went wrong. Section 2 gives the one idea and the concepts
that every capability belongs to. Section 3 places them on pages. Section 4 is the vocabulary. Section 5 is what is cut.
Section 6 asks the user three things. Capabilities are referred to by the names they will carry in the final list
(04_capabilities_final.md); individual controls are not spelled out. Capability ids in this paper are Oppa's (02) unless
prefixed "01." for the envoy's.

---

## 1. The diagnosis

The app has about ninety capabilities and nearly all of them are good. The screenshot shows the trouble: the Compare
page is a 5,400-pixel scroll of nine panels, each with its own toolbar, its own switches, its own notes chip and its own
gear, with a dock floating over the right edge and popovers stacking on popovers. Nothing is wrong with any panel. What
is wrong is that each one was built as a world of its own, so the same question is asked in several places with several
names, several inputs and several forms. Concretely:

**1.1 Two definition systems for one subject.** A position in Compare (01.A1, D1–D11) and a run in Compounding (01.A4,
D20–D24) are the same thing, a short-option trade on RAM or KORU, defined twice. Compare says straddle / strangle, places
by Δ, % OTM or σ, has wings, fills and typed credits, and links B to A with per-aspect chains. Compounding says covered
calls / strangle, places by Δ only on a synthetic $1 grid, calls wings "protection", has no fills, and links B to A with
"Change in B: strategy | ticker | cadence | strikes | more". Two editors, two vocabularies, two link models, two swap
buttons, and single-position mode exists in one and not the other (Oppa cluster 12, STATUS "Still open 2").

**1.2 Expectation in twelve forms under three names.** "Expected value" (table row), "EV at period vol" (overview,
sweep), "Expected" (Capture, Credit kept), "expected P&L" (EV map), "average" (variant, Recovery growth, Weeks outcome),
"EV a trade · managed / held" (Manage). Envoy cluster 1, Oppa cluster 1. One number, defined in one module, is shown
under a different word in each place, and under one of two vol bases depending on the panel.

**1.3 Shocks defined five ways, read in five forms.** Worst loss "within the chart range or its own range" (table,
overview, sweep); the joint-moves worst cell (σ per ticker); the Recovery hit (kσ to its own expiry, or a fixed % loss,
on margin or notional); the Compounding stress move (% gap of the ETF or the index, run / drawdown / spike, in a chosen
week, with its own IV response and its own forced-sale rules); the Manage panel's worst 5%. Envoy cluster 2, Oppa
cluster 2. These are one question, "what does a bad move cost me", asked with four different scales of move, marked at
four different moments (at expiry, to its own expiry, in a session at the shocked IV) and answered in four different
units. They are not comparable because nothing was ever designed to be compared.

**1.4 Vol changes defined five ways.** IV shift in Market facts (re-prices entry), the IV band on the payoff (±5, ±10),
IV shock after entry on the grid (points plus a skew rule), IV after the move in Stress (points per 10% drop, cap), and
the IV path in Weeks. Oppa cluster 10. Two of these are the same idea (a change of IV after entry) with different
inputs; one is a market override, one is a path assumption, one is a display band with no input at all.

**1.5 Three survival sizes, three tests, three sentences.** Recovery: "size that survives this 2σ hit ≤ 0.61× this
size"; Capture Growth: "survives with wipe-out odds under 1 in 20,000 at ≤ 0.19× this size"; Weeks headline: "odds at
10% or less: 1.05× leverage or lower". 01.E4, Oppa cluster 3. The leverage sweep draws one of them and not the others.

**1.6 Credit kept built twice.** Capture (Compare) and Credit kept (Compounding) carry the same eight presets with
different headers, a different "Your variant" (one has Exit, one does not; the vol sources are named differently), and a
different source of the managed rule (one borrows Manage the trade's, one has its own). Oppa cluster 5. Manage the trade
is a fourth place for the same take-profit / stop idea (cluster 6).

**1.7 Time sliced into seven partial views.** The day slider, six lenses, the grid, Manage's "days held", the Capture
"Time path" and the Compounding weeks all read one surface (P&L over price and time). Envoy cluster 5, Oppa cluster 8.
The lenses are well made; the problem is that "Time path" in Capture is the Time decay lens under another name, and the
grid and the lenses do not share a day cursor with Joint moves.

**1.8 Vol under five names and odds under three switches.** "period vol" = "realized moves" = "realized vol" = "moves";
"ATM IV" = "implied vol (prices every option)" = "pricing IV". Three odds switches: the global "Odds: implied | period
vol", Capture's "Odds from period vol | ATM IV | typed", Credit kept's "realized vol | pricing IV | typed". Oppa clusters
10 and 11, envoy cluster 7. The EV readings ignore the global switch everywhere but the EV row.

**1.9 Two margin models.** Compare uses an approximate Reg-T figure; Compounding uses the IBKR house rule. "% of A's
margin" and "credit / margin" read one; margin calls read the other. Oppa cluster 4.

**1.10 Settings scattered.** The reading unit and the odds basis live inside the "Chart range ▾" popover. Each panel has
a gear or a "Measured on ▾". The Compounding bar is a definition area (runs, base, path, IV path) built as a toolbar with
popovers. Theme, share and export live in a header menu, and Reset lives next to them. There is no one place for display
settings and no one place for assumptions.

**1.11 Explanations in five forms.** Three "Method and caveats" panels, "notes ▸" chips, info knobs, "show formulas and
details", the growth-formula card, and captions under every chart. Oppa cluster 19.

**1.12 Definition areas that still read.** The summary cards at the top of Compare restate what the sidebar defines, then
add "same position, only the instrument differs" and the size sentence. They are a second definition area, fixed to the
top of every Compare page, with cards (the directive asks for few cards).

The pattern across all twelve: every capability brought its own inputs, its own time, its own vol, its own shock and its
own unit, because nothing told it which of these were shared. The rebuild fixes this by deciding, once, what is shared.

---

## 2. The organizing idea

**One trade, read at two scales, through one set of assumptions, against one shock.**

The app has one subject: a short-option trade on a leveraged ETF (two of them, A and B, when comparing). Every reading in
the app is that trade looked at from one of two distances:

- **the trade**: this position, to its expiry, in days;
- **the account**: an account on margin that sells it again and again for N weeks, in weeks.

A **cycle** is the bridge between the two, and it is a unit, not a third scale: one cycle is one trade sold on its
cadence; what the trade keeps per cycle (Outcomes, in the unit "kept") is what the account compounds (Weeks), and a
shock's cost can be counted in cycles (Recovery).

Worst loss and stress are the same reading, the loss at the shock, at the two scales. EV and "typical NAV" are the same
reading (what it makes on average) at the two scales. The survival size is one reading with two tests. Credit kept per
cycle and NAV if every cycle kept are one reading at two scales. The accretion happened because each scale re-invented
each concept. The rebuild gives each concept **one name, one form and one set of inputs**, and makes the scale a visible
dimension of the reading rather than a different reading in a different place.

Three rules follow, and every capability obeys them:

1. **Defined once, read everywhere.** A trade, an account, an assumption, a shock: each is defined in exactly one place,
   the sidebar, and every reading reads that definition. No reading carries its own copy of an input that another reading
   also needs. A display setting never redefines: switching the move scale re-labels a shock or a range, it never changes
   it.
2. **Shown in several places, named once.** A quantity may appear on several pages (EV in the Readout, in the Scorecard,
   in the Placement table, in the Outcomes table), but it is computed in one module, carries one name, and its one-line
   definition behind its knob is the same text everywhere.
3. **Three kinds of area, never mixed.** Definition areas (the sidebar cards) carry no calculations. Fact areas (Market, a
   quote beside a leg) carry quotes and nothing modelled. Reading areas carry the model's answers and no definitions.

### 2.1 The concepts

Seventeen concepts in four kinds. Every capability in lists 01 and 02 belongs to exactly one.

**Definitions (four), each a sidebar card**

| Concept | One name | One UX form | One set of inputs (ids from 02 unless prefixed 01.) |
|---|---|---|---|
| The trade | **A**, **B** | A definition card. Core rows: instrument, expiry, structure, placement. A "more ▸" expander: legs together or detached, wings, fill, typed fills, and "on the account" (cadence, size on the account, modus). B's rows carry the link chain. The card head shows the name, each leg with its quote (bid × ask, a fact set apart) and the fill got, the net credit, and the Copy order action. Nothing else. | D1–D13, D20–D23 (the trade parts), 01.A1–A4, pair size Z1 |
| The account | **Account** | One short card shared by A and B: capital, weeks; "more ▸": costs and rates, the margin rule, liquidity. | D24, D25 (capital and weeks), 01.F8 (capital, weeks) |
| The assumptions | **Assumptions** | One card, collapsed to a summary line ("vol 117% (HV30) · odds from period vol · held to expiry · flat path"). Core: period vol per ticker, odds from. "more ▸": IV override per ticker, exit rule, the price path and IV path over the weeks. | V1, V2, V3, M6 (the override part), X1 (the rule part), D25 (the path part), D26, K12 "odds from" and "exit" |
| The shock | **Shock** | One card, collapsed elsewhere, open on the Risk pages: size, side, shape, when, IV after. "more ▸": rules of the move. Stored in one canonical unit (% of the instrument's price), shown in the move scale. Defined here and read by every shock reading, at both scales. | Q1 (the definition part), Q2, Q3, T8, L2 (the range part), R1 (the hit part), L3 (the two-ticker move) |

**Facts (one)**

| Concept | One name | One UX form | Inputs |
|---|---|---|---|
| The market | **Market** | One page: the smile with the legs as the large graphic; under it the ticker facts and reference vols (HV30, ATM, 52-wk, 260-wk) each with a "use" action that writes the assumption, the expiry table, the contracts in use, the skew. No modelled number on the page. | M1–M5, 01.A5, 01.G1–G3 |

**Readings (nine)**

| Concept | One name | One UX form | Inputs |
|---|---|---|---|
| The P&L surface | **Payoff** | One large chart with a **lens** switch and one **day** cursor; the pair (A − B) always drawn beneath. Seven lenses in two groups: price views (P&L, All days, Profit zone, EV map) and day views (Day change, Time decay, Decay vs move). Overlays and display live behind one gear, among them the IV ±5 / ±10 band and "at the shock's IV". Pins live here. | L1, T1–T9, E3, E4, L5, P3, P4, P5, 01.C1, 01.F1–F6 |
| The numbers of the trade | **Scorecard**, with its **Readout** | One table, rows × (A, B, A − B). Core rows: credit, EV, odds of profit, break-even prices with touch odds, break-even vol, loss at the shock, margin. "more rows ▸": time value, credit per σ, per day, per margin, the Greeks. Its head rows (credit · EV · odds of profit · delta · theta · vega, per trade) are also shown as one line, the Readout, above the large graphic of every Trade reading page. Each row name carries its knob. | C1–C6, E1, E2, E7, P1, P2, G1, L2 (as the shock row), 01.B1, 01.B2, 01.C3, 01.C8, 01.D1, 01.D3, 01.D4, 01.E2 |
| The distribution | **Outcomes** | One large curve (odds of doing at least x, x in the reading unit; A and B; held solid, managed dashed) and one table: EV, median, odds of ≥ x, odds of profit, worst 5%, days held; held and managed side by side. "Kept" is this reading in the unit "% of credit"; the old presets are its rows and its unit. | K1–K6, K8, K9, K12 (the read-as and gap part), X1 (the readings), E8, L4, 01.B5, 01.F7 |
| The alternatives | **Placement** | One large chart (a metric across placement for A and B, the sweep) and one table (every listed expiry, with and without wings, the overview) with the same metric columns; a row click sets A or B. The metric list is a fixed subset of the Scorecard rows, the loss metric being the loss at the shock. | S1, S2, E5, E6, 01.B3, 01.B4 |
| The loss | **Loss** | The loss at the shock, read in one table, "at the shock": one column per trade, one row group per scale. Trade: P&L at the low, at the end, at expiry. Account: NAV at the low and at the end, the margin call, the room, upside given up. Drawn large against shock size, two panes sharing the x axis. Read over two independent moves on the Pair page. | L2 (the reading part), L3 (the readings), Q1 (the readings), Q4–Q7, 01.C2, 01.C4, 01.C5, 01.C7 (the room part) |
| The recovery | **Recovery** | One large chart (cycles to earn the shock back against shock size, A and B) and one sentence per trade: cycles and days, the chance of no repeat, the growth rate used. | R1 (the reading part), 01.C6 |
| How big | **Size** | One large chart with size on the x axis (leverage for shares, margin used for options; contracts per capital at the trade scale), NAV at week N and margin-call odds on y, and two ceilings marked: "margin-call odds ≤ 10%" and "survives the shock". Under it one sentence per trade in one form: "Safe size: ≤ 1.05× leverage (margin-call odds 10%) · ≤ 0.61× this size under the shock". | Z2, Z3, Z4, K7 (the survives part), R1 (the survives part), 01.E3, 01.E4 |
| The account over time | **Weeks** | One large stacked chart over N weeks (price path and strikes, IV path, NAV with its band, contracts) with a **reading** switch (typical | average) and the week cursor; held solid and managed dashed per the exit rule; the hypotheticals ("every cycle keeps x", "exactly on the path") as overlays. Under it, in order: the headline figures, credit collected, margin call so far, NAV at week N by reading and hypothetical (one small table, with the equivalent fixed share). Ghettoized: the growth card, the week table. | W1–W6, W8, K10, K11, K7 (the equivalent-share part), D26 (as drawn), 01.F8 (the readings), 01.C7 (the odds part) |
| The spread of paths | **Paths** | One large fan chart of NAV over the weeks (median, 25–75, 5–95) against the engine's track, A and B; under it the percentile table (5, 10, median, 90, 95, worst 5% average, drawdown, odds of a margin call, odds of NAV 0) and the check against the engine. | W7 |

**Cross-cutting (three)**

| Concept | One name | One UX form |
|---|---|---|
| The clocks | **Day** and **Week** | One day cursor per Trade page and one week cursor per Account page, shared by every chart, table and lens on that page. The Shock's "when" names a day into the trade and a week into the run. Replay belongs to the day cursor. |
| The view bar | **View** | One row at the right end of the junior strip: reading unit, move scale, chart range. Display only; it converts and never redefines: a shock, a range or an axis changes its label when the move scale changes, never its meaning. |
| The knob | **Knob** | Every reading name carries one knob: hover shows one sentence, click pins the definition and the formula. The three "Method and caveats" panels become one Method document, opened from the header, ordered by the glossary. |

### 2.2 The six named merges the brief asks for

- **EV** is one quantity: P&L weighed by the odds under "odds from", held or managed per the exit rule. The word is "EV"
  on every page. Never "Expected", "expected value at period vol", "average outcome" or "R̄". The odds basis is named
  once per page in the Assumptions summary line, not in the label.
- **Worst loss and stress** are one reading, **loss at the shock**: the P&L (trade) or NAV change (account) at the one
  defined shock. The shock lands at its "when" (a day into the trade, a week into the run), and the loss is marked at the
  shocked IV, at the low and at the end of a multi-session shape; "at expiry" is a third column of the same table, not a
  second concept. The old "worst loss within a range" is the shock with the shape "anywhere up to"; the old "stress move"
  is the same shock read on the account; the old "hit" in Recovery is the same shock read in cycles.
- **Survival size** is one reading, **safe size**: the largest size that passes a survival test. There are two tests, both
  drawn as ceilings on the one Size chart and said in one sentence: the margin-call test (ordinary course, no shock) and
  the shock test. The "1 in 20,000 wipe-out" test is cut (it was the shock test under another name).
- **Credit kept** is one unit, **kept** (% of the credit), read in Outcomes per cycle, and compounded on Weeks as the
  hypothetical "every cycle keeps x" beside the typical and average readings. Capture and Credit kept both dissolve into
  these.
- **Time** is two clocks, **Day** and **Week**, one per scale, shared by everything on the page.
- **Odds basis** is one switch, **odds from**: implied, period vol, past closes; in Assumptions; read by every odds and
  every EV, with no exceptions and no second switch anywhere. A typed vol is a typed period vol, not a fourth basis.

### 2.3 What the two scales do to the definition

A position is a trade plus a listed date; a run is a trade plus an account. So the A and B cards define the trade once
(instrument, structure, placement, wings, fill) and add, in their "on the account" expander, how it is run (cadence, size
on the account, modus). The account scale re-lands the same placement rule every cycle; the trade scale reads the listed
chain at the chosen expiry. One editor, one link model (B's per-aspect chains), one swap, one "B off" mode at both scales.
The consequence is that the trade scale gains covered calls and the account scale gains straddles, wings by any basis and
typed fills; the final list marks which combinations each scale reads on day one (see open question 3).

---

## 3. The information architecture

### 3.1 The frame

- **Header row 1**: the app name; the three parent tabs; at the right, Method, then theme · share · export.
- **Header row 2**: the junior strip of the shown parent; at its right end, the View bar.
- **Sidebar** (right, fixed width, collapsible to a rail): the five definition cards, A, B, Account, Assumptions, Shock. It
  is the only definition area, on every page. No readings, no display settings. The sidebar adapts to the page: the cards
  the page reads are open, the others are collapsed to their one summary line; any card can be opened anywhere, and the
  choice is remembered. The old summary cards at the top of Compare are gone; a chart's legend names A and B in one line.
- **Main column**: a fixed grid of designed rows. Every page has the same shape: a title row (the junior tab's name and its
  one-line caption), on the Trade reading pages the Readout line, the one large graphic, then the smaller readings below
  it in a fixed order. A row exists because the design put it there; nothing wraps into a new row.
- **First screen**: Trade › Payoff, with A and B. The app is a comparer; "B off" is a mode, not the default.
- **Font size carries parentage**: parent tab > junior tab > page title (same as the junior tab, so it is not repeated as a
  panel head) > the headline figures on the large graphic > section heads below > row labels > captions and knob text.
- **Ghetto principle**: on every card and page, the rarely used lives behind one "more ▸". There is one gear per page
  (display), not one per panel. Per-panel hide/show is gone; the junior tabs are the hiding.

### 3.2 Parent tabs and junior strips

```
Trade      Payoff · Outcomes · Placement · Market
Risk       Loss · Recovery · Size · Pair
Account    Weeks · Paths
```

The parents are the three questions a trader asks. **Trade** is what it is and what it does, at the trade scale (days).
**Risk** is what a bad move costs and how big I may be: every page reads the one Shock, at both scales, so that the
readings the user found incomparable sit in one table under one definition. **Account** is where it goes in the ordinary
course over N weeks (no shock), at the account scale (weeks). Risk is the one parent organized by a concept rather than a
scale, and that is the point: comparability across scales needs one place.

### 3.3 Page by page: the large graphic on top, the smaller readings below

**Trade › Payoff**
- Readout line.
- Top, large: **Payoff**, with the lens switch and the day cursor on the chart; the pair pane beneath.
- Below: the **Scorecard**.

**Trade › Outcomes**
- Readout line.
- Top, large: the **Outcomes** curve (odds of at least x; held and managed).
- Below: the Outcomes table.

**Trade › Placement**
- Readout line.
- Top, large: the **Placement** sweep chart with its metric switch.
- Below: the Placement table (every expiry × wings, same metrics; click to set A or B).

**Trade › Market** (a fact page: no Readout, no model)
- Top, large: the smile with the legs (click a quote to place a leg).
- Below: ticker facts and reference vols (with "use"), the expiry table, the contracts in use, the skew.

**Risk › Loss** (the Shock card is open in the sidebar on all four Risk pages)
- Top, large: **loss against shock size**, two panes sharing the x axis: the trade pane in the reading unit, the account
  pane in % of NAV; the defined shock as a marker.
- Below: the "at the shock" table (one column per trade, one row group per scale, the columns at the low · at the end · at
  expiry); then the by-week chart (the loss by the week it lands, and the room before a margin call and before NAV 0);
  ghettoized: "what happened" for the chosen week.

**Risk › Recovery**
- Top, large: cycles to earn it back against shock size (A and B).
- Below: the recovery sentence per trade (cycles and days, the chance of no repeat, the growth rate used).

**Risk › Size**
- Top, large: **Size**, the sweep with the two ceilings.
- Below: one safe-size sentence per trade.

**Risk › Pair**
- Top, large: the joint heat map (A − B over both tickers' moves, at the shock's day).
- Below: the worst cell, the worst on the assumed same-σ line, the no-correlation note.

**Account › Weeks**
- Top, large: **Weeks**, the stacked chart with the reading switch and the week cursor; the headline figures (NAV at week
  N, its multiple, the 10–90% band, margin-call odds within N weeks, shares or contracts) as its large legend.
- Below: credit collected and margin call so far (one row, two charts); NAV at week N by reading and hypothetical (one
  small table).
- Ghettoized: the growth card (where a cycle's return comes from), the week table (copy CSV).

**Account › Paths**
- Top, large: the fan of NAV paths against the engine's track.
- Below: the percentile table and the check against the engine.

### 3.4 Where settings live

- **Definitions**: the sidebar (A, B, Account, Assumptions, Shock). Nowhere else.
- **Display**: the View bar (unit, move scale, range) and one gear per page (overlays, heat map colour, table columns, the
  paths count and seed).
- **Preferences**: theme, sidebar open or rail, which cards and "more ▸" are open, remembered per browser; under the
  header menu.
- **Sharing**: view code, share link, export (sections = the junior pages), under the header menu.
- **Reset**: under the header menu, for this page or everything.

### 3.5 Where explanations live

- The **knob** on every reading name: one sentence on hover, the definition and formula on click. The text is the glossary
  entry, so it is identical wherever the reading appears.
- **Method**: one document from the header, ordered like the glossary: what is modelled, what is not, per concept. It
  replaces the three "Method and caveats" panels, the "notes ▸" chips, "show formulas and details" and the formula card.
- **Captions**: one line under the large graphic, naming what it shows and at which day or week. No other captions.
- **Notices**: toasts with an action (undo, relink), faults, placement flags on the A and B cards. Unchanged in kind, one
  style.

---

## 4. The shared vocabulary

### 4.1 Glossary (the names the whole app uses, and nothing else)

Definitions
- **A, B**: the two trades compared; a trade is a short-option position on one instrument: structure, placement, wings,
  fill; and how it is run on the account. The cards, the columns, the lines and the colours all say A and B.
- **Structure**: covered call, straddle, strangle; with or without wings; a strangle may add puts to a covered call.
- **Placement**: where the strikes sit, by Δ, % OTM or σ; the target and the landed strike.
- **Wings**: the long call and the long put bought for protection ("protection" is not used as a name).
- **Quote**: a leg's bid × ask, a fact, shown beside the leg on the card.
- **Fill**: the price got: mid, natural, or typed.
- **Link**: B follows A per aspect; a chain beside each of B's rows; "B differs in …" is said in one sentence.
- **Pair size**: how many B contracts per A contract, by rule (equal vega, equal credit, equal loss at the shock, …).
- **Account**: capital, weeks, costs, the margin rule.
- **On the account**: a trade's cadence (weekly, monthly), size on the account (leverage for shares, margin used for
  options) and modus (credit after expiry; on a margin call; during a move).
- **Cycle**: one trade sold on its cadence; the unit Recovery counts in and Outcomes reads per.
- **Assumptions**: IV, period vol, odds from, exit rule, path.
- **IV**: the vol that prices the options; the chain's ATM at the horizon, overridable.
- **Period vol**: the vol that moves the price; HV30 by default, typed or picked from a reference.
- **Odds from**: where the odds come from: implied, period vol, past closes.
- **Exit rule**: hold to expiry, or take profit at x% of the credit and stop at y%.
- **Held / managed**: a reading to expiry / a reading under the exit rule.
- **Path**: the price path and the IV path over the weeks (flat, line, points, growth).
- **Shock**: one defined move: size (stored in % of price, shown in the move scale), side, shape (gap, run, drawdown,
  spike, anywhere up to), when (the day into the trade, the week into the run), IV after (by rule or a set number of
  points); rules of the move behind "more".

Facts
- **Market**: the quotes: spot, chain, expiries, forward, ATM IV, smile, skew, the contracts in use.

Clocks and view
- **Day**: days left on the trade; one cursor per Trade page. **Week**: the week on the account; one cursor per Account
  page.
- **Reading unit**: $ per A contract, % of credit (kept), % of notional, % of margin, × credit; the account always $ and
  % of NAV.
- **Move scale**: σ, %, or price; every move in the app is shown in it (range, shock, axes); it converts, never redefines.
- **Range**: the window of prices the charts show.

Readings
- **Readout**: the head rows of the Scorecard in one line: credit · EV · odds of profit · delta · theta · vega.
- **Payoff**: P&L over price, and over time; a **lens** is one view of it: price views (P&L, All days, Profit zone, EV
  map) and day views (Day change, Time decay, Decay vs move).
- **Pin**: a marked price and day, shared by every lens.
- **Scorecard**: the numbers of the trade.
- **Credit**: the net credit; **time value** when a leg is in the money.
- **EV**: P&L weighed by the odds.
- **Odds**: the chance of an outcome under "odds from"; **odds of profit** is the odds of P&L above zero.
- **Break-even price**: where P&L is zero at expiry, with its touch odds. **Break-even vol**: the period vol at which EV
  is zero.
- **Outcomes**: the distribution of P&L: EV, median, odds of at least x, worst 5%.
- **Kept**: P&L as % of the credit.
- **Placement** (the page): the alternatives across strikes (the sweep) and across expiries and wings (the table).
- **Loss at the shock**: the P&L (trade) or the NAV change (account) at the shock; **at the low**, **at the end** and
  **at expiry** are its three marks.
- **Room**: the largest shock before a margin call, and before NAV 0.
- **Recovery**: the cycles needed to earn the shock back; **no repeat**: the chance the shock does not recur meanwhile.
- **Pair** (the page): the loss over two independent moves, one per ticker.
- **Weeks**: the account over N weeks. **NAV**: the account's value. **Typical / average**: the median / the mean over
  outcomes (the **reading** switch). **Hypotheticals**: "every cycle keeps x" and "exactly on the path" (no moves around
  the path), drawn in the hypothetical accent.
- **Paths**: the spread of NAV paths from a simulation, checked against the engine.
- **Margin**: one rule everywhere, the IBKR house rule for leveraged ETFs (shares and naked short options alike).
  **Margin call**: the day, the price, what the broker did.
- **Size**: the size on the account; **safe size**: the largest size that passes the survival tests (margin-call odds
  ≤ 10%; survives the shock).
- **Greeks**: delta, gamma, theta, vega, now; rows of the Scorecard and of the Readout.

Explanation
- **Knob**: the explanation on a name. **Method**: the one document.

Words not used anywhere: Capture, Credit kept (as a page), Recovery dynamics, Manage the trade, Stress, Joint moves,
Compounding (as a tab, pending question 1), position / run / Trade A (as card names), protection, expected value,
Expected, realized moves, realized vol, pricing IV, hit, worst loss, wipe-out odds, years.

### 4.2 Colour language

Dark theme, Inter. Two accents, softly glowing; everything else is ink, tone and the two sides.

| Role | Colour | Used for |
|---|---|---|
| Side A | violet | A's lines, A's column, A's marks, A's card head |
| Side B | orange | B's lines, B's column, B's marks, B's card head |
| Accent 1, the pair | teal, soft glow | A − B, the active tab, focus, links, the day and week cursors |
| Accent 2, the hypothetical | magenta, soft glow | extrapolated, shocked, "every cycle keeps x", exactly on the path, the shock marker |
| Gain / loss | green / red | the sign of P&L only; and up / down for market moves |
| Note | yellow | notable moves; warnings (chain end, honesty lines, high margin-call odds) |
| Danger | red (the loss red) | wiped out, margin call, NAV 0 |
| Reference | grey | flat moves, reference lines, the held-with-no-loan line, facts (quotes) |

Line styles carry meaning too: solid = as set / held; dashed = the alternative (managed, B's legs on the smile); dotted =
a reference. Fills are reserved for bands (10–90%, the fan) and for the gain / loss areas of a lens. Pills are not used;
a state is a word in the accent colour. Cards are the five sidebar cards and nothing else.

---

## 5. What is cut, merged or demoted

**Merged (the big ones)**
- The Positions dock and the Runs dock → one sidebar with A, B, Account. The Compounding bar (runs, base, path, IV path,
  vol) → the sidebar's Account and Assumptions cards. "Change in B" → the link chains.
- Capture → Outcomes (per cycle), the unit "% of credit", "odds from past closes" (Empirical), the Time decay lens (Time
  path), Size (Growth's survives line). Its "Your variant" → the assumptions it was a copy of.
- Credit kept → the Weeks hypothetical "every cycle keeps x" and the small "NAV at week N" table; its Growth row (the
  equivalent fixed share) → one line of that table.
- Manage the trade → the exit rule (Assumptions) and the managed column of Outcomes.
- Worst loss, Joint moves' worst cell, the Recovery hit, the Stress move → one Shock, one Loss reading. IV shock after
  entry and IV after the move → the Shock's "IV after". The IV shift in Market facts → the IV override in Assumptions. The
  IV path stays as a path assumption. The IV band stays as a Payoff overlay (display, no input).
- Recovery dynamics → Risk › Recovery. Its survives line → Size.
- The three survival sentences and the leverage sweep → Size, one chart, one sentence form, under Risk beside the shock it
  is tested against.
- The three odds switches → odds from. The five vol names → IV and period vol. The two margin models → one.
- The Overview and the Strike placement sweep → Placement, one metric list.
- Greeks now → Scorecard rows and the Readout. Profit odds, break-evens, break-even vol, credit ratios → Scorecard rows.
- The six lenses and the grid → lenses of Payoff, one day cursor, one gear. Joint moves → Risk › Pair, its one home; it is
  not a lens.
- The random-paths check → Account › Paths, a page of its own.
- Three Method and caveats panels, notes chips, formulas toggles, the growth card's explanation → the knobs and one Method
  document.
- The Weeks "Outcome" switch → a reading switch (typical | average) plus the hypotheticals; "managed" there was the exit
  rule, which Assumptions holds.

**Cut**
- The summary cards at the top of Compare (the sidebar is the one definition area; the quote per leg moves to the card
  head; chart legends name A and B).
- The "1 in 20,000 wipe-out" survival test (it is the shock test under another name).
- The Fixed share "preset" as a reading (it is an input: a value of x for the hypothetical and for "odds of at least x").
- "Typed" as an odds basis (a typed vol is a typed period vol).
- Per-panel hide/show and per-panel gears, notes chips, "show formulas and details".
- The second swap, the second "B differs" model, the second set of fill words ("give up x of the half-spread" becomes the
  fill's cost row in Account › costs).
- "Years" anywhere; "protection"; "Expected"; "realized moves".

**Demoted (kept, behind a "more ▸" or a gear)**
- Greeks, time value and the credit ratios (Scorecard "more rows"; the three Greeks the Readout carries stay up).
- Legs detached, wings, fill, typed fills, on the account (A and B cards, "more").
- Costs and rates, liquidity, the margin rule (Account card "more").
- IV override, exit rule, path (Assumptions "more").
- Rules of the move (landing day, forced-sale fills, maintenance after) (Shock card "more").
- The growth card, the week table (Weeks, ghettoized). "What happened" (Loss, ghettoized).
- The pins table (under Payoff › All days). Replay (on the day cursor). Copy CSV (on the tables that have one). Paths
  count and seed (the Paths gear).

**Why**: each merge removes a second definition of something the app already defines; each cut removes a reading that was
another reading in another unit; each demotion keeps a capability but takes it off the first screen. Nothing in the two
lists is lost except the duplicates named under "Cut"; the final list proves it with a mapping of every old id.

---

## 6. Open questions for the user

1. **The third parent's name.** I propose **Account** (the scale it reads). Your word has been **Compounding** (the
   process). Either works with the concept; I need one.
2. **Five cards in the sidebar.** I place Assumptions and the Shock as sidebar cards, because they define the world the
   trade is read in and are not display settings, and because one definition area is the rule. The sidebar adapts (the
   cards a page reads are open, the rest are one line each). If you would rather keep the sidebar to A, B and Account, the
   Assumptions and Shock cards become strips under the junior tabs of the pages that read them, same content.
3. **One trade definition at both scales.** The merge means the trade scale can hold a covered call and the account scale
   can run a straddle with wings by σ and a typed fill. May the first build mark some combinations "not read at this
   scale" (the final list will say which), or must every structure be read everywhere from day one?

---

## Appendix: Evaluation weighed

One line per point of 03b_envoy_eval.md.

- **1 Parents mix two axes** — adapted: parents are now the three questions (Trade, Risk, Account); Risk is openly the one
  parent organized by a concept, and the paper says why.
- **1 Pair appears twice** — adopted: Risk › Pair is its one home; the Pair lens is gone (seven lenses remain).
- **1 Size under Account** — adopted: Size moves to Risk beside the shock it is tested against; Recovery no longer repeats
  the safe-size line.
- **1 The cycle scale has no page** — adopted, by demotion: two scales, and the cycle is a unit (Outcomes per cycle,
  Recovery in cycles), said so in §2 and the glossary.
- **1 Promote the random-paths check** — adopted as Account › Paths: it is the account's distribution, the counterpart
  of Trade › Outcomes, and Account needed a second page once Size left.
- **2 Readout line above Payoff** — adapted: the Readout (credit · EV · odds of profit · delta · theta · vega, per trade)
  sits above the large graphic on the three Trade reading pages; the quote (bid × ask per leg) is a fact and goes on the
  card head beside the fill it was got from, so no area mixes kinds and the first screen still shows both.
- **3 The shock needs a horizon** — adopted: lands at "when" (day into the trade, week into the run), marked at the
  shocked IV at the low and at the end, "at expiry" as a third column of the same table.
- **3 A unit display settings cannot change** — adopted: stored in % of price, shown in the move scale; rule 1 now says a
  display setting converts and never redefines; the same for the range.
- **3 Worst within a range as a shape** — adopted: the shape "anywhere up to".
- **4 "Typed" duplicates typed period vol** — adopted: odds from is implied · period vol · past closes.
- **4 "Trade" collides** — adapted: the cards are named A and B, the words the whole app already speaks; "Position" would
  have been wrong at the account scale.
- **4 The sidebar adapts to the page** — adopted, and it let the Shock become a sidebar card instead of a strip, which
  removed a contradiction in draft 1 (the sidebar as the only definition area, then a strip).
- **4 Group the lenses** — adopted: price views and day views.
- **4 Name the margin rule** — adopted: one IBKR house rule for leveraged ETFs, shares and naked short options alike.
- **4 Outcome switch on Weeks has two axes** — adopted: a reading switch (typical | average), the exit from Assumptions
  (held solid, managed dashed, as everywhere), the hypotheticals as overlays; "fixed share x" is a hypothetical, not an
  exit rule, since nobody can choose to keep x.
- **4 First screen** — adopted: Trade › Payoff with A and B.
- **5 What not to change** — kept as listed.
- Own changes on re-reading, not from the evaluation: the IV band stays a Payoff overlay rather than folding into the
  Shock (it has no input, so it defined nothing); the Payoff gear gains "at the shock's IV" so the Shock is read on the
  Trade pages too; Credit kept's Growth row survives as the equivalent-share line of the NAV table.
