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
  { id: 'accion', label: 'Lo que necesita tu atención' },
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
// 'accion' (el Action Center del Decision OS) va con ellas y por delante de
// todo: su razón de ser es que el problema llegue a la propietaria sin que
// tenga que ir a buscarlo, y enterrado a mitad de página no lo hace. Además
// desaparece solo cuando no hay nada pendiente, igual que el checklist.
//
// ⚠️ Ser FIJA es además lo único que garantiza que la vean los estudios que ya
// tienen un `home.orden` guardado: `aplicarLayout` mete los ids nuevos al FINAL
// del orden guardado, así que sin esto un estudio con la home personalizada se
// lo encontraría abajo del todo.
export const HOME_FIJAS_PRIMERO: readonly string[] = ['accion', 'onboarding'];

// Prioridad elegida en el asistente de bienvenida (`studios.onb_prioridad`) →
// sección de la home que la atiende.
//
// El asistente lleva prometiendo en pantalla "Con eso ordenamos tu panel de
// inicio" desde que existe, y no ordenaba nada: la respuesta se guardaba en
// `onb_prioridad` y no la leía nadie. Esto es lo que la hace real.
//
// Solo están las prioridades que tienen una sección DE VERDAD. Las otras
// ('Conseguir más alumnos', 'Sustituciones de profesoras', 'Marketing',
// 'Otro') no aparecen a propósito: no hay hoy una sección de la home que las
// atienda —marketing vive detrás de un flag desactivado— y mapearlas a la
// sección "más parecida" movería el panel por un motivo inventado. Sin
// coincidencia, el orden se queda como estaba, que es la respuesta honesta.
const SECCION_POR_PRIORIDAD: Record<string, string> = {
  'Cobros': 'ingresos',
  'Gestionar reservas': 'principal',
  'Automatizar tareas': 'automatizaciones',
};

/**
 * Aplica el orden fijo por encima del orden elegido por el estudio y, tras las
 * fijas, sube lo que la propietaria dijo que le preocupaba.
 *
 * `prioridad` es opcional: sin ella el comportamiento es exactamente el de
 * antes. Las fijas ('accion', 'onboarding') siguen mandando sobre todo — son
 * avisos que dejan de aparecer solos, y la prioridad no debe enterrarlos.
 */
export function ordenarSeccionesHome(visibles: string[], prioridad?: string[] | null): string[] {
  const fijas = HOME_FIJAS_PRIMERO.filter((id) => visibles.includes(id));
  const resto = visibles.filter((id) => !fijas.includes(id));

  // Orden de elección respetado: si dijo "Cobros" y luego "Gestionar reservas",
  // ingresos va antes que principal. Dedup por si dos prioridades apuntaran a
  // la misma sección.
  const preferidas = [...new Set(
    (prioridad ?? [])
      .map((p) => SECCION_POR_PRIORIDAD[p])
      .filter((id): id is string => !!id && resto.includes(id)),
  )];
  if (preferidas.length === 0) return [...fijas, ...resto];

  return [...fijas, ...preferidas, ...resto.filter((id) => !preferidas.includes(id))];
}
