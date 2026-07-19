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
  CheckCircle, AlertCircle, CalendarDays,
} from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { NivelClase, EstadoReserva, Spot } from '@/lib/types';
import { radius, semantic, sheetBottomPadding } from '@/lib/portal-tokens';
import { colorOcupacion, ratioOcupacion } from '@/lib/ocupacion';
import {
  localDayKey, addDays, diasSemana, contarSlotsPorDia, slotsDelDia,
  agruparPorDia, etiquetaDia,
} from '@/lib/reserva-calendario-logic';

const FUENTE = "'Plus Jakarta Sans', sans-serif";

const NIVEL_LABEL: Record<NivelClase, string> = {
  TODOS: 'Todos los niveles', PRINCIPIANTE: 'Iniciación', MEDIO: 'Intermedio', AVANZADO: 'Avanzado',
};
const NIVEL_COLOR: Record<NivelClase, string> = {
  TODOS: '#8E8E93', PRINCIPIANTE: '#059669', MEDIO: '#D97706', AVANZADO: '#DC2626',
};
const DOW_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ── Vista-modelo de un slot reservable ──────────────────────────────────────
// La página lo construye desde los datos crudos de useStudio(); el componente
// no conoce Sesion/Reserva, solo esta forma normalizada (reutilizable).
export interface ReservaSlot {
  id: string;                 // id de sesión
  inicio: string;             // ISO
  fin: string;                // ISO
  claseNombre: string;
  claseColor: string;
  nivel: NivelClase;
  descripcion?: string | null;
  instructorNombre?: string | null;
  instructorColor?: string | null;
  instructorRol?: string | null;
  salaNombre?: string | null;
  aforoMaximo: number;
  ocupadas: number;
  spots: Spot[];              // reformers activos de la sala
  spotsOcupados: string[];    // ids de spot ya ocupados
  miReservaId: string | null; // reserva propia activa (si la hay)
  miEstado: 'CONFIRMADA' | 'LISTA_ESPERA' | null;
  precio?: number | null;     // se muestra en el CTA si no hay cobertura de plan
}

export interface ReservaCalendarioProps {
  /** Tema del portal (día/noche). Se pasa por prop para desacoplar de useModo. */
  t: ModoTokens;
  slots: ReservaSlot[];
  onReservar: (slot: ReservaSlot, spotId: string | null) => EstadoReserva | void;
  onCancelar: (reservaId: string) => void;
  /** 'calendario' (tira de semana) o 'lista' (agrupada por día, para Mis reservas). */
  variant?: 'calendario' | 'lista';
  /** Horas de antelación para cancelar sin penalización; muestra un aviso en la hoja. */
  cancelacionVentanaHoras?: number;
  /** Copys de estado vacío. */
  vacio?: { titulo: string; cuerpo: string };
  fontFamily?: string;
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtDiaLargo(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function ReservaCalendario({
  t, slots, onReservar, onCancelar,
  variant = 'calendario', cancelacionVentanaHoras, vacio, fontFamily = FUENTE,
}: ReservaCalendarioProps) {
  const hoy = useMemo(() => new Date(), []);
  const hoyKey = localDayKey(hoy);

  const [weekAnchor, setWeekAnchor] = useState<Date>(hoy);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(hoyKey);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  // Feedback tras una acción, para confirmar visualmente sin cerrar la hoja.
  const [resultado, setResultado] = useState<EstadoReserva | 'CANCELADA' | null>(null);

  const semana = useMemo(() => diasSemana(weekAnchor), [weekAnchor]);
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
  useEffect(() => {
    if (openSlotId && !openSlot) { setOpenSlotId(null); setSelectedSpot(null); setResultado(null); }
  }, [openSlotId, openSlot]);

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
      {variant === 'calendario' && (
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
          <div role="tablist" aria-label="Días de la semana" style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
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
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 0 6px', borderRadius: radius.card, cursor: 'pointer',
                    border: `1px solid ${isSel ? 'var(--portal-brand)' : t.line}`,
                    background: isSel ? 'var(--portal-brand)' : t.surface,
                    opacity: vacío && !isSel ? 0.55 : 1,
                    transition: 'transform .12s ease',
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    color: isSel ? 'var(--portal-brand-foreground)' : t.muted,
                  }}>
                    {DOW_CORTO[i]}
                  </span>
                  <span style={{
                    fontSize: 17, fontWeight: 800, lineHeight: 1,
                    color: isSel ? 'var(--portal-brand-foreground)' : (isToday ? 'var(--portal-brand)' : t.ink),
                  }}>
                    {d.getDate()}
                  </span>
                  {/* Punto/contador de clases */}
                  <span style={{
                    fontSize: 10, fontWeight: 800, minHeight: 14, lineHeight: '14px',
                    color: isSel ? 'var(--portal-brand-foreground)' : t.muted,
                  }}>
                    {vacío ? '·' : n}
                  </span>
                </button>
              );
            })}
          </div>

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
          cancelacionVentanaHoras={cancelacionVentanaHoras}
          fontFamily={fontFamily}
          onClose={cerrarHoja}
          onReservar={() => {
            const r = onReservar(openSlot, selectedSpot);
            if (r) setResultado(r);
          }}
          onCancelar={() => {
            if (openSlot.miReservaId) {
              onCancelar(openSlot.miReservaId);
              setResultado('CANCELADA');
            }
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

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${slot.claseNombre} a las ${fmtHora(slot.inicio)}${slot.instructorNombre ? `, con ${slot.instructorNombre}` : ''}, ${lleno ? 'completa' : `${libres} plazas`}`}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 14, width: '100%', textAlign: 'left',
        background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card,
        padding: 14, cursor: 'pointer',
      }}
    >
      {/* Franja de color de la clase + hora */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 62 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: t.ink, lineHeight: 1, letterSpacing: '-0.01em' }}>
          {fmtHora(slot.inicio)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.muted }}>{fmtHora(slot.fin)}</span>
      </div>

      <div style={{ width: 3, borderRadius: 999, background: slot.claseColor, alignSelf: 'stretch', flexShrink: 0 }} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: t.ink, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
            {slot.claseNombre}
          </p>
          {slot.miEstado && <EstadoIcono estado={slot.miEstado} />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={nivelBadge(slot.nivel)}>{NIVEL_LABEL[slot.nivel]}</span>
          {slot.instructorNombre && (
            <span style={{ fontSize: 12, fontWeight: 700, color: t.muted }}>{slot.instructorNombre}</span>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800,
            padding: '4px 10px', borderRadius: 999,
            background: `color-mix(in srgb, ${capColor} 14%, transparent)`, color: capColor,
          }}>
            <Users size={12} />
            {lleno ? 'Completa · lista de espera' : `${libres} ${libres === 1 ? 'plaza' : 'plazas'}`}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Hoja inferior (bottom sheet) ─────────────────────────────────────────────

function BookingSheet({
  t, slot, selectedSpot, onSelectSpot, resultado, cancelacionVentanaHoras,
  fontFamily, onClose, onReservar, onCancelar,
}: {
  t: ModoTokens;
  slot: ReservaSlot;
  selectedSpot: string | null;
  onSelectSpot: (id: string | null) => void;
  resultado: EstadoReserva | 'CANCELADA' | null;
  cancelacionVentanaHoras?: number;
  fontFamily: string;
  onClose: () => void;
  onReservar: () => void;
  onCancelar: () => void;
}) {
  const titleId = useId();
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)', fontFamily }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: t.bg, borderRadius: '24px 24px 0 0',
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
            valor={lleno ? 'Completa' : `${libres} ${libres === 1 ? 'libre' : 'libres'}`}
            valorColor={lleno ? semantic.danger.text : (libres <= 2 ? semantic.warning.text : t.ink)}
          />
          {slot.instructorNombre && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0, background: slot.instructorColor ?? 'var(--portal-brand)' }}>
                {slot.instructorNombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: t.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.instructorNombre}</p>
                <p style={{ fontSize: 11.5, color: t.muted }}>{slot.instructorRol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
              </div>
            </div>
          )}
        </div>

        {slot.descripcion && (
          <p style={{ fontSize: 13.5, color: t.muted2, lineHeight: 1.5 }}>{slot.descripcion}</p>
        )}

        {/* Selector de sitio */}
        {mostrarSpots && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 4 }}>
              Elige tu sitio <span style={{ color: t.muted, fontWeight: 600 }}>(opcional)</span>
            </p>
            <SpotPicker t={t} spots={slot.spots} ocupados={ocupados} selected={selectedSpot} onSelect={onSelectSpot} />
          </div>
        )}

        {/* Banner de resultado / estado actual */}
        {resultado === 'CONFIRMADA' && <Banner tipo="ok" texto="¡Reserva confirmada! Te esperamos en clase." />}
        {resultado === 'LISTA_ESPERA' && <Banner tipo="warn" texto="Estás en lista de espera. Te avisaremos si se libera una plaza." />}
        {resultado === 'CANCELADA' && <Banner tipo="warn" texto="Reserva cancelada." />}
        {!resultado && yaReservada && <Banner tipo="ok" texto="Ya tienes esta clase reservada." />}
        {!resultado && enEspera && <Banner tipo="warn" texto="Estás en lista de espera para esta clase." />}

        {cancelacionVentanaHoras != null && cancelacionVentanaHoras > 0 && !tieneReserva && !lleno && (
          <p style={{ fontSize: 12, color: t.muted }}>
            Cancela con al menos {cancelacionVentanaHoras}h de antelación para recuperar tu sesión.
          </p>
        )}

        {/* Acción principal */}
        <button
          type="button"
          onClick={esCancelar ? onCancelar : onReservar}
          disabled={resultado === 'CANCELADA'}
          style={{
            width: '100%', height: 52, borderRadius: 14, fontSize: 14.5, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.02em', border: 'none', cursor: 'pointer',
            marginTop: 2, opacity: resultado === 'CANCELADA' ? 0.4 : 1,
            ...(esCancelar
              ? { background: semantic.danger.soft, color: semantic.danger.text }
              : { background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)' }),
          }}
        >
          {resultado === 'CANCELADA' ? 'Cancelada' : label}
        </button>
      </div>
    </div>
  );
}

// ── Selector de sitio (grid por fila/columna, re-estilado para el portal) ─────

function SpotPicker({
  t, spots, ocupados, selected, onSelect,
}: {
  t: ModoTokens; spots: Spot[]; ocupados: Set<string>;
  selected: string | null; onSelect: (id: string | null) => void;
}) {
  const filas = useMemo(() => [...new Set(spots.map(s => s.fila))].sort((a, b) => a - b), [spots]);
  const columnas = useMemo(() => [...new Set(spots.map(s => s.columna))].sort((a, b) => a - b), [spots]);

  return (
    <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 14 }}>
      <div style={{ background: t.surface2, borderRadius: 10, padding: '5px 0', textAlign: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: t.muted, textTransform: 'uppercase', marginBottom: 10 }}>
        Frente · Instructor
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` }}>
        {filas.map(fila =>
          columnas.map(col => {
            const spot = spots.find(s => s.fila === fila && s.columna === col);
            if (!spot) return <div key={`${fila}-${col}`} />;
            const taken = ocupados.has(spot.id);
            const isSel = selected === spot.id;
            return (
              <button
                key={spot.id}
                type="button"
                disabled={taken}
                aria-pressed={isSel}
                aria-label={`Sitio ${spot.nombre}${taken ? ' (ocupado)' : ''}`}
                onClick={() => onSelect(isSel ? null : spot.id)}
                style={{
                  aspectRatio: '3 / 4', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, cursor: taken ? 'not-allowed' : 'pointer',
                  border: `2px solid ${isSel ? 'var(--portal-brand)' : taken ? 'transparent' : t.line}`,
                  background: isSel ? 'var(--portal-brand)' : taken ? t.surface2 : t.surface,
                  color: isSel ? 'var(--portal-brand-foreground)' : taken ? t.muted : t.ink,
                  opacity: taken ? 0.5 : 1,
                }}
              >
                {spot.nombre}
              </button>
            );
          }),
        )}
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
