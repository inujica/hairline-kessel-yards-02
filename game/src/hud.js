// The HUD is DOM, not canvas: text stays crisp at any resolution and the panels are styled with the
// same six colours as the map. This module owns every element the player reads, and it is the only
// place that touches the document.
import { WEAPONS, GEAR, MATCH } from './config.js';
import { MATERIALS } from './palette.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const nodes = {
    health: el('hud-health'),
    healthBar: el('hud-health-bar'),
    armor: el('hud-armor'),
    ammoMag: el('hud-ammo-mag'),
    ammoReserve: el('hud-ammo-reserve'),
    ammoName: el('hud-ammo-name'),
    money: el('hud-money'),
    timer: el('hud-timer'),
    phase: el('hud-phase'),
    scoreUs: el('hud-score-us'),
    scoreThem: el('hud-score-them'),
    round: el('hud-round'),
    feed: el('hud-feed'),
    banner: el('hud-banner'),
    bannerTitle: el('hud-banner-title'),
    bannerCopy: el('hud-banner-copy'),
    bomb: el('hud-bomb'),
    bombTimer: el('hud-bomb-timer'),
    progress: el('hud-progress'),
    progressBar: el('hud-progress-bar'),
    progressLabel: el('hud-progress-label'),
    crosshair: el('crosshair'),
    hitmarker: el('hitmarker'),
    buy: el('buy'),
    buyMoney: el('buy-money'),
    buyGrid: el('buy-grid'),
    buyHint: el('buy-hint'),
    vignette: el('vignette'),
    radar: el('radar'),
    scoreboard: el('scoreboard'),
    scoreboardRows: el('scoreboard-rows'),
    overlay: el('overlay'),
    overlayTitle: el('overlay-title'),
    overlayCopy: el('overlay-copy'),
    overlayAction: el('overlay-action'),
    frags: el('hud-frags'),
    objective: el('hud-objective'),
  };

  const radarContext = nodes.radar.getContext('2d');
  let hitTimer = 0;
  let vignetteTimer = 0;
  let bannerTimer = 0;
  let buyOpen = false;
  let onBuy = null;
  let buyCursor = 0;
  let buyItems = [];

  // ---------------------------------------------------------------- buy menu
  function buildBuyItems() {
    const items = [];
    for (const weapon of Object.values(WEAPONS)) {
      if (weapon.price <= 0) continue;
      items.push({
        kind: 'weapon', id: weapon.id, name: weapon.name, price: weapon.price,
        note: `${weapon.magazine} rounds · ${Math.round(weapon.damage)} dmg`,
      });
    }
    items.push({ kind: 'gear', id: 'plate', name: GEAR.plate.name, price: GEAR.plate.price, note: 'soaks 45% of body damage' });
    items.push({ kind: 'gear', id: 'frag', name: GEAR.frag.name, price: GEAR.frag.price, note: 'thrown with G' });
    return items;
  }

  function renderBuy(money, owned) {
    buyItems = buildBuyItems();
    nodes.buyMoney.textContent = `$${money}`;
    nodes.buyGrid.innerHTML = '';
    buyItems.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      if (item.price > money) button.classList.add('is-locked');
      if (owned.has(item.id)) button.classList.add('is-owned');
      if (index === buyCursor) button.classList.add('is-cursor');
      button.innerHTML = `<span class="buy-key">${index + 1}</span>
        <span class="buy-name">${item.name}</span>
        <span class="buy-price">$${item.price}</span>
        <span class="buy-note">${item.note}</span>`;
      button.addEventListener('click', () => {
        if (item.price <= money && onBuy) onBuy(item);
      });
      nodes.buyGrid.appendChild(button);
    });
  }

  function openBuy(money, owned) {
    buyOpen = true;
    buyCursor = 0;
    renderBuy(money, owned);
    nodes.buy.hidden = false;
    nodes.buyHint.textContent = `1–${buyItems.length} to buy · B or Escape to close`;
  }

  function closeBuy() {
    buyOpen = false;
    nodes.buy.hidden = true;
  }

  function moveBuyCursor(delta) {
    if (!buyItems.length) return;
    buyCursor = (buyCursor + delta + buyItems.length) % buyItems.length;
    const buttons = nodes.buyGrid.querySelectorAll('.buy-item');
    buttons.forEach((button, index) => button.classList.toggle('is-cursor', index === buyCursor));
  }

  function chooseBuyIndex(index) {
    const item = buyItems[index];
    if (!item || !onBuy) return null;
    return item;
  }

  return {
    nodes,
    get buyOpen() { return buyOpen; },
    onBuy(callback) { onBuy = callback; },
    openBuy,
    closeBuy,
    moveBuyCursor,
    chooseBuyIndex,
    buyItemAt(index) { return buyItems[index] ?? null; },
    refreshBuy(money, owned) { if (buyOpen) renderBuy(money, owned); },

    setVitals(health, armor) {
      nodes.health.textContent = Math.max(0, Math.round(health));
      nodes.healthBar.style.width = `${Math.max(0, Math.min(100, health))}%`;
      nodes.armor.textContent = Math.max(0, Math.round(armor));
      nodes.healthBar.classList.toggle('is-low', health <= 32);
    },
    setAmmo(mag, reserve, weaponId) {
      nodes.ammoMag.textContent = mag;
      nodes.ammoReserve.textContent = `/ ${reserve}`;
      nodes.ammoName.textContent = WEAPONS[weaponId]?.name ?? '';
      nodes.ammoMag.classList.toggle('is-empty', mag === 0);
    },
    setMoney(money) {
      nodes.money.textContent = `$${money}`;
    },
    setFrags(count) {
      nodes.frags.textContent = count > 0 ? `⌾ ${count}` : '';
    },
    setScore(us, them) {
      nodes.scoreUs.textContent = us;
      nodes.scoreThem.textContent = them;
    },
    setRound(round) {
      nodes.round.textContent = `R${round}`;
    },
    setTimer(seconds, phase) {
      const total = Math.max(0, Math.ceil(seconds));
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      nodes.timer.textContent = `${minutes}:${String(rest).padStart(2, '0')}`;
      nodes.timer.classList.toggle('is-critical', total <= 10 && phase !== 'freeze' && phase !== 'ended');
      nodes.phase.textContent = phase === 'freeze' ? 'BUY PHASE'
        : phase === 'planted' ? 'BREAKER DOWN'
        : phase === 'ended' ? 'NEXT ROUND IN'
        : phase === 'over' ? 'MATCH OVER'
        : 'ROUND LIVE';
    },
    setBomb(bomb) {
      const active = bomb.planted && !bomb.defused && !bomb.exploded;
      nodes.bomb.hidden = !active;
      if (active) {
        nodes.bombTimer.textContent = Math.max(0, Math.ceil(bomb.fuse));
        nodes.bombTimer.classList.toggle('is-critical', bomb.fuse <= 10);
      }
    },
    setProgress(label, value) {
      if (!label || value <= 0) {
        nodes.progress.hidden = true;
        return;
      }
      nodes.progress.hidden = false;
      nodes.progressLabel.textContent = label;
      nodes.progressBar.style.width = `${Math.min(100, value * 100)}%`;
    },
    setObjective(text) {
      nodes.objective.textContent = text;
    },
    hitMarker(killed, headshot, holdMs = 110) {
      nodes.hitmarker.classList.add('on');
      nodes.hitmarker.classList.toggle('is-kill', killed);
      nodes.hitmarker.classList.toggle('is-head', headshot);
      hitTimer = holdMs / 1000;
    },
    damageFlash() {
      vignetteTimer = 0.32;
    },
    feed(line) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.textContent = line;
      nodes.feed.prepend(row);
      while (nodes.feed.children.length > 5) nodes.feed.lastChild.remove();
    },
    banner(title, copy, seconds = 2.6) {
      nodes.bannerTitle.textContent = title;
      nodes.bannerCopy.textContent = copy;
      nodes.banner.hidden = false;
      bannerTimer = seconds;
    },
    showOverlay(mode, extra) {
      nodes.overlay.hidden = false;
      if (mode === 'start') {
        nodes.overlayTitle.textContent = 'HAIRLINE';
        nodes.overlayCopy.textContent = 'Kessel Yards. Vanguard pushes the breaker into the tank yard or the freight house; Cordon holds it out. Click to take a rifle.';
        nodes.overlayAction.textContent = 'Click to deploy';
      } else if (mode === 'paused') {
        nodes.overlayTitle.textContent = 'Paused';
        nodes.overlayCopy.textContent = 'The round is still running. Click to return.';
        nodes.overlayAction.textContent = 'Resume';
      } else if (mode === 'end') {
        nodes.overlayTitle.textContent = extra?.title ?? 'Match over';
        nodes.overlayCopy.textContent = extra?.copy ?? '';
        nodes.overlayAction.textContent = 'Play again';
      }
    },
    hideOverlay() {
      nodes.overlay.hidden = true;
    },
    setCrosshairSpread(spread) {
      const gap = Math.min(26, 4 + spread * 420);
      nodes.crosshair.style.setProperty('--gap', `${gap}px`);
    },
    showScoreboard(show, rows) {
      nodes.scoreboard.hidden = !show;
      if (show && rows) {
        nodes.scoreboardRows.innerHTML = rows.map((row) => (
          `<div class="sb-row ${row.team === 'vanguard' ? 'is-us' : ''}">
            <span class="sb-name">${row.name}</span>
            <span class="sb-k">${row.kills}</span>
            <span class="sb-d">${row.deaths}</span>
            <span class="sb-money">$${row.money}</span>
          </div>`
        )).join('');
      }
    },
    // The radar is drawn from what the team can see: teammates always, enemies only while a
    // teammate has them in sight. That is a real tactical read, not an omniscient map.
    drawRadar(player, bots, spotted, map, bomb) {
      const size = nodes.radar.width;
      const scale = size / 124;
      radarContext.clearRect(0, 0, size, size);
      radarContext.fillStyle = 'rgba(16,20,24,0.62)';
      radarContext.fillRect(0, 0, size, size);

      function project(x, z) {
        return [size / 2 + x * scale, size / 2 + z * scale];
      }

      radarContext.strokeStyle = 'rgba(58,67,79,1)';
      radarContext.lineWidth = 1;
      radarContext.strokeRect(0.5, 0.5, size - 1, size - 1);
      for (const site of Object.values(map.sites)) {
        const [sx, sy] = project(site.x, site.z);
        radarContext.beginPath();
        radarContext.arc(sx, sy, site.radius * scale, 0, Math.PI * 2);
        radarContext.stroke();
      }

      for (const bot of bots) {
        if (!bot.alive) continue;
        const [bx, by] = project(bot.position.x, bot.position.z);
        const visible = bot.team === 'vanguard' || spotted.has(bot);
        if (!visible) continue;
        radarContext.fillStyle = bot.team === 'vanguard' ? MATERIALS.vanguard : MATERIALS.cordon;
        radarContext.beginPath();
        radarContext.arc(bx, by, 2.6, 0, Math.PI * 2);
        radarContext.fill();
      }

      if (player.alive) {
        const [px, py] = project(player.position.x, player.position.z);
        radarContext.fillStyle = MATERIALS.accent;
        radarContext.beginPath();
        radarContext.arc(px, py, 3.4, 0, Math.PI * 2);
        radarContext.fill();
        radarContext.strokeStyle = MATERIALS.accent;
        radarContext.beginPath();
        radarContext.moveTo(px, py);
        radarContext.lineTo(px - Math.sin(player.yaw) * 9, py - Math.cos(player.yaw) * 9);
        radarContext.stroke();
      }

      if (bomb.planted && !bomb.defused) {
        const [ox, oy] = project(bomb.x, bomb.z);
        radarContext.fillStyle = MATERIALS.accent;
        radarContext.fillRect(ox - 3, oy - 3, 6, 6);
      }
    },
    // Per-frame decay of the transient HUD effects, kept here so main.js stays a loop.
    tick(dt) {
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) nodes.hitmarker.classList.remove('on');
      }
      if (vignetteTimer > 0) {
        vignetteTimer -= dt;
        nodes.vignette.style.opacity = String(Math.max(0, vignetteTimer / 0.32) * 0.55);
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) nodes.banner.hidden = true;
      }
    },
  };
}
