import { EditorZip } from '@/components/theme/editor-zip';

// Editor de código para un tema ZIP importado, a pantalla completa — mismo
// patrón que `/configuracion/apariencia/editor` (DashboardShell tiene el
// hueco para esta ruta también, sin Sidebar/Topbar).
export const metadata = { title: 'Editar tema importado' };

export default async function EditorZipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorZip id={id} />;
}
