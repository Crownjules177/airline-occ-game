export class DifficultyScaler {
  constructor(gameState) {
    this.state = gameState;
  }

  getFlightCount() {
    const day = this.state.get('dayNumber');
    return Math.min(20 + (day - 1) * 3, 50);
  }

  getEventInterval() {
    const day = this.state.get('dayNumber');
    // Day 1: 20s, scaling down to 8s
    return Math.max(20 - (day - 1) * 1.5, 8);
  }

  getEventProbability() {
    const day = this.state.get('dayNumber');
    return Math.min(0.6 + (day - 1) * 0.05, 0.9);
  }

  getRiskMultiplier() {
    const day = this.state.get('dayNumber');
    return 1.0 + (day - 1) * 0.08;
  }

  getPreDelayRate() {
    const day = this.state.get('dayNumber');
    return Math.min(0.05 + (day - 1) * 0.03, 0.3);
  }

  getActiveDepartments() {
    const day = this.state.get('dayNumber');
    const all = ['dispatch', 'meteorology', 'maintenance', 'crew', 'airport', 'safety'];
    if (day <= 2) return all.slice(0, 3);
    if (day <= 4) return all.slice(0, 5);
    return all;
  }
}
