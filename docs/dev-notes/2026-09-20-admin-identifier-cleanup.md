# User-facing identifier-label cleanup

Requirements: DASH-02, DASH-03, FR-05, FR-06, FR-11, FR-15, AI-03, FR-20, NFR-07, NFR-08

## What changed

- `components/admin/format-identifier-label.ts` provides the shared display formatter for machine identifiers. API values remain unchanged, while labels replace separators, use title case and preserve common acronyms. `components/admin/ContentManager.tsx` uses it for select and facet labels.
- `components/chat/ChatSession.tsx` removes the redundant machine scenario key below the already readable selected-scenario label. The key remains in assessment state and API traffic, but is no longer repeated as user-facing copy.
- `app/(admin)/admin/scenarios/page.tsx` presents the scenario persona as a readable label in both the featured summary and the catalog table.
- `app/(admin)/admin/questions/page.tsx` presents readable, de-duplicated taxonomy badges instead of raw persona and sector keys.
- `app/(admin)/admin/review/page.tsx` and `app/(admin)/admin/analytics/page.tsx` present readable persona, scenario and fallback status/classification labels.
- `e2e/content-manager.spec.ts` and `e2e/frontend-correctness.spec.ts` add assertions to existing requirement-labelled scenarios so Requestor and Administrator read surfaces do not expose raw example keys without increasing the suite inventory.

## Boundaries and rationale

Stable keys remain in Administrator authoring controls because scenarios, question flows, facts and rules reference them directly. Dataset sequence numbers, content versions, change references and the shortened assessment ID also remain visible because they differentiate governed evidence or lifecycle versions. The cleanup is display-only and does not change API payloads, persisted content or filtering.

System Administrator tenant slugs and conformance references, plus Auditor record IDs, sequence numbers, hashes and reconstruction field paths, remain visible because they are operational or evidentiary data rather than duplicate presentation labels.

## Alternatives rejected

- Fetching current persona and scenario records for every review row was rejected because historical assessments pin content and the current catalog is not an authoritative label source for every historical version.
- Removing identifiers from authoring forms was rejected because it would prevent administrators from managing the stable references used by deterministic content and scoring rules.

## Verification

Run `npm run lint`, `npm run typecheck`, and the targeted Playwright specs for `e2e/content-manager.spec.ts` and the Administrator review/analytics cases in `e2e/frontend-correctness.spec.ts`.
