// La sala que se propone al programar un tipo de clase: la que ya usa más en el
// calendario (el estudio no tiene un campo «sala habitual» y no hace falta uno:
// lo que ya programó dice dónde da cada clase). Sin historial, la primera sala.
// Es solo el punto de partida: quien programa la cambia con un toque.

interface Slot { salaId: string | null; tipoClaseId?: string | null }

export function salaHabitualDelTipo(
  existentes: readonly Slot[],
  tipoClaseId: string,
  salas: readonly { id: string }[],
): string {
  const vivas = new Set(salas.map(s => s.id));
  const cuenta = new Map<string, number>();
  for (const s of existentes) {
    if (s.tipoClaseId !== tipoClaseId || !s.salaId || !vivas.has(s.salaId)) continue;
    cuenta.set(s.salaId, (cuenta.get(s.salaId) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let max = 0;
  // Empata la primera de la lista de salas, para que el resultado no dependa del orden de las clases.
  for (const sala of salas) {
    const n = cuenta.get(sala.id) ?? 0;
    if (n > max) { mejor = sala.id; max = n; }
  }
  return mejor ?? salas[0]?.id ?? '';
}
