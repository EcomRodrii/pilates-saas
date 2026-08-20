import type { Metadata, Viewport } from 'next';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { getStudioSeo } from '@/lib/studio-seo';
import { BASE_URL } from '@/lib/seo/paginas';
import { EstudioStructuredData } from '@/components/seo/estudio-structured-data';
import { getThemePublicado } from '@/lib/theme-data';
import { metadatosPublicos } from '@/lib/theme/seo-publico';
import { cookies } from 'next/headers';
import { veredictoPagina, nombreCookieAcceso } from '@/lib/publico/acceso-pagina';
import { PaginaOculta } from '@/components/publico/pagina-oculta';
import { ThemeStyle } from '@/components/theme-style';
import { ThemePreviewListener } from '@/components/theme/theme-preview-listener';
import { urlMonograma } from '@/lib/monograma-estudio';

// Metadata server-rendered (I-9): título/descripción/Open Graph con el nombre y
// la ciudad del estudio. Sirve para lo que la socia comparte por WhatsApp y
// para los previsualizadores de enlaces — NO para buscadores (ver abajo).
//
// ⚠️ Estas páginas SÍ se indexan desde el 2026-08-17, por decisión expresa del
// fundador. Antes no, y el motivo escrito era: prioridad de SEO B2B y no querer
// miles de URLs B2C, una por estudio.
//
// Se levantan las DOS puertas a la vez —esta y `PREFIJOS_NO_INDEXABLES` en
// lib/seo/paginas.ts— porque levantar solo una no hace nada: Google no puede
// leer una etiqueta de una URL que le hemos prohibido rastrear. Es la misma
// razón por la que antes había que cerrarlas a la vez.
//
// ⚠️ **Indexar sin `canonical` habría sido peor que no indexar.** Esta página
// vive con parámetros: `?tab=` (5 valores), `?embed=1`, `?fondo=`, `?texto=`,
// `?ref=` del widget, `?solo-pestana=1`… Cada combinación es una URL distinta
// con el MISMO contenido, así que sin canonical un solo estudio genera decenas
// de duplicados que compiten entre sí y reparten la autoridad. El canonical
// apunta siempre a la URL limpia.
//
// Sigue sin indexarse lo que no debe: una página OCULTA (la propietaria aún la
// está preparando) y un slug que no existe.
// ⚠️ `env(safe-area-inset-bottom)` estaba usado en el pie fijo de la hoja de
// reserva (reserva-calendario.tsx) desde hacía tiempo… y no hacía NADA: sin
// `viewportFit: 'cover'` iOS devuelve 0 para todos los `env(safe-area-*)`. O
// sea, el código parecía correcto, el CTA quedaba a 14px del borde real y en un
// iPhone con barra de gestos el botón de pagar caía justo debajo de ella.
// Mismo motivo y mismo comentario que en app/portal/[slug]/layout.tsx.
//
// `maximumScale` NO se fija aquí a propósito, al revés que en el portal: esto
// es una pantalla pública donde alguien puede necesitar ampliar para leer, y
// bloquear el zoom es una barrera de accesibilidad. El zoom automático de iOS
// al enfocar un input se evita por la vía correcta —inputs de 16px—, no
// prohibiendo ampliar.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  if (!studio) {
    return { title: 'Reservar clase de Pilates', robots: { index: false, follow: false } };
  }
  // La URL limpia de esta página, sin un solo parámetro. Es lo que se declara
  // como canónica y lo que se ofrece al sitemap.
  const canonica = `${BASE_URL}/reservar/${slug}`;
  // Favicon del estudio (white-label) y su texto para compartir/buscadores,
  // si los tiene configurados en su tema.
  const theme = await getThemePublicado(studio.id);
  // El texto sale de una función pura y probada: mientras el estudio no
  // escriba lo suyo, es carácter por carácter el mismo que se indexaba antes
  // de que estos campos existieran.
  const { titulo, descripcion, imagen, tarjeta } = metadatosPublicos(studio, theme);
  // `imagen` ya nunca viene vacía: sin la del estudio entra la de por defecto,
  // relativa, que `metadataBase` (app/layout.tsx) convierte en absoluta. Antes
  // esto era condicional porque un `images: [undefined]` renderiza una etiqueta
  // `og:image` vacía, que a algunos scrapers les gusta menos que ninguna.
  const imagenes = { images: [imagen] };
  return {
    title: titulo,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, type: 'website', locale: 'es_ES', ...imagenes },
    twitter: { card: tarjeta, title: titulo, description: descripcion, ...imagenes },
    // Indexable salvo que el estudio la tenga OCULTA mientras la prepara: eso
    // no es contenido publicado, y además el layout la sustituye por la pantalla
    // de acceso, así que lo que se indexaría sería el cartel, no el estudio.
    robots: studio.paginaOculta
      ? { index: false, follow: false }
      : { index: true, follow: true },
    // Sin esto, `?tab=citas`, `?embed=1`, `?ref=abc`… serían páginas distintas
    // con el mismo contenido. Ver la cabecera.
    alternates: { canonical: canonica },
    // Sin favicon propio entra el monograma (inicial + color de marca): antes
    // caía al favicon RAÍZ, que es el de Tentare — la pestaña del navegador de
    // esta página enseñaba la marca de otro negocio.
    icons: { icon: theme.faviconUrl || urlMonograma(studio.nombre, studio.colorPrimario, 192) },
  };
}

export default async function ReservarSlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const visitante = await getStudioSeo(slug);

  // El gate va en el LAYOUT del servidor, antes de montar nada: así el HTML
  // que sale por el cable no contiene la página, en vez de pintarla y taparla
  // con un cartel que cualquiera quita desde el inspector.
  //
  // ⚠️ Esto oculta la PÁGINA, no los datos — la API pública del estudio sigue
  // respondiendo. Es lo que se pidió («que no se vea todavía») y lo que se
  // puede prometer; la cerradura de los datos en este repo es siempre la RLS.
  if (visitante?.paginaOculta) {
    const galleta = await cookies();
    const veredicto = veredictoPagina({
      oculta: true,
      tieneClave: visitante.paginaTieneClave,
      pase: galleta.get(nombreCookieAcceso(visitante.id))?.value,
      studioId: visitante.id,
    });
    if (veredicto !== 'abierta') {
      return <PaginaOculta nombre={visitante.nombre} slug={slug} pideClave={veredicto === 'pide-clave'} />;
    }
  }
  // Resolvemos el estudio en el SERVIDOR (misma consulta cacheada que la
  // metadata): el gate monta el StudioProvider al instante, sin round-trip de
  // cliente ni el flash en blanco previo.
  const studio = await getStudioSeo(slug);
  return (
    <StudioSlugGate slug={slug} initialStudioId={studio?.id ?? null} initialResuelto>
      {/* Negocio local, para que Google sepa que detrás de esta página de
          reservas hay un estudio con nombre, dirección y teléfono — lo que
          decide si aparece en el paquete local de «pilates cerca de mí».
          Solo si la página es indexable: describir como negocio abierto una
          página que la propietaria tiene OCULTA sería anunciar lo que ella ha
          decidido no publicar todavía. */}
      {studio && !studio.paginaOculta && (
        <EstudioStructuredData
          estudio={{
            nombre: studio.nombre,
            url: `${BASE_URL}/reservar/${slug}`,
            direccion: studio.direccion,
            ciudad: studio.ciudad,
            codigoPostal: studio.codigoPostal,
            telefono: studio.telefono,
            email: studio.email,
            descripcion: studio.descripcion,
            // La foto del local; el logo no sirve como `image` de un negocio.
            imagenUrl: studio.fotoUrl,
          }}
        />
      )}
      <ThemeStyle slug={slug} />
      <ThemePreviewListener />
      {children}
    </StudioSlugGate>
  );
}
