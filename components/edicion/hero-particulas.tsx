'use client';

import { useEffect, useRef } from 'react';

// La entrada de la página de la edición, con la idea de la de Shopify Editions (medida el 23-nov-2026): un titular enorme hecho
// de partículas que llegan desde todas partes, se juntan formando la palabra y quedan respirando; el puntero las aparta.
// Es canvas 2D (no WebGL): ~7.000 puntos a 60 fps en un portátil normal. Con «reducir movimiento» las partículas nacen ya colocadas
// y no hay rAF; fuera de pantalla o con la pestaña oculta tampoco se pide fotograma.

const PALETA = ['#ffffff', '#ffffff', '#9fb0ff', '#6ff3ff', '#c9b8ff'];
interface P { x: number; y: number; tx: number; ty: number; vx: number; vy: number; r: number; c: string; f: number }

export function HeroParticulas({ palabra, className }: { palabra: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ps: P[] = [], w = 0, h = 0, dpr = 1, raf = 0, visible = true, vivo = true;
    const ptr = { x: -9999, y: -9999 };

    const construir = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // La palabra, dibujada fuera de pantalla y muestreada: cada píxel encendido es el destino de una partícula.
      const off = document.createElement('canvas');
      const ow = Math.round(w), oh = Math.round(h);
      off.width = ow; off.height = oh;
      const o = off.getContext('2d', { willReadFrequently: true });
      if (!o) return;
      let tam = Math.min(ow * 0.2, oh * 0.5);
      o.font = `500 ${tam}px Inter, system-ui, sans-serif`;
      while (o.measureText(palabra).width > ow * 0.86 && tam > 24) { tam -= 4; o.font = `500 ${tam}px Inter, system-ui, sans-serif`; }
      o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
      o.fillText(palabra, ow / 2, oh * 0.5);
      const datos = o.getImageData(0, 0, ow, oh).data;
      const paso = Math.max(2, Math.round(tam / 64));
      const next: P[] = [];
      for (let y = 0; y < oh; y += paso) {
        for (let x = 0; x < ow; x += paso) {
          if (datos[(y * ow + x) * 4 + 3] < 128) continue;
          const a = Math.random() * Math.PI * 2, d = Math.max(w, h) * (0.4 + Math.random() * 0.7);
          next.push({
            x: quieto ? x : w / 2 + Math.cos(a) * d, y: quieto ? y : h / 2 + Math.sin(a) * d,
            tx: x, ty: y, vx: 0, vy: 0, r: 0.7 + Math.random() * 0.9,
            c: PALETA[Math.floor(Math.random() * PALETA.length)], f: Math.random() * 6.28,
          });
        }
      }
      ps = next;
    };

    const pintar = (ms: number) => {
      ctx.clearRect(0, 0, w, h);
      const t = ms / 1000;
      for (const p of ps) {
        if (!quieto) {
          // Muelle hacia su sitio + una respiración suave; el puntero empuja.
          const ox = Math.cos(t * 0.9 + p.f) * 1.4, oy = Math.sin(t * 0.8 + p.f) * 1.4;
          let ax = (p.tx + ox - p.x) * 0.045, ay = (p.ty + oy - p.y) * 0.045;
          const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < 11000) { const k = (1 - d2 / 11000) * 5.5 / Math.sqrt(d2 + 1); ax += dx * k; ay += dy * k; }
          p.vx = (p.vx + ax) * 0.84; p.vy = (p.vy + ay) * 0.84;
          p.x += p.vx; p.y += p.vy;
        }
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
      }
      ctx.globalAlpha = 1;
    };

    const bucle = (ms: number) => {
      if (!visible || !vivo) { raf = 0; return; }
      pintar(ms);
      raf = requestAnimationFrame(bucle);
    };

    const arrancar = () => { construir(); pintar(performance.now()); if (!quieto && !raf && visible) raf = requestAnimationFrame(bucle); };
    // La tipografía tiene que estar lista antes de muestrear la palabra, o se muestrearía la de reserva.
    void document.fonts.ready.then(() => { if (vivo) arrancar(); });

    const mover = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; };
    const salir = () => { ptr.x = ptr.y = -9999; };
    canvas.addEventListener('pointermove', mover); canvas.addEventListener('pointerleave', salir);
    const ro = new ResizeObserver(() => { if (vivo) arrancar(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !quieto) raf = requestAnimationFrame(bucle); });
    io.observe(canvas);
    return () => {
      vivo = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointermove', mover); canvas.removeEventListener('pointerleave', salir);
    };
  }, [palabra]);

  return <canvas ref={ref} className={className} role="img" aria-label={palabra} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' }} />;
}
