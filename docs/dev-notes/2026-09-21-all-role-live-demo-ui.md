# 2026-09-21 — All-role live demo selector

Requirements: FR-01, FR-02, SEC-02, SEC-03, DASH-04, NFR-08.

## Outcome

The login page can expose four explicit shared read-only demo choices for the synthetic TAC tenant:
Requestor, Administrator, System Administrator, and Audit. The selector is present only when
`NEXT_PUBLIC_DEMO_ACCESS_ENABLED=true`. Each choice asks the dedicated public-demo endpoint for a
short-lived session, validates the backend-returned role, TAC tenant and read-only access mode, and
opens that role's normal home route. No shared Firebase credential exists in the browser, and the
production demo path sends neither an authorization bearer nor `X-Dev-User`.

The authenticated shell uses the backend-owned `accessMode=public_demo_read_only` value from `GET /me`
to show a persistent, minimal read-only demo banner. A normal session shows no banner. The backend is
still responsible for enforcing read-only behavior; the banner is an explanation, not an authorization
control.

## Files changed — what, where, and why

| File | What and where | Why |
|---|---|---|
| `lib/public-demo.ts` | Defines the four fixed identities and the explicit fail-closed build gate. | Keeps public demo identity/configuration separate from development bypass accounts. |
| `app/(public)/login/page.tsx` | Replaces the single FREE demo CTA with four accessible role cards, server-session exchange, returned-role/TAC-tenant validation, and unexpected-session termination. | Restores role-by-role live evaluation without exposing a credential or using development headers. |
| `components/shell/AppShell.tsx` | Reads the trusted `/me` access mode, reserves layout space for a persistent read-only banner, and limits sidebar-padding animation to desktop widths. | Keeps the notice accurate across navigation and reloads without relying on a spoofable client flag, while preventing stale desktop padding from squeezing the chat after a mobile breakpoint change. |
| `messages/en.json`, `messages/bn.json` | Adds matching selector, mismatch, and banner messages. | Preserves catalogue key/variable parity while the launch locale remains English. |
| `.env.example` | Documents the explicit enable flag and server-issued session boundary. | Makes omission fail closed and prevents any browser-visible shared credential. |
| `playwright.frontend.config.ts`, `e2e/auth-recovery.spec.ts` | Enables the selector only in the isolated mock build and covers configuration gating, all four identities, credential-free session exchange, role homes, banner persistence, and mismatch cleanup. | Protects the live demo contract without introducing production authentication shortcuts. |
| `e2e/frontend-correctness.spec.ts` | Waits for the review page's asynchronous scenario-filter request before asserting its normalized key. | Removes a release-suite timing race while retaining the same behavioral assertion. |

## Fixed identities

- Requestor: `requestor@tac.local`
- Administrator: `admin@dev.local`
- System Administrator: `sysadmin@dev.local`
- Audit: `audit@dev.local`

These labels identify four exact server-side Mongo demo records. The UI does not create, repair, or
change identities, and public demo access does not depend on an enabled Firebase password account.

## Alternatives rejected

- Reusing `requestor@dev.local`: it belongs to the FREE public tenant and does not expose the rich TAC
  showcase shared by the four role workspaces.
- Sending `X-Dev-User`: that remains an explicitly non-production development bypass.
- Trusting the selected card for routing or the banner: the backend-returned role and `/me` access mode
  remain authoritative.
- Storing a demo marker in a cookie: a client-controlled value cannot prove server-enforced read-only
  access.
- Rendering a disabled selector when configuration is incomplete: keeping it absent is the clearer
  fail-closed deployment behavior.

## Verification

From `risk-sense-ai/`:

```bash
npm run typecheck
npx eslint 'app/(public)/login/page.tsx' components/shell/AppShell.tsx lib/public-demo.ts e2e/auth-recovery.spec.ts playwright.frontend.config.ts
npm run e2e:frontend -- e2e/auth-recovery.spec.ts --grep 'public demo|shared .* demo' --trace=off
npm run e2e:frontend -- e2e/frontend-correctness.spec.ts --grep 'long chat transcript' --trace=off
```

The focused demo run covers eight cases: configuration gating, four successful role journeys,
unexpected-role cleanup, unexpected-tenant cleanup, and writable-access-mode cleanup. Production use additionally requires the
backend flag and exact tenant pin, server-enforced route restrictions, the four flagged Mongo
identities, the frontend build flag, and live role-by-role UAT.
