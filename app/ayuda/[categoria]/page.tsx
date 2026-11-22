import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CATEGORIAS, articulosDe, categoriaDe, urlArticulo } from '@/lib/ayuda/registro';
import { AyudaBreadcrumbs } from '@/components/ayuda/AyudaBreadcrumbs';
import { AyudaBreadcrumbStructuredData } from '@/components/ayuda/AyudaStructuredData';
import { AyudaCTASoporte } from '@/components/ayuda/AyudaCTASoporte';
import { PageShell } from '@/components/recursos/PageShell';
import { AyudaMarco } from '@/components/ayuda/AyudaMarco';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { urlDe } from '@/lib/seo/paginas';

export function generateStaticParams() {
  return CATEGORIAS.map((c) => ({ categoria: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ categoria: string }> }): Promise<Metadata> {
  const { categoria: slug } = await params;
  const categoria = categoriaDe(slug);
  if (!categoria) return {};
  return {
    title: `${categoria.titulo} | Ayuda de Tentare`,
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
      <AyudaMarco>
        <AyudaBreadcrumbs items={migas} />
        <h1 className="ay-h1">{categoria.titulo}</h1>
        <p className="ay-intro">{categoria.descripcion}</p>

        <ul className="ay-lista">
          {articulos.map((a) => {
            const publicado = a.estado === 'publicado';
            const contenido = (
              <>
                <div>
                  <b style={{ color: publicado ? '#1a1a1a' : '#8a8a8a' }}>{a.titulo}</b>
                  <span>{a.descripcion}</span>
                </div>
                {publicado ? <ArrowRight size={16} style={{ flex: 'none', color: '#8a8a8a' }} aria-hidden /> : <span className="ay-pronto">Próximamente</span>}
              </>
            );
            return (
              <li key={a.slug}>
                {publicado
                  ? <Link href={urlArticulo(a)} className="ay-fila">{contenido}</Link>
                  : <div className="ay-fila">{contenido}</div>}
              </li>
            );
          })}
        </ul>
        {articulos.length === 0 && <p className="ay-intro" style={{ padding: '24px 0' }}>Estamos preparando los artículos de esta categoría.</p>}

        <AyudaCTASoporte />
      </AyudaMarco>
    </PageShell>
  );
}
