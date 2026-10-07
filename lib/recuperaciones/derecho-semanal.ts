// Cuántas recuperaciones le corresponden a una socia por una semana cerrada.
//
// ⚠️ La pregunta NO es «¿cuántas clases canceló?». Cancelar a tiempo YA le
// libera el hueco de esa semana —`reservar_plaza` no cuenta las canceladas— así
// que si volvió a reservar, no ha perdido nada y no le corresponde ninguna.
// Darle una igualmente sería regalarle una clase por cada cancelación.
//
// Lo que se compensa es el hueco que se quedó SIN USAR habiendo cancelado a
// tiempo: eso es exactamente «cancelé el martes y ya no me cupo otra».
//
// Sin imports de la app: la lógica que decide quién gana qué se prueba sola (solo la constante del prefijo de clase fija).
import { esReservaPlazaFija } from '../reservas/plaza-fija-id.ts';

export function derechoDeRecuperaciones(
  limiteSemanal: number,
  usadas: number,
  canceladasATiempo: number,
): number {
  if (limiteSemanal <= 0) return 0;
  const huecosSinUsar = Math.max(0, limiteSemanal - usadas);
  // Nunca más recuperaciones que cancelaciones: si tenía 3 de límite, usó 1 y
  // canceló 1, se quedó con 1 hueco libre por decisión propia y otro por la
  // cancelación. Solo se compensa el segundo.
  return Math.min(huecosSinUsar, Math.max(0, canceladasATiempo));
}

/**
 * Los estados que USAN una clase de la semana, los mismos que cuenta el tope de `reservar_plaza`
 * (`calcular_excede_limite_semanal`): quien reserva y no viene también la ha usado. Dueño único en TS: el barrido de
 * recuperaciones y «Esta semana» de la cuota en la app (lib/student/semana-cuota.ts).
 */
export const ESTADOS_QUE_USAN_LA_SEMANA = ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'] as const;

/** Lo que el barrido necesita de cada reserva suya de la semana (las columnas de `reservas`). */
export interface ReservaDeLaSemana {
  id: unknown;
  sesion_id: unknown;
  estado: unknown;
  creado_en?: unknown;
  bono_consumo_rastreado?: unknown;
  bono_decidido_en?: unknown;
}

/**
 * ¿Llegó a ocupar plaza? Solo así una cancelación le quita una clase.
 *
 * Salir de la lista de espera, una oferta que rechazó o que caducó, o una reserva
 * que el estudio no aprobó también acaban en CANCELADA (y el trigger les pone
 * `cancelada_tardia`), pero ahí nunca tuvo plaza: no hay clase perdida.
 *
 * Sin migración, con el rastro que ya deja la base de datos: TODA confirmación de
 * una reserva rastreada (`bono_consumo_rastreado`, las de `reservar_plaza`) decide
 * su cobro y lo marca en `bono_decidido_en` —también cuando no cobra nada porque
 * la paga la cuota—, al reservar con plaza, al subir de la lista, al aceptar una
 * oferta o al aprobarla (`consumir_bono_interno`, `consumir_sesion_bono_reserva`).
 * Una rastreada sin esa marca no llegó a confirmarse.
 * Las que no se pueden saber, se tratan como antes (sí tuvo plaza): las de su
 * clase fija (`res-pf-`, nacen CONFIRMADAS) y las no rastreadas (legadas o de
 * caminos que no cobran).
 */
export function llegoAOcuparPlaza(r: ReservaDeLaSemana): boolean {
  if (esReservaPlazaFija(String(r.id))) return true;
  if (r.bono_consumo_rastreado !== true) return true;
  return r.bono_decidido_en != null;
}

/**
 * De sus cancelaciones a tiempo, las que pueden compensarse:
 * - solo las de una reserva que llegó a ocupar plaza (`llegoAOcuparPlaza`);
 * - NO la de una clase a la que ha vuelto a apuntarse (otra reserva suya activa en
 *   la MISMA sesión): ahí no perdió nada, va a esa clase. Sin esto, «no voy» y luego
 *   reservarla otra vez desde la ficha contaba como una cancelación sin recuperar,
 *   y si su cuota le deja más clases a la semana de las que usa
 *   (`derechoDeRecuperaciones` no puede distinguir un hueco que dejó ella de uno que
 *   le quitó la cancelación), se le daba una recuperación por una clase a la que fue;
 * - UNA por clase (la primera por `creado_en`): cancelar, volver a reservar y
 *   cancelar otra vez la MISMA clase es una sola clase perdida, no dos.
 */
export function canceladasCompensables<T extends ReservaDeLaSemana>(canceladas: T[], suyas: T[]): T[] {
  const vuelveA = new Set(suyas
    .filter((r) => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA' || r.estado === 'NO_ASISTIO')
    .map((r) => String(r.sesion_id)));
  const vistas = new Set<string>();
  return [...canceladas]
    .sort((a, b) => String(a.creado_en ?? '').localeCompare(String(b.creado_en ?? '')))
    .filter((r) => {
      const sesion = String(r.sesion_id);
      if (!llegoAOcuparPlaza(r) || vuelveA.has(sesion) || vistas.has(sesion)) return false;
      vistas.add(sesion);
      return true;
    });
}
