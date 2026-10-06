// Lo que se reenvía a Anthropic de los turnos ANTERIORES de una conversación.
// Puro: se prueba con `node --test` (historial.test.ts).
//
// Se guardan enteros (`asistente_mensajes.contenido`: pregunta, `tool_use`,
// `tool_result` y respuesta), pero al modelo, de cada turno pasado, solo le
// llega la pregunta y el texto que vio la propietaria. Los resultados de las
// herramientas de antes (hasta 9.000 caracteres cada uno) no viajan:
//
//   · Coste: reenviarlos multiplica la entrada de cada pregunta de seguimiento,
//     y pasados cinco minutos sin preguntar (se cae la caché) se vuelven a
//     escribir enteros, a 1,25×. Con un par de tarjetas por turno, al cuarto
//     turno eran ~10.000 tokens de datos viejos por llamada; así, unos cientos.
//   · Caché: el historial compactado es ESTABLE de un turno al siguiente (un
//     turno pasado no cambia nunca de forma), así que la pregunta siguiente lee
//     de caché todo lo anterior. Conservar solo los del último turno lo
//     rompería en cada pregunta: el penúltimo cambiaría de forma al dejar de ser
//     el último.
//   · Verdad: un dato de hace tres preguntas puede estar viejo. Si una pregunta
//     de seguimiento lo necesita, la herramienta se vuelve a llamar (una
//     consulta barata) y responde con lo de ahora.
//   · Cifras: el texto de las respuestas pasadas ya pasó el filtro de cifras,
//     así que lo que el modelo repita de él está respaldado (bucle.ts lo cuenta
//     como texto de confianza).
//
// Ventana: como mucho TURNOS_MAX turnos pasados, y cuando se pasa se recorta de
// SEIS en seis (no de uno en uno), para que el principio del historial —y su
// caché— no cambie en cada pregunta.

import type Anthropic from '@anthropic-ai/sdk';

export const TURNOS_MAX = 12;
const PASO = 6;

interface Turno { pregunta: string; respuesta: string }

const textos = (m: Anthropic.MessageParam): string[] =>
  typeof m.content === 'string'
    ? [m.content]
    : m.content.filter((b): b is Anthropic.TextBlockParam => b.type === 'text').map(b => b.text);

/** Qué propuso el asistente en un turno pasado, en una línea corta (sin personas): así no la retoma ni la da por pendiente. */
const marcaDePropuesta = (b: Anthropic.ToolUseBlock): string | null => {
  const i = (b.input ?? {}) as Record<string, unknown>;
  const t = (k: string) => (typeof i[k] === 'string' ? (i[k] as string).replace(/[«»\[\]]/g, '').trim().slice(0, 60) : '');
  switch (b.name) {
    case 'proponer_sala': return `[acción ya propuesta y resuelta: sala «${t('nombre')}»]`;
    case 'proponer_clase': return `[acción ya propuesta y resuelta: clase ${t('tipo_clase')} ${t('fecha')} ${t('hora')}]`;
    case 'proponer_evento': return `[acción ya propuesta y resuelta: evento ${t('fecha')} ${t('hora')}]`;
    case 'proponer_cita': return `[acción ya propuesta y resuelta: cita ${t('fecha')} ${t('hora')}]`;
    default: return null;
  }
};

/** Un mensaje `user` que abre turno: lleva texto (no es solo una tanda de `tool_result`). */
const abreTurno = (m: Anthropic.MessageParam) => m.role === 'user' && textos(m).some(t => t.trim());

/** Los turnos pasados, en orden: la pregunta y todo el texto de la respuesta. */
export function turnosDe(mensajes: readonly Anthropic.MessageParam[]): Turno[] {
  const turnos: Turno[] = [];
  for (const m of mensajes) {
    if (abreTurno(m)) { turnos.push({ pregunta: textos(m).join('\n').trim(), respuesta: '' }); continue; }
    const actual = turnos[turnos.length - 1];
    if (!actual || m.role !== 'assistant') continue;
    const marcas = typeof m.content === 'string' ? [] : m.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map(marcaDePropuesta).filter((x): x is string => !!x);
    const t = [...textos(m).map(x => x.trim()).filter(Boolean), ...marcas].join(' ');
    if (t) actual.respuesta = actual.respuesta ? `${actual.respuesta} ${t}` : t;
  }
  return turnos;
}

/** Desde qué turno se manda: 0 hasta TURNOS_MAX, y luego saltos de PASO. */
export function primerTurnoEnviado(n: number): number {
  return n <= TURNOS_MAX ? 0 : Math.ceil((n - TURNOS_MAX) / PASO) * PASO;
}

/**
 * El historial para el modelo: pares pregunta / respuesta, sin herramientas.
 * Un turno que no llegó a tener respuesta (falló, se cortó) no se manda: una
 * pregunta sin contestar en medio no le sirve de nada y rompería la alternancia.
 */
export function historialParaElModelo(mensajes: readonly Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const conRespuesta = turnosDe(mensajes).filter(t => t.respuesta);
  return conRespuesta.slice(primerTurnoEnviado(conRespuesta.length)).flatMap((t): Anthropic.MessageParam[] => [
    { role: 'user', content: [{ type: 'text', text: t.pregunta }] },
    { role: 'assistant', content: [{ type: 'text', text: t.respuesta }] },
  ]);
}
