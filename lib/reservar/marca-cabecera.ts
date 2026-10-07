// Qué enseña el hueco de la marca en la cabecera de /reservar/[slug]
// (`MarcaEstudio`, components/reservar/cabecera-reservar.tsx). Puro, con test.
//
// ⚠️ EL FALLO QUE ARREGLA (app de iOS, 7-oct-2026). El logo se pintaba como un
// `<img>` con fondo blanco FIJO desde el primer instante. El logo no es
// transparente ni el hueco medía 0: es que tarda en llegar —lo redimensiona
// Storage al vuelo (`urlServida`), y en WebKit llegó a los 1,8 s medido contra
// producción— y mientras tanto lo único que se veía sobre la foto era un
// cuadrado blanco vacío. Más abajo, en la cabecera clara, «sí aparecía»
// porque para entonces ya estaba en caché. Ahora, hasta que el logo ha cargado
// de verdad, se ve la inicial sobre el color de la marca; y si no carga nunca
// (ni la versión redimensionada ni el original), se queda la inicial.

/** A partir de esta proporción un logo es un lockup apaisado (el mismo umbral que la app de la alumna). */
export const PROPORCION_LOGO_APAISADO = 3.2;

/** `inicial`: la letra sobre su color. `cargando`: la letra, con el logo llegando por encima. `logo`: el logo. */
export type CaraMarca = 'inicial' | 'cargando' | 'logo';

/** Lo que se sabe del logo al cargar: de qué URL y si es apaisado. */
export interface LogoMedido {
  src: string;
  apaisado: boolean;
}

export function esLogoApaisado(ancho: number, alto: number): boolean {
  return alto > 0 && ancho / alto > PROPORCION_LOGO_APAISADO;
}

export function caraDeLaMarca(o: {
  logoUrl: string | null;
  /** El último logo que cargó. Si es de otra URL (cambió el estudio), no cuenta. */
  medido: LogoMedido | null;
  /** La URL que no se pudo cargar, ni redimensionada ni la original. */
  fallo: string | null;
}): CaraMarca {
  if (!o.logoUrl || o.fallo === o.logoUrl) return 'inicial';
  if (o.medido?.src !== o.logoUrl) return 'cargando';
  // Un lockup apaisado se pintaría como una raya y repetiría el nombre, que va al lado.
  return o.medido.apaisado ? 'inicial' : 'logo';
}
