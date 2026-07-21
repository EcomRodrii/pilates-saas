// Fuente única para los anclas de /soluciones y /caracteristicas — el footer
// (components/marketing/footer.tsx) y las propias páginas importan de aquí
// para no duplicar la lista y que nunca queden desincronizadas.

export interface AnclaMarketing {
  slug: string;
  label: string;
}

// "Diseñado para": Tentare es Pilates-first (gestión de salas, mapa de spots
// por reformer, bonos de sesiones) pero el motor de horarios/aforo/cobros es
// genérico y sirve para cualquier negocio de clases con cupo — de ahí que
// tenga sentido nombrar estos nichos. La página /soluciones es honesta sobre
// qué es específico de Pilates y qué es la base genérica que comparten todos.
export const SOLUCIONES: AnclaMarketing[] = [
  { slug: 'pilates', label: 'Pilates' },
  { slug: 'pilates-reformer', label: 'Pilates Reformer' },
  { slug: 'yoga', label: 'Yoga' },
  { slug: 'estudios-fitness', label: 'Estudios Fitness' },
  { slug: 'ciclismo-indoor', label: 'Ciclismo Indoor' },
  { slug: 'baile', label: 'Baile' },
  { slug: 'barre', label: 'Barre' },
  { slug: 'boxeo', label: 'Boxeo' },
  { slug: 'artes-marciales', label: 'Artes Marciales' },
  { slug: 'bootcamp', label: 'Bootcamp' },
  { slug: 'hiit', label: 'HIIT' },
  { slug: 'entrenamiento-funcional', label: 'Entrenamiento Funcional' },
  { slug: 'estudios-multiples', label: 'Estudios múltiples' },
  { slug: 'franquicias', label: 'Franquicias' },
];

// Mapea cada item a un módulo real y verificado del producto (lib/nav-config.tsx
// y los motores correspondientes) — nada de lo listado aquí es aspiracional.
export const CARACTERISTICAS: AnclaMarketing[] = [
  { slug: 'horarios', label: 'Horarios y calendario' },
  { slug: 'reservas', label: 'Reservas' },
  { slug: 'pagos', label: 'Pagos' },
  { slug: 'gestion-de-miembros', label: 'Gestión de miembros' },
  { slug: 'equipo', label: 'Equipo' },
  { slug: 'sustituciones', label: 'Sustituciones' },
  { slug: 'automatizaciones-ia', label: 'Automatizaciones IA' },
  { slug: 'centro-de-control', label: 'Centro de Control' },
  { slug: 'gamificacion', label: 'Gamificación y fidelización' },
  { slug: 'crm', label: 'CRM y comunidad' },
  { slug: 'app-personalizada', label: 'App y portal personalizados' },
  { slug: 'panel-de-rendimiento', label: 'Panel de rendimiento' },
  { slug: 'ventas', label: 'Caja y productos' },
  { slug: 'integraciones', label: 'Integraciones' },
];

export interface Competidor {
  slug: string;
  nombre: string;
}

export const COMPARATIVAS: Competidor[] = [
  { slug: 'mindbody', nombre: 'Mindbody' },
  { slug: 'eversports', nombre: 'Eversports' },
  { slug: 'glofox', nombre: 'Glofox' },
  { slug: 'momence', nombre: 'Momence' },
  { slug: 'bsport', nombre: 'Bsport' },
];
