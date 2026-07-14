import { ThemeEditor } from '@/components/theme/theme-editor';
import { MenuEditor } from '@/components/theme/menu-editor';
import { HomeEditor } from '@/components/theme/home-editor';

export const metadata = { title: 'Marca y apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-10">
      <section className="space-y-5">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Marca y apariencia</h1>
          <p className="text-sm text-muted-foreground">
            Personaliza colores, tipografía, logo y favicon de la app de tus socias y de tu página pública de reservas.
          </p>
        </div>
        <ThemeEditor />
      </section>

      <section className="space-y-5 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-extrabold text-foreground">Menú del panel</h2>
          <p className="text-sm text-muted-foreground">
            Reordena y oculta los módulos del menú lateral según cómo trabaje tu estudio.
          </p>
        </div>
        <MenuEditor />
      </section>

      <section className="space-y-5 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-extrabold text-foreground">Pantalla de inicio</h2>
          <p className="text-sm text-muted-foreground">
            Reordena y oculta las secciones del dashboard (KPIs, ingresos, clases…).
          </p>
        </div>
        <HomeEditor />
      </section>
    </div>
  );
}
