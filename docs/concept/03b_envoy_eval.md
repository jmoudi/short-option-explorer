# The envoy's evaluation of draft 1 (one message; Fable has the last say)

The draft does what the user asked. It names the accretion concretely and finds an idea that explains it: one trade, three
scales, one set of assumptions. It also gives each overlap cluster one name and one form. The three-kinds-of-area rule,
Shock as a defined object, EV as one word, one safe-size chart, the two clocks, the single sidebar and the glossary
should all stay. My points below, most important first. Each one is a proposal; take or leave it.

## 1. The parent tabs mix two axes

Trade and Account are scales; Shock is a concept that cuts across scales. That works for comparability, and it is the
point of the user's complaint. It costs the frame its logic, though, and it already shows in three places:

- **Pair appears twice.** Pair is a Payoff lens and also Shock › Pair. Give it one home. I lean to Shock › Pair, since
  it is a two-ticker shock grid, and dropping the lens.
- **Size sits under Account,** but its second ceiling is "survives the shock", and Shock › Recovery repeats the
  safe-size line.
- **The cycle scale has no page.** Outcomes (per cycle) sits under Trade and Recovery (in cycles) under Shock.

There are two cleaner options:

- **(a) Parents as questions.** Trade (what it is and does), Risk (Loss · Recovery · Size · Pair), Account (Weeks ·
  Paths). Size moves next to the shock it is tested against. The random-paths check gets promoted, because a trader
  running an account wants the spread of paths, not only the typical one.
- **(b) Keep your three parents,** but state outright that Shock is the one parent organized by concept, and why.
  Then move Size under Shock, since both ceilings are survival tests.

Either way, either give the cycle scale its own visible place or demote it to a conversion ("per cycle" as a unit or
a switch) and say so. Today it is named as a scale and then has no home.

## 2. Don't lose what the user just accepted on the first screen

Cutting the summary cards is right as definition-area hygiene. But two items from the pit-trader round, which the user
accepted ("I agree to all you blamed"), lived there:

- the Greeks at first look;
- bid × ask per leg, i.e. what you would actually trade.

The draft demotes the Greeks to "more rows" and drops the quote line. I propose a thin **readout line** above the
Payoff graphic. It is a reading area, not a definition: per trade, credit · EV · odds of profit · delta · theta ·
vega, plus the legs' bid × ask (a fact, visually set apart). The Greeks stay full rows in the Scorecard. This keeps
"the large graphic on top" and gives the trader the floor view before scrolling.

## 3. The shock needs a horizon, and a unit that display settings cannot change

**Horizon.** Today's readings disagree on when the shock is marked:
- Worst loss marks it at expiry.
- The Recovery hit is kσ to the trade's own expiry.
- Stress lands it in a session, marked at the shocked IV.

"Loss at the shock" is only comparable if the definition says when the loss is marked. I propose this definition:
- the shock **lands** at the cursor (Day on the trade scale, Week on the account);
- it is **marked** at the shocked IV, both at the low and at the end of a multi-session shape;
- an "at expiry" reading stays as a second column of the same table, not as a second concept.

**Unit.** The size is "in the move scale", and the move scale sits in the View bar. Switching σ ↔ % must not silently
change a defined shock. Store the shock in one canonical unit, show it in the move scale, and say in the glossary that
the View bar converts and never redefines. The same holds for the range.

**Worst within a range.** It is not always the same as the worse-side endpoint. Keep it as a shock shape: "anywhere
up to size". The definition then covers it without a special case.

## 4. Smaller points

- **Odds from:** "typed" duplicates the typed period vol. I'd make it implied · period vol · past closes, with
  typed living on period vol.
- **"Trade" collides.** The parent tab "Trade" and the cards "Trade A / Trade B" use the same word. Consider
  "Position" for the cards and keep "Trade" for the parent. Or keep both and say why in the glossary.
- **The sidebar adapts to the page.** The Account card is noise on a Payoff page. Cards that matter on the page stay
  open; the others collapse to a one-line summary. That is the ghetto principle applied to the sidebar.
- **Eight lenses are a lot.** Once Pair leaves, seven remain. Fine, but group them in the lens switch: price views
  (P&L, All days, Profit zone, EV map) vs day views (Day change, Time decay, Decay vs move).
- **One margin rule:** agreed. Name it in the glossary as the rule for naked short options on leveraged ETFs, so
  that "% of margin" and margin calls share one source.
- **Outcome switch on Weeks:** "fixed share x" and "managed" are exit rules, while "typical" and "average" are
  readings. Two axes in one switch. Consider "reading: typical | average" and "exit: held | managed | fixed share x",
  with the exit drawn from Assumptions.
- **First screen:** land on Trade › Payoff with A and B. The app's name is the Comparer; "B off" is a mode, not the
  default.

## 5. What I would not change

- The diagnosis.
- The three rules.
- The glossary's banned words.
- The colour table: violet/orange sides, teal for the pair and the cursors, magenta for the hypothetical, green/red only
  for P&L sign and moves.
- Method as one document.
- Export sections equal to the junior pages.
