# RiskSense AI frontend

Next.js 16.3.5 App Router and React 19.3 frontend for RiskSense AI (Node.js 20.9+). It contains role-scoped workspaces for requestors,
content administrators, system administrators, and auditors. Request and response types are generated
from the backend OpenAPI document.

The TAC requirements source is Draft v1 and is not signed acceptance. Figma implementation is
intentionally deferred until the owner supplies the forthcoming design prompt; this repository does
not claim visual-design sign-off.

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

## Implemented workspaces

- Requestor: guided intake, persona confirmation, typed answers, resume, result, decision, and review.
- Administrator: review queue, copy-on-write personas/scenarios/rules/matrices, audited questions,
  structured editors, reviewed dataset bundles, simulation, reports, and analytics.
- System administrator: tenant/session/retention settings, users, department-persona mapping, disaster
  recovery evidence, and stored-record conformance.
- Audit: assessment reconstruction, masked/unmasked access, and audit-chain verification.

English and Bangla message catalogs cover the current application UI. NFR-08 remains partially open
at product level because supported sectors and sector vocabulary are still enumerated in code.

## Release boundary

A passing frontend build is repository evidence only. Real identity-provider and email flows, deployed
security/TLS checks, accessibility/usability sessions, full UAT, monitoring, production data, and
Figma/design acceptance remain external gates. See `../docs/ai/RequirementsCoverage.md` and
`../tasks/sprint-release-readiness.md`.
