'use client';

// Fase 4 (Booking Engine — Mi Cuenta): lista de reservas propias, compartida
// entre Modo A y Modo B — ver docs/account-widget-diseno.md §2. Recibe
// arrays crudos y resuelve la sesión de cada reserva internamente (mismo
// patrón que `sesionesRich` en app/reservar/[slug]/page.tsx, pero acotado a
// las sesiones que de verdad hacen falta aquí).
import { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Reserva, Sesion, TipoClase, Sala, Instructor, EstadoReserva } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { esCancelacionTardia } from '@/lib/booking-logic';
import { semantic } from '@/lib/portal-tokens';
import { sans, radius } from '@/lib/reservar-publico-tokens';

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtFecha(iso: string): string {
  const s = new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ETIQUETA: Record<EstadoReserva | 'FINALIZADA', string> = {
  CONFIRMADA: 'Confirmada', LISTA_ESPERA: 'En espera', ASISTIDA: 'Asistida',
  CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistió', PENDIENTE_APROBACION: 'Pendiente',
  FINALIZADA: 'Finalizada',
};

export function MisReservasLista({
  t, reservas, sesiones, tiposClase, salas, instructores, cancelacionVentanaHoras, ventanaPorTipo,
  onCancelar, onAceptarOferta,
}: {
  t: ModoTokens;
  reservas: Reserva[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  cancelacionVentanaHoras?: number;
  ventanaPorTipo?: Record<string, number>;
  onCancelar: (reservaId: string) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  onAceptarOferta?: (reservaId: string) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
}) {
  const [filtro, setFiltro] = useState<'proximas' | 'pasadas'>('proximas');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [errorPorId, setErrorPorId] = useState<Record<string, string>>({});

  // `Date.now()` es impuro — no puede llamarse dentro de un `useMemo` (regla
  // de pureza de React Compiler). Mismo patrón que `nowMs` en
  // lib/widget/usar-datos-widget.ts: placeholder fijo al render inicial,
  // valor real fijado en un efecto tras montar.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: Date.now() no puede llamarse en render.
    setNowMs(Date.now());
  }, []);

  const filas = useMemo(() => {
    const sesById = new Map(sesiones.map(s => [s.id, s]));
    const tipoById = new Map(tiposClase.map(c => [c.id, c]));
    const salaById = new Map(salas.map(s => [s.id, s]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    const now = nowMs;
    return reservas
      .map(r => {
        const sesion = sesById.get(r.sesionId);
        if (!sesion) return null;
        const pasada = new Date(sesion.fin).getTime() < now;
        return {
          reserva: r, sesion,
          tipoNombre: tipoById.get(sesion.tipoClaseId)?.nombre ?? 'Clase',
          salaNombre: salaById.get(sesion.salaId)?.nombre ?? null,
          instructorNombre: instrById.get(sesion.instructorId)?.nombre ?? null,
          pasada,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => filtro === 'proximas'
        ? a.sesion.inicio.localeCompare(b.sesion.inicio)
        : b.sesion.inicio.localeCompare(a.sesion.inicio));
  }, [reservas, sesiones, tiposClase, salas, instructores, filtro, nowMs]);

  const visibles = filas.filter(f => filtro === 'proximas'
    ? !f.pasada && f.reserva.estado !== 'CANCELADA'
    : f.pasada || f.reserva.estado === 'CANCELADA');

  async function cancelar(reservaId: string) {
    if (enviando) return;
    setEnviando(reservaId);
    setErrorPorId(e => ({ ...e, [reservaId]: '' }));
    const r = await onCancelar(reservaId);
    setEnviando(null);
    if (r && !r.ok) setErrorPorId(e => ({ ...e, [reservaId]: r.error }));
  }

  async function aceptarOferta(reservaId: string) {
    if (enviando || !onAceptarOferta) return;
    setEnviando(reservaId);
    setErrorPorId(e => ({ ...e, [reservaId]: '' }));
    const r = await onAceptarOferta(reservaId);
    setEnviando(null);
    if (r && !r.ok) setErrorPorId(e => ({ ...e, [reservaId]: r.error }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: sans }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['proximas', 'pasadas'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFiltro(f)} style={{
            fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: radius.pill, border: `1px solid ${t.line}`,
            background: filtro === f ? 'var(--portal-brand)' : t.surface, color: filtro === f ? 'var(--portal-brand-foreground)' : t.ink,
            cursor: 'pointer',
          }}>
            {f === 'proximas' ? 'Próximas' : 'Historial'}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: t.muted, fontSize: 13 }}>
          {filtro === 'proximas' ? 'No tienes reservas próximas.' : 'Sin reservas pasadas todavía.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibles.map(({ reserva: r, sesion: s, tipoNombre, salaNombre, instructorNombre, pasada }) => {
            const futuraConfirmada = !pasada && r.estado === 'CONFIRMADA';
            const tardia = futuraConfirmada && esCancelacionTardia(
              s.inicio, new Date(nowMs),
              (s.tipoClaseId && ventanaPorTipo?.[s.tipoClaseId] != null) ? ventanaPorTipo[s.tipoClaseId] : (cancelacionVentanaHoras ?? 0),
            );
            const hayOferta = r.estado === 'LISTA_ESPERA' && !!r.ofertaExpiraEn && !!onAceptarOferta;
            return (
              <div key={r.id} style={{ border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 14, background: t.surface, opacity: pasada ? 0.75 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, lineHeight: 1.15 }}>{tipoNombre}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: 11.5, color: t.muted }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} />{fmtFecha(s.inicio)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} />{fmtHora(s.inicio)}</span>
                      {salaNombre && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} />{salaNombre}</span>}
                    </div>
                    {instructorNombre && <p style={{ fontSize: 11, color: t.muted2, marginTop: 4 }}>{instructorNombre}</p>}
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: radius.pill,
                    background: r.estado === 'ASISTIDA' ? semantic.success.soft : r.estado === 'LISTA_ESPERA' ? semantic.warning.soft : (pasada ? t.surface2 : 'var(--portal-velo-fuerte)'),
                    color: r.estado === 'ASISTIDA' ? semantic.success.text : r.estado === 'LISTA_ESPERA' ? semantic.warning.text : (pasada ? t.muted : 'var(--portal-brand)'),
                  }}>
                    {pasada && r.estado === 'CONFIRMADA' ? ETIQUETA.FINALIZADA : ETIQUETA[r.estado]}
                  </span>
                </div>

                {hayOferta && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: radius.cardSmall, background: semantic.warning.soft }}>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: t.ink, marginBottom: 8 }}>
                      ¡Se ha liberado una plaza! Tienes hasta las {fmtHora(r.ofertaExpiraEn!)} para aceptarla.
                    </p>
                    <button type="button" disabled={enviando === r.id} onClick={() => aceptarOferta(r.id)} style={{
                      width: '100%', height: 38, borderRadius: radius.pillBtnXs, border: 'none', fontSize: 12.5, fontWeight: 800,
                      background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                      cursor: enviando === r.id ? 'default' : 'pointer', opacity: enviando === r.id ? 0.6 : 1,
                    }}>
                      {enviando === r.id ? 'Aceptando…' : 'Aceptar plaza'}
                    </button>
                  </div>
                )}

                {errorPorId[r.id] && <p style={{ fontSize: 11.5, color: semantic.warning.text, marginTop: 8 }}>{errorPorId[r.id]}</p>}

                {(futuraConfirmada || (r.estado === 'LISTA_ESPERA' && !pasada)) && (
                  <div style={{ marginTop: 10 }}>
                    {tardia && <p style={{ fontSize: 10.5, color: t.muted, marginBottom: 6 }}>Cancelar ahora puede contar como cancelación tardía.</p>}
                    <button type="button" disabled={enviando === r.id} onClick={() => cancelar(r.id)} style={{
                      fontSize: 11.5, fontWeight: 700, color: semantic.warning.text, background: 'none', border: 'none',
                      padding: 0, cursor: enviando === r.id ? 'default' : 'pointer',
                    }}>
                      {enviando === r.id ? 'Cancelando…' : (r.estado === 'LISTA_ESPERA' ? 'Salir de la lista de espera' : 'Cancelar reserva')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
