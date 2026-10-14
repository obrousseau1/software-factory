# Spec: Discount percentage on orders

An order can carry a discount percentage that reduces its total; the API exposes it and rejects invalid values.

## Requirements

### R-01: Order carries an optional discount percentage
- Given an order created without a discount, when its total is computed, then it equals the sum of its lines.

### R-02: Total applies the discount
- Given lines totalling 200 and a discount of 15, when the total is computed, then it is 170.00.
- Given a total of 10 and a discount of 33.333, then the total is rounded to 2 decimals (6.67).

### R-03: Invalid percentage is rejected
- Given a discount below 0 or above 100, when the order is created, then an ArgumentOutOfRangeException is thrown.

### R-04: API returns the discounted total
- Given a POST /orders with a discount of 10 on lines totalling 50, then the response is 200 with 45.00.
- Given a POST /orders with a discount of 120, then the response is 400.

## Out of scope
- Discount codes, per-line discounts, persistence.

## Decisions
| Decision | Rejected | Why | By |
|----------|----------|-----|----|
| Discount is a decimal property on Order, default 0 | Separate DiscountedOrder type | Keeps existing callers working | architect |
| MidpointRounding.AwayFromZero | Banker's rounding (ToEven) | Matches finance expectations | user |

## Changelog
| Date | Step | Change | Why |
|------|------|--------|-----|
| 2026-10-14 | specs | Created | approved by user |
