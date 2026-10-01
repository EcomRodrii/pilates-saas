// El contrato del Instant Booking de Urban Sports Club, sin base de datos.
//
// Dos traducciones y nada más:
//   1. el cuerpo que manda USC → una petición validada;
//   2. el motivo por el que Tentare no acepta una reserva → la respuesta que
//      USC sabe enseñar a su socia (códigos E001…E006 de su documentación).
//
// La decisión de si hay plaza NO vive aquí: la toma la RPC transaccional de
// siempre, con su bloqueo, como cualquier otra reserva. Esto solo habla el
// idioma de USC a la entrada y a la salida.
//
// USC espera la respuesta en 500-1000 ms y NO reintenta: un error de nuestro
// lado es un «Reserva fallida» inmediato para la socia, y si lo vuelve a
// intentar llega con OTRO id (nunca reutilizan el id de una reserva).

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PeticionReservaUsc {
  /** Id (UUID) de la reserva en USC: la clave de idempotencia de nuestro lado. */
  reservaExternaId: string;
  /** Id (UUID) del Event de USC, el que les devolvimos al crear la clase. */
  eventoExternoId: string;
  /** Id estable de la socia en USC: el mismo en todas sus reservas. */
  clienteExternoId: string;
  nombre: string;
  apellidos: string;
}

export type LecturaPeticionUsc = { ok: true; peticion: PeticionReservaUsc } | { ok: false; error: string };

const MAX_NOMBRE = 120;

function texto(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null;
}

export function leerPeticionReservaUsc(cuerpo: unknown): LecturaPeticionUsc {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, error: 'El cuerpo no es un objeto JSON' };
  const c = cuerpo as Record<string, unknown>;
  const id = texto(c.id);
  const eventId = texto(c.event_id);
  // customer_id llega como texto numérico («1234568»), pero no se fía del tipo.
  const customerId = typeof c.customer_id === 'number' ? String(c.customer_id) : texto(c.customer_id);
  const nombre = texto(c.first_name) ?? '';
  const apellidos = texto(c.last_name) ?? '';
  if (!id || !RE_UUID.test(id)) return { ok: false, error: 'id no es un UUID' };
  if (!eventId || !RE_UUID.test(eventId)) return { ok: false, error: 'event_id no es un UUID' };
  if (!customerId) return { ok: false, error: 'falta customer_id' };
  if (!nombre && !apellidos) return { ok: false, error: 'falta el nombre' };
  return {
    ok: true,
    peticion: {
      reservaExternaId: id.toLowerCase(),
      eventoExternoId: eventId.toLowerCase(),
      clienteExternoId: customerId,
      nombre: nombre.slice(0, MAX_NOMBRE),
      apellidos: apellidos.slice(0, MAX_NOMBRE),
    },
  };
}

/** Por qué Tentare no acepta una reserva externa (vocabulario propio, no de USC). */
export type RechazoReservaExterna =
  | 'completa'
  | 'clase-no-existe'
  | 'clase-cancelada'
  | 'fuera-de-plazo'
  | 'ya-reservada'
  | 'demasiadas-peticiones'
  | 'peticion-invalida'
  | 'error-interno';

export interface RespuestaErrorUsc {
  status: number;
  cuerpo: { code: 'E001' | 'E002' | 'E003' | 'E004' | 'E005' | 'E006'; message: string };
}

/**
 * Lo que USC recibe cuando no hay reserva. El `message` lo puede enseñar a su
 * socia, así que va en inglés llano y sin detalles internos.
 */
export function respuestaRechazoUsc(motivo: RechazoReservaExterna): RespuestaErrorUsc {
  switch (motivo) {
    case 'completa':
      return { status: 409, cuerpo: { code: 'E001', message: 'This class is fully booked' } };
    case 'clase-no-existe':
      return { status: 404, cuerpo: { code: 'E002', message: 'This class does not exist' } };
    case 'clase-cancelada':
      return { status: 410, cuerpo: { code: 'E002', message: 'This class has been cancelled' } };
    case 'fuera-de-plazo':
      return { status: 422, cuerpo: { code: 'E003', message: 'Booking window is closed' } };
    case 'ya-reservada':
      return { status: 409, cuerpo: { code: 'E004', message: 'Member already booked' } };
    case 'demasiadas-peticiones':
      return { status: 429, cuerpo: { code: 'E005', message: 'Too many requests' } };
    case 'peticion-invalida':
      return { status: 400, cuerpo: { code: 'E006', message: 'Invalid booking request' } };
    case 'error-interno':
      return { status: 500, cuerpo: { code: 'E006', message: 'Booking could not be completed' } };
  }
}

/**
 * Lo que contesta `reservar_plaza_externa`, en el vocabulario de arriba. Una
 * clase que exige autorización nunca debería estar publicada en USC; si lo
 * está, es un error nuestro (`error-interno`), no algo que la socia pueda
 * arreglar.
 */
export function motivoDeErrorRpcUsc(mensaje: string): RechazoReservaExterna {
  if (mensaje.includes('AFORO_LLENO') || mensaje.includes('CUPO_PLATAFORMA_AGOTADO')) return 'completa';
  if (mensaje.includes('SESION_NO_ENCONTRADA')) return 'clase-no-existe';
  if (mensaje.includes('SESION_CANCELADA') || mensaje.includes('ESTUDIO_CERRADO')) return 'clase-cancelada';
  if (mensaje.includes('SESION_TERMINADA')) return 'fuera-de-plazo';
  if (mensaje.includes('YA_RESERVADA')) return 'ya-reservada';
  return 'error-interno';
}
