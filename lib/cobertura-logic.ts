// Sustitución de instructora cuando no puede dar una clase ya programada
// (típicamente avisa con poca antelación). Objetivo: que el dueño no tenga que
// pensar a quién preguntar — se ordenan las instructoras activas por cuántas
// veces han impartido YA ese mismo tipo de clase, para proponer primero a
// quien más la conoce. Puro y sin IO: nada de mensajería automática aquí, solo
// el ranking; el envío es un enlace wa.me que abre el propio dueño/instructora.

export interface CandidatoCobertura {
  instructorId: string;
  nombre: string;
  telefono: string | null;
  vecesImpartida: number;
}

export function candidatosCobertura(
  sesion: { instructorId: string; tipoClaseId: string },
  sesiones: readonly { instructorId: string; tipoClaseId: string; cancelada: boolean }[],
  instructores: readonly { id: string; nombre: string; telefono: string | null; activo: boolean }[],
): CandidatoCobertura[] {
  const vecesPorInstructor = new Map<string, number>();
  for (const s of sesiones) {
    if (s.cancelada || s.tipoClaseId !== sesion.tipoClaseId) continue;
    vecesPorInstructor.set(s.instructorId, (vecesPorInstructor.get(s.instructorId) ?? 0) + 1);
  }

  return instructores
    .filter(i => i.activo && i.id !== sesion.instructorId)
    .map(i => ({
      instructorId: i.id,
      nombre: i.nombre,
      telefono: i.telefono,
      vecesImpartida: vecesPorInstructor.get(i.id) ?? 0,
    }))
    .sort((a, b) => b.vecesImpartida - a.vecesImpartida);
}
