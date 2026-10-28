import { NextRequest } from 'next/server';
import { clientIp, enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarCaptcha } from '@/lib/auth/captcha-servidor';
import { CAMPO_TRAMPA, cayoEnLaTrampa } from '@/lib/auth/trampa-bots';
import { TEXTO_CONSENTIMIENTO_NOVEDADES } from '@/lib/recursos/descargas';
import { buzonDeDemo, validarDatosDemo } from '@/lib/demo/lead';
import { escrituraLeadDemo, type LeadExistenteDemo } from '@/lib/demo/lead-escritura';
import { firmarSesionDemo, nuevoSid } from '@/lib/demo/sesion';
import { demoApagada, SIN_SERVICIO, json, leerCuerpo, resumenError } from '@/lib/demo/api-servidor';

// Entrada a la demo: guarda el lead y devuelve la sesión.
//
// Orden, y por qué: límites por IP → trampa → validar → captcha → límites por
// buzón y global → guardar → firmar. Primero se guarda y luego se da la sesión:
// un lead que no se guardó no existe, y si la base de datos falla la persona
// recibe un error recuperable (su formulario sigue intacto en el navegador).
//
// Lo que NO es un requisito para entrar: la casilla comercial (opcional y
// desmarcada), aceptar condiciones (la demo no crea cuenta ni contrato) ni
// ninguna analítica (esta ruta no depende de ninguna).
//
// No manda ningún correo, así que el abuso que cuesta dinero no está aquí sino
// en los turnos con la IA (ruta /tenti, con sus propios topes).

const TOPE_GLOBAL_DIARIO = 400;
let avisadoTope = false;

export async function POST(req: NextRequest) {
  const apagada = demoApagada();
  if (apagada) return apagada;
  const limitado =
    (await enforceRateLimit(req, 'demo-iniciar', { max: 6, windowSeconds: 60 })) ??
    (await enforceRateLimit(req, 'demo-iniciar-dia', { max: 30, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = await leerCuerpo(req);
  if (!body) return json({ error: 'Petición no válida' }, 400);

  // Un bot que rellena el campo invisible recibe un «sí» sin nada dentro: ni se guarda ni se le dice que se le ha detectado.
  if (cayoEnLaTrampa(body[CAMPO_TRAMPA])) return json({ ok: true });

  const v = validarDatosDemo(body);
  if (!v.ok) return json({ error: 'Revisa los campos marcados.', errores: v.errores }, 400);
  const { datos } = v;

  // Sin TURNSTILE_SECRET_KEY `verificarCaptcha` dice «ok» sin comprobar nada. Aquí es
  // aceptable (a diferencia de /descargas, esta ruta no manda correo), y las otras
  // barreras —trampa, topes por IP, buzón y global— siguen activas.
  const captcha = await verificarCaptcha(typeof body.captcha === 'string' ? body.captcha : undefined, { ip: clientIp(req) });
  if (captcha !== 'ok') {
    return json({ error: 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo; si sigue fallando, recarga la página.' }, 400);
  }

  const porBuzon = await rateLimit(`demo-buzon:${buzonDeDemo(datos.email)}`, { max: 8, windowSeconds: 86_400 });
  if (!porBuzon.allowed) return json({ error: 'Ya has pedido varias demos hoy con este correo. Vuelve mañana o escríbenos.' }, 429);
  const global = await rateLimit('demo-global', { max: TOPE_GLOBAL_DIARIO, windowSeconds: 86_400 });
  if (!global.allowed) {
    if (!avisadoTope) {
      avisadoTope = true;
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`[demo] tope global de ${TOPE_GLOBAL_DIARIO} entradas al día alcanzado: posible abuso`, 'warning');
    }
    return json({ error: SIN_SERVICIO }, 503);
  }

  const db = getSupabaseAdmin();
  if (!db) return json({ error: SIN_SERVICIO }, 503);

  const { data: existente, error: errLeer } = await db
    .from('plataforma_lead')
    .select('id, consentimiento_comercial, consentimiento_confirmado_en, baja_en')
    .eq('email', datos.email)
    .maybeSingle();
  if (errLeer) {
    console.error('[demo:iniciar] no se ha podido leer el lead', resumenError(errLeer));
    return json({ error: SIN_SERVICIO }, 503);
  }

  const escritura = escrituraLeadDemo(
    (existente as LeadExistenteDemo | null) ?? null,
    datos,
    new Date().toISOString(),
    () => `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  let leadId = escritura.id;
  let nuevo = false;
  if (escritura.tipo === 'insertar') {
    // ignoreDuplicates: si dos envíos se cruzan, gana el primero. Y entonces este NO es el lead «nuevo»: no se le escribe después.
    const { error } = await db.from('plataforma_lead').upsert({ id: escritura.id, ...escritura.fila }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      console.error('[demo:iniciar] no se ha podido guardar el lead', resumenError(error));
      return json({ error: SIN_SERVICIO }, 503);
    }
    const { data: real } = await db.from('plataforma_lead').select('id').eq('email', datos.email).maybeSingle();
    if (!real) {
      console.error('[demo:iniciar] el lead no aparece tras guardarlo');
      return json({ error: SIN_SERVICIO }, 503);
    }
    leadId = real.id as string;
    nuevo = leadId === escritura.id;
  } else if (escritura.tipo === 'actualizar') {
    const { error } = await db.from('plataforma_lead').update(escritura.cambios).eq('id', escritura.id);
    if (error) {
      console.error('[demo:iniciar] no se ha podido anotar el permiso', resumenError(error));
      return json({ error: SIN_SERVICIO }, 503);
    }
  }

  if ((escritura.tipo === 'insertar' && escritura.solicitud && nuevo) || escritura.tipo === 'actualizar') {
    const { error } = await db.from('plataforma_lead_consentimiento')
      .insert({ lead_id: leadId, tipo: 'SOLICITUD', texto: TEXTO_CONSENTIMIENTO_NOVEDADES, recurso: 'demo-personalizada' });
    // Un fallo aquí no tumba la demo: el permiso queda pendiente igualmente y no cuenta hasta confirmarse.
    if (error) console.error('[demo:iniciar] no se ha podido registrar la solicitud', resumenError(error));
  }

  const sesion = firmarSesionDemo({ sid: nuevoSid(), leadId, nuevo, tipoCentro: datos.tipoCentro });
  return json({ ok: true, sesion, tipoCentro: datos.tipoCentro });
}
