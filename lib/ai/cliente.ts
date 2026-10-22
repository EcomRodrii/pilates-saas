import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// El cliente de Anthropic compartido, perezoso (no se construye hasta que hace
// falta, y nunca en el navegador). Lo usa el asistente; los cinco usos que ya
// había (notas de sesión, campañas, Decision OS…) siguen con el suyo: no se
// tocan en este cambio.
//
// `maxRetries: 2` y `timeout: 10 s` (el SDK lo aplica hasta recibir la respuesta; el cuerpo en
// streaming sigue después): en el libro, 6 de 95 consultas (6 oct–20 oct) acabaron en «no he
// podido responder» tras 50–55 s, que coincide con 3 intentos de 18 s agotados (causa no medida). Con 10 s el peor caso es
// ~32 s, y una respuesta que de verdad llega empieza en menos de 2 s. Antes:
// `maxRetries: 2` y `timeout: 18 s`: la ruta del asistente tiene 60 s
// (`maxDuration`) para hasta 6 llamadas; con los valores por defecto del SDK
// (10 min) una caída de Anthropic se comería la función entera. Un intento más
// que antes porque los fallos reales eran cortes de red sueltos («RED», sin
// status) que un reintento arregla, y 18 s × 3 intentos cabe en la ruta; antes,
// uno de cada seis intentos acababa en «no he podido responder».
// La clave sale de ANTHROPIC_API_KEY (nunca del código ni de la petición).

let cliente: Anthropic | null = null;

export function clienteAnthropic(): Anthropic {
  if (!cliente) cliente = new Anthropic({ maxRetries: 2, timeout: 10_000 });
  return cliente;
}
