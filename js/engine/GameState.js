export class GameState {
  constructor() {
    this._state = {
      phase: 'setup', // setup | playing | paused | event-decision | day-end | game-over
      playerName: '',
      airlineName: '',
      airlineCode: '',
      dayNumber: 1,
      dayOfWeek: 'Monday',
      gameTime: 360, // current in-game minutes (starts at 06:00 = 360)
      realTimeElapsed: 0,
      flights: [],
      otp: 100,
      messages: [],
      activeEvent: null,
      eventsHandledToday: 0,
      totalFlightsOperated: 0,
      totalOnTime: 0,
      totalCancelled: 0,
      cancelledToday: 0,
      groundStop: false,
      gameOverReason: '',
      gameOverDetail: '',
      consecutiveLowOTPDays: 0,
      speedMultiplier: 1,
    };
    this._listeners = new Map();
  }

  get(key) {
    return this._state[key];
  }

  getAll() {
    return { ...this._state };
  }

  update(patch) {
    const prev = { ...this._state };
    Object.assign(this._state, patch);
    for (const key of Object.keys(patch)) {
      this._emit(key, this._state[key], prev[key]);
    }
    this._emit('stateChanged', this._state, prev);
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) set.delete(callback);
  }

  _emit(event, newVal, oldVal) {
    const set = this._listeners.get(event);
    if (set) {
      for (const cb of set) {
        cb(newVal, oldVal);
      }
    }
  }
}
