import { NextRequest, NextResponse } from 'next/server';
import { usuarioConToken } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { secretoRateLimit } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';
import { factoresVerificados } from '@/lib/auth/doble-factor-reglas';
import { nivelAutenticacion } from '@/lib/interno/mfa';
import {
  cabeceraCookieDispositivo, ipParaGuardar, leerCookie, nombreCookieDispositivo, nombreDispositivo, sesionDelToken,
} from '@/lib/auth/dispositivo-confianza-reglas';
import { huellaCuenta, recordarDispositivo } from '@/lib/auth/dispositivo-confianza';
import {
  MAX_VERIFICACIONES_POR_VENTANA, motivoAntesDeLaBd, textoResultadoCodigo, textoSinCorreo, VENTANA_ENVIOS_SEGUNDOS,
} from '@/lib/auth/codigo-correo-reglas';
import { comprobarCodigo } from '@/lib/auth/codigo-correo';

// Comprueba el código del correo (lib/auth/codigo-correo.ts). Si es el bueno,
// ESTA sesión queda confiada (origen 'correo'): la base de datos y
// `verificarSesionStaff` la aceptan como si hubiera pasado la app.
// Body: { codigo: '123456', recordar?: boolean, tactil?: boolean }.
// `recordar` recuerda además el navegador («no volver a pedir el código»), igual
// que tras la app; se hace aquí y no en /api/auth/dispositivo-confianza, que
// exige `aal2` para que una sesión confiada no pueda recordar otros navegadores.
export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  const r = await usuarioConToken(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sessionId = sesionDelToken(r.token);
  const antes = motivoAntesDeLaBd({
    nivel: nivelAutenticacion(r.token), factoresVerificados: factoresVerificados(r.user.factors), sesion: sessionId, email: r.user.email,
  });
  if (antes) return NextResponse.json({ ok: false, aLaApp: true, error: textoSinCorreo(antes) }, { status: 409, headers: SIN_CACHE });
  const admin = getSupabaseAdmin();
  const secreto = secretoRateLimit(process.env);
  if (!admin || !secreto) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Además del tope por código: por cuenta, sumando todos sus códigos y sesiones.
  const limite = await rateLimit(`2fa-correo-verificar:${r.user.id}`, { max: MAX_VERIFICACIONES_POR_VENTANA, windowSeconds: VENTANA_ENVIOS_SEGUNDOS });
  if (!limite.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Demasiados intentos. Espera unos minutos o usa tu app de autenticación.' },
      { status: 429, headers: SIN_CACHE },
    );
  }

  const body = await req.json().catch(() => null) as { codigo?: unknown; recordar?: unknown; tactil?: unknown } | null;
  try {
    const resultado = await comprobarCodigo(admin, { userId: r.user.id, sessionId: sessionId as string, codigo: body?.codigo, secreto });
    if (resultado === 'no_disponible') {
      return NextResponse.json({ ok: false, aLaApp: true, error: 'El código por correo ya no vale para esta sesión. Usa tu app de autenticación.' }, { status: 409, headers: SIN_CACHE });
    }
    if (resultado !== 'ok') {
      return NextResponse.json({ ok: false, motivo: resultado, error: textoResultadoCodigo(resultado) }, { status: 400, headers: SIN_CACHE });
    }
    const res = NextResponse.json({ ok: true }, { headers: SIN_CACHE });
    if (body?.recordar === true) {
      // Secundario: si falla, solo significa que la próxima vez lo volverá a pedir.
      try {
        const cookie = nombreCookieDispositivo(huellaCuenta(r.user.id));
        const token = await recordarDispositivo(admin, {
          userId: r.user.id,
          nombre: nombreDispositivo(req.headers.get('user-agent'), body.tactil === true),
          ip: ipParaGuardar(clientIp(req)),
          tokenActual: leerCookie(req.headers.get('cookie'), cookie),
        });
        res.headers.append('Set-Cookie', cabeceraCookieDispositivo(cookie, token, { segura: new URL(req.url).protocol === 'https:' }));
      } catch (e) {
        console.error('[doble-factor-correo/verificar] recordar', e instanceof Error ? e.message : e);
      }
    }
    return res;
  } catch (e) {
    return errorInterno('auth/doble-factor-correo/verificar:POST', e, 'No se ha podido comprobar el código.');
  }
}
