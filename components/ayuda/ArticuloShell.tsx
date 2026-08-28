import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AyudaBreadcrumbs, type Miga } from './AyudaBreadcrumbs';
import { AyudaArticleStructuredData, AyudaBreadcrumbStructuredData } from './AyudaStructuredData';
import { AyudaRelacionados } from './AyudaRelacionados';
import { AyudaFeedback } from './AyudaFeedback';
import { AyudaCTASoporte } from './AyudaCTASoporte';
import { MUTED } from '@/components/landing/theme';
import { relacionadosDe, urlArticulo, type ArticuloAyuda } from '@/lib/ayuda/registro';

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

// Chrome compartido de una página de artículo (guía o problema): migas de pan,
// título, descripción, autoría, cuerpo (children — cada artículo trae el suyo,
// con <AyudaPaso>/<AyudaCaptura>/etc.), relacionados y feedback. Un artículo de
// tipo "problema" no cambia este chrome — cambia la ESTRUCTURA interna de su
// contenido, que sigue components/ayuda/TroubleshootShell.tsx.
export function ArticuloShell({ articulo, children }: { articulo: ArticuloAyuda; children: React.ReactNode }) {
  const migas: Miga[] = [
    { label: 'Inicio', href: '/ayuda' },
    { label: articulo.categoria, href: `/ayuda/${articulo.categoria}` },
    { label: articulo.titulo },
  ];
  // La etiqueta legible de categoría se resuelve en la página (generateMetadata
  // ya la necesita), así que aquí solo se pasa por prop para no duplicar el import.
  return (
    <PageShell>
      <OrganizationStructuredData />
      <AyudaBreadcrumbStructuredData items={migas} />
      <AyudaArticleStructuredData titulo={articulo.titulo} descripcion={articulo.descripcion} path={urlArticulo(articulo)} actualizado={articulo.actualizado} />
      <SiteNav backHref="/ayuda" backLabel="Centro de Ayuda" />

      <article style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px,5vw,56px) clamp(20px,4vw,44px) clamp(60px,8vw,88px)' }}>
        <AyudaBreadcrumbs items={migas} />
        <h1 style={{ fontWeight: 800, fontSize: 'clamp(28px,3.6vw,40px)', lineHeight: 1.08, letterSpacing: '-.03em', margin: '0 0 14px' }}>{articulo.titulo}</h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: MUTED, margin: '0 0 18px' }}>{articulo.descripcion}</p>
        <div className="lp-mono" style={{ display: 'flex', gap: 14, fontSize: 12, color: '#8E8E86', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #E7E7E0' }}>
          <span>Equipo Tentare</span>
          <span>·</span>
          <span>Actualizado el {fecha(articulo.actualizado)}</span>
        </div>

        <div style={{ fontSize: 15.5, lineHeight: 1.7, color: '#1A1A1A' }}>{children}</div>

        <AyudaCTASoporte />
        <AyudaRelacionados articulos={relacionadosDe(articulo)} />
        <AyudaFeedback categoria={articulo.categoria} articulo={articulo.slug} />
      </article>

      <SiteFooter links={[{ href: '/ayuda', label: 'Centro de Ayuda' }, { href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }]} />
    </PageShell>
  );
}
