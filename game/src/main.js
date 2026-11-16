// Boot and the one loop. The simulation runs at a fixed 60 Hz and the renderer draws at whatever
// the display gives us, so a slow frame never changes what happened in the round. Everything the
// player does — move, shoot, plant, buy — is expressed here as a change to the simulation, and the
// renderer only ever reads.
import * as THREE from 'three';
import { PALETTE, MATERIALS } from './palette.js';
import { WEAPONS, GEAR, MOVE, MATCH } from './config.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createEconomy } from './economy.js';
import { createRound } from './round.js';
import { createHud } from './hud.js';
import { audio, resumeAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// ---------------------------------------------------------------- renderer and scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
document.getElementById('game').appendChild(renderer.domElement);

// A vertical dusk gradient behind everything. The sky dome covers almost every view, but if a view
// ever misses it — a corner, a wide aspect, the debug view being toggled — the empty pixels still
// read as dusk instead of flat slate.
function duskBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#2a1b2e');
  gradient.addColorStop(1, '#f2a35c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const scene = new THREE.Scene();
scene.background = duskBackdrop();
// far is set past the 300m sky dome so the dome is never clipped; fog ends at 150, so nothing the
// player can shoot at is affected by the extra depth range.
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.04, 420);
scene.add(camera);

const map = createMap(scene);
const combat = createCombat(scene);
const arsenal = createArsenal(camera);
const hud = createHud();
const economy = createEconomy();
const player = createPlayer(map.spawns.attacker[0]);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, map, combat);

const playerActor = player.state;
playerActor.name = 'You';
playerActor.team = 'vanguard';
playerActor.health = 100;
playerActor.armor = 0;
playerActor.lastShotAt = -99;

const events = [];
const round = createRound({ map, bots, economy, hud, events });
round.setPlayer({ player: playerActor, arsenal });
bots.setActors(round.allActors());
round.startRound();

let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let started = false;
let frozen = false;
let fireWasDown = false;
let frags = [];
let stats = { kills: 0, deaths: 0 };
let lastPhase = round.state.phase;
let lastWinner = null;

player.onStep((volume) => audio.step(volume));
player.onLand(() => audio.land());

// ---------------------------------------------------------------- buying
function ownedSet() {
  const owned = new Set([arsenal.state.id]);
  if (arsenal.state.plating) owned.add('plate');
  if (arsenal.state.frags > 0) owned.add('frag');
  return owned;
}

function purchase(item) {
  if (!item) return;
  if (!economy.spend(playerActor, item.price)) {
    hud.banner('Not enough', 'The wallet decides the loadout.', 1.4);
    return;
  }
  if (item.kind === 'weapon') {
    arsenal.give(item.id);
    audio.swap();
  } else if (item.id === 'plate') {
    arsenal.buyPlate();
    audio.buy();
  } else if (item.id === 'frag') {
    arsenal.addFrag();
    audio.buy();
  }
  hud.setMoney(economy.money(playerActor));
  hud.refreshBuy(economy.money(playerActor), ownedSet());
}

hud.onBuy(purchase);

function toggleBuy() {
  if (round.state.phase !== 'freeze' || !playerActor.alive) return;
  if (hud.buyOpen) hud.closeBuy();
  else hud.openBuy(economy.money(playerActor), ownedSet());
}

function handleKeys() {
  const pressed = input.takePressed();
  if (!pressed) return;
  for (const code of pressed) {
    if (code === 'KeyB') toggleBuy();
    else if (code === 'Escape' && hud.buyOpen) hud.closeBuy();
    else if (code === 'Tab') hud.showScoreboard(true, scoreboardRows());
    else if (code === 'Digit1' && hud.buyOpen) purchase(hud.buyItemAt(0));
    else if (code === 'Digit2' && hud.buyOpen) purchase(hud.buyItemAt(1));
    else if (code === 'Digit3' && hud.buyOpen) purchase(hud.buyItemAt(2));
    else if (code === 'Digit4' && hud.buyOpen) purchase(hud.buyItemAt(3));
    else if (code === 'Digit5' && hud.buyOpen) purchase(hud.buyItemAt(4));
    else if (code === 'Digit6' && hud.buyOpen) purchase(hud.buyItemAt(5));
    else if (code === 'Digit7' && hud.buyOpen) purchase(hud.buyItemAt(6));
    else if (code === 'KeyQ') {
      // Quick swap between the primary and the sidearm, which is the reflex a buy menu needs.
      const next = arsenal.state.id === 'shortline' ? (arsenal.state.lastPrimary ?? 'shortline') : 'shortline';
      if (arsenal.state.id !== 'shortline') arsenal.state.lastPrimary = arsenal.state.id;
      arsenal.select(next);
      audio.swap();
    } else if (code === 'KeyR') {
      if (arsenal.reload()) audio.reload();
    } else if (code === 'KeyG') {
      throwFrag();
    }
  }
}

function scoreboardRows() {
  const rows = [];
  for (const actor of round.allActors()) {
    rows.push({
      name: actor.name ?? 'Player',
      team: actor.team,
      kills: actor.kills ?? 0,
      deaths: actor.deaths ?? 0,
      money: economy.money(actor),
    });
  }
  rows.sort((a, b) => (a.team === b.team ? b.kills - a.kills : a.team === 'vanguard' ? -1 : 1));
  return rows;
}

// ---------------------------------------------------------------- firing
const shootDirection = { x: 0, y: 0, z: 0 };

function fireOnce() {
  const weapon = arsenal.def();
  if (!arsenal.takeRound()) {
    if (arsenal.state.mag === 0 && arsenal.state.reloadLeft <= 0) {
      audio.dryFire();
      if (arsenal.state.reserve > 0 && arsenal.reload()) audio.reload();
    }
    return;
  }
  const spread = arsenal.spread(player.state.speed, player.state.crouching, !player.state.onGround);
  const cosPitch = Math.cos(player.state.pitch);
  for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
    shootDirection.x = -Math.sin(player.state.yaw) * cosPitch + (random() * 2 - 1) * spread;
    shootDirection.y = Math.sin(player.state.pitch) + (random() * 2 - 1) * spread;
    shootDirection.z = -Math.cos(player.state.yaw) * cosPitch + (random() * 2 - 1) * spread;
    const norm = Math.hypot(shootDirection.x, shootDirection.y, shootDirection.z) || 1;
    shootDirection.x /= norm;
    shootDirection.y /= norm;
    shootDirection.z /= norm;
    const eye = player.eyePoint();
    const result = combat.fire(map, eye, shootDirection, weapon, round.allActors(), playerActor, events);
    if (result.hit) {
      const killed = !result.actor.alive;
      hud.hitMarker(killed, result.part === 'head');
      audio.hit(result.part === 'head');
    }
  }
  playerActor.lastShotAt = elapsed;
  audio.shot(weapon.id, 0);
  player.kick(weapon.recoilPitch * (player.state.crouching ? 0.82 : 1), (random() * 2 - 1) * weapon.recoilYaw);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.state.id);
}

function throwFrag() {
  if (arsenal.state.frags <= 0) return;
  arsenal.state.frags -= 1;
  const eye = player.eyePoint();
  const cosPitch = Math.cos(player.state.pitch);
  frags.push({
    x: eye.x, y: eye.y, z: eye.z,
    vx: -Math.sin(player.state.yaw) * cosPitch * 15,
    vy: Math.sin(player.state.pitch) * 15 + 3.4,
    vz: -Math.cos(player.state.yaw) * cosPitch * 15,
    fuse: GEAR.frag.fuse,
    mesh: null,
  });
  const last = frags[frags.length - 1];
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(MATERIALS.metal), roughness: 0.5, metalness: 0.6 }),
  );
  mesh.castShadow = true;
  scene.add(mesh);
  last.mesh = mesh;
  hud.setFrags(arsenal.state.frags);
  audio.swap();
}

function stepFrags(dt) {
  for (let index = frags.length - 1; index >= 0; index -= 1) {
    const frag = frags[index];
    frag.vy -= MOVE.gravity * dt;
    frag.x += frag.vx * dt;
    frag.y += frag.vy * dt;
    frag.z += frag.vz * dt;
    if (frag.y < 0.12) {
      frag.y = 0.12;
      frag.vy *= -0.32;
      frag.vx *= 0.6;
      frag.vz *= 0.6;
    }
    frag.fuse -= dt;
    frag.mesh.position.set(frag.x, frag.y, frag.z);
    if (frag.fuse <= 0) {
      combat.explode({ x: frag.x, y: frag.y, z: frag.z }, GEAR.frag.radius, GEAR.frag.damage, round.allActors(), events, playerActor);
      audio.explosion();
      hud.damageFlash();
      scene.remove(frag.mesh);
      frag.mesh.geometry.dispose();
      frags.splice(index, 1);
    }
  }
}

// ---------------------------------------------------------------- simulation step
function simulate(dt) {
  elapsed += dt;
  handleKeys();

  const buyPhase = round.state.phase === 'freeze';
  if (!buyPhase && hud.buyOpen) hud.closeBuy();

  const look = input.takeLook();
  if (playerActor.alive) player.look(look.x, look.y);
  player.step(dt, map.colliders, input.state.keys, buyPhase || !playerActor.alive);

  if (playerActor.alive && !buyPhase && !hud.buyOpen) {
    const weapon = arsenal.def();
    const down = input.state.firing;
    const pressedNow = down && !fireWasDown;
    if (down && (weapon.automatic || pressedNow)) fireOnce();
  }
  fireWasDown = input.state.firing;

  arsenal.step(dt, player.state.speed, player.state.crouching);
  bots.step(dt, elapsed, round.context, events);
  stepFrags(dt);
  combat.stepSparks(dt);
  round.step(dt, input.state.keys, elapsed);
  round.applyEvents(events);

  // Round events become sound, text and, for the player, a death.
  for (const event of events) {
    if (event.type !== 'kill') continue;
    const victim = event.actor;
    const killerName = event.owner ? (event.owner.name ?? 'You') : 'Breaker';
    hud.feed(`${killerName} → ${victim.name ?? 'You'} · ${event.part === 'head' ? 'head' : event.weapon}`);
    if (victim === playerActor) {
      stats.deaths += 1;
      hud.damageFlash();
      audio.roundEnd(false);
    }
    if (event.owner) event.owner.kills = (event.owner.kills ?? 0) + 1;
    victim.deaths = (victim.deaths ?? 0) + 1;
  }
  events.length = 0;

  // The HUD is written once per simulation step from the state, never from the renderer.
  hud.setVitals(playerActor.health, playerActor.armor);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.state.id);
  hud.setMoney(economy.money(playerActor));
  hud.setFrags(arsenal.state.frags);
  hud.setScore(round.state.score.vanguard, round.state.score.cordon);
  hud.setRound(round.state.round);
  hud.setTimer(round.state.timer, round.state.phase);
  hud.setBomb(round.state.bomb);
  hud.setCrosshairSpread(arsenal.spread(player.state.speed, player.state.crouching, !player.state.onGround));

  const bomb = round.state.bomb;
  if (bomb.carrier === playerActor && round.state.phase === 'live') {
    hud.setObjective(round.siteAt(player.state.position.x, player.state.position.z) ? 'Hold E to plant the breaker' : 'Carry the breaker to a site');
  } else if (bomb.planted && !bomb.defused && playerActor.team === 'vanguard') {
    hud.setObjective('Defend the breaker');
  } else if (bomb.planted && !bomb.defused) {
    hud.setObjective('Defuse the breaker — hold E');
  } else {
    hud.setObjective('');
  }
  if (bomb.plantProgress > 0 && round.state.phase === 'live') {
    hud.setProgress('PLANTING', bomb.plantProgress);
  } else if (bomb.defuseProgress > 0 && round.state.phase === 'planted') {
    hud.setProgress('DEFUSING', bomb.defuseProgress);
  } else {
    hud.setProgress('', 0);
  }

  if (round.state.phase !== lastPhase) {
    if (round.state.phase === 'live') {
      audio.roundStart();
      hud.banner('Round live', round.state.targetSite === 'A' ? 'Vanguard are hitting Tank Yard' : 'Vanguard are hitting the Freight House', 2.2);
    }
    if (round.state.phase === 'ended') {
      const won = round.state.winner === 'vanguard';
      audio.roundEnd(won);
      hud.banner(won ? 'Round won' : 'Round lost', round.state.message, 3);
      // Read the loser off the round's own message instead of inverting the winner: the message
      // is what the round module already authored, so bomb/timer endings stay untouched and only
      // a real elimination gets the wipe treatment.
      const wipe = /^(.+?) eliminated$/.exec(round.state.message ?? '');
      if (wipe) hud.setTeamWipe(wipe[1]);
      lastWinner = round.state.winner;
    }
    lastPhase = round.state.phase;
  }

  if (round.state.over && round.state.phase === 'over') {
    const won = round.state.score.vanguard > round.state.score.cordon;
    hud.showOverlay('end', {
      title: won ? 'Vanguard holds the yards' : 'Cordon holds the yards',
      copy: `Final score ${round.state.score.vanguard} — ${round.state.score.cordon}. Reload for a fresh match.`,
    });
    input.releaseLock();
  }
}

// ---------------------------------------------------------------- render
function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  camera.fov = arsenal.state.aiming ? 62 : 76;
  camera.updateProjectionMatrix();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 6) {
      simulate(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 6) accumulator = 0;
    syncCamera();
    hud.tick(dt);
    const spotted = new Set();
    for (const bot of bots.bots) {
      if (bot.team === 'cordon' && bot.target) spotted.add(bot);
    }
    hud.drawRadar(player.state, bots.bots, spotted, map, round.state.bomb);
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    resumeAudio();
  } else if (!round.state.over) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Tab') hud.showScoreboard(false);
});

hud.nodes.overlayAction.addEventListener('click', () => {
  if (shot) return;
  if (round.state.over) {
    round.state.over = false;
    round.state.round = 1;
    round.state.score.vanguard = 0;
    round.state.score.cordon = 0;
    round.state.roundHistory.length = 0;
    economy.reset();
    stats = { kills: 0, deaths: 0 };
    round.startRound();
  }
  input.requestLock();
});

// ---------------------------------------------------------------- deterministic capture
// A screenshot has to be the game's own render of a real state, so each capture stages a state the
// round can actually be in, then paints it twice and freezes. Nothing here is drawn by hand.
function stageShot(name) {
  hud.hideOverlay();
  hud.showScoreboard(false);
  round.state.phase = 'live';
  round.state.timer = 84;
  round.state.round = 4;
  round.state.score.vanguard = 2;
  round.state.score.cordon = 1;
  playerActor.health = 87;
  playerActor.armor = 64;
  arsenal.give('kessel');
  arsenal.state.mag = 23;
  arsenal.state.reserve = 61;
  arsenal.state.frags = 1;
  player.state.position.x = -20.4; player.state.position.y = 0; player.state.position.z = 6.2;
  player.state.yaw = -0.06;
  player.state.pitch = 0.02;
  player.state.crouching = false;

  const place = (bot, x, z, yaw, alive = true) => {
    bot.position.x = x;
    bot.position.z = z;
    bot.position.y = 0;
    bot.yaw = yaw;
    bot.alive = alive;
    bot.mesh.visible = alive;
    bot.mesh.position.set(x, 0, z);
    bot.mesh.rotation.y = yaw;
  };

  const cordon = bots.bots.filter((bot) => bot.team === 'cordon');
  const vanguard = bots.bots.filter((bot) => bot.team === 'vanguard');

  if (name === 'gun') {
    // Debug view: the view model alone on a plain background, so its geometry can be judged
    // instead of guessed at through the map's lighting.
    scene.background = new THREE.Color('#8d949c');
    scene.fog = null;
    for (const bot of bots.bots) { bot.mesh.visible = false; bot.alive = false; }
    for (const child of scene.children.slice()) {
      if (child.isMesh || child.isLight || child.isGroup) child.visible = false;
    }
    camera.add(new THREE.AmbientLight(new THREE.Color('#ffffff'), 2.2));
    const key = new THREE.DirectionalLight(new THREE.Color('#ffffff'), 2.4);
    key.position.set(1.2, 1.6, 0.8);
    camera.add(key);
    player.state.position.x = 0; player.state.position.y = 0; player.state.position.z = 0;
    player.state.yaw = 0; player.state.pitch = 0;
    hud.setVitals(100, 0); hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.state.id);
    hud.setScore(0, 0); hud.setRound(1); hud.setTimer(95, 'live');
    hud.setCrosshairSpread(0.004);
    syncCamera();
    arsenal.step(0.016, 0, false);
    let paintedGun = 0;
    function paintGun() {
      requestAnimationFrame(paintGun);
      syncCamera();
      renderer.render(scene, camera);
      paintedGun += 1;
      if (paintedGun === 2) { window.__shotReady = true; frozen = true; }
    }
    requestAnimationFrame(paintGun);
    return;
  }

  if (name === 'start') {
    hud.showOverlay('start');
    player.state.position.x = 0; player.state.position.y = 0; player.state.position.z = 44;
    player.state.yaw = 0;
    player.state.pitch = 0.02;
    // A start screen still has to show a populated radar, because an empty minimap reads as broken
    // rather than as pre-round. The bots are kept alive and visible and simply stood on their
    // spawns — a loose group of vanguard on the attacker apron and a loose group of cordon down
    // the yard — so the radar shows two clusters and the map reads as populated instead of dead.
    const vanguardSpawns = [-3, 1, 5, 9, -7];
    const cordonSpawns = [-4, 0, 4, 8, -8];
    for (let index = 0; index < vanguard.length; index += 1) {
      place(vanguard[index], vanguardSpawns[index % vanguardSpawns.length], 44, 0);
    }
    for (let index = 0; index < cordon.length; index += 1) {
      place(cordon[index], cordonSpawns[index % cordonSpawns.length], -38, 3.1);
    }
  } else if (name === 'buy') {
    round.state.phase = 'freeze';
    round.state.timer = 14;
    hud.setMoney(4300);
    hud.openBuy(4300, new Set(['kessel', 'plate']));
    player.state.position.x = -2.6; player.state.position.y = 0; player.state.position.z = 34;
    player.state.yaw = 0.2;
    player.state.pitch = -0.04;
    place(vanguard[0], -6, 30, 2.6);
    place(vanguard[1], 3, 31, 3.0);
    for (const bot of cordon) place(bot, 0, -20, 0, false);
  } else if (name === 'end') {
    round.state.phase = 'ended';
    round.state.winner = 'vanguard';
    round.state.message = 'Breaker detonated';
    round.state.timer = 3;
    round.state.round = 15;
    round.state.score.vanguard = 8;
    round.state.score.cordon = 6;
    hud.banner('Round won', 'Breaker detonated at the Freight House', 6);
    hud.feed('You → Warden · head');
    hud.feed('Kestrel → Pike · kessel');
    hud.feed('Bolt → Ferro · vespa');
    player.state.position.x = 30.5; player.state.position.y = 0; player.state.position.z = -30;
    player.state.yaw = 0.4;
    player.state.pitch = 0.0;
    for (const bot of cordon) place(bot, 30 + Math.random() * 6, -34 - Math.random() * 5, 2.4, false);
    place(vanguard[0], 33, -31, 0.8);
  } else {
    // play: the push into Tank Yard, with the breaker already down and the site contested.
    round.state.phase = 'planted';
    round.state.bomb.planted = true;
    round.state.bomb.x = -30;
    round.state.bomb.z = -33;
    round.state.bomb.fuse = 22;
    round.state.bomb.site = 'A';
    round.state.timer = 22;
    hud.setBomb(round.state.bomb);
    hud.banner('Breaker planted', 'Tank Yard — 22 seconds', 6);
    hud.feed('You → Warden · head');
    hud.feed('Kestrel → Pike · kessel');
    hud.feed('You → Dunn · kessel');
    // The cover shot stands where a player would hold the long lane: enemies at range, sky and haze
    // above the far wall, so the frame shows the map and not a wall. The vantage is open on purpose —
    // a camera jammed into a corner can only ever photograph that corner. The lane itself is only
    // eight metres wide between the two depot blocks, so the camera holds it from the open end of
    // the yard instead of standing inside it, where the walls would fill both edges of the frame.
    player.state.position.x = -20.4; player.state.position.y = 0; player.state.position.z = 40;
    player.state.yaw = -0.10;
    player.state.pitch = 0.10;
    arsenal.state.flashLeft = 0.0;
    arsenal.state.mag = 23;
    // The staged tracer is a real tracer from the real pool, so the screenshot shows what the game
    // actually draws: a burst leaving the muzzle and reaching for the cordon figure on the left flank.
    arsenal.state.flashLeft = 0.045;
    syncCamera();
    const muzzle = camera.getWorldPosition(new THREE.Vector3());
    combat.spawnTracer(muzzle.x, muzzle.y, muzzle.z, -28.5, 1.1, 25.0);
    // Two vanguard figures and three cordon figures at 17 to 26 units, spread across the frame and
    // all in clear line of sight, so they read as figures in depth instead of filling the frame.
    place(vanguard[0], -22.6, 20.1, -3.03);
    place(vanguard[1], -9.5, 26.9, 2.45);
    place(cordon[0], -28.5, 25.0, -2.65);
    place(cordon[1], -13.4, 18.1, 2.83);
    place(cordon[2], -17.8, 14.1, 3.04);
    for (const bot of cordon.slice(3)) place(bot, 0, -20, 0, false);
  }

  hud.setVitals(playerActor.health, playerActor.armor);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.state.id);
  hud.setScore(round.state.score.vanguard, round.state.score.cordon);
  hud.setRound(round.state.round);
  hud.setTimer(round.state.timer, round.state.phase);
  hud.setCrosshairSpread(0.006);
  hud.setObjective(name === 'play' ? 'Defend the breaker' : '');
  hud.drawRadar(player.state, bots.bots, new Set(), map, round.state.bomb);
  syncCamera();
  arsenal.step(0.016, 0, false);

  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

syncCamera();
if (shot) {
  hud.nodes.overlay.hidden = true;
  stageShot(shot);
} else {
  requestAnimationFrame(frame);
}
