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
  CheckCircle, AlertCircle, CalendarDays, Ticket,
} from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { NivelClase, EstadoReserva, Spot } from '@/lib/types';
import type { ResultadoReserva } from '@/lib/studio-context';
import type { ResultadoEscritura } from '@/lib/errores';
import { semantic, sheetBottomPadding } from '@/lib/portal-tokens';
import { colorOcupacion, ratioOcupacion, etiquetaOcupacion } from '@/lib/ocupacion';
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
  fontFamily?: string;
  /**
   * Fase 1 del rediseño (docs/widget-reservas-theme-builder-diseno.md): la
   * tira de 10 días con scroll horizontal de las pantallas 01/02 del handoff,
   * en vez de la tira de SEMANA con paginación ‹ › de siempre. Por defecto
   * 'semana' — cero cambio para cualquier caller existente (Modo B, "Mis
   * reservas", vista Mes...). Solo Modo A la activa hoy, y solo en la tab
   * "Clases"; el resto del componente (spot picker, hoja, estados vacíos,
   * variant='lista') es idéntico en ambos estilos.
   */
  estiloDias?: 'semana' | 'dias';
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtDiaLargo(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
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
  variant = 'calendario', cancelacionVentanaHoras, ventanaPorTipo, vacio, fontFamily = FUENTE,
  irADia, estiloDias = 'semana',
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
  const diez = useMemo(() => Array.from({ length: 10 }, (_, i) => addDays(hoy, i)), [hoy]);
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
      {variant === 'calendario' && estiloDias === 'dias' && (
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

      {variant === 'calendario' && (
        <>
          {/* ── Horarios del día ─────────────────────────────────────────── */}
          {slotsDia.length === 0 ? (
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
        gruposLista.length === 0 ? (
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
          onClose={cerrarHoja}
          onAceptarOferta={onAceptarOferta ? async () => {
            if (!openSlot.miReservaId || enviando) return;
            setErrorReserva(null);
            setEnviando(true);
            const r = await onAceptarOferta(openSlot.miReservaId);
            setEnviando(false);
            if (r && !r.ok) { setErrorReserva(r.error); return; }
            setResultado('CONFIRMADA');
          } : undefined}
          onReservar={async () => {
            if (enviando) return;
            setErrorReserva(null);
            setEnviando(true);
            const r = await onReservar(openSlot, selectedSpot);
            setEnviando(false);
            // Sin resultado → el flujo se ha derivado a otra superficie (modal de
            // acceso del widget público): cerramos la hoja para que no quede
            // apilada detrás de ese modal.
            if (!r) { cerrarHoja(); return; }
            // Con un "no" del servidor la hoja SE QUEDA ABIERTA y dice por qué:
            // cerrarla dejaría a la clienta sin plaza y sin explicación.
            if (!r.ok) { setErrorReserva(r.error); return; }
            setResultado(r.estado);
          }}
          onCancelar={async () => {
            if (!openSlot.miReservaId || enviando) return;
            setErrorReserva(null);
            setEnviando(true);
            const r = await onCancelar(openSlot.miReservaId);
            setEnviando(false);
            // `void` = quien lo pasa no informa (vía panel, que se corrige sola).
            if (r && !r.ok) { setErrorReserva(r.error); return; }
            setResultado('CANCELADA');
          }}
        />
      )}
    </div>
  );
}

// ── Fila de slot (tarjeta de horario) ────────────────────────────────────────

function SlotRow({ t, slot, onOpen }: { t: ModoTokens; slot: ReservaSlot; onOpen: () => void }) {
  const libres = Math.max(0, slot.aforoMaximo - slot.ocupadas);
  const ratio = ratioOcupacion(slot.ocupadas, slot.aforoMaximo);
  const capColor = colorOcupacion(ratio);
  const lleno = libres <= 0;
  const duracionMin = Math.round((new Date(slot.fin).getTime() - new Date(slot.inicio).getTime()) / 60000);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${slot.claseNombre} a las ${fmtHora(slot.inicio)}${slot.instructorNombre ? `, con ${slot.instructorNombre}` : ''}, ${
        slot.miEstado === 'CONFIRMADA' ? 'ya la tienes reservada'
        : slot.miEstado === 'LISTA_ESPERA' ? 'estás en lista de espera'
        : lleno ? 'completa' : `${libres} plazas`}`}
      style={{
        display: 'flex', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
        alignItems: 'center', flexWrap: 'wrap', gap: cq(12, 1.8, 24),
        background: lleno ? 'var(--portal-velo-suave)' : (slot.miEstado === 'CONFIRMADA' ? 'var(--portal-surface-2)' : t.surface),
        borderRadius: radius.card, padding: `${cq(20, 2.2, 26)} ${cq(20, 2.6, 30)}`,
        boxShadow: lleno ? undefined : shadow.card,
      }}
    >
      {/* La foto del tipo de clase, si la propietaria subió una.
          ⚠️ Aquí NO entra la foto por defecto, y es deliberado: en un listado
          la misma imagen repetida en ocho filas se lee como un error, mientras
          que en la cabecera del detalle —donde se pinta grande y sola— sí
          ayuda. Este `claseFotoUrl` llevaba tiempo viajando hasta aquí sin que
          nadie lo pintara, y el panel prometía que salía en esta página. */}
      {slot.claseFotoUrl && (
        <div style={{ flex: '0 0 auto', width: 52, height: 52, borderRadius: 14, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.claseFotoUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: lleno ? 0.6 : 1 }}
          />
        </div>
      )}

      {/* Hora + duración */}
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ fontFamily: serif, fontSize: cq(24, 2.4, 30), lineHeight: 1, color: lleno ? t.muted : t.ink }}>
          {fmtHora(slot.inicio)}
        </div>
        <div style={{ fontSize: 10, color: t.muted, marginTop: 6 }}>{duracionMin} min</div>
      </div>

      {/* Nombre + nivel/instructora */}
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        {slot.miEstado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <EstadoIcono estado={slot.miEstado} />
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.2em', color: t.ink }}>
              {slot.miEstado === 'CONFIRMADA' ? 'RESERVADA' : 'EN LISTA DE ESPERA'}
            </span>
          </div>
        )}
        <div style={{ fontFamily: serif, fontSize: cq(21, 2.2, 27), lineHeight: 1.05, color: lleno ? t.muted : t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {slot.claseNombre}
        </div>
        <div style={{ fontSize: 11.5, color: t.muted, marginTop: 8 }}>
          {NIVEL_LABEL[slot.nivel]}{slot.salaNombre ? ` · ${slot.salaNombre}` : ''} · {slot.aforoMaximo} plazas
          {/* Antes el precio solo se veía al abrir el detalle — para comparar
              clases hay que abrir cada una. null = cubierta por plan, no "gratis". */}
          {slot.precio != null && ` · ${slot.precio} €`}
        </div>
      </div>

      {/* Instructora */}
      {slot.instructorNombre && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
          <RoundPhoto nombre={slot.instructorNombre} color={slot.instructorColor} fotoUrl={slot.instructorFotoUrl} size={32} />
          <span style={{ fontSize: 12, fontWeight: 500, color: t.ink, whiteSpace: 'nowrap' }}>{slot.instructorNombre}</span>
        </div>
      )}

      {/* Plazas libres. `etiquetaOcupacion` ya existía (lib/ocupacion.ts, misma
          semántica de color que `capColor`) sin ningún caller aquí — el color
          ya avisaba de "casi lleno", pero sin texto alguien mirando rápido en
          móvil no lo lee como urgencia. */}
      <div style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 500, color: lleno ? t.muted : capColor, whiteSpace: 'nowrap' }}>
        {lleno ? 'completa' : ratio >= 0.85 ? `¡${etiquetaOcupacion(ratio).toLowerCase()}!` : `${libres} ${libres === 1 ? 'libre' : 'libres'}`}
      </div>

      {/* CTA visual (decorativo: toda la fila es el control clicable) */}
      <span aria-hidden="true" style={{
        flex: '0 0 auto', height: 44, padding: '0 22px', borderRadius: radius.pillBtnSm - 2,
        display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
        ...(slot.miEstado === 'CONFIRMADA'
          ? { border: `1px solid ${t.line}`, color: t.ink }
          : lleno
            ? { border: `1px solid ${t.line}`, color: t.ink }
            : { background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)' }),
      }}>
        {slot.miEstado === 'CONFIRMADA' ? 'Ver reserva' : slot.miEstado === 'LISTA_ESPERA' ? 'En espera' : lleno ? 'Lista de espera' : 'Reservar'}
      </span>
    </button>
  );
}

// ── Hoja inferior (bottom sheet) ─────────────────────────────────────────────

function BookingSheet({
  t, slot, selectedSpot, onSelectSpot, resultado, errorReserva, enviando, cancelacionVentanaHoras, ventanaPorTipo,
  fontFamily, onClose, onReservar, onCancelar, onAceptarOferta,
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
      : (slot.precio != null ? `Reservar · ${slot.precio} €` : 'Reservar');

  const esCancelar = tieneReserva;

  // Fase 5 (Booking Engine): oferta de plaza liberada, con plazo. `onAceptarOferta`
  // ausente (Modo B sin endpoint público wireado todavía) cae al aviso pasivo.
  const hayOferta = enEspera && !!slot.miOfertaExpiraEn && !!onAceptarOferta;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
        // Abajo en móvil (hoja), centrado en pantallas grandes (diálogo).
        alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', fontFamily,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
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
        // (solo `animate-spin`, resuelto a mano en widget.css). Una clase nueva
        // habría que duplicarla ahí, y el widget incrustado se vería distinto
        // del alojado en cuanto una de las dos se quedara atrás.
        style={{
          width: '100%', maxWidth: 560, background: t.bg, borderRadius: '24px 24px 0 0',
          padding: `10px 20px ${sheetBottomPadding}`, display: 'flex', flexDirection: 'column', gap: 14,
          maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 999, background: t.line, margin: '6px auto 4px', flexShrink: 0 }} />

        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ ...nivelBadge(slot.nivel), marginBottom: 8 }}>{NIVEL_LABEL[slot.nivel]}</span>
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
            valor={lleno ? `Completa (${slot.aforoMaximo}/${slot.aforoMaximo})` : `${slot.ocupadas}/${slot.aforoMaximo} · ${libres} ${libres === 1 ? 'libre' : 'libres'}`}
            valorColor={lleno ? semantic.danger.text : (libres <= 2 ? semantic.warning.text : t.ink)}
          />
          {slot.instructorNombre && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <RoundPhoto nombre={slot.instructorNombre} color={slot.instructorColor} fotoUrl={slot.instructorFotoUrl} size={34} ring={t.surface2} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: t.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.instructorNombre}</p>
                <p style={{ fontSize: 11.5, color: t.muted }}>
                  {slot.instructorOriginalNombre
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
        {!tieneReserva && !lleno && slot.coberturaTexto && (
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
          style={{
            width: '100%', height: 52, borderRadius: 14, fontSize: 14.5, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.02em', border: 'none',
            cursor: resultado === 'CANCELADA' || enviando ? 'default' : 'pointer',
            marginTop: 2, opacity: resultado === 'CANCELADA' ? 0.4 : enviando ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
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
    ? <CheckCircle size={14} style={{ color: semantic.success.text, flexShrink: 0 }} />
    : <AlertCircle size={14} style={{ color: semantic.warning.text, flexShrink: 0 }} />;
}

function Banner({ tipo, texto }: { tipo: 'ok' | 'warn'; texto: string }) {
  const c = tipo === 'ok' ? semantic.success : semantic.warning;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 14, padding: '11px 14px', background: c.soft }}>
      {tipo === 'ok'
        ? <CheckCircle size={15} style={{ color: c.text, flexShrink: 0 }} />
        : <AlertCircle size={15} style={{ color: c.text, flexShrink: 0 }} />}
      <p style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{texto}</p>
    </div>
  );
}

function EstadoVacio({ t, titulo, cuerpo }: { t: ModoTokens; titulo: string; cuerpo: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '28px 16px', gap: 8, borderRadius: 18, background: t.surface, border: `1px solid ${t.line}` }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.surface2, color: t.ink }}>
        <Clock size={18} />
      </div>
      <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{titulo}</p>
      <p style={{ fontSize: 12.5, color: t.muted, maxWidth: 240 }}>{cuerpo}</p>
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
