'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Calendario de reservas estilo Acuity — componente compartido y reutilizable.
//
// Reescribe el flujo socia de reservar clase de grupo en pocos pasos:
//   1) tira de semana con ‹ semana › y nº de clases por día,
//   2) lista de horarios del día seleccionado,
//   3) hoja inferior con detalle + selector de sitio + acción (Reservar /
//      Lista de espera / Cancelar).
//
// Es 100% inline-styled y theme-driven: recibe el objeto de tema del portal
// (ModoTokens) + datos + handlers por props, sin acoplarse a useStudio ni a
// useModo. Así /reservar podrá adoptarlo pasando su propio tema. NO decide
// aforo ni escribe en la BD: solo llama a los handlers `onReservar`/`onCancelar`
// que le pasa la página (la BD sigue siendo autoritativa).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useEffect, useId, type CSSProperties } from 'react';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Users, X,
  CheckCircle2, AlertCircle, AlertTriangle, CalendarDays, Ticket,
} from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { NivelClase, EstadoReserva, Spot } from '@/lib/types';
import type { ResultadoReserva } from '@/lib/studio-context';
import type { ResultadoEscritura } from '@/lib/errores';
import { semantic } from '@/lib/portal-tokens';
import { colorOcupacion, ratioOcupacion, etiquetaOcupacion } from '@/lib/ocupacion';
import { useBloquearScrollFondo } from '@/components/ui/use-dialog-a11y';
import { serif, sans, cq, radius, shadow, EASE } from '@/lib/reservar-publico-tokens';
import {
  localDayKey, addDays, diasSemana, contarSlotsPorDia, slotsDelDia,
  agruparPorDia, etiquetaDia,
} from '@/lib/reserva-calendario-logic';
import { SpotPicker } from './spot-picker';
import { TiraDias } from './tira-dias';

// Instrument Sans, la misma familia sans que el resto de /reservar
// (lib/reservar-publico-tokens.ts, que a su vez reexporta de portal-design.ts
// para no duplicar la cadena de fuentes en un tercer sitio).
const FUENTE = sans;

const NIVEL_LABEL: Record<NivelClase, string> = {
  TODOS: 'Todos los niveles', PRINCIPIANTE: 'Iniciación', MEDIO: 'Intermedio', AVANZADO: 'Avanzado',
};
const NIVEL_COLOR: Record<NivelClase, string> = {
  TODOS: '#8E8E93', PRINCIPIANTE: 'var(--success)', MEDIO: 'var(--warning)', AVANZADO: 'var(--destructive)',
};
const DOW_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ── Vista-modelo de un slot reservable ──────────────────────────────────────
// La página lo construye desde los datos crudos de useStudio(); el componente
// no conoce Sesion/Reserva, solo esta forma normalizada (reutilizable).
export interface ReservaSlot {
  id: string;                 // id de sesión
  inicio: string;             // ISO
  fin: string;                // ISO
  tipoClaseId?: string | null; // para resolver ventanaPorTipo (P2-8)
  claseNombre: string;
  claseColor: string;
  claseFotoUrl?: string | null;
  nivel: NivelClase;
  descripcion?: string | null;
  instructorNombre?: string | null;
  instructorColor?: string | null;
  instructorRol?: string | null;
  instructorFotoUrl?: string | null;
  /** P1 auditoría Momence: nombre de quien daba la clase originalmente, solo si hay sustitución confirmada. */
  instructorOriginalNombre?: string | null;
  salaNombre?: string | null;
  aforoMaximo: number;
  ocupadas: number;
  spots: Spot[];              // reformers activos de la sala
  spotsOcupados: string[];    // ids de spot ya ocupados
  miReservaId: string | null; // reserva propia activa (si la hay)
  miEstado: 'CONFIRMADA' | 'LISTA_ESPERA' | null;
  /**
   * Fase 5 (Booking Engine): plazo para aceptar una plaza liberada de lista
   * de espera (`reservas.oferta_expira_en`, migr `20260731130000`). `null`/
   * ausente = en espera sin oferta activa todavía — mismo criterio que ya
   * usa `components/portal/portal-reservas-view.tsx`, portado aquí porque
   * ninguna de las dos superficies públicas (Modo A/B) lo tenía.
   */
  miOfertaExpiraEn?: string | null;
  precio?: number | null;     // se muestra en el CTA si no hay cobertura de plan
  /**
   * §3 — Qué le cuesta a la alumna reservar ESTA clase, en una frase, ya
   * resuelta por `lib/reservar/cobertura.ts` ("Descuenta 1 sesión de tu Bono 10
   * Reformer · te quedarán 4", "Tu bono no cubre esta clase · 15 € como clase
   * suelta"). Llega como texto y no como estructura a propósito: este
   * componente también se compila en el bundle embebido (esbuild, Shadow DOM) y
   * no debe arrastrar la lógica de bonos por una línea de copia.
   *
   * `null`/ausente = no hay nada honesto que decir (sin sesión y sin precio
   * público configurado), y entonces no se pinta nada. Antes esto no existía:
   * con plan que cubre, el botón decía "Reservar" a secas y la alumna no sabía
   * qué se le iba a descontar.
   */
  coberturaTexto?: string | null;
}

export interface ReservaCalendarioProps {
  /** Tema del portal (día/noche). Se pasa por prop para desacoplar de useModo. */
  t: ModoTokens;
  slots: ReservaSlot[];
  /**
   * Reserva el slot. Devuelve el resultado REAL del servidor: la hoja pinta la
   * confirmación si dice que sí, y el motivo si dice que no. Si devuelve void,
   * el flujo se ha derivado a otra superficie (p. ej. el modal de acceso del
   * widget público) y la hoja se cierra sola para no quedar apilada detrás.
   */
  onReservar: (slot: ReservaSlot, spotId: string | null) => ResultadoReserva | void | Promise<ResultadoReserva | void>;
  /** Cancela. Si devuelve un resultado y es `ok: false`, la hoja dice el motivo. */
  onCancelar: (reservaId: string) => void | Promise<ResultadoEscritura | void>;
  /**
   * Acepta una plaza liberada de lista de espera (Fase 5 Booking Engine,
   * `aceptar_oferta_lista_espera`). Opcional: sin ella, un slot con
   * `miOfertaExpiraEn` activa cae al aviso pasivo de siempre ("estás en
   * lista de espera") en vez del botón de aceptar.
   */
  onAceptarOferta?: (reservaId: string) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  /** 'calendario' (tira de semana) o 'lista' (agrupada por día, para Mis reservas). */
  variant?: 'calendario' | 'lista';
  /**
   * Salta a un día concreto desde fuera (hoy: al elegirlo en la vista Mes).
   *
   * ⚠️ Lleva `nonce` y no solo la fecha porque el mismo día puede elegirse dos
   * veces seguidas —se mira agosto, se pincha el 14, se vuelve a Mes y se
   * pincha el 14 otra vez— y con solo la fecha el efecto no se volvería a
   * disparar. Mismo patrón que el `irA` del editor de Apariencia.
   *
   * El día lo sigue mandando el estado INTERNO: esto es una orden puntual, no
   * un control externo. Convertirlo en controlado obligaría a subir también la
   * semana, la hoja abierta y el spot elegido, que no le importan a nadie
   * fuera.
   */
  irADia?: { fecha: string; nonce: number };
  /** Horas de antelación para cancelar sin penalización; muestra un aviso en la hoja.
   *  Es el valor por defecto del ESTUDIO — `ventanaPorTipo` lo pisa por tipo de clase. */
  cancelacionVentanaHoras?: number;
  /** Override por tipo de clase (P2-8): tipoClaseId → horas. Un reformer puede
   *  necesitar más antelación que un mat para recolocar la plaza. */
  ventanaPorTipo?: Record<string, number>;
  /** Copys de estado vacío. */
  vacio?: { titulo: string; cuerpo: string };
  /**
   * Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md): la carga
   * pública falló de verdad (red/servidor), a diferencia de "cero clases" —
   * antes ambos casos eran indistinguibles (`cargarPublico` fallaba en
   * silencio a un catálogo vacío). Presente = pinta el estado de error en vez
   * del vacío, con el mismo hueco visual, en TODAS las variantes.
   */
  error?: { onReintentar: () => void; titulo?: string };
  fontFamily?: string;
  /**
   * Fase 1 del rediseño (docs/widget-reservas-theme-builder-diseno.md): la
   * tira de 10 días con scroll horizontal de las pantallas 01/02 del handoff,
   * en vez de la tira de SEMANA con paginación ‹ › de siempre. Por defecto
   * 'semana' — cero cambio para cualquier caller existente (Modo B, "Mis
   * reservas", vista Mes...). Solo Modo A la activa hoy, y solo en la tab
   * "Clases"; el resto del componente (spot picker, hoja, estados vacíos,
   * variant='lista') es idéntico en ambos estilos.
   *
   * `'grid'` (Fase 4, formato 06 "Calendario embebido"): rejilla de 7
   * columnas con TODOS los días a la vez, en vez de tira+un-día. Solo la usa
   * Modo B (`app/widget-bundle/main.tsx`) — es la única variante cuyos
   * colores NO salen de `t`: el brief de diseño fija neutros de verdad
   * (`docs/widget-reservas-fase4-brief-diseno.md`, formato 06) porque el
   * widget corre en Shadow DOM dentro de la web de un tercero, sin el resto
   * del tema del estudio alrededor. El único punto de marca sigue siendo
   * `--portal-brand` (la hora de cada chip), que SÍ llega aquí — main.tsx ya
   * lo fija en la raíz del shadow root.
   */
  estiloDias?: 'semana' | 'dias' | 'grid';
  /**
   * Fase 4 del rediseño: las clases de HOY que ya empezaron/terminaron, para
   * pintarlas en gris con "FINALIZADA" en la tarjeta del día — `slots`
   * arriba las excluye a propósito (filtra `inicio > ahora`, y de eso
   * dependen Mes/Semana/RailFiltros, así que esa regla no se toca). Solo se
   * pintan cuando `estiloDias === 'dias'` y el día elegido es hoy. Sin
   * acción — no llevan `miReservaId`/aforo/precio, no se puede reservar algo
   * que ya pasó.
   */
  finalizadasHoy?: { id: string; inicio: string; fin: string; claseNombre: string; instructorNombre: string | null; instructorColor: string | null; instructorFotoUrl: string | null }[];
  /**
   * La carga pública todavía no ha llegado (primer pintado, antes de
   * `dataLoaded`). Antes de esto no había ningún estado intermedio: el
   * catálogo vacío inicial se pintaba como "Sin clases este día" durante el
   * primer segundo, que es justo la mentira que Fase 4 ya había cerrado para
   * el caso de ERROR — le faltaba el caso de CARGANDO. Solo afecta al pintado
   * de `estiloDias='dias'` (único caller de Modo A); el resto de variantes ya
   * tenían su propio hueco vacío tolerable antes de esto.
   */
  loading?: boolean;
  // ── Parámetros del snippet embebido (lib/reservar/config-widget.ts) ──────
  // Defaults = todo visible y ventana completa: sin props, el componente se
  // comporta EXACTAMENTE igual que antes (retrocompatibilidad con cualquier
  // snippet ya incrustado).
  /** Quita el precio del CTA y la línea de cobertura/coste de la hoja. */
  ocultarPrecio?: boolean;
  /** Quita el badge de nivel de la hoja. */
  ocultarNivel?: boolean;
  /** Quita el aviso «Sustituye a X hoy» (queda el rótulo de rol de siempre). */
  ocultarSustituta?: boolean;
  /**
   * 'hoy' = la ventana de días se reduce al día de hoy (una sola columna en
   * 'grid', un solo chip en 'dias'). 'todo' = la ventana de siempre.
   */
  vistaInicial?: 'hoy' | 'todo';
  // ── P0-3 (mobile UX del checkout embebido) ───────────────────────────────
  /**
   * El calendario vive dentro de un <iframe> auto-dimensionado a TODO su
   * contenido (Modo A, `?embed=1`). Ahí `position: fixed; inset: 0` ancla la
   * hoja al FONDO del iframe — que puede estar a más de 1000px de lo que el
   * usuario ve (medido en producción). Con esto activo, la hoja se ancla a
   * `franjaVisible` si el snippet nuevo la informa, y al TOP del iframe si no
   * (snippet viejo): quien abre la ficha acaba de tocar una tarjeta que está
   * en su pantalla, así que el top del iframe siempre está más cerca que el
   * fondo. Fuera del iframe (página completa, bundle Shadow DOM) no cambia
   * nada.
   */
  enIframe?: boolean;
  /**
   * Franja del iframe visible en la pantalla real del usuario, en px relativos
   * al propio iframe (mensaje `tentareHostViewport` del snippet nuevo,
   * components/configuracion/tab-api.tsx). `null`/ausente = el host no informa
   * (snippet viejo) y se usa el fallback de `enIframe`.
   */
  franjaVisible?: { top: number; height: number } | null;
  /**
   * Aviso de que la hoja de ficha se abre/cierra. Modo A embebido lo usa para
   * pedir al host (`tentareScrollTo`) que traiga el iframe a la vista cuando
   * el snippet no informa de su viewport.
   */
  alCambiarFicha?: (abierta: boolean) => void;
}

// Neutros FIJOS del formato 06 — nunca `t`. Ver comentario de `estiloDias` arriba.
const GRID_NEUTROS = {
  bg: '#FFFFFF', ink: '#1A1A1A', mut: '#8A8A8A', mut2: '#6E6E6E',
  linea: '#E8E8E8', linea2: '#ECECEC', radio: 8,
};
// ⚠️ La rejilla compacta tenía aquí la pila del sistema escrita a fuego, así
// que era la única parte del widget que NO cambiaba al elegir tipografía — y
// justo es el diseño «ligero», el que trae el bundle por defecto. Ahora lee la
// misma variable que el resto y solo cae al sistema si nadie la fijó.
const GRID_FUENTE = "var(--font-ui), system-ui, -apple-system, 'Segoe UI', sans-serif";
const DOW_GRID = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtDiaLargo(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
// La tarjeta rica del listado enseña el año completo («Jueves, 20 de agosto de
// 2026») — es el formato de la referencia (Momence móvil) que pidió el fundador.
function fmtDiaCompleto(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Foto de la clase (tarjeta rica y cabecera de la hoja). Sin foto subida, cae a
// un bloque con el color del tipo de clase y su inicial — NUNCA a una imagen de
// /public: este componente también corre en el bundle Shadow DOM incrustado en
// la web de un tercero, donde una URL relativa resolvería contra el dominio del
// estudio y daría 404 (mismo motivo por el que todo aquí llega por props).
function FotoClase({ nombre, color, fotoUrl, ancho, alto, radio }: {
  nombre: string; color: string; fotoUrl?: string | null;
  ancho: number | string; alto: number; radio: number;
}) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto subida por el estudio, no un asset estático conocido en build (mismo criterio que RoundPhoto)
      <img
        src={fotoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: ancho, height: alto, borderRadius: radio, objectFit: 'cover', flexShrink: 0, display: 'block' }}
      />
    );
  }
  return (
    <div aria-hidden="true" style={{
      width: ancho, height: alto, borderRadius: radio, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, color-mix(in srgb, ${color} 55%, #fff) 0%, ${color} 100%)`,
    }}>
      <span style={{ fontFamily: serif, fontSize: Math.round(alto * 0.4), color: 'rgba(255,255,255,0.92)', lineHeight: 1 }}>
        {nombre.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

// Foto redonda — de la instructora o de la clase. Si no hay foto, cae a la
// inicial del nombre sobre su color (mismo criterio que components/ui/profile-avatar).
function RoundPhoto({ nombre, color, fotoUrl, size, ring }: { nombre: string; color?: string | null; fotoUrl?: string | null; size: number; ring?: string }) {
  const ringStyle: CSSProperties = ring ? { boxShadow: `0 0 0 3px ${ring}` } : {};
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora, no un asset estático conocido en build (mismo criterio que components/ui/profile-avatar)
      <img
        src={fotoUrl}
        alt={nombre}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flexShrink: 0, ...ringStyle }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 800, color: '#fff', flexShrink: 0, background: color ?? 'var(--portal-brand)',
      ...ringStyle,
    }}>
      {nombre.charAt(0).toUpperCase()}
    </div>
  );
}

export function ReservaCalendario({
  t, slots, onReservar, onCancelar, onAceptarOferta,
  variant = 'calendario', cancelacionVentanaHoras, ventanaPorTipo, vacio, error, fontFamily = FUENTE,
  irADia, estiloDias = 'semana', finalizadasHoy, loading = false,
  ocultarPrecio = false, ocultarNivel = false, ocultarSustituta = false, vistaInicial = 'todo',
  enIframe = false, franjaVisible = null, alCambiarFicha,
}: ReservaCalendarioProps) {
  const hoy = useMemo(() => new Date(), []);
  const hoyKey = localDayKey(hoy);

  const [weekAnchor, setWeekAnchor] = useState<Date>(hoy);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(hoyKey);
  // Salto a un día pedido desde fuera. Se mueve TAMBIÉN el ancla de semana: si
  // solo se cambiara el día seleccionado, la tira seguiría enseñando otra
  // semana y el día elegido no se vería marcado en ningún sitio.
  //
  // ⚠️ Se ajusta DURANTE EL RENDER, no en un `useEffect`. Con efecto, React
  // pinta primero el día viejo y corrige después —un parpadeo real al volver
  // del Mes— y además el linter de React Compiler lo rechaza
  // (`set-state-in-effect`). Este es el patrón que la documentación llama
  // «ajustar estado al cambiar una prop»: comparar contra lo último visto y
  // corregir antes de pintar.
  //
  // `T12:00:00` y no `T00:00:00`: a medianoche, un cambio de hora deja la
  // fecha en el día anterior en algunos husos y la tira saldría corrida.
  const [nonceVisto, setNonceVisto] = useState<number | null>(null);
  if (irADia && irADia.nonce !== nonceVisto) {
    setNonceVisto(irADia.nonce);
    setSelectedDayKey(irADia.fecha);
    setWeekAnchor(new Date(`${irADia.fecha}T12:00:00`));
  }

  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  // Feedback tras una acción, para confirmar visualmente sin cerrar la hoja.
  const [resultado, setResultado] = useState<EstadoReserva | 'CANCELADA' | null>(null);
  // El servidor rechaza legítimamente en varios sitios (sin bono, clase ya
  // empezada, tope de reservas...). Antes ese "no" no llegaba nunca a la hoja y
  // se pintaba «¡Reserva confirmada!» encima de una reserva que no existía.
  const [errorReserva, setErrorReserva] = useState<string | null>(null);
  // El botón se quedaba con el mismo texto ("Reservar"/"Cancelar reserva")
  // durante toda la espera al servidor, sin deshabilitarse — nada indicaba que
  // el toque hubiera hecho algo, y un segundo toque antes de la respuesta podía
  // disparar dos peticiones para la misma plaza. Mismo criterio que el portal
  // privado (components/portal/hoja-reserva.tsx): botón deshabilitado + spinner
  // mientras se envía.
  const [enviando, setEnviando] = useState(false);

  const semana = useMemo(() => diasSemana(weekAnchor), [weekAnchor]);
  // 'dias' (Fase 1 del rediseño): 10 días fijos desde hoy, scroll horizontal —
  // no paginación por semana. Independiente de `weekAnchor`/`navegarSemana`,
  // que siguen existiendo tal cual para `estiloDias === 'semana'`.
  // `vistaInicial='hoy'` (snippet embebido) encoge las dos ventanas rodantes a
  // un solo día — no cambia el día seleccionado (ya es hoy por defecto), quita
  // los demás de la vista.
  const diez = useMemo(
    () => Array.from({ length: vistaInicial === 'hoy' ? 1 : 10 }, (_, i) => addDays(hoy, i)),
    [hoy, vistaInicial],
  );
  // `estiloDias === 'grid'`: 7 días rodantes desde hoy (no semana natural
  // lunes-domingo) — mismo criterio de ventana rodante que `diez`, solo que
  // más corta porque aquí los 7 caben a la vez en pantalla.
  const siete = useMemo(
    () => Array.from({ length: vistaInicial === 'hoy' ? 1 : 7 }, (_, i) => addDays(hoy, i)),
    [hoy, vistaInicial],
  );
  const slotsPorDiaGrid = useMemo(() => {
    if (estiloDias !== 'grid') return new Map<string, ReservaSlot[]>();
    const m = new Map<string, ReservaSlot[]>();
    for (const dia of siete) {
      m.set(localDayKey(dia), slotsDelDia(slots, localDayKey(dia)).sort((a, b) => a.inicio.localeCompare(b.inicio)));
    }
    return m;
  }, [estiloDias, siete, slots]);
  const conteoPorDia = useMemo(() => contarSlotsPorDia(slots), [slots]);
  const slotsDia = useMemo(() => slotsDelDia(slots, selectedDayKey), [slots, selectedDayKey]);
  const gruposLista = useMemo(() => (variant === 'lista' ? agruparPorDia(slots) : []), [variant, slots]);

  // Slot abierto en la hoja — se re-deriva de props en cada render, así refleja
  // el estado autoritativo cuando la reserva se confirma y el padre re-renderiza.
  const openSlot = useMemo(
    () => (openSlotId ? slots.find(s => s.id === openSlotId) ?? null : null),
    [openSlotId, slots],
  );

  // Si el slot abierto desaparece (p. ej. la sesión ya pasó tras recargar), cierra.
  //
  // Ajuste en render, no efecto: con efecto se pintaba un frame con la hoja
  // todavía abierta sobre un slot que ya no existe. La condición se
  // auto-cancela —al poner `openSlotId` a null deja de cumplirse—, así que no
  // hace falta guardar el valor anterior ni hay riesgo de bucle.
  if (openSlotId && !openSlot) { setOpenSlotId(null); setSelectedSpot(null); setResultado(null); }

  function navegarSemana(dir: -1 | 1) {
    const nuevoAnchor = addDays(weekAnchor, dir * 7);
    setWeekAnchor(nuevoAnchor);
    // Conserva el día de la semana seleccionado; si no encaja, primer día.
    const idx = semana.findIndex(d => localDayKey(d) === selectedDayKey);
    const nuevaSemana = diasSemana(nuevoAnchor);
    setSelectedDayKey(localDayKey(nuevaSemana[idx >= 0 ? idx : 0]));
  }

  function abrirSlot(slot: ReservaSlot) {
    setOpenSlotId(slot.id);
    setSelectedSpot(null);
    setResultado(null);
  }
  function cerrarHoja() {
    setOpenSlotId(null);
    setSelectedSpot(null);
    setResultado(null);
    setErrorReserva(null);
    setEnviando(false);
  }

  // P0-3: avisa fuera de que la ficha se abre/cierra. En efecto y no en
  // abrirSlot/cerrarHoja porque la hoja también se cierra sola cuando el slot
  // desaparece de `slots` (el ajuste durante render de arriba) — ese camino no
  // pasa por cerrarHoja y dejaría al caller creyendo que sigue abierta.
  const hayFichaAbierta = !!openSlot;
  useEffect(() => {
    alCambiarFicha?.(hayFichaAbierta);
  }, [hayFichaAbierta, alCambiarFicha]);

  const microLabel: CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted,
  };

  const rangoSemanaLabel = useMemo(() => {
    const a = semana[0], b = semana[6];
    const mesA = a.toLocaleDateString('es-ES', { month: 'short' });
    const mesB = b.toLocaleDateString('es-ES', { month: 'short' });
    return mesA === mesB
      ? `${a.getDate()}–${b.getDate()} ${mesB}`
      : `${a.getDate()} ${mesA} – ${b.getDate()} ${mesB}`;
  }, [semana]);

  const emptyCopy = vacio ?? { titulo: 'Sin clases disponibles', cuerpo: 'Próximamente habrá nuevas clases' };

  return (
    <div style={{ fontFamily }}>
      {variant === 'calendario' && estiloDias === 'dias' && loading && (
        <SkeletonDias t={t} />
      )}

      {variant === 'calendario' && estiloDias === 'dias' && !loading && (
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${t.line}` }}>
          <TiraDias
            dias={diez}
            seleccionado={selectedDayKey}
            conteos={conteoPorDia}
            onSeleccionar={setSelectedDayKey}
            tokens={{
              surface: t.surface, line: t.line, ink: t.ink, mutedText: t.muted,
              acento: 'var(--portal-brand)', acentoTexto: 'var(--portal-brand-foreground)',
              fuenteDisplay: serif, fuenteUI: fontFamily, radioChip: 12,
            }}
          />
        </div>
      )}

      {variant === 'calendario' && estiloDias === 'semana' && (
        <>
          {/* ── Navegación de semana ─────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => navegarSemana(-1)}
              aria-label="Semana anterior"
              style={navBtn(t)}
            >
              <ChevronLeft size={18} style={{ color: t.ink }} />
            </button>
            <span style={{ ...microLabel, color: t.ink }}>{rangoSemanaLabel}</span>
            <button
              type="button"
              onClick={() => navegarSemana(1)}
              aria-label="Semana siguiente"
              style={navBtn(t)}
            >
              <ChevronRight size={18} style={{ color: t.ink }} />
            </button>
          </div>

          {/* ── Tira de días ─────────────────────────────────────────────── */}
          <div role="tablist" aria-label="Días de la semana" style={{ position: 'relative', display: 'flex', marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${t.line}` }}>
            {semana.map((d, i) => {
              const key = localDayKey(d);
              const isSel = key === selectedDayKey;
              const isToday = key === hoyKey;
              const n = conteoPorDia.get(key) ?? 0;
              const vacío = n === 0;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isSel}
                  aria-label={`${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}, ${n} ${n === 1 ? 'clase' : 'clases'}`}
                  onClick={() => setSelectedDayKey(key)}
                  style={{
                    flex: 1, minWidth: 0, height: cq(72, 6.6, 84), display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', border: 'none',
                    borderRadius: cq(24, 2.7, 31), background: isSel ? 'var(--portal-brand)' : 'transparent',
                    boxShadow: isSel ? shadow.headerBtn : undefined,
                    opacity: vacío && !isSel ? 0.55 : 1,
                    transition: `background .5s ${EASE}, box-shadow .5s ${EASE}`,
                    // Mismo gotcha que tira-dias.tsx: sin esto, un toque en
                    // móvil puede leerse como selección de texto en vez de
                    // tap y `onClick` no llega.
                    WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 500, letterSpacing: '0.18em',
                    color: isSel ? 'color-mix(in srgb, var(--portal-brand-foreground) 60%, transparent)' : t.muted,
                  }}>
                    {DOW_CORTO[i]}
                  </span>
                  <span style={{
                    fontFamily: serif, fontSize: cq(21, 2.2, 26), lineHeight: 1,
                    color: isSel ? 'var(--portal-brand-foreground)' : (isToday ? 'var(--portal-brand)' : t.ink),
                  }}>
                    {d.getDate()}
                  </span>
                  {/* Contador de clases del día */}
                  <span style={{
                    fontSize: 9, fontWeight: 500, minHeight: 12, lineHeight: '12px',
                    color: isSel ? 'color-mix(in srgb, var(--portal-brand-foreground) 60%, transparent)' : t.muted,
                  }}>
                    {vacío ? '·' : n}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {variant === 'calendario' && estiloDias === 'grid' && (
        error ? (
          <RejillaGridError titulo={error.titulo} onReintentar={error.onReintentar} />
        ) : siete.every(d => (slotsPorDiaGrid.get(localDayKey(d)) ?? []).length === 0) ? (
          <RejillaGridVacio titulo={vistaInicial === 'hoy' ? 'Sin clases hoy' : 'Sin clases esta semana'} cuerpo="Vuelve a mirar en unos días." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* Con `vistaInicial='hoy'` la rejilla es de UNA columna: repetir 7
                dejaría seis columnas fantasma y 700px de ancho mínimo vacíos. */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${siete.length}, minmax(96px, 1fr))`, gap: 8, minWidth: siete.length * 100 }}>
              {siete.map(dia => {
                const key = localDayKey(dia);
                const slotsDelDiaGrid = slotsPorDiaGrid.get(key) ?? [];
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontFamily: GRID_FUENTE, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: GRID_NEUTROS.mut, paddingBottom: 4 }}>
                      {DOW_GRID[dia.getDay()]} {dia.getDate()}
                    </div>
                    {slotsDelDiaGrid.length === 0 ? (
                      <div style={{ height: 1 }} />
                    ) : slotsDelDiaGrid.map(slot => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => abrirSlot(slot)}
                        title={slot.claseNombre}
                        style={{
                          textAlign: 'left', border: `1px solid ${GRID_NEUTROS.linea}`, borderRadius: GRID_NEUTROS.radio,
                          padding: '7px 9px', background: GRID_NEUTROS.bg, cursor: 'pointer',
                          fontFamily: GRID_FUENTE, fontSize: 11.5, fontWeight: 600, color: GRID_NEUTROS.mut2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          transition: 'background .15s ease',
                        }}
                      >
                        <span style={{ color: 'var(--portal-brand)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(slot.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>{' '}
                        {slot.claseNombre}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {variant === 'calendario' && estiloDias === 'dias' && !loading && (() => {
        const diaSel = new Date(`${selectedDayKey}T12:00:00`);
        const esHoy = selectedDayKey === hoyKey;
        const finalizadas = esHoy ? (finalizadasHoy ?? []) : [];
        const totalDia = slotsDia.length + finalizadas.length;
        const dayLabel = `${capitaliza(diaSel.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}${esHoy ? ' — hoy' : ''}`;
        const countLabel = error ? '—' : (totalDia ? `${totalDia} ${totalDia === 1 ? 'clase' : 'clases'}` : 'Sin clases');
        return (
          // Cabecera «día · nº de clases» + tarjetas RICAS por clase (rediseño
          // pedido por el fundador con Momence móvil de referencia): foto,
          // rótulo «CLASE», título grande, instructora, descripción con
          // «Mostrar más», filas con icono y precio + «Reservar ahora». Solo en
          // Modo A (única consumidora de `estiloDias='dias'`); `SlotRow` sigue
          // intacto para el portal privado ('semana') y «Mis reservas» ('lista').
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 18px', borderRadius: radius.card, border: `1px solid ${t.line}`, background: t.surface2, marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.02em', color: t.ink }}>{dayLabel}</span>
              <span style={{ fontSize: 11.5, color: t.muted }}>{countLabel}</span>
            </div>
            {error ? (
              <div style={{ borderRadius: radius.card, background: t.surface, border: `1px solid ${t.line}` }}>
                <EstadoErrorRed t={t} titulo={error.titulo} onReintentar={error.onReintentar} />
              </div>
            ) : totalDia === 0 ? (
              <div style={{ borderRadius: radius.card, background: t.surface, border: `1px solid ${t.line}` }}>
                <EstadoVacio t={t} titulo="Sin clases este día" cuerpo="Prueba otro día de la semana" />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Las de hoy que ya pasaron van PRIMERO — es el orden
                    cronológico del día, y coincide con el handoff. */}
                {finalizadas.map(f => (
                  <FilaFinalizada key={f.id} t={t} slot={f} />
                ))}
                {slotsDia.map(slot => (
                  <TarjetaClase key={slot.id} t={t} slot={slot} onOpen={() => abrirSlot(slot)} ocultarPrecio={ocultarPrecio} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {variant === 'calendario' && estiloDias === 'semana' && (
        <>
          {/* ── Horarios del día (portal privado) ───────────────────────── */}
          {error ? (
            <EstadoErrorRed t={t} titulo={error.titulo} onReintentar={error.onReintentar} />
          ) : slotsDia.length === 0 ? (
            <EstadoVacio t={t} titulo="Sin clases este día" cuerpo="Prueba otro día de la semana" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {slotsDia.map(slot => (
                <SlotRow key={slot.id} t={t} slot={slot} onOpen={() => abrirSlot(slot)} />
              ))}
            </div>
          )}
        </>
      )}

      {variant === 'lista' && (
        error ? (
          <EstadoErrorRed t={t} titulo={error.titulo} onReintentar={error.onReintentar} />
        ) : gruposLista.length === 0 ? (
          <EstadoVacio t={t} titulo={emptyCopy.titulo} cuerpo={emptyCopy.cuerpo} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {gruposLista.map(grupo => (
              <div key={grupo.dayKey}>
                <p style={{ ...microLabel, marginBottom: 12 }}>
                  {etiquetaDia(new Date(grupo.items[0].inicio), hoy)}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {grupo.items.map(slot => (
                    <SlotRow key={slot.id} t={t} slot={slot} onOpen={() => abrirSlot(slot)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Hoja inferior de reserva ───────────────────────────────────────── */}
      {openSlot && (
        <BookingSheet
          t={t}
          slot={openSlot}
          selectedSpot={selectedSpot}
          onSelectSpot={setSelectedSpot}
          resultado={resultado}
          errorReserva={errorReserva}
          enviando={enviando}
          cancelacionVentanaHoras={cancelacionVentanaHoras}
          ventanaPorTipo={ventanaPorTipo}
          fontFamily={fontFamily}
          ocultarPrecio={ocultarPrecio}
          ocultarNivel={ocultarNivel}
          ocultarSustituta={ocultarSustituta}
          enIframe={enIframe}
          franjaVisible={franjaVisible}
          onClose={cerrarHoja}
          onAceptarOferta={onAceptarOferta ? async () => {
            if (!openSlot.miReservaId || enviando) return;
            setErrorReserva(null);
            setEnviando(true);
            // try/finally: si la llamada LANZA (red caída, 500 de Next), sin
            // esto `enviando` se quedaba en true para siempre y el botón moría
            // sin decir nada. El guardia `if (enviando) return` de arriba lo
            // hacía definitivo: ni un segundo intento.
            let r;
            try {
              r = await onAceptarOferta(openSlot.miReservaId);
            } catch {
              setErrorReserva('No hemos podido conectar. Inténtalo de nuevo.');
              return;
            } finally {
              setEnviando(false);
            }
            if (r && !r.ok) { setErrorReserva(r.error); return; }
            setResultado('CONFIRMADA');
          } : undefined}
          onReservar={async () => {
            if (enviando) return;
            setErrorReserva(null);
            // ⚠️ `onReservar(openSlot, selectedSpot)` puede devolver DE VERDAD
            // undefined en el mismo tick síncrono: es lo que hace
            // `handleReservarCalendario` cuando delega al modal de acceso
            // (`openBooking()`, sin `await` dentro). Antes esto se detectaba
            // con `await resultado` y solo ENTONCES se cerraba esta hoja — un
            // `await` SIEMPRE cede al menos un microtask, y React confirma
            // (pinta) el estado ya abierto de `openBooking()` antes de que ese
            // microtask corra. Resultado: un fotograma real, no teórico, con
            // las DOS hojas montadas a la vez — invisible en los e2e
            // (ejecución síncrona instantánea) pero visible a ojo en un
            // dispositivo real (encontrado en vídeo, franja naranja del CTA de
            // esta hoja asomando tras el modal de "Tus datos").
            //
            // Se detecta ANTES de tocar `enviando`/await: si lo que llega no
            // es un thenable, es la rama sin plaza que decidir todavía —
            // cerrar YA, en el MISMO batch de React que abrió el otro modal,
            // así que nunca coexisten en un commit pintado.
            const posible = onReservar(openSlot, selectedSpot);
            if (!posible || typeof (posible as Promise<unknown>).then !== 'function') {
              cerrarHoja();
              return;
            }
            setEnviando(true);
            // Ver el try/finally de onAceptarOferta: este es el botón de
            // RESERVAR, donde quedarse muerto es más caro todavía.
            let r;
            try {
              r = await posible;
            } catch {
              setErrorReserva('No hemos podido conectar. Inténtalo de nuevo.');
              return;
            } finally {
              setEnviando(false);
            }
            // Con un "no" del servidor la hoja SE QUEDA ABIERTA y dice por qué:
            // cerrarla dejaría a la clienta sin plaza y sin explicación.
            if (!r) return;
            if (!r.ok) { setErrorReserva(r.error); return; }
            setResultado(r.estado);
          }}
          onCancelar={async () => {
            if (!openSlot.miReservaId || enviando) return;
            setErrorReserva(null);
            setEnviando(true);
            let r;
            try {
              r = await onCancelar(openSlot.miReservaId);
            } catch {
              setErrorReserva('No hemos podido conectar. Inténtalo de nuevo.');
              return;
            } finally {
              setEnviando(false);
            }
            // `void` = quien lo pasa no informa (vía panel, que se corrige sola).
            if (r && !r.ok) { setErrorReserva(r.error); return; }
            setResultado('CANCELADA');
          }}
        />
      )}
    </div>
  );
}

// Cabecera del formato 01 mientras `dataLoaded` sigue en false — mismo hueco
// visual que la tira + la tarjeta del día reales (mismo alto, mismos radios),
// así el layout no salta cuando llegan los datos. El brillo reutiliza el
// keyframe ya compartido con las citas 1:1 (`widget-skeleton-shimmer`).
function SkeletonDias({ t }: { t: ModoTokens }) {
  const bloque = (w: string | number, h: number, r = 8): CSSProperties => ({
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(100deg, ${t.surface2} 40%, ${t.line} 50%, ${t.surface2} 60%)`,
    backgroundSize: '200% 100%', animation: 'widget-skeleton-shimmer 1.1s linear infinite',
  });
  return (
    <div aria-hidden="true" aria-busy="true">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${t.line}`, overflow: 'hidden' }}>
        {Array.from({ length: 6 }).map((_, i) => <div key={i} style={bloque(56, 68, 18)} />)}
      </div>
      <div style={{ padding: '12px 18px', borderRadius: radius.card, border: `1px solid ${t.line}`, background: t.surface2, marginBottom: 14 }}>
        <div style={bloque(140, 12)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ borderRadius: radius.card, background: t.surface, border: `1px solid ${t.line}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={bloque(76, 76, 14)} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                <div style={bloque(44, 10)} />
                <div style={bloque('60%', 20)} />
                <div style={bloque('35%', 12)} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={bloque(64, 22)} />
              <div style={bloque(140, 46, radius.pillBtnSm - 2)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fila de slot (tarjeta de horario) ────────────────────────────────────────

/** Fase 4 del rediseño: fila de una clase de HOY ya finalizada — mismo porte
 *  que `SlotRow` (misma tarjeta, mismo hueco de hora/nombre/instructora),
 *  pero sin `onClick` ni CTA: no se puede reservar algo que ya pasó. */
/** Iniciales de un nombre — mismo criterio simple que el resto del kit
 *  (dos primeras letras significativas, sin acentos raros que resolver). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

/** Avatar de instructora en iniciales — más compacto que `RoundPhoto`, es el
 *  formato del handoff (design_handoff_widget_reservas) para la fila de
 *  lista: una foto de 32px por fila competía visualmente con la hora/nombre
 *  de la clase, que es lo que de verdad hay que leer de un vistazo. */
function AvatarIniciales({ nombre, opaco }: { nombre: string; opaco?: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: 999, background: 'var(--portal-velo-suave)',
      border: '1px solid var(--portal-line)', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 8.5, fontWeight: 800, letterSpacing: '.03em',
      color: 'var(--portal-muted)', flexShrink: 0, opacity: opaco ? 0.7 : 1,
    }}>
      {iniciales(nombre)}
    </span>
  );
}

/** Fase 4 del rediseño: fila de una clase de HOY ya finalizada — mismo porte
 *  que `SlotRow` (misma tarjeta, mismo hueco de hora/nombre/instructora),
 *  pero sin `onClick` ni CTA: no se puede reservar algo que ya pasó. */
function FilaFinalizada({ t, slot }: {
  t: ModoTokens;
  slot: { id: string; inicio: string; fin: string; claseNombre: string; instructorNombre: string | null; instructorColor: string | null; instructorFotoUrl: string | null };
}) {
  const duracionMin = Math.round((new Date(slot.fin).getTime() - new Date(slot.inicio).getTime()) / 60000);
  return (
    <div style={{
      display: 'flex', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 14,
      border: `1px solid ${t.line}`, borderRadius: radius.card, background: t.surface,
      padding: '14px 16px', opacity: 0.55,
    }}>
      <div style={{ flex: '0 0 auto', width: 62 }}>
        <div style={{ fontFamily: serif, fontSize: 23, lineHeight: 1 }}>{fmtHora(slot.inicio)}</div>
        <div style={{ fontSize: 11, color: t.muted, marginTop: 5, letterSpacing: '.03em' }}>{duracionMin} min</div>
      </div>
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        <div style={{ fontFamily: serif, fontSize: 18.5, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {slot.claseNombre}
        </div>
        {slot.instructorNombre && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
            <AvatarIniciales nombre={slot.instructorNombre} />
            <span style={{ fontSize: 12.5, color: t.muted }}>{slot.instructorNombre}</span>
          </div>
        )}
      </div>
      <span style={{ flex: '0 0 auto', marginLeft: 'auto', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: t.muted }}>
        FINALIZADA
      </span>
    </div>
  );
}

function SlotRow({ t, slot, onOpen }: { t: ModoTokens; slot: ReservaSlot; onOpen: () => void }) {
  const libres = Math.max(0, slot.aforoMaximo - slot.ocupadas);
  const ratio = ratioOcupacion(slot.ocupadas, slot.aforoMaximo);
  const capColor = colorOcupacion(ratio);
  const lleno = libres <= 0;
  const duracionMin = Math.round((new Date(slot.fin).getTime() - new Date(slot.inicio).getTime()) / 60000);
  const yaMia = slot.miEstado === 'CONFIRMADA' || slot.miEstado === 'LISTA_ESPERA';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="reserva-slot-row"
      aria-label={`${slot.claseNombre} a las ${fmtHora(slot.inicio)}${slot.instructorNombre ? `, con ${slot.instructorNombre}` : ''}, ${
        slot.miEstado === 'CONFIRMADA' ? 'ya la tienes reservada'
        : slot.miEstado === 'LISTA_ESPERA' ? 'estás en lista de espera'
        : lleno ? 'completa' : `${libres} plazas`}`}
      style={{
        display: 'flex', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'transparent',
        alignItems: 'center', flexWrap: 'wrap', gap: 14, borderTop: `1px solid ${t.line}`, padding: '18px 4px',
        borderRadius: radius.spot,
      }}
    >
      {/* Hora + duración */}
      <div style={{ flex: '0 0 auto', width: 62 }}>
        <div style={{ fontFamily: serif, fontSize: 23, lineHeight: 1, color: t.ink, fontVariantNumeric: 'tabular-nums' }}>
          {fmtHora(slot.inicio)}
        </div>
        <div style={{ fontSize: 11, color: t.muted, marginTop: 5, letterSpacing: '.03em' }}>{duracionMin} min</div>
      </div>

      {/* Nombre + instructora + disponibilidad */}
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        <div style={{ fontFamily: serif, fontSize: 18.5, lineHeight: 1.2, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {slot.claseNombre}
        </div>
        {slot.instructorNombre && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
            <AvatarIniciales nombre={slot.instructorNombre} />
            <span style={{ fontSize: 12.5, color: t.muted }}>{slot.instructorNombre}</span>
          </div>
        )}
        {!yaMia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: lleno ? t.muted : capColor, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: ratio >= 0.85 && !lleno ? 700 : 500, color: lleno ? t.muted : capColor, letterSpacing: '.01em' }}>
              {lleno ? 'Completa' : ratio >= 0.85 ? `¡${etiquetaOcupacion(ratio).toLowerCase()}!` : `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'}`}
            </span>
          </div>
        )}
      </div>

      {/* Acción — checkmark si ya es mía, botón sólido si se puede reservar,
          botón de contorno si está completa (lista de espera). Mismo criterio
          que el handoff (design_handoff_widget_reservas): tres estados
          visuales distintos, no un único CTA genérico. */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
        {yaMia ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: radius.pillBtnSm - 2,
            background: 'color-mix(in oklab, var(--portal-brand) 10%, var(--portal-surface))', color: 'var(--portal-brand)',
            fontSize: 12.5, fontWeight: 700,
          }}>
            <EstadoIcono estado={slot.miEstado as 'CONFIRMADA' | 'LISTA_ESPERA'} />
            {slot.miEstado === 'CONFIRMADA' ? 'Reservada' : 'En espera'}
          </span>
        ) : lleno ? (
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 16px',
            border: '1px solid color-mix(in oklab, var(--portal-brand) 40%, transparent)', borderRadius: radius.pillBtnSm - 2,
            color: 'var(--portal-brand)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Lista de espera
          </span>
        ) : (
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 18px',
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: radius.pillBtnSm - 2,
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Reservar
          </span>
        )}
      </div>
    </button>
  );
}

// ── Tarjeta rica de clase (rediseño Momence, solo estiloDias='dias') ─────────
//
// Pedido literal del fundador con capturas de Momence móvil de referencia:
// foto de la clase, rótulo pequeño «CLASE», título grande, instructora,
// descripción truncada con «Mostrar más», filas con icono (fecha completa,
// hora + duración, sala) y abajo PRECIO grande + botón sólido «Reservar
// ahora». Mantiene el contrato de los e2e existentes: className
// `reserva-slot-row`, role=button y el mismo aria-label que `SlotRow`.
//
// Es un <div role="button"> y no un <button> porque «Mostrar más» necesita ser
// interactivo DENTRO de la tarjeta, y un botón anidado en otro botón es HTML
// inválido (el navegador lo re-anida y el click se pierde).
function TarjetaClase({ t, slot, onOpen, ocultarPrecio }: {
  t: ModoTokens; slot: ReservaSlot; onOpen: () => void; ocultarPrecio: boolean;
}) {
  const [verMas, setVerMas] = useState(false);
  const libres = Math.max(0, slot.aforoMaximo - slot.ocupadas);
  const ratio = ratioOcupacion(slot.ocupadas, slot.aforoMaximo);
  const capColor = colorOcupacion(ratio);
  const lleno = libres <= 0;
  const duracionMin = Math.round((new Date(slot.fin).getTime() - new Date(slot.inicio).getTime()) / 60000);
  const yaMia = slot.miEstado === 'CONFIRMADA' || slot.miEstado === 'LISTA_ESPERA';
  // Umbral generoso: por debajo, dos líneas de clamp no recortan nada y el
  // «Mostrar más» sería un botón que no hace nada visible.
  const descLarga = (slot.descripcion ?? '').length > 120;
  const mostrarPrecio = slot.precio != null && !ocultarPrecio && !yaMia;

  const filaIcono = (icon: React.ReactNode, texto: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ color: t.muted, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: t.ink, fontWeight: 600 }}>{texto}</span>
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="reserva-slot-row"
      aria-label={`${slot.claseNombre} a las ${fmtHora(slot.inicio)}${slot.instructorNombre ? `, con ${slot.instructorNombre}` : ''}, ${
        slot.miEstado === 'CONFIRMADA' ? 'ya la tienes reservada'
        : slot.miEstado === 'LISTA_ESPERA' ? 'estás en lista de espera'
        : lleno ? 'completa' : `${libres} plazas`}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', cursor: 'pointer',
        background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 16,
        WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Foto + rótulo + título */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <FotoClase nombre={slot.claseNombre} color={slot.claseColor} fotoUrl={slot.claseFotoUrl} ancho={76} alto={76} radio={14} />
        <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.muted }}>Clase</p>
          <h3 style={{ fontFamily: serif, fontSize: 21, fontWeight: 400, lineHeight: 1.15, color: t.ink, marginTop: 4 }}>
            {slot.claseNombre}
          </h3>
          {!yaMia && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: lleno ? t.muted : capColor, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: ratio >= 0.85 && !lleno ? 700 : 500, color: lleno ? t.muted : capColor, letterSpacing: '.01em' }}>
                {lleno ? 'Completa' : ratio >= 0.85 ? `¡${etiquetaOcupacion(ratio).toLowerCase()}!` : `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: t.line }} />

      {/* Instructora */}
      {slot.instructorNombre && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <RoundPhoto nombre={slot.instructorNombre} color={slot.instructorColor} fotoUrl={slot.instructorFotoUrl} size={26} />
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slot.instructorNombre}
          </span>
        </div>
      )}

      {/* Descripción truncada con «Mostrar más» */}
      {slot.descripcion && (
        <div>
          <p style={{
            fontSize: 13, color: t.muted2, lineHeight: 1.5,
            ...(descLarga && !verMas
              ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
              : {}),
          }}>
            {slot.descripcion}
          </p>
          {descLarga && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); setVerMas(v => !v); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setVerMas(v => !v); } }}
              style={{ display: 'inline-block', marginTop: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-brand)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {verMas ? 'Mostrar menos' : 'Mostrar más'}
            </span>
          )}
        </div>
      )}

      {/* Filas con icono: fecha completa, hora + duración, sala */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filaIcono(<CalendarDays size={15} />, capitaliza(fmtDiaCompleto(slot.inicio)))}
        {filaIcono(<Clock size={15} />, `${fmtHora(slot.inicio)} - ${fmtHora(slot.fin)} · ${duracionMin} min`)}
        {slot.salaNombre && filaIcono(<MapPin size={15} />, slot.salaNombre)}
      </div>

      <div style={{ height: 1, background: t.line }} />

      {/* Precio grande + CTA protagonista. El CTA es un span aria-hidden (la
          tarjeta entera ya es el botón accesible), mismo criterio que SlotRow. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {mostrarPrecio ? (
          <span style={{ fontFamily: serif, fontSize: 24, lineHeight: 1, color: t.ink, fontVariantNumeric: 'tabular-nums' }}>
            {slot.precio} €
          </span>
        ) : <span />}
        {yaMia ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 18px', borderRadius: radius.pillBtnSm - 2,
            background: 'color-mix(in oklab, var(--portal-brand) 10%, var(--portal-surface))', color: 'var(--portal-brand)',
            fontSize: 13, fontWeight: 700,
          }}>
            <EstadoIcono estado={slot.miEstado as 'CONFIRMADA' | 'LISTA_ESPERA'} />
            {slot.miEstado === 'CONFIRMADA' ? 'Reservada' : 'En espera'}
          </span>
        ) : lleno ? (
          <span aria-hidden="true" className="reserva-cta-btn" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 20px',
            border: '1px solid color-mix(in oklab, var(--portal-brand) 40%, transparent)', borderRadius: radius.pillBtnSm - 2,
            color: 'var(--portal-brand)', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Lista de espera
          </span>
        ) : (
          <span aria-hidden="true" className="reserva-cta-btn" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 22px',
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: radius.pillBtnSm - 2,
            fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap',
          }}>
            Reservar ahora
          </span>
        )}
      </div>
    </div>
  );
}

// ── Hoja inferior (bottom sheet) ─────────────────────────────────────────────

function BookingSheet({
  t, slot, selectedSpot, onSelectSpot, resultado, errorReserva, enviando, cancelacionVentanaHoras, ventanaPorTipo,
  fontFamily, ocultarPrecio = false, ocultarNivel = false, ocultarSustituta = false,
  enIframe = false, franjaVisible = null,
  onClose, onReservar, onCancelar, onAceptarOferta,
}: {
  t: ModoTokens;
  slot: ReservaSlot;
  selectedSpot: string | null;
  onSelectSpot: (id: string | null) => void;
  resultado: EstadoReserva | 'CANCELADA' | null;
  errorReserva: string | null;
  enviando: boolean;
  cancelacionVentanaHoras?: number;
  ventanaPorTipo?: Record<string, number>;
  fontFamily: string;
  ocultarPrecio?: boolean;
  ocultarNivel?: boolean;
  ocultarSustituta?: boolean;
  enIframe?: boolean;
  franjaVisible?: { top: number; height: number } | null;
  onClose: () => void;
  onReservar: () => void;
  onCancelar: () => void;
  onAceptarOferta?: () => void;
}) {
  const titleId = useId();
  // P2-8: el tipo de esta clase puede tener su propia ventana; sin override,
  // se hereda la del estudio (comportamiento de siempre).
  const ventanaEfectiva = (slot.tipoClaseId && ventanaPorTipo?.[slot.tipoClaseId] != null)
    ? ventanaPorTipo[slot.tipoClaseId]
    : cancelacionVentanaHoras;
  const libres = Math.max(0, slot.aforoMaximo - slot.ocupadas);
  const lleno = libres <= 0;
  const yaReservada = slot.miEstado === 'CONFIRMADA';
  const enEspera = slot.miEstado === 'LISTA_ESPERA';
  const tieneReserva = yaReservada || enEspera;

  // El selector de sitio solo tiene sentido al reservar (hueco libre, sin reserva
  // previa) y si la sala tiene reformers. La lista de espera no ocupa sitio.
  const mostrarSpots = slot.spots.length > 0 && !lleno && !tieneReserva;
  const ocupados = useMemo(() => new Set(slot.spotsOcupados), [slot.spotsOcupados]);

  // Cierra con Escape (accesibilidad).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = tieneReserva
    ? (enEspera ? 'Salir de la lista de espera' : 'Cancelar reserva')
    : lleno
      ? 'Apuntarme a la lista de espera'
      // "por", nunca un interpunto pegado al importe: "· 1 €" se lee como un
      // signo raro delante del precio (mismo criterio que el CTA de pago).
      : (slot.precio != null && !ocultarPrecio ? `Reservar por ${slot.precio} €` : 'Reservar');

  const esCancelar = tieneReserva;

  // Fase 5 (Booking Engine): oferta de plaza liberada, con plazo. `onAceptarOferta`
  // ausente (Modo B sin endpoint público wireado todavía) cae al aviso pasivo.
  const hayOferta = enEspera && !!slot.miOfertaExpiraEn && !!onAceptarOferta;

  // P0-3 (mobile UX): dónde anclar la hoja. Fuera de un iframe, la hoja de
  // siempre (abajo del viewport real). Dentro de un iframe auto-dimensionado,
  // «el viewport» es TODO el iframe (2000px o más), así que:
  //  - con `franjaVisible` (snippet nuevo): la hoja se ancla al fondo de la
  //    franja que el usuario está viendo de verdad;
  //  - sin ella (snippet viejo): al TOP del iframe — quien abre la ficha acaba
  //    de tocar una tarjeta que está en su pantalla, y el top del iframe está
  //    como mucho a un scroll corto, nunca a 1000px como el fondo.
  const overlayPos: CSSProperties = enIframe
    ? (franjaVisible
      ? { left: 0, right: 0, top: franjaVisible.top, height: franjaVisible.height, alignItems: 'flex-end' }
      : { inset: 0, alignItems: 'flex-start', paddingTop: 16 })
    : { inset: 0, alignItems: 'flex-end' };
  const sheetMaxHeight = enIframe
    ? (franjaVisible ? '100%' : 'min(88vh, 640px)')
    : '88vh';

  // Con la hoja abierta, el listado de detrás ya no se mueve. Ver el docblock
  // del hook: medido en producción, `body` se quedaba en `overflow: visible` y
  // el gesto se encadenaba al fondo al llegar al final de la hoja.
  useBloquearScrollFondo(true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="animate-sheet-backdrop-in"
      style={{
        position: 'fixed', zIndex: 50, display: 'flex',
        // Abajo en móvil (hoja), centrado en pantallas grandes (diálogo).
        // `overlayPos` decide el anclaje real (ver arriba: iframe vs página).
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', fontFamily,
        ...overlayPos,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="reserva-sheet-in"
        // Medido en el navegador a 1280px: esto era una banda a TODO el ancho
        // pegada al borde inferior, con ~1000px de vacío entre cada etiqueta y
        // su valor («HORARIO ......... 10:00 – 10:50») y un botón «RESERVAR» de
        // 1240px. Un patrón de móvil ampliado, no un diseño de escritorio.
        //
        // Se arregla con un `maxWidth` y el centrado del padre, SIN CSS nuevo y
        // sin media queries: por debajo de 560px sigue siendo exactamente la
        // hoja de siempre (el 100% manda), y por encima queda una tarjeta
        // centrada del ancho de una columna legible.
        //
        // ⚠️ Con una clase CSS habría quedado mejor (diálogo centrado en
        // vertical), pero este componente es inline-styled A PROPÓSITO: también
        // lo compila esbuild para el bundle embebido, sin Tailwind ni PostCSS
        // (`animate-spin`/`animate-sheet-*`/`reserva-*`, resueltas a mano en
        // widget.css). Una clase nueva habría que duplicarla ahí, y el widget
        // incrustado se vería distinto del alojado en cuanto una de las dos se
        // quedara atrás.
        // P0-3: el CTA ya no va al final del contenido scrolleable (nacía fuera
        // de pantalla: medido, top 894px con viewport de 844) — ahora es un
        // footer sticky DENTRO del scroller (ver abajo), así que el padding
        // inferior gigante de antes (`sheetBottomPadding`) sobra: el footer
        // lleva el suyo propio con `env(safe-area-inset-bottom)`.
        style={{
          width: '100%', maxWidth: 560, background: t.bg,
          borderRadius: enIframe && !franjaVisible ? 24 : '24px 24px 0 0',
          padding: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: 14,
          maxHeight: sheetMaxHeight, overflowY: 'auto',
          // Corta el encadenamiento del gesto: al llegar al final de la hoja,
          // el scroll NO pasa al listado de detrás.
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 999, background: t.line, margin: '6px auto 4px', flexShrink: 0 }} />

        {/* Foto de la clase — primer elemento del popup (orden pedido por el
            fundador: foto, título, fecha/hora/duración, ubicación, descripción,
            acción). Con fallback al color del tipo, nunca a un asset de /public
            (ver FotoClase). */}
        <FotoClase nombre={slot.claseNombre} color={slot.claseColor} fotoUrl={slot.claseFotoUrl} ancho="100%" alto={slot.claseFotoUrl ? 150 : 96} radio={16} />

        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {!ocultarNivel && <span style={{ ...nivelBadge(slot.nivel), marginBottom: 8 }}>{NIVEL_LABEL[slot.nivel]}</span>}
            <h2 id={titleId} style={{ fontSize: 22, fontWeight: 800, color: t.ink, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: '-0.02em', marginTop: 8 }}>
              {slot.claseNombre}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ ...navBtn(t), flexShrink: 0 }}>
            <X size={18} style={{ color: t.ink }} />
          </button>
        </div>

        {/* Datos */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FilaDato t={t} icon={<Clock size={14} />} label="Horario" valor={`${fmtHora(slot.inicio)} – ${fmtHora(slot.fin)}`} />
          <FilaDato t={t} icon={<CalendarDays size={14} />} label="Fecha" valor={capitaliza(fmtDiaLargo(slot.inicio))} />
          {slot.salaNombre && <FilaDato t={t} icon={<MapPin size={14} />} label="Sala" valor={slot.salaNombre} />}
          <FilaDato
            t={t}
            icon={<Users size={14} />}
            label="Plazas"
            // Auditoría P1-confianza: «0/8 · 8 libres» se leía como «cero
            // plazas» — el ratio ocupadas/aforo es jerga de panel, no de
            // clienta. La cifra que importa es cuántas quedan, con el mismo
            // copy que la tarjeta rica («X plazas libres»); la barra de abajo
            // ya cuenta la ocupación de un vistazo.
            valor={lleno ? 'Completa' : `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'}`}
            valorColor={lleno ? semantic.danger.text : (libres <= 2 ? semantic.warning.text : t.ink)}
          />
          {/* Barra de ocupación — la cifra de arriba ya lo dice, esto es para
              leerlo de un vistazo sin hacer la resta mental. Mismo ratio/color
              que el punto de SlotRow (lib/ocupacion.ts), nunca un número
              inventado aparte. */}
          <div style={{ height: 4, borderRadius: 999, background: t.line, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.round(ratioOcupacion(slot.ocupadas, slot.aforoMaximo) * 100)}%`,
              background: colorOcupacion(ratioOcupacion(slot.ocupadas, slot.aforoMaximo)), borderRadius: 999,
              transition: `width .5s ${EASE}`,
            }} />
          </div>
          {slot.instructorNombre && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <RoundPhoto nombre={slot.instructorNombre} color={slot.instructorColor} fotoUrl={slot.instructorFotoUrl} size={34} ring={t.surface2} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: t.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.instructorNombre}</p>
                <p style={{ fontSize: 11.5, color: t.muted }}>
                  {slot.instructorOriginalNombre && !ocultarSustituta
                    ? `Sustituye a ${slot.instructorOriginalNombre} hoy`
                    : (slot.instructorRol === 'PROPIETARIO' ? 'Directora' : 'Instructora')}
                </p>
              </div>
            </div>
          )}
        </div>

        {slot.descripcion && (
          <p style={{ fontSize: 13.5, color: t.muted2, lineHeight: 1.5 }}>{slot.descripcion}</p>
        )}

        {/* Selector de sitio. Con aforo grande (8+ plazas) la rejilla ocupa
            varias pantallas de scroll antes del botón "Reservar" — el atajo
            deja reservar sin bajar hasta el final para quien no quiere elegir. */}
        {mostrarSpots && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: t.ink }}>
                Elige tu sitio <span style={{ color: t.muted, fontWeight: 600 }}>(opcional)</span>
              </p>
              <button
                type="button"
                onClick={() => { onSelectSpot(null); onReservar(); }}
                disabled={enviando}
                style={{
                  fontSize: 11.5, fontWeight: 700, color: 'var(--portal-brand)', background: 'none', border: 'none',
                  padding: 0, cursor: enviando ? 'default' : 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Reservar sin elegir →
              </button>
            </div>
            <SpotPicker t={t} spots={slot.spots} ocupados={ocupados} selected={selectedSpot} onSelect={onSelectSpot} />
          </div>
        )}

        {/* Banner de resultado / estado actual */}
        {errorReserva && <Banner tipo="warn" texto={errorReserva} />}
        {resultado === 'CONFIRMADA' && <Banner tipo="ok" texto="¡Reserva confirmada! Te esperamos en clase." />}
        {resultado === 'LISTA_ESPERA' && <Banner tipo="warn" texto="Estás en lista de espera. Te avisaremos si se libera una plaza." />}
        {resultado === 'CANCELADA' && <Banner tipo="warn" texto="Reserva cancelada." />}
        {!resultado && yaReservada && <Banner tipo="ok" texto="Ya tienes esta clase reservada." />}
        {!resultado && enEspera && !hayOferta && <Banner tipo="warn" texto="Estás en lista de espera para esta clase." />}

        {!resultado && hayOferta && (
          <div style={{ padding: '13px 15px', borderRadius: radius.card, background: semantic.warning.soft }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, marginBottom: 10, lineHeight: 1.4 }}>
              ¡Se ha liberado una plaza! Tienes hasta las {fmtHora(slot.miOfertaExpiraEn!)} para aceptarla.
            </p>
            <button
              type="button"
              disabled={enviando}
              onClick={onAceptarOferta}
              className="reserva-cta-btn"
              style={{
                width: '100%', height: 44, borderRadius: 14, border: 'none', fontSize: 13.5, fontWeight: 800,
                background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.6 : 1,
              }}
            >
              {enviando ? 'Aceptando…' : 'Aceptar plaza'}
            </button>
          </div>
        )}

        {/* §3 — Qué consume la reserva, justo encima del botón y no perdido en
            una esquina: es el último dato que ve antes de pulsar. Solo al
            reservar — con la reserva ya hecha, el saldo que se enseñaría sería
            el de ANTES de descontar, y sonaría a que se va a cobrar otra vez. */}
        {/* `ocultarPrecio` también apaga esta caja: la cobertura habla de
            importes («15 € como clase suelta») — dejarla con el CTA mudo
            filtraría el precio por la puerta de atrás. */}
        {!tieneReserva && !lleno && slot.coberturaTexto && !ocultarPrecio && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px',
              borderRadius: radius.card, background: t.surface, border: `1px solid ${t.line}`,
            }}
          >
            <Ticket size={15} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
            <p style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, lineHeight: 1.35 }}>
              {slot.coberturaTexto}
            </p>
          </div>
        )}

        {/* ── Footer sticky (P0-3) ─────────────────────────────────────────
            Aviso de cancelación + CTA, SIEMPRE visibles al abrir la hoja: el
            contenido scrollea por debajo. `sticky bottom: 0` dentro del
            scroller, fondo sólido y sombra superior sutil para separarlo del
            contenido que pasa por detrás; los márgenes negativos lo llevan a
            sangre (el scroller lleva el padding horizontal) para que no se
            vea contenido asomando por los lados. `flexShrink: 0`: sin él, con
            la hoja llena el flex lo comprimiría antes de activar el scroll. */}
        <div
          style={{
            position: 'sticky', bottom: 0, zIndex: 1, flexShrink: 0,
            margin: '0 -20px', padding: '12px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)',
            background: t.bg,
            boxShadow: `0 -1px 0 ${t.line}, 0 -12px 18px -14px rgba(0,0,0,0.22)`,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {ventanaEfectiva != null && ventanaEfectiva > 0 && !tieneReserva && !lleno && (
            <p style={{ fontSize: 12, color: t.muted }}>
              Cancela con al menos {ventanaEfectiva}h de antelación para recuperar tu sesión.
            </p>
          )}

          {/* Acción principal */}
          <button
            type="button"
            onClick={esCancelar ? onCancelar : onReservar}
            disabled={resultado === 'CANCELADA' || enviando}
            aria-busy={enviando}
            className="reserva-cta-btn"
            // Más alto y con más cuerpo que antes (52→58): feedback literal del
            // fundador — «los sitios son muy grandes y el botón de reservar es muy
            // pequeño». La jerarquía se invierte: spots compactos, CTA protagonista.
            style={{
              width: '100%', height: 58, borderRadius: 16, fontSize: 15.5, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.02em', border: 'none',
              cursor: resultado === 'CANCELADA' || enviando ? 'default' : 'pointer',
              opacity: resultado === 'CANCELADA' ? 0.4 : enviando ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0,
              ...(esCancelar
                ? { background: semantic.danger.soft, color: semantic.danger.text }
                : { background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)' }),
            }}
          >
            {enviando && (
              <span aria-hidden className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.85, flexShrink: 0 }} />
            )}
            {resultado === 'CANCELADA' ? 'Cancelada' : enviando ? 'Un momento…' : label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Piezas menores ───────────────────────────────────────────────────────────

function FilaDato({ t, icon, label, valor, valorColor }: {
  t: ModoTokens; icon: React.ReactNode; label: string; valor: string; valorColor?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: t.muted }}>
        <span style={{ color: t.muted }}>{icon}</span>{label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, color: valorColor ?? t.ink, textAlign: 'right' }}>{valor}</span>
    </div>
  );
}

function EstadoIcono({ estado }: { estado: 'CONFIRMADA' | 'LISTA_ESPERA' }) {
  return estado === 'CONFIRMADA'
    ? <CheckCircle2 size={14} style={{ color: semantic.success.text, flexShrink: 0 }} />
    : <AlertTriangle size={14} style={{ color: semantic.warning.text, flexShrink: 0 }} />;
}

function Banner({ tipo, texto }: { tipo: 'ok' | 'warn'; texto: string }) {
  const c = tipo === 'ok' ? semantic.success : semantic.warning;
  return (
    <div role="status" className="reserva-banner-in" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 14, padding: '11px 14px', background: c.soft }}>
      {tipo === 'ok'
        ? <CheckCircle2 size={15} style={{ color: c.text, flexShrink: 0 }} />
        : <AlertTriangle size={15} style={{ color: c.text, flexShrink: 0 }} />}
      <p style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{texto}</p>
    </div>
  );
}

// Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md): patrón
// único de estado no feliz — icono circular 52px, título display, cuerpo
// acotado a 300px, CTA outline opcional. Compartido por los 6 formatos porque
// todos montan `ReservaCalendario` en algún momento (Modo B incluido).
function EstadoVacio({ t, titulo, cuerpo, ctaLabel, onCta }: {
  t: ModoTokens; titulo: string; cuerpo: string; ctaLabel?: string; onCta?: () => void;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px 56px' }}>
      <div style={{ width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.surface2, color: t.muted }}>
        <Clock size={22} />
      </div>
      <p style={{ fontFamily: serif, fontSize: 21, marginTop: 16, color: t.ink }}>{titulo}</p>
      <p style={{ fontSize: 13, color: t.muted, marginTop: 6, maxWidth: 300, marginInline: 'auto' }}>{cuerpo}</p>
      {ctaLabel && onCta && (
        <button type="button" onClick={onCta} style={{
          marginTop: 18, height: 42, padding: '0 20px', borderRadius: 999, cursor: 'pointer',
          background: 'transparent', border: '1px solid color-mix(in oklab, var(--portal-brand) 40%, transparent)',
          color: 'var(--portal-brand)', fontFamily: sans, fontWeight: 700, fontSize: 13,
        }}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

/** Mismo hueco visual que `EstadoVacio`, para cuando la carga falló de verdad
 *  (red/servidor) en vez de simplemente no haber nada que mostrar. */
function EstadoErrorRed({ t, titulo = 'No hemos podido cargar el horario', onReintentar }: {
  t: ModoTokens; titulo?: string; onReintentar: () => void;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px 56px' }} role="alert">
      <div style={{ width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: semantic.danger.soft, color: semantic.danger.text }}>
        <AlertCircle size={22} />
      </div>
      <p style={{ fontFamily: serif, fontSize: 21, marginTop: 16, color: t.ink }}>{titulo}</p>
      <p style={{ fontSize: 13, color: t.muted, marginTop: 6, maxWidth: 300, marginInline: 'auto' }}>
        Parece un problema de conexión. Inténtalo de nuevo en unos segundos.
      </p>
      <button type="button" onClick={onReintentar} style={{
        marginTop: 18, height: 42, padding: '0 20px', borderRadius: 999, cursor: 'pointer', border: 'none',
        background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontFamily: sans, fontWeight: 700, fontSize: 13,
      }}>
        Reintentar
      </button>
    </div>
  );
}

// Versiones en neutros FIJOS de arriba, solo para `estiloDias === 'grid'`
// (formato 06, Modo B) — "los estados de carga/vacío/error usan los mismos
// patrones en neutros y fuente de sistema" (brief de diseño Fase 4).
function RejillaGridVacio({ titulo, cuerpo }: { titulo: string; cuerpo: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px 56px', fontFamily: GRID_FUENTE }}>
      <div style={{ width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: GRID_NEUTROS.linea2, color: GRID_NEUTROS.mut }}>
        <Clock size={22} />
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, marginTop: 16, color: GRID_NEUTROS.ink }}>{titulo}</p>
      <p style={{ fontSize: 13, color: GRID_NEUTROS.mut, marginTop: 6, maxWidth: 300, marginInline: 'auto' }}>{cuerpo}</p>
    </div>
  );
}
function RejillaGridError({ titulo = 'No hemos podido cargar el horario', onReintentar }: { titulo?: string; onReintentar: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px 56px', fontFamily: GRID_FUENTE }} role="alert">
      <div style={{ width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: semantic.danger.soft, color: semantic.danger.text }}>
        <AlertCircle size={22} />
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, marginTop: 16, color: GRID_NEUTROS.ink }}>{titulo}</p>
      <p style={{ fontSize: 13, color: GRID_NEUTROS.mut, marginTop: 6, maxWidth: 300, marginInline: 'auto' }}>
        Parece un problema de conexión. Inténtalo de nuevo en unos segundos.
      </p>
      <button type="button" onClick={onReintentar} style={{
        marginTop: 18, height: 42, padding: '0 20px', borderRadius: 999, cursor: 'pointer', border: 'none',
        background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontFamily: GRID_FUENTE, fontWeight: 700, fontSize: 13,
      }}>
        Reintentar
      </button>
    </div>
  );
}

// ── Estilos compartidos ──────────────────────────────────────────────────────

function navBtn(t: ModoTokens): CSSProperties {
  return {
    width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: t.surface, border: `1px solid ${t.line}`, cursor: 'pointer',
  };
}
function nivelBadge(nivel: NivelClase): CSSProperties {
  return {
    display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#fff',
    padding: '4px 10px', borderRadius: 999, background: NIVEL_COLOR[nivel],
    textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
  };
}
function capitaliza(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
