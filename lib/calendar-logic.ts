// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura de conflictos de calendario (I-1) y validación de aforo (I-2).
//
// Sin React ni Supabase: deterministas y testeables (ver calendar-logic.test.ts).
// La usa el calendario para avisar antes de crear/editar una clase que solaparía
// una sala o una instructora, o que dejaría la clase sobreaforada.
// ─────────────────────────────────────────────────────────────────────────────
import { ausenciaEnFecha } from './ausencias.ts';
import type { AusenciaInstructora } from './api-client.ts';
import type { Instructor } from './types.ts';

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

// Al abrir "nueva clase" para una fecha/hora concreta, el formulario proponía
// siempre la primera sala y la primera instructora de la lista — si esa hora
// ya tenía una clase (de OTRO tipo) en esa misma sala/instructora, la segunda
// clase nacía en conflicto por defecto, sin que la propietaria hubiera elegido
// nada todavía. De una lista de candidatas en orden de preferencia, devuelve
// la primera que esté libre en ese hueco; si todas están ocupadas, la primera
// de todas igualmente (mismo comportamiento que antes: el aviso de conflicto
// ya explica el motivo, no se deja el desplegable vacío).
//
// `ausencias` (opcional, solo aplica a campo='instructorId'): antes esta
// función solo miraba solapes con OTRAS clases — podía preseleccionar a una
// instructora de vacaciones sin más aviso que un sufijo de texto en el
// desplegable (fácil de no ver). Ahora una instructora con ausencia vigente
// en `inicio` cuenta como "no libre" igual que un solape de horario.
export function elegirLibre(
  candidatas: string[],
  campo: 'salaId' | 'instructorId',
  inicio: string,
  fin: string,
  existentes: SlotSesion[],
  ausencias: AusenciaInstructora[] = [],
): string {
  if (candidatas.length === 0) return '';
  const libre = candidatas.find(id =>
    !existentes.some(s => !s.cancelada && s[campo] === id && solapan(inicio, fin, s.inicio, s.fin)) &&
    (campo !== 'instructorId' || !ausenciaEnFecha(ausencias, id, inicio)),
  );
  return libre ?? candidatas[0];
}

// I-2: ¿bajar el aforo a `nuevoAforo` deja plazas confirmadas fuera? Devuelve
// cuántas confirmadas exceden el nuevo aforo (0 = sin problema).
export function plazasSobrantesTrasAforo(confirmadas: number, nuevoAforo: number): number {
  return Math.max(0, confirmadas - nuevoAforo);
}

// Auditoría integral 2026-08-21 (arquitectura, hallazgo P1): vivía como
// función anidada dentro de app/(dashboard)/calendario/page.tsx
// ("candidataParaSustitucion"), imposible de testear sin renderizar la
// pantalla entera. Extraída aquí, al lado de `elegirLibre` (que envuelve
// directamente), en vez de en lib/sustituciones/ — no depende de ese motor
// (afinidad/encaje/disponibilidad), solo de la lógica de solape/ausencia que
// ya vive en este mismo módulo, y moverla a sustituciones/ acoplaría ese
// dominio con `SlotSesion`, un tipo puramente de calendario.
//
// "Mejor candidata" para CUBRIR una clase: primera instructora activa sin
// ausencia ni solape a esa hora. La ausencia se filtra ANTES de llamar a
// `elegirLibre` (no pasándola como su parámetro `ausencias`) a propósito:
// el fallback de `elegirLibre` cuando nadie está libre es devolver la
// PRIMERA candidata de la lista tal cual — si una instructora ausente
// siguiera en esa lista, podría salir como "candidata" pese a estar de
// vacaciones. La RPC de confirmar sustitución re-valida solape real de
// todas formas, así que un acierto parcial aquí nunca cuela una sustituta
// realmente ocupada — esto es solo la sugerencia que ve la propietaria.
export function candidataParaSustitucion(
  s: { instructorId: string; inicio: string; fin: string },
  instructoresActivos: Instructor[],
  ausencias: AusenciaInstructora[],
  existentesSlot: SlotSesion[],
): Instructor | null {
  const candidatos = instructoresActivos
    .filter(i => i.id !== s.instructorId)
    .filter(i => !ausenciaEnFecha(ausencias, i.id, s.inicio))
    .map(i => i.id);
  if (candidatos.length === 0) return null;
  const libreId = elegirLibre(candidatos, 'instructorId', s.inicio, s.fin, existentesSlot);
  return instructoresActivos.find(i => i.id === libreId) ?? null;
}
