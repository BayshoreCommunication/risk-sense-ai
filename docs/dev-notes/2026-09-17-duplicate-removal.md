# 2026-09-17 — Removing duplicate and semi-duplicate UI

The owner asked for anything duplicated or half-duplicated across the app to go,
keeping only what is actually needed, and separately noted that the System
Administrator area carried more screens than its frames show.

## Removed because the same thing appeared twice

- **`/admin` "Operational tools"** — three links to Analytics, Standard reports and
  Mandatory review. All three are sidebar entries, and no frame shows the strip.
  The `reportsEnabled` state that gated it went with it; the sidebar gates those
  entries from `/me` itself.
- **`/admin` metric card footers** — each card repeated a sentence describing the
  area the card title and the sidebar already name.
- **`/admin/reports`** listed the four reports twice: an index row per report with
  a fixed-window export, then the same four as panels with a view toggle and a
  filter-aware export. The index is gone; the panels carry the frame's "each report
  with CSV and PDF" and add what comment 50 asked for.
- **`/audit` header links** to the log viewer and assessments — both are sidebar
  entries, and the page already links to each in context through "View all".
- **Key columns** on the scenario library and the scoring version list. The name
  identifies the row; the key is internal and still shown as an immutable field in
  the edit dialog.
- **`/admin/scoring` "Approved" column** — a yes/no beside a status column that
  already reads `approved`.
- **Plan badge** on the retention and tenant page headers — the sidebar footer
  shows the plan on every screen.

## System Administrator

The frames give this role four entries: user provisioning, SSO and integration,
retention policy and disaster recovery. We had eight.

- **`/system` landing removed.** It was a list of links to the same screens the
  sidebar lists. It carried a `DASH-04` tag, but `DASH-04` in
  `docs/ai/BusinessRules.md` is about requestor review visibility scope, not a
  system dashboard — the tag was loose. `/system` now redirects to
  `/system/users`, which is where the frames' navigation starts, and `ROLE_HOME`
  points there. The `system.overview` copy and the `nav` label were retired.
- **Departments, Conformance and Audit archive stay.** They have no frame but they
  are FR-10, FR-30 and FR-26/SEC-06 respectively, so the owner's "keep it if a
  requirement needs it" applies. They remain grouped under Advanced operations.

## Avatar

`initials()` returned up to two letters. Avatars now show the first letter of the
account name in a round badge, in the sidebar footer and in the header identity
pill; the pill's separator dot went with the second letter.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run e2e:frontend` — **46 passed**.

Two assertions follow the changes rather than being weakened: the reports spec
counts the four CSV and PDF buttons on the report panels instead of the removed
index, and the system landing spec now checks that `/system` redirects to user
provisioning and that the rail exposes all seven workspaces.

Both catalogues stay in sync at 1,316 strings.

---

## Follow-up: Audit, and keeping the window unscrolled

### Audit

The frame gives this role one screen. Section 8 of `docs/ai/BusinessRules.md` has
four rules and none of them asks for a dashboard:

- 8.1 append-only log and 8.3 hash-chained, no update/delete path → `/audit/logs`.
- 8.2 reconstruction, integrity and stored-record comparison (FR-25/26, FR-30) →
  `/audit/assessments`, so that screen **stays**.
- 8.4 bounded export with a SHA-256 manifest → the system administrator's audit
  archive, which is a different role.

The `/audit` overview had no rule behind it and no frame, so it is gone. `/audit`
redirects to `/audit/logs`, `ROLE_HOME.audit` points there, and the `audit.overview`
copy and nav label were retired. Both catalogues stay in sync at 1,294 strings.

### The window no longer scrolls

`main` is now exactly the viewport below the top bar and scrolls its own content,
so the top bar, the rail and the sign-out row stay put on every screen. It is
`overflow-y-auto`, not `overflow-hidden`: several pages do not use `.page-shell`
as their root, and hiding the overflow would have clipped them instead of
scrolling.

On top of that, `ContentManager` caps its list at `min(62vh, 42rem)` and scrolls it
internally with a sticky column header, so the page title, the filter and the New
button stay on screen no matter how long the list is. Verified on a 13-row scenario
library at 1440×820: `document.documentElement.scrollHeight` equals
`window.innerHeight`, so the window itself does not scroll at all.
