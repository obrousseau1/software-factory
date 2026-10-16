---
size: feature
---

# Intent: Discount percentage on orders

**Idea:** apply a percentage discount to an order total

## Problem
Sales staff cannot give a discount: `Order.Total()` always returns the full price.

## Outcome
An order can carry a discount percentage between 0 and 100. Its total is reduced by that
percentage, rounded to 2 decimals. `POST /orders` returns the discounted total and rejects a
percentage outside 0-100 with HTTP 400.

## Users
Sales staff creating orders through the API.

## Out of scope
- Discount codes, per-line discounts, persistence.

## Context
- `src/Orders.Domain/Order.cs:5`: `Order` record, `Total()` sums lines.
- `src/Orders.Api/Program.cs:4`: `POST /orders` returns `order.Total()`.

## Changelog
| Date | Step | Change | Why |
|------|------|--------|-----|
| 2026-10-14 | intent | Created | confirmed by user |
