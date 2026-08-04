import { ThemeLibrary } from '@/components/theme/theme-library';
import { PageHeader } from '@/components/ui/page-header';

// La pantalla de llegada de Apariencia es la BIBLIOTECA de temas: se elige un
// punto de partida mirándolo, y el ajuste fino (colores, tipografía, bloques
// de cada pantalla del portal) vive en /configuracion/apariencia/editor.
export const metadata = { title: 'Apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader
        back={{ href: '/configuracion', label: 'Volver a Configuración' }}
        title="Apariencia"
        description="Elige el tema de la app de tus socias y de tu página pública de reservas."
      />
      <ThemeLibrary />
    </div>
  );
}
