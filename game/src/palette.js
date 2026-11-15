// palette.js — the single source for Emberline's look: a dusk foundry yard,
// warm rust and furnace orange against cool steel and Ember teal.
// Every material in the game is built from these values so the scene reads
// as one chosen palette, never as default grey boxes.

export const PALETTE = {
  sky: 0x201812,          // dusk brown-black above the yard
  fog: 0x2c2015,
  ground: 0x453c31,       // worn concrete
  groundLine: 0x5a4f3e,   // painted yard markings
  wall: 0x71685a,         // perimeter blockwork
  rust: 0x9c552e,         // container rust
  rustDark: 0x7d4423,
  steel: 0x6d757f,        // silo and gantry steel
  steelDark: 0x4a5058,
  crate: 0x8a7748,        // wooden crates
  furnace: 0x2e2a26,      // furnace block
  emberGlow: 0xff7a26,    // furnace mouths, site light
  teamEmber: 0x2ec4b6,    // the player's squad
  teamEmberDark: 0x1a7a70,
  teamAsh: 0xe4572e,      // the defending squad
  teamAshDark: 0x93350f,
  skin: 0xc9a189,
  dark: 0x17181c,         // gunmetal, boots, visors
  siteA: 0xffb03a,
  siteB: 0x3ab0ff,
  lightWarm: 0xffc37a,
};

// makeMaterials builds the small shared set of MeshLambert materials once;
// modules ask for them by name instead of allocating their own per mesh.
export function makeMaterials(THREE) {
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  return {
    ground: lambert(PALETTE.ground),
    groundLine: lambert(PALETTE.groundLine),
    wall: lambert(PALETTE.wall),
    rust: lambert(PALETTE.rust),
    rustDark: lambert(PALETTE.rustDark),
    steel: lambert(PALETTE.steel),
    steelDark: lambert(PALETTE.steelDark),
    crate: lambert(PALETTE.crate),
    furnace: lambert(PALETTE.furnace),
    emberGlow: lambert(PALETTE.emberGlow, { emissive: PALETTE.emberGlow, emissiveIntensity: 0.9 }),
    ember: lambert(PALETTE.teamEmber),
    emberDark: lambert(PALETTE.teamEmberDark),
    ash: lambert(PALETTE.teamAsh),
    ashDark: lambert(PALETTE.teamAshDark),
    skin: lambert(PALETTE.skin),
    dark: lambert(PALETTE.dark),
    siteA: lambert(PALETTE.siteA, { emissive: PALETTE.siteA, emissiveIntensity: 0.55 }),
    siteB: lambert(PALETTE.siteB, { emissive: PALETTE.siteB, emissiveIntensity: 0.55 }),
  };
}
