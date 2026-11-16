// A round, from the freeze to the whistle. This module owns the clock, the breaker, the score and
// the rules that end a round; it asks the bots for nothing and tells them everything through one
// context object, so the bots never reach into the round's state.
import { MATCH } from './config.js';
import { BOT } from './config.js';

export function createRound({ map, bots, economy, hud, events }) {
  const state = {
    phase: 'freeze',
    timer: MATCH.buySeconds,
    round: 1,
    score: { vanguard: 0, cordon: 0 },
    winner: null,
    message: '',
    bomb: {
      carrier: null,
      planted: false,
      defused: false,
      exploded: false,
      x: 0,
      z: 0,
      site: null,
      fuse: 0,
      plantProgress: 0,
      defuseProgress: 0,
    },
    targetSite: 'A',
    over: false,
    roundHistory: [],
  };

  let player = null;
  let arsenal = null;
  let roundKills = [];

  function attach(refs) {
    player = refs.player;
    arsenal = refs.arsenal;
  }

  function teamActors(team) {
    const list = [];
    if (team === 'vanguard' && player) list.push(player);
    for (const bot of bots.bots) if (bot.team === team) list.push(bot);
    return list;
  }

  function allActors() {
    const list = [];
    if (player) list.push(player);
    for (const bot of bots.bots) list.push(bot);
    return list;
  }

  function assignRoles() {
    // Attackers pick one site for the round and split: three go in, two hold the lane behind, so
    // the push has a shape rather than five bodies running at the same door.
    state.targetSite = Math.random() < 0.5 ? 'A' : 'B';
    const attackerSpawns = map.spawns.attacker.slice();
    const defenderSpawns = map.spawns.defender.slice();
    const attackers = bots.bots.filter((bot) => bot.team === 'vanguard');
    const defenders = bots.bots.filter((bot) => bot.team === 'cordon');

    // The player always takes the first attacker spawn; the bots fill the rest.
    if (player) {
      const point = attackerSpawns.shift();
      player.position.x = point.x;
      player.position.y = 0;
      player.position.z = point.z;
      player.yaw = point.yaw;
      player.pitch = 0;
      player.health = 100;
      player.armor = 0;
      player.alive = true;
      player.crouching = false;
      if (arsenal) arsenal.refillAll();
    }
    attackers.forEach((bot, index) => {
      const point = attackerSpawns[index % attackerSpawns.length];
      bots.spawn(bot, point);
      bot.role = index === 0 ? 'carry' : index < 3 ? 'entry' : 'support';
      const loadout = economy.botBuy(bot);
      bot.weapon = loadout.weapon;
      bot.armor = loadout.armor;
      bot.frags = loadout.frags;
      bot.ammo = 30;
      bot.reserve = 90;
    });
    defenders.forEach((bot, index) => {
      const point = defenderSpawns[index % defenderSpawns.length];
      bots.spawn(bot, point);
      const loadout = economy.botBuy(bot);
      bot.weapon = loadout.weapon;
      bot.armor = loadout.armor;
      bot.frags = loadout.frags;
      bot.ammo = 30;
      bot.reserve = 90;
      // Defenders are split across the two sites, with one roamer in the middle.
      bot.role = index === 4 ? 'roam' : index % 2 === 0 ? 'holdA' : 'holdB';
    });

    // The breaker goes to one attacker: the player if they are alive and this is the plan, else
    // the first bot, which is why the carrier role exists.
    const carriers = [player, ...attackers].filter(Boolean);
    state.bomb.carrier = carriers[Math.floor(Math.random() * carriers.length)];
    state.bomb.planted = false;
    state.bomb.defused = false;
    state.bomb.exploded = false;
    state.bomb.fuse = 0;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
    state.bomb.site = null;
    bots.resetHold(state.round);
  }

  function startRound() {
    assignRoles();
    state.phase = 'freeze';
    state.timer = MATCH.buySeconds;
    state.winner = null;
    state.message = `Round ${state.round} — buy phase`;
    roundKills = [];
    events.length = 0;
  }

  function endRound(winner, reason) {
    if (state.phase === 'ended' || state.phase === 'over') return;
    state.phase = 'ended';
    state.timer = MATCH.endSeconds;
    state.winner = winner;
    state.message = reason;
    state.score[winner] += 1;
    economy.settleRound(winner, {
      vanguard: teamActors('vanguard'),
      cordon: teamActors('cordon'),
    });
    state.roundHistory.push({ round: state.round, winner, reason, kills: roundKills.slice() });
    if (state.score[winner] >= MATCH.roundsToWin || state.round >= MATCH.maxRounds) {
      state.over = true;
      state.message = `${winner === 'vanguard' ? 'Vanguard' : 'Cordon'} takes the match`;
    }
  }

  function siteAt(x, z) {
    for (const key of ['A', 'B']) {
      const site = map.sites[key];
      if (Math.hypot(x - site.x, z - site.z) <= site.radius) return site;
    }
    return null;
  }

  function objectiveFor(bot) {
    if (state.phase === 'planted') {
      if (bot.team === 'cordon') return { x: state.bomb.x, z: state.bomb.z };
      return { x: map.sites[state.targetSite].x + 6, z: map.sites[state.targetSite].z + 8 };
    }
    if (bot.team === 'vanguard') {
      const site = map.sites[state.targetSite];
      if (bot.role === 'carry' || bot.role === 'entry') return { x: site.x, z: site.z };
      // Support holds the lane mouth, so the push is covered from behind.
      const laneX = state.targetSite === 'A' ? -20 : 20;
      return { x: laneX, z: -6 };
    }
    if (bot.role === 'roam') return { x: 0, z: -18 };
    const site = map.sites[bot.role === 'holdA' ? 'A' : 'B'];
    return { x: site.x + (bot.role === 'holdA' ? 5 : -5), z: site.z + 4 };
  }

  function roleFor(bot) {
    return bot.role;
  }

  function holdYawFor(bot) {
    if (bot.team === 'cordon') {
      const site = bot.role === 'holdA' ? map.sites.A : bot.role === 'holdB' ? map.sites.B : null;
      if (site) {
        // Look back down the lane the attackers must come from.
        return Math.atan2(-(site.x * 0.2), 1) + (site.x < 0 ? 0.5 : -0.5);
      }
      return 0;
    }
    return Math.atan2(-(map.sites[state.targetSite].x - bot.position.x), -(map.sites[state.targetSite].z - bot.position.z));
  }

  const context = {
    get phase() { return state.phase; },
    bomb: state.bomb,
    siteAt,
    objectiveFor,
    roleFor,
    holdYawFor,
    onPlantProgress(bot, dt, site) {
      state.bomb.plantProgress += dt / MATCH.plantSeconds;
      if (state.bomb.plantProgress >= 1) plantBomb(site, bot);
    },
    onDefuseProgress(bot, dt) {
      state.bomb.defuseProgress += dt / MATCH.defuseSeconds;
      if (state.bomb.defuseProgress >= 1) {
        state.bomb.defused = true;
        economy.award(bot, MATCH.defuseReward);
        endRound('cordon', 'Breaker defused');
      }
    },
  };

  function plantBomb(site, planter) {
    state.bomb.planted = true;
    state.bomb.x = planter.position.x;
    state.bomb.z = planter.position.z;
    state.bomb.site = site.id;
    state.bomb.fuse = MATCH.bombSeconds;
    state.phase = 'planted';
    state.timer = MATCH.bombSeconds;
    state.message = `Breaker planted at ${site.name}`;
    economy.award(planter, MATCH.plantReward);
    for (const bot of bots.bots) if (bot.team === 'cordon') bot.goal = null;
  }

  // The player plants by holding the use key inside a site, and the progress bar in the HUD is the
  // only feedback needed.
  function playerPlant(dt, keys) {
    if (state.phase !== 'live' || !player || !player.alive) return;
    if (state.bomb.carrier !== player) return;
    const site = siteAt(player.position.x, player.position.z);
    const using = keys.has('KeyE');
    if (site && using) {
      state.bomb.plantProgress = Math.min(1, state.bomb.plantProgress + dt / MATCH.plantSeconds);
      if (state.bomb.plantProgress >= 1) plantBomb(site, player);
    } else if (!using) {
      state.bomb.plantProgress = Math.max(0, state.bomb.plantProgress - dt * 0.6);
    }
  }

  function playerDefuse(dt, keys) {
    if (state.phase !== 'planted' || !player || !player.alive) return;
    const distance = Math.hypot(player.position.x - state.bomb.x, player.position.z - state.bomb.z);
    const using = keys.has('KeyE');
    if (distance < 1.9 && using) {
      state.bomb.defuseProgress = Math.min(1, state.bomb.defuseProgress + dt / MATCH.defuseSeconds);
      if (state.bomb.defuseProgress >= 1) {
        state.bomb.defused = true;
        economy.award(player, MATCH.defuseReward);
        endRound('cordon', 'Breaker defused');
      }
    } else if (!using) {
      state.bomb.defuseProgress = Math.max(0, state.bomb.defuseProgress - dt * 0.5);
    }
  }

  function applyEvents(eventList) {
    for (const event of eventList) {
      if (event.type !== 'kill') continue;
      const killer = event.owner ?? null;
      if (killer) economy.killReward(killer, event.weapon);
      roundKills.push({ victim: event.actor.name ?? 'You', killer: killer ? (killer.name ?? 'You') : 'Breaker', weapon: event.weapon, part: event.part });
    }
  }

  function step(dt, keys, now) {
    if (state.phase === 'over') return;
    state.timer = Math.max(0, state.timer - dt);

    if (state.phase === 'freeze') {
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = MATCH.roundSeconds;
        state.message = 'Round live';
      }
      return;
    }

    if (state.phase === 'ended') {
      if (state.timer <= 0) {
        if (state.over) {
          state.phase = 'over';
        } else {
          state.round += 1;
          startRound();
        }
      }
      return;
    }

    playerPlant(dt, keys);
    playerDefuse(dt, keys);

    if (state.phase === 'planted') {
      state.bomb.fuse = Math.max(0, state.bomb.fuse - dt);
      if (state.bomb.fuse <= 0) {
        state.bomb.exploded = true;
        endRound('vanguard', 'Breaker detonated');
        return;
      }
    }

    const attackersLeft = teamActors('vanguard').filter((actor) => actor.alive).length;
    const defendersLeft = teamActors('cordon').filter((actor) => actor.alive).length;

    if (state.phase === 'live') {
      if (attackersLeft === 0) {
        endRound('cordon', 'Vanguard eliminated');
        return;
      }
      if (defendersLeft === 0) {
        // An empty site still has to be taken: with no defenders left the attackers only win once
        // the breaker is down, unless there is nobody left to defuse it — which is now true.
        endRound('vanguard', 'Cordon eliminated');
        return;
      }
      if (state.timer <= 0) {
        endRound('cordon', 'Time ran out');
      }
      return;
    }

    if (state.phase === 'planted') {
      if (attackersLeft === 0) {
        // The breaker still runs: the round is the bomb's, not the team's.
        return;
      }
      if (defendersLeft === 0) {
        return;
      }
    }
  }

  function snapshot() {
    return {
      phase: state.phase,
      timer: state.timer,
      round: state.round,
      score: { ...state.score },
      winner: state.winner,
      message: state.message,
      bomb: { ...state.bomb },
      targetSite: state.targetSite,
      over: state.over,
      roundHistory: state.roundHistory,
    };
  }

  startRound();

  return {
    state,
    context,
    attach,
    startRound,
    step,
    snapshot,
    applyEvents,
    teamActors,
    allActors,
    siteAt,
    endRound,
    setPlayer(refs) { player = refs.player; arsenal = refs.arsenal; },
  };
}
