# v8 plan: one app, two tabs ("Compare A vs B" and "Compounding"), plus a Stress view

This file has three parts:
- **Part 0: changes made after the debate,** on your instructions. Where Part 0 conflicts with Parts 1 or 2, Part 0 wins.
- **Part 1: the debated plan** for the Compounding tab and the app shell (author against two critics, two rounds).
- **Part 2: the loss and stress module,** planned separately.

v7 stays untouched. v8 is a fresh build, `outputs/ram_koru_lab_v8.html`.

---

## Part 0. Changes after the debate (these override Parts 1 and 2)

### 0.1 Strikes are always on a listed grid: $1 by default, $0.50 only by override

Everywhere Parts 1 and 2 say "continuous strikes", that is replaced. There is no continuous-strike mode in the UI.

**Rule**
- Every ticker uses $1 strikes by default.
- Each ticker has an override, "$0.50 strikes", in Costs and rates. KORU's weeklies really list $0.50, but the override stays off unless set.
- Each cycle picks a leg like this:
  1. compute the Δ target at the cycle's path price and IV;
  2. take the strike on the grid whose Δ is nearest;
  3. on a tie, take the strike further from the money, the conservative choice for a short leg.
- Wings sit at least one grid step beyond their short leg.
- Contracts are whole, and so are shares (unless fractional shares are switched on; calls still need full 100-share lots).

**Why it matters (checked):** at $20, IV 130 and 7 days, a 30Δ target lands on the $22 call.

| | $22 call (on the grid) | 22.36 (continuous) |
|---|---|---|
| Δ | 33.2 | 30.0 |
| Premium | 3.58% of spot | 3.12% of spot |
| Distance from spot | 10.0% | 11.8% |

As the path rises, the actual Δ moves up and down between about 25 and 35 from one strike to the next. Premium and distance follow that pattern from cycle to cycle.

**Effects on the plan**
- The growth card shows the strike actually used, with its real Δ and distance.
- The table's Δ and % OTM columns become default columns rather than optional ones.
- Every number in Part 1 §A and Part 2 was computed with continuous strikes. All of them get recomputed with the $1 grid during the build, before the regression check (F1.14) is set.
- The node tests keep a continuous-strike switch, for the closed-form identities only. The realized-0 calendar product still holds with the grid, using each cycle's actual y and a.
- The engine already sizes size-dependent parts at the path price (B1). The grid is one more part of that kind.

### 0.2 Δ up to 90 on each leg, independently, in both tabs

**Comparer (the v8 copy of A vs B; v7 itself is not touched)**

*Sliders and payoff*
- Put Δ and call Δ each run from 3 to 90, independently.
- 50 is still the strike nearest the forward. Above 50 the leg is in the money, and the slider marks ATM at 50 and labels the range above it "ITM".
- When both legs are above 50, the put strike sits above the call strike (a short guts). Checked algebraically:
  - the payoff between the strikes is flat at credit − (Kp − Kc);
  - the breakevens stay Kp − credit and Kc + credit, so the current breakeven code holds unchanged;
  - worst-loss search already tests every strike inside the range.

*Margin*
- Naked legs: the Reg T formula already handles ITM legs (the OTM amount is 0).
- Capped structure: the cap rule (first strike below 17Δ above the short call) is unchanged. With an ITM short call the spread is wide, and the requirement is still min(width, naked).

*Credit and time value*
- With ITM legs, the cash credit includes intrinsic value. Every ratio built on credit switches to **time value** (credit minus intrinsic at entry): credit/σ, credit per day, credit/margin, the overview credit chart, and the "equal credit" sizing rule.
- For OTM legs time value equals the credit, so v7's numbers for OTM positions do not change.
- The Credit row shows cash, with time value beside it when they differ.

*Pricing deep ITM legs*
- The IV implied from a deep-ITM mid is unreliable, because time value is a small part of a wide spread.
- So the IV offset of an ITM leg is taken from the OTM option at the same strike, and the ITM leg is priced from it through put-call parity on the forward.
- A mid below intrinsic is flagged.

*Early assignment*
- The model stays European.
- The leg tooltip flags "early assignment likely" when time value is below the carry on the strike, or below $0.05.

*Data*
- Today's chains reach only about 70Δ on calls and 37–59Δ on puts (checked).
- v8 re-pulls both chains in one consistent snapshot, with strikes out to 90Δ on both sides:

  | Ticker | Calls down to about | Puts up to about |
  |---|---|---|
  | KORU | $10–15 | $29 (Oct), $43 (Nov), $53 (Dec) |
  | RAM | $7–10 | $19 (Oct), $27 (Nov), $32 (Dec) |

- Where the listed chain stops before 90Δ (a March 90Δ put would be KORU about $87, RAM about $55), the slider stops at the deepest listed strike and says so: "deepest listed put: 74Δ".

*Charts and labels*
- Sweep panel: x runs from 5Δ to 90Δ, with ATM marked mid-axis. In the "both legs" view, the guts region above 50 is shaded and labelled.
- Leg labels read like "70Δ ITM 18P".

*Checks*
- Guts payoff and breakevens.
- ITM naked margin.
- No NaN from an ITM mid.
- v7 regression unchanged for every position at or below 50Δ.

**Compounding tab**
- Covered calls: the call Δ can go up to 90 (a deep-ITM buy-write that trades upside for a cushion).
- Strangles: each leg can go up to 90, and guts are allowed.
- Same time-value ratios as the comparer.

### 0.3 Monte Carlo is allowed in the app

- The base Year engine stays analytic: deterministic, under 60 ms, no random noise in the main numbers.
- Monte Carlo ships in the Stress view as "Random years" (Part 2 §5): opt-in, in a Web Worker, seeded.
- Part 1's F1.15, the dev-only Monte Carlo cross-check, becomes an in-app check line in Random years: "median: random $X vs engine $Y" (with jumps off).

### 0.4 Aligning Part 2 with Part 1's code split

**Where the code lives**
- The pure parts (`yr_margin.js`, `yr_stress.js`, `yr_mc.js`) go inside YRE. The node tests load YRE only.
- The stress state (`ss`, `SSYNC`) and `yr_stress_ui.js` go inside YR.
- The tab strip gets the sub-seg Year · Stress while Compounding is active.

**One rule for marking options in the margin test**
- Part 1 marks the legs with half the cycle left. Part 2 and Monte Carlo use the actual time left.
- That is the likely cause of the one open mismatch, B (the strangle):

  | | Monte Carlo | Engine |
  |---|---|---|
  | Margin call in the year | 61% | 54% |
  | Median | $39.9k | $41.4k |

  The rally trigger also differs: +42.7% in Stress against +43.0% in Year.
- Build rule: one convention, the actual time left. If the engine can test the trigger session by session within the 60 ms budget, that closes the gap. Otherwise the gap is printed in the check line and in the method notes, and both readouts are labelled with their convention.

**Breakers on the Korean exchange (KRX), confirmed from KRX's own rule page**
- −8% and −15% on KOSPI halt trading for 20 minutes each.
- −20% ends trading for the day.
- Each level fires once a day at most, and none fires in the last 40 minutes of the session.
- So one Korean session caps the index near −20%, which is about −60% for KORU. A weekend or a US holiday can stack sessions.
- Part 2's "to be confirmed" note is resolved.

### 0.5 Your decisions

| # | Question | Decision |
|---|---|---|
| 1, 2 | Realized moves and IV | Typed or set by slider, never fixed by the app (0.7) |
| 3 | Reinvest or rebalance | Both are options; **reinvest is the default** (0.6) |
| 4 | Selling on a margin call | Both are options; **only what IBKR requires is the default** (0.6) |
| 5 | Trading during a multi-week stress move | Both are options; keeps trading is the default (0.6) |
| 6 | Jumps in Random years | **Not implemented.** These were sudden overnight gaps, such as the −35% open on 3 Mar 2026, added to the random years on top of the normal daily moves. The jump presets, the calibration table and the jump validation in Part 2 §5 are dropped. Random years keeps plain random moves at the realized input. |

Defaults taken without asking (overrule any time):
- B is a KORU strangle with the same week-1 credit as A; KORU against RAM is one click away.
- Stress hits the typical account; the high-leverage account is one click away and overlaid.

### 0.6 "Modus operandi": a separate module for how the account is run

What you sell (ticker, cadence, strikes, size) defines the strategy. How you run the account is a separate set of rules. Those rules live in their own pure module, `yr_modus.js`, inside YRE. The Year engine, Stress and Random years all read the same rule object, so the three can never disagree about how you behave.

#### Rules per run

**1. Credit after expiry**
- **Reinvest** (default). The kept credit goes back into the position.
  - Covered calls: credit × λ buys KORU.
  - Strangles: the next cycle is sized from the grown NAV, as in your other app ("size the next week from the grown capital").
- **Rebalance to target leverage.** Shares go back to λ·NAV at each expiry: sold after drops, bought after rallies. Strangles behave as under Reinvest.
- **Keep as cash.** The baseline that shows what reinvesting adds.
  - Covered calls: the shares stay at their starting count.
  - Strangles: sized from the starting capital.

**2. On a margin call**
- **Only what IBKR requires** (default). Sell the smallest whole amount that restores the requirement. The account then sits at the limit, so further drops force further sales.
- **Sell back to a target**, default 1.0x, which can be set.

Under either rule, calls on shares that are sold are bought back. For strangles, IBKR-minimum closes contracts pro rata until the requirement is met.

**3. During a multi-week move** (Stress only)
- **Keeps trading** (default): new calls or strangles at each expiry, under rule 1.
- **Stops at the first move:** hold, sell nothing new.

#### UI
- In the dock, each run gets a collapsed section, "Modus operandi", with a summary line such as "reinvest · IBKR minimum · keeps trading".
- "B differs in" → More ▾ gains "Modus".
- The Stress view's Rules ▾ no longer carries its own margin-call rule. It shows the run's rule read-only, with a link to the dock.

#### What the IBKR-minimum default costs the engine
After a call the account rides the limit, so the result depends on how low the price went in the cycle, not only on where it closed.

- **Touched branch:** the engine integrates over the closed-form joint distribution of the cycle's low and its close, as a 2D quadrature. This applies on the touched branch only; the untouched branch is unchanged.
- **During the fall:** the position is rebalanced at the maximum leverage 1/m. The small within-cycle drag of that rebalancing is applied as an expected value.
- **Shares after the low:** they are held.
- **Checks:** Random years is the cross-check. The F2 time limits are measured again.
- **Fallback:** if the touched branch goes over budget, it uses a coarser 2D grid with a fixed resolution, and the check line prints the gap.

#### Effect on the numbers
The odds of a margin call in Part 1 are odds of a *first* call, and they stay the same. What follows the call changes, so every post-call figure is recomputed in the build:
- typical and 10–90% results for the runs with calls;
- the breakdown;
- Stress losses.

### 0.7 IV and realized moves: your inputs, plus an IV path

**Inputs**
- Both are a number box paired with a slider.
- IV runs from 40 to 250%; realized moves run from 0 to 250%. Both move in steps of 1.
- The slider carries labelled reference ticks so a value means something at a glance.
  - KORU: today's weekly IV 121, monthly 130, HV30 117, 1-year realized 173, 5-year realized 101.
  - RAM: its own references.
  - Realized 0 is labelled "exactly on the path".
- Starting values: IV 130 and realized 117. These are only where the sliders start.
- They live in the sticky bar's "IV / moves" group. They are typed directly, or set by a slider in its popover.

**IV path (my call on timing)**
- **The engine carries IV and realized moves per cycle from the first build** (arrays, constant by default). Adding the editor later therefore touches no engine code.
- **The editor lands as step 2 of the v8 build,** right after the Compounding tab passes its screenshot pass.
- **It reuses the price-path editor,** with the same modes: flat · line · points · growth.
- **Where it shows:** as a 90px IV strip directly under the price chart, on the same week axis and crosshair.

How the IV path differs from the price path:
- It may fall, since a slow grind down is the case you described.
- Realized moves follow it under one of two settings:
  - **"Keep the gap to IV"** (default): when IV drifts, realized moves keep the same distance below it, so the edge holds.
  - **"Stay constant":** a falling IV shrinks the edge, and can turn it negative.

**Stress**
- The IV response after a shock (Part 2 §2.4) starts from that week's IV on the path.

---

## Part 1. The debated plan (Compounding tab and app shell)

_Author vs. finance-model critic vs. product/architecture critic, two rounds. Numbers here use continuous strikes; they are recomputed on the $1 grid per 0.1._

v7 sources and `outputs/ram_koru_strangles_v2.html` are not touched. v8 is a fresh build that writes `outputs/ram_koru_lab_v8.html`.

**Default settings behind every number below:**
- Account: $30,000 start, KORU at $20, flat path, 52 weeks starting Fri 2 Oct 2026.
- Vol: IV 130% for both cadences, realized moves 117% (HV30).
- A: 30Δ weekly covered calls at 1.2x, policy "Add credit".
- B: 20/20Δ weekly strangle at 50% of margin used.
- Fills: mid minus 25% of the half-spread. $0.65 per contract. Whole shares. Cap of 250 contracts.
- Rates: tiered IBKR Pro on a 4.0% benchmark.
- Strikes are continuous. Margin is checked once a day.

"Typical" means the median.

**Reference prototypes** (for the build, not shipped):
- `plan_debate/eng5.js`: final semantics, all families.
- `plan_debate/fastcc.js`: the loop structure the shipped engine must use; it gives the same numbers as eng5.
- The runs behind every number are `plan_debate/f_*.js` (final round) and `r*.js`.

---

### A. Answers to the user's direct questions

#### A1. What $1,000 of weekly credit buys in KORU at $20

Buying power per dollar of equity is 1/m, where m is the margin requirement on what you buy.

| Account rule | m | $1,000 of equity buys | Shares |
|---|---|---|---|
| KORU (3x) at IBKR (initial = maintenance) | 75% | $1,333 | 66 |
| Same, at a 1.2x leverage policy | | $1,200 | 60 |
| No loan | 100% | $1,000 | 50 |
| RAM (2x), 50%/50% | 50% | $2,000 | 145 RAM at $13.74 |
| SPY or a blue chip, Reg T overnight | 50% | $2,000 | 100 of a $20 stock |
| SPY, intraday day-trading buying power | 25% | $4,000 | intraday only; it cannot carry a weekly hold |

The like-for-like comparison for an overnight hold is $2,000 of SPY against $1,333 of KORU.

**Can all $1,000 go into KORU?** Yes, once the credit is kept: at expiry it is cash, and cash is equity. Two limits apply.

**Limit 1: there is no cushion at the maximum.** Initial equals maintenance, so the last dollar of buying power is margin-called on the first tick down. At leverage λ, the largest drop before a margin call is d* = (1/λ − m)/(1 − m). The odds below are for shares only, weekly, at 117% realized, checked daily.

| λ | 1.00 | 1.10 | 1.20 | 1.25 | 1.30 | 1.333 |
|---|---|---|---|---|---|---|
| Drop tolerated | 100% | 64% | 33% | 20% | 8% | 0% |
| Margin call within a year, reset to λ each week | 0% | 0% | 26% | 100% | 100% | 100% |
| Margin call within a year, never trimmed (buy and hold) | 0% | 39% | 72% | 83% | 92% | 97% |

Covered calls help, because the kept credit sits in cash and lowers the loan. The 1.2x covered-call account tolerates a 45.5% drop from the start of a week. Its odds of a margin call within a year depend on the policy:
- Reset each expiry: 0.4%.
- Add credit: 54%, because leverage climbs after drops and nothing trims it.

**Limit 2: the day you sell.** IBKR may show the premium as buying power on the day of the sale, because US options are left out of equity with loan value. Spending it then borrows against money the short calls can still take back. The engine reinvests only after expiry, and the growth card says so once.

**Covered lots.** One more 100-share lot at $20 means $2,000 of KORU. It takes this much new equity:

| Leverage | New equity per lot | Weeks per lot at $1,000 kept per week |
|---|---|---|
| 1.33x | $1,500 | 1.5 |
| 1.2x | $1,667 | 1.67 |
| No loan | $2,000 | 2.0 |

That pace holds only exactly on the path. With realized moves, about 20% of the premium is kept as edge (A2), and the default A goes from 18 lots to 23 in a typical year.

#### A2. The growth function

Per cycle (one week for KORU weekly), define:

| Symbol | Meaning | Default value |
|---|---|---|
| λ | KORU value / NAV | at most 1/m |
| c | coverage = 100·calls / shares | below 1 for small accounts, e.g. 0.56 at $3k |
| y | premium / spot | 3.13% (30Δ weekly at 130: K = 22.36) |
| a | strike distance | 11.8% |
| g | the path's step | |
| e | expected call payout / spot | |
| r(λ) | effective loan rate if λ > 1, else effective cash rate | |
| T | cycle length in years | |

The NAV return per cycle is:

    R = λ·(g + c·(y − e)) + (1 − λ)·r(λ)·T

**Exactly on the path (realized 0).** Here e = max(0, g − a), so the strike caps the path.

Literal toy: frictionless, λ held at 1.2, 7-day weeks, loan rate 5.5%, continuous 30Δ strike.

| g per week | R per week | NAV in 52 weeks | Shares in 52 weeks |
|---|---|---|---|
| 0 (flat) | 3.73% | ×6.7 | ×6.7 |
| 0.78% (+50% a year) | 4.67% | ×10.7 | ×7.2 |
| 5% | 9.73% | ×125 | ×9.9 |
| 11.8% (= a) | 17.87%, capped from here | ×5,170 | ×15.8 |
| 20% | 17.87% | ×5,170 | ×0.39 (the path outruns the account) |

Identity check: at realized 0, flat, fractional shares, frictionless, rates 0, the engine gives $203,695.84 under both policies. That equals the product over the real calendar.

**With realized moves (the default),** e is the expected payout over the lognormal spread around the path's next price. The year's outcome comes from the distribution of ln NAV, which the engine tracks exactly.

The table uses $30,000 start. Weekly KORU unless noted. "Shares at end" is the median share count, not the NAV median ÷ price.

| Run | Exactly on path | Typical | 10%–90% | Average | Margin call in year | Shares at end |
|---|---|---|---|---|---|---|
| Shares only, 1.0x | $30.0k | $30.0k | $6.7k–$134k | $59.4k | 0% | 1,500 |
| Shares only 1.2x, never trimmed | $29.7k | $27.9k | $5.9k–$140k | $62.0k | 72% | 1,417 |
| Shares only 1.2x, reset weekly | $29.7k | $25.2k | $4.1k–$152k | $67.2k | 26% | 1,511 |
| Covered calls 30Δ 1.0x, Reset (no loan ever) | $138.8k | $43.9k | $13.4k–$136k | $64.1k | 0% | 2,220 |
| **Covered calls 30Δ 1.2x, Add (default A)** | $188.1k | **$43.2k** | $11.5k–$151k | $68.3k | 54% | 2,306 (23 lots) |
| Covered calls 30Δ 1.2x, Reset | $186.9k | $42.5k | $10.0k–$167k | $73.9k | 0.4% | 2,554 |
| Covered calls 30Δ 1.33x, Add | $228.4k | $43.5k | $12.0k–$145k | $66.6k | 84% | 2,288 |
| Covered calls 1.2x Add, monthly | $67.0k | $38.2k | $9.7k–$134k | $59.4k | 44% | 2,146 |
| Same, weekly at IV 121 (today's weekly) | $167.1k | $34.5k | $9.5k–$117k | $53.4k | 54% | 1,802 |
| Same, monthly at IV 131 (today's Nov) | $67.8k | $38.6k | $9.7k–$136k | $60.3k | 44% | 2,174 |
| Same, weekly, realized = 130 | $188.1k | $31.9k | $7.8k–$121k | $53.4k | 56% | 1,630 |
| Covered strangle 30/20Δ 0.6x, Add | $141.3k | $41.3k | $18.2k–$111k | $57.1k | 46% | 1,176 |
| Strangle 20/20Δ, 30% of margin used | $94.4k | $37.7k | $26.0k–$51.2k | $38.2k | 0.2% | 11 contracts |
| **Strangle 20/20Δ, 50% (default B)** | $207.2k | **$41.4k** | $21.7k–$71.4k | $44.4k | 54% (on rallies) | 20 contracts |
| Iron condor 20/20Δ, 5Δ wings, 50% | $631.1k | $32.2k | $7.6k–$115k | $50.9k | 0% | 45 contracts |
| RAM monthly covered calls 30Δ 1.2x Add (IV 117, realized 102) | $62.9k | $39.3k | $9.5k–$123k | $55.0k | 15% | 3,275 |
| Path 20 → 30: covered calls 1.2x, Add / Reset | $287.8k / $300.1k | $60.7k / $61.1k | | | 43% / 0.3% | 2,127 / 2,447 |
| Path 20 → 30: shares 1.0x / 1.2x Add | $45.0k / $47.7k | $45.0k / $43.2k | | | 0% / 62% | 1,500 / 1,473 |

**How A and B build up over the year** (median):

| Week | 0 | 13 | 26 | 39 | 52 |
|---|---|---|---|---|---|
| A, shares | 1,800 | 1,873 | 1,983 | 2,139 | 2,306 |
| B, contracts | 14 | 17 | 18 | 19 | 20 |

**Leverage sweep:** covered calls 30Δ weekly; typical end NAV · odds of a margin call in the year.

| λ | 0.50 | 0.75 | 1.00 | 1.10 | 1.20 | 1.25 | 1.30 | 1.33 |
|---|---|---|---|---|---|---|---|---|
| Add credit | $36.2k · 0.2% | $39.8k · 0.1% | $43.9k · 0.1% | $44.1k · 23% | $43.2k · 54% | $43.2k · 66% | $43.3k · 77% | $43.5k · 84% |
| Reset each expiry | $40.1k · 0% | $43.0k · 0% | $43.9k · 0% | $43.4k · 0% | $42.5k · 0.4% | $41.8k · 36% | $41.0k · 100% | $40.8k · 100% |

The small odds under Add at λ ≤ 1 are real, not a bug. A rally through the strike is paid from cash, and Add sells only λ times the loss in KORU, so a small loan can appear. The method notes say this in one line.

**Margin-used sweep:** 20/20Δ weekly strangle.

| Margin used | 10% | 20% | 30% | 40% | 50% | 60% | 80% |
|---|---|---|---|---|---|---|---|
| Typical | $32.5k | $35.2k | $37.7k | $40.1k | $41.4k | $41.2k | $37.9k |
| Margin call in the year | 0% | 0% | 0.2% | 8% | 54% | 96% | 100% |

**Findings,** worded for the UI notes:

1. **IV minus realized sets the result.** The headline premium does not. IV 121 instead of 130 takes A from $43.2k to $34.5k. Realized 130 instead of 117 takes it to $31.9k.
2. **Weekly against monthly depends on the term structure.**
   - Same IV for both: weekly wins, $43.2k against $38.2k.
   - Today's weekly 121 and monthly 131: monthly wins, $38.6k against $34.5k.
3. **Under "Add credit", putting the credit into KORU on margin mostly buys margin-call risk.** The typical result stays at $43–44k from 1.0x to 1.33x, while the odds of a margin call go from 0.1% to 84%. Under "Reset", leverage lowers the typical result, from $43.9k to $40.8k.
4. **"Exactly on the path" overstates the result by 4x or more:** $188.1k against $43.2k.
5. **Same weekly credit, different shape.** A and B both collect $1,095 net in week 1, and both get a margin call in 54% of years: A on drops, B on rallies. Their typical results are close ($43.2k and $41.4k), but B's range is much narrower ($21.7k–$71.4k against $11.5k–$151k).

---

### B. The model in one page

#### B1. Reading of the path

- The user draws KORU's typical (median) price at each week; the path never falls.
- In each cycle, ln(end price / start price) is normal, with median ln(S1/S0) and sd v = realized·√(days/365).
- Cycles are independent given their start.
- Everything scales with price (Black is homogeneous, and Δ strikes scale with spot). So the account is tracked as ratios, and only the size-dependent parts use dollars: whole lots, the cap, commissions, minimum ticks and tiered rates. Those parts are sized at the path price.
- With realized moves set to 0, every result collapses to the literal toy.

#### B2. State

**Run inputs:** `{tk, cad: wk|mo, fam: cc|str, kBy: d|pct, cd, cpct, pd, ppct, puts: 0|1, lev, pol: add|reset, use, wc, wp}`.
- `cd = 0` is the shares-only baseline.
- `wc` / `wp` are the wing Δ, or off.

**Per run,** a distribution over states at each expiry:
- **Reset runs and strangles** have one state.
- **Add runs** use a lattice over λ:
  - bins at 0, 0.02, …, up to the largest multiple of 0.02 not above 1/m, plus a top bin at exactly 1/m when 1/m is not on that grid. KORU has 67 + 1 bins (… 1.30, 1.32, 1.3333); RAM has 101 (to 2.00);
  - mass is split linearly between neighbouring bins;
  - bins with mass below 1e-10 are pruned.
- **Realized 0** runs one exact state with no lattice. Under Add it tracks λ exactly.

**Accumulators per bin** (12 typed arrays, double-buffered):
- mass not yet called; mass already called;
- Σ L, Σ L², Σ L³, where L = ln(NAV/NAV0);
- Σ u, Σ u², Σ u³, where u = ln((NAV/NAV0) / (x/S00)), i.e. NAV counted in KORU units;
- Σ NAV/NAV0, for the average track.

#### B3. Per-cycle recursion, exact order

For each cycle (w0 → w1; calendar days d; days to the horizon d_h; T = d/365; T_h = d_h/365; τ_rem = (d − d_h)/365):

1. **Path and vol.** S0 = path[w0], S1 = path[w1]; μ = ln(S1/S0); v = realized·√T_h. IV = IV[ticker][cadence], plus the smile offset when "today's shape" is on.
2. **Strikes**, continuous unless "listed grid" is on:
   - Δ target at IV(K) over T; Δ 50 = the forward; or S0·(1 ± p).
   - The put is held at or below the call.
   - Wings sit at least one grid step beyond their short leg.
3. **Premiums.** Black at S0, with a pricing rate of 4% (D.meta.rate).
   - Sell fill = mid − give·h(mid); buy fill = mid + give·h(mid); h(p) = max($0.025, 7%·p).
   - Black values are cached per cycle.
4. **For each state (bin):**
   1. Size from the bin's NAV, NAV0·exp(ΣL/mass).
      - Covered calls: n = λ·NAV/S0 shares; calls = min(floor(n/100), cap); puts = calls if "also sell puts".
      - Strangles: contracts = min(floor(use·NAV/(100·q)), cap), where q is the structure requirement per share (B5).
   2. Cash per $ of NAV after the credit and commissions.
   3. Interest to T_h, tiered.
   4. Trigger(s) (B5).
   5. Touched mass pT (B6).
   6. No-touch integral and touched integral (B6). Each node gives NAV_end, the next λ, and the stock trade cost. It deposits ln R and ln R − ln X into the next lattice.
5. **Cycle outputs** (B7).
6. **Weeks inside a monthly cycle** (chart only). Rerun steps 4.4–4.6 with the horizon at that week, marking options at Black with the time left. These give moments only; no state is advanced.
7. **The last monthly cycle past week 52** (RAM: 17 Sep → 15 Oct 2027) is marked at week 52 in the same way.

#### B4. Settlement and leverage policy

**Settlement.**
- Each leg pays its expected payoff over the cycle's end-price distribution. There is no kept-share input.
- In-the-money legs settle at intrinsic.
- Short calls in the money cost a stock round trip (assignment and rebuy); share counts change only through the policy's trade.
- There is no early assignment.

**Edge kept** is an output: 1 − (expected payout with the pricing forward at realized vol) / premium. For the 30Δ weekly call at 130/117 it is 19.5%. It is shown next to "KORU's average drift under this reading: +1.3% a week". The table's "payout, average" column uses the model's own distribution.

**Leverage policy** (covered-call family). Both policies start with λ·NAV in KORU.
- **Add credit** (default): at each expiry, the cycle's option result (credit, minus the cost at expiry, minus commissions) times λ moves into KORU, or out of it if negative. Buys never take λ above 1/m. Leverage drifts: down on rallies, up on drops.
- **Reset each expiry:** shares are set back to λ·NAV.

**Strangles** resize from NAV each cycle.

#### B5. Margin (IBKR, leveraged ETFs)

**Long shares.** m = min(25% × leverage factor, 100%), for initial and maintenance alike: KORU 75%, RAM 50%. Editable per ticker.

**Naked options.** The Reg T percentages are multiplied by the leverage factor L, capped at 100%:
- call: mark + max(min(0.2L, 1)·x − OTM, min(0.1L, 1)·x);
- put: mark + max(min(0.2L, 1)·x − OTM, min(0.1L, 1)·K).

**Structures.**
- Strangle: max(call requirement + put mark, put requirement + call mark).
- Iron condor: the larger spread width.
- One wing: the naked side's requirement plus the width. This is conservative and unconfirmed; the notes ask the user to check it with an IBKR what-if order.
- Covered calls: the stock requirement only. In the table's requirement column, in-the-money shares are valued at min(x, K).

**Test.** Equity with loan value ≥ requirement.
- Equity with loan value = cash + shares; US options are excluded.
- Option marks in the test are Black with half the cycle left.

**Trigger solvers.** These are fixed rules; nothing depends on elapsed time.
- Plain covered calls use a closed form: X_b = −cash / ((1 − m)·λ), or x_b = loan / ((1 − m)·n).
- All other cases use a bracketed Illinois root finder on the margin excess: tolerance 1e-7 in X, at most 40 steps, typically under 8. It looks down for share runs and covered strangles, and both ways for strangles.
- Measured on the covered strangle: Black evaluations fall from 146k (bisection) to 23k.

**Daily checks.**
- The odds use the trigger shifted away from S0 by 0.5826·realized/√252 (4.3% at 117%). The forced fill happens at the shifted price.
- Readouts show the unshifted trigger as a % move from the cycle start.

**On a margin call:**
- **Share runs:** sell down to min(λ, 1.0x) of NAV at the fill price. Puts, and the calls on sold shares, are bought back at the natural price (mark + half-spread). The rest runs to expiry. At the next expiry, Reset returns to λ, and Add carries on from the leverage it has.
- **Strangles:** every leg is bought back at the natural price, and the cash earns interest to expiry. The next cycle resizes from NAV.

**Caveat** (method notes): gaps far beyond a daily move are outside lognormal tails. A −15% Korea day is about −45% for KORU.

#### B6. Touched and untouched mass

Work in y = ln(x/S0), with a down trigger β < 0 and/or an up trigger α > 0.

**Touched mass pT** always comes from a closed form, never as "1 − quadrature":
- **No finite trigger:** pT = 0, and the touched branch is skipped. This covers every covered-call state with λ ≤ 1 at the cycle start and no short puts.
- **One trigger:** pT = N((β−μ)/v) + e^{2μβ/v²}·N((β+μ)/v), mirrored for α.
- **Two triggers:** pT = 1 − S, where

      S = Σ_{k=−4..4} [ e^{2μkw/v²}·ΔN(α−2kw, β−2kw) − e^{2μ(α+kw)/v²}·ΔN(−α−2kw, β−2α−2kw) ]

  with w = α − β and ΔN(a, b) = N((a−μ)/v) − N((b−μ)/v). Each term is computed as exp(exponent + ln ΔN), and skipped when ΔN = 0. This form matches a 2,000-panel quadrature to 1e-6, and stays finite at realized 5%.
- The split between the two sides is in proportion to the single-trigger touch odds.

**No-touch part.**
- Killed density: φ(y−μ) − e^{2μβ/v²}·φ(y−2β−μ) for one trigger; the image series times the drift tilt for two.
- Simpson rule with 60 panels on (μ ± 8.5v) ∩ (β, α), split at each strike.
- The weights are rescaled so they sum to exactly 1 − pT. Quadrature error therefore never reaches the odds or the moments.

**Touched part.**
- **Share runs:** this branch is entered only if β is finite and x_b > 0. The post-call position runs over the reflected end density: φ(y−μ) for y < β, and e^{2μβ/v²}·φ(y−2β−μ) for y > β. Weights are rescaled to sum to pT.
- **Strangles:** NAV is a lump at the fill. For the u moments only, the end price is spread over the same reflected density on that side.

**Resolutions.** These are fixed per render mode, never chosen by measured time.
- Settled (full) renders always use h = 0.02 with 60 panels. This includes every number in this plan.
- The live preview, shown only while a slider or point is being dragged, uses h = 0.04 with 30 panels. Its strip numbers are shown muted.
- Coarse against fine, across 5 sweep families: medians within 1.0%, odds within 3.7 points. That gap is why the preview is muted and replaced on release.

#### B7. Outputs per cycle

**NAV.**
- Typical = exp(μ_L + σ_L·(−γ/6)): the Cornish-Fisher median from the first three moments, with skew γ clamped to ±1.
- 10% and 90% are Cornish-Fisher quantiles at ∓1.2816.
- Also shown: average, exactly on the path, frictionless (B9).

**Odds of a margin call:** so far (the called mass), and in this cycle.

**Shares.**
- ln shares = ln λ_bin + ln(NAV0/S00) + u.
- Each bin's raw u-moments are shifted by a = ln λ_bin + ln(NAV0/S00), using Σ(u+a) = Σu + p·a, and so on up to the cube. They are summed over bins; bin 0 is clamped at λ = h/2.
- Median shares, and their 10% and 90% points, come from Cornish-Fisher.
- Lots = floor(median shares / 100).
- Checked against a daily Monte Carlo (frictionless, Add 1.2x):

  | | Monte Carlo | Engine |
  |---|---|---|
  | Median | 2,466 | 2,440 (−1.1%) |
  | 10% / 90% | 1,319 / 3,996 | 1,289 / 4,033 |

  Reset 1.2x: 2,694 against 2,694.

**Contracts** (strangles): use·(NAV0/S00)·exp(median u) / (100·q̂), where q̂ = q/S0. The ratio q/S0 does not depend on spot.

**Typical λ** = exp(E ln λ). It is shown in the growth card and in a table column.

#### B8. Cadence

**Listing facts** live in `D.cal`, per ticker: `{weekly, asOf: "2026-10-01", listed: [...]}`.
- KORU lists weeklies about 6 weeks out, then monthlies.
- RAM lists monthlies only: 16 Oct, 20 Nov, 18 Dec, 19 Mar 27, Jan 28, Jan 29.

**Weekly calendar.**
- Week 0 is Fri 2 Oct 2026.
- An expiry on a Friday holiday moves to the Thursday before: Thu 24 Dec, Thu 31 Dec, Thu 25 Mar, Thu 17 Jun 2027.
- 52 cycles of 6–8 days, 364 days in all.

**Monthly calendar.**
- Third Fridays, with the same holiday rule.
- 16 Oct is a two-week stub, then 20 Nov … 17 Sep. 15 Oct 2027 is marked at week 52.
- 13 cycles of 14–35 days.

**A monthly run on the weekly path** trades only at cycle starts. Credit and reinvestment happen once per cycle.

**Allowed cadences:** KORU weekly or monthly; RAM monthly only. Two-week cycles are not offered.

**The IV input used** follows the cadence.

#### B9. Closed form, breakdown, compute

**Closed form.** The A2 formula, filled in per cycle, is the growth card. Exact against second-order growth is covered in the method notes.

**Breakdown.** A chain of runs on the typical track, with differences that add up exactly.

Share runs:

| Step | Run | Default A |
|---|---|---|
| start | | |
| path | KORU held, no loan | $0 |
| leverage | shares only at λ, same policy, frictionless, with interest and margin calls | −$2.1k |
| options | the strategy, frictionless | +$18.1k |
| costs | the real run | −$2.7k |
| end | | **$43.2k** |

Strangles:

| Step | Default B |
|---|---|
| start → options and interest (frictionless) | +$14.5k |
| costs | −$3.1k |
| end | **$41.4k** |

**Compute.**

The engine is a stepper: `YRE.start(run, sc, costs, rates, {res, literal})` returns `{step(budgetMs), done, out}`. Stage 1 steps to completion; stage 2 steps in slices.

Measured in node 22, same V8, warm. Times are per run.

| Run | eng5 (closures) | fastcc, full | fastcc, preview |
|---|---|---|---|
| A default | 151 ms | 42 ms | 14 ms |
| A 1.33x | 176 ms | 46 ms | 12 ms |
| A 104 weeks | 345 ms | 97 ms | 25 ms |
| A monthly | | 12 ms | 3 ms |
| RAM monthly Add | | 22 ms | 7 ms |
| Any Reset run | | ~1 ms | |
| Strangle | 3–6 ms | | |
| Sweep, 26 runs | 2,191 ms | 610 ms | |

**Required loop structure** (as in fastcc.js):
- typed buffers reused across cycles;
- node arrays preallocated;
- no closures and no allocation in the node loops; deposits inline;
- closed-form triggers for plain covered calls;
- Black values cached per cycle;
- pruned bins.

**Stage 1** (on every input): A, B, and the two exactly-on-the-path runs.

**Stage 2** (deferred, sliced into steps of 16 ms or less, cancelled by newer input):
- breakdown chains: up to 2 extra lattice runs per run;
- the sweep, at full resolution so it agrees with the strip:
  - KORU λ ∈ {0.5, 0.75, 1.0, 1.1, 1.2, 1.25, 1.3, 1/m}, plus the current value;
  - RAM λ ∈ {0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0}, plus the current value;
  - both policies; Reset runs are almost free;
  - strangles: margin used from 10% to 100% in steps of 10, plus the current value.

---

### C. Price path

**Modes** (a compact select in the sticky bar), each with one number beside it:

| Mode | Input | Bar text |
|---|---|---|
| Flat | none | "Flat" |
| Line | an end price | "to [30.00]" |
| Points | (week, price) anchors | "4 points, ends 32.00" |
| Growth | % per week or per year | "[1.0] % ▾ wk/yr" |

**Path ▾ menu** (about 300px wide):
- start price, defaulting to the ticker's spot (KORU 20.02, RAM 13.74), with "reset to spot";
- between points: same $ or same % each week;
- the growth unit.

**One path for both runs,** stored as a multiple of the start price. When the tickers differ, the price chart's y axis is a multiple of the start price, with KORU $ on the left and RAM $ on the right. Each run's strikes are plotted relative to its own start, and tooltips give both $ values.

**Granularity:** path[0..W], one price per week, with W from 4 to 104 (default 52).

**The path never falls. The app says so wherever it enforces this; nothing is clipped silently:**
- **Points:** a price below the previous point is held at that price, with an amber row note "held at 24.00: the path cannot fall". Raising an earlier point raises later ones, each with its own note.
- Duplicate weeks merge, with a toast.
- Points after the horizon are greyed: "after week 52, not used".
- **Line:** an end below the start becomes flat, with an inline note.
- **Growth:** a negative input becomes 0, with an inline note.

**Editing points** (Points mode only):
- **Shared x geometry.** One object per render ({left, right, plotW, x(week)}) is used by all three stacked charts. In Points mode the right margin of the whole stack grows by 240px. The points table (week · price · % from start · ×, then "+ point") sits in that column, top-aligned with the price chart, and may run down beside the NAV chart.
  - Acceptance: week 26 has the same x in all three charts in every mode.
- **Drag:**
  - anchor dots move vertically only, clamped between their neighbours;
  - a clamped dot turns amber, with a halo label "held at $24.00";
  - the drag runs on a persistent overlay SVG that renders never rebuild, with the y scale frozen from pointerdown to pointerup;
  - the overlay also redraws the path line through the dragged point;
  - stage 1 runs at preview resolution once per animation frame;
  - on pointerup the price SVG is rebuilt and a full render runs.
- **Double-click** adds a point at the nearest week. A single click pins the week (D5); it sets the pin and never toggles it, so a double-click does no harm.
- **Keyboard:** up and down arrows move a focused dot by $0.10, or by $1 with Shift.

---

### D. Compounding tab layout

#### D1. Page frame

**Tab strip.**
- A 30px strip inside `<main>`: sticky at top 0, z-index 32.
- Contents: "RAM · KORU options lab" (15px) · tabs **Compare A vs B** | **Compounding** · ⋯ page menu.
- The ⋯ menu holds: theme, view code (copy/load), Reset this tab, Reset both tabs.
- The dock stays `position:fixed; top:0`, full height, unchanged from v7.
- The data line sits under the strip and does not stick.

**Control bars.** Each tab's control bar is sticky at top 30px. Panel scroll-margin-top goes from 110px to 140px.

**Compounding tab, top to bottom:**
1. sticky bar;
2. result strip;
3. stacked charts (price path and strikes · NAV · shares and contracts);
4. growth card (left) beside the leverage sweep (right);
5. credit (left) beside margin (right);
6. week by week (collapsed);
7. method and caveats (collapsed).

**Right dock:** "Runs" (`#ydock`).

**Markup and size:**
- Markup follows v7: inline span groups, and font size and weight for hierarchy (run headings > control labels > readouts). No wall of flex containers.
- Desktop only, from 1200px.

#### D2. Fixed quick config (sticky bar, two rows)

**Row 1:**
- Chip A · vs · chip B. Chip text follows v7's `pName`: ticker, cadence and strategy, e.g. "KORU weekly covered calls" against "KORU weekly strangle". Δ, leverage and policy are added only where A and B differ. The full definition is in the chip's tooltip.
- The × that drops B appears on hover or focus. With B dropped, its chip reads "+ B".
- Swap.
- **B differs in:** Strategy · Ticker · Cadence · Strikes · More ▾ (Size · Policy · Vol · Anything).

**Row 2:**
- Start $ · Weeks · Path [mode] + its one number · Path ▾.
- "IV / moves" followed by one pair per ticker in use, e.g. "KORU 130/117 · RAM 117/102":
  - wk/mo IV appears only when a monthly run exists;
  - when B differs in Vol, B's pair is orange;
  - the "moves" tooltip says "0 = exactly on the path".
- Vol ▾: smile flat / today's shape.
- Reading ▾: Typical / Average; $ / × start.

**Height,** measured with v7's CSS and the dock open (`p_mock3.js`): 90px at 1440 and 150px at 1200, in both the default and the KORU-vs-RAM case. Acceptance: no taller than v7's bar at the same width (91px / 152px).

**The cadence fact** does not take a bar row. Chip B reads "RAM · monthly", and the dock's B section carries the note and the "Make A monthly too" button.

#### D3. Submenus: what defines the runs (dock)

**Section A:**
- Ticker.
- Cadence. RAM weekly is disabled, with the reason: "RAM lists monthly options only (third Fridays). As of 1 Oct 2026: 16 Oct, 20 Nov, 18 Dec, 19 Mar, Jan 28, Jan 29."
- Strategy: Covered calls / Strangle.
- Call Δ and put Δ sliders, with a live readout of strike, % OTM, Δ and premium. A Δ of 50 makes a straddle.
- Size:
  - covered calls: a Leverage slider from 0.5x to 1/m, reading "1.20x · margin call after a 33% drop (45% with this week's credit)", plus a Policy seg (Add credit / Reset each expiry);
  - strangles: Margin used from 10% to 100%, reading "50% · 0.93x NAV a side · margin call on +43% or −98%".
- Protection ▾: wings.
- More legs ▾: "also sell puts". The note "leverage held by put margin" appears when that binds.
- The run's ⋯ menu: "Set by % OTM instead".

**Section B:** "Same as A, but …", followed only by the controls that differ. The full editor is under Anything. When B differs in Ticker and A is KORU weekly, this section reads "B also differs in cadence: RAM has no weeklies", with a "Make A monthly too" button.

**Bottom, collapsed: "Costs and rates":**
- fill give-up;
- spread model;
- $/contract;
- stock $/share (with a $1 minimum) and half-spread;
- liquidity cap;
- whole or fractional shares;
- round lots;
- strikes on the listed grid;
- benchmark %;
- tiered or flat rates;
- margin % per ticker.

#### D4. Display-only (next to what they change)

**Panel ⚙ menus:**
- NAV overlays: the other track; exactly on the path (switches the axis to log, with a note); the 10–90% range (off / A / B / both).
- Sweep: A | B seg.
- Credit: cumulative or per cycle.
- Margin: odds so far, or cushion in σ.
- Table: run, columns, CSV.
- Price chart: wiggle band on/off.

**The Reading ▾ menu** (sticky bar) is the only global display switch.

#### D5. Charts

**Result strip.** One row per run, with colour keys. Columns:
- typical end NAV and × start (large);
- 10%–90%;
- margin call in the year, e.g. "54%, on a +43% rally";
- median shares · lots, or contracts;
- credit collected (typical account);
- small, with tooltips: average, and exactly on the path.

Under the rows is one breakdown line per run (B9). It shows "…" until stage 2 lands. When Reading = Average, the large number follows the reading and the label says so. During the live preview the numbers are muted.

**Stacked charts.** One x geometry, one crosshair, and one tooltip with all three charts' values.

1. **Price path and strikes** (170px):
   - the path (ink), with anchor dots in Points mode;
   - each cycle's call strike as an A- or B-coloured segment; puts dashed;
   - the wiggle band: path·e^{±v} at cycle ends, light grey, on by default;
   - monthly cycle ticks;
   - red marks where the path ends above the strike.
   - Hover shows date, price, strikes, % OTM, and the odds of finishing in the money.
2. **NAV** (320px):
   - A and B on the Reading track (solid, 2px), plus a grey "KORU held, no loan" line, which equals the path × start/S0 on the typical track;
   - end labels with halo, e.g. "A $43.2k ×1.44";
   - overlays as listed in D4.
3. **Shares and contracts** (150px):
   - one scale: contracts on the left axis, shares on the right, at exactly 100 shares = 1 contract;
   - A: calls sold as steps, plus median shares ÷ 100 as a thin line, so the gap shows the uncovered remainder;
   - B: strangle contracts as steps;
   - the tooltip gives shares, lots, contracts and the $ value, naming each ticker when the tickers differ;
   - cycles where the liquidity cap binds are marked.
   - At the defaults, A rises from 18 to 23 lots and B from 14 to 20 contracts, so both lines read clearly on one scale.

**Pinned week.**
- A single click on any stacked chart pins that week: a persistent marker labelled "week 14 ×".
- A click on a table row also pins its week.
- The pin defaults to the first full cycle.
- Hovering never changes the growth card.

**Growth card** (left half). It shows the pinned week, with ◀ ▶ steppers and × in its header, e.g. "week 14 · 7 days · path +0.8%". It shows:
- the A2 formula filled in for that cycle: λ (typical λ under Add), c, y, a, g, e, r(λ); R exactly on the path; the average R; the typical growth E ln(1+R);
- edge kept, and KORU's drift line;
- "This week's credit $1,095. Kept in full it buys 65 KORU at 1.2x (73 at 1.33x, 54 with no loan): a new lot every 1.5 weeks exactly on the path";
- "The same $1,000 in SPY: $2,000 overnight; $4,000 is intraday only";
- one line on the day of the sale (A1).

**Leverage sweep** (right half; A | B seg):
- x: leverage from 0.5x to 1/m, with the ceiling marked;
- y: typical end NAV for both policies (solid = the run's policy, dashed = the other), with a marker at the current setting;
- a 60px strip below: odds of a margin call in the year;
- for strangles, x is margin used from 10% to 100%;
- tooltip: median shares at the end, odds, 10–90%;
- painted with v7's sweep-panel code.

**Credit** (left half): cumulative credit and cumulative average payout, A and B (solid and dotted). The ⚙ alternative is per-cycle bars for one run, each as wide as its cycle.

**Margin** (right half):
- Default view: odds of a margin call so far, A and B, 0–100%, headed "by week 52: A 54% · B 54%".
- ⚙ alternative: the cushion now, in σ of each run's cycle move, with 1σ and 2σ gridlines (up and down lines for strangles).
- Tooltip: requirement, requirement/NAV, trigger price, odds this cycle.

#### D6. Table: week by week (collapsed)

**Run:** A or B.

**Default columns:** week, date, price, median shares, lots/contracts, strike(s), premium, payout (average), NAV (typical), margin call so far.

**Columns ▾ adds:**
- Δ, IV used, % OTM, odds in the money, edge kept;
- typical λ, shares bought;
- commissions, fill cost, interest, loan;
- requirement, cushion, odds this cycle;
- NAV 10% / 90%, NAV average, NAV exactly on the path, NAV frictionless;
- shares 10% / 90%;
- cycle days.

**Also:** holding weeks inside monthly cycles are grey; clicking a row pins its week; Copy CSV.

#### D7. Comparing two configurations

- **Colours:** A is purple (#4a3aa7 / #9085e9), B is orange (#eb6834 / #d95926), with keys and chips as in the comparer.
- **Default comparison:** B differs in **Strategy**. A is KORU weekly covered calls; B is a KORU weekly strangle with the same week-1 credit ($1,095 net).
- **KORU against RAM is one click away** ("Ticker"): B becomes RAM monthly covered calls, with the cadence note and "Make A monthly too".
- **"B differs in Vol"** tests the premise without touching A: A at 130/117, B at 121/117.
- **No "A ahead of B" probability** is offered. Across tickers it needs a correlation input the toy does not have.

#### D8. Bridge to the comparer tab

None.
- The comparer compares two positions over their life; this tab compares two policies over a horizon.
- They share data, colours, painting code and the margin formulas, but not state.
- The theme and the view code are app-level.

---

### E. Architecture and build

#### E1. Files

All files are in the scratchpad; v7 files are untouched. They are listed in concatenation order.

| File | Origin | Contents |
|---|---|---|
| (line 1) | build8.py | `"use strict";` as the bundle's first line |
| app_store8.js | new | - KEY `rk-lab-v8`<br>- enc/dec (moved from eng_state7)<br>- readBlob/writeBlob `{v:8, tab, theme, cmp, yr}`<br>- parseHash: `#v8.` loads everything; `#v5.` loads the comparer only (tab = compare)<br>- on first load, seeds the comparer from `rk-lab-v5`<br>- `BOOT`, computed once |
| eng_head6.js, eng_pos6.js, eng_dist6.js, eng_ctx6.js | unchanged | |
| eng_state8.js | copy of eng_state7.js | - enc/dec removed<br>- `loadState()` returns `sanitize(BOOT.cmp)`<br>- `saveState()` removed (now app-level)<br>- `st.theme` is still read and written for v5 compatibility, but ignored at render |
| ui_common8.js | moved out of ui7.js | - SYNC, RAF and `refresh()` (now calls `appRender()`)<br>- `seg`, `bindRange`, `bindChk`, `bindSelect`, each with an optional registry argument (default SYNC)<br>- `toast`, tips, `copyText`, `el`, `txt`, `halo`, `pathOf`, `krow`, `mix`, `rgb`, `axisTicks`, `openPopAt`<br>- the global pointerover/pointerdown handlers |
| ui_cmp8.js | ui7.js minus the moved helpers and the E2 changes | Exposes `cmpWire()` and `renderAll()`. Keeps `fU`, `fUt`, `trow`, `hb`, `pName`. |
| yr_cal.js, yr_path.js, yr_engine.js | new; inside IIFE `const YRE = (() => {…})()` | Pure: no DOM, no `st`, no `BOOT`. Exports `cal`, `path`, `start` (stepper), `margin`, `chain`, `sweepRuns`. |
| yr_state.js, yr_ui.js | new; inside IIFE `const YR = ((YRE) => {…})(YRE)` | Exports `init`, `render(mode)`, `getState`, `setState`, `reset`. Uses YSYNC, `y-` ids and its own formatters ($, shares, ×, %). |
| app8.js | new, last | - `appRender()`: applyTheme → `renderAll()` or `YR.render("full")` for the active tab → `appSave()`<br>- tab switching, theme seg, view code, reset this tab / both<br>- resize and colour-scheme listeners<br>- dock init for `#dock` and `#ydock`<br>- init: `cmpWire(); renderNotes(); YR.init(); appRender()` |
| shell8.html | shell7.html + tab strip + year markup + year CSS | `top: 30px` for both control bars; scroll-margin-top 140px |
| data.json | unchanged | build8 adds `D.cal` and the 9 Oct weekly quote snapshot from cal8.json |
| build8.py | new | Concatenates in the order above and writes `outputs/ram_koru_lab_v8.html` |

**Naming:** year code must not use the names `R`, `N` or any other eng_head6 global. In code, the cycle return is `ret`.

#### E2. Changes to the comparer (ui7.js → ui_cmp8.js)

- **Moved out of `wire()` into app8.js:**
  - `seg("#c-theme", …)`;
  - `#vcopy`, and `#vgo` (now accepts `v8.` and `v5.`);
  - `#vreset`, split into "this tab" and "both";
  - the resize and `prefers-color-scheme` listeners;
  - the `st.dock` → `dock-off` line.
- **Moved out of `renderAll()`:** `applyTheme()` goes to app8; `saveState()` is replaced by `appSave()`.
- **Removed:** the closing line `wire(); renderNotes(); renderAll();`.
- **Renamed:** `wire` → `cmpWire`.
- **Moved to ui_common8.js:** `refresh()`, the binders and the safe painting helpers.
- `renderAll` stays global, so v7's interaction scripts keep working.

#### E3. State, persistence, render pipeline

**State.**
- The comparer keeps `st`, `C`, `SYNC` and `renderAll()`.
- The year tab keeps `ys`, `Y` and `YSYNC` inside `YR`.
- `APP.theme` is app-level. It is seeded from a v5 code or from `rk-lab-v5`.

**Year state.** `ys = {A: run, B: run|null, bDiff, sc: {cap0, W, path, S0, iv: {KORU: {wk, mo}, RAM: {mo}}, rv: {KORU, RAM}, smile}, costs, rates, view: {reading, units, overlays, sweepRun, creditView, marginView, tableRun, cols, pinWeek, scroll}}`.
- `view` is saved, but it is not an engine input.
- On load, RAM weekly becomes monthly, with a toast.

**Tabs.**
- Hidden tabs are `display:none`, and only the active tab renders.
- Switching tabs renders the newly visible one.
- Scroll position is kept per tab.
- `body[data-tab]` chooses the dock. `dock-off` and `ydock-off` are separate.

**Persistence.**
- `rk-lab-v8` holds the blob.
- The hash is `#v8.` + enc({t, th, c, y}). It stays under 3 KB with 12 points.
- `#v5.` codes still load into the comparer.

**Render modes** (`YR.render(mode)`). None of them calls `refresh()`.

| Mode | When | What runs and repaints |
|---|---|---|
| `live` | slider input or point drag | stage 1 at preview resolution, then only the strip and the stack (muted strip) |
| `full` | settled input: change event, pointerup, or 150 ms after the last input | stage 1 at full resolution, then every panel. Stage-2 parts come from the cache when the key matches; otherwise they are scheduled. |
| `stage2` | a stage-2 job finishes | only the sweep panel and the breakdown lines |

- The stage-2 cache key is a hash of A, B, the scenario, costs and rates. Theme, resize and tab-switch renders reuse the cache.
- Repaints during stage 2 leave the open tooltip and crosshair in place.

#### E4. Isolation checks (a script run by build8)

- The bundle's first statement is `"use strict"`. A Playwright evaluate inside the bundle scope confirms `(function(){return this})() === undefined`.
- **Duplicate names:**
  - across the bundle's top-level `function` / `let` / `const` / `class` names;
  - within each IIFE's top-level names;
  - an IIFE name that shadows an eng_head6 global fails.
- **Comparer names in year code:** grep `yr_*.js` for `\b(st|C|fU|fUt|trow|hb|build|val|statsBase|statsHV|GRID|EDITORS|BOOT)\b`. BOOT is allowed only in yr_state.js.
- **Duplicate ids** in shell8.html.
- **Node vm tests** load eng_head6.js + YRE + data.json only, so any use of comparer state or of the DOM throws.

#### E5. Bundle size

v7 is 182 KB. Additions:

| Part | Size |
|---|---|
| Engine | about 25 KB |
| Path | 5 KB |
| Calendar | 3 KB |
| UI | 45 KB |
| Store and app | 6 KB |
| CSS and markup | 8 KB |

That gives about 275 KB in total.

---

### F. Validation and screenshot pass

#### F1. Engine (node vm with eng_head6 + YRE + data.json)

1. **Realized 0**, flat, fractional, frictionless, rates 0, continuous strikes: NAV equals the product over the real calendar to 1e-9 under both policies ($203,695.84), with Add tracked as one exact state.
2. **Realized 0, growth g,** constant 7-day weeks: (1 + λ(g + y))^T for g < a, and (1 + λ(a + y))^T for g ≥ a.
3. **Shares 1.0x**, any path and realized, frictionless:
   - typical = NAV0·S_T/S0 ($45,000.00 for 20 → 30);
   - skew 0;
   - median shares = 1,500 exactly;
   - average = NAV0·(S_T/S0)·e^{σ²Σd/365/2}.
4. **Strangle at realized 0**, flat, frictionless: (1 + use·credit/q + cash interest)^T.
5. **Realized = IV, pricing rate 0** (test-only average-price option): the covered-call average equals the shares average to 1e-4.
6. **Touched mass:**
   - one trigger: the closed-form touch odds match a 2,000-panel quadrature of the killed density to 1e-6;
   - two triggers: S matches a 2,000-panel quadrature to 1e-6 (±0.2 case: 0.5663), and matches 1 − two single touches when the triggers are far apart;
   - S stays finite at realized 5% on a steep path.
7. **Add against Reset at λ = 1.0:** typical within 0.5% ($43.9k both). Odds are **exactly 0** for Reset.
   - 7b: every covered-call state with λ ≤ 1 and no short puts has pT = 0.
   - 7c: the Reset sweep from 0.5x to 1.0x, at 10/20/30/40Δ, for KORU weekly, KORU monthly and RAM monthly, gives a finite NAV and odds of exactly 0 at both resolutions.
8. **Lattice resolution:** h 0.02 with 60 panels against h 0.005 with 320: typical within 0.3%, odds within 1.5 points. The top bin is exactly 1/m, and λ ≤ 1/m in every bin.
9. **Margin readouts:**
   - covered calls 1.2x: drop tolerated 45.5%;
   - strangle 20/20Δ weekly at 50%: +43.0% and −97.5%; at 30%: +93.6%;
   - the closed-form covered-call trigger equals the root finder to 1e-6;
   - the root finder uses at most 16 evaluations per trigger on every validation run (measured maximum: 14, under stress at realized 200% and a ×10 path).
10. **Calendar:** 52 weekly cycles over 364 days, with Thursday expiries on 24 Dec, 31 Dec, 25 Mar and 17 Jun. 13 monthly cycles, with 17 Jun 2027 a Thursday.
11. **Invariants:**
    - calls = min(floor(shares/100), cap), and the cap is never exceeded;
    - mass sums to 1 ± 1e-9;
    - a loaded code asking for RAM weekly becomes monthly, with a note.
12. **The path never falls:** every enforcement case gives a visible note, and the stored path never falls.
13. **Stress** (realized 200%, λ 1.33, path ×10, 104 weeks, cap 0, $3k start with c = 0.56, realized 5%): no NaN, no negative mass, and formats hold ($1.2M, $3.4B).
14. **Regression on this plan's numbers:** the defaults reproduce A2 (typical, 10%, 90%, median shares) within 1%, and odds within 1 point.
15. **Dev-only Monte Carlo cross-check** (`f_shares.js` / r9 logic, not shipped), four cases:
    - NAV medians within 3%;
    - odds within 3 points;
    - median shares within 2% (default Add 1.2x frictionless: 2,466 against 2,440).

#### F2. Performance (Playwright, Chromium)

| Measure | Limit |
|---|---|
| Full stage 1 on the defaults (A, B and both exactly-on-the-path runs) | ≤ 60 ms |
| Full stage 1 per family, with that run as A and the default B: covered strangle, RAM Add at 2.0x, 1.33x Add, 104-week Add | ≤ 150 ms |
| Live stage 1 on the defaults | ≤ 25 ms |
| Live frame (stage 1 + strip + stack) on the defaults | ≤ 50 ms |
| Stage 2 (breakdown + sweep) at 52 weeks | ≤ 1.5 s, with no long task over 50 ms |
| Below-the-fold panels after the last input | repainted within 300 ms + stage 2 |

**Stage-2 tooltip test:** hover the NAV chart while stage 2 finishes; the tooltip must still be there.

#### F3. Screens (Playwright, `/opt/node22/lib/node_modules/playwright`)

**Screens,** at 1200 and 1440, light and dark:
- the Compounding default;
- Points mode with one clamped point mid-drag;
- B differs in Ticker (multiple-of-start axis, RAM note in the dock);
- the table expanded with extra columns;
- the dock hidden;
- Reading = Average;
- the margin view set to cushion;
- the sweep on a strangle run;
- a pinned week other than the default.

**Critical pass on each screen:**
- no horizontal scroll at 1200 with the dock open;
- the sticky bar no taller than v7's at the same width;
- the tab strip stays visible when scrolled, and the dock header is not covered;
- week 26 has the same x in all three stacked charts;
- no label collisions;
- A/B contrast holds in dark mode, and amber notes are legible;
- tooltips stay inside the viewport;
- number formats are consistent.

**App-level behaviour:**
- a theme change from the Compounding tab applies, and the seg highlights it;
- opening on the Compounding tab applies a stored theme;
- loading a `#v8.` code shows only "View loaded";
- a comparer render does not write `#v5.`.

**Drag:** pointer capture survives 30 frames; the y scale does not change; the path line follows the dot; the SVG is rebuilt once, on release.

**Comparer regression:** v8's comparer against v7, with cleared storage, at 1200 and 1440, light and dark.
- The pixel diff from the top of `#cbar` down, aligned on each page's measured `#cbar` top, must be empty.
- v7's interaction scripts (`shot7.js` and the others) run unchanged with tab = compare.

**Console:** no errors on any screen.

---

### G. Debate log

1. **Share policy (M2).**
   - The draft reset λ every expiry; M said the user's words describe adding the credit.
   - The author conceded: "Add credit" became the default, run on a λ lattice, with Reset as an option.
   - M conceded a correction: with margin calls modelled, 1.2x buy and hold has a median of $27.9k and a margin call in 72% of years, not $29.7k.
2. **Strangle margin calls (M1).**
   - The draft tested drops only. The author conceded and now tests both directions.
   - M conceded the rate: 54% of years, not 84%. The 84% figure assumed continuous checks and intrinsic marks; the plan uses daily checks and half-cycle Black marks.
3. **How to get the median (M3, M7).**
   - M proposed FFT convolution; the author used exact moments on the lattice with Cornish-Fisher instead.
   - M checked it against exact convolution on 21 runs (within 1%) and withdrew FFT.
4. **Touched mass taken as "1 − quadrature" (M, round 2, blocking).**
   - This produced NaN for every unlevered Reset run except weekly 30Δ.
   - The author conceded. Touched mass now comes from closed forms, with untouched weights renormalised and a guard on the touch branch (B6), plus validations 7b and 7c. NaN is gone across the scan.
5. **Share statistic (M, round 2).**
   - λ_typ × NAV / S1 understated the median share count by 2.5–4.6%.
   - The author conceded and added u-moments. Median shares are now within 1.1% of the Monte Carlo (2,440 against 2,466), and every share figure in A2 is updated.
6. **Compute budget (M, round 2).**
   - M showed that the 40 ms target and the time-triggered fallback both failed, with odds moving 4 points by machine speed.
   - The author conceded fixed resolutions: settled always full, the drag preview coarse and muted.
   - The author showed with fastcc.js that the allocation-free loop runs the default A in 42 ms, and set per-family limits.
   - The author kept the sweep at full resolution rather than M's coarse-sweep suggestion: coarse would disagree with the strip by up to 3.7 points. It is sliced, at 610 ms for 26 runs. M's point that time must never pick the resolution stands.
   - Triggers moved from bisection to a closed form and a bracketed Illinois root finder (M's fix 1): the covered strangle needs 23k Black evaluations instead of 146k, and at most 14 margin evaluations per trigger.
7. **Points table against the shared week axis, shares against contracts on one axis, and the growth card driven by hover (P, round 2).**
   - The author conceded all three: one x geometry with a 240px right margin for the whole stack, a contracts/shares dual-label scale at 100:1, and click-to-pin with steppers.
   - Earlier, P conceded that "odds of a margin call so far" beats the σ-cushion as the default margin view (P12), and that an "exactly on the path" curve does not belong in the sweep.
8. **Code isolation and the page frame (P, round 2).**
   - The author conceded all of these:
     - `"use strict"` as line 1;
     - two IIFEs, so tests load only the pure YRE;
     - the safe helpers moved to ui_common8 and year formatters of its own;
     - per-IIFE duplicate and shadowing checks;
     - render modes with a stage-2 repaint that never calls `refresh()`;
     - compact chips (measured 90 / 150 px);
     - the tab strip inside `<main>`, so v7's dock is untouched.

---

### H. Open questions (superseded by Part 0.5)

1. **Realized moves around your path: HV30 (KORU 117%, RAM 102%), or 0 (exactly on the path)?**
   - Recommended: HV30.
   - "Exactly on the path" stays visible in the strip, as a NAV overlay, and by typing "moves 0". At 0, the default A ends at $188.1k instead of $43.2k.
2. **KORU IV: your 130% for weeklies and monthlies alike, or today's term structure (weekly about 121, monthly about 129–131)?**
   - Recommended: 130 for both, with today's levels printed beside the inputs.
   - With today's structure, A falls to $34.5k, and monthly overtakes weekly.
3. **Default covered-call policy: "Add credit" (the kept credit, times λ, buys KORU) or "Reset each expiry"?**
   - Recommended: Add credit.
   - At 1.2x the typical results are close ($43.2k against $42.5k), but the odds of a margin call are 54% against 0.4%.
4. **Default B: a KORU strangle at 50% of margin used (same weekly credit as A), or RAM monthly covered calls?**
   - Recommended: the strangle. RAM is one click away, with its monthly-only explanation.
5. **On a margin call, sell back to 1.0x, or only as much as IBKR requires (staying at the limit, so further drops force more sales)?**
   - Recommended: 1.0x, a simple stated rule.
   - The other rule mainly changes results above 1.25x.

---

## Part 2. Loss and stress module (separate module, Stress view)

Plan only, no app code. It sits on top of the year engine in `revised.md` (Compounding tab, `YR` IIFE, policies "Add credit" and "Reset each expiry", IBKR equity with loan value, margin call → back to 1.0x, strangles closed). Where this plan depends on that engine, it says exactly what it needs.

Numbers marked (v) come from the scripts in `plan_debate/stress/`:
- `stress.js` is the prototype stress engine.
- `snap4.js` and `eng4q.js` build snapshots from the revised engine. `eng4q.js` is a copy of `eng4.js` plus leverage percentiles; `eng4.js` itself is untouched.
- `closed.js`, `closed2.js` and `closed2c.js` check the closed forms.
- `tables4.js`, `replay4.js` and `multi.js` give the loss tables.
- `mc4.js`, `mc4f.js` and `mc4run.js` are the Monte Carlo prototype and its timings.
- `hist*.js` analyse KORU's daily history (`koru_5y.json`, IBKR daily bars 4 Oct 2021 to 1 Oct 2026, split-adjusted).

Defaults are those of `revised.md`:
- $30,000 start, KORU at $20 on a flat path, IV 130, realized 117;
- A = covered calls 30Δ weekly, 1.2x, Add credit;
- B = strangle 20/20Δ weekly, 50% margin used;
- continuous strikes, tiered rates.

---

### 0. Decisions in one screen

- **A separate engine: `yr_stress.js`.** It is pure: no DOM, no `ys`.
  - It takes the account as it stands in week t, a scenario, and the rules.
  - It returns the account path through the move and a loss breakdown.
  - Its only inputs from the year engine are a per-week snapshot of positions plus three shared functions (§1.2).
- **Its own sub-view.** The Compounding tab gets a second-level switch, **Year · Stress**, in the sticky tab strip.
  - Stress reuses the runs (dock) and the base scenario (summarised in one chip).
  - Its own move controls replace row 2 of the sticky bar.
  - Nothing is added to the Year view.
- **The move is defined in KORU's own price.** The user can type it as a KORU % (default) or as a Korea index day; the index is converted through KORU's daily 3x reset.
  - Every move shows its counterpart in the other unit.
  - Every move lands as an overnight gap by default, because Korea trades while New York is closed.
- **Five shapes:** Gap · Run · Drawdown · Spike · History.
  - History replays KORU's real daily opens, lows, highs and closes from any start date. Presets cover the worst windows, all in 2026.
- **Mechanics, in order:**
  1. mark shares and every leg at the shocked price and shocked IV;
  2. run IBKR's maintenance test;
  3. on a breach, the forced sale at the shocked price with fill costs;
  4. assignment at expiry;
  5. what remains, including a deficit when NAV goes below zero.
- **The real loss and the upside given up on covered calls are separate numbers.** They are never added together.
- **Outputs:**
  - loss by the week the move hits, in $ and % of NAV;
  - room before a margin call and before NAV 0, by week, down and up;
  - loss against move size at a chosen week, with a breakdown;
  - optionally, the year after the move, rerun by the year engine from the reduced account.
- **Monte Carlo is a collapsed, opt-in layer** ("Random years"), in a Web Worker, seeded, with jumps calibrated on KORU's history. The year engine stays analytic.

---

### 1. Module boundary

#### 1.1 Files

| File | Pure? | Content |
|---|---|---|
| `yr_margin.js` | yes | The IBKR test, **moved out of** `yr_engine.js` so that the year engine, the stress module and Monte Carlo share one copy: equity with loan value, stock requirement (covered shares valued at min(x, K)), naked legs with marks × the leverage factor, strangle pairing, spreads |
| `yr_stress.js` | yes | `compile`, `run`, `byWeek`, `room`, `curve` (§1.3) |
| `yr_mc.js` | yes | The Monte Carlo layer. Its source is also bundled as a string for the Worker (§5.5) |
| `yr_stress_ui.js` | no | Stress sub-view: scenario row, panels, its own sync list `SSYNC`, ids prefixed `ys-` |
| `hist8.json` → `D.hist` | data | KORU daily OHLC for 5 years, RAM since 24 Jun 2026, as basis points against the previous close, with an as-of date; about 25 KB |

- All of these go inside the `YR` IIFE (stress state `ss` sits next to `ys`). The node vm tests load them without `eng_state` or `eng_pos`, so any reach into `st` throws.
- Bundle: about +45 KB (engine 10, Monte Carlo 6, UI 22, history 25, CSS 3; the Worker string reuses the same sources), for about 320 KB in total.

#### 1.2 What the year engine must expose, and nothing more

**(a) A snapshot per run, per week and per account.** Week w = 0..W−1, taken right after that week's trades (Friday close).

```
Snap = {
  w, date,                // week index and its Friday (or the holiday Thursday)
  S,                      // KORU price on that account's path (the typical price for "typical")
  n,                      // shares held
  cash,                   // signed $, includes this cycle's credit; < 0 is the margin loan
  legs: [{cp, q, K, exp, iv}],   // q = signed contracts (short < 0), exp = expiry date, iv = IV used at entry
  credNet,                // this cycle's credit net of commissions (Add credit needs it at expiry)
  nav                     // cash + n·S + Σ q·100·mark; a check value, recomputed by the stress module
}
```

- **Accounts:**
  - `typ`: typical NAV with typical leverage. This is the default.
  - `lev90`: typical NAV at the 90th percentile of leverage. Add credit only; it comes from the leverage lattice the engine already holds, and it is the only new number the engine has to compute.
  - `exact`: the account if KORU follows the path exactly.
- **How a snapshot is built.** The engine applies its own cycle-start rule to (NAV, λ, S), so the positions are exactly what that rule would hold.
- **Monthly holding weeks.** The snapshot is the cycle-start position with S = path[w]; its legs keep their original expiry.

**(b) Two functions the engine already has, exported unchanged:**
- `openCycle(state, x, ivAt, run, ctx, date)`: strikes, sizing and the policy trade at a cycle start. Used when the strategy keeps trading during a multi-week move.
- `runYear(run, scen, costs, rates, {start: {w, nav, lam}, path})`: the year recursion from any week, NAV and leverage, on any non-falling path. Used for "after the move" (§4.5).

**(c) Shared helpers:** `yr_margin.js`, the calendar (`tradingDays(from, n)` with expiries and NYSE holidays), Black-Scholes and the IV of a leg (`ivOf(tk, cad)` plus the smile flag).

**Not exposed:**
- the lattice, moments, odds and percentiles (apart from λ90);
- table rows;
- UI state.

The stress module never changes year state.

#### 1.3 What the stress module returns

`run(snap, scen, rules, ctx)` returns:
- **before:** {nav, elv, req, lam, used}, where used = req / elv;
- **low:** {nav, day, price};
- **end:** {nav, price}, at the end of the move window;
- **loss:** {low$, low%, end$, end%};
- **parts:** {shares, coveredCalls, nakedCalls, puts, wings, assignment, forcedSale, interest}, with coveredCalls split into kept and given up;
- **call:** {day, price, shortfall$, sold: {shares, contracts}, fillCost$}, or null;
- **deficit$:** 0 unless NAV is below zero after everything is closed;
- **givenUp$:** see §3.7;
- **timeline:** [{day, tick, x, iv, nav, elv, req, event}].

Wrappers:
- `byWeek(snaps, scen, rules, ctx)`: `run` at every week.
- `room(snap, rules, ctx)`: the largest move down and up before a margin call, and before NAV 0. It uses the closed form for plain covered calls and shares (§6) and bisection otherwise.
- `curve(snap, moves[], rules, ctx)`: the single-gap loss for each move size.

#### 1.4 Compute budget

The stress stage runs only while the Stress view is visible. It runs after the year engine's stage 1, in the same deferred, cancellable chunks as the year's stage 2.

Measured in the prototype on node 22 (v, `tables4.js`): 3 runs × 52 weeks × (2 runs of the move + 3 bisections) takes 22–25 ms. The loss curve (77 sizes × 3 runs) takes 4.5 ms.

Target in Chromium for A and B: 25 ms or less.

---

### 2. Scenario language

#### 2.1 Unit: KORU, with the index as an input option (decision)

The engine moves KORU's price, because every dollar lost is a KORU dollar: the shares, strikes, cushions and path are all quoted in KORU.

The user can type a move in either of two units, chosen with a small toggle next to the number:
- **KORU %** (default);
- **Korea index % in one session.** KORU then moves by max(0, 1 + 3r) − 1 on each trading day. That is the fund's daily reset; fees are ignored at this horizon.

Why the index unit matters:
- **Zero.** An index day of −33.3% takes KORU to 0.
- **Compounding.** Five index days of −5% each are −22.6% for the index but −55.6% for KORU, not −67.9% (v). A −20% index week is −60% for KORU as a single gap, but −50.4% when spread over five days (v).

Every move shows its counterpart, for example "KORU −35% = index −11.7% in one session". A KORU move below −100% is held at −100% with an amber note: "KORU at 0 (index −33.3% or worse in one session)".

For RAM the factor is 2 and the unit is RAM's underlying.

**Context for the range (method notes):**
- KORU's worst open gaps in five years:
  - −35.3% on Tue 3 Mar 2026;
  - −34.7% on Tue 23 Jun 2026;
  - −22.5% on 5 Aug 2024 (v).
- KRX's last circuit breaker ends a Korean session at about −20% (to be confirmed from KRX's rule text before it goes in the notes). That puts one session near KORU −60% before currency moves. A weekend or a US holiday can stack sessions.

#### 2.2 Shapes (the Move seg)

| Shape | User inputs | What it compiles to | Window |
|---|---|---|---|
| **Gap** | X (±%) | One move at the first open after the snapshot | Through that cycle's expiry, so assignment is included |
| **Run** | X per week, k weeks (1–8) | k weekly moves of X; each arrives as a Monday gap (default) or spread over the week's sessions | k weeks |
| **Drawdown** | total X (down), over n weeks (1–12) | Equal % steps per week, spread over the sessions (default) | n weeks, ending at the low |
| **Spike** | X (default +), back after d sessions (0 = stays) | A gap of X, then a gap back to the start price after d sessions | Through that expiry, or later if d crosses it |
| **History** | Start date or preset, weeks (1–8) | KORU's real daily open, low, high and close, as multipliers against the previous close | The chosen weeks |
| Custom (inside History ▾) | A list of weekly moves, e.g. "−35g, +10, −20s" (g = gap, s = spread) | As written | As written |

**History presets** (v, from IBKR daily bars):

| Preset | What happened |
|---|---|
| 3 Mar 2026 | Open −35.3%; low −44.9% from the prior close |
| 27 Feb → 6 Mar 2026 | Week low −51.4%; close −44.7% |
| 29 May → 5 Jun 2026 | Week −44.0% |
| 26 Jun → 31 Jul 2026 | Low −68.5%, end −59.4%; the worst 20 days were −69.1% (30 Jun → 29 Jul) |
| 5 Aug 2024 | Open −22.5% |
| 1 → 8 May 2026 | Week +56.3% |
| 22 May → 1 Jun 2026 | 5 days +62.1% |
| 8 Apr 2026 | Open +30.8% |

RAM's history in IBKR starts on 24 Jun 2026, so its History list is short and says so.

**Why the window ends with the move.** Whatever the price does afterwards (stays, resumes the path, climbs back) belongs to "After the move" (§4.5), which the year engine runs with its usual wiggles.

The prototype showed why this matters. Options sold during a scripted, wiggle-free stretch at the raised IV are kept in full every week. A flat month after a −60% drawdown then turned a 50% strangle's loss into a +19.6% gain (v, `multi.js`). That is the same effect as the exactly-on-the-path toy.

#### 2.3 Timing

- **The move lands** at the first open after the snapshot: Monday, or Tuesday after a Monday holiday. For a weekly cycle, the legs then have 4 calendar days left.
- Rules ▾ has "lands on: Mon … Fri", for a hit later in the week.
- **Arrival** of each weekly step: one gap or spread over the sessions. Defaults: a gap for Gap, Run and Spike; spread for Drawdown.
- History uses real intraday points: open, then low, then high, then close. Margin is tested at each point, so a breach at the low liquidates at the low.

#### 2.4 IV after the move

The comparer's shock rule is reused, in log terms, with an added up-slope:

    IV(x) = IV_entry + shift + down·max(0, −ln(x/S))/0.1 + up·max(0, ln(x/S))/0.1, capped at 250%

- Defaults: down +10 points per 10% drop, up +5 per 10% rise, shift 0. After a −35% gap, IV goes from 130 to 173%.
- It applies to the marks of open legs (and so to the requirement, which includes the mark), and to any option sold during the move.
- The chip in the scenario row shows the result, for example "IV → 173%".
- Effect: small for covered calls, larger for strangles near the money. Example (v): a 3-week run of −20% gaps costs A 51.1% with the IV response and 52.3% without it.

#### 2.5 Which account is hit

Account ▾, in the scenario row:
- **Typical** (default).
- **High leverage, 90th percentile.** Add credit only. Leverage drifts up after drops, and these are the accounts that get hurt. Under Add credit (v, `eng4q.js`):

  | Week | 1 | 5 | 13 | 26 | 52 |
  |---|---|---|---|---|---|
  | Typical λ | 1.20 | 1.17 | 1.12 | 1.08 | 1.05 |
  | 90th-percentile λ | 1.26 | 1.30 | 1.26 | 1.22 | 1.18 |

- **Exactly on the path** (the toy). Its NAV is $187.7k by week 52.

Charts can overlay the other account (⚙).

---

### 3. Loss mechanics, exact order

At each tick (an open, low, high or close point; synthetic shapes use one point per session):

1. **Price.** x ← x · multiplier, floored at 0.
2. **IV.** IV(x) from §2.4.
3. **Marks.** Each open leg is marked at Black(x, K, τ left by the calendar, IV(x)); at expiry the mark is intrinsic.

   NAV = cash + n·x + Σ q·100·mark.
4. **Maintenance test** (`yr_margin.js`, the same code as the year engine). Equity with loan value = cash + uncovered shares·x + covered shares·min(x, K), with US options left out. Requirement:
   - stock: m′·(that stock value). m′ is the maintenance after the move: 75% for KORU by rule, with a Rules ▾ field for a house increase (try 100%);
   - naked legs: mark + max(min(0.2L,1)·x − OTM, min(0.1L,1)·x for calls or ·K for puts);
   - strangles: the larger side plus the other side's mark;
   - spreads: as in the year engine.
5. **Margin call** if equity with loan value < requirement. Forced sale at x, with these fills:
   - shares at x·(1 − 1.0%);
   - options at mark ± 2 × the normal half-spread, h = max($0.025, 7%·mark), because markets are wide at a gap open.

   **What is sold follows one setting shared with the year engine.** The default is the year engine's rule:
   - share runs: puts bought back, shares sold down to 1.0x of NAV, calls on the sold lots bought back;
   - strangles: closed.

   Two alternatives for stress:
   - **Only what IBKR requires**: everything is closed pro rata by the smallest fraction f that restores compliance, f = (req − elv)/(req + D), where D is the change in equity from closing everything;
   - **IBKR closes everything.**

   IBKR's real choice of what to close is its own; this setting states which one is assumed. Sales are in whole shares and whole contracts, rounded up.
6. **Wiped out.** If NAV ≤ 0 after the sale, everything is closed. **Deficit** = −NAV, shown as "you owe IBKR $X". The loss can then exceed 100% of NAV, and is labelled that way.
7. **Expiry tick** (Friday close, or the holiday Thursday):
   - covered calls in the money: lots delivered at K;
   - naked calls in the money: bought in at x, plus the stock round trip;
   - short puts in the money: assigned (+100·q shares at K);
   - wings: exercised;
   - then the test runs again (step 4), because assignment turns a put requirement into a 75% stock requirement.

   Option "assume early assignment of in-the-money puts at once". It is off by default; it can lower or raise the shortfall depending on depth.
8. **Keeps trading** (default) when the window continues past an expiry: `openCycle` at x and IV(x) with the run's own policy.
   - Add credit: that cycle's result × λ moves into or out of KORU.
   - Reset: back to λ·NAV.
   - Strangles: resized from NAV.

   Option: "the strategy stops at the first move" (hold, sell nothing new).
9. **Interest** accrues daily at the year engine's tiered rates.
10. **Record** the tick in the timeline.

#### 3.7 Real loss and upside given up

- **Real loss** = NAV before − NAV at the end of the window (and at the low), when positive.
- **Given up** = the covered calls' result over the window, when negative: what the shares earned above the strikes and paid out. It is never added to the loss, because the account still made money on those shares.
  - Check for a single gap: given up = what the same shares alone would have gained − the strategy's NAV change (v, `examples.js`).
- **Naked calls and short puts are real losses.**
- Example, A in week 1 (v): a +20% gap gives NAV +$5,368 (+17.9%) against +$7,200 for the shares alone, so $1,832 is given up. At +50%: still +$5,368, with $12,632 given up. There is no margin call: covered shares are valued at the strike.

---

### 4. Outputs

All dollar figures come with % of NAV at the moment the move hits.

#### 4.1 Stress strip (top of the view)

One row per run:
- **Before:** NAV, λ, margin used, e.g. "A $35.9k · 1.04x · 78%".
- **At the low:** $ and %.
- **End of the move:** $ and %.
- **Margin call:** "no", or "day 2 at $13.10, sold 22% of shares".
- **Deficit:** shown only when there is one.
- **Given up:** shown only when non-zero.

Under the rows, one line per run, for example: "This week: margin call after a 84% drop (index −28%), NAV 0 after 99%; B: call on a +43% rally".

#### 4.2 Loss by week of impact (main chart)

**Layout:** two stacked charts on one week axis with one crosshair: $ lost (240px) and % of NAV (100px).

**Content:**
- **Lines:** A and B.
- **Markers:** amber ring = margin call; red dot = deficit.
- **Overlay (⚙):** the high-leverage account, dashed.
- **Clicking a week** sets "Hits in week", which drives the strip, the curve and the breakdown. "Worst" is the default: the chart follows the week with the largest $ loss.

Example: gap −35% at the Monday open (v, `tables4.js`). The % column is the loss over NAV at that week.

| Week hit | 1 | 13 | 26 | 52 |
|---|---|---|---|---|
| A, typical account | $11.5k (38.3%) | $11.9k (35.9%) | $12.3k (34.2%) | $14.4k (33.5%) |
| A, 90th-percentile leverage | $11.5k (38.3%) | $13.5k (40.7%), margin call | $14.0k (38.9%) | $16.2k (37.7%) |
| B, strangle 50% | $5.2k (17.4%) | $5.6k (16.9%) | $5.7k (16.1%) | $7.1k (17.2%) |

**Reading:**
- Under Add credit, the typical account de-levers through the year, so the % falls while the $ grows with NAV.
- The high-leverage account is worst around week 6 (42.0%).
- Under Reset, the % is flat: about 38% every week (eng2 prototype: 38.4%, 37.9%, 38.5% in weeks 1, 26, 52).

#### 4.3 Room before a margin call and before NAV 0, by week

**What is drawn:**
- **Lines:** for each run, the margin-call trigger (solid) and NAV 0 (dashed). Drops plot below 0; rallies plot above 0 for strangles. Covered calls say "no margin call on rallies: the calls are covered".
- **Axes:** the left axis is the KORU %; the right axis is the one-session index equivalent (÷3).
- **Reference gridlines:**
  - 1σ, 2σ and 3σ of a week at the realized vol;
  - history marks at the edge: "worst open gap −35.3%", "worst week low −51.4%", "best week +56.3%".
- **Tooltip:** the trigger price in $, the index equivalent, and how often KORU has moved that much ("opened ≥ 35% down: 1 day in 5 years").

Room by week (v):

| | Week 1 | Week 13 | Week 26 | Week 52 |
|---|---|---|---|---|
| A typical, margin call at a drop of | 45.5% | 68.3% | 84.0% | 93.8% |
| A typical, NAV 0 at a drop of | 86.4% | | | 98.5% |
| A 90th-percentile leverage, margin call at a drop of | 45.5% | 29.2% | 40.4% | 51.0% |
| B 50%, margin call on a rally of | +42.7% | | | +43.5% |
| B 50%, margin call on a drop of | 97.5% | 99.9% | 99.9% | 98.7% |

#### 4.4 Loss against move size at the chosen week, with the breakdown

**Left, about 60%: the curve.**
- x is the move, from −90% to +100% KORU, with the index scale on top; y is the NAV change in $ or %.
- Lines A and B, plus a thin grey "same shares alone" line for covered-call runs. The gap between it and A on the right side is hatched grey and labelled "given up".
- Markers at the margin-call and NAV-0 points. The current scenario's move is a vertical rule.

**Right, about 40%: the breakdown for the current scenario at that week.** It reads as a column:

NAV before → shares → covered calls (kept / given up) → naked legs → assignment → forced sale (fills) → interest → NAV after

Under it: "Real loss $X (Y%)", "Given up $Z", "Deficit $D" (only when present).

Scenario results, in % of NAV at the low / at the end of the move; * marks a margin call (v, `replay4.js`):

| Scenario | Week | A typical | A 90th λ | B 50% |
|---|---|---|---|---|
| Gap −35.3% (as 3 Mar 2026) | 1 | −38.7 / −38.6 | same | −17.7 / −17.4 |
| Gap −35.3% (as 3 Mar 2026) | 26 | −34.6 / −34.5 | −39.2 / −39.2 | −16.3 / −15.9 |
| Index −10% session (KORU −30%) | 26 | −28.9 / −28.8 | −32.8 / −32.7 | −12.0 / −11.2 |
| Run: 3 weekly gaps of −20% | 1 | −51.3 / −51.1* | same | −39.3 / −39.2* |
| Drawdown −60% over 4 weeks | 26 | −56.4 / −56.4 | −60.0 / −60.0* | −33.7 / −33.8* |
| History 27 Feb → 6 Mar 2026 | 26 | −51.9 / −44.7 | −58.2 / −52.4* | −30.4 / −24.4 |
| History 26 Jun → 31 Jul 2026 | 26 | −66.7 / −55.3 | −67.9 / −58.1* | −50.0 / −41.8* |
| History 1 → 8 May 2026 (+56%) | 26 | 0 / +18.2 (given up large) | 0 / +21.7 | −34.2 / −34.2* |

In dollars, the week-26 History 26 Jun → 31 Jul row is −$19.9k for A typical and −$14.9k for B.

**The cliff at the trigger** (v): B in week 1 on a spike that reverses after 2 sessions.
- **+40%:** low −17.8%, end +3.8%. No call, so the loss was temporary.
- **+45%:** margin call, closed at the top, −25.9% locked in.

The curve shows this step. The strip names it ("closed at the high").

#### 4.5 After the move (collapsed, optional)

**Header control** (it defines what happens next, so it sits next to this chart): "Then KORU: stays · resumes your path's weekly steps · climbs back to your path in [4] weeks".
- All three paths never fall, so the year engine runs them unchanged.
- IV goes back to the base input (the user's durable-IV premise). Rules ▾ has "IV stays raised for [n] weeks", off by default.

**Computation.** `runYear(run, …, {start: {w_end, nav_end, lam_end}, path})` gives the typical continuation, with wiggles and margin calls as usual.

**Chart.** From the week hit to week 52: base (thin grey, dashed per run) against after the move (A and B solid).

**Readouts:**
- "back to the pre-move NAV in N weeks", or "not within the horizon";
- "week 52: $X vs $Y base (−$Z, −P%)".

Order of size, at the base run's typical growth (v):
- **A, −34.5% in week 26:** about 60 weeks to recover at 0.71% a week; year end about $28.3k against $43.2k.
- **B, −15.9%:** about 28 weeks; $34.8k against $41.4k.

The app computes these exactly through the engine.

**Covered calls in a V-shaped recovery** (v, eng2 prototype; the typical track gives up upside, the exactly-on-the-path toy does not):
- After a −35% gap, the price climbs back to the base in 4 weeks.
- 1.2x covered calls end those 4 weeks at $26.1k, against $30.4k for 1.2x shares alone, from $18.4k after the gap.

---

### 5. Monte Carlo layer ("Random years", collapsed, opt-in)

#### 5.1 Model

- **Daily steps** on the calendar: Monday carries 3 days of variance, Tuesday to Friday 1 day each.
- **KORU's median follows the user's path:** the log drift per step is ln(path step) − (expected log jump) × dt.
- **Diffusion** at sd = √(realized² − jump variance), so the total vol stays at the user's realized number. Option: "jumps on top", which raises the total.
- **Jumps.** On each session a jump arrives with probability rate/252: down with lognormal size, up likewise. Jump days are gaps, so the margin test happens at the jumped price.
- **Strategy.** The same `openCycle` and settlement as the year engine, on whole shares and contracts with the real costs. The margin test from `yr_margin.js` runs at every daily close, with the same margin-call rule as the year engine. NAV ≤ 0 stops the path, and the deficit is recorded.

#### 5.2 Jump presets

Calibrated on KORU's daily closes, counting days with |log move| > 20% (v, `hist3.js`):

| Preset | Down jumps per year | Up jumps per year | Size, down / up | Share of a 117% vol |
|---|---|---|---|---|
| Off | – | – | – | 0% |
| 5 years | 2.6 | 1.2 | −24.8% / +29.3% | jumps 57%, diffusion 102% |
| **2 years (default)** | 6.5 | 3.0 | same | jumps 90%, diffusion 75% |
| 12 months | 13 | 5 | same | jumps exceed 117% |

- Size spread (log sd): 0.105 down, 0.038 up. Custom settings sit under ▾.
- With the 12-month preset the jumps alone exceed 117%. The diffusion part is then set to 0, and a note says so with the resulting total.

**History context:**
- 5-year realized vol: 101%. Last 252 sessions: 173%. Last 63: 177%.
- 11 sessions beyond 4 sd in 5 years, against 0.08 expected for a normal distribution.
- In the last 52 weeks, 10 weeks had an intra-week low of −20% or worse, and 6 of −30% or worse (v).

#### 5.3 Outputs

- **Fan chart of NAV by week:** 5/25/50/75/95% bands, A and B, median thick.
- **Table:**
  - year-end 5 / 10 / 50 / 90 / 95%;
  - average of the worst 5%;
  - largest drawdown, median and 90th percentile;
  - odds of at least one margin call;
  - odds of NAV ≤ 0, and of a deficit.
- **Small histogram** of the largest drawdown.
- **Check line:** "Median: random $43.4k vs engine $43.2k". Jumps off only.

Results at the defaults, 10,000 paths each (v, `mc4run.js`):

| Run | Jumps | 10% / median / 90% | Largest drawdown, median | Margin call in the year |
|---|---|---|---|---|
| A, Add credit | off | $10.3k / $43.4k / $156.6k | 63% | 52.2% |
| A, Add credit | 5 years | $11.1k / $48.0k / $171.5k | 63% | 51.8% |
| A, Add credit | 2 years | $11.7k / $57.4k / $217.3k | 63% | 51.9% |
| A, Reset | off | $9.2k / $42.0k / $169.0k | 66% | 0.6% |
| A, Reset | 5 years | – | – | 12.2% |
| A, Reset | 2 years | – | – | 19.3% |
| B, strangle 50% | off | $20.8k / $39.9k / $69.2k | 34% | 61.0% |
| B, strangle 50% | 2 years | $19.5k / $44.3k / $84.9k | 38% | 59.1% |

No path reached NAV ≤ 0 at these defaults.

**What it tells the user:**
- With the total vol held, jumps take variance out of ordinary weeks. The premium is then kept more often and the median rises.
- The bad tail does not improve: the 5% point and the worst-5% average are unchanged (A: about $6–7k and $4.3k).
- Margin calls under Reset go from 0.6% to 12–19%.
- That is the layer's job: tails and odds, not a better median.

#### 5.4 Randomness

- **RNG:** a seeded mulberry32. Each path gets its own stream: seed ⊕ (path index × 0x9E3779B1).
  - **A and B see the same KORU paths**, so their difference is not noise.
  - A rerun is identical bit for bit.
- **Fixed draw count per session.** Jump sizes are drawn whether or not the jump fires, so the stream does not depend on the strategy.
- **Seed field:** default 20261001, with a "new seed" button.
- **Noise of the median between seeds** (v, earlier prototype): 1.4% at 2,000 paths, 0.4% at 10,000. Odds come with ± one standard error, e.g. "52% ± 0.7".

#### 5.5 Runtime

Measured on node 22 in this container (v):
- **Plain prototype** (`mc4.js`), 10,000 paths × 260 sessions: A 1.7 s, B 3.1 s.
- **Faster version** (`mc4f.js`): polar normals, and covered calls skip Black on ordinary days, since the covered marks do not enter the test. 5,000 paths: A 0.6 s, B 1.5 s.
- **Still to do:** strangle marks from a per-session lookup table in log-moneyness. With continuous strikes and flat IV, K/S at the open is the same every cycle, so one table of 401 points per session-of-cycle replaces Black. Expected: B at about A's speed.

**Plan:**
- **Paths:** default 5,000 per run; choices 2,000 / 5,000 / 20,000.
- **Workers:** one Worker per run (A and B in parallel), with a progress bar. About 1–1.5 s wall time at the default after the table optimisation.
- **Worker source:** build8.py writes the pure sources (Black and N, `yr_margin.js`, the calendar, `openCycle`, `yr_mc.js`) into a string constant, and the page starts it from a Blob URL.
- **Fallback:** if Workers are blocked, chunks of 250 paths per setTimeout, each under 50 ms.
- **When it runs:**
  - only when the section is open, on "Run", or automatically 400 ms after the last input if "auto" is on (off by default);
  - newer input cancels a running job;
  - stale results are greyed with "inputs changed — run again".

---

### 6. Closed forms (all verified against the engine by bisection, to 1e-6)

Notation:
- m = maintenance on the shares (KORU 75%, RAM 50%);
- L = leverage factor (3 or 2);
- λ = stock value / (cash + stock value), with this week's credit included in cash;
- u = requirement / equity with loan value = m·λ, the share of buying power in use.

#### 6.1 Shares, and covered calls without puts

- **Margin call** at a drop of d_call = (1/λ − m)/(1 − m) = m(1 − u) / (u(1 − m)).
  - KORU: 3(1 − u)/u.
  - RAM: (1 − u)/u.
  - **Fully deployed** (u = 1, λ = 1/m): d_call = 0. Initial equals maintenance, so the first tick down is a margin call.
- **NAV 0, before any sale:** d_zero = 1/λ = m/u.
  - Fully deployed, that is m: **75% for KORU**.
  - The calls' remaining mark is negligible that deep.
- **Deficit after a forced sale** with fill cost s: d > 1 − (1 − 1/λ)/(1 − s).
- **Loss at a gap d** with no sale: λ·d of equity, less the fall in the calls' mark (at most the credit).
- **Rallies:** no margin call on covered shares (Reg T values them at the strike). The NAV gain is capped near λ·(K/S − 1) plus the credit.
- **Run of weekly −X% with no trading:** the margin call comes in week ⌈ln(1 − d_call)/ln(1 − X)⌉.
  - At 1.2x: week 4 at −10%, week 3 at −15%. At 1.1x: week 7 at −15% (v).
- **Index terms, one session:** divide by 3.
  - At 1.2x: margin call at index −11.1%, NAV 0 at index −27.8% (v).

Shares only (v, `closed.js`; closed form = engine in every cell):

| λ | 1.00 | 1.10 | 1.20 | 1.25 | 1.30 | 1.333 |
|---|---|---|---|---|---|---|
| u = m·λ | 0.75 | 0.825 | 0.90 | 0.9375 | 0.975 | 1.00 |
| Margin call at a drop of | 100% | 63.64% | 33.33% | 20.00% | 7.69% | 0.00% |
| NAV 0 at a drop of | 100% | 90.91% | 83.33% | 80.00% | 76.92% | 75.00% |
| Deficit after a 1% fill | – | 90.82% | 83.16% | 79.80% | 76.69% | 74.75% |

Cushion against u:

| u | 0.80 | 0.90 | 0.95 | 0.99 | 1.00 |
|---|---|---|---|---|---|
| KORU | 75.0% | 33.3% | 15.8% | 3.0% | 0 |
| RAM | 25.0% | 11.1% | 5.3% | 1.0% | 0 |

With this week's credit in cash, the default A in week 1 is at λ 1.158, u 86.8%, so d_call is 45.5% and d_zero 86.4% (v). These are the same numbers as `revised.md`.

#### 6.2 Short strangle (no shares), legs at expiry value

Notation:
- a = min(0.2L, 1) and b = min(0.1L, 1) (KORU 0.6 and 0.3);
- q = requirement per share at entry, c = credit per share;
- e = q/u + c = equity per share of structure.

| Event | Formula | Condition |
|---|---|---|
| Margin call on a rally | x* = (Kc + e)/(1 + a) | valid while Kc − x* ≤ (a − b)·x* |
| NAV 0 on a rally | x = Kc + e | |
| Margin call on a drop | x* = (Kp − e)/(1 − a) | if x* ≥ (b/a)·Kp |
| Margin call on a drop | x* = (1 + b)·Kp − e | otherwise |
| NAV 0 on a drop | x = Kp − e | never if e ≥ Kp |

Verified at $20, continuous 23.67C / 17.48P, fractional contracts (v, `closed2c.js`):

| Margin used | Rally call | Rally NAV 0 | Drop call | Drop NAV 0 |
|---|---|---|---|---|
| 30% | +83.7% | +193.9% | never | never |
| 50% | +40.8% | +125.3% | −93.3% | never |
| 80% | +16.7% | +86.7% | −52.4% | −81.0% |

The app's readout uses Black marks at the Monday open, the IV response and whole contracts. Default B in week 1 (14 contracts, u 46.3%): +42.7% and −97.5% (v).

#### 6.3 Everything else

Covered strangles, wings, monthly holding weeks and the History shape use bisection or the tick loop. The closed forms are tests, and the fast path for the room chart where they apply.

---

### 7. UI

#### 7.1 How it shows up from the year tab

**The switch.** The sticky tab strip (30px) reads: title · **Compare A vs B** | **Compounding** [Year · Stress] · ⋯.
- The Year · Stress seg appears only while Compounding is active.
- Year stays exactly as `revised.md` describes; nothing is added to it.
- Scroll position is kept per sub-view.

**Small links from Year:**
- The result strip's margin-call cell gets a small "stress ›" link, which opens Stress with "Hits in week" set to the crosshair week.
- The Year margin panel's tooltip gets "try this move in Stress ›".

These are the only additions to the Year view.

#### 7.2 Sticky bar in the Stress view

**Row 1 is unchanged:** chips A / B, swap, B differs in. The runs are the same objects; editing them in the dock updates Stress live.

**Row 2 becomes the move row,** in span groups, left to right:

| Group | Contents |
|---|---|
| Base | Chip "Base ▾": "$30k · 52 wk · flat $20 · KORU 130/117". The menu holds the same base controls bound to the same state |
| Move | Seg Gap · Run · Drawdown · Spike · History ▾ |
| Size | [−35] % with a KORU / index toggle, and the counterpart readout "= index −11.7% in a session". The readout moves into the tooltip below 1400px |
| Shape | One or two inputs for the shape: k weeks / over n weeks / back after d sessions / history preset |
| When | "Hits in week [26]", slider 1–52, with "worst" |
| IV | Chip "IV → 173% ▾" (down, up, shift, cap) |
| Account | "Account ▾": typical / high leverage / exactly on the path |
| Rules | "Rules ▾" (§7.4) |

**Acceptance:** no taller than v7's bar at the same width (152px at 1200, 91px at 1440).

#### 7.3 Panels, top to bottom

1. Stress strip (§4.1).
2. Loss by week of impact (§4.2): full width, 240 + 100px.
3. Room before a margin call (§4.3): full width, 200px.
4. Curve (left 60%) and breakdown (right 40%), 300px (§4.4). At 1200 with the dock open the content column is about 860px: 520 + 320.
5. After the move (§4.5), collapsed.
6. Random years (§5), collapsed. Its controls sit in its own header: paths, seed, jumps preset, Run / auto, progress.
7. Method (stress), collapsed:
   - IBKR rules and their sources;
   - covered valuation;
   - the margin-call rule and fills;
   - index vs KORU and the daily reset;
   - the fund's total-loss clause at an index fall of 33% or more in a day;
   - KRX circuit breakers;
   - IV response;
   - what the module does not model: trading halts, IBKR's real choice of what to sell, house margin changes unless set, portfolio margin.

#### 7.4 Where each control lives

| Place | Controls | Kind |
|---|---|---|
| Dock (unchanged) | Runs: ticker, cadence, strategy, strikes, size, policy | Defines the strategy |
| Row 2 (Stress view) | Base ▾, Move, Size, unit, shape inputs, When, IV ▾, Account ▾ | Defines the move |
| Rules ▾ (rarely changed) | On a margin call: as the year engine / only what IBKR requires / IBKR closes everything · fills on the gap: shares −1.0%, options mark + 2× half-spread · maintenance after the move: 75% · puts in the money: at expiry / at once · during a multi-week move: keeps trading / stops · arrival: one gap per week / spread · lands on: Mon…Fri | Defines the move, rarely |
| "After the move" header | Then KORU: stays / resumes / back in [4] wk · IV stays raised [n] wk | Defines the continuation, next to its chart |
| "Random years" header | Paths, seed, jumps ▾ (presets, custom, on top / within realized), Run, auto | Defines the random layer, next to its charts |
| Panel headers ⚙ | $ and % / $ / % · overlay the other account · given-up hatch on/off · log scale (after the move) · fan bands | Display only |

#### 7.5 Painting and type

**Palette and painting:**
- A purple, B orange, as in the comparer.
- Losses red (#e34948), gains blue (#2a78d6).
- Given up: neutral grey hatch, never red.
- Margin-call marker: amber ring. Deficit: filled red.
- Halo labels, nearest-point hit layers, light and dark themes, axis ticks from `eng_head6.js`.

**Type sizes:**
- panel titles 15px semibold;
- strip numbers 18px;
- control labels 12px; values 13px;
- readouts 12px muted.

**Markup:** inline span groups, no flex walls. Desktop only, from 1200px.

**Every clamp is stated:**
- KORU at 0;
- IV capped;
- jumps above realized;
- whole contracts rounded up in a forced sale.

---

### 8. Validation (module-specific)

**Engine** (node vm with eng_head6 + the YR IIFE + data; no eng_state or eng_pos):

1. **Closed forms equal bisection to 1e-6.**
   - Shares and covered calls: the λ table in §6.1.
   - Strangles: the u table in §6.2.
   - A in week 1: 45.5% and 86.4%. B in week 1: +42.7% and −97.5%.
2. **Snapshot identity.** The NAV rebuilt from a snapshot equals the year engine's typical NAV at that week to 1e-6 relative.
   - Contracts = min(floor(n/100), cap).
   - λ90 ≥ λ typical in every week.
3. **Zero move:** loss exactly 0, and no margin call even at u = 1 (equality counts as compliant).
4. **Monotone:**
   - shares and covered calls: the loss rises with the drop;
   - strangles: the loss rises with |move| beyond the strikes;
   - the room lines stay inside [0, 100%].
5. **Covered calls on rallies:**
   - never a margin call; real loss 0;
   - given up = shares-alone gain − strategy gain, to $0.01, for single gaps (A week 1, +20%: $1,832).
6. **Index conversion:**
   - −10% → −30%;
   - −33.4% → KORU 0, with no NaN or negative prices;
   - five −5% sessions → −55.63%;
   - a −20% index week → −60.00% as a gap, −50.43% spread.
7. **Forced sale:**
   - after it, requirement ≤ equity, or everything is closed;
   - never sells more than is held; whole units;
   - NAV before − loss = NAV after, to the cent;
   - a deficit only when NAV < 0 after full closing.
8. **Assignment:** equity is unchanged by assignment at intrinsic (apart from fills), and the test re-runs. A case where a put assignment alone triggers a margin call is in the suite.
9. **History fidelity:** a 1.0x, no-cost shares run over 26 Jun → 31 Jul 2026 reproduces KORU's −59.41% close-to-close and −68.45% low exactly.
10. **Calendar:**
    - the first tick after a Friday snapshot is Monday, or Tuesday after a holiday;
    - the Thursday expiries on 24 Dec, 31 Dec, 25 Mar and 17 Jun fire on the right tick.
11. **The window boundary:** a scenario never runs flat or recovery stretches inside the window. Those always go to `runYear`, so the result does not keep premium on a wiggle-free path.
12. **Monte Carlo:**
    - **Against the engine,** jumps off, 10,000 paths: median within 3%, 10/90 within 5%, odds within 3 points.
      - Measured: A Add $43.4k vs $43.2k, 52.2% vs 54%. A Reset $42.0k vs $42.5k, 0.6% vs 0.4%.
      - **B is $39.9k vs $41.4k (−3.6%) and 61% vs 54%.** This must be reconciled before shipping. The likely cause: Monte Carlo marks the legs with the actual time left in the margin test, while the engine uses half the cycle.
    - **Determinism:** same seed → identical output; A and B get the same KORU paths.
    - **Jump compensation:** with jumps on, KORU's median at week 52 is within 2% of the path.
    - **Jumps above realized:** jump variance > realized² → diffusion 0, with the note.

**Performance** (playwright, Chromium):
- stress stage for A and B ≤ 25 ms;
- Monte Carlo default ≤ 1.5 s wall in Workers, and no main-thread task over 50 ms while it runs;
- the fallback chunks stay under 50 ms each.

**UI** (screens at 1200 and 1440, light and dark):
- Stress default;
- History preset 26 Jun 2026 on B;
- Spike with the +45% cliff;
- Account = high leverage;
- After the move open;
- Random years mid-run and done.

On each screen, check:
- no horizontal scroll with the dock open; the sticky bar within the limit;
- crosshair aligned across the two by-week charts;
- markers readable in dark mode; the given-up hatch distinct from losses;
- tooltips inside the viewport; no console errors;
- the Year view unchanged by any Stress interaction (pixel diff of Year before and after a Stress session).

---

### 9. Open questions (superseded by Part 0.5)

#### 1. During a multi-week move, should the strategy keep trading?

That means selling new calls or strangles and applying its policy at each expiry, or stopping at the first move and just holding.

**Recommended:** keeps trading, as the year engine would.

Effect (v), week 1, run of three −20% gaps:

| | Keeps trading | Stops |
|---|---|---|
| A | −51.1% | −55.0% |
| B | −39.2% | −30.1% (no new puts sold into each gap) |

#### 2. Default jumps in "Random years"

Options: the last 2 years of KORU (6.5 down gaps of about −25% and 3 up gaps of about +29% a year, inside your 117%), the 5-year rate, or off.

**Recommended:** the 2-year preset, with the total vol held at your realized.

This leaves A's margin-call odds at about 52% under Add credit, but takes Reset from 0.6% to 19%. It leaves the bad tail as it is and raises the median, and the panel says why.

#### 3. Which account the move hits by default

Options: the typical account, or the high-leverage one (90th percentile of leverage under Add credit).

**Recommended:** typical, with the high-leverage account one click away and overlaid dashed on the by-week charts.

Effect: a −35% gap in week 26 costs 34.6% typical and 39.2% high-leverage. In week 13, the high-leverage account is already margin-called at a 29% drop.
