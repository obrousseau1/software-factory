---
name: draft-docs
description: Brainstorm and draft a spaceport work order's spec.md (testable R-xx requirements, each with how it is tested) and plan.md (approach + shreds table) in one pass, returning open design questions first when choices are the user's to make. Use for the architect agent's pass in liftoff's docs step.
---

# Draft docs

Inputs from the prompt: **work-order folder**, and optionally **answers** (to your earlier
questions) or **feedback** (from the user's gate or the docs check).

## 1. Read

From the work-order folder: `intent.md`, and `spec.md` + `plan.md` when revising. From the repo:
`.liftoff/profile.md` (stack, architecture, conventions, `test-globs`), the `- [architect]` lines
of `.liftoff/lessons.md` if present (apply them), then the code the idea touches.
For broad questions spawn `spaceport:explorer`; cite what you rely on.

## 2. Brainstorm (no answers, no feedback)

List the design choices the intent leaves open. For each: 2-4 options, trade-offs in one line,
your recommendation.

- A choice is the user's when it changes what they get (behaviour, scope, UX, data kept) or
  what it costs them. Ask those, at most 4.
- Choices with a conventional default, or settled by the code: decide, record in Decisions.
- Questions to ask → return `Status: questions`, `Draft: none`. Stop.
- None → go to step 3 in the same pass.

## 3. Draft

Fill [spec-template.md](spec-template.md), then [plan-template.md](plan-template.md) from it.
Every answer and every decision you took goes in the `## Decisions` of the doc it shapes: the
choice, the options rejected (from your brainstorm or the question asked), and why this one won.

**Spec rules**
- One requirement per observable behaviour: `### R-01: <title>`, numbered from 01, no gaps.
- Each has acceptance criteria a test can check (given / when / then). No "fast", "nice", "robust".
- Each ends with one `- Test:` line: `automated — <test file>: <what it asserts>`, or, only for
  what a test cannot see (look, feel, a real device), `manual — <how to check>`. A test that would
  pass with the feature removed is not a test: name the assertion that fails without it.
- The test file is a repo-relative path (a hook checks the build changed it). Prefer an existing
  test file, and the widest test level the repo supports: what the user experiences, the edge
  cases they hit, the error messages they see.
- Nothing the intent puts out of scope. Size `app` → R-01 is the walking skeleton (builds, one
  screen or endpoint, one passing test).

**Plan rules**
- Every `R-xx` of the spec in exactly one shred. A shred: one region of code, independently
  shippable, ordered so dependencies come first; `Depends on` lists earlier shred numbers or `—`.
- Region names the code folder or files the shred changes.
- UX per shred: `none` (no UI change), `simple` (UI code review), `deep` (needs a running app).
- Name real files and patterns from the repo; reuse before adding.

## 4. Revise (feedback)

Read the current docs, apply the feedback, keep requirement IDs stable (never renumber; a dropped
requirement leaves its ID unused). Return both full docs, revised. List what changed in `Notes`.

## Return

The report format of your agent definition. The drafts have no `## Changelog`: liftoff adds it.
