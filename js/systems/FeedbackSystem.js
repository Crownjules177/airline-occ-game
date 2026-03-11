const FEEDBACK_TEMPLATES = {
  cancel: {
    positive: [
      '"{manager}" from {department}: "Good call cancelling {flightId}. Safety always comes first with {eventTitle}."',
      '{department} team appreciates your cautious approach to the {eventTitle} situation.',
      '"{manager}": "Cancelling was the right move. We\'ve seen {eventTitle} lead to worse outcomes before."',
    ],
    negative: [
      '"{manager}" from {department}: "Was cancelling {flightId} really necessary? We could have worked around {eventTitle}."',
      'The {department} crew is frustrated about the {flightId} cancellation. They feel it was excessive.',
      '"{manager}": "That cancellation cost us. {eventTitle} wasn\'t as bad as you made it seem."',
      'Rumblings from {department} \u2014 some feel you overreacted to {eventTitle} by grounding {flightId}.',
    ],
  },
  continue: {
    positive: [
      '"{manager}" from {department}: "Keeping {flightId} flying was the right call. Network performance matters."',
      '{department} team commends your decisive leadership on the {eventTitle} situation.',
      '"{manager}": "Good judgement continuing {flightId}. The risk was manageable."',
    ],
    negative: [
      '"{manager}" from {department} is displeased with how you handled {eventTitle} on {flightId}.',
      'Some in {department} feel you took unnecessary risks continuing {flightId} during {eventTitle}.',
      '"{manager}": "We got lucky with {flightId}. Next time {eventTitle} happens, think twice about pressing on."',
      'Quiet concerns from {department} about your risk tolerance during the {eventTitle} incident.',
    ],
  },
};

export class FeedbackSystem {
  constructor(gameState) {
    this.state = gameState;
    this.decisionHistory = [];
    this.timeSinceLastFeedback = 0;
    this.feedbackInterval = 25; // seconds between possible feedback
    this.onFeedback = null; // callback: (type, source, text) => void
  }

  recordDecision(decision, department, deptInfo, eventTitle, flightId) {
    this.decisionHistory.push({ decision, department, deptInfo, eventTitle, flightId });
  }

  update(deltaSeconds) {
    if (this.decisionHistory.length === 0) return;

    this.timeSinceLastFeedback += deltaSeconds;
    if (this.timeSinceLastFeedback < this.feedbackInterval) return;
    this.timeSinceLastFeedback = 0;

    if (Math.random() > 0.4) return; // 40% chance each interval

    const entry = this.decisionHistory[Math.floor(Math.random() * this.decisionHistory.length)];
    const sentiment = Math.random() < 0.5 ? 'positive' : 'negative';
    const templates = FEEDBACK_TEMPLATES[entry.decision]?.[sentiment];
    if (!templates || templates.length === 0) return;

    const template = templates[Math.floor(Math.random() * templates.length)];
    const text = template
      .replace(/\{manager\}/g, entry.deptInfo.manager)
      .replace(/\{department\}/g, entry.deptInfo.name)
      .replace(/\{eventTitle\}/g, entry.eventTitle)
      .replace(/\{flightId\}/g, entry.flightId);

    this.onFeedback?.(entry.department, entry.deptInfo.name, text);
  }

  reset() {
    this.timeSinceLastFeedback = 0;
    // Keep history across days for continuity
  }

  fullReset() {
    this.decisionHistory = [];
    this.timeSinceLastFeedback = 0;
  }
}
