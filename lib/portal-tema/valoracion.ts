// Cuándo se puede enseñar una valoración, y cómo se escribe.
//
// ⚠️ La regla es NO ENSEÑARLA casi nunca. Con dos valoraciones —que es lo que
// hay hoy en toda la base de datos, las dos de 5— un «5,0 ★» dice que esa
// instructora es perfecta cuando lo que pasa es que la han puntuado dos veces.
// Es el mismo fallo que la tarjeta de sustituciones, que enseñaba
// «Compatibilidad 87 %» salido de un `clamp(score, 55, 99)`: un número con
// aspecto de dato y sin dato detrás.
//
// Por debajo del mínimo no se pinta NADA. No un «Sin valoraciones», ni un «—»,
// ni estrellas vacías: un hueco vacío en la ficha invita a leerlo como «mala»,
// que es peor que no decir nada.

/**
 * Cuántas valoraciones hacen falta para enseñar la nota.
 *
 * Cinco es el mismo mínimo que ya usa `MUESTRA_MINIMA` en el motor de decisión
 * (`lib/decision/prediccion.ts`) para no dar una probabilidad: mismo criterio
 * para el mismo problema, en vez de dos números distintos según la pantalla.
 */
export const MINIMO_VALORACIONES = 5;

export interface ValoracionInstructora {
  /** Media de 1 a 5. */
  media: number;
  /** Cuántas la sostienen. Se enseña SIEMPRE junto a la media. */
  total: number;
}

export interface ValoracionEnPantalla {
  /** «4,6» — con coma, que es como se escriben los decimales en español. */
  nota: string;
  /** «(12 valoraciones)». Nunca va sola la nota. */
  respaldo: string;
}

/**
 * Qué enseñar. `null` = nada, y quien lo pinte no dibuja el hueco.
 *
 * El respaldo NO es opcional: una nota sin el número de valoraciones detrás es
 * exactamente el número sin dato que este repo ya ha pagado una vez.
 */
/**
 * La nota del ESTUDIO, agregando la de todas sus instructoras — no una query
 * nueva: reconstruye `puntos` desde `media * total` de cada una (ya sin
 * redondear, `lib/db/supabase-data-admin.ts` guarda la media cruda), así que
 * no hace falta releer `valoraciones` fila a fila para sumar el estudio
 * entero. Mismo criterio de "por debajo del mínimo no se enseña nada" — se
 * evalúa con `valoracionParaPantalla` como cualquier otra, no con un umbral
 * propio.
 */
export function valoracionEstudio(
  instructores: { valoracion?: ValoracionInstructora | null }[],
): ValoracionInstructora | null {
  let puntos = 0;
  let total = 0;
  for (const i of instructores) {
    if (!i.valoracion || i.valoracion.total <= 0) continue;
    puntos += i.valoracion.media * i.valoracion.total;
    total += i.valoracion.total;
  }
  return total > 0 ? { media: puntos / total, total } : null;
}

export function valoracionParaPantalla(
  v: ValoracionInstructora | null | undefined,
  minimo: number = MINIMO_VALORACIONES,
): ValoracionEnPantalla | null {
  if (!v || v.total < minimo) return null;
  // Un decimal: «4,63» finge una precisión que 12 opiniones no tienen.
  const nota = (Math.round(v.media * 10) / 10).toFixed(1).replace('.', ',');
  return {
    nota,
    respaldo: `${v.total} ${v.total === 1 ? 'valoración' : 'valoraciones'}`,
  };
}
