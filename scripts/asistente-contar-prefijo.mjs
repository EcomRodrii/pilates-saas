// Mide lo que cuesta en tokens una pregunta del asistente, con
// `messages.countTokens`, que es GRATIS (no ejecuta el modelo):
//   · el prefijo cacheable (herramientas + prompt de sistema): el MISMO para la
//     propietaria y la gerente (HERRAMIENTAS_DEL_ASISTENTE). Haiku 4.5 no
//     cachea prefijos de menos de 4.096 tokens y no avisa: si no llega, falla;
//   · lo que se añade en cada pregunta de ejemplo (contexto del día + pregunta)
//     y un resultado de herramienta típico, para estimar el coste por pregunta.
//
//   ANTHROPIC_API_KEY=… node --experimental-strip-types --import ./scripts/register-test-hooks.mjs scripts/asistente-contar-prefijo.mjs
import Anthropic from '@anthropic-ai/sdk';
import { PROMPT_SISTEMA, contextoDelDia } from '../lib/asistente/prompt.ts';
import { HERRAMIENTAS_DEL_ASISTENTE } from '../lib/asistente/herramientas/definiciones.ts';
import { MODELO_ASISTENTE, PRECIOS_HAIKU_45 as P } from '../lib/asistente/modelo.ts';

const MINIMO = 4096;
const client = new Anthropic();
const tools = [...HERRAMIENTAS_DEL_ASISTENTE];
const contar = async (system, messages) =>
  (await client.messages.countTokens({ model: MODELO_ASISTENTE, tools, system, messages })).input_tokens;

// Una pregunta mínima: lo que se mide es el prefijo (tools + system[0]).
const prefijo = await contar([{ type: 'text', text: PROMPT_SISTEMA }], [{ role: 'user', content: 'x' }]);
const ok = prefijo >= MINIMO;
console.log(`Prefijo (${tools.length} herramientas + prompt): ${prefijo} tokens ${ok ? '✔ cachea' : `✖ (< ${MINIMO}: NO cachea)`}`);

// El contexto del día con lo que lleva en producción: estudio (inventado) y quien escribe.
const contexto = contextoDelDia({
  hoy: '2026-10-06', rol: 'PROPIETARIO', quienEscribe: 'EQUIPO_1',
  estudio: { nombre: 'Estudio de ejemplo', ciudad: 'Ciudad', plan: 'ESTUDIO', enPrueba: false },
});
const sistema = [{ type: 'text', text: PROMPT_SISTEMA }, { type: 'text', text: contexto }];
// Una charla (sin herramientas, no gasta consulta desde migr 20261006014513): una llamada.
const charla = await contar(sistema, [{ role: 'user', content: '¿Cómo creo una clase?' }]);
console.log(`Charla «¿Cómo creo una clase?»: ${charla} tokens de entrada (contexto del día: ${charla - prefijo - 10} aprox.)`);

// Una pregunta trivial: dos llamadas (pide la herramienta, responde).
const pregunta = [{ role: 'user', content: '¿Cuántas alumnas activas tengo?' }];
const resultado = JSON.stringify({ total: 212, porEstado: { Activa: 84, 'De prueba': 6, 'Sin renovar': 9, Inactiva: 113 }, conPlanOBonoParaReservar: 90 });
const conResultado = [
  ...pregunta,
  { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01', name: 'contar_alumnas', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: resultado }] },
];
const l1 = await contar(sistema, pregunta);
const l2 = await contar(sistema, conResultado);
const salida = 60 + 150;
const nuevo1 = l1 - prefijo, nuevo2 = l2 - l1;
const usd = (t) => (t / 1e6).toFixed(5);
// Caché caliente: el prefijo se lee (0,1×); lo nuevo de la 1.ª se escribe (1,25×) y la 2.ª lo lee.
const caliente = (2 * prefijo * P.lecturaCache + nuevo1 * P.escrituraCache + nuevo1 * P.lecturaCache + nuevo2 * P.escrituraCache + salida * P.salida);
// Caché fría: además se escribe el prefijo (TTL de una hora, 2×) una vez.
const fria = caliente - prefijo * P.lecturaCache + prefijo * P.escrituraCache1h;
console.log(`«¿Cuántas alumnas activas tengo?»: llamada 1 = ${l1}, llamada 2 = ${l2} tokens de entrada; ~${salida} de salida`);
console.log(`  con la caché caliente ≈ ${usd(caliente)} $ · fría ≈ ${usd(fria)} $ → 1 consulta (cada consulta = hasta 0,03 $)`);
process.exit(ok ? 0 : 1);
