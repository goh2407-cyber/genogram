# 任務 6 拆檔驗證（2026-09-13）

- 起點：`962f045`；分支：`codex/split-modules`。
- 僅搬移方法與其原註解；constructor、static、accessor、render、DOMContentLoaded 啟動碼保留。
- 以 AST 邊界逐一比對：所有方法的簽名與本體逐字相等；原檔剩餘文字等於拆前原文僅刪除搬移區塊。
- 新 mixin 的 `use strict` 保留原 class 方法的嚴格模式；方法間僅增加物件語法所需的逗號。
- 原檔實際行數為 app.js 2,200、canvas.js 3,301；依明列方法範圍拆分，未為估計行數額外搬移其他核心區塊。
- marchingSquares、chaikin、simplifyClosed、dedupePath、pointInPolygon 為 static，依硬性限制保留；同住框的一般輪廓 helper 一起搬移。
- 三份 HTML 載入順序一致；geno 本地字型與 jsPDF 保留。geno/index.html 與 refactor/app 為 gitignored 本機副本。

## grep 方法清單證據

使用 ripgrep（`rg`）從原始文字擷取方法宣告，拆前讀 `git show 962f045:js/app.js`／`canvas.js`，拆後讀原檔加各自的新 mixin（不含既有 canvas-export.js）。
擷取命令如下；輸出修剪前方空白後排序，比對完整清單與數量，並用 AST 方法清單交叉確認。

```text
rg --pcre2 --only-matching '^    (?:(?:async|static|get|set) )*[$A-Za-z_][$\w]*(?=\()'
```

下列每個名稱均已在拆前、拆後清單各找到一次（getter/setter 以 get/set 區別）：

### app: 193 → 193

```text
_readExportPrefs
_syncExportHeaderFields
_syncPersonMap
_writeExportPrefs
addHouseholdMember
addPerson
adjustSelectedPersonLabel
applyPreviewedLayout
applyResponsiveInspector
async clearLocalData
async copyImageToClipboard
async downloadFile
async exportJPEG
async exportPDF
async exportPNG
async exportSVG
async handleExportFormat
async handleLoadClick
async loadFromFile
async openRecentEntry
async openWithPicker
async renderRecentFiles
async saveToFile
async showOpenFileModal
autoLayoutByGeneration
autoSave
beginPinch
beginPlacement
beginPropertyEditSession
beginQuickParentPlacement
beginQuickRelativePlacement
bindLabelJoystickKnob
bindLabelPopoverDrag
bindPropertyEdit
cacheElements
cancelInteraction
cancelLifeCircle
cancelPlacement
cancelPreviewedLayout
cancelPropertyEditSession
cancelRelationshipWorkflow
centerParentsAboveChildren
clearAll
clearAllSelections
clearRecentRelationshipTypesUI
closeChildrenModal
closeCompactInspectorOverlay
closeExportModal
closeGenderModal
closeHelpModal
closeOpenFileModal
closeRelationshipModal
commitPlacement
commitPropertyEditSession
computeDragSnap
confirmChildrenSelection
constructor
createChildForPerson
createHousehold
createParentsForPerson
createPersonWithGeneration
createQuickPersonWithGender
createRelationship
createTwinSettingsElement
deidentifyHeader
deleteSelected
enforceLocalRules
ensureViewOption
exportJSON
findNearestOpenCell
findQuickParentPairChildAdjustment
findQuickParentPairPlacement
findSpouse
finishLifeCircle
fitToView
focusPropertyInput
getCurrentCanvasFontText
getDocumentExtra
getExportDataset
getFamilyRelationshipIdsForDeletion
getFullSiblings
getGenerationAbove
getGenerationBelow
getGenerationIndexByY
getGenerationStringByIndex
getGenerationYByIndex
getHouseholdAt
getKinshipEngine
getLabelPopoverAnchorBounds
getLifeCircleAt
getLifeCircleVertexAt
getMultiSelectionBounds
getNextLifeCircleColor
getParentIdsForChild
getPersonAt
getPersonLabelAt
getPlacementCandidate
getRecentRelationshipTypes
getRelationshipAt
getRelationshipSplit
getSiblings
getSpouseIds
getSpouses
getState
handleDoubleClick
handleKeyDown
handlePointerDown
handlePointerMove
handlePointerUp
handleQuickAddClick
handleRelationshipTypeButton
handleWheel
hasParentChildLink
hasSignificantPositionChange
init
isCompactInspector
isEditableTarget
isPointInPolygon
isPointInsideMultiSelection
isQuickParentPairSafe
isValidSpacing
loadAutoSave
loadData
locateIdentifiedPatient
markDirty
normalizeLoadedFamilyRelationships
normalizeParentChildDirection
openHelpModal
pickSpouseForChildCreation
previewAutoLayout
readExportHeaderSettings
recordRecentRelationshipType
redo
refreshPersonAgeFields
removeHouseholdMember
render
renderRecentRelationshipTypes
renderRelationshipLegend
requestRender
resetSelectedPersonLabel
resetTransientStateForHistory
resetZoom
saveState
selectPerson
selectRelationship
setAgeReferenceDate
setCompactInspectorOpen
setDocumentMeta
setInspectorCollapsed
setInspectorTab
setLinkTypeById
setPropertyPanelTemplate
setRouteLiftById
setRouteModeById
setSelectedPersonLabelOffset
setTool
setViewOption
setupEventListeners
setupLabelPositionPopover
setupModalManager
setupPropertyFormEvents
showChildrenModal
showExportModal
showGenderModal
showRelationshipEditModal
showRelationshipModal
snapToGrid
static ageBand
static ellipsePoints
static formatLocalDate
static formatRecentTime
static nearestSegmentIndex
static normalizeDocumentMeta
swapRelationshipDirection
swapRelationshipDirectionById
undo
updateBoxSelection
updateCursor
updateDocumentTitle
updateInspectorToggle
updateLabelPositionPopover
updatePinch
updatePlacement
updatePropertyPanel
updateRelationshipType
updateRoutingWarning
updateStatus
updateToolbar
updateZoomDisplay
validateMarriageRelationship
waitForCurrentCanvasFonts
zoom
zoomStep
```

### canvas: 143 → 143

```text
_beginDecorationStroke
_bridgeGeometry
_buildFamilyGroups
_calculateContentBounds
_drawFamilyPlan
_drawLossSymbol
_drawSingleLifeCircle
_editButtonAnchor
_editButtonGeom
_getBridgeMarriageCandidates
_getDerivedGeometrySignature
_getFamilyLinkDash
_getFamilyOccupiedSegments
_getFamilyPlanCacheSignature
_getFamilyRouteSignature
_getFamilySource
_getPlannedFamilyRelationshipPath
_getRelevantFamilyRouteObstacles
_getRouteObstacleSignature
_householdSpanningEdges
_labelBottomY
_labelPlacementCandidates
_marriageCandidateScore
_marriageCorridorObstacles
_pathHitsRect
_pathSampleStep
_placeLabelsForForcedStraight
_placeLabelsForRelationshipRoutes
_prepareMarriageRoutes
_rasterOutline
_rectsOverlap
_refreshLabelRouteWarnings
_routeAroundObstacles
_routeButtonCenters
_strokeFamilyPolyline
_underMarriageCandidates
applyTransform
buildSmoothClosedPath
clear
clearTextWidthCache
constructor
distanceToLineSegment
distanceToSegment
drawAlignmentGuides
drawArrow
drawArrowAtPathEnd
drawDivorceSlash
drawDoubleLine
drawDoubleSlash
drawEllipsePreview
drawEmotionalDecorations
drawFamilies
drawGrid
drawHouse
drawHouseholds
drawLifeCirclePreview
drawLifeCircles
drawMarriagePath
drawMedicalSymbols
drawMultiSelectionBounds
drawParallelPath
drawPatternOnPath
drawPerson
drawPersonText
drawPlacementCell
drawPlacementPreview
drawQuickAddButtons
drawQuickButtonGlyph
drawRelationship
drawRelationshipDate
drawRelationshipEditButton
drawRelationshipRouteButtons
drawSelectionBadge
drawSelectionBox
drawSexualOrientationMarker
drawSlash
drawSmoothClosedPath
drawStandardLine
drawStripes
drawSubPath
drawTripleLine
drawTwinConnector
drawWaveLine
drawWaveOnPath
drawX
drawZigzagLine
drawZigzagOnPath
findSafeFamilyRouteAdjustment
get labelRoutingWarnings
getConcaveHull
getContentBounds
getConvexHull
getFamilyRoutePlans
getHouseholdBounds
getLegendRenderItem
getLegendRenderSections
getLineDash
getMarriageBarAt
getMarriageConfiguration
getMarriageGeometry
getMarriageRoute
getMousePos
getPathLength
getPersonLabelGeometry
getPersonRouteObstacles
getPersonTextLayout
getPointAtDistance
getPointInfoAtDistance
getQuickButtonAt
getQuickButtonLayout
getRelationshipPath
getRouteButtonModeAt
getSmartPath
getSymbolRouteObstacles
getVisibleExportData
hudUnit
invalidateDerivedGeometry
isPointInQuickAddZone
isPointOnEditButton
isPointOnHouseholdBoundary
isPointOnLifeCircleEdge
isPointOnRelationship
isPointOnSwapButton
lifeCircleStrokeColor
lodNameFactor
measureTextWidth
normalizeViewOptions
prepareDerivedGeometry
render
resize
roundRect
screenToCanvas
segmentsIntersect
set labelRoutingWarnings
setScale
setupResizeObserver
static chaikin
static dedupePath
static get DRAW_PERSON_STYLES
static lifeCircleLabelAnchor
static marchingSquares
static pointInPolygon
static simplifyClosed
```

## 檔案行數

| 檔案 | 行數 |
| --- | ---: |
| js/app-hittest.js | 204 |
| js/app-io.js | 897 |
| js/app-pointer.js | 1283 |
| js/app-property-panel.js | 832 |
| js/app-quick-add.js | 654 |
| js/app-relationship-workflow.js | 653 |
| js/app-snap-placement.js | 674 |
| js/app.js | 2200 |
| js/canvas-decorations.js | 876 |
| js/canvas-family.js | 268 |
| js/canvas-household.js | 780 |
| js/canvas-marriage.js | 512 |
| js/canvas.js | 3301 |

## 驗證結果

- `node refactor/run_all.js`：47/47 通過，含 verify_script_order、verify_mirror_sync、verify_geno_deploy。
- 原有 golden 測試：16/16 通過，每張 diffPixels=0；未重建或修改任何 baseline。
- 無容差 RGBA 額外稽核：原始隨機 fixture 的 09-twins 有 4 像素差 1 色階。以原始 962f045 與拆檔版固定相同 Date.now、Math.random 後，16 張拆前／拆後 RGBA 完全一致（0 差異像素）。固定資料僅用於本機額外稽核，正式測試與基準圖不變。
- 方法清單：App 193/193、Canvas 143/143；包含 constructor、static 與 getter/setter。
- 方法簽名、本體與原註解逐字保留；既有行尾空白依原文保留。
- `node refactor/sync_mirrors.js` 最後同步：49 個檔案已一致，0 個需複製；geno HTML 僅資產路徑差異。
