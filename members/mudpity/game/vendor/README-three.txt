three.js 0.186.1 (REVISION 186), license MIT (see LICENSE-three.txt), from the npm registry: npm i three@0.186.1
three.min.js is a tree-shaken, minified classic-script build of only the pieces this game uses (plain WebGL renderer,
basic/lathe/capsule geometries, Lambert/Standard/Basic/Shader materials, instancing, canvas textures, exp2 fog, hemisphere + directional lights, shadow maps, ACES tone mapping; see three-entry.js for the exact export list). No WebGPU code is included. It sets the global THREE,
so index.html works when opened straight from disk (file://) - no module imports, no server needed.
Rebuild (esbuild 0.28.2):
  npm i three@0.186.1 esbuild
  npx esbuild three-entry.js --bundle --minify --format=iife --global-name=THREE --legal-comments=none --outfile=three.min.js
  (then the one-line license banner is prepended)
