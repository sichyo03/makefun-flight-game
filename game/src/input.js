// Controls: arrows or A/D bank the wings, Up/Down work the elevator, W/S (or Shift/Ctrl)
// move the throttle, Space drops the crate, B brakes, P pauses. A pointer can steer too:
// hold the left or right side to bank, the top or bottom to pitch, tap to confirm/drop.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const KEYMAP = {
  ArrowUp: 'pitchUp',
  ArrowDown: 'pitchDown',
  ArrowLeft: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyA: 'rollLeft',
  KeyD: 'rollRight',
  KeyW: 'throttleUp',
  KeyS: 'throttleDown',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  KeyB: 'brake',
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let dropQueued = false;
  let pointer = null; // { x, y, id } in canvas fractions while a pointer is held

  function onKeyDown(event) {
    const name = KEYMAP[event.code];
    if (name) {
      held.add(name);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      dropQueued = true;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyR') {
      actions |= ACTION_RESTART;
    }
  }

  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name) held.delete(name);
  }

  function onPointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      id: event.pointerId,
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      moved: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width;
    pointer.y = (event.clientY - rect.top) / rect.height;
    pointer.moved = true;
  }

  function onPointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.moved) {
      actions |= ACTION_CONFIRM;
      dropQueued = true;
    }
    pointer = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', () => held.clear());

  return {
    /** The flight controls for this step; `drop` is true once per press. */
    read() {
      let pitch = (held.has('pitchUp') ? 1 : 0) - (held.has('pitchDown') ? 1 : 0);
      let roll = (held.has('rollRight') ? 1 : 0) - (held.has('rollLeft') ? 1 : 0);
      let throttle = (held.has('throttleUp') ? 1 : 0) - (held.has('throttleDown') ? 1 : 0);
      if (pointer) {
        if (pointer.x < 0.38) roll = -1;
        else if (pointer.x > 0.62) roll = 1;
        if (pointer.y < 0.38) pitch = 1;
        else if (pointer.y > 0.62) pitch = -1;
        if (pointer.y < 0.2) throttle = 1;
      }
      const drop = dropQueued;
      dropQueued = false;
      return { pitch, roll, throttle, brake: held.has('brake') || held.has('throttleDown'), drop };
    },
    /** Edge-triggered screen actions, consumed by the caller. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
