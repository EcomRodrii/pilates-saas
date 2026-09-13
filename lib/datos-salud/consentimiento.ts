// ─────────────────────────────────────────────────────────────────────────────
// Consentimiento de datos de salud (art. 9 RGPD): estado y cambios.
//
// El estado vigente vive en `socios.consentimiento_salud_*` (de ahí cuelga
// `tiene_consentimiento_salud()` y la RLS de las tablas clínicas); el historial,
// en `consentimientos_salud_eventos`. La única vía de escritura es la RPC
// `consentimiento_salud_cambiar` (migr 20260913173100), solo service_role.
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoConsentimientoSalud = 'VIGENTE' | 'REVOCADO' | 'NO_CONSTA';

/** Mismo criterio que `tiene_consentimiento_salud()`: fecha puesta y sin revocar. */
export function estadoConsentimientoSalud(c: {
  fecha?: string | null;
  revocadoEn?: string | null;
}): EstadoConsentimientoSalud {
  if (c.revocadoEn) return 'REVOCADO';
  if (c.fecha) return 'VIGENTE';
  return 'NO_CONSTA';
}

export type TipoCambioConsentimiento = 'OTORGADO' | 'REVOCADO';
export type ResultadoCambioConsentimiento = 'OK' | 'YA_CONSTABA' | 'NO_CONSTABA' | 'SOCIA_NO_ENCONTRADA';

export interface RespuestaCambio {
  status: number;
  ok: boolean;
  /** false cuando no hacía falta cambiar nada (ya estaba así). */
  cambiado: boolean;
  error?: string;
}

/**
 * Lo que devuelve la RPC → respuesta HTTP. Repetir la operación es idempotente
 * (200 sin cambios): un doble toque en el móvil no es un error que enseñar.
 */
export function respuestaCambioConsentimiento(resultado: unknown): RespuestaCambio {
  switch (resultado) {
    case 'OK':
      return { status: 200, ok: true, cambiado: true };
    case 'YA_CONSTABA':
    case 'NO_CONSTABA':
      return { status: 200, ok: true, cambiado: false };
    case 'SOCIA_NO_ENCONTRADA':
      return { status: 404, ok: false, cambiado: false, error: 'No encontramos a esta clienta en tu estudio.' };
    default:
      return { status: 500, ok: false, cambiado: false, error: 'No se ha podido guardar el consentimiento.' };
  }
}

export const FIRMA_MIN = 2;
export const FIRMA_MAX = 120;

/**
 * La firma tecleada en mostrador: el nombre de quien autoriza. Se normalizan
 * espacios; `null` si no vale. No se intenta validar que sea «un nombre» —
 * eso no lo puede saber el software—, solo que no esté vacía ni sea basura.
 */
export function normalizarFirma(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const limpia = v.replace(/\s+/g, ' ').trim();
  if (limpia.length < FIRMA_MIN || limpia.length > FIRMA_MAX) return null;
  if (!/\p{L}/u.test(limpia)) return null;
  return limpia;
}
