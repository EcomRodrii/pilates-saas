import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { clienteAnthropic } from '@/lib/ai/cliente';
import { MODELO_ASISTENTE, parametrosDelModelo } from '@/lib/asistente/modelo';
import type { ModeloDemo } from './tenti.ts';

// La llamada real al modelo de Tenti en la demo. El modelo es el del asistente
// del producto (Haiku 5.5, lib/asistente/modelo.ts) y NO se sustituye por otro
// en silencio: el asistente tiene un respaldo a Haiku 4.5 con aviso, aquí no —
// si el modelo no responde, la persona recibe los escenarios del catálogo y
// Sentry recibe el aviso (lo hace la ruta).
//
// La clave sale de ANTHROPIC_API_KEY en el servidor (lib/ai/cliente.ts); esta
// función solo se importa desde rutas de API.
//
// Topes de coste por llamada: 700 tokens de salida (una pregunta o una
// propuesta caben de sobra) y un solo reintento con 12 s de margen, para que
// una caída del proveedor no se coma la función entera.
export const MAX_TOKENS_TURNO = 700;
const TIMEOUT_MS = 12_000;

export const modeloDeLaDemo: ModeloDemo = async ({ sistema, mensajes, herramientas }) => {
  const r = await clienteAnthropic().messages.create(
    {
      model: MODELO_ASISTENTE,
      max_tokens: MAX_TOKENS_TURNO,
      system: sistema,
      messages: mensajes,
      tools: herramientas as Anthropic.Tool[],
      // Obliga a contestar con una herramienta: la salida siempre es dato validable.
      tool_choice: { type: 'any' },
      ...parametrosDelModelo(MODELO_ASISTENTE),
    },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );
  const bloque = r.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return {
    herramienta: bloque ? { name: bloque.name, input: bloque.input } : null,
    tokensEntrada: r.usage.input_tokens,
    tokensSalida: r.usage.output_tokens,
  };
};
