// ─────────────────────────────────────────────────────────────────────────────
// «Cámbiate en dos rutas» (ronda 3 de la landing, 19-oct-2026).
//
// La forma viene de la página de migración de Momence (dos rutas de lanzamiento
// comparadas y preguntas honestas sobre qué se transfiere). Lo que cuenta es
// SOLO lo que /soluciones/cambiar-de-software ya cuenta: son dos rutas reales
// (tú misma en el panel, o te lo hacemos nosotros) y no se inventa una tercera.
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

export interface RutaMigracion {
  /** El título del botón de la ruta, en primera persona. */
  titulo: string;
  texto: string;
  /** Para quién es, como lo dice la página (solo la primera ruta lo dice). */
  paraQuien?: string;
  /** Frases literales de /soluciones/cambiar-de-software que prueban `texto`. */
  frases: readonly string[];
}

export const RUTAS_MIGRACION: readonly [RutaMigracion, RutaMigracion] = [
  {
    titulo: 'Traigo mis datos yo',
    texto: 'Subes tus exportaciones en CSV en el panel y ves una muestra de lo que va a entrar, qué filas quedan en cuarentena y qué avisos hay. Solo cuando lo confirmas se ejecuta, con botón de deshacer.',
    paraQuien: 'Para quien prefiere llevar el proceso paso a paso, sin esperar a nadie.',
    frases: ['una muestra de lo que va a crear', 'cuarentena', 'botón de deshacer', 'sin esperar a nadie'],
  },
  {
    titulo: 'Me ayudáis a traerlos',
    texto: 'Nos mandas lo que puedas exportar, sea cual sea el formato, y te entregamos el estudio montado con un acta para comprobar que todo cuadra. Tu programa actual sigue funcionando mientras tanto.',
    frases: ['sea cual sea el formato', 'acta', 'sigue funcionando'],
  },
];

/** Dónde está el formulario de la segunda ruta (el `id` lo lleva la propia página). */
export const ANCLA_AYUDA = 'te-la-hacemos-nosotros';
