"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoadCanvas, RoadCanvasHandle } from "./road-editor/RoadCanvas";
import { resolveJunction, roadJunctions } from "./road-editor/geometry";
import { useRoadHistory } from "./road-editor/history";
import {
  ApproachRule,
  CABINET_DEFINITIONS,
  CAMERA_DEFINITIONS,
  CABLE_DEFINITIONS,
  CabinetKind,
  CameraKind,
  CameraCableKind,
  CameraMountSide,
  cameraCableRoutePoints,
  cameraMountPosition,
  CableKind,
  createCabinet,
  createCable,
  createCameraCable,
  createDefaultProject,
  createEmptyProject,
  createLane,
  createRoad,
  createRoadCrossSection,
  createRoadFeature,
  createSeparator,
  createSupport,
  createSupportCamera,
  createTemplate,
  EditorTool,
  LaneDirection,
  LaneKind,
  LINE_MARKINGS,
  LineMarkingId,
  JunctionSetting,
  migrateProject,
  normalizeRoad,
  Point,
  RoadCrossSection,
  RoadFeatureKind,
  RoadSide,
  Selection,
  STAMP_DEFINITIONS,
  StampType,
  SUPPORT_DEFINITIONS,
  SupportKind,
  TrafficLightPlacement,
  Turn,
  uid,
} from "./road-editor/model";

type LibraryTab = "templates" | "lanes" | "features" | "markings" | "infrastructure";

const laneKinds: Array<{ id: LaneKind; name: string; symbol: string; description: string }> = [
  { id: "traffic", name: "Автомобильная", symbol: "→", description: "Обычная полоса движения" },
  { id: "tram", name: "Трамвайная", symbol: "Ⅱ", description: "Рельсы и шпалы на полотне" },
  { id: "bus", name: "Маршрутный ТС", symbol: "А", description: "Выделенная полоса" },
  { id: "bike", name: "Велополоса", symbol: "○", description: "Полоса для велосипедов" },
  { id: "median", name: "Разделитель", symbol: "▦", description: "Островок или разделительная полоса" },
];

const roadFeatureKinds: Array<{ id: RoadFeatureKind; name: string; symbol: string; description: string }> = [
  { id: "transit-stop", name: "Остановка транспорта", symbol: "А", description: "Жёлтая 1.17.1 и знак 5.16" },
  { id: "lane-widening", name: "Расширение полосы", symbol: "⇱", description: "Новая крайняя полоса от точки до конца дороги" },
  { id: "lane-narrowing", name: "Сужение полосы", symbol: "⇲", description: "Крайняя полоса от начала дороги исчезает в точке" },
  { id: "empty-pocket", name: "Пустой карман", symbol: "▭", description: "Свободный асфальтовый карман без обозначений" },
];

const featureMarkings = LINE_MARKINGS.filter((marking) => ["none", "1.1", "1.5", "1.8", "1.11"].includes(marking.id));

const turns: Array<{ id: Turn; label: string; symbol: string }> = [
  { id: "left", label: "Налево", symbol: "↰" },
  { id: "straight", label: "Прямо", symbol: "↑" },
  { id: "right", label: "Направо", symbol: "↱" },
  { id: "uturn", label: "Разворот", symbol: "↶" },
];

function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MarkingSwatch({ sample, mirrored = false }: { sample: string; mirrored?: boolean }) {
  return <span className={`marking-swatch sample-${sample}${mirrored ? " mirrored" : ""}`}><i /><i /></span>;
}

function CombinedOrientationControl({ mirrored, onChange, compact = false }: { mirrored: boolean; onChange: (mirrored: boolean) => void; compact?: boolean }) {
  return <div className={compact ? "combined-orientation compact" : "combined-orientation"}>
    <span>Сторона сплошной линии</span>
    <div className="segmented combined-orientation-buttons">
      <button className={mirrored ? "active" : ""} onClick={() => onChange(true)}>Сплошная слева</button>
      <button className={!mirrored ? "active" : ""} onClick={() => onChange(false)}>Сплошная справа</button>
    </div>
    {!compact && <small>Сторона считается по направлению оси от начала дороги к её концу.</small>}
  </div>;
}

export default function Home() {
  const initial = useMemo(() => createDefaultProject(), []);
  const history = useRoadHistory(initial);
  const { project } = history;
  const canvasRef = useRef<RoadCanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setToolState] = useState<EditorTool>("select");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("templates");
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(true);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [supportKind, setSupportKind] = useState<SupportKind>("console-pole");
  const [cableKind, setCableKind] = useState<CableKind>("fiber");
  const [cableChainSupportIds, setCableChainSupportIds] = useState<string[]>([]);
  const setTool = useCallback((nextTool: EditorTool) => {
    setToolState(nextTool);
    if (nextTool !== "cable") setCableChainSupportIds([]);
  }, []);

  const selectedRoad = selection && "roadId" in selection ? project.roads.find((road) => road.id === selection.roadId) ?? null : null;
  const selectedLane = selection?.type === "lane" ? selectedRoad?.lanes.find((lane) => lane.id === selection.laneId) ?? null : null;
  const selectedStamp = selection?.type === "stamp" ? project.stamps.find((stamp) => stamp.id === selection.stampId) ?? null : null;
  const selectedSupport = selection?.type === "support" ? project.supports.find((support) => support.id === selection.supportId) ?? null : null;
  const selectedCamera = selection?.type === "camera" ? project.cameras.find((camera) => camera.id === selection.cameraId) ?? null : null;
  const selectedCabinet = selection?.type === "cabinet" ? project.cabinets.find((cabinet) => cabinet.id === selection.cabinetId) ?? null : null;
  const selectedCable = selection?.type === "cable" ? project.cables.find((cable) => cable.id === selection.cableId) ?? null : null;
  const selectedCameraCable = selection?.type === "camera-cable" ? project.cameraCables.find((cable) => cable.id === selection.cableId) ?? null : null;
  const selectedCabinetSupport = selectedCabinet ? project.supports.find((support) => support.id === selectedCabinet.supportId) ?? null : null;
  const selectedCameraSupport = selectedCamera ? project.supports.find((support) => support.id === selectedCamera.supportId) ?? null : null;
  const selectedCameraCableSource = selectedCameraCable ? project.cabinets.find((cabinet) => cabinet.id === selectedCameraCable.sourceCabinetId) ?? null : null;
  const selectedCameraCableTarget = selectedCameraCable ? project.cameras.find((camera) => camera.id === selectedCameraCable.targetCameraId) ?? null : null;
  const selectedCameraCablePoints = selectedCameraCable ? cameraCableRoutePoints(selectedCameraCable, project.supports, project.cabinets, project.cameras) : [];
  const selectedCameraCableLength = selectedCameraCablePoints.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - selectedCameraCablePoints[index].x, point.y - selectedCameraCablePoints[index].y), 0);
  const selectedCablePoints = selectedCable ? [
    project.supports.find((support) => support.id === selectedCable.fromSupportId),
    ...selectedCable.points,
    project.supports.find((support) => support.id === selectedCable.toSupportId),
  ].filter((point): point is { x: number; y: number } => Boolean(point)) : [];
  const selectedCableLength = selectedCablePoints.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - selectedCablePoints[index].x, point.y - selectedCablePoints[index].y), 0);
  const selectedFeature = selection?.type === "feature"
    ? selectedRoad?.features.find((feature) => feature.id === selection.featureId) ?? null
    : null;
  const selectedLaneTransition = selectedFeature?.kind === "lane-widening" || selectedFeature?.kind === "lane-narrowing";
  const selectedVertex = selection?.type === "vertex" && selectedRoad ? selectedRoad.points[selection.index] ?? null : null;
  const selectedVertexStation = selection?.type === "vertex" && selectedRoad
    ? selectedRoad.points.slice(1, selection.index + 1).reduce((sum, point, index) => sum + Math.hypot(point.x - selectedRoad.points[index].x, point.y - selectedRoad.points[index].y), 0)
    : 0;
  const selectedCrossSection = selection?.type === "cross-section" && selectedRoad
    ? selectedRoad.crossSections.find((section) => section.id === selection.sectionId) ?? null
    : null;
  const selectedRoadLength = selectedRoad?.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - selectedRoad.points[index].x, point.y - selectedRoad.points[index].y), 0) ?? 0;
  const selectedSection = selection?.type === "separator" && selectedRoad
    ? selectedRoad.separators[selection.index]?.find((section) => section.id === selection.sectionId) ?? null
    : null;
  const selectedMarking = selectedSection?.marking ?? null;
  const junctions = roadJunctions(project.roads).map((junction) => resolveJunction(
    junction,
    project.roads,
    project.junctionSettings.find((setting) => setting.id === junction.id),
  ));
  const selectedJunction = selection?.type === "junction" ? junctions.find((junction) => junction.id === selection.junctionId) ?? null : null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2400);
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem("road-editor:last-project");
        if (stored) history.reset(migrateProject(JSON.parse(stored)));
      } catch {
        showToast("Локальный проект не прочитан — открыт пример");
      }
    }, 0);
    return () => window.clearTimeout(restore);
    // Client-only restoration should happen exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mark = window.setTimeout(() => setSaved(false), 0);
    const save = window.setTimeout(() => {
      localStorage.setItem("road-editor:last-project", JSON.stringify(project));
      setSaved(true);
    }, 500);
    return () => {
      window.clearTimeout(mark);
      window.clearTimeout(save);
    };
  }, [project]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === "support") {
      history.commit((draft) => {
        const cameraIds = new Set(draft.cameras.filter((camera) => camera.supportId === selection.supportId).map((camera) => camera.id));
        const cabinetIds = new Set(draft.cabinets.filter((cabinet) => cabinet.supportId === selection.supportId).map((cabinet) => cabinet.id));
        draft.supports = draft.supports.filter((support) => support.id !== selection.supportId);
        draft.cameras = draft.cameras.filter((camera) => camera.supportId !== selection.supportId);
        draft.cabinets = draft.cabinets.filter((cabinet) => cabinet.supportId !== selection.supportId);
        draft.cables = draft.cables.filter((cable) => cable.fromSupportId !== selection.supportId && cable.toSupportId !== selection.supportId);
        draft.cameraCables = draft.cameraCables.filter((cable) => !cameraIds.has(cable.targetCameraId) && !cabinetIds.has(cable.sourceCabinetId));
      });
      setCableChainSupportIds((current) => current.filter((supportId) => supportId !== selection.supportId));
    } else if (selection.type === "camera") {
      history.commit((draft) => {
        draft.cameras = draft.cameras.filter((camera) => camera.id !== selection.cameraId);
        draft.cameraCables = draft.cameraCables.filter((cable) => cable.targetCameraId !== selection.cameraId);
      });
    } else if (selection.type === "cabinet") {
      history.commit((draft) => {
        draft.cabinets = draft.cabinets.filter((cabinet) => cabinet.id !== selection.cabinetId);
        draft.cameraCables = draft.cameraCables.filter((cable) => cable.sourceCabinetId !== selection.cabinetId);
      });
    } else if (selection.type === "cable") {
      history.commit((draft) => { draft.cables = draft.cables.filter((cable) => cable.id !== selection.cableId); });
    } else if (selection.type === "camera-cable") {
      history.commit((draft) => { draft.cameraCables = draft.cameraCables.filter((cable) => cable.id !== selection.cableId); });
    } else if (selection.type === "road") {
      history.commit((draft) => {
        draft.roads = draft.roads.filter((road) => road.id !== selection.roadId);
        draft.junctionSettings = draft.junctionSettings.filter((setting) => !setting.id.includes(selection.roadId));
      });
    } else if (selection.type === "vertex") {
      history.commit((draft) => {
        const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
        if (road && road.points.length > 2) road.points.splice(selection.index, 1);
      });
    } else if (selection.type === "cross-section") {
      history.commit((draft) => {
        const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
        const section = road?.crossSections.find((candidate) => candidate.id === selection.sectionId);
        if (road && section && section.at > 0.0001 && section.at < 0.9999) {
          road.crossSections = road.crossSections.filter((candidate) => candidate.id !== selection.sectionId);
          normalizeRoad(road);
        }
      });
    } else if (selection.type === "stamp") {
      history.commit((draft) => { draft.stamps = draft.stamps.filter((stamp) => stamp.id !== selection.stampId); });
    } else if (selection.type === "separator") {
      history.commit((draft) => {
        const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
        const section = road?.separators[selection.index]?.find((candidate) => candidate.id === selection.sectionId);
        if (section) section.marking = "none";
      });
    } else if (selection.type === "feature") {
      history.commit((draft) => {
        const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
        if (road) road.features = road.features.filter((feature) => feature.id !== selection.featureId);
      });
    } else if (selection.type === "lane") {
      history.commit((draft) => {
        const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
        if (!road || road.lanes.length <= 1) return;
        const index = road.lanes.findIndex((lane) => lane.id === selection.laneId);
        if (index < 0) return;
        road.lanes.splice(index, 1);
        const separatorToRemove = index === road.lanes.length ? index : index + 1;
        road.separators.splice(separatorToRemove, 1);
        normalizeRoad(road);
      });
    }
    setSelection(null);
    setAnchor(null);
  }, [history, selection]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key.toLowerCase() === "r") setTool("road");
      else if (event.key.toLowerCase() === "b") setTool("branch");
      else if (event.key.toLowerCase() === "p") setTool("cross-section");
      else if (event.key.toLowerCase() === "m") setTool("marking-break");
      else if (event.key.toLowerCase() === "o") setTool("support");
      else if (event.key.toLowerCase() === "k") setTool("cable");
      else if (event.key.toLowerCase() === "v") setTool("select");
      else if (event.key.toLowerCase() === "h") setTool("pan");
      else if (event.key === "Escape") {
        setTool("select");
        setSelection(null);
        setAnchor(null);
        setCableChainSupportIds([]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection, history, setTool]);

  function chooseSelection(next: Selection, nextAnchor?: Point) {
    setSelection(next);
    setAnchor(nextAnchor ?? null);
    if (next) {
      setTool("select");
      setCableChainSupportIds([]);
    }
  }

  function createRoadFromDrag(start: Point, end: Point, kind: "road" | "branch") {
    const road = createRoad([start, end], kind === "branch" ? `Ответвление ${project.roads.length + 1}` : `Улица ${project.roads.length + 1}`);
    if (kind === "branch") {
      road.lanes = [createLane("forward"), createLane("backward")];
      road.separators = [createSeparator("1.2"), createSeparator("1.1"), createSeparator("1.2")];
    }
    history.commit((draft) => { draft.roads.push(road); });
    setSelection({ type: "road", roadId: road.id });
    setTool("select");
    showToast(kind === "branch" ? "Ответвление добавлено" : "Проезжая часть добавлена");
  }

  function createStampAt(type: StampType, point: Point) {
    const stamp = { id: uid("stamp"), type, x: point.x, y: point.y, rotation: 0, scale: 1 };
    history.commit((draft) => { draft.stamps.push(stamp); });
    setSelection({ type: "stamp", stampId: stamp.id });
    setTool("select");
  }

  function createSupportAt(point: Point) {
    const support = createSupport(supportKind, point, project.supports.length + 1);
    history.commit((draft) => { draft.supports.push(support); });
    setSelection({ type: "support", supportId: support.id });
    setAnchor(null);
    setTool("select");
    showToast(`${SUPPORT_DEFINITIONS.find((definition) => definition.id === supportKind)?.name ?? "Опора"} добавлена`);
  }

  function connectSupport(supportId: string) {
    const previousSupportId = cableChainSupportIds.at(-1);
    if (!previousSupportId) {
      setCableChainSupportIds([supportId]);
      setSelection({ type: "support", supportId });
      setAnchor(null);
      showToast("Первая опора выбрана — укажите следующую");
      return;
    }
    if (previousSupportId === supportId) {
      showToast("Выберите другую опору");
      return;
    }
    if (cableChainSupportIds.includes(supportId)) {
      showToast("Эта опора уже входит в текущую цепочку");
      return;
    }
    const cable = createCable(previousSupportId, supportId, cableKind, project.cables.length + 1);
    history.commit((draft) => { draft.cables.push(cable); });
    setCableChainSupportIds((current) => [...current, supportId]);
    setSelection({ type: "cable", cableId: cable.id });
    setAnchor(null);
    showToast("Участок добавлен — выберите следующую опору или завершите трассу");
  }

  function finishCableChain() {
    const segments = Math.max(0, cableChainSupportIds.length - 1);
    setCableChainSupportIds([]);
    setTool("select");
    setAnchor(null);
    showToast(segments ? `Кабельная трасса завершена · ${segments} участ.` : "Прокладка кабеля отменена");
  }

  function addCabinetToSupport(kind: CabinetKind) {
    if (!selectedSupport) {
      showToast("Сначала выберите опору");
      return;
    }
    const cabinet = createCabinet(selectedSupport.id, kind, project.cabinets.filter((candidate) => candidate.supportId === selectedSupport.id).length + 1);
    history.commit((draft) => { draft.cabinets.push(cabinet); });
    setSelection({ type: "cabinet", cabinetId: cabinet.id });
    setAnchor(null);
    showToast(`${CABINET_DEFINITIONS.find((definition) => definition.id === kind)?.name ?? "Оборудование"} прикреплено`);
  }

  function addCameraToSupport(kind: CameraKind, supportId = selectedSupport?.id ?? selectedCameraSupport?.id) {
    const support = project.supports.find((candidate) => candidate.id === supportId);
    if (!support || support.kind !== "console-pole") {
      showToast("Сначала выберите консольную опору");
      return;
    }
    const occupied = new Set(project.cameras.filter((camera) => camera.supportId === support.id).map((camera) => `${camera.side}:${camera.slot}`));
    const free = (["a", "b"] as CameraMountSide[]).flatMap((side) => {
      const count = side === "a" ? support.cameraSlotsA : support.cameraSlotsB;
      return Array.from({ length: count }, (_, slot) => ({ side, slot }));
    }).find((mount) => !occupied.has(`${mount.side}:${mount.slot}`));
    if (!free) {
      showToast("На балке нет свободных мест — увеличьте их количество");
      return;
    }
    const camera = createSupportCamera(
      support.id,
      kind,
      free.side,
      free.slot,
      project.cameras.filter((candidate) => candidate.kind === kind).length + 1,
    );
    history.commit((draft) => { draft.cameras.push(camera); });
    setSelection({ type: "camera", cameraId: camera.id });
    setAnchor(null);
    showToast(`${CAMERA_DEFINITIONS.find((definition) => definition.id === kind)?.name ?? "Камера"} установлена`);
  }

  function cameraCableSource(supportId: string, kind: CameraCableKind) {
    const attached = project.cabinets.filter((cabinet) => cabinet.supportId === supportId);
    if (kind === "utp") return attached.find((cabinet) => cabinet.kind === "control-cabinet") ?? attached.find((cabinet) => cabinet.kind === "phoenix-node") ?? attached[0];
    return attached.find((cabinet) => cabinet.kind === "phoenix-node") ?? attached.find((cabinet) => cabinet.kind === "control-cabinet") ?? attached[0];
  }

  function autoConnectSupportCameras(supportId: string) {
    const cameras = project.cameras.filter((camera) => camera.supportId === supportId);
    if (!cameras.length) { showToast("На опоре пока нет камер"); return; }
    let controlSource = cameraCableSource(supportId, "utp");
    const createdSource = controlSource ? null : createCabinet(supportId, "control-cabinet", project.cabinets.filter((cabinet) => cabinet.supportId === supportId).length + 1);
    controlSource = controlSource ?? createdSource ?? undefined;
    if (!controlSource) return;
    const controlCableSource = cameraCableSource(supportId, "control") ?? controlSource;
    const additions = cameras.flatMap((camera) => (["utp", "control"] as CameraCableKind[]).flatMap((kind) => {
      const exists = project.cameraCables.some((cable) => cable.targetCameraId === camera.id && cable.kind === kind);
      if (exists) return [];
      const source = kind === "utp" ? controlSource! : controlCableSource;
      return [createCameraCable(source.id, camera.id, kind, "auto", project.cameraCables.length + 1)];
    }));
    history.commit((draft) => {
      if (createdSource) draft.cabinets.push(createdSource);
      draft.cameraCables.push(...additions);
    });
    showToast(additions.length ? `Подключено линий: ${additions.length}` : "Все камеры уже подключены");
  }

  function addManualCameraCable(kind: CameraCableKind) {
    if (!selectedCamera || !selectedCameraSupport) return;
    const existing = project.cameraCables.find((cable) => cable.targetCameraId === selectedCamera.id && cable.kind === kind);
    if (existing) {
      setSelection({ type: "camera-cable", cableId: existing.id });
      showToast("Такое соединение уже существует");
      return;
    }
    let source = cameraCableSource(selectedCameraSupport.id, kind);
    const createdSource = source ? null : createCabinet(selectedCameraSupport.id, "control-cabinet", project.cabinets.filter((cabinet) => cabinet.supportId === selectedCameraSupport.id).length + 1);
    source = source ?? createdSource ?? undefined;
    if (!source) return;
    const cable = createCameraCable(source.id, selectedCamera.id, kind, "auto", project.cameraCables.length + 1);
    history.commit((draft) => {
      if (createdSource) draft.cabinets.push(createdSource);
      const automatic = cameraCableRoutePoints(cable, draft.supports, draft.cabinets, draft.cameras);
      cable.routing = "manual";
      cable.points = automatic.slice(1, -1);
      draft.cameraCables.push(cable);
    });
    setSelection({ type: "camera-cable", cableId: cable.id });
    setAnchor(null);
    showToast(`${kind === "utp" ? "UTP" : "КГтп"} добавлен в ручном режиме`);
  }

  function updateCameraCable(recipe: (cable: NonNullable<typeof selectedCameraCable>) => void) {
    if (!selectedCameraCable) return;
    history.commit((draft) => {
      const cable = draft.cameraCables.find((candidate) => candidate.id === selectedCameraCable.id);
      if (cable) recipe(cable);
    });
  }

  function setCameraCableRouting(routing: "auto" | "manual") {
    if (!selectedCameraCable) return;
    history.commit((draft) => {
      const cable = draft.cameraCables.find((candidate) => candidate.id === selectedCameraCable.id);
      if (!cable) return;
      if (routing === "manual" && cable.routing !== "manual") cable.points = cameraCableRoutePoints(cable, draft.supports, draft.cabinets, draft.cameras).slice(1, -1);
      if (routing === "auto") cable.points = [];
      cable.routing = routing;
    });
  }

  function insertCameraCablePoint(cableId: string, point: Point, index: number) {
    history.commit((draft) => {
      const cable = draft.cameraCables.find((candidate) => candidate.id === cableId);
      if (!cable) return;
      if (cable.routing !== "manual") {
        cable.points = cameraCableRoutePoints(cable, draft.supports, draft.cabinets, draft.cameras).slice(1, -1);
        cable.routing = "manual";
      }
      cable.points.splice(index, 0, point);
    });
  }

  function updateSupportCameraSlotCount(side: CameraMountSide, value: number) {
    if (!selectedSupport) return;
    const requested = Math.max(0, Math.min(8, Math.round(value)));
    const mounted = project.cameras.filter((camera) => camera.supportId === selectedSupport.id && camera.side === side);
    const minimum = mounted.reduce((max, camera) => Math.max(max, camera.slot + 1), 0);
    if (requested < minimum) {
      showToast("Сначала перенесите или удалите камеры с крайних мест");
      return;
    }
    updateSupport((support) => {
      if (side === "a") support.cameraSlotsA = requested;
      else support.cameraSlotsB = requested;
    });
  }

  function updateConsoleLength(value: number) {
    if (!selectedSupport) return;
    const length = Math.max(60, Math.min(180, value));
    history.commit((draft) => {
      const support = draft.supports.find((candidate) => candidate.id === selectedSupport.id);
      if (!support) return;
      support.consoleLength = length;
      support.cameraMountOffset = Math.max(14, Math.min(length - 6, support.cameraMountOffset));
    });
  }

  function updateSupport(recipe: (support: NonNullable<typeof selectedSupport>) => void) {
    if (!selectedSupport) return;
    history.commit((draft) => {
      const support = draft.supports.find((candidate) => candidate.id === selectedSupport.id);
      if (support) recipe(support);
    });
  }

  function updateCabinet(recipe: (cabinet: NonNullable<typeof selectedCabinet>) => void) {
    if (!selectedCabinet) return;
    history.commit((draft) => {
      const cabinet = draft.cabinets.find((candidate) => candidate.id === selectedCabinet.id);
      if (cabinet) recipe(cabinet);
    });
  }

  function updateCamera(recipe: (camera: NonNullable<typeof selectedCamera>) => void) {
    if (!selectedCamera) return;
    history.commit((draft) => {
      const camera = draft.cameras.find((candidate) => candidate.id === selectedCamera.id);
      if (camera) recipe(camera);
    });
  }

  function assignCameraMount(cameraId: string, side: CameraMountSide, slot: number, transient = false) {
    const apply = (draft: typeof project) => {
      const camera = draft.cameras.find((candidate) => candidate.id === cameraId);
      if (!camera) return;
      const support = draft.supports.find((candidate) => candidate.id === camera.supportId);
      if (!support) return;
      const previous = { side: camera.side, slot: camera.slot };
      const occupied = draft.cameras.find((candidate) => candidate.id !== camera.id && candidate.supportId === camera.supportId && candidate.side === side && candidate.slot === slot);
      camera.side = side;
      camera.slot = slot;
      if (occupied) {
        occupied.side = previous.side;
        occupied.slot = previous.slot;
      }
    };
    if (transient) history.transient(apply);
    else history.commit(apply);
  }

  function updateCable(recipe: (cable: NonNullable<typeof selectedCable>) => void) {
    if (!selectedCable) return;
    history.commit((draft) => {
      const cable = draft.cables.find((candidate) => candidate.id === selectedCable.id);
      if (cable) recipe(cable);
    });
  }

  function updateRoad(recipe: (road: NonNullable<typeof selectedRoad>) => void) {
    if (!selectedRoad) return;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      if (road) recipe(road);
    });
  }

  function updateSelectedVertex(recipe: (point: Point) => void) {
    if (selection?.type !== "vertex") return;
    history.commit((draft) => {
      const point = draft.roads.find((road) => road.id === selection.roadId)?.points[selection.index];
      if (point) recipe(point);
    });
  }

  function addCrossSection(roadId: string, at: number) {
    const road = project.roads.find((candidate) => candidate.id === roadId);
    if (!road) return;
    const existing = road.crossSections.find((section) => Math.abs(section.at - at) < 0.012);
    if (existing) {
      setSelection({ type: "cross-section", roadId, sectionId: existing.id });
      setTool("select");
      showToast("Выбран существующий поперечник");
      return;
    }
    const section = createRoadCrossSection(road, at);
    history.commit((draft) => {
      const target = draft.roads.find((candidate) => candidate.id === roadId);
      if (!target) return;
      target.crossSections.push(section);
      normalizeRoad(target);
    });
    setSelection({ type: "cross-section", roadId, sectionId: section.id });
    setAnchor(null);
    setTool("select");
    showToast("Контрольный поперечник добавлен");
  }

  function updateCrossSection(recipe: (section: RoadCrossSection) => void) {
    if (selection?.type !== "cross-section") return;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
      const section = road?.crossSections.find((candidate) => candidate.id === selection.sectionId);
      if (road && section) {
        recipe(section);
        normalizeRoad(road);
      }
    });
  }

  function addLaneFromCrossSection(side: "left" | "right") {
    if (!selectedRoad || !selectedCrossSection || selectedCrossSection.at >= 0.99) return;
    const lane = createLane(side === "left" ? "forward" : "backward");
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      const startSection = road?.crossSections.find((section) => section.id === selectedCrossSection.id);
      if (!road || !startSection) return;
      const insertIndex = side === "left" ? 0 : road.lanes.length;
      const oldLength = road.lanes.length;
      road.lanes.splice(insertIndex, 0, lane);
      road.separators.splice(insertIndex === oldLength ? insertIndex : insertIndex + 1, 0, createSeparator("1.5"));
      for (const section of road.crossSections) section.laneWidths[lane.id] = section.at <= startSection.at + 0.0001 ? 0 : lane.width;
      const totalLength = road.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - road.points[index].x, point.y - road.points[index].y), 0) || 1;
      const finishAt = Math.min(1, startSection.at + Math.max(0.03, Math.min(0.22, 96 / totalLength)));
      let finish = road.crossSections.find((section) => Math.abs(section.at - finishAt) < 0.012);
      if (!finish) {
        finish = createRoadCrossSection(road, finishAt);
        road.crossSections.push(finish);
      }
      finish.laneWidths[lane.id] = lane.width;
      normalizeRoad(road);
    });
    showToast("Новая полоса создана от поперечника с плавным отгоном");
  }

  function setLaneWidthFromCrossSection(laneId: string, width: number) {
    if (!selectedRoad || !selectedCrossSection) return;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      if (!road) return;
      for (const section of road.crossSections) {
        if (section.at >= selectedCrossSection.at - 0.0001) section.laneWidths[laneId] = width;
      }
      normalizeRoad(road);
    });
  }

  function updateLane(recipe: (lane: NonNullable<typeof selectedLane>) => void) {
    if (!selectedRoad || !selectedLane) return;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      const lane = road?.lanes.find((candidate) => candidate.id === selectedLane.id);
      if (lane) recipe(lane);
    });
  }

  function addLane(kind: LaneKind, side: "left" | "right" = "right") {
    if (!selectedRoad) {
      showToast("Сначала выберите дорогу или полосу");
      return;
    }
    const direction: LaneDirection = selectedLane?.direction ?? (side === "left" ? "forward" : "backward");
    const lane = createLane(direction, kind);
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      if (!road) return;
      const selectedIndex = selectedLane ? road.lanes.findIndex((candidate) => candidate.id === selectedLane.id) : -1;
      const insertIndex = selectedIndex >= 0
        ? (side === "left" ? selectedIndex : selectedIndex + 1)
        : (side === "left" ? 0 : road.lanes.length);
      const oldLength = road.lanes.length;
      road.lanes.splice(insertIndex, 0, lane);
      road.separators.splice(insertIndex === oldLength ? insertIndex : insertIndex + 1, 0, createSeparator(kind === "tram" ? "1.1" : "1.5"));
      normalizeRoad(road);
    });
    setSelection({ type: "lane", roadId: selectedRoad.id, laneId: lane.id });
    showToast(`${lane.name} добавлена`);
  }

  function addRoadFeature(kind: RoadFeatureKind) {
    if (!selectedRoad) {
      showToast("Сначала выберите дорогу или полосу");
      return;
    }
    let side: RoadSide = "right";
    if (selectedLane) {
      const laneIndex = selectedRoad.lanes.findIndex((lane) => lane.id === selectedLane.id);
      side = laneIndex < selectedRoad.lanes.length / 2 ? "right" : "left";
    }
    const feature = createRoadFeature(kind, side);
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      if (road) road.features.push(feature);
    });
    setSelection({ type: "feature", roadId: selectedRoad.id, featureId: feature.id });
    setAnchor(null);
    setTool("select");
    showToast(`${roadFeatureKinds.find((candidate) => candidate.id === kind)?.name ?? "Дорожный объект"} добавлен`);
  }

  function updateRoadFeature(recipe: (feature: NonNullable<typeof selectedFeature>) => void) {
    if (!selectedRoad || !selectedFeature) return;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selectedRoad.id);
      const feature = road?.features.find((candidate) => candidate.id === selectedFeature.id);
      if (feature) recipe(feature);
    });
  }

  function setMarking(marking: LineMarkingId, mirrored = selectedSection?.mirrored ?? false) {
    if (selection?.type !== "separator" || !selectedSection) return;
    const chosenStart = Math.max(selectedSection.start, selection.start ?? selectedSection.start);
    const chosenEnd = Math.min(selectedSection.end, selection.end ?? selectedSection.end);
    const materialize = chosenStart > selectedSection.start + 0.0001 || chosenEnd < selectedSection.end - 0.0001;
    const selectedId = materialize ? uid("marking") : selectedSection.id;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
      const sections = road?.separators[selection.index];
      const sectionIndex = sections?.findIndex((candidate) => candidate.id === selection.sectionId) ?? -1;
      if (!sections || sectionIndex < 0) return;
      const section = sections[sectionIndex];
      if (!materialize) {
        section.marking = marking;
        section.mirrored = mirrored;
        return;
      }
      const pieces = [];
      if (chosenStart > section.start + 0.0001) pieces.push({ id: uid("marking"), start: section.start, end: chosenStart, marking: section.marking, mirrored: section.mirrored });
      pieces.push({ id: selectedId, start: chosenStart, end: chosenEnd, marking, mirrored });
      if (chosenEnd < section.end - 0.0001) pieces.push({ id: uid("marking"), start: chosenEnd, end: section.end, marking: section.marking, mirrored: section.mirrored });
      sections.splice(sectionIndex, 1, ...pieces);
    });
    if (materialize) setSelection({ ...selection, sectionId: selectedId, start: chosenStart, end: chosenEnd });
  }

  function updateJunction(recipe: (setting: JunctionSetting) => void) {
    if (!selectedJunction) return;
    const fallback = JSON.parse(JSON.stringify(selectedJunction.setting)) as JunctionSetting;
    history.commit((draft) => {
      let setting = draft.junctionSettings.find((candidate) => candidate.id === selectedJunction.id);
      if (!setting) {
        setting = fallback;
        draft.junctionSettings.push(setting);
      }
      recipe(setting);
    });
  }

  function updateApproach(approachId: string, recipe: (approach: JunctionSetting["approaches"][number]) => void) {
    updateJunction((setting) => {
      let approach = setting.approaches.find((candidate) => candidate.id === approachId);
      if (!approach) {
        const fallback = selectedJunction?.approaches.find((candidate) => candidate.id === approachId);
        if (!fallback) return;
        approach = {
          id: fallback.id,
          rule: fallback.rule,
          offset: fallback.offset,
          stopLine: fallback.stopLine,
          trafficLights: fallback.trafficLights,
          trafficLightOffset: fallback.trafficLightOffset,
        };
        setting.approaches.push(approach);
      }
      recipe(approach);
    });
  }

  function splitMarking(roadId: string, index: number, sectionId: string, at: number) {
    const currentRoad = project.roads.find((candidate) => candidate.id === roadId);
    const currentSection = currentRoad?.separators[index]?.find((section) => section.id === sectionId);
    if (!currentSection) return;
    const splitAt = Math.max(currentSection.start + 0.015, Math.min(currentSection.end - 0.015, at));
    if (splitAt <= currentSection.start + 0.014 || splitAt >= currentSection.end - 0.014) return;
    const leftId = uid("marking");
    const rightId = uid("marking");
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === roadId);
      const sections = road?.separators[index];
      const sectionIndex = sections?.findIndex((section) => section.id === sectionId) ?? -1;
      if (!sections || sectionIndex < 0) return;
      const section = sections[sectionIndex];
      sections.splice(sectionIndex, 1,
        { id: leftId, start: section.start, end: splitAt, marking: section.marking, mirrored: section.mirrored },
        { id: rightId, start: splitAt, end: section.end, marking: section.marking, mirrored: section.mirrored },
      );
    });
    setSelection({ type: "separator", roadId, index, sectionId: rightId, at: splitAt });
    setTool("select");
    showToast("Точка разделения добавлена");
  }

  function mergeMarking(direction: "previous" | "next") {
    if (selection?.type !== "separator" || !selectedRoad) return;
    const currentSections = selectedRoad.separators[selection.index];
    const currentIndex = currentSections?.findIndex((section) => section.id === selection.sectionId) ?? -1;
    if (!currentSections || currentIndex < 0) return;
    if (direction === "previous" && currentIndex <= 0) return;
    if (direction === "next" && currentIndex >= currentSections.length - 1) return;
    const targetId = direction === "previous" ? currentSections[currentIndex - 1].id : currentSections[currentIndex].id;
    const targetAt = direction === "previous" ? currentSections[currentIndex].end : currentSections[currentIndex + 1].end;
    history.commit((draft) => {
      const road = draft.roads.find((candidate) => candidate.id === selection.roadId);
      const sections = road?.separators[selection.index];
      const index = sections?.findIndex((section) => section.id === selection.sectionId) ?? -1;
      if (!sections || index < 0) return;
      if (direction === "previous" && index > 0) {
        sections[index - 1].end = sections[index].end;
        sections.splice(index, 1);
      } else if (direction === "next" && index < sections.length - 1) {
        sections[index].end = sections[index + 1].end;
        sections.splice(index + 1, 1);
      }
    });
    setSelection({ ...selection, sectionId: targetId, at: targetAt });
  }

  function applyTemplate(kind: "straight" | "cross" | "tee" | "tram") {
    history.commit((draft) => {
      draft.roads = createTemplate(kind);
      draft.stamps = [];
      draft.junctionSettings = [];
    });
    setSelection(null);
    window.setTimeout(() => canvasRef.current?.fit(), 0);
  }

  function resetIntersection() {
    if (!window.confirm("Очистить текущую схему и начать заново?")) return;
    history.reset(createEmptyProject());
    setSelection(null);
    setAnchor(null);
    setTool("select");
    localStorage.removeItem("road-editor:last-project");
    showToast("Схема очищена — можно начать заново");
    window.setTimeout(() => canvasRef.current?.fit(), 0);
  }

  function exportProject() {
    download(`${project.name || "intersection"}.json`, JSON.stringify(project, null, 2), "application/json;charset=utf-8");
  }

  function exportSvg() {
    const svg = canvasRef.current?.svg();
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll(".node-handle,.editor-only").forEach((node) => node.remove());
    download(`${project.name || "intersection"}.svg`, new XMLSerializer().serializeToString(clone), "image/svg+xml;charset=utf-8");
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = migrateProject(JSON.parse(await file.text()));
      history.reset(next);
      setSelection(null);
      showToast("Проект открыт");
      window.setTimeout(() => canvasRef.current?.fit(), 0);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось открыть проект");
    } finally {
      event.target.value = "";
    }
  }

  const quickPanel = anchor && selection && (
    <div
      className={anchor.y < 190 ? "direct-editor below" : "direct-editor"}
      style={{ left: Math.min(anchor.x + 12, 720), top: anchor.y < 190 ? anchor.y + 14 : anchor.y - 12 }}
    >
      {selection.type === "separator" && (
        <>
          <div className="direct-title"><span>Линия разметки</span><button onClick={() => setAnchor(null)}>×</button></div>
          <div className="direct-markings">
            {LINE_MARKINGS.map((marking) => (
              <button key={marking.id} className={selectedMarking === marking.id ? "active" : ""} onClick={() => setMarking(marking.id)} title={marking.purpose}>
                <MarkingSwatch sample={marking.sample} mirrored={marking.id === "1.11" && Boolean(selectedSection?.mirrored)} /><span>{marking.id === "none" ? "нет" : marking.id}</span>
              </button>
            ))}
          </div>
          {selectedMarking === "1.11" && selectedSection && <CombinedOrientationControl compact mirrored={selectedSection.mirrored} onChange={(mirrored) => setMarking("1.11", mirrored)} />}
          <button className="split-here" onClick={() => splitMarking(selection.roadId, selection.index, selection.sectionId, selection.at)}>＋ Точка разделения здесь</button>
        </>
      )}
      {selection.type === "lane" && selectedLane && (
        <>
          <div className="direct-title"><span>{selectedLane.name}</span><button onClick={() => setAnchor(null)}>×</button></div>
          <div className="direct-row">
            <button title="Добавить слева" onClick={() => addLane("traffic", "left")}>＋ слева</button>
            <button title="Направление" onClick={() => updateLane((lane) => { lane.direction = lane.direction === "forward" ? "backward" : "forward"; })}>
              {selectedLane.direction === "forward" ? "→" : selectedLane.direction === "backward" ? "←" : "↔"}
            </button>
            <button title="Добавить справа" onClick={() => addLane("traffic", "right")}>справа ＋</button>
          </div>
          <div className="direct-row compact">
            <button onClick={() => updateLane((lane) => { lane.kind = "traffic"; lane.name = "Полоса движения"; })}>Авто</button>
            <button onClick={() => updateLane((lane) => { lane.kind = "tram"; lane.name = "Трамвайный путь"; lane.width = 38; })}>Трамвай</button>
            <button onClick={() => updateLane((lane) => { lane.kind = "bus"; lane.name = "Полоса МТС"; })}>МТС</button>
          </div>
        </>
      )}
      {selection.type === "feature" && selectedFeature && (
        <>
          <div className="direct-title"><span>{roadFeatureKinds.find((kind) => kind.id === selectedFeature.kind)?.name}{selectedFeature.kind === "lane-widening" ? " → конец" : selectedFeature.kind === "lane-narrowing" ? " · от начала" : ""}</span><button onClick={() => setAnchor(null)}>×</button></div>
          <div className="direct-row feature-side-direct">
            <button className={selectedFeature.side === "left" ? "active" : ""} onClick={() => updateRoadFeature((feature) => { feature.side = "left"; })}>Слева</button>
            <button className={selectedFeature.side === "right" ? "active" : ""} onClick={() => updateRoadFeature((feature) => { feature.side = "right"; })}>Справа</button>
          </div>
          {selectedFeature.kind === "transit-stop"
            ? <div className="direct-feature-marking locked"><span>Линия примыкания</span><strong>1.17.1 · жёлтая</strong></div>
            : <>
              <label className="direct-feature-marking"><span>Линия примыкания</span><select value={selectedFeature.innerMarking} onChange={(event) => updateRoadFeature((feature) => { feature.innerMarking = event.target.value as LineMarkingId; })}>{featureMarkings.map((marking) => <option key={marking.id} value={marking.id}>{marking.name}</option>)}</select></label>
              {selectedFeature.innerMarking === "1.11" && <CombinedOrientationControl compact mirrored={selectedFeature.innerMarkingMirrored} onChange={(mirrored) => updateRoadFeature((feature) => { feature.innerMarkingMirrored = mirrored; })} />}
            </>}
        </>
      )}
      {selection.type === "junction" && selectedJunction && (
        <>
          <div className="direct-title"><span>Перекрёсток</span><button onClick={() => setAnchor(null)}>×</button></div>
          <div className="direct-row junction-direct">
            <button className={selectedJunction.setting.extent === "half" ? "active" : ""} disabled={!selectedJunction.supportsHalf} onClick={() => updateJunction((setting) => { setting.extent = "half"; })}>Съезд · до оси</button>
            <button className={selectedJunction.setting.extent === "full" ? "active" : ""} onClick={() => updateJunction((setting) => { setting.extent = "full"; })}>Перекрёсток</button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <main className="road-editor-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">П</span>
          <div><strong>Перекрёсток</strong><small>интерактивный конструктор</small></div>
        </div>
        <label className="project-name">
          <input value={project.name} onChange={(event) => history.commit((draft) => { draft.name = event.target.value; })} aria-label="Название проекта" />
          <span className={saved ? "saved" : "saving"}>{saved ? "Сохранено локально" : "Сохранение…"}</span>
        </label>
        <div className="top-actions">
          <button onClick={history.undo} disabled={!history.canUndo} title="Отменить (Ctrl+Z)">↶</button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Повторить (Ctrl+Y)">↷</button>
          <i />
          <button className="reset-action" onClick={resetIntersection}>Начать заново</button>
          <button onClick={() => fileRef.current?.click()}>Открыть</button>
          <button onClick={exportProject}>Сохранить JSON</button>
          <button className="primary" onClick={exportSvg}>Экспорт SVG</button>
        </div>
        <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importProject} />
      </header>

      <section className="editor-layout">
        <aside className="library">
          <div className="library-heading">
            <p>Конструктор</p>
            <h1>Соберите дорогу</h1>
            <span>Добавляйте полосы и разметку прямо на схеме.</span>
          </div>
          <div className="library-tabs">
            <button className={libraryTab === "templates" ? "active" : ""} onClick={() => setLibraryTab("templates")}>Заготовки</button>
            <button className={libraryTab === "lanes" ? "active" : ""} onClick={() => setLibraryTab("lanes")}>Полосы</button>
            <button className={libraryTab === "features" ? "active" : ""} onClick={() => setLibraryTab("features")}>Участки</button>
            <button className={libraryTab === "markings" ? "active" : ""} onClick={() => setLibraryTab("markings")}>Разметка</button>
            <button className={libraryTab === "infrastructure" ? "active" : ""} onClick={() => setLibraryTab("infrastructure")}>Инженерия</button>
          </div>

          <div className="library-content">
            {libraryTab === "templates" && (
              <>
                <p className="section-label">Быстрый старт</p>
                <div className="template-grid">
                  <button onClick={() => applyTemplate("straight")}><span className="template-preview straight" /><strong>Прямая</strong></button>
                  <button onClick={() => applyTemplate("cross")}><span className="template-preview cross" /><strong>Перекрёсток</strong></button>
                  <button onClick={() => applyTemplate("tee")}><span className="template-preview tee" /><strong>Т-образный</strong></button>
                  <button onClick={() => applyTemplate("tram")}><span className="template-preview tram" /><strong>С трамваем</strong></button>
                </div>
                <div className="hint-card"><b>Свободная геометрия</b><span>Выберите «Дорога» и протяните её мышью. Двойной щелчок по полотну добавит точку изгиба.</span></div>
              </>
            )}

            {libraryTab === "lanes" && (
              <>
                <p className="section-label">Добавить к выбранной дороге</p>
                <div className="library-list">
                  {laneKinds.map((kind) => (
                    <button key={kind.id} onClick={() => addLane(kind.id)}>
                      <span className={`lane-kind-icon ${kind.id}`}>{kind.symbol}</span>
                      <span><strong>{kind.name}</strong><small>{kind.description}</small></span>
                      <em>＋</em>
                    </button>
                  ))}
                </div>
                <div className="hint-card"><b>Полоса — самостоятельный объект</b><span>Нажмите на любую полосу на схеме, чтобы изменить ширину, направление и разрешённые манёвры.</span></div>
              </>
            )}

            {libraryTab === "features" && (
              <>
                <p className="section-label">Добавить к выбранной дороге</p>
                <div className="library-list feature-library">
                  {roadFeatureKinds.map((kind) => (
                    <button key={kind.id} onClick={() => addRoadFeature(kind.id)}>
                      <span className={`road-feature-kind-icon ${kind.id}`}>{kind.symbol}</span>
                      <span><strong>{kind.name}</strong><small>{kind.description}</small></span>
                      <em>＋</em>
                    </button>
                  ))}
                </div>
                <div className="hint-card"><b>Локальная геометрия дороги</b><span>Выберите участок на схеме, перетащите его вдоль дороги и настройте сторону, длину, ширину и плавность переходов.</span></div>
              </>
            )}

            {libraryTab === "markings" && (
              <>
                <p className="section-label">Линии между полосами</p>
                <div className="marking-library">
                  {LINE_MARKINGS.slice(1).map((marking) => (
                    <button key={marking.id} title={marking.purpose} onClick={() => {
                      if (selection?.type === "separator") setMarking(marking.id);
                      else showToast("Нажмите на линию между полосами");
                    }}>
                      <MarkingSwatch sample={marking.sample} />
                      <span><strong>{marking.name}</strong><small>{marking.purpose}</small></span>
                    </button>
                  ))}
                </div>
                <p className="section-label">Нанести на покрытие</p>
                <div className="stamp-grid">
                  {STAMP_DEFINITIONS.map((stamp) => (
                    <button key={stamp.id} className={tool === `stamp:${stamp.id}` ? "active" : ""} onClick={() => setTool(`stamp:${stamp.id}`)}>
                      <span>{stamp.id.replace("-left", "").replace("-right", "").replace("-straight", "").replace("-combo", "")}</span>
                      <small>{stamp.name.split(" · ")[1]}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {libraryTab === "infrastructure" && (
              <>
                <p className="section-label">Опоры</p>
                <div className="library-list infrastructure-library">
                  {SUPPORT_DEFINITIONS.map((definition) => (
                    <button key={definition.id} className={tool === "support" && supportKind === definition.id ? "active" : ""} onClick={() => { setSupportKind(definition.id); setTool("support"); }}>
                      <span className={`infrastructure-icon support-icon ${definition.id}`}>○</span>
                      <span><strong>{definition.name}</strong><small>{definition.description}</small></span>
                      <em>＋</em>
                    </button>
                  ))}
                </div>
                <p className="section-label">Камеры и радарные блоки</p>
                <div className="library-list camera-library">
                  {CAMERA_DEFINITIONS.map((definition) => (
                    <button key={definition.id} disabled={selectedSupport?.kind !== "console-pole" && selectedCameraSupport?.kind !== "console-pole"} onClick={() => addCameraToSupport(definition.id)}>
                      <span className={`infrastructure-icon camera-icon ${definition.id}`} style={{ color: definition.color }}>{definition.prefix}</span>
                      <span><strong>{definition.name}</strong><small>{definition.description}</small></span>
                      <em>＋</em>
                    </button>
                  ))}
                </div>
                <p className="section-label">Провода между опорами</p>
                <div className="cable-library">
                  {CABLE_DEFINITIONS.map((definition) => (
                    <button key={definition.id} className={tool === "cable" && cableKind === definition.id ? "active" : ""} onClick={() => { setCableKind(definition.id); setTool("cable"); }}>
                      <i style={{ background: definition.color }} /><span><strong>{definition.name}</strong><small>{definition.description}</small></span>
                    </button>
                  ))}
                </div>
                <p className="section-label">Навесное оборудование</p>
                <div className="library-list cabinet-library">
                  {CABINET_DEFINITIONS.map((definition) => (
                    <button key={definition.id} disabled={!selectedSupport} onClick={() => addCabinetToSupport(definition.id)}>
                      <span className={`infrastructure-icon cabinet-icon ${definition.id}`}>{definition.short}</span>
                      <span><strong>{definition.name}</strong><small>{definition.description}</small></span>
                      <em>＋</em>
                    </button>
                  ))}
                </div>
                <div className="hint-card"><b>Связная инженерная схема</b><span>Сначала поставьте опоры. В режиме провода нажимайте их по порядку: редактор построит всю цепочку, а параллельные кабели разнесёт по отдельным направляющим.</span></div>
              </>
            )}
          </div>
          <footer className="rules-note"><span>ПДД РФ</span><p>Номера разметки соответствуют приложению 2 к ПДД. Схема остаётся проектным эскизом и требует проверки инженером ОДД.</p></footer>
        </aside>

        <section className="workspace">
          <div className="canvas-toolbar">
            <div className="main-tools">
              <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}><span>↖</span>Выбор<kbd>V</kbd></button>
              <button className={tool === "road" ? "active" : ""} onClick={() => setTool("road")}><span>━</span>Дорога<kbd>R</kbd></button>
              <button className={tool === "branch" ? "active" : ""} onClick={() => setTool("branch")}><span>⌁</span>Ответвление<kbd>B</kbd></button>
              <button className={tool === "cross-section" ? "active" : ""} onClick={() => setTool("cross-section")}><span>┼</span>Поперечник<kbd>P</kbd></button>
              <button className={tool === "marking-break" ? "active" : ""} onClick={() => setTool("marking-break")}><span>•</span>Разрыв линии<kbd>M</kbd></button>
              <button className={tool === "support" ? "active" : ""} onClick={() => { setLibraryTab("infrastructure"); setTool("support"); }}><span>○</span>Опора<kbd>O</kbd></button>
              <button className={tool === "cable" ? "active" : ""} onClick={() => { setLibraryTab("infrastructure"); setTool("cable"); }}><span>⌁</span>Провод<kbd>K</kbd></button>
              <button className={tool === "pan" ? "active" : ""} onClick={() => setTool("pan")}><span>✥</span>Обзор<kbd>H</kbd></button>
            </div>
            <i />
            <button className={snap ? "toggle active" : "toggle"} onClick={() => setSnap((value) => !value)}>⌁ Снапы</button>
            <button className={grid ? "toggle active" : "toggle"} onClick={() => setGrid((value) => !value)}>▦ Сетка</button>
            <span className="toolbar-space" />
            <button onClick={() => canvasRef.current?.fit()}>Вписать</button>
            <div className="zoom-control"><span>{Math.round(zoom * 100)}%</span></div>
          </div>
          <div className="canvas-stage">
            <RoadCanvas
              ref={canvasRef}
              project={project}
              tool={tool}
              selection={selection}
              activeCableSupportIds={cableChainSupportIds}
              snap={snap}
              grid={grid}
              onSelect={chooseSelection}
              onCreateRoad={createRoadFromDrag}
              onCreateCrossSection={addCrossSection}
              onCreateStamp={createStampAt}
              onCreateSupport={createSupportAt}
              onConnectSupport={connectSupport}
              onMoveRoadPoint={(roadId, index, point) => history.transient((draft) => {
                const road = draft.roads.find((candidate) => candidate.id === roadId);
                if (road) road.points[index] = point;
              })}
              onMoveRoadFeature={(roadId, featureId, at) => history.transient((draft) => {
                const feature = draft.roads.find((candidate) => candidate.id === roadId)?.features.find((candidate) => candidate.id === featureId);
                if (feature) feature.at = Math.max(0.02, Math.min(0.98, at));
              })}
              onMoveCrossSection={(roadId, sectionId, at) => history.transient((draft) => {
                const road = draft.roads.find((candidate) => candidate.id === roadId);
                const section = road?.crossSections.find((candidate) => candidate.id === sectionId);
                if (!road || !section || section.at <= 0.0001 || section.at >= 0.9999) return;
                const ordered = [...road.crossSections].sort((first, second) => first.at - second.at);
                const index = ordered.findIndex((candidate) => candidate.id === sectionId);
                const minimum = (ordered[index - 1]?.at ?? 0) + 0.01;
                const maximum = (ordered[index + 1]?.at ?? 1) - 0.01;
                section.at = Math.max(minimum, Math.min(maximum, at));
              })}
              onInsertRoadPoint={(roadId, point, afterIndex) => history.commit((draft) => {
                const road = draft.roads.find((candidate) => candidate.id === roadId);
                if (road) road.points.splice(afterIndex + 1, 0, point);
              })}
              onSplitMarking={splitMarking}
              onMoveStamp={(stampId, point) => history.transient((draft) => {
                const stamp = draft.stamps.find((candidate) => candidate.id === stampId);
                if (stamp) { stamp.x = point.x; stamp.y = point.y; }
              })}
              onMoveSupport={(supportId, point) => history.transient((draft) => {
                const support = draft.supports.find((candidate) => candidate.id === supportId);
                if (support) { support.x = point.x; support.y = point.y; }
              })}
              onMoveSupportLabel={(supportId, offset) => history.transient((draft) => {
                const support = draft.supports.find((candidate) => candidate.id === supportId);
                if (support) { support.labelOffsetX = offset.x; support.labelOffsetY = offset.y; }
              })}
              onMoveCameraMount={(cameraId, side, slot) => assignCameraMount(cameraId, side, slot, true)}
              onMoveCameraLabel={(cameraId, offset) => history.transient((draft) => {
                const camera = draft.cameras.find((candidate) => candidate.id === cameraId);
                if (camera) { camera.labelOffsetX = offset.x; camera.labelOffsetY = offset.y; }
              })}
              onMoveCabinet={(cabinetId, point) => history.transient((draft) => {
                const cabinet = draft.cabinets.find((candidate) => candidate.id === cabinetId);
                const support = cabinet ? draft.supports.find((candidate) => candidate.id === cabinet.supportId) : undefined;
                if (!cabinet || !support) return;
                const dx = point.x - support.x;
                const dy = point.y - support.y;
                cabinet.distance = Math.max(34, Math.min(140, Math.hypot(dx, dy)));
                cabinet.angle = Math.atan2(dy, dx) * 180 / Math.PI - support.rotation;
              })}
              onInsertCablePoint={(cableId, point, index) => history.commit((draft) => {
                const cable = draft.cables.find((candidate) => candidate.id === cableId);
                if (cable) cable.points.splice(index, 0, point);
              })}
              onMoveCablePoint={(cableId, index, point) => history.transient((draft) => {
                const cable = draft.cables.find((candidate) => candidate.id === cableId);
                if (cable?.points[index]) cable.points[index] = point;
              })}
              onMoveCableLabel={(cableId, at, offset) => history.transient((draft) => {
                const cable = draft.cables.find((candidate) => candidate.id === cableId);
                if (cable) {
                  cable.labelAt = at;
                  cable.labelOffset = offset;
                }
              })}
              onInsertCameraCablePoint={insertCameraCablePoint}
              onMoveCameraCablePoint={(cableId, index, point) => history.transient((draft) => {
                const cable = draft.cameraCables.find((candidate) => candidate.id === cableId);
                if (cable?.points[index]) cable.points[index] = point;
              })}
              onFinishDrag={history.finishTransient}
              onCursor={setCursor}
              onZoom={setZoom}
            />
            {quickPanel}
            {tool === "road" && <div className="mode-tip">Потяните мышью, чтобы создать проезжую часть</div>}
            {tool === "branch" && <div className="mode-tip">Ведите мышь на сторону А или Б · 90° к дороге · Alt — свободный угол</div>}
            {tool === "cross-section" && <div className="mode-tip">Нажмите на дорогу — здесь появится контрольный поперечник состава полос</div>}
            {tool === "marking-break" && <div className="mode-tip">Нажмите на линию, чтобы разделить её на независимые участки</div>}
            {tool === "support" && <div className="mode-tip">Нажмите на схему, чтобы поставить выбранную опору</div>}
            {tool === "cable" && <div className="cable-chain-panel">
              <div><b>{cableChainSupportIds.length ? `Выбрано опор: ${cableChainSupportIds.length}` : "Новая кабельная трасса"}</b><span>{cableChainSupportIds.length ? "Нажимайте следующие опоры по порядку" : "Выберите первую опору, затем все последующие"}</span></div>
              {cableChainSupportIds.length > 0 && <button onClick={() => { setCableChainSupportIds([]); setSelection(null); setAnchor(null); }}>Начать заново</button>}
              <button className="primary" disabled={cableChainSupportIds.length < 2} onClick={finishCableChain}>Завершить</button>
            </div>}
            {tool.startsWith("stamp:") && <div className="mode-tip">Нажмите на покрытие, чтобы поставить разметку</div>}
          </div>
          <footer className="statusbar">
            <span><i className="status-dot" />{project.roads.length} дорог · {project.roads.reduce((sum, road) => sum + road.lanes.length, 0)} полос · {project.supports.length} опор · {project.cameras.length} камер · {project.cameraCables.length} подключений камер · {project.cables.length} трасс · {junctions.length} перекрёстков</span>
            <span>X {Math.round(cursor.x)} · Y {Math.round(cursor.y)}</span>
            <span>Сетка {project.gridSize}</span>
            <span>Колесо — масштаб · двойной щелчок — узел изгиба</span>
          </footer>
        </section>

        <aside className="inspector">
          <div className="inspector-heading"><p>Свойства</p><h2>{selectedSupport ? selectedSupport.name : selectedCamera ? selectedCamera.name : selectedCameraCable ? selectedCameraCable.name : selectedCabinet ? selectedCabinet.name : selectedCable ? selectedCable.name : selectedJunction ? "Перекрёсток" : selectedCrossSection ? "Контрольный поперечник" : selectedVertex && selection?.type === "vertex" ? `Узел оси ${selection.index + 1}` : selectedFeature ? roadFeatureKinds.find((kind) => kind.id === selectedFeature.kind)?.name : selectedLane?.name ?? selectedRoad?.name ?? (selectedMarking ? `Разметка ${selectedMarking}` : selectedStamp ? "Разметка на покрытии" : "Ничего не выбрано")}</h2></div>

          {!selection && (
            <div className="empty-selection">
              <span>↖</span><strong>Выберите элемент на схеме</strong><p>Полосы, линии и нанесённую разметку можно редактировать прямо на рисунке.</p>
              <div><b>Совет</b> Выберите полосу, линию разметки или перекрёсток непосредственно на схеме.</div>
            </div>
          )}

          {selection?.type === "support" && selectedSupport && (
            <div className="property-stack">
              <div className="property-hint">Опора является узлом инженерной сети: шкафы перемещаются вместе с ней, а подключённые кабели автоматически сохраняют привязку.</div>
              <label><span>Обозначение</span><input value={selectedSupport.name} onChange={(event) => updateSupport((support) => { support.name = event.target.value; })} /></label>
              <label><span>Тип опоры</span><select value={selectedSupport.kind} onChange={(event) => updateSupport((support) => { support.kind = event.target.value as SupportKind; })}>{SUPPORT_DEFINITIONS.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
              <div className="coordinate-grid">
                <label><span>X, м</span><input type="number" step="0.1" value={(selectedSupport.x / 12).toFixed(1)} onChange={(event) => updateSupport((support) => { support.x = Number(event.target.value) * 12; })} /></label>
                <label><span>Y, м</span><input type="number" step="0.1" value={(selectedSupport.y / 12).toFixed(1)} onChange={(event) => updateSupport((support) => { support.y = Number(event.target.value) * 12; })} /></label>
              </div>
              <div className="support-label-properties">
                <p className="section-label">Вынос подписи опоры</p>
                <div className="coordinate-grid">
                  <label><span>По X, м</span><input type="number" step="0.1" value={(selectedSupport.labelOffsetX / 12).toFixed(1)} onChange={(event) => updateSupport((support) => { support.labelOffsetX = Math.max(-360, Math.min(360, Number(event.target.value) * 12)); })} /></label>
                  <label><span>По Y, м</span><input type="number" step="0.1" value={(selectedSupport.labelOffsetY / 12).toFixed(1)} onChange={(event) => updateSupport((support) => { support.labelOffsetY = Math.max(-360, Math.min(360, Number(event.target.value) * 12)); })} /></label>
                </div>
                <button className="branch-button" onClick={() => updateSupport((support) => { support.labelOffsetX = 0; support.labelOffsetY = 40; })}>Вернуть подпись к опоре</button>
                <div className="property-hint">Плашку с обозначением можно перетаскивать мышью прямо на схеме; линия-выноска следует за ней автоматически.</div>
              </div>
              <label className="range-property"><span>Поворот консоли <b>{Math.round(selectedSupport.rotation)}°</b></span><input type="range" min="-180" max="180" step="5" value={selectedSupport.rotation} onChange={(event) => updateSupport((support) => { support.rotation = Number(event.target.value); })} /></label>
              {selectedSupport.kind === "console-pole" && <div className="console-properties">
                <p className="section-label">Балка и места под камеры</p>
                <div className="property-metrics"><div><b>{(selectedSupport.consoleLength / 12).toFixed(1)} м</b><span>длина балки</span></div><div><b>{selectedSupport.cameraSlotsA}</b><span>сторона А</span></div><div><b>{selectedSupport.cameraSlotsB}</b><span>сторона Б</span></div></div>
                <label className="range-property"><span>Длина балки <b>{(selectedSupport.consoleLength / 12).toFixed(1)} м</b></span><input type="range" min="5" max="15" step="0.1" value={selectedSupport.consoleLength / 12} onChange={(event) => updateConsoleLength(Number(event.target.value) * 12)} /></label>
                <label className="range-property"><span>Вылет начала точек крепления <b>{(selectedSupport.cameraMountOffset / 12).toFixed(1)} м</b></span><input type="range" min={14 / 12} max={(selectedSupport.consoleLength - 6) / 12} step="0.1" value={selectedSupport.cameraMountOffset / 12} onChange={(event) => updateSupport((support) => { support.cameraMountOffset = Math.max(14, Math.min(support.consoleLength - 6, Number(event.target.value) * 12)); })} /></label>
                <label><span>Точный вылет начала, м</span><input type="number" min={(14 / 12).toFixed(1)} max={((selectedSupport.consoleLength - 6) / 12).toFixed(1)} step="0.1" value={(selectedSupport.cameraMountOffset / 12).toFixed(1)} onChange={(event) => updateSupport((support) => { support.cameraMountOffset = Math.max(14, Math.min(support.consoleLength - 6, Number(event.target.value) * 12)); })} /></label>
                <div className="coordinate-grid">
                  <label><span>Мест · сторона А</span><input type="number" min="0" max="8" step="1" value={selectedSupport.cameraSlotsA} onChange={(event) => updateSupportCameraSlotCount("a", Number(event.target.value))} /></label>
                  <label><span>Мест · сторона Б</span><input type="number" min="0" max="8" step="1" value={selectedSupport.cameraSlotsB} onChange={(event) => updateSupportCameraSlotCount("b", Number(event.target.value))} /></label>
                </div>
                <div className="property-hint">Вылет задаёт начало рабочей части балки. Точки на сторонах А и Б независимо и равномерно пересчитываются между началом и концом рабочей части при изменении количества камер. Камеры жёстко привязаны к этим точкам.</div>
                <p className="section-label">Установить на свободное место</p>
                <div className="camera-quick-grid">{CAMERA_DEFINITIONS.map((definition) => <button key={definition.id} onClick={() => addCameraToSupport(definition.id, selectedSupport.id)}><b style={{ color: definition.color }}>{definition.prefix}</b><span>{definition.name}</span></button>)}</div>
                <p className="section-label">Кабели к камерам</p>
                <button className="branch-button camera-auto-connect" onClick={() => autoConnectSupportCameras(selectedSupport.id)}>⚡ Автоматически провести UTP и КГтп ко всем камерам</button>
                <div className="property-hint">UTP идёт от шкафа управления, КГтп — от узла «Феникс», если он установлен; иначе обе линии начинаются в шкафу управления. Недостающий шкаф создаётся автоматически.</div>
              </div>}
              <p className="section-label">Прикрепить оборудование</p>
              <div className="cabinet-quick-grid">{CABINET_DEFINITIONS.map((definition) => <button key={definition.id} onClick={() => addCabinetToSupport(definition.id)}><b>{definition.short}</b><span>{definition.name}</span></button>)}</div>
              <p className="section-label">Подключённые элементы</p>
              <div className="support-connections"><span>{project.cameras.filter((camera) => camera.supportId === selectedSupport.id).length} камер и радаров</span><span>{project.cabinets.filter((cabinet) => cabinet.supportId === selectedSupport.id).length} шкафов и узлов</span><span>{project.cameraCables.filter((cable) => project.cameras.some((camera) => camera.id === cable.targetCameraId && camera.supportId === selectedSupport.id)).length} подключений камер</span><span>{project.cables.filter((cable) => cable.fromSupportId === selectedSupport.id || cable.toSupportId === selectedSupport.id).length} межопорных трасс</span></div>
              <button className="branch-button" onClick={() => { setCableChainSupportIds([selectedSupport.id]); setCableKind("fiber"); setTool("cable"); }}>⌁ Начать провод от этой опоры</button>
              <button className="danger-button" onClick={deleteSelection}>Удалить опору и подключения</button>
            </div>
          )}

          {selection?.type === "camera" && selectedCamera && selectedCameraSupport && (
            <div className="property-stack camera-properties">
              <div className="property-hint">Устройство установлено на консольной опоре «{selectedCameraSupport.name}» и жёстко привязано к посадочной точке. При перетаскивании камера перескакивает на ближайшую точку; если она занята, устройства меняются местами.</div>
              <div className="property-metrics">
                <div><b>{CAMERA_DEFINITIONS.find((definition) => definition.id === selectedCamera.kind)?.prefix}</b><span>тип</span></div>
                <div><b>{selectedCamera.side === "a" ? "А" : "Б"}</b><span>сторона</span></div>
                <div><b>{(cameraMountPosition(selectedCameraSupport.consoleLength, selectedCameraSupport.cameraMountOffset, selectedCamera.side === "a" ? selectedCameraSupport.cameraSlotsA : selectedCameraSupport.cameraSlotsB, selectedCamera.slot) / 12).toFixed(1)} м</b><span>точка на балке</span></div>
              </div>
              <label><span>Обозначение</span><input value={selectedCamera.name} onChange={(event) => updateCamera((camera) => { camera.name = event.target.value; })} /></label>
              <label><span>Тип устройства</span><select value={selectedCamera.kind} onChange={(event) => updateCamera((camera) => { camera.kind = event.target.value as CameraKind; })}>{CAMERA_DEFINITIONS.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
              <label><span>Консольная опора</span><select value={selectedCamera.supportId} onChange={(event) => {
                const target = project.supports.find((support) => support.id === event.target.value && support.kind === "console-pole");
                if (!target) return;
                const occupied = new Set(project.cameras.filter((camera) => camera.supportId === target.id && camera.id !== selectedCamera.id).map((camera) => `${camera.side}:${camera.slot}`));
                const mount = (["a", "b"] as CameraMountSide[]).flatMap((side) => Array.from({ length: side === "a" ? target.cameraSlotsA : target.cameraSlotsB }, (_, slot) => ({ side, slot }))).find((candidate) => !occupied.has(`${candidate.side}:${candidate.slot}`));
                if (!mount) { showToast("На выбранной опоре нет свободных мест"); return; }
                history.commit((draft) => {
                  const camera = draft.cameras.find((candidate) => candidate.id === selectedCamera.id);
                  if (!camera) return;
                  camera.supportId = target.id;
                  camera.side = mount.side;
                  camera.slot = mount.slot;
                });
              }}>{project.supports.filter((support) => support.kind === "console-pole").map((support) => <option key={support.id} value={support.id}>{support.name}</option>)}</select></label>
              <p className="section-label">Место на балке</p>
              <div className="segmented">
                <button disabled={!selectedCameraSupport.cameraSlotsA} className={selectedCamera.side === "a" ? "active" : ""} onClick={() => {
                  const slot = Math.min(selectedCamera.slot, Math.max(0, selectedCameraSupport.cameraSlotsA - 1));
                  assignCameraMount(selectedCamera.id, "a", slot);
                }}>Сторона А</button>
                <button disabled={!selectedCameraSupport.cameraSlotsB} className={selectedCamera.side === "b" ? "active" : ""} onClick={() => {
                  const slot = Math.min(selectedCamera.slot, Math.max(0, selectedCameraSupport.cameraSlotsB - 1));
                  assignCameraMount(selectedCamera.id, "b", slot);
                }}>Сторона Б</button>
              </div>
              <label><span>Посадочное место</span><select value={selectedCamera.slot} onChange={(event) => {
                const slot = Number(event.target.value);
                assignCameraMount(selectedCamera.id, selectedCamera.side, slot);
              }}>{Array.from({ length: selectedCamera.side === "a" ? selectedCameraSupport.cameraSlotsA : selectedCameraSupport.cameraSlotsB }, (_, slot) => <option key={slot} value={slot}>Место {slot + 1}</option>)}</select></label>
              <label className="range-property"><span>Поворот устройства <b>{Math.round(selectedCamera.rotation)}°</b></span><input type="range" min="-90" max="90" step="5" value={selectedCamera.rotation} onChange={(event) => updateCamera((camera) => { camera.rotation = Number(event.target.value); })} /></label>
              <div className="camera-label-properties">
                <p className="section-label">Вынос подписи камеры</p>
                <div className="coordinate-grid">
                  <label><span>Поперёк, м</span><input type="number" step="0.1" value={(selectedCamera.labelOffsetX / 12).toFixed(1)} onChange={(event) => updateCamera((camera) => { camera.labelOffsetX = Math.max(-360, Math.min(360, Number(event.target.value) * 12)); })} /></label>
                  <label><span>Вдоль, м</span><input type="number" step="0.1" value={(selectedCamera.labelOffsetY / 12).toFixed(1)} onChange={(event) => updateCamera((camera) => { camera.labelOffsetY = Math.max(-360, Math.min(360, Number(event.target.value) * 12)); })} /></label>
                </div>
                <button className="branch-button" onClick={() => updateCamera((camera) => { camera.labelOffsetX = 0; camera.labelOffsetY = 54; })}>Поставить подпись перед объективом</button>
                <div className="property-hint">Плашку с именем можно перетаскивать прямо на схеме. Её направление следует за камерой, поэтому подпись автоматически оказывается слева или справа в зависимости от направления объектива.</div>
              </div>
              <p className="section-label">Ручное подключение этой камеры</p>
              <div className="camera-wire-actions">
                <button className={project.cameraCables.some((cable) => cable.targetCameraId === selectedCamera.id && cable.kind === "utp") ? "connected" : ""} onClick={() => addManualCameraCable("utp")}><b>UTP</b><span>{project.cameraCables.some((cable) => cable.targetCameraId === selectedCamera.id && cable.kind === "utp") ? "Открыть соединение" : "Провести вручную"}</span></button>
                <button className={project.cameraCables.some((cable) => cable.targetCameraId === selectedCamera.id && cable.kind === "control") ? "connected" : ""} onClick={() => addManualCameraCable("control")}><b>КГтп</b><span>{project.cameraCables.some((cable) => cable.targetCameraId === selectedCamera.id && cable.kind === "control") ? "Открыть соединение" : "Провести вручную"}</span></button>
              </div>
              <p className="section-label">Добавить рядом</p>
              <div className="camera-quick-grid">{CAMERA_DEFINITIONS.map((definition) => <button key={definition.id} onClick={() => addCameraToSupport(definition.id, selectedCameraSupport.id)}><b style={{ color: definition.color }}>{definition.prefix}</b><span>{definition.name}</span></button>)}</div>
              <div className="property-hint">Положение отдельной камеры не сдвигается свободно. Чтобы совместить весь ряд креплений с полосами, выберите опору и измените «Вылет начала точек крепления».</div>
              <button className="danger-button" onClick={deleteSelection}>Снять устройство с опоры</button>
            </div>
          )}

          {selection?.type === "camera-cable" && selectedCameraCable && selectedCameraCableSource && selectedCameraCableTarget && (
            <div className="property-stack camera-cable-properties">
              <div className="property-metrics"><div><b>{(selectedCameraCableLength / 12).toFixed(1)} м</b><span>длина</span></div><div><b>{selectedCameraCable.kind === "utp" ? "UTP" : "КГтп"}</b><span>тип</span></div><div><b>{selectedCameraCable.routing === "auto" ? "АВТО" : selectedCameraCable.points.length}</b><span>{selectedCameraCable.routing === "auto" ? "режим" : "точек"}</span></div></div>
              <label><span>Служебное имя</span><input value={selectedCameraCable.name} onChange={(event) => updateCameraCable((cable) => { cable.name = event.target.value; })} /></label>
              <label><span>Тип кабеля</span><select value={selectedCameraCable.kind} onChange={(event) => updateCameraCable((cable) => { cable.kind = event.target.value as CameraCableKind; })}><option value="utp">UTP cat.5e</option><option value="control">КГтп-ХЛ 2×2,5</option></select></label>
              <div className="cable-endpoints"><span>{selectedCameraCableSource.name}</span><i>→</i><span>{selectedCameraCableTarget.name}</span></div>
              <label><span>Источник</span><select value={selectedCameraCable.sourceCabinetId} onChange={(event) => updateCameraCable((cable) => { cable.sourceCabinetId = event.target.value; })}>{project.cabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinet.name}</option>)}</select></label>
              <label><span>Камера</span><select value={selectedCameraCable.targetCameraId} onChange={(event) => updateCameraCable((cable) => { cable.targetCameraId = event.target.value; })}>{project.cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label>
              <p className="section-label">Построение трассы</p>
              <div className="segmented"><button className={selectedCameraCable.routing === "auto" ? "active" : ""} onClick={() => setCameraCableRouting("auto")}>Автоматически</button><button className={selectedCameraCable.routing === "manual" ? "active" : ""} onClick={() => setCameraCableRouting("manual")}>Вручную</button></div>
              <div className="property-hint">Автоматическая трасса идёт от шкафа к основанию консоли, вдоль балки и коротким ответвлением к камере. Двойной щелчок по линии переводит её в ручной режим и добавляет точку изгиба.</div>
              <button className="branch-button" disabled={selectedCameraCable.routing !== "manual" || !selectedCameraCable.points.length} onClick={() => updateCameraCable((cable) => { cable.points = []; })}>Убрать ручные изгибы</button>
              <button className="danger-button" onClick={deleteSelection}>Удалить подключение камеры</button>
            </div>
          )}

          {selection?.type === "cabinet" && selectedCabinet && selectedCabinetSupport && (
            <div className="property-stack">
              <div className="property-hint">Оборудование жёстко связано с опорой «{selectedCabinetSupport.name}». Его можно перетаскивать вокруг опоры прямо на схеме.</div>
              <label><span>Обозначение</span><input value={selectedCabinet.name} onChange={(event) => updateCabinet((cabinet) => { cabinet.name = event.target.value; })} /></label>
              <label><span>Тип оборудования</span><select value={selectedCabinet.kind} onChange={(event) => updateCabinet((cabinet) => { cabinet.kind = event.target.value as CabinetKind; })}>{CABINET_DEFINITIONS.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
              <label><span>Опора</span><select value={selectedCabinet.supportId} onChange={(event) => updateCabinet((cabinet) => { cabinet.supportId = event.target.value; })}>{project.supports.map((support) => <option key={support.id} value={support.id}>{support.name}</option>)}</select></label>
              <label className="range-property"><span>Угол относительно консоли <b>{Math.round(selectedCabinet.angle)}°</b></span><input type="range" min="-180" max="180" step="5" value={selectedCabinet.angle} onChange={(event) => updateCabinet((cabinet) => { cabinet.angle = Number(event.target.value); })} /></label>
              <label className="range-property"><span>Вынос от опоры <b>{(selectedCabinet.distance / 12).toFixed(1)} м</b></span><input type="range" min="34" max="140" step="2" value={selectedCabinet.distance} onChange={(event) => updateCabinet((cabinet) => { cabinet.distance = Number(event.target.value); })} /></label>
              <button className="danger-button" onClick={deleteSelection}>Снять оборудование</button>
            </div>
          )}

          {selection?.type === "cable" && selectedCable && (
            <div className="property-stack">
              <div className="property-metrics"><div><b>{(selectedCableLength / 12).toFixed(1)} м</b><span>длина</span></div><div><b>{selectedCable.points.length}</b><span>изгибов</span></div><div><b>2</b><span>опоры</span></div></div>
              <label><span>Служебное имя</span><input value={selectedCable.name} onChange={(event) => updateCable((cable) => { cable.name = event.target.value; })} /></label>
              <label><span>Тип кабеля</span><select value={selectedCable.kind} onChange={(event) => updateCable((cable) => { cable.kind = event.target.value as CableKind; })}>{CABLE_DEFINITIONS.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
              <div className="cable-endpoints"><span>{project.supports.find((support) => support.id === selectedCable.fromSupportId)?.name ?? "Нет начала"}</span><i>→</i><span>{project.supports.find((support) => support.id === selectedCable.toSupportId)?.name ?? "Нет конца"}</span></div>
              <p className="section-label">Необязательная подпись на схеме</p>
              <label><span>Текст подписи</span><input value={selectedCable.labelText} placeholder="Пусто — на кабеле ничего не показано" onChange={(event) => updateCable((cable) => { cable.labelText = event.target.value; })} /></label>
              {selectedCable.labelText.trim() && <div className="cable-label-properties">
                <label className="range-property"><span>Положение вдоль трассы <b>{Math.round(selectedCable.labelAt * 100)}%</b></span><input type="range" min="0.05" max="0.95" step="0.01" value={selectedCable.labelAt} onChange={(event) => updateCable((cable) => { cable.labelAt = Number(event.target.value); })} /></label>
                <label className="range-property"><span>Вынос от кабеля <b>{(Math.abs(selectedCable.labelOffset) / 12).toFixed(1)} м</b></span><input type="range" min="12" max="240" step="6" value={Math.max(12, Math.abs(selectedCable.labelOffset))} onChange={(event) => updateCable((cable) => { cable.labelOffset = Number(event.target.value) * (cable.labelOffset < 0 ? -1 : 1); })} /></label>
                <div className="segmented"><button className={selectedCable.labelOffset < 0 ? "active" : ""} onClick={() => updateCable((cable) => { cable.labelOffset = -Math.max(12, Math.abs(cable.labelOffset)); })}>Сторона А</button><button className={selectedCable.labelOffset >= 0 ? "active" : ""} onClick={() => updateCable((cable) => { cable.labelOffset = Math.max(12, Math.abs(cable.labelOffset)); })}>Сторона Б</button></div>
                <button className="branch-button" onClick={() => updateCable((cable) => { cable.labelText = ""; })}>Убрать подпись со схемы</button>
              </div>}
              <div className="property-hint">Автоматических надписей на проводах нет. При необходимости введите свой текст и перетащите появившуюся плашку прямо на схеме. Двойной щелчок по проводу добавляет точку изгиба.</div>
              <button className="branch-button" disabled={!selectedCable.points.length} onClick={() => updateCable((cable) => { cable.points = []; })}>Выпрямить трассу</button>
              <button className="danger-button" onClick={deleteSelection}>Удалить кабель</button>
            </div>
          )}

          {selection?.type === "road" && selectedRoad && (
            <div className="property-stack">
              <div className="property-metrics"><div><b>{selectedRoad.lanes.length}</b><span>полос</span></div><div><b>{(selectedRoad.lanes.reduce((sum, lane) => sum + lane.width, 0) / 12).toFixed(1)} м</b><span>ширина</span></div><div><b>{selectedRoad.points.length}</b><span>узлов</span></div></div>
              <div className="property-hint">Правостороннее движение включено по умолчанию: попутные полосы создаются справа относительно направления построения дороги, встречные — слева.</div>
              <label><span>Покрытие</span><select value={selectedRoad.asphalt} onChange={(event) => updateRoad((road) => { road.asphalt = event.target.value as "dark" | "light"; })}><option value="dark">Тёмный асфальт</option><option value="light">Светлый асфальт</option></select></label>
              {selectedRoad.points.length === 2 && <label><span>Угол оси дороги</span><input type="number" min="-180" max="180" step="5" value={Math.round(Math.atan2(selectedRoad.points[1].y - selectedRoad.points[0].y, selectedRoad.points[1].x - selectedRoad.points[0].x) * 180 / Math.PI)} onChange={(event) => updateRoad((road) => {
                const angle = Number(event.target.value) * Math.PI / 180;
                const length = Math.hypot(road.points[1].x - road.points[0].x, road.points[1].y - road.points[0].y);
                road.points[1] = { x: road.points[0].x + Math.cos(angle) * length, y: road.points[0].y + Math.sin(angle) * length };
              })} /></label>}
              <p className="section-label">Быстро добавить</p>
              <div className="quick-add-grid"><button onClick={() => addLane("traffic", "left")}>＋ Полоса слева</button><button onClick={() => addLane("traffic", "right")}>Полоса справа ＋</button><button onClick={() => addLane("tram", "right")}>Ⅱ Трамвай</button><button onClick={() => addLane("median", "right")}>▦ Разделитель</button></div>
              <div className="property-hint">Тяните синие узлы на схеме. Двойной щелчок по дороге добавляет новый узел и позволяет строить изломы.</div>
              <button className="branch-button" onClick={() => setTool("cross-section")}>┼ Добавить контрольный поперечник</button>
              <button className="branch-button" onClick={() => setTool("branch")}>⌁ Построить ответвление от этой дороги</button>
              <button className="danger-button" onClick={deleteSelection}>Удалить дорогу</button>
            </div>
          )}

          {selection?.type === "vertex" && selectedRoad && selectedVertex && (
            <div className="property-stack">
              <div className="axis-station-card"><span>Положение по оси</span><strong>ПК {Math.floor(Math.round(selectedVertexStation / 12) / 100)}+{String(Math.round(selectedVertexStation / 12) % 100).padStart(2, "0")}</strong></div>
              <div className="coordinate-grid">
                <label><span>X, м</span><input type="number" step="0.1" value={(selectedVertex.x / 12).toFixed(1)} onChange={(event) => updateSelectedVertex((point) => { point.x = Number(event.target.value) * 12; })} /></label>
                <label><span>Y, м</span><input type="number" step="0.1" value={(selectedVertex.y / 12).toFixed(1)} onChange={(event) => updateSelectedVertex((point) => { point.y = Number(event.target.value) * 12; })} /></label>
              </div>
              <div className="axis-segments">
                {selection.index > 0 && <div><span>Предыдущий участок</span><b>{(Math.hypot(selectedVertex.x - selectedRoad.points[selection.index - 1].x, selectedVertex.y - selectedRoad.points[selection.index - 1].y) / 12).toFixed(1)} м</b><small>{Math.round(Math.atan2(selectedVertex.y - selectedRoad.points[selection.index - 1].y, selectedVertex.x - selectedRoad.points[selection.index - 1].x) * 180 / Math.PI)}°</small></div>}
                {selection.index < selectedRoad.points.length - 1 && <div><span>Следующий участок</span><b>{(Math.hypot(selectedRoad.points[selection.index + 1].x - selectedVertex.x, selectedRoad.points[selection.index + 1].y - selectedVertex.y) / 12).toFixed(1)} м</b><small>{Math.round(Math.atan2(selectedRoad.points[selection.index + 1].y - selectedVertex.y, selectedRoad.points[selection.index + 1].x - selectedVertex.x) * 180 / Math.PI)}°</small></div>}
              </div>
              <div className="property-hint"><b>Управление осью:</b> тяните узел свободно; удерживайте Ctrl, чтобы сохранить направление предыдущего участка, или Shift — следующего.</div>
              <button className="danger-button" disabled={selectedRoad.points.length <= 2} onClick={deleteSelection}>Удалить узел оси</button>
            </div>
          )}

          {selection?.type === "cross-section" && selectedRoad && selectedCrossSection && (
            <div className="property-stack cross-section-properties">
              <div className="axis-station-card"><span>Положение по оси</span><strong>{(selectedCrossSection.at * selectedRoadLength / 12).toFixed(1)} м</strong></div>
              <label className="range-property"><span>Пикет поперечника <b>{Math.round(selectedCrossSection.at * 100)}%</b></span><input type="range" min="0.01" max="0.99" step="0.005" disabled={selectedCrossSection.at <= 0.0001 || selectedCrossSection.at >= 0.9999} value={Math.max(0.01, Math.min(0.99, selectedCrossSection.at))} onChange={(event) => updateCrossSection((section) => { section.at = Number(event.target.value); })} /></label>
              <p className="section-label">Переход к следующему поперечнику</p>
              <div className="segmented"><button className={selectedCrossSection.transition === "smooth" ? "active" : ""} onClick={() => updateCrossSection((section) => { section.transition = "smooth"; })}>Плавный</button><button className={selectedCrossSection.transition === "linear" ? "active" : ""} onClick={() => updateCrossSection((section) => { section.transition = "linear"; })}>Линейный</button></div>
              <p className="section-label">Состав и ширина полос</p>
              <div className="quick-add-grid"><button disabled={selectedCrossSection.at >= 0.99} onClick={() => addLaneFromCrossSection("left")}>＋ Полоса слева отсюда</button><button disabled={selectedCrossSection.at >= 0.99} onClick={() => addLaneFromCrossSection("right")}>Полоса справа отсюда ＋</button></div>
              <div className="cross-section-lanes">
                {selectedRoad.lanes.map((lane, index) => {
                  const width = selectedCrossSection.laneWidths[lane.id] ?? lane.width;
                  return <div key={lane.id} className={width <= 0.1 ? "cross-section-lane absent" : "cross-section-lane"}>
                    <div><span>{index + 1}. {lane.name}</span><b>{width <= 0.1 ? "нет" : `${(width / 12).toFixed(1)} м`}</b></div>
                    <input type="range" min="0" max="72" step="1.2" value={width} onChange={(event) => updateCrossSection((section) => { section.laneWidths[lane.id] = Number(event.target.value); })} />
                    <div className="cross-section-lane-actions"><button onClick={() => updateCrossSection((section) => { section.laneWidths[lane.id] = 0; })}>Нет здесь</button><button onClick={() => setLaneWidthFromCrossSection(lane.id, 0)}>Нет далее</button><button onClick={() => updateCrossSection((section) => { delete section.laneWidths[lane.id]; })}>Базовая</button></div>
                  </div>;
                })}
              </div>
              <div className="property-hint"><b>Зависимая геометрия:</b> между этим и следующим поперечником границы полос и вся разметка перестраиваются автоматически. Нулевая ширина означает отсутствие полосы в этой точке.</div>
              <button className="danger-button" disabled={selectedCrossSection.at <= 0.0001 || selectedCrossSection.at >= 0.9999} onClick={deleteSelection}>Удалить поперечник</button>
            </div>
          )}

          {selection?.type === "lane" && selectedLane && selectedRoad && (
            <div className="property-stack">
              <label><span>Тип полосы</span><select value={selectedLane.kind} onChange={(event) => updateLane((lane) => { const kind = event.target.value as LaneKind; lane.kind = kind; lane.name = laneKinds.find((candidate) => candidate.id === kind)?.name ?? lane.name; })}>{laneKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select></label>
              <label><span>Подпись</span><input value={selectedLane.name} onChange={(event) => updateLane((lane) => { lane.name = event.target.value; })} /></label>
              <label className="range-property"><span>Ширина <b>{(selectedLane.width / 12).toFixed(1)} м</b></span><input type="range" min="2" max="6" step="0.1" value={selectedLane.width / 12} onChange={(event) => updateLane((lane) => { lane.width = Number(event.target.value) * 12; })} /></label>
              {selectedLane.kind !== "median" && <>
                <p className="section-label">Направление</p>
                <div className="segmented three">{(["backward", "both", "forward"] as LaneDirection[]).map((direction) => <button key={direction} className={selectedLane.direction === direction ? "active" : ""} onClick={() => updateLane((lane) => { lane.direction = direction; })}>{direction === "backward" ? "←" : direction === "forward" ? "→" : "↔"}</button>)}</div>
              </>}
              {(selectedLane.kind === "traffic" || selectedLane.kind === "bus") && <>
                <p className="section-label">Манёвры на полосе</p>
                <div className="turn-grid">{turns.map((turn) => <button key={turn.id} className={selectedLane.turns.includes(turn.id) ? "active" : ""} onClick={() => updateLane((lane) => { lane.turns = lane.turns.includes(turn.id) ? lane.turns.filter((item) => item !== turn.id) : [...lane.turns, turn.id]; })}><b>{turn.symbol}</b><span>{turn.label}</span></button>)}</div>
              </>}
              <p className="section-label">Структура дороги</p>
              <div className="quick-add-grid"><button onClick={() => addLane("traffic", "left")}>＋ Слева</button><button onClick={() => addLane("traffic", "right")}>Справа ＋</button></div>
              <button className="danger-button" disabled={selectedRoad.lanes.length <= 1} onClick={deleteSelection}>Удалить полосу</button>
            </div>
          )}

          {selection?.type === "separator" && selectedRoad && (
            <div className="property-stack">
              <p className="property-lead">Меняется только выбранный участок линии. Границы у перекрёстка вычисляются по его текущей форме и перестраиваются при перемещении дорог.</p>
              {selectedSection && <div className="section-range"><span>Начало <b>{Math.round((selection.start ?? selectedSection.start) * 100)}%</b></span><i /><span>Конец <b>{Math.round((selection.end ?? selectedSection.end) * 100)}%</b></span></div>}
              <div className="inspector-markings">{LINE_MARKINGS.map((marking) => <button key={marking.id} className={selectedMarking === marking.id ? "active" : ""} onClick={() => setMarking(marking.id)}><MarkingSwatch sample={marking.sample} mirrored={marking.id === "1.11" && Boolean(selectedSection?.mirrored)} /><span><strong>{marking.name}</strong><small>{marking.purpose}</small></span><i>✓</i></button>)}</div>
              {selectedMarking === "1.11" && selectedSection && <CombinedOrientationControl mirrored={selectedSection.mirrored} onChange={(mirrored) => setMarking("1.11", mirrored)} />}
              <div className="merge-actions"><button onClick={() => mergeMarking("previous")} disabled={!selectedSection || selectedSection.start <= 0 || selection.start !== undefined && selection.start > selectedSection.start + 0.0001}>Объединить с предыдущим</button><button onClick={() => mergeMarking("next")} disabled={!selectedSection || selectedSection.end >= 1 || selection.end !== undefined && selection.end < selectedSection.end - 0.0001}>Объединить со следующим</button></div>
            </div>
          )}

          {selection?.type === "feature" && selectedFeature && selectedRoad && (
            <div className="property-stack">
              <label><span>Тип участка</span><select value={selectedFeature.kind} onChange={(event) => updateRoadFeature((feature) => {
                const kind = event.target.value as RoadFeatureKind;
                const wasLaneTransition = feature.kind === "lane-widening" || feature.kind === "lane-narrowing";
                feature.kind = kind;
                if ((kind === "lane-widening" || kind === "lane-narrowing") && !wasLaneTransition) feature.innerMarking = "1.5";
                if (kind === "transit-stop") {
                  feature.length = Math.max(feature.length, 360);
                  feature.width = Math.max(feature.width, 42);
                  feature.taper = Math.min(feature.taper, feature.length / 2);
                }
              })}>{roadFeatureKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select></label>
              <p className="section-label">Сторона дороги</p>
              <div className="segmented feature-side">
                {(["left", "right"] as RoadSide[]).map((side) => <button key={side} className={selectedFeature.side === side ? "active" : ""} onClick={() => updateRoadFeature((feature) => { feature.side = side; })}>{side === "left" ? "Слева" : "Справа"}</button>)}
              </div>
              {selectedFeature.kind === "transit-stop"
                ? <div className="automatic-value stop-standard"><span>Единая линия примыкания</span><b>1.17.1</b><small>Жёлтый зигзаг совпадает с осью существующей краевой разметки и полностью заменяет её на длине остановки.</small></div>
                : <>
                  <label><span>Единая линия примыкания</span><select value={selectedFeature.innerMarking} onChange={(event) => updateRoadFeature((feature) => { feature.innerMarking = event.target.value as LineMarkingId; })}>{featureMarkings.map((marking) => <option key={marking.id} value={marking.id}>{marking.name}</option>)}</select></label>
                  {selectedFeature.innerMarking === "1.11" && <CombinedOrientationControl mirrored={selectedFeature.innerMarkingMirrored} onChange={(mirrored) => updateRoadFeature((feature) => { feature.innerMarkingMirrored = mirrored; })} />}
                  <small className="field-note">Линия проходит по всей границе с основной дорогой и редактируется целиком, без отдельных отрезков.</small>
                </>}
              <label className="range-property"><span>{selectedFeature.kind === "lane-widening" ? "Начало расширения" : selectedFeature.kind === "lane-narrowing" ? "Конец сужения" : "Положение"} <b>{Math.round(selectedFeature.at * 100)}%</b></span><input type="range" min="0.05" max="0.95" step="0.01" value={selectedFeature.at} onChange={(event) => updateRoadFeature((feature) => { feature.at = Number(event.target.value); })} /></label>
              {!selectedLaneTransition && <label className="range-property"><span>Общая длина <b>{(selectedFeature.length / 12).toFixed(1)} м</b></span><input type="range" min="60" max="720" step="12" value={selectedFeature.length} onChange={(event) => updateRoadFeature((feature) => { feature.length = Number(event.target.value); feature.taper = Math.min(feature.taper, feature.length / 2); })} /></label>}
              <label className="range-property"><span>{selectedLaneTransition ? "Ширина крайней полосы" : "Изменение ширины"} <b>{(selectedFeature.width / 12).toFixed(1)} м</b></span><input type="range" min="18" max="96" step="6" value={selectedFeature.width} onChange={(event) => updateRoadFeature((feature) => { feature.width = Number(event.target.value); })} /></label>
              <label className="range-property"><span>Длина плавного перехода <b>{(selectedFeature.taper / 12).toFixed(1)} м</b></span><input type="range" min="12" max={selectedLaneTransition ? 360 : Math.max(12, selectedFeature.length / 2)} step="6" value={selectedLaneTransition ? selectedFeature.taper : Math.min(selectedFeature.taper, selectedFeature.length / 2)} onChange={(event) => updateRoadFeature((feature) => { feature.taper = Number(event.target.value); })} /></label>
              {selectedFeature.kind === "transit-stop" && <div className="property-hint">Знак 5.16 ставится в начале посадочной площадки по направлению движения. Длина разметки должна соответствовать проектной посадочной площадке и числу одновременно прибывающих автобусов.</div>}
              {selectedLaneTransition
                ? <div className="property-hint">{selectedFeature.kind === "lane-widening" ? "Перетащите точку начала: после плавного расширения новая крайняя полоса сохраняет полную ширину до конца дороги." : "Крайняя полоса идёт от начала дороги, затем плавно сужается и полностью заканчивается в выбранной точке."} В точке схождения внутренняя и внешняя разметка соединяются в одну.</div>
                : <div className="property-hint">Перетаскивайте участок прямо вдоль дороги. Длина задаётся вместе с двумя плавными переходами по краям.</div>}
              <button className="danger-button" onClick={deleteSelection}>Удалить участок</button>
            </div>
          )}

          {selection?.type === "junction" && selectedJunction && (
            <div className="property-stack">
              <p className="property-lead">Узел обрезается строго по границам проезжих частей. Одновременно он разделяет дороги и продольную разметку на независимые участки.</p>
              <p className="section-label">Тип примыкания</p>
              <div className="segmented junction-extent">
                <button className={selectedJunction.setting.extent === "half" ? "active" : ""} disabled={!selectedJunction.supportsHalf} onClick={() => updateJunction((setting) => { setting.extent = "half"; })}>Съезд · до оси</button>
                <button className={selectedJunction.setting.extent === "full" ? "active" : ""} onClick={() => updateJunction((setting) => { setting.extent = "full"; })}>Перекрёсток · вся дорога</button>
              </div>
              {!selectedJunction.supportsHalf && <small className="field-note">Для сквозного пересечения используется вся ширина обеих дорог.</small>}
              <div className="automatic-value"><span>Автоматический радиус сопряжения</span><b>{(selectedJunction.setting.cornerRadius / 12).toFixed(1)} м</b><small>Четверть ширины более узкой дороги; одинаков для асфальта и краевой разметки.</small></div>
              <label className="check-row"><input type="checkbox" checked={selectedJunction.setting.showBoundary} onChange={(event) => updateJunction((setting) => { setting.showBoundary = event.target.checked; })} /><span>Показывать проектную границу перекрёстка</span></label>
              <div className="property-hint">Пунктир проходит через точки начала дуг сопряжения, как на нормативной схеме границ перекрёстка. Это вспомогательный контур проекта, а не дорожная разметка.</div>
              <p className="section-label">Подходы и приоритет</p>
              <div className="approach-list">
                {selectedJunction.approaches.map((approach, approachIndex) => (
                  <section key={approach.id} className="approach-card">
                    <header><b>Подход {approachIndex + 1}</b><span>{approach.side === "start" ? "со стороны начала" : "со стороны конца"}</span></header>
                    <select value={approach.rule} onChange={(event) => updateApproach(approach.id, (setting) => { setting.rule = event.target.value as ApproachRule; })}>
                      <option value="priority">Приоритетное направление</option>
                      <option value="yield">Уступить · разметка 1.13</option>
                      <option value="stop">Обязательная остановка</option>
                    </select>
                    <label className="check-row approach-check"><input type="checkbox" checked={approach.stopLine || approach.rule === "stop"} disabled={approach.rule === "stop"} onChange={(event) => updateApproach(approach.id, (setting) => { setting.stopLine = event.target.checked; })} /><span>Стоп-линия 1.12 · только въезд</span></label>
                    <label className="range-property"><span>Отступ от границы <b>{(approach.offset / 12).toFixed(1)} м</b></span><input type="range" min="0" max="72" step="2" value={approach.offset} onChange={(event) => updateApproach(approach.id, (setting) => { setting.offset = Number(event.target.value); })} /></label>
                    <div className="traffic-light-controls">
                      <span className="traffic-light-label">Светофоры на подходе</span>
                      <div className="segmented traffic-light-placement">
                        {([
                          ["none", "Нет"],
                          ["left", "Слева"],
                          ["right", "Справа"],
                          ["both", "С двух сторон"],
                        ] as Array<[TrafficLightPlacement, string]>).map(([placement, label]) => (
                          <button key={placement} className={approach.trafficLights === placement ? "active" : ""} onClick={() => updateApproach(approach.id, (setting) => { setting.trafficLights = placement; })}>{label}</button>
                        ))}
                      </div>
                      {approach.trafficLights !== "none" && <label className="range-property"><span>Положение вдоль дороги <b>{(approach.trafficLightOffset / 12).toFixed(1)} м</b></span><input type="range" min="0" max="96" step="2" value={approach.trafficLightOffset} onChange={(event) => updateApproach(approach.id, (setting) => { setting.trafficLightOffset = Number(event.target.value); })} /></label>}
                      <small>Корпуса располагаются параллельно оси подхода. Слева и справа считаются по ходу въезда на перекрёсток.</small>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}

          {selection?.type === "stamp" && selectedStamp && (
            <div className="property-stack">
              <label><span>Тип</span><select value={selectedStamp.type} onChange={(event) => history.commit((draft) => { const stamp = draft.stamps.find((candidate) => candidate.id === selectedStamp.id); if (stamp) stamp.type = event.target.value as StampType; })}>{STAMP_DEFINITIONS.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
              <label className="range-property"><span>Поворот <b>{selectedStamp.rotation}°</b></span><input type="range" min="-180" max="180" step="5" value={selectedStamp.rotation} onChange={(event) => history.commit((draft) => { const stamp = draft.stamps.find((candidate) => candidate.id === selectedStamp.id); if (stamp) stamp.rotation = Number(event.target.value); })} /></label>
              <label className="range-property"><span>Масштаб <b>{Math.round(selectedStamp.scale * 100)}%</b></span><input type="range" min="0.5" max="2" step="0.1" value={selectedStamp.scale} onChange={(event) => history.commit((draft) => { const stamp = draft.stamps.find((candidate) => candidate.id === selectedStamp.id); if (stamp) stamp.scale = Number(event.target.value); })} /></label>
              <div className="property-hint">Перетащите разметку мышью в нужное место на покрытии.</div>
              <button className="danger-button" onClick={deleteSelection}>Удалить разметку</button>
            </div>
          )}
        </aside>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
