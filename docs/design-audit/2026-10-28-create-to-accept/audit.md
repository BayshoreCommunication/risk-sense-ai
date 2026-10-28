# Requestor create-to-accept color and flow audit

Date: 2026-10-28

Requirements: FR-03, FR-06, FR-07, FR-08, FR-22, AI-01, NFR-07, NFR-08

## Audit scope

The authenticated Requestor journey from starting a Finance Officer assessment through guided questions, deterministic result, Accept recommendation and the final closed state. The run used a realistic $25,000 unauthorized vendor payment with missing approvals, bypassed controls and documented corrective action. Light mode was captured through the full journey and the accepted/closed state was also checked in dark mode.

## User goal and accessibility target

The Requestor should be able to complete the assessment without uncertainty about the next action, distinguish assistant/user/clarification content, understand risk severity, and recognize when the assessment has been accepted and closed. Visible text, controls and semantic colors should remain readable in both themes. Screenshot review does not establish full WCAG compliance; keyboard, DOM and automated E2E checks provide additional but still scoped evidence.

## Numbered flow steps

1. **Start assessment — healthy.** `01-start.png` shows a clear persona-first entry point and one optional incident field.
2. **Select persona and describe incident — healthy.** `02-persona-and-incident.png` shows an unmistakable selected Finance Officer card and a focused incident field.
3. **Begin guided questions — healthy.** `03-guided-question.png` keeps the current question, context and composer visible without a duplicate structured control.
4. **Answer a structured choice — healthy.** `04-structured-choice.png` provides a focused MCQ card with readable radio targets and a clear active-question hierarchy.
5. **Continue guided questions — healthy.** `05-guided-progress.png` shows consistent assistant/user colors and an optional explanation inside the active yes/no card.
6. **Review and submit — healthy.** `06-ready-to-submit.png` uses mint success/readiness color for the completed-facts state and keeps one primary Submit action.
7. **Review the result — corrected and verified.** `07-result.png` exposed an Elevated Risk result whose gauge and left rail were amber/orange while the classification badge was blue. `13-result-semantic-colors-after.png` shows the classification badge, gauge and rail aligned to the orange Elevated Risk family.
8. **Open Accept recommendation — healthy.** `08-accept-panel.png` keeps the optional note and confirmation action in the same decision region.
9. **Accepted and closed — corrected and verified.** `09-accepted-and-closed.png` exposed green accepted decision details beside a blue Closed page-status badge. `12-light-accepted-and-closed-after.png` aligns the terminal status to the completion-green family.
10. **Dark accepted and closed — corrected and verified.** `10-dark-accepted-and-closed.png` exposed the same blue status conflict. `11-dark-accepted-and-closed-after.png` preserves contrast while using a restrained dark-theme green terminal status.

## Strengths

- Persona selection, active structured questions, clarification and user answers have distinct roles.
- The mint ready-to-submit bar communicates completion without competing with the primary blue action.
- The result explanation, key drivers and next step remain grouped and readable.
- The accepted decision and Decision Details use a coherent green success/closed treatment.

## UX risks

- **Elevated Risk badge mismatch:** blue normally signals navigation, selection or a primary action in this product. Using it for Elevated Risk conflicts with the amber score ring and rail, weakening severity recognition.
- **Closed badge mismatch:** blue makes a terminal state look active or informational, while the same screen already uses green for accepted and closed.

## Accessibility risks

- The issue is semantic consistency rather than visibly insufficient contrast. Users who rely on quick color recognition receive conflicting signals for the same state.
- Screenshot review cannot confirm every focus order, screen-reader announcement or zoom behavior. The existing automated create-to-accept test and focused component tests cover the critical interactive path, but they are not a complete accessibility certification.

## Recommendations

1. Map the classification badge, score ring and left rail to one severity palette: green for Monitor Only, amber for Risk, orange for Elevated Risk and red for Issue.
2. Map the page-level Closed badge to the existing accepted/closed green family; keep blue for In progress and Awaiting decision.
3. Preserve the current colors for persona selection, structured choices, clarification, ready-to-submit and accepted decision details.

## Implementation and verification

- `components/chat/ResultCard.tsx` now uses one shared severity meaning across the classification badge, score ring and left rail.
- `components/chat/ChatSession.tsx` now renders the page-level Closed badge in the same green family as the accepted decision and Decision Details.
- `e2e/roles.spec.ts` asserts both the orange Elevated Risk badge and green Closed status during the complete Requestor journey.
- `semantic-colors-before-after.png` records the two P2 mismatches and their corrected light-mode states. The accepted/closed state was also checked in dark mode.
- Typecheck, lint, focused MCQ/yes-no tests and the full create-to-accept Requestor E2E test pass. No actionable P0, P1 or P2 color finding remains in the audited flow.
