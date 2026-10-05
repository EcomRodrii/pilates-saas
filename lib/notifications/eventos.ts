// ─────────────────────────────────────────────────────────────────────────────
// Los tipos de evento del Notification Engine, solos.
//
// Viven aparte del catálogo (./catalog.ts, que los reexporta) para que quien
// solo necesita comparar un `event_type` —la campana del panel, que va en
// todas sus pantallas— no descargue también reglas y plantillas.
// ─────────────────────────────────────────────────────────────────────────────

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
  // Plaza fija desde la app (migr 20260915231920): la alumna PIDE y el estudio
  // decide. La petición avisa al mostrador —también la vuelta de una pausa que no
  // pudo volver sola— y la respuesta, a la alumna.
  PLAZA_FIJA_PETICION: 'plaza_fija.peticion',
  PLAZA_FIJA_RESPUESTA: 'plaza_fija.respuesta',
  // Clases fijas del estudio (Fase 2): a la alumna le quedan pocos días de una
  // clase fija (`DIAS_AVISO_CLASE_FIJA_TERMINA`) — el cron diario avisa para
  // que pueda ampliarla antes de que venza, en vez de perder el sitio sin saberlo.
  CLASE_FIJA_TERMINA_PRONTO: 'clase_fija.termina_pronto',
  // I-3 (auditoría 19-ago): checkout embebido — el pago se confirmó y el
  // plan ya se entregó, pero la clase concreta que la socia intentaba
  // reservar no se pudo confirmar (aforo lleno/cancelada entre crear el
  // PaymentIntent y que Stripe confirmara el pago). La UI del widget ya
  // había dado la reserva por hecha (handlePagoExitoso, optimista, sin
  // volver a preguntar al servidor), así que sin este aviso nadie del
  // estudio se entera y la socia se queda creyendo que tiene plaza.
  // Distinto de RESERVA_PENDIENTE_APROBACION (aquí no hay nada que aprobar,
  // hay que resolver el error a mano: ofrecer otra clase o compensar).
  RESERVA_PAGADA_SIN_PLAZA: 'reserva.pagada_sin_plaza',
  CLASE_CANCELADA: 'clase.cancelada',
  CLASE_MODIFICADA: 'clase.modificada',
  // Cubrir NO es mover: la clase se queda donde está y solo cambia quién la da.
  // Con `clase.modificada` el aviso decía "tu clase pasa a: <la misma hora>", que
  // se lee como un cambio de horario y hace que la alumna se replantee si va.
  CLASE_SUSTITUTA: 'clase.sustituta',
  SUSTITUCION_ACEPTADA: 'sustitucion.aceptada',
  SUSTITUCION_RECHAZADA: 'sustitucion.rechazada',
  // Cierre del bucle para la propietaria: Tentare encontró quién cubre la clase.
  // Evento propio y no otra audiencia de SUSTITUCION_ACEPTADA, porque a la
  // sustituta y a la dueña se les cuenta un hecho distinto («tienes una clase
  // nueva» / «ya está resuelto, no tienes que hacer nada»).
  SUSTITUCION_CUBIERTA: 'sustitucion.cubierta',
  // El motor le pregunta a una candidata si cubre la clase. El email con su
  // enlace sigue saliendo igual; esto lleva la pregunta a la app del estudio.
  SUSTITUCION_OFRECIDA: 'sustitucion.ofrecida',
  // El estudio ha revisado una baja de última hora de la instructora («Todo en
  // orden» / «Lo hablamos»). Cierra el aviso de `instructora.baja`. El push NO
  // dice qué se decidió: el resultado y la nota se leen dentro de la app.
  BAJA_REVISADA: 'baja.revisada',
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
  // Su renovación no se ha podido cobrar sola: no tiene tarjeta ni SEPA guardados
  // (lib/billing/renovacion-sin-tarjeta.ts). Antes el recibo se quedaba pendiente
  // sin avisar a nadie. Al estudio no le llega como aviso: lo ve en su bandeja.
  RENOVACION_SIN_TARJETA: 'renovacion.sin_tarjeta',
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
  // D-8: la devolución FALLÓ días después de crearse (SEPA sobre todo) — la
  // clienta NO ha recibido el dinero aunque el panel dijera "devuelto".
  // Evento propio por las mismas dos razones mecánicas de siempre: reusar
  // PAGO_DEVUELTO se tragaría el aviso (su dedupKey es por devolucionId, ya
  // gastado) y su copy/prioridad dicen lo contrario de la verdad aquí.
  PAGO_DEVOLUCION_FALLIDA: 'pago.devolucion_fallida',
  // P-2 (17ª auditoría): reembolso de un cobro de POS (datáfono/Bizum
  // presencial). Evento propio, no una variante de PAGO_DEVUELTO: esa copy
  // habla de "retirarle lo que pagó" (entrega/bono a revertir), que no
  // aplica a una venta al contado, y su dedupKey/deepLink están atados a
  // `devoluciones`/`recibos`, tablas que una venta POS no tiene.
  VENTA_POS_DEVUELTA: 'venta_pos.devuelta',
  SISTEMA_ERROR: 'sistema.error',
  // Automatizaciones (cron → publish)
  RECORDATORIO_24H: 'reserva.recordatorio_24h',
  RECORDATORIO_1H: 'reserva.recordatorio_1h',
  BONO_POR_CADUCAR: 'bono.por_caducar',
  BONO_AGOTADO: 'bono.agotado',
  // PAY-6 (auditoría 2026-09-16, decisión del fundador): si el estudio sube el
  // precio de un plan MENSUAL, la renovación automática cobra el precio nuevo
  // — pero la socia se entera ANTES, no el día del cargo. `dedupKey` por
  // (suscripción, fecha_fin): una sola vez por ciclo, aunque el cron la
  // revise varios días dentro de la ventana de aviso.
  SUSCRIPCION_PRECIO_SUBE: 'suscripcion.precio_sube',
  // Una socia ha gastado sus créditos en una recompensa del catálogo. El
  // portal le dice «El estudio te avisará» — y hasta ahora al estudio no se le
  // avisaba: el canje quedaba en PENDIENTE en una tabla que ninguna pantalla
  // leía. Va al MOSTRADOR porque quien entrega la recompensa está allí.
  CANJE_SOLICITADO: 'canje.solicitado',
  // El barrido de los lunes reparte las recuperaciones de la semana que acaba
  // de cerrar (`lib/recuperaciones/otorgar-semanales.ts`). Nacían en SILENCIO:
  // la socia solo se enteraba si abría la app y comparaba el número con el que
  // recordaba. Una clase que caduca y nadie te dijo que tenías es peor que no
  // habértela dado.
  RECUPERACION_OTORGADA: 'recuperacion.otorgada',
  // Tras ASISTIR: pide valorar la clase desde la app. Lo emite el cron de
  // valoraciones junto al email (misma regla: solo a quien asistió).
  VALORAR_CLASE: 'clase.valorar',
  CLASE_CASI_LLENA: 'clase.casi_llena',
  SOCIA_INACTIVA: 'socia.inactiva',
  // Autoservicio de instructora (migración 20260731100000): se ha creado a sí
  // misma una clase nueva. Informativo, no accionable — sin push/email.
  CLASE_CREADA_POR_INSTRUCTOR: 'clase.creada_por_instructor',
  // Operativos de la dueña (antes escribían a la tabla legacy `notificaciones`)
  SALUD_REVISION: 'salud.revision_pendiente',
  // RGPD: una alumna pide desde su app eliminar sus datos, o limitar/oponerse a
  // su uso. El estudio es el responsable y tiene un plazo legal para responder
  // (tabla `solicitudes_derechos`). Sin ningún dato de salud en el aviso.
  SOLICITUD_DERECHOS: 'socia.solicitud_derechos',
  // Widget «Formulario de contacto»: alguien que aún no es clienta ha escrito
  // desde la web del estudio (tabla `consultas_contacto`, nunca `socios`).
  CONSULTA_CONTACTO: 'contacto.consulta_nueva',
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
  // API pública: un webhook del estudio (su programa de contabilidad) que no
  // consigue entregar, que Tentare ha desactivado, o que vuelve a funcionar
  // (cierra el primero). lib/api-publica/webhooks/salud.ts decide cuál.
  WEBHOOK_FALLANDO: 'sistema.webhook_fallando',
  WEBHOOK_DESACTIVADO: 'sistema.webhook_desactivado',
  WEBHOOK_RECUPERADO: 'sistema.webhook_recuperado',
  // Prueba gratuita de 7 días (lib/billing/trial.ts): antes ni avisaba de que
  // estaba a punto de acabar ni de que ya bloqueó el panel — la dueña entraba
  // un lunes y se encontraba con el estudio cerrado sin ningún aviso previo ni
  // posterior (auditoría 23ª pasada, hallazgo pendiente).
  TRIAL_PROXIMO_A_EXPIRAR: 'sistema.trial_proximo_a_expirar',
  TRIAL_EXPIRADO: 'sistema.trial_expirado',
  // Embudo de alta (Fase 3 del onboarding): un estudio que ya existe pero
  // sigue, 48h después de crearse, sin ninguna clase programada — sin
  // horario no puede haber ni una reserva. Un único aviso por estudio en
  // toda su vida (dedupKey sin fecha, ver emitirEmbudoSinClasesProgramadas).
  EMBUDO_SIN_CLASES_PROGRAMADAS: 'sistema.embudo_sin_clases_programadas',
  // Segundo atasco del mismo embudo: el horario ya está hecho y 72 h después
  // no ha entrado ni una reserva (casi siempre, porque el enlace no ha salido
  // del panel). Un único aviso por estudio (lib/onboarding/embudo-avisos.ts).
  EMBUDO_SIN_PRIMERA_RESERVA: 'sistema.embudo_sin_primera_reserva',
  // Series de clases que se acaban (lib/series/avisos-cron.ts): una clase que se
  // repite y termina sin renovar. Dos niveles (push a 14 días; push + email a 7 y
  // al terminar) y el aviso de las que se renovaron solas.
  SERIES_POR_TERMINAR: 'clases.series_por_terminar',
  SERIES_POR_TERMINAR_URGENTE: 'clases.series_por_terminar_urgente',
  SERIES_RENOVADAS_SOLAS: 'clases.series_renovadas_solas',
  // Opening OS (lib/opening/alertas.ts): el estudio que abre tiene un problema
  // con fecha (sin horario, clases que se llenan, preventa lenta, etapa llena).
  OPENING_ALERTA: 'clases.opening_alerta',
  // Opening Brief (lib/opening/brief.ts): el resumen de la mañana del estudio
  // que abre. Como mucho uno al día y solo si hay algo que contar.
  OPENING_BRIEF: 'clases.opening_brief',
  // «Abrimos mañana» a quien ya tiene cuota de una etapa de lanzamiento. Es
  // información del servicio contratado, no comercial (no pide consentimiento
  // de marketing), y solo sale si la propietaria lo encendió en los ajustes.
  OPENING_ABRIMOS: 'clases.opening_abrimos',
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
  // Community & Messaging OS (P0): mensaje nuevo en una conversación.
  MENSAJE_RECIBIDO: 'mensaje.recibido',
  // Moderación de la app (App Store 1.2, migr 20261005150100): una denuncia o un
  // bloqueo nuevo, a quien la revisa en el estudio; la decisión, a quien
  // denunció; y lo retirado, a quien lo escribió. Nunca llevan el texto.
  DENUNCIA_NUEVA: 'denuncia.nueva',
  DENUNCIA_RESUELTA: 'denuncia.resuelta',
  CONTENIDO_RETIRADO: 'contenido.retirado',
  // Digest de baja frecuencia de mensajes sin leer (cron, nunca uno por
  // mensaje) — ver comentario de la regla más abajo.
  MENSAJE_DIGEST_NO_LEIDO: 'mensaje.digest_no_leido',
  // Community & Messaging OS (P1): post nuevo en el tablón, a la audiencia
  // segmentada del post (ver 'socias-de-lista' arriba). Un evento único para
  // cualquier `audiencia` (incluida 'TODAS') — la propietaria decide con
  // quién compartir el post, no si merece un aviso.
  POST_COMUNIDAD_NUEVO: 'comunidad.post_nuevo',
  // Community & Messaging OS (P2, buzón de documentos): el estudio le sube un
  // documento (plan firmado, factura, contrato, "otro"). Audiencia única
  // dirigida (`data.socioId`), NO una lista — reusa 'socia-del-evento', mismo
  // criterio que RESERVA_CONFIRMADA.
  DOCUMENTO_SOCIO_NUEVO: 'documento_socio.nuevo',
  // 34ª pasada de auditoría: la AEAT ha rechazado una factura Veri*Factu.
  // Antes esto solo quedaba en un Sentry.captureMessage (lo ve Tentare, no
  // la propietaria, que es la obligada tributaria real). Desde sep-2026 un
  // rechazo ya no congela las facturas posteriores (lib/verifactu/
  // politica-cadena.ts): la rechazada se corrige con un registro de
  // subsanación, o con una rectificativa si el motivo lo exige.
  FACTURA_RECHAZADA_AEAT: 'factura.rechazada_aeat',
  // Veri*Factu (envío directo con poder IZ860): el envío de un estudio se ha
  // pausado (la AEAT dice que no hay poder, o un fallo de datos) y el poder
  // que dio en la AEAT está a punto de caducar (máx. 5 años; la prórroga solo
  // se puede hacer en los dos meses previos).
  VERIFACTU_ENVIO_PAUSADO: 'verifactu.envio_pausado',
  VERIFACTU_PODER_CADUCA: 'verifactu.poder_caduca',
} as const;
