import { JunctionApproachSetting, JunctionExtent, JunctionSetting, Point, Road, roadLaneWidthsAt, roadWidth } from "./model";

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathData(points: Point[]) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function segmentNormal(a: Point, b: Point) {
  const length = Math.max(distance(a, b), 0.001);
  return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
}

export function offsetPolyline(points: Point[], offset: number): Point[] {
  if (points.length < 2) return points;
  return points.map((point, index) => {
    if (index === 0) {
      const normal = segmentNormal(points[0], points[1]);
      return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
    }
    if (index === points.length - 1) {
      const normal = segmentNormal(points[index - 1], points[index]);
      return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
    }
    const previous = segmentNormal(points[index - 1], point);
    const next = segmentNormal(point, points[index + 1]);
    const combined = { x: previous.x + next.x, y: previous.y + next.y };
    const combinedLength = Math.max(Math.hypot(combined.x, combined.y), 0.001);
    const unit = { x: combined.x / combinedLength, y: combined.y / combinedLength };
    const denominator = Math.max(Math.abs(unit.x * next.x + unit.y * next.y), 0.25);
    const miter = Math.min(Math.abs(offset / denominator), Math.abs(offset) * 3) * Math.sign(offset || 1);
    return { x: point.x + unit.x * miter, y: point.y + unit.y * miter };
  });
}

export function laneOffsets(road: Road, at = 0.5) {
  const widths = roadLaneWidthsAt(road, at);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const boundaries = [total / 2];
  for (const width of widths) boundaries.push(boundaries[boundaries.length - 1] - width);
  return boundaries;
}

function variableOffsetPolyline(points: Point[], offsets: number[]) {
  if (points.length < 2) return points;
  return points.map((point, index) => {
    const offset = offsets[index] ?? 0;
    if (index === 0) {
      const normal = segmentNormal(points[0], points[1]);
      return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
    }
    if (index === points.length - 1) {
      const normal = segmentNormal(points[index - 1], points[index]);
      return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
    }
    const previous = segmentNormal(points[index - 1], point);
    const next = segmentNormal(point, points[index + 1]);
    const combined = { x: previous.x + next.x, y: previous.y + next.y };
    const combinedLength = Math.max(Math.hypot(combined.x, combined.y), 0.001);
    const unit = { x: combined.x / combinedLength, y: combined.y / combinedLength };
    const denominator = Math.max(Math.abs(unit.x * next.x + unit.y * next.y), 0.25);
    const miter = Math.min(Math.abs(offset / denominator), Math.abs(offset) * 3) * Math.sign(offset || 1);
    return { x: point.x + unit.x * miter, y: point.y + unit.y * miter };
  });
}

export function roadSampleFractions(road: Road) {
  const lengths = road.points.slice(1).map((point, index) => distance(road.points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const count = Math.max(16, Math.ceil(total / 16));
  const fractions = Array.from({ length: count + 1 }, (_, index) => index / count);
  let travelled = 0;
  for (const length of lengths.slice(0, -1)) {
    travelled += length;
    fractions.push(travelled / total);
  }
  for (const section of road.crossSections ?? []) fractions.push(section.at);
  return [...new Set(fractions.map((fraction) => Math.round(Math.max(0, Math.min(1, fraction)) * 100000) / 100000))].sort((first, second) => first - second);
}

export function variableOffsetRoadPath(road: Road, offsetAt: (fraction: number) => number) {
  const fractions = roadSampleFractions(road);
  const centers = fractions.map((fraction) => pointAlong(road.points, fraction).point);
  return variableOffsetPolyline(centers, fractions.map(offsetAt));
}

export function laneBoundaryPath(road: Road, boundaryIndex: number, inset = 0) {
  return variableOffsetRoadPath(road, (fraction) => (laneOffsets(road, fraction)[boundaryIndex] ?? 0) + inset);
}

export function laneCenterPath(road: Road, laneIndex: number) {
  return variableOffsetRoadPath(road, (fraction) => {
    const boundaries = laneOffsets(road, fraction);
    return ((boundaries[laneIndex] ?? 0) + (boundaries[laneIndex + 1] ?? 0)) / 2;
  });
}

export function lanePolygon(road: Road, laneIndex: number) {
  const left = laneBoundaryPath(road, laneIndex);
  const right = laneBoundaryPath(road, laneIndex + 1).reverse();
  return [...left, ...right].map((point) => `${point.x},${point.y}`).join(" ");
}

export function roadSurfacePolygon(road: Road) {
  const left = laneBoundaryPath(road, 0);
  const right = laneBoundaryPath(road, road.lanes.length).reverse();
  return [...left, ...right].map((point) => `${point.x},${point.y}`).join(" ");
}

export function pointAlong(points: Point[], fraction: number, offset = 0) {
  if (points.length < 2) return { point: points[0] ?? { x: 0, y: 0 }, angle: 0 };
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let target = total * Math.min(1, Math.max(0, fraction));
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const a = points[index];
      const b = points[index + 1];
      const t = lengths[index] ? target / lengths[index] : 0;
      const normal = segmentNormal(a, b);
      return {
        point: {
          x: a.x + (b.x - a.x) * t + normal.x * offset,
          y: a.y + (b.y - a.y) * t + normal.y * offset,
        },
        angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI,
      };
    }
    target -= lengths[index];
  }
  return { point: points[0], angle: 0 };
}

export function nearestPointOnPolyline(points: Point[], target: Point) {
  let best = { point: points[0] ?? target, segment: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSquared));
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    const candidateDistance = distance(point, target);
    if (candidateDistance < best.distance) best = { point, segment: index, distance: candidateDistance };
  }
  return best;
}

export function fractionAlongPolyline(points: Point[], target: Point) {
  if (points.length < 2) return 0;
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let travelled = 0;
  let bestFraction = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lengths.length; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSquared));
    const projected = { x: a.x + dx * t, y: a.y + dy * t };
    const candidateDistance = distance(projected, target);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestFraction = (travelled + lengths[index] * t) / total;
    }
    travelled += lengths[index];
  }
  return bestFraction;
}

export function subPolyline(points: Point[], start: number, end: number) {
  if (points.length < 2) return points;
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(1, Math.max(start, end));
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const result: Point[] = [pointAlong(points, from).point];
  let travelled = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    travelled += lengths[index - 1];
    const fraction = travelled / total;
    if (fraction > from && fraction < to) result.push(points[index]);
  }
  result.push(pointAlong(points, to).point);
  return result;
}

export function roadBounds(roads: Road[]) {
  const points = roads.flatMap((road) => road.points);
  if (!points.length) return { x: 0, y: 0, width: 1600, height: 1000 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 240;
  const minY = Math.min(...ys) - 240;
  const maxX = Math.max(...xs) + 240;
  const maxY = Math.max(...ys) + 240;
  return { x: minX, y: minY, width: Math.max(maxX - minX, 400), height: Math.max(maxY - minY, 300) };
}

function cross(a: Point, b: Point) {
  return a.x * b.y - a.y * b.x;
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): { point: Point; t: number; u: number } | null {
  const first = { x: b.x - a.x, y: b.y - a.y };
  const second = { x: d.x - c.x, y: d.y - c.y };
  const denominator = cross(first, second);
  if (Math.abs(denominator) < 0.0001) return null;
  const delta = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(delta, second) / denominator;
  const u = cross(delta, first) / denominator;
  if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
  return { point: { x: a.x + first.x * t, y: a.y + first.y * t }, t, u };
}

export interface JunctionRoadInfo {
  roadId: string;
  segment: number;
  t: number;
  unit: Point;
  width: number;
  endpoint: "start" | "end" | null;
}

export interface RoadJunction {
  id: string;
  point: Point;
  polygon: Point[];
  roads: [JunctionRoadInfo, JunctionRoadInfo];
  supportsHalf: boolean;
  branchRoadId?: string;
  branchInward?: Point;
}

export interface JunctionApproach {
  id: string;
  roadId: string;
  roadName: string;
  side: "start" | "end";
  outward: Point;
  baseDistance: number;
  halfWidth: number;
}

export interface ResolvedJunction extends RoadJunction {
  polygon: Point[];
  setting: JunctionSetting;
  approaches: Array<JunctionApproach & JunctionApproachSetting>;
  cornerReturns: JunctionCornerReturn[];
}

export interface JunctionCornerReturn {
  id: string;
  corner: Point;
  start: Point;
  end: Point;
  controlStart: Point;
  controlEnd: Point;
  outwardStart: Point;
  outwardEnd: Point;
  arcRadius: number;
  sweep: number;
  tangents: Array<{ roadId: string; approachId: string; point: Point; lateral: number; inward: Point }>;
}

function junctionPolygon(point: Point, firstA: Point, firstB: Point, secondA: Point, secondB: Point, firstHalf: number, secondHalf: number) {
  const firstNormal = segmentNormal(firstA, firstB);
  const secondNormal = segmentNormal(secondA, secondB);
  const determinant = firstNormal.x * secondNormal.y - firstNormal.y * secondNormal.x;
  if (Math.abs(determinant) < 0.001) return [];
  const corners: Point[] = [];
  for (const firstSign of [-1, 1]) {
    for (const secondSign of [-1, 1]) {
      const firstValue = firstHalf * firstSign;
      const secondValue = secondHalf * secondSign;
      const x = (firstValue * secondNormal.y - firstNormal.y * secondValue) / determinant;
      const y = (firstNormal.x * secondValue - firstValue * secondNormal.x) / determinant;
      corners.push({ x: point.x + x, y: point.y + y });
    }
  }
  return corners.sort((a, b) => Math.atan2(a.y - point.y, a.x - point.x) - Math.atan2(b.y - point.y, b.x - point.x));
}

export function roadJunctions(roads: Road[]): RoadJunction[] {
  const result: RoadJunction[] = [];
  for (let firstIndex = 0; firstIndex < roads.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < roads.length; secondIndex += 1) {
      const firstRoad = roads[firstIndex];
      const secondRoad = roads[secondIndex];
      for (let firstSegment = 0; firstSegment < firstRoad.points.length - 1; firstSegment += 1) {
        for (let secondSegment = 0; secondSegment < secondRoad.points.length - 1; secondSegment += 1) {
          const intersection = segmentIntersection(
            firstRoad.points[firstSegment],
            firstRoad.points[firstSegment + 1],
            secondRoad.points[secondSegment],
            secondRoad.points[secondSegment + 1],
          );
          if (!intersection) continue;
          const { point, t, u } = intersection;
          const firstFraction = fractionAlongPolyline(firstRoad.points, point);
          const secondFraction = fractionAlongPolyline(secondRoad.points, point);
          const polygon = junctionPolygon(
            point,
            firstRoad.points[firstSegment],
            firstRoad.points[firstSegment + 1],
            secondRoad.points[secondSegment],
            secondRoad.points[secondSegment + 1],
            roadWidth(firstRoad, firstFraction) / 2,
            roadWidth(secondRoad, secondFraction) / 2,
          );
          if (polygon.length !== 4) continue;
          const duplicate = result.find((junction) => distance(junction.point, point) < 12);
          if (duplicate) continue;
          const roadInfo = (road: Road, segment: number, position: number): JunctionRoadInfo => {
            const a = road.points[segment];
            const b = road.points[segment + 1];
            const length = Math.max(distance(a, b), 0.001);
            const endpoint = segment === 0 && position <= 0.015
              ? "start"
              : segment === road.points.length - 2 && position >= 0.985
                ? "end"
                : null;
            return {
              roadId: road.id,
              segment,
              t: position,
              unit: { x: (b.x - a.x) / length, y: (b.y - a.y) / length },
              width: roadWidth(road, fractionAlongPolyline(road.points, point)),
              endpoint,
            };
          };
          const roadsInfo: [JunctionRoadInfo, JunctionRoadInfo] = [
            roadInfo(firstRoad, firstSegment, t),
            roadInfo(secondRoad, secondSegment, u),
          ];
          const branch = roadsInfo.filter((info) => info.endpoint).sort((a, b) => a.width - b.width)[0];
          const branchInward = branch?.endpoint === "end"
            ? branch.unit
            : branch?.endpoint === "start"
              ? { x: -branch.unit.x, y: -branch.unit.y }
              : undefined;
          result.push({
            id: `${firstRoad.id}-${secondRoad.id}-${firstSegment}-${secondSegment}`,
            point,
            polygon,
            roads: roadsInfo,
            supportsHalf: Boolean(branch),
            branchRoadId: branch?.roadId,
            branchInward,
          });
        }
      }
    }
  }
  return result;
}

function dot(point: Point, vector: Point) {
  return point.x * vector.x + point.y * vector.y;
}

function clipPolygon(points: Point[], origin: Point, normal: Point) {
  const result: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentValue = dot({ x: current.x - origin.x, y: current.y - origin.y }, normal);
    const nextValue = dot({ x: next.x - origin.x, y: next.y - origin.y }, normal);
    const currentInside = currentValue <= 0.001;
    const nextInside = nextValue <= 0.001;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const ratio = currentValue / (currentValue - nextValue);
      result.push({ x: current.x + (next.x - current.x) * ratio, y: current.y + (next.y - current.y) * ratio });
    }
  }
  return result;
}

export function junctionPolygonForExtent(junction: RoadJunction, extent: JunctionExtent) {
  if (extent === "half" && junction.branchInward && junction.branchRoadId) {
    const host = junction.roads.find((road) => road.roadId !== junction.branchRoadId);
    if (host) {
      const hostNormal = { x: -host.unit.y, y: host.unit.x };
      const branchOutward = { x: -junction.branchInward.x, y: -junction.branchInward.y };
      const branchSide = Math.sign(dot(branchOutward, hostNormal)) || 1;
      const clipNormal = { x: -hostNormal.x * branchSide, y: -hostNormal.y * branchSide };
      return clipPolygon(junction.polygon, junction.point, clipNormal);
    }
  }
  return junction.polygon;
}

export function junctionBranchClipPolygon(junction: RoadJunction, extent = 100000) {
  if (!junction.branchInward || !junction.branchRoadId) return [];
  const host = junction.roads.find((road) => road.roadId !== junction.branchRoadId);
  if (!host) return [];
  const hostNormal = { x: -host.unit.y, y: host.unit.x };
  const branchOutward = { x: -junction.branchInward.x, y: -junction.branchInward.y };
  const branchSide = Math.sign(dot(branchOutward, hostNormal)) || 1;
  const allowedNormal = { x: hostNormal.x * branchSide, y: hostNormal.y * branchSide };
  const overlap = 1.5;
  const boundary = {
    x: junction.point.x - allowedNormal.x * overlap,
    y: junction.point.y - allowedNormal.y * overlap,
  };
  return [
    { x: boundary.x - host.unit.x * extent, y: boundary.y - host.unit.y * extent },
    { x: boundary.x + host.unit.x * extent, y: boundary.y + host.unit.y * extent },
    { x: boundary.x + host.unit.x * extent + allowedNormal.x * extent, y: boundary.y + host.unit.y * extent + allowedNormal.y * extent },
    { x: boundary.x - host.unit.x * extent + allowedNormal.x * extent, y: boundary.y - host.unit.y * extent + allowedNormal.y * extent },
  ];
}

export function roundedPolygonPath(points: Point[], radius: number) {
  if (points.length < 3) return pathData(points);
  const corners = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = distance(point, previous);
    const nextLength = distance(point, next);
    const safeRadius = Math.max(0, Math.min(radius, previousLength * 0.38, nextLength * 0.38));
    return {
      point,
      before: {
        x: point.x + (previous.x - point.x) * safeRadius / Math.max(previousLength, 0.001),
        y: point.y + (previous.y - point.y) * safeRadius / Math.max(previousLength, 0.001),
      },
      after: {
        x: point.x + (next.x - point.x) * safeRadius / Math.max(nextLength, 0.001),
        y: point.y + (next.y - point.y) * safeRadius / Math.max(nextLength, 0.001),
      },
    };
  });
  return `${corners.map((corner, index) => `${index === 0 ? "M" : "L"} ${corner.before.x} ${corner.before.y} Q ${corner.point.x} ${corner.point.y} ${corner.after.x} ${corner.after.y}`).join(" ")} Z`;
}

export function junctionApproaches(junction: RoadJunction, roads: Road[], polygon: Point[]): JunctionApproach[] {
  const approaches: JunctionApproach[] = [];
  for (const info of junction.roads) {
    const road = roads.find((candidate) => candidate.id === info.roadId);
    if (!road) continue;
    const add = (side: "start" | "end", outward: Point) => {
      const baseDistance = Math.max(0, ...polygon.map((point) => dot({ x: point.x - junction.point.x, y: point.y - junction.point.y }, outward)));
      approaches.push({
        id: `${road.id}:${side}`,
        roadId: road.id,
        roadName: road.name,
        side,
        outward,
        baseDistance,
        halfWidth: info.width / 2,
      });
    };
    if (info.segment > 0 || info.t > 0.015) add("start", { x: -info.unit.x, y: -info.unit.y });
    if (info.segment < road.points.length - 2 || info.t < 0.985) add("end", info.unit);
  }
  return approaches;
}

export function junctionCornerReturns(
  junction: RoadJunction,
  approaches: JunctionApproach[],
  radius: number,
): JunctionCornerReturn[] {
  if (radius <= 0) return [];
  return junction.polygon.flatMap((corner, cornerIndex) => {
    const relative = { x: corner.x - junction.point.x, y: corner.y - junction.point.y };
    const selected = junction.roads.map((info) => {
      const candidates = approaches
        .filter((approach) => approach.roadId === info.roadId)
        .map((approach) => ({ approach, score: dot(relative, approach.outward) }))
        .sort((first, second) => second.score - first.score);
      if (!candidates[0] || candidates[0].score <= 0.001) return null;
      return { info, approach: candidates[0].approach };
    });
    if (!selected[0] || !selected[1]) return [];
    const first = selected[0];
    const second = selected[1];
    const cornerAngle = Math.acos(Math.max(-0.9999, Math.min(0.9999, dot(first.approach.outward, second.approach.outward))));
    const tangentDistance = Math.min(radius / Math.max(Math.tan(cornerAngle / 2), 0.001), radius * 4);
    const arcRadius = tangentDistance * Math.tan(cornerAngle / 2);
    const sweep = Math.PI - cornerAngle;
    const start = {
      x: corner.x + first.approach.outward.x * tangentDistance,
      y: corner.y + first.approach.outward.y * tangentDistance,
    };
    const end = {
      x: corner.x + second.approach.outward.x * tangentDistance,
      y: corner.y + second.approach.outward.y * tangentDistance,
    };
    const control = arcRadius * 4 / 3 * Math.tan(sweep / 4);
    const controlStart = {
      x: start.x - first.approach.outward.x * control,
      y: start.y - first.approach.outward.y * control,
    };
    const controlEnd = {
      x: end.x - second.approach.outward.x * control,
      y: end.y - second.approach.outward.y * control,
    };
    const tangent = (info: JunctionRoadInfo, approach: JunctionApproach, point: Point) => {
      const normal = { x: -info.unit.y, y: info.unit.x };
      const lateral = dot({ x: point.x - junction.point.x, y: point.y - junction.point.y }, normal);
      return {
        roadId: approach.roadId,
        approachId: approach.id,
        point,
        lateral,
        inward: { x: normal.x * -Math.sign(lateral || 1), y: normal.y * -Math.sign(lateral || 1) },
      };
    };
    return [{
      id: `${junction.id}-corner-${cornerIndex}`,
      corner,
      start,
      end,
      controlStart,
      controlEnd,
      outwardStart: first.approach.outward,
      outwardEnd: second.approach.outward,
      arcRadius,
      sweep,
      tangents: [
        tangent(first.info, first.approach, start),
        tangent(second.info, second.approach, end),
      ],
    }];
  });
}

export function cornerReturnSurfacePath(corner: JunctionCornerReturn) {
  return `M ${corner.corner.x} ${corner.corner.y} L ${corner.start.x} ${corner.start.y} C ${corner.controlStart.x} ${corner.controlStart.y} ${corner.controlEnd.x} ${corner.controlEnd.y} ${corner.end.x} ${corner.end.y} Z`;
}

export function cornerReturnCurbPath(corner: JunctionCornerReturn) {
  return `M ${corner.start.x} ${corner.start.y} C ${corner.controlStart.x} ${corner.controlStart.y} ${corner.controlEnd.x} ${corner.controlEnd.y} ${corner.end.x} ${corner.end.y}`;
}

export function cornerReturnMarkingPoints(corner: JunctionCornerReturn, inset = 7) {
  const start = {
    x: corner.start.x + corner.tangents[0].inward.x * inset,
    y: corner.start.y + corner.tangents[0].inward.y * inset,
  };
  const end = {
    x: corner.end.x + corner.tangents[1].inward.x * inset,
    y: corner.end.y + corner.tangents[1].inward.y * inset,
  };
  return [
    {
      roadId: corner.tangents[0].roadId,
      point: start,
      lateral: corner.tangents[0].lateral - Math.sign(corner.tangents[0].lateral || 1) * inset,
    },
    {
      roadId: corner.tangents[1].roadId,
      point: end,
      lateral: corner.tangents[1].lateral - Math.sign(corner.tangents[1].lateral || 1) * inset,
    },
  ] as const;
}

export function cornerReturnMarkingGeometry(corner: JunctionCornerReturn, inset = 7) {
  const [startTangent, endTangent] = cornerReturnMarkingPoints(corner, inset);
  const start = startTangent.point;
  const end = endTangent.point;
  const radius = corner.arcRadius + inset;
  const control = radius * 4 / 3 * Math.tan(corner.sweep / 4);
  const controlStart = {
    x: start.x - corner.outwardStart.x * control,
    y: start.y - corner.outwardStart.y * control,
  };
  const controlEnd = {
    x: end.x - corner.outwardEnd.x * control,
    y: end.y - corner.outwardEnd.y * control,
  };
  return { start, end, controlStart, controlEnd };
}

export function cornerReturnMarkingPath(corner: JunctionCornerReturn, inset = 7) {
  const { start, end, controlStart, controlEnd } = cornerReturnMarkingGeometry(corner, inset);
  return `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y} ${controlEnd.x} ${controlEnd.y} ${end.x} ${end.y}`;
}

export function cornerReturnAsphaltShoulderPath(corner: JunctionCornerReturn, inset = 7) {
  const marking = cornerReturnMarkingGeometry(corner, inset);
  return `M ${corner.start.x} ${corner.start.y} C ${corner.controlStart.x} ${corner.controlStart.y} ${corner.controlEnd.x} ${corner.controlEnd.y} ${corner.end.x} ${corner.end.y} L ${marking.end.x} ${marking.end.y} C ${marking.controlEnd.x} ${marking.controlEnd.y} ${marking.controlStart.x} ${marking.controlStart.y} ${marking.start.x} ${marking.start.y} Z`;
}

export function defaultJunctionSetting(junction: RoadJunction, roads: Road[]): JunctionSetting {
  const extent: JunctionExtent = "full";
  const polygon = junctionPolygonForExtent(junction, extent);
  const secondaryRoadId = junction.branchRoadId ?? junction.roads[1].roadId;
  return {
    id: junction.id,
    extent,
    cornerRadius: automaticJunctionRadius(junction),
    showBoundary: true,
    approaches: junctionApproaches(junction, roads, polygon).map((approach) => ({
      id: approach.id,
      rule: approach.roadId === secondaryRoadId ? "stop" : "priority",
      offset: 12,
      stopLine: true,
      trafficLights: "none",
      trafficLightOffset: 18,
    })),
  };
}

export function automaticJunctionRadius(junction: RoadJunction) {
  return Math.max(9, Math.min(...junction.roads.map((road) => road.width)) / 4);
}

export function resolveJunction(junction: RoadJunction, roads: Road[], stored?: JunctionSetting): ResolvedJunction {
  const defaults = defaultJunctionSetting(junction, roads);
  const setting: JunctionSetting = {
    ...defaults,
    ...stored,
    cornerRadius: automaticJunctionRadius(junction),
    extent: stored?.extent === "half" && !junction.supportsHalf ? "full" : stored?.extent ?? defaults.extent,
    approaches: defaults.approaches.map((approach) => ({
      ...approach,
      ...stored?.approaches.find((candidate) => candidate.id === approach.id),
      stopLine: stored?.approaches.find((candidate) => candidate.id === approach.id)?.stopLine ?? true,
      trafficLights: stored?.approaches.find((candidate) => candidate.id === approach.id)?.trafficLights ?? "none",
      trafficLightOffset: stored?.approaches.find((candidate) => candidate.id === approach.id)?.trafficLightOffset ?? 18,
    })),
  };
  const polygon = junctionPolygonForExtent(junction, setting.extent);
  const radius = setting.cornerRadius;
  const baseApproaches = junctionApproaches(junction, roads, polygon);
  const cornerReturns = junctionCornerReturns(junction, baseApproaches, radius);
  const approaches = baseApproaches.map((approach) => ({
    ...approach,
    baseDistance: Math.max(
      approach.baseDistance,
      ...cornerReturns
        .flatMap((corner) => corner.tangents)
        .filter((tangent) => tangent.approachId === approach.id)
        .map((tangent) => dot({ x: tangent.point.x - junction.point.x, y: tangent.point.y - junction.point.y }, approach.outward)),
    ),
    ...(setting.approaches.find((candidate) => candidate.id === approach.id) ?? {
      id: approach.id,
      rule: "priority" as const,
      offset: 12,
      stopLine: true,
      trafficLights: "none" as const,
      trafficLightOffset: 18,
    }),
  }));
  return { ...junction, polygon, setting, approaches, cornerReturns };
}

function fractionAtSegment(road: Road, segment: number, t: number) {
  const lengths = road.points.slice(1).map((point, index) => distance(road.points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const before = lengths.slice(0, segment).reduce((sum, length) => sum + length, 0);
  return Math.max(0, Math.min(1, (before + (lengths[segment] ?? 0) * t) / total));
}

function junctionApproachFractionsForRoad(road: Road, junction: ResolvedJunction, lateralOffset: number) {
  const info = junction.roads.find((candidate) => candidate.roadId === road.id);
  if (!info) return [];
  const normal = { x: -info.unit.y, y: info.unit.x };
  const markingLine = offsetPolyline(road.points, lateralOffset);
  return junction.approaches
    .filter((approach) => approach.roadId === road.id)
    .map((approach) => fractionAlongPolyline(markingLine, {
      x: junction.point.x + approach.outward.x * approach.baseDistance + normal.x * lateralOffset,
      y: junction.point.y + approach.outward.y * approach.baseDistance + normal.y * lateralOffset,
    }))
    .sort((first, second) => first - second);
}

function junctionSurfaceFractionsForRoad(road: Road, junction: ResolvedJunction, lateralOffset: number) {
  const info = junction.roads.find((candidate) => candidate.roadId === road.id);
  if (!info) return [];
  const normal = { x: -info.unit.y, y: info.unit.x };
  const markingLine = offsetPolyline(road.points, lateralOffset);
  const local = junction.polygon.map((point) => ({
    point,
    lateral: dot({ x: point.x - junction.point.x, y: point.y - junction.point.y }, normal),
  }));
  const fractions: number[] = [];
  for (let index = 0; index < local.length; index += 1) {
    const current = local[index];
    const next = local[(index + 1) % local.length];
    const currentSide = current.lateral - lateralOffset;
    const nextSide = next.lateral - lateralOffset;
    if (Math.abs(currentSide) < 0.001) {
      fractions.push(fractionAlongPolyline(markingLine, current.point));
    }
    if (currentSide * nextSide < -0.000001) {
      const ratio = currentSide / (currentSide - nextSide);
      fractions.push(fractionAlongPolyline(markingLine, {
        x: current.point.x + (next.point.x - current.point.x) * ratio,
        y: current.point.y + (next.point.y - current.point.y) * ratio,
      }));
    }
  }
  return fractions
    .sort((first, second) => first - second)
    .filter((fraction, index, sorted) => index === 0 || Math.abs(fraction - sorted[index - 1]) > 0.0005);
}

function junctionIntervalForRoad(road: Road, junction: ResolvedJunction, lateralOffset: number) {
  const info = junction.roads.find((candidate) => candidate.roadId === road.id);
  if (!info) return null;
  const approachFractions = junctionApproachFractionsForRoad(road, junction, lateralOffset);
  if (approachFractions.length >= 2) {
    return {
      start: approachFractions[0],
      end: approachFractions[approachFractions.length - 1],
      junctionId: junction.id,
    };
  }
  if (approachFractions.length === 1) {
    const center = fractionAlongPolyline(offsetPolyline(road.points, lateralOffset), {
      x: junction.point.x + -info.unit.y * lateralOffset,
      y: junction.point.y + info.unit.x * lateralOffset,
    });
    return {
      start: Math.min(center, approachFractions[0]),
      end: Math.max(center, approachFractions[0]),
      junctionId: junction.id,
    };
  }

  const segmentLength = distance(road.points[info.segment], road.points[info.segment + 1]);
  if (segmentLength < 0.001) return null;
  const normal = { x: -info.unit.y, y: info.unit.x };
  const local = junction.polygon.map((point) => {
    const relative = { x: point.x - junction.point.x, y: point.y - junction.point.y };
    return { along: dot(relative, info.unit), lateral: dot(relative, normal) };
  });
  const crossings: number[] = [];
  for (let index = 0; index < local.length; index += 1) {
    const current = local[index];
    const next = local[(index + 1) % local.length];
    if (Math.abs(current.lateral - lateralOffset) < 0.001) crossings.push(current.along);
    const firstSide = current.lateral - lateralOffset;
    const secondSide = next.lateral - lateralOffset;
    if (firstSide * secondSide < -0.000001) {
      const ratio = firstSide / (firstSide - secondSide);
      crossings.push(current.along + (next.along - current.along) * ratio);
    }
  }
  if (crossings.length < 2) return null;
  const start = fractionAtSegment(road, info.segment, info.t + Math.min(...crossings) / segmentLength);
  const end = fractionAtSegment(road, info.segment, info.t + Math.max(...crossings) / segmentLength);
  return { start: Math.min(start, end), end: Math.max(start, end), junctionId: junction.id };
}

function preservesCenterLine(junction: ResolvedJunction, roadId: string, lateralOffset: number) {
  return junction.setting.extent === "half"
    && junction.branchRoadId !== roadId
    && Math.abs(lateralOffset) < 1.5;
}

export function junctionIntervalsForRoad(road: Road, junctions: ResolvedJunction[], lateralOffset = 0) {
  return junctions
    .filter((junction) => !preservesCenterLine(junction, road.id, lateralOffset))
    .map((junction) => junctionIntervalForRoad(road, junction, lateralOffset))
    .filter((interval): interval is NonNullable<typeof interval> => Boolean(interval))
    .sort((a, b) => a.start - b.start);
}

export function junctionDivisionPointsForRoad(road: Road, junctions: ResolvedJunction[], lateralOffset = 0) {
  return junctions.flatMap((junction) => {
    if (!preservesCenterLine(junction, road.id, lateralOffset)) return [];
    return junctionSurfaceFractionsForRoad(road, junction, lateralOffset);
  }).sort((a, b) => a - b);
}

export function junctionCurbIntervalsForRoad(road: Road, junctions: ResolvedJunction[], lateralOffset: number) {
  return junctions.flatMap((junction) => {
    const info = junction.roads.find((candidate) => candidate.roadId === road.id);
    if (!info) return [];
    if (!junction.cornerReturns.length) return junctionIntervalsForRoad(road, [junction], lateralOffset);
    const fractions = junction.cornerReturns
      .flatMap((corner) => corner.tangents)
      .filter((tangent) => tangent.roadId === road.id && Math.abs(tangent.lateral - lateralOffset) < 3)
      .map((tangent) => fractionAlongPolyline(road.points, tangent.point))
      .sort((first, second) => first - second);
    if (!fractions.length) return [];
    if (fractions.length >= 2) return [{ start: fractions[0], end: fractions[fractions.length - 1], junctionId: junction.id }];
    const center = fractionAtSegment(road, info.segment, info.t);
    return [{ start: Math.min(fractions[0], center), end: Math.max(fractions[0], center), junctionId: junction.id }];
  }).sort((first, second) => first.start - second.start);
}

export function junctionEdgeMarkingIntervalsForRoad(
  road: Road,
  junctions: ResolvedJunction[],
  lateralOffset: number,
  inset = 7,
) {
  return junctions.flatMap((junction) => {
    const info = junction.roads.find((candidate) => candidate.roadId === road.id);
    if (!info) return [];
    if (!junction.cornerReturns.length) return junctionIntervalsForRoad(road, [junction], lateralOffset);
    const fractions = junction.cornerReturns
      .flatMap((corner) => cornerReturnMarkingPoints(corner, inset))
      .filter((tangent) => tangent.roadId === road.id && Math.abs(tangent.lateral - lateralOffset) < 3)
      .map((tangent) => fractionAlongPolyline(road.points, tangent.point))
      .sort((first, second) => first - second);
    if (!fractions.length) return [];
    if (fractions.length >= 2) {
      return [{ start: fractions[0], end: fractions[fractions.length - 1], junctionId: junction.id }];
    }
    const center = fractionAtSegment(road, info.segment, info.t);
    return [{ start: Math.min(fractions[0], center), end: Math.max(fractions[0], center), junctionId: junction.id }];
  }).sort((first, second) => first.start - second.start);
}

export function visibleSectionRanges(start: number, end: number, blocked: Array<{ start: number; end: number }>) {
  let ranges = [{ start, end }];
  for (const block of blocked) {
    ranges = ranges.flatMap((range) => {
      if (block.end <= range.start + 0.0001 || block.start >= range.end - 0.0001) return [range];
      const pieces: Array<{ start: number; end: number }> = [];
      if (block.start > range.start + 0.0001) pieces.push({ start: range.start, end: Math.min(range.end, block.start) });
      if (block.end < range.end - 0.0001) pieces.push({ start: Math.max(range.start, block.end), end: range.end });
      return pieces;
    });
  }
  return ranges.filter((range) => range.end - range.start > 0.001);
}

export function splitSectionRanges(ranges: Array<{ start: number; end: number }>, cuts: number[]) {
  return ranges.flatMap((range) => {
    const inside = cuts.filter((cut) => cut > range.start + 0.0001 && cut < range.end - 0.0001);
    const boundaries = [range.start, ...inside, range.end];
    return boundaries.slice(0, -1).map((start, index) => ({ start, end: boundaries[index + 1] }));
  });
}
