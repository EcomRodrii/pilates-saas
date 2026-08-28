import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CATEGORIAS, articulosDe, categoriaDe, urlArticulo } from '@/lib/ayuda/registro';
import { AyudaIcono } from '@/components/ayuda/iconos';
import { AyudaBreadcrumbs } from '@/components/ayuda/AyudaBreadcrumbs';
import { AyudaBreadcrumbStructuredData } from '@/components/ayuda/AyudaStructuredData';
import { AyudaCTASoporte } from '@/components/ayuda/AyudaCTASoporte';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { ACC, MUTED } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

export function generateStaticParams() {
  return CATEGORIAS.map((c) => ({ categoria: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ categoria: string }> }): Promise<Metadata> {
  const { categoria: slug } = await params;
  const categoria = categoriaDe(slug);
  if (!categoria) return {};
  return {
    title: `${categoria.titulo} | Centro de Ayuda de Tentare`,
    description: categoria.descripcion,
    alternates: { canonical: urlDe(`/ayuda/${categoria.slug}`) },
  };
}

export default async function CategoriaPage({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria: slug } = await params;
  const categoria = categoriaDe(slug);
  if (!categoria) notFound();

  const articulos = articulosDe(categoria.slug);
  const migas = [{ label: 'Inicio', href: '/ayuda' }, { label: categoria.titulo }];

  return (
    <PageShell>
      <OrganizationStructuredData />
      <AyudaBreadcrumbStructuredData items={migas} />
      <SiteNav backHref="/ayuda" backLabel="Centro de Ayuda" />

      <header style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(32px,5vw,56px) clamp(20px,4vw,44px) 8px' }}>
        <AyudaBreadcrumbs items={migas} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, background: '#F1F2EA', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <AyudaIcono nombre={categoria.icono} size={20} color={ACC} />
          </span>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.4vw,36px)', letterSpacing: '-.03em', margin: 0 }}>{categoria.titulo}</h1>
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: MUTED, margin: '0 0 8px', maxWidth: 620 }}>{categoria.descripcion}</p>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px clamp(20px,4vw,44px) clamp(56px,7vw,80px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {articulos.map((a) => {
            const publicado = a.estado === 'publicado';
            const contenido = (
              <>
                <div>
                  <p style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 4px', color: publicado ? '#1A1A1A' : '#8E8E86' }}>{a.titulo}</p>
                  <p style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED, margin: 0 }}>{a.descripcion}</p>
                </div>
                {publicado ? <ArrowRight size={16} style={{ flex: 'none', color: '#8E8E86' }} /> : (
                  <span className="lp-mono" style={{ flex: 'none', fontSize: 10, color: '#A8A89F', background: '#F1F1EB', padding: '4px 9px', borderRadius: 999 }}>Próximamente</span>
                )}
              </>
            );
            const style: React.CSSProperties = {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              padding: '18px 20px', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16,
            };
            return publicado ? (
              <Link key={a.slug} href={urlArticulo(a)} className="ayuda-cat-item" style={{ ...style, textDecoration: 'none', color: 'inherit' }}>{contenido}</Link>
            ) : (
              <div key={a.slug} style={style}>{contenido}</div>
            );
          })}
          {articulos.length === 0 && (
            <p style={{ color: MUTED, padding: '24px 0' }}>Estamos preparando los artículos de esta categoría.</p>
          )}
        </div>

        <AyudaCTASoporte />
      </div>

      <SiteFooter links={[{ href: '/ayuda', label: 'Centro de Ayuda' }, { href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }]} />

      <style>{`.ayuda-cat-item{transition:border-color .15s,transform .15s}.ayuda-cat-item:hover{border-color:${ACC};transform:translateY(-2px)}`}</style>
    </PageShell>
  );
}
