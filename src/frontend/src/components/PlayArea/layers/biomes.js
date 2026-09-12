// Per-project backdrop biomes. The project record carries `biome` (see
// projectService PROJECT_BIOMES); this table turns it into soft palette
// values for BackdropLayer. Unknown ids fall back to oasis.
export const BIOME_META = [
  { id: 'oasis', label: 'Oasis Meadow', blurb: 'soft mint pools' },
  { id: 'grassland', label: 'Grassland', blurb: 'rolling green' },
  { id: 'snowy', label: 'Snowfield', blurb: 'quiet white' },
  { id: 'urban', label: 'Town Plaza', blurb: 'warm cobbles' },
  { id: 'ember', label: 'Ember Caldera', blurb: 'dusky glow' },
  { id: 'twilight', label: 'Twilight Glen', blurb: 'lavender dusk' }
];

const OASIS = {
  sky: '#FFF8DC',
  washes: [
    { cx: 150, cy: 620, rx: 150, ry: 330, fill: '#F2C18D', opacity: 0.45 },
    { cx: 240, cy: 300, rx: 90, ry: 130, fill: '#F9DDBB', opacity: 0.7 },
    { cx: 1180, cy: 800, rx: 420, ry: 220, fill: '#A8DDBB', opacity: 0.5 },
    { cx: 900, cy: 880, rx: 330, ry: 120, fill: '#F2C18D', opacity: 0.35 },
    { cx: 1250, cy: 250, rx: 200, ry: 110, fill: '#F9DDBB', opacity: 0.55 }
  ],
  hills: [
    { cx: 400, cy: 1010, rx: 550, ry: 190, fill: '#D6F0DE' },
    { cx: 1200, cy: 1020, rx: 600, ry: 210, fill: '#C9E8D2' }
  ],
  path: '#E8D9A8',
  pathDash: '#D9C48F',
  water: { kind: 'pond', base: '#BFE0E8', ring: '#8AB8C2', hi: '#D8EFF2' },
  clouds: '#FFFDF4',
  flora: ['#C98F5A', '#7FB894'],
  snow: false
};

export const BACKDROPS = {
  oasis: OASIS,
  grassland: {
    ...OASIS,
    sky: '#F8F3D2',
    washes: [
      { cx: 180, cy: 600, rx: 160, ry: 320, fill: '#CDE8B0', opacity: 0.5 },
      { cx: 300, cy: 260, rx: 100, ry: 130, fill: '#F2E8C0', opacity: 0.7 },
      { cx: 1150, cy: 800, rx: 430, ry: 220, fill: '#A9D6A5', opacity: 0.55 },
      { cx: 880, cy: 880, rx: 330, ry: 120, fill: '#CDE8B0', opacity: 0.4 },
      { cx: 1300, cy: 240, rx: 190, ry: 110, fill: '#F2E8C0', opacity: 0.55 }
    ],
    hills: [
      { cx: 400, cy: 1010, rx: 550, ry: 190, fill: '#BCDFB2' },
      { cx: 1200, cy: 1020, rx: 600, ry: 210, fill: '#A9D6A5' }
    ],
    path: '#E3D29A',
    pathDash: '#C9B37E',
    water: { kind: 'pond', base: '#AED8E2', ring: '#7FAEBC', hi: '#D2ECF1' },
    flora: ['#7BA85A', '#A8C86A']
  },
  snowy: {
    ...OASIS,
    sky: '#F2F5FA',
    washes: [
      { cx: 180, cy: 600, rx: 160, ry: 320, fill: '#DCE6F2', opacity: 0.55 },
      { cx: 300, cy: 260, rx: 100, ry: 130, fill: '#FFFFFF', opacity: 0.8 },
      { cx: 1150, cy: 800, rx: 430, ry: 220, fill: '#D8E2F0', opacity: 0.6 },
      { cx: 880, cy: 880, rx: 330, ry: 120, fill: '#E8EEF6', opacity: 0.5 },
      { cx: 1300, cy: 240, rx: 190, ry: 110, fill: '#FFFFFF', opacity: 0.6 }
    ],
    hills: [
      { cx: 400, cy: 1010, rx: 550, ry: 190, fill: '#E8EEF6' },
      { cx: 1200, cy: 1020, rx: 600, ry: 210, fill: '#D8E2F0' }
    ],
    path: '#E4E9F2',
    pathDash: '#B9C4D6',
    water: { kind: 'frozen', base: '#DCE9F5', ring: '#A9BCD4', hi: '#F2F7FC', crack: '#A9BCD4' },
    clouds: '#FFFFFF',
    flora: ['#B9C6DA', '#DCE6F2'],
    snow: true
  },
  urban: {
    ...OASIS,
    sky: '#F7ECD4',
    washes: [
      { cx: 180, cy: 600, rx: 160, ry: 320, fill: '#EAD9B8', opacity: 0.5 },
      { cx: 300, cy: 260, rx: 100, ry: 130, fill: '#F5E6C8', opacity: 0.7 },
      { cx: 1150, cy: 800, rx: 430, ry: 220, fill: '#DCC89E', opacity: 0.55 },
      { cx: 880, cy: 880, rx: 330, ry: 120, fill: '#EAD9B8', opacity: 0.4 },
      { cx: 1300, cy: 240, rx: 190, ry: 110, fill: '#F5E6C8', opacity: 0.55 }
    ],
    hills: [
      { cx: 400, cy: 1010, rx: 550, ry: 190, fill: '#E8D9B8' },
      { cx: 1200, cy: 1020, rx: 600, ry: 210, fill: '#DCC89E' }
    ],
    path: '#D9C294',
    pathDash: '#B89A68',
    water: { kind: 'fountain', base: '#BFE0E8', ring: '#8A9A8B', hi: '#DFF0F3', spout: '#8AB8C2' },
    flora: ['#D9A441', '#B87F2E']
  },
  ember: {
    ...OASIS,
    sky: '#F7DFD2',
    washes: [
      { cx: 180, cy: 600, rx: 160, ry: 320, fill: '#E8A87F', opacity: 0.45 },
      { cx: 300, cy: 260, rx: 100, ry: 130, fill: '#F2C9A8', opacity: 0.65 },
      { cx: 1150, cy: 800, rx: 430, ry: 220, fill: '#D89A7A', opacity: 0.5 },
      { cx: 880, cy: 880, rx: 330, ry: 120, fill: '#E8A87F', opacity: 0.35 },
      { cx: 1300, cy: 240, rx: 190, ry: 110, fill: '#F2C9A8', opacity: 0.5 }
    ],
    hills: [
      { cx: 400, cy: 1010, rx: 550, ry: 190, fill: '#D89A7A' },
      { cx: 1200, cy: 1020, rx: 600, ry: 210, fill: '#C98868' }
    ],
    path: '#D9B48F',
    pathDash: '#B98A5F',
    water: { kind: 'lava', base: '#E8845A', ring: '#8A5A3B', hi: '#F5B041' },
    clouds: '#F9E8DC',
    flora: ['#C9563C', '#E8845A']
  },
  twilight: {
    ...OASIS,
    sky: '#EDE6F5',
    washes: [
      { cx: 180, cy: 600, rx: 160, ry: 320, fill: '#CDBCE8', opacity: 0.45 },
      { cx: 300, cy: 260, rx: 100, ry: 130, fill: '#E4D9F5', opacity: 0.65 },
      { cx: 1150, cy: 800, rx: 430, ry: 220, fill: '#B3A2D4', opacity: 0.5 },
      { cx: 880, cy: 880, rx: 330, ry: 120, fill: '#CDBCE8', opacity: 0.35 },
      { cx: 1300, cy: 240, rx: 190, ry: 110, fill: '#E4D9F5', opacity: 0.5 }
    ],
    hills: [
      { cx: 400, cy: 1010, rx: 550, ry: 190, fill: '#C3B2E0' },
      { cx: 1200, cy: 1020, rx: 600, ry: 210, fill: '#B3A2D4' }
    ],
    path: '#D5C8E8',
    pathDash: '#A893C9',
    water: { kind: 'crystal', base: '#CDBCE8', ring: '#8A76B8', hi: '#E4D9F5', spark: '#FFFDF4' },
    clouds: '#F5EFFC',
    flora: ['#F2E8A8', '#C9B37E']
  }
};

export function backdropFor(biome) {
  return BACKDROPS[biome] || BACKDROPS.oasis;
}

export function biomeLabel(biome) {
  return BIOME_META.find((b) => b.id === biome)?.label || 'Oasis Meadow';
}
