import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { registrarSociaPublica, resolverSociaAutenticada } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// ─────────────────────────────────────────────────────────────────────────────
// Al entrar: enlazar la ficha de la socia, o darla de alta.
//
// Decisión de producto explícita del fundador: quien entra y todavía no es
// socia de ese estudio SE DA DE ALTA SOLA. Se le advirtió del efecto
// —cualquiera queda dada de alta sin que la propietaria lo apruebe— y lo
// confirmó.
//
// ⚠️ Sirve a las DOS puertas, y tiene que ser así: con Google se daba de alta y
// por email no —quien pedía el enlace sin ser socia acababa en «el enlace ya no
// vale», un callejón—. Dos comportamientos distintos para la misma decisión de
// producto es como se acaba con la mitad de las socias entrando por un sitio y
// la otra mitad sin poder.
//
// En las dos vías la persona ha PROBADO que controla ese email: Google lo
// verifica, y el enlace del correo también. Esa prueba es la que autoriza el
// alta, no el proveedor.
//
// ⚠️ Va en un endpoint PROPIO y no dentro de `/api/public/session`, y la
// diferencia importa: `session` se llama en CADA carga del portal, así que
// cualquiera con una sesión de Supabase de otro sitio quedaría dada de alta con
// solo VISITAR el portal de un estudio. Aquí solo se llega volviendo de Google
// en ese portal, que es lo que se pidió.
//
// ⚠️ El alta la hace `registrarSociaPublica`, que YA existía: es idempotente
// por `auth_user_id`, adopta la ficha fantasma si la hubiera y resuelve el
// referido. Escribir un `insert` aquí habría duplicado esa lógica y divergido
// en el primer cambio.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-alta-al-entrar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    /** Su nombre, si el proveedor lo da. Se usa solo si hay que crear la ficha. */
    nombre?: string;
    /** Por qué puerta entró. Solo cambia lo que se anota como origen. */
    via?: 'google' | 'enlace';
  } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  // La identidad sale del JWT verificado, nunca del body. Es lo que impide dar
  // de alta a nombre de otra persona.
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    // 1) ¿Ya es socia, o tiene ficha con su email? `resolverSociaAutenticada`
    //    hace las dos cosas: devuelve la vinculada, o enlaza por email la que
    //    la propietaria ya había dado de alta. Ese enlace es lo que evita
    //    duplicar a quien YA es clienta del estudio.
    const yaEsta = await resolverSociaAutenticada(body.slug, user.userId, user.email);
    if (yaEsta) return NextResponse.json({ socioId: yaEsta.socioId, creada: false });

    // 2) No lo es: se crea.
    const nombre = (body.nombre ?? '').trim() || user.email.split('@')[0];
    const r = await registrarSociaPublica({
      // `studioId` no se puede coger del body: se resuelve desde el slug dentro
      // de `resolverSociaAutenticada`… que devolvió null. Se resuelve aquí con
      // el mismo camino que usa el resto del portal público.
      studioId: await studioIdDeSlug(body.slug),
      id: randomUUID(),
      nombre,
      email: user.email,
      authUserId: user.userId,
      // Queda anotado de dónde salió: la propietaria tiene que poder distinguir
      // a quien dio de alta ella de quien entró sola con Google.
      // De dónde salió, para que la propietaria pueda distinguir a quien dio
      // de alta ella de quien entró sola, y por qué puerta.
      origenLead: body.via === 'google' ? 'google' : 'enlace-email',
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ socioId: r.socioId, creada: true });
  } catch (err) {
    return errorInterno('public/alta-al-entrar:POST', err, 'No se ha podido completar el acceso.');
  }
}

/** El id del estudio a partir del slug, por el mismo camino que el resto del portal. */
async function studioIdDeSlug(slug: string): Promise<string> {
  const { getSupabaseAdmin } = await import('@/lib/db/supabase-admin');
  const { resolverStudioPorSlug } = await import('@/lib/db/supabase-data-admin');
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) throw new Error('Estudio no encontrado');
  return (resuelto.row as { id: string }).id;
}
