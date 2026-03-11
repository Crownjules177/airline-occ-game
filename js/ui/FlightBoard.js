import { Clock } from '../systems/Clock.js';

export class FlightBoard {
  constructor(gameState) {
    this.state = gameState;
    this.tbody = document.getElementById('flight-table-body');
    this._previousStatuses = {};
  }

  update() {
    const flights = this.state.get('flights');
    if (!flights) return;

    // Rebuild table (efficient enough for 20-50 rows)
    const rows = flights.map(flight => {
      const std = Clock.formatTime(flight.scheduledDeparture);
      const etd = flight.estimatedDeparture ? Clock.formatTime(flight.estimatedDeparture) : '\u2014';
      const atd = flight.actualDeparture ? Clock.formatTime(flight.actualDeparture) : '\u2014';
      const route = `${flight.origin.code}\u2192${flight.destination.code}`;
      const statusClass = flight.status.replace(' ', '-');
      const statusLabel = this._formatStatus(flight.status);

      // Check if status changed for highlight
      const prev = this._previousStatuses[flight.id];
      const highlight = prev && prev !== flight.status ? ' highlight' : '';
      this._previousStatuses[flight.id] = flight.status;

      return `<tr class="${highlight}" data-flight="${flight.id}">
        <td>${flight.id}</td>
        <td>${route}</td>
        <td>${std}</td>
        <td>${etd}</td>
        <td>${atd}</td>
        <td><span class="flight-status ${statusClass}">${statusLabel}</span></td>
      </tr>`;
    });

    this.tbody.innerHTML = rows.join('');
  }

  _formatStatus(status) {
    return status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}
