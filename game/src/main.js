// main.js — boot and the fixed-step loop. It assembles the world (scene,
// materials, fighters, hit targets), then runs the simulation at 60 Hz
// behind requestAnimationFrame: player, bots, grenades and the round
// director step together, rendering reads the result. A ?shot= hook
// stages deterministic scenes for the entry's screenshots.

import * as THREE from 'three';
import { PALETTE, makeMaterials } from './palette.js';
import { buildMap, sightBlocked, collideCircle } from './map.js';
import { createState, PHASE } from './state.js';
import { SoundFX } from './audio.js';
import { initInput, input } from './input.js';
import { grabDom, updateHud } from './hud.js';
import { setupMatch, startRound, stepRound, buyItem } from './round.js';
import { stepBots, syncBotMeshes } from './bots.js';
import { stepPlayer, makePlayerHitboxes, syncPlayerHitboxes } from './player.js';
import {
  makeTracerPool, stepTracers, stepGrenades, stepBooms, throwGrenade, spawnBoom, eyeHeight, stepTrigger,
} from './combat.js';
import { WEAPONS, makeViewModel, finishReloadIfDue, swapWeapon } from './weapons.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shotMode = params.get('shot');

// --- Scene -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const mats = makeMaterials(THREE);
const hemi = new THREE.HemisphereLight(0xffe0b8, 0x3a2415, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 1.7);
sun.position.set(-30, 38, -18);
scene.add(sun);
for (const [x, z] of [[20, -18], [24, 14]]) {
  const lamp = new THREE.PointLight(0xff8a3a, 70, 30, 1.8);
  lamp.position.set(x, 3.4, z);
  scene.add(lamp);
}

const occluders = buildMap(THREE, scene, mats);

// --- State and world ----------------------------------------------------
const state = createState(seed);
const dom = grabDom();
const world = {
  THREE, scene, mats, state,
  sfx: new SoundFX(),
  raycaster: new THREE.Raycaster(),
  hitTargets: [...occluders],
  grenades: [], booms: [],
  tracers: makeTracerPool(THREE, scene, mats),
  tmpV1: new THREE.Vector3(), tmpV2: new THREE.Vector3(), tmpDir: new THREE.Vector3(),
  muzzleFlashUntil: 0, hitmarkUntil: 0,
};
world.throwGrenade = (f) => throwGrenade(state, world, f);
world.spawnBoom = (x, y, z) => spawnBoom(world, x, y, z);
world.onDetonate = (x, z) => {
  spawnBoom(world, x, 1, z);
  world.sfx.explosion();
  state.shake = 1;
};
world.onPlanted = () => { /* the charge mesh follows bomb state each frame */ };

const fighters = setupMatch(THREE, mats, state, scene);
const playerProxies = makePlayerHitboxes(THREE, scene, state.player);
for (const f of fighters) {
  if (f.headMesh) world.hitTargets.push(f.headMesh, f.bodyMesh);
}
world.hitTargets.push(...playerProxies);

// The charge: a dark block with a blinking amber light, carried, dropped
// or planted — its mesh follows state.bomb every frame.
const chargeMesh = new THREE.Group();
const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.28), mats.dark);
chargeMesh.add(chargeBody);
const chargeLight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), mats.emberGlow);
chargeLight.position.y = 0.15;
chargeMesh.add(chargeLight);
scene.add(chargeMesh);

// --- View model ----------------------------------------------------------
let viewKey = null;
let viewGroup = null;
function syncViewModel() {
  const p = state.player;
  if (!p.alive || state.phase === PHASE.MENU) {
    if (viewGroup) viewGroup.visible = false;
    return;
  }
  if (viewKey !== p.weaponKey) {
    if (viewGroup) camera.remove(viewGroup);
    viewGroup = makeViewModel(THREE, mats, p.weaponKey);
    viewGroup.position.set(0.27, -0.25, -0.45);
    camera.add(viewGroup);
    viewKey = p.weaponKey;
  }
  viewGroup.visible = true;
  const bob = Math.min(1, p.speedNow / 4.6);
  viewGroup.position.y = -0.25 + Math.sin(state.time * 9.5) * 0.011 * bob;
  viewGroup.position.x = 0.27 + Math.cos(state.time * 4.75) * 0.006 * bob;
  const flash = viewGroup.userData.flash;
  const flashing = state.time < world.muzzleFlashUntil;
  flash.material.opacity = flashing ? 0.95 : 0;
  if (flashing) flash.rotation.z = state.rng() * 3;
  const reloading = p.reloadUntil > state.time;
  viewGroup.rotation.x = reloading ? -0.7 : (flashing ? 0.06 : 0);
}

// --- Input actions --------------------------------------------------------
const BUY_KEYS = ['smg', 'scatter', 'rifle', 'dmr', 'grenade', 'armor'];
function onKey(code) {
  world.sfx.wake();
  const p = state.player;
  if (state.phase === PHASE.BUY && code.startsWith('Digit')) {
    const item = BUY_KEYS[Number(code.slice(5)) - 1];
    if (item) buyItem(state, world, p, item);
    return;
  }
  if (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED) {
    if (code === 'Digit1' && p.primaryKey) swapWeapon(p, p.primaryKey);
    if (code === 'Digit2') swapWeapon(p, 'pistol');
    if (code === 'KeyG') world.throwGrenade(p);
  }
}
initInput({ renderer, overlayPlay: dom.overlayPlay }, onKey);
dom.buyItems.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (btn) buyItem(state, world, state.player, btn.dataset.buy);
});
dom.overlayPlay.addEventListener('click', () => {
  world.sfx.wake();
  if (state.phase === PHASE.MENU) {
    dom.overlay.hidden = true;
    startRound(state, world);
  } else if (state.phase === PHASE.MATCH) {
    resetMatch();
    dom.overlay.hidden = true;
  }
});

function resetMatch() {
  state.score.ember = 0;
  state.score.ash = 0;
  state.round = 0;
  for (const f of state.fighters) {
    f.money = 800;
    f.kills = 0;
    f.deaths = 0;
    f.alive = false; // seatFighter revives; a corpse loadout resets
  }
  startRound(state, world);
}

// --- Simulation step -------------------------------------------------------
function step(dt) {
  state.time += dt;
  const ph = state.phase;
  if (ph === PHASE.BUY || ph === PHASE.LIVE || ph === PHASE.PLANTED) {
    stepPlayer(state, world, dt);
    if (ph === PHASE.LIVE || ph === PHASE.PLANTED) stepBots(state, world, dt);
    for (const f of state.fighters) finishReloadIfDue(state, f);
    stepGrenades(state, world, dt);
    // Keep the hit-mesh matrices one step behind the logical positions
    // at most, so the next step's raycasts meet bodies where they stand.
    syncBotMeshes(state);
    scene.updateMatrixWorld(true);
  }
  if (ph !== PHASE.MENU) stepRound(state, world, dt);
  state.noises = state.noises.filter((n) => state.time - n.t < 3);
}

// --- Camera ------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function placeCamera(frameDt) {
  const p = state.player;
  state.shake = Math.max(0, state.shake - frameDt * 2.4);
  if (state.phase === PHASE.MENU) {
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 27, 9.5, Math.cos(t) * 27);
    camera.lookAt(0, 1, 0);
    if (viewGroup) viewGroup.visible = false;
    return;
  }
  if (p.alive) {
    const shakeYaw = (state.rng() * 2 - 1) * 0.02 * state.shake;
    const shakePitch = (state.rng() * 2 - 1) * 0.02 * state.shake;
    camera.position.set(p.pos.x, eyeHeight(p) + 0.06, p.pos.z);
    camera.rotation.set(p.pitch + shakePitch, p.yaw + Math.PI + shakeYaw, 0);
    syncViewModel();
    return;
  }
  // Spectate: ride behind the first standing Ember teammate.
  const mate = state.fighters.find((f) => f.team === 'ember' && f.alive && !f.isPlayer)
    || state.fighters.find((f) => f.alive);
  if (mate) {
    const bx = Math.sin(mate.yaw), bz = Math.cos(mate.yaw);
    camera.position.set(mate.pos.x - bx * 3.4, 2.6, mate.pos.z - bz * 3.4);
    camTarget.set(mate.pos.x + bx * 8, 1.2, mate.pos.z + bz * 8);
    camera.lookAt(camTarget);
  }
  if (viewGroup) viewGroup.visible = false;
}

// --- Charge mesh ---------------------------------------------------------------
function syncChargeMesh() {
  const bomb = state.bomb;
  chargeLight.material = Math.sin(state.time * (bomb.planted ? 9 : 3)) > 0 ? mats.emberGlow : mats.dark;
  if (bomb.planted) {
    chargeMesh.visible = true;
    chargeMesh.position.set(bomb.x, 0.14, bomb.z);
  } else if (bomb.carrier) {
    chargeMesh.visible = true;
    chargeMesh.position.set(bomb.carrier.pos.x, 2.02, bomb.carrier.pos.z);
  } else if (bomb.dropped) {
    chargeMesh.visible = true;
    chargeMesh.position.set(bomb.dropped.x, 0.14, bomb.dropped.z);
  } else {
    chargeMesh.visible = false;
  }
}

// --- Shot staging ---------------------------------------------------------------
function stageShot(mode) {
  input.enabled = false;
  const p = state.player;
  startRound(state, world);
  if (mode === 'start') {
    state.phase = PHASE.MENU; // freeze the seated squads behind the menu
    return;
  }
  dom.overlay.hidden = true;
  if (mode === 'buy') {
    camera.position.set(p.pos.x, eyeHeight(p) + 0.06, p.pos.z);
    camera.rotation.set(0, p.yaw + Math.PI, 0);
    syncViewModel();
    return;
  }
  if (mode === 'play') {
    state.phase = PHASE.LIVE;
    state.phaseT = 88;
    p.owned.rifle = true;
    p.primaryKey = 'rifle';
    swapWeapon(p, 'rifle');
    p.pos.x = -2; p.pos.z = -16;
    p.yaw = Math.PI / 2;
    for (let i = 0; i < 210; i++) {
      state.time += STEP;
      stepBots(state, world, STEP);
      for (const f of state.fighters) finishReloadIfDue(state, f);
      syncBotMeshes(state);
      scene.updateMatrixWorld(true);
    }
    p.hp = 100;
    p.alive = true;
    // Stage a duel: pick an Ash fighter, step the player back along a
    // clear sight line from it, and loose a short burst — the cover shot
    // shows a real firefight, tracers and muzzle flash included.
    let best = null, bestD = Infinity;
    for (const f of state.fighters) {
      if (f.team !== 'ash' || !f.alive) continue;
      const d = Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best) {
      const away = Math.atan2(p.pos.x - best.pos.x, p.pos.z - best.pos.z);
      for (const back of [11, 8, 14, 6]) {
        const cx = best.pos.x + Math.sin(away) * back;
        const cz = best.pos.z + Math.cos(away) * back;
        if (!sightBlocked(cx, cz, best.pos.x, best.pos.z, 1.3)) {
          p.pos.x = cx; p.pos.z = cz;
          break;
        }
      }
      collideCircle(p.pos, 0.36);
      const d = Math.hypot(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
      p.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
      p.pitch = Math.atan2(1.05 - eyeHeight(p), d);
      syncBotMeshes(state);
      scene.updateMatrixWorld(true);
      for (let s = 0; s < 3; s++) {
        p.nextShotAt = 0;
        stepTrigger(state, world, p, true);
        p.prevTrigger = false;
      }
    }
    camera.position.set(p.pos.x, eyeHeight(p) + 0.06, p.pos.z);
    camera.rotation.set(p.pitch, p.yaw + Math.PI, 0);
    syncViewModel();
    return;
  }
  if (mode === 'end') {
    state.score.ember = 3;
    state.score.ash = 2;
    let dropped = 0;
    for (const f of state.fighters) {
      if (f.team === 'ash' && dropped < 2) {
        f.alive = false;
        if (f.group) { f.group.rotation.x = -Math.PI / 2; f.group.position.y = 0.25; }
        dropped++;
      }
    }
    state.phase = PHASE.OVER;
    state.phaseT = 5;
    state.banner = { title: 'EMBER TAKES THE ROUND', sub: 'Ash squad eliminated', until: state.time + 999 };
    camera.position.set(p.pos.x, eyeHeight(p) + 0.06, p.pos.z);
    camera.rotation.set(0, p.yaw + Math.PI, 0);
    syncViewModel();
  }
}

// --- Main loop -------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let shotStaged = false;
function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (shotMode) {
    if (!shotStaged) {
      stageShot(shotMode);
      shotStaged = true;
    }
    syncBotMeshes(state);
    syncPlayerHitboxes(state.player, playerProxies);
    syncChargeMesh();
    stepTracers(world);
    stepBooms(world);
    if (shotMode === 'start') placeCamera(frameDt); // the menu keeps its slow orbit; other shots hold their staged camera
    updateHud(dom, state, world);
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }
  acc += frameDt;
  let steps = 0;
  while (acc >= STEP && steps < 16) {
    step(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 16) acc = 0; // a long hitch skips time instead of spiralling
  syncBotMeshes(state);
  syncPlayerHitboxes(state.player, playerProxies);
  syncChargeMesh();
  stepTracers(world);
  stepBooms(world);
  placeCamera(frameDt);
  updateHud(dom, state, world);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
