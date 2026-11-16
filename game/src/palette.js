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

// The depot is lit at dusk, so every surface is warm: tan aggregate underfoot, cream plaster and
// terracotta on the walls, sun-bleached timber and crate wood, one hot amber accent that only
// marks the objective. Cold survives only in shadow and in the enemy team's silhouette — nothing
// else in the yard is allowed to read as blue.
export const MATERIALS = {
  floor: '#8a7a63',
  floorAlt: '#6f6252',
  wall: '#c9b394',
  wallAlt: '#a8906f',
  timber: '#6b4b32',
  crate: '#a97f4e',
  metal: '#5c5a54',
  tank: '#7d7568',
  glass: '#9fb0b8',
  lamp: '#ffcf8a',
  siteA: '#e08a2c',
  siteB: '#b8562a',
  vanguard: '#f0d79a',
  cordon: '#7c93a8',
  blood: '#6d2a24',
};

export function color(name) {
  return PALETTE[name] ?? MATERIALS[name] ?? PALETTE.ink;
}
