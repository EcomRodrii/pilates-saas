// Solicitudes de derechos RGPD de una socia (tabla `solicitudes_derechos`,
// migr 20260913171000).
//
// La alumna EXPORTA sus datos al momento, pero suprimir, limitar u oponerse es
// una SOLICITUD al estudio —el responsable del tratamiento—, que tiene un plazo
// para responder y la ejecuta desde el panel. Aquí vive la regla pura, sin I/O,
// que comparten las dos rutas (portal y panel) y la UI.

import { fechaCortaEstudio } from '../utils.ts';

export const TIPOS_SOLICITUD = ['supresion', 'oposicion', 'limitacion'] as const;
export type TipoSolicitudDerechos = (typeof TIPOS_SOLICITUD)[number];
export type EstadoSolicitudDerechos = 'pendiente' | 'resuelta' | 'rechazada';

/** El mismo plazo que fija el DEFAULT de la columna `plazo_hasta`. */
export const PLAZO_SOLICITUD_DIAS = 30;
/** Tope de la nota: es una explicación, no un expediente. */
export const NOTA_MAX = 1000;

export function esTipoSolicitud(v: unknown): v is TipoSolicitudDerechos {
  return typeof v === 'string' && (TIPOS_SOLICITUD as readonly string[]).includes(v);
}

export interface SolicitudDerechosVista {
  id: string;
  socioId: string;
  tipo: TipoSolicitudDerechos;
  estado: EstadoSolicitudDerechos;
  solicitadaEn: string;
  plazoHasta: string;
  resueltaEn: string | null;
  nota: string | null;
}

export function mapSolicitudDerechos(r: Record<string, unknown>): SolicitudDerechosVista {
  return {
    id: String(r.id),
    socioId: String(r.socio_id),
    tipo: r.tipo as TipoSolicitudDerechos,
    estado: (r.estado as EstadoSolicitudDerechos | null) ?? 'pendiente',
    solicitadaEn: String(r.solicitada_en),
    plazoHasta: String(r.plazo_hasta),
    resueltaEn: (r.resuelta_en as string | null) ?? null,
    nota: (r.nota as string | null) ?? null,
  };
}

/** Lo que pide, dicho como lo leería quien lo gestiona. */
export function etiquetaTipoSolicitud(tipo: TipoSolicitudDerechos): string {
  if (tipo === 'supresion') return 'Eliminación de sus datos';
  if (tipo === 'limitacion') return 'Limitación del uso de sus datos';
  return 'Oposición al uso de sus datos';
}

/**
 * Días naturales que quedan hasta el plazo (redondeo hacia arriba: con 3 h
 * por delante todavía queda «1 día»). Negativo = vencido.
 */
export function diasHastaPlazo(plazoHasta: string, ahora: Date): number {
  const ms = new Date(plazoHasta).getTime() - ahora.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** «Quedan 12 días (hasta el 13 de octubre)» / «Plazo vencido hace 2 días». */
export function textoPlazo(plazoHasta: string, ahora: Date): string {
  const dias = diasHastaPlazo(plazoHasta, ahora);
  if (dias < 0) return `Plazo vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`;
  return `Quedan ${dias} ${dias === 1 ? 'día' : 'días'} (hasta el ${fechaCortaEstudio(plazoHasta)})`;
}

export type CierreValidado =
  | { ok: true; estado: 'resuelta' | 'rechazada'; nota: string | null }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Decide si una solicitud se puede cerrar así. Espejo en TS de la policy
 * `solicitudes_derechos_resolver` y de los CHECK de la tabla: la ruta escribe
 * con service-role, que se salta la RLS, así que la regla tiene que valer
 * también aquí.
 *
 * - Solo se cierra una PENDIENTE (una resuelta o rechazada no se reabre).
 * - Rechazar exige nota (p. ej. «hay facturas que la ley obliga a conservar»).
 * - Una supresión solo se da por RESUELTA si la socia ya está suprimida: marcar
 *   hecho lo que no se ha hecho es exactamente el tipo de mentira que no puede
 *   dejar pasar un registro que sirve de prueba.
 */
export function validarCierreSolicitud(
  entrada: { accion?: unknown; nota?: unknown },
  solicitud: { tipo: TipoSolicitudDerechos; estado: EstadoSolicitudDerechos },
  sociaSuprimida: boolean,
): CierreValidado {
  const accion = entrada.accion;
  if (accion !== 'resolver' && accion !== 'rechazar') {
    return { ok: false, status: 400, error: 'Acción no válida.' };
  }
  const nota = typeof entrada.nota === 'string' ? entrada.nota.trim() : '';
  if (nota.length > NOTA_MAX) {
    return { ok: false, status: 400, error: `La nota no puede pasar de ${NOTA_MAX} caracteres.` };
  }
  if (solicitud.estado !== 'pendiente') {
    return { ok: false, status: 409, error: 'Esta solicitud ya estaba cerrada.' };
  }
  if (accion === 'rechazar') {
    if (!nota) return { ok: false, status: 400, error: 'Para rechazar una solicitud hay que explicar el motivo.' };
    return { ok: true, estado: 'rechazada', nota };
  }
  if (solicitud.tipo === 'supresion' && !sociaSuprimida) {
    return { ok: false, status: 409, error: 'Primero hay que ejecutar la supresión de sus datos.' };
  }
  return { ok: true, estado: 'resuelta', nota: nota || null };
}
