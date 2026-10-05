// Mide el prefijo cacheable del asistente (herramientas + prompt de sistema)
// con `messages.countTokens`, que es GRATIS, para los dos juegos de
// herramientas (propietaria y gerencia). Haiku 4.5 no cachea prefijos de menos
// de 4.096 tokens y no avisa: si alguno no llega, esto falla.
//
//   ANTHROPIC_API_KEY=… node --experimental-strip-types --import ./scripts/register-test-hooks.mjs scripts/asistente-contar-prefijo.mjs
import Anthropic from '@anthropic-ai/sdk';
import { PROMPT_SISTEMA } from '../lib/asistente/prompt.ts';
import { aHerramientasAnthropic, herramientasDelRol } from '../lib/asistente/herramientas/definiciones.ts';
import { MODELO_ASISTENTE } from '../lib/asistente/modelo.ts';

const MINIMO = 4096;
const client = new Anthropic();
let falla = false;
for (const rol of ['PROPIETARIO', 'MANAGER']) {
  const tools = aHerramientasAnthropic(herramientasDelRol(rol));
  // Una pregunta mínima: lo que se mide es el prefijo (tools + system[0]).
  const { input_tokens } = await client.messages.countTokens({
    model: MODELO_ASISTENTE,
    tools,
    system: [{ type: 'text', text: PROMPT_SISTEMA }],
    messages: [{ role: 'user', content: 'x' }],
  });
  const ok = input_tokens >= MINIMO;
  if (!ok) falla = true;
  console.log(`${rol}: ${tools.length} herramientas, ${input_tokens} tokens de prefijo ${ok ? '✔' : `✖ (< ${MINIMO}: NO cachea)`}`);
}
process.exit(falla ? 1 : 0);
