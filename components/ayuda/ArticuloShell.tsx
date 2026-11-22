import { PageShell } from '@/components/recursos/PageShell';
import { AyudaMarco } from './AyudaMarco';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AyudaBreadcrumbs, type Miga } from './AyudaBreadcrumbs';
import { AyudaArticleStructuredData, AyudaBreadcrumbStructuredData } from './AyudaStructuredData';
import { AyudaRelacionados } from './AyudaRelacionados';
import { AyudaFeedback } from './AyudaFeedback';
import { AyudaCTASoporte } from './AyudaCTASoporte';
import { VideoDeGuia } from './VideoDeGuia';
import { categoriaDe, relacionadosDe, urlArticulo, type ArticuloAyuda } from '@/lib/ayuda/registro';
import type { VideoAyuda } from '@/lib/ayuda/videos';

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

// Chrome compartido de una página de artículo (guía o problema): migas de pan,
// título, descripción, autoría, cuerpo (children — cada artículo trae el suyo,
// con <AyudaPaso>/<AyudaCaptura>/etc.), relacionados y feedback. Un artículo de
// tipo "problema" no cambia este chrome — cambia la ESTRUCTURA interna de su
// contenido, que sigue components/ayuda/TroubleshootShell.tsx.
export function ArticuloShell({ articulo, video = null, children }: { articulo: ArticuloAyuda; video?: VideoAyuda | null; children: React.ReactNode }) {
  const clave = `${articulo.categoria}/${articulo.slug}`;
  const migas: Miga[] = [
    { label: 'Inicio', href: '/ayuda' },
    // El TÍTULO de la categoría, no su slug: la miga decía «instructores» donde
    // la pantalla anterior dice «Instructoras y equipo», y eso viajaba también
    // al BreadcrumbList del JSON-LD.
    { label: categoriaDe(articulo.categoria)?.titulo ?? articulo.categoria, href: `/ayuda/${articulo.categoria}` },
    { label: articulo.titulo },
  ];
  // La etiqueta legible de categoría se resuelve en la página (generateMetadata
  // ya la necesita), así que aquí solo se pasa por prop para no duplicar el import.
  return (
    <PageShell>
      <OrganizationStructuredData />
      <AyudaBreadcrumbStructuredData items={migas} />
      <AyudaArticleStructuredData titulo={articulo.titulo} descripcion={articulo.descripcion} path={urlArticulo(articulo)} actualizado={articulo.actualizado} />

      <AyudaMarco>
        <AyudaBreadcrumbs items={migas} />
        <h1 className="ay-h1">{articulo.titulo}</h1>
        <p className="ay-intro">{articulo.descripcion}</p>
        <div className="ay-meta">
          <span>Equipo Tentare</span>
          <span>·</span>
          <span>Actualizado el {fecha(articulo.actualizado)}</span>
        </div>

        <VideoDeGuia clave={clave} video={video} />

        <div className="ay-cuerpo">{children}</div>

        <AyudaCTASoporte />
        <AyudaRelacionados articulos={relacionadosDe(articulo)} />
        <AyudaFeedback categoria={articulo.categoria} articulo={articulo.slug} />
      </AyudaMarco>
    </PageShell>
  );
}
