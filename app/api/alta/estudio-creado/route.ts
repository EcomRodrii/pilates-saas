import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { LEGAL } from '@/lib/legal-info';
import { foundingGratisEnAltas } from '@/lib/alta/founding-gratis-alta';
import { claveCuentaActiva, decidirCuentaActiva } from '@/lib/alta/cuenta-activa';
import { apuntarPaso } from '@/lib/alta/embudo-servidor';
import { correoCuentaActiva } from '@/lib/emails/tentare/alta';
import { enviarCorreoAlta } from '@/lib/emails/embudo-alta-server';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu cuenta está activa» (correo 2 del alta nueva, PR-2). Lo pide la pantalla
// de éxito de /crear-estudio nada más montar el estudio, sin esperar la
// respuesta: si no sale, el alta sigue igual.
//
// Las reglas (quién, cuándo, una vez) viven en `decidirCuentaActiva`
// (lib/alta/cuenta-activa.ts). Aquí:
//   · el estudio sale SIEMPRE de la sesión (`verificarSesionStaff`), nunca del
//     cuerpo, y el destinatario es la cuenta de la sesión, nunca uno que llegue;
//   · se manda UNA vez: el embudo (`correo_cuenta_activa`) dice si ya salió, y
//     Resend recibe una clave de idempotencia por estudio para el caso de dos
//     peticiones a la vez;
//   · con el envío hecho, se apunta en el embudo del alta (`apuntarPaso`).
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const limitado = await enforceRateLimit(req, 'alta-estudio-creado', { max: 6, windowSeconds: 600 }, sesion.studioId);
  if (limitado) return limitado;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [estudioRes, altaRes, embudoRes] = await Promise.all([
    admin.from('studios').select('nombre, slug, creado_en, owner_auth_user_id').eq('id', sesion.studioId).maybeSingle(),
    admin.from('altas_estudio').select('version').eq('auth_user_id', sesion.userId).maybeSingle(),
    admin.from('embudo_alta').select('paso').eq('studio_id', sesion.studioId).eq('paso', 'correo_cuenta_activa').limit(1),
  ]);
  if (estudioRes.error || altaRes.error || embudoRes.error) {
    return NextResponse.json({ error: 'No se pudo comprobar el estudio' }, { status: 500 });
  }
  const estudio = estudioRes.data;

  const decision = decidirCuentaActiva({
    userId: sesion.userId,
    duenoId: estudio ? (estudio.owner_auth_user_id as string | null) : undefined,
    creadoEn: estudio ? (estudio.creado_en as string | null) : undefined,
    version: (altaRes.data?.version as string | null | undefined) ?? null,
    yaEnviado: (embudoRes.data ?? []).length > 0,
    email: sesion.email,
    ahoraMs: Date.now(),
  });
  if (!decision.enviar) return NextResponse.json({ ok: true, enviado: false, motivo: decision.motivo });

  const base = (process.env.NEXT_PUBLIC_APP_URL || LEGAL.url).replace(/\/+$/, '');
  const slug = String(estudio!.slug ?? '');
  const correo = correoCuentaActiva({
    estudioNombre: String(estudio!.nombre ?? ''),
    urlPagina: `${base}/reservar/${encodeURIComponent(slug)}`,
    // Hoy la primera clase se crea en el Calendario.
    urlPrimeraClase: `${base}/calendario`,
    foundingGratis: foundingGratisEnAltas(),
  });

  const res = await enviarCorreoAlta({
    to: sesion.email!,
    asunto: correo.asunto,
    html: correo.html,
    idempotencyKey: claveCuentaActiva(sesion.studioId),
  });
  if (!res.ok) {
    // Resend sin configurar (preview, local) o un destinatario de ejemplo: nada
    // que reintentar. Lo demás se avisa sin datos de nadie.
    if (!res.skipped && !res.permanente) {
      Sentry.captureMessage('[alta] no salió «Tu cuenta está activa»', { level: 'warning', tags: { area: 'alta', error: res.error } });
    }
    return NextResponse.json({ ok: true, enviado: false, motivo: res.skipped ? 'sin_resend' : 'envio_fallido' });
  }

  await apuntarPaso(admin, sesion.studioId, 'correo_cuenta_activa', { creadoEn: estudio!.creado_en as string });
  return NextResponse.json({ ok: true, enviado: true });
}
