// The look plan, in one place. Six interface values, then the surface swatches the map is
// painted with. Every colour in the game and in index.html comes from this file, so the map,
// the HUD and the panels cannot drift apart.
export const PALETTE = {
  canvas: '#101418',
  surface: '#1a1f26',
  hairline: '#2b323c',
  ink: '#eae6dc',
  muted: '#939ba6',
  accent: '#e8a33d',
};

// The map is a rail depot at dusk: cold concrete, warmer timber, and one hot accent that only
// marks the objective. Teams read as two temperatures, not two bright colours.
export const MATERIALS = {
  floor: '#3a3f47',
  floorAlt: '#333840',
  wall: '#4a5058',
  wallAlt: '#3f454d',
  timber: '#5b4a38',
  crate: '#6b563f',
  metal: '#59626d',
  tank: '#4e5a63',
  glass: '#7d8a94',
  lamp: '#f2d9a8',
  siteA: '#c98a3a',
  siteB: '#a8642f',
  vanguard: '#d9c48a',
  cordon: '#8fa2b8',
  blood: '#6d2a24',
};

export function color(name) {
  return PALETTE[name] ?? MATERIALS[name] ?? PALETTE.ink;
}
