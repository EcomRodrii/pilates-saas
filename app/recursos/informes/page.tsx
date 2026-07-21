import type { Metadata } from 'next';
import { EnConstruccionPage } from '@/components/marketing/en-construccion';

export const metadata: Metadata = { title: 'Informes | Tentare' };

export default function Page() {
  return (
    <EnConstruccionPage
      titulo="Informes"
      contexto="Todavía no hemos publicado informes o benchmarks del sector. Cuando lo hagamos, serán datos reales de estudios que usan Tentare, con su permiso — no cifras genéricas de relleno."
    />
  );
}
