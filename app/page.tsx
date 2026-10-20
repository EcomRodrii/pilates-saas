import type { Metadata } from 'next';
import { LandingCliente } from '@/components/landing/LandingCliente';
import { Heroe } from '@/components/web/home/Heroe';
import { SeisVerbos } from '@/components/web/home/SeisVerbos';
import { SeOcupaDelResto } from '@/components/web/home/SeOcupaDelResto';
import { BentoProducto } from '@/components/web/home/BentoProducto';
import { PestanasProducto } from '@/components/web/home/PestanasProducto';
import { FilasEditoriales } from '@/components/web/home/FilasEditoriales';
import { BandaComparador } from '@/components/web/home/BandaComparador';
import { Etapas } from '@/components/web/home/Etapas';
import { PrecioHome } from '@/components/web/home/PrecioHome';
import { PreguntasHome } from '@/components/web/home/PreguntasHome';
import { GuiasHome } from '@/components/web/home/GuiasHome';
import { CierreHome } from '@/components/web/home/CierreHome';
import '@/components/web/home/home.css';
import { FranjaLogos } from '@/components/landing/FranjaLogos';
import { logosClientesLanding } from '@/lib/landing/logos-clientes-servidor';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// La franja de logos de clientes se lee en servidor (solo estudios con
// consentimiento, lib/landing/logos-clientes-servidor.ts): la home se regenera
// como mucho cada hora en vez de congelarse en el build. Un consentimiento que
// se retira tarda como mucho una hora en salir de la landing.
export const revalidate = 3600;

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
  titulo: 'El software que lleva tu estudio de Pilates y yoga.',
  descripcion: 'Reservas y lista de espera, app con tu marca para tus alumnas, bonos y cobros en un solo panel, para estudios de Pilates y yoga. Empieza gratis, sin tarjeta.',
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
    siteName: 'Tentare',
    type: 'website',
    locale: 'es_ES',
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

// La composición de la home nueva (fase 2.2, 19-oct-2026), en su orden. Todo
// son componentes de servidor salvo las pestañas (su estado) y el armazón de
// LandingCliente (isla, pie, medición, popup):
//   héroe a sangre con los logos de estudios dentro (Mariana Tek + bsport) → seis verbos
//   (Momence) → «Tú das la clase» → bento del producto (bsport) → pestañas por
//   resultado (Momence) + vídeo → filas alternas (Mariana Tek/Momence) → banda
//   oscura hoy/con Tentare → etapas → precio → preguntas → guías → cierre.
export default async function HomePage() {
  const logos = await logosClientesLanding();
  return (
    <LandingCliente>
      <Heroe logos={<FranjaLogos logos={logos} />} />
      <SeisVerbos />
      <SeOcupaDelResto />
      <BentoProducto />
      <PestanasProducto />
      <FilasEditoriales />
      <BandaComparador />
      <Etapas />
      <PrecioHome />
      <PreguntasHome />
      <GuiasHome />
      <CierreHome />
    </LandingCliente>
  );
}
