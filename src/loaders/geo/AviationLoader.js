/**
 * GOE — AviationLoader
 *
 * Polls OpenSky for live aircraft in the local bounding box and returns
 * EntityDef objects the Engine renders — no airplane-specific code in Engine.
 *
 * Poll strategy: returns last cached result immediately so the engine never
 * waits on network I/O; refreshes in the background every POLL_INTERVAL_MS.
 */
import { BaseLoader } from '../BaseLoader.js';
import { Blueprints } from '../../assets/BluePrintLibrary.js';
import { tileDepth } from '../../math/projection.js';

const PROXY_URL    = 'https://corsproxy.io/?';
const OPENSKY_BASE = 'https://opensky-network.org/api/states/all';

const POLL_INTERVAL_MS = 12_000;

// ─── EntityDef factory ────────────────────────────────────────────────────────

function makeAircraftDef(id, lat, lon, callsign, altM, visualAlt, heading) {
  return {
    id,
    latitude:         lat,
    longitude:        lon,
    solid:            false,
    bboxRadius:       0.5,
    physicsEnabled:   false,
    fixed:            false,
    renderHeavy:      true,
    _lodColor:        '#64B5F6',

    // Metadata
    label:            callsign,
    altitudeM:        altM,
    visualAlt:        visualAlt,
    showAltitudeLine: true,
    heading,

    renderFn(wr, groundElevPx, extra, entity) {
      const blueprint = Blueprints['airplane_jet'];
      if (!blueprint) return;
      if (wr.cam.tilt < 0.04) return;
      const isoA  = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      const elev  = groundElevPx + entity.elevOffset + entity.visualAlt;
      const depth = tileDepth(entity.tx, entity.ty, wr.cam.rotation);
      wr.submitWorldObject(depth, () => {
        wr.ctx.globalAlpha = isoA;
        wr.drawBlueprint(blueprint, entity.tx, entity.ty, elev);
        wr.ctx.globalAlpha = 1;
      });
    },
  };
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export class AviationLoader extends BaseLoader {
  get id() { return 'aviation-loader'; }

  constructor(options = {}) {
    super(options);
    this._lastResult     = { entities: [] };
    this._geoCenter      = null;
    this._timer          = null;
    this._polling        = false;
    this.realisticAltitude = false;
    this._pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  async fetch(geoCenter) {
    this._geoCenter = geoCenter;
    if (!this._polling) this._startPolling();
    return this._lastResult;
  }

  // ── Background poll ───────────────────────────────────────────────────────

  _startPolling() {
    this._polling = true;
    this._poll();
  }

  async _poll() {
    if (!this._polling) return;
    if (this._geoCenter) {
      try {
        this._lastResult = await this._fetchLive(this._geoCenter);
      } catch (e) {
        console.warn('[AviationLoader] Poll error:', e.message);
      }
    }
    if (this._polling) {
      this._timer = setTimeout(() => this._poll(), this._pollIntervalMs);
    }
  }

  // ── Live fetch ────────────────────────────────────────────────────────────

  async _fetchLive(geoCenter) {
    const { lat, lon } = geoCenter;
    const r = 0.15;
    const target = `${OPENSKY_BASE}?lamin=${lat-r}&lomin=${lon-r}&lamax=${lat+r}&lomax=${lon+r}`;

    let states = null;
    try {
      let res = await fetch(target).catch(() => null);
      if (!res?.ok) res = await fetch(PROXY_URL + encodeURIComponent(target));
      if (!res?.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      states = data.states || [];
      console.log(`✈️ Live planes: ${states.length}`);
    } catch (e) {
      console.warn('[AviationLoader] Live fetch failed, using mock:', e.message);
    }

    const entities = states
      ? states
          .filter(s => s[6] != null && s[5] != null)
          .map(s => this._stateToEntityDef(s))
      : this._mockEntityDefs(geoCenter);

    return { entities };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _visualAlt(realMetres) {
    return this.realisticAltitude ? realMetres : Math.log1p(realMetres) * 5;
  }

  _stateToEntityDef(s) {
    const altM    = s[7] ?? 500;
    const heading = s[10] ?? 0;
    return makeAircraftDef(
      `plane:${s[0]}`,
      s[6],
      s[5],
      (s[1] || 'UNK').trim(),
      altM,
      this._visualAlt(altM),
      heading,
    );
  }

  _mockEntityDefs(geoCenter) {
    const { lat, lon } = geoCenter;
    return [
      makeAircraftDef('plane:MOCK01', lat + 0.002, lon + 0.002, 'MOCK01',  800, this._visualAlt( 800), 120),
      makeAircraftDef('plane:MOCK02', lat + 0.003, lon - 0.001, 'MOCK02', 1200, this._visualAlt(1200), 280),
    ];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy() {
    this._polling = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}