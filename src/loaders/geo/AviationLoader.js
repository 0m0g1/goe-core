import { BaseLoader } from '../BaseLoader.js';

export class AviationLoader extends BaseLoader {
  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.15; // keep the API bounding box as before
    const targetUrl = `https://opensky-network.org/api/states/all?lamin=${lat-r}&lomin=${lon-r}&lamax=${lat+r}&lomax=${lon+r}`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const features = (data.states || []).map(s => this._mapPlane(s));
      console.log(`✅ Real planes fetched: ${features.length}`);
      return { features };
    } catch (e) {
      console.warn("AviationLoader: using mock data", e);
      // Use a tiny offset (inside the 800m map)
      const OFFSET = 0.0002; // ~22 meters
      const mockFeatures = [
        this._mockPlane(lat + OFFSET, lon + OFFSET, 120, 1),
        this._mockPlane(lat - OFFSET, lon + OFFSET * 0.5, 300, 2)
      ];
      console.log(`🛩️ Mock planes created (inside map bounds)`);
      return { features: mockFeatures };
    }
  }

  _mapPlane(s) {
    return {
      id: `plane:${s[0]}`,
      latitude: s[6],
      longitude: s[5],
      label: `Flight ${s[1] || 'UNK'}`,
      data: {
        category: 'aviation',
        subType: 'airplane',
        altitude: s[7] || 1000,
        velocity: s[9] || 200,
        heading: s[10] || 0,
        asset: 'airplane_jet'
      },
      renderMode: 'blueprint'
    };
  }

  _mockPlane(lat, lon, hdg, alt) {
    return {
      id: `mock:plane:${Math.random()}`,
      latitude: lat,
      longitude: lon,
      label: "✈️ Demo Flight",
      data: {
        category: 'aviation',
        subType: 'airplane',
        altitude: alt,        // ground level for visibility
        velocity: 150,
        heading: hdg,
        asset: 'airplane_jet'
      },
      renderMode: 'blueprint'
    };
  }
}