---
name: draft-docs
description: Brainstorm and draft a spaceport work order's spec.md (testable R-xx requirements) or plan.md (approach + shreds table), returning open design questions first when choices are the user's to make. Use for the architect agent's pass in liftoff's specs and plan steps.
---

# Draft docs

Inputs from the prompt: **mode** (`spec` or `plan`), **work-order folder**, and optionally
**answers** (to your earlier questions) or **feedback** (from the user's gate).

## 1. Read

From the work-order folder: `intent.md`; for `plan` also `spec.md`. From the repo:
`.liftoff/profile.md` (stack, architecture, conventions), then the code the idea touches.
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

Fill [spec-template.md](spec-template.md) or [plan-template.md](plan-template.md). Every answer
and every decision you took goes in `## Decisions`: the choice, the options rejected (from your
brainstorm or the question asked), and why this one won.

**Spec rules**
- One requirement per observable behaviour: `### R-01: <title>`, numbered from 01, no gaps.
- Each has acceptance criteria a test can check (given / when / then). No "fast", "nice", "robust".
- Nothing the intent puts out of scope. Size `app` → R-01 is the walking skeleton (builds, one
  screen or endpoint, one passing test).

**Plan rules**
- Every `R-xx` of the spec in exactly one shred. A shred: one region of code, independently
  shippable, ordered so dependencies come first; `Depends on` lists earlier shred numbers or `—`.
- UX per shred: `none` (no UI change), `simple` (UI code review), `deep` (needs a running app).
- Name real files and patterns from the repo; reuse before adding.

## 4. Revise (feedback)

Read the current doc, apply the feedback, keep requirement IDs stable (never renumber; a dropped
requirement leaves its ID unused). Return the full revised doc. List what changed in `Notes`.

## Return

The report format of your agent definition. The draft has no `## Changelog`: liftoff adds it.
