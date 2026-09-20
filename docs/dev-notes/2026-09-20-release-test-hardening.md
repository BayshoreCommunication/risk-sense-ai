# Release test hardening

Date: 2026-09-20

Requirements: FR-01, FR-02, FR-22, AI-01, SEC-02, NFR-08

## Summary

The final pre-release full-stack role suite now follows the current governed result UI and uses an
isolated requestor identity. These are test-harness corrections; application behavior and data
contracts are unchanged.

## What changed, where, and why

| File | What and why |
|---|---|
| `e2e/helpers.ts` | Allows up to 30 seconds for the first authenticated navigation so a development cold compile cannot create a false login failure. |
| `e2e/roles.spec.ts` | Uses the dedicated paid requestor for the mutating end-to-end journey so a simultaneous browser session on the public shared-demo identity cannot supersede the test session. The result assertion now follows the semantic result region and its accessible score image instead of matching text from the retired score-slab layout. |
| `design-qa.md` | Restores the complete design evidence and records the current 63-case mocked-browser and 11-case enabled full-stack results. |

## Alternatives rejected

- Increasing the shared-demo session limit was rejected because it would weaken the production
  session policy to accommodate a test concern.
- Retrying after `SESSION_INVALID` was rejected because it would hide a real session replacement.
- Reintroducing visually duplicated score text was rejected because the semantic accessible score
  already represents the current design correctly.

## Verification

- The isolated requestor journey passed 1/1.
- The full-stack Playwright suite passed all 11 enabled role journeys; four non-development
  authentication cases were intentionally skipped by configuration.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed after the test update.
- `git diff --check` passed.

