// Secciones reordenables/ocultables de la home del dashboard (Fase 4).
// Fuente única compartida por la home (app/(dashboard)/dashboard/page.tsx) y el
// editor (components/theme/home-editor.tsx). El id se usa como clave de orden y
// visibilidad en studio_layout.config.home; el Header queda siempre fijo arriba
// y no está en esta lista.

export interface HomeSeccion {
  id: string;
  label: string;
}

export const HOME_SECCIONES: HomeSeccion[] = [
  { id: 'resumen', label: 'Hoy de un vistazo' },
  { id: 'onboarding', label: 'Primeros pasos' },
  { id: 'automatizaciones', label: 'Resumen de automatizaciones' },
  { id: 'ingresos', label: 'Ingresos del mes' },
  { id: 'kpis', label: 'Indicadores (KPIs)' },
  { id: 'graficos', label: 'Gráficas personalizadas' },
  { id: 'principal', label: 'Clases, pagos y actividad' },
];
