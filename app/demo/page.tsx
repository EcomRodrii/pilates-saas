import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { estadoDemo } from '@/lib/demo/interruptor';
import { DemoExperiencia } from '@/components/demo/DemoExperiencia';
import '@/components/web/tokens.css';

// La demo personalizada: Tenti entiende la duda de la propietaria y le prepara
// un recorrido con datos de ejemplo. Sin indexar (lib/seo/no-indexables.ts):
// es una herramienta con estado, no contenido que buscar.
export const metadata: Metadata = {
  title: 'Tu demo personalizada | Tentare',
  description: 'Cuéntale tu duda a Tenti y mira cómo funcionaría Tentare en tu estudio, paso a paso.',
  robots: { index: false, follow: true },
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { prueba } = await searchParams;
  if (!estadoDemo(process.env.DEMO_PERSONALIZADA, prueba !== undefined).pagina) notFound();
  return (
    <Suspense fallback={null}>
      <DemoExperiencia />
    </Suspense>
  );
}
