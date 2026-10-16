import { logoServible } from '../monograma-estudio.ts';

// Lo que enseña un enlace a la app de la alumna (`/portal/<slug>`) cuando se
// comparte por WhatsApp, Instagram o se escanea el QR: la tarjeta de Open Graph
// y la de Twitter/X.
//
// ⚠️ Sin esto, `/portal/<slug>` heredaba las de `app/layout.tsx`, que son las de
// Tentare B2B («Tentare: software para estudios de Pilates y Yoga», con
// `siteName: 'Tentare'`): la app es marca blanca y su enlace se previsualizaba
// como el anuncio de Tentare. En Next.js, un `openGraph` del hijo SUSTITUYE al
// del padre entero (no se mezclan claves), así que basta con declarar uno.
//
// La imagen solo es suya: su portada si la subió, si no su logo, y si no
// ninguna. Nunca la foto de serie del repo (no es suya: sería prometer en la
// tarjeta un estudio que no es) ni una URL externa (solo la de nuestro
// almacenamiento: `logoServible`, el mismo criterio que el icono).

export interface EstudioParaTarjeta {
  nombre: string;
  /** La portada que subió (`studios.imagen_bienvenida_url`), sin la de serie. */
  portadaUrl: string | null | undefined;
  logoUrl: string | null | undefined;
}

export interface TarjetasPortal {
  openGraph: {
    type: 'website';
    locale: 'es_ES';
    siteName: string;
    title: string;
    description: string;
    images?: string[];
  };
  twitter: {
    card: 'summary' | 'summary_large_image';
    title: string;
    description: string;
    images?: string[];
  };
}

/** La imagen de la tarjeta: su portada › su logo › ninguna. */
export function imagenDeTarjeta(e: EstudioParaTarjeta, baseSupabase: string | null | undefined): { url: string; grande: boolean } | null {
  if (logoServible(e.portadaUrl, baseSupabase)) return { url: e.portadaUrl!.trim(), grande: true };
  if (logoServible(e.logoUrl, baseSupabase)) return { url: e.logoUrl!.trim(), grande: false };
  return null;
}

export function tarjetasDelPortal(
  e: EstudioParaTarjeta,
  descripcion: string,
  baseSupabase: string | null | undefined,
): TarjetasPortal {
  const imagen = imagenDeTarjeta(e, baseSupabase);
  const images = imagen ? { images: [imagen.url] } : {};
  return {
    openGraph: {
      type: 'website',
      locale: 'es_ES',
      siteName: e.nombre,
      title: e.nombre,
      description: descripcion,
      ...images,
    },
    twitter: {
      // Una portada se lee en grande; un logo (o nada) va en la tarjeta pequeña,
      // donde no se estira un logo cuadrado a lo ancho.
      card: imagen?.grande ? 'summary_large_image' : 'summary',
      title: e.nombre,
      description: descripcion,
      ...images,
    },
  };
}
