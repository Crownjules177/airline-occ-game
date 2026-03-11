export class Clock {
  static REAL_DAY_SECONDS = 120;
  static GAME_DAY_START = 360;   // 06:00
  static GAME_DAY_END = 1439;    // 23:59
  static GAME_DAY_DURATION = 1079; // minutes of operation
  static TIME_SCALE = 1079 / 120; // ~9 game-minutes per real-second

  constructor(gameState) {
    this.state = gameState;
    this.realTimeElapsed = 0;
  }

  update(deltaSeconds) {
    this.realTimeElapsed += deltaSeconds;
    const gameMinutes = Clock.GAME_DAY_START + (this.realTimeElapsed * Clock.TIME_SCALE);
    this.state.update({
      gameTime: Math.min(gameMinutes, Clock.GAME_DAY_END),
      realTimeElapsed: this.realTimeElapsed
    });
  }

  isDayOver() {
    return this.realTimeElapsed >= Clock.REAL_DAY_SECONDS;
  }

  reset() {
    this.realTimeElapsed = 0;
  }

  static formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
