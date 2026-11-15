// combat.js — gunfire, damage and grenades. One mechanism for everyone:
// a shot is a ray from the shooter's eye through a spread cone, tested
// against the same meshes the player sees (bot bodies, bot heads, the
// yard's solids). Bots miss because their aim carries error, not because
// a dice roll says so; the player hits exactly where the crosshair sits.

import { WEAPONS, spreadFor, damageAt, startReload } from './weapons.js';
import { sightBlocked } from './map.js';
import { addNoise, pushFeed } from './state.js';

const EYE_STAND = 1.55;
const EYE_CROUCH = 1.12;

export function eyeHeight(f) {
  return f.crouch ? EYE_CROUCH : EYE_STAND;
}

// eyePos writes a fighter's eye position into `out` (a THREE.Vector3).
export function eyePos(f, out) {
  return out.set(f.pos.x, eyeHeight(f), f.pos.z);
}

// applyDamage resolves armour, death, the kill feed and the reward.
// Returns true when the victim died.
export function applyDamage(state, world, victim, dmg, part, attacker) {
  if (!victim.alive) return false;
  let taken = dmg;
  if (victim.armor && part === 'body') taken *= 0.6;
  victim.hp -= taken;
  victim.lastHurtAt = state.time;
  victim.lastAttacker = attacker;
  if (victim.isPlayer) world.sfx.hurt();
  if (attacker?.isPlayer) {
    world.sfx.hit(part === 'head');
    world.hitmarkUntil = state.time + 0.13;
  }
  if (victim.hp > 0) return false;
  victim.hp = 0;
  victim.alive = false;
  victim.deaths++;
  if (attacker && attacker !== victim) {
    attacker.kills++;
    attacker.money += 300;
  }
  pushFeed(state, `${attacker ? attacker.name : 'The yard'}  ▸  ${victim.name}${part === 'head' ? '  (headshot)' : ''}`);
  if (attacker?.isPlayer) world.sfx.kill();
  if (victim.hasCharge) {
    victim.hasCharge = false;
    state.bomb.carrier = null;
    state.bomb.dropped = { x: victim.pos.x, z: victim.pos.z };
    state.lastEvent = 'Charge dropped';
  }
  if (victim.group) {
    victim.group.rotation.x = -Math.PI / 2; // falls where it stood
    victim.group.position.y = 0.25;
  }
  return true;
}

// fireOnce looses a single trigger pull (all pellets of it) for fighter f.
function fireOnce(state, world, f) {
  const def = WEAPONS[f.weaponKey];
  const sfx = world.sfx;
  if (f.mag <= 0) {
    sfx.dryFire();
    startReload(state, f, sfx);
    f.nextShotAt = state.time + 0.3;
    return;
  }
  f.mag--;
  f.bloom = Math.min(0.05, (f.bloom || 0) + def.bloomPerShot);
  f.lastShotAt = state.time;
  addNoise(state, f.pos.x, f.pos.z, def.noiseR, f.team);
  const origin = eyePos(f, world.tmpV1);
  const spread = spreadFor(f);
  const rng = state.rng;
  if (f.isPlayer) sfx.shot(0, def.pellets > 1);
  for (let p = 0; p < def.pellets; p++) {
    // Aim direction: the fighter's yaw/pitch, scattered inside the cone.
    const yaw = f.yaw + (rng() * 2 - 1) * spread;
    const pitch = (f.pitch || 0) + (rng() * 2 - 1) * spread;
    world.tmpDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    world.raycaster.set(origin, world.tmpDir);
    world.raycaster.far = 90;
    const hits = world.raycaster.intersectObjects(world.hitTargets, false);
    let end = null;
    for (const hit of hits) {
      const ud = hit.object.userData;
      if (ud.fighter === f) continue; // never shoot yourself
      end = hit.point;
      if (ud.fighter && ud.fighter.alive && ud.fighter.team !== f.team) {
        const dist = hit.distance;
        const base = def.damage * (ud.part === 'head' ? def.headMult : 1);
        applyDamage(state, world, ud.fighter, damageAt(def, base, dist), ud.part, f);
      }
      break; // the first thing the ray meets stops it, body or wall alike
    }
    if (!end) end = world.tmpV2.copy(world.tmpDir).multiplyScalar(60).add(origin);
    spawnTracer(world, origin, end, f.team);
  }
  if (f.isPlayer) {
    world.muzzleFlashUntil = state.time + 0.045;
    state.shake = Math.min(0.6, state.shake + def.recoil * 6);
    f.pitch += def.recoil * 0.55; // the gun climbs; the player pulls it back down
  }
  if (f.mag === 0) startReload(state, f, sfx);
}

// stepTrigger advances one fighter's trigger for this step: rate of fire,
// semi-auto edges, reload gating and bloom recovery all live here, so a
// bot's VK-9 and the player's VK-9 obey exactly the same rules.
export function stepTrigger(state, world, f, wantFire) {
  f.bloom = Math.max(0, (f.bloom || 0) - 0.055 * (1 / 60));
  if (!f.alive) return;
  const def = WEAPONS[f.weaponKey];
  const reloading = f.reloadUntil > state.time;
  const edge = wantFire && !f.prevTrigger;
  f.prevTrigger = wantFire;
  if (reloading || state.phase === 'buy' || state.phase === 'menu') return;
  if (f.channeling) return;
  if (!wantFire) return;
  if (!def.auto && !edge) return;
  if (state.time < (f.nextShotAt || 0)) return;
  f.nextShotAt = state.time + 60 / def.rpm;
  fireOnce(state, world, f);
}

// --- Tracers: a short-lived pool of bright lines, one per pellet. ---

export function makeTracerPool(THREE, scene, mats) {
  const pool = [];
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  for (let i = 0; i < 40; i++) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffc37a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo.clone(), mat);
    line.visible = false;
    scene.add(line);
    pool.push({ line, until: 0 });
  }
  return { pool, next: 0, mats };
}

function spawnTracer(world, from, to, team) {
  const t = world.tracers;
  const slot = t.pool[t.next++ % t.pool.length];
  const pos = slot.line.geometry.attributes.position;
  // Start a step down the barrel so the line never crosses the camera.
  pos.setXYZ(0, from.x, from.y - 0.12, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  slot.line.material.color.setHex(team === 'ember' ? 0x7ef0e2 : 0xffa37a);
  slot.line.material.opacity = 0.75;
  slot.line.visible = true;
  slot.until = world.state.time + 0.055;
}

export function stepTracers(world) {
  for (const slot of world.tracers.pool) {
    if (slot.line.visible && world.state.time > slot.until) slot.line.visible = false;
  }
}

// --- Grenades: thrown arcs, a short fuse, radial damage through cover
// only where a sight line exists at knee height. ---

export function throwGrenade(state, world, f) {
  if (f.grenades <= 0 || !f.alive) return false;
  f.grenades--;
  const mesh = new world.THREE.Mesh(
    new world.THREE.SphereGeometry(0.09, 8, 6),
    world.mats.dark,
  );
  const dir = { x: Math.sin(f.yaw), z: Math.cos(f.yaw) };
  mesh.position.set(f.pos.x + dir.x * 0.4, eyeHeight(f), f.pos.z + dir.z * 0.4);
  world.scene.add(mesh);
  world.grenades.push({
    mesh,
    vx: dir.x * 9, vy: 4.2, vz: dir.z * 9,
    fuse: state.time + 1.6,
    by: f,
  });
  world.sfx.throwIt();
  return true;
}

export function stepGrenades(state, world, dt) {
  for (let i = world.grenades.length - 1; i >= 0; i--) {
    const g = world.grenades[i];
    const p = g.mesh.position;
    g.vy -= 16 * dt;
    p.x += g.vx * dt; p.y += g.vy * dt; p.z += g.vz * dt;
    if (p.y < 0.09) { // bounce once, then roll dead
      p.y = 0.09;
      g.vy = Math.abs(g.vy) > 1.5 ? -g.vy * 0.35 : 0;
      g.vx *= 0.6; g.vz *= 0.6;
    }
    if (state.time < g.fuse) continue;
    // Detonation.
    world.scene.remove(g.mesh);
    world.grenades.splice(i, 1);
    world.sfx.explosion();
    state.shake = Math.min(1, state.shake + Math.max(0, 0.7 - Math.hypot(p.x - state.player.pos.x, p.z - state.player.pos.z) * 0.03));
    spawnBoom(world, p.x, p.y, p.z);
    for (const f of state.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z);
      if (d > 5.5) continue;
      if (sightBlocked(p.x, p.z, f.pos.x, f.pos.z, 0.5) && d > 1.2) continue;
      const dmg = 92 * Math.max(0.12, 1 - d / 5.5);
      applyDamage(state, world, f, dmg, 'body', g.by === f ? null : g.by);
    }
  }
}

// spawnBoom pops a quick expanding glow sphere at a detonation point.
export function spawnBoom(world, x, y, z) {
  const THREE = world.THREE;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  m.position.set(x, y, z);
  world.scene.add(m);
  world.booms.push({ mesh: m, until: world.state.time + 0.28, born: world.state.time });
}

export function stepBooms(world) {
  for (let i = world.booms.length - 1; i >= 0; i--) {
    const b = world.booms[i];
    const k = (world.state.time - b.born) / 0.28;
    b.mesh.scale.setScalar(1 + k * 4.5);
    b.mesh.material.opacity = 0.85 * (1 - k);
    if (world.state.time > b.until) {
      world.scene.remove(b.mesh);
      world.booms.splice(i, 1);
    }
  }
}
