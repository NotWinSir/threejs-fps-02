// round.js — the match director: it builds the squads, runs the round
// clock (buy → live → planted → over), advances plant/defuse channels,
// pays the economy and decides rounds. Win checks live here and nowhere
// else, so a round can end exactly once.

import { SPAWNS, SITES, NODES } from './map.js';
import { PHASE, aliveCount } from './state.js';
import { makeFighter, EMBER_NAMES, ASH_NAMES } from './bots.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, giveWeapon, resetLoadout } from './weapons.js';
import { rngPick } from './rng.js';

const BUY_TIME = 12;
const ROUND_TIME = 100;
const DETONATE_TIME = 35;
const OVER_TIME = 5.5;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

// setupMatch creates all eight fighters and seats them at their spawns.
// The player's body comes from the same factory as the bots'.
export function setupMatch(THREE, mats, state, scene) {
  const player = makeFighter(THREE, mats, { name: 'You', team: 'ember', isPlayer: true }, state.rng);
  state.player = player;
  state.fighters.push(player);
  EMBER_NAMES.forEach((name, i) => {
    const b = makeFighter(THREE, mats, { name, team: 'ember' }, state.rng);
    b.ai.holdOff = [{ x: 4, z: 3 }, { x: -3, z: 5 }, { x: 3, z: -4 }][i];
    state.fighters.push(b);
    scene.add(b.group);
  });
  const holdNodes = ['aHold', 'aBack', 'bHold', 'bBack'];
  ASH_NAMES.forEach((name, i) => {
    const b = makeFighter(THREE, mats, { name, team: 'ash' }, state.rng);
    b.ai.holdPoint = NODES[holdNodes[i]];
    b.ai.holdYaw = -Math.PI / 2;
    state.fighters.push(b);
    scene.add(b.group);
  });
  return state.fighters;
}

// startRound resets the yard for a new round and opens the buy window.
export function startRound(state, world) {
  const rng = state.rng;
  state.round++;
  state.plan = { site: rngPick(rng, [SITES.A, SITES.B, SITES.A, SITES.B]) };
  state.bomb.planted = false;
  state.bomb.site = null;
  state.bomb.dropped = null;
  state.bomb.channel = 0;
  state.bomb.channelBy = null;
  state.lastEvent = '';

  const ember = state.fighters.filter((f) => f.team === 'ember');
  const ash = state.fighters.filter((f) => f.team === 'ash');
  ember.forEach((f, i) => seatFighter(f, SPAWNS.ember[i], f.alive));
  ash.forEach((f, i) => seatFighter(f, SPAWNS.ash[i], f.alive));

  // The charge goes to the player a third of the time, else a bot.
  const carrier = rng() < 0.34 ? state.player : rngPick(rng, ember.filter((f) => !f.isPlayer));
  carrier.hasCharge = true;
  state.bomb.carrier = carrier;

  state.phase = PHASE.BUY;
  state.phaseT = BUY_TIME;
  state.banner = {
    title: `Round ${state.round}`,
    sub: carrier.isPlayer ? 'You carry the charge' : `${carrier.name} carries the charge`,
    until: state.time + 2.6,
  };
  world.onRoundStart?.();
}

// seatFighter puts one fighter on its spawn, alive and topped up. A
// fighter who died last round comes back on the pistol; a survivor
// keeps the gun it bought.
function seatFighter(f, spawn, survived) {
  f.alive = true;
  f.hp = 100;
  f.pos.x = spawn.x;
  f.pos.z = spawn.z;
  f.yaw = spawn.yaw;
  f.pitch = 0;
  f.vel.x = 0; f.vel.z = 0;
  f.speedNow = 0;
  f.crouch = false;
  f.hasCharge = false;
  f.channeling = null;
  f.reloadUntil = 0;
  if (!survived) resetLoadout(f);
  else {
    const def = WEAPONS[f.weaponKey];
    f.mag = def.mag;
    f.reserve = def.reserve;
  }
  if (f.group) {
    f.group.rotation.set(0, f.yaw, 0);
    f.group.position.set(f.pos.x, 0, f.pos.z);
  }
  if (f.ai) {
    f.ai.target = null;
    f.ai.lastKnown = null;
    f.ai.path = [];
    f.ai.objective = null;
    f.ai.objectiveNode = null;
  }
}

// buyItem attempts a purchase for a fighter during the buy window.
export function buyItem(state, world, f, item) {
  if (state.phase !== PHASE.BUY) return false;
  const sfx = world.sfx;
  if (item === 'grenade') {
    if (f.grenades >= 1 || f.money < GRENADE_PRICE) { sfx.denied(); return false; }
    f.money -= GRENADE_PRICE;
    f.grenades++;
    sfx.buy();
    return true;
  }
  if (item === 'armor') {
    if (f.armor || f.money < ARMOR_PRICE) { sfx.denied(); return false; }
    f.money -= ARMOR_PRICE;
    f.armor = true;
    sfx.buy();
    return true;
  }
  const def = WEAPONS[item];
  if (!def || f.owned[item] || f.money < def.price) { sfx.denied(); return false; }
  f.money -= def.price;
  giveWeapon(f, item);
  f.primaryKey = item;
  sfx.buy();
  return true;
}

// endRound settles a round: score, money, banner, and the over phase.
function endRound(state, world, winner, reason) {
  if (state.phase === PHASE.OVER || state.phase === PHASE.MATCH) return;
  state.score[winner]++;
  state.winner = winner;
  const planter = state.bomb.planterRef;
  for (const f of state.fighters) {
    if (f.team === winner) f.money += 3250;
    else f.money += 1900;
    if (state.bomb.planted && f.team === 'ember') f.money += 800;
  }
  if (planter && winner === 'ember') planter.money += 300;
  const playerWon = winner === state.player.team;
  state.banner = {
    title: winner === 'ember' ? 'EMBER TAKES THE ROUND' : 'ASH HOLDS THE YARD',
    sub: reason,
    until: state.time + OVER_TIME - 0.6,
  };
  if (playerWon) world.sfx.roundWin(); else world.sfx.roundLose();
  if (state.score.ember >= state.winsNeeded || state.score.ash >= state.winsNeeded) {
    state.phase = PHASE.MATCH;
    state.phaseT = 999;
    state.banner = {
      title: winner === 'ember' ? 'EMBER WINS THE MATCH' : 'ASH WINS THE MATCH',
      sub: `Final score ${state.score.ember} — ${state.score.ash}. Click to play again.`,
      until: state.time + 999,
    };
  } else {
    state.phase = PHASE.OVER;
    state.phaseT = OVER_TIME;
  }
}

// stepRound advances the phase machine one step. Combat itself (damage,
// deaths) happens in combat.js; this reads the results and rules on them.
export function stepRound(state, world, dt) {
  const bomb = state.bomb;
  state.phaseT -= dt;

  // Channels: exactly one fighter may be planting or defusing.
  let channeler = null;
  for (const f of state.fighters) {
    if (f.alive && f.channeling) { channeler = f; break; }
  }
  if (channeler && (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED)) {
    if (bomb.channelBy !== channeler) {
      bomb.channelBy = channeler;
      bomb.channelKind = channeler.channeling;
      bomb.channel = 0;
      bomb.channelStart = state.time;
    }
    // A channel breaks when the channeler is hurt.
    if (channeler.lastHurtAt >= (bomb.channelStart ?? 0)) {
      bomb.channel = 0;
      bomb.channelStart = state.time;
      channeler.lastHurtAt = -9;
    }
    bomb.channel += dt;
    if (bomb.channelKind === 'plant' && (state.time * 2 | 0) !== ((state.time - dt) * 2 | 0)) {
      world.sfx.chargeBeep();
    }
    const need = bomb.channelKind === 'plant' ? PLANT_TIME : DEFUSE_TIME;
    if (bomb.channel >= need) {
      if (bomb.channelKind === 'plant') {
        bomb.planted = true;
        bomb.site = state.plan.site;
        bomb.x = bomb.site.plant.x;
        bomb.z = bomb.site.plant.z;
        bomb.planterRef = channeler;
        channeler.hasCharge = false;
        bomb.carrier = null;
        state.phase = PHASE.PLANTED;
        state.phaseT = DETONATE_TIME;
        state.lastEvent = `Charge planted at ${bomb.site.name}`;
        world.sfx.planted();
        world.onPlanted?.(bomb);
      } else {
        state.lastEvent = 'Charge defused';
        endRound(state, world, 'ash', `${channeler.name} defused the charge`);
      }
      bomb.channel = 0;
      bomb.channelBy = null;
    }
  } else {
    bomb.channel = 0;
    bomb.channelBy = null;
  }

  // Pick up a dropped charge: an Ember fighter walking over it takes it.
  if (!bomb.planted && !bomb.carrier && bomb.dropped && state.phase === PHASE.LIVE) {
    for (const f of state.fighters) {
      if (f.team === 'ember' && f.alive &&
          Math.hypot(f.pos.x - bomb.dropped.x, f.pos.z - bomb.dropped.z) < 1.1) {
        f.hasCharge = true;
        bomb.carrier = f;
        bomb.dropped = null;
        state.lastEvent = `${f.name} picked up the charge`;
        break;
      }
    }
  }

  const emberAlive = aliveCount(state, 'ember');
  const ashAlive = aliveCount(state, 'ash');

  switch (state.phase) {
    case PHASE.BUY: {
      // Bots shop too, one staggered purchase at a time, best gun first:
      // a full-buy round fields rifles, a poor one carbines and armour.
      for (const f of state.fighters) {
        if (f.isPlayer || !f.alive) continue;
        if (state.time < (f.ai.nextBuyAt || 0)) continue;
        f.ai.nextBuyAt = state.time + 0.45;
        if (!f.owned.rifle && f.money >= WEAPONS.rifle.price) buyItem(state, world, f, 'rifle');
        else if (!f.owned.dmr && f.money >= WEAPONS.dmr.price + 400) buyItem(state, world, f, 'dmr');
        else if (!f.owned.smg && f.money >= WEAPONS.smg.price) buyItem(state, world, f, 'smg');
        else if (!f.owned.scatter && f.money >= WEAPONS.scatter.price) buyItem(state, world, f, 'scatter');
        else if (!f.armor && f.money >= 650) buyItem(state, world, f, 'armor');
        else if (f.grenades < 1 && f.money >= 300) buyItem(state, world, f, 'grenade');
      }
      if (state.phaseT <= 0) {
        state.phase = PHASE.LIVE;
        state.phaseT = ROUND_TIME;
      }
      break;
    }
    case PHASE.LIVE:
      if (ashAlive === 0) endRound(state, world, 'ember', 'Ash squad eliminated');
      else if (emberAlive === 0) endRound(state, world, 'ash', 'Ember squad eliminated');
      else if (state.phaseT <= 0) endRound(state, world, 'ash', 'The round clock ran out');
      break;
    case PHASE.PLANTED:
      if (ashAlive === 0) endRound(state, world, 'ember', 'No one left to defuse');
      else if (state.phaseT <= 0) {
        world.onDetonate?.(bomb.x, bomb.z);
        endRound(state, world, 'ember', 'The charge detonated');
      }
      break;
    case PHASE.OVER:
      if (state.phaseT <= 0) startRound(state, world);
      break;
    default:
      break;
  }
}
