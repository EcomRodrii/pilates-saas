// Cuánto del tope de su plan usa un estudio: «128 de 150 clientas activas».
//
// El tope cuenta las clientas con estado «Activa» (lib/clientas/estado.ts), el
// mismo número que «Clientas activas» del Resumen y el chip de Clientas. Hoy se
// ENSEÑA y no bloquea ninguna alta (decisión del 1-oct-2026, `.claude/
// tentare-os.md`), así que aquí no se promete ningún bloqueo: se dice cuántas
// hay y, si se pasa, que se ha pasado.
//
// Puro: se prueba con `node --test`.

export interface UsoTope {
  /** «128 de 150 clientas activas», o «— de 150 …» mientras no se sabe. */
  texto: string;
  /** Ha pasado el tope de su plan. */
  excedido: boolean;
}

/** `null` si su plan no tiene tope (no hay nada que contar contra él). */
export function usoDelTope(activas: number | null, maxSocios: number): UsoTope | null {
  if (!Number.isFinite(maxSocios)) return null;
  const n = activas === null ? '—' : String(activas);
  return { texto: `${n} de ${maxSocios} clientas activas`, excedido: activas !== null && activas > maxSocios };
}
