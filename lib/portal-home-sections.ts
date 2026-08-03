// Módulos reordenables/ocultables de Inicio del PORTAL cliente (Fase 2 del
// editor de temas). Fuente única compartida por la home
// (app/portal/[slug]/home/page.tsx) y el editor
// (components/theme/portal-bloques-editor.tsx). El id se usa como clave de orden
// y visibilidad en studio_layout.config.portalHome.
//
// El saludo y la tarjeta grande de "próxima clase" quedan siempre fijos
// arriba y no están en esta lista — no son un módulo que tenga sentido
// reordenar u ocultar (equivalente a "primeros pasos" en la home del
// dashboard, pero ahí ese caso sí necesita fijarse EXPLÍCITAMENTE porque
// compite por posición con el resto; aquí ni siquiera entra en el sistema).
//
// Las 4 filas de accesos (Mis reservas/Mi progreso/Notificaciones/El equipo)
// van como UN solo módulo: hoy son un único `.map()` en el código, y
// separarlas en 4 elementos reordenables entre sí no aportaba valor visual
// suficiente para el refactor que exigiría (decisión de producto, no técnica).

export interface PortalHomeSeccion {
  id: string;
  label: string;
}

export const PORTAL_HOME_SECCIONES: PortalHomeSeccion[] = [
  { id: 'estaSemana', label: 'Esta semana' },
  { id: 'accesosRapidos', label: 'Accesos rápidos (reservas, progreso, notificaciones, equipo)' },
  { id: 'invitarAmiga', label: 'Invita a una amiga' },
  { id: 'contenidoEstudio', label: 'Contenido del estudio (mensaje destacado y banners)' },
];
