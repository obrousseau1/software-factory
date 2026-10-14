---
stack: other
gate-format: test -z "$(gofmt -l .)"
gate-lint: go vet ./...
gate-typecheck: none
gate-build: go build ./...
gate-test: go test ./...
run: go run .
req-tag: Go test name contains the ID, e.g. TestR01_Greet, plus a // R-01 comment
ui-globs: none
---

# Repo profile

## Architecture

Single Go module `example.com/greet`: a console program with one function and its test.

## Folder roles

| Folder | Role |
|--------|------|
| `.` | Module root: code and `_test.go` files side by side |

## Conventions

- Standard Go layout; tests next to code.

## Gate sources

| Key | From |
|-----|------|
| all | Go toolchain defaults (no CI or Makefile) |
