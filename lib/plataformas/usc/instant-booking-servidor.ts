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
import {
  COLUMNAS_VENTA_EXTERNA, motivoSinVentaExterna, motivoSinVentaExternaDe, type FilaVentaExterna, type MotivoSinVentaExterna,
} from '../venta-externa.ts';
import { motivoDeErrorRpcUsc, type PeticionReservaUsc, type RechazoReservaExterna } from '../usc-reserva.ts';

export type ResultadoInstantBooking =
  | { ok: true; studioId: string; sesionId: string; reservaId: string; repetida: boolean }
  | { ok: false; motivo: RechazoReservaExterna; detalle?: string };

/**
 * El evento, su estudio y si la integración está activa, en UNA sola ida y
 * vuelta (`plataforma_eventos` → `studios` → `integraciones`, las dos por clave
 * ajena). Antes eran tres lecturas en dos oleadas: con 500-1000 ms de
 * presupuesto, cada viaje a la base de datos cuenta.
 */
export const SELECCION_EVENTO_USC =
  `studio_id, sesion_id, estado_sync, studios(${COLUMNAS_VENTA_EXTERNA}, integraciones(tipo, activo))`;

export interface EventoUscLeido {
  studio_id: string;
  sesion_id: string | null;
  estado_sync: string | null;
  estudio: FilaVentaExterna;
  integracionActiva: boolean;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Lee la fila de `SELECCION_EVENTO_USC`; `null` si no trae el estudio (quien llama cae a la lectura por separado). */
export function leerEventoUscEmbebido(fila: unknown): EventoUscLeido | null {
  if (!fila || typeof fila !== 'object') return null;
  const f = fila as Record<string, unknown>;
  const estudio = uno(f.studios as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!estudio || typeof f.studio_id !== 'string') return null;
  const integraciones = (Array.isArray(estudio.integraciones) ? estudio.integraciones : estudio.integraciones ? [estudio.integraciones] : []) as { tipo?: unknown; activo?: unknown }[];
  const { integraciones: _i, ...columnas } = estudio;
  return {
    studio_id: f.studio_id,
    sesion_id: typeof f.sesion_id === 'string' ? f.sesion_id : null,
    estado_sync: typeof f.estado_sync === 'string' ? f.estado_sync : null,
    estudio: columnas as unknown as FilaVentaExterna,
    // El filtro por tipo va en la consulta; aquí se vuelve a exigir por si no se aplicara.
    integracionActiva: integraciones.some(i => i.tipo === 'URBAN_SPORTS_CLUB' && i.activo === true),
  };
}

type Eleccion =
  | { ok: true; studioId: string; sesionId: string | null; estadoSync: string | null; activo: boolean; sinVenta: MotivoSinVentaExterna | null | 'error' }
  | { ok: false; motivo: RechazoReservaExterna; detalle?: string };

async function leerEventoYEstudio(admin: SupabaseClient, eventoExternoId: string): Promise<Eleccion> {
  const { data, error } = await admin
    .from('plataforma_eventos')
    .select(SELECCION_EVENTO_USC)
    .eq('plataforma', 'URBAN_SPORTS_CLUB')
    .eq('evento_externo_id', eventoExternoId)
    .eq('studios.integraciones.tipo', 'URBAN_SPORTS_CLUB')
    .maybeSingle();
  if (!error) {
    if (!data) return { ok: false, motivo: 'clase-no-existe' };
    const e = leerEventoUscEmbebido(data);
    if (e) {
      return {
        ok: true, studioId: e.studio_id, sesionId: e.sesion_id, estadoSync: e.estado_sync,
        activo: e.integracionActiva, sinVenta: motivoSinVentaExterna(e.estudio),
      };
    }
  } else if (!String(error.code ?? '').startsWith('PGRST')) {
    return { ok: false, motivo: 'error-interno', detalle: error.message };
  }
  // La relación no se pudo resolver (caché de esquema, cambio de claves): la
  // lectura de siempre, por separado. Más lenta, igual de correcta.
  const { data: evento, error: errEvento } = await admin
    .from('plataforma_eventos')
    .select('studio_id, sesion_id, estado_sync')
    .eq('plataforma', 'URBAN_SPORTS_CLUB')
    .eq('evento_externo_id', eventoExternoId)
    .maybeSingle();
  if (errEvento) return { ok: false, motivo: 'error-interno', detalle: errEvento.message };
  if (!evento) return { ok: false, motivo: 'clase-no-existe' };
  const [{ data: integracion }, sinVenta] = await Promise.all([
    admin.from('integraciones').select('activo')
      .eq('studio_id', evento.studio_id).eq('tipo', 'URBAN_SPORTS_CLUB').maybeSingle(),
    motivoSinVentaExternaDe(admin, evento.studio_id as string),
  ]);
  return {
    ok: true, studioId: evento.studio_id as string, sesionId: evento.sesion_id as string | null,
    estadoSync: evento.estado_sync as string | null, activo: integracion?.activo === true, sinVenta,
  };
}

export async function procesarInstantBookingUsc(admin: SupabaseClient, p: PeticionReservaUsc): Promise<ResultadoInstantBooking> {
  const lectura = await leerEventoYEstudio(admin, p.eventoExternoId);
  if (!lectura.ok) return lectura;
  const evento = { studio_id: lectura.studioId, sesion_id: lectura.sesionId, estado_sync: lectura.estadoSync };
  // Sin sesión: la borraron en Tentare y el cron aún no ha cancelado el evento.
  if (evento.estado_sync === 'CANCELADO' || !evento.sesion_id) return { ok: false, motivo: 'clase-cancelada' };

  // El estudio tiene que seguir vendiendo en USC: si lo ha apagado, o se ha
  // quedado sin contrato o está suspendido, sus eventos ya no admiten reservas
  // aunque USC no se haya enterado todavía (el cron los retira en su pasada).
  const sinVenta = lectura.sinVenta;
  const integracion = { activo: lectura.activo };
  if (sinVenta === 'error') return { ok: false, motivo: 'error-interno', detalle: 'no se pudo leer el estudio' };
  if (!integracion?.activo || sinVenta) return { ok: false, motivo: 'clase-no-existe' };

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
