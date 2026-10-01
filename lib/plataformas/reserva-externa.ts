// Reserva de una plataforma (ClassPass, Urban Sports Club, Wellhub) apuntada a
// mano desde el panel (`POST /api/reservas/crear-externa`).
//
// La venta ya ocurrió en la plataforma; recepción la apunta aquí para que ocupe
// plaza y el estudio no venda dos veces el mismo hueco. Lo puro de la ruta vive
// aquí para probarlo sin Supabase: qué petición se acepta y qué se le dice a
// recepción cuando la base de datos no la admite.
import { esPlataforma, NOMBRE_PLATAFORMA, type Plataforma } from './catalogo.ts';

export interface PeticionReservaExterna {
  sesionId: string;
  /** Lo genera el panel (`res-<uid>`): un reintento del mismo intento se reconoce. */
  reservaId: string;
  plataforma: Plataforma;
  /** Como lo apunta recepción («Ana G.»). */
  nombre: string;
  /** Código de la reserva en la plataforma, si lo tiene a mano: sirve para cuadrar pagos. */
  codigo: string | null;
}

const MAX_ID = 200;
const MAX_NOMBRE = 120;
const MAX_CODIGO = 80;
// Mismo formato que la reserva de mostrador, y por el mismo motivo se rechaza
// `res-pf-`: es el prefijo de las plazas fijas y cambia cómo se cancela.
const RESERVA_ID = /^res-[A-Za-z0-9_-]{1,96}$/;

function idValido(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && v.trim() === v ? v : null;
}

export function leerPeticionReservaExterna(body: unknown):
  | { ok: true; datos: PeticionReservaExterna }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Petición no válida' };
  const b = body as Record<string, unknown>;
  const sesionId = idValido(b.sesionId);
  if (!sesionId) return { ok: false, error: 'Falta la clase' };
  const reservaId = typeof b.reservaId === 'string' ? b.reservaId : '';
  if (!RESERVA_ID.test(reservaId) || reservaId.startsWith('res-pf-')) {
    return { ok: false, error: 'Identificador de reserva no válido' };
  }
  if (!esPlataforma(b.plataforma)) return { ok: false, error: 'Plataforma no válida' };
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim().replace(/\s+/g, ' ') : '';
  if (!nombre) return { ok: false, error: 'Escribe el nombre de la persona' };
  if (nombre.length > MAX_NOMBRE) return { ok: false, error: 'El nombre es demasiado largo' };
  const codigoBruto = typeof b.codigo === 'string' ? b.codigo.trim() : '';
  if (codigoBruto.length > MAX_CODIGO) return { ok: false, error: 'El código de reserva es demasiado largo' };
  return {
    ok: true,
    datos: { sesionId, reservaId, plataforma: b.plataforma, nombre, codigo: codigoBruto || null },
  };
}

/**
 * Lo que la RPC `reservar_plaza_externa` puede contestar, en el idioma de
 * recepción. `null` = no es un código conocido (se registra y se da un error
 * genérico; nunca el SQL crudo a pantalla).
 */
export function mensajeErrorReservaExterna(mensaje: string, plataforma: Plataforma): { status: 400 | 404 | 409; error: string } | null {
  const nombre = NOMBRE_PLATAFORMA[plataforma];
  if (mensaje.includes('AFORO_LLENO')) {
    return { status: 409, error: `La clase está completa. Si ${nombre} ya se la ha vendido, cancélala allí: aquí no queda plaza.` };
  }
  if (mensaje.includes('CUPO_PLATAFORMA_AGOTADO')) {
    return { status: 409, error: `Ya están cubiertas todas las plazas que cedes a ${nombre} en esta clase.` };
  }
  if (mensaje.includes('SESION_NO_ENCONTRADA')) return { status: 404, error: 'No encontramos esta clase.' };
  if (mensaje.includes('SESION_CANCELADA')) return { status: 400, error: 'Esta clase está cancelada.' };
  if (mensaje.includes('SESION_TERMINADA')) return { status: 400, error: 'Esta clase ya ha terminado.' };
  if (mensaje.includes('ESTUDIO_CERRADO')) return { status: 400, error: 'El estudio está cerrado ese día.' };
  if (mensaje.includes('TIPO_REQUIERE_AUTORIZACION')) {
    return { status: 400, error: 'Esta clase exige autorización previa: no se puede apuntar a alguien de fuera.' };
  }
  if (mensaje.includes('YA_RESERVADA')) return { status: 409, error: 'Esta persona ya está apuntada a la clase.' };
  if (mensaje.includes('NOMBRE_REQUERIDO')) return { status: 400, error: 'Escribe el nombre de la persona.' };
  return null;
}

/**
 * Lo que se le dice a recepción al apuntarla. Si se pasa de las plazas cedidas
 * NO se bloquea (la venta ya se hizo y la persona va a venir): se avisa.
 */
export function avisoCupoTrasApuntar(plataforma: Plataforma, cupo: number | null, usado: number): string | null {
  if (cupo == null || usado <= cupo) return null;
  return `Ojo: ya hay ${usado} de ${NOMBRE_PLATAFORMA[plataforma]} y solo cedes ${cupo}. Revisa cuántas plazas tienes publicadas allí.`;
}
