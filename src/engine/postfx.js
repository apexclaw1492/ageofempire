import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// Cinematic composer: render -> SSAO -> bloom -> SMAA -> output.
// Degrades gracefully on low-end devices (drops SSAO/SMAA).
export function createComposer(renderer, scene, camera, { quality = 'high' } = {}) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(devicePixelRatio, 2));
  composer.setSize(innerWidth, innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  let ssao = null;
  if (quality === 'high') {
    ssao = new SSAOPass(scene, camera, innerWidth, innerHeight);
    ssao.kernelRadius = 8;
    ssao.minDistance = 0.002;
    ssao.maxDistance = 0.09;
    ssao.output = SSAOPass.OUTPUT.Default;
    composer.addPass(ssao);
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.7, 0.85);
  composer.addPass(bloom);

  if (quality !== 'low') {
    const smaa = new SMAAPass(innerWidth * Math.min(devicePixelRatio, 2), innerHeight * Math.min(devicePixelRatio, 2));
    composer.addPass(smaa);
  }

  composer.addPass(new OutputPass());

  return { composer, bloom, ssao };
}
