import type { Metadata } from 'next';
import { BASE_URL } from '@/lib/seo/paginas';
import { Plus_Jakarta_Sans, Instrument_Serif, Instrument_Sans, Outfit, Poppins } from 'next/font/google';
import { StudioProvider } from '@/lib/studio-context';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
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

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'Tentare — Software para estudios de Pilates | Reservas, cobros y sustituciones',
  description:
    'El software completo para tu estudio de Pilates en España: reservas, cobros, calendario, alumnas e instructoras — y el que cubre las bajas de instructoras solo. Sin permanencia, desde 29€/mes.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: 'Tentare — Software para estudios de Pilates',
    description:
      'Todo tu estudio de Pilates en un solo software — y el que cubre las bajas de instructoras solo. Sin permanencia, desde 29€/mes.',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tentare — Software para estudios de Pilates',
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
    <html lang="es" className={`${jakarta.variable} ${instrumentSerif.variable} ${instrumentSans.variable} ${outfit.variable} ${poppins.variable} antialiased`}>
      <body className="bg-background">
        <AuthProvider>
          <StudioProvider>{children}</StudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
