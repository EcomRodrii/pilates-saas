'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Primeros pasos» en el panel nuevo, como el «Mis primeros pasos en Bonsai»
// (capturas b-02/b-03): el título, «Tu progreso N/6» con su barra y cada tarea con
// su círculo (verde con su tick si está hecha), su título y para qué sirve. Tocar
// una tarea lleva a hacerla.
//
// Las mismas cuentas que la tarjeta de la home (`PrimerosPasosTarjeta`): las
// tareas se marcan solas con los datos del estudio, nunca con un «Hecho» a mano.
// En la home no sale (allí está la tarjeta entera), ni cuando ya está todo hecho
// u ocultado desde la home.
//
// ⚠️ Ya no FLOTA sobre la pantalla (15-oct-2026, decisión del fundador: «nunca tapa
// un formulario ni un botón»). Abierta de serie y fija abajo a la derecha, se comía
// el «Siguiente» de Widgets o el campo y el botón de «Contenido de tu app»; y una
// píldora fija también acababa sobre el botón «Editar» de la última fila de una
// tabla al hacer scroll. Un elemento fijo sobre el contenido siempre tapa algo.
// Ahora es una píldora EN LA BARRA DE ARRIBA, junto a la de la prueba gratuita
// (`PildoraPrueba`): la barra no deja pasar contenido por debajo de ella, y la
// lista es un menú que se abre al tocarla y se cierra con Esc, fuera o al cambiar de
// pantalla. NUNCA se abre sola. Tampoco sale mientras corre la visita guiada: no se
// abren dos cosas a la vez.
//
// Con el ALTA NUEVA (PR-5), la píldora es la de «Pon en marcha tu estudio», con
// sus cinco tareas (pildora-pon-en-marcha.tsx): un menú en escritorio y una hoja
// desde abajo en el móvil, como la maqueta. Quién ve cuál lo decide
// `useAltaNuevaPropia`; mientras se pregunta, ninguna.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useTour } from '@/lib/tour-context';
import { usePermisos } from '@/lib/permisos';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { calcularOnboarding, datosOnboardingDelEstudio } from '@/lib/onboarding';
import { primerosPasos } from '@/lib/guia/primeros-pasos';
import { cn } from '@/lib/utils';
import { DEGRADADO_LOGO } from '@/components/dashboard/vivo';
import { useAltaNuevaPropia } from './use-pon-en-marcha';
import { PildoraPonEnMarcha } from './pildora-pon-en-marcha';

/** `variante`: la barra de escritorio o la cabecera del móvil (las dos están montadas, una oculta). */
export function PrimerosPasosFlotante({ variante = 'escritorio' }: { variante?: 'escritorio' | 'movil' } = {}) {
  const alta = useAltaNuevaPropia();
  if (alta.activo === null) return null;
  if (alta.activo) return <PildoraPonEnMarcha variante={variante} />;
  return <PrimerosPasosDeSiempre />;
}

function PrimerosPasosDeSiempre() {
  const {
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal, dataLoaded, datosIncompletos,
  } = useStudio();
  const panelNuevo = usePanelNuevo();
  const { puedeVer } = usePermisos();
  const pathname = usePathname();
  const { activo: visitaEnMarcha } = useTour();
  // La pantalla donde la dueña la abrió: en otra, vuelve a estar recogida.
  const [abiertaEn, setAbiertaEn] = useState<string | null>(null);
  const abierta = abiertaEn === pathname;
  const caja = useRef<HTMLDivElement>(null);
  // Vive en la barra de escritorio y en la móvil (las dos montadas, una oculta): ids propios.
  const idMenu = useId();
  const idTitulo = useId();

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbiertaEn(null); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbiertaEn(null); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierta]);

  // La home tiene la tarjeta entera; el chat de Tentare ocupa toda la pantalla.
  if (!panelNuevo || pathname === '/dashboard' || pathname === '/asistente' || !puedeVer('/primeros-pasos')) return null;
  // Con la carga a medias, una lista vacía no quiere decir «no lo tiene».
  if (visitaEnMarcha || !studio || !dataLoaded || datosIncompletos.length > 0 || studio.onboardingDescartadoEn) return null;

  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal,
  });
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  if (p.siguiente === null) return null;
  const pct = Math.round((p.hechas / p.total) * 100);

  return (
    <div ref={caja} className="relative mr-1">
      <button
        type="button"
        data-primeros-pasos-pildora=""
        aria-expanded={abierta}
        aria-controls={idMenu}
        onClick={() => setAbiertaEn(abierta ? null : pathname)}
        aria-label={`Abrir «Primeros pasos»: ${p.hechas} de ${p.total} hechos`}
        className="zona-tactil inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="hidden sm:inline">Primeros pasos</span><span className="sm:hidden">Pasos</span> · {p.hechas}/{p.total}
        <ChevronDown size={14} aria-hidden className={cn('transition-transform', abierta && 'rotate-180')} />
      </button>

      {abierta && (
        <section
          id={idMenu}
          data-primeros-pasos-lista=""
          aria-labelledby={idTitulo}
          className="absolute right-0 top-full z-50 mt-2 w-[310px] rounded-[16px] border border-border bg-card p-4 shadow-t-floating"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id={idTitulo} className="text-[16px] font-bold leading-tight text-foreground">Primeros pasos</h2>
            <button
              type="button"
              onClick={() => setAbiertaEn(null)}
              aria-label="Plegar «Primeros pasos»"
              className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-3 rounded-[10px] bg-muted/60 px-3 py-2.5">
            <div className="flex items-center justify-between text-[13px] font-semibold text-foreground">
              <span>Tu progreso</span>
              <span className="tabular-nums">{p.hechas}/{p.total}</span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-card"
              role="progressbar"
              aria-valuenow={p.hechas}
              aria-valuemin={0}
              aria-valuemax={p.total}
              aria-label="Tu progreso"
            >
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%`, backgroundImage: DEGRADADO_LOGO }} />
            </div>
          </div>

          <ol className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
            {p.tareas.map(t => (
              <li key={t.id}>
                <Link
                  href={t.href}
                  className="group flex items-start gap-3 rounded-[10px] px-1.5 py-2 transition-colors hover:bg-muted/60"
                  aria-label={`${t.titulo}${t.hecha ? ' (hecho)' : ''}`}
                >
                  <span
                    aria-hidden
                    className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', t.hecha ? 'text-white' : 'bg-muted')}
                    style={t.hecha ? { backgroundColor: 'var(--success)' } : undefined}
                  >
                    {t.hecha && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[13.5px] font-semibold leading-snug', t.hecha ? 'text-muted-foreground' : 'text-foreground')}>{t.titulo}</span>
                    <span className="block text-[12px] leading-snug text-muted-foreground text-pretty">{t.para}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
