'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El tutorial de una pantalla (P1.1): 3–4 pasos sobre los controles REALES.
// Llega SIEMPRE con `dynamic()` desde `lib/tutorial-context.tsx` (lo vigila
// `lib/ayuda/tutoriales.test.ts`): nada de esto en el chunk inicial del panel.
//
// Como la visita guiada, no bloquea el panel: la máscara y el anillo son
// `pointer-events-none` y solo la tarjeta toma el ratón. A diferencia de ella,
// se puede saltar siempre («Saltar», Esc) y repetir con el «?».
//
//  · Accesible: `role="dialog"` NO modal, el título como nombre, «Paso 2 de 4:
//    …» anunciado, ← → entre pasos, Esc salta, Tab no sale de la tarjeta y al
//    cerrar el foco vuelve a donde estaba (el «?» si se abrió con él).
//  · Con «reducir movimiento», nada se anima.
//  · Si un control no aparece en 1,5 s, el paso se salta y se avisa a Sentry:
//    nunca una tarjeta señalando a la nada.
//  · Con un diálogo de la app abierto, la tarjeta se aparta sin perder el paso.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFoco } from '@/components/tour/foco';
import { capturarMensaje } from '@/lib/sentry-cliente';
import { PASOS_TUTORIAL, type TutorialPasos } from '@/lib/ayuda/tutoriales-pasos';
import type { RutaConTutorial } from '@/lib/ayuda/pantallas';
import type { ComoTermino } from '@/lib/ayuda/tutorial-progreso';

const ESPERA_OBJETIVO_MS = 1_500;
const MARGEN = 12;

export function TutorialDePantalla({ ruta, escritorio, onTerminar }: {
  ruta: RutaConTutorial;
  escritorio: boolean;
  /** `paso` es 1-based: en cuál se saltó (o el último, si se completó). */
  onTerminar: (como: ComoTermino, paso: number) => void;
}) {
  const tutorial: TutorialPasos = PASOS_TUTORIAL[ruta];
  // Un paso de un control que solo existe en pantalla ancha no se enseña en el móvil.
  const pasos = tutorial.pasos.filter(p => escritorio || !p.soloEscritorio);
  const [i, setI] = useState(0);
  const paso = pasos[i] ?? null;
  const ultimo = i === pasos.length - 1;
  const { rect, perdido, dialogo } = useFoco(paso?.selector ?? null, ESPERA_OBJETIVO_MS);
  const tarjeta = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Al cerrar, el foco vuelve a donde estaba (el «?», si se abrió con él).
  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { if (previo && document.contains(previo)) previo.focus(); };
  }, []);

  // El foco pasa a la tarjeta solo si nadie lo tenía: no se le roba a un campo.
  useEffect(() => {
    if (document.activeElement === document.body || document.activeElement === null) tarjeta.current?.focus();
  }, [i]);

  // Un control que no aparece: se salta el paso y se avisa (nunca en mudo).
  useEffect(() => {
    if (!perdido || !paso) return;
    capturarMensaje(`Tutorial: no se encontró «${paso.selector}»`, 'warning', { tags: { area: 'tutorial', pantalla: ruta } });
    if (ultimo) onTerminar('completado', i + 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reacciona al DOM: el control del paso no está en la página.
    else setI(n => n + 1);
  }, [perdido, paso, ultimo, i, ruta, onTerminar]);

  // Teclado: ← → entre pasos, Esc salta. `preventDefault` en Esc para que el
  // modo ampliado del panel (control-ampliado.tsx) no se salga a la vez.
  useEffect(() => {
    if (dialogo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const enCampo = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape') { e.preventDefault(); onTerminar('saltado', i + 1); return; }
      if (enCampo) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (ultimo) onTerminar('completado', i + 1); else setI(n => n + 1); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setI(n => n - 1); }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [dialogo, i, ultimo, onTerminar]);

  // Tab no sale de la tarjeta (y Mayús+Tab tampoco).
  function atrapar(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !tarjeta.current) return;
    const focables = [...tarjeta.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (focables.length === 0) return;
    const primero = focables[0], ultimoFocable = focables[focables.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === tarjeta.current)) { e.preventDefault(); ultimoFocable.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimoFocable) { e.preventDefault(); primero.focus(); }
  }

  // En escritorio, abajo a la derecha salvo que tape lo que se señala; entonces, arriba.
  useEffect(() => {
    const el = tarjeta.current;
    if (!el || !escritorio || dialogo) { setPos(null); return; }
    const alto = el.offsetHeight, ancho = el.offsetWidth;
    const W = window.innerWidth, H = window.innerHeight;
    const abajo = { top: H - alto - MARGEN, left: W - ancho - MARGEN };
    const arriba = { top: 76, left: W - ancho - MARGEN };
    const tapa = (c: { top: number; left: number }) => !!rect
      && c.left < rect.right + 12 && c.left + ancho > rect.left - 12 && c.top < rect.bottom + 12 && c.top + alto > rect.top - 12;
    const mejor = tapa(abajo) && !tapa(arriba) ? arriba : abajo;
    setPos(prev => (prev && prev.top === mejor.top && prev.left === mejor.left ? prev : mejor));
  }, [escritorio, rect, dialogo, i]);

  if (!paso) return null;
  // Con un diálogo de la app abierto, la tarjeta se aparta (el paso se conserva).
  if (dialogo) return null;

  const estilo: React.CSSProperties = escritorio
    ? (pos ? { top: pos.top, left: pos.left, width: 340 } : { right: 16, bottom: 16, width: 340 })
    : { left: 8, right: 8, bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 8px)', maxHeight: '45dvh' };

  return (
    <>
      {rect && (
        <div aria-hidden data-testid="tutorial-anillo" className="pointer-events-none fixed inset-0 z-[44]">
          <div
            className="absolute rounded-xl transition-all duration-200 motion-reduce:transition-none"
            style={{
              top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16,
              boxShadow: '0 0 0 9999px color-mix(in oklab, var(--t-ink-950) 55%, transparent)',
              outline: '2px solid var(--t-border-focus)', outlineOffset: 2,
            }}
          />
        </div>
      )}
      <div
        ref={tarjeta} tabIndex={-1} onKeyDown={atrapar}
        data-visita data-testid="tutorial-tarjeta"
        role="dialog" aria-modal="false" aria-labelledby={idTitulo}
        style={estilo}
        className={cn(
          'fixed z-[45] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl outline-none',
          'animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none',
        )}
      >
        {/* Lo que oye un lector de pantalla al cambiar de paso. */}
        <p className="sr-only" aria-live="polite">{`Paso ${i + 1} de ${pasos.length}: ${paso.titulo}`}</p>
        <p className="font-mono text-[11px] text-muted-foreground" aria-hidden>{i + 1} de {pasos.length}</p>
        <h2 id={idTitulo} className="mt-1 text-[15px] font-bold leading-snug text-foreground text-balance">{paso.titulo}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{paso.texto}</p>

        {ultimo && tutorial.hazloConmigo && (
          <Link
            href={tutorial.hazloConmigo.href}
            onClick={() => onTerminar('completado', i + 1)}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 text-[13px] font-semibold text-foreground hover:bg-muted"
          >
            {tutorial.hazloConmigo.texto} <ArrowRight size={13} aria-hidden />
          </Link>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button" onClick={() => onTerminar('saltado', i + 1)}
            className="min-h-9 rounded-lg px-2 text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Saltar
          </button>
          <div className="flex items-center gap-1.5">
            {i > 0 && (
              <button
                type="button" onClick={() => setI(n => n - 1)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted"
              >
                <ArrowLeft size={12} aria-hidden /> Anterior
              </button>
            )}
            <button
              type="button" onClick={() => (ultimo ? onTerminar('completado', i + 1) : setI(n => n + 1))}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background hover:opacity-90"
            >
              {ultimo ? 'Listo' : <>Siguiente <ArrowRight size={13} aria-hidden /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
