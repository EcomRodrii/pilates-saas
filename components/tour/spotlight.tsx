'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTour } from '@/lib/tour-context';
import { PASOS_TOUR } from '@/lib/tour-pasos';
import { useStudio } from '@/lib/studio-context';

// Overlay + tarjeta del tour guiado. Se monta UNA vez en DashboardShell,
// fuera del árbol de cada página — cada página solo pone un atributo
// `data-tour="..."` en su bloque principal (ver lib/tour-pasos.ts), cero
// import de lógica de tour en esas páginas.
//
// Mismo z-index/estilo de capa que DialogOverlay (components/ui/dialog.tsx):
// `fixed inset-0 z-50`, para no inventar una convención nueva.
export function Spotlight() {
  const { activo, pasoActual, totalPasos, siguientePaso, pasoAnterior, saltarTour } = useTour();
  const { studio, updateStudio } = useStudio();
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const intentosRef = useRef(0);

  const paso = activo ? PASOS_TOUR[pasoActual] : null;

  // Registro histórico de "ya lo vio" — de equipo, no de navegador (mismo
  // campo aunque abra el tour otra persona del mismo estudio en otro
  // dispositivo). No bloquea nada: el botón sigue disponible siempre para
  // repetirlo, esto solo deja constancia.
  function marcarVisto() {
    if (studio && !studio.tourVistoEn) updateStudio({ tourVistoEn: new Date().toISOString() });
  }
  function terminar() { marcarVisto(); siguientePaso(); }
  function saltar() { marcarVisto(); saltarTour(); }

  // Si el tour está activo pero la ruta actual no es la del paso, navega ahí.
  useEffect(() => {
    if (paso && pathname !== paso.ruta) router.push(paso.ruta);
  }, [paso, pathname, router]);

  // Una vez en la ruta correcta, localiza el elemento real y sigue su
  // posición (resize, scroll). Si tras varios intentos no aparece —rol sin
  // acceso a esa pantalla, o la página tarda en montar tras la navegación—
  // se salta el paso solo: nunca se deja un overlay flotando sin objetivo.
  useEffect(() => {
    setRect(null);
    intentosRef.current = 0;
    if (!paso || pathname !== paso.ruta) return;

    let vivo = true;
    function medir() {
      if (!vivo || !paso) return;
      const el = document.querySelector(`[data-tour="${paso.selector}"]`);
      if (el) {
        setRect(el.getBoundingClientRect());
        return;
      }
      intentosRef.current += 1;
      if (intentosRef.current > 30) { siguientePaso(); return; }
      requestAnimationFrame(medir);
    }
    medir();

    function actualizar() {
      if (!paso) return;
      const el = document.querySelector(`[data-tour="${paso.selector}"]`);
      if (el) setRect(el.getBoundingClientRect());
    }
    window.addEventListener('resize', actualizar);
    window.addEventListener('scroll', actualizar, true);
    return () => {
      vivo = false;
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('scroll', actualizar, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, pathname]);

  if (!paso || !rect) return null;

  const pad = 8;
  const arriba = rect.top > 220;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label={`Tour guiado: ${paso.titulo}`}>
      {/* Máscara oscura con un hueco recortado sobre el elemento real —
          box-shadow inset, sin dependencia nueva. */}
      <div
        className="absolute rounded-xl transition-all duration-200 pointer-events-none"
        style={{
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          outline: '2px solid var(--brand-secondary)', outlineOffset: 2,
        }}
      />
      <div
        className="absolute rounded-2xl border border-border bg-card p-4 shadow-lg w-[300px] animate-in fade-in-0 zoom-in-95"
        style={{
          left: Math.min(Math.max(rect.left, 16), window.innerWidth - 316),
          top: arriba ? rect.top - pad - 8 : rect.bottom + pad + 8,
          transform: arriba ? 'translateY(-100%)' : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold text-foreground">{paso.titulo}</p>
          <button onClick={saltar} aria-label="Saltar tour" className="shrink-0 p-1 -m-1 rounded-lg hover:bg-muted transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1.5">{paso.descripcion}</p>
        <div className="flex items-center justify-between gap-2 mt-3">
          <p className="text-[11px] text-muted-foreground">{pasoActual + 1} de {totalPasos}</p>
          <div className="flex items-center gap-1.5">
            {pasoActual > 0 && (
              <button onClick={pasoAnterior} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors">
                <ArrowLeft size={12} /> Anterior
              </button>
            )}
            <button onClick={pasoActual + 1 === totalPasos ? terminar : siguientePaso} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
              {pasoActual + 1 === totalPasos ? 'Terminar' : 'Siguiente'} <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
