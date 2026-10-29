import { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { esIdEscenario } from '@/lib/demo/catalogo';
import { anadirNota } from '@/lib/demo/lead-escritura';
import { RESPUESTAS_EVALUACION, esRespuestaEvaluacion, esUtilidad, notaDeEvaluacion } from '@/lib/demo/evaluacion';
import { demoApagada, exigirSesion, json, leerCuerpo, resumenError } from '@/lib/demo/api-servidor';

// «¿Hemos resuelto tu duda?». Cada respuesta tiene su salida; ninguna se da por
// resuelta sola. Si fue «sí», se devuelve el destino del alta, y NO se crea
// ningún estudio: la cuenta nace en el alta de siempre, con su correo
// verificado y su captcha.
//
// Qué se anota y a quién: solo en el lead que CREÓ esta sesión (`nuevo`), nunca
// en uno que ya existía (el correo no está verificado: no se le escribe a
// alguien que no ha pedido nada). Y solo estructura —centro, escenario, qué
// respondió—, nunca el texto libre de la persona.
export async function POST(req: NextRequest) {
  const apagada = demoApagada();
  if (apagada) return apagada;
  const limitado = await enforceRateLimit(req, 'demo-evaluar', { max: 30, windowSeconds: 3600 });
  if (limitado) return limitado;
  const body = await leerCuerpo(req);
  if (!body) return json({ error: 'Petición no válida' }, 400);
  const s = exigirSesion(body);
  if ('respuesta' in s) return s.respuesta;
  const { sesion } = s;

  if (!esRespuestaEvaluacion(body.respuesta)) {
    return json({ error: `Respuesta no válida. Opciones: ${RESPUESTAS_EVALUACION.join(', ')}.` }, 400);
  }
  const escenario = esIdEscenario(body.escenario) ? body.escenario : null;
  const respuesta = body.respuesta;
  const utilidad = esUtilidad(body.utilidad) ? body.utilidad : undefined;

  let anotado = false;
  if (sesion.nuevo) {
    const db = getSupabaseAdmin();
    if (db) {
      const { data: lead, error } = await db.from('plataforma_lead').select('notas').eq('id', sesion.leadId).maybeSingle();
      if (!error && lead) {
        const { error: errEscribir } = await db.from('plataforma_lead')
          .update({ notas: anadirNota((lead.notas as string | null) ?? null, notaDeEvaluacion(sesion.tipoCentro, escenario, respuesta, utilidad)), actualizado_en: new Date().toISOString() })
          .eq('id', sesion.leadId);
        anotado = !errEscribir;
        if (errEscribir) console.error('[demo:evaluar] no se ha podido anotar', resumenError(errEscribir));
      } else if (error) {
        console.error('[demo:evaluar] no se ha podido leer el lead', resumenError(error));
      }
    }
  }
  // Que no se pudiera anotar no cambia lo que ve la persona: la evaluación es suya, no del CRM.
  return json({ ok: true, siguiente: respuesta, anotado });
}
