/**
 * GOE Core — Terrain Types
 * Defines the built-in terrain palette. Consumers can extend this or pass
 * custom terrain registries to Engine.
 */

// ─── TYPE CONSTANTS ───────────────────────────────────────────────────────────

export const TerrainType = Object.freeze({
  DEEP_WATER:  0,
  WATER:       1,
  SHORE:       2,
  ROAD_TARMAC: 3,   // Standard asphalt
  ROAD_DIRT:   11,  // New: Earthen/Dirt
  ROAD_GRAVEL: 12,  // New: Loose stones
  PATH:        4,
  GRASS:       5,
  PARK:        6,
  FOREST:      7,
  BUILDING:    8,
  SAND:        9,
  RESIDENTIAL: 10,
  CUSTOM_BASE: 100, // Start user-defined types above this
});

// ─── COLOUR PALETTE — "Garden of Eden" ───────────────────────────────────────

export const TERRAIN_COLORS = {
  [TerrainType.DEEP_WATER]:  { top:'#225599', left:'#113366', right:'#184488', flat:'#1a4a88' },
  [TerrainType.WATER]:       { top:'#3388cc', left:'#2266aa', right:'#2a77bb', flat:'#2b7abf' },
  [TerrainType.SHORE]:       { top:'#44aadd', left:'#3388bb', right:'#3b99cc', flat:'#3c9ccd' },
  [TerrainType.ROAD_TARMAC]: { top:'#444444', left:'#222222', right:'#333333', flat:'#3d3d3d' },
  [TerrainType.ROAD_DIRT]:   { top:'#9b7653', left:'#7a5d41', right:'#8a694a', flat:'#916f4e' },
  [TerrainType.ROAD_GRAVEL]: { top:'#a0a0a0', left:'#707070', right:'#888888', flat:'#959595' },
  [TerrainType.PATH]:        { top:'#e8cd8e', left:'#c2a668', right:'#d5ba7b', flat:'#e0c686' },
  [TerrainType.GRASS]:       { top:'#66cc44', left:'#449922', right:'#55b333', flat:'#5bc23a' },
  [TerrainType.PARK]:        { top:'#88aa44', left:'#557722', right:'#668833', flat:'#779933' },
  [TerrainType.FOREST]:      { top:'#338822', left:'#1a5511', right:'#26771a', flat:'#2d821e' },
  [TerrainType.BUILDING]:    { top:'#d4ccb8', left:'#9a9890', right:'#aba698', flat:'#c4bcac' },
  [TerrainType.SAND]:        { top:'#e8cd8e', left:'#c2a668', right:'#d5ba7b', flat:'#e0c686' },
  [TerrainType.RESIDENTIAL]: { top:'#99aa99', left:'#667766', right:'#778877', flat:'#889988' },
};

// ─── HEIGHT TABLE (tile units) ────────────────────────────────────────────────

export const TERRAIN_HEIGHT = {
  [TerrainType.DEEP_WATER]:  0,
  [TerrainType.WATER]:       0,
  [TerrainType.SHORE]:       1,
  [TerrainType.ROAD]:        1,
  [TerrainType.PATH]:        0,
  [TerrainType.GRASS]:       4,
  [TerrainType.PARK]:        3,
  [TerrainType.FOREST]:      7,
  [TerrainType.BUILDING]:    18,
  [TerrainType.SAND]:        3,
  [TerrainType.RESIDENTIAL]: 3,
};

export const TERRAIN_NAMES = {
  [TerrainType.DEEP_WATER]:  'Deep Water',
  [TerrainType.WATER]:       'Water',
  [TerrainType.SHORE]:       'Shoreline',
  [TerrainType.PATH]:        'Pathway',
  [TerrainType.GRASS]:       'Open Ground',
  [TerrainType.PARK]:        'Park',
  [TerrainType.FOREST]:      'Forest',
  [TerrainType.BUILDING]:    'Building',
  [TerrainType.SAND]:        'Beach / Sand',
  [TerrainType.RESIDENTIAL]: 'Residential Area',
  [TerrainType.ROAD_TARMAC]: 'Paved Road',
  [TerrainType.ROAD_DIRT]:   'Earthen Road',
  [TerrainType.ROAD_GRAVEL]: 'Gravel Path',
};

/**
 * Create a mutable terrain registry — copy the defaults and allow overrides.
 * @param {object} [overrides]
 */
export function createTerrainRegistry(overrides = {}) {
  return {
    colors:  { ...TERRAIN_COLORS,  ...overrides.colors  },
    heights: { ...TERRAIN_HEIGHT,  ...overrides.heights },
    names:   { ...TERRAIN_NAMES,   ...overrides.names   },
    /**
     * Register a new custom terrain type.
     */
    register(id, { color, height = 4, name = 'Custom' }) {
      this.colors[id]  = color;
      this.heights[id] = height;
      this.names[id]   = name;
    },
  };
}