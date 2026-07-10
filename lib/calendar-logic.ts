// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura de conflictos de calendario (I-1) y validación de aforo (I-2).
//
// Sin React ni Supabase: deterministas y testeables (ver calendar-logic.test.ts).
// La usa el calendario para avisar antes de crear/editar una clase que solaparía
// una sala o una instructora, o que dejaría la clase sobreaforada.
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotSesion {
  id?: string;
  salaId: string | null;
  instructorId: string | null;
  inicio: string;
  fin: string;
  cancelada?: boolean;
}

// Dos intervalos [aIni,aFin) y [bIni,bFin) se solapan si empiezan antes de que
// el otro acabe. Se comparan en milisegundos (robusto ante formatos ISO mixtos).
export function solapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  const a0 = new Date(aIni).getTime(), a1 = new Date(aFin).getTime();
  const b0 = new Date(bIni).getTime(), b1 = new Date(bFin).getTime();
  if ([a0, a1, b0, b1].some(Number.isNaN)) return false;
  return a0 < b1 && b0 < a1;
}

// Clases existentes que chocan con la candidata: misma sala u misma instructora
// solapando en el tiempo. Excluye canceladas y la propia clase (excluirId, al
// editar). Devuelve las listas por separado para poder avisar de cada motivo.
export function detectarConflictos(
  candidata: { salaId: string | null; instructorId: string | null; inicio: string; fin: string },
  existentes: SlotSesion[],
  excluirId?: string,
): { sala: SlotSesion[]; instructor: SlotSesion[] } {
  const sala: SlotSesion[] = [];
  const instructor: SlotSesion[] = [];
  for (const s of existentes) {
    if (s.cancelada) continue;
    if (excluirId && s.id === excluirId) continue;
    if (!solapan(candidata.inicio, candidata.fin, s.inicio, s.fin)) continue;
    if (candidata.salaId && s.salaId === candidata.salaId) sala.push(s);
    if (candidata.instructorId && s.instructorId === candidata.instructorId) instructor.push(s);
  }
  return { sala, instructor };
}

export function hayConflicto(c: { sala: SlotSesion[]; instructor: SlotSesion[] }): boolean {
  return c.sala.length > 0 || c.instructor.length > 0;
}

// I-2: ¿bajar el aforo a `nuevoAforo` deja plazas confirmadas fuera? Devuelve
// cuántas confirmadas exceden el nuevo aforo (0 = sin problema).
export function plazasSobrantesTrasAforo(confirmadas: number, nuevoAforo: number): number {
  return Math.max(0, confirmadas - nuevoAforo);
}
