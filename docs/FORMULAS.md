# Formula Notes

This document records the current CardFit calculation policy. It is intentionally practical rather than legally exhaustive; official card terms remain the source of truth.

## Monthly Spend

- `monthlyCardUsage[month][cardId].currentMonthSpend` is the selected month's card spend.
- Dashboard quick inputs and card detail inputs write to the same monthly field.
- `prevMonthStatus` accepts only `met`, `unmet`, or `manual` after import/migration.

## Practical Benefit Value

Practical benefit value is a supporting metric for real usage, not a replacement for annual coupons/gifts.

Included:

- Direct discount/cashback/point/mileage values.
- Automatic default rewards for `reward` benefits in `other`.
- User-specific monthly-spend patterns for cards that are always used in a fixed way.

Excluded:

- Annual fee gifts/coupons.
- Informational benefits.
- Lounge/valet/hotel memberships that are tracked as count/check items unless a value is manually entered.

Manual override:

- Positive `benefitValue` always overrides automatic value for that benefit line.
- `benefitValue: 0` only suppresses automatic value when `manualBenefitOverride: true`.
- Entering `usedAmount` on auto-calculable benefits resets `manualBenefitOverride` to `false` and recalculates the benefit value.

## Benefit Types

- `reward`: point/mileage reward. Supports `rate`, `pointsPer1000`, `pointCurrency`, and `monthlyPointCap`.
- `amount_cap`: rate/fixed value with monthly or annual cap.
- `amount_cap_pool` / `reward_cap_pool`: shares a cap with a container benefit via `capPoolId`.
- `count_amount`: fixed or rate benefit with count limits.
- `count`: count-only usage tracking.
- `check` / `info_check` / `info`: tracked or informational benefits, excluded from practical value unless explicitly valued elsewhere.
- `two_transactions`: special monthly two-transaction pattern.
- `milestone`: annual milestone display.

## Current User Pattern Rules

- SKT Woori: monthly spend tier maps to telecom discount 300k/700k/1,000k = 10k/15k/20k, blocked when previous month is `unmet`.
- Woori Point: all monthly spend is treated as simple-pay spend. 3.8% capped by 300k/600k/1,200k = 10k/20k/50k, less explicit same-pool manual values.
- KB TalkTalk my point: all monthly spend is treated as KB Pay. 5% capped at 10k plus base 0.5%.
- MG+S Hana: all monthly spend is treated as simple-pay. 10% capped by 300k/600k/1,000k = 15k/30k/60k, less explicit same-pool manual values.
- Shinhan Always On: monthly spend of at least 10k is treated as the planned two-transaction pattern and values at 2,000P.
- Coupang WOW: monthly spend is treated as Coupang payment and values at 4%.

## Recommendation Rules

- Category/subcategory matching controls direct benefit candidates.
- Base `other` rewards can be added when a card has a direct category match.
- Benefits that require previous-month spend are blocked when `prevMonthStatus` is `unmet`.
- The phrase "전월실적 관계없이" is treated as exempt; a new-card grace period phrase alone does not exempt the benefit.
- `monthlyPointCap`, monthly cap, annual cap, and usage counts reduce recommendation value.

## Regression Coverage

Run:

```bash
npm run audit:check
```

The audit check covers the current golden cases for the user-specific card patterns, manual override behavior, recommendation monthly point caps, previous-month unmet blocking, and import sanitization.
