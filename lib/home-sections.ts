// Secciones reordenables/ocultables de la home del dashboard (Fase 4).
// Fuente única compartida por la home (app/(dashboard)/dashboard/page.tsx) y el
// editor (components/theme/home-editor.tsx). El id se usa como clave de orden y
// visibilidad en studio_layout.config.home; el Header queda siempre fijo arriba
// y no está en esta lista.

export interface HomeSeccion {
  id: string;
  label: string;
}

// 'onboarding' va ANTES que 'resumen' a propósito: para un estudio nuevo,
// 'resumen' es una fila de KPIs en cero. Mostrar eso primero y el checklist
// de primeros pasos después invierte la prioridad — el usuario ve un panel
// vacío antes que la guía que le dice qué hacer. Este orden es el que se usa
// por defecto (studio_layout.config.home vacío); un estudio que reordene la
// home a mano sigue viendo lo que él mismo eligió.
export const HOME_SECCIONES: HomeSeccion[] = [
  { id: 'onboarding', label: 'Primeros pasos' },
  { id: 'resumen', label: 'Hoy de un vistazo' },
  { id: 'automatizaciones', label: 'Resumen de automatizaciones' },
  { id: 'ingresos', label: 'Ingresos del mes' },
  { id: 'kpis', label: 'Indicadores (KPIs)' },
  { id: 'graficos', label: 'Gráficas personalizadas' },
  { id: 'principal', label: 'Clases, pagos y actividad' },
];
