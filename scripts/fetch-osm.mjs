// Fetches the buildings and streets around Covent Garden tube station from OpenStreetMap and writes
// them, in local metres, to src/data/area.json. Run with `pnpm fetch:osm`.
//
// Coordinates are rotated so Long Acre runs along x, then clipped to a rectangle, so the scene can
// sit on a neat plinth. x points along Long Acre (roughly east-north-east), z across it (roughly
// south-south-east), y is up.
//
// Set OSM_CACHE=path to reuse a saved Overpass response instead of fetching a new one (it is
// written there after a fetch).
//
// Map data © OpenStreetMap contributors, ODbL.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// The junction of Long Acre with James Street and Neal Street, right outside the station.
const CENTER = { lat: 51.51305, lon: -0.12432 };
// Half-size of the area kept, in metres.
const HALF_X = 45;
const HALF_Z = 34;

const LEVEL_HEIGHT = 3.5;
// Nodes of the walking network closer than this are merged, joining paths mapped separately.
const MERGE_DISTANCE = 1.5;
const VEHICLE_ROADS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
]);
const WALKWAYS = new Set(['footway', 'pedestrian', 'living_street', 'path', ...VEHICLE_ROADS]);
const ROAD_WIDTH = { primary: 9, secondary: 8, tertiary: 7, unclassified: 6, residential: 6 };
/** Pedestrianised streets, like James Street and Neal Street, are drawn paved in setts. */
const PEDESTRIAN_STREET_WIDTH = 9;

const METRES_PER_DEG_LAT = 111_320;
const METRES_PER_DEG_LON = METRES_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180);
const round = (n) => Math.round(n * 100) / 100;

async function loadElements() {
  const cache = process.env.OSM_CACHE;
  if (cache && existsSync(cache)) return JSON.parse(await readFile(cache, 'utf8')).elements;

  const pad = (Math.hypot(HALF_X, HALF_Z) + 30) / METRES_PER_DEG_LAT;
  const bbox = [CENTER.lat - pad, CENTER.lon - pad * 1.6, CENTER.lat + pad, CENTER.lon + pad * 1.6];
  const query = `[out:json][timeout:60];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["highway"](${bbox});
  node["railway"="subway_entrance"](${bbox});
  node["shop"](${bbox});
);
out body geom;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'pedestrian-simulator (github.com/GeorgeSheppard/pedestrian-simulator)',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
  const text = await response.text();
  if (cache) await writeFile(cache, text);
  return JSON.parse(text).elements;
}

const elements = await loadElements();

// Metres east and south of the centre, before rotating.
const toMetres = ({ lat, lon }) => [
  (lon - CENTER.lon) * METRES_PER_DEG_LON,
  -(lat - CENTER.lat) * METRES_PER_DEG_LAT,
];

const longAcre = elements.find((e) => e.type === 'way' && e.tags?.name === 'Long Acre');
if (!longAcre) throw new Error('Long Acre is missing from the response');
const [ax, az] = toMetres(longAcre.geometry[0]);
const [bx, bz] = toMetres(longAcre.geometry.at(-1));
let angle = Math.atan2(bz - az, bx - ax);
// Keep x pointing roughly east, so north stays at the back of the scene.
if (Math.cos(angle) < 0) angle += Math.PI;
const cos = Math.cos(-angle);
const sin = Math.sin(-angle);

const project = (point) => {
  const [x, z] = toMetres(point);
  return [x * cos - z * sin, x * sin + z * cos];
};

const inBounds = ([x, z]) => Math.abs(x) <= HALF_X + 1e-6 && Math.abs(z) <= HALF_Z + 1e-6;

// Sutherland–Hodgman against the area's rectangle, so buildings are cut off at the plinth's edge.
function clipPolygon(points) {
  const sides = [
    [0, -HALF_X, 1],
    [0, HALF_X, -1],
    [1, -HALF_Z, 1],
    [1, HALF_Z, -1],
  ];
  let out = points;
  for (const [axis, value, sign] of sides) {
    const inside = (p) => (p[axis] - value) * sign >= 0;
    const input = out;
    out = [];
    input.forEach((current, i) => {
      const previous = input[(i + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) out.push(intersect(previous, current, axis, value));
        out.push(current);
      } else if (inside(previous)) {
        out.push(intersect(previous, current, axis, value));
      }
    });
    if (out.length === 0) break;
  }
  return out;
}

function intersect(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Liang–Barsky: the part of a segment inside the rectangle, or null.
function clipSegment(a, b) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const checks = [
    [-dx, a[0] + HALF_X],
    [dx, HALF_X - a[0]],
    [-dz, a[1] + HALF_Z],
    [dz, HALF_Z - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1) return null;
  return [t0, t1].map((t) => [a[0] + dx * t, a[1] + dz * t]);
}

function insidePolygon([x, z], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function buildingHeight(tags) {
  const height = parseFloat(tags.height);
  if (!Number.isNaN(height)) return height;
  const levels = parseFloat(tags['building:levels']);
  return Number.isNaN(levels) ? 4 * LEVEL_HEIGHT + 1.5 : levels * LEVEL_HEIGHT + 1.5;
}

// Paths that are indoors or underground, like the station's passages, aren't walkable here.
function isOutdoors(tags) {
  if (tags.indoor && tags.indoor !== 'no') return false;
  if (tags.tunnel && tags.tunnel !== 'no') return false;
  if (parseFloat(tags.layer) < 0) return false;
  if (tags.level && !/^0(;|$)/.test(tags.level)) return false;
  return true;
}

const buildings = [];
for (const element of elements) {
  const tags = element.tags ?? {};
  if (!tags.building || tags.building === 'roof' || tags.location === 'underground') continue;
  const outers =
    element.type === 'way'
      ? [element.geometry]
      : (element.members ?? [])
          .filter((m) => m.role === 'outer' && m.geometry)
          .map((m) => m.geometry);
  for (const outer of outers) {
    const ring = outer.map(project);
    if (ring.length > 1 && ring[0].join() === ring.at(-1).join()) ring.pop();
    const footprint = clipPolygon(ring);
    if (footprint.length < 3) continue;
    buildings.push({
      id: `${element.type}/${element.id}`,
      name: tags.name,
      kind: tags.building,
      height: round(buildingHeight(tags)),
      footprint: footprint.map(([x, z]) => [round(x), round(z)]),
    });
  }
}

const insideABuilding = (point) => buildings.some((b) => insidePolygon(point, b.footprint));

// The walking network, as an undirected graph of points joined by straight edges.
const nodes = [];
const edges = new Map();
const nodeIndex = new Map();

function addNode(point, key) {
  if (key && nodeIndex.has(key)) return nodeIndex.get(key);
  let index = nodes.findIndex((n) => Math.hypot(n[0] - point[0], n[1] - point[1]) < MERGE_DISTANCE);
  if (index === -1) {
    index = nodes.length;
    nodes.push(point);
  }
  if (key) nodeIndex.set(key, index);
  return index;
}

function addEdge(a, b) {
  if (a === b) return;
  edges.set(a < b ? `${a},${b}` : `${b},${a}`, [Math.min(a, b), Math.max(a, b)]);
}

const roads = [];
const crossingSegments = [];
const crossingNodes = new Set();

for (const element of elements) {
  const tags = element.tags ?? {};
  if (element.type !== 'way' || !tags.highway || !isOutdoors(tags)) continue;
  const points = element.geometry.map(project);
  const isCrossing = tags.footway === 'crossing' || tags.highway === 'crossing';

  const roadKind =
    VEHICLE_ROADS.has(tags.highway) && ROAD_WIDTH[tags.highway]
      ? 'carriageway'
      : tags.highway === 'pedestrian' && tags.area !== 'yes'
        ? 'pedestrian'
        : null;
  if (roadKind) {
    const width =
      parseFloat(tags.width) ||
      (roadKind === 'carriageway' ? ROAD_WIDTH[tags.highway] : PEDESTRIAN_STREET_WIDTH);
    for (let i = 1; i < points.length; i++) {
      const clipped = clipSegment(points[i - 1], points[i]);
      if (clipped) {
        roads.push({ kind: roadKind, name: tags.name, width, from: clipped[0], to: clipped[1] });
      }
    }
  }

  if (isCrossing) {
    for (let i = 1; i < points.length; i++) {
      const clipped = clipSegment(points[i - 1], points[i]);
      if (clipped) crossingSegments.push(clipped);
    }
  }

  // People keep to the pavements of busy roads when the pavements are mapped separately.
  if (!WALKWAYS.has(tags.highway)) continue;
  if (VEHICLE_ROADS.has(tags.highway) && tags.sidewalk === 'separate') continue;
  if (VEHICLE_ROADS.has(tags.highway) && ROAD_WIDTH[tags.highway] && !tags.sidewalk) continue;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const clipped = clipSegment(a, b);
    if (!clipped) continue;
    const middle = [(clipped[0][0] + clipped[1][0]) / 2, (clipped[0][1] + clipped[1][1]) / 2];
    if (tags.highway !== 'pedestrian' && insideABuilding(middle)) continue;
    const keyA = clipped[0][0] === a[0] && clipped[0][1] === a[1] ? element.nodes[i - 1] : null;
    const keyB = clipped[1][0] === b[0] && clipped[1][1] === b[1] ? element.nodes[i] : null;
    const from = addNode(clipped[0], keyA);
    const to = addNode(clipped[1], keyB);
    addEdge(from, to);
    if (isCrossing) {
      crossingNodes.add(from);
      crossingNodes.add(to);
    }
  }
}

// Where a segment from p along direction d first meets the segment a–b, as a distance along d.
function rayHit(p, d, a, b) {
  const e = [b[0] - a[0], b[1] - a[1]];
  const denominator = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(denominator) < 1e-9) return null;
  const w = [a[0] - p[0], a[1] - p[1]];
  const t = (w[0] * e[1] - w[1] * e[0]) / denominator;
  const u = (w[0] * d[1] - w[1] * d[0]) / denominator;
  return t > 0.1 && u >= 0 && u <= 1 ? t : null;
}

const neighboursOf = () => {
  const neighbours = nodes.map(() => []);
  for (const [a, b] of edges.values()) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  return neighbours;
};

// Crossings are sometimes mapped only part of the way over the road. Carry a crossing that stops
// short straight on to the nearest path ahead, the pavement on the far side.
const MAX_CROSSING_EXTENSION = 12;
{
  const neighbours = neighboursOf();
  for (const node of crossingNodes) {
    if (neighbours[node].length !== 1) continue;
    const p = nodes[node];
    const q = nodes[neighbours[node][0]];
    const length = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const d = [(p[0] - q[0]) / length, (p[1] - q[1]) / length];
    let best = null;
    for (const [key, [a, b]] of edges) {
      if (a === node || b === node) continue;
      const t = rayHit(p, d, nodes[a], nodes[b]);
      if (t !== null && t <= MAX_CROSSING_EXTENSION && (!best || t < best.t))
        best = { t, key, a, b };
    }
    if (!best) continue;
    const hit = addNode([p[0] + d[0] * best.t, p[1] + d[1] * best.t]);
    edges.delete(best.key);
    addEdge(best.a, hit);
    addEdge(hit, best.b);
    addEdge(node, hit);
    crossingSegments.push([p, nodes[hit]]);
  }
}

// Zebra crossings are drawn where a crossing meets a road, across the whole carriageway.
const crossings = [];
for (const road of roads.filter((r) => r.kind === 'carriageway')) {
  const length = Math.hypot(road.to[0] - road.from[0], road.to[1] - road.from[1]);
  const direction = [(road.to[0] - road.from[0]) / length, (road.to[1] - road.from[1]) / length];
  for (const [a, b] of crossingSegments) {
    const ab = [b[0] - a[0], b[1] - a[1]];
    const span = Math.hypot(...ab);
    const t = rayHit(a, [ab[0] / span, ab[1] / span], road.from, road.to);
    const fromStart = rayHit(road.from, direction, a, b);
    // Count crossings that touch the road at either end of the crossing segment too.
    const along = t !== null && t <= span + 0.01 ? t : null;
    const position =
      along !== null
        ? [a[0] + (ab[0] / span) * along, a[1] + (ab[1] / span) * along]
        : fromStart !== null && fromStart <= length
          ? [road.from[0] + direction[0] * fromStart, road.from[1] + direction[1] * fromStart]
          : null;
    if (!position) continue;
    if (
      crossings.some(
        (c) => Math.hypot(c.position[0] - position[0], c.position[1] - position[1]) < 2
      )
    )
      continue;
    crossings.push({ position, direction, width: road.width });
  }
}

// Keep the biggest connected part of the network, so everyone can reach everywhere.
const neighbours = neighboursOf();
const component = new Array(nodes.length).fill(-1);
const sizes = [];
for (let start = 0; start < nodes.length; start++) {
  if (component[start] !== -1) continue;
  const id = sizes.length;
  sizes.push(0);
  const stack = [start];
  component[start] = id;
  while (stack.length) {
    const n = stack.pop();
    sizes[id]++;
    for (const m of neighbours[n]) {
      if (component[m] === -1) {
        component[m] = id;
        stack.push(m);
      }
    }
  }
}
const main = sizes.indexOf(Math.max(...sizes));
const remap = new Map();
const walkNodes = [];
nodes.forEach((point, i) => {
  if (component[i] !== main) return;
  remap.set(i, walkNodes.length);
  walkNodes.push(point.map(round));
});
const walkEdges = [...edges.values()]
  .filter(([a]) => component[a] === main)
  .map(([a, b]) => [remap.get(a), remap.get(b)]);

const onEdgeOfArea = ([x, z]) =>
  Math.abs(Math.abs(x) - HALF_X) < 0.01 || Math.abs(Math.abs(z) - HALF_Z) < 0.01;
const spawns = walkNodes.flatMap((p, i) => (onEdgeOfArea(p) ? [i] : []));

const nearestWalkNode = (point) => {
  let best = -1;
  let bestDistance = Infinity;
  walkNodes.forEach((n, i) => {
    const d = Math.hypot(n[0] - point[0], n[1] - point[1]);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return { node: best, distance: bestDistance };
};

const places = [];
for (const element of elements) {
  if (element.type !== 'node') continue;
  const tags = element.tags ?? {};
  const position = project(element);
  if (!inBounds(position)) continue;
  const { node, distance } = nearestWalkNode(position);
  if (distance > 15) continue;
  places.push({
    kind: tags.railway === 'subway_entrance' ? 'station' : 'shop',
    name: tags.name ?? '',
    position: position.map(round),
    node,
  });
}

const area = {
  attribution: '© OpenStreetMap contributors, ODbL',
  center: CENTER,
  rotation: round((angle * 180) / Math.PI),
  size: [HALF_X * 2, HALF_Z * 2],
  buildings,
  roads: roads.map(({ kind, name, width, from, to }) => ({
    kind,
    name,
    width,
    from: from.map(round),
    to: to.map(round),
  })),
  crossings: crossings.map(({ position, direction, width }) => ({
    position: position.map(round),
    direction: direction.map((n) => Math.round(n * 1000) / 1000),
    width,
  })),
  walk: { nodes: walkNodes, edges: walkEdges, spawns },
  places,
};

await writeFile(new URL('../src/data/area.json', import.meta.url), JSON.stringify(area) + '\n');
console.log(
  `Wrote ${buildings.length} buildings, ${roads.length} road segments, ${crossings.length} crossings, ` +
    `a walking network of ${walkNodes.length} nodes (${sizes.length} parts before trimming) ` +
    `with ${spawns.length} ways in, and ${places.length} places`
);
