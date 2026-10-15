'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio»: la tarjeta de la home nueva (panel nuevo,
// 14-oct-2026). Es la lista de Bonsai («Mis primeros pasos», b-02): seis tareas
// con un verbo y una línea de para qué, un progreso «N de 6» y, en la siguiente,
// el botón para hacerla. Sustituye en la home nueva a la lista de arranque y a
// «Preparemos tu apertura»: una sola guía, no tres.
//
// Qué está hecho lo dicen los datos (`primerosPasos` sobre `calcularOnboarding`),
// nunca un clic. Ocultarla usa el mismo sello que la lista de siempre
// (`studios.onboarding_descartado_en`), así que no vuelve a salir ninguna de las
// dos. Solo la pinta la home para quien puede ver /primeros-pasos.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ExternalLink, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding, datosOnboardingDelEstudio } from '@/lib/onboarding';
import { primerosPasos, type TareaConEstado } from '@/lib/guia/primeros-pasos';
import { cn } from '@/lib/utils';
import { DEGRADADO_LOGO, BOTON_DESTACADO } from '@/components/dashboard/vivo';
import { SOPORTE_WHATSAPP } from '@/components/layout/whatsapp-fab';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { WhatsAppIcon } from '@/components/icons/brand-icons';

export function PrimerosPasosTarjeta() {
  const {
    studio, updateStudio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal, dataLoaded, datosIncompletos,
  } = useStudio();
  const [ocultando, setOcultando] = useState(false);
  const [fallo, setFallo] = useState(false);
  // La hora de entrar, una vez: el render no puede leer el reloj (react-hooks/purity).
  const [alMontar] = useState(() => Date.now());

  // Con la carga a medias, una lista vacía no quiere decir «no lo tiene».
  if (!studio || !dataLoaded || datosIncompletos.length > 0 || studio.onboardingDescartadoEn) return null;

  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  });
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  const soporte = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${studio.nombre ?? 'mi estudio'} y estoy poniendo en marcha Tentare:`);
  const terminado = p.siguiente === null;
  const pct = Math.round((p.hechas / p.total) * 100);

  async function ocultar() {
    if (ocultando) return;
    setOcultando(true);
    setFallo(false);
    const res = await Promise.resolve(updateStudio({ onboardingDescartadoEn: new Date().toISOString() })).catch(() => ({ ok: false }));
    if ((res as { ok?: boolean } | undefined)?.ok === false) setFallo(true);
    setOcultando(false);
  }

  const botonOcultar = (
    <button
      type="button"
      onClick={ocultar}
      disabled={ocultando}
      aria-label="Ocultar «Pon en marcha tu estudio»"
      className="-m-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-card/70 hover:text-foreground disabled:opacity-50"
    >
      <X size={16} />
    </button>
  );

  if (terminado) {
    // La enhorabuena es para el estreno, no un cartel fijo: un estudio que ya
    // trabaja no necesita que se le diga cada mañana que está listo.
    const dias = studio.creadoEn ? (alMontar - Date.parse(studio.creadoEn)) / 86_400_000 : Infinity;
    if (!(dias <= 30)) return null;
    return (
      <section aria-label="Tu estudio está listo" className="relative overflow-hidden rounded-t-card border border-border p-5 shadow-t-card sm:p-6" style={{ backgroundImage: FONDO_BANNER }}>
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: 'var(--cat-2)', boxShadow: '0 10px 22px -12px var(--cat-2)' }} aria-hidden>
            <Check size={22} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold leading-tight text-foreground">Tu estudio está listo para recibir reservas</h2>
            <p className="mt-1.5 text-[13.5px] text-foreground/75 text-pretty">
              Has hecho los seis pasos. Comparte tu página donde ya te buscan: Instagram, Google o el grupo de WhatsApp de tus alumnas.
            </p>
            {studio.slug && (
              <a href={`/reservar/${studio.slug}`} target="_blank" rel="noreferrer" className={cn(BOTON_DESTACADO, 'mt-4 h-10 px-4 text-[13.5px]')}>
                Ver mi página de reservas <ExternalLink size={14} aria-hidden />
              </a>
            )}
            {fallo && <p className="mt-2 text-[12px] text-destructive">No se ha podido ocultar. Inténtalo otra vez.</p>}
          </div>
          {botonOcultar}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="primeros-pasos-titulo" data-testid="primeros-pasos" className="overflow-hidden rounded-t-card border border-border bg-card shadow-t-card">
      {/* El banner, como el «Pon en marcha tu negocio, te enseñamos cómo» de Bonsai. */}
      <div className="relative overflow-hidden px-5 pb-5 pt-5 sm:px-6 sm:pb-6" style={{ backgroundImage: FONDO_BANNER }}>
        <div className="absolute right-3 top-3 z-20">{botonOcultar}</div>
        <div className="relative z-10 sm:max-w-[62%]">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-foreground/65">Primeros pasos</p>
          <h2 id="primeros-pasos-titulo" className="mt-1 pr-8 text-[22px] font-bold leading-tight text-foreground text-balance sm:pr-0">
            Pon en marcha tu estudio, te enseñamos cómo
          </h2>
          <p className="mt-1.5 text-[13.5px] text-foreground/75 text-pretty">
            Seis pasos hasta tu primera reserva. Se marcan solos en cuanto están hechos.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-card/70"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={p.total}
              aria-valuenow={p.hechas}
              aria-label="Tu progreso"
            >
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, 5)}%`, backgroundImage: DEGRADADO_LOGO }} />
            </div>
            <p className="shrink-0 text-[13px] font-semibold text-foreground tabular-nums">{p.hechas} de {p.total}</p>
          </div>
          {p.siguiente && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {soporte && (
                <a
                  href={soporte}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-card/85 px-4 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-card"
                >
                  <WhatsAppIcon size={16} /> Escríbenos por WhatsApp
                </a>
              )}
            </div>
          )}
          {fallo && <p className="mt-2 text-[12px] text-destructive">No se ha podido ocultar. Inténtalo otra vez.</p>}
        </div>
        <Ilustracion />
      </div>

      <ol className="divide-y divide-muted border-t border-border">
        {p.tareas.map((t, i) => (
          <FilaTarea key={t.id} tarea={t} numero={i + 1} siguiente={p.siguiente?.id === t.id} />
        ))}
        <FilaTarea tarea={p.opcional} numero={null} siguiente={false} />
      </ol>
    </section>
  );
}

function FilaTarea({ tarea, numero, siguiente }: { tarea: TareaConEstado; numero: number | null; siguiente: boolean }) {
  return (
    <li className={cn('relative flex items-center gap-3 px-5 py-3.5 sm:px-6', siguiente && 'bg-[color-mix(in_srgb,var(--t-blue-500)_7%,var(--card))]')}>
      {/* El círculo: hecho, el que toca o pendiente. */}
      <span
        aria-hidden
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full font-t-mono text-[12px]',
          tarea.hecha
            ? 'text-white'
            : siguiente
              ? 'text-white'
              : 'border-2 border-border text-muted-foreground',
        )}
        style={tarea.hecha ? { backgroundColor: 'var(--cat-2)' } : siguiente ? { backgroundImage: DEGRADADO_LOGO } : undefined}
      >
        {tarea.hecha ? <Check size={14} /> : numero}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[14px] font-semibold', tarea.hecha ? 'text-muted-foreground line-through decoration-1' : 'text-foreground')}>
          {tarea.titulo}
          {tarea.opcional && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle font-t-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">Opcional</span>
          )}
          <span className="sr-only">{tarea.hecha ? ' (hecho)' : siguiente ? ' (lo siguiente)' : ' (pendiente)'}</span>
        </p>
        {!tarea.hecha && <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">{tarea.para}</p>}
      </div>
      {!tarea.hecha && (
        <div className="flex shrink-0 items-center gap-1.5">
          {siguiente && tarea.otro && (
            <Link
              href={tarea.otro.href}
              className="hidden h-8 items-center rounded-full border border-border px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              {tarea.otro.label}
            </Link>
          )}
          {siguiente ? (
            <Link
              href={tarea.href}
              className={cn(BOTON_DESTACADO, 'h-8 px-3.5 text-[12.5px]')}
            >
              Empezar <ArrowRight size={13} aria-hidden />
            </Link>
          ) : (
            <Link
              href={tarea.href}
              aria-label={tarea.titulo}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground after:absolute after:inset-0"
            >
              <ArrowRight size={15} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

const FONDO_BANNER =
  'linear-gradient(120deg, color-mix(in srgb, var(--t-blue-500) 22%, var(--card)) 0%, color-mix(in srgb, var(--t-magenta-500) 16%, var(--card)) 100%)';

/**
 * El dibujo del banner, hecho con piezas de Tentare (como Bonsai dibuja con las
 * suyas): una clase que se llena y el aviso de una reserva nueva. Decorativo.
 */
function Ilustracion() {
  const alumnas: [string, string][] = [['MG', 'var(--t-blue-500)'], ['LM', 'var(--t-magenta-500)'], ['CR', 'var(--cat-2)']];
  return (
    <div aria-hidden className="pointer-events-none absolute -right-2 top-1/2 hidden h-[170px] w-[250px] -translate-y-1/2 select-none sm:block">
      {/* Destellos */}
      <span className="absolute right-6 top-1 h-1.5 w-6 rotate-[-35deg] rounded-full bg-card/90" />
      <span className="absolute right-1 top-6 h-1.5 w-4 rounded-full bg-card/90" />
      <span className="absolute right-11 top-[-2px] h-1.5 w-3 rotate-[-70deg] rounded-full bg-card/90" />
      {/* La clase */}
      <div className="absolute left-4 top-6 w-[190px] rotate-[-4deg] rounded-2xl bg-card p-3 shadow-[0_18px_40px_-18px_rgba(34,42,51,.45)]">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--t-magenta-500)' }} />
          <span className="text-[12px] font-bold text-foreground">Reformer</span>
          <span className="ml-auto font-t-mono text-[11px] text-muted-foreground">10:00</span>
        </div>
        <div className="mt-2.5 flex items-center">
          {alumnas.map(([ini, c], i) => (
            <span key={ini} className="flex size-7 items-center justify-center rounded-full text-[9.5px] font-bold text-white ring-2 ring-card" style={{ backgroundColor: c, marginLeft: i ? -6 : 0 }}>{ini}</span>
          ))}
          <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">+3</span>
          <span className="ml-auto text-[11px] font-bold text-foreground">6/8</span>
        </div>
        <div className="mt-2.5 flex gap-1">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={i < 6 ? { backgroundImage: DEGRADADO_LOGO } : { backgroundColor: 'var(--muted)' }} />
          ))}
        </div>
      </div>
      {/* El aviso */}
      <div className="absolute bottom-3 left-0 flex rotate-[3deg] items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-3 shadow-[0_14px_30px_-14px_rgba(34,42,51,.5)]">
        <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: 'var(--cat-2)' }}>
          <Check size={13} strokeWidth={3} />
        </span>
        <span className="text-[11.5px] font-bold text-foreground">Nueva reserva</span>
      </div>
    </div>
  );
}
