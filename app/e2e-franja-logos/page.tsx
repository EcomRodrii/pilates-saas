import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { FranjaLogos } from '@/components/landing/FranjaLogos';
import { logosDePrueba } from '@/lib/landing/logos-clientes-prueba';

// Solo para las pruebas e2e y las capturas de la franja de logos de clientes
// (e2e/landing-logos-clientes.spec.ts). La home lee sus logos en servidor y se
// regenera cada hora, así que ninguna prueba puede cambiarle el número de logos
// en medio de una corrida; esta ruta pinta el MISMO componente con `?n=` logos de
// MENTIRA. Fuera de `E2E_TEST=1` (que no existe en producción) es un 404.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Prueba de la franja de logos', robots: { index: false, follow: false } };

export default async function PruebaFranjaLogos({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  if (process.env.E2E_TEST !== '1') notFound();
  const { n } = await searchParams;
  return (
    <main style={{ background: '#EEEEE8', minHeight: '100vh' }}>
      <div style={{ height: 240 }} />
      <FranjaLogos logos={logosDePrueba(Number(n ?? 0))} />
      <div id="despues" style={{ height: 240 }} />
    </main>
  );
}
