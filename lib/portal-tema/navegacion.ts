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
