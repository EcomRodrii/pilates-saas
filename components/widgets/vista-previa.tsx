'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { anchoPopupDe, textoBotonEfectivo } from '@/lib/widgets/config';
import { conVistaPrevia, estiloBoton, urlEmbebido, urlPagina, type EntradaIntegracion } from '@/lib/widgets/integracion';
import { luminancia } from '@/lib/reservar/apariencia-widget';
import type { WidgetWeb } from '@/lib/reservar/estilo-web-tipos';
import { FOCO, Segmentado, TACTIL } from './piezas';

// La vista previa. ⚠️ El widget nunca es una imagen ni una maqueta: es el
// MISMO motor que verá la visitante —la página incrustada real en un iframe, o
// el componente real de la integración nativa— pintado al ancho REAL del
// dispositivo y escalado para caber en la columna. Un móvil es 390 px de
// verdad (con su maquetación de móvil), no la versión de escritorio encogida.
//
// Lo de ALREDEDOR sí es un dibujo: su dominio, su nombre y unos bloques grises
// en lugar del contenido de su web, sin inventar nada, para que vea dónde
// queda. Y el fondo es el color que ELLA dijo que tiene su web («¿Cómo es tu
// web?», en el estilo de sus widgets; o un diseño propio para una web oscura):
// con un widget que se funde, es lo que se ve a través. No hay un conmutador
// que pinte el lienzo sin cambiar el widget, que solo servía para confundir.
//
// Por debajo de las dos columnas (iPad en vertical, móvil) la previa va ANTES
// del paso: ahí se enseña recortada y con un solo marco, o el paso quedaba a
// 700-900 px de distancia. «Ver en grande» la despliega.

export type Dispositivo = 'escritorio' | 'movil';

const ANCHO: Record<Dispositivo, number> = { escritorio: 1200, movil: 390 };

/**
 * El ancho de la web dibujada. En «Ordenador», con un widget en una columna
 * (480) o una ventana encima (~720), una web de 1200 escalada a la columna de
 * la previa lo dejaba en ~210 px: ilegible, y casi igual que el móvil (medido
 * el 29-sep-2026, «no se diferencia entre ordenador y móvil» y «un marco blanco
 * al lado»). Alrededor de un widget estrecho se dibuja una ventana más justa
 * —sigue siendo una web de ordenador, con el widget en medio y aire a los
 * lados—; a todo el ancho, la de siempre.
 */
export function anchoLienzo(d: Dispositivo, anchoWidget: number | null): number {
  if (d === 'movil') return ANCHO.movil;
  return anchoWidget ? Math.min(ANCHO.escritorio, Math.max(760, anchoWidget + 280)) : ANCHO.escritorio;
}
// Sin que llegue nada del iframe en este tiempo, se dice y se ofrece otra vez.
const TARDA_MS = 20_000;

export type Contenido =
  | { tipo: 'iframe'; src: string; titulo: string; altoInicial: number; origen: string; slug: string }
  | { tipo: 'componente'; nodo: ReactNode };

/** Lo que se sabe de su web para dibujarla. */
export interface SuWeb {
  direccion: string | null;
  nombre: string;
  /** El color de su marca, para la inicial del dibujo. */
  color: string;
  /** El color del fondo de su web: el lienzo de la vista previa. */
  fondo: string;
}

const BLANCO = '#FFFFFF';

/** Sobre un fondo así, los bloques del dibujo y la letra van en claro. */
const esOscuro = (fondo: string) => (luminancia(fondo) ?? 1) < 0.2;

export type FormaPrevia =
  | { tipo: 'dentro' }
  /** Un botón en su web y, debajo, lo que se abre al pulsarlo. */
  | { tipo: 'boton'; boton: ReactNode; pista: string; alPulsar: string; abrePagina: boolean }
  | { tipo: 'enlace' };

export function VistaPrevia({ contenido, falta, forma, web, paginaDeReservas, anchoWidget, abrirEn, dispositivo, onDispositivo, noSigueElEstilo = null, alSeguirElEstilo = null }: {
  /** `null` cuando falta algo para poder enseñarlo (`falta`). */
  contenido: Contenido | null;
  falta: string | null;
  forma: FormaPrevia;
  web: SuWeb;
  /** La dirección de su página de reservas, para la barra del navegador. */
  paginaDeReservas: string;
  /** Ancho máximo del widget dentro de la web (`null` = todo el ancho). */
  anchoWidget: number | null;
  /** Para «Abrir en una pestaña»: la URL real (sin el marcador de previa). */
  abrirEn?: string;
  dispositivo: Dispositivo;
  onDispositivo: (d: Dispositivo) => void;
  /**
   * Lo que se ve NO cambia con el estilo de sus widgets (un diseño propio en su
   * código, o la página suelta del enlace): se dice encima de la previa, para
   * que elegir otro estilo y no ver nada no se lea como un fallo.
   */
  noSigueElEstilo?: string | null;
  /**
   * La salida, junto a la frase y no solo arriba de «Cómo se ve»: medido con el
   * vídeo del fundador (29-sep-2026), la previa es lo que se tiene a la vista
   * todo el rato, y el aviso con su botón quedaba por encima de «Estilo», fuera
   * de la pantalla mientras elegía. Lo encontró al final, en el interruptor de
   * abajo del todo.
   */
  alSeguirElEstilo?: (() => void) | null;
}) {
  const movil = dispositivo === 'movil';
  const [grande, setGrande] = useState(false);
  const widget = contenido
    ? <Lienzo ancho={anchoLienzo(dispositivo, anchoWidget)} anchoWidget={anchoWidget} dispositivo={dispositivo} contenido={contenido} />
    : <p className="flex min-h-48 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">{falta}</p>;

  return (
    <section aria-label="Vista previa" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-foreground">Así lo verá tu alumna</h3>
        <div className="flex items-center gap-1">
          <Segmentado
            etiqueta="Dispositivo de la vista previa"
            tamano="compacto"
            valor={dispositivo}
            onChange={onDispositivo}
            opciones={[
              { valor: 'escritorio', nombre: 'Ordenador', icono: <Monitor size={13} aria-hidden /> },
              { valor: 'movil', nombre: 'Móvil', icono: <Smartphone size={13} aria-hidden /> },
            ]}
          />
          {abrirEn && (
            <a
              href={abrirEn}
              target="_blank"
              rel="noopener"
              className={cn('inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground [@media(pointer:fine)]:size-9', FOCO)}
              aria-label="Abrir el widget en una pestaña nueva"
              title="Abrir en una pestaña nueva"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>

      {noSigueElEstilo && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
          <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-[12px] leading-snug text-foreground">
            <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <span className="min-w-0">{noSigueElEstilo}</span>
          </p>
          {alSeguirElEstilo && (
            <button
              type="button"
              onClick={alSeguirElEstilo}
              className={cn(TACTIL, 'shrink-0 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background hover:bg-foreground/90', FOCO)}
            >
              Que siga el estilo
            </button>
          )}
        </div>
      )}

      {forma.tipo === 'enlace' ? (
        <>
          <p className="text-[12px] text-muted-foreground">Al abrir el enlace, se abre tu página de reservas:</p>
          <Marco movil={movil} direccion={paginaDeReservas} fondo={BLANCO} recortado={!grande}>{widget}</Marco>
        </>
      ) : forma.tipo === 'boton' ? (
        <>
          <Marco movil={movil} direccion={web.direccion} fondo={web.fondo} recortado={!grande}>
            <CabeceraWeb web={web} movil={movil} />
            <div className="px-4 pb-6 pt-2">
              {forma.boton}
              <p className={cn('mt-2 text-[11.5px]', esOscuro(web.fondo) ? 'text-white/65' : 'text-black/55')}>{forma.pista}</p>
              <BloquesGrises oscura={esOscuro(web.fondo)} />
            </div>
          </Marco>
          {/* Lo que se abre al pulsar: en pequeño, solo si lo pide. El marco
              de la ventana es blanco fijo (app/widget-bundle/popup.ts), y la
              página suelta lleva su propio fondo: ninguno es su web. */}
          <div className={cn('space-y-3', !grande && 'hidden @4xl/config:block')}>
            <p className="text-[12px] text-muted-foreground">{forma.alPulsar}</p>
            <Marco movil={movil} direccion={forma.abrePagina ? paginaDeReservas : web.direccion} fondo={BLANCO} recortado={false}>{widget}</Marco>
          </div>
        </>
      ) : (
        <Marco movil={movil} direccion={web.direccion} fondo={web.fondo} recortado={!grande}>
          <CabeceraWeb web={web} movil={movil} />
          {widget}
        </Marco>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">
          El widget es el de verdad, con tus clases de hoy. Lo de alrededor es un dibujo de tu web para que veas cómo encaja.
        </p>
        <button
          type="button"
          aria-expanded={grande}
          onClick={() => setGrande(g => !g)}
          className={cn(TACTIL, 'shrink-0 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline @4xl/config:hidden', FOCO)}
        >
          {grande ? 'Verla más pequeña' : 'Ver en grande'}
        </button>
      </div>
    </section>
  );
}

/**
 * El botón tal cual saldrá en su web: mismos atributos y mismo estilo que el
 * código (`estiloBoton`). El del popup que sigue el estilo de sus widgets
 * (Fase D) se pinta con los LITERALES de `entrada.botonVivo`, que el
 * constructor le pasa con el estilo que está probando; sin variables, así que
 * la regla que pone /widget-popup.js en la página no lo toca (y con
 * `vista-previa=1` ni la pide). Con el popup, pulsarlo abre la ventana REAL —el
 * runtime público /widget-popup.js se carga en el panel igual que en su web—,
 * con el estilo de sus widgets que está probando si aún no lo ha aplicado
 * (`borradorWeb`); con el botón, lleva a la página de verdad, que se ve como su
 * app. Con el botón de su propia web (WordPress, Wix…) no sabemos cómo es: se
 * dibuja uno neutro y se dice.
 */
export function BotonEnTuWeb({ entrada, metodo, botonPropio, borradorWeb }: {
  entrada: EntradaIntegracion;
  metodo: 'popup' | 'boton';
  botonPropio: boolean;
  /** El estilo de sus widgets sin aplicar, para que la ventana lo enseñe. */
  borradorWeb?: WidgetWeb;
}) {
  const s = estiloBoton(entrada, metodo);
  const texto = textoBotonEfectivo(entrada.config, entrada.widget);
  useEffect(() => {
    if (metodo !== 'popup') return;
    const src = '/widget-popup.js';
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    document.body.appendChild(script);
  }, [metodo]);
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '10px 22px',
    fontWeight: 600, fontSize: 15, lineHeight: 1.2, textDecoration: 'none', cursor: 'pointer',
  };
  if (metodo === 'popup') {
    return (
      <button
        type="button"
        data-tentare-popup={conVistaPrevia(urlEmbebido(entrada, 'popup'), borradorWeb ? { borradorWeb } : undefined)}
        data-tentare-titulo={entrada.widget.nombre}
        data-tentare-ancho={anchoPopupDe(entrada.widget, entrada.config)}
        style={{ ...base, background: s.background, color: s.color, border: s.border, borderRadius: s.borderRadius }}
      >
        {texto}
      </button>
    );
  }
  return (
    <a
      href={conVistaPrevia(urlPagina(entrada))}
      target="_blank"
      rel="noopener"
      style={botonPropio ? base : { ...base, background: s.background, color: s.color, border: s.border, borderRadius: s.borderRadius }}
      className={botonPropio ? 'rounded-md bg-neutral-900 text-white' : undefined}
    >
      {texto}
    </a>
  );
}

function Marco({ movil, direccion, fondo, recortado, children }: {
  movil: boolean;
  direccion: string | null;
  fondo: string;
  /** Más bajo por debajo de las dos columnas (ver la cabecera). */
  recortado: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden border shadow-sm',
        movil ? 'mx-auto max-w-[430px] rounded-[28px] border-[6px] border-foreground/85' : 'rounded-xl border-border',
      )}
    >
      <div aria-hidden className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
        {!movil && (
          <>
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </>
        )}
        <span className={cn('flex h-6 min-w-0 flex-1 items-center truncate rounded-md bg-background/80 px-2.5 text-[11px] text-muted-foreground', !movil && 'ml-2 max-w-80')}>
          {direccion ?? 'tu web'}
        </span>
      </div>
      <div
        // Alto suficiente para ver el widget y desplazarse por él con la rueda
        // (el iframe mide lo que su contenido y es este marco el que hace
        // scroll). Con 640 fijos y el widget escalado, no quedaba casi nada
        // que desplazar y parecía que no dejaba; recortado, 260 era una rendija.
        className={cn('overflow-y-auto overflow-x-hidden overscroll-contain @4xl/config:max-h-[min(78vh,860px)]', recortado ? 'max-h-[420px]' : 'max-h-[640px]')}
        style={{ background: fondo }}
        data-vista-previa=""
      >
        {children}
      </div>
    </div>
  );
}

function CabeceraWeb({ web, movil }: { web: SuWeb; movil: boolean }) {
  const oscura = esOscuro(web.fondo);
  const barra = oscura ? 'bg-white/15' : 'bg-black/10';
  return (
    <div aria-hidden className="px-4 pb-2 pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className={cn('flex min-w-0 items-center gap-2 text-[12.5px] font-semibold', oscura ? 'text-white/90' : 'text-black/80')}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: web.color }}>
            {web.nombre.trim().charAt(0).toUpperCase() || 'T'}
          </span>
          <span className="truncate">{web.nombre}</span>
        </span>
        <span className="flex gap-1.5">
          {(movil ? [18] : [28, 28, 28]).map((w, i) => <span key={i} className={cn('h-1.5 rounded-full', barra)} style={{ width: w }} />)}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        <span className={cn('block h-2 w-1/2 rounded-full', barra)} />
        <span className={cn('block h-1.5 w-4/5 rounded-full', barra)} />
      </div>
    </div>
  );
}

function BloquesGrises({ oscura }: { oscura: boolean }) {
  const barra = oscura ? 'bg-white/15' : 'bg-black/10';
  return (
    <div aria-hidden className="mt-6 space-y-1.5">
      <span className={cn('block h-1.5 w-2/5 rounded-full', barra)} />
      <span className={cn('block h-1.5 w-3/5 rounded-full', barra)} />
    </div>
  );
}

function Lienzo({ ancho, anchoWidget, dispositivo, contenido }: {
  ancho: number;
  anchoWidget: number | null;
  dispositivo: Dispositivo;
  contenido: Contenido;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(0);
  useLayoutEffect(() => {
    const el = marco.current;
    if (!el) return;
    const medir = () => setDisponible(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const escala = disponible > 0 ? Math.min(1, disponible / ancho) : 1;

  const interior = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [alto, setAlto] = useState(contenido.tipo === 'iframe' ? contenido.altoInicial : 400);
  const [cargando, setCargando] = useState(contenido.tipo === 'iframe');
  const [tarda, setTarda] = useState(false);
  const [intento, setIntento] = useState(0);

  // La vista incrustada no mide nunca menos que el iframe que la contiene
  // (`min-height: 100dvh` en /reservar): al cambiar de dispositivo o de widget
  // se vuelve al alto inicial para que pueda encoger.
  const clave = contenido.tipo === 'iframe' ? `${dispositivo}|${contenido.altoInicial}` : dispositivo;
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    if (contenido.tipo === 'iframe') setAlto(contenido.altoInicial);
  }

  // Iframe: la página incrustada anuncia su alto real. Solo se atiende a ESTE
  // iframe y a este estudio.
  const origen = contenido.tipo === 'iframe' ? contenido.origen : '';
  const slug = contenido.tipo === 'iframe' ? contenido.slug : '';
  useEffect(() => {
    if (!origen) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origen || e.source !== iframe.current?.contentWindow) return;
      if (e.data?.tentareSlug !== slug || !e.data?.tentareEmbedAltura) return;
      setAlto(Math.min(Number(e.data.tentareEmbedAltura) || 0, 6000));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origen, slug]);

  // Componente: se mide lo que ocupa de verdad.
  useEffect(() => {
    if (contenido.tipo !== 'componente' || !interior.current) return;
    const el = interior.current;
    const obs = new ResizeObserver(() => setAlto(el.scrollHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, [contenido.tipo]);

  // Un cambio de ajuste cambia el `src`: se recarga, y mientras tanto se dice.
  const src = contenido.tipo === 'iframe' ? contenido.src : null;
  const [srcAnterior, setSrcAnterior] = useState(src);
  if (src !== srcAnterior) {
    setSrcAnterior(src);
    if (src) { setCargando(true); setTarda(false); }
  }
  useEffect(() => {
    if (!cargando) return;
    const t = setTimeout(() => setTarda(true), TARDA_MS);
    return () => clearTimeout(t);
  }, [cargando, src, intento]);

  const padding = dispositivo === 'movil' ? 0 : 24;
  return (
    <div ref={marco} className="relative" style={{ height: alto * escala + padding * 2 * escala }}>
      <div
        style={{
          width: ancho, transform: `scale(${escala})`, transformOrigin: 'top left',
          position: 'absolute', top: 0, left: 0, padding,
        }}
      >
        <div ref={interior} style={{ width: '100%', maxWidth: anchoWidget ?? undefined, marginInline: 'auto' }}>
          {contenido.tipo === 'iframe' ? (
            <iframe
              key={intento}
              ref={iframe}
              src={contenido.src}
              title={`Vista previa: ${contenido.titulo}`}
              onLoad={() => { setCargando(false); setTarda(false); }}
              allow="payment"
              style={{ display: 'block', width: '100%', height: alto, border: 0, borderRadius: dispositivo === 'movil' ? 0 : 12, background: 'transparent' }}
            />
          ) : contenido.nodo}
        </div>
      </div>
      {/* Fuera de la escala: a tamaño de verdad, se lee en cualquier pantalla. */}
      {cargando && (
        <div role="status" aria-live="polite" className="absolute inset-x-0 top-0 flex justify-center pt-5">
          <span className="flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm ring-1 ring-border">
            {tarda ? 'Está tardando en cargar.' : 'Actualizando…'}
            {tarda && (
              <button
                type="button"
                onClick={() => { setIntento(n => n + 1); setTarda(false); }}
                className={cn(TACTIL, 'font-medium text-foreground underline underline-offset-2', FOCO)}
              >
                Reintentar
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
