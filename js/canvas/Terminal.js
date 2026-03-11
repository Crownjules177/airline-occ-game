export class Terminal {
  constructor(ctx) {
    this.ctx = ctx;
  }

  render(width, height, gameTime) {
    const ctx = this.ctx;
    const groundY = height * 0.6;
    const hour = gameTime / 60;
    const isNight = hour < 7 || hour > 19;

    // Ground
    ctx.fillStyle = '#2a3a2a';
    ctx.fillRect(0, groundY, width, height - groundY);

    // Tarmac
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, groundY + 2, width, height * 0.15);

    // Runway markings
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 15]);
    const runwayY = groundY + height * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, runwayY);
    ctx.lineTo(width, runwayY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Runway threshold markings
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(30, runwayY - 8 + i * 4);
      ctx.lineTo(50, runwayY - 8 + i * 4);
      ctx.stroke();
    }

    // Terminal building
    const termX = width * 0.15;
    const termW = width * 0.45;
    const termH = height * 0.22;
    const termY = groundY - termH;

    // Building body
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(termX, termY, termW, termH);

    // Roof
    ctx.fillStyle = '#374151';
    ctx.fillRect(termX - 5, termY - 6, termW + 10, 8);

    // Windows (glass facade)
    const windowColor = isNight ? 'rgba(255, 200, 80, 0.6)' : 'rgba(135, 206, 235, 0.4)';
    const numWindows = 18;
    const winW = (termW - 20) / numWindows - 3;
    for (let i = 0; i < numWindows; i++) {
      ctx.fillStyle = windowColor;
      const wx = termX + 10 + i * (winW + 3);
      ctx.fillRect(wx, termY + 10, winW, termH - 20);

      // Window frame
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(wx, termY + 10, winW, termH - 20);
    }

    // Jet bridges (3 of them)
    ctx.fillStyle = '#5a6577';
    for (let i = 0; i < 3; i++) {
      const bx = termX + 40 + i * (termW / 3.5);
      const by = groundY;
      ctx.fillRect(bx, by - 3, 35, 6);
      // Bridge connector
      ctx.fillRect(bx + 30, by - 6, 8, 12);
    }

    // Control tower (right side)
    const towerX = width * 0.68;
    const towerW = 20;
    const towerH = height * 0.35;
    const towerY = groundY - towerH;

    // Tower shaft
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(towerX, towerY + towerH * 0.3, towerW, towerH * 0.7);

    // Tower cab (top)
    ctx.fillStyle = '#374151';
    const cabH = towerH * 0.2;
    const cabW = towerW + 16;
    ctx.fillRect(towerX - 8, towerY + towerH * 0.1, cabW, cabH);

    // Tower cab windows
    ctx.fillStyle = isNight ? 'rgba(100, 200, 100, 0.7)' : 'rgba(135, 206, 235, 0.5)';
    ctx.fillRect(towerX - 6, towerY + towerH * 0.13, cabW - 4, cabH * 0.6);

    // Tower roof
    ctx.fillStyle = '#2d3748';
    ctx.beginPath();
    ctx.moveTo(towerX - 10, towerY + towerH * 0.1);
    ctx.lineTo(towerX + towerW / 2, towerY);
    ctx.lineTo(towerX + towerW + 10, towerY + towerH * 0.1);
    ctx.closePath();
    ctx.fill();

    // Grass areas
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, groundY + height * 0.15 + 2, width, height - groundY - height * 0.15);

    // Taxiway markings (yellow)
    ctx.strokeStyle = '#d4a843';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, groundY + height * 0.03);
    ctx.lineTo(width, groundY + height * 0.03);
    ctx.stroke();
    ctx.setLineDash([]);

    // Runway numbers
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('27L', 8, runwayY + 4);
    ctx.fillText('09R', width - 30, runwayY + 4);
  }
}
