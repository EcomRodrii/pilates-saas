// La fila de una clase en el horario (P11/P12): qué dice a la derecha y si ofrece «Reservar». Puro, imports relativos
// con `.ts` (fila-horario.test.ts).
//
// ⚠️ NO es una cuarta copia de la elegibilidad. Solo decide si se ENSEÑA un atajo: quién paga lo dice `bonoParaClase`
// (atada al servidor por un test de paridad) y quien decide de verdad es el servidor (`crearReservaPublica` →
// `evaluar_reserva`). Ante la duda, sin botón: tocar la fila sigue abriendo la ficha, como siempre.

import { estaEnCurso, yaTermino } from './estado-clase.ts';
import type { Bono, Clase, Disponibilidad, Reserva } from './tipos.ts';
import { lunesDeLaSemana } from './semana-cuota.ts';

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
  /** La cuota que la paga ya llenó su tope de esa semana (`topeSemanalLleno`): el servidor la rechazaría o le gastaría una recuperación. */
  topeLleno: boolean;
}

/** ¿Se ofrece «Reservar» en la fila? Solo con plaza y con TODO en verde; cualquier duda, a la ficha. */
export function accionDeFila(c: CondicionesFila): 'reservar' | 'ninguna' {
  if (c.disp !== 'disponible' && c.disp !== 'pocas') return 'ninguna';
  if (!c.sinPagar || c.temporal !== 'plazas') return 'ninguna';
  if (c.cerrada || c.salaConSitios || c.requiereAprobacion || c.requiereAutorizacion || c.aperturaSuave) return 'ninguna';
  if (!c.online || !c.relojListo || c.recienReservada || c.topeLleno) return 'ninguna';
  return 'reservar';
}

/** Estados que gastan la semana, en el vocabulario de la app (los de `ESTADOS_QUE_USAN_LA_SEMANA`). */
const USAN_LA_SEMANA: ReadonlySet<string> = new Set(['confirmada', 'asistida', 'no-asistida']);

/**
 * ¿La cuota que paga esta clase ya llenó su tope de ESA semana (lunes a domingo, día del estudio)? Si sí, la fila no
 * ofrece el atajo: el servidor (`calcular_excede_limite_semanal`) la rechazaría o le gastaría una recuperación sin
 * avisar antes. Cuenta como el servidor: confirmadas, asistidas y faltas sin avisar, también las pagadas con
 * recuperación; el total solo de los tipos que cubre el plan y el de cada actividad, solo de esa actividad.
 *
 * Ante la duda, lleno: una reserva que cuenta y cuya clase no está en el horario cargado (una ya pasada) se da por
 * de la semana de `hoy`. Solo aplica a una cuota con tope; un bono no tiene tope semanal.
 */
export function topeSemanalLleno(
  clase: Pick<Clase, 'fecha' | 'tipoClaseId'>,
  bono: Pick<Bono, 'tipoPlan' | 'limiteSemanal' | 'limitePorTipo' | 'tiposClaseIds'> | null,
  reservas: readonly Pick<Reserva, 'claseId' | 'estado'>[],
  clases: readonly Pick<Clase, 'id' | 'fecha' | 'tipoClaseId'>[],
  hoy: string,
): boolean {
  if (!bono || bono.tipoPlan !== 'MENSUAL') return false;
  const limite = bono.limiteSemanal && bono.limiteSemanal > 0 ? bono.limiteSemanal : null;
  const limiteTipo = clase.tipoClaseId ? (bono.limitePorTipo?.[clase.tipoClaseId] ?? 0) : 0;
  if (limite === null && !(limiteTipo > 0)) return false;
  const semana = lunesDeLaSemana(clase.fecha);
  const semanaHoy = lunesDeLaSemana(hoy);
  const porId = new Map(clases.map((c) => [c.id, c]));
  const tipos = bono.tiposClaseIds ?? [];
  const cubre = (tipo: string | null | undefined) => tipos.length === 0 || !tipo || tipos.includes(tipo);
  let total = 0;
  let delTipo = 0;
  for (const r of reservas) {
    if (!USAN_LA_SEMANA.has(r.estado)) continue;
    const c = porId.get(r.claseId);
    if (!c) {
      // No sabemos su clase: ante la duda, de esta semana si la que se mira es la de hoy, y de su tipo.
      if (semana === semanaHoy) { total++; delTipo++; }
      continue;
    }
    if (lunesDeLaSemana(c.fecha) !== semana) continue;
    if (cubre(c.tipoClaseId)) total++;
    if (clase.tipoClaseId && c.tipoClaseId === clase.tipoClaseId) delTipo++;
  }
  return (limite !== null && total >= limite) || (limiteTipo > 0 && delTipo >= limiteTipo);
}
