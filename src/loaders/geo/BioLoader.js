import { BaseLoader } from '../BaseLoader.js';

const TREE_TAXA = {
  families: [
    'fagaceae', 'pinaceae', 'betulaceae', 'aceraceae', 'oleaceae', 
    'rosaceae', 'cupressaceae', 'myrtaceae', 'salicaceae', 'ulmaceae', 'juglandaceae'
  ],
  keywords: ['tree', 'oak', 'pine', 'beech', 'birch', 'fagus', 'quercus', 'picea']
};

export class BioLoader extends BaseLoader {
  get id() { return 'bio-loader'; }

  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.005; 
    // INCREASED LIMIT: 300 records to catch more real-life sightings
    const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat-r},${lat+r}&decimalLongitude=${lon-r},${lon+r}&limit=300`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      // 1. Process Real API Results
      const realFeatures = data.results.map(obs => this._mapRecord(obs));

      // 2. Identify the "Local Vibe" (What species are actually here?)
      const localFauna = realFeatures.filter(f => f.data.subType === 'animal');
      
      // 3. Procedural Spawning
      // If we want a "Living World", we aim for at least 40 animals in the area
      const TARGET_COUNT = 40;
      const proceduralFeatures = [];
      
      if (localFauna.length < TARGET_COUNT) {
        const needed = TARGET_COUNT - localFauna.length;
        
        // Pick a few "seeds" from real data so the fake animals match the real ones
        const seeds = localFauna.length > 0 ? localFauna : [{ asset: 'bird' }, { asset: 'squirrel' }];

        for (let i = 0; i < needed; i++) {
          const seed = seeds[Math.floor(Math.random() * seeds.length)];
          proceduralFeatures.push(this._spawnAmbient(geoCenter, seed.asset || seed.ftype?.asset));
        }
      }

      return {
        features: [...realFeatures, ...proceduralFeatures]
      };
    } catch (e) {
      console.error("BioLoader: API error", e);
      // Fallback: Just spawn some generic birds/squirrels if API is down
      return { features: Array.from({length: 20}, () => this._spawnAmbient(geoCenter, 'bird')) };
    }
  }

  _mapRecord(obs) {
    const tags = {
      kingdom: obs.kingdom?.toLowerCase(),
      class: obs.class?.toLowerCase(),
      family: obs.family?.toLowerCase(),
      genus: obs.genus?.toLowerCase(),
      species: obs.species?.toLowerCase(),
      natural: obs.class?.toLowerCase() || obs.kingdom?.toLowerCase() || 'nature'
    };

    const isTree = TREE_TAXA.families.includes(tags.family) || 
                   TREE_TAXA.keywords.some(k => (obs.scientificName + (obs.vernacularName || '')).toLowerCase().includes(k));

    return {
      id: `bio:${obs.key}`,
      latitude: obs.decimalLatitude,
      longitude: obs.decimalLongitude,
      label: obs.vernacularName || obs.scientificName,
      title: obs.scientificName,
      data: { 
        category: 'nature', 
        isTree: isTree,
        tags: tags,
        subType: obs.kingdom === 'Animalia' ? 'animal' : 'plant',
        isProcedural: false
      },
      renderMode: 'blueprint'
    };
  }

  _spawnAmbient(center, preferredAsset = 'bird') {
    // Random jitter around the center point (~500m radius)
    const latOffset = (Math.random() - 0.5) * 0.009;
    const lonOffset = (Math.random() - 0.5) * 0.009;

    const jitterX = (Math.random() - 0.5) * 0.0001;
    const jitterY = (Math.random() - 0.5) * 0.0001;

    return {
      id: `proc:${Math.random()}`,
      latitude: center.lat + latOffset + jitterX,
      longitude: center.lon + lonOffset + jitterY,
      label: `Ambient ${preferredAsset}`,
      data: { 
        category: 'nature', 
        subType: 'animal',
        isProcedural: true // Marked so engine can filter if needed
      },
      asset: preferredAsset, // Force it to use the local species type
      renderMode: 'blueprint'
    };
  }
}