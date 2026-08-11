// Los objetivos con los que una clienta nueva describe lo que busca.
//
// ⚠️ **Lista FIJA, no texto libre por estudio.** Se decidió así a propósito: con
// objetivos libres cada estudio escribe los suyos («tonificar», «tonificación»,
// «ponerme fuerte»), nadie los rellena igual y la recomendación se vuelve
// ruido. Fijos, todos los estudios hablan el mismo idioma y la pregunta
// «¿quieres empezar de cero?» significa lo mismo en todos.
//
// El precio de fijarlos es que esta lista es CONTRATO: los ids se guardan en
// `tipos_clase.objetivos`, así que se pueden AÑADIR pero nunca renombrar ni
// borrar sin migrar los datos de los estudios que ya los marcaron.

export const OBJETIVOS = [
  { id: 'empezar', label: 'Empezar desde cero', ayuda: 'Nunca ha hecho Pilates, o vuelve después de mucho tiempo.' },
  { id: 'fuerza', label: 'Mejorar fuerza', ayuda: 'Busca tonificar y ganar potencia.' },
  { id: 'movilidad', label: 'Mejorar movilidad', ayuda: 'Busca soltura, postura y rango de movimiento.' },
  { id: 'reformer', label: 'Reformer', ayuda: 'Clases en máquina.' },
  { id: 'suelo', label: 'Pilates suelo', ayuda: 'Clases de mat, sin máquina.' },
  { id: 'avanzado', label: 'Entrenamiento avanzado', ayuda: 'Ya tiene base y quiere exigencia.' },
] as const;

export type ObjetivoId = (typeof OBJETIVOS)[number]['id'];

const IDS: readonly string[] = OBJETIVOS.map((o) => o.id);

/** Si un id guardado sigue siendo uno de los nuestros. */
export function esObjetivo(id: unknown): id is ObjetivoId {
  return typeof id === 'string' && IDS.includes(id);
}

/**
 * Limpia lo que venga de la BD.
 *
 * Descarta ids desconocidos —de una versión anterior de la lista, o de una
 * escritura manual— en vez de arrastrarlos: un objetivo que ya no existe no
 * puede recomendar nada, y dejarlo pasar haría que un tipo de clase pareciera
 * cubrir algo que no cubre. Y quita duplicados, que es lo que deja una UI de
 * casillas mal guardada.
 */
export function resolverObjetivos(raw: unknown): ObjetivoId[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<ObjetivoId>();
  for (const v of raw) if (esObjetivo(v)) vistos.add(v);
  // En el orden del catálogo, no en el de guardado: así dos tipos de clase con
  // los mismos objetivos se leen igual en pantalla.
  return OBJETIVOS.map((o) => o.id).filter((id) => vistos.has(id));
}

export function etiquetaObjetivo(id: string): string {
  return OBJETIVOS.find((o) => o.id === id)?.label ?? id;
}

export interface ClaseConObjetivos {
  tipoClaseId?: string | null;
  objetivos?: readonly string[] | null;
}

/**
 * ¿Esta clase sirve para este objetivo?
 *
 * ⚠️ **Sin objetivo elegido, TODAS valen** — el asistente puede saltarse ese
 * paso y entonces no debe filtrar nada.
 *
 * ⚠️ Y una clase que **no ha declarado ningún objetivo también vale**. Es la
 * decisión que más cambia el resultado: el estudio medio va a tardar en
 * rellenar esto, y si una clase sin marcar quedara excluida, activar el
 * asistente vaciaría el horario el primer día. Mejor de más que de menos: una
 * clase de sobra se descarta leyendo su nombre; una que falta no se sabe que
 * existía.
 */
export function claseSirvePara(clase: ClaseConObjetivos, objetivo: string): boolean {
  if (!objetivo) return true;
  const suyos = resolverObjetivos(clase.objetivos);
  if (suyos.length === 0) return true;
  return suyos.includes(objetivo as ObjetivoId);
}

/**
 * Cuántas clases sirven para cada objetivo. El asistente lo usa para no
 * ofrecer un objetivo que deja el horario vacío.
 */
export function cuantasPorObjetivo(clases: readonly ClaseConObjetivos[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const o of OBJETIVOS) cuenta[o.id] = clases.filter((c) => claseSirvePara(c, o.id)).length;
  return cuenta;
}
