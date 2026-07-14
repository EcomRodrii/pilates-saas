import { ThemeEditor } from '@/components/theme/theme-editor';

export const metadata = { title: 'Marca y apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Marca y apariencia</h1>
        <p className="text-sm text-muted-foreground">
          Personaliza colores, tipografía, logo y favicon de la app de tus socias y de tu página pública de reservas.
        </p>
      </div>
      <ThemeEditor />
    </div>
  );
}
