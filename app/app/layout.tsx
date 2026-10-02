import type { Metadata, Viewport } from 'next';
import '../portal/[slug]/student.css';

// La entrada de la app de iOS (`server.url` de Capacitor → /app). Con el aspecto
// de la app de la alumna, sin la marca de ningún estudio todavía: eso llega al
// entrar en el suyo. No se indexa (PREFIJOS_NO_INDEXABLES).
export const metadata: Metadata = {
  title: 'Tentare',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAF9F5',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="student-app">{children}</div>;
}
