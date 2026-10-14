'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Los fuegos artificiales del módulo Festivos (14-oct-2026): «incluso con los
// fuegos artificiales», pidió el fundador viendo los de Bonsai. Allí son cuatro
// ráfagas de papelitos en un canvas a pantalla completa, en sitios distintos y
// separadas medio segundo, al terminar de añadir los festivos. Aquí, lo mismo,
// con los colores del logo y de la paleta del panel en vez de un arcoíris.
//
// Sin dependencia: un canvas y requestAnimationFrame. No captura el puntero
// (no tapa nada), se va solo a los ~3 s y, con «reducir movimiento», no sale.
// Va en un portal al anfitrión del panel: un `fixed` dentro de algo con
// transform se mediría contra ese algo y no contra la ventana.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { anfitrionPortal } from '@/lib/panel-portal';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';

/** Los tonos, por su variable (se leen del panel: en oscuro salen sus versiones claras). Nunca un hex a mano. */
const VARIABLES = ['--t-blue-500', '--t-magenta-500', '--cat-2', '--cat-5', '--cat-3', '--warning'];

const RAFAGAS = [
  { t: 0, x: 0.5, y: 0.32 },
  { t: 420, x: 0.24, y: 0.38 },
  { t: 860, x: 0.76, y: 0.3 },
  { t: 1350, x: 0.42, y: 0.46 },
];
const PAPELITOS_POR_RAFAGA = 90;
const VIDA_MS = 2300;

interface Papelito {
  x: number; y: number; vx: number; vy: number;
  giro: number; vgiro: number; ancho: number; alto: number;
  color: string; nace: number; forma: 0 | 1;
}

function colores(el: HTMLElement): string[] {
  const cs = getComputedStyle(el);
  const tonos = VARIABLES.map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
  // Fuera del panel (sin sus variables), el color del texto: nunca un papelito invisible.
  return tonos.length ? tonos : [cs.color];
}

function lanzar(canvas: HTMLCanvasElement, alTerminar: () => void): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) { alTerminar(); return () => {}; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  ctx.scale(dpr, dpr);
  const paleta = colores(canvas);
  const escala = Math.min(1, Math.max(0.6, ancho / 1200));
  const papelitos: Papelito[] = [];
  const inicio = performance.now();
  let disparadas = 0;
  let marco = 0;

  const rafaga = (r: (typeof RAFAGAS)[number], ahora: number) => {
    const cx = r.x * ancho + (Math.random() - 0.5) * ancho * 0.08;
    const cy = r.y * alto + (Math.random() - 0.5) * alto * 0.06;
    for (let i = 0; i < PAPELITOS_POR_RAFAGA; i++) {
      const angulo = Math.random() * Math.PI * 2;
      const fuerza = (4 + Math.random() * 9) * escala;
      papelitos.push({
        x: cx, y: cy,
        vx: Math.cos(angulo) * fuerza,
        vy: Math.sin(angulo) * fuerza - 3 * escala,
        giro: Math.random() * Math.PI,
        vgiro: (Math.random() - 0.5) * 0.35,
        ancho: (5 + Math.random() * 5) * escala,
        alto: (8 + Math.random() * 6) * escala,
        color: paleta[(Math.random() * paleta.length) | 0],
        nace: ahora,
        forma: Math.random() < 0.7 ? 0 : 1,
      });
    }
  };

  const paso = (ahora: number) => {
    const t = ahora - inicio;
    while (disparadas < RAFAGAS.length && t >= RAFAGAS[disparadas].t) {
      rafaga(RAFAGAS[disparadas], ahora);
      disparadas++;
    }
    ctx.clearRect(0, 0, ancho, alto);
    let vivos = 0;
    for (const p of papelitos) {
      const edad = ahora - p.nace;
      if (edad > VIDA_MS) continue;
      vivos++;
      p.vx *= 0.965;
      p.vy = p.vy * 0.965 + 0.32 * escala;
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vgiro;
      ctx.save();
      ctx.globalAlpha = edad < VIDA_MS * 0.6 ? 1 : Math.max(0, 1 - (edad - VIDA_MS * 0.6) / (VIDA_MS * 0.4));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.color;
      if (p.forma === 0) {
        // Un papelito que gira: el alto se encoge y crece, como al dar vueltas.
        ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto * Math.abs(Math.cos(p.giro * 2)));
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.ancho / 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (vivos === 0 && disparadas === RAFAGAS.length) {
      ctx.clearRect(0, 0, ancho, alto);
      alTerminar();
      return;
    }
    marco = requestAnimationFrame(paso);
  };
  marco = requestAnimationFrame(paso);
  return () => cancelAnimationFrame(marco);
}

/**
 * Cada vez que `disparo` sube (y no es 0), lanza una tanda. Sin «reducir
 * movimiento»: con él, no pinta nada (el toast ya dice lo que ha pasado).
 */
export function FuegosArtificiales({ disparo }: { disparo: number }) {
  const menosMovimiento = useCoincideMedio('(prefers-reduced-motion: reduce)');
  const [activo, setActivo] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Ajuste en render (no efecto) sobre el cambio de `disparo`, como el cajón del panel.
  const [visto, setVisto] = useState(disparo);
  if (disparo !== visto) {
    setVisto(disparo);
    if (disparo > 0 && !menosMovimiento) setActivo(disparo);
  }

  useEffect(() => {
    if (!activo || !canvas.current) return;
    return lanzar(canvas.current, () => setActivo(0));
  }, [activo]);

  if (!activo) return null;
  return createPortal(
    <canvas
      ref={canvas}
      aria-hidden
      data-testid="fuegos-artificiales"
      className="pointer-events-none fixed inset-0 z-[70] h-screen w-screen"
    />,
    anfitrionPortal(),
  );
}
