export type Point = { x: number; y: number };

export type LaneKind = "traffic" | "tram" | "bus" | "bike" | "median";
export type LaneDirection = "forward" | "backward" | "both";
export type Turn = "left" | "straight" | "right" | "uturn";
export type RoadSide = "left" | "right";
export type RoadFeatureKind =
  | "transit-stop"
  | "lane-widening"
  | "lane-narrowing"
  | "empty-pocket";

export type SupportKind =
  | "power-pole"
  | "lighting-mast"
  | "console-pole";

export type CabinetKind =
  | "control-cabinet"
  | "power-entry"
  | "distribution-panel"
  | "phoenix-node"
  | "signal-computer";

export type CableKind = "sip" | "fiber" | "utp" | "control";

export type CameraKind = "overview" | "detector" | "radar";
export type CameraMountSide = "a" | "b";

export type LineMarkingId =
  | "none"
  | "1.1"
  | "1.2"
  | "1.3"
  | "1.5"
  | "1.6"
  | "1.7"
  | "1.8"
  | "1.11";

export type StampType =
  | "1.12"
  | "1.13"
  | "1.14.1"
  | "1.17.1"
  | "1.18-left"
  | "1.18-straight"
  | "1.18-right"
  | "1.18-combo"
  | "1.20"
  | "1.21"
  | "1.23.1"
  | "1.23.3"
  | "1.24.1"
  | "1.25";

export interface Lane {
  id: string;
  name: string;
  width: number;
  kind: LaneKind;
  direction: LaneDirection;
  turns: Turn[];
}

export interface MarkingSection {
  id: string;
  start: number;
  end: number;
  marking: LineMarkingId;
  mirrored: boolean;
}

export interface RoadFeature {
  id: string;
  kind: RoadFeatureKind;
  side: RoadSide;
  innerMarking: LineMarkingId;
  innerMarkingMirrored: boolean;
  at: number;
  length: number;
  width: number;
  taper: number;
}

export type CrossSectionTransition = "smooth" | "linear";

export interface RoadCrossSection {
  id: string;
  at: number;
  laneWidths: Record<string, number>;
  transition: CrossSectionTransition;
}

export interface Road {
  id: string;
  name: string;
  points: Point[];
  lanes: Lane[];
  separators: MarkingSection[][];
  features: RoadFeature[];
  crossSections: RoadCrossSection[];
  asphalt: "dark" | "light";
  curb: boolean;
}

export interface Stamp {
  id: string;
  type: StampType;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  text?: string;
}

export interface Support {
  id: string;
  kind: SupportKind;
  name: string;
  x: number;
  y: number;
  rotation: number;
  consoleLength: number;
  cameraMountOffset: number;
  cameraSlotsA: number;
  cameraSlotsB: number;
  labelOffsetX: number;
  labelOffsetY: number;
}

export interface SupportCamera {
  id: string;
  supportId: string;
  kind: CameraKind;
  name: string;
  side: CameraMountSide;
  slot: number;
  rotation: number;
  labelOffsetX: number;
  labelOffsetY: number;
  coverageOffsetX: number;
  coverageOffsetY: number;
  coverageWidth: number;
  coverageDepth: number;
}

export interface SupportCabinet {
  id: string;
  supportId: string;
  kind: CabinetKind;
  name: string;
  angle: number;
  distance: number;
}

export interface CableRoute {
  id: string;
  kind: CableKind;
  name: string;

  fromSupportId: string;
  toSupportId: string;

  /* Межопорные кабели всегда подключаются только к опорам. */
  fromCabinetId?: string | null;
  toCabinetId?: string | null;

  points: Point[];

  labelText: string;
  labelAt: number;
  labelOffset: number;
}

export type CameraCableKind = "utp" | "control";
export type CameraCableRouting = "auto" | "manual";

export interface CameraCableRoute {
  id: string;
  kind: CameraCableKind;
  name: string;
  sourceCabinetId: string;
  targetCameraId: string;
  routing: CameraCableRouting;
  points: Point[];
}

export type JunctionExtent = "half" | "full";
export type ApproachRule = "priority" | "yield" | "stop";
export type TrafficLightPlacement = "none" | "left" | "right" | "both";

export interface JunctionApproachSetting {
  id: string;
  rule: ApproachRule;
  offset: number;
  stopLine: boolean;
  trafficLights: TrafficLightPlacement;
  trafficLightOffset: number;
}

export interface JunctionSetting {
  id: string;
  extent: JunctionExtent;
  cornerRadius: number;
  showBoundary: boolean;
  approaches: JunctionApproachSetting[];
}

export interface RoadProject {
  version: 16;
  drivingSide: "right";
  id: string;
  name: string;
  roads: Road[];
  stamps: Stamp[];
  supports: Support[];
  cameras: SupportCamera[];
  cabinets: SupportCabinet[];
  cables: CableRoute[];
  cameraCables: CameraCableRoute[];
  junctionSettings: JunctionSetting[];
  gridSize: number;
  updatedAt: string;
}

export type Selection =
  | { type: "road"; roadId: string }
  | { type: "vertex"; roadId: string; index: number }
  | { type: "cross-section"; roadId: string; sectionId: string }
  | { type: "lane"; roadId: string; laneId: string }
  | {
      type: "separator";
      roadId: string;
      index: number;
      sectionId: string;
      at: number;
      start?: number;
      end?: number;
    }
  | { type: "feature"; roadId: string; featureId: string }
  | { type: "stamp"; stampId: string }
  | { type: "support"; supportId: string }
  | { type: "camera"; cameraId: string }
  | { type: "camera-cable"; cableId: string }
  | { type: "cabinet"; cabinetId: string }
  | { type: "cable"; cableId: string }
  | { type: "junction"; junctionId: string }
  | null;

export type EditorTool =
  | "select"
  | "road"
  | "branch"
  | "cross-section"
  | "marking-break"
  | "support"
  | "cable"
  | "pan"
  | `stamp:${StampType}`;

export interface MarkingDefinition {
  id: LineMarkingId;
  name: string;
  purpose: string;
  sample:
    | "none"
    | "solid"
    | "double"
    | "dash"
    | "short"
    | "approach"
    | "wide"
    | "combined";
}

export const LINE_MARKINGS: MarkingDefinition[] = [
  { id: "none", name: "Без линии", purpose: "Граница не отображается", sample: "none" },
  { id: "1.1", name: "1.1 · сплошная", purpose: "Разделяет потоки или обозначает границы полос", sample: "solid" },
  { id: "1.2", name: "1.2 · краевая", purpose: "Обозначает край проезжей части", sample: "wide" },
  { id: "1.3", name: "1.3 · двойная", purpose: "Разделяет встречные направления с четырьмя полосами и более", sample: "double" },
  { id: "1.5", name: "1.5 · прерывистая", purpose: "Разделяет транспортные потоки и полосы", sample: "dash" },
  { id: "1.6", name: "1.6 · приближение", purpose: "Предупреждает о приближении к сплошной линии", sample: "approach" },
  { id: "1.7", name: "1.7 · перекрёсток", purpose: "Направляет полосы в пределах перекрёстка", sample: "short" },
  { id: "1.8", name: "1.8 · переходная", purpose: "Граница полосы разгона или торможения", sample: "wide" },
  { id: "1.11", name: "1.11 · комбинированная", purpose: "Перестроение разрешено со стороны прерывистой", sample: "combined" },
];

export interface StampDefinition {
  id: StampType;
  name: string;
  group: "Поперечная" | "Стрелки" | "Символы";
}

export const STAMP_DEFINITIONS: StampDefinition[] = [
  { id: "1.12", name: "1.12 · стоп-линия", group: "Поперечная" },
  { id: "1.13", name: "1.13 · уступи дорогу", group: "Поперечная" },
  { id: "1.14.1", name: "1.14.1 · переход", group: "Поперечная" },
  { id: "1.17.1", name: "1.17.1 · остановка", group: "Поперечная" },
  { id: "1.18-left", name: "1.18 · налево", group: "Стрелки" },
  { id: "1.18-straight", name: "1.18 · прямо", group: "Стрелки" },
  { id: "1.18-right", name: "1.18 · направо", group: "Стрелки" },
  { id: "1.18-combo", name: "1.18 · прямо / направо", group: "Стрелки" },
  { id: "1.20", name: "1.20 · треугольник", group: "Символы" },
  { id: "1.21", name: "1.21 · СТОП", group: "Символы" },
  { id: "1.23.1", name: "1.23.1 · маршрутный ТС", group: "Символы" },
  { id: "1.23.3", name: "1.23.3 · велосипед", group: "Символы" },
  { id: "1.24.1", name: "1.24.1 · знак на дороге", group: "Символы" },
  { id: "1.25", name: "1.25 · неровность", group: "Символы" },
];

export const SUPPORT_DEFINITIONS: Array<{
  id: SupportKind;
  name: string;
  description: string;
}> = [
  { id: "power-pole", name: "Опора ЛЭП", description: "Круглая существующая опора инженерной сети" },
  { id: "lighting-mast", name: "Опора освещения", description: "Мачта с короткой световой консолью" },
  { id: "console-pole", name: "Консольная опора", description: "Опора с выносной перекладиной для оборудования" },
];

export const CAMERA_DEFINITIONS: Array<{
  id: CameraKind;
  name: string;
  prefix: string;
  color: string;
  description: string;
}> = [
  { id: "overview", name: "Обзорная камера", prefix: "V", color: "#10a968", description: "Зелёный обзорный датчик V/R из схем расположения" },
  { id: "detector", name: "Детектор фиксации", prefix: "S", color: "#d94b54", description: "Датчик фиксации нарушений с красным контуром" },
  { id: "radar", name: "Радарный блок", prefix: "D", color: "#c95b35", description: "Радарный блок D с направленным корпусом" },
];

export const CABINET_DEFINITIONS: Array<{
  id: CabinetKind;
  name: string;
  short: string;
  description: string;
}> = [
  { id: "control-cabinet", name: "Шкаф управления", short: "ШУ", description: "Синий диагональный шкаф из монтажных схем" },
  { id: "power-entry", name: "Точка подключения питания", short: "ТП", description: "Красно-белый ввод электропитания" },
  { id: "distribution-panel", name: "Дополнительный электрощит", short: "ЭЩ", description: "Оранжево-белый распределительный щит" },
  { id: "phoenix-node", name: "Узел коммутации «Феникс»", short: "Ф", description: "Жёлтый узел коммутации оборудования" },
  { id: "signal-computer", name: "Микрокомпьютер светофора", short: "МК", description: "Контроллер обработки сигналов светофора" },
];

export const CABLE_DEFINITIONS: Array<{
  id: CableKind;
  name: string;
  color: string;
  description: string;
}> = [
  { id: "sip", name: "СИП", color: "#e63c43", description: "Силовая линия" },
  { id: "fiber", name: "Оптический кабель", color: "#13a85c", description: "Линия передачи данных" },
  { id: "utp", name: "UTP cat.5e", color: "#f1c91c", description: "Сетевой кабель" },
  { id: "control", name: "КГтп-ХЛ 2×2,5", color: "#a02aa6", description: "Управляющий кабель" },
];

let sequence = 0;

export function uid(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function cameraMountPosition(
  length: number,
  offset: number,
  count: number,
  slot: number,
) {
  const start = Math.max(14, Math.min(length - 6, offset));

  if (count <= 0) {
    return start;
  }

  const end = Math.max(start, length - 6);

  return (
    start +
    ((end - start) *
      (Math.max(0, Math.min(count - 1, slot)) + 1)) /
      (count + 1)
  );
}

export function supportLocalPoint(
  support: Support,
  point: Point,
): Point {
  const angle = support.rotation * Math.PI / 180;

  return {
    x:
      support.x +
      point.x * Math.cos(angle) -
      point.y * Math.sin(angle),

    y:
      support.y +
      point.x * Math.sin(angle) +
      point.y * Math.cos(angle),
  };
}

function supportWorldToLocalPoint(
  support: Support,
  point: Point,
): Point {
  const angle = support.rotation * Math.PI / 180;
  const dx = point.x - support.x;
  const dy = point.y - support.y;

  return {
    x:
      dx * Math.cos(angle) +
      dy * Math.sin(angle),

    y:
      -dx * Math.sin(angle) +
      dy * Math.cos(angle),
  };
}

export function supportCabinetPosition(
  cabinet: SupportCabinet,
  support: Support,
): Point {
  const angle =
    ((support.rotation + cabinet.angle) * Math.PI) /
    180;

  return {
    x:
      support.x +
      Math.cos(angle) * cabinet.distance,

    y:
      support.y +
      Math.sin(angle) * cabinet.distance,
  };
}

export function supportCameraMountPosition(
  camera: SupportCamera,
  support: Support,
): Point {
  const count =
    camera.side === "a"
      ? support.cameraSlotsA
      : support.cameraSlotsB;

  const reach = cameraMountPosition(
    support.consoleLength,
    support.cameraMountOffset,
    count,
    camera.slot,
  );

  return supportLocalPoint(
    support,
    {
      x: reach,
      y: camera.side === "a" ? -15 : 15,
    },
  );
}

export function cameraCoverageDefaults(
  kind: CameraKind,
) {
  return kind === "detector"
    ? { width: 76, depth: 150 }
    : kind === "radar"
      ? { width: 94, depth: 190 }
      : { width: 128, depth: 210 };
}

export function supportCameraCableConnectionPoint(
  camera: SupportCamera,
  support: Support,
  kind: CameraCableKind,
): Point {
  const mount = supportCameraMountPosition(camera, support);
  const side = camera.side === "a" ? -1 : 1;
  const lateralAngle = (support.rotation + camera.rotation) * Math.PI / 180;
  const forwardAngle = lateralAngle + side * Math.PI / 2;
  /*
   * Оба ввода находятся на задней стенке камеры, рядом с
   * кронштейном. Они разнесены поперёк корпуса, поэтому UTP и
   * управляющий кабель больше не сходятся в одной точке и не
   * проходят поверх объектива.
   */
  const portOffset = kind === "utp" ? -4.5 : 4.5;

  return {
    x: mount.x - Math.cos(forwardAngle) * 3 + Math.cos(lateralAngle) * portOffset,
    y: mount.y - Math.sin(forwardAngle) * 3 + Math.sin(lateralAngle) * portOffset,
  };
}

function compactRoutePoints(points: Point[]): Point[] {
  const result: Point[] = [];

  for (const point of points) {
    const previous = result[result.length - 1];

    if (
      !previous ||
      Math.hypot(
        point.x - previous.x,
        point.y - previous.y,
      ) > 0.05
    ) {
      result.push(point);
    }
  }

  return result;
}

/* ============================================================
 * КАБЕЛИ ШКАФ -> КАМЕРЫ
 *
 * Этот блок возвращён к прежней механике:
 *
 * UTP:
 * - отдельная линия к каждой камере;
 * - отдельные параллельные дорожки вдоль консоли.
 *
 * КГтп:
 * - общий магистральный участок;
 * - затем ответвление к конкретной камере.
 *
 * Межопорная логика ниже на этот блок не влияет.
 * ============================================================ */

const UTP_LANE_GAP = 3.2;
const UTP_FIRST_LANE = 4;

const CABINET_HALF_SIZE = 14;
const CABINET_EXIT_LENGTH = 8;

const CONTROL_HUB_REACH = 18;
const CONTROL_TRUNK_OFFSET = 0;

function cameraReach(
  camera: SupportCamera,
  support: Support,
) {
  const count =
    camera.side === "a"
      ? support.cameraSlotsA
      : support.cameraSlotsB;

  return cameraMountPosition(
    support.consoleLength,
    support.cameraMountOffset,
    count,
    camera.slot,
  );
}

function orderedCamerasOnSide(
  support: Support,
  cameras: SupportCamera[],
  side: CameraMountSide,
) {
  return cameras
    .filter(
      (camera) =>
        camera.supportId === support.id &&
        camera.side === side,
    )
    .sort((left, right) => {
      const reachDifference =
        cameraReach(left, support) -
        cameraReach(right, support);

      if (Math.abs(reachDifference) > 0.001) {
        return reachDifference;
      }

      if (left.slot !== right.slot) {
        return left.slot - right.slot;
      }

      return left.id.localeCompare(right.id);
    });
}

interface CabinetConnection {
  point: Point;
  localPoint: Point;
  outwardLocal: Point;
}

function supportCabinetConnection(
  cabinet: SupportCabinet,
  support: Support,
  toward: Point,
  portShift = 0,
): CabinetConnection {
  const center = supportCabinetPosition(
    cabinet,
    support,
  );

  const centerLocal = supportWorldToLocalPoint(
    support,
    center,
  );

  const towardLocal = supportWorldToLocalPoint(
    support,
    toward,
  );

  const dx = towardLocal.x - centerLocal.x;
  const dy = towardLocal.y - centerLocal.y;

  const shift = Math.max(
    -10,
    Math.min(10, portShift),
  );

  let localPoint: Point;
  let outwardLocal: Point;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx >= 0 ? 1 : -1;

    localPoint = {
      x:
        centerLocal.x +
        direction * CABINET_HALF_SIZE,

      y:
        centerLocal.y + shift,
    };

    outwardLocal = {
      x: direction,
      y: 0,
    };
  } else {
    const direction = dy >= 0 ? 1 : -1;

    localPoint = {
      x: centerLocal.x + shift,

      y:
        centerLocal.y +
        direction * CABINET_HALF_SIZE,
    };

    outwardLocal = {
      x: 0,
      y: direction,
    };
  }

  return {
    localPoint,
    outwardLocal,

    point: supportLocalPoint(
      support,
      localPoint,
    ),
  };
}

function utpLaneOffset(
  target: SupportCamera,
  support: Support,
  cameras: SupportCamera[],
) {
  const ordered = orderedCamerasOnSide(
    support,
    cameras,
    target.side,
  );

  const index = Math.max(
    0,
    ordered.findIndex(
      (camera) => camera.id === target.id,
    ),
  );

  const distance =
    UTP_FIRST_LANE +
    index * UTP_LANE_GAP;

  return target.side === "a"
    ? -distance
    : distance;
}

function utpRouteChannel(
  target: SupportCamera,
  support: Support,
  cameras: SupportCamera[],
) {
  const routes = cameras
    .filter(
      (camera) => camera.supportId === support.id,
    )
    .map((camera) => ({
      camera,
      laneOffset: utpLaneOffset(
        camera,
        support,
        cameras,
      ),
    }))
    .sort((left, right) =>
      left.laneOffset - right.laneOffset ||
      cameraReach(left.camera, support) -
        cameraReach(right.camera, support) ||
      left.camera.id.localeCompare(right.camera.id),
    );

  const index = Math.max(
    0,
    routes.findIndex(
      (route) => route.camera.id === target.id,
    ),
  );

  const count = Math.max(1, routes.length);

  return {
    index,
    laneOffset: utpLaneOffset(
      target,
      support,
      cameras,
    ),
    portShift:
      count <= 1
        ? 0
        : -9 + 18 * index / (count - 1),
  };
}

function controlHubLocalPoint(
  support: Support,
): Point {
  return {
    x: Math.max(
      8,
      Math.min(
        support.consoleLength - 8,
        CONTROL_HUB_REACH,
      ),
    ),
    y: CONTROL_TRUNK_OFFSET,
  };
}

function routeCabinetToLocalPoint(
  cabinet: SupportCabinet,
  support: Support,
  targetLocal: Point,
  portShift = 0,
  routeTrack = 0,
): Point[] {
  const targetWorld = supportLocalPoint(
    support,
    targetLocal,
  );

  const connection = supportCabinetConnection(
    cabinet,
    support,
    targetWorld,
    portShift,
  );

  const start = connection.localPoint;
  const trackSeparation =
    Math.min(7, Math.max(0, routeTrack)) *
    UTP_LANE_GAP;

  const exit: Point = {
    x:
      start.x +
      connection.outwardLocal.x *
        (CABINET_EXIT_LENGTH + trackSeparation),

    y:
      start.y +
      connection.outwardLocal.y *
        (CABINET_EXIT_LENGTH + trackSeparation),
  };

  const route: Point[] = [start, exit];

  if (Math.abs(connection.outwardLocal.x) > 0.5) {
    route.push({
      x: exit.x,
      y: targetLocal.y,
    });
  } else {
    const approachX = Math.min(
      targetLocal.x - 8,
      -8 - trackSeparation,
    );

    route.push(
      {
        x: approachX,
        y: exit.y,
      },
      {
        x: approachX,
        y: targetLocal.y,
      },
    );
  }

  route.push(targetLocal);

  return compactRoutePoints(
    route.map((point) =>
      supportLocalPoint(
        support,
        point,
      ),
    ),
  );
}

function automaticUtpRoutePoints(
  _cable: CameraCableRoute,
  source: SupportCabinet,
  support: Support,
  target: SupportCamera,
  cameras: SupportCamera[],
): Point[] {
  const end = supportCameraCableConnectionPoint(
    target,
    support,
    "utp",
  );

  const reach = cameraReach(
    target,
    support,
  );

  const channel = utpRouteChannel(
    target,
    support,
    cameras,
  );

  const cameraLanePoint =
    supportLocalPoint(
      support,
      {
        x: reach,
        y: channel.laneOffset,
      },
    );

  const cabinetRoute =
    routeCabinetToLocalPoint(
      source,
      support,
      {
        x: 0,
        y: channel.laneOffset,
      },
      channel.portShift,
      channel.index,
    );

  /*
   * Старая аккуратная механика:
   *
   * шкаф -> короткий выход -> своя дорожка у основания ->
   * вдоль консоли -> камера
   */
  return compactRoutePoints([
    ...cabinetRoute,
    cameraLanePoint,
    end,
  ]);
}

function automaticControlRoutePoints(
  _cable: CameraCableRoute,
  source: SupportCabinet,
  support: Support,
  target: SupportCamera,
  _cameras: SupportCamera[],
): Point[] {
  const end = supportCameraCableConnectionPoint(
    target,
    support,
    "control",
  );

  const hubLocal = controlHubLocalPoint(
    support,
  );

  const commonTrunk = routeCabinetToLocalPoint(
    source,
    support,
    hubLocal,
  );

  const cameraLocal = supportWorldToLocalPoint(
    support,
    end,
  );

  const branchAlongBeam = supportLocalPoint(
    support,
    {
      x: cameraLocal.x,
      y: hubLocal.y,
    },
  );

  /*
   * После общего hub каждая линия
   * уходит к своей камере.
   */
  return compactRoutePoints([
    ...commonTrunk,
    branchAlongBeam,
    end,
  ]);
}

export function cameraCableRoutePoints(
  cable: CameraCableRoute,
  supports: Support[],
  cabinets: SupportCabinet[],
  cameras: SupportCamera[],
): Point[] {
  const source =
    cabinets.find(
      (cabinet) =>
        cabinet.id === cable.sourceCabinetId,
    );

  const target =
    cameras.find(
      (camera) =>
        camera.id === cable.targetCameraId,
    );

  const sourceSupport =
    source
      ? supports.find(
          (support) =>
            support.id === source.supportId,
        )
      : undefined;

  const targetSupport =
    target
      ? supports.find(
          (support) =>
            support.id === target.supportId,
        )
      : undefined;

  if (
    !source ||
    !target ||
    !sourceSupport ||
    !targetSupport
  ) {
    return [];
  }

  const end = supportCameraCableConnectionPoint(
    target,
    targetSupport,
    cable.kind,
  );

  /*
   * Ручной режим не меняем:
   * ручные точки являются внутренними точками трассы.
   */
  if (cable.routing === "manual") {
    const toward =
      cable.points[0] ??
      end;

    const connection =
      supportCabinetConnection(
        source,
        sourceSupport,
        toward,
      );

    return compactRoutePoints([
      connection.point,
      ...cable.points,
      end,
    ]);
  }

  /*
   * Если шкаф и камера по какой-то причине
   * находятся на разных опорах, используем
   * безопасный прямой переход через центры опор.
   */
  if (
    sourceSupport.id !==
    targetSupport.id
  ) {
    const connection =
      supportCabinetConnection(
        source,
        sourceSupport,
        {
          x: targetSupport.x,
          y: targetSupport.y,
        },
      );

    return compactRoutePoints([
      connection.point,

      {
        x: sourceSupport.x,
        y: sourceSupport.y,
      },

      {
        x: targetSupport.x,
        y: targetSupport.y,
      },

      end,
    ]);
  }

  if (cable.kind === "control") {
    return automaticControlRoutePoints(
      cable,
      source,
      targetSupport,
      target,
      cameras,
    );
  }

  return automaticUtpRoutePoints(
    cable,
    source,
    targetSupport,
    target,
    cameras,
  );
}

/* ============================================================
 * МЕЖОПОРНЫЕ КАБЕЛИ И ПОДКЛЮЧЕНИЕ К ШКАФАМ
 *
 * Главная идея:
 *
 * 1. Межопорная линия остаётся отдельной линией столб -> столб.
 * 2. В шкаф заводятся ТОЛЬКО явно назначенные кабели.
 * 3. От столба к шкафу максимум четыре фиксированные дорожки.
 * 4. У столба дорожки начинаются в фиксированных точках.
 * 5. В шкаф дорожки входят в разных точках.
 * 6. Никаких диагональных "вееров" через центр шкафа.
 * ============================================================ */

export interface InterSupportCableGeometry {
  externalPoints: Point[];
  startTail: Point[];
  endTail: Point[];
}

const INTER_SUPPORT_ENTRY_OFFSETS =
  [-8, -2.6, 2.6, 8] as const;

const INTER_SUPPORT_CABINET_HALF_SIZE = 14;

function cableCabinetIdAtSupport(
  _cable: CableRoute,
  _supportId: string,
  _cabinets: SupportCabinet[],
): string | null {
  return null;
}

function interSupportCabinetForEndpoint(
  cable: CableRoute,
  endpoint: "from" | "to",
  cabinets: SupportCabinet[],
): SupportCabinet | null {
  const supportId =
    endpoint === "from"
      ? cable.fromSupportId
      : cable.toSupportId;

  const cabinetId =
    endpoint === "from"
      ? cable.fromCabinetId
      : cable.toCabinetId;

  if (typeof cabinetId !== "string") {
    return null;
  }

  return (
    cabinets.find(
      (cabinet) =>
        cabinet.id === cabinetId &&
        cabinet.supportId === supportId,
    ) ?? null
  );
}

function interSupportTrackIndex(
  cable: CableRoute,
  supportId: string,
  cabinetId: string,
  allCables: CableRoute[],
  cabinets: SupportCabinet[],
): number {
  const connected =
    allCables
      .filter(
        (candidate) =>
          (
            candidate.fromSupportId === supportId ||
            candidate.toSupportId === supportId
          ) &&
          cableCabinetIdAtSupport(
            candidate,
            supportId,
            cabinets,
          ) === cabinetId,
      )
      .sort(
        (left, right) =>
          left.id.localeCompare(right.id),
      );

  const index =
    connected.findIndex(
      (candidate) =>
        candidate.id === cable.id,
    );

  return Math.max(
    0,
    Math.min(
      3,
      index < 0 ? 0 : index,
    ),
  );
}

function interSupportPoleTrackIndex(
  cable: CableRoute,
  supportId: string,
  allCables: CableRoute[],
  cabinets: SupportCabinet[],
): number {
  const connected = allCables
    .filter(
      (candidate) =>
        (candidate.fromSupportId === supportId ||
          candidate.toSupportId === supportId) &&
        cableCabinetIdAtSupport(
          candidate,
          supportId,
          cabinets,
        ) === null,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  const index = connected.findIndex(
    (candidate) => candidate.id === cable.id,
  );

  return Math.max(0, Math.min(3, index < 0 ? 0 : index));
}

function supportEntryPointToward(
  support: Support,
  toward: Point,
  trackIndex: number,
): Point {
  const dx = toward.x - support.x;
  const dy = toward.y - support.y;
  const offset = INTER_SUPPORT_ENTRY_OFFSETS[trackIndex];

  /* Четыре точки находятся внутри символа опоры. */
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: support.x,
      y: support.y + offset,
    };
  }

  return {
    x: support.x + offset,
    y: support.y,
  };
}

function supportApproachPointToward(
  support: Support,
  toward: Point,
  trackIndex: number,
): Point {
  const dx = toward.x - support.x;
  const dy = toward.y - support.y;
  const offset = INTER_SUPPORT_ENTRY_OFFSETS[trackIndex];
  const distance = 36;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: support.x + (dx >= 0 ? distance : -distance),
      y: support.y + offset,
    };
  }

  return {
    x: support.x + offset,
    y: support.y + (dy >= 0 ? distance : -distance),
  };
}

function cabinetBrokenEntryRoute(
  start: Point,
  entry: Point,
  cabinet: SupportCabinet,
  support: Support,
  trackIndex: number,
): Point[] {
  const center = supportCabinetPosition(cabinet, support);
  const dx = entry.x - center.x;
  const dy = entry.y - center.y;
  const extension = 10 + trackIndex * 2.5;
  const outside = {
    x: entry.x + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx || 1) * extension : 0),
    y: entry.y + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy || 1) * extension : 0),
  };

  const route = Math.abs(dx) >= Math.abs(dy)
    ? [
        start,
        { x: start.x, y: outside.y },
        outside,
        entry,
      ]
    : [
        start,
        { x: outside.x, y: start.y },
        outside,
        entry,
      ];

  return compactRoutePoints(route);
}

function cabinetEntryPointToward(
  cabinet: SupportCabinet,
  support: Support,
  toward: Point,
  trackIndex: number,
): Point {
  const cabinetCenter =
    supportCabinetPosition(
      cabinet,
      support,
    );

  const dx =
    toward.x -
    cabinetCenter.x;

  const dy =
    toward.y -
    cabinetCenter.y;

  const entryOffset =
    INTER_SUPPORT_ENTRY_OFFSETS[
      trackIndex
    ];

  /* На выбранной грани предусмотрены четыре разнесённых ввода. */
  if (
    Math.abs(dx) >=
    Math.abs(dy)
  ) {
    return {
      x:
        cabinetCenter.x +
        (
          dx >= 0
            ? INTER_SUPPORT_CABINET_HALF_SIZE
            : -INTER_SUPPORT_CABINET_HALF_SIZE
        ),

      y:
        cabinetCenter.y +
        entryOffset,
    };
  }

  return {
    x:
      cabinetCenter.x +
      entryOffset,

    y:
      cabinetCenter.y +
      (
        dy >= 0
          ? INTER_SUPPORT_CABINET_HALF_SIZE
          : -INTER_SUPPORT_CABINET_HALF_SIZE
      ),
  };
}

function cameraCableExitDirection(
  cabinet: SupportCabinet,
  support: Support,
  supports: Support[],
  cabinets: SupportCabinet[],
  cameras: SupportCamera[],
  cameraCables: CameraCableRoute[],
): Point | null {
  const center = supportCabinetPosition(cabinet, support);

  const directions = cameraCables
    .filter((cable) => cable.sourceCabinetId === cabinet.id)
    .map((cable) =>
      cameraCableRoutePoints(
        cable,
        supports,
        cabinets,
        cameras,
      )[0],
    )
    .filter((point): point is Point => Boolean(point))
    .map((point) => ({
      x: point.x - center.x,
      y: point.y - center.y,
    }));

  if (!directions.length) {
    return null;
  }

  const sum = directions.reduce(
    (result, direction) => ({
      x: result.x + direction.x,
      y: result.y + direction.y,
    }),
    { x: 0, y: 0 },
  );

  return Math.hypot(sum.x, sum.y) > 0.01
    ? sum
    : directions[0];
}

function interSupportCabinetEntryPoint(
  cable: CableRoute,
  support: Support,
  cabinet: SupportCabinet,
  approachPoint: Point,
  supports: Support[],
  allCables: CableRoute[],
  cabinets: SupportCabinet[],
  cameras: SupportCamera[],
  cameraCables: CameraCableRoute[],
): Point {
  const cabinetCenter = supportCabinetPosition(cabinet, support);

  const trackIndex =
    interSupportTrackIndex(
      cable,
      support.id,
      cabinet.id,
      allCables,
      cabinets,
    );

  const cameraExit = cameraCableExitDirection(
    cabinet,
    support,
    supports,
    cabinets,
    cameras,
    cameraCables,
  );

  /*
   * Если из шкафа уже выходят кабели к камерам, межопорный
   * кабель входит через противоположную грань. Без камер
   * используется грань, обращённая к подходящей трассе.
   */
  const toward = cameraExit
    ? {
        x: cabinetCenter.x - cameraExit.x,
        y: cabinetCenter.y - cameraExit.y,
      }
    : approachPoint;

  return cabinetEntryPointToward(
    cabinet,
    support,
    toward,
    trackIndex,
  );
}

export function interSupportCableGeometry(
  cable: CableRoute,
  supports: Support[],
  cabinets: SupportCabinet[],
  cameras: SupportCamera[] = [],
  allCables: CableRoute[] = [],
  cameraCables: CameraCableRoute[] = [],
): InterSupportCableGeometry {
  const fromSupport =
    supports.find(
      (support) =>
        support.id === cable.fromSupportId,
    );

  const toSupport =
    supports.find(
      (support) =>
        support.id === cable.toSupportId,
    );

  if (
    !fromSupport ||
    !toSupport
  ) {
    return {
      externalPoints: [],
      startTail: [],
      endTail: [],
    };
  }

  const fromReference =
    cable.points[0] ??
    { x: toSupport.x, y: toSupport.y };

  const toReference =
    cable.points[cable.points.length - 1] ??
    { x: fromSupport.x, y: fromSupport.y };

  const fromTrackIndex = interSupportPoleTrackIndex(
    cable,
    fromSupport.id,
    allCables,
    cabinets,
  );

  const toTrackIndex = interSupportPoleTrackIndex(
    cable,
    toSupport.id,
    allCables,
    cabinets,
  );

  const fromPoint = supportEntryPointToward(
    fromSupport,
    fromReference,
    fromTrackIndex,
  );

  const toPoint = supportEntryPointToward(
    toSupport,
    toReference,
    toTrackIndex,
  );

  /*
   * Межопорная линия всегда заканчивается внутри двух опор.
   * Шкафы не участвуют в этой геометрии.
   */
  const externalPoints = compactRoutePoints([
    fromPoint,
    ...cable.points,
    toPoint,
  ]);

  return {
    externalPoints,
    startTail: [],
    endTail: [],
  };
}

export function interSupportCableRoutePoints(
  cable: CableRoute,
  supports: Support[],
  cabinets: SupportCabinet[],
  cameras: SupportCamera[] = [],
  allCables: CableRoute[] = [],
  cameraCables: CameraCableRoute[] = [],
): Point[] {
  const geometry =
    interSupportCableGeometry(
      cable,
      supports,
      cabinets,
      cameras,
      allCables,
      cameraCables,
    );

  /*
   * Этот массив используется для длины и старых участков UI.
   *
   * Для красивого отображения RoadCanvas должен рисовать
   * externalPoints, startTail и endTail отдельными path.
   */
  const result: Point[] = [];

  if (
    geometry.startTail.length
  ) {
    result.push(
      ...[
        ...geometry.startTail,
      ].reverse(),
    );
  }

  if (
    geometry.externalPoints.length
  ) {
    result.push(
      ...geometry.externalPoints,
    );
  }

  if (
    geometry.endTail.length
  ) {
    result.push(
      ...geometry.endTail,
    );
  }

  return compactRoutePoints(result);
}

/* ============================================================
 * СОЗДАНИЕ ОБЪЕКТОВ
 * ============================================================ */

export function createLane(
  direction: LaneDirection = "forward",
  kind: LaneKind = "traffic",
): Lane {
  const labels: Record<LaneKind, string> = {
    traffic: "Полоса движения",
    tram: "Трамвайный путь",
    bus: "Полоса МТС",
    bike: "Велополоса",
    median: "Разделитель",
  };

  return {
    id: uid("lane"),
    name: labels[kind],
    width:
      kind === "tram"
        ? 38
        : kind === "bike"
          ? 22
          : kind === "median"
            ? 18
            : 42,
    kind,
    direction,
    turns:
      kind === "traffic" ||
      kind === "bus"
        ? ["straight"]
        : [],
  };
}

export function createSeparator(
  marking: LineMarkingId,
): MarkingSection[] {
  return [
    {
      id: uid("marking"),
      start: 0,
      end: 1,
      marking,
      mirrored: false,
    },
  ];
}

export function createRoadFeature(
  kind: RoadFeatureKind,
  side: RoadSide = "right",
): RoadFeature {
  return {
    id: uid("feature"),
    kind,
    side,
    innerMarking:
      kind === "lane-widening" ||
      kind === "lane-narrowing"
        ? "1.5"
        : "1.8",
    innerMarkingMirrored: false,
    at: 0.5,
    length:
      kind === "transit-stop"
        ? 360
        : 240,
    width:
      kind === "lane-narrowing"
        ? 30
        : 42,
    taper:
      kind === "transit-stop" ||
      kind === "empty-pocket"
        ? 72
        : 96,
  };
}

export function createSupport(
  kind: SupportKind,
  point: Point,
  index = 1,
): Support {
  return {
    id: uid("support"),
    kind,
    name: "",
    x: point.x,
    y: point.y,
    rotation: 0,
    consoleLength: 76,
    cameraMountOffset: 24,
    cameraSlotsA: 2,
    cameraSlotsB: 2,
    labelOffsetX: 0,
    labelOffsetY: 40,
  };
}

export function createSupportCamera(
  supportId: string,
  kind: CameraKind,
  side: CameraMountSide,
  slot: number,
  index = 1,
): SupportCamera {
  const definition =
    CAMERA_DEFINITIONS.find(
      (candidate) =>
        candidate.id === kind,
    );

  return {
    id: uid("camera"),
    supportId,
    kind,
    name:
      `${definition?.prefix ?? "C"}${String(index).padStart(5, "0")}`,
    side,
    slot,
    rotation: 0,
    labelOffsetX: 0,
    labelOffsetY: 54,
    coverageOffsetX: 0,
    coverageOffsetY: 0,
    ...(() => {
      const coverage = cameraCoverageDefaults(kind);
      return {
        coverageWidth: coverage.width,
        coverageDepth: coverage.depth,
      };
    })(),
  };
}

export function createCabinet(
  supportId: string,
  kind: CabinetKind,
  index = 1,
): SupportCabinet {
  const definition =
    CABINET_DEFINITIONS.find(
      (candidate) =>
        candidate.id === kind,
    );

  return {
    id: uid("cabinet"),
    supportId,
    kind,
    name:
      `${definition?.short ?? "Ш"}-${index}`,
    angle:
      45 +
      (index - 1) * 55,
    distance: 54,
  };
}

export function createCable(
  fromSupportId: string,
  toSupportId: string,
  kind: CableKind,
  index = 1,
): CableRoute {
  const definition =
    CABLE_DEFINITIONS.find(
      (candidate) =>
        candidate.id === kind,
    );

  return {
    id: uid("cable"),
    kind,
    name:
      `${definition?.name ?? "Кабель"} ${index}`,
    fromSupportId,
    toSupportId,

    /* По умолчанию оба конца подключаются к самим опорам. */
    fromCabinetId: null,
    toCabinetId: null,

    points: [],
    labelText: "",
    labelAt: 0.5,
    labelOffset: 48,
  };
}

export function createCameraCable(
  sourceCabinetId: string,
  targetCameraId: string,
  kind: CameraCableKind,
  routing: CameraCableRouting = "auto",
  index = 1,
): CameraCableRoute {
  return {
    id: uid("camera-cable"),
    kind,
    name:
      `${kind === "utp" ? "UTP cat.5e" : "КГтп-ХЛ 2×2,5"} ${index}`,
    sourceCabinetId,
    targetCameraId,
    routing,
    points: [],
  };
}

export function createRoad(
  points: Point[],
  name = "Проезжая часть",
): Road {
  const lanes = [
    createLane("forward"),
    createLane("forward"),
    createLane("backward"),
    createLane("backward"),
  ];

  return {
    id: uid("road"),
    name,
    points,
    lanes,
    separators: [
      createSeparator("1.2"),
      createSeparator("1.5"),
      createSeparator("1.3"),
      createSeparator("1.5"),
      createSeparator("1.2"),
    ],
    features: [],
    crossSections: [
      {
        id: uid("cross-section"),
        at: 0,
        laneWidths: {},
        transition: "smooth",
      },
      {
        id: uid("cross-section"),
        at: 1,
        laneWidths: {},
        transition: "smooth",
      },
    ],
    asphalt: "dark",
    curb: true,
  };
}

export function createDefaultProject(): RoadProject {
  const horizontal =
    createRoad(
      [
        { x: 190, y: 500 },
        { x: 1410, y: 500 },
      ],
      "Главная улица",
    );

  const vertical =
    createRoad(
      [
        { x: 800, y: 110 },
        { x: 800, y: 890 },
      ],
      "Поперечная улица",
    );

  vertical.lanes = [
    createLane("forward"),
    createLane("backward"),
  ];

  vertical.separators = [
    createSeparator("1.2"),
    createSeparator("1.1"),
    createSeparator("1.2"),
  ];

  return {
    version: 16,
    drivingSide: "right",
    id: uid("project"),
    name: "Новый перекрёсток",
    roads: [
      horizontal,
      vertical,
    ],
    stamps: [
      {
        id: uid("stamp"),
        type: "1.14.1",
        x: 800,
        y: 390,
        rotation: 0,
        scale: 1,
      },
      {
        id: uid("stamp"),
        type: "1.18-straight",
        x: 690,
        y: 535,
        rotation: 90,
        scale: 1,
      },
    ],
    supports: [],
    cameras: [],
    cabinets: [],
    cables: [],
    cameraCables: [],
    junctionSettings: [],
    gridSize: 20,
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyProject(): RoadProject {
  return {
    version: 16,
    drivingSide: "right",
    id: uid("project"),
    name: "Новый перекрёсток",
    roads: [],
    stamps: [],
    supports: [],
    cameras: [],
    cabinets: [],
    cables: [],
    cameraCables: [],
    junctionSettings: [],
    gridSize: 20,
    updatedAt: new Date().toISOString(),
  };
}

export function cloneProject(
  project: RoadProject,
): RoadProject {
  return JSON.parse(
    JSON.stringify(project),
  ) as RoadProject;
}

/* ============================================================
 * ШИРИНЫ ДОРОГ
 * ============================================================ */

function sectionLaneWidth(
  road: Road,
  section: RoadCrossSection,
  laneId: string,
) {
  const lane =
    road.lanes.find(
      (candidate) =>
        candidate.id === laneId,
    );

  return Math.max(
    0,
    section.laneWidths[laneId] ??
      lane?.width ??
      0,
  );
}

export function roadLaneWidthAt(
  road: Road,
  laneId: string,
  at: number,
) {
  const lane =
    road.lanes.find(
      (candidate) =>
        candidate.id === laneId,
    );

  if (!lane) {
    return 0;
  }

  const sections =
    [
      ...(road.crossSections ?? []),
    ].sort(
      (first, second) =>
        first.at - second.at,
    );

  if (!sections.length) {
    return lane.width;
  }

  const position =
    Math.max(
      0,
      Math.min(1, at),
    );

  const nextIndex =
    sections.findIndex(
      (section) =>
        section.at >=
        position - 0.000001,
    );

  if (nextIndex <= 0) {
    return sectionLaneWidth(
      road,
      sections[0],
      laneId,
    );
  }

  if (nextIndex < 0) {
    return sectionLaneWidth(
      road,
      sections[
        sections.length - 1
      ],
      laneId,
    );
  }

  const previous =
    sections[nextIndex - 1];

  const next =
    sections[nextIndex];

  const span =
    Math.max(
      0.000001,
      next.at - previous.at,
    );

  let ratio =
    Math.max(
      0,
      Math.min(
        1,
        (position - previous.at) /
          span,
      ),
    );

  if (
    previous.transition === "smooth"
  ) {
    ratio =
      ratio *
      ratio *
      (3 - 2 * ratio);
  }

  const from =
    sectionLaneWidth(
      road,
      previous,
      laneId,
    );

  const to =
    sectionLaneWidth(
      road,
      next,
      laneId,
    );

  return (
    from +
    (to - from) *
      ratio
  );
}

export function roadLaneWidthsAt(
  road: Road,
  at: number,
) {
  return road.lanes.map(
    (lane) =>
      roadLaneWidthAt(
        road,
        lane.id,
        at,
      ),
  );
}

export function roadWidth(
  road: Road,
  at = 0.5,
) {
  return roadLaneWidthsAt(
    road,
    at,
  ).reduce(
    (sum, width) =>
      sum + width,
    0,
  );
}

export function createRoadCrossSection(
  road: Road,
  at: number,
): RoadCrossSection {
  const position =
    Math.max(
      0,
      Math.min(1, at),
    );

  return {
    id: uid("cross-section"),
    at: position,
    laneWidths:
      Object.fromEntries(
        road.lanes.map(
          (lane) => [
            lane.id,
            roadLaneWidthAt(
              road,
              lane.id,
              position,
            ),
          ],
        ),
      ),
    transition: "smooth",
  };
}

export function normalizeRoad(
  road: Road,
) {
  while (
    road.separators.length <
    road.lanes.length + 1
  ) {
    road.separators.push(
      createSeparator("1.5"),
    );
  }

  road.separators =
    road.separators.slice(
      0,
      road.lanes.length + 1,
    );

  if (
    road.separators.length
  ) {
    for (
      const section of
      road.separators[0]
    ) {
      if (
        section.marking !== "none"
      ) {
        section.marking = "1.2";
      }
    }

    for (
      const section of
      road.separators[
        road.separators.length - 1
      ]
    ) {
      if (
        section.marking !== "none"
      ) {
        section.marking = "1.2";
      }
    }
  }

  const sections =
    (
      Array.isArray(
        road.crossSections,
      )
        ? road.crossSections
        : []
    )
      .map(
        (section) => ({
          ...section,
          at:
            Math.max(
              0,
              Math.min(
                1,
                Number(section.at) || 0,
              ),
            ),
          laneWidths:
            section.laneWidths &&
            typeof section.laneWidths ===
              "object"
              ? section.laneWidths
              : {},
          transition:
            section.transition === "linear"
              ? "linear" as const
              : "smooth" as const,
        }),
      )
      .sort(
        (first, second) =>
          first.at - second.at,
      )
      .filter(
        (section, index, all) =>
          index === all.length - 1 ||
          Math.abs(
            section.at -
              all[index + 1].at,
          ) > 0.0001,
      );

  if (
    !sections.length ||
    sections[0].at > 0.0001
  ) {
    sections.unshift({
      id: uid("cross-section"),
      at: 0,
      laneWidths: {},
      transition: "smooth",
    });
  } else {
    sections[0].at = 0;
  }

  if (
    sections[
      sections.length - 1
    ].at < 0.9999
  ) {
    sections.push({
      id: uid("cross-section"),
      at: 1,
      laneWidths: {},
      transition: "smooth",
    });
  } else {
    sections[
      sections.length - 1
    ].at = 1;
  }

  road.crossSections = sections;
}

/* ============================================================
 * ШАБЛОНЫ
 * ============================================================ */

export function createTemplate(
  kind:
    | "straight"
    | "cross"
    | "tee"
    | "tram",
): Road[] {
  if (kind === "straight") {
    return [
      createRoad(
        [
          { x: 220, y: 500 },
          { x: 1380, y: 500 },
        ],
        "Прямая улица",
      ),
    ];
  }

  if (kind === "tee") {
    const main =
      createRoad(
        [
          { x: 180, y: 480 },
          { x: 1420, y: 480 },
        ],
        "Главная улица",
      );

    const branch =
      createRoad(
        [
          { x: 800, y: 900 },
          { x: 800, y: 480 },
        ],
        "Примыкание",
      );

    branch.lanes = [
      createLane("forward"),
      createLane("backward"),
    ];

    branch.separators = [
      createSeparator("1.2"),
      createSeparator("1.1"),
      createSeparator("1.2"),
    ];

    return [
      main,
      branch,
    ];
  }

  if (kind === "tram") {
    const road =
      createRoad(
        [
          { x: 190, y: 500 },
          { x: 1410, y: 500 },
        ],
        "Улица с трамваем",
      );

    road.lanes.splice(
      2,
      0,
      createLane(
        "forward",
        "tram",
      ),
      createLane(
        "backward",
        "tram",
      ),
    );

    road.separators.splice(
      2,
      0,
      createSeparator("1.1"),
      createSeparator("1.3"),
    );

    normalizeRoad(road);

    return [road];
  }

  const horizontal =
    createRoad(
      [
        { x: 180, y: 500 },
        { x: 1420, y: 500 },
      ],
      "Главная улица",
    );

  const vertical =
    createRoad(
      [
        { x: 800, y: 100 },
        { x: 800, y: 900 },
      ],
      "Поперечная улица",
    );

  vertical.lanes = [
    createLane("forward"),
    createLane("backward"),
  ];

  vertical.separators = [
    createSeparator("1.2"),
    createSeparator("1.1"),
    createSeparator("1.2"),
  ];

  return [
    horizontal,
    vertical,
  ];
}

/* ============================================================
 * МИГРАЦИЯ
 * ============================================================ */

export function migrateProject(
  value: unknown,
): RoadProject {
  const source =
    value as
      Partial<RoadProject> & {
        version?: number;

        roads?: Array<
          Road & {
            separators: unknown[];
          }
        >;
      };

  if (
    !source ||
    !Array.isArray(source.roads)
  ) {
    throw new Error(
      "Некорректный файл проекта",
    );
  }

  const migrated =
    JSON.parse(
      JSON.stringify(source),
    ) as RoadProject;

  for (
    const road of migrated.roads
  ) {
    road.separators =
      (
        road.separators as unknown[]
      ).map(
        (separator) => {
          if (
            typeof separator === "string"
          ) {
            return createSeparator(
              separator as LineMarkingId,
            );
          }

          if (
            Array.isArray(separator)
          ) {
            return separator as MarkingSection[];
          }

          return createSeparator("1.5");
        },
      );

    if (
      (source.version ?? 1) < 3
    ) {
      const directional =
        road.lanes.filter(
          (lane) =>
            lane.kind !== "median" &&
            lane.direction !== "both",
        );

      const hasForward =
        directional.some(
          (lane) =>
            lane.direction === "forward",
        );

      const hasBackward =
        directional.some(
          (lane) =>
            lane.direction === "backward",
        );

      const firstForward =
        directional.findIndex(
          (lane) =>
            lane.direction === "forward",
        );

      const oldLeftHandOrder =
        hasForward &&
        hasBackward &&
        directional
          .slice(
            0,
            firstForward,
          )
          .every(
            (lane) =>
              lane.direction === "backward",
          ) &&
        directional
          .slice(firstForward)
          .every(
            (lane) =>
              lane.direction === "forward",
          );

      if (oldLeftHandOrder) {
        for (
          const lane of directional
        ) {
          lane.direction =
            lane.direction === "forward"
              ? "backward"
              : "forward";
        }
      }
    }

    road.features =
      Array.isArray(road.features)
        ? road.features
        : [];

    road.crossSections =
      Array.isArray(
        road.crossSections,
      )
        ? road.crossSections
        : [];

    for (
      const feature of road.features
    ) {
      const laneTransition =
        feature.kind === "lane-widening" ||
        feature.kind === "lane-narrowing";

      feature.innerMarking =
        feature.innerMarking ??
        (
          laneTransition
            ? "1.5"
            : "1.8"
        );

      feature.innerMarkingMirrored =
        Boolean(
          feature.innerMarkingMirrored,
        );

      if (
        (source.version ?? 1) < 6 &&
        laneTransition &&
        feature.innerMarking === "1.8"
      ) {
        feature.innerMarking = "1.5";
      }
    }

    for (
      const separator of road.separators
    ) {
      for (
        const section of separator
      ) {
        section.mirrored =
          Boolean(section.mirrored);
      }
    }

    normalizeRoad(road);
  }

  migrated.version = 16;
  migrated.drivingSide = "right";

  migrated.stamps =
    Array.isArray(migrated.stamps)
      ? migrated.stamps
      : [];

  migrated.supports =
    Array.isArray(migrated.supports)
      ? migrated.supports
      : [];

  migrated.cameras =
    Array.isArray(migrated.cameras)
      ? migrated.cameras
      : [];

  migrated.cabinets =
    Array.isArray(migrated.cabinets)
      ? migrated.cabinets
      : [];

  migrated.cables =
    Array.isArray(migrated.cables)
      ? migrated.cables
      : [];

  migrated.cameraCables =
    Array.isArray(
      migrated.cameraCables,
    )
      ? migrated.cameraCables
      : [];

  for (
    const support of migrated.supports
  ) {
    support.kind =
      SUPPORT_DEFINITIONS.some(
        (definition) =>
          definition.id === support.kind,
      )
        ? support.kind
        : "power-pole";

    support.rotation =
      Number.isFinite(
        Number(support.rotation),
      )
        ? Number(support.rotation)
        : 0;

    support.name =
      typeof support.name === "string"
        ? support.name
        : "Опора";

    support.consoleLength =
      Number.isFinite(
        Number(support.consoleLength),
      )
        ? Math.max(
            60,
            Math.min(
              180,
              Number(
                support.consoleLength,
              ),
            ),
          )
        : 76;

    const legacyCameraOffsets =
      migrated.cameras
        .filter(
          (camera) =>
            camera.supportId === support.id &&
            Number.isFinite(
              Number(
                (
                  camera as
                    SupportCamera & {
                      reach?: number;
                    }
                ).reach,
              ),
            ),
        )
        .map(
          (camera) =>
            Number(
              (
                camera as
                  SupportCamera & {
                    reach?: number;
                  }
              ).reach,
            ),
        );

    const defaultMountOffset =
      legacyCameraOffsets.length
        ? Math.min(
            ...legacyCameraOffsets,
          )
        : 24;

    support.cameraMountOffset =
      Number.isFinite(
        Number(
          support.cameraMountOffset,
        ),
      )
        ? Math.max(
            14,
            Math.min(
              support.consoleLength - 6,
              Number(
                support.cameraMountOffset,
              ),
            ),
          )
        : Math.max(
            14,
            Math.min(
              support.consoleLength - 6,
              defaultMountOffset,
            ),
          );

    support.cameraSlotsA =
      Number.isFinite(
        Number(support.cameraSlotsA),
      )
        ? Math.max(
            0,
            Math.min(
              8,
              Math.round(
                Number(
                  support.cameraSlotsA,
                ),
              ),
            ),
          )
        : 2;

    support.cameraSlotsB =
      Number.isFinite(
        Number(support.cameraSlotsB),
      )
        ? Math.max(
            0,
            Math.min(
              8,
              Math.round(
                Number(
                  support.cameraSlotsB,
                ),
              ),
            ),
          )
        : 2;

    support.labelOffsetX =
      Number.isFinite(
        Number(support.labelOffsetX),
      )
        ? Math.max(
            -360,
            Math.min(
              360,
              Number(
                support.labelOffsetX,
              ),
            ),
          )
        : 0;

    support.labelOffsetY =
      Number.isFinite(
        Number(support.labelOffsetY),
      )
        ? Math.max(
            -360,
            Math.min(
              360,
              Number(
                support.labelOffsetY,
              ),
            ),
          )
        : 40;
  }

  const supportIds =
    new Set(
      migrated.supports.map(
        (support) =>
          support.id,
      ),
    );

  migrated.cameras =
    migrated.cameras.filter(
      (camera) =>
        supportIds.has(
          camera.supportId,
        ),
    );

  for (
    const camera of migrated.cameras
  ) {
    camera.kind =
      CAMERA_DEFINITIONS.some(
        (definition) =>
          definition.id === camera.kind,
      )
        ? camera.kind
        : "overview";

    camera.side =
      camera.side === "b"
        ? "b"
        : "a";

    camera.slot =
      Number.isFinite(
        Number(camera.slot),
      )
        ? Math.max(
            0,
            Math.min(
              7,
              Math.round(
                Number(camera.slot),
              ),
            ),
          )
        : 0;

    const support =
      migrated.supports.find(
        (candidate) =>
          candidate.id ===
          camera.supportId,
      );

    const count =
      camera.side === "a"
        ? support?.cameraSlotsA ?? 1
        : support?.cameraSlotsB ?? 1;

    camera.slot =
      Math.max(
        0,
        Math.min(
          Math.max(
            0,
            count - 1,
          ),
          camera.slot,
        ),
      );

    camera.rotation =
      Number.isFinite(
        Number(camera.rotation),
      )
        ? Math.max(
            -90,
            Math.min(
              90,
              Number(camera.rotation),
            ),
          )
        : 0;

    camera.labelOffsetX =
      Number.isFinite(
        Number(camera.labelOffsetX),
      )
        ? Math.max(
            -360,
            Math.min(
              360,
              Number(
                camera.labelOffsetX,
              ),
            ),
          )
        : 0;

    camera.labelOffsetY =
      Number.isFinite(
        Number(camera.labelOffsetY),
      )
        ? Math.max(
            -360,
            Math.min(
              360,
              Number(
                camera.labelOffsetY,
              ),
            ),
          )
        : 54;

    const coverageDefaults = cameraCoverageDefaults(camera.kind);

    camera.coverageOffsetX =
      Number.isFinite(Number(camera.coverageOffsetX))
        ? Math.max(-2400, Math.min(2400, Number(camera.coverageOffsetX)))
        : 0;

    camera.coverageOffsetY =
      Number.isFinite(Number(camera.coverageOffsetY))
        ? Math.max(-2400, Math.min(2400, Number(camera.coverageOffsetY)))
        : 0;

    camera.coverageWidth =
      Number.isFinite(Number(camera.coverageWidth))
        ? Math.max(24, Math.min(1440, Number(camera.coverageWidth)))
        : coverageDefaults.width;

    camera.coverageDepth =
      Number.isFinite(Number(camera.coverageDepth))
        ? Math.max(24, Math.min(1800, Number(camera.coverageDepth)))
        : coverageDefaults.depth;

    camera.name =
      camera.name ||
      `${CAMERA_DEFINITIONS.find(
        (definition) =>
          definition.id === camera.kind,
      )?.prefix ?? "C"}00001`;
  }

  migrated.cabinets =
    migrated.cabinets.filter(
      (cabinet) =>
        supportIds.has(
          cabinet.supportId,
        ),
    );

  for (
    const cabinet of migrated.cabinets
  ) {
    cabinet.kind =
      CABINET_DEFINITIONS.some(
        (definition) =>
          definition.id === cabinet.kind,
      )
        ? cabinet.kind
        : "control-cabinet";

    cabinet.angle =
      Number.isFinite(
        Number(cabinet.angle),
      )
        ? Number(cabinet.angle)
        : 45;

    cabinet.distance =
      Number.isFinite(
        Number(cabinet.distance),
      )
        ? Math.max(
            34,
            Number(cabinet.distance),
          )
        : 54;

    cabinet.name =
      cabinet.name || "ШУ";
  }

  migrated.cables =
    migrated.cables.filter(
      (cable) =>
        supportIds.has(
          cable.fromSupportId,
        ) &&
        supportIds.has(
          cable.toSupportId,
        ) &&
        cable.fromSupportId !==
          cable.toSupportId,
    );

  for (
    const cable of migrated.cables
  ) {
    cable.kind =
      CABLE_DEFINITIONS.some(
        (definition) =>
          definition.id === cable.kind,
      )
        ? cable.kind
        : "fiber";

    cable.points =
      Array.isArray(cable.points)
        ? cable.points.filter(
            (point) =>
              Number.isFinite(point.x) &&
              Number.isFinite(point.y),
          )
        : [];

    cable.name =
      cable.name || "Кабель";

    cable.labelText =
      typeof cable.labelText === "string"
        ? cable.labelText
        : "";

    cable.labelAt =
      Number.isFinite(
        Number(cable.labelAt),
      )
        ? Math.max(
            0.05,
            Math.min(
              0.95,
              Number(cable.labelAt),
            ),
          )
        : 0.5;

    cable.labelOffset =
      Number.isFinite(
        Number(cable.labelOffset),
      )
        ? Math.max(
            -240,
            Math.min(
              240,
              Number(
                cable.labelOffset,
              ),
            ),
          )
        : 48;

    /* Старые назначения шкафов больше не используются. */
    cable.fromCabinetId = null;
    cable.toCabinetId = null;
  }

  const cameraIds =
    new Set(
      migrated.cameras.map(
        (camera) =>
          camera.id,
      ),
    );

  const cabinetIds =
    new Set(
      migrated.cabinets.map(
        (cabinet) =>
          cabinet.id,
      ),
    );

  migrated.cameraCables =
    migrated.cameraCables.filter(
      (cable) =>
        cameraIds.has(
          cable.targetCameraId,
        ) &&
        cabinetIds.has(
          cable.sourceCabinetId,
        ),
    );

  for (
    const cable of migrated.cameraCables
  ) {
    cable.kind =
      cable.kind === "control"
        ? "control"
        : "utp";

    cable.routing =
      cable.routing === "manual"
        ? "manual"
        : "auto";

    cable.points =
      Array.isArray(cable.points)
        ? cable.points.filter(
            (point) =>
              Number.isFinite(point.x) &&
              Number.isFinite(point.y),
          )
        : [];

    cable.name =
      cable.name ||
      (
        cable.kind === "utp"
          ? "UTP cat.5e"
          : "КГтп-ХЛ 2×2,5"
      );
  }

  migrated.junctionSettings =
    Array.isArray(
      migrated.junctionSettings,
    )
      ? migrated.junctionSettings
      : [];

  for (
    const junction of
    migrated.junctionSettings
  ) {
    junction.approaches =
      Array.isArray(
        junction.approaches,
      )
        ? junction.approaches
        : [];

    for (
      const approach of
      junction.approaches
    ) {
      approach.trafficLights =
        [
          "left",
          "right",
          "both",
        ].includes(
          approach.trafficLights,
        )
          ? approach.trafficLights
          : "none";

      const lightOffset =
        Number(
          approach.trafficLightOffset,
        );

      approach.trafficLightOffset =
        Number.isFinite(lightOffset)
          ? Math.max(
              0,
              Math.min(
                96,
                lightOffset,
              ),
            )
          : 18;
    }
  }

  migrated.gridSize =
    migrated.gridSize || 20;

  migrated.updatedAt =
    migrated.updatedAt ||
    new Date().toISOString();

  return migrated;
}
