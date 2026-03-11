import { GameState } from './engine/GameState.js';
import { GameEngine } from './engine/GameEngine.js';
import { DifficultyScaler } from './engine/DifficultyScaler.js';
import { Clock } from './systems/Clock.js';
import { FlightScheduler } from './systems/FlightScheduler.js';
import { EventSystem } from './systems/EventSystem.js';
import { OTPCalculator } from './systems/OTPCalculator.js';
import { FeedbackSystem } from './systems/FeedbackSystem.js';
import { SetupScreen } from './ui/SetupScreen.js';
import { Dashboard } from './ui/Dashboard.js';
import { playEventAlert, playDecisionMade, playGameOver, playDayComplete } from './ui/Sound.js';

class Game {
  constructor() {
    this.state = new GameState();
    this.difficulty = new DifficultyScaler(this.state);
    this.clock = new Clock(this.state);
    this.flightScheduler = new FlightScheduler(this.state, this.difficulty);
    this.eventSystem = new EventSystem(this.state, this.difficulty);
    this.otpCalculator = new OTPCalculator(this.state);
    this.feedbackSystem = new FeedbackSystem(this.state);

    this.dashboard = new Dashboard(this.state, this.eventSystem, () => this.restart());
    this.setupScreen = new SetupScreen(this.state, () => this.startGame());

    this.engine = new GameEngine(
      this.state,
      {
        clock: this.clock,
        flightScheduler: this.flightScheduler,
        eventSystem: this.eventSystem,
        otpCalculator: this.otpCalculator,
        feedbackSystem: this.feedbackSystem,
      },
      this.dashboard
    );

    this._wireUpCallbacks();
  }

  _wireUpCallbacks() {
    // Flight status messages -> message board
    this.flightScheduler.onFlightUpdate = (type, source, text) => {
      this.dashboard.addMessage(type, source, text);
    };

    // Event messages -> message board
    this.eventSystem.onMessage = (type, source, text) => {
      this.dashboard.addMessage(type, source, text);
    };

    // Feedback messages -> message board
    this.feedbackSystem.onFeedback = (type, source, text) => {
      this.dashboard.addMessage(type, source, text);
    };

    // Event decision results -> flight scheduler + justification + feedback
    this.dashboard.eventModal.onDecision = (result) => {
      if (!result) return;

      if (result.action === 'cancel') {
        this.flightScheduler.cancelFlight(result.flightId);
      } else if (result.action === 'ground-fleet') {
        const count = this.flightScheduler.groundFleetType(result.aircraftType);
        this.dashboard.addMessage('decision', 'System',
          `${count} flights grounded. All ${result.aircraftName} aircraft taken out of service.`);
      } else if (result.action === 'continue' && result.delay > 0) {
        this.flightScheduler.addDelay(result.flightId, result.delay);
      }

      if (result.action === 'ground-stop') {
        playGameOver();
        return; // No feedback or justification on ground stop
      }

      playDecisionMade();

      // Record decision for feedback system
      if (result.deptInfo) {
        const feedbackAction = result.action === 'ground-fleet' ? 'cancel' : result.action;
        this.feedbackSystem.recordDecision(
          feedbackAction, result.department, result.deptInfo, result.eventTitle, result.flightId
        );
      }

      // Random justification prompt (~30% chance)
      if (Math.random() < 0.3 && (result.action === 'cancel' || result.action === 'continue' || result.action === 'ground-fleet')) {
        const justType = result.action === 'continue' ? 'continue' : 'cancel';
        this.state.update({ phase: 'justification' });
        this.dashboard.justificationModal.show(justType, result.eventTitle, result.flightId);
      }
    };

    // Justification submitted -> resume playing
    this.dashboard.justificationModal.onSubmit = () => {
      this.state.update({ phase: 'playing' });
      this.dashboard.addMessage('system', 'System', 'Justification recorded. Resuming operations.');
    };

    // Day-end sound
    this.state.on('phase', (phase) => {
      if (phase === 'day-end') playDayComplete();
      if (phase === 'game-over') playGameOver();
    });

    // Next day button
    this.dashboard.gameOverScreen.onNextDay = () => {
      this.feedbackSystem.reset();
      this.engine.advanceDay();
      this.dashboard.messageBoard.clear();
    };

    // Pause toggle
    this.dashboard.statusBar.onPauseToggle = () => {
      const phase = this.state.get('phase');
      if (phase === 'playing') {
        this.state.update({ phase: 'paused' });
        this.dashboard.addMessage('system', 'System', 'Operations paused.');
      } else if (phase === 'paused') {
        this.state.update({ phase: 'playing' });
        this.dashboard.addMessage('system', 'System', 'Operations resumed.');
      }
    };

    // Sound + weather effects based on events
    this.state.on('activeEvent', (event) => {
      if (event) playEventAlert();
      if (event && event.department === 'meteorology') {
        const weatherTypes = {
          'met_thunderstorm_destination': 'rain',
          'met_low_visibility_origin': 'fog',
          'met_icing_conditions': 'snow',
          'met_crosswind_limit': 'rain',
          'met_windshear_alert': 'rain',
        };
        const weather = weatherTypes[event.templateId] || 'rain';
        this.dashboard.airportView.setWeather(weather);
        // Clear weather after 15 seconds
        setTimeout(() => this.dashboard.airportView.setWeather(null), 15000);
      }
    });
  }

  startGame() {
    const flights = this.flightScheduler.generateSchedule(1);
    this.state.update({
      phase: 'playing',
      dayNumber: 1,
      dayOfWeek: 'Monday',
      gameTime: 360,
      realTimeElapsed: 0,
      flights,
      otp: 100,
      messages: [],
      activeEvent: null,
      eventsHandledToday: 0,
      totalFlightsOperated: 0,
      totalOnTime: 0,
      totalCancelled: 0,
      cancelledToday: 0,
      groundStop: false,
      consecutiveLowOTPDays: 0,
      speedMultiplier: 1,
    });

    this.feedbackSystem.fullReset();

    this.dashboard.show();
    this.dashboard.addMessage('system', 'System', `Welcome, ${this.state.get('playerName')}. You are the Duty Manager at ${this.state.get('airlineName')}.`);
    this.dashboard.addMessage('system', 'System', `Day 1 operations commencing. ${flights.length} flights scheduled. Maintain OTP above 80%.`);

    this.engine.start();
  }

  restart() {
    this.engine.stop();
    this.clock.reset();
    this.eventSystem.reset();
    this.feedbackSystem.fullReset();
    this.dashboard.reset();
    this.dashboard.airportView.reset();

    // Go back to setup
    this.dashboard.hide();
    document.getElementById('setup-screen').style.display = 'flex';
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window._game = new Game();
});
