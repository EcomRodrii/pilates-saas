// Qué parte de "a dónde quiero ir" es una RUTA y qué parte es estado de la
// pantalla que ya está abierta.
//
// ⚠️ Esta separación existe por un fallo real en producción. El portal del kit
// manda destinos completos —`{ screen: 'clases', day: 7 }` al pulsar un día en
// la tira, `{ screen: 'detalle', classId }` al abrir una clase— y el marco de
// Next los traducía a `router.push`. Como el router solo entiende de pantalla,
// el día y la clase se perdían por el camino: pulsar el día 7 estando ya en
// Clases no hacía absolutamente nada, y la socia concluía —con razón— que sus
// clases del 7 y del 8 no existían. Existían en la base de datos.
//
// Vive en `lib/` y no dentro del store para poder probarlo: es la pieza que
// falló, y no quiero que su única red sea que alguien vuelva a mirarlo a ojo.

// Estructural a propósito, sin importar `DestinoPortal` del store: `lib/` no
// depende de `components/` en este repo, y el store es quien encaja aquí. El
// genérico conserva los tipos exactos de quien llama (`ScreenId`, `TabId`…).
export interface ConPantalla {
  screen: string;
}

/** La parte del destino que NO es la ruta: se aplica al estado local. */
export type EstadoDeDestino<D extends ConPantalla> = Omit<D, 'screen'>;

/**
 * Parte un destino en las dos mitades que viajan por caminos distintos.
 *
 * `estado` es `null` cuando el destino era solo un cambio de pantalla, para que
 * quien llama pueda ahorrarse el `set` (y el render que arrastra).
 */
export function repartirDestino<D extends ConPantalla>(destino: D): {
  screen: D['screen'];
  estado: EstadoDeDestino<D> | null;
} {
  const { screen, ...resto } = destino;
  const claves = Object.keys(resto) as (keyof EstadoDeDestino<D>)[];
  // Una clave presente pero `undefined` no es un cambio: `{ day: undefined }`
  // no debe pisar el día que ya había seleccionado.
  const utiles = claves.filter((k) => (resto as Record<string, unknown>)[k as string] !== undefined);
  if (utiles.length === 0) return { screen, estado: null };

  const estado = {} as EstadoDeDestino<D>;
  for (const k of utiles) {
    estado[k] = (resto as EstadoDeDestino<D>)[k];
  }
  return { screen, estado };
}

/**
 * Quién manda la pantalla: la ruta o el estado del portal.
 *
 * Casi siempre la ruta — el portal real navega con URLs y el store se limita a
 * copiarla. La excepción es la pantalla que el kit SÍ pinta pero que NO tiene
 * ruta: el detalle de una clase, que vive dentro de Clases igual que la hoja de
 * reserva del portal de siempre.
 *
 * ⚠️ Sin esa excepción, abrir una clase se deshace en el mismo render en el
 * que se abre: el store pone `detalle`, la ruta sigue siendo `/clases`, y el
 * `pantalla` de fuera lo pisa. La socia ve un parpadeo y sigue en el horario —
 * y como el detalle es la ÚNICA pantalla desde la que se reserva, no puede
 * reservar.
 *
 * ⚠️ La excepción va por INCLUSIÓN, y esto costó el portal entero. Antes se
 * escribía al revés —«manda el store si la pantalla abierta no es de ruta»— y
 * el estado inicial del store (`welcome`) tampoco es de ruta: desde el PRIMER
 * render la ruta dejaba de mandar y no volvía nunca, porque lo único que movería
 * `screen` es navegar, que es justo lo que se estaba ignorando. El Inicio se
 * seguía viendo por el `?? PANTALLAS.inicio` del final, así que no parecía roto:
 * parecía que no funcionaba nada. Y la barra de pestañas no se montaba, porque
 * `welcome` no es una de las pantallas que la llevan.
 *
 * Por eso la lista que entra aquí son las pantallas SIN ruta que el kit pinta,
 * no las que sí la tienen: cualquier otra cosa —incluida una pantalla que este
 * kit no pinta— deja mandar a la ruta.
 */
export function mandaLaRuta<P extends string>(
  pantallaAbierta: P,
  pantallasSinRuta: readonly P[] | undefined,
): boolean {
  // Sin lista, el llamador no distingue: se comporta como siempre (manda la
  // ruta). Es lo que hace la previsualización de temas, que no navega por URL.
  if (!pantallasSinRuta) return true;
  return !pantallasSinRuta.includes(pantallaAbierta);
}
