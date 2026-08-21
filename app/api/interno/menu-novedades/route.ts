import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { esHrefDeMenu, expiracionPorDefecto, opcionesDeMenu } from '@/lib/menu-novedades';

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
// ─────────────────────────────────────────────────────────────────────────────

const HOY = () => new Date().toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db
    .from('menu_novedades')
    .select('href, expira_en, creado_en')
    .order('creado_en', { ascending: false });
  if (error) return NextResponse.json({ error: 'No se han podido cargar las novedades del menú.' }, { status: 500 });

  // Las opciones viajan con la respuesta para que el desplegable de /interno no
  // tenga que importar el menú del panel (y con él sus iconos de lucide) en un
  // bundle que no lo necesita.
  return NextResponse.json({ novedades: data ?? [], opciones: opcionesDeMenu(), hoy: HOY() });
}

interface CuerpoMarcar {
  href?: string;
  expiraEn?: string;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// PUT y no POST: marcar una entrada ya marcada no crea una segunda, mueve la
// fecha de la que hay. Es idempotente por naturaleza, y `href` es la PK.
export async function PUT(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as CuerpoMarcar | null;
  const href = (cuerpo?.href ?? '').trim();
  const expiraEn = (cuerpo?.expiraEn ?? '').trim() || expiracionPorDefecto(new Date());

  // Contra el menú REAL, no contra una forma de URL: un dedazo («/clientes» por
  // «/clientas») guardaría una fila que no pinta nada y no daría ningún error.
  if (!esHrefDeMenu(href)) {
    return NextResponse.json({ error: 'Esa ruta no es una entrada del menú del panel.' }, { status: 400 });
  }
  if (!FECHA_RE.test(expiraEn)) {
    return NextResponse.json({ error: 'La fecha de fin tiene que ser una fecha (AAAA-MM-DD).' }, { status: 400 });
  }
  // Una fecha ya pasada guardaría un badge que nace invisible: se lee como
  // "lo marqué y no se ve", que es el peor fallo posible aquí — mudo.
  if (expiraEn < HOY()) {
    return NextResponse.json({ error: 'Esa fecha ya ha pasado: el badge no llegaría a verse.' }, { status: 400 });
  }

  const { data: antes } = await db.from('menu_novedades').select('href, expira_en').eq('href', href).maybeSingle();

  const { error } = await db.from('menu_novedades')
    .upsert({ href, expira_en: expiraEn, creado_por: g.admin.userId }, { onConflict: 'href' });
  if (error) return NextResponse.json({ error: 'No se ha podido marcar la entrada.' }, { status: 500 });

  await registrar(db, req, {
    actor: g.admin,
    accion: 'menu.novedad.marcada',
    objetivoTipo: 'menu_novedad', objetivoId: href,
    resumen: `"${href}" marcada como NUEVO hasta el ${expiraEn}`,
    antes: antes ?? null, despues: { href, expiraEn },
  });

  return NextResponse.json({ ok: true, href, expiraEn });
}

export async function DELETE(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const href = (req.nextUrl.searchParams.get('href') ?? '').trim();
  if (!href) return NextResponse.json({ error: 'Falta la entrada que quitar.' }, { status: 400 });

  // Se lee antes de borrar para que la auditoría guarde QUÉ había: después del
  // DELETE ya no hay forma de saber hasta cuándo estaba marcada.
  const { data: antes } = await db.from('menu_novedades').select('href, expira_en').eq('href', href).maybeSingle();
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
