---
stack: other
setup: npm install
gate-format: none
gate-lint: none
gate-typecheck: none
gate-build: none
gate-test: node --test
run: none
req-tag: test name prefix R-xx
test-globs: tests/**
ui-globs: src/**/*.jsx
---
# Profile
Plain ESM JavaScript. Source in `src/`, tests in `tests/` with `node:test`; test names start with the requirement ID.
