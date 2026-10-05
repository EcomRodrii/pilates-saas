'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Tenti as Motor, ESTADOS, type EmocionTenti, type EstadoTenti } from '@/lib/tenti/motor';

// La mascota de Tentare. El dibujo y las animaciones viven en lib/tenti/motor.ts;
// esto solo lo monta en un <canvas> y lo conecta con la página.
//
// ⚠️ Gasta un requestAnimationFrame mientras se ve: se para solo cuando sale de
// pantalla o la pestaña se oculta. Con «reducir movimiento» no sigue el cursor
// y solo anima el instante en que cambia algo.

export interface TentiControl {
  emocion: (e: EmocionTenti) => void;
  saludar: () => void;
}

interface Props {
  estado?: EstadoTenti;
  /** Lado del cuadro en px. Tenti ocupa algo más de la mitad. */
  tamano?: number;
  /** Mueve los ojos hacia el cursor. */
  sigueCursor?: boolean;
  /** Sonidos de sus reacciones. Apagados por defecto. */
  sonido?: boolean;
  /** Se aplasta al tocarlo, y se marea si insistes. */
  interactivo?: boolean;
  /** Saluda con la mano al aparecer. */
  saludaAlAparecer?: boolean;
  className?: string;
  ref?: Ref<TentiControl>;
}

const MAREO_TRAS_TOQUES = 4;
const VENTANA_TOQUES_MS = 1700;
const MAREO_MS = 2200;

export function Tenti({
  estado = 'reposo', tamano = 120, sigueCursor = true, sonido = false, interactivo = true,
  saludaAlAparecer = false, className, ref,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const despiertoHasta = useRef(0);
  const estadoRef = useRef(estado);
  const toques = useRef<number[]>([]);
  const mareadoHasta = useRef(0);
  const despertarRef = useRef<(ms?: number) => void>(() => {});

  // Montaje: el motor y su bucle de fotogramas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motor = new Motor(canvas, { mini: tamano < 64, sonido });
    motor.medir(tamano);
    motor.ponerEstado(estadoRef.current, { forzar: true, silencio: true });
    motorRef.current = motor;

    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let raf = 0;
    const despertar = (ms = 900) => { despiertoHasta.current = Math.max(despiertoHasta.current, performance.now() + ms); arrancar(); };
    const bucle = () => {
      raf = 0;
      if (!visible || document.hidden) return;
      motor.fotograma();
      if (!reducido.matches || performance.now() < despiertoHasta.current) raf = requestAnimationFrame(bucle);
    };
    function arrancar() { if (!raf) raf = requestAnimationFrame(bucle); }

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) arrancar(); });
    io.observe(canvas);
    const alVolver = () => { if (!document.hidden) arrancar(); };
    document.addEventListener('visibilitychange', alVolver);
    despertar(1200);
    if (saludaAlAparecer && !reducido.matches) motor.saludar();
    despertarRef.current = despertar;

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', alVolver);
      motor.destruir(); motorRef.current = null; despertarRef.current = () => {};
    };
    // El motor se crea una vez por tamaño; el resto de props se aplican abajo sin recrearlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tamano]);

  const despertar = (ms?: number) => despertarRef.current(ms);

  useEffect(() => { if (motorRef.current) motorRef.current.sonido = sonido; }, [sonido]);

  useEffect(() => {
    estadoRef.current = estado;
    if (performance.now() < mareadoHasta.current) return;
    motorRef.current?.ponerEstado(estado);
    despertar(1500);
  }, [estado]);

  // Los ojos siguen al cursor.
  useEffect(() => {
    if (!sigueCursor) return;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducido.matches) return;
    const mover = (e: PointerEvent) => {
      const c = canvasRef.current, m = motorRef.current; if (!c || !m) return;
      const r = c.getBoundingClientRect();
      m.mira.x = Math.tanh((e.clientX - (r.left + r.width / 2)) / 260);
      m.mira.y = -Math.tanh((e.clientY - (r.top + r.height / 2)) / 200);
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => window.removeEventListener('pointermove', mover);
  }, [sigueCursor]);

  useImperativeHandle(ref, () => ({
    emocion: (e) => { motorRef.current?.emocion(e); despertar(2000); },
    saludar: () => { motorRef.current?.saludar(); despertar(2000); },
  }), []);

  function tocar() {
    const m = motorRef.current; if (!m || !interactivo) return;
    const n = performance.now();
    toques.current = [...toques.current.filter((t) => n - t < VENTANA_TOQUES_MS), n];
    m.aplastar();
    if (toques.current.length >= MAREO_TRAS_TOQUES) {
      toques.current = [];
      mareadoHasta.current = n + MAREO_MS;
      m.ponerEstado('mareado');
      setTimeout(() => { mareadoHasta.current = 0; motorRef.current?.ponerEstado(estadoRef.current); despertar(1500); }, MAREO_MS);
      despertar(MAREO_MS + 300);
    } else if (toques.current.length >= 2) {
      m.emocion('molesto', 900);
      despertar(1200);
    } else despertar(800);
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={tocar}
      role="img"
      aria-label={`Tenti: ${ESTADOS[estado].etiqueta.toLowerCase()}`}
      className={className}
      style={{ width: tamano, height: tamano, cursor: interactivo ? 'pointer' : undefined, touchAction: 'manipulation' }}
    />
  );
}
