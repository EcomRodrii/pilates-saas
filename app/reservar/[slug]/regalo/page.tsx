import { ComprarRegalo } from '@/components/regalo/comprar-regalo';

export const metadata = { title: 'Tarjeta regalo', robots: { index: false, follow: false } };

export default async function RegaloPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ComprarRegalo slug={slug} />;
}
