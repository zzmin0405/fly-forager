import { copyFile, mkdir } from "node:fs/promises";
await mkdir("dist/vendor", { recursive: true });
for (const [source, target] of [
  ["three/build/three.module.js", "three.module.js"],
  ["three/build/three.core.js", "three.core.js"],
  ["three/examples/jsm/controls/OrbitControls.js", "OrbitControls.js"],
  ["three/LICENSE", "THREE-LICENSE.txt"],
  ["animejs/dist/bundles/anime.esm.js", "anime.esm.js"],
  ["animejs/LICENSE.md", "ANIME-LICENSE.txt"],
])
  await copyFile(`node_modules/${source}`, `dist/vendor/${target}`);
