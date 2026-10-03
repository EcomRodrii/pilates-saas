import { NextRequest, NextResponse } from 'next/server';
import { usuarioConToken } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { clientIp } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { factoresVerificados } from '@/lib/auth/doble-factor-reglas';
import { nivelAutenticacion } from '@/lib/interno/mfa';
import {
  cabeceraCookieBorrada, cabeceraCookieDispositivo, ipParaGuardar, leerCookie, nombreCookieDispositivo, sesionDelToken,
} from '@/lib/auth/dispositivo-confianza-reglas';
import { huellaCuenta, usarDispositivo } from '@/lib/auth/dispositivo-confianza';

// El navegador presenta su dispositivo recordado para que ESTA sesión cuente
// como verificada sin escribir el código (lib/auth/dispositivo-confianza.ts).
// Lo llaman el login, antes de ir al panel, y el panel al arrancar; con la
// sesión ya confiada solo alarga el dispositivo («30 días desde el último uso»).
//
// Contesta a una sesión `aal1` a propósito (es su razón de ser) y no da ningún
// dato: solo `{ confiada, nueva }`.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const r = await usuarioConToken(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sinCache = { 'Cache-Control': 'no-store' };
  // Ya verificada con el código, o sin verificación activada: nada que hacer.
  if (nivelAutenticacion(r.token) === 'aal2' || factoresVerificados(r.user.factors) === 0) {
    return NextResponse.json({ confiada: false, nueva: false }, { headers: sinCache });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cookie = nombreCookieDispositivo(huellaCuenta(r.user.id));
  const token = leerCookie(req.headers.get('cookie'), cookie);
  try {
    const u = await usarDispositivo(admin, {
      userId: r.user.id, sessionId: sesionDelToken(r.token), token, ip: ipParaGuardar(clientIp(req)),
    });
    const res = NextResponse.json({ confiada: u.confiada, nueva: u.nueva }, { headers: sinCache });
    const opciones = { segura: new URL(req.url).protocol === 'https:' };
    // La cookie dura lo mismo que el dispositivo (cada uso la alarga) y su token
    // rota al confiar una sesión nueva.
    if (u.cookie === 'borrar') res.headers.append('Set-Cookie', cabeceraCookieBorrada(cookie, opciones));
    else if (u.cookie) res.headers.append('Set-Cookie', cabeceraCookieDispositivo(cookie, u.cookie.poner, opciones));
    return res;
  } catch (e) {
    return errorInterno('auth/dispositivo-confianza/usar:POST', e);
  }
}
