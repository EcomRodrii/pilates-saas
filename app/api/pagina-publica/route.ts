import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { hashearClave } from '@/lib/publico/acceso-pagina';

// Visibilidad de la página pública del estudio (/reservar/{slug}).
//
// Ruta propia y NO `updateStudio` desde el cliente por un motivo concreto: la
// clave hay que HASHEARLA, y `scrypt` es de servidor. Mandar la clave en claro
// a Supabase desde el navegador para guardarla tal cual sería exactamente lo
// que este diseño evita.
//
// Autorización en la ruta y no en la RLS porque se escribe con service-role
// (`auth.uid()` es NULL ahí, y cualquier guardia basada en él quedaría
// bypaseada en silencio) — mismo criterio ya documentado para
// `resolver_reserva_pendiente` y `crearReservaPublica`.

/** GET → qué hay configurado ahora. Nunca devuelve el hash, solo si existe. */
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'No disponible' }, { status: 503 });
  const { data } = await admin
    .from('studios')
    .select('pagina_publica_oculta, pagina_publica_clave_hash')
    .eq('id', sesion.studioId)
    .maybeSingle();

  return NextResponse.json({
    oculta: data?.pagina_publica_oculta === true,
    tieneClave: typeof data?.pagina_publica_clave_hash === 'string' && data.pagina_publica_clave_hash.length > 0,
  });
}

/**
 * PUT → cambia la visibilidad y/o la clave.
 *
 * `clave` es opcional y tiene TRES significados distintos, que es justo donde
 * un endpoint así se rompe si no se decide a propósito:
 *   · ausente  → no se toca la clave que hubiera
 *   · `''`     → se QUITA la clave (oculta sin forma de entrar)
 *   · texto    → se fija esa clave
 */
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo listón que editar la marca: es una decisión sobre la cara pública
  // del negocio, no algo de mostrador.
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'MANAGER')
    return NextResponse.json({ error: 'Solo la propietaria o la gerencia pueden cambiar la visibilidad de la página' }, { status: 403 });

  const body = await req.json().catch(() => null) as { oculta?: unknown; clave?: unknown } | null;
  if (!body || typeof body.oculta !== 'boolean')
    return NextResponse.json({ error: 'Falta indicar si la página se oculta' }, { status: 400 });
  if (body.clave !== undefined && typeof body.clave !== 'string')
    return NextResponse.json({ error: 'Clave inválida' }, { status: 400 });

  // Una clave de 3 letras no es una clave; se dice aquí en vez de aceptarla y
  // dar una falsa sensación de haber cerrado algo.
  const clave = typeof body.clave === 'string' ? body.clave.trim() : undefined;
  if (clave !== undefined && clave !== '' && clave.length < 6)
    return NextResponse.json({ error: 'La clave necesita al menos 6 caracteres.' }, { status: 400 });

  const cambios: Record<string, unknown> = { pagina_publica_oculta: body.oculta };
  if (clave !== undefined) cambios.pagina_publica_clave_hash = clave === '' ? null : hashearClave(clave);

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'No disponible' }, { status: 503 });
    const { error } = await admin.from('studios').update(cambios).eq('id', sesion.studioId);
    if (error) throw error;
    return NextResponse.json({
      oculta: body.oculta,
      tieneClave: clave === undefined ? undefined : clave !== '',
    });
  } catch (e) {
    return errorInterno('pagina-publica:guardar', e,
      'No se ha podido cambiar la visibilidad de la página. Vuelve a intentarlo.');
  }
}
