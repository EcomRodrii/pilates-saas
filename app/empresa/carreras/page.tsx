import type { Metadata } from 'next';
import { EnConstruccionPage } from '@/components/marketing/en-construccion';

export const metadata: Metadata = { title: 'Carreras | Tentare' };

export default function Page() {
  return (
    <EnConstruccionPage
      titulo="Carreras"
      contexto="Todavía no tenemos vacantes publicadas. Si te interesa formar parte del equipo, escríbenos y te guardamos en el radar."
    />
  );
}
