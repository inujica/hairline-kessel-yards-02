// The other nine players. Each bot is a body, a rifle and a small set of intentions: take ground,
// hold an angle, push the site, plant, defuse, or fight what it can see. Paths come from an A*
// search over the map's own waypoints, so a bot walks the lanes a person walks and never through
// a crate.
import * as THREE from 'three';
import { BOT, WEAPONS, MATCH } from './config.js';
import { MATERIALS } from './palette.js';
import { bodyBoxes } from './combat.js';

const EYE = 1.58;

// A dark rifle against a lighter uniform is what makes a distant bot read as armed, which is how a
// player decides whether to shoot. Sharing the vest's `plate` material dissolved the weapon into the
// body at range and left nothing but a coloured slab on the skyline.
const GUN_MATERIAL = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#1b1c1f'), roughness: 0.55, metalness: 0.35,
});

function buildBody(team, name) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'vanguard' ? '#7f97a8' : '#9d4f38'),
    roughness: 0.88, metalness: 0.03,
  });
  const plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(MATERIALS.metal), roughness: 0.5, metalness: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(MATERIALS.timber), roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), cloth);
  torso.position.y = 1.16;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.38), plate);
  vest.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.66;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), cloth);
  helmet.position.y = 1.8;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), cloth);
  legL.position.set(-0.14, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), cloth);
  armL.position.set(-0.36, 1.16, -0.04);
  const armR = armL.clone();
  armR.position.x = 0.36;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.7), GUN_MATERIAL);
  gun.position.set(0.2, 1.12, -0.4);
  // A pack and two shoulder pads: at 40 metres the silhouette is what tells you whose back you
  // are looking at, so each team gets a different outline, not just a different tint.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.2), plate);
  pack.position.set(0, 1.2, 0.24);
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), cloth);
  padL.position.set(-0.33, 1.42, 0);
  const padR = padL.clone();
  padR.position.x = 0.33;
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.06, 0.34),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'vanguard' ? '#b6cbd9' : '#d98a5c'),
      roughness: 0.7, emissive: new THREE.Color(team === 'vanguard' ? '#22303a' : '#4a2415'),
      emissiveIntensity: 0.7,
    }),
  );
  band.position.y = 1.74;
  group.add(torso, vest, head, helmet, legL, legR, armL, armR, gun, pack, padL, padR, band);
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a0d10'), transparent: true, opacity: 0.42, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  group.add(contact);
  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  group.userData.parts = { legL, legR, armL, armR, head };
  group.userData.name = name;
  return group;
}

// A* over the waypoint graph. The heuristic is straight-line distance, which never overestimates
// because every edge is at least that long, so the first path out is the shortest one.
function findPath(map, fromIndex, toIndex) {
  if (fromIndex === toIndex) return [toIndex];
  const nodes = map.waypoints;
  const open = [fromIndex];
  const cameFrom = new Map();
  const cost = new Map([[fromIndex, 0]]);
  const guess = new Map([[fromIndex, Math.hypot(nodes[fromIndex].x - nodes[toIndex].x, nodes[fromIndex].z - nodes[toIndex].z)]]);
  const closed = new Set();

  while (open.length) {
    let bestAt = 0;
    for (let index = 1; index < open.length; index += 1) {
      if ((guess.get(open[index]) ?? Infinity) < (guess.get(open[bestAt]) ?? Infinity)) bestAt = index;
    }
    const current = open.splice(bestAt, 1)[0];
    if (current === toIndex) {
      const path = [current];
      let walk = current;
      while (cameFrom.has(walk)) {
        walk = cameFrom.get(walk);
        path.unshift(walk);
      }
      return path;
    }
    closed.add(current);
    for (const edge of map.edges[current]) {
      if (closed.has(edge.to)) continue;
      const tentative = (cost.get(current) ?? Infinity) + edge.cost;
      if (tentative < (cost.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        cost.set(edge.to, tentative);
        guess.set(edge.to, tentative + Math.hypot(nodes[edge.to].x - nodes[toIndex].x, nodes[edge.to].z - nodes[toIndex].z));
        if (!open.includes(edge.to)) open.push(edge.to);
      }
    }
  }
  return [fromIndex];
}

function nearestWaypoint(map, x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < map.waypoints.length; index += 1) {
    const node = map.waypoints[index];
    const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

export function createBots(scene, map, combat) {
  const bots = [];

  function makeBot(team, index, name) {
    const mesh = buildBody(team, name);
    scene.add(mesh);
    return {
      id: `${team}-${index}`,
      name,
      team,
      mesh,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      health: 100,
      armor: 0,
      alive: false,
      crouching: false,
      weapon: 'kessel',
      ammo: 30,
      reserve: 90,
      cooldown: 0,
      reloadLeft: 0,
      // intentions
      path: [],
      pathIndex: 0,
      goal: null,
      role: 'hold',
      target: null,
      seenAt: 0,
      reactionLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeLeft: 0,
      repathLeft: 0,
      thinkLeft: 0,
      lastSeen: null,
      holdIndex: 0,
      plantedCarrier: false,
    };
  }

  const names = {
    vanguard: ['Kestrel', 'Bolt', 'Marlow', 'Sable'],
    cordon: ['Warden', 'Ferro', 'Pike', 'Ash', 'Dunn'],
  };
  for (let index = 0; index < 4; index += 1) bots.push(makeBot('vanguard', index, names.vanguard[index]));
  for (let index = 0; index < 5; index += 1) bots.push(makeBot('cordon', index, names.cordon[index]));

  function setGoal(bot, x, z) {
    const from = nearestWaypoint(map, bot.position.x, bot.position.z);
    const to = nearestWaypoint(map, x, z);
    bot.path = findPath(map, from, to);
    bot.pathIndex = 0;
    bot.goal = { x, z };
  }

  function spawn(bot, point) {
    bot.position.x = point.x;
    bot.position.y = 0;
    bot.position.z = point.z;
    bot.yaw = point.yaw;
    bot.pitch = 0;
    bot.health = 100;
    bot.armor = 0;
    bot.alive = true;
    bot.crouching = false;
    bot.ammo = WEAPONS.kessel.magazine;
    bot.reserve = WEAPONS.kessel.reserve;
    bot.cooldown = 0;
    bot.reloadLeft = 0;
    bot.path = [];
    bot.pathIndex = 0;
    bot.target = null;
    bot.lastSeen = null;
    bot.burstLeft = 0;
    bot.burstPause = 0;
    bot.repathLeft = 0;
    bot.thinkLeft = 0;
    bot.plantedCarrier = false;
    bot.mesh.visible = true;
    bot.mesh.position.set(bot.position.x, 0, bot.position.z);
  }

  // Perception: a body inside the cone and in the open is seen; a body that fired nearby is heard
  // even from behind, which is why a noisy push into a held site goes wrong.
  function perceive(bot, actor, now) {
    if (!actor.alive) return false;
    const dx = actor.position.x - bot.position.x;
    const dz = actor.position.z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > BOT.engageRange) return false;
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    const dot = (dx * forwardX + dz * forwardZ) / (distance || 1);
    const halfAngle = Math.cos((BOT.fovDegrees / 2) * Math.PI / 180);
    const seenByFov = dot >= halfAngle;
    const heard = now - (actor.lastShotAt ?? -99) < 0.6 && distance < BOT.hearingMetres;
    if (!seenByFov && !heard) return false;
    const eye = { x: bot.position.x, y: bot.position.y + EYE, z: bot.position.z };
    const targetEye = { x: actor.position.x, y: actor.position.y + (actor.crouching ? 1.0 : 1.45), z: actor.position.z };
    const dir = {
      x: targetEye.x - eye.x, y: targetEye.y - eye.y, z: targetEye.z - eye.z,
    };
    const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= length; dir.y /= length; dir.z /= length;
    const wall = map.raycast(eye, dir, length);
    if (wall.hit && wall.distance < length - 0.35) return false;
    return true;
  }

  function aimAt(bot, x, y, z, dt) {
    const eye = { x: bot.position.x, y: bot.position.y + EYE, z: bot.position.z };
    const dx = x - eye.x;
    const dy = y - eye.y;
    const dz = z - eye.z;
    const wantedYaw = Math.atan2(-dx, -dz);
    const wantedPitch = Math.asin(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy, dz) || 1))));
    let deltaYaw = wantedYaw - bot.yaw;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    const turn = Math.min(1, BOT.aimSpeed * dt);
    bot.yaw += deltaYaw * turn;
    bot.pitch += (wantedPitch - bot.pitch) * turn;
  }

  function walkTowards(bot, x, z, dt, speedScale) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.35) return true;
    const speed = (bot.crouching ? 2.4 : 5.0) * (speedScale ?? 1);
    const stepX = (dx / distance) * speed * dt;
    const stepZ = (dz / distance) * speed * dt;
    const radius = 0.34;
    function blocked(nx, nz) {
      for (let index = 0; index < map.colliders.length; index += 1) {
        const box = map.colliders[index];
        if (box.maxY < 0.4) continue;
        if (nx + radius > box.minX && nx - radius < box.maxX
          && nz + radius > box.minZ && nz - radius < box.maxZ
          && box.minY < 1.6 && box.maxY > 0.3) return true;
      }
      return false;
    }
    if (!blocked(bot.position.x + stepX, bot.position.z)) bot.position.x += stepX;
    if (!blocked(bot.position.x, bot.position.z + stepZ)) bot.position.z += stepZ;
    return distance < 0.5;
  }

  function followPath(bot, dt, speedScale) {
    if (!bot.path.length) return true;
    const node = map.waypoints[bot.path[bot.pathIndex]];
    if (!node) return true;
    const arrived = walkTowards(bot, node.x, node.z, dt, speedScale);
    if (arrived) {
      bot.pathIndex += 1;
      if (bot.pathIndex >= bot.path.length) {
        bot.path = [];
        return true;
      }
    }
    // Face the way we walk when nothing is being shot at.
    if (!bot.target) {
      const ahead = map.waypoints[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
      if (ahead) {
        const wanted = Math.atan2(-(ahead.x - bot.position.x), -(ahead.z - bot.position.z));
        let delta = wanted - bot.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        bot.yaw += delta * Math.min(1, dt * 7);
      }
    }
    return false;
  }

  function shoot(bot, target, dt, now, events) {
    if (bot.reloadLeft > 0) return;
    if (bot.ammo <= 0) {
      bot.reloadLeft = WEAPONS[bot.weapon].reload;
      return;
    }
    if (bot.cooldown > 0) return;
    if (bot.burstPause > 0) return;
    const weapon = WEAPONS[bot.weapon];
    const eye = { x: bot.position.x, y: bot.position.y + EYE, z: bot.position.z };
    const aimPoint = {
      x: target.position.x + (Math.random() - 0.5) * BOT.aimJitter * 12,
      y: target.position.y + (target.crouching ? 0.9 : 1.32) + (Math.random() - 0.5) * BOT.aimJitter * 8,
      z: target.position.z + (Math.random() - 0.5) * BOT.aimJitter * 12,
    };
    const dx = aimPoint.x - eye.x;
    const dy = aimPoint.y - eye.y;
    const dz = aimPoint.z - eye.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const direction = { x: dx / length, y: dy / length, z: dz / length };
    const spread = weapon.spreadStill * 1.6 + weapon.spreadMoving * 0.25;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    const norm = Math.hypot(direction.x, direction.y, direction.z) || 1;
    direction.x /= norm; direction.y /= norm; direction.z /= norm;

    bot.ammo -= 1;
    bot.cooldown = weapon.interval;
    bot.lastShotAt = now;
    combat.fire(map, eye, direction, weapon, actorsFor(bot), bot, events);
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = BOT.burstShots[0] + Math.floor(Math.random() * (BOT.burstShots[1] - BOT.burstShots[0] + 1));
      bot.burstPause = BOT.burstPause[0] + Math.random() * (BOT.burstPause[1] - BOT.burstPause[0]);
    }
  }

  let externalActors = [];
  function actorsFor() {
    return externalActors;
  }

  function setActors(list) {
    externalActors = list;
  }

  function stepBot(bot, dt, now, ctx, events) {
    if (!bot.alive) return;
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) {
        const room = WEAPONS[bot.weapon].magazine - bot.ammo;
        const taken = Math.min(room, bot.reserve);
        bot.ammo += taken;
        bot.reserve -= taken;
        bot.reloadLeft = 0;
      }
    }

    bot.thinkLeft -= dt;
    if (bot.thinkLeft <= 0) {
      bot.thinkLeft = BOT.thinkSeconds;
      // Pick the nearest visible enemy; keep the last one for a moment after it breaks line.
      let nearest = null;
      let nearestDistance = Infinity;
      for (const actor of externalActors) {
        if (actor === bot || !actor.alive || actor.team === bot.team) continue;
        if (!perceive(bot, actor, now)) continue;
        const distance = Math.hypot(actor.position.x - bot.position.x, actor.position.z - bot.position.z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = actor;
        }
      }
      if (nearest) {
        if (bot.target !== nearest) bot.reactionLeft = BOT.reactionSeconds + Math.random() * BOT.reactionJitter;
        bot.target = nearest;
        bot.lastSeen = { x: nearest.position.x, z: nearest.position.z, at: now };
        if (Math.random() < BOT.strafeChance) {
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
          bot.strafeLeft = 0.5 + Math.random();
        }
      } else if (bot.lastSeen && now - bot.lastSeen.at > 1.6) {
        bot.target = null;
        bot.lastSeen = null;
      } else if (!bot.lastSeen) {
        bot.target = null;
      }

      // Intentions, re-decided on the same slow clock so the bots do not jitter.
      if (ctx.phase === 'live' || ctx.phase === 'planted') {
        const objective = ctx.objectiveFor(bot);
        if (objective && (!bot.goal || Math.hypot(bot.goal.x - objective.x, bot.goal.z - objective.z) > 3)) {
          setGoal(bot, objective.x, objective.z);
          bot.role = ctx.roleFor(bot);
        }
      }
    }

    const engaging = bot.target && bot.target.alive;
    if (engaging) {
      const target = bot.target;
      aimAt(bot, target.position.x, target.position.y + (target.crouching ? 0.95 : 1.4), target.position.z, dt);
      bot.reactionLeft = Math.max(0, bot.reactionLeft - dt);
      if (bot.reactionLeft <= 0) shoot(bot, target, dt, now, events);
      // A bot that stands perfectly still while shooting is a free kill; it sidesteps instead.
      if (bot.strafeLeft > 0) {
        bot.strafeLeft -= dt;
        const sideX = Math.cos(bot.yaw) * bot.strafeDir;
        const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
        const nextX = bot.position.x + sideX * dt * 2.6;
        const nextZ = bot.position.z + sideZ * dt * 2.6;
        let blocked = false;
        for (const box of map.colliders) {
          if (box.maxY < 0.4) continue;
          if (nextX + 0.34 > box.minX && nextX - 0.34 < box.maxX
            && nextZ + 0.34 > box.minZ && nextZ - 0.34 < box.maxZ) { blocked = true; break; }
        }
        if (!blocked) {
          bot.position.x = nextX;
          bot.position.z = nextZ;
        } else {
          bot.strafeDir *= -1;
        }
      }
    } else if (bot.lastSeen && now - bot.lastSeen.at < 1.6) {
      aimAt(bot, bot.lastSeen.x, 1.3, bot.lastSeen.z, dt);
      followPath(bot, dt, 1);
    } else {
      const done = followPath(bot, dt, ctx.phase === 'live' ? 1 : 0.9);
      if (done) {
        // At the goal: hold the angle, sweeping slowly so the site is not watched through a straw.
        const sweep = Math.sin(now * 0.55 + bot.holdIndex) * 0.42;
        const base = ctx.holdYawFor(bot);
        if (typeof base === 'number') {
          let delta = (base + sweep) - bot.yaw;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          bot.yaw += delta * Math.min(1, dt * 2.2);
        }
      }
    }

    // Planting and defusing are progress, not a dice roll: the bot stands still and the round
    // clock advances the action.
    if (ctx.phase === 'live' && bot.team === 'vanguard' && ctx.bomb.carrier === bot) {
      const site = ctx.siteAt(bot.position.x, bot.position.z);
      if (site) ctx.onPlantProgress(bot, dt, site);
    }
    if (ctx.phase === 'planted' && bot.team === 'cordon' && ctx.bomb.planted) {
      const distance = Math.hypot(bot.position.x - ctx.bomb.x, bot.position.z - ctx.bomb.z);
      if (distance < 1.8) ctx.onDefuseProgress(bot, dt);
    }

    // Presentation: legs swing with speed, the body turns to its yaw.
    bot.mesh.position.set(bot.position.x, 0, bot.position.z);
    bot.mesh.rotation.y = bot.yaw;
    const parts = bot.mesh.userData.parts;
    const speed = Math.hypot(bot.position.x - (bot.prevX ?? bot.position.x), bot.position.z - (bot.prevZ ?? bot.position.z)) / Math.max(dt, 1e-4);
    const swing = Math.sin(now * 9) * Math.min(0.5, speed * 0.16);
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.5;
    parts.armR.rotation.x = swing * 0.5;
    bot.prevX = bot.position.x;
    bot.prevZ = bot.position.z;
  }

  return {
    bots,
    setActors,
    spawn,
    setGoal,
    step(dt, now, ctx, events) {
      for (let index = 0; index < bots.length; index += 1) stepBot(bots[index], dt, now, ctx, events);
    },
    aliveCount(team) {
      let count = 0;
      for (const bot of bots) if (bot.team === team && bot.alive) count += 1;
      return count;
    },
    resetHold(index) {
      for (const bot of bots) bot.holdIndex = index * 0.7 + Math.random() * 0.6;
    },
    findPath,
    nearestWaypoint,
  };
}
