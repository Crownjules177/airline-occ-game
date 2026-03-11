import { AIRPORTS, HUB, generateRoutes, getFlightDuration } from '../data/airports.js';
import { getRandomAircraft } from '../data/aircraft.js';
import { Clock } from './Clock.js';

export class FlightScheduler {
  constructor(gameState, difficultyScaler) {
    this.state = gameState;
    this.difficulty = difficultyScaler;
    this._lastStatusUpdate = {};
  }

  generateSchedule(dayNumber) {
    const numFlights = this.difficulty.getFlightCount();
    const routes = generateRoutes(numFlights);
    const airlineCode = this.state.get('airlineCode');
    const preDelayRate = this.difficulty.getPreDelayRate();

    const flights = routes.map((route, i) => {
      const flightNum = 100 + i + 1;
      const flightId = `${airlineCode}${flightNum}`;

      // Spread departures across the day (06:00 to 21:00 = 360 to 1260 minutes)
      const window = 900; // 15 hours of scheduling window
      const baseTime = 360 + (i / numFlights) * window;
      // Add some randomness (+/- 20 min)
      const scheduledDeparture = Math.round(baseTime + (Math.random() - 0.5) * 40);
      const duration = getFlightDuration(route.origin.code, route.destination.code);
      const scheduledArrival = scheduledDeparture + duration;

      // Pre-delay some flights on harder days
      const isPreDelayed = Math.random() < preDelayRate;
      const preDelay = isPreDelayed ? Math.round(15 + Math.random() * 30) : 0;

      return {
        id: flightId,
        flightNumber: flightNum,
        origin: route.origin,
        destination: route.destination,
        aircraft: getRandomAircraft(),
        scheduledDeparture,
        scheduledArrival,
        estimatedDeparture: isPreDelayed ? scheduledDeparture + preDelay : null,
        actualDeparture: null,
        actualArrival: null,
        status: isPreDelayed ? 'delayed' : 'scheduled',
        delayMinutes: preDelay,
        cancelled: false,
      };
    });

    // Sort by scheduled departure
    flights.sort((a, b) => a.scheduledDeparture - b.scheduledDeparture);
    this._lastStatusUpdate = {};
    return flights;
  }

  update() {
    const gameTime = this.state.get('gameTime');
    const flights = this.state.get('flights');
    let changed = false;

    for (const flight of flights) {
      if (flight.cancelled) continue;

      const effectiveDeparture = flight.estimatedDeparture || flight.scheduledDeparture;
      const duration = flight.scheduledArrival - flight.scheduledDeparture;
      const effectiveArrival = effectiveDeparture + duration;
      const prevStatus = flight.status;

      if (flight.status === 'arrived') continue;

      // Boarding starts 30 min before departure
      if (gameTime >= effectiveDeparture - 30 && gameTime < effectiveDeparture && !flight.actualDeparture) {
        if (flight.status === 'scheduled' || flight.status === 'delayed') {
          flight.status = 'boarding';
          changed = true;
        }
      }

      // Departure
      if (gameTime >= effectiveDeparture && !flight.actualDeparture) {
        flight.actualDeparture = effectiveDeparture;
        flight.status = 'departed';
        changed = true;
      }

      // En route (after 5 game-minutes from departure)
      if (flight.actualDeparture && gameTime >= flight.actualDeparture + 5 && flight.status === 'departed') {
        flight.status = 'en-route';
        changed = true;
      }

      // Arrival
      if (flight.actualDeparture && gameTime >= effectiveArrival) {
        if (flight.status !== 'arrived') {
          flight.actualArrival = effectiveArrival;
          flight.status = 'arrived';
          changed = true;
        }
      }

      // Emit messages on status change
      if (flight.status !== prevStatus && flight.status !== this._lastStatusUpdate[flight.id]) {
        this._lastStatusUpdate[flight.id] = flight.status;
        this._emitStatusMessage(flight, prevStatus);
      }
    }

    if (changed) {
      this.state.update({ flights: [...flights] });
    }
  }

  _emitStatusMessage(flight, prevStatus) {
    // We'll hook this up to the message board via a callback
    if (this.onFlightUpdate) {
      const route = `${flight.origin.code}\u2192${flight.destination.code}`;
      switch (flight.status) {
        case 'boarding':
          this.onFlightUpdate('system', 'Ops', `${flight.id} (${route}) now boarding at gate.`);
          break;
        case 'departed':
          this.onFlightUpdate('system', 'Ops', `${flight.id} (${route}) has departed. ${flight.aircraft.shortName}`);
          break;
        case 'arrived':
          this.onFlightUpdate('system', 'Ops', `${flight.id} (${route}) arrived at destination.`);
          break;
      }
    }
  }

  cancelFlight(flightId) {
    const flights = this.state.get('flights');
    const flight = flights.find(f => f.id === flightId);
    if (flight) {
      flight.cancelled = true;
      flight.status = 'cancelled';
      this.state.update({
        flights: [...flights],
        cancelledToday: this.state.get('cancelledToday') + 1,
        totalCancelled: this.state.get('totalCancelled') + 1,
      });
    }
  }

  groundFleetType(aircraftType) {
    const flights = this.state.get('flights');
    let grounded = 0;
    for (const flight of flights) {
      if (flight.aircraft.type === aircraftType && !flight.cancelled && flight.actualDeparture === null) {
        flight.cancelled = true;
        flight.status = 'cancelled';
        grounded++;
      }
    }
    if (grounded > 0) {
      this.state.update({
        flights: [...flights],
        cancelledToday: this.state.get('cancelledToday') + grounded,
        totalCancelled: this.state.get('totalCancelled') + grounded,
      });
    }
    return grounded;
  }

  addDelay(flightId, minutes) {
    const flights = this.state.get('flights');
    const flight = flights.find(f => f.id === flightId);
    if (flight && !flight.cancelled && !flight.actualDeparture) {
      flight.delayMinutes += minutes;
      const newEst = flight.scheduledDeparture + flight.delayMinutes;
      flight.estimatedDeparture = newEst;
      if (flight.status !== 'cancelled') {
        flight.status = 'delayed';
      }
      this.state.update({ flights: [...flights] });
    }
  }
}
