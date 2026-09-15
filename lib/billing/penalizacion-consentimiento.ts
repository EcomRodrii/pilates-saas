// ─────────────────────────────────────────────────────────────────────────────
// ¿Recoge el contrato que aceptó la socia ESTA penalización?
//
// El texto que acepta sale solo de `studios`: la ventana de cancelación del
// estudio y, si el estudio tiene importe, una cláusula con ESE importe. La
// detección (cancelar_reserva_plaza y el trigger de no-show) usa en cambio el
// override del tipo de clase para el importe y la ventana. Comparar solo que el
// texto aceptado sea el vigente no basta: el texto puede coincidir y el cargo
// no estar en él.
//
// Se cierra por defecto: si no se puede afirmar que el contrato lo recoge, no se
// cobra. Sin imports de servidor: lo usan el cron y la ruta de aprobar.
// ─────────────────────────────────────────────────────────────────────────────

import { horasCancelacionContrato, tieneTextoPropio } from '../legal-textos.ts';

export type MotivoSinConsentimiento =
  /** Lo que aceptó no es el texto vigente (cambió, o nunca aceptó ninguno). */
  | 'texto_distinto'
  /** El estudio usa sus propios términos: no hay cláusula generada que comprobar. */
  | 'terminos_propios'
  /** El estudio no tiene importe: su contrato no lleva cláusula de penalización. */
  | 'estudio_sin_penalizacion'
  /** El cargo no es el importe del contrato (override del tipo de clase). */
  | 'importe_distinto'
  /** Por la ventana del contrato, la cancelación no fue tardía. */
  | 'ventana_distinta'
  /** Faltan datos para comprobarlo (clase o fechas ilegibles, tipo desconocido). */
  | 'sin_datos';

export type VeredictoConsentimiento = { ok: true } | { ok: false; motivo: MotivoSinConsentimiento };

export interface EntradaConsentimiento {
  studio: {
    /** `studios.terminos_servicio` tal cual está guardado. */
    terminosServicio: string | null | undefined;
    penalizacionImporteEur: number | string | null | undefined;
    cancelacionVentanaHoras: number | string | null | undefined;
  };
  penalizacion: {
    tipo: string;
    importe: number | string | null | undefined;
    /** `penalizaciones.detectada_en`: para CANCELACION_TARDIA, el momento de cancelar (misma transacción). */
    detectadaEn: string | null | undefined;
  };
  /** La clase de la reserva. `null` si no existe. */
  sesion: { inicio: string | null | undefined } | null;
  /** `socios.aceptacion_version`: el texto completo que aceptó. */
  textoAceptado: string | null | undefined;
  /** `textoLegalVigenteDeFila(studio)`. */
  textoActual: string;
}

const HORA_MS = 3_600_000;

function centimos(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function numero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const no = (motivo: MotivoSinConsentimiento): VeredictoConsentimiento => ({ ok: false, motivo });

export function consentimientoCubrePenalizacion(e: EntradaConsentimiento): VeredictoConsentimiento {
  if (typeof e.textoAceptado !== 'string' || e.textoAceptado !== e.textoActual) return no('texto_distinto');
  if (tieneTextoPropio(e.studio.terminosServicio)) return no('terminos_propios');

  const importeContrato = centimos(e.studio.penalizacionImporteEur);
  if (importeContrato === null || importeContrato <= 0) return no('estudio_sin_penalizacion');
  if (centimos(e.penalizacion.importe) !== importeContrato) return no('importe_distinto');

  if (e.penalizacion.tipo === 'NO_SHOW') return { ok: true };
  if (e.penalizacion.tipo !== 'CANCELACION_TARDIA') return no('sin_datos');

  const inicio = Date.parse(e.sesion?.inicio ?? '');
  const cancelada = Date.parse(e.penalizacion.detectadaEn ?? '');
  if (Number.isNaN(inicio) || Number.isNaN(cancelada)) return no('sin_datos');
  const horas = horasCancelacionContrato({ cancelacionVentanaHoras: numero(e.studio.cancelacionVentanaHoras) });
  // Mismo corte que la detección (`now() >= inicio - ventana`), con la ventana del contrato.
  if (cancelada < inicio - horas * HORA_MS) return no('ventana_distinta');
  return { ok: true };
}

/** Lo que queda por hacer cuando la penalización YA pasó a OMITIDA_SIN_CONSENTIMIENTO. */
export interface IoCierreSinConsentimiento {
  /**
   * DELETE del recibo `rec-penaliz-<id>`, solo si sigue PENDIENTE, sin
   * `proximo_reintento`, sin PaymentIntent enlazado y sin Checkout abierto.
   * Devuelve las filas tocadas. La penalización ya no apunta a él: la escritura
   * a OMITIDA_SIN_CONSENTIMIENTO suelta `recibo_id` (la FK no deja borrarlo).
   */
  borrarRecibo(): Promise<{ error: boolean; tocadas: number }>;
  /** PAGO_PENALIZACION_BLOQUEADA, deduplicado por penalización en el motor. */
  notificarBloqueo(): Promise<void>;
  /** Aviso a Sentry, solo con ids. */
  alertar(motivo: 'NO_SE_PUDO_BORRAR_RECIBO'): void;
}

/**
 * Tras dejar la penalización OMITIDA_SIN_CONSENTIMIENTO (y solo si esa escritura
 * tocó la fila): su recibo no puede quedarse PENDIENTE en Cobros, donde
 * «Cobrar online» o el portal lo cobrarían saltándose el guardia. Se borra con
 * compare-and-set; lo que no esté en ese estado (se cobró, se programó, tiene un
 * Checkout abierto) no se toca, porque podría tener dinero detrás.
 *
 * `habiaRecibo`: la aprobación a mano sabe que existe; si aun así no se borra, se
 * avisa. En el cron lo normal es que no haya recibo (el guardia va antes de
 * crearlo), así que allí solo avisa un error.
 *
 * El aviso a la propietaria sale igual: la penalización ya no se cobra, con o sin
 * recibo borrado. Sin transacción (no hay RPC para esto): si el borrado falla, el
 * recibo queda sin penalización que apunte a él, y ni el dunning ni Cobros lo
 * cobran (`cobroManualDeRecibo`, `dunningPuedeCobrarPenalizacion`).
 */
export async function cerrarSinConsentimiento(
  io: IoCierreSinConsentimiento, p: { habiaRecibo: boolean },
): Promise<{ reciboBorrado: boolean }> {
  const borrado = await io.borrarRecibo();
  const reciboBorrado = !borrado.error && borrado.tocadas > 0;
  if (borrado.error || (p.habiaRecibo && !reciboBorrado)) io.alertar('NO_SE_PUDO_BORRAR_RECIBO');
  await io.notificarBloqueo();
  return { reciboBorrado };
}

/** Acceso a datos del cron para el bloqueo, inyectado para probarlo sin Supabase. */
export interface IoBloqueoConsentimiento extends IoCierreSinConsentimiento {
  /** CAS de la penalización a OMITIDA_SIN_CONSENTIMIENTO (soltando `recibo_id`), solo desde DETECTADA. */
  marcarOmitida(): Promise<{ error: boolean; tocadas: number }>;
}

/**
 * El cron, antes de crear ningún recibo. `true` = se puede seguir. Con `false`
 * no se crea recibo ni se cobra, pase lo que pase con la escritura: si el CAS no
 * tocó nada (otra pasada, o el trigger la revirtió), no se borra nada ni se avisa.
 *
 * Una DETECTADA puede tener ya recibo de una pasada anterior (no se pudo
 * programar y volvió a DETECTADA, o se insertó y no se llegó a enlazar): ese es
 * el que borra `cerrarSinConsentimiento`.
 */
export async function aplicarConsentimientoEnCron(
  veredicto: VeredictoConsentimiento, io: IoBloqueoConsentimiento,
): Promise<boolean> {
  if (veredicto.ok) return true;
  const marca = await io.marcarOmitida();
  if (!marca.error && marca.tocadas > 0) await cerrarSinConsentimiento(io, { habiaRecibo: false });
  return false;
}
