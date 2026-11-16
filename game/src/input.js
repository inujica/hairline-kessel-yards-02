// One place for what the player is pressing and how far the mouse moved since the last frame.
// The simulation reads `state.keys`; the frame loop drains the accumulated look with takeLook(),
// so a fast mouse never applies twice in one tick.

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC',
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
]);

export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    firing: false,
    locked: false,
    lookX: 0,
    lookY: 0,
    wheel: 0,
  };
  const pressed = [];

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    pressed.push(event.code);
    if (MOVE_KEYS.has(event.code) || event.code === 'Tab') event.preventDefault();
  }

  function onKeyUp(event) {
    state.keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }

  function onMouseDown(event) {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  }

  function onWheel(event) {
    if (!state.locked) return;
    state.wheel += Math.sign(event.deltaY);
  }

  function onLockEvent() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.firing = false;
      state.aiming = false;
      state.keys.clear();
    }
    onLockChange(state.locked);
  }

  function onBlur() {
    state.keys.clear();
    state.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', onLockEvent);

  return {
    state,
    requestLock() {
      const request = canvas.requestPointerLock?.();
      if (request && typeof request.catch === 'function') request.catch(() => {});
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Look is drained, never accumulated across frames, so one frame of mouse motion is applied
    // exactly once even when the render rate outruns the tick rate.
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    takeWheel() {
      const out = state.wheel;
      state.wheel = 0;
      return out;
    },
    // A key that went down this frame: used for buy-menu and weapon-switch edges that must not
    // repeat while the key is held.
    takePressed() {
      if (!pressed.length) return null;
      const out = pressed.slice();
      pressed.length = 0;
      return out;
    },
    setKey(code, down) {
      if (down) {
        state.keys.add(code);
        pressed.push(code);
      } else {
        state.keys.delete(code);
      }
    },
  };
}
