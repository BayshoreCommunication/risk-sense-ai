# RiskSense AI frontend

Next.js 16.3.5 App Router and React 19.3 frontend for RiskSense AI (Node.js 20.9+). It contains role-scoped workspaces for requestors,
content administrators, system administrators, and auditors. Request and response types are generated
from the backend OpenAPI document.

The TAC requirements source is Draft v1 and is not signed acceptance. The owner authorized the linked
Figma as a content/layout reference on 2026-09-15, without requiring a pixel-identical copy, and
authorized requirement-led extensions where the file is incomplete. The repository implements that
direction but does not claim owner visual-design sign-off or final Figma comment resolution.

## Local setup

```bash
cp .env.example .env.local
npm ci
npm run gen:api
npm run dev
```

Open `http://localhost:3000`. For a local development login, run the seeded backend with
`AUTH_DEV_BYPASS=true`. Production builds fail closed: the development identity chooser is not
enabled unless `NEXT_PUBLIC_ENV=development`.

The signup flow sends Firebase email verification and signs the user out before any application
session exchange. Real authorized domains, verification-email template/delivery, and the subsequent
tenant/role OTP policy are production configuration and UAT gates.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm run e2e:frontend
```

`e2e:frontend` starts a production build and uses same-origin mocked API responses for deterministic
UI, auth-restoration, structured-editor, system-administration, error, and confirmation checks.
`npm run e2e` is the separate full-stack Playwright suite and requires a running backend and
frontend.

The current 2026-09-20 repository validation passes 56/56 mocked browser cases, exact
1,376/1,376 EN/BN key and ICU-variable parity, lint, typecheck, a 29/29-route production build,
and a zero-vulnerability production dependency audit. Human language, accessibility, usability and
owner visual acceptance remain external gates.

## Implemented workspaces

- Requestor: guided intake, persona confirmation, typed answers, resume, result, decision, and review.
- Administrator: review queue, copy-on-write personas/scenarios/rules/matrices, audited questions,
  structured editors, reviewed dataset bundles, simulation, reports, and analytics.
- System administrator: tenant/session/retention settings, users, department-persona mapping, disaster
  recovery evidence, stored-record conformance, and bounded immutable audit export/manifests.
- Audit: assessment reconstruction, masked/unmasked access, and audit-chain verification.

English and Bangla message catalogs cover the current application UI. The authenticated tenant's
sector vocabulary now drives administrator content controls, while the starter sector list remains
only a default. This completes the repository-side NFR-08 configurability work; client approval of
the production vocabulary and human Bengali/accessibility/usability acceptance remain external.

## Release boundary

A passing frontend build is repository evidence only. Real identity-provider and email flows, deployed
security/TLS checks, accessibility/usability sessions, full UAT, monitoring, production data, and
Figma/design acceptance remain external gates. See `../docs/ai/RequirementsCoverage.md` and
`../tasks/sprint-release-readiness.md`.
