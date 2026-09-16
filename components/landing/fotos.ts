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
//   node scripts/fotos-landing.mjs [carpeta-de-originales]
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
    // Sin cara visible (la foto la corta por arriba) y de banco: no respalda nada.
    consentimiento: 'no-aplica',
  },
} as const satisfies Record<string, FotoRegistrada>;

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
