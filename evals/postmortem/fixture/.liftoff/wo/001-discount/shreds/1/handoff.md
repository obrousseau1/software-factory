---
turn: 3
twin: B
phase: CHALLENGE
challenge: findings r1
build: none
---

# Handoff

## Done
- R-01, R-02 built and challenged.
- F1-1: applyDiscount now throws `Unknown code: <code>`; test asserts the throw.

## Design choices
- Codes in a constant map.

## Doubts
| ID | Doubt | Status |
|----|-------|--------|
| F1-1 | [Major spec-validator] src/discount.js:4: unknown code returns the total instead of throwing (R-02) | fixed: throws, test R-02 asserts it |
