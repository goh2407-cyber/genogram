# Task 4 Report — Screen / export / editor integration contracts

## Scope completed

- Added export restoration coverage for canonical marriage-route entries (`points`,
  `attachmentSegment`, decoration), label-placement entries, and family-plan route
  identities after PNG, JPEG, and an injected PNG drawing failure.
- Added relationship-edge coverage for explicit `straight`, `over`, `under`, and
  auto-with-blocker.  It verifies canonical path identity for hit-testing, edit-pencil
  hit-testing, and date translation; auto excludes the bottom-under candidates.
- Added the standard relationship-routing release gate row to `refactor/TEST_GATES.md`.
- Review follow-up: auto-with-blocker now requires a named top-bridge candidate and every
  route point to remain at or above its endpoint row.  The pencil contract now records both
  `_editButtonGeom` calls (draw and hit) and requires their input path and computed anchor
  to lie on the canonical marriage route.

## TDD record

- RED: `NODE_PATH=... node refactor/verify_view_export.js` failed the new
  `PNG export preserves canonical route, label, and family-plan cache entries` check
  because the initial snapshot did not include those entries.
- GREEN: after extending only the contract snapshot/comparison, the export gate passes.
- RED: `NODE_PATH=... node refactor/verify_relationship_edges.js` failed the new
  four-mode canonical-route check before its test scenario/assertions were implemented.
- GREEN: the completed scenario passes all five new mode/canonical assertions.
- Review RED: the new auto top-bridge assertion failed before the route-point and candidate
  requirements were connected; the new pencil-anchor assertion failed before canonical
  edit-geometry calls were captured.  Both pass after the contract-only implementation.

## Verification (all with `NODE_PATH` set to the bundled Playwright paths)

- `node refactor/verify_view_export.js` — PASS (16 checks)
- `node refactor/verify_relationship_edges.js` — PASS (22/22, zero console/page errors)
- `node refactor/verify_view_rendering.js` — PASS
- `node refactor/verify_fixes.js` — PASS
- `node refactor/smoke_visual.js` — PASS; screenshots produced, zero reported errors
- `git diff --check` — PASS

## Scope / concerns

- No production routing code, clinical styles, schema/history behavior, or golden baselines
  were changed.
- The pre-existing user-owned `refactor/visual_golden.js` fixture-17 modification remains
  unstaged and untouched.
- Commit: `2a4801e test: cover standard relationship routing across views`.
