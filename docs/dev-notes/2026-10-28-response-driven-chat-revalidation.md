# Response-driven chat revalidation

Date: 2026-10-28  
Requirements: FR-06, NFR-07, NFR-08

The guided conversation now consumes the successful mutation response immediately and moves the two canonical assessment/transcript reads to background revalidation. A generation guard prevents an older refresh from overwriting a newer answer, and matching canonical rows retain local render keys so the active card does not animate or scroll twice. The existing mutation-error recovery and refresh-warning behavior remain in place, and no timer-based delay message or persistent socket transport was introduced.

Implementation: `components/chat/ChatSession.tsx`  
Regression coverage: `e2e/frontend-correctness.spec.ts`

Verification: full lint and typecheck pass, the MCQ/yes-no/number/free-text coverage is green, the production build generates 31 pages, and the complete mocked frontend suite passes 81/81 in 55.7 seconds. Production latency acceptance remains external.
