# Findings: reviewer, round 1

| # | Severity | Where | Finding |
|---|----------|-------|---------|
| 1 | Major | src/discount.js:4 | R-02: an unknown code returns the total unchanged; the spec says it must throw `Unknown code: <code>`. The R-02 test asserts the wrong behaviour. |
