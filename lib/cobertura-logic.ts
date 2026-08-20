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
  // P2 (auditoría "Veredicto de Marta"): antes de esto, la única señal era el
  // ranking por historial — nada decía si la candidata ya tenía el resto del
  // día ocupado. `noDisponibles` ya descarta a quien SOLAPA con esta franja,
  // así que todo el mundo aquí PUEDE cubrirla; esto es contexto extra sobre
  // el resto de su jornada, ordenado cronológicamente, sin la propia sesión a
  // cubrir ni las canceladas.
  otrasClasesHoy: { inicio: string; fin: string }[];
}

export function candidatosCobertura(
  sesion: { id?: string; instructorId: string; tipoClaseId: string; inicio: string },
  sesiones: readonly { id?: string; instructorId: string; tipoClaseId: string; cancelada: boolean; inicio: string; fin: string }[],
  instructores: readonly { id: string; nombre: string; telefono: string | null; activo: boolean }[],
  // Instructoras que NO pueden cubrir esta franja: ausentes ese día (vacaciones/
  // baja) o ya ocupadas con otra clase que solapa. Se calcula en la superficie (que
  // tiene ausencias + horarios) y se pasa aquí para no proponerlas — asignar a una
  // ocupada viola `sesiones_instructor_sin_solape` (0048) y el error se tragaba.
  noDisponibles?: ReadonlySet<string>,
): CandidatoCobertura[] {
  const vecesPorInstructor = new Map<string, number>();
  for (const s of sesiones) {
    if (s.cancelada || s.tipoClaseId !== sesion.tipoClaseId) continue;
    vecesPorInstructor.set(s.instructorId, (vecesPorInstructor.get(s.instructorId) ?? 0) + 1);
  }

  // Mismo criterio que el resto del repo para "mismo día" sobre un ISO local
  // (nunca toISOString/UTC: cerca de medianoche saltaría de día).
  const diaSesion = sesion.inicio.slice(0, 10);
  const otrasClasesPorInstructor = new Map<string, { inicio: string; fin: string }[]>();
  for (const s of sesiones) {
    // `sesion.id !== undefined &&` primero: sin él, dos filas sin `id` (ambos
    // `undefined`) se excluirían entre sí por accidente.
    if (s.cancelada || (sesion.id !== undefined && s.id === sesion.id) || s.inicio.slice(0, 10) !== diaSesion) continue;
    const arr = otrasClasesPorInstructor.get(s.instructorId) ?? [];
    arr.push({ inicio: s.inicio, fin: s.fin });
    otrasClasesPorInstructor.set(s.instructorId, arr);
  }
  for (const arr of otrasClasesPorInstructor.values()) arr.sort((a, b) => a.inicio.localeCompare(b.inicio));

  return instructores
    .filter(i => i.activo && i.id !== sesion.instructorId && !noDisponibles?.has(i.id))
    .map(i => ({
      instructorId: i.id,
      nombre: i.nombre,
      telefono: i.telefono,
      vecesImpartida: vecesPorInstructor.get(i.id) ?? 0,
      otrasClasesHoy: otrasClasesPorInstructor.get(i.id) ?? [],
    }))
    .sort((a, b) => b.vecesImpartida - a.vecesImpartida);
}
