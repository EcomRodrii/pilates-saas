import { NextRequest, NextResponse } from 'next/server';
import { usuarioConToken } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { clientIp } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { factoresVerificados } from '@/lib/auth/doble-factor-reglas';
import { nivelAutenticacion } from '@/lib/interno/mfa';
import {
  cabeceraCookieBorrada, cabeceraCookieDispositivo, ipParaGuardar, leerCookie, nombreCookieDispositivo, nombreDispositivo, sesionDelToken,
} from '@/lib/auth/dispositivo-confianza-reglas';
import {
  huellaCuenta, listarDispositivos, quitarDispositivos, recordarDispositivo, sesionConfiada,
} from '@/lib/auth/dispositivo-confianza';

// Dispositivos de confianza de la verificación en dos pasos (reglas en
// lib/auth/dispositivo-confianza-reglas.ts):
//   POST   recuerda este navegador. Solo justo después de escribir el código
//          (sesión `aal2`): una sesión confiada no puede recordar otros.
//   GET    los de la cuenta, para verlos en Mi perfil.
//   DELETE quita uno (`?id=`) o todos. Sus sesiones vuelven a pedir el código.
// Cada persona solo ve y quita los suyos: todo filtra por su `auth_user_id`.
export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segura(req: NextRequest): boolean {
  return new URL(req.url).protocol === 'https:';
}

export async function POST(req: NextRequest) {
  const r = await usuarioConToken(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (nivelAutenticacion(r.token) !== 'aal2' || factoresVerificados(r.user.factors) === 0) {
    return NextResponse.json({ error: 'Escribe primero el código de tu app.' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { tactil?: unknown } | null;
  const cookie = nombreCookieDispositivo(huellaCuenta(r.user.id));
  try {
    const token = await recordarDispositivo(admin, {
      userId: r.user.id,
      nombre: nombreDispositivo(req.headers.get('user-agent'), body?.tactil === true),
      ip: ipParaGuardar(clientIp(req)),
      tokenActual: leerCookie(req.headers.get('cookie'), cookie),
    });
    const res = NextResponse.json({ ok: true }, { headers: SIN_CACHE });
    res.headers.append('Set-Cookie', cabeceraCookieDispositivo(cookie, token, { segura: segura(req) }));
    return res;
  } catch (e) {
    return errorInterno('auth/dispositivo-confianza:POST', e, 'No se ha podido recordar este dispositivo.');
  }
}

/** Ver y quitar dispositivos pide la sesión verificada: con el código o confiada. */
async function sesionVerificada(req: NextRequest) {
  const r = await usuarioConToken(req);
  const admin = getSupabaseAdmin();
  if (!r || !admin) return null;
  const verificada = nivelAutenticacion(r.token) === 'aal2'
    || await sesionConfiada(admin, r.user.id, sesionDelToken(r.token));
  return verificada ? { ...r, admin } : null;
}

export async function GET(req: NextRequest) {
  const s = await sesionVerificada(req);
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const cookie = nombreCookieDispositivo(huellaCuenta(s.user.id));
    const dispositivos = await listarDispositivos(s.admin, s.user.id, leerCookie(req.headers.get('cookie'), cookie));
    return NextResponse.json({ dispositivos }, { headers: SIN_CACHE });
  } catch (e) {
    return errorInterno('auth/dispositivo-confianza:GET', e);
  }
}

export async function DELETE(req: NextRequest) {
  const s = await sesionVerificada(req);
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const todos = url.searchParams.get('todos') === '1';
  if (!todos && !(id && UUID.test(id))) return NextResponse.json({ error: 'Falta qué quitar' }, { status: 400 });
  try {
    await quitarDispositivos(s.admin, s.user.id, todos ? null : id);
    const res = NextResponse.json({ ok: true }, { headers: SIN_CACHE });
    // Sin saber si era este, se borra la cookie solo al quitarlos todos; si
    // quedara una de un dispositivo quitado, la siguiente entrada la borra.
    if (todos) res.headers.append('Set-Cookie', cabeceraCookieBorrada(nombreCookieDispositivo(huellaCuenta(s.user.id)), { segura: segura(req) }));
    return res;
  } catch (e) {
    return errorInterno('auth/dispositivo-confianza:DELETE', e, 'No se ha podido quitar.');
  }
}
