// Registro de las fotos de la home (tentare.app).
//
// Existe para que no se repita lo que había hasta ahora: fotos en `public/` sin
// rastro de quién las hizo, de dónde salieron ni con qué licencia. Cada foto que
// pinte la landing pasa por aquí con su crédito y, si sale alguien reconocible
// con permiso nuestro, con su consentimiento (el documento firmado vive FUERA
// del repo, que es público: aquí solo consta que existe).
//
// Cambiar una foto NO toca el layout. El layout pide `FOTOS.heroe`; lo que cambia
// es esta entrada (original, alt, crédito, foco del recorte) y luego se regeneran
// los ficheros:
//
//   node scripts/fotos-landing.mjs [carpeta-de-originales] [--solo=cierre,plazas]
//
// Los originales NO se suben al repo (pesan y son RAW de terceros): el script
// los lee de una carpeta de fuera y deja en `public/landing/fotos/` solo los
// derivados AVIF + WebP a los anchos de aquí abajo.
//
// ⚠️ Sin `@/` en los imports: este fichero lo leen `node --test` y el script
// `.mjs`, y ninguno de los dos resuelve el alias de TypeScript.

export type Consentimiento = 'no-aplica' | 'firmado';

export interface CreditoFoto {
  autor: string;
  /** Banco o procedencia: «Unsplash», «Pexels», «Sesión propia»… */
  fuente: string;
  /** Página de la foto en su fuente. Vacía solo si no consta. */
  url: string;
  licencia: string;
  /** AAAA-MM-DD. */
  fechaDescarga: string;
}

/**
 * Un encuadre de la misma foto (dirección de arte). La proporción es
 * ancho:alto y el foco es el punto del ORIGINAL (0–1 en cada eje) que el
 * recorte intenta dejar en el centro sin salirse de la imagen.
 */
export interface RecorteFoto {
  proporcion: readonly [number, number];
  foco: { readonly x: number; readonly y: number };
  anchos: readonly number[];
  /**
   * Franjas del original que el recorte NO puede tocar, en fracción de su lado
   * (`{ arriba: 0.3 }` = fuera el 30 % de arriba). Para dejar fuera lo que no
   * debe salir —un techo con aparatos de aire, una cámara— sin depender de dónde
   * caiga el foco. Sin esto, el recorte es siempre el más grande que cabe.
   */
  limites?: { readonly arriba?: number; readonly abajo?: number; readonly izquierda?: number; readonly derecha?: number };
}

/**
 * Corrección de color de una foto, aplicada igual a todos sus derivados.
 * Pensada para acercar una foto fría a la paleta (arena/oliva), no para
 * rehacerla: el test acota los dos valores a un margen sutil.
 *  · `calidez`: cuánto se bajan el azul (entero) y el verde (un 39 % de eso),
 *    que es la proporción del arena #D9C29E. 0 = sin cambio; 0,06 deja un blanco
 *    puro en #FFFAF0. Nunca sube el rojo: así los blancos no se queman a naranja.
 *  · `saturacion`: multiplicador (1 = sin cambio).
 */
export interface EtalonadoFoto {
  calidez: number;
  saturacion: number;
}

export type NombreRecorte = 'escritorio' | 'movil';
export type FormatoFoto = 'avif' | 'webp';

export interface FotoRegistrada {
  /** Raíz del nombre de los ficheros generados: descriptiva, para SEO. */
  id: string;
  /** Nombre del original dentro de la carpeta de originales (fuera del repo). */
  original: string;
  alt: string;
  /** Medidas del original, ya girado según su EXIF. El script las comprueba. */
  ancho: number;
  alto: number;
  recortes: { escritorio: RecorteFoto; movil?: RecorteFoto };
  etalonado?: EtalonadoFoto;
  /** Techo de peso de la AVIF de escritorio a ese ancho (lo comprueba el test). */
  presupuesto: { ancho: number; kb: number };
  credito: CreditoFoto;
  consentimiento: Consentimiento;
}

export const FORMATOS: readonly FormatoFoto[] = ['avif', 'webp'];

/** Carpeta pública (relativa a `public/`) donde viven los derivados. */
export const CARPETA_PUBLICA = 'landing/fotos';

export const FOTOS = {
  heroe: {
    id: 'estudio-pilates-reformer-heroe',
    original: 'heroe-reformer-roxana-popovici-unsplash-5JQxj-zc5ng.jpg',
    alt: 'Mujer haciendo Pilates en un reformer, con una mano en la barra y los pies en el carro, en un estudio en tonos crema con más reformers al fondo',
    ancho: 5963,
    alto: 3354,
    // Su cuerpo ocupa del 18,5 % (la mano en la barra) al 77,5 % (los dedos del
    // pie de atrás) del ancho del original: el 59 %. Un 4:5 de una foto 16:9 solo
    // abarca el 45 %, así que en móvil cortaría la mano o los pies; 6:5 abarca el
    // 67,5 % y la deja entera con algo de aire. El foco horizontal centra ese tramo.
    recortes: {
      escritorio: { proporcion: [5, 4], foco: { x: 0.48, y: 0.5 }, anchos: [640, 960, 1280, 1600] },
      movil: { proporcion: [6, 5], foco: { x: 0.48, y: 0.5 }, anchos: [480, 828, 1170] },
    },
    credito: {
      autor: 'Roxana Popovici',
      fuente: 'Unsplash',
      url: 'https://unsplash.com/es/fotos/la-mujer-hace-pilates-en-una-maquina-en-un-estudio-5JQxj-zc5ng',
      licencia: 'Unsplash License',
      fechaDescarga: '2026-09-16',
    },
    presupuesto: { ancho: 1280, kb: 140 },
    // Sin cara visible (la foto la corta por arriba) y de banco: no respalda nada.
    consentimiento: 'no-aplica',
  },
  // Sección final, antes del pie (SeccionCtaFinal). Sustituye a
  // `public/disciplinas/pilates.jpg`, vertical y de 900 px, que ahí se ampliaba
  // a todo el ancho; esa sigue en /funcionalidades y /network.
  cierre: {
    id: 'sala-pilates-reformers-madera-cierre',
    original: 'cierre-sala-reformers-le-duc-pexels-18499500.jpg',
    alt: 'Sala de un estudio de Pilates con una fila de reformers de madera clara y cortinas de lino al fondo',
    ancho: 5999,
    alto: 3503,
    // El 30 % de arriba es techo con dos aparatos de aire y una cámara: fuera en
    // los dos recortes. El foco a la izquierda deja las cortinas, que es donde va
    // el texto en escritorio.
    recortes: {
      escritorio: { proporcion: [21, 9], limites: { arriba: 0.3, abajo: 0.08 }, foco: { x: 0.42, y: 0.6 }, anchos: [768, 1280, 1920, 2560] },
      movil: { proporcion: [4, 3], limites: { arriba: 0.3, abajo: 0.08 }, foco: { x: 0.585, y: 0.6 }, anchos: [640, 1170, 1720] },
    },
    // Blanco frío de origen: se calienta hacia el arena.
    etalonado: { calidez: 0.07, saturacion: 0.95 },
    presupuesto: { ancho: 1920, kb: 180 },
    credito: {
      autor: 'Lê Đức',
      fuente: 'Pexels',
      url: 'https://www.pexels.com/photo/a-modern-fitness-studio-18499500/',
      licencia: 'Pexels License',
      fechaDescarga: '2026-09-16',
    },
    // Sala vacía: no sale nadie.
    consentimiento: 'no-aplica',
  },
  // Elección de reformer (SeccionCalendarioReservas): la pieza de plazas va
  // encima, sobre la pared crema de la mitad de arriba.
  plazas: {
    id: 'reformers-madera-tapizado-negro-plazas',
    original: 'app-reformers-paulina-vargas-pexels-36833354.jpg',
    alt: 'Fila de reformers con tapizado negro delante de una pared crema con columnas iluminadas',
    ancho: 5672,
    alto: 3781,
    recortes: {
      escritorio: { proporcion: [16, 10], limites: { abajo: 0.2 }, foco: { x: 0.58, y: 0.4 }, anchos: [640, 1024, 1440] },
      movil: { proporcion: [4, 5], limites: { abajo: 0.28 }, foco: { x: 0.62, y: 0.4 }, anchos: [480, 828, 1170] },
    },
    // La luz de las columnas tira a naranja: un poco menos de saturación la deja
    // en arena, como la del héroe.
    etalonado: { calidez: 0, saturacion: 0.88 },
    presupuesto: { ancho: 1440, kb: 110 },
    credito: {
      autor: 'Paulina Vargas',
      fuente: 'Pexels',
      url: 'https://www.pexels.com/photo/modern-pilates-studio-with-reformers-36833354/',
      licencia: 'Pexels License',
      fechaDescarga: '2026-09-16',
    },
    consentimiento: 'no-aplica',
  },
  // «Anoche, mientras tú cerrabas» (SeccionParteNoche): la sala vacía con la luz
  // cálida encendida, y el parte encima como avisos de pantalla de bloqueo.
  anoche: {
    id: 'sala-pilates-espejos-arco-anoche',
    original: 'anoche-sala-arcos-paulina-vargas-pexels-36833355.jpg',
    alt: 'Sala de Pilates vacía, con espejos en arco iluminados por detrás con luz cálida y reformers de madera con tapizado negro',
    ancho: 6000,
    alto: 4000,
    recortes: {
      escritorio: { proporcion: [1, 1], foco: { x: 0.68, y: 0.5 }, anchos: [560, 840, 1120] },
      movil: { proporcion: [4, 5], foco: { x: 0.72, y: 0.5 }, anchos: [480, 828, 1170] },
    },
    etalonado: { calidez: 0, saturacion: 0.92 },
    presupuesto: { ancho: 1120, kb: 120 },
    credito: {
      autor: 'Paulina Vargas',
      fuente: 'Pexels',
      url: 'https://www.pexels.com/photo/modern-pilates-studio-with-reformers-36833355/',
      licencia: 'Pexels License',
      fechaDescarga: '2026-09-16',
    },
    consentimiento: 'no-aplica',
  },
} as const satisfies Record<string, FotoRegistrada>;

/**
 * El trozo del original que sale en un recorte: el mayor de su proporción que
 * cabe dentro de los `limites`, centrado en el foco sin salirse de ellos.
 * Lo usan el script (para recortar) y el test (para saber que no hace falta
 * ampliar).
 */
export function zonaDeRecorte(
  foto: { ancho: number; alto: number },
  recorte: RecorteFoto,
): { left: number; top: number; width: number; height: number } {
  const l = recorte.limites ?? {};
  const x0 = Math.round((l.izquierda ?? 0) * foto.ancho);
  const x1 = foto.ancho - Math.round((l.derecha ?? 0) * foto.ancho);
  const y0 = Math.round((l.arriba ?? 0) * foto.alto);
  const y1 = foto.alto - Math.round((l.abajo ?? 0) * foto.alto);
  const [pw, ph] = recorte.proporcion;
  let width = x1 - x0;
  let height = Math.round((width * ph) / pw);
  if (height > y1 - y0) {
    height = y1 - y0;
    width = Math.round((height * pw) / ph);
  }
  const dentro = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  return {
    left: dentro(Math.round(recorte.foco.x * foto.ancho - width / 2), x0, x1 - width),
    top: dentro(Math.round(recorte.foco.y * foto.alto - height / 2), y0, y1 - height),
    width,
    height,
  };
}

/** Alto de un derivado: sale del ancho y la proporción del recorte. */
export function altoDe(recorte: RecorteFoto, ancho: number): number {
  return Math.round((ancho * recorte.proporcion[1]) / recorte.proporcion[0]);
}

/** Nombre del fichero generado, sin carpeta: `estudio-…-heroe-movil-828.avif`. */
export function nombreFichero(foto: FotoRegistrada, recorte: NombreRecorte, ancho: number, formato: FormatoFoto): string {
  const sufijo = recorte === 'escritorio' ? '' : `-${recorte}`;
  return `${foto.id}${sufijo}-${ancho}.${formato}`;
}

/** URL pública (relativa al sitio, nunca a otro host). */
export function rutaFoto(foto: FotoRegistrada, recorte: NombreRecorte, ancho: number, formato: FormatoFoto): string {
  return `/${CARPETA_PUBLICA}/${nombreFichero(foto, recorte, ancho, formato)}`;
}

/** Todos los derivados de una foto: lo que el script genera y el test exige. */
export function derivados(foto: FotoRegistrada): { recorte: NombreRecorte; ancho: number; alto: number; formato: FormatoFoto; fichero: string }[] {
  const lista: { recorte: NombreRecorte; ancho: number; alto: number; formato: FormatoFoto; fichero: string }[] = [];
  for (const nombre of ['escritorio', 'movil'] as const) {
    const r = foto.recortes[nombre];
    if (!r) continue;
    for (const ancho of r.anchos) {
      for (const formato of FORMATOS) {
        lista.push({ recorte: nombre, ancho, alto: altoDe(r, ancho), formato, fichero: nombreFichero(foto, nombre, ancho, formato) });
      }
    }
  }
  return lista;
}
