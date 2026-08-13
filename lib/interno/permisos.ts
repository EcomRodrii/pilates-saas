// ─────────────────────────────────────────────────────────────────────────────
// Panel interno — catálogo de PERMISOS (client-safe: lo usan API y UI).
//
// La autorización va por permiso, nunca por rol. "CEO" y "Marketing" son atajos
// para conceder un puñado de permisos, no la unidad con la que se decide: en
// cuanto entre alguien de soporte o de finanzas, con roles habría que inventar
// un rol nuevo y tocar código; con permisos basta con darle los suyos.
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISOS = [
  'studios.read',
  'studios.update',
  'studios.delete',
  'billing.read',
  'billing.refund',
  'plans.update',
  'marketing.send',
  'crm.update',
  'logs.read',
  'users.create',
  'users.delete',
  'content.write',
  'network.moderate',
  'admin.full',
] as const;

export type Permiso = (typeof PERMISOS)[number];

// Qué significa cada uno, en la UI de gestión de usuarios internos. El texto es
// el contrato con quien concede: tiene que decir qué puede hacer de verdad.
export const PERMISO_ETIQUETA: Record<Permiso, string> = {
  'studios.read':   'Ver estudios y su ficha completa',
  'studios.update': 'Editar un estudio (plan, estado, datos)',
  'studios.delete': 'Eliminar un estudio y todos sus datos',
  'billing.read':   'Ver cobros, facturas y suscripciones',
  'billing.refund': 'Devolver dinero y reintentar cobros',
  'plans.update':   'Crear y editar los planes de precio',
  'marketing.send': 'Enviar campañas a clientes',
  'crm.update':     'Gestionar leads, demos y el pipeline',
  'logs.read':      'Leer el registro de auditoría',
  'users.create':   'Dar de alta usuarios internos',
  'users.delete':   'Dar de baja usuarios internos',
  'content.write':  'Publicar el changelog de Actualizaciones',
  'network.moderate': 'Moderar perfiles, verificaciones y reportes de Tentare Network',
  'admin.full':     'Todos los permisos, presentes y futuros',
};

// Agrupación solo para presentar la lista; no significa nada para el motor.
export const PERMISOS_POR_AREA: Array<{ area: string; permisos: Permiso[] }> = [
  { area: 'Estudios',   permisos: ['studios.read', 'studios.update', 'studios.delete'] },
  { area: 'Facturación', permisos: ['billing.read', 'billing.refund', 'plans.update'] },
  { area: 'Crecimiento', permisos: ['marketing.send', 'crm.update'] },
  { area: 'Contenido',  permisos: ['content.write'] },
  { area: 'Network',    permisos: ['network.moderate'] },
  { area: 'Plataforma',  permisos: ['logs.read', 'users.create', 'users.delete', 'admin.full'] },
];

// Peligrosos = la UI pide confirmación explícita antes de usarlos, porque
// mueven dinero o destruyen datos. No significa "prohibidos": devolver un cobro
// es exactamente el trabajo de quien lleva finanzas.
export const PERMISOS_PELIGROSOS: Permiso[] = [
  'studios.delete', 'billing.refund', 'users.delete', 'admin.full',
];

// Los que no se delegan. Borrar un estudio destruye los datos de las clientas
// de otra persona; dar de baja usuarios internos y `admin.full` permiten
// reescribir quién manda. Un preset que no sea el del CEO nunca los lleva: si
// alguien los necesita puntualmente, se conceden a mano y queda en el registro.
export const PERMISOS_SOLO_CEO: Permiso[] = ['studios.delete', 'users.delete', 'admin.full'];

// Atajos para dar de alta a alguien. Deliberadamente NO se guardan en la BD: lo
// que se guarda son los permisos resultantes, para que cambiar un preset mañana
// no altere en silencio lo que ya tiene concedido una persona.
export const PRESETS: Record<string, { descripcion: string; permisos: Permiso[] }> = {
  CEO: {
    descripcion: 'Todo, sin excepciones',
    permisos: ['admin.full'],
  },
  Marketing: {
    descripcion: 'Campañas, CRM y el changelog. Ve estudios y facturación, pero no los toca',
    permisos: ['studios.read', 'billing.read', 'marketing.send', 'crm.update', 'logs.read', 'content.write'],
  },
  Soporte: {
    descripcion: 'Atiende clientes: los ve y los edita, sin tocar dinero ni borrar',
    permisos: ['studios.read', 'studios.update', 'billing.read', 'logs.read'],
  },
  Finanzas: {
    descripcion: 'Cobros, devoluciones y planes',
    permisos: ['studios.read', 'billing.read', 'billing.refund', 'plans.update', 'logs.read'],
  },
};

export function esPermiso(valor: string): valor is Permiso {
  return (PERMISOS as readonly string[]).includes(valor);
}

// `admin.full` es un comodín: concede cualquier permiso, incluidos los que se
// añadan en el futuro. Es lo que hace que dar de alta un permiso nuevo no exija
// acordarse de asignárselo a quien ya lo tenía todo.
export function tienePermiso(permisos: readonly string[], requerido: Permiso): boolean {
  return permisos.includes('admin.full') || permisos.includes(requerido);
}

export function tieneAlguno(permisos: readonly string[], requeridos: readonly Permiso[]): boolean {
  return requeridos.some(p => tienePermiso(permisos, p));
}
