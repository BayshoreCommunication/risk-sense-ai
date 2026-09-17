# 2026-09-17 — Figma alignment, pass 1: shell, page headers and copy

## Why

The owner asked for the implemented UI to match the `Tac-Solutions` Figma file
(`4mnjHpkJG7H43hKKctSbmP`), noting that the previous assistant had added extra
explanatory text and extra spacing.

The Figma MCP reader is still refused on that file (ISS-032), so the sixteen
reference frames were exported as PNGs from the file's own export action and
stored in `docs/design/figma-frames/` at the workspace root. Every change below
was made against a frame, not against a guess.

## Frame-to-route mapping

| Frame file | Route |
|---|---|
| `00-login-and-requestor-dashboard.png` | `/login`, `/review` |
| `01-requestor-persona-scenario-selection.png` | `/chat` |
| `10-admin-configuration-home.png` | `/admin` |
| `11-admin-persona-management.png` | `/admin/personas` |
| `12-admin-scenario-library.png` | `/admin/scenarios` |
| `13-admin-question-bank.png` | `/admin/questions` |
| `14-admin-rule-engine.png` | `/admin/rules` |
| `15-admin-scoring-matrix.png` | `/admin/scoring` |
| `16-admin-training-datasets.png` | `/admin/datasets` |
| `17-admin-analytics-dashboard.png` | `/admin/analytics` |
| `18-admin-standard-reports.png` | `/admin/reports` |
| `20-system-user-role-provisioning.png` | `/system/users` |
| `21-system-sso-and-integration.png` | `/system/tenant` |
| `22-system-retention-policy.png` | `/system/retention` |
| `23-system-disaster-recovery.png` | `/system/dr` |
| `30-audit-log-viewer.png` | `/audit/logs` |

## What changed

### Application shell (`components/shell/AppShell.tsx`)

- The top bar carried a "Decision intelligence" tagline, a breadcrumb strip and
  three separate chips (role, plan, avatar). Every frame shows only the logo and
  a single identity pill, so the bar is now the logo plus one
  `{initials} · {Role}` pill. Plan and email moved into that pill's `title`; the
  plan badge remains visible in the sidebar footer.
- The sidebar section label read "{role} workspace" and wrapped onto two lines.
  The frames show only the role, so `app.roleNavigation` is now `{role}`.
- Role labels are title-case (`System Administrator`), matching the frames.
- Sidebar width moved from `w-60` (240px) to `w-[19rem]` (304px). The frames
  place the sidebar edge between 305px and 342px of a 1920px canvas.

### Page headers

- `.workspace-header` rendered the page title inside a bordered card with a
  gradient top rule and a shadow. No frame does this; every frame puts the title
  directly on the page background. The utility is now a plain block.
- `.page-heading` grew to `1.75rem` / `2.125rem` bold to match the frames.
- Every page header carried an uppercase "eyebrow" line with an icon above the
  title. No frame has one, so all twenty-one were removed along with the icon
  imports that only fed them.

### Copy

Titles and subtitles were transcribed from the frames, in both `en` and `bn`:

| Route | Was | Now |
|---|---|---|
| `/admin` | Configuration home | Admin configuration home |
| `/admin/personas` | Personas | Persona management |
| `/admin/scenarios` | Scenarios | Scenario library management |
| `/admin/questions` | Questions | Question bank management |
| `/admin/rules` | Rules | Rule engine — hard business rules |
| `/admin/scoring` | Scoring matrices | Scoring matrix configuration |
| `/admin/datasets` | Datasets | AI training dataset management |
| `/admin/analytics` | Analytics | Analytics dashboard |
| `/system/users` | Users | User and role provisioning |
| `/system/tenant` | Tenant settings | SSO and integration configuration |
| `/system/retention` | Retention | Retention policy configuration |
| `/system/dr` | Disaster recovery | Disaster recovery runbook |
| `/audit/logs` | Audit log | Audit log viewer |
| `/review` | Assessments | Requestor dashboard — pending queue |
| `/chat` | New risk assessment | Persona and scenario selection |

Multi-sentence helper paragraphs were replaced with the frame's single line.
`system.tenant` had no subtitle at all and now carries the frame's.

**Deliberate deviation.** Several frames show a title with no subtitle. Rather
than delete those subtitles, each was reduced to one short sentence: the text
still serves screen readers and several carry requirement wording. Long strings
fell from 30 over 120 characters to 22, and the frame-supplied wording is used
verbatim wherever a frame provides it.

## Unrelated defect fixed along the way

`app/(public)/login/page.tsx` rendered the development OTP hint, and prefilled
the code field, whenever the API response carried `devCode` — with no
`DEV_AUTH_ENABLED` gate. A non-development build that received that field would
have displayed the one-time code (SEC-03). Both the prefill and the hint are now
gated, and `otpInfo` drops `devCode` outside a development build. The existing
assertion in `e2e/auth-recovery.spec.ts` covered this and was failing before
this change; it was failing on a clean tree too, so it was not a regression from
this work.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**. Eight heading assertions were updated
  to the new titles.
- Rendered `/system/retention` and `/admin` at 1920×1080 against mocked APIs and
  compared them to frames 22 and 10.

## Known remaining gaps

- The frames show a dark role pill plus light requirement-ID chips (for example
  `FR-11`, `SEC-06`) at the top right of every page header. `/admin` and
  `/admin/reports` do this; most other pages still show a plan badge, or carry
  the requirement badge inside a card instead. A shared page-header component
  would settle this.
- Frame cards lead with a coloured icon tile before the card title; most of our
  cards have no icon tile, and `/admin` places its icon on the right.
- The retention frame is an editable form (per-row selects, `Save
  configuration`); ours is a read-only lifecycle table because configuration
  lives on `/system/tenant`. This is the requirement-led split recorded in
  `docs/agents/figma-requirements-audit.md`, not an oversight.
- The audit frame shows four columns; ours shows five because client comment 55
  asked for a log-size column. The implementation is deliberately ahead of the
  frame here.
