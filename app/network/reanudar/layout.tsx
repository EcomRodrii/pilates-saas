import type { Metadata } from 'next';

// Ver el comentario de app/network/crear-perfil/layout.tsx — mismo motivo.
export const metadata: Metadata = {
  title: 'Continúa tu perfil | Tentare Network',
  description: 'Retoma tu perfil de instructora justo donde lo dejaste.',
  robots: { index: false, follow: false },
};

export default function ReanudarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
