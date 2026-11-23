'use client';

import { useEffect, useRef } from 'react';

// El arte del banner de la edición: rayos de puntos que salen de un punto bajo el banner, con cuadrados cian que se encienden y se
// apagan. En Shopify es una imagen; aquí está dibujado en canvas para que se mueva despacio (los puntos viajan hacia fuera) y no
// pese. Con «reducir movimiento» o fuera de pantalla no hay rAF: se pinta un fotograma y ya.
// Determinista (PRNG con semilla): dos cargas dibujan lo mismo.

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rayo { ang: number; fase: number; largo: number; paso: number }
interface Cuadrado { rayo: number; d: number; lado: number; fase: number; vel: number }

export function ArteRayos({ velocidad = 1, className }: { velocidad?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rnd = mulberry32(2611);
    const rayos: Rayo[] = Array.from({ length: 44 }, (_, i) => ({
      ang: -Math.PI * (0.1 + 0.8 * (i / 43)) + (rnd() - 0.5) * 0.05,
      fase: rnd(), largo: 0.6 + rnd() * 0.5, paso: 5 + rnd() * 4,
    }));
    const cuadrados: Cuadrado[] = Array.from({ length: 40 }, () => ({
      rayo: Math.floor(rnd() * rayos.length), d: 0.12 + rnd() * 0.85,
      lado: 4 + rnd() * rnd() * 12, fase: rnd() * Math.PI * 2, vel: 0.4 + rnd() * 0.8,
    }));

    const t0 = performance.now();
    let w = 0, h = 0, dpr = 1, visible = true, raf = 0;

    const medir = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const pintar = (ms: number) => {
      const t = ((ms - t0) / 1000) * velocidad;
      ctx.clearRect(0, 0, w, h);
      const ox = w * 0.66, oy = h * 1.12, R = Math.hypot(w, h) * 0.95;
      const punto = (x: number, y: number, r: number, a: number) => {
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      };
      ctx.fillStyle = '#6ff3ff';
      for (const ry of rayos) {
        const cos = Math.cos(ry.ang), sin = Math.sin(ry.ang);
        const max = R * ry.largo;
        // Los puntos avanzan por el rayo: el desfase `t * 14` px/s los hace fluir hacia fuera sin que el rayo cambie de sitio.
        const corr = quieto ? 0 : (t * 14 + ry.fase * ry.paso) % ry.paso;
        for (let d = corr; d < max; d += ry.paso * (1 + d / 520)) {
          const x = ox + cos * d, y = oy + sin * d;
          if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
          const k = d / max;
          punto(x, y, 0.8 + k * 1.5, Math.min(1, 0.3 + (1 - k) * 0.75) * Math.min(1, d / 50));
        }
      }
      // Dos arcos de puntos finos, como las líneas que cruzan los rayos en el original.
      for (const f of [0.55, 0.8]) {
        for (let a = -Math.PI * 0.95; a < -Math.PI * 0.05; a += 0.028) {
          const d = R * f, x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
          if (x < 0 || x > w || y < 0 || y > h) continue;
          punto(x, y, 0.7, 0.32);
        }
      }
      for (const c of cuadrados) {
        const ry = rayos[c.rayo], max = R * ry.largo;
        const d = max * c.d;
        const x = ox + Math.cos(ry.ang) * d, y = oy + Math.sin(ry.ang) * d;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const brillo = quieto ? 0.8 : 0.55 + 0.45 * Math.sin(t * c.vel + c.fase);
        ctx.globalAlpha = 0.55 + 0.45 * brillo;
        ctx.fillStyle = brillo > 0.85 ? '#b9fbff' : '#4be8f7';
        const l = c.lado * (0.85 + 0.15 * brillo);
        ctx.fillRect(x - l / 2, y - l / 2, l, l);
      }
      ctx.globalAlpha = 1;
    };

    const bucle = (ms: number) => {
      if (!visible) { raf = 0; return; }
      pintar(ms);
      raf = requestAnimationFrame(bucle);
    };

    medir();
    pintar(performance.now());
    const ro = new ResizeObserver(() => { medir(); pintar(performance.now()); });
    ro.observe(canvas);
    let io: IntersectionObserver | null = null;
    if (!quieto) {
      io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(bucle);
      });
      io.observe(canvas);
    }
    return () => { visible = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect(); };
  }, [velocidad]);

  return <canvas ref={ref} className={className} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />;
}
