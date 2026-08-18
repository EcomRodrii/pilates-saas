import type { Metadata } from 'next';

// Ver el comentario de app/network/crear-perfil/layout.tsx — mismo motivo.
export const metadata: Metadata = {
  title: 'Acceso | Tentare Network',
  description: 'Entra en Tentare Network: instructoras a su perfil, propietarias a su estudio.',
  robots: { index: false, follow: false },
};

export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
