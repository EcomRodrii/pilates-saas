// Recuperación de impagos del SaaS (Fase 2): CUÁNDO se avisa y QUÉ se dice. Puro, para
// probarlo con `node --test`; el envío y la lectura de Stripe viven en `servidor.ts`.
//
// Principios (brief del fundador, 16-nov-2026):
//   · Los reintentos del cobro son de Stripe Billing. Aquí NO se reintenta nada: solo se
//     avisa a la propietaria, se enseña el estado y se sigue a Stripe.
//   · Nunca se cancela ni suspende una cuenta por el primer fallo, ni automáticamente por
//     ninguno: llegar al último hito solo ESCALA el incidente (lo ve /interno) y el aviso
//     habla de «posible restricción». Suspender es un acto humano (`studios.suspendido_*`).
//   · Los plazos son una propuesta y se pueden cambiar (`ajustes_plataforma`).
import { hoyEnEstudio, masDias } from '../../utils.ts';

export interface PoliticaImpagos {
  /** Días desde el primer fallo en los que se avisa. El 0 es el aviso inmediato. Ascendentes. */
  dias: number[];
  /** Hora de Madrid (inclusive) desde la que se mandan los avisos que no son inmediatos. */
  horaDesde: number;
  /** Hora de Madrid (exclusive) hasta la que se mandan. */
  horaHasta: number;
}

export const POLITICA_POR_DEFECTO: PoliticaImpagos = { dias: [0, 2, 5, 7], horaDesde: 9, horaHasta: 20 };
export const CLAVE_POLITICA = 'billing_politica_impagos';

const entero = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

/**
 * La política guardada, o la de serie si no es válida. Nunca lanza: un ajuste mal
 * escrito no puede dejar a un estudio sin aviso de que no se le cobra.
 */
export function leerPolitica(valor: unknown): PoliticaImpagos {
  const v = valor as Partial<PoliticaImpagos> | null | undefined;
  if (!v || typeof v !== 'object') return POLITICA_POR_DEFECTO;
  const dias = Array.isArray(v.dias) ? v.dias : null;
  const dias_ok = !!dias && dias.length >= 1 && dias.length <= 8 && dias.every((d) => entero(d) && d >= 0 && d <= 60)
    && dias.every((d, i) => i === 0 || d > (dias[i - 1] as number)) && dias[0] === 0;
  const horas_ok = entero(v.horaDesde) && entero(v.horaHasta) && v.horaDesde >= 0 && v.horaHasta <= 24 && v.horaDesde < v.horaHasta;
  return {
    dias: dias_ok ? (dias as number[]) : POLITICA_POR_DEFECTO.dias,
    horaDesde: horas_ok ? (v.horaDesde as number) : POLITICA_POR_DEFECTO.horaDesde,
    horaHasta: horas_ok ? (v.horaHasta as number) : POLITICA_POR_DEFECTO.horaHasta,
  };
}

/** Qué dice el aviso: el primero, un recordatorio, o el último («posible restricción»). */
export type TipoAviso = 'primero' | 'recordatorio' | 'restriccion';

export function tipoDeAviso(dia: number, politica: PoliticaImpagos): TipoAviso {
  if (dia === politica.dias[0]) return 'primero';
  // Con un solo hito no hay «último» distinto del primero.
  return dia === politica.dias[politica.dias.length - 1] ? 'restriccion' : 'recordatorio';
}

/** Días de calendario (Madrid) entre dos instantes: el día del fallo es el 0. */
export function diasDesde(abiertoEn: Date | string, ahora: Date): number {
  const desde = hoyEnEstudio(new Date(abiertoEn));
  const hasta = hoyEnEstudio(ahora);
  let n = 0;
  // Bucle corto en vez de aritmética de Date: un cambio de hora no puede mover un día.
  for (let d = desde; d < hasta && n < 400; d = masDias(d, 1)) n++;
  return n;
}

/** Hora de Madrid (0–23) de un instante. */
export function horaEnMadrid(ahora: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(ahora));
}

export interface AvisoHecho { dia: number }

export interface Pendiente {
  /** El hito que toca mandar ahora. */
  dia: number;
  tipo: TipoAviso;
  /** Hitos anteriores que se quedaron sin mandar (el cron no corrió ese día): no se mandan a la vez. */
  saltados: number[];
}

/**
 * El aviso que toca ahora, si toca alguno. Como mucho UNO por pasada: si se pasaron dos
 * hitos (el cron estuvo parado), se manda el último y los anteriores se dan por saltados,
 * para no mandar tres correos seguidos. El aviso del día 0 no espera a la ventana horaria
 * (es el motivo por el que se enteran); los demás, sí.
 */
export function avisoPendiente(
  incidente: { abiertoEn: Date | string; avisos: readonly AvisoHecho[] },
  ahora: Date,
  politica: PoliticaImpagos,
): Pendiente | null {
  const dias = diasDesde(incidente.abiertoEn, ahora);
  const hechos = new Set(incidente.avisos.map((a) => a.dia));
  const vencidos = politica.dias.filter((d) => d <= dias && !hechos.has(d));
  if (vencidos.length === 0) return null;
  const dia = vencidos[vencidos.length - 1] as number;
  const h = horaEnMadrid(ahora);
  if (dia !== politica.dias[0] && (h < politica.horaDesde || h >= politica.horaHasta)) return null;
  return { dia, tipo: tipoDeAviso(dia, politica), saltados: vencidos.slice(0, -1) };
}

/** ¿Ya se mandó el último hito? Entonces el incidente pasa a ESCALADO (lo trabaja una persona). */
export function debeEscalar(
  incidente: { estado: string; avisos: readonly AvisoHecho[] },
  politica: PoliticaImpagos,
): boolean {
  const ultimo = politica.dias[politica.dias.length - 1] as number;
  return incidente.estado === 'ABIERTO' && incidente.avisos.some((a) => a.dia === ultimo);
}

/** Lo que dijo el banco, en cristiano. `null` si no hay un motivo que enseñar. */
export function textoDelMotivo(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const c = codigo.toLowerCase();
  const TEXTOS: Record<string, string> = {
    insufficient_funds: 'La tarjeta no tiene fondos suficientes.',
    expired_card: 'La tarjeta ha caducado.',
    incorrect_cvc: 'El código de seguridad de la tarjeta no es correcto.',
    incorrect_number: 'El número de la tarjeta no es correcto.',
    invalid_cvc: 'El código de seguridad de la tarjeta no es válido.',
    card_velocity_exceeded: 'La tarjeta ha superado su límite de operaciones.',
    authentication_required: 'Tu banco pide confirmar el pago (autenticación).',
    authentication_not_handled: 'Tu banco pide confirmar el pago (autenticación).',
    card_declined: 'Tu banco ha rechazado el cargo.',
    do_not_honor: 'Tu banco ha rechazado el cargo.',
    generic_decline: 'Tu banco ha rechazado el cargo.',
    lost_card: 'El banco ha bloqueado la tarjeta.',
    stolen_card: 'El banco ha bloqueado la tarjeta.',
    pickup_card: 'El banco ha bloqueado la tarjeta.',
    processing_error: 'Hubo un fallo al procesar el pago; se volverá a intentar.',
  };
  return TEXTOS[c] ?? 'Tu banco no ha aceptado el cargo.';
}
