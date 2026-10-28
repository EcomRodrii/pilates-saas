import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { alternativas, sanearHistorial, siguienteTurno } from '@/lib/demo/tenti';
import { CENTROS } from '@/lib/demo/centros';
import { modeloDeLaDemo } from '@/lib/demo/tenti-servidor';
import { demoApagada, exigirSesion, json, leerCuerpo } from '@/lib/demo/api-servidor';

// Un turno de Tenti. Lo que dice la persona entra al modelo como DATO; lo que
// responde el modelo se valida contra el catálogo (lib/demo/tenti.ts) antes de
// salir de aquí, y nada se ejecuta que no sea una función del catálogo.
//
// Topes de coste, de más fino a más grueso: por sesión (12 turnos/hora), por IP
// y global al día. Pasar el tope de sesión o el global NO deja a nadie sin demo:
// se le devuelven los escenarios del catálogo (`degradado`).
export const maxDuration = 40;

const TOPE_GLOBAL_DIARIO = 2500;
let avisadoTope = false;

export async function POST(req: NextRequest) {
  const apagada = demoApagada();
  if (apagada) return apagada;
  const limitado = await enforceRateLimit(req, 'demo-tenti-ip', { max: 40, windowSeconds: 3600 });
  if (limitado) return limitado;

  const body = await leerCuerpo(req);
  if (!body) return json({ error: 'Petición no válida' }, 400);
  const s = exigirSesion(body);
  if ('respuesta' in s) return s.respuesta;
  const { sesion } = s;

  const alternativasSinIa = () => alternativas(undefined, CENTROS[sesion.tipoCentro].primero);

  const porSesion = await rateLimit(`demo-tenti-sid:${sesion.sid}`, { max: 12, windowSeconds: 3600 });
  if (!porSesion.allowed) {
    return json({ turno: { tipo: 'degradado', motivo: 'limite', texto: 'Hemos hablado mucho por hoy. Elige una de estas demos y la vemos:', alternativas: alternativasSinIa() } });
  }
  const global = await rateLimit('demo-tenti-global', { max: TOPE_GLOBAL_DIARIO, windowSeconds: 86_400 });
  if (!global.allowed) {
    if (!avisadoTope) {
      avisadoTope = true;
      Sentry.captureMessage(`[demo] tope global de ${TOPE_GLOBAL_DIARIO} turnos de Tenti al día alcanzado: posible abuso`, 'warning');
    }
    return json({ turno: { tipo: 'degradado', motivo: 'limite', texto: 'Ahora mismo no puedo atender más preguntas. Estas son las demos que puedo enseñarte:', alternativas: alternativasSinIa() } });
  }

  const turno = await siguienteTurno(
    { historial: sanearHistorial(body.historial), tipoCentro: sesion.tipoCentro },
    modeloDeLaDemo,
    // Sin texto de la persona ni del modelo: solo qué falló.
    (suceso, detalle) => Sentry.captureMessage(`[demo] Tenti: ${suceso} (${detalle})`, { level: 'warning', tags: { area: 'demo-tenti', suceso } }),
  );
  return json({ turno });
}
