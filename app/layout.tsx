import type { Metadata } from 'next';
import { BASE_URL } from '@/lib/seo/paginas';
import { GRATIS_CON_LIMITES } from '@/lib/landing/founding-gratis';
import { ProveedoresRaiz } from '@/components/raiz/proveedores-raiz';
import { AhrefsAnalytics } from '@/components/analitica/ahrefs';
import { MetaPixel } from '@/components/analitica/meta-pixel';
import { VERIFICACION_DOMINIO_META } from '@/lib/meta-pixel-reglas';
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
  // Pilates Y yoga, como el resto de la web (decisión del fundador), y las bajas
  // «con tu visto bueno»: el modo por defecto es asistido, no se cubren solas
  // (fase 1 de la web, 19-oct-2026). Lo heredan las páginas sin metadatos propios.
  title: 'Software de gestión para estudios de Pilates y yoga | Tentare',
  description: `Reservas desde la app de tu estudio, cobros que se reintentan solos y sustituciones con tu visto bueno. Para estudios de Pilates y yoga. ${GRATIS_CON_LIMITES}.`,
  // Sin `alternates.canonical` aquí (23-sep): un canonical en el layout raíz lo
  // heredan TODAS las páginas que no declaran el suyo, y las declara como copia de
  // la home. Cada página indexable pone el suyo; la home, en app/page.tsx.
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    locale: 'es_ES',
    title: 'Tentare: software para estudios de Pilates y yoga',
    description: `Reservas, cobros, bonos y sustituciones de instructoras para estudios de Pilates y yoga. Sin permanencia. ${GRATIS_CON_LIMITES}.`,
  },
  // Solo la tarjeta, sin título ni descripción (fase 3, 20-oct-2026): los metadatos
  // se mezclan SIN profundidad, así que una página sin `twitter` propio heredaba
  // este título («solo Pilates») y esta frase («cubre las bajas solo», que no es
  // cierta) en unas 70 URLs. Sin ellos, X lee `og:title` y `og:description` de
  // cada página, que sí son los suyos.
  twitter: { card: 'summary_large_image' },
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
  // Verificación del dominio en el Business Manager de Meta (anuncios). Lo
  // piden en el HTML de la home; las páginas que no declaran `other` lo heredan.
  other: { 'facebook-domain-verification': VERIFICACION_DOMINIO_META },
};

// El panel de DEMOSTRACIÓN (lib/demo/panel): si ESTA pestaña lo ha pedido desde /demo (una marca en sessionStorage, con
// caducidad de 2 h), se carga `public/demo-panel.js` antes que cualquier otro script. Ese fichero atiende en memoria todo lo que
// el panel pide y deja el estudio ficticio de ejemplo: no sale ni una petición hacia la base de datos real. Una pestaña normal no
// tiene la marca y no carga nada. La carga es síncrona (document.write) a propósito: tiene que ejecutarse ANTES de que el
// cliente de Supabase se construya y capture `fetch`.
const CARGADOR_PANEL_DEMO = `try{var d=JSON.parse(sessionStorage.getItem('tentare:demo-panel')||'null');if(d&&Date.now()-d.t<72e5){document.write('<script src="/demo-panel.js"><\\/script>')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${variablesDeFuente} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CARGADOR_PANEL_DEMO }} />
      </head>
      <body className="bg-background">
        <LogSetup />
        {/* Fuera de los providers a propósito: no depende de sesión ni de
            estudio, y así no vuelve a montarse cada vez que uno de los dos
            reevalúa. Decide por sí mismo en qué rutas mide — ver
            lib/ahrefs-cliente.ts. */}
        <AhrefsAnalytics />
        {/* Píxel de Meta: solo web comercial y alta, solo en producción y solo
            con el sí de la visitante — ver lib/meta-pixel-reglas.ts. */}
        <MetaPixel />
        {/* `AuthProvider` + `StudioProvider`, salvo en la app de la alumna, que
            no los usa y se ahorra su código. Ver proveedores-raiz.tsx. */}
        <ProveedoresRaiz>{children}</ProveedoresRaiz>
      </body>
    </html>
  );
}
