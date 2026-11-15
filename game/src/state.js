// state.js — the one place match state lives. Every module reads and
// writes this object; nothing keeps a private copy of the score, the
// phase or the bomb, so the HUD can never disagree with the simulation.

import { makeRng } from './rng.js';

export const PHASE = {
  MENU: 'menu',       // start overlay, nothing simulated
  BUY: 'buy',         // freeze + buy window at a round's start
  LIVE: 'live',       // round running, charge not yet planted
  PLANTED: 'planted', // charge planted, detonation counting down
  OVER: 'over',       // round decided, banner showing
  MATCH: 'match',     // match decided
};

export function createState(seed) {
  return {
    rng: makeRng(seed),
    time: 0,               // simulated seconds since boot
    phase: PHASE.MENU,
    phaseT: 0,             // seconds left in the current phase
    round: 0,
    winsNeeded: 7,
    score: { ember: 0, ash: 0 },
    fighters: [],          // every combatant, the player included
    player: null,
    bomb: {
      carrier: null,       // fighter holding the charge, or null
      dropped: null,       // {x, z} while the charge lies on the ground
      planterRef: null,    // who planted it (payout bookkeeping)
      planted: false,
      site: null,          // SITES entry once planted
      x: 0, z: 0,
      channel: 0,          // plant/defuse progress of the current channel
      channelBy: null,
      channelKind: null,   // 'plant' | 'defuse'
    },
    noises: [],            // {x, z, radius, team, t} — what bots can hear
    feed: [],              // kill feed lines {text, t}
    banner: null,          // {title, sub, until} round/match announcements
    winner: null,          // team that took the round/match
    lastEvent: '',         // short status line for the HUD (e.g. "Charge planted")
    shake: 0,              // camera shake energy, decays in main loop
  };
}

// aliveCount counts a team's standing fighters.
export function aliveCount(state, team) {
  let n = 0;
  for (const f of state.fighters) if (f.team === team && f.alive) n++;
  return n;
}

// addNoise records a sound the bots may react to; entries age out in bots.js.
export function addNoise(state, x, z, radius, team) {
  state.noises.push({ x, z, radius, team, t: state.time });
}

// pushFeed adds a kill-feed line, newest first, capped at five.
export function pushFeed(state, text) {
  state.feed.unshift({ text, t: state.time });
  if (state.feed.length > 5) state.feed.pop();
}
