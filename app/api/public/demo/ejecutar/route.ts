import { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { construirDemo, esIdEscenario } from '@/lib/demo/catalogo';
import { CENTROS } from '@/lib/demo/centros';
import { demoApagada, exigirSesion, json, leerCuerpo } from '@/lib/demo/api-servidor';

// «Volver a ejecutar», retomar una demo y elegir un escenario del catálogo sin
// IA. Recibe SOLO `escenario + parametros` y los valida otra vez contra el
// catálogo: lo que llegue del navegador nunca se da por bueno (el navegador
// guarda la propuesta para poder volver, pero no es una fuente de confianza).
//
// No lee ni escribe ninguna tabla: la demo es una función pura de sus
// parámetros. Por eso no puede tocar datos reales, cobrar ni enviar nada.
export async function POST(req: NextRequest) {
  const apagada = demoApagada();
  if (apagada) return apagada;
  const limitado = await enforceRateLimit(req, 'demo-ejecutar', { max: 60, windowSeconds: 3600 });
  if (limitado) return limitado;
  const body = await leerCuerpo(req);
  if (!body) return json({ error: 'Petición no válida' }, 400);
  const s = exigirSesion(body);
  if ('respuesta' in s) return s.respuesta;

  if (!esIdEscenario(body.escenario)) return json({ error: 'Esa demo no existe.', codigo: 'escenario' }, 400);
  const r = construirDemo(body.escenario, body.parametros ?? {}, CENTROS[s.sesion.tipoCentro].contexto);
  if (!r.ok) return json({ error: 'Esa demo no se puede preparar con esos datos.', codigo: r.motivo }, 400);
  return json({ demo: r.valor, escenario: body.escenario });
}
