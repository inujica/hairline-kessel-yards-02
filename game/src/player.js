// The player's body: acceleration and friction on the ground, weaker air control, crouch that
// cannot stand up under geometry, and a box that is resolved one axis at a time so a wall never
// swallows it. Rendering reads `state`; nothing here touches three.js's camera.
import { MOVE } from './config.js';

export function createPlayer(spawn) {
  const state = {
    position: { x: spawn.x, y: spawn.y ?? 0, z: spawn.z },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw,
    pitch: 0,
    eye: MOVE.standEye,
    height: MOVE.standHeight,
    crouching: false,
    onGround: true,
    alive: true,
    speed: 0,
    bob: 0,
    stepPhase: 0,
  };
  let stepCallback = null;
  let landingCallback = null;

  function overlaps(colliders, x, y, z, height, lift) {
    const r = MOVE.radius;
    const minX = x - r;
    const maxX = x + r;
    const minY = y + lift;
    const maxY = y + height - lift;
    const minZ = z - r;
    const maxZ = z + r;
    for (let index = 0; index < colliders.length; index += 1) {
      const box = colliders[index];
      if (minX < box.maxX && maxX > box.minX
        && minY < box.maxY && maxY > box.minY
        && minZ < box.maxZ && maxZ > box.minZ) return box;
    }
    return null;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function kick(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function respawn(point) {
    state.position.x = point.x;
    state.position.y = point.y;
    state.position.z = point.z;
    state.velocity.x = 0;
    state.velocity.y = 0;
    state.velocity.z = 0;
    state.yaw = point.yaw;
    state.pitch = 0;
    state.eye = MOVE.standEye;
    state.height = MOVE.standHeight;
    state.crouching = false;
    state.alive = true;
    state.onGround = true;
    state.bob = 0;
  }

  // `frozen` is the buy phase: the body still settles onto the floor and still looks around, but
  // it takes no input, so a round always starts from the same footing.
  function step(dt, colliders, keys, frozen) {
    const wantCrouch = !frozen && (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      state.height = MOVE.crouchHeight;
    } else if (!wantCrouch && state.crouching
      && !overlaps(colliders, state.position.x, state.position.y, state.position.z, MOVE.standHeight, 0.03)) {
      state.crouching = false;
      state.height = MOVE.standHeight;
    }
    const eyeTarget = state.crouching ? MOVE.crouchEye : MOVE.standEye;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 13);

    let wishX = 0;
    let wishZ = 0;
    if (!frozen) {
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      if (forward || strafe) {
        const sin = Math.sin(state.yaw);
        const cos = Math.cos(state.yaw);
        wishX = -sin * forward + cos * strafe;
        wishZ = -cos * forward - sin * strafe;
        const length = Math.hypot(wishX, wishZ) || 1;
        wishX /= length;
        wishZ /= length;
      }
    }

    const topSpeed = state.crouching ? MOVE.crouchSpeed : MOVE.walkSpeed;
    const accel = state.onGround ? MOVE.groundAccel : MOVE.airAccel;
    const blend = Math.min(1, accel * dt / topSpeed);
    state.velocity.x += (wishX * topSpeed - state.velocity.x) * blend;
    state.velocity.z += (wishZ * topSpeed - state.velocity.z) * blend;
    if (state.onGround && !wishX && !wishZ) {
      const damp = Math.max(0, 1 - MOVE.friction * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }

    const wasAir = !state.onGround;
    if (!frozen && keys.has('Space') && state.onGround) {
      state.velocity.y = MOVE.jumpSpeed;
      state.onGround = false;
    }
    state.velocity.y -= MOVE.gravity * dt;

    const nextX = state.position.x + state.velocity.x * dt;
    if (!overlaps(colliders, nextX, state.position.y, state.position.z, state.height, 0.05)) {
      state.position.x = nextX;
    } else {
      state.velocity.x = 0;
    }
    const nextZ = state.position.z + state.velocity.z * dt;
    if (!overlaps(colliders, state.position.x, state.position.y, nextZ, state.height, 0.05)) {
      state.position.z = nextZ;
    } else {
      state.velocity.z = 0;
    }

    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hit = overlaps(colliders, state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hit && state.velocity.y <= 0) {
      state.position.y = hit.maxY;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (hit) {
      state.position.y = hit.minY - state.height;
      state.velocity.y = 0;
    }
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    state.velocity.y = Math.max(-MOVE.maxFall, state.velocity.y);

    state.speed = Math.hypot(state.velocity.x, state.velocity.z);
    if (wasAir && state.onGround && landingCallback) landingCallback(state.speed);

    // Footsteps follow distance walked rather than time, so a walking player and a running player
    // both sound right, and a crouching player is nearly silent.
    if (state.onGround && state.speed > 0.6) {
      state.stepPhase += state.speed * dt;
      const stride = state.crouching ? 3.4 : 2.15;
      if (state.stepPhase > stride) {
        state.stepPhase = 0;
        if (stepCallback) stepCallback(state.crouching ? 0.25 : Math.min(1, state.speed / MOVE.walkSpeed));
      }
      state.bob += state.speed * dt * 1.7;
    } else {
      state.stepPhase = Math.min(state.stepPhase, 1.2);
    }
  }

  return {
    state,
    step,
    look,
    kick,
    respawn,
    onStep(callback) { stepCallback = callback; },
    onLand(callback) { landingCallback = callback; },
    eyePoint() {
      return { x: state.position.x, y: state.position.y + state.eye, z: state.position.z };
    },
  };
}
