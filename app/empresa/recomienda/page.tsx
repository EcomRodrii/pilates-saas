import type { Metadata } from 'next';
import { EnConstruccionPage } from '@/components/marketing/en-construccion';

export const metadata: Metadata = { title: 'Recomienda un cliente | Tentare' };

export default function Page() {
  return (
    <EnConstruccionPage
      titulo="Recomienda un cliente"
      contexto="El programa de recomendación todavía no está activo. Si conoces un estudio al que le vendría bien Tentare, cuéntanoslo por email mientras tanto."
    />
  );
}
