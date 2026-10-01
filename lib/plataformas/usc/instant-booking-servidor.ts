// El Instant Booking de Urban Sports Club, contra la base de datos.
//
// ⚠️ Módulo LIGERO a propósito: USC espera la respuesta en 500-1000 ms y no
// reintenta. Nada de importar `supabase-data-admin` (arrastra medio servidor al
// arrancar en frío): solo el cliente admin, el mapa de eventos y la RPC.
//
// La plaza la decide `reservar_plaza_externa` con `p_exigir_cupo = true`: aquí
// la plataforma reserva sola, así que las plazas que el estudio le cede son un
// límite de verdad (en el modo manual solo se avisa). Mismo candado de sesión y
// mismo recuento de aforo que una reserva de socia.
import type { SupabaseClient } from '@supabase/supabase-js';
import { motivoDeErrorRpcUsc, type PeticionReservaUsc, type RechazoReservaExterna } from '../usc-reserva.ts';

export type ResultadoInstantBooking =
  | { ok: true; studioId: string; sesionId: string; reservaId: string; repetida: boolean }
  | { ok: false; motivo: RechazoReservaExterna; detalle?: string };

export async function procesarInstantBookingUsc(admin: SupabaseClient, p: PeticionReservaUsc): Promise<ResultadoInstantBooking> {
  const { data: evento, error: errEvento } = await admin
    .from('plataforma_eventos')
    .select('studio_id, sesion_id, estado_sync')
    .eq('plataforma', 'URBAN_SPORTS_CLUB')
    .eq('evento_externo_id', p.eventoExternoId)
    .maybeSingle();
  if (errEvento) return { ok: false, motivo: 'error-interno', detalle: errEvento.message };
  if (!evento) return { ok: false, motivo: 'clase-no-existe' };
  if (evento.estado_sync === 'CANCELADO') return { ok: false, motivo: 'clase-cancelada' };

  // El estudio tiene que seguir vendiendo en USC: si lo ha apagado, sus eventos
  // ya no admiten reservas aunque USC no se haya enterado todavía.
  const { data: integracion } = await admin
    .from('integraciones').select('activo')
    .eq('studio_id', evento.studio_id).eq('tipo', 'URBAN_SPORTS_CLUB').maybeSingle();
  if (!integracion?.activo) return { ok: false, motivo: 'clase-no-existe' };

  // Id determinista por reserva de USC: si este mismo intento llegara dos
  // veces, la RPC lo reconoce también por el id externo.
  const reservaId = `res-usc-${p.reservaExternaId}`;
  const nombre = `${p.nombre} ${p.apellidos}`.trim();
  const { data, error } = await admin.rpc('reservar_plaza_externa', {
    p_studio_id: evento.studio_id,
    p_sesion_id: evento.sesion_id,
    p_reserva_id: reservaId,
    p_origen: 'URBAN_SPORTS_CLUB',
    p_nombre: nombre,
    p_id_reserva_externa: p.reservaExternaId,
    p_id_cliente_externo: p.clienteExternoId,
    p_exigir_cupo: true,
  });
  if (error) return { ok: false, motivo: motivoDeErrorRpcUsc(error.message), detalle: error.message };
  const fila = (Array.isArray(data) ? data[0] : data) as { reserva_id?: string; repetida?: boolean } | null;
  return {
    ok: true,
    studioId: evento.studio_id as string,
    sesionId: evento.sesion_id as string,
    reservaId: fila?.reserva_id ?? reservaId,
    repetida: fila?.repetida === true,
  };
}
