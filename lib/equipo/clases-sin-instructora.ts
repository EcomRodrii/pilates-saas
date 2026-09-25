// RES-8 — clases futuras de una instructora dada de baja.
//
// Regla del fundador (25-sep-2026): dar de baja a alguien NUNCA cancela solas
// sus clases con alumnas. Las clases futuras quedan marcadas «Instructor/a no
// disponible» y pasan a la bandeja del estudio, que decide por clase o por
// serie: reasignar, cancelar o mantener sin instructora. La baja borra su
// disponibilidad futura (ya no es candidata a nada: los listados filtran por
// `activo`), pero no toca las reservas de las alumnas.
//
// Sin columna nueva: «no disponible» se DERIVA de `instructores.activo = false`
// sobre una clase futura sin cancelar. Al reasignarla, dejarla sin instructora
// (`instructor_id = null`) o cancelarla, deja de cumplirse sola — no hay estado
// que mantener ni que pueda quedarse colgado.

export const ETIQUETA_INSTRUCTORA_NO_DISPONIBLE = 'Instructor/a no disponible';

export interface SesionParaBaja {
  id: string;
  instructorId: string;
  inicio: string;
  cancelada: boolean;
  serieId?: string | null;
}

export interface InstructoraParaBaja {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface GrupoClasesSinInstructora {
  instructorId: string;
  nombre: string;
  sesiones: SesionParaBaja[];
}

/** Clases futuras sin cancelar cuya instructora está de baja, agrupadas por ella. */
export function clasesSinInstructora(
  sesiones: readonly SesionParaBaja[],
  instructoras: readonly InstructoraParaBaja[],
  ahora: Date,
): GrupoClasesSinInstructora[] {
  const deBaja = new Map(instructoras.filter((i) => !i.activo).map((i) => [i.id, i.nombre]));
  if (deBaja.size === 0) return [];
  const t = ahora.getTime();
  const grupos = new Map<string, GrupoClasesSinInstructora>();
  for (const s of sesiones) {
    if (s.cancelada || !s.instructorId || !deBaja.has(s.instructorId)) continue;
    if (new Date(s.inicio).getTime() <= t) continue;
    const g = grupos.get(s.instructorId)
      ?? { instructorId: s.instructorId, nombre: deBaja.get(s.instructorId)!, sesiones: [] };
    g.sesiones.push(s);
    grupos.set(s.instructorId, g);
  }
  for (const g of grupos.values()) g.sesiones.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Nombre a enseñar en una clase: el suyo, o la etiqueta si la instructora está de baja. */
export function nombreInstructoraDeClase(
  instructorId: string | null | undefined,
  instructoras: readonly InstructoraParaBaja[],
): string | null {
  if (!instructorId) return null;
  const i = instructoras.find((x) => x.id === instructorId);
  if (!i) return null;
  return i.activo ? i.nombre : ETIQUETA_INSTRUCTORA_NO_DISPONIBLE;
}
