import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeCambiarCuentaDeCobro } from '@/lib/billing/cuenta-cobro';
import { desconectarCuentaSumup } from '@/lib/pos/sumup-lector-servidor';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Desconectar la cuenta de SumUp del estudio (Configuración → Datáfono). Como la
// de Stripe, decide dónde cae el dinero: solo la dueña. Da de baja su Solo y
// borra la credencial; los cobros ya hechos no cambian y el dinero sigue en su
// cuenta de SumUp.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // El estudio de la sesión, nunca del body.
  const { data: studio, error: errLeer } = await admin
    .from('studios').select('id, owner_auth_user_id, sumup_reader_id')
    .eq('id', sesion.studioId).maybeSingle();
  if (errLeer || !studio) {
    return errorInterno('sumup:desconectar:leer', errLeer ?? new Error('sin estudio'),
      'No se ha podido leer tu estudio. Inténtalo de nuevo en unos segundos.');
  }
  if (!puedeCambiarCuentaDeCobro({ rol: sesion.rol, esDuena: studio.owner_auth_user_id === sesion.userId })) {
    return NextResponse.json({ error: 'Solo la dueña del estudio puede desconectar la cuenta donde se cobra.' }, { status: 403 });
  }

  const r = await desconectarCuentaSumup(admin, sesion.studioId, (studio.sumup_reader_id as string | null) ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  const { error: errLog } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: sesion.studioId, tipo: 'CUENTA_COBRO_CAMBIADA',
    texto: 'SumUp desconectado del estudio',
    socio_id: null, enlace: '/configuracion?tab=cobros#datafono', creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
  });
  if (errLog) console.error('[sumup:desconectar] no se pudo registrar la actividad', errLog.message);
  return NextResponse.json({ ok: true });
}
