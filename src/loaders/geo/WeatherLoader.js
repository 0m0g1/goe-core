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

      const main = data.weather[0].main.toLowerCase();
      let mode = 'none';

      // Mapping all OpenWeatherMap Main conditions to Engine Modes
      if (main === 'thunderstorm') mode = 'thunderstorm';
      else if (main === 'rain' || main === 'drizzle') mode = 'rain';
      else if (main === 'snow') mode = 'snow';
      else if (['mist', 'smoke', 'haze', 'fog', 'ash'].includes(main)) mode = 'fog';
      else if (['dust', 'sand', 'squall'].includes(main)) mode = 'sand';
      else if (main === 'tornado') mode = 'thunderstorm'; // Use thunderstorm as proxy
      else if (main === 'clouds') mode = 'cloudy';

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