// Personalización con IA del mensaje que se envía A LA SOCIA (win-back y demás
// contactos). Mismo contrato que redaccion.ts, que redacta para el PROPIETARIO:
// la IA solo REESCRIBE con más calidez un mensaje ya correcto y completo; nunca
// decide cifras, ofertas ni fechas — esas vienen del motor (datosUsados) y se
// validan contra el texto devuelto. Falla-suave: ante cualquier problema (sin
// API key, IA caída, JSON inválido, cifra inventada) se envía el determinista,
// que ya es válido por sí mismo.
import Anthropic from '@anthropic-ai/sdk';
import type { MensajeSocia } from './mensajes-socia.ts';

const SYSTEM_PROMPT = `Escribes mensajes para las socias de {nombreEstudio}, un estudio de Pilates.

Recibes un mensaje YA CORRECTO y tu único trabajo es reescribirlo para que suene más
personal y cercano a esa socia concreta, en español de España. El contenido y la
intención no cambian: solo las palabras.

VOZ: la de su instructora de siempre escribiéndole de tú. Cálida, natural, breve.
Como un mensaje de una persona, no de una empresa.

REGLAS ABSOLUTAS:
1. PROHIBIDO inventar números, fechas, importes, porcentajes o descuentos que no estén
   ya en el mensaje original o en los datos. Si el original no ofrece descuento, tú tampoco.
2. PROHIBIDO prometer resultados ni presionar ("es tu última oportunidad", "vas a perder").
3. PROHIBIDO sonar comercial, culpabilizar por la ausencia o dramatizar.
4. Asunto ≤ 90 caracteres. Cuerpo ≤ 500 caracteres, 2–4 frases.
5. Sin emojis, sin mayúsculas de énfasis, sin anglicismos.
6. Llama a la socia por su nombre de pila. Termina con una pregunta abierta y fácil.

Responde SOLO con JSON válido:
{"asunto": "string", "cuerpo": "string"}`;

export interface ContextoPersonalizacion {
  nombreEstudio: string;
  tipo: string;
  datosUsados: Record<string, string | number | boolean>;
}

const RE_DIGITOS = /\d+/g;

function tokensNumericos(texto: string): string[] {
  return texto.match(RE_DIGITOS) ?? [];
}

/**
 * Cifras que la IA PUEDE usar: las de datosUsados (fuente de verdad del motor)
 * más las que el mensaje determinista ya rendía. Cualquier otra es inventada.
 */
export function numerosPermitidosMensaje(
  base: MensajeSocia, datos: Record<string, string | number | boolean> | undefined,
): Set<string> {
  const set = new Set<string>();
  for (const v of Object.values(datos ?? {})) for (const t of tokensNumericos(String(v))) set.add(t);
  for (const t of tokensNumericos(`${base.asunto} ${base.cuerpo}`)) set.add(t);
  return set;
}

/**
 * Valida la respuesta cruda de la IA contra el mensaje determinista. Pura y
 * testeable sin red: si algo no cuadra (JSON inválido, tipos, longitud o CIFRAS
 * NO FUNDAMENTADAS) devuelve el determinista intacto.
 */
export function validarMensajePersonalizado(
  raw: string, base: MensajeSocia, permitidos: Set<string>,
): MensajeSocia {
  let parsed: { asunto?: unknown; cuerpo?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  const { asunto, cuerpo } = parsed;
  if (typeof asunto !== 'string' || typeof cuerpo !== 'string') return base;
  if (asunto.length === 0 || asunto.length > 90) return base;
  if (cuerpo.length === 0 || cuerpo.length > 500) return base;
  if (!tokensNumericos(asunto).every(t => permitidos.has(t))) return base;
  if (!tokensNumericos(cuerpo).every(t => permitidos.has(t))) return base;
  return { asunto, cuerpo };
}

function construirUserPrompt(base: MensajeSocia, ctx: ContextoPersonalizacion): string {
  return `Datos de la situación (calculados por el sistema, son la verdad):
${JSON.stringify(ctx.datosUsados, null, 2)}

Mensaje original a reescribir:
{"asunto": ${JSON.stringify(base.asunto)}, "cuerpo": ${JSON.stringify(base.cuerpo)}}`;
}

/**
 * Reescribe el mensaje a la socia con IA. Nunca lanza: cualquier fallo devuelve
 * el mensaje determinista de entrada.
 */
export async function personalizarMensajeSocia(
  base: MensajeSocia, ctx: ContextoPersonalizacion,
): Promise<MensajeSocia> {
  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT.replace('{nombreEstudio}', ctx.nombreEstudio || 'el estudio'),
      messages: [{ role: 'user', content: construirUserPrompt(base, ctx) }],
    });
    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    return validarMensajePersonalizado(raw, base, numerosPermitidosMensaje(base, ctx.datosUsados));
  } catch {
    return base;
  }
}
