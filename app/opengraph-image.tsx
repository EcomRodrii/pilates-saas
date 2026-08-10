import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

// Imagen OG/Twitter de la home. Hasta hoy no existía NINGUNA imagen social en
// todo el sitio (verificado: cero `openGraph.images` en toda la app) —
// compartir tentare.app en WhatsApp/LinkedIn/Twitter no mostraba nada.
// Este fichero-convención de Next.js SOLO cubre "/" — cada ruta que
// necesite la suya tiene su propio opengraph-image.tsx (ver lib/og-image.tsx).

export const alt = 'Tentare — Software para estudios de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('El software que lleva tu estudio de Pilates.', 'Reservas, cobros y equipo en un panel — y el único que cubre una baja de instructora solo.');
}
