import { NextRequest, NextResponse } from 'next/server';
import { usuarioConToken } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { factoresVerificados } from '@/lib/auth/doble-factor-reglas';
import { nivelAutenticacion } from '@/lib/interno/mfa';
import { reabrirCorreo } from '@/lib/auth/codigo-correo';

// Tras pasar la app de autenticación (`aal2` de verdad, nunca una sesión
// confiada): el correo vuelve a valer como segundo paso si se había cerrado
// por un cambio de contraseña o de correo (migr 20261003160000). Lo llama
// /verificar-acceso justo después de verificar con la app; si falla, la
// próxima vez se vuelve a pedir la app, nada más.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const r = await usuarioConToken(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (nivelAutenticacion(r.token) !== 'aal2' || factoresVerificados(r.user.factors) === 0) {
    return NextResponse.json({ error: 'Escribe primero el código de tu app.' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    await reabrirCorreo(admin, r.user.id);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorInterno('auth/doble-factor-correo/reabrir:POST', e);
  }
}
