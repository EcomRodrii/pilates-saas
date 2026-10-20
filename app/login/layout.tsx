import type { Metadata } from 'next';

// /login es de cliente y no puede exportar metadatos: van aquí. Sin indexar
// (NOINDEX_PROPIO, lib/seo/no-indexables.ts): es la puerta del panel, no
// contenido. Antes heredaba el título y la descripción comerciales del layout
// raíz y robots.txt la bloqueaba, así que Google no podía leer ningún `noindex`.
export const metadata: Metadata = {
  title: 'Entrar | Tentare',
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
