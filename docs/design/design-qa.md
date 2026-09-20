# RiskSense AI Figma parity — design QA

Date: 2026-09-20

Scope: Authentication, Requestor, Administrator, System Administrator and Audit workspaces.

Reference: the owner-supplied `Tac Solutions` Figma file, the sixteen exported source frames in `docs/design/figma-frames/`, the twelve Figma comment threads, and the repository requirements for incomplete or unsupported prototype states.

## Result

The shared shell, role navigation, page hierarchy, controls, cards, tables, charts, responsive states and AI conversation workspace were compared with the source frames. The implementation retains live API data and governed workflows; prototype numbers, provider status, audit names/references and DR history were not fabricated.

| Surface | Desktop evidence | Mobile evidence | Result |
|---|---|---|---|
| Login | Split navy/white sign-in layout, product assurance panel and plan-aware authentication | Single-column identity flow with translated status notices | Passed |
| Requestor | Numbered persona/scenario intake, review filters/table, conversation and decision workflow | Drawer navigation, responsive intake cards, contained transcript and visible composer | Passed |
| Administrator | Live overview, content libraries, governed rules/scoring/datasets, analytics and reports | Stacked metrics/cards, contained data tables and compact account control | Passed |
| System Administrator | Users, tenant/session policy, retention and DR operational views | Responsive cards and contained controls, without document-level horizontal overflow | Passed |
| Audit | Five-column log hierarchy, filters, size, evidence disclosure and chain verification | Evidence cards preserve full hash, decision and record data | Passed |
| Analytics comment flow | Chart, Pie and Table modes plus selectable month/classification values and row drill-down | View selector and horizontally contained table remain keyboard/pointer usable | Passed |
| Localization | English catalog and interaction pass | Bengali catalog and interactive language switch, including login notices | Passed |

## Corrections made during final QA

- Replaced the over-wide mobile account pill with a compact initials control and viewport-bounded menu.
- Added the missing mobile-drawer sign-out action so the focus trap wraps through every actionable control.
- Reduced the desktop transcript viewport at short heights so a 50-message conversation keeps its composer visible.
- Made translated login notices derive from semantic notice state instead of storing translated strings.
- Clarified that free-text Audit filtering applies to the loaded 50 entries while an exact 24-character record ID is server-filtered.
- Kept dense tables inside labelled horizontal scroll regions instead of allowing document-level overflow.

## Automated evidence

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, 29/29 application routes generated.
- `npm run e2e:frontend`: passed, 51/51 mocked browser cases.
- English/Bengali catalogs: 1,357/1,357 keys, zero missing keys and zero ICU-variable mismatches.
- Desktop browser review used the default 1920×1080 viewport; responsive review used 390×844, with no document-level horizontal overflow on the sampled role pages.

## Acceptance boundary

This is repository and browser evidence, not client acceptance. All twelve Figma threads remain externally open until the file owner resolves them. Figma comment 47 is incomplete after its colon and cannot be implemented without replacement text. The six embedded Draft v1 DOCX comments also remain unresolved; their conflicts and owners are tracked in the workspace audit.

final result: passed
