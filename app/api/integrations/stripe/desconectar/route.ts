import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeCambiarCuentaDeCobro } from '@/lib/billing/cuenta-cobro';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Desconectar Stripe desde el panel (Configuración → Integraciones).
//
// Antes lo hacía el navegador con un UPDATE directo de `studios`. Ahora la
// columna no es escribible por `authenticated` (migr 20260913160100): la cuenta
// de cobro decide dónde cae el dinero de las socias y solo la cambia la dueña.
//
// Hace lo mismo que el webhook `account.application.deauthorized` cuando la
// desconexión llega desde Stripe: guarda la cuenta en
// `stripe_account_id_anterior` para que un webhook tardío de un cobro YA hecho
// siga atribuyéndose a este estudio (lib/billing/webhook-tenant.ts).
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // El estudio de la sesión, nunca del body.
  const { data: studio, error: errLeer } = await admin
    .from('studios').select('id, owner_auth_user_id, stripe_account_id')
    .eq('id', sesion.studioId).maybeSingle();
  if (errLeer || !studio) {
    return errorInterno('stripe:desconectar:leer', errLeer ?? new Error('sin estudio'),
      'No se ha podido leer tu estudio. Inténtalo de nuevo en unos segundos.');
  }

  const esDuena = studio.owner_auth_user_id === sesion.userId;
  if (!puedeCambiarCuentaDeCobro({ rol: sesion.rol, esDuena })) {
    return NextResponse.json(
      { error: 'Solo la dueña del estudio puede desconectar la cuenta donde se cobra.' },
      { status: 403 },
    );
  }

  const cuenta = studio.stripe_account_id as string | null;
  if (!cuenta) return NextResponse.json({ ok: true, sinCambios: true });

  // Compare-and-set sobre la cuenta leída: si entre medias se reconectó otra,
  // no se desconecta la nueva por error.
  const { error: errUpd } = await admin
    .from('studios')
    .update({
      stripe_account_id: null,
      stripe_account_id_anterior: cuenta,
      stripe_account_desconectado_en: new Date().toISOString(),
    })
    .eq('id', studio.id)
    .eq('stripe_account_id', cuenta);
  if (errUpd) {
    return errorInterno('stripe:desconectar:actualizar', errUpd,
      'No se ha podido desconectar Stripe. Vuelve a intentarlo.');
  }

  // Constancia en Actividad. Si falla, no se deshace la desconexión: ya está
  // hecha y decir «no se pudo» sería mentir.
  const { error: errLog } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: studio.id, tipo: 'CUENTA_COBRO_CAMBIADA',
    texto: `Stripe desconectado del estudio (cuenta terminada en ${cuenta.slice(-4)})`,
    socio_id: null, enlace: '/configuracion', creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
  });
  if (errLog) console.error('[stripe:desconectar] no se pudo registrar la actividad', errLog.message);

  return NextResponse.json({ ok: true });
}
