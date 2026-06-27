// DOM HUD layer. Game pushes state in; HUD calls back on user actions.
import { UNIT_DEFS, BUILDING_DEFS, AGES } from '../config.js';

const ICONS = {
  villager: '🧑‍🌾', militia: '🗡️', manatarms: '⚔️', archer: '🏹', knight: '🐎',
  towncenter: '🏛️', house: '🏠', lumbercamp: '🪵', mill: '🌾', miningcamp: '⛏️',
  barracks: '🛡️', archery: '🎯', tower: '🗼',
  advance: '⏫', stop: '✋', rally: '🚩', wood: '🪵', food: '🍖', gold: '🪙',
};

export class HUD {
  constructor(cb) {
    this.cb = cb;
    this.$ = id => document.getElementById(id);
    this.woodEl = this.$('res-wood').querySelector('.val');
    this.foodEl = this.$('res-food').querySelector('.val');
    this.goldEl = this.$('res-gold').querySelector('.val');
    this.popEl = this.$('res-pop').querySelector('.val');
    this.ageEl = this.$('res-age').querySelector('.age-label');
    this.clockEl = this.$('res-clock');
    this.panel = this.$('command-panel');
    this.actionGrid = this.$('action-grid');
    this.selName = this.$('sel-name');
    this.selPortrait = this.$('sel-portrait');
    this.selStats = this.$('sel-stats');
    this.hpFill = this.$('sel-hpfill');
    this.toastEl = this.$('toast');
    this.alertsEl = this.$('alerts');
    this._toastTimer = null;
    this._lastSig = '';

    this.$('end-replay').onclick = () => this.cb.onReplay();
    window.addEventListener('keydown', e => { if (e.key === 'h' || e.key === 'H') this._toggleHelp(); });
    this._buildOnboarding();
  }

  _buildOnboarding() {
    const app = document.getElementById('app');
    // Welcome modal
    const w = document.createElement('div'); w.id = 'welcome'; w.className = 'hidden';
    w.innerHTML = `
      <div class="welcome-card">
        <div class="welcome-title">AGE OF EMPIRE</div>
        <div class="welcome-sub">Build an empire. Raise an army. Raze the enemy keep.</div>
        <div class="welcome-cols">
          <div class="welcome-col">
            <div class="wc-h">🎯 Objective</div>
            <p>Gather <b>wood, food &amp; gold</b>, grow your town, train an army, advance through the Ages, and <b>destroy the enemy Town Center</b> before they destroy yours.</p>
          </div>
          <div class="welcome-col" id="welcome-controls"></div>
        </div>
        <button id="welcome-start">▶ Play</button>
      </div>`;
    app.appendChild(w);
    this.welcome = w;
    w.querySelector('#welcome-start').onclick = () => { w.classList.add('hidden'); if (this.cb.onStart) this.cb.onStart(); };

    // Objectives tracker
    const o = document.createElement('div'); o.id = 'objectives'; o.className = 'hud hidden';
    o.innerHTML = `<div class="obj-title">Objectives</div><div class="obj-list"></div>`;
    app.appendChild(o);
    this.objectivesEl = o; this.objListEl = o.querySelector('.obj-list');
  }

  showWelcome(isTouch) {
    const ctrls = this.welcome.querySelector('#welcome-controls');
    ctrls.innerHTML = isTouch ? `
      <div class="wc-h">📱 Touch controls</div>
      <ul>
        <li><b>Tap</b> a unit/building to select</li>
        <li><b>Tap</b> ground/enemy/tree to move · gather · attack</li>
        <li><b>Drag</b> one finger to pan</li>
        <li><b>Pinch</b> to zoom · <b>twist</b> two fingers to rotate</li>
        <li><b>⛶</b> button toggles box-select</li>
      </ul>` : `
      <div class="wc-h">🖱️ Controls</div>
      <ul>
        <li><b>Left-click</b> select · <b>drag</b> box-select</li>
        <li><b>Right-click</b> move · gather · attack</li>
        <li><b>WASD</b> / edge pan · <b>wheel</b> zoom · <b>MMB</b> rotate</li>
        <li>Build &amp; train from the panel (bottom-left)</li>
      </ul>`;
    this.welcome.classList.remove('hidden');
  }

  setObjectives(list) {
    this.objectivesEl.classList.remove('hidden');
    this.objListEl.innerHTML = list.map(o =>
      `<div class="obj ${o.done ? 'done' : ''} ${o.active ? 'active' : ''}"><span class="obj-box">${o.done ? '✓' : ''}</span>${o.text}</div>`
    ).join('');
  }

  showGame() {
    for (const id of ['resource-bar', 'minimap-wrap', 'command-panel', 'help-hint'])
      this.$(id).classList.remove('hidden');
  }
  hideLoading() { this.$('loading').classList.add('hidden'); }
  setLoadingProgress(p, tip) {
    this.$('loading').querySelector('.loading-fill').style.width = `${Math.round(p * 100)}%`;
    if (tip) this.$('loading').querySelector('.loading-tip').textContent = tip;
  }
  _toggleHelp() { this.$('help-hint').classList.toggle('hidden'); }

  setResources(r, pop, cap, age) {
    this.woodEl.textContent = Math.floor(r.wood);
    this.foodEl.textContent = Math.floor(r.food);
    this.goldEl.textContent = Math.floor(r.gold);
    this.popEl.textContent = `${pop}/${cap}`;
    this.ageEl.textContent = AGES[age].name;
  }
  flashResource(which) {
    const el = this.$(`res-${which}`);
    if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  setClock(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    this.clockEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), 3200);
  }
  alert(msg) {
    const d = document.createElement('div'); d.className = 'alert'; d.textContent = msg;
    this.alertsEl.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  clearSelection() { this.selName.textContent = '—'; this.selPortrait.textContent = ''; this.selStats.textContent = ''; this.hpFill.style.width = '0%'; this.actionGrid.innerHTML = ''; this._lastSig = ''; }

  // sel = { kind:'units'|'building'|'none', ... } describing current selection + context
  renderSelection(sel, ctx) {
    const sig = JSON.stringify({ s: sel.sig, age: ctx.age, res: [Math.floor(ctx.res.wood/10),Math.floor(ctx.res.food/10),Math.floor(ctx.res.gold/10)], build: ctx.buildMode });
    // header info always refreshes (hp/queue), buttons only when signature changes
    if (sel.kind === 'none') { this.clearSelection(); return; }

    if (sel.kind === 'units') {
      const lead = sel.lead;
      this.selPortrait.textContent = ICONS[lead.typeKey] || '🧍';
      this.selName.textContent = sel.count > 1 ? `${sel.count} units` : lead.def.name;
      this.hpFill.style.width = `${Math.max(0, lead.hp / lead.maxHp * 100)}%`;
      this.selStats.textContent = sel.count > 1
        ? `Mixed group · avg HP ${Math.round(sel.avgHp)}`
        : `HP ${Math.ceil(lead.hp)}/${lead.maxHp}  ATK ${lead.def.dmg}  ${lead.def.ranged ? 'RNG ' + lead.def.range : 'melee'}`;
    } else if (sel.kind === 'building') {
      const b = sel.b;
      this.selPortrait.textContent = ICONS[b.key] || '🏚️';
      this.selName.textContent = b.def.name + (b.complete ? '' : ` (building ${Math.round(b.buildProgress * 100)}%)`);
      this.hpFill.style.width = `${Math.max(0, b.hp / b.maxHp * 100)}%`;
      this.selStats.textContent = `HP ${Math.ceil(b.hp)}/${b.maxHp}`;
    }

    if (sig === this._lastSig) { this._updateQueues(sel); return; }
    this._lastSig = sig;
    this.actionGrid.innerHTML = '';

    if (sel.kind === 'units' && sel.canBuild) {
      // villager build menu
      const builds = ['house', 'lumbercamp', 'mill', 'miningcamp', 'barracks', 'archery', 'tower'];
      for (const key of builds) {
        const def = BUILDING_DEFS[key];
        const locked = def.minAge > ctx.age;
        const afford = ctx.afford(def.cost);
        this._btn(ICONS[key], def.name, def.cost, locked || !afford, ctx.buildMode === key, () => this.cb.onBuild(key));
      }
      this._btn(ICONS.stop, 'Stop', null, false, false, () => this.cb.onAction('stop'));
    } else if (sel.kind === 'units') {
      this._btn(ICONS.stop, 'Stop', null, false, false, () => this.cb.onAction('stop'));
      this._btn('🛡️', 'Hold', null, false, false, () => this.cb.onAction('hold'));
    } else if (sel.kind === 'building') {
      const b = sel.b;
      if (b.complete && b.def.provides && b.def.provides.length) {
        for (const uk of b.def.provides) {
          const def = UNIT_DEFS[uk];
          const locked = def.minAge > ctx.age;
          const afford = ctx.afford(def.cost);
          this._btn(ICONS[uk], def.name, def.cost, locked || !afford, false, () => this.cb.onTrain(uk));
        }
      }
      if (b.key === 'towncenter' && b.complete) {
        if (ctx.age < AGES.length - 1) {
          const cost = AGES[ctx.age + 1].advanceCost;
          this._btn(ICONS.advance, `${AGES[ctx.age + 1].name}`, cost, !ctx.afford(cost), false, () => this.cb.onAdvance());
        }
        this._btn(ICONS.rally, 'Rally', null, false, false, () => this.cb.onAction('rally'));
      }
    }
    this._queueRow = null;
    this._updateQueues(sel);
  }

  _updateQueues(sel) {
    // remove old queue rows
    this.actionGrid.querySelectorAll('.queue-row').forEach(e => e.remove());
    if (sel.kind === 'building' && sel.b.queue && sel.b.queue.length) {
      const row = document.createElement('div'); row.className = 'queue-row';
      sel.b.queue.forEach((q, i) => {
        const it = document.createElement('div'); it.className = 'queue-item';
        it.textContent = ICONS[q.unitKey] || '?';
        const fill = document.createElement('div'); fill.className = 'qfill';
        fill.style.height = `${i === 0 ? Math.round(q.progress * 100) : 0}%`;
        it.appendChild(fill); row.appendChild(it);
      });
      this.actionGrid.appendChild(row);
    }
  }

  _btn(icon, cap, cost, disabled, active, onClick) {
    const b = document.createElement('div');
    b.className = 'act-btn' + (disabled ? ' disabled' : '') + (active ? ' building-mode' : '');
    b.innerHTML = `<span class="ai">${icon}</span><span class="cap">${cap}</span>`;
    if (cost) {
      const parts = Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${v}${k[0].toUpperCase()}`).join(' ');
      if (parts) { const c = document.createElement('span'); c.className = 'cost'; c.textContent = parts; b.appendChild(c); }
    }
    if (!disabled) b.onclick = onClick;
    this.actionGrid.appendChild(b);
    return b;
  }

  showEnd(win, sub) {
    const t = this.$('end-title');
    t.textContent = win ? 'VICTORY' : 'DEFEAT';
    t.className = win ? 'win' : 'lose';
    this.$('end-sub').textContent = sub;
    this.$('endscreen').classList.remove('hidden');
  }
}
