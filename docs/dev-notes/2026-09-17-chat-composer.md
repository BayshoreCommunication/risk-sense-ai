# 2026-09-17 — Chat composer

The owner asked for the AI chat box to look better. Both composers now read as a
single surface rather than a field with a button floating over it.

## Intake (`/chat`)

The textarea sat on the card with a "0 characters" chip pinned inside it and the
submit button in the other column, under the persona list — so the thing you type
into and the thing that starts the assessment were not visually related.

The field, its character count and `Start` now share one rounded frame with a focus
ring on `focus-within`, and the button moved out of the persona column. The persona
list grew from `max-h-64` to `22rem` so it stops cutting the third card mid-row.

## Session (`/chat/[id]`)

The free-text answer box had the send button absolutely positioned over the
textarea, which forced `pr-24` padding and cropped long answers behind it. It now
has the same framed composer: the field, a keyboard hint and `Send` in a footer row.
`chatSession.answer.enterHint` is the new string in both catalogues.

Behaviour is unchanged — Enter still sends, Shift + Enter still inserts a newline,
and the composer keeps its `data-testid`, so the FR-06 / NFR-01 specs that drive it
are untouched.

## Verification

- `npm run typecheck`, `npm run lint` — clean.
- `npm run e2e:frontend` — **45 passed**, including the composer specs.
- Rendered `/chat` at 1440×900: the window does not scroll and `main` does not
  overflow.
