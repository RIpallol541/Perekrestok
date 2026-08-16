"use client";

import { forwardRef, MouseEvent as ReactMouseEvent, PointerEvent, ReactNode, useImperativeHandle, useRef, useState, WheelEvent } from "react";
import { cornerReturnMarkingPath, cornerReturnSurfacePath, fractionAlongPolyline, JunctionCornerReturn, junctionBranchClipPolygon, junctionDivisionPointsForRoad, junctionEdgeMarkingIntervalsForRoad, junctionIntervalsForRoad, laneBoundaryPath, laneCenterPath, laneOffsets, lanePolygon, nearestPointOnPolyline, offsetPolyline, pathData, pointAlong, ResolvedJunction, resolveJunction, roadBounds, roadJunctions, roadSurfacePolygon, splitSectionRanges, subPolyline, visibleSectionRanges } from "./geometry";
import {
  EditorTool,
  CAMERA_DEFINITIONS,
  cameraCableRoutePoints,
  cameraMountPosition,
  CABLE_DEFINITIONS,
  CameraCableRoute,
  CableRoute,
  CabinetKind,
  Lane,
  LineMarkingId,
  Point,
  Road,
  RoadCrossSection,
  RoadFeature,
  RoadProject,
  Selection,
  Stamp,
  StampType,
  Support,
  SupportCamera,
  SupportCabinet,
  roadWidth,
} from "./model";

export interface RoadCanvasHandle {
  fit: () => void;
  svg: () => SVGSVGElement | null;
}

interface RoadCanvasProps {
  project: RoadProject;
  tool: EditorTool;
  selection: Selection;
  activeCableSupportIds: string[];
  snap: boolean;
  grid: boolean;
  onSelect: (selection: Selection, anchor?: Point) => void;
  onCreateRoad: (start: Point, end: Point, kind: "road" | "branch") => void;
  onCreateCrossSection: (roadId: string, at: number) => void;
  onCreateStamp: (type: StampType, point: Point) => void;
  onCreateSupport: (point: Point) => void;
  onConnectSupport: (supportId: string) => void;
  onMoveRoadPoint: (roadId: string, index: number, point: Point) => void;
  onMoveRoadFeature: (roadId: string, featureId: string, at: number) => void;
  onMoveCrossSection: (roadId: string, sectionId: string, at: number) => void;
  onInsertRoadPoint: (roadId: string, point: Point, afterIndex: number) => void;
  onSplitMarking: (roadId: string, index: number, sectionId: string, at: number) => void;
  onMoveStamp: (stampId: string, point: Point) => void;
  onMoveSupport: (supportId: string, point: Point) => void;
  onMoveSupportLabel: (supportId: string, offset: Point) => void;
  onMoveCameraMount: (cameraId: string, side: "a" | "b", slot: number) => void;
  onMoveCameraLabel: (cameraId: string, offset: Point) => void;
  onMoveCabinet: (cabinetId: string, point: Point) => void;
  onInsertCablePoint: (cableId: string, point: Point, index: number) => void;
  onMoveCablePoint: (cableId: string, index: number, point: Point) => void;
  onMoveCableLabel: (cableId: string, at: number, offset: number) => void;
  onInsertCameraCablePoint: (cableId: string, point: Point, index: number) => void;
  onMoveCameraCablePoint: (cableId: string, index: number, point: Point) => void;
  onFinishDrag: () => void;
  onCursor: (point: Point) => void;
  onZoom: (zoom: number) => void;
}

type ViewBox = { x: number; y: number; width: number; height: number };
type Drag =
  | { type: "point"; roadId: string; index: number; previousUnit?: Point; nextUnit?: Point }
  | { type: "cross-section"; roadId: string; sectionId: string }
  | { type: "feature"; roadId: string; featureId: string }
  | { type: "stamp"; stampId: string }
  | { type: "support"; supportId: string }
  | { type: "support-label"; supportId: string }
  | { type: "camera"; cameraId: string }
  | { type: "camera-label"; cameraId: string }
  | { type: "cabinet"; cabinetId: string }
  | { type: "cable-point"; cableId: string; index: number; trackOffset: number }
  | { type: "cable-label"; cableId: string; trackOffset: number }
  | { type: "camera-cable-point"; cableId: string; index: number }
  | { type: "pan"; client: Point; view: ViewBox }
  | null;

const BASE_WIDTH = 1600;
const BASE_HEIGHT = 1000;
const EDGE_MARKING_INSET = 11;

function formatPicket(length: number) {
  const meters = Math.max(0, Math.round(length / 12));
  return `ПК ${Math.floor(meters / 100)}+${String(meters % 100).padStart(2, "0")}`;
}

function unitVector(from: Point | undefined, to: Point | undefined) {
  if (!from || !to) return undefined;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 0.001) return undefined;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

function projectToDirection(point: Point, anchor: Point, unit: Point) {
  const along = (point.x - anchor.x) * unit.x + (point.y - anchor.y) * unit.y;
  return { x: anchor.x + unit.x * along, y: anchor.y + unit.y * along };
}

function asphaltColor(asphalt: Road["asphalt"]) {
  return asphalt === "dark" ? "#252c32" : "#454b4e";
}

function laneFill(lane: Lane, asphalt: Road["asphalt"]) {
  if (lane.kind === "tram") return "#343c42";
  if (lane.kind === "bus") return "#243840";
  if (lane.kind === "bike") return "#1d493e";
  if (lane.kind === "median") return "#667267";
  return asphaltColor(asphalt);
}

function smoothStep(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function roadFeatureGeometry(road: Road, feature: RoadFeature) {
  const totalLength = road.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - road.points[index].x, point.y - road.points[index].y), 0) || 1;
  const laneTransition = feature.kind === "lane-widening" || feature.kind === "lane-narrowing";
  const localLength = Math.min(feature.length, totalLength * 0.94);
  const localCenter = Math.max(localLength / 2, Math.min(totalLength - localLength / 2, feature.at * totalLength));
  const transitionPoint = Math.max(12, Math.min(totalLength - 12, feature.at * totalLength));
  const startDistance = feature.kind === "lane-widening"
    ? transitionPoint
    : feature.kind === "lane-narrowing"
      ? 0
      : localCenter - localLength / 2;
  const endDistance = feature.kind === "lane-widening"
    ? totalLength
    : feature.kind === "lane-narrowing"
      ? transitionPoint
      : localCenter + localLength / 2;
  const usableLength = Math.max(1, endDistance - startDistance);
  const taper = Math.max(1, Math.min(feature.taper, laneTransition ? usableLength : usableLength / 2));
  const centerDistance = (startDistance + endDistance) / 2;
  const side = feature.side === "right" ? 1 : -1;
  const baseOffsetAt = (distance: number) => side * roadWidth(road, distance / totalLength) / 2;
  const featureWidth = feature.width;
  const profileAt = (distance: number) => {
    if (feature.kind === "lane-widening") return smoothStep((distance - startDistance) / taper);
    if (feature.kind === "lane-narrowing") return smoothStep((endDistance - distance) / taper);
    const within = distance - startDistance;
    return within < taper
      ? smoothStep(within / taper)
      : within > usableLength - taper
        ? smoothStep((usableLength - within) / taper)
        : 1;
  };
  const edgeOffsetAt = (distance: number) => baseOffsetAt(distance) + side * featureWidth * profileAt(distance);
  const samples = Math.max(12, Math.ceil(usableLength / 18));
  const sample = (index: number) => {
    const distance = startDistance + usableLength * index / samples;
    const physicalOffset = edgeOffsetAt(distance);
    return {
      fraction: distance / totalLength,
      // A tiny inward overlap prevents an anti-aliasing hairline between the
      // feature and the main road in Chromium-based browsers.
      base: pointAlong(road.points, distance / totalLength, baseOffsetAt(distance) - side).point,
      edge: pointAlong(road.points, distance / totalLength, physicalOffset).point,
      marking: pointAlong(road.points, distance / totalLength, physicalOffset - side * EDGE_MARKING_INSET).point,
    };
  };
  const sampled = Array.from({ length: samples + 1 }, (_, index) => sample(index));
  // ГОСТ Р 51256-2018, рисунок Б.4: модуль зигзага 1.17.1 — 2 м по длине и до 2 м по ширине.
  const zigzagSegmentsRaw = Math.max(4, Math.ceil(usableLength / 24));
  const zigzagSegments = zigzagSegmentsRaw % 2 === 0 ? zigzagSegmentsRaw : zigzagSegmentsRaw + 1;
  const baseMarkingPoints = Array.from({ length: samples + 1 }, (_, index) => {
    const distance = startDistance + usableLength * index / samples;
    return pointAlong(road.points, distance / totalLength, baseOffsetAt(distance) - side * EDGE_MARKING_INSET).point;
  });
  const stopZigzagPoints = Array.from({ length: zigzagSegments + 1 }, (_, index) => {
    const distance = startDistance + usableLength * index / zigzagSegments;
    const intoPocket = index % 2 === 0 ? 0 : Math.min(24, featureWidth * 0.58);
    return pointAlong(road.points, distance / totalLength, baseOffsetAt(distance) - side * EDGE_MARKING_INSET + side * intoPocket).point;
  });
  const outsideLane = feature.side === "right" ? road.lanes[0] : road.lanes[road.lanes.length - 1];
  const reverseEntry = outsideLane?.direction === "backward";
  const signDistance = reverseEntry ? endDistance - taper : startDistance + taper;
  const sign = pointAlong(road.points, signDistance / totalLength, edgeOffsetAt(signDistance) + side * 38);
  const centerFraction = centerDistance / totalLength;
  const centerOffset = baseOffsetAt(centerDistance) + side * featureWidth * profileAt(centerDistance) + side * (feature.kind === "transit-stop" ? 28 : 12);
  const center = pointAlong(road.points, centerFraction, centerOffset);
  const basePoints = sampled.map((item) => item.base);
  return {
    surface: `${pathData([...basePoints, ...sampled.map((item) => item.edge).reverse()])} Z`,
    baseMarking: pathData(baseMarkingPoints),
    baseMarkingPoints,
    edge: pathData(sampled.map((item) => item.marking)),
    stopZigzag: pathData(stopZigzagPoints),
    sign,
    center,
    start: sampled[0].edge,
    end: sampled[sampled.length - 1].edge,
    mergePoint: feature.kind === "lane-narrowing" ? sampled[sampled.length - 1].marking : sampled[0].marking,
  };
}

function hasEdgeMarking(corner: JunctionCornerReturn, roads: Road[]) {
  return corner.tangents.every((tangent) => {
    const road = roads.find((candidate) => candidate.id === tangent.roadId);
    if (!road) return false;
    const at = fractionAlongPolyline(road.points, tangent.point);
    const offsets = laneOffsets(road, at);
    const index = offsets.reduce((best, offset, candidate) => Math.abs(offset - tangent.lateral) < Math.abs(offsets[best] - tangent.lateral) ? candidate : best, 0);
    return road.separators[index]?.some((section) => section.start <= at + 0.001 && section.end >= at - 0.001 && section.marking !== "none") ?? false;
  });
}

function approachEntrySpans(approach: { roadId: string; side: "start" | "end" }, roads: Road[]) {
  const road = roads.find((candidate) => candidate.id === approach.roadId);
  if (!road) return [];
  const at = approach.side === "start" ? 0 : 1;
  const offsets = laneOffsets(road, at);
  const edgeLimit = Math.max(0, roadWidth(road, at) / 2 - EDGE_MARKING_INSET);
  const ranges = road.lanes.flatMap((lane, index) => {
    const enters = lane.direction === "both"
      || (approach.side === "start" ? lane.direction === "forward" : lane.direction === "backward");
    if (!enters || lane.kind === "median") return [];
    const first = approach.side === "end" ? offsets[index] : -offsets[index];
    const second = approach.side === "end" ? offsets[index + 1] : -offsets[index + 1];
    return [{ start: Math.min(first, second), end: Math.max(first, second) }];
  }).sort((first, second) => first.start - second.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 0.5) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged
    .map((range) => ({
      start: Math.max(range.start + 4, -edgeLimit),
      end: Math.min(range.end - 4, edgeLimit),
    }))
    .filter((range) => range.end - range.start >= 8);
}

function LineSample({ marking, path, selected, seamlessEnds = false, mirrored = false }: { marking: LineMarkingId; path: Point[]; selected: boolean; seamlessEnds?: boolean; mirrored?: boolean }) {
  if (marking === "none") return null;
  const d = pathData(path);
  const common = { fill: "none", stroke: selected ? "#6dd8ff" : "#f7f5e9", strokeLinecap: seamlessEnds ? "round" as const : "butt" as const, pointerEvents: "none" as const };
  if (marking === "1.3") {
    return <>
      <path d={pathData(offsetPolyline(path, -3.2))} {...common} strokeWidth="2.2" />
      <path d={pathData(offsetPolyline(path, 3.2))} {...common} strokeWidth="2.2" />
    </>;
  }
  if (marking === "1.11") {
    const solidOffset = mirrored ? 2.6 : -2.6;
    return <>
      <path d={pathData(offsetPolyline(path, solidOffset))} {...common} strokeWidth="2.2" />
      <path d={pathData(offsetPolyline(path, -solidOffset))} {...common} strokeWidth="2.2" strokeDasharray="20 14" />
    </>;
  }
  const styles: Partial<Record<LineMarkingId, { width: number; dash?: string }>> = {
    "1.1": { width: 2.2 },
    "1.2": { width: 3.6 },
    "1.5": { width: 2.2, dash: "24 17" },
    "1.6": { width: 2.2, dash: "36 10" },
    "1.7": { width: 2.2, dash: "8 12" },
    "1.8": { width: 3.6, dash: "24 14" },
  };
  const style = styles[marking] ?? styles["1.1"]!;
  return <path d={d} {...common} strokeWidth={style.width} strokeDasharray={style.dash} />;
}

function DirectionArrow({ road, lane, laneIndex }: { road: Road; lane: Lane; laneIndex: number }) {
  if (lane.kind === "tram" || lane.kind === "median") return null;
  const placements = road.points.length === 2 ? [0.24, 0.76] : [0.34, 0.68];
  return <g className="lane-direction-preview editor-only">
    {placements.map((fraction) => {
      const offsets = laneOffsets(road, fraction);
      const laneCenter = (offsets[laneIndex] + offsets[laneIndex + 1]) / 2;
      const position = pointAlong(road.points, fraction, laneCenter);
      const angle = position.angle + (lane.direction === "backward" ? 180 : 0);
      return (
        <g key={fraction} transform={`translate(${position.point.x} ${position.point.y}) rotate(${angle})`} opacity="0.62" pointerEvents="none">
          {lane.direction === "both" ? (
            <path d="M -18 0 H 18 M -10 -7 L -18 0 L -10 7 M 10 -7 L 18 0 L 10 7" fill="none" stroke="#f7f5e9" strokeWidth="2.5" />
          ) : (
            <path d="M -18 0 H 18 M 9 -8 L 18 0 L 9 8" fill="none" stroke="#f7f5e9" strokeWidth="2.5" />
          )}
        </g>
      );
    })}
  </g>;
}

function TramRails({ road, laneIndex }: { road: Road; laneIndex: number }) {
  const center = laneCenterPath(road, laneIndex);
  return <g pointerEvents="none">
    <path d={pathData(center)} fill="none" stroke="#7d858a" strokeWidth="19" strokeDasharray="2 9" opacity=".72" />
    <path d={pathData(offsetPolyline(center, -6.5))} fill="none" stroke="#d6d6ce" strokeWidth="2.4" />
    <path d={pathData(offsetPolyline(center, 6.5))} fill="none" stroke="#d6d6ce" strokeWidth="2.4" />
  </g>;
}

function RoadFeatureArtwork({
  road,
  feature,
  selected,
  interactive,
  onSelect,
  onDragStart,
}: {
  road: Road;
  feature: RoadFeature;
  selected: boolean;
  interactive: boolean;
  onSelect: (event: PointerEvent<SVGGElement>) => void;
  onDragStart: (event: PointerEvent<SVGGElement>) => void;
}) {
  const geometry = roadFeatureGeometry(road, feature);
  const laneTransition = feature.kind === "lane-widening" || feature.kind === "lane-narrowing";
  const labels: Record<RoadFeature["kind"], string> = {
    "transit-stop": "Остановка",
    "lane-widening": "Расширение",
    "lane-narrowing": "Сужение",
    "empty-pocket": "Пустой карман",
  };
  return (
    <g
      className={selected ? "road-feature selected" : "road-feature"}
      onPointerDown={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onSelect(event);
        onDragStart(event);
      }}
    >
      <path
        d={geometry.surface}
        fill={asphaltColor(road.asphalt)}
        stroke="none"
      />
      <path d={geometry.baseMarking} fill="none" stroke={asphaltColor(road.asphalt)} strokeWidth="7" pointerEvents="none" />
      <path className="road-feature-edge" d={geometry.edge} fill="none" pointerEvents="none" />
      {feature.kind !== "transit-stop" && <LineSample marking={feature.innerMarking} path={geometry.baseMarkingPoints} selected={false} seamlessEnds mirrored={feature.innerMarkingMirrored} />}
      {laneTransition && feature.innerMarking !== "none" && <circle className="road-feature-merge-point" cx={geometry.mergePoint.x} cy={geometry.mergePoint.y} r="2.2" pointerEvents="none" />}
      {feature.kind === "transit-stop" && <>
        <path className="road-feature-stop-marking" d={geometry.stopZigzag} fill="none" pointerEvents="none" />
        <g className="transit-stop-sign" transform={`translate(${geometry.sign.point.x} ${geometry.sign.point.y}) rotate(${geometry.sign.angle})`} pointerEvents="none">
          <rect className="stop-sign-board" x="-18" y="-23" width="36" height="46" rx="3" />
          <rect className="stop-sign-field" x="-13" y="-17" width="26" height="31" rx="2" />
          <rect className="stop-sign-bus" x="-9" y="-11" width="18" height="19" rx="3" />
          <rect className="stop-sign-window" x="-6" y="-8" width="12" height="7" rx="1" />
          <circle cx="-6" cy="10" r="2.2" />
          <circle cx="6" cy="10" r="2.2" />
          <text className="stop-sign-number" y="33" textAnchor="middle">5.16</text>
        </g>
      </>}
      <path className="road-feature-hit" d={geometry.surface} fill="transparent" stroke={selected ? "#5fd7ff" : "transparent"} strokeWidth="4" />
      {selected && <g className="editor-only road-feature-selection" pointerEvents="none">
        <circle cx={geometry.start.x} cy={geometry.start.y} r="7" />
        <circle cx={geometry.end.x} cy={geometry.end.y} r="7" />
        <g transform={`translate(${geometry.center.point.x} ${geometry.center.point.y}) rotate(${geometry.center.angle})`}>
          <rect x="-54" y="-50" width="108" height="25" rx="9" />
          <text y="-33" textAnchor="middle">{labels[feature.kind]} · {laneTransition ? `${(feature.width / 12).toFixed(1)} м` : `${(feature.length / 12).toFixed(1)} м`}</text>
        </g>
      </g>}
    </g>
  );
}

function RoadArtwork({
  road,
  tool,
  selection,
  junctions,
  onSelect,
  onInsertPoint,
  onSplitMarking,
  onFeatureDragStart,
}: {
  road: Road;
  tool: EditorTool;
  selection: Selection;
  junctions: ResolvedJunction[];
  onSelect: (selection: Selection, event: PointerEvent<SVGElement>) => void;
  onInsertPoint: (roadId: string, point: Point, afterIndex: number) => void;
  onSplitMarking: (roadId: string, index: number, sectionId: string, at: number) => void;
  onFeatureDragStart: (roadId: string, featureId: string, event: PointerEvent<SVGGElement>) => void;
}) {
  const roadSelected = selection && "roadId" in selection && selection.roadId === road.id;
  return (
    <g className={roadSelected ? "road-artwork selected" : "road-artwork"}>
      <polygon points={roadSurfacePolygon(road)} fill={asphaltColor(road.asphalt)} stroke="none" />

      {road.lanes.map((lane, laneIndex) => {
        const selected = selection?.type === "lane" && selection.roadId === road.id && selection.laneId === lane.id;
        return (
          <g key={lane.id}>
            <polygon
              points={lanePolygon(road, laneIndex)}
              fill={selected ? "#2c5a69" : laneFill(lane, road.asphalt)}
              stroke={selected ? "#72ddff" : "none"}
              strokeWidth={selected ? 3 : 1}
              className="interactive-lane"
              onPointerDown={(event) => {
                if (tool !== "select") return;
                event.stopPropagation();
                onSelect({ type: "lane", roadId: road.id, laneId: lane.id }, event);
              }}
              onDoubleClick={(event) => {
                if (tool !== "select") return;
                event.stopPropagation();
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                const svgPoint = svg.createSVGPoint();
                svgPoint.x = event.clientX;
                svgPoint.y = event.clientY;
                const world = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
                const nearest = nearestPointOnPolyline(road.points, world);
                onInsertPoint(road.id, nearest.point, nearest.segment);
              }}
            />
            {selected && <DirectionArrow road={road} lane={lane} laneIndex={laneIndex} />}
            {lane.kind === "tram" && <TramRails road={road} laneIndex={laneIndex} />}
          </g>
        );
      })}

      {road.separators
        .map((sections, index) => ({ sections, index }))
        .sort((first, second) => Number(first.index === 0 || first.index === road.separators.length - 1) - Number(second.index === 0 || second.index === road.separators.length - 1))
        .map(({ sections, index }) => {
        const middleOffsets = laneOffsets(road, 0.5);
        const markingInset = index === 0
          ? -EDGE_MARKING_INSET
          : index === road.separators.length - 1
            ? EDGE_MARKING_INSET
            : 0;
        const markingOffset = (middleOffsets[index] ?? 0) + markingInset;
        const line = laneBoundaryPath(road, index, markingInset);
        const edgeSeparator = index === 0 || index === road.separators.length - 1;
        const separatorBlocked = edgeSeparator
          ? junctionEdgeMarkingIntervalsForRoad(road, junctions, markingOffset, EDGE_MARKING_INSET)
          : junctionIntervalsForRoad(road, junctions, markingOffset);
        const separatorCuts = junctionDivisionPointsForRoad(road, junctions, markingOffset);
        return (
          <g key={`${road.id}-separator-${index}`} className="interactive-separator">
            {sections.flatMap((section) => splitSectionRanges(visibleSectionRanges(section.start, section.end, separatorBlocked), separatorCuts).map((visible) => {
              const sectionPath = subPolyline(line, visible.start, visible.end);
              const selected = selection?.type === "separator"
                && selection.roadId === road.id
                && selection.index === index
                && selection.sectionId === section.id
                && (selection.start !== undefined
                  ? Math.abs(selection.start - visible.start) < 0.0001
                  : selection.at >= visible.start - 0.0001 && selection.at <= visible.end + 0.0001);
              const locate = (event: PointerEvent<SVGPathElement> | ReactMouseEvent<SVGPathElement>) => {
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return section.start;
                const svgPoint = svg.createSVGPoint();
                svgPoint.x = event.clientX;
                svgPoint.y = event.clientY;
                const world = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
                return fractionAlongPolyline(line, world);
              };
              return (
                <g key={`${section.id}-${visible.start}-${visible.end}`}>
                  <path
                    d={pathData(sectionPath)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="18"
                    onPointerDown={(event) => {
                      const at = locate(event);
                      if (tool === "marking-break") {
                        event.stopPropagation();
                        onSplitMarking(road.id, index, section.id, at);
                        return;
                      }
                      if (tool !== "select") return;
                      event.stopPropagation();
                      onSelect({ type: "separator", roadId: road.id, index, sectionId: section.id, at, start: visible.start, end: visible.end }, event);
                    }}
                    onDoubleClick={(event) => {
                      if (tool !== "select") return;
                      event.stopPropagation();
                      onSplitMarking(road.id, index, section.id, locate(event));
                    }}
                  />
                  <LineSample marking={section.marking} path={sectionPath} selected={selected} seamlessEnds={edgeSeparator} mirrored={section.mirrored} />
                </g>
              );
            }))}
          </g>
        );
      })}

      {road.features.map((feature) => (
        <RoadFeatureArtwork
          key={feature.id}
          road={road}
          feature={feature}
          selected={selection?.type === "feature" && selection.roadId === road.id && selection.featureId === feature.id}
          interactive={tool === "select"}
          onSelect={(event) => onSelect({ type: "feature", roadId: road.id, featureId: feature.id }, event)}
          onDragStart={(event) => onFeatureDragStart(road.id, feature.id, event)}
        />
      ))}

    </g>
  );
}

function ClipGroups({ ids, children }: { ids: string[]; children: ReactNode }) {
  return ids.reduceRight<ReactNode>((content, id) => (
    <g clipPath={`url(#${id})`}>{content}</g>
  ), children);
}

function TrafficLightArtwork({ approach, selected }: {
  approach: ResolvedJunction["approaches"][number];
  selected: boolean;
}) {
  if (approach.trafficLights === "none") return null;
  const sides = approach.trafficLights === "both" ? ["left", "right"] as const : [approach.trafficLights];
  const distanceFromCenter = approach.baseDistance + approach.trafficLightOffset;
  const center = {
    x: approach.outward.x * distanceFromCenter,
    y: approach.outward.y * distanceFromCenter,
  };
  const angle = Math.atan2(approach.outward.y, approach.outward.x) * 180 / Math.PI;
  return (
    <g className={selected ? "traffic-lights selected" : "traffic-lights"} transform={`translate(${center.x} ${center.y}) rotate(${angle})`} pointerEvents="none">
      {sides.map((side) => {
        const sign = side === "left" ? -1 : 1;
        const lateral = sign * (approach.halfWidth + 20);
        return (
          <g key={side} className={`traffic-light traffic-light-${side}`} transform={`translate(0 ${lateral})`}>
            <line className="traffic-light-arm" x1="0" y1={-sign * 20} x2="0" y2="0" />
            <circle className="traffic-light-mast" r="5" />
            <rect className="traffic-light-housing" x="-17" y="-7" width="34" height="14" rx="4" />
            <circle className="traffic-light-red" cx="-10" cy="0" r="3.7" />
            <circle className="traffic-light-yellow" cx="0" cy="0" r="3.7" />
            <circle className="traffic-light-green" cx="10" cy="0" r="3.7" />
            <path className="traffic-light-facing" d="M 18 -4 L 24 0 L 18 4 Z" />
          </g>
        );
      })}
    </g>
  );
}

function cableRoutePoints(cable: CableRoute, supports: Support[]) {
  const from = supports.find((support) => support.id === cable.fromSupportId);
  const to = supports.find((support) => support.id === cable.toSupportId);
  if (!from || !to) return [];
  return [{ x: from.x, y: from.y }, ...cable.points, { x: to.x, y: to.y }];
}

function cableBundleKey(cable: CableRoute) {
  return [cable.fromSupportId, cable.toSupportId].sort().join("::");
}

function cableTrackPoints(points: Point[], trackOffset: number) {
  if (points.length < 2 || Math.abs(trackOffset) < 0.001) return points;
  const track = offsetPolyline(points, trackOffset);
  return [points[0], ...track, points[points.length - 1]];
}

function cabinetWorldPoint(cabinet: SupportCabinet, support: Support) {
  const angle = (support.rotation + cabinet.angle) * Math.PI / 180;
  return { x: support.x + Math.cos(angle) * cabinet.distance, y: support.y + Math.sin(angle) * cabinet.distance };
}

function CameraMountSlots({ length, offset, count, side }: { length: number; offset: number; count: number; side: -1 | 1 }) {
  return <g className={`camera-mount-slots camera-mount-side-${side < 0 ? "a" : "b"}`}>
    {Array.from({ length: count }, (_, index) => {
      const x = cameraMountPosition(length, offset, count, index);
      const y = side * 15;
      return <g key={index} className="camera-mount-slot" transform={`translate(${x} 0)`}>
        <line className="camera-mount-stem-outline" x1="0" y1="0" x2="0" y2={y} />
        <line className="camera-mount-stem" x1="0" y1="0" x2="0" y2={y} />
        <circle cx="0" cy={y} r="4.5" />
      </g>;
    })}
  </g>;
}

function supportCameraFrame(camera: SupportCamera, support: Support) {
  const count = camera.side === "a" ? support.cameraSlotsA : support.cameraSlotsB;
  const reach = cameraMountPosition(support.consoleLength, support.cameraMountOffset, count, camera.slot);
  const side = camera.side === "a" ? -1 : 1;
  const supportAngle = support.rotation * Math.PI / 180;
  const mount = {
    x: support.x + Math.cos(supportAngle) * reach - Math.sin(supportAngle) * side * 15,
    y: support.y + Math.sin(supportAngle) * reach + Math.cos(supportAngle) * side * 15,
  };
  const lateralAngle = (support.rotation + camera.rotation) * Math.PI / 180;
  const forwardAngle = lateralAngle + side * Math.PI / 2;
  return {
    count,
    reach,
    side,
    mount,
    lateral: { x: Math.cos(lateralAngle), y: Math.sin(lateralAngle) },
    forward: { x: Math.cos(forwardAngle), y: Math.sin(forwardAngle) },
    forwardAngle: forwardAngle * 180 / Math.PI,
  };
}

function SupportArtwork({ support, selected, tool, onSelect, onDragStart, onLabelDragStart, onConnect }: {
  support: Support;
  selected: boolean;
  tool: EditorTool;
  onSelect: (event: PointerEvent<SVGGElement>) => void;
  onDragStart: (event: PointerEvent<SVGGElement>) => void;
  onLabelDragStart: (event: PointerEvent<SVGGElement>) => void;
  onConnect: (event: PointerEvent<SVGGElement>) => void;
}) {
  const labelPoint = { x: support.x + support.labelOffsetX, y: support.y + support.labelOffsetY };
  const labelWidth = Math.max(74, Math.min(190, support.name.length * 6.4 + 22));
  return <>
  <g
    className={selected ? `support support-${support.kind} selected` : `support support-${support.kind}`}
    transform={`translate(${support.x} ${support.y}) rotate(${support.rotation})`}
    onPointerDown={(event) => {
      if (tool === "cable") onConnect(event);
      else if (tool === "select") { onSelect(event); onDragStart(event); }
    }}
  >
    <circle className="support-hit" r="34" />
    {support.kind === "power-pole" && <>
      <circle className="support-body" r="14" />
      <circle className="support-core" r="5" />
      <path className="support-detail" d="M -19 0 L 19 0 M 0 -19 L 0 19" />
    </>}
    {support.kind === "lighting-mast" && <>
      <path className="support-console-outline" d="M 0 0 L 42 0" />
      <circle className="support-body" r="12" />
      <path className="support-console" d="M 0 0 L 42 0" />
      <rect className="support-lamp" x="39" y="-7" width="17" height="14" rx="3" />
    </>}
    {support.kind === "console-pole" && <>
      <path className="support-console-outline" d={`M 0 0 L ${support.consoleLength} 0`} />
      <CameraMountSlots length={support.consoleLength} offset={support.cameraMountOffset} count={support.cameraSlotsA} side={-1} />
      <CameraMountSlots length={support.consoleLength} offset={support.cameraMountOffset} count={support.cameraSlotsB} side={1} />
      <circle className="support-body" r="14" />
      <path className="support-console" d={`M 0 0 L ${support.consoleLength} 0`} />
      <path className="support-detail" d={`M 20 -8 L 20 8 M ${support.consoleLength - 4} -9 L ${support.consoleLength - 4} 9`} />
    </>}
  </g>
  <g className={selected ? "support-label-callout selected" : "support-label-callout"}>
    <path className="support-label-leader" d={pathData([{ x: support.x, y: support.y }, labelPoint])} pointerEvents="none" />
    <g className="support-label" transform={`translate(${labelPoint.x} ${labelPoint.y})`} onPointerDown={(event) => {
      if (tool !== "select") return;
      event.stopPropagation();
      onLabelDragStart(event);
    }}>
      <rect x={-labelWidth / 2} y="-10" width={labelWidth} height="20" rx="7" />
      <text y="4" textAnchor="middle">{support.name}</text>
    </g>
  </g>
  </>;
}

function CameraSymbol({ camera }: { camera: SupportCamera }) {
  if (camera.kind === "overview") return <g className="camera-symbol camera-symbol-overview">
    <path className="camera-bracket" d="M 0 -5 L 0 1" />
    <rect className="camera-body" x="-7" y="1" width="14" height="22" rx="6" />
    <circle className="camera-lens" cx="0" cy="12" r="2.2" />
    <path className="camera-optics" d="M 0 23 L -9 33 L 9 33 Z" />
  </g>;
  if (camera.kind === "detector") return <g className="camera-symbol camera-symbol-detector">
    <path className="camera-bracket" d="M 0 -5 L 0 1" />
    <rect className="camera-body" x="-7" y="1" width="14" height="23" rx="1" />
    <rect className="camera-body-inner" x="-4.5" y="4" width="9" height="17" />
    <path className="camera-optics" d="M 0 24 L -9 34 L 9 34 Z" />
  </g>;
  return <g className="camera-symbol camera-symbol-radar">
    <path className="camera-bracket" d="M 0 -5 L 0 1" />
    <rect className="camera-body" x="-7" y="1" width="14" height="23" rx="2" />
    <path className="camera-radar-face" d="M -4 7 L 4 7 M -4 12 L 4 12 M -3 17 L 3 17" />
    <path className="camera-optics" d="M 0 24 L -9 34 L 9 34 Z" />
    <path className="camera-radar-wave" d="M -6 36 Q 0 40 6 36 M -3 38 Q 0 40 3 38" />
  </g>;
}

function SupportCameraArtwork({ camera, support, selected, interactive, onSelect, onDragStart, onLabelDragStart }: {
  camera: SupportCamera;
  support: Support;
  selected: boolean;
  interactive: boolean;
  onSelect: (event: PointerEvent<SVGGElement>) => void;
  onDragStart: (event: PointerEvent<SVGGElement>) => void;
  onLabelDragStart: (event: PointerEvent<SVGGElement>) => void;
}) {
  const frame = supportCameraFrame(camera, support);
  if (frame.count <= 0 || camera.slot < 0 || camera.slot >= frame.count) return null;
  const definition = CAMERA_DEFINITIONS.find((candidate) => candidate.id === camera.kind);
  const labelPoint = {
    x: frame.mount.x + frame.lateral.x * camera.labelOffsetX + frame.forward.x * camera.labelOffsetY,
    y: frame.mount.y + frame.lateral.y * camera.labelOffsetX + frame.forward.y * camera.labelOffsetY,
  };
  const opticsPoint = { x: frame.mount.x + frame.forward.x * 34, y: frame.mount.y + frame.forward.y * 34 };
  const labelWidth = Math.max(44, Math.min(160, camera.name.length * 6 + 14));
  const readableAngle = Math.cos(frame.forwardAngle * Math.PI / 180) < 0 ? frame.forwardAngle + 180 : frame.forwardAngle;
  return <>
  <g className={selected ? `support-camera support-camera-${camera.kind} selected` : `support-camera support-camera-${camera.kind}`} transform={`translate(${support.x} ${support.y}) rotate(${support.rotation})`}>
    <g transform={`translate(${frame.reach} ${frame.side * 15}) rotate(${camera.rotation}) scale(1 ${frame.side})`} onPointerDown={(event) => {
      if (!interactive) return;
      event.stopPropagation();
      onSelect(event);
      onDragStart(event);
    }}>
      <title>{definition?.name}: {camera.name}</title>
      <circle className="camera-hit" cy="15" r="23" />
      <g className="camera-symbol-outline"><CameraSymbol camera={camera} /></g>
      <CameraSymbol camera={camera} />
    </g>
  </g>
  <g className={selected ? "camera-label-callout selected" : "camera-label-callout"}>
    <path className="camera-label-leader" d={pathData([opticsPoint, labelPoint])} pointerEvents="none" />
    <g className="camera-label" transform={`translate(${labelPoint.x} ${labelPoint.y}) rotate(${readableAngle})`} onPointerDown={(event) => {
      if (!interactive) return;
      event.stopPropagation();
      onSelect(event);
      onLabelDragStart(event);
    }}>
      <rect x={-labelWidth / 2} y="-8" width={labelWidth} height="16" rx="5" />
      <text y="3" textAnchor="middle">{camera.name}</text>
    </g>
  </g>
  </>;
}

function CabinetSymbol({ kind }: { kind: CabinetKind }) {
  if (kind === "power-entry" || kind === "distribution-panel") {
    const color = kind === "power-entry" ? "#e3293d" : "#ed7624";
    return <g className="cabinet-checker">
      <rect x="-13" y="-13" width="26" height="26" fill="#fff" />
      <rect x="-13" y="-13" width="13" height="13" fill={color} />
      <rect x="0" y="0" width="13" height="13" fill={color} />
      <rect x="-13" y="-13" width="26" height="26" fill="none" />
    </g>;
  }
  const color = kind === "control-cabinet" ? "#159aca" : kind === "phoenix-node" ? "#f0d421" : "#ef7c28";
  return <g className="cabinet-diagonal">
    <rect x="-14" y="-14" width="28" height="28" fill="#fff" />
    <path d="M -14 -14 L 14 14 L -14 14 Z" fill={color} />
    <rect x="-14" y="-14" width="28" height="28" fill="none" />
  </g>;
}

function CabinetArtwork({ cabinet, support, selected, interactive, onSelect, onDragStart }: {
  cabinet: SupportCabinet;
  support: Support;
  selected: boolean;
  interactive: boolean;
  onSelect: (event: PointerEvent<SVGGElement>) => void;
  onDragStart: (event: PointerEvent<SVGGElement>) => void;
}) {
  const point = cabinetWorldPoint(cabinet, support);
  return <g className={selected ? "support-cabinet selected" : "support-cabinet"}>
    <path className="cabinet-mount" d={pathData([{ x: support.x, y: support.y }, point])} pointerEvents="none" />
    <g transform={`translate(${point.x} ${point.y})`} onPointerDown={(event) => {
      if (!interactive) return;
      event.stopPropagation();
      onSelect(event);
      onDragStart(event);
    }}>
      <circle className="cabinet-hit" r="28" />
      <CabinetSymbol kind={cabinet.kind} />
      <g className="cabinet-label" pointerEvents="none"><rect x="-26" y="18" width="52" height="18" rx="6" /><text y="31" textAnchor="middle">{cabinet.name}</text></g>
    </g>
  </g>;
}

function CableArtwork({ cable, supports, trackOffset, bundleCount, selected, interactive, onSelect, onInsertPoint, onPointDragStart, onLabelDragStart }: {
  cable: CableRoute;
  supports: Support[];
  trackOffset: number;
  bundleCount: number;
  selected: boolean;
  interactive: boolean;
  onSelect: (event: PointerEvent<SVGPathElement>) => void;
  onInsertPoint: (point: Point, index: number) => void;
  onPointDragStart: (index: number, event: PointerEvent<SVGCircleElement>) => void;
  onLabelDragStart: (event: PointerEvent<SVGGElement>) => void;
}) {
  const routePoints = cableRoutePoints(cable, supports);
  if (routePoints.length < 2) return null;
  const points = cableTrackPoints(routePoints, trackOffset);
  const definition = CABLE_DEFINITIONS.find((candidate) => candidate.id === cable.kind);
  const labelText = cable.labelText.trim();
  const labelAnchor = pointAlong(points, cable.labelAt);
  const label = pointAlong(points, cable.labelAt, cable.labelOffset);
  const labelWidth = Math.max(82, Math.min(260, labelText.length * 6.4 + 24));
  const locate = (event: ReactMouseEvent<SVGPathElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return null;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const world = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
    return nearestPointOnPolyline(routePoints, world);
  };
  return <g className={selected ? "cable-route selected" : "cable-route"} data-bundle-size={bundleCount}>
    <path className="cable-hit" d={pathData(points)} fill="none" onPointerDown={(event) => { if (interactive) onSelect(event); }} onDoubleClick={(event) => {
      if (!interactive) return;
      event.stopPropagation();
      const nearest = locate(event);
      if (nearest) onInsertPoint(nearest.point, nearest.segment);
    }} />
    <path className="cable-line" d={pathData(points)} fill="none" stroke={definition?.color ?? "#d73d42"} pointerEvents="none" />
    {labelText && <g className={selected ? "cable-note selected" : "cable-note"}>
      <path className="cable-note-leader" d={pathData([labelAnchor.point, label.point])} pointerEvents="none" />
      <circle className="cable-note-anchor" cx={labelAnchor.point.x} cy={labelAnchor.point.y} r="3.5" pointerEvents="none" />
      <g className="cable-note-box" transform={`translate(${label.point.x} ${label.point.y})`} onPointerDown={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onLabelDragStart(event);
      }}>
        <rect x={-labelWidth / 2} y="-13" width={labelWidth} height="26" rx="7" />
        <text y="4" textAnchor="middle">{labelText}</text>
      </g>
    </g>}
    {selected && cable.points.map((point, index) => {
      const handle = Math.abs(trackOffset) < 0.001 ? point : offsetPolyline(routePoints, trackOffset)[index + 1] ?? point;
      return <circle key={index} className="cable-waypoint editor-only" cx={handle.x} cy={handle.y} r="9" onPointerDown={(event) => onPointDragStart(index, event)} />;
    })}
  </g>;
}

function CameraCableArtwork({ cable, project, selected, interactive, onSelect, onInsertPoint, onPointDragStart }: {
  cable: CameraCableRoute;
  project: RoadProject;
  selected: boolean;
  interactive: boolean;
  onSelect: (event: PointerEvent<SVGPathElement>) => void;
  onInsertPoint: (point: Point, index: number) => void;
  onPointDragStart: (index: number, event: PointerEvent<SVGCircleElement>) => void;
}) {
  const points = cameraCableRoutePoints(cable, project.supports, project.cabinets, project.cameras);
  if (points.length < 2) return null;
  const color = CABLE_DEFINITIONS.find((definition) => definition.id === cable.kind)?.color ?? "#f1c91c";
  const locate = (event: ReactMouseEvent<SVGPathElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return null;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const world = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
    return nearestPointOnPolyline(points, world);
  };
  return <g className={selected ? `camera-cable camera-cable-${cable.kind} selected` : `camera-cable camera-cable-${cable.kind}`}>
    <path className="camera-cable-hit" d={pathData(points)} fill="none" onPointerDown={(event) => { if (interactive) onSelect(event); }} onDoubleClick={(event) => {
      if (!interactive) return;
      event.stopPropagation();
      const nearest = locate(event);
      if (nearest) onInsertPoint(nearest.point, nearest.segment);
    }} />
    <path className="camera-cable-outline" d={pathData(points)} fill="none" pointerEvents="none" />
    <path className="camera-cable-line" d={pathData(points)} fill="none" stroke={color} pointerEvents="none" />
    {selected && cable.routing === "manual" && cable.points.map((point, index) => <circle key={index} className="camera-cable-waypoint editor-only" cx={point.x} cy={point.y} r="7" onPointerDown={(event) => onPointDragStart(index, event)} />)}
  </g>;
}

function MarkingPointOverlay({ road, junctions, selection }: {
  road: Road;
  junctions: ResolvedJunction[];
  selection: Selection;
}) {
  if (selection?.type !== "separator" || selection.roadId !== road.id) return null;
  const sections = road.separators[selection.index];
  if (!sections) return null;
  const offsets = laneOffsets(road, 0.5);
  const edgeSeparator = selection.index === 0 || selection.index === road.separators.length - 1;
  const markingInset = selection.index === 0
    ? -EDGE_MARKING_INSET
    : selection.index === road.separators.length - 1
      ? EDGE_MARKING_INSET
      : 0;
  const markingOffset = (offsets[selection.index] ?? 0) + markingInset;
  const line = laneBoundaryPath(road, selection.index, markingInset);
  const blocked = edgeSeparator
    ? junctionEdgeMarkingIntervalsForRoad(road, junctions, markingOffset, EDGE_MARKING_INSET)
    : junctionIntervalsForRoad(road, junctions, markingOffset);
  const divisions = junctionDivisionPointsForRoad(road, junctions, markingOffset);
  const automaticFractions = [
    ...divisions,
    ...blocked.flatMap((interval) => [interval.start, interval.end]),
  ];
  return (
    <g className="marking-points-overlay editor-only" pointerEvents="none">
      {sections.slice(1).filter((section) => automaticFractions.every((fraction) => Math.abs(fraction - section.start) > 0.012)).map((section) => {
        const point = pointAlong(line, section.start).point;
        return <g key={`${section.id}-manual-break`} className="marking-breakpoint manual-breakpoint" transform={`translate(${point.x} ${point.y})`}>
          <circle r="9" fill="#fff" stroke="#19a6ce" strokeWidth="3.5" />
          <circle r="3" fill="#19a6ce" />
        </g>;
      })}
      {blocked.flatMap((interval) => [interval.start, interval.end]).map((fraction) => {
        const point = pointAlong(line, fraction).point;
        return <g key={`junction-break-${fraction}`} className="marking-breakpoint junction-breakpoint" transform={`translate(${point.x} ${point.y})`}>
          <rect x="-7" y="-7" width="14" height="14" rx="3" fill="#fff" stroke="#e7a731" strokeWidth="3" />
          <circle r="2.2" fill="#e7a731" />
        </g>;
      })}
      {divisions.map((fraction) => {
        const point = pointAlong(line, fraction).point;
        return <g key={`junction-division-${fraction}`} className="marking-breakpoint junction-division-point" transform={`translate(${point.x} ${point.y})`}>
          <rect x="-5" y="-5" width="10" height="10" rx="2" transform="rotate(45)" fill="#fff" stroke="#e7a731" strokeWidth="2.5" />
        </g>;
      })}
    </g>
  );
}

function PreservedCenterMarking({
  road,
  junction,
  tool,
  selection,
  onSelect,
  onSplitMarking,
}: {
  road: Road;
  junction: ResolvedJunction;
  tool: EditorTool;
  selection: Selection;
  onSelect: (selection: Selection, event: PointerEvent<SVGPathElement>) => void;
  onSplitMarking: (roadId: string, index: number, sectionId: string, at: number) => void;
}) {
  const offsets = laneOffsets(road, 0.5);
  const index = offsets.reduce((best, offset, candidate) => Math.abs(offset) < Math.abs(offsets[best]) ? candidate : best, 0);
  if (Math.abs(offsets[index]) >= 1.5) return null;
  const cuts = junctionDivisionPointsForRoad(road, [junction], offsets[index]);
  if (cuts.length < 2) return null;
  const line = laneBoundaryPath(road, index);
  const from = cuts[0];
  const to = cuts[cuts.length - 1];
  return <g className="preserved-center-marking">
    {road.separators[index].flatMap((section) => {
      const start = Math.max(section.start, from);
      const end = Math.min(section.end, to);
      if (end - start <= 0.001) return [];
      const sectionPath = subPolyline(line, start, end);
      const selected = selection?.type === "separator"
        && selection.roadId === road.id
        && selection.index === index
        && selection.sectionId === section.id
        && (selection.start !== undefined
          ? Math.abs(selection.start - start) < 0.0001
          : selection.at >= start - 0.0001 && selection.at <= end + 0.0001);
      const locate = (event: PointerEvent<SVGPathElement> | ReactMouseEvent<SVGPathElement>) => {
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) return start;
        const svgPoint = svg.createSVGPoint();
        svgPoint.x = event.clientX;
        svgPoint.y = event.clientY;
        const world = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
        return fractionAlongPolyline(line, world);
      };
      return <g key={`${section.id}-${start}-${end}`}>
        <path
          d={pathData(sectionPath)}
          fill="none"
          stroke="transparent"
          strokeWidth="18"
          onPointerDown={(event) => {
            const at = locate(event);
            if (tool === "marking-break") {
              event.stopPropagation();
              onSplitMarking(road.id, index, section.id, at);
              return;
            }
            if (tool !== "select") return;
            event.stopPropagation();
            onSelect({ type: "separator", roadId: road.id, index, sectionId: section.id, at, start, end }, event);
          }}
          onDoubleClick={(event) => {
            if (tool !== "select") return;
            event.stopPropagation();
            onSplitMarking(road.id, index, section.id, locate(event));
          }}
        />
        <LineSample marking={section.marking} path={sectionPath} selected={selected} mirrored={section.mirrored} />
      </g>;
    })}
  </g>;
}

function StampArtwork({ stamp, selected, interactive, onSelect, onDragStart }: {
  stamp: Stamp;
  selected: boolean;
  interactive: boolean;
  onSelect: (event: PointerEvent<SVGGElement>) => void;
  onDragStart: (event: PointerEvent<SVGGElement>) => void;
}) {
  const color = stamp.type === "1.17.1" ? "#f5d547" : "#f8f7ee";
  const content = (() => {
    if (stamp.type === "1.12") return <rect x="-48" y="-5" width="96" height="10" fill={color} />;
    if (stamp.type === "1.13") return <g>{[-36, -12, 12, 36].map((x) => <path key={x} d={`M ${x - 8} 7 L ${x} -7 L ${x + 8} 7 Z`} fill={color} />)}</g>;
    if (stamp.type === "1.14.1") return <g>{[-35, -25, -15, -5, 5, 15, 25, 35].map((x) => <rect key={x} x={x - 3} y="-26" width="6" height="52" fill={color} />)}</g>;
    if (stamp.type === "1.17.1") return <path d="M -48 8 L -36 -8 L -24 8 L -12 -8 L 0 8 L 12 -8 L 24 8 L 36 -8 L 48 8" fill="none" stroke={color} strokeWidth="5" />;
    if (stamp.type.startsWith("1.18")) {
      const right = stamp.type === "1.18-right" || stamp.type === "1.18-combo";
      const left = stamp.type === "1.18-left";
      return <g fill="none" stroke={color} strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M 0 32 V -25 M -10 -12 L 0 -27 L 10 -12" />
        {right && <path d="M 0 2 H 28 M 17 -9 L 30 2 L 17 13" />}
        {left && <path d="M 0 2 H -28 M -17 -9 L -30 2 L -17 13" />}
      </g>;
    }
    if (stamp.type === "1.20") return <path d="M 0 -30 L 27 20 H -27 Z" fill="none" stroke={color} strokeWidth="6" />;
    if (stamp.type === "1.21") return <text textAnchor="middle" y="8" fontSize="24" fontWeight="800" fill={color}>СТОП</text>;
    if (stamp.type === "1.23.1") return <text textAnchor="middle" y="15" fontSize="44" fontWeight="800" fill={color}>А</text>;
    if (stamp.type === "1.23.3") return <g fill="none" stroke={color} strokeWidth="4"><circle cx="-18" cy="14" r="13" /><circle cx="20" cy="14" r="13" /><path d="M -18 14 L -4 -10 L 7 14 H -18 L 2 -3 L 20 14 M -5 -10 H 8" /></g>;
    if (stamp.type === "1.24.1") return <g><rect x="-25" y="-25" width="50" height="50" rx="5" fill="none" stroke={color} strokeWidth="5" /><text textAnchor="middle" y="8" fill={color} fontSize="23" fontWeight="800">40</text></g>;
    return <g>{[-30, 0, 30].map((x) => <path key={x} d={`M ${x - 10} 14 L ${x} -12 L ${x + 10} 14`} fill="none" stroke={color} strokeWidth="5" />)}</g>;
  })();
  return (
    <g
      transform={`translate(${stamp.x} ${stamp.y}) rotate(${stamp.rotation}) scale(${stamp.scale})`}
      className={selected ? "stamp selected" : "stamp"}
      pointerEvents={interactive ? "auto" : "none"}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(event); onDragStart(event); }}
    >
      <rect x="-58" y="-38" width="116" height="76" rx="8" fill="transparent" stroke={selected ? "#64d7ff" : "transparent"} strokeWidth="2" strokeDasharray="6 4" />
      {content}
    </g>
  );
}

function RoadAxisOverlay({ road }: { road: Road }) {
  const totalLength = road.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - road.points[index].x, point.y - road.points[index].y), 0);
  const offset = roadWidth(road) / 2 + 34;
  const labels = [
    { key: "start", ...pointAlong(road.points, 0, offset), text: "ПК 0+00" },
    { key: "end", ...pointAlong(road.points, 1, offset), text: formatPicket(totalLength) },
  ];
  return <g className="road-axis-overlay editor-only" pointerEvents="none">
    <path d={pathData(road.points)} />
    {labels.map((label) => <g key={label.key} className="axis-station" transform={`translate(${label.point.x} ${label.point.y})`}>
      <rect x="-34" y="-11" width="68" height="22" rx="7" />
      <text y="4" textAnchor="middle">{label.text}</text>
    </g>)}
  </g>;
}

function RoadCrossSectionsOverlay({ road, selection, interactive, onSelect, onDragStart }: {
  road: Road;
  selection: Selection;
  interactive: boolean;
  onSelect: (section: RoadCrossSection) => void;
  onDragStart: (section: RoadCrossSection, event: PointerEvent<SVGGElement>) => void;
}) {
  return <g className="cross-sections-overlay editor-only">
    {[...road.crossSections].sort((first, second) => first.at - second.at).map((section, index) => {
      const position = pointAlong(road.points, section.at);
      const selected = selection?.type === "cross-section" && selection.roadId === road.id && selection.sectionId === section.id;
      const endpoint = section.at <= 0.0001 || section.at >= 0.9999;
      const halfWidth = roadWidth(road, section.at) / 2 + 18;
      return <g
        key={section.id}
        className={selected ? "cross-section-marker selected" : endpoint ? "cross-section-marker endpoint" : "cross-section-marker"}
        transform={`translate(${position.point.x} ${position.point.y}) rotate(${position.angle})`}
        onPointerDown={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          onSelect(section);
          if (!endpoint) onDragStart(section, event);
        }}
      >
        <line x1="0" y1={-halfWidth} x2="0" y2={halfWidth} />
        <rect x="-7" y="-7" width="14" height="14" rx="3" transform="rotate(45)" />
        <text x="12" y="-11" transform={`rotate(${-position.angle})`}>ПП {index + 1}</text>
        <circle className="cross-section-hit" r="24" />
      </g>;
    })}
  </g>;
}

export const RoadCanvas = forwardRef<RoadCanvasHandle, RoadCanvasProps>(function RoadCanvas({
  project,
  tool,
  selection,
  activeCableSupportIds,
  snap,
  grid,
  onSelect,
  onCreateRoad,
  onCreateCrossSection,
  onCreateStamp,
  onCreateSupport,
  onConnectSupport,
  onMoveRoadPoint,
  onMoveRoadFeature,
  onMoveCrossSection,
  onInsertRoadPoint,
  onSplitMarking,
  onMoveStamp,
  onMoveSupport,
  onMoveSupportLabel,
  onMoveCameraMount,
  onMoveCameraLabel,
  onMoveCabinet,
  onInsertCablePoint,
  onMoveCablePoint,
  onMoveCableLabel,
  onInsertCameraCablePoint,
  onMoveCameraCablePoint,
  onFinishDrag,
  onCursor,
  onZoom,
}, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT });
  const [drag, setDrag] = useState<Drag>(null);
  const [drawing, setDrawing] = useState<{ start: Point; end: Point; kind: "road" | "branch"; sourceAngle?: number } | null>(null);
  const junctions = roadJunctions(project.roads).map((junction) => resolveJunction(
    junction,
    project.roads,
    project.junctionSettings.find((setting) => setting.id === junction.id),
  ));
  const halfJunctionClips = junctions.flatMap((junction) => {
    if (junction.setting.extent !== "half" || !junction.branchRoadId) return [];
    const points = junctionBranchClipPolygon(junction);
    if (points.length < 3) return [];
    return [{ id: `half-junction-clip-${junction.id}`, roadId: junction.branchRoadId, points }];
  });
  const cableBundles = new Map<string, CableRoute[]>();
  for (const cable of project.cables) {
    const key = cableBundleKey(cable);
    cableBundles.set(key, [...(cableBundles.get(key) ?? []), cable]);
  }
  const cableTracks = project.cables.map((cable) => {
    const bundle = cableBundles.get(cableBundleKey(cable)) ?? [cable];
    const bundleIndex = Math.max(0, bundle.findIndex((candidate) => candidate.id === cable.id));
    const direction = cable.fromSupportId.localeCompare(cable.toSupportId) <= 0 ? 1 : -1;
    return {
      cable,
      bundleCount: bundle.length,
      trackOffset: (bundleIndex - (bundle.length - 1) / 2) * 12 * direction,
    };
  });

  function screenAnchor(event: PointerEvent<SVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : undefined;
  }

  function worldPoint(event: PointerEvent<SVGElement>, applySnap = snap) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const world = point.matrixTransform(svg.getScreenCTM()?.inverse());
    if (!applySnap) return { x: world.x, y: world.y };
    return {
      x: Math.round(world.x / project.gridSize) * project.gridSize,
      y: Math.round(world.y / project.gridSize) * project.gridSize,
    };
  }

  function fit() {
    const bounds = roadBounds(project.roads);
    const aspect = BASE_WIDTH / BASE_HEIGHT;
    let width = bounds.width;
    let height = bounds.height;
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
    const next = { x: bounds.x - (width - bounds.width) / 2, y: bounds.y - (height - bounds.height) / 2, width, height };
    setView(next);
    onZoom(BASE_WIDTH / width);
  }

  useImperativeHandle(ref, () => ({ fit, svg: () => svgRef.current }));

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button === 1 || tool === "pan" || (event.button === 0 && event.currentTarget.dataset.space === "true")) {
      setDrag({ type: "pan", client: { x: event.clientX, y: event.clientY }, view });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const point = worldPoint(event);
    if (tool === "road") {
      setDrawing({ start: point, end: point, kind: "road" });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "support") {
      onCreateSupport(point);
      return;
    }
    if (tool === "branch") {
      const raw = worldPoint(event, false);
      const candidates = project.roads.map((road) => ({ road, nearest: nearestPointOnPolyline(road.points, raw) }));
      const candidate = candidates.sort((first, second) => first.nearest.distance - second.nearest.distance)[0];
      if (!candidate || candidate.nearest.distance > roadWidth(candidate.road) / 2 + 24) return;
      const segmentStart = candidate.road.points[candidate.nearest.segment];
      const segmentEnd = candidate.road.points[candidate.nearest.segment + 1];
      const sourceAngle = Math.atan2(segmentEnd.y - segmentStart.y, segmentEnd.x - segmentStart.x);
      setDrawing({ start: candidate.nearest.point, end: candidate.nearest.point, kind: "branch", sourceAngle });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "cross-section") {
      const raw = worldPoint(event, false);
      const candidates = project.roads.map((road) => ({ road, nearest: nearestPointOnPolyline(road.points, raw) }));
      const candidate = candidates.sort((first, second) => first.nearest.distance - second.nearest.distance)[0];
      if (!candidate) return;
      const at = fractionAlongPolyline(candidate.road.points, candidate.nearest.point);
      if (candidate.nearest.distance > roadWidth(candidate.road, at) / 2 + 24) return;
      onCreateCrossSection(candidate.road.id, at);
      return;
    }
    if (tool.startsWith("stamp:")) {
      onCreateStamp(tool.slice(6) as StampType, point);
      return;
    }
    onSelect(null);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    let point = worldPoint(event);
    onCursor(point);
    if (drawing) {
      const raw = worldPoint(event, false);
      const length = Math.hypot(raw.x - drawing.start.x, raw.y - drawing.start.y);
      if (drawing.kind === "branch" && drawing.sourceAngle !== undefined && !event.altKey) {
        const normal = { x: -Math.sin(drawing.sourceAngle), y: Math.cos(drawing.sourceAngle) };
        const side = (raw.x - drawing.start.x) * normal.x + (raw.y - drawing.start.y) * normal.y >= 0 ? 1 : -1;
        point = { x: drawing.start.x + normal.x * length * side, y: drawing.start.y + normal.y * length * side };
      } else if (event.shiftKey) {
        const angle = Math.atan2(raw.y - drawing.start.y, raw.x - drawing.start.x);
        const snappedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
        point = { x: drawing.start.x + Math.cos(snappedAngle) * length, y: drawing.start.y + Math.sin(snappedAngle) * length };
      }
      setDrawing({ ...drawing, end: point });
      return;
    }
    if (drag?.type === "point") {
      const road = project.roads.find((candidate) => candidate.id === drag.roadId);
      if (road && event.ctrlKey !== event.shiftKey) {
        if (event.ctrlKey && drag.previousUnit && road.points[drag.index - 1]) {
          point = projectToDirection(worldPoint(event, false), road.points[drag.index - 1], drag.previousUnit);
        }
        if (event.shiftKey && drag.nextUnit && road.points[drag.index + 1]) {
          point = projectToDirection(worldPoint(event, false), road.points[drag.index + 1], drag.nextUnit);
        }
      }
      onMoveRoadPoint(drag.roadId, drag.index, point);
    }
    if (drag?.type === "feature") {
      const road = project.roads.find((candidate) => candidate.id === drag.roadId);
      if (road) onMoveRoadFeature(drag.roadId, drag.featureId, fractionAlongPolyline(road.points, worldPoint(event, false)));
    }
    if (drag?.type === "cross-section") {
      const road = project.roads.find((candidate) => candidate.id === drag.roadId);
      if (road) onMoveCrossSection(drag.roadId, drag.sectionId, fractionAlongPolyline(road.points, worldPoint(event, false)));
    }
    if (drag?.type === "stamp") onMoveStamp(drag.stampId, point);
    if (drag?.type === "support") onMoveSupport(drag.supportId, point);
    if (drag?.type === "support-label") {
      const support = project.supports.find((candidate) => candidate.id === drag.supportId);
      if (support) {
        const raw = worldPoint(event, false);
        onMoveSupportLabel(support.id, {
          x: Math.max(-360, Math.min(360, raw.x - support.x)),
          y: Math.max(-360, Math.min(360, raw.y - support.y)),
        });
      }
    }
    if (drag?.type === "camera") {
      const camera = project.cameras.find((candidate) => candidate.id === drag.cameraId);
      const support = camera ? project.supports.find((candidate) => candidate.id === camera.supportId) : undefined;
      if (camera && support) {
        const raw = worldPoint(event, false);
        const angle = -support.rotation * Math.PI / 180;
        const dx = raw.x - support.x;
        const dy = raw.y - support.y;
        const local = { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
        let side: "a" | "b" = local.y < 0 ? "a" : "b";
        let count = side === "a" ? support.cameraSlotsA : support.cameraSlotsB;
        if (!count) {
          side = side === "a" ? "b" : "a";
          count = side === "a" ? support.cameraSlotsA : support.cameraSlotsB;
        }
        if (count) {
          const slots = Array.from({ length: count }, (_, index) => ({ index, x: cameraMountPosition(support.consoleLength, support.cameraMountOffset, count, index) }));
          const nearest = slots.reduce((best, slot) => Math.abs(slot.x - local.x) < Math.abs(best.x - local.x) ? slot : best, slots[0]);
          onMoveCameraMount(camera.id, side, nearest.index);
        }
      }
    }
    if (drag?.type === "camera-label") {
      const camera = project.cameras.find((candidate) => candidate.id === drag.cameraId);
      const support = camera ? project.supports.find((candidate) => candidate.id === camera.supportId) : undefined;
      if (camera && support) {
        const frame = supportCameraFrame(camera, support);
        const raw = worldPoint(event, false);
        const dx = raw.x - frame.mount.x;
        const dy = raw.y - frame.mount.y;
        onMoveCameraLabel(camera.id, {
          x: Math.max(-360, Math.min(360, dx * frame.lateral.x + dy * frame.lateral.y)),
          y: Math.max(-360, Math.min(360, dx * frame.forward.x + dy * frame.forward.y)),
        });
      }
    }
    if (drag?.type === "cabinet") onMoveCabinet(drag.cabinetId, worldPoint(event, false));
    if (drag?.type === "cable-point") {
      let cablePoint = worldPoint(event, false);
      if (Math.abs(drag.trackOffset) > 0.001) {
        const cable = project.cables.find((candidate) => candidate.id === drag.cableId);
        const from = cable ? project.supports.find((support) => support.id === cable.fromSupportId) : undefined;
        const to = cable ? project.supports.find((support) => support.id === cable.toSupportId) : undefined;
        const previous = cable?.points[drag.index - 1] ?? from;
        const next = cable?.points[drag.index + 1] ?? to;
        if (previous && next) {
          const shifted = offsetPolyline([previous, cablePoint, next], drag.trackOffset)[1];
          cablePoint = { x: cablePoint.x - (shifted.x - cablePoint.x), y: cablePoint.y - (shifted.y - cablePoint.y) };
        }
      }
      onMoveCablePoint(drag.cableId, drag.index, cablePoint);
    }
    if (drag?.type === "cable-label") {
      const cable = project.cables.find((candidate) => candidate.id === drag.cableId);
      if (cable) {
        const points = cableTrackPoints(cableRoutePoints(cable, project.supports), drag.trackOffset);
        const raw = worldPoint(event, false);
        const nearest = nearestPointOnPolyline(points, raw);
        const start = points[nearest.segment];
        const end = points[nearest.segment + 1];
        if (start && end) {
          const length = Math.max(0.001, Math.hypot(end.x - start.x, end.y - start.y));
          const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
          const offset = (raw.x - nearest.point.x) * normal.x + (raw.y - nearest.point.y) * normal.y;
          onMoveCableLabel(
            cable.id,
            Math.max(0.05, Math.min(0.95, fractionAlongPolyline(points, nearest.point))),
            Math.max(-240, Math.min(240, offset)),
          );
        }
      }
    }
    if (drag?.type === "camera-cable-point") onMoveCameraCablePoint(drag.cableId, drag.index, worldPoint(event, false));
    if (drag?.type === "pan") {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = (event.clientX - drag.client.x) * drag.view.width / rect.width;
      const dy = (event.clientY - drag.client.y) * drag.view.height / rect.height;
      setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy });
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (drawing) {
      if (Math.hypot(drawing.end.x - drawing.start.x, drawing.end.y - drawing.start.y) > 60) onCreateRoad(drawing.start, drawing.end, drawing.kind);
      setDrawing(null);
    }
    if (drag?.type === "point" || drag?.type === "feature" || drag?.type === "cross-section" || drag?.type === "stamp" || drag?.type === "support" || drag?.type === "support-label" || drag?.type === "camera" || drag?.type === "camera-label" || drag?.type === "cabinet" || drag?.type === "cable-point" || drag?.type === "cable-label" || drag?.type === "camera-cable-point") onFinishDrag();
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;
    const factor = Math.exp(event.deltaY * 0.0012);
    const nextWidth = Math.min(3200, Math.max(420, view.width * factor));
    const nextHeight = nextWidth / (BASE_WIDTH / BASE_HEIGHT);
    const worldX = view.x + view.width * ratioX;
    const worldY = view.y + view.height * ratioY;
    const next = { x: worldX - nextWidth * ratioX, y: worldY - nextHeight * ratioY, width: nextWidth, height: nextHeight };
    setView(next);
    onZoom(BASE_WIDTH / nextWidth);
  }

  return (
    <svg
      ref={svgRef}
      className={`road-canvas tool-${tool.split(":")[0]}`}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      shapeRendering="geometricPrecision"
      role="application"
      aria-label="Интерактивный редактор перекрёстка"
    >
      <defs>
        <pattern id="small-grid" width={project.gridSize} height={project.gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${project.gridSize} 0 L 0 0 0 ${project.gridSize}`} fill="none" stroke="#dfe5e7" strokeWidth="1" />
        </pattern>
        <pattern id="large-grid" width={project.gridSize * 5} height={project.gridSize * 5} patternUnits="userSpaceOnUse">
          <rect width={project.gridSize * 5} height={project.gridSize * 5} fill="url(#small-grid)" />
          <path d={`M ${project.gridSize * 5} 0 L 0 0 0 ${project.gridSize * 5}`} fill="none" stroke="#c9d2d5" strokeWidth="1.4" />
        </pattern>
        <filter id="road-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#1f3036" floodOpacity=".18" />
        </filter>
        {halfJunctionClips.map((clip) => (
          <clipPath key={clip.id} id={clip.id} className="half-junction-branch-clip" clipPathUnits="userSpaceOnUse">
            <polygon points={clip.points.map((point) => `${point.x},${point.y}`).join(" ")} />
          </clipPath>
        ))}
      </defs>
      <rect x={view.x - view.width} y={view.y - view.height} width={view.width * 3} height={view.height * 3} fill="#eef2f2" />
      {grid && <rect x={view.x - view.width} y={view.y - view.height} width={view.width * 3} height={view.height * 3} fill="url(#large-grid)" />}

      <g filter="url(#road-shadow)" className="road-network-composite">
        {project.roads.map((road) => (
          <ClipGroups key={road.id} ids={halfJunctionClips.filter((clip) => clip.roadId === road.id).map((clip) => clip.id)}>
            <RoadArtwork
              road={road}
              tool={tool}
              selection={selection}
              junctions={junctions}
              onSelect={(next, event) => onSelect(next, screenAnchor(event))}
              onInsertPoint={onInsertRoadPoint}
              onSplitMarking={onSplitMarking}
              onFeatureDragStart={(roadId, featureId, event) => {
                setDrag({ type: "feature", roadId, featureId });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
            />
          </ClipGroups>
        ))}
        <g className="junction-layer">
        {junctions.map((junction) => {
          const selected = selection?.type === "junction" && selection.junctionId === junction.id;
          const asphaltSurface = [
            `${pathData(junction.polygon)} Z`,
            ...junction.cornerReturns.map(cornerReturnSurfacePath),
          ].join(" ");
          const connectedRoads = junction.roads
            .map((info) => project.roads.find((road) => road.id === info.roadId))
            .filter((road): road is Road => Boolean(road));
          const hostRoad = junction.branchRoadId
            ? connectedRoads.find((road) => road.id !== junction.branchRoadId)
            : connectedRoads[0];
          const asphaltFill = asphaltColor(hostRoad?.asphalt ?? "dark");
          const preservedRoad = junction.setting.extent === "half"
            ? project.roads.find((road) => road.id !== junction.branchRoadId && junction.roads.some((info) => info.roadId === road.id))
            : undefined;
          const selectJunction = (event: PointerEvent<SVGPathElement>) => {
            if (tool !== "select") return;
            event.stopPropagation();
            onSelect({ type: "junction", junctionId: junction.id }, screenAnchor(event));
          };
          return (
            <g key={junction.id} className={selected ? "junction selected" : "junction"}>
              <path
                className="junction-surface junction-asphalt-union"
                d={asphaltSurface}
                fill={asphaltFill}
                fillRule="nonzero"
                stroke="none"
                shapeRendering="geometricPrecision"
                onPointerDown={selectJunction}
              />
              {preservedRoad && <PreservedCenterMarking road={preservedRoad} junction={junction} tool={tool} selection={selection} onSelect={(next, event) => onSelect(next, screenAnchor(event))} onSplitMarking={onSplitMarking} />}
              {junction.cornerReturns.filter((corner) => hasEdgeMarking(corner, project.roads)).map((corner) => <path key={`${corner.id}-marking`} className="junction-edge-marking" d={cornerReturnMarkingPath(corner, EDGE_MARKING_INSET)} fill="none" pointerEvents="none" />)}
              {junction.setting.showBoundary && junction.approaches.map((approach) => {
                const center = {
                  x: junction.point.x + approach.outward.x * approach.baseDistance,
                  y: junction.point.y + approach.outward.y * approach.baseDistance,
                };
                const angle = Math.atan2(approach.outward.y, approach.outward.x) * 180 / Math.PI;
                return <g key={`${approach.id}-boundary`} transform={`translate(${center.x} ${center.y}) rotate(${angle})`} pointerEvents="none"><line className="junction-boundary" x1="0" y1={-approach.halfWidth} x2="0" y2={approach.halfWidth} /></g>;
              })}
              {junction.approaches.map((approach) => {
                const distanceFromCenter = approach.baseDistance + approach.offset;
                const center = {
                  x: junction.point.x + approach.outward.x * distanceFromCenter,
                  y: junction.point.y + approach.outward.y * distanceFromCenter,
                };
                const angle = Math.atan2(approach.outward.y, approach.outward.x) * 180 / Math.PI;
                const across = Math.max(16, approach.halfWidth - 7);
                const entrySpans = approachEntrySpans(approach, project.roads);
                return (
                  <g key={approach.id} className={`junction-approach rule-${approach.rule}`} transform={`translate(${center.x} ${center.y}) rotate(${angle})`} pointerEvents="none">
                    {(approach.stopLine || approach.rule === "stop") && entrySpans.map((span) => <line key={`${span.start}-${span.end}`} x1="0" y1={span.start} x2="0" y2={span.end} />)}
                    {approach.rule === "yield" && [-0.58, 0, 0.58].map((position) => (
                      <path key={position} d={`M 31 ${position * across - 7} L 14 ${position * across} L 31 ${position * across + 7} Z`} />
                    ))}
                    {approach.rule === "priority" && selected && <g className="editor-only priority-badge"><circle r="12" /><text y="4" textAnchor="middle">Г</text></g>}
                  </g>
                );
              })}
              {junction.approaches.map((approach) => (
                <g key={`${approach.id}-traffic-lights`} transform={`translate(${junction.point.x} ${junction.point.y})`}>
                  <TrafficLightArtwork approach={approach} selected={selected} />
                </g>
              ))}
            </g>
          );
        })}
        </g>
      </g>

      <g className="infrastructure-layer">
        <g className="cable-layer">
          {cableTracks.map(({ cable, bundleCount, trackOffset }) => <CableArtwork
            key={cable.id}
            cable={cable}
            supports={project.supports}
            trackOffset={trackOffset}
            bundleCount={bundleCount}
            selected={selection?.type === "cable" && selection.cableId === cable.id}
            interactive={tool === "select"}
            onSelect={(event) => {
              event.stopPropagation();
              onSelect({ type: "cable", cableId: cable.id }, screenAnchor(event));
            }}
            onInsertPoint={(point, index) => onInsertCablePoint(cable.id, point, index)}
            onPointDragStart={(index, event) => {
              event.stopPropagation();
              onSelect({ type: "cable", cableId: cable.id });
              setDrag({ type: "cable-point", cableId: cable.id, index, trackOffset });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onLabelDragStart={(event) => {
              onSelect({ type: "cable", cableId: cable.id });
              setDrag({ type: "cable-label", cableId: cable.id, trackOffset });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          />)}
        </g>
        <g className="support-layer">
          {project.supports.map((support) => (
            <SupportArtwork
              key={support.id}
              support={support}
              selected={(selection?.type === "support" && selection.supportId === support.id) || activeCableSupportIds.includes(support.id)}
              tool={tool}
              onSelect={(event) => {
                event.stopPropagation();
                onSelect({ type: "support", supportId: support.id }, screenAnchor(event));
              }}
              onDragStart={(event) => {
                setDrag({ type: "support", supportId: support.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onLabelDragStart={(event) => {
                onSelect({ type: "support", supportId: support.id });
                setDrag({ type: "support-label", supportId: support.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onConnect={(event) => {
                event.stopPropagation();
                onConnectSupport(support.id);
              }}
            />
          ))}
        </g>
        <g className="camera-layer">
          {project.cameras.map((camera) => {
            const support = project.supports.find((candidate) => candidate.id === camera.supportId);
            if (!support || support.kind !== "console-pole") return null;
            return <SupportCameraArtwork
              key={camera.id}
              camera={camera}
              support={support}
              selected={selection?.type === "camera" && selection.cameraId === camera.id}
              interactive={tool === "select"}
              onSelect={(event) => onSelect({ type: "camera", cameraId: camera.id }, screenAnchor(event))}
              onDragStart={(event) => {
                setDrag({ type: "camera", cameraId: camera.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onLabelDragStart={(event) => {
                setDrag({ type: "camera-label", cameraId: camera.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
            />;
          })}
        </g>
        <g className="cabinet-layer">
          {project.cabinets.map((cabinet) => {
            const support = project.supports.find((candidate) => candidate.id === cabinet.supportId);
            if (!support) return null;
            return <CabinetArtwork
              key={cabinet.id}
              cabinet={cabinet}
              support={support}
              selected={selection?.type === "cabinet" && selection.cabinetId === cabinet.id}
              interactive={tool === "select"}
              onSelect={(event) => onSelect({ type: "cabinet", cabinetId: cabinet.id }, screenAnchor(event))}
              onDragStart={(event) => {
                setDrag({ type: "cabinet", cabinetId: cabinet.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
            />;
          })}
        </g>
        <g className="camera-cable-layer">
          {project.cameraCables.map((cable) => <CameraCableArtwork
            key={cable.id}
            cable={cable}
            project={project}
            selected={selection?.type === "camera-cable" && selection.cableId === cable.id}
            interactive={tool === "select"}
            onSelect={(event) => {
              event.stopPropagation();
              onSelect({ type: "camera-cable", cableId: cable.id }, screenAnchor(event));
            }}
            onInsertPoint={(point, index) => onInsertCameraCablePoint(cable.id, point, index)}
            onPointDragStart={(index, event) => {
              event.stopPropagation();
              onSelect({ type: "camera-cable", cableId: cable.id });
              setDrag({ type: "camera-cable-point", cableId: cable.id, index });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          />)}
        </g>
      </g>

      {project.roads.filter((road) => tool === "cross-section" || selection && "roadId" in selection && selection.roadId === road.id).map((road) => <g key={`${road.id}-axis-editing`}>
        <RoadAxisOverlay road={road} />
        <RoadCrossSectionsOverlay
          road={road}
          selection={selection}
          interactive={tool === "select"}
          onSelect={(section) => onSelect({ type: "cross-section", roadId: road.id, sectionId: section.id })}
          onDragStart={(section, event) => {
            setDrag({ type: "cross-section", roadId: road.id, sectionId: section.id });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
        />
      </g>)}

      {project.stamps.map((stamp) => (
        <StampArtwork
          key={stamp.id}
          stamp={stamp}
          selected={selection?.type === "stamp" && selection.stampId === stamp.id}
          interactive={tool === "select"}
          onSelect={(event) => onSelect({ type: "stamp", stampId: stamp.id }, screenAnchor(event))}
          onDragStart={(event) => {
            setDrag({ type: "stamp", stampId: stamp.id });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
        />
      ))}

      {selection && "roadId" in selection && project.roads.find((road) => road.id === selection.roadId)?.points.map((point, index, points) => (
        <g key={`${selection.roadId}-handle-${index}`} className={selection.type === "vertex" && selection.index === index ? "node-handle selected" : "node-handle"} transform={`translate(${point.x} ${point.y})`}>
          <circle r="14" />
          <text y="4" textAnchor="middle">{index + 1}</text>
          <circle
            className="node-hit"
            r="28"
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ type: "vertex", roadId: selection.roadId, index });
              setDrag({
                type: "point",
                roadId: selection.roadId,
                index,
                previousUnit: unitVector(points[index - 1], point),
                nextUnit: unitVector(point, points[index + 1]),
              });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          />
        </g>
      ))}

      {drawing && <g pointerEvents="none">
        {drawing.kind === "branch" && drawing.sourceAngle !== undefined && (() => {
          const normal = { x: -Math.sin(drawing.sourceAngle), y: Math.cos(drawing.sourceAngle) };
          const first = { x: drawing.start.x + normal.x * 260, y: drawing.start.y + normal.y * 260 };
          const second = { x: drawing.start.x - normal.x * 260, y: drawing.start.y - normal.y * 260 };
          return <g className="editor-only branch-side-guide">
            <path d={pathData([first, second])} />
            {[first, second].map((point, index) => <g key={index} transform={`translate(${point.x} ${point.y})`}><circle r="15" /><text y="4" textAnchor="middle">{index === 0 ? "А" : "Б"}</text></g>)}
          </g>;
        })()}
        <path d={pathData([drawing.start, drawing.end])} stroke="#1f2c32" strokeWidth={drawing.kind === "branch" ? 96 : 178} opacity=".86" />
        <path d={pathData([drawing.start, drawing.end])} stroke="#fff" strokeWidth="2" strokeDasharray="24 16" />
        <circle cx={drawing.start.x} cy={drawing.start.y} r="10" fill="#19a6ce" stroke="#fff" strokeWidth="4" />
        <circle cx={drawing.end.x} cy={drawing.end.y} r="10" fill="#19a6ce" stroke="#fff" strokeWidth="4" />
        {(() => {
          const angle = Math.atan2(drawing.end.y - drawing.start.y, drawing.end.x - drawing.start.x) * 180 / Math.PI;
          return <g transform={`translate(${drawing.end.x + 18} ${drawing.end.y - 18})`}>
            <rect x="-4" y="-17" width="48" height="24" rx="8" fill="#fff" stroke="#8fc9d9" />
            <text x="20" y="0" textAnchor="middle" fontFamily="Segoe UI, Arial" fontSize="11" fontWeight="700" fill="#176f89">{Math.round(angle)}°</text>
          </g>;
        })()}
      </g>}

      {project.roads.map((road) => (
        <MarkingPointOverlay key={`${road.id}-marking-points`} road={road} junctions={junctions} selection={selection} />
      ))}
    </svg>
  );
});
