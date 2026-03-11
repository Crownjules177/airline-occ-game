export class Sky {
  constructor(ctx) {
    this.ctx = ctx;
    this.stars = [];
    this._generateStars();
  }

  _generateStars() {
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.6,
        size: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }

  render(gameTime, width, height) {
    const ctx = this.ctx;
    const skyHeight = height * 0.55;

    // Determine sky colors based on time of day
    const colors = this._getSkyColors(gameTime);

    const grad = ctx.createLinearGradient(0, 0, 0, skyHeight);
    grad.addColorStop(0, colors.top);
    grad.addColorStop(1, colors.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, skyHeight);

    // Stars (visible at night)
    const nightFactor = this._getNightFactor(gameTime);
    if (nightFactor > 0) {
      for (const star of this.stars) {
        const alpha = nightFactor * (0.4 + 0.6 * Math.sin(performance.now() / 1000 + star.twinkle));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * skyHeight, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sun or moon
    this._renderCelestialBody(gameTime, width, skyHeight);
  }

  _getSkyColors(gameTime) {
    const hour = gameTime / 60;

    if (hour < 6.5) return { top: '#0a0e2a', bottom: '#1a1a3a' }; // pre-dawn
    if (hour < 7.5) return { top: '#1a2050', bottom: '#e8956a' };  // sunrise
    if (hour < 8.5) return { top: '#3a6fb5', bottom: '#87ceeb' };  // early morning
    if (hour < 17) return { top: '#2563a8', bottom: '#7ec8e3' };   // day
    if (hour < 18.5) return { top: '#5a4a8a', bottom: '#e08050' }; // sunset
    if (hour < 20) return { top: '#2a2050', bottom: '#8a5040' };   // dusk
    return { top: '#0a0e2a', bottom: '#151530' };                   // night
  }

  _getNightFactor(gameTime) {
    const hour = gameTime / 60;
    if (hour < 6) return 1;
    if (hour < 7.5) return 1 - (hour - 6) / 1.5;
    if (hour < 19) return 0;
    if (hour < 20.5) return (hour - 19) / 1.5;
    return 1;
  }

  _renderCelestialBody(gameTime, width, skyHeight) {
    const ctx = this.ctx;
    const hour = gameTime / 60;

    if (hour >= 7 && hour <= 19) {
      // Sun
      const progress = (hour - 7) / 12; // 0 to 1 across the day
      const x = width * 0.1 + progress * width * 0.8;
      const y = skyHeight * 0.15 + Math.sin(progress * Math.PI) * (-skyHeight * 0.3);

      // Glow
      const glow = ctx.createRadialGradient(x, y, 5, x, y, 30);
      glow.addColorStop(0, 'rgba(255, 220, 100, 0.6)');
      glow.addColorStop(1, 'rgba(255, 220, 100, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 30, y - 30, 60, 60);

      // Sun disc
      ctx.fillStyle = '#ffd060';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Moon
      const moonX = width * 0.7;
      const moonY = skyHeight * 0.2;
      ctx.fillStyle = 'rgba(220, 220, 240, 0.9)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 10, 0, Math.PI * 2);
      ctx.fill();
      // Crescent shadow
      ctx.fillStyle = this._getSkyColors(gameTime).top;
      ctx.beginPath();
      ctx.arc(moonX + 4, moonY - 1, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
