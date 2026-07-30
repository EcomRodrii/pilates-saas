import type { Metadata } from 'next';
import { DashboardShell } from '@/components/layout/dashboard-shell';

// El manifest raíz (app/manifest.ts) es el de la PLATAFORMA — landing +
// paraguas genérico, start_url: '/'. Instalar "la app" desde dentro del panel
// (p.ej. una instructora en /calendario, "Añadir a pantalla de inicio")
// heredaba ese mismo manifest, así que el icono instalado abría siempre la
// landing/login, nunca el panel — no se sentía como una app de verdad aunque
// notificaciones push y el layout móvil ya funcionaran (ver tentare-os.md).
// Mismo patrón que app/portal/[slug]/layout.tsx: `metadata.manifest` apunta a
// un recurso propio, aquí estático porque el panel no varía por estudio.
export const metadata: Metadata = {
  manifest: '/panel.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tentare',
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
