import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICULOS, articuloDe, categoriaDe, urlArticulo } from '@/lib/ayuda/registro';
import { contenidoDe } from '@/lib/ayuda/contenido';
import { ArticuloShell } from '@/components/ayuda/ArticuloShell';
import { urlDe } from '@/lib/seo/paginas';

export function generateStaticParams() {
  return ARTICULOS.filter((a) => a.estado === 'publicado').map((a) => ({ categoria: a.categoria, articulo: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ categoria: string; articulo: string }> }): Promise<Metadata> {
  const { categoria, articulo: slug } = await params;
  const articulo = articuloDe(categoria, slug);
  if (!articulo || articulo.estado !== 'publicado') return {};
  const path = urlArticulo(articulo);
  return {
    title: `${articulo.titulo} | Centro de Ayuda de Tentare`,
    description: articulo.descripcion,
    alternates: { canonical: urlDe(path) },
    openGraph: { type: 'article', title: articulo.titulo, description: articulo.descripcion, url: urlDe(path) },
  };
}

export default async function ArticuloPage({ params }: { params: Promise<{ categoria: string; articulo: string }> }) {
  const { categoria, articulo: slug } = await params;
  const articulo = articuloDe(categoria, slug);
  // Un artículo 'proximamente' no tiene página propia: solo aparece como
  // tarjeta "en preparación" en su categoría. Entrar a su URL a mano es un 404,
  // no una página con contenido a medias.
  if (!articulo || articulo.estado !== 'publicado' || !categoriaDe(categoria)) notFound();

  const cargarContenido = contenidoDe(categoria, slug);
  if (!cargarContenido) notFound();
  const { default: Contenido } = await cargarContenido();

  return (
    <ArticuloShell articulo={articulo}>
      <Contenido />
    </ArticuloShell>
  );
}
