import { BaseLoader } from '../BaseLoader.js';

const PROXY_URL    = 'https://corsproxy.io/?';
const OPENSKY_BASE = 'https://opensky-network.org/api/states/all';

const ALTITUDE_SCALE = 0.04;

// OpenSky rate limits:
//   Anonymous : 1 request / 10 s, max 400 credits/day
//   Registered: 1 request /  5 s
// We poll every 12 s to stay safely under the anonymous limit.
// fetch() returns the last cached result immediately so the engine never
// waits on network I/O.
const POLL_INTERVAL_MS = 12_000;

export class AviationLoader extends BaseLoader {
  get id() { return 'aviation-loader'; }

  constructor(options = {}) {
    super(options);
    this._lastResult      = { features: [] };
    this._geoCenter       = null;
    this._timer           = null;
    this._polling         = false;
    this.realisticAltitude = false;
    this._pollIntervalMs  = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  /**
   * Called by the engine whenever it wants aviation data.
   * Returns the most-recently fetched result immediately (no await on network).
   * Starts the background poll loop on first call.
   */
  async fetch(geoCenter) {
    this._geoCenter = geoCenter;
    if (!this._polling) this._startPolling();
    return this._lastResult;
  }

  // ── Background poll ────────────────────────────────────────────────────────

  _startPolling() {
    this._polling = true;
    // Fire immediately, then schedule recurring polls
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

    // Schedule next poll (clearTimeout-safe — if destroy() was called between
    // the async fetch above and here, _polling will be false)
    if (this._polling) {
      this._timer = setTimeout(() => this._poll(), this._pollIntervalMs);
    }
  }

  // ── Live fetch (moved from the old public fetch()) ─────────────────────────

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

    const features = states
      ? states
          .filter(s => s[6] != null && s[5] != null)
          .map(s => this._mapState(s, geoCenter))
      : this._mockStates(geoCenter);

    return { features };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _visualAlt(realMetres) {
    if (this.realisticAltitude) return realMetres;
    return Math.log1p(realMetres) * 5;
  }

  _mapState(s, geoCenter) {
    const altM = s[7] ?? 500;
    return {
      id:        `plane:${s[0]}`,
      latitude:  s[6],
      longitude: s[5],
      label:     (s[1] || 'UNK').trim(),
      tags:      { aviation: 'yes' },
      data: {
        category:         'aviation',
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
      [null, 'MOCK01', null, null, null, lon + 0.002, lat + 0.002, 800,  false, 150, 120, null, null, null, null, null, null],
      [null, 'MOCK02', null, null, null, lon - 0.001, lat + 0.003, 1200, false, 200, 280, null, null, null, null, null, null],
    ].map(s => this._mapState(s, geoCenter));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  destroy() {
    this._polling = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}