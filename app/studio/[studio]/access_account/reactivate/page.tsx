import type { Metadata } from 'next';
import { Reactivar } from '@/components/billing/reactivar/reactivar';
import { variableInter } from './fuente';

export const metadata: Metadata = {
  title: 'Reactiva tu estudio · Tentare',
  robots: { index: false, follow: false },
};

export default async function PaginaReactivar({ params }: { params: Promise<{ studio: string }> }) {
  const { studio } = await params;
  return (
    <div className={variableInter}>
      <Reactivar estudio={studio} />
    </div>
  );
}
