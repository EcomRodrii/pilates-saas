'use client';

// «Calendario semanal» (`?presentacion=semana`): la semana entera de un vistazo,
// días de lunes a domingo en columnas y horas en filas. Es una PRESENTACIÓN más
// del mismo horario, no otro flujo: recibe las mismas clases que ya pinta la
// lista (futuras, sin canceladas, con los filtros aplicados) y pulsar una clase
// hace lo mismo que pulsar su tarjeta — la página decide qué (`onElegir`).
//
// Qué va dónde lo decide `lib/reservar/horario-semana.ts` (puro y probado): el
// día y la hora de cada clase son los del ESTUDIO, nunca los del navegador.
//
// En el móvil no cabe una semana: la rejilla se desliza en horizontal con la
// columna de horas pegada a la izquierda, y al abrir se coloca en hoy.

import { useEffect, useRef, type CSSProperties } from 'react';
import { AlertCircle, CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReservaSlot } from '@/components/reserva/reserva-calendario';
import { semantic } from '@/lib/portal-tokens';
import { serif, sans, mono, cq } from '@/lib/reservar-publico-tokens';
import {
  rejillaSemana, semanaInicial, navegacionSemana, etiquetaRangoSemana, cabeceraDia, etiquetaHora,
  horaDe, empiezaEnPunto, plazasDeClase, nombreAccesibleClase, recuentoClases, type TonoPlazas,
} from '@/lib/reservar/horario-semana';

/** Un chip de filtro de la fila de arriba: la misma forma que ya usa la lista. */
export interface FiltroChip {
  id: string;
  label: string;
  activo: boolean;
  onClick: () => void;
  grupo?: 'tipo' | 'instructora';
}

interface Props {
  slots: readonly ReservaSlot[];
  /** Hoy, 'YYYY-MM-DD' del estudio. */
  hoy: string;
  /**
   * Lunes de la semana a la vista, o `null` para la de siempre (la de hoy, o la
   * de la próxima clase). Lo guarda la página y no este componente: al volver
   * de la ficha o del pago, la visitante sigue en la semana donde estaba.
   */
  lunes: string | null;
  onCambiarSemana: (lunes: string) => void;
  onElegir: (slot: ReservaSlot) => void;
  filtros?: readonly FiltroChip[];
  cargando?: boolean;
  error?: { onReintentar: () => void };
  /** Lo que se dice cuando no hay NINGUNA clase (los textos del estudio). */
  vacio: { titulo: string; cuerpo: string };
}

const ANCHO_HORAS = 52;
const ANCHO_MIN_DIA = 88;
const marca = 'var(--portal-brand)';

const COLOR_PLAZAS: Record<TonoPlazas, string> = {
  libre: 'var(--portal-muted)',
  // Tinta y no el naranja de aviso: sobre el tinte de cada clase (y en modo
  // noche) el naranja no llega al contraste de un texto de 11 px. El peso ya
  // lo distingue de «N libres».
  ultimas: 'var(--portal-ink)',
  completa: 'var(--portal-muted)',
  mia: 'var(--portal-ink)',
};

const botonRedondo: CSSProperties = {
  width: 44, height: 44, flex: '0 0 auto', borderRadius: 999, display: 'grid', placeItems: 'center',
  border: '1px solid var(--portal-line)', background: 'var(--portal-surface)', color: 'var(--portal-ink)',
  cursor: 'pointer', padding: 0,
};

const tarjeta: CSSProperties = {
  borderRadius: 20, border: '1px solid var(--portal-line)', background: 'var(--portal-surface)', overflow: 'hidden',
};

export function HorarioSemana({ slots, hoy, lunes, onCambiarSemana, onElegir, filtros, cargando = false, error, vacio }: Props) {
  const lunesVisible = lunes ?? semanaInicial(slots, hoy);
  const rejilla = rejillaSemana(slots, lunesVisible, hoy);
  // Sin datos todavía (o sin poder cargarlos) no hay semana a la que ir.
  const nav = cargando || error
    ? { anterior: null, siguiente: null, proximaConClases: null }
    : navegacionSemana(lunesVisible, hoy, slots);
  const rango = etiquetaRangoSemana(lunesVisible);
  const hoyEnSemana = rejilla.dias.some(d => d.hoy);
  const hayClases = rejilla.total > 0;
  const proxima = nav.proximaConClases;

  // En una pantalla estrecha, que la semana abra en HOY y no en un lunes que ya
  // pasó (y que por eso está vacío). DOM puro, sin estado: nada que re-pintar.
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoyRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    const caja = scrollRef.current;
    if (!caja || caja.scrollWidth <= caja.clientWidth) return;
    caja.scrollLeft = hoyEnSemana && hoyRef.current ? Math.max(0, hoyRef.current.offsetLeft - ANCHO_HORAS) : 0;
  }, [lunesVisible, hoyEnSemana, hayClases, cargando]);

  const deTipo = (filtros ?? []).filter(c => c.grupo !== 'instructora');
  const deInstructora = (filtros ?? []).filter(c => c.grupo === 'instructora');

  return (
    <section aria-label="Calendario semanal" style={{ fontFamily: sans }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        {/* Se anuncia al cambiar de semana: con las flechas, quien no ve la
            rejilla sabe a qué semana ha llegado y cuántas clases tiene. */}
        <div aria-live="polite" aria-atomic="true" style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: mono, fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--portal-muted)' }}>
            {cargando || error ? 'Semana' : recuentoClases(rejilla.total)}
          </p>
          {/* Mientras carga no se sabe aún con qué semana abre (la de la
              próxima clase, si esta ya no tiene): mejor un hueco que un rango
              que salta en cuanto llegan las clases. */}
          <p style={{ margin: '4px 0 0', minHeight: '1.15em', fontFamily: serif, fontSize: cq(17, 2.2, 22), fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.15, color: 'var(--portal-ink)' }}>
            {cargando ? '' : rango}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
          <button
            type="button"
            className="reserva-semana-foco"
            aria-label="Semana anterior"
            disabled={!nav.anterior}
            onClick={() => nav.anterior && onCambiarSemana(nav.anterior)}
            style={{ ...botonRedondo, opacity: nav.anterior ? 1 : 0.4, cursor: nav.anterior ? 'pointer' : 'default' }}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="reserva-semana-foco"
            aria-label="Semana siguiente"
            disabled={!nav.siguiente}
            onClick={() => nav.siguiente && onCambiarSemana(nav.siguiente)}
            style={{ ...botonRedondo, opacity: nav.siguiente ? 1 : 0.4, cursor: nav.siguiente ? 'pointer' : 'default' }}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>

      {deTipo.length + deInstructora.length > 1 && (
        // Fila única con scroll, como la de la lista: con muchos tipos e
        // instructoras, envolver empujaría la semana varias líneas abajo.
        <div className="reserva-tabs-scroll" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
          <div role="group" aria-label="Filtrar por tipo de clase" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {deTipo.map(c => <ChipFiltro key={c.id} chip={c} />)}
          </div>
          {deInstructora.length > 0 && (
            <>
              <span aria-hidden style={{ width: 1, alignSelf: 'stretch', margin: '6px 4px', background: 'var(--portal-line)', flexShrink: 0 }} />
              <div role="group" aria-label="Filtrar por instructora" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {deInstructora.map(c => <ChipFiltro key={c.id} chip={c} />)}
              </div>
            </>
          )}
        </div>
      )}

      {cargando ? (
        <Esqueleto />
      ) : error ? (
        <div role="alert" style={{ ...tarjeta, textAlign: 'center', padding: '44px 24px 48px' }}>
          <span aria-hidden style={{ width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'grid', placeItems: 'center', background: semantic.danger.soft, color: semantic.danger.text }}>
            <AlertCircle size={22} />
          </span>
          <p style={{ fontFamily: serif, fontSize: 20, fontWeight: 800, margin: '16px 0 0', color: 'var(--portal-ink)' }}>No hemos podido cargar el horario</p>
          <p style={{ fontSize: 13, color: 'var(--portal-muted)', margin: '6px auto 0', maxWidth: 300 }}>
            Parece un problema de conexión. Inténtalo de nuevo en unos segundos.
          </p>
          <button type="button" className="reserva-semana-foco" onClick={error.onReintentar} style={{
            marginTop: 18, minHeight: 44, padding: '0 22px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: marca, color: 'var(--portal-brand-foreground)', fontFamily: sans, fontWeight: 700, fontSize: 13.5,
          }}>
            Reintentar
          </button>
        </div>
      ) : !hayClases ? (
        // Sin `role="status"`: la cabecera de arriba ya anuncia «0 clases» y la
        // semana; repetirlo aquí lo diría dos veces.
        <div style={{ ...tarjeta, textAlign: 'center', padding: '44px 24px 48px' }}>
          <span aria-hidden style={{ width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'grid', placeItems: 'center', background: 'var(--portal-surface-2)', color: 'var(--portal-muted)' }}>
            <CalendarX2 size={22} />
          </span>
          {/* Sin ninguna clase, los textos del estudio. Con clases en otra
              semana, decirlo así: «Sin clases disponibles» sería mentira. */}
          <p style={{ fontFamily: serif, fontSize: 20, fontWeight: 800, margin: '16px 0 0', color: 'var(--portal-ink)' }}>
            {slots.length === 0 ? vacio.titulo : 'Sin clases esta semana'}
          </p>
          {proxima ? (
            <button type="button" className="reserva-semana-foco" onClick={() => onCambiarSemana(proxima)} style={{
              marginTop: 18, minHeight: 44, padding: '0 22px', borderRadius: 999, cursor: 'pointer', background: 'transparent',
              border: `1px solid color-mix(in srgb, ${marca} 45%, transparent)`, color: 'var(--portal-ink)',
              fontFamily: sans, fontWeight: 700, fontSize: 13.5,
            }}>
              Ir a la próxima semana con clases
            </button>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--portal-muted)', margin: '6px auto 0', maxWidth: 320 }}>
              {slots.length === 0 ? vacio.cuerpo : 'Prueba con otra semana o cambia el filtro.'}
            </p>
          )}
        </div>
      ) : (
        <div key={lunesVisible} className="reserva-banner-in" style={tarjeta}>
          <div ref={scrollRef} style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
            <table style={{
              width: '100%', minWidth: ANCHO_HORAS + 7 * ANCHO_MIN_DIA, tableLayout: 'fixed',
              borderCollapse: 'separate', borderSpacing: 0,
            }}>
              <caption className="sr-only">Clases de la semana: {rango}</caption>
              <colgroup>
                <col style={{ width: ANCHO_HORAS }} />
                {rejilla.dias.map(d => <col key={d.fecha} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={{ ...celdaHora, borderTop: 'none', paddingTop: 12 }}>
                    <span className="sr-only">Hora</span>
                  </th>
                  {rejilla.dias.map(d => {
                    const c = cabeceraDia(d.fecha);
                    return (
                      <th
                        key={d.fecha}
                        ref={d.hoy ? hoyRef : undefined}
                        scope="col"
                        style={{
                          padding: '10px 4px 8px', textAlign: 'center', fontWeight: 'inherit',
                          background: d.hoy ? `color-mix(in srgb, ${marca} 6%, var(--portal-surface))` : undefined,
                        }}
                      >
                        <span className="sr-only">{c.larga}{d.hoy ? ', hoy' : ''}</span>
                        <span aria-hidden style={{
                          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                          minWidth: 48, padding: '6px 8px', borderRadius: 14,
                          background: d.hoy ? marca : 'transparent',
                          color: d.hoy ? 'var(--portal-brand-foreground)' : 'var(--portal-ink)',
                          opacity: d.pasado ? 0.45 : 1,
                        }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                            {d.hoy ? 'Hoy' : c.corta}
                          </span>
                          <span style={{ fontFamily: serif, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{c.numero}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rejilla.franjas.map(f => (
                  <tr key={f.hora}>
                    <th scope="row" style={{
                      ...celdaHora,
                      // El salto de horas (mañana → tarde) se ve: dos filas
                      // pegadas se leerían como consecutivas.
                      borderTop: f.saltoAntes ? '1px dashed var(--portal-line)' : celdaHora.borderTop,
                      paddingTop: f.saltoAntes ? 16 : 10,
                    }}>
                      {etiquetaHora(f.hora)}
                    </th>
                    {f.celdas.map((celda, i) => {
                      const dia = rejilla.dias[i];
                      return (
                        <td key={dia.fecha} style={{
                          verticalAlign: 'top', padding: f.saltoAntes ? '10px 3px 4px' : '4px 3px',
                          borderTop: f.saltoAntes ? '1px dashed var(--portal-line)' : '1px solid var(--portal-line)',
                          background: dia.hoy ? `color-mix(in srgb, ${marca} 6%, var(--portal-surface))` : undefined,
                        }}>
                          {celda.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {celda.map(slot => <ChipClase key={slot.id} slot={slot} onElegir={onElegir} />)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// La columna de horas se queda pegada al deslizar la semana en el móvil: sin
// ella, a partir del miércoles no se sabe de qué hora es cada fila.
const celdaHora: CSSProperties = {
  position: 'sticky', left: 0, zIndex: 1, background: 'var(--portal-surface)',
  verticalAlign: 'top', textAlign: 'left', padding: '10px 6px 4px 12px',
  borderTop: '1px solid var(--portal-line)',
  fontFamily: sans, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--portal-muted)',
};

function ChipClase({ slot, onElegir }: { slot: ReservaSlot; onElegir: (slot: ReservaSlot) => void }) {
  const plazas = plazasDeClase(slot);
  const completa = plazas.tono === 'completa';
  const mia = plazas.tono === 'mia';
  const color = slot.claseColor || marca;
  const detalle = empiezaEnPunto(slot.inicio) ? plazas.texto : `${horaDe(slot.inicio)} · ${plazas.texto}`;
  return (
    <button
      type="button"
      className="reserva-semana-chip reserva-semana-foco"
      onClick={() => onElegir(slot)}
      aria-label={nombreAccesibleClase(slot.claseNombre, slot.inicio, plazas.texto)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2,
        width: '100%', minHeight: 44, padding: '6px 7px 6px 9px', borderRadius: 10, border: 0,
        // La franja de la izquierda es el color del tipo de clase (paleta
        // categórica del estudio); el fondo, ese mismo color muy rebajado sobre
        // la superficie, para que la tinta se lea en día y en noche.
        boxShadow: `inset 3px 0 0 ${color}${mia ? `, inset 0 0 0 1.5px ${marca}` : ''}`,
        background: completa
          ? 'var(--portal-surface-2)'
          : `color-mix(in srgb, ${color} 14%, var(--portal-surface))`,
        color: completa ? 'var(--portal-muted)' : 'var(--portal-ink)',
        textAlign: 'left', cursor: 'pointer', fontFamily: sans,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      <span style={{
        fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-word',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {slot.claseNombre}
      </span>
      {/* Solo si cabe: en una columna muy estrecha se queda el nombre (el
          nombre accesible sigue diciendo las plazas). */}
      <span className="reserva-semana-plazas" style={{
        fontSize: 11, fontWeight: plazas.tono === 'libre' || completa ? 500 : 700, lineHeight: 1.2,
        color: COLOR_PLAZAS[plazas.tono], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}>
        {detalle}
      </span>
    </button>
  );
}

function ChipFiltro({ chip }: { chip: FiltroChip }) {
  return (
    <button
      type="button"
      className="reserva-semana-foco"
      onClick={chip.onClick}
      aria-pressed={chip.activo}
      style={{
        minHeight: 44, padding: '0 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
        fontFamily: sans, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        // Sólido con el color de marca, como en la lista: el `marca=` del
        // snippet tiene que verse tal cual, sin mezclar.
        border: `1px solid ${chip.activo ? marca : 'var(--portal-line)'}`,
        background: chip.activo ? marca : 'var(--portal-surface)',
        color: chip.activo ? 'var(--portal-brand-foreground)' : 'var(--portal-muted)',
      }}
    >
      {chip.label}
    </button>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" style={{ ...tarjeta, padding: 12 }}>
      <span className="sr-only">Cargando el horario…</span>
      <div aria-hidden className="animate-pulse" style={{ display: 'grid', gridTemplateColumns: `${ANCHO_HORAS - 12}px repeat(7, minmax(0, 1fr))`, gap: 6 }}>
        {Array.from({ length: 4 * 8 }, (_, i) => (
          <div key={i} style={{
            height: i < 8 ? 34 : 44, borderRadius: 10,
            background: i % 8 === 0 ? 'transparent' : 'var(--portal-surface-2)',
            opacity: (i * 7) % 3 === 0 ? 0.55 : 1,
          }} />
        ))}
      </div>
    </div>
  );
}
