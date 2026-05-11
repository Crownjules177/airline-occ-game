// Circles of Awakening — atmospheric canvas animation
// Inspired by Vipassana: selves as circles, flares of emotion radiating outward,
// some circles dissolving into pure awareness.

(function() {
  const PALETTE = [
    { r: 196, g: 93,  b: 62  },  // terracotta
    { r: 193, g: 154, b: 107 },  // ochre
    { r: 160, g: 92,  b: 58  },  // clay
    { r: 107, g: 122, b: 79  },  // moss
    { r: 212, g: 165, b: 116 },  // sand
    { r: 138, g: 95,  b: 74  },  // umber
    { r: 90,  g: 75,  b: 65  },  // bark
  ];

  function rgba(c, a) {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  class Circle {
    constructor(canvas) {
      this.canvas = canvas;
      this.reset(true);
    }

    reset(initial = false) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.radius = 25 + Math.random() * 90;
      this.baseRadius = this.radius;
      // Outline thickness — emotional weight
      this.lineWidth = 0.4 + Math.random() * 2.2;
      // Opacity — how solid the self is
      this.alpha = 0.14 + Math.random() * 0.34;
      this.baseAlpha = this.alpha;
      this.color = pick(PALETTE);
      // Drift velocity — slow ambient movement
      this.vx = (Math.random() - 0.5) * 0.12;
      this.vy = (Math.random() - 0.5) * 0.12;
      // Pulse phase — some circles are entering "quiet emptiness"
      this.pulsePhase = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.003 + Math.random() * 0.008;
      // Awakening factor — 0 = solid self, 1 = dissolving
      this.awakening = Math.random() < 0.25 ? Math.random() * 0.6 : 0;
      // Flare timer — when this circle emits a solar flare
      this.nextFlare = Math.random() * 5000 + 2000;
      // Hollow core ratio
      this.coreRatio = 0.06 + Math.random() * 0.08;
      if (initial) {
        // Stagger initial state
        this.pulsePhase = Math.random() * Math.PI * 2;
      }
    }

    update(dt, flares) {
      // Drift
      this.x += this.vx;
      this.y += this.vy;

      // Wrap softly around edges
      const margin = 200;
      if (this.x < -margin) this.x = this.canvas.width + margin;
      if (this.x > this.canvas.width + margin) this.x = -margin;
      if (this.y < -margin) this.y = this.canvas.height + margin;
      if (this.y > this.canvas.height + margin) this.y = -margin;

      // Pulse — selves entering and leaving quiet emptiness
      this.pulsePhase += this.pulseSpeed;
      const pulse = Math.sin(this.pulsePhase);
      // Awakened circles pulse more — appearing and disappearing
      const pulseAmount = 0.3 + this.awakening * 0.7;
      this.alpha = this.baseAlpha * (1 - pulseAmount * 0.5 + pulse * pulseAmount * 0.5);
      this.radius = this.baseRadius * (1 + this.awakening * pulse * 0.05);

      // Awakened circles slowly dissolve further over time
      if (this.awakening > 0 && Math.random() < 0.0001) {
        this.awakening = Math.min(1, this.awakening + 0.02);
      }

      // Flare emission
      this.nextFlare -= dt;
      if (this.nextFlare <= 0) {
        flares.push(new Flare(this.x, this.y, this.color));
        this.nextFlare = 4000 + Math.random() * 8000;
      }
    }

    draw(ctx) {
      const blur = this.awakening * 8;
      ctx.save();

      if (blur > 0) {
        ctx.shadowColor = rgba(this.color, this.alpha * 0.6);
        ctx.shadowBlur = blur;
      }

      // The outline — the story of the self
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(this.color, this.alpha * (1 - this.awakening * 0.6));
      ctx.lineWidth = this.lineWidth * (1 - this.awakening * 0.5);
      ctx.stroke();

      // The hollow core — what remains when illusion fades
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * this.coreRatio, 0, Math.PI * 2);
      ctx.fillStyle = rgba(this.color, this.alpha * 1.4);
      ctx.fill();

      ctx.restore();
    }
  }

  class Flare {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.radius = 0;
      this.maxRadius = 200 + Math.random() * 300;
      this.speed = 0.4 + Math.random() * 0.5;
      this.life = 1.0;
    }

    update(dt) {
      this.radius += this.speed * (dt / 16);
      // Decay based on how far it has traveled
      this.life = Math.max(0, 1 - this.radius / this.maxRadius);
    }

    draw(ctx) {
      if (this.life <= 0) return;
      const alpha = this.life * 0.25;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(this.color, alpha);
      ctx.lineWidth = 1 + (1 - this.life) * 2;
      ctx.stroke();
    }

    isDead() {
      return this.life <= 0;
    }
  }

  class CirclesScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.circles = [];
      this.flares = [];
      this.lastTime = 0;
      this.dpr = window.devicePixelRatio || 1;
      this.resize();
      this.populate();
      window.addEventListener('resize', () => this.resize());
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * this.dpr;
      this.canvas.height = rect.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.canvas.width = rect.width * this.dpr;
      this.canvas.height = rect.height * this.dpr;
      // Reset transform after width set (canvas resets when sized)
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    populate() {
      // Density based on canvas area
      const rect = this.canvas.getBoundingClientRect();
      const area = rect.width * rect.height;
      const count = Math.min(28, Math.max(10, Math.floor(area / 22000)));
      for (let i = 0; i < count; i++) {
        const c = new Circle({ width: rect.width, height: rect.height });
        this.circles.push(c);
      }
    }

    loop(time) {
      const dt = Math.min(50, time - this.lastTime || 16);
      this.lastTime = time;

      const rect = this.canvas.getBoundingClientRect();
      // Update internal canvas reference dimensions for each circle
      const dims = { width: rect.width, height: rect.height };
      this.circles.forEach(c => { c.canvas = dims; });

      this.ctx.clearRect(0, 0, rect.width, rect.height);

      // Update + draw flares (behind circles)
      this.flares.forEach(f => f.update(dt));
      this.flares = this.flares.filter(f => !f.isDead());
      this.flares.forEach(f => f.draw(this.ctx));

      // Update + draw circles
      this.circles.forEach(c => {
        c.update(dt, this.flares);
        c.draw(this.ctx);
      });

      requestAnimationFrame(this.loop);
    }
  }

  function init() {
    const canvases = document.querySelectorAll('canvas.circles-canvas');
    canvases.forEach(canvas => new CirclesScene(canvas));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
