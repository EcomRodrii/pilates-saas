import type { Metadata } from 'next';
import { Inter_Tight } from 'next/font/google';

// La MAQUETA del diseño de Figma (nov-2026): una ruta aparte de la landing real, sin publicar y fuera de buscadores. Ver
// components/landing-figma/contenido.ts para qué es del diseño y qué no.
export const metadata: Metadata = {
  title: 'Maqueta · diseño de la nueva web de Tentare',
  description: 'Maqueta interna del diseño de Figma. No es la web pública.',
  robots: { index: false, follow: false, nocache: true },
};

const fuente = Inter_Tight({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--lf-fuente', display: 'swap' });

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${fuente.variable} lf`}>{children}</div>;
}
