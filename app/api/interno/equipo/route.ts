import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirAlguno, exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { esPermiso, type Permiso } from '@/lib/interno/permisos';
import { puedeDarDeAlta } from '@/lib/interno/equipo-reglas';
import { leerEquipo } from '@/lib/interno/equipo-server';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// El equipo interno. Hasta ahora dar de alta a alguien era SQL escrito a mano,
// lo que significaba que en la práctica no se hacía y que `users.create` /
// `users.delete` eran permisos declarados que no cerraban ninguna puerta.
//
// Las reglas de quién puede tocar el acceso de quién están en
// `lib/interno/equipo-reglas.ts`, probadas aparte. Aquí solo se cargan los
// datos, se aplican y se audita.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Basta con uno: quien da de alta y quien da de baja necesitan la misma lista.
  const g = await exigirAlguno(req, ['users.create', 'users.delete']);
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    return NextResponse.json({ equipo: await leerEquipo(db), yo: g.admin.userId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se ha podido cargar el equipo.' },
      { status: 500 },
    );
  }
}

interface CuerpoAlta {
  email?: string;
  nombre?: string;
  cargo?: string;
  permisos?: string[];
}

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'users.create');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as CuerpoAlta | null;
  const email = (cuerpo?.email ?? '').trim().toLowerCase();
  const nombre = (cuerpo?.nombre ?? '').trim();
  const cargo = (cuerpo?.cargo ?? '').trim() || null;
  const brutos = cuerpo?.permisos ?? [];

  if (!email.includes('@')) return NextResponse.json({ error: 'Escribe un email válido.' }, { status: 400 });
  if (nombre.length < 2) return NextResponse.json({ error: 'Escribe el nombre de la persona.' }, { status: 400 });

  // Un permiso desconocido no se ignora en silencio: se rechaza. Un typo que se
  // traga el servidor deja a alguien con menos acceso del que crees haberle dado.
  const desconocido = brutos.find(p => !esPermiso(p));
  if (desconocido) return NextResponse.json({ error: `"${desconocido}" no es un permiso.` }, { status: 400 });
  const permisos = brutos as Permiso[];
  if (permisos.length === 0) {
    return NextResponse.json({ error: 'Dale al menos un permiso: si no, entra y no ve nada.' }, { status: 400 });
  }

  const veredicto = puedeDarDeAlta(g.admin, permisos);
  if (!veredicto.ok) return NextResponse.json({ error: veredicto.motivo }, { status: 403 });

  const { data: uid, error: errUid } = await db.rpc('plataforma_uid_por_email', { p_email: email });
  if (errUid) return NextResponse.json({ error: 'No se ha podido buscar esa cuenta.' }, { status: 500 });
  if (!uid) {
    // Sin cuenta no hay alta: `plataforma_admin.auth_user_id` apunta a
    // `auth.users`. Se dice qué hacer en vez de un "no encontrado" a secas.
    return NextResponse.json({
      error: `${email} todavía no tiene cuenta en Tentare. Que entre una vez en `
        + `tentare.app y vuelve a darle de alta aquí.`,
    }, { status: 404 });
  }

  const equipo = await leerEquipo(db);
  if (equipo.some(m => m.userId === uid)) {
    return NextResponse.json({ error: `${email} ya está en el equipo interno.` }, { status: 409 });
  }

  const { error: errAlta } = await db.from('plataforma_admin')
    .insert({ auth_user_id: uid, nombre, cargo });
  if (errAlta) return NextResponse.json({ error: 'No se ha podido dar de alta.' }, { status: 500 });

  const { error: errPerm } = await db.from('plataforma_permiso')
    .insert(permisos.map(p => ({ auth_user_id: uid, permiso: p, concedido_por: g.admin.userId })));
  if (errPerm) {
    // La ficha ya está creada y los permisos no. Se deshace en vez de dejar a
    // alguien dado de alta sin permisos: entraría al panel y no vería nada, y
    // el siguiente intento de alta chocaría con un 409 que no se entiende.
    await db.from('plataforma_admin').delete().eq('auth_user_id', uid);
    return NextResponse.json({ error: 'No se han podido conceder los permisos.' }, { status: 500 });
  }

  await registrar(db, req, {
    actor: g.admin,
    accion: 'equipo.alta',
    objetivoTipo: 'plataforma_admin', objetivoId: uid as string,
    resumen: `${nombre} (${email}) entra al equipo con: ${permisos.join(', ')}`,
    antes: null, despues: { nombre, cargo, permisos },
  });

  return NextResponse.json({ ok: true, userId: uid });
}
