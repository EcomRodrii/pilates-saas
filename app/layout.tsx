import type { Metadata } from 'next';
import { BASE_URL } from '@/lib/seo/paginas';
import { ProveedoresRaiz } from '@/components/raiz/proveedores-raiz';
import { AhrefsAnalytics } from '@/components/analitica/ahrefs';
import { LogSetup } from '@/components/log-setup';
import { variablesDeFuente } from './_fuentes/fuentes';
import './globals.css';

// El title/description/OG de aquí abajo llevaban la coletilla "en Barcelona"
// desde ba4c8134 (18-ago-2026, decisión de negocio explícita del fundador de
// reposicionar la home hacia Barcelona). #1200 ya había revertido el <h1> del
// hero a genérico (components/landing/SeccionHero.tsx) pero dejó esto sin
// tocar, dejando la home incoherente consigo misma — el propio JSON-LD
// (components/landing/StructuredData.tsx) siempre describió el producto como
// nacional ("para estudios de Pilates en España"), nunca como local. Retirado
// el 2026-09-10 (auditoría SEO, hallazgo 2): la apuesta "Barcelona primero"
// se da por descartada — confirmar con el fundador antes de reintroducirlo.
// La intención de búsqueda local la cubre ahora /network/instructoras/ciudad/
// barcelona (una vez arreglado su canonical, mismo audit, hallazgo 1).
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  // Con la marca al final (fase 5, 23-sep): era el único título del sitio sin
  // «Tentare», y es el de la página que más busca la marca.
  title: 'Software de gestión para estudios de Pilates | Tentare',
  description:
    'Reservas desde la app de tu estudio, cobros que se reintentan solos y bajas que se cubren. Software de gestión para estudios de Pilates, desde 29 €/mes.',
  // Sin `alternates.canonical` aquí (23-sep): un canonical en el layout raíz lo
  // heredan TODAS las páginas que no declaran el suyo, y las declara como copia de
  // la home. Cada página indexable pone el suyo; la home, en app/page.tsx.
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: 'Tentare: software para estudios de Pilates y Yoga',
    description:
      'Reservas, cobros, bonos y sustituciones de instructoras para estudios de Pilates y Yoga. Sin permanencia, desde 29 €/mes.',
  },
  twitter: {
    card: 'summary_large_image',
    // @tentaresoftware es la cuenta real de la marca (el mismo handle que
    // enlaza el pie de la landing, components/landing/SeccionCtaFinal.tsx) —
    // sin `site` aquí, una tarjeta compartida no atribuye la mención a nadie.
    site: '@tentaresoftware',
    title: 'Software para estudios de Pilates',
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
    <html lang="es" className={`${variablesDeFuente} antialiased`}>
      <body className="bg-background">
        <LogSetup />
        {/* Fuera de los providers a propósito: no depende de sesión ni de
            estudio, y así no vuelve a montarse cada vez que uno de los dos
            reevalúa. Decide por sí mismo en qué rutas mide — ver
            lib/ahrefs-cliente.ts. */}
        <AhrefsAnalytics />
        {/* `AuthProvider` + `StudioProvider`, salvo en la app de la alumna, que
            no los usa y se ahorra su código. Ver proveedores-raiz.tsx. */}
        <ProveedoresRaiz>{children}</ProveedoresRaiz>
      </body>
    </html>
  );
}
