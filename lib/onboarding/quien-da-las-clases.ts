// ─────────────────────────────────────────────────────────────────────────────
// «¿Quién da las clases?» en el primer horario.
//
// El cuello de botella que destapó el fundador (24-sep): la propietaria llega
// al calendario vacío, acepta el horario propuesto y las clases se crean SIN
// instructora —el estudio nuevo de ese día tenía 80 clases y 0 instructoras—,
// con lo que la primera pantalla que ve tras «crear clases» ya trae avisos que
// no entiende. La propuesta solo asignaba a alguien si el equipo era ya UNA
// persona; con equipo vacío (dijo «no doy clases yo» en el asistente, o se lo
// saltó) no preguntaba nada.
//
// Aquí vive la regla de cuándo hay que preguntar y con qué se puede seguir.
// Pura, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type QuienDaLasClases = 'yo' | 'otra' | 'luego';

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 80;

/** El nombre que se guardará como ficha, o null si no sirve. */
export function nombreDeInstructora(texto: string): string | null {
  const n = texto.replace(/\s+/g, ' ').trim();
  return n.length >= NOMBRE_MIN && n.length <= NOMBRE_MAX ? n : null;
}

/**
 * ¿Falta contestar quién da las clases? Solo con el equipo VACÍO y sin nadie ya
 * elegido en esta pantalla: con una instructora la propuesta ya la usa, y con
 * varias repartirlas es decisión de la propietaria (no se inventa).
 */
export function hayQuePreguntarQuien(p: {
  puedeCrear: boolean;
  sinEquipo: boolean;
  instructoraYaElegida: string | null;
}): boolean {
  return p.puedeCrear && p.sinEquipo && p.instructoraYaElegida == null;
}

/** ¿Se puede pulsar «Ver el horario propuesto» en cuanto a esta pregunta? */
export function quienContestado(quien: QuienDaLasClases | null, nombreOtra: string): boolean {
  if (quien == null) return false;
  if (quien === 'otra') return nombreDeInstructora(nombreOtra) != null;
  return true;
}
