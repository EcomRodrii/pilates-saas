'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «¿En qué te podemos ayudar?»: la pregunta de píldoras con la que acaba la
// configuración, antes de «Tus primeros pasos» (referencia medida en el admin de
// Shopify, 22-nov-2026: píldoras seleccionables de varias elecciones, «Continuar»
// y «Omitir» arriba a la derecha).
//
// No es decoración: lo que se elige se guarda en `studios.onb_prioridad`, la misma
// columna y las mismas opciones (`OPCIONES_FOCO`) que la pregunta del asistente de
// siempre, y es lo que `ordenarSeccionesHome` lee para subir esa sección en el
// Resumen. Opcional: «Omitir» no guarda nada y pasa a la siguiente pantalla. Si el
// guardado falla, se dice y NO se avanza como si hubiera salido.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { OPCIONES_FOCO } from '@/lib/onboarding/asistente-rapido';
import { CabeceraPaso, ErrorGuardado, LineaDePasos, NavPaso, FocoContext } from './piezas';
import { useContext } from 'react';

export function PasoFoco({ studio, onAtras, onListo }: { studio: Studio; onAtras: () => void; onListo: () => void }) {
  const { updateStudio } = useStudio();
  const { foco } = useContext(FocoContext);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [elegidas, setElegidas] = useState<string[]>(() => studio.onbPrioridad ?? []);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { titulo.current?.focus(); }, []);

  function alternar(opcion: string) {
    setError(null);
    setElegidas((e) => (e.includes(opcion) ? e.filter((x) => x !== opcion) : [...e, opcion]));
  }

  async function continuar(e?: React.FormEvent) {
    e?.preventDefault();
    if (ocupado) return;
    const igual = JSON.stringify(elegidas) === JSON.stringify(studio.onbPrioridad ?? []);
    if (elegidas.length === 0 || igual) { onListo(); return; }
    setOcupado(true);
    setError(null);
    const res = await updateStudio({ onbPrioridad: elegidas });
    setOcupado(false);
    if (!res.ok) { setError(`No hemos podido guardar tu respuesta. ${res.error ?? ''}`.trim()); return; }
    onListo();
  }

  return (
    <form noValidate onSubmit={continuar} className="mx-auto w-full max-w-[960px]">
      {!foco && <LineaDePasos actual={6} />}
      <CabeceraPaso
        etiqueta="Una última pregunta · opcional"
        titulo="¿En qué te podemos ayudar?"
        sub="Elige todo lo que quieras. Con esto subimos lo que más te importa en tu Resumen; lo puedes cambiar cuando quieras."
        masTarde={{ onClick: onListo, disabled: ocupado, texto: 'Omitir' }}
        tituloRef={titulo}
      />

      <fieldset className="mt-6 min-w-0">
        <legend className="sr-only">¿En qué te podemos ayudar?</legend>
        <div className="flex flex-wrap gap-2.5" data-testid="opciones-foco">
          {OPCIONES_FOCO.map((o) => {
            const on = elegidas.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => alternar(o)}
                className={cn(
                  'min-h-11 rounded-full px-5 text-[15px] font-medium transition-colors',
                  on ? 'bg-foreground text-background' : 'text-foreground ring-1 ring-inset ring-input hover:bg-muted',
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      </fieldset>

      <ErrorGuardado mensaje={error} />
      <NavPaso onAtras={onAtras} trabajando={ocupado} textoSiguiente="Continuar" />
    </form>
  );
}
