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
// ⚠️ «Bonos y membresías» NO está aquí, y no es un olvido: hoy no es una
// sección de la PÁGINA — vive dentro de la pestaña «El estudio», junto a los
// tipos de clase y las instructoras. Catalogarla habría dejado una fila en el
// editor que se arrastra y no mueve nada, que es exactamente el fallo que este
// repo ya ha cometido varias veces. Para que participe hay que sacarla de esa
// pestaña primero, y eso es una decisión sobre la estructura de la página, no
// un id más en esta lista.
export const SECCIONES_RESERVAR: SeccionReservar[] = [
  { id: 'portada', label: 'Portada', ayuda: 'Titular, foto y botón.' },
  { id: 'horario', label: 'Horario y reservas', ayuda: 'Las clases y el calendario.' },
  // La única cuyo contenido entero escribe el estudio. Si no ha escrito nada,
  // no se pinta — y por eso su ayuda dice qué hay que hacer para verla.
  { id: 'sobre', label: 'Sobre nosotros', ayuda: 'Lo que cuentas de tu estudio. Sin texto, no se ve.' },
  { id: 'cifras', label: 'Cifras del estudio', ayuda: 'Clases por semana, instructoras.' },
  { id: 'contacto', label: 'Contacto y pie', ayuda: 'Teléfono, email y enlaces legales.' },
];

/**
 * Secciones que NO cambian de sitio.
 *
 * **El horario** es la razón de existir del widget: va siempre, y va en su
 * sitio. Que esté anclado es además lo único que garantiza que lo vean los
 * estudios que ya tengan un orden guardado — los ids nuevos entran al FINAL del
 * orden existente (el gotcha que ya documenta la home del panel) y el horario
 * enterrado al final sería justo el desastre que esto evita.
 *
 * ⚠️ **La portada está anclada por una razón distinta, y de fuera del código:
 * el fondo.** Portada, barra de marca y pestañas comparten un único
 * `linear-gradient(175deg, …)` (`MODO_TOKENS.dia.hero`). Un degradado se pinta
 * por CAJA, así que separar la portada para poder moverla lo reinicia y deja
 * dos costuras horizontales visibles en la página de TODOS los estudios —
 * medido con capturas antes/después, no supuesto. Se probó y se descartó: pagar
 * una regresión visible para todos a cambio de un reordenado que casi nadie
 * quiere (una portada por debajo del pie no es una página, es un accidente) era
 * mal negocio.
 *
 * Anclada NO es lo mismo que obligatoria: la portada **sí se puede ocultar**,
 * que es lo que de verdad pide quien incrusta el widget en una web que ya tiene
 * su propia cabecera. Ver `SECCIONES_SIEMPRE_VISIBLES`.
 */
export const SECCIONES_ANCLADAS: readonly string[] = ['portada', 'horario'];

/**
 * Las que no se pueden ocultar. Solo el horario: una página de reservas sin
 * horario está rota, y dejarla ocultar es dejar que alguien se la rompa sin
 * querer buscando otra cosa.
 */
export const SECCIONES_SIEMPRE_VISIBLES: readonly string[] = ['horario'];

/** ¿Se queda donde está? (No dice nada sobre si se puede ocultar.) */
export function esAnclada(id: string): boolean {
  return SECCIONES_ANCLADAS.includes(id);
}

/** ¿Se puede ocultar? */
export function sePuedeOcultar(id: string): boolean {
  return !SECCIONES_SIEMPRE_VISIBLES.includes(id);
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
 *  4. Las ANCLADAS van siempre, y en su posición del catálogo, pase lo que
 *     pase con lo guardado.
 */
export function ordenarSecciones(guardado: OrdenGuardado | null | undefined): SeccionReservar[] {
  const catalogo = new Map(SECCIONES_RESERVAR.map((s) => [s.id, s]));
  // ⚠️ Se DEDUPLICA. Un arrastre mal guardado deja el mismo id dos veces, y sin
  // esto la sección se pintaba dos veces en la página —lo cazó su test—: dos
  // bloques de bonos seguidos es algo que la clienta ve al instante y que el
  // estudio no sabría de dónde le viene.
  const guardadas = [...new Set(
    (guardado?.orden ?? []).filter((id) => catalogo.has(id) && !esAnclada(id)),
  )];
  const nuevas = SECCIONES_RESERVAR
    .filter((s) => !esAnclada(s.id) && !guardadas.includes(s.id))
    .map((s) => s.id);

  // Se reconstruye recorriendo el CATÁLOGO para colocar las ancladas en su
  // sitio, e intercalando las movibles en el orden que decidió el estudio.
  const movibles = [...guardadas, ...nuevas];
  const fuera: SeccionReservar[] = [];
  let i = 0;
  for (const s of SECCIONES_RESERVAR) {
    if (esAnclada(s.id)) {
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
 * Las de `SECCIONES_SIEMPRE_VISIBLES` se pintan SIEMPRE, aunque alguien las
 * haya metido en `ocultos` a mano o en una versión anterior en la que sí se
 * podía. Estar anclada no basta: la portada no se mueve y aun así se oculta.
 */
export function seccionVisible(id: string, guardado: OrdenGuardado | null | undefined): boolean {
  if (!sePuedeOcultar(id)) return true;
  return !(guardado?.ocultos ?? []).includes(id);
}
