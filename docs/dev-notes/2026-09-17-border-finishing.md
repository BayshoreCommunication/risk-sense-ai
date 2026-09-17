# 2026-09-17 — Border and elevation finishing

The owner reported that borders across the app did not finish cleanly. Three
separate causes, all real:

## A blue hairline across every metric tile

`StatTile` drew `absolute inset-x-0 top-0 h-px bg-primary/45` — a blue rule above
each tile. On the four-across layout it read as a stray line above the metric row,
and once the grid wrapped to two columns it also cut across the middle of the
group. Removed.

## Metric tile borders could not wrap

The tiles carried `border-y border-r … first:border-l` inside a
`grid overflow-hidden rounded-xl` container. `first:border-l` only applies to the
first tile, so the first tile of every later row had no left edge. The container
now draws the frame and the dividers with the `gap-px` + `bg-border` pattern
already used by the question-bank and dataset counters, which wraps correctly at
any column count. `StatTile` is a plain `bg-card` cell.

## Seven border tints and twelve shadows

Structural edges were written as `border-border/60`, `/65`, `/70`, `/75`, `/80`,
`/85` and `/90` — arbitrary values that made neighbouring panels look subtly
mismatched. They all collapse to the `border` token.

Elevation had twelve distinct values. Card-like surfaces now use two:
`0 1px 2px rgba(15,35,65,0.05)` at rest and `0 10px 28px rgba(15,35,65,0.05)` when
lifted. `.surface`, `.data-panel` and `.control-strip` share the resting one, so a
panel no longer changes weight depending on which utility built it. Shadows that
are not card elevation — the login card, the dark top bar's hairline, the slider
thumb, the collapse handle — are left alone.

## Collapse handle moved to the top

The handle sat on the footer joint; the owner asked for the top of the rail. A
child of the rail is clipped there: the rail is a `z-40` stacking context and the
top bar is `z-50`, so the circle rendered as a half-circle behind the bar. The
handle is now a sibling of both at `z-50`, pinned with `fixed` to the junction of
the top bar and the rail's edge, and its `left` follows the collapsed width.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**.
- Rendered `/admin/analytics` at 1440 wide and inspected the metric row, the card
  edges and the handle.
