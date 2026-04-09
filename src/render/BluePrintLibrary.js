export const Blueprints = {
  // ── Utilities ──────────────────────────────────────────────────────────────
  bench: [
    // Four legs — slimmer, more realistic
    { x: -3.2, y: 0, z: -1.6, w: 0.5, h: 2, d: 0.5, top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x:  2.7, y: 0, z: -1.6, w: 0.5, h: 2, d: 0.5, top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x: -3.2, y: 0, z:  1.1, w: 0.5, h: 2, d: 0.5, top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x:  2.7, y: 0, z:  1.1, w: 0.5, h: 2, d: 0.5, top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    // Seat — four slats
    { x: -3.4, y: 2,   z: -1.7, w: 6.8, h: 0.35, d: 0.55, top: '#A1887F', right: '#795548', front: '#8D6E63' },
    { x: -3.4, y: 2,   z: -0.9, w: 6.8, h: 0.35, d: 0.55, top: '#A1887F', right: '#795548', front: '#8D6E63' },
    { x: -3.4, y: 2,   z: -0.1, w: 6.8, h: 0.35, d: 0.55, top: '#A1887F', right: '#795548', front: '#8D6E63' },
    { x: -3.4, y: 2,   z:  0.7, w: 6.8, h: 0.35, d: 0.55, top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    // Backrest slats
    { x: -3.4, y: 2.4, z: -1.75, w: 6.8, h: 1.6, d: 0.35, top: '#8D6E63', right: '#5D4037', front: '#795548' },
    { x: -3.3, y: 2.5, z: -1.7,  w: 0.4, h: 1.5, d: 0.25, top: '#BCAAA4', right: '#A1887F', front: '#8D6E63' },
    { x:  2.9, y: 2.5, z: -1.7,  w: 0.4, h: 1.5, d: 0.25, top: '#BCAAA4', right: '#A1887F', front: '#8D6E63' },
  ],

  post_box: [
    { x: -2,   y: 0, z: -2,   w: 4, h: 0.8, d: 4, top: '#212121', right: '#111111', front: '#111111' }, // Base slab
    { x: -1.4, y: 0.8, z: -1.4, w: 2.8, h: 6.5, d: 2.8, top: '#C62828', right: '#B71C1C', front: '#D32F2F' }, // Body
    { x: -0.3, y: 1.8, z: -1.5, w: 0.6, h: 1.2, d: 0.3, top: '#880E0E', right: '#880E0E', front: '#880E0E' }, // Mail slot
    { x: -1.5, y: 7.3, z: -1.5, w: 3, h: 0.8, d: 3, top: '#EF5350', right: '#C62828', front: '#D32F2F' }, // Cap
    { x: -0.2, y: 7.3, z: -1.6, w: 0.4, h: 0.8, d: 0.2, top: '#EF5350', right: '#C62828', front: '#E53935' }, // Cap front lip
  ],

  telephone: [
    { x: -2,   y: 0,   z: -2,   w: 4, h: 0.5, d: 4, top: '#B71C1C', right: '#880E0E', front: '#C62828' }, // Base
    { x: -2,   y: 0.5, z: -2,   w: 4, h: 11.5, d: 4, top: '#C62828', right: '#B71C1C', front: '#D32F2F' }, // Frame
    { x: -1.6, y: 1.5, z: -2.1, w: 3.2, h: 8, d: 0.2, top: '#B3E5FC', right: '#81D4FA', front: '#81D4FA' }, // Glass panel
    { x: -1.4, y: 2,   z: -2.15,w: 2.8, h: 1.5, d: 0.2, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Directory shelf
    { x: -2,   y: 12,  z: -2,   w: 4, h: 0.8, d: 4, top: '#E53935', right: '#C62828', front: '#D32F2F' }, // Roof
  ],

  waste_basket: [
    { x: -1.2, y: 0,   z: -1.2, w: 2.4, h: 0.4, d: 2.4, top: '#388E3C', right: '#2E7D32', front: '#2E7D32' }, // Base
    { x: -1,   y: 0.4, z: -1,   w: 2,   h: 3,   d: 2,   top: '#43A047', right: '#388E3C', front: '#388E3C' }, // Body
    { x: -1.1, y: 3.4, z: -1.1, w: 2.2, h: 0.3, d: 2.2, top: '#66BB6A', right: '#43A047', front: '#43A047' }, // Rim
    { x: -0.8, y: 1.2, z: -1.1, w: 0.3, h: 1.8, d: 0.2, top: '#81C784', right: '#4CAF50', front: '#4CAF50' }, // Vent slot 1
    { x:  0.5, y: 1.2, z: -1.1, w: 0.3, h: 1.8, d: 0.2, top: '#81C784', right: '#4CAF50', front: '#4CAF50' }, // Vent slot 2
  ],

  recycling: [
    // Blue bin
    { x: -3.2, y: 0,   z: -1.2, w: 2.4, h: 0.4, d: 2.4, top: '#1565C0', right: '#0D47A1', front: '#0D47A1' },
    { x: -3,   y: 0.4, z: -1,   w: 2,   h: 3.5, d: 2,   top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x: -3.1, y: 3.9, z: -1.1, w: 2.2, h: 0.4, d: 2.2, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' },
    // Green bin
    { x:  0.8, y: 0,   z: -1.2, w: 2.4, h: 0.4, d: 2.4, top: '#2E7D32', right: '#1B5E20', front: '#1B5E20' },
    { x:  1,   y: 0.4, z: -1,   w: 2,   h: 3.5, d: 2,   top: '#43A047', right: '#388E3C', front: '#388E3C' },
    { x:  0.9, y: 3.9, z: -1.1, w: 2.2, h: 0.4, d: 2.2, top: '#66BB6A', right: '#43A047', front: '#43A047' },
  ],

  drinking_water: [
    { x: -1.8, y: 0,   z: -1.8, w: 3.6, h: 0.4, d: 3.6, top: '#BDBDBD', right: '#9E9E9E', front: '#9E9E9E' }, // Base slab
    { x: -1.2, y: 0.4, z: -1.2, w: 2.4, h: 3,   d: 2.4, top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' }, // Pedestal body
    { x: -1.4, y: 3.4, z: -1.4, w: 2.8, h: 0.6, d: 2.8, top: '#EEEEEE', right: '#E0E0E0', front: '#E0E0E0' }, // Top shelf
    { x: -0.4, y: 4,   z: -0.4, w: 0.8, h: 0.6, d: 0.8, top: '#4FC3F7', right: '#29B6F6', front: '#0288D1' }, // Spout/water
    { x: -0.2, y: 4.2, z: -0.5, w: 0.4, h: 0.2, d: 0.2, top: '#B0BEC5', right: '#78909C', front: '#90A4AE' }, // Spout nozzle
  ],

  toilets: [
    { x: -3.5, y: 0,   z: -2.5, w: 7,   h: 0.5, d: 5,   top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' }, // Foundation
    { x: -3.5, y: 0.5, z: -2.5, w: 7,   h: 6.5, d: 5,   top: '#ECEFF1', right: '#CFD8DC', front: '#E3E8EC' }, // Building
    { x: -3.5, y: 7,   z: -2.5, w: 7,   h: 0.8, d: 5,   top: '#B0BEC5', right: '#78909C', front: '#90A4AE' }, // Roof overhang
    { x: -2.8, y: 0.5, z:  2.5, w: 2.8, h: 5,   d: 0.3, top: '#1A237E', right: '#1A237E', front: '#283593' }, // Male door (blue)
    { x:  0,   y: 0.5, z:  2.5, w: 2.8, h: 5,   d: 0.3, top: '#880E4F', right: '#880E4F', front: '#AD1457' }, // Female door (pink)
    { x: -0.1, y: 3,   z:  2.8, w: 0.2, h: 1.5, d: 0.2, top: '#E0E0E0', right: '#BDBDBD', front: '#E0E0E0' }, // Door divider
    { x: -3,   y: 0.5, z: -2.5, w: 2,   h: 4,   d: 0.3, top: '#90A4AE', right: '#607D8B', front: '#78909C' }, // Side window
    { x:  1,   y: 0.5, z: -2.5, w: 2,   h: 4,   d: 0.3, top: '#90A4AE', right: '#607D8B', front: '#78909C' }, // Side window 2
  ],

  atm: [
    { x: -2.5, y: 0,   z: -1.5, w: 5,   h: 0.5, d: 3,   top: '#37474F', right: '#263238', front: '#37474F' }, // Base slab
    { x: -2.5, y: 0.5, z: -1.5, w: 5,   h: 6,   d: 3,   top: '#546E7A', right: '#37474F', front: '#455A64' }, // Machine body
    { x: -2,   y: 2.5, z:  1.5, w: 4,   h: 2.5, d: 0.3, top: '#1A237E', right: '#1565C0', front: '#1976D2' }, // Screen
    { x: -1.5, y: 1.5, z:  1.5, w: 3,   h: 0.8, d: 0.2, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Card slot
    { x: -1,   y: 0.8, z:  1.5, w: 2,   h: 0.4, d: 0.2, top: '#607D8B', right: '#455A64', front: '#546E7A' }, // Cash slot
    { x: -2.5, y: 6.5, z: -1.5, w: 5,   h: 0.5, d: 3,   top: '#455A64', right: '#263238', front: '#37474F' }, // Roof
  ],

  // ── Food & Drink ───────────────────────────────────────────────────────────
  cafe: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Foundation
    { x: -5,   y: 0.8, z: -5,   w: 10,  h: 7,   d: 10,  top: '#FFF9C4', right: '#F0E68C', front: '#FFFDE7' }, // Walls
    { x: -3,   y: 0.8, z:  5,   w: 6,   h: 5.5, d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front windows
    { x: -1.5, y: 0.8, z:  5,   w: 3,   h: 6,   d: 0.4, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Door frame
    { x: -6,   y: 7.8, z: -6,   w: 12,  h: 0.5, d: 4,   top: '#C8A96E', right: '#9E7A45', front: '#B89050' }, // Awning
    { x: -6,   y: 7.3, z: -6,   w: 0.5, h: 1,   d: 1,   top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Awning post L
    { x:  5.5, y: 7.3, z: -6,   w: 0.5, h: 1,   d: 1,   top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Awning post R
    // Outdoor seating
    { x:  6,   y: 0,   z:  3,   w: 3,   h: 0.3, d: 3,   top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Table top
    { x:  6.3, y: -0.3,z:  3.3, w: 0.4, h: 0.3, d: 0.4, top: '#5D4037', right: '#4E342E', front: '#6D4C41' }, // Table leg 1
    { x:  8.3, y: -0.3,z:  3.3, w: 0.4, h: 0.3, d: 0.4, top: '#5D4037', right: '#4E342E', front: '#6D4C41' }, // Table leg 2
    { x:  6.3, y: -0.3,z:  5.3, w: 0.4, h: 0.3, d: 0.4, top: '#5D4037', right: '#4E342E', front: '#6D4C41' }, // Table leg 3
    { x:  8.3, y: -0.3,z:  5.3, w: 0.4, h: 0.3, d: 0.4, top: '#5D4037', right: '#4E342E', front: '#6D4C41' }, // Table leg 4
    { x: -5,   y: 7.8, z: -5,   w: 10,  h: 0.8, d: 10,  top: '#E8D5A3', right: '#C8B58A', front: '#D8C898' }, // Roof
  ],

  restaurant: [
    { x: -7,   y: 0,   z: -6,   w: 14,  h: 1,   d: 12,  top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Foundation
    { x: -7,   y: 1,   z: -6,   w: 14,  h: 8,   d: 12,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' }, // Main walls
    { x: -5,   y: 1,   z:  6,   w: 10,  h: 6.5, d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front glass
    { x: -2,   y: 1,   z:  6,   w: 4,   h: 7,   d: 0.4, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Door frame
    { x: -8,   y: 8,   z: -7,   w: 16,  h: 1,   d: 3,   top: '#C62828', right: '#B71C1C', front: '#D32F2F' }, // Red awning
    { x: -7,   y: 7,   z: -7,   w: 1,   h: 1.5, d: 1.5, top: '#B71C1C', right: '#880E0E', front: '#C62828' }, // Awning post L
    { x:  6,   y: 7,   z: -7,   w: 1,   h: 1.5, d: 1.5, top: '#B71C1C', right: '#880E0E', front: '#C62828' }, // Awning post R
    { x: -3,   y: 7,   z:  6,   w: 6,   h: 1.5, d: 0.5, top: '#FFCC00', right: '#CC9900', front: '#E5B800' }, // Sign board
    { x: -7,   y: 9,   z: -6,   w: 14,  h: 1,   d: 12,  top: '#BDBDBD', right: '#9E9E9E', front: '#BDBDBD' }, // Roof
  ],

  fast_food: [
    { x: -6,   y: 0,   z: -6,   w: 12,  h: 1,   d: 12,  top: '#757575', right: '#424242', front: '#616161' }, // Foundation
    { x: -6,   y: 1,   z: -6,   w: 12,  h: 6,   d: 12,  top: '#FAFAFA', right: '#E0E0E0', front: '#F5F5F5' }, // Walls
    { x: -4,   y: 1,   z:  6,   w: 8,   h: 5,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front glass
    { x: -2,   y: 1,   z:  6,   w: 4,   h: 5.5, d: 0.4, top: '#616161', right: '#424242', front: '#757575' }, // Door frame
    { x: -6,   y: 7,   z: -6,   w: 12,  h: 0.8, d: 12,  top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' }, // Flat roof
    { x: -1.5, y: 7.8, z: -1.5, w: 3,   h: 5,   d: 3,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Yellow pylon
    { x: -2.5, y: 12.8,z: -2.5, w: 5,   h: 0.8, d: 5,   top: '#F57F17', right: '#E65100', front: '#FF8F00' }, // Sign cap
    { x: -7,   y: 0,   z:  3,   w: 7,   h: 0.2, d: 10,  top: '#555555', right: '#333333', front: '#444444' }, // Drive-thru lane
  ],

  bar: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 1,   d: 10,  top: '#3E2723', right: '#1A0A00', front: '#2A1200' }, // Foundation
    { x: -5,   y: 1,   z: -5,   w: 10,  h: 7,   d: 10,  top: '#4E342E', right: '#2A1200', front: '#3E2723' }, // Dark brick walls
    { x: -3,   y: 1,   z:  5,   w: 6,   h: 5,   d: 0.3, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Windows (frosted)
    { x: -1.5, y: 1,   z:  5,   w: 3,   h: 6,   d: 0.4, top: '#1A0A00', right: '#0A0000', front: '#2A1200' }, // Dark door
    { x: -3,   y: 6.5, z:  5,   w: 6,   h: 1.5, d: 0.5, top: '#FF8F00', right: '#E65100', front: '#FF6F00' }, // Neon sign slab
    { x: -5,   y: 8,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#3E2723', right: '#1A0A00', front: '#2A1200' }, // Roof
    { x:  5,   y: 2,   z: -2,   w: 1.5, h: 6,   d: 1.5, top: '#4E342E', right: '#3E2723', front: '#3E2723' }, // Side chimney
  ],

  pub: [
    { x: -6,   y: 0,   z: -5,   w: 12,  h: 1,   d: 10,  top: '#795548', right: '#4E342E', front: '#5D4037' }, // Foundation
    { x: -6,   y: 1,   z: -5,   w: 12,  h: 8,   d: 10,  top: '#6D4C41', right: '#3E2723', front: '#5D4037' }, // Stone walls
    { x: -4,   y: 2,   z:  5,   w: 4,   h: 5,   d: 0.3, top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' }, // Windows
    { x:  0,   y: 2,   z:  5,   w: 4,   h: 5,   d: 0.3, top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' }, // Windows 2
    { x: -2,   y: 1,   z:  5,   w: 4,   h: 7,   d: 0.5, top: '#2A1200', right: '#1A0A00', front: '#3E2723' }, // Pub door
    { x: -7,   y: 9,   z: -6,   w: 14,  h: 2,   d: 12,  top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Pitched roof base
    { x: -3,   y: 7,   z:  5,   w: 6,   h: 2,   d: 0.5, top: '#8B6914', right: '#6A5010', front: '#AA8020' }, // Pub sign
    { x:  4,   y: 1,   z: -5,   w: 2,   h: 10,  d: 2,   top: '#546E7A', right: '#37474F', front: '#455A64' }, // Chimney
  ],

  food_court: [
    { x: -9,   y: 0,   z: -9,   w: 18,  h: 1,   d: 18,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Slab
    { x: -9,   y: 1,   z: -9,   w: 18,  h: 6,   d: 18,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' }, // Hall walls
    { x: -5,   y: 7,   z: -5,   w: 10,  h: 3,   d: 10,  top: '#CC8822', right: '#AA6611', front: '#BB771A' }, // Raised centre roof
    { x: -9,   y: 7,   z: -9,   w: 18,  h: 1,   d: 18,  top: '#CFCFCF', right: '#AFAFAF', front: '#BFBFBF' }, // Flat roof
    { x: -8,   y: 1,   z:  9,   w: 16,  h: 5,   d: 0.5, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front glass wall
    { x: -3,   y: 1,   z:  9,   w: 6,   h: 6,   d: 0.6, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Entry doors
    { x: -4,   y: 3,   z:  0,   w: 3,   h: 2,   d: 3,   top: '#EF9A9A', right: '#E53935', front: '#EF5350' }, // Food stall 1
    { x:  1,   y: 3,   z:  0,   w: 3,   h: 2,   d: 3,   top: '#80CBC4', right: '#00897B', front: '#26A69A' }, // Food stall 2
  ],

  ice_cream: [
    { x: -2.5, y: 0,   z: -2.5, w: 5,   h: 0.5, d: 5,   top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' }, // Base
    { x: -2.5, y: 0.5, z: -2.5, w: 5,   h: 3.5, d: 5,   top: '#FFFFFF', right: '#EEEEEE', front: '#F5F5F5' }, // Stand
    { x: -3.5, y: 4,   z: -3.5, w: 7,   h: 0.8, d: 7,   top: '#F48FB1', right: '#E91E63', front: '#EC407A' }, // Pink canopy
    { x: -3.5, y: 3,   z: -3.5, w: 0.5, h: 1,   d: 0.5, top: '#F8BBD0', right: '#F48FB1', front: '#F48FB1' }, // Canopy post TL
    { x:  3,   y: 3,   z: -3.5, w: 0.5, h: 1,   d: 0.5, top: '#F8BBD0', right: '#F48FB1', front: '#F48FB1' }, // Canopy post TR
    { x: -3.5, y: 3,   z:  3,   w: 0.5, h: 1,   d: 0.5, top: '#F8BBD0', right: '#F48FB1', front: '#F48FB1' }, // Canopy post BL
    { x:  3,   y: 3,   z:  3,   w: 0.5, h: 1,   d: 0.5, top: '#F8BBD0', right: '#F48FB1', front: '#F48FB1' }, // Canopy post BR
    // Scoops on display
    { x: -1.5, y: 3.6, z: -1,   w: 1.2, h: 1.2, d: 1.2, top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Scoop 1
    { x:  0.3, y: 3.6, z: -1,   w: 1.2, h: 1.2, d: 1.2, top: '#EF9A9A', right: '#E53935', front: '#EF5350' }, // Scoop 2
  ],

  // ── Health ─────────────────────────────────────────────────────────────────
  hospital: [
    // Foundation
    { x: -8,   y: 0,   z: -8,   w: 16,  h: 1,   d: 16,  top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    // Main block
    { x: -7,   y: 1,   z: -7,   w: 14,  h: 11,  d: 14,  top: '#FAFAFA', right: '#E0E0E0', front: '#F5F5F5' },
    // Left wing
    { x: -10,  y: 1,   z: -4,   w: 3,   h: 8,   d: 8,   top: '#FAFAFA', right: '#E0E0E0', front: '#F5F5F5' },
    // Right wing
    { x:  7,   y: 1,   z: -4,   w: 3,   h: 8,   d: 8,   top: '#FAFAFA', right: '#E0E0E0', front: '#F5F5F5' },
    // Window strips — front face
    { x: -6,   y: 2,   z:  7,   w: 12,  h: 8,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    // Red cross — vertical
    { x: -1,   y: 5,   z:  7.4, w: 2,   h: 7,   d: 0.4, top: '#E53935', right: '#C62828', front: '#D32F2F' },
    // Red cross — horizontal
    { x: -3.5, y: 7,   z:  7.4, w: 7,   h: 2,   d: 0.4, top: '#E53935', right: '#C62828', front: '#D32F2F' },
    // Canopy over entrance
    { x: -3,   y: 3.5, z:  7,   w: 6,   h: 0.5, d: 2,   top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    // Entry doors
    { x: -1.5, y: 1,   z:  7,   w: 3,   h: 4,   d: 0.4, top: '#546E7A', right: '#37474F', front: '#455A64' },
    // Roof
    { x: -7,   y: 12,  z: -7,   w: 14,  h: 1,   d: 14,  top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    // Rooftop unit
    { x: -2,   y: 13,  z: -2,   w: 4,   h: 2,   d: 4,   top: '#B0BEC5', right: '#78909C', front: '#90A4AE' },
  ],

  doctors: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#B0BEC5', right: '#78909C', front: '#90A4AE' },
    { x: -5,   y: 0.8, z: -5,   w: 10,  h: 7,   d: 10,  top: '#ECEFF1', right: '#CFD8DC', front: '#E3E8EC' },
    { x: -3.5, y: 0.8, z:  5,   w: 7,   h: 5.5, d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -1.5, y: 0.8, z:  5,   w: 3,   h: 6,   d: 0.4, top: '#78909C', right: '#546E7A', front: '#607D8B' },
    { x: -5,   y: 7.8, z: -5,   w: 10,  h: 0.8, d: 10,  top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    { x: -3,   y: 7.8, z: -2,   w: 6,   h: 1,   d: 3,   top: '#1565C0', right: '#0D47A1', front: '#1976D2' }, // Blue sign
    { x: -1,   y: 7.8, z: -1,   w: 0.3, h: 2,   d: 0.3, top: '#FFFFFF', right: '#E0E0E0', front: '#EEEEEE' }, // Cross V
    { x: -1.3, y: 8.6, z: -1,   w: 0.9, h: 0.3, d: 0.3, top: '#FFFFFF', right: '#E0E0E0', front: '#EEEEEE' }, // Cross H
  ],

  dentist: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 0.8, d: 8,   top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    { x: -4,   y: 0.8, z: -4,   w: 8,   h: 7,   d: 8,   top: '#FFFFFF', right: '#EEEEEE', front: '#F5F5F5' },
    { x: -3,   y: 0.8, z:  4,   w: 6,   h: 5.5, d: 0.3, top: '#E3F2FD', right: '#90CAF9', front: '#BBDEFB' },
    { x: -1.5, y: 0.8, z:  4,   w: 3,   h: 6,   d: 0.4, top: '#546E7A', right: '#37474F', front: '#455A64' },
    { x: -4,   y: 7.8, z: -4,   w: 8,   h: 0.8, d: 8,   top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    // Tooth sculpture on roof
    { x: -1,   y: 8.6, z: -2,   w: 2,   h: 2.5, d: 2,   top: '#FAFAFA', right: '#E0E0E0', front: '#EEEEEE' }, // Tooth body
    { x: -0.8, y: 8.6, z: -2,   w: 0.5, h: 1,   d: 0.5, top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' }, // Root 1
    { x:  0.3, y: 8.6, z: -2,   w: 0.5, h: 1,   d: 0.5, top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' }, // Root 2
    // Sign plate
    { x: -1.5, y: 3,   z:  4.1, w: 3,   h: 2,   d: 0.2, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
  ],

  pharmacy: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 0.8, d: 8,   top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    { x: -4,   y: 0.8, z: -4,   w: 8,   h: 6,   d: 8,   top: '#FFFFFF', right: '#EEEEEE', front: '#F5F5F5' },
    { x: -3,   y: 0.8, z:  4,   w: 6,   h: 5,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Window
    { x: -1.5, y: 0.8, z:  4,   w: 3,   h: 5.5, d: 0.4, top: '#546E7A', right: '#37474F', front: '#455A64' }, // Door
    { x: -4,   y: 6.8, z: -4,   w: 8,   h: 0.7, d: 8,   top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' }, // Roof
    // Green cross on roof — vertical
    { x: -0.4, y: 7.5, z: -0.4, w: 0.8, h: 4,   d: 0.8, top: '#2E7D32', right: '#1B5E20', front: '#388E3C' },
    // Green cross — horizontal
    { x: -1.5, y: 9,   z: -0.4, w: 3,   h: 0.8, d: 0.8, top: '#2E7D32', right: '#1B5E20', front: '#388E3C' },
    // Sign band on front
    { x: -4,   y: 5.8, z:  4,   w: 8,   h: 1,   d: 0.5, top: '#1B5E20', right: '#388E3C', front: '#2E7D32' },
  ],

  veterinary: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#B0BEC5', right: '#78909C', front: '#90A4AE' },
    { x: -5,   y: 0.8, z: -5,   w: 10,  h: 6,   d: 10,  top: '#E8F5E9', right: '#C8E6C9', front: '#DCEDC8' },
    { x: -4,   y: 0.8, z:  5,   w: 8,   h: 5,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2,   y: 0.8, z:  5,   w: 4,   h: 5.5, d: 0.4, top: '#4E342E', right: '#3E2723', front: '#5D4037' },
    { x: -5,   y: 6.8, z: -5,   w: 10,  h: 0.8, d: 10,  top: '#A5D6A7', right: '#81C784', front: '#81C784' }, // Green roof
    { x: -2,   y: 6.8, z: -2,   w: 4,   h: 2,   d: 4,   top: '#66BB6A', right: '#43A047', front: '#4CAF50' }, // Raised centre roof
    // Paw print sign
    { x: -1.5, y: 7.5, z:  5,   w: 3,   h: 1.5, d: 0.5, top: '#2E7D32', right: '#1B5E20', front: '#388E3C' },
  ],

  clinic: [
    { x: -6,   y: 0,   z: -5,   w: 12,  h: 1,   d: 10,  top: '#B0BEC5', right: '#78909C', front: '#90A4AE' },
    { x: -6,   y: 1,   z: -5,   w: 12,  h: 8,   d: 10,  top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' },
    { x: -5,   y: 1,   z:  5,   w: 10,  h: 6.5, d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2,   y: 1,   z:  5,   w: 4,   h: 7,   d: 0.5, top: '#78909C', right: '#546E7A', front: '#607D8B' },
    { x: -6,   y: 9,   z: -5,   w: 12,  h: 0.8, d: 10,  top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    { x: -3,   y: 8.8, z: -2,   w: 6,   h: 1.5, d: 3,   top: '#1565C0', right: '#0D47A1', front: '#1976D2' }, // Sign
    { x: -4,   y: 1,   z: -5,   w: 4,   h: 6,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Side windows
    { x:  0,   y: 1,   z: -5,   w: 4,   h: 6,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
  ],

  // ── Education ──────────────────────────────────────────────────────────────
  school: [
    { x: -9,   y: 0,   z: -5,   w: 18,  h: 1,   d: 10,  top: '#A1887F', right: '#795548', front: '#8D6E63' }, // Foundation
    // Main building
    { x: -9,   y: 1,   z: -5,   w: 18,  h: 7,   d: 10,  top: '#EFEBE9', right: '#D7CCC8', front: '#E8D5C0' },
    // Left wing
    { x: -9,   y: 1,   z: -5,   w: 5,   h: 7,   d: 10,  top: '#F3E5D0', right: '#D5B89A', front: '#E8D0B0' },
    // Right wing
    { x:  4,   y: 1,   z: -5,   w: 5,   h: 7,   d: 10,  top: '#F3E5D0', right: '#D5B89A', front: '#E8D0B0' },
    // Front window strips
    { x: -8,   y: 2,   z:  5,   w: 16,  h: 4.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -7,   y: 1,   z:  5,   w: 3,   h: 2,   d: 0.3, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Transom 1
    { x: -1,   y: 1,   z:  5,   w: 3,   h: 2,   d: 0.3, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Transom 2
    { x:  4,   y: 1,   z:  5,   w: 3,   h: 2,   d: 0.3, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Transom 3
    // Entry door frame
    { x: -2,   y: 1,   z:  5,   w: 4,   h: 7,   d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    // Bell tower
    { x: -1.5, y: 8,   z: -2,   w: 3,   h: 5,   d: 3,   top: '#FFC107', right: '#F57F17', front: '#FF8F00' },
    { x: -1,   y: 13,  z: -1.5, w: 2,   h: 1,   d: 2,   top: '#FF8F00', right: '#E65100', front: '#F57F17' }, // Tower cap
    { x: -0.3, y: 14,  z: -0.3, w: 0.6, h: 2.5, d: 0.6, top: '#37474F', right: '#263238', front: '#455A64' }, // Spire
    // Roof
    { x: -9,   y: 8,   z: -5,   w: 18,  h: 0.8, d: 10,  top: '#D7CCC8', right: '#A1887F', front: '#BCAAA4' },
  ],

  university: [
    { x: -10,  y: 0,   z: -8,   w: 20,  h: 1.5, d: 16,  top: '#A1887F', right: '#795548', front: '#8D6E63' },
    { x: -10,  y: 1.5, z: -8,   w: 20,  h: 10,  d: 16,  top: '#D7CCC8', right: '#BCAAA4', front: '#C8B8A8' }, // Stone
    { x: -8,   y: 1.5, z:  8,   w: 16,  h: 8.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front windows
    { x: -3,   y: 1.5, z:  8,   w: 6,   h: 9,   d: 0.6, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Door
    // Columns
    { x: -8,   y: 1.5, z:  7,   w: 1.5, h: 10,  d: 1.5, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x: -4,   y: 1.5, z:  7,   w: 1.5, h: 10,  d: 1.5, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x:  2.5, y: 1.5, z:  7,   w: 1.5, h: 10,  d: 1.5, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x:  6.5, y: 1.5, z:  7,   w: 1.5, h: 10,  d: 1.5, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    // Dome base
    { x: -4,   y: 11.5,z: -4,   w: 8,   h: 2,   d: 8,   top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    // Dome
    { x: -3,   y: 13.5,z: -3,   w: 6,   h: 4,   d: 6,   top: '#FFC107', right: '#F57F17', front: '#FF8F00' },
    { x: -1,   y: 17.5,z: -1,   w: 2,   h: 3,   d: 2,   top: '#FF8F00', right: '#E65100', front: '#F57F17' }, // Dome spire base
    { x: -0.3, y: 20.5,z: -0.3, w: 0.6, h: 3,   d: 0.6, top: '#37474F', right: '#263238', front: '#455A64' }, // Spire tip
    // Roof
    { x: -10,  y: 11.5,z: -8,   w: 20,  h: 1,   d: 16,  top: '#BCAAA4', right: '#9E9E9E', front: '#A1887F' },
  ],

  college: [
    { x: -8,   y: 0,   z: -6,   w: 16,  h: 1,   d: 12,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -8,   y: 1,   z: -6,   w: 16,  h: 8,   d: 12,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -6,   y: 1,   z:  6,   w: 12,  h: 7,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2.5, y: 1,   z:  6,   w: 5,   h: 8,   d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -8,   y: 9,   z: -6,   w: 16,  h: 0.8, d: 12,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' },
    { x: -6,   y: 9.8, z: -5,   w: 12,  h: 2,   d: 10,  top: '#CC9900', right: '#AA7700', front: '#BB8800' }, // Gold roof tier
    { x: -3,   y: 7,   z:  6,   w: 6,   h: 2.5, d: 0.5, top: '#1565C0', right: '#0D47A1', front: '#1976D2' }, // Sign
    // Flanking columns
    { x: -7.5, y: 1,   z:  5.5, w: 1.2, h: 8,   d: 1.2, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x:  6.3, y: 1,   z:  5.5, w: 1.2, h: 8,   d: 1.2, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
  ],

  library: [
    { x: -6,   y: 0,   z: -5,   w: 12,  h: 1,   d: 10,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -6,   y: 1,   z: -5,   w: 12,  h: 7,   d: 10,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -5,   y: 1,   z:  5,   w: 10,  h: 6,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2,   y: 1,   z:  5,   w: 4,   h: 7,   d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -6,   y: 8,   z: -5,   w: 12,  h: 0.8, d: 10,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' },
    // Classical columns
    { x: -5.5, y: 0,   z:  5,   w: 1.2, h: 8,   d: 1.2, top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' },
    { x: -2.5, y: 0,   z:  5,   w: 1.2, h: 8,   d: 1.2, top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' },
    { x:  1.3, y: 0,   z:  5,   w: 1.2, h: 8,   d: 1.2, top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' },
    { x:  4.3, y: 0,   z:  5,   w: 1.2, h: 8,   d: 1.2, top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' },
    // Entablature
    { x: -6,   y: 8,   z:  5,   w: 12,  h: 1,   d: 1.5, top: '#CE93D8', right: '#AB47BC', front: '#BA68C8' },
  ],

  kindergarten: [
    { x: -5,   y: 0,   z: -4,   w: 5,   h: 0.8, d: 8,   top: '#F48FB1', right: '#E91E63', front: '#EC407A' },
    { x:  0,   y: 0,   z: -4,   w: 5,   h: 0.8, d: 8,   top: '#90CAF9', right: '#42A5F5', front: '#64B5F6' },
    { x: -5,   y: 0.8, z: -4,   w: 5,   h: 5,   d: 8,   top: '#FCE4EC', right: '#F8BBD0', front: '#FCE4EC' }, // Pink wing
    { x:  0,   y: 0.8, z: -4,   w: 5,   h: 4,   d: 8,   top: '#E3F2FD', right: '#BBDEFB', front: '#E3F2FD' }, // Blue wing
    { x: -5,   y: 5.8, z: -4,   w: 5,   h: 1.5, d: 8,   top: '#F48FB1', right: '#E91E63', front: '#EC407A' }, // Pink roof
    { x:  0,   y: 4.8, z: -4,   w: 5,   h: 1.5, d: 8,   top: '#90CAF9', right: '#42A5F5', front: '#64B5F6' }, // Blue roof
    // Colourful windows
    { x: -4.5, y: 1.5, z:  4,   w: 1.5, h: 2,   d: 0.3, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    { x: -2.5, y: 1.5, z:  4,   w: 1.5, h: 2,   d: 0.3, top: '#AED581', right: '#7CB342', front: '#9CCC65' },
    { x:  0.5, y: 1.5, z:  4,   w: 1.5, h: 2,   d: 0.3, top: '#80CBC4', right: '#00897B', front: '#26A69A' },
    { x:  2.5, y: 1.5, z:  4,   w: 1.5, h: 2,   d: 0.3, top: '#CE93D8', right: '#AB47BC', front: '#BA68C8' },
    // Entry
    { x: -1,   y: 0.8, z:  4,   w: 2,   h: 4,   d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
  ],

  // ── Civic / Religion ───────────────────────────────────────────────────────
  place_of_worship: [
    { x: -6,   y: 0,   z: -6,   w: 12,  h: 1,   d: 12,  top: '#D7CCC8', right: '#A1887F', front: '#BCAAA4' },
    { x: -6,   y: 1,   z: -6,   w: 12,  h: 7,   d: 12,  top: '#F5F0E8', right: '#DDD5C5', front: '#EDE5D5' }, // Base hall
    { x: -4,   y: 1,   z:  6,   w: 8,   h: 5.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front windows
    { x: -1.5, y: 1,   z:  6,   w: 3,   h: 7,   d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Entry door
    // Rose window
    { x: -1.5, y: 6,   z:  6.2, w: 3,   h: 3,   d: 0.2, top: '#FF8F00', right: '#E65100', front: '#F57F17' },
    // Nave roof
    { x: -6,   y: 8,   z: -6,   w: 12,  h: 0.8, d: 12,  top: '#EDE5D5', right: '#D7CCC8', front: '#DDD5C5' },
    // Tower base
    { x: -4,   y: 1,   z: -6,   w: 8,   h: 15,  d: 8,   top: '#F5F0E8', right: '#DDD5C5', front: '#EDE5D5' },
    // Tower belfry
    { x: -4.5, y: 16,  z: -6.5, w: 9,   h: 3,   d: 9,   top: '#DDD5C5', right: '#C5BBA8', front: '#D0C8B5' },
    { x: -3,   y: 17,  z:  2,   w: 2,   h: 2,   d: 0.3, top: '#BCAAA4', right: '#A1887F', front: '#A1887F' }, // Belfry arch
    // Spire
    { x: -1.5, y: 19,  z: -1.5, w: 3,   h: 5,   d: 3,   top: '#8D6E63', right: '#5D4037', front: '#6D4C41' },
    { x: -0.5, y: 24,  z: -0.5, w: 1,   h: 4,   d: 1,   top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    // Cross
    { x: -0.1, y: 27,  z: -0.1, w: 0.2, h: 3,   d: 0.2, top: '#FFC107', right: '#FF8F00', front: '#FF8F00' },
    { x: -0.6, y: 28,  z: -0.1, w: 1.2, h: 0.2, d: 0.2, top: '#FFC107', right: '#FF8F00', front: '#FF8F00' },
  ],

  police: [
    { x: -6,   y: 0,   z: -5,   w: 12,  h: 1,   d: 10,  top: '#90A4AE', right: '#607D8B', front: '#78909C' },
    { x: -6,   y: 1,   z: -5,   w: 12,  h: 8,   d: 10,  top: '#ECEFF1', right: '#CFD8DC', front: '#E3E8EC' },
    { x: -5,   y: 1,   z:  5,   w: 4,   h: 6.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Windows
    { x:  1,   y: 1,   z:  5,   w: 4,   h: 6.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2,   y: 1,   z:  5,   w: 4,   h: 7,   d: 0.5, top: '#455A64', right: '#263238', front: '#37474F' }, // Door
    { x: -6,   y: 9,   z: -5,   w: 12,  h: 0.8, d: 10,  top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    // Columns
    { x: -5,   y: 0,   z:  4.5, w: 1.2, h: 9,   d: 1.2, top: '#ECEFF1', right: '#B0BEC5', front: '#CFD8DC' },
    { x:  3.8, y: 0,   z:  4.5, w: 1.2, h: 9,   d: 1.2, top: '#ECEFF1', right: '#B0BEC5', front: '#CFD8DC' },
    // Sign band
    { x: -4,   y: 8,   z:  5,   w: 8,   h: 1.5, d: 0.5, top: '#1A237E', right: '#0D47A1', front: '#283593' },
    // Blue lamp on roof
    { x: -0.5, y: 9.8, z: -0.5, w: 1,   h: 1.5, d: 1,   top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    { x: -0.4, y: 11.3,z: -0.4, w: 0.8, h: 0.5, d: 0.8, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' },
  ],

  fire_station: [
    { x: -7,   y: 0,   z: -6,   w: 14,  h: 1,   d: 12,  top: '#B0BEC5', right: '#78909C', front: '#90A4AE' },
    { x: -7,   y: 1,   z: -6,   w: 14,  h: 8,   d: 12,  top: '#ECEFF1', right: '#CFD8DC', front: '#E3E8EC' },
    { x: -5,   y: 1,   z: -6,   w: 5,   h: 7,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Side windows
    { x:  0,   y: 1,   z: -6,   w: 5,   h: 7,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    // Bay doors — red with yellow stripe
    { x: -7,   y: 1,   z:  6,   w: 5,   h: 6,   d: 0.4, top: '#C62828', right: '#B71C1C', front: '#D32F2F' },
    { x: -7,   y: 6.5, z:  6,   w: 5,   h: 0.5, d: 0.4, top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Yellow stripe
    { x:  2,   y: 1,   z:  6,   w: 5,   h: 6,   d: 0.4, top: '#C62828', right: '#B71C1C', front: '#D32F2F' },
    { x:  2,   y: 6.5, z:  6,   w: 5,   h: 0.5, d: 0.4, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    { x: -2,   y: 1,   z:  6,   w: 4,   h: 7.5, d: 0.5, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Side entry
    // Red engine silhouette inside bay
    { x: -6,   y: 1,   z:  2,   w: 5,   h: 3,   d: 4,   top: '#E53935', right: '#B71C1C', front: '#D32F2F' },
    // Roof
    { x: -7,   y: 9,   z: -6,   w: 14,  h: 1,   d: 12,  top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    // Red top stripe on facade
    { x: -7,   y: 9,   z:  6,   w: 14,  h: 1.5, d: 0.5, top: '#C62828', right: '#B71C1C', front: '#D32F2F' },
  ],

  townhall: [
    { x: -7,   y: 0,   z: -6,   w: 14,  h: 1.5, d: 12,  top: '#A1887F', right: '#795548', front: '#8D6E63' },
    { x: -7,   y: 1.5, z: -6,   w: 14,  h: 9,   d: 12,  top: '#F5F0E8', right: '#DDD5C5', front: '#EDE5D5' },
    { x: -6,   y: 1.5, z:  6,   w: 12,  h: 8,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2.5, y: 1.5, z:  6,   w: 5,   h: 9,   d: 0.6, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    // Portico columns
    { x: -5.5, y: 1.5, z:  5.5, w: 1.2, h: 9,   d: 1.2, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x: -2,   y: 1.5, z:  5.5, w: 1.2, h: 9,   d: 1.2, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x:  0.8, y: 1.5, z:  5.5, w: 1.2, h: 9,   d: 1.2, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x:  4.3, y: 1.5, z:  5.5, w: 1.2, h: 9,   d: 1.2, top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x: -7,   y: 10.5,z: -6,   w: 14,  h: 1,   d: 12,  top: '#DDD5C5', right: '#C5BBA8', front: '#D0C8B5' }, // Roof
    // Drum + dome
    { x: -3,   y: 11.5,z: -3,   w: 6,   h: 2,   d: 6,   top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' },
    { x: -2.5, y: 13.5,z: -2.5, w: 5,   h: 4,   d: 5,   top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    { x: -0.8, y: 17.5,z: -0.8, w: 1.6, h: 2,   d: 1.6, top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x: -0.2, y: 19.5,z: -0.2, w: 0.4, h: 2,   d: 0.4, top: '#FFC107', right: '#FF8F00', front: '#FF8F00' }, // Flag mast
  ],

  courthouse: [
    { x: -8,   y: 0,   z: -7,   w: 16,  h: 1.5, d: 14,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -8,   y: 1.5, z: -7,   w: 16,  h: 7,   d: 14,  top: '#E0E0E0', right: '#C0C0C0', front: '#D0D0D0' },
    { x: -7,   y: 1.5, z:  7,   w: 14,  h: 6.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2.5, y: 1.5, z:  7,   w: 5,   h: 8,   d: 0.6, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    // Heavy columns
    { x: -7,   y: 0,   z:  6.5, w: 1.8, h: 9,   d: 1.8, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -3.5, y: 0,   z:  6.5, w: 1.8, h: 9,   d: 1.8, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x:  1.7, y: 0,   z:  6.5, w: 1.8, h: 9,   d: 1.8, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x:  5.2, y: 0,   z:  6.5, w: 1.8, h: 9,   d: 1.8, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    // Entablature
    { x: -8,   y: 8.5, z:  6,   w: 16,  h: 2,   d: 2,   top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' },
    { x: -8,   y: 8.5, z: -7,   w: 16,  h: 2,   d: 14,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' }, // Heavy roof
    { x: -5,   y: 10.5,z: -4,   w: 10,  h: 2,   d: 8,   top: '#AAAAAA', right: '#888888', front: '#999999' }, // Pediment
  ],

  post_office: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 1,   d: 10,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -5,   y: 1,   z: -5,   w: 10,  h: 6,   d: 10,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -4,   y: 1,   z:  5,   w: 8,   h: 5,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -1.5, y: 1,   z:  5,   w: 3,   h: 5.5, d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -5,   y: 7,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' },
    { x: -5.5, y: 6.5, z:  5,   w: 11,  h: 0.8, d: 0.6, top: '#D84315', right: '#BF360C', front: '#E64A19' }, // Red/orange band
    { x: -2.5, y: 6,   z:  5,   w: 5,   h: 1.5, d: 0.5, top: '#FFC107', right: '#FF8F00', front: '#FF8F00' }, // Sign
    // Post box outside
    { x:  4,   y: 1,   z:  3,   w: 1.5, h: 5,   d: 1.5, top: '#C62828', right: '#B71C1C', front: '#D32F2F' },
    { x:  3.8, y: 6,   z:  2.8, w: 1.9, h: 0.8, d: 1.9, top: '#E53935', right: '#C62828', front: '#D32F2F' },
  ],

  // ── Transport ──────────────────────────────────────────────────────────────
  bus_stop: [
    // Main post
    { x: -0.3, y: 0,   z: -0.3, w: 0.6, h: 12,  d: 0.6, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    // Shelter roof
    { x: -3.5, y: 9,   z: -0.4, w: 7,   h: 0.4, d: 2.5, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    // Shelter side panel
    { x: -3.5, y: 5,   z: -0.4, w: 0.3, h: 4.5, d: 2.5, top: '#B3E5FC', right: '#90CAF9', front: '#BBDEFB' },
    // Back glass panel
    { x: -3.5, y: 5,   z: 2.1,  w: 7,   h: 4.5, d: 0.3, top: '#B3E5FC', right: '#90CAF9', front: '#BBDEFB' },
    // Floor slab
    { x: -3.5, y: 0,   z: -0.4, w: 7,   h: 0.3, d: 2.5, top: '#78909C', right: '#546E7A', front: '#607D8B' },
    // Bench inside shelter
    { x: -3,   y: 1.5, z: 0.5,  w: 6,   h: 0.3, d: 1,   top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    { x: -2.8, y: 0,   z: 0.6,  w: 0.4, h: 1.5, d: 0.4, top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Bench leg L
    { x:  2.4, y: 0,   z: 0.6,  w: 0.4, h: 1.5, d: 0.4, top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Bench leg R
    // Timetable board
    { x: -3,   y: 6.5, z: 2.2,  w: 3.5, h: 2.5, d: 0.2, top: '#FFCC00', right: '#CC9900', front: '#E5B800' },
    // Route sign on pole
    { x: -3.5, y: 10,  z: -0.6, w: 7,   h: 2.2, d: 0.3, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x: -3.5, y: 12.2,z: -0.6, w: 7,   h: 0.4, d: 0.3, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' },
  ],

  fuel: [
    // Canopy / forecourt
    { x: -6,   y: 5,   z: -4,   w: 12,  h: 0.5, d: 8,   top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    { x: -0.4, y: 0,   z: -0.4, w: 0.8, h: 5,   d: 0.8, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Canopy post L
    { x: -0.4, y: 0,   z:  3.2, w: 0.8, h: 5,   d: 0.8, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Canopy post R
    { x: -6,   y: 5.5, z: -4,   w: 12,  h: 0.5, d: 8,   top: '#FF8F00', right: '#E65100', front: '#FF6F00' }, // Colour band
    // Pump 1
    { x: -4,   y: 0,   z: -2,   w: 2,   h: 5,   d: 1.5, top: '#EF9A9A', right: '#E53935', front: '#EF5350' },
    { x: -3.5, y: 2.5, z: -0.6, w: 1,   h: 2,   d: 0.3, top: '#212121', right: '#000000', front: '#111111' }, // Screen 1
    { x: -3.8, y: 1.2, z: -0.6, w: 1.6, h: 0.6, d: 0.2, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Nozzle 1
    // Pump 2
    { x:  2,   y: 0,   z: -2,   w: 2,   h: 5,   d: 1.5, top: '#80CBC4', right: '#00897B', front: '#26A69A' },
    { x:  2.5, y: 2.5, z: -0.6, w: 1,   h: 2,   d: 0.3, top: '#212121', right: '#000000', front: '#111111' }, // Screen 2
    { x:  2.2, y: 1.2, z: -0.6, w: 1.6, h: 0.6, d: 0.2, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Nozzle 2
    // Kiosk
    { x:  4,   y: 0,   z: -4,   w: 4,   h: 5,   d: 4,   top: '#FAFAFA', right: '#E0E0E0', front: '#F5F5F5' },
    { x:  4,   y: 0,   z:  0,   w: 4,   h: 4,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
  ],

  parking: [
    { x: -10,  y: 0,   z: -10,  w: 20,  h: 0.3, d: 20,  top: '#616161', right: '#424242', front: '#545454' }, // Asphalt
    // Lane markings
    { x: -8,   y: 0.3, z: -7,   w: 0.4, h: 0.1, d: 5,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    { x: -4.5, y: 0.3, z: -7,   w: 0.4, h: 0.1, d: 5,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    { x: -1,   y: 0.3, z: -7,   w: 0.4, h: 0.1, d: 5,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    { x:  2.5, y: 0.3, z: -7,   w: 0.4, h: 0.1, d: 5,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    { x:  6,   y: 0.3, z: -7,   w: 0.4, h: 0.1, d: 5,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    // Centre lane divider
    { x: -10,  y: 0.3, z:  0,   w: 20,  h: 0.1, d: 0.4, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    // Pay machine
    { x:  8,   y: 0.3, z:  8,   w: 1.5, h: 4,   d: 1,   top: '#37474F', right: '#263238', front: '#455A64' },
    { x:  8.1, y: 2,   z:  9,   w: 1.3, h: 1.8, d: 0.2, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    // Sign post
    { x: -9.5, y: 0.3, z: -9.5, w: 0.5, h: 5,   d: 0.5, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    { x: -10,  y: 5.3, z: -10,  w: 3,   h: 2,   d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
  ],

  taxi: [
    // Body
    { x: -2.5, y: 0,   z: -2,   w: 5,   h: 1.5, d: 4,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    // Cabin
    { x: -1.8, y: 1.5, z: -1.8, w: 3.6, h: 1.5, d: 3.6, top: '#FFF9C4', right: '#FFF176', front: '#FFF9C4' },
    // Windows
    { x: -1.5, y: 1.6, z: -1.9, w: 3,   h: 1.2, d: 0.2, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Front
    { x: -1.5, y: 1.6, z:  1.7, w: 3,   h: 1.2, d: 0.2, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Back
    { x: -1.9, y: 1.6, z: -1.5, w: 0.2, h: 1.2, d: 3,   top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Left
    { x:  1.7, y: 1.6, z: -1.5, w: 0.2, h: 1.2, d: 3,   top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Right
    // Wheels
    { x: -2.8, y: 0,   z: -1.8, w: 0.5, h: 0.8, d: 0.8, top: '#212121', right: '#111111', front: '#212121' },
    { x:  2.3, y: 0,   z: -1.8, w: 0.5, h: 0.8, d: 0.8, top: '#212121', right: '#111111', front: '#212121' },
    { x: -2.8, y: 0,   z:  1,   w: 0.5, h: 0.8, d: 0.8, top: '#212121', right: '#111111', front: '#212121' },
    { x:  2.3, y: 0,   z:  1,   w: 0.5, h: 0.8, d: 0.8, top: '#212121', right: '#111111', front: '#212121' },
    // Taxi sign on roof
    { x: -0.8, y: 3,   z: -0.8, w: 1.6, h: 0.8, d: 1.6, top: '#FFC107', right: '#FF8F00', front: '#FF8F00' },
  ],

  bicycle_parking: [
    // Ground slab
    { x: -4,   y: 0,   z: -1,   w: 8,   h: 0.3, d: 2,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    // Rack arch posts — 3 racks
    { x: -3.5, y: 0.3, z: -0.8, w: 0.4, h: 2.5, d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x: -3.5, y: 0.3, z:  0.4, w: 0.4, h: 2.5, d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x: -3.5, y: 2.8, z: -0.8, w: 0.4, h: 0.4, d: 1.6, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' }, // Arch cross 1
    { x: -0.7, y: 0.3, z: -0.8, w: 0.4, h: 2.5, d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x: -0.7, y: 0.3, z:  0.4, w: 0.4, h: 2.5, d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x: -0.7, y: 2.8, z: -0.8, w: 0.4, h: 0.4, d: 1.6, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' }, // Arch cross 2
    { x:  2.1, y: 0.3, z: -0.8, w: 0.4, h: 2.5, d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x:  2.1, y: 0.3, z:  0.4, w: 0.4, h: 2.5, d: 0.4, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
    { x:  2.1, y: 2.8, z: -0.8, w: 0.4, h: 0.4, d: 1.6, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' }, // Arch cross 3
    // Sign post
    { x:  3.5, y: 0.3, z: -0.3, w: 0.4, h: 5,   d: 0.4, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    { x:  3.3, y: 5.3, z: -1,   w: 2,   h: 1.5, d: 0.3, top: '#1E88E5', right: '#1565C0', front: '#1976D2' },
  ],

  // ── Shops ─────────────────────────────────────────────────────────────────
  supermarket: [
    { x: -9,   y: 0,   z: -9,   w: 18,  h: 1,   d: 18,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -9,   y: 1,   z: -9,   w: 18,  h: 8,   d: 18,  top: '#E0E0E0', right: '#CCCCCC', front: '#D8D8D8' },
    { x: -8,   y: 1,   z:  9,   w: 16,  h: 7,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Glass front
    { x: -4,   y: 1,   z:  9,   w: 8,   h: 7.5, d: 0.6, top: '#78909C', right: '#546E7A', front: '#607D8B' }, // Entry doors
    { x: -9,   y: 9,   z: -9,   w: 18,  h: 0.8, d: 18,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' }, // Flat roof
    { x: -5,   y: 8.5, z:  9,   w: 10,  h: 2,   d: 0.6, top: '#1565C0', right: '#0D47A1', front: '#1976D2' }, // Blue sign band
    { x: -2,   y: 9,   z: -2,   w: 4,   h: 1.5, d: 4,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // HVAC unit
    // Cart bay outside
    { x:  7,   y: 1,   z:  7,   w: 3,   h: 2,   d: 3,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
  ],

  convenience: [
    { x: -4.5, y: 0,   z: -4.5, w: 9,   h: 0.8, d: 9,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -4.5, y: 0.8, z: -4.5, w: 9,   h: 6,   d: 9,   top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' },
    { x: -3.5, y: 0.8, z:  4.5, w: 7,   h: 5,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -1.5, y: 0.8, z:  4.5, w: 3,   h: 5.5, d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -5.5, y: 5.8, z: -5.5, w: 11,  h: 1,   d: 3,   top: '#F06292', right: '#E91E63', front: '#EC407A' }, // Pink awning
    { x: -5,   y: 4.8, z: -5.5, w: 0.5, h: 1.2, d: 1,   top: '#C2185B', right: '#880E4F', front: '#D81B60' }, // Awning post L
    { x:  4.5, y: 4.8, z: -5.5, w: 0.5, h: 1.2, d: 1,   top: '#C2185B', right: '#880E4F', front: '#D81B60' }, // Awning post R
    { x: -4.5, y: 6.8, z: -4.5, w: 9,   h: 0.8, d: 9,   top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' }, // Roof
  ],

  clothes: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -5,   y: 0.8, z: -5,   w: 10,  h: 7,   d: 10,  top: '#FAFAFA', right: '#EEEEEE', front: '#F5F5F5' },
    { x: -4,   y: 0.8, z:  5,   w: 8,   h: 6,   d: 0.3, top: '#E1BEE7', right: '#CE93D8', front: '#E1BEE7' }, // Purple-tinted glass
    { x: -1.5, y: 0.8, z:  5,   w: 3,   h: 6.5, d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -6,   y: 6,   z: -6,   w: 12,  h: 1,   d: 3,   top: '#AB47BC', right: '#7B1FA2', front: '#9C27B0' }, // Purple awning
    { x: -5.5, y: 5,   z: -6,   w: 0.5, h: 1.2, d: 1,   top: '#7B1FA2', right: '#4A148C', front: '#9C27B0' }, // Awning post L
    { x:  5,   y: 5,   z: -6,   w: 0.5, h: 1.2, d: 1,   top: '#7B1FA2', right: '#4A148C', front: '#9C27B0' }, // Awning post R
    { x: -5,   y: 7.8, z: -5,   w: 10,  h: 0.8, d: 10,  top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Mannequin in window
    { x: -0.5, y: 1,   z:  4.5, w: 1,   h: 4,   d: 0.5, top: '#CE93D8', right: '#AB47BC', front: '#BA68C8' },
  ],

  bakery: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 0.8, d: 8,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -4,   y: 0.8, z: -4,   w: 8,   h: 6,   d: 8,   top: '#FAFAFA', right: '#EEEEEE', front: '#F5F5F5' },
    { x: -3,   y: 0.8, z:  4,   w: 6,   h: 5,   d: 0.3, top: '#FFF9C4', right: '#FFF176', front: '#FFF9C4' }, // Warm tinted window
    { x: -1.5, y: 0.8, z:  4,   w: 3,   h: 5.5, d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -5,   y: 5.5, z: -5,   w: 10,  h: 1,   d: 3,   top: '#CC8833', right: '#AA6611', front: '#BB7722' }, // Orange awning
    { x: -4.5, y: 4.5, z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#AA6611', right: '#884400', front: '#BB7722' }, // Post L
    { x:  4,   y: 4.5, z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#AA6611', right: '#884400', front: '#BB7722' }, // Post R
    { x: -4,   y: 6.8, z: -4,   w: 8,   h: 0.8, d: 8,   top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Bread display outside
    { x: -3,   y: 0.8, z:  4.5, w: 2,   h: 0.8, d: 1.5, top: '#FFCC80', right: '#FFA726', front: '#FFB74D' },
    { x:  1,   y: 0.8, z:  4.5, w: 2,   h: 0.8, d: 1.5, top: '#FFCC80', right: '#FFA726', front: '#FFB74D' },
  ],

  butcher: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 0.8, d: 8,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -4,   y: 0.8, z: -4,   w: 8,   h: 6,   d: 8,   top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' },
    { x: -3,   y: 0.8, z:  4,   w: 6,   h: 5,   d: 0.3, top: '#FFCDD2', right: '#EF9A9A', front: '#FFCDD2' }, // Pink-tinted glass
    { x: -1.5, y: 0.8, z:  4,   w: 3,   h: 5.5, d: 0.5, top: '#4E342E', right: '#3E2723', front: '#5D4037' },
    { x: -5,   y: 5,   z: -5,   w: 10,  h: 1,   d: 3,   top: '#C62828', right: '#B71C1C', front: '#D32F2F' }, // Red awning
    { x: -4.5, y: 4,   z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#B71C1C', right: '#880E0E', front: '#C62828' }, // Post L
    { x:  4,   y: 4,   z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#B71C1C', right: '#880E0E', front: '#C62828' }, // Post R
    { x: -4,   y: 6.8, z: -4,   w: 8,   h: 0.8, d: 8,   top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Hanging hooks sign
    { x: -2,   y: 5.5, z:  4,   w: 4,   h: 1.5, d: 0.5, top: '#880E0E', right: '#4E0000', front: '#B71C1C' },
  ],

  bookshop: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.8, d: 10,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -5,   y: 0.8, z: -5,   w: 10,  h: 6,   d: 10,  top: '#EFEBE9', right: '#D7CCC8', front: '#E8E0D0' }, // Warm stone
    { x: -4,   y: 0.8, z:  5,   w: 8,   h: 5,   d: 0.3, top: '#FFF9C4', right: '#FFF176', front: '#FFF9C4' },
    { x: -1.5, y: 0.8, z:  5,   w: 3,   h: 5.5, d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -6,   y: 5.5, z: -6,   w: 12,  h: 1,   d: 3,   top: '#7B1FA2', right: '#4A148C', front: '#9C27B0' }, // Plum awning
    { x: -5.5, y: 4.5, z: -6,   w: 0.5, h: 1.2, d: 1,   top: '#4A148C', right: '#311B92', front: '#7B1FA2' }, // Post L
    { x:  5,   y: 4.5, z: -6,   w: 0.5, h: 1.2, d: 1,   top: '#4A148C', right: '#311B92', front: '#7B1FA2' }, // Post R
    { x: -5,   y: 6.8, z: -5,   w: 10,  h: 0.8, d: 10,  top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Book display in window
    { x: -3.5, y: 0.8, z:  4.5, w: 1.2, h: 2.5, d: 0.8, top: '#FF8F00', right: '#E65100', front: '#F57F17' },
    { x: -1.8, y: 0.8, z:  4.5, w: 1.2, h: 2.5, d: 0.8, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    { x:  0.6, y: 0.8, z:  4.5, w: 1.2, h: 2.5, d: 0.8, top: '#2E7D32', right: '#1B5E20', front: '#388E3C' },
  ],

  electronics: [
    { x: -6,   y: 0,   z: -5,   w: 12,  h: 0.8, d: 10,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -6,   y: 0.8, z: -5,   w: 12,  h: 7,   d: 10,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -5,   y: 0.8, z:  5,   w: 10,  h: 6.5, d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Large glass front
    { x: -3,   y: 0.8, z:  5,   w: 6,   h: 7,   d: 0.6, top: '#546E7A', right: '#37474F', front: '#455A64' }, // Door frame
    { x: -6,   y: 7.8, z: -5,   w: 12,  h: 0.8, d: 10,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' },
    { x: -5,   y: 7.3, z:  5,   w: 10,  h: 2,   d: 0.6, top: '#0288D1', right: '#01579B', front: '#0277BD' }, // Cyan/blue sign band
    // Display screens in window
    { x: -4,   y: 1.5, z:  4.6, w: 2,   h: 2,   d: 0.2, top: '#1A237E', right: '#0D47A1', front: '#1565C0' },
    { x: -1.5, y: 1.5, z:  4.6, w: 2,   h: 2,   d: 0.2, top: '#1A237E', right: '#0D47A1', front: '#1565C0' },
    { x:  1,   y: 1.5, z:  4.6, w: 2,   h: 2,   d: 0.2, top: '#1A237E', right: '#0D47A1', front: '#1565C0' },
  ],

  hardware: [
    { x: -7,   y: 0,   z: -6,   w: 14,  h: 1,   d: 12,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -7,   y: 1,   z: -6,   w: 14,  h: 7,   d: 12,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -6,   y: 1,   z:  6,   w: 12,  h: 6,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -2.5, y: 1,   z:  6,   w: 5,   h: 7,   d: 0.6, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -7,   y: 8,   z: -6,   w: 14,  h: 0.8, d: 12,  top: '#CCCCCC', right: '#AAAAAA', front: '#BBBBBB' },
    { x: -7,   y: 7.5, z:  6,   w: 14,  h: 2,   d: 0.6, top: '#8D6E63', right: '#5D4037', front: '#795548' }, // Brown sign
    // Outdoor display — lumber
    { x:  6,   y: 1,   z:  4,   w: 4,   h: 1,   d: 3,   top: '#8D6E63', right: '#5D4037', front: '#6D4C41' },
    { x:  6,   y: 2,   z:  4,   w: 4,   h: 0.5, d: 3,   top: '#A1887F', right: '#795548', front: '#8D6E63' },
  ],

  florist: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 0.8, d: 8,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -4,   y: 0.8, z: -4,   w: 8,   h: 6,   d: 8,   top: '#F1F8E9', right: '#DCEDC8', front: '#E8F5E9' }, // Light green walls
    { x: -3,   y: 0.8, z:  4,   w: 6,   h: 5,   d: 0.3, top: '#F1F8E9', right: '#DCEDC8', front: '#E8F5E9' }, // Pale green window
    { x: -1.5, y: 0.8, z:  4,   w: 3,   h: 5.5, d: 0.5, top: '#4E342E', right: '#3E2723', front: '#5D4037' },
    { x: -5,   y: 5.5, z: -5,   w: 10,  h: 1,   d: 3,   top: '#F06292', right: '#E91E63', front: '#EC407A' }, // Pink awning
    { x: -4.5, y: 4.5, z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#C2185B', right: '#880E4F', front: '#D81B60' }, // Post L
    { x:  4,   y: 4.5, z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#C2185B', right: '#880E4F', front: '#D81B60' }, // Post R
    { x: -4,   y: 6.8, z: -4,   w: 8,   h: 0.8, d: 8,   top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Flower buckets outside
    { x: -4,   y: 0.8, z:  4.5, w: 1.5, h: 2,   d: 1.5, top: '#E91E63', right: '#C2185B', front: '#D81B60' },
    { x: -2,   y: 0.8, z:  4.5, w: 1.5, h: 2,   d: 1.5, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    { x:  0.5, y: 0.8, z:  4.5, w: 1.5, h: 2,   d: 1.5, top: '#7E57C2', right: '#512DA8', front: '#673AB7' },
    { x:  2.5, y: 0.8, z:  4.5, w: 1.5, h: 2,   d: 1.5, top: '#66BB6A', right: '#43A047', front: '#4CAF50' },
  ],

  hairdresser: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 0.8, d: 8,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -4,   y: 0.8, z: -4,   w: 8,   h: 6,   d: 8,   top: '#FAFAFA', right: '#F5F5F5', front: '#FAFAFA' },
    { x: -3,   y: 0.8, z:  4,   w: 6,   h: 5,   d: 0.3, top: '#EDE7F6', right: '#D1C4E9', front: '#EDE7F6' }, // Lavender tint
    { x: -1.5, y: 0.8, z:  4,   w: 3,   h: 5.5, d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -5,   y: 5.5, z: -5,   w: 10,  h: 1,   d: 3,   top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' }, // Lavender awning
    { x: -4.5, y: 4.5, z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#7B1FA2', right: '#4A148C', front: '#9C27B0' }, // Post L
    { x:  4,   y: 4.5, z: -5,   w: 0.5, h: 1.2, d: 1,   top: '#7B1FA2', right: '#4A148C', front: '#9C27B0' }, // Post R
    { x: -4,   y: 6.8, z: -4,   w: 8,   h: 0.8, d: 8,   top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Barber pole
    { x:  3,   y: 0.8, z:  3.8, w: 0.5, h: 5,   d: 0.5, top: '#F5F5F5', right: '#E0E0E0', front: '#E0E0E0' },
    { x:  2.9, y: 1.5, z:  3.7, w: 0.7, h: 0.5, d: 0.7, top: '#C62828', right: '#B71C1C', front: '#D32F2F' },
    { x:  2.9, y: 2.5, z:  3.7, w: 0.7, h: 0.5, d: 0.7, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    { x:  2.9, y: 3.5, z:  3.7, w: 0.7, h: 0.5, d: 0.7, top: '#C62828', right: '#B71C1C', front: '#D32F2F' },
    { x:  2.9, y: 4.5, z:  3.7, w: 0.7, h: 0.5, d: 0.7, top: '#1565C0', right: '#0D47A1', front: '#1976D2' },
    { x:  2.8, y: 5.8, z:  3.6, w: 0.9, h: 0.8, d: 0.9, top: '#FAFAFA', right: '#E0E0E0', front: '#EEEEEE' }, // Pole cap
  ],

  // ── Leisure / Parks / Nature ───────────────────────────────────────────────
  park: [
    { x: -8,   y: 0,   z: -8,   w: 16,  h: 0.5, d: 16,  top: '#4CAF50', right: '#388E3C', front: '#43A047' }, // Grass base
    { x: -7.5, y: 0.5, z: -7.5, w: 15,  h: 0.15,d: 15,  top: '#66BB6A', right: '#4CAF50', front: '#4CAF50' }, // Top grass layer
    // Paths
    { x: -7.8, y: 0.5, z: -0.3, w: 15.6,h: 0.2, d: 0.6, top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // H path
    { x: -0.3, y: 0.5, z: -7.8, w: 0.6, h: 0.2, d: 15.6,top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // V path
    // Trees
    { x: -0.5, y: 0.5, z: -6,   w: 1,   h: 4,   d: 1,   top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x: -2.5, y: 4.5, z: -8,   w: 5,   h: 4,   d: 5,   top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    { x:  5,   y: 0.5, z: -1,   w: 1,   h: 5,   d: 1,   top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x:  3,   y: 5.5, z: -3,   w: 5,   h: 4,   d: 5,   top: '#43A047', right: '#388E3C', front: '#388E3C' },
    { x: -7,   y: 0.5, z:  4,   w: 1,   h: 4,   d: 1,   top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x: -9,   y: 4.5, z:  2,   w: 4,   h: 4,   d: 4,   top: '#2E7D32', right: '#1B5E20', front: '#256029' },
    // Flower beds
    { x: -6,   y: 0.7, z:  5,   w: 3,   h: 0.4, d: 3,   top: '#E91E63', right: '#C2185B', front: '#D81B60' },
    { x:  3,   y: 0.7, z:  4,   w: 3,   h: 0.4, d: 3,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    // Bench in park
    { x: -1.5, y: 0.5, z:  2.5, w: 3,   h: 0.3, d: 1,   top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    // Lamp post
    { x:  6,   y: 0.5, z:  6,   w: 0.4, h: 7,   d: 0.4, top: '#455A64', right: '#263238', front: '#37474F' },
    { x:  5.5, y: 7.5, z:  5.5, w: 1.4, h: 0.8, d: 1.4, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    // Pond
    { x: -3,   y: 0.6, z: -4,   w: 5,   h: 0.2, d: 4,   top: '#29B6F6', right: '#0288D1', front: '#0288D1' },
  ],

  garden: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.3, d: 10,  top: '#66BB6A', right: '#4CAF50', front: '#4CAF50' }, // Lawn
    // Raised flower beds
    { x: -4,   y: 0.3, z: -4,   w: 3,   h: 0.5, d: 2,   top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Bed border 1
    { x: -3.8, y: 0.8, z: -3.8, w: 2.6, h: 0.8, d: 1.6, top: '#F06292', right: '#E91E63', front: '#EC407A' }, // Flowers 1
    { x:  1,   y: 0.3, z: -4,   w: 3,   h: 0.5, d: 2,   top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Bed border 2
    { x:  1.2, y: 0.8, z: -3.8, w: 2.6, h: 0.8, d: 1.6, top: '#FFCC80', right: '#FFA726', front: '#FFB74D' }, // Flowers 2
    { x: -4,   y: 0.3, z:  2,   w: 3,   h: 0.5, d: 2,   top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Bed border 3
    { x: -3.8, y: 0.8, z:  2.2, w: 2.6, h: 0.8, d: 1.6, top: '#CE93D8', right: '#AB47BC', front: '#BA68C8' }, // Flowers 3
    { x:  1,   y: 0.3, z:  2,   w: 3,   h: 0.5, d: 2,   top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Bed border 4
    { x:  1.2, y: 0.8, z:  2.2, w: 2.6, h: 0.8, d: 1.6, top: '#80CBC4', right: '#00897B', front: '#26A69A' }, // Flowers 4
    // Garden path
    { x: -1,   y: 0.3, z: -5,   w: 2,   h: 0.1, d: 10,  top: '#D7CCC8', right: '#A1887F', front: '#BCAAA4' },
    // Small garden shed
    { x:  3,   y: 0.3, z: -5,   w: 2,   h: 3,   d: 2,   top: '#8D6E63', right: '#5D4037', front: '#6D4C41' },
    { x:  2.8, y: 3.3, z: -5.2, w: 2.4, h: 1.5, d: 2.4, top: '#C8A96E', right: '#9E7A45', front: '#B89050' }, // Shed roof
    // Watering can
    { x: -5,   y: 0.3, z:  4,   w: 1,   h: 1,   d: 1.5, top: '#29B6F6', right: '#0288D1', front: '#0288D1' },
  ],

  playground: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 0.4, d: 10,  top: '#FFCC80', right: '#FFA726', front: '#FFB74D' }, // Sand
    // Slide structure
    { x: -4,   y: 0.4, z: -3,   w: 1,   h: 4,   d: 1,   top: '#F44336', right: '#C62828', front: '#D32F2F' }, // Slide post
    { x: -3.5, y: 0.4, z: -3,   w: 1,   h: 4,   d: 1,   top: '#F44336', right: '#C62828', front: '#D32F2F' }, // Slide post 2
    { x: -4.5, y: 4.4, z: -3.5, w: 3,   h: 0.5, d: 2,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Slide platform
    { x: -3.8, y: 0.4, z: -1.5, w: 1.5, h: 3,   d: 3,   top: '#FF8F00', right: '#E65100', front: '#F57F17' }, // Slide chute
    // Swing frame
    { x:  1,   y: 0.4, z: -3,   w: 0.5, h: 5,   d: 0.5, top: '#1E88E5', right: '#1565C0', front: '#1976D2' }, // Post L
    { x:  3.5, y: 0.4, z: -3,   w: 0.5, h: 5,   d: 0.5, top: '#1E88E5', right: '#1565C0', front: '#1976D2' }, // Post R
    { x:  1,   y: 5.4, z: -3,   w: 3,   h: 0.4, d: 0.4, top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' }, // Crossbar
    { x:  1.8, y: 1.4, z: -3,   w: 0.5, h: 3,   d: 0.5, top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Swing seat L
    { x:  2.7, y: 1.4, z: -3,   w: 0.5, h: 3,   d: 0.5, top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Swing seat R
    // Roundabout
    { x: -1.5, y: 0.4, z:  2,   w: 3,   h: 0.5, d: 3,   top: '#66BB6A', right: '#43A047', front: '#4CAF50' },
    { x: -0.1, y: 0.9, z:  3.4, w: 0.2, h: 1,   d: 0.2, top: '#5D4037', right: '#4E342E', front: '#5D4037' }, // Centre pole
    // Fence
    { x: -5,   y: 0.4, z: -5,   w: 10,  h: 1,   d: 0.3, top: '#FF8F00', right: '#E65100', front: '#F57F17' },
    { x: -5,   y: 0.4, z:  4.7, w: 10,  h: 1,   d: 0.3, top: '#FF8F00', right: '#E65100', front: '#F57F17' },
  ],

  sports_centre: [
    { x: -9,   y: 0,   z: -7,   w: 18,  h: 1,   d: 14,  top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x: -9,   y: 1,   z: -7,   w: 18,  h: 7,   d: 14,  top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' },
    { x: -8,   y: 1,   z:  7,   w: 16,  h: 6,   d: 0.4, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
    { x: -3,   y: 1,   z:  7,   w: 6,   h: 7,   d: 0.6, top: '#546E7A', right: '#37474F', front: '#455A64' },
    { x: -7,   y: 8,   z: -5,   w: 14,  h: 2.5, d: 10,  top: '#0288D1', right: '#01579B', front: '#0277BD' }, // Blue curved roof
    { x: -9,   y: 8,   z: -7,   w: 18,  h: 1,   d: 14,  top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Roof edge
    { x: -5,   y: 7,   z:  7,   w: 10,  h: 2,   d: 0.6, top: '#01579B', right: '#003c6e', front: '#0277BD' }, // Sign band
    // Outdoor court
    { x:  7,   y: 1,   z: -5,   w: 8,   h: 0.2, d: 10,  top: '#0288D1', right: '#01579B', front: '#0277BD' },
  ],

  swimming_pool: [
    { x: -7,   y: 0,   z: -5,   w: 14,  h: 0.5, d: 10,  top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' }, // Tiling surround
    // Pool basin
    { x: -5.5, y: 0.1, z: -3.5, w: 11,  h: 0.6, d: 7,   top: '#0288D1', right: '#01579B', front: '#0277BD' }, // Water
    { x: -5.5, y: 0,   z: -3.5, w: 11,  h: 0.3, d: 0.3, top: '#B3E5FC', right: '#81D4FA', front: '#81D4FA' }, // Pool edge lip N
    { x: -5.5, y: 0,   z:  3.2, w: 11,  h: 0.3, d: 0.3, top: '#B3E5FC', right: '#81D4FA', front: '#81D4FA' }, // Pool edge lip S
    // Lane divider floats
    { x: -5.2, y: 0.7, z: -1.8, w: 10.4,h: 0.2, d: 0.2, top: '#F44336', right: '#C62828', front: '#D32F2F' },
    { x: -5.2, y: 0.7, z: -0.2, w: 10.4,h: 0.2, d: 0.2, top: '#F44336', right: '#C62828', front: '#D32F2F' },
    { x: -5.2, y: 0.7, z:  1.4, w: 10.4,h: 0.2, d: 0.2, top: '#F44336', right: '#C62828', front: '#D32F2F' },
    // Diving board
    { x: -5,   y: 0.5, z:  0,   w: 0.5, h: 2,   d: 0.5, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Board post
    { x: -5.5, y: 2.5, z: -0.5, w: 3,   h: 0.3, d: 1,   top: '#1E88E5', right: '#1565C0', front: '#1976D2' }, // Board plank
    // Pool edge seating/loungers
    { x:  5,   y: 0.5, z: -3,   w: 2.5, h: 0.4, d: 1,   top: '#FFCC80', right: '#FFA726', front: '#FFB74D' },
    { x:  5,   y: 0.5, z: -1.5, w: 2.5, h: 0.4, d: 1,   top: '#FFCC80', right: '#FFA726', front: '#FFB74D' },
  ],

  pitch: [
    { x: -10,  y: 0,   z: -6,   w: 20,  h: 0.3, d: 12,  top: '#2E7D32', right: '#1B5E20', front: '#256029' }, // Grass
    // Stripe pattern
    { x: -10,  y: 0.3, z: -6,   w: 5,   h: 0.05,d: 12,  top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    { x:  0,   y: 0.3, z: -6,   w: 5,   h: 0.05,d: 12,  top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    // Pitch lines
    { x: -10,  y: 0.35,z: -0.1, w: 20,  h: 0.1, d: 0.2, top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' }, // Centre line
    { x: -0.1, y: 0.35,z: -6,   w: 0.2, h: 0.1, d: 12,  top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' }, // Midfield circle
    { x: -9.8, y: 0.35,z: -4,   w: 3,   h: 0.1, d: 8,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' }, // Penalty box L
    { x:  6.8, y: 0.35,z: -4,   w: 3,   h: 0.1, d: 8,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' }, // Penalty box R
    // Goals
    { x: -10.5,y: 0.3, z: -1.5, w: 0.5, h: 2.5, d: 3,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    { x:  10,  y: 0.3, z: -1.5, w: 0.5, h: 2.5, d: 3,   top: '#FFFFFF', right: '#EEEEEE', front: '#EEEEEE' },
    // Corner flags
    { x: -10,  y: 0.3, z: -6,   w: 0.2, h: 3,   d: 0.2, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    { x:  9.8, y: 0.3, z: -6,   w: 0.2, h: 3,   d: 0.2, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    { x: -10,  y: 0.3, z:  5.8, w: 0.2, h: 3,   d: 0.2, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
    { x:  9.8, y: 0.3, z:  5.8, w: 0.2, h: 3,   d: 0.2, top: '#FDD835', right: '#F9A825', front: '#FFEE58' },
  ],

  // ── Trees ──────────────────────────────────────────────────────────────────
  tree: [
    { x: -0.6, y: 0,   z: -0.6, w: 1.2, h: 4,   d: 1.2, top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x: -2.5, y: 4,   z: -2.5, w: 5,   h: 3,   d: 5,   top: '#388E3C', right: '#1B5E20', front: '#2E7D32' },
    { x: -2,   y: 7,   z: -2,   w: 4,   h: 2,   d: 4,   top: '#43A047', right: '#2E7D32', front: '#388E3C' },
    { x: -1,   y: 9,   z: -1,   w: 2,   h: 2,   d: 2,   top: '#66BB6A', right: '#43A047', front: '#43A047' },
  ],

  forest: [
    // Tree 1
    { x: -4,   y: 0,   z: -3,   w: 1,   h: 4,   d: 1,   top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -6,   y: 4,   z: -5,   w: 5,   h: 5,   d: 5,   top: '#1B5E20', right: '#0a3a0a', front: '#0a4a0a' },
    { x: -5.5, y: 9,   z: -4.5, w: 4,   h: 2,   d: 4,   top: '#256029', right: '#1B5E20', front: '#1B5E20' },
    // Tree 2
    { x:  2.5, y: 0,   z:  0.5, w: 1.2, h: 5,   d: 1.2, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x:  0.5, y: 5,   z: -1.5, w: 5,   h: 5,   d: 5,   top: '#1B5E20', right: '#0a3a0a', front: '#0a4a0a' },
    { x:  1,   y: 10,  z: -1,   w: 4,   h: 2,   d: 4,   top: '#256029', right: '#1B5E20', front: '#1B5E20' },
    // Undergrowth
    { x: -2,   y: 0,   z:  2,   w: 4,   h: 1.5, d: 3,   top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    { x:  4,   y: 0,   z: -4,   w: 3,   h: 1,   d: 3,   top: '#4CAF50', right: '#388E3C', front: '#43A047' },
  ],

  wood: [
    { x: -1.2, y: 0,   z: -1.2, w: 2.4, h: 5,   d: 2.4, top: '#4E342E', right: '#2C1003', front: '#3E2723' },
    { x: -4.5, y: 5,   z: -4.5, w: 9,   h: 3,   d: 9,   top: '#1B5E20', right: '#0a3a0a', front: '#0a4a0a' },
    { x: -3.5, y: 8,   z: -3.5, w: 7,   h: 3,   d: 7,   top: '#256029', right: '#1B5E20', front: '#1B5E20' },
    { x: -2,   y: 11,  z: -2,   w: 4,   h: 2,   d: 4,   top: '#388E3C', right: '#256029', front: '#2E7D32' },
  ],

  // ── Tourism ────────────────────────────────────────────────────────────────
  attraction: [
    { x: -5,   y: 0,   z: -5,   w: 10,  h: 2,   d: 10,  top: '#D7CCC8', right: '#A1887F', front: '#BCAAA4' }, // Plaza base
    { x: -2.5, y: 2,   z: -2.5, w: 5,   h: 1,   d: 5,   top: '#BDBDBD', right: '#9E9E9E', front: '#ADADAD' }, // Plinth
    { x: -2,   y: 3,   z: -2,   w: 4,   h: 12,  d: 4,   top: '#FF8F00', right: '#E65100', front: '#FF6F00' }, // Tower / obelisk
    { x: -1.5, y: 15,  z: -1.5, w: 3,   h: 1,   d: 3,   top: '#FFC107', right: '#FF8F00', front: '#FF8F00' }, // Gold cap
    { x: -0.5, y: 16,  z: -0.5, w: 1,   h: 3,   d: 1,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Tip
    // Surrounding structures
    { x: -5,   y: 2,   z: -5,   w: 1.5, h: 4,   d: 1.5, top: '#CFCFCF', right: '#AFAFAF', front: '#BFBFBF' }, // Corner post TL
    { x:  3.5, y: 2,   z: -5,   w: 1.5, h: 4,   d: 1.5, top: '#CFCFCF', right: '#AFAFAF', front: '#BFBFBF' }, // Corner post TR
    { x: -5,   y: 2,   z:  3.5, w: 1.5, h: 4,   d: 1.5, top: '#CFCFCF', right: '#AFAFAF', front: '#BFBFBF' }, // Corner post BL
    { x:  3.5, y: 2,   z:  3.5, w: 1.5, h: 4,   d: 1.5, top: '#CFCFCF', right: '#AFAFAF', front: '#BFBFBF' }, // Corner post BR
  ],

  museum: [
    { x: -8,   y: 0,   z: -7,   w: 16,  h: 1.5, d: 14,  top: '#D7CCC8', right: '#A1887F', front: '#BCAAA4' }, // Base
    { x: -7,   y: 1.5, z: -6,   w: 14,  h: 8,   d: 12,  top: '#F5F0E8', right: '#DDD5C5', front: '#EDE5D5' }, // Main block
    // Classical columns — 4 across front
    { x: -6.5, y: 0,   z:  6,   w: 1.8, h: 10,  d: 1.8, top: '#D7CCC8', right: '#BCAAA4', front: '#C8B8A8' },
    { x: -2.7, y: 0,   z:  6,   w: 1.8, h: 10,  d: 1.8, top: '#D7CCC8', right: '#BCAAA4', front: '#C8B8A8' },
    { x:  0.9, y: 0,   z:  6,   w: 1.8, h: 10,  d: 1.8, top: '#D7CCC8', right: '#BCAAA4', front: '#C8B8A8' },
    { x:  4.7, y: 0,   z:  6,   w: 1.8, h: 10,  d: 1.8, top: '#D7CCC8', right: '#BCAAA4', front: '#C8B8A8' },
    // Entablature
    { x: -8,   y: 9.5, z:  5.5, w: 16,  h: 1.5, d: 3,   top: '#C8B8A8', right: '#A89888', front: '#B8A898' },
    // Pediment
    { x: -8,   y: 11,  z:  5,   w: 16,  h: 2.5, d: 2.5, top: '#BEB0A0', right: '#9E9080', front: '#AEA090' },
    // Roof
    { x: -7,   y: 9.5, z: -6,   w: 14,  h: 1,   d: 12,  top: '#D0C8B8', right: '#B0A898', front: '#C0B8A8' },
    // Entry door
    { x: -2,   y: 1.5, z:  6,   w: 4,   h: 8,   d: 0.5, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    // Artifact on plinth inside (visible through glass)
    { x: -1,   y: 1.5, z:  2,   w: 2,   h: 3,   d: 2,   top: '#9E9E9E', right: '#757575', front: '#BDBDBD' },
    { x: -0.8, y: 4.5, z:  2.2, w: 1.6, h: 3,   d: 1.6, top: '#CE93D8', right: '#AB47BC', front: '#BA68C8' }, // Display object
  ],

  hotel: [
    { x: -7,   y: 0,   z: -7,   w: 14,  h: 2,   d: 14,  top: '#BF8A30', right: '#8B6020', front: '#A0751E' }, // Gold lobby base
    { x: -6,   y: 2,   z: -6,   w: 12,  h: 16,  d: 12,  top: '#F5F0E8', right: '#DDD5C5', front: '#EDE5D5' }, // Tower
    // Window grid — front face
    { x: -5,   y: 3,   z:  6,   w: 10,  h: 14,  d: 0.3, top: '#CFD8DC', right: '#90A4AE', front: '#B0BEC5' },
    // Balcony slabs every 2 floors
    { x: -5.5, y: 5,   z:  6,   w: 11,  h: 0.4, d: 1,   top: '#BF8A30', right: '#8B6020', front: '#A0751E' },
    { x: -5.5, y: 9,   z:  6,   w: 11,  h: 0.4, d: 1,   top: '#BF8A30', right: '#8B6020', front: '#A0751E' },
    { x: -5.5, y: 13,  z:  6,   w: 11,  h: 0.4, d: 1,   top: '#BF8A30', right: '#8B6020', front: '#A0751E' },
    { x: -6,   y: 18,  z: -6,   w: 12,  h: 0.8, d: 12,  top: '#BF8A30', right: '#8B6020', front: '#A0751E' }, // Roof cap
    { x: -4,   y: 18.8,z: -4,   w: 8,   h: 1.5, d: 8,   top: '#D4A030', right: '#A07820', front: '#B88C28' }, // Parapet
    // Entrance canopy
    { x: -3,   y: 2,   z:  6,   w: 6,   h: 0.5, d: 2.5, top: '#BF8A30', right: '#8B6020', front: '#A0751E' },
    { x: -2,   y: 0,   z:  6,   w: 4,   h: 3,   d: 0.4, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Entrance doors
  ],

  viewpoint: [
    { x: -4,   y: 0,   z: -4,   w: 8,   h: 1,   d: 8,   top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Wooden platform
    { x: -4.2, y: 0,   z: -4.2, w: 8.4, h: 0.2, d: 8.4, top: '#795548', right: '#5D4037', front: '#6D4C41' }, // Deck boards top
    // Railing posts
    { x: -4,   y: 1,   z: -4,   w: 0.3, h: 2,   d: 0.3, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x:  3.7, y: 1,   z: -4,   w: 0.3, h: 2,   d: 0.3, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -4,   y: 1,   z:  3.7, w: 0.3, h: 2,   d: 0.3, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x:  3.7, y: 1,   z:  3.7, w: 0.3, h: 2,   d: 0.3, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -4,   y: 2.5, z: -4,   w: 8,   h: 0.3, d: 0.3, top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Rail N
    { x: -4,   y: 2.5, z:  3.7, w: 8,   h: 0.3, d: 0.3, top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Rail S
    { x: -4,   y: 2.5, z: -4,   w: 0.3, h: 0.3, d: 8,   top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Rail W
    { x:  3.7, y: 2.5, z: -4,   w: 0.3, h: 0.3, d: 8,   top: '#8D6E63', right: '#6D4C41', front: '#795548' }, // Rail E
    // Info board
    { x: -2.5, y: 1,   z:  3,   w: 5,   h: 3.5, d: 0.5, top: '#FF7043', right: '#DD5522', front: '#EE6633' },
    { x: -2.3, y: 1.3, z:  3.5, w: 4.6, h: 2.8, d: 0.2, top: '#FFF9C4', right: '#FFF176', front: '#FFF9C4' }, // Map paper
  ],

  information: [
    { x: -2.5, y: 0,   z: -2.5, w: 5,   h: 0.5, d: 5,   top: '#9E9E9E', right: '#757575', front: '#9E9E9E' }, // Base slab
    { x: -2.5, y: 0.5, z: -2.5, w: 5,   h: 5,   d: 5,   top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' }, // Booth walls
    { x: -2,   y: 0.5, z:  2.5, w: 4,   h: 4,   d: 0.3, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' }, // Glass front
    { x: -0.5, y: 0.5, z:  2.5, w: 1,   h: 5,   d: 0.4, top: '#546E7A', right: '#37474F', front: '#455A64' }, // Door frame
    { x: -3,   y: 5.5, z: -3,   w: 6,   h: 0.8, d: 6,   top: '#0288D1', right: '#01579B', front: '#0277BD' }, // Blue roof
    // "i" sign on roof
    { x: -0.5, y: 6.3, z: -0.5, w: 1,   h: 2,   d: 1,   top: '#FFFFFF', right: '#E0E0E0', front: '#EEEEEE' },
    { x: -0.3, y: 8.3, z: -0.3, w: 0.6, h: 0.6, d: 0.6, top: '#FFFFFF', right: '#E0E0E0', front: '#EEEEEE' },
  ],

  // ── Fauna ──────────────────────────────────────────────────────────────────
  bird: [
    { x: -0.5, y: 0.5, z: -0.7, w: 1,   h: 1,   d: 1.8, top: '#F0F0F0', right: '#D0D0D0', front: '#E0E0E0' }, // Body main
    { x: -0.5, y: 0.8, z:  0.2, w: 1,   h: 0.8, d: 1,   top: '#FFFFFF', right: '#E8E8E8', front: '#F0F0F0' }, // Chest
    { x: -0.45,y: 1.3, z:  0.7, w: 0.9, h: 0.9, d: 0.9, top: '#F0F0F0', right: '#D0D0D0', front: '#E0E0E0' }, // Head
    { x: -0.2, y: 1.5, z:  1.1, w: 0.5, h: 0.3, d: 0.4, top: '#FFA726', right: '#FF8F00', front: '#FF8F00' }, // Beak upper
    { x: -0.2, y: 1.4, z:  1.1, w: 0.5, h: 0.2, d: 0.3, top: '#FF8F00', right: '#E65100', front: '#F57F17' }, // Beak lower
    { x: -0.2, y: 1.6, z:  0.9, w: 0.2, h: 0.2, d: 0.1, top: '#111111', right: '#000000', front: '#000000' }, // Eye L
    { x:  0.1, y: 1.6, z:  0.9, w: 0.2, h: 0.2, d: 0.1, top: '#111111', right: '#000000', front: '#000000' }, // Eye R
    { x: -1.2, y: 0.6, z: -0.5, w: 0.5, h: 0.9, d: 1.4, top: '#90CAF9', right: '#42A5F5', front: '#64B5F6' }, // Left wing
    { x:  0.7, y: 0.6, z: -0.5, w: 0.5, h: 0.9, d: 1.4, top: '#90CAF9', right: '#42A5F5', front: '#64B5F6' }, // Right wing
    { x: -0.8, y: 0.5, z: -1.8, w: 0.7, h: 0.9, d: 0.7, top: '#BBDEFB', right: '#90CAF9', front: '#90CAF9' }, // Tail L
    { x:  0.1, y: 0.5, z: -1.8, w: 0.7, h: 0.9, d: 0.7, top: '#BBDEFB', right: '#90CAF9', front: '#90CAF9' }, // Tail R
    { x: -0.35,y: 0,   z:  0.2, w: 0.2, h: 0.5, d: 0.2, top: '#FF8F00', right: '#E65100', front: '#FF8F00' }, // Leg L
    { x:  0.15,y: 0,   z:  0.2, w: 0.2, h: 0.5, d: 0.2, top: '#FF8F00', right: '#E65100', front: '#FF8F00' }, // Leg R
    { x: -0.55,y: 0,   z:  0.35,w: 0.5, h: 0.1, d: 0.5, top: '#FF8F00', right: '#E65100', front: '#FF8F00' }, // Foot L
    { x:  0,   y: 0,   z:  0.35,w: 0.5, h: 0.1, d: 0.5, top: '#FF8F00', right: '#E65100', front: '#FF8F00' }, // Foot R
  ],

  squirrel: [
    { x: -0.6, y: 0,   z: -1.2, w: 1.2, h: 1.2, d: 2.4, top: '#A1673A', right: '#7B4A20', front: '#8B5A2B' }, // Lower body
    { x: -0.6, y: 1.2, z: -0.7, w: 1.2, h: 1.2, d: 1.8, top: '#A1673A', right: '#7B4A20', front: '#8B5A2B' }, // Upper body
    { x: -0.55,y: 2.4, z:  0.4, w: 1.1, h: 1.2, d: 1.2, top: '#A1673A', right: '#7B4A20', front: '#8B5A2B' }, // Head
    { x: -0.9, y: 3.4, z:  0.5, w: 0.4, h: 0.6, d: 0.4, top: '#7B4A20', right: '#5A3010', front: '#6B4020' }, // Ear L
    { x:  0.5, y: 3.4, z:  0.5, w: 0.4, h: 0.6, d: 0.4, top: '#7B4A20', right: '#5A3010', front: '#6B4020' }, // Ear R
    { x: -0.2, y: 2.7, z:  1.4, w: 0.5, h: 0.2, d: 0.5, top: '#5A3010', right: '#3A1A00', front: '#3A1A00' }, // Nose
    { x: -0.2, y: 2.9, z:  1.3, w: 0.2, h: 0.2, d: 0.1, top: '#111111', right: '#000000', front: '#000000' }, // Eye L
    { x:  0.1, y: 2.9, z:  1.3, w: 0.2, h: 0.2, d: 0.1, top: '#111111', right: '#000000', front: '#000000' }, // Eye R
    // Belly lighter
    { x: -0.4, y: 0.3, z: -0.3, w: 0.8, h: 0.5, d: 1.5, top: '#D4A06A', right: '#B07A44', front: '#C08A54' },
    // Big fluffy tail
    { x: -0.9, y: 0.6, z: -2.8, w: 1.5, h: 1.5, d: 1.2, top: '#7B4A20', right: '#5A3010', front: '#5A3010' }, // Tail base
    { x: -0.8, y: 1.5, z: -3.2, w: 1.4, h: 1.4, d: 0.8, top: '#5A3010', right: '#3A1A00', front: '#3A1A00' }, // Tail mid
    { x: -0.5, y: 2.3, z: -2.8, w: 0.8, h: 0.8, d: 0.5, top: '#C89A6A', right: '#A07A4A', front: '#A07A4A' }, // Tail fluffy tip
    // Legs
    { x: -0.5, y: 0,   z:  0.8, w: 0.7, h: 0.7, d: 0.7, top: '#8B5A2B', right: '#6B4020', front: '#6B4020' }, // Front leg L
    { x: -0.2, y: 0,   z:  0.8, w: 0.7, h: 0.7, d: 0.7, top: '#8B5A2B', right: '#6B4020', front: '#6B4020' }, // Front leg R
    { x: -0.5, y: 0,   z: -1.5, w: 0.7, h: 0.7, d: 0.7, top: '#8B5A2B', right: '#6B4020', front: '#6B4020' }, // Hind leg L
    { x: -0.2, y: 0,   z: -1.5, w: 0.7, h: 0.7, d: 0.7, top: '#8B5A2B', right: '#6B4020', front: '#6B4020' }, // Hind leg R
  ],

  wolf: [
    { x: -1.2, y: 0,   z: -2.5, w: 2.4, h: 2.5, d: 5,   top: '#9E9E9E', right: '#757575', front: '#8D8D8D' }, // Body
    { x: -1,   y: 2,   z: -3.5, w: 2,   h: 1.8, d: 2.5, top: '#9E9E9E', right: '#757575', front: '#8D8D8D' }, // Neck/head connect
    { x: -1,   y: 2.5, z: -4.8, w: 2,   h: 2,   d: 2.5, top: '#BDBDBD', right: '#9E9E9E', front: '#ADADAD' }, // Head
    { x: -0.8, y: 4,   z: -5,   w: 0.5, h: 0.8, d: 0.5, top: '#757575', right: '#555555', front: '#757575' }, // Ear L
    { x:  0.3, y: 4,   z: -5,   w: 0.5, h: 0.8, d: 0.5, top: '#757575', right: '#555555', front: '#757575' }, // Ear R
    { x: -0.4, y: 2.9, z: -5.3, w: 0.8, h: 0.6, d: 0.8, top: '#616161', right: '#424242', front: '#616161' }, // Snout
    { x: -0.2, y: 3.1, z: -5.4, w: 0.2, h: 0.2, d: 0.1, top: '#111111', right: '#000000', front: '#000000' }, // Eye L
    { x:  0.1, y: 3.1, z: -5.4, w: 0.2, h: 0.2, d: 0.1, top: '#111111', right: '#000000', front: '#000000' }, // Eye R
    // Belly lighter
    { x: -0.8, y: 0.3, z: -2,   w: 1.6, h: 0.5, d: 3.5, top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' },
    // Legs
    { x: -1.2, y: -2,  z: -1.5, w: 0.8, h: 2,   d: 0.8, top: '#9E9E9E', right: '#757575', front: '#8D8D8D' },
    { x:  0.4, y: -2,  z: -1.5, w: 0.8, h: 2,   d: 0.8, top: '#9E9E9E', right: '#757575', front: '#8D8D8D' },
    { x: -1.2, y: -2,  z:  0.5, w: 0.8, h: 2,   d: 0.8, top: '#9E9E9E', right: '#757575', front: '#8D8D8D' },
    { x:  0.4, y: -2,  z:  0.5, w: 0.8, h: 2,   d: 0.8, top: '#9E9E9E', right: '#757575', front: '#8D8D8D' },
    // Tail
    { x: -0.5, y: 1,   z:  2.5, w: 1,   h: 1,   d: 2,   top: '#757575', right: '#555555', front: '#616161' },
    { x: -0.3, y: 1.8, z:  3.8, w: 0.6, h: 0.6, d: 1.5, top: '#E0E0E0', right: '#BDBDBD', front: '#CFCFCF' }, // White tail tip
  ],

  insect: [
    { x: -0.5, y: 0.3, z: -0.6, w: 1,   h: 0.6, d: 1,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Abdomen
    { x: -0.2, y: 0.3, z: -0.2, w: 0.4, h: 0.2, d: 0.2, top: '#212121', right: '#111111', front: '#111111' }, // Waist
    { x: -0.45,y: 0.4, z:  0,   w: 0.9, h: 0.6, d: 0.8, top: '#212121', right: '#111111', front: '#111111' }, // Thorax
    { x: -0.4, y: 0.8, z:  0.2, w: 0.8, h: 0.7, d: 0.8, top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Head
    // Wings
    { x: -1.5, y: 0.6, z: -0.5, w: 1,   h: 0.1, d: 1.5, top: '#E3F2FD', right: '#B3E5FC', front: '#B3E5FC' }, // Wing L
    { x:  0.5, y: 0.6, z: -0.5, w: 1,   h: 0.1, d: 1.5, top: '#E3F2FD', right: '#B3E5FC', front: '#B3E5FC' }, // Wing R
    // Antennae
    { x: -0.3, y: 1.5, z:  0.5, w: 0.1, h: 0.1, d: 0.8, top: '#212121', right: '#111111', front: '#111111' },
    { x:  0.2, y: 1.5, z:  0.5, w: 0.1, h: 0.1, d: 0.8, top: '#212121', right: '#111111', front: '#111111' },
    // Legs
    { x: -1.2, y: 0.3, z: -0.2, w: 0.8, h: 0.1, d: 0.2, top: '#212121', right: '#111111', front: '#111111' },
    { x:  0.4, y: 0.3, z: -0.2, w: 0.8, h: 0.1, d: 0.2, top: '#212121', right: '#111111', front: '#111111' },
    { x: -1.3, y: 0.3, z:  0.1, w: 0.9, h: 0.1, d: 0.2, top: '#212121', right: '#111111', front: '#111111' },
    { x:  0.4, y: 0.3, z:  0.1, w: 0.9, h: 0.1, d: 0.2, top: '#212121', right: '#111111', front: '#111111' },
    // Stripes
    { x: -0.5, y: 0.5, z: -0.2, w: 1,   h: 0.1, d: 0.2, top: '#212121', right: '#111111', front: '#111111' },
    { x: -0.5, y: 0.5, z: -0.5, w: 1,   h: 0.1, d: 0.2, top: '#212121', right: '#111111', front: '#111111' },
  ],

  // ── Flora ──────────────────────────────────────────────────────────────────
  shrub: [
    { x: -2.5, y: 0,   z: -2.5, w: 5,   h: 1,   d: 5,   top: '#2E7D32', right: '#1B5E20', front: '#256029' }, // Base dense
    { x: -2,   y: 1,   z: -2,   w: 4,   h: 2,   d: 4,   top: '#388E3C', right: '#2E7D32', front: '#2E7D32' }, // Mid
    { x: -1.5, y: 3,   z: -1.5, w: 3,   h: 1.5, d: 3,   top: '#43A047', right: '#388E3C', front: '#388E3C' }, // Top
    { x: -0.8, y: 4.5, z: -0.8, w: 1.6, h: 1,   d: 1.6, top: '#66BB6A', right: '#43A047', front: '#43A047' }, // Top clump
    { x: -2.5, y: 0.5, z: -2.8, w: 1.5, h: 0.8, d: 0.5, top: '#F48FB1', right: '#E91E63', front: '#EC407A' }, // Flowers front
    { x:  1,   y: 0.5, z: -2.8, w: 1.5, h: 0.8, d: 0.5, top: '#FFEE58', right: '#FDD835', front: '#FDD835' }, // Flowers 2
  ],

  fern: [
    { x: -0.2, y: 0,   z: -0.2, w: 0.4, h: 0.5, d: 0.4, top: '#1B5E20', right: '#0D3B12', front: '#256029' }, // Base stem
    { x: -3.5, y: 0.4, z: -0.3, w: 7,   h: 0.3, d: 0.6, top: '#388E3C', right: '#2E7D32', front: '#2E7D32' }, // Frond H 1
    { x: -3,   y: 0.7, z: -0.3, w: 6,   h: 0.3, d: 0.6, top: '#43A047', right: '#388E3C', front: '#388E3C' }, // Frond H 2
    { x: -0.3, y: 0.4, z: -3.5, w: 0.6, h: 0.3, d: 7,   top: '#388E3C', right: '#2E7D32', front: '#2E7D32' }, // Frond V 1
    { x: -0.3, y: 0.7, z: -3,   w: 0.6, h: 0.3, d: 6,   top: '#43A047', right: '#388E3C', front: '#388E3C' }, // Frond V 2
    // Diagonal fronds
    { x: -2.5, y: 0.3, z: -2.5, w: 5,   h: 0.2, d: 1,   top: '#4CAF50', right: '#388E3C', front: '#388E3C' },
    { x: -2.5, y: 0.3, z:  1.5, w: 5,   h: 0.2, d: 1,   top: '#4CAF50', right: '#388E3C', front: '#388E3C' },
  ],

  flower_wild: [
    { x: -0.15,y: 0,   z: -0.15,w: 0.3, h: 2.5, d: 0.3, top: '#66BB6A', right: '#43A047', front: '#43A047' }, // Stem
    { x: -0.8, y: 2,   z: -0.8, w: 0.4, h: 0.5, d: 1.6, top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' }, // Petal row 1
    { x: -0.8, y: 2,   z: -0.3, w: 1.6, h: 0.5, d: 0.4, top: '#F5F5F5', right: '#E0E0E0', front: '#EEEEEE' }, // Petal row 2
    { x: -0.5, y: 2.5, z: -0.5, w: 1,   h: 0.4, d: 1,   top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Centre
    // Leaves on stem
    { x:  0.1, y: 0.8, z: -0.1, w: 0.8, h: 0.2, d: 0.4, top: '#66BB6A', right: '#43A047', front: '#43A047' },
    { x: -0.9, y: 1.4, z: -0.1, w: 0.8, h: 0.2, d: 0.4, top: '#66BB6A', right: '#43A047', front: '#43A047' },
  ],

  flower_anemone: [
    { x: -0.1, y: 0,   z: -0.1, w: 0.2, h: 2,   d: 0.2, top: '#2E7D32', right: '#1B5E20', front: '#1B5E20' }, // Stem
    { x: -0.7, y: 1.8, z: -0.7, w: 0.5, h: 0.5, d: 1.4, top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' }, // Petal 1
    { x: -0.7, y: 1.8, z: -0.2, w: 1.4, h: 0.5, d: 0.5, top: '#9575CD', right: '#7B1FA2', front: '#7E57C2' }, // Petal 2
    { x: -0.5, y: 2.3, z: -0.5, w: 1,   h: 0.4, d: 1,   top: '#311B92', right: '#1A0A75', front: '#283593' }, // Dark centre
    { x: -0.25,y: 2.6, z: -0.25,w: 0.5, h: 0.3, d: 0.5, top: '#FDD835', right: '#F9A825', front: '#FFEE58' }, // Stamen
    // Small leaf
    { x: -0.1, y: 1,   z:  0.2, w: 0.8, h: 0.15,d: 0.5, top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
  ],

  grass_tuft: [
    { x: -0.6, y: 0,   z: -0.1, w: 0.2, h: 2,   d: 0.1, top: '#81C784', right: '#4CAF50', front: '#4CAF50' },
    { x: -0.2, y: 0,   z: -0.1, w: 0.2, h: 1.7, d: 0.1, top: '#81C784', right: '#4CAF50', front: '#4CAF50' },
    { x:  0.2, y: 0,   z: -0.1, w: 0.2, h: 2.2, d: 0.1, top: '#66BB6A', right: '#43A047', front: '#43A047' },
    { x: -0.1, y: 0,   z: -0.6, w: 0.1, h: 1.5, d: 0.2, top: '#81C784', right: '#4CAF50', front: '#4CAF50' },
    { x: -0.1, y: 0,   z:  0.2, w: 0.1, h: 1.8, d: 0.2, top: '#66BB6A', right: '#43A047', front: '#43A047' },
    { x: -0.1, y: 0,   z:  0.6, w: 0.1, h: 1.3, d: 0.2, top: '#81C784', right: '#4CAF50', front: '#4CAF50' },
  ],

  tree_oak: [
    { x: -1,   y: 0,   z: -1,   w: 2,   h: 4,   d: 2,   top: '#6D4C41', right: '#4E342E', front: '#5D4037' },
    { x: -0.5, y: 2,   z: -0.5, w: 1,   h: 3,   d: 1,   top: '#795548', right: '#5D4037', front: '#6D4C41' }, // Upper trunk branch
    { x: -5,   y: 4,   z: -5,   w: 10,  h: 3,   d: 10,  top: '#256029', right: '#1B5E20', front: '#256029' }, // Lower canopy
    { x: -4,   y: 7,   z: -4,   w: 8,   h: 3,   d: 8,   top: '#2E7D32', right: '#256029', front: '#2E7D32' }, // Mid canopy
    { x: -3,   y: 10,  z: -3,   w: 6,   h: 2,   d: 6,   top: '#388E3C', right: '#2E7D32', front: '#2E7D32' }, // Upper canopy
    { x: -1.5, y: 12,  z: -1.5, w: 3,   h: 1.5, d: 3,   top: '#43A047', right: '#388E3C', front: '#388E3C' }, // Top tuft
  ],

  tree_pine: [
    { x: -0.6, y: 0,   z: -0.6, w: 1.2, h: 4,   d: 1.2, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -3.5, y: 3,   z: -3.5, w: 7,   h: 2.5, d: 7,   top: '#1B5E20', right: '#0a2a0a', front: '#0a3a0a' },
    { x: -3,   y: 5.5, z: -3,   w: 6,   h: 2.5, d: 6,   top: '#256029', right: '#1B5E20', front: '#1B5E20' },
    { x: -2.5, y: 8,   z: -2.5, w: 5,   h: 2.5, d: 5,   top: '#2E7D32', right: '#256029', front: '#256029' },
    { x: -1.5, y: 10.5,z: -1.5, w: 3,   h: 2.5, d: 3,   top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    { x: -0.8, y: 13,  z: -0.8, w: 1.6, h: 2,   d: 1.6, top: '#43A047', right: '#388E3C', front: '#388E3C' },
    { x: -0.3, y: 15,  z: -0.3, w: 0.6, h: 1.5, d: 0.6, top: '#66BB6A', right: '#43A047', front: '#43A047' },
  ],

  tree_palm: [
    { x: -0.6, y: 0,   z: -0.6, w: 1.2, h: 2,   d: 1.2, top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    { x: -0.65,y: 2,   z: -0.65,w: 1.3, h: 2,   d: 1.3, top: '#795548', right: '#5D4037', front: '#6D4C41' },
    { x: -0.55,y: 4,   z: -0.55,w: 1.1, h: 2,   d: 1.1, top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    { x: -0.5, y: 6,   z: -0.5, w: 1,   h: 2,   d: 1,   top: '#795548', right: '#5D4037', front: '#6D4C41' },
    { x: -0.4, y: 8,   z: -0.4, w: 0.8, h: 2,   d: 0.8, top: '#8D6E63', right: '#6D4C41', front: '#795548' },
    // Fronds — 4 crossing planes + diagonals
    { x: -5.5, y: 9.5, z:  0,   w: 11,  h: 0.3, d: 0.8, top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    { x:  0,   y: 9.5, z: -5.5, w: 0.8, h: 0.3, d: 11,  top: '#388E3C', right: '#2E7D32', front: '#2E7D32' },
    { x: -4,   y: 9.2, z: -1,   w: 8,   h: 0.3, d: 0.7, top: '#43A047', right: '#388E3C', front: '#388E3C' },
    { x: -1,   y: 9.2, z: -4,   w: 0.7, h: 0.3, d: 8,   top: '#43A047', right: '#388E3C', front: '#388E3C' },
    { x: -3.5, y: 8.9, z: -3.5, w: 7,   h: 0.3, d: 0.6, top: '#4CAF50', right: '#43A047', front: '#43A047' },
    { x: -3.5, y: 8.9, z:  2.9, w: 7,   h: 0.3, d: 0.6, top: '#4CAF50', right: '#43A047', front: '#43A047' },
    // Coconuts
    { x: -0.4, y: 9.5, z: -0.4, w: 0.8, h: 0.8, d: 0.8, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
    { x: -1,   y: 9.2, z:  0,   w: 0.7, h: 0.7, d: 0.7, top: '#5D4037', right: '#3E2723', front: '#4E342E' },
  ],

  // ── Misc ───────────────────────────────────────────────────────────────────
  npc_person: [
    { x: -0.5, y: 0,   z: -0.5, w: 0.5, h: 1.6, d: 1,   top: '#37474F', right: '#263238', front: '#455A64' }, // Leg L
    { x:  0,   y: 0,   z: -0.5, w: 0.5, h: 1.6, d: 1,   top: '#263238', right: '#1C2B30', front: '#37474F' }, // Leg R
    { x: -0.7, y: 1.6, z: -0.5, w: 1.4, h: 2,   d: 1,   top: '#1976D2', right: '#1565C0', front: '#1E88E5' }, // Torso
    // Arms
    { x: -1.2, y: 1.6, z: -0.4, w: 0.5, h: 1.6, d: 0.8, top: '#1565C0', right: '#0D47A1', front: '#1976D2' }, // Arm L
    { x:  0.7, y: 1.6, z: -0.4, w: 0.5, h: 1.6, d: 0.8, top: '#1565C0', right: '#0D47A1', front: '#1976D2' }, // Arm R
    { x: -0.65,y: 3.6, z: -0.55,w: 1.3, h: 1.3, d: 1.1, top: '#FFCC80', right: '#FFA726', front: '#FFB74D' }, // Head
    { x: -0.5, y: 4.9, z: -0.5, w: 1,   h: 0.4, d: 1,   top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Hair
  ],

  airplane_jet: [
    { x: -3,   y: 0,   z: -0.6, w: 6,   h: 1.2, d: 1.2, top: '#FAFAFA', right: '#E0E0E0', front: '#EEEEEE' }, // Fuselage
    { x:  1,   y: 0.3, z: -0.4, w: 2,   h: 0.6, d: 0.8, top: '#EEEEEE', right: '#CCCCCC', front: '#E0E0E0' }, // Nose cone
    { x: -5,   y: 0.2, z:  0,   w: 10,  h: 0.3, d: 2.5, top: '#F0F0F0', right: '#D0D0D0', front: '#C0C0C0' }, // Wings
    { x: -2,   y: 0.2, z: -2.5, w: 4,   h: 0.2, d: 2,   top: '#E8E8E8', right: '#C8C8C8', front: '#B8B8B8' }, // Rear stabilizers
    { x:  0,   y: 1.2, z: -0.3, w: 0.3, h: 1.5, d: 0.6, top: '#F0F0F0', right: '#D0D0D0', front: '#E0E0E0' }, // Tail fin
    // Engines
    { x: -2.5, y: -0.3,z:  1,   w: 1.5, h: 0.8, d: 0.8, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    { x:  1.5, y: -0.3,z:  1,   w: 1.5, h: 0.8, d: 0.8, top: '#9E9E9E', right: '#757575', front: '#9E9E9E' },
    // Window strip
    { x: -2.5, y: 0.4, z: -0.6, w: 4,   h: 0.3, d: 0.1, top: '#B3E5FC', right: '#4FC3F7', front: '#81D4FA' },
  ],

  car_voxel: [
    { x: -1.2, y: 0,   z: -0.6, w: 2.4, h: 0.7, d: 1.2, top: '#1E88E5', right: '#1565C0', front: '#1976D2' }, // Body lower
    { x: -1,   y: 0.7, z: -0.5, w: 2,   h: 0.6, d: 1,   top: '#42A5F5', right: '#1E88E5', front: '#1E88E5' }, // Cabin
    // Windows
    { x: -0.9, y: 0.75,z: -0.55,w: 1.8, h: 0.5, d: 0.1, top: '#B3E5FC', right: '#81D4FA', front: '#81D4FA' },
    { x: -0.9, y: 0.75,z:  0.45,w: 1.8, h: 0.5, d: 0.1, top: '#B3E5FC', right: '#81D4FA', front: '#81D4FA' },
    // Wheels
    { x: -1.3, y: -0.3,z: -0.6, w: 0.4, h: 0.6, d: 0.6, top: '#212121', right: '#111111', front: '#212121' },
    { x:  0.9, y: -0.3,z: -0.6, w: 0.4, h: 0.6, d: 0.6, top: '#212121', right: '#111111', front: '#212121' },
    { x: -1.3, y: -0.3,z:  0,   w: 0.4, h: 0.6, d: 0.6, top: '#212121', right: '#111111', front: '#212121' },
    { x:  0.9, y: -0.3,z:  0,   w: 0.4, h: 0.6, d: 0.6, top: '#212121', right: '#111111', front: '#212121' },
    // Headlights
    { x: -0.9, y: 0.1, z: -0.6, w: 0.3, h: 0.3, d: 0.1, top: '#FFF9C4', right: '#FFF176', front: '#FFF9C4' },
    { x:  0.6, y: 0.1, z: -0.6, w: 0.3, h: 0.3, d: 0.1, top: '#FFF9C4', right: '#FFF176', front: '#FFF9C4' },
  ],
};