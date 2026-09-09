import type { Clase } from './tipos.ts';
import { enCursoEn } from '../calendario-estado.ts';

// El estado TEMPORAL de una clase tal como lo ve la alumna: si se está dando
// ahora mismo o si ya pasó. Nada de plazas ni de reservas — eso es
// `disponibilidad()` en `maquina-reserva.ts`, que a propósito no sabe nada del
// reloj.
//
// La regla no se escribe aquí: se toma de `enCursoEn` (`lib/calendario-estado.ts`),
// la MISMA que usa `estadoSesion` para pintar «En curso» en el panel. Tener el
// criterio en dos sitios es cómo se acaba con la propietaria y la alumna viendo
// estados distintos de la misma clase a la misma hora.
//
// `ahoraMs === null` significa «todavía no hay reloj» (ver `useAhoraMs`): el
// servidor no pinta hora. En ese caso las dos funciones dicen `false`, que es la
// respuesta prudente — se pinta la clase como siempre y el estado aparece en
// cuanto el cliente hidrata. Nunca `Date.now()` de reserva: eso es exactamente
// el desajuste de hidratación que `useAhoraMs` existe para evitar.

/** ¿Se está dando ahora mismo? Fin exclusivo: a las 16:55 una clase de 16:00-16:55 ya no. */
export function estaEnCurso(c: Pick<Clase, 'inicio' | 'fin'>, ahoraMs: number | null): boolean {
  if (ahoraMs === null) return false;
  return enCursoEn(c.inicio, c.fin, new Date(ahoraMs));
}

/** ¿Ya terminó? Lo que hace que «tu próxima clase» no pueda ser una de esta mañana. */
export function yaTermino(c: Pick<Clase, 'fin'>, ahoraMs: number | null): boolean {
  if (ahoraMs === null) return false;
  return ahoraMs >= new Date(c.fin).getTime();
}
