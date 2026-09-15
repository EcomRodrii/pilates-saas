import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { textoCambioDominios, validarDominiosWidget } from '@/lib/widget/dominios-autorizados';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Dominios autorizados del widget embebido (Configuración → API/Widget).
//
// Antes los guardaba el navegador con un UPDATE directo de `studios`, sin
// validar. Ahora `authenticated` no puede escribir la columna (migr
// 20260914011356): decide desde qué webs se leen las respuestas del widget, así
// que la cambia solo la propietaria, con el formato validado aquí (origen https
// exacto, sin rutas ni comodines) y con constancia en Actividad.
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede autorizar dominios para el widget.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const validado = validarDominiosWidget(await req.json().catch(() => null));
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });
  const { dominios } = validado;

  // El estudio de la sesión, nunca del body.
  const { data: studio, error: errLeer } = await admin
    .from('studios').select('id, widget_dominios_autorizados')
    .eq('id', sesion.studioId).maybeSingle();
  if (errLeer || !studio) {
    return errorInterno('estudio:widget-dominios:leer', errLeer ?? new Error('sin estudio'),
      'No se ha podido leer tu estudio. Inténtalo de nuevo en unos segundos.');
  }

  const antes = (studio.widget_dominios_autorizados as string[] | null) ?? [];
  const texto = textoCambioDominios(antes, dominios);
  if (!texto) return NextResponse.json({ ok: true, dominios, sinCambios: true });

  const { error: errUpd } = await admin
    .from('studios').update({ widget_dominios_autorizados: dominios }).eq('id', studio.id);
  if (errUpd) {
    return errorInterno('estudio:widget-dominios:actualizar', errUpd,
      'No se han podido guardar los dominios. Vuelve a intentarlo.');
  }

  // Si falla la constancia no se deshace el cambio: ya está guardado.
  const { error: errLog } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: studio.id, tipo: 'WIDGET_DOMINIOS_CAMBIADOS', texto,
    socio_id: null, enlace: '/configuracion?tab=web&abrir=widgets', creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
  });
  if (errLog) console.error('[estudio:widget-dominios] no se pudo registrar la actividad', errLog.message);

  return NextResponse.json({ ok: true, dominios });
}
