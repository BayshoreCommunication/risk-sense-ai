# 2026-09-17 — Sidebar rework

Owner request: a collapsible rail (labels when open, icons when closed), clearer
colours, no role heading, English-only for now so no language toggle, and a
sign-out that reads as an action. A shadcn sidebar was given as a second
reference alongside the Figma frames.

## Collapse

`components/shell/AppShell.tsx` holds a `collapsed` flag, remembered in
`localStorage` under `rs_sidebar_collapsed`. Reads and writes are wrapped in
try/catch: private mode and blocked storage must not break the shell, and the
expanded default stands when storage is unavailable.

Collapsed the rail is `4.5rem` and shows icons only, each carrying a `title` and
an `sr-only` label so pointer and screen-reader users both keep the name. Expanded
it is `16rem` — the earlier `19rem` was wider than the labels need. The mobile
drawer always shows labels; collapsing applies from `lg` up. The toggle is a
`PanelLeft` button at the top of the rail, as the shadcn reference places it.

**Layout transitions were removed on purpose.** Animating the content wrapper's
padding animates the document width, and a width measurement taken right after a
viewport change then races the transition — that is exactly what the NFR-08
mobile-overflow assertion in `frontend-correctness.spec.ts` caught. Only the fixed
rail may animate, and it does not contribute to document width.

## Colour

The rail was `oklch(0.995 0.002 250)` against a `0.978` page: all but identical.
The rail is now white, the page slightly deeper at `0.968`, and the rail border
stronger. Inactive item text moved from `/62` to `/80` and icons from `/38` to
`/60`, so the list reads without hovering.

## Removed

- The `{role} workspace` heading above the navigation.
- The English/বাংলা switcher. `i18n/request.ts` no longer resolves a locale from
  `Accept-Language` either, so a Bangla browser no longer flips the workspace on
  its own; only an explicit `rs_locale` cookie does. `messages/bn.json` stays
  complete and in sync for when the switcher comes back.

## Sign out

Was an unlabelled icon button beside the language switcher. It is now a
full-width row with the icon and the words "Sign out", turning destructive on
hover, directly under the identity row; collapsed it falls back to the icon with
its title and `aria-label`.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**, including the mobile focus-trap and
  overflow assertions.
- Captured the rail open and collapsed at 1280 wide against mocked APIs.
