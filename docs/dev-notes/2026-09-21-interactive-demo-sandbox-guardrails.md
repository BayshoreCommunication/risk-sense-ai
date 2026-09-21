# 2026-09-21 — Interactive demo sandbox guardrails

Requirements: FR-02, FR-03, SEC-02, SEC-03, SEC-05, SEC-07.

## Outcome

The authenticated shell now passes the backend-verified session access mode from `GET /me` through
the existing workspace context. Pages use that trusted value to explain and prevent operations that
must remain inert in the shared interactive sandbox without changing normal-session behavior.

- System Administrator demo sessions can provision users only with addresses ending
  `@demo.invalid`. The dialog explains the reserved namespace and validates it before any request.
- Demo SSO configuration accepts only syntactically valid domains ending `.invalid`. Invalid real
  domains show inline guidance and keep Save disabled, so the user does not discover the rule through
  a backend 403.
- Audit payloads, stored assessment details, and reconstructed assessment details remain masked in
  demo sessions. Their explicit unmask actions are absent, and request helpers receive `unmask=false`.
- Audit archive manifests remain visible, but the clear-text archive download form is replaced by a
  concise shared-sandbox privacy explanation and no archive POST is available.

The login selector describes role-permitted workflows rather than promising every operation. It
explicitly notes that identity and sensitive-export controls remain protected.

The backend remains authoritative for all three policies; these UI controls make the server-enforced
boundary understandable and avoid needless rejected requests.

## Files changed — what, where, and why

| File | Change | Why |
|---|---|---|
| `components/shell/AppShell.tsx`, `components/shell/workspace-context.tsx` | Propagate the verified access mode to role pages. | Pages consume one trusted `/me` result instead of issuing duplicate identity requests or trusting a browser flag. |
| `lib/public-demo.ts` | Centralizes demo-mode detection and reserved email/domain validation. | Keeps the legacy alias cutover and sandbox namespace rules consistent. |
| `app/(system)/system/users/page.tsx` | Adds `@demo.invalid` helper text and pre-submit validation for demo-created users. | Prevents routable identities from being submitted by the shared System Administrator. |
| `app/(system)/system/tenant/page.tsx` | Adds `.invalid` SSO guidance, inline validation, and save gating in demo sessions. | Keeps shared demo SSO configuration inert. |
| `app/(audit)/audit/logs/page.tsx` | Keeps requests masked and removes the unmask control/dialog in demo sessions. | Prevents clear sensitive audit payloads from being requested by a shared identity. |
| `components/review/AssessmentDetail.tsx`, `components/review/ReconstructionView.tsx` | Keep stored and reconstructed reads masked and remove their unmask controls in demo sessions. | Applies the same disclosure boundary across every explicit unmask surface. |
| `app/(system)/system/audit/page.tsx` | Replaces the archive export form with sandbox privacy copy while preserving manifest history. | Clear-text audit downloads must not be produced through a shared demo identity. |
| `app/(public)/login/page.tsx`, `messages/en.json`, `messages/bn.json` | Presents the demo as role-permitted workflows with protected identity and sensitive-export controls. | Sets accurate expectations before entering the sandbox. |
| `messages/en.json`, `messages/bn.json` | Adds matching sandbox guidance, masked-state, and protected-export copy. | Keeps locale catalogues structurally aligned and the English launch UI explicit. |
| `e2e/system-admin.spec.ts`, `e2e/frontend-correctness.spec.ts` | Covers reserved identity/domain validation, zero rejected API calls, hidden unmask actions, and the absence of `unmask=true`. | Prevents regressions while proving normal routes still use the shared workspace context. |

## Verification

From `risk-sense-ai/`:

```bash
npm run typecheck
npx eslint app components lib e2e/system-admin.spec.ts e2e/frontend-correctness.spec.ts
npm run e2e:frontend -- e2e/system-admin.spec.ts --grep 'sandbox user|sandbox SSO' --trace=off
npm run e2e:frontend -- e2e/frontend-correctness.spec.ts --grep 'shared sandbox audit' --trace=off
npm run build
```
