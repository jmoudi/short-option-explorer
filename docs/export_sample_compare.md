# RAM strangle 13/20 vs KORU strangle 18/30

RAM · KORU options lab, Compare A vs B · IBKR quotes at 1 Oct 2026 close (spot RAM 14.45, KORU 21.09) · exported 2 Oct 2026

View code (paste into ⋯ → Load a view code, or append to the lab's address): #v9.eyJ0IjoiY29tcGFyZSIsInRoIjoiYXV0byIsImMiOnsiY21wIjp7IkEiOnsiaW5zdCI6eyJpZCI6IlJBTSJ9LCJleHAiOiIyMDI2MTEyMCIsInN0cnVjdHVyZSI6InN0cmFuZ2xlIiwibGVncyI6InRvZ2V0aGVyIiwiYmFzaXMiOiJkZWx0YSIsInZhbHVlcyI6eyJjZW50ZXIiOiJhdG0iLCJwdXQiOjMwLCJjYWxsIjozMH0sIndpbmdzIjp7ImNhbGwiOnsib24iOmZhbHNlLCJ2YWx1ZSI6MTV9LCJwdXQiOnsib24iOmZhbHNlLCJ2YWx1ZSI6MTV9fSwiZmlsbCI6Im1pZCJ9LCJCIjp7Imluc3QiOnsiaWQiOiJLT1JVIn19LCJsaW5rcyI6eyJpbnN0IjpmYWxzZSwiZXhwIjp0cnVlLCJzdHJ1Y3R1cmUiOnRydWUsImxlZ3MiOnRydWUsInBsYWNlbWVudCI6dHJ1ZSwid2luZ0NhbGwiOnRydWUsIndpbmdQdXQiOnRydWUsImZpbGwiOnRydWV9LCJleHBNYXAiOiJuZWFyZXN0Iiwic2l6aW5nIjp7InJ1bGUiOiJhdXRvIiwiaCI6MX19LCJzY2VuIjp7InVuaXQiOiJzaWciLCJybG8iOjIsInJoaSI6MiwicmxpbmsiOnRydWUsIndsIjoidmlldyIsIndsbyI6Miwid2hpIjoyLCJkaXN0Ijoicm4iLCJodmsiOjEsIml2cyI6MCwic3ZzIjowLCJzdmQiOnRydWUsImFsaWduIjoiZnJhYyJ9LCJ2aWV3Ijp7InVuaXRzIjoicGN0Iiwib3ZtIjoiY3IiLCJvdnYiOiJjaGFydCIsImd2aWV3IjoiaGVhdCIsImd2YWwiOiJwbmwiLCJndGFiIjoiRCIsIm5tIjoxMywibmQiOjcsImdsIjpmYWxzZSwiY3QiOiJ6ZXJvIiwiY3RzIjo1LCJvdmsiOnRydWUsIm92YyI6dHJ1ZSwib3ZiIjpmYWxzZSwib3ZzIjp0cnVlLCJvdm8iOnRydWUsInBzbyI6dHJ1ZSwicHNzIjp0cnVlLCJjcyI6ImNvbXAiLCJjciI6ImF1dG8iLCJjcngiOjIwLCJzaGFyZWQiOnRydWUsInN3ZWVwIjoiYm90aCIsImpkYXkiOi0xLCJwaW5zIjpbXSwiZG9jayI6dHJ1ZSwidGhlbWUiOiJhdXRvIiwicmRIaXQiOiJtb3ZlIiwicmRLIjoyLCJyZERpciI6IndvcnNlIiwicmRMIjo2MCwicmRCYXNlIjoibmF2IiwicmRDYXAiOiJtYXJnaW4iLCJyZEciOiJldiIsInJkR2MiOjJ9fX0

## Comparison

B follows A in every aspect except the instrument.

### A · RAM 20 Nov · short strangle 13 / 20

RAM at 14.45 · expiry 20 Nov, 50 days · filled at mid. Placement by Δ: strangle, put 30Δ / call 30Δ, legs together.

| Leg        | Strike |    Bid / mid / ask |     Fill | Per contract | Target |   Δ | % OTM |     σ |
| ---------- | ------ | -----------------: | -------: | -----------: | -----: | --: | ----: | ----: |
| Short put  | 13P    | 1.55 / 1.65 / 1.75 | 1.65 mid |  credit $165 |    30Δ | 32Δ | 10.0% | 0.25σ |
| Short call | 20C    | 0.85 / 0.90 / 0.95 | 0.90 mid |   credit $90 |    30Δ | 29Δ | 38.5% | 0.77σ |

**Net credit $255 per contract** · 17.6% of spot

### B · KORU 20 Nov · short strangle 18 / 30

KORU at 21.09 · forward 20.68 · expiry 20 Nov, 50 days · filled at mid. Placement by Δ: strangle, put 30Δ / call 30Δ, legs together.

| Leg        | Strike |    Bid / mid / ask |     Fill | Per contract | Target |   Δ | % OTM |     σ |
| ---------- | ------ | -----------------: | -------: | -----------: | -----: | --: | ----: | ----: |
| Short put  | 18P    | 2.20 / 2.45 / 2.70 | 2.45 mid |  credit $245 |    30Δ | 30Δ | 13.0% | 0.29σ |
| Short call | 30C    | 1.25 / 1.48 / 1.70 | 1.48 mid |  credit $148 |    30Δ | 30Δ | 45.1% | 0.77σ |

**Net credit $393 per contract** · 18.6% of spot · sized ×0.71 B contracts per A contract (auto: equal vega; h = 1.034 × A's notional)

$ per contract are per 100 shares: + credit for a short leg, − debit for a long wing. B's figures are per B contract, before the contract sizing.

## Assumptions

|                         |                A |                B |
| ----------------------- | ---------------: | ---------------: |
| Instrument              |              RAM |             KORU |
| Spot                    |   14.45 (listed) |   21.09 (listed) |
| IV shift on every quote |             none |             none |
| HV30 (IBKR)             |             102% |             117% |
| Leverage                |               2× |               3× |
| Expiry                  | 20 Nov · 50 days | 20 Nov · 50 days |
| ATM IV at expiry        |           114.5% |           130.3% |
| Forward                 |            14.44 |            20.68 |

- Odds: implied, the risk-neutral distribution from each smile (EV is then fill vs mid, 0 at mid).
- Move range −2σ to +2σ: RAM 6.19–33.72, KORU 8.04–55.31. Move unit σ = each instrument's ATM vol at A's horizon × √T. Worst loss is measured over the view range.
- Pair sizing: auto (equal vega), h = 1.034: B's notional is 1.03× A's, i.e. ×0.71 B contracts per A contract.

## Results

Values are % of A's notional; B is scaled by h = 1.034. Ratios use time value.

No correlation between RAM and KORU is modelled, so the pair column only shows figures that add up.

|                                                                                |                  A |             B ×1.03 | A − 1.03·B | A / B |
| ------------------------------------------------------------------------------ | -----------------: | ------------------: | ---------: | ----: |
| Legs                                                                           | RAM strangle 13/20 | KORU strangle 18/30 |            |       |
| Credit                                                                         |             +17.6% |              +19.2% |      −1.6% | 0.92× |
| Credit/σ (size-free, own σ to expiry)                                          |              0.416 |               0.386 |            | 1.08× |
| Credit per day                                                                 |            +0.353% |             +0.385% |    −0.032% | 0.92× |
| Expected value · implied odds: fill vs mid, 0 at mid                           |              0.00% |               0.00% |      0.00% |     – |
| Profit odds · implied (P&L above 0 at expiry)                                  |                63% |                 63% |            |       |
| Worst loss within the view range (−2σ to +2σ: RAM 6.19–33.72, KORU 8.04–55.31) |             −77.3% |             −104.8% |            | 0.74× |
| Vega per vol point                                                             |             −0.26% |              −0.26% |      0.00% | 1.00× |
| Margin (approx.: 20% × leverage, RAM 2×, KORU 3×, Reg-T style)                 |              47.6% |               66.1% |            | 0.72× |
| Credit / margin                                                                |              37.1% |               29.1% |            | 1.27× |
| Breakevens                                                                     |      10.45 / 22.55 |       14.07 / 33.92 |            |       |

## Recovery dynamics

How many cycles of normal compounding one bad hit is worth. The hit is a 2σ move to its own expiry, the worse side; a cycle rolls the same tenor, whole cycles round up, and dates count from 1 Oct 2026. Measured against NAV when it lands, recovery and buffer take the same time at a constant growth rate.

|                                              | A                                       | B                                       |
| -------------------------------------------- | --------------------------------------- | --------------------------------------- |
| Position                                     | RAM 20 Nov · short strangle 13 / 20     | KORU 20 Nov · short strangle 18 / 30    |
| Cycle                                        | 50 days                                 | 50 days                                 |
| Growth per cycle (EV at HV30 odds on margin) | +6.53%                                  | +4.63%                                  |
| Hit (% of NAV when it lands)                 | −162% at 33.72                          | −159% at 55.31                          |
| Recovery (hit first)                         | wiped out (the hit exceeds the capital) | wiped out (the hit exceeds the capital) |
| Buffer (climb first)                         | wiped out (the hit exceeds the capital) | wiped out (the hit exceeds the capital) |

## Notes

- Not modelled: early assignment (flagged only), dividends, leveraged-ETF path decay beyond what the smile implies.
