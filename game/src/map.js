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
    // Stains and cracks are what make a poured wall read as a wall at screenshot distance: the
    // seams alone leave it as noise, so a patch of damp blotches and a few hairline cracks give the
    // surface a scale the eye can actually measure.
    // Stains are seasoning, not camouflage: past a certain density the surface stops reading as a
    // material and starts reading as noise, so the patch count and the alpha both stay restrained.
    for (let index = 0; index < 14; index += 1) {
      const x = random() * size;
      const y = random() * size;
      const radiusX = 6 + random() * 26;
      const radiusY = 4 + random() * 18;
      context.fillStyle = `rgba(60,38,22,${0.06 + random() * 0.07})`;
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    // Cracks: short polyline runs, never straight, so they read as settlement rather than as rules.
    context.strokeStyle = 'rgba(30,20,14,0.35)';
    context.lineWidth = 1;
    for (let index = 0; index < 14; index += 1) {
      let x = random() * size;
      let y = random() * size;
      const segments = 4 + Math.floor(random() * 4);
      context.beginPath();
      context.moveTo(x, y);
      for (let segment = 0; segment < segments; segment += 1) {
        x += (random() - 0.5) * 34;
        y += (random() - 0.5) * 34;
        context.lineTo(x, y);
      }
      context.stroke();
    }
    grain(context, size, seed + 7, 26);
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
      // Deeper seams give the crates visible plank structure rather than a flat brown box.
      context.strokeStyle = 'rgba(0,0,0,0.45)';
      context.lineWidth = 2;
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
    grain(context, size, seed + 11, 30);
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

// ---------------------------------------------------------------- yard clutter
// Set dressing, not cover. The clutter is deliberately non-colliding so it changes what the eye
// sees without changing what the player can walk through: it fills the dead floor along both lanes
// and around both plant sites, so no sightline ends on bare ground, and it never touches the
// collider list the bodies slide against or the nav graph the bots walk. Every position is drawn
// from a seeded stream, so the yard is dressed identically on every run.
function yardClutter(scene, colliders) {
  // colliders is accepted for symmetry with the other prop builders and never written to: nothing
  // below may push into it, which is the whole point of dressing.
  const random = seededNoise(9157);
  const timber = new THREE.MeshStandardMaterial({
    map: plankSurface(MATERIALS.crate, 71), roughness: 0.8, metalness: 0.03,
  });
  const tank = new THREE.MeshStandardMaterial({
    color: new THREE.Color(MATERIALS.tank), roughness: 0.46, metalness: 0.58,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(MATERIALS.metal), roughness: 0.54, metalness: 0.5,
  });

  const prop = (geometry, material, x, y, z, rx, ry, rz) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx ?? 0, ry ?? 0, rz ?? 0);
    // The same shadow flags the crates use, so the clutter sits in the same light as the map.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const jitter = (span) => (random() - 0.5) * span;

  // Anchors hug the walls of both lanes and ring both sites. They are placed by hand against the
  // known geometry; only the small offsets and yaws come from the seeded stream.
  const anchors = [
    // Long lane, down the west corridor, alternating wall to wall.
    { x: -23.3, z: 18, kind: 'pallets' },
    { x: -16.7, z: 14, kind: 'drums' },
    { x: -23.4, z: 8, kind: 'pipes', axis: 'z' },
    { x: -16.6, z: 0, kind: 'spool' },
    { x: -23.3, z: -6, kind: 'planks' },
    { x: -16.7, z: -16, kind: 'drums' },
    { x: -20, z: 30, kind: 'pallets' },
    // Short lane, mirrored.
    { x: 23.3, z: 18, kind: 'pallets' },
    { x: 16.7, z: 14, kind: 'drums' },
    { x: 23.4, z: 8, kind: 'pipes', axis: 'z' },
    { x: 16.6, z: 0, kind: 'spool' },
    { x: 23.3, z: -6, kind: 'planks' },
    { x: 16.7, z: -16, kind: 'drums' },
    { x: 20, z: 30, kind: 'pallets' },
    // Site A: the tank yard, dressed around the big drums and the crate stack.
    { x: -38.5, z: -43, kind: 'pallets' },
    { x: -37.5, z: -48.9, kind: 'pipes', axis: 'x' },
    { x: -24.5, z: -47, kind: 'drums' },
    { x: -44, z: -35, kind: 'spool' },
    { x: -33, z: -29.5, kind: 'planks' },
    { x: -26, z: -29, kind: 'drums' },
    // Site B: the freight house, mirrored.
    { x: 38.5, z: -43, kind: 'pallets' },
    { x: 37.5, z: -48.9, kind: 'pipes', axis: 'x' },
    { x: 24.5, z: -47, kind: 'drums' },
    { x: 44, z: -35, kind: 'spool' },
    { x: 33, z: -29.5, kind: 'planks' },
    { x: 26, z: -29, kind: 'drums' },
    // Spawn apron, so the approach is not an empty apron.
    { x: -34, z: 44, kind: 'drums' },
    { x: 34, z: 44, kind: 'pallets' },
  ];

  // One builder per kind, so the spawn cluster below is dressed by exactly the same rules and out
  // of exactly the same materials as the anchors: same geometry, same shadow flags, and every
  // offset and yaw drawn from the seeded stream it is handed.
  const dress = (kind, x, z, yaw, jitterFn, randomFn, axis) => {
    if (kind === 'pallets') {
      // A pallet stack: three thin boards, each turned a little, the classic depot floor pile.
      for (let layer = 0; layer < 3; layer += 1) {
        prop(
          new THREE.BoxGeometry(1.05, 0.09, 0.85),
          timber,
          x + jitterFn(0.12), 0.045 + layer * 0.1, z + jitterFn(0.12),
          0, yaw + layer * 0.22 + jitterFn(0.2), 0,
        );
      }
    } else if (kind === 'drums') {
      // Oil drums: two standing cylinders, one nudged off the other.
      prop(
        new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12),
        tank,
        x, 0.45, z,
        0, yaw, 0,
      );
      prop(
        new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12),
        tank,
        x + jitterFn(0.85), 0.45, z + jitterFn(0.85),
        0, yaw + 0.6, 0,
      );
    } else if (kind === 'spool') {
      // A cable spool: the drum lying on its side, with a cheek at each end.
      const roll = 0.5 + randomFn() * 0.2;
      prop(
        new THREE.CylinderGeometry(0.62, 0.62, roll, 14),
        timber,
        x, 0.62, z,
        0, yaw, Math.PI / 2,
      );
      prop(new THREE.BoxGeometry(0.07, 1.28, 1.28), timber, x - roll / 2 - 0.03, 0.62, z, 0, yaw, 0);
      prop(new THREE.BoxGeometry(0.07, 1.28, 1.28), timber, x + roll / 2 + 0.03, 0.62, z, 0, yaw, 0);
    } else if (kind === 'pipes') {
      // A low pipe run along the base of the wall: two long thin boxes, one on top of the other.
      const long = axis === 'z';
      for (let pipe = 0; pipe < 2; pipe += 1) {
        prop(
          long ? new THREE.BoxGeometry(0.16, 0.16, 2.9) : new THREE.BoxGeometry(2.9, 0.16, 0.16),
          steel,
          x + (long ? pipe * 0.26 : 0), 0.1 + pipe * 0.18, z + (long ? 0 : pipe * 0.26),
          0, 0, 0,
        );
      }
    } else {
      // A few loose planks, dropped flat and slightly out of square.
      for (let plank = 0; plank < 3; plank += 1) {
        prop(
          new THREE.BoxGeometry(1.9, 0.07, 0.24),
          timber,
          x + jitterFn(0.5), 0.04 + plank * 0.08, z + jitterFn(0.5),
          0, yaw + plank * 0.5, 0,
        );
      }
    }
  };

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const x = anchor.x + jitter(0.5);
    const z = anchor.z + jitter(0.5);
    const yaw = random() * Math.PI * 2;
    dress(anchor.kind, x, z, yaw, jitter, random, anchor.axis);
  }

  // ---------------------------------------------------------------- spawn apron cluster
  // The spawn needs dressing too, because it is the first thing the player and a screenshot see:
  // the start screen camera stands on this apron and the ground under it was bare. So the apron
  // gets a seeded cluster of its own — pallet stacks, oil drums and a couple of cable spools in the
  // same materials, with the same shadow flags as every other prop and, like all of this dressing,
  // never pushed into the collider list.
  const apronRandom = seededNoise(3313);
  const apronJitter = (span) => (apronRandom() - 0.5) * span;
  const apronAnchors = [
    { x: -6.3, z: 38.4, kind: 'pallets' },
    { x: 6.5, z: 39.2, kind: 'pallets' },
    { x: -5.7, z: 46.6, kind: 'pallets' },
    { x: 5.9, z: 47.1, kind: 'pallets' },
    { x: -2.7, z: 35.2, kind: 'drums' },
    { x: 3.1, z: 36.1, kind: 'drums' },
    { x: -7.5, z: 42.6, kind: 'drums' },
    { x: 7.3, z: 43.2, kind: 'drums' },
    { x: -3.4, z: 40.8, kind: 'spool' },
    { x: 3.8, z: 45.4, kind: 'spool' },
  ];

  for (let index = 0; index < apronAnchors.length; index += 1) {
    const anchor = apronAnchors[index];
    const x = anchor.x + apronJitter(0.35);
    const z = anchor.z + apronJitter(0.35);
    const yaw = apronRandom() * Math.PI * 2;
    dress(anchor.kind, x, z, yaw, apronJitter, apronRandom, anchor.axis);
  }
}

// ---------------------------------------------------------------- sky
// A gradient sky is what makes distance read as distance: with a real dome overhead the fog on the
// far walls has something to be haze against, and the eye gets a horizon to measure the yard by
// instead of a flat slab of background colour.
function skyDome(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  // Dusk, zenith to horizon: indigo, deep rose, brick red, then the hot band the sun is going down
  // in. The stops are packed into the upper half of the canvas because the upper half of the sphere
  // is the only part a player standing on the ground ever sees.
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#2a1b2e');
  gradient.addColorStop(0.28, '#7a3550');
  gradient.addColorStop(0.44, '#c95f3a');
  gradient.addColorStop(0.56, '#f2a35c');
  gradient.addColorStop(1, '#f2a35c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  // One soft sun disc sitting low, wide enough to bloom into the haze around it rather than read as
  // a cut-out circle.
  const sunY = 512 * 0.62;
  const glow = context.createRadialGradient(256, sunY, 0, 256, sunY, 512 * 0.42);
  glow.addColorStop(0, 'rgba(255, 217, 160, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 217, 160, 0.34)');
  glow.addColorStop(1, 'rgba(255, 217, 160, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 24),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);
  return dome;
}

// ---------------------------------------------------------------- ground haze
// Layered transparent planes are the cheap way to fake volumetric dust at dusk: three flat sheets
// of warm haze stacked at shin, chest and head height give the air volume, so the yard reads as a
// space full of dusk air instead of as geometry floating in a vacuum. None of them write depth, so
// they tint whatever is behind them without cutting a hole in the world.
function groundHaze(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  // Soft radial falloff: dense in the middle, fully gone at the edge, so the plane has no border.
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(240,190,140,0.30)');
  gradient.addColorStop(1, 'rgba(240,190,140,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  // Three heights, three densities: the low sheet is the thickest, the high one only a stain.
  const layers = [
    { height: 0.9, opacity: 0.42 },
    { height: 2.2, opacity: 0.3 },
    { height: 3.6, opacity: 0.2 },
  ];
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(190, 190),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: layer.opacity,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = layer.height;
    scene.add(plane);
  }
}

// ---------------------------------------------------------------- signage
// The signage is navigation, not decoration: it mirrors the minimap's site letters, so a player who
// reads "SITE A — TANK YARD" over the plate knows which site they are standing on without looking
// away at the HUD. Painted plate, not a floating UI label: dark enamel, amber rule, cream letters.
function signPlate(text, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  // Plate and its amber border, inset so the stroke is never clipped by the texture edge.
  context.fillStyle = '#241a14';
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = MATERIALS.accent ?? PALETTE.accent;
  context.lineWidth = 6;
  context.strokeRect(3, 3, 506, 122);

  // Fit the type to the plate: measure the whole string first, shrink the point size until it
  // clears the border, then draw it glyph by glyph so the tracking is even.
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const tracking = 4;
  const glyphs = [...text];
  const measure = (size) => {
    context.font = `bold ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const widths = glyphs.map((glyph) => context.measureText(glyph).width);
    return { widths, total: widths.reduce((sum, value) => sum + value, 0) + tracking * (glyphs.length - 1) };
  };
  let size = 56;
  let metrics = measure(size);
  while (metrics.total > 460 && size > 18) {
    size -= 2;
    metrics = measure(size);
  }
  context.fillStyle = '#f4e2c0';
  let cursor = 256 - metrics.total / 2;
  for (let index = 0; index < glyphs.length; index += 1) {
    context.fillText(glyphs[index], cursor + metrics.widths[index] / 2, 68);
    cursor += metrics.widths[index] + tracking;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  return mesh;
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

  // Signage over the two sites, read from the defender strip and from mid. Each plate faces +z,
  // which is the direction the attackers arrive from, so the yard names itself on the approach.
  const yardSign = signPlate('KESSEL YARDS', 9, 1.6);
  yardSign.position.set(-31, 4.6, -30.6);
  yardSign.rotation.y = 0; // a plane already faces +z; stated so the facing is not an accident
  scene.add(yardSign);
  const siteASign = signPlate('SITE A — TANK YARD', 8, 1.1);
  siteASign.position.set(-31, 3.4, -30.6);
  scene.add(siteASign);
  const siteBSign = signPlate('FREIGHT HOUSE', 8, 1.5);
  siteBSign.position.set(31, 4.4, -30.6);
  siteBSign.rotation.y = 0; // same facing, mirrored across the corridor
  scene.add(siteBSign);

  // Lights: a low warm sun through the depot haze, a cold fill so the lanes do not go black, and
  // lamps that pool at the two sites and under the mid roof. The sun sits low so long shadows
  // rake across the lanes and the walls catch light on one face and go cool on the other.
  skyDome(scene);
  // The haze starts close on purpose: it is what hides the map's edges and makes the far wall
  // dissolve into the sky instead of ending on a hard line. Saturated against the sky's horizon
  // colour, so the fog reads as dusk air rather than as a grey veil.
  scene.fog = new THREE.Fog(new THREE.Color('#e0a06a'), 14, 104);
  groundHaze(scene);
  const ambient = new THREE.AmbientLight(new THREE.Color('#ffb877'), 0.5);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffd9a8'), new THREE.Color('#6b4a34'), 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 3.9);
  sun.position.set(-38, 46, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 190;
  // The bias is tuned against the walkway beams: with the old values the covered walkway banded and
  // the acne crawled as the camera moved, and a shadow that crawls reads as a bug rather than as
  // lighting. Map size and frustum stay put; only the bias moves.
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(new THREE.Color('#8fa8c4'), 0.35);
  fill.position.set(30, 26, -40);
  scene.add(fill);
  lamp(scene, siteA.x, 3.6, siteA.z, 44, 34);
  lamp(scene, siteB.x, 3.6, siteB.z, 44, 34);
  lamp(scene, 0, 3.4, 0, 24, 26);
  lamp(scene, -31, 3.2, 12, 18, 24);
  lamp(scene, 31, 3.2, 12, 18, 24);
  lamp(scene, 0, 4.2, -24, 20, 24);

  // Dressing goes in last, after every solid has been placed and before the nav graph is built, so
  // the bots are routing around the real cover and not around a pallet.
  yardClutter(scene, colliders);

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
