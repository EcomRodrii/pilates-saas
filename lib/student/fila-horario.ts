// La fila de una clase en el horario (P11/P12): qué dice a la derecha y si ofrece «Reservar». Puro, imports relativos
// con `.ts` (fila-horario.test.ts).
//
// ⚠️ NO es una cuarta copia de la elegibilidad. Solo decide si se ENSEÑA un atajo: quién paga lo dice `bonoParaClase`
// (atada al servidor por un test de paridad) y quien decide de verdad es el servidor (`crearReservaPublica` →
// `evaluar_reserva`). Ante la duda, sin botón: tocar la fila sigue abriendo la ficha, como siempre.

import { estaEnCurso, yaTermino } from './estado-clase.ts';
import type { Clase, Disponibilidad } from './tipos.ts';

/** Lo que se dice de una clase en ESTE momento: un solo dueño para la fila de siempre y la nueva. */
export type EstadoTemporal = 'en-curso' | 'terminada' | 'se-abre' | 'plazas';

export function estadoTemporalDeFila(
  c: Pick<Clase, 'inicio' | 'fin' | 'seAbreEl'>, disp: Disponibilidad, ahoraMs: number | null,
): EstadoTemporal {
  if (estaEnCurso(c, ahoraMs)) return 'en-curso';
  if (yaTermino(c, ahoraMs)) return 'terminada';
  // Aún no se abre (hora fija del estudio): se dice en vez de las plazas, para que no pulse y se encuentre el «no». Si
  // ya es suya, no aplica. Sin reloj todavía (hidratación) no se pinta nada temporal.
  if (c.seAbreEl && ahoraMs !== null && disp !== 'reservada' && disp !== 'lista-espera' && ahoraMs < Date.parse(c.seAbreEl)) return 'se-abre';
  return 'plazas';
}

/** ¿La antelación mínima ya cerró la reserva? Sin reloj no se sabe, así que no se afirma. */
export function cerradaPorAntelacion(c: Pick<Clase, 'cierraEl'>, ahoraMs: number | null): boolean {
  return !!c.cierraEl && ahoraMs !== null && ahoraMs >= Date.parse(c.cierraEl);
}

export interface CondicionesFila {
  disp: Disponibilidad;
  /** La hoja diría «No pagas nada hoy»: un bono con sesiones o una cuota que cubren ESTA clase (`seReservaSinPagar`). */
  sinPagar: boolean;
  temporal: EstadoTemporal;
  /** Cerrada por la antelación mínima. */
  cerrada: boolean;
  /** La sala tiene sitios que elegir: eso solo se hace desde la ficha. */
  salaConSitios: boolean;
  /** El estudio aprueba cada reserva (del tipo o del estudio). */
  requiereAprobacion: boolean;
  /** La clase exige que el estudio la autorice, y la app no sabe si lo está. */
  requiereAutorizacion: boolean;
  /** Apertura suave: decide el servidor quién puede. */
  aperturaSuave: boolean;
  online: boolean;
  /** Hay reloj (ya hidratado): sin él, el HTML del servidor y el primer render coinciden sin botón. */
  relojListo: boolean;
  /** La acaba de reservar desde aquí y los datos aún no lo dicen: ni botón ni «Reservada» optimista. */
  recienReservada: boolean;
}

/** ¿Se ofrece «Reservar» en la fila? Solo con plaza y con TODO en verde; cualquier duda, a la ficha. */
export function accionDeFila(c: CondicionesFila): 'reservar' | 'ninguna' {
  if (c.disp !== 'disponible' && c.disp !== 'pocas') return 'ninguna';
  if (!c.sinPagar || c.temporal !== 'plazas') return 'ninguna';
  if (c.cerrada || c.salaConSitios || c.requiereAprobacion || c.requiereAutorizacion || c.aperturaSuave) return 'ninguna';
  if (!c.online || !c.relojListo || c.recienReservada) return 'ninguna';
  return 'reservar';
}
