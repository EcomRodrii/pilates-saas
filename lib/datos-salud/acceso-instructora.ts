// ─────────────────────────────────────────────────────────────────────────────
// ¿Puede este rol ver la salud de ESTA socia?
//
// Decisión de producto (auditoría RGPD 2026-09-13): la PROPIETARIA ve la salud
// de todas las socias de su estudio; una INSTRUCTORA solo la de SUS alumnas —
// socias con una reserva no cancelada en una clase no cancelada que ella
// imparte, o una cita no cancelada con ella, entre hace 30 días y dentro de 30
// días (ambos extremos incluidos). RECEPCIÓN y MANAGER no ven detalle clínico.
//
// Es la versión TS de `public.instructora_atiende_socia()` (migr
// 20260913214116), para las rutas que leen o reenvían salud con service-role,
// donde la RLS no se aplica. Las dos tienen que decir lo mismo: si cambias la
// ventana o los estados aquí, cámbialos en SQL (y al revés).
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export const VENTANA_ALUMNA_DIAS = 30;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Una reserva (con los datos de su clase) o una cita de la socia. */
export interface ClaseOCitaDeSocia {
  inicio: string;
  /** Estado de la reserva o de la cita. */
  estado: string;
  /** Quién imparte la clase o atiende la cita. */
  instructorId: string | null;
  /** Solo clases: la sesión entera se canceló. */
  cancelada?: boolean | null;
}

export function dentroDeVentanaAlumna(inicioIso: string, ahora: Date, dias = VENTANA_ALUMNA_DIAS): boolean {
  const t = Date.parse(inicioIso);
  if (Number.isNaN(t)) return false;
  const margen = dias * DIA_MS;
  return t >= ahora.getTime() - margen && t <= ahora.getTime() + margen;
}

export function instructoraAtiendeSocia(
  filas: readonly ClaseOCitaDeSocia[],
  instructorId: string | null | undefined,
  ahora: Date,
): boolean {
  if (!instructorId) return false;
  return filas.some(f =>
    f.instructorId === instructorId
    && f.estado !== 'CANCELADA'
    && f.cancelada !== true
    && dentroDeVentanaAlumna(f.inicio, ahora),
  );
}

export type AccesoSaludSocia = 'PERMITIDO' | 'SIN_ROL_CLINICO' | 'NO_ES_SU_ALUMNA';

/**
 * `atiende` solo se mira para INSTRUCTOR. Falla cerrado: un rol desconocido o
 * ausente no ve nada.
 */
export function accesoSaludSocia(rol: string | null | undefined, atiende: boolean): AccesoSaludSocia {
  if (rol === 'PROPIETARIO') return 'PERMITIDO';
  if (rol === 'INSTRUCTOR') return atiende ? 'PERMITIDO' : 'NO_ES_SU_ALUMNA';
  return 'SIN_ROL_CLINICO';
}

export const MENSAJE_NO_ES_SU_ALUMNA =
  `Solo puedes ver y registrar datos de salud de las alumnas de tus clases (de los últimos ${VENTANA_ALUMNA_DIAS} días o de los próximos ${VENTANA_ALUMNA_DIAS}). Si necesitas esta ficha, pídesela a la dirección del estudio.`;

export const MENSAJE_SIN_ROL_CLINICO = 'No tienes permiso para ver datos de salud.';

export function mensajeAccesoSalud(acceso: AccesoSaludSocia): string | null {
  if (acceso === 'NO_ES_SU_ALUMNA') return MENSAJE_NO_ES_SU_ALUMNA;
  if (acceso === 'SIN_ROL_CLINICO') return MENSAJE_SIN_ROL_CLINICO;
  return null;
}
