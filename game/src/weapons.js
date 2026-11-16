// The guns, in the hand and in the numbers. One view model per weapon is built from boxes and
// pushed under the camera; the module owns ammunition, the reload clock, the recoil kick and the
// spread that makes a moving shooter miss. Who gets hit is not decided here — combat.js owns the
// ray — so a bot and the player fire through exactly the same path.
import * as THREE from 'three';
import { MATERIALS, PALETTE } from './palette.js';
import { WEAPONS, GEAR } from './config.js';

// The rifle is deliberately dark and cool: a cool grey-brown body, not a tan one, so the weapon never
// competes with the thing holding it. A tan hand on a tan rifle reads as another piece of the rifle,
// which is exactly what a view model must not do.
const SKIN = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a352f'), roughness: 0.5, metalness: 0.55 });
const GRIP = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a4038'), roughness: 0.82, metalness: 0.04 });
const DARK = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232930'), roughness: 0.58, metalness: 0.4 });
const GLOVE = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8f5c33'), roughness: 0.97, metalness: 0.01 });
const CUFF = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a5560'), roughness: 0.92, metalness: 0.03 });
// Bare forearms and the glove over the hand: hands are what make a view model read as held rather
// than hovering. The hands are the warmest thing on screen on purpose, so they read against the
// weapon instead of dissolving into it: a deep warm brown skin, and a near-black glove that gives
// the fingers a hard silhouette against the receiver.
const SKIN_TONE = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a9673f'), roughness: 0.86, metalness: 0.02 });
const DARK_GLOVE = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d1a17'), roughness: 0.9, metalness: 0.05 });

function piece(parent, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// Each silhouette is built to be recognisable in one glance from the first-person corner: a long
// barrel reads as the rifle, a fat tube as the shotgun, a scope as the sniper.
// Two gloved forearms under every weapon: the right hand on the grip, the left out on the
// handguard. It is the single detail that stops a view model reading as a floating box.
// The view model is a left-handed hold seen from behind the stock: the support hand is the one the
// camera can actually see, so it is the one built in detail — a palm under the handguard with four
// separate fingers wrapped over the near side, and a forearm running back to the bottom corner of
// the frame. The trigger hand is mostly a fist and a forearm, which is all a camera at this angle
// would ever see of it.
// Low-poly hands have to be overscaled to read at all, because a realistically sized hand
// disappears at this resolution: at gameplay distance a true-scale palm is a few pixels of the
// same brown as the receiver. Width and height are blown up here and the z lengths are left alone,
// so the hands and forearms get bigger on screen without growing along the weapon or leaving the
// handguard and the grip they are wrapped around.
const HAND_SCALE = 1.5;

function addHands(group, foreZ, gripZ) {
  const add = (w, h, d, x, y, z, material, rx, ry, rz) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * HAND_SCALE, h * HAND_SCALE, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx ?? 0, ry ?? 0, rz ?? 0);
    group.add(mesh);
    return mesh;
  };

  // Support hand: a palm under the handguard, small enough to read as a hand rather than as more
  // furniture, with the fingers curling up the near side where they are seen against the map.
  add(0.1, 0.115, 0.185, -0.012, -0.115, foreZ, GLOVE);
  for (let finger = 0; finger < 4; finger += 1) {
    // Each finger starts outside the weapon's own width, so it is never buried inside the receiver.
    add(0.068, 0.062, 0.042, 0.068, -0.03, foreZ - 0.066 + finger * 0.045, GLOVE, 0.08, 0, 0.05);
  }
  // Thumb laid forward along the top of the handguard, the one finger on the far side.
  add(0.048, 0.05, 0.145, -0.062, -0.035, foreZ - 0.015, GLOVE, 0, -0.2, -0.1);
  // Forearm: long, tapered by two stacked boxes, running to the bottom of the frame.
  add(0.13, 0.13, 0.26, -0.02, -0.15, foreZ + 0.2, CUFF, 0.3, 0.2, 0.06);
  add(0.145, 0.145, 0.3, -0.055, -0.235, foreZ + 0.42, CUFF, 0.34, 0.26, 0.08);

  // Trigger hand: a fist at the grip with the knuckles facing the camera.
  add(0.115, 0.13, 0.15, 0.012, -0.1, gripZ, GLOVE);
  for (let finger = 0; finger < 3; finger += 1) {
    add(0.066, 0.06, 0.042, 0.07, -0.035, gripZ - 0.048 + finger * 0.043, GLOVE, 0.08, 0, 0.05);
  }
  add(0.14, 0.14, 0.28, 0.05, -0.16, gripZ + 0.18, CUFF, 0.5, -0.1, -0.06);
  add(0.155, 0.155, 0.3, 0.1, -0.25, gripZ + 0.4, CUFF, 0.55, -0.16, -0.08);

  // Two bare forearms, one per side, each a pair of tapered boxes in warm skin with the dark glove
  // sitting at the far end where the wrist meets the hand: the left one runs forward under the
  // fore-end, the right one comes up behind the trigger guard. They are children of the weapon
  // group, so they inherit its bob, sway and recoil kick for free instead of needing their own.
  add(0.135, 0.135, 0.085, -0.03, -0.13, foreZ - 0.02, DARK_GLOVE, 0.26, 0.18, 0.04);
  add(0.115, 0.115, 0.3, -0.02, -0.175, foreZ + 0.17, SKIN_TONE, 0.3, 0.16, 0.05);
  add(0.128, 0.128, 0.32, -0.06, -0.25, foreZ + 0.44, SKIN_TONE, 0.34, 0.22, 0.07);
  add(0.14, 0.14, 0.085, 0.02, -0.115, gripZ - 0.02, DARK_GLOVE, 0.44, -0.1, -0.05);
  add(0.12, 0.12, 0.28, 0.05, -0.18, gripZ + 0.17, SKIN_TONE, 0.46, -0.1, -0.05);
  add(0.135, 0.135, 0.32, 0.1, -0.255, gripZ + 0.42, SKIN_TONE, 0.5, -0.16, -0.07);
}

function buildModel(id) {
  const group = new THREE.Group();
  if (id === 'shortline') {
    piece(group, 0.06, 0.09, 0.26, 0, 0, -0.06, SKIN);
    piece(group, 0.05, 0.13, 0.09, 0, -0.1, 0.06, GRIP);
    piece(group, 0.035, 0.035, 0.1, 0, 0.01, -0.22, DARK);
    piece(group, 0.012, 0.02, 0.02, 0, 0.062, -0.16, DARK);
    addHands(group, -0.16, 0.06);
  } else if (id === 'vespa') {
    piece(group, 0.07, 0.1, 0.34, 0, 0, -0.08, SKIN);
    piece(group, 0.04, 0.04, 0.2, 0, 0.02, -0.3, DARK);
    piece(group, 0.05, 0.16, 0.1, 0, -0.11, 0.08, GRIP);
    piece(group, 0.05, 0.12, 0.16, 0, -0.07, -0.16, DARK);
    piece(group, 0.012, 0.022, 0.02, 0, 0.064, -0.24, DARK);
    addHands(group, -0.21, 0.09);
  } else if (id === 'kessel') {
    piece(group, 0.075, 0.11, 0.42, 0, 0, -0.1, SKIN);
    piece(group, 0.042, 0.042, 0.34, 0, 0.015, -0.4, DARK);
    piece(group, 0.055, 0.16, 0.1, 0, -0.12, 0.06, GRIP);
    piece(group, 0.055, 0.14, 0.2, 0, -0.09, -0.2, DARK);
    piece(group, 0.05, 0.05, 0.14, 0, 0.07, -0.06, DARK);
    piece(group, 0.03, 0.03, 0.06, 0, 0.088, -0.24, DARK);
    piece(group, 0.02, 0.06, 0.02, 0.02, 0.05, 0.04, DARK);
    addHands(group, -0.27, 0.1);
  } else if (id === 'breech') {
    piece(group, 0.085, 0.12, 0.36, 0, 0, -0.1, GRIP);
    piece(group, 0.07, 0.07, 0.3, 0, 0.02, -0.36, SKIN);
    piece(group, 0.06, 0.14, 0.1, 0, -0.11, 0.08, GRIP);
    piece(group, 0.05, 0.05, 0.12, 0, -0.05, -0.28, DARK);
    addHands(group, -0.25, 0.08);
  } else {
    piece(group, 0.07, 0.1, 0.5, 0, 0, -0.14, SKIN);
    piece(group, 0.038, 0.038, 0.5, 0, 0.012, -0.58, DARK);
    piece(group, 0.055, 0.16, 0.12, 0, -0.12, 0.08, GRIP);
    piece(group, 0.06, 0.07, 0.26, 0, 0.09, -0.16, DARK);
    piece(group, 0.09, 0.09, 0.03, 0, 0.12, -0.3, DARK);
    piece(group, 0.05, 0.05, 0.18, 0, 0.135, -0.14, DARK);
    addHands(group, -0.33, 0.1);
  }
  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
  return group;
}

export function createArsenal(camera) {
  const models = new Map();
  for (const id of Object.keys(WEAPONS)) {
    const model = buildModel(id);
    model.visible = false;
    camera.add(model);
    models.set(id, model);
  }

  // An eight-point additive star is the cheapest way to make a muzzle read as a burst of light
  // rather than a paper diamond: a 16-segment circle whose vertices are pushed in and out
  // alternately gives eight spikes, and additive blending supplies the glow with no texture at all.
  const flashGeometry = new THREE.CircleGeometry(0.17, 16);
  const flashRing = flashGeometry.attributes.position;
  for (let index = 1; index < flashRing.count; index += 1) {
    const angle = Math.atan2(flashRing.getY(index), flashRing.getX(index));
    const radius = index % 2 === 1 ? 0.17 : 0.055;
    flashRing.setXY(index, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  flashRing.needsUpdate = true;
  flashGeometry.computeBoundingSphere();
  const flash = new THREE.Mesh(
    flashGeometry,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fff0c8'), transparent: true, opacity: 0.95,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(MATERIALS.lamp), 0, 7, 2);
  camera.add(flashLight);

  const state = {
    id: 'shortline',
    mag: WEAPONS.shortline.magazine,
    reserve: WEAPONS.shortline.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flashLeft: 0,
    kick: 0,
    bobPhase: 0,
    aiming: false,
    frags: 0,
    plating: false,
    plate: 0,
  };

  function def() {
    return WEAPONS[state.id];
  }

  function select(id) {
    if (!WEAPONS[id] || id === state.id) return false;
    models.get(state.id).visible = false;
    state.id = id;
    state.mag = WEAPONS[id].magazine;
    state.reserve = WEAPONS[id].reserve;
    state.reloadLeft = 0;
    state.cooldown = 0.22;
    return true;
  }

  function refillAll() {
    for (const id of Object.keys(WEAPONS)) {
      const model = models.get(id);
      model.visible = false;
    }
    state.id = 'shortline';
    state.mag = WEAPONS.shortline.magazine;
    state.reserve = WEAPONS.shortline.reserve;
    state.frags = 0;
    state.plating = false;
    state.plate = 0;
    state.reloadLeft = 0;
    state.cooldown = 0;
  }

  function give(id) {
    if (!WEAPONS[id]) return;
    models.get(state.id).visible = false;
    state.id = id;
    state.mag = WEAPONS[id].magazine;
    state.reserve = WEAPONS[id].reserve;
    state.reloadLeft = 0;
    state.cooldown = 0.3;
  }

  function buyPlate() {
    state.plating = true;
    state.plate = GEAR.plate.durability;
  }

  function addFrag() {
    state.frags = Math.min(2, state.frags + 1);
  }

  function canFire() {
    return state.cooldown <= 0 && state.reloadLeft <= 0 && state.mag > 0;
  }

  // takeRound is the only way a shot is paid for: it returns false when the trigger pull cannot
  // become a bullet, so the caller never has to guess.
  function takeRound() {
    if (!canFire()) return false;
    state.mag -= 1;
    state.cooldown = def().interval;
    state.flashLeft = 0.055;
    state.kick = Math.min(0.14, state.kick + 0.05);
    return true;
  }

  function reload() {
    const weapon = def();
    if (state.reloadLeft > 0 || state.mag >= weapon.magazine || state.reserve <= 0) return false;
    state.reloadLeft = weapon.reload;
    return true;
  }

  function step(dt, speed, crouching) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flashLeft = Math.max(0, state.flashLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 15);
    if (state.reloadLeft > 0) {
      state.reloadLeft -= dt;
      if (state.reloadLeft <= 0) {
        const weapon = def();
        const room = weapon.magazine - state.mag;
        const taken = Math.min(room, state.reserve);
        state.mag += taken;
        state.reserve -= taken;
        state.reloadLeft = 0;
      }
    }
    state.bobPhase += speed * dt * 1.9;
    if (crouching) state.bobPhase += dt * 0.4;
    const model = models.get(state.id);
    model.visible = true;
    const bob = state.aiming ? 0.25 : 1;
    const sway = Math.sin(state.bobPhase) * 0.008 * bob;
    const lift = Math.cos(state.bobPhase * 2) * 0.005 * bob;
    const reloadDrop = state.reloadLeft > 0 ? -0.16 * Math.sin((1 - state.reloadLeft / def().reload) * Math.PI) : 0;
    const hipX = state.aiming ? 0 : 0.155;
    const hipY = state.aiming ? -0.05 : -0.075;
    const hipZ = state.aiming ? -0.42 : -0.55;
    model.position.set(hipX + sway, hipY + lift + reloadDrop, hipZ + state.kick);
    model.rotation.set(state.kick * 1.6, sway * 0.6 + 0.11, reloadDrop * 1.4);
    model.scale.setScalar(state.aiming ? 0.86 : 0.92);

    flash.visible = state.flashLeft > 0;
    if (flash.visible) {
      const reach = state.id === 'shortline' ? 0.32 : state.id === 'breech' ? 0.52 : 0.62;
      flash.position.set(model.position.x - 0.03, model.position.y + 0.04, model.position.z - reach);
      flash.rotation.z = Math.random() * Math.PI * 2;
      flash.scale.setScalar(0.75 + Math.random() * 0.45);
    }
    flashLight.position.copy(flash.position);
    flashLight.intensity = state.flashLeft > 0 ? 5 : 0;
  }

  // Spread is the heart of the gunplay: standing still with a rifle is nearly a laser, walking
  // opens it up, and a jump or a crouch-walk has its own character.
  function spread(speed, crouching, airborne) {
    const weapon = def();
    const ratio = Math.min(1.6, speed / 5.35);
    const moving = weapon.spreadMoving * ratio * ratio;
    const base = weapon.spreadStill * (crouching ? 0.72 : 1) * (state.aiming ? 0.55 : 1);
    const air = airborne ? weapon.spreadMoving * 1.6 : 0;
    return base + moving + air;
  }

  return {
    state,
    def,
    select,
    give,
    refillAll,
    buyPlate,
    addFrag,
    takeRound,
    reload,
    step,
    spread,
    canFire,
    models,
  };
}
