export class SetupScreen {
  constructor(gameState, onStart) {
    this.state = gameState;
    this.onStart = onStart;

    this.screen = document.getElementById('setup-screen');
    this.nameInput = document.getElementById('player-name');
    this.airlineInput = document.getElementById('airline-name');
    this.btnBegin = document.getElementById('btn-begin');

    this._bindEvents();
  }

  _bindEvents() {
    const validate = () => {
      const valid = this.nameInput.value.trim().length > 0 &&
                    this.airlineInput.value.trim().length > 0;
      this.btnBegin.disabled = !valid;
    };

    this.nameInput.addEventListener('input', validate);
    this.airlineInput.addEventListener('input', validate);

    this.btnBegin.addEventListener('click', () => this._begin());

    // Allow Enter key to submit
    this.airlineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.btnBegin.disabled) this._begin();
    });
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.airlineInput.focus();
    });
  }

  _begin() {
    const playerName = this.nameInput.value.trim();
    const airlineName = this.airlineInput.value.trim();
    const airlineCode = this._generateCode(airlineName);

    this.state.update({ playerName, airlineName, airlineCode });
    this.screen.style.display = 'none';
    this.onStart();
  }

  _generateCode(name) {
    // Generate 2-3 letter IATA-style code from airline name
    const words = name.toUpperCase().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0] + (words[1][1] || words[0][1] || '')).substring(0, 3);
    }
    return name.toUpperCase().substring(0, 3);
  }
}
