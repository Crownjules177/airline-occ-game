export class GameOverScreen {
  constructor(gameState, onRestart) {
    this.state = gameState;
    this.onRestart = onRestart;

    this.gameOverScreen = document.getElementById('game-over-screen');
    this.dayCompleteScreen = document.getElementById('day-complete-screen');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnNextDay = document.getElementById('btn-next-day');
    this.onNextDay = null;

    this.btnRestart.addEventListener('click', () => {
      this.gameOverScreen.style.display = 'none';
      this.onRestart();
    });

    this.btnNextDay.addEventListener('click', () => {
      this.dayCompleteScreen.style.display = 'none';
      this.onNextDay?.();
    });
  }

  showGameOver() {
    const reason = this.state.get('gameOverReason');
    const detail = this.state.get('gameOverDetail');
    const reasonEl = document.getElementById('game-over-reason');

    if (reason === 'safety') {
      reasonEl.textContent = `Safety Ground Stop: ${detail}`;
    } else {
      reasonEl.textContent = detail;
    }

    document.getElementById('go-days').textContent = this.state.get('dayNumber');
    document.getElementById('go-flights').textContent = this.state.get('totalFlightsOperated');
    document.getElementById('go-otp').textContent = `${this.state.get('otp').toFixed(1)}%`;
    document.getElementById('go-cancelled').textContent = this.state.get('totalCancelled');

    this.gameOverScreen.style.display = 'flex';
  }

  showDayComplete() {
    const flights = this.state.get('flights');
    const operated = flights.filter(f => f.actualDeparture !== null).length;
    const cancelled = this.state.get('cancelledToday');
    const otp = this.state.get('otp');
    const events = this.state.get('eventsHandledToday');

    document.getElementById('dc-flights').textContent = flights.length;
    document.getElementById('dc-otp').textContent = `${otp.toFixed(1)}%`;
    document.getElementById('dc-events').textContent = events;
    document.getElementById('dc-cancelled').textContent = cancelled;

    const subtitleEl = document.getElementById('day-complete-subtitle');
    subtitleEl.textContent = `Well done! ${operated} flights operated with ${otp.toFixed(1)}% on-time performance.`;

    // Show OTP warning if consecutive low days
    const consecutive = this.state.get('consecutiveLowOTPDays');
    const warningEl = document.getElementById('dc-otp-warning');
    if (consecutive > 0) {
      warningEl.style.display = 'block';
      const remaining = 3 - consecutive;
      warningEl.textContent = `\u26A0 WARNING: OTP below 80% for ${consecutive} consecutive day${consecutive > 1 ? 's' : ''}. ${remaining} more day${remaining !== 1 ? 's' : ''} until operations are suspended.`;
      subtitleEl.textContent = `${operated} flights operated with ${otp.toFixed(1)}% on-time performance. You need to improve.`;
    } else {
      warningEl.style.display = 'none';
    }

    // Update running total
    this.state.update({
      totalFlightsOperated: this.state.get('totalFlightsOperated') + operated,
    });

    this.dayCompleteScreen.style.display = 'flex';
  }

  hideAll() {
    this.gameOverScreen.style.display = 'none';
    this.dayCompleteScreen.style.display = 'none';
  }
}
