# 2026-09-17 — Everything inside the viewport, tables scroll internally

The owner asked that a screen fit the window so the page never has to be scrolled
down, with tables scrolling inside themselves, and then that the sizing be dynamic
and fully responsive rather than a fixed guess.

## The layout

`main` is exactly `100dvh` minus the 3.5rem top bar and hides its overflow, so the
window cannot scroll. `.page-shell` fills it as a flex column and scrolls its own
content, so a page that is genuinely taller than the window — a long settings form —
still works, and the top bar, the rail and the sign-out row never move.

Because `main` now hides overflow, every page root had to be a `.page-shell`, or it
would have been clipped rather than scrolled. Five roots were converted: personas,
the scenario library, the question bank, the rule engine and user provisioning.

A `.fills` utility marks the region that should absorb whatever height is left:

```css
.fills { @apply flex min-h-0 flex-1 flex-col [&_[data-slot=table-container]]:max-h-full; }
```

`ContentManager` and the bespoke table panels use it, so the list takes exactly the
space the page header and any counter strip leave over. Nothing is computed from a
magic number — the browser does it, at whatever window size.

## The table primitive

`components/ui/table.tsx` now owns table scrolling: the container is the single
scroller (`overflow-auto`) and `TableHeader` is `sticky top-0` on an opaque
background, so column headings stay while rows move.

Pages had wrapped `<Table>` in their own `overflow-x-auto`, which made a second
scroll container nested inside the table's own. That is what clipped the first
column on the audit assessments screen — the outer box scrolled right and cut the
timestamps. Those wrappers are gone from eight pages.

Outside a `.fills` region the container keeps a viewport-derived cap,
`max(16rem, calc(100dvh - 26rem))`, so a table on a page that has not been converted
still cannot run past the window.

## Measured

`document.documentElement.scrollHeight`, `main` overflow and `.page-shell` overflow,
at three window sizes:

| Screen | 1440×820 | 1280×720 | 1920×1080 |
|---|---|---|---|
| `/admin/scenarios` | fits | fits | fits |
| `/admin/questions` | fits | fits | fits |
| `/admin/rules` | fits | fits | fits |
| `/system/users` | fits | fits | fits |
| `/system/retention` | fits | fits | fits |

"Fits" means the window does not scroll and neither `main` nor the page shell
overflows by a single pixel; only the table scrolls.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**, including the mobile overflow and
  focus-trap assertions.
