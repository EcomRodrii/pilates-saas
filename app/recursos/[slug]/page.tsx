import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticuloDatos } from '@/components/recursos/ArticuloDatos';
import { ARTICULOS, articuloPorSlug, fechaArticulo, urlArticulo } from '@/lib/recursos/articulos';
import { AUTOR } from '@/lib/recursos/schema';
import { urlDe } from '@/lib/seo/paginas';

// Los artículos de /recursos escritos como datos (lib/recursos/articulos).
// Las guías antiguas tienen su carpeta propia y Next las resuelve antes que
// este segmento dinámico; aquí solo llegan los slugs del registro, y cualquier
// otro es un 404 (dynamicParams = false).
export const dynamicParams = false;

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = articuloPorSlug(slug);
  if (!a) return {};
  const url = urlDe(urlArticulo(a.slug));
  return {
    title: `${a.tituloSeo} | Tentare`,
    description: a.descripcion,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: a.titulo,
      description: a.descripcion,
      url,
      publishedTime: a.publicado,
      modifiedTime: fechaArticulo(a),
      authors: [AUTOR.name],
      section: a.seccion,
    },
    twitter: { card: 'summary_large_image', title: a.titulo, description: a.descripcion },
  };
}

export default async function ArticuloPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articuloPorSlug(slug);
  if (!a) notFound();
  return <ArticuloDatos a={a} />;
}
