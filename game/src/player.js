// player.js — the human fighter: pointer-lock look, acceleration-based
// movement with crouch, and an invisible pair of hitboxes that follow
// the camera so bot gunfire tests the player exactly like a bot.

import { collideCircle } from './map.js';
import { input, consumeLook, keyDown } from './input.js';
import { stepTrigger } from './combat.js';
import { startReload } from './weapons.js';
import { addNoise } from './state.js';

const WALK_SPEED = 4.6;
const CROUCH_SPEED = 2.15;
const ACCEL = 34;

// makePlayerHitboxes creates the player's head/body proxy meshes. They
// are never drawn (colour and depth writes off) but the gunfire raycast
// meets them like any bot's body.
export function makePlayerHitboxes(THREE, scene, player) {
  const ghost = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 10, 8), ghost);
  head.userData.part = 'head';
  head.userData.fighter = player;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.3), ghost);
  body.userData.part = 'body';
  body.userData.fighter = player;
  scene.add(head, body);
  return [head, body];
}

// syncPlayerHitboxes moves the proxies to the player's current pose.
export function syncPlayerHitboxes(player, meshes) {
  const [head, body] = meshes;
  const drop = player.crouch ? 0.34 : 0;
  head.position.set(player.pos.x, 1.58 - drop, player.pos.z);
  body.position.set(player.pos.x, 1.08 - drop * 0.7, player.pos.z);
  head.visible = body.visible = player.alive;
}

// stepPlayer advances the player one fixed step.
export function stepPlayer(state, world, dt) {
  const p = state.player;
  const sfx = world.sfx;
  if (!p.alive) { p.speedNow = 0; return; }

  // Look: mouse movement turns the view; pitch clamps at ±82°.
  if (input.enabled && input.locked) {
    const [dx, dy] = consumeLook();
    p.yaw -= dx * 0.0021;
    p.pitch = Math.max(-1.43, Math.min(1.43, p.pitch - dy * 0.0021));
  }

  const inBuy = state.phase === 'buy';
  p.crouch = keyDown('ControlLeft') || keyDown('ControlRight') || keyDown('KeyC');

  // Channel (planting) holds the player still; round.js owns the timer.
  // The player fights for Ember, the attacking squad, so planting is the
  // only channel they can run — defusing belongs to Ash bots.
  p.channeling = null;
  if (!inBuy && keyDown('KeyE') && p.hasCharge && state.plan?.site) {
    const s = state.plan.site;
    if (Math.hypot(s.plant.x - p.pos.x, s.plant.z - p.pos.z) < 1.8) p.channeling = 'plant';
  }

  // Movement: wish direction from keys, accelerated, wall-slid.
  let wx = 0, wz = 0;
  if (!inBuy && !p.channeling && input.enabled) {
    const f = (keyDown('KeyW') ? 1 : 0) - (keyDown('KeyS') ? 1 : 0);
    const r = (keyDown('KeyD') ? 1 : 0) - (keyDown('KeyA') ? 1 : 0);
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    wx = sy * f + cy * r;
    wz = cy * f - sy * r;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
  }
  const maxSpeed = p.crouch ? CROUCH_SPEED : WALK_SPEED;
  // Exponential approach to the wish velocity: snappy to start, a short
  // slide to stop — the slide is what movement-spread punishes.
  const k = 1 - Math.exp(-ACCEL * dt / 3.4);
  p.vel.x += (wx * maxSpeed - p.vel.x) * k;
  p.vel.z += (wz * maxSpeed - p.vel.z) * k;
  if (wx === 0 && wz === 0 && p.speedNow < 0.05) { p.vel.x = 0; p.vel.z = 0; }
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  collideCircle(p.pos, 0.36);
  p.speedNow = Math.hypot(p.vel.x, p.vel.z);

  // Footsteps: running is loud, crouch-walking is nearly silent.
  if (p.speedNow > 3.4 && !p.crouch) {
    if (state.time - (p.lastStepAt || 0) > 0.37) {
      p.lastStepAt = state.time;
      addNoise(state, p.pos.x, p.pos.z, 8, p.team);
    }
  }

  // Trigger and reload.
  const wantFire = input.enabled && input.firing && !inBuy;
  stepTrigger(state, world, p, wantFire);
  if (keyDown('KeyR')) startReload(state, p, sfx);
}
