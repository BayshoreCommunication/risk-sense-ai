# RiskSense AI redesign — design QA

Date: 2026-09-15

Scope: login plus Requestor, Administrator, System Administrator and Audit workspaces

Reference: owner-supplied RiskSense AI Figma file, with requirements governing incomplete frames

## Evidence matrix

| Area | Widths / states reviewed | Evidence | Result |
|---|---|---|---|
| Authentication | 1440×1000 desktop; 390×844 mobile; credentials, recovery, SSO-disabled and development-account states | Split assurance/identity hierarchy, readable policy copy, preserved sign-in behavior and no horizontal overflow | Passed |
| Requestor start/review | 1440×1000, 1280×720 and 390×844; loading, empty, filtered, mandatory-review and detail states | Guided intake hierarchy, scenario/mandatory-review filters, days-open context, responsive cards/tables | Passed |
| AI assessment | 1280×800 and desktop; persona confirmation, structured/free-text answers, busy, result, decision and escalation states | Conversation/Message/Suggestion composition, anchored composer, 50-message internal-scroll regression, IME/Shift+Enter/duplicate-submit coverage | Passed |
| Administrator | Desktop plus constrained-table checks; overview, review, datasets, scoring, content lifecycle and analytics chart/table modes | Operational hierarchy, structured editors, responsive horizontal scrolling, semantic chart labels and accessible table alternatives | Passed |
| System Administrator | Desktop and constrained layouts; overview, users, departments, tenant, retention, DR, conformance and audit archive enabled/disabled states | Role-aware MFA/SSO copy, confirmation states, bounded immutable export, manifest history and error recovery | Passed |
| Audit | Desktop and 390×844; overview, assessments, reconstruction, log filters/details and hash verification | Read-only evidence hierarchy, event-size column, tamper-evident language and horizontally contained data tables | Passed |
| Localization | English and Bengali shell/page content | 1,114/1,114 catalog keys and ICU variables match; interactive language switch verified | Passed |
| Accessibility | Keyboard navigation, visible focus, drawer dialog semantics, focus trap/return, contrast, reduced motion, chart controls and table reflow | Automated focus tests plus independent diff/a11y review found no remaining P1/P2 issue | Passed |

## Issues found and corrected

- Restored Geist at the document root after a self-referencing font token rendered a serif fallback.
- Restored translated `English` / `বাংলা` language controls and their pressed state.
- Added dialog semantics, background inertness, focus entry/trap/return and Escape handling to the mobile drawer.
- Restored high-contrast input/select/textarea focus perimeters and placeholder text.
- Exposed interactive SVG chart controls to assistive technology, fixed bar hit areas and stopped fading enabled label text.
- Added horizontal containment to dense scoring and audit tables.
- Kept escalations amber and explicitly open instead of presenting them as completed green decisions.
- Aligned MFA status/copy with actual role and tenant policy instead of overstating every PAID account.
- Added `try`/`finally` recovery and invalid-range handling to audit archive operations.
- Bounded the transcript to an internal scroller so long histories do not push the composer below the viewport.
- Removed eager Mermaid, math, code-highlighting and CJK renderer plugins; plain-chat production transfer fell from 775 KB to 442 KB.

## Acceptance boundary

This QA is repository evidence, not human or owner acceptance. Qualified Bengali review, screen-reader/user sessions, representative UAT, deployed performance evidence, owner visual acceptance and final Figma comment dispositions remain external. Core Streamdown's measured residual overhead is tracked as the non-blocking ISS-028 optimization follow-up.

Result: passed
