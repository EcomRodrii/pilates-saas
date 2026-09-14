// Sustitución agotada → profesional de Tentare Network → clase asignada.
//
// Decisión del fundador: Tentare propone, la propietaria pide con un toque
// (#1979), la profesional acepta, se formaliza por el flujo que ya existía
// (ficha `temporal` en el equipo, visible en Equipo y en la liquidación) y
// entonces se le asigna la clase por la MISMA vía que a cualquier instructora
// (`PATCH /api/sustituciones` action 'confirmar').
//
// Aquí vive solo lo puro: en qué punto de ese camino está cada profesional
// propuesta, derivado de filas reales. Quien carga las filas es
// `GET /api/sustituciones`; quien lo pinta, `PropuestasNetwork`.

export type EstadoCoberturaNetwork =
  /** Nadie le ha pedido nada (o lo que pasó no tiene que ver con esta clase). */
  | { tipo: 'sin-solicitud' }
  /** Hay una solicitud pendiente. `paraEstaClase` = se pidió desde esta sustitución. */
  | { tipo: 'solicitada'; paraEstaClase: boolean }
  /** Dijo que no a la solicitud de ESTA clase. */
  | { tipo: 'rechazada' }
  /** Aceptó el contacto pero todavía no tiene ficha en el equipo: toca formalizar. */
  | { tipo: 'aceptada'; solicitudId: string }
  /** Tiene ficha activa en este estudio: se le puede asignar la clase. */
  | { tipo: 'asignable'; instructorId: string }
  /** Es la propia instructora que da la baja: no puede cubrirse a sí misma. */
  | { tipo: 'titular' };

export interface SolicitudCobertura {
  id: string;
  perfil_id: string;
  estado: string;
  creado_en: string;
  /** Ausente mientras la migración 20260914113000 no esté aplicada. */
  sustitucion_id?: string | null;
}

export interface InstructorCobertura {
  id: string;
  auth_user_id: string | null;
  activo: boolean | null;
  rol?: string | null;
}

/**
 * Estado de UNA profesional frente a UNA sustitución.
 *
 * `instructor` es su ficha en ESTE estudio (misma `auth_user_id`), si la hay.
 * Tener ficha activa manda sobre la solicitud: da igual si llegó por Network o
 * ya estaba en el equipo, `confirmar_sustitucion` solo exige eso.
 */
export function estadoCoberturaNetwork(params: {
  sustitucionId: string;
  instructorOriginalId: string | null;
  solicitudes: SolicitudCobertura[];
  instructor: InstructorCobertura | null;
}): EstadoCoberturaNetwork {
  const { sustitucionId, instructorOriginalId, instructor } = params;

  // `activo` NULL cuenta como activa (mismo `coalesce(activo, true)` que la RPC).
  // Recepción no imparte clases (`imparteClases`, lib/equipo.ts).
  if (instructor && instructor.activo !== false && (instructor.rol ?? 'INSTRUCTOR') !== 'RECEPCION') {
    if (instructor.id === instructorOriginalId) return { tipo: 'titular' };
    return { tipo: 'asignable', instructorId: instructor.id };
  }

  const recientes = [...params.solicitudes].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  const aceptada = recientes.find(s => s.estado === 'aceptada');
  if (aceptada) return { tipo: 'aceptada', solicitudId: aceptada.id };

  const pendiente = recientes.find(s => s.estado === 'pendiente');
  if (pendiente) return { tipo: 'solicitada', paraEstaClase: pendiente.sustitucion_id === sustitucionId };

  // Un «no» solo cierra la puerta para la clase por la que se le preguntó. Uno
  // antiguo (del buscador, de otra baja, o de antes de guardar la clase) no
  // impide volver a pedírselo para esta.
  const ultima = recientes[0];
  if (ultima?.estado === 'rechazada' && ultima.sustitucion_id === sustitucionId) return { tipo: 'rechazada' };

  return { tipo: 'sin-solicitud' };
}

/**
 * Estados de todas las profesionales propuestas en una sustitución, por
 * `perfilId`. Las filas llegan ya acotadas al estudio de la sesión.
 */
export function estadosCoberturaPorPerfil(params: {
  sustitucionId: string;
  instructorOriginalId: string | null;
  perfilIds: string[];
  perfiles: Array<{ id: string; auth_user_id: string | null }>;
  solicitudes: SolicitudCobertura[];
  instructores: InstructorCobertura[];
}): Record<string, EstadoCoberturaNetwork> {
  const authPorPerfil = new Map(params.perfiles.map(p => [p.id, p.auth_user_id]));
  const out: Record<string, EstadoCoberturaNetwork> = {};
  for (const perfilId of params.perfilIds) {
    const authUserId = authPorPerfil.get(perfilId) ?? null;
    // Varias fichas de la misma persona en el estudio no deberían existir
    // (UNIQUE(auth_user_id, studio_id)); si pasara, gana una activa.
    const fichas = authUserId ? params.instructores.filter(i => i.auth_user_id === authUserId) : [];
    const instructor = fichas.find(i => i.activo !== false) ?? fichas[0] ?? null;
    out[perfilId] = estadoCoberturaNetwork({
      sustitucionId: params.sustitucionId,
      instructorOriginalId: params.instructorOriginalId,
      solicitudes: params.solicitudes.filter(s => s.perfil_id === perfilId),
      instructor,
    });
  }
  return out;
}

/**
 * ¿Este error de PostgREST es «la columna `sustitucion_id` todavía no existe»?
 * 42703 al leer (`undefined_column`), PGRST204 al escribir con la caché de
 * esquema. Solo esa columna: cualquier otro error es un error de verdad.
 */
export function faltaColumnaSustitucion(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code !== '42703' && error.code !== 'PGRST204') return false;
  return /sustitucion_id/.test(error.message ?? '');
}
