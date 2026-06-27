import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';

const canvas = document.getElementById('game-canvas');

function start() {
  const game = new Game(canvas);
  const hud = new HUD({
    onTrain: k => game.onTrain(k),
    onBuild: k => game.onBuild(k),
    onAdvance: () => game.onAdvance(),
    onAction: n => game.onAction(n),
    onReplay: () => location.reload(),
  });

  window.game = game;
  game.build(hud).then(() => {
    let last = performance.now();
    function loop(now) {
      const dt = (now - last) / 1000;
      last = now;
      try { game.update(dt); }
      catch (err) { console.error('Game loop error:', err); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }).catch(err => {
    console.error('Failed to start game:', err);
    document.querySelector('.loading-tip').textContent = 'Error: ' + err.message;
  });
}

start();
