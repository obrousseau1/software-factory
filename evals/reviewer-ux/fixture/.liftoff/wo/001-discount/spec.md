# Spec: discount codes

### R-01: SAVE10 takes 10% off
Given a cart total and the code SAVE10, when the discount applies, then the total drops by 10%, rounded to cents.

### R-02: Unknown codes are refused
Given any code other than SAVE10, when the discount applies, then it throws `Unknown code: <code>` and the total is unchanged.

### R-03: Discount form
Given the checkout page, when the user types a code and submits, then the new total shows; an unknown code shows the error message next to the field.

## Changelog
| Date | Step | Change | Why |
|------|------|--------|-----|
| 2026-10-15 | specs | Initial | Intent approved |
