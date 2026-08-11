// Las secciones de /reservar — el widget que el estudio incrusta en su web —
// reordenables y ocultables desde el editor.
//
// ⚠️ **Secciones FIJAS que se mueven, no bloques que se añaden.** Es la
// diferencia con las tres pantallas del portal, y la que decide toda la forma
// de esto: aquí casi todo es maquinaria de reserva (el horario, los filtros,
// la hoja) que existe UNA vez y no se duplica ni se borra. Ofrecer un catálogo
// de bloques sería prometer una libertad que la página no puede dar.
//
// Mismo patrón —y misma fuente de verdad compartida entre página y editor— que
// `lib/home-sections.ts` para el inicio del panel.

export interface SeccionReservar {
  id: string;
  label: string;
  /** Qué es, en una línea, para el rail del editor. */
  ayuda: string;
}

/**
 * El orden por defecto. Es el de hoy, así que un estudio que no toque nada no
 * ve ningún cambio.
 */
export const SECCIONES_RESERVAR: SeccionReservar[] = [
  { id: 'portada', label: 'Portada', ayuda: 'Titular, foto y botón.' },
  { id: 'horario', label: 'Horario y reservas', ayuda: 'Las clases y el calendario.' },
  { id: 'bonos', label: 'Bonos y membresías', ayuda: 'Lo que se puede contratar.' },
  { id: 'cifras', label: 'Cifras del estudio', ayuda: 'Clases por semana, instructoras.' },
  { id: 'contacto', label: 'Contacto y pie', ayuda: 'Teléfono, email y enlaces legales.' },
];

/**
 * ⚠️ **El horario NO se puede ocultar ni mover.**
 *
 * Es la razón de existir del widget: una página de reservas sin el horario es
 * una página rota, y dejarla ocultar es dejar que alguien se la rompa sin
 * querer buscando otra cosa. Va siempre, y va en su sitio.
 *
 * Que sea fija es además lo único que garantiza que la vean los estudios que ya
 * tengan un orden guardado: los ids nuevos entran al FINAL del orden existente
 * —el gotcha que ya documenta la home del panel— y el horario enterrado al
 * final sería justo el desastre que esto evita.
 */
export const SECCIONES_FIJAS: readonly string[] = ['horario'];

export function esFija(id: string): boolean {
  return SECCIONES_FIJAS.includes(id);
}

export interface OrdenGuardado {
  orden?: readonly string[] | null;
  ocultos?: readonly string[] | null;
}

/**
 * El orden final que pinta la página.
 *
 * Reglas, en este orden:
 *  1. Lo guardado manda, para los ids que sigan existiendo.
 *  2. Un id del catálogo que NO esté en lo guardado entra al final — es una
 *     sección añadida después de que este estudio personalizara su página.
 *  3. Un id guardado que ya no exista en el catálogo se descarta: una sección
 *     retirada del producto no puede dejar un hueco en la página de nadie.
 *  4. Las FIJAS van siempre, y en su posición del catálogo, pase lo que pase
 *     con lo guardado.
 */
export function ordenarSecciones(guardado: OrdenGuardado | null | undefined): SeccionReservar[] {
  const catalogo = new Map(SECCIONES_RESERVAR.map((s) => [s.id, s]));
  // ⚠️ Se DEDUPLICA. Un arrastre mal guardado deja el mismo id dos veces, y sin
  // esto la sección se pintaba dos veces en la página —lo cazó su test—: dos
  // bloques de bonos seguidos es algo que la clienta ve al instante y que el
  // estudio no sabría de dónde le viene.
  const guardadas = [...new Set(
    (guardado?.orden ?? []).filter((id) => catalogo.has(id) && !esFija(id)),
  )];
  const nuevas = SECCIONES_RESERVAR
    .filter((s) => !esFija(s.id) && !guardadas.includes(s.id))
    .map((s) => s.id);

  // Se reconstruye recorriendo el CATÁLOGO para colocar las fijas en su sitio,
  // e intercalando las movibles en el orden que decidió el estudio.
  const movibles = [...guardadas, ...nuevas];
  const fuera: SeccionReservar[] = [];
  let i = 0;
  for (const s of SECCIONES_RESERVAR) {
    if (esFija(s.id)) {
      fuera.push(s);
      continue;
    }
    const siguiente = movibles[i++];
    const sec = siguiente ? catalogo.get(siguiente) : undefined;
    if (sec) fuera.push(sec);
  }
  return fuera;
}

/**
 * ¿Se pinta esta sección?
 *
 * Una fija se pinta SIEMPRE, aunque alguien la haya metido en `ocultos` a mano
 * o en una versión anterior en la que sí se podía.
 */
export function seccionVisible(id: string, guardado: OrdenGuardado | null | undefined): boolean {
  if (esFija(id)) return true;
  return !(guardado?.ocultos ?? []).includes(id);
}
