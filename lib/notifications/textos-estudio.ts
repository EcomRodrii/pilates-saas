// ─────────────────────────────────────────────────────────────────────────────
// Textos de aviso reescritos por el estudio (client-safe): los usa el panel
// para validar y previsualizar, y el motor para decidir si aplica el texto del
// estudio o el de fábrica.
//
// Se guardan en `notification_template` (una fila por estudio y tipo; solo la
// propietaria escribe, migr 20260921150000). Solo los avisos que recibe la
// ALUMNA (`PUSH_POR_TIPO.SOCIA`): son los que hablan en nombre del estudio.
//
// ⚠️ Un texto solo puede usar las variables que ya usa el de fábrica: son las
// únicas que el evento trae garantizadas. Con una que no trae, `render` la deja
// vacía y la alumna leería «Tu clase de  es a las 18:00». Por eso el motor, si
// se encuentra una variable desconocida (un texto guardado antes de un cambio
// del catálogo), vuelve al de fábrica en vez de mandarlo roto.
// ─────────────────────────────────────────────────────────────────────────────
import { plantillaDe, render } from './catalog.ts';
import { PUSH_POR_TIPO } from './push-por-tipo.ts';

export const TITULO_MAX = 80;
export const CUERPO_MAX = 240;

export const TIPOS_CON_TEXTO_EDITABLE = PUSH_POR_TIPO.SOCIA;
const EDITABLES = new Set(TIPOS_CON_TEXTO_EDITABLE.flatMap(g => g.tipos.map(t => t.evento)));

export function esTextoEditable(evento: string): boolean {
  return EDITABLES.has(evento) && !!plantillaDe(evento, 'SOCIA');
}

export interface TextoAviso { title: string; body: string }

export function textoDeFabrica(evento: string): TextoAviso | null {
  const pl = plantillaDe(evento, 'SOCIA');
  return pl ? { title: pl.title, body: pl.body } : null;
}

export function variablesDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
}

/** Las que puede usar el texto del estudio: las del título y el cuerpo de fábrica. */
export function variablesPermitidas(evento: string): string[] {
  const f = textoDeFabrica(evento);
  return f ? variablesDe(`${f.title} ${f.body}`) : [];
}

/** Motivo por el que no se puede guardar, o `null` si vale. */
export function validarTexto(evento: string, t: TextoAviso): string | null {
  if (!esTextoEditable(evento)) return 'Este aviso no se puede personalizar.';
  const title = t.title.trim();
  const body = t.body.trim();
  if (!title) return 'El título no puede quedar vacío.';
  if (!body) return 'El texto no puede quedar vacío.';
  if (title.length > TITULO_MAX) return `El título no puede pasar de ${TITULO_MAX} caracteres.`;
  if (body.length > CUERPO_MAX) return `El texto no puede pasar de ${CUERPO_MAX} caracteres.`;
  const permitidas = new Set(variablesPermitidas(evento));
  const ajenas = variablesDe(`${title} ${body}`).filter(v => !permitidas.has(v));
  if (ajenas.length) return `Este aviso no sabe rellenar ${ajenas.map(v => `{${v}}`).join(', ')}.`;
  return null;
}

/** El texto que sale: el del estudio si es válido; si no, el de fábrica. */
export function textoEfectivo(evento: string, delEstudio: TextoAviso | null | undefined): TextoAviso | null {
  if (delEstudio && validarTexto(evento, delEstudio) === null) {
    return { title: delEstudio.title.trim(), body: delEstudio.body.trim() };
  }
  return textoDeFabrica(evento);
}

// ── Para el panel: qué significa cada variable y cómo quedaría ─────────────

export const ETIQUETA_VARIABLE: Record<string, string> = {
  clase: 'nombre de la clase',
  cuando: 'día y hora',
  hora: 'hora',
  fecha: 'fecha',
  antelacion: 'cuánto falta',
  sala: 'sala',
  instructora: 'instructora',
  sustituta: 'quien la sustituye',
  concepto: 'concepto del cobro',
  importe: 'importe',
  sesiones: 'sesiones que le quedan',
  plan: 'nombre del plan',
  precioAnterior: 'precio anterior',
  precioNuevo: 'precio nuevo',
  clases: 'clases que puede recuperar',
  remitente: 'quién escribe',
  autor: 'quién publica',
  previsualizacion: 'el principio del mensaje',
  titulo: 'título del documento',
  respuesta: 'la respuesta del estudio',
  motivoTexto: 'el motivo',
};

const MUESTRA: Record<string, string> = {
  clase: 'Reformer', cuando: 'jueves 25 a las 18:30', hora: '18:30', fecha: '30 de septiembre',
  antelacion: '24 horas', sala: 'Sala Norte', instructora: 'Ana', sustituta: 'Marta',
  concepto: 'Bono 10', importe: '75', sesiones: '2', plan: 'Bono 10', precioAnterior: '69 €',
  precioNuevo: '75 €', clases: '1 clase', remitente: 'Ana', autor: 'El estudio',
  previsualizacion: ': «¿Nos vemos el jueves?»', titulo: 'Consentimiento', respuesta: 'Te hemos guardado la plaza.',
  motivoTexto: '',
};

// Donde el evento trae la variable ya con su separador: en `clase.modificada`,
// `{sala}{instructora}` espera « con Ana», no «Ana» («Sala NorteAna»).
const MUESTRA_POR_EVENTO: Record<string, Record<string, string>> = {
  'clase.modificada': { instructora: ' con Ana' },
};

/** `datos` pisa la muestra: la pantalla pasa lo que es verdad para ESE estudio (su antelación). */
export function previsualizar(t: TextoAviso, datos: Record<string, string> = {}, evento?: string): TextoAviso {
  const d = { ...MUESTRA, ...(evento ? MUESTRA_POR_EVENTO[evento] : null), ...datos };
  return { title: render(t.title, d), body: render(t.body, d) };
}
