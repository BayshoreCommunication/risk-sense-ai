# 2026-09-21 — Interactive demo sandbox UI

Requirements: FR-01, FR-02, SEC-02, SEC-03, DASH-04, NFR-08.

## Outcome

The four public demo identities are presented as short-lived, role-scoped interactive sandboxes.
Each card opens the exact Requestor, Administrator, System Administrator, or Audit workspace returned
by the backend. The client still fails closed when the returned role, TAC tenant, or
`public_demo_sandbox` access mode does not match the selected identity.

During the production alias cutover, the login response parser also accepts the former
`public_demo_read_only` wire value from the dedicated public-demo endpoint. This compatibility is
limited to the two public-demo modes; `standard` and any unknown value are still rejected and the
unexpected session is terminated. The generated API contract remains canonical on
`public_demo_sandbox`.

The persistent orange read-only banner was removed together with the extra shell offset it reserved.
Demo workspaces now use the same full-height shell geometry as standard workspaces. Authorization remains
server-owned: an interactive demo exposes only the pages and operations permitted to its returned role.
The login selector carries a concise safety note to use sample data only because the four identities share
the sandbox and its records may be reset; this note does not consume workspace viewport space.

## Files changed — what, where, and why

| File | What and where | Why |
|---|---|---|
| `app/(public)/login/page.tsx` | Requires the sandbox access mode and labels each role choice as an interactive sandbox. | Keeps the client aligned with the interactive server contract while retaining exact identity validation. |
| `components/shell/AppShell.tsx` | Removes the read-only notice and all banner-specific layout branches. | Eliminates the unnecessary notice and restores the full workspace viewport. |
| `lib/public-demo.ts` | Describes the four identities as role-scoped sandbox identities. | Keeps source-level documentation accurate. |
| `lib/api/types.ts` | Updates the generated access-mode contract to `public_demo_sandbox`. | Ensures typed `/auth/public-demo/session` and `/me` responses match the backend schema. |
| `messages/en.json`, `messages/bn.json` | Replaces read-only wording with interactive sandbox wording, adds login-only sample-data guidance, and removes the unused banner message. | Keeps locale catalogues in parity without misleading users about available actions or shared-data handling. |
| `.env.example` | Documents the interactive role-scoped session boundary. | Makes the deployment flag's effect explicit without exposing a shared credential. |
| `e2e/auth-recovery.spec.ts` | Covers all four sandbox cards, role destinations, banner absence, legacy-mode cutover compatibility, and fail-closed mode validation. | Prevents the former read-only presentation or banner from returning without creating an alias-cutover outage. |

## Design boundary

- Role and tenant routing continue to trust only the backend response, never the selected card.
- A public demo session must return the canonical `public_demo_sandbox` mode. The legacy
  `public_demo_read_only` mode is temporarily accepted during the alias cutover; an ordinary `standard`
  session is rejected and terminated when returned from the demo endpoint.
- The UI does not elevate permissions. Requestor, Administrator, System Administrator, and Audit actions
  remain constrained by their existing backend role policies.
- No Firebase password, development header, or shared browser credential is introduced.

## Verification

From `risk-sense-ai/`:

```bash
npm run typecheck
npx eslint 'app/(public)/login/page.tsx' components/shell/AppShell.tsx lib/public-demo.ts e2e/auth-recovery.spec.ts
npm run e2e:frontend -- e2e/auth-recovery.spec.ts --grep 'public demo|shared .* demo' --trace=off
```
