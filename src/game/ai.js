// Enemy AI: economy management + build order + escalating military.
// Drives the same game API the player uses, on a slow decision tick.
export class EnemyAI {
  constructor(game, team) {
    this.g = game;
    this.team = team;
    this.decideTimer = 0;
    this.raidTimer = 70;          // first raid window after Feudal
    this.assaultDone = false;
    this.army = [];               // units staged for attack
    this.desiredVillagers = 14;
    this.buildCooldown = 0;
    this.lastAdvance = 0;
  }

  update(dt) {
    this.decideTimer -= dt;
    this.buildCooldown -= dt;
    if (this.decideTimer > 0) return;
    this.decideTimer = 1.0;       // think once per second
    const g = this.g, t = this.team;

    const res = g.resources[t];
    const vills = g.unitsOf(t).filter(u => u.kind === 'villager' && !u.dead);
    const army = g.unitsOf(t).filter(u => u.kind !== 'villager' && !u.dead);
    const blds = g.buildingsOf(t).filter(b => !b.dead);
    const tc = blds.find(b => b.key === 'towncenter');
    if (!tc) return; // dead, game handles loss
    const age = g.age[t];
    const pop = g.pop(t), cap = g.popCap(t);

    // --- Keep villagers working ---
    for (const v of vills) {
      if (v.state === 'idle') g.aiAssignGather(v);
    }

    // --- Housing ---
    if (pop >= cap - 2 && cap < 60 && g.canAfford(t, { wood: 30 }) && this.buildCooldown <= 0) {
      if (g.aiPlaceBuilding('house')) { this.buildCooldown = 4; return; }
    }

    // --- Train villagers up to target ---
    if (vills.length < this.desiredVillagers && tc.queue.length < 3 && g.canAfford(t, { food: 50 }) && pop < cap) {
      g.aiTrain(tc, 'villager');
    }

    // --- Economy buildings build order ---
    const have = key => blds.some(b => b.key === key);
    const order = [];
    if (!have('lumbercamp')) order.push('lumbercamp');
    if (!have('mill')) order.push('mill');
    if (!have('miningcamp')) order.push('miningcamp');
    if (!have('barracks') && vills.length >= 6) order.push('barracks');
    if (age >= 1 && !have('archery')) order.push('archery');
    if (age >= 1 && blds.filter(b => b.key === 'tower').length < 2 && g.canAfford(t, { gold: 100 })) order.push('tower');

    if (order.length && this.buildCooldown <= 0) {
      const key = order[0];
      if (g.canAfford(t, g.buildCost(key)) && g.aiPlaceBuilding(key)) { this.buildCooldown = 5; }
    }

    // --- Advance ages ---
    if (age < 2) {
      const cost = g.ageCost(age + 1);
      const ready = (age === 0 && vills.length >= 8) || (age === 1 && army.length >= 4);
      if (ready && g.canAfford(t, cost) && g.timeNow - this.lastAdvance > 10) {
        g.aiAdvance();
        this.lastAdvance = g.timeNow;
        this.desiredVillagers = age === 0 ? 18 : 22;
      }
    }

    // --- Military production ---
    const barracks = blds.find(b => b.key === 'barracks' && b.complete);
    const range = blds.find(b => b.key === 'archery' && b.complete);
    if (age >= 1) {
      if (barracks && barracks.queue.length < 2) {
        const unit = age >= 2 ? 'knight' : 'manatarms';
        if (g.canAfford(t, g.unitCost(unit)) && pop < cap) g.aiTrain(barracks, unit);
      }
      if (range && range.queue.length < 2 && g.canAfford(t, g.unitCost('archer')) && pop < cap) {
        g.aiTrain(range, 'archer');
      }
    }

    // --- Aggression ---
    this._military(dt, army, age, blds);
  }

  _military(dt, army, age, blds) {
    const g = this.g, t = this.team;
    this.raidTimer -= 1.0;

    const idleArmy = army.filter(u => u.state === 'idle' || u.state === 'move');

    if (age >= 2 && army.length >= 8 && !this.assaultDone) {
      // Full assault on Castle Age
      this.assaultDone = true;
      g.toast('The enemy launches a full assault!');
      g.aiAttackMove(army, g.enemyMainPos(t));
      this.raidTimer = 60;
      return;
    }

    if (age >= 1 && this.raidTimer <= 0 && idleArmy.length >= 3) {
      // raiding party of 3-5
      const party = idleArmy.slice(0, Math.min(5, idleArmy.length));
      g.aiAttackMove(party, g.enemyMainPos(t));
      this.raidTimer = 90 + Math.random() * 30;
    }

    // re-issue assault if it stalls and army regrouped
    if (this.assaultDone && idleArmy.length >= 10) {
      g.aiAttackMove(idleArmy, g.enemyMainPos(t));
    }

    // defend: if enemy units near base, rally idle army to defend
    const tc = blds.find(b => b.key === 'towncenter');
    if (tc) {
      const threat = g.unitsOf(1 - t).find(u => !u.dead && u.pos.distanceTo(tc.pos) < 22);
      if (threat && idleArmy.length) g.aiAttackMove(idleArmy, threat.pos.clone());
    }
  }
}
