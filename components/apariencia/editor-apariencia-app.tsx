'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Apariencia de tu app» — cómo ven la app sus alumnas (22-sep-2026).
//
// Sustituye al editor de marca del portal, cerrado desde el 7-sep: aquel tenía
// ~20 ajustes de los que 19 no llegaban a la app actual, y su vista previa
// montaba el portal borrado. Este es GUIADO (decisión del fundador): estilos y
// parejas tipográficas hechos por nosotros, el color de la marca y las fotos.
// Lo que se elige está en `lib/student/apariencia.ts`, con sus garantías de
// contraste medidas en test.
//
// La vista previa es la app REAL (`/portal/<slug>` en un iframe del mismo
// origen): se le inyecta el borrador como un `<style>` más específico que el
// publicado, así que se ve con los datos de verdad y se puede navegar por ella.
// Nada llega a las alumnas hasta «Publicar».
//
// ⚠️ Las FOTOS son la excepción y se dice en pantalla: se guardan al subirlas,
// igual que el logo en Marca. Su fichero en Storage tiene una ruta fija por
// estudio, así que subir una nueva ya la cambia para todas; fingir que espera a
// «Publicar» sería mentir.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, ExternalLink, EyeOff, RotateCcw } from 'lucide-react';
import { leerPaginaPublica } from '@/lib/pagina-publica-cliente';
import { hrefDeTarjeta } from '@/lib/configuracion/destino';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { BOTON_DESTACADO, BOTON_VIVO, BotonVivo } from '@/components/dashboard/vivo';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { fetchThemePublicado, publicarThemeApi } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ThemeConfig } from '@/lib/theme-schema';
import { subirImagenBienvenida, eliminarImagenBienvenida } from '@/lib/portal-storage';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import { CampoImagen } from '@/components/ui/campo-imagen';
import { btnPrimary, btnSecondary, cardCls, inputCls } from '@/components/configuracion/estilos';
import {
  ESTILOS, TIPOGRAFIAS, resolverApariencia, temaAppCssText,
  type AparienciaApp, type EncuadrePortada,
} from '@/lib/student/apariencia';
import { TITULO_ACCESO_POR_DEFECTO } from '@/lib/student/titulo-acceso';
import { TEXTO_RESERVAS_Y_WIDGET, TEXTO_SECUNDARIO } from '@/lib/student/textos-apariencia';
import { MuestraEstilo } from './muestra-estilo';
import { AppEnElMovil } from './app-en-el-movil';
import { MiAppDeTienda } from './mi-app-de-tienda';
import { useInterruptor } from '@/lib/estudio/interruptores-cliente';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID_ESTILO_BORRADOR = 'apariencia-borrador';
/** Tamaño lógico del móvil de la vista previa: un iPhone de 390 pt. */
const MOVIL = { ancho: 390, alto: 800 };

interface Borrador { primary: string; secondary: string; app: AparienciaApp }

function borradorDe(t: ThemeConfig): Borrador {
  return { primary: t.primary, secondary: t.secondary, app: resolverApariencia(t.appAlumna) };
}

const mismaApp = (a: AparienciaApp, b: AparienciaApp) =>
  a.estilo === b.estilo && a.tipografia === b.tipografia && a.marca === b.marca && a.boton === b.boton && a.encuadre === b.encuadre;

/** Pinta el borrador dentro de la app del iframe. Mismo origen: se escribe en su `<head>`. */
function pintarBorrador(iframe: HTMLIFrameElement | null, css: string) {
  const doc = iframe?.contentDocument;
  if (!doc?.head) return;
  let el = doc.getElementById(ID_ESTILO_BORRADOR);
  if (!el) {
    el = doc.createElement('style');
    el.id = ID_ESTILO_BORRADOR;
    doc.head.appendChild(el);
  }
  el.textContent = css;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function Seccion({ titulo, detalle, orden = 0, children, enAsistente = false }: { titulo: string; detalle: string; orden?: number; children: React.ReactNode; enAsistente?: boolean }) {
  // En el asistente (panel nuevo) el título y la frase los pone el paso, más grandes.
  if (enAsistente) {
    return (
      <section aria-label={titulo} className="contenido-anim">
        {children}
      </section>
    );
  }
  return (
    <section className={cn(cardCls, 'contenido-anim p-5')} style={{ animationDelay: `${orden * 60}ms` }}>
      <h2 className="text-[15px] font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">{detalle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ─── El asistente (panel nuevo, 14-oct-2026) ──────────────────────────────────
// Copiado de «Tu App» de Bonsai (b-30…b-36): la línea de pasos centrada, sin
// caja; a la izquierda el paso, con su título y el formulario sin tarjeta
// alrededor; a la derecha el móvil sobre un panel grande de color; abajo
// «← Atrás» y «Siguiente →», y en el último paso «Publicar mi app».
// Publicar hace lo de siempre; mientras hay cambios sin publicar, se dice.
type PasoAsistente = 'estilo' | 'color' | 'letra' | 'entrada' | 'fotos' | 'instalar';
const PASOS: { id: PasoAsistente; corto: string; titulo: string; sub: string }[] = [
  { id: 'estilo', corto: 'Estilo', titulo: 'Elige el estilo de tu app', sub: 'El fondo, las tarjetas y la forma de las esquinas y los botones. Los ocho se leen bien con cualquier color, también en oscuro.' },
  { id: 'color', corto: 'Colores', titulo: 'Tus colores', sub: 'Empieza con una paleta y afina el color a tu gusto. Sale en los botones, los avisos y la tarjeta de la próxima clase.' },
  { id: 'letra', corto: 'Tipografía', titulo: 'La tipografía', sub: 'Una letra para los títulos y otra para el texto, pensadas para ir juntas.' },
  { id: 'entrada', corto: 'Entrada', titulo: 'Pantalla de entrada', sub: 'La primera impresión al entrar: tu foto de portada y la frase que escribes tú.' },
  { id: 'fotos', corto: 'Fotos', titulo: 'Tus fotos', sub: 'Se guardan al subirlas, sin esperar a publicar: tus alumnas las ven al momento.' },
  { id: 'instalar', corto: 'Tu app', titulo: 'Tu app en el móvil de tus alumnas', sub: 'Cómo la instalan y cómo se la haces llegar.' },
];

/** Paletas listas (Bonsai b-32: primero eliges una con nombre, luego afinas). Son un color de marca como cualquier otro: al publicar pasan el mismo control que uno elegido a mano. */
const PALETAS: { nombre: string; color: string }[] = [
  { nombre: 'Salvia', color: '#5E7A5A' },
  { nombre: 'Terracota', color: '#A85A3E' },
  { nombre: 'Lavanda', color: '#6E62A8' },
  { nombre: 'Océano', color: '#2F6F8F' },
  { nombre: 'Rosa empolvado', color: '#A85C72' },
  { nombre: 'Tinta', color: '#2E3440' },
];

function LineaDePasos({ pasos, paso, onPaso }: { pasos: typeof PASOS; paso: PasoAsistente; onPaso: (p: PasoAsistente) => void }) {
  const actual = pasos.findIndex(p => p.id === paso);
  return (
    <ol className="flex items-center overflow-x-auto py-1 lg:justify-center" aria-label="Pasos">
      {pasos.map((p, i) => {
        const hecho = i < actual;
        const esActual = i === actual;
        return (
          <li key={p.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onPaso(p.id)}
              aria-current={esActual ? 'step' : undefined}
              className="flex items-center gap-2.5 rounded-full py-1 pr-1 text-[14px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className={cn('flex size-8 items-center justify-center rounded-full text-[13px] font-semibold', esActual || hecho ? 'text-white' : 'border-[1.5px] border-border bg-card text-muted-foreground')}
                style={esActual || hecho ? { backgroundColor: 'var(--t-blue-500)', boxShadow: esActual ? '0 0 0 4px color-mix(in srgb, var(--t-blue-500) 18%, transparent)' : undefined } : undefined}
              >
                {hecho ? <Check size={15} strokeWidth={2.6} aria-hidden /> : i + 1}
              </span>
              <span className={cn(esActual ? 'font-semibold text-foreground' : hecho ? 'text-foreground' : 'text-muted-foreground')}>{p.corto}</span>
            </button>
            {i < pasos.length - 1 && (
              <span aria-hidden className="mx-3 h-px w-8 xl:mx-4 xl:w-14" style={{ backgroundColor: hecho ? 'var(--t-blue-500)' : 'var(--border)' }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Segmentado<T extends string>({ etiqueta, valor, opciones, onChange }: {
  etiqueta: string;
  valor: T;
  opciones: readonly { valor: T; texto: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex w-fit max-w-full flex-wrap rounded-lg border border-border bg-muted/60 p-0.5">
      {opciones.map(o => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'relative min-h-9 rounded-md px-3 text-[13px] font-medium transition-[color,transform] duration-200 active:scale-[.97]',
            valor === o.valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

function CampoColor({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  const valido = HEX.test(valor);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={etiqueta}
        value={valido ? valor : '#000000'}
        onChange={e => onChange(e.target.value)}
        className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
      />
      <input
        type="text"
        aria-label={`${etiqueta} en hexadecimal`}
        aria-invalid={!valido}
        value={valor}
        onChange={e => onChange(e.target.value.trim())}
        spellCheck={false}
        autoComplete="off"
        className={cn(inputCls, 'w-32 font-mono', !valido && 'border-destructive')}
      />
    </div>
  );
}

/** Las dos pantallas que se pueden mirar: la de entrada y la de dentro. */
const PANTALLAS = [
  { id: 'inicio', texto: 'Inicio', ruta: '' },
  { id: 'entrada', texto: 'Entrada', ruta: '/acceso' },
] as const;
type PantallaId = (typeof PANTALLAS)[number]['id'];

/**
 * Con la página oculta, la app del iframe enseña el cartel «Estamos preparando
 * esta página» y no el borrador: se dice encima, en vez de dejar que parezca
 * que el estilo no se aplica.
 *
 * ⚠️ No se abre la app «solo para la vista previa»: el cierre lo decide el
 * SERVIDOR en el layout de la app y en cada ruta que lee o escribe
 * (lib/publico/pagina-cerrada-peticion.ts), y la sesión del panel no viaja en
 * cookie (va en el `Authorization` de cada llamada), así que el layout no
 * tiene cómo saber que quien mira es la propietaria. Una excepción por URL o
 * por galleta nueva sería una puerta para enseñar una página oculta, que es
 * justo lo que la dueña ha pedido que no pase.
 */
function AvisoPaginaOculta() {
  return (
    <div role="note" data-testid="aviso-pagina-oculta-apariencia" className="mb-3 flex max-w-[332px] items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
      <EyeOff size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p className="text-pretty">
        <strong className="font-semibold">Tu página está oculta</strong>, así que aquí (y a tus alumnas) se ve «Estamos preparando esta página» en vez de tu app. Lo que publiques se verá en cuanto la hagas visible.{' '}
        <Link href={hrefDeTarjeta('pagina-publica')} className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Cambiarlo<ArrowUpRight size={12} aria-hidden />
        </Link>
      </p>
    </div>
  );
}

function VistaPrevia({ slug, css, recarga, pantalla, onPantalla, paginaOculta = false }: {
  slug: string; css: string; recarga: number; pantalla: PantallaId; onPantalla: (p: PantallaId) => void; paginaOculta?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [cargando, setCargando] = useState(true);
  // El borrador se repinta en cada cambio; al cargar (o recargar) la app, en `onLoad`.
  useEffect(() => { pintarBorrador(ref.current, css); }, [css]);
  // Cambiar de pantalla o recargar monta un iframe nuevo: se funde para que no
  // dé el salto de blanco → app.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCargando(true); }, [pantalla, recarga]);
  const escala = 0.8;
  const ruta = PANTALLAS.find(p => p.id === pantalla)?.ruta ?? '';
  return (
    <div className="flex flex-col items-center">
      {paginaOculta && <AvisoPaginaOculta />}
      <div className="mb-3">
        <Segmentado
          etiqueta="Pantalla de la vista previa"
          valor={pantalla}
          opciones={PANTALLAS.map(p => ({ valor: p.id, texto: p.texto }))}
          onChange={onPantalla}
        />
      </div>
      <div
        className="overflow-hidden rounded-[38px] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl"
        style={{ width: MOVIL.ancho * escala + 20, height: MOVIL.alto * escala + 20 }}
      >
        <iframe
          key={`${recarga}-${pantalla}`}
          ref={ref}
          title="Vista previa de la app de tus alumnas"
          src={`/portal/${encodeURIComponent(slug)}${ruta}`}
          onLoad={() => { pintarBorrador(ref.current, css); setCargando(false); }}
          className="origin-top-left rounded-[28px] bg-white transition-opacity duration-300"
          style={{ width: MOVIL.ancho, height: MOVIL.alto, transform: `scale(${escala})`, border: 0, opacity: cargando ? 0.35 : 1 }}
        />
      </div>
      <a
        href={`/portal/${encodeURIComponent(slug)}${ruta}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        Abrir la app publicada <ExternalLink size={12} aria-hidden />
      </a>
    </div>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export function EditorAparienciaApp() {
  const { studio, updateStudio } = useStudio();
  // «Pedir mi app»: apagado de serie (`APP_PROPIA_PEDIR`); sin él, la sección no existe.
  const pedirApp = useInterruptor('pedirApp', studio?.id);
  const rol = useRol();
  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [intento, setIntento] = useState(0);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [reciénPublicado, setReciénPublicado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [pantalla, setPantalla] = useState<PantallaId>('inicio');
  const [tituloAcceso, setTituloAcceso] = useState<string | null>(null);
  const [guardandoTitulo, setGuardandoTitulo] = useState(false);
  const panelNuevo = usePanelNuevo();
  const [paso, setPasoEstado] = useState<PasoAsistente>('estilo');
  // En el paso de la entrada, el móvil enseña la entrada; en el resto, el inicio.
  const irAPaso = (p: PasoAsistente) => { setPasoEstado(p); setPantalla(p === 'entrada' ? 'entrada' : 'inicio'); };
  // Sin dirección de la app (sin slug) no hay nada que instalar: ese paso no sale.
  const pasos = studio?.slug ? PASOS : PASOS.filter(p => p.id !== 'instalar');

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (vivo) { setPublicado(t); setBorrador(borradorDe(t)); setErrorCarga(false); } })
      .catch(() => { if (vivo) setErrorCarga(true); });
    return () => { vivo = false; };
  }, [intento]);

  const soyPropietaria = rol === 'PROPIETARIO';
  // Solo la propietaria puede leerlo (`/api/pagina-publica`); sin respuesta, no
  // se dice nada (nunca un aviso a ciegas). Mismo criterio que los widgets.
  const [paginaOculta, setPaginaOculta] = useState(false);
  useEffect(() => {
    if (!soyPropietaria) return;
    let vivo = true;
    void leerPaginaPublica().then(e => { if (vivo) setPaginaOculta(e?.oculta === true); });
    return () => { vivo = false; };
  }, [soyPropietaria]);
  const incluidoEnPlan = !!studio && tieneFeature(studio, 'marca');
  const css = useMemo(
    () => (borrador ? temaAppCssText(HEX.test(borrador.primary) ? borrador.primary : publicado?.primary, borrador.app, '.student-app.student-app', { completo: true }) : ''),
    [borrador, publicado],
  );

  if (!studio || (!publicado && !errorCarga)) {
    return <p role="status" className="text-sm text-muted-foreground">Cargando la apariencia de tu app…</p>;
  }
  if (!publicado || !borrador) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm font-medium text-destructive">No hemos podido leer la apariencia de tu app.</p>
        <button type="button" onClick={() => setIntento(n => n + 1)} className={btnSecondary}>Volver a intentarlo</button>
      </div>
    );
  }

  const inicial = borradorDe(publicado);
  const cambios = [
    borrador.primary !== inicial.primary || borrador.secondary !== inicial.secondary ? 'colores' : null,
    !mismaApp(borrador.app, inicial.app) ? 'estilo' : null,
  ].filter(Boolean);
  const coloresValidos = HEX.test(borrador.primary) && HEX.test(borrador.secondary);
  const puedePublicar = soyPropietaria && incluidoEnPlan && cambios.length > 0 && coloresValidos && !publicando;

  const setApp = (cambio: Partial<AparienciaApp>) => {
    setAviso(null);
    setBorrador(b => (b ? { ...b, app: { ...b.app, ...cambio } } : b));
  };

  async function publicar() {
    if (!borrador || !publicado) return;
    setPublicando(true);
    setAviso(null);
    try {
      const res = await publicarThemeApi({
        ...(borrador.primary !== publicado.primary ? { primary: borrador.primary } : {}),
        ...(borrador.secondary !== publicado.secondary ? { secondary: borrador.secondary } : {}),
        ...(!mismaApp(borrador.app, inicial.app) ? { appAlumna: borrador.app } : {}),
      });
      if (!res.ok) {
        setAviso({ tipo: 'error', texto: res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente para leerse encima.' });
        return;
      }
      setPublicado(res.theme);
      setBorrador(borradorDe(res.theme));
      // Repinta el panel (el color de marca también es el suyo) y la app de la vista previa.
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      setRecarga(n => n + 1);
      setAviso({ tipo: 'ok', texto: 'Publicado. Tus alumnas ya ven tu app así.' });
      // ⚠️ Publicar no cambia NADA en pantalla —la vista previa ya enseñaba el
      // borrador—, así que sin esto se lee como que no ha pasado nada. Pasó:
      // «le doy a publicar y no se publica» con el cambio ya guardado.
      setReciénPublicado(true);
      window.setTimeout(() => setReciénPublicado(false), 2600);
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicando(false);
    }
  }

  async function subirPortada(file: File) {
    setSubiendo(true);
    const r = await subirImagenBienvenida(studio!.id, file);
    setSubiendo(false);
    return r;
  }

  async function cambiarPortada(url: string | null) {
    setSubiendo(true);
    if (url === null) await eliminarImagenBienvenida(studio!.id);
    const res = await updateStudio({ imagenBienvenidaUrl: url });
    setSubiendo(false);
    setAviso(res.ok // toast-no-es-error: el aviso lleva `tipo` y el error se pinta como alert en rojo
      ? { tipo: 'ok', texto: url ? 'Portada cambiada. Ya la ven tus alumnas.' : 'Portada quitada: vuelve la foto por defecto.' }
      : { tipo: 'error', texto: res.error });
    if (res.ok) setRecarga(n => n + 1);
  }

  const encuadre: EncuadrePortada = borrador.app.encuadre;

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-[22px] font-bold text-foreground">Apariencia de tu app</h1>
        {panelNuevo ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Nadie lo ve hasta que publiques. {TEXTO_RESERVAS_Y_WIDGET}
          </p>
        ) : (<>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Cómo ven tus alumnas su app: el estilo, tu color, la tipografía y tus fotos. Pruébalo aquí y mira el
          resultado en el móvil de la derecha; nadie lo ve hasta que publiques.
        </p>
        {/* Desde el 27-sep-2026 /reservar toma este mismo estilo (lib/reservar/tema-app.ts),
            pero no todo: ver `TEXTO_RESERVAS_Y_WIDGET`. */}
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {TEXTO_RESERVAS_Y_WIDGET}
        </p>
        </>)}
        {!soyPropietaria && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground">
            Puedes probar estilos, pero solo la propietaria del estudio puede publicarlos.
          </p>
        )}
        {soyPropietaria && !incluidoEnPlan && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground">
            Puedes probarlo todo. Para publicarlo necesitas una suscripción activa: la app con tu marca va incluida en todos los planes.{' '}
            <Link href="/suscripcion" className="font-medium underline underline-offset-2">Elegir plan</Link>
          </p>
        )}
      </header>

      {panelNuevo && (
        <div className="mt-5 border-b border-border pb-5">
          <LineaDePasos pasos={pasos} paso={paso} onPaso={irAPaso} />
        </div>
      )}

      <div className={panelNuevo
        ? 'mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start'
        : 'mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start'}>
        <div className={cn('flex min-w-0 flex-col gap-5', panelNuevo ? 'order-1' : 'order-2 lg:order-1')}>
          {panelNuevo && (() => {
            const i = pasos.findIndex(p => p.id === paso);
            return (
              <div>
                <p className="sr-only">Paso {i + 1} de {pasos.length}</p>
                <h2 className="text-[22px] font-bold leading-tight text-foreground">{pasos[i].titulo}</h2>
                <p className="mt-1 max-w-xl text-[13.5px] text-muted-foreground text-pretty">{pasos[i].sub}</p>
              </div>
            );
          })()}
          {(!panelNuevo || paso === 'estilo') && <Seccion enAsistente={panelNuevo} titulo="Estilo" orden={0} detalle="El fondo, las tarjetas y la forma de las esquinas y los botones. Los ocho están pensados para leerse bien con cualquier color, incluido el oscuro.">
            <div role="radiogroup" aria-label="Estilo de la app" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {ESTILOS.map(e => (
                <MuestraEstilo
                  key={e.id}
                  app={{ ...borrador.app, estilo: e.id }}
                  primary={borrador.primary}
                  activo={borrador.app.estilo === e.id}
                  onElegir={() => setApp({ estilo: e.id })}
                />
              ))}
            </div>
          </Seccion>}

          {(!panelNuevo || paso === 'color') && <Seccion enAsistente={panelNuevo} titulo="Tu color" orden={1} detalle="El de tu marca. Sale en enlaces, avisos y la tarjeta de la próxima clase, y en tu panel y tu página de reservas.">
            <div className="flex flex-col gap-5">
              {panelNuevo && (
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Paletas listas</p>
                  <div role="radiogroup" aria-label="Paletas" className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {PALETAS.map(pal => {
                      const activa = borrador.primary.toLowerCase() === pal.color.toLowerCase();
                      return (
                        <button
                          key={pal.nombre}
                          type="button"
                          role="radio"
                          aria-checked={activa}
                          onClick={() => { setAviso(null); setBorrador(b => (b ? { ...b, primary: pal.color } : b)); }}
                          className={cn('flex h-12 items-center gap-3 rounded-[12px] border bg-card px-4 text-left transition-shadow hover:shadow-md', activa ? 'border-transparent ring-2' : 'border-border')}
                          style={activa ? { ['--tw-ring-color' as string]: pal.color, backgroundColor: `color-mix(in srgb, ${pal.color} 8%, var(--card))` } : undefined}
                        >
                          <span aria-hidden className="flex -space-x-1.5">
                            <span className="size-6 rounded-full ring-2 ring-card" style={{ backgroundColor: `color-mix(in srgb, ${pal.color} 45%, white)` }} />
                            <span className="size-6 rounded-full ring-2 ring-card" style={{ backgroundColor: pal.color }} />
                          </span>
                          <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-foreground">{pal.nombre}</span>
                          {activa && <Check size={15} style={{ color: pal.color }} aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-foreground">O afínalo tú</p>
                </div>
              )}
              <CampoColor
                etiqueta="Color de tu marca"
                valor={borrador.primary}
                onChange={v => { setAviso(null); setBorrador(b => (b ? { ...b, primary: v } : b)); }}
              />
              {!coloresValidos && (
                <p role="alert" className="text-sm text-destructive">Escríbelo como #RRGGBB: seis cifras, por ejemplo #7C3AED.</p>
              )}
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-foreground">Intensidad</p>
                <Segmentado
                  etiqueta="Intensidad del color"
                  valor={borrador.app.marca}
                  opciones={[{ valor: 'suave', texto: 'Suave' }, { valor: 'fiel', texto: 'Tal cual' }]}
                  onChange={marca => setApp({ marca })}
                />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {borrador.app.marca === 'suave'
                    ? 'Tu tono, en una versión apagada y elegante.'
                    : 'Tu color como es. Si es muy claro, lo oscurecemos lo justo para que el texto encima se lea.'}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-foreground">Botón principal</p>
                <Segmentado
                  etiqueta="Color del botón principal"
                  valor={borrador.app.boton}
                  opciones={[{ valor: 'tinta', texto: 'Oscuro' }, { valor: 'marca', texto: 'En tu color' }]}
                  onChange={boton => setApp({ boton })}
                />
                <p className="text-[12px] leading-relaxed text-muted-foreground">«Reservar», «Comprar», la pestaña activa… de tu app. En tu página de reservas los botones van siempre en tu color.</p>
              </div>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
                  <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
                  {TEXTO_SECUNDARIO}
                </summary>
                <div className="mt-3">
                  <CampoColor
                    etiqueta="Color secundario"
                    valor={borrador.secondary}
                    onChange={v => { setAviso(null); setBorrador(b => (b ? { ...b, secondary: v } : b)); }}
                  />
                </div>
              </details>
            </div>
          </Seccion>}

          {(!panelNuevo || paso === 'letra') && <Seccion enAsistente={panelNuevo} titulo="Tipografía" orden={2} detalle="Una letra para los títulos y otra para el texto, elegidas para ir juntas. La de títulos la llevan además los botones, los rótulos y las etiquetas.">
            <div role="radiogroup" aria-label="Tipografía de la app" className="grid gap-2 sm:grid-cols-2">
              {TIPOGRAFIAS.map(t => {
                const activo = borrador.app.tipografia === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setApp({ tipografia: t.id })}
                    className={cn(
                      'rounded-xl border px-4 py-3 text-left',
                      'transition-[box-shadow,transform,border-color] duration-200 ease-out active:scale-[.99]',
                      activo ? 'border-brand shadow-md ring-2 ring-brand/30' : 'border-border hover:-translate-y-0.5 hover:shadow-md',
                    )}
                  >
                    <span className="flex items-center justify-between text-[12px] text-muted-foreground">
                      {t.nombre}
                      {activo && <Check size={14} className="text-brand-medio" aria-hidden />}
                    </span>
                    <span
                      className="mt-1 block text-foreground"
                      style={{ fontFamily: t.titulos, fontWeight: t.pesoTitulo, fontSize: 21 * t.escalaTitulo, lineHeight: 1.15 }}
                    >
                      Buenos días, Lucía
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground" style={{ fontFamily: t.texto }}>
                      Reformer · 18:00 · {t.familias}
                    </span>
                  </button>
                );
              })}
            </div>
          </Seccion>}

          {(!panelNuevo || paso === 'entrada') && <Seccion enAsistente={panelNuevo}
            titulo="La entrada" orden={3}
            detalle="La primera pantalla, donde tus alumnas entran o se registran. La foto es la de portada; el titular lo escribes tú."
          >
            <div className="flex flex-col gap-3">
              <label htmlFor="titulo-acceso" className="text-[13px] font-medium text-foreground">
                Titular de la entrada
              </label>
              <textarea
                id="titulo-acceso"
                rows={3}
                maxLength={120}
                value={tituloAcceso ?? studio.tituloAcceso ?? ''}
                placeholder={TITULO_ACCESO_POR_DEFECTO}
                onChange={e => { setAviso(null); setTituloAcceso(e.target.value); }}
                className={cn(inputCls, 'min-h-24 resize-y leading-relaxed')}
              />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Una frase corta, en tres renglones como mucho: cada salto de línea se respeta. Si lo dejas vacío,
                se lee «{TITULO_ACCESO_POR_DEFECTO.replace(/\n/g, ' ')}».
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={guardandoTitulo || tituloAcceso === null || tituloAcceso === (studio.tituloAcceso ?? '')}
                  onClick={async () => {
                    if (tituloAcceso === null) return;
                    setGuardandoTitulo(true);
                    const res = await updateStudio({ tituloAcceso: tituloAcceso.trim() || null });
                    setGuardandoTitulo(false);
                    setAviso(res.ok // toast-no-es-error: el aviso lleva `tipo` y el error se pinta como alert en rojo
                      ? { tipo: 'ok', texto: 'Titular guardado. Ya se lee en tu entrada.' }
                      : { tipo: 'error', texto: res.error });
                    if (res.ok) { setTituloAcceso(null); setPantalla('entrada'); setRecarga(n => n + 1); }
                  }}
                >
                  {guardandoTitulo ? 'Guardando…' : 'Guardar el titular'}
                </button>
                <span className="text-[12px] text-muted-foreground">Se guarda al momento, sin esperar a «Publicar».</span>
              </div>
            </div>
          </Seccion>}

          {(!panelNuevo || paso === 'fotos') && <Seccion enAsistente={panelNuevo}
            titulo="Fotos"
            orden={4}
            detalle="Las fotos se guardan al subirlas, sin esperar a «Publicar»: tus alumnas las ven al momento."
          >
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-2 text-[13px] font-medium text-foreground">Portada</p>
                <CampoImagen
                  etiqueta="portada"
                  valor={studio.imagenBienvenidaUrl}
                  respaldo={imagenDeEstudio('portada', null, studio.slug)}
                  onSubir={subirPortada}
                  onCambiar={cambiarPortada}
                  ocupado={subiendo}
                  clasePreview="w-40 h-24"
                  textoSubir="Subir portada"
                  textoCambiar="Cambiar portada"
                  ayuda={
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      La primera imagen que ven al abrir la app y al entrar. Horizontal, de tu sala o de una clase; mejor sin texto encima.
                    </p>
                  }
                />
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-[13px] font-medium text-foreground">Qué parte de la foto se ve</p>
                  <Segmentado
                    etiqueta="Encuadre de la portada"
                    valor={encuadre ?? 'auto'}
                    opciones={[
                      { valor: 'auto', texto: 'Automático' },
                      { valor: 'arriba', texto: 'Arriba' },
                      { valor: 'centro', texto: 'Centro' },
                      { valor: 'abajo', texto: 'Abajo' },
                    ]}
                    onChange={v => setApp({ encuadre: v === 'auto' ? null : v })}
                  />
                </div>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {[
                  { href: '/configuracion?tab=marca#logo-y-favicon', titulo: 'Logo', detalle: 'En la cabecera de la app y en el icono del móvil' },
                  { href: '/configuracion?tab=clases', titulo: 'Fotos de tus clases', detalle: 'Una por tipo de clase, en el horario y en cada reserva' },
                  { href: '/equipo', titulo: 'Fotos de tu equipo', detalle: 'En la ficha de cada instructora' },
                ].map(f => (
                  <li key={f.href}>
                    <Link href={f.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                      <span>
                        <span className="block text-[13px] font-medium text-foreground">{f.titulo}</span>
                        <span className="block text-[12px] text-muted-foreground">{f.detalle}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Seccion>}

          {studio.slug && (!panelNuevo || paso === 'instalar') && (
            <Seccion
              enAsistente={panelNuevo}
              titulo="Instalar en el móvil"
              orden={5}
              detalle="Cómo se instala la app de tu estudio y cómo hacérselo llegar a tus alumnas."
            >
              <AppEnElMovil
                nombre={studio.nombre}
                slug={studio.slug}
                // El color del icono real (el manifest de su app) es el del tema publicado, no la
                // columna `color_primario` del alta, que en casi todos los estudios es otro.
                colorPrimario={publicado.primary ?? studio.colorPrimario}
                faviconUrl={publicado.faviconUrl ?? null}
                logoUrl={studio.logoUrl}
              />
            </Seccion>
          )}

          {pedirApp && studio.id && (!panelNuevo || paso === 'instalar') && (
            <Seccion
              enAsistente={panelNuevo}
              titulo="Tu app en la App Store"
              orden={6}
              detalle="Una app con el nombre y el icono de tu estudio, para la App Store."
            >
              <MiAppDeTienda studioId={studio.id} />
            </Seccion>
          )}
          {panelNuevo && (() => {
            const k = pasos.findIndex(p => p.id === paso);
            const anterior = k > 0 ? pasos[k - 1] : null;
            const siguiente = k < pasos.length - 1 ? pasos[k + 1] : null;
            return (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                {anterior ? (
                  <button type="button" onClick={() => irAPaso(anterior.id)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted">
                    <ArrowLeft size={15} aria-hidden /> Atrás
                  </button>
                ) : <span />}
                {siguiente ? (
                  <BotonVivo label={<>Siguiente <ArrowRight size={15} aria-hidden /></>} onClick={() => irAPaso(siguiente.id)} className="h-10 px-5 text-[14px]" />
                ) : (
                  <button
                    type="button"
                    onClick={publicar}
                    disabled={!puedePublicar}
                    title={!soyPropietaria ? 'Solo la propietaria puede publicar' : cambios.length === 0 ? 'No hay cambios que publicar' : undefined}
                    className={cn(BOTON_DESTACADO, 'h-10 px-5 text-[14px] disabled:pointer-events-none disabled:opacity-50')}
                  >
                    {reciénPublicado ? <><Check size={15} aria-hidden /> Publicada</> : publicando ? 'Publicando…' : 'Publicar mi app'}
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        <div className={panelNuevo ? 'order-2 lg:sticky lg:top-20' : 'order-1 lg:sticky lg:top-20 lg:order-2'}>
          {panelNuevo ? (
            // Como Bonsai: el móvil sobre un panel grande de color, con los tonos del logo.
            <div
              className="flex min-h-[560px] items-center justify-center rounded-[28px] px-4 py-8 sm:px-8"
              style={{ backgroundImage: 'linear-gradient(140deg, color-mix(in srgb, var(--t-blue-500) 88%, white), color-mix(in srgb, var(--t-magenta-500) 72%, white))' }}
            >
              {studio.slug
                ? <VistaPrevia slug={studio.slug} css={css} recarga={recarga} pantalla={pantalla} onPantalla={setPantalla} paginaOculta={paginaOculta} />
                : <p className="max-w-xs rounded-2xl bg-card/90 p-4 text-[13px] text-foreground">Tu estudio aún no tiene dirección propia, así que no hay app que enseñar. Se la pones en «Mi app y mi web».</p>}
            </div>
          ) : (studio.slug
            ? <VistaPrevia slug={studio.slug} css={css} recarga={recarga} pantalla={pantalla} onPantalla={setPantalla} paginaOculta={paginaOculta} />
            : <p className="max-w-xs text-[13px] text-muted-foreground">Tu estudio aún no tiene dirección propia, así que no hay app que enseñar. Se la pones en «Mi app y mi web».</p>)}
        </div>
      </div>

      {/* Barra fija: lo que hay sin publicar y las dos salidas. En el panel nuevo,
          solo cuando hay algo que decir (cambios, un aviso): «Todo publicado» de
          relleno no; y publicar del todo es el último paso. */}
      {(!panelNuevo || cambios.length > 0 || aviso) && (
      <div className={panelNuevo
        ? 'sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-card/95 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-t-card'
        : 'sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-card/95 backdrop-blur sm:mx-0 sm:rounded-t-xl sm:border-x'}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:pr-24">
          <p
            role={aviso?.tipo === 'error' ? 'alert' : 'status'}
            className={cn(
              'flex items-center gap-1.5 text-[13px] transition-colors duration-300',
              aviso?.tipo === 'error' ? 'text-destructive' : reciénPublicado ? 'font-medium text-brand-medio' : 'text-muted-foreground',
            )}
          >
            {reciénPublicado && <Check size={15} className="shrink-0" aria-hidden />}
            {aviso?.texto ?? (cambios.length > 0 ? 'Tienes cambios sin publicar.' : 'Todo publicado.')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={cambios.length === 0 || publicando}
              onClick={() => { setBorrador(inicial); setAviso(null); }}
            >
              <span className="inline-flex items-center gap-1.5"><RotateCcw size={14} aria-hidden /> Descartar</span>
            </button>
            <button
              type="button"
              className={panelNuevo
                ? cn(BOTON_VIVO, 'h-10 px-5 text-[14px] disabled:pointer-events-none disabled:opacity-50')
                : cn(btnPrimary, 'transition-transform duration-200 active:scale-[.97]')}
              disabled={!puedePublicar}
              onClick={publicar}
              title={!soyPropietaria ? 'Solo la propietaria puede publicar' : undefined}
            >
              {reciénPublicado
                ? <span className="inline-flex items-center gap-1.5"><Check size={15} aria-hidden /> Publicado</span>
                : publicando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
