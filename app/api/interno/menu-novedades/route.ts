import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { esHrefDeMenu, opcionesDeMenu } from '@/lib/menu-novedades';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Badge «NUEVO» del menú del panel — qué entrada está marcada como nueva.
//
// Mismo permiso que el changelog (`content.write`) y no uno propio: las dos
// cosas son lo mismo contado en dos sitios —«hemos sacado X»— y quien publica
// una versión es quien sabe qué entrada del menú señalar. Un permiso nuevo por
// cada superficie de contenido acaba en una lista que nadie sabe conceder.
//
// El panel de un estudio NO pasa por aquí: lee `menu_novedades` directo con
// RLS (select para `authenticated`), igual que el widget de Actualizaciones lee
// `changelog_versiones`. Esta ruta es solo el lado de escritura.
//
// Puramente manual: no hay fecha de fin. La única forma de apagar un badge es
// borrar su fila (DELETE de aquí abajo) — decisión explícita del fundador tras
// ver que la caducidad automática de 30 días no era lo que esperaba: un NUEVO
// que él marca debe quedarse hasta que él mismo lo quite.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db
    .from('menu_novedades')
    .select('href, creado_en')
    .order('creado_en', { ascending: false });
  if (error) return NextResponse.json({ error: 'No se han podido cargar las novedades del menú.' }, { status: 500 });

  // Las opciones viajan con la respuesta para que el desplegable de /interno no
  // tenga que importar el menú del panel (y con él sus iconos de lucide) en un
  // bundle que no lo necesita.
  return NextResponse.json({ novedades: data ?? [], opciones: opcionesDeMenu() });
}

interface CuerpoMarcar {
  href?: string;
}

// PUT y no POST: marcar una entrada ya marcada no crea una segunda fila, la
// deja igual — es idempotente por naturaleza, y `href` es la PK.
export async function PUT(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as CuerpoMarcar | null;
  const href = (cuerpo?.href ?? '').trim();

  // Contra el menú REAL, no contra una forma de URL: un dedazo («/clientes» por
  // «/clientas») guardaría una fila que no pinta nada y no daría ningún error.
  if (!esHrefDeMenu(href)) {
    return NextResponse.json({ error: 'Esa ruta no es una entrada del menú del panel.' }, { status: 400 });
  }

  const { data: antes } = await db.from('menu_novedades').select('href').eq('href', href).maybeSingle();

  const { error } = await db.from('menu_novedades')
    .upsert({ href, creado_por: g.admin.userId }, { onConflict: 'href' });
  if (error) return NextResponse.json({ error: 'No se ha podido marcar la entrada.' }, { status: 500 });

  await registrar(db, req, {
    actor: g.admin,
    accion: 'menu.novedad.marcada',
    objetivoTipo: 'menu_novedad', objetivoId: href,
    resumen: `"${href}" marcada como NUEVO`,
    antes: antes ?? null, despues: { href },
  });

  return NextResponse.json({ ok: true, href });
}

export async function DELETE(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const href = (req.nextUrl.searchParams.get('href') ?? '').trim();
  if (!href) return NextResponse.json({ error: 'Falta la entrada que quitar.' }, { status: 400 });

  // Se lee antes de borrar para que la auditoría guarde QUÉ había: después del
  // DELETE ya no hay forma de saber que estaba marcada.
  const { data: antes } = await db.from('menu_novedades').select('href').eq('href', href).maybeSingle();
  if (!antes) return NextResponse.json({ error: 'Esa entrada no estaba marcada.' }, { status: 404 });

  const { error } = await db.from('menu_novedades').delete().eq('href', href);
  if (error) return NextResponse.json({ error: 'No se ha podido quitar la marca.' }, { status: 500 });

  await registrar(db, req, {
    actor: g.admin,
    accion: 'menu.novedad.quitada',
    objetivoTipo: 'menu_novedad', objetivoId: href,
    resumen: `Quitado el NUEVO de "${href}"`,
    antes, despues: null,
  });

  return NextResponse.json({ ok: true });
}
