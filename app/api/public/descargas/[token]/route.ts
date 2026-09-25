import { NextRequest, NextResponse } from 'next/server';
import { LEGAL } from '@/lib/legal-info';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { RECURSOS_DESCARGABLES, esSlugDescarga } from '@/lib/recursos/descargas';
import { verificarTokenDescarga, type DatosTokenDescarga } from '@/lib/recursos/descargas-token';
import { paginaDescargas } from '@/lib/recursos/descargas-correo';

// Los tres enlaces del correo de descarga (lib/recursos/descargas-token.ts):
//
//   · `descarga`  → GET redirige al archivo y apunta la primera vez que se abrió
//     el enlace (`descargado_en`). Es orientativo: los antivirus de correo
//     también lo abren, y el archivo es público de todas formas.
//   · `novedades` / `baja` → GET enseña una página con un BOTÓN, y el cambio lo
//     hace el POST de ese botón. Nunca al abrir el enlace: los antivirus de
//     correo de muchas empresas abren todos los enlaces de un mensaje para
//     analizarlos, y confirmarían un permiso que nadie ha dado.
//
// Cada cambio de permiso se apunta PRIMERO en el historial solo de añadir
// (`plataforma_lead_consentimiento`) y después en el estado del lead: si lo
// segundo fallara, la prueba de lo que pidió la persona ya está guardada.
//
// La autorización es el propio token firmado: quien no tiene el correo no
// tiene el enlace. Por eso estas respuestas llevan `Referrer-Policy:
// no-referrer`: el «volver a las guías» no debe regalar la URL con el token a
// la analítica de /recursos.

type Contexto = { params: Promise<{ token: string }> };

const VOLVER = { url: `${LEGAL.url}/recursos`, texto: 'Ir a las guías de Tentare' };

const resumenError = (e: unknown) =>
  e && typeof e === 'object'
    ? { code: (e as { code?: unknown }).code, message: (e as { message?: unknown }).message }
    : { message: String(e) };

function html(status: number, pagina: string) {
  return new NextResponse(pagina, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  });
}

const CADUCADO = () =>
  html(410, paginaDescargas({
    titulo: 'Este enlace ya no funciona',
    texto: 'Los enlaces de descarga duran 30 días. Vuelve a pedir la plantilla en la guía y te llegará otro al momento.',
    volver: VOLVER,
  }));

const FALLO = () =>
  html(503, paginaDescargas({
    titulo: 'No ha funcionado',
    texto: 'Algo ha fallado de nuestro lado. Vuelve a abrir el enlace del correo en un rato.',
    volver: VOLVER,
  }));

const NO_ESTA = () =>
  html(200, paginaDescargas({
    titulo: 'No tenemos tu email',
    texto: 'Tu email ya no está en nuestra lista, así que no te escribiremos.',
    volver: VOLVER,
  }));

async function leerToken(ctx: Contexto): Promise<DatosTokenDescarga | null | 'fallo'> {
  const { token } = await ctx.params;
  try {
    return verificarTokenDescarga(token);
  } catch (err) {
    // Sin secreto configurado no se puede comprobar nada: es nuestro fallo, no
    // un enlace caducado, y decírselo así sería mentirle.
    console.error('[public:descargas] no se puede verificar el enlace', resumenError(err));
    return 'fallo';
  }
}

export async function GET(req: NextRequest, ctx: Contexto) {
  const limitado = await enforceRateLimit(req, 'public-descargas-enlace', { max: 30, windowSeconds: 60 });
  if (limitado) return limitado;

  const datos = await leerToken(ctx);
  if (datos === 'fallo') return FALLO();
  if (!datos) return CADUCADO();

  if (datos.alcance === 'descarga') {
    if (!esSlugDescarga(datos.recurso)) return CADUCADO();
    const db = getSupabaseAdmin();
    if (db) {
      // Orientativo. Si falla, la descarga sigue: no se le niega el archivo a
      // nadie por no poder apuntarlo.
      const { error } = await db
        .from('plataforma_lead')
        .update({ descargado_en: new Date().toISOString() })
        .eq('id', datos.leadId)
        .is('descargado_en', null);
      if (error) console.error('[public:descargas] no se ha podido apuntar la descarga', resumenError(error));
    }
    const res = NextResponse.redirect(new URL(RECURSOS_DESCARGABLES[datos.recurso].archivo, LEGAL.url), 302);
    res.headers.set('referrer-policy', 'no-referrer');
    return res;
  }

  const accion = { url: req.nextUrl.pathname };
  if (datos.alcance === 'novedades') {
    return html(200, paginaDescargas({
      titulo: 'Confirma que quieres recibir novedades',
      texto: 'Te escribiremos con novedades y guías de Tentare para llevar tu estudio. Podrás darte de baja en cualquier momento.',
      accion: { ...accion, etiqueta: 'Sí, quiero recibirlas' },
      volver: VOLVER,
    }));
  }
  return html(200, paginaDescargas({
    titulo: '¿Te damos de baja?',
    texto: 'Dejarás de recibir novedades y guías de Tentare por email.',
    accion: { ...accion, etiqueta: 'Sí, darme de baja' },
    volver: VOLVER,
  }));
}

export async function POST(req: NextRequest, ctx: Contexto) {
  const limitado = await enforceRateLimit(req, 'public-descargas-enlace', { max: 30, windowSeconds: 60 });
  if (limitado) return limitado;

  const datos = await leerToken(ctx);
  if (datos === 'fallo') return FALLO();
  if (!datos || datos.alcance === 'descarga') return CADUCADO();

  const db = getSupabaseAdmin();
  if (!db) return FALLO();
  const ahora = new Date().toISOString();

  if (datos.alcance === 'novedades') {
    // Se confirma LA solicitud del enlace, con su texto y su fecha.
    const { data: solicitud, error: errLeer } = await db
      .from('plataforma_lead_consentimiento')
      .select('id, texto, creado_en')
      .eq('id', datos.solicitudId!)
      .eq('lead_id', datos.leadId)
      .eq('tipo', 'SOLICITUD')
      .maybeSingle();
    if (errLeer) {
      console.error('[public:descargas] no se ha podido leer la solicitud', resumenError(errLeer));
      return FALLO();
    }
    if (!solicitud) return NO_ESTA();

    const { error: errEvento } = await db
      .from('plataforma_lead_consentimiento')
      .insert({ lead_id: datos.leadId, tipo: 'CONFIRMACION', solicitud_id: solicitud.id });
    if (errEvento) {
      console.error('[public:descargas] no se ha podido registrar la confirmación', resumenError(errEvento));
      return FALLO();
    }
    const { data: filas, error } = await db
      .from('plataforma_lead')
      .update({
        consentimiento_comercial: true,
        consentimiento_texto: solicitud.texto,
        consentimiento_en: solicitud.creado_en,
        consentimiento_confirmado_en: ahora,
        actualizado_en: ahora,
      })
      .eq('id', datos.leadId)
      .select('id');
    if (error) {
      console.error('[public:descargas] no se ha podido confirmar el permiso', resumenError(error));
      return FALLO();
    }
    if (!filas?.length) return NO_ESTA();
    return html(200, paginaDescargas({
      titulo: 'Listo, te escribiremos',
      texto: 'Recibirás novedades y guías de Tentare para llevar tu estudio. Si cambias de idea, puedes darte de baja en cualquier momento.',
      volver: VOLVER,
    }));
  }

  // Baja: se apunta en el historial y se quita el permiso vigente. El texto y la
  // fecha de lo que aceptó se quedan: son la prueba de lo que pasó antes.
  const { error: errEvento } = await db
    .from('plataforma_lead_consentimiento')
    .insert({ lead_id: datos.leadId, tipo: 'BAJA' });
  if (errEvento) {
    // 23503: el lead ya no existe (se borró), así que no hay nada a lo que escribir.
    if ((errEvento as { code?: string }).code === '23503') return NO_ESTA();
    console.error('[public:descargas] no se ha podido registrar la baja', resumenError(errEvento));
    return FALLO();
  }
  const { data: filas, error } = await db
    .from('plataforma_lead')
    .update({ consentimiento_comercial: false, baja_en: ahora, actualizado_en: ahora })
    .eq('id', datos.leadId)
    .select('id');
  if (error) {
    console.error('[public:descargas] no se ha podido dar de baja', resumenError(error));
    return FALLO();
  }
  if (!filas?.length) return NO_ESTA();
  return html(200, paginaDescargas({
    titulo: 'Te hemos dado de baja',
    texto: 'No te enviaremos más novedades de Tentare.',
    volver: VOLVER,
  }));
}
