// map.js — the Ember Yard: an original foundry yard built from boxes.
// One data table (SOLIDS) drives three things at once — the meshes the
// player sees, the 2D collision the movers resolve against, and the sight
// lines the bots reason about — so what you see is exactly what blocks you.
//
// Layout (x east, z south, metres): Ember squad spawns west, Ash squad
// holds the east. Two charge sites: A, the Furnace (north-east), and B,
// the Depot (south-east). A steel stack splits the middle; container rows
// make a north lane, a south lane and a mid crossing worth fighting over.

export const WORLD = { minX: -34, maxX: 34, minZ: -23, maxZ: 23 };

// Each solid: centre x/z, width (x), depth (z), height, material key.
export const SOLIDS = [
  // Perimeter walls.
  { x: 0, z: -23.5, w: 70, d: 1, h: 4.5, mat: 'wall' },
  { x: 0, z: 23.5, w: 70, d: 1, h: 4.5, mat: 'wall' },
  { x: -34.5, z: 0, w: 1, d: 48, h: 4.5, mat: 'wall' },
  { x: 34.5, z: 0, w: 1, d: 48, h: 4.5, mat: 'wall' },
  // The Stack: central silo block, the yard's landmark.
  { x: 0, z: 0, w: 8, d: 8, h: 7, mat: 'steel' },
  // Furnace building, site A anchor (north-east).
  { x: 25, z: -19.5, w: 10, d: 6, h: 4, mat: 'furnace' },
  { x: 19.5, z: -8.7, w: 3, d: 3, h: 2.2, mat: 'rustDark' },
  // Depot container stack, site B anchor (south-east).
  { x: 25, z: 18, w: 10, d: 2.6, h: 2.6, mat: 'rust' },
  { x: 25, z: 18, w: 6, d: 2.6, h: 5.2, mat: 'rustDark', stackOnly: true },
  { x: 19.5, z: 8.7, w: 3, d: 3, h: 2.2, mat: 'steelDark' },
  // Container rows that carve the north and south lanes.
  { x: -13, z: -12, w: 11, d: 2.6, h: 2.6, mat: 'rust' },
  { x: 7, z: -12, w: 11, d: 2.6, h: 2.6, mat: 'steelDark' },
  { x: -13, z: 12, w: 11, d: 2.6, h: 2.6, mat: 'steelDark' },
  { x: 7, z: 12, w: 11, d: 2.6, h: 2.6, mat: 'rust' },
  // Mid shutters: half-walls that break the crossing's sight lines.
  { x: -11, z: -4.5, w: 2.6, d: 5, h: 3, mat: 'steel' },
  { x: -11, z: 4.5, w: 2.6, d: 5, h: 3, mat: 'steel' },
  // Gantry legs east of mid.
  { x: 20, z: -5, w: 2, d: 2, h: 5, mat: 'steel' },
  { x: 20, z: 5, w: 2, d: 2, h: 5, mat: 'steel' },
  // Low cover: crates a crouched player can shoot over (h 1.1).
  { x: -22, z: -6, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: -22, z: 7, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: -4, z: -19.5, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: -4, z: 19.5, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: 12, z: -18.5, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: 12, z: 18.5, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: 23, z: -9, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: 23, z: 9, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: 3, z: 19.8, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  { x: 3, z: -19.8, w: 2.4, d: 2.4, h: 1.1, mat: 'crate' },
  // Spawn-yard clutter.
  { x: -29, z: -13, w: 6, d: 2.6, h: 2.6, mat: 'rustDark' },
  { x: -29, z: 13, w: 6, d: 2.6, h: 2.6, mat: 'rust' },
  { x: 30, z: 0, w: 2.6, d: 8, h: 2.6, mat: 'steelDark' },
];

// The two charge sites: a floor rectangle, a plant point and a name.
export const SITES = {
  A: { id: 'A', name: 'Furnace', minX: 18, maxX: 31, minZ: -21, maxZ: -8, plant: { x: 24, z: -14 }, mat: 'siteA' },
  B: { id: 'B', name: 'Depot', minX: 18, maxX: 31, minZ: 8, maxZ: 21, plant: { x: 24, z: 14 }, mat: 'siteB' },
};

export const SPAWNS = {
  ember: [
    { x: -30, z: -3, yaw: Math.PI / 2 },
    { x: -30, z: 1, yaw: Math.PI / 2 },
    { x: -31, z: -7, yaw: Math.PI / 2 },
    { x: -31, z: 6, yaw: Math.PI / 2 },
  ],
  ash: [
    { x: 31, z: -19, yaw: -Math.PI / 2 },
    { x: 29, z: -10, yaw: -Math.PI / 2 },
    { x: 31, z: 19, yaw: -Math.PI / 2 },
    { x: 29, z: 10, yaw: -Math.PI / 2 },
  ],
};

// Waypoint graph: bots route along these edges; hold points are nodes a
// defender can be assigned to watch from. Coordinates keep 1.2 m off walls.
// Waypoint graph. Every node stands in open floor and every edge runs
// in a straight line that clears all solids by at least the bot radius
// — both facts are machine-checked against BOXES whenever the map
// changes, because a single edge through a shutter or a container
// strands a bot against a wall for the whole round.
export const NODES = {
  eSpawn: { x: -28, z: 0 }, eNorthLow: { x: -20.5, z: -15.5 }, eSouthLow: { x: -20.5, z: 15.5 },
  nLaneW: { x: -13, z: -16 }, nLaneM: { x: -2, z: -16 }, nLaneE: { x: 9, z: -16 },
  sLaneW: { x: -13, z: 16 }, sLaneM: { x: -2, z: 16 }, sLaneE: { x: 9, z: 16 },
  midW: { x: -16, z: 0 }, shutN: { x: -13.2, z: -9.4 }, shutS: { x: -13.2, z: 9.4 },
  midNW: { x: -6, z: -6 }, midSW: { x: -6, z: 6 },
  midNE: { x: 7, z: -6 }, midSE: { x: 7, z: 6 }, midE: { x: 16, z: 0 },
  aDoor: { x: 17, z: -12.6 }, aSite: { x: 23, z: -13 }, aHold: { x: 28, z: -12 },
  aBack: { x: 14, z: -21 }, aEast: { x: 29, z: -6 },
  bDoor: { x: 17, z: 12.6 }, bSite: { x: 23, z: 13 }, bHold: { x: 28, z: 12 },
  bBack: { x: 14, z: 21 }, bEast: { x: 29, z: 6 },
  dSpawn: { x: 28, z: 0 }, dMid: { x: 24, z: 0 }, dNorth: { x: 22, z: -6 }, dSouth: { x: 22, z: 6 },
};

export const EDGES = [
  ['eSpawn', 'eNorthLow'], ['eSpawn', 'eSouthLow'], ['eSpawn', 'midW'],
  ['eNorthLow', 'nLaneW'], ['eNorthLow', 'nLaneM'],
  ['eSouthLow', 'sLaneW'], ['eSouthLow', 'sLaneM'],
  ['nLaneW', 'nLaneM'], ['nLaneM', 'nLaneE'], ['nLaneE', 'aDoor'],
  ['sLaneW', 'sLaneM'], ['sLaneM', 'sLaneE'], ['sLaneE', 'bDoor'],
  ['midW', 'shutN'], ['midW', 'shutS'], ['shutN', 'midNW'], ['shutS', 'midSW'],
  ['midNW', 'midNE'], ['midSW', 'midSE'], ['midNW', 'nLaneM'], ['midSW', 'sLaneM'],
  ['midNE', 'midE'], ['midSE', 'midE'], ['midNE', 'aDoor'], ['midSE', 'bDoor'],
  ['midE', 'dMid'], ['dMid', 'dNorth'], ['dMid', 'dSouth'], ['dMid', 'dSpawn'],
  ['aDoor', 'aSite'], ['aSite', 'aHold'], ['aSite', 'aBack'], ['aHold', 'aEast'],
  ['aEast', 'dNorth'],
  ['bDoor', 'bSite'], ['bSite', 'bHold'], ['bSite', 'bBack'], ['bHold', 'bEast'],
  ['bEast', 'dSouth'],
  ['dNorth', 'dSpawn'], ['dSouth', 'dSpawn'],
];

// adjacency: node id -> [node ids], built once from EDGES.
export const ADJ = (() => {
  const adj = {};
  for (const id of Object.keys(NODES)) adj[id] = [];
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }
  return adj;
})();

// nearestNode finds the graph node closest to a loose position.
export function nearestNode(x, z) {
  let best = null, bestD = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// findPath: breadth-first route between two nodes, as a list of node ids.
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of ADJ[cur]) {
      if (!(next in prev)) {
        prev[next] = cur;
        if (next === toId) {
          const path = [toId];
          let p = cur;
          while (p !== null) { path.unshift(p); p = prev[p]; }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [fromId];
}

// Precomputed AABB form of every solid for collision and sight checks.
export const BOXES = SOLIDS.map((s) => ({
  minX: s.x - s.w / 2, maxX: s.x + s.w / 2,
  minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2,
  h: s.h, mat: s.mat, stackOnly: !!s.stackOnly,
}));

// collideCircle pushes a circle (x, z, r) out of every solid and the world
// bounds, one axis at a time so movers slide along walls. Returns via pos.
export function collideCircle(pos, r) {
  for (const b of BOXES) {
    if (b.stackOnly) continue; // the depot's upper container sits on the lower one
    const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - b.minX, right = b.maxX - pos.x;
        const top = pos.z - b.minZ, bottom = b.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.minX - r;
        else if (m === right) pos.x = b.maxX + r;
        else if (m === top) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      }
    }
  }
  pos.x = Math.max(WORLD.minX + r, Math.min(WORLD.maxX - r, pos.x));
  pos.z = Math.max(WORLD.minZ + r, Math.min(WORLD.maxZ - r, pos.z));
}

// sightBlocked: is the straight line from (x1,z1) to (x2,z2) cut by any
// solid at least `minH` tall? 2D segment/AABB test — bots and gunfire
// share it, so cover means the same thing to both.
export function sightBlocked(x1, z1, x2, z2, minH = 1.35) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const b of BOXES) {
    if (b.stackOnly || b.h < minH) continue;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (x1 < b.minX || x1 > b.maxX) continue; }
    else {
      let ta = (b.minX - x1) / dx, tb = (b.maxX - x1) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (z1 < b.minZ || z1 > b.maxZ) continue; }
    else {
      let ta = (b.minZ - z1) / dz, tb = (b.maxZ - z1) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t1 > 0.001 && t0 < 0.999) return true;
  }
  return false;
}

// siteAt returns the site whose floor rectangle holds the point, or null.
export function siteAt(x, z) {
  for (const s of Object.values(SITES)) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s;
  }
  return null;
}

// buildMap constructs the yard's meshes into `scene` and returns the list
// of solid meshes (used by the gunfire raycast as occluders).
export function buildMap(THREE, scene, mats) {
  const occluders = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(72, 50), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Painted site floors and lane guide lines: thin boxes lying on the ground.
  const paint = (x, z, w, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat);
    m.position.set(x, 0.02, z);
    scene.add(m);
  };
  for (const s of Object.values(SITES)) {
    paint((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2, s.maxX - s.minX, s.maxZ - s.minZ, mats[s.mat]);
  }
  paint(0, -12, 62, 0.35, mats.groundLine);
  paint(0, 12, 62, 0.35, mats.groundLine);
  paint(0, 0, 62, 0.35, mats.groundLine);

  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const baseY = s.stackOnly ? 2.6 : 0; // depot's second container rides on the first
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mats[s.mat]);
    mesh.position.set(s.x, baseY + s.h / 2, s.z);
    mesh.userData.solid = true;
    scene.add(mesh);
    occluders.push(mesh);
  }

  // Furnace mouths: two glowing slits on the furnace block's west face.
  for (const dz of [-1.6, 1.6]) {
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 1.8), mats.emberGlow);
    mouth.position.set(19.9, 1.1, -19.5 + dz);
    scene.add(mouth);
  }
  // The Stack's chimney and a warning band.
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 3.4, 10), mats.steelDark);
  chimney.position.set(0, 8.7, 0);
  scene.add(chimney);
  const band = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.5, 8.3), mats.emberGlow);
  band.position.set(0, 6.6, 0);
  scene.add(band);

  // Yard lights: lamp posts at the four lane mouths (emissive head + pole).
  for (const [x, z] of [[-19, -12], [-19, 12], [13, -12], [13, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), mats.steelDark);
    pole.position.set(x, 2.2, z);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), mats.emberGlow);
    head.position.set(x, 4.45, z);
    scene.add(head);
  }
  return occluders;
}
