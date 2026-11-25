"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type CircleHousehold = {
  id: string;
  name: string;
  isMe: boolean;
  joined: boolean;
  hue: number;
  members: string[];
  size: number;
  summary: string | null;
  highlights: { label: string; values: string[] }[];
};
export type CircleThread = { a: string; b: string; shared: { value: string; a: string; b: string }[] };
export type CircleData = {
  households: CircleHousehold[];
  threads: CircleThread[];
  unit: { singular: string; plural: string };
  individual: boolean;
  membersField: string | null;
};

// Watercolour palette taken from the paintings: teal, ochre, coral, then a few neighbours.
const PALETTE = ["#2f8f9d", "#e3a21a", "#e46a4e", "#6f9a4f", "#8a6bb0", "#3d78c2", "#c9577e", "#b5882e", "#4aa38a", "#d4813a"];
const colour = (hue: number) => PALETTE[hue % PALETTE.length];
const OCHRE = "#e8c24a";
const UMBER = "#a77b35";

const VB = 1000;
const C = VB / 2;
const R = 388; // the group's ring
const FOCUS_SCALE = 1.3;
/** The others step back a little while one circle is in focus. */
const REST_SCALE = 0.82;
/** A circle in focus grows to at least this radius, so its names fit even in a big group. */
const FOCUS_MIN_R = 92;
const focusScale = (r: number) => Math.max(FOCUS_SCALE, FOCUS_MIN_R / r);
/** Most threads drawn from one circle at once; past this the strongest win. */
const MAX_THREADS = 12;
/** Linked circles get a "· shared thing" label only while there are few enough to read. */
const MAX_LINK_LABELS = 8;
const GRADIENT_COLOURS = [...PALETTE, OCHRE];

/** A flare: a soft jet pointing along +x from its base, scaled by CSS so it licks out and falls back. */
function flarePath(len: number, w: number, bend: number) {
  const tipY = bend * len;
  return `M0 ${(-w / 2).toFixed(1)} Q${(len * 0.55).toFixed(1)} ${(-w * 0.3 + tipY * 0.5).toFixed(1)} ${len.toFixed(1)} ${tipY.toFixed(1)} Q${(len * 0.55).toFixed(1)} ${(w * 0.3 + tipY * 0.5).toFixed(1)} 0 ${(w / 2).toFixed(1)}Z`;
}

// ---- Paintings ---------------------------------------------------------------------------------
// The watercolour filters are slow to run, and the paintings never change, so each one is drawn
// once into a self-contained SVG image. Moving an image is cheap; re-filtering every frame is not.
const PAINT_FILTERS =
  '<filter id="e" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>' +
  '<filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.1"/></filter>';

function painting(x: number, y: number, size: number, body: string, defs = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${size} ${size}" width="${size}" height="${size}"><defs>${PAINT_FILTERS}${defs}</defs>${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** How far a painting reaches past the group's viewBox (the ring's strokes run outside it). */
const RING_BLEED = 70;

type Flare = { x: number; y: number; deg: number; d: string; c: string; dur: number; delay: number; o: number };

function makeFlare(rand: () => number, r: number, ang: number, len: number, w: number, c: string, cx = 0, cy = 0): Flare {
  const [x, y] = polar(r, ang, cx, cy);
  const dur = 4 + rand() * 7;
  return { x, y, deg: (ang * 180) / Math.PI, d: flarePath(len, w, (rand() - 0.5) * 0.25), c, dur, delay: -rand() * dur, o: 0.35 + rand() * 0.35 };
}

const timing = (dur: number, delay: number, o: number) =>
  ({ "--d": `${dur.toFixed(2)}s`, "--delay": `${delay.toFixed(2)}s`, "--o": o.toFixed(2) }) as React.CSSProperties;

function Flares({ flares, uid }: { flares: Flare[]; uid: string }) {
  return (
    <>
      {flares.map((f, i) => (
        <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.deg.toFixed(1)})`}>
          <path className="flare" d={f.d} fill={`url(#${uid}-fl-${GRADIENT_COLOURS.indexOf(f.c)})`} style={timing(f.dur, f.delay, f.o)} />
        </g>
      ))}
    </>
  );
}

/** Small seeded random generator, so the painting is the same on the server and every render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const polar = (r: number, a: number, cx = 0, cy = 0) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;

/** A tapered brush stroke radiating out from radius r0 at angle a. */
function spike(r0: number, a: number, len: number, width: number, bend: number, cx = 0, cy = 0) {
  const half = width / 2 / r0;
  const [x1, y1] = polar(r0, a - half, cx, cy);
  const [x2, y2] = polar(r0, a + half, cx, cy);
  const [tx, ty] = polar(r0 + len, a + bend, cx, cy);
  const [mx, my] = polar(r0 + len * 0.55, a + bend * 0.4, cx, cy);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}Z`;
}

function arc(r: number, a0: number, a1: number) {
  const [x0, y0] = polar(r, a0, C, C);
  const [x1, y1] = polar(r, a1, C, C);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Bubble radius from how many people are in it, scaled so everyone fits in the ring. */
function radii(hs: CircleHousehold[]) {
  const raw = hs.map((h) => Math.min(118, Math.max(70, 52 + 19 * Math.sqrt(h.size))));
  const area = raw.reduce((s, r) => s + r * r, 0);
  const k = Math.min(1, Math.sqrt((0.36 * R * R) / Math.max(area, 1)));
  return raw.map((r) => r * k);
}

/** Where each person's dot sits inside a bubble of radius r. */
function memberLayout(n: number, r: number) {
  if (n <= 1) return [{ x: 0, y: 0, r: r * 0.4 }];
  if (n === 2) return [{ x: -r * 0.3, y: r * 0.04, r: r * 0.3 }, { x: r * 0.34, y: -r * 0.06, r: r * 0.24 }];
  const inner = n > 7 ? Math.ceil(n / 3) : 0;
  const out: { x: number; y: number; r: number }[] = [];
  const ring = (count: number, rr: number, offset: number) => {
    const dotR = Math.min(r * 0.22, rr * Math.sin(Math.PI / count) * 0.8);
    for (let i = 0; i < count; i++) {
      const [x, y] = polar(rr, offset + (i / count) * Math.PI * 2);
      out.push({ x, y, r: dotR * (i % 3 === 0 ? 1 : 0.86) });
    }
  };
  if (inner) ring(inner, r * 0.24, 0.3);
  ring(n - inner, inner ? r * 0.62 : r * 0.45, -Math.PI / 2);
  return out;
}

type Body = { x: number; y: number; vx: number; vy: number; r: number };

export function CircleView({ data, profileHref }: { data: CircleData; profileHref: string }) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRefs = useRef(new Map<string, SVGGElement>());
  const threadRefs = useRef(new Map<string, SVGPathElement>());
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = selected ?? hovered;
  const focusRef = useRef<string | null>(null);
  focusRef.current = focus;

  const hs = data.households;
  const rs = useMemo(() => radii(hs), [hs]);

  // Starting layout: evenly round a ring inside the circle (a single household sits in the middle).
  const bodies = useRef<Body[]>([]);
  if (bodies.current.length !== hs.length) {
    const rand = rng(hs.length * 97 + 11);
    bodies.current = hs.map((_, i) => {
      if (hs.length === 1) return { x: C, y: C, vx: 0, vy: 0, r: rs[i] };
      const a = (i / hs.length) * Math.PI * 2 - Math.PI / 2 + (rand() - 0.5) * 0.3;
      const [x, y] = polar(R * (0.46 + rand() * 0.1), a, C, C);
      return { x, y, vx: 0, vy: 0, r: rs[i] };
    });
  }

  // ---- The painted ring: each household's colour round the circle, sized by how many they are.
  const ring = useMemo(() => {
    const rand = rng(20261125);
    const joined = hs.filter((h) => h.joined);
    const parts = (joined.length ? joined : hs).map((h) => ({ c: colour(h.hue), w: h.size }));
    const total = parts.reduce((s, p) => s + p.w, 0) || 1;
    let a = -Math.PI / 2;
    const segments = parts.map((p) => {
      const a0 = a;
      a += (p.w / total) * Math.PI * 2;
      return { c: p.c, a0, a1: a };
    });
    const at = (ang: number) => {
      const t = (((ang + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let acc = 0;
      for (const p of parts) {
        acc += (p.w / total) * Math.PI * 2;
        if (t <= acc) return p.c;
      }
      return parts[parts.length - 1]?.c ?? OCHRE;
    };
    const spikes = Array.from({ length: 170 }, (_, i) => {
      const ang = (i / 170) * Math.PI * 2 + (rand() - 0.5) * 0.04;
      const len = 14 + rand() * rand() * 115;
      return {
        d: spike(R - 2 - rand() * 6, ang, len, 4 + rand() * 12, (rand() - 0.5) * 0.05, C, C),
        c: rand() < 0.18 ? OCHRE : at(ang),
        o: 0.2 + rand() * 0.35,
      };
    });
    // Solar flares: jets that lick out from the ring and fall back, and a few prominences, loops that
    // rise off the surface and dissolve. A separate, unfiltered layer, so animating it stays cheap.
    const flares = Array.from({ length: 30 }, (_, i) => {
      const ang = (i / 30) * Math.PI * 2 + (rand() - 0.5) * 0.18;
      return makeFlare(rand, R - 3, ang, 40 + rand() * rand() * 120, 6 + rand() * 12, rand() < 0.2 ? OCHRE : at(ang), C, C);
    });
    const prominences = Array.from({ length: 4 }, (_, i) => {
      const ang = (i / 4) * Math.PI * 2 + rand() * 1.2;
      const span = 18 + rand() * 26;
      const h = 45 + rand() * 60;
      const dur = 9 + rand() * 8;
      return {
        deg: (ang * 180) / Math.PI,
        d: `M${R - 2} ${(-span).toFixed(1)} C${(R + h).toFixed(1)} ${(-span * 1.5).toFixed(1)} ${(R + h).toFixed(1)} ${(span * 1.5).toFixed(1)} ${R - 2} ${span.toFixed(1)}`,
        c: at(ang),
        w: 2.5 + rand() * 3,
        dur,
        delay: -rand() * dur,
        o: 0.35 + rand() * 0.25,
      };
    });
    const segs = segments.length ? segments : [{ c: OCHRE, a0: 0, a1: Math.PI * 2 - 0.001 }];
    const uri = painting(
      -RING_BLEED,
      -RING_BLEED,
      VB + 2 * RING_BLEED,
      `<circle cx="${C}" cy="${C}" r="${R - 8}" fill="url(#w)"/>` +
        `<g filter="url(#b)">${spikes.map((s) => `<path d="${s.d}" fill="${s.c}" opacity="${s.o.toFixed(2)}"/>`).join("")}</g>` +
        `<g filter="url(#e)" fill="none" stroke-linecap="round">${segs
          .map((s) => `<path d="${arc(R, s.a0, s.a1)}" stroke="${s.c}" stroke-width="9" opacity="0.7"/>`)
          .join("")}<circle cx="${C}" cy="${C}" r="${R - 6}" stroke="${UMBER}" stroke-width="2.5" opacity="0.45"/></g>`,
      `<radialGradient id="w"><stop offset="70%" stop-color="${OCHRE}" stop-opacity="0"/><stop offset="96%" stop-color="${OCHRE}" stop-opacity="0.16"/><stop offset="100%" stop-color="${OCHRE}" stop-opacity="0"/></radialGradient>`,
    );
    return { uri, flares, prominences };
  }, [hs]);

  // ---- Each household's own little painting: halo, ring, wash and a dot per person.
  const art = useMemo(
    () =>
      hs.map((h, i) => {
        const rand = rng(1000 + i * 31);
        const r = rs[i];
        const c = colour(h.hue);
        const dots = memberLayout(h.size, r);
        const halo = Array.from({ length: 30 }, (_, k) => ({
          d: spike(r + 1, (k / 30) * Math.PI * 2 + (rand() - 0.5) * 0.15, 5 + rand() * rand() * 26, 2 + rand() * 4, (rand() - 0.5) * 0.1),
          o: 0.15 + rand() * 0.3,
        }));
        const S = r + 40;
        const uri = painting(
          -S,
          -S,
          2 * S,
          h.joined
            ? `<g filter="url(#b)">${halo.map((s) => `<path d="${s.d}" fill="${c}" opacity="${s.o.toFixed(2)}"/>`).join("")}</g>` +
                `<g filter="url(#e)"><circle r="${r}" fill="${c}" fill-opacity="0.07" stroke="${c}" stroke-width="3.5" opacity="0.9"/>` +
                `<circle r="${r - 7}" fill="none" stroke="${OCHRE}" stroke-width="8" opacity="0.22"/>` +
                dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="2.2"/>`).join("") +
                `</g>`
            : `<circle r="${r}" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="5 12" stroke-linecap="round" opacity="0.55" filter="url(#e)"/>`,
        );
        return {
          uri,
          S,
          dots,
          // Smaller suns get fewer flares and tiny ones none, so a big group stays calm.
          flares: Array.from({ length: r < 24 ? 0 : hs.length > 30 ? 3 : 6 }, () => {
            const ang = rand() * Math.PI * 2;
            return makeFlare(rand, r, ang, r * (0.25 + rand() * 0.45), 3 + rand() * 5, colour(h.hue));
          }),
        };
      }),
    [hs, rs],
  );

  const threadsFor = useCallback((id: string | null) => (id ? data.threads.filter((t) => t.a === id || t.b === id) : []), [data.threads]);
  // Strongest threads first, capped so a big group doesn't turn into a web.
  const allFocusThreads = threadsFor(focus).sort((a, b) => b.shared.length - a.shared.length);
  const focusThreads = allFocusThreads.slice(0, MAX_THREADS);
  // For each household linked to the one in focus, the first thing they share.
  const linked = new Map(focusThreads.map((t) => [t.a === focus ? t.b : t.a, t.shared[0].value]));
  const showLinkLabels = linked.size <= MAX_LINK_LABELS;

  // ---- Motion: gentle orbit, soft collisions, flicks and swirls.
  const drag = useRef<
    | { kind: "body"; i: number; dx: number; dy: number; sx: number; sy: number; moved: boolean; t: number; lx: number; ly: number }
    | { kind: "swirl"; a: number; t: number; sx: number; sy: number; moved: boolean }
    | null
  >(null);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      // Flares are CSS animations: pause them too while the circle is off screen.
      svgRef.current?.classList.toggle("is-paused", !visible);
    });
    if (svgRef.current) io.observe(svgRef.current);

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      const B = bodies.current;
      const dragging = drag.current?.kind === "body" ? drag.current.i : -1;
      const focusIndex = hs.findIndex((h) => h.id === focusRef.current);
      // Space a circle needs: its own size plus its name label, or its names all round when in focus.
      const scaleOf = (i: number) => (focusIndex < 0 ? 1 : i === focusIndex ? focusScale(B[i].r) : REST_SCALE);
      const room = (i: number) => (i === focusIndex ? B[i].r * scaleOf(i) + 140 : B[i].r * scaleOf(i) + (focusIndex < 0 ? 26 : 44));

      for (let i = 0; i < B.length; i++) {
        if (i === dragging) continue;
        const b = B[i];
        const dx = b.x - C;
        const dy = b.y - C;
        const d = Math.hypot(dx, dy) || 1;
        if (!reduced) {
          // Drift slowly round the circle.
          const tx = -dy / d;
          const ty = dx / d;
          const vt = b.vx * tx + b.vy * ty;
          const k = Math.min(1, 0.5 * dt);
          b.vx += (0.07 * d - vt) * tx * k;
          b.vy += (0.07 * d - vt) * ty * k;
        }
        // A soft pull inwards keeps the constellation together; the circle in focus glides to the middle.
        const pull = i === focusIndex ? 8 : 0.05;
        b.vx -= dx * pull * dt;
        b.vy -= dy * pull * dt;
        const damp = Math.exp(-(i === focusIndex ? 6 : reduced ? 3 : 0.9) * dt);
        b.vx *= damp;
        b.vy *= damp;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      // Circles bump into each other gently.
      for (let i = 0; i < B.length; i++) {
        for (let j = i + 1; j < B.length; j++) {
          const a = B[i];
          const b = B[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = room(i) + room(j);
          if (d >= min) continue;
          const nx = dx / d;
          const ny = dy / d;
          const push = min - d;
          // A circle being dragged, or in focus, holds its ground; others make way.
          const fixed = (k: number) => k === dragging || k === focusIndex;
          const wa = fixed(i) ? 0 : fixed(j) ? 1 : 0.5;
          const wb = 1 - wa;
          a.x -= nx * push * wa;
          a.y -= ny * push * wa;
          b.x += nx * push * wb;
          b.y += ny * push * wb;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = -rel * 0.8;
            if (wa) (a.vx -= nx * imp * wa * 2), (a.vy -= ny * imp * wa * 2);
            if (wb) (b.vx += nx * imp * wb * 2), (b.vy += ny * imp * wb * 2);
          }
        }
      }
      // And stay inside the group's ring.
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        const dx = b.x - C;
        const dy = b.y - C;
        const d = Math.hypot(dx, dy) || 1;
        const max = R - (i === focusIndex ? b.r * scaleOf(i) + 8 : b.r * scaleOf(i) + 22);
        if (d > max) {
          b.x = C + (dx / d) * max;
          b.y = C + (dy / d) * max;
          const vr = (b.vx * dx + b.vy * dy) / d;
          if (vr > 0) {
            b.vx -= (1.6 * vr * dx) / d;
            b.vy -= (1.6 * vr * dy) / d;
          }
        }
        const g = groupRefs.current.get(hs[i].id);
        g?.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
      }
      // Threads follow the circles they join, from edge to edge, with a slight curve.
      for (const [key, path] of threadRefs.current) {
        const [ia, ib] = key.split("|").map((id) => hs.findIndex((h) => h.id === id));
        if (ia < 0 || ib < 0) continue;
        const a = B[ia];
        const b = B[ib];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const ra = a.r * scaleOf(ia) + 6;
        const rb = b.r * scaleOf(ib) + 6;
        if (d <= ra + rb) {
          path.setAttribute("d", "");
          continue;
        }
        const x1 = a.x + (dx / d) * ra;
        const y1 = a.y + (dy / d) * ra;
        const x2 = b.x - (dx / d) * rb;
        const y2 = b.y - (dy / d) * rb;
        const qx = (x1 + x2) / 2 - (dy / d) * d * 0.12;
        const qy = (y1 + y2) / 2 + (dx / d) * d * 0.12;
        path.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      }
    };
    raf = requestAnimationFrame(step);

    // Let a finger drag a circle without scrolling the page; elsewhere vertical swipes still scroll.
    const svg = svgRef.current;
    const stopScroll = (e: TouchEvent) => {
      if ((e.target as Element).closest?.("[data-body]")) e.preventDefault();
    };
    svg?.addEventListener("touchstart", stopScroll, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      svg?.removeEventListener("touchstart", stopScroll);
    };
  }, [hs]);

  const toggle = (id: string) => setSelected((s) => (s === id ? null : id));

  const onBodyDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    const b = bodies.current[i];
    drag.current = { kind: "body", i, dx: p.x - b.x, dy: p.y - b.y, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now(), lx: p.x, ly: p.y };
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    drag.current = { kind: "swirl", a: Math.atan2(p.y - C, p.x - C), t: performance.now(), sx: e.clientX, sy: e.clientY, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
    const p = toSvg(e.clientX, e.clientY);
    const now = performance.now();
    const dt = Math.max(0.008, (now - d.t) / 1000);
    if (d.kind === "body") {
      const b = bodies.current[d.i];
      b.x = p.x - d.dx;
      b.y = p.y - d.dy;
      // Remember the hand's speed, so letting go flicks the circle.
      b.vx = b.vx * 0.4 + ((p.x - d.lx) / dt) * 0.6;
      b.vy = b.vy * 0.4 + ((p.y - d.ly) / dt) * 0.6;
      d.lx = p.x;
      d.ly = p.y;
    } else {
      // Stir the whole circle round with the hand.
      const a = Math.atan2(p.y - C, p.x - C);
      let da = a - d.a;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const w = Math.max(-6, Math.min(6, da / dt));
      for (const b of bodies.current) {
        const dx = b.x - C;
        const dy = b.y - C;
        b.vx += -dy * w * 0.35;
        b.vy += dx * w * 0.35;
      }
      d.a = a;
    }
    d.t = now;
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "body") {
      const b = bodies.current[d.i];
      const s = Math.hypot(b.vx, b.vy);
      if (s > 1500) (b.vx *= 1500 / s), (b.vy *= 1500 / s);
      if (!d.moved) toggle(hs[d.i].id);
    } else if (!d.moved) setSelected(null);
  };

  const focused = hs.find((h) => h.id === focus) ?? null;
  const nameOf = (id: string) => hs.find((h) => h.id === id)?.name ?? "";

  return (
    <div className="circle">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB} ${VB}`}
        className="circle-svg"
        role="group"
        aria-label={`Our circle: ${hs.length} ${hs.length === 1 ? data.unit.singular : data.unit.plural}. Tap a circle to meet them; drag to move it.`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          {GRADIENT_COLOURS.map((c, i) => (
            <linearGradient key={c} id={`${uid}-fl-${i}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={c} stopOpacity="0.75" />
              <stop offset="0.55" stopColor={c} stopOpacity="0.35" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* The group: our friendship, painted from everyone's colours. */}
        <image className="circle-painting" href={ring.uri} x={-RING_BLEED} y={-RING_BLEED} width={VB + 2 * RING_BLEED} height={VB + 2 * RING_BLEED} aria-hidden />

        {/* The ring's flares and prominences. */}
        <g className="circle-flares" aria-hidden>
          {ring.prominences.map((p, i) => (
            <g key={i} transform={`translate(${C} ${C}) rotate(${p.deg.toFixed(1)})`}>
              <path className="prominence" d={p.d} pathLength={1} fill="none" stroke={p.c} strokeWidth={p.w} strokeLinecap="round" style={timing(p.dur, p.delay, p.o)} />
            </g>
          ))}
          <Flares flares={ring.flares} uid={uid} />
        </g>

        {/* Threads to the households the focused one shares something with. */}
        <g aria-hidden>
          {focusThreads.map((t) => {
            const key = `${t.a}|${t.b}`;
            return (
              <path
                key={key}
                ref={(el) => {
                  if (el) threadRefs.current.set(key, el);
                  else threadRefs.current.delete(key);
                }}
                fill="none"
                stroke={colour(hs.find((h) => h.id === focus)!.hue)}
                strokeWidth={3 + Math.min(7, t.shared.length * 2)}
                strokeLinecap="round"
                opacity={0.4}
              />
            );
          })}
        </g>

        {/* Households, and the people in them. */}
        {hs.map((h, i) => {
          const r = rs[i];
          const c = colour(h.hue);
          const isFocus = focus === h.id;
          const dim = focus && !isFocus && !linked.has(h.id);
          const b = bodies.current[i];
          return (
            <g
              key={h.id}
              ref={(el) => {
                if (el) groupRefs.current.set(h.id, el);
                else groupRefs.current.delete(h.id);
              }}
              transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`}
              data-body
              className="circle-body"
              style={{ opacity: dim ? 0.4 : 1 }}
              tabIndex={0}
              role="button"
              aria-pressed={selected === h.id}
              aria-label={`${h.name}${h.isMe ? " (you)" : ""}${h.members.length ? `: ${h.members.join(", ")}` : ""}`}
              onPointerDown={onBodyDown(i)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(h.id)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setHovered((x) => (x === h.id ? null : x))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(h.id);
                }
              }}
            >
              <g style={{ transform: `scale(${isFocus ? focusScale(r) : focus ? REST_SCALE : 1})`, transition: "transform 450ms cubic-bezier(.2,.8,.2,1)" }}>
                {h.joined && (
                  <g className="circle-flares" aria-hidden>
                    <Flares flares={art[i].flares} uid={uid} />
                  </g>
                )}
                {/* Invisible target for taps and hovers; the painting itself ignores the pointer. */}
                <circle r={Math.max(r + 6, 22)} fill="transparent" />
                <image className="circle-painting" href={art[i].uri} x={-art[i].S} y={-art[i].S} width={art[i].S * 2} height={art[i].S * 2} aria-hidden />
                {/* Your own household carries a faint dotted ring, so you can find yourself without labels. */}
                {h.isMe && <circle r={r + 13} fill="none" stroke={c} strokeWidth={2.4} strokeDasharray="1 9" strokeLinecap="round" opacity={0.7} aria-hidden />}
                {/* Names appear round the circle when it's in focus. */}
                {isFocus &&
                  h.members.map((m, k) => {
                    const d = art[i].dots[k];
                    if (!d) return null;
                    const ang = d.x === 0 && d.y === 0 ? -Math.PI / 2 : Math.atan2(d.y, d.x);
                    const [x1, y1] = polar(d.r, ang, d.x, d.y);
                    const [x2, y2] = polar(r + 18, ang);
                    const right = Math.cos(ang) >= -0.2;
                    return (
                      <g key={m + k} className="circle-member" aria-hidden>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text)" strokeWidth={1.6} opacity={0.55} />
                        <text x={x2 + (right ? 5 : -5)} y={y2 + 9} textAnchor={right ? "start" : "end"}>
                          {m}
                        </text>
                      </g>
                    );
                  })}
              </g>
              {/* Names stay hidden until you hover or tap, so even a big group reads as a painting. */}
              {!isFocus && (hovered === h.id || (showLinkLabels && linked.has(h.id))) && (
                <text className="circle-name" y={r * (focus ? REST_SCALE : 1) + 40} textAnchor="middle" aria-hidden>
                  {h.isMe ? "You" : h.name}
                  {!h.joined && " · joining"}
                  {showLinkLabels && linked.has(h.id) && <tspan className="circle-shared"> · {linked.get(h.id)}</tspan>}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="circle-card" aria-live="polite" style={focused ? ({ "--w": colour(focused.hue) } as React.CSSProperties) : undefined}>
        {focused ? (
          <>
            <div className="spread">
              <h3>
                <span className="circle-dot" style={{ background: colour(focused.hue) }} aria-hidden />
                {focused.name}
              </h3>
              {focused.isMe && <span className="pill accent">You</span>}
            </div>
            {focused.members.length > 0 ? (
              <p className="circle-members">{focused.members.join(" · ")}</p>
            ) : (
              !data.individual && (
                <p className="small muted">
                  {focused.size > 1 ? `${focused.size} people` : ""}
                  {focused.isMe && data.membersField && (
                    <>
                      {focused.size > 1 ? " · " : ""}
                      <Link href={`${profileHref}#field-${data.membersField}`}>Add your names</Link> so they show in the circle
                    </>
                  )}
                </p>
              )
            )}
            {!focused.joined && <p className="small muted">Still joining. Their circle fills in once they've shared their profile.</p>}
            {focused.summary && <p>{focused.summary}</p>}
            {focused.highlights.length > 0 && (
              <dl className="circle-highlights">
                {focused.highlights.map((h) => (
                  <div key={h.label}>
                    <dt>{h.label}</dt>
                    <dd>
                      {h.values.map((v) => (
                        <span key={v} className="circle-chip">
                          {v}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {focusThreads.length > 0 && (
              <>
                <h4>Shared threads</h4>
                <ul className="circle-threads">
                  {focusThreads.map((t) => {
                    const other = t.a === focused.id ? t.b : t.a;
                    const mineFirst = t.a === focused.id;
                    return (
                      <li key={other}>
                        <strong>{nameOf(other)}</strong>{" "}
                        {t.shared.map((s) => {
                          const [mine, theirs] = mineFirst ? [s.a, s.b] : [s.b, s.a];
                          return (
                            <span key={s.value + mine + theirs} className="circle-chip" title={`${focused.name}: ${mine}. ${nameOf(other)}: ${theirs}.`}>
                              {s.value}
                              {mine !== theirs && <span className="muted"> · {theirs.toLowerCase()}</span>}
                            </span>
                          );
                        })}
                      </li>
                    );
                  })}
                </ul>
                {allFocusThreads.length > focusThreads.length && (
                  <p className="small muted">and {allFocusThreads.length - focusThreads.length} more</p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <p className="small muted" style={{ textAlign: "center" }}>
              Tap a circle to see who's inside. Drag one to move it, or stir the circle with your finger. Yours has a dotted ring.
            </p>
            <details className="circle-who">
              <summary>
                Who's in the circle ({hs.length} {hs.length === 1 ? data.unit.singular : data.unit.plural})
              </summary>
              <div className="circle-legend">
                {hs.map((h) => (
                  <button key={h.id} type="button" className="small" onClick={() => toggle(h.id)}>
                    <span className="circle-dot" style={{ background: colour(h.hue) }} aria-hidden />
                    {h.isMe ? `${h.name} (you)` : h.name}
                  </button>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
