import GOECore, { 
  OSMTileURL, 
  TerrainType 
} from './src/GOECore.js';

// 1. Define stylized "Eden" events
const edenEvents = [
  { id: '1', lat: 51.505, lon: -0.09, category: 'nature', title: 'Sacred Tree', color: '#5cb842' },
  { id: '2', lat: 51.506, lon: -0.08, category: 'spiritual', title: 'Guardian Seraph', color: '#ffe866' },
  { id: '3', lat: 51.504, lon: -0.10, category: 'ancient', title: 'Beast of the Field', color: '#d19d45' }
];

// 2. Initialise the GeoCore Engine
const engine = new GOECore({
  geoCenter: { lat: 51.505, lon: -0.09 },
  mPerTile: 4, // 4 meters per tile resolution
  tileURLFn: OSMTileURL, // Default OpenStreetMap tiles
  cameraOpts: {
    zoom: 0.14,
    rotation: Math.PI / 4 // 45-degree ISO rotation
  }
}, document.getElementById('map-canvas'));

// 3. Set the features
engine.setFeatures(edenEvents);

// 4. Handle Interaction Events
engine.on('feature:click', ({ id, data }) => {
  console.log(`Inspecting Feature ${id}:`, data.title);
  // Highlight in UI
  document.getElementById('status').innerText = `Inspecting: ${data.title}`;
});

engine.on('hud', (data) => {
  document.getElementById('hud-lat').innerText = data.lat.toFixed(5);
  document.getElementById('hud-lon').innerText = data.lon.toFixed(5);
  document.getElementById('hud-terrain').innerText = data.terrain;
});

console.log("GeoCore Engine v" + GOECore.VERSION + " active.");