/* mudpity - early access. All original code and low-poly shapes built in code.
   Game logic is the same as the original 2D version (logical 320x180 px room space); this file adds a three.js view.
   Genre mechanics only (run, jump pits, swing on vines, avoid hazards, collect treasure, countdown + speed bonus).
   dev-moves: physical shield (approved plan, items 1-11). It rides on his back; the block input brings it round to the front.
   A block stops projectiles, physical attacks and logs; the shove and the stamina cost both scale with how hard the hit is.
   Stamina runs out while blocking = the shield drops where he stands and he has to walk over it to pick it up. With no shield
   he blocks with his hands and takes reduced damage. Stamina refills slowly on its own. An unblocked hit costs a heart; pits
   still cost a heart straight away. Every shield / stamina number is in the TUNE block below. */
(() => {
'use strict';
const W = 320, H = 180, GY = 130;          // logical size, ground line
const ROOMS = 12, TREASURES = 6, TIME = 180, LIVES = 3;
const BOSS_ROOMS = [3, 7, 11];            // rooms 4, 8 and 12 (1-based) are boss arenas
const SPEED = 70, JUMP_V = 190, GRAV = 520, STEP = 1 / 60;
const VINE_L = 78, VINE_A = 0.85, VINE_W = 2.1, VINE_Y = 28;
const SNAP_C = 2.8;
/* ======================= TUNING (shield + stamina) =======================
   Every shield and stamina number lives here. These are DEFAULTS to be set in playtest; nothing else in the file
   hard-codes them. Units: stamina 0..STAM_MAX; force 1 = an ordinary rolling log; speeds in logical px/s (a room is 320 px
   wide, the hero runs at 70); times in seconds. */
const TUNE = {
  STAM_MAX: 100,               // full stamina
  BLOCK_COST_PER_FORCE: 25,    // stamina drained by one block = hit force x this (a force-1 log costs 25: 4 log blocks from full)
  REGEN_PER_SEC: 4,            // slow refill on its own, stamina per second (empty -> full in 25 s)
  REGEN_DELAY: 1.5,            // seconds after a block before the refill starts again
  RAISE_TIME: 0.18,            // seconds to reach back and bring the shield to the front; a block only counts once it is in front
  LOWER_TIME: 0.22,            // seconds to put it back on his back (look only)
  HAND_RAISE_TIME: 0.08,       // seconds to get his hands up when he has no shield
  HAND_BLOCK_DAMAGE: 0.5,      // hearts lost per hand block (an unblocked hit costs 1 heart); 0.5 = half damage
  REACT_VX_PER_FORCE: 110,     // shove speed per unit of force (no fixed push: a force-0.5 hit shoves half as hard)
  REACT_VY_PER_FORCE: 70,      // upward pop per unit of force
  REACT_T_PER_FORCE: 0.30,     // seconds of stagger per unit of force (no running or jumping while staggered)
  REACT_T_MAX: 0.8,            // a stagger never lasts longer than this
  BLOCK_INV: 0.45,             // seconds after a block in which the same hit can't land again
  PICKUP_RANGE: 8,             // px: walk this close over the dropped shield to pick it up
  BLOCK_MOVE_SCALE: 1,         // run speed while blocking (1 = unchanged)
  BLOCK_MODE_DEFAULT: 'press', // 'press' = tap to raise, tap again to lower; 'hold' = up while held (the player picks on the title screen)
  FORCE: {                     // how hard each hit is: more force = bigger shove and more stamina per block
    log: 1.0,                  //   x the log's speed / 57 (logs roll at 50-64 px/s)
    crawler: 0.6, snap: 0.8, bite: 1.2,          // bite: the giant biter from below
    flyerDive: 0.7, flyerDrop: 0.5,                 // flyers: a dive, a dropped thing (PLAYTEST DEFAULTS)
    mudBall: 0.8, mudSplash: 0.5, bogjaw: 1.6,      // boss 1 (BOGJAW)
    seedBomb: 1.2, swoop: 1.4,                      // boss 2 (GLOOMWING)
    totem: 2.0, shockwave: 1.0, totemBall: 0.9      // boss 3 (MUDTOTEM)
  },
  GLOW_MIN: 0.08,              // shield glow brightness at empty stamina
  GLOW_MAX: 1.0,               // shield glow brightness at full stamina
  /* grappling hook: left click or the phone hook button fires it; tap = zip to the anchor, hold = swing on the
     rope; it grabs any wall or ledge and pulls loot and mobs. Free to use, no stamina; the cooldown is the reel-in: he can fire again once the hook is back in his hand. PLAYTEST DEFAULTS until they are set in playtest. */
  HOOK: {
    RANGE: 130,                // px: furthest the hook reaches
    FLY_SPEED: 650,            // px/s the hook head flies out
    REEL_SPEED: 200,           // px/s he reels the hook back in after a zip, a swing let-go, a pull or a miss (that is the cooldown)
    TAP_TIME: 0.2,             // seconds: let go before this = tap (zip); still held at this point = hold (swing)
    ZIP_SPEED: 260,            // px/s he zips to the anchor
    ZIP_EXIT: 40,              // px/s he carries on with at the end of a zip
    ZIP_MAX_T: 1.2,            // a zip never lasts longer than this (seconds)
    ROPE_MIN: 24,              // px: shortest rope while swinging
    ROPE_MAX: 110,             // px: longest rope while swinging
    ROPE_REEL: 0.9,            // the rope reels in to this x the distance when the swing starts (lifts him off the ground)
    SWING_PUMP: 140,           // px/s^2 left / right push while swinging
    SWING_MAX: 230,            // px/s top speed on the rope
    PULL_LOOT_SPEED: 170,      // px/s loot is reeled in to him
    PULL_MOB_SPEED: 90,        // px/s a mob is dragged toward him
    PULL_MOB_T: 0.9,           // seconds a mob drag lasts at most
    MOB_STOP: 18,              // px: a dragged mob stops this far from him (so the pull itself never bites)
    AIM_UP: 55,                // degrees above his facing direction for a plain shot (walls, canopy)
    CONE: 60,                  // degrees: loot and mobs inside this cone in front of him get the hook first
    CEIL_Y: 28                 // px: the canopy branches overhead (where the vines hang) count as a ledge
  },
  /* buddy super move: Q or the phone super button; ready at the start of a run, then RECHARGE s after he shrinks back. Buddy grows to
     SIZE x mudbot's height and fights on his own; he takes the hits meant for the player, and that damage drains his own power-up meter.
     At 0 he shrinks back. It does not use the player's stamina (stamina is exactly the live game's). PLAYTEST DEFAULTS until they are set in playtest
     (tuned with the balance sim). Units: meter 0..METER; damage in mob health points; px and seconds as above. */
  SUPER: {
    SIZE: 1.25,                // x mudbot's height (1.25x, not 2x; was 2 at first). Look only: reach is REACH px
    METER: 100,                // his power-up health meter, full at the start of every use
    RECHARGE: 30,              // PLAYTEST DEFAULT (owner to set): seconds after he shrinks back before Q works again (replaces the old full-stamina gate)
    SOAK_PER_FORCE: 24,        // meter lost when he takes a hit meant for the player = hit force x this (a force-1 hit = 24)
    SOAK_MAX: 28,              // most one soaked hit can cost him (a boss's force-2 / force-3 hits are capped here)
    SOAK_INV: 0.5,             // seconds after a soaked hit before the next one can land (like BLOCK_INV)
    MOB_BITE_PER_SEC: 12,      // meter lost per second per mob chewing on him
    BOSS_CONTACT_PER_SEC: 5,   // meter lost per second while he is toe to toe with a boss
    LOG_HIT_PER_FORCE: 12,     // meter lost when a log rolls into him before he smashes it (he still breaks it)
    // fighting back: every hit he lands costs him too, so a room he keeps clear still wears him down (no timer)
    MOB_COUNTER: 20,           // meter lost per swing that lands on a mob (it bites back)
    LOG_SMASH: 34,             // meter lost per log he smashes (the jolt): a log room wears him out in about 3 logs
    BOSS_COUNTER: 3,           // meter lost per swing that lands on a boss (it hits back)
    // quiet room ("meter slowly drains when nothing is happening"): no mob, log or boss within AGGRO of
    // the player and nothing has hit him (or been hit by him) for IDLE_DELAY s -> the meter drains IDLE_PER_SEC. A fully quiet room ends
    // super in about GROW_T + IDLE_DELAY + METER / IDLE_PER_SEC = 1 + 2 + 12.5 = 15.5 s. Anything in range (or any hit) stops the drain.
    IDLE_DELAY: 2,             // seconds of nothing happening before the slow drain starts
    IDLE_PER_SEC: 8,           // meter lost per second while nothing is happening (100 -> 0 in 12.5 s)
    IDLE_MOVE_K: 0.35,         // x that drain while the player is on the move (walking on to the next fight is not 'nothing happening')
    IDLE_MOVE_VX: 8,           // px/s: the player counts as on the move above this speed
    IDLE_MOVE_T: 4,            // s: that discount lasts this long into a quiet spell (about one room's walk), then pacing a quiet room drains in full
    HIT_DMG: 20,               // damage per swing (mob health below)
    HIT_RATE: 0.6,             // seconds from one swing to the next
    WINDUP: 0.18,              // seconds of wind-up before a swing lands
    SLAM_EVERY: 3,             // every 3rd swing is a ground slam that hits everything within SLAM_R
    SLAM_R: 42,                // px around him a slam reaches
    REACH: 26,                 // px a swipe reaches in front of him
    REACH_UP: 72,              // px above the ground he can hit (a hovering GLOOMWING is about 56 up)
    BODY: 12,                  // px: things this close are touching him (bites, boss contact, logs rolling into him)
    AGGRO: 140,                // px from the player: he goes after mobs, bosses and logs this close to the player
    SPEED: 95,                 // px/s he moves (the hero runs at 70)
    FOLLOW_GAP: 28,            // px behind the player he waits when there is nothing to hit
    MOB_HP: 30,                // mob (crawler) health: 2 swings
    LOG_HP: 20,                // log break: health of a rolling log (1 swing)
    BOSS_DMG_SCALE: 0.25,      // boss damage per swing = HIT_DMG x this, in % of that boss's full health (20 x .25 = 5%)
    BOSS_CAP_PCT: 30,          // most of one boss's health one use can take off (%): he never erases a boss alone
    KILL_SCORE: 150, LOG_SCORE: 40,
    GROW_T: 1.0,               // seconds: the entrance (grow, leap, ground slam)
    SHRINK_T: 0.9              // seconds: the shrink back to normal
  },
  /* physical tug of war in T mode (the tug logic below). Units: px, s, px/s; forces are mass x px/s^2 (grip = MU x mass x G x stance).
     PLAYTEST DEFAULTS from the plan, except: T_MAX 600 (was 260: under dirt grip 520 nobody could ever slide), REST_GRIP (new: letting go
     = you slide a bit), YANK 260 (was 90: too small to move anyone against 520 grip, so the rope could never pop), SNAP_D counted from
     this round's start length (a pit lip gap can be up to GAP x GAP_MAX), plus the placement, AI and mire-edge numbers marked new. */
  TUG:{ GAP:60, LIM:20, DRAW_PX:3, LINE:.5, GAP_MAX:1.8, PAD:4, L_MIN:10,   // start gap px (line in the middle; a pit within reach puts buddy on its far lip), round s, time-up draw band px
  K:40, C:6, T_MAX:600, REEL:28, LEAN_GRIP:1.35, LEAN_REEL:.5, REST_GRIP:.8, G:520,   // rope spring/damper, tension cap, reel px/s; stance grip: dig in / pull 1 / rest (let go)
  MU_DIRT:1.0, MU_RIM:1.4, MU_WATER:.45, MU_MIRE:.55, MU_ROCK:1.4, SLIDE_K:.7, MIRE_DRAG:2, RIM:6, MIRE_X0:55, MIRE_X1:265, ROCK:10,   // grip per ground; boss mire span and its edge rocks (px)
  STAM_PULL:22, STAM_LEAN:.6, STAM_REST:30, YANK:260, YANK_COST:25, YANK_CD:.8, SNAP_D:100, POP:true, POP_WIN:.3, POP_T:300, POP_S:20,   // tug stamina /s (not the run's), yank kick px/s; the rope pops past SNAP_D (= GAP+40); new: a big yank (yours while the other robot pulls with T >= POP_T, or two yanks within POP_WIN s) pops it once the rope stretches POP_S px within POP_WIN s
  BUD_M:1, AI_BURST:1.2, AI_REST:.8, AI_YANK:.15, AI_LOW:12, AI_BACK:55, AI_LEAN:.5, AI_REACT:[.25,.7],
    FALL:20, MASH_KICK:10, MODE_DEFAULT:'hold' },   // buddy mass + AI rhythm; off a ledge = FALL px below the ground; mash: px per tap
  HOOK_COOLDOWN: 0.6,          // NOT USED: the hook is live's (fire again once it is back, no zip recharge). Left from the merge, inert.
  /* controls: Ctrl or middle click = kick; right click, S, Down or E = shield (live's keys plus E); S / Down + kick = kick down.
     Kick: a short forward kick (a hop from the ground). It uses the vine-release kick logic (p.kick, kickOn), so it hurts what the
     vine kick hurts and knocks flyers out of the air. Down + kick = kick down: a fast downward strike from the air (a stomp; from
     the ground a small hop first). The hook is live's: there is no grapple down and no letting the rope out (HOOK_DOWN and
     hookAimDown are inert, not called). PLAYTEST DEFAULTS. */
  KICK: {
    T: 0.3,                    // seconds a kick stays active
    CD: 0.45,                  // seconds between kicks
    HOP_V: 110,                // px/s: a kick from the ground pops him up this fast (the kick only lands in the air)
    LUNGE_V: 120,              // px/s: forward speed of a kick from the ground (air kicks add LUNGE_V / 3)
    DOWN_V: 300,               // px/s: a kick down drives him down at least this fast
    DOWN_HOP: 0.7              // a kick down from the ground hops HOP_V x this first
  },
  HOOK_DOWN: {
    MIN_DROP: 6,               // px: grapple down needs at least this much air below him (else it clinks off the floor)
    REEL_OUT: 60               // px/s: holding down on the rope lets it out this fast (up to HOOK.ROPE_MAX)
  },
  /* flyer mobs: bats, wasps and junk drones fly above the path, dive at him (after a shaking tell) and drop things on him.
     Small ones (bat, wasp): hook one to pull it down; it lies stunned on the ground: kick it (walk into it) or jump on it.
     Big ones (drone): hook one to ride it; it carries him forward (left / right steers); jump or press hook again to let go;
     after RIDE_T it shakes him off. Toughness by rank: RANK_HP kicks (rank 2 / 3 glow amber / red). None in boss rooms; more
     rooms get them, and more of them, later in the run. Ceiling cheese: high up (swinging on the rope, or in the air above
     CHEESE_H) for CHEESE_T seconds = the room's flyers come for him (or, if it has none, one is called in).
     ALL NUMBERS HERE ARE PLAYTEST DEFAULTS. */
  FLYER: {
    FIRST_ROOM: 1,             // no flyers before this room index (index 0 = the first room)
    CHANCE_START: 0.35,        // chance a room has flyers in the first rooms ...
    CHANCE_END: 0.85,          // ... rising in a straight line to this in the last room
    COUNT_START: 1,            // most flyers in one room early in the run ...
    COUNT_END: 3,              // ... and late in the run
    KINDS: {                   // w = how often it is picked; big = ride it (else pull it down and kick it)
      bat:   { w: 0.40, big: false, speed: 34, name: 'bat',   drop: 'mud drip' },
      wasp:  { w: 0.35, big: false, speed: 40, name: 'wasp',  drop: 'wasp spit' },
      drone: { w: 0.25, big: true,  speed: 26, name: 'drone', drop: 'junk bolt' }
    },
    RANK_HP: [1, 2, 3],        // kicks (or stomps) to kill a rank 1 / 2 / 3 flyer
    RANK_W_START: [0.75, 0.20, 0.05],   // rank 1 / 2 / 3 odds in the first room ...
    RANK_W_END: [0.40, 0.40, 0.20],     // ... and in the last room. Minimal rank hook (no saved ladder yet: PROPOSAL-mob-ranks.md is a draft)
    Y_MIN: 45, Y_MAX: 68,      // px: patrol height (ground 130, canopy 28)
    PATROL_RANGE: 40,          // px each way from its spot
    AGGRO_X: 70,               // px: he is this close sideways = it dives at him
    TELL_T: 0.45,              // seconds it shakes before a dive (the tell)
    DIVE_SPEED: 150,           // px/s dive
    RISE_SPEED: 60,            // px/s back up after a dive
    DIVE_CD: 2.5,              // seconds between dives
    AGGRO_CD: 1.2,             // seconds between dives once the ceiling trigger set it on him
    DROP_X: 26,                // px: he is this close below it = it drops something
    DROP_CD: 2.2,              // seconds between drops
    DROP_GRAV: 260,            // px/s^2 a drop falls
    PULL_SPEED: 160,           // px/s a hooked small flyer is pulled down
    PULL_T: 1.5,               // seconds a pull-down lasts at most
    PULL_STOP: 16,             // px: it lands this far in front of him
    STUN_T: 2.5,               // seconds it lies stunned on the ground
    RIDE_SPEED: 75,            // px/s a ridden drone carries him
    RIDE_T: 4,                 // seconds a ride lasts at most (then it shakes him off)
    RIDE_Y: 60,                // px: height it flies at while ridden
    RIDE_HANG: 22,             // px: his feet hang this far below it
    CHEESE_H: 45,              // px above the ground that counts as high (a normal jump peaks at ~35)
    CHEESE_T: 3,               // seconds high or on a swing before the flyers come for him
    CHEESE_SPAWN_MAX: 2,       // flyers the trigger may call into a room with none, per visit (never in boss rooms)
    SCORE: 100                 // points per kill x rank (then the speed multiplier)
  },
  /* crevasses, solid crocs, the giant biter and the tentacles. ALL NUMBERS HERE ARE PLAYTEST DEFAULTS.
     Route rule (the generator keeps it; a smoke check walks many seeds): every hole is at most JUMP_MAX wide, or has a vine
     over it, or is at most HOOK_MAX wide (the hook zips to the far ledge; HOOK.RANGE is 130). At least MIN_LAND of solid
     ground between holes, none within EDGE of a room side. Nothing new in boss rooms. */
  CREV: {
    BAG: { pit: 3, twin: 2, crev: 2 },   // room bag weights of the hole rooms (were pit 2, twin 1, no crev); log 2, vine 3, snap 2, crawl 2 as before
    JUMP_MAX: 44,              // px: widest plain-jump gap (a running jump spans about 51 px)
    HOOK_MAX: 72,              // px: widest gap with no vine over it (hook zip to the far ledge)
    VINE_OVER: 70,             // px: a crevasse wider than this always gets a vine over it
    MIN_LAND: 22,              // px: solid ground kept between two holes (and next to croc pools and crawler beats)
    EDGE: 26,                  // px: no hole closer than this to a room's left or right side
    SMALL_W: [24, 40],         // px: width of the extra holes
    PIT_HOLES: [1, 3],         // holes in a 'pit' room (was always 1)
    TWIN_HOLES: [2, 3],        // holes in a 'twin' room (was always 2)
    CREV_W: [46, 96],          // px: the big crevasse of a 'crev' room
    CREV_HOLES: [1, 2],        // holes in a 'crev' room, the big one included
    LOG_HOLE: 0.35,            // chance a log room (not the first room) gets one small hole
    LAVA: 0.22, WATER: 0.22,   // chance a hole holds lava / fast water (else the room's dark void or tar)
    FILL_DEPTH: 24,            // px below the ground: the lava / water surface (falling in costs a heart, like a pit)
    BITER: 0.35, BITER_W: 36,  // chance a hole at least BITER_W wide has a giant biter
    TENT: 0.35                 // chance a hole has tentacles on one edge
  },
  CROC: {                      // snapper pools: each cell holds a solid croc (stand on its head; its body blocks; its open mouth bites)
    HALF: 8,                   // px: half-width of the solid head
    H: 9,                      // px: head height (he stands on it at GY - H)
    MOUTH: 8,                  // px: reach of the bite zone past the end of the head it faces
    // crocs: swing over a croc and it lunges up out of the water at you; stand on its head and it can't bite; stand still there and you can fish
    LUNGE: { NEAR_X: 16, NEAR_Y: 48, TELL: .35, UP: .22, HOLD: .25, DOWN: .45, CD: [2.2, 3.6], H: 26, R: 9 },   // px / seconds
    FISH: { STILL: 1.0, WAIT: [1.4, 3.6], WIN: .8, RARE: .12, PITY: .06, MASH: 8, MASH_T: 2.8 }               // seconds; rare chance + pity per miss
  },
  BITER: {                     // the giant biter: lunges up out of a crevasse after a tell (bubbles, eyes rising and flashing)
    NEAR: 30,                  // px: he has to be this close to the hole (or over it) for it to come
    TELL: 0.8, UP: 0.3, HOLD: 0.35, DOWN: 0.5,   // seconds: tell, lunge up, hold at the top, sink back
    CD: [2.2, 3.6],            // seconds between lunges (random in range)
    TOP: 44,                   // px above the ground its head reaches
    HALF: 12,                  // px: half-width of the bite column (it follows him during the tell, then locks)
    DEPTH: 40                  // px below the ground it hides at
  },
  TENT: {                      // tentacles: reach out of a crevasse along the ground, grab him and drag him down
    NEAR: 70,                  // px: he has to be this close to the edge for it to reach
    REACH: 26,                 // px it reaches out onto the ground
    OUT: 0.45, HOLD: 0.8, IN: 0.5,   // seconds: reach out, stay out, pull back
    CD: [2.0, 3.5],            // seconds between reaches
    PULL: 22,                  // px/s it drags him to the edge and down
    BREAK: 'mash',             // 'mash' = MASH jump / kick presses break free; 'window' = one press while the grip slackens
    MASH: 4,
    WIN_EVERY: 0.7, WIN_LEN: 0.22,   // 'window' mode: the grip slackens for WIN_LEN every WIN_EVERY seconds
    FREE_INV: 0.8              // seconds he can't be grabbed or hurt after breaking free
  },
  /* speed bonus, on top of the live countdown (TIME, +15 sec per boss, time-out loss: all as live). A run clock counts up
     from 0:00 (run time, so it stops while paused) and every point scored is worth more the faster you go: x SUPER for the first SUPER_T seconds (the SUPER BONUS
     window), then x START at SUPER_T falling in a straight line to x END at FADE_T, then x END for the rest of the run.
     Scored points are rounded. */
  SPEED: {
    SUPER: 3.0,                // multiplier while the run clock is under SUPER_T (HUD shows SUPER x3)
    SUPER_T: 180,              // seconds: the super bonus lasts the first 3:00
    START: 2.0,                // multiplier at SUPER_T (3:00)
    END: 1.0,                  // multiplier from FADE_T on (never below this)
    FADE_T: 600                // seconds: the multiplier reaches END at 10:00
  }
};
const HK = TUNE.HOOK, SPD = TUNE.SPEED;
const STAM_MAX = TUNE.STAM_MAX, FORCE = TUNE.FORCE;
const SU = TUNE.SUPER;   // buddy super move numbers (see TUNE.SUPER)
const BLOCK_MODE_KEY = 'mudpity-block-mode';   // the player's press / hold choice, stored on this device only
const BEST_KEY = s => 'mudpity-best-v2:' + s;   // new best-score key: the shield changes scoring, so old bests stay under their old key

const P = { // earthy palette matching the approved art textures
  sky1:'#8fbfae', sky2:'#e9dfb8', trunk:'#2c6c66', trunk2:'#3a8079', canopy:'#5a3a22', canopy2:'#3f2616',
  grass:'#4f9a72', dirt:'#7a5233', dirt2:'#5e3d25', hole:'#1b1410', tar:'#17110e', cream:'#f3e6c4',
  orange:'#d9894a', ink:'#3f2616', vine:'#6f8a3a', log:'#8a5a30', gem:['#d9534f','#4aa3d9','#e8c14a']
};

/* ---------- seeded rng + generator ---------- */
function hash(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function genWorld(seed){
  const rk = mulberry(hash(seed+'|kinds'));
  const kinds = ['log'];
  const CB=TUNE.CREV.BAG, bag = [['log',2],['pit',CB.pit],['vine',3],['snap',2],['crawl',2],['twin',CB.twin],['crev',CB.crev]];
  const tot = bag.reduce((s,b)=>s+b[1],0);
  for(let i=1;i<ROOMS;i++){
    let k, guard=0;
    do { let r=rk()*tot; k=bag[0][0]; for(const b of bag){ if((r-=b[1])<0){k=b[0];break;} } } while(k===kinds[i-1] && ++guard<20);
    kinds.push(k);
  }
  BOSS_ROOMS.forEach((ri,k)=>{ kinds[ri]='boss'+(k+1); });
  const rt = mulberry(hash(seed+'|treasure'));
  const idx=[]; for(let i=1;i<ROOMS;i++) idx.push(i);
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(rt()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
  const tset = new Set(idx.filter(i=>!BOSS_ROOMS.includes(i)).slice(0,TREASURES));
  const rooms=[]; for(let i=0;i<ROOMS;i++) rooms.push(genRoom(seed,i,kinds[i],tset.has(i)));
  return {seed, rooms};
}
function genRoom(seed,i,kind,hasT){
  const r = mulberry(hash(seed+'|room|'+i));
  const rnd=(a,b)=>a+r()*(b-a), rint=(a,b)=>Math.floor(rnd(a,b+1));
  const room={i,kind,holes:[],pools:[],vines:[],crawlers:[],logs:false,treasure:null,trees:[],drips:[],holeKind:r()<.5?'void':'tar'};
  if(kind==='log'){ room.logs=true; }
  if(kind==='pit'){ const w=rint(30,40), x=rint(110,200); room.holes.push({x0:x,x1:x+w}); }
  if(kind==='twin'){ const w1=rint(26,32), w2=rint(26,32), x1=rint(70,100), x2=rint(190,225); room.holes.push({x0:x1,x1:x1+w1},{x0:x2,x1:x2+w2}); room.logs=r()<.4; }
  if(kind==='vine'){ const w=rint(86,100), x=rint(110,170); room.holes.push({x0:x,x1:x+w});
    room.vines.push({ax:x+w/2, ph:rnd(0,6.28), len:VINE_L}); }
  if(kind==='snap'){ const n=rint(3,4), w=n*24, x=rint(90,150); room.pools.push({x0:x,x1:x+w,n,ph:Array.from({length:n},()=>rnd(0,SNAP_C))}); }
  if(kind==='crawl'){ const n=rint(1,2); for(let k=0;k<n;k++) room.crawlers.push({cx:rint(110+k*90,150+k*90),range:rint(22,36),sp:rnd(18,28)}); room.logs=r()<.5; }
  // no logs in boss rooms (the first boss could be cheesed with logs)
  if(kind==='boss2'){ room.vines.push({ax:56,ph:rnd(0,6.28),len:VINE_L},{ax:264,ph:rnd(0,6.28),len:VINE_L}); }
  if(kind==='boss3'){ room.vines.push({ax:92,ph:rnd(0,6.28),len:VINE_L}); }
  crevGen(seed,i,kind,room);
  // treasure
  if(hasT){
    const hz=[]; room.holes.forEach(h=>hz.push([h.x0,h.x1])); room.pools.forEach(p=>hz.push([p.x0,p.x1]));
    let tx, ty=GY-8, tries=0;
    if(room.holes.length && r()<.6){ const h=room.holes[0]; tx=(h.x0+h.x1)/2; ty=GY-48; }
    else { do { tx=rint(40,280); tries++; } while(tries<30 && hz.some(z=>tx>z[0]-14&&tx<z[1]+14)); if(r()<.5) ty=GY-44; }
    room.treasure={x:tx,y:ty,kind:rint(0,2)};
  }
  for(let k=0;k<5;k++) room.trees.push({x:rint(-10,310),w:rint(10,20),c:r()<.5?0:1});
  for(let x=0;x<W;x+=10) room.drips.push(rint(4,18));
  return room;
}

/* ---------- state ---------- */
const qs=new URLSearchParams(location.search);
const G={state:'title', seed:(qs.get('seed')||'mud').slice(0,24), world:null, t:0, timeLeft:TIME, runT:0, lives:LIVES, score:0,
  got:new Set(), bosses:{}, burst:[], winT:0, drop:null, blocks:0, lastBlock:null, allGems:false, room:0, p:null, rs:null, result:'', msg:'', msgT:0, best:0};
try{ G.best=+localStorage.getItem(BEST_KEY(G.seed))||0; }catch(e){}
const keys={left:false,right:false,jump:false,block:false,hook:false,down:false}; let jumpQ=0;
/* block input: 'press' toggles the block on and off, 'hold' blocks while the key / button is down */
let blockMode=TUNE.BLOCK_MODE_DEFAULT, blockLatch=false;
try{ const m=localStorage.getItem(BLOCK_MODE_KEY); if(m==='press'||m==='hold') blockMode=m; }catch(e){}
function setBlockMode(m){ blockMode=m==='hold'?'hold':'press'; blockLatch=false; keys.block=false; try{ localStorage.setItem(BLOCK_MODE_KEY,blockMode); }catch(e){} }
function blockInput(down){ if(blockMode==='hold') keys.block=!!down; else if(down) blockLatch=!blockLatch; }
const wantBlock=()=>blockMode==='hold'?keys.block:blockLatch;
G.world=genWorld(G.seed); G.sup=supNew(); G.bud=budNew(); G.tmPaid={}; G.tmGot=0; G.freeze=null; G.cut=null; G.ease=0; G.tm=null;

/* crevasses: extra holes, the big 'crev' crevasse, what fills a hole, biters, tentacles, croc facings. Own rng stream, so the
   rest of each room rolls as before. Keeps the route rule in TUNE.CREV. */
function crevGen(seed,i,kind,room){
  if(kind.slice(0,4)==='boss') return;   // no new hazards in the boss arenas
  const C=TUNE.CREV, T=TUNE.TENT, r=mulberry(hash(seed+'|crev|'+i)), rint=(a,b)=>a+Math.floor(r()*(b-a+1));
  const clear=(x0,x1)=>x0>=C.EDGE&&x1<=W-C.EDGE&&!room.holes.some(h=>x0<h.x1+C.MIN_LAND&&x1>h.x0-C.MIN_LAND)
    &&!room.pools.some(q=>x0<q.x1+C.MIN_LAND&&x1>q.x0-C.MIN_LAND)&&!room.crawlers.some(c=>x0<c.cx+c.range+C.MIN_LAND&&x1>c.cx-c.range-C.MIN_LAND);
  const place=w=>{ for(let k=0;k<40;k++){ const x=rint(C.EDGE,W-C.EDGE-w); if(clear(x,x+w)){ const h={x0:x,x1:x+w}; room.holes.push(h); return h; } } return null; };
  if(kind==='crev'){ const w=rint(C.CREV_W[0],C.CREV_W[1]), h=place(w); if(h&&w>C.VINE_OVER) room.vines.push({ax:(h.x0+h.x1)/2,ph:r()*6.28,len:VINE_L}); }
  const want=kind==='pit'?rint(C.PIT_HOLES[0],C.PIT_HOLES[1]):kind==='twin'?rint(C.TWIN_HOLES[0],C.TWIN_HOLES[1]):kind==='crev'?rint(C.CREV_HOLES[0],C.CREV_HOLES[1]):(kind==='log'&&i>0&&r()<C.LOG_HOLE)?1:0;
  for(let k=room.holes.length;k<want;k++) place(rint(C.SMALL_W[0],C.SMALL_W[1]));
  room.holes.sort((a,b)=>a.x0-b.x0);
  for(const h of room.holes){ const a=r(), b=r(), c=r(), d=r();
    if(a<C.LAVA) h.fill='lava'; else if(a<C.LAVA+C.WATER) h.fill='water';
    if(h.x1-h.x0>=C.BITER_W&&b<C.BITER) h.biter=1;
    if(c<C.TENT){ const okL=h.x0-T.REACH>=30, okR=h.x1+T.REACH<=W-30, s=d<.5?-1:1;   // its reach never covers a room's entry
      const side=(s<0?okL:okR)?s:(s<0?okR:okL)?-s:0; if(side) h.tent=side; } }
  for(const q of room.pools) q.dir=Array.from({length:q.n},()=>r()<.5?-1:1);   // which way each croc faces
}
function newPlayer(x){return {x,y:GY,vx:0,vy:0,face:1,onGround:true,coyote:0,vine:null,vs:1,grabCd:0,kick:0,inv:0,dead:0,step:0,stam:STAM_MAX,react:0,binv:0,shield:true,blocking:false,blk:0,chip:0,regenT:0,hook:null,hookCd:0,kickCd:0,kickDown:false,kickIn:false,grab:null};}
function startRun(){
  G.world=genWorld(G.seed); G.t=0; G.timeLeft=TIME; G.runT=0; G.lives=LIVES; G.score=0; G.got=new Set(); G.result='';
  G.bosses={}; G.winT=0; G.burst=[]; G.allGems=false; G.drop=null; G.items=[]; G.flyDead=new Set(); G.flyKills=0; G.blocks=0; G.lastBlock=null; blockLatch=false; keys.block=false; G.sup=supNew(); G.bud=budNew(); G.tmPaid={}; G.tmGot=0; G.freeze=null; G.cut=null; G.ease=0; G.tm=null; wsReset();
  G.state='play'; enterRoom(0,null); sfx(520,.08);
}
function enterRoom(i,from){
  G.room=i; const room=G.world.rooms[i]; if(G.p) hookClear(G.p);
  const sx = from==='L'?14 : from==='R'?W-14 : 22;
  G.rs={spawn:sx, logs:[], logT:1.2, rng:mulberry(hash(G.seed+'|run|'+i)), crawlers:room.crawlers.map((c,k)=>({x:c.cx,d:k%2?1:-1,hp:TUNE.SUPER.MOB_HP}))};
  G.burst=[]; G.splats=[]; rs_boss(); G.rs.croc={}; G.rs.perch=null; G.rs.crocRng=mulberry(hash(G.seed+'|croc|'+i)); cfReset(); G.rs.crev=crevState(room); if(G.p) G.p.grab=null; G.rs.flyers=spawnFlyers(i); G.rs.fdrops=[]; G.rs.cheeseT=0; G.rs.cheeseN=0;
  if(!G.p) G.p=newPlayer(sx);
  if(G.sup&&G.sup.on){ G.sup.bx=supX(from==='R'?sx+TUNE.SUPER.FOLLOW_GAP:sx-TUNE.SUPER.FOLLOW_GAP); G.sup.tgt=null; G.sup.wind=0; }   // super buddy comes along
}
function rs_boss(){ const room=G.world.rooms[G.room]; G.rs.boss=BOSS_DEF[room.kind]?mkBoss(room):null; }
function gid(i){return G.seed+'#'+i;}

/* ---------- helpers ---------- */
function holeAt(room,x){ for(const h of room.holes) if(x>h.x0&&x<h.x1) return h; return null; }
function vineAngle(v,t){ return VINE_A*Math.sin(VINE_W*t+v.ph); }
function vineVel(v,t){ return VINE_A*VINE_W*Math.cos(VINE_W*t+v.ph); }
function vinePt(v,t,s){ const a=vineAngle(v,t); return {x:v.ax+Math.sin(a)*v.len*s, y:VINE_Y+Math.cos(a)*v.len*s}; }
function snapOpen(pool,k,t){ return ((t+pool.ph[k])%SNAP_C)>1.7; }
function snapWarn(pool,k,t){ const m=((t+pool.ph[k])%SNAP_C); return m>1.4&&m<=1.7; }

let ac=null, sfxVol=1, sfxLastGain=0;   // sfxVol: sound level multiplier (set by the sound button / M, see setVol)
function sfx(f,d,type){ sfxLastGain=.04*sfxVol; try{ if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();} const o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'square'; o.frequency.value=f; g.gain.value=sfxLastGain; g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+d); }catch(e){} }

function loseLife(why){
  const p=G.p; if(p.dead>0) return;
  p.dead=0.8; p.vine=null; hookClear(p); p.grab=null; p.chip=0; G.lives--; G.msg=why; G.msgT=1.2; sfx(110,.35,'sawtooth');
}
/* shield (plan items 3-10). A hit from a projectile, a physical attack or a log:
   - blocking with the shield in front: stamina drops by force x BLOCK_COST_PER_FORCE and he is shoved by the force of the hit;
     if that empties his stamina the shield drops on the ground where he is
   - blocking with no shield (hands): same shove, and HAND_BLOCK_DAMAGE of a heart instead of a whole one
   - not blocking (or the shield is still coming round): the hit costs a heart */
const blockReady=p=>p.blocking&&p.blk>=(p.shield?TUNE.RAISE_TIME:TUNE.HAND_RAISE_TIME);
function harm(why,sx,force){
  const p=G.p; if(p.inv>0||p.binv>0||p.dead>0) return;
  const f=force===undefined?1:Math.max(0,force);
  if(superFight()){ superSoak(why,f); return; }   // super buddy takes the hit instead (no heart, no stamina)
  if(!blockReady(p)){ loseLife(why); return; }
  const d=(sx===undefined||sx===p.x)?-p.face:(p.x<sx?-1:1);
  p.vine=null; hookClear(p); p.grab=null; p.grabCd=0.3; p.kick=0; p.vx=d*TUNE.REACT_VX_PER_FORCE*f; p.vy=-TUNE.REACT_VY_PER_FORCE*f; if(p.vy<0) p.onGround=false; p.coyote=0;
  p.react=Math.min(TUNE.REACT_T_MAX,TUNE.REACT_T_PER_FORCE*f); p.binv=TUNE.BLOCK_INV; jumpQ=0;
  G.blocks++; G.lastBlock={why,force:f,hand:!p.shield,cost:p.shield?f*TUNE.BLOCK_COST_PER_FORCE:0};
  if(p.shield&&G.gear&&G.gear.plate>0){   // workshop shield plate: this block costs no stamina (shove as normal)
    G.gear.plate--; G.gear.plateUsed++; G.lastBlock.cost=0; G.lastBlock.plate=true; G.msg='plate took it: '+why+' ('+G.gear.plate+' left)'; G.msgT=.8; sfx(620,.09,'triangle');
  } else if(p.shield){
    p.stam=Math.max(0,p.stam-f*TUNE.BLOCK_COST_PER_FORCE); p.regenT=TUNE.REGEN_DELAY;
    if(p.stam<=0) dropShield(); else { G.msg='blocked: '+why; G.msgT=.7; sfx(520,.09,'triangle'); }
  } else {
    p.chip+=TUNE.HAND_BLOCK_DAMAGE;
    if(p.chip>=1-1e-9){ const rest=p.chip-1; loseLife(why+' (hand block)'); p.chip=Math.max(0,rest); }
    else { G.msg='hand block: '+why; G.msgT=.8; sfx(300,.1,'square'); }
  }
}
/* stamina ran out while blocking: the shield falls where he stands (over a pit it lands on the nearer edge) */
function dropShield(){
  const p=G.p, room=G.world.rooms[G.room]; let x=Math.max(8,Math.min(W-8,p.x)); const h=holeAt(room,x);
  if(h) x=(x-h.x0<h.x1-x)?h.x0-6:h.x1+6;
  G.drop={room:G.room,x:Math.max(8,Math.min(W-8,x))}; p.shield=false;
  G.msg='shield dropped! walk over it to pick it up'; G.msgT=1.6; sfx(160,.3,'sawtooth');
}
// speed multiplier on all points, on the run clock: x3 under 3:00 (super bonus), then x2.0 at 3:00 falling to x1.0 at 10:00, then x1
const superBonus=t=>t<SPD.SUPER_T;
/* ground items: the stamina refill item was taken out (stamina works exactly as the live game: block costs and the slow
   refill only). The item list stays empty; mobDied() drops nothing. */
const ITEMS={};
function dropItem(id,x){ if(!ITEMS[id]||BOSS_ROOMS.includes(G.room)) return null; const it={id,room:G.room,x:Math.max(8,Math.min(W-8,x))}; G.items.push(it); return it; }
function mobDied(){ return null; }
/* ---------- the workshop (building world, first slice) ----------
   The junk collector's caravan stands in the last room before boss 1. Its back flap opens a cardboard workshop where junk from
   the run is taped into gear that lasts the whole run. Junk comes from the forest rooms (lying about: walk over it; the hook is
   unchanged and does not aim at junk)
   and from the fishing world (junk catches); it all goes in ONE junk bag (cap BAG_MAX). The junk collector himself (trading)
   is not in this slice: only his caravan and its workshop flap. Its own rng streams, so every room rolls exactly as before.
   ALL NUMBERS HERE ARE PLAYTEST DEFAULTS; PLATE_HITS (3) is a set number. */
const WORK = {
  BAG_MAX: 12,                  // pieces the junk bag holds
  ROOM: BOSS_ROOMS[0] - 1,      // the caravan stands in the last room before boss 1 (the only workshop stop in this slice)
  CARAVAN_X: Array.from({ length: 61 }, (_, k) => 292 - k * 4),   // px (292 down to 52, every 4 px): first spot with solid ground under the flap, clear of a fishing side path
  NEAR: 18,                     // px: this close to the flap = the workshop prompt shows
  PLATE_HITS: 3,                // shield plate: shield blocks that cost no stamina, for the run
  SPRING_PX: [10, 15, 20],      // hook spring: extra hook reach (px) by how many slots got a matching material (0 / 1 / 2)
  PATCH_PTS: [15, 20, 25],      // buddy armour patch: extra super power meter by matching slots (0 / 1 / 2)
  ROOM_CHANCE: 0.6, ROOM_MAX: 2, // a forest room has junk lying about this often, up to this many pieces
  TAPE_T: 0.55                  // seconds of the tape animation
};
// materials: rows of the shared materials table (density g/cm3, bounce, deform, sound). A slot asks for a kind of junk; the kind
// comes from these numbers: hard = dense and rigid, springy = bouncy, light = light.
const MAT = { rubber: { density: 1.2, bounce: .35, deform: 'firm', sound: 'squeak' }, steel: { density: 7.85, bounce: .25, deform: 'rigid', sound: 'metal_clink' },
  hard_plastic: { density: 1.05, bounce: .4, deform: 'rigid', sound: 'plastic_tick' }, wood: { density: .55, bounce: .2, deform: 'rigid', sound: 'wood_clack' },
  cloth: { density: .02, bounce: .02, deform: 'cloth', sound: 'fabric_rustle' }, glass: { density: 2.5, bounce: .2, deform: 'rigid', sound: 'glass_tap' },
  cardboard: { density: .7, bounce: .1, deform: 'firm', sound: 'box_tap' } };
const matTags = m => { const r = MAT[m], t = []; if (r.density >= 2 && r.deform === 'rigid') t.push('hard'); if (r.bounce >= .3) t.push('springy'); if (r.density < 1.1) t.push('light'); return t; };
const JUNK = { boot: { n: 'old boot', mat: 'rubber', col: '#4a3a2e' }, can: { n: 'tin can', mat: 'steel', col: '#a9b2b8' }, remote: { n: 'tv remote', mat: 'hard_plastic', col: '#34343c' },
  plank: { n: 'broken plank', mat: 'wood', col: '#9a6a3a' }, rag: { n: 'old rag', mat: 'cloth', col: '#c7b48a' }, bottle: { n: 'glass bottle', mat: 'glass', col: '#5fa58a' } };
const FOREST_JUNK = ['plank', 'rag', 'bottle', 'can', 'boot'];
const FISH_JUNK = { boot: 'boot', can: 'can', remote: 'remote' };   // fishing-world junk catches -> the same bag
const BLUEPRINTS = [
  { id: 'plate', n: 'shield plate', slots: ['any', 'any'], does: 'shield blocks that cost no stamina' },   // any junk: its number (3) is set
  { id: 'spring', n: 'hook spring', slots: ['springy', 'light'], does: 'longer hook reach' },
  { id: 'patch', n: 'buddy armour patch', slots: ['hard', 'light'], does: 'a bigger super power meter' } ];
function wsReset(){ G.bag = []; G.junkIn = { forest: 0, fish: 0, full: 0 }; G.gear = { plate: 0, plateUsed: 0, spring: 0, patch: 0, built: {} }; G.ws = null; G.wsNear = false; G.jspots = junkGen(G.seed); }
/* junk lying about in the forest rooms (never in boss rooms): own rng stream, kept off holes and croc pools */
function junkGen(seed){
  const r = mulberry(hash(seed + '|junk')), out = [];
  for (let i = 0; i < ROOMS; i++) { if (BOSS_ROOMS.includes(i)) continue; const room = G.world.rooms[i]; if (r() >= WORK.ROOM_CHANCE) continue;
    const n = 1 + Math.floor(r() * WORK.ROOM_MAX);
    for (let k = 0; k < n; k++) { let x = 0, ok = false; for (let t = 0; t < 30 && !ok; t++) { x = 40 + Math.floor(r() * 240); ok = !room.holes.some(h => x > h.x0 - 12 && x < h.x1 + 12) && !room.pools.some(q => x > q.x0 - 12 && x < q.x1 + 12) && !out.some(o => o.room === i && Math.abs(o.x - x) < 24); }
      const kind = FOREST_JUNK[Math.floor(r() * FOREST_JUNK.length)]; if (ok) out.push({ junk: true, room: i, x, y: GY - 4, kind, got: false }); } }
  return out;
}
function junkAdd(kind, src){
  if (!JUNK[kind] || !G.bag) return false;
  if (G.bag.length >= WORK.BAG_MAX) { G.junkIn.full++; if (G.state === 'play') { G.msg = 'junk bag full (' + WORK.BAG_MAX + '/' + WORK.BAG_MAX + ')'; G.msgT = 1; } return false; }
  G.bag.push(kind); G.junkIn[src === 'fish' ? 'fish' : 'forest']++;
  if (G.state === 'play') { G.msg = 'junk: ' + JUNK[kind].n + ' (' + G.bag.length + '/' + WORK.BAG_MAX + ')'; G.msgT = .9; }
  sfx(640, .05, 'triangle'); return true;
}
const junkInFish = key => FISH_JUNK[key] ? junkAdd(FISH_JUNK[key], 'fish') : false;   // the fishing world hands its junk catches over here
function junkStep(p){
  if (!G.jspots) return; for (const j of G.jspots) { if (j.got || j.room !== G.room) continue;
    const on = Math.abs(p.x - j.x) < 9 && Math.abs((p.y - 12) - j.y) < 14;
    if (on && !j.touch) { if (junkAdd(j.kind, 'forest')) j.got = true; }   // a full bag refuses it once per touch; the piece stays where it lies
    j.touch = on; }
}
let wsPathX = () => null;   // the fishing world's side path in a room (set once it exists): the caravan keeps clear of its prompt
function caravanX(room){   // solid ground under the flap first; then as far from a fishing side path as can be (60, 40, 36 px: past 34 the two prompts never overlap)
  const px = wsPathX(room.i), solid = x => !room.holes.some(h => x > h.x0 - 16 && x < h.x1 + 16) && !room.pools.some(q => x > q.x0 - 16 && x < q.x1 + 16);
  for (const gap of [60, 40, 36, 0]) for (const x of WORK.CARAVAN_X) if (solid(x) && (px === null || Math.abs(x - px) >= gap)) return x;
  return WORK.CARAVAN_X[0]; }
function wsNearCheck(p){ const room = G.world.rooms[G.room]; G.wsNear = G.room === WORK.ROOM && p.dead <= 0 && p.onGround && !p.hook && !p.vine && Math.abs(p.x - caravanX(room)) < WORK.NEAR; return G.wsNear; }
// gear effects (the whole run). matches: how many slots got a junk whose material is the kind the slot asks for
const slotFits = (want, kind) => !!(kind && JUNK[kind] && (want === 'any' || matTags(JUNK[kind].mat).includes(want)));
const bpMatches = (bp, slots) => bp.slots.reduce((n, w, i) => n + (slotFits(w, slots[i]) ? 1 : 0), 0);
function bpResult(bp, slots){ const m = bpMatches(bp, slots);
  return bp.id === 'plate' ? { m, v: WORK.PLATE_HITS, txt: WORK.PLATE_HITS + ' free shield hits' } : bp.id === 'spring' ? { m, v: WORK.SPRING_PX[m], txt: '+' + WORK.SPRING_PX[m] + ' hook reach' } : { m, v: WORK.PATCH_PTS[m], txt: '+' + WORK.PATCH_PTS[m] + ' super power' }; }
const hookReach = () => HK.RANGE + (G.gear ? G.gear.spring : 0);
const supMax = () => TUNE.SUPER.METER + (G.gear ? G.gear.patch : 0);
/* the workshop screen: open at the caravan flap (F, or the WORKSHOP button); the run stands still while it is open (timer too) */
function wsOpen(){ const p = G.p; if (G.state !== 'play' || G.freeze || !p || !wsNearCheck(p) || (G.ws && G.ws.open)) return false;
  G.ws = { open: true, bp: BLUEPRINTS.findIndex(b => !G.gear.built[b.id]), slots: [null, null], pick: -1, tapeT: 0, opens: ((G.ws && G.ws.opens) || 0) + 1, built: 0 };
  if (G.ws.bp < 0) G.ws.bp = 0; wsResetInput(); sfx(330, .12, 'triangle'); return true; }
let wsResetInput = () => {};   // the view sets this (drops held keys / mouse)
function wsPickBp(i){ const w = G.ws; if (!w || !w.open || w.tapeT > 0 || !BLUEPRINTS[i]) return false; wsClearSlots(); w.bp = i; w.pick = -1; return true; }
function wsPickJunk(i){ const w = G.ws; if (!w || !w.open || w.tapeT > 0 || i < 0 || i >= G.bag.length) return false; w.pick = w.pick === i ? -1 : i; return true; }
function wsFill(slot, bagI){   // put a piece from the bag in a slot (tap junk, then tap slot; or drag)
  const w = G.ws; if (!w || !w.open || w.tapeT > 0) return false; const bp = BLUEPRINTS[w.bp]; if (!bp || G.gear.built[bp.id] || slot < 0 || slot >= bp.slots.length) return false;
  const i = bagI === undefined ? w.pick : bagI; if (i < 0 || i >= G.bag.length) return false;
  if (w.slots[slot]) G.bag.push(w.slots[slot]);
  w.slots[slot] = G.bag.splice(i, 1)[0]; w.pick = -1; sfx(180, .06, 'triangle'); return true; }
function wsTakeBack(slot){ const w = G.ws; if (!w || !w.open || w.tapeT > 0 || !w.slots[slot]) return false; G.bag.push(w.slots[slot]); w.slots[slot] = null; sfx(260, .05, 'triangle'); return true; }
function wsClearSlots(){ const w = G.ws; if (!w) return; for (let k = 0; k < w.slots.length; k++) if (w.slots[k]) { G.bag.push(w.slots[k]); w.slots[k] = null; } }
function wsTape(){   // tape it: the junk in the slots is used up, the gear goes on for the rest of the run
  const w = G.ws; if (!w || !w.open || w.tapeT > 0) return false; const bp = BLUEPRINTS[w.bp];
  if (!bp || G.gear.built[bp.id]) { G.msg = 'already built'; G.msgT = .8; return false; }
  if (w.slots.slice(0, bp.slots.length).some(s => !s)) { G.msg = 'fill both slots first'; G.msgT = .8; sfx(140, .1, 'square'); return false; }
  const r = bpResult(bp, w.slots); G.gear.built[bp.id] = { slots: w.slots.slice(), m: r.m, v: r.v };
  if (bp.id === 'plate') G.gear.plate = r.v; else if (bp.id === 'spring') G.gear.spring = r.v; else { G.gear.patch = r.v; if (G.sup && G.sup.on) G.sup.meter = Math.min(supMax(), G.sup.meter + r.v); }   // already super: the meter grows with its max
  w.slots = [null, null]; w.tapeT = WORK.TAPE_T; w.built++; w.last = bp.id; G.msg = bp.n + ' taped on: ' + r.txt; G.msgT = 1.4;
  for (let k = 0; k < 4; k++) setTimeout(() => sfx(2400 - k * 300, .05, 'sawtooth'), k * 60);   // tape rip
  return true; }
function wsStep(dt){ const w = G.ws; if (w && w.tapeT > 0) { w.tapeT = Math.max(0, w.tapeT - dt); if (w.tapeT <= 0) { const n = BLUEPRINTS.findIndex(b => !G.gear.built[b.id]); if (n >= 0) w.bp = n; } } }
function wsLeave(){   // walk out the far side: straight into the boss room
  const w = G.ws; if (!w || !w.open) return false; wsClearSlots(); w.open = false; w.tapeT = 0; wsResetInput();
  const p = G.p; p.x = 3; p.y = GY; p.vx = 0; p.vy = 0; p.onGround = true; p.vine = null; enterRoom(BOSS_ROOMS[0], 'L'); sfx(300, .1, 'triangle'); return true; }
wsReset();   // the junk bag and gear exist from the start (the title screen's world too)
function speedMult(t){ return superBonus(t) ? SPD.SUPER : Math.max(SPD.END, SPD.START-(SPD.START-SPD.END)*(t-SPD.SUPER_T)/(SPD.FADE_T-SPD.SUPER_T)); }
function addScore(n){ if(G.camp) return 0; const pts=Math.round(n*speedMult(G.runT)); G.score+=pts; return pts; }   // no points in a camp fight (the clock waits there); its reward is the loot
const clockTxt=t=>{ const s=Math.max(0,Math.floor(t)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
function endRun(result){
  G.state='end'; G.result=result;
  if(result==='win') addScore(Math.max(0,Math.floor(G.timeLeft))*10);
  try{ if(G.score>G.best){G.best=G.score; localStorage.setItem(BEST_KEY(G.seed),String(G.best));} }catch(e){}
  sfx(result==='win'?880:140,.4);
}

/* ---------- update ---------- */
function update(dt){
  if(G.state!=='play') return;
  if(G.ws&&G.ws.open){ wsStep(dt); return; }   // the workshop is open: the run stands still (timer too)
  if(G.freeze){ freezeStep(dt); return; }   // super cutscene: the whole game stands still (timer too)
  let edt=dt; if(G.ease>0){ G.ease=Math.max(0,G.ease-dt); const u=1-G.ease/CUT.REENTRY; edt=dt*u*u*(3-2*u); }   // after it: enemies ease back up to speed
  const room=G.world.rooms[G.room], p=G.p, rs=G.rs;
  G.t+=dt; if(!G.camp){ G.timeLeft-=dt; G.runT+=dt; } if(G.msgT>0) G.msgT-=dt;   // G.camp: a top-down map camp fight (topworld.js): the run clock waits, as on the map
  if(G.timeLeft<=0){ G.timeLeft=0; endRun('time'); return; }
  if(jumpQ>0) jumpQ-=dt;
  if(p.hookCd>0){ p.hookCd-=dt; if(p.hookCd<=0){ p.hookCd=0; sfx(1760,.03,'sine'); } }   // zip cooldown; a tiny tick when the hook is ready
  if(p.grabCd>0) p.grabCd-=dt; if(p.inv>0) p.inv-=dt; if(p.binv>0) p.binv-=dt; if(p.react>0) p.react-=dt; if(p.kick>0) p.kick-=dt; else p.kickIn=false; if(p.kickCd>0) p.kickCd-=dt;
  if(G.sup.nrT>0) G.sup.nrT-=dt;
  // block input: blk counts how long the block has been up (the shield has to come round from his back first)
  p.blocking=wantBlock()&&!p.vine&&!hookRiding(p)&&p.dead<=0; p.blk=p.blocking?p.blk+dt:0;
  // stamina refills slowly on its own (a short pause after each block) - exactly as the live game
  if(p.regenT>0) p.regenT-=dt; else p.stam=Math.min(STAM_MAX,p.stam+TUNE.REGEN_PER_SEC*dt);
  if(G.sup&&!G.sup.on&&G.sup.cd>0) G.sup.cd=Math.max(0,G.sup.cd-dt);   // buddy super recharge (its own clock; not stamina, not the run timer)
  if(G.winT>0){ G.winT-=dt; if(G.winT<=0){ endRun('win'); return; } }

  // dying: wait then respawn or end
  if(p.dead>0){
    p.dead-=dt; p.y+=Math.min(p.vy,60)*dt;
    if(p.dead<=0){
      if(G.lives<=0){ endRun('lives'); return; }
      p.x=rs.spawn; p.y=GY; p.vx=0; p.vy=0; p.onGround=true; p.vine=null; p.inv=1.6; p.dead=0; jumpQ=0; p.kick=0; p.kickDown=false; p.kickIn=false; p.react=0; p.binv=0; if(rs.boss) bossReset(rs.boss);
    }
    stepWorld(room,rs,edt); return;
  }

  const ax=(keys.right?1:0)-(keys.left?1:0);
  if(!p.grab) hookStep(p,room,dt);
  if(p.grab){ grabStep(p,room,dt); }   // held by a tentacle
  else if(p.vine){
    const v=p.vine, pt=vinePt(v,G.t,p.vs);
    p.x=pt.x; p.y=pt.y+14; p.vx=0; p.vy=0; p.onGround=false;
    if(ax) p.face=ax;
    if(jumpQ>0){ // release: carry the swing's velocity
      jumpQ=0; const a=vineAngle(v,G.t), w=vineVel(v,G.t), r=v.len*p.vs;
      p.vx=Math.max(-150,Math.min(150,r*w*Math.cos(a)))+ax*15; p.vy=-r*w*Math.sin(a)-70;
      p.vine=null; p.grabCd=0.35; p.kick=0.8; sfx(660,.07);
    }
  } else if(hookRide(p,room,dt,ax)){
    // on the hook rope: hookRide moved him (zip or swing)
  } else {
    if(p.onGround) p.coyote=0.08; else if(p.coyote>0) p.coyote-=dt;
    if(ax) p.face=ax;
    if(p.onGround&&p.react<=0){ p.vx=ax*SPEED*(p.blocking?TUNE.BLOCK_MOVE_SCALE:1); }
    else if(p.onGround){ p.vx*=Math.exp(-6*dt); }   // a shove from a blocked hit slides him along the ground and fades
    else { const tv=ax*SPEED, d=tv-p.vx, m=260*dt; p.vx+=Math.abs(d)<m?d:Math.sign(d)*m; }
    if(jumpQ>0 && p.coyote>0 && p.react<=0){ p.vy=-JUMP_V; p.onGround=false; p.coyote=0; jumpQ=0; sfx(440,.08); }
    if(p.kickDown&&!p.onGround&&p.vy>-30) p.vy=Math.max(p.vy,TUNE.KICK.DOWN_V);   // kick down: a fast strike down
    const prevY=p.y, prevX=p.x;
    p.vy+=GRAV*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.onGround) p.step+=Math.abs(p.vx)*dt;
    // ground
    const hole=holeAt(room,p.x);
    if(p.y>=GY && prevY<=GY+1 && p.vy>=0 && !hole){ p.y=GY; p.vy=0; p.onGround=true; }
    else if(p.y>=GY && p.vy>=0 && !hole && p.y<GY+6){ p.y=GY; p.vy=0; p.onGround=true; }
    else if(p.y>GY+3 && hole){ p.x=Math.max(hole.x0+2,Math.min(hole.x1-2,p.x)); p.onGround=false; }
    else if(p.y<GY-0.5) p.onGround=false;
    if(!p.onGround && hole && hole.fill && p.y>GY+TUNE.CREV.FILL_DEPTH+6){ loseLife(hole.fill==='lava'?'burned in the lava':'swept away by the water'); }
    if(!p.onGround && p.y>GY+2 && hole && p.y>H+8){ loseLife('into the pit'); }
    if(p.onGround && hole){ p.onGround=false; }
    if(p.dead<=0) crocSolid(p,room,prevX,prevY);
    { const pc=p.dead<=0?crocPerch(p,room):null; G.rs.perch=pc?pc.key:null; }   // the croc he stands on can't bite
    if(p.onGround && p.kickDown){ p.kickDown=false; p.kick=0; fxKickLand(p); }
    // vine grab
    if(!p.onGround && p.grabCd<=0){
      for(const v of room.vines){
        for(let s=1;s>=0.4;s-=0.1){ const pt=vinePt(v,G.t,s);
          if(Math.hypot(p.x-pt.x,(p.y-18)-pt.y)<10){ p.vine=v; p.vs=s; sfx(300,.06); break; } }
        if(p.vine) break;
      }
    }
  }
  if(p.dead>0) return;
  // dropped shield: walk over it to pick it up
  if(!p.shield && G.drop && G.drop.room===G.room && p.onGround && Math.abs(p.x-G.drop.x)<TUNE.PICKUP_RANGE){
    p.shield=true; G.drop=null; G.msg='shield picked up'; G.msgT=.9; sfx(700,.08,'triangle'); }
  // items on the ground (none are made in this build: the stamina refill was taken out; kept for later item kinds)
  for(let i=G.items.length-1;i>=0;i--){ const it=G.items[i];
    if(it.room===G.room && p.onGround && Math.abs(p.x-it.x)<TUNE.PICKUP_RANGE){ G.items.splice(i,1); ITEMS[it.id].give(); } }
  junkStep(p); wsNearCheck(p);   // junk lying about goes in the junk bag; the caravan flap (workshop) prompt

  // room transitions
  if(!p.vine){
    const locked=isLocked();
    if(p.x>W){ if(G.room<ROOMS-1&&!locked){ p.x=3; enterRoom(G.room+1,'L'); } else p.x=W; }
    else if(p.x<0){ if(G.camp){ p.x=0; G.camp.flee=true; } else if(G.room>0&&!locked){ p.x=W-3; enterRoom(G.room-1,'R'); } else p.x=0; }   // camp fight: the left side is the way out (topworld.js)
  }
  const room2=G.world.rooms[G.room], rs2=G.rs;
  stepWorld(room2,rs2,edt); bossUpdate(edt); burstUpdate(dt); superStep(dt,rs2); flyersUpdate(room2,rs2,p,edt); if(p.dead<=0) crevUpdate(room2,rs2,p,dt); if(room2.pools.length){ crocUpdate(room2,rs2,p,dt); fishStep(room2,p,dt); }

  // hazards (skip while invulnerable)
  if(p.inv<=0 && p.dead<=0){
    for(const l of rs2.logs) if(Math.abs(p.x-l.x)<9 && p.y>GY-13){ harm('hit by a log',l.x,FORCE.log*l.sp/57); break; }
    if(p.dead<=0) for(const c of rs2.crawlers) if(!c.dead && Math.abs(p.x-c.x)<9 && p.y>GY-8){ harm('crawler bite',c.x,FORCE.crawler); break; }
    if(p.dead<=0) for(const c of crocs(room2)){ const C=TUNE.CROC, m0=c.d>0?c.cx+C.HALF-2:c.cx-C.HALF-C.MOUTH, m1=m0+C.MOUTH+2;   // the open mouth bites; its head is safe
      if(c.key!==rs2.perch&&p.x>m0&&p.x<m1&&p.y>GY-C.H+2&&snapOpen(c.pl,c.k,G.t)){ harm('snapped',c.cx,FORCE.snap); break; } }
  }
  // treasure
  const tr=room2.treasure;
  if(tr && !G.got.has(gid(room2.i)) && p.dead<=0 && Math.abs(p.x-tr.x)<10 && Math.abs((p.y-12)-tr.y)<15){
    G.got.add(gid(room2.i)); addScore([500,300,800][tr.kind]); sfx(990,.1); G.msg='treasure!'; G.msgT=.8;
    if(G.got.size>=TREASURES&&!G.allGems){ G.allGems=true; const pts=addScore(1000); G.msg='all gems! +'+pts; G.msgT=1.5; }
  }
}
/* solid crocs: one per snapper pool cell. He can stand on a head; the body blocks him; the open mouth bites (FORCE.snap) */
function crocs(room){ if(room._crocs) return room._crocs; const out=[]; Object.defineProperty(room,'_crocs',{value:out}); room.pools.forEach((pl,pi)=>{ const cw=(pl.x1-pl.x0)/pl.n; for(let k=0;k<pl.n;k++) out.push({pl,k,pi,key:pi+'_'+k,cx:pl.x0+(k+.5)*cw,d:pl.dir?pl.dir[k]:1}); }); return out; }
/* the croc he stands on (its head top, inside its width): that croc is pinned and can't open its jaws */
function crocPerch(p,room){ const C=TUNE.CROC; if(!p.onGround||Math.abs(p.y-(GY-C.H))>.6) return null; for(const c of crocs(room)) if(Math.abs(p.x-c.cx)<C.HALF+2) return c; return null; }
function crocSt(key){ const S=G.rs.croc||(G.rs.croc={}); return S[key]||(S[key]={st:'idle',t:0,cd:.6,y:0}); }
/* lunge: a croc under a swinging mudbot (vine or hook rope) tells, lunges up out of the water at him, then sinks back; its snout bites */
function crocUpdate(room,rs,p,dt){
  const C=TUNE.CROC, L=C.LUNGE, top=GY-C.H, swinging=!!(p.vine||hookRiding(p)), r=rs.crocRng||Math.random;
  for(const c of crocs(room)){ const s=crocSt(c.key); s.t+=dt;
    if(s.st==='idle'){ s.cd-=dt; s.y=0;
      if(s.cd<=0&&p.dead<=0&&swinging&&rs.perch!==c.key&&Math.abs(p.x-c.cx)<L.NEAR_X&&p.y<top&&top-p.y<L.NEAR_Y){ s.st='tell'; s.t=0; sfx(180,.12,'square'); } }
    else if(s.st==='tell'){ if(s.t>=L.TELL){ s.st='up'; s.t=0; sfx(95,.2,'sawtooth'); } }
    else if(s.st==='up'){ s.y=L.H*Math.min(1,s.t/L.UP); if(s.t>=L.UP){ s.st='hold'; s.t=0; } }
    else if(s.st==='hold'){ s.y=L.H; if(s.t>=L.HOLD){ s.st='down'; s.t=0; } }
    else if(s.st==='down'){ s.y=L.H*Math.max(0,1-s.t/L.DOWN); if(s.t>=L.DOWN){ s.st='idle'; s.t=0; s.y=0; s.cd=L.CD[0]+r()*(L.CD[1]-L.CD[0]); } }
    if((s.st==='up'||s.st==='hold')&&p.dead<=0&&p.inv<=0){ const sx=c.cx+c.d*C.HALF, sy=top-s.y-3;
      if(Math.hypot(p.x-sx,(p.y-6)-sy)<L.R){ harm('a croc lunged at you',c.cx,FORCE.snap); s.st='down'; s.t=0; } } }
}
/* fishing from a croc head: stand still on one, F (or the fish button) casts, wait for the bite, F again. Common catches land; rare ones are a quick mash */
const CROC_FISH = { common: [['mud minnow', 20], ['bog perch', 35], ['whiskered loach', 30], ['old boot', 5], ['rusty can', 5]], rare: [['croc-tooth eel', 150], ['golden mudskipper', 200], ['sunken trinket', 180]] };
function cfReset(){ G.cf={ph:'idle',t:0,still:0,key:null,wait:0,miss:(G.cf&&G.cf.miss)||0,n:0,got:null}; }
function fishStep(room,p,dt){
  const F=TUNE.CROC.FISH, cf=G.cf||(cfReset(),G.cf), perch=G.rs.perch, still=perch&&Math.abs(p.vx)<1&&!keys.left&&!keys.right&&!p.blocking&&!G.freeze;
  if(!still){ if(cf.ph!=='idle'){ G.msg='the line came in'; G.msgT=.8; } const m=cf.miss; cfReset(); G.cf.miss=m; return; }
  cf.key=perch; cf.still+=dt; cf.t+=dt;
  if(cf.ph==='idle'&&cf.still>=F.STILL&&G.msgT<=0){ G.msg=isTouch?'tap FISH to cast':'F: fish off the croc'; G.msgT=.15; }
  else if(cf.ph==='wait'&&cf.t>=cf.wait){ cf.ph='bite'; cf.t=0; sfx(880,.12,'square'); G.msg='! BITE - '+(isTouch?'tap FISH':'press F'); G.msgT=F.WIN; }
  else if(cf.ph==='bite'&&cf.t>F.WIN){ cf.ph='idle'; cf.t=0; cf.miss++; G.msg='it nibbled off the bait'; G.msgT=.9; }
  else if(cf.ph==='mash'){ G.msg='RARE: '+cf.got[0]+'! mash '+(isTouch?'FISH':'F')+' '+cf.n+'/'+F.MASH; G.msgT=.15; if(cf.t>F.MASH_T){ cf.ph='idle'; cf.t=0; cf.miss++; G.msg='the '+cf.got[0]+' got away'; G.msgT=1.2; sfx(120,.3,'sawtooth'); } }
}
function cfLand(name,pts){ const cf=G.cf; const got=addScore(pts); G.fishCaught=(G.fishCaught||0)+1; G.msg='caught: '+name+'  +'+got; G.msgT=1.6; sfx(1040,.2,'triangle'); cf.ph='idle'; cf.t=0; }
function fishInput(){
  const F=TUNE.CROC.FISH, cf=G.cf; if(G.state!=='play'||G.freeze||!G.p||G.p.dead>0||!cf||!G.rs.perch||cf.still<F.STILL) return false;
  if(cf.ph==='idle'){ cf.ph='wait'; cf.t=0; cf.wait=F.WAIT[0]+Math.random()*(F.WAIT[1]-F.WAIT[0]); sfx(700,.08,'triangle'); return true; }
  if(cf.ph==='wait'){ cf.ph='idle'; cf.t=0; G.msg='too early!'; G.msgT=.8; return true; }
  if(cf.ph==='bite'){ const rare=Math.random()<F.RARE+cf.miss*F.PITY, tab=rare?CROC_FISH.rare:CROC_FISH.common, c=tab[Math.floor(Math.random()*tab.length)];
    if(rare){ cf.ph='mash'; cf.t=0; cf.n=0; cf.got=c; sfx(440,.15,'sawtooth'); } else cfLand(c[0],c[1]); return true; }
  if(cf.ph==='mash'){ cf.n++; if(cf.n>=F.MASH){ cf.miss=0; cfLand(cf.got[0],cf.got[1]); } return true; }
  return false;
}
function crocSolid(p,room,prevX,prevY){
  const C=TUNE.CROC, top=GY-C.H, hw=3;
  for(const c of crocs(room)){ if(p.x+hw<=c.cx-C.HALF||p.x-hw>=c.cx+C.HALF) continue;
    if(p.vy>=0&&prevY<=top+1&&p.y>=top){ p.y=top; p.vy=0; p.onGround=true; if(p.kickDown){ p.kickDown=false; p.kick=0; } }   // standing on its head
    else if(p.y>top+1){ p.x=prevX<=c.cx?c.cx-C.HALF-hw:c.cx+C.HALF+hw; p.vx=0; }   // the body blocks him
  }
}
/* crevasse creatures: per hole of this room, a giant biter and / or tentacles (state machines in logical px) */
function crevState(room){ const out=[], r=G.rs.rng, cd=a=>a[0]+r()*(a[1]-a[0]);
  room.holes.forEach((h,hi)=>{ if(!h.biter&&!h.tent) return;
    out.push({hi,h,bite:h.biter?{st:'idle',t:cd(TUNE.BITER.CD)*.5,x:(h.x0+h.x1)/2,y:GY+TUNE.BITER.DEPTH}:null,tent:h.tent?{st:'idle',t:cd(TUNE.TENT.CD)*.5,ext:0,side:h.tent}:null}); });
  return out; }
function crevUpdate(room,rs,p,dt){
  if(!rs.crev) return; const B=TUNE.BITER, T=TUNE.TENT, r=rs.rng, cd=a=>a[0]+r()*(a[1]-a[0]);
  for(const c of rs.crev){ const h=c.h, b=c.bite, t=c.tent;
    if(b){ b.t-=dt; const aim=()=>Math.max(h.x0+4,Math.min(h.x1-4,p.x));
      if(b.st==='idle'){ b.y=GY+B.DEPTH; if(b.t<=0){ if(p.dead<=0&&p.x>h.x0-B.NEAR&&p.x<h.x1+B.NEAR){ b.st='tell'; b.t=B.TELL; b.x=aim(); sfx(70,.4,'sawtooth'); } else b.t=.3; } }
      else if(b.st==='tell'){ b.x=aim(); b.y=GY+B.DEPTH-(B.DEPTH-6)*(1-Math.max(0,b.t)/B.TELL); if(b.t<=0){ b.st='up'; b.t=B.UP; sfx(90,.3,'square'); } }
      else if(b.st==='up'){ b.y=GY+B.DEPTH-(B.DEPTH+B.TOP)*(1-Math.max(0,b.t)/B.UP); if(b.t<=0){ b.st='hold'; b.t=B.HOLD; } }
      else if(b.st==='hold'){ b.y=GY-B.TOP; if(b.t<=0){ b.st='down'; b.t=B.DOWN; } }
      else if(b.st==='down'){ b.y=GY+B.DEPTH-(B.DEPTH+B.TOP)*(Math.max(0,b.t)/B.DOWN); if(b.t<=0){ b.st='idle'; b.t=cd(B.CD); } }
      if((b.st==='up'||b.st==='hold')&&p.inv<=0&&p.dead<=0&&!p.grab&&Math.abs(p.x-b.x)<B.HALF&&p.y>b.y-4) harm('bitten from below',b.x,FORCE.bite);
    }
    if(t&&p.dead<=0){ t.t-=dt; const ex=t.side<0?h.x0:h.x1;
      if(t.st==='idle'){ t.ext=Math.max(0,t.ext-dt*3); if(t.t<=0){ if(Math.abs(p.x-ex)<T.NEAR){ t.st='out'; t.t=T.OUT; sfx(120,.2,'triangle'); } else t.t=.3; } }
      else if(t.st==='out'){ t.ext=1-Math.max(0,t.t)/T.OUT; if(t.t<=0){ t.st='hold'; t.t=T.HOLD; } }
      else if(t.st==='hold'){ t.ext=1; if(t.t<=0){ t.st='in'; t.t=T.IN; } }
      else if(t.st==='in'){ t.ext=Math.max(0,t.t)/T.IN; if(t.t<=0){ t.st='idle'; t.t=cd(T.CD); t.ext=0; } }
      else if(t.st==='grab'){ t.ext=1; if(!p.grab||p.grab.c!==c){ t.st='in'; t.t=T.IN; } }
      if((t.st==='out'||t.st==='hold')&&!p.grab&&p.inv<=0&&!p.vine&&!hookRiding(p)&&p.y>GY-10){
        const tip=ex+t.side*T.REACH*t.ext, lo=Math.min(ex,tip), hi=Math.max(ex,tip);
        if(p.x>lo-3&&p.x<hi+3){ p.grab={c,t:0,n:0,kq:0,ex,side:t.side}; t.st='grab'; hookClear(p); p.kickDown=false; G.msg='grabbed! '+(T.BREAK==='window'?'jump when it slackens':'mash jump / kick'); G.msgT=1.2; sfx(140,.25,'sawtooth'); } }
    }
  }
}
/* held by a tentacle: dragged to the edge and down unless he breaks free (jump or kick presses; TUNE.TENT.BREAK); breaking free hops him away from the hole */
function grabStep(p,room,dt){
  const g=p.grab, T=TUNE.TENT; g.t+=dt; p.vx=0; p.vy=0;
  let press=0; if(jumpQ>0){ jumpQ=0; press=1; } if(g.kq){ g.kq=0; press=1; }
  if(press){ if(T.BREAK==='window'){ if((g.t%T.WIN_EVERY)>T.WIN_EVERY-T.WIN_LEN) g.n=T.MASH; } else g.n++; sfx(480+g.n*70,.05,'square'); }
  if(g.n>=T.MASH){ p.grab=null; p.inv=Math.max(p.inv,T.FREE_INV); p.vy=-JUMP_V*.75; p.vx=g.side*SPEED; p.onGround=false; p.coyote=0; G.msg='broke free'; G.msgT=.8; sfx(660,.1); return; }
  const inX=g.ex-g.side*8;   // a little way into the crevasse
  if(Math.abs(p.x-inX)>1) p.x+=Math.sign(inX-p.x)*Math.min(Math.abs(inX-p.x),T.PULL*dt);
  if(holeAt(room,p.x)){ p.y+=T.PULL*2*dt; p.onGround=false; } else { p.onGround=true; p.y=GY; }
  if(p.y>GY+18) loseLife('dragged down by a tentacle');
}
function stepWorld(room,rs,dt){
  if(room.logs){
    rs.logT-=dt;
    if(rs.logT<=0){ rs.logs.push({x:W+8,sp:50+rs.rng()*14,rot:0}); rs.logT=2.2+rs.rng()*1.4; }
  }
  for(let i=rs.logs.length-1;i>=0;i--){ const l=rs.logs[i]; l.x-=l.sp*dt; l.rot+=dt*l.sp/7;
    if(l.x<-10 || holeAt(room,l.x)) rs.logs.splice(i,1); }
  room.crawlers.forEach((cr,k)=>{ const s=rs.crawlers[k];
    if(s.dead||s.drag) return;                                                // smashed by super buddy / being dragged by the hook
    const cx=cr.cx+(s.bo||0);   // s.bo: where a T-mode drag left its beat
    if(s.off){ const lo=cx-cr.range, hi=cx+cr.range; s.d=s.x>hi?-1:s.x<lo?1:s.d; s.x+=s.d*cr.sp*dt; if(s.x>=lo&&s.x<=hi) s.off=false; return; }   // walks back to its beat after a drag
    s.x+=s.d*cr.sp*dt;
    if(s.x>cx+cr.range){s.x=cx+cr.range;s.d=-1;} if(s.x<cx-cr.range){s.x=cx-cr.range;s.d=1;}
    if(s.bo&&holeAt(room,s.x)){ s.x-=s.d*cr.sp*dt; s.d=-s.d; } });
}

/* ---------- flyers (numbers in TUNE.FLYER). Rolled per room visit from the seed with their own rng (the world layout and
   its fingerprint are unchanged); a killed flyer stays dead for the run. ---------- */
const FL = TUNE.FLYER;   // lerp() is the shared one (view helpers)
function pickW(r,ws){ let t=0; for(const w of ws) t+=w; let x=r()*t; for(let i=0;i<ws.length;i++){ x-=ws[i]; if(x<0) return i; } return ws.length-1; }
function rollRank(r,i){ const k=Math.max(0,Math.min(1,i/(ROOMS-1))); return 1+pickW(r,FL.RANK_W_START.map((w,j)=>lerp(w,FL.RANK_W_END[j],k))); }   // minimal rank hook
function mkFlyer(kind,rank,x,y,id){ const K=FL.KINDS[kind]; return {fly:true,id:id||null,kind,big:K.big,rank,hp:FL.RANK_HP[rank-1],x,y,hx:x,hy:y,d:1,st:'patrol',t:0,cd:1,dropT:FL.DROP_CD*.5,hitCd:0,aggro:false,ph:x*.37}; }
function spawnFlyers(i,seed){
  seed=seed===undefined?G.seed:seed;
  if(BOSS_ROOMS.includes(i)||i<FL.FIRST_ROOM) return [];   // never in boss rooms
  const r=mulberry(hash(seed+'|fly|'+i)), k=i/(ROOMS-1);
  if(r()>=lerp(FL.CHANCE_START,FL.CHANCE_END,k)) return [];
  const most=Math.max(1,Math.round(lerp(FL.COUNT_START,FL.COUNT_END,k))), n=1+Math.floor(r()*most), kinds=Object.keys(FL.KINDS), out=[];
  for(let j=0;j<n;j++){ const kind=kinds[pickW(r,kinds.map(q=>FL.KINDS[q].w))], rank=rollRank(r,i), x=40+r()*(W-80), y=lerp(FL.Y_MIN,FL.Y_MAX,r());
    out.push(mkFlyer(kind,rank,x,y,i+':'+j)); }
  return out.filter(f=>!(G.flyDead&&G.flyDead.has(seed+'#'+f.id)));
}
function flyerLetGo(f){ if(f.st==='ridden'||f.st==='pulled'){ f.st='rise'; f.cd=FL.DIVE_CD; } }   // the hook let go of it
function flyerGroundX(x){ const h=holeAt(G.world.rooms[G.room],x); return Math.max(8,Math.min(W-8,h?((x-h.x0<h.x1-x)?h.x0-6:h.x1+6):x)); }
function hitFlyer(f){
  f.hp--; f.hitCd=.3; G.flyHits=(G.flyHits||0)+1; const p=G.p, K=FL.KINDS[f.kind];
  if(p.hook&&p.hook.ref===f&&p.hook.ph!=='back') hookBack(p.hook);
  if(f.hp>0){ G.msg=K.name+' hit ('+f.hp+' more)'; G.msgT=.6; sfx(330,.06,'square'); return false; }
  f.st='dead'; if(f.id&&G.flyDead) G.flyDead.add(G.seed+'#'+f.id); G.flyKills=(G.flyKills||0)+1;
  const pts=addScore(FL.SCORE*f.rank); G.msg=K.name+' down! +'+pts; G.msgT=.9; sfx(180,.12,'sawtooth'); sfx(990,.06,'triangle');
  mobDied(flyerGroundX(f.x));   // drops nothing now (stamina refill item taken out)
  return true;
}
function flyersUpdate(room,rs,p,dt){
  if(!rs.flyers) return;
  const live=p.dead<=0, ride=!!(p.hook&&p.hook.ph==='ride');
  // ceiling cheese: up high (on a swing, or in the air above CHEESE_H) for CHEESE_T seconds = they come for him
  const high=live&&((p.hook&&p.hook.ph==='swing')||(!p.vine&&!ride&&!p.onGround&&p.y<GY-FL.CHEESE_H));
  rs.cheeseT=high?rs.cheeseT+dt:0;
  if(rs.cheeseT>=FL.CHEESE_T){ rs.cheeseT=0; G.flyAggro=(G.flyAggro||0)+1;
    const up=rs.flyers.filter(f=>f.st!=='dead');
    if(up.length){ up.forEach(f=>{ f.aggro=true; f.cd=Math.min(f.cd,0); }); G.msg='the flyers spotted you up there'; G.msgT=1; sfx(1200,.08,'sawtooth'); }
    else if(!BOSS_ROOMS.includes(G.room)&&rs.cheeseN<FL.CHEESE_SPAWN_MAX){ rs.cheeseN++;   // none here: call one in (never in a boss room)
      const kinds=Object.keys(FL.KINDS), kind=kinds[pickW(Math.random,kinds.map(q=>FL.KINDS[q].w))], f=mkFlyer(kind,rollRank(Math.random,G.room),p.x<W/2?W-10:10,FL.Y_MIN,null);
      f.aggro=true; f.cd=0; rs.flyers.push(f); G.msg='a '+FL.KINDS[kind].name+' comes for you'; G.msgT=1; sfx(1200,.08,'sawtooth'); }
  }
  for(const f of rs.flyers){ if(f.st==='dead') continue; const K=FL.KINDS[f.kind];
    if(f.hitCd>0) f.hitCd-=dt;
    if(f.st==='patrol'){
      f.cd-=dt; f.dropT-=dt; f.x+=f.d*K.speed*dt;
      if(f.x>f.hx+FL.PATROL_RANGE){ f.x=f.hx+FL.PATROL_RANGE; f.d=-1; } if(f.x<f.hx-FL.PATROL_RANGE){ f.x=f.hx-FL.PATROL_RANGE; f.d=1; }
      f.y=f.hy+Math.sin(G.t*2.2+f.ph)*4;
      const dx=p.x-f.x;
      if(live&&f.cd<=0&&(f.aggro||Math.abs(dx)<FL.AGGRO_X)){ f.st='tell'; f.t=FL.TELL_T; f.d=dx>=0?1:-1; sfx(1500,.05,'sawtooth'); }   // the tell
      else if(live&&f.dropT<=0&&Math.abs(dx)<FL.DROP_X&&p.y-24>f.y){ rs.fdrops.push({x:f.x,y:f.y+4,vy:0,kind:f.kind}); f.dropT=FL.DROP_CD; sfx(520,.05,'triangle'); }
    } else if(f.st==='tell'){ f.t-=dt; if(f.t<=0){ f.st='dive'; f.tx=p.x; f.ty=Math.min(GY-6,p.y-12); } }
    else if(f.st==='dive'){ const dx=f.tx-f.x, dy=f.ty-f.y, d=Math.hypot(dx,dy)||1, st=FL.DIVE_SPEED*dt;
      if(d<=st||f.y>=GY-4){ if(d<=st){ f.x=f.tx; f.y=f.ty; } f.st='rise'; f.cd=f.aggro?FL.AGGRO_CD:FL.DIVE_CD; } else { f.x+=dx/d*st; f.y+=dy/d*st; f.d=dx>=0?1:-1; } }
    else if(f.st==='rise'){ const dy=f.hy-f.y; if(Math.abs(dy)<=FL.RISE_SPEED*dt){ f.y=f.hy; f.st='patrol'; f.hx=Math.max(30,Math.min(W-30,f.x)); } else f.y+=Math.sign(dy)*FL.RISE_SPEED*dt; }
    else if(f.st==='stun'){ f.t-=dt; f.y=GY-5; if(f.t<=0){ f.st='rise'; f.cd=FL.DIVE_CD; } }
    if(!live||f.st==='ridden'||f.st==='pulled') continue;
    const ax=Math.abs(p.x-f.x);
    if(f.hitCd<=0){
      if(!p.onGround&&p.vy>0&&ax<9&&p.y>=f.y-5&&p.y<=f.y+8){ hitFlyer(f); p.vy=-200; sfx(440,.08); continue; }                    // jump on it
      if(p.kick>0&&!p.onGround&&!p.vine&&ax<12&&Math.abs((p.y-12)-f.y)<14){ hitFlyer(f); continue; }                             // vine-release kick
      if(f.st==='stun'&&p.onGround&&ax<11){ if(!hitFlyer(f)){ f.x=Math.max(6,Math.min(W-6,f.x+(f.x>=p.x?1:-1)*14)); f.t=Math.max(f.t,.8); } continue; }   // kick it while it is down
    }
    if(f.st==='dive'&&p.inv<=0&&ax<10&&Math.abs((p.y-12)-f.y)<14){ harm(K.name+' dive',f.x,FORCE.flyerDive); f.st='rise'; f.cd=f.aggro?FL.AGGRO_CD:FL.DIVE_CD; }
  }
  for(let i=rs.fdrops.length-1;i>=0;i--){ const d=rs.fdrops[i]; d.vy+=FL.DROP_GRAV*dt; d.y+=d.vy*dt;
    if(live&&p.inv<=0&&Math.abs(p.x-d.x)<7&&d.y>p.y-26&&d.y<p.y+2){ rs.fdrops.splice(i,1); harm(FL.KINDS[d.kind].drop,d.x,FORCE.flyerDrop); continue; }
    if(d.y>=GY) rs.fdrops.splice(i,1); }
}

/* ---------- grappling hook (numbers in TUNE.HOOK) ----------
   Aim: the game aims by facing (no mouse aim), so the hook goes out in front of him. First choice: a mob or loot inside the cone
   in front; then the far ledge of a pit ahead; then a wall ahead (the outer trunks, or a locked boss arena's sides); then the
   canopy branches overhead along an AIM_UP shot. Nothing in range = a miss (the hook flies out and he reels it back in, so a miss still costs the reel-in).
   Bosses are too heavy: the hook clinks off them. Phases: fly -> latch (wall / ledge) -> zip or swing; fly -> reel (loot);
   fly -> drag (mob); back = coming home. */
const hookRiding=p=>!!(p.hook&&(p.hook.ph==='zip'||p.hook.ph==='swing'||p.hook.ph==='ride'));
function hookClear(p){ const h=p.hook; if(h&&h.ref&&h.ref.fly) flyerLetGo(h.ref); if(h&&h.ref&&h.ref.drag){ h.ref.drag=false; h.ref.off=true; } p.hook=null; }
function hookAim(p,room,rs){
  const hx=p.x, hy=p.y-14, f=p.face, R=hookReach(), cone=HK.CONE*Math.PI/180;   // reach: plus a workshop hook spring
  const inCone=(x,y)=>{ const dx=(x-hx)*f, dy=y-hy, d=Math.hypot(dx,dy); return (dx>2&&d<=R&&Math.abs(Math.atan2(dy,dx))<=cone)?d:-1; };
  let best=null, bd=1e9; const take=(d,o)=>{ if(d>=0&&d<bd){ bd=d; best=o; } };
  rs.crawlers.forEach(c=>{ if(!c.dead) take(inCone(c.x,GY-4),{kind:'mob',ref:c,x:c.x,y:GY-4}); });   // a kicked crawler that is already dead is skipped
  if(rs.flyers) for(const fl of rs.flyers) if(fl.st!=='dead'&&fl.st!=='ridden'&&fl.st!=='pulled') take(inCone(fl.x,fl.y),{kind:'flyer',ref:fl,x:fl.x,y:fl.y});   // flyers (TUNE.FLYER.KINDS): small = pull it down, big = ride it
  const b=rs.boss; if(b&&!b.dead){ const by=b.kind==='boss2'?b.y:GY-20; take(inCone(b.x,by),{kind:'boss',ref:b,x:b.x,y:by}); }
  if(best) return best;
  const tr=room.treasure; if(tr&&!G.got.has(gid(room.i))) take(inCone(tr.x,tr.y),{kind:'loot',ref:tr,x:tr.x,y:tr.y});
  for(const g of G.burst) take(inCone(g.x,g.y),{kind:'loot',ref:g,x:g.x,y:g.y});
  if(best) return best;
  for(const h of room.holes){ const lx=f>0?h.x1:h.x0, dx=(lx-hx)*f, d=Math.hypot(lx-hx,GY-hy); if(dx>2&&d<=R) take(d,{kind:'ledge',x:lx,y:GY}); }
  if(best) return best;
  const lock=isLocked(), wx=f>0?((lock||G.room===ROOMS-1)?W:null):((lock||G.room===0)?0:null);
  if(wx!==null&&Math.abs(wx-hx)<=R) return {kind:'wall',x:wx,y:Math.max(HK.CEIL_Y+4,Math.min(GY-6,hy-10))};
  const a=HK.AIM_UP*Math.PI/180, up=hy-HK.CEIL_Y, dc=up/Math.sin(a);
  if(up>0&&dc<=R) return {kind:'ceil',x:hx+f*up/Math.tan(a),y:HK.CEIL_Y};
  return {kind:'miss',x:hx+f*Math.cos(a)*R,y:hy-Math.sin(a)*R};
}
function hookInput(down){
  keys.hook=!!down; const p=G.p;
  if(tugHook(down)) return;   // T mode tug only (not in the side-scroller run): the hook is the pull there
  if(!down){ if(p&&p.hook) p.hook.held=false; return; }
  if(p&&p.hook&&p.hook.ph==='ride'){ hookBack(p.hook); p.grabCd=.35; sfx(660,.07); return; }   // hook again while riding = let go
  if(p&&p.grab){ G.hookNo=(G.hookNo||0)+1; return; }   // held by a tentacle (new hazard): no hook
  if(G.state!=='play'||G.freeze||!p||p.dead>0||p.vine||p.hook||p.react>0){ G.hookNo=(G.hookNo||0)+1; return; }
  const a=hookAim(p,G.world.rooms[G.room],G.rs); G.hookShots=(G.hookShots||0)+1;
  p.hook={ph:'fly',kind:a.kind,ref:a.ref||null,tx:a.x,ty:a.y,hx:p.x,hy:p.y-14,held:true,ht:0,t:0,f:p.face,L:0}; sfx(820,.05,'triangle');
}
/* kick (right click / Ctrl). S / Down held = kick down. Uses the vine-release kick (p.kick + kickOn), so the same targets take it */
let fxKickLand=()=>{};   // the view hooks a dust puff in here
function kickInput(down){
  if(!down) return; const p=G.p, K=TUNE.KICK;
  if(p&&p.grab){ p.grab.kq=1; return; }   // held by a tentacle: a kick counts as a break-free press
  if(G.state!=='play'||G.freeze||!p||p.dead>0||p.vine||hookRiding(p)||p.react>0||p.kickCd>0){ G.kickNo=(G.kickNo||0)+1; return; }
  p.kick=K.T; p.kickIn=true; p.kickCd=K.CD; G.kicks=(G.kicks||0)+1;
  if(keys.down){ p.kickDown=true; if(p.onGround){ p.vy=-K.HOP_V*K.DOWN_HOP; p.onGround=false; p.coyote=0; } else p.vy=Math.max(p.vy,K.DOWN_V); p.vx*=.4; sfx(260,.08,'square'); }
  else { p.kickDown=false; if(p.onGround){ p.vy=-K.HOP_V; p.vx=p.face*K.LUNGE_V; p.onGround=false; p.coyote=0; } else p.vx+=p.face*K.LUNGE_V/3; sfx(380,.06,'square'); }
}
/* NOT USED (the hook is live's; nothing calls this). Was grapple down (S / Down + left click): straight down. A mob just below him is pulled as usual; air below him = zip to the floor;
   standing on the floor or over a pit = the hook clinks off and comes back */
function hookAimDown(p,room,rs){
  const hx=p.x, hy=p.y-14, R=HK.RANGE;
  for(const c of rs.crawlers) if(Math.abs(c.x-hx)<10&&GY-4>hy&&GY-4-hy<=R) return {kind:'mob',ref:c,x:c.x,y:GY-4};
  if(!holeAt(room,hx)&&GY-p.y>=TUNE.HOOK_DOWN.MIN_DROP&&GY-hy<=R) return {kind:'floor',x:hx,y:GY};
  return {kind:'miss',x:hx,y:Math.min(GY+40,hy+Math.min(R,60))};
}
function hookBack(h){ if(h.ref&&h.ref.fly) flyerLetGo(h.ref); h.ph='back'; h.held=false; h.d0=null; h.bt=0; sfx(1100,.03,'square'); }   // the reel-in starts: no new shot until the head is back in his hand
function hookMoveHead(h,x,y,sp,dt){ const dx=x-h.hx, dy=y-h.hy, d=Math.hypot(dx,dy), st=sp*dt; if(d<=st){ h.hx=x; h.hy=y; return true; } h.hx+=dx/d*st; h.hy+=dy/d*st; return false; }
function hookStep(p,room,dt){
  const h=p.hook; if(!h) return; h.t+=dt; if(h.held) h.ht+=dt; h.ox=h.hx; h.oy=h.hy;
  const hx=p.x, hy=p.y-14;
  if(h.ph==='fly'){
    if(h.kind==='mob'){ h.tx=h.ref.x; }
    if(h.kind==='loot'){ h.tx=h.ref.x; h.ty=h.ref.y; }
    if(h.kind==='flyer'){ if(h.ref.st==='dead'||h.ref.st==='ridden'){ hookBack(h); return; } h.tx=h.ref.x; h.ty=h.ref.y; }
    if(!hookMoveHead(h,h.tx,h.ty,HK.FLY_SPEED,dt)) return;
    if(h.kind==='miss'){ hookBack(h); }
    else if(h.kind==='boss'){ hookBack(h); G.msg='too heavy to pull'; G.msgT=.7; sfx(240,.06,'square'); }
    else if(h.kind==='loot'){ h.ph='reel'; sfx(900,.05,'triangle'); }
    else if(h.kind==='flyer'){ const f=h.ref; h.t=0;
      if(f.big){ h.ph='ride'; h.on=false; f.st='ridden'; p.vine=null; p.onGround=false; G.flyRides=(G.flyRides||0)+1; sfx(260,.1,'sawtooth'); }   // big: ride it
      else { h.ph='fpull'; f.st='pulled'; sfx(300,.08,'sawtooth'); } }                                                                          // small: pull it down
    else if(h.kind==='mob'){ h.ph='drag'; h.t=0; h.ref.drag=true; sfx(300,.08,'sawtooth'); }
    else { h.ph='latch'; sfx(520,.05,'square'); }
  }
  if(h.ph==='latch'){
    if(!h.held){   // tap: zip to the anchor (feet target)
      h.ph='zip'; h.t=0;
      if(h.kind==='ledge'){ h.zx=h.tx+h.f*6; h.zy=GY; } else if(h.kind==='wall'){ h.zx=h.tx-h.f*6; h.zy=Math.min(GY,h.ty+14); } else { h.zx=h.tx; h.zy=h.ty+20; }
    } else if(h.ht>=HK.TAP_TIME){   // hold: swing on the rope
      h.ph='swing'; h.L=Math.max(HK.ROPE_MIN,Math.min(HK.ROPE_MAX,Math.hypot(hx-h.tx,hy-h.ty)*HK.ROPE_REEL)); p.onGround=false;
    }
    return;
  }
  if(h.ph==='reel'){
    const g=h.ref, gone=g===room.treasure?G.got.has(gid(room.i)):!G.burst.includes(g);
    if(gone){ hookBack(h); return; }
    const home=hookMoveHead(h,hx,hy,HK.PULL_LOOT_SPEED,dt); g.x=h.hx; g.y=h.hy;
    if(home||Math.hypot(h.hx-hx,h.hy-hy)<8){ g.x=p.x; g.y=p.y-12; p.hook=null; G.hookBacks=(G.hookBacks||0)+1; sfx(1400,.04,'square'); }   // lands on him: the normal pickup takes it
    return;
  }
  if(h.ph==='drag'){
    const c=h.ref, dx=p.x-c.x;
    if(c.dead||Math.abs(dx)<=HK.MOB_STOP||h.t>HK.PULL_MOB_T){ c.drag=false; c.off=true; hookBack(h); return; }
    c.x+=Math.sign(dx)*Math.min(Math.abs(dx)-HK.MOB_STOP,HK.PULL_MOB_SPEED*dt); h.hx=c.x; h.hy=GY-4; return;
  }
  if(h.ph==='fpull'){   // a small flyer is pulled down in front of him, then lies stunned (kick it)
    const f=h.ref; if(f.st!=='pulled'){ hookBack(h); return; }
    const tx=Math.max(6,Math.min(W-6,p.x+h.f*FL.PULL_STOP)), ty=GY-5, dx=tx-f.x, dy=ty-f.y, d=Math.hypot(dx,dy), st=FL.PULL_SPEED*dt;
    if(d<=st||h.t>FL.PULL_T){ f.x=tx; f.y=ty; f.st='stun'; f.t=FL.STUN_T; G.flyPulls=(G.flyPulls||0)+1; sfx(200,.1,'square'); hookBack(h); return; }
    f.x+=dx/d*st; f.y+=dy/d*st; h.hx=f.x; h.hy=f.y; return;
  }
  if(h.ph==='ride'){ h.hx=h.ref.x; h.hy=h.ref.y; return; }
  if(h.ph==='back'){ if(h.d0==null) h.d0=Math.max(1,Math.hypot(h.hx-hx,h.hy-hy)); h.bt+=dt; if(hookMoveHead(h,hx,hy,HK.REEL_SPEED,dt)){ p.hook=null; G.hookBacks=(G.hookBacks||0)+1; sfx(1400,.04,'square'); } }   // clank: back in his hand
}
/* zip and swing move him (in place of running); returns false when he is not on the rope */
function hookRide(p,room,dt,ax){
  const h=p.hook; if(!hookRiding(p)) return false;
  if(jumpQ>0){ jumpQ=0; hookBack(h); p.grabCd=0.35; if(h.ph==='swing'||h.ph==='ride') p.vy-=70; sfx(660,.07); return true; }   // jump lets go too
  if(h.ph==='ride'){   // riding a big flyer: zip up under it, then it carries him (left / right steers); jump or hook again lets go; RIDE_T max
    const f=h.ref;
    if(f.st!=='ridden'||h.t>FL.RIDE_T){ if(f.st==='ridden'){ G.msg='the '+FL.KINDS[f.kind].name+' shook you off'; G.msgT=.8; } hookBack(h); p.grabCd=.35; return true; }
    if(!h.on){ const tx=f.x, ty=f.y+FL.RIDE_HANG, dx=tx-p.x, dy=ty-p.y, d=Math.hypot(dx,dy)||1, st=HK.ZIP_SPEED*dt;
      if(d<=st){ h.on=true; p.x=tx; p.y=ty; } else { p.x+=dx/d*st; p.y+=dy/d*st; } p.vx=0; p.vy=0; p.onGround=false; h.hx=f.x; h.hy=f.y; return true; }
    if(ax){ h.f=ax; p.face=ax; } f.d=h.f;
    f.x=Math.max(-2,Math.min(W+2,f.x+h.f*FL.RIDE_SPEED*dt)); f.y+=(FL.RIDE_Y-f.y)*Math.min(1,2*dt);
    p.x=f.x; p.y=f.y+FL.RIDE_HANG; p.vx=h.f*FL.RIDE_SPEED; p.vy=0; p.onGround=false; h.hx=f.x; h.hy=f.y; return true;
  }
  if(h.ph==='zip'){
    const dx=h.zx-p.x, dy=h.zy-p.y, d=Math.hypot(dx,dy)||1, st=HK.ZIP_SPEED*dt, ux=dx/d, uy=dy/d;
    if(d<=st||h.t>HK.ZIP_MAX_T){
      if(d<=st){ p.x=h.zx; p.y=h.zy; }
      p.vx=ux*HK.ZIP_EXIT; p.vy=uy*HK.ZIP_EXIT; hookBack(h); p.grabCd=0.3;
      if(h.kind==='ledge'&&!holeAt(room,p.x)){ p.y=GY; p.vy=0; p.vx=0; p.onGround=true; } else p.onGround=false;
      G.hookZips=(G.hookZips||0)+1;
    } else { p.x+=ux*st; p.y+=uy*st; p.vx=ux*HK.ZIP_SPEED; p.vy=uy*HK.ZIP_SPEED; p.onGround=false; }
    return true;
  }
  // swing: gravity + a little push, then the rope keeps his hand point within L of the anchor (it can pull, never push)
  if(!h.held){ hookBack(h); p.grabCd=0.35; return true; }   // let go: keeps his momentum
  p.vy+=GRAV*dt; if(ax){ p.vx+=ax*HK.SWING_PUMP*dt; p.face=ax; }
  p.x+=p.vx*dt; p.y+=p.vy*dt;
  const dx=p.x-h.tx, dy=(p.y-14)-h.ty, d=Math.hypot(dx,dy)||1;
  if(d>h.L){ const nx=dx/d, ny=dy/d, vr=p.vx*nx+p.vy*ny; p.x=h.tx+nx*h.L; p.y=h.ty+ny*h.L+14; if(vr>0){ p.vx-=vr*nx; p.vy-=vr*ny; } }
  const sp=Math.hypot(p.vx,p.vy); if(sp>HK.SWING_MAX){ p.vx*=HK.SWING_MAX/sp; p.vy*=HK.SWING_MAX/sp; }
  if(p.y>=GY&&!holeAt(room,p.x)){ p.y=GY; if(p.vy>0) p.vy=0; p.onGround=true; } else p.onGround=false;
  if(p.y>H+8){ loseLife('into the pit'); }
  return true;
}

/* ---------- buddy super move (numbers in TUNE.SUPER) ----------
   Q (or the phone super button) works when he is recharged (ready at the start of a run, then SUPER.RECHARGE s after each use);
   before that it does nothing but a small 'not ready' cue. It never touches the player's stamina.
   Buddy grows to SIZE x mudbot's height (a loud, colourful entrance) and fights on his own: he goes after the nearest mob, boss or log
   near the player, winds up and swings; every SLAM_EVERY-th swing is a ground slam that hits everything around him. The player keeps
   playing. While he is super he takes the hits meant for the player (no heart, no stamina lost; a pit still costs a heart), and the mobs
   and bosses he is up against hurt him too. All of that drains his own power-up meter; at 0 he shrinks back to normal (that is how a
   super ends; the meter, not a clock and not stamina). Then the RECHARGE wait starts.
   Bosses: each use can take at most BOSS_CAP_PCT of one boss's health, so he never erases a boss alone (balance). */
function supNew(){ return {on:false,cd:0,ph:'off',t:0,idleT:0,meter:0,bx:0,face:1,atkT:0,wind:0,swings:0,slam:false,tgt:null,uses:0,no:0,nrT:0,fx:[],st:null,log:[],capMsg:false}; }
const superFight=()=>!!(G.sup&&G.sup.on&&(G.sup.ph==='grow'||G.sup.ph==='fight'));   // (not in the cutscene: nothing can hit anyone then)
const superReady=p=>!!(p&&p.dead<=0&&G.sup&&!G.sup.on&&!(G.sup.cd>0));   // ready at the start of a run, then TUNE.SUPER.RECHARGE s after he shrinks back
const supX=x=>Math.max(10,Math.min(W-10,x));
const supFx=e=>{ const f=G.sup.fx; if(f.length<40) f.push(e); };   // events for the look (bounded: a headless run never draws)
function superInput(){
  const p=G.p, s=G.sup, SU=TUNE.SUPER; if(G.state!=='play'||!p||G.freeze) return false;
  if(!superReady(p)){ s.no++; s.nrT=.7; G.msg=s.on?'buddy is already super':'super not ready: '+Math.ceil(s.cd)+' s'; G.msgT=1; sfx(120,.14,'square'); return false; }
  Object.assign(s,{on:true,ph:'cut',t:0,idleT:0,meter:supMax(),bx:supX(p.x-p.face*SU.FOLLOW_GAP),face:p.face,atkT:0,wind:0,swings:0,tgt:null,capMsg:false});
  s.uses++; s.st={use:s.uses,room:G.room,dur:0,mobDmg:0,logDmg:0,bossPct:{},kills:0,logs:0,swings:0,slams:0,soaked:0,soakHits:0,bites:0,contact:0,logHits:0,counter:0};
  if(G.bud) G.bud.ride=false;   // he hops out of the dome for it
  G.freeze='cut'; G.cut={t:0,sp:1,clicks:0,n:0,tq:false}; G.msg=''; G.msgT=0; sfx(220,.25,'sawtooth'); return true;
}
/* super cutscene (replaces the old grow): the whole game freezes (timer, enemies, logs, the player). Buddy walks up to mudbot, climbs
   onto the chest hatch, opens it and rummages, throwing junk everywhere; drops down and the junk armour snaps onto him; drinks a strange
   glowing potion and grows huge. Just when it looks done: cookies. He dunks and eats COOKIES of them, closes the hatch, and play fades
   back in while the enemies ease back up to speed (REENTRY s). Clicking him speeds it up (SP_CLICK more per click, up to SP_MAX x).
   Then super runs as before (it starts in 'fight'). Times below are cutscene seconds at 1x (the beat each one ends on). */
const CUT={HOP:.6,WALK:1.7,OPEN:2.3,RUM:4.8,ARM:6.4,DRINK:7.9,BEAT:8.6,COOK:12.2,CLOSE:12.9,SP_MAX:6,SP_CLICK:1,REENTRY:1}, COOKIES=6;
const cutPhase=t=>t<CUT.WALK?'walk':t<CUT.OPEN?'open':t<CUT.RUM?'rummage':t<CUT.ARM?'armor':t<CUT.DRINK?'drink':t<CUT.BEAT?'beat':t<CUT.COOK?'cookies':'close';
function freezeStep(dt){
  if(G.msgT>0) G.msgT-=dt;
  if(G.freeze==='cut'){ const c=G.cut; c.t+=dt*c.sp; c.n=Math.max(0,Math.min(COOKIES,Math.floor((c.t-CUT.BEAT)/((CUT.COOK-CUT.BEAT)/COOKIES)+1e-9))); if(c.t>=CUT.CLOSE) cutEnd(); }
  else if(G.freeze==='t') tStep(dt);
}
function cutEnd(){
  const s=G.sup, c=G.cut, p=G.p; G.freeze=null; c.done=true; s.ph='fight'; s.t=0; s.atkT=0; s.bx=supX(p.x-p.face*TUNE.SUPER.FOLLOW_GAP);
  G.ease=CUT.REENTRY; jumpQ=0; supFx({k:'land',x:s.bx}); G.msg='BUDDY GOES SUPER!'; G.msgT=1.4; sfx(660,.3,'triangle');
  if(c.tq){ c.tq=false; if(typeof tInput==='function') tInput(); }
}
function cutClick(){ const c=G.cut; if(G.freeze!=='cut'||!c) return false; c.sp=Math.min(CUT.SP_MAX,c.sp+CUT.SP_CLICK); c.clicks++; sfx(500+c.sp*80,.05,'square'); return true; }
/* ---------- T mode: T pauses play any time (everything freezes, as in the super scene). Buddy opens mudbot's chest, climbs in and gets
   comfy. Enemies are frozen and harmless: drag one a short way (TM.DRAG_BODIES of its body lengths from where it stood when T went on) and it
   stays where you drop it, complaining. A mini game picked at random from 6 runs on a card: solo against buddy (he plays it himself) or
   2 players on one keyboard. P1: Z (action; Z X C = rock paper scissors). P2: , (action; , . / = rock paper scissors). 2: solo / 2 players.
   G: another game. T again: buddy climbs out, shuts the hatch and play fades back in (enemies ease back up to speed, as after the scene). */
const TM={WALK:.7,OPEN:1.0,IN:1.6,OUT:.55,CLOSE:.9,READY:1.3,DONE:2.2,DRAG_BODIES:1.5};
/* T mode reward: when player 1 (mudbot) wins a mini game his run gets a small treat. PLAYTEST DEFAULTS until set in playtest.
   One reward per room per run (playing again in the same room, or leaving and coming back, pays nothing more).
   A cookie patches a hand-block chip on the current heart. Never a whole new heart, and never stamina (stamina is the live game's).
   With no chip to patch, the room's treat is not used up. */
const TM_REWARD={PER_ROOM:1,CHIP_HEAL:.5};
function tReward(){ const p=G.p; if(!p) return ''; const paid=G.tmPaid||(G.tmPaid={}), n=paid[G.room]||0;
  if(n>=TM_REWARD.PER_ROOM) return 'treat already eaten in this room';
  if(p.chip>1e-9){ paid[G.room]=n+1; p.chip=Math.max(0,p.chip-TM_REWARD.CHIP_HEAL); G.tmGot=(G.tmGot||0)+1; return 'cookie! heart patched'; }
  return 'no chip to patch. no treat needed'; }
const MG_IDS=['tug','rps','thumb','stare','flick','potato'];
const MG_NAME={tug:'Tug of war',tugCard:'Tug of war',rps:'Rock paper scissors',thumb:'Thumb war',stare:'Staring contest',flick:'Mud flick',potato:'Hot potato'};
const MOB_GRAB=['hey! hands off!','rude.','put me down!','I was walking there','personal space!','is this a ride?','who froze me?!','not the shell!','unhand me, can man'];
const MOB_CAP=['nope. this is my limit','my leash ends here','any further and I file a complaint','ok, that is far enough'];
const MOB_DROP=['...fine. I live here now','I will remember this','this spot is worse','great. new commute','my mum will hear about this'];
function tInput(){
  const p=G.p; if(G.state!=='play'||!p) return false;
  if(G.freeze==='cut'){ G.cut.tq=!G.cut.tq; return 'queued'; }            // during the super scene: T mode starts right after it
  if(G.freeze==='t'){ const m=G.tm; if(!m.leave){ tDragEnd(); tugFinish(m.mg); m.leave=true; m.lt=0; sfx(330,.08,'triangle'); } return 'out'; }
  if(p.dead>0) return false;
  if(G.bud) G.bud.ride=false;
  G.freeze='t'; G.tm={t:0,leave:false,lt:0,mode:G.tmMode||'solo',score:[0,0],last:null,mg:null,drag:null,drags:0,say:{},x0:{},said:0,games:0,react:null,lastSay:''};
  G.msg=''; G.msgT=0; sfx(260,.1,'triangle'); return 'in';
}
function tStep(dt){
  const m=G.tm; m.t+=dt;
  for(const k in m.say){ m.say[k].t-=dt; if(m.say[k].t<=0) delete m.say[k]; }
  if(m.react) m.react.t+=dt;
  if(m.leave){ m.lt+=dt; if(m.lt>=TM.CLOSE) tEnd(); return; }
  if(m.t<TM.IN) return;
  if(!m.mg) mgNew();
  mgStep(m.mg,dt);
}
function tEnd(){ const m=G.tm, p=G.p; tDragEnd(); tugFinish(m.mg); G.freeze=null; m.done=true; G.ease=CUT.REENTRY; jumpQ=0;
  if(G.rs&&G.rs.crawlers.some(c=>!c.dead&&Math.abs(c.x-p.x)<16)) p.inv=Math.max(p.inv,1);   // a mob dropped on top of him does not bite straight away
  sfx(520,.1,'triangle'); }
function tKey(code){ const m=G.tm, a=TKEYS[code]; if(G.freeze!=='t'||!m||m.leave||!a) return false;
  if(a==='mode'){ m.mode=G.tmMode=m.mode==='solo'?'2p':'solo'; m.score=[0,0]; if(m.mg) mgNew(m.mg.id); sfx(600,.06,'square'); return true; }
  if(a==='game'){ if(!m.mg) return false; mgNew(); sfx(600,.06,'square'); return true; }
  return mgKey(a[0],a[1]); }
function tKeyUp(code){ const m=G.tm, a=TKEYS[code]; if(G.freeze!=='t'||!m||!m.mg||!Array.isArray(a)) return false; if(a[0]===2&&!mg2()) return false; const D=MG[m.mg.id]; if(D.up) D.up(m.mg,a[0],a[1]); return true; }   // only the tug uses key up (hold to pull)
const TKEYS={KeyZ:[1,0],KeyX:[1,1],KeyC:[1,2],Comma:[2,0],Period:[2,1],Slash:[2,2],Digit2:'mode',KeyG:'game'};
// ---- mini games (logic). Each: init, key(g, player 1|2, act 0..2), step, ai (buddy as player 2 when solo). g.win: 1 / 2 / 3 = draw
const mg2=()=>G.tm.mode==='2p';
function mgNew(id){ const m=G.tm; tugFinish(m.mg); if(!id){ const pool=MG_IDS.filter(g=>g!==m.last); id=pool[Math.floor(Math.random()*pool.length)]; }
  m.last=id; m.games++; const g={id,ph:'ready',t:0,win:0,ai:rnd(.3,.6)}; MG[id].init(g); m.mg=g; m.react=null; return g; }
function mgKey(pn,a){ const m=G.tm; if(G.freeze!=='t'||!m||m.leave||!m.mg) return false; if(pn===2&&!mg2()) return false; const g=m.mg; if(g.ph!=='go'||g.win) return false; MG[g.id].key(g,pn,a); return true; }
function mgStep(g,dt){ g.t+=dt;
  if(g.ph==='ready'){ if(g.t>=TM.READY){ g.ph='go'; g.t=0; sfx(700,.08,'square'); } return; }
  if(g.ph==='go'){ const D=MG[g.id]; if(!g.win) D.step(g,dt); if(!mg2()&&!g.win) D.ai(g,dt); if(g.win) mgDone(g); return; }
  if(g.ph==='done'&&g.t>=TM.DONE) mgNew(); }
const BUD_WIN=['too easy.','buddy 1, you 0','I practise in here','gg. no re.','was that your best?'], BUD_LOSE=['rigged!','best of 37?','my thumb slipped','I let you win. obviously.','again. now.'];
function mgDone(g){ const m=G.tm; g.ph='done'; g.t=0; if(g.phys&&G.p) hookClear(G.p); if(g.win<3) m.score[g.win-1]++; sfx(g.win===1?880:g.win===2?300:500,.18,'triangle');
  const L=mg2()?[g.win===1?'P1 takes it!':g.win===2?'P2 takes it!':'tie! again!']:g.win===2?BUD_WIN:g.win===1?BUD_LOSE:['tie. suspicious.'];
  m.react={win:g.win,t:0,line:L[Math.floor(Math.random()*L.length)],rw:g.win===1?tReward():''}; }   // the tug (g.phys): the rope comes loose at the end, both stay put until the next game
const tri=u=>1-Math.abs((u%2+2)%2-1);
/* TUG-LOGIC-BEGIN */
/* ---------- physical tug of war (T mode; numbers in TUNE.TUG) ----------
   When the card picks tug of war, buddy hops out of the chest and stands GAP px away (toward the nearest ledge first, else the far side of
   the room). Fire the hook at him (hold Z / left click / the hook button): it bites his belt and the rope goes taut. Then both robots
   really slide on this room's ground line: a one-way spring rope (pulls, never pushes) against each robot's grip on what is under his feet.
   Hold to reel in, hold the key away from buddy to dig in (more grip, slower reel), jump = yank. Pull him over the line or off a ledge.
   Super buddy, the 'card' setting, or no room for the start gap: the old knot tug on the card (MG.tugCard).
   Only mudbot, buddy and the rope move: the rest of the frozen world stays put. No heart, no run stamina, no run time is used; both go back
   to where they started after the round. */
const TG = TUNE.TUG, TUG_MODE_KEY = 'mudpity-tug-mode';   // hold-and-lean or mash, stored on this device only
const TUG_MODES=['hold','mash','card'];   // hold = hold to pull + dig in; mash = each tap one pull kick (no dig in); card = the old knot tug on the card
let tugMode = TG.MODE_DEFAULT; try{ const m=localStorage.getItem(TUG_MODE_KEY); if(TUG_MODES.includes(m)) tugMode=m; }catch(e){}
function setTugMode(m){ tugMode=TUG_MODES.includes(m)?m:TG.MODE_DEFAULT; try{ localStorage.setItem(TUG_MODE_KEY,tugMode); }catch(e){} return tugMode; }
const TUG_MU={dirt:'MU_DIRT',rim:'MU_RIM',water:'MU_WATER',mire:'MU_MIRE',rock:'MU_ROCK'};
function tugSurf(room,x){   // what is under a robot's feet, read from the room logic (no art lookup)
  if(holeAt(room,x)) return 'hole';
  for(const pl of room.pools){ if(Math.abs(x-pl.x0)<=TG.RIM||Math.abs(x-pl.x1)<=TG.RIM) return 'rim'; if(x>pl.x0&&x<pl.x1) return 'water'; }
  if(room.kind==='boss1'){ if(Math.abs(x-TG.MIRE_X0)<=TG.ROCK||Math.abs(x-TG.MIRE_X1)<=TG.ROCK) return 'rock'; if(x>TG.MIRE_X0&&x<TG.MIRE_X1) return 'mire'; }
  return 'dirt';
}
function tugPlace(p,room){   // buddy's spot: GAP px away; a ledge within reach puts him on its far lip (the rope spans the pit). null = no room
  const ok=x=>x>=10&&x<=W-10&&!holeAt(room,x)&&Math.abs(x-p.x)>=TG.GAP-1e-6&&Math.abs(x-p.x)<=TG.GAP*TG.GAP_MAX;
  let near=null, nd=1e9; for(const h of room.holes) for(const e of [h.x0,h.x1]){ const d=Math.abs(e-p.x); if(d<nd){ nd=d; near=e; } }
  const dirs=[]; if(near!==null&&nd<=TG.GAP*TG.GAP_MAX) dirs.push(near>p.x?1:-1);
  const far=p.x<W/2?1:-1; if(!dirs.includes(far)) dirs.push(far); if(!dirs.includes(-far)) dirs.push(-far);
  for(const d of dirs){
    const hs=room.holes.filter(h=>d>0?h.x0>p.x:h.x1<p.x).sort((a,b)=>d>0?a.x0-b.x0:b.x1-a.x1), h=hs[0];
    if(h&&Math.abs((d>0?h.x0:h.x1)-p.x)<=TG.GAP){ let bx=(d>0?h.x1:h.x0)+d*TG.PAD; if(Math.abs(bx-p.x)<TG.GAP) bx=p.x+d*TG.GAP; if(ok(bx)) return bx; }
    let bx=p.x+d*TG.GAP; const hh=holeAt(room,bx); if(hh) bx=(d>0?hh.x1:hh.x0)+d*TG.PAD; if(ok(bx)) return bx;
  }
  return null;
}
function tugBody(x,m){ return {x,x0:x,y:GY,vx:0,vy:0,m,ground:true,stam:100,off:false,surf:'dirt',slide:false,st:'rest',yankCd:0,yankT:-9,kickT:-9,kicks:0}; }
const tugOn=()=>{ const m=G.tm, g=m&&m.mg; return !!(G.freeze==='t'&&m&&!m.leave&&g&&g.phys&&!g.fin); };
function tugInit(g){
  const p=G.p, room=G.world.rooms[G.room];
  const bx=tugMode!=='card'&&(!G.sup||!G.sup.on)&&p&&p.onGround&&!p.vine&&!hookRiding(p)&&p.dead<=0&&!holeAt(room,p.x)?tugPlace(p,room):null;
  if(bx===null){ g.id='tugCard'; g.why=tugMode==='card'?'setting':G.sup&&G.sup.on?'super':'room'; MG.tugCard.init(g); return; }
  hookClear(p);
  Object.assign(g,{s:0,maxS:0,phys:true,lim:TG.LIM,mode:tugMode,a:tugBody(p.x,1),b:tugBody(bx,TG.BUD_M),dir:bx>p.x?1:-1,line:p.x+(bx-p.x)*TG.LINE,
    p0:{x:p.x,y:p.y,face:p.face},room:G.room,hooked:false,L0:0,T:0,sPrev:0,pop:0,why:'',zk:false,ck:false,sk:false,edge:[0,0],yq:[false,false],
    aist:{st:'brace',t:TG.AI_REST},aiOff:false,bigT:-9,fin:false,maxT:0,log:{yanks:[0,0],kicks:[0,0]}});
  p.face=g.dir; p.vx=0; p.vy=0;
}
function tugFinish(g){   // the round is over (or T / G mid-round): both robots back where they started, the rope gone
  if(!g||!g.phys||g.fin) return; g.fin=true; const p=G.p; if(!p) return;
  p.x=g.p0.x; p.y=g.p0.y; p.vx=0; p.vy=0; p.onGround=true; p.face=g.p0.face; hookClear(p);
}
function tugHook(down){ if(!tugOn()) return false; const g=G.tm.mg; if(down&&g.ph==='go'&&!g.win) g.edge[0]++; return true; }   // hook button / left click during the tug
function tugKey(g,pn,a,down){   // Z / , = pull (hold; mash: tap), . = P2 yank, / = P2 dig in (P1 digs in with the move key away from buddy, yanks with jump)
  if(a===0){ if(pn===1) g.zk=down; else g.ck=down; if(down) g.edge[pn-1]++; }
  else if(a===1){ if(pn===2&&down) g.yq[1]=true; }
  else if(a===2){ if(pn===2) g.sk=down; }
}
function tugAI(g,dt){   // buddy (solo): pulls in bursts, braces between them, rests when he is low; digs in on good grip or when he starts to slide
  if(g.aiOff){ g.ck=false; g.sk=false; return; }
  const B=g.b, A=g.a, ai=g.aist; if(!g.hooked){ g.ck=false; g.sk=false; return; }
  ai.t-=dt;
  const burst=()=>{ ai.st='pull'; ai.t=TG.AI_BURST; ai.lean=Math.random()<TG.AI_LEAN; if(A.st==='rest'&&Math.random()<TG.AI_YANK) g.yq[1]=true; };
  if(ai.st==='rest'){ if(B.stam>=TG.AI_BACK) burst(); }
  else if(B.stam<=TG.AI_LOW){ ai.st='rest'; }
  else if(ai.t<=0){ if(ai.st==='pull'){ ai.st='brace'; ai.t=TG.AI_REST; } else burst(); }
  ai.sl=B.slide?(ai.sl||0)+dt:0; if(!B.slide) ai.react=rnd(TG.AI_REACT[0],TG.AI_REACT[1]);   // he notices he is slipping only after a moment
  const good=(TG[TUG_MU[B.surf]]||0)>=TG.MU_RIM;
  g.ck=ai.st==='pull'; g.sk=ai.st!=='rest'&&(good||(ai.st==='pull'&&ai.lean)||ai.sl>ai.react);
}
function tugBodyStep(Bd,toward,T,stance,room,dt){
  Bd.surf=tugSurf(room,Bd.x);
  if(!Bd.ground||Bd.surf==='hole'){   // no ground under him: he falls (the rope goes slack, it does not save him)
    Bd.ground=false; Bd.slide=false; Bd.vy+=TG.G*dt; Bd.y+=Bd.vy*dt; Bd.x+=Bd.vx*dt*.5; if(Bd.y>GY+TG.FALL) Bd.off=true; return; }
  const mu=TG[TUG_MU[Bd.surf]], grip=mu*Bd.m*TG.G*stance, kin=TG.SLIDE_K*grip, F=T*toward;
  if(Math.abs(Bd.vx)<1e-6&&Math.abs(F)<=grip){ Bd.vx=0; Bd.slide=false; return; }   // feet hold
  Bd.slide=true; const v0=Bd.vx, sg=Math.sign(v0||F);
  Bd.vx+=(F-sg*kin)/Bd.m*dt;
  if(Bd.surf==='mire') Bd.vx*=Math.exp(-TG.MIRE_DRAG*dt);
  if(Math.sign(Bd.vx)!==sg&&Math.abs(F)<=grip){ Bd.vx=0; Bd.slide=false; }
  Bd.x=Math.max(2,Math.min(W-2,Bd.x+Bd.vx*dt));
}
function tugStep(g,dt){
  const p=G.p, room=G.world.rooms[G.room], A=g.a, B=g.b, H=p.hook;
  const bodies=[A,B], dirs=[g.dir,-g.dir];
  const yank1=jumpQ>0; if(yank1) jumpQ=0;
  const held=[keys.hook||g.zk,g.ck], away=g.dir>0?keys.left:keys.right, lean=[g.mode==='hold'&&away,g.sk], yank=[yank1,g.yq[1]]; g.yq[1]=false;
  for(const Bd of bodies){ if(Bd.yankCd>0) Bd.yankCd-=dt; }
  if(!g.hooked){   // fire the hook at buddy: it flies to his belt and bites
    if(!H&&(held[0]||g.edge[0]>0)){ p.hook={ph:'fly',kind:'tug',ref:null,tx:B.x,ty:B.y-8,hx:A.x,hy:A.y-14,held:true,ht:0,t:0,f:g.dir,L:0}; sfx(820,.05,'triangle'); }
    g.edge=[0,0];
    const h=p.hook; if(h&&h.ph==='fly'){ h.ox=h.hx; h.oy=h.hy; h.t+=dt; if(hookMoveHead(h,B.x,B.y-8,HK.FLY_SPEED,dt)){ h.ph='tug'; g.hooked=true; g.L0=Math.abs(B.x-A.x); g.snapD=g.L0+TG.SNAP_D-TG.GAP; g.sPrev=0; sfx(520,.06,'square'); } }
    if(g.t>=g.lim&&!g.hooked){ g.win=3; g.why='time'; }   // never hooked: time up, nobody moved = a draw
    return; }
  // stance + stamina + reel
  let reel=0; const now=g.t;
  for(let i=0;i<2;i++){ const Bd=bodies[i];
    if(g.mode==='mash'&&i===0||g.mode==='mash'&&i===1&&mg2()){   // mash: each tap reels one kick (same stamina per px as holding)
      const kc=TG.MASH_KICK/TG.REEL*TG.STAM_PULL; let n=g.edge[i];
      while(n-->0&&Bd.stam>=kc&&!Bd.off){ g.L0-=TG.MASH_KICK; Bd.stam-=kc; Bd.kickT=now; g.log.kicks[i]++; }
      Bd.st=now-Bd.kickT<.35?'pull':'rest'; if(Bd.st==='rest'&&!held[i]) Bd.stam=Math.min(100,Bd.stam+TG.STAM_REST*dt);
    } else {
      const can=Bd.stam>0&&Bd.ground;
      Bd.st=can&&lean[i]?'lean':can&&held[i]?'pull':'rest';
      if(can&&held[i]) reel+=TG.REEL*(lean[i]?TG.LEAN_REEL:1);
      if(Bd.st==='lean') Bd.stam-=TG.STAM_PULL*TG.STAM_LEAN*dt; else if(Bd.st==='pull') Bd.stam-=TG.STAM_PULL*dt; else if(!held[i]&&!lean[i]) Bd.stam+=TG.STAM_REST*dt;
      Bd.stam=Math.max(0,Math.min(100,Bd.stam));
    }
    if(yank[i]&&Bd.yankCd<=0&&Bd.stam>=TG.YANK_COST&&Bd.ground){ Bd.vx-=dirs[i]*TG.YANK/Bd.m; Bd.stam-=TG.YANK_COST; Bd.yankCd=TG.YANK_CD; const o=bodies[1-i]; if(now-o.yankT<=TG.POP_WIN||(o.st!=='rest'&&g.T>=TG.POP_T)) g.bigT=now; Bd.yankT=now; g.log.yanks[i]++; sfx(300,.08,'sawtooth'); }
  }
  g.edge=[0,0];
  const d=Math.abs(B.x-A.x);   // reel in, but not past the tension cap (at the cap the rope just slips through the hands)
  g.L0=Math.max(TG.L_MIN,Math.min(g.L0,Math.max(g.L0-reel*dt,d-TG.T_MAX/TG.K)));
  // rope: a one-way spring (pulls, never pushes), capped; slack while either robot is falling
  const s=d-g.L0, sd=(s-g.sPrev)/dt; g.sPrev=s; g.s=s;
  const T=(A.ground&&B.ground&&s>0)?Math.max(0,Math.min(TG.T_MAX,TG.K*s+TG.C*sd)):0; g.T=T; g.raw=(A.ground&&B.ground&&s>0)?TG.K*s+TG.C*sd:0; g.maxT=Math.max(g.maxT,T); g.maxS=Math.max(g.maxS,s); g.maxRaw=Math.max(g.maxRaw||0,g.raw);
  const sf=st=>st==='lean'?TG.LEAN_GRIP:st==='pull'?1:TG.REST_GRIP;
  tugBodyStep(A,dirs[0],T,sf(A.st),room,dt); tugBodyStep(B,dirs[1],T,sf(B.st),room,dt);
  p.x=A.x; p.y=A.y; p.vx=0; p.vy=0; p.onGround=A.ground; p.face=g.dir;
  const fall=!A.ground||!B.ground; if(fall) g.T=0;   // the step he goes over the lip the rope already goes slack (T was worked out before the step)
  const h=p.hook; if(h){ h.ox=h.hx; h.oy=h.hy; h.hx=B.x; h.hy=B.y-8; h.ph='tug'; h.slack=fall; }
  // the rope pops loose when it is stretched SNAP_D-GAP px past this round's start length (a big yank on bad ground), or a big yank (into a robot pulling hard, or two yanks at about the same time) stretches it POP_S px: whoever was pulling hardest falls on his back = round to the other one
  if(TG.POP&&A.ground&&B.ground&&(Math.abs(B.x-A.x)>g.snapD||now-g.bigT<=TG.POP_WIN&&s>TG.POP_S)){
    const eff=Bd=>(now-Bd.yankT<.5?2:0)+(Bd.st!=='rest'?1:0), ea=eff(A), eb=eff(B);
    g.pop=ea>eb?1:eb>ea?2:3; g.win=g.pop===3?3:3-g.pop; g.why='pop'; sfx(200,.2,'sawtooth'); return; }
  // off a ledge
  if(A.off||B.off){ g.win=A.off&&B.off?3:A.off?2:1; g.why='ledge'; return; }
  if(!A.ground||!B.ground) return;   // falling: wait to see him go
  // over the line
  const ac=(A.x-g.line)*g.dir, bc=(g.line-B.x)*g.dir;
  if(ac>0||bc>0){ g.win=ac>0&&bc>0?(Math.abs(ac-bc)<1e-6?3:ac>bc?2:1):ac>0?2:1; g.why='line'; return; }
  // time up: whoever was pulled less wins; a tiny gap is a draw
  if(g.t>=g.lim){ const pa=(A.x-A.x0)*g.dir, pb=(B.x0-B.x)*g.dir; g.win=Math.abs(pa-pb)<TG.DRAW_PX?3:pa>pb?2:1; g.why='time'; }
}
/* TUG-LOGIC-END */
const MG={
  tug:{ init(g){ tugInit(g); }, key(g,pn,a){ tugKey(g,pn,a,true); }, up(g,pn,a){ tugKey(g,pn,a,false); }, step(g,dt){ tugStep(g,dt); }, ai(g,dt){ tugAI(g,dt); } },   // the physical tug (above)
  tugCard:{ init(g){ g.r=0; g.lim=12; },   // the old knot tug, fallback only: mash, the knot moves your way; past your flag = win (time up: whoever is ahead)
    key(g,pn,a){ if(a) return; g.r+=pn===1?-.065:.065; if(Math.abs(g.r)>=1) g.win=g.r<0?1:2; },
    step(g){ if(g.t>=g.lim) g.win=Math.abs(g.r)<.08?3:g.r<0?1:2; },
    ai(g,dt){ g.ai-=dt; if(g.ai<=0){ g.ai=rnd(.11,.2); MG.tugCard.key(g,2,0); } } },
  rps:{ init(g){ g.pick=[-1,-1]; g.w=[0,0]; g.rev=0; g.res=0; g.shown=[-1,-1]; g.ai=rnd(.5,1.4); },   // rock paper scissors, first to 2
    key(g,pn,a){ if(g.rev>0||g.pick[pn-1]>=0) return; g.pick[pn-1]=a; sfx(500,.04,'square'); },
    step(g,dt){ if(g.rev>0){ g.rev-=dt; if(g.rev<=0){ if(g.w[0]>=2) g.win=1; else if(g.w[1]>=2) g.win=2; else { g.pick=[-1,-1]; g.ai=rnd(.5,1.4); } } return; }
      if(g.pick[0]>=0&&g.pick[1]>=0){ const d=(g.pick[0]-g.pick[1]+3)%3; g.res=d===0?3:d; if(d) g.w[d-1]++; g.rev=1.1; g.shown=g.pick.slice(); }
      else if(g.t>30) g.win=3; },
    ai(g,dt){ if(g.pick[1]<0&&g.rev<=0){ g.ai-=dt; if(g.ai<=0) g.pick[1]=Math.floor(Math.random()*3); } } },
  thumb:{ init(g){ g.a=Math.random()*6; g.w=0; g.pins=[0,0]; g.stun=[0,0]; g.aiT=0; g.flash=0; g.fp=0; g.lim=25; },   // press when your thumb is on top: 3 pins wins; a miss stuns you
    key(g,pn,a){ if(a||g.stun[pn-1]>0) return; const ok=pn===1?g.w>.55:g.w<-.55;
      if(ok){ g.pins[pn-1]++; g.flash=.4; g.fp=pn; g.a+=Math.PI*.7; sfx(760,.05,'square'); if(g.pins[pn-1]>=3) g.win=pn; } else { g.stun[pn-1]=.7; sfx(140,.06,'square'); } },
    step(g,dt){ g.a+=dt*(2.2+1.4*Math.sin(g.t*.7)); g.w=Math.sin(g.a); g.stun[0]=Math.max(0,g.stun[0]-dt); g.stun[1]=Math.max(0,g.stun[1]-dt); g.flash=Math.max(0,g.flash-dt);
      if(g.t>=g.lim) g.win=g.pins[0]>g.pins[1]?1:g.pins[1]>g.pins[0]?2:3; },
    ai(g,dt){ if(g.w<-.55&&g.stun[1]<=0){ if(g.aiT<=0) g.aiT=rnd(.2,1.1); else { g.aiT-=dt; if(g.aiT<=0) MG.thumb.key(g,2,0); } } else g.aiT=0; } },
  stare:{ init(g){ g.dry=[0,0]; g.rate=[rnd(.13,.18),rnd(.13,.18)]; g.last=[-9,-9]; g.fly=rnd(3,6); g.flyOn=0; g.aiAt=rnd(.55,.85); g.blink=0; g.lim=40; },   // eyes dry out faster and faster; Z squints them wet; two squints too fast = a blink (40 s: draw)
    blinkBy(g,pn){ g.blink=pn; g.win=3-pn; sfx(200,.12,'triangle'); },
    key(g,pn,a){ if(a) return; const i=pn-1; if(g.t-g.last[i]<.4){ MG.stare.blinkBy(g,pn); return; } g.last[i]=g.t; g.dry[i]=Math.max(0,g.dry[i]-.4); },
    step(g,dt){ g.fly-=dt; if(g.fly<=0){ g.flyOn=1.2; g.fly=rnd(3,6); } g.flyOn=Math.max(0,g.flyOn-dt);
      for(let i=0;i<2&&!g.win;i++){ g.dry[i]+=g.rate[i]*dt*(1+g.t/8)*(g.flyOn>0?2.2:1); if(g.dry[i]>=1) MG.stare.blinkBy(g,i+1); } if(!g.win&&g.t>=g.lim) g.win=3; },
    ai(g){ if(g.dry[1]>=g.aiAt&&g.t-g.last[1]>=.45){ MG.stare.key(g,2,0); g.aiAt=rnd(.55,.9)+(Math.random()<.12?.2:0); } } },
  flick:{ init(g){ g.pw=[0,0]; g.sp=[rnd(.9,1.3),rnd(.9,1.3)]; g.cup=[rnd(.45,.85),rnd(.45,.85)]; g.n=[0,0]; g.hit=[0,0]; g.shot=[null,null]; g.N=3; g.aiE=rnd(-.12,.12); g.lim=30; },   // 3 flicks each: stop the power bar on the cup
    key(g,pn,a){ if(a) return; const i=pn-1; if(g.n[i]>=g.N||g.shot[i]) return; const h=Math.abs(g.pw[i]-g.cup[i])<.07; g.n[i]++; if(h) g.hit[i]++; g.shot[i]={pw:g.pw[i],t:0,hit:h,cup:g.cup[i]}; sfx(h?880:220,.06,'square'); },
    step(g,dt){ for(let i=0;i<2;i++){ if(g.shot[i]){ g.shot[i].t+=dt; if(g.shot[i].t>=.6){ g.shot[i]=null; g.cup[i]=rnd(.45,.85); } } else if(g.n[i]<g.N) g.pw[i]=tri(g.t*g.sp[i]+i*.37); }
      if((g.n[0]>=g.N&&g.n[1]>=g.N&&!g.shot[0]&&!g.shot[1])||g.t>=g.lim) g.win=g.hit[0]>g.hit[1]?1:g.hit[1]>g.hit[0]?2:3; },
    ai(g){ if(g.n[1]<g.N&&!g.shot[1]&&Math.abs(g.pw[1]-(g.cup[1]+g.aiE))<.03){ MG.flick.key(g,2,0); g.aiE=rnd(-.12,.12); } } },
  potato:{ init(g){ g.hold=Math.random()<.5?1:2; g.fuse=rnd(4,8); g.fly=0; g.cd=0; g.ai=rnd(.25,.8); g.passes=0; g.boom=0; },   // a frozen mob with a fuse: throw it back before it pops
    key(g,pn,a){ if(a||g.hold!==pn||g.fly>0||g.cd>0) return; g.fly=.35; g.passes++; sfx(420,.04,'triangle'); },
    step(g,dt){ g.fuse-=dt; if(g.fly>0){ g.fly-=dt; if(g.fly<=0){ g.fly=0; g.hold=3-g.hold; g.cd=.2; g.ai=rnd(.25,.8); } } else if(g.cd>0) g.cd-=dt;
      if(g.fuse<=0){ const loser=g.fly>0?3-g.hold:g.hold; g.boom=loser; g.win=3-loser; addShake(.2); } },
    ai(g,dt){ if(g.hold===2&&g.fly<=0&&g.cd<=0){ g.ai-=dt; if(g.ai<=0) MG.potato.key(g,2,0); } } },
};
// ---- dragging frozen enemies (px). Capped at TM.DRAG_BODIES body lengths from where each one stood when T went on; never over a hole.
function tSay(k,kind){ const m=G.tm, L=kind==='cap'?MOB_CAP:kind==='drop'?MOB_DROP:MOB_GRAB; let i=Math.floor(Math.random()*L.length); if(L[i]===m.lastSay) i=(i+1)%L.length;
  m.lastSay=L[i]; m.say[k]={text:L[i],t:2.4,kind}; m.said++; }
function tDragStart(k){ const m=G.tm, s=G.rs&&G.rs.crawlers[k]; if(G.freeze!=='t'||!m||m.leave||!s||s.dead) return false; tDragEnd();
  if(m.x0[k]===undefined) m.x0[k]=s.x; m.drag={k,x0:s.x,capSaid:false,cap:false}; m.drags++; tSay(k,'grab'); sfx(250,.05,'square'); return true; }
function tDragTo(px){ const m=G.tm; if(!m||!m.drag) return false; const d=m.drag, s=G.rs.crawlers[d.k], o=m.x0[d.k], cap=TM.DRAG_BODIES*crawlLen(), room=G.world.rooms[G.room];
  let nx=Math.max(o-cap,Math.min(o+cap,px)); d.cap=nx!==px; nx=Math.max(6,Math.min(W-6,nx));
  if(holeAt(room,nx)) return false;
  if(Math.abs(nx-s.x)>.01) s.d=nx>s.x?1:-1; s.x=nx; if(d.cap&&!d.capSaid){ d.capSaid=true; tSay(d.k,'cap'); } return true; }
function tDragEnd(){ const m=G.tm; if(!m||!m.drag) return false; const d=m.drag, s=G.rs.crawlers[d.k]; s.bo=(s.bo||0)+(s.x-d.x0); s.off=false; m.drag=null;
  if(Math.abs(s.x-d.x0)>1&&!(m.say[d.k]&&m.say[d.k].kind==='cap')) tSay(d.k,'drop'); return true; }
function supDrain(n,why){ const s=G.sup; if(!superFight()||n<=0) return; if(why!=='idle') s.idleT=0; s.meter=Math.max(0,s.meter-n); s.st[why]=(s.st[why]||0)+n; if(s.meter<=1e-9) superEnd(); }
function superSoak(why,f){ const s=G.sup, p=G.p; p.binv=TUNE.SUPER.SOAK_INV; s.st.soakHits++; G.msg='buddy took it: '+why; G.msgT=.7; sfx(180,.08,'triangle'); supFx({k:'soak'}); supDrain(Math.min(TUNE.SUPER.SOAK_MAX,f*TUNE.SUPER.SOAK_PER_FORCE),'soaked'); }
function superEnd(){ const s=G.sup; if(!s.on||s.ph==='shrink') return; s.ph='shrink'; s.t=0; s.meter=0; s.wind=0; s.log.push(s.st); s.cd=TUNE.SUPER.RECHARGE;
  G.msg='buddy is worn out'; G.msgT=1.2; sfx(400,.35,'triangle'); supFx({k:'shrink'}); }
const supBossUp=b=>!!(b&&!b.dead&&b.state!=='intro'&&b.state!=='dying');
const supBossY=b=>b.kind==='boss2'?GY-b.y:b.kind==='boss1'?b.h:30;   // px above the ground of the part he can hit
const supBossHittable=b=>supBossUp(b)&&(b.kind==='boss1'?b.h>=8:supBossY(b)<=TUNE.SUPER.REACH_UP);
function supTarget(rs){   // the nearest mob, boss or log near the player (logs a little less urgent than things that bite)
  const s=G.sup, p=G.p, SU=TUNE.SUPER; let best=null, bd=1e9;
  const take=o=>{ if(o.k!=='boss'&&Math.abs(o.x-p.x)>SU.AGGRO) return;   /* a boss arena is locked: the boss is always in the fight */ const d=Math.abs(o.x-s.bx)+(o.k==='log'?20:0); if(d<bd){ bd=d; best=o; } };
  rs.crawlers.forEach(c=>{ if(!c.dead) take({k:'mob',ref:c,x:c.x,y:4}); });
  const b=rs.boss; if(supBossUp(b)) take({k:'boss',ref:b,x:b.x,y:supBossY(b)});
  rs.logs.forEach(l=>{ if(l.x<W) take({k:'log',ref:l,x:l.x,y:7}); });
  return best;
}
function superStep(dt,rs){
  const s=G.sup, p=G.p, SU=TUNE.SUPER; if(!s.on) return; s.t+=dt;
  if(s.ph==='shrink'){ if(s.t>=SU.SHRINK_T){ s.on=false; s.ph='off'; s.t=0; } return; }
  s.st.dur+=dt;
  const home=supX(p.x-p.face*SU.FOLLOW_GAP);
  if(s.ph==='grow'){ s.bx+=(home-s.bx)*Math.min(1,dt*4); if(s.t>=SU.GROW_T){ s.ph='fight'; s.t=0; s.atkT=0; supFx({k:'land',x:s.bx}); } return; }
  const tg=supTarget(rs); s.tgt=tg&&{k:tg.k,x:tg.x,y:tg.y};
  if(tg||s.wind>0) s.idleT=0; else { s.idleT+=dt; if(s.idleT>SU.IDLE_DELAY) supDrain(SU.IDLE_PER_SEC*(Math.abs(p.vx)>SU.IDLE_MOVE_VX&&s.idleT<SU.IDLE_DELAY+SU.IDLE_MOVE_T?SU.IDLE_MOVE_K:1)*Math.min(dt,s.idleT-SU.IDLE_DELAY),'idle'); if(!s.on||s.ph!=='fight') return; }   // quiet room: slow drain
  const gx=tg?supX(tg.x-(tg.x>=s.bx?1:-1)*SU.REACH*.55):home, dx=gx-s.bx;
  if(s.wind<=0&&Math.abs(dx)>1) s.bx=supX(s.bx+Math.sign(dx)*Math.min(Math.abs(dx),SU.SPEED*dt));   // plants his feet while winding up
  s.face=tg?(tg.x>=s.bx?1:-1):Math.abs(dx)>2?(dx>0?1:-1):p.face;
  // he gets hurt too: mobs chewing on him, a boss he is toe to toe with, a log that reaches him before he smashes it
  for(const c of rs.crawlers) if(!c.dead&&Math.abs(c.x-s.bx)<SU.BODY) supDrain(SU.MOB_BITE_PER_SEC*dt,'bites');
  const b=rs.boss; if(supBossHittable(b)&&Math.abs(b.x-s.bx)<SU.BODY+16) supDrain(SU.BOSS_CONTACT_PER_SEC*dt,'contact');
  for(let i=rs.logs.length-1;i>=0&&s.ph==='fight';i--){ const l=rs.logs[i]; if(Math.abs(l.x-s.bx)<SU.BODY*.5){ rs.logs.splice(i,1); s.st.logs++; s.st.logHits++; supFx({k:'log',x:l.x}); supDrain(FORCE.log*l.sp/57*SU.LOG_HIT_PER_FORCE,'logHits'); } }
  if(s.ph!=='fight') return;
  s.atkT-=dt;
  if(s.wind>0){ s.wind-=dt; if(s.wind<=0) supStrike(rs); return; }
  if(tg&&s.atkT<=0&&Math.abs(tg.x-s.bx)<=SU.REACH&&(tg.k!=='boss'||supBossHittable(tg.ref))){
    s.swings++; s.st.swings++; s.slam=s.swings%SU.SLAM_EVERY===0; if(s.slam) s.st.slams++; s.atkT=SU.HIT_RATE; s.wind=SU.WINDUP;
    supFx({k:'wind',slam:s.slam,ty:tg.y}); }
}
function supStrike(rs){   // the swing lands on whatever is in reach now (a slam: everything around him)
  const s=G.sup, SU=TUNE.SUPER, R=s.slam?SU.SLAM_R:SU.REACH, inR=x=>s.slam?Math.abs(x-s.bx)<=R:(x-s.bx)*s.face>=-6&&Math.abs(x-s.bx)<=R;
  const list=[];
  rs.crawlers.forEach(c=>{ if(!c.dead&&inR(c.x)) list.push({k:'mob',ref:c,x:c.x,y:4}); });
  const b=rs.boss; if(supBossHittable(b)&&inR(b.x)) list.push({k:'boss',ref:b,x:b.x,y:supBossY(b)});
  rs.logs.forEach(l=>{ if(inR(l.x)) list.push({k:'log',ref:l,x:l.x,y:7}); });
  if(!s.slam&&list.length>1){ list.sort((a,c)=>Math.abs(a.x-s.bx)-Math.abs(c.x-s.bx)); list.length=1; }
  supFx({k:s.slam?'slam':'swipe',x:s.bx,face:s.face,n:list.length});
  sfx(s.slam?70:150,s.slam?.3:.1,'sawtooth');
  list.forEach(o=>supHit(rs,o));
}
function supHit(rs,o){
  const s=G.sup, st=s.st, SU=TUNE.SUPER, D=SU.HIT_DMG;
  if(o.k==='mob'){ const c=o.ref; if(c.dead) return; const d=Math.min(D,c.hp); c.hp-=D; st.mobDmg+=d; supDrain(SU.MOB_COUNTER,'counter'); c.x=Math.max(0,Math.min(W,c.x+(c.x>=s.bx?1:-1)*6));
    if(c.hp<=0){ c.dead=true; c.drag=false; st.kills++; addScore(SU.KILL_SCORE); supFx({k:'kill',x:c.x}); } else supFx({k:'hit',x:c.x,y:4}); }
  else if(o.k==='log'){ const l=o.ref, i=rs.logs.indexOf(l); if(i<0) return; if(l.hp===undefined) l.hp=SU.LOG_HP; const d=Math.min(D,l.hp); l.hp-=D; st.logDmg+=d;
    if(l.hp<=0){ rs.logs.splice(i,1); st.logs++; addScore(SU.LOG_SCORE); supFx({k:'log',x:l.x}); supDrain(SU.LOG_SMASH,'counter'); } else supFx({k:'hit',x:l.x,y:7}); }
  else { const b=o.ref; if(!supBossHittable(b)) return; const done=st.bossPct[G.room]||0, pct=Math.min(D*SU.BOSS_DMG_SCALE,SU.BOSS_CAP_PCT-done);
    if(pct<=1e-9){ if(!s.capMsg){ s.capMsg=true; G.msg=b.def.short+' shrugs him off: finish it yourself'; G.msgT=1.4; } supFx({k:'clink',x:b.x,y:o.y}); return; }
    st.bossPct[G.room]=done+pct; supDrain(SU.BOSS_COUNTER,'counter'); b.hp=Math.max(0,b.hp-pct/100*b.max); b.sv.hp=b.hp; b.flash=Math.max(b.flash,.25); addScore(Math.round(pct*10)); supFx({k:'hit',x:b.x,y:o.y,boss:true});
    if(b.hp<=1e-6){ b.hp=0; bossDefeat(b); } }
}

/* ---------- buddy ride (R) ----------
   R near buddy: he climbs into mudbot's glass dome and rides there, poking up out of the soil beside the seedling; R again: he hops out.
   He is never steered: in the dome he looks around on his own (stares at the nearest mob, log or boss, over his shoulder when it is
   behind), ducks into the dirt when mudbot gets hit and waves when a gem is picked up. A new run starts with him on foot. */
const RIDE_NEAR=3.2;   // world units between mudbot and buddy for R to work (following, he is 1.9 behind)
function budNew(){ return {ride:false,n:0,no:0}; }
function rideInput(){
  const p=G.p, b=G.bud; if(G.state!=='play'||!p||!b||G.freeze) return false;
  if(p.dead>0||G.sup.on){ b.no++; G.msg=G.sup.on?'buddy is busy being super':'not now'; G.msgT=.8; return false; }
  if(!b.ride&&!budNear(p)){ b.no++; G.msg='get closer to buddy'; G.msgT=.8; return false; }
  b.ride=!b.ride; b.n++; G.msg=b.ride?'buddy climbs into your dome':'buddy hops out'; G.msgT=.9; sfx(b.ride?640:420,.07,'triangle'); return true;
}

/* ---------- bosses (logic, logical px space; rooms 4, 8 and 12 are locked arenas) ---------- */
const BOSS_DEF = {
  boss1: { name: 'BOGJAW (mire beast)',     short: 'BOGJAW',    hp: 3, reward: 1500, gems: 8  },
  boss2: { name: 'GLOOMWING (canopy flyer)', short: 'GLOOMWING', hp: 4, reward: 2500, gems: 10 },
  boss3: { name: 'MUDTOTEM (final boss)',    short: 'MUDTOTEM',  hp: 5, reward: 5000, gems: 14 }
};  // boss names shown in the game
function isLocked(){ return !!(G.rs && G.rs.boss && !G.rs.boss.dead); }
function nextBoss(){ for(const ri of BOSS_ROOMS){ const sv=G.bosses[ri]; if(!(sv&&sv.done)&&ri>=G.room) return ri; } return -1; }
function mkBoss(room){
  const def=BOSS_DEF[room.kind]; if(!def) return null;
  const sv=G.bosses[room.i]||(G.bosses[room.i]={hp:def.hp,done:false}); if(sv.done) return null;
  G.msg='BOSS: '+def.short; G.msgT=1.8;
  return {kind:room.kind,name:def.name,def,sv,max:def.hp,hp:sv.hp,state:'intro',t:0,hurtCd:0,flash:0,dead:false,
    x:room.kind==='boss3'?248:160,y:room.kind==='boss2'?70:GY,h:0,cx:160,wait:0,n:0,seq:0,proj:[],arm:0,mouth:0,fired:0,shots:0,sx:0,ex:0};
}
function bossReset(b){          // after losing a life: same health, fresh telegraph
  b.state='idle'; b.t=0; b.wait=1.3; b.proj=[]; b.hurtCd=0; b.flash=0; b.arm=0; b.mouth=0; G.rs.logs=[]; G.rs.logT=2;
  if(b.kind==='boss1'){ b.h=0; } if(b.kind==='boss2'){ b.x=160; b.y=70; b.state='hover'; } if(b.kind==='boss3'){ b.x=248; b.h=78; }
}
const B_go=(b,s)=>{ b.state=s; b.t=0; };
function hitP(why,sx,f){ const p=G.p; if(p.inv<=0&&p.dead<=0) harm(why,sx,f); }
function stompOn(b,top,half){ const p=G.p; return p.vy>0&&!p.vine&&p.dead<=0&&Math.abs(p.x-b.x)<half+4&&p.y>=top-5&&p.y<=top+12; }
function bounceP(){ const p=G.p; p.vy=-170; p.onGround=false; p.coyote=0; }
function kickOn(b,hw,hh,cy){ const p=G.p; return p.kick>0&&!p.onGround&&!p.vine&&p.dead<=0&&Math.abs(p.x-b.x)<hw+6&&Math.abs((p.y-12)-cy)<hh+12; }
function kickBoss(b){ const p=G.p; if(hurtBoss(b)){ p.kick=0; p.vx=(p.x<b.x?-1:1)*90; p.vy=-90; return true; } return false; }
function hurtBoss(b){
  if(b.hurtCd>0||b.dead||b.state==='intro'||b.state==='dying') return false;
  b.hp--; b.sv.hp=Math.max(0,b.hp); b.hurtCd=1.1; b.flash=.6; addScore(250); sfx(200,.15,'sawtooth');
  if(b.hp<=0) bossDefeat(b);
  return true;
}
const WIN_WAIT=5;   // seconds from the final boss kill to the win screen
function bossDefeat(b){
  b.dead=true; b.state='dying'; b.t=0; b.sv.done=true; b.sv.hp=0; b.proj=[]; G.rs.logs=[];
  G.timeLeft+=15; addScore(b.def.reward); G.msg=b.def.short+' DEFEATED! +15 sec'; G.msgT=2.4; sfx(880,.3);
  const r=G.rs.rng; G.burst=[];
  for(let i=0;i<b.def.gems;i++) G.burst.push({x:b.x,y:(b.kind==='boss2'?b.y:GY-30),vx:(r()-.5)*190,vy:-(110+r()*120),kind:i%3,t:0});
  if(b.kind==='boss3') G.winT=WIN_WAIT;   // the HUD shows FINAL BOSS DOWN for the whole wait
}
function burstUpdate(dt){
  const p=G.p; if(!G.burst||!G.burst.length||p.dead>0) return;
  for(let i=G.burst.length-1;i>=0;i--){ const g=G.burst[i]; g.t+=dt;
    if(g.t<.9){ g.vy+=GRAV*dt; g.x+=g.vx*dt; g.y+=g.vy*dt; if(g.y>GY-6){ g.y=GY-6; g.vy*=-.4; g.vx*=.7; } g.x=Math.max(4,Math.min(W-4,g.x)); }
    else { const tx=p.x,ty=p.y-12,dx=tx-g.x,dy=ty-g.y,d=Math.hypot(dx,dy)||1,sp=Math.min(d/dt,230); g.x+=dx/d*sp*dt; g.y+=dy/d*sp*dt; }
    if(Math.hypot(p.x-g.x,(p.y-12)-g.y)<9){ G.burst.splice(i,1); addScore(100); sfx(1100,.05); }
  }
}
function bossUpdate(dt){
  const rs=G.rs, b=rs.boss; if(!b) return; const p=G.p, enr=b.hp<=Math.ceil(b.max/2), m=enr?.7:1;
  b.t+=dt; if(b.hurtCd>0) b.hurtCd-=dt; if(b.flash>0) b.flash-=dt;
  if(b.state==='dying'){ if(b.t>1.4) rs.boss=null; return; }
  if(b.kind==='boss1') ai1(b,dt,p,rs,enr,m); else if(b.kind==='boss2') ai2(b,dt,p,rs,enr,m); else ai3(b,dt,p,rs,enr,m);
}
/* ---- boss 1: BOGJAW, a mire beast that lunges out of the mud ---- */
function ai1(b,dt,p,rs,enr,m){
  const P0=56,P1=264, clampC=x=>Math.max(P0+12,Math.min(P1-12,x));
  if(b.state==='intro'){ b.x=b.cx=160; b.h=22+5*Math.sin(b.t*3); if(b.t>1.5){ B_go(b,'idle'); b.wait=.7; } return; }
  if(b.h>=14){   // damage method: a rolling log that reaches the exposed head hurts it
    for(let i=rs.logs.length-1;i>=0;i--){ if(Math.abs(rs.logs[i].x-b.x)<18){ rs.logs.splice(i,1); if(hurtBoss(b)&&!b.dead&&b.state==='stun') B_go(b,'sink'); break; } }
    if(!b.dead&&kickOn(b,16,b.h/2,GY-b.h/2)&&kickBoss(b)&&!b.dead&&b.state==='stun') B_go(b,'sink');   // vine kick
  }
  if(b.dead) return;
  switch(b.state){
    case 'idle': b.h=Math.max(0,b.h-100*dt); b.wait-=dt;
      if(b.wait<=0){ b.n++; if(b.n===1||rs.rng()<.6){ b.cx=clampC(p.x+p.vx*.3); B_go(b,'tele'); } else { b.cx=p.x<160?236:84; B_go(b,'stele'); } } break;
    case 'tele': { const dur=1.0*m; b.h=0; b.x=b.cx; if(b.t>=dur) B_go(b,'lunge'); break; }   // the ripple marks where it will lunge; step out of it
    case 'lunge': b.x=b.cx; b.h=52*Math.sin(Math.min(1,b.t/.2)*Math.PI/2); b.mouth=1;
      if(p.dead<=0&&Math.abs(p.x-b.cx)<16&&p.y>GY-b.h+2&&b.h>8) hitP('mauled by Bogjaw',b.cx,FORCE.bogjaw);
      if(b.t>=.45) B_go(b,'stun'); break;
    case 'stun': b.x=b.cx; b.h=Math.max(24,b.h-160*dt); b.mouth=.3;
      if(stompOn(b,GY-b.h,16)){ bounceP(); hurtBoss(b); if(!b.dead) B_go(b,'sink'); break; }
      if(b.t>=(enr?1.6:2.0)) B_go(b,'sink'); break;
    case 'sink': b.x=b.cx; b.mouth=0; b.h=Math.max(0,b.h-90*dt); if(b.h<=0&&b.t>.3){ B_go(b,'idle'); b.wait=(enr?.6:1.0)+rs.rng()*.4; } break;
    case 'stele': b.x=b.cx; b.h=30*Math.min(1,b.t/.3); b.mouth=.4; if(b.t>=.8*m){ B_go(b,'spit'); b.shots=enr?2:1; b.fired=0; } break;
    case 'spit': b.x=b.cx; b.h=30; b.mouth=1;
      if(b.fired<b.shots&&b.t>=b.fired*.4){ const T=.9,y0=GY-30,tx=p.x+(b.fired?p.vx*.45:0); b.proj.push({t:'ball',x:b.cx,y:y0,vx:Math.max(-210,Math.min(210,(tx-b.cx)/T)),vy:(GY-y0-.5*GRAV*T*T)/T}); b.fired++; sfx(250,.1,'sawtooth'); }
      if(b.t>=.4*b.shots+.3) B_go(b,'sink'); break;
  }
  for(let i=b.proj.length-1;i>=0;i--){ const q=b.proj[i];
    if(q.t==='ball'){ q.vy+=GRAV*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; if(q.y>=GY-4){ q.t='puddle'; q.y=GY; q.life=.55; }
      else if(p.dead<=0&&Math.hypot(p.x-q.x,(p.y-12)-q.y)<9) hitP('mud ball',q.x,FORCE.mudBall); }
    else { q.life-=dt; if(q.life<=0){ b.proj.splice(i,1); continue; } if(p.dead<=0&&Math.abs(p.x-q.x)<13&&p.y>GY-9) hitP('mud splash',q.x,FORCE.mudSplash); }
  }
}
/* ---- boss 2: GLOOMWING, a canopy creature: seed-bombs, swoops, then lands exhausted ---- */
function ai2(b,dt,p,rs,enr,m){
  const ease=(k)=>Math.min(1,dt*k);
  if(b.state==='intro'){ b.x=160; b.y=70+4*Math.sin(b.t*3); if(b.t>1.5){ B_go(b,'hover'); b.wait=.9; } return; }
  const kickable=['hover','btele','bombs','stel'].includes(b.state);
  if(kickable&&kickOn(b,20,14,b.y)&&kickBoss(b)&&!b.dead){ B_go(b,'hover'); b.wait=1.1; }   // vine kick
  if(b.dead) return;
  switch(b.state){
    case 'hover': b.x+=(160+88*Math.sin(G.t*.9)-b.x)*ease(3); b.y+=(74-b.y)*ease(4); b.wait-=dt;
      if(b.wait<=0){ b.n++; B_go(b,(b.n===1||rs.rng()<.5)?'btele':'stel'); } break;
    case 'btele': b.x+=(160+88*Math.sin(G.t*.9)-b.x)*ease(2); b.y+=(52-b.y)*ease(5); if(b.t>=.8*m){ B_go(b,'bombs'); b.fired=0; b.shots=enr?5:3; } break;
    case 'bombs': { const gap=.28*m;
      if(b.fired<b.shots&&b.t>=b.fired*gap){ const k=b.fired, off=k===0?0:(k%2?1:-1)*Math.ceil(k/2)*46; b.proj.push({t:'bomb',x:Math.max(14,Math.min(W-14,p.x+p.vx*.4+off)),y:b.y+10,vy:0,st:'fall',tt:0}); b.fired++; sfx(330,.06); }
      if(b.fired>=b.shots&&b.t>b.shots*gap+.3){ B_go(b,'hover'); b.wait=(enr?.8:1.3)+rs.rng()*.4; } break; }
    case 'stel': { const tx=p.x<160?Math.min(296,p.x+110):Math.max(24,p.x-110); b.x+=(tx-b.x)*ease(5); b.y+=(46-b.y)*ease(5);
      if(b.t>=.9*m){ b.sx=b.x; b.ex=Math.max(-20,Math.min(340,2*p.x-b.sx)); B_go(b,'swoop'); sfx(150,.3,'sawtooth'); } break; }   // dives straight through where you stood: jump it
    case 'swoop': { const dur=1.6*m, u=Math.min(1,b.t/dur); b.x=b.sx+(b.ex-b.sx)*u; b.y=46+(GY-12-46)*Math.sin(Math.PI*u);
      if(p.dead<=0&&Math.abs(p.x-b.x)<18&&Math.abs((p.y-12)-b.y)<16) hitP('Gloomwing swoop',b.x,FORCE.swoop);
      if(u>=1){ B_go(b,'land'); } break; }
    case 'land': b.y+=(GY-14-b.y)*ease(7); b.x+=(Math.max(30,Math.min(290,b.x))-b.x)*ease(8); if(b.t>=.6){ b.y=GY-14; B_go(b,'rest'); } break;
    case 'rest': b.y=GY-14;
      if(stompOn(b,b.y-13,20)){ bounceP(); hurtBoss(b); if(!b.dead){ B_go(b,'rise'); } break; }
      if(b.t>=(enr?1.6:2.2)) B_go(b,'rise'); break;
    case 'rise': b.y+=(74-b.y)*ease(4); if(b.t>=.7){ B_go(b,'hover'); b.wait=(enr?.7:1.1); } break;
  }
  for(let i=b.proj.length-1;i>=0;i--){ const q=b.proj[i]; q.tt+=dt;
    if(q.st==='fall'){ q.vy+=380*dt; q.y+=q.vy*dt; if(q.y>=GY-5){ q.y=GY-5; q.st='fuse'; q.tt=0; } }
    else if(q.st==='fuse'){ if(q.tt>=.75){ q.st='boom'; q.tt=0; sfx(90,.25,'sawtooth'); } }
    else { if(p.dead<=0&&Math.hypot(p.x-q.x,(p.y-10)-q.y)<18&&q.tt<.25) hitP('seed bomb',q.x,FORCE.seedBomb); if(q.tt>=.3) b.proj.splice(i,1); }
  }
}
/* ---- boss 3: MUDTOTEM, ground slams send shockwaves along the floor; jump over them ---- */
const splat=q=>{ (G.splats||(G.splats=[])).push({x:q.x,y:q.y}); };   // look only: syncBoss turns these into a mud splash
const VOLLEY_PATS=[{n:4,gap:.55,v:110},{n:4,gap:.7,v:110},{n:3,gap:.7,v:110}];   // MUDTOTEM under-half-health volley patterns A, B, C
function ai3(b,dt,p,rs,enr,m){
  const SEQ=['slam','volley','slam'];
  b.x=248;
  if(b.state==='intro'){ b.h=78; b.arm=0; if(b.t>1.6){ B_go(b,'idle'); b.wait=.9; } return; }
  const vuln=['idle','stele','vtele','volley'].includes(b.state);
  if(vuln&&kickOn(b,22,b.h/2,GY-b.h/2)&&kickBoss(b)&&!b.dead){ B_go(b,'idle'); b.wait=1.2; }   // vine kick
  if(b.dead) return;
  const wave=(x,v)=>b.proj.push({t:'wave',x,v}), waves=v=>{ wave(b.x-28,-v); wave(b.x+28,v); };
  switch(b.state){
    case 'idle': b.h=78; b.arm=Math.max(0,b.arm-3*dt); b.mouth=0; b.wait-=dt;
      if(b.wait<=0){ const s=SEQ[b.seq++%SEQ.length]; B_go(b,s==='slam'?'stele':'vtele'); } break;
    case 'stele': { const dur=1.0*m; b.arm=Math.min(1,b.t/dur); if(b.t>=dur){ sfx(70,.3,'sawtooth'); waves(enr?135:105); b.pend=enr?.85:-1; B_go(b,'dazed'); b.arm=0; } break; }
    case 'dazed': b.h=Math.max(26,b.h-220*dt);
      if(b.pend>0){ b.pend-=dt; if(b.pend<=0){ waves(135); sfx(70,.3,'sawtooth'); } }
      if(stompOn(b,GY-b.h,22)){ bounceP(); hurtBoss(b); if(!b.dead) B_go(b,'recover'); break; }
      if(b.t>=(enr?2.2:2.4)) B_go(b,'recover'); break;
    case 'recover': b.h=Math.min(78,b.h+90*dt); if(b.t>=.8){ B_go(b,'idle'); b.h=78; b.wait=(enr?.8:1.1)+rs.rng()*.3; } break;
    case 'vtele': b.mouth=Math.min(1,b.t/(.9*m)); b.warn=(b.seq%2)?'high':'low';   // wind-up: the ground marker shows the first ball's lane (HIGH = stand, LOW = jump)
      if(b.t>=.9*m){ b.warn=null; B_go(b,'volley'); b.fired=0;
        // under half health each volley picks one of 3 patterns from the run's seeded rng: A 4 balls 0.55 s apart, B 4 balls 0.7 s apart, C 3 balls 0.7 s apart (all 110 px/s)
        if(enr){ const k=Math.floor(rs.rng()*3), P=VOLLEY_PATS[k]; b.pat='ABC'[k]; b.shots=P.n; b.gap=P.gap; b.bv=P.v; }
        else { b.pat=null; b.shots=3; b.gap=.7; b.bv=100; } } break;
    case 'volley': { const gap=b.gap||.7;
      if(b.fired<b.shots&&b.t>=b.fired*gap){ b.proj.push({t:'ball',x:b.x-22,y:((b.seq+b.fired)%2)?GY-46:GY-8,v:-(b.bv||100)}); b.fired++; sfx(200,.08,'square'); }
      if(b.fired>=b.shots&&b.t>b.shots*gap+.4){ B_go(b,'idle'); b.wait=(enr?.8:1.0); } break; }
  }
  if(vuln&&b.state!=='dazed'&&(b.state!=='idle'||b.t>.7)&&p.dead<=0&&Math.abs(p.x-b.x)<24&&p.y>GY-b.h+4) hitP('crushed by the totem',b.x,FORCE.totem);
  for(let i=b.proj.length-1;i>=0;i--){ const q=b.proj[i];
    if(q.t==='wave'){ q.x+=q.v*dt; if(q.x<-10||q.x>W+10){ b.proj.splice(i,1); continue; } if(p.dead<=0&&Math.abs(p.x-q.x)<7&&p.y>GY-13) hitP('shockwave',q.x,FORCE.shockwave); }
    else { q.x+=q.v*dt;   // mud ball: splats on the left gate, and on him when it lands a hit or is blocked (one ball = one hit, as BLOCK_INV intends)
      if(q.x<6){ splat(q); b.proj.splice(i,1); continue; }
      if(p.dead<=0&&Math.abs(p.x-q.x)<8&&p.y>q.y-7&&(p.y-25)<q.y+7){ const live=p.inv<=0&&p.binv<=0;
        // the shield only stops a mud ball when he faces it; blocking with his back to the ball counts as an unblocked hit (other hits unchanged)
        if(live&&p.dead<=0&&blockReady(p)&&(q.x-p.x)*p.face<0) loseLife('mud ball (shield facing away)'); else hitP('mud ball',q.x,FORCE.totemBall); if(live){ splat(q); b.proj.splice(i,1); } } }
  }
}

/* ======================= 3D renderer (three.js, plain WebGL) =======================
   Layout of this half of the file (the game logic above is v2 plus the dev-moves physical shield):
   setup + quality -> noise / materials / textures -> shared geometry -> particles
   -> ART BUILDERS (buildHero / buildCrawler / buildLog / buildSnapper / buildGem / buildBoss1-3: each returns a Group plus the
   handles the animation code drives, so real art can replace one builder at a time) -> room builder -> per-frame sync -> camera -> HUD -> input -> loop.
   Models and fonts are code-only; surface textures are the approved art textures embedded in art/tex.js, and the glow/star sprites are drawn on a canvas at start-up. */
const S = 0.1;                                  // 1 logical px = 0.1 world units; a room is 32 units wide
const X = px => px * S, Y = py => (GY - py) * S; // logical y grows downward, world y grows upward
const cv = document.getElementById('c');
const isTouch = ('ontouchstart' in window) || matchMedia('(pointer: coarse)').matches;

/* ---- quality presets: LOW = touch default (no shadow maps, fewer instances); HIGH = desktop default ---- */
const QLEV = [
  { name: 'LOW',  shadows: false, pr: 1.25, res: 1.1, grass: 90,  fern: 12, rock: 12, flower: 14, pebble: 16, lian: 5,  rays: 3, motes: 0,  leaf: 3, far: 10, pmax: 90,  pf: .5, bd: [1, 5, 10, 2, 4, 6] },
  { name: 'HIGH', shadows: true,  pr: 2,    res: .5,  grass: 420, fern: 36, rock: 26, flower: 50, pebble: 48, lian: 12, rays: 7, motes: 34, leaf: 5, far: 15, pmax: 240, pf: 1,  bd: [3, 12, 30, 5, 8, 12] }
];
let Qi = isTouch ? 0 : 1;
{ const qq = qs.get('q'); if (qq === 'low') Qi = 0; else if (qq === 'high') Qi = 1; else { try { const s = localStorage.getItem('jr3d-quality'); if (s === 'low') Qi = 0; else if (s === 'high') Qi = 1; } catch (e) {} } }
const QL = () => QLEV[Qi];

let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !isTouch, powerPreference: 'high-performance' }); }
catch (e) { document.getElementById('err').style.display = 'flex'; }
if (renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;   // filmic curve = the colour grade
  renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = QL().shadows;
}
const FOGC = '#b9cfb0';
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 170);
scene.background = new THREE.Color(FOGC);
scene.fog = new THREE.FogExp2(FOGC, 0.022);     // exponential fog: clear lane, deep layered distance

/* ---- lights: hemisphere + warm sun from behind-left (long shadows toward the camera, light shafts) + weak front fill ---- */
const hemi = new THREE.HemisphereLight('#d7efd6', '#6d4c2d', 1.15); scene.add(hemi);
const SUNOFF = new THREE.Vector3(-12, 20, -8);
const sun = new THREE.DirectionalLight('#ffd49a', 2.6); scene.add(sun, sun.target);
sun.shadow.mapSize.set(2048, 2048); { const c = sun.shadow.camera; c.left = -22; c.right = 22; c.top = 20; c.bottom = -20; c.near = 1; c.far = 80; }
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3; sun.castShadow = QL().shadows;
const fill = new THREE.DirectionalLight('#ffe7c8', 0.7); fill.position.set(-6, 9, 22); scene.add(fill);

/* ---- sky gradient dome (follows the camera; not tone-mapped so its horizon matches the fog colour exactly) ---- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  uniforms: { uTop: { value: new THREE.Color('#5aa7a6') }, uMid: { value: new THREE.Color('#c4dcb6') }, uHor: { value: new THREE.Color(FOGC) }, uSun: { value: SUNOFF.clone().normalize() } },
  vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uTop,uMid,uHor,uSun; varying vec3 vD; void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.,1.); vec3 c=mix(uHor,uMid,smoothstep(0.,.22,h)); c=mix(c,uTop,smoothstep(.18,.85,h)); float s=max(dot(d,uSun),0.); c+=vec3(1.,.8,.45)*(pow(s,5.)*.22+pow(s,48.)*.6); gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }'
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

/* ---- small helpers: noise, colours, canvas textures ---- */
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const h2 = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
const h3 = (x, y, z) => { const n = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719) * 43758.5453; return n - Math.floor(n); };
function vn(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h2(xi, zi), h2(xi + 1, zi), u), lerp(h2(xi, zi + 1), h2(xi + 1, zi + 1), u), v); }
const fbm = (x, z) => vn(x, z) * .6 + vn(x * 2.1 + 7, z * 2.1 + 3) * .3 + vn(x * 4.3, z * 4.3 + 9) * .1;
const _c = new THREE.Color(), _c2 = new THREE.Color();
function mkTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const texGlow = mkTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const texSoft = mkTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.6, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const texStar = mkTex(64, 64, (g, w, h) => { g.translate(32, 32); g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 4 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 14); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
const texRay = mkTex(32, 128, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,236,190,0)'); v.addColorStop(.12, 'rgba(255,236,190,.85)'); v.addColorStop(.7, 'rgba(255,236,190,.35)'); v.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in'; const hh = g.createLinearGradient(0, 0, w, 0); hh.addColorStop(0, 'rgba(0,0,0,0)'); hh.addColorStop(.5, 'rgba(0,0,0,1)'); hh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = hh; g.fillRect(0, 0, w, h); });

/* ---- materials (cached by colour; smooth shaded Lambert unless flat shading is asked for) ---- */
const uTime = { value: 0 };
const allMats = new Set(); const matCache = {};
const reg = m => { allMats.add(m); return m; };
const M = (hex, emissive, flat) => { const k = hex + (emissive || '') + (flat ? 'F' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshLambertMaterial({ color: hex, flatShading: !!flat, emissive: emissive || '#000000' }))); };
const MS = (hex, rough, metal, emissive, flat) => { const k = 's' + hex + rough + metal + (emissive || '') + (flat ? 'F' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, flatShading: !!flat, emissive: emissive || '#000000' }))); };
const MB = (hex, op, add) => { const k = 'b' + hex + op + (add ? 'A' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false, fog: !add, blending: add ? THREE.AdditiveBlending : 1 }))); };
// wind sway for foliage: expr is a GLSL float using the local `position`; instanced meshes get a per-instance phase
function swayMat(key, expr, flat, side) {
  const m = reg(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!flat, side: side ? THREE.DoubleSide : 0 }));
  m.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float sP=0.;\n#ifdef USE_INSTANCING\n sP=instanceMatrix[3].x*.35+instanceMatrix[3].z*.27;\n#endif\n float sA=' + expr + ';\n transformed.x+=sin(uTime*1.4+sP)*sA; transformed.z+=cos(uTime*1.1+sP*1.3)*sA*.6;'); };
  m.customProgramCacheKey = () => 'sway' + key; return m;
}
// water / tar with animated shimmer: moving glint streaks added to the emissive term (still lit, shadowed and fogged)
function waterMat(key, color, alpha, glint, speed, tint, streak = 1) {   // streak: strength of the thin diagonal glint lines (0 = none)
  const m = reg(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: alpha, depthWrite: false }));
  m.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n vec2 wp=vWP.xz; float tt=uTime*' + speed.toFixed(2) + ';\n float w1=sin(wp.x*2.7+tt*1.7+sin(wp.y*2.1+tt)*1.4); float w2=sin(wp.y*4.3-tt*1.3+wp.x*1.7);\n float gl=smoothstep(.7,1.,w1*w2*.5+.5)*.8+pow(max(0.,sin((wp.x*.8+wp.y)*6.+tt*2.1)),16.)*' + (.6 * streak).toFixed(2) + ';\n totalEmissiveRadiance+=vec3(' + tint + ')*gl*' + glint.toFixed(2) + ';\n diffuseColor.rgb*=.85+.15*w1;'); };
  m.customProgramCacheKey = () => 'water' + key; return m;
}
const mats = {
  lava: waterMat('lv', '#e8501a', 1, 1.1, .5, '1,.75,.3', 0),        // crevasse lava (glows: emissive set below)
  fastWater: waterMat('fw', '#3f8fb0', .9, 1.3, 4.0, '.85,.95,1'),   // crevasse water rushing past
  leaf: swayMat('leaf', '.05*max(position.y+.35,0.)', true, false),
  grass: swayMat('grass', '.16*position.y*position.y', false, true),
  fern: swayMat('fern', '.1*position.y', false, true),
  lian: swayMat('lian', '.35*max(-position.y,0.)*max(-position.y,0.)', false, false),
  water: waterMat('w', '#2f6f6a', .88, .9, 1.0, '.75,.95,.85'),
  tar: waterMat('t', '#1b1410', .96, .2, .45, '.55,.5,.6', 0),   // tar: no glint lines (they read as slats) and a dimmer sheen, still dark and glossy
  mire: waterMat('m', '#33281b', .95, .15, .6, '.7,.6,.45', 0)   // mud: no glint lines and only a faint wet sheen; strong water glints read as old slats over the approved art texture
};

mats.lava.emissive.set('#b8360a');

/* ---- shared geometry (built once) ---- */
const gBox = new THREE.BoxGeometry(1, 1, 1), gCyl = new THREE.CylinderGeometry(.5, .5, 1, 10), gSph = new THREE.SphereGeometry(.5, 14, 10);
const gIco = new THREE.IcosahedronGeometry(.5, 0), gOct = new THREE.OctahedronGeometry(.5, 0), gCone = new THREE.ConeGeometry(.5, 1, 8);
const gHalf = new THREE.SphereGeometry(.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const gDisc = new THREE.CircleGeometry(.5, 20); gDisc.rotateX(-Math.PI / 2);
const gRing = new THREE.TorusGeometry(.5, .035, 6, 32); gRing.rotateX(Math.PI / 2);
const gQuad = new THREE.PlaneGeometry(1, 1), gFlat = new THREE.PlaneGeometry(1, 1); gFlat.rotateX(-Math.PI / 2);
const gTorus = new THREE.TorusGeometry(.5, .2, 8, 18);
const capCache = {};
const capG = (r, len) => { const k = r + '_' + len; return capCache[k] || (capCache[k] = new THREE.CapsuleGeometry(r, len, 5, 12)); };
function rcyl(r, h, e, seg) {         // rounded cylinder (lathe) standing on y=0
  const pts = [new THREE.Vector2(0, 0)]; const n = 5;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, e + Math.sin(a) * e)); }
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h - e + Math.sin(a) * e)); }
  pts.push(new THREE.Vector2(0, h)); return new THREE.LatheGeometry(pts, seg || 14);
}
function paintVC(g, fn) {               // write per-vertex colours from fn(x,y,z,nx,ny,nz) -> THREE.Color-ish [r,g,b] (linear multipliers)
  const p = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i), nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
const gTrunk = (() => {                 // lathe trunk with root flare + bark noise + moss at the foot; unit height, radius .5, scaled per tree
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(.5 * (1 - .4 * t) + .5 * Math.exp(-t * 8), t)); }
  const g = new THREE.LatheGeometry(pts, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + (vn(a * 1.7 + 4, y * 7) - .5) * .24 + Math.sin(a * 6 + y * 3) * .05 + (vn(a * 5, y * 30) - .5) * .06; p.setX(i, x * k); p.setZ(i, z * k); }
  return paintVC(g, (x, y, z) => { const a = Math.atan2(z, x), s = .62 + .5 * vn(a * 3 + 1, y * 4.5) * (.7 + .3 * Math.sin(a * 9)), m = sstep(.3, 0, y) * .8;
    return [s * (1 - m * .45), s * (1 + m * .05), s * (1 - m * .5)]; });
})();
function blobGeo(detail, jit, up) {      // jittered, faceted blob; vertex colour = fake ambient occlusion (dark underside)
  const g = new THREE.IcosahedronGeometry(.5, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z), k = 1 + (h3(x / l, y / l, z / l) - .5) * jit; p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals();
  return paintVC(g, (x, y, z) => { const t = sstep(-.45, .45, y), r = lerp(.55, 1.15, t) * (up ? 1 : .9); return [r * lerp(.95, 1.05, t), r, r * lerp(.95, .9, t)]; });
}
const gBlob = blobGeo(1, .5, true), gRock = blobGeo(1, .55, false);
(() => { const g = gRock, p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * .75); })();
function tuftGeo(blades, hMin, hMax, w, seg, spread) {   // clump of curved blades (double sided), colour dark at the root -> light at the tip
  const pos = [], col = [], idx = []; let n = 0;
  for (let b = 0; b < blades; b++) {
    const ang = b * 2.399 + h2(b, 3) * .6, rad = .02 + h2(b, 5) * .08, hh = lerp(hMin, hMax, h2(b, 7)), lean = (.15 + h2(b, 9) * .5) * spread, ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, pz = ca;
    for (let s = 0; s <= seg; s++) { const t = s / seg, c = rad + lean * t * t * hh, cx = ca * c, cz = sa * c, cy = hh * t, ww = w * (1 - t * .92) * .5, sh = .45 + .85 * t;
      pos.push(cx - px * ww, cy, cz - pz * ww, cx + px * ww, cy, cz + pz * ww); col.push(sh * .8, sh, sh * .65, sh * .8, sh, sh * .65);
      if (s > 0) { const a = n - 2, d = n; idx.push(a, a + 1, d, a + 1, d + 1, d); } n += 2; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nm = []; for (let i = 0; i < pos.length / 3; i++) nm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nm, 3)); g.setIndex(idx); return g;
}
const gTuft = tuftGeo(6, .45, 1.0, .09, 3, 1.2);
const gFern = (() => {                 // arching fronds with a serrated edge
  const pos = [], col = [], idx = []; let n = 0; const F = 8, seg = 7;
  for (let f = 0; f < F; f++) { const ang = f / F * Math.PI * 2 + h2(f, 1) * .4, ca = Math.cos(ang), sa = Math.sin(ang), L = .9 + h2(f, 2) * .5;
    for (let s = 0; s <= seg; s++) { const t = s / seg, r = L * t * .9, y = L * (1.15 * t - .9 * t * t) + .08, ww = (.12 + .1 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (s % 2 ? 1 : .6) * (1 - t * .7), px = -sa, pz = ca, sh = .5 + .7 * t;
      pos.push(ca * r - px * ww, y, sa * r - pz * ww, ca * r + px * ww, y, sa * r + pz * ww); col.push(sh * .8, sh, sh * .7, sh * .8, sh, sh * .7); if (s > 0) { const a = n - 2, d = n; idx.push(a, a + 1, d, a + 1, d + 1, d); } n += 2; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nm = []; for (let i = 0; i < pos.length / 3; i++) nm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nm, 3)); g.setIndex(idx); return g;
})();
const gLian = (() => { const g = new THREE.CylinderGeometry(.5, .35, 1, 5, 6, true); g.translate(0, -.5, 0); return paintVC(g, (x, y) => { const s = .6 + .5 * (1 + y); return [s * .8, s, s * .7]; }); })();
const gLogBody = (() => { const g = new THREE.CylinderGeometry(.5, .5, 1, 16, 8, true); g.rotateX(Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x), k = 1 + (vn(a * 2.2 + 3, z * 5) - .5) * .12 + Math.sin(a * 7) * .03; p.setX(i, x * k); p.setY(i, y * k); }
  return paintVC(g, (x, y, z) => { const a = Math.atan2(y, x), s = .7 + .45 * vn(a * 3 + 2, z * 3.5) * (.75 + .25 * Math.sin(a * 11)); return [s, s * .96, s * .9]; }); })();
const gLeafCard = new THREE.CircleGeometry(.5, 4);

/* ---- particles: two instanced billboard pools (normal = dust / mud, additive = sparkles / glow), per-particle alpha ---- */
const PMAX = 240, camQ = new THREE.Quaternion();
function mkPool(add, tex) {
  const geo = new THREE.PlaneGeometry(1, 1), al = new THREE.InstancedBufferAttribute(new Float32Array(PMAX), 1); geo.setAttribute('aA', al);
  const m = reg(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: add ? THREE.AdditiveBlending : 1 }));
  m.onBeforeCompile = sh => { sh.vertexShader = 'attribute float aA; varying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vA=aA;');
    sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a*=vA;'); };
  m.customProgramCacheKey = () => 'part';
  const mesh = new THREE.InstancedMesh(geo, m, PMAX); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.setColorAt(0, _c.set('#ffffff')); scene.add(mesh); return { mesh, al, list: [], add };
}
const poolN = mkPool(false, texSoft), poolA = mkPool(true, texStar);
function emit(pool, x, y, z, vx, vy, vz, life, size, color, grav, drag, grow) {
  if (pool.list.length >= Math.min(PMAX, QL().pmax)) return;
  pool.list.push({ x, y, z, vx, vy, vz, life, max: life, size, c: new THREE.Color(color), grav: grav || 0, drag: drag || 0, grow: grow || 0 });
}
const _o = new THREE.Object3D(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
function updatePool(pool, dt) {
  const L = pool.list; let n = 0;
  for (let i = L.length - 1; i >= 0; i--) { const q = L[i]; q.life -= dt; if (q.life <= 0) { L[i] = L[L.length - 1]; L.pop(); } }
  for (let i = 0; i < L.length; i++) { const q = L[i], t = q.life / q.max;
    q.vy -= q.grav * dt; const d = Math.max(0, 1 - q.drag * dt); q.vx *= d; q.vy *= d; q.vz *= d; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    const s = q.size * (1 + q.grow * (1 - t)); _o.position.set(q.x, q.y, q.z); _o.quaternion.copy(camQ); _o.scale.set(s, s, s); _o.updateMatrix();
    pool.mesh.setMatrixAt(n, _o.matrix); pool.mesh.setColorAt(n, q.c); pool.al.array[n] = Math.min(1, t * 2.2) * (pool.add ? 1 : .8); n++; }
  pool.mesh.count = n; pool.mesh.instanceMatrix.needsUpdate = true; if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true; pool.al.needsUpdate = true;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function fxDust(x, y, n, spread, up, col) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) emit(poolN, x + rnd(-.3, .3), y + .1, rnd(-.2, .5), rnd(-spread, spread), rnd(.2, up), rnd(0, .8), rnd(.35, .7), rnd(.35, .7), col || '#c9b48a', -.3, 2.2, 1.6); }
function fxSpark(x, y, n, col, speed, z) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(.3, 1) * speed; emit(poolA, x, y, z === undefined ? .3 : z, Math.cos(a) * s, Math.sin(a) * s + 1, rnd(-.5, .5), rnd(.4, .9), rnd(.25, .55), col, 5, 1.5, -.4); } }
function fxMud(x, y, n, speed, col) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) emit(poolN, x + rnd(-.4, .4), y, rnd(0, .6), rnd(-1, 1) * speed, rnd(.4, 1) * speed * 1.3, rnd(-.5, .5), rnd(.5, .9), rnd(.3, .55), col || '#4a3322', 14, .8, .5); }
function fxBurst(x, y, n, col, speed) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(.4, 1) * speed; emit(i % 2 ? poolN : poolA, x, y, rnd(0, .6), Math.cos(a) * s, Math.sin(a) * s + 1.5, rnd(-1, 1), rnd(.5, 1.1), rnd(.4, .8), i % 3 ? col : '#ffe8a0', 6, 1.2, .6); } }
let shake = 0; const addShake = a => { shake = Math.min(1.2, Math.max(shake, a)); };

/* ======================= ART BUILDERS (code-only; any one can be swapped for other art) =======================
   Contract: every builder returns { root: THREE.Group, ...handles }. The per-frame code only touches the handles named in each builder
   (limb pivots, jaw, wings...). Meshes are created with mk(); shadows are on by default. */
function mk(geo, mat, x, y, z, sx, sy, sz, parent, noShadow) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (parent) parent.add(m);
  if (!noShadow) { m.castShadow = true; m.receiveShadow = true; } return m;
}
const box = (c, x, y, z, w, h, d, par) => mk(gBox, M(c), x, y, z, w, h, d, par);
const rot = (m, x, y, z) => { m.rotation.set(x || 0, y || 0, z || 0); return m; };
const MV = (hex, flat, side) => { const k = 'mv' + hex + (flat ? 'F' : '') + (side ? 'D' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshLambertMaterial({ color: hex, vertexColors: true, flatShading: !!flat, side: side ? THREE.DoubleSide : 0 }))); };

/* ---- approved mudmode art textures (art/tex.js): tileable 256px JPEGs embedded as data URIs, because browsers refuse to
   upload file:// images to WebGL. Each one is projected in world (or object) space with a triplanar blend and multiplied
   into the existing colours, normalised by its average brightness, so the lighting and palette stay as they were. ---- */
const ART = window.JR_TEX || {}, ARTAVG = window.JR_TEXAVG || {}, uArt = { value: 0 }, artU = {};
{ const keys = Object.keys(ART); let n = 0;
  for (const k of keys) { artU[k] = { value: null }; const im = new Image();
    im.onload = () => { const t = new THREE.CanvasTexture(im); t.wrapS = t.wrapT = 1000; t.colorSpace = THREE.SRGBColorSpace;   // 1000 = THREE.RepeatWrapping (not exported by the slim bundle)
      if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); artU[k].value = t; if (++n === keys.length) uArt.value = 1; };
    im.src = ART[k]; } }
const artGain = k => (1 / Math.max(.05, (ARTAVG[k] || [0, 0, 0, .5])[3])).toFixed(3);
const artTri = (u, sc) => 'artTri(' + u + ',vArtP*' + sc + ',vArtW)';
// layers: [{ t: texture key, sc: tiles per world unit, st: strength 0..1, flow: optional 'vec2' GLSL offset, w: optional GLSL weight expr }]
function artify(m, key, layers, objSpace) {
  const prevC = m.onBeforeCompile, prevK = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => { if (prevC) prevC.call(m, sh, r);
    sh.uniforms.uArt = uArt; sh.uniforms.uTime = uTime; layers.forEach((L, i) => { sh.uniforms['tArt' + i] = artU[L.t] || { value: null }; });
    const attr = layers.some(L => L.w === 'vPath');
    sh.vertexShader = 'varying vec3 vArtP; varying vec3 vArtN;' + (attr ? ' attribute float aPath; varying float vPath;' : '') + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vec4 aP=vec4(position,1.); vec3 aN=normal;\n' +
      (objSpace ? '' : '#ifdef USE_INSTANCING\n aP=instanceMatrix*aP; aN=mat3(instanceMatrix)*aN;\n#endif\n aP=modelMatrix*aP; aN=mat3(modelMatrix)*aN;\n') + ' vArtP=aP.xyz; vArtN=aN;' + (attr ? ' vPath=aPath;' : ''));
    let f = ' { vec3 vArtW=pow(abs(normalize(vArtN)),vec3(4.)); vArtW/=vArtW.x+vArtW.y+vArtW.z+1e-4; vec3 aD=vec3(1.);\n';
    layers.forEach((L, i) => { const tx = artTri('tArt' + i, L.sc.toFixed(3) + (L.flow ? '+vec3(' + L.flow + ')' : '')), d = 'mix(vec3(1.),' + tx + '*' + artGain(L.t) + ',' + L.st.toFixed(2) + '*uArt)';
      f += L.w ? '  aD=mix(aD,' + d + ',' + L.w + ');\n' : '  aD*=' + d + ';\n'; });
    f += '  diffuseColor.rgb*=aD; }\n';
    sh.fragmentShader = 'uniform float uArt;' + (sh.fragmentShader.includes('uniform float uTime') ? '' : ' uniform float uTime;') + ' varying vec3 vArtP; varying vec3 vArtN;' + (attr ? ' varying float vPath;' : '') + layers.map((L, i) => ' uniform sampler2D tArt' + i + ';').join('') +
      '\nvec3 artTri(sampler2D t,vec3 q,vec3 w){ return texture2D(t,q.zy).rgb*w.x+texture2D(t,q.xz).rgb*w.y+texture2D(t,q.xy).rgb*w.z; }\n' +
      sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + f);
  };
  m.customProgramCacheKey = () => (prevK ? prevK.call(m) : '') + '|art:' + key; return m;
}
const AM = {      // textured materials (separate from the colour caches so untextured props keep their look)
  groundTop: artify(reg(new THREE.MeshLambertMaterial({ vertexColors: true })), 'gt', [{ t: 'leaf', sc: .42, st: .55 }, { t: 'path', sc: .45, st: .72, w: 'vPath' }]),
  bank: artify(reg(new THREE.MeshLambertMaterial({ vertexColors: true })), 'bk', [{ t: 'leaf', sc: .32, st: .5 }]),
  dirt: artify(reg(new THREE.MeshLambertMaterial({ color: '#8a6040', vertexColors: true })), 'dt', [{ t: 'mud', sc: .3, st: .55 }]),
  bark: artify(reg(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })), 'bt', [{ t: 'bark', sc: .45, st: .9 }]),
  barkPlain: artify(reg(new THREE.MeshLambertMaterial({ color: '#ffffff' })), 'bp', [{ t: 'bark', sc: .5, st: .9 }]),
  barkBranch: artify(reg(new THREE.MeshLambertMaterial({ color: '#7d5a38', vertexColors: true })), 'bb', [{ t: 'bark', sc: .6, st: .9 }]),
  stone: artify(reg(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true })), 'st', [{ t: 'stone', sc: .7, st: .85 }]),
  rim: artify(reg(new THREE.MeshLambertMaterial({ color: '#8a8070', flatShading: true })), 'sr', [{ t: 'stone', sc: .7, st: .85 }]),
  bossRock: artify(reg(new THREE.MeshLambertMaterial({ color: '#7a7462', flatShading: true })), 'sb', [{ t: 'stone', sc: .5, st: .85 }]),
  canopy: (() => { const m = []; for (const sd of ['#2f7a3f', '#3d8f45', '#256a48']) m.push(artify(reg(new THREE.MeshLambertMaterial({ color: sd, vertexColors: true, flatShading: true })), 'cp' + sd, [{ t: 'leaf', sc: .5, st: .7 }])); return m; })()
};
artify(mats.leaf, 'lf', [{ t: 'leaf', sc: 1.3, st: .75 }], true);
artify(mats.water, 'sw', [{ t: 'swamp', sc: .22, st: .85, flow: 'uTime*.035,0.,uTime*.02' }]); mats.water.color.set('#3f7f74');
artify(mats.tar, 'md', [{ t: 'mud', sc: .2, st: .45, flow: 'uTime*.01,0.,uTime*.006' }]); mats.tar.color.set('#3a2a1e');
artify(mats.mire, 'mr', [{ t: 'mud', sc: .14, st: .5, flow: 'uTime*.015,0.,uTime*.01' }]); mats.mire.color.set('#6a5238');
const gScarf = new THREE.TorusGeometry(.5, .15, 8, 20); gScarf.rotateX(Math.PI / 2);
const gCirc = new THREE.CircleGeometry(.5, 18);
const blobMat = () => reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#000000', transparent: true, opacity: .45, depthWrite: false, fog: false })), blobShared = blobMat();   // crawlers + logs share one; the hero's is its own
const blobShadow = (par, y, size, own) => { const m = mk(gFlat, own ? blobMat() : blobShared, 0, y, 0, size, 1, size, par, true); m.userData.blob = true; m.visible = !QL().shadows; return m; };

/* ---- HERO: robot hero (approved design: glass dome, seedling, telescoping pipe arms), low-poly in code. Faces +x. ---- */
function buildHero() {   // robot hero (approved design, adapted to low-poly 3D in code). Faces +x; +z is its right side. Swap this whole function to change the hero art.
  const root = new THREE.Group(), bod = new THREE.Group(); root.add(bod);
  // colours from the approved hero swatch (exact hex values)
  const C = { cu: '#bf5c40', cuD: '#7d3a2a', teal: '#3ca79f', tealD: '#267975', boot: '#bf6247', steel: '#777772', glass: '#ceefee', eye: '#f1de4d', leaf: '#66904b', soil: '#492f29', ink: '#1e1816' };
  // metalness is lower than the swatch notes (.5 / .3): with no environment map, metal just goes dark here
  const SM = (hex, r, m, e) => reg(new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: m, emissive: hex, emissiveIntensity: e }));   // a touch of self-light keeps the bold swatch colours readable in the jungle shade
  const copper = SM(C.cu, .5, .12, .16), copperD = SM(C.cuD, .55, .12, .1), teal = SM(C.teal, .6, .08, .14), tealD = SM(C.tealD, .6, .08, .1), steel = SM(C.steel, .45, .3, .08);
  const boot = SM(C.boot, .9, 0, .14), soil = M(C.soil), leaf = M(C.leaf), leafD = M('#4f7339'), mud = M('#4a3226'), tape = M('#e8d9b0'), pad = M('#cdb07a'), worm = M('#d98a8f');
  const glass = reg(new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: .35, roughness: .1, metalness: 0, depthWrite: false }));
  const lens = reg(new THREE.MeshStandardMaterial({ color: C.eye, emissive: C.eye, emissiveIntensity: 1, roughness: .3, metalness: 0 }));
  const ink = reg(new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }));
  const crack = reg(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55, depthWrite: false }));
  const h = { root, bod, eyes: [], lids: [], tails: [], lens, ink: [] };
  const line = (m, t) => { const o = new THREE.Mesh(m.geometry, ink); o.position.copy(m.position); o.rotation.copy(m.rotation);   // inverted-hull ink outline
    o.scale.copy(m.scale).multiplyScalar(1 + t); m.parent.add(o); h.ink.push(o); return m; };
  let sd = 9406; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const onSurf = (mesh, par, dir, r, spin) => { const d = dir.clone().normalize(); mesh.position.copy(d).multiplyScalar(r);   // stick a flat piece onto a curved surface
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); if (spin) mesh.rotateZ(spin); par.add(mesh); return mesh; };
  // squat copper can: lathe profile with a rounded bottom (hip section)
  const can = new THREE.LatheGeometry([[0, 0], [.3, .015], [.47, .07], [.57, .17], [.62, .32], [.63, .5], [.63, 1.04], [.6, 1.07], [0, 1.07]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
  line(mk(can, copper, 0, .72, 0, 1, 1, 1, bod), .045);
  mk(new THREE.TorusGeometry(.625, .03, 5, 26), copperD, 0, 1.06, 0, 1, 1, 1, bod, true).rotation.x = Math.PI / 2;                                     // hip seam ring
  // front: curved teal chest panel + rivets + diagonal band-aid patch (off-centre, the joke)
  const panel = new THREE.CylinderGeometry(.655, .655, .56, 8, 1, true, Math.PI / 2 - .55, 1.1); mk(panel, teal, 0, 1.36, 0, 1, 1, 1, bod);
  mk(new THREE.CylinderGeometry(.648, .648, .64, 8, 1, true, Math.PI / 2 - .62, 1.24), tealD, 0, 1.36, 0, 1, 1, 1, bod);
  for (const [y, a] of [[1.6, .48], [1.6, -.48], [1.12, .48], [1.12, -.48]]) mk(gSph, copperD, Math.cos(a) * .66, y, Math.sin(a) * .66, .06, .06, .06, bod, true);
  const ba = new THREE.Group(); onSurf(ba, bod, new THREE.Vector3(.95, 0, .3), .67, .6); ba.position.y += 1.4;
  mk(gBox, tape, 0, 0, 0, .34, .11, .02, ba, true); mk(gBox, pad, 0, 0, .012, .11, .1, .02, ba, true);
  // chest hatch (buddy opens it in the super cutscene): a curved door hinged on its far edge over a dark opening; the band-aid rides on the door
  const hatch = new THREE.Group(); hatch.position.set(.619, 1.36, -.262); bod.add(hatch); h.hatch = hatch;
  const hg = new THREE.CylinderGeometry(.672, .672, .42, 6, 1, true, Math.PI / 2 - .4, .8); hg.translate(-.619, 0, .262);
  mk(hg, reg(new THREE.MeshStandardMaterial({ color: C.teal, roughness: .6, metalness: .08, emissive: C.teal, emissiveIntensity: .14, side: THREE.DoubleSide })), 0, 0, 0, 1, 1, 1, hatch, true);
  mk(gSph, copperD, .06, 0, .46, .07, .07, .07, hatch, true);   // knob near the free edge
  h.hole = mk(new THREE.CylinderGeometry(.664, .664, .4, 6, 1, true, Math.PI / 2 - .39, .78), reg(new THREE.MeshBasicMaterial({ color: '#160d09' })), 0, 1.36, 0, 1, 1, 1, bod, true); h.hole.visible = false;
  h.chest = new THREE.Object3D(); h.chest.position.set(.66, 1.36, 0); bod.add(h.chest);
  ba.position.x *= 1.025; ba.position.z *= 1.025; root.updateMatrixWorld(true); hatch.attach(ba);
  // side seam with rivets (right side) and a teal button; back: square plate with a pale diamond
  mk(gBox, copperD, .12, 1.3, .625, .03, .86, .02, bod, true); for (let i = 0; i < 4; i++) mk(gSph, copperD, .16, .98 + i * .2, .62, .05, .05, .05, bod, true);
  mk(gCyl, teal, .3, 1.62, .55, .1, .04, .1, bod, true).rotation.set(Math.PI / 2, 0, -.5);
  mk(gBox, copperD, -.61, 1.35, 0, .05, .5, .5, bod); mk(gBox, tape, -.645, 1.35, 0, .02, .22, .22, bod, true).rotation.x = Math.PI / 4;
  for (const [y, z] of [[1.56, .2], [1.56, -.2], [1.14, .2], [1.14, -.2]]) mk(gSph, copper, -.645, y, z, .05, .05, .05, bod, true);
  for (let i = 0; i < 9; i++) { const a = rr() * 6.28, y = .82 + rr() * .9; mk(gSph, mud, Math.cos(a) * .63, y, Math.sin(a) * .63, .07 + rr() * .07, .05, .07 + rr() * .05, bod, true); }   // mud specks
  mk(gCyl, tealD, 0, 1.79, 0, 1.2, .08, 1.2, bod);                                                                    // collar ring
  // legs: short steel pipes + chunky clay boots (ankle pivots keep the soles flat-ish); a mud worm lives in the left boot
  const leg = z => { const j = new THREE.Group(); j.position.set(0, .8, z); bod.add(j);
    mk(gSph, steel, 0, 0, 0, .17, .17, .17, j); mk(capG(.065, .26), steel, 0, -.2, 0, 1, 1, 1, j);
    const an = new THREE.Group(); an.position.set(0, -.4, 0); j.add(an);
    line(mk(gCyl, boot, 0, -.02, 0, .4, .24, .4, an), .07); line(mk(gSph, boot, .1, -.2, 0, .74, .38, .5, an), .05);
    mk(gSph, boot, .3, -.17, 0, .3, .26, .4, an); mk(gBox, soil, .1, -.37, 0, .62, .04, .36, an, true);
    for (let i = 0; i < 3; i++) mk(gSph, mud, .1 + rr() * .3 - .1, -.2 + rr() * .1, z > 0 ? .24 : -.24, .07, .05, .03, an, true);
    j.userData.an = an; return j; };
  h.legR = leg(.3); h.legL = leg(-.3); h.ankR = h.legR.userData.an; h.ankL = h.legL.userData.an;
  const wm = new THREE.Group(); wm.position.set(-.05, .1, -.12); h.ankL.add(wm); h.worm = [];
  let wp = wm; for (let i = 0; i < 3; i++) { const s = new THREE.Group(); s.position.y = i ? .09 : 0; wp.add(s); mk(capG(.035, .07), worm, 0, .05, 0, 1, 1, 1, s, true); h.worm.push(s); wp = s; }
  mk(gSph, M('#1e1816'), .03, .06, .02, .02, .02, .02, wp, true);
  // arms: copper shoulder sleeve, steel pipe, copper cuff, plain copper ball hand. arm = swing pivot (z), sp = splay (x)
  const arm = z => { const j = new THREE.Group(); j.position.set(0, 1.56, z); bod.add(j); const sp = new THREE.Group(); j.add(sp);
    line(mk(gCyl, copper, 0, 0, 0, .28, .22, .28, sp), .08).rotation.x = Math.PI / 2;
    const pipe = mk(gCyl, steel, 0, -.33, z > 0 ? .04 : -.04, .1, .42, .1, sp);                                      // longer steel pipe; telescopes out on a vine (syncHero)
    const ext = new THREE.Group(); sp.add(ext);
    mk(gCyl, copper, 0, -.56, z > 0 ? .05 : -.05, .2, .1, .2, ext); line(mk(gSph, copper, 0, -.74, z > 0 ? .05 : -.05, .42, .42, .42, ext), .07);
    const hand = new THREE.Object3D(); hand.position.set(0, -.74, z > 0 ? .05 : -.05); ext.add(hand);   // the rope leaves from here
    j.userData.sp = sp; j.userData.pipe = pipe; j.userData.ext = ext; j.userData.hand = hand; return j; };
  h.armR = arm(.72); h.armL = arm(-.72); h.splR = h.armR.userData.sp; h.splL = h.armL.userData.sp;
  // head: wide teal band, rivet rows, side bolt caps, two big glowing lenses with steel bezels and teal lids
  const head = new THREE.Group(); head.position.set(0, 2.1, 0); bod.add(head); h.head = head;
  line(mk(gCyl, teal, 0, 0, 0, 1.5, .58, 1.5, head), .035);
  mk(gCyl, tealD, 0, .27, 0, 1.53, .06, 1.53, head); mk(gCyl, tealD, 0, -.27, 0, 1.53, .06, 1.53, head);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + .1; for (const y of [.2, -.2]) mk(gSph, copperD, Math.cos(a) * .755, y, Math.sin(a) * .755, .045, .045, .045, head, true); }
  for (const s of [1, -1]) { line(mk(gCyl, copper, 0, 0, s * .76, .3, .1, .3, head), .08).rotation.x = Math.PI / 2; mk(gCyl, copperD, 0, 0, s * .81, .14, .03, .14, head, true).rotation.x = Math.PI / 2; }
  for (const s of [1, -1]) { const a = s * .46, e = new THREE.Group(); e.position.set(Math.cos(a) * .72, -.01, Math.sin(a) * .72); e.rotation.y = -a; head.add(e);
    mk(new THREE.TorusGeometry(.22, .04, 6, 20), steel, .02, 0, 0, 1, 1, 1, e, true).rotation.y = Math.PI / 2; mk(gSph, lens, .03, 0, 0, .14, .42, .42, e, true);
    const lid = new THREE.Group(); lid.position.set(.09, 0, 0); e.add(lid);
    const ld = mk(new THREE.CircleGeometry(.25, 14, 0, Math.PI), tealD, 0, 0, 0, 1, 1, 1, lid, true); ld.rotation.y = Math.PI / 2; ld.material = reg(new THREE.MeshStandardMaterial({ color: C.tealD, roughness: .6, metalness: .3, side: THREE.DoubleSide }));
    lid.userData.s = s; h.eyes.push(e); h.lids.push(lid); }
  // crack in the band on the back-left (darker humour: it has been through things)
  mk(gBox, M(C.ink), -.4, .05, -.62, .02, .2, .02, head, true).rotation.set(0, .6, .5);
  // glass dome with a soil heap and the two-leaf seedling; a taped crack on the right-front
  mk(gCyl, soil, 0, .3, 0, 1.5, .06, 1.5, head, true);
  const heap = new THREE.IcosahedronGeometry(.5, 1); { const p = heap.attributes.position; for (let i = 0; i < p.count; i++) { const k = .85 + (Math.sin(p.getX(i) * 31 + p.getZ(i) * 17) * .5 + .5) * .3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } heap.computeVertexNormals(); }
  mk(heap, MS(C.soil, 1, 0, 0, true), 0, .36, 0, 1.25, .5, 1.25, head);
  const sp = new THREE.Group(); sp.position.set(-.05, .5, -.05); sp.scale.setScalar(1.75); head.add(sp); h.sprout = sp;
  mk(capG(.03, .3), leaf, 0, .17, 0, 1, 1, 1, sp); const lg = s => { const g = new THREE.Group(); g.position.set(0, .36, 0); g.rotation.x = s * .9; sp.add(g);
    line(mk(gSph, s > 0 ? leaf : leafD, 0, .02, s * .19, .32, .06, .36, g, true), .025); return g; };
  h.leafR = lg(1); h.leafL = lg(-1);
  const dome = new THREE.SphereGeometry(.77, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);   // a little bigger than before so the bigger seedling fits
  mk(dome, glass, 0, .3, 0, 1, 1.3, 1, head, true); mk(new THREE.TorusGeometry(.775, .035, 5, 28), steel, 0, .3, 0, 1, 1, 1, head, true).rotation.x = Math.PI / 2;
  const up = (a, b) => new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b) * 1.3, Math.cos(b) * Math.sin(a));
  for (const [a, b, l, sp_] of [[.75, .6, .24, .4], [.95, .45, .18, -.7], [.6, .35, .16, 1.2], [2.6, .5, .2, .3]]) { const c = onSurf(new THREE.Mesh(gBox, crack), head, up(a, b), .78, sp_); c.scale.set(.012, l, .005); c.position.y += .3; }
  for (const sp_ of [.7, -.7]) { const t = onSurf(new THREE.Mesh(gBox, tape), head, up(.78, .52), .785, sp_); t.scale.set(.06, .24, .006); t.position.y += .3; }
  h.shadow = blobShadow(scene, .06, 1.6, true);                                                         // low-quality contact shadow (also a faint one on high)
  return h;
}

/* ---- CRAWLER: shiny dome beetle on six legs, stalk eyes. Faces +x. ---- */
function buildCrawler() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); const h = { root, body, legs: [], ant: [] };
  mk(gHalf, MS('#6b4023', .4, .15), 0, .12, 0, 1.75, 1.5, 1.5, body);
  mk(gDisc, M('#2a1c13'), 0, .13, 0, 1.7, 1, 1.45, body, true);
  [[-.35, -.25], [-.1, .3], [.15, -.3], [.3, .28], [-.45, .25], [.05, .02]].forEach(([x, z]) => { const y = .12 + .75 * Math.sqrt(Math.max(0, 1 - (x / .87) ** 2 - (z / .75) ** 2)); mk(gSph, M('#e0903f'), x, y - .03, z, .24, .12, .24, body, true); });
  mk(gSph, M('#43301f'), .82, .28, 0, .58, .5, .62, body);
  for (const s of [1, -1]) { mk(gSph, M('#f3e6c4'), .88, .52, s * .2, .22, .24, .2, body, true); mk(gSph, M('#2a1c13'), .97, .54, s * .21, .11, .13, .11, body, true); rot(mk(gCone, M('#d9d0b0'), 1.12, .14, s * .13, .1, .26, .1, body), 0, 0, -Math.PI / 2);
    const a = new THREE.Group(); a.position.set(.95, .52, s * .14); body.add(a); mk(capG(.025, .5), M('#2a1c13'), .18, .22, 0, 1, 1, 1, a).rotation.z = -.5; h.ant.push(a); }
  [-.45, 0, .45].forEach(x => { for (const s of [1, -1]) { const p = new THREE.Group(); p.position.set(x, .22, s * .55); body.add(p); const l = new THREE.Group(); l.rotation.x = s * -.8; p.add(l); mk(capG(.055, .38), M('#2a1c13'), 0, -.25, 0, 1, 1, 1, l); h.legs.push({ p, ph: (x > 0) !== (s > 0) ? 0 : Math.PI }); } });
  h.shadow = blobShadow(root, .05, 1.9);
  return h;
}

/* ---- LOG: bark-noise cylinder with ring-pattern end caps, a knot and a moss patch. Rolls around z. ---- */
function buildLog() {
  const root = new THREE.Group(); const h = { root };
  mk(gLogBody, MV('#8c5d33'), 0, 0, 0, 1.4, 1.4, 2.4, root);
  for (const s of [1, -1]) [[1.28, '#c9a06a'], [1.06, '#a97c4a'], [.84, '#c9a06a'], [.6, '#a97c4a'], [.36, '#c9a06a'], [.14, '#8c5d33']].forEach(([r, c], i) => {
    const d = mk(gCirc, M(c), 0, 0, s * (1.2 + .004 * (i + 1)), r, r, 1, root, true); if (s < 0) d.rotation.y = Math.PI; });
  rot(mk(gCyl, M('#6f4624'), .1, .72, .35, .28, .34, .28, root), .3, 0, .2);
  mk(gBlob, MV('#5a9a3e', true), -.1, .62, -.45, .8, .34, .7, root);
  h.shadow = blobShadow(root, -.66, 2.6);
  return h;
}

/* ---- SNAPPER: swamp jaws (lower jaw, hinged upper jaw with teeth + eye bumps); w = slot width in world units ---- */
/* crevasse looks, built in code: lava / fast water at FILL_DEPTH, the giant biter, the tentacles */
function crevFillView(R, v, h, w, cx) {
  const lava = h.fill === 'lava', yS = -TUNE.CREV.FILL_DEPTH * S;
  mk(gFlat, M('#0d0907'), cx, yS - 1.5, 1.5, w, 1, 15, R, true);
  mk(gFlat, lava ? mats.lava : mats.fastWater, cx, yS, 1.5, w, 1, Z_FRONT - Z_BACK, R, true);
  if (lava) { const g = new THREE.Mesh(gQuad, MB('#ff7a2a', .3, true)); g.position.set(cx, yS + 1.1, 2.6); g.scale.set(w + 1, 2.6, 1); R.add(g); }   // heat glow
  v.fills.push({ lava, x: cx, w, y: yS });
}
function buildBiter() {   // a huge dark head with a hinged lower jaw, two rows of teeth and glowing eyes
  const root = new THREE.Group(), h = { root };
  mk(gSph, MS('#3b2f4a', .7, 0), 0, 0, 0, 3.4, 2.6, 2.8, root);
  const jaw = new THREE.Group(); jaw.position.set(0, -.5, -.6); root.add(jaw); h.jaw = jaw;
  mk(gSph, MS('#4a3a5a', .7, 0), 0, -.4, .7, 3.0, 1.1, 2.4, jaw);
  for (let j = 0; j < 6; j++) { const a = -1.15 + j * .46; mk(gCone, M('#f3e6c4'), Math.sin(a) * 1.25, .1, .6 + Math.cos(a) * 1.0, .26, .5, .26, jaw); }
  for (let j = 0; j < 6; j++) { const a = -1.15 + j * .46; mk(gCone, M('#f3e6c4'), Math.sin(a) * 1.35, -.7, Math.cos(a) * 1.15, .28, .55, .28, root).rotation.z = Math.PI; }
  h.eyes = [-1, 1].map(s => mk(gSph, M('#ffd84a', '#ffb020'), s * .9, .65, 1.15, .45, .45, .3, root, true));
  return h;
}
function crevViews(R, v, room) {   // per hole: a biter and / or a tentacle (moved each frame by render)
  room.holes.forEach((h, hi) => {
    if (h.biter) { const b = buildBiter(); b.root.visible = false; R.add(b.root); v.biters.push({ hi, h: b }); }
    if (h.tent) { const n = 10, m = new THREE.InstancedMesh(gSph, MS('#7a3a6e', .55, 0, '#2a0a24'), n); m.frustumCulled = false; m.visible = false; m.castShadow = true;
      R.add(m); v.own.push(m); v.tents.push({ hi, m, n, side: h.tent, ex: h.tent < 0 ? h.x0 : h.x1 }); }
  });
}
let crocOG = false;   // OG world: the crocs wear the code-made skin (set by crocSkinOG)
function crocSkinOG(on) { crocOG = !!on; for (const k of ['skin', 'top', 'jaw', 'lower', 'ridge']) { const m = CROC_MAT[k], s = on ? m.userData.code : m.userData.drawn; if (!s) continue; m.map = s.map; m.color.copy(s.color); m.needsUpdate = true; } }
const CROC_MAT = (() => {   // croc skin: a procedural scale texture (wet mossy scales, darker seams), shared by every croc; the drawn skins in art/croc-tex.js replace it once loaded
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#4d5a2b'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const ox = (y % 2) * 8, px = x * 16 + ox, py = y * 16, k = 70 + ((x * 37 + y * 53) % 30);
    g.fillStyle = 'rgb(' + (k - 8) + ',' + (k + 22) + ',' + (k - 34) + ')'; g.beginPath(); g.ellipse(px % 128 + 8, py + 8, 7, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(28,32,14,.7)'; g.lineWidth = 1.4; g.stroke(); g.fillStyle = 'rgba(200,220,150,.18)'; g.fillRect(px % 128 + 5, py + 4, 4, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = 1000;   /* 1000 = RepeatWrapping (not exported by the slim bundle) */ t.repeat.set(2, 1); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  const tb = t.clone(); tb.repeat.set(1.4, .7); tb.needsUpdate = true;
  const R = { skin: reg(new THREE.MeshStandardMaterial({ map: t, color: '#c8d8a0', roughness: .55, metalness: 0 })), top: reg(new THREE.MeshStandardMaterial({ map: tb, color: '#b8c890', roughness: .5, metalness: 0 })),
    jaw: reg(new THREE.MeshStandardMaterial({ map: tb, color: '#e8e0b0', roughness: .65, metalness: 0 })), scute: M('#3a4520', '', true), belly: M('#d9cf9a'), lower: reg(new THREE.MeshStandardMaterial({ color: '#d9cf9a', roughness: .65, metalness: 0 })), ridge: reg(new THREE.MeshStandardMaterial({ color: '#3a4520', roughness: .6, metalness: 0 })) };
  // the drawn croc skins (art/croc-tex.js): mossy scales on the upper head and body, the pale belly on the lower jaw, the ridge strip down the back.
  // Drawn with flat even light, so they replace the tint (white); the procedural skin above stays until they load (and if the file is missing)
  for (const k of ['skin', 'top', 'jaw', 'lower', 'ridge']) R[k].userData.code = { map: R[k].map, color: R[k].color.clone() };   // the OG world wears this code skin again (crocSkinOG)
  const PK = window.JR_CROC; if (PK) { const load = (src, mats, rp) => { const im = new Image(); im.onload = () => { const tx = new THREE.CanvasTexture(im); tx.wrapS = 1000; tx.wrapT = rp[2] ? 1001 : 1000;   // 1001 = ClampToEdge: the strip repeats sideways only
      tx.repeat.set(rp[0], rp[1]); tx.colorSpace = THREE.SRGBColorSpace; for (const m of mats) { m.userData.drawn = { map: tx, color: new THREE.Color('#ffffff') }; if (!crocOG) { m.map = tx; m.color.set('#ffffff'); m.needsUpdate = true; } } }; im.src = src; };
    load(PK.skin, [R.skin, R.top, R.jaw], [2, 1]); load(PK.belly, [R.lower], [1.4, .7]); /* the hinged upper head wears the scales; the pale belly skin is the lower jaw */ load(PK.ridge, [R.ridge], [3, 1, 1]); }
  return R;
})();
function buildSnapper(w) {   // a croc in a snapper-pool cell: head on top of the water, jaw hinged at the back (same pivot as before), eye bumps, nostrils, scutes
  const root = new THREE.Group(), L = w - .5, h = { root };
  rot(mk(capG(.34, L - .7), CROC_MAT.lower, 0, .2, 0, 1, 1, 2.5, root), 0, 0, Math.PI / 2);                   // lower jaw (wide flat capsule, pale belly skin)
  rot(mk(capG(.22, L * .5), CROC_MAT.lower, L * .18, .34, 0, 1, .7, 2.1, root), 0, 0, Math.PI / 2);            // lower snout, narrower toward the tip
  mk(gFlat, M('#b4443c'), 0, .5, 0, L * .9, 1, 1.45, root, true);                                             // mouth lining
  for (let j = 0; j < 5; j++) mk(gCone, M('#f3e6c4'), -L * .38 + j * L * .19, .6, .78, .15, .32, .15, root);   // top teeth
  for (const s of [1, -1]) mk(gSph, M('#2a1c13'), L * .44, .5, s * .22, .1, .07, .1, root, true);             // nostrils at the tip
  for (let j = 0; j < 3; j++) mk(gCone, CROC_MAT.scute, -L * .35 + j * .32, .62, 0, .18, .22, .18, root);       // scutes on the skull
  const jaw = new THREE.Group(); jaw.position.set(-L / 2, .5, 0); root.add(jaw); h.jaw = jaw;
  rot(mk(capG(.3, L - .7), CROC_MAT.jaw, L / 2, .22, 0, 1, 1, 2.4, jaw), 0, 0, Math.PI / 2);
  for (let j = 0; j < 5; j++) { const t = mk(gCone, M('#f3e6c4'), L * .1 + j * L * .19, -.04, .74, .15, .32, .15, jaw); t.rotation.z = Math.PI; }
  for (const s of [1, -1]) { mk(gSph, CROC_MAT.skin, L * .3, .55, s * .55, .5, .42, .46, jaw); rot(mk(gBox, CROC_MAT.scute, L * .3 - .05, .8, s * .55, .42, .08, .3, jaw), 0, 0, -.25);   // eye bump + brow ridge
    mk(gSph, M('#f3e6c4'), L * .3 + .12, .6, s * .6, .3, .3, .3, jaw, true); }
  h.pa = mk(gSph, M('#2a1c13'), L * .3 + .24, .62, .6, .15, .2, .15, jaw, true); h.pb = mk(gSph, M('#2a1c13'), L * .3 + .24, .62, -.6, .15, .2, .15, jaw, true);
  return h;
}
const cfLine = mk(gCyl, M('#f3e6c4'), 0, 0, 0, .025, 1, .025, null, true);   // fishing line: a thin cylinder (the slim three build has no THREE.Line)
const cfBob = mk(gSph, M('#d9534f', '#601010'), 0, 0, 0, .3, .3, .3, null, true); cfLine.visible = cfBob.visible = false; cfLine.frustumCulled = false; scene.add(cfLine); scene.add(cfBob);

/* ---- GEM: faceted gem, halo and orbiting sparkles (animated in sync) ---- */
function buildGem(kind) {
  const root = new THREE.Group(), col = P.gem[kind], h = { root, stars: [] };
  h.core = mk(gOct, MS(col, .18, .25, col, true), 0, 0, 0, 1.0, 1.6, .9, root); h.core.material = h.core.material.clone(); h.core.material.emissiveIntensity = .45;
  h.halo = new THREE.Mesh(gQuad, matCache['gh' + col] || (matCache['gh' + col] = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: col, transparent: true, opacity: .55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })))); h.halo.scale.set(3.4, 3.4, 1); h.halo.position.z = -.3; h.halo.renderOrder = 4;
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(gQuad, matCache.gemStar || (matCache.gemStar = reg(new THREE.MeshBasicMaterial({ map: texStar, color: '#fff4c8', transparent: true, opacity: .9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })))); s.renderOrder = 4; h.stars.push(s); }
  return h;
}

/* ---- BOSSES: 1 BOGJAW (mire beast, faces +x), 2 GLOOMWING (canopy flyer, faces +x), 3 MUDTOTEM (mud golem, faces -x). ----
   Art redo to the hero's quality, in code. Layout, colours (the approved swatch hex values) and every animated handle
   are kept; the look is new: hero-style ink outline, Standard shading with soft self-light and a rim light, procedural textures.
   How: parts are still placed with mk(), but with a paint BP(hex, layer, ink) instead of a material. bossBake() then merges every static
   part under one pivot into ONE vertex-coloured mesh plus ONE inverted-hull ink mesh (the hero's outline, baked: each part pushed out
   along its smoothed normals), so detail goes up while draw calls go down. Paint layer = texture slot of bossMat (0-2), 3 plain, 4 glowing. */
const bossInk = reg(new THREE.MeshBasicMaterial({ color: '#1e1816', side: THREE.BackSide }));   // the hero's ink colour; one shared material for all bosses
const paintCache = {};
const BP = (hex, layer, ink) => { const k = hex + '|' + layer + '|' + ink; return paintCache[k] || (paintCache[k] = { bk: true, color: new THREE.Color(hex), layer, ink }); };
function bossTex(draw) {      // tileable 256px canvas texture, gain = 1 / mean linear brightness so it only adds detail, not a tint
  const t = mkTex(256, 256, (g, w, h) => { let sd = 1234; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const wrap = fn => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } }; draw(g, w, h, rr, wrap); });
  t.wrapS = t.wrapT = 1000; const d = t.image.getContext('2d').getImageData(0, 0, 256, 256).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += Math.pow((d[i] + d[i + 1] + d[i + 2]) / 765, 2.2);
  t.userData.gain = 65536 / Math.max(1, s); return t;
}
const texScales = bossTex((g, w, h, rr, wrap) => {   // BOGJAW: rows of flat scutes with thin dark wet gaps, pale specks
  g.fillStyle = '#505050'; g.fillRect(0, 0, w, h); const cw = w / 6, ch = h / 8;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const cx = (c + (r % 2) * .5 + .5) * cw + (rr() - .5) * 8, cy = (r + .5) * ch + (rr() - .5) * 6, l = 150 + rr() * 50 | 0, rx = cw * (.36 + rr() * .1), ry = ch * (.34 + rr() * .1);
    wrap(() => { const gr = g.createLinearGradient(0, cy - ry, 0, cy + ry); gr.addColorStop(0, `rgb(${l + 18},${l + 18},${l + 18})`); gr.addColorStop(1, `rgb(${l - 28},${l - 28},${l - 28})`);
      g.fillStyle = gr; g.beginPath(); if (g.roundRect) g.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, rx * .6); else g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }); }
  for (let i = 0; i < 320; i++) { const x = rr() * w, y = rr() * h, s = .5 + rr() * 1.3, l = rr() < .5 ? 225 : 70; wrap(() => { g.fillStyle = `rgba(${l},${l},${l},.45)`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }); }
});
const texFeather = bossTex((g, w, h, rr, wrap) => {   // GLOOMWING: overlapping scalloped feathers with a quill and fine barbs
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h); const cw = w / 6, ch = h / 8;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const cx = (c + (r % 2) * .5 + .5) * cw, cy = (r + .5) * ch, l = 165 + rr() * 50 | 0;
    wrap(() => { const gr = g.createLinearGradient(0, cy - ch * .6, 0, cy + ch * .75); gr.addColorStop(0, `rgb(${l + 30},${l + 30},${l + 30})`); gr.addColorStop(.75, `rgb(${l},${l},${l})`); gr.addColorStop(1, `rgb(${l * .55 | 0},${l * .55 | 0},${l * .55 | 0})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(cx - cw * .55, cy - ch * .7); g.lineTo(cx - cw * .55, cy + ch * .1); g.quadraticCurveTo(cx - cw * .5, cy + ch * .8, cx, cy + ch * .85);
      g.quadraticCurveTo(cx + cw * .5, cy + ch * .8, cx + cw * .55, cy + ch * .1); g.lineTo(cx + cw * .55, cy - ch * .7); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,40,40,.55)'; g.lineWidth = 1.4; g.stroke();
      g.strokeStyle = 'rgba(250,250,250,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, cy - ch * .6); g.lineTo(cx, cy + ch * .75); g.stroke();
      g.strokeStyle = 'rgba(30,30,30,.18)'; g.lineWidth = 1; for (let k = 1; k < 6; k++) { const y = cy - ch * .5 + k * ch * .2; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx - cw * .45, y + ch * .2); g.moveTo(cx, y); g.lineTo(cx + cw * .45, y + ch * .2); g.stroke(); } }); }
});
// boss material: Standard + vertex colour, object-space triplanar texture per paint layer, soft self-light (like the hero's SM) and a rim light
// so the silhouette reads against the jungle. One per boss per room (flashSkins drives its emissive); disposed with the room, never in allMats.
function bossMat(key, layers, o) {   // layers: [{ t: canvas texture or art key, sc: tiles per unit, st: strength, rough?: override }]
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough, metalness: 0 });
  const sh0 = o.sh || [0, 8, [0, 0, 0]], U = { uRimC: { value: new THREE.Color(o.rim) }, uRimK: { value: o.rimK }, uSelf: { value: o.self }, uAn: { value: { x: 0, y: 0, z: 0, w: 0 } }, uDt: { value: new THREE.Vector3() }, uBT: uTime,
    uShK: { value: sh0[0] }, uShP: { value: sh0[1] }, uShM: { value: new THREE.Vector3(...sh0[2]) }, uGr: { value: o.grit || 0 } }; m.userData.U = U;   // sh: [wet/feather sheen strength, tightness, per-layer mask]; grit: stone grain
  layers.forEach((L, i) => { const art = typeof L.t === 'string'; U['tB' + i] = art ? (artU[L.t] || { value: null }) : { value: L.t }; U['gB' + i] = art ? (artU[L.t] ? uArt : { value: 0 }) : { value: 1 }; });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = BANIM_D + 'attribute float aBt; varying float vBt; varying vec3 vBP; varying vec3 vBN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBt=aBt; vBP=position; vBN=normal;\n' + BANIM);
    let f = ' float bDet=1.; { vec3 bw=pow(abs(normalize(vBN)),vec3(4.)); bw/=bw.x+bw.y+bw.z+1e-4; vec3 bd=vec3(1.);\n', r = '';
    layers.forEach((L, i) => { const gain = typeof L.t === 'string' ? artGain(L.t) : L.t.userData.gain.toFixed(3);
      f += '  if(abs(vBt-' + i + '.)<.5) bd=mix(vec3(1.),bTri(tB' + i + ',vBP*' + L.sc.toFixed(3) + ',bw)*' + gain + ',' + L.st.toFixed(2) + '*gB' + i + ');\n';
      if (L.rough !== undefined) r += ' if(abs(vBt-' + i + '.)<.5) roughnessFactor=' + L.rough.toFixed(2) + ';'; });
    f += '  bd*=1.+uGr*step(vBt,.5)*(bHs(floor(vBP*26.))-.5+(bHs(floor(vBP*61.)+7.)-.5)*.6);\n  diffuseColor.rgb*=bd; bDet=dot(bd,vec3(.333)); }\n';   // grit: two scales of grain on the stone layer
    sh.fragmentShader = 'uniform vec3 uRimC; uniform float uRimK; uniform float uSelf; uniform float uShK; uniform float uShP; uniform vec3 uShM; uniform float uGr; varying float vBt; varying vec3 vBP; varying vec3 vBN;' + layers.map((L, i) => ' uniform sampler2D tB' + i + '; uniform float gB' + i + ';').join('') +
      '\nfloat bHs(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }\nvec3 bTri(sampler2D t,vec3 q,vec3 w){ return texture2D(t,q.zy).rgb*w.x+texture2D(t,q.xz).rgb*w.y+texture2D(t,q.xy).rgb*w.z; }\n' +
      sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + f)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + r)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*(uSelf+step(3.5,vBt)*.9)+uRimC*uRimK*pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),3.);\n'
        + ' { vec3 bL=normalize((viewMatrix*vec4(.35,.85,.4,0.)).xyz), bHv=normalize(bL+normalize(vViewPosition)); float bM=vBt<.5?uShM.x:vBt<1.5?uShM.y:vBt<2.5?uShM.z:0.;\n'
        + '   totalEmissiveRadiance+=vec3(1.,.97,.9)*uShK*bM*pow(max(dot(normalize(normal),bHv),0.),uShP)*clamp(bDet*1.3-.15,0.,1.4); }');   // sheen from a fixed key light, strongest on the raised texture (wet scutes, feather vanes)
  };
  m.customProgramCacheKey = () => 'boss:' + key; return m;
}
const _bkM = new THREE.Matrix4(), _bkI = new THREE.Matrix4(), _bkC = new THREE.Color(), _bkV = new THREE.Vector3(), _bkW = new THREE.Vector3();
// ---- depth + character pass: sculpted forms (vertex displacement on denser shapes), bevelled stone, contact shading baked
// into the vertex colour, varied ink weight, and idle face animation done in the vertex shader. Everything still bakes to the same meshes,
// so the draw calls stay as they were; the extra cost is triangles. ----
const gSphH = new THREE.SphereGeometry(.5, 28, 18), gSphM = new THREE.SphereGeometry(.5, 18, 12), gHalfL = new THREE.SphereGeometry(.5, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2), gConeH = new THREE.ConeGeometry(.5, 1, 14, 4);
const capHC = {}, capH = (r, len) => capHC[r + '_' + len] || (capHC[r + '_' + len] = new THREE.CapsuleGeometry(r, len, 7, 22));
const boxHC = {}, boxHG = (sx, sy, sz) => { const s = v => Math.max(2, Math.round(v * 2.6)), k = s(sx) + '_' + s(sy) + '_' + s(sz);   // subdivided unit box (enough vertices to bevel and carve), shared
  if (!boxHC[k]) { boxHC[k] = new THREE.BoxGeometry(1, 1, 1, s(sx), s(sy), s(sz)); boxHC[k].userData.box = true; } return boxHC[k]; };
gBox.userData.box = true;
const bH = (a, b, c) => { let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function bN(x, y, z) {   // value noise, -1..1
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), s = t => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(bH(xi, yi, zi), bH(xi + 1, yi, zi), u), L(bH(xi, yi + 1, zi), bH(xi + 1, yi + 1, zi), u), v),
    L(L(bH(xi, yi, zi + 1), bH(xi + 1, yi, zi + 1), u), L(bH(xi, yi + 1, zi + 1), bH(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
}
const bF = (x, y, z) => bN(x, y, z) * .55 + bN(x * 2.03 + 5.1, y * 2.03, z * 2.03) * .3 + bN(x * 4.1, y * 4.1 + 9.3, z * 4.1) * .15;
function bW(x, y, z) {   // cellular noise: distance to the nearest and second nearest jittered point
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let d1 = 9, d2 = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const cx = xi + i, cy = yi + j, cz = zi + k;
    const dx = cx + .15 + bH(cx, cy, cz) * .7 - x, dy = cy + .15 + bH(cy + 7, cz, cx) * .7 - y, dz = cz + .15 + bH(cz + 3, cx, cy + 5) * .7 - z, d = dx * dx + dy * dy + dz * dz;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return [Math.sqrt(d1), Math.sqrt(d2)];
}
const SCULPT = {   // displacement shapes, about -1..1 (times the part's amplitude), sampled in the boss's own space so they run on across parts
  bump: (x, y, z, f) => bF(x * f, y * f, z * f),
  scale: (x, y, z, f) => { const w = bW(x * f, y * f * 1.2, z * f); return Math.min(1, (w[1] - w[0]) * 2.6) * 2 - 1 + bN(x * f * 3, y * f * 3, z * f * 3) * .2; },   // raised plates, sunk wet gaps
  bands: (x, y, z, f) => 1 - 2 * Math.pow(1 - Math.abs(Math.sin(y * f * Math.PI)), 12) + bN(x * 3, y * 3, z * 3) * .15,   // belly plates with sunk seams
  stone: (x, y, z, f) => { const r = 1 - Math.abs(bN(x * f * .8 + 3, y * f * .8, z * f * .8)); return bF(x * f, y * f, z * f) * .7 - Math.pow(r, 7) * 1.6 + .25; },   // lumpy, with sharp cracks
  strata: (x, y, z, f) => { const s = y * f + bN(x * .9, y * .3, z * .9) * .6, q = s - Math.floor(s); return (q < .12 ? -1.6 : .35) + bF(x * 2.2, y * 2.2, z * 2.2) * .55; },   // layered sediment: sunk bedding lines, rough between
  feather: (x, y, z, f, o) => { const c = o.c || [0, 0], u = Math.atan2(z - c[1], x - c[0]) * (o.ur || 1.5), t = y * f + .32 * Math.abs(Math.sin(u * f * 1.1 + Math.floor(y * f) * 1.9)) + bN(x * 2, y * 2, z * 2) * .22;
    return 1 - 2 * (t - Math.floor(t)); }   // tiers of overlapping feathers: each tip sits proud of the row below
};
const gSphL = new THREE.SphereGeometry(.5, 8, 5), gFeat = new THREE.ConeGeometry(.5, 1, 7, 1); gFeat.rotateX(Math.PI / 2);   // gFeat: a pointed feather tile, tip down the skin
function bShingle(par, paint, c, r, rows, cols, th0, th1, ph0, ph1, sz, o) {   // overlapping tiles (feathers, scutes) laid over an ellipsoid; each tile's lower edge is lifted, like a roof
  o = o || {};
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const ph = ph0 + (ph1 - ph0) * (rows > 1 ? i / (rows - 1) : .5), th = th0 + (th1 - th0) * (j + (i % 2) * .5) / cols, cp = Math.cos(ph), sp = Math.sin(ph), ct = Math.cos(th), st = Math.sin(th);
    const n = new THREE.Vector3(cp * ct / r[0], sp / r[1], cp * st / r[2]).normalize(), fl = new THREE.Vector3(...(o.flow || [0, -1, 0])).normalize(), t = fl.clone().addScaledVector(n, -n.dot(fl)).normalize();
    const up = n.clone().addScaledVector(t, o.lift === undefined ? .35 : o.lift).normalize(), bx = new THREE.Vector3().crossVectors(up, t).normalize(), tz = new THREE.Vector3().crossVectors(bx, up), k = 1 + (bH(i, j, 9) - .5) * .25;
    const m = (o.an ? bAn : (q => q))(mk(o.geo || gSphL, typeof paint === 'function' ? paint(i, j) : paint, c[0] + r[0] * cp * ct + n.x * (o.out || 0) + t.x * sz[2] * .2, c[1] + r[1] * sp + n.y * (o.out || 0) + t.y * sz[2] * .2, c[2] + r[2] * cp * st + n.z * (o.out || 0) + t.z * sz[2] * .2, sz[0] * k, sz[1], sz[2] * k, par), ...(o.an || []));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, up, tz)); }
}
const bSc = (m, o) => { m.userData.sc = o; return m; };            // sculpt a part: { k: shape, a: amplitude, f: frequency, bev: stone bevel, dent: [[x, y, z, r, depth]] }
const bAn = (m, grp, w) => { m.userData.an = [grp, w]; return m; };  // idle animation group: 1 breathe, 2/3 brows, 4 lids (blink), 5 eyes (dart), 6 sway, 7 ruffle; w = travel (or fn(x, y, z) per vertex)
function bevelBox(g, s, r) {   // round off a unit box's edges in its scaled space (a chiselled chamfer on the subdivided boxes)
  const p = g.attributes.position, hx = Math.max(0, s.x / 2 - r), hy = Math.max(0, s.y / 2 - r), hz = Math.max(0, s.z / 2 - r), cl = (v, h) => Math.max(-h, Math.min(h, v));
  for (let i = 0; i < p.count; i++) { const qx = p.getX(i) * s.x, qy = p.getY(i) * s.y, qz = p.getZ(i) * s.z, ix = cl(qx, hx), iy = cl(qy, hy), iz = cl(qz, hz), dx = qx - ix, dy = qy - iy, dz = qz - iz, l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) p.setXYZ(i, (ix + dx / l * r) / s.x, (iy + dy / l * r) / s.y, (iz + dz / l * r) / s.z); }
}
const BANIM_D = 'attribute float aAn; attribute float aAw; uniform vec4 uAn; uniform vec3 uDt; uniform float uBT;\n';
const BANIM = ' { float bg=floor(aAn+.5); if(bg==1.) transformed+=normal*(uAn.x*aAw); else if(bg==2.) transformed.y+=uAn.y*aAw; else if(bg==3.) transformed.y+=uAn.z*aAw; else if(bg==4.) transformed.y-=uAn.w*aAw; else if(bg==5.) transformed+=uDt*aAw;\n'
  + '  else if(bg==6.) { float s=sin(uBT*1.35-position.x*.8+position.y*.2)+.35*sin(uBT*2.9-position.x*1.7); transformed.z+=s*aAw; transformed.x+=s*aAw*.12; }\n'   // 6 sway (tail, hanging moss): a slow wave down the part
  + '  else if(bg==7.) transformed+=normal*(sin(uBT*5.3+dot(position,vec3(3.7,2.9,4.3)))*.6+sin(uBT*8.1+dot(position,vec3(-2.3,5.1,1.7)))*.4)*aAw; }\n';   // 7 ruffle (feathers, leaves, moss)
function bossInkMat(key, mat) {   // the hero's ink, per boss so the outline follows the breathing / brows / blinks (shares the boss's animation uniforms)
  const U = mat.userData.U, m = new THREE.MeshBasicMaterial({ color: '#1e1816', side: THREE.BackSide });
  m.onBeforeCompile = sh => { sh.uniforms.uAn = U.uAn; sh.uniforms.uDt = U.uDt; sh.uniforms.uBT = U.uBT; sh.vertexShader = BANIM_D + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BANIM); };
  m.customProgramCacheKey = () => 'bink:' + key; return m;
}
const AO_D = [.09, .24, .5], AO_W = [.45, .35, .2];
// merge the painted meshes under root (skipping the stop pivots, which are baked on their own) into one mesh + one ink hull; returns the mesh.
// Per part: optional bevel + sculpt (displaced along the normal averaged per spot, so box corners stay closed), smooth normals of the new
// surface, then contact shading (is the point a little way out along the normal inside another part?), cavity shading from the sculpt, top light.
function bossBake(root, mat, own, stops, ink, bo) {   // bo (buddy): { bones: Map(joint group -> index) adds a per-vertex joint id for the shader rig, aoS: size scale for the contact shading }
  const aS = bo && bo.aoS || 1; root.updateMatrixWorld(true); _bkI.copy(root.matrixWorld).invert();
  const parts = [], walk = o => { for (const c of o.children) { if (stops && stops.includes(c)) continue; if (c.isMesh && c.material && c.material.bk) parts.push(c); walk(c); } };
  walk(root);
  const recs = [];
  for (const m of parts) {
    const pt = m.material, sc = m.userData.sc, g0 = m.geometry; if (!g0.boundingBox) g0.computeBoundingBox();
    let bi = 0; if (bo && bo.bones) for (let q = m.parent; q && q !== root; q = q.parent) if (bo.bones.has(q)) { bi = bo.bones.get(q); break; }
    const g = g0.clone(); if (sc && sc.bev) bevelBox(g, m.scale, sc.bev);
    const mw = new THREE.Matrix4().multiplyMatrices(_bkI, m.matrixWorld); g.applyMatrix4(mw);
    const p = g.attributes.position, n = g.attributes.normal, vc = g.attributes.color, N = p.count, ix = g.index ? g.index.array : null, cnt = ix ? ix.length : N;
    const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), Av = new Float32Array(N * 3), D = new Float32Array(N), keys = new Array(N), acc = new Map();
    for (let i = 0; i < N; i++) { P[i * 3] = p.getX(i); P[i * 3 + 1] = p.getY(i); P[i * 3 + 2] = p.getZ(i);
      const kk = keys[i] = Math.round(P[i * 3] * 500) + ',' + Math.round(P[i * 3 + 1] * 500) + ',' + Math.round(P[i * 3 + 2] * 500), a = acc.get(kk) || [0, 0, 0];
      a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(kk, a); }
    for (let i = 0; i < N; i++) { const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1; Av[i * 3] = a[0] / l; Av[i * 3 + 1] = a[1] / l; Av[i * 3 + 2] = a[2] / l; }
    if (sc && (sc.k || sc.dent || sc.bev)) {
      const fn = SCULPT[sc.k], amp = sc.a || 0, f = sc.f || 1;
      for (let i = 0; i < N; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; let d = fn ? fn(x, y, z, f, sc) * amp : 0; if (sc.lo) d += bF(x * sc.lo[1] + 11, y * sc.lo[1], z * sc.lo[1]) * sc.lo[0];   // lo: [amp, freq] big lumps that break the silhouette
        if (sc.dent) for (const q of sc.dent) { const t = Math.hypot(x - q[0], y - q[1], z - q[2]) / q[3]; if (t < 1) d -= q[4] * (1 - t * t) * (1 - t * t); }
        D[i] = d; P[i * 3] += Av[i * 3] * d; P[i * 3 + 1] += Av[i * 3 + 1] * d; P[i * 3 + 2] += Av[i * 3 + 2] * d; }
      const fa = new Map();   // smooth normals of the carved surface, merged per spot
      for (let t = 0; t < cnt; t += 3) { const a = ix ? ix[t] : t, b = ix ? ix[t + 1] : t + 1, c = ix ? ix[t + 2] : t + 2;
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        for (const v of [a, b, c]) { const s = fa.get(keys[v]) || [0, 0, 0]; s[0] += cx; s[1] += cy; s[2] += cz; fa.set(keys[v], s); } }
      for (let i = 0; i < N; i++) { const s = fa.get(keys[i]), l = s ? Math.hypot(s[0], s[1], s[2]) : 0;
        if (l > 1e-9) { Nn[i * 3] = s[0] / l; Nn[i * 3 + 1] = s[1] / l; Nn[i * 3 + 2] = s[2] / l; } else { Nn[i * 3] = Av[i * 3]; Nn[i * 3 + 1] = Av[i * 3 + 1]; Nn[i * 3 + 2] = Av[i * 3 + 2]; } }
    } else for (let i = 0; i < N; i++) { Nn[i * 3] = n.getX(i); Nn[i * 3 + 1] = n.getY(i); Nn[i * 3 + 2] = n.getZ(i); }
    const bb = g0.boundingBox, c = bb.getCenter(new THREE.Vector3()), hs = bb.getSize(new THREE.Vector3()).multiplyScalar(.5);
    recs.push({ pt, sc, bi, an: m.userData.an, P, Nn, Av, D, N, ix, cnt, vc, inv: mw.clone().invert(), box: !!g0.userData.box, c0: c, hs, c: c.clone().applyMatrix4(mw), r: hs.length() * mw.getMaxScaleOnAxis() });
    g.dispose(); m.parent.remove(m);
  }
  const pos = [], nor = [], col = [], lay = [], aan = [], aaw = [], idx = [], inkPos = [], inkN = [], inkA = [], inkW = [], ii = [], bon = [], inkB = [];
  for (const R of recs) {
    const pt = R.pt, glow = pt.layer === 4, cand = glow ? [] : recs.filter(o => o !== R && o.pt.layer !== 4 && o.r > .1 * aS && o.c.distanceTo(R.c) < R.r + o.r + .6 * aS);
    const amp = R.sc && R.sc.a ? R.sc.a : 0, base = pos.length / 3, grp = R.an ? R.an[0] : 0, gw = R.an ? R.an[1] : 0;
    for (let i = 0; i < R.N; i++) { const x = R.P[i * 3], y = R.P[i * 3 + 1], z = R.P[i * 3 + 2], nx = R.Nn[i * 3], ny = R.Nn[i * 3 + 1], nz = R.Nn[i * 3 + 2];
      let occ = 0;
      for (let s = 0; s < 3 && cand.length; s++) { const d = AO_D[s] * aS; _bkV.set(x + nx * d, y + ny * d, z + nz * d);
        for (const o of cand) { if (_bkV.distanceTo(o.c) > o.r) continue; const q = _bkW.copy(_bkV).applyMatrix4(o.inv), ux = (q.x - o.c0.x) / o.hs.x, uy = (q.y - o.c0.y) / o.hs.y, uz = (q.z - o.c0.z) / o.hs.z;
          if (o.box ? Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz)) < 1 : ux * ux + uy * uy + uz * uz < 1) { occ += AO_W[s]; break; } } }
      const cav = amp ? 1 + Math.max(-1, Math.min(1, R.D[i] / amp)) * .26 : 1, mot = R.sc && R.sc.mot ? 1 + bF(x * .7 / aS + 4, y * .7 / aS, z * .7 / aS) * R.sc.mot : 1, k = (.72 + .36 * (ny * .5 + .5)) * (1 - .62 * occ) * cav * mot;   // top light, contact shade, cavity, mottling
      pos.push(x, y, z); nor.push(nx, ny, nz); _bkC.copy(pt.color); if (R.vc) _bkC.multiply(_bkC.clone().setRGB(R.vc.getX(i), R.vc.getY(i), R.vc.getZ(i)));
      col.push(_bkC.r * k, _bkC.g * k, _bkC.b * k); lay.push(pt.layer); bon.push(R.bi); aan.push(grp); aaw.push(typeof gw === 'function' ? gw(x, y, z) : gw); }
    for (let i = 0; i < R.cnt; i++) idx.push(base + (R.ix ? R.ix[i] : i));
    if (pt.ink > 0) {   // ink hull along the per-spot normal; heavier under the forms and a little uneven, like a brush line
      const ib = inkPos.length / 3;
      for (let i = 0; i < R.N; i++) { const x = R.P[i * 3], y = R.P[i * 3 + 1], z = R.P[i * 3 + 2], ax = R.Av[i * 3], ay = R.Av[i * 3 + 1], az = R.Av[i * 3 + 2];
        const w = pt.ink * (.72 + .6 * Math.max(0, -ay) - .18 * Math.max(0, ay) + .42 * bN(x * 1.7 / aS, y * 1.7 / aS, z * 1.7 / aS));   // thin on top, heavy underneath
        inkPos.push(x + ax * w, y + ay * w, z + az * w); inkN.push(ax, ay, az); inkB.push(R.bi); inkA.push(grp); inkW.push(typeof gw === 'function' ? gw(x, y, z) : gw); }
      for (let i = 0; i < R.cnt; i++) ii.push(ib + (R.ix ? R.ix[i] : i)); }
  }
  const F = (a, s) => new THREE.Float32BufferAttribute(a, s);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', F(pos, 3)); geo.setAttribute('normal', F(nor, 3)); geo.setAttribute('color', F(col, 3));
  geo.setAttribute('aBt', F(lay, 1)); geo.setAttribute('aAn', F(aan, 1)); geo.setAttribute('aAw', F(aaw, 1)); if (bo && bo.bones) geo.setAttribute('aBone', F(bon, 1)); geo.setIndex(idx); own.push(geo);
  const mesh = mk(geo, mat, 0, 0, 0, 1, 1, 1, root);
  if (ii.length) { const ig = new THREE.BufferGeometry(); ig.setAttribute('position', F(inkPos, 3)); ig.setAttribute('normal', F(inkN, 3)); ig.setAttribute('aAn', F(inkA, 1)); ig.setAttribute('aAw', F(inkW, 1)); if (bo && bo.bones) ig.setAttribute('aBone', F(inkB, 1));
    ig.setIndex(ii); own.push(ig); mesh.userData.ink = mk(ig, ink || bossInk, 0, 0, 0, 1, 1, 1, root, true); }
  return mesh;
}
// idle personality, visual only (breathing, brow twitches, blinks, glances). Reads the boss state to pick a mood; never writes game state.
function bossIdle(bm, b, tele) {
  const U = bm.an; if (!U) return; const t = VT + bm.idSeed, a = U.uAn.value, daze = b.state === 'stun' || b.state === 'dazed' || b.state === 'rest';
  const tw = s => Math.pow(Math.max(0, Math.sin(t * 1.1 + s) * Math.sin(t * 2.9 + s * 1.7)), 8);   // a rare quick twitch
  a.x = Math.sin(t * (daze ? 3.4 : 2.0)) * (daze ? 1.6 : 1);
  const fu = tele ? -1 : 0; a.y = tw(0) * .9 + fu + (daze ? .7 : 0); a.z = tw(2.3) * .9 + fu * 1.25 + (daze ? .35 : 0);   // lopsided: one brow works harder
  const bp = (t * .23) % 1; a.w = daze ? .55 : bp < .035 ? Math.sin(bp / .035 * Math.PI) : 0;
  const j = Math.floor(t * .8), d = bm.dart; let tx = (bH(j, 3, 7) - .5) * 2, ty = (bH(j, 5, 1) - .5) * 1.4; if (tele) tx = ty = 0;   // glances; a fixed stare on the tell
  d[0] += (tx - d[0]) * .2; d[1] += (ty - d[1]) * .2; bm.look(d[0], d[1]);
}
const _up0 = new THREE.Vector3(0, 1, 0);
function buildBoss1(g, skins, own) {   // croc rearing out of the mire (its hitbox is a tall column): huge head, slit orange eyes, fangs, mud drips, ridged back, an old clay boot in its jaws
  const h = {};
  const C = { body: '#887a37', hi: '#a99b57', dk: '#61523c', belly: '#bcb191', deep: '#383027', drip: '#7e6f5c', tooth: '#f7f7f3', eye: '#ec8736', ink: '#0a0a0a' };
  // wet scaly skin (procedural scutes, glossy), belly plates (same scutes, bigger, softer), matte mud (in-repo mud art); thick ink + warm rim so it reads half-sunk in the mire
  const mat = bossMat('b1', [{ t: texScales, sc: .55, st: .32 }, { t: 'mud', sc: .5, st: .5, rough: .95 }, { t: texScales, sc: .22, st: .35, rough: .6 }], { rough: .34, rim: '#ffe2a8', rimK: .32, self: .1, sh: [.3, 26, [1, 0, .45]] });   // wet sheen on the scutes, none on the mud
  skins.push(mat); const ink = bossInkMat('b1', mat); own.push(ink);
  const sk = BP(C.body, 0, .12), skS = BP(C.body, 0, .05), hi = BP(C.hi, 0, .1), hiS = BP(C.hi, 0, .04), dk = BP(C.dk, 0, .05), dkS = BP(C.dk, 0, .03), be = BP(C.belly, 2, .07), seam = BP('#6f6448', 3, 0);
  const mud = BP(C.drip, 1, .05), mudS = BP(C.drip, 1, .025), mudW = BP('#5a4632', 1, .05), tooth = BP(C.tooth, 3, .022), gum = BP('#6e3b30', 3, 0), throat = BP('#3a1d18', 3, 0), tongue = BP('#b8545a', 3, 0), deep = BP(C.deep, 3, 0);
  const scar = BP('#c9b98c', 3, .015), stitch = BP('#3a2c22', 3, 0);
  const onBody = (th, y, sx, sz) => [-.15 + Math.cos(th) * sx, y, Math.sin(th) * sz];   // a point on the body's skin at angle th (0 = belly side)
  const tSw = (x) => Math.pow(Math.max(0, Math.min(1, (-x - .9) / 2.9)), 1.5) * .32;   // tail sway weight: still at the root, most at the tip (look only; the hitbox is the body column)
  bAn(bSc(mk(capH(1.0, 2.9), sk, -.15, 2.1, 0, 1, 1, 1.15, g), { k: 'scale', a: .075, f: 2.0, lo: [.2, .55], mot: .35 }), 1, .035);         // upright body: real raised scutes, breathing
  bAn(bSc(mk(capH(.62, 2.5), be, .5, 2.0, 0, 1, 1, 1.25, g), { k: 'bands', a: .05, f: 2.22 }), 1, .07);           // pale belly plates with sunk seams (breathes most)
  for (let k = 0; k < 6; k++) mk(gBox, seam, 1.08 - Math.abs(k - 2.5) * .03, .9 + k * .45, 0, .04, .05, 1.2, g);    // seam lines in the grooves
  for (let k = 0; k < 7; k++) for (const s of [1, -1]) rot(mk(gCone, dk, -1.08 + k * .02, .95 + k * .52, s * .42, .6, 1.0 - (k % 2) * .3, .34, g), s * .5, 0, Math.PI / 2 - .45);   // ridged back: two rows of keeled scutes, splayed out so they break the outline from behind
  for (let k = 0; k < 11; k++) { const y = .9 + k * .42, x = y < 2.9 ? -1.42 + k * .01 : -1.36 + (y - 2.9) * .4, hgt = (1.05 + (k % 2) * .5 + bH(k, 2, 5) * .2) * (k === 6 ? .55 : 1) * (1 - Math.abs(k - 4.5) * .045);   // bold saw-tooth crest from the tail root up onto the skull (one plate snapped)
    rot(mk(gConeH, k % 3 ? dk : dkS, x, y, 0, .7, hgt, .26, g), 0, 0, Math.PI / 2 - .55 + (y > 2.9 ? (y - 2.9) * .3 : 0)); }
  for (let k = 0; k < 3; k++) rot(mk(capG(.2, 1.45 - k * .25), skS, -.84 + k * .08, 3.0 + k * .3, 0, 1, 1, 1, g), Math.PI / 2, 0, 0);   // skin folds across the back of the neck
  for (const s of [1, -1]) bSc(mk(gSphM, sk, -.35, 1.05, s * .92, 1.35, 1.25, .95, g), { k: 'scale', a: .05, f: 2.4 });   // heavy haunches (the body narrows to the neck)
  for (const th of [Math.PI - .62, Math.PI + .62, Math.PI - 1.1, Math.PI + 1.1]) for (let k = 0; k < 7; k++) {   // osteoderm domes over the back and flanks (relief, not paint)
    const y = .95 + k * .45 + (Math.abs(th - Math.PI) > 1 ? .22 : 0), [x, , z] = onBody(th, y, .97, 1.1), m = mk(gHalfL, k % 3 ? skS : dkS, x, y, z, .58, .28, .44, g);
    m.quaternion.setFromUnitVectors(_up0, _bkV.set(Math.cos(th), .15, Math.sin(th) / 1.15).normalize()); }
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; mk(gBlob, k % 2 ? mud : mudW, -.15 + Math.cos(a) * 1.0, .45 + (k % 3) * .12, Math.sin(a) * 1.15, .95, .5, .8, g); }   // mud collar where it breaks the mire
  [[-1.05, .72, .15, .62], [-1.6, .5, .34, .53], [-2.13, .34, .53, .45], [-2.62, .23, .71, .37], [-3.07, .15, .87, .3], [-3.47, .1, 1.0, .23], [-3.8, .07, 1.1, .16]].forEach(([x, y, z, r], i) => {   // tail: tapering scaly segments with a double crest that joins into one
    bAn(rot(bSc(mk(gSphM, i % 2 ? skS : sk, x, y, z, r * 2.5, r * 1.55, r * 1.8, g), { k: 'scale', a: .045, f: 2.3, mot: .25 }), 0, .35, 0), 6, tSw);
    for (const s of i < 4 ? [1, -1] : [0]) bAn(rot(mk(gCone, dk, x + .05, y + r * .78, z + s * r * .36, .22 + r * .14, .42 + r * .7, .2, g), s * .25, 0, .45), 6, tSw); });
  for (const s of [1, -1]) { const a = new THREE.Group(); a.position.set(.5, 2.7, s * 1.05); g.add(a);              // stubby fore-legs, scaly elbows, knuckles, pale claws
    rot(bSc(mk(capH(.32, .7), sk, .35, -.2, 0, 1, 1, 1, a), { k: 'scale', a: .03, f: 3 }), 0, 0, -1.1); bSc(mk(gSphM, hi, .85, -.5, 0, .75, .45, .6, a), { k: 'bump', a: .04, f: 4 }); mk(gSph, dk, .05, .1, s * .12, .34, .28, .32, a);
    for (let c = 0; c < 3; c++) { mk(gSph, hiS, 1.08, -.5, (c - 1) * .2, .18, .15, .17, a); rot(mk(gCone, tooth, 1.22, -.6, (c - 1) * .2, .1, .3, .1, a), 0, 0, -Math.PI / 2 - .3); } }
  bSc(mk(gSphH, sk, .95, 4.35, 0, 2.5, 1.85, 2.25, g), { k: 'scale', a: .07, f: 1.5, dent: [[.5, 3.75, 1.05, .45, .12], [.5, 3.75, -1.05, .45, .12]] });   // big skull: scaly relief, sunk cheeks behind the jaw hinge
  for (const [x, y, z] of [[.25, 5.08, .38], [-.05, 4.85, .32], [-.3, 4.55, .26]]) for (const s of [1, -1]) bSc(mk(gSph, dk, x, y, s * z, .34, .24, .32, g), { k: 'bump', a: .03, f: 5 });   // skull knobs
  for (const s of [1, -1]) { bSc(mk(gSphM, hi, 1.7, 4.2, s * .96, .95, .42, .48, g), { k: 'bump', a: .03, f: 3 });   // cheekbones under the eyes
    bSc(mk(gSphM, sk, .15, 4.0, s * 1.0, 1.0, .95, .62, g), { k: 'scale', a: .04, f: 2.4 }); }                    // jaw muscles
  rot(bSc(mk(capH(.6, 1.3), hi, 2.2, 3.95, 0, 1, 1, 1.5, g), { k: 'bump', a: .035, f: 3 }), 0, 0, Math.PI / 2);   // upper snout (to x ~3.5), lumpy
  for (const x of [1.75, 2.25, 2.75]) for (const s of [1, -1]) mk(gHalfL, hiS, x, 4.48, s * .36, .3, .16, .26, g);  // snout scutes (raised domes)
  for (const s of [1, -1]) { mk(gSph, hiS, 3.3, 4.5, s * .27, .36, .28, .32, g); mk(gSph, deep, 3.44, 4.6, s * .27, .14, .1, .12, g); }   // nostril bumps + holes
  mk(gFlat, gum, 2.0, 3.42, 0, 2.6, 1, 1.5, g).rotation.x = Math.PI;                                                 // roof of the mouth
  bAn(mk(gSph, throat, .95, 3.4, 0, 1.0, .5, 1.2, g), 1, .05);                                                       // dark throat (the open mouth reads deep), gulping
  for (let j = 0; j < 6; j++) for (const s of [1, -1]) { const f = j === 1 || j === 4, br = j === 4 && s === 1;     // upper teeth; one big fang snapped off
    mk(gCone, tooth, 1.05 + j * .44, br ? 3.3 : 3.34, s * .76, f ? .26 : .17, br ? .26 : f ? .62 : .34, f ? .26 : .17, g).rotation.z = Math.PI;
    if (br) mk(gIco, tooth, 1.05 + j * .44, 3.17, s * .76, .17, .07, .17, g); }
  { const sc = new THREE.Group(); sc.position.set(.55, 4.75, 1.0); sc.rotation.set(-.35, .2, .6); g.add(sc);           // old claw scar across one cheek, stitched
    mk(capG(.055, 1.1), scar, 0, 0, 0, 1, 1, 1, sc); for (let k = 0; k < 4; k++) mk(gBox, stitch, 0, -.42 + k * .28, 0, .3, .04, .06, sc); }
  h.jaw = new THREE.Group(); h.jaw.position.set(.5, 3.45, 0); g.add(h.jaw);                                          // lower jaw (syncBoss opens it)
  rot(bSc(mk(capH(.42, 1.6), hi, 1.35, -.42, 0, 1, 1, 1.8, h.jaw), { k: 'scale', a: .04, f: 2.2 }), 0, 0, Math.PI / 2); bSc(mk(gSphM, be, 1.1, -.65, 0, 2.4, .45, 1.3, h.jaw), { k: 'bands', a: .03, f: 3 });
  mk(gFlat, gum, 1.4, -.04, 0, 2.5, 1, 1.3, h.jaw); mk(gSph, tongue, 1.0, -.08, 0, 1.6, .22, .7, h.jaw);
  for (let j = 0; j < 5; j++) for (const s of [1, -1]) mk(gCone, tooth, .75 + j * .46, .1, s * .68, .17, j === 2 && s < 0 ? .22 : .38, .17, h.jaw);   // one worn-down tooth
  { const bt = new THREE.Group(); bt.position.set(2.1, .15, .15); bt.rotation.set(.3, .5, -.45); h.jaw.add(bt);        // the old clay boot it is chewing on (bitten: tooth dents)
    const clay = BP('#a05a3c', 3, .05); mk(gCyl, clay, 0, .42, 0, .5, .85, .5, bt); bSc(mk(gSphM, clay, .32, 0, 0, .95, .42, .56, bt), { k: 'bump', a: .02, f: 6 });
    mk(gBox, BP(C.deep, 3, .03), .2, -.19, 0, .95, .09, .54, bt); mk(gCyl, BP('#6e3b2a', 3, .03), 0, .86, 0, .56, .09, .56, bt);
    for (let k = 0; k < 3; k++) mk(gBox, BP('#e8d9b0', 3, 0), .26, .3 + k * .17, 0, .04, .04, .5, bt).rotation.x = (k % 2 - .5) * .7; }   // laces
  for (const [x, z, l] of [[.9, .55, .5], [1.9, -.5, .7], [2.6, .35, .4]]) mk(capG(.09, l), mudS, x, -.8 - l / 2, z, 1, 1, 1, h.jaw);   // drool-mud
  const pg = new THREE.Group(); g.add(pg);                                                                            // pupils: one mesh, syncBoss swaps its colour on the tell; glances in idle
  for (const s of [1, -1]) {                                                                                          // eye bumps, glowing slit eyes, blinking lids, heavy lopsided brows
    bSc(mk(gSphM, hi, .75, 5.2, s * .8, .95, .8, .8, g), { k: 'bump', a: .03, f: 4 });
    mk(gSph, BP(C.eye, 4, 0), .98, 5.28, s * 1.0, .64, .58, .54, g); mk(gSph, BP('#fff6d8', 4, 0), 1.16, 5.44, s * 1.25, .1, .1, .08, g);   // eyes sit on the sides of the skull bumps, so they read from the side-on game camera
    bAn(rot(mk(gSph, hiS, .92, 5.6, s * .96, .74, .3, .66, g), 0, 0, -.3), 4, .3);                                     // grumpy upper lid (blinks)
    mk(gSph, BP(C.ink, 3, 0), 1.1, 5.28, s * 1.2, .14, .46, .14, pg);
    bAn(rot(bSc(mk(capH(.19, .78), BP(C.deep, 0, .05), .95, s > 0 ? 5.82 : 5.74, s * .95, 1, 1, 1.35, g), { k: 'bump', a: .03, f: 5 }), 0, 0, Math.PI / 2 - (s > 0 ? .75 : .5)), s > 0 ? 2 : 3, .13); }
  for (const [x, y, z, l] of [[.9, 1.6, .8, .6], [-.5, 1.4, -1.05, .5], [.75, 2.9, -.9, .45], [-.9, 2.3, 1.0, .5], [1.6, 3.3, 1.0, .4]]) mk(capG(.12, l), mudS, x, y - l / 2, z, 1, 1, 1, g);   // mud drips
  for (const [x, y, z, s] of [[-.6, 3.2, 1.0, .5], [.3, 2.5, -1.15, .45], [-1.0, 1.6, -.8, .4], [1.4, 5.2, .1, .35], [-.2, 3.4, -.95, .4]]) mk(gBlob, mud, x, y, z, s * 1.4, s * .7, s, g);
  for (const s of [1, -1]) mk(gBlob, mud, .1, 3.15, s * 1.05, .85, .45, .7, g);                                       // mud slopped on the shoulders
  bossBake(h.jaw, mat, own, null, ink); h.pupils = [bossBake(pg, M('#2a1c13'), own)]; h.pupils[0].castShadow = false; bossBake(g, mat, own, [h.jaw, pg], ink);
  h.an = mat.userData.U; h.idSeed = 0; h.dart = [0, 0]; h.look = (x, y) => h.pupils[0].position.set(x * .07, y * .05, 0);
  return h;
}
function buildBoss2(g, skins, own) {   // round orange bird: cream belly, hooked yellow beak, grumpy brows, leaf crest, layered teal wings, seed bombs in its talons, bandaged tail
  const h = {};
  const C = { wing: '#4c8f91', wingL: '#94bfb5', wingD: '#36584c', leaf: '#678b54', seed: '#9db66f', body: '#eb9c4f', rust: '#ab5832', belly: '#e5d29e', eye: '#ef8b3b', ink: '#141614' };
  // feathers: fine procedural feather texture on the body, a bigger one on wing and tail feathers, the in-repo leaf art on the crest and seed pods
  const mat = bossMat('b2', [{ t: texFeather, sc: .8, st: .5 }, { t: 'leaf', sc: 1.4, st: .6 }, { t: texFeather, sc: .9, st: .4 }], { rough: .78, rim: '#fff0c8', rimK: .2, self: .1, sh: [.09, 5, [1, 0, 1]] });   // soft broad feather sheen
  skins.push(mat); const ink = bossInkMat('b2', mat); own.push(ink);
  const bo = BP(C.body, 0, .1), boS = BP(C.body, 0, .03), ru = BP(C.rust, 0, .08), ruS = BP(C.rust, 0, .03), be = BP(C.belly, 0, .07), beS = BP('#d9bf86', 0, .02), wi = BP(C.wing, 2, .05), wl = BP(C.wingL, 2, .05), wd = BP(C.wingD, 2, .04), wdS = BP(C.wingD, 2, 0);
  const lf = BP(C.leaf, 1, .04), lfS = BP('#55743f', 1, 0), beak = BP('#efc23a', 3, .055), beakD = BP('#b8861e', 3, 0), white = BP(C.belly, 3, .035), ink3 = BP(C.ink, 3, 0);
  const fe = (k, f, a) => ({ k: 'feather', f, a, c: [k, 0], mot: .12 });
  const ruF = BP(C.rust, 0, 0), ruF2 = BP('#9a4a2a', 0, 0), boF = BP(C.body, 0, 0), boF2 = BP('#e3954a', 0, 0);   // no ink on the tiles: soft edges, shaded by the bake   // feather tiles: thin ink so they read as feathers, not armour                                                     // feather tiers wrapped round a centre
  bAn(bSc(mk(gSphH, bo, -.2, 0, 0, 3.6, 3.0, 3.0, g), fe(-.2, 1.7, .12)), 1, .04); bSc(mk(gSphH, ru, -.9, .55, 0, 2.4, 2.0, 2.6, g), { k: 'feather', f: 1.9, a: .11, c: [3.6, 0], ur: 5, mot: .12 });   // tiers swept from a point ahead of the bird, so there is no pinch on top of the back   // body + rust back, layered feather tiers
  bAn(bSc(mk(gSphH, be, .55, -.6, 0, 2.5, 2.2, 2.4, g), fe(.55, 2.4, .08)), 1, .09);                                  // cream belly, puffs as it breathes
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - (r === 2 ? 1 : 0); k++) { const z = (k - (r === 2 ? 1 : 1.5)) * .5, y = -.15 - r * .5, x = 1.62 - r * .05 - Math.abs(z) * .25;   // chest feather chevrons
    bAn(rot(mk(gSph, beS, x, y, z, .16, .44, .36, g), 0, 0, -.25), 1, .09); }
  bSc(mk(gSphH, bo, 1.35, 1.05, 0, 2.1, 2.0, 2.05, g), fe(1.35, 2.8, .06)); bSc(mk(gSphM, ru, 1.1, 1.75, 0, 1.4, .7, 1.5, g), fe(1.1, 4, .04));   // head + rust cap
  bShingle(g, (i, j) => (i + j) % 3 ? ruF : ruF2, [-.9, .55, 0], [1.2, 1.0, 1.3], 5, 10, Math.PI - 1.45, Math.PI + 1.45, -.15, .8, [.95, .13, 1.1], { out: -.05, lift: .13, geo: gSphL, flow: [-1, -.55, 0], an: [7, .025] });   // overlapping rust feathers over the back
  bShingle(g, (i, j) => (i * 3 + j) % 4 ? boF : boF2, [-.2, 0, 0], [1.8, 1.5, 1.5], 3, 12, Math.PI - 1.65, Math.PI + 1.65, -.95, -.3, [1.0, .12, 1.15], { out: -.075, lift: .11, geo: gSphL, flow: [-1, -.75, 0], an: [7, .02] });   // flat, sunk and swept back toward the tail, so they lie like feathers   // and over the lower back and flanks
  for (let k = 0; k < 4; k++) bAn(rot(mk(gCone, ruS, .25 - k * .12, 1.95 + k * .06, (k - 1.5) * .28, .28, .9, .2, g), (k - 1.5) * .3, 0, 1.25 + k * .08), 7, .04);   // ruffled nape feathers
  rot(mk(gCone, ruS, 1.55, 2.2, .3, .16, .7, .12, g), .5, 0, -.6); rot(mk(gCone, ruS, 1.7, 2.15, .38, .12, .5, .1, g), .7, 0, -1.1);   // a stubborn cowlick
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) bAn(rot(mk(gCone, bo, 1.0 - k * .1, .35 - k * .12, s * (.95 - k * .05), .24, .62, .17, g), s * .5, 0, 2.3 + k * .15), 7, .03);   // cheek fluff
  for (const s of [1, -1]) bSc(mk(gSphM, bo, 1.75, .78, s * .75, .9, .55, .5, g), { k: 'bump', a: .03, f: 4 });  // puffed cheeks under the eyes
  rot(bSc(mk(gConeH, beak, 2.75, .85, 0, .7, 1.4, .62, g), { k: 'bump', a: .025, f: 5, dent: [[3.25, .7, .15, .14, .06]] }), 0, 0, -Math.PI / 2); rot(mk(gCone, beak, 3.35, .62, 0, .24, .55, .22, g), 0, 0, Math.PI * .82);   // hooked beak, one old chip
  rot(mk(capG(.07, .9), BP('#f6d460', 3, .02), 2.7, 1.15, 0, 1, 1, 1, g), 0, 0, Math.PI / 2 + .32);                    // ridge along the top of the beak
  rot(mk(gCone, BP('#d9a52a', 3, .04), 2.55, .55, 0, .42, .9, .38, g), 0, 0, -Math.PI / 2 - .12);                    // lower mandible
  mk(gBox, beakD, 2.7, .72, 0, 1.1, .05, .5, g); for (const s of [1, -1]) mk(gSph, beakD, 2.95, .98, s * .16, .1, .06, .07, g);   // gape line + nostrils
  for (const s of [1, -1]) {                                                                                         // big eyes: white, glowing iris, pupil + glint (glance), blinking lids, lopsided angry brows
    mk(gSph, white, 2.1, 1.3, s * .62, .55, .62, .45, g); mk(gSph, BP(C.eye, 4, 0), 2.22, 1.28, s * .7, .45, .5, .32, g);
    bAn(mk(gSph, ink3, 2.34, 1.26, s * .78, .2, .26, .14, g), 5, 1); bAn(mk(gSph, BP('#ffffff', 4, 0), 2.36, 1.38, s * .84, .08, .08, .06, g), 5, 1);
    bAn(rot(mk(gSph, boS, 2.08, 1.62, s * .62, .62, .3, .52, g), 0, 0, -.35), 4, .34);
    bAn(rot(bSc(mk(capH(.13, .62), BP('#7a3a20', 0, .035), 2.05, s > 0 ? 1.8 : 1.72, s * .66, 1, 1, 1.5, g), { k: 'bump', a: .02, f: 6 }), 0, 0, Math.PI / 2 - (s > 0 ? .3 : .55)), s > 0 ? 2 : 3, .12); }
  for (let i = 0; i < 6; i++) { const a = (i - 2.5) * .28; bAn(rot(mk(gCone, lf, .8 - Math.abs(i - 2.5) * .12, 2.35, a * 1.4, .42, (1.4 - Math.abs(i - 2.5) * .15) * (i === 4 ? .6 : 1), .14, g), a * 1.2, 0, .55 + Math.abs(a) * .3), 7, .05); }   // leaf crest (one leaf torn short)
  h.wings = [1, -1].map(s => { const w = new THREE.Group(); w.position.set(-.4, .9, s * 1.25); g.add(w); bSc(mk(gSphM, wd, 0, 0, s * .35, 1.4, .55, 1.2, w), { k: 'bump', a: .03, f: 4 });
    for (let k = 0; k < 4; k++) mk(gSph, ruS, .35 - k * .3, .18, s * (.75 + k * .1), .55, .17, .7, w);           // rust covert feathers at the wing root
    for (let k = 0; k < 5; k++) mk(gSph, wdS, .2 - k * .32, .12, s * (1.15 + (k % 2) * .1), .4, .12, .5, w);       // a second row of small coverts
    for (let i = 0; i < 6; i++) { const L = (2.7 - i * .22) * (s > 0 && i === 3 ? .72 : 1), x = .3 - i * .42, z = s * (L / 2 + .25);   // one primary broken short
      bAn(mk(gSph, i % 2 ? wl : wi, x, -.02 + i * .03, z, .6, .15, L, w), 7, .02); mk(gSph, wdS, x - .1, -.08, z * .8, .5, .1, L * .7, w);
      mk(gBox, BP('#e8efe6', 3, 0), x + .02, .07 + i * .03, z, .035, .025, L * .8, w);                                 // feather quill
      mk(gSph, lfS, x - .05, .03, s * (L + .1), .42, .1, .5, w); }
    bossBake(w, mat, own, null, ink); return w; });
  const twS = (x) => Math.max(0, -x - 2.2) * .07;   // tail feathers fan and sway a little (look only)
  for (let i = 0; i < 4; i++) { bAn(rot(mk(gSph, i % 2 ? wl : wi, -3.3, -.25 + (i - 1.5) * .08, (i - 1.5) * .42, 2.4, .17, .55, g), 0, (i - 1.5) * .25, .3), 6, twS);   // tail + dark tips
    bAn(rot(mk(gSph, wdS, -4.25 - Math.abs(i - 1.5) * .05, -.55 + (i - 1.5) * .08, (i - 1.5) * .62, .7, .14, .45, g), 0, (i - 1.5) * .25, .3), 6, twS); }
  rot(mk(gTorus, BP('#f4f1e6', 3, .03), -2.6, -.05, 0, 1.0, 1.0, 1.15, g), 0, Math.PI / 2, .3);                        // white bandage on the tail
  rot(mk(gBox, BP('#d8cfb8', 3, 0), -2.62, .2, .5, .06, .3, .3, g), 0, 0, .3);                                          // its tucked end
  for (const s of [1, -1]) {                                                                                         // scaly legs, knuckled three-toed talons, spiky seed bombs
    rot(mk(capG(.15, .7), beak, .35, -1.75, s * .65, 1, 1, 1, g), 0, 0, .2); for (let k = 0; k < 3; k++) mk(gCyl, beakD, .37 - k * .04, -1.55 - k * .2, s * .65, .32, .04, .32, g);   // leg scale rings
    for (let k = 0; k < 3; k++) { const z = s * .65 + (k - 1) * .22; mk(gSph, beak, .55 + (k === 1 ? .08 : 0), -2.02, z, .16, .14, .16, g);
      rot(mk(gCone, BP(C.ink, 3, .02), .66 + (k === 1 ? .1 : 0), -2.14, z, .1, .34, .1, g), (k - 1) * .5, 0, Math.PI * .72); }
    const sb = new THREE.Group(); sb.position.set(.55, -2.45, s * .7); g.add(sb); mk(gIco, BP(C.seed, 1, .04), 0, 0, 0, .95, .95, .95, sb);
    for (let k = 0; k < 10; k++) { const v = new THREE.Vector3(Math.sin(k * 2.4) * Math.cos(k * 1.3), Math.cos(k * 2.4), Math.sin(k * 2.4) * Math.sin(k * 1.3)).normalize();
      const c = mk(gCone, BP('#6f8a3a', 3, 0), v.x * .45, v.y * .45, v.z * .45, .12, .24, .12, sb); c.quaternion.setFromUnitVectors(_up0, v); }
    for (const [dx, dz] of [[.3, 0], [-.3, .15], [0, -.3]]) rot(mk(gCone, ink3, dx, .38, dz, .07, .3, .07, sb), 0, 0, Math.PI - dx * 2); }
  bossBake(g, mat, own, h.wings, ink);
  const U = mat.userData.U; h.an = U; h.idSeed = 1.7; h.dart = [0, 0]; h.look = (x, y) => U.uDt.value.set(x * .07, y * .05, 0);
  return h;
}
function buildBoss3(g, skins, own) {   // stacked stone golem: head slab with a sapling, chest block with a carved angry face, slab belly with a band-aid, mossy shoulders, boulder fists
  const h = {}; const body = new THREE.Group(); g.add(body); h.body = body;
  const C = { stone: '#a18c78', clay: '#946a48', pale: '#b9b093', bone: '#d2cdb9', dk: '#605044', moss: '#6a806e', ochre: '#b39a52', eye: '#e09523', char: '#33302c', ink: '#090a0d' };
  // the scenery's stone art on the slabs and fists, the mud art on the clay, the leaf art on the moss; stone is matte, the sapling sways on its own pivot
  const mat = bossMat('b3', [{ t: 'stone', sc: .5, st: .6 }, { t: 'mud', sc: .5, st: .45 }, { t: 'leaf', sc: 1.2, st: .6 }], { rough: .9, rim: '#ffe6b0', rimK: .18, self: .08, grit: .3, sh: [.05, 4, [0, .6, 1]] });   // stone grit; a faint damp sheen on clay and moss
  skins.push(mat); const ink = bossInkMat('b3', mat); own.push(ink);
  const st = BP(C.stone, 0, .1), stS = BP(C.stone, 0, .04), cl = BP(C.clay, 1, .09), pa = BP(C.pale, 0, .1), bn = BP(C.bone, 0, .09), bnS = BP(C.bone, 0, .04), dk = BP(C.dk, 0, .05), mo = BP(C.moss, 2, .06), moS = BP(C.moss, 2, .02);
  const oc = BP(C.ochre, 1, .025), ch = BP(C.char, 3, 0), crack = BP('#1c1712', 3, 0), fang = BP(C.bone, 3, .03);
  const SB = (paint, x, y, z, sx, sy, sz, par, o) => bSc(mk(boxHG(sx, sy, sz), paint, x, y, z, sx, sy, sz, par), Object.assign({ k: 'stone', a: .1, f: .9, bev: .16 }, o));   // carved stone block
  const ST = { k: 'stone', a: .09, f: 1.1 };
  for (const s of [1, -1]) { SB(cl, .1, .95, s * 1.15, 1.3, 1.7, 1.35, body, { k: 'bump', a: .06, f: 1.6, bev: .25 }); bSc(mk(gSphH, st, -.35, .35, s * 1.2, 2.4, .95, 1.75, body), ST);   // stubby legs, big feet with stone toes
    for (let k = 0; k < 3; k++) bSc(mk(gSphM, stS, -1.45, .25, s * 1.2 + (k - 1) * .5, .52, .47, .47, body), { k: 'stone', a: .05, f: 2 });
    mk(gBlob, mo, -.2, 1.6, s * 1.6, .9, .7, .6, body); }
  rot(SB(pa, 0, 2.2, 0, 3.0, 1.15, 3.4, body, { k: 'strata', a: .07, f: 3.2, dent: [[-1.5, 2.75, -1.6, .45, .2]] }), 0, .05, 0); rot(SB(bn, -.05, 3.15, 0, 3.3, .9, 3.7, body, { k: 'strata', a: .07, f: 3.6, dent: [[1.6, 3.6, 1.85, .5, .22]] }), 0, -.05, 0);   // sediment bedding lines   // stacked slab belly, chipped corners
  SB(bn, -1.55, 2.3, -1.0, .6, .7, 1.1, body, { bev: .1 }); SB(bnS, 1.3, 3.55, 1.5, .7, .4, .6, body, { bev: .1 });     // loose blocks
  for (const [x, z] of [[-1.2, 1.72], [.4, 1.72], [1.0, -1.72]]) mk(gIco, BP('#8d8272', 0, .03), x, 1.95, z, .35, .3, .3, body);   // pebbles stuck in the slab
  { const ba = new THREE.Group(); ba.position.set(-1.72, 2.85, .5); ba.rotation.x = .55; body.add(ba);              // band-aid over a crack
    mk(gBox, BP('#e8d9b0', 3, .02), 0, 0, 0, .06, .4, 1.3, ba); mk(gBox, BP('#cdb07a', 3, 0), -.02, 0, 0, .06, .36, .4, ba); }
  for (const [y, z, r, l] of [[2.5, .2, .9, .8], [2.1, -.4, -.6, .6], [3.3, -.9, .3, .5]]) mk(gBox, crack, -1.56, y, z, .03, .05, l, body).rotation.x = r;
  const gash = [[-1.0, 6.3], [-.55, 5.7], [-.75, 5.2], [-.1, 4.6], [.35, 4.1]];                                        // a deep crack carved across the chest (camera side)
  const glyph = [...Array(9)].map((_, k) => [.95 + Math.cos(k / 9 * 6.283) * .52, 4.95 + Math.sin(k / 9 * 6.283) * .52, 1.95, .17, .12]).concat([[.95, 4.95, 1.95, .2, .14], [.95, 5.75, 1.95, .14, .1], [.95, 4.15, 1.95, .14, .1]]);   // a carved sun glyph (engraved ring + eye)
  SB(st, 0, 5.0, 0, 3.4, 2.9, 3.9, body, { a: .08, bev: .2, dent: [...gash.map(([x, y]) => [x, y, 1.95, .34, .2]), ...glyph, [1.7, 6.45, -1.95, .55, .3], [-1.75, 6.4, 1.95, .4, .2]] });   // chest block
  for (let i = 0; i < gash.length - 1; i++) { const [x0, y0] = gash[i], [x1, y1] = gash[i + 1]; mk(gBox, crack, (x0 + x1) / 2, (y0 + y1) / 2, 1.8, Math.hypot(x1 - x0, y1 - y0) + .05, .07, .05, body).rotation.z = Math.atan2(y1 - y0, x1 - x0); }
  for (const [x, y, r, l] of [[-.8, 5.6, .5, 1.1], [.3, 4.4, -.4, .9], [.9, 5.9, 1.1, .7]]) mk(gBox, BP('#5a4c40', 3, 0), x + .5, y, 1.93, l, .07, .03, body).rotation.z = r;   // carved rune lines (camera side)
  for (const [x, y] of [[-1.4, 6.2], [1.45, 3.95], [1.4, 6.25]]) SB(stS, x, y, 1.75, .5, .5, .5, body, { bev: .08, a: .04 });   // chipped corner stones
  const eg = new THREE.Group(); body.add(eg);                                                                         // glowing eyes: one mesh, one material (syncBoss dims it when dazed; glances in idle)
  for (const s of [1, -1]) {                                                                                         // carved angry face on the -x side: lopsided grinding brows, cheekbones, deep sockets
    bAn(rot(SB(dk, -1.85, s > 0 ? 6.08 : 5.98, s * .72, .52, .44, 1.45, body, { a: .05, f: 2, bev: .1 }), s * (s > 0 ? .55 : .36), 0, 0), s > 0 ? 2 : 3, .12);
    mk(gSphM, ch, -1.68, 5.4, s * .72, .62, .82, 1.0, body);                                                           // deep socket
    mk(gSphM, BP(C.eye, 3, 0), -1.82, 5.42, s * .72, .46, .6, .72, eg);
    bAn(mk(gSph, BP(C.ink, 3, 0), -2.05, 5.4, s * .72, .14, .22, .2, body), 5, 1);
    bAn(mk(gSph, BP('#fff2c0', 4, 0), -2.06, 5.58, s * .84, .08, .08, .08, body), 5, 1);                               // glint
    SB(stS, -1.84, 4.88, s * 1.15, .45, .32, .75, body, { bev: .08, a: .04 });                                         // cheekbones
    mk(gBox, crack, -1.72, 4.6, s * 1.3, .03, .4, .05, body).rotation.x = s * .5; }                                  // cheek cracks
  SB(st, -1.86, 6.5, 0, .55, .34, 2.6, body, { bev: .12, a: .05, f: 2, dent: [[-2.1, 6.4, 0, .22, .12]] });   // heavy forehead ledge over the face, notched in the middle
  for (const s of [1, -1]) { mk(gBox, crack, -1.75, 6.05, s * .2, .03, .42, .05, body).rotation.x = s * .25;   // frown furrows between the brows
    bAn(rot(SB(stS, -1.98, 5.92, s * .72, .32, .26, .98, body, { bev: .1, a: .02 }), s * .1, 0, .1), 4, .5); }   // stone eyelids (blink; droop when dazed)
  SB(stS, -1.98, 3.78, 0, .4, .26, 1.95, body, { bev: .1, a: .04, f: 2 });   // jutting lower lip: a sulky underbite
  SB(st, -1.85, 4.85, 0, .42, .55, .55, body, { bev: .08, a: .03 }); SB(stS, -2.0, 4.65, 0, .3, .2, .5, body, { bev: .06, a: .02 });   // nose
  mk(gBox, ch, -1.72, 4.2, 0, .24, .66, 2.2, body); mk(gBox, BP('#4a2c22', 3, 0), -1.76, 4.0, 0, .2, .2, 1.8, body);  // mouth + dark gum
  for (const z of [.6, -.6]) mk(gCone, fang, -1.86, 4.05, z, .26, z > 0 ? .55 : .3, .26, body);                       // fangs up (one broken)
  for (const z of [.25, -.25, .95, -.95]) mk(gCone, fang, -1.86, 4.38, z, .17, .3, .17, body).rotation.z = Math.PI;
  for (const [x, z, l] of [[-1.72, 1.4, .9], [-1.72, -.2, .6], [-1.0, 1.96, .8], [.5, -1.96, .7], [.9, 1.96, .55]]) mk(capG(.1, l), oc, x, 3.6 - l / 2, z, 1, 1, 1, body);   // ochre mud drips
  for (const s of [1, -1]) { bAn(bSc(mk(gBlob, mo, 0, 6.5, s * 1.85, 1.9, .9, 1.4, body), { k: 'bump', a: .1, f: 2.5 }), 1, .03);   // mossy shoulders, hanging moss
    for (const dx of [-.6, .4, -.1]) bAn(mk(capG(.12, .5 + (dx + .6) * .3), moS, dx, 5.85, s * 2.05, 1, 1, 1, body), 6, (x, y) => Math.max(0, 6.3 - y) * .22); }   // hanging moss sways
  SB(pa, 0, 7.25, 0, 2.6, 1.6, 2.9, body, { k: 'strata', a: .07, f: 3.0, dent: [[1.25, 8.0, 1.4, .55, .3]] }); mk(gBox, crack, -1.31, 7.25, .2, .03, 1.5, .05, body);   // head slab (a corner knocked off) + seam
  SB(bn, -.2, 7.0, -1.0, 2.2, .8, .95, body, { bev: .12 }); mk(gBlob, mo, -.6, 7.8, 1.2, 1.1, .5, .7, body);
  rot(bSc(mk(gConeH, st, -.3, 8.55, -1.05, .55, 1.1, .55, body), ST), -.45, 0, .15);                                   // stone horns: one whole,
  rot(bSc(mk(gConeH, st, -.3, 8.3, 1.05, .6, .55, .6, body), { k: 'stone', a: .06, f: 1.6, dent: [[-.3, 8.62, 1.05, .32, .14]] }), .4, 0, .15);   // one snapped off
  mk(capG(.1, .55), oc, -1.3, 6.85, -.6, 1, 1, 1, body);
  mk(gCyl, BP(C.dk, 1, .03), 0, 8.1, 0, 2.3, .16, 2.5, body);                                                          // soil on top
  h.core = new THREE.Group(); h.core.position.set(-.2, 8.15, .1); body.add(h.core);                                  // the sapling (sways; replaces the old gold core)
  { const stem = BP('#7a5a38', 1, .025), lf = BP('#5fa04a', 2, .025); rot(mk(capG(.07, .9), stem, 0, .5, 0, 1, 1, 1, h.core), 0, 0, .12);
    bAn(rot(mk(gSph, lf, -.35, 1.05, .25, .75, .1, .4, h.core), .3, .4, .5), 7, .04); bAn(rot(mk(gSph, lf, .35, 1.15, -.2, .8, .1, .42, h.core), -.3, .4, -.5), 7, .04); mk(gSph, lf, 0, 1.05, 0, .35, .25, .3, h.core); }
  bossBake(h.core, mat, own, null, ink);
  // arms hang behind the face (pivot x +.85, z 2.75): from the game camera the near fist used to cover the face. Visual only, the slam logic is unchanged.
  h.arms = [1, -1].map(s => { const a = new THREE.Group(); a.position.set(.85, 5.3, s * 2.75); body.add(a); bSc(mk(gSphM, cl, 0, 0, 0, 1.3, 1.3, 1.3, a), { k: 'bump', a: .06, f: 2 });
    bSc(mk(capH(.55, 2.2), cl, 0, -1.7, 0, 1, 1, 1, a), { k: 'bump', a: .06, f: 1.8 }); for (const y of [-1.2, -2.2]) mk(gCyl, BP(C.dk, 1, .02), 0, y, 0, 1.2, .14, 1.2, a);   // clay arm with mud bands
    bSc(mk(gSphH, st, 0, -3.35, 0, 2.0, 1.8, 2.0, a), { k: 'stone', a: .1, f: 1.2 });                                  // boulder fists
    for (let k = 0; k < 4; k++) bSc(mk(gSphM, stS, -.82, -2.85 - k * .1, (k - 1.5) * .42, .5, .44, .42, a), { k: 'stone', a: .04, f: 2.5 });   // knuckles
    bAn(mk(gBlob, moS, .2, .55, 0, .9, .45, .9, a), 7, .03); for (const dz of [-.3, .25]) bAn(mk(capG(.09, .45), moS, -.45, .05, dz, 1, 1, 1, a), 6, (x, y) => Math.max(0, .4 - y) * .25);   // moss on the shoulder, two strands
    bossBake(a, mat, own, null, ink); return a; });
  h.eyes = [bossBake(eg, reg(new THREE.MeshStandardMaterial({ color: C.eye, emissive: C.eye, emissiveIntensity: 1.2, roughness: .4 })), own)];
  h.eyes[0].castShadow = false; bossBake(body, mat, own, [h.core, eg, ...h.arms], ink);
  const U = mat.userData.U; h.an = U; h.idSeed = 3.3; h.dart = [0, 0]; h.look = (x, y) => { U.uDt.value.set(0, y * .06, x * .08); h.eyes[0].position.set(0, y * .03, x * .04); };
  return h;
}

/* ======================= per-room scene =======================
   Room geometry: ground plane (vertex colours + gentle displacement outside the lane), strata dirt box, back bank with hills, instanced foliage. */
const roomGroup = new THREE.Group(); scene.add(roomGroup);
const pl = buildHero(); pl.root.visible = false; scene.add(pl.root);
// physical shield (plan items 1-3, 8, 9). Look: something a robot would build from scrap. Built in code (no art file):
// mismatched steel / rust / galvanized plates (one instanced mesh), hex bolts, a bent uneven hoop, a pipe-cap boss and weld beads.
// It hangs on the hero's back, swings round his right side to the front when he blocks, and lies on the ground when dropped.
// A tight cool glow runs along the bent hoop and the weld beads, plus a ring card behind; its brightness follows his stamina
// (TUNE.GLOW_MIN at empty .. GLOW_MAX at full). Look only: no gameplay number lives here. About 8 draw calls, low poly (fine on ?q=low).
function buildShield() {
  const root = new THREE.Group(), face = new THREE.Group(); root.add(face);       // the face points along local +x
  const glowM = reg(new THREE.MeshStandardMaterial({ color: '#8b9096', emissive: '#9fe3ff', emissiveIntensity: 1, roughness: .45, metalness: .5, flatShading: true }));
  const dm = new THREE.Object3D(), inst = (geo, mat, list, colors, shadow) => {   // list: [x, y, z, sx, sy, sz, rx, ry, rz]
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => { dm.position.set(t[0], t[1], t[2]); dm.scale.set(t[3], t[4], t[5]); dm.rotation.set(t[6] || 0, t[7] || 0, t[8] || 0); dm.updateMatrix(); m.setMatrixAt(i, dm.matrix); if (colors) m.setColorAt(i, new THREE.Color(colors[i])); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = m.receiveShadow = !!shadow; face.add(m); return m; };
  // scrap plates: different metals, a little crooked, stacked at slightly different depths so they overlap like patches
  const plates = [
    [0,    0,    0,    .07, .84, .74,  0,   0,   0  ],   // backing sheet (worn steel)
    [.03,  .25, -.23,  .05, .46, .44,  .14, .04, 0  ],   // rusty patch, upper left
    [.034,-.25,  .22,  .05, .48, .44, -.1, -.03, .03],   // dark steel, lower right
    [.027, .28,  .24,  .04, .36, .38, -.2,  0,  -.04],   // galvanized scrap, upper right
    [.032,-.27, -.21,  .045,.42, .4,   .09, .03, .02],   // orange rust, lower left
    [.052, .01,  .0,   .03, .13, .92,  .05, 0,   0  ]];  // steel bar riveted across the middle
  inst(gBox, reg(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .62, metalness: .18, flatShading: true })), plates,
    ['#9aa1a8', '#b05a30', '#6d747b', '#c9c4ae', '#cf7536', '#7f878e'], true);
  // hex bolts / rivets on the plate corners and along the bar
  const boltG = new THREE.CylinderGeometry(.034, .038, .03, 6); boltG.rotateZ(Math.PI / 2);
  const bolts = [[.07, .44, -.4], [.07, .07, -.06], [.068, .45, .07], [.07, .1, .4], [.075, -.06, -.07], [.074, -.44, .41], [.075, -.08, .41],
    [.066, -.45, -.38], [.066, -.1, -.39], [.075, .02, -.36], [.075, .02, .36], [.075, .02, .12], [.075, .02, -.12], [.06, .43, -.03]];
  inst(boltG, MS('#5d6266', .45, .35, 0, true), bolts.map(b => [b[0], b[1], b[2], 1, 1, 1, (b[1] * 7 + b[2] * 5) % 1]), null, false);
  // weld beads along two seams (they carry the stamina glow)
  const beadG = new THREE.SphereGeometry(.5, 6, 4), beads = [];
  for (let i = 0; i < 7; i++) beads.push([.05, -.02 - i * .062, .015 + Math.sin(i * 2.3) * .02, .05, .045, .07, 0, 0, i * .7]);   // vertical seam, lower half
  for (let i = 0; i < 6; i++) beads.push([.045, .07 + Math.sin(i * 1.9) * .015, -.38 + i * .062, .045, .07, .05, 0, 0, i * .9]); // short seam, upper left
  inst(beadG, glowM, beads, null, false);
  // bent hoop: a 9-sided square-section ring, pushed in and out and bowed so it looks hammered from scrap
  const rimG = new THREE.TorusGeometry(.58, .045, 4, 9); rimG.rotateY(Math.PI / 2); rimG.rotateX(.2);
  { const pa = rimG.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const a = Math.atan2(v.y, v.z), f = 1 + .055 * Math.sin(3 * a + 1) + .03 * Math.sin(5 * a + 2);
      pa.setXYZ(i, v.x + .04 * Math.sin(2 * a + .5), v.y * f, v.z * f); }
    rimG.computeVertexNormals(); }
  mk(rimG, glowM, .01, 0, 0, 1, 1, 1, face, true);
  // pipe-cap boss with a brass nut, and a pipe handle on the back
  const capGeo = new THREE.CylinderGeometry(.13, .16, .07, 8); capGeo.rotateZ(-Math.PI / 2);
  mk(capGeo, MS('#565b60', .45, .35, 0, true), .085, .01, 0, 1, 1, 1, face, true);
  mk(boltG, MS('#d39a4a', .4, .35, 0, true), .13, .01, 0, 1.6, 1.6, 1.6, face, true).rotation.x = .3;
  mk(gBox, MS('#2e2b28', .6, .5), -.07, 0, 0, .04, .5, .07, face, true);
  // tight glow: a ring-shaped glow card just behind the plates, so it hugs the hoop (texRing peaks at the hoop radius)
  const texRing = mkTex(64, 64, (c, w) => { const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(.58, 'rgba(255,255,255,0)'); r.addColorStop(.72, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, w, w); });
  const haloM = reg(new THREE.MeshBasicMaterial({ map: texRing, color: '#9fe3ff', transparent: true, opacity: .6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const halo = new THREE.Mesh(gQuad, haloM); halo.rotation.y = Math.PI / 2; halo.position.x = -.06; halo.scale.set(1.7, 1.7, 1); halo.renderOrder = 5; face.add(halo);
  return { root, face, glowM, haloM, halo };
}
const shield = buildShield(); pl.bod.add(shield.root);
// buddy companion: the golem buddy (face, brow and tuft locked to the picked golem concept; the concept art stays outside the repo and is
// only a visual reference) built as a rigged 3D model in code, the hero's way (simple shapes, bold swatch colours, ink hull) at the
// bosses' finish (sculpt, contact shading, pencil texture). Wet dark mud skin, a big cream belly, big amber eyes with small pupils under a
// thick mossy brow, a spiky grass tuft, a wide flat grumpy mouth (no nose, no ears, no neck), steel pauldrons and knee guards, a bark log
// across the chest on leather straps, five-digit fists (four fingers and a thumb). Every part bakes into ONE mesh + ONE ink hull. Each vertex carries a joint id;
// the joints are plain groups (hips, torso, head, eyes, lids, brows, tuft halves, lower lip, arms, forearms, legs, feet) posed on the CPU
// each frame and sent to the shader as matrices, so the vertex shader does the skinning (the slim three build has no SkinnedMesh).
// Modelled in his own units (1 = his height, feet at 0): his size is only root.scale, so the shapes, ink and pencil texture all scale
// together (it holds up at the super size). Visual only (no gameplay effect); global and built once at load, so nothing is per room.
const BUDDY_H = 1.0;   // world height in play: crawls through mudbot's chest (~.6 tall x .78 wide) and stands waist-deep in its dome
const texPencil = bossTex((g, w, h, rr, wrap) => {   // coloured-pencil paper: short hatching strokes, mostly one slant, some cross
  g.fillStyle = '#c2c2c2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1100; i++) { const x = rr() * w, y = rr() * h, l = 5 + rr() * 15, a = (rr() < .72 ? .85 : -.75) + (rr() - .5) * .3, c = rr() < .6 ? 95 + rr() * 60 | 0 : 222 + rr() * 30 | 0, al = .16 + rr() * .26, lw = .6 + rr() * .8;
    wrap(() => { g.strokeStyle = `rgba(${c},${c},${c},${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }); }
});
const texHair = bossTex((g, w, h, rr, wrap) => {   // moss, grass and bark grain: long soft strands, dark and light
  g.fillStyle = '#9c9c9c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 760; i++) { const x = rr() * w, y = rr() * h, l = 14 + rr() * 28, bd = (rr() - .5) * 12, c = rr() < .5 ? 55 + rr() * 50 | 0 : 200 + rr() * 50 | 0, al = .25 + rr() * .35, lw = .8 + rr();
    wrap(() => { g.strokeStyle = `rgba(${c},${c},${c},${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bd, y + l * .5, x + bd * .3, y + l); g.stroke(); }); }
});
// layers: 0 wet mud skin (pencil, glossy sheen), 1 moss / grass / bark, 2 belly (soft pencil, matte), 3 steel / sclera / straps / nails, 4 eyes (glow, like the hero's lenses)
const buddyMat = bossMat('bd', [{ t: texPencil, sc: 2.6, st: .3, rough: .42 }, { t: texHair, sc: 3.2, st: .6, rough: .9 }, { t: texPencil, sc: 2.0, st: .18, rough: .72 }, { t: texPencil, sc: 3.5, st: .12, rough: .3 }, { t: texPencil, sc: 1, st: 0, rough: .12 }],
  { rough: .6, rim: '#fff0d0', rimK: .25, self: .12, sh: [.2, 16, [1, 0, 0]] });
const BJN = 18, buddyBJ = { value: new Float32Array(BJN * 12) };   // joint matrices, 3 rows (vec4) each
const BRIG_D = 'attribute float aBone; uniform vec4 uBJ[' + BJN * 3 + '];\nmat4 bJoint(){ int i=int(aBone+.5)*3; vec4 a=uBJ[i],b=uBJ[i+1],c=uBJ[i+2]; return mat4(a.x,b.x,c.x,0.,a.y,b.y,c.y,0.,a.z,b.z,c.z,0.,a.w,b.w,c.w,1.); }\n';
{ const ob = buddyMat.onBeforeCompile; buddyMat.onBeforeCompile = sh => { ob(sh); sh.uniforms.uBJ = buddyBJ;
    sh.vertexShader = BRIG_D + sh.vertexShader.replace('#include <defaultnormal_vertex>', 'mat4 bJ=bJoint(); objectNormal=normalize(mat3(bJ)*objectNormal);\n#include <defaultnormal_vertex>')
      .replace('#include <project_vertex>', 'transformed=(bJ*vec4(transformed,1.)).xyz;\n#include <project_vertex>'); };
  buddyMat.customProgramCacheKey = () => 'buddy'; reg(buddyMat); }
const buddyInk = bossInkMat('bd', buddyMat);
{ const ob = buddyInk.onBeforeCompile; buddyInk.onBeforeCompile = sh => { ob(sh); sh.uniforms.uBJ = buddyBJ;
    sh.vertexShader = BRIG_D + sh.vertexShader.replace('#include <project_vertex>', 'transformed=(bJoint()*vec4(transformed,1.)).xyz;\n#include <project_vertex>'); };
  buddyInk.customProgramCacheKey = () => 'bink:buddy'; reg(buddyInk); }
const gLidB = new THREE.SphereGeometry(.5, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), gSphB = new THREE.SphereGeometry(.5, 24, 16), gSphS = new THREE.SphereGeometry(.5, 11, 7), gSphT = new THREE.SphereGeometry(.5, 6, 4), gConeS = new THREE.ConeGeometry(.5, 1, 8, 2);   // buddy-sized detail levels
const capBC = {}, capB = (r, len) => capBC[r + '_' + len] || (capBC[r + '_' + len] = new THREE.CapsuleGeometry(r, len, 3, 10));   // eyelid: a cap over the eyeball, rolls down to blink
const gLoftC = {}, gLoft = (R, seg, top, bot) => {   // a loft through elliptical rings [y, x0, x1, z0, z1], closed by a pole top above the highest ring and bot below the lowest
  const k = JSON.stringify([R, seg, top, bot]); if (gLoftC[k]) return gLoftC[k];
  const rows = R.slice().sort((a, b) => a[0] - b[0]), pos = [], idx = [], f = rows[0], l = rows[rows.length - 1];
  const ring = (y, x0, x1, z0, z1) => { for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pos.push((x0 + x1) / 2 + Math.cos(a) * (x1 - x0) / 2, y, (z0 + z1) / 2 + Math.sin(a) * (z1 - z0) / 2); } };
  const pole = (r, y) => ring(y, (r[1] + r[2]) / 2, (r[1] + r[2]) / 2, (r[3] + r[4]) / 2, (r[3] + r[4]) / 2);
  pole(f, f[0] - bot); for (const r of rows) ring(...r); pole(l, l[0] + top);
  const m = rows.length + 2;
  for (let q = 0; q < m - 1; q++) for (let i = 0; i < seg; i++) { const a = q * (seg + 1) + i, b = a + seg + 1, c = a + 1, d = b + 1; if (q > 0) idx.push(a, b, c); if (q < m - 2) idx.push(c, b, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return gLoftC[k] = g;
};
function buildBuddy() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig); rig.userData.o = [0, 0, 0]; const J = [], j = {};
  const jt = (n, par, x, y, z) => { const g = new THREE.Group(), po = par.userData.o; g.position.set(x - po[0], y - po[1], z - po[2]); g.userData.o = [x, y, z]; g.userData.p0 = g.position.clone(); par.add(g); J.push(g); j[n] = g; return g; };
  const P = (geo, paint, par, x, y, z, sx, sy, sz) => { const o = par.userData.o; return mk(geo, paint, x - o[0], y - o[1], z - o[2], sx, sy, sz, par); };
  const H = Math.PI / 2;
  // golem palette: wet mud skin (base / shadow / light), cream belly, amber eyes, moss brow, grass tuft, steel guards, bark log, leather straps
  const C = { skin: '#b88062', skinD: '#98634e', skinL: '#cb9c7e', belly: '#f3ead6', moss: '#aabd6c', mossD: '#8b9c59', mossL: '#c2d387', tuft: '#8fbf45', tuftL: '#c4e070', tuftD: '#6f9a34',
    white: '#f6efe2', iris: '#f2913f', irisD: '#b85a1c', pupil: '#160c08', mouth: '#3f2616', steel: '#c9c2cb', steelD: '#9a909b', rivet: '#6e6870', bark: '#be8e70', barkD: '#a67258', strap: '#6f4a32', nail: '#efe6d8' };
  const sk = BP(C.skin, 0, .018), skS = BP(C.skin, 0, 0), skD = BP(C.skinD, 0, .012), skL = BP(C.skinL, 0, .01), be = BP(C.belly, 2, .016), ms = BP(C.moss, 1, .014), msD = BP(C.mossD, 1, .01), msL = BP(C.mossL, 1, .01);
  const tf = BP(C.tuft, 1, .007), tfL = BP(C.tuftL, 1, .007), tfD = BP(C.tuftD, 1, .007), wh = BP(C.white, 3, .01), ir = BP(C.iris, 4, 0), irD = BP(C.irisD, 4, 0), pu = BP(C.pupil, 4, 0), gl = BP('#ffffff', 4, 0), mo = BP(C.mouth, 3, 0);
  const stl = BP(C.steel, 3, .013), stD = BP(C.steelD, 3, .006), rv = BP(C.rivet, 3, 0), bk = BP(C.bark, 1, .014), bkD = BP(C.barkD, 1, 0), stp = BP(C.strap, 3, .008), nl = BP(C.nail, 3, 0);
  // joints (model space, feet at 0, facing +x). earL / earR carry the two halves of the tuft, stache the lower lip (the joint names are the rig's slots)
  jt('hips', rig, 0, .2, 0); jt('torso', j.hips, 0, .26, 0); jt('head', j.torso, 0, .56, 0);
  jt('eyes', j.head, .24, .765, 0); jt('lids', j.head, .24, .765, 0); jt('browL', j.head, .25, .85, .11); jt('browR', j.head, .25, .85, -.11);
  jt('earL', j.head, 0, .92, .08); jt('earR', j.head, 0, .92, -.08); jt('stache', j.head, .24, .62, 0);
  jt('armL', j.torso, 0, .55, .3); jt('armR', j.torso, 0, .55, -.3); jt('foreL', j.armL, 0, .38, .38); jt('foreR', j.armR, 0, .38, -.38);
  jt('legL', j.hips, 0, .19, .14); jt('legR', j.hips, 0, .19, -.14); jt('footL', j.legL, 0, .06, .16); jt('footR', j.legR, 0, .06, -.16);
  // traced to the v3 turnaround art (front + side silhouettes): head, body, arms, legs are lofts through the drawn outline, one elliptical ring per height
  // (half width from the front view, depth from the side view, inset by the ink line), on the same joints as before; the face sits on the traced head
  const HD = [[0.972,-0.108,0.122,0.127],[0.958,-0.105,0.155,0.138],[0.944,-0.101,0.191,0.149],[0.93,-0.159,0.191,0.153],[0.916,-0.149,0.183,0.155],[0.902,-0.14,0.183,0.143],[0.887,-0.131,0.19,0.139],[0.873,-0.167,0.194,0.148],[0.859,-0.159,0.21,0.151],[0.845,-0.146,0.258,0.159],[0.831,-0.136,0.262,0.16],[0.817,-0.129,0.256,0.157],[0.802,-0.126,0.26,0.16],[0.788,-0.124,0.265,0.167],[0.774,-0.129,0.264,0.176],[0.76,-0.137,0.26,0.185],[0.746,-0.144,0.274,0.192],[0.732,-0.15,0.288,0.196],[0.717,-0.155,0.293,0.198],[0.703,-0.162,0.295,0.198],[0.689,-0.17,0.295,0.206],[0.675,-0.181,0.291,0.206],[0.661,-0.192,0.278,0.207],[0.647,-0.199,0.257,0.209],[0.632,-0.213,0.231,0.211],[0.618,-0.221,0.213,0.213],[0.604,-0.224,0.193,0.216],[0.59,-0.234,0.188,0.219],[0.576,-0.243,0.196,0.223],[0.562,-0.252,0.204,0.226],[0.548,-0.256,0.208,0.23],[0.533,-0.254,0.209,0.233],[0.519,-0.265,0.21,0.237],[0.516,-0.268,0.212,0.238]], TO = [[0.657,-0.194,0.278,0.208],[0.641,-0.205,0.244,0.21],[0.624,-0.217,0.221,0.212],[0.608,-0.223,0.196,0.215],[0.591,-0.234,0.187,0.219],[0.575,-0.244,0.198,0.223],[0.558,-0.254,0.205,0.227],[0.542,-0.254,0.209,0.231],[0.525,-0.259,0.209,0.235],[0.509,-0.272,0.214,0.239],[0.492,-0.284,0.215,0.243],[0.476,-0.298,0.222,0.246],[0.459,-0.309,0.229,0.249],[0.443,-0.313,0.236,0.252],[0.426,-0.313,0.241,0.253],[0.409,-0.315,0.249,0.254],[0.393,-0.318,0.254,0.247],[0.376,-0.318,0.259,0.251],[0.36,-0.315,0.264,0.255],[0.343,-0.312,0.27,0.259],[0.327,-0.307,0.274,0.261],[0.31,-0.304,0.278,0.262],[0.294,-0.307,0.277,0.262],[0.277,-0.31,0.27,0.26],[0.261,-0.312,0.255,0.258],[0.244,-0.307,0.244,0.253],[0.228,-0.276,0.234,0.247],[0.211,-0.236,0.233,0.25],[0.197,-0.227,0.234,0.257]], LGL = [[0.209,-0.053,0.113,0.025,0.252],[0.197,-0.053,0.113,0.025,0.257],[0.185,-0.053,0.113,0.025,0.261],[0.173,-0.053,0.113,0.025,0.261],[0.162,-0.053,0.113,0.025,0.255],[0.15,-0.053,0.113,0.06,0.249],[0.138,-0.053,0.113,0.072,0.242],[0.126,-0.053,0.113,0.073,0.23],[0.114,-0.053,0.113,0.075,0.221],[0.103,-0.046,0.106,0.078,0.216],[0.091,-0.042,0.102,0.083,0.212],[0.079,-0.044,0.104,0.081,0.218],[0.067,-0.049,0.109,0.078,0.23],[0.055,-0.054,0.114,0.076,0.242],[0.044,-0.058,0.133,0.076,0.257],[0.032,-0.058,0.133,0.092,0.264],[0.02,-0.058,0.133,0.119,0.254],[0.008,-0.058,0.133,0.142,0.212],[0.004,-0.058,0.133,0.158,0.205]], LGR = [[0.209,-0.053,0.113,0.025,0.252],[0.197,-0.053,0.113,0.025,0.257],[0.185,-0.053,0.113,0.025,0.261],[0.173,-0.053,0.113,0.025,0.261],[0.162,-0.053,0.113,0.025,0.255],[0.15,-0.053,0.113,0.06,0.249],[0.138,-0.053,0.113,0.072,0.242],[0.126,-0.053,0.113,0.073,0.23],[0.114,-0.053,0.113,0.075,0.221],[0.103,-0.046,0.106,0.078,0.216],[0.091,-0.042,0.102,0.083,0.212],[0.079,-0.044,0.104,0.081,0.218],[0.067,-0.049,0.109,0.078,0.23],[0.055,-0.054,0.114,0.076,0.242],[0.044,-0.058,0.133,0.076,0.257],[0.032,-0.058,0.133,0.092,0.264],[0.02,-0.058,0.133,0.119,0.254],[0.008,-0.058,0.133,0.142,0.212],[0.004,-0.058,0.133,0.158,0.205]], AR = [[0.579,0.205,0.326],[0.565,0.209,0.31],[0.551,0.212,0.309],[0.537,0.216,0.314],[0.523,0.219,0.323],[0.509,0.223,0.33],[0.494,0.226,0.338],[0.48,0.229,0.348],[0.466,0.232,0.361],[0.452,0.234,0.371],[0.438,0.236,0.377],[0.424,0.237,0.383],[0.409,0.237,0.387],[0.395,0.277,0.39],[0.381,0.284,0.392],[0.367,0.293,0.395],[0.353,0.303,0.396],[0.339,0.317,0.399],[0.325,0.329,0.4],[0.31,0.324,0.405],[0.296,0.321,0.409],[0.282,0.318,0.412],[0.268,0.314,0.414],[0.254,0.314,0.412],[0.24,0.327,0.405],[0.225,0.337,0.388],[0.221,0.345,0.373]];
  const lr = (R, y) => { let i = 0; while (i < R.length - 2 && R[i + 1][0] > y) i++; const a = R[i], b = R[i + 1], t = Math.max(0, Math.min(1, (a[0] - y) / (a[0] - b[0]))); return a.map((v, k) => v + (b[k] - v) * t); };
  const lx = (R, y, z) => { const r = lr(R, y); return (r[1] + r[2]) / 2 + (r[2] - r[1]) / 2 * Math.sqrt(Math.max(0, 1 - z * z / (r[3] * r[3]))); };   // front surface x of a loft at (y, z)
  const sym = R => R.map(r => [r[0], r[1], r[2], -r[3], r[3]]), mir = R => R.map(r => [r[0], r[1], r[2], -r[4], -r[3]]);
  const arm = (R, s) => R.map(r => { const c = (r[1] + r[2]) / 2, w = (r[2] - r[1]) / 2; return [r[0], -0.02 - w * 1.1, -0.02 + w * 1.1, s * c - w, s * c + w]; });
  // head: the traced lump (wide jowly bottom sunk into the shoulders, brow ridge and muzzle in the profile), eye sockets under the brow
  const ex = lx(HD, .775, 0) - 0.085, bx = lx(HD, .845, .115) - .222 - 0.04;
  const mvJ = (g, x, y, z) => { const po = g.parent.userData.o; g.position.set(x - po[0], y - po[1], z - po[2]); g.userData.o = [x, y, z]; g.userData.p0 = g.position.clone(); };   // face joints follow the traced face
  const mzx = lx(HD, .665, 0) - .165, mf = y => mzx + .15 * Math.sqrt(Math.max(0, 1 - ((y - .665) / .09) ** 2)), mox = mf(.645) + .002;
  const fs = (y, z) => Math.max(lx(HD, y, z), mzx + .15 * Math.sqrt(Math.max(0, 1 - ((y - .665) / .09) ** 2 - (z / .19) ** 2)));   // the face surface (head or muzzle, whichever is in front)
  const seg = (geoR, paint, par, y1, z1, y2, z2, d) => { const y = (y1 + y2) / 2, z = (z1 + z2) / 2; return rot(P(capB(geoR, Math.hypot(y2 - y1, z2 - z1)), paint, par, fs(y, z) + d, y, z, 1, 1, 1), Math.atan2(z2 - z1, y2 - y1), 0, 0); };   // a capsule laid on the face from (y1, z1) to (y2, z2)
  // eyes: round amber eyes almost all iris, big black pupils and a glint, set under the brow; the irises dart (eyes joint); the lids sit low and slant down to the nose, and roll down to blink
  const EZ = 0.09, ER = 0.056, ec = lx(HD, .775, EZ) + 0.035 - ER;
  mvJ(j.eyes, ec, .775, 0); mvJ(j.lids, ec, .775, 0); mvJ(j.browL, fs(.82, .08), .82, .08); mvJ(j.browR, fs(.82, .08), .82, -.08);
  bSc(P(gLoft(sym(HD), 28, .012, .03), sk, j.head, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .005, f: 9, lo: [.004, 4], mot: .22, dent: [[ec, .775, EZ, ER * 1.2, .012], [ec, .775, -EZ, ER * 1.2, .012]] });
  mvJ(j.stache, mox - .082, .639, 0);
  bSc(P(gSphS, sk, j.head, mzx, .665, 0, .3, .18, .38), { k: 'bump', a: .005, f: 12 });                       // muzzle: wide and flat
  for (const s of [1, -1]) bSc(P(gSphS, sk, j.head, lx(HD, .635, .13) - .13, .635, s * .13, .28, .2, .18), { k: 'bump', a: .005, f: 11 });   // jowls
  // no nose (the face rules: no nose, snout, ears or neck)
  // mouth: a wide flat grumpy toad line across the muzzle, nearly straight, the ends just turned down; a heavy lower lip under it on its own joint
  { const M = [[0.636, -0.165], [0.646, -0.13], [0.652, -0.07], [0.653, 0], [0.652, 0.07], [0.646, 0.13], [0.636, 0.165]]; for (let i = 0; i < M.length - 1; i++) seg(.01, mo, j.head, M[i][0], M[i][1], M[i + 1][0], M[i + 1][1], .006); }
  rot(bSc(P(capB(0.014, 0.17), skL, j.stache, fs(0.628, 0) - 0.014 * 1.2, 0.628, 0, 1, 1, 1), { k: 'bump', a: .003, f: 20 }), H, 0, 0);
  // eyes: big round amber eyes, almost all iris with a dark amber rim, a small black pupil and a glint; the irises dart (eyes joint); the lids only just cap the top and roll down to blink
  for (const s of [1, -1]) { P(gSphS, irD, j.head, ec, .775, s * EZ, ER * 2, ER * 2, ER * 2);
    const ea = .25, ca = Math.cos(ea), sa = s * Math.sin(ea), on = (r, dy, dz) => [ec + ca * r - sa * dz, .775 + dy, s * EZ + sa * r + ca * dz];   // the irises look forward and a little out (toad eyes, so they read in profile too)
    const disc = (paint, r, th, dia, dy, dz) => { const q = on(r, dy, dz); return rot(P(gSphS, paint, j.eyes, q[0], q[1], q[2], th, dia, dia), 0, -s * ea, 0); };
    disc(irD, ER - 0.014, 0.012 * 2 + .006, ER * 2 * 0.94, 0, 0); disc(ir, ER - 0.01, 0.012 * 2 + .008, ER * 2 * 0.8, 0, 0); disc(pu, ER - .001, .016, ER * 2 * 0.3, 0, 0);
    disc(gl, ER + .005, .01, ER * .28, ER * .28, -s * ER * .2);
    rot(P(gLidB, skD, j.lids, ec, .775, s * EZ, ER * 2.2, ER * 2.2, ER * 2.2), -s * 0.2, 0, 1.4); }
  // thick green mossy brow: a fat lumpy moss roll over each eye, low and close at the middle, up at the outside, overhanging the eyes (grumpy); the moss cap sits above
  const seg3 = (r, paint, par, a, b) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = P(capB(r, d.length()), paint, par, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1, 1, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; };   // a capsule from point a to point b (model space)
  for (const s of [1, -1]) { const b = s > 0 ? j.browL : j.browR, B = [[0.803, 0.02, 0.02], [0.82, 0.075, 0.026], [0.84, 0.13, 0.014]].map(q => [fs(q[0], q[1]) + q[2], q[0], s * q[1]]);
    for (let i = 0; i < B.length - 1; i++) bAn(bSc(seg3(0.037, i ? ms : msL, b, B[i], B[i + 1]), { k: 'bump', a: .012, f: 24 }), 7, .003);
    for (const [y, z, r] of [[.836, .05, .03], [.848, .108, .028]]) bAn(bSc(P(gSphS, s > 0 ? msL : msD, b, fs(y, z) + .012, y, s * z, r * 2, r * 1.4, r * 2), { k: 'bump', a: .008, f: 30 }), 7, .003); }
  { const c = lr(HD, .9), e = lr(HD, .87); bSc(P(gSphS, ms, j.head, (c[1] + c[2]) / 2, .925, 0, (c[2] - c[1]) * 1.0, .14, c[3] * 2 * 1.0), { k: 'bump', a: .01, f: 18, lo: [.008, 6] });
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; bSc(P(gSphT, i % 2 ? msD : msL, j.head, (e[1] + e[2]) / 2 + Math.cos(a) * (e[2] - e[1]) * .3, .865 + (i % 3) * .01, Math.sin(a) * e[3] * .65, .1, .07, .1), { k: 'bump', a: .006, f: 30 }); } }   // ragged moss edge
  // spiky grass tuft: a crown of blades, the tall ones in the middle, light tips (ruffles in the shader), as tall and spread as drawn
  for (let i = 0; i < 17; i++) { const a = i * 2.4, rr = i < 4 ? .03 : i < 10 ? .1 : .17, x = .0 + Math.cos(a) * rr * 1.0, z = Math.sin(a) * rr * 0.95, h = (.3 - rr * .75 + bH(i, 4, 7) * .06) * 0.6, tl = (.18 + rr * 2.1) * 1.0, w = .05 - rr * .08;
    const tx = Math.cos(a) * tl, tz = Math.sin(a) * tl, half = z >= 0 ? j.earL : j.earR, cx = x + Math.sin(tx) * h * .5, cz = z + Math.sin(tz) * h * .5;
    bAn(rot(P(gConeS, i % 3 === 0 ? tfL : i % 3 === 1 ? tf : tfD, half, cx, 0.93 + h * .45, cz, w, h, w), tz, 0, -tx), 7, .006); }
  // body: the traced pear with a cream pot belly and a navel, shoulders that the head sinks into
  bAn(bSc(P(gLoft(sym(TO), 28, .03, .035), sk, j.torso, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .005, f: 10, mot: .22 }), 1, .004);
  const BE = TO.filter(r => r[0] >= .2 && r[0] <= .44).map(r => { const t = (r[0] - .2) / .24, q = Math.sqrt(Math.sin(Math.PI * t)), rx = (r[2] - r[1]) / 2 * .8, f = r[2] + 0.016 * q - .004, hz = Math.min(.23, r[3] * .9) * (.55 + .45 * q); return [r[0], f - 2 * rx, f, -hz, hz]; });   // the cream belly: a skin of the traced front, just proud of it
  bAn(bSc(P(gLoft(BE, 24, .012, .012), be, j.torso, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .002, f: 12, dent: [[lx(TO, .31, 0) + .01, .31, 0, .02, .011]] }), 1, .007);
  // bark log across the chest on leather straps (two up over the shoulders, two down to the belly), steel buckles
  const lgx = lx(TO, .51, 0) - .035, ux = lx(TO, .61, .15) - .02, dx = lx(TO, .42, .15) - .005;
  rot(bSc(P(boxHG(.11, .13, .4), bk, j.torso, lgx, .51, 0, .11, .13, .4), { bev: .035, k: 'bump', a: .01, f: 16 }), 0, 0, -.18);
  for (const z of [-.12, .02, .15]) rot(P(gSphT, bkD, j.torso, lgx + .06, .525 + z * .1, z * .9, .02, .03, .06), 0, 0, -.18);   // knots and grooves
  for (const s of [1, -1]) { rot(P(boxHG(.03, .2, .045), stp, j.torso, ux, .615, s * .15, .03, .18, .045), 0, 0, .6);
    rot(P(boxHG(.03, .14, .045), stp, j.torso, dx, .41, s * .15, .03, .1, .045), 0, 0, -.2); P(gSphT, stl, j.torso, dx + .02, .44, s * .15, .025, .04, .055); }
  // legs: traced short sturdy legs (the near one set back, as in the side view) with wide feet; steel knee guards with rivets; three toes with pale nails
  for (const s of [1, -1]) { const L = s > 0 ? j.legL : j.legR, F = s > 0 ? j.footL : j.footR, R = (s > 0 ? LGL : mir(LGR)).map(r => { const c = q => Math.max(0, Math.min(1, q)), d = (s > 0 ? 0.09 : -0.16) * c((.13 - r[0]) / .08); return [r[0], r[1] + d - 0.17 * c((r[0] - .05) / .08), r[2] + d, r[3], r[4]]; });   // heavy hams; the far (left) foot steps forward, the near one back, as drawn
    bSc(P(gLoft(R.filter(r => r[0] >= .07), 20, .04, 0), sk, L, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .004, f: 12 });
    bSc(P(gLoft(R.filter(r => r[0] <= .1), 20, 0, 0), sk, F, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .004, f: 14 });
    const k = lr(R, .176), kz = (k[3] + k[4]) / 2, kx = Math.max(k[2] - .03, lx(TO, .197, kz) - .025), f = lr(R, .03), tx = f[2] - .015, tz = (f[3] + f[4]) / 2;
    bSc(P(gSphS, stl, L, kx, .176, kz, .1, .1, .13), { k: 'bump', a: .002, f: 20 });
    for (const [y, z] of [[.205, .035], [.15, .035], [.178, -.045]]) P(gSphT, rv, L, kx + .048, y, kz + s * z, .02, .02, .02);
    for (const q of [-1, 0, 1]) { const z = tz + s * q * .05; bSc(P(gSphS, skD, F, tx, .03, z, .07, .06, .06), { k: 'bump', a: .003, f: 20 }); P(gSphT, nl, F, tx + .035, .026, z, .028, .026, .034); } }
  // arms: traced, hanging beside the belly; steel pauldrons with rivets; five-digit fists (four fingers and a thumb, the crew hand rule) with pale nails
  for (const s of [1, -1]) { const A = s > 0 ? j.armL : j.armR, F = s > 0 ? j.foreL : j.foreR, R = arm(AR, s);
    bSc(P(gLoft(R.filter(r => r[0] >= .37), 16, .03, 0), sk, A, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .004, f: 14 });
    bSc(P(gLoft(R.filter(r => r[0] <= .395), 16, 0, .02), sk, F, 0, 0, 0, 1, 1, 1), { k: 'bump', a: .004, f: 16 });
    rot(bSc(P(gSphS, stl, A, -0.02, 0.617, s * 0.262, 0.22, 0.12, 0.15), { k: 'bump', a: .002, f: 16 }), s * 0.3, 0, 0);
    for (const [x, y, z] of [[.07, 0.617 + .005, 0.262 + .04], [-.07, 0.617 + .005, 0.262 + .04], [0, 0.617 + .055, 0.262]]) P(gSphT, rv, A, x + -0.02, y, s * z, .022, .022, .022);
    const f = lr(R, .25), fx = (f[1] + f[2]) / 2 + (f[2] - f[1]) / 2 - .012, fz = Math.abs((f[3] + f[4]) / 2);
    for (const k of [0, 1, 2, 3]) { const z = s * (fz + .0025 + (k - 1.5) * .0183); P(gSphS, skD, F, fx, .245, z, .05, .056, .03); P(gSphT, nl, F, fx + .021, .23, z, .018, .017, .016); }   // four fingers inside the old two-finger fist's span (z .0849 <= .088)
    P(gSphS, skD, F, fx - .012, .29, s * (fz - .055), .055, .05, .045); }
  const own = [], mesh = bossBake(rig, buddyMat, own, null, buddyInk, { bones: new Map(J.map((g, i) => [g, i])), aoS: .15 });
  mesh.frustumCulled = false; mesh.userData.ink.frustumCulled = false; mesh.receiveShadow = true;
  return { root, J, j, par: J.map(g => J.indexOf(g.parent)), W: J.map(() => new THREE.Matrix4()), mesh, ink: mesh.userData.ink, own,
    tris: own.reduce((n, g) => n + g.index.count / 3, 0) };
}
const _bjT = new THREE.Matrix4();
function buddyRig(bd) {   // joint matrices: (pose, relative to the rig) x (bind pose)^-1, packed as 3 rows per joint
  const a = buddyBJ.value;
  for (let i = 0; i < bd.J.length; i++) { const g = bd.J[i], pi = bd.par[i], o = g.userData.o; g.updateMatrix();
    if (pi < 0) bd.W[i].copy(g.matrix); else bd.W[i].multiplyMatrices(bd.W[pi], g.matrix);
    const e = _bjT.copy(bd.W[i]).multiply(_bkM.makeTranslation(-o[0], -o[1], -o[2])).elements;
    for (let r = 0; r < 3; r++) { const k = i * 12 + r * 4; a[k] = e[r]; a[k + 1] = e[4 + r]; a[k + 2] = e[8 + r]; a[k + 3] = e[12 + r]; } }
}
const buddy = Object.assign(buildBuddy(), { on: true, init: false, x: 0, y: 0, face: 1, ph: 0, prev: null, mound: null, lk: [0, 0], blinkT: 2 });
buddy.root.visible = false; scene.add(buddy.root); buddyRig(buddy);
// pose: stride while following, tuck in a hop, breathe, glance around (at the hero now and then), blink, twitch brows, ears and mustache.
// o: { mv: 0..1 walking, air: 0..1 hop, look: yaw bias toward something, lookAmt: glance size, wave: 0..1 right arm up waving, deep: 0..1 buried }
function poseBuddy(b, dt, o) {
  const j = b.j, t = VT, R = (g, k, v, r) => { g.rotation[k] = hold(g.rotation[k], v, dt, r || 18); }, s = Math.sin(b.ph), mv = o.mv, air = o.air, br = Math.sin(t * 2.6);
  const tw = (q, f) => Math.pow(Math.max(0, Math.sin(t * f + q) * Math.sin(t * f * 2.7 + q * 1.7)), 6);   // rare quick twitch
  R(j.legL, 'z', s * .8 * mv + air * .75); R(j.legR, 'z', -s * .8 * mv + air * .45);
  R(j.footL, 'z', -Math.max(0, -s) * .6 * mv - air * .55); R(j.footR, 'z', -Math.max(0, s) * .6 * mv - air * .5);
  const ak = o.arm || 0, sl = o.slam ? ak : 0, ar = o.arm !== undefined ? 30 : 18;   // super swing (arm: wind-up up to ~2.6, chop down past 0); a slam swings both arms
  R(j.armL, 'z', -s * .7 * mv + br * .04 * (1 - mv) + sl + (o.armL || 0), ar); R(j.armR, 'z', s * .7 * mv - br * .04 * (1 - mv) + ak, ar);
  R(j.armL, 'x', -.12 - air * 1.5 - mv * .1); R(j.armR, 'x', .12 + air * 1.2 + mv * .1 + o.wave * 2.5);
  R(j.foreL, 'z', .2 + mv * .45 + air * .3); R(j.foreR, 'z', .2 + mv * .45 + air * .5 + o.wave * Math.sin(t * 10) * .55);
  R(j.torso, 'z', -.13 * mv + air * .08 + Math.min(0, -ak) * .35 + Math.max(0, ak) * .08 + (o.lean || 0), 12); R(j.torso, 'y', s * .14 * mv, 12); R(j.torso, 'x', br * .015, 8);
  j.hips.position.y = j.hips.userData.p0.y + Math.abs(Math.cos(b.ph)) * .03 * mv + br * .004;
  // look around: glances every ~1.6 s, mostly toward o.look; bigger when standing still or stuck in the dirt
  const gi = Math.floor(t * .62 + 3), gy = (bH(gi, 3, 9) - .5) * 2, gp = (bH(gi, 7, 2) - .5);
  b.lk[0] = hold(b.lk[0], o.look + gy * o.lookAmt * (1 - mv * .7), dt, 6); b.lk[1] = hold(b.lk[1], gp * .35 * o.lookAmt + air * .15, dt, 6);
  R(j.head, 'y', b.lk[0], 14); R(j.head, 'z', b.lk[1] + s * .05 * mv + (o.tilt || 0), 14); R(j.head, 'x', Math.sin(t * .9) * .06 * (1 - mv) + o.deep * Math.sin(t * 1.7) * .12, 10);
  j.eyes.position.z = j.eyes.userData.p0.z + Math.max(-1, Math.min(1, (bH(Math.floor(t * 1.9), 1, 5) - .5) * 3)) * .012; R(j.eyes, 'z', gp * .25, 20);
  b.blinkT -= dt; if (b.blinkT < -.13) b.blinkT = 2.2 + bH(Math.floor(t), 9, 4) * 2.6; j.lids.rotation.z = b.blinkT < 0 ? -1.5 - 1.4 : -air * .25;   // lids: high on the round eyes at rest (built into the lids), up a bit in a hop
  const sur = air * .02 + tw(1, .5) * .018; for (const [g, q] of [[j.browL, 0], [j.browR, 2.3]]) { g.position.y = g.userData.p0.y + sur + tw(q, .9) * .012 - mv * .006; R(g, 'x', (g === j.browL ? 1 : -1) * (tw(q, .9) * .25 - .08), 20); }
  R(j.earL, 'x', tw(.7, 1.3) * .14 + air * .12 + s * .04 * mv, 24); R(j.earR, 'x', -tw(2.9, 1.1) * .14 - air * .12 - s * .04 * mv, 24);   // the two tuft halves bounce
  R(j.stache, 'z', tw(5, .8) * .12 + Math.sin(t * 7) * .02 * tw(5, .8), 24); j.stache.position.y = j.stache.userData.p0.y + tw(5, .8) * .008;
  buddyMat.userData.U.uAn.value.x = br; buddyRig(b);
}
// dev-only preview (off by default): ?buddyprev=scale|dome|buried (or 1 to cycle) or __jr.buddyPrev(mode) poses him next to mudbot,
// standing waist-deep in the soil of mudbot's head dome, or buried to the chin there. It only moves the buddy (parented to the hero's head
// group while previewing); no game state, no hero model change, no hatch behaviour.
const BPREV = ['scale', 'dome', 'buried'], bpq = qs.get('buddyprev'); buddy.prev = bpq ? (BPREV.includes(bpq) ? bpq : 'cycle') : null;
function buddyMound() {   // a soil mound the same colour/finish as the dome's heap, made once on first preview
  if (buddy.mound) return buddy.mound; const geo = new THREE.IcosahedronGeometry(.5, 2), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = .85 + (Math.sin(p.getX(i) * 31 + p.getZ(i) * 17) * .5 + .5) * .3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } geo.computeVertexNormals();
  buddy.mound = new THREE.Mesh(geo, MS('#492f29', 1, 0, 0, true)); buddy.mound.visible = false; return buddy.mound;
}
function previewBuddy(p, dt, mode) {
  const b = buddy, m = buddyMound();
  if (mode === 'scale') { if (b.root.parent !== scene) scene.add(b.root); m.visible = false;
    b.root.position.set(X(p.x) + 2.3, Math.max(0, Y(p.y)), .5); b.root.rotation.set(0, -Math.PI / 2 - .55, 0); b.root.scale.setScalar(BUDDY_H);
    poseBuddy(b, dt, { mv: 0, air: 0, look: -.5, lookAmt: .6, wave: 0, deep: 0 }); }
  else { const deep = mode === 'buried', hs = BUDDY_H / HS; if (b.root.parent !== pl.head) pl.head.add(b.root); if (m.parent !== pl.head) pl.head.add(m);
    b.root.position.set(.4, deep ? .08 : .17, 0); b.root.rotation.set(0, 0, 0); b.root.scale.setScalar(hs);   // in front of the seedling, nose clear of the glass
    m.visible = true; m.position.set(.38, deep ? .45 : .4, 0); m.scale.set(deep ? .8 : .7, deep ? .3 : .17, deep ? .9 : .8);   // waist-deep / buried to the chin
    poseBuddy(b, dt, { mv: 0, air: 0, look: 0, lookAmt: deep ? 1.3 : .9, wave: Math.max(0, Math.sin(VT * .9)) > .8 ? 1 : 0, deep: deep ? 1 : 0 }); }
  b.root.visible = true;
}
function syncBuddy(p, dt) {
  const b = buddy; if (!b.on || !p || G.state === 'title') { b.root.visible = false; b.init = false; if (b.mound) b.mound.visible = false; supOff(); mechHide(); return; }
  if (b.prev) { previewBuddy(p, dt, b.prev === 'cycle' ? BPREV[Math.floor(VT / 6) % 3] : b.prev); return; }
  if (syncTMode(p, dt)) return;
  if (syncSuper(p, dt)) return;
  const tx = X(p.x) - p.face * 1.9, ty = Math.max(0, Y(p.y)) * .55;   // a step behind the hero; half-height hops when the hero jumps
  b.rk = Math.max(0, Math.min(1, (b.rk || 0) + (G.bud && G.bud.ride ? 1 : -1) * dt / RIDE_HOP));   // 0 on foot .. 1 in the dome (the hop between)
  if (b.rk > 0) { if (b.rk >= 1 || !b.init) { b.x = tx; b.y = 0; b.face = p.face; b.init = true; } rideBuddy(p, dt); return; }
  if (b.root.parent !== scene) { scene.add(b.root); b.root.rotation.set(0, b.face > 0 ? -.62 : Math.PI + .62, 0); } if (b.mound) b.mound.visible = false;
  if (supV.back && (Math.abs(tx - b.x) < .5 || G.room !== supV.room)) supV.back = false;   // after a shrink he walks back to his spot instead of popping there
  if (!b.init || (Math.abs(tx - b.x) > 8 && !supV.back)) { b.x = tx; b.y = ty; b.init = true; }   // first frame, respawn or room change: appear in place
  b.x = hold(b.x, tx, dt, 3.2); b.y = hold(b.y, ty, dt, 5);
  const gap = Math.abs(tx - b.x); b.ph += dt * (5 + gap * 4);
  if (gap > .25) b.face = tx > b.x ? 1 : -1; else b.face = p.face;
  const hop = b.y < .05 ? Math.abs(Math.sin(b.ph)) * Math.min(.3, gap * .3) : 0;
  b.root.visible = true; b.root.position.set(b.x, b.y + hop, -.7); b.root.scale.setScalar(BUDDY_H);
  b.root.rotation.y = hold(b.root.rotation.y, b.face > 0 ? -.62 : Math.PI + .62, dt, 10);   // 3/4 view like the hero
  const mv = Math.min(1, gap / .9), air = Math.min(1, Math.max(0, b.y - .05) * 1.2 + hop * 2);
  poseBuddy(b, dt, { mv, air, look: (Math.abs(X(p.x) - b.x) > .3 ? .25 : 0), lookAmt: .55, wave: 0, deep: 0 });
}
/* riding in the dome: parented to mudbot's head (like the 'buried' preview), beside the seedling, a soil mound around his middle.
   The hop in / out is an arc in world space between his spot on the ground and the dome. */
const RIDE_POS = new THREE.Vector3(.3, .08, .2), RIDE_HOP = .55, _rA = new THREE.Vector3();
const rideV = { gems: -1, wave: 0, duck: 0, turn: 0, look: 0, tgt: null };
function budNear(p) { return !buddy.init || Math.abs(buddy.x - X(p.x)) < RIDE_NEAR; }
function rideAI(p, dt) {   // his own mind: what is worth a stare, a duck or a wave
  const V = rideV, rs = G.rs, f = p.face; let best = null, bd = 110;   // px
  if (rs) { for (const c of rs.crawlers) if (!c.dead) { const d = Math.abs(c.x - p.x); if (d < bd) { bd = d; best = c.x; } }
    for (const l of rs.logs) { const d = Math.abs(l.x - p.x); if (d < bd) { bd = d; best = l.x; } }
    const bs = rs.boss; if (bs && !bs.dead) best = bs.x; }   // a boss always gets the stare
  V.tgt = best === null ? null : (best - p.x) * f >= 0 ? 'ahead' : 'behind';
  V.look = hold(V.look, V.tgt === 'behind' ? -1.1 : 0, dt, 5); V.turn = hold(V.turn, V.tgt === 'behind' ? -.8 : 0, dt, 4);   // behind: over his shoulder (toward the camera)
  const g = G.got.size; if (V.gems < 0 || g < V.gems) V.gems = g; if (g > V.gems) V.wave = 1.6; V.gems = g; V.wave = Math.max(0, V.wave - dt);
  V.duck = hold(V.duck, pl.hurtT > 0 ? -.2 : 0, dt, 10);
  return { look: V.look, amt: V.tgt ? .3 : 1.3, wave: V.wave > 0 ? 1 : 0 };
}
function rideBuddy(p, dt) {
  const b = buddy, m = buddyMound(), u = b.rk, ai = rideAI(p, dt); if (m.parent !== pl.head) pl.head.add(m);
  m.position.set(RIDE_POS.x - .02, .45, RIDE_POS.z); m.scale.set(.8, .3, .9); m.visible = u > .6; if (m.visible) m.scale.multiplyScalar(Math.min(1, (u - .6) / .3));
  if (u >= 1) { if (b.root.parent !== pl.head) pl.head.add(b.root);
    b.root.position.copy(RIDE_POS); b.root.position.y += rideV.duck; b.root.rotation.set(0, rideV.turn, 0); b.root.scale.setScalar(BUDDY_H / HS); b.root.visible = true;
    poseBuddy(b, dt, { mv: 0, air: 0, look: ai.look, lookAmt: ai.amt, wave: ai.wave, deep: 1 }); return; }
  if (b.root.parent !== scene) scene.add(b.root);
  pl.head.updateWorldMatrix(true, false); _rA.copy(RIDE_POS); pl.head.localToWorld(_rA);
  const e = u * u * (3 - 2 * u), gz = -.7;
  b.root.visible = true; b.root.scale.setScalar(BUDDY_H);
  b.root.position.set(b.x + (_rA.x - b.x) * e, b.y + (_rA.y - b.y) * e + Math.sin(Math.PI * u) * 1.5, gz + (_rA.z - gz) * e);
  b.root.rotation.y = hold(b.root.rotation.y, pl.root.rotation.y, dt, 8);
  poseBuddy(b, dt, { mv: 0, air: 1, look: 0, lookAmt: .4, wave: 0, deep: 0 });
}
/* super buddy look (very colourful and dramatic in super mode). Same rigged mesh, scaled to SUPER.SIZE x mudbot's height.
   The colour cycling is his own material's rim light and self light (no extra draw calls). Extra draw calls: one additive aura billboard
   behind him (while super) and one additive shockwave ring on the ground slams (only while it expands). The colour burst, sparks, dust,
   chips and the rainbow trail use the shared particle pools. Entrance: a colour burst, he puffs up in a leap and lands with a ground slam.
   Low meter: the aura flickers red. Shrink: he wobbles back down to normal in a puff. */
let HERO_H = 0;
function heroH() {   // mudbot's height in world units (model at its display scale, shield off), measured once
  if (!HERO_H) { const par = shield.root.parent, s0 = pl.root.scale.x, v0 = pl.root.visible; if (par) par.remove(shield.root);
    pl.root.scale.setScalar(HS); pl.root.updateMatrixWorld(true); let y0 = 1e9, y1 = -1e9; const v = new THREE.Vector3();   // (the trimmed three build has no Box3: walk the mesh bounds by hand)
    pl.root.traverse(o => { if (!o.isMesh || !o.geometry) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
      for (let i = 0; i < 8; i++) { v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } });
    HERO_H = y1 - y0;
    pl.root.scale.setScalar(s0); pl.root.visible = v0; if (par) par.add(shield.root); pl.root.updateMatrixWorld(true); }
  return HERO_H;
}
const supAuraM = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
const supRingM = reg(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
const supV = { aura: new THREE.Mesh(gQuad, supAuraM), ring: new THREE.Mesh(gRing, supRingM), k: 0, hue: 0, ringT: 9, ringX: 0, armT: 9, slamPose: false, leap: 0, shrinkT: 0, wasOn: false, back: false, room: -1, lastX: 0, scale: BUDDY_H, zOff: 0 };
supV.aura.visible = supV.ring.visible = false; supV.aura.renderOrder = supV.ring.renderOrder = 4; supV.aura.frustumCulled = supV.ring.frustumCulled = false; scene.add(supV.aura, supV.ring);
const RIM0 = new THREE.Color('#fff0d0'), COL0 = buddyMat.color.clone(), _hc = new THREE.Color(), _hc2 = new THREE.Color();
/* junk mech armour (in super, buddy morphs into a mech made of junk armour). Look from the patchwork scrap concept: teal, yellow and
   red-orange scrap plates with rust patches and rivets, big riveted steel pauldrons and knee cups, grey shin plates and steel boots,
   red-orange collar and forearm cuffs, a bark-plank belt, copper exhaust pipes up the back; the cream belly stays bare in the middle and
   the head stays bare, so the face and the tuft always show. Chunky pieces and bold colour blocks so it reads at game size and on a phone.
   Procedural only: ONE InstancedMesh of a subdivided box that the vertex shader rounds per piece (aRnd: 0 a chunky plate, 1 a dome or a
   rivet). Its ink outline rides in the same geometry: a second copy with flipped faces that the vertex shader pushes out a fixed world
   width and paints ink, so the whole mech is still +1 draw call. Each piece rides one of buddy's joints.
   Morph-in (the grow): the pieces fly in from around him, spinning, and snap on bottom-up with a spark. Morph-out (the shrink): every
   piece breaks off, tumbles and bounces on the ground, then fades. Rainbow over the paint: a cycling fresnel rim, a faint shared
   emissive and a light hue lean per piece; the patchwork colours stay readable. */
const gMech = (() => {
  const b = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), n = b.attributes.position.count, A = b.attributes.position.array, ix = b.index.array;
  const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), ink = new Float32Array(n * 2), idx = [];
  for (let i = 0; i < n; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2], l = Math.hypot(x, y, z) || 1;
    for (const h of [0, 1]) { const k = (i + h * n) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; nor[k] = x / l; nor[k + 1] = y / l; nor[k + 2] = z / l; ink[i + h * n] = h; } }
  for (let t = 0; t < ix.length; t += 3) idx.push(ix[t], ix[t + 1], ix[t + 2]);
  for (let t = 0; t < ix.length; t += 3) idx.push(ix[t] + n, ix[t + 2] + n, ix[t + 1] + n);   // the ink shell: same points, faces flipped
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aInk', new THREE.Float32BufferAttribute(ink, 1)); g.setIndex(idx); b.dispose(); return g;
})();
const mechMat = reg(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .7, metalness: 0, flatShading: true, emissive: '#000000' }));
const mechU = { uRimC: { value: new THREE.Color('#ffffff') }, uRimK: { value: 0 }, uInkW: { value: .02 }, uInkS: { value: .05 } };
mechMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, mechU);
  sh.vertexShader = 'attribute float aInk; attribute float aRnd; uniform float uInkW; uniform float uInkS; varying float vInk;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n vec3 mD=normalize(position); transformed=mix(position,mD*.5,aRnd); vInk=aInk;\n'
    + ' { vec3 mS=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)); transformed+=aInk*mD*uInkW*clamp(max(mS.x,max(mS.y,mS.z))/uInkS,0.,1.)/max(mS,vec3(1e-4)); }');
  sh.fragmentShader = 'uniform vec3 uRimC; uniform float uRimK; varying float vInk;\n' + sh.fragmentShader
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance+=uRimC*uRimK*pow(1.-clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.),3.);')
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.118,.094,.086),vInk);'); };
mechMat.customProgramCacheKey = () => 'mech';
const MECH = (() => {
  const H = Math.PI / 2, teal = '#2f8f98', tealL = '#4fb3b5', tealD = '#22707a', yel = '#f2bf2a', red = '#e8553a', redD = '#a83a2e', rust = '#9a4a2c', steel = '#bcc4cc', steelB = '#d6dce2',
    grey = '#9a99a3', rivet = '#4a4c52', bark = '#b8875f', barkD = '#8a5d3d', copper = '#c48a52';
  const L = [];   // [joint, x, y, z, rx, ry, rz, sx, sy, sz, colour, kind, round]  (bind-pose model coords like buildBuddy; kind 0 plate, 1 band / pipe, 2 rivet / bolt)
  const add = (...a) => L.push(a);
  for (const s of [1, -1]) { const lg = s > 0 ? 'legL' : 'legR', ft = s > 0 ? 'footL' : 'footR', ar = s > 0 ? 'armL' : 'armR', fo = s > 0 ? 'foreL' : 'foreR';
    // boots and legs
    add(ft, .05, .065, s * .165, 0, 0, 0, .36, .14, .27, steel, 0, .5);              // steel boot
    add(ft, .19, .05, s * .165, 0, 0, 0, .11, .1, .23, grey, 0, .7);                 // toe cap
    add(ft, .04, .012, s * .165, 0, 0, 0, .4, .035, .29, rivet, 0, .15);             // sole
    add(lg, .1, .11, s * .158, 0, 0, .1, .08, .13, .2, grey, 0, .25);               // shin plate
    add(lg, .02, .12, s * .26, s * .2, 0, 0, .17, .16, .07, s > 0 ? teal : yel, 0, .25);   // shin side plate
    add(lg, .12, .2, s * .158, 0, 0, 0, .13, .13, .18, steelB, 0, .9);              // knee cup
    add(lg, .19, .2, s * .158, 0, 0, H, .035, .03, .035, rivet, 2, 1);              // knee bolt
    add(lg, .05, .27, s * .21, s * .25, 0, -.15, .26, .13, .22, s > 0 ? teal : red, 0, .3);   // thigh plate
    // pauldrons, arm plates, cuffs
    add(ar, 0, .615, s * .335, s * .42, 0, 0, .31, .19, .3, steel, 0, .92);         // big pauldron dome
    add(ar, 0, .55, s * .41, s * .65, 0, 0, .25, .07, .17, s > 0 ? teal : red, 0, .35);   // pauldron skirt
    for (const [x, y, z] of [[.1, .62, .37], [-.1, .62, .37], [0, .7, .31], [0, .6, .45]]) add(ar, x, y, s * z, 0, 0, H, .035, .03, .035, rivet, 2, 1);
    add(ar, .01, .45, s * .43, s * .15, 0, 0, .15, .13, .06, s > 0 ? yel : tealL, 0, .3);   // upper-arm plate
    add(fo, .01, .3, s * .4, 0, 0, .1, .18, .14, .18, red, 1, .65);                 // forearm cuff
    add(fo, .015, .235, s * .405, 0, 0, .1, .19, .04, .19, redD, 1, .7);           // cuff ring
    add(fo, .105, .3, s * .4, 0, 0, H, .035, .03, .035, rivet, 2, 1);               // cuff bolt
    // chest, collar, sides, back
    add('torso', .27, .5, s * .2, 0, -s * .6, -.2, .1, .17, .24, s > 0 ? tealL : teal, 0, .3);   // pec plate
    add('torso', .07, .46, s * .37, 0, -s * 1.3, 0, .1, .27, .27, yel, 0, .3);         // side panel
    add('torso', .14, .635, s * .23, 0, -s * .75, -.25, .09, .085, .2, red, 1, .55);    // collar side
    add('torso', -.31, .66, s * .14, 0, 0, .2, .075, .34, .075, copper, 1, .8);         // exhaust pipe up the back
    add('torso', -.345, .84, s * .145, 0, 0, .2, .1, .045, .1, rivet, 2, .6);           // exhaust cap
    for (const [x, y, z] of [[.3, .61, .06], [.31, .45, .2], [.13, .55, .37]]) add('torso', x, y, s * z, 0, 0, H, .03, .025, .03, rivet, 2, 1);   // chest rivets
    add('torso', .21, .3, s * .33, 0, -s * 1.05, 0, .07, .1, .25, bark, 0, .15);      // belt side plank
  }
  add('torso', .27, .64, 0, 0, 0, -.35, .09, .085, .2, red, 1, .55);                     // collar front
  add('torso', .33, .49, .25, 0, -.6, -.2, .02, .08, .09, rust, 0, .35);                // rust patch on the pec
  add('torso', .29, .44, -.17, 0, .45, -.1, .02, .06, .08, rust, 0, .35);               // rust patch low on the side
  add('torso', .4, .29, .1, 0, -.3, 0, .07, .1, .22, bark, 0, .15);                    // belt front planks
  add('torso', .4, .29, -.1, 0, .3, 0, .07, .1, .22, barkD, 0, .15);
  add('torso', .44, .29, 0, 0, 0, 0, .05, .12, .13, steel, 0, .2);                        // buckle
  add('torso', .47, .29, 0, 0, 0, 0, .02, .05, .055, rivet, 2, .3);
  add('torso', -.31, .3, 0, 0, 0, 0, .06, .09, .44, bark, 0, .15);                      // belt back plank
  add('torso', -.26, .47, 0, 0, 0, .15, .09, .3, .52, tealD, 0, .3);                    // back plate
  add('torso', -.31, .52, .12, 0, 0, .15, .02, .11, .13, yel, 0, .3);                   // patch on it
  add('torso', -.3, .42, -.14, 0, 0, .15, .02, .08, .1, rust, 0, .35);
  return L;
})();
const mech = { mesh: new THREE.InstancedMesh(gMech, mechMat, MECH.length), mode: 'off', t: 0, P: [] };
{ const order = { footL: 0, footR: 0, legL: 1, legR: 1, hips: 2, torso: 3, armL: 4, armR: 4, foreL: 5, foreR: 5, head: 6 }, c = new THREE.Color(), E = new THREE.Euler(), rnd0 = new Float32Array(MECH.length);
  MECH.forEach((a, i) => { const [jn, x, y, z, rx, ry, rz, sx, sy, sz, col, kind, rd] = a, g = buddy.j[jn], o = g.userData.o; rnd0[i] = rd;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x - o[0], y - o[1], z - o[2]), new THREE.Quaternion().setFromEuler(E.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    mech.P.push({ g, m, col: new THREE.Color(col), kind, delay: .08 + order[jn] * .075 + (kind === 2 ? .12 : 0) + (i % 3) * .02,
      p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), av: new THREE.Vector3(), from: new THREE.Vector3(), fq: new THREE.Quaternion(), snapped: false });
    mech.mesh.setColorAt(i, c.copy(mech.P[i].col)); });
  gMech.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd0, 1));
  mech.mesh.frustumCulled = false; mech.mesh.visible = false; mech.mesh.renderOrder = 1; scene.add(mech.mesh); }
const _mM = new THREE.Matrix4(), _mP = new THREE.Vector3(), _mQ = new THREE.Quaternion(), _mS = new THREE.Vector3(), _mE = new THREE.Euler(), _mQ2 = new THREE.Quaternion(), _mC = new THREE.Color();
function mechHide() { mech.mode = 'off'; mech.mesh.visible = false; }
function mechSlot(P) { return _mM.multiplyMatrices(P.g.matrixWorld, P.m); }   // where a piece sits on him right now (world)
function mechStart(mode, cx, z, src) {   // src: fly in from that point (the cutscene: out of mudbot's chest)   // 'in': pick a start point around him for every piece; 'out': knock every piece off with a kick
  mech.mode = mode; mech.t = 0; mech.mesh.visible = true; buddy.root.updateMatrixWorld(true);
  for (const P of mech.P) { mechSlot(P).decompose(P.p, P.q, P.s); P.snapped = false;
    if (mode === 'in' && src) { P.from.set(src.x + rnd(-.25, .25), src.y + rnd(-.2, .2), src.z + rnd(-.2, .2)); P.fq.setFromEuler(_mE.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3))); }
    else if (mode === 'in') { const a = Math.random() * 6.28, r = rnd(2.2, 4.2); P.from.set(cx + Math.cos(a) * r, Math.max(.3, P.p.y + Math.sin(a) * r * .7 + rnd(.5, 2)), z + rnd(-1.5, 2.5));
      P.fq.setFromEuler(_mE.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3))); }
    else { const dx = P.p.x - cx; P.v.set(dx * 2.2 + rnd(-1.6, 1.6), rnd(2.5, 5.5), rnd(-1, 2.2)); P.av.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)); } }
}
function mechSync(dt, k, hue, low, fl, cx, z) {   // every frame while super is on (and while the pieces are still falling after)
  const M = mech, s = G.sup; if (M.mode === 'off') return; M.t += dt; const n = M.P.length;
  if (M.mode === 'in' || M.mode === 'on') { buddy.root.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) { const P = M.P[i]; mechSlot(P);
      if (M.mode === 'in') { const u = Math.min(1, Math.max(0, (M.t - P.delay) / .34));
        if (u < 1) { _mM.decompose(_mP, _mQ, _mS); const e = 1 - Math.pow(1 - u, 3);
          _mP.lerpVectors(P.from, _mP, e); _mQ2.copy(P.fq).slerp(_mQ, e); _mS.multiplyScalar(u <= 0 ? 0 : .4 + .6 * e); _mM.compose(_mP, _mQ2, _mS); }
        else { if (!P.snapped) { P.snapped = true; P.snapT = M.t; if (P.kind !== 2) { _mP.setFromMatrixPosition(_mM); fxSpark(_mP.x, _mP.y, 3, '#fff2c0', 4, _mP.z + .2); } }
          const pop = Math.max(0, 1 - (M.t - P.snapT) / .12) * .18; if (pop > 0) { _mM.decompose(_mP, _mQ, _mS); _mS.multiplyScalar(1 + pop); _mM.compose(_mP, _mQ, _mS); } } }
      M.mesh.setMatrixAt(i, _mM); }
    if (M.mode === 'in' && M.t > M.P.reduce((a, P) => Math.max(a, P.delay), 0) + .5) { M.mode = 'on'; addShake(.25); } }
  else if (M.mode === 'out') {   // falling apart: tumble, bounce on the ground, then shrink away
    const g = 16, fade = Math.min(1, Math.max(0, (M.t - 1.1) / .5));
    for (let i = 0; i < n; i++) { const P = M.P[i]; P.v.y -= g * dt; P.p.addScaledVector(P.v, dt);
      if (P.p.y < .06) { P.p.y = .06; if (P.v.y < -1) { P.v.y *= -.32; if (P.kind !== 2 && Math.random() < .4) fxDust(P.p.x, .05, 2, .6, .8, '#b49a6a'); } else P.v.y = 0; P.v.x *= .8; P.v.z *= .8; P.av.multiplyScalar(.7); }
      _mQ2.setFromEuler(_mE.set(P.av.x * dt, P.av.y * dt, P.av.z * dt)); P.q.multiply(_mQ2);
      _mS.copy(P.s).multiplyScalar(1 - fade); M.mesh.setMatrixAt(i, _mM.compose(P.p, P.q, _mS)); }
    if (fade >= 1) { mechHide(); return; } }
  M.mesh.instanceMatrix.needsUpdate = true;
  // rainbow over the paint: each piece leans a little toward a cycling hue (offset per piece); a cycling fresnel rim and a faint emissive
  // glow the same hue; red flicker when the meter is low. The ink is a fixed width in world units (his size), thinner on the tiny pieces.
  const kk = M.mode === 'out' ? Math.max(0, 1 - M.t * 1.2) : k, sc = supV.scale;
  for (let i = 0; i < n; i++) { const P = M.P[i]; if (low) _mC.setHSL(0, 1, .5); else _mC.setHSL((hue + i * .045) % 1, 1, .6); M.mesh.setColorAt(i, _mC.lerp(P.col, 1 - .12 * kk)); }
  M.mesh.instanceColor.needsUpdate = true;
  if (low) mechMat.emissive.setHSL(0, 1, .35 * fl); else mechMat.emissive.setHSL((hue + .66) % 1, 1, .5); mechMat.emissiveIntensity = (low ? .3 : .04 + .02 * Math.sin(VT * 6)) * kk;
  if (low) mechU.uRimC.value.setHSL(0, 1, .55); else mechU.uRimC.value.setHSL(hue % 1, 1, .6); mechU.uRimK.value = (low ? 1.1 * fl : .6) * kk;
  mechU.uInkW.value = .016 * sc; mechU.uInkS.value = .06 * sc;
}
const hueCss = h => 'hsl(' + Math.round(((h % 1) + 1) % 1 * 360) + ',100%,60%)';
function supOff() {   // back to the normal buddy look
  const V = supV, U = buddyMat.userData.U; V.aura.visible = V.ring.visible = false; V.k = 0; V.ringT = 9;
  if (V.wasOn) { U.uRimC.value.copy(RIM0); U.uRimK.value = .25; U.uSelf.value = .12; buddyMat.color.copy(COL0); V.wasOn = false; }
}
function superFx(e, x0, z) {   // one logic event -> the look (shared particle pools)
  const V = supV, big = V.scale, cx = X(e.x === undefined ? G.sup.bx : e.x);
  if (e.k === 'grow') { for (let i = 0; i < 6; i++) fxBurst(x0, big * .5 + 1, 6, hueCss(i / 6), 10); fxSpark(x0, 1.5, 30, '#ffffff', 12, z + .3); addShake(.45); }
  else if (e.k === 'land' || e.k === 'slam') { V.ringT = 0; V.ringX = x0; fxDust(x0, .1, e.k === 'land' ? 26 : 16, 6, 2.4, '#c9b48a'); fxMud(x0, .2, 10, 5); addShake(e.k === 'land' ? .8 : .55);
    for (let i = 0; i < 4; i++) fxSpark(x0 + rnd(-2, 2), .4, 5, hueCss(V.hue + i / 4), 9, z + .4); }
  else if (e.k === 'wind') { V.armT = 0; V.slamPose = !!e.slam; if (e.slam && e.ty > 30) V.leap = 1; }
  else if (e.k === 'swipe') { fxSpark(x0 + G.sup.face * big * .4, big * .45, 10, hueCss(V.hue + .3), 8, z + .6); }
  else if (e.k === 'hit') { fxSpark(cx, (e.y || 4) * S + .4, e.boss ? 16 : 10, e.boss ? '#ffe8a0' : '#fff4c8', e.boss ? 9 : 7); }
  else if (e.k === 'kill') { fxBurst(cx, .5, 16, '#7fae4a', 8); fxSpark(cx, .6, 12, hueCss(V.hue), 9); addShake(.3); }
  else if (e.k === 'log') { fxBurst(cx, .7, 16, '#8a5a30', 8); fxDust(cx, .2, 8, 3, 1.4, '#b49a6a'); addShake(.25); }
  else if (e.k === 'soak') { fxSpark(x0, big * .55, 8, '#ffffff', 6, z + .6); }
  else if (e.k === 'clink') { fxSpark(cx, (e.y || 30) * S, 6, '#c8c8c8', 5); }
  else if (e.k === 'shrink') { V.shrinkT = 0; for (let i = 0; i < 5; i++) fxBurst(x0, big * .5, 5, hueCss(i / 5), 7); fxDust(x0, .2, 14, 4, 2, '#d8d0c0'); addShake(.3); }
}
function syncSuper(p, dt) {
  const s = G.sup, b = buddy, V = supV, U = buddyMat.userData.U;
  if (!s.on) { if (cutV.on) cutOff(); if (V.k > 0 || V.wasOn) { if (V.wasOn) { V.back = true; V.room = G.room; } supOff(); b.root.scale.setScalar(BUDDY_H); } s.fx.length = 0; if (mech.mode === 'out') mechSync(dt, 0, V.hue, false, 1, b.x, -.7); else mechHide(); return false; }
  if (s.ph === 'cut') return syncCut(p, dt);
  if (cutV.on) { cutOff(); const zb = -.7 - .9 * Math.min(1, (b.root.scale.y - BUDDY_H) / Math.max(.01, SUPER_H() - BUDDY_H)); V.zOff = cutV.z - zb; b.x = cutV.x; }
  const big = SUPER_H(), z = -.7 - .9 * Math.min(1, (b.root.scale.y - BUDDY_H) / Math.max(.01, big - BUDDY_H)) + V.zOff; V.zOff = hold(V.zOff, 0, dt, 2.5);
  V.wasOn = true; if (b.root.parent !== scene) scene.add(b.root);
  const tx = X(s.bx); if (!b.init || G.room !== V.room) { b.x = s.ph === 'grow' && b.init ? b.x : tx; b.init = true; V.room = G.room; }
  b.x = hold(b.x, tx, dt, s.ph === 'grow' ? 6 : 10);
  for (const e of s.fx) superFx(e, b.x, z); s.fx.length = 0;
  V.hue = (V.hue + dt * .45) % 1; const low = s.ph === 'fight' && s.meter <= .25 * supMax();
  let sc = big, y = 0, k = 1, wob = 0;
  if (s.ph === 'grow') { const u = Math.min(1, s.t / SU.GROW_T), eb = 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2);   // ease-out-back: puffs past full, settles
    sc = BUDDY_H + (big - BUDDY_H) * eb; y = Math.sin(Math.PI * u) * 2.6; k = u; wob = Math.sin(u * 40) * (1 - u) * .06; }
  else if (s.ph === 'shrink') { const u = Math.min(1, s.t / SU.SHRINK_T), e = u * u * (3 - 2 * u); sc = big + (BUDDY_H - big) * e; k = 1 - u; wob = Math.sin(u * 34) * (1 - u) * .12; }
  else { sc = big * (1 + Math.sin(VT * 3) * .02); V.leap = Math.max(0, V.leap - dt * 1.6); y = Math.sin(Math.PI * V.leap) * 2.2; }
  V.k = k; V.scale = big;
  b.root.visible = true; b.root.scale.set(sc * (1 - wob), sc * (1 + wob), sc * (1 - wob)); b.root.position.set(b.x, y, z);
  const face = s.face || 1; b.face = face; b.root.rotation.y = hold(b.root.rotation.y, face > 0 ? -.62 : Math.PI + .62, dt, 10);
  // pose: walking, a hop in the air, the swing (wind-up, chop, recover)
  const mvx = Math.abs(b.x - V.lastX) / Math.max(1e-4, dt); V.lastX = b.x; b.ph += dt * (4 + Math.min(6, mvx * 1.2));
  V.armT += dt; const W0 = SU.WINDUP, a = V.armT;
  const arm = a < W0 ? 2.6 * a / W0 : a < W0 + .1 ? 2.6 - 2.9 * (a - W0) / .1 : a < W0 + .45 ? -.3 * (1 - (a - W0 - .1) / .35) : 0;
  poseBuddy(b, dt, { mv: Math.min(1, mvx / 6), air: Math.min(1, y * .5), look: 0, lookAmt: .25, wave: 0, deep: 0, arm, slam: V.slamPose });
  const fl = low ? .5 + .5 * Math.abs(Math.sin(VT * 12)) : 1;
  supLook(b.x, y, z, sc, k, low, fl);
  // slam shockwave ring
  V.ringT += dt; const RG = V.ring; RG.visible = V.ringT < .5; if (RG.visible) { const u = V.ringT / .5, rs = 1 + 11 * u; RG.position.set(V.ringX, .12, z + .6); RG.scale.set(rs, 1 + 6 * u, rs);
    _hc.setHSL((V.hue + .15) % 1, 1, .6); supRingM.color.copy(_hc); supRingM.opacity = .9 * (1 - u); }
  // junk mech armour: morph-in with the grow, fall-apart with the shrink
  if (s.ph === 'grow' && mech.mode !== 'in' && mech.mode !== 'on') mechStart('in', b.x, z);
  if (s.ph === 'fight' && mech.mode !== 'on' && mech.mode !== 'in') { mechStart('in', b.x, z); mech.t = 9; for (const P of mech.P) { P.snapped = true; P.snapT = -9; } }   // (a room change mid-fight: armour already on)
  if (s.ph === 'shrink' && mech.mode !== 'out') mechStart('out', b.x, z);
  if (s.ph === 'grow' || s.ph === 'shrink') mech.t = s.t - dt;   // the morph runs on game time while he grows / shrinks (then on frame time)
  mechSync(dt, k, V.hue, low, fl, b.x, z);
  // rainbow trail sparks; a little smoke when he is nearly spent
  if (k > .3 && Math.random() < .7 * QL().pf) emit(poolA, b.x + rnd(-.5, .5) * sc * .45, y + rnd(.1, 1) * sc, z + .3, rnd(-.6, .6), rnd(.6, 1.6), rnd(-.2, .2), rnd(.4, .8), rnd(.25, .5), hueCss(V.hue + rnd(0, .5)), -1, 1, -.3);
  if (low && Math.random() < .25 * QL().pf) fxDust(b.x + rnd(-.6, .6), y + sc * .8, 1, .6, 1.2, '#8a8478');
  return true;
}
function supLook(x, y, z, sc, k, low, fl) {   // colour: cycling rim light + self light (red flicker when the meter is low); aura: one additive billboard behind him
  const V = supV, U = buddyMat.userData.U;
  if (low) _hc.setHSL(0, 1, .5); else _hc.setHSL(V.hue, 1, .5);
  U.uRimC.value.copy(_hc); U.uRimK.value = .25 + 2.8 * k * fl; U.uSelf.value = .12 + .1 * k * (.6 + .4 * Math.sin(VT * 7));
  _hc2.setHSL((V.hue + .33) % 1, 1, .5); buddyMat.color.copy(COL0).lerp(_hc2, .18 * k);   // the body leans a little toward the cycling colour (the mud skin and face stay readable)
  const A = V.aura; A.visible = k > .01; if (A.visible) { _hc.setHSL(low ? 0 : (V.hue + .5) % 1, 1, .55); supAuraM.color.copy(_hc); supAuraM.opacity = .85 * k * fl;
    A.position.set(x, y + sc * .5, z - .4); A.quaternion.copy(camera.quaternion); const as = sc * (2.1 + .1 * Math.sin(VT * 5)); A.scale.set(as, as, 1); }
}
/* ---- the super cutscene (look). Logic time G.cut.t (his speed included) drives every beat, so a test can step it. ----
   Extra draw calls, only while it plays: junk (one instanced mesh, lies there and fades 2 s after), the potion bottle (4 small meshes,
   drink beat only), cookie + glass of milk (3, cookie beat only), the hatch opening (1). Dust, sparks and crumbs use the shared pools. */
const cutV = { on: false, from: new THREE.Vector3(), yaw0: 0, lastT: 0, junkN: 0, grew: false, closed: false, armed: false, bites: 0, x: 0, z: 0 };
let hatchA = 0;   // chest hatch angle (0 shut .. 1.9 open), drawn in syncHatch
const _cA = new THREE.Vector3(), _cB = new THREE.Vector3(), _cC = new THREE.Vector3(), _cD = new THREE.Vector3(), _jZ = new THREE.Matrix4().makeScale(0, 0, 0);
const junk = (() => { const N = 14, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.5, 0), reg(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })), N), c = new THREE.Color();
  const cols = ['#9a4a2c', '#2f8f98', '#9a99a3', '#f2bf2a', '#e8e0d0', '#c48a52', '#5a6b3a', '#d9534f'];   // rusty can, teal scrap, tin, banana peel, paper, copper, old sock, red sprocket
  for (let i = 0; i < N; i++) { m.setColorAt(i, c.set(cols[i % cols.length])); m.setMatrixAt(i, _jZ); }
  m.frustumCulled = false; m.visible = false; m.castShadow = true; scene.add(m);
  return { m, N, fade: 0, P: Array.from({ length: N }, (_, i) => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), av: new THREE.Vector3(),
    s: new THREE.Vector3(.14 + (i * 37 % 10) / 45, .07 + (i * 53 % 10) / 80, .1 + (i * 29 % 10) / 55) })) }; })();
function junkThrow(i, from, ax, az) { const P = junk.P[i]; P.on = true; P.p.copy(from); P.v.set(ax * rnd(1.5, 3.5) + rnd(-1.5, 1.5), rnd(3, 6), az * rnd(1.5, 3.5) + rnd(-1, 1.5)); P.av.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)); P.q.identity();
  if (i % 3 === 0) fxDust(from.x, from.y, 2, .6, .8, '#b49a6a'); sfx(300 + i * 40, .04, 'square'); }
function junkSync(dt) { const J = junk; if (!J.m.visible) return; const k = J.fade > 0 ? Math.min(1, J.fade) : 1;
  for (let i = 0; i < J.N; i++) { const P = J.P[i]; if (!P.on) { J.m.setMatrixAt(i, _jZ); continue; }
    P.v.y -= 14 * dt; P.p.addScaledVector(P.v, dt); if (P.p.y < .06) { P.p.y = .06; if (P.v.y < -1) P.v.y *= -.35; else P.v.y = 0; P.v.x *= .7; P.v.z *= .7; P.av.multiplyScalar(.6); }
    _mQ2.setFromEuler(_mE.set(P.av.x * dt, P.av.y * dt, P.av.z * dt)); P.q.multiply(_mQ2); _mS.copy(P.s).multiplyScalar(k); J.m.setMatrixAt(i, _mM.compose(P.p, P.q, _mS)); }
  J.m.instanceMatrix.needsUpdate = true; if (J.fade > 0) { J.fade -= dt * .5; if (J.fade <= 0) junkClear(); } }
function junkClear() { junk.m.visible = false; junk.fade = 0; for (const P of junk.P) P.on = false; }
const cutProps = (() => { const j = buddy.j, liq = reg(new THREE.MeshBasicMaterial({ color: '#7dff6a' })), gl = reg(new THREE.MeshStandardMaterial({ color: '#d8f4ff', transparent: true, opacity: .35, roughness: .1, metalness: 0, depthWrite: false }));
  const bottle = new THREE.Group(); mk(gCyl, liq, 0, 0, 0, .075, .1, .075, bottle, true); mk(gCyl, gl, 0, .02, 0, .095, .15, .095, bottle, true); mk(gCyl, gl, 0, .12, 0, .04, .07, .04, bottle, true); mk(gCyl, M('#8a5d3d'), 0, .165, 0, .045, .025, .045, bottle, true);
  bottle.position.set(.03, -.16, -.03); j.foreR.add(bottle);
  const cookie = mk(gCyl, M('#c08040', '#2a1406'), .04, -.15, -.06, .13, .03, .13, j.foreR, true); cookie.rotation.x = Math.PI / 2;
  const milk = new THREE.Group(); mk(gCyl, gl, 0, 0, 0, .13, .17, .13, milk, true); mk(gCyl, M('#f6f2e6', '#3a3a36'), 0, -.015, 0, .115, .13, .115, milk, true); milk.position.set(.05, -.18, .03); j.foreL.add(milk);
  bottle.visible = cookie.visible = milk.visible = false; return { bottle, cookie, milk, liq }; })();
function cutOff() { cutV.on = false; cutProps.bottle.visible = cutProps.cookie.visible = cutProps.milk.visible = false; if (junk.m.visible && junk.fade <= 0) junk.fade = 2; }
const ss = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
const COOKIE_LINES = ['cookie break.', 'dunk.', 'one more', 'just one more', 'ok last one', 'ok THIS is the last one'];
function syncCut(p, dt) {
  const c = G.cut, b = buddy, V = supV, t = c.t, ph = cutPhase(t), big = SUPER_H(), CP = cutProps;
  if (b.root.parent !== scene) { b.root.updateWorldMatrix(true, false); const w = b.root.getWorldPosition(_cD); scene.add(b.root); b.root.position.copy(w); b.root.scale.setScalar(BUDDY_H); }
  if (!cutV.on) { cutV.on = true; cutV.from.copy(b.root.position); if (!b.root.visible || !b.init) cutV.from.set(X(p.x) - p.face * 1.9, 0, -.7); cutV.yaw0 = b.root.rotation.y;
    cutV.lastT = t; cutV.junkN = 0; cutV.grew = cutV.closed = cutV.armed = false; cutV.bites = 0; junkClear(); junk.m.visible = true; mechHide(); supOff(); b.rk = 0; if (b.mound) b.mound.visible = false; }
  const dct = Math.max(0, Math.min(.25, t - cutV.lastT)); cutV.lastT = t;   // cutscene seconds this frame (his speed included)
  pl.root.updateMatrixWorld(true); pl.chest.getWorldPosition(_cC);
  const yaw = pl.root.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw), fc = yaw + Math.PI;   // mudbot's front; fc: facing mudbot
  const stand = _cA.set(_cC.x + fx * 1.0, 0, _cC.z + fz * 1.0), hang = _cB.set(_cC.x + fx * .42, Math.max(0, _cC.y - .66), _cC.z + fz * .42);
  const bigX = _cC.x + fx * 2.7, bigZ = _cC.z + fz * 2.2;
  let x = stand.x, y = 0, z = stand.z, sc = BUDDY_H, ry = fc, k = 0, said = '', o = { mv: 0, air: 0, look: 0, lookAmt: .2, wave: 0, deep: 0 };
  V.hue = (V.hue + dt * .45) % 1;
  if (ph === 'walk') { const u = ss(0, CUT.WALK, t), hi = cutV.from.y > .5; x = cutV.from.x + (stand.x - cutV.from.x) * u; z = cutV.from.z + (stand.z - cutV.from.z) * u;
    y = cutV.from.y * (1 - u) + (hi ? Math.sin(Math.PI * Math.min(1, t / CUT.HOP)) * 1.2 : 0); b.ph += dt * 9 * Math.min(1, c.sp);
    ry = Math.atan2(-(stand.z - cutV.from.z), stand.x - cutV.from.x || 1e-3); if (t > CUT.WALK - .3) ry = fc; o.mv = t < CUT.WALK - .2 ? 1 : 0; o.air = hi && t < CUT.HOP ? 1 : 0; said = t > .5 ? 'hmm.' : ''; }
  else if (ph === 'open') { const u = ss(CUT.WALK, CUT.WALK + .35, t); x = stand.x + (hang.x - stand.x) * u; y = hang.y * u + Math.sin(Math.PI * u) * .4; z = stand.z + (hang.z - stand.z) * u;
    o.air = .7; o.arm = 2.5; o.slam = true; said = 'hold still'; }
  else if (ph === 'rummage') { x = hang.x; y = hang.y + Math.sin(t * 9) * .03; z = hang.z; const w = Math.sin(t * 11); o.air = .7; o.arm = 2.2 + w * .45; o.armL = -w * .45; o.slam = true; o.lean = -.35;
    const want = Math.min(junk.N, Math.floor((t - CUT.OPEN) / .17) + 1); while (cutV.junkN < want) { const i = cutV.junkN++, sd = i % 2 ? 1 : -1; junkThrow(i, _cC, fx + sd * fz * .8, fz - sd * fx * .8); }
    said = ['nope', 'nope', 'ooh... nope', 'where is it', 'nope'][Math.floor((t - CUT.OPEN) / .55) % 5]; }
  else if (ph === 'armor') { const u = ss(CUT.RUM, CUT.RUM + .3, t); x = hang.x + (stand.x - hang.x) * u; y = hang.y * (1 - u) + Math.sin(Math.PI * u) * .3; z = hang.z + (stand.z - hang.z) * u; o.air = 1 - u;
    if (t >= CUT.RUM + .3) { if (!cutV.armed) { cutV.armed = true; b.root.position.set(x, y, z); b.root.rotation.set(0, ry, 0); mechStart('in', x, z, _cC); } mech.t = (t - CUT.RUM - .3) * 1.05 - dt; o.armL = .5; o.arm = .5; said = 'suit up!'; }
    else said = 'found it!'; k = .15; }
  else if (ph === 'drink') { const g0 = CUT.DRINK - .55; o.arm = t < g0 ? 1.95 : .3; o.tilt = t < g0 ? .5 * ss(CUT.ARM, CUT.ARM + .3, t) : 0; CP.bottle.visible = t < g0; k = .15;
    CP.liq.color.setHSL((VT * .8) % 1, 1, .6); said = t < g0 ? '*glug glug*' : '';
    if (t >= g0) { const u = Math.min(1, (t - g0) / .55), eb = 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2); sc = BUDDY_H + (big - BUDDY_H) * eb; k = Math.max(.15, u);
      x = stand.x + (bigX - stand.x) * ss(0, 1, u); z = stand.z + (bigZ - stand.z) * ss(0, 1, u); y = Math.sin(Math.PI * u) * 1.6;
      if (!cutV.grew) { cutV.grew = true; superFx({ k: 'grow' }, x, z); sfx(220, .25, 'sawtooth'); } } }
  else { x = bigX; z = bigZ; sc = big * (1 + Math.sin(VT * 3) * .02); k = 1;
    if (ph === 'beat') { ry = -Math.PI / 2 + .3; o.arm = 2.3; o.slam = true; said = t < CUT.BEAT - .35 ? 'I AM READY' : '...wait'; }
    else if (ph === 'cookies') { const L = (CUT.COOK - CUT.BEAT) / COOKIES, u = (t - CUT.BEAT) / L, i = Math.min(COOKIES - 1, Math.floor(u)), f = u - i;
      CP.milk.visible = true; o.armL = .9; CP.cookie.visible = f < .85; CP.cookie.scale.set(.13 * (f < .55 ? 1 : f < .7 ? .6 : .3), .03, .13 * (f < .55 ? 1 : f < .7 ? .6 : .3));
      o.arm = f < .3 ? .75 : f < .55 ? 2.0 : 1.75; o.tilt = f > .55 ? Math.sin(VT * 22) * .06 : 0; o.lean = f < .3 ? -.1 : 0;
      const bite = i * 2 + (f > .6 ? 1 : 0) + (f > .78 ? 1 : 0); if (bite > cutV.bites) { cutV.bites = bite; b.j.head.updateWorldMatrix(true, false); b.j.head.getWorldPosition(_cD); fxBurst(_cD.x + fx * .4, _cD.y, 5, '#a8652c', 3); sfx(180, .03, 'square'); }
      said = COOKIE_LINES[i] + '  (' + (i + 1) + '/' + COOKIES + ')'; }
    else { o.arm = 1.3; said = 'ahh.'; } }
  // hatch: opens once he is up there, stays open, shuts at the end with a thud
  hatchA = t < CUT.WALK + .3 ? 0 : t < CUT.COOK ? 1.9 * ss(CUT.WALK + .3, CUT.OPEN, t) : 1.9 * (1 - ss(CUT.COOK + .15, CUT.CLOSE - .15, t));
  if (!cutV.closed && t >= CUT.CLOSE - .15) { cutV.closed = true; addShake(.35); sfx(90, .2, 'square'); fxDust(_cC.x + fx * .3, _cC.y - .3, 6, 1, .6); }
  if (ph !== 'drink') CP.bottle.visible = false; if (ph !== 'cookies') CP.cookie.visible = CP.milk.visible = false;
  cutV.x = x; cutV.z = z; b.x = x; V.lastX = x; V.k = k; V.scale = sc; V.zOff = 0;
  b.root.visible = true; b.root.position.set(x, y, z); b.root.scale.setScalar(sc); b.root.rotation.y = hold(b.root.rotation.y, ry, dt, 10); b.face = fx >= 0 ? 1 : -1;
  poseBuddy(b, dt, o);
  supLook(x, y, z, sc, k, false, 1); V.ring.visible = false;
  if (mech.mode !== 'off') mechSync(dt, k, V.hue, false, 1, x, z);
  junkSync(dct);
  if (k > .5 && Math.random() < .5 * QL().pf) emit(poolA, x + rnd(-.5, .5) * sc * .45, y + rnd(.1, 1) * sc, z + .3, rnd(-.6, .6), rnd(.6, 1.6), rnd(-.2, .2), rnd(.4, .8), rnd(.25, .5), hueCss(V.hue + rnd(0, .5)), -1, 1, -.3);
  bub('buddy', said, x, y + sc * 1.12 + .25, z);
  return true;
}
/* ---- T mode (look): buddy walks to mudbot, opens the chest hatch, climbs in and leans on the sill, head and arms out (the rest of him is
   inside the can). On T: hops out and shuts the hatch. With super on he is too big for it and just stays standing beside mudbot.
   No extra draw calls in 3D: buddy and the hatch already exist; the mini game card is a 2D canvas over the page. */
const tV = { on: false, from: new THREE.Vector3(), closed: false };
let _cl = 0;
function crawlLen() {   // a mob's body length in px (measured once from the model; 18 until one has been drawn)
  if (!_cl && view.crawlers.length) { const c = view.crawlers[0]; c.root.updateMatrixWorld(true); let x0 = 1e9, x1 = -1e9; const v = new THREE.Vector3();   // no Box3 in the trimmed three build: walk the mesh bounds by hand
    c.body.traverse(o => { if (!o.isMesh || !o.geometry) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox; for (let i = 0; i < 8; i++) { v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); } });
    const L = (x1 - x0) / .1; if (L > 4 && L < 60) _cl = L; }
  return _cl || 18; }
function syncTMode(p, dt) {
  const m = G.tm, b = buddy;
  if (G.freeze !== 't' || !m || (G.sup && G.sup.on)) { tV.on = false; return false; }
  if (b.root.parent !== scene) { b.root.updateWorldMatrix(true, false); const w = b.root.getWorldPosition(_cD); scene.add(b.root); b.root.position.copy(w); b.root.scale.setScalar(BUDDY_H); }
  if (!tV.on) { tV.on = true; tV.closed = false; tV.tu = 0; tV.bx = undefined; tV.from.copy(b.root.position); if (!b.root.visible || !b.init) tV.from.set(X(p.x) - p.face * 1.9, 0, -.7); b.rk = 0; if (b.mound) b.mound.visible = false; }
  pl.root.updateMatrixWorld(true); pl.chest.getWorldPosition(_cC);
  const yaw = pl.root.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw), fc = yaw + Math.PI;
  const stand = _cA.set(_cC.x + fx * 1.0, 0, _cC.z + fz * 1.0), hang = _cB.set(_cC.x + fx * .42, Math.max(0, _cC.y - .66), _cC.z + fz * .42);
  const inS = BUDDY_H * TV_IN.s, inX = _cC.x + fx * TV_IN.out, inY = _cC.y - inS * TV_IN.drop, inZ = _cC.z + fz * TV_IN.out;
  const t = m.t; let x = stand.x, y = 0, z = stand.z, sc = BUDDY_H, ry = fc, ha = 0; const o = { mv: 0, air: 0, look: 0, lookAmt: .2, wave: 0, deep: 0 };
  const lerp = (u, ax, ay, az, bx, by, bz) => { x = ax + (bx - ax) * u; y = ay + (by - ay) * u; z = az + (bz - az) * u; };
  if (m.leave) { const lt = m.lt;
    if (lt < TM.OUT) { const u = ss(0, TM.OUT, lt); lerp(u, inX, inY, inZ, stand.x, 0, stand.z); y += Math.sin(Math.PI * u) * .5; sc = inS + (BUDDY_H - inS) * u; o.air = 1 - u; ry = yaw; ha = 1.9; }
    else { ha = 1.9 * (1 - ss(TM.OUT, TM.CLOSE - .1, lt)); o.arm = 2.5; o.slam = true;
      if (!tV.closed && lt >= TM.CLOSE - .12) { tV.closed = true; addShake(.25); sfx(90, .15, 'square'); fxDust(_cC.x + fx * .3, _cC.y - .3, 5, 1, .6); } } }
  else if (t < TM.WALK) { const u = ss(0, TM.WALK, t), hi = tV.from.y > .5; lerp(u, tV.from.x, tV.from.y, tV.from.z, stand.x, 0, stand.z); if (hi) y += Math.sin(Math.PI * u) * 1.0;
    b.ph += dt * 10; ry = t < TM.WALK - .15 ? Math.atan2(-(stand.z - tV.from.z), stand.x - tV.from.x || 1e-3) : fc; o.mv = t < TM.WALK - .1 ? 1 : 0; o.air = hi ? 1 - u : 0; }
  else if (t < TM.OPEN) { const u = ss(TM.WALK, TM.WALK + .2, t); lerp(u, stand.x, 0, stand.z, hang.x, hang.y, hang.z); y += Math.sin(Math.PI * u) * .35; o.air = .7; o.arm = 2.5; o.slam = true; ha = 1.9 * ss(TM.WALK + .1, TM.OPEN, t); }
  else if (t < TM.IN) { const u = ss(TM.OPEN, TM.IN, t); lerp(u, hang.x, hang.y, hang.z, inX, inY, inZ); y += Math.sin(Math.PI * u) * .3; sc = BUDDY_H + (inS - BUDDY_H) * u; ry = u < .45 ? fc : yaw; o.air = .7; o.arm = 2.2; ha = 1.9; }
  else {   // comfy: elbows on the sill, swaying a little; plays along (solo), waves when he wins, slumps when he loses
    const g = m.mg, R = m.react; x = inX; y = inY + Math.sin(VT * 1.3) * .012; z = inZ; sc = inS; ry = yaw; ha = 1.9;
    o.arm = 1.45; o.armL = 1.45; o.lean = .18; o.tilt = Math.sin(VT * .8) * .12; o.look = Math.sin(VT * .5) * .4; o.lookAmt = .5;
    if (g && g.ph === 'go' && !mg2()) { o.arm = 1.5 + Math.sin(VT * 16) * .35; o.tilt = 0; o.look = -.3; }
    if (R && R.t < 1.8) { if (R.win === 2 && !mg2()) { o.wave = 1; o.arm = undefined; } else if (R.win === 1 && !mg2()) { o.lean = .4; o.tilt = -.3; } } }
  // the tug: buddy hops out of the chest onto the ground GAP px away and pulls (eased in / out over TM.OUT, with a hop); the hatch stays open
  const tg = !m.leave && m.mg && m.mg.phys && !m.mg.fin ? m.mg : null;
  tV.tu = Math.max(0, Math.min(1, (tV.tu || 0) + (tg ? dt : -dt) / TM.OUT));
  if (tg) { const B = tg.b; tV.bx = B.x; tV.by = B.y; tV.dir = tg.dir; tV.bs = B.st; tV.sl = B.slide; tV.air = !B.ground; }
  if (tV.tu > 0 && tV.bx !== undefined) { const u = ss(0, 1, tV.tu), tx = X(tV.bx), ty = Y(tV.by);
    x += (tx - x) * u; y += (ty - y) * u + Math.sin(Math.PI * u) * .6 * (tg ? 1 - u : u); z += (0 - z) * u; sc += (BUDDY_H - sc) * u; ha = Math.max(ha, 1.9 * u);
    if (u > .5) { ry = tV.dir > 0 ? Math.PI : 0; o.look = 0; o.tilt = 0; o.wave = 0; o.arm = 1.5; o.armL = 1.5; o.lean = tV.bs === 'rest' ? 0 : tV.bs === 'lean' ? -.45 : -.25;
      if (tV.sl) { b.ph += dt * 9; o.mv = .7; } if (tV.air) { o.air = 1; o.arm = 2.5; }
      const R = m.react; if (R && R.t < 1.8 && !mg2()) { if (R.win === 2) { o.wave = 1; o.arm = undefined; } else if (R.win === 1) { o.lean = .4; o.tilt = -.3; } } }
    if (tg && tg.hooked) tugFx(tg, dt); }
  hatchA = ha;
  b.x = x; b.y = y; b.init = true; b.face = fx >= 0 ? 1 : -1;
  b.root.visible = true; b.root.position.set(x, y, z); b.root.scale.setScalar(sc); b.root.rotation.y = hold(b.root.rotation.y, ry, dt, 10);
  poseBuddy(b, dt, o);
  return true;
}
const TV_IN = { s: .62, out: .04, drop: .8 };
function tugFx(g, dt) {   // the line mark + slide dust, with the shared dust pool (no new mesh). LOW has no ambient motes, so the pool is idle in T mode:
  // a steady line puff there would wake it for good (+1 draw call), so on LOW the line shows on the card strip only and dust comes only while someone slides
  tV.lt = (tV.lt || 0) - dt; if (tV.lt <= 0 && QL().motes > 0) { tV.lt = .45; fxDust(X(g.line), -.05, 1, .12, .25, '#efe2c2'); }
  tV.st = (tV.st || 0) - dt; if (tV.st <= 0) { tV.st = .09; for (const Bd of [g.a, g.b]) if (Bd.slide && Bd.ground) fxDust(X(Bd.x), -.05, 1, .5, .45, Bd.surf === 'water' ? '#bfe3ff' : Bd.surf === 'mire' ? '#5a4330' : null); }
}   // comfy in the chest: his size (x BUDDY_H), root just past the hatch face, sunk so only head + arms show
const T_IDLE = ['comfy.', 'who left a bolt in here', 'smells like mudbot', 'five more minutes', 'it is warm in here'];
function tBubbles() {   // what buddy says in T mode + the dragged mobs complaining
  const m = G.tm; if (G.freeze !== 't' || !m || G.state === 'title') return;
  const b = buddy, h = b.root.scale.y; let line = '';
  if (m.leave) line = m.lt < TM.OUT ? 'ok ok' : 'back to work';
  else if (m.t < TM.WALK) line = G.sup && G.sup.on ? 'too big for the chest. I will stand.' : 'my turn!';
  else if (m.t < TM.OPEN) line = G.sup && G.sup.on ? '' : "'scuse me";
  else if (m.t < TM.IN) line = 'ooh. cozy.';
  else if (m.react && m.react.t < 2) line = m.react.line;
  else if (!m.mg || m.mg.ph !== 'go') line = T_IDLE[Math.floor(m.t / 5) % T_IDLE.length];
  bub('buddy', line, b.root.position.x, b.root.position.y + h * 1.12 + .2, b.root.position.z);
  const rs = G.rs; if (!rs) return;
  for (const k in m.say) { const s = rs.crawlers[k]; if (s && !s.dead) bub('mob' + k, m.say[k].text, X(s.x), 1.35, 0); }
}
/* T mode card: the mini game, drawn on a 2D canvas over the page (no WebGL) */
const tUI = (() => { const c = document.createElement('canvas'); c.id = 'tcard'; const h = document.createElement('div'); h.id = 'thint'; document.body.append(c, h);
  c.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const m = G.tm, g = m && m.mg; if (!g) return; const r = c.getBoundingClientRect();
    mgKey(1, g.id === 'rps' ? Math.max(0, Math.min(2, Math.floor((e.clientX - r.left) / r.width * 3))) : 0); });   // touch / mouse: tap the card = P1 (rock paper scissors: left / middle / right third)
  return { c, x: c.getContext('2d'), h, st: '', on: false, w: 0 }; })();
const RPS_W = ['ROCK', 'PAPER', 'SCISSORS'];
function syncTUI() {
  const m = G.tm, on = !!(G.freeze === 't' && m && G.state !== 'title');
  if (on !== tUI.on) { tUI.on = on; tUI.c.style.display = tUI.h.style.display = on ? 'block' : 'none'; }
  if (!on) return;
  const strip = !!(m.mg && m.mg.phys && !m.mg.fin);   // the tug: the card shrinks to a strip along its top, clicks go through to the game
  if (strip !== tUI.strip) { tUI.strip = strip; tUI.c.classList.toggle('tug', strip); }
  const tch = document.body.classList.contains('touch');
  const hs = m.leave ? 'back to play...' : tUI.strip ? (tch ? 'T: back to play  ·  hook button: pull  ·  move away from buddy: dig in  ·  jump: yank' : 'T: back to play  ·  G: another game  ·  2: ' + (m.mode === '2p' ? '2 players' : 'solo vs buddy')) : tch ? 'T: back to play  ·  drag an enemy (a little)  ·  tap the card to play' : 'T: back to play  ·  drag an enemy (a little)  ·  G: another game  ·  2: ' + (m.mode === '2p' ? '2 players' : 'solo vs buddy');
  if (hs !== tUI.st) { tUI.st = hs; tUI.h.textContent = hs; }
  drawCard(m, tch);
}
function drawCard(m, tch) {
  const c = tUI.c, W2 = 440, H2 = 246, dpr = Math.min(2, devicePixelRatio || 1), cw = Math.round((c.clientWidth || W2) * dpr);
  if (tUI.w !== cw) { tUI.w = cw; c.width = cw; c.height = Math.round(cw * H2 / W2); }
  const x = tUI.x, k = c.width / W2; x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, W2, H2);
  const rr = (a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  const txt = (s, a, b, sz, col, al) => { x.font = 'bold ' + sz + 'px sans-serif'; x.fillStyle = col || '#3f2616'; x.textAlign = al || 'center'; x.textBaseline = 'middle'; x.fillText(s, a, b); };
  rr(2, 2, W2 - 4, tUI.strip ? TUG_STRIP_H : H2 - 4, 16); x.fillStyle = 'rgba(255,247,230,.94)'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#3f2616'; x.stroke();
  const p2 = m.mode === '2p', n1 = p2 ? 'P1' : 'YOU', n2 = p2 ? 'P2' : 'BUDDY', g = m.mg;
  txt('T MODE', 14, 18, 12, '#8a6a4a', 'left'); txt(n1 + ' ' + m.score[0] + ' : ' + m.score[1] + ' ' + n2, W2 - 14, 18, 13, '#3f2616', 'right');
  if (!g) { txt(m.leave ? 'see you later' : 'buddy is getting comfy...', W2 / 2, H2 / 2, 18); return; }
  if (tUI.strip) { drawTugStrip(m, g, tch, rr, txt, n1, n2, p2); return; }
  txt(MG_NAME[g.id], W2 / 2, 18, 17);
  const k1 = tch ? 'tap' : 'Z', k2 = p2 ? ',' : 'buddy plays';
  const help = { tugCard: 'mash ' + k1 + (p2 ? ' vs mash ,' : '') + ': pull the knot past your flag', rps: tch ? 'tap left / middle / right: rock paper scissors. First to 2' : 'P1: Z X C = rock paper scissors' + (p2 ? '   P2: , . /' : '') + '. First to 2',
    thumb: k1 + (p2 ? ' / ,' : '') + ' when YOUR thumb is on top. 3 pins wins. Miss = ouch', stare: k1 + (p2 ? ' / ,' : '') + ' squints your dry eyes. Twice too fast = blink. First to blink loses',
    flick: k1 + (p2 ? ' / ,' : '') + ' stops the power bar: flick mud into the cup. 3 flicks', potato: k1 + (p2 ? ' / ,' : '') + ' throws the frozen mob back. It pops when the fuse runs out' }[g.id];
  txt(help, W2 / 2, 38, 11, '#6a4a2a');
  const cy = 120, L = 70, R = W2 - 70;
  txt(n1, L, 62, 14, '#2a6fb0'); txt(n2 + (p2 ? '' : ''), R, 62, 14, '#b04a2a'); if (!p2) txt('(' + k2 + ')', R, 76, 10, '#8a6a4a'); else txt('( , . / )', R, 76, 10, '#8a6a4a'); txt('( ' + (tch ? 'tap' : 'Z X C') + ' )', L, 76, 10, '#8a6a4a');
  x.lineWidth = 3;
  if (g.id === 'tugCard') { const kx = W2 / 2 + g.r * 150; x.strokeStyle = '#a8763a'; x.beginPath(); x.moveTo(40, cy + 20); x.lineTo(W2 - 40, cy + 20); x.stroke();
    x.fillStyle = '#2a6fb0'; x.fillRect(W2 / 2 - 152, cy - 5, 4, 40); x.fillStyle = '#b04a2a'; x.fillRect(W2 / 2 + 148, cy - 5, 4, 40); x.fillStyle = '#ccc'; x.fillRect(W2 / 2 - 1, cy + 6, 2, 28);
    x.fillStyle = '#d9534f'; x.beginPath(); x.arc(kx, cy + 20, 8, 0, 7); x.fill(); txt(Math.max(0, g.lim - g.t).toFixed(1) + 's', W2 / 2, cy + 50, 12, '#8a6a4a'); }
  else if (g.id === 'rps') { const rev = g.rev > 0 || g.ph === 'done';
    for (let i = 0; i < 2; i++) { const px = i ? R : L, pk = rev ? g.shown[i] : g.pick[i]; rr(px - 52, cy - 22, 104, 44, 10); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#3f2616'; x.stroke();
      txt(rev && pk >= 0 ? RPS_W[pk] : pk >= 0 ? 'ready ✓' : '...', px, cy, 15, rev ? '#3f2616' : '#8a6a4a'); txt('●'.repeat(g.w[i]) + '○'.repeat(2 - g.w[i]), px, cy + 36, 13, '#d9534f'); }
    txt(g.rev > 0 ? (g.res === 3 ? 'same! again' : (g.res === 1 ? n1 : n2) + ' takes the round') : 'vs', W2 / 2, cy, 13); }
  else if (g.id === 'thumb') { x.fillStyle = 'rgba(42,111,176,.18)'; x.fillRect(W2 / 2 + 50, cy - 20, 90, 40); x.fillStyle = 'rgba(176,74,42,.18)'; x.fillRect(W2 / 2 - 140, cy - 20, 90, 40);
    const tx = W2 / 2 + g.w * 115; rr(tx - 14, cy - 16, 28, 32, 12); x.fillStyle = '#e8b98f'; x.fill(); x.strokeStyle = '#3f2616'; x.stroke(); txt(g.w > 0 ? n1 + ' on top' : n2 + ' on top', tx, cy - 28, 10, '#6a4a2a');
    for (let i = 0; i < 2; i++) { const px = i ? R : L; txt('pins ' + '●'.repeat(g.pins[i]) + '○'.repeat(3 - g.pins[i]), px, cy + 40, 12, '#d9534f'); if (g.stun[i] > 0) txt('ouch!', px, cy + 18, 13, '#d9534f'); }
    if (g.flash > 0) txt('PIN!', W2 / 2, cy + 40, 16, '#d9534f'); }
  else if (g.id === 'stare') { for (let i = 0; i < 2; i++) { const px = i ? R : L, shut = g.blink === i + 1;
      for (const e of [-14, 14]) { x.beginPath(); x.ellipse(px + e, cy, 11, shut ? 1.5 : 9, 0, 0, 7); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#3f2616'; x.stroke(); if (!shut) { x.fillStyle = '#3f2616'; x.beginPath(); x.arc(px + e, cy, 4, 0, 7); x.fill(); } }
      x.fillStyle = '#ddd'; x.fillRect(px - 40, cy + 22, 80, 7); x.fillStyle = g.dry[i] > .75 ? '#d9534f' : '#e8a33a'; x.fillRect(px - 40, cy + 22, 80 * Math.min(1, g.dry[i]), 7); txt('dry', px, cy + 40, 10, '#8a6a4a'); }
    if (g.flyOn > 0) txt('a fly buzzes by!', W2 / 2, cy - 22, 12, '#6a4a2a'); }
  else if (g.id === 'flick') { for (let i = 0; i < 2; i++) { const yy = cy - 14 + i * 40, bx = 100, bw = 240;
      x.fillStyle = '#eee'; x.fillRect(bx, yy, bw, 14); x.fillStyle = '#7a5230'; x.fillRect(bx + bw * g.cup[i] - bw * .07, yy - 3, bw * .14, 20);
      const sh = g.shot[i], pw = sh ? sh.pw : g.pw[i]; x.fillStyle = i ? '#b04a2a' : '#2a6fb0'; x.fillRect(bx + bw * pw - 2, yy - 5, 4, 24);
      if (sh) txt(sh.hit ? 'SPLAT! in!' : 'miss', bx + bw * pw, yy - 12, 11, sh.hit ? '#2a8a3a' : '#8a6a4a');
      txt(g.hit[i] + '/' + g.n[i], bx + bw + 30, yy + 7, 13, i ? '#b04a2a' : '#2a6fb0'); } }
  else if (g.id === 'potato') { const fly = g.fly > 0 ? 1 - g.fly / .35 : 0, from = g.hold === 1 ? L : R, to = g.hold === 1 ? R : L, mx = from + (to - from) * fly, my = cy + 6 - Math.sin(Math.PI * fly) * 40;
    x.fillStyle = '#6b4023'; x.beginPath(); x.ellipse(mx, my, 20, 12, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(160,220,255,.55)'; x.beginPath(); x.ellipse(mx, my, 22, 14, 0, 0, 7); x.fill();
    x.fillStyle = '#f3e6c4'; x.beginPath(); x.arc(mx + 10, my - 4, 3.5, 0, 7); x.fill(); txt('!!', mx, my - 22, 13, '#d9534f');
    if (g.ph === 'go' && Math.random() < .8) { x.fillStyle = '#ffb347'; x.beginPath(); x.arc(mx - 16 + Math.random() * 6, my - 12 + Math.random() * 6, 2.5, 0, 7); x.fill(); }
    txt('passes ' + g.passes, W2 / 2, cy + 44, 11, '#8a6a4a'); if (g.boom) txt('POP!', g.boom === 1 ? L : R, cy - 30, 18, '#d9534f'); }
  if (g.ph === 'ready') { const n = Math.ceil(TM.READY - g.t); txt(n > 0 ? String(n) : 'GO', W2 / 2, cy + 60, 26, '#d9534f'); }
  else if (g.ph === 'done') { const w = g.win, s = w === 3 ? 'DRAW' : (w === 1 ? n1 : n2) + (w === 1 && !p2 ? ' WIN!' : ' WINS!'); if (m.react && m.react.rw) txt(m.react.rw, W2 / 2, H2 - 66, 12, /^cookie/.test(m.react.rw) ? '#2a7a34' : '#8a6a4a'); rr(W2 / 2 - 90, H2 - 54, 180, 34, 10); x.fillStyle = w === 1 ? '#2a6fb0' : w === 2 ? '#b04a2a' : '#8a6a4a'; x.fill(); txt(s, W2 / 2, H2 - 37, 18, '#fff'); }
  else txt(p2 ? 'P1: Z X C    P2: , . /' : tch ? '' : 'P1: Z X C', W2 / 2, H2 - 16, 10, '#8a6a4a');
}
const TUG_STRIP_H = 84, TUG_GROUND = { dirt: 'dirt', rim: 'stones', water: 'slippy!', mire: 'mire', rock: 'rocks', hole: 'falling!' };
function drawTugStrip(m, g, tch, rr, txt, n1, n2, p2) {   // the physical tug's card: one strip along the top (same 440x246 canvas, the rest left clear)
  const x = tUI.x, W2 = 440, A = g.a, B = g.b, L = 100, R = W2 - 100, cy = 58;   // bars 52 wide at 100 / 340: clear of the YOU / BUDDY names at the edges
  txt(MG_NAME[g.id], W2 / 2, 18, 16);
  const k1 = tch ? 'hook button' : 'Z / click', how = !g.hooked ? 'fire the hook at buddy (' + k1 + ')' : g.mode === 'mash' ? 'tap ' + k1 + ': pull  ·  jump: yank' : 'hold ' + k1 + ': pull  ·  ' + (tch ? 'move' : 'arrow') + ' away: dig in  ·  jump: yank';
  txt(how + (p2 ? '   P2: , pull  / dig in  . yank' : ''), W2 / 2, 36, 10.5, '#6a4a2a');
  const bar = (bx, Bd, col) => { x.fillStyle = '#ddd'; x.fillRect(bx - 26, cy - 4, 52, 7); x.fillStyle = Bd.stam < 20 ? '#d9534f' : col; x.fillRect(bx - 26, cy - 4, 52 * Bd.stam / 100, 7);
    txt(Bd.st === 'lean' ? 'digging in' : Bd.st === 'pull' ? 'pulling' : Bd.stam <= 0 ? 'puffed out' : 'resting', bx, cy + 12, 9.5, '#8a6a4a'); txt(TUG_GROUND[Bd.ground ? Bd.surf : 'hole'] || '', bx, cy - 13, 9.5, Bd.surf === 'rim' || Bd.surf === 'rock' ? '#2a7a34' : Bd.surf === 'water' || Bd.surf === 'mire' ? '#b04a2a' : '#8a6a4a'); };
  bar(L, A, '#2a6fb0'); bar(R, B, '#b04a2a'); txt(n1, 18, cy, 11, '#2a6fb0', 'left'); txt(n2, W2 - 18, cy, 11, '#b04a2a', 'right');
  const tx0 = W2 / 2 - 80, tw = 160, sp = Math.abs(B.x0 - A.x0) || 1, at = v => tx0 + tw / 2 + (v - g.line) * g.dir / sp * tw;   // the rope across the strip: line in the middle
  x.strokeStyle = g.hooked ? '#a8763a' : '#ccc'; x.lineWidth = 2; x.beginPath(); x.moveTo(at(A.x), cy); x.lineTo(at(B.x), cy); x.stroke(); x.fillStyle = '#3f2616'; x.fillRect(tx0 + tw / 2 - 1, cy - 9, 2, 18);
  x.fillStyle = '#2a6fb0'; x.beginPath(); x.arc(Math.max(tx0, Math.min(tx0 + tw, at(A.x))), cy, 5, 0, 7); x.fill(); x.fillStyle = '#b04a2a'; x.beginPath(); x.arc(Math.max(tx0, Math.min(tx0 + tw, at(B.x))), cy, 5, 0, 7); x.fill();
  if (g.ph === 'go') txt(Math.max(0, g.lim - g.t).toFixed(1) + 's', W2 / 2, cy + 15, 10, '#8a6a4a');
  if (g.ph === 'ready') { const n = Math.ceil(TM.READY - g.t); txt(n > 0 ? String(n) : 'GO', W2 / 2, cy + 14, 14, '#d9534f'); }
  else if (g.ph === 'done') { const w = g.win, s = (w === 3 ? 'DRAW' : (w === 1 ? n1 : n2) + (w === 1 && !p2 ? ' WIN!' : ' WINS!')) + (g.why === 'ledge' ? '  off the ledge!' : g.why === 'pop' ? '  the rope popped!' : g.why === 'line' ? '  over the line!' : '');
    rr(W2 / 2 - 140, 26, 280, 34, 10); x.fillStyle = w === 1 ? '#2a6fb0' : w === 2 ? '#b04a2a' : '#8a6a4a'; x.fill(); txt(s, W2 / 2, 43, 15, '#fff');
    if (m.react && m.react.rw) txt(m.react.rw, W2 / 2, 72, 11, /^cookie/.test(m.react.rw) ? '#2a7a34' : '#8a6a4a'); }
}
/* dragging a frozen mob with the mouse / a finger (T mode) */
const _tA = new THREE.Vector3(), _tB = new THREE.Vector3(); let tPtr = null;   // the bundled three build has no Raycaster: unproject two points and cut the line at z = 0
function crawlScreen(k) { const s = G.rs && G.rs.crawlers[k], r = cv.getBoundingClientRect(); if (!s) return null; _cD.set(X(s.x), .35, 0).project(camera); return { x: r.left + (_cD.x + 1) / 2 * r.width, y: r.top + (1 - _cD.y) / 2 * r.height }; }
function tPick(cx, cy) { const r = cv.getBoundingClientRect(); let best = -1, bd = 1e9; (G.rs ? G.rs.crawlers : []).forEach((s, k) => { if (s.dead) return; const q = crawlScreen(k), d = Math.hypot(cx - q.x, cy - q.y); if (d < bd) { bd = d; best = k; } });
  return bd < Math.max(50, r.width * .05) ? best : -1; }
function tPxAt(cx, cy) { const r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = -((cy - r.top) / r.height * 2 - 1);
  _tA.set(nx, ny, -1).unproject(camera); _tB.set(nx, ny, 1).unproject(camera); const dz = _tB.z - _tA.z; if (Math.abs(dz) < 1e-9) return null; const u = -_tA.z / dz; return u < 0 ? null : (_tA.x + (_tB.x - _tA.x) * u) / .1; }
function tPointerDown(e) { if (G.freeze !== 't' || !G.tm || G.tm.leave || tugOn()) return false; const k = tPick(e.clientX, e.clientY); if (k < 0) return false; const px = tPxAt(e.clientX, e.clientY);
  if (!tDragStart(k)) return false; tPtr = { id: e.pointerId, off: px === null ? 0 : G.rs.crawlers[k].x - px }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} return true; }
addEventListener('pointermove', e => { if (!tPtr || e.pointerId !== tPtr.id || G.freeze !== 't') return; const px = tPxAt(e.clientX, e.clientY); if (px !== null) tDragTo(px + tPtr.off); });
['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (tPtr && e.pointerId === tPtr.id) { tPtr = null; tDragEnd(); } }));
function syncHatch() { pl.hatch.rotation.y = hatchA; pl.hole.visible = hatchA > .03; if (G.freeze !== 'cut' && !tV.on && !(G.sup && G.sup.ph === 'cut')) hatchA = Math.max(0, hatchA - .06); }
/* speech bubbles: a few DOM labels over the 3D scene (callers set them every frame; the unused ones hide) */
const bubM = new Map(), bubLay = (() => { const d = document.createElement('div'); d.id = 'bubs'; document.body.appendChild(d); return d; })();
function bub(k, text, x, y, z) { let e = bubM.get(k); if (!text) { if (e) e.want = false; return; }
  if (!e) { if (bubM.size >= 8) return; const el = document.createElement('div'); el.className = 'bub'; bubLay.appendChild(el); e = { el, text: '', p: new THREE.Vector3(), want: false, shown: false }; bubM.set(k, e); }
  e.want = true; e.p.set(x, y, z); if (e.text !== text) { e.text = text; e.el.textContent = text; } }
function bubFlush() { const w = innerWidth, h = innerHeight;
  for (const e of bubM.values()) { if (e.want) { _cD.copy(e.p).project(camera); const on = _cD.z < 1; if (on) { e.el.style.left = ((_cD.x + 1) / 2 * w).toFixed(1) + 'px'; e.el.style.top = ((1 - _cD.y) / 2 * h).toFixed(1) + 'px'; }
      if (on !== e.shown) { e.shown = on; e.el.style.display = on ? 'block' : 'none'; } } else if (e.shown) { e.shown = false; e.el.style.display = 'none'; } e.want = false; } }
/* cutscene frame: letterbox bars + a hint while it plays; the fade to dark at its end and the ~1 s fade back in */
const cutUI = (() => { const bars = document.createElement('div'); bars.id = 'cutbars'; bars.innerHTML = '<i></i><i></i>'; const fade = document.createElement('div'); fade.id = 'cutfade';
  const hint = document.createElement('div'); hint.id = 'cuthint'; document.body.append(bars, fade, hint); return { bars, fade, hint, st: '' }; })();
function syncCutUI() {
  const cut = G.freeze === 'cut' && G.state !== 'title', c = G.cut, t = c ? c.t : 0;
  const fo = cut ? .75 * ss(CUT.CLOSE - .4, CUT.CLOSE, t) : G.ease > 0 && G.state === 'play' || G.ease > 0 && G.state === 'paused' ? .75 * G.ease / CUT.REENTRY : 0;
  const st = (cut ? 1 : 0) + '|' + fo.toFixed(2) + '|' + (cut ? c.sp : 0);
  if (st !== cutUI.st) { cutUI.st = st; cutUI.bars.className = cut ? 'on' : ''; cutUI.fade.style.opacity = fo.toFixed(2); cutUI.fade.style.display = fo > 0 ? 'block' : 'none';
    cutUI.hint.style.display = cut ? 'block' : 'none'; if (cut) cutUI.hint.textContent = c.sp > 1 ? 'hurrying him up x' + c.sp : 'click buddy to hurry him up'; }
}
function cutPointer(e) {   // a click on buddy during the cutscene speeds it up
  if (G.freeze !== 'cut' || !buddy.root.visible) return false; const r = cv.getBoundingClientRect(), s = buddy.root.scale.y;
  _cD.copy(buddy.root.position); _cD.y += s * .5; _cD.project(camera); const sx = r.left + (_cD.x + 1) / 2 * r.width, sy = r.top + (1 - _cD.y) / 2 * r.height;
  _cA.copy(buddy.root.position); _cA.y += s; _cA.project(camera); const rad = Math.max(60, Math.abs(_cA.y - _cD.y) / 2 * r.height * 1.3);
  if (Math.hypot(e.clientX - sx, e.clientY - sy) > rad) return false; return cutClick();
}
const SUPER_H = () => SU.SIZE * heroH();   // super buddy's height (world units): SIZE x mudbot's height
pl.sq = 0; pl.tailB = 0; pl.dustT = 0; pl.wasAir = false; pl.wasGround = true; pl.vyMax = 0; pl.wasDead = false; pl.lastInv = 0; pl.lastLives = -1; pl.lastRoom = -1; pl.runPh = 0; pl.hurtT = 0; pl.smokeT = 0; pl.lid = .13; pl.slant = 0;
const Z_BACK = -6, Z_FRONT = 9;
const frontH = (x, z) => { const m = z >= 0 ? sstep(2.4, 4.4, z) * (1 - sstep(7.4, Z_FRONT, z)) : sstep(2.4, 4.4, -z) * (1 - sstep(4.2, -Z_BACK, -z)); return m * (.15 + fbm(x * .33, z * .33) * .75); };
const bankH = (x, z) => sstep(6, 16, -z) * (fbm(x * .16, z * .16) * 3.6 - .3);
const TAU = Math.PI * 2;
function groundTop(x0, x1, poolsPx) {
  const w = x1 - x0, g = new THREE.PlaneGeometry(w, Z_FRONT - Z_BACK, Math.max(1, Math.ceil(w / 1.3)), 26); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), pth = new Float32Array(p.count), cx = (x0 + x1) / 2, cz = (Z_BACK + Z_FRONT) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz; let pm = 0; for (const q of poolsPx) pm = Math.max(pm, 1 - sstep(.5, 1.5, Math.max(q[0] - x, x - q[1], 0)));
    const ef = sstep(0, .9, x - x0) * sstep(0, .9, x1 - x), y = .03 + frontH(x, z) * ef * (1 - pm);
    p.setXYZ(i, x, y, z);
    const n = fbm(x * .22, z * .22), n2 = vn(x * 1.9, z * 1.9), az = Math.abs(z), pw = 1 - sstep(1.5, 2.5 + (n2 - .5) * 1.3, az);
    _c.set('#2f7a3f').lerp(_c2.set('#5ba84e'), sstep(.25, .8, n)).lerp(_c2.set('#8dbb5a'), sstep(.62, .95, n2) * .25).lerp(_c2.set('#1f5a38'), sstep(3, 8, z < 0 ? -z * 1.4 : z * .35) * .5);
    _c.lerp(_c2.set('#b69661').lerp(_c.set('#9d7b4a'), n2 * .5), pw * .9); pth[i] = pw;
    if (ef < 1) _c.multiplyScalar(.6 + .4 * ef);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aPath', new THREE.BufferAttribute(pth, 1)); g.computeVertexNormals(); return g;
}
function dirtBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / 2)), 4, 1);
  return paintVC(g, (x, y, z) => { const band = .8 + .2 * Math.sin((y + h / 2) * 3.3 + vn(x * .4, y) * 5), s = lerp(1, .22, sstep(0, 5.6, -(y - h / 2))) * band * (.88 + .24 * vn(x * 1.2, y * 2)); return [s * 1.05, s * .92, s * .85]; });
}
function bankGeo() {
  const g = new THREE.PlaneGeometry(76, 38, 46, 24); g.rotateX(-Math.PI / 2); const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 16, z = p.getZ(i) - 25; p.setXYZ(i, x, bankH(x, z), z);
    const n = fbm(x * .2, z * .2); _c.set('#256a3c').lerp(_c2.set('#4f9a4e'), sstep(.3, .85, n)).lerp(_c2.set('#17432e'), sstep(10, 30, -z) * .6); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
const TRUNK_COL = ['#7a5a3c', '#6b4f38', '#85664a', '#5e4a38'], LEAF_COL = ['#2f7a3f', '#3d8f45', '#256a48', '#5aa347', '#2c7a58', '#4a9a3c'];
function instFrom(list, geo, mat, R, v, cast) {
  if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((o, i) => { _o.position.set(o.x, o.y, o.z); _o.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); _o.scale.set(o.sx, o.sy === undefined ? o.sx : o.sy, o.sz === undefined ? o.sx : o.sz); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); m.setColorAt(i, _c.set(o.c || '#ffffff')); });
  m.castShadow = !!cast; m.receiveShadow = true; R.add(m); v.own.push(m); return m;
}
/* ---- living backdrop with depth: 3 parallax layers past the tree line (built once; rebuilt when the quality changes) ----
   near (z -26): birds crossing in small flocks, glowing bugs over the canopy; mid (z -42): big long-necked creatures walking
   slowly in the haze; far (z -64): ruined towers, a broken arch and a stepped ruin peeking through the mist, light shafts.
   Each layer follows the camera by its own factor k (BD_LAYERS), so the far one drifts slowest on screen (parallax).
   Depth: own haze-tinted unlit materials (fog: false; the scene fog would swallow them at this distance) plus mist cards.
   Draw cost: everything is instanced or merged: bird bodies, bird wings, bugs, creature bodies, creature legs, structures,
   mist, light shafts = 8 calls on HIGH (the shafts are single pass: a transparent double-sided material is otherwise drawn twice); LOW has fewer creatures, birds, bugs, shafts, structures and mist (QL().bd).
   GRAPHITE ART SWAP (later): each layer has a hidden full-width art card (bd.layers[i].card). setBackdropArt(i, texture, hideCode)
   puts a painted transparent texture on it and can hide that layer's code-built pieces; the parallax, mist and fog stay. */
const BD_LAYERS = [{ name: 'near', z: -26, k: .25, haze: .35 }, { name: 'mid', z: -42, k: .5, haze: .55 }, { name: 'far', z: -64, k: .72, haze: .72 }];
const bd = { root: new THREE.Group(), layers: [], own: [], birds: [], bugs: [], crs: [], mist: [], t: 0, n: {} };
bd.root.name = 'backdrop'; scene.add(bd.root);
const hazeCol = (hex, t) => new THREE.Color(hex).lerp(new THREE.Color(FOGC), t);
const bdM4 = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx, sy, sz));
function mergeParts(list) {   // [geometry, matrix, colour] -> one non-indexed geometry with vertex colours (one draw call)
  let n = 0; const gs = list.map(([g, m, c]) => { const q = g.index ? g.toNonIndexed() : g.clone(); q.applyMatrix4(m); n += q.attributes.position.count; return [q, c]; });
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const [q, c] of gs) { const k = q.attributes.position.count; P.set(q.attributes.position.array, o * 3); for (let i = 0; i < k; i++) { C[(o + i) * 3] = c.r; C[(o + i) * 3 + 1] = c.g; C[(o + i) * 3 + 2] = c.b; } o += k; q.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g;
}
function buildBackdrop() {
  for (const o of bd.own) o.dispose(); bd.own = []; bd.root.clear(); bd.layers = []; bd.birds = []; bd.bugs = []; bd.crs = []; bd.mist = [];
  const q = QL(), [nCr, nBird, nBug, nShaft, nSt, nMist] = q.bd, r = mulberry(hash('backdrop'));
  bd.n = { creatures: nCr, birds: nBird, bugs: nBug, shafts: nShaft, structures: nSt, mist: nMist };
  const basic = o => { const m = new THREE.MeshBasicMaterial(Object.assign({ fog: false }, o)); bd.own.push(m); return m; };
  const inst = (geo, mat, n, parent) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; parent.add(m); bd.own.push(m); return m; };
  BD_LAYERS.forEach(L => { const g = new THREE.Group(); g.name = 'bd-' + L.name; g.position.z = L.z; bd.root.add(g);
    const card = new THREE.Mesh(gQuad, basic({ transparent: true, depthWrite: false })); card.visible = false; card.scale.set(160, 60, 1); card.position.set(16, 22, -1); g.add(card);
    bd.layers.push(Object.assign({}, L, { g, card, code: [] })); });
  const [near, mid, far] = bd.layers;
  // far: structures in one merged mesh, light shafts
  { const parts = [], c1 = hazeCol('#566b60', far.haze), c2 = hazeCol('#6c8075', far.haze);
    for (let k = 0; k < nSt; k++) { const x = -42 + k * (116 / Math.max(1, nSt - 1)) + (r() - .5) * 8, kind = k % 3, h = 18 + r() * 16;
      if (kind === 0) parts.push([gCyl, bdM4(x, h / 2, 0, 3.4, h, 3.4), c1], [gCone, bdM4(x, h + 2.6, 0, 4.8, 5.2, 4.8), c2], [gBox, bdM4(x, h * .62, 0, 4.4, 1.2, 4.4), c2]);   // tower, pointed roof, a ring
      else if (kind === 1) { const w = 10 + r() * 6; parts.push([gBox, bdM4(x - w / 2, h * .4, 0, 2.4, h * .8, 2.4), c1], [gBox, bdM4(x + w / 2, h * .3, 0, 2.4, h * .6, 2.4), c1], [gBox, bdM4(x - w * .12, h * .8, 0, w * .85, 2, 2.4, 0, 0, .14), c2]); }   // broken arch
      else for (let st = 0; st < 4; st++) parts.push([gBox, bdM4(x, 2 + st * 4.2, 0, 15 - st * 3.2, 4.2, 8 - st), st % 2 ? c2 : c1]); }   // stepped ruin
    const m = new THREE.Mesh(mergeParts(parts), basic({ vertexColors: true })); bd.own.push(m.geometry); far.g.add(m); far.code.push(m); bd.st = m;
    const sh = inst(gQuad, basic({ map: texRay, color: '#fff1cf', transparent: true, opacity: .2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true }), nShaft, far.g); sh.renderOrder = 2;
    for (let k = 0; k < nShaft; k++) { _o.position.set(-28 + k * (88 / Math.max(1, nShaft - 1)) + r() * 6, 22, 8); _o.rotation.set(0, 0, -.38); _o.scale.set(6 + r() * 6, 64, 1); _o.updateMatrix(); sh.setMatrixAt(k, _o.matrix); }
    bd.shafts = sh; }
  // mid: big long-necked creatures (merged body + instanced legs)
  { const c = hazeCol('#3c5046', mid.haze), parts = [[gSph, bdM4(0, 8, 0, 9, 5, 4.2), c], [gCyl, bdM4(5.2, 12.4, 0, 1.3, 9.5, 1.3, 0, 0, -.62), c], [gSph, bdM4(8.6, 16.6, 0, 2.6, 1.5, 1.4), c], [gCone, bdM4(-7.5, 7.2, 0, 2.2, 8, 2.2, 0, 0, 1.75), c]];
    const geo = mergeParts(parts); bd.own.push(geo); const body = inst(geo, basic({ vertexColors: true }), nCr, mid.g); mid.code.push(body);
    const legGeo = gCyl.clone(); legGeo.translate(0, -.5, 0); bd.own.push(legGeo); const legs = inst(legGeo, basic({ color: c }), nCr * 4, mid.g); mid.code.push(legs);
    for (let k = 0; k < nCr; k++) bd.crs.push({ x: -30 + k * (90 / Math.max(1, nCr)) + r() * 10, sp: .5 + r() * .5, ph: r() * 6, s: .8 + r() * .35, z: (r() - .5) * 6 });
    bd.body = body; bd.legs = legs; }
  // near: birds (bodies + flapping wings), glowing bugs over the canopy
  { const c = hazeCol('#26302b', near.haze), mat = basic({ color: c, side: THREE.DoubleSide });
    const wingGeo = gQuad.clone(); wingGeo.translate(0, .5, 0); bd.own.push(wingGeo);
    bd.bBody = inst(gSph, mat, nBird, near.g); bd.bWing = inst(wingGeo, mat, nBird * 2, near.g); near.code.push(bd.bBody, bd.bWing);
    let fx = 0, fy = 0, fsp = 5;
    for (let k = 0; k < nBird; k++) { if (k % 4 === 0) { fx = -40 + r() * 90; fy = 13 + r() * 7; fsp = (r() < .5 ? -1 : 1) * (4 + r() * 3); }
      bd.birds.push({ x: fx + (k % 4) * 2.2 + r(), y: fy - (k % 4) * .9 + r() * .5, z: (r() - .5) * 4, sp: fsp, ph: r() * 6 }); }
    bd.bug = inst(gQuad, basic({ map: texGlow, color: '#fff2a0', transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending }), nBug, near.g); near.code.push(bd.bug);
    for (let k = 0; k < nBug; k++) bd.bugs.push({ x: -20 + r() * 72, y: 6 + r() * 9, z: 10 + r() * 6, ph: r() * 6, s: .25 + r() * .25 }); }
  // mist: soft cards drifting in front of each layer (one instanced mesh; moved with its layer each frame)
  bd.mistM = inst(gQuad, basic({ map: texSoft, color: '#e4ede0', transparent: true, opacity: .5, depthWrite: false }), nMist, bd.root);
  for (let k = 0; k < nMist; k++) bd.mist.push({ L: k % 3, x: -40 + r() * 110, y: [6, 7, 9][k % 3] + r() * 3, z: 3, w: 40 + r() * 30, h: 7 + r() * 4, ph: r() * 6 });
  buildPlates(); bd.t = 0; backdropUpdate(0);
}
// put a painted layer on (later): texture = a THREE texture (transparent PNG); hideCode hides that layer's code-built pieces
function setBackdropArt(i, texture, hideCode) { const L = bd.layers[i]; if (!L) return false; L.card.material.map = texture || null; L.card.material.needsUpdate = true; L.card.visible = !!texture; L.code.forEach(o => { o.visible = !(texture && hideCode); }); return true; }
/* ---- forest plates: painted parallax layers (art/forest-tex.js = the light set for web and phones; the full set only on a desktop/Steam build) ----
   Back plates (sky, far, middle, nearback) hang behind the tree line on their own depth and parallax factor; the full set adds the front
   plate in the scene in front of the lane, and screen plates (canopy from the top; ground, off) that ride with the camera and scroll faster than the lane.
   Every plate repeats sideways (wrapS 1000 = RepeatWrapping, wrapT 1001 = ClampToEdge; the slim bundle has no enum names).
   Each room shows its own slice: the texture offset carries the room index, so walking across a room edge keeps the picture continuous.
   Edges: each plate's top/bottom edge either sits off screen, behind the hills, or fades out in the shader (uFade), so no hard cut shows.
   OG world: enterOG(fromRoom) / leaveOG() / isOG() show exactly the old side-scroller look (plates hidden, ruins and creatures back,
   the code-made croc skin); no gameplay change. Its entry is a hidden spot on the top-down map (topworld.js calls these).
   Desktop/Steam: window.MUD_STEAM = { art: '<folder>/' } (set by the desktop wrapper before game.js) loads <folder>forest/<layer>.webp,
   same origin; the web page never sets it, so web and phones never download the full set. */
const FP_LAYERS = [   // z: depth, k: parallax (as BD_LAYERS), y0: world y of the plate bottom, h: world height, fade: [bottom from, bottom to, top from, top to] in plate v (0 = bottom)
  { name: 'sky', z: -100, k: .95, haze: 0, light: { y0: -10, h: 64, fade: [0, .03, .9, 1] }, full: { y0: -10, h: 62, fade: [0, .03, .9, 1] } },
  { name: 'far', z: -64, k: .72, haze: .42, light: { y0: -3.5, h: 27, fade: [0, .03, .62, .95] }, full: { y0: -3.5, h: 46, fade: [0, .01, .9, 1] } },
  { name: 'middle', z: -42, k: .5, haze: .26, light: { y0: -1.5, h: 21, fade: [0, .04, .93, 1] }, full: { y0: -1.5, h: 22, fade: [0, .04, .93, 1] } },
  { name: 'nearback', z: -26, k: .25, haze: .12, light: { y0: -2, h: 11, fade: [0, .06, .9, 1] }, full: { y0: -2, h: 10, fade: [0, .06, .9, 1] } },
  // screen plates (full set only): band = [bottom, top] as a share of the screen height; dv = the depth they scroll as if they stood at
  { name: 'ground', screen: true, full: { band: [0, .17], dv: 15, fade: [0, 0, .55, 1], off: true }, order: 50 },   // off: as a bottom band it reads as a second path the hero can't walk on
  // front (full set): stands in the scene just in front of the lane (z +3), so its moss and fern tips pass in front of mudbot's feet and legs
  // top = the share of the plate the fern tips reach (measured from the picture), kept below the hero's head
  { name: 'front', z: 3, k: 0, haze: 0, full: { y0: -.1, h: 6, top: .42, fade: [0, .1, .9, 1] } },
  { name: 'canopy', screen: true, full: { band: [.8, 1], dv: 11, fade: [0, .35, 1, 1] }, order: 52 }
];
const FP = { tex: {}, meshes: [], og: false, ogFrom: null, steam: null, steamLog: [] };
{ const S = window.MUD_STEAM; if (S && typeof S === 'object' && typeof S.art === 'string' && /^\w[\w./-]*\/$/.test(S.art) && S.art.indexOf('..') < 0 && S.art.indexOf('//') < 0) FP.steam = S.art; }
function fpTexture(im) { const t = new THREE.CanvasTexture(im); t.wrapS = 1000; t.wrapT = 1001; t.colorSpace = THREE.SRGBColorSpace;
  if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; }
function fpSet(name, im, tier) {   // a plate picture arrived: new texture, put it on the plate, dispose the one it replaces
  const old = FP.tex[name]; FP.tex[name] = { t: fpTexture(im), w: im.naturalWidth || im.width, h: im.naturalHeight || im.height, tier };
  for (const P of FP.meshes) if (P.L.name === name) fpApply(P);
  if (old) old.t.dispose();
}
function fpLoad(name, src, tier) { const im = new Image(); im.onload = () => { if (tier === 'light' && FP.tex[name] && FP.tex[name].tier === 'full') return; fpSet(name, im, tier); };
  im.onerror = () => { FP.steamLog.push('missing ' + name); }; im.src = src; }
{ const A = window.JR_FOREST; if (A) for (const L of FP_LAYERS) if (A[L.name] && A[L.name].src) fpLoad(L.name, A[L.name].src, 'light');
  if (FP.steam) for (const L of FP_LAYERS) if (!(L.full && L.full.off)) fpLoad(L.name, FP.steam + 'forest/' + L.name + '.webp', 'full'); }
function fpMat(L) {   // unlit, fog off; the shader fades the plate's top/bottom edge (uFade) and mixes in its layer's haze (uHazeK)
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, depthTest: !L.screen, toneMapped: false });
  m.userData.U = { uFade: { value: [0, 0, 1, 1] }, uHaze: { value: new THREE.Color(FOGC) }, uHazeK: { value: L.haze || 0 }, uA: { value: 1 } };
  m.onBeforeCompile = s => { Object.assign(s.uniforms, m.userData.U);
    s.fragmentShader = 'uniform float uFade[4]; uniform vec3 uHaze; uniform float uHazeK, uA;\n' + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\n  diffuseColor.a *= smoothstep(uFade[0], uFade[1] + 1e-4, vMapUv.y) * (1. - smoothstep(uFade[2], uFade[3] + 1e-4, vMapUv.y)) * uA;\n  diffuseColor.rgb = mix(diffuseColor.rgb, uHaze, uHazeK);\n#endif'); };
  bd.own.push(m); return m;
}
/* ground fill: the room's hill strip ends at x -22..54 and z -44, so on wide
   screens at a room end the plates would hang over a fog gap and their bottoms would show. The fill continues the same ground (bankH, the hills'
   colours, AM.bank) 0.12 below the hills, x -160..192, z -6.2..-112: every plate bottom sits under the ground at its own depth, so a camera above
   the ground cannot see it. One draw call; hidden in the OG world. */
const FP_FILL = { x0: -160, x1: 192, z0: -6.2, z1: -112, dy: -.12 };
function fpFillY(x, z) { return bankH(x, z) + FP_FILL.dy; }
function buildFill() {
  const F = FP_FILL, hi = Qi === 1, nx = hi ? 176 : 88, nz = hi ? 53 : 27, g = new THREE.PlaneGeometry(F.x1 - F.x0, F.z0 - F.z1, nx, nz); g.rotateX(-Math.PI / 2);
  const pp = g.attributes.position, col = new Float32Array(pp.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) + (F.x0 + F.x1) / 2, z = pp.getZ(i) + (F.z0 + F.z1) / 2; pp.setXYZ(i, x, fpFillY(x, z), z);
    const n = fbm(x * .2, z * .2); c.set('#256a3c').lerp(c2.set('#4f9a4e'), sstep(.3, .85, n)).lerp(c2.set('#17432e'), sstep(10, 30, -z) * .6); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); bd.own.push(g);
  const m = new THREE.Mesh(g, AM.bank); m.name = 'fp-fill'; m.receiveShadow = true; bd.root.add(m); FP.fill = m;
}
function buildPlates() {   // called by buildBackdrop (start, quality change); the textures live in FP.tex and survive a rebuild
  FP.meshes = []; buildFill();
  for (const L of FP_LAYERS) { const g = new THREE.Group(); g.name = 'fp-' + L.name; if (!L.screen) g.position.z = L.z; bd.root.add(g);
    const mesh = new THREE.Mesh(gQuad, fpMat(L)); mesh.frustumCulled = false; mesh.renderOrder = L.order || 0; mesh.visible = false; g.add(mesh);
    const P = { L, g, mesh, lay: null, wpl: 1 }; FP.meshes.push(P); fpApply(P); }
  fpVis();
}
function fpApply(P) {   // size the plate for the tier its texture came from
  const T = FP.tex[P.L.name], m = P.mesh.material; if (!T) { P.lay = null; P.mesh.visible = false; return; }
  const lay = P.L[T.tier] || P.L.full || P.L.light; P.lay = lay; m.map = T.t; m.needsUpdate = true; m.userData.U.uFade.value = lay.fade;
  if (!P.L.screen) { P.wpl = lay.h * T.w / T.h; const hw = 1.12 * (21 - P.L.z) + 28 * (1 - P.L.k) + 6;   // half width: a 2.4:1 screen at this depth + the camera's travel (cam.x -12..44) + margin
    P.mesh.scale.set(hw * 2, lay.h, 1); P.mesh.position.set(16 * (1 - P.L.k), lay.y0 + lay.h / 2, 0); T.t.repeat.set(hw * 2 / P.wpl, 1); }
  fpVis();
}
function fpVis() {   // plates on (new forest) or the OG world (exactly the old code-built backdrop)
  const on = !FP.og;
  for (const P of FP.meshes) P.mesh.visible = on && !!P.lay;
  if (FP.fill) FP.fill.visible = on;
  const art = on && FP.meshes.some(P => P.lay);
  if (bd.layers.length) { bd.layers[1].code.forEach(o => { o.visible = !art; }); bd.layers[2].code.forEach(o => { o.visible = !art; }); }   // mid creatures and far ruins step aside for the plates
}
function setOgWorld(v) { FP.og = !!v; fpVis(); crocSkinOG(FP.og); return FP.og; }
function enterOG(fromRoom) { FP.ogFrom = fromRoom === undefined ? null : fromRoom; return setOgWorld(true); }
function leaveOG() { const r = FP.ogFrom; FP.ogFrom = null; setOgWorld(false); return r; }   // returns the room it was entered from
function isOG() { return FP.og; }
const _fpV = new THREE.Vector3();
function platesUpdate() {
  if (FP.og && (G.state === 'title' || G.state === 'end')) leaveOG();   // the OG world never leaks into the next run
  if (!FP.meshes.length) return;
  const gx = (G.room || 0) * 32 + cam.x, tanV = Math.tan(camera.fov * Math.PI / 360), asp = camera.aspect, cut = Math.max(0, Math.min(1, cam.cut || 0));
  for (const P of FP.meshes) { if (!P.lay) continue; const L = P.L, T = FP.tex[L.name], lay = P.lay;
    if (!L.screen) { P.g.position.x = cam.x * L.k; const o = ((G.room || 0) * 32 * (1 - L.k) + 16 * (1 - L.k) - P.mesh.scale.x / 2) / P.wpl; T.t.offset.x = o - Math.floor(o);
      if (L.z > 0) { P.mesh.material.userData.U.uA.value = 1 - cut; P.mesh.visible = !FP.og && cut < .99; }   // the front plate steps away for the close-up cutscene camera
      continue; }   // content at x = u*wpl - 32*room*(1-k): continuous across rooms
    // screen plate: a card 1 unit in front of the camera covering its band of the screen; it scrolls like a plate standing dv in front of the camera
    const fh = 2 * tanV, b0 = lay.band[0], b1 = lay.band[1], h = (b1 - b0) * fh, w = fh * asp * 1.04, pa = T.w / T.h;
    _fpV.set(0, -tanV + (b0 + b1) / 2 * fh, -1).applyQuaternion(camera.quaternion); P.mesh.position.copy(camera.position).add(_fpV); P.mesh.quaternion.copy(camera.quaternion); P.mesh.scale.set(w, h, 1);
    const wplV = (b1 - b0) * 2 * lay.dv * tanV * pa; T.t.repeat.set(asp / ((b1 - b0) * pa) * 1.04, 1); const o = gx / wplV; T.t.offset.x = o - Math.floor(o);
    P.mesh.material.userData.U.uA.value = 1 - cut; P.mesh.visible = !FP.og && cut < .99; }
}
function backdropUpdate(dt) {
  if (!bd.layers.length) return; bd.t += dt; const t = bd.t;
  for (const L of bd.layers) L.g.position.x = cam.x * L.k;   // parallax: a layer that follows the camera more drifts slower on screen
  for (let i = 0; i < bd.birds.length; i++) { const b = bd.birds[i]; b.x += b.sp * dt; if (b.x > 75) b.x = -40; else if (b.x < -40) b.x = 75;
    const y = b.y + Math.sin(t * 1.3 + b.ph) * .4, f = Math.sin(t * 11 + b.ph), d = Math.sign(b.sp);
    _o.position.set(b.x, y, b.z); _o.rotation.set(0, 0, 0); _o.scale.set(1.2, .42, .5); _o.updateMatrix(); bd.bBody.setMatrixAt(i, _o.matrix);
    for (const s of [-1, 1]) { _o.position.set(b.x - d * .1, y + .05, b.z); _o.rotation.set(s * (.5 + f * .9), 0, 0); _o.scale.set(.7, 1.3, 1); _o.updateMatrix(); bd.bWing.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), _o.matrix); } }
  if (bd.bBody) { bd.bBody.instanceMatrix.needsUpdate = true; bd.bWing.instanceMatrix.needsUpdate = true; }
  for (let i = 0; i < bd.bugs.length; i++) { const u = bd.bugs[i], k = .7 + .3 * Math.sin(t * 6 + u.ph * 3);
    _o.position.set(u.x + Math.sin(t * .7 + u.ph) * 2, u.y + Math.sin(t * 1.1 + u.ph * 2) * 1, u.z); _o.quaternion.copy(camQ); _o.scale.set(u.s * k, u.s * k, 1); _o.updateMatrix(); bd.bug.setMatrixAt(i, _o.matrix); }
  if (bd.bug) bd.bug.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < bd.crs.length; i++) { const c = bd.crs[i]; c.x += c.sp * dt; if (c.x > 80) c.x = -45;
    const bob = Math.sin(t * c.sp * 2.4 + c.ph) * .25;
    _o.position.set(c.x, bob, c.z); _o.rotation.set(0, 0, Math.sin(t * .5 + c.ph) * .03); _o.scale.set(c.s, c.s, c.s); _o.updateMatrix(); bd.body.setMatrixAt(i, _o.matrix);
    for (let l = 0; l < 4; l++) { const lx = (l < 2 ? 2.6 : -2.6) * c.s, lz = (l % 2 ? 1.2 : -1.2) * c.s, sw = Math.sin(t * c.sp * 2.4 + c.ph + (l === 0 || l === 3 ? 0 : Math.PI)) * .28;
      _o.position.set(c.x + lx, 6.2 * c.s + bob, c.z + lz); _o.rotation.set(0, 0, sw); _o.scale.set(1.3 * c.s, 6.6 * c.s, 1.3 * c.s); _o.updateMatrix(); bd.legs.setMatrixAt(i * 4 + l, _o.matrix); } }
  if (bd.body) { bd.body.instanceMatrix.needsUpdate = true; bd.legs.instanceMatrix.needsUpdate = true; }
  for (let i = 0; i < bd.mist.length; i++) { const m = bd.mist[i], L = bd.layers[m.L];
    _o.position.set(m.x + L.g.position.x + Math.sin(t * .05 + m.ph) * 6, m.y, L.z + m.z); _o.rotation.set(0, 0, 0); _o.scale.set(m.w, m.h, 1); _o.updateMatrix(); bd.mistM.setMatrixAt(i, _o.matrix); }
  if (bd.mistM) bd.mistM.instanceMatrix.needsUpdate = true;
  if (bd.shafts) bd.shafts.material.opacity = .17 + .06 * Math.sin(t * .4);
  platesUpdate();
}
let view = null, builtKey = '', forceRebuild = false;
function disposeView() { if (!view) return; for (const o of view.own) { o.dispose(); if (o.isMaterial) allMats.delete(o); } }   // per-room geometry, instanced meshes and materials
function buildRoom(room) {
  disposeView(); roomGroup.clear();
  const R = roomGroup, q = QL(), v = { fills: [], biters: [], tents: [], vines: [], snaps: [], logs: [], crawlers: [], gem: null, bubbles: [], tarFlag: room.holeKind === 'tar', own: [], pools: {}, bev: {}, qi: Qi, rays: [], gemGot: G.got.has(gid(room.i)) };
  const rr = mulberry(hash(G.seed + '|deco|' + room.i)), rt = mulberry(hash(G.seed + '|trees|' + room.i)), rd = mulberry(hash(G.seed + '|decor|' + room.i));
  const poolsPx = room.pools.map(pp => [X(pp.x0), X(pp.x1)]), holesU = room.holes.map(h => [X(h.x0), X(h.x1)]);
  const nearHole = (x, m) => holesU.some(h => x > h[0] - m && x < h[1] + m), nearPool = (x, m) => poolsPx.some(h => x > h[0] - m && x < h[1] + m);
  const groundY = (x, z) => z < -6 ? bankH(x, z) : frontH(x, z) * (nearPool(x, 1) ? 0 : 1) + .03;
  // ground in solid runs (holes cut out), extended past the room edges so the chase camera never sees the end of the world
  const cuts = room.holes.map(h => [h.x0, h.x1]).sort((a, b) => a[0] - b[0]);
  let cur = -160; const runs = [];
  for (const c of cuts) { runs.push([cur, c[0]]); cur = c[1]; } runs.push([cur, 480]);
  for (const [a, b] of runs) {
    const w = (b - a) * S, cx = X((a + b) / 2), g1 = dirtBox(w, 5.6, Z_FRONT - Z_BACK), g2 = groundTop(X(a), X(b), poolsPx); v.own.push(g1, g2);
    mk(g1, AM.dirt, cx, -2.8, (Z_FRONT + Z_BACK) / 2, 1, 1, 1, R).receiveShadow = true;
    const top = mk(g2, AM.groundTop, 0, 0, 0, 1, 1, 1, R, true); top.receiveShadow = true;
  }
  { const g = bankGeo(), g1 = dirtBox(76, 5.6, 36); v.own.push(g, g1); mk(g, AM.bank, 0, 0, 0, 1, 1, 1, R, true).receiveShadow = true; mk(g1, AM.dirt, 16, -2.85, -24, 1, 1, 1, R, true); }
  for (const h of room.holes) {
    const w = (h.x1 - h.x0) * S, cx = X((h.x0 + h.x1) / 2);
    if (h.fill) crevFillView(R, v, h, w, cx);
    else if (room.holeKind === 'tar') {
      mk(gFlat, M('#0d0907'), cx, -4.5, 3, w, 1, 15, R, true);
      const t = mk(gFlat, mats.tar, cx, -.18, 1.5, w, 1, Z_FRONT - Z_BACK, R, true); t.receiveShadow = true;
      for (let x = h.x0 + 8; x < h.x1 - 6; x += 14) { const b = mk(gSph, M('#4a3a30'), X(x), -.12, (rr() - .5) * 4, .5, .3, .5, R, true); v.bubbles.push(b); }
    } else mk(gFlat, M('#0d0907'), cx, -5.7, 1.5, w, 1, 15, R, true);
  }
  crevViews(R, v, room);
  for (const pool of room.pools) {                                   // snapper pools: shimmering water, rim stones, jaws
    const pw = (pool.x1 - pool.x0) * S, pcx = X((pool.x0 + pool.x1) / 2);
    mk(gFlat, mats.water, pcx, .06, 0, pw + .2, 1, 5.6, R, true).receiveShadow = true;
    for (let k = 0; k < 7; k++) { const sx = pcx + (rr() - .5) * (pw + 1), sz = (rr() < .5 ? -1 : 1) * (2.9 + rr() * .5); mk(gRock, AM.rim, sx, .1, sz, .8 + rr() * .9, .8 + rr() * .5, .7 + rr() * .6, R); }
    const w = pw / pool.n;
    for (let k = 0; k < pool.n; k++) { const sn = buildSnapper(w); sn.root.position.x = X(pool.x0) + (k + .5) * w; if (pool.dir && pool.dir[k] < 0) sn.root.rotation.y = Math.PI; R.add(sn.root);
      const tail = mk(capG(.42, 1.5), CROC_MAT.skin, sn.root.position.x, .1, -1.55, 1, 1, 1, R); tail.rotation.x = Math.PI / 2;   // the croc's body trailing back into the pool
      for (let j = 0; j < 4; j++) mk(gCone, CROC_MAT.scute, sn.root.position.x, .42, -.9 - j * .42, .2, .26, .2, R);              // back scutes along the trailing body
      rot(mk(gFlat, CROC_MAT.ridge, sn.root.position.x, .53, -1.55, 1.9, 1, .45, R, true), 0, Math.PI / 2, 0);                 // the ridge strip laid along the back
      v.snaps.push({ jaw: sn.jaw, pa: sn.pa, pb: sn.pb, pool, k, key: room.pools.indexOf(pool) + '_' + k, root: sn.root, y0: sn.root.position.y, dz: pool.dir && pool.dir[k] < 0 ? -1 : 1, tail }); }
  }
  const leafCard = matCache.leafCard || (matCache.leafCard = reg(new THREE.MeshLambertMaterial({ color: '#8fc04a', side: THREE.DoubleSide }))), vineMat = M(P.vine), knobMat = M('#8a5a30');
  for (const vn_ of room.vines) {
    const bx = X(vn_.ax), by = Y(VINE_Y);
    rot(mk(capG(.42, 5.2), AM.barkBranch, bx, by + .4, 0, 1, 1, 1, R), Math.PI / 2, 0, 0);                              // branch the vine hangs from
    mk(gBlob, AM.canopy[0], bx, by + 1.3, -1, 4.6, 2.2, 3.2, R); mk(gBlob, AM.canopy[1], bx + 1.8, by + 1.1, .8, 3.0, 1.7, 2.4, R); mk(gBlob, AM.canopy[2], bx - 1.9, by + 1.4, -.6, 3.2, 1.9, 2.6, R);
    const seg = new THREE.InstancedMesh(gCyl, vineMat, 9); seg.castShadow = true; seg.frustumCulled = false; R.add(seg); v.own.push(seg);
    const knob = mk(gSph, knobMat, 0, 0, 0, .65, .65, .65, R); const leaves = [.25, .45, .65, .85].map(s => ({ s, m: mk(gLeafCard, leafCard, 0, 0, 0, .9, .55, .9, R, true) }));
    v.vines.push({ vn: vn_, seg, knob, leaves });
  }
  // ---- trees (instanced): trunk + layered crowns + side branch clusters; room trees stand behind the lane, extra far trees fade into the fog ----
  const trunks = [], crowns = [], branches = [];
  const tree = (x, z, d, hgt, ci) => {
    const gy = groundY(x, z) - .2; trunks.push({ x, y: gy, z, sx: d, sy: hgt, sz: d, ry: rt() * TAU, c: TRUNK_COL[ci % 4] });
    const top = gy + hgt, lc = k => LEAF_COL[(ci + k) % LEAF_COL.length];
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rt() * .8, r = d * (1.3 + rt() * 1.2); crowns.push({ x: x + Math.cos(a) * r, y: top - .6 + rt() * 1.8, z: z + Math.sin(a) * r * .8, sx: d * (3.2 + rt() * 1.4), sy: 2.4 + rt() * .9, sz: d * (3.2 + rt() * 1.4), ry: rt() * 6, c: lc(k) }); }
    crowns.push({ x, y: top + 1.2, z, sx: d * 3.6, sy: 2.6, sz: d * 3.6, ry: rt() * 6, c: lc(5) });
    for (const s of [-1, 1]) { const by = gy + hgt * (.55 + rt() * .2), len = d * (2.2 + rt() * 1.5); branches.push({ x: x + s * len * .5, y: by + len * .25, z, sx: .5 * d + .25, sy: len * 1.1, sz: .5 * d + .25, rz: -s * 1.05, c: TRUNK_COL[ci % 4] });
      crowns.push({ x: x + s * len * 1.05, y: by + len * .55 + .4, z: z + rt() - .5, sx: d * 2.4 + 1.2, sy: 1.8 + rt(), sz: d * 2.4 + 1.2, ry: rt() * 6, c: lc(s + 2) }); }
  };
  room.trees.forEach((t, k) => tree(X(t.x + t.w / 2), -7.5 - k * 1.6 - rr() * 1.5, t.w * S * .95, 16, t.c * 2 + k));
  for (let k = 0; k < 14; k++) tree(-12 + rr() * 56, -16 - rr() * 22, 1 + rr() * 1.4, 17, Math.floor(rr() * 4));
  for (let k = 0; k < q.far; k++) tree(-10 + rt() * 52, -9.5 - rt() * 7, .8 + rt() * .9, 13 + rt() * 4, Math.floor(rt() * 4));      // extra mid-ground trees (visual only)
  if (room.i === 0) trunks.push({ x: -1.4, y: -.2, z: 0, sx: 2.8, sy: 18, sz: 2.8, c: TRUNK_COL[0] });                  // outer walls: big trunks
  if (room.i === ROOMS - 1) trunks.push({ x: 33.4, y: -.2, z: 0, sx: 2.8, sy: 18, sz: 2.8, c: TRUNK_COL[0] });
  instFrom(trunks, gTrunk, AM.bark, R, v, true); instFrom(crowns, gBlob, mats.leaf, R, v, true); instFrom(branches, gCyl, AM.barkPlain, R, v, true);
  // far silhouettes (hills in the haze)
  const hills = []; for (let k = 0; k < 9; k++) hills.push({ x: -16 + k * 8.5 + rd() * 4, y: 2 + rd() * 5, z: -52 - rd() * 20, sx: 26 + rd() * 20, sy: 10 + rd() * 12, sz: 16, c: rd() < .5 ? '#3f7f6a' : '#4a8a6a' });
  instFrom(hills, gBlob, MV('#ffffff'), R, v, false);
  // ground cover: grass tufts, ferns, flowers, rocks, pebbles (all instanced; counts depend on quality)
  const grass = [], ferns = [], flowers = [], rocks = [], pebbles = [], FL = ['#f0b6c8', '#f3e18a', '#ffffff', '#f0956a'];
  const okPos = (x, z) => !nearHole(x, .5) && !(z > -2.2 && z < 3.4);
  for (let k = 0, n = 0; n < q.grass && k < q.grass * 4; k++) { const x = -7 + rd() * 46, z = -5.6 + rd() * 14.2; if (!okPos(x, z)) continue; n++;
    grass.push({ x, y: groundY(x, z) - .02, z, sx: .8 + rd() * .8, sy: (.7 + rd() * 1.1) * (z > 0 ? .55 : 1), sz: .8 + rd() * .8, ry: rd() * 6, c: rd() < .25 ? '#c4d86a' : rd() < .5 ? '#88c860' : '#5cae52' }); }
  for (let k = 0, n = 0; n < q.fern && k < q.fern * 4; k++) { const x = -7 + rd() * 46, z = rd() < .5 ? -6 - rd() * 7 : 5.5 + rd() * 3.5; if (nearHole(x, .5) && z > -6) continue; n++;
    ferns.push({ x, y: groundY(x, z) - .02, z, sx: 1.1 + rd() * 1.2, sy: .9 + rd() * 1.0, sz: 1.1 + rd() * 1.2, ry: rd() * 6, c: rd() < .5 ? '#4fa04c' : '#2f8a4a' }); }
  for (let k = 0, n = 0; n < q.flower && k < q.flower * 4; k++) { const x = -7 + rd() * 46, z = 2.5 + rd() * 6; if (nearHole(x, .5) || nearPool(x, 0)) continue; n++; const hh = .35 + rd() * .3;
    flowers.push({ x, y: groundY(x, z) + hh, z, sx: .17 + rd() * .08, sy: .12, sz: .17 + rd() * .08, c: FL[Math.floor(rd() * 4)] }); }
  for (let k = 0, n = 0; n < q.rock && k < q.rock * 4; k++) { const x = -7 + rd() * 46, z = rd() < .6 ? 4.5 + rd() * 4.5 : -6 - rd() * 6; if (nearHole(x, .8) || nearPool(x, 0)) continue; n++; const s = .5 + rd() * 1.4;
    rocks.push({ x, y: groundY(x, z) + s * .18, z, sx: s * 1.3, sy: s * (.7 + rd() * .5), sz: s * 1.1, ry: rd() * 6, c: rd() < .4 ? '#8a8174' : rd() < .5 ? '#6f7a6a' : '#9a8f7e' }); }
  for (let k = 0, n = 0; n < q.pebble && k < q.pebble * 4; k++) { const x = -7 + rd() * 46, z = (rd() - .5) * 4.4; if (nearHole(x, .5) || nearPool(x, .3)) continue; n++; const s = .12 + rd() * .2;
    pebbles.push({ x, y: .03 + s * .2, z, sx: s * 1.2, sy: s * .7, sz: s, ry: rd() * 6, c: rd() < .5 ? '#a89a80' : '#8b8070' }); }
  instFrom(grass, gTuft, mats.grass, R, v, false); instFrom(ferns, gFern, mats.fern, R, v, false);
  instFrom(flowers, gIco, M('#ffffff'), R, v, false); instFrom(rocks, gRock, AM.stone, R, v, true); instFrom(pebbles, gRock, AM.stone, R, v, false);
  // hanging lianas from the canopy (sway in the wind)
  const lians = []; for (let k = 0; k < q.lian; k++) { const x = -6 + rd() * 44, len = 5 + rd() * 8; lians.push({ x, y: 18, z: -5.5 - rd() * 3, sx: .16 + rd() * .1, sy: len, sz: .16 + rd() * .1, c: rd() < .5 ? '#3f7a3a' : '#5c9a3e' }); }
  instFrom(lians, gLian, mats.lian, R, v, false);
  // foreground bushes in front of the lane
  for (let k = 0; k < 8; k++) { const x = -6 + rr() * 44, z = 7.5 + rr() * 1.4; mk(gBlob, MV(rr() < .5 ? '#2f8a4a' : '#3d7f5c', true), x, .35, z, 2 + rr() * 1.6, 1.2 + rr(), 1.6, R); }
  if (room.treasure) { const t = room.treasure, gem = buildGem(t.kind); gem.root.position.set(X(t.x), Y(t.y), 0); R.add(gem.root, gem.halo, ...gem.stars); gem.root.userData.id = gid(room.i); gem.t = t; v.gem = gem; v.own.push(gem.core.material); }
  // sunlit god-ray cards (additive, slowly breathing) and drifting motes
  for (let k = 0; k < q.rays; k++) { const m = new THREE.Mesh(gQuad, new THREE.MeshBasicMaterial({ map: texRay, transparent: true, opacity: .2, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.renderOrder = 3;
    m.userData = { ox: -15 + k * (30 / Math.max(1, q.rays - 1)) + (rd() - .5) * 3, oz: -3.5 - rd() * 8, w: 2.2 + rd() * 3, ph: rd() * 6, base: .1 + rd() * .1 }; R.add(m); v.rays.push(m); v.own.push(m.material); }
  if (q.motes) { const mm = new THREE.InstancedMesh(gQuad, matCache.motes || (matCache.motes = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffeab0', transparent: true, opacity: .55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))), q.motes); mm.frustumCulled = false; mm.renderOrder = 4; R.add(mm); v.own.push(mm);
    v.motes = { mesh: mm, d: Array.from({ length: q.motes }, () => ({ x: rd() * 34 - 17, y: 1 + rd() * 9, z: -6 + rd() * 12, p: rd() * 6, s: .08 + rd() * .1 })) }; }
  if (room.i === WORK.ROOM) buildCaravan(R, v, room);   // the junk collector's caravan (its back flap is the workshop)
  if (BOSS_DEF[room.kind]) buildBossModel(room, R, v);
  view = v;
}
function ensureLog(i) {
  while (view.logs.length <= i) { const l = buildLog(); roomGroup.add(l.root); view.logs.push(l); l.root.traverse(o => { if (o.userData && o.userData.blob) o.visible = !QL().shadows; }); }
}
function ensureCrawlers(n) {
  while (view.crawlers.length < n) { const c = buildCrawler(); roomGroup.add(c.root); c.root.traverse(o => { if (o.userData && o.userData.blob) o.visible = !QL().shadows; }); view.crawlers.push(c); }
}

/* ---- boss models + per-frame sync ---- */
function buildBossModel(room, R, v) {
  const mkGate = x => { const gr = new THREE.Group(); gr.position.set(x, 0, 0); R.add(gr);
    for (let k = 0; k < 5; k++) { const z = -2.4 + k * 1.2, hh = 11 + (k % 2) * 1.4; mk(gTrunk, MV('#8a5a30'), 0, -.2, z, 1.3, hh, 1.3, gr); mk(gCone, M('#7a4a26'), 0, hh - .2 + .7, z, 1.3, 1.5, 1.3, gr); }
    [3, 8].forEach(y => mk(gBox, M('#3f2616'), 0, y, 0, 1.5, .4, 6.2, gr));
    return gr; };
  v.gates = [mkGate(X(1)), mkGate(X(W - 1))];
  const wk = new THREE.Group(); R.add(wk); mk(gOct, MS('#ffb347', .3, .2, '#ff8a30', true), 0, 0, 0, 1.1, 1.6, 1.1, wk); wk.visible = false; v.weak = wk;
  v.weakHalo = new THREE.Mesh(gQuad, new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffb347', transparent: true, opacity: .6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); v.weakHalo.scale.set(4.5, 4.5, 1); v.weakHalo.renderOrder = 4; v.weakHalo.visible = false; R.add(v.weakHalo); v.own.push(v.weakHalo.material);
  const mkMark = () => { const m = new THREE.Group(); const d = mk(gDisc, MB('#d9534f', .5), 0, .09, 0, 1, 1, 1, m, true); const r = mk(gRing, MB('#ff7a5a', .9), 0, .1, 0, 1.0, 1, 1.0, m, true); m.visible = false; m.disc = d; R.add(m); return m; };
  v.mark = mkMark();
  const g = new THREE.Group(); R.add(g); const bm = { kind: room.kind, g, skins: [] };
  if (room.kind === 'boss1') {
    mk(gFlat, mats.mire, X(160), .07, 0, 21, 1, 8.4, R, true).receiveShadow = true;                                    // the mire
    Object.assign(bm, buildBoss1(g, bm.skins, v.own));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, x = X(160) + Math.cos(a) * 11.5, z = Math.sin(a) * 4.8; mk(gRock, AM.bossRock, x, .15, z, 1.2 + (k % 3) * .4, 1.0, 1.0, R); }
  } else if (room.kind === 'boss2') Object.assign(bm, buildBoss2(g, bm.skins, v.own));
  else Object.assign(bm, buildBoss3(g, bm.skins, v.own));
  g.traverse(o => { if (o.isMesh) { o.userData.bossPart = true; } });
  v.own.push(...bm.skins); if (bm.eyes) for (const e of bm.eyes) v.own.push(e.material);
  bm.g = g; v.bm = bm;
}
function pget(key, i, mkf) { const a = view.pools[key] || (view.pools[key] = []); while (a.length <= i) { const m = mkf(); roomGroup.add(m); a.push(m); } return a[i]; }

const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vD = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const qprev = new WeakMap(); let VT = 0, WT = 0;
function flashSkins(bm, b, tele) {
  const f = b.flash > 0 ? (Math.floor(VT * 22) % 2 ? .85 : .35) : 0, t = tele ? (.5 + .5 * Math.sin(VT * 18)) * .3 : 0;
  for (const m of bm.skins) m.emissive.setRGB(f + t * 1.0, f * .85 + t * .08, f * .7 + t * .04);
}
function bossFx(b, bev, prev) {
  const bx = X(b.x);
  if (bev.hp !== undefined && b.hp < bev.hp) { const y = b.kind === 'boss2' ? Y(b.y) : b.kind === 'boss1' ? b.h * S + 3.5 : b.h * S * .6 + 2; fxBurst(bx, y, 16, '#ffd37a', 7); fxSpark(bx, y, 10, '#ffffff', 9, .8); addShake(.55); }
  bev.hp = b.hp;
  if (prev !== undefined && prev !== b.state) {
    if (b.kind === 'boss1' && b.state === 'lunge') { fxMud(X(b.cx), .2, 20, 9); fxDust(X(b.cx), .1, 8, 4, 3, '#5a4630'); addShake(.4); }
    else if (b.kind === 'boss1' && b.state === 'spit') fxMud(X(b.cx), 3, 8, 6);
    else if (b.kind === 'boss2' && b.state === 'land') { fxDust(bx, Y(b.y) - 2, 18, 7, 2.5); addShake(.5); }
    else if (b.kind === 'boss2' && b.state === 'swoop') fxDust(bx, Y(b.y), 6, 3, 1, '#d8e8c0');
    else if (b.kind === 'boss3' && b.state === 'dazed') { fxDust(bx - 3, .1, 14, 9, 3); fxDust(bx + 3, .1, 14, 9, 3); fxMud(bx, 1, 6, 6, '#7a5233'); addShake(.85); }
    else if (b.kind === 'boss3' && b.state === 'volley') fxMud(bx - 2.2, 4.5, 8, 5, '#8a5a30');
    else if (b.state === 'dying') { const y = b.kind === 'boss2' ? Y(b.y) : b.kind === 'boss1' ? b.h * S + 3 : 5; fxBurst(bx, y, 30, '#ffd37a', 11); fxDust(bx, y, 14, 6, 4, '#d8c9a0'); addShake(1.0); }
  }
  bev.state = b.state;
}
function syncBoss() {
  const v = view; if (!v.bm) return;
  const b = G.rs && G.rs.boss, bm = v.bm, g = bm.g, p = G.p, used = {};
  const use = (key, mkf) => { const i = used[key] || 0; used[key] = i + 1; const m = pget(key, i, mkf); m.visible = true; return m; };
  const locked = isLocked(); v.gates.forEach(x => { x.visible = locked; });
  g.visible = !!b; v.weak.visible = false; v.weakHalo.visible = false; v.mark.visible = false;
  if (b) {
    const tele = ['tele', 'stele', 'btele', 'stel', 'vtele'].includes(b.state), sh = tele ? Math.sin(VT * 60) * .06 : 0;
    bossFx(b, v.bev, v.bev.state);
    flashSkins(bm, b, tele);
    const wk = (x, y) => { v.weak.visible = true; v.weak.position.set(x, y, 0); v.weak.rotation.y = VT * 3; v.weakHalo.visible = true; v.weakHalo.position.set(x, y, 1); v.weakHalo.quaternion.copy(camera.quaternion); const s = 4.2 + Math.sin(VT * 6) * .5; v.weakHalo.scale.set(s, s, 1); };
    if (b.kind === 'boss1') {
      g.position.set(X(b.x) + sh, (b.h - 50) * S, 0); g.rotation.y += ((p && p.x < b.x ? Math.PI : 0) - g.rotation.y) * .15;
      g.rotation.z = Math.sin(VT * 1.7) * .03; bm.jaw.rotation.z = -b.mouth * .9;
      const pm = tele ? M('#ff4a3a', '#c02818') : M('#2a1c13'); bm.pupils.forEach(x => { x.material = pm; });
      if (b.state === 'tele' || b.state === 'stele') { const q = 3.2 + Math.sin(VT * 12) * .5; v.mark.visible = true; v.mark.position.x = X(b.cx); v.mark.scale.set(q, 1, q); v.mark.disc.material.opacity = .35 + .25 * Math.sin(VT * 14); }
      if (b.state === 'stun') wk(X(b.x), b.h * S + 1.3 + Math.sin(VT * 5) * .2);
      if (b.state === 'sink' && b.h > 3 && Math.random() < .4) fxMud(X(b.x), .2, 1, 3);
    } else if (b.kind === 'boss2') {
      g.position.set(X(b.x) + sh, Y(b.y) + (b.state === 'hover' ? Math.sin(VT * 3) * .2 : Math.sin(VT * 2) * .06), 0);
      g.rotation.y += ((p && p.x < b.x ? Math.PI : 0) - g.rotation.y) * .12;
      const folded = b.state === 'rest' || b.state === 'land', fl = folded ? .15 : Math.sin(VT * (b.state === 'swoop' ? 22 : 12)) * .7;
      bm.wings[0].rotation.x = fl; bm.wings[1].rotation.x = -fl; g.rotation.z = b.state === 'swoop' ? -.35 : Math.sin(VT * 2.2) * .04;
      if (b.state === 'rest') wk(X(b.x), Y(b.y) + 2.4 + Math.sin(VT * 5) * .2);
    } else {
      bm.body.scale.y = Math.max(.05, b.h / 78) * (1 + Math.sin(VT * 2) * .008); g.position.set(X(b.x) + sh, 0, 0);
      const arm = b.state === 'stele' ? b.arm : (b.state === 'dazed' ? 0 : b.arm);
      bm.arms[0].rotation.z = bm.arms[1].rotation.z = -arm * 2.9 - (b.state === 'dazed' ? .5 : 0);
      const on = b.state !== 'dazed'; bm.eyes.forEach(x => { x.material.emissiveIntensity = on ? 1.1 + Math.sin(VT * 5) * .25 + (tele ? .8 : 0) : .04; x.material.color.set(on ? '#e09523' : '#33302c'); });
      bm.core.rotation.z = Math.sin(VT * 2.2) * .12 + (b.state === 'dazed' ? .35 : 0); bm.core.rotation.x = Math.sin(VT * 1.7) * .08;   // sapling sway
      if (b.state === 'vtele' && b.warn) {   // HIGH / LOW lane marker under the mud ball's lane during the wind-up: a disc on the ground, a post up to the lane, a glowing cap at ball height
        const hi = b.warn === 'high', k = use(hi ? 'laneHi' : 'laneLo', () => { const gr = new THREE.Group(), c = hi ? '#5ad1ff' : '#ff9a3a', ly = Y(hi ? GY - 46 : GY - 8);
          mk(gDisc, MB(c, .55), 0, .09, 0, 1.4, 1, 1.4, gr, true); mk(gBox, MB(c, .8), 0, ly / 2, 0, .12, ly, .12, gr, true); mk(gSph, MB(c, .95), 0, ly, 0, .45, .45, .45, gr, true); return gr; });
        k.position.set(X(b.x - 60), 0, 0); k.scale.setScalar(1 + Math.sin(VT * 14) * .08); }
      if (b.state === 'stele') { const q = 1 + Math.sin(VT * 14) * .15; v.mark.visible = true; v.mark.position.x = X(b.x); v.mark.scale.set(7 * q, 1, 2.4 * q); v.mark.disc.material.opacity = .35 + .25 * Math.sin(VT * 14); }
      if (b.state === 'dazed') wk(X(b.x), b.h * S + 1.5 + Math.sin(VT * 5) * .2);
    }
    bossIdle(bm, b, tele);                                                                                          // idle face/breathing (visual only)
    if (b.state === 'dying') { const f = Math.max(.01, 1 - b.t / 1.4); g.scale.setScalar(f); g.position.y -= (1 - f) * 2; g.rotation.z = (1 - f) * .8; if (Math.random() < .5) fxBurst(g.position.x, g.position.y + 2, 1, '#ffd37a', 5); } else g.scale.setScalar(1);
    if (G.splats && G.splats.length) { for (const q of G.splats) { fxMud(X(q.x), Y(q.y), 12, 5, '#5e3d25'); fxDust(X(q.x), Y(q.y), 4, 3, 1.5, '#7a5233'); } G.splats.length = 0; }
    for (const q of b.proj) {
      if (q.t === 'ball' && b.kind === 'boss1') { const m = use('ball', () => { const gr = new THREE.Group(); mk(gSph, M('#5e3d25'), 0, 0, 0, 1.1, 1.0, 1.0, gr); mk(gSph, M('#46301d'), .3, .25, .2, .5, .5, .5, gr); mk(gSph, M('#46301d'), -.25, -.2, .3, .4, .4, .4, gr); return gr; }); m.position.set(X(q.x), Y(q.y), 0); m.rotation.z = VT * 8; if (Math.random() < .6) emit(poolN, X(q.x), Y(q.y), .3, rnd(-.5, .5), rnd(0, 1), 0, .45, .45, '#4a3322', 2, .5, .4); }
      else if (q.t === 'puddle') { const m = use('pud', () => { const gr = new THREE.Group(); mk(gDisc, mats.mire, 0, .1, 0, 2.6, 1, 2.6, gr, true); mk(gRing, MB('#7a5a38', .8), 0, .14, 0, 2.7, 1, 2.7, gr, true); return gr; }); m.position.set(X(q.x), 0, 0); const k = 1 + Math.sin(VT * 18) * .06; m.scale.set(k, 1, k);
        if (!qprev.has(q)) { qprev.set(q, 1); fxMud(X(q.x), .3, 10, 6); } }
      else if (q.t === 'ball') {   // MUDTOTEM mud ball: a lumpy clod in the mud texture with a soft warm glow (round, from texGlow) so it reads in the dark, and a mud-drip trail
        const m = use('mball', () => { const gr = new THREE.Group(); mk(gSph, mudBallMat, 0, 0, 0, 1.3, 1.25, 1.3, gr); mk(gSph, mudBallMat, .38, .3, .25, .62, .55, .6, gr); mk(gSph, mudBallMat, -.34, -.28, .3, .5, .48, .5, gr); mk(gSph, M('#46301d'), .1, .5, .35, .34, .3, .3, gr);
          const h = new THREE.Mesh(gQuad, mudBallGlow); h.scale.set(2.6, 2.6, 1); h.position.z = -.4; h.renderOrder = 4; gr.add(h); gr.halo = h; return gr; });
        m.position.set(X(q.x), Y(q.y), 0); m.rotation.z = VT * 6; m.halo.quaternion.copy(camera.quaternion).premultiply(_q.copy(m.quaternion).invert());
        if (Math.random() < .6) emit(poolN, X(q.x) + .6, Y(q.y) + rnd(-.3, .3), .3, rnd(.5, 1.5), rnd(0, .8), 0, .45, .4, '#4a3322', 2, .5, .4); }
      else if (q.t === 'wave') { const m = use('wave', () => mk(gWave, M('#8a5a30'), 0, 0, 0, .9, 1.3, 3)); m.position.set(X(q.x), .65, 0); if (Math.random() < .7) fxDust(X(q.x), .1, 1, 1, 1.5, '#b49a6a'); }
      else if (q.t === 'bomb') {
        const m = use('bomb', () => { const gr = new THREE.Group(); mk(gIco, M('#9db66f', '', true), 0, 0, 0, 1.15, 1.15, 1.15, gr);   // spiky seed bomb (boss-2 sheet)
          for (let k = 0; k < 12; k++) { const v = new THREE.Vector3(Math.sin(k * 2.4) * Math.cos(k * 1.3), Math.cos(k * 2.4), Math.sin(k * 2.4) * Math.sin(k * 1.3)).normalize(); const c = mk(gCone, M('#6f8a3a'), v.x * .55, v.y * .55, v.z * .55, .14, .3, .14, gr, true); c.quaternion.setFromUnitVectors(_up0, v); }
          mk(gBox, MS('#ffb347', .4, 0, '#ff8a30'), 0, .62, 0, .22, .22, .22, gr, true); gr.boom = mk(gSph, MB('#ffb347', .6, true), 0, 0, 0, 1, 1, 1, gr, true); return gr; });
        m.position.set(X(q.x), Y(q.y) + .55, 0); m.boom.visible = q.st === 'boom'; if (q.st === 'boom') { const r = 4 * Math.min(1, q.tt / .12 + .3); m.boom.scale.set(r, r, r); if (!qprev.has(q)) { qprev.set(q, 1); fxBurst(X(q.x), Y(q.y) + .5, 22, '#ffb347', 9); addShake(.45); } }
        m.scale.setScalar(q.st === 'fuse' && Math.floor(VT * 12) % 2 ? 1.25 : 1);
        if (q.st === 'fuse' && Math.random() < .6) emit(poolA, X(q.x), Y(q.y) + 1.2, .3, rnd(-1, 1), rnd(1, 2.5), 0, .35, .3, '#ffd37a', 0, 1, -.4);
        if (q.st !== 'boom') { const k = use('bmark', () => mkMarkDisc()); k.position.set(X(q.x), .09, 0); k.scale.set(3.6, 1, 3.6); }
      }
    }
  }
  (G.burst || []).forEach(q => { const m = use('gem', () => { const gm = buildGem(0); const gr = new THREE.Group(); gr.add(gm.core); gm.core.scale.set(.6, .9, .5); gr.core = gm.core; return gr; }); m.core.material = MS(P.gem[q.kind], .2, .25, P.gem[q.kind], true); m.core.material.emissiveIntensity = .5; m.position.set(X(q.x), Y(q.y), 0); m.rotation.y = VT * 4; if (Math.random() < .25) emit(poolA, X(q.x), Y(q.y), .3, rnd(-1, 1), rnd(-1, 1), 0, .4, .35, '#fff4c8', 0, 2, -.3); });
  for (const key in v.pools) for (let i = used[key] || 0; i < v.pools[key].length; i++) v.pools[key][i].visible = false;
}
const mudBallMat = artify(reg(new THREE.MeshLambertMaterial({ color: '#7a5233' })), 'mball', [{ t: 'mud', sc: .9, st: .7 }], true);   // object space: the mud turns with the ball
const mudBallGlow = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#c8803e', transparent: true, opacity: .4, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
const gWave = (() => { const g = new THREE.CapsuleGeometry(.5, 1, 4, 8); g.rotateX(Math.PI / 2); return g; })();
function mkMarkDisc() { const m = new THREE.Group(); mk(gDisc, MB('#d9534f', .5), 0, .09, 0, 1, 1, 1, m, true); mk(gRing, MB('#ff7a5a', .9), 0, .1, 0, 1, 1, 1, m, true); return m; }

/* ---- camera (follows the hero; small shake on boss slams and hits) ---- */
const cam = { x: 16, y: 3.2, dir: 1, lastRoom: -1, lastSeed: '' };
function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QL().pr)); renderer.setSize(w, h, false);
  const asp = w / h; camera.aspect = asp;
  camera.fov = Math.min(80, 2 * Math.atan(Math.tan(25 * Math.PI / 180) * Math.max(1, 1.75 / asp)) * 180 / Math.PI);   // keep ~the same width on tall phone screens
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
let photoCam = null;   // screenshot hook: {d, h, yaw} frames the hero close up (visual only, never set in play)
function setCamera(dt) {
  if (photoCam && G.p) { const hx = X(G.p.x), hy = Y(G.p.y), d = photoCam.d || 7, a = photoCam.yaw || 0; camera.position.set(hx + Math.sin(a) * d, hy + (photoCam.h || 1.6) + 1, Math.cos(a) * d); camera.lookAt(hx, hy + (photoCam.h || 1.6), 0); return; }
  const p = G.p, k = 1 - Math.exp(-dt * 4.5); let px_, py_, pz_, lx, ly, lz;
  if (G.state === 'title' || !p) {
    const a = VT * .35; cam.x = 16 + Math.sin(a) * 5;
    px_ = cam.x + Math.sin(a * .7) * 3; py_ = 8.5; pz_ = 21; lx = cam.x; ly = 4.2; lz = 0;
  } else {
    const hh = Math.max(-1.5, Math.min(4, Y(p.y)));
    cam.dir += (p.face - cam.dir) * (1 - Math.exp(-dt * 2.5));
    const tx = Math.max(11.5, Math.min(20.5, X(p.x) + cam.dir * 2.2));
    cam.x += (tx - cam.x) * k; cam.y += (3.2 + hh * .3 - cam.y) * k;
    px_ = cam.x - cam.dir * 2.4; py_ = cam.y + 5.6; pz_ = 21; lx = cam.x + cam.dir * .5; ly = cam.y + 1.6; lz = 0;
    cam.cut = hold(cam.cut || 0, G.state === 'title' ? 0 : G.freeze === 'cut' ? 1 : G.freeze === 't' ? .45 : 0, dt, 2.2); const ck = cam.cut;   // the cutscene (and the T pause) pull the camera in on mudbot's chest
    if (ck > .001) { const big = G.cut && G.cut.t > CUT.DRINK - .5 && G.freeze === 'cut' ? 1 : 0; cam.cutB = hold(cam.cutB || 0, big, dt, 2); const hx = X(p.x) + p.face * (1.3 + cam.cutB * 1.2), hy = Math.max(0, Y(p.y)) + 1.5 + cam.cutB * 1.3;
      px_ += (hx - .8 * p.face - px_) * ck; py_ += (hy + 2.2 + cam.cutB * .8 - py_) * ck; pz_ += (12.5 + cam.cutB * 3 - pz_) * ck; lx += (hx - lx) * ck; ly += (hy - ly) * ck; }
  }
  shake = Math.max(0, shake - dt * 2.4);
  const sa = shake * shake * .5, sx = (Math.sin(VT * 71) + Math.sin(VT * 53 + 1)) * .5 * sa, sy = (Math.sin(VT * 63 + 2) + Math.sin(VT * 47)) * .5 * sa;
  camera.position.set(px_ + sx, py_ + sy, pz_); camera.lookAt(lx + sx * .6, ly + sy * .6, lz);
}

/* ---- shared score board hooks (scores.js). Wraps the run functions so no logic line changes; the game never waits on it ---- */
window.mudScoresGame = { state: () => G.state, seed: () => G.seed };
{ const SC = (...a) => { try { if (window.mudScores) window.mudScores.on(...a); } catch (e) {} };
  const _start = startRun, _lose = loseLife, _boss = bossDefeat, _end = endRun;
  startRun = function () { _start.apply(this, arguments); SC('start'); };
  loseLife = function (why) { const n = G.lives; _lose.apply(this, arguments); if (G.lives < n) SC('death', why, G.rs && G.rs.boss && G.rs.boss.kind); };
  bossDefeat = function (b) { _boss.apply(this, arguments); SC('kill', b && b.kind); };
  endRun = function (result) { _end.apply(this, arguments); SC('end', { result, score: G.score, seed: G.seed, gems: G.got.size }); }; }

/* ---- HUD / panels (DOM, system font only) ---- */
const $ = id => document.getElementById(id);
const hudEl = $('hud'), panel = $('panel'), msgEl = $('msg'), bossHud = $('bosshud'), bossFill = $('bfill'), qbtn = $('qbtn');
const cache = {};
const setTxt = (id, s) => { if (cache[id] !== s) { cache[id] = s; $(id).textContent = s; } };
const setHTML = (id, s) => { if (cache[id] !== s) { cache[id] = s; $(id).innerHTML = s; } };
const ICON = n => { const src = n === 'gem' ? 'art/icons/gem.png' : n === 'heart' ? 'art/icons/heart.png' : ''; return src ? '<img class="ic" src="' + src + '" alt="">' : ''; }, sysb = $('sysb');
const BADGE = '<img id="badge" src="art/badge.png" alt="Made with mudmode">';
const portraitMQ = matchMedia('(orientation: portrait)');
function drawUI() {
  const st = G.state; wsRender();
  document.body.classList.toggle('ingame', st === 'play' || st === 'paused');
  document.body.classList.toggle('perch', st === 'play' && !G.freeze && !!(G.rs && G.rs.perch && G.cf && G.cf.still >= TUNE.CROC.FISH.STILL));
  if (document.body.classList.contains('touch')) {   // a sideways game on an upright phone: pause under the turn-your-phone card, resume when turned back
    if (portraitMQ.matches && st === 'play' && !G.freeze) { G.state = 'paused'; G.rotPause = true; }
    else if (G.rotPause && !portraitMQ.matches) { G.rotPause = false; if (G.state === 'paused') G.state = 'play'; } }
  hudEl.style.display = (st === 'play' || st === 'paused' || st === 'end') ? 'flex' : 'none';
  const m = Math.floor(G.timeLeft / 60), s = Math.floor(G.timeLeft % 60);
  setTxt('h-time', 'TIME ' + m + ':' + String(s).padStart(2, '0')); $('h-time').className = G.timeLeft < 30 ? 'warn' : '';
  setTxt('h-mult', (superBonus(G.runT) ? 'SUPER x' + SPD.SUPER : 'x' + speedMult(G.runT).toFixed(1)));   // speed multiplier (on the run clock)
  setHTML('h-gems', ICON('gem') + G.got.size + '/' + TREASURES);
  setTxt('h-junk', st === 'title' || !G.bag ? '' : 'JUNK ' + G.bag.length + '/' + WORK.BAG_MAX + (G.gear && G.gear.built.plate ? ' PLATE ' + G.gear.plate : ''));   // junk bag (and the shield plate's free hits left)
  const nl = Math.max(0, G.lives), chip = G.p && nl > 0 ? Math.max(0, Math.min(1, G.p.chip)) : 0, full = chip > 0 ? nl - 1 : nl;   // a hand block takes part of the current heart
  setHTML('h-lives', ICON('heart').repeat(full) + (chip > 0 ? '<span class="hc">' + ICON('heart').replace('"ic"', '"ic lost"') + ICON('heart').replace('"ic"', '"ic hf" style="clip-path:inset(0 ' + Math.round(chip * 100) + '% 0 0)"') + '</span>' : '') + ICON('heart').replace('"ic"', '"ic lost"').repeat(Math.max(0, LIVES - nl)));
  $('h-lives').title = (nl - chip) + ' lives';
  { const sp = G.p ? Math.max(0, G.p.stam) : STAM_MAX, pct = 100 * sp / STAM_MAX, has = !G.p || G.p.shield, sk = Math.round(pct) + '|' + has;   // stamina meter next to the hearts
    if (cache.stam !== sk) { cache.stam = sk; $('h-sfill').style.width = pct + '%'; $('h-stam').className = (pct <= 0 ? 'out' : '') + (has ? '' : ' noshield');
      $('h-stam').title = 'Stamina ' + Math.round(pct) + '%' + (has ? '' : ' (shield on the ground: walk over it)'); } }
  { const p = G.p, h = p && p.hook, out = !!h, zc = p && !h && p.hookCd > 0 ? p.hookCd / TUNE.HOOK_COOLDOWN : 0, rdy = !h ? Math.round(100 * (1 - zc)) : h.ph === 'back' && h.d0 ? Math.round(100 * Math.max(0, 1 - Math.hypot(h.hx - p.x, h.hy - p.y + 14) / h.d0)) : 0, hk = rdy + '|' + out, cd = out || zc > 0;   // hook meter: empty while it is out, fills as it reels back in
    if (cache.hook !== hk) { cache.hook = hk; $('h-hfill').style.width = rdy + '%'; $('h-hook').className = cd > 0 ? 'cd' : ''; $('h-hook').title = out ? 'Hook out (reeling back in)' : zc > 0 ? 'Hook charging (after a zip)' : 'Hook ready'; tbEls.hook.style.setProperty('--cd', (100 - rdy) + '%'); } }
  { const p = G.p, s = G.sup, rdy = st === 'play' && superReady(p), on = s.on, pm = on ? Math.round(100 * s.meter / supMax()) : 0, nr = s.nrT > 0 && !on, sk = rdy + '|' + on + '|' + pm + '|' + nr + '|' + Math.ceil(s.cd || 0);   // super: ready cue, power-up meter, 'not ready' cue
    if (cache.sup !== sk) { cache.sup = sk; const el = $('h-sup'), tch = document.body.classList.contains('touch'); $('h-pfill').style.width = pm + '%';
      el.className = on ? 'on' + (pm <= 25 ? ' low' : '') : rdy ? 'rdy' : nr ? 'nr' : '';
      $('h-slab').textContent = on ? 'BUDDY' : rdy ? (tch ? 'SUPER!' : 'SUPER [Q]') : nr ? 'NOT READY' : '';
      el.title = on ? 'Super buddy power ' + pm + '%' : rdy ? 'Super ready' : 'Super: recharging (' + Math.ceil(s.cd || 0) + ' s)';
      tbEls.super.classList.toggle('rdy', rdy); tbEls.super.classList.toggle('nr', nr); tbEls.super.classList.toggle('sup', on); tbEls.super.style.setProperty('--pm', pm + '%'); } }
  syncTouchDim(st);
  sysb.style.display = (st === 'play' || st === 'paused') ? 'flex' : 'none'; setTxt('h-room', G.camp ? 'CAMP' : 'ROOM ' + (G.room + 1) + '/' + ROOMS); setTxt('h-score', String(G.score));
  const bb = G.rs && G.rs.boss, showBar = bb && !bb.dead && (st === 'play' || st === 'paused');
  bossHud.style.display = showBar ? 'block' : 'none';
  if (showBar) { setTxt('bname', bb.name + '   ' + '\u25C6'.repeat(Math.max(0, Math.ceil(bb.hp - 1e-6))) + '\u25C7'.repeat(Math.max(0, bb.max - Math.ceil(bb.hp - 1e-6)))); bossFill.style.width = (100 * Math.max(0, bb.hp) / bb.max) + '%'; }
  const nb = nextBoss(), nr = nb - G.room;
  setTxt('h-next', (bb && !bb.dead) ? 'BOSS FIGHT' : nb < 0 ? '' : 'NEXT BOSS IN ' + nr + (nr === 1 ? ' ROOM' : ' ROOMS'));
  const finalDown = st === 'play' && G.winT > 0;
  msgEl.style.display = finalDown || (G.msgT > 0 && st === 'play') ? 'block' : (st === 'paused' ? 'block' : 'none');
  setTxt('msg', st === 'paused' ? 'PAUSED' : finalDown ? 'FINAL BOSS DOWN' : G.msg);
  let key = st + '|' + G.seed + '|' + G.best + '|' + G.result + '|' + G.score + '|' + G.got.size + '|' + blockMode + '|' + Qi + '|' + tugMode;
  if (st === 'title' || st === 'end') {
    panel.style.display = st === 'title' ? 'flex' : 'block';   // title: a column, so the controls list can scroll inside it on small windows
    if (cache.panel !== key) { cache.panel = key;
      panel.className = st === 'title' ? 'title' : 'endp ' + (G.result === 'win' ? 'win' : 'over');
      const tch = document.body.classList.contains('touch');
      panel.innerHTML = st === 'title'
        ? '<h1>MUDPITY</h1><div class="sub">(early access)</div>' +
          '<p class="goal">Beat the 3 bosses (rooms 4, 8 and 12) before the 3:00 timer ends</p>' +
          '<p class="goal">Go fast: SUPER BONUS x' + SPD.SUPER + ' points for the first ' + clockTxt(SPD.SUPER_T) + ', then x' + SPD.START.toFixed(1) + ' down to x' + SPD.END.toFixed(1) + ' at ' + clockTxt(SPD.FADE_T) + '</p>' +
          '<div class="how">' +
            '<b>Move</b><span>' + (tch ? 'left / right buttons' : 'Arrows or A D') + '</span>' +
            '<b>Jump</b><span>' + (tch ? 'jump button' : 'Space, W or Up') + '</span>' +
            '<b>Vines</b><span>hit one mid-air to grab it; jump to let go</span>' +
            '<b>Bosses</b><span>weak spots glow: jump on them, or kick with a vine release</span>' +
            '<b>Kick</b><span>' + (tch ? 'kick button: kick any mob' : 'Ctrl or middle click. Hold S or Down + kick = kick down') + '</span>' +
            '<b>Hook</b><span>' + (tch ? 'hook button' : 'left click') + ': tap to zip to a wall or ledge, hold to swing on the rope (let go to fly on). Hook loot or a mob to pull it to you. Free: fire again once he has reeled it back in</span>' +
            '<b>Pits</b><span>lava, fast water, biters, tentacles (mash jump or kick). Stand on croc heads, not in mouths</span>' +
            '<b>Workshop</b><span>junk you find (and junk you fish up) goes in one bag (' + WORK.BAG_MAX + ' max). The caravan before the first boss opens a cardboard workshop: ' + (tch ? 'tap WORKSHOP at its flap, tap junk then a slot (or drag it), TAPE IT' : 'F at its flap, click junk then a slot (or drag it), Space tapes it') + '. Gear lasts the whole run</span>' +
            '<b>Crocs</b><span>stand on a croc head and it can\'t bite. Swing over one and it lunges. Stand still on a head: ' + (tch ? 'fish button' : 'F') + ' to fish</span>' +
            '<b>Flyers</b><span>dive and drop things. Kick or stomp them. Glow = tougher. Camp up high and they come</span>' +
            '<b>Block</b><span>' + (tch ? 'shield button' : 'Right click, S, Down or E') + ': swing the shield off your back to stop logs, mud and boss hits. Each block costs stamina (bigger hits cost more) and it refills slowly. Out of stamina = the shield drops: walk over it to pick it up. No shield: block with your hands (' + Math.round((1 - TUNE.HAND_BLOCK_DAMAGE) * 100) + '% less damage). Unblocked hits cost a heart</span>' +
            '<b>Super</b><span>' + (tch ? 'super button' : 'Q') + ': buddy grows huge and fights for you. He takes the hits meant for you until his power meter runs out, then shrinks back. Ready again ' + TUNE.SUPER.RECHARGE + ' s later. Starting it plays a little scene (click buddy to hurry him up)</span>' +
            (tch ? '' : '<b>Ride</b><span>R next to buddy: he climbs into your glass dome and rides along (he looks around on his own). R again: he hops out</span>') +
            '<b>T mode</b><span>' + (tch ? 'T button: everything freezes and buddy gets comfy in your chest. Drag an enemy a little (it complains and stays there). Tap the card to play the mini game. A win earns a cookie, once per room. T again: back to play' : 'T: everything freezes and buddy gets comfy in your chest. Drag an enemy a little with the mouse (it complains and stays there). Mini games vs buddy: Z (Z X C = rock paper scissors); 2 players: P2 uses , (, . /). 2: solo / 2 players, G: another game. A win by you (P1) earns a cookie: once per room. T again: back to play') + '</span>' +
          '</div>' +
          '<div class="setb" id="set-block">Block button: <b' + (blockMode === 'press' ? ' class="sel"' : '') + '>PRESS</b> / <b' + (blockMode === 'hold' ? ' class="sel"' : '') + '>HOLD</b> &nbsp;<small>' + (tch ? 'tap here to change' : '[B] or click to change') + '</small></div>' +
          '<div class="setb" id="set-tug">Tug of war: ' + TUG_MODES.map(k => '<b' + (tugMode === k ? ' class="sel"' : '') + '>' + k.toUpperCase() + '</b>').join(' / ') + ' &nbsp;<small>' + (tch ? 'tap here to change' : 'click to change') + '</small></div>' +
          '<div class="setb" id="set-quality">Graphics: <b' + (Qi === 0 ? ' class="sel"' : '') + '>LOW</b> / <b' + (Qi === 1 ? ' class="sel"' : '') + '>HIGH</b> &nbsp;<small>' + (tch ? 'tap here to change' : 'click to change') + '</small></div>' +
          '<div class="seedbox">Seed <b>' + esc(G.seed) + '</b> &nbsp; best <b>' + G.best + '</b><br><small>' + (tch ? 'add ?seed=name to the address for a set world' : '[N] random seed &nbsp; [D] daily seed &nbsp; or add ?seed=name to the address') + '</small></div>' +
          '<div class="go">' + (tch ? 'TAP TO START' : 'PRESS ENTER / TAP TO START') + '</div>' + BADGE
        : '<div class="top"><h1>' + (G.result === 'win' ? 'ALL BOSSES DOWN!' : G.result === 'time' ? 'TIME UP' : 'OUT OF LIVES') + '</h1>' +
          '<p>Score ' + G.score + ' &nbsp; time ' + clockTxt(G.runT) + ' &nbsp; gems ' + G.got.size + '/' + TREASURES + ' &nbsp; best ' + G.best + ' &nbsp; seed ' + esc(G.seed) + '</p>' +
          '<div class="go">ENTER / TAP: play again &nbsp; [H] title &nbsp; [N] new seed</div></div>' +
          '<img class="ib" id="e-restart" src="art/icons/restart.png" alt="Play again" title="Play again (Enter)"><img class="ib" id="e-home" src="art/icons/home.png" alt="Title" title="Back to the title (H)">' + BADGE;
    }
  } else panel.style.display = 'none';
}
/* touch buttons dim when their action can't do anything right now (menus, pause, falling, staggered by a blocked hit, between lives) */
const tbEls = { left: $('bl'), right: $('br'), jump: $('bj'), block: $('bk'), hook: $('bh'), super: $('bq') };
function syncTouchDim(st) {
  const p = G.p, live = st === 'play' && p && p.dead <= 0, free = live && p.react <= 0;
  const tg = tugOn(), on = { left: !!free || tg, right: !!free || tg, jump: (st === 'title' || st === 'end') || tg || !!(free && (p.onGround || p.coyote > 0 || p.vine)), block: !!(live && !p.vine), hook: tg || !!(free && !p.vine && !p.hook && !(p.hookCd > 0)), super: !!(st === 'play' && superReady(p)) };
  for (const k in tbEls) { const d = !on[k], ck = 'dim' + k; if (cache[ck] !== d) { cache[ck] = d; tbEls[k].classList.toggle('dim', d); } }
  const bo = st === 'play' && wantBlock(); if (cache.bkon !== bo) { cache.bkon = bo; tbEls.block.classList.toggle('on', bo); }   // lit while the block is up (press mode stays lit)
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---- quality toggle (title settings menu or the small button; not on a key, Q is kept free for the super move): LOW = no shadow maps, fewer instances, lower pixel ratio ---- */
function applyQuality() {
  const q = QL();
  if (renderer) { renderer.shadowMap.enabled = q.shadows; sun.castShadow = q.shadows; allMats.forEach(m => { m.needsUpdate = true; }); resize(); }
  qbtn.textContent = 'QUALITY: ' + q.name; qbtn.className = q.shadows ? 'hi' : 'lo';
  pl.shadow.visible = true; pl.shadow.material.opacity = q.shadows ? .18 : .45; forceRebuild = true; buildBackdrop();
}
function setQuality(i, save) { Qi = i; applyQuality(); if (save) { try { localStorage.setItem('jr3d-quality', QL().name.toLowerCase()); } catch (e) {} } }
qbtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setQuality(1 - Qi, true); });

/* ---- per-frame scene sync ---- */
let fps = 0, fpsN = 0, fpsT = 0;
const hold = (cur, tgt, dt, rate) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
const HS = 1.08;   // hero display scale (visual only; the hitbox is unchanged)
/* shield: on his back -> swings round his right side to the front while blocking -> on the ground when dropped */
const SH_R = .8;   // distance from the hero's middle to the shield face
function syncShield(p, dt) {
  const sh = shield, k = Math.max(0, Math.min(1, p.stam / STAM_MAX)), glow = TUNE.GLOW_MIN + (TUNE.GLOW_MAX - TUNE.GLOW_MIN) * k;
  if (G.blocks !== pl.lastBlocks) { if (pl.lastBlocks !== undefined && G.blocks > pl.lastBlocks && G.lastBlock && !G.lastBlock.hand) { pl.blkFlash = .25; const w = sh.halo.getWorldPosition(_vA); fxSpark(w.x, w.y, 8, '#dff6ff', 5); } pl.lastBlocks = G.blocks; }
  pl.blkFlash = Math.max(0, (pl.blkFlash || 0) - dt);
  if (pl.hadShield && !p.shield) { const w = sh.root.getWorldPosition(_vA); fxBurst(w.x, w.y, 14, '#9fe3ff', 6); addShake(.25); }
  pl.hadShield = p.shield;
  sh.glowM.emissiveIntensity = .05 + 1.1 * glow + pl.blkFlash * 2; sh.haloM.opacity = Math.min(1, glow + pl.blkFlash * 2);
  const hs = 1.62 + .14 * glow + Math.sin(VT * 6) * .03 * glow; sh.halo.scale.set(hs, hs, 1);
  if (p.shield) {
    if (sh.root.parent !== pl.bod) { pl.bod.add(sh.root); pl.shE = 0; }
    sh.root.visible = true;
    const tgt = p.blocking && p.dead <= 0 ? 1 : 0;
    pl.shE = tgt > (pl.shE || 0) ? Math.min(1, (pl.shE || 0) + dt / TUNE.RAISE_TIME) : Math.max(0, (pl.shE || 0) - dt / TUNE.LOWER_TIME);
    const e = pl.shE * pl.shE * (3 - 2 * pl.shE), th = Math.PI * (1 - e);           // th: pi = on his back, pi/2 = his right side, 0 = in front
    sh.root.position.set(Math.cos(th) * SH_R, 1.28 + Math.sin(th) * .12, Math.sin(th) * SH_R);
    sh.root.rotation.set(0, -th, (1 - e) * .12); sh.root.scale.setScalar(1);
  } else {
    const d = G.drop, here = d && d.room === G.room && G.state !== 'title';
    if (sh.root.parent !== scene) scene.add(sh.root);
    sh.root.visible = !!here;
    if (here) { sh.root.position.set(X(d.x), .1 + Math.max(0, Math.sin(VT * 3)) * .04, .2); sh.root.rotation.set(0, .3, Math.PI / 2); sh.root.scale.setScalar(HS); }
  }
}
/* ground item view (unused now: the stamina refill item was taken out): blue canister with steel caps, a bright band and a soft additive glow; bobs and spins on the ground.
   Meshes are made on first need and reused (3 draw calls + the glow card per item on screen). */
const gCan = new THREE.CylinderGeometry(.2, .2, .55, 12), gCanCap = new THREE.CylinderGeometry(.13, .15, .1, 10);
const canM = reg(new THREE.MeshStandardMaterial({ color: '#2a6fd6', emissive: '#3fa9ff', emissiveIntensity: .8, roughness: .35, metalness: .4 }));
const canCapM = reg(new THREE.MeshStandardMaterial({ color: '#c9d3dc', roughness: .4, metalness: .8 }));
const canBandM = reg(new THREE.MeshBasicMaterial({ color: '#bff3ff' }));
const canGlowM = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#59c8ff', transparent: true, opacity: .7, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
const itemViews = [];
function buildStamItem() { const g = new THREE.Group();
  mk(gCan, canM, 0, .32, 0, 1, 1, 1, g); mk(gCanCap, canCapM, 0, .64, 0, 1, 1, 1, g); mk(gCanCap, canCapM, 0, .0, 0, 1.2, 1, 1.2, g);
  mk(gCan, canBandM, 0, .32, 0, 1.05, .16, 1.05, g, true);
  const gl = new THREE.Mesh(gQuad, canGlowM); gl.scale.set(1.6, 1.6, 1); gl.position.set(0, .34, -.25); gl.renderOrder = 4; g.add(gl); g.userData.glow = gl;
  g.visible = false; scene.add(g); return g; }
function syncItems() {
  const list = G.state === 'title' ? [] : (G.items || []).filter(it => it.room === G.room);
  while (itemViews.length < list.length) itemViews.push(buildStamItem());
  canGlowM.opacity = .5 + .3 * Math.sin(VT * 5); canM.emissiveIntensity = .6 + .4 * Math.sin(VT * 5);
  itemViews.forEach((v, i) => { const it = list[i]; v.visible = !!it; if (!it) return;
    v.position.set(X(it.x), .08 + (1 + Math.sin(VT * 3 + i)) * .05, .2); v.rotation.y = VT * 1.6; v.userData.glow.rotation.y = -v.rotation.y; v.scale.setScalar(HS); });
}
/* flyer views, built in code: bat = dark fuzzy body, big ears, red eyes, leathery flapping wings; wasp = striped yellow body,
   stinger, fast glassy wings; drone = boxy junk drone with four spinning rotors, a red eye and a junk bundle under it (1.4x size).
   Rank 2 / 3 = an amber / red glow behind it (rank 3 a bit bigger too). Shakes during the tell, nose down in a dive, belly up
   when stunned. Pooled per kind, made on first need. Drops: small blobs (bat mud / green wasp spit / grey drone bolt). */
const flyGlowM = [null,
  reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffb040', transparent: true, opacity: .55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })),
  reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#ff3030', transparent: true, opacity: .75, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))];
const glassWingM = reg(new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
const batWingM = reg(new THREE.MeshLambertMaterial({ color: '#3a2a33', side: THREE.DoubleSide }));
function flyWings(g, mat, x, y, len, wid, h) { for (const s of [1, -1]) { const pv = new THREE.Group(); pv.position.set(x, y, s * .1); g.add(pv); mk(gBox, mat, 0, 0, s * len / 2, wid, .02, len, pv, true); h.wings.push(pv); } }
function flyGlow(g, h) { const gl = new THREE.Mesh(gQuad, flyGlowM[1]); gl.scale.set(1.7, 1.7, 1); gl.position.set(0, 0, -.35); gl.renderOrder = 4; gl.visible = false; g.add(gl); h.glow = gl; }
function buildBat() { const root = new THREE.Group(), h = { root, wings: [], rotors: [] }, fur = M('#4a3540');
  mk(gSph, fur, 0, 0, 0, .5, .42, .4, root); mk(gSph, fur, .24, .08, 0, .3, .28, .28, root);
  for (const s of [1, -1]) { mk(gCone, M('#3a2a33'), .22, .27, s * .08, .1, .18, .08, root, true); mk(gSph, M('#ff5040', '#ff2010'), .37, .12, s * .07, .06, .06, .06, root, true); }
  flyWings(root, batWingM, 0, .05, .75, .42, h); flyGlow(root, h); root.visible = false; scene.add(root); return h; }
function buildWasp() { const root = new THREE.Group(), h = { root, wings: [], rotors: [] }, yel = M('#f2c014'), blk = M('#1d1a14');
  mk(gSph, yel, -.2, 0, 0, .5, .32, .32, root); mk(gSph, blk, -.1, 0, 0, .1, .335, .335, root, true); mk(gSph, blk, -.3, 0, 0, .1, .3, .3, root, true);
  mk(gSph, blk, .1, .02, 0, .24, .22, .22, root); mk(gSph, yel, .28, .04, 0, .18, .18, .18, root);
  for (const s of [1, -1]) mk(gSph, blk, .34, .07, s * .06, .07, .08, .06, root, true);
  const st = mk(gCone, blk, -.5, -.02, 0, .08, .18, .08, root, true); st.rotation.z = Math.PI / 2;
  flyWings(root, glassWingM, .08, .14, .5, .2, h); flyGlow(root, h); root.visible = false; scene.add(root); return h; }
function buildDrone() { const root = new THREE.Group(), h = { root, wings: [], rotors: [] }, steel = MS('#7d8790', .5, .6), dark = M('#3c4248');
  mk(gBox, steel, 0, 0, 0, .8, .28, .55, root); mk(gHalf, MS('#5a636b', .5, .6), 0, .14, 0, .45, .3, .4, root);
  mk(gSph, M('#ff3020', '#ff2010'), .4, 0, 0, .13, .13, .13, root, true); mk(gBox, M('#c78a2a'), 0, -.24, 0, .2, .16, .2, root);
  for (const sx of [1, -1]) for (const sz of [1, -1]) { mk(gBox, dark, sx * .42, .12, sz * .3, .3, .04, .04, root, true);
    const rg = new THREE.Group(); rg.position.set(sx * .55, .2, sz * .38); root.add(rg); mk(gCyl, dark, 0, 0, 0, .08, .06, .08, rg, true); mk(gBox, M('#22272b'), 0, .03, 0, .5, .02, .06, rg, true); h.rotors.push(rg); }
  flyGlow(root, h); root.visible = false; scene.add(root); return h; }
const FLY_BUILD = { bat: buildBat, wasp: buildWasp, drone: buildDrone }, flyViews = { bat: [], wasp: [], drone: [] };
const dropMats = { bat: M('#5a3d24'), wasp: M('#9be36a', '#3a7a20'), drone: MS('#9aa3ab', .4, .8) }, dropViews = [];
function syncFlyers() {
  const rs = G.rs, on = G.state !== 'title' && rs && rs.flyers, list = on ? rs.flyers.filter(f => f.st !== 'dead') : [], used = { bat: 0, wasp: 0, drone: 0 };
  for (const f of list) { const pool = flyViews[f.kind]; let v = pool[used[f.kind]++]; if (!v) { v = FLY_BUILD[f.kind](); pool.push(v); }
    const r = v.root, sh = f.st === 'tell' ? Math.sin(VT * 60) * .08 : 0; r.visible = true;
    r.position.set(X(f.x) + sh, Y(f.y), 0); r.scale.setScalar(HS * (f.big ? 1.4 : 1) * (f.rank === 3 ? 1.15 : 1));
    r.rotation.set(0, f.d > 0 ? 0 : Math.PI, f.st === 'stun' ? 2.6 : f.st === 'dive' ? -.5 : 0);
    const fl = f.st === 'stun' ? Math.sin(VT * 6) * .3 : Math.sin(VT * (f.kind === 'wasp' ? 55 : 14) + f.ph);
    v.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * (.3 + fl * .7); }); v.rotors.forEach(g => { g.rotation.y = VT * 40; });
    v.glow.visible = f.rank > 1; if (f.rank > 1) { v.glow.material = flyGlowM[f.rank - 1]; v.glow.rotation.y = -r.rotation.y; } }
  for (const k in flyViews) flyViews[k].forEach((v, i) => { if (i >= used[k]) v.root.visible = false; });
  const ds = on && rs.fdrops ? rs.fdrops : [];
  while (dropViews.length < ds.length) dropViews.push(mk(gSph, dropMats.bat, 0, 0, 0, .22, .3, .22, scene, true));
  dropViews.forEach((m, i) => { const d = ds[i]; m.visible = !!d; if (!d) return; m.material = dropMats[d.kind]; m.position.set(X(d.x), Y(d.y), 0); });
}
/* hook charge glow: after a zip a soft glow at his hook hand brightens as the cooldown charges, flashes when ready, then fades */
const hookGlowM = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
const hookGlow = new THREE.Mesh(gQuad, hookGlowM); hookGlow.renderOrder = 5; hookGlow.visible = false; scene.add(hookGlow);
const _hG = new THREE.Vector3(); let hookFlash = 0, hookCdPrev = 0;
function syncHookCharge(p, dt) {
  const cd = p && G.state !== 'title' && p.dead <= 0 ? p.hookCd : 0;
  if (hookCdPrev > 0 && cd <= 0) hookFlash = 1; hookCdPrev = cd; if (hookFlash > 0) hookFlash = Math.max(0, hookFlash - dt / .3);
  const k = cd > 0 ? 1 - cd / TUNE.HOOK_COOLDOWN : 0, op = cd > 0 ? .15 + .6 * k * k : hookFlash;
  hookGlow.visible = op > .01 && !!p; if (!hookGlow.visible) return;
  const hand = pl.armR.userData.hand; hand.updateWorldMatrix(true, false); hand.getWorldPosition(_hG); _hG.z = Math.min(_hG.z, .9) + .05;
  hookGlow.position.copy(_hG); const sc = cd > 0 ? .5 + .5 * k : .9 + .5 * (1 - hookFlash); hookGlow.scale.set(sc, sc, 1); hookGlowM.opacity = op;
  hookGlowM.color.set(cd > 0 ? '#ffd27a' : '#fff6d8');
}
/* hook view (very smooth and detailed): the rope is one tube mesh rebuilt each frame (sag and slack, a wave that runs out on the throw
   and back on the reel, a tension snap when it goes taut); the head is one merged mesh (shank, eye, tip, three barbs) that spins in flight.
   Bite sparks and dust use the shared particle pools. 2 draw calls in all, hidden when unused. Every value eases; the head is interpolated per frame. */
const RP_N = 24, RP_S = 6, RP_R = .045;
const gRope = (() => { const g = new THREE.BufferGeometry(), nv = (RP_N + 1) * RP_S, idx = [];
  for (let i = 0; i < RP_N; i++) for (let k = 0; k < RP_S; k++) { const a = i * RP_S + k, b = i * RP_S + (k + 1) % RP_S, c = a + RP_S, d = b + RP_S; idx.push(a, b, c, b, d, c); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage || 35048));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage || 35048)); g.setIndex(idx); return g; })();
const gHookHead = (() => { const parts = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const add = (geo, x, y, z, rx, rz, sx, sy, sz) => { e.set(rx || 0, 0, rz || 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1)); parts.push(geo.toNonIndexed().applyMatrix4(m4)); geo.dispose(); };
  add(new THREE.CylinderGeometry(.05, .06, .55, 6), 0, -.05, 0);                        // shank
  add(new THREE.TorusGeometry(.09, .03, 4, 8), 0, -.37, 0, 0, 0);                       // eye the rope ties to
  add(new THREE.ConeGeometry(.08, .22, 6), 0, .33, 0);                                  // tip
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);   // three barbs swept back
    const g = new THREE.ConeGeometry(.04, .3, 4); g.rotateX(Math.PI); g.rotateZ(-.7); g.rotateY(a); g.translate(c * .1, .12, -sn * .1); parts.push(g.toNonIndexed()); g.dispose(); }
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const p of parts) { p.computeVertexNormals(); P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; p.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return g; })();
const hookV = { rope: mk(gRope, M('#7a6242'), 0, 0, 0, 1, 1, 1, scene, true), head: mk(gHookHead, MS('#a4a49a', .35, .85), 0, 0, 0, 1, 1, 1, scene, true),
  ph: null, slack: 1, wA: 0, wPh: 0, wDir: 1, snap: 0, spin: 0, spinV: 0, sc: 0, impacts: 0, snaps: 0, maxSag: 0 };
hookV.rope.visible = hookV.head.visible = false; hookV.rope.frustumCulled = false;
const _hA = new THREE.Vector3(), _hB = new THREE.Vector3(), _hT = new THREE.Vector3(), _hQ = new THREE.Quaternion(), _hS = new THREE.Quaternion(), _hP = [];
for (let i = 0; i <= RP_N; i++) _hP.push(new THREE.Vector3());
function hookImpact(h, x, y) {   // the bite: sparks + a little dust (shared pools: no extra draw calls)
  hookV.impacts++;
  if (h.kind === 'boss') { fxSpark(x, y, 12, '#fff1c0', 4.5); return; }
  if (h.kind === 'mob') { fxSpark(x, y, 6, '#ffb35a', 3); fxDust(x, y - .2, 3, .8, .6, '#8a6a4a'); return; }
  if (h.kind === 'loot') { fxSpark(x, y, 5, '#bff6ff', 2.5); return; }
  fxSpark(x, y, 9, '#ffd690', 3.5); fxDust(x, y - .1, 5, 1, .8, h.kind === 'ceil' ? '#7d8f55' : '#a88a62'); addShake(.06);
}
function syncHook(p, dt) {
  const V = hookV, h = p && G.state !== 'title' && p.dead <= 0 ? p.hook : null;
  V.rope.visible = V.head.visible = !!h; if (!h) { V.ph = null; V.sc = 0; return; }
  // head, interpolated between the last two logic steps
  const al = Math.max(0, Math.min(1, acc / STEP)), hx = h.ox === undefined ? h.hx : h.ox + (h.hx - h.ox) * al, hy = h.oy === undefined ? h.hy : h.oy + (h.hy - h.oy) * al;
  const hand = pl.armR.userData.hand; hand.updateWorldMatrix(true, false); hand.getWorldPosition(_hA); _hA.z = Math.min(_hA.z, .9);
  _hB.set(X(hx), Y(hy), .25);
  // phase changes drive the one-shot moves
  if (V.ph !== h.ph) {
    if (h.ph === 'fly' && V.ph === null) { V.slack = .9; V.wA = 1; V.wDir = 1; V.spinV = 30; V.sc = .35; }
    if (V.ph === 'fly' && h.kind !== 'miss') hookImpact(h, _hB.x, _hB.y);
    if (h.ph === 'latch' || h.ph === 'drag' || h.ph === 'reel' || h.ph === 'swing' || h.ph === 'tug' || (h.ph === 'zip' && V.ph === 'fly') || h.ph === 'fpull' || h.ph === 'ride') { V.snap = 1; V.snaps++; }   // goes taut
    if (h.ph === 'back') { V.wA = Math.max(V.wA, .75); V.wDir = -1; V.spinV = -14; if (V.ph && V.ph !== 'fly') fxSpark(_hB.x, _hB.y, 3, '#e8e0c8', 1.6); }   // lets go with a clank
    V.ph = h.ph;
  }
  const taut = h.ph === 'swing' || h.ph === 'zip' || h.ph === 'drag' || h.ph === 'latch' || h.ph === 'reel' || h.ph === 'fpull' || h.ph === 'ride' || (h.ph === 'tug' && !h.slack);   // tug: slack while a robot falls off a lip
  V.slack = hold(V.slack, h.ph === 'fly' || h.slack ? .45 : h.ph === 'back' ? .6 : h.ph === 'reel' ? .12 : 0, dt, taut ? 14 : 6);
  V.wA = hold(V.wA, h.ph === 'back' ? .3 : 0, dt, 3.2); V.wPh += dt * 16 * V.wDir;
  V.snap *= Math.exp(-dt * 7);
  V.spinV = hold(V.spinV, h.ph === 'fly' ? 30 : h.ph === 'back' ? -10 : 0, dt, 5); V.spin += V.spinV * dt;
  V.sc = hold(V.sc, 1, dt, 18);
  // rope curve
  _hT.subVectors(_hB, _hA); const L = _hT.length(), sag = V.slack * Math.min(2.4, L * .22), wAmp = V.wA * Math.min(.45, .08 + L * .05), sAmp = V.snap * Math.min(.22, L * .03) * Math.sin(VT * 58);
  const ux = L > 1e-4 ? _hT.x / L : 1, uy = L > 1e-4 ? _hT.y / L : 0, px = -uy, py = ux;   // along / across the rope (screen plane)
  V.maxSag = Math.max(V.maxSag * .98, sag);
  for (let i = 0; i <= RP_N; i++) { const t = i / RP_N, env = Math.sin(Math.PI * t), w = wAmp * env * Math.sin(t * L * 1.7 - V.wPh) + sAmp * env;
    _hP[i].set(_hA.x + _hT.x * t + px * w, _hA.y + _hT.y * t + py * w - sag * env * env * (1.2 - .2 * env), _hA.z + _hT.z * t); }
  const pos = gRope.attributes.position.array, nor = gRope.attributes.normal.array;
  for (let i = 0; i <= RP_N; i++) { const a = _hP[Math.max(0, i - 1)], b = _hP[Math.min(RP_N, i + 1)]; let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, r = RP_R * (i === RP_N ? .7 : 1);
    for (let k = 0; k < RP_S; k++) { const th = k / RP_S * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), o = (i * RP_S + k) * 3, ex = c * nx, ey = c * ny, ez = sn;
      pos[o] = _hP[i].x + ex * r; pos[o + 1] = _hP[i].y + ey * r; pos[o + 2] = _hP[i].z + ez * r; nor[o] = ex; nor[o + 1] = ey; nor[o + 2] = ez; } }
  gRope.attributes.position.needsUpdate = gRope.attributes.normal.needsUpdate = true;
  // head: points along its flight, then along the rope end; spins in flight; eased (slerp), never snaps
  const e0 = _hP[RP_N - 2], dX = _hB.x - e0.x, dY = _hB.y - e0.y, dl = Math.hypot(dX, dY);
  if (dl > 1e-4) _vD.set(dX / dl, dY / dl, 0); else _vD.set(ux, uy, 0);
  if (h.ph === 'back') _vD.negate();   // it trails back to the hand barbs first
  _hQ.setFromUnitVectors(_up, _vD); _hS.setFromAxisAngle(_up, V.spin); _hQ.multiply(_hS);
  V.head.position.copy(_hB); V.head.quaternion.slerp(_hQ, h.ph === 'fly' && h.t < STEP * 2 ? 1 : 1 - Math.exp(-dt * 22)); V.head.scale.setScalar(V.sc);
}
function syncHero(room, p, dt) {
  const g = pl.root, bod = pl.bod;
  if (!p || G.state === 'title') { g.visible = false; pl.shadow.visible = false; pl.lastLives = -1; return; }
  g.visible = true; g.position.set(X(p.x), Y(p.y), 0);
  g.rotation.y = photoCam && photoCam.hy !== undefined ? photoCam.hy : hold(g.rotation.y, p.face > 0 ? -.62 : Math.PI + .62, dt, 16);   // 3/4 view: the face turns a little toward the camera
  const vine = !!p.vine, run = !G.freeze && p.onGround && Math.abs(p.vx) > 1, air = !p.onGround && !vine, ph = p.step * .45, spd = Math.min(1, Math.abs(p.vx) / 70);
  // events from state changes: take-off, landing, death, hit
  if (pl.wasGround && air && p.vy < 0) { fxDust(g.position.x, g.position.y, 4, 2.5, 1.2); pl.sq = -.3; }
  if (air) pl.vyMax = Math.max(pl.vyMax, p.vy);
  if (pl.wasAir && p.onGround && !vine) { const imp = Math.min(1, pl.vyMax / 190); fxDust(g.position.x, g.position.y, 5 + imp * 9, 3 + imp * 3, 1.5 + imp, '#c9b48a'); pl.sq = .18 + .4 * imp; if (imp > .5) addShake(.18 * imp); pl.vyMax = 0; }
  if (p.onGround || vine) pl.vyMax = 0;
  pl.wasAir = air; pl.wasGround = p.onGround && !vine;
  if (p.dead > 0 && !pl.wasDead) { fxBurst(g.position.x, g.position.y + 1.2, 18, '#d6a577', 7); fxDust(g.position.x, g.position.y + 1, 8, 4, 3, '#8d6544'); addShake(.5); }
  pl.wasDead = p.dead > 0;
  syncShield(p, dt); syncItems(); syncFlyers();
  if (pl.lastLives >= 0 && G.lives < pl.lastLives) { pl.hurtT = 1.1; if (p.dead <= 0) addShake(.4); }
  pl.lastLives = G.lives;
  if (p.inv > 0 && pl.lastInv <= 0 && p.dead <= 0) fxSpark(g.position.x, g.position.y + 1.6, 7, '#ffffff', 5);
  pl.lastInv = p.inv;
  pl.dustT -= dt; if (run && pl.dustT <= 0) { pl.dustT = .17; fxDust(g.position.x - p.face * .5, g.position.y, 1, 1.2, .5); }
  // squash & stretch spring (positive = squashed, negative = stretched)
  const tgt = air ? (p.vy < 0 ? -.2 : -.08) : 0; pl.sq = hold(pl.sq, tgt, dt, 14);
  bod.scale.set(1 + pl.sq * .55, 1 - pl.sq * .6, 1 + pl.sq * .55);
  // procedural poses, after the approved pose sheet: run (lean in, big strides, scowl), jump (one fist up, legs tucked),
  // vine (both arms up, legs kicking with the swing), hurt (slumped, sleepy lids, drooping leaf, smoke), idle (breathing, glances)
  if (p.dead > 0) pl.hurtT = Math.max(pl.hurtT, .3);
  pl.hurtT = Math.max(0, pl.hurtT - dt); const hurt = pl.hurtT > 0;
  let ll = 0, lr = 0, al = 0, ar = 0, sl = 0, sr = 0, lean = 0, bob = 0, hd = 0, tw = 0, lid = .13, slant = 0, ka = 0, kr = 0;
  if (hurt) { const w = Math.sin(VT * 7) * .06; ll = .25; lr = -.2; al = .35 + w; ar = .25 - w; sl = sr = .35; lean = .12; bob = -.06; hd = -.12; lid = .0; slant = -.18;
    pl.smokeT -= dt; if (pl.smokeT <= 0) { pl.smokeT = .12; fxDust(g.position.x + rnd(-.9, .9), g.position.y + 2.5, 1, .3, .9, '#bdb8ae'); } }
  else if (vine) { const vv = vineVel(p.vine, G.t) * (p.face > 0 ? 1 : -1); al = ar = 2.9; sl = sr = .28; ll = .35 + vv * .35; lr = -.15 + vv * .45; ka = -ll * .4; kr = -lr * .4; lean = -vv * .08; lid = .15; hd = .1; }
  else if (air) { const upw = p.vy < 0; ar = upw ? 3.0 : 2.5; al = upw ? .9 : 1.4; sr = .1; sl = upw ? .7 : .9; ll = upw ? 1.0 : .5; lr = upw ? -.35 : -.1; ka = -ll * .7; kr = upw ? .5 : .2; lean = upw ? -.12 : .05; lid = .22; hd = upw ? .1 : -.04; }
  else if (run) { const s = Math.sin(ph); ll = s * 1.05; lr = -s * 1.05; ka = -ll * .55 + Math.max(0, s) * .3; kr = -lr * .55 + Math.max(0, -s) * .3; al = -s * 1.1; ar = s * 1.1; sl = sr = .22;
    bob = Math.abs(Math.cos(ph)) * .13; lean = -.16 - .07 * spd; hd = .06 + Math.sin(ph * 2) * .03; tw = s * .14; lid = .07; slant = .3; }
  else { const br = Math.sin(VT * 2.4); al = br * .06; ar = -al; sl = sr = .12; bob = br * .02 + .02; tw = Math.sin(VT * .7) * .18 * (Math.sin(VT * .23) > .6 ? 1 : 0); }
  // block pose: the right arm reaches back for the shield, then both arms hold it out front; with no shield both hands come up
  if (p.blocking && !vine && p.dead <= 0) {
    if (p.shield) { if (pl.shE < .55) { ar = -1.35; sr = .35; } else { ar = 1.45; al = 1.1; sr = .45; sl = .25; } lean = Math.min(lean, -.06); }
    else { al = ar = 1.75; sl = sr = -.25; lean = -.1; }
  }
  if (p.hook && p.dead <= 0) {   // hook: the right arm throws, braces and reels; the body leans into it. R() eases every angle, so nothing pops
    const h = p.hook, dx = (h.hx - p.x) * p.face, dy = (p.y - 14) - h.hy, aim = Math.max(.2, Math.min(3.05, Math.PI / 2 + Math.atan2(dy, Math.max(.5, dx))));
    if (h.ph === 'fly') { const wind = h.t < .06; ar = wind ? -.7 : aim + .25; sr = wind ? .05 : .3; lean = wind ? .1 : -.14; }                          // wind up behind, then throw through
    else if (h.ph === 'back') { const c = Math.sin(VT * 17); ar = aim * .75 + c * .22; sr = .22 + Math.cos(VT * 17) * .14; al = Math.max(al, .9); lean = .07; }   // crank it back in
    else if (h.ph === 'swing' || h.ph === 'ride') { const sw = Math.max(-1, Math.min(1, p.vx * p.face / HK.SWING_MAX)); ar = aim; al = aim - .25; sr = .12; sl = .18; lean = -.34 * sw; ll = .5 - sw * .4; lr = -.2 - sw * .5; ka = -ll * .5; kr = -lr * .5; }
    else if (h.ph === 'zip') { ar = aim; al = 1.2; sr = .1; lean = -.28; ll = .7; lr = -.4; ka = -.4; kr = .3; }
    else if (h.ph === 'drag' || h.ph === 'reel') { ar = aim + .1; al = 1.3; sr = .15; lean = .22; }                                                      // heels in, leaning back on the rope
    else { ar = aim; sr = .15; lean = -.05; }                                                                                                        // latched: brace, waiting for tap or hold
  }
  if (p.kickIn && p.kick > 0 && !vine && p.dead <= 0) {   // kick: lead leg out front; kick down: both legs driven down, arms up
    if (p.kickDown) { ll = .1; lr = -.1; ka = .9; kr = .9; al = ar = 1.2; lean = .12; } else { ll = 1.5; lr = -.35; ka = -.15; kr = .2; lean = -.18; ar = -.4; }
  }
  const R = (o, k, v, r) => { o.rotation[k] = hold(o.rotation[k], v, dt, r || 30); };
  R(pl.legL, 'z', ll); R(pl.legR, 'z', lr); R(pl.ankL, 'z', ka); R(pl.ankR, 'z', kr);
  R(pl.armL, 'z', al); R(pl.armR, 'z', ar); R(pl.splL, 'x', sl); R(pl.splR, 'x', -sr);
  { const e = pl.armE = hold(pl.armE || 0, vine ? 1.05 : 0, dt, 12); for (const a of [pl.armL, pl.armR]) { const u = a.userData; u.pipe.scale.y = .42 + e; u.pipe.position.y = -.12 - (.42 + e) / 2; u.ext.position.y = -e; } }   // telescoping arms reach the vine above the dome
  R(bod, 'z', lean, 12); R(bod, 'y', tw, 12); bod.position.y = bob; R(pl.head, 'z', hd + (air ? (p.vy < 0 ? .08 : -.05) : 0), 18);
  pl.lid = hold(pl.lid, lid, dt, 14); pl.slant = hold(pl.slant, slant, dt, 14);
  pl.lids.forEach(o => { o.position.y = pl.lid; o.scale.y = Math.max(.01, (.25 - pl.lid) / .25); o.rotation.x = pl.slant * o.userData.s; });   // lid top stays at the lens rim
  const blink = (VT % 3.4) < .1 && !hurt && !photoCam; pl.eyes.forEach(e => { e.scale.y = blink ? .15 : 1; });
  pl.lens.emissiveIntensity = (hurt ? .55 + Math.sin(VT * 20) * .25 : 1.05 + Math.sin(VT * 3.1) * .3) + (p.inv > 0 && !hurt ? .4 : 0);
  pl.sprout.position.y = .5 + Math.sin(VT * 4.2 + (run ? ph * 2 : 0)) * (run ? .045 : .02) + (air ? .03 : 0); pl.sprout.rotation.z = Math.sin(VT * 3.3) * .12 + (run ? Math.sin(ph * 2) * .12 : 0) - (air ? .12 : 0) + (hurt ? .35 : 0); pl.sprout.scale.y = 1.75 * (1 + Math.sin(VT * 4.2 + 1) * .05);
  R(pl.leafR, 'x', hurt ? 2.4 : .9 + Math.sin(VT * 3) * .08, 8); R(pl.leafL, 'x', -.9 - Math.sin(VT * 3 + 1) * .08 - (air && p.vy < 0 ? .3 : 0), 8);
  pl.worm.forEach((s, i) => { s.rotation.z = Math.sin(VT * (air ? 14 : 5) - i * 1.3) * (air ? .9 : .45) + (i ? 0 : -.3); s.rotation.x = Math.sin(VT * 3.1 - i) * .3; });
  if (p.dead > 0) { const f = p.dead / .8; g.rotation.z = (1 - f) * 1.5 * -(p.face > 0 ? 1 : -1); g.scale.setScalar(Math.max(.01, f) * HS); } else { g.rotation.z = 0; g.scale.setScalar(HS); }
  g.visible = !(p.inv > 0 && Math.floor(VT * 12) % 2);
  const sh = pl.shadow, hole = holeAt(room, p.x), hh = Math.max(0, (GY - p.y) * S), onG = p.y <= GY + 1;
  sh.visible = !hole && p.dead <= 0 && onG; sh.position.set(X(p.x), .07, 0); const ss = 1.6 / (1 + hh * .16); sh.scale.set(ss, 1, ss);
}
function render(dtReal) {
  const dt = Math.min(0.1, dtReal || STEP); VT += dt; uTime.value = VT; if (!G.freeze) WT += G.ease > 0 ? dt * (1 - G.ease / CUT.REENTRY) : dt;   // WT: the enemies' clock (stands still while frozen)
  const room = G.world.rooms[G.room || 0], key = G.seed + '#' + (G.room || 0);
  if (key !== builtKey || forceRebuild) {
    if (key !== builtKey && G.p && cam.lastSeed === G.seed && G.state !== 'title') {      // keep the camera continuous across a room change
      if (G.room === cam.lastRoom + 1) cam.x -= 32; else if (G.room === cam.lastRoom - 1) cam.x += 32; else cam.x = X(G.p.x);
    }
    buildRoom(room); builtKey = key; forceRebuild = false; cam.lastRoom = G.room || 0; cam.lastSeed = G.seed;
    if (FW) FW.roomBuilt(room);   // fishing world: side path in this room (if any)
    if (TW) TW.roomBuilt(room);   // top-down paper map: map gate in this room (if any)
  }
  if (TW && TW.in3d()) { TW.render(dt); drawUI(); return; }   // the paper map / the deep dive own the screen
  if (FW && FW.in3d()) { FW.render(dt); drawUI(); return; }   // fishing world owns the screen
  const rs = G.rs, T = G.t, p = G.p, q = QL();
  // vines: rope drawn as 9 bent segments (bow is zero at both ends so the grab point still matches the logic line), leaves ride along
  for (const e of view.vines) {
    const pts = []; for (let i = 0; i <= 9; i++) { const s = i / 9, c = vinePt(e.vn, T, s), bow = Math.sin(s * Math.PI); pts.push(new THREE.Vector3(X(c.x) + bow * .1 * Math.sin(VT * 1.9 + e.vn.ax), Y(c.y), bow * .35 * Math.sin(VT * 1.3 + e.vn.ax * .1))); }
    for (let i = 0; i < 9; i++) { _vA.copy(pts[i]); _vB.copy(pts[i + 1]); _vD.subVectors(_vB, _vA); const L = _vD.length();
      _o.position.copy(_vA).add(_vB).multiplyScalar(.5); _o.quaternion.setFromUnitVectors(_up, _vD.normalize()); _o.scale.set(.2 - i * .006, L * 1.04, .2 - i * .006); _o.updateMatrix(); e.seg.setMatrixAt(i, _o.matrix); }
    e.seg.instanceMatrix.needsUpdate = true; e.knob.position.copy(pts[9]);
    for (const l of e.leaves) { const i = Math.round(l.s * 9), c = pts[i]; l.m.position.set(c.x + .25, c.y, c.z + .1); l.m.rotation.set(.4, l.s * 9, (l.s * 7) % 1.5 - .5); }
  }
  // crevasses: lava sparks, the giant biter (tell: rising, eyes flashing, bubbles), the tentacles reaching / holding him
  const crev = rs && rs.crev ? rs.crev : [];
  for (const f of view.fills) if (f.lava && Math.random() < dt * 2.5) fxSpark(f.x + (Math.random() - .5) * f.w * .8, f.y + .2, 2, '#ffb040', 2.5);
  for (const b of view.biters) { const c = crev.find(c => c.hi === b.hi), s = c && c.bite, on = !!s && s.st !== 'idle'; b.h.root.visible = on; if (!on) continue;
    b.h.root.position.set(X(s.x), Y(s.y) - 1.3, .6); b.h.jaw.rotation.x = hold(b.h.jaw.rotation.x, (s.st === 'up' || s.st === 'hold') ? .9 : .12, dt, 14);
    const flash = s.st === 'tell' && Math.sin(VT * 24) > 0; b.h.eyes.forEach(e => { e.material = flash ? M('#fff07a', '#ffe040') : M('#ffd84a', '#ffb020'); });
    if (s.st === 'tell' && Math.random() < dt * 14) fxSpark(X(s.x) + (Math.random() - .5) * 1.6, -.3, 1, '#bfe4ff', 2); }
  for (const t of view.tents) { const c = crev.find(c => c.hi === t.hi), s = c && c.tent, ext = s ? s.ext : 0; t.m.visible = ext > .02; if (!t.m.visible) continue;
    const gp = s.st === 'grab' && p && p.grab ? p : null, ex = X(t.ex), tipX = gp ? X(gp.x) : ex + t.side * TUNE.TENT.REACH * S * ext, tipY = gp ? Y(gp.y) + .5 : .35 + Math.sin(VT * 5) * .12;
    const x0 = ex - t.side * .5, y0 = -2.2, x1 = ex + t.side * .2, y1 = .9;
    for (let i = 0; i < t.n; i++) { const u = i / (t.n - 1), a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), c2 = u * u, r = .5 - u * .32;
      _o.position.set(a * x0 + b2 * x1 + c2 * tipX, a * y0 + b2 * y1 + c2 * tipY, .4 + Math.sin(VT * 3 + u * 5) * .2); _o.quaternion.identity(); _o.scale.set(r * 2, r * 2, r * 2); _o.updateMatrix(); t.m.setMatrixAt(i, _o.matrix); }
    t.m.instanceMatrix.needsUpdate = true; }
  // snappers
  for (const s of view.snaps) {
    const cs = G.rs && G.rs.croc && G.rs.croc[s.key], pinned = !!(G.rs && G.rs.perch === s.key), lung = cs && cs.st !== 'idle', tell = cs && cs.st === 'tell';
    const open = !pinned && (lung ? cs.st === 'up' || cs.st === 'hold' : snapOpen(s.pool, s.k, T)), warn = !pinned && (tell || (!lung && snapWarn(s.pool, s.k, T)));
    s.jaw.rotation.z = hold(s.jaw.rotation.z, open ? (lung ? 1.05 : .85) : warn ? .18 + Math.sin(VT * 30) * .05 : 0, dt, 24);
    const pm = warn ? M('#ff4a3a', '#c02818') : pinned ? M('#6a5a3a') : M('#2a1c13'); s.pa.material = pm; s.pb.material = pm;
    const rise = cs ? cs.y * S : 0; s.root.position.y = s.y0 + rise + (tell ? Math.sin(VT * 40) * .05 : 0) + (pinned ? Math.sin(VT * 9) * .02 : 0);
    s.root.rotation.z = hold(s.root.rotation.z, lung && cs.st !== 'down' ? .45 * s.dz : 0, dt, 14); s.tail.position.y = .1 + rise * .4;
  }
  { const cf = G.cf, on = G.state === 'play' && cf && (cf.ph === 'wait' || cf.ph === 'bite' || cf.ph === 'mash') && G.p; cfLine.visible = cfBob.visible = !!on;
    if (on) { const p = G.p, side = p.face || 1, bx = X(p.x + side * 22), by = .12 + (cf.ph === 'bite' ? -.18 + Math.sin(VT * 30) * .05 : Math.sin(VT * 2.2) * .04);
      cfBob.position.set(bx, by, .6); const ax = X(p.x + side * 4), ay = Y(p.y - 14), dx = bx - ax, dy = by + .15 - ay, len = Math.hypot(dx, dy);
      cfLine.position.set(ax + dx / 2, ay + dy / 2, .6); cfLine.scale.set(.025, len, .025); cfLine.rotation.set(0, 0, -Math.atan2(dx, dy)); } }
  if (view.tarFlag) view.bubbles.forEach((b, i) => { const k = .5 + .5 * Math.sin(VT * 3 + i * 2); b.scale.set(.5 * k + .1, .3 * k + .05, .5 * k + .1); });
  // gem: spin, bob, pulse, sparkle; pickup burst
  if (view.gem) { const gm = view.gem, t = gm.t, got = G.got.has(gm.root.userData.id);
    gm.root.visible = !got; gm.halo.visible = !got; gm.stars.forEach(s => { s.visible = !got; });
    if (got && !view.gemGot) { fxSpark(X(t.x), Y(t.y), 18, '#fff4c8', 8); fxBurst(X(t.x), Y(t.y), 8, P.gem[t.kind], 6); }
    view.gemGot = got;
    if (!got) { const y = Y(t.y) + Math.sin(VT * 3.2) * .22, x = X(t.x); gm.root.position.y = y; gm.root.rotation.y = VT * 2.2; const pu = 1 + Math.sin(VT * 5) * .05; gm.root.scale.set(pu, pu, pu);
      gm.core.material.emissiveIntensity = .45 + Math.sin(VT * 4) * .2; gm.halo.position.set(x, y, -.3); gm.halo.quaternion.copy(camera.quaternion); const hs = 3.4 + Math.sin(VT * 4) * .4; gm.halo.scale.set(hs, hs, 1);
      gm.stars.forEach((s, i) => { const a = VT * 1.6 + i * 2.1, r = 1.05 + .2 * Math.sin(VT * 2 + i); s.position.set(x + Math.cos(a) * r, y + Math.sin(a * 1.3) * .8, .5); s.quaternion.copy(camera.quaternion); const k = .35 + .55 * Math.max(0, Math.sin(VT * 3 + i * 2.4)); s.scale.set(k, k, 1); s.rotation.z += VT; }); } }
  // logs / crawlers
  const logs = rs ? rs.logs : [];
  for (let i = 0; i < logs.length; i++) { ensureLog(i); const l = view.logs[i]; l.root.visible = true; l.root.position.set(X(logs[i].x), .7, 0); l.root.rotation.z = logs[i].rot; l.shadow.rotation.z = -logs[i].rot;
    if (!G.freeze && Math.random() < .35) fxDust(X(logs[i].x), .05, 1, 1, 1, '#b49a6a'); }
  for (let i = logs.length; i < view.logs.length; i++) view.logs[i].root.visible = false;
  const crs = room.crawlers; ensureCrawlers(crs.length);
  crs.forEach((c, k) => { const s = rs && rs.crawlers[k]; const cr = view.crawlers[k]; if (!s || s.dead) { cr.root.visible = false; return; }
    cr.root.visible = true; cr.root.position.set(X(s.x), 0, 0); cr.body.rotation.y = hold(cr.body.rotation.y, s.d > 0 ? 0 : Math.PI, dt, 14);
    cr.body.position.y = Math.abs(Math.sin(WT * 9 + k)) * .06; cr.body.scale.set(1, 1 + Math.sin(WT * 5 + k) * .03, 1);
    cr.legs.forEach(l => { l.p.rotation.z = Math.sin(WT * 14 + l.ph) * .5; }); cr.ant.forEach((a, i) => { a.rotation.z = Math.sin(WT * 4 + i) * .2; }); });
  syncBoss();
  syncHero(room, p, dt); syncJunk();   // junk lying about + the buddy patch (hidden on the title screen too)
  syncHook(p, dt); syncHookCharge(p, dt);
  syncBuddy(p, dt); syncHatch(); if (!cutV.on) junkSync(dt);
  // ambient: god-rays + motes follow the camera, camera shake, sky + sun follow
  for (const r of view.rays) { const u = r.userData; r.position.set(cam.x + u.ox * .85, 9, u.oz); r.scale.set(u.w, 26, 1); r.rotation.z = .42; r.material.opacity = u.base * (.65 + .35 * Math.sin(VT * .5 + u.ph)); }
  if (view.motes) { const mm = view.motes; mm.d.forEach((m, i) => { _o.position.set(cam.x + m.x + Math.sin(VT * m.s * 4 + m.p) * 1.2, m.y + Math.sin(VT * m.s * 3 + m.p * 2) * .7, m.z); _o.quaternion.copy(camera.quaternion); const s = .14 + .08 * Math.sin(VT * 2 + m.p); _o.scale.set(s, s, s); _o.updateMatrix(); mm.mesh.setMatrixAt(i, _o.matrix); }); mm.mesh.instanceMatrix.needsUpdate = true; }
  setCamera(dt); if (FW) FW.afterSide(dt); if (TW) TW.afterSide(dt); camera.updateMatrixWorld(); camQ.copy(camera.quaternion); tBubbles(); bubFlush(); syncCutUI(); syncTUI(); backdropUpdate(dt);
  sky.position.copy(camera.position);
  if (q.shadows) { sun.target.position.set(Math.round(cam.x * 2) / 2, 3, 0); sun.position.copy(sun.target.position).add(SUNOFF); } else { sun.target.position.set(cam.x, 3, 0); sun.position.copy(sun.target.position).add(SUNOFF); }
  updatePool(poolN, dt); updatePool(poolA, dt);
  if (renderer) renderer.render(scene, camera);
  drawUI();
  fpsN++; fpsT += dtReal || 0; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; if (fpsEl) fpsEl.textContent = fps.toFixed(0) + ' fps' + (fpsEl.dataset.q ? ' ' + QL().name : ''); }
}
const fpsEl = qs.get('fps') ? $('fps') : null; if (fpsEl) { fpsEl.style.display = 'block'; fpsEl.dataset.q = '1'; }
applyQuality(); pl.shadow.visible = false;

/* ---------- the workshop: caravan, junk on the ground, the buddy patch, the workshop screen ----------
   The room is a cardboard screen over the paused run (light on phones: one 2D canvas, no extra draw calls). Its wall, bench floor
   and tape are the cardboard tiles in art/card (light tier, 512 px; loaded when mudbot nears the caravan); until they load (or if
   they fail) the same room is drawn in code. The caravan, junk, icons and patch are still built in code (placeholders). Words on
   signs and tags are drawn by code. */
const wsArt = {}; let wsArtAsked = false;
function wsLoadArt() { if (wsArtAsked) return; wsArtAsked = true;
  ['wall', 'floor', 'tape'].forEach(k => { const im = new Image(); im.onload = () => { wsArt[k] = im; wsBgFor = ''; }; im.src = 'art/card/' + k + '.webp'; }); }
const caravanSignM = reg(new THREE.MeshLambertMaterial({ map: mkTex(256, 64, (g, w, h) => { g.fillStyle = '#d9b98a'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f2616'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('JUNK', w / 2, h / 2 + 2); g.strokeStyle = 'rgba(63,38,22,.5)'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10); }) }));
const flapSignM = reg(new THREE.MeshLambertMaterial({ map: mkTex(128, 160, (g, w, h) => { g.fillStyle = '#c9a676'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,88,52,.45)'; g.lineWidth = 2; for (let x = 6; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.fillStyle = 'rgba(240,226,180,.85)'; g.fillRect(0, 12, w, 14); g.fillRect(0, h - 26, w, 14); g.fillStyle = '#3f2616'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('WORK', w / 2, h / 2 - 4); g.fillText('SHOP', w / 2, h / 2 + 22); }) }));
function buildCaravan(R, v, room) {
  const g = new THREE.Group(), x = X(caravanX(room)); g.position.set(x + 2.4, 0, -3.4); R.add(g);
  mk(gBox, M('#7a5233', null, true), 0, 1.75, 0, 5.2, 2.3, 2.4, g);                      // body (painted planks)
  mk(gBox, M('#5e3d25', null, true), 0, 3.05, 0, 5.6, .3, 2.8, g);                       // roof
  mk(gCyl, M('#8a6a44'), 0, 3.2, 0, 2.6, 5.4, 2.6, g).rotation.z = Math.PI / 2;           // rounded canvas top
  for (const s of [-1.6, 1.6]) { const w = mk(gCyl, M('#3f2616'), s, .55, 1.25, 1.1, .18, 1.1, g); w.rotation.x = Math.PI / 2; }   // wheels
  const sign = new THREE.Mesh(gQuad, caravanSignM); sign.scale.set(2.6, .65, 1); sign.position.set(.4, 2.1, 1.22); g.add(sign);
  const flap = mk(gBox, M('#c9a676', null, true), -2.64, 1.55, .3, .08, 1.9, 1.5, g);   // the back flap (cardboard), facing the way he comes in
  const fs = new THREE.Mesh(gQuad, flapSignM); fs.scale.set(1.3, 1.65, 1); fs.position.set(-2.69, 1.55, .3); fs.rotation.y = -Math.PI / 2; g.add(fs);
  mk(gBox, M('#e8d9a8'), -2.7, 2.45, .3, .1, .12, 1.6, g, true); mk(gBox, M('#e8d9a8'), -2.7, .65, .3, .1, .12, 1.6, g, true);   // masking tape on the flap
  v.caravan = { g, flap }; return g;
}
const jkViews = [];
function buildJunkView(kind) { const g = new THREE.Group(), c = JUNK[kind].col;
  if (kind === 'can') mk(gCyl, MS(c, .4, .6), 0, .18, 0, .32, .38, .32, g);
  else if (kind === 'bottle') { mk(gCyl, M(c), 0, .2, 0, .26, .42, .26, g); mk(gCyl, M(c), 0, .48, 0, .1, .2, .1, g); }
  else if (kind === 'boot') { mk(gBox, M(c, null, true), 0, .22, 0, .26, .42, .3, g); mk(gBox, M(c, null, true), .16, .08, 0, .42, .16, .3, g); }
  else if (kind === 'plank') { const m = mk(gBox, M(c, null, true), 0, .1, 0, .9, .12, .26, g); m.rotation.z = .12; }
  else if (kind === 'rag') mk(gBlob, M(c), 0, .06, 0, .55, .14, .4, g);
  else mk(gBox, M(c, null, true), 0, .07, 0, .5, .12, .2, g);   // remote
  g.userData.kind = kind; g.visible = false; scene.add(g); return g; }
const wsPatch = new THREE.Group(); { const o = buddy.j.torso.userData.o, pm = M('#c9a676', null, true), tm = M('#e8d9a8'); wsPatch.position.set(.35 - o[0], .42 - o[1], 0 - o[2]); wsPatch.rotation.z = -.2;
  mk(gBox, pm, 0, 0, 0, .05, .2, .26, wsPatch); mk(gBox, tm, .02, .06, 0, .03, .04, .32, wsPatch, true); mk(gBox, tm, .02, -.06, 0, .03, .04, .32, wsPatch, true);
  wsPatch.visible = false; buddy.j.torso.add(wsPatch); }   // the buddy armour patch: shows on the junk mech while super is on
function syncJunk() {
  const list = G.state === 'title' || !G.jspots ? [] : G.jspots.filter(j => j.room === G.room && !j.got);
  jkViews.forEach(v => { v.visible = false; });
  list.forEach((j, i) => { let v = jkViews.find(o => !o.visible && o.userData.kind === j.kind); if (!v) { v = buildJunkView(j.kind); jkViews.push(v); }
    v.visible = true; v.position.set(X(j.x), Math.max(.02, Y(j.y) - .4) + (1 + Math.sin(VT * 2.4 + i)) * .03, .3); v.rotation.y = .4 + Math.sin(VT * .8 + i) * .25; });
  wsPatch.visible = !!(G.gear && G.gear.patch > 0 && G.sup && G.sup.on && (G.sup.ph === 'fight' || G.sup.ph === 'grow') && mech.mode !== 'out');
}
/* the workshop screen (DOM; inline styles, CSP-safe): blueprint cards, two taped-on slots, the junk bag, the result tag, TAPE IT, LEAVE */
const wsCss = document.createElement('style');
wsCss.textContent = `#ws{position:fixed;inset:0;display:none;z-index:40;color:#3f2616;font-family:system-ui,sans-serif;font-weight:bold;user-select:none;-webkit-user-select:none;touch-action:none}
#ws canvas.bg{position:absolute;inset:0;width:100%;height:100%}
#ws .wrap{position:absolute;left:4vmin;right:4vmin;top:9vmin;bottom:3vmin;display:flex;flex-direction:column;gap:1.6vmin}
#ws .row{display:flex;gap:2vmin;justify-content:center;flex-wrap:wrap}
#ws .card{background:#e3c99a;border:2px solid #8a6a44;border-radius:4px;padding:1vmin 2vmin;min-width:20vmin;max-width:30vmin;cursor:pointer;box-shadow:3px 3px 0 rgba(63,38,22,.35);font-size:max(11px,1.9vmin);position:relative}
#ws .card small{display:block;font-weight:normal;font-size:max(10px,1.6vmin)} #ws .card.sel{outline:3px solid #e8a83a} #ws .card.on{background:#cfe3b0}
#ws .card.on:after{content:'ON';position:absolute;right:-8px;top:-10px;background:#cfe3b0;color:#2f6a3a;border:2px solid #2f6a3a;padding:0 4px;transform:rotate(8deg);font-size:max(10px,1.6vmin)}
#ws .bench{position:relative;display:flex;gap:3vmin;align-items:center;justify-content:center;padding:1.2vmin 2vmin;background:rgba(201,166,118,.55);border:2px dashed #8a6a44;border-radius:4px;overflow:hidden}
#ws .slot{width:14vmin;height:14vmin;min-width:58px;min-height:58px;border:3px dashed #5e3d25;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(243,230,196,.6);cursor:pointer;font-size:max(10px,1.6vmin);text-align:center}
#ws .slot.fit{border-style:solid;border-color:#2f6a3a} #ws .slot.miss{border-style:solid;border-color:#a3542e} #ws .slot img{width:8vmin;height:8vmin;min-width:34px;min-height:34px;pointer-events:none}
#ws .tag{background:#f3e6c4;border:2px solid #3f2616;border-radius:3px 12px 12px 3px;padding:1vmin 2vmin;min-width:22vmin;font-size:max(11px,2vmin);transform:rotate(-2deg)}
#ws .tag small{display:block;font-weight:normal;font-size:max(10px,1.5vmin)}
#ws .tapest{position:absolute;left:-40%;top:42%;width:40%;height:3vmin;background:url(art/card/tape.webp) center/auto 100% repeat-x,rgba(240,226,180,.92);border-top:1px solid #c8b680;border-bottom:1px solid #c8b680;pointer-events:none;display:none}
#ws .tapest.go{display:block;animation:wstape .5s linear forwards} @keyframes wstape{to{left:110%}}
#ws .bag{display:flex;flex-wrap:wrap;gap:1.2vmin;justify-content:center;align-content:flex-start;min-height:12vmin;overflow:auto}
#ws .jk{display:flex;flex-direction:column;align-items:center;background:#f3e6c4;border:2px solid #8a6a44;border-radius:5px;padding:.5vmin 1vmin;cursor:grab;font-size:max(10px,1.5vmin);min-width:12vmin;touch-action:none}
#ws .jk img{width:8vmin;height:8vmin;min-width:34px;min-height:34px;pointer-events:none} #ws .jk.pick{outline:3px solid #e8a83a;background:#ffe9b0} #ws .jk span{pointer-events:none} #ws .jk small{font-weight:normal;pointer-events:none}
#ws .bar{display:flex;gap:2vmin;justify-content:center}
#ws button{font:bold max(13px,2.4vmin) system-ui,sans-serif;padding:1.2vmin 3vmin;border-radius:6px;border:2px solid #3f2616;background:#e8a83a;color:#3f2616;cursor:pointer;min-height:44px}
#ws button.lv{background:#d9b98a} #ws button:disabled{opacity:.45}
#ws .hint{text-align:center;font-weight:normal;font-size:max(10px,1.6vmin)}
#ws-ghost{position:fixed;z-index:41;pointer-events:none;width:9vmin;height:9vmin;min-width:38px;min-height:38px;display:none;transform:translate(-50%,-50%)}
#ws-go{position:fixed;left:50%;bottom:24%;transform:translateX(-50%);display:none;z-index:7;padding:.45em 1em;border-radius:6px;background:#e3c99a;border:2px solid #3f2616;color:#3f2616;font:bold max(13px,2.3vmin) system-ui,sans-serif;cursor:pointer;touch-action:none;white-space:nowrap;box-shadow:3px 3px 0 rgba(63,38,22,.4)}
#h-junk{color:#e3c99a} body.wsopen .tb{display:none}`;
document.head.appendChild(wsCss);
const wsEl = document.createElement('div'); wsEl.id = 'ws'; wsEl.innerHTML = '<canvas class="bg"></canvas><div class="wrap"><div class="row cards"></div><div class="bench"><div class="tapest"></div></div><div class="hint"></div><div class="bag"></div><div class="bar"><button class="tp">TAPE IT</button><button class="lv">LEAVE: BOSS</button></div></div>';
document.body.appendChild(wsEl);
const wsGhost = document.createElement('img'); wsGhost.id = 'ws-ghost'; wsGhost.alt = ''; document.body.appendChild(wsGhost);
const wsGo = document.createElement('div'); wsGo.id = 'ws-go'; document.body.appendChild(wsGo);
{ const hj = document.createElement('span'); hj.id = 'h-junk'; hj.title = 'Junk bag'; hudEl.insertBefore(hj, $('h-gems')); }
const wsQ = s => wsEl.querySelector(s);
function drawJunkIcon(c, kind) { const g = c.getContext('2d'), w = c.width, h = c.height, col = JUNK[kind].col; g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.lineWidth = 2.5; g.strokeStyle = '#3f2616'; g.fillStyle = col;
  const rr = (x, y, a, b) => { g.beginPath(); g.rect(x, y, a, b); g.fill(); g.stroke(); };
  if (kind === 'can') { rr(-12, -18, 24, 36); g.fillStyle = '#e8a83a'; g.fillRect(-12, -6, 24, 10); }
  else if (kind === 'bottle') { rr(-10, -6, 20, 26); rr(-4, -22, 8, 16); }
  else if (kind === 'boot') { rr(-12, -20, 14, 32); rr(-12, 6, 28, 12); }
  else if (kind === 'plank') { g.rotate(-.3); rr(-26, -6, 52, 12); g.beginPath(); g.moveTo(-14, -2); g.lineTo(10, 2); g.stroke(); }
  else if (kind === 'rag') { g.beginPath(); g.moveTo(-22, 8); g.quadraticCurveTo(-10, -18, 4, -6); g.quadraticCurveTo(18, -16, 22, 10); g.quadraticCurveTo(0, 20, -22, 8); g.fill(); g.stroke(); }
  else { rr(-9, -22, 18, 44); g.fillStyle = '#d9534f'; g.beginPath(); g.arc(0, -14, 3, 0, 7); g.fill(); g.fillStyle = '#c7c7c7'; for (let k = 0; k < 3; k++) g.fillRect(-5, -4 + k * 8, 10, 4); }
  g.restore(); }
const wsIcons = {}, wsIcon = k => wsIcons[k] || (wsIcons[k] = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; drawJunkIcon(c, k); return c.toDataURL(); })());   // code-drawn junk icons, as images
function drawWsBg() {   // corrugated cardboard walls, a box workbench, masking-tape seams, marker scribbles, the sign (all code-drawn placeholders)
  const c = wsQ('canvas.bg'), dpr = Math.min(1.25, devicePixelRatio || 1), w = c.width = Math.round(innerWidth * dpr), h = c.height = Math.round(innerHeight * dpr), g = c.getContext('2d');
  const tile = (im, y0, y1, size) => { const p = g.createPattern(im, 'repeat'), k = 1 / Math.max(1, Math.round(im.width / size)); /* whole-fraction scale: no seam lines */ p.setTransform(new DOMMatrix([k, 0, 0, k, 0, y0])); g.fillStyle = p; g.fillRect(0, y0, w, y1 - y0); };
  if (wsArt.wall) tile(wsArt.wall, 0, h * .72, Math.max(160, h * .42)); else { const wall = g.createLinearGradient(0, 0, 0, h * .72); wall.addColorStop(0, '#b58e5e'); wall.addColorStop(1, '#c9a676'); g.fillStyle = wall; g.fillRect(0, 0, w, h * .72);
    g.strokeStyle = 'rgba(94,61,37,.18)'; g.lineWidth = Math.max(2, w / 300); for (let x = 0; x < w; x += Math.max(8, w / 90)) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h * .72); g.stroke(); } }
  if (wsArt.floor) tile(wsArt.floor, h * .72, h, Math.max(140, h * .3)); else { const fl = g.createLinearGradient(0, h * .72, 0, h); fl.addColorStop(0, '#8f6c45'); fl.addColorStop(1, '#7a5a38'); g.fillStyle = fl; g.fillRect(0, h * .72, w, h * .28); }
  g.fillStyle = 'rgba(40,24,12,.28)'; g.fillRect(0, h * .72, w, h * .012);   // the bench edge
  const r = mulberry(hash('ws-bg')), tapeH = Math.max(10, h * .03); g.fillStyle = 'rgba(240,226,180,.8)';
  for (let k = 0; k < 6; k++) { const x = r() * w, y = r() * h * .65, a = (r() - .5) * .8, L = w * (.12 + r() * .18); g.save(); g.translate(x, y); g.rotate(a);
    if (wsArt.tape) g.drawImage(wsArt.tape, -L / 2, -tapeH / 2, L, tapeH); else g.fillRect(-L / 2, -tapeH / 2, L, tapeH); g.restore(); }   // tape seams
  g.strokeStyle = 'rgba(40,30,60,.35)'; g.lineWidth = Math.max(2, w / 400); for (let k = 0; k < 5; k++) { g.beginPath(); let x = r() * w, y = r() * h * .6; g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (r() - .3) * w * .04; y += (r() - .5) * h * .04; g.lineTo(x, y); } g.stroke(); }   // marker scribbles
  const lamp = g.createRadialGradient(w * .5, h * .08, 0, w * .5, h * .08, w * .45); lamp.addColorStop(0, 'rgba(255,236,190,.35)'); lamp.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = lamp; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e3c99a'; g.strokeStyle = '#3f2616'; g.lineWidth = Math.max(2, w / 500); const sw = Math.min(w * .3, 360 * dpr), sx = (w - sw) / 2, sy = h * .012, sh = h * .07; g.fillRect(sx, sy, sw, sh); g.strokeRect(sx, sy, sw, sh);
  g.fillStyle = '#3f2616'; g.font = 'bold ' + Math.round(sh * .62) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WORKSHOP', w / 2, sy + sh / 2 + 1);
  if (!wsArt.floor) { g.fillStyle = 'rgba(63,38,22,.25)'; for (let k = 0; k < 4; k++) g.fillRect(w * (.04 + k * .26), h * .78, w * .18, h * .2); }   // box legs of the bench (code look only)
}
let wsKey = '', wsBgFor = '';
function wsRender() {
  const w = G.ws, open = !!(w && w.open) && G.state === 'play';   // paused (window left, phone upright): hidden under the pause
  if (wsEl.style.display !== (open ? 'block' : 'none')) wsEl.style.display = open ? 'block' : 'none';
  document.body.classList.toggle('wsopen', open);
  const near = !open && G.state === 'play' && !G.freeze && G.wsNear; if (wsGo.style.display !== (near ? 'block' : 'none')) { wsGo.style.display = near ? 'block' : 'none'; wsGo.textContent = isTouch ? 'WORKSHOP' : 'WORKSHOP [F]'; }
  if (!open) { wsKey = ''; if (G.state === 'play' && G.room >= WORK.ROOM - 1 && G.room <= WORK.ROOM) wsLoadArt(); return; }
  wsLoadArt();
  const bk = innerWidth + 'x' + innerHeight; if (wsBgFor !== bk) { wsBgFor = bk; drawWsBg(); }
  const k = G.bag.join(',') + '|' + w.slots.join(',') + '|' + w.bp + '|' + w.pick + '|' + Object.keys(G.gear.built).join(',') + '|' + (w.tapeT > 0) + '|' + w.built; if (k === wsKey) return; wsKey = k;
  const bp = BLUEPRINTS[w.bp], built = G.gear.built;
  wsQ('.cards').innerHTML = BLUEPRINTS.map((b, i) => '<div class="card' + (i === w.bp ? ' sel' : '') + (built[b.id] ? ' on' : '') + '" data-bp="' + i + '">' + (isTouch ? '' : '[' + (i + 1) + '] ') + b.n.toUpperCase() + '<small>' + b.does + '</small><small>wants: ' + b.slots.join(' + ') + '</small></div>').join('');
  const bench = wsQ('.bench'), tape = bench.querySelector('.tapest'); [...bench.querySelectorAll('.slot,.tag')].forEach(e => e.remove());
  bp.slots.forEach((want, i) => { const s = document.createElement('div'), j = w.slots[i]; s.className = 'slot' + (j ? (slotFits(want, j) ? ' fit' : ' miss') : ''); s.dataset.slot = i;
    if (j) { const im = document.createElement('img'); im.src = wsIcon(j); im.alt = ''; s.appendChild(im); s.appendChild(document.createTextNode(JUNK[j].n)); } else s.textContent = want.toUpperCase(); bench.insertBefore(s, tape); });
  const tag = document.createElement('div'); tag.className = 'tag';
  if (built[bp.id]) tag.innerHTML = 'ON: ' + bpResult(bp, built[bp.id].slots).txt + '<small>lasts the whole run</small>';
  else { const r = bpResult(bp, w.slots), full = w.slots.slice(0, bp.slots.length).every(Boolean); tag.innerHTML = (full ? '' : 'will give: ') + r.txt + '<small>' + (bp.id === 'plate' ? 'any junk holds' : r.m + ' of 2 slots fit (' + bp.slots.join(' + ') + ')') + '</small>'; }
  bench.appendChild(tag);
  tape.classList.toggle('go', w.tapeT > 0);
  wsQ('.bag').innerHTML = G.bag.length ? G.bag.map((j, i) => '<div class="jk' + (i === w.pick ? ' pick' : '') + '" data-j="' + i + '"><img src="' + wsIcon(j) + '" alt=""><span>' + JUNK[j].n + '</span><small>' + JUNK[j].mat.replace('_', ' ') + ': ' + (matTags(JUNK[j].mat).join(', ') || 'plain') + '</small></div>').join('') : '<div class="hint">junk bag empty: pick up junk on the run or at the lake, then come back</div>';
  wsQ('.hint').textContent = 'JUNK BAG ' + G.bag.length + '/' + WORK.BAG_MAX + ' · ' + (isTouch ? 'tap junk, then a slot (or drag it). Tap a filled slot to take it back' : 'click junk, then a slot (or drag it). Right-click a filled slot to take it back. Space: tape it. Esc: leave');
  wsQ('button.tp').disabled = !!built[bp.id] || !w.slots.slice(0, bp.slots.length).every(Boolean) || w.tapeT > 0;
}
let wsDrag = null;
wsEl.addEventListener('contextmenu', e => e.preventDefault());
wsEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const t = e.target, w = G.ws; if (!w || !w.open || G.state !== 'play' || !t.closest) return;
  const card = t.closest('.card'); if (card) { wsPickBp(+card.dataset.bp); return; }
  const slot = t.closest('.slot'); if (slot) { const i = +slot.dataset.slot; if (w.slots[i]) wsTakeBack(i); else wsFill(i); return; }
  const jk = t.closest('.jk'); if (jk) { wsDrag = { i: +jk.dataset.j, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; try { wsEl.setPointerCapture(e.pointerId); } catch (_) {} return; }
  if (t.closest('button.tp')) { wsTape(); return; } if (t.closest('button.lv')) { wsLeave(); return; } });
wsEl.addEventListener('pointermove', e => { const d = wsDrag; if (!d || d.id !== e.pointerId) return; if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) { d.moved = true; wsGhost.src = wsIcon(G.bag[d.i]); wsGhost.style.display = 'block'; }
  if (d.moved) { wsGhost.style.left = e.clientX + 'px'; wsGhost.style.top = e.clientY + 'px'; } });
const wsDrop = e => { const d = wsDrag; if (!d || d.id !== e.pointerId) return; wsDrag = null; wsGhost.style.display = 'none';
  if (!d.moved) { wsPickJunk(d.i); return; } const el = document.elementFromPoint(e.clientX, e.clientY), s = el && el.closest && el.closest('#ws .slot'); if (s) wsFill(+s.dataset.slot, d.i); };
wsEl.addEventListener('pointerup', wsDrop); wsEl.addEventListener('pointercancel', () => { wsDrag = null; wsGhost.style.display = 'none'; });
wsGo.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); wsOpen(); });
function wsKeyDown(e) {   // keys while the workshop is open (the run's keys do nothing here)
  const c = e.code; e.preventDefault(); if (e.repeat || G.state !== 'play') return;   // paused: nothing (P / focus brings it back)
  if (c === 'Space' || c === 'Enter') wsTape(); else if (c === 'Escape' || c === 'KeyD' || c === 'ArrowRight') wsLeave();
  else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3') wsPickBp(+c.slice(5) - 1); else if (c === 'KeyM') toggleMute(); }

/* ---------- input ---------- */
const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
// end screen: ignore restart presses for END_LOCK ms after it appears (mashing jump / tapping no longer skips it); then a fresh press is needed
const END_LOCK = 1000; let endShownAt = -1e9, wasEnd = false;
function noteEnd() { const e = G.state === 'end'; if (e && !wasEnd) endShownAt = performance.now(); wasEnd = e; }
function startOrRestart() { noteEnd(); if (G.state === 'end' && performance.now() - endShownAt < END_LOCK) return; if (G.state === 'title' || G.state === 'end') { G.p = null; startRun(); } }
function setSeed(s) { G.seed = s; G.world = genWorld(s); G.best = 0; try { G.best = +localStorage.getItem(BEST_KEY(s)) || 0; } catch (e) {} }
const dailySeed = () => { const d = new Date(); return 'daily-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// the workshop screen owns the keyboard while it is open: a capture listener runs before every other keydown / keyup listener
// (the fishing world's are registered first) and stops them; P still pauses
addEventListener('keydown', e => { if (!(G.ws && G.ws.open && (G.state === 'play' || G.state === 'paused'))) return; e.stopImmediatePropagation();
  if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); togglePause(); return; } wsKeyDown(e); }, true);
addEventListener('keyup', e => { if (G.ws && G.ws.open && (G.state === 'play' || G.state === 'paused')) e.stopImmediatePropagation(); }, true);
addEventListener('keydown', e => {
  const menu = G.state === 'title' || G.state === 'end';
  if (menu && e.code === 'KeyD') { setSeed(dailySeed()); G.state = 'title'; return; }
  const k = keyMap[e.code];
  if (k) { e.preventDefault(); if (k === 'jump' && !keys.jump) jumpQ = 0.12; keys[k] = true; return; }
  // S / Down: the live shield key (kept, controls parity with live 7e66286) AND the down modifier for kick down
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); keys.down = true; if (!e.repeat && G.state === 'play' && !G.freeze) blockInput(true); return; }
  if (e.code === 'KeyE') { e.preventDefault(); if (!e.repeat && G.state === 'play' && !G.freeze) blockInput(true); return; }                      // shield
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') { e.preventDefault(); if (!e.repeat && !G.freeze) kickInput(true); return; }        // kick
  if (e.code === 'KeyF' && !e.repeat && G.state === 'play' && G.wsNear && wsOpen()) { e.preventDefault(); return; }                          // the caravan flap: workshop
  if (e.code === 'KeyF' && !e.repeat && G.state === 'play' && G.rs && G.rs.perch && fishInput()) { e.preventDefault(); return; }                // fish off a croc head
  if (e.ctrlKey && (k || e.code === 'KeyS' || e.code === 'KeyE') && G.state === 'play') e.preventDefault();
  if (e.code === 'KeyB' && menu && !e.repeat) { setBlockMode(blockMode === 'press' ? 'hold' : 'press'); return; }
  if (e.code === 'Enter') { e.preventDefault(); if (!(e.repeat && G.state === 'end')) startOrRestart(); }
  else if (e.code === 'KeyP' && (G.state === 'play' || G.state === 'paused')) { G.state = G.state === 'play' ? 'paused' : 'play'; }
  else if (e.code === 'KeyN' && menu) { setSeed(Math.random().toString(36).slice(2, 8)); G.state = 'title'; }
  else if (e.code === 'KeyM' && !e.repeat) { if (e.shiftKey) cycleVol(); else toggleMute(); }   // M = sound on/off (as live); Shift+M = next level (new)
  else if (e.code === 'KeyQ' && !e.repeat && G.state === 'play') superInput();   // super move: when buddy is recharged
  else if (e.code === 'KeyR' && !e.repeat && G.state === 'play') rideInput();    // buddy rides in the dome / hops out (near him)
  else if (e.code === 'KeyT' && !e.repeat && G.state === 'play') tInput();      // T mode: pause + buddy in the chest + mini games
  else if (G.freeze === 't' && TKEYS[e.code]) { e.preventDefault(); if (!e.repeat) tKey(e.code); }
  else if (e.code === 'KeyH' && G.state === 'end') goHome();
});
/* sound levels (M or the speaker button cycle high -> med -> low -> off -> high). The level is a multiplier on the sfx gain (base .04);
   off = no sound at all. Saved in localStorage 'mudpity-vol'; an old 'jr3d-mute'=1 is read as off. No art for med/low: they reuse
   sound_on with less opacity. Wraps the logic's sfx() so no logic line changes. */
const VOL_ORDER = ['high', 'med', 'low', 'off'];
const VOL_GAIN = { high: 1.0, med: 0.6, low: 0.3, off: 0 };   // med and low are PLAYTEST DEFAULTS
const VOL_KEY = 'mudpity-vol';
let vol = 'high';
try { const v = localStorage.getItem(VOL_KEY); if (VOL_GAIN[v] !== undefined) vol = v; else if (localStorage.getItem('jr3d-mute') === '1') { vol = 'off'; localStorage.setItem(VOL_KEY, 'off'); } } catch (e) {}
sfxVol = VOL_GAIN[vol];
{ const _sfx = sfx; sfx = function () { if (vol !== 'off') _sfx.apply(null, arguments); }; }
function setVol(v) { if (VOL_GAIN[v] === undefined) return; vol = v; sfxVol = VOL_GAIN[v]; try { localStorage.setItem(VOL_KEY, v); localStorage.removeItem('jr3d-mute'); } catch (e) {} syncSnd(); }
let volOn = vol === 'off' ? 'high' : vol;   // the level sound comes back at
function toggleMute() { if (vol === 'off') setVol(volOn); else { volOn = vol; setVol('off'); } }   // M / speaker button: on/off, as live
function cycleVol() { setVol(VOL_ORDER[(VOL_ORDER.indexOf(vol) + 1) % VOL_ORDER.length]); if (vol !== 'off') volOn = vol; }   // Shift+M: high -> med -> low -> off
function syncSnd() { const b = $('b-snd'), off = vol === 'off'; b.src = off ? 'art/icons/sound_off.png' : 'art/icons/sound_on.png';
  b.style.opacity = vol === 'med' ? '.75' : vol === 'low' ? '.5' : ''; b.alt = b.title = 'Sound: ' + vol + ' (M on/off, Shift+M level)'; }
function togglePause() { if (G.state === 'play' || G.state === 'paused') G.state = G.state === 'play' ? 'paused' : 'play'; }
function goHome() { if (G.state === 'end') { G.state = 'title'; } }
syncSnd();
[['b-pause', togglePause], ['b-snd', toggleMute]].forEach(([id, f]) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); f(); }));
addEventListener('keyup', e => { const k = keyMap[e.code]; if (k) keys[k] = false; if (e.code === 'ArrowDown' || e.code === 'KeyS') { keys.down = false; blockInput(false); } if (e.code === 'KeyE') blockInput(false); if (G.freeze === 't' && TKEYS[e.code]) tKeyUp(e.code); });
// leaving the tab / window: drop held input and pause (the existing P pause, so the timer and the run clock stop); a pause made this way resumes on return
let autoPaused = false;
function pauseOnLeave() { keys.left = keys.right = keys.jump = keys.block = keys.down = false; blockLatch = false; jumpQ = 0; hookInput(false); mouseL = mouseR = mouseM = false; if (G.state === 'play') { G.state = 'paused'; autoPaused = true; } }
function resumeOnReturn() { if (autoPaused && G.state === 'paused') G.state = 'play'; autoPaused = false; }
wsResetInput = () => { keys.left = keys.right = keys.jump = keys.block = keys.down = false; blockLatch = false; jumpQ = 0; hookInput(false); mouseL = mouseR = mouseM = false; };
addEventListener('blur', pauseOnLeave);
addEventListener('focus', () => { if (!document.hidden) resumeOnReturn(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnLeave(); else if (document.hasFocus()) resumeOnReturn(); });
if ('ontouchstart' in window || matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
document.querySelectorAll('.tb').forEach(b => { const k = b.dataset.k;
  if (k === 'hook') {    // hook button: down fires it, up lets go (tap = zip, hold = swing); dims while the hook is out and fills back up as he reels it in
    const hd = e => { e.preventDefault(); if (G.state === 'play') hookInput(true); try { b.setPointerCapture(e.pointerId); } catch (_) {} }, hu = e => { e.preventDefault(); hookInput(false); };
    b.addEventListener('pointerdown', hd); b.addEventListener('pointerup', hu); b.addEventListener('pointercancel', hu); b.addEventListener('lostpointercapture', hu); return; }
  if (k === 'tmode') { b.addEventListener('pointerdown', e => { e.preventDefault(); tInput(); }); return; }   // T button (touch): same as T
  if (k === 'fish') { b.addEventListener('pointerdown', e => { e.preventDefault(); fishInput(); }); return; }   // fish button (touch): same as F on a croc head
  if (k === 'kick') { b.addEventListener('pointerdown', e => { e.preventDefault(); kickInput(true); b.classList.add('on'); }); const ku = e => { e.preventDefault(); b.classList.remove('on'); }; b.addEventListener('pointerup', ku); b.addEventListener('pointercancel', ku); return; }   // kick button (touch): same as Ctrl
  if (k === 'super') {   // super button: same as Q (lit and pulsing when buddy is recharged; a tap before that gives the 'not ready' cue)
    b.addEventListener('pointerdown', e => { e.preventDefault(); superInput(); }); return; }
  if (k === 'block') {   // block button: press mode toggles, hold mode blocks while the finger is down (lit state set in syncTouchDim)
    const bd = e => { e.preventDefault(); if (G.state === 'play') blockInput(true); try { b.setPointerCapture(e.pointerId); } catch (_) {} }, bu = e => { e.preventDefault(); blockInput(false); };
    b.addEventListener('pointerdown', bd); b.addEventListener('pointerup', bu); b.addEventListener('pointercancel', bu); b.addEventListener('lostpointercapture', bu); return; }
  const down = e => { e.preventDefault(); if (k === 'jump' && !keys.jump) { jumpQ = 0.12; startOrRestart(); } keys[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
  const up = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
});
// end screen + mouse: left click is the hook, so a click on the game (or the panel) no longer restarts a finished run; the restart
// icon, Enter or a touch tap do (a hook click a second after the win screen came up was starting a new run)
// controls parity with live: a mouse click on the end screen restarts again (after END_LOCK), as live does
const mouseOnEnd = e => false;
cv.addEventListener('pointerdown', e => { if (G.freeze === 'cut') { cutPointer(e); return; } if (G.freeze === 't') { tPointerDown(e); return; } if (mouseOnEnd(e)) return; startOrRestart(); });
/* mouse: left button = hook (as live), right button = shield (as live; E, S, Down too), middle button = kick (like Ctrl).
   Read from e.buttons so a second button pressed while the first is down (a chord, which sends pointermove, not pointerdown) still counts.
   A press only counts on the game canvas; a release counts anywhere. Touch has its own buttons. */
let mouseL = false, mouseR = false, mouseM = false;
function mouseButtons(e) {
  if (e.pointerType === 'touch') return;
  const onCv = e.target === cv, l = !!(e.buttons & 1), r = !!(e.buttons & 2);
  if (l !== mouseL && (!l || onCv)) { mouseL = l; if (!G.freeze || !l || tugOn()) hookInput(l); }   // frozen: the mouse belongs to the cutscene / T pause (the tug: left click pulls)
  if (r !== mouseR && (!r || onCv)) { mouseR = r; if (r) { e.preventDefault(); if (G.state === 'play' && !G.freeze) blockInput(true); } else blockInput(false); }   // right = shield, as live
  const m = !!(e.buttons & 4); if (m !== mouseM && (!m || onCv)) { mouseM = m; if (m) { e.preventDefault(); if (!G.freeze) kickInput(true); } }   // middle = kick (new)
}
['pointerdown', 'pointermove', 'pointerup'].forEach(t => addEventListener(t, mouseButtons));
cv.addEventListener('contextmenu', e => e.preventDefault());   // right click is the shield, so no browser menu over the game
panel.addEventListener('pointerdown', e => { e.preventDefault(); { const hw = e.target && e.target.closest && e.target.closest('#panel.title .how'); if (hw && hw.scrollHeight > hw.clientHeight + 1) return; }   // scrolling the controls list (drag or scrollbar) does not start the run
  if (e.target && e.target.id === 'e-home') { goHome(); return; } if (e.target && e.target.closest && e.target.closest('#set-block')) { setBlockMode(blockMode === 'press' ? 'hold' : 'press'); return; } if (e.target && e.target.closest && e.target.closest('#set-quality')) { setQuality(1 - Qi, true); return; } if (e.target && e.target.closest && e.target.closest('#set-tug')) { setTugMode(TUG_MODES[(TUG_MODES.indexOf(tugMode) + 1) % TUG_MODES.length]); return; } if (mouseOnEnd(e)) return; startOrRestart(); });

fxKickLand = p => { fxDust(X(p.x), .1, 10, 3, 2); addShake(.25); };
/* ---------- fishing world (fishworld.js): its own scene layer; these are the only hooks ---------- */
const FW = window.MudFishWorld && renderer ? window.MudFishWorld({ THREE, G, renderer, scene, camera, cv, pl, buddy, poseBuddy, buddyRig, hold, uTime, VT: () => VT,
  sfx: (...a) => sfx(...a), mats, M, AM, artify, reg, gBox, gCyl, gSph, gIco, gCone, gDisc, gRing, gQuad, gTrunk, gBlob, gRock, gTuft, texGlow, texSoft, texStar, texRay,
  X, GY, HS, frontH, bankH, mulberry, hash, fbm, sstep, lerp, QL, roomGroup, isTouch, update, junkIn: junkInFish,
  resetInput: () => { keys.left = keys.right = keys.jump = keys.block = keys.hook = keys.down = false; blockLatch = false; jumpQ = 0; hookInput(false); mouseL = mouseR = mouseM = false; } }) : null;
/* ---------- top-down paper map + deep dive (topworld.js): its own scene layers; these are the only hooks ---------- */
const TW = window.MudTopWorld && renderer ? window.MudTopWorld({ THREE, G, renderer, scene, camera, cv, pl, buddy, poseBuddy, hold, VT: () => VT, sfx: (...a) => sfx(...a), reg,
  X, GY, HS, frontH, bankH, mulberry, hash, fbm, sstep, lerp, QL, roomGroup, isTouch, update, FW, mech, mechMat, genRoom, enterRoom, mkFlyer, hitFlyer, FL: TUNE.FLYER, HK, ROOMS, junkAdd: (k, s) => junkAdd(k, s), bagMax: WORK.BAG_MAX, enterOG, leaveOG, isOG,   /* the OG world: the map spot plays the side-scroller in its old look */
  resetInput: () => { keys.left = keys.right = keys.jump = keys.block = keys.hook = keys.down = false; blockLatch = false; jumpQ = 0; hookInput(false); mouseL = mouseR = mouseM = false; } }) : null;
if (FW && FW.test && FW.test.paths) wsPathX = i => { const m = FW.test.paths(); return m && m[i] !== undefined ? m[i] : null; };
/* ---------- loop ---------- */
let last = performance.now(), acc = 0;
function frame(now) {
  const dtr = Math.min(0.1, (now - last) / 1000); acc += dtr; last = now;
  while (acc >= STEP) { update(STEP); if (FW) FW.step(STEP); if (TW) TW.step(STEP); if (G.state === 'title') G.t += STEP; acc -= STEP; }
  noteEnd();
  render(dtr); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook (read/steer only; no network). Only exposed on localhost / 127.0.0.1, never on the live site.
const TEST_HOOK = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (TEST_HOOK) window.__jr = { G, keys, genWorld, update, render, kickInput, KICK: TUNE.KICK, HOOK_DOWN: TUNE.HOOK_DOWN, CREV: TUNE.CREV, CROC: TUNE.CROC, BITER: TUNE.BITER, TENT: TUNE.TENT, FORCE, crocs, crocPerch, crocSt, crocUpdate, fishInput, CROC_FISH, cf: () => G.cf, crevState,
  crevViews: () => view ? { fills: view.fills.length, biters: view.biters.length, tents: view.tents.length, bitersShown: view.biters.filter(b => b.h.root.visible).length, tentsShown: view.tents.filter(t => t.m.visible).length } : null, press(k, d) { if (k === 'block') { blockInput(d); return; } keys[k] = d; if (k === 'jump' && d) jumpQ = 0.12; },
  fingerprint(seed) { return JSON.stringify(genWorld(seed).rooms); }, startRun, setSeed, ROOMS, TREASURES, GY, enterRoom, hurtBoss, isLocked, nextBoss, BOSS_ROOMS, BOSS_DEF, vol: () => vol, setVol, cycleVol: () => toggleMute(), sfxGain: () => sfxLastGain, VOL_GAIN, VOL_ORDER, ITEMS, dropItem, mobDied, itemViewsShown: () => itemViews.filter(v => v.visible).length, FLYER: TUNE.FLYER, spawnFlyers, mkFlyer,
  flyerViewsShown: () => { let n = 0; for (const k in flyViews) flyViews[k].forEach(v => { if (v.root.visible) n++; }); return n; }, dropViewsShown: () => dropViews.filter(m => m.visible).length,
  setQuality, quality: () => QL().name, harm, HOOK: HK, hookInput, hookView: hookV, hookAim: () => G.p && hookAim(G.p, G.world.rooms[G.room], G.rs),
  hook: () => { const p = G.p, h = p && p.hook; return { out: !!h, cd: p ? p.hookCd : 0, glow: hookGlow.visible ? +hookGlowM.opacity.toFixed(3) : 0, backs: G.hookBacks || 0, shots: G.hookShots || 0, no: G.hookNo || 0, zips: G.hookZips || 0, h: h ? { ph: h.ph, kind: h.kind, tx: h.tx, ty: h.ty, hx: h.hx, hy: h.hy, held: h.held, L: h.L, slack: !!h.slack } : null,
    rope: hookV.rope.visible, head: hookV.head.visible, vis: { ph: hookV.ph, slack: +hookV.slack.toFixed(3), wave: +hookV.wA.toFixed(3), snap: +hookV.snap.toFixed(3), spin: +hookV.spinV.toFixed(2), impacts: hookV.impacts, snaps: hookV.snaps, maxSag: +hookV.maxSag.toFixed(3), ropeTris: gRope.index.count / 3, headTris: gHookHead.attributes.position.count / 3, hand: _hA.toArray().map(v => +v.toFixed(2)), headAt: hookV.head.position.toArray().map(v => +v.toFixed(2)), hero: pl.root.visible ? pl.root.position.toArray().map(v => +v.toFixed(2)) : null, heroScale: +pl.root.scale.x.toFixed(3), cam: camera.position.toArray().map(v => +v.toFixed(2)) } }; }, BEST_KEY, STAM_MAX, TUNE, setBlockMode, blockMode: () => blockMode, wantBlock, blockReady: () => !!(G.p && blockReady(G.p)),
  shieldView: () => { const w = shield.root.getWorldPosition(new THREE.Vector3()); return { parent: shield.root.parent === pl.bod ? 'hero' : 'ground', visible: shield.root.visible, e: pl.shE || 0, x: w.x, y: w.y, z: w.z, heroX: G.p ? X(G.p.x) : null, glow: shield.glowM.emissiveIntensity, halo: shield.haloM.opacity }; },
  buddy: () => { let meshes = 0; buddy.root.traverse(o => { if (o.isMesh) meshes++; }); const j = buddy.j;
    return { on: buddy.on, visible: buddy.root.visible, x: buddy.root.position.x, y: buddy.root.position.y, face: buddy.face, heroX: G.p ? X(G.p.x) : null,
      is3d: !!buddy.mesh.isMesh && !!buddy.mesh.geometry.attributes.aBone, meshes, joints: buddy.J.length, tris: buddy.tris, mainTris: buddy.mesh.geometry.index.count / 3, h: buddy.root.scale.y,
      legL: j.legL.rotation.z, legR: j.legR.rotation.z, armL: j.armL.rotation.z, head: j.head.rotation.y, lids: j.lids.rotation.z, prev: buddy.prev }; },
  buddyPrev(m) { buddy.prev = m || null; return buddy.prev; }, rideInput, CUT, cutClick, TM, MG_IDS, tInput, tKey, mgKey, mgNew: id => mgNew(id), tDragStart, tDragTo, tDragEnd, tPick, crawlScreen, crawlLen, tSkipIn() { if (G.freeze === 't') G.tm.t = Math.max(G.tm.t, TM.IN); },
  tmPaid: () => ({ paid: { ...(G.tmPaid || {}) }, got: G.tmGot || 0 }), tReward, TM_REWARD, tm: () => { const m = G.tm; return m ? { freeze: G.freeze, t: m.t, leave: m.leave, lt: m.lt, mode: m.mode, score: m.score.slice(), drags: m.drags, said: m.said, say: Object.fromEntries(Object.entries(m.say).map(([k, v]) => [k, v.text])), games: m.games, done: !!m.done, game: m.mg ? m.mg.id : null, mg: m.mg ? { ...m.mg } : null, react: m.react, hatch: hatchA, budScale: buddy.root.scale.y, budPos: buddy.root.position.toArray(), card: tUI.on, cardW: tUI.c.width } : { freeze: G.freeze }; }, cutSkip() { if (G.freeze === 'cut') { G.cut.t = CUT.CLOSE; freezeStep(0); } },
  cut: () => { const c = G.cut; return { freeze: G.freeze, t: c ? c.t : 0, sp: c ? c.sp : 0, clicks: c ? c.clicks : 0, n: c ? c.n : 0, ph: c ? cutPhase(c.t) : null, done: !!(c && c.done), ease: G.ease, WT,
    hatch: +hatchA.toFixed(3), hole: pl.hole.visible, junk: junk.P.filter(P => P.on).length, junkVis: junk.m.visible, bottle: cutProps.bottle.visible, cookie: cutProps.cookie.visible, milk: cutProps.milk.visible,
    scale: buddy.root.scale.y, mech: mech.mode, fade: +(cutUI.fade.style.opacity || 0), bars: cutUI.bars.className === 'on', bub: [...bubM.entries()].filter(([k, e]) => e.shown).map(([k, e]) => k + ':' + e.text) }; },
  budScreen: () => { const r = cv.getBoundingClientRect(), v = buddy.root.position.clone(); v.y += buddy.root.scale.y * .5; v.project(camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
  bud: () => ({ ride: G.bud.ride, n: G.bud.n, no: G.bud.no, rk: buddy.rk || 0, inDome: buddy.root.parent === pl.head, mound: !!(buddy.mound && buddy.mound.visible), tgt: rideV.tgt, look: +rideV.look.toFixed(2), wave: rideV.wave > 0, duck: +rideV.duck.toFixed(2) }), photo(o) { photoCam = o || null; },
  mats: () => ({ all: allMats.size, cached: Object.keys(matCache).length }), mem: () => { let objs = 0; scene.traverse(() => objs++); return { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, objs }; }, endLockMs: END_LOCK,
  SUPER: TUNE.SUPER, superInput, superReady: () => superReady(G.p), supReset: () => { G.sup = supNew(); }, heroH: () => heroH(), superH: () => SUPER_H(),
  sup: () => { const s = G.sup; return { on: s.on, ph: s.ph, t: s.t, idleT: s.idleT, meter: s.meter, bx: s.bx, face: s.face, uses: s.uses, no: s.no, nrT: s.nrT, swings: s.swings, tgt: s.tgt, st: s.st, log: s.log }; },
  superView: () => ({ col: '#' + buddyMat.color.getHexString(), k: supV.k, scale: buddy.root.scale.y, visible: buddy.root.visible, x: buddy.root.position.x, aura: supV.aura.visible, ring: supV.ring.visible, rimK: buddyMat.userData.U.uRimK.value, self: buddyMat.userData.U.uSelf.value, rim: '#' + buddyMat.userData.U.uRimC.value.getHexString(), auraOp: supAuraM.opacity, mech: { mode: mech.mode, visible: mech.mesh.visible, pieces: mech.P.length, snapped: mech.P.filter(P => P.snapped).length } }),
  TUG: TUNE.TUG, tugMode: m => m ? setTugMode(m) : tugMode, tugOn, tKeyUp, tugPlace: () => G.p && tugPlace(G.p, G.world.rooms[G.room]), tugSurf: x => tugSurf(G.world.rooms[G.room], x),
  tugSet(o) { const g = G.tm && G.tm.mg; if (!g || !g.phys) return false; if (o.px != null) { g.a.x = g.a.x0 = o.px; G.p.x = o.px; } if (o.bx != null) g.b.x = g.b.x0 = o.bx; g.dir = g.b.x > g.a.x ? 1 : -1; g.line = g.a.x + (g.b.x - g.a.x) * TUNE.TUG.LINE; G.p.face = g.dir; if (o.aiOff != null) g.aiOff = !!o.aiOff; return true; },
  tug: () => { const m = G.tm, g = m && m.mg; if (!g || !(g.id === 'tug' || g.id === 'tugCard')) return null; const bd = B => B && { x: +B.x.toFixed(2), x0: B.x0, y: +B.y.toFixed(2), vx: +B.vx.toFixed(2), ground: B.ground, off: B.off, stam: +B.stam.toFixed(1), st: B.st, surf: B.surf, slide: B.slide, yankCd: B.yankCd };
    return { id: g.id, phys: !!g.phys, fin: !!g.fin, why: g.why, ph: g.ph, t: g.t, win: g.win, mode: g.mode, hooked: !!g.hooked, L0: g.L0, T: g.T, s: g.s, maxT: g.maxT, pop: g.pop, line: g.line, dir: g.dir, a: bd(g.a), b: bd(g.b), log: g.log, aiOff: !!g.aiOff, ai: g.aist && g.aist.st,
      p: G.p ? { x: G.p.x, y: G.p.y, face: G.p.face, hook: G.p.hook ? G.p.hook.ph : null } : null, strip: !!tUI.strip, tu: tV.tu, budPos: buddy.root.position.toArray(), budScale: buddy.root.scale.y }; },
  backdrop: () => ({ layers: bd.layers.map(L => ({ name: L.name, z: L.z, k: L.k, x: +L.g.position.x.toFixed(3), visible: L.g.visible, card: L.card.visible, code: L.code.length })), n: bd.n, camX: +cam.x.toFixed(3), t: +bd.t.toFixed(3),
    bird0: bd.birds[0] ? { x: +bd.birds[0].x.toFixed(3) } : null, cr0: bd.crs[0] ? { x: +bd.crs[0].x.toFixed(3) } : null, wing0: bd.bWing ? (() => { const m = new THREE.Matrix4(), e = new THREE.Euler(); bd.bWing.getMatrixAt(0, m); e.setFromRotationMatrix(m); return +e.x.toFixed(3); })() : null,
    leg0: bd.legs ? (() => { const m = new THREE.Matrix4(), e = new THREE.Euler(); bd.legs.getMatrixAt(0, m); e.setFromRotationMatrix(m); return +e.z.toFixed(3); })() : null, rootVisible: bd.root.visible }),
  backdropShow(v) { bd.root.visible = !!v; }, setBackdropArt, backdropUpdate, cam,
  plates: () => ({ og: FP.og, steam: FP.steam, log: FP.steamLog.slice(), list: FP.meshes.map(P => { const T = FP.tex[P.L.name], m = P.mesh.material; return { name: P.L.name, screen: !!P.L.screen, visible: P.mesh.visible, tier: T ? T.tier : null, w: T ? T.w : 0, h: T ? T.h : 0, map: !!m.map, z: P.L.z, k: P.L.k, gx: +P.g.position.x.toFixed(3), off: T ? +T.t.offset.x.toFixed(5) : 0, rep: T ? +T.t.repeat.x.toFixed(4) : 0, wpl: +P.wpl.toFixed(3), lay: P.lay, sx: +P.mesh.scale.x.toFixed(3), sy: +P.mesh.scale.y.toFixed(3), py: +P.mesh.position.y.toFixed(3), a: m.userData.U.uA.value }; }), code: bd.layers.map(L => L.code.map(o => o.visible)) }), setOgWorld, enterOG, leaveOG, isOG, crocSkin: () => ({ og: crocOG, map: CROC_MAT.skin.map && CROC_MAT.skin.map.image ? CROC_MAT.skin.map.image.width : 0, drawn: !!CROC_MAT.skin.userData.drawn }), plateImage: n => FP.tex[n] ? FP.tex[n].t.image : null, fill: () => ({ on: !!(FP.fill && FP.fill.visible), box: FP_FILL, hill: { x0: -22, x1: 54, z1: -44 } }), fillY: (x, z) => fpFillY(x, z),
  fpProbe: () => {   // screen y (0 top .. 1 bottom) and x of everything the player must see: hero feet/head, buddy, mobs, flyers, gem, vine ends, the hook's target
    const out = [], v = new THREE.Vector3(), pt = (tag, x, y, z) => { v.set(x, y, z).project(camera); out.push([tag, +((1 - v.y) / 2).toFixed(4), +((v.x + 1) / 2).toFixed(4)]); }, wp = (tag, o) => { o.getWorldPosition(v); pt(tag, v.x, v.y, v.z); };
    const p = G.p; if (p) { pt('feet', X(p.x), Y(p.y), 0); pt('head', X(p.x), Y(p.y) + heroH(), 0); const a = G.rs && G.world && hookAim(p, G.world.rooms[G.room], G.rs); if (a) pt('hook', X(a.x), Y(a.y), 0); }
    if (buddy.root.visible) wp('buddy', buddy.root);
    if (view) { view.crawlers.forEach(c => { if (c.root.visible) wp('crawler', c.root); }); view.vines.forEach(e => wp('vine', e.knob)); if (view.gem && view.gem.root.visible) wp('gem', view.gem.root); }
    for (const k in flyViews) flyViews[k].forEach(f => { if (f.root.visible) wp('flyer', f.root); });
    const fr = FP.meshes.find(P => P.L.name === 'front' && P.mesh.visible); let frontTop = null; if (fr && p) { v.set(X(p.x), fr.lay.y0 + fr.lay.h * fr.lay.top, fr.L.z).project(camera); frontTop = +((1 - v.y) / 2).toFixed(4); }
    return { pts: out, frontTop, bands: FP.meshes.filter(P => P.L.screen && P.mesh.visible).map(P => ({ name: P.L.name, band: P.lay.band })) }; },
  fish: FW ? FW.test : null,
  ws: { WORK, JUNK, MAT, BLUEPRINTS, matTags, junkAdd, junkInFish, junkGen, wsOpen, wsPickBp, wsPickJunk, wsFill, wsTakeBack, wsTape, wsLeave, wsStep, caravanX, hookReach, supMax, bpResult, slotFits, wsNearCheck, patchShown: () => wsPatch.visible,
    junkShown: () => jkViews.filter(v => v.visible).length, caravan: () => !!(view && view.caravan), dom: () => ({ open: getComputedStyle(wsEl).display !== 'none', go: getComputedStyle(wsGo).display !== 'none', cards: wsEl.querySelectorAll('.card').length, slots: wsEl.querySelectorAll('.slot').length, jk: wsEl.querySelectorAll('.jk').length, tag: (wsEl.querySelector('.tag') || {}).textContent || '', hud: $('h-junk').textContent }),
    st: () => ({ bag: G.bag.slice(), junkIn: { ...G.junkIn }, gear: JSON.parse(JSON.stringify(G.gear)), ws: G.ws ? { ...G.ws, slots: G.ws.slots.slice() } : null, near: G.wsNear, spots: (G.jspots || []).map(j => ({ ...j })) }) },
  info: () => renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps, rev: THREE.REVISION, quality: QL().name } : null };
if (TEST_HOOK && TW) window.__jr.top = TW.test;   // top-down map test API (localhost only)
})();
