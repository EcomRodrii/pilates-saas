import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { leerEventoProgreso } from '@/lib/alta/abandono';

// ─────────────────────────────────────────────────────────────────────────────
// La pantalla de alta (/crear-estudio, y /login cuando retoma una alta) cuenta
// aquí los pasos que el servidor no puede ver solo:
//   · `inicio` / `plan`: alguien con la sesión YA abierta (entró con Google) y
//     sin estudio llega al alta / pasa del paso 1. Sin sesión no hay a quién
//     apuntarlo; ese tramo lo apunta el trigger de auth.users al crear la cuenta.
//   · `error_estudio`: `dbCreateStudio` devolvió null.
//
// Solo escribe SOBRE LA PROPIA cuenta (el id sale del JWT, nunca del cuerpo) y
// con service-role sobre `altas_estudio`, que no tiene políticas para el
// cliente. `inicio`/`plan` comprueban en servidor que la cuenta no tiene ya
// estudio ni ficha de equipo: una instructora invitada que abra /crear-estudio
// no es un alta. Best-effort: la pantalla no espera esta respuesta para nada.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limitado = await enforceRateLimit(req, 'alta-progreso', { max: 20, windowSeconds: 60 }, usuario.userId);
  if (limitado) return limitado;

  const evento = leerEventoProgreso(await req.json().catch(() => null));
  if (!evento) return NextResponse.json({ error: 'Evento no válido' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const ahora = new Date().toISOString();

  if (evento.evento === 'error_estudio') {
    // Solo sobre un alta que ya existe: un error sin alta registrada no dice nada.
    const { data: fila } = await admin.from('altas_estudio')
      .select('error_estudio_intentos').eq('auth_user_id', usuario.userId).maybeSingle();
    if (!fila) return NextResponse.json({ ok: true, registrado: false });
    const { error } = await admin.from('altas_estudio')
      .update({
        error_estudio_en: ahora,
        error_estudio_intentos: Number(fila.error_estudio_intentos ?? 0) + 1,
        actualizado_en: ahora,
      })
      .eq('auth_user_id', usuario.userId);
    if (error) return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 });
    return NextResponse.json({ ok: true, registrado: true });
  }

  // `inicio` / `plan`: ya tiene estudio o ficha de equipo → no es un alta.
  if (await verificarSesionStaff(req)) return NextResponse.json({ ok: true, registrado: false });

  const { error: errAlta } = await admin.from('altas_estudio').upsert(
    { auth_user_id: usuario.userId, origen: 'con_sesion', estudio_nombre: evento.estudio, iniciada_en: ahora },
    { onConflict: 'auth_user_id', ignoreDuplicates: true },
  );
  if (errAlta) return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 });

  if (evento.evento === 'plan') {
    // La PRIMERA vez que llega al plan: volver atrás y adelante no la mueve.
    await admin.from('altas_estudio').update({ plan_en: ahora, actualizado_en: ahora })
      .eq('auth_user_id', usuario.userId).is('plan_en', null);
    // El nombre sí se actualiza: es el último que escribió, y el del correo.
    if (evento.estudio) {
      await admin.from('altas_estudio').update({ estudio_nombre: evento.estudio, actualizado_en: ahora })
        .eq('auth_user_id', usuario.userId);
    }
  }
  return NextResponse.json({ ok: true, registrado: true });
}
