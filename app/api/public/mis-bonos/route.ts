import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { leerMovimientosBono, leerSemanaCuota, suscripcionesSuyas, type Cursor } from '@/lib/student/mis-bonos-servidor';

// Bonos de la alumna (P4, 5-oct-2026): los movimientos de un bono suyo (del ledger de derechos) y «esta semana» de su
// cuota con tope. Es lo único de esa pantalla que no viaja en el payload cacheado de studio-data. Solo LECTURA.
//
// Identidad: la del JWT verificado (`verificarUsuarioSupabase`, que corta la sesión con verificación en dos pasos sin
// pasar) + `socioAutenticado` con el estudio del slug; nunca un id de persona del cuerpo. Con service-role porque la
// socia no tiene política en el ledger (es del personal con finanzas): por eso cada consulta filtra por estudio y por
// socia, y cada id de suscripción del cuerpo se comprueba suyo antes de usarlo (uno ajeno contesta como uno que no
// existe).
//
// POST y no GET para que ningún id de suscripción viaje en la URL ni en los logs del CDN (como /api/public/historial).
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-mis-bonos', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    slug?: unknown; bono?: unknown; semanaDe?: unknown; limite?: unknown; antes?: unknown;
  } | null;
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) return errorPeticion('Falta el estudio.');
  const bono = typeof body?.bono === 'string' && body.bono ? body.bono : null;
  const semanaDe = Array.isArray(body?.semanaDe) ? body.semanaDe.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 3) : [];
  const limite = typeof body?.limite === 'number' && Number.isInteger(body.limite) ? Math.min(50, Math.max(1, body.limite)) : 4;
  const a = body?.antes as { creadoEn?: unknown; id?: unknown } | null | undefined;
  // El cursor va DENTRO de un filtro de PostgREST: solo una fecha ISO y un uuid, nada que pueda abrir otro filtro.
  const antes: Cursor | null = a && typeof a.creadoEn === 'string' && typeof a.id === 'string'
    && /^[0-9T:.+\-Z ]{10,40}$/.test(a.creadoEn) && !Number.isNaN(Date.parse(a.creadoEn))
    && /^[0-9a-f-]{36}$/i.test(a.id)
    ? { creadoEn: a.creadoEn, id: a.id } : null;
  if (!bono && semanaDe.length === 0) return errorPeticion('No hay nada que pedir.');

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const estudio = await resolverStudioPorSlug(admin as never, slug);
  if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const studioId = String(estudio.row.id);

  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const ids = [...new Set([...(bono ? [bono] : []), ...semanaDe])];
    const suyas = await suscripcionesSuyas(admin, { studioId, socioId, ids });
    if (ids.some((id) => !suyas.has(id))) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    // Solo un bono de sesiones tiene movimientos de saldo: una cuota (o un saldo sin gestionar) no gasta sesiones.
    const delBono = bono ? suyas.get(bono)! : null;
    const conMovimientos = delBono && (delBono.tipoPlan === 'BONO' || delBono.tipoPlan === 'PUNTUAL') && delBono.saldo !== null;
    const [movimientos, semanas] = await Promise.all([
      conMovimientos ? leerMovimientosBono(admin, { studioId, socioId, bonoId: delBono.id, limite, antes }) : Promise.resolve(null),
      Promise.all(semanaDe.map((id) => leerSemanaCuota(admin, { studioId, socioId, suscripcion: suyas.get(id)! }))),
    ]);
    return NextResponse.json(
      { movimientos, semanas: semanas.filter((s) => s !== null) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return errorInterno('public/mis-bonos:POST', e, 'No hemos podido cargar tus bonos. Vuelve a intentarlo.');
  }
}
