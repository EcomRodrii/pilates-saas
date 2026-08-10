// Higienización de las claves que acaban dentro de un path de Supabase
// Storage.
//
// Vive en su propio módulo, sin un solo import, por un motivo práctico: los
// tests unitarios de este repo corren con `node --test`, que **no resuelve el
// alias `@/`**. `portal-storage.ts` importa `@/lib/db/supabase`, así que nada
// de lo que viva ahí se puede probar — y esto es justo la parte que hay que
// probar, porque es la única defensa entre un id que compone la interfaz y el
// sitio donde se escribe el fichero.

/**
 * Deja la clave en algo que puede ir en un nombre de fichero, y nada más.
 *
 * Se queda solo con letras, números, guion y guion bajo — todo lo que puede
 * salir legítimamente de un id de bloque o del nombre de un campo. Una clave
 * con `/` o con `..` escribiría fuera de su carpeta.
 *
 * Devuelve `''` cuando no queda nada utilizable, para que quien llama corte en
 * vez de escribir en un path a medias: `portal-{estudio}-` sería un mismo
 * fichero compartido por todas las claves inválidas de ese estudio, y cada
 * subida pisaría la anterior.
 */
export function claveDeImagenPortal(clave: string): string {
  return clave.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
}

/**
 * El nombre con el que se guarda la imagen de UN campo concreto del editor.
 *
 * ⚠️ El `indice` no es opcional por comodidad: es lo que impide que las cuatro
 * fotos de una galería se pisen entre sí. Una galería es un campo `lista` cuyos
 * elementos comparten el MISMO `campoId` (`url`), así que sin el índice las
 * cuatro escribirían en el mismo fichero y **cada subida borraría la
 * anterior** — sin aviso, y con la foto ya perdida en Storage.
 *
 * El `prefijo` (el id del bloque) hace lo propio entre bloques: dos banners
 * distintos tienen que poder tener fotos distintas.
 */
export function claveSubidaDeCampo(
  prefijo: string | undefined, campoId: string, indice?: number,
): string {
  const base = `${prefijo ?? 'campo'}-${campoId}`;
  if (indice === undefined) return base;
  // ⚠️ El índice va al final Y se le reserva sitio. `claveDeImagenPortal`
  // recorta a 60 caracteres, así que con un id de bloque largo el corte se
  // comería precisamente el índice — y volverían a colisionar las fotos de la
  // galería, que es justo lo que este parámetro viene a evitar. Se recorta la
  // BASE, nunca el índice.
  const sufijo = `-${indice}`;
  return `${base.slice(0, 60 - sufijo.length)}${sufijo}`;
}
