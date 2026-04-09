export const Blueprints = {
  // ── Utilities ──────────────────────────────────────────────────────────────
  bench: [
    { x: -3, y: 0, z: -2, w: 1, h: 2, d: 1, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Leg 1
    { x: 2,  y: 0, z: -2, w: 1, h: 2, d: 1, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Leg 2
    { x: -3, y: 0, z: 1,  w: 1, h: 2, d: 1, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Leg 3
    { x: 2,  y: 0, z: 1,  w: 1, h: 2, d: 1, top: '#5D4037', right: '#3E2723', front: '#4E342E' }, // Leg 4
    { x: -4, y: 2, z: -2, w: 8, h: 1, d: 4, top: '#8D6E63', right: '#5D4037', front: '#6D4C41' }  // Seat
  ],
  post_box: [
    { x: -2, y: 0, z: -2, w: 4, h: 1, d: 4, top: '#222', right: '#111', front: '#111' },    // Base
    { x: -1.5, y: 1, z: -1.5, w: 3, h: 7, d: 3, top: '#cc2222', right: '#aa1111', front: '#bb1111' }, // Body
    { x: -1.5, y: 8, z: -1.5, w: 3, h: 1, d: 3, top: '#ee3333', right: '#cc2222', front: '#cc2222' }  // Cap
  ],
  telephone: [
    { x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, top: '#cc2222', right: '#aa1111', front: '#bb1111' }, // Frame
    { x: -1.5, y: 2, z: -2.1, w: 3, h: 8, d: 0.2, top: '#c8e8ff', right: '#a0c0d0', front: '#a0c0d0' } // Glass
  ],
  waste_basket: [
    { x: -1, y: 0, z: -1, w: 2, h: 3, d: 2, top: '#5a8a5a', right: '#4a7a4a', front: '#4a7a4a' } // Green Bin
  ],
  recycling: [
    { x: -3, y: 0, z: -1, w: 2, h: 3, d: 2, top: '#2266cc', right: '#1155bb', front: '#1155bb' }, // Blue Bin
    { x: 1, y: 0, z: -1, w: 2, h: 3, d: 2, top: '#5a8a5a', right: '#4a7a4a', front: '#4a7a4a' } // Green Bin
  ],
  drinking_water: [
    { x: -1.5, y: 0, z: -1.5, w: 3, h: 3, d: 3, top: '#ddd', right: '#bbb', front: '#ccc' }, // Base
    { x: -0.5, y: 3, z: -0.5, w: 1, h: 1, d: 1, top: '#4ab0e0', right: '#3a90c0', front: '#3a90c0' } // Spout/Water
  ],
  toilets: [
    { x: -3, y: 0, z: -2, w: 6, h: 6, d: 4, top: '#f0f0f0', right: '#d0d0d0', front: '#e0e0e0' }, // Building
    { x: -2, y: 1, z: 2, w: 1.5, h: 4, d: 0.2, top: '#6688cc', right: '#4466aa', front: '#4466aa' }, // Door M
    { x: 0.5, y: 1, z: 2, w: 1.5, h: 4, d: 0.2, top: '#ee66aa', right: '#cc4488', front: '#cc4488' } // Door F
  ],
  atm: [
    { x: -2, y: 0, z: -1, w: 4, h: 5, d: 2, top: '#444', right: '#333', front: '#333' }, // Machine Base
    { x: -1.5, y: 2, z: 1, w: 3, h: 2, d: 0.2, top: '#2255aa', right: '#114499', front: '#114499' } // Screen
  ],

  // ── Food & Drink ───────────────────────────────────────────────────────────
  cafe: [
    { x: -4, y: 0, z: -4, w: 8, h: 6, d: 8, top: '#f5f5f5', right: '#ddd', front: '#eee' }, // Building
    { x: -5, y: 5, z: -5, w: 10, h: 1, d: 2, top: '#d4813a', right: '#a06030', front: '#c8843c' }, // Awning
    { x: -3, y: 0, z: 5,  w: 2, h: 2, d: 2, top: '#8D6E63', right: '#5D4037', front: '#6D4C41' }  // Outside Table
  ],
  restaurant: [
    { x: -6, y: 0, z: -5, w: 12, h: 7, d: 10, top: '#e8e8e8', right: '#cccccc', front: '#dddddd' }, // Building
    { x: -7, y: 5, z: -6, w: 14, h: 1, d: 2, top: '#cc2222', right: '#aa1111', front: '#bb1111' }, // Red Awning
  ],
  fast_food: [
    { x: -5, y: 0, z: -5, w: 10, h: 6, d: 10, top: '#fff', right: '#ddd', front: '#eee' }, // Building
    { x: -1, y: 6, z: -1, w: 2, h: 4, d: 2, top: '#e0a020', right: '#c08010', front: '#d09015' } // Yellow Sign Pillar
  ],
  bar: [
    { x: -4, y: 0, z: -4, w: 8, h: 6, d: 8, top: '#4a3a30', right: '#2a1a10', front: '#3a2a20' }, // Dark Wood Building
    { x: -2, y: 4, z: 4, w: 4, h: 1.5, d: 0.5, top: '#aa6622', right: '#884411', front: '#ffaa44' } // Neon Sign Area
  ],
  pub: [
    { x: -5, y: 0, z: -4, w: 10, h: 7, d: 8, top: '#5c4033', right: '#3c2013', front: '#4c3023' }, // Brick/Wood
    { x: -1.5, y: 2, z: 4, w: 3, h: 4, d: 0.2, top: '#222', right: '#111', front: '#333' } // Pub Door
  ],
  food_court: [
    { x: -8, y: 0, z: -8, w: 16, h: 5, d: 16, top: '#eee', right: '#ccc', front: '#ddd' }, // Large Hall
    { x: -4, y: 5, z: -4, w: 8, h: 2, d: 8, top: '#cc8822', right: '#aa6611', front: '#bb771a' } // Raised Roof
  ],
  ice_cream: [
    { x: -2, y: 0, z: -2, w: 4, h: 3, d: 4, top: '#fff', right: '#eee', front: '#f5f5f5' }, // Stand Base
    { x: -2.5, y: 3, z: -2.5, w: 5, h: 1, d: 5, top: '#f0a0c0', right: '#d080a0', front: '#e090b0' } // Pink Canopy
  ],

  // ── Health ─────────────────────────────────────────────────────────────────
  hospital: [
    { x: -6, y: 0, z: -6, w: 12, h: 12, d: 12, top: '#fff', right: '#ccc', front: '#eee' }, // Main Block
    { x: -1, y: 5, z: 6,  w: 2, h: 6,  d: 1, top: '#ee2222', right: '#cc0000', front: '#cc0000' }, // Red Cross V
    { x: -3, y: 7, z: 6,  w: 6, h: 2,  d: 1, top: '#ee2222', right: '#cc0000', front: '#cc0000' }  // Red Cross H
  ],
  doctors: [
    { x: -4, y: 0, z: -4, w: 8, h: 6, d: 8, top: '#f0f4f8', right: '#d0d4d8', front: '#e0e4e8' }, // Clean Building
    { x: -2, y: 6, z: -1, w: 4, h: 1, d: 2, top: '#2244cc', right: '#1133aa', front: '#1133aa' } // Blue Sign
  ],
  dentist: [
    { x: -3, y: 0, z: -3, w: 6, h: 6, d: 6, top: '#ffffff', right: '#e0e0e0', front: '#f0f0f0' }, // White Building
    { x: -1, y: 2, z: 3, w: 2, h: 2, d: 0.5, top: '#3366dd', right: '#2255bb', front: '#3366dd' } // Tooth/Sign Plate
  ],
  pharmacy: [
    { x: -3, y: 0, z: -3, w: 6, h: 5, d: 6, top: '#fff', right: '#ddd', front: '#eee' }, // Shop
    { x: -0.5, y: 5, z: -0.5, w: 1, h: 3, d: 1, top: '#22cc44', right: '#11aa33', front: '#11aa33' }, // Green Cross V
    { x: -1.5, y: 6, z: -0.5, w: 3, h: 1, d: 1, top: '#22cc44', right: '#11aa33', front: '#11aa33' }  // Green Cross H
  ],
  veterinary: [
    { x: -4, y: 0, z: -4, w: 8, h: 5, d: 8, top: '#eef8ee', right: '#cce8cc', front: '#ddf0dd' }, // Light Green Building
    { x: -1.5, y: 5, z: -1.5, w: 3, h: 1.5, d: 3, top: '#44aa44', right: '#338833', front: '#338833' } // Dark Green Roof Acc.
  ],
  clinic: [
    { x: -5, y: 0, z: -4, w: 10, h: 7, d: 8, top: '#f5f5f5', right: '#d5d5d5', front: '#e5e5e5' },
    { x: -2, y: 7, z: -1, w: 4, h: 1.5, d: 2, top: '#2288cc', right: '#1166aa', front: '#1166aa' } // Light Blue Sign
  ],

  // ── Education ──────────────────────────────────────────────────────────────
  school: [
    { x: -6, y: 0, z: -3, w: 12, h: 6, d: 6, top: '#d2b48c', right: '#b09070', front: '#c0a080' }, // Brick Main
    { x: -1, y: 6, z: -1, w: 2, h: 3, d: 2, top: '#e0a020', right: '#c08010', front: '#c08010' } // Bell Tower
  ],
  university: [
    { x: -8, y: 0, z: -6, w: 16, h: 8, d: 12, top: '#c8b8a8', right: '#a89888', front: '#b8a898' }, // Stone Building
    { x: -3, y: 8, z: -3, w: 6, h: 4, d: 6, top: '#cc8800', right: '#aa6600', front: '#aa6600' } // Dome/Gold Top
  ],
  college: [
    { x: -7, y: 0, z: -5, w: 14, h: 7, d: 10, top: '#ddd', right: '#bbb', front: '#ccc' },
    { x: -5, y: 7, z: -4, w: 10, h: 2, d: 8, top: '#cc9900', right: '#aa7700', front: '#bb8800' } // Roof
  ],
  library: [
    { x: -5, y: 0, z: -4, w: 10, h: 6, d: 8, top: '#eee', right: '#ccc', front: '#ddd' }, // Building
    { x: -4, y: 0, z: 4, w: 1, h: 6, d: 1, top: '#8866aa', right: '#664488', front: '#664488' }, // Pillar L
    { x: 3, y: 0, z: 4, w: 1, h: 6, d: 1, top: '#8866aa', right: '#664488', front: '#664488' } // Pillar R
  ],
  kindergarten: [
    { x: -4, y: 0, z: -3, w: 4, h: 4, d: 6, top: '#ff99aa', right: '#dd7788', front: '#ee8899' }, // Pink Block
    { x: 0, y: 0, z: -3, w: 4, h: 3, d: 6, top: '#88ccff', right: '#66aadd', front: '#77bbdd' } // Blue Block
  ],

  // ── Civic/Religion ─────────────────────────────────────────────────────────
  place_of_worship: [
    { x: -5, y: 0, z: -5, w: 10, h: 6, d: 10, top: '#f0e8d0', right: '#d0c8b0', front: '#e0d8c0' }, // Base
    { x: -3, y: 6, z: -3, w: 6,  h: 12, d: 6,  top: '#f0e8d0', right: '#d0c8b0', front: '#e0d8c0' }, // Tower
    { x: -0.5, y: 18, z: -0.5, w: 1, h: 4, d: 1, top: '#8a6020', right: '#6a4010', front: '#7a5010' } // Spire/Cross
  ],
  police: [
    { x: -5, y: 0, z: -4, w: 10, h: 6, d: 8, top: '#ddd', right: '#bbb', front: '#ccc' }, // Station
    { x: -1, y: 6, z: -1, w: 2, h: 1.5, d: 2, top: '#2244aa', right: '#113388', front: '#113388' } // Blue Light
  ],
  fire_station: [
    { x: -6, y: 0, z: -5, w: 12, h: 6, d: 10, top: '#e0dede', right: '#c0c0c0', front: '#d0d0d0' }, // Station
    { x: -4, y: 0, z: 5, w: 3, h: 4, d: 0.5, top: '#cc2200', right: '#aa1100', front: '#bb1100' }, // Red Door 1
    { x: 1, y: 0, z: 5, w: 3, h: 4, d: 0.5, top: '#cc2200', right: '#aa1100', front: '#bb1100' }  // Red Door 2
  ],
  townhall: [
    { x: -6, y: 0, z: -5, w: 12, h: 8, d: 10, top: '#e0d8c8', right: '#c0b8a8', front: '#d0c8b8' }, // Hall
    { x: -2, y: 8, z: -2, w: 4, h: 6, d: 4, top: '#887744', right: '#665522', front: '#776633' } // Dome/Tower
  ],
  courthouse: [
    { x: -7, y: 0, z: -6, w: 14, h: 6, d: 12, top: '#cfcfcf', right: '#afafaf', front: '#bfbfbf' }, // Base
    { x: -7, y: 6, z: -6, w: 14, h: 2, d: 12, top: '#998855', right: '#776633', front: '#887744' } // Heavy Roof
  ],
  post_office: [
    { x: -4, y: 0, z: -4, w: 8, h: 5, d: 8, top: '#eee', right: '#ccc', front: '#ddd' }, // Office
    { x: -4, y: 4, z: 4, w: 8, h: 1, d: 0.5, top: '#cc4400', right: '#aa3300', front: '#bb3300' } // Red/Orange Trim
  ],

  // ── Transport ──────────────────────────────────────────────────────────────
  bus_stop: [
    { x: -0.5, y: 0, z: -0.5, w: 1, h: 10, d: 1, top: '#336699', right: '#225588', front: '#225588' }, // Pole
    { x: -3, y: 7, z: -0.6, w: 6, h: 3, d: 0.2, top: '#3366cc', right: '#1144aa', front: '#1144aa' }  // Sign
  ],
  fuel: [
    { x: -3, y: 0, z: -2, w: 6, h: 8, d: 4, top: '#ee8822', right: '#cc6600', front: '#dd7711' }, // Pump Body
    { x: -2, y: 4, z: 2, w: 4, h: 3, d: 0.5, top: '#111', right: '#000', front: '#000' }         // Screen
  ],
  parking: [
    { x: -8, y: 0, z: -8, w: 16, h: 0.2, d: 16, top: '#555', right: '#333', front: '#444' }, // Asphalt Flat
    { x: -6, y: 0.2, z: -6, w: 0.5, h: 0.1, d: 4, top: '#fff', right: '#eee', front: '#eee' }, // Line 1
    { x: -2, y: 0.2, z: -6, w: 0.5, h: 0.1, d: 4, top: '#fff', right: '#eee', front: '#eee' }, // Line 2
    { x: 2, y: 0.2, z: -6, w: 0.5, h: 0.1, d: 4, top: '#fff', right: '#eee', front: '#eee' }   // Line 3
  ],
  taxi: [
    { x: -2, y: 0, z: -1.5, w: 4, h: 1.5, d: 3, top: '#cccc00', right: '#aaaa00', front: '#bbbb00' }, // Car Base
    { x: -1, y: 1.5, z: -1, w: 2, h: 1, d: 2, top: '#222', right: '#111', front: '#111' } // Windows/Roof
  ],
  bicycle_parking: [
    { x: -3, y: 0, z: -0.5, w: 6, h: 0.2, d: 1, top: '#888', right: '#666', front: '#777' }, // Base Slab
    { x: -2, y: 0, z: -0.2, w: 0.5, h: 2, d: 0.4, top: '#4488aa', right: '#336688', front: '#336688' }, // Rack 1
    { x: 0, y: 0, z: -0.2, w: 0.5, h: 2, d: 0.4, top: '#4488aa', right: '#336688', front: '#336688' },  // Rack 2
    { x: 2, y: 0, z: -0.2, w: 0.5, h: 2, d: 0.4, top: '#4488aa', right: '#336688', front: '#336688' }   // Rack 3
  ],

  // ── Shops ─────────────────────────────────────────────────────────────────
  supermarket: [
    { x: -8, y: 0, z: -8, w: 16, h: 7, d: 16, top: '#e0e0e0', right: '#c0c0c0', front: '#d0d0d0' }, // Big Box
    { x: -4, y: 5, z: 8, w: 8, h: 2, d: 0.5, top: '#2266cc', right: '#1155bb', front: '#1155bb' } // Blue Branding
  ],
  convenience: [
    { x: -4, y: 0, z: -4, w: 8, h: 5, d: 8, top: '#f0f0f0', right: '#d0d0d0', front: '#e0e0e0' }, // Shop
    { x: -5, y: 4, z: -5, w: 10, h: 1, d: 2, top: '#e05080', right: '#c03060', front: '#d04070' } // Pink Awning
  ],
  clothes: [
    { x: -4, y: 0, z: -4, w: 8, h: 6, d: 8, top: '#eee', right: '#ccc', front: '#ddd' }, 
    { x: -5, y: 4, z: -5, w: 10, h: 1, d: 2, top: '#cc44cc', right: '#aa22aa', front: '#bb33bb' } // Purple Awning
  ],
  bakery: [
    { x: -3, y: 0, z: -3, w: 6, h: 5, d: 6, top: '#f5f5f5', right: '#d5d5d5', front: '#e5e5e5' },
    { x: -4, y: 3, z: -4, w: 8, h: 1, d: 2, top: '#cc8833', right: '#aa6611', front: '#bb7722' } // Orange Awning
  ],
  butcher: [
    { x: -3, y: 0, z: -3, w: 6, h: 5, d: 6, top: '#f0f0f0', right: '#d0d0d0', front: '#e0e0e0' },
    { x: -4, y: 3, z: -4, w: 8, h: 1, d: 2, top: '#cc4444', right: '#aa2222', front: '#bb3333' } // Red Awning
  ],
  bookshop: [
    { x: -4, y: 0, z: -4, w: 8, h: 5, d: 8, top: '#e8e8e8', right: '#c8c8c8', front: '#d8d8d8' },
    { x: -5, y: 4, z: -5, w: 10, h: 1, d: 2, top: '#885588', right: '#663366', front: '#774477' } // Plumb Awning
  ],
  electronics: [
    { x: -5, y: 0, z: -4, w: 10, h: 6, d: 8, top: '#ddd', right: '#bbb', front: '#ccc' },
    { x: -5, y: 5, z: 4, w: 10, h: 1.5, d: 0.5, top: '#2299cc', right: '#1177aa', front: '#1188bb' } // Cyan Sign
  ],
  hardware: [
    { x: -6, y: 0, z: -5, w: 12, h: 6, d: 10, top: '#dcdcdc', right: '#bcbcbc', front: '#cccccc' },
    { x: -6, y: 5, z: 5, w: 12, h: 1.5, d: 0.5, top: '#997733', right: '#775511', front: '#886622' } // Brown Sign
  ],
  florist: [
    { x: -3, y: 0, z: -3, w: 6, h: 5, d: 6, top: '#f0f8f0', right: '#d0e8d0', front: '#e0f0e0' },
    { x: -4, y: 3, z: -4, w: 8, h: 1, d: 2, top: '#ee66aa', right: '#cc4488', front: '#dd5599' }, // Pink Awning
    { x: -2, y: 0, z: 3, w: 4, h: 2, d: 2, top: '#3a9a3a', right: '#2a7a2a', front: '#2a8a2a' } // Outside Plants
  ],
  hairdresser: [
    { x: -3, y: 0, z: -3, w: 6, h: 5, d: 6, top: '#fafafa', right: '#dadada', front: '#eaeaea' },
    { x: -4, y: 4, z: -4, w: 8, h: 1, d: 2, top: '#aa66cc', right: '#8844aa', front: '#9955bb' } // Lavender Awning
  ],

  // ── Leisure / Parks / Nature ───────────────────────────────────────────────
  park: [
    { x: -6, y: 0, z: -6, w: 12, h: 0.5, d: 12, top: '#3a9a3a', right: '#2a7a2a', front: '#2a8a2a' }, // Grass Base
    { x: -2, y: 0.5, z: -2, w: 4, h: 3, d: 4, top: '#2a8a2a', right: '#1a6a1a', front: '#1a7a1a' } // Central Bush
  ],
  garden: [
    { x: -4, y: 0, z: -4, w: 8, h: 0.2, d: 8, top: '#4aaa2a', right: '#3a8a1a', front: '#3a9a1a' }, // Grass
    { x: -3, y: 0.2, z: -1, w: 2, h: 1, d: 2, top: '#e05080', right: '#c03060', front: '#d04070' }, // Flower Bed 1
    { x: 1, y: 0.2, z: -1, w: 2, h: 1, d: 2, top: '#ee66aa', right: '#cc4488', front: '#dd5599' }   // Flower Bed 2
  ],
  playground: [
    { x: -4, y: 0, z: -4, w: 8, h: 0.2, d: 8, top: '#ddaa77', right: '#bb8855', front: '#cc9966' }, // Sand Base
    { x: -2, y: 0.2, z: -1, w: 4, h: 3, d: 2, top: '#e08833', right: '#c06611', front: '#d07722' } // Play Structure
  ],
  sports_centre: [
    { x: -8, y: 0, z: -6, w: 16, h: 6, d: 12, top: '#eee', right: '#ccc', front: '#ddd' }, // Hall
    { x: -6, y: 6, z: -4, w: 12, h: 2, d: 8, top: '#2288aa', right: '#116688', front: '#117799' } // Curved/Blue Roof
  ],
  swimming_pool: [
    { x: -6, y: 0, z: -4, w: 12, h: 0.5, d: 8, top: '#f0f0f0', right: '#d0d0d0', front: '#e0e0e0' }, // Tiling
    { x: -5, y: 0.1, z: -3, w: 10, h: 0.5, d: 6, top: '#22aacc', right: '#1188aa', front: '#1199bb' } // Water Area
  ],
  pitch: [
    { x: -8, y: 0, z: -5, w: 16, h: 0.2, d: 10, top: '#2a8a2a', right: '#1a6a1a', front: '#1a7a1a' }, // Grass Field
    { x: -7, y: 0.2, z: -2, w: 1, h: 2, d: 4, top: '#fff', right: '#eee', front: '#eee' }, // Goal 1
    { x: 6, y: 0.2, z: -2, w: 1, h: 2, d: 4, top: '#fff', right: '#eee', front: '#eee' }   // Goal 2
  ],
  tree: [
    { x: -0.5, y: 0, z: -0.5, w: 1, h: 3, d: 1, top: '#5c4033', right: '#3c2013', front: '#4c3023' }, // Trunk
    { x: -2, y: 3, z: -2, w: 4, h: 4, d: 4, top: '#2a8a2a', right: '#1a6a1a', front: '#1a7a1a' } // Leaves
  ],
  forest: [
    { x: -3, y: 0, z: -2, w: 1, h: 3, d: 1, top: '#5c4033', right: '#3c2013', front: '#4c3023' }, // Trunk 1
    { x: -4.5, y: 3, z: -3.5, w: 4, h: 5, d: 4, top: '#1a5a1a', right: '#0a3a0a', front: '#0a4a0a' }, // Leaves 1
    { x: 2, y: 0, z: 1, w: 1, h: 4, d: 1, top: '#5c4033', right: '#3c2013', front: '#4c3023' },   // Trunk 2
    { x: 0.5, y: 4, z: -0.5, w: 4, h: 4, d: 4, top: '#1a5a1a', right: '#0a3a0a', front: '#0a4a0a' } // Leaves 2
  ],
  wood: [ // Alias of forest for variety
    { x: -1, y: 0, z: -1, w: 2, h: 4, d: 2, top: '#4c3023', right: '#2c1003', front: '#3c2013' }, // Thick Trunk
    { x: -3, y: 4, z: -3, w: 6, h: 5, d: 6, top: '#1a5a1a', right: '#0a3a0a', front: '#0a4a0a' } // Dense Canopy
  ],

  // ── Tourism ────────────────────────────────────────────────────────────────
  attraction: [
    { x: -4, y: 0, z: -4, w: 8, h: 2, d: 8, top: '#ccc', right: '#aaa', front: '#bbb' }, // Base
    { x: -2, y: 2, z: -2, w: 4, h: 10, d: 4, top: '#dd8800', right: '#bb6600', front: '#cc7700' }, // Tower/Feature
    { x: -3, y: 12, z: -3, w: 6, h: 2, d: 6, top: '#ffaa22', right: '#dd8800', front: '#ee9911' } // Top Accent
  ],
  museum: [
    { x: -6, y: 0, z: -5, w: 12, h: 6, d: 10, top: '#f0f0f0', right: '#d0d0d0', front: '#e0e0e0' }, // Classic Build
    { x: -5, y: 0, z: 5, w: 1.5, h: 6, d: 1.5, top: '#996633', right: '#774411', front: '#885522' }, // Column L
    { x: 3.5, y: 0, z: 5, w: 1.5, h: 6, d: 1.5, top: '#996633', right: '#774411', front: '#885522' } // Column R
  ],
  hotel: [
    { x: -5, y: 0, z: -5, w: 10, h: 12, d: 10, top: '#e8e4e0', right: '#c8c4c0', front: '#d8d4d0' }, // Tall Tower
    { x: -6, y: 0, z: -6, w: 12, h: 2, d: 12, top: '#886622', right: '#664400', front: '#775511' } // Lobby/Base Gold Theme
  ],
  viewpoint: [
    { x: -3, y: 0, z: -3, w: 6, h: 1, d: 6, top: '#8a6020', right: '#6a4010', front: '#7a5010' }, // Wooden Deck
    { x: -2, y: 1, z: 2, w: 4, h: 3, d: 0.5, top: '#ff8844', right: '#dd6622', front: '#ee7733' } // Info/Viewing Board
  ],
  information: [
    { x: -2, y: 0, z: -2, w: 4, h: 4, d: 4, top: '#eee', right: '#ccc', front: '#ddd' }, // Booth
    { x: -2.5, y: 4, z: -2.5, w: 5, h: 1, d: 5, top: '#2288aa', right: '#116688', front: '#117799' } // Blue Roof (i sign)
  ],
  // ── Fauna (Animals) ────────────────────────────────────────────────────────
  bird: [
    { x: -0.5, y: 0, z: -1, w: 1, h: 1, d: 2, top: '#fff', right: '#ddd', front: '#eee' }, // Body
    { x: -1.5, y: 0.5, z: -0.5, w: 3, h: 0.1, d: 1, top: '#fff', right: '#ddd', front: '#eee' } // Wings
  ],
  squirrel: [
    { x: -0.5, y: 0, z: -0.5, w: 1, h: 1, d: 1, top: '#a67c52', right: '#8b5a2b', front: '#8b5a2b' }, // Body
    { x: -0.5, y: 0, z: 0.5, w: 1, h: 2, d: 1, top: '#8b5a2b', right: '#6b4420', front: '#6b4420' }  // Tail
  ],
  wolf: [
    { x: -1, y: 0, z: -2, w: 2, h: 2, d: 4, top: '#888', right: '#666', front: '#777' }, // Body
    { x: -1, y: 1.5, z: -3, w: 2, h: 1.5, d: 2, top: '#888', right: '#666', front: '#777' } // Head
  ],
  insect: [
    { x: -0.5, y: 0, z: -0.5, w: 1, h: 0.5, d: 1, top: '#ffcc00', right: '#333', front: '#333' } // Generic Bee/Bug
  ],

  // ── Flora (Plants) ─────────────────────────────────────────────────────────
  shrub: [
    { x: -2, y: 0, z: -2, w: 4, h: 3, d: 4, top: '#2d5a27', right: '#1e3d1a', front: '#244a1f' }, // Main Leaves
    { x: -1, y: 3, z: -1, w: 2, h: 1, d: 2, top: '#3e7a36', right: '#2d5a27', front: '#2d5a27' }  // Top Clump
  ],
  fern: [
    { x: -3, y: 0, z: -0.5, w: 6, h: 0.2, d: 1, top: '#4aaa2a', right: '#3a8a1a', front: '#3a8a1a' }, // Frond 1
    { x: -0.5, y: 0, z: -3, w: 1, h: 0.2, d: 6, top: '#4aaa2a', right: '#3a8a1a', front: '#3a8a1a' }  // Frond 2
  ],
  flower_wild: [
    { x: -0.2, y: 0, z: -0.2, w: 0.4, h: 2, d: 0.4, top: '#4aaa2a', right: '#3a8a1a', front: '#3a8a1a' }, // Stem
    { x: -0.8, y: 2, z: -0.8, w: 1.6, h: 0.6, d: 1.6, top: '#fff', right: '#eee', front: '#eee' } // Flower Head
  ],
  flower_anemone: [
    { x: -0.1, y: 0, z: -0.1, w: 0.2, h: 1.5, d: 0.2, top: '#2d5a27', right: '#1e3d1a', front: '#1e3d1a' }, // Stem
    { x: -0.6, y: 1.5, z: -0.6, w: 1.2, h: 0.4, d: 1.2, top: '#a78bfa', right: '#7c3aed', front: '#7c3aed' } // Purple Head
    ],
  grass_tuft: [
    { x: -0.5, y: 0, z: -0.5, w: 1, h: 1.5, d: 0.2, top: '#77dd55', right: '#44aa22', front: '#44aa22' }, // Blade A
    { x: 0, y: 0, z: -0.5, w: 0.2, h: 1.2, d: 1, top: '#77dd55', right: '#44aa22', front: '#44aa22' }    // Blade B
  ],
  tree_oak: [
    { x: -1, y: 0, z: -1, w: 2, h: 4, d: 2, top: '#5c4033', right: '#3c2013', front: '#4c3023' }, // Trunk
    { x: -4, y: 4, z: -4, w: 8, h: 5, d: 8, top: '#2d5a27', right: '#1e3d1a', front: '#244a1f' }  // Wide Canopy
  ],
  tree_pine: [
    { x: -0.5, y: 0, z: -0.5, w: 1, h: 3, d: 1, top: '#3c2013', right: '#2c1003', front: '#2c1003' }, // Trunk
    { x: -3, y: 3, z: -3, w: 6, h: 2, d: 6, top: '#1a3a1a', right: '#0a2a0a', front: '#0a2a0a' }, // Tier 1
    { x: -2, y: 5, z: -2, w: 4, h: 2, d: 4, top: '#1a3a1a', right: '#0a2a0a', front: '#0a2a0a' }, // Tier 2
    { x: -1, y: 7, z: -1, w: 2, h: 2, d: 2, top: '#1a3a1a', right: '#0a2a0a', front: '#0a2a0a' }  // Tip
  ],
  tree_palm: [
     { x: -0.5, y: 0, z: -0.5, w: 1, h: 8, d: 1, top: '#8B6030', right: '#6B4420', front: '#4a2a10' }, // Trunk
     { x: -5, y: 8, z: 0, w: 10, h: 0.2, d: 1, top: '#4ab030', right: '#2a8020', front: '#2a8020' }, // Frond H
     { x: 0, y: 8, z: -5, w: 1, h: 0.2, d: 10, top: '#4ab030', right: '#2a8020', front: '#2a8020' }  // Frond V
  ]
};