import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import { LEGAL } from '@/lib/legal-info';
import { clientIp, enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarCaptcha } from '@/lib/auth/captcha-servidor';
import { CAMPO_TRAMPA, cayoEnLaTrampa } from '@/lib/auth/trampa-bots';
import { EMAIL_VALIDO, RECURSOS_DESCARGABLES, TEXTO_CONSENTIMIENTO_NOVEDADES, buzonCanonico, esSlugDescarga } from '@/lib/recursos/descargas';
import { escrituraLeadDescarga, pedirConfirmacionNovedades, type LeadExistente } from '@/lib/recursos/descargas-lead';
import { firmarTokenDescarga } from '@/lib/recursos/descargas-token';
import { correoDescarga } from '@/lib/recursos/descargas-correo';

// Una plantilla de /recursos a cambio del email (lib/recursos/descargas.ts).
//
// Orden, y por qué: límites por IP → trampa → validar → captcha → límites por
// buzón y global → GUARDAR → registrar la solicitud → enviar. Primero se guarda
// y luego se envía, igual que el concierge: un correo que falla se reenvía
// mirando la tabla; un lead que no se guardó no existe. Pero aquí, a diferencia
// del concierge, si el correo no sale SÍ es un error para la visitante: lo que
// pidió es precisamente el correo, y decirle «te la hemos enviado» sería mentirle.
//
// Este endpoint manda un correo a la dirección que se escriba, así que los topes
// no son decoración: nadie tiene que poder usarlo para llenar el buzón de otra
// persona, ni para quemar la reputación del remitente de Resend, que es el
// mismo del resto del correo del producto.

const SIN_SERVICIO = 'No hemos podido enviártela ahora mismo. Vuelve a intentarlo en un rato.';
/** Envíos al día entre todas: muy por encima de lo real, muy por debajo de un abuso. */
const TOPE_GLOBAL_DIARIO = 300;

// Nunca el objeto de error entero: el `details` de PostgREST puede llevar la
// fila (email incluido), y los logs no son sitio para datos personales.
const resumenError = (e: unknown) =>
  e && typeof e === 'object'
    ? { code: (e as { code?: unknown }).code, name: (e as { name?: unknown }).name, message: (e as { message?: unknown }).message }
    : { message: String(e) };

let avisadoTopeGlobal = false;

export async function POST(req: NextRequest) {
  const limitado =
    (await enforceRateLimit(req, 'public-descargas', { max: 5, windowSeconds: 60 })) ??
    (await enforceRateLimit(req, 'public-descargas-dia', { max: 20, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });

  // Un bot que rellena el campo invisible recibe un «sí» y no se guarda ni se
  // envía nada: decirle que lo hemos detectado solo le enseñaría a esquivarlo.
  if (cayoEnLaTrampa(body[CAMPO_TRAMPA])) return NextResponse.json({ ok: true });

  const recurso = body.recurso;
  if (!esSlugDescarga(recurso)) return NextResponse.json({ error: 'Recurso no válido' }, { status: 400 });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_VALIDO.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Escribe un email válido.' }, { status: 400 });
  }
  const estudio = typeof body.estudio === 'string' ? body.estudio.trim().slice(0, 120) || null : null;
  const novedades = body.novedades === true;

  // `verificarCaptcha` sin clave dice «ok» sin comprobar nada (a propósito, para
  // local). Aquí eso no vale en un entorno desplegado: sería un endpoint que
  // manda correos sin captcha. Se cierra.
  const desplegado = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  if (desplegado && !process.env.TURNSTILE_SECRET_KEY) {
    console.error('[public:descargas] falta TURNSTILE_SECRET_KEY: no se envía nada sin captcha');
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }
  const captcha = await verificarCaptcha(typeof body.captcha === 'string' ? body.captcha : undefined, { ip: clientIp(req) });
  if (captcha !== 'ok') {
    return NextResponse.json(
      { error: 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo; si sigue fallando, recarga la página.' },
      { status: 400 },
    );
  }

  // Como mucho tres envíos al día al mismo BUZÓN (`ana+x@…` y `ana@…` son uno).
  const porBuzon = await rateLimit(`descargas-destino:${buzonCanonico(email)}`, { max: 3, windowSeconds: 86_400 });
  if (!porBuzon.allowed) {
    return NextResponse.json(
      { error: 'Ya te la hemos enviado a este email hoy. Si no la encuentras, mira en la carpeta de spam o de promociones.' },
      { status: 429 },
    );
  }
  const global = await rateLimit('descargas-global', { max: TOPE_GLOBAL_DIARIO, windowSeconds: 86_400 });
  if (!global.allowed) {
    if (!avisadoTopeGlobal) {
      avisadoTopeGlobal = true;
      Sentry.captureMessage(`[public:descargas] tope global de ${TOPE_GLOBAL_DIARIO} envíos al día alcanzado: posible abuso`, 'warning');
    }
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });

  const { data: existente, error: errLeer } = await db
    .from('plataforma_lead')
    .select('id, recurso, consentimiento_comercial, consentimiento_confirmado_en, baja_en')
    .eq('email', email)
    .maybeSingle();
  if (errLeer) {
    console.error('[public:descargas] no se ha podido leer el lead', resumenError(errLeer));
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  const previo = (existente as LeadExistente | null) ?? null;
  const escritura = escrituraLeadDescarga(
    previo,
    { email, recurso, estudio, novedades },
    new Date().toISOString(),
    () => `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  if (escritura.tipo !== 'nada') {
    const { error } = escritura.tipo === 'insertar'
      // ignoreDuplicates: si dos envíos se cruzan, gana el primero y el segundo no lo pisa.
      ? await db.from('plataforma_lead').upsert(escritura.fila, { onConflict: 'email', ignoreDuplicates: true })
      : await db.from('plataforma_lead').update(escritura.cambios).eq('id', escritura.id);
    if (error) {
      console.error('[public:descargas] no se ha podido guardar el lead', resumenError(error));
      return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
    }
  }

  // El id real, no el que se generó: si otro envío se adelantó, manda el suyo.
  const { data: lead } = await db
    .from('plataforma_lead')
    .select('id, consentimiento_comercial')
    .eq('email', email)
    .maybeSingle();
  if (!lead) {
    console.error('[public:descargas] el lead no aparece tras guardarlo', { recurso });
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  // La solicitud va al historial solo de añadir, y el botón del correo confirma
  // ESTA solicitud y no otra.
  let solicitudId: string | null = null;
  if (pedirConfirmacionNovedades(previo, novedades)) {
    const { data: solicitud, error } = await db
      .from('plataforma_lead_consentimiento')
      .insert({ lead_id: lead.id, tipo: 'SOLICITUD', texto: TEXTO_CONSENTIMIENTO_NOVEDADES, recurso })
      .select('id')
      .single();
    if (error || !solicitud) {
      console.error('[public:descargas] no se ha podido registrar la solicitud', resumenError(error));
      return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
    }
    solicitudId = solicitud.id as string;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    console.error('[public:descargas] sin RESEND_API_KEY: la plantilla no se puede enviar');
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  const ficha = RECURSOS_DESCARGABLES[recurso];
  let enlaces;
  try {
    const url = (token: string) => `${LEGAL.url}/api/public/descargas/${token}`;
    enlaces = {
      descarga: url(firmarTokenDescarga({ alcance: 'descarga', leadId: lead.id, recurso })),
      ...(solicitudId ? { novedades: url(firmarTokenDescarga({ alcance: 'novedades', leadId: lead.id, solicitudId })) } : {}),
      ...(lead.consentimiento_comercial ? { baja: url(firmarTokenDescarga({ alcance: 'baja', leadId: lead.id })) } : {}),
      guia: `${LEGAL.url}${ficha.guia}`,
    };
  } catch (err) {
    console.error('[public:descargas] no se han podido firmar los enlaces', resumenError(err));
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  const { asunto, html, texto } = correoDescarga(ficha, enlaces);
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [email],
      replyTo: LEGAL.email,
      subject: asunto,
      html,
      text: texto,
    });
    if (error) {
      console.error('[public:descargas] Resend rechazó el envío', resumenError(error));
      return NextResponse.json({ error: SIN_SERVICIO }, { status: 502 });
    }
  } catch (err) {
    console.error('[public:descargas] no se ha podido enviar el correo', resumenError(err));
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
