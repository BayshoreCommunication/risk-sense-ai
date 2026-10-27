# Meaningful RiskSense favicon

Date: 2026-10-27  
Requirement: NFR-08

## What changed

- Replaced the generic letter favicon with the owner-selected Figma shield/check artwork from node `501:94`.
- Added 512 px application-icon and 180 px Apple-touch-icon variants.
- Kept a 32 px `.ico` fallback for browsers that still request `/favicon.ico` directly.
- Center-cropped the 365 × 300 px capture to a 300 × 300 px square before resizing, preserving the shield proportion without stretching.
- Applied an 88 px rounded-square alpha mask to the 512 px master so only the four outer corners become transparent.

## Where

- `app/favicon.ico`
- `app/icon.png`
- `app/apple-icon.png`
- `e2e/frontend-correctness.spec.ts`
- `docs/dev-notes/assets/meaningful-favicon-browser.png`
- `docs/dev-notes/assets/meaningful-favicon-comparison.png`
- `docs/dev-notes/assets/meaningful-favicon-source.png`
- `docs/dev-notes/assets/meaningful-favicon-rounded-source.png`
- `design-qa.md`

## Why

The Figma artwork communicates protected, verified risk decisions while matching the broader login-page visual language. Its luminous shield/check remains identifiable at browser-tab size, and the orbit/signal details add a stronger RiskSense AI character at larger shortcut sizes.

## Alternatives rejected

- The previous navy tile with a solid shield was rejected after the owner selected the Figma node artwork.
- Stretching the wide capture to a square was rejected because it distorts the shield.
- Recreating the image as SVG or code-native shapes was rejected because it would drift from the selected Figma artwork.
- A circular crop was rejected because it removes too much orbital artwork and weakens the square application-icon silhouette.

## How to verify

1. Run the frontend locally and open any page.
2. Confirm the page head resolves `/favicon.ico`, `/icon.png`, and `/apple-icon.png`.
3. Open `/icon.png` and confirm it matches the selected source with clean transparent rounded corners, a blue field, centered luminous shield/check, orbit lines and signal points.
4. Run `npm run typecheck` and `npm run lint`.
5. Run `npm run e2e:frontend -- --grep "protected-decision brand assets"`.

## Verification completed

- TypeScript typecheck: passed.
- ESLint: passed.
- Focused Playwright favicon metadata/asset test: 1 passed.
- In-app browser head inspection: `.ico`, application PNG and Apple-touch PNG links resolved.
- Product Design comparison: passed with no actionable P0/P1/P2 finding.

