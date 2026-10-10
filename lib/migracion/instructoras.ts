// Nombres que NO son una instructora aunque estén en la columna de instructora.
//
// El importador del horario da de alta las instructoras que no existen. Un export
// real trae en esa columna cosas como «-», «N/A» o «Sin asignar» para las clases
// sin nadie; darlas de alta habría llenado Equipo de «instructoras» llamadas
// «N/A». Se salta lo que no es un nombre de persona y esas filas entran sin
// instructora, como antes.

const RE_SIN_NOMBRE = /^(?:[-–—_.?*/\\\s]+|n\/?a|na|null|none|ninguna?|nadie|tbd|tba|sin\s+(?:asignar|instructor[a]?|profesor[a]?|nombre|definir)|por\s+(?:asignar|definir|confirmar)|a\s+(?:asignar|definir|confirmar)|pendiente|vac[ií]a?|staff|equipo|estudio)$/i;

/** Instructoras nuevas que un solo import puede dar de alta: un estudio real tiene decenas, no cientos. */
export const MAX_INSTRUCTORAS_NUEVAS = 50;

/** Más largo que esto no es un nombre: es un texto pegado por error. */
export const MAX_LONGITUD_NOMBRE_INSTRUCTORA = 80;

/**
 * ¿Es un nombre de persona con el que dar de alta a una instructora? Una celda con
 * VARIAS personas («Ana / Marta», «Ana, Marta», «Ana y Marta», «Ana + Marta») no
 * lo es: crearía una instructora con nombre compuesto. Esas filas entran sin
 * instructora y el acta lo dice.
 */
export function esNombreDeInstructora(nombre: unknown): boolean {
  if (typeof nombre !== 'string') return false;
  const n = nombre.trim();
  if (n.length < 2 || n.length > MAX_LONGITUD_NOMBRE_INSTRUCTORA) return false;
  if (/[\u0000-\u001f\u007f]/.test(n)) return false; // caracteres de control
  if (/[\/;,&+|]|\s(?:y|e|and)\s/i.test(n)) return false; // varias personas
  if (!/\p{L}/u.test(n)) return false; // sin ninguna letra («--», «123»)
  return !RE_SIN_NOMBRE.test(n.normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

/**
 * Un nombre de pila suelto («ana») se empareja con la única ficha cuyo nombre
 * empieza por él («ana garcia»). Con dos Anas no se adivina (`null`): se crea o se
 * deja sin instructora, pero nunca se le cuelga la clase a la equivocada.
 * `existentes` es nombre normalizado → id de la ficha.
 */
export function emparejarPorNombreDePila(nombreNormalizado: string, existentes: ReadonlyMap<string, string>): string | null {
  if (!nombreNormalizado || nombreNormalizado.includes(' ')) return null; // solo nombres de una palabra
  const candidatas = new Set<string>();
  for (const [nombre, id] of existentes) if (nombre.startsWith(`${nombreNormalizado} `)) candidatas.add(id);
  return candidatas.size === 1 ? [...candidatas][0] : null;
}
