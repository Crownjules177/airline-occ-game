import { StatusBar } from './StatusBar.js';
import { FlightBoard } from './FlightBoard.js';
import { MessageBoard } from './MessageBoard.js';
import { EventModal } from './EventModal.js';
import { GameOverScreen } from './GameOverScreen.js';
import { JustificationModal } from './JustificationModal.js';
import { AirportView } from '../canvas/AirportView.js';

export class Dashboard {
  constructor(gameState, eventSystem, onRestart) {
    this.state = gameState;
    this.container = document.getElementById('game-container');

    this.statusBar = new StatusBar(gameState);
    this.flightBoard = new FlightBoard(gameState);
    this.messageBoard = new MessageBoard(gameState);
    this.eventModal = new EventModal(gameState, eventSystem);
    this.gameOverScreen = new GameOverScreen(gameState, onRestart);
    this.justificationModal = new JustificationModal(gameState);
    this.airportView = new AirportView(
      document.getElementById('airport-canvas'),
      gameState
    );

    this._lastPhase = null;
  }

  show() {
    this.container.classList.add('active');
    this.airportView.resize();
    window.addEventListener('resize', () => this.airportView.resize());
  }

  hide() {
    this.container.classList.remove('active');
  }

  addMessage(type, source, text) {
    this.messageBoard.addMessage(type, source, text);
  }

  render(deltaMs) {
    this.statusBar.update();
    this.flightBoard.update();
    this.airportView.render(deltaMs);

    const phase = this.state.get('phase');

    // Sync modal visibility directly with state
    if (phase === 'event-decision' && !this.eventModal._visible) {
      const event = this.state.get('activeEvent');
      if (event) this.eventModal.show(event);
    } else if (phase !== 'event-decision' && this.eventModal._visible) {
      this.eventModal.hide();
    }

    // Handle phase transitions for overlays
    if (phase !== this._lastPhase) {
      if (phase === 'game-over') {
        this.eventModal.hide();
        this.justificationModal.hide();
        this.gameOverScreen.showGameOver();
      }

      if (phase === 'day-end') {
        this.gameOverScreen.showDayComplete();
      }

      this._lastPhase = phase;
    }
  }

  reset() {
    this.messageBoard.clear();
    this.gameOverScreen.hideAll();
    this.eventModal.hide();
    this.justificationModal.hide();
    this._lastPhase = null;
  }
}
