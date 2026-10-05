'use client';

import { useEffect, useRef, useState } from 'react';
import { distanciaConResistencia, esTironVertical, sueltaYRecarga, UMBRAL_PX } from '@/lib/student/tirar-para-actualizar';
import { vibrar } from '@/lib/nativo/puente';

/**
 * Tirar hacia abajo desde arriba del todo para actualizar, como en cualquier app
 * de iOS. Llama al `refrescar()` que ya tiene la pantalla: sin esqueleto, y si
 * falla se queda lo que había (ver `useAsync`).
 *
 * Propio y diminuto a propósito, sin librería: escucha el dedo en el documento
 * y pinta un círculo con el color del estudio que baja con él.
 *
 * - Solo táctil: con ratón no hay `touchstart`, y además se mira
 *   `pointer: coarse` para no escuchar nada en escritorio.
 * - Solo si la página está arriba del todo y el gesto es vertical: pasar los
 *   días del horario de lado no recarga nada.
 * - No dentro de una hoja abierta (`#student-portal-host`): ahí tirar hacia
 *   abajo es cerrarla.
 * - Con `prefers-reduced-motion` el círculo no gira (lo apaga la regla global
 *   de student.css); sigue al dedo, que es un gesto suyo y no una animación.
 */
export function TirarParaActualizar({ onRefrescar }: { onRefrescar: () => Promise<unknown> | void }) {
  const [tiro, setTiro] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const refrescar = useRef(onRefrescar);
  useEffect(() => { refrescar.current = onRefrescar; }, [onRefrescar]);
  const ocupado = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
    let inicio: { x: number; y: number } | null = null;
    let decidido: boolean | null = null;
    let distancia = 0;
    let pasoUmbral = false;

    const alEmpezar = (e: TouchEvent) => {
      if (ocupado.current || e.touches.length !== 1 || window.scrollY > 0) { inicio = null; return; }
      const objetivo = e.target as Element | null;
      if (objetivo?.closest?.('#student-portal-host, [role="dialog"]')) { inicio = null; return; }
      inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      decidido = null;
      distancia = 0;
      pasoUmbral = false;
    };
    const alMover = (e: TouchEvent) => {
      if (!inicio) return;
      const dx = e.touches[0].clientX - inicio.x;
      const dy = e.touches[0].clientY - inicio.y;
      if (decidido === null && Math.hypot(dx, dy) > 6) decidido = esTironVertical(dx, dy);
      if (decidido === false || window.scrollY > 0) { inicio = null; distancia = 0; setTiro(0); return; }
      if (!decidido) return;
      distancia = distanciaConResistencia(dy);
      const pasa = sueltaYRecarga(distancia);
      // Un toque al cruzar la raya, como el de iOS: «si sueltas ahora, recarga».
      if (pasa && !pasoUmbral) void vibrar('suave');
      pasoUmbral = pasa;
      setTiro(distancia);
    };
    const alSoltar = () => {
      if (!inicio) return;
      inicio = null;
      if (!sueltaYRecarga(distancia)) { distancia = 0; setTiro(0); return; }
      distancia = 0;
      ocupado.current = true;
      setRefrescando(true);
      setTiro(UMBRAL_PX);
      void Promise.resolve()
        .then(() => refrescar.current())
        .catch(() => { /* la pantalla conserva lo que había */ })
        .finally(() => {
          ocupado.current = false;
          setRefrescando(false);
          setTiro(0);
        });
    };

    document.addEventListener('touchstart', alEmpezar, { passive: true });
    document.addEventListener('touchmove', alMover, { passive: true });
    document.addEventListener('touchend', alSoltar, { passive: true });
    document.addEventListener('touchcancel', alSoltar, { passive: true });
    return () => {
      document.removeEventListener('touchstart', alEmpezar);
      document.removeEventListener('touchmove', alMover);
      document.removeEventListener('touchend', alSoltar);
      document.removeEventListener('touchcancel', alSoltar);
    };
  }, []);

  const visible = tiro > 0 || refrescando;
  const progreso = Math.min(1, tiro / UMBRAL_PX);
  return (
    <>
      {refrescando && <span role="status" className="sr-only">Actualizando…</span>}
      <div
        aria-hidden
        data-testid="tirar-para-actualizar"
        style={{
          position: 'fixed', left: '50%', zIndex: 45, pointerEvents: 'none',
          top: 'calc(var(--header-height) + var(--safe-top) - 34px)',
          width: 34, height: 34, marginLeft: -17, borderRadius: 'var(--radius-round)',
          background: 'var(--card)', boxShadow: 'var(--shadow-card)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? Math.max(progreso, refrescando ? 1 : 0) : 0,
          transform: `translateY(${tiro}px)`,
          // Al soltar vuelve a su sitio con suavidad; mientras se tira, pegado al dedo.
          transition: tiro === 0 || refrescando ? 'transform .25s var(--ease), opacity .2s' : 'none',
        }}
      >
        <span
          style={{
            width: 16, height: 16, borderRadius: 'var(--radius-round)',
            border: '2px solid var(--accent)', borderRightColor: 'transparent',
            transform: refrescando ? undefined : `rotate(${progreso * 300}deg)`,
            animation: refrescando ? 'apSpin .7s linear infinite' : undefined,
          }}
        />
      </div>
    </>
  );
}
