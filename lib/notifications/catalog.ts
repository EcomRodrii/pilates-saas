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
  | 'mostrador-y-socia'
  // Tentare Network (Fase 7): quien decide sobre el equipo, SIN recepción —
  // verificar una experiencia es una decisión de gerencia, no de mostrador
  // (mismo criterio que ya separa `puede_gestionar_equipo()` de `puedeVerFinanzas`
  // en lib/permisos-reglas.ts).
  | 'gerencia'
  // Tentare Network: la profesional dueña de un perfil de Network, resuelta
  // por `data.authUserId` — no tiene rol dentro del `studioId` del evento (ese
  // studioId es el del ESTUDIO que resolvió la verificación, no uno al que
  // ella pertenezca).
  | 'red-profesional'
  // Tentare Network (Fase 9): quien ENVIÓ una solicitud de contacto, resuelta
  // por `data.solicitanteAuthUserId` — nunca toda la gerencia, el mensaje
  // lleva datos de contacto privados.
  | 'red-solicitante-contacto'
  // Tentare Network (Fase 2, matching): lista de profesionales resuelta por
  // `data.authUserIds` (N personas, no una) — a diferencia de
  // 'red-profesional', que resuelve una sola por `data.authUserId`. Sin
  // relación con el `studioId` del evento (el estudio que publicó, no uno al
  // que pertenezcan).
  | 'red-instructoras-lista';

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
  // Fase 2a (migr 20260730192445): aprobación manual. Único evento nuevo de
  // toda la feature — aprobar reutiliza RESERVA_CONFIRMADA/RESERVA_LISTA_ESPERA
  // (emitirReserva) y rechazar/expirar reutiliza RESERVA_CANCELADA
  // (emitirReservaCancelada, con motivo). Esta es la única notificación sin
  // equivalente ya existente: alguien tiene que enterarse de que hay algo que
  // revisar, y RESERVA_CREADA (prioridad BAJA, sin canales) no vale para eso.
  RESERVA_PENDIENTE_APROBACION: 'reserva.pendiente_aprobacion',
  // Fase 2b (migr 20260731130000): plazo para aceptar una plaza de lista de
  // espera. Único evento nuevo de esta feature — aceptar reutiliza
  // RESERVA_CONFIRMADA (emitirReserva) y la caducidad de la oferta reutiliza
  // RESERVA_CANCELADA (emitirReservaCancelada, motivo 'oferta_caducada').
  RESERVA_OFERTA_LISTA_ESPERA: 'reserva.oferta_lista_espera',
  // Fase 8 "Booking Experience Engine" (CRO): la visitante ya identificada
  // dejó algo a medias en el widget (cerró el modal de reserva ya iniciado, o
  // canceló el pago en Stripe) — mismo criterio de recuperación legítima que
  // un aviso de "tu bono caduca", nunca un patrón oscuro. Ver
  // docs/cro-analytics-widget-diseno.md §5.2.
  RESERVA_ABANDONADA: 'reserva.abandonada',
  // Cron de plazas fijas (materializar-plazas): esta semana NO se ha podido
  // generar la reserva automática de "tu reformer fijo" — sesión cancelada,
  // suscripción pausada, o sin aforo tras priorizar por antigüedad. Distinto
  // de RESERVA_CANCELADA: ahí existió una reserva y se deshizo; aquí no llegó
  // a crearse ninguna, así que ese evento mentiría.
  RESERVA_PLAZA_FIJA_NO_MATERIALIZADA: 'reserva.plaza_fija_no_materializada',
  CLASE_CANCELADA: 'clase.cancelada',
  CLASE_MODIFICADA: 'clase.modificada',
  // Cubrir NO es mover: la clase se queda donde está y solo cambia quién la da.
  // Con `clase.modificada` el aviso decía "tu clase pasa a: <la misma hora>", que
  // se lee como un cambio de horario y hace que la alumna se replantee si va.
  CLASE_SUSTITUTA: 'clase.sustituta',
  SUSTITUCION_ACEPTADA: 'sustitucion.aceptada',
  SUSTITUCION_RECHAZADA: 'sustitucion.rechazada',
  PAGO_FALLIDO: 'pago.fallido',
  PAGO_REALIZADO: 'pago.realizado',
  // Mismo hecho que PAGO_REALIZADO (mismo recibo, mismo publish desde
  // emitirPagoRealizado), pero PAGO_REALIZADO es BAJA/sin canales porque su
  // destinataria es la socia (un recibo más, nada que celebrar desde su lado).
  // El mostrador SÍ quiere enterarse al momento de que ha entrado dinero — es
  // el aviso que dispara el toast+sonido "cha-ching" del panel — así que es un
  // evento propio en vez de ampliar la audiencia de PAGO_REALIZADO: la
  // prioridad/canales se declaran por evento, y mezclar audiencias con
  // necesidades de urgencia distintas en una sola regla las igualaría a la
  // baja (mismo criterio que separó PAGO_CHARGEBACK_PERDIDO de PAGO_DEVUELTO).
  VENTA_REGISTRADA: 'venta.registrada',
  // Disputa/chargeback de Stripe: el dinero ya se cobró y ahora se impugna.
  // Distinto de PAGO_FALLIDO (ahí nunca llegó a cobrarse) — el estudio tiene
  // un plazo real de la propia Stripe para responder con evidencia.
  PAGO_DISPUTADO: 'pago.disputado',
  // Fase 3: cobro de penalización por cancelación tardía/no-show ya realizado
  // con la tarjeta guardada — a la socia. Reutiliza el email genérico de
  // recibo (ReciboEmail), no una plantilla nueva.
  PAGO_PENALIZACION: 'pago.penalizacion',
  // Fase 3: el guard de consentimiento bloqueó un cobro de penalización — a
  // la propietaria, es accionable por su parte (pedir que la socia acepte el
  // contrato actualizado), a diferencia de "sin tarjeta" que es silencioso.
  PAGO_PENALIZACION_BLOQUEADA: 'pago.penalizacion_bloqueada',
  // Devolución de dinero (reembolso total o parcial). El reembolso PARCIAL era
  // hasta ahora 100 % invisible: no marcaba el recibo, no avisaba a nadie y no
  // dejaba rastro — siendo el caso más habitual cuando la socia ya usó parte del
  // bono. Lo accionable no es el dinero (ya se movió en Stripe pase lo que pase),
  // sino que la socia se queda con lo entregado si nadie lo revisa.
  PAGO_DEVUELTO: 'pago.devuelto',
  // Disputa PERDIDA. Evento propio y no una variante de PAGO_DEVUELTO porque la
  // prioridad y los canales se declaran POR evento, y este necesita más: el
  // dinero se ha perdido definitivamente y ya no hay plazo que responder.
  // Tampoco se reutiliza PAGO_DISPUTADO: su copy habla del plazo de evidencia
  // (que ya pasó) y su dedupKey es por recibo, así que el segundo aviso del
  // mismo recibo se tragaría en silencio.
  PAGO_CHARGEBACK_PERDIDO: 'pago.chargeback_perdido',
  SISTEMA_ERROR: 'sistema.error',
  // Automatizaciones (cron → publish)
  RECORDATORIO_24H: 'reserva.recordatorio_24h',
  RECORDATORIO_1H: 'reserva.recordatorio_1h',
  BONO_POR_CADUCAR: 'bono.por_caducar',
  BONO_AGOTADO: 'bono.agotado',
  CLASE_CASI_LLENA: 'clase.casi_llena',
  SOCIA_INACTIVA: 'socia.inactiva',
  // Autoservicio de instructora (migración 20260731100000): se ha creado a sí
  // misma una clase nueva. Informativo, no accionable — sin push/email.
  CLASE_CREADA_POR_INSTRUCTOR: 'clase.creada_por_instructor',
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
  // El Umbral (lib/decision/umbral.ts): como mucho UN evento de este tipo al
  // día por estudio (reforzado por el UNIQUE(studio_id,fecha) de
  // decision_mensajes_dia) — nunca se dispara si el día es de silencio.
  DECISION_MENSAJE_DIA: 'decision.mensaje_dia',
  // Tentare Network, Fase 7 (docs/NETWORK-IMPLEMENTATION-PLAN.md §4/§10).
  // Una profesional pide a un estudio que confirme una experiencia laboral.
  RED_VERIFICACION_SOLICITADA: 'red.verificacion_solicitada',
  RED_EXPERIENCIA_CONFIRMADA: 'red.experiencia_confirmada',
  RED_EXPERIENCIA_RECHAZADA: 'red.experiencia_rechazada',
  // Fase 9: un estudio contacta a una profesional. El email de aceptación es
  // el ÚNICO sitio donde se revela email/teléfono de contacto — nunca en un
  // listado (ver comentario en la migración de red_solicitudes_contacto).
  RED_CONTACTO_SOLICITADO: 'red.contacto_solicitado',
  RED_CONTACTO_ACEPTADO: 'red.contacto_aceptado',
  // Fase 2 (matching): un estudio recibe una candidatura a una vacante.
  RED_CANDIDATURA_RECIBIDA: 'red.candidatura_recibida',
  // Fase 2 (matching): se publica una vacante que encaja con tu perfil.
  // Única audiencia "no solicitada" de todo Network — ver la regla en
  // REGLAS más abajo (solo PUSH, sin EMAIL).
  RED_VACANTE_ENCAJA: 'red.vacante_encaja',
} as const;

// Reglas por evento. La 1ª tanda cableada de la Fase 1 cubre los 3 roles.
export const REGLAS: Record<string, ReglaEvento> = {
  [EVENTOS.RESERVA_CREADA]:        { category: 'reservas', priority: 'BAJA',   canales: [],       audiencia: 'mostrador' },
  [EVENTOS.RESERVA_CONFIRMADA]:    { category: 'reservas', priority: 'MEDIA',  canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_LISTA_ESPERA]:  { category: 'reservas', priority: 'MEDIA',  canales: [],       audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_PLAZA_LIBERADA]:{ category: 'reservas', priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socia-del-evento' },
  [EVENTOS.RESERVA_CANCELADA]:     { category: 'reservas', priority: 'BAJA',   canales: [],       audiencia: 'socia-del-evento' },
  // MEDIA + PUSH: informativo (no hay plazo que cumplir), pero merece
  // notarse — es la feature premium "tu reformer fijo" fallando en silencio
  // si no se avisa, y la socia puede reservar manualmente en su lugar.
  [EVENTOS.RESERVA_PLAZA_FIJA_NO_MATERIALIZADA]: { category: 'reservas', priority: 'MEDIA', canales: ['PUSH'], audiencia: 'socia-del-evento' },
  // ALTA + PUSH a propósito: a diferencia de RESERVA_CREADA (informativa),
  // esta requiere una acción de la propietaria/mostrador antes de que empiece
  // la clase.
  [EVENTOS.RESERVA_PENDIENTE_APROBACION]: { category: 'reservas', priority: 'ALTA', canales: ['PUSH'], audiencia: 'mostrador' },
  // ALTA + PUSH: la socia tiene un plazo real para aceptar antes de que se
  // ofrezca a la siguiente — mismo criterio que RESERVA_PLAZA_LIBERADA, pero
  // aquí SÍ hace falta que actúe (no basta con enterarse).
  [EVENTOS.RESERVA_OFERTA_LISTA_ESPERA]: { category: 'reservas', priority: 'ALTA', canales: ['PUSH'], audiencia: 'socia-del-evento' },
  // Solo EMAIL a propósito (§5.2 del diseño): un push sería más intrusivo de
  // lo que merece un recordatorio informativo, y el canal in-app no llega a
  // quien todavía no ha vuelto a abrir la app. BAJA prioridad — informativo,
  // sin urgencia real de negocio.
  [EVENTOS.RESERVA_ABANDONADA]: { category: 'reservas', priority: 'BAJA', canales: ['EMAIL'], audiencia: 'socia-del-evento' },
  // clase.*: SIN EMAIL a propósito. El panel ya manda su propio correo a cada
  // alumna con plaza (enviarEmailCancelacionClase / avisarAlumnas) → declararlo
  // aquí les llegaría el mismo aviso dos veces.
  [EVENTOS.CLASE_CANCELADA]:       { category: 'clases',   priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socias-e-instructora-de-la-sesion' },
  [EVENTOS.CLASE_MODIFICADA]:      { category: 'clases',   priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socias-e-instructora-de-la-sesion' },
  // Solo las alumnas: a quien entra a cubrir ya se le avisa por sustitucion.aceptada.
  [EVENTOS.CLASE_SUSTITUTA]:       { category: 'clases',   priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socias-de-la-sesion' },
  [EVENTOS.SUSTITUCION_ACEPTADA]:  { category: 'sustituciones', priority: 'ALTA', canales: ['PUSH'], audiencia: 'instructora-del-evento' },
  [EVENTOS.SUSTITUCION_RECHAZADA]: { category: 'sustituciones', priority: 'ALTA', canales: [],     audiencia: 'propietaria' },
  // Sin EMAIL: el dunning ya manda su propio correo a la socia (1.er aviso).
  [EVENTOS.PAGO_FALLIDO]:          { category: 'pagos',    priority: 'ALTA',   canales: ['PUSH'], audiencia: 'mostrador-y-socia' },
  [EVENTOS.PAGO_REALIZADO]:        { category: 'pagos',    priority: 'BAJA',   canales: [],       audiencia: 'socia-del-evento' },
  // Solo in-app a propósito: el canal que importa aquí es el toast+sonido en
  // tiempo real de la campana (realtime, no un "canal" del catálogo) cuando el
  // panel está abierto. CON push además: si la propietaria tiene el móvil con
  // el PWA instalado (panel.webmanifest) y no está mirando el panel en ese
  // momento, quiere enterarse igual — pedido explícito del fundador tras
  // probar un pago real sin tener el panel en pantalla.
  [EVENTOS.VENTA_REGISTRADA]:      { category: 'pagos',    priority: 'MEDIA',  canales: ['PUSH'], audiencia: 'mostrador' },
  // Sin EMAIL: el recibo (ReciboEmail) ya se manda por separado.
  [EVENTOS.PAGO_PENALIZACION]:     { category: 'pagos',    priority: 'ALTA',   canales: ['PUSH'], audiencia: 'socia-del-evento' },
  // Solo in-app, sin push: es accionable pero no urgente de interrumpir.
  [EVENTOS.PAGO_PENALIZACION_BLOQUEADA]: { category: 'pagos', priority: 'MEDIA', canales: [], audiencia: 'propietaria' },
  // Solo al mostrador: quien disputa el cargo es la propia socia, avisarla
  // de su propia disputa no tiene sentido. EMAIL sí (hay un plazo de Stripe
  // que responder, no es algo que se pueda dejar para cuando se abra el panel).
  // Solo in-app + push: hay que revisarlo, pero el dinero ya se movió y no hay
  // ningún plazo externo corriendo. Audiencia `mostrador` con plantillas solo
  // para PROPIETARIO y RECEPCION: sin plantilla `#MANAGER` el motor lo descarta
  // solo, y MANAGER no puede ni leer `recibos` (migr 0114), así que el enlace le
  // llevaría a una pantalla vacía. Mismo criterio que PAGO_DISPUTADO.
  [EVENTOS.PAGO_DEVUELTO]: { category: 'pagos', priority: 'MEDIA', canales: ['PUSH'], audiencia: 'mostrador' },
  // ALTA + EMAIL: el dinero se ha perdido definitivamente y encima la socia
  // conserva lo entregado hasta que alguien lo revise.
  [EVENTOS.PAGO_CHARGEBACK_PERDIDO]: { category: 'pagos', priority: 'ALTA', canales: ['PUSH', 'EMAIL'], audiencia: 'mostrador' },
  [EVENTOS.PAGO_DISPUTADO]:        { category: 'pagos',    priority: 'ALTA',   canales: ['PUSH', 'EMAIL'], audiencia: 'mostrador' },
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
  [EVENTOS.CLASE_CREADA_POR_INSTRUCTOR]: { category: 'clases', priority: 'BAJA', canales: [],   audiencia: 'propietaria' },
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
  // ALTA + PUSH+INAPP a propósito, nada más: el Umbral solo interrumpe cuando
  // cree que merece la pena — un canal más (EMAIL/WHATSAPP/SMS) diluiría esa
  // misma promesa. Sin EMAIL: el mensaje es del día, no algo para revisar
  // luego en la bandeja.
  [EVENTOS.DECISION_MENSAJE_DIA]: { category: 'decisiones', priority: 'ALTA', canales: ['PUSH'], audiencia: 'propietaria' },
  // Tentare Network, Fase 7. MEDIA (no ALTA): accionable pero sin urgencia de
  // reloj, a diferencia de INSTRUCTORA_BAJA (una clase se queda sin cubrir HOY).
  [EVENTOS.RED_VERIFICACION_SOLICITADA]: { category: 'red', priority: 'MEDIA', canales: ['PUSH', 'EMAIL'], audiencia: 'gerencia' },
  [EVENTOS.RED_EXPERIENCIA_CONFIRMADA]:  { category: 'red', priority: 'MEDIA', canales: ['PUSH', 'EMAIL'], audiencia: 'red-profesional' },
  // BAJA + sin EMAIL a propósito: un rechazo no es un fallo del sistema que
  // amerite una bandeja de entrada, es información que ya se ve al abrir
  // /network/mi-perfil (mismo criterio que CLASE_CREADA_POR_INSTRUCTOR).
  [EVENTOS.RED_EXPERIENCIA_RECHAZADA]:   { category: 'red', priority: 'BAJA',  canales: ['PUSH'], audiencia: 'red-profesional' },
  [EVENTOS.RED_CONTACTO_SOLICITADO]: { category: 'red', priority: 'MEDIA', canales: ['PUSH', 'EMAIL'], audiencia: 'red-profesional' },
  // ALTA (no MEDIA): a diferencia de una verificación, aquí hay una persona
  // al otro lado esperando una respuesta concreta para poder escribirle.
  [EVENTOS.RED_CONTACTO_ACEPTADO]:   { category: 'red', priority: 'ALTA',  canales: ['PUSH', 'EMAIL'], audiencia: 'red-solicitante-contacto' },
  // MEDIA + PUSH/EMAIL: mismo criterio que RED_VERIFICACION_SOLICITADA
  // (alguien de fuera pide que la gerencia actúe, sin urgencia de reloj).
  [EVENTOS.RED_CANDIDATURA_RECIBIDA]: { category: 'red', priority: 'MEDIA', canales: ['PUSH', 'EMAIL'], audiencia: 'gerencia' },
  // BAJA + solo PUSH: a diferencia de los demás eventos `red.*` (reacción a
  // algo que la propia persona pidió), este es el único push NO solicitado —
  // un canal más (sobre todo EMAIL) sería spam de bandeja para alguien que
  // nunca pidió que le avisaran de esta vacante concreta.
  [EVENTOS.RED_VACANTE_ENCAJA]: { category: 'red', priority: 'BAJA', canales: ['PUSH'], audiencia: 'red-instructoras-lista' },
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
  // El manager entra en «mostrador»: lleva la sede, así que un aviso de lo que
  // pasa en ella le corresponde. Que no vea la facturación no significa que no
  // deba enterarse de una lista de espera o de una baja.
  'mostrador': ['PROPIETARIO', 'RECEPCION', 'MANAGER'],
  'mostrador-y-socia': ['PROPIETARIO', 'RECEPCION', 'MANAGER', 'SOCIA'],
  'gerencia': ['PROPIETARIO', 'MANAGER'],
  // No es un rol DENTRO del estudio del evento — ver el comentario de
  // 'red-profesional' en el tipo `Audiencia` de arriba. Se declara INSTRUCTOR
  // porque es el rol más parecido que existe hoy en `NotificationRole`, y es
  // lo que determina en qué categoría de sus preferencias cae este aviso.
  'red-profesional': ['INSTRUCTOR'],
  // Quien haya enviado la solicitud puede ser cualquier rol de staff.
  'red-solicitante-contacto': ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'],
  // Mismo criterio que 'red-profesional': no es un rol dentro de un estudio.
  'red-instructoras-lista': ['INSTRUCTOR'],
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
  // Fase 2b: a diferencia de RESERVA_PLAZA_LIBERADA (ya confirmada), esta se
  // dispara cuando el estudio exige plazo de aceptación — la socia tiene que
  // ACTUAR antes de {hora} o pierde el sitio.
  [`${EVENTOS.RESERVA_OFERTA_LISTA_ESPERA}#SOCIA`]: {
    title: 'Se ha liberado una plaza',
    body: 'Tienes hasta las {hora} para aceptar tu plaza en {clase} ({cuando}).',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/reservas?tab=ESPERA`,
  },
  // {motivoTexto}: vacío en la cancelación normal (mismo texto de siempre);
  // rellena cuando la cancela el rechazo/expiración de una aprobación
  // pendiente (Fase 2a) — mismo evento, mensaje adaptado en vez de uno nuevo.
  [`${EVENTOS.RESERVA_CANCELADA}#SOCIA`]: {
    title: 'Reserva cancelada',
    body: 'Se ha cancelado tu reserva de {clase} del {cuando}.{motivoTexto}',
  },
  // {claseTexto}: la clase concreta si la había ("tu plaza en {clase}"), o
  // vacío para el camino de compra de plan cancelada en Stripe (sin sesión
  // de clase asociada) — un solo texto, sin plantilla duplicada por caso.
  [`${EVENTOS.RESERVA_ABANDONADA}#SOCIA`]: {
    title: 'Dejaste algo a medias',
    body: 'Viste{claseTexto} en nuestra web pero no llegaste a confirmarlo. Si quieres, puedes retomarlo cuando te venga bien.',
    deepLink: (d: Datos) => `/reservar/${s(d.slug)}`,
  },
  // {motivoTexto} explica por qué, igual que en RESERVA_CANCELADA — mismo
  // patrón, tres motivos posibles según plazas_fijas_sin_materializar.
  [`${EVENTOS.RESERVA_PLAZA_FIJA_NO_MATERIALIZADA}#SOCIA`]: {
    title: 'Tu plaza fija no se ha reservado esta semana',
    body: 'No hemos podido confirmar tu plaza fija en {clase} del {cuando}.{motivoTexto}',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/clases/${s(d.sesionId)}`,
  },
  // Reserva pendiente de aprobar → mostrador (propietaria/manager/recepción)
  [`${EVENTOS.RESERVA_PENDIENTE_APROBACION}#PROPIETARIO`]: {
    title: 'Reserva pendiente de aprobar',
    body: '{socia} quiere reservar {clase} el {cuando}. Requiere tu aprobación.',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
  },
  [`${EVENTOS.RESERVA_PENDIENTE_APROBACION}#MANAGER`]: {
    title: 'Reserva pendiente de aprobar',
    body: '{socia} quiere reservar {clase} el {cuando}. Requiere tu aprobación.',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
  },
  [`${EVENTOS.RESERVA_PENDIENTE_APROBACION}#RECEPCION`]: {
    title: 'Reserva pendiente de aprobar',
    body: '{socia} quiere reservar {clase} el {cuando}. Requiere tu aprobación.',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
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
  // Clase cubierta por otra instructora → cada socia apuntada. Lo primero que
  // tiene que quedar claro es que la clase SIGUE: si el aviso empieza hablando
  // del cambio, la alumna ya está pensando en cancelar.
  [`${EVENTOS.CLASE_SUSTITUTA}#SOCIA`]: {
    title: 'Tu clase sigue en pie',
    body: 'La clase de {clase} del {cuando} la dará {sustituta}. Tu reserva no cambia.',
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
  // `{siguiente}` en vez de un "Busca otra opción" fijo: en modo autónomo el
  // motor ya ha pasado a la siguiente candidata por su cuenta, y decirle a la
  // propietaria que busque sería mandarla a hacer un trabajo que no le toca.
  [`${EVENTOS.SUSTITUCION_RECHAZADA}#PROPIETARIO`]: {
    title: 'Sustitución rechazada',
    body: '{instructora} no puede cubrir {clase} del {cuando}. {siguiente}',
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
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/compras`,
  },
  [`${EVENTOS.PAGO_REALIZADO}#SOCIA`]: {
    title: 'Pago recibido',
    body: 'Hemos recibido tu pago de {concepto} ({importe} €). ¡Gracias!',
  },
  // Nueva venta → mostrador (dueña/manager/recepción). Mismo texto para las
  // tres, mismo criterio que el resto de plantillas `mostrador`.
  [`${EVENTOS.VENTA_REGISTRADA}#PROPIETARIO`]: {
    title: 'Nueva venta',
    body: '{socia} ha comprado {concepto} — {importe} €.',
    deepLink: () => `/cobros?tab=cobrado`,
  },
  [`${EVENTOS.VENTA_REGISTRADA}#MANAGER`]: {
    title: 'Nueva venta',
    body: '{socia} ha comprado {concepto} — {importe} €.',
    deepLink: () => `/cobros?tab=cobrado`,
  },
  [`${EVENTOS.VENTA_REGISTRADA}#RECEPCION`]: {
    title: 'Nueva venta',
    body: '{socia} ha comprado {concepto} — {importe} €.',
    deepLink: () => `/cobros?tab=cobrado`,
  },
  [`${EVENTOS.PAGO_PENALIZACION}#SOCIA`]: {
    title: 'Cargo por cancelación tardía',
    body: 'Se te ha cobrado {importe} € por cancelar dentro de la ventana permitida o no presentarte a la clase.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/compras`,
  },
  // audiencia: 'propietaria' resuelve solo a PROPIETARIO (ROLES_POR_AUDIENCIA) —
  // una única plantilla basta.
  [`${EVENTOS.PAGO_PENALIZACION_BLOQUEADA}#PROPIETARIO`]: {
    title: 'Penalización sin cobrar',
    body: 'Una penalización de {importe} € no se ha podido cobrar porque la socia no ha aceptado el contrato con la cláusula actualizada.',
  },
  // {tipoTexto} distingue total de parcial dentro del mismo evento — mismo
  // patrón que {motivoTexto} en RESERVA_CANCELADA. Lo que NO se puede meter en
  // una variable es la prioridad, y por eso el chargeback es un evento aparte.
  [`${EVENTOS.PAGO_DEVUELTO}#PROPIETARIO`]: {
    title: 'Has devuelto un cobro',
    body: 'Se han devuelto {importe} € a {socia}{tipoTexto}. Revisa si hay que retirarle lo que pagó.',
    deepLink: () => `/dashboard`,
  },
  [`${EVENTOS.PAGO_DEVUELTO}#RECEPCION`]: {
    title: 'Has devuelto un cobro',
    body: 'Se han devuelto {importe} € a {socia}{tipoTexto}. Revisa si hay que retirarle lo que pagó.',
    deepLink: () => `/dashboard`,
  },
  [`${EVENTOS.PAGO_CHARGEBACK_PERDIDO}#PROPIETARIO`]: {
    title: 'Has perdido una disputa',
    body: 'El banco ha dado la razón a {socia}: {importe} € se han perdido definitivamente. Sigue teniendo lo que pagó — revísalo.',
    deepLink: () => `/dashboard`,
  },
  [`${EVENTOS.PAGO_CHARGEBACK_PERDIDO}#RECEPCION`]: {
    title: 'Has perdido una disputa',
    body: 'El banco ha dado la razón a {socia}: {importe} € se han perdido definitivamente. Sigue teniendo lo que pagó — revísalo.',
    deepLink: () => `/dashboard`,
  },
  [`${EVENTOS.PAGO_DISPUTADO}#PROPIETARIO`]: {
    title: 'Un cargo ha sido disputado',
    body: '{socia} ha impugnado el cargo de {concepto} ({importe} €) ante su banco. Tienes hasta el {plazo} para responder con evidencia en Stripe.',
    deepLink: () => `/cobros?tab=pendientes`,
  },
  [`${EVENTOS.PAGO_DISPUTADO}#RECEPCION`]: {
    title: 'Un cargo ha sido disputado',
    body: '{socia} ha impugnado el cargo de {concepto} ({importe} €) ante su banco. Tienes hasta el {plazo} para responder con evidencia en Stripe.',
    deepLink: () => `/cobros?tab=pendientes`,
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
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/compras`,
  },
  [`${EVENTOS.BONO_AGOTADO}#SOCIA`]: {
    title: 'Se te ha agotado el bono',
    body: 'Has usado la última sesión de tu bono de {plan}. Renueva para seguir reservando.',
    deepLink: (d: Datos) => `/portal/${s(d.slug)}/compras`,
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
  [`${EVENTOS.CLASE_CREADA_POR_INSTRUCTOR}#PROPIETARIO`]: {
    title: 'Clase nueva creada por una instructora',
    body: '{instructora} ha creado {clase} el {cuando}.',
    deepLink: (d: Datos) => `/calendario?sesion=${s(d.sesionId)}`,
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
  // El Umbral: una sola frase, sin vocabulario de especialista/confianza
  // cruda. {titulo}/{motivo} ya vienen redactados por el motor
  // (tituloMotor/motivoMotor de la candidata elegida).
  [`${EVENTOS.DECISION_MENSAJE_DIA}#PROPIETARIO`]: {
    title: '{titulo}',
    body: '{motivo}',
    deepLink: () => `/centro-de-control`,
  },
  // ── Tentare Network (Fase 7) ──
  [`${EVENTOS.RED_VERIFICACION_SOLICITADA}#PROPIETARIO`]: {
    title: 'Solicitud de verificación en Network',
    body: '{profesional} indica que trabajó en tu estudio y pide que lo confirmes.',
    deepLink: () => `/equipo/verificaciones-network`,
  },
  [`${EVENTOS.RED_VERIFICACION_SOLICITADA}#MANAGER`]: {
    title: 'Solicitud de verificación en Network',
    body: '{profesional} indica que trabajó en tu estudio y pide que lo confirmes.',
    deepLink: () => `/equipo/verificaciones-network`,
  },
  [`${EVENTOS.RED_EXPERIENCIA_CONFIRMADA}#INSTRUCTOR`]: {
    title: 'Experiencia verificada',
    body: '{estudio} ha confirmado tu experiencia en Tentare Network.',
    deepLink: () => `/network/mi-perfil`,
  },
  [`${EVENTOS.RED_EXPERIENCIA_RECHAZADA}#INSTRUCTOR`]: {
    title: 'Experiencia no confirmada',
    body: '{estudio} no ha podido confirmar tu experiencia en Tentare Network.',
    deepLink: () => `/network/mi-perfil`,
  },
  [`${EVENTOS.RED_CONTACTO_SOLICITADO}#INSTRUCTOR`]: {
    title: 'Un estudio quiere contactar contigo',
    body: '{estudio} te ha encontrado en Tentare Network y quiere hablar contigo.',
    deepLink: () => `/network/solicitudes`,
  },
  // El único sitio de todo Network donde el cuerpo lleva datos de contacto
  // privados — por diseño (§6 del plan): la aceptación es la única puerta.
  [`${EVENTOS.RED_CONTACTO_ACEPTADO}#PROPIETARIO`]: {
    title: '{profesional} ha aceptado tu solicitud',
    body: 'Puedes escribirle a {emailContacto}{telefonoTexto}.',
    deepLink: () => `/network`,
  },
  [`${EVENTOS.RED_CONTACTO_ACEPTADO}#MANAGER`]: {
    title: '{profesional} ha aceptado tu solicitud',
    body: 'Puedes escribirle a {emailContacto}{telefonoTexto}.',
    deepLink: () => `/network`,
  },
  [`${EVENTOS.RED_CONTACTO_ACEPTADO}#RECEPCION`]: {
    title: '{profesional} ha aceptado tu solicitud',
    body: 'Puedes escribirle a {emailContacto}{telefonoTexto}.',
    deepLink: () => `/network`,
  },
  [`${EVENTOS.RED_CONTACTO_ACEPTADO}#INSTRUCTOR`]: {
    title: '{profesional} ha aceptado tu solicitud',
    body: 'Puedes escribirle a {emailContacto}{telefonoTexto}.',
    deepLink: () => `/network`,
  },
  [`${EVENTOS.RED_CANDIDATURA_RECIBIDA}#PROPIETARIO`]: {
    title: 'Nueva candidatura en Network',
    body: '{profesional} ha aplicado a "{vacanteTitulo}".',
    deepLink: (d: Datos) => `/network/vacantes/${s(d.vacanteId)}`,
  },
  [`${EVENTOS.RED_CANDIDATURA_RECIBIDA}#MANAGER`]: {
    title: 'Nueva candidatura en Network',
    body: '{profesional} ha aplicado a "{vacanteTitulo}".',
    deepLink: (d: Datos) => `/network/vacantes/${s(d.vacanteId)}`,
  },
  [`${EVENTOS.RED_VACANTE_ENCAJA}#INSTRUCTOR`]: {
    title: 'Una vacante que podría interesarte',
    body: '"{titulo}" encaja con tu perfil en Tentare Network.',
    deepLink: () => `/network/oportunidades`,
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
  decisiones: 'Centro de Control',
  red: 'Tentare Network',
};

// Categorías que cada rol puede configurar en sus preferencias.
export const CATEGORIAS_POR_ROL: Record<NotificationRole, NotificationCategory[]> = {
  PROPIETARIO: ['reservas', 'clases', 'sustituciones', 'pagos', 'sistema', 'decisiones', 'red'],
  INSTRUCTOR: ['clases', 'sustituciones', 'red'],
  // Recepción = mostrador: lo operativo que gestiona (reservas nuevas, cobros
  // fallidos). No configura marketing/informes/sistema (fuera de su rol) — ni
  // Network: verificar experiencias es decisión de gerencia, no de mostrador.
  RECEPCION: ['reservas', 'pagos'],
  // El manager lleva la sede pero no el dinero: lo operativo y las sustituciones
  // (es quien las resuelve), sin la categoría de pagos.
  MANAGER: ['reservas', 'clases', 'sustituciones', 'red'],
  SOCIA: ['reservas', 'clases', 'pagos', 'marketing'],
};
