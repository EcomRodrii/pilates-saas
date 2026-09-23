import type { Metadata } from 'next';
import { LandingCliente } from '@/components/landing/LandingCliente';
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

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe('/') },
  // Un `openGraph` de página SUSTITUYE al del layout entero (no se fusiona por
  // claves), así que repite las que el layout ponía: tipo, idioma y nombre.
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: 'Tu estudio sigue funcionando aunque sueltes el móvil',
    description:
      'Reservas desde la app de tu estudio, bajas de instructoras que se cubren y cobros que se reintentan solos. Software de gestión para estudios de Pilates, desde 29 €/mes y sin permanencia.',
    url: urlDe('/'),
  },
  twitter: {
    card: 'summary_large_image',
    site: '@tentaresoftware',
    title: 'Tu estudio sigue funcionando aunque sueltes el móvil',
    description:
      'Software de gestión para estudios de Pilates: reservas, bajas cubiertas y cobros que se reintentan solos.',
  },
};

export default function HomePage() {
  return <LandingCliente />;
}
