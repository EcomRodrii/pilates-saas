import { paginaDe, urlDe, BASE_URL } from '@/lib/seo/paginas';
import { LEGAL } from '@/lib/legal-info';

// JSON-LD de una página de /funcionalidades: miga de pan de tres niveles +
// WebPage.
//
// ⚠️ A propósito NO lleva `SoftwareApplication`. Ese tipo describe el PRODUCTO
// Tentare, que es una sola entidad: repetirlo en once páginas le da a Google
// once declaraciones del mismo software con `url` distinta y descripciones
// parecidas — la señal de duplicado que estas páginas deben evitar. Vive solo
// en `/` (components/landing/StructuredData.tsx) y en `/precios`, que es donde
// están las ofertas.
//
// Los datos salen del registro, no de parámetros sueltos: así el `<title>` de
// la página y el `name` del JSON-LD no pueden divergir.
export function FeatureStructuredData({ path }: { path: string }) {
  const pagina = paginaDe(path);
  if (!pagina) return null;
  const url = urlDe(path);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Funcionalidades', item: urlDe('/funcionalidades') },
      { '@type': 'ListItem', position: 3, name: pagina.etiqueta, item: url },
    ],
  };

  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pagina.titulo,
    description: pagina.descripcion,
    url,
    inLanguage: 'es-ES',
    isPartOf: { '@type': 'WebSite', name: LEGAL.marca, url: BASE_URL },
    about: { '@type': 'SoftwareApplication', name: LEGAL.marca, url: BASE_URL },
    ...(pagina.actualizado ? { dateModified: pagina.actualizado } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
