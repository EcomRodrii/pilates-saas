import { ThemeEditorFullscreen } from '@/components/theme/theme-editor-fullscreen';

// Editor a pantalla completa — DashboardShell (components/layout/dashboard-shell.tsx)
// tiene el hueco para esta ruta exacta: sin Sidebar/Topbar, solo el marco de
// auth/tema. Nada de PageHeader/max-w aquí, el propio componente pinta su
// barra superior y ocupa el 100% del viewport.
export const metadata = { title: 'Personalizar apariencia' };

export default function AparienciaEditorPage() {
  return <ThemeEditorFullscreen />;
}
