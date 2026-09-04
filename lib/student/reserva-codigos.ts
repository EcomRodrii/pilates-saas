// Traducción de lo que devuelve el servidor a la máquina de estados del
// paquete de diseño (`lib/booking-machine.ts` → `TRANSICIONES` y `COPY`).
//
// Por qué existe: la máquina del diseño tiene once estados, y el servidor no
// habla en esos términos. Devuelve o un `estado` de reserva ('CONFIRMADA',
// 'LISTA_ESPERA'…) o un `codigo` de fallo ('aforo-lleno', 'ya-reservada'…).
// Esta función es el único sitio donde se cruzan los dos vocabularios.
//
// ⚠️ Se traduce el CÓDIGO, nunca el mensaje. `crearReservaPublica` devuelve las
// dos cosas: `error` es la frase para enseñar y `codigo` es el dato. Comparar
// la frase —que es lo que había que hacer antes de que el código existiera—
// significa que cualquier retoque de copy, o una traducción, rompe la máquina
// en silencio.
//
// ⚠️ El servidor es la autoridad. Esta función NO decide nada: solo nombra lo
// que el servidor ya decidió. En particular `full` no se deduce del aforo que
// el cliente cree tener, sino de que el servidor haya rechazado con
// 'aforo-lleno' — el aforo del cliente no cuenta las máquinas averiadas
// (`aforo_efectivo`), así que puede enseñar una plaza que no existe.

import type { BookingState } from './tipos';

/** Los códigos estables que puede devolver el servidor al reservar. */
export type CodigoReserva =
  | 'ya-reservada'
  | 'conflicto-horario'
  | 'aforo-lleno'
  | 'limite-semanal'
  | 'spot-ocupado'
  | 'spot-no-disponible'
  | 'sesion-no-encontrada'
  | 'no-autorizado'
  | 'error';

/** Lo que la ruta devuelve al confirmar una reserva. */
export type RespuestaReserva =
  | { ok: true; estado: string; reservaId?: string; posicionEspera?: number | null }
  | { error: string; codigo?: CodigoReserva | string };

export interface DesenlaceReserva {
  state: BookingState;
  reservaId?: string;
  posicionEspera?: number | null;
  /** El mensaje del servidor, para los estados que no tienen copy propio. */
  mensaje?: string;
}

/**
 * Del resultado del servidor al estado del diseño.
 *
 * `sinRed` se pasa aparte porque «no hay conexión» no es una respuesta del
 * servidor: es que no ha habido petición. Mezclarlo con los códigos llevaría a
 * enseñar «algo no ha salido bien» cuando lo que pasa es que no hay red, y el
 * copy del diseño para ese caso dice explícitamente que no se ha hecho ningún
 * cargo.
 */
export function desenlaceDeRespuesta(r: RespuestaReserva | null, sinRed = false): DesenlaceReserva {
  if (sinRed) return { state: 'offline' };
  // `null` es «la petición no llegó a devolver nada útil»: se trata como error,
  // nunca como éxito. La regla del paquete es que ninguna pantalla enseña éxito
  // hasta que el adaptador confirma.
  if (!r) return { state: 'error' };

  if ('ok' in r && r.ok) {
    switch (r.estado) {
      case 'CONFIRMADA':
        return { state: 'confirmed', reservaId: r.reservaId };
      case 'LISTA_ESPERA':
        return { state: 'waitlisted', reservaId: r.reservaId, posicionEspera: r.posicionEspera ?? null };
      // 'PENDIENTE_APROBACION' no tiene estado propio en la máquina del
      // diseño. Se trata como `waitlisted` porque es lo que describe la
      // situación real de la alumna —está apuntada y espera respuesta del
      // estudio— y su copy («te avisamos al momento») encaja sin mentir.
      // DESIGN CONFLICT documentado: el paquete no contempla que un estudio
      // exija aprobar cada reserva, y Tentare sí (`requiere_aprobacion`).
      case 'PENDIENTE_APROBACION':
        return { state: 'waitlisted', reservaId: r.reservaId, posicionEspera: null };
      default:
        // Un estado que no conocemos NO se pinta como éxito.
        return { state: 'error', mensaje: `Respuesta inesperada del servidor (${r.estado}).` };
    }
  }

  const mensaje = 'error' in r ? r.error : undefined;
  switch ('codigo' in r ? r.codigo : undefined) {
    case 'ya-reservada': return { state: 'duplicate' };
    case 'conflicto-horario': return { state: 'conflict' };
    case 'aforo-lleno': return { state: 'full' };
    case 'spot-ocupado': return { state: 'full', mensaje };
    case 'no-autorizado': return { state: 'session-expired' };
    // `limite-semanal` y `spot-no-disponible` no tienen estado en la máquina:
    // llevan un motivo concreto que el copy genérico de `error` no cuenta, así
    // que se enseña el mensaje del servidor. Inventarles un estado nuevo sería
    // rediseñar la máquina, que es justo lo que no toca hacer aquí.
    case 'limite-semanal':
    case 'spot-no-disponible':
      return { state: 'error', mensaje };
    case 'sesion-no-encontrada': return { state: 'error', mensaje };
    default: return { state: 'error', mensaje };
  }
}
