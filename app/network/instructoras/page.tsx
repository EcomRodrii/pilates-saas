import type { Metadata } from 'next';
import { filtroDesdeSearchParams } from '@/lib/network/publico';
import { MarketplaceLayout } from '@/components/network-v2/MarketplaceLayout';

// Marketplace público de Tentare Network — Server Component a propósito
// (docs/NETWORK-AUDIT-2.md §11): sin esto, Google vería un div vacío que se
// rellena con JS y nunca indexaría "instructoras de pilates en Barcelona".
// La vista vive en MarketplaceLayout (compartida con las variantes SEO
// [ciudad] y [ciudad]/[especialidad]) — esta página solo resuelve el
// filtro desde la querystring, como antes.
export const metadata: Metadata = {
  title: 'Instructoras de Pilates | Tentare Network',
  description: 'Encuentra instructoras de Pilates disponibles cerca de ti. Filtra por especialidad, ubicación y disponibilidad.',
};

export default async function MarketplaceInstructorasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const urlSearchParams = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]])),
  );
  const filtro = filtroDesdeSearchParams(urlSearchParams);

  return <MarketplaceLayout filtro={filtro} tituloCiudad={filtro.ciudad} />;
}
