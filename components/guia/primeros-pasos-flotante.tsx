'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Primeros pasos», flotando abajo a la derecha en todo el panel nuevo, como el
// «Mis primeros pasos en Bonsai» (capturas b-02/b-03): el título, «Tu progreso
// N/6» con su barra y cada tarea con su círculo (verde con su tick si está
// hecha), su título y para qué sirve. Tocar una tarea lleva a hacerla.
//
// Las mismas cuentas que la tarjeta de la home (`PrimerosPasosTarjeta`): las
// tareas se marcan solas con los datos del estudio, nunca con un «Hecho» a mano.
// En la home no sale (allí está la tarjeta entera), ni cuando ya está todo hecho
// u ocultado desde la home. La X lo pliega a una píldora en este navegador; no
// lo oculta para siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronUp, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding, datosOnboardingDelEstudio } from '@/lib/onboarding';
import { primerosPasos } from '@/lib/guia/primeros-pasos';
import { cn } from '@/lib/utils';
import { DEGRADADO_LOGO } from '@/components/dashboard/vivo';

const CLAVE_PLEGADO = 'tentare-primeros-pasos-plegado';

function leerPlegado(): boolean {
  try { return localStorage.getItem(CLAVE_PLEGADO) === '1'; } catch { return false; }
}

export function PrimerosPasosFlotante() {
  const {
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal, dataLoaded, datosIncompletos,
  } = useStudio();
  const [plegado, setPlegado] = useState(leerPlegado);

  // Con la carga a medias, una lista vacía no quiere decir «no lo tiene».
  if (!studio || !dataLoaded || datosIncompletos.length > 0 || studio.onboardingDescartadoEn) return null;

  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  });
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  if (p.siguiente === null) return null;
  const pct = Math.round((p.hechas / p.total) * 100);

  function plegar(v: boolean) {
    setPlegado(v);
    try { localStorage.setItem(CLAVE_PLEGADO, v ? '1' : '0'); } catch { /* solo en esta pestaña */ }
  }

  // Encima del botón del asistente: un solo hueco abajo a la derecha, apilado.
  const sitio = 'fixed bottom-[5.5rem] right-6 z-40 hidden lg:block';

  if (plegado) {
    return (
      <button
        type="button"
        data-primeros-pasos=""
        onClick={() => plegar(false)}
        className={cn(sitio, 'whitespace-nowrap lg:inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground shadow-t-floating transition-colors hover:bg-muted')}
        aria-label={`Abrir «Primeros pasos»: ${p.hechas} de ${p.total} hechos`}
      >
        Primeros pasos · {p.hechas}/{p.total}
        <ChevronUp size={14} aria-hidden />
      </button>
    );
  }

  return (
    <section aria-labelledby="primeros-pasos-flotante" data-primeros-pasos="" className={cn(sitio, 'w-[310px] rounded-[16px] border border-border bg-card p-4 shadow-t-floating')}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="primeros-pasos-flotante" className="text-[16px] font-bold leading-tight text-foreground">Primeros pasos</h2>
        <button
          type="button"
          onClick={() => plegar(true)}
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

      <ol className="mt-3 max-h-[46vh] space-y-1 overflow-y-auto">
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
  );
}
