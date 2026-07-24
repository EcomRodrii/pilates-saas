// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — CATÁLOGO (client-safe): eventos, reglas y plantillas.
//
// Añadir un tipo de notificación = añadir una entrada a REGLAS + sus PLANTILLAS
// (y, si la audiencia es nueva, un resolver en recipients.ts). Nada más: el
// motor y las superficies no cambian. Nada hardcodeado fuera de aquí.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  NotificationCategory, NotificationChannel, NotificationPriority, NotificationRole,
} from './types.ts';

// Cómo resolver los destinatarios de un evento (la resolución concreta —que toca
// BD— vive en recipients.ts, server-only). Aquí solo se declara la audiencia.
export type Audiencia =
  | 'socia-del-evento'
  | 'propietaria'
  | 'instructora-del-evento'
  | 'socias-de-la-sesion'
  | 'propietaria-y-socia';

export interface ReglaEvento {
  category: NotificationCategory;
  priority: NotificationPriority;
  // Canales ADEMÁS del in-app (que va siempre, salvo SILENCIOSA o preferencia OFF).
  // 'PUSH' se intentará cuando el usuario tenga suscripción (PR2).
  canales: NotificationChannel[];
  audiencia: Audiencia;
}

// Catálogo de eventos. Las claves son los `type` que publican los módulos.
export const EVENTOS = {
  RESERVA_CREADA: 'reserva.creada',
  RESERVA_CONFIRMADA: 'reserva.confirmada',
  RESERVA_LISTA_ESPERA: 'reserva.lista_espera',
  RESERVA_PLAZA_LIBERADA: 'reserva.plaza_liberada',
  RESERVA_CANCELADA: 'reserva.cancelada',
  CLASE_CANCELADA: 'clase.cancelada',
  SUSTITUCION_ACEPTADA: 'sustitucion.aceptada',
  SUSTITUCION_RECHAZADA: 'sustitucion.rechazada',
  PAGO_FALLIDO: 'pago.fallido',
  PAGO_REALIZADO: 'pago.realizado',
  SISTEMA_ERROR: 'sistema.error',
} as const;

// Reglas por evento. La 1ª tanda cableada de la Fase 1 cubre los 3 roles.
export const REGLAS: Record<string, ReglaEvento> = {
  [EVENTOS.RESERVA_CREADA]:        { category: 'reservas', priority: 'BAJA',   canales: [],       audiencia: 'propietaria' },
  [EVENTOS.RESERVA_CONFIRMADA]:    { category: 'reservas', priority: 'MEDIA',  canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_LISTA_ESPERA]:  { category: 'reservas', priority: 'MEDIA',  canales: [],       audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_PLAZA_LIBERADA]:{ category: 'reservas', priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_CANCELADA]:     { category: 'reservas', priority: 'BAJA',   canales: [],       audiencia: 'socia-del-evento' },
  [EVENTOS.CLASE_CANCELADA]:       { category: 'clases',   priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socias-de-la-sesion' },
  [EVENTOS.SUSTITUCION_ACEPTADA]:  { category: 'sustituciones', priority: 'ALTA', canales: ['PUSH'], audiencia: 'instructora-del-evento' },
  [EVENTOS.SUSTITUCION_RECHAZADA]: { category: 'sustituciones', priority: 'ALTA', canales: [],     audiencia: 'propietaria' },
  [EVENTOS.PAGO_FALLIDO]:          { category: 'pagos',    priority: 'ALTA',   canales: ['PUSH'], audiencia: 'propietaria-y-socia' },
  [EVENTOS.PAGO_REALIZADO]:        { category: 'pagos',    priority: 'BAJA',   canales: [],       audiencia: 'socia-del-evento' },
  [EVENTOS.SISTEMA_ERROR]:         { category: 'sistema',  priority: 'CRITICA', canales: ['PUSH'], audiencia: 'propietaria' },
};

// ── Plantillas ────────────────────────────────────────────────────────────────
// Clave: `${eventType}#${role}` con fallback a `${eventType}`. Variables `{x}` se
// interpolan desde event.data. deepLink construye la ruta a abrir por rol.
export interface Plantilla {
  title: string;
  body: string;
  deepLink?: (data: Record<string, unknown>) => string | null;
}

type Datos = Record<string, unknown>;
const s = (v: unknown, def = '') => (v == null ? def : String(v));

export const PLANTILLAS: Record<string, Plantilla> = {
  // Reserva creada → la dueña (nueva inscripción)
  [`${EVENTOS.RESERVA_CREADA}#PROPIETARIO`]: {
    title: 'Nueva reserva',
    body: '{socia} ha reservado {clase} el {cuando}.',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
  },
  // Reserva confirmada → la socia
  [`${EVENTOS.RESERVA_CONFIRMADA}#SOCIA`]: {
    title: 'Reserva confirmada',
    body: 'Tu plaza en {clase} del {cuando} está confirmada. ¡Te esperamos!',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  [`${EVENTOS.RESERVA_LISTA_ESPERA}#SOCIA`]: {
    title: 'Estás en lista de espera',
    body: '{clase} del {cuando} está completa. Te avisaremos si se libera una plaza.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  [`${EVENTOS.RESERVA_PLAZA_LIBERADA}#SOCIA`]: {
    title: '¡Se ha liberado tu plaza!',
    body: 'Ha quedado sitio en {clase} del {cuando} y ya tienes plaza confirmada.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  [`${EVENTOS.RESERVA_CANCELADA}#SOCIA`]: {
    title: 'Reserva cancelada',
    body: 'Se ha cancelado tu reserva de {clase} del {cuando}.',
  },
  // Clase cancelada → cada socia apuntada
  [`${EVENTOS.CLASE_CANCELADA}#SOCIA`]: {
    title: 'Clase cancelada',
    body: 'La clase de {clase} del {cuando} ha sido cancelada. Disculpa las molestias.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases`,
  },
  // Sustitución aceptada → la instructora que cubre
  [`${EVENTOS.SUSTITUCION_ACEPTADA}#INSTRUCTOR`]: {
    title: 'Nueva clase asignada',
    body: 'Cubrirás {clase} el {cuando}{sala}. ¡Gracias!',
    deepLink: () => `/calendario`,
  },
  [`${EVENTOS.SUSTITUCION_RECHAZADA}#PROPIETARIO`]: {
    title: 'Sustitución rechazada',
    body: '{instructora} no puede cubrir {clase} del {cuando}. Busca otra opción.',
    deepLink: () => `/sustituciones`,
  },
  // Pago fallido → dueña y socia (mismo evento, textos por rol)
  [`${EVENTOS.PAGO_FALLIDO}#PROPIETARIO`]: {
    title: 'Pago fallido',
    body: 'No se ha podido cobrar {concepto} ({importe} €) a {socia}.',
    deepLink: () => `/cobros?tab=pendientes`,
  },
  [`${EVENTOS.PAGO_FALLIDO}#SOCIA`]: {
    title: 'Problema con tu pago',
    body: 'No hemos podido cobrar {concepto} ({importe} €). Revisa tu método de pago.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/mi-plan`,
  },
  [`${EVENTOS.PAGO_REALIZADO}#SOCIA`]: {
    title: 'Pago recibido',
    body: 'Hemos recibido tu pago de {concepto} ({importe} €). ¡Gracias!',
  },
  [`${EVENTOS.SISTEMA_ERROR}#PROPIETARIO`]: {
    title: 'Aviso del sistema',
    body: '{mensaje}',
  },
};

// Interpola {clave} desde los datos del evento.
export function render(plantilla: string, data: Datos): string {
  return plantilla.replace(/\{(\w+)\}/g, (_, k) => s(data[k]));
}

// Resuelve la plantilla para un rol (con fallback al evento sin rol).
export function plantillaDe(eventType: string, role: NotificationRole): Plantilla | null {
  return PLANTILLAS[`${eventType}#${role}`] ?? PLANTILLAS[eventType] ?? null;
}

export const CATEGORIA_ETIQUETA: Record<NotificationCategory, string> = {
  reservas: 'Reservas',
  clases: 'Clases',
  sustituciones: 'Sustituciones',
  pagos: 'Pagos y bonos',
  marketing: 'Novedades y promociones',
  sistema: 'Sistema',
};

// Categorías que cada rol puede configurar en sus preferencias.
export const CATEGORIAS_POR_ROL: Record<NotificationRole, NotificationCategory[]> = {
  PROPIETARIO: ['reservas', 'clases', 'sustituciones', 'pagos', 'sistema'],
  INSTRUCTOR: ['clases', 'sustituciones'],
  SOCIA: ['reservas', 'clases', 'pagos', 'marketing'],
};
