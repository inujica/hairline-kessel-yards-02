// The money game. Every body — the player's and each bot's — carries a wallet, a win pays the
// whole team, a loss pays a little more each time it happens in a row, and a kill pays by the
// weapon used. That is what makes a lost round a decision about the next one.
import { MATCH, WEAPONS, GEAR } from './config.js';

export function createEconomy() {
  const wallets = new Map();

  function walletFor(actor) {
    let wallet = wallets.get(actor);
    if (!wallet) {
      wallet = { money: MATCH.startMoney, lossStreak: 0 };
      wallets.set(actor, wallet);
    }
    return wallet;
  }

  function reset() {
    for (const wallet of wallets.values()) {
      wallet.money = MATCH.startMoney;
      wallet.lossStreak = 0;
    }
  }

  function money(actor) {
    return walletFor(actor).money;
  }

  function award(actor, amount) {
    const wallet = walletFor(actor);
    wallet.money = Math.max(0, Math.min(MATCH.maxMoney, wallet.money + amount));
    return wallet.money;
  }

  function spend(actor, amount) {
    const wallet = walletFor(actor);
    if (wallet.money < amount) return false;
    wallet.money -= amount;
    return true;
  }

  // Round end: the winners are paid flat, the losers are paid by how long they have been losing,
  // and both streaks move. A plant or a defuse pays the individual who did it.
  function settleRound(winner, teams) {
    for (const team of ['vanguard', 'cordon']) {
      const members = teams[team] ?? [];
      for (const actor of members) {
        const wallet = walletFor(actor);
        if (team === winner) {
          award(actor, MATCH.winReward);
          wallet.lossStreak = 0;
        } else {
          const pay = Math.min(MATCH.lossMax, MATCH.lossBase + wallet.lossStreak * MATCH.lossStep);
          award(actor, pay);
          wallet.lossStreak = Math.min(4, wallet.lossStreak + 1);
        }
      }
    }
  }

  function killReward(killer, weaponId) {
    const weapon = WEAPONS[weaponId];
    if (!weapon) return 0;
    return award(killer, weapon.killReward);
  }

  // A bot shops on a simple ladder: rifle if it can afford one and has none, then armour, then a
  // frag with what is left. It is deliberately not clever — it just must not walk out with a
  // pistol every round, which is what a bot with no economy does.
  function botBuy(bot) {
    const budget = money(bot);
    const loadout = { weapon: 'shortline', armor: 0, frags: 0, spent: 0 };
    if (budget >= WEAPONS.kessel.price + GEAR.plate.price && Math.random() < 0.82) {
      loadout.weapon = 'kessel';
      loadout.spent += WEAPONS.kessel.price;
      loadout.armor = GEAR.plate.durability;
      loadout.spent += GEAR.plate.price;
    } else if (budget >= WEAPONS.vespa.price + GEAR.plate.price && Math.random() < 0.7) {
      loadout.weapon = 'vespa';
      loadout.spent += WEAPONS.vespa.price;
      loadout.armor = GEAR.plate.durability;
      loadout.spent += GEAR.plate.price;
    } else if (budget >= WEAPONS.breech.price) {
      loadout.weapon = 'breech';
      loadout.spent += WEAPONS.breech.price;
    } else if (budget >= GEAR.plate.price) {
      loadout.armor = GEAR.plate.durability;
      loadout.spent += GEAR.plate.price;
    }
    const remaining = budget - loadout.spent;
    if (remaining >= GEAR.frag.price && Math.random() < 0.55) {
      loadout.frags = 1;
      loadout.spent += GEAR.frag.price;
    }
    spend(bot, loadout.spent);
    return loadout;
  }

  return { money, award, spend, settleRound, killReward, botBuy, reset, walletFor };
}
