// Los campos de una sala tal y como se escriben en `salas`. Puro (sin `@/`) para
// poder probarlo: lib/sala-cambios.test.ts.
//
// ⚠️ `foto_url` va también. El panel deja poner la «Imagen de la sala» y la app de
// la alumna la lee (`mapSala`), pero no se escribía: la sala se guardaba sin ella
// y al recargar había desaparecido (ninguna sala la tenía en producción,
// 5-oct-2026).

export interface SalaEditable {
  nombre?: string;
  capacidad?: number;
  color?: string;
  fotoUrl?: string | null;
}

/** La imagen tal y como se guarda: sin espacios, y vacía = sin imagen. */
export function fotoSalaParaGuardar(v: string | null | undefined): string | null {
  return v?.trim() || null;
}

/** Los cambios de una sala, en columnas. Solo lo que viene en `changes`. */
export function salaCambiosToDb(changes: SalaEditable): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('capacidad' in changes) db.capacidad = changes.capacidad;
  if ('color' in changes) db.color = changes.color;
  if ('fotoUrl' in changes) db.foto_url = fotoSalaParaGuardar(changes.fotoUrl);
  return db;
}
