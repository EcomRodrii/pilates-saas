'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Maximize2, Monitor, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { anchoPopupDe, textoBotonEfectivo } from '@/lib/widgets/config';
import { conVistaPrevia, estiloBoton, urlEmbebido, urlPagina, type EntradaIntegracion } from '@/lib/widgets/integracion';
import { ANCHO_ESCRITORIO, medidasLienzo, type Dispositivo, type MedidasPrevia } from '@/lib/widgets/vista-previa-medidas';
import { luminancia } from '@/lib/reservar/apariencia-widget';
import type { WidgetWeb } from '@/lib/reservar/estilo-web-tipos';
import { FOCO, Segmentado, TACTIL } from './piezas';
import { MarcoMac } from '@/components/ui/marco-mac';
import { IphoneConWeb, useAnchoDe, useEscalaIphoneEn } from './iphone-con-web';

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

// «Tu web» v2 (`variante="v2"`, decisión 6 de la propuesta aprobada):
//  · en MÓVIL por defecto (lo elige quien la usa), dentro del iPhone del panel
//    (`MarcoIphone`, components/widgets/iphone-con-web.tsx), con la página a su
//    ancho de verdad y el teléfono a tamaño real si cabe, directamente sobre el
//    panel de color;
//  · «Ordenador» a una escala que se lee (nunca por debajo de 0,75,
//    lib/widgets/vista-previa-medidas.ts) en una ventana más estrecha, y lo
//    dice, con «Ver a tamaño real» a un clic (la web de 1200 en una hoja);
//  · mientras carga un cambio, se queda la vista previa ANTERIOR con
//    «Actualizando…» encima: dos iframes, el nuevo carga detrás, invisible, y
//    pasa delante al terminar (`conservarMientrasCarga` en `Lienzo`).
// Con `variante="v1"` (el constructor de siempre), nada de esto: lo de antes.

export type { Dispositivo } from '@/lib/widgets/vista-previa-medidas';

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

/** Lo que pone la barra de direcciones del marco cuando aún no se sabe cuál es su web. */
export const DIRECCION_DE_EJEMPLO = 'tu-web.com';

/** Sobre un fondo así, los bloques del dibujo y la letra van en claro. */
const esOscuro = (fondo: string) => (luminancia(fondo) ?? 1) < 0.2;

export type FormaPrevia =
  | { tipo: 'dentro' }
  /** Un botón en su web y, debajo, lo que se abre al pulsarlo. */
  | { tipo: 'boton'; boton: ReactNode; pista: string; alPulsar: string; abrePagina: boolean }
  | { tipo: 'enlace' };

export function VistaPrevia({ contenido, falta, forma, web, paginaDeReservas, anchoWidget, abrirEn, dispositivo, onDispositivo, noSigueElEstilo = null, alSeguirElEstilo = null, nota = null, variante = 'v1', enHoja = false }: {
  /** `null` cuando falta algo para poder enseñarlo (`falta`). */
  contenido: Contenido | null;
  falta: string | null;
  forma: FormaPrevia;
  web: SuWeb;
  /** La dirección de su página de reservas, para la barra del navegador. */
  paginaDeReservas: string;
  /** Ancho máximo del widget dentro de la web (`null` = todo el ancho). */
  anchoWidget: number | null;
  /**
   * Para «Abrir en una pestaña». La v2 pasa la URL REAL, sin `vista-previa` ni
   * `borrador-web`: lo que verá su alumna, con lo publicado. La v1 aún pasa la
   * de la previa, y esa pestaña no reserva ni paga
   * (lib/reservar/vista-previa-sin-escrituras.ts).
   */
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
  /** Una línea más al pie, para lo que el dibujo no puede enseñar (p. ej. la letra de su web sin marco). */
  nota?: string | null;
  /** 'v2': «Tu web» v2 (ver arriba). Por defecto, la de siempre. */
  variante?: 'v1' | 'v2';
  /** v2: va en la hoja «Ver cómo queda» (menos cosas alrededor que reservar a lo alto para el iPhone). */
  enHoja?: boolean;
}) {
  const v2 = variante === 'v2';
  const movil = dispositivo === 'movil';
  // La barra de direcciones del marco: la web de su estudio si se sabe (la que contestó, o una autorizada) y, si
  // no, un ejemplo que no se confunde con una web de verdad. Nunca la de otro estudio ni una inventada con su nombre.
  const direccionWeb = v2 ? (web.direccion ?? DIRECCION_DE_EJEMPLO) : web.direccion;
  // v2 en «Móvil»: el iPhone del panel (`MarcoIphone`), a tamaño real si cabe a lo alto de la
  // ventana y a lo ancho de la columna, y si no, a la escala que quepa sin cortar nada.
  const [seccion, anchoSeccion] = useAnchoDe<HTMLElement>();
  const escalaIphone = useEscalaIphoneEn(anchoSeccion, { max: 1, reservado: enHoja ? 250 : 280 });
  const [grande, setGrande] = useState(false);
  // «Ver a tamaño real» (v2, en «Ordenador»): la web de 1200 en una hoja.
  const [real, setReal] = useState(false);
  // El ancho al que se pinta el ordenador en la columna: por debajo de 1200 es
  // una ventana estrecha, y se dice.
  const [anchoPintado, setAnchoPintado] = useState<number | null>(null);
  const lienzo = (medidas: MedidasPrevia, opc: { conservar?: boolean; prefijo?: string; onAncho?: (n: number) => void } = {}) => contenido
    ? (
      <Lienzo
        anchoWidget={anchoWidget}
        dispositivo={medidas === 'real' ? 'escritorio' : dispositivo}
        contenido={contenido}
        medidas={medidas}
        conservarMientrasCarga={opc.conservar}
        prefijoTitulo={opc.prefijo}
        onAncho={opc.onAncho}
      />
    )
    : <p className="flex min-h-48 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">{falta}</p>;
  const widget = v2 ? lienzo('legible', { conservar: true, onAncho: setAnchoPintado }) : lienzo('v1');
  // En la v2 la previa va siempre entera: por debajo de las dos columnas la abre una hoja.
  const recortado = v2 ? false : !grande;
  const ventanaEstrecha = v2 && !movil && !!contenido && anchoPintado !== null && anchoPintado < ANCHO_ESCRITORIO;
  const tinta = v2 ? 'text-foreground/85' : 'text-muted-foreground';

  const opciones = [
    { valor: 'escritorio' as const, nombre: 'Ordenador', icono: <Monitor size={13} aria-hidden /> },
    { valor: 'movil' as const, nombre: 'Móvil', icono: <Smartphone size={13} aria-hidden /> },
  ];

  return (
    <section ref={seccion} aria-label="Vista previa" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-foreground">Así lo verá tu alumna</h3>
        <div className="flex items-center gap-1">
          <Segmentado
            etiqueta="Dispositivo de la vista previa"
            tamano="compacto"
            valor={dispositivo}
            onChange={onDispositivo}
            // Como en la maqueta aprobada: primero el móvil, que es lo que verá casi siempre su alumna.
            opciones={v2 ? [opciones[1], opciones[0]] : opciones}
          />
          {abrirEn && (
            <a
              href={abrirEn}
              target="_blank"
              rel="noopener"
              className={cn('inline-flex size-11 items-center justify-center rounded-lg hover:text-foreground [@media(pointer:fine)]:size-9', v2 ? 'text-foreground/80 hover:bg-card/60' : 'text-muted-foreground hover:bg-muted', FOCO)}
              aria-label="Abrir el widget en una pestaña nueva"
              title="Abrir en una pestaña nueva"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>

      {noSigueElEstilo && (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 px-3 py-2', v2 ? 'bg-card' : 'bg-warning/10')}>
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
          <p className={cn('text-[12px]', tinta)}>Al abrir el enlace, se abre tu página de reservas:</p>
          <Marco movil={movil} v2={v2} escala={escalaIphone} direccion={paginaDeReservas} fondo={BLANCO} recortado={recortado}>{widget}</Marco>
        </>
      ) : forma.tipo === 'boton' && v2 && movil ? (
        // En el iPhone, un solo teléfono: su web con el botón y, bajando, lo que se abre al pulsarlo.
        <Marco movil v2 escala={escalaIphone} direccion={direccionWeb} fondo={web.fondo} recortado={false}>
          <CabeceraWeb web={web} movil />
          <div className="px-4 pb-6 pt-2">
            {forma.boton}
            <p className={cn('mt-2 text-[11.5px]', esOscuro(web.fondo) ? 'text-white/65' : 'text-black/55')}>{forma.pista}</p>
          </div>
          <div style={{ background: BLANCO }}>
            <p className="border-t border-black/10 px-4 pb-1 pt-3 text-[12px] text-black/60">{forma.alPulsar}</p>
            {widget}
          </div>
        </Marco>
      ) : forma.tipo === 'boton' ? (
        <>
          <Marco movil={movil} v2={v2} escala={escalaIphone} direccion={direccionWeb} fondo={web.fondo} recortado={recortado}>
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
          <div className={cn('space-y-3', !v2 && !grande && 'hidden @4xl/config:block')}>
            <p className={cn('text-[12px]', tinta)}>{forma.alPulsar}</p>
            <Marco movil={movil} v2={v2} escala={escalaIphone} direccion={forma.abrePagina ? paginaDeReservas : direccionWeb} fondo={BLANCO} recortado={false}>{widget}</Marco>
          </div>
        </>
      ) : (
        <Marco movil={movil} v2={v2} escala={escalaIphone} direccion={direccionWeb} fondo={web.fondo} recortado={recortado}>
          <CabeceraWeb web={web} movil={movil} />
          {widget}
        </Marco>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={cn('min-w-0 flex-1 text-[11.5px] leading-relaxed', tinta)}>
          {v2
            ? (
              <>
                {ventanaEstrecha && 'Así se ve en una ventana estrecha de ordenador. '}
                <strong className="font-semibold">Es un ejemplo de página</strong> con el nombre y el color de tu estudio: tu web real puede verse distinta. El widget sí es el de verdad, con tus clases de hoy.
              </>
            )
            : 'El widget es el de verdad, con tus clases de hoy. Lo de alrededor es un dibujo de tu web para que veas cómo encaja.'}
          {nota && <> {nota}</>}
        </p>
        {v2 ? (
          !movil && contenido && (
            <button
              type="button"
              onClick={() => setReal(true)}
              className={cn(TACTIL, 'shrink-0 gap-1.5 text-[12.5px] font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}
            >
              <Maximize2 size={13} aria-hidden />Ver a tamaño real
            </button>
          )
        ) : (
          <button
            type="button"
            aria-expanded={grande}
            onClick={() => setGrande(g => !g)}
            className={cn(TACTIL, 'shrink-0 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline @4xl/config:hidden', FOCO)}
          >
            {grande ? 'Verla más pequeña' : 'Ver en grande'}
          </button>
        )}
      </div>

      {v2 && (
        <DashboardSheet
          open={real}
          onClose={() => setReal(false)}
          label="La vista previa a tamaño real"
          backdropClassName="fixed inset-0 z-50 flex items-stretch justify-center p-3 sm:p-6"
          sheetClassName="flex w-full max-w-[1300px] flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-foreground">A tamaño real, en un ordenador</p>
              <p className="text-[12px] text-muted-foreground">Tu web a {ANCHO_ESCRITORIO} px de ancho, como la verá tu alumna en una pantalla grande.</p>
            </div>
            <button
              type="button"
              onClick={() => setReal(false)}
              aria-label="Cerrar la vista previa a tamaño real"
              className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground', FOCO)}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {real && (
              <Marco
                movil={false}
                v2
                alto="libre"
                direccion={forma.tipo === 'enlace' || (forma.tipo === 'boton' && forma.abrePagina) ? paginaDeReservas : direccionWeb}
                fondo={forma.tipo === 'dentro' ? web.fondo : BLANCO}
                recortado={false}
              >
                {forma.tipo === 'dentro' && <CabeceraWeb web={web} movil={false} />}
                {lienzo('real', { prefijo: 'A tamaño real' })}
              </Marco>
            )}
          </div>
        </DashboardSheet>
      )}
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

function Marco({ movil, v2 = false, escala = 1, alto = 'fijo', direccion, fondo, recortado, children }: {
  movil: boolean;
  /** «Tu web» v2: en «Móvil», el iPhone del panel; en «Ordenador», un alto que cabe en la pantalla. */
  v2?: boolean;
  /** v2 en «Móvil»: la escala del iPhone. */
  escala?: number;
  /** 'libre': en la hoja de «Ver a tamaño real», que se desplaza ella. */
  alto?: 'fijo' | 'libre';
  direccion: string | null;
  fondo: string;
  /** Más bajo por debajo de las dos columnas (ver la cabecera). */
  recortado: boolean;
  children: ReactNode;
}) {
  if (v2 && movil) {
    return <IphoneConWeb escala={escala} direccion={direccion} fondo={fondo}>{children}</IphoneConWeb>;
  }
  if (v2 && alto !== 'libre') {
    // «Ordenador» en la v2: un MacBook (`MarcoMac`), con la ventana del navegador dentro, debajo
    // del notch. La pantalla mide lo que deja el ancho: la página se mide sola dentro y se queda
    // en la escala que se lee (lib/widgets/vista-previa-medidas.ts).
    return (
      <MarcoMac>
        <div className="flex h-full flex-col bg-card">
          <div aria-hidden className="flex shrink-0 items-center gap-1.5 border-b border-border bg-background px-3 py-1.5">
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="ml-2 flex h-5 min-w-0 max-w-72 flex-1 items-center truncate rounded-md bg-background/80 px-2 text-[10.5px] text-muted-foreground">
              {direccion ?? 'tu web'}
            </span>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
            style={{ background: fondo }}
            data-vista-previa=""
          >
            {children}
          </div>
        </div>
      </MarcoMac>
    );
  }
  return (
    <div
      className={cn(
        'overflow-hidden border shadow-sm',
        movil ? 'mx-auto max-w-[430px] rounded-[28px] border-[6px] border-foreground/85' : 'rounded-xl border-border',
        v2 && 'bg-card shadow-md',
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
        className={cn(
          // En la v2 aquí solo llega la hoja de «Ver a tamaño real» (alto libre): lo demás va en el Mac o el iPhone.
          alto === 'libre'
            ? 'overflow-x-hidden'
            : cn('overflow-y-auto overflow-x-hidden overscroll-contain @4xl/config:max-h-[min(78vh,860px)]', recortado ? 'max-h-[420px]' : 'max-h-[640px]'),
        )}
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

/** Una carga del iframe: la que se ve, o la siguiente que carga detrás. */
interface Capa { id: number; src: string }

function Lienzo({ anchoWidget, dispositivo, contenido, medidas = 'v1', conservarMientrasCarga = false, prefijoTitulo = 'Vista previa', onAncho }: {
  anchoWidget: number | null;
  dispositivo: Dispositivo;
  contenido: Contenido;
  /** Cómo se calcula el ancho y la escala (lib/widgets/vista-previa-medidas.ts). */
  medidas?: MedidasPrevia;
  /**
   * v2: al cambiar el `src`, la vista previa de antes se queda a la vista con
   * «Actualizando…» encima mientras la nueva carga DETRÁS (otro iframe,
   * invisible e inerte), y pasa delante al terminar. Sin esto, el mismo iframe
   * cambia de `src` y se queda en blanco hasta que carga.
   */
  conservarMientrasCarga?: boolean;
  /** El título del iframe (`Prefijo: widget`): el de la hoja «a tamaño real» no puede llamarse igual. */
  prefijoTitulo?: string;
  /** Avisa del ancho al que se está pintando (para decir «ventana estrecha»). */
  onAncho?: (ancho: number) => void;
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
  const { ancho, escala, desborda } = medidasLienzo(dispositivo, anchoWidget, disponible, medidas);
  useEffect(() => { if (disponible > 0) onAncho?.(ancho); }, [ancho, disponible, onAncho]);

  const interior = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [alto, setAlto] = useState(contenido.tipo === 'iframe' ? contenido.altoInicial : 400);
  const [cargando, setCargando] = useState(contenido.tipo === 'iframe');
  const [tarda, setTarda] = useState(false);
  const [intento, setIntento] = useState(0);

  // La vista incrustada anuncia lo que mide (desde el 16-oct, también cuando
  // encoge: /reservar ya no pone `min-height: 100dvh` dentro de un marco). Al
  // cambiar de dispositivo o de widget se vuelve al alto inicial igualmente,
  // para que el primer alto que llegue no herede el del otro.
  const clave = contenido.tipo === 'iframe' ? `${dispositivo}|${contenido.altoInicial}` : dispositivo;
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    if (contenido.tipo === 'iframe') setAlto(contenido.altoInicial);
  }

  // ── Las cargas (solo con `conservarMientrasCarga`) ──
  const src = contenido.tipo === 'iframe' ? contenido.src : null;
  const [capas, setCapas] = useState<Capa[]>(() => (src ? [{ id: 0, src }] : []));
  // La que se enseña: la última que terminó de cargar (o, antes de la primera, la única).
  const [visibleId, setVisibleId] = useState<number | null>(null);
  const mostrada = visibleId ?? capas[0]?.id ?? null;
  const ultima = capas[capas.length - 1] ?? null;
  const marcos = useRef(new Map<number, HTMLIFrameElement>());
  // El alto que anuncia la que carga detrás: se aplica al pasar delante.
  const altosDetras = useRef(new Map<number, number>());
  const mostradaRef = useRef(mostrada);
  useEffect(() => { mostradaRef.current = mostrada; }, [mostrada]);

  // Un cambio de ajuste cambia el `src`: se recarga, y mientras tanto se dice.
  const [srcAnterior, setSrcAnterior] = useState(src);
  if (src !== srcAnterior) {
    setSrcAnterior(src);
    if (src) {
      setCargando(true); setTarda(false);
      if (conservarMientrasCarga) {
        // La que se ve se queda; la que estuviera cargando detrás, ya no vale: la sustituye esta.
        const siguiente = (ultima?.id ?? -1) + 1;
        const vista = capas.find(c => c.id === mostrada);
        setCapas(vista && visibleId !== null ? [vista, { id: siguiente, src }] : [{ id: siguiente, src }]);
      }
    }
  }
  function cargada(id: number) {
    if (!ultima || id !== ultima.id) return; // una que ya no vale
    setCargando(false); setTarda(false);
    if (id !== mostrada || visibleId === null) {
      const altoNuevo = altosDetras.current.get(id);
      if (altoNuevo) setAlto(altoNuevo);
      altosDetras.current.clear();
      setVisibleId(id);
      setCapas([ultima]);
    }
  }

  useEffect(() => {
    if (!cargando) return;
    const t = setTimeout(() => setTarda(true), TARDA_MS);
    return () => clearTimeout(t);
  }, [cargando, src, intento]);

  // Iframe: la página incrustada anuncia su alto real. Solo se atiende a ESTE
  // iframe (o, con dos, a la que se ve; el de la que carga se guarda) y a este estudio.
  const origen = contenido.tipo === 'iframe' ? contenido.origen : '';
  const slug = contenido.tipo === 'iframe' ? contenido.slug : '';
  useEffect(() => {
    if (!origen) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origen) return;
      if (e.data?.tentareSlug !== slug || !e.data?.tentareEmbedAltura) return;
      const medido = Math.min(Number(e.data.tentareEmbedAltura) || 0, 6000);
      if (!conservarMientrasCarga) {
        if (e.source !== iframe.current?.contentWindow) return;
        setAlto(medido);
        return;
      }
      for (const [id, el] of marcos.current) {
        if (el.contentWindow !== e.source) continue;
        if (id === mostradaRef.current) setAlto(medido);
        else altosDetras.current.set(id, medido);
        return;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origen, slug, conservarMientrasCarga]);

  // Componente: se mide lo que ocupa de verdad.
  useEffect(() => {
    if (contenido.tipo !== 'componente' || !interior.current) return;
    const el = interior.current;
    const obs = new ResizeObserver(() => setAlto(el.scrollHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, [contenido.tipo]);

  const padding = dispositivo === 'movil' ? 0 : 24;
  const radio = dispositivo === 'movil' ? 0 : 12;
  const titulo = contenido.tipo === 'iframe' ? `${prefijoTitulo}: ${contenido.titulo}` : '';
  return (
    <div
      ref={marco}
      className="relative"
      style={{ height: alto * escala + padding * 2 * escala, ...(desborda ? { overflowX: 'auto', overflowY: 'hidden' } : null) }}
    >
      <div
        style={{
          width: ancho, transform: `scale(${escala})`, transformOrigin: 'top left',
          position: 'absolute', top: 0, left: 0, padding,
        }}
      >
        <div ref={interior} style={{ width: '100%', maxWidth: anchoWidget ?? undefined, marginInline: 'auto', position: conservarMientrasCarga ? 'relative' : undefined }}>
          {contenido.tipo !== 'iframe' ? contenido.nodo : !conservarMientrasCarga ? (
            <iframe
              key={intento}
              ref={iframe}
              src={contenido.src}
              title={titulo}
              onLoad={() => { setCargando(false); setTarda(false); }}
              allow="payment"
              style={{ display: 'block', width: '100%', height: alto, border: 0, borderRadius: radio, background: 'transparent' }}
            />
          ) : capas.map(c => {
            const delante = c.id === mostrada;
            return (
              <iframe
                // La que carga se reintenta con su propia clave; la que se ve no se toca.
                key={`${c.id}-${c.id === ultima?.id ? intento : 0}`}
                ref={el => { if (el) marcos.current.set(c.id, el); else marcos.current.delete(c.id); }}
                src={c.src}
                title={delante ? titulo : 'Cargando la vista previa'}
                aria-hidden={delante ? undefined : true}
                tabIndex={delante ? undefined : -1}
                inert={!delante}
                data-vista-previa-capa={delante ? 'delante' : 'detras'}
                onLoad={() => cargada(c.id)}
                allow="payment"
                style={{
                  display: 'block', width: '100%', height: alto, border: 0, borderRadius: radio, background: 'transparent',
                  ...(delante ? null : { position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none' }),
                }}
              />
            );
          })}
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
