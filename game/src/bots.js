// bots.js — the fighters: one factory builds every combatant (the player
// gets the same body, driven by input instead of this AI), and one brain
// that routes along the waypoint graph, holds sites, reacts to sight and
// sound, plants and defuses. A bot's skill is written as aim error and
// reaction time, so its misses are honest geometry, not dice.

import { NODES, nearestNode, findPath, collideCircle, sightBlocked } from './map.js';
import { eyeHeight, stepTrigger } from './combat.js';
import { WEAPONS, startReload } from './weapons.js';
import { rngRange, rngPick } from './rng.js';

export const EMBER_NAMES = ['Vex', 'Onyx', 'Pax'];
export const ASH_NAMES = ['Rook', 'Sable', 'Grimm', 'Havoc'];

// makeFighter builds a combatant and its low-poly body: legs, a team-
// coloured torso (the body hitbox), a head (the head hitbox) and a gun.
// The hitboxes are the visible meshes themselves — what you see is what
// a bullet can hit.
export function makeFighter(THREE, mats, { name, team, isPlayer = false }, rng = Math.random) {
  const f = {
    name, team, isPlayer,
    alive: true, hp: 100, armor: false,
    money: 800, kills: 0, deaths: 0,
    pos: { x: 0, z: 0 }, yaw: 0, pitch: 0,
    vel: { x: 0, z: 0 }, speedNow: 0, crouch: false,
    weaponKey: 'pistol', owned: { pistol: true }, mag: 12, reserve: 60,
    grenades: 0, bloom: 0, reloadUntil: 0, nextShotAt: 0, prevTrigger: false,
    lastShotAt: -9, lastHurtAt: -9, lastAttacker: null,
    hasCharge: false, channeling: null,
    group: null, headMesh: null, bodyMesh: null, gunMesh: null,
    ai: null,
  };
  if (isPlayer) return f;

  const g = new THREE.Group();
  const teamMat = team === 'ember' ? mats.ember : mats.ash;
  const darkMat = team === 'ember' ? mats.emberDark : mats.ashDark;
  const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.2);
  for (const dx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(legGeo, mats.dark);
    leg.position.set(dx, 0.39, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.3), teamMat);
  torso.position.set(0, 1.08, 0);
  torso.userData.part = 'body';
  torso.userData.fighter = f;
  g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.32), darkMat);
  vest.position.set(0, 1.2, 0);
  g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 10, 8), mats.skin);
  head.position.set(0, 1.58, 0);
  head.userData.part = 'head';
  head.userData.fighter = f;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), darkMat);
  helmet.position.set(0, 1.7, 0);
  g.add(helmet);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.52), mats.dark);
  gun.position.set(0.18, 1.22, 0.3);
  g.add(gun);
  f.group = g;
  f.headMesh = head;
  f.bodyMesh = torso;
  f.gunMesh = gun;
  f.ai = {
    target: null, lastKnown: null, lastKnownT: -9, heardT: -9,
    reactAt: 0, aimErr: 0.06, seenSince: -9,
    burstUntil: 0, restUntil: 0, aimYawOff: 0, aimPitchOff: 0,
    path: [], pathI: 0, objective: null, objectiveNode: null,
    decisionT: 0, strafePhase: rng() * 6.28, holdYaw: 0,
    skill: 0.85 + rng() * 0.3, // reaction/aim quality multiplier
  };
  return f;
}

// syncBotMeshes poses every bot body from its simulation state (called
// once per render frame; the simulation itself is position-only).
export function syncBotMeshes(state) {
  for (const f of state.fighters) {
    if (!f.group) continue;
    f.group.position.set(f.pos.x, f.alive ? 0 : 0.25, f.pos.z);
    if (f.alive) {
      f.group.rotation.set(0, f.yaw, 0);
      const targetScaleY = f.crouch ? 0.76 : 1;
      f.group.scale.y += (targetScaleY - f.group.scale.y) * 0.35;
      // A simple run cycle: legs swing via the gun bob is overkill — the
      // whole body bobs a fraction while moving.
      f.group.position.y = Math.abs(Math.sin(state.time * 9 + f.pos.x)) * 0.03 * Math.min(1, f.speedNow / 4);
    }
  }
}

// visibleEnemies lists the enemies of `f` it can see right now: inside
// its view cone (or very close), in range, with a clear sight line.
function visibleEnemies(state, f) {
  const out = [];
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
  for (const e of state.fighters) {
    if (e.team === f.team || !e.alive) continue;
    const dx = e.pos.x - f.pos.x, dz = e.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 42) continue;
    if (dist > 3.5) {
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.28) continue; // ~73° half-cone
    }
    if (sightBlocked(f.pos.x, f.pos.z, e.pos.x, e.pos.z, 1.3)) continue;
    out.push({ e, dist });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

// moveToward steers a bot toward a point, turning smoothly, resolving
// collision, and reporting the remaining distance.
function moveToward(state, f, tx, tz, speed, dt, faceX = null, faceZ = null) {
  const dx = tx - f.pos.x, dz = tz - f.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.05) {
    const step = Math.min(dist, speed * dt);
    f.pos.x += (dx / dist) * step;
    f.pos.z += (dz / dist) * step;
    f.speedNow = step / dt;
  } else {
    f.speedNow = 0;
  }
  collideCircle(f.pos, 0.36);
  const wantYaw = faceX !== null
    ? Math.atan2(faceX - f.pos.x, faceZ - f.pos.z)
    : Math.atan2(dx, dz);
  let dy = wantYaw - f.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  f.yaw += Math.max(-11 * dt, Math.min(11 * dt, dy));
  return dist;
}

// followPath walks the bot along its waypoint path toward (tx, tz).
function followPath(state, f, tx, tz, speed, dt) {
  const ai = f.ai;
  while (ai.pathI < ai.path.length) {
    const n = NODES[ai.path[ai.pathI]];
    if (Math.hypot(n.x - f.pos.x, n.z - f.pos.z) < 1.1) ai.pathI++;
    else return moveToward(state, f, n.x, n.z, speed, dt);
  }
  return moveToward(state, f, tx, tz, speed, dt);
}

// setObjective gives the bot a new destination point + graph node.
function setObjective(state, f, x, z) {
  const ai = f.ai;
  const node = nearestNode(x, z);
  if (ai.objectiveNode === node && ai.objective && ai.objective.x === x && ai.objective.z === z) return;
  ai.objective = { x, z };
  ai.objectiveNode = node;
  ai.path = findPath(nearestNode(f.pos.x, f.pos.z), node);
  ai.pathI = ai.path.length > 0 && NODES[ai.path[0]] &&
    Math.hypot(NODES[ai.path[0]].x - f.pos.x, NODES[ai.path[0]].z - f.pos.z) < 1.2 ? 1 : 0;
}

// decide runs at ~6 Hz per bot: it turns senses and the round plan into
// an objective and a posture. Movement and firing run every step below.
function decide(state, f) {
  const ai = f.ai;
  const rng = state.rng;
  const bomb = state.bomb;
  const site = state.plan?.site;
  f.channeling = null;

  if (ai.target) return; // engaging: movement code handles it

  if (f.team === 'ash' && bomb.planted) {
    // Defenders converge on the planted charge; nearest defuses.
    setObjective(state, f, bomb.x, bomb.z);
    return;
  }
  if (f.team === 'ember' && bomb.planted) {
    // Attackers guard the charge from just off the site.
    const s = bomb.site;
    setObjective(state, f, s.plant.x + (f.ai.holdOff?.x ?? 3), s.plant.z + (f.ai.holdOff?.z ?? 3));
    return;
  }
  if (f.hasCharge && site) {
    setObjective(state, f, site.plant.x, site.plant.z);
    return;
  }
  if (ai.lastKnown && state.time - ai.lastKnownT < 6) {
    // A sighting or a sound: move to check it.
    setObjective(state, f, ai.lastKnown.x, ai.lastKnown.z);
    return;
  }
  if (f.team === 'ember' && site) {
    // Push the chosen site, fanning to nearby cover points on arrival.
    const off = f.ai.holdOff || { x: 0, z: 0 };
    setObjective(state, f, site.plant.x + off.x, site.plant.z + off.z);
    return;
  }
  if (f.team === 'ash') {
    // Hold the assigned watch point.
    const h = f.ai.holdPoint;
    if (h) setObjective(state, f, h.x, h.z);
    return;
  }
}

// stepBots advances every bot one fixed step: senses, decisions,
// movement, channel starts and trigger control.
export function stepBots(state, world, dt) {
  const sfx = world.sfx;
  for (const f of state.fighters) {
    if (f.isPlayer || !f.alive) continue;
    const ai = f.ai;
    const rng = state.rng;

    // --- Senses ---
    const seen = visibleEnemies(state, f);
    const prevTarget = ai.target;
    ai.target = seen.length > 0 ? seen[0].e : null;
    if (ai.target) {
      if (prevTarget !== ai.target) {
        ai.reactAt = state.time + rngRange(rng, 0.30, 0.55) / ai.skill;
        ai.seenSince = state.time;
        ai.aimErr = 0.055 / ai.skill;
      }
      ai.lastKnown = { x: ai.target.pos.x, z: ai.target.pos.z };
      ai.lastKnownT = state.time;
      ai.aimErr = Math.max(0.007, ai.aimErr - dt * 0.028 * ai.skill);
    }
    for (const n of state.noises) {
      if (n.team === f.team || n.t <= ai.heardT) continue;
      if (Math.hypot(n.x - f.pos.x, n.z - f.pos.z) < n.radius) {
        ai.heardT = n.t;
        if (!ai.target) { ai.lastKnown = { x: n.x, z: n.z }; ai.lastKnownT = n.t; }
      }
    }

    // --- Decisions ---
    if (state.time >= ai.decisionT) {
      ai.decisionT = state.time + 0.16;
      decide(state, f);
      // Reload in a quiet moment rather than mid-fight.
      const def = WEAPONS[f.weaponKey];
      if (!ai.target && f.mag < def.mag * 0.35 && f.reserve > 0) startReload(state, f, null);
      // A grenade answers a known position behind cover, sometimes.
      if (!ai.target && ai.lastKnown && state.time - ai.lastKnownT < 2.5 && f.grenades > 0 &&
          Math.hypot(ai.lastKnown.x - f.pos.x, ai.lastKnown.z - f.pos.z) < 13 && rng() < 0.3) {
        f.yaw = Math.atan2(ai.lastKnown.x - f.pos.x, ai.lastKnown.z - f.pos.z);
        f.pitch = 0.12;
        world.throwGrenade(f);
      }
    }

    // --- Channel starts (plant / defuse): round.js advances them. ---
    // A channel runs when no enemy is close enough to punish it; a
    // distant watcher does not stop a plant or a defuse.
    const bomb = state.bomb;
    const targetDist = ai.target
      ? Math.hypot(ai.target.pos.x - f.pos.x, ai.target.pos.z - f.pos.z)
      : Infinity;
    if (f.hasCharge && state.plan?.site && targetDist > 11 &&
        Math.hypot(state.plan.site.plant.x - f.pos.x, state.plan.site.plant.z - f.pos.z) < 1.5) {
      f.channeling = 'plant';
      f.speedNow = 0;
      continue;
    }
    if (f.team === 'ash' && bomb.planted && targetDist > 14 &&
        Math.hypot(bomb.x - f.pos.x, bomb.z - f.pos.z) < 1.7) {
      f.channeling = 'defuse';
      f.speedNow = 0;
      continue;
    }

    // --- Movement & firing ---
    let wantFire = false;
    // The charge carrier does not duel at range: with the plant point
    // near and the visible enemy far, they keep pushing to plant while
    // their squad covers — otherwise one defender pins the whole round.
    const plantRush = f.hasCharge && ai.target && state.plan?.site &&
      Math.hypot(state.plan.site.plant.x - f.pos.x, state.plan.site.plant.z - f.pos.z) < 17 &&
      Math.hypot(ai.target.pos.x - f.pos.x, ai.target.pos.z - f.pos.z) > 11;
    if (plantRush) {
      f.crouch = false;
      followPath(state, f, state.plan.site.plant.x, state.plan.site.plant.z, 4.35, dt);
    } else if (ai.target) {
      const t = ai.target;
      const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z;
      const dist = Math.hypot(dx, dz);
      // Aim at the chest, leading nothing, with per-burst error offsets.
      const chestY = (t.crouch ? 0.82 : 1.12);
      const myEye = eyeHeight(f);
      f.yaw = Math.atan2(dx, dz) + ai.aimYawOff;
      f.pitch = Math.atan2(chestY - myEye, Math.max(1, dist)) + ai.aimPitchOff;
      // Strafe while fighting; close in if far, back off if point-blank.
      const strafe = Math.sin(state.time * 1.7 + ai.strafePhase) > 0 ? 1 : -1;
      let mx = 0, mz = 0;
      if (dist > 16) { mx = dx / dist; mz = dz / dist; }
      else if (dist < 5) { mx = -dx / dist; mz = -dz / dist; }
      const px = -dz / dist * strafe, pz = dx / dist * strafe;
      const vx = (mx + px * 0.7), vz = (mz + pz * 0.7);
      const vl = Math.hypot(vx, vz) || 1;
      f.pos.x += (vx / vl) * 1.7 * dt;
      f.pos.z += (vz / vl) * 1.7 * dt;
      collideCircle(f.pos, 0.36);
      f.speedNow = 1.7;
      f.crouch = dist > 15 && Math.sin(state.time * 0.9 + ai.strafePhase) > 0.55;
      // Bursts: fire for a burst window, then rest, then re-roll the
      // aim offsets and burst again. The cycle is an explicit two-state
      // machine: a burst that ends enters rest in the same step, so
      // wantFire always falls between bursts — a semi-auto sidearm
      // needs that falling edge to fire its next shot.
      if (ai.burstUntil > 0) {
        if (state.time < ai.burstUntil) {
          wantFire = true;
        } else {
          ai.burstUntil = 0;
          ai.restUntil = state.time + rngRange(rng, 0.3, 0.65);
        }
      } else if (state.time >= ai.reactAt && state.time >= ai.restUntil) {
        const shots = 3 + Math.floor(rng() * 4);
        ai.burstUntil = state.time + shots * (60 / WEAPONS[f.weaponKey].rpm) + 0.05;
        ai.aimYawOff = (rng() * 2 - 1) * ai.aimErr;
        ai.aimPitchOff = (rng() * 2 - 1) * ai.aimErr * 0.7;
        wantFire = true;
      }
    } else if (ai.objective) {
      f.crouch = false;
      const fresh = state.time - ai.lastKnownT < 6;
      const speed = fresh ? 3.5 : 4.35;
      const remain = followPath(state, f, ai.objective.x, ai.objective.z, speed, dt);
      if (remain < 0.4) {
        f.speedNow = 0;
        // At a hold point: scan the lane slowly.
        f.yaw += Math.sin(state.time * 0.6 + ai.strafePhase) * 0.25 * dt;
      }
    } else {
      f.speedNow = 0;
    }
    stepTrigger(state, world, f, wantFire);
  }
  void sfx;
}
