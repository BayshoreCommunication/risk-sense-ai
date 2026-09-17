# 2026-09-17 — Figma alignment, pass 4: every remaining screen

Pass 3 covered scoring, analytics and reports. This pass walks the rest of the
reference frames in `docs/design/figma-frames/`.

## Administrator

**Rule engine (frame 14).** The frame is a card list, not a table. `ContentManager`
gained a `card` layout that keeps every lifecycle action, so a rule now renders as
a coloured icon tile, its name, and a plain-English
`If <condition> then force classification = X` line with its priority. Adds the
frame's closing note about activation taking effect without a restart.

The frame also shows a "Low risk / Medium risk / High risk" pill that nothing in
the model backs — priority is what the rule actually carries, so the pill shows
the priority rather than inventing a risk band.

**Question bank (frame 13).** `ContentManager` gained a `summary` prop for the
frame's counter strip (total, active, retired, sectors covered). Questions render
as cards with their persona and sector tags and their created/updated dates. Adds
the frame's closing note.

**Persona management (frame 11).** Columns now match the frame — name,
departments, sector — with version and status supplied by `ContentManager`. Adds
the frame's note about deactivated personas.

**Scenario library (frame 12).** The frame shows the editor, which is already the
edit dialog. Adds the frame's note about editing creating a new version.

**Training datasets (frame 16).** The counter strip gains an icon and a sub-label
per state, and the frame's reviewer-approval note is shown. Our five counters stay
— `Awaiting activation` and `Rejected or failed` are real lifecycle states that
the frame's four do not cover.

## System administrator

**User and role provisioning (frame 20).** The counter strip is gone; the frame
has none. The table now sits under a "Provisioned users" card header with an icon
tile, the frame's one-line description and the `Provision user` button, and the
access/MFA policy card became the frame's single closing note, carrying the client's
comment 46/51/52 wording.

**Disaster recovery (frame 23).** Target cards lead with a tinted icon tile and
the metric, as the frame does. The frame's "Drill history" table is **not** built:
ISS-023 records that the application stores current operator-attested state, not a
historical exercise feed, and that a source and API contract must be approved
first. Inventing those rows would fabricate evidence.

## Audit

**Audit log viewer (frame 30).** The scope badge became the frame's
"Read-only, tamper-evident" pill with a shield, and the frame's closing note about
no role being able to edit or delete audit records is shown. The log keeps five
columns, not the frame's four, because client comment 55 asked for log size.

## Requestor and authentication

**Requestor dashboard (frame 00, right).** Adds the frame's closing note about
filter scope.

**Login (frame 00, left).** The right-hand panel rendered the same eyebrow twice;
one is removed. The panel is now the frame's blue field rather than near-black,
with the accents adjusted to match.

**Persona and scenario selection (frame 01).** Left as it is, deliberately. The
frame is a three-card scenario picker; ours is a free-text intake from which the
assistant proposes the persona, which is FR-04 and the product's actual flow.
Matching the frame here would remove the intake the rest of the pipeline depends
on. The header, copy and chips already follow the frame.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**.
- Rendered `/system/users` at 1920 wide against mocked APIs and compared it to
  frame 20.

Three assertions follow the new presentation rather than being weakened: the two
rule lifecycle specs locate rules as cards by name instead of table rows by key,
and the dataset counters are addressed through a `data-counter` attribute.

## Follow-up: the monthly classification chart

The owner asked for the chart to look better. Three real problems, not taste:

- **Every column drew a full-height outlined box.** The month container was
  `h-full` with `border-x border-t`, so an empty bordered rectangle sat above each
  stack. The stack is now its own element sized to the month's share of the
  maximum, with the rounded top and shadow on it, and the container only aligns it
  to the baseline.
- **Segment heights were a share of the chart maximum, not of the month.** Inside
  a stack sized to the month, each segment is now a share of that month's total,
  which is what a stacked bar means.
- **Selecting a classification dropped everything else to 0.2 opacity**, which read
  as washed-out rather than filtered, and unselected months sat at 0.72 so nothing
  looked saturated. Unselected months are now full strength and a dimmed segment
  sits at 0.45.

Also adds the legend the frame shows, below the month labels and dimmed in step
with the selection, a soft vertical gradient and inner highlight per segment, and
narrower bars with wider gaps.
