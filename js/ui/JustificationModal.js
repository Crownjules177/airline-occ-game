export class JustificationModal {
  constructor(gameState) {
    this.state = gameState;
    this.overlay = document.getElementById('justification-overlay');
    this.titleEl = document.getElementById('justification-title');
    this.promptEl = document.getElementById('justification-prompt');
    this.inputEl = document.getElementById('justification-input');
    this.btnSubmit = document.getElementById('btn-submit-justification');
    this.onSubmit = null; // callback: () => void
    this._visible = false;

    this.btnSubmit.addEventListener('click', () => this._submit());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });
  }

  show(type, eventTitle, flightId) {
    const title = type === 'continue'
      ? 'Safety Investigation Board Review'
      : 'Network Performance Review';
    const prompt = type === 'continue'
      ? `You chose to continue operations for flight ${flightId} despite: "${eventTitle}". Please justify your decision to the Safety Investigation Board.`
      : `You chose to cancel flight ${flightId} in response to: "${eventTitle}". Please explain your rationale to the Network Performance Review committee.`;

    this.titleEl.textContent = title;
    this.promptEl.textContent = prompt;
    this.inputEl.value = '';
    this.overlay.style.display = 'flex';
    this._visible = true;

    // Focus after animation
    setTimeout(() => this.inputEl.focus(), 100);
  }

  hide() {
    this.overlay.style.display = 'none';
    this._visible = false;
  }

  _submit() {
    if (!this._visible) return;
    if (this.inputEl.value.trim().length === 0) {
      this.inputEl.placeholder = 'Please provide a justification before submitting...';
      this.inputEl.focus();
      return;
    }
    this.hide();
    this.onSubmit?.();
  }
}
