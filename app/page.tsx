import type { Metadata } from 'next';
import { LandingCliente } from '@/components/landing/LandingCliente';
import { Inter_Tight } from 'next/font/google';
import { Cabecera } from '@/components/home-nueva/cabecera';
import { Revelar } from '@/components/home-nueva/revelar';
import { Beneficios, Confianza, Contacto, Funciones, Heroe, LlamadaFinal, Pie, Preguntas, Precios } from '@/components/home-nueva/secciones';
import { estadoDemo } from '@/lib/demo/interruptor';
import '@/components/home-nueva/figma.css';
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

// La home nueva (nov-2026): el diseño de Figma de la diseñadora, en español, con la identidad y los datos reales de Tentare (planes y
// precios de `PLAN_INFO`, preguntas de `FAQ_ITEMS`, logos de estudios con consentimiento, el panel real en el héroe, el pie de la web
// pública). Sustituye a la home anterior (héroe + «Lo que antes te llevaba la tarde» + producto por áreas + momentos + etapas…).
//
// ⚠️ El <h1> empieza por TEXTO (e2e/landing-h1-texto.spec.ts): la categoría que se busca («Software de gestión para estudios de Pilates
// y yoga») va primero y en pequeño; la promesa del fundador va dentro, en grande. Los datos estructurados (JSON-LD) y la medición siguen
// en LandingCliente; aquí solo cambia lo que se ve.
//
// «Pedir una demo» abre la demo personalizada (/demo) cuando está abierta a todos (lib/demo/interruptor.ts); si no, baja al contacto.
const fuente = Inter_Tight({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--lf-fuente', display: 'swap' });

export default async function HomePage() {
  const logos = await logosClientesLanding();
  const demoHref = estadoDemo(process.env.DEMO_PERSONALIZADA).boton ? '/demo' : '#contacto';
  return (
    <LandingCliente conArmazonPropio>
      <div className={`${fuente.variable} lf`}>
        <Revelar />
        <Cabecera />
        <main>
          <Heroe demoHref={demoHref} />
          <Confianza logos={logos} />
          <Funciones />
          <Beneficios />
          <LlamadaFinal />
          <Precios />
          <Preguntas />
          <Contacto />
        </main>
        <Pie />
      </div>
    </LandingCliente>
  );
}
