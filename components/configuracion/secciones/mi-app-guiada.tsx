'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Clock, ExternalLink, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hoyEnEstudio } from '@/lib/utils';
import { tarjetasEnLaApp } from '@/lib/student/descubre';
import {
  ETIQUETA_PESO, pasosMiApp, progresoMiApp, type DatosMiApp, type IdPasoMiApp, type PasoMiApp, type PesoPaso,
} from '@/lib/configuracion/mi-app-pasos';
import { MarcoIphone, PANTALLA_IPHONE, useEscalaIphone } from '@/components/ui/marco-iphone';
import { useStudio } from '@/lib/studio-context';

// «Mi app» guiada (maqueta aprobada por el fundador el 21-oct-2026, «Mi app — maqueta guiada»).
// Responde, antes de abrir nada, lo que la propietaria se pregunta: qué va primero, qué es
// imprescindible, dónde lo ve su alumna, cuándo le llega el cambio, si ha terminado y para qué
// sirve cada cosa. Los pasos y su estado salen de `lib/configuracion/mi-app-pasos.ts` (puro, con
// tests); aquí solo se pintan y se decide qué abre cada uno. Lo que cada paso abre es lo de siempre
// (el cajón del logo, el editor de Apariencia en su paso, Contenido de tu app…): no hay ningún
// sitio nuevo donde guardar nada.

/** Qué hace el botón de un paso: abrir su cajón aquí o ir a otra pantalla. */
export type AccionPaso = { tipo: 'cajon'; abrir: () => void; texto: string } | { tipo: 'enlace'; href: string; texto: string };

const ESTILO_PESO: Record<PesoPaso, string> = {
  imprescindible: 'bg-foreground text-background',
  recomendado: 'bg-muted text-foreground',
  opcional: 'border border-border text-muted-foreground',
  final: 'bg-success/12 text-success',
};

const ESTILO_TONO = { hecho: 'text-success font-medium', falta: 'text-warning font-medium', nada: 'text-muted-foreground' } as const;

// En un iPhone la app aparta la isla y el indicador con `env(safe-area-inset-*)`, que en un iframe
// valen 0: se le dan los del iPhone 17, como en el editor de Apariencia.
const MARGEN_IPHONE = 'html .student-app { --safe-top: 62px; --safe-bottom: 34px; }';

/** Qué pantalla de la app enseña el móvil mientras se mira un paso: donde sale lo que cambia. */
const RUTA_DEL_PASO: Partial<Record<IdPasoMiApp, string>> = { entrada: '/acceso', fotos: '/reservar' };

export function MiAppGuiada({ datos, acciones, slug, hrefPresentacion }: {
  datos: DatosMiApp;
  acciones: Record<IdPasoMiApp, AccionPaso | null>;
  slug: string | null;
  /** Dónde se edita la descripción. Hoy, su cajón de siempre; con «Mi web» guiada, el de Mi web. */
  hrefPresentacion: string;
}) {
  const pasos = useMemo(() => pasosMiApp(datos), [datos]);
  const progreso = progresoMiApp(pasos);
  const [mirando, setMirando] = useState<IdPasoMiApp | null>(null);
  const urlApp = slug ? `/portal/${encodeURIComponent(slug)}` : null;
  const compartir = acciones.compartir;

  return (
    <div className="flex flex-col gap-6" data-testid="mi-app-guiada">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {urlApp && (
            <a href={urlApp} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <ExternalLink size={16} aria-hidden />Abrir mi app
            </a>
          )}
          {compartir?.tipo === 'enlace' && (
            <Link href={compartir.href} className="inline-flex h-11 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              Compartir con mis alumnas
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <section aria-labelledby="mi-app-progreso" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="mi-app-progreso" className="text-lg font-semibold tracking-tight text-foreground">{progreso.titulo}</h3>
              <span className="font-mono text-[13px] text-muted-foreground" data-testid="mi-app-progreso">{progreso.hechos} de {progreso.total} pasos hechos</span>
            </div>
            <div
              role="progressbar" aria-label="Pasos hechos" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hechos}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(progreso.hechos / progreso.total) * 100}%` }} />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{progreso.frase}</p>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[13px]">
              {datos.sinPublicar ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-1 font-medium text-warning"><Clock size={13} aria-hidden />Cambios sin publicar en «Color y estilo»</span>
                  {acciones.estilo?.tipo === 'enlace' && (
                    <Link href={acciones.estilo.href} className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 font-semibold text-background">Revisar y publicar</Link>
                  )}
                  <span className="text-muted-foreground">Lo demás se aplica al momento.</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Check size={14} className="text-success" aria-hidden />Lo que ven tus alumnas es lo que tienes aquí: no hay nada pendiente de publicar.</span>
              )}
            </div>
          </section>

          <ol className="flex flex-col gap-2.5" aria-label="Pasos de tu app">
            {pasos.map(p => (
              <FilaPaso
                key={p.id}
                paso={p}
                accion={acciones[p.id]}
                onMirar={() => setMirando(p.id)}
              />
            ))}
          </ol>

          {/* Decisión 4 (21-oct-2026): la descripción sale en la página de reservas, no en la app. */}
          <aside className="rounded-2xl border border-dashed border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">¿Buscas «Cómo te presentas»?</p>
            <p className="mt-1 text-pretty">
              Tu descripción sale en tu página de reservas y en Tentare Network, no en la app de tus alumnas.{' '}
              <Link href={hrefPresentacion} className="font-medium text-foreground underline underline-offset-2 hover:no-underline">Editar tu descripción</Link>
            </p>
          </aside>
        </div>

        {urlApp && (
          <aside aria-label="Así la ven tus alumnas" className="hidden flex-[1_1_300px] flex-col items-center gap-3 lg:sticky lg:top-24 lg:flex">
            <p className="text-sm font-semibold text-foreground">Así la ven tus alumnas</p>
            <VistaApp url={urlApp} ruta={(mirando && RUTA_DEL_PASO[mirando]) ?? ''} />
            <p className="max-w-[300px] text-center text-xs leading-relaxed text-muted-foreground">
              Es tu app publicada, no un dibujo. Al pasar por un paso, el móvil va a la pantalla donde sale.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

function FilaPaso({ paso, accion, onMirar }: { paso: PasoMiApp; accion: AccionPaso | null; onMirar: () => void }) {
  const boton = 'inline-flex h-10 shrink-0 items-center gap-1 self-start rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-center';
  return (
    <li
      id={`paso-${paso.id}`}
      data-paso={paso.id}
      data-hecho={paso.hecho ? '' : undefined}
      onMouseEnter={onMirar}
      onFocus={onMirar}
      className="flex scroll-mt-32 gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5"
    >
      <span
        aria-hidden
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
          paso.hecho ? 'bg-success text-white' : 'border-2 border-border text-muted-foreground',
        )}
      >
        {paso.hecho ? <Check size={16} strokeWidth={3} /> : paso.orden}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-foreground">
              <span className="sr-only">Paso {paso.orden}{paso.hecho ? ', hecho' : ''}: </span>{paso.titulo}
            </h3>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTILO_PESO[paso.peso])}>{ETIQUETA_PESO[paso.peso]}</span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{paso.porque}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Smartphone size={13} aria-hidden /><span><span className="sr-only">Dónde lo ve: </span>{paso.donde}</span></span>
            <span className="inline-flex items-center gap-1.5"><Clock size={13} aria-hidden /><span><span className="sr-only">Cuándo le llega: </span>{paso.cuando}</span></span>
          </div>
          <p className={cn('text-[13px]', ESTILO_TONO[paso.tono])} data-estado-paso={paso.tono}>{paso.estado}</p>
        </div>
        {accion && (accion.tipo === 'cajon' ? (
          <button type="button" aria-haspopup="dialog" onClick={accion.abrir} className={boton}>{accion.texto}<ChevronRight size={15} aria-hidden /></button>
        ) : (
          <Link href={accion.href} className={boton}>{accion.texto}<ChevronRight size={15} aria-hidden /></Link>
        ))}
      </div>
    </li>
  );
}

function VistaApp({ url, ruta }: { url: string; ruta: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [cargando, setCargando] = useState(true);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- cambiar de pantalla monta un iframe nuevo: se funde.
  useEffect(() => { setCargando(true); }, [ruta]);
  const escala = useEscalaIphone(0.62, 220);
  function alCargar() {
    const doc = ref.current?.contentDocument;
    if (doc?.head && !doc.getElementById('mi-app-margen')) {
      const el = doc.createElement('style');
      el.id = 'mi-app-margen';
      el.textContent = MARGEN_IPHONE;
      doc.head.appendChild(el);
    }
    setCargando(false);
  }
  return (
    <MarcoIphone escala={escala} tinta="auto" indicador="auto">
      <iframe
        key={ruta}
        ref={ref}
        title="Vista previa de la app de tus alumnas"
        src={`${url}${ruta}`}
        onLoad={alCargar}
        className="bg-white transition-opacity duration-300"
        style={{ width: PANTALLA_IPHONE.ancho, height: PANTALLA_IPHONE.alto, border: 0, opacity: cargando ? 0.35 : 1 }}
      />
    </MarcoIphone>
  );
}

/** Los datos de la app que la pantalla guiada necesita y que viajan con el panel. El tema se lee aparte. */
export function useDatosMiApp(extra: Pick<DatosMiApp, 'favicon' | 'apariencia' | 'sinPublicar' | 'appEnTienda'>, ahoraMs: number): DatosMiApp | null {
  const { studio, dataLoaded, tiposClase, instructores, bannersPortal, contenidoPortal } = useStudio();
  return useMemo(() => {
    if (!dataLoaded || !studio) return null;
    const equipo = instructores.filter(i => i.activo && i.rol === 'INSTRUCTOR');
    return {
      ...extra,
      logo: !!studio.logoUrl,
      portada: !!studio.imagenBienvenidaUrl,
      titular: !!studio.tituloAcceso?.trim(),
      clases: { total: tiposClase.length, conFoto: tiposClase.filter(t => !!t.fotoUrl).length },
      equipo: { total: equipo.length, conFoto: equipo.filter(i => !!(i.fotoUrl ?? i.avatar)).length },
      tarjetasVisibles: ahoraMs > 0 ? tarjetasEnLaApp(bannersPortal, hoyEnEstudio(new Date(ahoraMs))).length : null,
      mensajeDestacado: !!contenidoPortal?.mensajeDestacado?.trim(),
      fraseAMano: !!studio.fraseManuscrita?.trim(),
      tieneDireccion: !!studio.slug,
    };
  }, [dataLoaded, studio, tiposClase, instructores, bannersPortal, contenidoPortal, ahoraMs, extra]);
}
