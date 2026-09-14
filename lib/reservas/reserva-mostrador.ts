// Reserva metida por el MOSTRADOR desde el panel (`POST /api/reservas/crear`).
//
// Lo puro de la ruta vive aquí para poder probarlo sin Supabase: qué petición
// se acepta y quién puede apuntar a alguien en qué clase.
import { puedeOperarClase } from '../permisos-reglas.ts';
import type { Rol } from '../types.ts';

export interface PeticionReservaMostrador {
  sesionId: string;
  socioId: string;
  /** Lo genera el panel (`res-<uid>`): así un reintento del mismo intento es reconocible. */
  reservaId: string;
  /** «Avisar a la alumna». Solo un `false` explícito lo apaga. */
  avisar: boolean;
}

const MAX_ID = 200;

function idValido(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && v.trim() === v ? v : null;
}

// ⚠️ `res-pf-` NO se acepta, y no es estética: es el prefijo de las plazas fijas
// materializadas, y `ejecutarCancelacionReserva` lo usa para decidir que al
// cancelar NO se devuelve bono y SÍ se da una recuperación. Una reserva normal
// con ese prefijo se cancelaría como plaza fija.
const RESERVA_ID = /^res-[A-Za-z0-9_-]{1,96}$/;

export function leerPeticionReservaMostrador(body: unknown):
  | { ok: true; datos: PeticionReservaMostrador }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Petición no válida' };
  const b = body as Record<string, unknown>;
  const sesionId = idValido(b.sesionId);
  if (!sesionId) return { ok: false, error: 'Falta la clase' };
  const socioId = idValido(b.socioId);
  if (!socioId) return { ok: false, error: 'Falta la clienta' };
  const reservaId = typeof b.reservaId === 'string' ? b.reservaId : '';
  if (!RESERVA_ID.test(reservaId) || reservaId.startsWith('res-pf-')) {
    return { ok: false, error: 'Identificador de reserva no válido' };
  }
  // Mismo criterio que `avisar === false` en app/api/sustituciones (acción
  // 'confirmar'): ante la duda, se avisa. Un cliente viejo que no mande el
  // campo no deja a nadie sin enterarse.
  return { ok: true, datos: { sesionId, socioId, reservaId, avisar: b.avisar !== false } };
}

/**
 * ¿Puede este miembro del equipo apuntar a alguien en esta clase?
 *
 * Es la regla que aplicaba `reservar_plaza` cuando la llamaba el navegador
 * (migr 20260907030553, guardia convertida en 20260913233644):
 *   `if not es_llamada_servicio() and current_rol() = 'INSTRUCTOR' then
 *      if v_instructor_id is distinct from current_instructor_id() → NO_AUTORIZADO`
 * PROPIETARIO, MANAGER y RECEPCION en cualquier clase; INSTRUCTOR solo en las
 * suyas. Con service-role esa guardia no corre, por eso se repite en la ruta.
 *
 * Una diferencia, a propósito y hacia el lado seguro: con la instructora sin
 * ficha y la clase sin instructora, la RPC compararía NULL con NULL y dejaría
 * pasar. Aquí no. No es alcanzable (el rol INSTRUCTOR sale de su ficha), pero
 * si algún día lo fuera, «sin ficha» no puede significar «todas las clases sin
 * asignar».
 */
export function puedeApuntarEnClase(p: {
  rol: Rol; instructorIdStaff: string | null; instructorIdClase: string | null;
}): boolean {
  const esClasePropia = p.instructorIdStaff != null && p.instructorIdStaff === p.instructorIdClase;
  return puedeOperarClase(p.rol, esClasePropia);
}
