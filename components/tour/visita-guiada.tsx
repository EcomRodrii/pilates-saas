'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La visita guiada, a la vista. Se monta UNA vez en DashboardShell.
//
// «No omitible» quiere decir: sin X, sin «saltar», y la píldora no se puede
// cerrar hasta el último capítulo. NO quiere decir «bloquea la app»: una reserva
// urgente, una llamada o un cobro no pueden quedar tapados por un overlay (ya
// pasó una vez con el tour anterior). Por eso:
//
//  · La máscara oscura y el anillo son `pointer-events-none`: la página de debajo
//    sigue siendo clicable. Solo la tarjeta (y las tres pantallas centrales,
//    breves) toman el ratón.
//  · No hay redirección forzada: el paso te lleva a su pantalla UNA vez, al
//    entrar. Si te vas a otra, la tarjeta dice dónde está el paso y ofrece
//    «Llévame».
//  · Con un diálogo abierto (asignar un plan, crear una sala…) la tarjeta se
//    convierte en un banner de solo texto, que no tapa ni quita foco al diálogo.
//  · Si algo falla, no se salta en mudo ni se atrapa: el paso que no se puede
//    señalar se enseña sin foco y avisa a Sentry; el «hacer» que no sale en 60 s
//    ofrece «Ahora no puedo» (queda aplazado y se enseña al final con su enlace).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTour } from '@/lib/tour-context';
import { useStudio } from '@/lib/studio-context';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { CAPITULOS, lugarCoincide, pasoPorId, rutaBase, selectorCss, type CapituloVisita, type PasoVisita } from '@/lib/tour/capitulos';
import { datosHecho, type DatosHecho } from '@/lib/tour/hecho';
import { aplazadosEnOrden, capitulosConPasos, pasoAnteriorA, pasoCerrado } from '@/lib/tour/progreso';
import { PantallaAperturaCapitulo, PantallaCapituloVisita, PantallaFinVisita, PantallaInicioVisita } from '@/components/tour/pantallas-visita';

const ESPERA_OBJETIVO_MS = 8_000;
const ESPERA_APLAZAR_MS = 60_000;
const AVANCE_AUTOMATICO_MS = 1_500;
const MARGEN = 12;

// ── Lo que se ve en pantalla ─────────────────────────────────────────────────

/** El primer elemento con ese `data-tour` que se VE (la barra de móvil y la de escritorio conviven en el DOM). */
function elementoVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selectorCss(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** ¿Hay un diálogo de la app abierto? (los nuestros llevan `data-visita` y no cuentan.) */
function hayDialogoAbierto(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-visita]), [role="alertdialog"]:not([data-visita])');
}

/**
 * La pestaña (`?tab=`) en la que está la pantalla ahora mismo. Se lee del navegador
 * y no de `useSearchParams`: Configuración cambia de pestaña con `pushState`, que Next
 * tarda un render en enterarse, y `useSearchParams` obliga a un Suspense en todas las
 * páginas del panel. Un intervalo corto es barato y siempre dice la verdad.
 */
function useTabActual(): string | null {
  // Lectura inicial perezosa: esta pieza solo se monta con la visita ya activa (después de hidratar).
  const [tab, setTab] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab')));
  useEffect(() => {
    const leer = () => setTab(prev => { const t = new URLSearchParams(window.location.search).get('tab'); return prev === t ? prev : t; });
    leer();
    const id = window.setInterval(leer, 300);
    window.addEventListener('popstate', leer);
    return () => { window.clearInterval(id); window.removeEventListener('popstate', leer); };
  }, []);
  return tab;
}

function mismoRect(a: DOMRect | null, b: DOMRect): boolean {
  return !!a && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

/**
 * Localiza el elemento del paso y lo sigue (scroll, resize, la página que se
 * recoloca al cargar). Si pasados 8 s de carga no aparece, lo dice: la tarjeta se
 * enseña sin foco y se avisa a Sentry. Nunca se salta el paso en silencio.
 */
function useObjetivo(paso: PasoVisita, enRuta: boolean, cargando: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [sinFoco, setSinFoco] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [segundosHaciendo, setMsHaciendo] = useState(0);
  const avisado = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mide el DOM real: el ejemplo canónico de efecto legítimo.
    setRect(null); setSinFoco(false); setMsHaciendo(0);
    if (!enRuta || cargando) return;
    const inicio = Date.now();
    let centrado = false;
    const medir = () => {
      const el = elementoVisible(paso.selector);
      if (el) {
        if (!centrado) { centrado = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        const r = el.getBoundingClientRect();
        setRect(prev => (mismoRect(prev, r) ? prev : r));
        setSinFoco(false);
      } else if (Date.now() - inicio > ESPERA_OBJETIVO_MS) {
        setSinFoco(true);
        if (avisado.current !== paso.id) {
          avisado.current = paso.id;
          capturarExcepcion(new Error(`Visita guiada: no se encontró «${paso.selector}»`), { tags: { area: 'tour', paso: paso.id } });
        }
      }
      const abierto = hayDialogoAbierto();
      setDialogo(prev => (prev === abierto ? prev : abierto));
      // El reloj de «Ahora no puedo» solo corre si de verdad se está intentando.
      if (paso.tipo === 'hacer' && !document.hidden && !abierto) setMsHaciendo(ms => ms + 250);
    };
    medir();
    const id = window.setInterval(medir, 250);
    // Scroll y resize van a un fotograma como mucho: medir en cada evento de scroll con
    // `capture` (cualquier contenedor) metía lecturas de layout a cientos por segundo.
    let pendiente = 0;
    const alMover = () => { if (!pendiente) pendiente = requestAnimationFrame(() => { pendiente = 0; medir(); }); };
    window.addEventListener('resize', alMover);
    window.addEventListener('scroll', alMover, { capture: true, passive: true });
    return () => {
      window.clearInterval(id); if (pendiente) cancelAnimationFrame(pendiente);
      window.removeEventListener('resize', alMover); window.removeEventListener('scroll', alMover, true);
    };
  }, [paso.id, paso.selector, paso.tipo, enRuta, cargando]);

  return { rect, sinFoco, dialogo, puedeAplazar: segundosHaciendo >= ESPERA_APLAZAR_MS };
}

// ── Datos reales, solo cuando el paso los necesita ───────────────────────────

interface DatosPaso { hecho: DatosHecho; primeraClienta: string | null }

/** Lee los datos del estudio (useStudio, el god-context) SOLO mientras hay un paso que los pide. */
function ConDatosReales({ children }: { children: (d: DatosPaso) => React.ReactNode }) {
  const { studio, salas, tiposClase, sesiones, socios, instructores, planesTarifa, suscripciones } = useStudio();
  const hecho = datosHecho({
    studio: { nif: studio?.nif ?? null, razonSocial: studio?.razonSocial ?? null, logoUrl: studio?.logoUrl ?? null },
    salas, tiposClase, sesiones, socios, instructores, planesTarifa, suscripciones,
  });
  return <>{children({ hecho, primeraClienta: socios[0]?.id ?? null })}</>;
}

function necesitaDatos(paso: PasoVisita) {
  return paso.tipo === 'hacer' || !!paso.requiere || paso.ruta.endsWith('/*');
}

function destinoDe(paso: PasoVisita, d: DatosPaso | null): string | null {
  if (paso.ruta.endsWith('/*')) return d?.primeraClienta ? `${rutaBase(paso.ruta)}/${d.primeraClienta}` : null;
  return paso.href ?? paso.ruta;
}

// ── La píldora: siempre presente hasta el final ──────────────────────────────

function Pildora({ texto, onClick, escritorio }: { texto: string; onClick: () => void; escritorio: boolean }) {
  return (
    <button
      type="button" onClick={onClick} data-visita
      style={escritorio ? { left: 'calc(var(--sidebar-w, 0px) + 16px)', bottom: 16 } : { left: 8, bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 8px)' }}
      className="fixed z-[45] inline-flex min-h-11 items-center gap-2 rounded-full border border-brand/40 bg-card px-4 text-[13px] font-semibold text-foreground shadow-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="size-2 rounded-full bg-brand" aria-hidden />
      {texto}
      <ArrowRight size={14} aria-hidden />
    </button>
  );
}

// ── La tarjeta de un paso ────────────────────────────────────────────────────

function TarjetaPaso({ capitulo, paso, numero, de, numeroCapitulo, totalCapitulos, cargando, repaso, onVolver, onAnterior, llevar }: {
  capitulo: CapituloVisita; paso: PasoVisita; numero: number; de: number;
  numeroCapitulo: number; totalCapitulos: number; cargando: boolean;
  /** Estás repasando un paso que ya cerraste: no se vuelve a cerrar nada. */
  repaso: boolean; onVolver: () => void; onAnterior: (id: string) => void;
  /** El paso acaba de cambiar en esta sesión: lleva a su pantalla. Tras recargar, NO. */
  llevar: boolean;
}) {
  const t = useTour();
  const pathname = usePathname();
  const tabActual = useTabActual();
  // Estar en `/configuracion` NO es estar en el sitio: cada pestaña es otra pantalla.
  const enRuta = lugarCoincide(paso, pathname, tabActual);
  const [minimizada, setMinimizada] = useState(false);
  const { rect, sinFoco, dialogo, puedeAplazar } = useObjetivo(paso, enRuta, cargando);

  // (Al cambiar de paso, VisitaGuiada la monta de nuevo con `key`: vuelve a abrirse sola.)

  if (minimizada) {
    return <Pildora escritorio={t.escritorio} onClick={() => setMinimizada(false)} texto={`Visita guiada · Cap. ${numeroCapitulo} de ${totalCapitulos} · Continuar`} />;
  }

  const contenido = (datos: DatosPaso | null) => (
    <ContenidoPaso
      capitulo={capitulo} paso={paso} numero={numero} de={de} numeroCapitulo={numeroCapitulo} totalCapitulos={totalCapitulos}
      enRuta={enRuta} rect={rect} sinFoco={sinFoco} dialogo={dialogo} puedeAplazar={puedeAplazar}
      datos={datos} repaso={repaso} onVolver={onVolver} onAnterior={onAnterior} llevar={llevar} onMinimizar={() => setMinimizada(true)}
    />
  );
  return necesitaDatos(paso) ? <ConDatosReales>{contenido}</ConDatosReales> : <>{contenido(null)}</>;
}

function ContenidoPaso({
  capitulo, paso, numero, de, numeroCapitulo, totalCapitulos, enRuta, rect, sinFoco, dialogo, puedeAplazar, datos, repaso, onVolver, onAnterior, llevar, onMinimizar,
}: {
  capitulo: CapituloVisita; paso: PasoVisita; numero: number; de: number; numeroCapitulo: number; totalCapitulos: number;
  enRuta: boolean; rect: DOMRect | null; sinFoco: boolean; dialogo: boolean; puedeAplazar: boolean;
  datos: DatosPaso | null; repaso: boolean; onVolver: () => void; onAnterior: (id: string) => void; llevar: boolean; onMinimizar: () => void;
}) {
  const t = useTour();
  const router = useRouter();
  const tarjeta = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const hacer = paso.tipo === 'hacer';
  const yaHecho = hacer && !!paso.hecho && !!datos?.hecho[paso.hecho];
  // ¿Lo tenía ya al llegar, o lo acaba de hacer? Los datos del estudio tardan un momento en cargar, así
  // que lo que aparece en los primeros segundos cuenta como «ya lo tenía». Quien ya lo tiene LEE el paso
  // a su ritmo (con su «Entendido»); quien lo acaba de hacer ve el ✓ y pasa solo.
  const montadoEn = useRef(0);
  useEffect(() => { montadoEn.current = Date.now(); }, []);
  const [preexistente, setPreexistente] = useState<boolean | null>(null);
  useEffect(() => {
    if (yaHecho && preexistente === null) setPreexistente(Date.now() - montadoEn.current < 4000);
  }, [yaHecho, preexistente]);
  const lee = hacer && yaHecho && preexistente === true;
  const comoMira = !hacer || lee;
  const faltaClienta = !!paso.requiere && !!datos && !datos.hecho.socios;
  const destino = destinoDe(paso, datos);
  const anterior = pasoAnteriorA(t.progreso, paso.id, t.aplica);

  const ir = useCallback(() => { if (destino) router.push(destino); }, [destino, router]);

  // Pasar al paso siguiente te lleva a su pantalla UNA vez. Si luego te vas, no te
  // persigue; y al recargar la página tampoco te arrastra de vuelta (`llevar` es
  // falso hasta que el paso cambia dentro de esta sesión).
  const llevado = useRef<string | null>(null);
  useEffect(() => {
    if (!llevar || enRuta || !destino || llevado.current === paso.id) return;
    llevado.current = paso.id;
    router.push(destino);
  }, [llevar, enRuta, destino, paso.id, router]);

  // Teclado: → o Intro pasan al siguiente paso, ← vuelve al anterior. Solo si no se está escribiendo
  // en ningún sitio (el foco está en la página, no en un campo ni en un botón).
  useEffect(() => {
    if (dialogo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.activeElement !== document.body) return;
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && comoMira && !repaso && !faltaClienta && enRuta) { e.preventDefault(); t.cerrar(paso, 'hecho'); }
      else if (e.key === 'ArrowLeft' && anterior && !repaso) { e.preventDefault(); onAnterior(anterior.id); }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogo, comoMira, repaso, faltaClienta, enRuta, anterior?.id, paso.id]);

  // Un «hacer» cumplido (ya lo tenías, o lo acabas de hacer) se da por bueno.
  useEffect(() => {
    if (!yaHecho || repaso || preexistente !== false) return;
    const id = window.setTimeout(() => t.cerrar(paso, 'hecho'), AVANCE_AUTOMATICO_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yaHecho, repaso, preexistente, paso.id]);

  // Colocación en escritorio: SIEMPRE en una esquina (la tarjeta no salta de un sitio a otro paso tras
  // paso, que desorienta), y la primera esquina que no tape lo que se está señalando. La tarjeta se MIDE,
  // no se estima. Si el elemento ocupa tanto que las tres esquinas lo tapan algo, gana la que menos.
  useEffect(() => {
    const el = tarjeta.current;
    if (!el || !t.escritorio || dialogo) { setPos(null); return; }
    const alto = el.offsetHeight, ancho = el.offsetWidth;
    const W = window.innerWidth, H = window.innerHeight;
    const lateral = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
    const izq = (Number.isFinite(lateral) && lateral > 0 ? lateral : 0) + 16;
    const candidatas = [
      { top: H - alto - MARGEN, left: W - ancho - MARGEN },            // abajo a la derecha
      { top: 76, left: W - ancho - MARGEN },                            // arriba a la derecha
      { top: H - alto - MARGEN, left: izq },                            // abajo a la izquierda del contenido
    ];
    const tapa = (c: { top: number; left: number }) => {
      if (!rect) return 0;
      const x = Math.max(0, Math.min(c.left + ancho, rect.right + 12) - Math.max(c.left, rect.left - 12));
      const y = Math.max(0, Math.min(c.top + alto, rect.bottom + 12) - Math.max(c.top, rect.top - 12));
      return x * y;
    };
    const mejor = candidatas.reduce((m, c) => (tapa(c) < tapa(m) ? c : m), candidatas[0]);
    setPos(prev => (prev && prev.top === mejor.top && prev.left === mejor.left ? prev : mejor));
  }, [t.escritorio, rect, dialogo, yaHecho, faltaClienta, sinFoco, enRuta]);

  const progreso = Math.round(((numero - (yaHecho || repaso ? 0 : 1)) / de) * 100);

  // Con un diálogo abierto: solo texto, sin tocar nada.
  if (dialogo) {
    return (
      <div data-visita role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center p-2">
        <p className="max-w-xl rounded-2xl bg-foreground px-4 py-2.5 text-[13px] leading-snug text-background shadow-xl">
          <span className="font-semibold">{paso.titulo}.</span> {lee ? paso.accionSiYaLoTienes : paso.accion}
        </p>
      </div>
    );
  }

  const anillo = rect && enRuta ? (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[44]">
      <div
        className={cn('absolute rounded-xl transition-all duration-200', hacer && 'animate-pulse motion-reduce:animate-none')}
        style={{
          top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16,
          boxShadow: hacer ? 'none' : '0 0 0 9999px rgba(0,0,0,0.55)',
          outline: '2px solid var(--brand-secondary, var(--brand))', outlineOffset: 2,
        }}
      />
    </div>
  ) : null;

  const movil = !t.escritorio;
  const estilo: React.CSSProperties = movil
    ? { left: 8, right: 8, bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 8px)', maxHeight: '45dvh' }
    : pos
      ? { top: pos.top, left: pos.left, width: 340 }
      : { right: 16, bottom: 16, width: 340 };

  return (
    <>
      {anillo}
      <div ref={tarjeta} data-visita role="region" aria-label={`Visita guiada: ${paso.titulo}`} aria-live="polite" style={estilo}
        className="fixed z-[45] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Capítulo {numeroCapitulo} de {totalCapitulos} · Paso {numero} de {de}
          </p>
          <button type="button" onClick={onMinimizar} aria-label="Ocultar la tarjeta (la visita sigue)" title="Ocultar la tarjeta (la visita sigue)"
            className="-m-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted">
            <ChevronDown size={15} aria-hidden />
          </button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(4, progreso)}%` }} />
        </div>
        <p className="mt-3 text-[15px] font-bold leading-snug text-foreground text-balance">{paso.titulo}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{paso.texto}</p>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-brand/10 px-3 py-2.5 text-[13.5px] font-semibold leading-snug text-foreground">
          <MousePointerClick size={16} className="mt-0.5 shrink-0 text-brand-medio" aria-hidden />
          <span className="min-w-0">{lee && paso.accionSiYaLoTienes ? paso.accionSiYaLoTienes : paso.accion}</span>
        </p>

        {!enRuta && (
          llevar && destino ? (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> Te llevo a {nombrePantalla(paso)}…</p>
          ) : (
            <p className="mt-3 rounded-xl bg-muted/70 px-3 py-2 text-[12.5px] text-muted-foreground">
              Este paso está en <span className="font-semibold text-foreground">{nombrePantalla(paso)}</span>.
            </p>
          )
        )}
        {enRuta && sinFoco && (
          <p className="mt-3 rounded-xl bg-muted/70 px-3 py-2 text-[12.5px] text-muted-foreground">
            No encuentro el recuadro en esta pantalla. Pulsa «Llévame» y lo intento de nuevo.
          </p>
        )}
        {enRuta && !rect && !sinFoco && (
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> Buscando el sitio…</p>
        )}

        {faltaClienta && (
          <div className="mt-3 rounded-xl bg-warning/10 px-3 py-2.5 text-[12.5px] text-foreground">
            Para este paso hace falta al menos una clienta.
            <button type="button" onClick={() => router.push('/clientas?nuevo=1')} className="mt-1.5 block font-semibold text-brand-medio underline underline-offset-2">
              Añadir una clienta
            </button>
          </div>
        )}

        {hacer && !repaso && (
          yaHecho ? (
            <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-success"><Check size={15} aria-hidden /> {lee ? 'Ya lo tienes hecho' : 'Hecho. Pasamos al siguiente…'}</p>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> Esperando a que lo hagas…</p>
          )
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {anterior && !repaso && (
              <button type="button" onClick={() => onAnterior(anterior.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted">
                <ArrowLeft size={12} aria-hidden /> Anterior
              </button>
            )}
            {!t.obligatoria && !repaso && (
              <button type="button" onClick={t.salir} className="min-h-9 rounded-lg px-2 text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground">Salir de la visita</button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(!enRuta || sinFoco) && destino && (
              <button type="button" onClick={ir} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground hover:brightness-95">
                Llévame <ArrowRight size={13} aria-hidden />
              </button>
            )}
            {repaso && (
              <button type="button" onClick={onVolver} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground hover:brightness-95">
                Seguir donde iba <ArrowRight size={13} aria-hidden />
              </button>
            )}
            {!repaso && comoMira && !faltaClienta && (
              <button type="button" onClick={() => t.cerrar(paso, 'hecho')} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground hover:brightness-95">
                Entendido <ArrowRight size={13} aria-hidden />
              </button>
            )}
            {!repaso && ((hacer && puedeAplazar && !yaHecho) || faltaClienta) && (
              <button type="button" onClick={() => t.cerrar(paso, 'aplazado')} className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-[12.5px] font-medium text-foreground hover:bg-muted">
                {faltaClienta ? 'Verlo más tarde' : 'Ahora no puedo hacerlo'}
              </button>
            )}
          </div>
        </div>
        <span className="sr-only">{capitulo.titulo}</span>
      </div>
    </>
  );
}

function nombrePantalla(paso: PasoVisita): string {
  const base = rutaBase(paso.ruta);
  const nombres: Record<string, string> = {
    '/dashboard': 'el Resumen', '/configuracion': 'Configuración', '/calendario': 'el Calendario', '/citas': 'Citas', '/clientas': 'la ficha de una clienta',
    '/productos': 'Paquetes', '/cobros': 'Cobros', '/pos': 'la Caja', '/equipo': 'Equipo', '/sustituciones': 'Sustituciones',
    '/automatizaciones': 'Automatizaciones', '/centro-de-control': 'el Centro de Control', '/mensajeria': 'Mensajería', '/marketing': 'Marketing',
    '/informes': 'Informes', '/cierre': 'el Cierre de año', '/primeros-pasos': 'Primeros pasos',
  };
  return nombres[base] ?? 'otra pantalla';
}

// ── El conjunto ──────────────────────────────────────────────────────────────

export function VisitaGuiada({ cargando }: { cargando: boolean }) {
  const t = useTour();
  const router = useRouter();
  // Repasar un paso ya cerrado («Anterior»): no cambia el progreso.
  const [repasoId, setRepasoId] = useState<string | null>(null);
  // El último paso que se enseñó en esta sesión: solo si CAMBIA se lleva a su pantalla.
  const [ultimoPaso, setUltimoPaso] = useState<string | null>(null);
  // Si la persona acaba de pulsar «Empezar» o «Empezar el capítulo», el primer paso la lleva a su
  // pantalla aunque no haya habido un paso anterior en esta sesión.
  const [conIntencion, setConIntencion] = useState(false);
  const idEnPantalla = t.estado.fase === 'paso' ? t.estado.paso.id : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Recuerda qué paso se acaba de enseñar para no arrastrar al recargar.
    if (idEnPantalla) setUltimoPaso(idEnPantalla);
  }, [idEnPantalla]);

  const { estado } = t;

  if (!t.activo) return null;

  const capitulos = capitulosConPasos(t.aplica);
  const numeroDe = (id: string) => capitulos.findIndex(c => c.id === id) + 1;
  const etiquetaPildora = (id: string) => `Visita guiada · Cap. ${Math.max(1, numeroDe(id))} de ${capitulos.length} · Continuar`;

  if (t.pausada) {
    const id = estado.fase === 'paso' || estado.fase === 'capitulo' || estado.fase === 'apertura' ? estado.capitulo.id : CAPITULOS[0].id;
    return <Pildora escritorio={t.escritorio} onClick={t.reanudar} texto={etiquetaPildora(id)} />;
  }

  if (estado.fase === 'inicio') {
    return <PantallaInicioVisita capitulos={capitulos} obligatoria={t.obligatoria} onEmpezar={() => { setConIntencion(true); t.empezarVisita(); }} onSalir={t.salir} />;
  }

  if (estado.fase === 'apertura') {
    return (
      <PantallaAperturaCapitulo
        capitulo={estado.capitulo} numero={estado.numero} total={capitulos.length}
        pasos={estado.capitulo.pasos.filter(t.aplica)}
        onEmpezar={() => { setConIntencion(true); t.abrirCapitulo(estado.capitulo.id); }}
      />
    );
  }

  if (estado.fase === 'capitulo') {
    const i = capitulos.findIndex(c => c.id === estado.capitulo.id);
    const siguiente = capitulos.slice(i + 1).find(c => !t.progreso.vistos.includes(c.id)) ?? null;
    return (
      <PantallaCapituloVisita
        capitulo={estado.capitulo} numero={i + 1} total={capitulos.length} siguiente={siguiente}
        onSiguiente={() => t.cerrarCapitulo(estado.capitulo.id, false)}
        onOtroDia={() => t.cerrarCapitulo(estado.capitulo.id, true)}
      />
    );
  }

  if (estado.fase === 'fin') {
    const aplazados = aplazadosEnOrden(t.progreso);
    return (
      <PantallaFinVisita
        aplazados={aplazados}
        onTerminar={() => { t.terminar(); router.push('/dashboard'); }}
        onIr={p => { t.terminar(); router.push(p.href ?? (p.ruta.endsWith('/*') ? rutaBase(p.ruta) : p.ruta)); }}
      />
    );
  }

  // Un paso. Si se está repasando uno anterior, es ese.
  const repaso = repasoId ? pasoPorId(repasoId) : undefined;
  const mostrado = repaso && pasoCerrado(t.progreso, repaso.id) ? repaso : estado.paso;
  const enRepaso = mostrado.id !== estado.paso.id;
  const capituloMostrado = CAPITULOS.find(c => mostrado.id.startsWith(`${c.id}.`)) ?? estado.capitulo;
  const propios = capituloMostrado.pasos.filter(t.aplica);
  return (
    <TarjetaPaso
      key={mostrado.id}
      capitulo={capituloMostrado} paso={mostrado}
      numero={propios.findIndex(p => p.id === mostrado.id) + 1} de={propios.length}
      numeroCapitulo={Math.max(1, numeroDe(capituloMostrado.id))} totalCapitulos={capitulos.length}
      cargando={cargando} repaso={enRepaso}
      onVolver={() => setRepasoId(null)} onAnterior={setRepasoId}
      llevar={conIntencion || (ultimoPaso !== null && ultimoPaso !== mostrado.id)}
    />
  );
}
