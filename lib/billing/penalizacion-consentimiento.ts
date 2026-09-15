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

/** Acceso a datos del cron para el bloqueo, inyectado para probarlo sin Supabase. */
export interface IoBloqueoConsentimiento {
  /** CAS de la penalización a OMITIDA_SIN_CONSENTIMIENTO, solo desde DETECTADA. */
  marcarOmitida(): Promise<{ error: boolean; tocadas: number }>;
  /** PAGO_PENALIZACION_BLOQUEADA, deduplicado por penalización en el motor. */
  notificarBloqueo(): Promise<void>;
}

/**
 * El cron, antes de crear ningún recibo. `true` = se puede seguir. Con `false`
 * no se crea recibo ni se cobra, pase lo que pase con la escritura: si el CAS no
 * tocó nada (otra pasada, o el trigger la revirtió), tampoco se avisa.
 */
export async function aplicarConsentimientoEnCron(
  veredicto: VeredictoConsentimiento, io: IoBloqueoConsentimiento,
): Promise<boolean> {
  if (veredicto.ok) return true;
  const marca = await io.marcarOmitida();
  if (!marca.error && marca.tocadas > 0) await io.notificarBloqueo();
  return false;
}
