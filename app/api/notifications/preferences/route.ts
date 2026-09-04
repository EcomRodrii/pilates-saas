import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';

// Preferencias de notificación por usuario y categoría (qué quiere recibir y por
// qué canal). Ausencia de fila = valores por defecto (in-app + push ON). Cada
// usuario gestiona SOLO las suyas (acotado por user_id del JWT).

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ prefs: {} });

  const { data } = await admin.from('notification_preference')
    .select('category, inapp, push, email, whatsapp, sms').eq('user_id', user.userId);
  const prefs: Record<string, unknown> = {};
  for (const r of data ?? []) {
    prefs[r.category as string] = { inapp: r.inapp, push: r.push, email: r.email, whatsapp: r.whatsapp, sms: r.sms };
  }
  return NextResponse.json({ prefs });
}

// Canales del modelo categoría × canal. Se enumeran para poder distinguir
// "no me mandes este campo" de "ponlo a false": es justo lo que se perdía.
const CANALES = ['inapp', 'push', 'email', 'whatsapp', 'sms'] as const;
type Canal = (typeof CANALES)[number];

// Valores por defecto de una preferencia que aún no existe (los mismos de
// siempre: ausencia de fila = in-app + push encendidos). Solo se usan al CREAR
// la fila, nunca al actualizarla.
const POR_DEFECTO: Record<Canal, boolean> = {
  inapp: true, push: true, email: false, whatsapp: false, sms: false,
};

export async function PUT(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  const b = (await req.json().catch(() => null)) as
    | { studioId?: string; category?: string; inapp?: boolean; push?: boolean; email?: boolean; whatsapp?: boolean; sms?: boolean }
    | null;
  if (!b?.studioId || !b?.category) return NextResponse.json({ error: 'faltan datos' }, { status: 400 });

  // El `studio_id` que se escribe abajo venía CRUDO del body con solo el JWT
  // validado: cualquiera con cuenta podía sembrar una fila con el estudio de
  // otro. Se valida la pertenencia igual que el endpoint hermano
  // (app/api/notifications/route.ts): socia de ese estudio, o staff con ese
  // estudio activo.
  const esSocia = !!(await socioAutenticado(user.userId, b.studioId));
  if (!esSocia) {
    const staff = await verificarSesionStaff(req);
    if (staff?.studioId !== b.studioId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  // Update PARCIAL de verdad: solo los canales PRESENTES en el body. Antes esto
  // era un upsert de fila completa con defaults, y las dos pantallas mandan UN
  // solo canal por toque, así que apagar el email de `pagos` volvía a encender
  // el push, tocar cualquier push apagaba el email, y whatsapp/sms se ponían a
  // false en cada guardado. Y respondía ok, así que el borrado no dejaba rastro.
  const cambios: Partial<Record<Canal, boolean>> = {};
  for (const canal of CANALES) if (typeof b[canal] === 'boolean') cambios[canal] = b[canal];
  if (Object.keys(cambios).length === 0) {
    // No cambiar nada y decir `{ok:true}` sería el mismo éxito falso de antes.
    return NextResponse.json({ error: 'faltan datos' }, { status: 400 });
  }

  const ahora = new Date().toISOString();
  const actualizar = () => admin
    .from('notification_preference')
    .update({ ...cambios, updated_at: ahora })
    .eq('user_id', user.userId).eq('category', b.category as string)
    .select('id');

  const { data: tocadas, error: errUpdate } = await actualizar();
  if (errUpdate) return errorInterno('notifications/preferences:put', errUpdate, 'No se han podido guardar las preferencias. Inténtalo de nuevo.');
  if (tocadas && tocadas.length > 0) return NextResponse.json({ ok: true });

  // Aún no había fila: se crea con los defaults de siempre y encima el cambio.
  const { error: errInsert } = await admin.from('notification_preference').insert({
    id: `pref-${user.userId}-${b.category}`,
    studio_id: b.studioId,
    user_id: user.userId,
    category: b.category,
    ...POR_DEFECTO,
    ...cambios,
    updated_at: ahora,
  });
  // Carrera: otra petición creó la fila entre el UPDATE y el INSERT (dos toques
  // seguidos en la misma pantalla). Se resuelve reintentando el update parcial.
  if (errInsert?.code === '23505') {
    const { error } = await actualizar();
    if (error) return errorInterno('notifications/preferences:put', error, 'No se han podido guardar las preferencias. Inténtalo de nuevo.');
    return NextResponse.json({ ok: true });
  }
  if (errInsert) return errorInterno('notifications/preferences:put', errInsert, 'No se han podido guardar las preferencias. Inténtalo de nuevo.');
  return NextResponse.json({ ok: true });
}
