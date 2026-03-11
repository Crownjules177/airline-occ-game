import { Clock } from '../systems/Clock.js';

export class StatusBar {
  constructor(gameState) {
    this.state = gameState;

    this.brandEl = document.getElementById('airline-brand');
    this.codeEl = document.getElementById('airline-code');
    this.clockEl = document.getElementById('game-clock');
    this.dayOfWeekEl = document.getElementById('day-of-week');
    this.dayNumberEl = document.getElementById('day-number');
    this.otpValueEl = document.getElementById('otp-value');
    this.btnPause = document.getElementById('btn-pause');
    this.btnFF = document.getElementById('btn-fast-forward');

    this.onPauseToggle = null;

    this.btnPause.addEventListener('click', () => {
      this.onPauseToggle?.();
    });

    // Fast forward: active while held down
    const startFF = () => this.state.update({ speedMultiplier: 2 });
    const stopFF = () => this.state.update({ speedMultiplier: 1 });
    this.btnFF.addEventListener('mousedown', startFF);
    this.btnFF.addEventListener('mouseup', stopFF);
    this.btnFF.addEventListener('mouseleave', stopFF);
    this.btnFF.addEventListener('touchstart', (e) => { e.preventDefault(); startFF(); });
    this.btnFF.addEventListener('touchend', stopFF);

    // Listen for state changes
    this.state.on('airlineName', (name) => {
      this.brandEl.textContent = name;
    });
    this.state.on('airlineCode', (code) => {
      this.codeEl.textContent = code;
    });
  }

  update() {
    const gameTime = this.state.get('gameTime');
    this.clockEl.textContent = Clock.formatTime(gameTime);

    this.dayOfWeekEl.textContent = this.state.get('dayOfWeek');
    this.dayNumberEl.textContent = this.state.get('dayNumber');

    const otp = this.state.get('otp');
    const otpStr = `${otp.toFixed(1)}%`;
    this.otpValueEl.textContent = otpStr;

    // Update color class
    this.otpValueEl.classList.remove('good', 'warning', 'danger');
    if (otp >= 90) {
      this.otpValueEl.classList.add('good');
    } else if (otp >= 80) {
      this.otpValueEl.classList.add('warning');
    } else {
      this.otpValueEl.classList.add('danger');
    }

    // Update pause button
    const phase = this.state.get('phase');
    this.btnPause.textContent = phase === 'paused' ? 'Resume' : 'Pause';

    // Disable FF when not playing
    const canFF = phase === 'playing';
    this.btnFF.disabled = !canFF;
    if (!canFF && this.state.get('speedMultiplier') !== 1) {
      this.state.update({ speedMultiplier: 1 });
    }

    // FF active visual
    const isFF = this.state.get('speedMultiplier') > 1;
    this.btnFF.classList.toggle('active', isFF);
  }
}
