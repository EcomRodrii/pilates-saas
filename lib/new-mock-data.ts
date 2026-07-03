import type {
  Cita, ProductoPOS, VentaPOS, Campana, Automatizacion,
  CodigoDescuento, ActividadReciente, Notificacion, VideoOnDemand, PostComunidad
} from './types';

export const citas: Cita[] = [
  { id: 'cita-1', studioId: 'studio-1', socioId: 'soc-1', instructorId: 'ins-1', tipo: 'PRIVADA', inicio: '2026-06-28T10:00:00Z', fin: '2026-06-28T11:00:00Z', notas: 'Enfocada en lumbar', estado: 'CONFIRMADA', precio: 60, creadoEn: '2026-06-20T09:00:00Z' },
  { id: 'cita-2', studioId: 'studio-1', socioId: 'soc-2', instructorId: 'ins-2', tipo: 'EVALUACION', inicio: '2026-06-29T11:00:00Z', fin: '2026-06-29T12:00:00Z', notas: null, estado: 'PENDIENTE', precio: 45, creadoEn: '2026-06-21T10:00:00Z' },
  { id: 'cita-3', studioId: 'studio-1', socioId: 'soc-4', instructorId: 'ins-1', tipo: 'PRIVADA', inicio: '2026-06-30T09:00:00Z', fin: '2026-06-30T10:00:00Z', notas: 'Rehabilitación rodilla', estado: 'CONFIRMADA', precio: 60, creadoEn: '2026-06-22T08:00:00Z' },
  { id: 'cita-4', studioId: 'studio-1', socioId: 'soc-3', instructorId: 'ins-2', tipo: 'ONLINE', inicio: '2026-07-01T18:00:00Z', fin: '2026-07-01T19:00:00Z', notas: null, estado: 'PENDIENTE', precio: 40, creadoEn: '2026-06-23T11:00:00Z' },
  { id: 'cita-5', studioId: 'studio-1', socioId: 'soc-5', instructorId: 'ins-1', tipo: 'PRIVADA', inicio: '2026-06-25T10:00:00Z', fin: '2026-06-25T11:00:00Z', notas: null, estado: 'COMPLETADA', precio: 60, creadoEn: '2026-06-18T09:00:00Z' },
  { id: 'cita-6', studioId: 'studio-1', socioId: 'soc-7', instructorId: 'ins-1', tipo: 'FISIOTERAPIA', inicio: '2026-07-03T10:00:00Z', fin: '2026-07-03T11:30:00Z', notas: 'Primera sesión fisio', estado: 'PENDIENTE', precio: 75, creadoEn: '2026-06-24T09:00:00Z' },
  { id: 'cita-7', studioId: 'studio-1', socioId: 'soc-8', instructorId: 'ins-2', tipo: 'EVALUACION', inicio: '2026-06-20T09:00:00Z', fin: '2026-06-20T10:00:00Z', notas: null, estado: 'COMPLETADA', precio: 45, creadoEn: '2026-06-15T09:00:00Z' },
  { id: 'cita-8', studioId: 'studio-1', socioId: 'soc-6', instructorId: 'ins-1', tipo: 'PRIVADA', inicio: '2026-06-15T11:00:00Z', fin: '2026-06-15T12:00:00Z', notas: null, estado: 'CANCELADA', precio: 60, creadoEn: '2026-06-10T09:00:00Z' },
];

export const productosPOS: ProductoPOS[] = [
  { id: 'prod-1', studioId: 'studio-1', nombre: 'Clase suelta Reformer', categoria: 'SESION', precio: 22, activo: true },
  { id: 'prod-2', studioId: 'studio-1', nombre: 'Clase suelta Mat', categoria: 'SESION', precio: 15, activo: true },
  { id: 'prod-3', studioId: 'studio-1', nombre: 'Bono 5 clases Reformer', categoria: 'PACK', precio: 95, activo: true },
  { id: 'prod-4', studioId: 'studio-1', nombre: 'Bono 10 clases Reformer', categoria: 'PACK', precio: 175, activo: true },
  { id: 'prod-5', studioId: 'studio-1', nombre: 'Mensual ilimitado', categoria: 'PACK', precio: 85, activo: true },
  { id: 'prod-6', studioId: 'studio-1', nombre: 'Calcetines antideslizantes', categoria: 'PRODUCTO', precio: 12, activo: true },
  { id: 'prod-7', studioId: 'studio-1', nombre: 'Botella de agua studio', categoria: 'PRODUCTO', precio: 8, activo: true },
  { id: 'prod-8', studioId: 'studio-1', nombre: 'Cita privada 1h', categoria: 'SESION', precio: 60, activo: true },
  { id: 'prod-9', studioId: 'studio-1', nombre: 'Evaluación inicial', categoria: 'SESION', precio: 45, activo: true },
  { id: 'prod-10', studioId: 'studio-1', nombre: 'Toalla studio', categoria: 'PRODUCTO', precio: 5, activo: true },
];

export const ventasPOS: VentaPOS[] = [
  { id: 'vpos-1', studioId: 'studio-1', socioId: 'soc-1', items: [{ productoId: 'prod-5', nombre: 'Mensual ilimitado', precio: 85, cantidad: 1 }], subtotal: 85, descuento: 0, total: 85, metodoPago: 'TARJETA', notas: null, realizadaEn: '2026-06-28T09:30:00Z' },
  { id: 'vpos-2', studioId: 'studio-1', socioId: 'soc-3', items: [{ productoId: 'prod-3', nombre: 'Bono 5 clases Reformer', precio: 95, cantidad: 1 }, { productoId: 'prod-6', nombre: 'Calcetines', precio: 12, cantidad: 1 }], subtotal: 107, descuento: 0, total: 107, metodoPago: 'EFECTIVO', notas: null, realizadaEn: '2026-06-27T11:15:00Z' },
  { id: 'vpos-3', studioId: 'studio-1', socioId: null, items: [{ productoId: 'prod-1', nombre: 'Clase suelta Reformer', precio: 22, cantidad: 1 }], subtotal: 22, descuento: 0, total: 22, metodoPago: 'BIZUM', notas: 'Cliente nuevo', realizadaEn: '2026-06-27T10:00:00Z' },
  { id: 'vpos-4', studioId: 'studio-1', socioId: 'soc-7', items: [{ productoId: 'prod-4', nombre: 'Bono 10 clases Reformer', precio: 175, cantidad: 1 }], subtotal: 175, descuento: 17.5, total: 157.5, metodoPago: 'TRANSFERENCIA', notas: '10% descuento fidelidad', realizadaEn: '2026-06-26T16:00:00Z' },
  { id: 'vpos-5', studioId: 'studio-1', socioId: 'soc-2', items: [{ productoId: 'prod-7', nombre: 'Botella studio', precio: 8, cantidad: 2 }, { productoId: 'prod-10', nombre: 'Toalla studio', precio: 5, cantidad: 1 }], subtotal: 21, descuento: 0, total: 21, metodoPago: 'EFECTIVO', notas: null, realizadaEn: '2026-06-25T09:45:00Z' },
];

export const campanas: Campana[] = [
  { id: 'camp-1', studioId: 'studio-1', nombre: 'Promo julio — Bono verano', tipo: 'EMAIL', asunto: '☀️ Aprovecha nuestro bono especial de verano', contenido: 'Este julio te ofrecemos un bono de 10 clases con un 15% de descuento. ¡Solo hasta el 31 de julio!', estado: 'BORRADOR', destinatarios: 'ACTIVAS', enviados: 0, abiertos: 0, clics: 0, creadaEn: '2026-06-25T10:00:00Z', enviadaEn: null, programadaEn: '2026-07-01T09:00:00Z' },
  { id: 'camp-2', studioId: 'studio-1', nombre: 'Newsletter junio', tipo: 'EMAIL', asunto: 'Novedades de junio en Tentare', contenido: 'Este mes hemos añadido nuevas clases de Barre y ampliado el horario de Reformer avanzado.', estado: 'ENVIADA', destinatarios: 'TODAS', enviados: 8, abiertos: 6, clics: 3, creadaEn: '2026-06-01T09:00:00Z', enviadaEn: '2026-06-05T10:00:00Z', programadaEn: null },
  { id: 'camp-3', studioId: 'studio-1', nombre: 'Recuperación clientas inactivas', tipo: 'EMAIL', asunto: 'Te echamos de menos 💙', contenido: '¡Hola! Hemos notado que llevas tiempo sin venir. Te regalamos una clase de prueba gratuita para que vuelvas a empezar.', estado: 'ENVIADA', destinatarios: 'INACTIVAS', enviados: 1, abiertos: 1, clics: 1, creadaEn: '2026-05-15T10:00:00Z', enviadaEn: '2026-05-20T10:00:00Z', programadaEn: null },
  { id: 'camp-4', studioId: 'studio-1', nombre: 'WhatsApp bienvenida', tipo: 'WHATSAPP', asunto: 'Bienvenida al estudio', contenido: 'Hola {nombre} 👋 Bienvenida a Tentare. Tu primera clase es el {fecha}. Cualquier duda, estamos aquí.', estado: 'ACTIVA', destinatarios: 'TODAS', enviados: 8, abiertos: 8, clics: 0, creadaEn: '2026-01-01T10:00:00Z', enviadaEn: null, programadaEn: null },
];

export const automatizaciones: Automatizacion[] = [
  { id: 'auto-1', studioId: 'studio-1', nombre: 'Recordatorio renovación', trigger: 'SUSCRIPCION_EXPIRA_7D', accion: 'EMAIL', asunto: 'Tu suscripción caduca en 7 días', mensaje: 'Hola {nombre}, tu suscripción a {plan} caduca el {fecha}. Renuévala ahora para no perder tu plaza.', activa: true, ejecutadas: 12, creadaEn: '2026-01-10T09:00:00Z' },
  { id: 'auto-2', studioId: 'studio-1', nombre: 'Último aviso renovación', trigger: 'SUSCRIPCION_EXPIRA_1D', accion: 'WHATSAPP', asunto: 'Tu suscripción caduca mañana', mensaje: 'Hola {nombre} ⚠️ Tu suscripción caduca mañana. Renuévala en el estudio o responde a este mensaje.', activa: true, ejecutadas: 8, creadaEn: '2026-01-10T09:00:00Z' },
  { id: 'auto-3', studioId: 'studio-1', nombre: 'Feliz cumpleaños', trigger: 'CUMPLEANOS', accion: 'EMAIL', asunto: '🎂 Feliz cumpleaños, {nombre}!', mensaje: 'Muchas felicidades! Como regalo, te regalamos una clase gratis este mes. ¡Úsala cuando quieras!', activa: true, ejecutadas: 5, creadaEn: '2026-01-15T09:00:00Z' },
  { id: 'auto-4', studioId: 'studio-1', nombre: 'Bienvenida nueva socia', trigger: 'NUEVA_ALTA', accion: 'EMAIL', asunto: 'Bienvenida a Tentare 🎉', mensaje: 'Hola {nombre}, ¡bienvenida! Estamos muy contentas de tenerte con nosotras. Tu primera clase está confirmada para {fecha}.', activa: true, ejecutadas: 8, creadaEn: '2026-01-20T09:00:00Z' },
  { id: 'auto-5', studioId: 'studio-1', nombre: 'Inactividad 30 días', trigger: 'INACTIVIDAD_30D', accion: 'WHATSAPP', asunto: 'Te echamos de menos', mensaje: '¡Hola {nombre}! Llevamos 30 días sin verte por el estudio. ¿Todo bien? Te esperamos 💙', activa: false, ejecutadas: 3, creadaEn: '2026-02-01T09:00:00Z' },
  { id: 'auto-6', studioId: 'studio-1', nombre: 'Bono agotado', trigger: 'BONO_AGOTADO', accion: 'EMAIL', asunto: 'Has agotado tu bono de clases', mensaje: 'Hola {nombre}, has usado todas tus clases del bono. Renueva ahora con un 5% de descuento por ser clienta habitual.', activa: true, ejecutadas: 4, creadaEn: '2026-02-10T09:00:00Z' },
  { id: 'auto-7', studioId: 'studio-1', nombre: 'Queda 1 sesión en bono', trigger: 'BONO_QUEDA_1', accion: 'WHATSAPP', asunto: 'Te queda 1 clase en tu bono', mensaje: 'Hola {nombre} 👋 Solo te queda 1 clase en tu bono. ¿Reservamos el siguiente?', activa: true, ejecutadas: 6, creadaEn: '2026-02-10T09:00:00Z' },
];

export const codigosDescuento: CodigoDescuento[] = [
  { id: 'disc-1', studioId: 'studio-1', codigo: 'BIENVENIDA20', descripcion: 'Descuento bienvenida nuevas socias', tipo: 'PORCENTAJE', valor: 20, usos: 3, usosMax: 50, expira: '2026-12-31T23:59:59Z', activo: true, creadoEn: '2026-01-01T00:00:00Z' },
  { id: 'disc-2', studioId: 'studio-1', codigo: 'VERANO15', descripcion: 'Promo verano 2026', tipo: 'PORCENTAJE', valor: 15, usos: 1, usosMax: 30, expira: '2026-08-31T23:59:59Z', activo: true, creadoEn: '2026-06-01T00:00:00Z' },
  { id: 'disc-3', studioId: 'studio-1', codigo: 'AMIGA10', descripcion: '10€ por referir a una amiga', tipo: 'IMPORTE_FIJO', valor: 10, usos: 5, usosMax: null, expira: null, activo: true, creadoEn: '2026-03-01T00:00:00Z' },
  { id: 'disc-4', studioId: 'studio-1', codigo: 'PRIMAVERA', descripcion: 'Descuento primavera (expirado)', tipo: 'PORCENTAJE', valor: 10, usos: 8, usosMax: 20, expira: '2026-05-31T23:59:59Z', activo: false, creadoEn: '2026-04-01T00:00:00Z' },
];

export const actividadReciente: ActividadReciente[] = [
  { id: 'act-1', studioId: 'studio-1', tipo: 'PAGO_COBRADO', texto: 'Laura Martínez pagó Mensual Ilimitado — 85 €', socioId: 'soc-1', enlace: '/socios/soc-1', creadoEn: '2026-06-28T09:30:00Z' },
  { id: 'act-2', studioId: 'studio-1', tipo: 'NUEVA_RESERVA', texto: 'Carmen López reservó Reformer Avanzado (lun 10:00)', socioId: 'soc-2', enlace: '/calendario', creadoEn: '2026-06-28T08:45:00Z' },
  { id: 'act-3', studioId: 'studio-1', tipo: 'CITA_CREADA', texto: 'Nueva cita privada — Laura Martínez con María Soler', socioId: 'soc-1', enlace: '/citas', creadoEn: '2026-06-28T08:00:00Z' },
  { id: 'act-4', studioId: 'studio-1', tipo: 'VENTA_POS', texto: 'Venta POS — Bono 5 clases + Calcetines — 107 €', socioId: 'soc-3', enlace: '/pos', creadoEn: '2026-06-27T11:15:00Z' },
  { id: 'act-5', studioId: 'studio-1', tipo: 'CANCELACION', texto: 'Isabel González canceló su reserva en Mat Beginners', socioId: 'soc-4', enlace: '/calendario', creadoEn: '2026-06-27T10:30:00Z' },
  { id: 'act-6', studioId: 'studio-1', tipo: 'NUEVA_SOCIA', texto: 'Nueva socia registrada: Patricia Romero', socioId: 'soc-8', enlace: '/socios/soc-8', creadoEn: '2026-06-26T16:00:00Z' },
  { id: 'act-7', studioId: 'studio-1', tipo: 'PAGO_COBRADO', texto: 'Elena Jiménez pagó Bono 4 clases — 65 €', socioId: 'soc-7', enlace: '/socios/soc-7', creadoEn: '2026-06-26T11:00:00Z' },
  { id: 'act-8', studioId: 'studio-1', tipo: 'NUEVA_SUSCRIPCION', texto: 'Marta Sánchez renovó Mensual Ilimitado', socioId: 'soc-5', enlace: '/socios/soc-5', creadoEn: '2026-06-25T09:00:00Z' },
  { id: 'act-9', studioId: 'studio-1', tipo: 'CITA_COMPLETADA', texto: 'Cita privada completada — Marta Sánchez', socioId: 'soc-5', enlace: '/citas', creadoEn: '2026-06-25T11:00:00Z' },
  { id: 'act-10', studioId: 'studio-1', tipo: 'PAGO_PENDIENTE', texto: 'Pago pendiente — Carmen López — Bono 8 clases', socioId: 'soc-2', enlace: '/pagos', creadoEn: '2026-06-24T10:00:00Z' },
];

export const notificaciones: Notificacion[] = [
  { id: 'noti-1', studioId: 'studio-1', titulo: 'Suscripción por vencer', texto: 'La suscripción de Carmen López vence en 3 días.', leida: false, tipo: 'AVISO', enlace: '/socios/soc-2', creadaEn: '2026-06-28T08:00:00Z' },
  { id: 'noti-2', studioId: 'studio-1', titulo: 'Pago pendiente', texto: 'Isabel González tiene un pago de 65 € pendiente desde hace 5 días.', leida: false, tipo: 'AVISO', enlace: '/pagos', creadaEn: '2026-06-27T09:00:00Z' },
  { id: 'noti-3', studioId: 'studio-1', titulo: 'Nueva reserva', texto: 'Patricia Romero ha reservado Reformer Principiante para el martes.', leida: true, tipo: 'INFO', enlace: '/calendario', creadaEn: '2026-06-27T08:30:00Z' },
  { id: 'noti-4', studioId: 'studio-1', titulo: 'Clase con aforo lleno', texto: 'Reformer Avanzado del lunes 10:00 está completo. 2 en lista de espera.', leida: false, tipo: 'INFO', enlace: '/calendario', creadaEn: '2026-06-26T18:00:00Z' },
  { id: 'noti-5', studioId: 'studio-1', titulo: 'Automatización ejecutada', texto: 'Se enviaron 3 recordatorios de renovación automáticamente.', leida: true, tipo: 'EXITO', enlace: '/marketing', creadaEn: '2026-06-25T10:00:00Z' },
  { id: 'noti-6', studioId: 'studio-1', titulo: 'Socia sin plan asignado', texto: 'Sofía Ramírez lleva 15 días sin suscripción activa.', leida: false, tipo: 'AVISO', enlace: '/socios/soc-6', creadaEn: '2026-06-24T09:00:00Z' },
];

export const videosOnDemand: VideoOnDemand[] = [
  { id: 'vid-1', studioId: 'studio-1', titulo: 'Reformer para principiantes — Sesión 1', descripcion: 'Introducción a las posiciones básicas del Reformer. Ideal para quienes empiezan.', categoria: 'REFORMER', duracionMinutos: 45, nivel: 'PRINCIPIANTE', instructorId: 'ins-1', vistas: 127, likes: 34, activo: true, creadoEn: '2026-04-01T10:00:00Z' },
  { id: 'vid-2', studioId: 'studio-1', titulo: 'Core Power — Mat intensivo', descripcion: 'Sesión intensa de trabajo de core sobre esterilla. Sin equipo necesario.', categoria: 'MAT', duracionMinutos: 30, nivel: 'MEDIO', instructorId: 'ins-2', vistas: 89, likes: 21, activo: true, creadoEn: '2026-04-15T10:00:00Z' },
  { id: 'vid-3', studioId: 'studio-1', titulo: 'Barre Clásico — Lower Body', descripcion: 'Trabajo de piernas y glúteos con técnica Barre. Cardio de bajo impacto.', categoria: 'BARRE', duracionMinutos: 40, nivel: 'TODOS', instructorId: 'ins-1', vistas: 73, likes: 18, activo: true, creadoEn: '2026-05-01T10:00:00Z' },
  { id: 'vid-4', studioId: 'studio-1', titulo: 'Meditación y respiración consciente', descripcion: '20 minutos de meditación guiada para reducir el estrés y mejorar la concentración.', categoria: 'MEDITACION', duracionMinutos: 20, nivel: 'TODOS', instructorId: 'ins-2', vistas: 156, likes: 52, activo: true, creadoEn: '2026-05-10T10:00:00Z' },
  { id: 'vid-5', studioId: 'studio-1', titulo: 'Reformer Avanzado — Full Body', descripcion: 'Sesión avanzada que trabaja todo el cuerpo en el Reformer. Requiere experiencia previa.', categoria: 'REFORMER', duracionMinutos: 55, nivel: 'AVANZADO', instructorId: 'ins-1', vistas: 44, likes: 12, activo: true, creadoEn: '2026-05-20T10:00:00Z' },
  { id: 'vid-6', studioId: 'studio-1', titulo: 'Estiramiento post-clase completo', descripcion: 'Rutina de 15 minutos de estiramientos para hacer después de cualquier clase.', categoria: 'ESTIRAMIENTO', duracionMinutos: 15, nivel: 'TODOS', instructorId: 'ins-2', vistas: 201, likes: 67, activo: true, creadoEn: '2026-06-01T10:00:00Z' },
];

export const postsComunidad: PostComunidad[] = [
  { id: 'post-1', studioId: 'studio-1', autorId: null, autorNombre: 'Tentare', autorInicial: 'TE', texto: '🌟 ¡Felicidades a todas las socias que completaron el reto de junio! 30 días, 30 clases. Vuestra constancia es inspiradora. Resultado final: 6 socias lo completaron. ¡Enhorabuena!', likes: 12, comentariosCount: 4, fijado: true, creadoEn: '2026-06-27T10:00:00Z' },
  { id: 'post-2', studioId: 'studio-1', autorId: 'soc-1', autorNombre: 'Laura M.', autorInicial: 'LM', texto: 'Llevo 3 meses viniendo y noto un cambio brutal en mi postura. Nunca pensé que el pilates fuera tan efectivo. ¡Gracias María! 💙', likes: 8, comentariosCount: 2, fijado: false, creadoEn: '2026-06-25T14:30:00Z' },
  { id: 'post-3', studioId: 'studio-1', autorId: null, autorNombre: 'Tentare', autorInicial: 'TE', texto: '📢 Novedad: a partir de julio añadimos una clase de Barre los miércoles a las 19:00. ¡Plazas limitadas! Reservad ya desde el calendario.', likes: 15, comentariosCount: 6, fijado: false, creadoEn: '2026-06-23T09:00:00Z' },
  { id: 'post-4', studioId: 'studio-1', autorId: 'soc-5', autorNombre: 'Marta S.', autorInicial: 'MS', texto: '¿Alguien más ha probado la clase de Mat Avanzado del viernes? Es durísima pero merece mucho la pena 😅', likes: 5, comentariosCount: 3, fijado: false, creadoEn: '2026-06-22T11:00:00Z' },
];
