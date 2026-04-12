/**
 * GOE — AviationLoader (Resilient Proxy Version)
 */
import { BaseLoader } from '../BaseLoader.js';
import { Blueprints } from '../../assets/BluePrintLibrary.js';
import { tileDepth } from '../../math/projection.js';

// prioritized list of proxies that handle OpenSky better
const PROXY_URLS = [
  'https://api.codetabs.com/v1/proxy?url=',
  'https://api.allorigins.win/raw?url=',
  'https://thingproxy.freeboard.io/fetch/'
];

const POLL_INTERVAL_MS = 20_000; // Increased to 20s to avoid proxy rate-limiting
const ERROR_BACKOFF_MS = 60_000; 

function makeAircraftDef(id, lat, lon, callsign, altM, visualAlt, heading) {
  return {
    id,
    latitude: lat,
    longitude: lon,
    solid: false,
    bboxRadius: 0.5,
    physicsEnabled: false,
    fixed: false,
    renderHeavy: true,
    _lodColor: '#64B5F6',
    label: callsign,
    altitudeM: altM,
    visualAlt: visualAlt,
    showAltitudeLine: true,
    heading,
    renderFn(wr, groundElevPx, extra, entity) {
      const blueprint = Blueprints['airplane_jet'];
      if (!blueprint || wr.cam.tilt < 0.04) return;
      const isoA = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      const elev = groundElevPx + entity.elevOffset + entity.visualAlt;
      const depth = tileDepth(entity.tx, entity.ty, wr.cam.rotation);
      wr.submitWorldObject(depth, () => {
        wr.ctx.globalAlpha = isoA;
        wr.drawBlueprint(blueprint, entity.tx, entity.ty, elev);
        wr.ctx.globalAlpha = 1;
      });
    },
  };
}

export class AviationLoader extends BaseLoader {
  get id() { return 'aviation-loader'; }

  constructor(options = {}) {
    super(options);
    this._lastResult = { entities: [] };
    this._geoCenter = null;
    this._timer = null;
    this._polling = false;
    this._backoffUntil = 0;
    this.realisticAltitude = false;
    this._pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  async fetch(geoCenter) {
    this._geoCenter = geoCenter;
    if (!this._polling) this._startPolling();
    return this._lastResult;
  }

  _startPolling() {
    this._polling = true;
    this._poll();
  }

  async _poll() {
    if (!this._polling) return;
    if (Date.now() < this._backoffUntil) {
        this._timer = setTimeout(() => this._poll(), this._pollIntervalMs);
        return;
    }
    if (this._geoCenter) {
      try {
        this._lastResult = await this._fetchLive(this._geoCenter);
      } catch (e) { /* silent */ }
    }
    if (this._polling) {
      this._timer = setTimeout(() => this._poll(), this._pollIntervalMs);
    }
  }

  async _fetchLive(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.15;
    const target = `https://opensky-network.org/api/states/all?lamin=${lat-r}&lomin=${lon-r}&lamax=${lat+r}&lomax=${lon+r}`;

    let states = null;
    let success = false;

    for (const proxy of PROXY_URLS) {
        try {
            // We use a short timeout for the fetch so one dead proxy doesn't hang the engine
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(proxy + encodeURIComponent(target), { signal: controller.signal });
            clearTimeout(id);

            if (res.ok) {
                const data = await res.json();
                states = data.states || [];
                console.log(`✈️ Aviation: Online (${states.length} planes)`);
                success = true;
                break; 
            }
        } catch (e) {
            // Fall through to next proxy
        }
    }

    if (!success) {
        console.warn(`[AviationLoader] All proxies blocked or OpenSky down. Using mocks for 60s.`);
        this._backoffUntil = Date.now() + ERROR_BACKOFF_MS;
    }

    const entities = states
      ? states.filter(s => s[6] != null && s[5] != null).map(s => this._stateToEntityDef(s))
      : this._mockEntityDefs(geoCenter);

    return { entities };
  }

  _visualAlt(realMetres) {
    return this.realisticAltitude ? realMetres : Math.log1p(realMetres) * 5;
  }

  _stateToEntityDef(s) {
    const altM = s[7] ?? 500;
    return makeAircraftDef(`plane:${s[0]}`, s[6], s[5], (s[1] || 'UNK').trim(), altM, this._visualAlt(altM), s[10] ?? 0);
  }

  _mockEntityDefs(geoCenter) {
    const { lat, lon } = geoCenter;
    return [
      makeAircraftDef('plane:MOCK01', lat + 0.002, lon + 0.002, 'MOCK01', 800, this._visualAlt(800), 120),
      makeAircraftDef('plane:MOCK02', lat + 0.003, lon - 0.001, 'MOCK02', 1200, this._visualAlt(1200), 280),
    ];
  }

  destroy() {
    this._polling = false;
    if (this._timer) clearTimeout(this._timer);
  }
}