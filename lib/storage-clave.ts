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
