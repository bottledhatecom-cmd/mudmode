# HeroCompendium mock 3D test world

**mock world - not the real WoW Forever client - results UNPROVEN**

## What it is
A static, offline web page. The real HeroCompendium Lua runs in the browser:

- **Lua 5.1.5** (lua.org) is compiled to WebAssembly (`js/lua51.js`).
- It runs our own stub of the WoW API (the same stub the box test suites use) plus all 90 toc Lua files of the addon (`js/hc_src.js`).
- The addon's draw output is painted on a 2D canvas over a procedural three.js meadow with a placeholder robot.

No fallback re-implementation is used.

## Open it
- **Locally:** double-click `index.html` (works from file://).
- **Web:** upload the folder as-is (static files, relative URLs only), for example to `/demos/herocompendium/`.
  - `proof/` is test evidence and does not need to be uploaded.
- Desktop browsers with WebGL work best.
  - Without WebGL, a note appears and the addon still runs over a flat backdrop.
  - Phones get a polite "built for desktop" note.

## Privacy
- No network calls, no analytics and no external fonts.
- Settings and mock SavedVariables stay in the browser's localStorage.
- The comment box opens the tester's own mail app (`mailto:reports@mudmodecrew.com`). The page itself sends nothing.

## Controls
- Click the view to focus it.
- **Movement and camera:** WASD walk, Q/E strafe, Space jump, Shift run. Drag to orbit, wheel to zoom.
- **Chat:** Enter opens chat. `/hcomp`, `/hcomp book ...` and `/reload` work.
- **Minimap:** the round button calls the addon's compartment handler (`HeroCompendium_OnCompartmentClick`).
- **F1 test toolbar:**
  - FPS/frame meter, event log and a command box;
  - book buttons, chapters, yaw/tilt, Reduce Motion, UI scale, window sizes;
  - fake level/class/faction, clear saved data;
  - hit-box and text-safe overlays;
  - stress test and bug report (.json download plus clipboard text).

## Limits (honest)
- **Stub, not the client.** The stub is not the WoW client. Layout, fonts and timing are approximations, so every result is UNPROVEN until it is checked in the real WoW Forever client.
- **Font substitution.** Game fonts are replaced: FRIZQT/ARIALN → HC Sans (a subset of Lato, renamed because Lato is a Reserved Font Name), MORPHEUS/SKURRI → Alegreya SC.
- **Game icons.** Game-client icons (Interface\Icons, file IDs) are not bundled and show as `?` placeholder squares. Only the addon's own media is drawn.
- **No tooltips.** GameTooltip is not drawn.
- **Fake game data.** Game data (character "Testbot", group, spells, pets) is a small mock.
- **The addon has no minimap button of its own.** The mock minimap uses the addon-compartment path that WoW provides.

## Licenses
- three.js: MIT (`js/LICENSE-three.txt`).
- Lua 5.1.5: MIT (`js/LICENSE-lua.txt`).
- Lato (subset, renamed HC Sans) and Alegreya SC (subset): SIL OFL 1.1 (`fonts/OFL-*.txt`). Addon code: MIT (`js/LICENSE-addon.txt`).
- The addon and its media are by mud.
- The world, robot and page chrome are procedural and made for this demo.
