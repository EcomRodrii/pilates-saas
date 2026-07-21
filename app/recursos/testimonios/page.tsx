import type { Metadata } from 'next';
import { EnConstruccionPage } from '@/components/marketing/en-construccion';

export const metadata: Metadata = { title: 'Testimonios | Tentare' };

export default function Page() {
  return (
    <EnConstruccionPage
      titulo="Testimonios"
      contexto="Estamos recopilando historias reales de estudios que usan Tentare. Todavía no tenemos suficientes para publicar esta página con garantías — vuelve pronto."
    />
  );
}
