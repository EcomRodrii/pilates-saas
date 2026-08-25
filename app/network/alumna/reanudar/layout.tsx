import type { Metadata } from 'next';

// Ver el comentario de app/network/reanudar/layout.tsx (la versión de
// instructora) — mismo motivo. Privada y autenticada: nunca indexable.
export const metadata: Metadata = {
  title: 'Continúa | Tentare Network',
  description: 'Retoma tu cuenta de alumna en Tentare Network.',
  robots: { index: false, follow: false },
};

export default function ReanudarAlumnaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
