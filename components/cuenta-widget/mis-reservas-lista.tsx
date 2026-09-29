'use client';

// Fase 4 (Booking Engine — Mi Cuenta): lista de reservas propias, compartida
// entre Modo A y Modo B — ver docs/account-widget-diseno.md §2. Recibe
// arrays crudos y resuelve la sesión de cada reserva internamente (mismo
// patrón que `sesionesRich` en app/reservar/[slug]/page.tsx, pero acotado a
// las sesiones que de verdad hacen falta aquí).
//
// F5 del rediseño de /reservar (29-sep-2026): las MISMAS tarjetas que «Mis
// reservas» de la página (./tarjeta-reserva.tsx), con lo que dice cada una
// decidido en un solo sitio (lib/reservar/mis-reservas.ts). Hoy solo la monta
// el widget nativo («Mi cuenta → Reservas»): en la página, «Mis reservas» es
// su propia hoja. Cancelar, salir de la lista y aceptar una plaza hacen
// exactamente lo de antes.
//
// La hora va en la del ESTUDIO (`cuandoCorto`), no en la del navegador: la
// web donde está pegado el widget la abre gente de viaje, y la clase de las
// 10:00 en Madrid no es a las 9:00 porque alguien la mire desde Canarias.
import { useEffect, useMemo, useState } from 'react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Reserva, Sesion, TipoClase, Sala, Instructor } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { esCancelacionTardia } from '@/lib/booking-logic';
import { cuandoCorto } from '@/lib/reservar/ficha-clase';
import { conQuienYDonde, estadoReservaSocia, momentoReserva } from '@/lib/reservar/mis-reservas';
import { hoyEnEstudio, horaEstudio } from '@/lib/utils';
import { semantic } from '@/lib/portal-tokens';
import { sans, textoSemantico } from '@/lib/reservar-publico-tokens';
import { Segmentado } from './segmentado';
import { BotonPildora, TarjetaReserva } from './tarjeta-reserva';

type Filtro = 'proximas' | 'pasadas';

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
  const [filtro, setFiltro] = useState<Filtro>('proximas');
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

  const hoy = hoyEnEstudio(new Date(nowMs));
  const rojo = textoSemantico('danger', t);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: sans }}>
      <Segmentado
        t={t}
        etiqueta="Próximas o historial"
        opciones={[{ id: 'proximas', label: 'Próximas' }, { id: 'pasadas', label: 'Historial' }]}
        valor={filtro}
        onCambiar={setFiltro}
      />

      {visibles.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '28px 16px', color: t.muted, fontSize: 13.5, fontWeight: 600,
          background: t.surface, border: `1px solid ${t.line}`, borderRadius: 'var(--reservar-radio-tarjeta, 20px)',
        }}>
          {filtro === 'proximas' ? 'No tienes reservas próximas.' : 'Sin reservas pasadas todavía.'}
        </div>
      ) : (
        // `role="list"`: sin viñetas, Safari le quita a una `ul` su semántica de lista.
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibles.map(({ reserva: r, sesion: s, tipoNombre, salaNombre, instructorNombre, pasada }, i) => {
            const futuraConfirmada = !pasada && r.estado === 'CONFIRMADA';
            const tardia = futuraConfirmada && esCancelacionTardia(
              s.inicio, new Date(nowMs),
              (s.tipoClaseId && ventanaPorTipo?.[s.tipoClaseId] != null) ? ventanaPorTipo[s.tipoClaseId] : (cancelacionVentanaHoras ?? 0),
            );
            const hayOferta = r.estado === 'LISTA_ESPERA' && !!r.ofertaExpiraEn && !!onAceptarOferta;
            const puedeSalir = futuraConfirmada || (r.estado === 'LISTA_ESPERA' && !pasada);
            const salir = puedeSalir ? (
              <BotonPildora t={t} tono="peligro" disabled={enviando === r.id} onClick={() => { void cancelar(r.id); }}>
                {enviando === r.id ? 'Cancelando…' : (r.estado === 'LISTA_ESPERA' ? 'Salir de la lista de espera' : 'Cancelar reserva')}
              </BotonPildora>
            ) : null;
            return (
              <li key={r.id}>
                <TarjetaReserva
                  t={t}
                  orden={i}
                  cuando={cuandoCorto(s.inicio, hoy)}
                  estado={estadoReservaSocia(r.estado, momentoReserva(s.inicio, s.fin, nowMs), r.posicionEspera)}
                  nombre={tipoNombre}
                  detalle={conQuienYDonde(instructorNombre, salaNombre)}
                  apagada={pasada}
                  // Con una plaza ofrecida, lo primero es aceptarla: salir de
                  // la lista va DESPUÉS de la oferta, no encima.
                  acciones={hayOferta ? undefined : salir ?? undefined}
                >
                  {puedeSalir && tardia && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, color: t.muted }}>
                      Cancelar ahora puede contar como cancelación tardía.
                    </p>
                  )}

                  {hayOferta && (
                    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 14, background: semantic.warning.soft }}>
                      <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, color: t.ink }}>
                        ¡Se ha liberado una plaza! Tienes hasta las {horaEstudio(r.ofertaExpiraEn!)} para aceptarla.
                      </p>
                      <button type="button" disabled={enviando === r.id} onClick={() => { void aceptarOferta(r.id); }} style={{
                        width: '100%', minHeight: 44, borderRadius: 'var(--reservar-radio-boton, 999px)', border: 'none',
                        fontFamily: sans, fontSize: 13, fontWeight: 800,
                        background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                        cursor: enviando === r.id ? 'default' : 'pointer', opacity: enviando === r.id ? 0.6 : 1,
                      }}>
                        {enviando === r.id ? 'Aceptando…' : 'Aceptar plaza'}
                      </button>
                    </div>
                  )}
                  {hayOferta && salir && <div style={{ marginTop: 4 }}>{salir}</div>}

                  {errorPorId[r.id] && (
                    <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, color: rojo }}>
                      {errorPorId[r.id]}
                    </p>
                  )}
                </TarjetaReserva>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
