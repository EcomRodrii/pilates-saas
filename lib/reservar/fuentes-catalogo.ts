// Las tipografías que el estudio puede elegir para su widget, sin buscar nada
// fuera ni pegar una URL de Google Fonts.
//
// Antes esto era un `<input type="text">`: había que saberse el nombre EXACTO
// de una familia de Google y escribirlo bien. Un catálogo curado convierte eso
// en una lista donde cada opción se ve en su propia letra antes de elegirla.
//
// ⚠️ Sin imports de Next ni de React a propósito: lo compila esbuild para el
// bundle embebible (app/widget-bundle/main.tsx) además de Next para
// /reservar/[slug], igual que `config-widget.ts`.
//
// ⚠️ Ya no se le pide ninguna a Google (ni la página de reservas, ni la
// nativa, ni el selector para enseñarlas): de las diez, el selector solo
// ofrece las que sirve Tentare (`familiaServida`, lib/widget/fuentes-nativa.ts)
// y los pesos son los de sus woff2 (app/_fuentes/fuentes.ts). Las otras cuatro
// siguen aquí porque un código de antes puede nombrarlas, y su categoría
// decide la reserva: una serif detrás de una serif (`reservaDe`).

export interface FuenteCatalogo {
  /**
   * El nombre EXACTO de la familia (el de Google Fonts, que es también el que
   * sirve Tentare). Es a la vez el valor que se guarda en el tema y el que
   * viaja en el snippet (`?fuente=`/`data-fuente`), así que el catálogo no
   * introduce un vocabulario nuevo: es el mismo string que ya se escribía a
   * mano, solo que elegido de una lista.
   */
  familia: string;
  /** Cómo se lee en la interfaz. */
  etiqueta: string;
  /** Para agrupar la lista y para elegir la pila de reserva coherente. */
  categoria: 'sans' | 'serif';
  /** Una frase corta de para qué sirve, que se ve bajo el nombre. */
  pista: string;
}

/**
 * Diez familias, seis de palo seco y cuatro con remates; el selector ofrece
 * las seis que sirve Tentare (ver arriba). La lista sirve tanto para el texto
 * como para los titulares a propósito: hay estudios que quieren una serif
 * elegante solo en los títulos y otros que la quieren en todo.
 */
export const FUENTES_WIDGET: readonly FuenteCatalogo[] = [
  { familia: 'Instrument Sans', etiqueta: 'Instrument Sans', categoria: 'sans', pista: 'La de Tentare. Neutra y muy legible en móvil.' },
  { familia: 'Inter', etiqueta: 'Inter', categoria: 'sans', pista: 'Estándar de producto. Segura en cualquier tamaño.' },
  { familia: 'Plus Jakarta Sans', etiqueta: 'Plus Jakarta Sans', categoria: 'sans', pista: 'Geométrica y cálida. Bien para marcas jóvenes.' },
  { familia: 'DM Sans', etiqueta: 'DM Sans', categoria: 'sans', pista: 'Redondeada y tranquila. Muy usada en bienestar.' },
  { familia: 'Poppins', etiqueta: 'Poppins', categoria: 'sans', pista: 'Círculos perfectos. Look moderno y rotundo.' },
  { familia: 'Outfit', etiqueta: 'Outfit', categoria: 'sans', pista: 'Compacta y actual. Rinde en titulares grandes.' },
  { familia: 'Instrument Serif', etiqueta: 'Instrument Serif', categoria: 'serif', pista: 'La de los titulares de Tentare. Solo peso normal.' },
  { familia: 'Playfair Display', etiqueta: 'Playfair Display', categoria: 'serif', pista: 'Contraste alto. Editorial y con carácter.' },
  { familia: 'Cormorant Garamond', etiqueta: 'Cormorant Garamond', categoria: 'serif', pista: 'Fina y clásica. Elegante en títulos grandes.' },
  { familia: 'Fraunces', etiqueta: 'Fraunces', categoria: 'serif', pista: 'Serif con personalidad. Nada corporativa.' },
] as const;

// Pila de reserva por categoría: lo que se ve mientras la fuente carga, o si no
// llega nunca.
//
// ⚠️ La sans se queda EXACTAMENTE como estaba (`system-ui, sans-serif`), no se
// aprovecha para «mejorarla»: es la cadena que devuelve `familiaCssDe` para
// cualquier familia de texto libre y hay tests que la comparan literal. Lo que
// sí cambia es que una serif deje de caer en una sans — que era el fallo real:
// mientras cargaba Playfair, el titular se veía en system-ui, y al llegar la
// fuente el texto pegaba un salto de forma y de ancho.
export const RESERVA_SANS = 'system-ui, sans-serif';
export const RESERVA_SERIF = "Georgia, 'Times New Roman', serif";

/**
 * La entrada del catálogo para una familia, o `null` si no está.
 *
 * `null` NO es un error: el campo admitía texto libre y sigue admitiéndolo (ver
 * `FUENTE_VALIDA`), así que un estudio puede tener guardada una familia que no
 * está en la lista. Quien llame a esto tiene que seguir funcionando con `null`.
 */
export function fuenteDelCatalogo(familia: string | null | undefined): FuenteCatalogo | null {
  if (!familia) return null;
  const buscada = familia.trim().toLowerCase();
  return FUENTES_WIDGET.find(f => f.familia.toLowerCase() === buscada) ?? null;
}

/** La pila de reserva coherente con la familia: serif detrás de una serif. */
export function reservaDe(familia: string | null | undefined): string {
  return fuenteDelCatalogo(familia)?.categoria === 'serif' ? RESERVA_SERIF : RESERVA_SANS;
}
