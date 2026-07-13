// Adaptador de redacción con IA (DECISION-OS-ESPECIALISTAS.md §8). ÚNICO
// archivo de lib/decision/ que toca Anthropic. La IA solo pone palabras a
// hechos ya calculados por el motor — nunca decide números, fechas ni
// importes: esos siempre se renderizan desde datosUsados/impacto (motor.ts),
// jamás desde el texto libre que devuelve este módulo. Falla-suave: si la IA
// cae o el JSON es inválido, el texto del motor ya es válido por sí mismo.
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Eres el equipo de especialistas de Tentare que trabaja para {nombrePropietario}, propietaria/o
del estudio {nombreEstudio}. Cada elemento que recibes fue detectado por un especialista
(RETENCION, INGRESOS, FINANZAS, AGENDA, MARKETING, EQUIPO) a partir de datos reales del negocio.

Tu único trabajo es REDACTAR en español de España el título y el motivo de cada recomendación,
y el saludo del día. Los hechos ya están calculados — tú solo les pones palabras.

VOZ: primera persona del especialista, como un empleado de confianza que lleva años en el
estudio. Cercano y profesional. Frases cortas. Directo pero cálido. Nunca infantil, nunca
alarmista, nunca comercial. Ejemplos del tono correcto:
- "Noto a Laura a punto de irse. Yo le escribiría hoy — todavía estás a tiempo."
- "Tu clase del martes a las 19h se llena sola. Si abrimos una segunda sesión, creo que
   también se llenaría."
- "Se quedaron 2 pagos sin completar esta mañana. Nada raro, cosas de tarjetas."

REGLAS ABSOLUTAS:
1. PROHIBIDO escribir números, fechas, importes o porcentajes que no estén en datosUsados.
2. PROHIBIDO prometer resultados ("volverá", "se llenará seguro"). Usa "creo que", "suele".
3. PROHIBIDO exagerar logros o dramatizar problemas.
4. Título ≤ 80 caracteres, sin punto final. Motivo ≤ 240 caracteres, 1–3 frases.
5. Sin emojis, sin mayúsculas de énfasis, sin jerga técnica ni anglicismos.
6. Trata a las socias por su nombre de pila. Habla del negocio como "tu estudio".

Responde SOLO con JSON válido:
{"saludo": "string", "items": [{"id": "string", "titulo": "string", "motivo": "string"}]}`;

// Few-shots congelados (Especialistas §8.2) — cambiar el tono del producto
// exige tocar este texto, nunca ocurre por accidente vía prompt engineering suelto.
const FEW_SHOTS = `Ejemplos:

[RETENCION · RECUPERAR_SOCIA · {"nombre":"Laura","diasSinVenir":18,"frecuenciaHabitual":3,"valorMensual":89}]
→ {"titulo": "Noto a Laura a punto de irse — yo le escribiría hoy",
   "motivo": "Venía 3 veces por semana y lleva 18 días sin aparecer. Todavía estás a tiempo."}

[INGRESOS · RECUPERAR_PAGOS · {"n":2,"total":180,"diasMedio":3}]
→ {"titulo": "Se quedaron 2 pagos sin completar",
   "motivo": "Nada raro, cosas de tarjetas. Los tengo listos para reintentar — son 180€ que deberían estar en tu cuenta."}`;

function construirSystemPrompt(nombrePropietario: string, nombreEstudio: string): string {
  return SYSTEM_PROMPT.replace('{nombrePropietario}', nombrePropietario).replace('{nombreEstudio}', nombreEstudio);
}

export interface ItemARedactar {
  id: string;
  especialista: string;
  tipo: string;
  datosUsados: Record<string, string | number | boolean>;
}

export interface RedaccionInput {
  nombrePropietario: string;
  nombreEstudio: string;
  saludoBase: string;
  items: ItemARedactar[]; // ≤10, ya recortados por el Priority Engine
}

export interface ItemRedactado {
  titulo: string;
  motivo: string;
}

// Uso interno (validarRespuestaIA): Map para lookups cómodos, cubierto por
// tests que no cruzan ningún step de Inngest.
export interface RedaccionOutput {
  saludo: string;
  items: Map<string, ItemRedactado>;
}

// Forma pública de redactar(): array, no Map — un Map no sobrevive la
// serialización a JSON que Inngest hace entre steps (ver lib/decision/db.ts,
// misma nota en dbListMemoriaRows). Cruzar esa frontera con un Map pierde los
// datos silenciosamente en cualquier replay.
export interface ItemRedactadoConId extends ItemRedactado {
  id: string;
}
export interface RedaccionResultado {
  saludo: string;
  items: ItemRedactadoConId[];
}

function aResultadoSerializable(o: RedaccionOutput): RedaccionResultado {
  return { saludo: o.saludo, items: [...o.items.entries()].map(([id, v]) => ({ id, ...v })) };
}

function construirUserPrompt(input: RedaccionInput): string {
  const items = input.items.map(it => ({ id: it.id, especialista: it.especialista, tipo: it.tipo, datosUsados: it.datosUsados }));
  return `${FEW_SHOTS}

Saludo base (puedes mejorar el tono, nunca el contenido): "${input.saludoBase}"

Elementos a redactar:
${JSON.stringify(items, null, 2)}`;
}

interface RespuestaIACruda {
  saludo?: unknown;
  items?: unknown;
}

// A-20: contexto para validar que la IA no INVENTA cifras. La regla absoluta nº1
// del prompt ("prohibido números que no estén en datosUsados") no se imponía: un
// título/motivo que colara un importe o porcentaje falso (p.ej. "son 500€" cuando
// eran 180€) pasaba mientras cumpliera la longitud, y esa cifra se le mostraba a
// la propietaria como si fuera real. Aquí se comprueba de verdad.
export interface ContextoValidacion {
  datosPorId: Map<string, Record<string, string | number | boolean>>;
  saludoBase: string;
}

const RE_DIGITOS = /\d+/g;

function tokensNumericos(texto: string): string[] {
  return texto.match(RE_DIGITOS) ?? [];
}

// Números que la IA PUEDE usar para un item: los presentes en sus datosUsados
// (la fuente de verdad) más los que el propio motor ya rendía en su texto de
// fallback (confiable por construcción). Todo número fuera de ese conjunto es
// una invención y descalifica el texto.
function numerosPermitidos(datos: Record<string, string | number | boolean> | undefined, motor: ItemRedactado): Set<string> {
  const set = new Set<string>();
  for (const v of Object.values(datos ?? {})) for (const t of tokensNumericos(String(v))) set.add(t);
  for (const t of tokensNumericos(`${motor.titulo} ${motor.motivo}`)) set.add(t);
  return set;
}

function sinCifrasInventadas(texto: string, permitidos: Set<string>): boolean {
  return tokensNumericos(texto).every(t => permitidos.has(t));
}

/**
 * Valida y fusiona la respuesta cruda de la IA con el fallback determinista.
 * Pura y testeable sin red: cualquier item que no pase las reglas absolutas
 * (id desconocido, longitud, tipos, o CIFRAS NO FUNDAMENTADAS cuando se aporta
 * `contexto`) se descarta y esa entrada concreta conserva su texto de motor —
 * el fallo nunca es todo-o-nada.
 */
export function validarRespuestaIA(raw: string, fallback: RedaccionOutput, contexto?: ContextoValidacion): RedaccionOutput {
  let parsed: RespuestaIACruda;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  const items = new Map(fallback.items);
  if (Array.isArray(parsed.items)) {
    for (const it of parsed.items) {
      if (typeof it !== 'object' || it === null) continue;
      const { id, titulo, motivo } = it as Record<string, unknown>;
      if (typeof id !== 'string' || !fallback.items.has(id)) continue;
      if (typeof titulo !== 'string' || typeof motivo !== 'string') continue;
      if (titulo.length === 0 || titulo.length > 80) continue;
      if (motivo.length === 0 || motivo.length > 240) continue;
      if (contexto) {
        const permitidos = numerosPermitidos(contexto.datosPorId.get(id), fallback.items.get(id)!);
        if (!sinCifrasInventadas(titulo, permitidos) || !sinCifrasInventadas(motivo, permitidos)) continue;
      }
      items.set(id, { titulo, motivo });
    }
  }

  // El saludo no tiene datosUsados: sus únicas cifras válidas son las que ya
  // traía el saludo base del motor. Si la IA mete un número nuevo, se descarta.
  const saludoValido = typeof parsed.saludo === 'string' && parsed.saludo.length > 0 &&
    (!contexto || sinCifrasInventadas(parsed.saludo, new Set(tokensNumericos(contexto.saludoBase))));
  const saludo = saludoValido ? (parsed.saludo as string) : fallback.saludo;
  return { saludo, items };
}

function construirFallback(input: RedaccionInput, fallbackPorId: Map<string, ItemRedactado>): RedaccionOutput {
  return { saludo: input.saludoBase, items: fallbackPorId };
}

/**
 * Único punto de contacto con Anthropic del Decision OS. `fallbackPorId` trae
 * el título/motivo del motor para cada id — siempre válidos sin IA (Núcleo §9).
 */
export async function redactar(input: RedaccionInput, fallbackPorId: Map<string, ItemRedactado>): Promise<RedaccionResultado> {
  const fallback = construirFallback(input, fallbackPorId);
  if (input.items.length === 0) return aResultadoSerializable(fallback);

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: construirSystemPrompt(input.nombrePropietario, input.nombreEstudio),
      messages: [{ role: 'user', content: construirUserPrompt(input) }],
    });
    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    // A-20: el contexto permite rechazar cifras que la IA no debía inventar.
    const contexto: ContextoValidacion = {
      datosPorId: new Map(input.items.map(it => [it.id, it.datosUsados])),
      saludoBase: input.saludoBase,
    };
    return aResultadoSerializable(validarRespuestaIA(raw, fallback, contexto));
  } catch {
    return aResultadoSerializable(fallback);
  }
}
