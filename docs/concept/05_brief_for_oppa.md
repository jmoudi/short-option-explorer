# Brief for Oppa: write the final capability list (04_capabilities_final.md)

From: Fable (senior designer). Relayed by the envoy verbatim.

You wrote `02_capabilities_oppa.md` and you know the app. The grand concept is final: `03_grand_concept_fable.md` in this
folder (Status: final). Your job is `04_capabilities_final.md`, same folder: the one list of everything the rebuilt app
does, organized under the concept. Read 03 in full first; the sections below tell you what to produce and settle the
things a careful reader of 03 might still get wrong. Where this brief and 03 disagree, this brief wins (it is later).

Standing rules, unchanged: the user is a trader, so plain labels and trader words; the user's three banned words never
appear anywhere (the envoy tells you them with this brief; 00_brief_for_fable.md lists them); never "years" in anything
the GUI shows (weeks is the unit); no "protection", "Expected", "realized
moves", "pricing IV", "hit", "worst loss", "wipe-out odds", "Capture", "Credit kept", "Stress", "Joint moves", "Manage the
trade", "Recovery dynamics" as names in the new app (they may appear in the "from" of a merged or renamed mark).

## 1. What the file is

One Markdown file. Every capability from 01 and 02 appears exactly once, under its new home, or in the cut list with its
reason. The old lists had ids that collide (01's C1 is credit, 02's C1 is net credit, and so on): always prefix them,
`01.A1`, `02.D1`. Give every new entry a new id of the form `<page>.<n>`, e.g. `Payoff.3`, `Loss.2`, `Card.A.4`,
`View.1`, so the mapping at the end can point to it.

Keep each entry terse: three to six lines. The white paper deliberately left out what each control does and what its
choices are; that detail is yours and it belongs here, by name, so the builder never has to guess.

## 2. The frame to organize under

Parent tabs and junior pages (final):

```
Trade      Payoff · Outcomes · Placement · Market
Risk       Loss · Recovery · Size · Pair
Account    Weeks · Paths
```

Sidebar, the only definition area, on every page, five cards: **A**, **B**, **Account**, **Assumptions**, **Shock**. The
sidebar adapts: the cards a page reads are open, the others show one summary line; any card can be opened anywhere.

Header: app name, parent tabs, Method, theme · share · export menu (preferences, sharing, reset). Under the parent tabs:
the junior strip with the **View bar** (reading unit, move scale, range) at its right end. One gear per page (display).
Every reading name carries a **knob**. One **Method** document.

Organize the file in this order:

1. **Sidebar cards** (A and B together as one card type; Account; Assumptions; Shock).
2. **Trade** pages, in strip order. 3. **Risk** pages. 4. **Account** pages.
5. **Frame**: clocks (Day, Week), View bar, gear, knob and Method, header menu (preferences, sharing, export, reset),
   notices and faults, colour semantics, interactions and keyboard, persistence (view code, stored view).
6. **Cut**, with reasons.
7. **The check**: the mapping of every old id to its new home (section 6 below).

Within each page: the Readout (Trade reading pages only), then the large graphic, then the readings below it in the order
03 §3.3 gives, then the ghettoized items, then the page's gear contents.

## 3. The entry format

For each capability:

```
**<Page>.<n> <Name>** — <mark>
Answers: <the trader's question, one line>.
Knobs: <every control by name, with its choices; defaults in brackets>.
Outputs: <every output by name, with its unit>.
Place: <parent> › <junior> › <large graphic | Readout | below (position n) | ghettoized | sidebar card <name> (core |
more) | gear | View bar | header>.
Reads: <which sidebar cards and which clock it reads>.
From: <old ids>.
```

Marks, one per entry: **new**, **kept**, **merged** (from <old ids>), **renamed** (from <old name>), **demoted** (from
where, to where), **cut** (why). An entry may carry two marks when both are true (renamed and demoted). Say "merged" when
two or more old capabilities become one; say "renamed" when one old capability keeps its content under a new name.

Use the glossary names of 03 §4.1 for everything the GUI shows. Where you need a name 03 does not give, choose one in the
same voice (short, plain, a trader's word) and list it in a short "Names added" note at the top of the file so Fable's
glossary can be updated.

## 4. Decisions the concept fixes (knob-level, where 03 only referred)

These are settled. Give them their full knob detail in the entries; do not reopen them.

**A and B cards.**
- Core rows: instrument (RAM, KORU, or one the user added by pasting a chain), expiry (the listed dates with days left;
  for B, expiry mapping: nearest date, or n/a), structure (covered call, straddle, strangle; strangle may add puts to a
  covered call), placement (by Δ, % OTM, σ; one target for both legs when together).
- "more ▸": legs together | detached (make symmetric), wings (call, put; off | on, own basis and target), fill (mid |
  natural), typed fills (credit got net per share, or per-leg prices; back to mid), fill match for B, and **on the
  account**: cadence (weekly | monthly; RAM monthly only), size on the account (leverage for shares | margin used for
  options), modus (credit after expiry: reinvest | rebalance | keep as cash; on a margin call: only what IBKR requires |
  back to a target leverage; during a multi-week move: keep trading | stop at the first move).
- Card head (a fact and the definition, no calculation): the name line, each leg with its quote (bid × ask, set in the
  fact style) and the fill got, the net credit (✎ when typed), Copy order. Placement flags live on the card.
- B's rows carry the link chain (detach / relink per aspect; relink all); the differences are said in one sentence under
  B's head. The swap A ⇄ B and "B off / add B" sit between the two cards. Pair size (how many B per A; the rules of 02.Z1,
  with "equal worst loss" renamed "equal loss at the shock") is a row of B's "more".
- The old Compounding run definition (02.D21–D23, 01.A4) dissolves into these rows. There is one editor, so every
  structure is definable at both scales; mark in each reading which combinations it reads on day one (open question 3 of
  03: until the user answers, assume every combination is read, and flag the ones that need new math as "new").

**Account card.** Core: capital ($), weeks (N). "more ▸": costs and rates (per contract, per share, the half-spread given
up to close is the fill's cost row), liquidity (at most N contracts), strike grid per ticker, the margin rule (one IBKR
house rule for leveraged ETFs, shares and naked short options alike, with the house increase test; the Compare-side
approximate Reg-T figure is cut), rates (IBKR tiered | flat %).

**Assumptions card.** Summary line always visible ("vol 117% (HV30) · odds from period vol · held to expiry · flat
path"). Core: period vol per ticker (HV30 default; typed; or picked from a reference on Market with "use"), odds from
(implied | period vol | past closes). "more ▸": IV override per ticker (replaces the Market facts IV shift and the
Compounding implied-vol field; the chain's ATM at the horizon by default), past closes (the paste box, per ticker; feeds
"odds from past closes"), exit rule (hold to expiry | take profit at x% of credit and stop at y%; this is the only
take-profit / stop in the app), path (price path: flat | line | points | growth, start price, between points same $ |
same %; IV path: flat | line | points | growth; rule: moves keep the gap to IV | moves stay constant).

**Shock card.** Open on Risk pages, one line elsewhere ("−30% gap · week worst · IV by rule"). Core: size (stored in % of
the instrument's price, shown and typed in the move scale; typing 2σ converts at that moment), side (down | up | worse
side), shape (gap | run over k weeks, Monday gaps | spread | drawdown over n weeks | spike, back after n sessions |
anywhere up to), when (the day into the trade; the week into the run: worst | a chosen week), IV after (by rule: points
per 10% drop, per 10% rise, cap; or a set number of points; or none). Size may be given as % of the ETF or of the index
(converted through the daily reset). "more ▸": rules of the move (lands Mon–Fri, forced-sale fills for shares and
options, share maintenance after the move). The shock is read by: Scorecard's loss row, Placement's loss metric, Pair
size "equal loss at the shock", Loss, Recovery, Size (the shock ceiling), Pair, and the Payoff gear overlay "at the
shock's IV".

**Payoff.** Seven lenses in two groups on the lens switch: price views (P&L, All days, Profit zone, EV map), day views
(Day change, Time decay, Decay vs move). "All days" is the old P&L through time grid (heat map | numbers, A | B | A − B,
align by % of life | same date, P&L | × odds, contours, pins, copy CSV). One day cursor with replay (play, step, speed,
trading-day stops). Gear: overlays (strikes, ±1σ ±2σ, break-evens, spot, odds strip, IV ±5 / ±10 band, at the shock's
IV, extrapolate), heat-map colour, grid lines. Pins and the pins table live under All days. The Pair lens does not exist.

**Scorecard and Readout.** Core rows: credit, EV, odds of profit, break-even prices with touch odds, break-even vol,
loss at the shock (at expiry, under the Shock card; the old "worst loss in range" is this row with the shape "anywhere
up to"), margin. "more rows": time value, credit per σ, credit per day, credit per margin, delta, dollar delta, gamma,
dollar gamma, theta, vega. Columns A, B, A − B (and A / B where it was). The Readout is one line above the large graphic
on Payoff, Outcomes and Placement: per trade, credit · EV · odds of profit · delta · theta · vega. Not on Market.

**Outcomes.** Large: odds of doing at least x (x in the reading unit; A, B; held solid, managed dashed). Table rows: EV,
median, odds of at least x (x is an input on the page), odds of profit, worst 5% (mean), days held, share closed at
take profit / at stop / held to expiry; columns per trade, held and managed side by side. The unit "kept" (% of credit)
makes it the old Capture: Expected = EV in kept, Median = median, Odds of keeping ≥ x = odds of at least x, Managed =
the managed column, Fixed share = the input x, Empirical = odds from past closes, Time path = the Time decay lens,
Growth = Size and the Weeks table, Your variant = the Assumptions it copied (odds from, exit rule). The variant's gap
(chance per cycle, size, side) is cut as an input; say so in the cut list with the reason "a per-cycle gap is a second
shock model; the app has one Shock, and the Weeks engine already models ordinary moves through period vol". "Read as
average | median | percentile" dissolves into the table's rows.

**Placement.** Large: the sweep (vary: short legs | put | call | call wing; smoothing) with a metric switch. Table: every
listed expiry × with / without wings, click to set A or B. One metric list for both: credit (or time value), credit per
σ, credit per day, EV, odds of profit, loss at the shock, wing cost and pays back, credit per margin, break-evens.

**Loss.** Large: loss against shock size, two panes on one x axis (trade pane in the reading unit; account pane in % of
NAV), the defined shock marked. Table "at the shock": columns A, B (A − B at the trade scale); row group trade: P&L at
the low, at the end, at expiry; row group account: NAV before (leverage, margin used), NAV at the low, at the end, the
margin call (day, price, what the broker did), any deficit, upside given up, room this week (to a margin call, to NAV
0). Below: the by-week chart (loss by the week it lands, margin-call rings, wiped-out dots; room before a margin call and
before NAV 0 by week, with the historical references). Ghettoized: "what happened" for the chosen week (NAV before,
shares, options, cash, forced-sale fills, NAV after). Click a week to inspect it.

**Recovery.** Large: cycles to earn it back against shock size, A and B, capped as before. Below, one sentence per trade:
cycles and days, the chance of no repeat while recovering (yellow below 50%), the growth rate used (if no repeat |
average | best case | typed % a cycle: a knob on this page, not in Assumptions, since it is a reading choice). The old
"Measured on" choices (NAV when it lands | starting capital; margin | notional) are gone: Recovery reads the Account's
capital and the trade's size on the account. No safe-size line here.

**Size.** Large: x = size on the account (leverage for shares, margin used for options), y = NAV at week N (typical) and
margin-call odds; reinvest solid, rebalance dashed; two ceilings marked: margin-call odds ≤ 10%, survives the shock. Below:
one sentence per trade, "Safe size: ≤ 1.05× leverage (margin-call odds 10%) · ≤ 0.61× this size under the shock", with
the capital per contract at the trade scale. The "1 in 20,000" test is cut.

**Pair.** Large: the A − B heat map over both tickers' moves (each in its own σ, or %, per the move scale), at the Shock's
day. Below: worst cell, worst on the same-σ line, the same-% curve, the no-correlation note.

**Weeks.** Large: stacked chart over N weeks: price path and strikes (with the realized-move band), IV path, NAV (typical
with the 10–90% band; held solid, managed dashed per the exit rule), shares or contracts. A **reading** switch: typical |
average. Gear: band off | A | B | both, the hypotheticals as overlays ("every cycle keeps x" with x an input, "exactly
on the path"), the held-with-no-loan reference. Headline figures as the large legend: NAV at week N and its multiple,
10–90%, margin-call odds within N weeks (on drops | either way; loud when high), shares · lots or contracts. Below:
credit collected and margin call so far (two small charts, one row); the "NAV at week N" table: rows typical, average,
every cycle keeps x, exactly on the path, and the line "typical ≡ every cycle keeps y%" (the old Growth row); columns
per trade, held and managed. Ghettoized: the growth card (the formula, week by week, with its terms), the week table
(copy CSV; click a row to pin its week).

**Paths.** Large: fan chart of NAV (median, 25–75, 5–95) against the engine's track, A and B. Below: the percentile table
(5, 10, median, 90, 95, worst 5% average, drawdown median and 90%, odds of at least one margin call ± s.e., odds of NAV
0) and the check against the engine. Gear: paths (1,000 | 2,000 | 5,000), seed, new seed; runs on demand and says when
it is stale.

**View bar.** Reading unit ($ per A contract | % of credit (kept) | % of notional | % of margin | × credit; the Account
pages show $ and % of NAV and hide the unit), move scale (σ | % | price), range (down / up, symmetric). It converts and
never redefines (the shock and the range are stored in % of price).

**Clocks.** Day: one cursor per Trade page (Payoff, Outcomes, Placement read it; Market does not). Week: one cursor per
Account page. The Shock's "when" names its own day and week.

**Explanation.** One knob per reading name (hover one sentence, click pins definition and formula). One Method document
(from the header), ordered by the glossary. One caption under each large graphic. No notes chips, no formulas toggles.

**Header menu.** Theme (auto | light | dark), sidebar open | rail, which cards and "more" are open (remembered), view code
(copy, load, in the address), share link, export as Markdown with sections = the junior pages (every page has a section;
Manage, Sweep and Joint moves no longer lack one), reset this page | everything.

## 5. What a careful reader of 03 might still get wrong

- **Two scales, not three.** The cycle is a unit. There is no cycle page; "per cycle" is Outcomes in the unit kept, and
  Recovery counts in cycles.
- **Pair has one home**, Risk › Pair. It is not a Payoff lens. Seven lenses.
- **The cards are A and B**, not "Trade A", "Position A" or "Run A". The parent tab is Trade.
- **The Shock is a sidebar card**, not a strip. Draft 1 said strip; final says card. The sidebar is the only definition
  area, full stop.
- **The Readout carries readings only.** Bid × ask per leg is a fact and sits on the card head beside the fill. Do not put
  quotes in the Readout.
- **The shock's unit** is stored in % of price. The move scale re-labels it. "Anywhere up to" is a shape, and it is how the
  old worst-loss-in-range row and metric are expressed.
- **Three marks on the loss**: at the low, at the end, at expiry. The old Compare worst loss was "at expiry"; the old
  Stress was "at the low / end of the move". They are columns of one table now.
- **The Weeks switch is "reading"** (typical | average), not "outcome". Managed is not a choice there: the exit rule in
  Assumptions governs every reading in the app (held solid, managed dashed). "Every cycle keeps x" and "exactly on the
  path" are hypotheticals (magenta), overlays and table rows, not switch positions.
- **Odds from has three choices**, implied · period vol · past closes. A typed vol is a typed period vol.
- **One take-profit / stop in the app**, the exit rule in Assumptions. Credit kept's own take-profit / stop, Manage the
  trade's, and the variant's "Exit early" all map to it.
- **One margin rule**, the IBKR house rule, for "% of margin", "credit per margin", the Scorecard margin row and every
  margin call. Compare's approximate Reg-T figure is cut, not kept as a second model.
- **Size is under Risk**, not Account. Its margin-call ceiling reads the ordinary course (no shock); its second ceiling
  reads the Shock. Recovery does not repeat the safe-size line.
- **Account has two pages**, Weeks and Paths. Paths is the old random-paths check, promoted; it is the account's Outcomes.
- **The IV band stays** as a Payoff gear overlay (±5 / ±10, display only). It did not merge into the Shock. The Shock's
  "IV after" absorbs the grid's "Shocks after entry" and Stress's "IV after the move". The Market facts IV shift becomes
  the Assumptions IV override. The IV path stays in Assumptions › path.
- **Market is a fact page**: no Readout, no model, the reference vols with a "use" action that writes Assumptions.
- **First screen**: Trade › Payoff with A and B on. "B off" is a mode.
- **Fonts, rows, pills, cards**: not your file's job; do not add layout detail beyond the Place line.

## 6. The check: nothing lost

Finish the file with one table, every old id from 01 and 02 as a row:

```
| Old id | Old name | New home (new id) | Mark |
```

Cover every id in 01 (A1–A5, B1–B6, C1–C8, D1–D4, E1–E4, F1–F8, G1–G3, and each bullet of H and I as `01.H.unit`,
`01.I.pins` and so on) and every id in 02 (D1–D15, D20–D26, M1–M6, C1–C6, P1–P5, E1–E8, L1–L5, T1–T9, G1, S1–S2, K1–K12,
X1, Z1–Z4, R1, W1–W8, Q1–Q7, V1–V3, and each bullet of Global settings, Interactions, Persistence and export, Notices and
faults, Colour semantics, Explanations as `02.Global.range`, `02.Notices.flags` and so on). An old capability that split
gets several rows (02.K12 → Assumptions odds from; Assumptions exit rule; Outcomes table rows; cut: the gap). An old
capability that was cut gets the cut reason in the Mark column. The table is complete when no id of 01 or 02 is missing
and no new id of yours is unreached by at least one row (list any such orphan as "new" above the table).

Then one last line: the count of old ids, the count mapped, the count cut, and "none lost" or the ids that are.

## 7. Length and tone

The file will be long; that is fine. Terse entries, no prose between them beyond one line per page saying what the page
is for (take it from 03 §3.3). No evaluation of the concept in the file; if you disagree with a decision, add a short
"Notes for Fable" section at the very end, one line per point, and still write the list as the concept says.
