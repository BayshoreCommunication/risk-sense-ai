# RiskSense AI redesign — design QA

Date: 2026-09-20

Scope: login plus Requestor, Administrator, System Administrator and Audit workspaces

Reference: owner-supplied RiskSense AI Figma file, with requirements governing incomplete frames

## Evidence matrix

| Area | Widths / states reviewed | Evidence | Result |
|---|---|---|---|
| Authentication | 1440×1000 desktop; 390×844 mobile; credentials, recovery, SSO-disabled and development-account states | Split assurance/identity hierarchy, readable policy copy, preserved sign-in behavior and no horizontal overflow | Passed |
| Requestor start/review | 1440×1000, 1280×720 and 390×844; loading, empty, filtered, mandatory-review and detail states | Guided intake hierarchy, scenario/mandatory-review filters, days-open context, responsive cards/tables | Passed |
| AI assessment | 1280×800, 1440×900 and responsive disclosure states; persona confirmation, structured/free-text answers, busy, result, decision and escalation states | Inline structured-choice cards, anchored composer, compact context rail, canonical result summary, readable selected-value labels, 50-message internal-scroll regression, IME/Shift+Enter/duplicate-submit coverage | Passed |
| Administrator | Desktop plus constrained-table checks; overview, review, datasets, scoring, content lifecycle and analytics Chart/Pie/Table modes | Operational hierarchy, named dataset provenance, structured editors, responsive horizontal scrolling, semantic chart labels and accessible table alternatives | Passed |
| System Administrator | Desktop and constrained/mobile layouts; overview, users, departments, tenant, retention, DR, conformance and audit archive enabled/disabled states | Current-login MFA/SSO copy, mobile access/last-login parity, confirmation states, bounded immutable export, manifest history and error recovery | Passed |
| Audit | Desktop and 390×844; overview, assessments, reconstruction, log filters/details and hash verification | Read-only evidence hierarchy, mobile full-hash/human-decision parity, event-size column, tamper-evident language and contained data tables | Passed |
| Localization | English-only launch runtime; Bengali catalog retained dormant | 1,404/1,404 catalog leaves and ICU variables match; stale Bengali preferences fall back to English and Bengali locale selection is rejected | Passed |
| Accessibility | Keyboard navigation, visible focus, drawer dialog semantics, focus trap/return, contrast, reduced motion, chart controls and table reflow | Automated focus tests plus independent diff/a11y review found no remaining P1/P2 issue | Passed |

## Issues found and corrected

- Restored Geist at the document root after a self-referencing font token rendered a serif fallback.
- Restored translated `English` / `বাংলা` language controls and their pressed state.
- Added dialog semantics, background inertness, focus entry/trap/return and Escape handling to the mobile drawer.
- Restored high-contrast input/select/textarea focus perimeters and placeholder text.
- Exposed interactive SVG chart controls to assistive technology, fixed bar hit areas and stopped fading enabled label text.
- Added keyboard-operable Chart/Pie/Table analytics, persistent period drill-down, presentation-only pie paths and a visible-focus legend without exposing zero-value slices.
- Added horizontal containment to dense scoring and audit tables.
- Kept escalations amber and explicitly open instead of presenting them as completed green decisions.
- Aligned MFA status/copy with current-login assurance, actual role and tenant policy instead of inferring an IdP factor from enrollment history.
- Preserved full audit hashes, human decisions, account access and last-login evidence in mobile card layouts.
- Added `try`/`finally` recovery and invalid-range handling to audit archive operations.
- Bounded the transcript to an internal scroller so long histories do not push the composer below the viewport.
- Compacted the narrow-width account control, added mobile-drawer sign-out and kept the focus loop contained.
- Distinguished loaded-page Audit text filtering from exact-ID server filtering so an empty page is not presented as a global ledger result.
- Removed eager Mermaid, math, code-highlighting and CJK renderer plugins; plain-chat production transfer fell from 775 KB to 442 KB.

## 2026-09-20 assessment conversation refinement

The refinement used the two user-supplied review captures at
`/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-91385f6b-26f1-475e-8024-64db3424585d.png`
and
`/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-5bc1ec76-3bbc-43a2-a22d-4ea765c2f89f.png`.
[Beautiful UI](https://www.beautifului.dev/) supplied interaction and visual-density patterns, not copied product behavior or a second chat runtime. Requirements and the existing ordinary-JSON assessment contract remained authoritative.

Five fidelity surfaces were reviewed:

| Surface | Finding | Implemented correction |
|---|---|---|
| Viewport composition | The page title, top spacing and fixed height left too little working area and made the result appear taller than the viewport. | Reduced route-specific conversation padding and heading scale; the assessment workspace now fills the available main region. |
| Transcript rhythm | Large bubbles and generous gaps made the exchange feel like stacked cards rather than a continuous conversation. | Reduced message width, spacing and avatar scale; assistant prose stays visually open while user answers use a compact neutral bubble. |
| Response feedback | A submitted answer did not immediately join the visual flow, and one generic loading phrase obscured what the system was doing. | Added one pending local answer echo plus action-specific, live progress for answer, persona, submit and decision work; the canonical reload replaces the echo. |
| Answer controls | Select, yes/no, number and free-text controls competed with the question and consumed excessive vertical space. | Added concise response labels and hints, compact controls and draft restoration after failed text or number mutations. |
| Context and result evidence | The persistent side rail and tall result sections created competing scroll areas and separated the decision from the conversation. | Kept the full context rail only at wide desktop widths, exposed it through a bounded disclosure below that breakpoint, and compacted the result, factors and human-decision sections without removing evidence. |

Browser verification used a real result state in a fresh QA tab:

| Viewport | Measurements and observations | Result |
|---|---|---|
| 1440×900 desktop | Conversation shell `784/784` client/scroll height; context panel `645/645`; one transcript scroll owner; no console errors. | Passed |
| 390×844 mobile | Conversation shell `744/744` client/scroll height; one transcript scroll owner; no document-level horizontal overflow. | Passed |

The pass corrected excess top whitespace, fixed-height/nested-scroll pressure, oversized message/result density, generic progress language and narrow-screen context competition. The final assessment-refinement result is **passed**.

## 2026-09-20 premium chat and financial-label pass

The existing AI Elements composition was retained and given a restrained premium treatment: a navy-to-blue assistant mark and result summary, cool hairline borders, one coordinated shadow hierarchy, a softly layered transcript, compact branded user bubbles, elevated choice controls and a more prominent docked composer. No fake streaming, decorative glass layer or additional chat runtime was introduced.

The live 1440×900 Requestor route was rechecked after implementation. The selected-scenario card now shows the complete `Financial Unauthorized Transaction` label without truncation, the context rail uses the same label, the system scenario sentence remains natural, and the transcript/composer stay inside the existing viewport-contained workspace. Automated cross-role checks cover Requestor chat/review, Administrator review and mobile Audit, including seeded system transcript text; raw `fin_*` keys and `Fin …` labels are absent from those read surfaces.

## 2026-09-20 persona-confirmation contrast correction

| Evidence | Value |
|---|---|
| Source visual truth | `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-36f2991f-089a-4924-bd87-438150b89694.png` |
| Post-fix implementation | `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-persona-confirmation-after.png` |
| Pixels and normalization | Source `1747×915` including Chrome chrome; implementation `1440×900` at a `1440×900` CSS viewport and device-pixel ratio `1`. Comparison used the matching app-content and persona-option regions rather than browser chrome. |
| State | Desktop Requestor, `Confirm persona`, high-confidence `Finance Officer` suggestion. |

Comparison history:

1. The source capture exposed one P1 accessibility defect: the suggested `Finance Officer` option combined a white card background with the default button's near-white foreground, making its label unreadable.
2. The card was corrected to use the standard foreground token, while `(suggested)` uses the primary accent. No layout, copy, workflow or selection behavior changed.
3. The post-fix capture shows both strings clearly. Browser evidence reports a white background, dark standard foreground, an enabled accessible `Finance Officer (suggested)` button, no horizontal overflow and no console errors.

Full-view comparison confirms that the surrounding workspace proportions, anchored confirmation area and context rail are unchanged. The focused persona-option comparison confirms the reported label is readable. Typography retains the existing family, weight and hierarchy; spacing, radii and shadows are unchanged; the color-token collision is corrected; no raster image or custom asset participates in this control; and copy remains identical. No actionable P0/P1/P2 difference remains.

## 2026-09-20 inline choices, compact context and canonical result

This pass used the owner-supplied screenshots as visual truth for problem location and hierarchy, with the product requirements and existing API as the behavioral truth. The Beautiful UI Approval Card informed proximity, response-state clarity and restraint; its dark modal surface, Skip/Continue controls and independent card progress were deliberately not copied.

### Source and implementation evidence

| Evidence | Pixel dimensions | State / use |
|---|---:|---|
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-18b072f5-e618-49c1-9085-fe3c0d81c03d.png` | 694×369 | Approval-card interaction reference. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-1628ab07-e47f-460a-b973-3eaf80fb9943.png` | 1011×224 | Original detached MCQ response controls. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-a6ab2731-23d9-433c-a65a-eb7f6c67e62e.png` and `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-907a8e45-c21f-4118-bd73-73d7e3ea68ba.png` | 312×710 and 353×596 | Dense workflow/context/fact rail requiring a clearer hierarchy. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-25eb04bf-7dbf-408c-b80e-2487072bd973.png` | 993×268 | Duplicate result explanation above and inside the result card. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-e83c9571-2e9b-4519-bed9-875887a10924.png` and `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-e615bb1b-fe08-43d3-a5fe-b86e5c0c1640.png` | 1043×552 and 1008×622 | Result/factor hierarchy review and the owner's refinement checkpoint. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-8eeaba5a-aec6-4815-b440-d229acbebee5.png` | 996×98 | Raw selected classification key defect. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-inline-mcq-fluid-collapsed.png` | 1440×900 | Full Requestor conversation with collapsed navigation and fluid workspace. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-inline-mcq-final-card.png` | 906×170 | Focused inline MCQ card comparison. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-minimal-context-expanded.png` | 1440×900 | Compact workflow/context/facts rail, expanded fact state. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-polished-result-final-top.png` and `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-polished-result-final.png` | 1280×720 each | Canonical result summary and expanded meaningful factor state. |

Browser normalization used the rendered application region rather than browser chrome. The result evidence was captured at a 1280×720 CSS viewport, device-pixel ratio 1, with no document horizontal overflow and no console errors. The 1440×900 conversation/context evidence was captured at device-pixel ratio 1. Mobile and intermediate breakpoints are covered by the viewport-containment, disclosure and horizontal-overflow browser assertions.

### Comparison history

1. Structured MCQ choices initially lived in the bottom composer, visually detached from their prompt. They moved into only the latest active assistant turn; historical questions remain inert.
2. The first inline card used letter tokens and an active text composer. It changed to clear radio-style choices, visible focus/pending states and a disabled-but-visible MCQ dock. Yes/no uses the same inline pattern while retaining one optional explanation input.
3. The duplicate optional-explanation footer, selected-scenario header chip and excess title/header height were removed. Scenario data remains in Assessment Context.
4. Collapsing the navigation initially left a wide dead gutter. The page shell now consumes the released width, with a wider bounded transcript/composer measure and no document overflow.
5. The right rail initially repeated large labels, dividers and a three-line confidence block for each fact. It now uses a compact `current/total` workflow marker, grouped context, two-line fact rows, localized booleans and one confidence percentage. The fact group is collapsed by default for density and renders every captured fact when opened.
6. The scored explanation initially appeared twice. An exact persisted assistant-result match is now visually suppressed while the governed record remains stored; the result card is the one visible summary.
7. The result card moved from a heavy score slab and repeated action/step copy to a labeled 0–100 ring, explicit “Why this result”, one recommendation, distinct next steps, driver label/value chips and a factor table whose bars encode contribution relative to configured weight.
8. `elevated_risk` and comparable selected keys initially appeared in triggers. All Base UI selects now receive value/label item mappings; submitted identifiers stay unchanged while selected text is translated or formatted. Camel-case factor names and known domain prefixes/acronyms are also human-readable.

### Required fidelity surfaces

| Surface | Final comparison |
|---|---|
| Typography | Geist remains the product typeface. Conversation copy is compact but readable; small uppercase labels establish hierarchy without repeating full prompts. |
| Layout | Active choices remain attached to the assistant question, the dock remains fixed below, the outer shell expands with navigation state, and result/context evidence stays inside the existing single-scroll workspace. |
| Color | Matte white, neutral and pale-blue surfaces replace competing gradients. Blue remains the action/focus accent; emerald/amber/rose retain semantic state meaning. |
| State and interaction | Choices, disabled dock, optional explanation, pending answer, context disclosure, factor disclosure, override selection and human-decision controls expose visible and accessible states. |
| Imagery / icons | No raster illustration or custom icon asset was required by the references. Existing Lucide symbols and the CSS score ring are semantic, lightweight and non-decorative. |
| Copy and data | No fake Skip/Continue behavior was introduced. Full `Financial` labels, readable selected names and canonical result prose are shown; no scored value, stored key, transcript record or decision contract is rewritten. |

Full-view review confirms the title, conversation, composer, context and decision card fit their bounded workspace with one transcript scroller. Focused review confirms option grouping, fact density, score/explanation hierarchy, de-duplicated guidance, readable factor labels and selected classification names. No actionable P0, P1 or P2 visual difference remains in the implemented scope.

## 2026-09-20 navy sidebar-toggle refinement

| Evidence | Pixel dimensions | State / use |
|---|---:|---|
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-f5dc6ec3-0952-485d-9340-ac6b68370bc1.png` | 76×48 | Owner-supplied current state: a white floating circle at the sidebar/header seam. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-c56b7a2f-6298-427b-8d43-4ce5337fb4c9.png` | 88×39 | Owner-supplied target color treatment: the solid navy header surface. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-navy-sidebar-toggle-final.png` | 1280×720 | Final desktop Requestor capture with collapsed navigation and the accessible `Expand navigation` control. |

The first implementation pass accidentally omitted the responsive `lg:grid` display class, which made the desktop control invisible. The focused browser test and visual inspection caught that P1 regression; the class was restored before final capture. The finished control retains the original size, seam position and left/right chevron behavior, while its surface now uses the exact `#061d43` header navy, a subtle light border and a restrained navy shadow. White icon contrast, a lighter hover surface and a high-contrast focus ring preserve discoverability and keyboard access.

Full-view comparison confirms that the navigation width, main-content reflow, typography, copy and surrounding spacing are unchanged. Focused comparison confirms that the former detached white bead now reads as part of the header without disappearing into it. No raster asset was introduced, and no actionable P0, P1 or P2 visual difference remains in this refinement.

## 2026-09-20 structured-choice clarity refinement

| Evidence | Pixel dimensions | State / use |
|---|---:|---|
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-8647dd55-227b-4af0-a727-5d7647bc4b4c.png` | 894×160 | Owner-supplied Yes/No card showing an ambiguous pale-blue option treatment. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-yes-no-refined-final.png` | 1280×720 | Final Requestor conversation at a 1280×720 CSS viewport, device-pixel ratio 1, with an unselected Yes/No card and its optional explanation composer. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-yes-no-refined-card.png` | 960×160 | Focused final card crop used for detailed typography, color and spacing review. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-yes-no-selected-state.jpg` | 1280×720 | Selected `No` busy state, including the retained chosen treatment and subdued unavailable alternative. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-yes-no-comparison.png` | 1878×160 | Combined source/final focused comparison; the 894px source and 960px implementation crops retain their native one-pixel density. |

The source's pale-blue first option could be read as selected even though its radio remained empty. The final card separates the states: both initial options use neutral white surfaces and dark navy labels, hover uses a lighter blue border/surface, keyboard focus uses an independent outer ring, and only the committed option receives a strong blue border, pale-blue fill and filled radio/loading mark. The alternative fades only while submission is pending. `aria-pressed` exposes the temporary chosen state, while the more specific “Choose Yes or No” helper replaces the generic MCQ instruction for binary questions.

Full-view comparison confirms that the card remains attached to the active assistant question, the optional explanation composer stays below it, the 44px choice targets remain responsive and the conversation shell does not overflow. Focused comparison confirms clearer foreground contrast, calmer neutral defaults, distinct hover/focus/selected states and consistent radii/spacing. Geist typography and all question/answer data remain unchanged; the existing Lucide selection icon is retained, with no new raster or custom-drawn asset. Green/red semantics were deliberately avoided because Yes/No does not mean good/bad in a risk assessment. No actionable P0, P1 or P2 visual difference remains.

## 2026-09-20 complete light/dark theme and account-menu switch

### Source and rendered evidence

| Evidence | Pixels / viewport | State / use |
|---|---:|---|
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-30ef511e-0cea-4437-998d-7d72c2d4c1b3.png` | 360×266 source pixels | Owner-supplied light account-menu placement target. |
| `/Users/bayshorecommunication/.codex/visualizations/2026/09/20/01a0be7f-4abc-7500-a0b2-5b1d13486680/theme-mobile-full-light.png` | 390×844 pixels at a 390×844 CSS viewport, DPR 1 | Authenticated Requestor mobile page with the account menu open. |
| `/Users/bayshorecommunication/.codex/visualizations/2026/09/20/01a0be7f-4abc-7500-a0b2-5b1d13486680/theme-account-menu-light.png` | 288×254 pixels, DPR 1 | Focused implemented light menu. |
| `/Users/bayshorecommunication/.codex/visualizations/2026/09/20/01a0be7f-4abc-7500-a0b2-5b1d13486680/theme-account-menu-dark.png` | 288×254 pixels, DPR 1 | Focused implemented dark menu after the reveal settled. |
| `/Users/bayshorecommunication/.codex/visualizations/2026/09/20/01a0be7f-4abc-7500-a0b2-5b1d13486680/theme-full-comparison.png` | 822×900 composite | Full-view source/rendered comparison in one image. |
| `/Users/bayshorecommunication/.codex/visualizations/2026/09/20/01a0be7f-4abc-7500-a0b2-5b1d13486680/theme-state-comparison.png` | 976×314 composite | Focused source/light/dark comparison in one image. The source menu crop was resized from 287 to 288 pixels wide solely for one-pixel alignment; vertical dimensions were not stretched. |

The source is a cropped 360 px-wide screen while the implementation full view is a 390 px mobile viewport, so full-page geometry was reviewed for composition and viewport containment rather than false pixel equivalence. The focused dropdowns share the same 288 px rendered width and one-pixel density. The source establishes placement and existing light styling; the added theme row necessarily increases the menu height from roughly 199 to 254 pixels.

### Full-view and interaction evidence

The in-app browser was used to inspect the authenticated Requestor start page, assessment list and governed result at the default desktop viewport and at 390×844 mobile in both themes. The account menu stays right-aligned, fully contained and scroll-bounded; the single switch is present on desktop and mobile. A reload visibly retained the dark loading surface before application data arrived, with no light flash. The circular reveal was observed from the switch origin, then slowed at the owner's request to 700 ms; the switch/fallback rhythm is 450 ms. The final state settled without clipping or residual transition classes. Browser console checks returned no errors.

Primary interactions tested were opening/dismissing the account menu, toggling light→dark and dark→light, reloading, navigating between Requestor routes, viewing a governed result, using the mobile breakpoint, and emulating reduced motion. Automated coverage additionally verifies cookie persistence, root class/data/CSS `color-scheme`, Bengali labelling, mobile containment, absence of hydration diagnostics, and immediate reduced-motion switching.

### Focused comparison and required fidelity surfaces

| Surface | Final comparison |
|---|---|
| Fonts and typography | Geist, weights, compact identity hierarchy, uppercase plan/role label and 12–14 px menu copy remain unchanged. The new “Dark mode” row matches the Language and Sign out rows in optical weight and line height. |
| Spacing and layout rhythm | The source's 288 px menu width, rounded shell, dividers and right alignment are retained. One 54–55 px row is inserted between Language and Sign out, with equal horizontal padding and no 390 px viewport overflow. |
| Colors and tokens | Existing light values remain unchanged. Dark uses branded navy semantic surfaces, brighter muted copy and status-safe accents. The selected dark primary control pair measures 6.39:1 after correction; borders, shadows, charts, sliders and hard-coded route surfaces all have deliberate dark counterparts. |
| Image quality and assets | The target contains no raster illustration or non-standard logo asset. Existing Lucide Sun/Moon/Language/Sign-out icons remain crisp vector components; no custom SVG, CSS-drawn replacement or placeholder image was introduced. |
| Copy and content | Identity, plan, role, language and sign-out content stay intact. “Dark mode”, “Switch to dark mode” and “Switch to light mode” have exact English/Bengali catalog parity; the visible/accessible switch label remains stable while `aria-checked` conveys state. |
| Accessibility and motion | The native button is keyboard-operable with `role="switch"`, stable label, checked state and visible focus. Reduced motion bypasses both transition markers. The 700 ms reveal and 450 ms fallback affect only user-triggered changes; server-rendered preference avoids load-time animation or flash. |

### Comparison history and findings

1. The first dark-token review found one P1 accessibility issue: the bright `#469afb`-equivalent dark primary background used a near-white foreground at approximately 2.76:1. The dark primary and sidebar-primary foreground tokens were changed to branded dark navy, producing a calculated 6.39:1 contrast ratio. The post-fix dark menu capture shows the corrected active English segment; the Moon remains bright blue over the translated dark thumb.
2. The first fallback review found a P3 motion discontinuity: the palette rule overrode transform/opacity transitions in browsers without View Transitions. Transform and opacity were added to the 450 ms fallback property set so the thumb and icons share the palette rhythm.
3. The owner requested a slightly slower transition during live review. The circular reveal changed from 520 to 700 ms and the switch/fallback from 320 to 450 ms. The revised in-app-browser pass showed a readable transition followed by a clean final state.
4. Post-fix full and focused comparisons found no remaining actionable P0, P1 or P2 mismatch. The source's gray Sign out fill is not copied because the owner explicitly asked to retain the application's current light theme; the current white row predates and remains unchanged by this work.

No P3 finding remains necessary for handoff. A future non-blocking test could stub `document.startViewTransition` to exercise the fallback timing directly; the fallback is already code-reviewed and reduced-motion behavior is browser-tested.

## 2026-09-20 English-only launch language

### Source and rendered evidence

| Evidence | Pixels | State / use |
|---|---:|---|
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/codex-clipboard-5ce47ed1-5103-4a5c-98bd-0b9e2fd0910c.png` | 320×64 | Owner-supplied current language row with English selected and Bengali still offered. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-english-only-menu-final.jpg` | 835×693 | Final authenticated Requestor account menu in the in-app browser. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-english-only-language-row.jpg` | 310×80 | Focused final language-row crop at native density. |
| `/var/folders/_y/1bg_zrxs0bb1r1652v_trcbc0000gn/T/risksense-english-only-comparison.png` | 698×154 | Native-density source/final comparison with labels and neutral padding only. |

The source directly determined the change: its language icon, compact segmented-control scale, border radius and active English treatment remain, while the Bengali segment is removed. The result is intentionally a status indicator rather than a one-option button, so it does not imply an unavailable action. The menu's identity, theme switch, dividers, sign-out action, spacing and outside-dismiss behavior remain unchanged.

### Required fidelity surfaces

| Surface | Final comparison |
|---|---|
| Typography | The existing compact Geist label, weight and casing are retained; only the Bengali label is absent. |
| Layout | The row keeps its leading language icon and right-aligned English pill. Removing the second segment reduces control width without introducing an empty gutter or changing menu width. |
| Color | The English pill continues to use the active brand-blue treatment in light and dark themes; surrounding semantic surfaces are unchanged. |
| State and interaction | The language row is non-interactive and exposes `Language: English` as its accessible label. A stale Bengali cookie still renders `html[lang="en"]`, and the locale endpoint rejects Bengali selection. |
| Imagery / icons | The existing Lucide language icon is retained. No raster asset, custom SVG or placeholder was introduced. |
| Copy and data | Visible product copy is English-only. The Bengali catalogue remains dormant and unchanged for a future explicitly approved re-enable; no domain, assessment or theme data changes. |

Full-menu inspection confirms that the English indicator remains legible and balanced alongside the retained theme control. Focused comparison confirms that the two-option selector has become one unambiguous status pill with no residual Bengali text. No actionable P0, P1 or P2 visual difference remains in the requested scope.

## Acceptance boundary

This QA is repository evidence, not human or owner acceptance. Any later Bengali re-enable requires refreshed qualified-language review; screen-reader/user sessions, representative UAT, deployed performance evidence, owner visual acceptance and final Figma comment dispositions remain external. Core Streamdown's measured residual overhead is tracked as the non-blocking ISS-028 optimization follow-up.

Automated completion evidence: current typecheck and lint passed; the 29/29-route production build passed; the mocked browser suite passed 63/63; a stale Bengali cookie rendered `html[lang="en"]`; and a Bengali locale request returned HTTP 400. The full-stack role suite then passed all 11 enabled journeys with four intentionally skipped non-development authentication cases. English/Bengali catalogues remain at 1,404/1,404 leaves with identical keys and zero ICU-variable mismatches; Bengali is dormant runtime source material, not an active language claim.

final result: passed
