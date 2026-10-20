import type { Metadata } from 'next';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// El listado /recursos (app/recursos/page.tsx) es 'use client' — un Client
// Component no puede exportar `metadata`, así que vive aquí. Cada guía bajo
// /recursos/<slug> tiene su propio `export const metadata` más específico,
// que Next.js fusiona por encima de este (gana el campo del hijo).
// Título y descripción, del registro (lib/seo/paginas.ts): una sola frase en un solo sitio.
const pagina = paginaDe('/recursos')!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe('/recursos') },
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    title: 'Centro de Recursos — Tentare',
    description: 'Guías prácticas para propietarias de estudios de Pilates.',
    url: urlDe('/recursos'),
    images: [{ url: '/recursos/opengraph-image' }],
  },
};

export default function RecursosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
