// ─────────────────────────────────────────────────────────────────────────────
// Qué pasa con cada tabla cuando se SUPRIME a una socia (art. 17 RGPD).
//
// Decisión de producto cerrada: se borra o anonimiza TODO menos lo fiscal
// (facturas, recibos, ventas, devoluciones, pagos históricos), que se conserva
// seudonimizado por `socio_id`. Incluye su cuenta de acceso si no tiene más
// vínculos y su cliente en la cuenta Stripe del estudio (eso lo hace la ruta,
// fuera de la transacción: `app/api/socios/eliminar/route.ts`).
//
// Este módulo es la FUENTE DOCUMENTAL que comparten:
//   · la migración `20260913170100_anonimizar_socio.sql`, que la copia como
//     tabla en su cabecera y la ejecuta en `public.anonimizar_socio`;
//   · `supresion-cobertura.test.ts`, que falla si aparece en `lib/db-types.ts`
//     una tabla con una columna que apunta a una socia y no está aquí, o si una
//     tabla marcada BORRAR/ANONIMIZAR no aparece en la función SQL.
//
// ⚠️ Añadir una tabla con `socio_id` sin clasificarla aquí rompe el test A
// PROPÓSITO: la lista de la ruta de baja ya se dejó incompleta dos veces (I-14,
// H-2) por no tener nada que obligara a mirarla.
//
// Puro, sin I/O.
// ─────────────────────────────────────────────────────────────────────────────

export type AccionSupresion = 'BORRAR' | 'ANONIMIZAR' | 'CONSERVAR';

export interface ClasificacionTabla {
  accion: AccionSupresion;
  /** Qué se hace exactamente y por qué. Va copiado a la migración. */
  detalle: string;
}

export const CLASIFICACION_SUPRESION: Record<string, ClasificacionTabla> = {
  // ── Salud y notas (art. 9): sin base de retención ──────────────────────────
  condiciones_salud: { accion: 'BORRAR', detalle: 'Ficha clínica.' },
  respuestas_cuestionario_salud: { accion: 'BORRAR', detalle: 'Cuestionario de salud.' },
  respuestas_sesion: { accion: 'BORRAR', detalle: 'Respuestas y notas por sesión.' },
  notas_internas: { accion: 'BORRAR', detalle: 'Notas del staff sobre ella.' },
  notas_progreso: { accion: 'BORRAR', detalle: 'Progreso clínico.' },
  preferencias_socio: { accion: 'BORRAR', detalle: 'Preferencias personales.' },
  valoraciones_iniciales_salud: { accion: 'BORRAR', detalle: 'Mitad de salud de la valoración inicial (antes que la madre).' },
  valoraciones_iniciales: { accion: 'BORRAR', detalle: 'Valoración inicial.' },
  documentos_socio: {
    accion: 'BORRAR',
    detalle: 'Filas. El objeto de Storage lo borra la ruta ANTES; la función devuelve las rutas borradas para no dejar huérfanos sin rastro.',
  },

  // ── CRM, motor de decisiones y logs con su nombre ──────────────────────────
  memoria_socio: { accion: 'BORRAR', detalle: 'Memoria del Decision OS sobre ella.' },
  recomendaciones: {
    accion: 'BORRAR',
    detalle: 'Recomendaciones sobre ella (titulo/motivo/datos_usados con su nombre). `recomendacion_outcomes` cae en cascada.',
  },
  decision_mensajes_dia: {
    accion: 'ANONIMIZAR',
    detalle: '`motivo_motor` a NULL en los mensajes del día que apuntaban a una recomendación suya. La fila se queda: garantiza «un mensaje al día».',
  },
  actividad_reciente: { accion: 'BORRAR', detalle: 'Feed del panel (texto con su nombre).' },
  comunicaciones_socio: { accion: 'BORRAR', detalle: 'Registro de correos enviados (asunto).' },
  automation_logs: {
    accion: 'ANONIMIZAR',
    detalle: '`socio_nombre` → «Socia eliminada», `mensaje_cliente` y `detalle` a NULL. La fila queda para las métricas de la automatización.',
  },
  notification: {
    accion: 'BORRAR',
    detalle: 'Las suyas (`recipient_socio_id`, o su cuenta como SOCIA) y las del staff que la nombran (`data.socioId` / `data.socioIds`). `notification_delivery` en cascada.',
  },
  tareas: { accion: 'BORRAR', detalle: 'Tareas del staff sobre ella (título con su nombre).' },
  intentos_reserva_fallidos: { accion: 'BORRAR', detalle: 'Log de intentos.' },
  recordatorio_envios: { accion: 'BORRAR', detalle: 'Deduplicación de recordatorios.' },
  favoritos_clase: { accion: 'BORRAR', detalle: 'Favoritos.' },
  avisos_hueco: { accion: 'BORRAR', detalle: 'Avisos de hueco enviados.' },
  widget_eventos: { accion: 'ANONIMIZAR', detalle: '`socio_id` a NULL: el evento cuenta para la analítica del widget sin apuntar a nadie.' },
  instructor_dependency_snapshots: {
    accion: 'ANONIMIZAR',
    detalle: 'En `detalle` (jsonb [{socioId, nombre, …}]) su elemento pasa a nombre «Socia eliminada».',
  },
  instructor_bajas_seguimiento: {
    accion: 'ANONIMIZAR',
    detalle: 'En `alumnas_cautivas` (misma forma que el detalle anterior) su elemento pasa a nombre «Socia eliminada».',
  },

  // ── Mensajería y comunidad ─────────────────────────────────────────────────
  conversaciones: {
    accion: 'BORRAR',
    detalle: 'Las ALUMNA_* en las que ella es la ÚNICA socia: toda la conversación trata de ella. `mensajes` y participantes en cascada.',
  },
  mensajes: {
    accion: 'ANONIMIZAR',
    detalle: 'Los que ella envió en conversaciones que se quedan (con otras socias): `cuerpo` → «[mensaje eliminado]».',
  },
  conversacion_participantes: { accion: 'BORRAR', detalle: 'Su participación.' },
  posts_comunidad: { accion: 'BORRAR', detalle: 'Publicaciones suyas (`autor_id` = su cuenta o su ficha). Comentarios/likes/asistentes del post en cascada.' },
  comentarios_comunidad: { accion: 'BORRAR', detalle: 'Comentarios suyos (`autor_id`).' },
  post_likes: { accion: 'BORRAR', detalle: 'Sus «me gusta» (`user_id` en este estudio).' },
  post_evento_asistentes: { accion: 'BORRAR', detalle: 'Su asistencia a eventos.' },

  // ── Gamificación ───────────────────────────────────────────────────────────
  member_credits: { accion: 'BORRAR', detalle: 'Saldo de créditos.' },
  credit_transactions: { accion: 'BORRAR', detalle: 'Movimientos de créditos (no es dinero).' },
  reward_actions: { accion: 'BORRAR', detalle: 'Acciones premiadas.' },
  reward_history: { accion: 'BORRAR', detalle: 'Historial de premios.' },
  reward_redemptions: { accion: 'BORRAR', detalle: 'Canjes (código incluido).' },
  achievement_progress: { accion: 'BORRAR', detalle: 'Progreso de logros.' },
  achievement_history: { accion: 'BORRAR', detalle: 'Logros conseguidos.' },
  challenge_progress: { accion: 'BORRAR', detalle: 'Progreso de retos.' },
  challenge_history: { accion: 'BORRAR', detalle: 'Retos conseguidos.' },
  reto_participaciones: { accion: 'BORRAR', detalle: 'Participación en retos.' },
  socio_companeras: { accion: 'BORRAR', detalle: 'Relaciones con otras socias (solicitante, destinataria o bloqueo).' },

  // ── Operativa ──────────────────────────────────────────────────────────────
  plazas_fijas: { accion: 'BORRAR', detalle: 'Plaza fija: si no, el cron la seguiría materializando.' },
  recuperaciones: { accion: 'BORRAR', detalle: 'Recuperaciones pendientes.' },
  socio_excepciones: { accion: 'BORRAR', detalle: 'Excepciones de reglas (motivo en texto libre).' },
  socio_tipos_clase_autorizados: { accion: 'BORRAR', detalle: 'Autorizaciones por tipo de clase.' },
  citas: {
    accion: 'ANONIMIZAR',
    detalle: '`notas` a NULL; las futuras sin cerrar pasan a CANCELADA. La fila queda (precio/pagada).',
  },
  valoraciones: { accion: 'ANONIMIZAR', detalle: '`comentario` a NULL. La puntuación queda seudónima para la media de la instructora.' },
  reservas: {
    accion: 'CONSERVAR',
    detalle: 'Seudónima por socio_id (asistencia y métricas). Las futuras las cancela la ruta ANTES, con el núcleo que promociona la lista de espera.',
  },
  suscripciones: { accion: 'CONSERVAR', detalle: 'Seudónima y pasada a CANCELADA: los recibos fiscales la referencian.' },

  // ── Dinero ─────────────────────────────────────────────────────────────────
  penalizaciones: {
    accion: 'BORRAR',
    detalle: 'Las SIN recibo (detectada, omitida, pendiente de aprobación): no ha pasado dinero y no debe llegar a cobrarse. Las que ya tienen recibo se CONSERVAN (importe fiscal).',
  },
  mandatos_sepa: {
    accion: 'BORRAR',
    detalle: 'IBAN. Se borra salvo que haya un recibo SEPA PENDIENTE/EN_CURSO: ese cargo puede devolverse y el mandato es la prueba. Entonces se conserva y la función lo devuelve como retenido.',
  },
  recibos: { accion: 'CONSERVAR', detalle: 'Fiscal. Seudónimo por socio_id.' },
  facturas: { accion: 'CONSERVAR', detalle: 'Fiscal (Veri*Factu). `receptor_nombre`/`receptor_nif` se conservan por obligación legal.' },
  ventas_pos: { accion: 'CONSERVAR', detalle: 'Fiscal.' },
  devoluciones: { accion: 'CONSERVAR', detalle: 'Fiscal.' },
  pagos_historicos: { accion: 'CONSERVAR', detalle: 'Fiscal (histórico importado).' },
  codigos_descuento_consumos: { accion: 'CONSERVAR', detalle: 'Ligado a un recibo fiscal. Seudónimo.' },

  // ── Cuenta, contacto y huellas globales ────────────────────────────────────
  socios: {
    accion: 'ANONIMIZAR',
    detalle: 'Identidad, contacto, firma, tarjeta, SEPA, Stripe, campos extra, usuario, lead/referido, textos y firmantes de consentimiento (se quedan solo las fechas como prueba) y `visible_en_clase`. Marca `borrado_en`.',
  },
  email_rebotes: { accion: 'BORRAR', detalle: 'Por email, solo si ninguna otra socia activa, instructora o estudio usa ese email (la tabla es global).' },
  rate_limits: { accion: 'BORRAR', detalle: 'Clave `otp-verify-email:<email>`. Las claves por IP no se pueden atribuir.' },
  push_subscription: { accion: 'BORRAR', detalle: 'De su cuenta en este estudio, salvo que esa cuenta sea también staff del estudio.' },
  notification_preference: { accion: 'BORRAR', detalle: 'Ídem.' },

  // ── Se conservan a propósito ───────────────────────────────────────────────
  lecturas_ficha_salud: {
    accion: 'CONSERVAR',
    detalle: '⚠️ REVISIÓN LEGAL: registro de QUIÉN del estudio leyó su ficha clínica. Es trazabilidad del acceso del staff; falta fijar su plazo de conservación.',
  },
  supresiones: { accion: 'CONSERVAR', detalle: 'El propio registro de supresiones: sin él una restauración no podría volver a aplicarlas.' },
};

/**
 * Columnas que, en `lib/db-types.ts`, apuntan a una socia. Una tabla que tenga
 * cualquiera de ellas TIENE que estar en `CLASIFICACION_SUPRESION`.
 * `autor_id` entra porque en comunidad guarda la cuenta de quien escribe, que
 * puede ser una socia.
 */
export const COLUMNAS_QUE_APUNTAN_A_SOCIA = [
  'socio_id', 'recipient_socio_id', 'solicitante_id', 'destinataria_id', 'bloqueada_por', 'autor_id',
] as const;

export function tablasPorAccion(accion: AccionSupresion): string[] {
  return Object.entries(CLASIFICACION_SUPRESION)
    .filter(([, c]) => c.accion === accion)
    .map(([t]) => t)
    .sort();
}
