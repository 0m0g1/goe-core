import { BaseLoader } from '../BaseLoader.js';

export class WeatherLoader extends BaseLoader {
  get id() { return 'weather-loader'; }

  constructor(apiKey, options = {}) {
    super(options);
    this.apiKey = apiKey;
  }

  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data.weather) return {};

      // 1. Map Condition to Engine Modes
      let mode = 'none';
      const main = data.weather[0].main.toLowerCase();
      
      if (main.includes('rain') || main.includes('drizzle')) mode = 'rain';
      else if (main.includes('snow')) mode = 'snow';

      // 2. Calculate Wind Vector
      // Map degrees (0=N, 90=E) to Engine X/Y
      const speed = (data.wind?.speed ?? 0) * 0.01; 
      const angle = ((data.wind?.deg ?? 0) - 90) * (Math.PI / 180);
      
      return {
        weatherUpdate: {
          mode: mode,
          wind: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          temp: data.main.temp,
          condition: data.weather[0].description
        }
      };
    } catch (e) {
      console.error("[WeatherLoader] API Error:", e);
      return {};
    }
  }
}