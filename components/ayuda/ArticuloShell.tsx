import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AyudaBreadcrumbs, type Miga } from './AyudaBreadcrumbs';
import { AyudaArticleStructuredData, AyudaBreadcrumbStructuredData } from './AyudaStructuredData';
import { AyudaRelacionados } from './AyudaRelacionados';
import { AyudaFeedback } from './AyudaFeedback';
import { AyudaCTASoporte } from './AyudaCTASoporte';
import { FichaGuia } from './FichaGuia';
import { NavegacionRuta } from './NavegacionRuta';
import { MUTED } from '@/components/landing/theme';
import { articuloDe, categoriaDe, relacionadosDe, urlArticulo, type ArticuloAyuda } from '@/lib/ayuda/registro';
import { fichaDe, rutaDeGuia } from '@/lib/ayuda/academy';
import type { VideoAyuda } from '@/lib/ayuda/videos';

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

// Chrome compartido de una página de artículo (guía o problema): migas de pan,
// título, descripción, autoría, cuerpo (children — cada artículo trae el suyo,
// con <AyudaPaso>/<AyudaCaptura>/etc.), relacionados y feedback. Un artículo de
// tipo "problema" no cambia este chrome — cambia la ESTRUCTURA interna de su
// contenido, que sigue components/ayuda/TroubleshootShell.tsx.
// La guía anterior o siguiente de su ruta, resuelta con título y enlace (o null).
function enlaceDeRuta(clave: string | null) {
  if (!clave) return null;
  const [c, s] = clave.split('/');
  const a = articuloDe(c, s);
  return a && a.estado === 'publicado' ? { href: urlArticulo(a), titulo: a.titulo } : null;
}

export function ArticuloShell({ articulo, video = null, children }: { articulo: ArticuloAyuda; video?: VideoAyuda | null; children: React.ReactNode }) {
  const clave = `${articulo.categoria}/${articulo.slug}`;
  const enRuta = rutaDeGuia(clave);
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
      <IslaWeb />

      <article style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px,5vw,56px) clamp(20px,4vw,44px) clamp(60px,8vw,88px)' }}>
        <AyudaBreadcrumbs items={migas} />
        <h1 style={{ fontWeight: 800, fontSize: 'clamp(28px,3.6vw,40px)', lineHeight: 1.08, letterSpacing: '-.03em', margin: '0 0 14px' }}>{articulo.titulo}</h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: MUTED, margin: '0 0 18px' }}>{articulo.descripcion}</p>
        <div className="lp-mono" style={{ display: 'flex', gap: 14, fontSize: 12, color: '#8E8E86', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #E7E7E0' }}>
          <span>Equipo Tentare</span>
          <span>·</span>
          <span>Actualizado el {fecha(articulo.actualizado)}</span>
        </div>

        <FichaGuia
          clave={clave}
          ficha={fichaDe(clave)}
          video={video}
          ruta={enRuta ? { titulo: enRuta.ruta.titulo, posicion: enRuta.indice + 1, total: enRuta.ruta.guias.length } : null}
        />

        <div style={{ fontSize: 15.5, lineHeight: 1.7, color: '#1A1A1A' }}>{children}</div>

        {enRuta && <NavegacionRuta rutaTitulo={enRuta.ruta.titulo} anterior={enlaceDeRuta(enRuta.anterior)} siguiente={enlaceDeRuta(enRuta.siguiente)} />}

        <AyudaCTASoporte />
        <AyudaRelacionados articulos={relacionadosDe(articulo)} />
        <AyudaFeedback categoria={articulo.categoria} articulo={articulo.slug} />
      </article>

      <PieWeb />
    </PageShell>
  );
}
