'use client';

import { useEffect, useRef } from 'react';

// Un chorro de confeti al terminar la demo. Un solo lienzo, sin dependencias, unos 3 s:
// con `prefers-reduced-motion` no se pinta nada (la felicitación va escrita igualmente).
const COLORES = ['#D9C29E', '#343825', '#B9C09A', '#E0457B', '#F2B8CF', '#FFFFFF'];

interface Pieza { x: number; y: number; vx: number; vy: number; g: number; w: number; h: number; r: number; vr: number; c: string }

export function Confeti() {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = lienzo.current;
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = window.innerWidth, alto = window.innerHeight;
    cv.width = ancho * dpr; cv.height = alto * dpr;
    ctx.scale(dpr, dpr);
    // Dos cañones, uno a cada lado, que disparan hacia arriba y hacia el centro.
    const piezas: Pieza[] = Array.from({ length: 150 }, (_, i) => {
      const izq = i % 2 === 0;
      const abre = 0.35 + Math.random() * 0.7; // radianes respecto a la vertical, hacia el centro
      const v = 9 + Math.random() * 9;
      return {
        x: izq ? 0 : ancho, y: alto * 0.75,
        vx: (izq ? 1 : -1) * Math.sin(abre) * v, vy: -Math.cos(abre) * v - 4,
        g: 0.28 + Math.random() * 0.12, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, c: COLORES[Math.floor(Math.random() * COLORES.length)],
      };
    });
    let id = 0;
    const inicio = performance.now();
    const pintar = (ahora: number) => {
      const t = ahora - inicio;
      ctx.clearRect(0, 0, ancho, alto);
      for (const p of piezas) {
        p.vy += p.g; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (3200 - t) / 800));
        ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < 3200) id = requestAnimationFrame(pintar);
      else ctx.clearRect(0, 0, ancho, alto);
    };
    id = requestAnimationFrame(pintar);
    return () => cancelAnimationFrame(id);
  }, []);

  return <canvas ref={lienzo} className="dm-confeti" aria-hidden="true" />;
}
