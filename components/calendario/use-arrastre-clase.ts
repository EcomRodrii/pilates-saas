'use client';

import { useRef, useState } from 'react';

// Arrastrar una clase con el dedo o el ratón (Pointer Events, no `draggable`
// nativo: ese no dispara con el dedo en Safari de iOS, y el mostrador trabaja
// con un iPad). Lo comparten la Semana por franjas y el Día; dónde cae la clase
// lo decide quien la pinta, con las coordenadas del puntero al soltar.

type Limites = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Cuánto puede moverse la tarjeta sin salirse de la zona de casillas de la
 * rejilla (`[data-rejilla]`): la unión de sus días (`data-dia-index`) o salas
 * (`data-sala-id`). Ni sobre la cabecera ni sobre la columna de horas — ahí se
 * pintaría encima de ellas, y soltar allí no es ningún sitio (#1796).
 * Si no hay rejilla o la tarjeta ya es más grande que ella, sin límites: es
 * preferible a fijar un tope inventado.
 */
function limitesDeArrastre(el: HTMLElement): Limites | null {
  const rejilla = el.closest<HTMLElement>('[data-rejilla]');
  if (!rejilla) return null;
  const b = el.getBoundingClientRect();
  const celdas = [...rejilla.querySelectorAll<HTMLElement>('[data-dia-index], [data-sala-id]')].map(c => c.getBoundingClientRect());
  const r = celdas.length === 0 ? rejilla.getBoundingClientRect() : {
    left: Math.min(...celdas.map(c => c.left)), right: Math.max(...celdas.map(c => c.right)),
    top: Math.min(...celdas.map(c => c.top)), bottom: Math.max(...celdas.map(c => c.bottom)),
    get width() { return this.right - this.left; }, get height() { return this.bottom - this.top; },
  };
  if (b.width > r.width || b.height > r.height) return null;
  return { minX: r.left - b.left, maxX: r.right - b.right, minY: r.top - b.top, maxY: r.bottom - b.bottom };
}

export function useArrastreClase({ arrastrable, onSeleccionar, onMover, onMoviendo }: {
  arrastrable: boolean;
  onSeleccionar: () => void;
  /** Al soltar: la X del puntero (qué día o sala) y la Y de lo alto de la tarjeta
   *  tal y como se veía al soltarla (a qué hora empieza). */
  onMover?: (clientX: number, arribaY: number) => void;
  /** Mientras se arrastra, para iluminar el destino; `null` al terminar. */
  onMoviendo?: (punto: { x: number; y: number } | null) => void;
}) {
  const arrastreRef = useRef<{
    pointerId: number; startX: number; startY: number; moved: boolean; limites: Limites | null; umbral: number;
  } | null>(null);
  const ultimoFueArrastreRef = useRef(false);
  const [arrastrando, setArrastrando] = useState(false);
  const activo = arrastrable && !!onMover;

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!activo || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = {
      pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false,
      limites: limitesDeArrastre(e.currentTarget),
      // Un dedo tiembla más que un ratón: en un iPad, un toque con 5 px de
      // temblor no puede convertirse en «mover la clase».
      umbral: e.pointerType === 'mouse' ? 4 : 10,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const a = arrastreRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    const dx = e.clientX - a.startX;
    const dy = e.clientY - a.startY;
    if (!a.moved && Math.abs(dx) + Math.abs(dy) > a.umbral) { a.moved = true; setArrastrando(true); }
    if (!a.moved) return;
    // El puntero puede irse donde quiera; la tarjeta no: se queda dentro de la
    // rejilla, tocando el borde. Fuera no hay ningún sitio donde soltarla.
    const l = a.limites;
    const x = l ? Math.min(Math.max(dx, l.minX), l.maxX) : dx;
    const y = l ? Math.min(Math.max(dy, l.minY), l.maxY) : dy;
    e.currentTarget.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    onMoviendo?.({ x: e.clientX, y: e.clientY });
  }
  function terminar(e: React.PointerEvent<HTMLElement>) {
    e.currentTarget.style.transform = '';
    arrastreRef.current = null;
    setArrastrando(false);
    onMoviendo?.(null);
  }
  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const a = arrastreRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // La clase empieza donde se VE la tarjeta al soltarla, no donde está el
    // puntero: cogida por el medio, con el puntero saltaba media clase abajo.
    const arriba = e.currentTarget.getBoundingClientRect().top;
    terminar(e);
    ultimoFueArrastreRef.current = a.moved;
    if (a.moved) onMover?.(e.clientX, arriba + 1);
  }
  function onPointerCancel(e: React.PointerEvent<HTMLElement>) {
    if (arrastreRef.current?.pointerId !== e.pointerId) return;
    terminar(e);
  }
  function onClick() {
    // El clic que sigue a soltar un arrastre no abre la clase: solo cuenta el arrastre.
    if (ultimoFueArrastreRef.current) { ultimoFueArrastreRef.current = false; return; }
    onSeleccionar();
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(); }
  }

  return {
    arrastrando,
    manejadores: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, onKeyDown },
    estilo: {
      touchAction: activo ? 'none' : undefined,
      zIndex: arrastrando ? 40 : undefined,
      boxShadow: arrastrando ? '0 12px 24px -8px rgba(0,0,0,0.35)' : undefined,
      // Sin transición mientras se arrastra: con ella la tarjeta persigue al
      // dedo con retraso en vez de seguirlo.
      transition: arrastrando ? 'none' : undefined,
      cursor: activo ? (arrastrando ? 'grabbing' : 'grab') : 'pointer',
    } as React.CSSProperties,
  };
}
