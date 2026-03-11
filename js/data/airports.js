export const AIRPORTS = [
  { code: 'JFK', name: 'New York JFK', city: 'New York' },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles' },
  { code: 'ORD', name: "Chicago O'Hare", city: 'Chicago' },
  { code: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas' },
  { code: 'DEN', name: 'Denver Intl', city: 'Denver' },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco' },
  { code: 'SEA', name: 'Seattle-Tacoma', city: 'Seattle' },
  { code: 'ATL', name: 'Atlanta Hartsfield', city: 'Atlanta' },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami' },
  { code: 'BOS', name: 'Boston Logan', city: 'Boston' },
  { code: 'MSP', name: 'Minneapolis-St Paul', city: 'Minneapolis' },
  { code: 'DTW', name: 'Detroit Metro', city: 'Detroit' },
  { code: 'PHL', name: 'Philadelphia Intl', city: 'Philadelphia' },
  { code: 'CLT', name: 'Charlotte Douglas', city: 'Charlotte' },
  { code: 'PHX', name: 'Phoenix Sky Harbor', city: 'Phoenix' },
  { code: 'IAH', name: 'Houston Intercontinental', city: 'Houston' },
  { code: 'SLC', name: 'Salt Lake City Intl', city: 'Salt Lake City' },
  { code: 'SAN', name: 'San Diego Intl', city: 'San Diego' },
  { code: 'PDX', name: 'Portland Intl', city: 'Portland' },
  { code: 'LAS', name: 'Las Vegas McCarran', city: 'Las Vegas' },
];

// Hub airport - player's airline operates from here
export const HUB = AIRPORTS[0]; // JFK

// Routes are hub-to-spoke
export function generateRoutes(numFlights) {
  const spokes = AIRPORTS.filter(a => a.code !== HUB.code);
  const routes = [];

  for (let i = 0; i < numFlights; i++) {
    const spoke = spokes[i % spokes.length];
    // Alternate between outbound and inbound
    if (i % 2 === 0) {
      routes.push({ origin: HUB, destination: spoke });
    } else {
      routes.push({ origin: spoke, destination: HUB });
    }
  }

  return routes;
}

// Flight duration in game-minutes based on rough distance
export function getFlightDuration(origin, destination) {
  // Simplified: 60-240 min based on pseudo-distance
  const hash = (origin.charCodeAt(0) + destination.charCodeAt(0)) * 7;
  return 60 + (hash % 180);
}
