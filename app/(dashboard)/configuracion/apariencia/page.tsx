import { AparienciaTabs } from '@/components/theme/apariencia-tabs';

export const metadata = { title: 'Marca y apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Marca y apariencia</h1>
        <p className="text-sm text-muted-foreground">
          Personaliza colores, tipografía, logo y favicon, y organiza el menú y la pantalla de inicio.
        </p>
      </div>
      <AparienciaTabs />
    </div>
  );
}
