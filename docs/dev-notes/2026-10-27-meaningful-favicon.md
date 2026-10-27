# Meaningful RiskSense favicon

Date: 2026-10-27  
Requirement: NFR-08

## What changed

- Replaced the generic letter favicon with a compact RiskSense identity: a white protection shield and blue verified-decision check on the established navy surface.
- Added 512 px application-icon and 180 px Apple-touch-icon variants.
- Kept a 32 px `.ico` fallback for browsers that still request `/favicon.ico` directly.
- Removed only the generated source's connected white outer corners so the icon sits cleanly on light and dark browser chrome.

## Where

- `app/favicon.ico`
- `app/icon.png`
- `app/apple-icon.png`
- `e2e/frontend-correctness.spec.ts`
- `docs/dev-notes/assets/meaningful-favicon-browser.png`
- `docs/dev-notes/assets/meaningful-favicon-comparison.png`
- `design-qa.md`

## Why

The former single-letter mark named the product but did not communicate its purpose. The shield/check combination communicates protected, reviewed risk decisions without relying on tiny text, so it remains recognizable at normal browser-tab sizes.

## Alternatives rejected

- A detailed monogram was rejected because letterforms and small decorative details collapse at 16–32 px.
- A shield outline was rejected because thin strokes lose clarity at favicon scale.
- Leaving white canvas corners was rejected because they create a visible box on dark browser chrome.

## How to verify

1. Run the frontend locally and open any page.
2. Confirm the page head resolves `/favicon.ico`, `/icon.png`, and `/apple-icon.png`.
3. Open `/icon.png` and confirm the navy tile, white shield, blue check, and transparent outer corners.
4. Run `npm run typecheck` and `npm run lint`.
5. Run `npm run e2e:frontend -- --grep "protected-decision brand assets"`.

## Verification completed

- TypeScript typecheck: passed.
- ESLint: passed.
- Focused Playwright favicon metadata/asset test: 1 passed.
- In-app browser head inspection: `.ico`, application PNG and Apple-touch PNG links resolved.
- Product Design comparison: passed with no actionable P0/P1/P2 finding.

