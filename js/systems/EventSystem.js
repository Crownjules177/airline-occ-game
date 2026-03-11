import { EVENT_TEMPLATES } from '../data/events.js';
import { DEPARTMENT_INFO } from '../data/names.js';

export class EventSystem {
  constructor(gameState, difficultyScaler) {
    this.state = gameState;
    this.difficulty = difficultyScaler;
    this.timeSinceLastEvent = 0;
    this.eventsThisDay = 0;
    this.usedTemplates = new Set();
    this.decisionTimer = null;
    this.decisionCountdown = 15;
    this.onMessage = null; // callback for message board
  }

  reset() {
    this.timeSinceLastEvent = 0;
    this.eventsThisDay = 0;
    this.usedTemplates.clear();
  }

  update(deltaSeconds) {
    if (this.state.get('activeEvent')) return;

    this.timeSinceLastEvent += deltaSeconds;
    const interval = this.difficulty.getEventInterval();

    if (this.timeSinceLastEvent < interval) return;

    this.timeSinceLastEvent = 0;

    // First event is guaranteed after the first interval
    const isFirstEvent = this.eventsThisDay === 0;
    const roll = Math.random();
    const prob = this.difficulty.getEventProbability();

    if (isFirstEvent || roll < prob) {
      this._triggerEvent();
    }
  }

  _triggerEvent() {
    const activeDepts = this.difficulty.getActiveDepartments();
    const dept = activeDepts[Math.floor(Math.random() * activeDepts.length)];

    const available = EVENT_TEMPLATES.filter(
      e => e.department === dept && !this.usedTemplates.has(e.id)
    );

    if (available.length === 0) {
      EVENT_TEMPLATES.filter(e => e.department === dept).forEach(e => this.usedTemplates.delete(e.id));
      return;
    }

    const template = available[Math.floor(Math.random() * available.length)];
    const flight = this._pickAffectedFlight();
    if (!flight) return;

    this.usedTemplates.add(template.id);

    const deptInfo = DEPARTMENT_INFO[dept];
    const adjustedRisk = Math.min(template.baseRisk * this.difficulty.getRiskMultiplier(), 0.75);

    // Fill in placeholders
    const description = template.description
      .replace(/\{flight\}/g, flight.id)
      .replace(/\{origin\}/g, flight.origin.code)
      .replace(/\{destination\}/g, flight.destination.code)
      .replace(/\{aircraft\}/g, flight.aircraft.name)
      .replace(/\{alternate\}/g, 'ALT');

    const event = {
      templateId: template.id,
      department: dept,
      deptInfo,
      title: template.title,
      description,
      baseRisk: template.baseRisk,
      adjustedRisk,
      severity: template.severity,
      delayIfContinue: template.delayIfContinue,
      affectedFlightId: flight.id,
      affectedFlight: flight,
      riskLabel: this._getRiskLabel(adjustedRisk),
      riskClass: this._getRiskClass(adjustedRisk),
      systemicRisk: template.systemicRisk || false,
    };

    this.state.update({
      phase: 'event-decision',
      activeEvent: event,
    });

    if (this.onMessage) {
      this.onMessage(dept, deptInfo.manager, `ALERT: ${template.title} affecting ${flight.id} (${flight.origin.code}\u2192${flight.destination.code})`);
    }

    this.eventsThisDay++;
  }

  _pickAffectedFlight() {
    const flights = this.state.get('flights');
    const eligible = flights.filter(
      f => !f.cancelled && f.actualDeparture === null &&
           (f.status === 'scheduled' || f.status === 'delayed' || f.status === 'boarding')
    );
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  resolveDecision(decision) {
    const event = this.state.get('activeEvent');
    if (!event) return;

    const handled = this.state.get('eventsHandledToday') + 1;

    if (decision === 'cancel') {
      if (this.onMessage) {
        this.onMessage('decision', 'You', `CANCELLED flight ${event.affectedFlightId} \u2014 ${event.title}`);
      }
      this.state.update({
        phase: 'playing',
        activeEvent: null,
        eventsHandledToday: handled,
      });
      return { action: 'cancel', flightId: event.affectedFlightId, eventTitle: event.title, department: event.department, deptInfo: event.deptInfo };

    } else if (decision === 'ground-fleet') {
      // Fleet-wide grounding
      const aircraftType = event.affectedFlight.aircraft.type;
      if (this.onMessage) {
        this.onMessage('decision', 'You', `FLEET GROUNDING: All ${event.affectedFlight.aircraft.name} aircraft grounded \u2014 ${event.title}`);
      }
      this.state.update({
        phase: 'playing',
        activeEvent: null,
        eventsHandledToday: handled,
      });
      return { action: 'ground-fleet', flightId: event.affectedFlightId, aircraftType, aircraftName: event.affectedFlight.aircraft.name, eventTitle: event.title, department: event.department, deptInfo: event.deptInfo };

    } else {
      // Continue - roll the dice
      const roll = Math.random();
      if (roll < event.adjustedRisk) {
        // GROUND STOP
        if (this.onMessage) {
          this.onMessage('decision', 'System', `SAFETY GROUND STOP! ${event.title} on flight ${event.affectedFlightId} resulted in a safety incident.`);
        }
        this.state.update({
          phase: 'game-over',
          activeEvent: null,
          groundStop: true,
          gameOverReason: 'safety',
          gameOverDetail: `${event.title} \u2014 Flight ${event.affectedFlightId}`,
          eventsHandledToday: handled,
        });
        return { action: 'ground-stop' };
      } else {
        if (this.onMessage) {
          const delayMsg = event.delayIfContinue > 0
            ? ` (+${event.delayIfContinue} min delay)`
            : ' (no additional delay)';
          this.onMessage('decision', 'You', `CONTINUED flight ${event.affectedFlightId}${delayMsg} \u2014 ${event.title}`);
        }
        this.state.update({
          phase: 'playing',
          activeEvent: null,
          eventsHandledToday: handled,
        });
        return { action: 'continue', flightId: event.affectedFlightId, delay: event.delayIfContinue, eventTitle: event.title, department: event.department, deptInfo: event.deptInfo };
      }
    }
  }

  _getRiskLabel(risk) {
    if (risk < 0.10) return 'LOW RISK';
    if (risk < 0.25) return 'MODERATE RISK';
    if (risk < 0.40) return 'HIGH RISK';
    if (risk < 0.60) return 'VERY HIGH RISK';
    return 'CRITICAL RISK';
  }

  _getRiskClass(risk) {
    if (risk < 0.10) return 'low';
    if (risk < 0.25) return 'moderate';
    if (risk < 0.40) return 'high';
    if (risk < 0.60) return 'very-high';
    return 'critical';
  }
}
