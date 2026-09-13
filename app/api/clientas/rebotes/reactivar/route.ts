import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { normalizarEmail } from '@/lib/emails/rebotes';
import { reactivarBuzon } from '@/lib/emails/reactivar-buzon';
import { escaparLike } from '@/lib/escapar-like';

// I-8 (auditoría 58ª pasada). "No le está llegando el correo" en la ficha de
// la clienta no se podía quitar nunca — ver el comentario largo de
// `lib/emails/reactivar-buzon.ts`. Este botón es la única salida manual.
//
// SEGURIDAD: mismo criterio que GET /api/clientas/rebotes — `email_rebotes`
// es global (un buzón roto lo está para cualquiera), así que el email NO se
// acepta a secas del body: se exige que sea el de una socia/instructora DE
// ESTE estudio, resuelto aquí, para que esta ruta no se convierta en un
// oráculo ("¿está suprimida esta dirección cualquiera?") ni en una forma de
// reactivar el buzón de gente ajena al estudio de quien la llama.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede gestionar clientas' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim();
  if (!email) return NextResponse.json({ error: 'Falta el email' }, { status: 400 });
  const normalizado = normalizarEmail(email);

  try {
    const { data: socio } = await admin
      .from('socios')
      .select('id')
      .eq('studio_id', sesion.studioId)
      .ilike('email', escaparLike(normalizado))
      .is('borrado_en', null)
      .maybeSingle();
    if (!socio) {
      return NextResponse.json({ error: 'Esa dirección no pertenece a ninguna clienta de tu estudio' }, { status: 403 });
    }

    const r = await reactivarBuzon(admin, normalizado);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('clientas/rebotes/reactivar', err);
  }
}
