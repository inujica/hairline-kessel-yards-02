// What a bullet does. One trace runs against the map and every body, and reports the nearest
// thing it met, which part it met and how far away it was; damage is that report turned into
// numbers. The player and the bots fire through this same function, so a bot's rifle and the
// player's rifle are the same rifle.
import * as THREE from 'three';
import { MATERIALS } from './palette.js';

// A body is three stacked boxes. The head is small on purpose: a headshot has to be earned.
export function bodyBoxes(actor) {
  const stand = actor.crouching ? 1.14 : 1.72;
  const headSize = 0.34;
  const top = actor.position.y + stand;
  return {
    head: {
      minX: actor.position.x - headSize / 2, maxX: actor.position.x + headSize / 2,
      minY: top - headSize, maxY: top,
      minZ: actor.position.z - headSize / 2, maxZ: actor.position.z + headSize / 2,
    },
    torso: {
      minX: actor.position.x - 0.3, maxX: actor.position.x + 0.3,
      minY: actor.position.y + stand * 0.45, maxY: top - headSize,
      minZ: actor.position.z - 0.22, maxZ: actor.position.z + 0.22,
    },
    legs: {
      minX: actor.position.x - 0.26, maxX: actor.position.x + 0.26,
      minY: actor.position.y, maxY: actor.position.y + stand * 0.45,
      minZ: actor.position.z - 0.2, maxZ: actor.position.z + 0.2,
    },
  };
}

function slab(origin, direction, box) {
  let tMin = 0;
  let tMax = Infinity;
  const axes = [
    [origin.x, direction.x, box.minX, box.maxX],
    [origin.y, direction.y, box.minY, box.maxY],
    [origin.z, direction.z, box.minZ, box.maxZ],
  ];
  for (let index = 0; index < 3; index += 1) {
    const [start, dir, lo, hi] = axes[index];
    if (Math.abs(dir) < 1e-8) {
      if (start < lo || start > hi) return null;
      continue;
    }
    let t1 = (lo - start) / dir;
    let t2 = (hi - start) / dir;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  return tMin;
}

// Nearest body part along the ray, ignoring the shooter's own team and dead bodies.
export function traceActors(origin, direction, range, actors, ignoreTeam, ignoreActor) {
  let best = null;
  for (let index = 0; index < actors.length; index += 1) {
    const actor = actors[index];
    if (actor === ignoreActor || !actor.alive || actor.team === ignoreTeam) continue;
    const boxes = bodyBoxes(actor);
    for (const part of ['head', 'torso', 'legs']) {
      const hit = slab(origin, direction, boxes[part]);
      if (hit === null || hit < 0.05 || hit > range) continue;
      if (!best || hit < best.distance) best = { actor, part, distance: hit };
    }
  }
  return best;
}

export function createCombat(scene) {
  // Impacts are pooled: a burst of automatic fire must not allocate a mesh per bullet.
  const sparkGeometry = new THREE.SphereGeometry(0.045, 5, 4);
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(MATERIALS.lamp) });
  const sparks = [];
  for (let index = 0; index < 48; index += 1) {
    const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let sparkCursor = 0;

  function spawnSpark(x, y, z, nx, nz) {
    const spark = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % sparks.length;
    spark.mesh.position.set(x, y, z);
    spark.mesh.visible = true;
    spark.life = 0.22;
    spark.vx = nx * 1.4 + (Math.random() - 0.5) * 1.2;
    spark.vy = Math.random() * 1.6;
    spark.vz = nz * 1.4 + (Math.random() - 0.5) * 1.2;
  }

  function stepSparks(dt) {
    for (let index = 0; index < sparks.length; index += 1) {
      const spark = sparks[index];
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.mesh.position.x += spark.vx * dt;
      spark.mesh.position.y += spark.vy * dt;
      spark.mesh.position.z += spark.vz * dt;
      spark.vy -= 9 * dt;
      if (spark.life <= 0) spark.mesh.visible = false;
    }
  }

  // Distance falloff is linear to the weapon's own falloff range and then flat, so a shotgun is a
  // room weapon and the Longline is not.
  function damageAt(weapon, distance) {
    if (distance <= weapon.falloffAt) return weapon.damage;
    const span = Math.max(1, weapon.range - weapon.falloffAt);
    const t = Math.min(1, (distance - weapon.falloffAt) / span);
    return weapon.damage * (1 - (1 - weapon.falloffTo) * t);
  }

  function applyDamage(actor, raw, part, weapon, events) {
    const multiplier = part === 'head' ? weapon.headMultiplier : part === 'legs' ? weapon.legMultiplier : 1;
    let damage = raw * multiplier;
    if (actor.armor > 0) {
      const absorbed = damage * 0.45;
      actor.armor = Math.max(0, actor.armor - absorbed * 0.8);
      damage -= absorbed;
    }
    actor.health = Math.max(0, actor.health - damage);
    if (actor.health <= 0 && actor.alive) {
      actor.alive = false;
      events.push({ type: 'kill', actor, part, weapon: weapon.id });
    }
    return damage;
  }

  // One shot: the wall stops the bullet, and a body in front of the wall stops it first.
  function fire(map, origin, direction, weapon, actors, shooter, events) {
    const wall = map.raycast(origin, direction, weapon.range);
    const body = traceActors(origin, direction, Math.min(wall.hit ? wall.distance : weapon.range, weapon.range), actors, shooter.team, shooter);
    if (body) {
      const point = {
        x: origin.x + direction.x * body.distance,
        y: origin.y + direction.y * body.distance,
        z: origin.z + direction.z * body.distance,
      };
      spawnSpark(point.x, point.y, point.z, 0, 0);
      const raw = damageAt(weapon, body.distance);
      const dealt = applyDamage(body.actor, raw, body.part, weapon, events);
      return { hit: true, actor: body.actor, part: body.part, damage: dealt, distance: body.distance, point };
    }
    if (wall.hit && wall.distance < weapon.range) {
      spawnSpark(
        origin.x + direction.x * wall.distance,
        origin.y + direction.y * wall.distance,
        origin.z + direction.z * wall.distance,
        wall.normalX, wall.normalZ,
      );
      return { hit: false, distance: wall.distance };
    }
    return { hit: false, distance: weapon.range };
  }

  // A frag does not need a line of sight to the floor, only a distance, and it hurts the thrower
  // too — which is what makes a bad grenade a real mistake.
  function explode(center, radius, damage, actors, events, owner) {
    for (let index = 0; index < actors.length; index += 1) {
      const actor = actors[index];
      if (!actor.alive) continue;
      const dx = actor.position.x - center.x;
      const dy = (actor.position.y + 1) - center.y;
      const dz = actor.position.z - center.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > radius) continue;
      const falloff = 1 - distance / radius;
      const dealt = damage * falloff * falloff;
      actor.health = Math.max(0, actor.health - dealt);
      if (actor.health <= 0 && actor.alive) {
        actor.alive = false;
        events.push({ type: 'kill', actor, part: 'torso', weapon: 'frag', owner });
      }
    }
  }

  return { fire, explode, stepSparks, traceActors, bodyBoxes };
}
