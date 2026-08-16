import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function render(context) {
  const port = await freePort();
  const processHandle = spawn(process.execPath, ["dist/standalone/server.js"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  processHandle.stdout.on("data", (chunk) => { diagnostics += chunk.toString(); });
  processHandle.stderr.on("data", (chunk) => { diagnostics += chunk.toString(); });
  context.after(() => processHandle.kill());

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`Server exited early.\n${diagnostics}`);
    try {
      return await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not become ready.\n${diagnostics}`);
}

test("renders the focused intersection editor", async (context) => {
  const response = await render(context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  for (const label of ["Перекрёсток", "Заготовки", "Полосы", "Участки", "Разметка", "Ответвление", "Разрыв линии", "Экспорт SVG"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /Печать \/ PDF/i);
});

test("contains lane-level geometry and the Russian marking catalog", async () => {
  const [model, geometry, canvas, page, dockerfile, compose] = await Promise.all([
    readFile(new URL("../app/road-editor/model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/road-editor/geometry.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/road-editor/RoadCanvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
  ]);
  for (const laneType of ["traffic", "tram", "bus", "bike", "median"]) assert.match(model, new RegExp(`"${laneType}"`));
  for (const marking of ["1.1", "1.2", "1.3", "1.5", "1.6", "1.7", "1.8", "1.11", "1.12", "1.14.1", "1.18"]) assert.match(model, new RegExp(marking.replace(".", "\\.")));
  assert.match(canvas, /lanePolygon/);
  assert.match(canvas, /nearestPointOnPolyline/);
  assert.match(canvas, /roadJunctions/);
  assert.match(canvas, /junction\.polygon/);
  assert.match(canvas, /cornerReturnSurfacePath/);
  assert.match(canvas, /cornerReturnMarkingPath/);
  assert.match(canvas, /junctionEdgeMarkingIntervalsForRoad/);
  assert.match(canvas, /junction-asphalt-union/);
  assert.match(canvas, /approachEntrySpans/);
  assert.match(canvas, /const edgeLimit = Math\.max\(0, roadWidth\(road, at\) \/ 2 - EDGE_MARKING_INSET\)/);
  assert.match(canvas, /start: Math\.max\(range\.start \+ 4, -edgeLimit\)/);
  assert.match(canvas, /selected && <DirectionArrow/);
  assert.match(canvas, /lane-direction-preview editor-only/);
  assert.match(canvas, /hostRoad/);
  assert.match(canvas, /EDGE_MARKING_INSET = 11/);
  assert.match(canvas, /asphaltSurface/);
  assert.match(canvas, /fillRule="nonzero"/);
  assert.match(canvas, /road-network-composite/);
  assert.match(canvas, /roadFeatureGeometry/);
  assert.match(canvas, /RoadFeatureArtwork/);
  assert.match(canvas, /road-feature-stop-marking/);
  assert.match(canvas, /stopZigzag/);
  assert.match(canvas, /baseOffsetAt/);
  assert.match(canvas, /feature\.kind !== "transit-stop"/);
  assert.match(canvas, /stop-sign-number/);
  assert.match(canvas, /feature\.kind === "lane-narrowing"/);
  assert.match(canvas, /feature\.kind === "lane-widening"/);
  assert.match(canvas, /transitionPoint/);
  assert.match(canvas, /laneTransition/);
  assert.match(canvas, /road-feature-merge-point/);
  assert.match(canvas, /baseOffsetAt\(distance\) - side/);
  assert.doesNotMatch(canvas, /d=\{geometry\.base\}/);
  assert.match(canvas, /"1\.5": \{ width: 2\.2, dash: "24 17" \}/);
  assert.match(canvas, /const solidOffset = mirrored \? 2\.6 : -2\.6/);
  assert.match(canvas, /mirrored=\{section\.mirrored\}/);
  assert.match(canvas, /shapeRendering="geometricPrecision"/);
  assert.match(geometry, /Math\.max\(9, Math\.min\(\.\.\.junction\.roads\.map\(\(road\) => road\.width\)\) \/ 4\)/);
  assert.match(geometry, /Math\.tan\(sweep \/ 4\)/);
  assert.match(geometry, /corner\.arcRadius \+ inset/);
  assert.match(geometry, /junctionApproachFractionsForRoad/);
  assert.match(geometry, /approach\.baseDistance/);
  assert.match(geometry, /junctionSurfaceFractionsForRoad/);
  assert.match(geometry, /hostNormal/);
  assert.match(geometry, /branchOutward/);
  assert.match(geometry, /junctionBranchClipPolygon/);
  assert.match(canvas, /half-junction-branch-clip/);
  assert.match(canvas, /ClipGroups/);
  assert.match(canvas, /junctionDivisionPointsForRoad/);
  assert.match(canvas, /automaticFractions/);
  assert.match(canvas, /seamlessEnds/);
  assert.match(canvas, /MarkingPointOverlay/);
  assert.match(canvas, /RoadAxisOverlay/);
  assert.match(canvas, /RoadCrossSectionsOverlay/);
  assert.match(canvas, /roadSurfacePolygon/);
  assert.match(canvas, /laneBoundaryPath/);
  assert.match(canvas, /formatPicket/);
  assert.match(canvas, /projectToDirection/);
  assert.match(canvas, /event\.ctrlKey !== event\.shiftKey/);
  assert.match(canvas, /marking-points-overlay editor-only/);
  assert.doesNotMatch(canvas, /junction-curb/);
  assert.match(canvas, /drawing\.sourceAngle/);
  assert.match(canvas, /branch-side-guide/);
  assert.match(canvas, /junctionIntervalsForRoad/);
  assert.match(canvas, /approach\.rule === "stop"/);
  assert.match(canvas, /approach\.rule === "yield"/);
  assert.match(canvas, /drawing\.kind === "branch"/);
  assert.match(model, /JunctionExtent = "half" \| "full"/);
  assert.match(model, /ApproachRule = "priority" \| "yield" \| "stop"/);
  assert.match(model, /interface MarkingSection/);
  assert.match(model, /mirrored: boolean/);
  assert.match(model, /innerMarkingMirrored: boolean/);
  assert.match(model, /RoadFeatureKind/);
  assert.match(model, /interface RoadFeature/);
  assert.match(model, /createRoadFeature/);
  assert.match(model, /features: \[\]/);
  assert.match(model, /innerMarking: LineMarkingId/);
  assert.match(model, /type: "vertex"/);
  assert.match(model, /interface RoadCrossSection/);
  assert.match(model, /roadLaneWidthAt/);
  assert.match(model, /createRoadCrossSection/);
  assert.match(model, /lane-narrowing" \? "1\.5" : "1\.8"/);
  assert.match(model, /source\.version \?\? 1\) < 6/);
  assert.match(model, /TrafficLightPlacement = "none" \| "left" \| "right" \| "both"/);
  assert.match(model, /trafficLightOffset: number/);
  assert.match(model, /version: 16/);
  assert.match(model, /SupportKind = "power-pole" \| "lighting-mast" \| "console-pole"/);
  assert.match(model, /CameraKind = "overview" \| "detector" \| "radar"/);
  assert.match(model, /CameraCableKind = "utp" \| "control"/);
  assert.match(model, /interface CameraCableRoute/);
  assert.match(model, /interface SupportCamera/);
  assert.match(model, /labelOffsetX: number/);
  assert.match(model, /labelOffsetY: number/);
  assert.match(model, /cameraMountOffset: number/);
  assert.match(model, /cameraMountPosition/);
  assert.match(model, /\(count \+ 1\)/);
  assert.match(model, /labelOffsetX: number/);
  assert.match(model, /labelOffsetY: number/);
  assert.match(model, /createSupportCamera/);
  assert.match(model, /createCameraCable/);
  assert.match(model, /cameraCableRoutePoints/);
  assert.match(model, /CAMERA_DEFINITIONS/);
  assert.match(model, /Обзорная камера/);
  assert.match(model, /Детектор фиксации/);
  assert.match(model, /Радарный блок/);
  assert.match(model, /CabinetKind = "control-cabinet"/);
  assert.match(model, /CableKind = "sip" \| "fiber" \| "utp" \| "control"/);
  assert.match(model, /createSupport/);
  assert.match(model, /consoleLength: number/);
  assert.match(model, /cameraSlotsA: number/);
  assert.match(model, /cameraSlotsB: number/);
  assert.match(model, /createCabinet/);
  assert.match(model, /createCable/);
  assert.match(model, /CABLE_DEFINITIONS/);
  assert.match(model, /labelText: string/);
  assert.match(model, /labelAt: number/);
  assert.match(model, /labelOffset: number/);
  assert.match(model, /supports: \[\]/);
  assert.match(model, /cameras: \[\]/);
  assert.match(model, /cameraCables: \[\]/);
  assert.match(model, /cabinets: \[\]/);
  assert.match(model, /cables: \[\]/);
  assert.match(model, /drivingSide: "right"/);
  assert.match(model, /const lanes = \[createLane\("forward"\), createLane\("forward"\), createLane\("backward"\), createLane\("backward"\)\]/);
  assert.match(model, /oldLeftHandOrder/);
  assert.match(page, /side === "left" \? "forward" : "backward"/);
  assert.match(page, /Правостороннее движение включено по умолчанию/);
  assert.match(page, /splitMarking/);
  assert.match(page, /CombinedOrientationControl/);
  assert.match(page, /Сплошная слева/);
  assert.match(page, /Сплошная справа/);
  assert.match(page, /Остановка транспорта/);
  assert.match(page, /Расширение полосы/);
  assert.match(page, /Сужение полосы/);
  assert.match(page, /Пустой карман/);
  assert.match(page, /Начало расширения/);
  assert.match(page, /Конец сужения/);
  assert.match(page, /сохраняет полную ширину до конца дороги/);
  assert.match(page, /updateRoadFeature/);
  assert.match(page, /updateSelectedVertex/);
  assert.match(page, /Управление осью:/);
  assert.match(page, /Контрольный поперечник/);
  assert.match(page, /Состав и ширина полос/);
  assert.match(page, /onMoveRoadFeature/);
  assert.match(page, /Единая линия примыкания/);
  assert.match(page, /1\.17\.1 · жёлтая/);
  assert.match(page, /Знак 5\.16/);
  assert.match(page, /Съезд · до оси/);
  assert.match(page, /Перекрёсток · вся дорога/);
  assert.match(page, /Автоматический радиус сопряжения/);
  assert.match(page, /Ведите мышь на сторону А или Б/);
  assert.match(page, /Стоп-линия 1\.12 · только въезд/);
  assert.match(page, /Светофоры на подходе/);
  assert.match(page, /С двух сторон/);
  assert.match(canvas, /TrafficLightArtwork/);
  assert.match(canvas, /traffic-light-housing/);
  assert.match(canvas, /SupportArtwork/);
  assert.match(canvas, /CameraMountSlots/);
  assert.match(canvas, /SupportCameraArtwork/);
  assert.match(canvas, /CameraSymbol/);
  assert.match(canvas, /CameraCableArtwork/);
  assert.match(canvas, /camera-cable-outline/);
  assert.match(canvas, /camera-cable-line/);
  assert.ok(canvas.indexOf('className="camera-cable-layer"') > canvas.indexOf('className="cabinet-layer"'));
  assert.match(canvas, /type: "camera-cable-point"/);
  assert.match(canvas, /onInsertCameraCablePoint/);
  assert.match(canvas, /onMoveCameraCablePoint/);
  assert.match(canvas, /camera-bracket/);
  assert.doesNotMatch(canvas, /M -5 -5 L 0 -1 L 5 -5/);
  assert.match(canvas, /camera-lens/);
  assert.match(canvas, /camera-radar-wave/);
  assert.match(canvas, /camera-optics/);
  assert.match(canvas, /supportCameraFrame/);
  assert.match(canvas, /camera-label-callout/);
  assert.match(canvas, /camera-label-leader/);
  assert.match(canvas, /type: "camera-label"/);
  assert.match(canvas, /onMoveCameraLabel/);
  assert.match(canvas, /support-label-leader/);
  assert.match(canvas, /type: "support-label"/);
  assert.match(canvas, /type: "camera"/);
  assert.match(canvas, /onMoveCameraMount/);
  assert.match(canvas, /camera-mount-slot/);
  assert.match(canvas, /CabinetArtwork/);
  assert.match(canvas, /CableArtwork/);
  assert.match(canvas, /cableBundleKey/);
  assert.match(canvas, /cableTrackPoints/);
  assert.match(canvas, /data-bundle-size/);
  assert.match(canvas, /support-console-outline/);
  assert.match(canvas, /cable-note-leader/);
  assert.match(canvas, /type: "cable-label"/);
  assert.doesNotMatch(canvas, /definition\?\.name} · ≈/);
  assert.match(canvas, /nearestPointOnPolyline\(routePoints, world\)/);
  assert.match(canvas, /type: "cable-point"/);
  assert.match(canvas, /x="-17" y="-7" width="34" height="14"/);
  assert.match(page, /Положение вдоль дороги/);
  assert.match(page, /параллельно оси подхода/);
  assert.match(page, /Инженерия/);
  assert.match(page, /Навесное оборудование/);
  assert.match(page, /Провода между опорами/);
  assert.match(page, /Начать провод от этой опоры/);
  assert.match(page, /Балка и места под камеры/);
  assert.match(page, /Камеры и радарные блоки/);
  assert.match(page, /Вынос подписи опоры/);
  assert.match(page, /Вылет начала точек крепления/);
  assert.match(page, /Точный вылет начала, м/);
  assert.match(page, /жёстко привязано к посадочной точке/);
  assert.match(page, /перескакивает на ближайшую точку/);
  assert.match(page, /устройства меняются местами/);
  assert.doesNotMatch(page, /selectedCamera\.reach/);
  assert.match(page, /Вынос подписи камеры/);
  assert.match(page, /Поставить подпись перед объективом/);
  assert.match(page, /Плашку с именем можно перетаскивать/);
  assert.match(page, /Автоматически провести UTP и КГтп ко всем камерам/);
  assert.match(page, /UTP идёт от шкафа управления/);
  assert.match(page, /КГтп — от узла «Феникс»/);
  assert.match(page, /Ручное подключение этой камеры/);
  assert.match(page, /Провести вручную/);
  assert.match(page, /Автоматическая трасса идёт от шкафа к основанию консоли/);
  assert.match(page, /Двойной щелчок по линии переводит её в ручной режим/);
  assert.match(page, /draft\.cameraCables/);
  assert.match(page, /Мест · сторона А/);
  assert.match(page, /Мест · сторона Б/);
  assert.match(page, /Точки на сторонах А и Б независимо и равномерно пересчитываются/);
  assert.match(page, /cableChainSupportIds/);
  assert.match(page, /Нажимайте следующие опоры по порядку/);
  assert.match(page, /Кабельная трасса завершена/);
  assert.match(page, /Необязательная подпись на схеме/);
  assert.match(page, /Автоматических надписей на проводах нет/);
  assert.match(page, /перетащите появившуюся плашку/);
  assert.match(page, /Двойной щелчок по проводу добавляет точку изгиба/);
  assert.doesNotMatch(canvas, /RoadLabel/);
  assert.doesNotMatch(page, /selectedRoad\.name/);
  assert.match(page, /Начать заново/);
  assert.match(page, /createEmptyProject/);
  assert.match(canvas, /approach\.stopLine \|\| approach\.rule === "stop"/);
  assert.match(page, /Границы у перекрёстка вычисляются по его текущей форме/);
  assert.match(page, /direct-editor/);
  assert.match(page, /Трамвайный путь/);
  assert.match(dockerfile, /dist\/standalone/);
  assert.match(compose, /3000:3000/);
});
