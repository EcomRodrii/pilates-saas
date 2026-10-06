import type { Metadata } from 'next';
import { LandingCliente } from '@/components/landing/LandingCliente';
import { SeccionGuias } from '@/components/landing/SeccionGuias';
import { SeccionBento } from '@/components/landing/SeccionBento';
import { SeccionEnUnaFrase } from '@/components/landing/SeccionEnUnaFrase';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// La home tiene sus PROPIOS metadatos (fase 5 del SEO, 23-sep). Hasta entonces
// esta página era un componente de cliente, no podía exportarlos y heredaba
// título, descripción y canonical del layout raíz; y como el layout declaraba
// `canonical: '/'`, cualquier página nueva sin canonical propio habría quedado
// declarada como copia de la home. El canonical se quitó del layout
// (lib/seo/paginas.test.ts vigila que cada página indexable declare el suyo).
//
// Título, descripción y URL salen del registro (`paginaDe('/')`), la misma
// fuente que el sitemap y los tests: una sola frase, en un solo sitio.
const pagina = paginaDe('/')!;

const COMPARTIR = {
  titulo: 'El software que lleva tu estudio de Pilates.',
  descripcion: 'Reservas, app con tu marca, cobros y sustituciones de instructora en un solo panel. Pruébalo 7 días gratis, sin tarjeta.',
  imagen: '/og-image.png',
  alt: 'Tentare',
};

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe('/') },
  // Un `openGraph` de página SUSTITUYE al del layout entero (no se fusiona por
  // claves), así que repite las que el layout ponía: tipo, idioma y nombre.
  //
  // Lo que sale en la vista previa al compartir el enlace (WhatsApp, iMessage,
  // Telegram, LinkedIn...). El `<title>` y la descripción de arriba son los del
  // buscador y se quedan como están; esto es otro texto, para otra situación.
  //
  // La imagen es una PNG estática (`public/og-image.png`, copia de
  // `docs/marca/redes/publicaciones/tentare-compartir-1200x630.png`) y NO el
  // `app/opengraph-image.tsx` que había (diseño anterior a la marca actual): con
  // ese fichero-convención al lado habría dos `og:image` en la misma página. Se declara aquí con URL absoluta (`metadataBase` del layout).
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: COMPARTIR.titulo,
    description: COMPARTIR.descripcion,
    url: urlDe('/'),
    images: [{ url: COMPARTIR.imagen, width: 1200, height: 630, alt: COMPARTIR.alt, type: 'image/png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: COMPARTIR.titulo,
    description: COMPARTIR.descripcion,
    images: [{ url: COMPARTIR.imagen, width: 1200, height: 630, alt: COMPARTIR.alt }],
  },
};

export default function HomePage() {
  return <LandingCliente guias={<SeccionGuias />} bento={<SeccionBento />} frase={<SeccionEnUnaFrase />} />;
}
