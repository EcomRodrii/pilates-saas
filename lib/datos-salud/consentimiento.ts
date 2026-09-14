// ─────────────────────────────────────────────────────────────────────────────
// Consentimiento de datos de salud (art. 9 RGPD): estado y cambios.
//
// El estado vigente vive en `socios.consentimiento_salud_*` (de ahí cuelga
// `tiene_consentimiento_salud()` y la RLS de las tablas clínicas); el historial,
// en `consentimientos_salud_eventos`. La única vía de escritura es la RPC
// `consentimiento_salud_cambiar` (migr 20260913214142), solo service_role.
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { consentimientoSaludPorEdad, EDAD_MINIMA_CONSENTIMIENTO_SALUD, type ConsentimientoSaludPorEdad } from './edad.ts';

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
export type ResultadoCambioConsentimiento =
  | 'OK' | 'YA_CONSTABA' | 'NO_CONSTABA' | 'SOCIA_NO_ENCONTRADA'
  // Solo origen PORTAL (migr 20260914015114): la alumna no consiente por sí misma.
  | 'MENOR_14' | 'FALTA_FECHA_NACIMIENTO';

export interface RespuestaCambio {
  status: number;
  ok: boolean;
  /** false cuando no hacía falta cambiar nada (ya estaba así). */
  cambiado: boolean;
  error?: string;
  /** Para que la app de la alumna sepa qué pantalla enseñar, sin leer el texto del error. */
  codigo?: 'MENOR_14' | 'FALTA_FECHA_NACIMIENTO';
}

export const MENSAJE_MENOR_CONSENTIMIENTO_PORTAL =
  `Como tienes menos de ${EDAD_MINIMA_CONSENTIMIENTO_SALUD} años, esta autorización no la puedes dar tú desde la app: la gestiona el estudio con tu padre, madre o tutor legal.`;
export const MENSAJE_FALTA_FECHA_NACIMIENTO =
  'Antes de autorizarlo necesitamos tu fecha de nacimiento.';

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
    case 'MENOR_14':
      return { status: 403, ok: false, cambiado: false, codigo: 'MENOR_14', error: MENSAJE_MENOR_CONSENTIMIENTO_PORTAL };
    case 'FALTA_FECHA_NACIMIENTO':
      return { status: 409, ok: false, cambiado: false, codigo: 'FALTA_FECHA_NACIMIENTO', error: MENSAJE_FALTA_FECHA_NACIMIENTO };
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

// ─── Menores (decisión B de la auditoría RGPD) ───────────────────────────────

/**
 * Qué responde la ruta de la ALUMNA según su edad, antes de llamar a la RPC.
 * `null` = puede consentir ella. Sin fecha no se asume nada: se le pide.
 */
export function bloqueoConsentimientoPortal(
  porEdad: ConsentimientoSaludPorEdad,
): { status: number; codigo: 'MENOR_14' | 'FALTA_FECHA_NACIMIENTO'; error: string } | null {
  if (porEdad === 'MENOR') return { status: 403, codigo: 'MENOR_14', error: MENSAJE_MENOR_CONSENTIMIENTO_PORTAL };
  if (porEdad === 'FALTA_FECHA') return { status: 409, codigo: 'FALTA_FECHA_NACIMIENTO', error: MENSAJE_FALTA_FECHA_NACIMIENTO };
  return null;
}

/** Quién firma en mostrador: la propia socia, o su padre, madre o tutor legal. */
export type FirmanteConsentimiento = 'SOCIA' | 'TUTOR_LEGAL';

export type DecisionFirmante =
  | { ok: true; firmante: FirmanteConsentimiento }
  | { ok: false; status: 400; codigo: 'MENOR_EXIGE_TUTOR' | 'FALTA_FIRMANTE'; error: string };

/**
 * Decide en SERVIDOR quién firma el consentimiento registrado desde el panel.
 *
 *  · Menor de 14 según `socios.fecha_nacimiento` → solo su tutor legal; si el
 *    panel dice otra cosa (o nada, un cliente antiguo), se rechaza.
 *  · Adulta con fecha → la propia socia, salvo que se declare tutor legal (una
 *    adulta con tutela también existe).
 *  · Sin fecha → el panel TIENE que declarar quién firma: el personal ve a la
 *    persona delante y es quien responde de esa declaración.
 */
export function decidirFirmantePanel(
  fechaNacimiento: unknown, hoy: Date | string, declarado: unknown,
): DecisionFirmante {
  const porEdad = consentimientoSaludPorEdad(fechaNacimiento, hoy);
  if (porEdad === 'MENOR') {
    return declarado === 'TUTOR_LEGAL'
      ? { ok: true, firmante: 'TUTOR_LEGAL' }
      : {
          ok: false, status: 400, codigo: 'MENOR_EXIGE_TUTOR',
          error: `Esta clienta tiene menos de ${EDAD_MINIMA_CONSENTIMIENTO_SALUD} años: tiene que autorizarlo su padre, madre o tutor legal.`,
        };
  }
  if (declarado === 'TUTOR_LEGAL') return { ok: true, firmante: 'TUTOR_LEGAL' };
  if (porEdad === 'PUEDE' || declarado === 'SOCIA') return { ok: true, firmante: 'SOCIA' };
  return {
    ok: false, status: 400, codigo: 'FALTA_FIRMANTE',
    error: 'No consta su fecha de nacimiento: indica si autoriza la propia clienta o su tutor legal.',
  };
}
