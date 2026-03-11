export class AircraftSprite {
  constructor(flightId, type, color) {
    this.flightId = flightId;
    this.type = type;      // 'departure' or 'arrival'
    this.color = color || '#e0e7ef';
    this.x = 0;
    this.y = 0;
    this.scale = 1.0;
    this.rotation = 0;
    this.speed = 0;
    this.phase = 'idle'; // idle | taxi | takeoff-roll | climb | approach | landing | taxi-in | parked
    this.progress = 0;
    this.done = false;

    // Animation parameters
    this.startX = 0;
    this.startY = 0;
    this.targetX = 0;
    this.phaseTime = 0;
  }

  initDeparture(groundY, width) {
    this.type = 'departure';
    this.phase = 'taxi';
    this.x = width * 0.25 + Math.random() * width * 0.15;
    this.y = groundY + 2;
    this.scale = 0.7;
    this.speed = 40;
    this.targetX = width * 0.05;
    this.rotation = 0;
    this.phaseTime = 0;
  }

  initArrival(groundY, width) {
    this.type = 'arrival';
    this.phase = 'approach';
    this.x = width + 50;
    this.y = groundY * 0.3;
    this.scale = 0.3;
    this.speed = 80;
    this.targetX = width * 0.35;
    this.rotation = 0.08;
    this.phaseTime = 0;
  }

  update(deltaMs, groundY, width) {
    const dt = deltaMs / 1000;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'taxi':
        this.x -= this.speed * dt;
        if (this.x <= width * 0.05) {
          this.phase = 'takeoff-roll';
          this.phaseTime = 0;
          this.y = groundY - 2;
        }
        break;

      case 'takeoff-roll':
        this.speed += 120 * dt;
        this.x -= this.speed * dt;
        if (this.phaseTime > 1.2) {
          this.phase = 'climb';
          this.phaseTime = 0;
        }
        break;

      case 'climb':
        this.speed += 30 * dt;
        this.x -= this.speed * dt;
        this.y -= 60 * dt;
        this.rotation = -0.15;
        this.scale *= (1 - 0.3 * dt);
        if (this.x < -100 || this.scale < 0.15) {
          this.done = true;
        }
        break;

      case 'approach':
        this.x -= this.speed * dt;
        this.y += 25 * dt;
        this.scale += 0.4 * dt;
        this.rotation = 0.06;
        if (this.y >= groundY - 4) {
          this.phase = 'landing';
          this.y = groundY - 2;
          this.rotation = 0;
          this.phaseTime = 0;
          this.scale = Math.min(this.scale, 0.7);
        }
        break;

      case 'landing':
        this.speed = Math.max(this.speed - 80 * dt, 30);
        this.x -= this.speed * dt;
        this.rotation = 0;
        if (this.phaseTime > 1.5) {
          this.phase = 'taxi-in';
          this.phaseTime = 0;
          this.speed = 30;
          this.targetX = width * 0.25 + Math.random() * width * 0.15;
        }
        break;

      case 'taxi-in':
        this.x += this.speed * dt;
        this.y = groundY + 2;
        if (this.x >= this.targetX) {
          this.phase = 'parked';
          this.phaseTime = 0;
        }
        break;

      case 'parked':
        if (this.phaseTime > 3) {
          this.done = true;
        }
        break;
    }
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.rotate(this.rotation);

    const onGround = ['taxi', 'takeoff-roll', 'landing', 'taxi-in', 'parked', 'idle'].includes(this.phase);

    // Draw order: gear (behind) -> wings -> engines -> fuselage -> tail -> cockpit
    if (onGround) this._drawLandingGear(ctx);
    this._drawWings(ctx);
    this._drawEngines(ctx);
    this._drawFuselage(ctx);
    this._drawTail(ctx);
    this._drawCockpit(ctx);

    ctx.restore();
  }

  _drawFuselage(ctx) {
    // Tapered fuselage with bezier curves
    ctx.beginPath();
    ctx.moveTo(-32, 0);                          // Nose tip
    ctx.quadraticCurveTo(-26, -5.5, -18, -6);    // Top nose curve
    ctx.lineTo(16, -6);                           // Top fuselage
    ctx.quadraticCurveTo(26, -5, 33, -2);         // Top tail taper
    ctx.lineTo(34, 0);                            // Tail point
    ctx.quadraticCurveTo(26, 5, 16, 6);           // Bottom tail taper
    ctx.lineTo(-18, 6);                           // Bottom fuselage
    ctx.quadraticCurveTo(-26, 5.5, -32, 0);      // Bottom nose curve
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#8a929c';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Airline livery stripe
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(30, 0);
    ctx.stroke();

    // Passenger window dots
    ctx.fillStyle = 'rgba(100, 180, 255, 0.45)';
    for (let i = -16; i <= 14; i += 3) {
      ctx.beginPath();
      ctx.arc(i, -4.2, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom stripe accent
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-20, 3.5);
    ctx.lineTo(20, 3.5);
    ctx.stroke();
  }

  _drawWings(ctx) {
    ctx.fillStyle = '#b8c4d0';
    ctx.strokeStyle = '#8a929c';
    ctx.lineWidth = 0.5;

    // Top wing (swept back)
    ctx.beginPath();
    ctx.moveTo(2, -5);         // Wing root leading edge
    ctx.lineTo(-10, -24);      // Wing tip leading edge (swept)
    ctx.lineTo(-5, -24);       // Wing tip trailing edge
    ctx.lineTo(10, -5);        // Wing root trailing edge
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom wing (mirror)
    ctx.beginPath();
    ctx.moveTo(2, 5);
    ctx.lineTo(-10, 24);
    ctx.lineTo(-5, 24);
    ctx.lineTo(10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Winglets (upturned tips)
    ctx.fillStyle = '#a0aec0';
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(-12, -27);
    ctx.lineTo(-7, -25);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-10, 24);
    ctx.lineTo(-12, 27);
    ctx.lineTo(-7, 25);
    ctx.closePath();
    ctx.fill();

    // Wing flap line
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(5, -5);
    ctx.lineTo(-4, -22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, 5);
    ctx.lineTo(-4, 22);
    ctx.stroke();
  }

  _drawEngines(ctx) {
    const positions = [[-4, -15], [-4, 15]];
    for (const [ex, ey] of positions) {
      // Engine pylon (connects to wing)
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex + 2, ey > 0 ? ey - 3 : ey + 3);
      ctx.lineTo(ex + 2, ey > 0 ? 5 : -5);
      ctx.stroke();

      // Nacelle body
      ctx.fillStyle = '#5a6370';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Nacelle highlight (top)
      ctx.fillStyle = '#6b7a88';
      ctx.beginPath();
      ctx.ellipse(ex, ey - 0.8, 5, 1.5, 0, Math.PI, 0);
      ctx.fill();

      // Intake face (dark circle)
      ctx.fillStyle = '#2d3748';
      ctx.beginPath();
      ctx.ellipse(ex - 5, ey, 2.8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Intake rim highlight
      ctx.strokeStyle = '#8a929c';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(ex - 5, ey, 3, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Exhaust (subtle glow)
      ctx.fillStyle = 'rgba(120, 140, 160, 0.3)';
      ctx.beginPath();
      ctx.ellipse(ex + 5.5, ey, 1.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawTail(ctx) {
    // Vertical stabilizer with airline color
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(24, -4);
    ctx.lineTo(20, -18);
    ctx.quadraticCurveTo(23, -19, 28, -17);
    ctx.lineTo(34, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // White accent on tail
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(24, -8);
    ctx.lineTo(22, -15);
    ctx.lineTo(26, -16);
    ctx.lineTo(27, -8);
    ctx.closePath();
    ctx.fill();

    // Horizontal stabilizers
    ctx.fillStyle = '#a8b4c0';
    ctx.strokeStyle = '#8a929c';
    ctx.lineWidth = 0.4;

    // Top stabilizer
    ctx.beginPath();
    ctx.moveTo(27, -3);
    ctx.lineTo(22, -11);
    ctx.lineTo(30, -11);
    ctx.lineTo(32, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom stabilizer
    ctx.beginPath();
    ctx.moveTo(27, 3);
    ctx.lineTo(22, 11);
    ctx.lineTo(30, 11);
    ctx.lineTo(32, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawCockpit(ctx) {
    // Multi-panel windshield
    ctx.fillStyle = 'rgba(60, 150, 230, 0.7)';

    // Upper windshield panel
    ctx.beginPath();
    ctx.moveTo(-30, -3);
    ctx.lineTo(-24, -5.2);
    ctx.lineTo(-19, -5.2);
    ctx.lineTo(-22, -2);
    ctx.closePath();
    ctx.fill();

    // Lower windshield panel
    ctx.beginPath();
    ctx.moveTo(-30, 3);
    ctx.lineTo(-24, 5.2);
    ctx.lineTo(-19, 5.2);
    ctx.lineTo(-22, 2);
    ctx.closePath();
    ctx.fill();

    // Center divider
    ctx.strokeStyle = '#6b7a88';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-19, 0);
    ctx.stroke();

    // Windshield frame lines
    ctx.strokeStyle = 'rgba(100, 120, 140, 0.5)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-26, -4.8);
    ctx.lineTo(-24, -1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26, 4.8);
    ctx.lineTo(-24, 1.5);
    ctx.stroke();

    // Nose radome tip highlight
    ctx.fillStyle = 'rgba(200, 210, 220, 0.4)';
    ctx.beginPath();
    ctx.arc(-31, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawLandingGear(ctx) {
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 1.2;
    ctx.fillStyle = '#2d3748';

    // Nose gear strut
    ctx.beginPath();
    ctx.moveTo(-18, 6);
    ctx.lineTo(-18, 14);
    ctx.stroke();
    // Nose wheel
    ctx.beginPath();
    ctx.arc(-18, 14, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 0.4;
    ctx.stroke();

    // Main gear - left strut
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(3, 6);
    ctx.lineTo(3, 15);
    ctx.stroke();
    // Left bogie (dual wheels)
    ctx.fillStyle = '#2d3748';
    ctx.beginPath();
    ctx.arc(1.5, 15, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4.5, 15, 2, 0, Math.PI * 2);
    ctx.fill();

    // Main gear - right strut
    ctx.beginPath();
    ctx.moveTo(8, 6);
    ctx.lineTo(8, 15);
    ctx.stroke();
    // Right bogie (dual wheels)
    ctx.beginPath();
    ctx.arc(6.5, 15, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9.5, 15, 2, 0, Math.PI * 2);
    ctx.fill();

    // Wheel highlights
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 0.3;
    for (const wx of [1.5, 4.5, 6.5, 9.5]) {
      ctx.beginPath();
      ctx.arc(wx, 15, 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
