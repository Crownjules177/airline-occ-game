import { AvatarGenerator } from './AvatarGenerator.js';

export class EventModal {
  constructor(gameState, eventSystem) {
    this.state = gameState;
    this.eventSystem = eventSystem;
    this.onDecision = null; // callback: (result) => void

    this.overlay = document.getElementById('event-modal-overlay');
    this.avatarEl = document.getElementById('event-manager-avatar');
    this.deptIcon = document.getElementById('event-dept-icon');
    this.deptName = document.getElementById('event-dept-name');
    this.managerName = document.getElementById('event-manager-name');
    this.riskBadge = document.getElementById('event-risk-badge');
    this.titleEl = document.getElementById('event-title');
    this.flightRefEl = document.getElementById('event-flight-ref');
    this.descriptionEl = document.getElementById('event-description');
    this.countdownEl = document.getElementById('event-countdown');
    this.btnCancel = document.getElementById('btn-cancel-flight');
    this.btnContinue = document.getElementById('btn-continue-ops');
    this.btnGroundFleet = document.getElementById('btn-ground-fleet');
    this.decisionButtons = document.getElementById('decision-buttons');

    this._countdownInterval = null;
    this._avatarCache = new Map();
    this._showingGroundFleet = false;

    this.btnCancel.addEventListener('click', () => this._decide('cancel'));
    this.btnContinue.addEventListener('click', () => this._decide('continue'));
    this.btnGroundFleet.addEventListener('click', () => this._decide('ground-fleet'));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this._visible) return;
      if (e.key === '1') this._decide('cancel');
      if (e.key === '2') this._decide('continue');
      if (e.key === '3' && this._showingGroundFleet) this._decide('ground-fleet');
    });
  }

  show(event) {
    // Generate/cache avatar
    const cacheKey = event.deptInfo.manager;
    if (!this._avatarCache.has(cacheKey)) {
      this._avatarCache.set(cacheKey, AvatarGenerator.generate(event.deptInfo.manager, event.deptInfo.color, 48));
    }
    this.avatarEl.src = this._avatarCache.get(cacheKey);
    this.deptIcon.style.display = 'none'; // hide emoji when avatar present

    this.deptName.textContent = event.deptInfo.name;
    this.deptName.style.color = event.deptInfo.color;
    this.managerName.textContent = event.deptInfo.manager;
    this.riskBadge.textContent = event.riskLabel;
    this.riskBadge.className = `risk-badge ${event.riskClass}`;
    this.titleEl.textContent = event.title;
    this.flightRefEl.textContent = `Flight ${event.affectedFlightId} \u2014 ${event.affectedFlight.origin.code} \u2192 ${event.affectedFlight.destination.code} \u2014 ${event.affectedFlight.aircraft.name}`;
    this.descriptionEl.textContent = event.description;

    // Show/hide ground fleet button based on systemic risk
    this._showingGroundFleet = event.systemicRisk === true;
    this.btnGroundFleet.style.display = this._showingGroundFleet ? '' : 'none';
    this.decisionButtons.style.gridTemplateColumns = this._showingGroundFleet ? '1fr 1fr 1fr' : '1fr 1fr';

    this.overlay.style.display = 'flex';
    this._visible = true;
    this._startCountdown();
  }

  hide() {
    this.overlay.style.display = 'none';
    this._visible = false;
    this._stopCountdown();
  }

  _decide(choice) {
    if (!this._visible) return;
    this.hide();
    const result = this.eventSystem.resolveDecision(choice);
    this.onDecision?.(result);
  }

  _startCountdown() {
    this._stopCountdown();
    let seconds = 15;
    this.countdownEl.textContent = seconds;
    this._countdownInterval = setInterval(() => {
      seconds--;
      this.countdownEl.textContent = Math.max(seconds, 0);
      if (seconds <= 0) {
        this._stopCountdown();
        this._decide('cancel'); // Auto-cancel on timeout
      }
    }, 1000);
  }

  _stopCountdown() {
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
  }
}
