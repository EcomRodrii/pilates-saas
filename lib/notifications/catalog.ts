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
  // Todo el mundo afectado por un cambio en una clase: las alumnas apuntadas Y
  // quien la imparte. Que la instructora se entere de que su clase se cancela o
  // cambia de hora importa tanto como que se enteren las alumnas.
  | 'socias-e-instructora-de-la-sesion'
  // Staff de mostrador: la dueña + las recepcionistas activas. Si el estudio no
  // tiene recepción, resuelve solo a la dueña (comportamiento previo intacto).
  | 'mostrador'
  | 'mostrador-y-socia';

export interface ReglaEvento {
  category: NotificationCategory;
  priority: NotificationPriority;
  // Canales ADEMÁS del in-app (que va siempre, salvo SILENCIOSA o preferencia OFF).
  //
  // **Esta lista es la AUTORIDAD del evento**: es la lista COMPLETA de canales por
  // los que puede salir. La preferencia del usuario solo puede quitar de aquí, y
  // ni siquiera una CRÍTICA añade un canal no declarado. Lista vacía = solo in-app.
  // Corolario: para no mandar algo por un canal, basta con no declararlo (no hay
  // lista de exclusiones). Antes de añadir EMAIL, comprueba que el flujo no manda
  // ya su propio correo — duplicarlo es el error fácil aquí.
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
  CLASE_MODIFICADA: 'clase.modificada',
  SUSTITUCION_ACEPTADA: 'sustitucion.aceptada',
  SUSTITUCION_RECHAZADA: 'sustitucion.rechazada',
  PAGO_FALLIDO: 'pago.fallido',
  PAGO_REALIZADO: 'pago.realizado',
  SISTEMA_ERROR: 'sistema.error',
  // Automatizaciones (cron → publish)
  RECORDATORIO_24H: 'reserva.recordatorio_24h',
  RECORDATORIO_1H: 'reserva.recordatorio_1h',
  BONO_POR_CADUCAR: 'bono.por_caducar',
  BONO_AGOTADO: 'bono.agotado',
  CLASE_CASI_LLENA: 'clase.casi_llena',
  SOCIA_INACTIVA: 'socia.inactiva',
  // Operativos de la dueña (antes escribían a la tabla legacy `notificaciones`)
  SALUD_REVISION: 'salud.revision_pendiente',
  RIESGO_DEPENDENCIA: 'riesgo.dependencia',
  // Equipo: la instructora avisa de que no puede dar una clase.
  INSTRUCTORA_BAJA: 'instructora.baja',
  // Equipo: ausencia programada (vacaciones / baja médica / otro).
  INSTRUCTORA_AUSENCIA: 'instructora.ausencia',
  // Una automatización con canal "aviso interno" se ha disparado.
  AUTOMATIZACION_DISPARADA: 'automatizacion.disparada',
  // Sistema: cosas que rompen el negocio y exigen acción de la dueña.
  SISTEMA_STRIPE_DESCONECTADO: 'sistema.stripe_desconectado',
  SISTEMA_EMAIL_FALLIDO: 'sistema.email_fallido',
} as const;

// Reglas por evento. La 1ª tanda cableada de la Fase 1 cubre los 3 roles.
export const REGLAS: Record<string, ReglaEvento> = {
  [EVENTOS.RESERVA_CREADA]:        { category: 'reservas', priority: 'BAJA',   canales: [],       audiencia: 'mostrador' },
  [EVENTOS.RESERVA_CONFIRMADA]:    { category: 'reservas', priority: 'MEDIA',  canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_LISTA_ESPERA]:  { category: 'reservas', priority: 'MEDIA',  canales: [],       audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_PLAZA_LIBERADA]:{ category: 'reservas', priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_CANCELADA]:     { category: 'reservas', priority: 'BAJA',   canales: [],       audiencia: 'socia-del-evento' },
  // clase.*: SIN EMAIL a propósito. El panel ya manda su propio correo a cada
  // alumna con plaza (enviarEmailCancelacionClase / avisarAlumnas) → declararlo
  // aquí les llegaría el mismo aviso dos veces.
  [EVENTOS.CLASE_CANCELADA]:       { category: 'clases',   priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socias-e-instructora-de-la-sesion' },
  [EVENTOS.CLASE_MODIFICADA]:      { category: 'clases',   priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socias-e-instructora-de-la-sesion' },
  [EVENTOS.SUSTITUCION_ACEPTADA]:  { category: 'sustituciones', priority: 'ALTA', canales: ['PUSH'], audiencia: 'instructora-del-evento' },
  [EVENTOS.SUSTITUCION_RECHAZADA]: { category: 'sustituciones', priority: 'ALTA', canales: [],     audiencia: 'propietaria' },
  // Sin EMAIL: el dunning ya manda su propio correo a la socia (1.er aviso).
  [EVENTOS.PAGO_FALLIDO]:          { category: 'pagos',    priority: 'ALTA',   canales: ['PUSH'], audiencia: 'mostrador-y-socia' },
  [EVENTOS.PAGO_REALIZADO]:        { category: 'pagos',    priority: 'BAJA',   canales: [],       audiencia: 'socia-del-evento' },
  // CRÍTICAS: declaran TODOS sus canales explícitamente. Antes bastaba con ser
  // CRÍTICA para que el motor forzara email/WA/SMS aunque la regla solo pusiera
  // PUSH; ahora que la regla manda, lo que no se declara no sale.
  [EVENTOS.SISTEMA_ERROR]:         { category: 'sistema',  priority: 'CRITICA', canales: ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS'], audiencia: 'propietaria' },
  // Automatizaciones
  [EVENTOS.RECORDATORIO_24H]:      { category: 'reservas', priority: 'MEDIA', canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RECORDATORIO_1H]:       { category: 'reservas', priority: 'ALTA',  canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.BONO_POR_CADUCAR]:      { category: 'pagos',    priority: 'MEDIA', canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.BONO_AGOTADO]:          { category: 'pagos',    priority: 'MEDIA', canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.CLASE_CASI_LLENA]:      { category: 'clases',   priority: 'BAJA',  canales: [],       audiencia: 'propietaria' },
  [EVENTOS.SOCIA_INACTIVA]:        { category: 'clases',   priority: 'BAJA',  canales: [],       audiencia: 'propietaria' },
  [EVENTOS.SALUD_REVISION]:        { category: 'sistema',  priority: 'MEDIA', canales: [],       audiencia: 'propietaria' },
  [EVENTOS.RIESGO_DEPENDENCIA]:    { category: 'sistema',  priority: 'MEDIA', canales: [],       audiencia: 'propietaria' },
  // Equipo: hay una clase sin quien la dé → la dueña tiene que actuar YA.
  [EVENTOS.INSTRUCTORA_BAJA]:      { category: 'sustituciones', priority: 'ALTA', canales: ['PUSH'], audiencia: 'propietaria' },
  // Ausencia programada: no es urgente (se registra con antelación), pero si deja
  // clases sin cubrir la dueña tiene que verlo.
  [EVENTOS.INSTRUCTORA_AUSENCIA]:  { category: 'sustituciones', priority: 'MEDIA', canales: [], audiencia: 'propietaria' },
  // Aviso interno de una automatización → al mostrador (dueña + recepción).
  [EVENTOS.AUTOMATIZACION_DISPARADA]: { category: 'sistema', priority: 'BAJA', canales: [], audiencia: 'mostrador' },
  // Stripe desconectado = se deja de cobrar. CRÍTICA: ignora preferencias y usa
  // todos los canales que declara (los no configurados → SKIPPED).
  [EVENTOS.SISTEMA_STRIPE_DESCONECTADO]: { category: 'sistema', priority: 'CRITICA', canales: ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS'], audiencia: 'propietaria' },
  // Email fallido: ALTA (no CRÍTICA) y sin EMAIL declarado a propósito — avisar
  // por correo de que el correo falla sería absurdo y podría realimentarse.
  [EVENTOS.SISTEMA_EMAIL_FALLIDO]: { category: 'sistema', priority: 'ALTA', canales: [], audiencia: 'propietaria' },
};

// Qué roles recibe cada audiencia. Se deriva de recipients.ts, pero declarado
// aquí (client-safe) para poder responder "¿este canal hace algo para mí?" sin
// tocar la BD.
export const ROLES_POR_AUDIENCIA: Record<Audiencia, NotificationRole[]> = {
  'socia-del-evento': ['SOCIA'],
  'socias-de-la-sesion': ['SOCIA'],
  'socias-e-instructora-de-la-sesion': ['SOCIA', 'INSTRUCTOR'],
  'propietaria': ['PROPIETARIO'],
  'instructora-del-evento': ['INSTRUCTOR'],
  'mostrador': ['PROPIETARIO', 'RECEPCION'],
  'mostrador-y-socia': ['PROPIETARIO', 'RECEPCION', 'SOCIA'],
};

// Canales que este rol puede llegar a recibir en esta categoría, según lo que
// declaran las reglas. Ahora que `canales` es la autoridad, un interruptor de un
// canal que ningún evento declara no haría NADA: la UI lo usa para no ofrecerlo
// en vez de mentirle al usuario.
export function canalesDisponibles(role: NotificationRole, category: NotificationCategory): NotificationChannel[] {
  const out = new Set<NotificationChannel>();
  for (const regla of Object.values(REGLAS)) {
    if (regla.category !== category) continue;
    if (!ROLES_POR_AUDIENCIA[regla.audiencia].includes(role)) continue;
    for (const canal of regla.canales) out.add(canal);
  }
  return [...out];
}

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
  // Reserva creada → la dueña y el mostrador (nueva inscripción)
  [`${EVENTOS.RESERVA_CREADA}#PROPIETARIO`]: {
    title: 'Nueva reserva',
    body: '{socia} ha reservado {clase} el {cuando}.',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
  },
  [`${EVENTOS.RESERVA_CREADA}#RECEPCION`]: {
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
  // Clase modificada (cambio de horario/sala) → cada socia apuntada
  [`${EVENTOS.CLASE_MODIFICADA}#SOCIA`]: {
    title: 'Tu clase ha cambiado',
    body: 'Tu clase de {clase} pasa a: {cuando} · {sala}{instructora}. Revisa tu reserva.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  // Los mismos dos eventos, contados desde el lado de quien imparte la clase:
  // no es "tu reserva", es tu turno de trabajo el que se cae o se mueve.
  [`${EVENTOS.CLASE_CANCELADA}#INSTRUCTOR`]: {
    title: 'Se ha cancelado tu clase',
    body: 'Tu clase de {clase} del {cuando} se ha cancelado. No hace falta que vayas.',
    deepLink: () => `/calendario`,
  },
  [`${EVENTOS.CLASE_MODIFICADA}#INSTRUCTOR`]: {
    title: 'Tu clase ha cambiado',
    body: 'Tu clase de {clase} pasa a: {cuando} · {sala}. Revisa tu horario.',
    deepLink: () => `/calendario`,
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
  // Pago fallido → dueña, mostrador y socia (mismo evento, textos por rol)
  [`${EVENTOS.PAGO_FALLIDO}#PROPIETARIO`]: {
    title: 'Pago fallido',
    body: 'No se ha podido cobrar {concepto} ({importe} €) a {socia}.',
    deepLink: () => `/cobros?tab=pendientes`,
  },
  [`${EVENTOS.PAGO_FALLIDO}#RECEPCION`]: {
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
  // ── Automatizaciones ──
  [`${EVENTOS.RECORDATORIO_24H}#SOCIA`]: {
    title: 'Mañana tienes clase',
    body: 'Recuerda: {clase} mañana a las {hora}. ¡Te esperamos!',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  [`${EVENTOS.RECORDATORIO_1H}#SOCIA`]: {
    title: 'Tu clase es en 1 hora',
    body: '{clase} a las {hora}. ¡Nos vemos en un rato!',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  [`${EVENTOS.BONO_POR_CADUCAR}#SOCIA`]: {
    title: 'Tu bono está por caducar',
    body: 'Te quedan {sesiones} sesiones y tu bono caduca el {fecha}. Renueva para no perderlas.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/mi-plan`,
  },
  [`${EVENTOS.BONO_AGOTADO}#SOCIA`]: {
    title: 'Se te ha agotado el bono',
    body: 'Has usado la última sesión de tu bono de {plan}. Renueva para seguir reservando.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/mi-plan`,
  },
  [`${EVENTOS.CLASE_CASI_LLENA}#PROPIETARIO`]: {
    title: 'Clase casi llena',
    body: '{clase} del {cuando} va al {porcentaje}% ({ocupadas}/{aforo} plazas).',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
  },
  [`${EVENTOS.SOCIA_INACTIVA}#PROPIETARIO`]: {
    title: 'Clienta inactiva',
    body: '{socia} lleva {dias} días sin venir. Quizá un mensaje la recupere.',
    deepLink: (d: Datos) => `/clientas/${s(d.socioId)}`,
  },
  // Operativos de la dueña (migrados de la tabla legacy)
  [`${EVENTOS.SALUD_REVISION}#PROPIETARIO`]: {
    title: 'Revisión de ficha de salud',
    body: '{mensaje}',
    deepLink: (d: Datos) => `/clientas/${s(d.socioId)}?rev=${s(d.condId)}`,
  },
  [`${EVENTOS.RIESGO_DEPENDENCIA}#PROPIETARIO`]: {
    title: 'Riesgo de concentración alto',
    body: '{instructora} concentra el {porcentaje}% de tu facturación en alumnas cautivas. Si se va, ese ingreso está en riesgo.',
    deepLink: () => `/dashboard`,
  },
  // ── Equipo ──
  [`${EVENTOS.INSTRUCTORA_BAJA}#PROPIETARIO`]: {
    title: 'Una instructora no puede dar su clase',
    body: '{instructora} no puede dar {clase} del {cuando}{motivo}. Buscando sustituta.',
    deepLink: () => `/sustituciones`,
  },
  [`${EVENTOS.INSTRUCTORA_AUSENCIA}#PROPIETARIO`]: {
    title: 'Ausencia registrada: {tipoTexto}',
    body: '{instructora} no estará del {desde} al {hasta}{clases}.',
    deepLink: () => `/equipo`,
  },
  // ── Sistema ──
  [`${EVENTOS.SISTEMA_STRIPE_DESCONECTADO}#PROPIETARIO`]: {
    title: 'Stripe desconectado — no puedes cobrar',
    body: 'Se ha desconectado tu cuenta de Stripe: los cobros automáticos están parados. Vuelve a conectarla para seguir cobrando.',
    deepLink: () => `/configuracion?tab=integraciones`,
  },
  [`${EVENTOS.SISTEMA_EMAIL_FALLIDO}#PROPIETARIO`]: {
    title: 'Fallan los envíos de email',
    body: 'Hoy no se han podido entregar algunos correos a tus clientas (último error: {error}). Revisa la configuración de email.',
    deepLink: () => `/configuracion?tab=integraciones`,
  },
  [`${EVENTOS.AUTOMATIZACION_DISPARADA}#PROPIETARIO`]: {
    title: 'Automatización: {automatizacion}',
    body: 'Se ha disparado para {socia}.',
    deepLink: (d: Datos) => `/clientas/${s(d.socioId)}`,
  },
  [`${EVENTOS.AUTOMATIZACION_DISPARADA}#RECEPCION`]: {
    title: 'Automatización: {automatizacion}',
    body: 'Se ha disparado para {socia}.',
    deepLink: (d: Datos) => `/clientas/${s(d.socioId)}`,
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
  // Recepción = mostrador: lo operativo que gestiona (reservas nuevas, cobros
  // fallidos). No configura marketing/informes/sistema (fuera de su rol).
  RECEPCION: ['reservas', 'pagos'],
  SOCIA: ['reservas', 'clases', 'pagos', 'marketing'],
};
