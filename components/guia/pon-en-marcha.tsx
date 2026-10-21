'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» del ALTA NUEVA (PR-5, maqueta aprobada del
// 21-oct-2026, «08 · El panel después»): la tarjeta del Resumen, y las piezas
// que comparte con la píldora de la barra y la hoja del móvil
// (primeros-pasos-flotante.tsx).
//
//   · Cinco tareas que se marcan SOLAS con datos reales y «Paso n de 5» con su
//     barra (lib/guia/primeros-pasos.ts, `primerosPasosAltaNueva`).
//   · Guía en orden (fundador, 21-oct): la primera sin hacer es la que se
//     ofrece, con su botón y «Omitir»; al quedar hecha, se ofrece la siguiente.
//   · Opcionales aparte, plegados: marca, Stripe, datos fiscales, equipo, las
//     otras sedes (solo si dijo «Varias») y la visita guiada completa, que se
//     abre de aquí (decisión D3) y que no cuenta: no hay dato que diga que se vio.
//   · «¿Te ayudamos?»: una persona del equipo por WhatsApp (decisión D5), sin
//     Tenti (soporte: «te responde una persona, no un robot»).
//   · Hechas las cinco, «Tu estudio está en marcha», con la lista plegada.
//
// Ocultarla usa el mismo sello que la lista de siempre
// (`studios.onboarding_descartado_en`).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Flag, Play, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useTour } from '@/lib/tour-context';
import { cn } from '@/lib/utils';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import { EVENTO_RECORRIDO } from '@/lib/guia/recorrido';
import { avisoAlCompartir } from '@/lib/alta/estado';
import type { PrimerosPasosAltaNueva, TareaAltaConEstado } from '@/lib/guia/primeros-pasos';
import { WhatsAppIcon } from '@/components/icons/brand-icons';
import { BOTON_DESTACADO, Baldosa, DEGRADADO_LOGO, fondoTenido } from '@/components/dashboard/vivo';
import { usePonEnMarcha } from './use-pon-en-marcha';

// El diálogo de compartir trae el cartel del QR: solo cuando se abre.
const CompartirEnlace = dynamic(() => import('./compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

/** Abre el recorrido rápido otra vez (lo escucha components/guia/recorrido-rapido.tsx). */
export function verRecorridoOtraVez() {
  window.dispatchEvent(new Event(EVENTO_RECORRIDO));
}

// ── Las piezas compartidas ───────────────────────────────────────────────────

/** «Paso 2 de 5 · Ya casi está» y la barra. */
export function ProgresoAlta({ pasos }: { pasos: PrimerosPasosAltaNueva }) {
  const pct = Math.round((pasos.hechas / pasos.total) * 100);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
        <b className="text-[15px] font-semibold text-foreground" data-testid="paso-de-cinco">{pasos.paso}</b>
        <span>{pasos.queda}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Primeros pasos"
        aria-valuemin={0}
        aria-valuemax={pasos.total}
        aria-valuenow={pasos.hechas}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%`, backgroundImage: DEGRADADO_LOGO }} />
      </div>
    </>
  );
}

/** Las cinco tareas. `alNavegar`: quien la pinta en un menú o una hoja la cierra al ir a otra pantalla. */
export function ListaTareasAlta({ pasos, onCompartir, onOmitir, alNavegar, compacta = false }: {
  pasos: PrimerosPasosAltaNueva;
  onCompartir: () => void;
  onOmitir: (id: string) => void;
  alNavegar?: () => void;
  compacta?: boolean;
}) {
  return (
    <ol className={cn('grid gap-1', compacta ? 'mt-3' : 'mt-4')} data-testid="tareas-alta">
      {pasos.tareas.map((t, i) => (
        <FilaTarea key={t.id} tarea={t} numero={i + 1} onCompartir={onCompartir} onOmitir={onOmitir} alNavegar={alNavegar} compacta={compacta} />
      ))}
    </ol>
  );
}

function BotonAccion({ tarea, onCompartir, alNavegar, principal }: {
  tarea: TareaAltaConEstado; onCompartir: () => void; alNavegar?: () => void; principal: boolean;
}) {
  const a = tarea.accion!;
  const clase = principal
    ? cn(BOTON_DESTACADO, 'h-9 px-4 text-[13px]')
    : 'zona-tactil inline-flex items-center gap-0.5 rounded-full px-2 py-1.5 text-[13px] font-medium text-[color:var(--t-text-link)] hover:bg-muted';
  const contenido = principal ? a.label : <>Ir<ArrowRight size={14} aria-hidden /></>;
  const etiqueta = principal ? undefined : `${tarea.titulo}: ir`;
  if ('abre' in a) {
    return <button type="button" onClick={onCompartir} className={clase} aria-label={etiqueta}>{contenido}</button>;
  }
  return <Link href={a.href} onClick={alNavegar} className={clase} aria-label={etiqueta}>{contenido}</Link>;
}

function FilaTarea({ tarea, numero, onCompartir, onOmitir, alNavegar, compacta }: {
  tarea: TareaAltaConEstado; numero: number; onCompartir: () => void; onOmitir: (id: string) => void; alNavegar?: () => void; compacta: boolean;
}) {
  const ahora = tarea.estado === 'ahora';
  const hecha = tarea.estado === 'hecha';
  return (
    <li
      data-tarea={tarea.id}
      data-estado={tarea.estado}
      className={cn(
        'grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-2xl p-2.5 transition-colors',
        !compacta && 'sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-center',
        ahora && 'bg-card shadow-t-card ring-1 ring-[color:color-mix(in_srgb,var(--warning)_28%,transparent)]',
        hecha && 'opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-[26px] items-center justify-center rounded-full font-t-mono text-[11px]',
          hecha ? 'text-[color:var(--card)]' : ahora ? 'text-[color:var(--warning)]' : 'text-muted-foreground',
        )}
        style={hecha
          ? { backgroundColor: 'var(--success)' }
          : { boxShadow: `inset 0 0 0 1.5px ${ahora ? 'var(--warning)' : 'var(--border)'}` }}
      >
        {hecha ? <Check size={13} strokeWidth={3} /> : numero}
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold leading-5 text-foreground">
          {tarea.titulo}
          <span className="sr-only">{hecha ? ' (hecho)' : ahora ? ' (lo siguiente)' : tarea.omitida ? ' (omitido)' : ' (pendiente)'}</span>
        </p>
        <p className="mt-px text-[13px] leading-[18px] text-muted-foreground text-pretty">{tarea.para}</p>
        {ahora && tarea.minutos ? <span className="font-t-mono text-[11.5px] text-muted-foreground">≈ {tarea.minutos} min</span> : null}
      </div>
      {/* Hecha, en una columna (móvil, menú, hoja) el círculo con su marca ya lo dice: sin fila de más. */}
      <div className={cn('col-start-2 flex flex-wrap items-center gap-2', !compacta && 'sm:col-start-3 sm:justify-end', hecha && (compacta ? 'hidden' : 'hidden sm:flex'), !hecha && !tarea.accion && 'hidden')}>
        {hecha ? (
          <span className="font-t-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground" aria-hidden>Hecho</span>
        ) : ahora && tarea.accion ? (
          <>
            <BotonAccion tarea={tarea} onCompartir={onCompartir} alNavegar={alNavegar} principal />
            {tarea.otro && (
              <Link href={tarea.otro.href} onClick={alNavegar} className="zona-tactil rounded-full px-2 py-1.5 text-[13px] font-medium text-[color:var(--t-text-link)] hover:bg-muted">
                {tarea.otro.label}
              </Link>
            )}
            <button
              type="button"
              onClick={() => onOmitir(tarea.id)}
              className="zona-tactil rounded-full px-2 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Omitir
            </button>
          </>
        ) : tarea.accion ? (
          <BotonAccion tarea={tarea} onCompartir={onCompartir} alNavegar={alNavegar} principal={false} />
        ) : null}
      </div>
    </li>
  );
}

/** «Opcionales, cuando quieras · n de m», plegados. La visita guiada se abre de aquí y no cuenta. */
export function OpcionalesAlta({ pasos, alNavegar }: { pasos: PrimerosPasosAltaNueva; alNavegar?: () => void }) {
  const { iniciarTour } = useTour();
  return (
    <details className="group mt-3 border-t border-border pt-2" data-testid="opcionales-alta">
      <summary className="zona-tactil flex cursor-pointer list-none items-center gap-2 rounded-[10px] px-1 py-1.5 text-[14px] font-medium text-foreground [&::-webkit-details-marker]:hidden">
        Opcionales, cuando quieras
        <span className="ml-auto font-t-mono text-[12px] text-muted-foreground">{pasos.opcionalesHechos} de {pasos.opcionales.length}</span>
        <ChevronDown size={16} aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="grid gap-0.5 pt-1">
        {pasos.opcionales.map(o => (
          <li key={o.id}>
            <Link
              href={o.href}
              onClick={alNavegar}
              className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 text-[13.5px] leading-[18px] text-foreground hover:bg-muted"
            >
              <span
                aria-hidden
                className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', o.hecha ? 'text-[color:var(--card)]' : 'border-[1.5px] border-dashed border-border')}
                style={o.hecha ? { backgroundColor: 'var(--success)' } : undefined}
              >
                {o.hecha && <Check size={11} strokeWidth={3} />}
              </span>
              <span className={cn('min-w-0 flex-1', o.hecha && 'text-muted-foreground')}>
                {o.titulo}<span className="sr-only">{o.hecha ? ' (hecho)' : ''}</span>
              </span>
              <span className="shrink-0 font-t-mono text-[11.5px] text-muted-foreground">{o.nota}</span>
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => { alNavegar?.(); iniciarTour(); }}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-2 text-left text-[13.5px] leading-[18px] text-foreground hover:bg-muted"
          >
            <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"><Play size={13} /></span>
            <span className="min-w-0 flex-1">Visita guiada completa</span>
            <span className="shrink-0 font-t-mono text-[11.5px] text-muted-foreground">10 capítulos</span>
          </button>
        </li>
      </ul>
    </details>
  );
}

/** Una persona por WhatsApp (decisión D5): «no un robot». */
export function AyudaPersona({ nombreEstudio, compacta = false }: { nombreEstudio: string | null | undefined; compacta?: boolean }) {
  const href = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${nombreEstudio || 'mi estudio'} y estoy poniendo en marcha Tentare:`);
  if (!href) return null;
  if (compacta) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[13.5px] font-semibold text-foreground hover:bg-muted">
        <WhatsAppIcon size={16} /> ¿Te atascas? Escríbenos por WhatsApp
      </a>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl bg-muted/60 px-4 py-3" data-testid="ayuda-persona">
      <div className="min-w-[12rem] flex-1">
        <p className="text-[14px] font-semibold text-foreground">¿Te ayudamos?</p>
        <p className="text-[13px] text-muted-foreground">Te responde una persona del equipo de Tentare, no un robot.</p>
      </div>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground hover:bg-muted">
        <WhatsAppIcon size={15} /> Escríbenos por WhatsApp
      </a>
    </div>
  );
}

// ── La tarjeta del Resumen ───────────────────────────────────────────────────

export function PonEnMarchaTarjeta() {
  const { studio, updateStudio } = useStudio();
  const { pasos, ocultada, creadoEn, omitir, estado } = usePonEnMarcha();
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const [ocultando, setOcultando] = useState(false);
  const [fallo, setFallo] = useState(false);
  // La hora de entrar, una vez: el render no puede leer el reloj (react-hooks/purity).
  const [alMontar] = useState(() => Date.now());

  if (!studio || !pasos || ocultada) return null;

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
      aria-label="Ocultar la lista"
      className="-m-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X size={16} />
    </button>
  );
  const errorOcultar = fallo && <p role="alert" className="mt-2 text-[12px] text-destructive">No se ha podido ocultar. Inténtalo otra vez.</p>;

  if (pasos.terminada) {
    // La enhorabuena es para el estreno, no un cartel fijo: un estudio que ya
    // trabaja no necesita que se le diga cada mañana que está en marcha.
    const dias = creadoEn ? (alMontar - Date.parse(creadoEn)) / 86_400_000 : Infinity;
    if (!(dias <= 30)) return null;
    return (
      <section aria-labelledby="pon-en-marcha-titulo" data-testid="pon-en-marcha" data-terminada="" className="rounded-t-card border p-5 shadow-t-card sm:p-6" style={fondoTenido('verde', 18)}>
        <div className="flex items-start gap-3">
          <Baldosa tono="verde" Icono={Check} tamano="sm" />
          <div className="min-w-0 flex-1">
            <h2 id="pon-en-marcha-titulo" className="text-[16px] font-semibold leading-tight text-foreground">Tu estudio está en marcha</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Has hecho los 5 primeros pasos. Lo que queda es opcional.</p>
          </div>
          {botonOcultar}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px] text-muted-foreground">
          <b className="text-[15px] font-semibold text-foreground" data-testid="paso-de-cinco">{pasos.paso}</b>
          <span>Opcionales: {pasos.opcionalesHechos} de {pasos.opcionales.length}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full w-full rounded-full" style={{ backgroundImage: DEGRADADO_LOGO }} />
        </div>
        <OpcionalesAlta pasos={pasos} />
        {errorOcultar}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="pon-en-marcha-titulo"
      data-testid="pon-en-marcha"
      className="rounded-t-card border p-5 shadow-t-card sm:p-6"
      style={{
        backgroundImage: 'linear-gradient(135deg, var(--card) 45%, color-mix(in srgb, var(--t-blue-500) 7%, var(--card)) 100%)',
        borderColor: 'color-mix(in srgb, var(--t-blue-500) 12%, var(--border))',
      }}
    >
      <div className="flex items-start gap-3">
        <Baldosa tono="magenta" Icono={Flag} tamano="sm" />
        <div className="min-w-0 flex-1">
          <h2 id="pon-en-marcha-titulo" className="text-[16px] font-semibold leading-tight text-foreground">
            <span data-recorrido="lista" className="inline-block">Pon en marcha tu estudio</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Lo que falta para abrir reservas, en orden. Se marca solo cuando lo haces.</p>
        </div>
        {botonOcultar}
      </div>
      <div className="mt-4">
        <ProgresoAlta pasos={pasos} />
      </div>
      <ListaTareasAlta pasos={pasos} onCompartir={() => setCompartirAbierto(true)} onOmitir={omitir} />
      <OpcionalesAlta pasos={pasos} />
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Play size={13} aria-hidden />
        <button type="button" onClick={verRecorridoOtraVez} className="font-medium text-[color:var(--t-text-link)] hover:underline">
          Ver el recorrido rápido otra vez
        </button>
      </p>
      <AyudaPersona nombreEstudio={studio.nombre} />
      {errorOcultar}
      {compartirAbierto && studio.slug && (
        <CompartirEnlace
          abierto
          onCerrar={() => setCompartirAbierto(false)}
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          esPropietaria
          avisoSinClase={avisoAlCompartir(estado)}
        />
      )}
    </section>
  );
}
