// Los correos de Tentare sobre la CUENTA del estudio: su suscripción, qué pasa
// con sus datos si no paga o se da de baja, quién entra a su panel y cómo ha ido la semana.
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
  fase: 'aviso_30' | 'aviso_baja' | 'aviso_final';
  /** Por qué el estudio se ha quedado sin contrato. Sin él, la prueba vencida (lo de siempre). */
  motivo?: 'prueba_vencida' | 'baja';
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
  const baja = (p.motivo ?? (p.fase === 'aviso_baja' ? 'baja' : 'prueba_vencida')) === 'baja';
  // Lo que de verdad borra `purgar_estudio_vencido`: los datos de las clientas
  // y del equipo. La cuenta y las facturas se conservan.
  const queSeBorra = 'los datos personales de tus clientas y de tu equipo, con notas, mensajes y copias de seguridad';
  const queDiceLaFecha = !final
    ? baja
      ? p.purgaArmada
        ? `Hasta ese día puedes descargar todos los datos del estudio. Después borraremos ${queSeBorra}.`
        : 'Conservamos sus datos hasta ese día para que puedas descargarlos. Desde hoy ya no hacemos copias de seguridad nuevas del estudio.'
      : 'Conservamos sus datos hasta ese día. Desde hoy ya no hacemos copias de seguridad nuevas del estudio.'
    : p.purgaArmada
      ? `Ese día borraremos ${queSeBorra}.`
      : 'A partir de ese día los datos personales de tus clientas y de tu equipo quedan listos para borrarse.';
  // Lo que lleva la descarga, en una frase. Si cambia lo que exporta
  // /api/exportar/mis-datos, cambia aquí.
  const queLleva = 'un CSV por tabla con clientas, reservas, cobros, ficha de salud, notas y consentimientos';
  const exportar = { href: p.urlExportar, texto: 'Descargar los datos del estudio' };
  return correoTentare({
    preheader: baja
      ? `Datos de ${p.estudioNombre}: puedes descargarlos hasta el ${p.fechaPurga}`
      : `Datos de ${p.estudioNombre}: se conservarán hasta el ${p.fechaPurga}`,
    antetitulo: final ? 'Último aviso' : 'Tu estudio',
    titular: final
      ? 'Último aviso sobre los datos de tu estudio'
      : baja ? 'Descarga los datos de tu estudio' : 'Tus datos se conservarán hasta una fecha',
    parrafos: [baja
      ? `La suscripción de ${p.estudioNombre} a Tentare ha terminado.`
      : `La prueba gratuita de ${p.estudioNombre} terminó y el estudio no tiene un plan activo.`],
    destacado: { titulo: p.fechaPurga, texto: queDiceLaFecha },
    // En una baja lo primero es llevarse los datos; en una prueba, elegir plan.
    boton: baja ? exportar : { href: p.urlSuscripcion, texto: 'Elegir un plan' },
    enlace: baja ? { href: p.urlSuscripcion, texto: 'Reactivar la suscripción' } : exportar,
    nota: baja
      ? `La descarga es ${queLleva}. Si reactivas la suscripción antes de esa fecha, todo queda como estaba. Las facturas y lo que la ley obliga a guardar se conservan durante el plazo legal.`
      : `Si eliges un plan, todo queda como estaba. Si no, descarga tus datos antes de esa fecha: ${queLleva}. Las facturas y lo que la ley obliga a guardar se conservan durante el plazo legal.`,
    acento: final ? TENTARE.alerta : null,
    motivo: `Te escribimos porque eres la propietaria de ${p.estudioNombre} en Tentare.`,
  });
}

/**
 * Confirmación del borrado de los datos de un estudio sin contrato (contrato de
 * encargo, «se le acredita por correo»). Dice lo que borra de verdad
 * `purgar_estudio_vencido` y lo que se conserva bloqueado por ley.
 */
export function correoDatosBorrados(p: { estudioNombre: string; fecha: string }): string {
  return correoTentare({
    preheader: `Confirmación del borrado de los datos de ${p.estudioNombre}`,
    antetitulo: 'Tu estudio',
    titular: 'Hemos borrado los datos de tu estudio',
    parrafos: [
      `El ${p.fecha} borramos de Tentare los datos personales de las clientas y del equipo de ${p.estudioNombre}: sus fichas quedan anonimizadas, y se han borrado la salud, las notas, los mensajes, las credenciales de las integraciones y las copias de seguridad.`,
    ],
    nota: 'Conservamos bloqueados, solo durante el plazo que marca la ley, las facturas, los recibos, los registros de facturación y los mandatos SEPA. Este correo es la confirmación del borrado: guárdalo si lo necesitas.',
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

/**
 * El código del segundo paso al entrar al panel (lib/auth/codigo-correo-reglas.ts).
 * Lo recibe quien entra, sea cual sea su papel en el estudio: por eso el motivo
 * habla de su cuenta y no de «la propietaria». El código no va en el asunto ni
 * en el preheader: se leería en la pantalla bloqueada del móvil.
 */
export function correoCodigoAcceso(p: { codigo: string; minutos: number }): string {
  const legible = `${p.codigo.slice(0, 3)} ${p.codigo.slice(3)}`;
  return correoTentare({
    preheader: `Para terminar de entrar a tu panel. Caduca en ${p.minutos} minutos.`,
    antetitulo: 'Tu acceso',
    titular: 'Tu código para entrar',
    parrafos: [`Escríbelo en la pantalla de Tentare para terminar de entrar al panel. Caduca en ${p.minutos} minutos y solo sirve una vez.`],
    destacado: { titulo: 'Código', texto: legible },
    nota: 'Si no estabas entrando tú, alguien tiene tu contraseña: cámbiala ya con «He olvidado mi contraseña» en la pantalla de entrar. No compartas este código: nadie de Tentare te lo pedirá nunca.',
    motivo: 'Te escribimos porque alguien acaba de entrar con tu contraseña a tu cuenta de Tentare, que tiene la verificación en dos pasos activada.',
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
