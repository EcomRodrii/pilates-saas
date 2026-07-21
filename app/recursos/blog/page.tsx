import type { Metadata } from 'next';
import { EnConstruccionPage } from '@/components/marketing/en-construccion';

export const metadata: Metadata = { title: 'Blog | Tentare' };

export default function Page() {
  return (
    <EnConstruccionPage
      titulo="Blog"
      contexto="Todavía no hemos publicado el blog. Cuando lo hagamos, será sobre gestión real de estudios de Pilates — no relleno de SEO."
    />
  );
}
