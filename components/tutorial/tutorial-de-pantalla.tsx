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
//  · Accesible: `role="dialog"` NO modal (no atrapa el Tab: la pantalla de
//    debajo sigue siendo suya), el título como nombre y «Paso 2 de 4: …»
//    anunciado. Con el «?», el foco entra en la tarjeta; al cerrar, vuelve.
//  · ← → y Esc, SOLO con el foco en la tarjeta o en ningún sitio: en un campo,
//    unas pestañas, unos chips o el reordenado por teclado, las teclas son de
//    la página (Esc en el buscador de Clientas saltaba el tutorial).
//  · Con «reducir movimiento», nada se anima.
//  · La tarjeta no sale hasta que el control está: nunca señalando a la nada.
//    Si no aparece en 6 s, el paso se salta y se avisa a Sentry; si estaba y se
//    va (otra pestaña, otra vista), la persona se ha movido: se cierra sin más.
//  · Con un diálogo de la app abierto, la tarjeta se aparta sin perder el paso.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFoco } from '@/components/tour/foco';
import { capturarMensaje } from '@/lib/sentry-cliente';
import { PASOS_TUTORIAL, hazloConmigoPara, pasosVisibles } from '@/lib/ayuda/tutoriales-pasos';
import type { RutaConTutorial } from '@/lib/ayuda/pantallas';
import type { ComoTermino } from '@/lib/ayuda/tutorial-progreso';
import { useTutorial, type OrigenTutorial } from '@/lib/tutorial-context';
import { usePermisos } from '@/lib/permisos';
import { puedeMoverDinero } from '@/lib/permisos-reglas';

// La sección de Configuración llega aparte (`dynamic()`, con su esqueleto): en
// un móvil con la red lenta, 1,5 s se comían pasos que solo estaban cargando.
const ESPERA_OBJETIVO_MS = 6_000;
const MARGEN = 16;
/** Bajo la barra de arriba del panel. */
const ARRIBA = 76;

export function TutorialDePantalla({ ruta, escritorio, origen, onTerminar, onCerrar }: {
  ruta: RutaConTutorial;
  escritorio: boolean;
  origen: OrigenTutorial;
  /** `paso` es 1-based: en cuál se saltó (o el último, si se completó). */
  onTerminar: (como: ComoTermino, paso: number) => void;
  /** Cerrar sin anotar nada: la persona se ha ido a otra parte. */
  onCerrar: () => void;
}) {
  const { rol } = usePermisos();
  const contexto = useTutorial();
  const quien = { escritorio, moverDinero: puedeMoverDinero(rol) };
  const pasos = pasosVisibles(PASOS_TUTORIAL[ruta], quien);
  const hazloConmigo = hazloConmigoPara(PASOS_TUTORIAL[ruta], quien);
  const [i, setI] = useState(0);
  // Si cambia el ancho y quedan menos pasos (un iPad que gira), se queda en el último que hay.
  const idx = Math.min(i, Math.max(0, pasos.length - 1));
  const paso = pasos[idx] ?? null;
  const ultimo = idx === pasos.length - 1;
  const { rect, perdidoDe, desaparecidoDe, dialogo } = useFoco(paso?.selector ?? null, ESPERA_OBJETIVO_MS, !escritorio);
  const tarjeta = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const [arriba, setArriba] = useState(false);
  const hayControl = rect !== null;

  // Sin ningún paso para esta persona en este ancho, no hay nada que enseñar.
  useEffect(() => {
    if (!paso) onCerrar();
  }, [paso, onCerrar]);

  // Al cerrar, el foco vuelve a donde estaba (el «?», si se abrió con él).
  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { if (previo && document.contains(previo)) previo.focus(); };
  }, []);

  // El foco entra en la tarjeta si se abrió con el «?» (quien lo pulsó la está
  // esperando) o si nadie lo tenía; nunca se le roba a quien está escribiendo.
  useEffect(() => {
    if (!hayControl) return;
    const activo = document.activeElement;
    if (origen === 'boton' || activo === document.body || activo === null) tarjeta.current?.focus();
  }, [idx, hayControl, origen]);

  // Un control que no aparece: se salta el paso y se avisa (nunca en mudo). Si
  // era el último, no se ha visto entero: cuenta como saltado, no completado.
  useEffect(() => {
    if (!paso || perdidoDe !== paso.selector) return;
    capturarMensaje(`Tutorial: no se encontró «${paso.selector}»`, 'warning', { tags: { area: 'tutorial', pantalla: ruta } });
    if (ultimo) onTerminar('saltado', idx + 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reacciona al DOM: el control del paso no está en la página.
    else setI(idx + 1);
  }, [perdidoDe, paso, ultimo, idx, ruta, onTerminar]);

  // Estaba y se fue: la persona cambió de pestaña o de vista. No es un fallo.
  useEffect(() => {
    if (paso && desaparecidoDe === paso.selector) onCerrar();
  }, [desaparecidoDe, paso, onCerrar]);

  // Teclado: ← → entre pasos, Esc salta. Solo con el foco en la tarjeta o en
  // ningún sitio (ver la cabecera). El modo ampliado del panel no se sale con
  // Esc mientras haya un `role="dialog"` visible, como esta tarjeta.
  useEffect(() => {
    if (dialogo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const activo = document.activeElement;
      const libre = !activo || activo === document.body || !!tarjeta.current?.contains(activo);
      if (!libre) return;
      if (e.key === 'Escape') { e.preventDefault(); onTerminar('saltado', idx + 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (ultimo) onTerminar('completado', idx + 1); else setI(idx + 1); }
      else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); setI(idx - 1); }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [dialogo, idx, ultimo, onTerminar]);

  // En escritorio, abajo a la derecha salvo que tape lo que se señala; entonces,
  // arriba. Anclada por su borde (`bottom` o `top`), así que cambiar de paso
  // con otra altura no la hace saltar; y antes de pintar, sin un fotograma fuera de sitio.
  useLayoutEffect(() => {
    const el = tarjeta.current;
    if (!el || !escritorio || !rect) return;
    const alto = el.offsetHeight, ancho = el.offsetWidth;
    const izquierda = window.innerWidth - ancho - MARGEN;
    const tapa = (top: number) =>
      izquierda < rect.right + 12 && izquierda + ancho > rect.left - 12 && top < rect.bottom + 12 && top + alto > rect.top - 12;
    const mejorArriba = tapa(window.innerHeight - alto - MARGEN) && !tapa(ARRIBA);
    setArriba(prev => (prev === mejorArriba ? prev : mejorArriba));
  }, [escritorio, rect, idx]);

  // Con un diálogo de la app abierto, la tarjeta se aparta (el paso se conserva);
  // sin el control todavía, no se enseña.
  if (!paso || dialogo || !rect) return null;

  const estilo: React.CSSProperties = escritorio
    ? { right: MARGEN, width: 340, ...(arriba ? { top: ARRIBA } : { bottom: MARGEN }) }
    : { left: MARGEN, right: MARGEN, bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 8px)', maxHeight: '45dvh' };
  const siguiente = () => (ultimo ? onTerminar('completado', idx + 1) : setI(idx + 1));

  return (
    <>
      <div aria-hidden data-testid="tutorial-anillo" className="pointer-events-none fixed inset-0 z-[44]">
        {/* Sin transición: al hacer scroll, una animación dejaba el hueco detrás del control. */}
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16,
            boxShadow: '0 0 0 9999px color-mix(in oklab, var(--t-ink-950) 55%, transparent)',
            outline: '2px solid var(--t-border-focus)', outlineOffset: 2,
          }}
        />
      </div>
      <div
        ref={tarjeta} tabIndex={-1}
        data-visita data-testid="tutorial-tarjeta"
        role="dialog" aria-modal="false" aria-labelledby={idTitulo}
        style={estilo}
        className={cn(
          'fixed z-[45] overflow-y-auto rounded-t-card border border-border bg-card p-4 shadow-t-floating outline-none',
          // En el móvil y la tableta, ancho legible y centrada (en el móvil ocupa todo el ancho igual).
          'max-lg:mx-auto max-lg:max-w-md',
          'animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none',
        )}
      >
        {/* Lo que oye un lector de pantalla al cambiar de paso. */}
        <p className="sr-only" aria-live="polite">{`Paso ${idx + 1} de ${pasos.length}: ${paso.titulo}`}</p>
        <p className="font-mono text-[11px] text-muted-foreground" aria-hidden>{idx + 1} de {pasos.length}</p>
        <h2 id={idTitulo} className="mt-1 text-[15px] font-bold leading-snug text-foreground text-balance">{paso.titulo}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{paso.texto}</p>

        {ultimo && hazloConmigo && contexto && (
          // Abre el formulario de siempre de esta pantalla con un ejemplo en gris:
          // nada se guarda hasta que se pulse «Crear» (lib/ayuda/ejemplos.ts).
          <Button
            variant="outline"
            onClick={() => { contexto.pedirEjemplo(hazloConmigo.ejemplo); onTerminar('completado', idx + 1); }}
            className="mt-3 w-full max-lg:h-10"
          >
            {hazloConmigo.texto} <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        )}

        <div className={cn('mt-3 flex items-center gap-2', ultimo ? 'justify-end' : 'justify-between')}>
          {/* En el último paso sobra: «Listo» ya lo cierra. */}
          {!ultimo && (
            <Button
              variant="ghost" onClick={() => onTerminar('saltado', idx + 1)}
              className="-ml-2 px-2 text-muted-foreground underline underline-offset-2 max-lg:h-10"
            >
              Saltar
            </Button>
          )}
          <div className="flex items-center gap-1.5">
            {idx > 0 && (
              <Button variant="outline" onClick={() => setI(idx - 1)} className="max-lg:h-10">
                <ArrowLeft data-icon="inline-start" aria-hidden /> Anterior
              </Button>
            )}
            <Button onClick={siguiente} className="max-lg:h-10">
              {ultimo ? 'Listo' : <>Siguiente <ArrowRight data-icon="inline-end" aria-hidden /></>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
