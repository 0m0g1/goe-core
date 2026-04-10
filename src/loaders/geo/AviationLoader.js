import { BaseLoader } from '../BaseLoader.js';

const PROXY_URL = 'https://corsproxy.io/?';
const OPENSKY_BASE = 'https://opensky-network.org/api/states/all';

// How many real metres = 1 "visual altitude unit" (in px via zoom)
// At default zoom, ALTITUDE_SCALE=0.04 puts a 1000m plane ~40 tile-heights up
const ALTITUDE_SCALE = 0.04;

export class AviationLoader extends BaseLoader {
  get id() { return 'bio-loader'; }

  constructor() {
    super();
    this._planes = new Map(); // id → { lat, lon, hdg, alt, vel } for movement
    this._lastUpdate = 0;
    this.realisticAltitude = false; // toggle: false = visual scale, true = real metres
  }

  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.15;
    const target = `${OPENSKY_BASE}?lamin=${lat-r}&lomin=${lon-r}&lamax=${lat+r}&lomax=${lon+r}`;

    let states = null;
    try {
      // Try direct first (works if OpenSky adds CORS headers), then proxy
      let res = await fetch(target).catch(() => null);
      if (!res?.ok) res = await fetch(PROXY_URL + encodeURIComponent(target));
      if (!res?.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      states = data.states || [];
      console.log(`✈️ Live planes: ${states.length}`);
    } catch (e) {
      console.warn('AviationLoader: live fetch failed, using mock', e.message);
    }

    const features = states
      ? states
          .filter(s => s[6] != null && s[5] != null) // must have position
          .map(s => this._mapState(s, geoCenter))
      : this._mockStates(geoCenter);

    return { features };
  }

  _visualAlt(realMetres) {
    if (this.realisticAltitude) return realMetres;
    // Compress: log scale so low-flying is visible, high-flying isn't absurd
    // Ground = 0, 100m building height = ~8 visual units, 10000m = ~40
    return Math.log1p(realMetres) * 5;
  }

  _mapState(s, geoCenter) {
    const altM = s[7] ?? 500;
    return {
      id: `plane:${s[0]}`,
      latitude: s[6],
      longitude: s[5],
      label: (s[1] || 'UNK').trim(),
      tags: { aviation: 'yes' },
      data: {
        category: 'aviation',
        altitudeM:        altM,
        visualAlt:        this._visualAlt(altM),
        showAltitudeLine: true,
        heading:          s[10] ?? 0,
        velocity:         s[9]  ?? 200,
        asset:            'airplane_jet',
        physics:          false,
        fixed:            false,
      },
      renderMode: 'blueprint',
    };
  }

  _mockStates(geoCenter) {
    const { lat, lon } = geoCenter;
    return [
      { s: [null, 'MOCK01', null, null, null, lon + 0.002, lat + 0.002, 800, false, 150, 120, null, null, null, null, null, null] },
      { s: [null, 'MOCK02', null, null, null, lon - 0.001, lat + 0.003, 1200, false, 200, 280, null, null, null, null, null, null] },
    ].map(({ s }) => this._mapState(s, geoCenter));
  }
}