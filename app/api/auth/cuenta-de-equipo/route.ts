import { NextRequest, NextResponse } from 'next/server';
import { usuarioConToken } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { esCuentaDeEquipo } from '@/lib/auth/cuenta-de-equipo';

// ¿La sesión recién abierta en la ventana del puente del widget
// (app/widget-auth-retorno) es de una cuenta de EQUIPO? Si lo es, la ventana no
// se la entrega a la web del estudio (decisión del fundador, 16-oct-2026): esa
// sesión vale para la cuenta entera, y la web que la recibe podría usarla en el
// estudio donde esa persona trabaja. Una cuenta que es equipo en un estudio y
// alumna en otro tampoco: reserva desde la página entera, en tentare.app.
//
// Lo decide el servidor con el token que acaba de emitir gotrue (validado con
// `getUser`); la ventana solo obedece y, ante cualquier respuesta que no sea un
// `equipo: false` explícito, no entrega nada. Solo contesta sobre la propia
// cuenta del token, y sin CORS: la llama la ventana desde tentare.app.
//
// Sin cortar por el segundo paso, a propósito: la pregunta se contesta igual
// con la sesión en `aal1` (a una alumna con verificación se la pide el propio
// widget, y una cuenta de equipo con ella no debe recibir sesión tampoco). No
// da ningún dato, solo el sí o el no de la cuenta que pregunta.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const r = await usuarioConToken(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const equipo = await esCuentaDeEquipo(admin, r.user.id);
    return NextResponse.json({ equipo }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorInterno('auth/cuenta-de-equipo:POST', e);
  }
}
