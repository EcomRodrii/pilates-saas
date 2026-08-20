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
// ⚠️ `pesos` no es decorativo ni una preferencia: son los pesos que Google
// SIRVE DE VERDAD para esa familia, comprobados uno a uno contra la API
// (2026-08-20). Importa porque la URL de css2 pedía siempre `400;500;600;700`
// para todo, y **Instrument Serif solo publica el 400** — que es justo la
// tipografía de titulares por defecto. Google devolvía un 200 con el 400
// dentro, el navegador no encontraba el 600 que pedía el titular, y lo
// falsificaba engordando el trazo (faux bold): el defecto tipográfico más
// visible que puede tener una marca. Pidiendo solo lo que existe, el navegador
// usa el peso real o se queda en el que hay, pero nunca inventa uno.

export interface FuenteCatalogo {
  /**
   * El nombre EXACTO de la familia en Google Fonts. Es a la vez el valor que
   * se guarda en el tema y el que viaja en el snippet (`?fuente=`/`data-fuente`),
   * así que el catálogo no introduce un vocabulario nuevo: es el mismo string
   * que ya se escribía a mano, solo que elegido de una lista.
   */
  familia: string;
  /** Cómo se lee en la interfaz. */
  etiqueta: string;
  /** Para agrupar la lista y para elegir la pila de reserva coherente. */
  categoria: 'sans' | 'serif';
  /** Pesos realmente publicados por Google para esta familia. */
  pesos: number[];
  /** Una frase corta de para qué sirve, que se ve bajo el nombre. */
  pista: string;
}

/**
 * Diez familias, seis de palo seco y cuatro con remates. La lista sirve tanto
 * para el texto como para los titulares a propósito: hay estudios que quieren
 * una serif elegante solo en los títulos y otros que la quieren en todo.
 */
export const FUENTES_WIDGET: readonly FuenteCatalogo[] = [
  { familia: 'Instrument Sans', etiqueta: 'Instrument Sans', categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'La de Tentare. Neutra y muy legible en móvil.' },
  { familia: 'Inter', etiqueta: 'Inter', categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'Estándar de producto. Segura en cualquier tamaño.' },
  { familia: 'Plus Jakarta Sans', etiqueta: 'Plus Jakarta Sans', categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'Geométrica y cálida. Bien para marcas jóvenes.' },
  { familia: 'DM Sans', etiqueta: 'DM Sans', categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'Redondeada y tranquila. Muy usada en bienestar.' },
  { familia: 'Poppins', etiqueta: 'Poppins', categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'Círculos perfectos. Look moderno y rotundo.' },
  { familia: 'Outfit', etiqueta: 'Outfit', categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'Compacta y actual. Rinde en titulares grandes.' },
  { familia: 'Instrument Serif', etiqueta: 'Instrument Serif', categoria: 'serif', pesos: [400], pista: 'La de los titulares de Tentare. Solo peso normal.' },
  { familia: 'Playfair Display', etiqueta: 'Playfair Display', categoria: 'serif', pesos: [400, 500, 600, 700], pista: 'Contraste alto. Editorial y con carácter.' },
  { familia: 'Cormorant Garamond', etiqueta: 'Cormorant Garamond', categoria: 'serif', pesos: [400, 500, 600, 700], pista: 'Fina y clásica. Elegante en títulos grandes.' },
  { familia: 'Fraunces', etiqueta: 'Fraunces', categoria: 'serif', pesos: [400, 500, 600, 700], pista: 'Serif con personalidad. Nada corporativa.' },
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

/**
 * Los pesos a pedirle a Google para una familia. Si está en el catálogo, los
 * suyos de verdad; si no (texto libre de antes), el juego habitual — es lo
 * mismo que se pedía para todo hasta ahora, así que ninguna fuente guardada
 * cambia de comportamiento al pasar por aquí.
 */
export function pesosDe(familia: string | null | undefined): number[] {
  return fuenteDelCatalogo(familia)?.pesos ?? [400, 500, 600, 700];
}

/** La pila de reserva coherente con la familia: serif detrás de una serif. */
export function reservaDe(familia: string | null | undefined): string {
  return fuenteDelCatalogo(familia)?.categoria === 'serif' ? RESERVA_SERIF : RESERVA_SANS;
}

/** El `font-family` listo para usar de una entrada del catálogo. */
export function familiaCssCatalogo(f: FuenteCatalogo): string {
  return `'${f.familia}', ${f.categoria === 'serif' ? RESERVA_SERIF : RESERVA_SANS}`;
}

/**
 * UNA sola URL de Google Fonts con las diez familias, para que el selector
 * pueda enseñar cada nombre escrito en su propia letra.
 *
 * Una petición y no diez a propósito: `css2` admite varios `family=` en la
 * misma URL, y son diez `<link>` que se inyectan en una pantalla del panel.
 * Solo se piden los pesos que hacen falta para la muestra (normal y semi),
 * acotados a los que la familia publica de verdad — de ahí el filtro contra
 * `pesos`, sin él Instrument Serif pediría un 600 que no existe.
 */
export function urlCatalogoGoogle(): string {
  const familias = FUENTES_WIDGET.map(f => {
    const nombre = encodeURIComponent(f.familia).replace(/%20/g, '+');
    const pesos = [400, 600].filter(p => f.pesos.includes(p));
    return `family=${nombre}:wght@${pesos.join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${familias.join('&')}&display=swap`;
}
