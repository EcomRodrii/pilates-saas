// Tres recompensas de arranque, para que el catálogo vacío no sea un callejón.
//
// ── Por qué existe esto ──────────────────────────────────────────────────────
// Medido en producción: 1320 créditos vivos repartidos entre 20 socias, y CERO
// recompensas en el catálogo. Cero canjes en toda la historia. La maquinaria
// funciona de punta a punta —cobro atómico, stock, idempotencia, clase gratis—
// y no la usa nadie porque el primer paso está en blanco: la pantalla dice «aún
// no hay recompensas» y ahí se acaba.
//
// Mismo criterio que `CREDITOS_SUGERIDOS` para las reglas: un punto de partida,
// no un límite. Lo que se cree es editable y borrable como cualquier otra.
//
// Sin imports con `@/`, para que `node --test` pueda cargarlo.

export interface RecompensaSugerida {
  nombre: string;
  descripcion: string;
  icono: string;
  /** Cuántas asistencias «cuesta», no un precio fijo. Ver `sugerirRecompensas`. */
  clasesEquivalentes: number;
  efecto: 'MANUAL' | 'CLASE_GRATIS';
}

/**
 * ⚠️ El coste NO puede ser un número fijo.
 *
 * Cada estudio decide cuántos créditos da por asistir: en producción hay reglas
 * de 10. Una recompensa «de 500» significa 50 clases con esa regla y 10 con una
 * de 50 — la misma cifra propone premios completamente distintos. Sugerir un
 * número absoluto sería sugerir a ciegas.
 *
 * Así que la sugerencia se expresa en CLASES y el coste se calcula con la regla
 * real del estudio.
 */
export const SUGERENCIAS: RecompensaSugerida[] = [
  {
    nombre: 'Clase invitada',
    descripcion: 'Una clase suelta de regalo. Se le añade sola al canjear.',
    icono: '🎟',
    clasesEquivalentes: 12,
    // La única que se entrega sola: concede una recuperación, que ya es el
    // derecho a una clase suelta en este producto.
    efecto: 'CLASE_GRATIS',
  },
  {
    nombre: 'Botella del estudio',
    descripcion: 'Se la das en recepción.',
    icono: '💧',
    clasesEquivalentes: 5,
    efecto: 'MANUAL',
  },
  {
    nombre: 'Trae a una amiga gratis',
    descripcion: 'Una clase para alguien que aún no es clienta.',
    icono: '👯',
    clasesEquivalentes: 8,
    efecto: 'MANUAL',
  },
];

/** Redondeo a la decena, que es como se leen los precios de una tienda. */
function aDecena(n: number): number {
  return Math.max(10, Math.round(n / 10) * 10);
}

/**
 * Las sugerencias con su coste ya calculado para ESTE estudio.
 *
 * `creditosPorClase` sale de su regla `ASISTENCIA_CLASE`. Sin regla activa no
 * se sugiere nada: proponer recompensas cuando no se gana ningún crédito sería
 * enseñar una tienda a la que nadie puede entrar — primero hay que encender la
 * regla, que es la pantalla de arriba.
 */
export function sugerirRecompensas(creditosPorClase: number | null | undefined): Array<RecompensaSugerida & { costeCreditos: number }> {
  if (!creditosPorClase || creditosPorClase <= 0) return [];
  return SUGERENCIAS.map((s) => ({ ...s, costeCreditos: aDecena(s.clasesEquivalentes * creditosPorClase) }));
}
