// Lo que las automatizaciones le escriben a las clientas, en un solo sitio y
// editable por el estudio.
//
// ⚠️ Antes estos textos eran literales dentro de `automation-engine.ts`. La
// propietaria veía «QUÉ HACE, PASO A PASO: WhatsApp el día antes de la clase»
// y en ningún sitio el texto que iba a salir con su nombre a 300 personas — así
// que no encendía ninguna regla, que es la forma más cara de tener una
// funcionalidad: construida, apagada y sin poder evaluarla. («No voy a encender
// algo que escribe a mis alumnas en mi nombre sin leerlo antes. Punto.»)
//
// Cada mensaje tiene su plantilla por defecto y sus variables. El estudio puede
// reescribirlo entero; lo que guarde vive en `automation_rules.condicion.mensajes`
// (jsonb que ya existe y ya guarda los umbrales de cada regla), así que esto no
// necesita ninguna migración.
//
// El ASUNTO no se toca a propósito: `automation-engine` deduplica algunos
// avisos comparando el título contra `automation_logs.detalle`
// (`l.detalle.includes('¿Todo bien por el estudio?')`), así que un asunto
// editable haría que el mismo mensaje se reenviara cada día. Se enseña en la
// pantalla, en gris, para que se sepa qué llega — pero no se edita.

import type { AutomationRule } from '../types.ts';

export interface VariableMensaje {
  /** Cómo se escribe en la plantilla, sin llaves: `nombre` → `{nombre}`. */
  clave: string;
  /** Qué es, en cristiano, para la ayuda de la pantalla. */
  descripcion: string;
  /** Valor con el que se pinta la vista previa. */
  ejemplo: string;
}

export interface MensajeAutomatizacion {
  /** Identificador estable. Es la clave dentro de `condicion.mensajes`. */
  clave: string;
  trigger: AutomationRule['trigger'];
  /** Cuándo sale, para poder distinguir los dos avisos de una misma regla. */
  cuando: string;
  /** El asunto del email. No editable (ver la nota de arriba). */
  asunto: string;
  plantilla: string;
  variables: VariableMensaje[];
}

const V = {
  nombre: { clave: 'nombre', descripcion: 'El nombre de la clienta', ejemplo: 'Elena' },
  dias: { clave: 'dias', descripcion: 'Días que llevan pasados', ejemplo: '9' },
  importe: { clave: 'importe', descripcion: 'Importe del recibo', ejemplo: '75' },
  concepto: { clave: 'concepto', descripcion: 'Concepto del recibo', ejemplo: 'Cuota mensual' },
  clase: { clave: 'clase', descripcion: 'Nombre del tipo de clase', ejemplo: 'Pilates Reformer' },
  hora: { clave: 'hora', descripcion: 'Hora de la clase', ejemplo: '10:00' },
  cierre: { clave: 'cierre', descripcion: 'Frase extra en los hitos de antigüedad (vacía el resto de veces)', ejemplo: ' Y hoy además cumples 6 meses con nosotros — ¡gracias por tu confianza!' },
} as const;

export const MENSAJES_AUTOMATIZACION: MensajeAutomatizacion[] = [
  {
    clave: 'ausencia_recordatorio',
    trigger: 'AUSENCIA_DIAS',
    cuando: 'Primer aviso, cuando lleva días sin venir',
    asunto: 'Te echamos de menos',
    plantilla: '{nombre}, llevas {dias} días sin venir a clase. ¿Todo bien? Te esperamos pronto por el estudio.',
    variables: [V.nombre, V.dias],
  },
  {
    clave: 'ausencia_checkin',
    trigger: 'AUSENCIA_DIAS',
    cuando: 'A las dos semanas, preguntando qué tal — sin ofrecer nada',
    asunto: '¿Todo bien por el estudio?',
    plantilla: '{nombre}, hace un par de semanas que no coincidimos en clase. Si hay algo que te esté costando encajar el horario, o alguna molestia, dínoslo — nos encanta ayudarte a volver a tu ritmo.',
    variables: [V.nombre],
  },
  {
    clave: 'pago_primer_aviso',
    trigger: 'PAGO_PENDIENTE_DIAS',
    cuando: 'Primer aviso de un pago vencido',
    asunto: 'Tienes un pago pendiente',
    plantilla: '{nombre}, tienes un pago pendiente de {importe}€ ({concepto}) desde hace {dias} días. Puedes regularizarlo fácilmente desde tu área de socia o pasando por el estudio — si ya lo has hecho, ignora este aviso. ¡Gracias!',
    variables: [V.nombre, V.importe, V.concepto, V.dias],
  },
  {
    clave: 'pago_segundo_aviso',
    trigger: 'PAGO_PENDIENTE_DIAS',
    cuando: 'Segundo aviso, si sigue sin resolverse',
    asunto: 'Segundo aviso: pago pendiente',
    plantilla: '{nombre}, tu pago de {importe}€ ({concepto}) sigue pendiente desde hace {dias} días. Puedes regularizarlo desde tu área de socia o pasando por el estudio — si ya lo hiciste, ignora este aviso.',
    variables: [V.nombre, V.importe, V.concepto, V.dias],
  },
  {
    clave: 'recordatorio_clase',
    trigger: 'CLASE_MANANA',
    cuando: 'El día antes de la clase',
    asunto: 'Recordatorio: tu clase es mañana',
    plantilla: '{nombre}, te recordamos tu clase de {clase} mañana a las {hora}. Si no puedes venir, cancela desde tu portal (Mis reservas) para liberar la plaza — ¡te esperamos!',
    variables: [V.nombre, V.clase, V.hora],
  },
  {
    clave: 'nueva_sin_reservar',
    trigger: 'NUEVA_SOCIA',
    cuando: 'Cuando una clienta nueva todavía no ha reservado nada',
    asunto: 'Reserva tu primera clase',
    plantilla: '{nombre}, ¿ya has echado un vistazo a los horarios? Reserva tu primera clase cuando quieras desde tu área de socia — te esperamos.',
    variables: [V.nombre],
  },
  {
    clave: 'renovacion_confirmada',
    trigger: 'RENOVACION_COBRADA',
    cuando: 'Al cobrarse una renovación',
    asunto: 'Renovación confirmada',
    plantilla: '{nombre}, hemos cobrado tu renovación de {concepto} por {importe}€. Aquí tienes tu recibo desde tu área de socia.{cierre}',
    variables: [V.nombre, V.concepto, V.importe, V.cierre],
  },
];

export function mensajesDeTrigger(trigger: AutomationRule['trigger']): MensajeAutomatizacion[] {
  return MENSAJES_AUTOMATIZACION.filter(m => m.trigger === trigger);
}

export function definicionMensaje(clave: string): MensajeAutomatizacion | undefined {
  return MENSAJES_AUTOMATIZACION.find(m => m.clave === clave);
}

/** Los textos que el estudio ha reescrito, por clave. Siempre un objeto. */
export function mensajesPersonalizados(rule: Pick<AutomationRule, 'condicion'>): Record<string, string> {
  const raw = (rule.condicion as Record<string, unknown> | undefined)?.mensajes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

/** La plantilla que de verdad se va a usar: la del estudio si la reescribió. */
export function plantillaDe(rule: Pick<AutomationRule, 'condicion'> | undefined, clave: string): string {
  const propia = rule ? mensajesPersonalizados(rule)[clave] : undefined;
  return propia ?? definicionMensaje(clave)?.plantilla ?? '';
}

/**
 * Sustituye `{variable}` por su valor.
 *
 * Una variable que la plantilla no nombre simplemente no se usa, y una que
 * nombre y no exista se queda tal cual — a la vista, que es mejor que
 * desaparecer sin dejar rastro en un email ya enviado.
 */
export function renderMensaje(plantilla: string, valores: Record<string, string | number>): string {
  return plantilla.replace(/\{(\w+)\}/g, (original, clave: string) =>
    clave in valores ? String(valores[clave]) : original,
  );
}

/** El texto final de un mensaje de esta regla, listo para enviar. */
export function mensajeDe(
  rule: Pick<AutomationRule, 'condicion'> | undefined,
  clave: string,
  valores: Record<string, string | number>,
): string {
  return renderMensaje(plantillaDe(rule, clave), valores);
}

/** Vista previa con los valores de ejemplo de cada variable. */
export function vistaPreviaMensaje(rule: Pick<AutomationRule, 'condicion'> | undefined, clave: string): string {
  const def = definicionMensaje(clave);
  if (!def) return '';
  const ejemplos: Record<string, string> = {};
  for (const v of def.variables) ejemplos[v.clave] = v.ejemplo;
  return renderMensaje(plantillaDe(rule, clave), ejemplos);
}
