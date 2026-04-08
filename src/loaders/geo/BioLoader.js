import { BaseLoader } from '../BaseLoader.js';

export class BioLoader extends BaseLoader {
  get id() { return 'bio-loader'; }

  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.005; 
    const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat-r},${lat+r}&decimalLongitude=${lon-r},${lon+r}&limit=50`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      return {
        features: data.results.map(obs => {
          // Normalize taxonomic data for tags
          const tags = {
            kingdom: obs.kingdom?.toLowerCase(),
            class: obs.class?.toLowerCase(),
            family: obs.family?.toLowerCase(),
            genus: obs.genus?.toLowerCase(),
            species: obs.species?.toLowerCase(),
            // Map to 'natural' key so the Engine's resolver recognizes it
            natural: obs.class?.toLowerCase() || obs.kingdom?.toLowerCase() || 'nature'
          };

          return {
            id: `bio:${obs.key}`,
            latitude: obs.decimalLatitude,
            longitude: obs.decimalLongitude,
            label: obs.vernacularName || obs.scientificName,
            title: obs.scientificName,
            data: { 
              category: 'nature', 
              tags: tags,
              subType: obs.kingdom === 'Animalia' ? 'animal' : 'plant'
            },
            renderMode: 'blueprint'
          };
        })
      };
    } catch (e) {
      console.error("BioLoader: API error", e);
      return {};
    }
  }
}