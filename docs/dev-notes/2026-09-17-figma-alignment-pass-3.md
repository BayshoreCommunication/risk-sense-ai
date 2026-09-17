# 2026-09-17 — Figma alignment, pass 3: scoring, analytics and reports

The owner reported that `/admin/scoring` did not resemble its frame and that
several screens carry far more than the design does. This pass rebuilds the
screens where the difference was structural rather than cosmetic.

## Scoring matrix — rebuilt

Frame: `docs/design/figma-frames/15-admin-scoring-matrix.png`.

The screen showed a generic content table plus a scoring simulator. The frame
shows a weighted-factor editor. `components/admin/ScoringMatrixEditor.tsx` now
renders it: the matrix name and the "Overall risk score is calculated 0–100 from
these weighted factors." line, a `Factor / Weight (%) / Impact on score` header,
one row per factor with a coloured icon tile, a slider and its percentage, a
running `Total weight: N%` that must reach 100, the four classification
threshold cards, `Save configuration`, and the frame's closing line.

Two deliberate differences:

- The model has six factors; the frame shows five. `duration` is part of
  `FACTOR_KEYS` and of the backend weighted sum, so it is rendered too —
  dropping it would misrepresent how a score is computed.
- Creating a matrix, editing fact→factor mappings, confidence gates (FR-20) and
  the approval lifecycle (AI-05) have no frame. `ContentManager` keeps them,
  below the editor, through a new `hideHeader` prop that renders a compact
  section heading instead of a second page header.

The scoring simulator was removed; no frame shows it. `POST /scoring/simulate`
and `simulateScore()` are untouched, so restoring it is a one-component change.

Saving still goes through `PATCH /scoring-matrices/{id}`, which versions
copy-on-write. A saved matrix does not score anything until it is independently
approved and activated.

## Analytics — reduced to the frame

Frame: `docs/design/figma-frames/17-admin-analytics-dashboard.png`, which shows
headline metrics and one monthly classification chart.

The screen also carried a four-select filter card, the four FR-26 report views
with their FR-28 exports, and the FR-27 trend breakdown — roughly three times
the frame. Analytics now renders only the four headline metrics and the monthly
classification distribution, including the selectable per-classification counts
that answer client comment 49. Its metric window is the trailing twelve months.

## Standard reports — now the reporting workspace

Frame: `docs/design/figma-frames/18-admin-standard-reports.png`, which shows the
four reports each with CSV and PDF.

The page previously listed the reports with CSV/PDF **badges** and an "Open"
link into `/admin/analytics`. The badges are now working export buttons, and
everything moved off analytics lives here in
`components/analytics/ReportsWorkspace.tsx`: the filters, the four report panels
with their chart / pie / table choice (client comment 50) and per-report
exports, and the FR-27 trend breakdown. Nothing was deleted — it moved to the
screen the design names "Standard reports".

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**.
- Rendered `/admin/scoring` and `/admin/analytics` at 1920 wide against mocked
  APIs and compared them to frames 15 and 17.

Three assertions moved rather than weakened:

- `frontend-correctness.spec.ts` checked for four "Open report" buttons; it now
  checks that the report list exposes four CSV and four PDF export buttons.
- The same spec's report-panel and trend assertions now run after navigating to
  `/admin/reports`, because that is where those views live.

## Not yet checked against their frames

`/admin/rules`, `/admin/questions`, `/admin/datasets`, `/admin/personas`,
`/admin/scenarios`, `/system/users`, `/system/dr`, `/chat`, `/review`,
`/audit/logs` and `/login`. Passes 1 and 2 aligned their headers and copy, but
their body layouts have not been compared to the frames in the way scoring and
analytics now have.
