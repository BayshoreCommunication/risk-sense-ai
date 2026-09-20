# Restore the collapsible desktop sidebar

Requirements: DASH-04, NFR-07, NFR-08

## What changed

- `components/shell/AppShell.tsx` restores the desktop collapse/expand state and the previous `rs_sidebar_collapsed` browser preference while returning the expanded rail to its earlier 16rem width. The current navigation content, visual styling and account menu remain intact.
- The compact state reduces the desktop rail to 4.5rem, keeps every destination keyboard- and screen-reader-accessible with focus/hover tooltips, replaces the advanced heading with a divider, and moves the page offset with the rail using synchronized reduced-motion-aware transitions.
- The localized toggle remains at the header/rail junction, exposes its state through `aria-expanded`, and controls the labelled desktop navigation region.
- Mobile navigation remains a full-width labelled modal drawer with its existing focus trap, Escape handling, inert background and focus return. A saved desktop compact preference does not compact the mobile drawer.
- `e2e/frontend-correctness.spec.ts` extends the existing navigation regression without increasing the test inventory. It covers desktop collapse, content reflow, local-storage persistence, reload restoration, expansion, mobile label preservation and focus containment.

## Why

The Figma-parity shell revision removed the earlier desktop collapse behavior and widened the rail to 19.5rem. The requested interaction is restored while the expanded rail returns to its earlier, less dominant 16rem footprint.

## Alternatives rejected

- Restoring the historical sidebar markup was rejected because it would also restore obsolete spacing, account controls and navigation presentation.
- Applying the compact state to the mobile drawer was rejected because it would remove the drawer's visible labels and weaken its task-oriented navigation.
- Using a new storage key was rejected because the request asked for the previous behavior, including the existing browser preference.

## How to verify

1. Run `npm run lint` and `npm run typecheck`.
2. Run the requirement-labelled desktop/mobile navigation case in `e2e/frontend-correctness.spec.ts`.
3. Run `CI=1 npm run e2e:frontend` and `npm run build`.
4. At a desktop width, collapse the sidebar, reload, confirm it stays compact, expand it, and confirm the current open design returns unchanged. At a mobile width, confirm the drawer still shows all labels and traps focus.
