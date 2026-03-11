export class OTPCalculator {
  constructor(gameState) {
    this.state = gameState;
  }

  update() {
    const flights = this.state.get('flights');
    if (!flights || flights.length === 0) return;

    // Count flights that have departed or been cancelled
    let completed = 0;
    let onTime = 0;

    for (const flight of flights) {
      if (flight.cancelled) {
        completed++;
        // Cancelled flights count as NOT on-time
        continue;
      }
      if (flight.actualDeparture !== null) {
        completed++;
        // On-time = departed within 15 minutes of scheduled
        const delay = flight.actualDeparture - flight.scheduledDeparture;
        if (delay <= 15) {
          onTime++;
        }
      }
    }

    // For flights not yet departed and not cancelled, assume on-time
    // This makes OTP reflect current state and future risk
    const notDeparted = flights.filter(f => !f.cancelled && f.actualDeparture === null);
    const delayedNotDeparted = notDeparted.filter(f => f.delayMinutes > 15);
    const onTimeNotDeparted = notDeparted.length - delayedNotDeparted.length;

    const totalConsidered = completed + notDeparted.length;
    const totalOnTime = onTime + onTimeNotDeparted;

    const otp = totalConsidered > 0 ? (totalOnTime / totalConsidered) * 100 : 100;

    const prevOtp = this.state.get('otp');
    if (Math.abs(otp - prevOtp) > 0.1) {
      this.state.update({ otp: Math.round(otp * 10) / 10 });
    }
  }
}
