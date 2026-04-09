/**
 * GOE Core — FeatureTypes
 * Maps OSM amenity/shop/leisure/natural tags to render configuration.
 *
 * Each entry defines:
 *   color       — hex colour for dot/tower/aura
 *   asset       — key into AssetLibrary (sprite drawn on top face)
 *   height      — voxel tower height in ISO mode (0 = flat dot only)
 *   category    — broad group for clustering / legend
 *   label       — human-readable name
 *   renderMode  — 'sprite' | 'tower' | 'tree' | 'flat'
 */

export const BIO_MAP = {
  // Latin Genus -> Blueprint Asset
  'anthriscus':   'flower_wild', // Cow Parsley
  'ruscus':       'shrub',       // Butcher's Broom
  'euphorbia':    'flower_wild', // spurge
  'polypodium':   'fern',        // Ferns
  'carex':        'grass_tuft',  // Sedges
  'fagus':        'tree',        // Beech
  'quercus':      'tree',        // Oak
  'passer':       'bird',        // Sparrows
  'sciurus':      'squirrel',    // Squirrels
};

export const FeatureTypes = {
  // generic 
  // cafe:           { color: '#d4813a', asset: 'cafe',         height: 4,  category: 'food',       label: 'Café',           renderMode: 'flat' },
  // restaurant:     { color: '#cc2222', asset: 'restaurant',   height: 5,  category: 'food',       label: 'Restaurant',     renderMode: 'sprite' },

  // ── Amenities: Food & Drink ────────────────────────────────────────────────
  cafe:           { color: '#d4813a', asset: 'cafe',         height: 4,  category: 'food',       label: 'Café',           renderMode: 'blueprint' },
  restaurant:     { color: '#cc2222', asset: 'restaurant',   height: 5,  category: 'food',       label: 'Restaurant',     renderMode: 'blueprint' },
  fast_food:      { color: '#e0a020', asset: 'fast_food',    height: 4,  category: 'food',       label: 'Fast Food',      renderMode: 'blueprint' },
  bar:            { color: '#aa6622', asset: 'bar',          height: 4,  category: 'food',       label: 'Bar',            renderMode: 'blueprint' },
  pub:            { color: '#aa6622', asset: 'bar',          height: 5,  category: 'food',       label: 'Pub',            renderMode: 'blueprint' },
  food_court:     { color: '#cc8822', asset: 'restaurant',   height: 4,  category: 'food',       label: 'Food Court',     renderMode: 'blueprint' },
  ice_cream:      { color: '#f0a0c0', asset: 'cafe',         height: 3,  category: 'food',       label: 'Ice Cream',      renderMode: 'blueprint' },

  // ── Amenities: Health ──────────────────────────────────────────────────────
  hospital:       { color: '#ee2222', asset: 'hospital',     height: 8,  category: 'health',     label: 'Hospital',       renderMode: 'blueprint' },
  doctors:        { color: '#2244cc', asset: 'doctors',      height: 5,  category: 'health',     label: 'Doctor',         renderMode: 'blueprint' },
  dentist:        { color: '#3366dd', asset: 'doctors',      height: 4,  category: 'health',     label: 'Dentist',        renderMode: 'blueprint' },
  pharmacy:       { color: '#22cc44', asset: 'pharmacy',     height: 4,  category: 'health',     label: 'Pharmacy',       renderMode: 'blueprint' },
  veterinary:     { color: '#44aa44', asset: 'doctors',      height: 4,  category: 'health',     label: 'Vet',            renderMode: 'blueprint' },
  clinic:         { color: '#2288cc', asset: 'doctors',      height: 5,  category: 'health',     label: 'Clinic',         renderMode: 'blueprint' },

  // ── Amenities: Education ───────────────────────────────────────────────────
  school:         { color: '#e0a020', asset: 'school',       height: 6,  category: 'education',  label: 'School',         renderMode: 'blueprint' },
  university:     { color: '#cc8800', asset: 'school',       height: 7,  category: 'education',  label: 'University',     renderMode: 'blueprint' },
  college:        { color: '#cc9900', asset: 'school',       height: 6,  category: 'education',  label: 'College',        renderMode: 'blueprint' },
  library:        { color: '#8866aa', asset: 'library',      height: 5,  category: 'education',  label: 'Library',        renderMode: 'blueprint' },
  kindergarten:   { color: '#ff99aa', asset: 'school',       height: 3,  category: 'education',  label: 'Kindergarten',   renderMode: 'blueprint' },

  // ── Amenities: Civic ───────────────────────────────────────────────────────
  place_of_worship: { color: '#ccaa44', asset: 'place_of_worship', height: 10, category: 'civic', label: 'Place of Worship', renderMode: 'blueprint' },
  police:         { color: '#2244aa', asset: 'default',      height: 5,  category: 'civic',      label: 'Police',         renderMode: 'tower' },
  fire_station:   { color: '#cc2200', asset: 'default',      height: 5,  category: 'civic',      label: 'Fire Station',   renderMode: 'tower' },
  townhall:       { color: '#887744', asset: 'place_of_worship', height: 7, category: 'civic',   label: 'Town Hall',      renderMode: 'blueprint' },
  courthouse:     { color: '#998855', asset: 'default',      height: 7,  category: 'civic',      label: 'Courthouse',     renderMode: 'tower' },
  post_office:    { color: '#cc4400', asset: 'post_box',     height: 4,  category: 'civic',      label: 'Post Office',    renderMode: 'blueprint' },

  // ── Amenities: Utilities ───────────────────────────────────────────────────
  waste_basket:   { color: '#5a8a5a', asset: 'waste_basket', height: 1,  category: 'utility',    label: 'Bin',            renderMode: 'blueprint' },
  recycling:      { color: '#2266cc', asset: 'recycling',    height: 1,  category: 'utility',    label: 'Recycling',      renderMode: 'blueprint' },
  drinking_water: { color: '#4ab0e0', asset: 'drinking_water', height: 1, category: 'utility',  label: 'Water',          renderMode: 'blueprint' },
  toilets:        { color: '#6688cc', asset: 'toilets',      height: 2,  category: 'utility',    label: 'Toilets',        renderMode: 'blueprint' },
  telephone:      { color: '#cc9900', asset: 'telephone',    height: 2,  category: 'utility',    label: 'Phone Box',      renderMode: 'blueprint' },
  post_box:       { color: '#cc2222', asset: 'post_box',     height: 1,  category: 'utility',    label: 'Post Box',       renderMode: 'blueprint' },
  bench:          { color: '#8B6914', asset: 'bench',        height: 0,  category: 'utility',    label: 'Bench',          renderMode: 'blueprint' },
  atm:            { color: '#2255aa', asset: 'default',      height: 1,  category: 'utility',    label: 'ATM',            renderMode: 'blueprint' },

  // ── Amenities: Transport ───────────────────────────────────────────────────
  bus_stop:       { color: '#3366cc', asset: 'bus_stop',     height: 2,  category: 'transport',  label: 'Bus Stop',       renderMode: 'blueprint' },
  parking:        { color: '#334488', asset: 'parking',      height: 0,  category: 'transport',  label: 'Parking',        renderMode: 'blueprint' },
  fuel:           { color: '#cc6600', asset: 'fuel',         height: 3,  category: 'transport',  label: 'Fuel',           renderMode: 'blueprint' },
  taxi:           { color: '#cccc00', asset: 'default',      height: 1,  category: 'transport',  label: 'Taxi',           renderMode: 'blueprint' },
  bicycle_parking: { color: '#4488aa', asset: 'default',     height: 0,  category: 'transport',  label: 'Bike Parking',   renderMode: 'blueprint' },

  // ── Shops ─────────────────────────────────────────────────────────────────
  supermarket:    { color: '#2266cc', asset: 'supermarket',  height: 5,  category: 'shop',       label: 'Supermarket',    renderMode: 'blueprint' },
  convenience:    { color: '#e05080', asset: 'convenience',  height: 3,  category: 'shop',       label: 'Shop',           renderMode: 'blueprint' },
  clothes:        { color: '#cc44cc', asset: 'clothes',      height: 4,  category: 'shop',       label: 'Clothes',        renderMode: 'blueprint' },
  bakery:         { color: '#cc8833', asset: 'cafe',         height: 3,  category: 'shop',       label: 'Bakery',         renderMode: 'blueprint' },
  butcher:        { color: '#cc4444', asset: 'restaurant',   height: 3,  category: 'shop',       label: 'Butcher',        renderMode: 'blueprint' },
  bookshop:       { color: '#885588', asset: 'library',      height: 3,  category: 'shop',       label: 'Bookshop',       renderMode: 'blueprint' },
  electronics:    { color: '#2299cc', asset: 'default',      height: 4,  category: 'shop',       label: 'Electronics',    renderMode: 'tower' },
  hardware:       { color: '#997733', asset: 'default',      height: 4,  category: 'shop',       label: 'Hardware',       renderMode: 'tower' },
  florist:        { color: '#ee66aa', asset: 'garden',       height: 2,  category: 'shop',       label: 'Florist',        renderMode: 'blueprint' },
  hairdresser:    { color: '#aa66cc', asset: 'default',      height: 3,  category: 'shop',       label: 'Hairdresser',    renderMode: 'tower' },

  // ── Leisure / Parks / Nature ───────────────────────────────────────────────
  park:           { color: '#3a9a3a', asset: 'park',         height: 0,  category: 'nature',     label: 'Park',           renderMode: 'tree' },
  garden:         { color: '#4aaa2a', asset: 'garden',       height: 0,  category: 'nature',     label: 'Garden',         renderMode: 'blueprint' },
  playground:     { color: '#e08833', asset: 'default',      height: 0,  category: 'nature',     label: 'Playground',     renderMode: 'blueprint' },
  sports_centre:  { color: '#2288aa', asset: 'default',      height: 4,  category: 'leisure',    label: 'Sports Centre',  renderMode: 'tower' },
  swimming_pool:  { color: '#22aacc', asset: 'default',      height: 0,  category: 'leisure',    label: 'Pool',           renderMode: 'blueprint' },
  pitch:          { color: '#2a8a2a', asset: 'default',      height: 0,  category: 'leisure',    label: 'Pitch',          renderMode: 'blueprint' },

  // ── Natural features ───────────────────────────────────────────────────────
  bird:           { color: '#ffffff', asset: 'bird',         height: 1,  category: 'nature',  label: 'Bird',           renderMode: 'blueprint' },
  squirrel:       { color: '#a67c52', asset: 'squirrel',     height: 1,  category: 'nature',  label: 'Squirrel',       renderMode: 'blueprint' },
  wolf:           { color: '#888888', asset: 'wolf',         height: 2,  category: 'nature',  label: 'Wolf',           renderMode: 'blueprint' },
  shrub:          { color: '#2d5a27', asset: 'shrub',        height: 2,  category: 'nature',  label: 'Shrub',          renderMode: 'blueprint' },
  fern:           { color: '#4aaa2a', asset: 'fern',         height: 1,  category: 'nature',  label: 'Fern',           renderMode: 'blueprint' },
  flower_wild:    { color: '#e0d0b0', asset: 'flower_wild',  height: 2,  category: 'nature',  label: 'Wildflower',     renderMode: 'blueprint' },
  grass_tuft:     { color: '#77dd55', asset: 'grass_tuft',   height: 1,  category: 'nature',  label: 'Grass',          renderMode: 'blueprint' },
  tree:           { color: '#2a8a2a', asset: 'tree',         height: 0,  category: 'nature',     label: 'Tree',           renderMode: 'tree' },
  forest:         { color: '#1a5a1a', asset: 'forest',       height: 0,  category: 'nature',     label: 'Forest',         renderMode: 'tree' },
  wood:           { color: '#1a5a1a', asset: 'forest',       height: 0,  category: 'nature',     label: 'Wood',           renderMode: 'tree' },

  // ── Broad Biological Fallbacks ─────────────────────────────────────────────
// ── Kingdom Fallbacks ──────────────────────────────────────────────────────
  animalia:       { color: '#ef4444', asset: 'bird',         height: 1,  category: 'nature',  label: 'Animal',     renderMode: 'blueprint' },
  plantae:        { color: '#4aaa2a', asset: 'shrub',        height: 2,  category: 'nature',  label: 'Plant',      renderMode: 'blueprint' },

  // ── Class Level (The "Workhorse" types) ────────────────────────────────────
  aves:           { color: '#ffffff', asset: 'bird',         height: 1,  category: 'nature',  label: 'Bird',       renderMode: 'blueprint' },
  mammalia:       { color: '#a67c52', asset: 'squirrel',     height: 1,  category: 'nature',  label: 'Mammal',     renderMode: 'blueprint' },
  insecta:        { color: '#ffcc00', asset: 'insect',       height: 1,  category: 'nature',  label: 'Insect',     renderMode: 'blueprint' },
  liliopsida:     { color: '#77dd55', asset: 'grass_tuft',   height: 1,  category: 'nature',  label: 'Grass/Lily', renderMode: 'blueprint' },
  magnoliopsida:  { color: '#4aaa2a', asset: 'shrub',        height: 2,  category: 'nature',  label: 'Flower/Bush',renderMode: 'blueprint' },
  polypodiopsida: { color: '#2a8a2a', asset: 'fern',         height: 1,  category: 'nature',  label: 'Fern',       renderMode: 'blueprint' },

  // ── Specific Genus/Family Overrides ───────────────────────────────────────
  canidae:        { color: '#888888', asset: 'wolf',         height: 2,  category: 'nature',  label: 'Canine',     renderMode: 'blueprint' },
  sciuridae:      { color: '#a67c52', asset: 'squirrel',     height: 1,  category: 'nature',  label: 'Squirrel',   renderMode: 'blueprint' },
  ruscus:         { color: '#2d5a27', asset: 'shrub',        height: 2,  category: 'nature',  label: 'Butcher\'s Broom', renderMode: 'blueprint' },
  anthriscus:     { color: '#ffffff', asset: 'flower_wild',  height: 2,  category: 'nature',  label: 'Cow Parsley',renderMode: 'blueprint' },

  // ── Tourism ────────────────────────────────────────────────────────────────
  attraction:     { color: '#dd8800', asset: 'default',      height: 5,  category: 'tourism',    label: 'Attraction',     renderMode: 'tower' },
  museum:         { color: '#996633', asset: 'library',      height: 7,  category: 'tourism',    label: 'Museum',         renderMode: 'blueprint' },
  hotel:          { color: '#886622', asset: 'default',      height: 8,  category: 'tourism',    label: 'Hotel',          renderMode: 'tower' },
  viewpoint:      { color: '#ff8844', asset: 'default',      height: 3,  category: 'tourism',    label: 'Viewpoint',      renderMode: 'blueprint' },
  information:    { color: '#2288aa', asset: 'default',      height: 1,  category: 'tourism',    label: 'Info',           renderMode: 'blueprint' },

  npc:    { color: '#2288aa', asset: 'npc_person',      height: 1,  category: 'tourism',    label: 'Info',           renderMode: 'blueprint' },
};

/**
 * Resolve a feature type config from OSM tags.
 * Checks amenity → shop → leisure → natural in priority order.
 * Returns a FeatureType config (or a sensible default).
 *
 * @param {object} tags   Raw OSM tags object
 * @param {string} [fallbackColor]
 * @returns {{ color, asset, height, category, label, renderMode }}
 */
/**
 * Resolves a feature type configuration by traversing specificity.
 * Order of operations:
 * 1. Explicit Asset (Direct instruction from a loader)
 * 2. Taxonomic Tags (Specific -> Broad: Genus -> Family -> Class)
 * 3. Infrastructure Tags (OSM: Amenity, Shop, etc.)
 * 4. Broad Groupings (Natural, Kingdom)
 * 5. Title Scavenging (Fuzzy matching via BIO_MAP)
 */
export function resolveFeatureType(title = "", tags = {}, fallbackColor = '#60a5fa', explicitAsset = null) {

  // console.log({title, tags})
  
  // 1. Priority: Explicit override from the Loader
  if (explicitAsset && FeatureTypes[explicitAsset]) {
    return { ...FeatureTypes[explicitAsset], label: title || FeatureTypes[explicitAsset].label };
  }

  // 2. The Probe List: Ordered from most specific to least specific
  // This covers both Bio taxonomy and OSM infrastructure
  const probeKeys = [
    tags.genus,
    tags.family,
    tags.class,
    tags.amenity,
    tags.shop,
    tags.leisure,
    tags.tourism,
    tags.highway,
    tags.natural, // BioLoader sets this to class/kingdom, OSM sets to natural feature
    tags.kingdom
  ];

  // Search through our probe list for a match in FeatureTypes
  for (const key of probeKeys) {
    const normalizedKey = key?.toLowerCase();
    if (normalizedKey && FeatureTypes[normalizedKey]) {
      const config = FeatureTypes[normalizedKey];
      return { 
        ...config, 
        label: title || config.label // Keep the specific species name as the label
      };
    }
  }

  // 3. Keyword Scavenging: Look for clues inside the title string
  const cleanTitle = title.toLowerCase();
  
  // First check the dedicated BIO_MAP for Latin genus clues
  for (const [latinNode, assetKey] of Object.entries(BIO_MAP)) {
    if (cleanTitle.includes(latinNode)) {
      const config = FeatureTypes[assetKey];
      return { ...config, label: title };
    }
  }

  // Then check FeatureTypes keys (handles "Bird", "Squirrel" in title)
  for (const key of Object.keys(FeatureTypes)) {
    if (cleanTitle.includes(key)) {
      return { ...FeatureTypes[key], label: title };
    }
  }

  // 4. Final Fallback: The Generic Voxel Tower
  return {
    color:      fallbackColor,
    asset:      'default',
    height:     3,
    category:   'other',
    label:      title || 'Point of Interest',
    renderMode: 'blueprint',
  };
}

/**
 * Get a colour representing a broad category for clustering badges.
 */
export const CATEGORY_COLORS = {
  food:       '#d4813a',
  health:     '#ee2222',
  education:  '#e0a020',
  civic:      '#8877aa',
  utility:    '#5a8a5a',
  transport:  '#3366cc',
  shop:       '#cc44cc',
  nature:     '#3a9a3a',
  leisure:    '#2288aa',
  tourism:    '#dd8800',
  other:      '#60a5fa',
};