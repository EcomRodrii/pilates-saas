import type { Metadata } from 'next';
import { urlDe } from '@/lib/seo/paginas';

// El listado /recursos (app/recursos/page.tsx) es 'use client' — un Client
// Component no puede exportar `metadata`, así que vive aquí. Cada guía bajo
// /recursos/<slug> tiene su propio `export const metadata` más específico,
// que Next.js fusiona por encima de este (gana el campo del hijo).
export const metadata: Metadata = {
  title: 'Centro de Recursos — Guías para tu estudio de Pilates | Tentare',
  description:
    'Guías prácticas para propietarias de estudios de Pilates: ocupación, precios, sustituciones, retención y la parte administrativa que nadie te contó.',
  alternates: { canonical: urlDe('/recursos') },
  openGraph: {
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
