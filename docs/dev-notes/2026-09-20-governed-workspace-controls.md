# Governed workspace controls

Date: 2026-09-20

Requirements: AI-03, FR-20, FR-21, FR-22, FR-26, FR-27, FR-28, SEC-05, SEC-07, NFR-04, NFR-08, DASH-01, DASH-03

## Summary

This pass closes the remaining repository-side workspace-control and configurability gaps found in
the final Figma/requirements audit. It does not claim client visual acceptance, resolution of the
source Figma comment threads, or human language/accessibility/usability acceptance.

## What changed, where, and why

| Area | Files | What and why |
|---|---|---|
| Analytics access | `app/(admin)/admin/analytics/page.tsx`, `components/analytics/ReportsWorkspace.tsx` | The page checks the authenticated workspace feature before fetching report data. This keeps direct-route behavior aligned with navigation and prevents a disabled report capability from leaking requests or implying access. |
| Audit disclosure | `app/(audit)/audit/logs/page.tsx`, `app/(audit)/audit/assessments/page.tsx`, `app/(system)/system/audit/page.tsx` | Unmasking requires explicit confirmation, explains the audited disclosure boundary, returns to masked state after record/context changes, and rejects stale unmasked responses that arrive after a newer masked request. |
| Scoped review | `app/(requestor)/review/page.tsx`, `app/(admin)/admin/review/page.tsx` | Named escalatees retain the relevant requestor and department context even without broad review-dashboard access. The administrator queue uses the shared page shell so hierarchy and responsive behavior match the rest of the workspace. |
| Accessible data regions | `components/ui/table.tsx` and role-page table callers | A table wrapper enters the tab order only when it has an accessible name, and every intentionally focusable table region now supplies one. This preserves horizontal keyboard access without creating anonymous focus stops. |
| Tenant sector vocabulary | `components/shell/workspace-context.tsx`, administrator persona/question/rule pages, and `app/(system)/system/tenant/page.tsx` | Content controls derive sector options from the authenticated tenant contract. System administrators can manage that vocabulary; the fixed starter list is no longer presented as the only application vocabulary. |
| Localized control copy | `messages/en.json`, `messages/bn.json` | Matching English and Bangla copy covers confirmation, disclosure, feature, sector and accessible-region states with equivalent ICU variables. |
| Contract and regression coverage | `lib/api/types.ts`, `e2e/content-manager.spec.ts`, `e2e/frontend-correctness.spec.ts`, `e2e/system-admin.spec.ts` | Generated types carry tenant sectors, and browser tests cover tenant-only sector choices, direct analytics gating, named escalatee scope, confirmed unmask/reset, stale-response containment and tenant settings. |

## Alternatives rejected

- A frontend-only global sector constant was rejected because it would require a deployment for each
  approved vocabulary change and could diverge from backend validation.
- Automatic unmasking was rejected because sensitive evidence disclosure must remain an explicit,
  auditable operator action.
- Keeping an unmasked payload visible while switching records was rejected because it can expose
  evidence under the wrong context and makes late-response races unsafe.
- Making every table wrapper keyboard-focusable was rejected because unnamed focus stops provide no
  useful navigation context to assistive-technology users.
- Treating named escalation as broad review permission was rejected because it would expand access
  beyond the assigned assessment.

## Verification

- `npm run e2e:frontend -- --list` lists exactly 56 cases across four configured files, including
  the sector, analytics-gate, named-escalatee, confirmed-unmask and stale-response cases.
- `npm run e2e:frontend` passes 56/56 mocked browser cases.
- `npm run build` passes and generates 29/29 application routes.
- `npm run typecheck` and `npm run lint` pass.
- `messages/en.json` and `messages/bn.json` each contain 1,376 leaf messages with zero missing keys
  and zero ICU-variable mismatches.
- `git diff --check` passes.

These checks prove repository behavior at the deterministic mocked-API boundary. Production-like
identity/provider validation, full-stack UAT, client vocabulary approval, Bengali review,
accessibility/usability sessions and owner Figma acceptance remain external release gates.
