// weapons.js — the armoury: five guns and a frag grenade, each a row of
// numbers the combat code reads. Accuracy is a system, not a dice roll:
// spread grows while moving and while a burst runs long, shrinks when
// crouched and still — stopping to aim is the winning habit, by design.

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, damage: 26, headMult: 4, rpm: 330, mag: 12,
    reserve: 60, auto: false, pellets: 1, spread: 0.010, bloomPerShot: 0.006,
    recoil: 0.010, reloadT: 1.1, noiseR: 24, falloffFrom: 16,
  },
  smg: {
    name: 'VK-9 Carbine', price: 1250, damage: 20, headMult: 3.2, rpm: 820, mag: 32,
    reserve: 128, auto: true, pellets: 1, spread: 0.020, bloomPerShot: 0.005,
    recoil: 0.006, reloadT: 1.6, noiseR: 22, falloffFrom: 13,
  },
  scatter: {
    name: 'Mule 12', price: 1100, damage: 9, headMult: 1.6, rpm: 78, mag: 6,
    reserve: 24, auto: false, pellets: 8, spread: 0.052, bloomPerShot: 0.02,
    recoil: 0.05, reloadT: 2.4, noiseR: 28, falloffFrom: 7,
  },
  rifle: {
    name: 'AR-7 Longhand', price: 2700, damage: 34, headMult: 4, rpm: 600, mag: 30,
    reserve: 90, auto: true, pellets: 1, spread: 0.011, bloomPerShot: 0.007,
    recoil: 0.013, reloadT: 1.9, noiseR: 32, falloffFrom: 22,
  },
  dmr: {
    name: 'Surveyor DMR', price: 3100, damage: 72, headMult: 2, rpm: 175, mag: 8,
    reserve: 32, auto: false, pellets: 1, spread: 0.0035, bloomPerShot: 0.012,
    recoil: 0.042, reloadT: 2.2, noiseR: 36, falloffFrom: 30,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const BUY_MENU = ['smg', 'scatter', 'rifle', 'dmr']; // plus grenade/armor rows

// giveWeapon puts a fresh, loaded gun of `key` in a fighter's hands.
export function giveWeapon(f, key) {
  const def = WEAPONS[key];
  f.weaponKey = key;
  f.owned[key] = true;
  f.mag = def.mag;
  f.reserve = def.reserve;
  f.reloadUntil = 0;
  f.bloom = 0;
}

// resetLoadout: back to the free pistol, no grenades, armour kept off.
export function resetLoadout(f) {
  f.owned = { pistol: true };
  f.grenades = 0;
  f.armor = false;
  giveWeapon(f, 'pistol');
}

// startReload begins a reload if one makes sense; returns whether it did.
export function startReload(state, f, sfx) {
  const def = WEAPONS[f.weaponKey];
  if (f.reloadUntil > state.time || f.mag >= def.mag || f.reserve <= 0) return false;
  f.reloadUntil = state.time + def.reloadT;
  sfx?.reload();
  return true;
}

// finishReloadIfDue moves reserve rounds into the magazine when the
// reload timer lands. Called once per step for every fighter.
export function finishReloadIfDue(state, f) {
  if (f.reloadUntil === 0 || f.reloadUntil > state.time) return;
  const def = WEAPONS[f.weaponKey];
  const take = Math.min(def.mag - f.mag, f.reserve);
  f.mag += take;
  f.reserve -= take;
  f.reloadUntil = 0;
}

// swapWeapon exchanges the gun in hand for an owned one, remembering
// each gun's magazine and reserve so a swap never eats ammunition.
export function swapWeapon(f, key) {
  if (!f.owned[key] || f.weaponKey === key) return false;
  if (!f.ammoStore) f.ammoStore = {};
  f.ammoStore[f.weaponKey] = { mag: f.mag, reserve: f.reserve };
  f.weaponKey = key;
  const stored = f.ammoStore[key];
  if (stored) {
    f.mag = stored.mag;
    f.reserve = stored.reserve;
  } else {
    const def = WEAPONS[key];
    f.mag = def.mag;
    f.reserve = def.reserve;
  }
  f.reloadUntil = 0;
  f.bloom = 0;
  return true;
}

// spreadFor: the shooter's current cone half-angle in radians — base
// spread + accumulated bloom + a movement term, discounted for crouching.
export function spreadFor(f) {
  const def = WEAPONS[f.weaponKey];
  const move = Math.min(1, (f.speedNow || 0) / 4.6); // 0 still … 1 full run
  let s = def.spread + (f.bloom || 0) + move * move * 0.045;
  if (f.crouch) s *= 0.62;
  return s;
}

// damageAt applies the weapon's distance falloff to a base damage roll.
export function damageAt(def, base, dist) {
  if (dist <= def.falloffFrom) return base;
  const f = Math.max(0.45, 1 - (dist - def.falloffFrom) * 0.009);
  return base * f;
}

// makeViewModel builds the first-person gun: a low-poly receiver, barrel
// and grip in gunmetal with a team-coloured band, plus a muzzle flash
// plane the combat code pops for a frame. One per weapon key, cached.
const viewModelCache = {};
export function makeViewModel(THREE, mats, key) {
  if (viewModelCache[key]) return viewModelCache[key];
  const g = new THREE.Group();
  const long = key === 'dmr' || key === 'rifle' ? 0.62 : key === 'scatter' ? 0.55 : 0.34;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, long), mats.dark);
  body.position.set(0, -0.02, -long / 2);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.22, 8), mats.steelDark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, -long - 0.08);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.17, 0.09), mats.dark);
  grip.position.set(0, -0.13, -0.05);
  grip.rotation.x = 0.35;
  g.add(grip);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.03, 0.1),
    key === 'pistol' ? mats.steel : mats.emberGlow,
  );
  band.position.set(0, 0.045, -long * 0.55);
  g.add(band);
  if (key === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8), mats.dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, -0.22);
    g.add(scope);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.19),
    new THREE.MeshBasicMaterial({ color: 0xffc37a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  flash.position.set(0, 0.015, -long - 0.2);
  g.add(flash);
  g.userData.flash = flash;
  g.userData.tipZ = -long - 0.19;
  viewModelCache[key] = g;
  return g;
}
