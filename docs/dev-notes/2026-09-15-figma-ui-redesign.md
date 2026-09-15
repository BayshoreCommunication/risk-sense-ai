# 2026-09-15 — Figma-informed frontend redesign

## Outcome

The frontend now implements the owner's direction to use the linked RiskSense AI Figma file as a content and layout reference for Requestor, Administrator, System Administrator and Audit workspaces. The implementation intentionally is not a pixel-identical copy: the Figma file is incomplete, so the existing requirements, role boundaries, API contract and business rules remain authoritative wherever a frame is absent or shorthand conflicts with the repository baseline.

The redesign uses the existing tasks T-020, T-027, T-038, T-056, T-062, T-063, T-071, T-090 and T-100. Relevant requirement coverage includes FR-02, FR-08, FR-25, AI-01, NFR-07, NFR-08, DASH-01, DASH-02, DASH-03, DASH-04 and SEC-07. No new requirement identifier was created.

## File-by-file implementation

| File | What changed | Where / why |
|---|---|---|
| `app/globals.css` | Added the shared navy/blue palette, semantic chart/status colors, workspace surfaces, subtle grids, scroll treatment and reduced-motion behavior. | Establishes one responsive, operational design language across all role workspaces. |
| `app/layout.tsx` | Moved the Geist variables to the document element and applied the shared sans font through the body. | Makes the global typography tokens available consistently. |
| `app/(public)/login/page.tsx` | Reworked authentication into a split assurance/identity layout while preserving Firebase, SSO, verification, OTP and development-only paths. | Uses the Figma content hierarchy without changing authentication behavior. |
| `app/(requestor)/chat/page.tsx` | Added a polished assessment start surface, role cards, incident context, privacy guidance and clearer loading/error states. | Makes the first Requestor step easier to scan and preserves explicit persona selection. |
| `app/(requestor)/review/page.tsx` | Added status summaries, richer filter presentation, scenario and mandatory-review filters, days-open context, retry handling and responsive cards/tables. | Brings DASH-01 information density and filtering in line with the Figma dashboard while keeping backend scope authoritative. |
| `app/(admin)/admin/page.tsx` | Rebuilt the Administrator landing surface with operational summaries, content/review actions and feature-gated analytics navigation. | Reflects the Figma configuration workspace without exposing unavailable PAID features. |
| `app/(admin)/admin/review/page.tsx` | Restyled the mandatory-review queue with clearer evidence, confidence and status presentation. | Improves review triage while preserving read-only Administrator behavior. |
| `app/(admin)/admin/datasets/page.tsx` | Added dataset lifecycle summaries, validation presentation and a computed Content rows column. | Implements the Figma inventory/table intent using existing counts instead of inventing file-byte data. |
| `app/(admin)/admin/scoring/page.tsx` | Added structured scoring summaries and clearer matrix/simulator presentation. | Exposes deterministic scoring configuration without moving scoring into the AI layer. |
| `app/(admin)/admin/analytics/page.tsx` | Added polished report controls, explicit chart/table switching, exports and semantic period/classification emphasis. | Addresses accessible alternate views and monthly trend readability from the Figma feedback. |
| `app/(audit)/audit/page.tsx` | Reworked the Audit landing page around immutable evidence, reconstruction and chain verification. | Makes the read-only Audit role and evidence boundaries explicit. |
| `app/(audit)/audit/assessments/page.tsx` | Restyled the assessment evidence table and reconstruction actions. | Improves lifecycle scanning without changing masked/unmasked access rules. |
| `app/(audit)/audit/logs/page.tsx` | Added operational summaries, payload disclosure and a computed Event size column. | Addresses Figma comment 55 using the already returned event data; no API field was invented. |
| `app/(system)/system/page.tsx` | Reworked the System Administrator overview into an operational control plane. | Surfaces tenant, access, retention, DR, conformance and archive responsibilities. |
| `app/(system)/system/users/page.tsx` | Added account/role/MFA policy summaries and clearer directory metrics/table treatment. | Makes one-account/one-role and plan-aware MFA semantics visible. |
| `app/(system)/system/departments/page.tsx` | Added access-mapping context and more legible mapping controls. | Clarifies how department-to-persona scope works. |
| `app/(system)/system/tenant/page.tsx` | Added plan-aware role, MFA, session and retention explanations. | Replaces prototype shorthand with the existing FREE/PAID and security rules. |
| `app/(system)/system/retention/page.tsx` | Added fixed-FREE/configurable-PAID lifecycle guidance and clearer run history. | Explains staged retention without implying audit deletion or completed external cold storage. |
| `app/(system)/system/dr/page.tsx` | Added recovery target cards, status colors and clearer evidence/runbook editing. | Makes monthly/recency state scannable while retaining operator-attested evidence semantics. |
| `app/(system)/system/conformance/page.tsx` | Added data-assurance hierarchy and clearer scan/flag tables. | Improves operational diagnosis without changing conformance behavior. |
| `app/(system)/system/audit/page.tsx` | Added a feature-gated bounded JSON export workflow and immutable manifest history. | Gives System Administrators a UI for the existing `/audit-logs/archive` and `/audit-logs/archive-manifests` APIs; source audit entries remain append-only. |
| `components/shell/AppShell.tsx` | Rebuilt the responsive sidebar/header, role navigation, active states, plan/user context, language control and mobile drawer; added System Audit archive navigation. | Applies the same information architecture to all four workspaces and retains authoritative `/me` role routing. |
| `components/chat/ChatSession.tsx` | Reorganized messages, progress, facts, governance context and the composer; added a viewport-bounded internal transcript scroller, synchronous busy guarding plus safe Enter, Shift+Enter and IME handling. | Keeps long histories and the composer usable without fake streaming or duplicate submissions. |
| `components/chat/ResultCard.tsx` | Reworked score, confidence, factor breakdown, recommendation, mandatory review, decision and escalation presentation. | Makes deterministic output and required human action visually distinct. |
| `components/review/AssessmentDetail.tsx` | Added clearer evidence, result, decision and action sections, including amber still-open escalation semantics. | Supports Requestor/reviewer comprehension while preserving decision permissions. |
| `components/review/ReconstructionView.tsx` | Reworked integrity, reconstructed state, differences and timeline presentation. | Makes audit-only reconstruction easier to inspect without weakening masking or hash checks. |
| `components/admin/ContentManager.tsx` | Restyled content tables, lifecycle status, forms, loading/empty/error states and confirmation actions. | Standardizes Administrator CRUD/version workflows. |
| `components/admin/StructuredFieldEditor.tsx` | Improved nested-field grouping and structured-control presentation. | Keeps administrators out of raw JSON while increasing scanability. |
| `components/analytics/Charts.tsx` | Improved inline SVG chart layout, semantic colors, labels, keyboard/click hit areas, hover detail and accessibility support. | Charts retain a table alternative, expose interactive descendants to assistive technology and do not communicate series identity by color alone. |
| `components/ai-elements/conversation.tsx` | Added the local AI Elements conversation container and latest-message return affordance. | Supplies presentation/scroll behavior only. |
| `components/ai-elements/message.tsx` | Added local message and core Markdown-response presentation primitives; eager Mermaid, math, syntax-highlighting and CJK plugins were removed after bundle profiling. | Improves assistant/user content rendering without replacing the assessment transport or loading specialty renderers for ordinary text. |
| `components/ai-elements/suggestion.tsx` | Added local suggestion chips. | Reuses accessible choices for persona and answer suggestions. |
| `components/ui/badge.tsx` | Refined pill spacing and visual weight. | Standardizes compact status semantics. |
| `components/ui/button.tsx` | Refined sizing, focus, elevation and icon spacing. | Creates a consistent action hierarchy. |
| `components/ui/card.tsx` | Refined radius, border and shadow. | Establishes shared workspace surfaces. |
| `components/ui/dialog.tsx` | Improved responsive width, backdrop and overflow behavior. | Keeps structured forms and evidence usable at constrained viewport sizes. |
| `components/ui/input.tsx` | Refined height and focus treatment. | Standardizes accessible form controls. |
| `components/ui/select.tsx` | Refined height and focus treatment. | Standardizes filter and configuration controls. |
| `components/ui/table.tsx` | Refined headers, cells, row states and scrolling container. | Supports dense operational data consistently. |
| `components/ui/textarea.tsx` | Refined focus and surface treatment. | Aligns free-text intake and administrative forms. |
| `components/ui/button-group.tsx` | Added the AI Elements-compatible grouped-action primitive. | Supports coherent adjacent conversation actions. |
| `components/ui/scroll-area.tsx` | Added the AI Elements-compatible scroll primitive. | Supports bounded conversation content. |
| `components/ui/separator.tsx` | Added the AI Elements-compatible separator primitive. | Supports accessible visual grouping. |
| `components/ui/tooltip.tsx` | Added the AI Elements-compatible tooltip primitive. | Supports icon-action labels where needed. |
| `messages/en.json` | Added English copy for the redesign, role policies, new archive route, chat context, filters and status guidance. | Keeps every new user-facing surface catalogued. |
| `messages/bn.json` | Added matching Bengali keys and copy. | Preserves repository localization coverage; human language review remains external. |
| `e2e/frontend-correctness.spec.ts` | Added regressions for mobile drawer focus containment/return, 50-message transcript containment, newline/IME behavior and duplicate Enter/click prevention. | Protects the redesigned navigation and composer without testing fake streaming. |
| `e2e/roles.spec.ts` | Updated the Audit journey to enter through the redesigned landing/navigation. | Keeps full-stack role flow aligned with the new information architecture. |
| `package.json` | Added the AI Elements presentation dependencies: AI SDK types, core Streamdown Markdown and stick-to-bottom behavior. | Supports the local Conversation/Message/Suggestion components; specialty renderers and a second assessment runtime are intentionally absent. |
| `package-lock.json` | Locked the new presentation dependency graph. | Makes installs reproducible and auditable. |
| `README.md` | Replaced the stale Figma-deferred statement and documented the System Audit archive capability. | Aligns contributor guidance with the owner's current direction and acceptance boundary. |
| `design-qa.md` | Records role, viewport, state, localization, accessibility and post-review evidence with `Result: passed`. | Separates repository design QA from owner/human acceptance. |

Workspace-root documentation updated with this implementation (paths below are relative to `RiskSenseAi/`) includes `README.md`, the synchronized root/frontend/backend `PROJECT_STATUS.txt` copies, `docs/UAT.md`, `docs/ai/DecisionLog.md`, `docs/ai/DeploymentGuide.md`, `docs/ai/Modules.md`, `docs/ai/project-map.yaml`, `docs/ai/AI_MEMORY.md`, `docs/ai/KnownIssues.md`, `docs/ai/RequirementsCoverage.md`, `docs/ai/CommonMistakes.md`, `docs/ai/BusinessRules.md`, `docs/ai/Overview.md`, `docs/agents/domain.md`, `docs/agents/clarification-agenda.md`, `docs/agents/issue-tracker.md`, `tasks/backlog.md` and `tasks/sprint-release-readiness.md`. These changes separate repository implementation from owner acceptance, add `/system/audit` to the route map, record exact validation evidence and track the non-blocking Streamdown performance follow-up.

## Figma comment disposition

Implementation status and Figma comment-thread state are intentionally separate. Comments 44–46 and 48–55 are addressed in the repository but must not be marked resolved in Figma until action-time owner confirmation. Comment 47 remains open because the supplied text, “example needs adjusted to:”, does not include the requested replacement.

| Comment | Repository disposition | Figma thread |
|---|---|---|
| 44 | FREE public access is described as Requestor-only. | Pending confirmed resolution |
| 45 | Managed Administrator, System Administrator and Audit roles are described as PAID capabilities. | Pending confirmed resolution |
| 46 | MFA copy follows implemented role/tenant policy: administrators and system administrators always complete RiskSense OTP; PAID requestors use configured SSO/IdP factors; audit and other non-privileged paths follow tenant OTP policy. | Pending confirmed resolution |
| 47 | No replacement example was invented because the requested target text is incomplete. | Open / ambiguous |
| 48 | Account/session language avoids presenting password lockout as a material risk classification and instead explains the configured access policy. | Pending confirmed resolution |
| 49 | DR target/status cards use semantic state color and recency context. | Pending confirmed resolution |
| 50 | Analytics reports and trends expose user-selectable Chart and Table views. | Pending confirmed resolution |
| 51 | System and login copy now explains the role-aware SSO/OTP policy without claiming a control the backend does not enforce for every PAID role. | Pending confirmed resolution |
| 52 | User administration and tenant policy state that one person uses one account with exactly one role. | Pending confirmed resolution |
| 53 | “Life + 3 years” is replaced with explicit dataset-history days measured after version retirement. | Pending confirmed resolution |
| 54 | Retention copy distinguishes fixed FREE windows from tenant-configurable PAID windows. | Pending confirmed resolution |
| 55 | The Audit log table includes a computed Event size column. | Pending confirmed resolution |

## AI conversation boundary

The visual composition borrows proven conversation patterns: a scrollable transcript, return-to-latest control, distinct assistant/user messages, quick suggestions, progress/fact context and an anchored composer. It does not change Decision 21:

- assessment turns are ordinary JSON requests and responses;
- structured choices do not simulate token streaming;
- free text uses the existing fact-extraction call;
- busy indicators describe a real in-flight request;
- AI never scores, decides or closes an assessment.

## Alternatives rejected

- Pixel-copying incomplete Figma frames, because it would require inventing missing states and could reproduce prototype shorthand that conflicts with requirements.
- Replacing the existing assessment client with a second chat runtime, because the JSON contract, persistence and deterministic workflow already satisfy the application architecture.
- Simulated typing, reasoning or token streaming, because it would misrepresent backend state.
- Fabricated metrics or file sizes, because Figma placeholders are not authoritative data.
- Treating implementation as visual acceptance or resolving comment 47 by guessing.

## Verification

Verified against the current working tree:

- `npm audit --omit=dev --audit-level=moderate` — zero vulnerabilities.
- `npm run lint` and `npm run typecheck` — passed without errors or warnings.
- English/Bengali JSON parsing, key-set and ICU-variable comparison — 1,114 / 1,114 with no mismatch.
- `npm run e2e:frontend` — 31/31 mocked browser cases passed across four configured files.
- `npm run build` — Next.js 16.3.5 production build passed, generating 27/27 routes including `/system/audit`.
- Role-by-role desktop/mobile/state review, keyboard/focus checks, responsive recheck and the independent high-severity diff review — passed; see `design-qa.md`.
- Plain `/chat/[id]` production transfer fell from 775 KB with eager specialty plugins to 442 KB after their removal. Core Streamdown remains a documented P3 optimization candidate (ISS-028), not a release-blocking regression.
- `git diff --check` in the frontend repository — passed.

Repository validation is complete at the stated automated/design-QA scope. Owner confirmation is still required before resolving addressed Figma comment threads; comment 47 needs replacement text or an explicit leave-open decision. Human accessibility, Bengali-language, usability and full UAT acceptance remain external.

No backend route, schema, database collection, scoring rule or AI decision authority changed in this redesign, so `API.md`, `Database.md` and the BusinessRules behavior tables require no behavioral amendment.
