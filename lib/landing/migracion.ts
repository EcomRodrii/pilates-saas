// ─────────────────────────────────────────────────────────────────────────────
// Qué se trae al cambiarse a Tentare (ronda 3 de la landing, 19-oct-2026).
//
// 21-oct-2026: fuera las «dos rutas». La segunda prometía que Tentare hacía la
// migración por la propietaria, y nadie la hace (decisión del fundador). La
// única vía es la real: el importador del panel, que hace ella misma.
//
// `SE_LLEVA` es la lista que la página de migración enseña en «Qué te llevas
// contigo» (la misma lista, los mismos seis tipos de dato que mueve el
// importador: `ENTIDADES` en lib/migracion/clasificador.ts). Vive aquí y la
// importan LAS DOS, la página y la landing: dos copias solo pueden
// desincronizarse, y esta lista es una promesa sobre datos de clientas.
//
// ⚠️ `NO_SE_LLEVA` dice lo que la propia página dice: las tarjetas guardadas no
// se migran. Una landing que enseña «qué se trae» sin «qué no» es la que
// Momence evita hacer a medias; aquí van las dos, juntas.
//
// Puro y sin `@/`: lo leen `node --test`, la página y la landing.
// ─────────────────────────────────────────────────────────────────────────────

/** Los tipos de dato que el importador mueve (mismo orden y etiquetas que en la página). */
export const SE_LLEVA: string[] = [
  'Clientas — con su historial de bonos y asistencia',
  'Bonos y membresías',
  'Clases y horario',
  'Reservas',
  'Citas',
  'Pagos históricos',
];

/** Lo que no viaja solo, dicho como la página lo dice. */
export const NO_SE_LLEVA = {
  titulo: 'Las tarjetas guardadas',
  texto: 'Ningún software puede leer la tarjeta que otro tiene guardada. Cada alumna la vuelve a introducir una vez, la primera vez que le cobres con Tentare.',
} as const;
