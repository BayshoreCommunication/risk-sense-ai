# Responsive laptop workspaces

Date: 2026-09-22

Requirements: NFR-07, NFR-08, DASH-04

## Outcome

RiskSense now uses one role-independent shell scale based on usable CSS width rather than a physical-screen label. Requestor, Administrator, System Administrator, and Audit keep the desktop navigation at and above 992 px, use a compact laptop treatment through 1199 px, return to the full desktop information architecture at 1200 px, and reserve the most spacious header, rail, and page padding for 1536 px and wider screens.

## What changed, where, and why

- `components/shell/AppShell.tsx` defines the shared fixed-height workspace, adaptive header/sidebar geometry, desktop/mobile navigation threshold, outside-dismiss behavior, and a duplicate-safe sign-out pending state. Crossing from a mobile viewport into desktop while the drawer is open now closes the drawer so content can never remain `inert` behind a CSS-hidden overlay.
- `app/globals.css` provides the shell tiers: under 992 px uses the drawer; 992–1199 px uses a 64 px header and 208 px sidebar; 1200–1439 px uses a 68 px header and 224 px sidebar; 1440–1535 px uses a 72 px header and 240 px sidebar; 1536 px and above restores the 76 px header, 256 px sidebar, and spacious page padding. The responsive rules remain in the components cascade layer so explicit page utilities still win.
- `components/shell/PageHeader.tsx` places role and requirement controls alongside the title from 1200 px upward, while allowing a readable stacked header when the usable pane is narrower.
- `components/ui/table.tsx` removes the viewport-derived global table height. Natural tables now participate in the page scroller; explicitly filled panels own their one vertical table scroller. Laptop cells and headings are compact, while the large-screen rhythm returns at 1536 px.
- Administrator analytics, datasets, mandatory review, rule cards, and shared content-manager controls now use compact grids, contained wide tables, opaque sticky headers, and wrapped actions instead of widening the document.
- Requestor login, new-assessment, assessment review, and active conversation layouts react to the actual content pane. Review results use evidence-complete cards when a table cannot fit; the chat context rail appears only when the conversation container can support it.
- System Administrator user, department, retention, disaster-recovery, conformance, and archive pages use desktop tables at 1200 px and accessible evidence cards below that width. Long labels and action groups wrap without clipping.
- Audit logs and assessment evidence use the same 1200 px table tier and retain the full record, hash, decision, and action evidence in their narrower card views.
- `messages/en.json` and the dormant parity catalogue in `messages/bn.json` add the pending sign-out label. Sign out is visually destructive without looking like a failure, disables duplicate submission, shows a spinner, and announces progress.
- `e2e/frontend-correctness.spec.ts` covers the shared breakpoints, table-scroll ownership, requestor card fallback, outside account-menu dismissal, drawer focus, mobile-to-desktop drawer cleanup, large-screen conversation gap, readable classification labels, and pending sign-out behavior.

## Design decisions

- The 992 px and 1200 px tiers follow the supplied common-breakpoint reference, but the layout uses CSS pixels so browser zoom and high-DPI laptop scaling are handled correctly.
- The product is not globally scaled with `transform` or browser-like zoom. Scaling would blur text, distort hit targets, and preserve the underlying overflow bugs.
- Wide evidence tables keep a local horizontal scrollbar rather than shrinking text to an unreadable size or making the document itself scroll sideways.
- Container queries are used where the sidebar materially changes usable width, especially Requestor review and conversation context, instead of relying only on raw viewport width.
- A global table `max-height` was rejected because it created nested vertical scrollbars and header/row overlap on short laptops.
- Holding desktop tables until 1440 px was rejected because it made ordinary 1280/1366 laptop workspaces look like mobile cards despite having enough usable width.

## Verification

- TypeScript typecheck and ESLint pass.
- Production build passes.
- The complete mocked frontend Playwright suite passes.
- Focused System Administrator, shared shell, pending sign-out, long conversation, Requestor reviewer, and Audit responsive cases pass.
- In-app browser checks covered 1000×700, 1280×600/720, 1536×900, 991×700, and 390×844 states. Sampled pages had no document-level horizontal overflow; any necessary wide-table overflow stayed inside the labelled table region.

## Open items

None in this scope.
