import { BaseLoader } from '../BaseLoader.js';

// AviationLoader.js
export class AviationLoader extends BaseLoader {
  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.15;
    const targetUrl = `https://opensky-network.org/api/states/all?lamin=${lat-r}&lomin=${lon-r}&lamax=${lat+r}&lomax=${lon+r}`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("API Down");
      const data = await res.json();
      
      return {
        features: (data.states || []).map(s => this._mapPlane(s))
      };
    } catch (e) {
      console.warn("AviationLoader: Using Mock Data (API blocked or offline)");
      // Generate 3 mock planes so the user sees something!
      return {
        features: [
          this._mockPlane(lat + 0.01, lon + 0.01, 120, 5000),
          this._mockPlane(lat - 0.01, lon + 0.02, 300, 8000)
        ]
      };
    }
  }

  _mapPlane(s) {
    return {
      id: `plane:${s[0]}`,
      latitude: s[6], longitude: s[5],
      label: `Flight ${s[1] || 'UNK'}`,
      data: { category: 'aviation', subType: 'airplane', altitude: s[7] || 5000, velocity: s[9] || 200, heading: s[10] || 0, asset: 'airplane_jet' },
      renderMode: 'blueprint'
    };
  }

  _mockPlane(lat, lon, hdg, alt) {
    return {
      id: `mock:plane:${Math.random()}`,
      latitude: lat, longitude: lon,
      label: "Mock Flight (Demo)",
      data: { category: 'aviation', subType: 'airplane', altitude: alt, velocity: 150, heading: hdg, asset: 'airplane_jet' },
      renderMode: 'blueprint'
    };
  }
}