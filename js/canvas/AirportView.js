import { Sky } from './Sky.js';
import { Terminal } from './Terminal.js';
import { AircraftSprite } from './Aircraft.js';

export class AirportView {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = gameState;
    this.sky = new Sky(this.ctx);
    this.terminal = new Terminal(this.ctx);
    this.aircraft = [];
    this._lastFlightStatuses = {};
    this._weatherEffect = null;
    this._weatherTimer = 0;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
  }

  render(deltaMs) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (w === 0 || h === 0) return;

    const gameTime = this.state.get('gameTime') || 360;
    const groundY = h * 0.6;

    ctx.clearRect(0, 0, w, h);

    // Sky
    this.sky.render(gameTime, w, h);

    // Terminal and runway
    this.terminal.render(w, h, gameTime);

    // Check for new departures/arrivals
    this._syncWithFlights(groundY, w);

    // Update and render aircraft
    this.aircraft = this.aircraft.filter(ac => !ac.done);
    for (const ac of this.aircraft) {
      ac.update(deltaMs, groundY, w);
      ac.render(ctx);
    }

    // Weather overlay
    this._renderWeather(ctx, w, h, deltaMs);
  }

  _syncWithFlights(groundY, width) {
    const flights = this.state.get('flights');
    if (!flights) return;

    for (const flight of flights) {
      const prevStatus = this._lastFlightStatuses[flight.id];

      if (flight.status === 'departed' && prevStatus !== 'departed') {
        // New departure - spawn aircraft
        const ac = new AircraftSprite(flight.id, 'departure');
        ac.initDeparture(groundY, width);
        this.aircraft.push(ac);
      }

      if (flight.status === 'arrived' && prevStatus !== 'arrived') {
        // Arrival - spawn incoming aircraft
        const ac = new AircraftSprite(flight.id, 'arrival');
        ac.initArrival(groundY, width);
        this.aircraft.push(ac);
      }

      this._lastFlightStatuses[flight.id] = flight.status;
    }

    // Limit active aircraft to prevent performance issues
    if (this.aircraft.length > 8) {
      this.aircraft = this.aircraft.slice(-8);
    }
  }

  setWeather(type) {
    this._weatherEffect = type; // 'rain' | 'fog' | 'snow' | null
  }

  _renderWeather(ctx, w, h, deltaMs) {
    if (!this._weatherEffect) return;
    this._weatherTimer += deltaMs;

    switch (this._weatherEffect) {
      case 'rain':
        ctx.strokeStyle = 'rgba(150, 180, 220, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 50; i++) {
          const x = (Math.random() * w + this._weatherTimer * 0.1) % w;
          const y = (Math.random() * h + this._weatherTimer * 0.3) % h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 3, y + 12);
          ctx.stroke();
        }
        break;

      case 'fog':
        ctx.fillStyle = `rgba(180, 190, 200, ${0.15 + 0.05 * Math.sin(this._weatherTimer / 2000)})`;
        ctx.fillRect(0, 0, w, h);
        break;

      case 'snow':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let i = 0; i < 30; i++) {
          const x = (Math.random() * w + Math.sin(this._weatherTimer / 1000 + i) * 20) % w;
          const y = (i * h / 30 + this._weatherTimer * 0.02) % h;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
  }

  reset() {
    this.aircraft = [];
    this._lastFlightStatuses = {};
    this._weatherEffect = null;
    this._weatherTimer = 0;
  }
}
