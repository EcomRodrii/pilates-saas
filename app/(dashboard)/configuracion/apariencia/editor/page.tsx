import { AparienciaTabs } from '@/components/theme/apariencia-tabs';
import { PageHeader } from '@/components/ui/page-header';

// Ajuste fino del tema instalado: colores, tipografía, botones/tarjetas, barra,
// y los bloques de cada pantalla del portal. Se llega desde "Personalizar" en
// la biblioteca (/configuracion/apariencia), que es la pantalla de llegada.
export const metadata = { title: 'Personalizar apariencia' };

export default function AparienciaEditorPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader
        back={{ href: '/configuracion/apariencia', label: 'Volver a Apariencia' }}
        title="Personalizar"
        description="Afina colores, tipografía, logo y favicon, y organiza las pantallas del portal."
      />
      <AparienciaTabs />
    </div>
  );
}
