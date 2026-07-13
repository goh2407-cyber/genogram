# Task 2 Report — Premium Clinical Workspace Shell

Status: **DONE_WITH_CONCERNS**

## Task 1 RED baseline

Contract commits present before implementation:

- `f7b89ba test: define clinical workspace UI contract`
- `459c505 test: strengthen UI shell prerequisites`
- `33c159e test: require labels for icon-only commands`

Observed RED command:

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_ui_shell.js
```

The baseline retained all existing command IDs and had zero page/console errors, but failed because `#globalBar`, `#canvasToolDock`, `#inspectorPanel`, `#inspectorToggle`, all three inspector tabs, inspector sizing/collapse behavior, and icon-only accessible labels were absent.

## Implementation

Commit: `9730529 feat: build premium clinical workspace shell`

Modified only the requested root production files:

- `index.html`
- `css/styles.css`
- `js/app.js`

`refactor/verify_ui_shell.js` was not changed or weakened. No `geno/` or `refactor/app/` copy was modified.

Implemented the global bar, drawing dock, stable inspector containers/tabs, inspector collapse state, responsive behavior, accessible names/focus treatment, reduced-motion behavior, and the approved clinical workspace tokens. Existing Logo, command IDs/listeners, clinical canvas semantics, relationship variables, and legend line data remain intact.

## GREEN and verification evidence

Fresh combined command:

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_ui_shell.js
node refactor/smoke_visual.js
node refactor/visual_golden.js
```

Results:

- `verify_ui_shell.js`: PASS, every contract item including width/collapse/accessibility; zero console/page errors.
- `smoke_visual.js`: `SMOKE OK`; screenshots generated; visual inspection showed the shell, dock, canvas, inspector, and property controls without overlap or clipping.
- `visual_golden.js`: 15/16 fixtures have `diffPixels=0`; `09-twins` has a stable `diffPixels=183`, so the command exits 1.

## Concern / blocker

The only blocker is fixture `09-twins`. Its 183 differing pixels are confined to rasterization of the four `卵` glyphs in labels `異卵A`, `異卵B`, `同卵A`, and `同卵B`; geometry, symbols, lines, colors, viewport, and every other fixture match exactly. Two repeated runs produced the same 183-pixel result.

Diagnostic comparison against detached pre-implementation `HEAD` (`33c159e`) using the same committed golden baseline produced 16/16 `diffPixels=0`. This proves the drift is triggered by the new shell rather than a stale baseline alone. Network inspection showed that restructuring the default-visible inspector content changes which unicode-range Noto Sans TC WOFF2 subsets the browser requests. Attempts to preserve hidden legend layout/font loading through `visibility` or `opacity` did not resolve it and were reverted. The golden baseline and test were not updated.

Per the hard gate, this report does not claim full GREEN. A focused follow-up should stabilize font subset loading/rasterization without changing canvas semantics or the golden baseline.

## Self-review

- `git diff --check`: clean before commit.
- Functional IDs and event listeners remain unique and operational.
- Inspector preferences are UI-only and are not serialized into genogram JSON.
- No relationship color variable or `.legend-line` background was modified.
- No unrequested framework, renderer, bundler, or bitmap path was introduced.
