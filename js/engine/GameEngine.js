export class GameEngine {
  constructor(gameState, systems, ui) {
    this.state = gameState;
    this.systems = systems;
    this.ui = ui;
    this.lastTimestamp = 0;
    this.running = false;
    this._rafId = null;
  }

  start() {
    this.running = true;
    this.lastTimestamp = performance.now();
    this._loop(this.lastTimestamp);
  }

  stop() {
    this.running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _loop(timestamp) {
    if (!this.running) return;

    const deltaMs = Math.min(timestamp - this.lastTimestamp, 100); // cap to avoid spiral
    this.lastTimestamp = timestamp;
    const deltaSeconds = deltaMs / 1000;

    const phase = this.state.get('phase');

    if (phase === 'playing') {
      const speedMultiplier = this.state.get('speedMultiplier') || 1;
      const adjustedDelta = deltaSeconds * speedMultiplier;

      // Advance clock
      this.systems.clock.update(adjustedDelta);

      // Update flight statuses
      this.systems.flightScheduler.update();

      // Check for events
      this.systems.eventSystem.update(adjustedDelta);

      // Generate team feedback
      if (this.systems.feedbackSystem) {
        this.systems.feedbackSystem.update(adjustedDelta);
      }

      // Recalculate OTP
      this.systems.otpCalculator.update();

      // Check end of day
      if (this.systems.clock.isDayOver()) {
        this._endDay();
      }
    }

    // Always render (for animation even when paused)
    this.ui.render(deltaMs);

    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
  }

  _endDay() {
    const otp = this.state.get('otp');
    if (otp < 80) {
      const consecutive = this.state.get('consecutiveLowOTPDays') + 1;
      if (consecutive >= 3) {
        this.state.update({
          phase: 'game-over',
          gameOverReason: 'otp',
          gameOverDetail: `On-time performance below 80% for ${consecutive} consecutive days (final: ${otp.toFixed(1)}%)`,
          consecutiveLowOTPDays: consecutive,
        });
      } else {
        this.state.update({
          phase: 'day-end',
          consecutiveLowOTPDays: consecutive,
        });
      }
    } else {
      this.state.update({
        phase: 'day-end',
        consecutiveLowOTPDays: 0,
      });
    }
  }

  advanceDay() {
    const dayNum = this.state.get('dayNumber') + 1;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayOfWeek = days[(dayNum - 1) % 7];

    this.systems.clock.reset();
    this.systems.eventSystem.reset();

    // Generate new schedule
    const flights = this.systems.flightScheduler.generateSchedule(dayNum);

    this.state.update({
      phase: 'playing',
      dayNumber: dayNum,
      dayOfWeek,
      gameTime: 360,
      realTimeElapsed: 0,
      flights,
      messages: [],
      activeEvent: null,
      eventsHandledToday: 0,
      cancelledToday: 0,
    });

    this.systems.otpCalculator.update();
    this.ui.addMessage('system', 'System', `Day ${dayNum} operations commencing. ${flights.length} flights scheduled.`);
  }
}
