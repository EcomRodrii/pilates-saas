import { AparienciaTabs } from '@/components/theme/apariencia-tabs';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Marca y apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader
        back={{ href: '/configuracion', label: 'Volver a Configuración' }}
        title="Marca y apariencia"
        description="Personaliza colores, tipografía, logo y favicon, y organiza el menú y la pantalla de inicio."
      />
      <AparienciaTabs />
    </div>
  );
}
