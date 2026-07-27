import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { normalizarSlug, motivoSlugInvalido } from '@/lib/slug';

// ─────────────────────────────────────────────────────────────────────────────
// Cambiar la dirección pública del estudio.
//
// El slug se generaba al crear el estudio y no se podía tocar nunca más: quien
// se rebautizaba se quedaba con la dirección vieja para siempre.
//
// Solo la PROPIETARIA: la dirección pública es la identidad del negocio de cara
// a sus clientas, y cambiarla afecta a todo lo que ya se ha compartido.
//
// La anterior NO se tira: se guarda en `studio_slugs_antiguos` (0110) y las
// rutas públicas redirigen. Renombrar deja de ser irreversible.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json(
      { error: 'Solo la propietaria puede cambiar la dirección pública del estudio' },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  const pedido = normalizarSlug(String(body?.slug ?? ''));

  const motivo = motivoSlugInvalido(pedido);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });

  // El estudio de la sesión, nunca del body.
  const { data: actual, error: errLeer } = await admin
    .from('studios').select('id, slug').eq('id', sesion.studioId).maybeSingle();
  if (errLeer || !actual) {
    return errorInterno('estudio:direccion:leer', errLeer ?? new Error('sin estudio'),
      'No se ha podido leer tu estudio. Inténtalo de nuevo en unos segundos.');
  }
  if (actual.slug === pedido) {
    return NextResponse.json({ ok: true, slug: pedido, sinCambios: true });
  }

  // ¿Libre? La RPC mira `studios` Y el histórico (0110): coger la dirección
  // antigua de otro estudio sería quedarse con su tráfico.
  const { data: libre } = await admin.rpc('slug_estudio_disponible', { p_slug: pedido });
  if (libre !== true) {
    return NextResponse.json(
      { error: 'Esa dirección ya está en uso por otro estudio. Prueba con otra.' },
      { status: 409 },
    );
  }

  // Primero se guarda la vieja y luego se cambia. En este orden: si falla el
  // cambio, sobra una fila en el histórico que apunta a la dirección que el
  // estudio sigue teniendo — inofensivo. Al revés se perdería el enlace viejo.
  if (actual.slug) {
    const { error: errHist } = await admin
      .from('studio_slugs_antiguos')
      .insert({ slug: actual.slug, studio_id: actual.id });
    // 23505: ya estaba (el estudio vuelve a una dirección que tuvo antes).
    if (errHist && errHist.code !== '23505') {
      return errorInterno('estudio:direccion:historico', errHist,
        'No se ha podido guardar la dirección anterior, así que no se ha cambiado nada. Inténtalo de nuevo.');
    }
  }

  const { error: errUpd } = await admin
    .from('studios').update({ slug: pedido }).eq('id', actual.id);
  if (errUpd) {
    return errorInterno('estudio:direccion:actualizar', errUpd,
      'No se ha podido cambiar la dirección. Vuelve a intentarlo.');
  }

  // Si la nueva dirección era una vieja de ESTE mismo estudio, deja de serlo.
  await admin.from('studio_slugs_antiguos')
    .delete().eq('slug', pedido).eq('studio_id', actual.id);

  return NextResponse.json({ ok: true, slug: pedido, anterior: actual.slug });
}
