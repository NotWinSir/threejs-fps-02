// input.js — keyboard and mouse state for the player. The simulation
// polls this module each step; it never acts on events directly, which
// keeps input timing inside the fixed-step loop.

export const input = {
  keys: new Set(),
  lookDX: 0, lookDY: 0,   // mouse movement accumulated since last step
  firing: false,
  locked: false,
  enabled: true,          // shot-mode staging turns this off
};

// initInput wires the listeners. onKey(code) fires for discrete presses
// (reload, buy keys, grenade) so the game can react once per tap.
export function initInput(dom, onKey) {
  const canvas = dom.renderer.domElement;
  dom.overlayPlay?.addEventListener('click', () => canvas.requestPointerLock());
  canvas.addEventListener('click', () => {
    if (input.enabled && !input.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX || 0;
    input.lookDY += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (input.locked && e.button === 0) input.firing = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    onKey(e.code);
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.firing = false; });
}

// consumeLook returns the accumulated mouse movement and clears it.
export function consumeLook() {
  const dx = input.lookDX, dy = input.lookDY;
  input.lookDX = 0; input.lookDY = 0;
  return [dx, dy];
}

export function keyDown(code) {
  return input.keys.has(code);
}
