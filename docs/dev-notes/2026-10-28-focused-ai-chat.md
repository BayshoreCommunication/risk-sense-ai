# Focused AI conversation pass

Date: 2026-10-28

Requirements: FR-06, NFR-07, NFR-08

## What changed

The Requestor transcript now gives completed assistant prompts a quiet soft-blue surface and user answers an accessible brighter-blue bubble with white text, then gives the active MCQ or yes/no turn one focused response card. Assistant avatars are 36 px and the inner glyph breathes between 90% and 110% scale without moving the circle or layout. Conversation copy is approximately 14 px with 10–12 px turn rhythm, and clarification uses a soft violet/indigo attention surface instead of normal blue or warning amber. The card owns its question, options and optional yes/no explanation. A structured turn no longer shows a second docked composer, while the existing jump-to-latest control remains unchanged. The result now uses one severity scale across badge, score ring and rail (green, amber, orange, red), and a completed assessment uses green rather than active blue for its Closed status.

## Where and why

- `components/chat/ChatSession.tsx`: creates the focused conversational hierarchy, role-specific message colors, larger animated bot glyph treatment, balanced spacing, responsive option layout, relevant progress feedback and persona summary.
- `app/globals.css`: defines the reduced-motion-compatible bot breathing keyframes.
- `messages/en.json` and `messages/bn.json`: keep the new summary and explanation copy localized.
- `e2e/frontend-correctness.spec.ts`: covers the active MCQ and yes/no card behavior.
- `e2e/roles.spec.ts`: verifies a coherent $25,000 customer-funds incident from creation through result, accept note, closed status and Decision Details.
- `components/chat/ResultCard.tsx`: aligns classification badge, score ring and rail colors to the same severity meaning.
- `components/chat/ChatSession.tsx`: aligns the terminal Closed status with the accepted decision's completion-green meaning.
- `design-qa.md` and `docs/design-qa/focused-ai-chat-*`: preserve the visual target, rendered captures and focused comparisons.
- `docs/design-audit/2026-10-28-create-to-accept/`: records every audited flow step plus the semantic-color before/after proof.

## Alternatives rejected

- Repeating the assistant name above every historical message, because it adds noise.
- Keeping the docked composer during a structured turn, because it looks like a second input.
- Using cards for every prior message, because it makes the transcript feel like a survey.
- Adding fake typing or streaming, because the current transport returns normal JSON responses.

## How to verify

1. Start a Finance Officer assessment and complete free-text, number, MCQ and yes/no turns.
2. Confirm only the active structured turn is highlighted and earlier answers remain readable as chat bubbles.
3. Submit the assessment, verify the result narrative and drivers match the captured facts, then accept with a note.
4. Open Assessment context and verify Decision Details contains actor, time and note.
5. Check light and dark themes, keyboard focus and the unchanged jump-to-latest arrow.
6. Run typecheck, lint, the focused frontend tests and the Requestor create-to-accept E2E test.

No API, database, scoring, audit, role or project-map change was required.
