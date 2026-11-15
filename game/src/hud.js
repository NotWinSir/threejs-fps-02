// hud.js — every DOM readout: health, armour, ammo, money, the round
// clock, the score, the kill feed, the charge status, the channel bar
// and the buy menu. It only reads state; the simulation never reads it
// back, so a stale HUD can never corrupt a round.

import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, BUY_MENU } from './weapons.js';
import { PHASE, aliveCount } from './state.js';

const $ = (id) => document.getElementById(id);

export function grabDom() {
  return {
    hud: $('hud'), healthFill: $('health-fill'), healthNum: $('health-num'),
    armorTag: $('armor-tag'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'), money: $('money'), timer: $('timer'),
    scoreLine: $('score-line'), aliveLine: $('alive-line'), feed: $('feed'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    eventLine: $('event-line'), hitmarker: $('hitmarker'), crosshair: $('crosshair'),
    channel: $('channel'), channelFill: $('channel-fill'), channelLabel: $('channel-label'),
    buyMenu: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'),
    chargeTag: $('charge-tag'), prompt: $('prompt'), dmgFlash: $('dmg-flash'),
    overlay: $('overlay'), overlayPlay: $('play'), overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'), spectate: $('spectate'),
  };
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// updateHud refreshes every readout from state. Called once per frame;
// the buy menu rebuilds only when its signature (money/owned/phase)
// changes, so it never churns the DOM mid-click.
let buySignature = '';
export function updateHud(dom, state, world) {
  const p = state.player;
  const inRound = state.phase !== PHASE.MENU;

  dom.hud.style.opacity = inRound ? '1' : '0';
  dom.healthFill.style.width = `${Math.max(0, p.hp)}%`;
  dom.healthFill.style.background = p.hp > 35 ? 'var(--teal)' : 'var(--ember)';
  dom.healthNum.textContent = p.alive ? String(Math.ceil(p.hp)) : '0';
  dom.armorTag.textContent = p.armor ? 'ARMOURED' : '';
  dom.ammoMag.textContent = String(p.mag);
  dom.ammoReserve.textContent = `/ ${p.reserve}`;
  dom.weaponName.textContent = WEAPONS[p.weaponKey].name + (p.grenades > 0 ? `  ·  frag ×${p.grenades}` : '');
  dom.money.textContent = `$${p.money}`;
  dom.timer.textContent =
    state.phase === PHASE.BUY ? `BUY ${fmtTime(state.phaseT)}` :
    state.phase === PHASE.PLANTED ? `⚠ ${fmtTime(state.phaseT)}` :
    fmtTime(state.phaseT);
  dom.timer.style.color = state.phase === PHASE.PLANTED ? 'var(--ember)' : '';
  dom.scoreLine.innerHTML =
    `EMBER <b>${state.score.ember}</b> — <b>${state.score.ash}</b> ASH · ROUND ${Math.max(1, state.round)}`;
  dom.aliveLine.textContent = `${aliveCount(state, 'ember')}v${aliveCount(state, 'ash')}`;

  // Charge status: who holds it, or the countdown once planted.
  const bomb = state.bomb;
  if (bomb.planted) {
    dom.chargeTag.textContent = `CHARGE PLANTED — ${bomb.site.id} · ${fmtTime(state.phaseT)}`;
    dom.chargeTag.style.color = 'var(--ember)';
  } else if (bomb.carrier) {
    dom.chargeTag.textContent = bomb.carrier.isPlayer ? 'YOU HOLD THE CHARGE — plant at A or B (hold E)' : `${bomb.carrier.name} holds the charge`;
    dom.chargeTag.style.color = '';
  } else if (bomb.dropped) {
    dom.chargeTag.textContent = 'CHARGE DROPPED';
    dom.chargeTag.style.color = 'var(--ember)';
  } else {
    dom.chargeTag.textContent = '';
  }

  dom.hitmarker.style.opacity = world && state.time < world.hitmarkUntil ? '1' : '0';

  dom.eventLine.textContent = state.lastEvent || '';
  dom.feed.innerHTML = state.feed
    .filter((line) => state.time - line.t < 6)
    .map((line) => `<div>${line.text}</div>`)
    .join('');

  // Banner (round/match announcements).
  if (state.banner && state.time < state.banner.until) {
    dom.banner.style.opacity = '1';
    dom.bannerTitle.textContent = state.banner.title;
    dom.bannerSub.textContent = state.banner.sub;
  } else {
    dom.banner.style.opacity = '0';
  }

  // Channel progress (planting / defusing).
  if (bomb.channelBy) {
    dom.channel.style.opacity = '1';
    const need = bomb.channelKind === 'plant' ? 3 : 5;
    dom.channelFill.style.width = `${Math.min(100, (bomb.channel / need) * 100)}%`;
    dom.channelLabel.textContent = bomb.channelKind === 'plant' ? 'PLANTING…' : 'DEFUSING…';
  } else {
    dom.channel.style.opacity = '0';
  }

  // Context prompt: plant when standing on a site with the charge.
  let prompt = '';
  if (p.alive && p.hasCharge && state.plan?.site && state.phase === PHASE.LIVE) {
    const s = state.plan.site;
    if (Math.hypot(s.plant.x - p.pos.x, s.plant.z - p.pos.z) < 1.8) {
      prompt = `Hold E to plant at ${s.name}`;
    }
  }
  dom.prompt.textContent = prompt;

  // Spectate note after death.
  dom.spectate.textContent = !p.alive && (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED)
    ? 'You are down — watching your squad' : '';

  // Damage flash fades from the last hurt moment.
  const sinceHurt = state.time - (p.lastHurtAt || -9);
  dom.dmgFlash.style.opacity = p.alive && sinceHurt < 0.35 ? String(0.5 * (1 - sinceHurt / 0.35)) : '0';

  // Buy menu.
  const showBuy = state.phase === PHASE.BUY;
  dom.buyMenu.style.display = showBuy ? 'block' : 'none';
  if (showBuy) {
    const sig = `${p.money}|${Object.keys(p.owned).join(',')}|${p.grenades}|${p.armor}`;
    if (sig !== buySignature) {
      buySignature = sig;
      dom.buyMoney.textContent = `Your money: $${p.money} — press a number key or click`;
      const rows = [];
      BUY_MENU.forEach((key, i) => {
        const def = WEAPONS[key];
        const owned = !!p.owned[key];
        const afford = p.money >= def.price;
        rows.push(`<button class="buy-item" data-buy="${key}" ${owned ? 'disabled' : ''}>
          <span class="buy-key">${i + 1}</span> ${def.name}
          <span class="buy-price">${owned ? 'OWNED' : afford ? `$${def.price}` : `$${def.price} — short`}</span></button>`);
      });
      rows.push(`<button class="buy-item" data-buy="grenade" ${p.grenades >= 1 ? 'disabled' : ''}>
        <span class="buy-key">5</span> Frag Grenade <span class="buy-price">${p.grenades >= 1 ? 'CARRIED' : `$${GRENADE_PRICE}`}</span></button>`);
      rows.push(`<button class="buy-item" data-buy="armor" ${p.armor ? 'disabled' : ''}>
        <span class="buy-key">6</span> Armour Vest <span class="buy-price">${p.armor ? 'WORN' : `$${ARMOR_PRICE}`}</span></button>`);
      dom.buyItems.innerHTML = rows.join('');
    }
  }
}
