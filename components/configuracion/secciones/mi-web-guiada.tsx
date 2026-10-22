'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Clock, ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { hrefDeHerramienta, hrefDeTarjeta } from '@/lib/configuracion/destino';
import {
  ETIQUETA_PESO_WEB, pasosMiWeb, progresoMiWeb, type DatosMiWeb, type IdPasoMiWeb, type PasoMiWeb, type PesoPasoWeb,
} from '@/lib/configuracion/mi-web-pasos';
import { filaDePortada } from '@/lib/widgets/fila-portada';
import { conVistaPrevia } from '@/lib/widgets/integracion';
import { hrefCanal } from '@/lib/canales-estudio';
import { Interruptor } from '@/components/ui/interruptor';
import { BotonCopiar, useOrigen } from '@/components/configuracion/tab-estudio-enlaces';
import { useConstructorWidgets } from '@/components/widgets/usar-constructor';
import { usePublicarEnMiWeb } from '@/components/widgets/v2/usar-publicar-en-mi-web';

// «Mi web» guiada (maqueta aprobada por el fundador el 21-oct-2026, «Mi web — maqueta guiada»).
// Responde, antes de abrir nada, lo que la propietaria se pregunta: qué va primero, qué es
// imprescindible, qué ve quien llega a su página y a su web, si un cambio toca lo que ya tiene pegado
// en su web, si ha terminado y para qué sirve cada cosa. Los pasos y su estado salen de
// `lib/configuracion/mi-web-pasos.ts` (puro, con tests); aquí solo se pintan y se decide qué abre
// cada uno. Lo que abre cada paso es lo de siempre (el cajón de la dirección, la herramienta de
// widgets, el cajón de ocultar la página, el interruptor de Network): no se guarda nada en otro sitio.
// Widgets v2 no cambia por dentro.

export type AccionPasoWeb = { tipo: 'cajon'; abrir: () => void; texto: string } | { tipo: 'enlace'; href: string; texto: string };

const ESTILO_PESO: Record<PesoPasoWeb, string> = {
  imprescindible: 'bg-foreground text-background',
  recomendado: 'bg-muted text-foreground',
  opcional: 'border border-border text-muted-foreground',
};

const ESTILO_TONO = { hecho: 'text-success font-medium', falta: 'text-warning font-medium', nada: 'text-muted-foreground' } as const;

const BOTON = 'inline-flex h-10 shrink-0 items-center gap-1 self-start rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-center';

interface Comun {
  showToast: (m: string) => void;
  datos: Omit<DatosMiWeb, 'widgets'>;
  acciones: Record<Exclude<IdPasoMiWeb, 'network'>, AccionPasoWeb>;
  network: { on: boolean | null; onCambiar: (v: boolean) => Promise<string | null> };
}

/** Con dirección, lee los widgets (lo mismo que la portada de «Tus widgets»); sin ella, no hay widgets. */
export function MiWebGuiada(props: Comun) {
  const { studio } = useStudio();
  return studio?.slug
    ? <MiWebConWidgets {...props} slug={studio.slug} />
    : <VistaMiWeb {...props} slug={null} widgets={{ nombres: [], aviso: null }} pendiente={null} veResultados={false} />;
}

function MiWebConWidgets(props: Comun & { slug: string }) {
  const s = useConstructorWidgets({ slug: props.slug, showToast: props.showToast, textos: 'v2' });
  const barra = usePublicarEnMiWeb(s);
  // Lo más reciente arriba y el aviso de la primera fila que tenga uno: el mismo orden que la portada.
  const widgets = useMemo(() => {
    const filas = [...s.filasTienes].sort((a, b) => Date.parse(b.en) - Date.parse(a.en));
    const aviso = filas.map(f => filaDePortada(f, s.ahora).aviso).find(a => !!a) ?? null;
    return { nombres: filas.map(f => f.nombre), aviso: aviso?.texto ?? null };
  }, [s.filasTienes, s.ahora]);
  return <VistaMiWeb {...props} widgets={widgets} pendiente={barra.texto} veResultados={s.veResultados} />;
}

function VistaMiWeb({ datos: base, acciones, network, showToast, slug, widgets, pendiente, veResultados }: Comun & {
  slug: string | null;
  widgets: DatosMiWeb['widgets'];
  /** Lo que hay sin publicar en su web («Sin publicar en tu web: el estilo»). `null`: nada. */
  pendiente: string | null;
  veResultados: boolean;
}) {
  const datos: DatosMiWeb = { ...base, widgets };
  const pasos = pasosMiWeb(datos);
  const progreso = progresoMiWeb(pasos, datos);
  const origen = useOrigen();
  const urlPagina = slug ? `/reservar/${encodeURIComponent(slug)}` : null;
  const widgetsHref = hrefDeHerramienta('widgets');

  return (
    <div className="flex flex-col gap-6" data-testid="mi-web-guiada">
      {urlPagina && (
        <div className="flex flex-wrap items-start justify-end gap-2">
          <a href={urlPagina} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ExternalLink size={16} aria-hidden />Abrir mi página de reservas
          </a>
          {origen && <BotonCopiar texto={`${origen}${urlPagina}`} que="El enlace de la página de reservas" showToast={showToast} className="h-11" />}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <section aria-labelledby="mi-web-progreso" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="mi-web-progreso" className="text-lg font-semibold tracking-tight text-foreground">{progreso.titulo}</h3>
              <span className="font-mono text-[13px] text-muted-foreground" data-testid="mi-web-progreso">{progreso.hechos} de {progreso.total} pasos hechos</span>
            </div>
            <div
              role="progressbar" aria-label="Pasos hechos" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hechos}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(progreso.hechos / progreso.total) * 100}%` }} />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{progreso.frase}</p>

            <div className="flex flex-col gap-2.5 border-t border-border pt-3">
              <p className="text-[13px] font-semibold text-foreground">Qué está publicado ahora</p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Publicado titulo="Tu página de reservas" tono={datos.pagina ? (datos.pagina.oculta ? 'aviso' : 'ok') : 'neutro'}>
                  {pasos.find(p => p.id === 'quien-la-ve')!.estado}
                </Publicado>
                <Publicado titulo="Lo que tienes en tu web" tono={pendiente ? 'aviso' : 'neutro'} data-testid="mi-web-pendiente">
                  {pendiente ? (
                    <>
                      <span className="block [overflow-wrap:anywhere]">{pendiente}</span>
                      <Link href={widgetsHref} className="mt-1.5 inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background">Revisar y publicar en mi web</Link>
                    </>
                  ) : widgets && widgets.nombres.length > 0 ? 'Al día: no hay nada sin publicar' : 'Aún no has puesto nada'}
                </Publicado>
                <Publicado titulo="Tentare Network" tono={network.on ? 'ok' : 'neutro'}>
                  {network.on === null ? 'Mirando…' : network.on ? 'Apareces' : 'No apareces'}
                </Publicado>
              </div>
              <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Check size={14} className="text-success" aria-hidden />Todo lo demás se aplica al guardar: no hay nada más pendiente.
              </p>
            </div>
          </section>

          <ol className="flex flex-col gap-2.5" aria-label="Pasos de tu web">
            {pasos.map(p => (
              <FilaPaso key={p.id} paso={p}>
                {p.id === 'network' ? (
                  <InterruptorNetwork {...network} />
                ) : (
                  <BotonPaso accion={acciones[p.id]} />
                )}
              </FilaPaso>
            ))}
          </ol>

          {veResultados && slug && (
            <section aria-labelledby="mi-web-resultados" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="min-w-0 max-w-xl">
                <h3 id="mi-web-resultados" className="text-[15px] font-semibold text-foreground">Cómo le va a tu página</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">Visitas y reservas que te llegan desde tu web y tus enlaces. No es un paso: míralo cuando quieras.</p>
              </div>
              <Link href={`${widgetsHref}&vista=resultados`} className={BOTON}>Ver resultados<ChevronRight size={15} aria-hidden /></Link>
            </section>
          )}

          <section aria-labelledby="mi-web-otra-cosa" className="rounded-2xl border border-dashed border-border p-5">
            <h3 id="mi-web-otra-cosa" className="text-[15px] font-semibold text-foreground">¿Buscas otra cosa?</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              El <strong className="font-semibold text-foreground">enlace y el QR de la app de tus alumnas</strong> están en{' '}
              <Link href="/configuracion/apariencia?paso=instalar" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">Mi app → Compártela</Link>.
              Tu <strong className="font-semibold text-foreground">logo, tu color y tu lema</strong> también están en{' '}
              <Link href="/configuracion?tab=marca" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">Mi app</Link>: tu página de reservas los toma de allí.
              La <strong className="font-semibold text-foreground">dirección de tu web</strong> se cambia en{' '}
              <Link href={hrefDeTarjeta('contacto')} className="font-medium text-foreground underline underline-offset-2 hover:no-underline">Mi estudio → Contacto</Link>.
            </p>
          </section>
        </div>

        {urlPagina && <VistaPrevia url={urlPagina} />}
      </div>
    </div>
  );
}

function Publicado({ titulo, tono, children, ...resto }: {
  titulo: string;
  tono: 'ok' | 'aviso' | 'neutro';
  children: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div {...resto} className={cn('flex flex-col gap-1 rounded-xl border p-3', tono === 'aviso' ? 'border-warning/40 bg-warning/8' : 'border-border')}>
      <span className="text-[12px] text-muted-foreground">{titulo}</span>
      <span className={cn('flex items-start gap-1.5 text-[13px] font-medium', tono === 'ok' ? 'text-success' : tono === 'aviso' ? 'text-warning' : 'text-foreground')}>
        {tono !== 'neutro' && <span aria-hidden className={cn('mt-[6px] size-2 shrink-0 rounded-full', tono === 'ok' ? 'bg-success' : 'bg-warning')} />}
        <span className="min-w-0">{children}</span>
      </span>
    </div>
  );
}

function FilaPaso({ paso, children }: { paso: PasoMiWeb; children: React.ReactNode }) {
  return (
    <li
      // Network no tiene cajón: su ancla de siempre (`#network`, `hrefDeTarjeta`) lleva a su paso.
      id={paso.id === 'network' ? 'network' : `paso-${paso.id}`}
      data-paso={paso.id}
      data-hecho={paso.hecho ? '' : undefined}
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
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-foreground">
                <span className="sr-only">Paso {paso.orden}{paso.hecho ? ', hecho' : ''}: </span>{paso.titulo}
              </h3>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTILO_PESO[paso.peso])}>{ETIQUETA_PESO_WEB[paso.peso]}</span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{paso.porque}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Globe size={13} aria-hidden /><span><span className="sr-only">Dónde lo ve quien llega: </span>{paso.donde}</span></span>
              <span className="inline-flex items-center gap-1.5"><Clock size={13} aria-hidden /><span><span className="sr-only">Cuándo le llega: </span>{paso.cuando}</span></span>
            </div>
          </div>
          {children}
        </div>
        {/* Debajo y a todo el ancho de la tarjeta: al lado del botón, en la columna estrecha, no cabía. */}
        {paso.lineas && (
          <ul className="flex flex-col gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">
            {paso.lineas.map(l => (
              <li key={l.que} className="flex flex-col gap-0.5">
                <strong className="font-semibold text-foreground">{l.que}</strong><span className="text-pretty">{l.cuando}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={cn('text-[13px] [overflow-wrap:anywhere]', ESTILO_TONO[paso.tono])} data-estado-paso={paso.tono}>{paso.estado}</p>
        {paso.nota && <p className="-mt-1.5 text-[12px] leading-relaxed text-muted-foreground text-pretty">{paso.nota}</p>}
      </div>
    </li>
  );
}

function BotonPaso({ accion }: { accion: AccionPasoWeb }) {
  return accion.tipo === 'cajon' ? (
    <button type="button" aria-haspopup="dialog" onClick={accion.abrir} className={BOTON}>{accion.texto}<ChevronRight size={15} aria-hidden /></button>
  ) : (
    <Link href={accion.href} className={BOTON}>{accion.texto}<ChevronRight size={15} aria-hidden /></Link>
  );
}

/** El interruptor de Network: se guarda al tocarlo, como en la fila de antes, y solo con la fila confirmada. */
function InterruptorNetwork({ on, onCambiar }: Comun['network']) {
  const [pedido, setPedido] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function cambiar(v: boolean) {
    if (pedido !== null || on === null) return;
    setPedido(v);
    setError(null);
    try {
      const fallo = await onCambiar(v);
      if (fallo) setError(fallo);
    } catch {
      setError('No hemos podido hablar con el servidor');
    } finally {
      setPedido(null);
    }
  }
  return (
    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
      <Interruptor
        on={pedido ?? on ?? false}
        onChange={v => { void cambiar(v); }}
        ariaLabel="Aparecer en Tentare Network"
        disabled={on === null}
        ocupado={pedido !== null}
      />
      {error && <span role="alert" className="max-w-[16rem] text-[12px] font-medium text-destructive">{error}</span>}
    </div>
  );
}

/**
 * Su página de reservas de verdad, en un iframe: la entera, o el horario como sale dentro de su web
 * (`?embed=1`, lo mismo que pega un widget «dentro de una página»). Con `vista-previa=1`, como la
 * vista previa de los widgets, para que mirar no cuente como visita.
 */
function VistaPrevia({ url }: { url: string }) {
  const { studio } = useStudio();
  const origen = useOrigen();
  const [enTuWeb, setEnTuWeb] = useState(false);
  const web = hrefCanal('web', studio?.sitioWeb);
  const host = web ? web.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') : null;
  const src = conVistaPrevia(enTuWeb ? `${url}?embed=1` : url);
  const ANCHO = 390;
  const ALTO = 780;
  const ESCALA = 0.78;
  return (
    <aside aria-label="Así la ve quien llega" className="hidden flex-[1_1_300px] flex-col items-center gap-3 lg:sticky lg:top-24 lg:flex">
      <div className="flex w-full max-w-[320px] items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Así la ve quien llega</p>
        <div role="group" aria-label="Qué ver" className="inline-flex overflow-hidden rounded-lg border border-border text-[12px] font-semibold">
          <button type="button" aria-pressed={!enTuWeb} onClick={() => setEnTuWeb(false)} className={cn('h-8 px-2.5', !enTuWeb ? 'bg-foreground text-background' : 'bg-card text-foreground')}>Tu página</button>
          <button type="button" aria-pressed={enTuWeb} onClick={() => setEnTuWeb(true)} className={cn('h-8 px-2.5', enTuWeb ? 'bg-foreground text-background' : 'bg-card text-foreground')}>En tu web</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(34,42,51,0.08)]" style={{ width: ANCHO * ESCALA }}>
        <div className="flex h-8 items-center gap-1.5 border-b border-border bg-muted/60 px-3">
          <span aria-hidden className="size-2 rounded-full bg-border" />
          <span aria-hidden className="size-2 rounded-full bg-border" />
          <span className="ml-1.5 min-w-0 flex-1 truncate rounded-md bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {enTuWeb ? (host ?? 'Tu web') : `${origen.replace(/^https?:\/\//, '').replace(/^www\./, '')}${url}`}
          </span>
        </div>
        <div style={{ width: ANCHO * ESCALA, height: ALTO * ESCALA }}>
          <iframe
            key={src}
            title={enTuWeb ? 'Vista previa de tu horario dentro de tu web' : 'Vista previa de tu página de reservas'}
            src={src}
            className="origin-top-left bg-white"
            style={{ width: ANCHO, height: ALTO, border: 0, transform: `scale(${ESCALA})` }}
          />
        </div>
      </div>
      <p className="max-w-[300px] text-center text-xs leading-relaxed text-muted-foreground text-pretty">
        Es tu página de verdad, no un dibujo. «En tu web» enseña tu horario como sale dentro de una página de tu web, sin el diseño de tu web alrededor.
      </p>
    </aside>
  );
}
