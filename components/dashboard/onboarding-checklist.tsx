'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Rocket, X, Lightbulb } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { avisoVentaOnline, calcularOnboarding, datosOnboardingDelEstudio } from '@/lib/onboarding';
import { calcularProgresoGuia } from '@/lib/guia/progreso';
import { listaDeArranque } from '@/lib/onboarding/arranque';
import { nacioConTutoriales } from '@/lib/ayuda/tutorial-progreso';
import { cn } from '@/lib/utils';
import { usePermisos } from '@/lib/permisos';
import { puedeAbrirEnConfiguracion } from '@/lib/configuracion/destino';

// Resumen compacto para el dashboard — el asistente completo (categorías,
// ayuda contextual, enlaces) vive en su propia página, /primeros-pasos. Antes
// esto era una tarjeta-acordeón de 15 pasos en 5 categorías compitiendo por
// espacio con el resto del dashboard (KPIs, calendario, cobros); ahora es una
// tarjeta más, del mismo tamaño que las demás, con un botón hacia la guía
// completa.
//
// Lo único persistido es si se ha descartado: vive en el estudio
// (studio.onboardingDescartadoEn), no en localStorage — cada persona del
// equipo vería lo mismo si no, y antes se perdía al cambiar de navegador.
export function OnboardingChecklist() {
  const {
    studio, updateStudio, instructores, tiposClase, sesiones, socios,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal,
    reservas,
  } = useStudio();
  const { rol, puedeVer } = usePermisos();

  if (!studio || studio.onboardingDescartadoEn) return null;

  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal,
  });
  const { totalPasos, totalCompletados, categorias } = calcularOnboarding(datos);

  if (totalCompletados === totalPasos) return null;

  // ⚠️ EL MISMO NÚMERO QUE LA GUÍA. Esta tarjeta contaba los 10 pasos de
  // «Configuración inicial» (`calcularOnboarding().esencial`, incluidos
  // «Personaliza tu marca» y «Recibe tu primera reserva») y /primeros-pasos los
  // 7 de los capítulos «Para empezar» (`calcularProgresoGuia`). Una propietaria
  // leía «4 de 10» en el dashboard, pulsaba «Ver todos los pasos» y la guía le
  // decía «3 de 7 · te faltan 4» (evaluación del 13-sep). Ahora los dos salen
  // del mismo cálculo, así que no pueden volver a divergir.
  const progreso = calcularProgresoGuia(categorias);
  const pct = progreso.esencialPct;
  const listo = progreso.esencialTotal > 0 && progreso.esencialHechos === progreso.esencialTotal;
  const siguiente = progreso.siguientePaso;
  const aviso = avisoVentaOnline(datos);

  async function handleDismiss() {
    await updateStudio({ onboardingDescartadoEn: new Date().toISOString() });
  }

  // P1.4: un estudio NUEVO (y no una sede de cadena) ve la lista de arranque —
  // los mismos pasos y el mismo «N de M» de siempre, pintados como filas con su
  // check y su «Hacer», que lleva al sitio exacto (y ahí se abre su tutorial).
  // Ningún criterio cambia, y los estudios que ya trabajan ven la tarjeta de
  // siempre, idéntica (decisión conservadora del 12-oct-2026).
  if (nacioConTutoriales(studio.creadoEn) && !studio.cadenaId) {
    const filas = listaDeArranque(progreso);
    const primeraPendiente = filas.find(f => !f.done)?.id;
    // «Hacer» solo hacia donde este rol puede entrar: la pantalla (`puedeVer`) y,
    // en Configuración, la sección y la herramienta (recepción no abre Salas): la
    // misma regla que ⌘K. La app de las alumnas no es del panel: se abre aparte.
    const publica = (href: string) => href.startsWith('/portal/');
    const puedeIr = (href: string) => publica(href)
      || (puedeVer(href.split(/[?#]/)[0]) && puedeAbrirEnConfiguracion(rol ?? '', href));
    return (
      <div className="rounded-t-card border border-border bg-card p-4" data-testid="lista-arranque">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">{listo ? 'Tu estudio ya recibe reservas' : 'Tu estudio, listo para reservar'}</p>
            <p className="text-[11px] text-muted-foreground">{progreso.esencialHechos} de {progreso.esencialTotal} hechos</p>
          </div>
          <button
            onClick={handleDismiss} aria-label="Ocultar primeros pasos" title="Ocultar"
            className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden mt-3" aria-hidden>
          <div className="h-full rounded-full bg-brand-medio transition-all motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        {aviso && (
          <Link
            href="/configuracion?tab=conexiones#integracion-stripe"
            className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 transition-colors hover:bg-warning/15"
          >
            <AlertTriangle size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />
            <span className="text-[12px] leading-snug text-foreground">{aviso}</span>
          </Link>
        )}
        {!listo && (
          <ol className="mt-3 divide-y divide-border">
            {filas.map(f => (
              <li key={f.id} className="flex items-center gap-2.5 py-1.5">
                <span
                  className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', f.done ? 'border-success bg-success text-success-foreground' : 'border-muted-foreground/40')}
                  aria-hidden
                >
                  {f.done && <Check size={12} />}
                </span>
                <span className={cn('min-w-0 flex-1 text-[12.5px]', f.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground')}>
                  {f.label}
                  <span className="sr-only">{f.done ? ' · hecho' : ' · pendiente'}</span>
                </span>
                {!f.done && puedeIr(f.href) && (
                  <Link
                    href={f.href}
                    {...(publica(f.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={cn(
                      'inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-semibold transition-colors',
                      // El que toca ahora, destacado: seis «Hacer» iguales no dicen por dónde seguir.
                      f.id === primeraPendiente ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border text-foreground hover:bg-muted',
                    )}
                  >
                    Hacer<span className="sr-only">: {f.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
        <Link
          href="/primeros-pasos"
          className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-brand-medio hover:underline mt-3"
        >
          Ver todos los pasos <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand-secondary shrink-0">
            <Rocket size={16} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              {listo ? 'Tu estudio ya puede recibir reservas' : `Tu estudio está al ${pct}%`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {listo
                ? 'Lo esencial está hecho.'
                : `${progreso.esencialHechos} de ${progreso.esencialTotal} para poder recibir reservas`}
            </p>
          </div>
        </div>
        <button onClick={handleDismiss} aria-label="Ocultar primeros pasos" className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors" title="Ocultar">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
        <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Lo que hace falta saber antes de compartir el enlace: va encima del
          siguiente paso porque rompe justo lo que el titular promete. */}
      {aviso && (
        <Link
          href="/configuracion?tab=conexiones#integracion-stripe"
          className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 transition-colors hover:bg-warning/15"
        >
          <AlertTriangle size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />
          <span className="text-[12px] leading-snug text-foreground">{aviso}</span>
        </Link>
      )}

      {/* El siguiente paso concreto con su enlace, no un consejo. Antes aquí
          iba la recomendación más urgente («Vemos que todavía no has conectado
          Stripe»), que dice lo que falta pero no la lleva a hacerlo — y encima
          podía no ser el siguiente paso del camino. */}
      {siguiente && (
        <Link
          href={siguiente.href}
          className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <Lightbulb size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-foreground">{siguiente.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{siguiente.descripcion}</span>
          </span>
        </Link>
      )}

      <Link
        href="/primeros-pasos"
        className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-brand-secondary hover:underline mt-3"
      >
        Ver todos los pasos <ArrowRight size={14} />
      </Link>
    </div>
  );
}
