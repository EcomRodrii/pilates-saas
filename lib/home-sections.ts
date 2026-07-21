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

// Secciones que NO se pueden arrastrar a otra posición ni ocultar desde el
// editor de inicio (HomeEditor las excluye de la lista). No son contenido que
// tenga sentido personalizar: son avisos de estado que aparecen y desaparecen
// solos (el checklist de primeros pasos se oculta él mismo al completarse).
// Se detectó en producción un estudio con 'onboarding' guardado en la
// posición 5 de un `studio_layout.config.home.orden` de una personalización
// anterior a que la sección tuviera lógica real — quedaba enterrado sin que
// nadie lo hubiera decidido a propósito. `ordenarSeccionesHome` fuerza estas
// siempre a la cabeza, ignorando cualquier orden guardado, así que ese tipo
// de desajuste ya no puede volver a pasar.
export const HOME_FIJAS_PRIMERO: readonly string[] = ['onboarding'];

/** Aplica el orden fijo por encima del orden elegido por el estudio. */
export function ordenarSeccionesHome(visibles: string[]): string[] {
  const fijas = HOME_FIJAS_PRIMERO.filter((id) => visibles.includes(id));
  const resto = visibles.filter((id) => !fijas.includes(id));
  return [...fijas, ...resto];
}
