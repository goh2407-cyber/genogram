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

## Focused systematic-debugging follow-up (2026-07-13)

Status: **GREEN**

### Phase 1 — reproduction and evidence

Fresh reproduction on `9730529` was stable: `09-twins diffPixels=183`; all other 15 fixtures were zero. A detached `33c159e` worktree remained 16/16 zero. The recent diff did not change `GenogramCanvas.fontFamily` (`Noto Sans TC, sans-serif`) or the 14px canvas name font; it changed the formerly visible legend into a default-hidden inspector tab.

Same Chromium/session diagnostics showed both commits had identical computed body font, Canvas font, `document.fonts.status=loaded`, `document.fonts.check(..., '異卵A')=true`, and identical text metrics. The decisive difference was unicode-range face/request state: `33c159e` had 64 loaded Noto faces before fixture construction and requested subsets including `.106`, `.108`, and `.109`; `9730529` had only 48 loaded faces before construction and never requested those three because the legend subtree was hidden. After the fixture's synchronous `app.render()`, the implementation initiated four more faces but Canvas retained its already-painted fallback glyph because Canvas does not auto-repaint when a webfont finishes. Pixel inspection localized all 183 differences to the four `卵` glyphs.

### Phase 2/3 — pattern and single hypothesis

Hypothesis: hiding the previously visible legend removed its incidental Noto unicode-range warm-up, so `卵` was painted with fallback before its subset arrived and was never repainted. Minimal hypothesis test explicitly awaited `document.fonts.load('14px "Noto Sans TC"', '異卵A異卵B同卵A同卵B')` and rendered once more; `09-twins` changed from 183 to 0 while every fixture stayed zero. This confirmed the font-loading boundary, not Canvas geometry, clinical symbols, line colors, or golden data.

A broad `loadingdone` listener was rejected during narrowing: it fixed `09-twins` but unnecessarily repainted all late font batches and caused `01-symbols diffPixels=54`. The final fix therefore restores only the pre-shell legend warm-up contract.

### Phase 4 — regression and production fix

Added `refactor/verify_canvas_font.js`, which delays real WOFF2 responses, draws a Canvas glyph with fallback, releases the fonts, and requires the automatic post-warm-up repaint to pixel-match an explicit reference repaint.

RED before production change:

```text
FAIL | Canvas did not repaint after webfont loading completed
```

Single production fix in `js/app.js`: explicitly call `document.fonts.load()` with the hidden legend's existing text and render once when that warm-up promise completes. The ignored `geno/js/app.js` and `refactor/app/js/app.js` copies were synchronized to preserve the three-copy invariant. No golden baseline, threshold, clinical symbol, relationship color, or Canvas font definition changed.

GREEN after production change:

```text
PASS | Canvas repaints after unicode-range webfont loading
```

### Fresh final verification

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_ui_shell.js
node refactor/smoke_visual.js
node refactor/visual_golden.js
node refactor/verify_canvas_font.js
```

Results:

- `verify_ui_shell.js`: all checks passed; zero console/page errors.
- `smoke_visual.js`: `SMOKE OK`.
- `visual_golden.js`: 16 fixtures, 0 failed; `09-twins diffPixels=0` and every other fixture `diffPixels=0`.
- `verify_canvas_font.js`: PASS.

## Self-review

- `git diff --check`: clean before commit.
- Functional IDs and event listeners remain unique and operational.
- Inspector preferences are UI-only and are not serialized into genogram JSON.
- No relationship color variable or `.legend-line` background was modified.
- No unrequested framework, renderer, bundler, or bitmap path was introduced.
