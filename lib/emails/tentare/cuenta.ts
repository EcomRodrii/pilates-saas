// Los correos de Tentare sobre la CUENTA del estudio: su suscripción, qué pasa
// con sus datos si no paga, quién entra a su panel y cómo ha ido la semana.
// Aquí solo se decide qué dice cada uno; cómo se ve lo pone `correoTentare`.

import { correoTentare, TENTARE } from './plantilla.ts';

export function correoFalloPagoSaas(p: {
  estudioNombre: string;
  plan: string;
  /** Ya formateado. Ausente = Stripe no ha dado fecha de reintento. */
  proximoIntento?: string | null;
  /** /suscripcion en el despliegue desde el que se manda. */
  urlSuscripcion: string;
}): string {
  return correoTentare({
    preheader: `Problema con el cobro de tu plan ${p.plan}`,
    antetitulo: 'Tu suscripción',
    titular: 'No hemos podido cobrar tu suscripción',
    parrafos: [
      `No hemos podido cobrar la suscripción de ${p.estudioNombre} al plan ${p.plan}. Suele pasar por una tarjeta caducada o sin fondos.`,
    ],
    agenda: p.proximoIntento
      ? { titulo: 'Qué pasa ahora', filas: [
          { cuando: p.proximoIntento, que: 'Stripe lo vuelve a intentar solo.' },
          { cuando: 'Antes de esa fecha', que: 'Actualiza la tarjeta para que no se interrumpa tu cuenta.' },
        ] }
      : null,
    boton: { href: p.urlSuscripcion, texto: 'Actualizar la tarjeta' },
    // ⚠️ La ruta de verdad. Antes decía «Ajustes → Facturación», que no existe.
    nota: 'También desde tu panel: Suscripción → «Facturas, tarjeta y cambio de plan».',
    acento: TENTARE.alerta,
    motivo: `Te escribimos porque eres la propietaria de ${p.estudioNombre} en Tentare.`,
  });
}

export function correoEstudioVencido(p: {
  fase: 'aviso_30' | 'aviso_final';
  estudioNombre: string;
  /** Ya formateada («24 de noviembre de 2026»). */
  fechaPurga: string;
  /**
   * ¿Está ARMADO el borrado automático? El texto lo lee una persona real y es
   * una declaración sobre SUS datos: con el interruptor apagado, «el 24 de
   * noviembre borraremos» es falso. Prometer un borrado que no ocurre es tan
   * malo como borrar sin avisar.
   */
  purgaArmada: boolean;
  urlSuscripcion: string;
  urlExportar: string;
}): string {
  const final = p.fase === 'aviso_final';
  const queDiceLaFecha = !final
    ? 'Conservamos sus datos hasta ese día. Desde hoy ya no hacemos copias de seguridad nuevas del estudio.'
    : p.purgaArmada
      // Lo que de verdad borra `purgar_estudio_vencido`: los datos de las
      // clientas y del equipo. La cuenta y las facturas se conservan.
      ? 'Ese día borraremos los datos personales de tus clientas y de tu equipo, con notas, mensajes y copias de seguridad.'
      : 'A partir de ese día los datos personales de tus clientas y de tu equipo quedan listos para borrarse.';
  return correoTentare({
    preheader: `Datos de ${p.estudioNombre}: se conservarán hasta el ${p.fechaPurga}`,
    antetitulo: final ? 'Último aviso' : 'Tu estudio',
    titular: final ? 'Último aviso sobre los datos de tu estudio' : 'Tus datos se conservarán hasta una fecha',
    parrafos: [`La prueba gratuita de ${p.estudioNombre} terminó y el estudio no tiene un plan activo.`],
    destacado: { titulo: p.fechaPurga, texto: queDiceLaFecha },
    boton: { href: p.urlSuscripcion, texto: 'Elegir un plan' },
    enlace: { href: p.urlExportar, texto: 'Descargar los datos del estudio' },
    nota: 'Si eliges un plan, todo queda como estaba. Si no, descarga tus datos antes de esa fecha: un CSV por tabla, sin ficha clínica. Las facturas y lo que la ley obliga a guardar se conservan durante el plazo legal.',
    acento: final ? TENTARE.alerta : null,
    motivo: `Te escribimos porque eres la propietaria de ${p.estudioNombre} en Tentare.`,
  });
}

export function correoAccesoActivado(p: {
  nombre: string;
  /** Con qué correo ha entrado. Es lo único que delata un email mal tecleado en la ficha. */
  emailCuenta: string | null;
  estudioNombre: string;
  /** /equipo en el despliegue desde el que se manda. */
  urlEquipo: string;
}): string {
  return correoTentare({
    preheader: `${p.nombre} ya puede entrar al panel de ${p.estudioNombre}`,
    antetitulo: 'Tu equipo',
    titular: `${p.nombre} ya tiene acceso`,
    parrafos: [`${p.nombre} ha creado su cuenta y ya puede entrar al panel de ${p.estudioNombre}.`],
    // No es una notificación de cortesía: el correo con el que ha entrado es lo
    // único que delata una dirección mal tecleada en la ficha. Por eso va
    // destacado y no en una línea más.
    destacado: p.emailCuenta ? { titulo: 'Ha entrado con este correo', texto: p.emailCuenta } : null,
    boton: { href: p.urlEquipo, texto: 'Ver mi equipo' },
    nota: 'Si no esperabas este acceso, entra en Equipo y dale de baja: se le retira al momento.',
    motivo: `Te escribimos porque eres la propietaria de ${p.estudioNombre} en Tentare.`,
  });
}

export function correoResumenSemanal(p: {
  propietariaNombre: string;
  estudioNombre: string;
  /** «4–10 de agosto». */
  rangoTexto: string;
  /** Solo presente si es > 0 (ver lib/decision/resumen-semanal-cron.ts). */
  crecimientoPct?: number;
  /** /centro-de-control en el despliegue desde el que se manda. */
  urlCentroDeControl: string;
}): string {
  return correoTentare({
    preheader: `${p.estudioNombre}: nada urgente esta semana`,
    antetitulo: `Semana del ${p.rangoTexto}`,
    titular: 'Semana tranquila',
    parrafos: [
      `Hola ${p.propietariaNombre}, repasamos ${p.estudioNombre} cada día de la semana y no encontramos nada que mereciera interrumpirte. Sin sorpresas, sin nada pendiente de tu parte.`,
    ],
    cifras: p.crecimientoPct !== undefined
      ? [{ valor: `+${p.crecimientoPct} %`, etiqueta: 'Ingresos frente a la semana anterior' }]
      : null,
    boton: { href: p.urlCentroDeControl, texto: 'Abrir Centro de Control' },
    nota: 'Es el único aviso que mandamos cuando una semana ha sido así de tranquila. Puedes desactivarlo desde Centro de Control.',
    motivo: `Te escribimos porque eres la propietaria de ${p.estudioNombre} en Tentare.`,
  });
}
