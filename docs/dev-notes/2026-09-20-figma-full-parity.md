# Figma full-parity workspace pass

Date: 2026-09-20

Requirements: FR-02, FR-04–08, FR-13–17, FR-20–28, SEC-02, SEC-03, SEC-06, SEC-07, AI-01, AI-05, DASH-01–04, NFR-07, NFR-08

## Outcome

The production frontend now follows the complete RiskSense AI Figma role structure and visual system across Authentication, Requestor, Administrator, System Administrator and Audit. The pass also completes the actionable Figma comment behavior, including analytics view selection and row-level month/classification drill-down, while keeping live API data, role gates, maker/checker workflows, deterministic scoring and the human-decision invariant authoritative.

## Files changed — what, where and why

| Area | Files | What and why |
|---|---|---|
| Shared shell and responsive chrome | `components/shell/AppShell.tsx`, `components/shell/LanguageSwitcher.tsx`, `app/api/locale/route.ts`, `app/globals.css`, `i18n/request.ts` | Added the Figma-style navy header/sidebar, role-aware navigation, compact mobile account menu, translated account controls, persistent locale selection, accessible drawer focus management and mobile sign-out. |
| Authentication | `app/(public)/login/page.tsx`, `lib/session.ts` | Rebuilt the split login composition, retained real Firebase/SSO/OTP and development-only bypass behavior, constrained post-login destinations by role and made every status notice retranslate after locale changes. |
| Requestor | `app/(requestor)/chat/page.tsx`, `app/(requestor)/review/page.tsx`, `components/chat/ChatSession.tsx`, `components/ai-elements/suggestion.tsx` | Added numbered intake hierarchy, compact evidence filters, an assistant-grade conversation surface, internal transcript scrolling and a visible short-viewport composer without moving scoring into AI. |
| Administrator content | `app/(admin)/admin/page.tsx`, `personas/page.tsx`, `scenarios/page.tsx`, `questions/page.tsx`, `rules/page.tsx`, `scoring/page.tsx`, `datasets/page.tsx`, `components/admin/*` | Matched the complete configuration navigation and Figma data hierarchy; preserved structured editors, lifecycle actions, validation, provenance, approval and activation behavior. |
| Analytics and reports | `app/(admin)/admin/analytics/page.tsx`, `app/(admin)/admin/reports/page.tsx`, `components/analytics/Charts.tsx`, `components/analytics/ReportsWorkspace.tsx` | Added live KPI presentation, Chart/Pie/Table self-selection, selectable monthly classifications, tenant-scoped row drill-down and four lazy report summaries with independent error/retry states. |
| System Administration | `app/(system)/system/users/page.tsx`, `tenant/page.tsx`, `retention/page.tsx`, `dr/page.tsx` | Presented one-account/one-role, paid MFA/SSO, supported session controls, explicit lifecycle semantics and FREE-fixed/PAID-configurable recovery targets without fabricating IdP or provider telemetry. |
| Audit | `app/(audit)/audit/logs/page.tsx`, `components/ui/table.tsx` | Implemented the Figma five-column hierarchy, log-size approximation, progressive evidence detail, labelled scroll containment and an honest split between loaded-page text filtering and exact-ID server filtering. |
| Localization | `messages/en.json`, `messages/bn.json` | Added matching copy for every new role surface and control; both catalogs contain 1,357 keys with matching ICU variables. |
| Regression coverage | `e2e/content-manager.spec.ts`, `e2e/frontend-correctness.spec.ts`, `e2e/roles.spec.ts`, `e2e/system-admin.spec.ts` | Covers lifecycle controls, analytics modes/drill-down, role navigation, system policy edits, mobile focus containment, short-height chat, Audit filter scope and locale-reactive login notices. |

## Design and data decisions

- Figma controls the visual hierarchy and requested fields; existing requirements and APIs control incomplete or unsafe states.
- Live counts and records replace prototype numbers. Empty or unsupported values are identified instead of invented.
- The colored monthly analytics values use the existing tenant-scoped assessment-list contract; no broader analytics endpoint or authorization path was added.
- The Audit text filter is explicitly page-scoped because the backend does not support actor/action free-text search. Exact 24-character entity IDs continue to use the server query.
- The mobile account control uses initials at narrow widths so the header stays within 390px while the full identity remains in its menu.

## Alternatives rejected

- Pixel-copying fake counts, named audit actors, SSO metadata, local-login state or historical DR exercises.
- Adding scoring or closure logic to the AI conversation layer.
- Resolving external Figma or DOCX comments from code changes without owner approval.
- Claiming a current-page Audit filter searches the complete ledger.
- Removing governed activation/review controls to match static prototype buttons.

## Verification

Run from `risk-sense-ai/`:

```bash
git diff --check
npm run typecheck
npm run lint
npm run build
npm run e2e:frontend
```

Expected: clean diff check; typecheck/lint/build pass; 29 generated routes; 51/51 browser cases pass. The final responsive browser pass covers 1920×1080 desktop and 390×844 mobile, and `docs/design/design-qa.md` records the result.
