# Age of Empire — Browser RTS

A fully playable, real-time strategy game built with **Three.js**, running entirely in the browser on desktop and mobile.

**▶ Play live:** https://apexclaw1492.github.io/ageofempire/

![Three.js](https://img.shields.io/badge/Three.js-WebGL-000) ![License](https://img.shields.io/badge/code-MIT-blue) ![Assets](https://img.shields.io/badge/art-CC0-green)

## Gameplay
Start with a Town Center and a few villagers. Gather **wood, food, and gold**, build an economy, train an army, advance through the **Dark → Feudal → Castle** ages, and destroy the enemy Town Center before they destroy yours. A state-machine AI runs its own economy, walls up, and escalates from raids to a full assault.

## Controls
**Desktop** — Left-click select · drag box-select · right-click move/gather/attack · WASD + edge-scroll pan · wheel zoom · middle-mouse rotate.
**Touch** — tap to select/command · drag to pan · pinch to zoom · two-finger twist to rotate · ⛶ button toggles box-select.

## Features
- Rigged, animated 3D characters (idle / walk / attack / gather / death)
- Team-colored medieval buildings with staged construction and destruction
- Heightmap terrain, instanced forests/ore/rocks, fog of war, minimap
- Post-processing: ambient occlusion, bloom, anti-aliasing; golden-hour lighting
- GPU particle FX, A* pathfinding, formation movement
- Full desktop + mobile parity, onboarding, and live objective tracking

## Development
```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
```
Deployment is automatic: pushing to `main` triggers a GitHub Actions workflow that builds and publishes to GitHub Pages.

## Credits
3D art from the wonderful **[KayKit](https://kaylousberg.com/)** packs by Kay Lousberg (Medieval Hexagon Pack, Character Pack: Adventurers), released under **CC0**. Engine and game code © project author, MIT.
