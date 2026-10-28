// Las llamadas de la pantalla de la demo a sus rutas. Solo TIPOS de lo que viene
// del servidor (`import type`): el motor y el catálogo se quedan fuera del
// JavaScript del navegador.
import type { DemoGenerada } from './modelo.ts';
import type { MensajeHistorial, TurnoTenti } from './tenti.ts';
import type { RespuestaEvaluacion } from './evaluacion.ts';
import type { CampoDemo } from './lead.ts';

export type ResultadoApi<T> =
  | { ok: true; datos: T }
  | { ok: false; mensaje: string; codigo?: string; errores?: Partial<Record<CampoDemo, string>>; sesionCaducada?: boolean };

const SIN_RED = 'No hemos podido conectar. Revisa tu conexión y vuelve a intentarlo; lo que has escrito sigue aquí.';

async function llamar<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<ResultadoApi<T>> {
  let r: Response;
  try {
    r = await fetch(`/api/public/demo/${ruta}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
  } catch {
    return { ok: false, mensaje: SIN_RED };
  }
  const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (!r.ok) {
    return {
      ok: false,
      mensaje: typeof json?.error === 'string' ? json.error : 'No hemos podido continuar. Vuelve a intentarlo.',
      codigo: typeof json?.codigo === 'string' ? json.codigo : undefined,
      errores: (json?.errores as Partial<Record<CampoDemo, string>> | undefined) ?? undefined,
      sesionCaducada: r.status === 401,
    };
  }
  return { ok: true, datos: (json ?? {}) as T };
}

export const iniciarDemo = (cuerpo: Record<string, unknown>) =>
  llamar<{ ok: true; sesion?: string; tipoCentro?: string }>('iniciar', cuerpo);

export const turnoDeTenti = (sesion: string, historial: MensajeHistorial[]) =>
  llamar<{ turno: TurnoTenti }>('tenti', { sesion, historial });

export const ejecutarDemo = (sesion: string, escenario: string, parametros: unknown) =>
  llamar<{ demo: DemoGenerada; escenario: string }>('ejecutar', { sesion, escenario, parametros });

export const evaluarDemo = (sesion: string, respuesta: RespuestaEvaluacion, escenario: string | null) =>
  llamar<{ ok: true; siguiente: RespuestaEvaluacion }>('evaluar', { sesion, respuesta, escenario });
