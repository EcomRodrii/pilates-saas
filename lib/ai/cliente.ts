import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// El cliente de Anthropic compartido, perezoso (no se construye hasta que hace
// falta, y nunca en el navegador). Lo usa el asistente; los cinco usos que ya
// había (notas de sesión, campañas, Decision OS…) siguen con el suyo: no se
// tocan en este cambio.
//
// `maxRetries: 1` y `timeout: 25 s`: la ruta del asistente tiene 60 s
// (`maxDuration`) para hasta 6 llamadas; con los valores por defecto del SDK
// (2 reintentos, 10 min) una caída de Anthropic se comería la función entera.
// La clave sale de ANTHROPIC_API_KEY (nunca del código ni de la petición).

let cliente: Anthropic | null = null;

export function clienteAnthropic(): Anthropic {
  if (!cliente) cliente = new Anthropic({ maxRetries: 1, timeout: 25_000 });
  return cliente;
}
