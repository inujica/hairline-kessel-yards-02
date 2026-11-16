// Kessel Yards: an original rail depot, built from solid blocks so every lane has two walls and
// every sightline has a corner behind it. The map owns three things the rest of the game asks for:
// the colliders the bodies slide against, the nav graph the bots walk, and the two plant sites.
//
// The plan, seen from above (attackers enter from the south, defenders hold the north strip):
//
//   z=-58  +--------------------------------------------------+
//          |   SITE A: TANK YARD      |      SITE B: FREIGHT  |
//          |   tanks, drums, crates   |      containers, dock |
//   z=-26  +----+---------------------+------------------+---+
//          |      defender strip (rotation between sites)     |
//   z=-15  +--+----+--------------+--------------+----+-------+
//          |  LONG     [mid building][mid building]   SHORT   |
//          |  lane         mid corridor (train car)   lane    |
//   z=+30  +--------------------------------------------------+
//          |              attacker spawn                      |
//   z=+58  +--------------------------------------------------+
//
// Nothing here copies a commercial map: the yard is drawn from a real depot's logic — long
// straight runs for trains, a tank farm on the west, a freight house on the east — and the
// names, the palette and the geometry are this game's own.
import * as THREE from 'three';
import { MATERIALS, PALETTE } from './palette.js';

const HEIGHT = 4.6;
const WALL_HEIGHT = 6;

// ---------------------------------------------------------------- procedural surfaces
// Every surface is painted at load from a seeded canvas, so the map has its own art without a
// single image file and every run looks the same.
function seededNoise(seed) {
  let value = seed;
  return function next() {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function canvasTexture(size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  paint(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function grain(context, size, seed, strength) {
  const random = seededNoise(seed);
  const image = context.getImageData(0, 0, size, size);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const shift = (random() - 0.5) * strength;
    data[index] = Math.max(0, Math.min(255, data[index] + shift));
    data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + shift));
    data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + shift));
  }
  context.putImageData(image, 0, 0);
}

function concreteSurface(base, seed) {
  return canvasTexture(256, (context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    const random = seededNoise(seed);
    for (let index = 0; index < 220; index += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = 1 + random() * 5;
      context.fillStyle = `rgba(0,0,0,${0.03 + random() * 0.07})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    // Formwork seams: the horizontal joints of a poured wall.
    context.strokeStyle = 'rgba(0,0,0,0.16)';
    context.lineWidth = 2;
    for (let y = size / 4; y < size; y += size / 4) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
    }
    grain(context, size, seed + 7, 22);
  });
}

function plankSurface(base, seed) {
  return canvasTexture(256, (context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    const random = seededNoise(seed);
    const planks = 8;
    for (let index = 0; index < planks; index += 1) {
      const y = (size / planks) * index;
      context.fillStyle = `rgba(0,0,0,${0.05 + random() * 0.1})`;
      context.fillRect(0, y, size, size / planks - 1);
      context.strokeStyle = 'rgba(0,0,0,0.3)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      // Grain lines inside the plank.
      for (let line = 0; line < 3; line += 1) {
        context.strokeStyle = `rgba(0,0,0,${0.05 + random() * 0.06})`;
        context.beginPath();
        const ly = y + (size / planks) * (0.2 + random() * 0.6);
        context.moveTo(0, ly);
        context.bezierCurveTo(size * 0.3, ly + random() * 3, size * 0.6, ly - random() * 3, size, ly);
        context.stroke();
      }
    }
    grain(context, size, seed + 11, 18);
  });
}

function hazardSurface(seed) {
  return canvasTexture(128, (context, size) => {
    context.fillStyle = MATERIALS.metal;
    context.fillRect(0, 0, size, size);
    context.strokeStyle = MATERIALS.accent;
    context.lineWidth = size / 7;
    for (let offset = -size; offset < size * 2; offset += size / 3.5) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + size, size);
      context.stroke();
    }
    grain(context, size, seed + 3, 14);
  });
}

function gratingSurface(seed) {
  return canvasTexture(128, (context, size) => {
    context.fillStyle = MATERIALS.floorAlt;
    context.fillRect(0, 0, size, size);
    context.strokeStyle = 'rgba(0,0,0,0.45)';
    context.lineWidth = 3;
    for (let index = 0; index <= size; index += 16) {
      context.beginPath();
      context.moveTo(index, 0);
      context.lineTo(index, size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, index);
      context.lineTo(size, index);
      context.stroke();
    }
    grain(context, size, seed + 5, 16);
  });
}

function makeMaterials() {
  const floor = new THREE.MeshStandardMaterial({
    map: concreteSurface(MATERIALS.floor, 11), roughness: 0.94, metalness: 0.02,
  });
  floor.map.repeat.set(26, 32);
  const wall = new THREE.MeshStandardMaterial({
    map: concreteSurface(MATERIALS.wall, 23), roughness: 0.88, metalness: 0.03,
  });
  wall.map.repeat.set(4, 1);
  const wallAlt = new THREE.MeshStandardMaterial({
    map: concreteSurface(MATERIALS.wallAlt, 37), roughness: 0.9, metalness: 0.03,
  });
  wallAlt.map.repeat.set(4, 1);
  const timber = new THREE.MeshStandardMaterial({
    map: plankSurface(MATERIALS.timber, 41), roughness: 0.82, metalness: 0.02,
  });
  const crate = new THREE.MeshStandardMaterial({
    map: plankSurface(MATERIALS.crate, 53), roughness: 0.78, metalness: 0.04,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(MATERIALS.metal), roughness: 0.52, metalness: 0.55,
  });
  const tank = new THREE.MeshStandardMaterial({
    color: new THREE.Color(MATERIALS.tank), roughness: 0.44, metalness: 0.6,
  });
  const hazard = new THREE.MeshStandardMaterial({
    map: hazardSurface(61), roughness: 0.6, metalness: 0.3,
  });
  const grating = new THREE.MeshStandardMaterial({
    map: gratingSurface(67), roughness: 0.7, metalness: 0.4,
  });
  const siteA = new THREE.MeshStandardMaterial({
    color: new THREE.Color(MATERIALS.siteA), roughness: 0.85, metalness: 0.05,
    transparent: true, opacity: 0.36, emissive: new THREE.Color(MATERIALS.siteA),
    emissiveIntensity: 0.12,
  });
  const siteB = new THREE.MeshStandardMaterial({
    color: new THREE.Color(MATERIALS.siteB), roughness: 0.85, metalness: 0.05,
    transparent: true, opacity: 0.36, emissive: new THREE.Color(MATERIALS.siteB),
    emissiveIntensity: 0.12,
  });
  return { floor, wall, wallAlt, timber, crate, metal, tank, hazard, grating, siteA, siteB };
}

// ---------------------------------------------------------------- geometry helpers
// A solid is one box that is both drawn and collided with. Keeping them the same call is what
// stops the map and the collision world from drifting apart.
function solid(scene, colliders, materials, spec) {
  const geometry = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
  const material = materials[spec.material ?? 'wall'];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(spec.x, (spec.y ?? 0) + spec.h / 2, spec.z);
  if (spec.ry) mesh.rotation.y = spec.ry;
  mesh.castShadow = spec.cast !== false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (spec.collide !== false) {
    const half = { w: spec.w / 2, d: spec.d / 2 };
    if (spec.ry) {
      // Rotated cover is padded to its bounding square, which is honest for the crates and
      // containers here and keeps collision a pure box test.
      const span = Math.max(spec.w, spec.d) / 2;
      colliders.push({
        minX: spec.x - span, maxX: spec.x + span,
        minY: spec.y ?? 0, maxY: (spec.y ?? 0) + spec.h,
        minZ: spec.z - span, maxZ: spec.z + span,
      });
    } else {
      colliders.push({
        minX: spec.x - half.w, maxX: spec.x + half.w,
        minY: spec.y ?? 0, maxY: (spec.y ?? 0) + spec.h,
        minZ: spec.z - half.d, maxZ: spec.z + half.d,
      });
    }
  }
  return mesh;
}

function drum(scene, colliders, materials, x, z, radius, height) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), materials.tank);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push({
    minX: x - radius, maxX: x + radius, minY: 0, maxY: height, minZ: z - radius, maxZ: z + radius,
  });
  return mesh;
}

function lamp(scene, x, y, z, intensity, distance) {
  const light = new THREE.PointLight(new THREE.Color(MATERIALS.lamp), intensity, distance, 1.8);
  light.position.set(x, y, z);
  scene.add(light);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(MATERIALS.lamp) }),
  );
  bulb.position.set(x, y, z);
  scene.add(bulb);
  return light;
}

// ---------------------------------------------------------------- the map
export function createMap(scene) {
  const colliders = [];
  const materials = makeMaterials();

  // Ground plate: one slab the whole yard stands on, then two grates where the rails run.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(94, 118), materials.floor);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const rails = new THREE.Mesh(new THREE.PlaneGeometry(7, 96), materials.grating);
  rails.rotation.x = -Math.PI / 2;
  rails.position.set(-27, 0.012, 4);
  rails.receiveShadow = true;
  scene.add(rails);
  const railsEast = rails.clone();
  railsEast.position.x = 27;
  scene.add(railsEast);

  const box = (spec) => solid(scene, colliders, materials, spec);

  // Perimeter.
  box({ x: 0, z: -58, w: 94, d: 1.5, h: WALL_HEIGHT, material: 'wallAlt' });
  box({ x: 0, z: 58, w: 94, d: 1.5, h: WALL_HEIGHT, material: 'wallAlt' });
  box({ x: -46, z: 0, w: 1.5, d: 118, h: WALL_HEIGHT, material: 'wallAlt' });
  box({ x: 46, z: 0, w: 1.5, d: 118, h: WALL_HEIGHT, material: 'wallAlt' });

  // The mid building, split down the middle: its two halves make the mid corridor and give Long
  // and Short their inner wall.
  box({ x: -10, z: 0, w: 12, d: 30, h: HEIGHT });
  box({ x: 10, z: 0, w: 12, d: 30, h: HEIGHT });
  // A timber roof beam over each half reads as a building rather than a wall from the lanes.
  box({ x: -10, z: 0, w: 12.4, d: 30.4, h: 0.5, y: HEIGHT, material: 'timber', collide: false });
  box({ x: 10, z: 0, w: 12.4, d: 30.4, h: 0.5, y: HEIGHT, material: 'timber', collide: false });

  // Long lane's outer building and Short lane's, so each lane is a corridor with two walls.
  box({ x: -31, z: 6, w: 14, d: 34, h: 3.4, material: 'timber' });
  box({ x: 31, z: 6, w: 14, d: 34, h: 3.4, material: 'timber' });
  box({ x: -31, z: 6, w: 14.6, d: 34.6, h: 0.4, y: 3.4, material: 'metal', collide: false });
  box({ x: 31, z: 6, w: 14.6, d: 34.6, h: 0.4, y: 3.4, material: 'metal', collide: false });

  // Site A: the tank yard. Walls north and east, with one door into the defender strip.
  box({ x: -32, z: -50, w: 24, d: 1.5, h: HEIGHT });
  box({ x: -21, z: -44, w: 1.5, d: 13, h: HEIGHT });
  box({ x: -21, z: -30, w: 1.5, d: 9, h: HEIGHT });
  // Low wall on the south edge: cover to plant behind, not a lid on the site.
  box({ x: -36, z: -26, w: 8, d: 1.2, h: 1.5, material: 'hazard' });

  // Site B: the freight house, mirrored, with its door into the same strip.
  box({ x: 32, z: -50, w: 24, d: 1.5, h: HEIGHT });
  box({ x: 21, z: -44, w: 1.5, d: 13, h: HEIGHT });
  box({ x: 21, z: -30, w: 1.5, d: 9, h: HEIGHT });
  box({ x: 36, z: -26, w: 8, d: 1.2, h: 1.5, material: 'hazard' });

  // Defender strip cover: two barriers that split the rotation into a north and a south path.
  box({ x: -8, z: -20, w: 6, d: 1.2, h: 1.4, material: 'hazard' });
  box({ x: 8, z: -20, w: 6, d: 1.2, h: 1.4, material: 'hazard' });

  // Tank farm: the drums that give the site its name and its cover.
  drum(scene, colliders, materials, -40, -47, 2.2, 3.3);
  drum(scene, colliders, materials, -30, -48, 2.0, 3.3);
  drum(scene, colliders, materials, -41, -33, 2.1, 3.3);
  box({ x: -34, z: -38, w: 2.6, d: 2.6, h: 1.7, material: 'crate' });
  box({ x: -34, z: -38, w: 2.0, d: 2.0, h: 1.2, y: 1.7, material: 'crate' });
  box({ x: -27, z: -44, w: 3, d: 3, h: 2.2, material: 'crate' });

  // Freight house: containers stacked at angles, a loading dock, and a crane leg.
  box({ x: 36, z: -46, w: 6, d: 2.4, h: 2.6, material: 'metal' });
  box({ x: 36, z: -46, w: 6, d: 2.4, h: 2.6, y: 2.6, material: 'metal' });
  box({ x: 27, z: -44, w: 3, d: 3, h: 2.2, material: 'crate' });
  box({ x: 41, z: -33, w: 4, d: 2.4, h: 1.4, material: 'metal' });
  box({ x: 34, z: -38, w: 2.6, d: 2.6, h: 1.7, material: 'crate' });
  box({ x: 34, z: -38, w: 2.0, d: 2.0, h: 1.2, y: 1.7, material: 'crate' });
  box({ x: 24, z: -48, w: 1, d: 1, h: 6, material: 'metal' });

  // Mid: the train car that splits the corridor, and the platform beside it.
  box({ x: 0, z: -4, w: 3.2, d: 13, h: 3, material: 'metal' });
  box({ x: 0, z: -4, w: 3.6, d: 13.4, h: 0.35, y: 3, material: 'hazard', collide: false });
  box({ x: -6.6, z: 18, w: 4, d: 1.2, h: 1.3, material: 'hazard' });
  box({ x: 6.6, z: -18, w: 4, d: 1.2, h: 1.3, material: 'hazard' });

  // Lane cover: enough to break every long sightline into two shorter ones.
  box({ x: -22.7, z: 16, w: 2.4, d: 2.6, h: 1.6, material: 'crate' });
  box({ x: -17.3, z: 4, w: 2.2, d: 2.2, h: 2.2, material: 'crate' });
  box({ x: -22.7, z: -9, w: 2.4, d: 1.2, h: 1.3, material: 'hazard' });
  box({ x: 22.7, z: 16, w: 2.4, d: 2.6, h: 1.6, material: 'crate' });
  box({ x: 17.3, z: 4, w: 2.2, d: 2.2, h: 2.2, material: 'crate' });
  box({ x: 22.7, z: -9, w: 2.4, d: 1.2, h: 1.3, material: 'hazard' });

  // Spawn cover, so neither spawn is a shooting gallery.
  box({ x: -12, z: 40, w: 4, d: 1.2, h: 1.3, material: 'hazard' });
  box({ x: 12, z: 40, w: 4, d: 1.2, h: 1.3, material: 'hazard' });
  box({ x: 0, z: 48, w: 6, d: 2, h: 1.6, material: 'crate' });
  box({ x: -6, z: -24, w: 3, d: 1.2, h: 1.3, material: 'hazard' });
  box({ x: 6, z: -24, w: 3, d: 1.2, h: 1.3, material: 'hazard' });

  // The two plant sites, drawn as a glowing floor plate so the objective is legible at a glance
  // from either lane.
  const siteA = { id: 'A', name: 'Tank Yard', x: -31, z: -37, radius: 6.5 };
  const siteB = { id: 'B', name: 'Freight House', x: 31, z: -37, radius: 6.5 };
  for (const [site, material] of [[siteA, materials.siteA], [siteB, materials.siteB]]) {
    const plate = new THREE.Mesh(new THREE.CircleGeometry(site.radius, 40), material);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.x, 0.02, site.z);
    scene.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.22, site.radius, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(MATERIALS.accent), transparent: true, opacity: 0.5 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
  }

  // Lights: a low warm sun through the depot haze, a cold fill so the lanes do not go black, and
  // lamps that pool at the two sites and under the mid roof.
  scene.fog = new THREE.Fog(new THREE.Color('#2b3440'), 34, 132);
  const ambient = new THREE.AmbientLight(new THREE.Color('#64758a'), 0.34);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#9db2c6'), new THREE.Color('#333c46'), 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a6'), 3.3);
  sun.position.set(-38, 46, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d99b8'), 0.5);
  fill.position.set(30, 26, -40);
  scene.add(fill);
  lamp(scene, siteA.x, 3.6, siteA.z, 44, 34);
  lamp(scene, siteB.x, 3.6, siteB.z, 44, 34);
  lamp(scene, 0, 3.4, 0, 24, 26);
  lamp(scene, -31, 3.2, 12, 18, 24);
  lamp(scene, 31, 3.2, 12, 18, 24);
  lamp(scene, 0, 4.2, -24, 20, 24);

  // ---------------------------------------------------------------- nav graph
  // Waypoints are placed by hand where a person would walk; the edges between them are not, they
  // are proved clear by walking the segment against the colliders. That way cover added later
  // cannot leave a bot walking through a crate.
  const waypoints = [
    // attacker spawn
    [-24, 50], [-12, 50], [0, 50], [12, 50], [24, 50],
    // south approach, three mouths
    [-20, 38], [-20, 26], [-8, 30], [0, 26], [8, 30], [20, 26], [20, 38],
    // long lane, down the middle of the corridor
    [-20, 14], [-20, 2], [-20, -12], [-20, -19],
    // mid corridor, one path either side of the train car
    [-2.8, 22], [-2.8, 12], [-2.8, 0], [-2.8, -12], [-2.8, -19],
    [2.8, 22], [2.8, 12], [2.8, 0], [2.8, -12], [2.8, -19],
    // short lane
    [20, 14], [20, 2], [20, -12], [20, -19],
    // defender strip, the rotation between the sites
    [-19, -22], [-12, -22], [-6, -22], [0, -22], [6, -22], [12, -22], [19, -22],
    // site A: in through the east door, then around the plant zone
    [-23, -36], [-27, -36], [-31, -44], [-31, -31], [-26, -38], [-38, -42], [-38, -30],
    // site B, mirrored
    [23, -36], [27, -36], [31, -44], [31, -31], [26, -38], [38, -42], [38, -30],
  ].map(([x, z], index) => ({ index, x, z }));

  // A segment is walkable when a body-width sample of it never enters a collider and never leaves
  // the yard.
  function segmentClear(ax, az, bx, bz) {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.6));
    const pad = 0.42;
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (x < -45 || x > 45 || z < -57 || z > 57) return false;
      for (let c = 0; c < colliders.length; c += 1) {
        const hit = colliders[c];
        if (hit.maxY < 0.55) continue; // step-over cover
        if (x > hit.minX - pad && x < hit.maxX + pad && z > hit.minZ - pad && z < hit.maxZ + pad) return false;
      }
    }
    return true;
  }

  const edges = waypoints.map(() => []);
  for (let a = 0; a < waypoints.length; a += 1) {
    for (let b = a + 1; b < waypoints.length; b += 1) {
      const distance = Math.hypot(waypoints[a].x - waypoints[b].x, waypoints[a].z - waypoints[b].z);
      if (distance > 26) continue;
      if (!segmentClear(waypoints[a].x, waypoints[a].z, waypoints[b].x, waypoints[b].z)) continue;
      edges[a].push({ to: b, cost: distance });
      edges[b].push({ to: a, cost: distance });
    }
  }

  const spawns = {
    attacker: [
      { x: -14, z: 50, yaw: 0 },
      { x: -6, z: 52, yaw: 0 },
      { x: 0, z: 50, yaw: 0 },
      { x: 6, z: 52, yaw: 0 },
      { x: 14, z: 50, yaw: 0 },
    ],
    defender: [
      { x: -14, z: -34, yaw: Math.PI },
      { x: -6, z: -22, yaw: Math.PI },
      { x: 0, z: -22, yaw: Math.PI },
      { x: 6, z: -22, yaw: Math.PI },
      { x: 14, z: -34, yaw: Math.PI },
    ],
  };

  return {
    colliders,
    materials,
    waypoints,
    edges,
    segmentClear,
    spawns,
    sites: { A: siteA, B: siteB },
    // A single ray against the world, used by bots for sight and by the round logic to check that
    // a plant is happening in the open.
    raycast(origin, direction, maxDistance) {
      let best = maxDistance;
      let hitNormalX = 0;
      let hitNormalZ = 0;
      let hit = false;
      for (let index = 0; index < colliders.length; index += 1) {
        const box = colliders[index];
        let tMin = 0;
        let tMax = best;
        let axis = -1;
        let sign = 1;
        const axes = [
          [origin.x, direction.x, box.minX, box.maxX],
          [origin.y, direction.y, box.minY, box.maxY],
          [origin.z, direction.z, box.minZ, box.maxZ],
        ];
        for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
          const [start, dir, lo, hi] = axes[axisIndex];
          if (Math.abs(dir) < 1e-8) {
            if (start < lo || start > hi) { tMin = Infinity; break; }
            continue;
          }
          let t1 = (lo - start) / dir;
          let t2 = (hi - start) / dir;
          let s = -1;
          if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; s = 1; }
          if (t1 > tMin) { tMin = t1; axis = axisIndex; sign = s; }
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) { tMin = Infinity; break; }
        }
        if (tMin < best && tMin > 0.0001 && tMin !== Infinity) {
          best = tMin;
          hit = true;
          hitNormalX = axis === 0 ? sign : 0;
          hitNormalZ = axis === 2 ? sign : 0;
        }
      }
      return { distance: best, hit, normalX: hitNormalX, normalZ: hitNormalZ };
    },
  };
}
