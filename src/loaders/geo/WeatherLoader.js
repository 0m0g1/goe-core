import { BaseLoader } from '../BaseLoader.js';

// Poll every 10 minutes — weather doesn't change faster than that for our
// purposes, and OpenWeatherMap's free tier has a 60-call/minute limit but
// more critically a daily cap. Keeping refreshes sparse is important.
const DEFAULT_POLL_MS = 10 * 60 * 1000; // 10 minutes

export class WeatherLoader extends BaseLoader {
  get id() { return 'weather-loader'; }

  constructor(apiKey, options = {}) {
    super(options);
    this.apiKey          = apiKey;
    this._pollMs         = options.pollMs ?? DEFAULT_POLL_MS;
    this._lastResult     = {};
    this._lastKey        = null;   // coarse location key of the last fetch
    this._timer          = null;
    this._polling        = false;
  }

  /**
   * Called by the engine on each fetch cycle.
   * - If the player has moved to a new ~10 km cell, fetches immediately.
   * - Otherwise returns the cached result and lets the background timer
   *   handle refreshes.
   */
  async fetch(geoCenter) {
    // toFixed(1) = ~11 km grid — coarser than terrain/bio so weather changes
    // even less often than tile data.
    const key = `${geoCenter.lat.toFixed(1)},${geoCenter.lon.toFixed(1)}`;

    if (key !== this._lastKey) {
      // Significant location change — cancel any pending poll and fetch now.
      this._stopPolling();
      this._lastKey = key;
      this._lastResult = await this._fetchLive(geoCenter);
      this._startPolling(geoCenter);
    }

    return this._lastResult;
  }

  // ── Background poll ────────────────────────────────────────────────────────

  _startPolling(geoCenter) {
    this._polling = true;
    this._timer   = setTimeout(async () => {
      if (!this._polling) return;
      this._lastResult = await this._fetchLive(geoCenter);
      // Re-schedule using the same center (the engine will call fetch() again
      // and replace the timer if the player moves far enough)
      this._startPolling(geoCenter);
    }, this._pollMs);
  }

  _stopPolling() {
    this._polling = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  // ── Live fetch (was the old public fetch()) ────────────────────────────────

  async _fetchLive(geoCenter) {
    const { lat, lon } = geoCenter;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`;

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.weather) return {};

      const main = data.weather[0].main.toLowerCase();
      let mode = 'none';

      if (main === 'thunderstorm')                                        mode = 'thunderstorm';
      else if (main === 'rain' || main === 'drizzle')                    mode = 'rain';
      else if (main === 'snow')                                           mode = 'snow';
      else if (['mist','smoke','haze','fog','ash'].includes(main))        mode = 'fog';
      else if (['dust','sand','squall'].includes(main))                   mode = 'sand';
      else if (main === 'tornado')                                        mode = 'thunderstorm';
      else if (main === 'clouds')                                         mode = 'cloudy';

      const speed = (data.wind?.speed ?? 0) * 0.01;
      const angle = ((data.wind?.deg ?? 0) - 90) * (Math.PI / 180);

      return {
        weatherUpdate: {
          mode,
          wind:      { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          temp:      data.main.temp,
          condition: data.weather[0].description,
        }
      };
    } catch (e) {
      console.error('[WeatherLoader] API Error:', e);
      return {};
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  destroy() { this._stopPolling(); }
}