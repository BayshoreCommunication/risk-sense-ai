# 2026-09-17 — Figma alignment, pass 2: shared page header, chips and card icons

Closes the gaps listed at the end of
`2026-09-17-figma-alignment-pass-1.md`. Reference frames:
`docs/design/figma-frames/` at the workspace root.

## Shared page header

Every frame puts the same chrome at the top right of the page: a solid dark
role pill followed by that screen's requirement IDs as light chips. Two pages
did this by hand, the rest showed a plan badge or hid the requirement badge
inside a card.

- `components/shell/workspace-context.tsx` (new) carries the backend-verified
  role and plan from `AppShell` to whatever a page renders.
- `components/shell/PageHeader.tsx` (new) renders title, optional one-line
  description, the role pill, the requirement chips, and page actions.
- `.role-pill` and `.req-chip` in `app/globals.css` carry the frame styling.

Twenty-two screens now use it, including `components/admin/ContentManager.tsx`,
which covers personas, scenarios, questions, rules and scoring through a new
`requirements` prop.

### Requirement IDs per screen

Taken from `docs/ai/BusinessRules.md`, not from the prototype — the two agree
wherever both name an ID.

| Screen | Chips |
|---|---|
| `/admin` | DASH-02 |
| `/admin/personas` | FR-09, FR-10 |
| `/admin/scenarios` | FR-11, FR-12 |
| `/admin/questions` | FR-15 |
| `/admin/rules` | FR-16, FR-17 |
| `/admin/scoring` | FR-18, FR-19 |
| `/admin/datasets` | FR-13, FR-14 |
| `/admin/analytics` | DASH-03, FR-27 |
| `/admin/reports` | FR-26, FR-28 |
| `/admin/review` | AI-03, FR-20 |
| `/system` | DASH-04 |
| `/system/users` | FR-02, FR-10 |
| `/system/tenant` | FR-03, SEC-02 |
| `/system/retention` | SEC-06 |
| `/system/dr` | NFR-06 |
| `/system/departments` | FR-10 |
| `/system/conformance` | FR-30, AI-01 |
| `/system/audit` | FR-26, SEC-07 |
| `/audit` | FR-24, FR-26 |
| `/audit/logs` | FR-24–26, SEC-07 |
| `/audit/assessments` | FR-26 |
| `/chat` | FR-04, FR-14 |
| `/review` | DASH-01, DASH-04 |

Duplicates were removed: `/admin` and `/admin/reports` no longer repeat the
badges the header now owns, `/audit/logs` drops its inline FR-24–26 and SEC-07
badges, and `/system/retention` drops the SEC-06 badge from its card.

## Card icon tiles

Frames lead a card title with a tinted rounded icon tile. Added `.card-icon`
and applied it on `/system/tenant` (plan, SSO, session policy), `/system/users`
(access policy), `/system/retention` (policy table, run history) and
`/system/dr` (current state, evidence form). `/admin/analytics` and
`/admin/datasets` had icons beside the page title; the frames show a plain
title there, so those were removed instead.

## Copy

Ten more multi-sentence strings reduced to one sentence each in both locales,
keeping the requirement and client-comment obligations: the plan-authoritative
MFA wording (comments 46/51), the non-active lockout authoring example
(comment 48), the retention lifecycle sentence, the conformance and audit
archive descriptions, and the analytics and audit-assessment helper lines.

English strings over 120 characters: **30 before pass 1 → 22 after pass 1 →
11 now**. Over 80 characters: 99 → 84.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**.
- Rendered `/admin/personas`, `/system/retention` and `/system/tenant` at
  1920×1080 against mocked APIs and compared them to frames 11, 22 and 21.

One assertion changed: `frontend-correctness.spec.ts` checked that the shell's
top bar goes inert behind the mobile drawer using `page.locator('header')`.
Pages now render their own `<header>`, so that locator matched more than one
element. It is scoped to `.first()`, with a comment saying why — the shell bar
is the first `<header>` in the document and page headers render later, inside
`<main>`. `getByRole('banner')` does not work here: the shell bar sits inside
the `aria-hidden` wrapper the drawer applies, which is exactly what the test
asserts.

## Still deliberately different from the frames

- The retention frame is an editable form; ours is a read-only lifecycle table
  because configuration lives on `/system/tenant`.
- The audit frame shows four columns; ours shows five, because client comment
  55 asked for a log-size column.
- Several routes have no frame at all (`/system/departments`,
  `/system/conformance`, `/system/audit`, `/admin/review`, `/audit`,
  `/audit/assessments`). They follow the same header pattern.
