'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Un explicador (componente 16 del estudio de Bonsai): un concepto contado paso
// a paso con un caso concreto, un dibujo esquemático a la izquierda y el texto a
// la derecha. Llega SIEMPRE con `dynamic()` (lo vigila `explicadores.test.ts`).
//
//  · Modal de verdad (`Dialog` de base-ui: atrapa el foco). Se abre con el foco
//    en «Siguiente» (no en «Saltar»: un Intro lo daba por visto) y, al cerrar,
//    el foco vuelve a `focoAlCerrar` (el enlace «¿Qué es…?»).
//  · ← → entre pasos (→ en el último no cierra); Esc lo cierra como «saltado».
//  · «Paso 2 de 5: …» anunciado al cambiar de paso; el dibujo va `aria-hidden`.
//  · Los botones no se mueven entre pasos: alto mínimo fijo en pantallas
//    anchas, y en el móvil el pie se queda pegado abajo.
//  · Con «reducir movimiento», el dibujo no hace el fundido.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EXPLICADORES, type IdExplicador } from '@/lib/ayuda/explicadores';
import type { ComoTermino } from '@/lib/ayuda/tutorial-progreso';
import { DIBUJOS } from './dibujos';

export function ExplicadorIlustrado({ id, abierto, onTerminar, focoAlCerrar }: {
  id: IdExplicador;
  abierto: boolean;
  onTerminar: (como: ComoTermino) => void;
  focoAlCerrar?: RefObject<HTMLElement | null>;
}) {
  const e = EXPLICADORES[id];
  const [i, setI] = useState(0);
  const idTitulo = useId();
  const siguienteRef = useRef<HTMLButtonElement>(null);
  const total = e.pasos.length;
  const ultimo = i === total - 1;
  const paso = e.pasos[i];
  const Dibujo = DIBUJOS[paso.dibujo];

  // Cada vez que se abre, desde el principio.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Volver al primer paso al reabrir.
    if (abierto) setI(0);
  }, [abierto]);

  const siguiente = () => (ultimo ? onTerminar('completado') : setI(i + 1));

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) onTerminar(ultimo ? 'completado' : 'saltado'); }}>
      <DialogContent
        className="max-w-[min(calc(100%-2rem),44rem)] gap-0 p-0 sm:grid-cols-[220px_1fr]"
        aria-labelledby={idTitulo}
        data-testid="explicador"
        initialFocus={siguienteRef}
        finalFocus={focoAlCerrar ?? true}
        onKeyDown={ev => {
          if (ev.key === 'ArrowRight' && !ultimo) { ev.preventDefault(); setI(i + 1); }
          else if (ev.key === 'ArrowLeft' && i > 0) { ev.preventDefault(); setI(i - 1); if (i === 1) siguienteRef.current?.focus(); }
        }}
      >
        <div className="flex h-28 items-center justify-center rounded-t-xl bg-muted/60 p-3 sm:h-auto sm:rounded-l-xl sm:rounded-tr-none sm:p-4">
          <div key={i} className="h-full w-full animate-in fade-in-0 duration-150 motion-reduce:animate-none">
            {Dibujo()}
          </div>
        </div>
        <div className="flex min-w-0 flex-col sm:min-h-[26rem]">
          <div className="flex-1 p-5 pb-3">
            <DialogTitle id={idTitulo} className="pr-8 text-[13px] font-medium text-muted-foreground">{e.titulo}</DialogTitle>
            <p className="sr-only" aria-live="polite">{`Paso ${i + 1} de ${total}: ${paso.titulo}`}</p>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground" aria-hidden>Paso {i + 1} de {total}</p>
            <h3 className="mt-1 text-[16px] font-semibold leading-snug text-foreground text-balance">{paso.titulo}</h3>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              {paso.lineas.map(l => <li key={l} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />{l}</li>)}
            </ul>

            {ultimo && (
              <div className="mt-4 rounded-lg border border-border p-3" data-testid="explicador-recetas">
                <p className="text-[12px] font-semibold text-foreground">En una línea</p>
                <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted-foreground">
                  {e.recetas.map(r => <li key={r}>{r}</li>)}
                </ul>
                <p className="mt-2 text-[12px] text-muted-foreground"><span className="font-medium text-foreground">Dónde está:</span> {e.dondeVive}</p>
              </div>
            )}
          </div>

          {/* En el móvil, pegado abajo: con el último paso, el texto empujaba los botones fuera de la vista. */}
          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-popover px-5 py-3 sm:static sm:border-t-0 sm:pt-0">
            <div className="flex items-center gap-1.5" aria-hidden>
              {e.pasos.map((_, k) => <span key={k} className={cn('size-1.5 rounded-full', k === i ? 'bg-foreground' : 'bg-muted-foreground/40')} />)}
            </div>
            <div className="flex items-center gap-1.5">
              {!ultimo && (
                <Button variant="ghost" onClick={() => onTerminar('saltado')} className="px-2 text-muted-foreground max-lg:h-10">Saltar</Button>
              )}
              {/* En el primer paso, presente pero invisible: el foco no se pierde al volver del 2 al 1, y nada se mueve. */}
              <Button
                variant="outline"
                // Al volver al primero se queda invisible: el foco pasa a «Siguiente».
                onClick={() => { setI(i - 1); if (i === 1) siguienteRef.current?.focus(); }}
                className={cn('max-lg:h-10', i === 0 && 'invisible')} tabIndex={i === 0 ? -1 : undefined} aria-hidden={i === 0 || undefined}
              >
                <ArrowLeft data-icon="inline-start" aria-hidden /> Anterior
              </Button>
              <Button ref={siguienteRef} onClick={siguiente} className="max-lg:h-10">
                {ultimo ? 'Entendido' : <>Siguiente <ArrowRight data-icon="inline-end" aria-hidden /></>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
