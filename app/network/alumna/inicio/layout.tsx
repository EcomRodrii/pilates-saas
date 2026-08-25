import type { Metadata } from 'next';

// Ver el comentario de app/network/reanudar/layout.tsx — mismo motivo
// (page.tsx es 'use client', un layout Server es el sitio correcto para el
// <title>). Privada y autenticada: nunca indexable.
export const metadata: Metadata = {
  title: 'Inicio | Tentare Network',
  description: 'Tu autoservicio de alumna en Tentare Network.',
  robots: { index: false, follow: false },
};

export default function InicioAlumnaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
