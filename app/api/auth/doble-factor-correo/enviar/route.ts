import { NextRequest, NextResponse } from 'next/server';
import { usuarioConToken } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { secretoRateLimit } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';
import { factoresVerificados } from '@/lib/auth/doble-factor-reglas';
import { nivelAutenticacion } from '@/lib/interno/mfa';
import { sesionDelToken } from '@/lib/auth/dispositivo-confianza-reglas';
import {
  MAX_ENVIOS_POR_VENTANA, motivoAntesDeLaBd, textoSinCorreo, VENTANA_ENVIOS_SEGUNDOS, type MotivoSinCorreo,
} from '@/lib/auth/codigo-correo-reglas';
import { anularCodigo, pedirCodigo } from '@/lib/auth/codigo-correo';
import { enviarEmailCodigoAcceso } from '@/lib/emails/codigo-acceso-server';
import { rebotesDeEmails } from '@/lib/emails/rebotes-consulta';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { resolverStudioPorSlug, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { instructoraActivaEnEstudio } from '@/lib/auth-instructora';

// El segundo paso por correo (lib/auth/codigo-correo-reglas.ts): manda el
// código al correo DE LA CUENTA (el de `getUser`; nunca uno que llegue en el
// cuerpo). Contesta a una sesión `aal1` a propósito, y no da ningún dato:
//   { enviado: true }                  salió un correo
//   { enviado: false, yaEnviado: true } hay uno vivo y no se pidió otro
//   { enviado: false, espera: n }       el botón, antes de 30 s
//   { disponible: false, mensaje }      el correo no sirve aquí: a la app
// Body: { reenviar?: boolean, slug?: string }. `reenviar`: el botón «Reenviar»
// (al abrir la pantalla, no). `slug`: desde la app de un estudio, el correo va
// con SU marca — solo si la cuenta es alumna o instructora de ese estudio; si
// no, la de Tentare. El slug no cambia nunca a quién se envía: siempre al
// correo de la cuenta.
export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

function aLaApp(motivo: MotivoSinCorreo) {
  return NextResponse.json({ disponible: false, motivo, mensaje: textoSinCorreo(motivo) }, { headers: SIN_CACHE });
}

export async function POST(req: NextRequest) {
  const r = await usuarioConToken(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sessionId = sesionDelToken(r.token);
  const email = r.user.email ?? null;
  const antes = motivoAntesDeLaBd({
    nivel: nivelAutenticacion(r.token), factoresVerificados: factoresVerificados(r.user.factors), sesion: sessionId, email,
  });
  if (antes) return aLaApp(antes);

  const admin = getSupabaseAdmin();
  // Sin secreto no se guarda un código que se pueda sacar de un volcado: a la vista, a la app.
  const secreto = secretoRateLimit(process.env);
  if (!admin || !secreto) return aLaApp('sin_envio');
  if (esDominioReservado(email)) return aLaApp('buzon_rebota');

  const body = await req.json().catch(() => null) as { reenviar?: unknown; slug?: unknown } | null;
  const reenviar = body?.reenviar === true;
  const slug = typeof body?.slug === 'string' && body.slug.length <= 120 ? body.slug : null;
  try {
    // Un buzón que rebota no recibirá nada: decirlo ya, no «te lo hemos enviado».
    // Si la lectura falla, se intenta igual: solo decide qué pantalla ver.
    const rotos = await rebotesDeEmails(admin, [email]).catch(() => new Map());
    if (rotos.size > 0) return aLaApp('buzon_rebota');

    const p = await pedirCodigo(admin, { userId: r.user.id, sessionId: sessionId as string, secreto, reenviar });
    if ('motivo' in p) return aLaApp(p.motivo);
    if ('yaEnviado' in p) return NextResponse.json({ enviado: false, yaEnviado: true }, { headers: SIN_CACHE });
    if ('espera' in p) return NextResponse.json({ enviado: false, espera: p.espera }, { headers: SIN_CACHE });

    // El límite por cuenta se cuenta solo cuando de verdad va a salir un correo.
    const limite = await rateLimit(`2fa-correo-envio:${r.user.id}`, { max: MAX_ENVIOS_POR_VENTANA, windowSeconds: VENTANA_ENVIOS_SEGUNDOS });
    if (!limite.allowed) {
      await anularCodigo(admin, r.user.id, sessionId as string);
      return NextResponse.json(
        { error: 'Has pedido demasiados códigos. Espera unos minutos o usa tu app de autenticación.' },
        { status: 429, headers: SIN_CACHE },
      );
    }
    const studioId = slug ? await estudioDeLaCuenta(admin, slug, r.user.id) : null;
    const envio = await enviarEmailCodigoAcceso({ to: email as string, codigo: p.codigo, studioId });
    if (!envio.ok) {
      await anularCodigo(admin, r.user.id, sessionId as string);
      return aLaApp('sin_envio');
    }
    return NextResponse.json({ enviado: true }, { headers: SIN_CACHE });
  } catch (e) {
    return errorInterno('auth/doble-factor-correo/enviar:POST', e, 'No se ha podido enviar el código.');
  }
}

/** El estudio del slug, solo si esta cuenta es alumna o instructora activa suya. */
async function estudioDeLaCuenta(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, slug: string, userId: string): Promise<string | null> {
  try {
    const resuelto = await resolverStudioPorSlug(admin as never, slug);
    const studioId = (resuelto?.row as { id?: string } | undefined)?.id;
    if (!studioId) return null;
    if (await socioAutenticado(userId, studioId)) return studioId;
    if (await instructoraActivaEnEstudio(admin, userId, studioId)) return studioId;
    return null;
  } catch {
    // Sin poder comprobarlo, la marca de Tentare: el correo sale igual.
    return null;
  }
}
