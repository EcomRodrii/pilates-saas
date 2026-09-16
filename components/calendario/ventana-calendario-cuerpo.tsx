'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, GripHorizontal, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { anfitrionPortal } from '@/lib/panel-portal';
import { PINTA, type EstadoSesion } from '@/lib/calendario-estado';
import { detectarConflictos, hayConflicto } from '@/lib/calendar-logic';
import { construirAgendaDelDia, type ClaseDelDia, type SesionAgenda } from '@/lib/hoy-agenda';
import {
  TZ_ESTUDIO, cn, finDelDiaEstudio, horaEstudio, hoyEnEstudio, inicioDelDiaEstudio, masDias,
} from '@/lib/utils';
import {
  EVENTO_SALTAR_A_CLASE, acotarPosicion, actualizarVentana, origenAperturaReciente,
  posicionInicial, type EstadoVentana, type Punto,
} from '@/lib/calendario/ventana-flotante';
import { BarraPlazas } from '@/components/dashboard/barra-plazas';
import type { Instructor, Reserva, Sesion } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// El cuerpo de la ventana flotante del calendario.
//
// ── Los datos ────────────────────────────────────────────────────────────────
// Los mismos que «Hoy en el estudio» y por el mismo camino: `/api/calendario`
// acotado al día y moldeado por rol, y `construirAgendaDelDia` para decidir el
// estado de cada clase. Nada de `useStudio().sesiones`, que no trae la
// sustitución abierta: una clase sin instructora saldría aquí como normal y en
// Inicio como problema (ver el comentario largo de hoy-en-el-estudio.tsx).
//
// ⚠️ Se filtra el día también aquí, aunque la ruta ya reciba el rango: si una
// respuesta trae de más, la ventana diría «hoy» con clases de otro día.
//
// ── Por qué en portal ────────────────────────────────────────────────────────
// `.panel-page-in` deja un transform en cada página y ancla a ella todo
// `position: fixed` (ver lib/panel-portal.ts). Y va al anfitrión del panel, no a
// `document.body`, para no perder los colores del modo oscuro.
// ─────────────────────────────────────────────────────────────────────────────

interface SesionApi extends Sesion { sustitucionAbierta?: boolean }
interface DatosDia {
  sesiones: SesionApi[];
  reservas: Reserva[];
  instructores: Instructor[];
  /** 0 = lunes … 6 = domingo, como lo devuelve /api/calendario. */
  horarioSemana: { dia: number; abierto: boolean }[];
}
const VACIO: DatosDia = { sesiones: [], reservas: [], instructores: [], horarioSemana: [] };

/** Agrandada enseña siete días; pequeña, uno. */
const DIAS_AGRANDADA = 7;

/** Cada cuánto se refresca sola, además de al cambiar de pantalla y al volver a la pestaña. */
const REFRESCO_MS = 5 * 60_000;

/** Los estados que merecen una etiqueta: programada y finalizada se leen solos. */
const ESTADOS_CON_ETIQUETA = new Set<EstadoSesion>([
  'EN_CURSO', 'SIN_PASAR_LISTA', 'SIN_INSTRUCTORA', 'INCIDENCIA', 'CONFLICTO', 'CANCELADA',
]);

/** Siete columnas de unos 150 px, sin salirse nunca de la pantalla. */
const ANCHO_AGRANDADA = 'w-[min(1080px,calc(100vw-24px))]';

const BOTON = 'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand';

const FORMATO_DIA = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ_ESTUDIO });

const FORMATO_DIA_SEMANA = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: TZ_ESTUDIO });
const FORMATO_NUMERO_DIA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', timeZone: TZ_ESTUDIO });
const FORMATO_MES = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: TZ_ESTUDIO });

const mediodia = (fecha: string) => new Date(`${fecha}T12:00:00`);

function tituloSemana(fecha: string, hoy: string): string {
  const fin = masDias(fecha, DIAS_AGRANDADA - 1);
  const mesIni = FORMATO_MES.format(mediodia(fecha)).replace('.', '');
  const mesFin = FORMATO_MES.format(mediodia(fin)).replace('.', '');
  const rango = mesIni === mesFin
    ? `${FORMATO_NUMERO_DIA.format(mediodia(fecha))}–${FORMATO_NUMERO_DIA.format(mediodia(fin))} ${mesFin}`
    : `${FORMATO_NUMERO_DIA.format(mediodia(fecha))} ${mesIni} – ${FORMATO_NUMERO_DIA.format(mediodia(fin))} ${mesFin}`;
  return fecha === hoy ? `Esta semana · ${rango}` : rango;
}

function tituloDia(fecha: string, hoy: string): string {
  const corto = FORMATO_DIA.format(new Date(`${fecha}T12:00:00`)).replace(',', '');
  if (fecha === hoy) return `Hoy · ${corto}`;
  if (fecha === masDias(hoy, 1)) return `Mañana · ${corto}`;
  if (fecha === masDias(hoy, -1)) return `Ayer · ${corto}`;
  return corto.charAt(0).toUpperCase() + corto.slice(1);
}

export default function VentanaCalendarioCuerpo({ estado, saliendo, alSalir }: {
  estado: EstadoVentana;
  /** Se está cerrando: se anima la salida y al acabar avisa con `alSalir`. */
  saliendo: boolean;
  alSalir: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { tiposClase } = useStudio();

  const [anfitrion, setAnfitrion] = useState<HTMLElement | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    const d = hoyEnEstudio();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Solo en cliente: el anfitrión del portal y el día del estudio no existen en el servidor.
    setAnfitrion(anfitrionPortal());
    setHoy(d);
    setFecha(d);
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Datos del día ──────────────────────────────────────────────────────────
  // Mismo patrón que Inicio: lo cargado recuerda a qué día pertenece, así que
  // cambiar de día no puede pintar un instante las clases de ayer bajo «Hoy».
  const dias = estado.expandida ? DIAS_AGRANDADA : 1;
  const clave = fecha ? `${fecha}|${dias}` : null;
  const [cargado, setCargado] = useState<{ clave: string; datos: DatosDia; fallo: boolean } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const refrescar = useCallback(() => setRecarga(n => n + 1), []);

  useEffect(() => {
    if (!fecha || !clave) return;
    let vivo = true;
    (async () => {
      try {
        const desde = inicioDelDiaEstudio(fecha);
        const hasta = finDelDiaEstudio(masDias(fecha, dias - 1));
        const res = await fetch(
          `/api/calendario?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
          { headers: await authHeader() },
        );
        if (!res.ok) throw new Error(String(res.status));
        const d = ((await res.json()) ?? {}) as Partial<DatosDia>;
        if (!vivo) return;
        const t0 = new Date(desde).getTime();
        const t1 = new Date(hasta).getTime();
        setCargado({
          clave,
          fallo: false,
          datos: {
            sesiones: (Array.isArray(d.sesiones) ? d.sesiones : []).filter((s) => {
              const t = new Date(s.inicio).getTime();
              return t >= t0 && t <= t1;
            }),
            reservas: Array.isArray(d.reservas) ? d.reservas : [],
            instructores: Array.isArray(d.instructores) ? d.instructores : [],
            horarioSemana: Array.isArray(d.horarioSemana) ? d.horarioSemana : [],
          },
        });
      } catch {
        if (vivo) setCargado({ clave, datos: VACIO, fallo: true });
      }
    })();
    return () => { vivo = false; };
  }, [fecha, dias, clave, recarga]);

  // Se refresca en los momentos en que es probable que algo haya cambiado: al
  // pasar a otra pantalla (quizá vienes de apuntar a alguien), al volver a esta
  // pestaña, y cada pocos minutos por si nadie toca nada.
  const primeraRuta = useRef(true);
  useEffect(() => {
    if (primeraRuta.current) { primeraRuta.current = false; return; }
    refrescar();
  }, [pathname, refrescar]);
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar(); };
    document.addEventListener('visibilitychange', alVolver);
    const t = setInterval(refrescar, REFRESCO_MS);
    return () => { document.removeEventListener('visibilitychange', alVolver); clearInterval(t); };
  }, [refrescar]);

  const alDia = cargado !== null && cargado.clave === clave;
  const datos = alDia ? cargado.datos : VACIO;

  const tipoById = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);
  const instructorById = useMemo(() => new Map(datos.instructores.map(i => [i.id, i])), [datos.instructores]);
  const clases = useMemo(() => {
    if (!ahora) return [];
    const conflictos = new Set<string>();
    for (const s of datos.sesiones) {
      if (hayConflicto(detectarConflictos(s, datos.sesiones, s.id))) conflictos.add(s.id);
    }
    return construirAgendaDelDia({
      sesiones: datos.sesiones as SesionAgenda[], reservas: datos.reservas, ahora, conflictos,
    });
  }, [datos.sesiones, datos.reservas, ahora]);

  const clasesPorDia = useMemo(() => {
    const porDia = new Map<string, ClaseDelDia[]>();
    for (const c of clases) {
      const dia = hoyEnEstudio(new Date(c.inicio));
      const lista = porDia.get(dia);
      if (lista) lista.push(c); else porDia.set(dia, [c]);
    }
    return porDia;
  }, [clases]);

  // ── Posición y arrastre ────────────────────────────────────────────────────
  const ref = useRef<HTMLElement>(null);
  const posRef = useRef<Punto | null>(null);
  const [pos, setPos] = useState<Punto | null>(null);
  const arrastre = useRef<{ dx: number; dy: number; id: number } | null>(null);
  const animandoTamano = useRef(false);
  // Dónde estaba la ventana pequeña antes de agrandarla: agrandada suele tener
  // que moverse para caber, y al reducirla vuelve a su sitio (como al restaurar
  // una ventana), no se queda donde la empujó el tamaño grande.
  const posPequena = useRef<Punto | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const colocar = useCallback((p: Punto) => {
    // offsetWidth/Height y no getBoundingClientRect: durante la animación de
    // entrada la ventana va ESCALADA, y con la caja escalada se acotaba contra un
    // tamaño de juguete y acababa medio fuera de la pantalla.
    const el = ref.current;
    const acotada = acotarPosicion(
      p,
      { ancho: el?.offsetWidth ?? 0, alto: el?.offsetHeight ?? 0 },
      { ancho: window.innerWidth, alto: window.innerHeight },
    );
    posRef.current = acotada;
    setPos(acotada);
  }, []);

  // Antes de pintarse, para que no aparezca un fotograma en la esquina.
  const posGuardada = estado.posicion;
  useLayoutEffect(() => {
    if (!anfitrion || posRef.current) return;
    colocar(posGuardada ?? posicionInicial({ ancho: window.innerWidth, alto: window.innerHeight }));
    // Nace del botón que la ha abierto (como una ventana desde el Dock). Si se
    // abre por otro camino —recargar con ella abierta—, aparece en su sitio.
    const el = ref.current;
    const origen = origenAperturaReciente();
    // Leída de nuevo: `colocar` la acaba de escribir, y TypeScript la sigue
    // viendo `null` por el `return` de arriba.
    const colocada = posRef.current as Punto | null;
    if (el && origen && colocada) {
      el.style.transformOrigin = `${origen.x - colocada.x}px ${origen.y - colocada.y}px`;
      el.dataset.desde = 'boton';
    }
  }, [anfitrion, posGuardada, colocar]);

  // Red por si `animationend` no llega (animaciones desactivadas en el sistema):
  // la ventana no puede quedarse montada e invisible tapando clics.
  useEffect(() => {
    if (!saliendo) return;
    const t = setTimeout(alSalir, 600);
    return () => clearTimeout(t);
  }, [saliendo, alSalir]);

  // Si la ventana crece (llegan las clases, se despliega) o la pantalla encoge,
  // vuelve a caber. Sin guardar: guardar es cosa de quien la ha movido a mano.
  useEffect(() => {
    const el = ref.current;
    if (!anfitrion || !el) return;
    const reacomodar = () => {
      if (posRef.current && !arrastre.current && !animandoTamano.current) colocar(posRef.current);
    };
    const observador = new ResizeObserver(reacomodar);
    observador.observe(el);
    window.addEventListener('resize', reacomodar);
    return () => { observador.disconnect(); window.removeEventListener('resize', reacomodar); };
  }, [anfitrion, colocar]);

  const alPulsar = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = posRef.current;
    if (e.button !== 0 || (e.target as HTMLElement).closest('button') || !p || saliendo) return;
    arrastre.current = { dx: e.clientX - p.x, dy: e.clientY - p.y, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastrando(true);
  };
  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (a && a.id === e.pointerId) colocar({ x: e.clientX - a.dx, y: e.clientY - a.dy });
  };
  const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    arrastre.current = null;
    setArrastrando(false);
    if (estado.expandida) posPequena.current = null;
    if (posRef.current) actualizarVentana({ posicion: posRef.current });
  };

  // ── Acciones ───────────────────────────────────────────────────────────────
  const irAClase = (sesionId: string) => {
    if (pathname === '/calendario') {
      window.dispatchEvent(new CustomEvent<string>(EVENTO_SALTAR_A_CLASE, { detail: sesionId }));
    } else {
      router.push(`/calendario?sesion=${encodeURIComponent(sesionId)}`);
    }
  };
  // Agrandar es agrandar ESTA ventana —la semana entera, sin dejar de flotar—,
  // nunca cerrarla. (La primera versión la cerraba y llevaba al Calendario, y
  // la dueña lo vio como lo que era: «no expande, se quita la pestaña».)
  //
  // La animación es FLIP a mano: se mide, se cambia al tamaño nuevo, se vuelve
  // a acotar la posición contra él y se anima ancho, alto y posición desde lo
  // medido. Lo de dentro ya está maquetado a su tamaño final (ancho fijo), así
  // que la ventana crece o encoge como un marco y el texto no se recoloca en
  // cada fotograma.
  const cambiarTamano = (agrandar: boolean) => {
    const el = ref.current;
    const antes = posRef.current;
    if (!el || !antes || typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      actualizarVentana({ expandida: agrandar, plegada: false });
      return;
    }
    const desde = { ancho: el.offsetWidth, alto: el.offsetHeight, x: antes.x, y: antes.y };
    if (agrandar) posPequena.current = antes;
    const destino = agrandar ? antes : (posPequena.current ?? antes);
    animandoTamano.current = true;
    flushSync(() => actualizarVentana({ expandida: agrandar, plegada: false }));
    flushSync(() => colocar(destino));
    const hasta = posRef.current ?? antes;
    const animacion = el.animate(
      [
        { width: `${desde.ancho}px`, height: `${desde.alto}px`, left: `${desde.x}px`, top: `${desde.y}px` },
        { width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`, left: `${hasta.x}px`, top: `${hasta.y}px` },
      ],
      { duration: 500, easing: 'cubic-bezier(.4, 0, .2, 1)' },
    );
    const terminar = () => {
      animandoTamano.current = false;
      if (posRef.current) actualizarVentana({ posicion: posRef.current });
    };
    animacion.finished.then(terminar, terminar);
  };

  if (!anfitrion || !fecha || !hoy) return null;

  const plegada = estado.plegada;
  const cargando = !alDia;
  const fallo = alDia && cargado.fallo;

  return createPortal(
    <section
      ref={ref}
      aria-label="Calendario en ventana"
      data-testid="ventana-calendario"
      data-saliendo={saliendo ? '' : undefined}
      data-arrastrando={arrastrando ? '' : undefined}
      onAnimationEnd={(e) => { if (saliendo && e.target === e.currentTarget) alSalir(); }}
      className={cn(
        'ventana-flotante fixed z-40 overflow-hidden rounded-2xl border border-border bg-card text-foreground',
        estado.expandida ? ANCHO_AGRANDADA : 'w-[320px]',
        'shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]',
        arrastrando && 'select-none',
      )}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div
        onPointerDown={alPulsar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        data-testid="ventana-calendario-barra"
        title="Arrastra para moverla"
        className={cn(
          'flex h-11 touch-none items-center gap-0.5 pl-2 pr-1.5',
          arrastrando ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <GripHorizontal size={14} aria-hidden className="mr-0.5 shrink-0 text-muted-foreground/70" />
        <button
          type="button"
          className={BOTON}
          aria-label={estado.expandida ? 'Semana anterior' : 'Día anterior'}
          onClick={() => setFecha(masDias(fecha, -dias))}
        >
          <ChevronLeft size={15} />
        </button>
        {fecha === hoy ? (
          <p className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold">
            {estado.expandida ? tituloSemana(fecha, hoy) : tituloDia(fecha, hoy)}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setFecha(hoy)}
            title="Volver a hoy"
            className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-center text-[13px] font-semibold transition-colors hover:bg-muted"
          >
            {estado.expandida ? tituloSemana(fecha, hoy) : tituloDia(fecha, hoy)}
          </button>
        )}
        <button
          type="button"
          className={BOTON}
          aria-label={estado.expandida ? 'Semana siguiente' : 'Día siguiente'}
          onClick={() => setFecha(masDias(fecha, dias))}
        >
          <ChevronRight size={15} />
        </button>
        <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
        <button
          type="button"
          className={BOTON}
          aria-label={plegada ? 'Desplegar la ventana' : 'Plegar la ventana'}
          title={plegada ? 'Desplegar' : 'Plegar'}
          onClick={() => actualizarVentana({ plegada: !plegada })}
        >
          {plegada ? <ChevronDown size={15} /> : <Minus size={15} />}
        </button>
        <button
          type="button"
          className={BOTON}
          aria-pressed={estado.expandida}
          aria-label={estado.expandida ? 'Reducir la ventana' : 'Agrandar la ventana'}
          title={estado.expandida ? 'Reducir: solo el día' : 'Agrandar: la semana entera'}
          onClick={() => cambiarTamano(!estado.expandida)}
        >
          {estado.expandida ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button type="button" className={BOTON} aria-label="Cerrar la ventana" title="Cerrar" onClick={() => actualizarVentana({ abierta: false })}>
          <X size={15} />
        </button>
      </div>

      {/* Plegar anima la altura (filas de rejilla 1fr ↔ 0fr, lo único que el CSS
          sabe animar hasta «su alto natural») en vez de quitar la lista de golpe.
          Plegada queda fuera del foco y del lector de pantalla. */}
      <div
        className={cn('ventana-plegable grid', plegada ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}
        inert={plegada}
        aria-hidden={plegada || undefined}
      >
        <div className={cn('ventana-plegable-dentro min-h-0 overflow-hidden', plegada && 'opacity-0')}>
        {estado.expandida ? (
          <SemanaEnVentana
            fecha={fecha}
            hoy={hoy}
            cargando={cargando}
            fallo={fallo}
            clasesPorDia={clasesPorDia}
            horarioSemana={datos.horarioSemana}
            tipoById={tipoById}
            instructorById={instructorById}
            onClase={irAClase}
            onReintentar={refrescar}
          />
        ) : (
        <div className="ventana-contenido w-[318px] max-h-[min(460px,calc(100dvh-96px))] overflow-y-auto overscroll-contain border-t border-border">
          {cargando ? (
            <ul aria-hidden className="divide-y divide-border">
              {[0, 1, 2].map(i => (
                <li key={i} className="flex items-center gap-3 px-3 py-3">
                  <span className="h-3.5 w-9 animate-pulse rounded bg-muted" />
                  <span className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : fallo ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-muted-foreground">No hemos podido cargar las clases.</p>
              <button type="button" onClick={refrescar} className="mt-2 text-[13px] font-semibold text-foreground underline">
                Volver a intentarlo
              </button>
            </div>
          ) : clases.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              {fecha === hoy ? 'Hoy no hay clases.' : 'No hay clases este día.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {clases.map(c => {
                const tipo = tipoById.get(c.tipoClaseId);
                const instructora = instructorById.get(c.instructorId);
                const pinta = PINTA[c.estado];
                const apagada = c.finalizada || c.estado === 'CANCELADA';
                return (
                  <li key={c.sesionId}>
                    <button
                      type="button"
                      onClick={() => irAClase(c.sesionId)}
                      className={cn(
                        'grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3 py-2.5 text-left outline-none transition-colors',
                        'hover:bg-muted/60 focus-visible:bg-muted/60',
                        apagada && 'opacity-60',
                      )}
                    >
                      <span className="pt-px text-[13px] font-bold tabular-nums">{horaEstudio(c.inicio)}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tipo?.color ?? 'var(--border)' }} />
                          <span className={cn('truncate text-[13px] font-medium', c.estado === 'CANCELADA' && 'line-through')}>
                            {tipo?.nombre ?? 'Clase'}
                          </span>
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {c.estado === 'SIN_INSTRUCTORA' || !instructora ? 'Sin instructora' : instructora.nombre}
                        </span>
                        {c.estado !== 'CANCELADA' && <BarraPlazas ocupadas={c.ocupadas} aforo={c.aforo} />}
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[12px] font-semibold tabular-nums">
                          {c.ocupadas}/{c.aforo}
                        </span>
                        {ESTADOS_CON_ETIQUETA.has(c.estado) && (
                          <span
                            className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: pinta.fondo, color: pinta.tinta }}
                          >
                            {pinta.label}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}
        </div>
      </div>
    </section>,
    anfitrion,
  );
}

// ─── La semana, con la ventana agrandada ─────────────────────────────────────
// Siete columnas desde el día que se mira, cada una con sus clases en orden. No
// es la rejilla del Calendario (horas × días): en una ventana eso no se lee, y
// lo que se quiere aquí es «qué hay esta semana», no organizar la agenda.

const ANCHO_DENTRO_AGRANDADA = 'w-[calc(min(1080px,100vw-24px)-2px)]';

function SemanaEnVentana({
  fecha, hoy, cargando, fallo, clasesPorDia, horarioSemana, tipoById, instructorById, onClase, onReintentar,
}: {
  fecha: string;
  hoy: string;
  cargando: boolean;
  fallo: boolean;
  clasesPorDia: Map<string, ClaseDelDia[]>;
  horarioSemana: { dia: number; abierto: boolean }[];
  tipoById: Map<string, { nombre: string; color: string }>;
  instructorById: Map<string, Instructor>;
  onClase: (sesionId: string) => void;
  onReintentar: () => void;
}) {
  if (fallo) {
    return (
      <div className={cn(ANCHO_DENTRO_AGRANDADA, 'border-t border-border px-4 py-10 text-center')}>
        <p className="text-[13px] text-muted-foreground">No hemos podido cargar las clases.</p>
        <button type="button" onClick={onReintentar} className="mt-2 text-[13px] font-semibold text-foreground underline">
          Volver a intentarlo
        </button>
      </div>
    );
  }

  const dias = Array.from({ length: DIAS_AGRANDADA }, (_, i) => masDias(fecha, i));
  return (
    <div
      className={cn(
        'ventana-contenido',
        ANCHO_DENTRO_AGRANDADA,
        'grid h-[min(560px,calc(100dvh-110px))] grid-cols-7 overflow-y-auto overscroll-contain border-t border-border',
      )}
    >
      {dias.map(dia => {
        const d = mediodia(dia);
        const esHoy = dia === hoy;
        const lista = clasesPorDia.get(dia) ?? [];
        // Mismo criterio que el Calendario: 0 = lunes; «Cerrado» solo si el
        // horario lo dice y además no hay ninguna clase puesta ese día.
        const diaSemana = (d.getDay() + 6) % 7;
        const cerrado = lista.length === 0 && horarioSemana.some(h => h.dia === diaSemana && !h.abierto);
        const resumen = cerrado ? 'Cerrado'
          : lista.length === 0 ? 'Sin clases'
          : `${lista.length} ${lista.length === 1 ? 'clase' : 'clases'}`;
        return (
          <div key={dia} data-testid="ventana-dia" className="flex min-w-0 flex-col border-r border-border last:border-r-0">
            <div
              className="sticky top-0 z-[1] border-b border-border px-2 py-2 text-center"
              style={{ background: esHoy ? 'color-mix(in srgb, var(--brand-medio) 10%, var(--card))' : 'var(--card)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: esHoy ? 'var(--brand-medio)' : 'var(--muted-foreground)' }}>
                {FORMATO_DIA_SEMANA.format(d).replace('.', '')}{' '}
                <span className="text-[14px] text-foreground">{FORMATO_NUMERO_DIA.format(d)}</span>
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {esHoy ? 'HOY · ' : ''}{cargando ? '…' : resumen}
              </p>
            </div>
            {cargando ? (
              <div aria-hidden className="flex flex-col gap-1.5 p-1.5">
                {[0, 1].map(i => <span key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 p-1.5">
                {lista.map(c => {
                  const tipo = tipoById.get(c.tipoClaseId);
                  const instructora = instructorById.get(c.instructorId);
                  const pinta = PINTA[c.estado];
                  const apagada = c.finalizada || c.estado === 'CANCELADA';
                  return (
                    <li key={c.sesionId}>
                      <button
                        type="button"
                        onClick={() => onClase(c.sesionId)}
                        className={cn(
                          'w-full rounded-lg border border-border bg-card px-2 py-1.5 text-left outline-none transition-colors',
                          'hover:bg-muted/60 focus-visible:bg-muted/60',
                          apagada && 'opacity-60',
                        )}
                        style={{ borderLeftWidth: 3, borderLeftColor: tipo?.color ?? 'var(--border)' }}
                      >
                        <span className="flex items-baseline justify-between gap-1">
                          <span className="text-[12px] font-bold tabular-nums">{horaEstudio(c.inicio)}</span>
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {c.ocupadas}/{c.aforo}
                          </span>
                        </span>
                        <span className={cn('block truncate text-[12px] font-medium', c.estado === 'CANCELADA' && 'line-through')}>
                          {tipo?.nombre ?? 'Clase'}
                        </span>
                        <span className="block truncate text-[10.5px] text-muted-foreground">
                          {c.estado === 'SIN_INSTRUCTORA' || !instructora ? 'Sin instructora' : instructora.nombre}
                        </span>
                        {ESTADOS_CON_ETIQUETA.has(c.estado) && (
                          <span
                            className="mt-1 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: pinta.fondo, color: pinta.tinta }}
                          >
                            {pinta.label}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
