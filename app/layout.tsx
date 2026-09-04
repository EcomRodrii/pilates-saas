import type { Metadata } from 'next';
import { BASE_URL } from '@/lib/seo/paginas';
import { Plus_Jakarta_Sans, Instrument_Serif, Instrument_Sans, Outfit, Poppins, Cormorant_Garamond, Libre_Caslon_Text, Figtree, IBM_Plex_Mono } from 'next/font/google';
import { StudioProvider } from '@/lib/studio-context';
import { AuthProvider } from '@/lib/auth-context';
import { AhrefsAnalytics } from '@/components/analitica/ahrefs';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

// Fuente mono del rediseño de /reservar (lib/reservar-publico-tokens.ts) —
// las etiquetas en versalitas (fecha, hora, "plazas libres") y los precios.
// Mismo criterio self-hosted que el resto: next/font en vez de un <link> a
// fonts.googleapis.com en tiempo de ejecución.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['400', '500'],
  display: 'swap',
});

// Las dos familias del portal de la clienta (lib/portal-design.ts). Van por
// `next/font`, que las descarga en build y las sirve desde nuestro propio
// dominio: cero petición a fonts.googleapis.com en tiempo de ejecución, cero
// FOUT y nada que enseñarle a la clienta sobre lo que visita.
//
// La cursiva de la serif NO es decorativa en este diseño —titula la mitad de
// las pantallas—, así que se pide explícitamente: sin ella el navegador la
// falsearía inclinando la redonda, que en una Didone se nota a la legua.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-display',
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
});

// El diseño solo usa 400/500/600, pero se carga también el 700: las 14
// pantallas del portal que aún no se han migrado piden 700 y 800, y sin un
// grueso real el navegador falsea la negrita engordando el trazo — que en una
// grotesca se ve sucio. El 800 cae al 700, que sí existe.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Titular alternativo del tema "Geométrico" (lib/theme-definitions.ts) — solo
// se aplica cuando el estudio elige ese tema, vía --portal-heading-font
// (lib/theme-runtime.ts). Se carga siempre (como las otras) porque next/font
// no admite carga condicional por tenant; el coste es fijo y pequeño.
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Tema "Bloom" (lib/theme-definitions.ts, FUENTES en lib/theme-schema.ts) —
// `fontId: 'poppins'` ya estaba en el set curado desde antes, pero sin este
// registro `--font-poppins` no existía y el fallback silencioso a system-ui
// se aplicaba siempre. Mismo criterio que `outfit`: coste fijo, se carga
// siempre, no condicional por tenant.
const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-poppins',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Tema "Tentada" (themes/tentada/) — la serif de los titulares del portal de
// la alumna. Se piden 500/600 y la CURSIVA porque el diseño titula con las dos
// («Hola, Laura» en redonda, «hoy toca cuidarte» y la nota del bono en
// cursiva): sin la cursiva real el navegador inclina la redonda, y en una
// Garamond eso se nota tanto como en la Instrument Serif del portal de siempre
// (ver el comentario de `instrumentSerif` arriba). Mismo criterio que `outfit`
// y `poppins`: coste fijo, se carga siempre, `next/font` no admite carga
// condicional por tenant.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

// Tema "Sereno" (themes/sereno/) — las DOS familias del tema son nuevas en el
// repo, a diferencia de los cuatro anteriores, que reusaban lo ya cargado
// salvo la Garamond de Tentada.
//
// Libre Caslon Text titula: el saludo, el nombre de la clase, los titulares de
// las hojas y el numerazo del bono. Se pide la CURSIVA porque la cita del
// estudio va en cursiva de verdad (mismo motivo que Instrument Serif y
// Cormorant: sin ella el navegador inclina la redonda, y en una Caslon se nota
// tanto como en las otras dos). El 700 entra porque `--section-title-weight`
// de Sereno es 600 en la SANS pero la display se usa a 400 y a 700 en el
// prototipo (nombre de clase vs. rótulos fuertes).
const libreCaslon = Libre_Caslon_Text({
  subsets: ['latin'],
  variable: '--font-libre-caslon',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

// El cuerpo de Sereno. Se piden 300-700 porque el prototipo usa 500/600 en
// metadatos y rótulos y 700 en los importes. Mismo criterio que `outfit`,
// `poppins` y `cormorant`: coste fijo, se carga siempre, `next/font` no admite
// carga condicional por tenant.
const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'Software de Gestión para Estudios de Pilates en Barcelona',
  description:
    'Gestiona tu estudio de Pilates en Barcelona con reservas, pagos, calendario y sustituciones automáticas. Sin permanencia y desde 29 €/mes.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: 'Software para estudios de Pilates en Barcelona',
    description:
      'Todo tu estudio de Pilates en un solo software — y el que cubre las bajas de instructoras solo. Sin permanencia, desde 29€/mes.',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    // @tentaresoftware es la cuenta real de la marca (el mismo handle que
    // enlaza el pie de la landing, components/landing/SeccionCtaFinal.tsx) —
    // sin `site` aquí, una tarjeta compartida no atribuye la mención a nadie.
    site: '@tentaresoftware',
    title: 'Software para estudios de Pilates en Barcelona',
    description:
      'Todo tu estudio de Pilates en un solo software — y el que cubre las bajas de instructoras solo.',
  },
  // El código lo da Search Console al añadir la propiedad (Ajustes →
  // Verificación de la propiedad → etiqueta HTML) — no es algo que se pueda
  // generar aquí. Sin GOOGLE_SITE_VERIFICATION en el entorno, esta clave se
  // omite entera: un `content="undefined"` sería peor que no tener la
  // etiqueta. La verificación no es requisito para que Google indexe el
  // sitio (ya lo rastrea sin ella), pero sin ella nadie puede ver el estado
  // de indexación real ni pedir un re-rastreo manual de una URL concreta.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jakarta.variable} ${instrumentSerif.variable} ${instrumentSans.variable} ${outfit.variable} ${poppins.variable} ${cormorant.variable} ${libreCaslon.variable} ${figtree.variable} ${plexMono.variable} antialiased`}>
      <body className="bg-background">
        {/* Fuera de los providers a propósito: no depende de sesión ni de
            estudio, y así no vuelve a montarse cada vez que uno de los dos
            reevalúa. Decide por sí mismo en qué rutas mide — ver
            lib/ahrefs-cliente.ts. */}
        <AhrefsAnalytics />
        <AuthProvider>
          <StudioProvider>{children}</StudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
